const PUBLIC_PATH = /^(?:\/$|\/(?:templates|categories|tools|help|legal)(?:\/|$)|\/(?:about|contact)\/$)/;
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
  return result;
}

export async function publicPage(request, env, ctx, version, render, cache) {
  const key = publicPageKey(request, env, version);
  if (!key) return render(request);
  const cached = await cache.match(key);
  if (cached) return clientResponse(cached, request.method, 'HIT');
  // HEAD warms the same GET representation, never an empty cached document.
  const response = await render(request.method === 'HEAD' ? new Request(request, { method: 'GET' }) : request);
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html') ||
      response.headers.has('set-cookie')) return response;
  const stored = new Response(response.clone().body, response);
  stored.headers.set('Cache-Control', 'public, max-age=60');
  ctx.waitUntil(cache.put(key, stored).catch(() => {}));
  return clientResponse(response, request.method, 'MISS');
}
