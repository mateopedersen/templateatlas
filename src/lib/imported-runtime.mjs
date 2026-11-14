import {unzlibSync, strFromU8} from 'fflate';
import packedIndex from '../data/imported-card-index.mjs';
import loaders from '../data/imported-collection-loaders.mjs';

function unpack(value) {
  return JSON.parse(strFromU8(unzlibSync(Uint8Array.from(atob(value),char=>char.charCodeAt(0)))));
}
export const collections=unpack(packedIndex);
export const importedEntries=collections.flatMap(c=>c.items.map(item=>({...item,importedCollection:c.id})));
const paths=new Map();
for(const c of collections){
  paths.set(c.topic_path,c.id);
  for(const item of c.items)if(item.detail_path)paths.set(item.detail_path,c.id);
}
const loaded=new Map(),pending=new Map();
export async function getImportedCollection(path) {
  const id=paths.get(path);
  if(!id)return undefined;
  if(loaded.has(id)){
    const collection=loaded.get(id);loaded.delete(id);loaded.set(id,collection);return collection;
  }
  if(pending.has(id))return pending.get(id);
  const task=loaders[id]().then(({default:value})=>{
    const collection=unpack(value);
    loaded.set(id,collection);
    // Immutable per-build data: retain at most two full collection payloads.
    while(loaded.size>2)loaded.delete(loaded.keys().next().value);
    return collection;
  });
  pending.set(id,task);
  try{return await task}finally{pending.delete(id)}
}
