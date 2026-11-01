// Reconcile every enabled catalog file against its actual private object, without logging private keys.
import {resolve} from 'node:path';import {getPlatformProxy} from 'wrangler';import {createHash} from 'node:crypto';import {writeFile} from 'node:fs/promises';import {entries} from '../src/lib/catalog.mjs';
const [stateDirectory,reportPath]=process.argv.slice(2);
const p=await getPlatformProxy({configPath:'wrangler.jsonc',persist:stateDirectory?{path:resolve(stateDirectory,'v3')}:true,remoteBindings:false});
try{
 const rows=(await p.env.DB.prepare('SELECT template_id,format,object_key,sha256,size_bytes,mime FROM downloadable_assets WHERE published=1 AND document_id IS NULL').all()).results;
 const indexed=new Map(rows.map(x=>[x.template_id+'/'+x.format,x]));let verified=0;const failures=[];const types={};
 for(const e of entries){for(const [fmt,f] of Object.entries(e.assets)){
   const row=indexed.get(e.id+'/'+fmt);if(!row||row.sha256!==f.sha256||row.size_bytes!==f.bytes||row.mime!==f.mime){failures.push(e.id+'/'+fmt);continue;}
   const obj=await p.env.ASSET_ORIGINALS.get(row.object_key);if(!obj||obj.size!==row.size_bytes||obj.customMetadata?.sha256!==f.sha256||createHash('sha256').update(new Uint8Array(await obj.arrayBuffer())).digest('hex')!==f.sha256){failures.push(e.id+'/'+fmt);continue;}verified++;types[fmt]=(types[fmt]||0)+1;
 }}
 const report={source:'local private store',templates:entries.length,enabledFiles:rows.length,verifiedFiles:verified,formats:types,failures};if(reportPath)await writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(failures.length||rows.length!==verified)process.exitCode=1;
}finally{await p.dispose();}
