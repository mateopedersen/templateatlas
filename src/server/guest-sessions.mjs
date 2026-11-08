import { actorCall, ApiError, requireValue, sign } from './common.mjs';

// One fixed admission object, never one object per caller or network.
export const GUEST_SESSION_ADMISSION = 'system:guest-session-admission:v1';
const NETWORK_LIMIT = 30,
  GLOBAL_MINUTE_LIMIT = 1000,
  GLOBAL_DAY_LIMIT = 20000,
  MAX_NETWORK_COUNTERS = 2048;

function network(request) {
  const ip = (request.headers.get('cf-connecting-ip') || '')
    .trim()
    .toLowerCase();
  // Forwarded headers supplied by the caller never select an admission bucket.
  if (!ip || ip.length > 64 || /[^a-f0-9:.]/.test(ip)) return 'unknown';
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split('.').map(Number);
    return parts.every((part) => part <= 255)
      ? 'v4:' + parts.join('.')
      : 'unknown';
  }
  if (!ip.includes(':')) return 'unknown';
  try {
    const canonical = new URL('http://[' + ip + ']/').hostname.slice(1, -1);
    const [left, right] = canonical.split('::');
    const first = left ? left.split(':') : [],
      last = right ? right.split(':') : [];
    const words =
      right === undefined
        ? first
        : [
            ...first,
            ...Array(8 - first.length - last.length).fill('0'),
            ...last,
          ];
    if (words.length !== 8) return 'unknown';
    const values = words.map((word) => Number.parseInt(word, 16));
    if (values.slice(0, 5).every((word) => word === 0) && values[5] === 65535) {
      return (
        'v4:' +
        [values[6] >> 8, values[6] & 255, values[7] >> 8, values[7] & 255].join(
          '.',
        )
      );
    }
    return (
      'v6:' +
      values
        .slice(0, 4)
        .map((word) => word.toString(16).padStart(4, '0'))
        .join(':') +
      '/64'
    );
  } catch {
    return 'unknown';
  }
}

export async function reserveGuestSession(env, request) {
  const networkHash = await sign(
    env.GUEST_COOKIE_SIGNING_KEY,
    'guest-session-network|' + network(request),
  );
  const admission = await actorCall(
    env,
    GUEST_SESSION_ADMISSION,
    'guest-session-admission',
    { networkHash },
  );
  requireValue(
    admission && typeof admission.allowed === 'boolean',
    'DEPENDENCY_UNAVAILABLE',
  );
  if (!admission.allowed) {
    const error = new ApiError('RATE_LIMITED');
    error.retryAfter = Number.isSafeInteger(admission.retryAfter)
      ? Math.max(1, Math.min(86400, admission.retryAfter))
      : 60;
    throw error;
  }
}

// Called only inside DownloadActor's synchronous SQLite transaction. The
// network ledger has a hard cardinality cap as well as expiring counters.
export function admitGuestSession(sql, networkHash, now) {
  requireValue(
    typeof networkHash === 'string' && /^[a-f0-9]{64}$/.test(networkHash),
  );
  const rows = (query, ...args) => Array.from(sql.exec(query, ...args));
  sql.exec(`CREATE TABLE IF NOT EXISTS guest_session_admissions (
    bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL
  )`);
  sql.exec('DELETE FROM guest_session_admissions WHERE expires<=?', now);
  const budgets = [
    { key: 'global-minute', maximum: GLOBAL_MINUTE_LIMIT, seconds: 60 },
    { key: 'global-day', maximum: GLOBAL_DAY_LIMIT, seconds: 86400 },
    { key: 'network:' + networkHash, maximum: NETWORK_LIMIT, seconds: 60 },
  ].map((budget) => ({
    ...budget,
    row: rows(
      'SELECT count,expires FROM guest_session_admissions WHERE bucket=?',
      budget.key,
    )[0],
  }));
  const blocked = budgets.filter(
    (budget) => budget.row?.count >= budget.maximum,
  );
  if (blocked.length) {
    return {
      allowed: false,
      retryAfter: Math.max(
        1,
        ...blocked.map((budget) => budget.row.expires - now),
      ),
    };
  }
  if (!budgets[2].row) {
    const networks = rows(
      "SELECT COUNT(*) AS count,MIN(expires) AS next FROM guest_session_admissions WHERE bucket LIKE 'network:%'",
    )[0];
    if (networks.count >= MAX_NETWORK_COUNTERS) {
      return { allowed: false, retryAfter: Math.max(1, networks.next - now) };
    }
  }
  for (const budget of budgets) {
    sql.exec(
      `INSERT INTO guest_session_admissions VALUES(?,1,?)
       ON CONFLICT(bucket) DO UPDATE SET count=count+1`,
      budget.key,
      now + budget.seconds,
    );
  }
  return { allowed: true };
}
