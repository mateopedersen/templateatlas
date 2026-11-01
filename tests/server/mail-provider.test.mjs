import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions, Log, LogLevel } from 'miniflare';
import { accountEmailConfigured, sendMail } from '../../src/server/email.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = 'https://accounts.example.test';

test('email providers are explicit and a rejected or missing receipt never falls back', async () => {
  const from = 'notify@sender.example.test';
  const env = {
    EMAIL_PROVIDER: 'cloudflare',
    EMAIL_FROM: from,
    EMAIL_SENDING_DOMAIN: 'sender.example.test',
    EMAIL_API_KEY: 'unused',
    AUTH_SECRET: randomBytes(32).toString('hex'),
    DB: {
      prepare: () => ({
        bind: () => ({ run: async () => ({ meta: { changes: 1 } }) }),
      }),
    },
    TRANSACTIONAL_EMAIL: { send: async () => ({}) },
  };
  assert.equal(accountEmailConfigured(env), true);
  assert.equal(
    accountEmailConfigured({
      ...env,
      EMAIL_SENDING_DOMAIN: 'other.example.test',
    }),
    false,
  );
  assert.equal(
    accountEmailConfigured({ ...env, TRANSACTIONAL_EMAIL: undefined }),
    false,
  );
  assert.equal(
    accountEmailConfigured({ ...env, EMAIL_PROVIDER: 'unknown' }),
    false,
  );
  assert.equal(
    accountEmailConfigured({ ...env, LOCAL_MAILBOX_ENABLED: 'true' }),
    false,
  );
  let message;
  await sendMail(
    {
      ...env,
      TRANSACTIONAL_EMAIL: {
        send: async (m) => {
          message = m;
          return { messageId: 'local-fixture' };
        },
      },
    },
    'to@example.test',
    'Verification',
    'Synthetic test message',
  );
  assert.deepEqual(message, {
    from: { email: from, name: 'TemplateAtlas' },
    to: 'to@example.test',
    subject: 'Verification',
    text: 'Synthetic test message',
  });
  await assert.rejects(
    sendMail(env, 'to@example.test', 'Test', 'Fixture'),
    /EMAIL_DELIVERY_UNAVAILABLE/,
  );
});

test('Better Auth waits for Cloudflare local send_email and reports a rejected address as unavailable', async (t) => {
  const compiled = await build({
    stdin: {
      contents: `import {handleApi} from './src/server/index.mjs'; export {DownloadActor} from './src/server/index.mjs';
    export default {fetch(req,env,ctx){return handleApi(req,env,ctx);}};`,
      resolveDir: root,
    },
    bundle: true,
    platform: 'browser',
    format: 'esm',
    conditions: ['workerd', 'browser'],
    external: ['node:*'],
    write: false,
  });
  let external = 0;
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: compiled.outputFiles[0].text,
      compatibilityDate: '2026-10-01',
      compatibilityFlags: ['nodejs_compat'],
      log: new Log(LogLevel.NONE),
      d1Databases: ['DB'],
      durableObjects: {
        DOWNLOAD_ACTORS: { className: 'DownloadActor', useSQLite: true },
      },
      email: {
        send_email: [
          {
            name: 'TRANSACTIONAL_EMAIL',
            allowed_sender_addresses: ['accounts@notify.example.test'],
            allowed_destination_addresses: ['allowed@example.test'],
          },
        ],
      },
      bindings: {
        PUBLIC_SITE_URL: origin,
        EMAIL_PROVIDER: 'cloudflare',
        EMAIL_FROM: 'accounts@notify.example.test',
        EMAIL_SENDING_DOMAIN: 'notify.example.test',
        AUTH_SECRET: randomBytes(32).toString('hex'),
        GUEST_COOKIE_SIGNING_KEY: randomBytes(32).toString('hex'),
      },
      outboundService: () => {
        external++;
        throw Error('No external network permitted in this test');
      },
    }),
  );
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  let sql = '';
  for (const line of (
    await readFile(root + 'migrations/0001_membership.sql', 'utf8')
  ).split('\n')) {
    if (!line.trim() || line.trim().startsWith('--')) continue;
    sql += line + '\n';
    if (
      !line.trim().endsWith(';') ||
      (/^CREATE TRIGGER/i.test(sql) && !line.trim().startsWith('END;'))
    )
      continue;
    await db.prepare(sql).run();
    sql = '';
  }
  async function signup(email) {
    return mf.dispatchFetch(origin + '/api/auth/sign-up/email', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Mail test',
        email,
        password: randomBytes(20).toString('hex'),
        callbackURL: origin + '/account/',
      }),
    });
  }
  const session = await mf.dispatchFetch(origin + '/api/session');
  assert.equal((await session.json()).accountEmailConfigured, true);
  const ok = await signup('allowed@example.test');
  assert.equal(ok.status, 200);
  const blocked = await signup('blocked@example.test');
  assert.equal(blocked.status, 503);
  assert.deepEqual(await blocked.json(), {
    code: 'EMAIL_DELIVERY_UNAVAILABLE',
  });
  assert.equal(
    await db
      .prepare('SELECT count(*) FROM first_verifications')
      .first('count(*)'),
    0,
  );
  for (let i = 0; i < 5; i++) {
    const req = await mf.dispatchFetch(
      origin + '/api/auth/request-password-reset',
      {
        method: 'POST',
        headers: {
          origin,
          'content-type': 'application/json',
          'cf-connecting-ip': '192.0.2.' + (i + 1),
        },
        body: JSON.stringify({
          email: 'nonexistent@example.test',
          redirectTo: origin + '/reset-password/',
        }),
      },
    );
    assert.equal(req.status, 200);
  }
  const limited = await mf.dispatchFetch(
    origin + '/api/auth/request-password-reset',
    {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        'cf-connecting-ip': '192.0.2.23',
      },
      body: JSON.stringify({
        email: 'Nonexistent@example.test',
        redirectTo: origin + '/reset-password/',
      }),
    },
  );
  assert.equal(limited.status, 429);
  const ledger = (
    await db
      .prepare(
        "SELECT key FROM rateLimit WHERE key LIKE 'templateatlas.mail.%'",
      )
      .all()
  ).results;
  assert.ok(ledger.length > 0 && ledger.every((r) => !r.key.includes('@')));
  assert.equal(external, 0);
});
