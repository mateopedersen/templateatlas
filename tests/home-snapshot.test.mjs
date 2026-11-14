import test from 'node:test';import assert from 'node:assert/strict';
import {homeSnapshot} from '../src/server/home-snapshot.mjs';
import manifest from '../src/data/home-snapshot.json' with {type:'json'};
test('anonymous home snapshot checks current publication and all featured holds before serving',async()=>{
 let reads=0;const env={DEPLOY_STAGE:'production',ASSETS:{async fetch(r){reads++;assert.equal(new URL(r.url).pathname,manifest.path);return new Response('<html>Home</html>',{headers:{'content-type':'text/html'}})}}};
 const request=(path='/',headers={})=>new Request('https://templateatlas.com'+path,{headers});
 const ready=async()=>({ready:true,held:new Set()});
 const response=await homeSnapshot(request(),env,ready);assert.equal(response.status,200);assert.equal(response.headers.get('x-templateatlas-home'),'snapshot');assert.equal(reads,1);
 for(const id of manifest.featuredIds){assert.equal(await homeSnapshot(request(),env,async()=>({ready:true,held:new Set([id])})),null)}assert.equal(reads,1);
 for(const req of [request('/?page=1'),request('/templates/'),request('/',{cookie:'__Secure-better-auth.session_token=member'}),request('/',{authorization:'Bearer member'})])assert.equal(await homeSnapshot(req,env,()=>{throw Error('Must not read public state')}),null);
 assert.equal((await homeSnapshot(request(),env,async()=>({ready:false,held:new Set()}))).status,503);
 assert.equal((await homeSnapshot(request(),env,async()=>{throw Error('DB unavailable')})).status,503);
 env.ASSETS.fetch=async()=>new Response('missing',{status:404});assert.equal(await homeSnapshot(request(),env,ready),null);
});
