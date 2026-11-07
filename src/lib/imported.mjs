import sourceCollections from "../data/imported-collections.json" with { type: "json" };
import thumbnails from '../data/thumbnail-map.json' with { type: 'json' };
const collections = sourceCollections.map((collection) => ({...collection, documents: collection.documents || []}));
for (const collection of collections) for (const item of collection.items) {
  const thumbnail = thumbnails[item.id];
  if (thumbnail && !item.thumbnailAsset) { item.thumbnailAsset = thumbnail.asset; item.thumbnailSize = thumbnail.size; }
}
// The source catalog is validated by the mandatory build preparation and editorial gate.
// Production aliases its data to the smaller, content-equivalent runtime catalog.
export { collections };
export const importedEntries = collections.flatMap((c) =>
  c.items.map((item) => ({ ...item, importedCollection: c.id })),
);
export const publicCatalogAssets = new Map(
  collections.flatMap((c) => [
    ...c.items.flatMap((item) => [
      ...(item.previewAsset?.path ? [[item.previewAsset.path, item.previewAsset]] : []),
      ...(item.thumbnailAsset ? [[item.thumbnailAsset.path, item.thumbnailAsset]] : []),
      ...(item.previewPages || []).filter(page => page.asset?.path).map(page => [page.asset.path, page.asset]),
    ]),
    ...(c.documents || []).map((document) => [document.path, document]),
  ]),
);
