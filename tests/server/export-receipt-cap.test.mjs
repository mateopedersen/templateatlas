import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';

const migrations = await Promise.all((await readdir(new URL('../../migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort().map(async name => [name, await readFile(new URL('../../migrations/' + name, import.meta.url), 'utf8')]));
function fresh(t, upgrade = true) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  for (const [name, sql] of migrations) if (upgrade || !name.startsWith('0016_')) db.exec(sql);
  return db;
}
function insert(db, owner, idem, made = null) {
  return db.prepare('INSERT OR IGNORE INTO export_receipts(owner,idem,fingerprint,made) VALUES(?,?,?,COALESCE(?,unixepoch()))').run(owner, idem, 'fixture-fingerprint', made);
}
const count = (db, owner) => Number(owner ? db.prepare('SELECT COUNT(*) AS count FROM export_receipts WHERE owner=?').get(owner).count : db.prepare('SELECT COUNT(*) AS count FROM export_receipts').get().count);

test('D1 retained export receipts cap each actor without changing exact retries or request time', t => {
  const db = fresh(t);
  for (let i = 0; i < 1024; i++) insert(db, 'guest:fixture', 'key-' + i);
  const before = db.prepare("SELECT * FROM export_receipts WHERE owner='guest:fixture' AND idem='key-0'").get();
  assert.equal(count(db, 'guest:fixture'), 1024);
  assert.throws(() => insert(db, 'guest:fixture', 'new-key'), /EXPORT_RECEIPT_LIMIT/);
  insert(db, 'guest:fixture', 'key-0');
  assert.deepEqual(db.prepare("SELECT * FROM export_receipts WHERE owner='guest:fixture' AND idem='key-0'").get(), before);
  assert.equal(count(db, 'guest:fixture'), 1024);
  insert(db, 'guest:other', 'other-key');
  assert.equal(count(db, 'guest:other'), 1);
});

test('24-hour expiry recovers row capacity without extending retries or depending on scheduled cleanup', t => {
  const db = fresh(t);
  for (let i = 0; i < 1024; i++) insert(db, 'user:fixture', 'key-' + i);
  db.exec("UPDATE export_receipts SET made=unixepoch()-86401 WHERE owner='user:fixture'");
  insert(db, 'user:fixture', 'next-day');
  assert.equal(count(db, 'user:fixture'), 1);
  const row = db.prepare("SELECT * FROM export_receipts WHERE owner='user:fixture'").get();
  assert.equal(row.idem, 'next-day');
  assert.ok(row.made > 0);
});

test('migration retires timestamp-less legacy receipts on a new reservation while preserving assets', t => {
  const db = fresh(t, false);
  db.exec("INSERT INTO downloadable_assets(id,template_id,version,format,object_key,sha256,size_bytes,filename,mime,published) VALUES('legacy-asset','legacy-template','v1','pdf','legacy.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,'legacy.pdf','application/pdf',1)");
  db.exec("INSERT INTO export_receipts(owner,idem,fingerprint,asset_id) VALUES('guest:fixture','old-key','old-fingerprint','legacy-asset')");
  db.exec(migrations.find(([name]) => name.startsWith('0016_'))[1]);
  assert.equal(db.prepare('SELECT made FROM export_receipts').get().made, 0);
  insert(db, 'guest:fixture', 'new-key');
  assert.equal(count(db), 1);
  assert.equal(db.prepare("SELECT published FROM downloadable_assets WHERE id='legacy-asset'").get().published, 1);
});

test('database-wide receipts cap prevents fresh identities from amplifying storage and releases expired space', t => {
  const db = fresh(t, false);
  // A bounded pre-upgrade fixture establishes the global boundary without
  // executing one hundred thousand trigger/count operations in a stress loop.
  db.exec("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100000) INSERT INTO export_receipts(owner,idem,fingerprint) SELECT 'guest:fixture-'||x,'key','fingerprint' FROM n");
  db.exec(migrations.find(([name]) => name.startsWith('0016_'))[1]);
  db.exec('UPDATE export_receipts SET made=unixepoch()');
  assert.equal(count(db), 100000);
  assert.throws(() => insert(db, 'guest:new-identity', 'new-key'), /EXPORT_RECEIPT_LIMIT/);
  insert(db, 'guest:fixture-1', 'key');
  assert.equal(count(db), 100000);
  db.exec("UPDATE export_receipts SET made=0 WHERE owner='guest:fixture-1'");
  insert(db, 'guest:new-identity', 'new-key');
  assert.equal(count(db), 100000);
  assert.equal(count(db, 'guest:new-identity'), 1);
});
