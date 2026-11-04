import collections from "../data/imported-collections.json" with { type: "json" };
import thumbnails from '../data/thumbnail-map.json' with { type: 'json' };
for (const collection of collections) for (const item of collection.items) {
  const thumbnail = thumbnails[item.id];
  if (thumbnail && !item.thumbnailAsset) { item.thumbnailAsset = thumbnail.asset; item.thumbnailSize = thumbnail.size; }
}
import { validateImportedEditorial } from './imported-editorial.mjs';
validateImportedEditorial(collections);
export { collections };
export const importedEntries = collections.flatMap((c) =>
  c.items.map((item) => ({ ...item, importedCollection: c.id })),
);
export const publicCatalogAssets = new Map(
  collections.flatMap((c) => [
    ...c.items.flatMap((item) => [
      [item.previewAsset.path, item.previewAsset],
      ...(item.thumbnailAsset ? [[item.thumbnailAsset.path, item.thumbnailAsset]] : []),
      ...(item.previewPages || []).map(page => [page.asset.path, page.asset]),
    ]),
    ...c.documents.map((document) => [document.path, document]),
  ]),
);
