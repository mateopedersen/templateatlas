import { requireValue, verify, unix, readBody, actorCall } from './common.mjs';

function configured(env) {
  const key = env.STRIPE_SECRET_KEY || '';
  const live = env.BILLING_LIVE_ENABLED === 'true';
  requireValue(live ? key.startsWith('sk_live_') : key.startsWith('sk_test_'),'DEPENDENCY_UNAVAILABLE');
  return live;
}
async function stripe(env, path, fields, idem) {
  configured(env);
  const headers = {Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Stripe-Version':'2025-06-30.basil'};
  if (idem) headers['Idempotency-Key'] = idem;
  if (fields) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const r = await fetch('https://api.stripe.com/v1/'+path,{method:fields?'POST':'GET',headers,
    body:fields ? new URLSearchParams(fields) : undefined,signal:AbortSignal.timeout(12000)});
  requireValue(r.ok,'DEPENDENCY_UNAVAILABLE');
  return r.json();
}
function planIds(env) { return {monthly:env.STRIPE_PRICE_ID_MONTHLY,annual:env.STRIPE_PRICE_ID_ANNUAL}; }
async function getPrice(env,plan) {
  const id = planIds(env)[plan];
  requireValue(/^price_[a-zA-Z0-9]+$/.test(id || ''),'DEPENDENCY_UNAVAILABLE');
  const p = await stripe(env,'prices/'+id);
  requireValue(p.active && p.livemode === configured(env) && p.currency === 'usd' && Number.isSafeInteger(p.unit_amount) &&
    p.unit_amount>0 && p.recurring?.interval === (plan==='annual'?'year':'month') && p.recurring.interval_count===1, 'DEPENDENCY_UNAVAILABLE');
  return p;
}
export async function prices(env) {
  const plans = [];
  for (const [key,id] of Object.entries(planIds(env))) {
    if (!id) continue;
    const p = await getPrice(env,key);
    plans.push({key,currency:p.currency,amountCents:p.unit_amount,interval:p.recurring.interval});
  }
  return {plans,testMode:env.BILLING_LIVE_ENABLED!=='true'};
}
export async function startBilling(env, identity, mode, input) {
  requireValue(identity.user?.emailVerified,'EMAIL_VERIFICATION_REQUIRED');
  const user = identity.user, site = env.PUBLIC_SITE_URL;
  let customer = await env.DB.prepare('SELECT stripe_id FROM billing_customers WHERE user_id=?').bind(user.id).first('stripe_id');
  if (mode === 'portal') {
    requireValue(customer,'NOT_FOUND');
    return {url:(await stripe(env,'billing_portal/sessions',{customer,return_url:site+'/account/billing/'})).url};
  }
  requireValue(['monthly','annual'].includes(input.plan) && Object.keys(input).length===1);
  const price = await getPrice(env,input.plan);
  if (!customer) {
    const c = await stripe(env,'customers',{email:user.email,'metadata[templateatlas_user]':user.id},'atlas-create-customer-'+user.id);
    await env.DB.prepare('INSERT OR IGNORE INTO billing_customers VALUES(?,?)').bind(user.id,c.id).run();
    customer = await env.DB.prepare('SELECT stripe_id FROM billing_customers WHERE user_id=?').bind(user.id).first('stripe_id');
  }
  const existing = await stripe(env,'subscriptions?customer='+encodeURIComponent(customer)+'&status=all&limit=100');
  requireValue(!existing.has_more && !existing.data.some(s=>!['canceled','incomplete_expired'].includes(s.status)), 'REVISION_CONFLICT');
  // A single server-derived key per customer and time window prevents concurrent checkouts.
  const frame = Math.floor(unix()/3600);
  const checkout = await stripe(env,'checkout/sessions',{customer,mode:'subscription','line_items[0][price]':price.id,
    'line_items[0][quantity]':'1',client_reference_id:user.id,
    'expires_at':String((frame+2)*3600),success_url:site+'/checkout/success/',cancel_url:site+'/pricing/'},
    'atlas-checkout-'+user.id+'-'+frame);
  return {url:checkout.url};
}
export async function receiveWebhook(request,env) {
  configured(env);
  const raw = await readBody(request,262144);
  const pairs = (request.headers.get('stripe-signature')||'').split(',').map(s=>s.split('='));
  const t = pairs.find(([k])=>k==='t')?.[1];
  requireValue(/^\d{10}$/.test(t || '') && Math.abs(unix()-Number(t))<=300,'ORIGIN_DENIED');
  const signatures = pairs.filter(([k])=>k==='v1');
  requireValue((await Promise.all(signatures.map(([,v])=>verify(env.STRIPE_WEBHOOK_SECRET,t+'.'+raw,v)))).some(Boolean),'ORIGIN_DENIED');
  const event = JSON.parse(raw);
  requireValue(event.livemode===configured(env) && /^evt_[a-zA-Z0-9]+$/.test(event.id));
  const supported = event.type?.startsWith('customer.subscription.') || ['invoice.paid','invoice.payment_failed','invoice.payment_action_required'].includes(event.type);
  if (!supported) return {received:true};
  const customer = event.data?.object?.customer;
  requireValue(/^cus_[a-zA-Z0-9]+$/.test(customer));
  const linked = await env.DB.prepare('SELECT user_id FROM billing_customers WHERE stripe_id=?').bind(customer).first();
  // A shared Stripe account can contain subscriptions belonging to other applications.
  if (!linked) return {received:true};
  await env.DB.prepare('INSERT OR IGNORE INTO billing_events(event_id,customer_id,received) VALUES(?,?,?)').bind(event.id,customer,unix()).run();
  const pending = await env.DB.prepare('SELECT applied FROM billing_events WHERE event_id=?').bind(event.id).first();
  if (pending.applied===null) await reconcile(env,customer,linked.user_id);
  return {received:true};
}
async function reconcile(env, customer, userId) {
  const pending = await env.DB.prepare('SELECT event_id FROM billing_events WHERE customer_id=? AND applied IS NULL ORDER BY received LIMIT 50').bind(customer).all();
  if (!pending.results.length) return;
  const actor = 'user:'+userId;
  const {generation} = await actorCall(env,actor,'billing-start');
  const result = await stripe(env,'subscriptions?customer='+encodeURIComponent(customer)+'&status=all&limit=100&expand[]=data.latest_invoice');
  requireValue(!result.has_more,'DEPENDENCY_UNAVAILABLE');
  const allowed = Object.values(planIds(env)).filter(Boolean);
  let status = 'none', through = 0;
  for (const sub of result.data) {
    const items = sub.items?.data?.filter(i=>allowed.includes(i.price?.id));
    if (!items?.length || sub.customer!==customer || sub.livemode!==configured(env)) continue;
    const end = Math.min(...items.map(i=>i.current_period_end || 0));
    if (sub.status==='active' && sub.latest_invoice?.status==='paid' && end>unix()) {
      through = Math.max(through,end); status = 'active';
    } else if (!through && status==='none') status=sub.status;
  }
  await actorCall(env,actor,'billing-set',{generation,status,through});
  await env.DB.batch(pending.results.map(e=>env.DB.prepare('UPDATE billing_events SET applied=? WHERE event_id=?').bind(unix(),e.event_id)));
}
export async function retryBilling(env) {
  const pending = await env.DB.prepare(`SELECT DISTINCT b.customer_id,c.user_id FROM billing_events b JOIN billing_customers c
    ON c.stripe_id=b.customer_id WHERE b.applied IS NULL LIMIT 20`).all();
  for (const r of pending.results) await reconcile(env,r.customer_id,r.user_id);
}
export async function stopRenewals(env,customer) {
  const subscriptions=await stripe(env,'subscriptions?customer='+encodeURIComponent(customer)+'&status=all&limit=100');
  requireValue(!subscriptions.has_more,'DEPENDENCY_UNAVAILABLE');
  const allowed=Object.values(planIds(env)).filter(Boolean);
  for(const sub of subscriptions.data) {
    if(!allowed.length) throw new Error('Missing price configuration');
    if(sub.customer!==customer || !sub.items?.data?.some(item=>allowed.includes(item.price?.id))) continue;
    if(['canceled','incomplete_expired'].includes(sub.status) || sub.cancel_at_period_end)continue;
    await stripe(env,'subscriptions/'+encodeURIComponent(sub.id),{cancel_at_period_end:'true'},'atlas-close-'+sub.id);
  }
}
