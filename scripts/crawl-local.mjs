// Read public pages and aliases on a loopback host. No authentication is needed for this crawl.
import { writeFile } from 'node:fs/promises';
import routes from '../src/data/routes.json' with { type: 'json' };
import aliases from '../src/data/aliases.json' with { type: 'json' };
import { entries } from '../src/lib/catalog.mjs';
const [base, report] = process.argv.slice(2),
  host = new URL(base);
if (!['localhost', '127.0.0.1'].includes(host.hostname) || !report)
  throw Error('A local origin and report path are required.');
const failures = [],
  counts = {},
  rollup = {};
const topics = new Map(
  entries.flatMap((e) => [
    [e.topic_path, e],
    [e.detail_path, e],
  ]),
);
let ix = 0;
const paths = Object.entries(routes);
async function next() {
  for (;;) {
    const item = paths[ix++];
    if (!item) break;
    const [p, role] = item,
      r = await fetch(new URL(p, host), { redirect: 'manual' }),
      html = await r.text(),
      admin = p.startsWith('/admin/');
    const status = admin ? 403 : 200;
    counts[r.status] = (counts[r.status] || 0) + 1;
    rollup[role] = (rollup[role] || 0) + 1;
    if (
      r.status !== status ||
      (!admin &&
        (!/<html lang="en-US"/.test(html) ||
          !/<h1(?:\s[^>]*)?>/.test(html) ||
          !html.includes('https://templateatlas.com' + p)))
    )
      failures.push({
        p,
        status: r.status,
        issue: 'status, heading or canonical',
      });
    const e = topics.get(p);
    if (
      e &&
      (!html.includes(e.preview) ||
        !html.includes('data-download="' + e.id + '"'))
    )
      failures.push({ p, issue: 'template linkage' });
  }
}
await Promise.all(Array.from({ length: 8 }, next));
let ax = 0;
const redirects = Object.entries(aliases);
async function checkAlias() {
  for (;;) {
    const entry = redirects[ax++];
    if (!entry) break;
    const [a, b] = entry,
      r = await fetch(new URL(a, host), { redirect: 'manual' });
    if (r.status !== 301 || r.headers.get('location') !== new URL(b, host).href)
      failures.push({ p: a, issue: 'alias' });
    await r.body?.cancel();
  }
}
await Promise.all(Array.from({ length: 8 }, checkAlias));
const missing = await fetch(new URL('/unlisted-missing-example/', host));
if (missing.status !== 404) failures.push({ issue: 'unknown page not 404' });
const sm = await (await fetch(new URL('/sitemap.xml', host))).text();
const pathsInMap = [
  ...sm.matchAll(/<loc>https:\/\/templateatlas.com([^<]*)<\/loc>/g),
].map((m) => m[1]);
for (const p of pathsInMap)
  if (!Object.hasOwn(routes, p) || /^\/(account|admin|studio|search)\//.test(p))
    failures.push({ p, issue: 'sitemap' });
const result = {
  environment: 'local',
  fixedPaths: paths.length,
  aliases: redirects.length,
  sitemap: pathsInMap.length,
  counts,
  roles: rollup,
  failures,
  passed: !failures.length,
};
await writeFile(report, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, failures: failures.slice(0, 5) }));
if (failures.length) process.exitCode = 1;
