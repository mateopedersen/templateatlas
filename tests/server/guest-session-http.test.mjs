import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('local workerd bounds repeated no-cookie sessions before allocating visitor objects', async (t) => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const built = await build({
    stdin: {
      resolveDir: root,
      contents: `
      import {handleApi} from './src/server/index.mjs';
      export {DownloadActor} from './src/server/index.mjs';
      export default { async fetch(request,env,ctx) {
        const calls=[], namespace=env.DOWNLOAD_ACTORS;
        const tracked={
          idFromName(name){calls.push(name);return namespace.idFromName(name)},
          get(id){return namespace.get(id)}
        };
        const response=await handleApi(request,{...env,DOWNLOAD_ACTORS:tracked},ctx);
        const result=new Response(response.body,response);
        result.headers.set('x-test-actor-calls',JSON.stringify(calls));
        return result;
      }};`,
    },
    platform: 'browser',
    bundle: true,
    format: 'esm',
    write: false,
    conditions: ['workerd', 'worker', 'browser'],
    external: ['node:*'],
  });
  const origin = 'https://atlas-session.example.test';
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: built.outputFiles[0].text,
      compatibilityDate: '2026-10-01',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['DB'],
      durableObjects: {
        DOWNLOAD_ACTORS: { className: 'DownloadActor', useSQLite: true },
      },
      bindings: {
        DEPLOY_STAGE: 'production',
        PUBLIC_SITE_URL: origin,
        AUTH_SECRET: randomBytes(32).toString('hex'),
        GUEST_COOKIE_SIGNING_KEY: randomBytes(32).toString('hex'),
      },
    }),
  );
  t.after(() => mf.dispose());
  const req = (path = '/api/session', cookie = '', ip = '198.51.100.7') =>
    mf.dispatchFetch(origin + path, {
      headers: { cookie, 'cf-connecting-ip': ip },
    });
  const calls = (response) =>
    JSON.parse(response.headers.get('x-test-actor-calls'));
  const first = await req();
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.user, null);
  assert.equal(firstBody.freeUsed, 0);
  assert.equal(firstBody.freeLimit, 5);
  assert.equal(firstBody.premium, false);
  assert.equal(firstBody.trialEndsAt, null);
  const cookie = first.headers.get('set-cookie').split(';')[0];
  assert.match(
    first.headers.get('set-cookie'),
    /Secure; HttpOnly; SameSite=Lax/,
  );
  assert.deepEqual(calls(first), ['system:guest-session-admission:v1']);
  // This burst targets only the isolated local workerd, never the live site.
  const burst = await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      req(i % 2 ? '/api/session/' : '/api/session'),
    ),
  );
  assert.equal(burst.filter((response) => response.status === 200).length, 29);
  assert.equal(burst.filter((response) => response.status === 429).length, 11);
  for (const response of burst) {
    assert.deepEqual(calls(response), ['system:guest-session-admission:v1']);
    if (response.status === 429) {
      assert.equal(response.headers.get('set-cookie'), null);
      assert.ok(Number(response.headers.get('retry-after')) > 0);
      assert.equal((await response.json()).code, 'RATE_LIMITED');
    }
  }
  const existing = await req('/api/session', cookie);
  assert.equal(existing.status, 200);
  assert.equal(existing.headers.get('set-cookie'), null);
  assert.deepEqual(calls(existing), [
    'guest:' + cookie.split('=')[1].split('.')[0],
  ]);
  assert.equal((await existing.json()).freeLimit, 5);
  const otherNetwork = await req('/api/session', '', '198.51.100.8');
  assert.equal(otherNetwork.status, 200);
  assert.deepEqual(calls(otherNetwork), ['system:guest-session-admission:v1']);
});
