import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assetShard } from '../src/lib/asset-shard.mjs';
import { validateImportedEditorial } from '../src/lib/imported-editorial.mjs';
import { zlibSync, strToU8 } from 'fflate';
import {homeFeaturedSlugs} from '../src/lib/home-featured.mjs';

function writeChanged(file, body) {
  let prior; try { prior=readFileSync(file,'utf8'); } catch {}
  if(prior!==body)writeFileSync(file,body);
}
const packed = (value) => Buffer.from(zlibSync(strToU8(JSON.stringify(value)),{level:9})).toString('base64');

// This small delivery index keeps image requests independent of the full editorial catalog.
export function preparePublicAssets() {
  const data = (name) => JSON.parse(readFileSync(new URL('../src/data/' + name, import.meta.url)));
  const collections = data('imported-collections.json');
  const thumbnails = data('thumbnail-map.json');
  validateImportedEditorial(collections);
  // Full source-bound approval evidence is checked above, and retained in the source catalog.
  // Requests need the accepted content and approval status, not a second copy of every paragraph.
  const runtime = collections.map(c => ({...c, documents:c.documents || [], items:c.items.map(item => ({...item,
    ...(!item.thumbnailAsset && thumbnails[item.id] ? {thumbnailAsset:thumbnails[item.id].asset,thumbnailSize:thumbnails[item.id].size} : {}),
    ...(item.editorial_review ? {editorial_review:{status:item.editorial_review.status}} : {}),
  }))}));
  const runtimeTarget = new URL('../src/data/imported-runtime.json', import.meta.url);
  const runtimeOutput = JSON.stringify(runtime) + '\n';
  let oldRuntime;
  try { oldRuntime = readFileSync(runtimeTarget, 'utf8'); } catch {}
  if (oldRuntime !== runtimeOutput) writeFileSync(runtimeTarget, runtimeOutput);
  const releases=new Map(data('release.json').map(item=>[item.id,item]));
  const merged=new Map(data('seeds.json').flatMap(seed=>releases.has(seed.seed_id)?[[seed.seed_id,{...seed,...releases.get(seed.seed_id)}]]:[]));
  for(const c of runtime)for(const item of c.items)merged.set(item.id,item);
  const featuredIds=homeFeaturedSlugs.map(slug=>{
    const item=[...merged.values()].find(item=>item.topic_slug===slug);
    if(!item)throw Error('Missing homepage selection: '+slug);
    return item.id;
  });
  writeChanged(new URL('../src/data/home-snapshot.json',import.meta.url),JSON.stringify({path:'/render-snapshots/home/',featuredIds})+'\n');
  // Keep the shared route/card index small. Detailed content is decoded only for
  // the requested collection; it must never be parsed in every API/actor isolate.
  const cardFields = ['id','seed_id','topic_path','topic_slug','detail_path','display_title','title','primary_category_path','builder_kind','year','summary','formats','preview','previewSize','thumbnailSize','pages','third_party_photography'];
  const index=runtime.map(({items,...collection})=>({...collection,items:items.map(item=>({
    ...Object.fromEntries(cardFields.filter(key=>Object.hasOwn(item,key)).map(key=>[key,item[key]])),
    ...(item.thumbnailAsset ? {thumbnailAsset:{path:item.thumbnailAsset.path}} : {}),
    ...(item.previewPages ? {previewPages:item.previewPages.map(page=>({url:page.url}))} : {}),
  }))}));
  const contentDirectory=new URL('../src/data/imported-runtime-parts/',import.meta.url);
  mkdirSync(contentDirectory,{recursive:true});
  const collectionLoaders=[];
  for(const collection of runtime){
    if(!/^[-a-z0-9]+$/.test(collection.id))throw Error('Invalid collection ID');
    writeChanged(new URL(collection.id+'.mjs',contentDirectory),'export default '+JSON.stringify(packed(collection))+';\n');
    collectionLoaders.push(`  ${JSON.stringify(collection.id)}: () => import('./imported-runtime-parts/${collection.id}.mjs')`);
  }
  writeChanged(new URL('../src/data/imported-card-index.mjs',import.meta.url),'export default '+JSON.stringify(packed(index))+';\n');
  writeChanged(new URL('../src/data/imported-collection-loaders.mjs',import.meta.url),'export default {\n'+collectionLoaders.join(',\n')+'\n};\n');
  const assets = new Map();
  const add = (asset) => { if (asset) assets.set(asset.path, asset); };
  for (const collection of collections) {
    for (const item of collection.items) {
      add(item.previewAsset);
      add(item.thumbnailAsset || thumbnails[item.id]?.asset);
      for (const page of item.previewPages || []) add(page.asset);
    }
    for (const document of collection.documents || []) add(document);
  }
  const rows = [...assets].map(([path, a]) => [path, a.key, a.sha256, a.bytes, a.mime]);
  const target = new URL('../src/data/public-assets-index.json', import.meta.url);
  const output = JSON.stringify(rows) + '\n';
  let current;
  try { current = readFileSync(target, 'utf8'); } catch {}
  if (current !== output) writeFileSync(target, output);
  const directory = new URL('../src/data/public-assets-shards/', import.meta.url);
  mkdirSync(directory, {recursive:true});
  const groups = Array.from({length:64},()=>[]);
  for (const row of rows) groups[parseInt(assetShard(row[0]),16)].push(row);
  const loaders=[];
  for(let n=0;n<64;n++){
    const key=n.toString(16).padStart(2,'0'),file=new URL(key+'.json',directory),body=JSON.stringify(groups[n])+'\n';
    let prior;try{prior=readFileSync(file,'utf8')}catch{}
    if(prior!==body)writeFileSync(file,body);
    loaders.push(`  '${key}': () => import('./public-assets-shards/${key}.json', {with:{type:'json'}})`);
  }
  writeFileSync(new URL('../src/data/public-asset-loaders.mjs',import.meta.url),'export default {\n'+loaders.join(',\n')+'\n};\n');
  return rows.length;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log('Public delivery index: ' + preparePublicAssets() + ' assets');
