import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateImportedEditorial } from '../src/lib/imported-editorial.mjs';

// This small delivery index keeps image requests independent of the full editorial catalog.
export function preparePublicAssets() {
  const data = (name) => JSON.parse(readFileSync(new URL('../src/data/' + name, import.meta.url)));
  const collections = data('imported-collections.json');
  const thumbnails = data('thumbnail-map.json');
  validateImportedEditorial(collections);
  // Full source-bound approval evidence is checked above, and retained in the source catalog.
  // Requests need the accepted content and approval status, not a second copy of every paragraph.
  const runtime = collections.map(c => ({...c, items:c.items.map(item => ({...item,
    ...(item.editorial_review ? {editorial_review:{status:item.editorial_review.status}} : {}),
  }))}));
  const runtimeTarget = new URL('../src/data/imported-runtime.json', import.meta.url);
  const runtimeOutput = JSON.stringify(runtime) + '\n';
  let oldRuntime;
  try { oldRuntime = readFileSync(runtimeTarget, 'utf8'); } catch {}
  if (oldRuntime !== runtimeOutput) writeFileSync(runtimeTarget, runtimeOutput);
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
  return rows.length;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log('Public delivery index: ' + preparePublicAssets() + ' assets');
