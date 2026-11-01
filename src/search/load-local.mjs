import { readFile } from 'node:fs/promises';
import { getPlatformProxy } from 'wrangler';
import { entries, categories } from '../lib/catalog.mjs';
import { indexRelease } from './indexer.mjs';
const paper = process.argv[2]
  ? JSON.parse(await readFile(process.argv[2], 'utf8'))
  : {};
const platform = await getPlatformProxy({
  configPath: 'wrangler.jsonc',
  persist: true,
  remoteBindings: false,
});
try {
  console.log(
    JSON.stringify(
      await indexRelease(platform.env.DB, entries, categories, paper),
    ),
  );
} finally {
  await platform.dispose();
}
