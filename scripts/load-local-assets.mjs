// Load verified original bytes only into local workerd storage. This command has no remote mode.
import {getPlatformProxy} from 'wrangler';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import catalog from '../src/data/release.json' with {type:'json'};
const hex=v=>createHash('sha256').update(v).digest('hex');
const inputs=process.argv.slice(2);
if(!inputs.length)throw Error('Supply private receipt indexes.');
const records=new Map(catalog.map(x=>[x.id,x]));
const platform=await getPlatformProxy({configPath:'wrangler.jsonc',persist:true,remoteBindings:false});
try{
 let items=0,uploads=0;
 for(const path of inputs){for(const r of JSON.parse(await readFile(path,'utf8'))){const release=records.get(r.id);if(!release)continue;
  const version=hex(JSON.stringify(release.assets)).slice(0,20);
  // The entire format set changes atomically; the history trigger retains the prior bytes.
  const statements=[platform.env.DB.prepare('UPDATE downloadable_assets SET published=0 WHERE template_id=? AND published=1 AND version<>?').bind(r.id,version)];
  for(const [format,declared] of Object.entries(release.assets)){
   const f=r.files[format],bytes=await readFile(f.path);if(f.sha256!==declared.sha256||hex(bytes)!==f.sha256||bytes.length!==declared.bytes)throw Error('Invalid receipt: '+r.id);
   const key='catalog/'+r.id+'/'+f.sha256+'.'+format,existing=await platform.env.ASSET_ORIGINALS.head(key);
   if(existing?.customMetadata?.sha256!==f.sha256||existing.size!==bytes.length){await platform.env.ASSET_ORIGINALS.put(key,bytes,{sha256:f.sha256,httpMetadata:{contentType:f.mime},customMetadata:{sha256:f.sha256}});uploads++;}
   const id=hex([r.id,format,f.sha256].join('/'));statements.push(platform.env.DB.prepare('UPDATE downloadable_assets SET published=0 WHERE template_id=? AND format=? AND id<>?').bind(r.id,format,id),platform.env.DB.prepare('INSERT INTO downloadable_assets(id,template_id,version,format,object_key,sha256,size_bytes,filename,mime,published) VALUES(?,?,?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET version=excluded.version,published=1').bind(id,r.id,version,format,key,f.sha256,bytes.length,r.slug+'.'+format,f.mime));
  }
  await platform.env.DB.batch(statements);items++;
 }}
 console.log(JSON.stringify({target:'local',templates:items,objectsWritten:uploads}));
}finally{await platform.dispose();}

