import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { DownloadActor } from '../../src/server/actor.mjs';

const at = 1800000000;
const capacity = 1024;
const fixture = {
  resource: 'template:fixture',
  asset: 'asset-fixture',
  idem: 'ticket-0',
};

function fresh(t, premium = false) {
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
  const actor = new DownloadActor({
    storage: { sql, transactionSync: (callback) => callback() },
  });
  if (premium) actor.dispatch('verify', { at: at - 1 }, at);
  return actor;
}

function fill(actor) {
  const first = actor.dispatch('intent', fixture, at);
  for (let i = 1; i < capacity; i++) {
    actor.dispatch('intent', { ...fixture, idem: 'ticket-' + i }, at);
  }
  return first;
}

function retained(actor) {
  return actor.rows('SELECT COUNT(*) AS count FROM intents')[0].count;
}

for (const premium of [false, true]) {
  test(`ticket history is bounded for ${premium ? 'members' : 'guests'} while existing tickets remain usable`, (t) => {
    const actor = fresh(t, premium);
    const first = fill(actor);
    assert.equal(retained(actor), capacity);
    assert.throws(
      () => actor.dispatch('intent', { ...fixture, idem: 'one-more' }, at + 1),
      /RATE_LIMITED/,
    );
    assert.equal(retained(actor), capacity);
    assert.deepEqual(actor.dispatch('intent', fixture, at + 1), first);
    assert.throws(
      () => actor.dispatch('intent', { ...fixture, asset: 'other-asset' }, at + 1),
      /IDEMPOTENCY_CONFLICT/,
    );
    assert.equal(actor.dispatch('resolve', first, at + 1).asset, fixture.asset);
    actor.dispatch('commit', first, at + 1);
    actor.dispatch('commit', first, at + 1);
    assert.equal(actor.dispatch('summary', {}, at + 1).freeUsed, premium ? 0 : 1);
  });
}

test('renewing the same expired key at capacity preserves expiry and storage bounds', (t) => {
  const actor = fresh(t);
  const first = fill(actor);
  const renewed = actor.dispatch('intent', fixture, at + 120);
  assert.notEqual(renewed.nonce, first.nonce);
  assert.equal(renewed.expiresAt, at + 240);
  assert.equal(retained(actor), capacity);
  assert.throws(() => actor.dispatch('resolve', first, at + 120), /TICKET_EXPIRED/);
  assert.equal(actor.dispatch('resolve', renewed, at + 121).asset, fixture.asset);
  assert.throws(
    () => actor.dispatch('intent', { ...fixture, idem: 'another-new-key' }, at + 121),
    /RATE_LIMITED/,
  );
});

test('one-day pruning releases ticket capacity without removing permanent free grants', (t) => {
  const actor = fresh(t);
  const first = fill(actor);
  actor.dispatch('commit', first, at + 1);
  const later = at + 86401;
  const next = actor.dispatch('intent', { ...fixture, idem: 'next-day' }, later);
  assert.equal(retained(actor), 1);
  assert.equal(actor.dispatch('resolve', next, later).asset, fixture.asset);
  assert.equal(actor.dispatch('summary', {}, later).freeUsed, 1);
});

test('pre-upgrade actors above capacity retain valid tickets and exact retries', (t) => {
  const actor = fresh(t);
  const first = fill(actor);
  actor.sql.exec(
    'INSERT INTO intents VALUES(?,?,?,?,?,?,?,?)',
    crypto.randomUUID(), 'pre-upgrade-extra', fixture.asset, fixture.resource,
    'free', at + 120, 0, at,
  );
  assert.equal(retained(actor), capacity + 1);
  assert.deepEqual(actor.dispatch('intent', fixture, at + 1), first);
  actor.dispatch('commit', first, at + 1);
  assert.equal(actor.dispatch('summary', {}, at + 1).freeUsed, 1);
  assert.throws(
    () => actor.dispatch('intent', { ...fixture, idem: 'more-after-upgrade' }, at + 1),
    /RATE_LIMITED/,
  );
});
