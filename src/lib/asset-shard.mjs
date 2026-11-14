// Delivery partition only, never an identity or integrity check.
export function assetShard(path) {
  let hash = 2166136261;
  for (let i = 0; i < path.length; i++) hash = Math.imul(hash ^ path.charCodeAt(i), 16777619);
  return (hash >>> 0 & 63).toString(16).padStart(2, '0');
}
