import test from 'node:test';import assert from 'node:assert/strict';
import {convertPrivate,outputFormats,rendererAvailable} from '../../src/native/renderer.mjs';
test('loopback conversion requires a local origin, secret, and port',()=>{
 const cfg={PUBLIC_SITE_URL:'http://localhost:4321',DEPLOY_STAGE:'local',RENDER_SECRET:'z'.repeat(40),LOCAL_RENDER_PORT:4892};
 assert.ok(rendererAvailable(cfg));for(const diff of [{DEPLOY_STAGE:'production'},{PUBLIC_SITE_URL:'https://example.com'},{RENDER_SECRET:''},{LOCAL_RENDER_PORT:'bad'},{LOCAL_RENDER_PORT:102}])assert.ok(!rendererAvailable({...cfg,...diff}));assert.deepEqual(outputFormats({},'svg'),['svg']);assert.deepEqual(outputFormats(cfg,'pptx'),['pptx','pdf','jpg']);assert.deepEqual(outputFormats(cfg,'docx'),['docx','pdf']);
});
test('authenticated service binding checks response MIME, byte count and file signature',async()=>{
 const source=new TextEncoder().encode('<svg/>'),secret='a'.repeat(40);let actual;
 const binding=body=>({RENDER_SECRET:secret,PRIVATE_RENDERER:{fetch:async req=>{actual=req;return new Response(body,{headers:{'content-type':'application/pdf','content-length':String(body.length)}});}}});
 assert.match(new TextDecoder().decode((await convertPrivate(binding('%PDF-1.4'),source,'svg','pdf')).bytes),/^%PDF-/);assert.equal(actual.headers.get('authorization'),'Bearer '+secret);assert.equal(actual.headers.get('x-source-format'),'svg');await assert.rejects(()=>convertPrivate(binding('<html/>'),source,'svg','pdf'));await assert.rejects(()=>convertPrivate({},source,'svg','pdf'));
});
