import { auth } from './identity.mjs';
import { requireValue } from './common.mjs';

export function validateReturn(value, origin) {
  if (value == null || value === '') return;
  let target;
  try {
    target = new URL(value, origin);
  } catch {
    requireValue(false, 'ORIGIN_DENIED');
  }
  requireValue(
    typeof value === 'string' &&
      value.length <= 2000 &&
      target.origin === origin &&
      !target.username &&
      !target.password,
    'ORIGIN_DENIED',
  );
}
function label(ua) {
  const text = String(ua || ''),
    browser = /Firefox\//.test(text)
      ? 'Firefox'
      : /Edg\//.test(text)
        ? 'Edge'
        : /Chrome\//.test(text)
          ? 'Chrome'
          : /Safari\//.test(text)
            ? 'Safari'
            : 'Browser';
  const os = /Android/.test(text)
    ? 'Android'
    : /iPhone|iPad/.test(text)
      ? 'iOS'
      : /Windows/.test(text)
        ? 'Windows'
        : /Macintosh|Mac OS X/.test(text)
          ? 'macOS'
          : /Linux/.test(text)
            ? 'Linux'
            : '';
  return os ? browser + ' on ' + os : browser;
}
export async function accountSessions(env, request, identity, revokeId) {
  requireValue(identity.user?.emailVerified, 'UNAUTHENTICATED');
  const endpoint = auth(env).api,
    sessions = await endpoint.listSessions({ headers: request.headers });
  if (revokeId !== undefined) {
    requireValue(
      typeof revokeId === 'string' &&
        revokeId.length <= 150 &&
        revokeId !== identity.session.id,
    );
    const found = sessions.find(
      (session) =>
        session.id === revokeId && session.userId === identity.user.id,
    );
    requireValue(found, 'NOT_FOUND');
    await endpoint.revokeSession({
      headers: request.headers,
      body: { token: found.token },
    });
    return { revoked: true };
  }
  return {
    sessions: sessions.map((session) => ({
      id: session.id,
      current: session.id === identity.session.id,
      device: label(session.userAgent),
      startedAt: new Date(session.createdAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
    })),
  };
}
