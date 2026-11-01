const status = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  ORIGIN_DENIED: 403,
  SIGNUP_REQUIRED: 403,
  EMAIL_VERIFICATION_REQUIRED: 403,
  MEMBERSHIP_REQUIRED: 403,
  ACCESS_REVOKED: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  IDEMPOTENCY_CONFLICT: 409,
  REVISION_CONFLICT: 409,
  FORMAT_UNAVAILABLE: 409,
  GUEST_SESSION_REQUIRED: 409,
  TICKET_EXPIRED: 410,
  PAYLOAD_TOO_LARGE: 413,
  RANGE_NOT_SATISFIABLE: 416,
  RATE_LIMITED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
  EMAIL_DELIVERY_UNAVAILABLE: 503,
};
export class ApiError extends Error {
  constructor(code) {
    super(code);
    this.status = status[code] ?? 500;
  }
}
export function requireValue(condition, code = 'VALIDATION_ERROR') {
  if (!condition) throw new ApiError(code);
}
export function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
export function failure(e) {
  return e instanceof ApiError
    ? json({ code: e.message }, e.status)
    : json({ code: 'DEPENDENCY_UNAVAILABLE' }, 503);
}
export async function readBody(request, maxBytes = 32768) {
  requireValue(
    Number(request.headers.get('content-length') || 0) <= maxBytes,
    'PAYLOAD_TOO_LARGE',
  );
  const reader = request.body?.getReader();
  requireValue(reader);
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ApiError('PAYLOAD_TOO_LARGE');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
export async function object(request) {
  requireValue(
    /^application\/json(?:;|$)/i.test(
      request.headers.get('content-type') || '',
    ),
  );
  try {
    const value = JSON.parse(await readBody(request));
    requireValue(value && typeof value === 'object' && !Array.isArray(value));
    return value;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('VALIDATION_ERROR');
  }
}
export const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
const utf8 = (s) => new TextEncoder().encode(s);
export const digest = async (s) =>
  hex(
    await crypto.subtle.digest('SHA-256', typeof s === 'string' ? utf8(s) : s),
  );
async function key(secret) {
  requireValue(
    typeof secret === 'string' && secret.length >= 32,
    'DEPENDENCY_UNAVAILABLE',
  );
  return crypto.subtle.importKey(
    'raw',
    utf8(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
export const sign = async (secret, message) =>
  hex(await crypto.subtle.sign('HMAC', await key(secret), utf8(message)));
export async function verify(secret, message, signature) {
  if (!/^[a-f0-9]{64}$/.test(signature || '')) return false;
  return crypto.subtle.verify(
    'HMAC',
    await key(secret),
    Uint8Array.from(signature.match(/../g), (h) => parseInt(h, 16)),
    utf8(message),
  );
}
export const unix = () => Math.floor(Date.now() / 1000);
export const isId = (s) => typeof s === 'string' && /^[\w-]{1,180}$/.test(s);
export const uuid = (s) => /^[a-f\d-]{36}$/.test(s || '');
export async function actorCall(env, actor, method, input = {}) {
  const stub = env.DOWNLOAD_ACTORS.get(env.DOWNLOAD_ACTORS.idFromName(actor));
  const response = await stub.fetch('https://internal/' + method, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.code);
  return data;
}
