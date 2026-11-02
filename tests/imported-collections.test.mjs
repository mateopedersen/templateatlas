import test from 'node:test';
import assert from 'node:assert/strict';
import {collections,importedEntries,publicCatalogAssets} from '../src/lib/imported.mjs';
import {entries,byPath,categories} from '../src/lib/catalog.mjs';
import {catalogAsset} from '../src/server/catalog-assets.mjs';
import {searchRows} from '../src/search/indexer.mjs';
import {checkFormat} from '../src/server/documents.mjs';

test('R134a import has 100 distinct paired designs and stable detail paths',()=>{
 const r134a = importedEntries.filter(e=>e.importedCollection === "r134a-dimensional");
 assert.equal(r134a.length,100);
 for(const field of ['id','title','summary','detail_path'])assert.equal(new Set(r134a.map(e=>e[field])).size,100,field);
 assert.equal(entries.length,1346);
 for(const e of importedEntries){assert.equal(byPath.get(e.detail_path).id,e.id);assert.deepEqual(e.formats,e.importedCollection==='100-envelope-savings'?['pdf','webp','docx']:['pdf','webp']);assert.equal(e.assets.pdf.mime,'application/pdf');assert.equal(e.assets.webp.mime,'image/webp');if(e.importedCollection==='100-envelope-savings'){assert.equal(e.assets.docx.mime,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');assert.match(e.assets.docx.sha256,/^[0-9a-f]{64}$/);}assert.match(e.preview,/^https:\/\/assets\.templateatlas\.com\//);assert.equal(e.preview.includes(e.assets.webp.sha256),false);}
 checkFormat('webp');
 assert.equal(collections[0].items.reduce((n,e)=>n+e.rows,0),5780);
});
test('each imported search result points to its own design',()=>{
 const rows=searchRows(importedEntries,categories);
 for(let i=0;i<rows.length;i++)assert.equal(rows[i].path,importedEntries.find(e=>e.id===rows[i].id).detail_path);
});
const noCache={match:async()=>null,put:async()=>{}};
test('public asset host never exposes arbitrary originals or API paths',async()=>{
 let calls=0;const env={ASSET_ORIGINALS:{get:async()=>{calls++;}}};
 for(const path of ['/catalog/ta-r134a-dimensional-001/file.pdf','/api/session','/unknown.webp'])assert.equal((await catalogAsset(new Request('https://assets.templateatlas.com'+path),env,{waitUntil(){}},noCache)).status,404);
 assert.equal(calls,0);assert.equal(publicCatalogAssets.size,202);
});
test('R2 preview delivery uses only the allowlisted object and immutable cache headers',async()=>{
 const [path,asset]=publicCatalogAssets.entries().next().value;const keys=[];
 const env={ASSET_ORIGINALS:{get:async key=>{keys.push(key);return{size:asset.bytes,customMetadata:{sha256:asset.sha256},httpMetadata:{contentType:asset.mime},body:new Response(new Uint8Array(asset.bytes)).body};}}};
 const tasks=[];const response=await catalogAsset(new Request('https://assets.templateatlas.com'+path),env,{waitUntil:p=>tasks.push(p)},noCache);
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');assert.match(response.headers.get('cache-control'),/immutable/);assert.equal(response.headers.get('set-cookie'),null);assert.deepEqual(keys,[asset.key]);assert.equal((await response.arrayBuffer()).byteLength,asset.bytes);await Promise.all(tasks);
 const head=await catalogAsset(new Request('https://assets.templateatlas.com'+path,{method:'HEAD'}),env,{waitUntil(){}},noCache);assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),String(asset.bytes));
});
test('missing or mismatched R2 preview metadata is never cached or released',async()=>{
 const [path,asset]=publicCatalogAssets.entries().next().value;
 const env={ASSET_ORIGINALS:{get:async()=>({size:asset.bytes,customMetadata:{sha256:'wrong'},httpMetadata:{contentType:asset.mime},body:new Response('bad').body})}};
 const response=await catalogAsset(new Request('https://assets.templateatlas.com'+path),env,{waitUntil(){assert.fail('Invalid response was cached');}},noCache);
 assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
});
