import { sendMail } from './email.mjs';
import { betterAuth } from 'better-auth';
import { requireValue, sign, verify, actorCall, uuid } from './common.mjs';

const guestCookie = '__Host-ta-guest';
const guestAge = 60 * 60 * 24 * 365;
export function auth(env, onDeliveryFailure) {
  async function deliver(email, subject, text) {
    try {
      await sendMail(env, email, subject, text);
    } catch (e) {
      onDeliveryFailure?.(e);
      throw e;
    }
  }
  requireValue(
    env.DB && env.AUTH_SECRET?.length >= 32 && env.PUBLIC_SITE_URL,
    'DEPENDENCY_UNAVAILABLE',
  );
  return betterAuth({
    appName: 'TemplateAtlas',
    baseURL: env.PUBLIC_SITE_URL,
    secret: env.AUTH_SECRET,
    database: env.DB,
    trustedOrigins: [env.PUBLIC_SITE_URL],
    advanced: {
      useSecureCookies: true,
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 75 },
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) =>
          deliver(
            user.email,
            'Approve your TemplateAtlas email change',
            'You requested a change to ' +
              newEmail +
              '. Approve this request only if you initiated it. Your trial dates stay the same.\n\n' +
              url,
          ),
      },
    },
    session: { cookieCache: { enabled: false }, expiresIn: 14 * 86400 },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        deliver(
          user.email,
          'Reset your TemplateAtlas password',
          'Use this link to choose a new password. If you did not request this change, you can ignore this message.\n\n' +
            url,
        ),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => {
        const already = await env.DB.prepare(
          'SELECT 1 FROM first_verifications WHERE user_id=?',
        )
          .bind(user.id)
          .first();
        await deliver(
          user.email,
          already
            ? 'Verify your new TemplateAtlas email'
            : 'Verify your email for TemplateAtlas',
          (already
            ? 'Confirm this address to finish updating your account. Your trial dates stay the same.'
            : 'Confirm your email address to start your 30-day card-free trial. There is no automatic charge.') +
            '\n\n' +
            url,
        );
      },
    },
  });
}
// Better Auth awaits the mail callback but handles callback exceptions internally.
// Track the outcome on this invocation so a provider rejection cannot become an HTTP success.
export async function authResponse(env, request) {
  let failureCode;
  const response = await auth(env, (error) => {
    failureCode =
      error.message === 'RATE_LIMITED'
        ? 'RATE_LIMITED'
        : 'EMAIL_DELIVERY_UNAVAILABLE';
  }).handler(request);
  requireValue(!failureCode, failureCode);
  return response;
}
function getCookie(request, name) {
  const part = request.headers
    .get('cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + '='));
  return part?.slice(name.length + 1);
}
function cookieHeader(value, age) {
  return (
    guestCookie +
    '=' +
    value +
    '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' +
    age
  );
}
async function transfer(env, guest, user) {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO guest_transfers(guest,target) VALUES(?,?)',
  )
    .bind(guest, user)
    .run();
  const row = await env.DB.prepare(
    'SELECT * FROM guest_transfers WHERE guest=?',
  )
    .bind(guest)
    .first();
  if (row.target !== user || row.completed) return;
  const snapshot = await actorCall(env, guest, 'freeze', { target: user });
  await actorCall(env, user, 'import', {
    source: guest,
    grants: snapshot.grants,
  });
  await env.DB.batch([
    env.DB.prepare('UPDATE member_documents SET owner=? WHERE owner=?').bind(
      user,
      guest,
    ),
    env.DB.prepare('UPDATE support_requests SET actor=? WHERE actor=?').bind(
      user,
      guest,
    ),
    env.DB.prepare(
      'UPDATE guest_transfers SET completed=1 WHERE guest=? AND target=?',
    ).bind(guest, user),
  ]);
}
export async function resumeTransfers(env) {
  const pending = await env.DB.prepare(
    'SELECT guest,target FROM guest_transfers WHERE completed=0 LIMIT 30',
  ).all();
  for (const item of pending.results)
    await transfer(env, item.guest, item.target);
}
export async function identify(env, request, createGuest = false) {
  const raw = getCookie(request, guestCookie);
  const [id, sig] = (raw || '').split('.');
  const guest =
    uuid(id) && (await verify(env.GUEST_COOKIE_SIGNING_KEY, 'guest:' + id, sig))
      ? 'guest:' + id
      : null;
  // Avoid opening the auth DB for anonymous readers. Never interpret the sign-in cookie ourselves.
  const hasSession = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/.test(
    request.headers.get('cookie') || '',
  );
  const session = hasSession
    ? await auth(env).api.getSession({ headers: request.headers })
    : null;
  if (session?.user?.emailVerified) {
    const actor = 'user:' + session.user.id;
    const closing = await env.DB.prepare(
      'SELECT user_id FROM member_closures WHERE user_id=?',
    )
      .bind(session.user.id)
      .first();
    requireValue(!closing, 'ACCESS_REVOKED');
    const first = await env.DB.prepare(
      'SELECT verified_at FROM first_verifications WHERE user_id=?',
    )
      .bind(session.user.id)
      .first();
    requireValue(first, 'DEPENDENCY_UNAVAILABLE');
    await actorCall(env, actor, 'verify', { at: first.verified_at });
    if (guest) await transfer(env, guest, actor);
    return { actor, user: session.user, session: session.session };
  }
  if (guest) return { actor: guest, user: session?.user || null };
  requireValue(createGuest, 'GUEST_SESSION_REQUIRED');
  const fresh = crypto.randomUUID();
  return {
    actor: 'guest:' + fresh,
    user: null,
    cookie: cookieHeader(
      fresh +
        '.' +
        (await sign(env.GUEST_COOKIE_SIGNING_KEY, 'guest:' + fresh)),
      guestAge,
    ),
  };
}
