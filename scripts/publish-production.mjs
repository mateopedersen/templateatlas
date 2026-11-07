import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { importedEntries } from "../src/lib/imported.mjs";
import { entries } from "../src/lib/catalog.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (name) => readFileSync(resolve(root, name), "utf8");
const run = (binary, args, extra = {}) =>
  execFileSync(resolve(root, "node_modules/.bin", binary), args, {
    cwd: root,
    stdio: "inherit",
    ...extra,
  });
const runAsync = (binary, args, extra = {}) => new Promise((done, reject) => {
  const child = spawn(resolve(root, "node_modules/.bin", binary), args, {
    cwd: root, stdio: "inherit", ...extra,
  });
  child.once("error", reject);
  child.once("close", (code) => code === 0 ? done() : reject(new Error(`${binary} exited with ${code}`)));
});
const config = JSON.parse(read("wrangler.production.jsonc"));
const env = {
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID: config.account_id,
  TEMPLATEATLAS_TARGET: "production",
};
const release = read("src/data/release.json");
const revision = createHash("sha256").update(release).digest("hex");
assert.equal(revision, JSON.parse(read("src/data/release-id.json")).sha256);
const topics = JSON.parse(release);
const homeFeaturedSlugs = [
  "project-proposal", "business-proposal", "budget-proposal", "consulting-proposal",
  "invoice", "photography-invoice", "consulting-invoice", "service-invoice",
  "january-2027-calendar", "2027-us-holidays-calendar", "2027-monthly-planner", "2027-birthday-calendar",
  "line-chart", "scatter-plot", "heatmap", "pie-chart",
  "meeting-agenda", "corporate-meeting-minutes", "conference-agenda", "board-meeting-agenda",
  "college-resume", "acting-resume", "curriculum-vitae", "customer-service-resume",
];
const homeFeaturedIds = homeFeaturedSlugs.map((slug) => {
  const item = entries.find((entry) => entry.topic_slug === slug);
  assert.ok(item, `Missing static homepage item: ${slug}`);
  assert.match(item.id, /^[-a-z0-9]+$/);
  return "'" + item.id + "'";
}).join(",");
const supplementFiles = importedEntries.reduce(
  (n, e) => n + Object.keys(e.assets).length,
  0,
);
const projectedFiles = new Map(
  topics.map((entry) => [entry.id, Object.keys(entry.assets || {}).length]),
);
for (const entry of importedEntries)
  projectedFiles.set(entry.id, Object.keys(entry.assets || {}).length);
const projectedAvailable = [...projectedFiles.values()].reduce((sum, count) => sum + count, 0);
const baseIds = topics
  .map((e) => {
    assert.match(e.id, /^[-a-z0-9]+$/);
    return "'" + e.id + "'";
  })
  .join(",");
const files = topics.reduce(
  (sum, item) => sum + Object.keys(item.assets).length,
  0,
);
assert.equal(config.name, "templateatlas");
assert.equal(config.vars.PUBLIC_SITE_URL, "https://templateatlas.com");
assert.equal(config.vars.DEPLOY_STAGE, "production");
const sql =
  "SELECT ready,revision,topics,files,(SELECT count(*) FROM downloadable_assets WHERE template_id IS NOT NULL AND published=1) AS available,(SELECT count(*) FROM search_templates WHERE revision=(SELECT revision FROM search_active WHERE id=1) AND template_id IN (" +
  baseIds +
  ")) AS indexed,(SELECT count(*) FROM delivery_holds WHERE template_id IN (" + homeFeaturedIds + ")) AS home_held FROM catalog_install WHERE id=1";
// The optional remote binding uses the same authenticated Cloudflare account.
// Validate its target before opening it; every release gate below remains active.
let platform;
if (process.env.TEMPLATEATLAS_D1_BINDINGS) {
  const path = resolve(root, process.env.TEMPLATEATLAS_D1_BINDINGS);
  const bindings = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(bindings.account_id, config.account_id);
  assert.equal(bindings.d1_databases?.length, 1);
  assert.equal(bindings.d1_databases[0].binding, "DB");
  assert.equal(bindings.d1_databases[0].database_id, config.d1_databases[0].database_id);
  assert.equal(bindings.d1_databases[0].remote, true);
  const { getPlatformProxy } = await import("wrangler");
  platform = await getPlatformProxy({configPath:path,persist:false,remoteBindings:true});
}
const query = async (statement) => platform
  ? (await platform.env.DB.prepare(statement).all()).results
  : JSON.parse(run("wrangler", ["d1", "execute", "DB", "--remote", "--config", "wrangler.production.jsonc", "--json", "--command", statement],
      {stdio:["ignore","pipe","inherit"],encoding:"utf8",env}))[0].results;
