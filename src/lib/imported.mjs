import collections from "../data/imported-collections.json" with { type: "json" };
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
      ...(item.previewPages || []).map(page => [page.asset.path, page.asset]),
    ]),
    ...c.documents.map((document) => [document.path, document]),
  ]),
);
