import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { DownloadActor } from '../../src/server/actor.mjs';
import { identify } from '../../src/server/identity.mjs';
import { GUEST_SESSION_ADMISSION } from '../../src/server/guest-sessions.mjs';

const at = 1800000000;
const networkHash = (value) =>
  createHash('sha256').update(String(value)).digest('hex');

function actor(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const sql = {
    exec(query, ...values) {
      if (!values.length && query.includes(';')) {
        db.exec(query);
        return [];
      }
      return db.prepare(query).all(...values);
    },
  };
  return new DownloadActor({
    storage: {
      sql,
      transactionSync(callback) {
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = callback();
          db.exec('COMMIT');
          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
    },
  });
}

function identityFixture(t) {
  const instances = new Map(),
    calls = [];
  const env = {
    GUEST_COOKIE_SIGNING_KEY: randomBytes(32).toString('hex'),
    DOWNLOAD_ACTORS: {
      idFromName(name) {
        return name;
      },
      get(name) {
        return {
          async fetch(url, options) {
            calls.push(name);
            if (!instances.has(name)) instances.set(name, actor(t));
            return instances.get(name).fetch(new Request(url, options));
          },
        };
      },
    },
  };
  const request = (ip, more = {}) =>
    new Request('https://atlas.example.test/api/session', {
      headers: { ...(ip ? { 'cf-connecting-ip': ip } : {}), ...more },
    });
  return { env, instances, calls, request };
}

test('fresh signed identities share one admission object; saved cookies bypass a full creation budget', async (t) => {
  const f = identityFixture(t);
  const results = await Promise.all(
    Array.from({ length: 45 }, async () => {
      try {
        return await identify(f.env, f.request('192.0.2.7'), true);
      } catch (error) {
        assert.equal(error.message, 'RATE_LIMITED');
        return error;
      }
    }),
  );
  const allowed = results.filter((item) => item.cookie);
  assert.equal(allowed.length, 30);
  assert.equal(new Set(allowed.map((item) => item.actor)).size, 30);
  assert.deepEqual([...f.instances.keys()], [GUEST_SESSION_ADMISSION]);
  assert.ok(
    results
      .filter((item) => !item.cookie)
      .every((item) => item.retryAfter >= 1 && item.retryAfter <= 60),
  );
  const cookie = allowed[0].cookie.split(';')[0];
  const before = f.calls.length;
  const existing = await identify(
    f.env,
    f.request('192.0.2.7', { cookie }),
    true,
  );
  assert.equal(existing.actor, allowed[0].actor);
  assert.equal(existing.cookie, undefined);
  assert.equal(f.calls.length, before);
  const anotherNetwork = await identify(f.env, f.request('192.0.2.8'), true);
  assert.ok(anotherNetwork.cookie);
});

test('IPv6 host rotation and IPv4-mapped aliases do not bypass network admission', async (t) => {
  const f = identityFixture(t);
  for (let i = 0; i < 30; i++) {
    await identify(
      f.env,
      f.request('2001:db8:abcd:1234::' + (i + 1).toString(16)),
      true,
    );
  }
  await assert.rejects(
    identify(f.env, f.request('2001:0db8:abcd:1234:ffff:0:0:1'), true),
    /RATE_LIMITED/,
  );
  assert.ok(
    (await identify(f.env, f.request('2001:db8:abcd:1235::1'), true)).cookie,
  );
  for (let i = 0; i < 30; i++) {
    await identify(
      f.env,
      f.request(i % 2 ? '::ffff:192.0.2.1' : '192.0.2.1'),
      true,
    );
  }
  await assert.rejects(
    identify(f.env, f.request('::ffff:c000:201'), true),
    /RATE_LIMITED/,
  );
});

test('missing or malformed edge addresses share a bounded fallback; forwarded headers cannot rotate it', async (t) => {
  const f = identityFixture(t);
  for (let i = 0; i < 30; i++) {
    await identify(
      f.env,
      f.request(i % 2 ? 'invalid-' + i : null, {
        'x-forwarded-for': '198.51.100.' + i,
        'x-real-ip': '203.0.113.' + i,
      }),
      true,
    );
  }
  await assert.rejects(
    identify(
      f.env,
      f.request(null, { 'x-forwarded-for': '192.0.2.200' }),
      true,
    ),
    /RATE_LIMITED/,
  );
  assert.deepEqual([...f.instances.keys()], [GUEST_SESSION_ADMISSION]);
});

test('admission dependency failure or malformed success fails closed before a cookie is returned', async (t) => {
  const f = identityFixture(t);
  for (const payload of [{}, { allowed: 'yes' }]) {
    const env = {
      ...f.env,
      DOWNLOAD_ACTORS: {
        idFromName: (name) => name,
        get: () => ({ fetch: async () => Response.json(payload) }),
      },
    };
    await assert.rejects(
      identify(env, f.request('192.0.2.3'), true),
      /DEPENDENCY_UNAVAILABLE/,
    );
  }
  const env = {
    ...f.env,
    DOWNLOAD_ACTORS: {
      idFromName: (name) => name,
      get: () => ({
        fetch: async () => {
          throw new Error('offline');
        },
      }),
    },
  };
  await assert.rejects(identify(env, f.request('192.0.2.3'), true), /offline/);
});

test('a saturated network cannot consume the remaining global budget', (t) => {
  const a = actor(t),
    input = { networkHash: networkHash('one') };
  for (let i = 0; i < 30; i++)
    assert.equal(
      a.dispatch('guest-session-admission', input, at).allowed,
      true,
    );
  for (let i = 0; i < 100; i++)
    assert.equal(
      a.dispatch('guest-session-admission', input, at).allowed,
      false,
    );
  assert.equal(
    a.rows(
      "SELECT count FROM guest_session_admissions WHERE bucket='global-minute'",
    )[0].count,
    30,
  );
  assert.equal(
    a.dispatch(
      'guest-session-admission',
      { networkHash: networkHash('two') },
      at,
    ).allowed,
    true,
  );
  assert.equal(
    a.rows(
      "SELECT count FROM guest_session_admissions WHERE bucket='global-minute'",
    )[0].count,
    31,
  );
});

test('global admission remains atomic across distinct networks and releases expired counters', (t) => {
  const a = actor(t);
  for (let i = 0; i < 1000; i++) {
    assert.equal(
      a.dispatch('guest-session-admission', { networkHash: networkHash(i) }, at)
        .allowed,
      true,
    );
  }
  assert.deepEqual(
    a.dispatch(
      'guest-session-admission',
      { networkHash: networkHash('over') },
      at,
    ),
    { allowed: false, retryAfter: 60 },
  );
  assert.equal(
    a.rows('SELECT COUNT(*) AS n FROM guest_session_admissions')[0].n,
    1002,
  );
  assert.equal(
    a.dispatch(
      'guest-session-admission',
      { networkHash: networkHash('later') },
      at + 60,
    ).allowed,
    true,
  );
  assert.equal(
    a.rows('SELECT COUNT(*) AS n FROM guest_session_admissions')[0].n,
    3,
  );
});

test('the daily budget limits distributed creation beyond individual minute windows', (t) => {
  const a = actor(t);
  for (let minute = 0; minute < 20; minute++) {
    for (let i = 0; i < 1000; i++) {
      assert.equal(
        a.dispatch(
          'guest-session-admission',
          { networkHash: networkHash(minute * 1000 + i) },
          at + minute * 61,
        ).allowed,
        true,
      );
    }
  }
  const blockedAt = at + 20 * 61;
  assert.deepEqual(
    a.dispatch(
      'guest-session-admission',
      { networkHash: networkHash('day-full') },
      blockedAt,
    ),
    { allowed: false, retryAfter: at + 86400 - blockedAt },
  );
  assert.equal(
    a.rows('SELECT COUNT(*) AS n FROM guest_session_admissions')[0].n,
    1,
  );
  assert.equal(
    a.dispatch(
      'guest-session-admission',
      { networkHash: networkHash('next-day') },
      at + 86400,
    ).allowed,
    true,
  );
});

test('the network ledger has a hard cardinality cap and expires without changing entitlements', (t) => {
  const a = actor(t);
  a.dispatch(
    'guest-session-admission',
    { networkHash: networkHash('first') },
    at,
  );
  a.sql.exec(
    "DELETE FROM guest_session_admissions WHERE bucket LIKE 'network:%'",
  );
  for (let i = 0; i < 2048; i++) {
    a.sql.exec(
      'INSERT INTO guest_session_admissions VALUES(?,1,?)',
      'network:' + networkHash(i),
      at + 60,
    );
  }
  assert.equal(
    a.dispatch(
      'guest-session-admission',
      { networkHash: networkHash('new') },
      at,
    ).allowed,
    false,
  );
  assert.equal(
    a.rows('SELECT COUNT(*) AS n FROM guest_session_admissions')[0].n,
    2050,
  );
  assert.equal(
    a.dispatch('guest-session-admission', { networkHash: networkHash(0) }, at)
      .allowed,
    true,
  );
  assert.equal(
    a.dispatch(
      'guest-session-admission',
      { networkHash: networkHash('new') },
      at + 60,
    ).allowed,
    true,
  );
  assert.equal(
    a.rows('SELECT COUNT(*) AS n FROM guest_session_admissions')[0].n,
    3,
  );
  assert.equal(a.dispatch('summary', {}, at + 60).freeUsed, 0);
});
