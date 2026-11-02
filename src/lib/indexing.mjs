// Apply after all routes, including cached R2 previews and private downloads.
export function withNoIndex(response) {
  const result = new Response(response.body, response);
  result.headers.set('X-Robots-Tag', 'noindex, noimageindex');
  return result;
}
