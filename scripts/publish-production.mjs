import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
const files = topics.reduce(
  (sum, item) => sum + Object.keys(item.assets).length,
  0,
);
assert.equal(config.name, "templateatlas");
assert.equal(config.vars.PUBLIC_SITE_URL, "https://templateatlas.com");
assert.equal(config.vars.DEPLOY_STAGE, "production");
const sql =
  "SELECT ready,revision,topics,files,(SELECT count(*) FROM downloadable_assets WHERE template_id IS NOT NULL AND published=1) AS available,(SELECT count(*) FROM search_templates WHERE revision=(SELECT revision FROM search_active WHERE id=1)) AS indexed FROM catalog_install WHERE id=1";
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
    available: files,
    indexed: topics.length,
  },
  "The remote catalog does not match this application release.",
);
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
