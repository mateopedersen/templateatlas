import {assetShard} from './asset-shard.mjs';
import loaders from '../data/public-asset-loaders.mjs';
const partitions = new Map();
export async function getPublicCatalogAsset(path) {
  const shard = assetShard(path);
  let pending = partitions.get(shard);
  if (!pending) {
    pending = loaders[shard]().then(({default:rows}) => new Map(rows.map(([path,key,sha256,bytes,mime]) => [path,{path,key,sha256,bytes,mime}])));
    partitions.set(shard,pending);
    pending.catch(() => {if(partitions.get(shard)===pending)partitions.delete(shard);});
  }
  return (await pending).get(path);
}
