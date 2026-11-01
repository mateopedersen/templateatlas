import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { DownloadActor, WINDOW } from '../../src/server/actor.mjs';
import { byteRange } from '../../src/server/delivery.mjs';
function fresh() {
  const db = new DatabaseSync(':memory:');
  const sql = {
    exec(q, ...args) {
      if (!args.length && q.includes(';')) {
        db.exec(q);
        return [];
      }
      return db.prepare(q).all(...args);
    },
  };
  return new DownloadActor({ storage: { sql, transactionSync: (cb) => cb() } });
}
const at = 1800000000;
function reserve(a, r, t = at) {
  return a.dispatch(
    'intent',
    { resource: r, asset: 'a-' + r, idem: crypto.randomUUID() },
    t,
  );
}
function download(a, r, t = at) {
  const i = reserve(a, r, t);
  a.dispatch('commit', { nonce: i.nonce }, t);
  return i;
}
test('five slots include pending reservations; one source across formats and retries', () => {
  const a = fresh();
  for (let i = 0; i < 4; i++) download(a, 't' + i);
  const fifth = reserve(a, 'same');
  const other = a.dispatch(
    'intent',
    { resource: 'same', asset: 'pdf', idem: 'second-key' },
    at,
  );
  assert.throws(() => reserve(a, 'sixth'), /SIGNUP_REQUIRED/);
  a.dispatch('commit', { nonce: fifth.nonce }, at);
  a.dispatch('commit', { nonce: other.nonce }, at);
  a.dispatch('commit', { nonce: other.nonce }, at);
  assert.equal(a.dispatch('summary', {}, at).freeUsed, 5);
});
test('expired and canceled reservations release the slot; idempotency conflict rejects changed asset', () => {
  const a = fresh(),
    row = a.dispatch('intent', { resource: 't', asset: 'v', idem: 'same' }, at);
  assert.throws(
    () =>
      a.dispatch('intent', { resource: 't', asset: 'v2', idem: 'same' }, at),
    /CONFLICT/,
  );
  assert.throws(() => a.dispatch('commit', row, at + 120), /TICKET_EXPIRED/);
  for (let i = 0; i < 5; i++) reserve(a, String(i), at + 120);
  assert.equal(a.dispatch('summary', {}, at + 121).freeUsed, 0);
  const b = fresh(),
    cancel = reserve(b, 't');
  b.dispatch('cancel', cancel, at);
  assert.throws(() => b.dispatch('commit', cancel, at), /TICKET_EXPIRED/);
});
test('verified timestamp is write-once and exact 30-day boundary revokes premium downloads', () => {
  const a = fresh();
  download(a, 'mine');
  a.dispatch('verify', { at }, at);
  a.dispatch('verify', { at: at + 100 }, at + 100);
  const trial = reserve(a, 'six', at + WINDOW - 1);
  assert.throws(
    () => a.dispatch('commit', trial, at + WINDOW),
    /MEMBERSHIP_REQUIRED/,
  );
  assert.equal(a.dispatch('summary', {}, at + WINDOW).trialEndsAt, at + WINDOW);
  assert.equal(a.dispatch('summary', {}, at + WINDOW).premium, false);
  download(a, 'mine', at + WINDOW);
  assert.throws(() => reserve(a, 'new', at + WINDOW), /MEMBERSHIP_REQUIRED/);
});
test('guest transfer retries and competing accounts cannot multiply grants', () => {
  const guest = fresh(),
    user = fresh();
  for (let i = 0; i < 4; i++) download(guest, 'g' + i);
  download(user, 'u0');
  download(user, 'u1');
  const target = 'user:demo',
    before = reserve(guest, 'old');
  const g = guest.dispatch('freeze', { target }, at);
  assert.deepEqual(g, guest.dispatch('freeze', { target }, at));
  assert.throws(() => guest.dispatch('commit', before, at), /ACCESS_REVOKED/);
  assert.throws(
    () => guest.dispatch('freeze', { target: 'user:other' }, at),
    /ACCESS_REVOKED/,
  );
  for (let i = 0; i < 2; i++)
    user.dispatch('import', { source: 'guest:original', grants: g.grants }, at);
  assert.equal(user.dispatch('summary', {}, at).freeUsed, 5);
});
test('paid periods expire; revocation invalidates outstanding ticket and stale reconciliation fails', () => {
  const a = fresh();
  a.dispatch('verify', { at: at - WINDOW - 20 }, at);
  const before = a.dispatch('billing-start', {}, at),
    gen = a.dispatch('billing-start', {}, at);
  assert.throws(
    () =>
      a.dispatch(
        'billing-set',
        { ...before, status: 'active', through: at + 1000 },
        at,
      ),
    /CONFLICT/,
  );
  a.dispatch(
    'billing-set',
    { ...gen, status: 'active', through: at + 1000 },
    at,
  );
  const i = reserve(a, 'premium');
  assert.equal(a.dispatch('summary', {}, at + 1000).premium, false);
  a.dispatch('billing-set', { ...gen, status: 'past_due', through: 0 }, at);
  assert.throws(() => a.dispatch('commit', i, at + 1), /TICKET_EXPIRED/);
});
test('single byte ranges, suffixes, unsatisfiable and multipart ranges', () => {
  assert.deepEqual(byteRange('bytes=-3', 5), { offset: 2, length: 3 });
  assert.deepEqual(byteRange('bytes=2-99', 5), { offset: 2, length: 3 });
  for (const invalid of ['bytes=-0', 'bytes=6-', 'bytes=1-0', 'bytes=0-1,3-4'])
    assert.throws(() => byteRange(invalid, 5));
});
