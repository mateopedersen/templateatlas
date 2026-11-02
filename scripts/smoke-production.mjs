import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import release from "../src/data/release.json" with { type: "json" };
import { entries } from '../src/lib/catalog.mjs';

const origin = "https://templateatlas.com";
const get = (path, options = {}) =>
  fetch(new URL(path, origin), { redirect: "manual", ...options });
const health = await (await get("/api/health")).json();
assert.equal(health.stage, "production");
assert.equal(health.templates, entries.length);
const start = await get("/api/session");
assert(start.ok);
const cookie = start.headers
  .getSetCookie()
  .find((c) => c.startsWith("__Host-ta-guest="))
  .split(";")[0];
const session = async () =>
  (await get("/api/session", { headers: { cookie } })).json();
const state = await session();
assert.equal(state.freeUsed, 0);
assert.equal(state.localTestInbox, false);
const intent = (file, format) =>
  get("/api/download-intents", {
    method: "POST",
    headers: {
      origin,
      cookie,
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({ templateId: file.id, format }),
  });
const verified = [];
async function download(file, format) {
  const issue = await intent(file, format);
  assert.equal(issue.status, 200);
  const { url } = await issue.json();
  assert.match(url, /^\/api\/downloads\//);
  const transfer = await get(url, { headers: { cookie } });
  assert.equal(transfer.status, 200);
  const bytes = Buffer.from(await transfer.arrayBuffer());
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    file.assets[format].sha256,
  );
  assert.equal(bytes.length, file.assets[format].bytes);
  assert.equal(transfer.headers.get("content-type"), file.assets[format].mime);
  verified.push({ templateId: file.id, format, bytes: bytes.length });
}
const formats = ["docx", "pptx", "svg", "xlsx", "pdf"];
const chosen = [];
for (const format of formats) {
  const file = release.find((e) => e.assets[format] && !chosen.includes(e));
  chosen.push(file);
  await download(file, format);
}
await download(chosen[0], "docx");
assert.equal((await session()).freeUsed, 5);
const denied = await intent(
  release.find((f) => !chosen.includes(f) && f.assets.pdf),
  "pdf",
);
assert.equal(denied.status, 403);
assert.equal((await denied.json()).code, "SIGNUP_REQUIRED");
const redirect = await fetch(
  "https://www.templateatlas.com/templates/artist-invoice/",
  { redirect: "manual" },
);
assert.equal(redirect.status, 301);
assert.equal(
  redirect.headers.get("location"),
  origin + "/templates/artist-invoice/",
);
const search = await get("/api/search?q=invoice");
assert.equal(search.status, 200);
assert.match(await search.text(), /invoice/i);
const report = {
  checkedAt: new Date().toISOString(),
  origin,
  health,
  verificationMailConfigured: state.accountEmailConfigured,
  verifiedDownloads: verified,
  distinctFreeUsed: 5,
  sixthBlocked: true,
  wwwRedirect: 301,
  invoiceSearch: true,
};
if (process.argv[2])
  await writeFile(process.argv[2], JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
