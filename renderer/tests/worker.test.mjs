import test from 'node:test';import assert from 'node:assert/strict';import {gateway,proxy,transportToken} from '../handler.mjs';
const secret='s'.repeat(45),payload=new TextEncoder().encode('<svg/>');
const request=(over={})=>new Request('https://private-renderer.internal/v1/render',{method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/octet-stream','x-source-format':'svg','x-output-format':'pdf',...over},body:payload});
test('rejects unauthorized or malformed requests before waking the container',async()=>{
 for(const r of [request({authorization:'Bearer wrong'}),request({'x-source-format':'url'}),request({'content-length':'8100000'}),new Request('https://public.example/v1/render')])assert.ok((await gateway(r,{RENDER_SECRET:secret})).status>=400);
});
test('private render disables networking, goes idle and returns bytes using a separate transport token',async()=>{
 let start,timeout,conversions=0;const key=await transportToken(secret);
 const container={running:false,start(v){start=v;this.running=true;},async setInactivityTimeout(v){timeout=v;},getTcpPort(n){assert.equal(n,8080);return {async fetch(url,opts){assert.equal(opts.headers.authorization,'Bearer '+key);if(url.endsWith('/health'))return new Response('ready');conversions++;assert.deepEqual(new Uint8Array(opts.body),payload);return new Response('%PDF-1.4',{headers:{'content-type':'application/pdf','content-length':'8'}});}};}};
 const env={RENDER_SECRET:secret,RENDER_INSTANCES:{idFromName:id=>id,get:()=>({fetch:r=>proxy(container,r,secret)})}};
 const out=await gateway(request(),env);assert.equal(out.status,200);assert.equal(await out.text(),'%PDF-1.4');assert.equal(conversions,1);assert.equal(start.enableInternet,false);assert.notEqual(key,secret);assert.equal(timeout,120000);
});
