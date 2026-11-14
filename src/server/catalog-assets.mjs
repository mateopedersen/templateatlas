import { getPublicCatalogAsset } from "../lib/public-assets.mjs";

export async function catalogAsset(request, env, ctx, cache = caches.default) {
  const url = new URL(request.url);
  const asset = await getPublicCatalogAsset(url.pathname);
  if (!asset) return new Response("Asset not found", { status: 404 });
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  const key = new Request(url.origin + url.pathname);
  const cached = await cache.match(key);
  if (cached)
    return request.method === "HEAD" ? new Response(null, cached) : cached;
  const head = request.method === "HEAD";
  let object;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      object = head ? await env.ASSET_ORIGINALS.head(asset.key) : await env.ASSET_ORIGINALS.get(asset.key);
      if (object) break;
    } catch {
      // Reads are idempotent; a transient storage failure must not become a broken preview.
    }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 75 * (attempt + 1)));
  }
  if (
    !object ||
    (!head && !object.body) ||
    object.size !== asset.bytes ||
    object.customMetadata?.sha256 !== asset.sha256 ||
    object.httpMetadata?.contentType !== asset.mime
  ) {
    await object?.body?.cancel();
    return new Response("Asset unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "1" },
    });
  }
  const response = new Response(head ? null : object.body, {
    headers: {
      "Content-Type": asset.mime,
      "Content-Length": String(asset.bytes),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: '"' + asset.sha256 + '"',
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Timing-Allow-Origin": "https://templateatlas.com",
    },
  });
  if (head) return response;
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}
