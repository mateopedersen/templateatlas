import test from 'node:test';
import assert from 'node:assert/strict';
import { publicPage, publicPageKey } from '../src/server/public-page-cache.mjs';
const env = { DEPLOY_STAGE: 'production' };
const request = (path = '/', options) => new Request('https://templateatlas.com' + path, options);

test('only public, anonymous GET/HEAD pages share an edge cache entry', () => {
  for (const path of ['/', '/templates/agency-agreement/', '/categories/charts-graphs/', '/tools/calendar-2027/']) {
    assert.ok(publicPageKey(request(path), env, 'v1'));
    assert.ok(publicPageKey(request(path, {headers:{cookie:'ta_guest=quota-cookie'}}), env, 'v1'));
  }
  for (const path of ['/account/', '/signin/', '/signup/', '/api/session', '/admin/', '/search/?q=private', '/create/chart/', '/templates/?page=2'])
    assert.equal(publicPageKey(request(path), env, 'v1'), null);
  for (const headers of [{cookie:'__Secure-better-auth.session_token=secret'}, {cookie:'better-auth.session_data=secret'}, {authorization:'Bearer secret'}, {range:'bytes=0-10'}, {'cache-control':'no-store'}])
    assert.equal(publicPageKey(request('/', {headers}), env, 'v1'), null);
  assert.equal(publicPageKey(request('/', {method:'POST'}), env, 'v1'), null);
  assert.equal(publicPageKey(request(), {DEPLOY_STAGE:'local'}, 'v1'), null);
  assert.notEqual(publicPageKey(request(), env, 'v1').url, publicPageKey(request(), env, 'v2').url);
});

test('GET and HEAD reuse complete HTML; the browser revalidates and cache lives for at most 60 seconds', async () => {
  const entries = new Map(), tasks = [];
  const cache = {match:async r=>entries.get(r.url)?.clone(), put:async (r,s)=>entries.set(r.url,s)};
  const ctx = {waitUntil:p=>tasks.push(p)};
  let calls = 0;
  const render = async r=>{calls++;assert.equal(r.method,'GET');return new Response('<html>public</html>',{headers:{'Content-Type':'text/html'}});};
  const first = await publicPage(request('/',{method:'HEAD'}),env,ctx,'v1',render,cache);
  assert.equal(first.headers.get('x-templateatlas-cache'),'MISS');
  assert.equal(await first.text(),'');await Promise.all(tasks);
  assert.equal([...entries.values()][0].headers.get('cache-control'),'public, max-age=60');
  const next = await publicPage(request(),env,ctx,'v1',render,cache);
  assert.equal(next.headers.get('x-templateatlas-cache'),'HIT');
  assert.equal(next.headers.get('cache-control'),'public, max-age=0, must-revalidate');
  assert.equal(await next.text(),'<html>public</html>');assert.equal(calls,1);
});

test('personalized, unavailable and non-HTML responses never enter the public cache', async () => {
  for (const response of [new Response('unavailable',{status:503}), new Response('missing',{status:404}),new Response('{}',{headers:{'content-type':'application/json'}}),new Response('private',{headers:{'content-type':'text/html','set-cookie':'session=secret'}})]) {
    const cache = {match:async()=>null,put:async()=>assert.fail('Private/error response cached')};
    await publicPage(request(),env,{waitUntil:()=>assert.fail('Cache write scheduled')},'v1',async()=>response,cache);
  }
});
