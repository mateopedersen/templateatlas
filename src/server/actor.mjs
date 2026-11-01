import { requireValue, ApiError, failure, json, unix } from './common.mjs';

export const WINDOW = 30 * 86400;
const LIMIT = 5,
  TTL = 120;
const schema = `
  CREATE TABLE IF NOT EXISTS principal (id INTEGER PRIMARY KEY CHECK(id=1), verified_at INTEGER, paid_through INTEGER NOT NULL DEFAULT 0,
    billing_status TEXT NOT NULL DEFAULT 'none', epoch INTEGER NOT NULL DEFAULT 0, transferred TEXT, suspended INTEGER NOT NULL DEFAULT 0, generation INTEGER NOT NULL DEFAULT 0);
  INSERT OR IGNORE INTO principal(id) VALUES(1);
  CREATE TABLE IF NOT EXISTS free_resources (resource TEXT PRIMARY KEY, delivered INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS intents (nonce TEXT PRIMARY KEY, idem TEXT UNIQUE NOT NULL, asset TEXT NOT NULL, resource TEXT NOT NULL,
    mode TEXT NOT NULL, expires INTEGER NOT NULL, epoch INTEGER NOT NULL, made INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS intents_expiration ON intents(expires);
  CREATE TABLE IF NOT EXISTS imports (source TEXT PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS writes (frame INTEGER PRIMARY KEY, count INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS support_windows (frame INTEGER PRIMARY KEY, count INTEGER NOT NULL);
`;

