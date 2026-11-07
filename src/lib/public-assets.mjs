import rows from '../data/public-assets-index.json' with { type: 'json' };
export const publicCatalogAssets = new Map(rows.map(([path, key, sha256, bytes, mime]) =>
  [path, { path, key, sha256, bytes, mime }],
));
