import { ApiError, requireValue, sign } from './common.mjs';
import { captureLocalMail, localMailEnabled } from './local-mail.mjs';

function provider(env) {
  if (env.LOCAL_MAILBOX_ENABLED === 'true')
    return localMailEnabled(env) ? 'local' : null;
  if (env.EMAIL_PROVIDER === 'cloudflare') {
    const from = env.EMAIL_FROM;
    const onboarded = env.EMAIL_SENDING_DOMAIN;
    const valid =
      typeof from === 'string' &&
      /^[^\s<>@]+@[a-z\d.-]+\.[a-z]{2,}$/i.test(from);
    return valid &&
      typeof onboarded === 'string' &&
      from.split('@')[1].toLowerCase() === onboarded.toLowerCase() &&
      typeof env.TRANSACTIONAL_EMAIL?.send === 'function'
      ? 'cloudflare'
      : null;
  }
  if (env.EMAIL_PROVIDER && env.EMAIL_PROVIDER !== 'resend') return null;
  return env.EMAIL_API_KEY && env.EMAIL_FROM ? 'resend' : null;
}

export const accountEmailConfigured = (env) => provider(env) !== null;

// Rate-limit without storing an address or checking whether it belongs to an account.
// Request-level checks cover nonexistent accounts too. Delivery-level checks also cover an email-change confirmation replay.
export async function reserveEmailBudget(env, address, scope) {
  if (localMailEnabled(env)) return;
  requireValue(
    typeof address === 'string' && address.length <= 254,
    'VALIDATION_ERROR',
  );
  const stamp = Date.now(),
    boundary = stamp - 15 * 60 * 1000,
    maximum = scope === 'request' ? 5 : 8;
  const key =
    'templateatlas.mail.' +
    scope +
    '.' +
    (await sign(env.AUTH_SECRET, 'recipient|' + address.trim().toLowerCase()));
  const result = await env.DB.prepare(
    `INSERT INTO rateLimit(id,key,count,lastRequest) VALUES(?,?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN lastRequest<=? THEN 1 ELSE count+1 END,
      lastRequest=CASE WHEN lastRequest<=? THEN excluded.lastRequest ELSE lastRequest END
    WHERE lastRequest<=? OR count<?`,
  )
    .bind(key, key, stamp, boundary, boundary, boundary, maximum)
    .run();
  requireValue(result.meta.changes === 1, 'RATE_LIMITED');
}

export async function sendMail(env, to, subject, text) {
  const selected = provider(env);
  requireValue(selected, 'EMAIL_DELIVERY_UNAVAILABLE');
  if (selected !== 'local') await reserveEmailBudget(env, to, 'delivery');
  try {
    if (selected === 'local') {
      return await captureLocalMail(env, to, subject, text);
    }
    if (selected === 'cloudflare') {
      const result = await env.TRANSACTIONAL_EMAIL.send({
        from: { email: env.EMAIL_FROM, name: 'TemplateAtlas' },
        to,
        subject,
        text,
      });
      requireValue(
        typeof result?.messageId === 'string' &&
          result.messageId.trim().length > 0,
        'EMAIL_DELIVERY_UNAVAILABLE',
      );
      return;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.EMAIL_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
      signal: AbortSignal.timeout(10000),
    });
    requireValue(response.ok, 'EMAIL_DELIVERY_UNAVAILABLE');
    const result = await response.json();
    requireValue(
      typeof result?.id === 'string' && result.id.trim().length > 0,
      'EMAIL_DELIVERY_UNAVAILABLE',
    );
  } catch {
    // Provider errors can contain a recipient or message data; expose only a service-level failure.
    throw new ApiError('EMAIL_DELIVERY_UNAVAILABLE');
  }
}
