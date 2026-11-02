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
 assert.equal(entries.length,1746);
 for(const e of importedEntries){assert.equal(byPath.get(e.detail_path).id,e.id);assert.deepEqual(e.formats,e.importedCollection==='commercial-lease-applications'?['pdf','webp','docx','odt']:['52-week-savings','tournament-brackets'].includes(e.importedCollection)?['pdf','webp','docx','xlsx']:['100-envelope-savings','dog-vaccination-records'].includes(e.importedCollection)?['pdf','webp','docx']:['pdf','webp']);assert.equal(e.assets.pdf.mime,'application/pdf');assert.equal(e.assets.webp.mime,'image/webp');if(['100-envelope-savings','dog-vaccination-records'].includes(e.importedCollection)){assert.equal(e.assets.docx.mime,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');assert.match(e.assets.docx.sha256,/^[0-9a-f]{64}$/);}assert.match(e.preview,/^https:\/\/assets\.templateatlas\.com\//);assert.equal(e.preview.includes(e.assets.webp.sha256),false);}
 checkFormat('webp');
 assert.equal(collections[0].items.reduce((n,e)=>n+e.rows,0),5780);
});
test('dog vaccination imports all 100 reviewed forms in three verified formats',()=>{
 const c=collections.find(c=>c.id==='dog-vaccination-records');
 assert.ok(c);assert.equal(c.kind,'pet-record');assert.equal(c.topic_path,'/templates/dog-vaccination-record/');
 assert.equal(c.items.length,100);assert.equal(new Set(c.items.map(e=>e.title)).size,100);assert.equal(new Set(c.items.map(e=>e.detail_path)).size,100);
 assert.equal(new Set(c.items.map(e=>e.edition)).size,20);assert.equal(c.items.filter(e=>e.color==='Color').length,75);assert.equal(c.items.filter(e=>e.color==='Black and White').length,25);
 assert.equal(c.items.reduce((n,e)=>n+e.formats.length,0),300);assert.equal(c.items.filter(e=>e.word_layout_adjusted).length,91);
 assert.ok(c.items.every(e=>e.pages===1&&e.pdf_fields>0&&e.docx_controls>0&&e.formats.join(',')==='pdf,webp,docx'));
 assert.ok(c.items.every(e=>e.primary_category_path==='/categories/health-medical/'&&e.editorial_review.status==='source-reviewed'));
});
test('each imported search result points to its own design',()=>{
 const rows=searchRows(importedEntries,categories);
 for(let i=0;i<rows.length;i++)assert.equal(rows[i].path,importedEntries.find(e=>e.id===rows[i].id).detail_path);
});
test('commercial applications expose all pages but keep all four originals private',async()=>{
 const c=collections.find(c=>c.id==='commercial-lease-applications');
 assert.equal(c.items.length,100);
 assert.equal(new Set(c.items.map(e=>e.subject)).size,20);
 assert.equal(new Set(c.items.map(e=>e.edition)).size,5);
 assert.equal(c.items.reduce((sum,e)=>sum+e.pages,0),251);
 assert.equal(c.items.filter(e=>e.color==='Color').length,30);
 assert.ok(c.items.slice(0,30).every(e=>e.color==='Color'));
 for(const e of c.items){
  assert.equal(e.previewPages.length,e.pages);
  assert.equal(e.preview,e.previewPages[0].url);
  assert.equal(e.assets.odt.mime,'application/vnd.oasis.opendocument.text');
  for(const [i,page]of e.previewPages.entries()){
   assert.equal(page.page,i+1);
   assert.equal(publicCatalogAssets.get(new URL(page.url).pathname).sha256,page.asset.sha256);
  }
  const response=await catalogAsset(new Request('https://assets.templateatlas.com/catalog/'+e.id+'/'+e.assets.odt.sha256+'.odt'),{}, {},{});
  assert.equal(response.status,404);
 }
});
const noCache={match:async()=>null,put:async()=>{}};
test('public asset host never exposes arbitrary originals or API paths',async()=>{
 let calls=0;const env={ASSET_ORIGINALS:{get:async()=>{calls++;}}};
 for(const path of ['/catalog/ta-r134a-dimensional-001/file.pdf','/api/session','/unknown.webp'])assert.equal((await catalogAsset(new Request('https://assets.templateatlas.com'+path),env,{waitUntil(){}},noCache)).status,404);
 assert.equal(calls,0);assert.equal(publicCatalogAssets.size,753);
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
