import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { importedEntries } from "../src/lib/imported.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (name) => readFileSync(resolve(root, name), "utf8");
const run = (binary, args, extra = {}) =>
  execFileSync(resolve(root, "node_modules/.bin", binary), args, {
    cwd: root,
    stdio: "inherit",
    ...extra,
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
const supplementFiles = importedEntries.reduce(
  (n, e) => n + Object.keys(e.assets).length,
  0,
);
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
  ")) AS indexed FROM catalog_install WHERE id=1";
const raw = run(
  "wrangler",
  [
    "d1",
    "execute",
    "DB",
    "--remote",
    "--config",
    "wrangler.production.jsonc",
    "--json",
    "--command",
    sql,
  ],
  { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", env },
);
assert.deepEqual(
  JSON.parse(raw)[0].results[0],
  {
    ready: 1,
    revision,
    topics: topics.length,
    files,
    available: files + supplementFiles,
    indexed: topics.length,
  },
  "The remote catalog does not match this application release.",
);
const query = (sql) =>
  JSON.parse(
    run(
      "wrangler",
      [
        "d1",
        "execute",
        "DB",
        "--remote",
        "--config",
        "wrangler.production.jsonc",
        "--json",
        "--command",
        sql,
      ],
      { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", env },
    ),
  )[0].results;
const ids = importedEntries
  .map((e) => {
    assert.match(e.id, /^[-a-z0-9]+$/);
    return "'" + e.id + "'";
  })
  .join(",");
if (importedEntries.length) {
  const actual = query(
    "SELECT template_id,format,object_key,sha256,size_bytes,mime,published FROM downloadable_assets WHERE published=1 AND template_id IN (" +
      ids +
      ")",
  );
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
assert.equal(searchRelease.expected, topics.length + importedEntries.length);
const searchState = query(
  "SELECT expected,completed,(SELECT count(*) FROM search_templates WHERE revision='" +
    searchRelease.sha256 +
    "') AS actual FROM search_releases WHERE revision='" +
    searchRelease.sha256 +
    "'",
)[0];
assert.equal(searchState.expected, searchRelease.expected);
assert.equal(searchState.actual, searchRelease.expected);
assert.ok(searchState.completed);
const activeSearch = query("SELECT revision FROM search_active WHERE id=1")[0]
  .revision;
run("astro", ["build"], { env });
const compiled = JSON.parse(read("dist/server/wrangler.json"));
assert.equal(compiled.account_id, config.account_id);
assert.deepEqual(compiled.routes, config.routes);
assert.equal(
  compiled.d1_databases[0].database_id,
  config.d1_databases[0].database_id,
);
assert.equal(compiled.name, config.name);
assert.deepEqual(compiled.r2_buckets, config.r2_buckets);
run("wrangler", ["deploy", "--config", "dist/server/wrangler.json"], { env });
if (activeSearch !== searchRelease.sha256)
  query(
    "UPDATE search_active SET revision='" +
      searchRelease.sha256 +
      "' WHERE id=1 AND revision='" +
      activeSearch +
      "'",
  );
assert.equal(
  query("SELECT revision FROM search_active WHERE id=1")[0].revision,
  searchRelease.sha256,
  "Search changed concurrently after deployment.",
);
console.log("Published search entries: " + searchRelease.expected);
