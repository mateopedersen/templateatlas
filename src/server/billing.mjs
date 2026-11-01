import { requireValue, verify, unix, readBody, actorCall } from './common.mjs';

function productionBillingClosed(env) {
  return (
    env.DEPLOY_STAGE === 'production' && env.BILLING_LIVE_ENABLED !== 'true'
  );
}

function configured(env) {
  requireValue(!productionBillingClosed(env), 'DEPENDENCY_UNAVAILABLE');
  const key = env.STRIPE_SECRET_KEY || '';
  const live = env.BILLING_LIVE_ENABLED === 'true';
  requireValue(
    live ? key.startsWith('sk_live_') : key.startsWith('sk_test_'),
    'DEPENDENCY_UNAVAILABLE',
  );
  return live;
}
async function stripe(env, path, fields, idem) {
  configured(env);
  const headers = {
    Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY,
    'Stripe-Version': '2025-06-30.basil',
  };
  if (idem) headers['Idempotency-Key'] = idem;
  if (fields) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method: fields ? 'POST' : 'GET',
    headers,
    body: fields ? new URLSearchParams(fields) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  requireValue(r.ok, 'DEPENDENCY_UNAVAILABLE');
  return r.json();
}
function planIds(env) {
  return {
    monthly: env.STRIPE_PRICE_ID_MONTHLY,
    annual: env.STRIPE_PRICE_ID_ANNUAL,
  };
}
async function getPrice(env, plan) {
  const id = planIds(env)[plan];
  requireValue(/^price_[a-zA-Z0-9]+$/.test(id || ''), 'DEPENDENCY_UNAVAILABLE');
  const p = await stripe(env, 'prices/' + id);
  requireValue(
    p.active &&
      p.livemode === configured(env) &&
      p.currency === 'usd' &&
      Number.isSafeInteger(p.unit_amount) &&
      p.unit_amount > 0 &&
      p.recurring?.interval === (plan === 'annual' ? 'year' : 'month') &&
      p.recurring.interval_count === 1,
    'DEPENDENCY_UNAVAILABLE',
  );
  return p;
}
export async function prices(env) {
  if (productionBillingClosed(env)) return { plans: [], testMode: false };
  const plans = [];
  for (const [key, id] of Object.entries(planIds(env))) {
    if (!id) continue;
    const p = await getPrice(env, key);
    plans.push({
      key,
      currency: p.currency,
      amountCents: p.unit_amount,
      interval: p.recurring.interval,
    });
  }
  return { plans, testMode: env.BILLING_LIVE_ENABLED !== 'true' };
}
const checkoutTtl = 2 * 60 * 60;
const terminalSubscriptions = new Set(['canceled', 'incomplete_expired']);
async function assertNoSubscription(env, customer) {
  const existing = await stripe(
    env,
    'subscriptions?customer=' +
      encodeURIComponent(customer) +
      '&status=all&limit=100',
  );
  requireValue(
    Array.isArray(existing.data) && !existing.has_more,
    'DEPENDENCY_UNAVAILABLE',
  );
  requireValue(
    existing.data.every(
      (s) =>
        s.customer === customer &&
        s.livemode === configured(env) &&
        terminalSubscriptions.has(s.status),
    ),
    'REVISION_CONFLICT',
  );
}
function checkedSession(env, session, attempt, legacy = false) {
  requireValue(
    session &&
      /^cs_[A-Za-z0-9_]+$/.test(session.id) &&
      session.customer === attempt.customer_id &&
      session.client_reference_id === attempt.user_id &&
      session.mode === 'subscription' &&
      session.livemode === configured(env) &&
      (legacy
        ? session.success_url === attempt.site_url + '/checkout/success/'
        : session.metadata?.atlas_attempt === attempt.attempt_id),
    'DEPENDENCY_UNAVAILABLE',
  );
  requireValue(
    ['open', 'expired', 'complete'].includes(session.status),
    'DEPENDENCY_UNAVAILABLE',
  );
  return session;
}
async function expireSession(env, s, attempt, legacy = false) {
  const expired = checkedSession(
    env,
    await stripe(
      env,
      'checkout/sessions/' + s.id + '/expire',
      {},
      'atlas-expire-' + s.id,
    ),
    attempt,
    legacy,
  );
  requireValue(
    expired.id === s.id && expired.status === 'expired',
    'REVISION_CONFLICT',
  );
}
async function recoverCheckout(env, attempt, allowCreation = true) {
  if (attempt.session_id)
    return checkedSession(
      env,
      await stripe(
        env,
        'checkout/sessions/' + encodeURIComponent(attempt.session_id),
      ),
      attempt,
    );
  // A previous process may have reached Stripe and stopped before recording its session ID.
  // Also retire open sessions from the old hourly-key implementation before enabling a new one.
  const since = Math.min(attempt.created - 60, unix() - 86460);
  const list = await stripe(
    env,
    'checkout/sessions?customer=' +
      encodeURIComponent(attempt.customer_id) +
      '&created[gte]=' +
      since +
      '&limit=100',
  );
  requireValue(
    Array.isArray(list.data) && !list.has_more,
    'DEPENDENCY_UNAVAILABLE',
  );
  const exact = list.data.filter(
    (s) => s.metadata?.atlas_attempt === attempt.attempt_id,
  );
  requireValue(exact.length <= 1, 'DEPENDENCY_UNAVAILABLE');
  for (const s of list.data) {
    if (s.status !== 'open' || exact.includes(s) || s.mode !== 'subscription')
      continue;
    // Never change a foreign session, or one that might belong to a newer concurrent attempt.
    requireValue(!s.metadata?.atlas_attempt, 'REVISION_CONFLICT');
    checkedSession(env, s, attempt, true);
    await expireSession(env, s, attempt, true);
  }
  if (exact.length) return checkedSession(env, exact[0], attempt);
  if (unix() >= attempt.expires) return null;
  requireValue(allowCreation, 'REVISION_CONFLICT');
  // All retries, including recovery by a competing plan, send byte-for-byte equivalent Stripe parameters.
  const created = await stripe(
    env,
    'checkout/sessions',
    {
      customer: attempt.customer_id,
      mode: 'subscription',
      'line_items[0][price]': attempt.price_id,
      'line_items[0][quantity]': '1',
      client_reference_id: attempt.user_id,
      'metadata[atlas_attempt]': attempt.attempt_id,
      expires_at: String(attempt.expires),
      success_url: attempt.site_url + '/checkout/success/',
      cancel_url: attempt.site_url + '/checkout/cancel/',
    },
    'atlas-attempt-' + attempt.attempt_id,
  );
  return checkedSession(env, created, attempt);
}
async function checkoutURL(env, user, customer, price, site) {
  const attemptId = crypto.randomUUID(),
    now = unix();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO billing_checkout_attempts
    (user_id,attempt_id,customer_id,price_id,site_url,created,expires)
    SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM member_closures WHERE user_id=?)`,
  )
    .bind(
      user.id,
      attemptId,
      customer,
      price.id,
      site,
      now,
      now + checkoutTtl,
      user.id,
    )
    .run();
  // At most one rotation per request. A concurrent switch wins or requires a retry.
  for (let step = 0; step < 2; step++) {
    const a = await env.DB.prepare(
      `SELECT * FROM billing_checkout_attempts WHERE user_id=?
      AND NOT EXISTS(SELECT 1 FROM member_closures WHERE user_id=?)`,
    )
      .bind(user.id, user.id)
      .first();
    requireValue(a && a.customer_id === customer, 'ACCESS_REVOKED');
    await assertNoSubscription(env, customer);
    const session = await recoverCheckout(env, a);
    if (session) {
      const attached = await env.DB.prepare(
        `UPDATE billing_checkout_attempts SET session_id=? WHERE user_id=? AND attempt_id=?
        AND (session_id IS NULL OR session_id=?) AND NOT EXISTS(SELECT 1 FROM member_closures WHERE user_id=?)`,
      )
        .bind(session.id, user.id, a.attempt_id, session.id, user.id)
        .run();
      requireValue(attached.meta.changes === 1, 'REVISION_CONFLICT');
      if (session.status === 'open') {
        if (a.price_id === price.id && unix() < a.expires) {
          requireValue(
            typeof session.url === 'string' &&
              session.url.startsWith('https://checkout.stripe.com/'),
            'DEPENDENCY_UNAVAILABLE',
          );
          return { url: session.url };
        }
        // Stripe arbitrates the race between completing and expiring this session.
        // A failure leaves the prior attempt in place. No replacement URL is created.
        await expireSession(env, session, a);
      } else if (session.status === 'complete') {
        requireValue(
          typeof session.subscription === 'string' &&
            /^sub_[A-Za-z0-9]+$/.test(session.subscription),
          'REVISION_CONFLICT',
        );
        const sub = await stripe(env, 'subscriptions/' + session.subscription);
        requireValue(
          sub.id === session.subscription &&
            sub.customer === customer &&
            sub.livemode === configured(env) &&
            terminalSubscriptions.has(sub.status),
          'REVISION_CONFLICT',
        );
      }
    }
    const started = unix();
    const changed = await env.DB.prepare(
      `UPDATE billing_checkout_attempts SET attempt_id=?,price_id=?,site_url=?,created=?,expires=?,session_id=NULL
      WHERE user_id=? AND attempt_id=? AND NOT EXISTS(SELECT 1 FROM member_closures WHERE user_id=?)`,
    )
      .bind(
        crypto.randomUUID(),
        price.id,
        site,
        started,
        started + checkoutTtl,
        user.id,
        a.attempt_id,
        user.id,
      )
      .run();
    requireValue(changed.meta.changes === 1, 'REVISION_CONFLICT');
  }
  requireValue(false, 'REVISION_CONFLICT');
}
export async function startBilling(env, identity, mode, input) {
  requireValue(!productionBillingClosed(env), 'DEPENDENCY_UNAVAILABLE');
  requireValue(identity.user?.emailVerified, 'EMAIL_VERIFICATION_REQUIRED');
  const user = identity.user,
    site = env.PUBLIC_SITE_URL;
  let customer = await env.DB.prepare(
    'SELECT stripe_id FROM billing_customers WHERE user_id=?',
  )
    .bind(user.id)
    .first('stripe_id');
  if (mode === 'portal') {
    requireValue(customer, 'NOT_FOUND');
    return {
      url: (
        await stripe(env, 'billing_portal/sessions', {
          customer,
          return_url: site + '/account/billing/',
        })
      ).url,
    };
  }
  requireValue(
    ['monthly', 'annual'].includes(input.plan) &&
      Object.keys(input).length === 1,
  );
  const price = await getPrice(env, input.plan);
  if (!customer) {
    const c = await stripe(
      env,
      'customers',
      { email: user.email, 'metadata[templateatlas_user]': user.id },
      'atlas-create-customer-' + user.id,
    );
    await env.DB.prepare('INSERT OR IGNORE INTO billing_customers VALUES(?,?)')
      .bind(user.id, c.id)
      .run();
    customer = await env.DB.prepare(
      'SELECT stripe_id FROM billing_customers WHERE user_id=?',
    )
      .bind(user.id)
      .first('stripe_id');
  }
  return checkoutURL(env, user, customer, price, site);
}
export async function receiveWebhook(request, env) {
  configured(env);
  const raw = await readBody(request, 262144);
  const pairs = (request.headers.get('stripe-signature') || '')
    .split(',')
    .map((s) => s.split('='));
  const t = pairs.find(([k]) => k === 't')?.[1];
  requireValue(
    /^\d{10}$/.test(t || '') && Math.abs(unix() - Number(t)) <= 300,
    'ORIGIN_DENIED',
  );
  const signatures = pairs.filter(([k]) => k === 'v1');
  requireValue(
    (
      await Promise.all(
        signatures.map(([, v]) =>
          verify(env.STRIPE_WEBHOOK_SECRET, t + '.' + raw, v),
        ),
      )
    ).some(Boolean),
    'ORIGIN_DENIED',
  );
  const event = JSON.parse(raw);
  requireValue(
    event.livemode === configured(env) && /^evt_[a-zA-Z0-9]+$/.test(event.id),
  );
  const supported =
    event.type?.startsWith('customer.subscription.') ||
    [
      'invoice.paid',
      'invoice.payment_failed',
      'invoice.payment_action_required',
    ].includes(event.type);
  if (!supported) return { received: true };
  const customer = event.data?.object?.customer;
  requireValue(/^cus_[a-zA-Z0-9]+$/.test(customer));
  const linked = await env.DB.prepare(
    'SELECT user_id FROM billing_customers WHERE stripe_id=?',
  )
    .bind(customer)
    .first();
  // A shared Stripe account can contain subscriptions belonging to other applications.
  if (!linked) return { received: true };
  await env.DB.prepare(
    'INSERT OR IGNORE INTO billing_events(event_id,customer_id,received) VALUES(?,?,?)',
  )
    .bind(event.id, customer, unix())
    .run();
  const pending = await env.DB.prepare(
    'SELECT applied FROM billing_events WHERE event_id=?',
  )
    .bind(event.id)
    .first();
  if (pending.applied === null) await reconcile(env, customer, linked.user_id);
  return { received: true };
}
async function reconcile(env, customer, userId) {
  const pending = await env.DB.prepare(
    'SELECT event_id FROM billing_events WHERE customer_id=? AND applied IS NULL ORDER BY received LIMIT 50',
  )
    .bind(customer)
    .all();
  if (!pending.results.length) return;
  const actor = 'user:' + userId;
  const { generation } = await actorCall(env, actor, 'billing-start');
  const result = await stripe(
    env,
    'subscriptions?customer=' +
      encodeURIComponent(customer) +
      '&status=all&limit=100&expand[]=data.latest_invoice',
  );
  requireValue(!result.has_more, 'DEPENDENCY_UNAVAILABLE');
  const allowed = Object.values(planIds(env)).filter(Boolean);
  let status = 'none',
    through = 0,
    allEnding = true;
  for (const sub of result.data) {
    const items = sub.items?.data?.filter((i) => allowed.includes(i.price?.id));
    if (
      !items?.length ||
      sub.customer !== customer ||
      sub.livemode !== configured(env)
    )
      continue;
    const end = Math.min(...items.map((i) => i.current_period_end || 0));
    if (
      sub.status === 'active' &&
      sub.latest_invoice?.status === 'paid' &&
      end > unix()
    ) {
      through = Math.max(through, end);
      status = 'active';
      allEnding = allEnding && sub.cancel_at_period_end === true;
    } else if (!through && status === 'none') status = sub.status;
  }
  await actorCall(env, actor, 'billing-set', {
    generation,
    status,
    through,
    cancelAtEnd: status === 'active' && allEnding,
  });
  await env.DB.batch(
    pending.results.map((e) =>
      env.DB.prepare(
        'UPDATE billing_events SET applied=? WHERE event_id=?',
      ).bind(unix(), e.event_id),
    ),
  );
}
export async function retryBilling(env) {
  const pending = await env.DB.prepare(
    `SELECT DISTINCT b.customer_id,c.user_id FROM billing_events b JOIN billing_customers c
    ON c.stripe_id=b.customer_id WHERE b.applied IS NULL LIMIT 20`,
  ).all();
  for (const r of pending.results)
    await reconcile(env, r.customer_id, r.user_id);
}
export async function stopRenewals(env, customer) {
  const attempt = await env.DB.prepare(
    'SELECT * FROM billing_checkout_attempts WHERE customer_id=?',
  )
    .bind(customer)
    .first();
  if (attempt) {
    const session = await recoverCheckout(env, attempt, false);
    if (session?.status === 'open') await expireSession(env, session, attempt);
    if (session?.status === 'complete')
      requireValue(
        typeof session.subscription === 'string',
        'DEPENDENCY_UNAVAILABLE',
      );
  }
  const subscriptions = await stripe(
    env,
    'subscriptions?customer=' +
      encodeURIComponent(customer) +
      '&status=all&limit=100',
  );
  requireValue(!subscriptions.has_more, 'DEPENDENCY_UNAVAILABLE');
  const allowed = Object.values(planIds(env)).filter(Boolean);
  for (const sub of subscriptions.data) {
    if (!allowed.length) throw new Error('Missing price configuration');
    if (
      sub.customer !== customer ||
      !sub.items?.data?.some((item) => allowed.includes(item.price?.id))
    )
      continue;
    if (
      ['canceled', 'incomplete_expired'].includes(sub.status) ||
      sub.cancel_at_period_end
    )
      continue;
    await stripe(
      env,
      'subscriptions/' + encodeURIComponent(sub.id),
      { cancel_at_period_end: 'true' },
      'atlas-close-' + sub.id,
    );
  }
}