try {
assert.deepEqual(
  (await query(sql))[0],
  {
    ready: 1,
    revision,
    topics: topics.length,
    files,
    available: projectedAvailable,
    indexed: topics.length,
    home_held: 0,
  },
  "The remote catalog does not match this application release.",
);
if (importedEntries.length) {
  const actual = [];
  for (let offset = 0; offset < importedEntries.length; offset += 500) {
    const ids = importedEntries.slice(offset, offset + 500).map((entry) => {
      assert.match(entry.id, /^[-a-z0-9]+$/);
      return "'" + entry.id + "'";
    }).join(",");
    actual.push(...await query(
      "SELECT template_id,format,object_key,sha256,size_bytes,mime,published FROM downloadable_assets WHERE published=1 AND template_id IN (" +
        ids +
        ")",
    ));
    console.log("Verified production asset metadata: " + Math.min(offset + 500, importedEntries.length) + "/" + importedEntries.length + " templates");
  }
  assert.equal(actual.length, supplementFiles);
  for (const entry of importedEntries)
    for (const [format, asset] of Object.entries(entry.assets))
      assert.deepEqual(
        actual.find((a) => a.template_id === entry.id && a.format === format),
        {
          template_id: entry.id,
          format,
          object_key: "catalog/" + entry.id + "/" + asset.sha256 + "." + format,
          sha256: asset.sha256,
          size_bytes: asset.bytes,
          mime: asset.mime,
          published: 1,
        },
      );
}
const searchRelease = JSON.parse(read("src/data/search-release-id.json"));
assert.match(searchRelease.sha256, /^[a-f0-9]{64}$/);
assert.equal(
  searchRelease.expected,
  new Set([...topics.map((entry) => entry.id), ...importedEntries.map((entry) => entry.id)]).size,
);
const searchState = (await query(
  "SELECT expected,completed,(SELECT count(*) FROM search_templates WHERE revision='" +
    searchRelease.sha256 +
    "') AS actual,(SELECT count(*) FROM search_templates t LEFT JOIN search_fts_docsize d ON d.id=t.row_id WHERE t.revision='" +
    searchRelease.sha256 + "' AND d.id IS NULL) AS missing_fts,(SELECT count(*) FROM sqlite_master WHERE type='trigger' AND name='search_new') AS search_trigger FROM search_releases WHERE revision='" +
    searchRelease.sha256 +
    "'",
))[0];
assert.equal(searchState.expected, searchRelease.expected);
assert.equal(searchState.actual, searchRelease.expected);
assert.ok(searchState.completed);
assert.equal(searchState.missing_fts, 0, "The full-text index must cover the complete release.");
assert.equal(searchState.search_trigger, 1, "The search insert trigger must be installed.");
const activeSearch = (await query("SELECT revision FROM search_active WHERE id=1"))[0]
  .revision;
if (searchRelease.previousSha256 && activeSearch !== searchRelease.sha256) assert.equal(activeSearch, searchRelease.previousSha256, "The active production search changed after the preserved snapshot was captured.");
await runAsync("astro", ["build"], { env });
// The homepage is rendered by the Worker and cached at the edge. Inspect the
// compiled layout rather than requiring a prerendered index.html artifact.
const layouts = readdirSync(resolve(root, "dist/server/chunks"))
  .filter((name) => name.endsWith(".mjs"))
  .map((name) => read("dist/server/chunks/" + name))
  .filter((source) => source.includes("data-check-session"));
assert.ok(layouts.some((source) => source.includes('<html lang="en-US">') && source.includes("noindex, follow, noimageindex")), "The compiled public layout must retain US English and noindex metadata.");
assert.match(read("src/pages/index.astro"), /checkSession=\{true\}/);
const compiled = JSON.parse(read("dist/server/wrangler.json"));
assert.equal(compiled.account_id, config.account_id);
assert.deepEqual(compiled.routes, config.routes);
assert.equal(
  compiled.d1_databases[0].database_id,
  config.d1_databases[0].database_id,
);
assert.equal(compiled.name, config.name);
assert.deepEqual(compiled.r2_buckets, config.r2_buckets);
await runAsync("wrangler", ["deploy", "--config", "dist/server/wrangler.json"], { env });
if (activeSearch !== searchRelease.sha256)
  await query(
    "UPDATE search_active SET revision='" +
      searchRelease.sha256 +
      "' WHERE id=1 AND revision='" +
      activeSearch +
      "'",
  );
assert.equal(
  (await query("SELECT revision FROM search_active WHERE id=1"))[0].revision,
  searchRelease.sha256,
  "Search changed concurrently after deployment.",
);
console.log("Published search entries: " + searchRelease.expected);

} finally { await platform?.dispose(); }