// The constructor accepts only Cloudflare's state binding. There is no public route to this object.
export class DownloadActor {
  constructor(ctx) {
    this.storage = ctx.storage;
    this.sql = ctx.storage.sql;
    this.sql.exec(schema);
    if (
      !this.rows('PRAGMA table_info(principal)').some(
        (c) => c.name === 'cancel_at_end',
      )
    )
      this.sql.exec(
        'ALTER TABLE principal ADD COLUMN cancel_at_end INTEGER NOT NULL DEFAULT 0',
      );
  }
  rows(query, ...args) {
    return Array.from(this.sql.exec(query, ...args));
  }
  fetch(request) {
    return this.route(request).catch(failure);
  }
  async route(request) {
    const data = await request.json();
    const action = new URL(request.url).pathname.slice(1);
    const result = this.storage.transactionSync(() =>
      this.dispatch(action, data, unix()),
    );
    return json(result);
  }
  dispatch(action, input, now) {
    const state = this.rows('SELECT * FROM principal WHERE id=1')[0];
    const exec = (q, ...values) => this.sql.exec(q, ...values);
    const grants = () =>
      this.rows(
        'SELECT resource,delivered FROM free_resources ORDER BY delivered, resource',
      );
    if (action === 'erase') {
      exec('DELETE FROM free_resources');
      exec('DELETE FROM intents');
      exec('DELETE FROM imports');
      exec('DELETE FROM writes');
      exec(
        "UPDATE principal SET verified_at=NULL,paid_through=0,billing_status='none',epoch=epoch+1,suspended=1 WHERE id=1",
      );
      return {};
    }
    if (action === 'freeze') {
      requireValue(
        !state.transferred || state.transferred === input.target,
        'ACCESS_REVOKED',
      );
      if (!state.transferred) {
        exec(
          'UPDATE principal SET transferred=?,epoch=epoch+1 WHERE id=1',
          input.target,
        );
        exec('DELETE FROM intents');
      }
      return { grants: grants() };
    }
    if (state.transferred && action === 'summary') {
      return {
        freeUsed: LIMIT,
        freeLimit: LIMIT,
        premium: false,
        trialEndsAt: null,
        paidThrough: null,
        billingStatus: 'none',
        signInRequired: true,
      };
    }
    requireValue(!state.transferred && !state.suspended, 'ACCESS_REVOKED');
    if (action === 'suspend') {
      exec('UPDATE principal SET suspended=1,epoch=epoch+1 WHERE id=1');
      return {};
    }
    if (action === 'import') {
      if (
        !this.rows('SELECT 1 FROM imports WHERE source=?', input.source).length
      ) {
        for (const g of input.grants.slice(0, LIMIT)) {
          if (grants().length >= LIMIT) break;
          exec(
            'INSERT OR IGNORE INTO free_resources(resource,delivered) VALUES(?,?)',
            g.resource,
            g.delivered,
          );
        }
        exec('INSERT INTO imports(source) VALUES(?)', input.source);
        // Existing user reservations may predate the transfer. Require fresh authorization.
        exec('UPDATE principal SET epoch=epoch+1 WHERE id=1');
      }
      return {};
    }
    if (action === 'verify') {
      requireValue(
        Number.isSafeInteger(input.at) && input.at > 0 && input.at <= now,
      );
      exec(
        'UPDATE principal SET verified_at=COALESCE(verified_at,?) WHERE id=1',
        input.at,
      );
      return {};
    }
    if (action === 'billing-start') {
      exec('UPDATE principal SET generation=generation+1 WHERE id=1');
      return { generation: state.generation + 1 };
    }
    if (action === 'billing-set') {
      requireValue(input.generation === state.generation, 'REVISION_CONFLICT');
      const cancel = input.cancelAtEnd ? 1 : 0;
      if (
        state.billing_status !== input.status ||
        state.paid_through !== input.through ||
        state.cancel_at_end !== cancel
      ) {
        exec(
          'UPDATE principal SET billing_status=?,paid_through=?,cancel_at_end=?,epoch=epoch+1 WHERE id=1',
          input.status,
          input.through,
          cancel,
        );
      }
      return {};
    }
    const free = grants();
    const trialEnd = state.verified_at ? state.verified_at + WINDOW : 0;
    const premium =
      !!state.verified_at &&
      (state.billing_status === 'none'
        ? now < trialEnd
        : state.billing_status === 'active' && now < state.paid_through);
    const denied = state.verified_at
      ? 'MEMBERSHIP_REQUIRED'
      : input.signedIn
        ? 'EMAIL_VERIFICATION_REQUIRED'
        : 'SIGNUP_REQUIRED';
    if (action === 'support-limit' || action === 'support-network-limit') {
      const frame = Math.floor(now / 900);
      exec('DELETE FROM support_windows WHERE frame<>?', frame);
      exec(
        'INSERT INTO support_windows VALUES(?,1) ON CONFLICT(frame) DO UPDATE SET count=count+1',
        frame,
      );
      requireValue(
        this.rows('SELECT count FROM support_windows WHERE frame=?', frame)[0]
          .count <= (action === 'support-limit' ? 3 : 12),
        'RATE_LIMITED',
      );
      return {};
    }
    if (action === 'write-limit' || action === 'reauth-limit') {
      const frame =
        Math.floor(now / 60) * 2 + (action === 'reauth-limit' ? 1 : 0);
      exec('DELETE FROM writes WHERE frame<?', frame - 2);
      exec(
        'INSERT INTO writes VALUES(?,1) ON CONFLICT(frame) DO UPDATE SET count=count+1',
        frame,
      );
      requireValue(
        this.rows('SELECT count FROM writes WHERE frame=?', frame)[0].count <=
          (action === 'reauth-limit' ? 5 : 40),
        'RATE_LIMITED',
      );
      return {};
    }
    if (action === 'can-export') {
      if (premium || free.some((g) => g.resource === input.resource)) return {};
      const occupied = this.rows(
        "SELECT resource FROM free_resources UNION SELECT resource FROM intents WHERE mode='free' AND expires>? AND epoch=?",
        now,
        state.epoch,
      );
      requireValue(
        !state.verified_at &&
          (occupied.length < LIMIT ||
            occupied.some((g) => g.resource === input.resource)),
        denied,
      );
      return {};
    }
    if (action === 'summary')
      return {
        freeUsed: free.length,
        freeLimit: LIMIT,
        trialEndsAt: trialEnd || null,
        paidThrough: state.paid_through || null,
        billingStatus: state.billing_status,
        cancelAtPeriodEnd: !!state.cancel_at_end,
        premium,
      };
    // Keep replay/conflict evidence one day; tickets themselves always expire at 120 seconds.
    exec('DELETE FROM intents WHERE made < ?', now - 86400);
    if (action === 'cancel') {
      exec('DELETE FROM intents WHERE nonce=?', input.nonce);
      return {};
    }
    if (action === 'intent') {
      const existing = this.rows(
        'SELECT * FROM intents WHERE idem=?',
        input.idem,
      )[0];
      if (existing) {
        requireValue(
          existing.asset === input.asset &&
            existing.resource === input.resource,
          'IDEMPOTENCY_CONFLICT',
        );
        if (existing.expires > now && existing.epoch === state.epoch)
          return { nonce: existing.nonce, expiresAt: existing.expires };
        exec('DELETE FROM intents WHERE idem=?', input.idem);
      }
      let mode = 'free';
      if (free.some((g) => g.resource === input.resource)) mode = 'granted';
      else if (premium) mode = 'premium';
      else {
        requireValue(!state.verified_at, denied);
        const occupied = this.rows(
          `SELECT resource FROM free_resources UNION SELECT resource FROM intents
          WHERE mode='free' AND expires>? AND epoch=?`,
          now,
          state.epoch,
        );
        requireValue(
          occupied.some((g) => g.resource === input.resource) ||
            occupied.length < LIMIT,
          denied,
        );
      }
      const nonce = crypto.randomUUID(),
        expires = now + TTL;
      exec(
        'INSERT INTO intents VALUES(?,?,?,?,?,?,?,?)',
        nonce,
        input.idem,
        input.asset,
        input.resource,
        mode,
        expires,
        state.epoch,
        now,
      );
      return { nonce, expiresAt: expires };
    }
    if (action === 'resolve' || action === 'commit') {
      const row = this.rows(
        'SELECT * FROM intents WHERE nonce=?',
        input.nonce,
      )[0];
      requireValue(
        row && row.expires > now && row.epoch === state.epoch,
        'TICKET_EXPIRED',
      );
      requireValue(row.mode !== 'premium' || premium, denied);
      if (
        action === 'commit' &&
        row.mode === 'free' &&
        !free.some((g) => g.resource === row.resource)
      ) {
        requireValue(free.length < LIMIT, denied);
        exec('INSERT INTO free_resources VALUES(?,?)', row.resource, now);
      }
      return { asset: row.asset, resource: row.resource };
    }
    throw new ApiError('NOT_FOUND');
  }
}
