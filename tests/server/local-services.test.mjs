import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createOTP } from '@better-auth/utils/otp';
import { base32 } from '@better-auth/utils/base32';
import { createHmac, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { indexRelease } from '../../src/search/indexer.mjs';
import { querySearch } from '../../src/search/query.mjs';
const random = () => randomBytes(32).toString('hex'),
  root = fileURLToPath(new URL('../../', import.meta.url)),
  origin = 'http://127.0.0.1:4321';
test('local inbox, support tickets and published-only D1 search in workerd', async (t) => {
  const key = random(),
    ownerSecret = random(),
    totp = randomBytes(20),
    bundle = await build({
      stdin: {
        contents:
          "export {DownloadActor} from './src/server/index.mjs';import {handleApi} from './src/server/index.mjs';export default {fetch:handleApi};",
        resolveDir: root,
      },
      bundle: true,
      platform: 'browser',
      format: 'esm',
      conditions: ['workerd', 'browser'],
      external: ['node:*'],
      write: false,
    });
  let outbound = 0;
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      d1Databases: ['DB'],
      r2Buckets: ['ASSET_ORIGINALS', 'USER_DOCUMENTS'],
      durableObjects: {
        DOWNLOAD_ACTORS: { className: 'DownloadActor', useSQLite: true },
      },
      compatibilityDate: '2026-10-01',
      compatibilityFlags: ['nodejs_compat'],
      bindings: {
        LOCAL_ADMIN_ENABLED: 'true',
        LOCAL_ADMIN_ISSUER_SECRET: ownerSecret,
        LOCAL_ADMIN_TOTP_SEED: base32.encode(totp, { padding: false }),
        PUBLIC_SITE_URL: origin,
        DEPLOY_STAGE: 'local',
        LOCAL_MAILBOX_ENABLED: 'true',
        LOCAL_MAILBOX_SECRET: key,
        GUEST_COOKIE_SIGNING_KEY: random(),
        DOWNLOAD_TOKEN_SECRET: random(),
        AUTH_SECRET: random(),
      },
      outboundService: () => {
        outbound++;
        throw Error('Blocked outbound request in local test');
      },
    }),
  );
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB'),
    files = (await readdir(root + 'migrations'))
      .filter((s) => s.endsWith('.sql'))
      .sort();
  for (const f of files) {
    let statement = '';
    for (const line of (await readFile(root + 'migrations/' + f, 'utf8')).split(
      '\n',
    )) {
      if (!line.trim() || line.trim().startsWith('--')) continue;
      statement += line + '\n';
      if (
        !line.trim().endsWith(';') ||
        (/^CREATE TRIGGER/i.test(statement) && !line.trim().startsWith('END;'))
      )
        continue;
      await db.prepare(statement).run();
      statement = '';
    }
    assert.ok(!statement, 'Complete migration ' + f);
  }
  const req = (path, data, cookie = '', headers = {}) =>
    mf.dispatchFetch(origin + path, {
      method: data ? 'POST' : 'GET',
      headers: {
        origin,
        cookie,
        'content-type': 'application/json',
        ...headers,
      },
      body: data ? JSON.stringify(data) : undefined,
      redirect: 'manual',
    });
  const session = await req('/api/session'),
    guest = session.headers.get('set-cookie').split(';')[0];
  assert.equal((await session.json()).localTestInbox, true);
  await t.test(
    'owner-only encrypted test mailbox verifies signup and resets password without external requests',
    async (inner) => {
      assert.equal((await req('/api/dev/mailbox/messages')).status, 403);
      assert.equal(
        (await mf.dispatchFetch('https://outside.example/api/dev/mailbox'))
          .status,
        404,
      );
      const input = {
        name: 'Local example',
        email: 'reader@example.test',
        password: random(),
        callbackURL: origin + '/account/',
      };
      assert.equal(
        (
          await req(
            '/api/auth/sign-up/email',
            { ...input, email: 'outside@example.org' },
            guest,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await req('/api/auth/sign-up/email', {
            ...input,
            callbackURL: 'https://outside.example/',
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await req('/api/auth/request-password-reset', {
            email: input.email,
            redirectTo: '//outside.example/',
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await req(
            '/api/auth/verify-email?token=unused&callbackURL=' +
              encodeURIComponent('https://outside.example/'),
          )
        ).status,
        403,
      );
      const r = await req('/api/auth/sign-up/email', input, guest);
      assert.equal(r.status, 200, (await r.text()).slice(0, 180));
      const saved = await db
        .prepare('SELECT * FROM local_test_messages')
        .first();
      assert.ok(saved.ciphertext.length > 100);
      assert.ok(!JSON.stringify(saved).includes(input.email));
      const exp = Math.floor(Date.now() / 1000) + 90,
        nonce = crypto.randomUUID(),
        mac = createHmac('sha256', key)
          .update('unlock|' + exp + '|' + nonce)
          .digest('hex'),
        token = [exp, nonce, mac].join('.');
      const unlocked = await req('/api/dev/mailbox/unlock', { token });
      assert.equal(unlocked.status, 200);
      assert.equal(
        (await req('/api/dev/mailbox/unlock', { token })).status,
        403,
      );
      const owner = unlocked.headers.get('set-cookie').split(';')[0],
        inbox = await (
          await req('/api/dev/mailbox/messages', undefined, owner)
        ).json();
      assert.equal(inbox.messages.length, 1);
      assert.ok(!inbox.messages[0].text.includes('token='));
      const read = await req(
        '/api/dev/mailbox/open',
        { id: inbox.messages[0].id },
        owner + '; ' + guest,
      );
      assert.equal(read.status, 200);
      assert.deepEqual(await read.json(), { redirect: '/account/' });
      assert.equal(
        (
          await req(
            '/api/dev/mailbox/open',
            { id: inbox.messages[0].id },
            owner,
          )
        ).status,
        410,
      );
      const member = read.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');
      assert.equal(
        (
          await (
            await req('/api/session', undefined, member + '; ' + guest)
          ).json()
        ).premium,
        true,
      );
      await inner.test(
        'list and revoke one other session without exposing bearer tokens',
        async () => {
          const next = await req('/api/auth/sign-in/email', {
            email: input.email,
            password: input.password,
          });
          assert.equal(next.status, 200);
          const second = next.headers
            .getSetCookie()
            .map((c) => c.split(';')[0])
            .join('; ');
          const { sessions } = await (
            await req('/api/account/sessions', undefined, member)
          ).json();
          assert.equal(sessions.length, 2);
          assert.equal(sessions.filter((v) => v.current).length, 1);
          assert.ok(sessions.every((v) => !Object.hasOwn(v, 'token')));
          assert.equal(
            (
              await req(
                '/api/account/sessions/revoke',
                { id: 'someone-elses-session' },
                member,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await req(
                '/api/account/sessions/revoke',
                { id: sessions.find((s) => !s.current).id },
                member,
              )
            ).status,
            200,
          );
          assert.equal(
            (await (await req('/api/session', undefined, second)).json()).user,
            null,
          );
          assert.equal(
            (await (await req('/api/session', undefined, member)).json()).user
              .email,
            input.email,
          );
        },
      );
      const updated = 'changed@example.test';
      await inner.test(
        'email changes require old and new inboxes, remain local, and preserve the trial timestamp',
        async () => {
          const earlier = (
            await (await req('/api/session', undefined, member)).json()
          ).trialEndsAt;
          await new Promise((r) => setTimeout(r, 1050));
          assert.equal(
            (
              await req(
                '/api/auth/change-email',
                { newEmail: 'outside@example.org' },
                member,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await req(
                '/api/auth/change-email',
                {
                  newEmail: updated,
                  callbackURL: origin + '/account/settings/',
                },
                member,
              )
            ).status,
            200,
          );
          const readFor = async (address) => {
            const list = (
              await (
                await req('/api/dev/mailbox/messages', undefined, owner)
              ).json()
            ).messages;
            assert.equal(list.length, 1);
            assert.equal(list[0].to, address);
            assert.equal(
              (
                await req(
                  '/api/dev/mailbox/open',
                  { id: list[0].id },
                  owner + '; ' + member,
                )
              ).status,
              200,
            );
          };
          await readFor(input.email);
          assert.equal(
            (await (await req('/api/session', undefined, member)).json()).user
              .email,
            input.email,
          );
          await readFor(updated);
          const after = await (
            await req('/api/session', undefined, member)
          ).json();
          assert.equal(after.user.email, updated);
          assert.equal(after.trialEndsAt, earlier);
        },
      );
      const reset = await req('/api/auth/request-password-reset', {
        email: updated,
        redirectTo: origin + '/reset-password/',
      });
      assert.equal(reset.status, 200);
      const msgs = await (
        await req('/api/dev/mailbox/messages', undefined, owner)
      ).json();
      assert.equal(msgs.messages.length, 1);
      const action = await req(
        '/api/dev/mailbox/open',
        { id: msgs.messages[0].id },
        owner,
      );
      const { redirect } = await action.json();
      const link = new URL(redirect, origin);
      assert.equal(link.pathname, '/reset-password/');
      assert.ok(!link.search);
      const newPassword = random();
      assert.equal(
        (
          await req('/api/auth/reset-password', {
            newPassword,
            token: new URLSearchParams(link.hash.slice(1)).get('token'),
          })
        ).status,
        200,
      );
      assert.equal(
        (await (await req('/api/session', undefined, member)).json()).user,
        null,
      );
      assert.equal(outbound, 0);
    },
  );
  await t.test(
    'support confirmation is persistent and idempotent, conflicting requests and abuse rejected',
    async () => {
      const g = (await req('/api/session')).headers
          .get('set-cookie')
          .split(';')[0],
        data = {
          email: 'support-test@example.test',
          subject: 'PDF layout',
          message: 'I need help with a document layout.',
          consent: true,
        },
        h = { 'idempotency-key': 'case-0001' };
      const result = await req('/api/contact', data, g, h);
      assert.equal(result.status, 201);
      const first = await result.json();
      assert.deepEqual(
        await (await req('/api/contact', data, g, h)).json(),
        first,
      );
      assert.equal(
        (await req('/api/contact', { ...data, subject: 'Other concern' }, g, h))
          .status,
        409,
      );
      assert.equal(
        (
          await req('/api/contact', { ...data, consent: false }, g, {
            'idempotency-key': 'case-0002',
          })
        ).status,
        400,
      );
      for (const k of ['case-0002', 'case-0003'])
        assert.equal(
          (await req('/api/contact', data, g, { 'idempotency-key': k })).status,
          201,
        );
      assert.equal(
        (await req('/api/contact', data, g, { 'idempotency-key': 'case-0004' }))
          .status,
        429,
      );
      assert.equal(
        await db.prepare('SELECT count(*) n FROM support_requests').first('n'),
        3,
      );
      assert.equal((await req('/api/admin/support')).status, 403);
    },
  );
  await t.test(
    'local admin needs both the owner launcher and authenticator and never accepts foreign hosts',
    async () => {
      assert.equal((await req('/api/admin/overview')).status, 403);
      assert.equal(
        (await mf.dispatchFetch('https://outside.example/api/dev/operator'))
          .status,
        404,
      );
      const exp = Math.floor(Date.now() / 1000) + 90,
        id = crypto.randomUUID(),
        mac = createHmac('sha256', ownerSecret)
          .update('login|' + origin + '|' + exp + '|' + id)
          .digest('hex'),
        token = [exp, id, mac].join('.');
      const login = await req('/api/dev/operator', { token }),
        first = login.headers.get('set-cookie').split(';')[0];
      assert.equal(login.status, 200);
      assert.equal((await req('/api/dev/operator', { token })).status, 403);
      assert.equal(
        (await req('/api/admin/overview', undefined, first)).status,
        403,
      );
      const unlock = await req(
        '/api/admin/unlock',
        { code: await createOTP(totp).totp() },
        first,
      );
      assert.equal(unlock.status, 200);
      const cookies =
        first + '; ' + unlock.headers.get('set-cookie').split(';')[0];
      const support = await req('/api/admin/support', undefined, cookies);
      assert.equal(support.status, 200);
      assert.equal((await support.json()).requests.length, 3);
      assert.equal(
        (
          await mf.dispatchFetch('https://outside.example/api/admin/support', {
            headers: { cookie: cookies },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await req(
            '/api/admin/support',
            undefined,
            unlock.headers.get('set-cookie').split(';')[0],
          )
        ).status,
        403,
      );
    },
  );
  await t.test(
    'a pending guest transfer cannot strand a newly created draft under its old owner',
    async () => {
      const fresh = (await req('/api/session')).headers
          .get('set-cookie')
          .split(';')[0],
        id = fresh.split('=')[1].split('.')[0];
      await db
        .prepare('INSERT INTO guest_transfers(guest,target) VALUES(?,?)')
        .bind('guest:' + id, 'user:pending-transfer')
        .run();
      const bucket = await mf.getR2Bucket('USER_DOCUMENTS'),
        before = (await bucket.list({ prefix: 'drafts/' })).objects.length;
      const result = await req(
        '/api/documents',
        { kind: 'grade-calculator', data: { title: 'Grade' } },
        fresh,
      );
      assert.equal(result.status, 403);
      assert.equal((await result.json()).code, 'ACCESS_REVOKED');
      assert.equal(
        await db
          .prepare('SELECT count(*) n FROM member_documents WHERE owner=?')
          .bind('guest:' + id)
          .first('n'),
        0,
      );
      assert.equal(
        (await bucket.list({ prefix: 'drafts/' })).objects.length,
        before,
      );
    },
  );
  await t.test(
    'D1 FTS activates complete snapshot, filters on actual asset hashes and honors holds',
    async () => {
      const sha = '1'.repeat(64),
        base = {
          id: 'ta-invoice-001',
          title: 'Invoice',
          display_title: 'Invoice',
          topic_slug: 'invoice',
          topic_path: '/templates/invoice/',
          primary_category_path: '/categories/finance/',
          summary: 'Itemized client billing.',
          year: 2027,
          builder_kind: 'invoice',
          preview: '/previews/demo.webp',
          assets: { xlsx: { sha256: sha } },
        };
      await indexRelease(
        db,
        [base],
        [{ path: base.primary_category_path, title: 'Finance', members: [] }],
      );
      const search = (q, f = {}) =>
        querySearch(db, new URLSearchParams({ q, ...f }));
      assert.equal((await search('invoice')).total, 0);
      await db
        .prepare(
          "INSERT INTO downloadable_assets(id,template_id,version,format,object_key,sha256,size_bytes,filename,mime,published) VALUES('asset','ta-invoice-001','v1','xlsx','private',?,100,'invoice.xlsx','office',1)",
        )
        .bind(sha)
        .run();
      assert.equal((await search('invo')).total, 1);
      const corrected = await search('invocie');
      assert.equal(corrected.correctedQuery, 'invoice');
      assert.equal(corrected.results[0].id, base.id);
      assert.equal((await search('invoice', { format: 'pdf' })).total, 0);
      assert.equal(
        (await search('', { use: 'invoice', year: '2027' })).total,
        1,
      );
      assert.equal((await search('', { use: 'calendar' })).total, 0);
      await assert.rejects(() => search('', { year: '2025' }));
      assert.equal(
        (
          await search('invoice', {
            format: 'xlsx',
            category: base.primary_category_path,
          })
        ).total,
        1,
      );
      assert.equal((await search('" OR * NEAR(')).total, 0);
      await db
        .prepare("INSERT INTO delivery_holds VALUES('ta-invoice-001','hold')")
        .run();
      assert.equal((await search('invoice')).total, 0);
      await db.prepare('DELETE FROM delivery_holds').run();
      const changed = {
        ...base,
        title: 'Custom invoice',
        assets: { xlsx: { sha256: '2'.repeat(64) } },
      };
      await indexRelease(
        db,
        [changed],
        [{ path: base.primary_category_path, title: 'Finance', members: [] }],
      );
      assert.equal((await search('invoice')).total, 0);
    },
  );
});
