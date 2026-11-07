import test from 'node:test';
import assert from 'node:assert/strict';
import {checkFormat,formatMimes,createExport} from '../../src/server/documents.mjs';
import {intent,deliver} from '../../src/server/delivery.mjs';

test('ODT originals are downloadable without claiming personal ODT generation',async()=>{
 assert.doesNotThrow(()=>checkFormat('odt'));
 assert.equal(formatMimes.odt,'application/vnd.oasis.opendocument.text');
 await assert.rejects(createExport({},'actor',{documentId:'00000000-0000-4000-8000-000000000000',documentRevision:1,format:'odt'},'test'),error=>error.message==='FORMAT_UNAVAILABLE');
});

test('HTML shortcuts are catalog downloads, not personal document exports',async()=>{
 assert.doesNotThrow(()=>checkFormat('html'));
 assert.equal(formatMimes.html,'text/html');
 await assert.rejects(createExport({},'actor',{documentId:'00000000-0000-4000-8000-000000000000',documentRevision:1,format:'html'},'test'),error=>error.message==='FORMAT_UNAVAILABLE');
});

test('a verified HTML shortcut with a charset parameter issues and delivers the original bytes',async()=>{
 const bytes=new TextEncoder().encode('<!doctype html><title>Document shortcut</title>');
 const checksum=await crypto.subtle.digest('SHA-256',bytes);
 const sha256=Buffer.from(checksum).toString('hex');
 const asset={id:'fixture-html',template_id:'fixture-template',format:'html',mime:'text/html; charset=utf-8',size_bytes:bytes.length,sha256,filename:'shortcut.html',object_key:'fixture.html'};
 const metadata={size:bytes.length,customMetadata:{sha256},checksums:{sha256:checksum}};
 const nonce='00000000-0000-4000-8000-000000000001';
 const env={DOWNLOAD_TOKEN_SECRET:'fixture-secret-for-signed-downloads',DB:{prepare(){return{bind(){return this;},async first(){return asset;}};}},ASSET_ORIGINALS:{async head(){return metadata;},async get(){return{...metadata,body:new Response(bytes).body};}},DOWNLOAD_ACTORS:{idFromName:()=> 'fixture',get:()=>({async fetch(url){return Response.json(url.endsWith('/intent')?{nonce,expiresAt:Math.floor(Date.now()/1000)+60}:url.endsWith('/resolve')?{asset:asset.id}:{});}})}};
 const identity={actor:'guest:fixture'};
 const issued=await intent(env,identity,{templateId:asset.template_id,format:'html'},'fixture-intent');
 const ticket=issued.url.split('/').at(-1);
 const response=await deliver(env,identity,ticket,new Request('https://atlas.example.test'+issued.url));
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),asset.mime);
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
 asset.mime='application/pdf; charset=utf-8';
 await assert.rejects(intent(env,identity,{templateId:asset.template_id,format:'html'},'wrong-mime'),error=>error.message==='FORMAT_UNAVAILABLE');
});
