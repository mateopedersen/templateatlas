const PUBLIC_PATH = /^(?:\/$|\/(?:templates|categories|tools|help|legal)(?:\/|$)|\/(?:about|contact)\/$)/;
const revalidating = new Map();
const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-|__Host-)?better-auth\./i;

export function publicPageKey(request, env, version) {
  const url = new URL(request.url);
  if (env.DEPLOY_STAGE !== 'production' || url.hostname !== 'templateatlas.com' ||
      !['GET', 'HEAD'].includes(request.method) || url.search ||
      !PUBLIC_PATH.test(url.pathname) || request.headers.has('authorization') ||
      request.headers.has('range') || SESSION_COOKIE.test(request.headers.get('cookie') || '') ||
      /no-store/i.test(request.headers.get('cache-control') || '')) return null;
  url.searchParams.set('__ta_page_build', version);
  return new Request(url, { method: 'GET' });
}

function clientResponse(response, method, state) {
  const result = new Response(method === 'HEAD' ? null : response.body, response);
  result.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  result.headers.set('X-TemplateAtlas-Cache', state);
  result.headers.set('Vary', 'Cookie');
  result.headers.delete('X-TemplateAtlas-Stored-At');
  return result;
}

export async function publicPage(request, env, ctx, version, render, cache) {
  const key = publicPageKey(request, env, version);
  if (!key) return render(request);
  const store = async (response) => {
    if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html') || response.headers.has('set-cookie')) return false;
    const stored = new Response(response.clone().body, response);
    stored.headers.set('Cache-Control', 'public, max-age=60');
    stored.headers.set('X-TemplateAtlas-Stored-At', String(Date.now()));
    await cache.put(key, stored);
    return true;
  };
  const getRequest = request.method === 'HEAD' ? new Request(request, {method:'GET'}) : request;
  const cached = await cache.match(key);
  if (cached) {
    const age = Date.now() - Number(cached.headers.get('X-TemplateAtlas-Stored-At') || Date.now());
    if (age >= 30000 && !revalidating.has(key.url)) {
      const task = (async () => {
        const fresh = await render(getRequest);
        if (!await store(fresh) && fresh.status === 404) await cache.delete?.(key);
      })().catch(() => {}).finally(() => revalidating.delete(key.url));
      revalidating.set(key.url, task);
      ctx.waitUntil(task);
    }
    return clientResponse(cached, request.method, age >= 30000 ? 'STALE' : 'HIT');
  }
  // HEAD warms the same complete GET representation; never cache an empty document.
  const response = await render(getRequest);
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html') || response.headers.has('set-cookie')) return response;
  ctx.waitUntil(store(response).catch(() => {}));
  return clientResponse(response, request.method, 'MISS');
}
