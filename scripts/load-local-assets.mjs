// Load verified original bytes only into local workerd storage. This command has no remote mode.
import { resolve, dirname } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import catalog from '../src/data/release.json' with { type: 'json' };
const hex = (v) => createHash('sha256').update(v).digest('hex');
const inputs = process.argv.slice(2);
if (!inputs.length) throw Error('Supply private receipt indexes.');
const records = new Map(catalog.map((x) => [x.id, x]));
const platform = await getPlatformProxy({
  configPath: 'wrangler.jsonc',
  persist: true,
  remoteBindings: false,
});
const owner = randomUUID(),
  revision = hex(await readFile('src/data/release.json'));
let acquired = false;
try {
  const claimed = await platform.env.DB.prepare(
    `INSERT INTO catalog_install(id,revision,ready,owner,lease_until) VALUES(1,?,0,?,unixepoch()+1800)
 ON CONFLICT(id) DO UPDATE SET ready=0,owner=excluded.owner,revision=excluded.revision,lease_until=excluded.lease_until
 WHERE catalog_install.owner IS NULL OR catalog_install.lease_until<unixepoch()`,
  )
    .bind(revision, owner)
    .run();
  if (!claimed.meta.changes)
    throw Error('A catalog import is already in progress.');
  acquired = true;
  const complete = new Set();
  let items = 0,
    uploads = 0;
  for (const path of inputs) {
    for (const r of JSON.parse(await readFile(path, 'utf8'))) {
      const release = records.get(r.id);
      if (!release) continue;
      if (complete.has(r.id)) throw Error('Duplicate logical template.');
      const version = hex(JSON.stringify(release.assets)).slice(0, 20);
      // The entire format set changes atomically; the history trigger retains the prior bytes.
      const statements = [
        platform.env.DB.prepare(
          'UPDATE downloadable_assets SET published=0 WHERE template_id=? AND published=1 AND version<>?',
        ).bind(r.id, version),
      ];
      for (const [format, declared] of Object.entries(release.assets)) {
        const f = r.files[format],
          bytes = await readFile(resolve(dirname(path), f.path));
        if (
          f.sha256 !== declared.sha256 ||
          hex(bytes) !== f.sha256 ||
          bytes.length !== declared.bytes
        )
          throw Error('Invalid receipt: ' + r.id);
        const key = 'catalog/' + r.id + '/' + f.sha256 + '.' + format,
          existing = await platform.env.ASSET_ORIGINALS.head(key);
        if (
          existing?.customMetadata?.sha256 !== f.sha256 ||
          existing.size !== bytes.length
        ) {
          await platform.env.ASSET_ORIGINALS.put(key, bytes, {
            sha256: f.sha256,
            httpMetadata: { contentType: f.mime },
            customMetadata: { sha256: f.sha256 },
          });
          uploads++;
        }
        const id = hex([r.id, format, f.sha256].join('/'));
        statements.push(
          platform.env.DB.prepare(
            'UPDATE downloadable_assets SET published=0 WHERE template_id=? AND format=? AND id<>?',
          ).bind(r.id, format, id),
          platform.env.DB.prepare(
            'INSERT INTO downloadable_assets(id,template_id,version,format,object_key,sha256,size_bytes,filename,mime,published) VALUES(?,?,?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET version=excluded.version,published=1',
          ).bind(
            id,
            r.id,
            version,
            format,
            key,
            f.sha256,
            bytes.length,
            r.slug + '.' + format,
            f.mime,
          ),
        );
      }
      await platform.env.DB.batch(statements);
      complete.add(r.id);
      items++;
    }
  }
  if (complete.size !== records.size)
    throw Error(
      'The private indexes do not cover the entire reviewed release.',
    );
  const expected = catalog.reduce(
    (n, r) => n + Object.keys(r.assets).length,
    0,
  );
  const enabled = await platform.env.DB.prepare(
    'SELECT count(*) AS n FROM downloadable_assets WHERE template_id IS NOT NULL AND published=1',
  ).first('n');
  if (expected !== enabled)
    throw Error('Published file count differs from the reviewed release.');
  const active = await platform.env.DB.prepare(
    'UPDATE catalog_install SET ready=1,owner=NULL,lease_until=0,topics=?,files=? WHERE id=1 AND owner=? AND revision=?',
  )
    .bind(items, expected, owner, revision)
    .run();
  if (!active.meta.changes) throw Error('The catalog lease changed.');
  console.log(
    JSON.stringify({
      target: 'local',
      templates: items,
      objectsWritten: uploads,
    }),
  );
} finally {
  if (acquired)
    await platform.env.DB.prepare(
      'UPDATE catalog_install SET owner=NULL,lease_until=0 WHERE id=1 AND owner=?',
    )
      .bind(owner)
      .run();
  await platform.dispose();
}
