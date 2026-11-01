import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { catalogState } from './lib/publication.mjs';
import { byPath } from './lib/catalog.mjs';
export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  if (!(
    path === '/' ||
    /^\/(templates|categories|search|create|studio)(\/|$)/.test(path)
  ))
    return next();
  try {
    const state = await catalogState(env.DB);
    if (!state.ready)
      return new Response(
        'The verified template library is being updated. Please try again shortly.',
        {
          status: 503,
          headers: {
            'Retry-After': '60',
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex',
          },
        },
      );
    context.locals.held = state.held as Set<string>;
    const item = byPath.get(path);
    if (item && state.held.has(item.id))
      return new Response('This template is unavailable.', {
        status: 404,
        headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
      });
  } catch {
    return new Response('The template library is temporarily unavailable.', {
      status: 503,
      headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' },
    });
  }
  return next();
});
