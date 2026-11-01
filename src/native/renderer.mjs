import { rasterSize } from '../lib/raster.mjs';
// Original bytes originate only from the reviewed R2 master or a chart generated on the server.
import { requireValue } from '../server/common.mjs';
export function rendererAvailable(env) {
  if (!(
    typeof env.RENDER_SECRET === 'string' && env.RENDER_SECRET.length >= 32
  ))
    return false;
  if (env.PRIVATE_RENDERER && typeof env.PRIVATE_RENDERER.fetch === 'function')
    return true;
  try {
    const u = new URL(env.PUBLIC_SITE_URL),
      port = Number(env.LOCAL_RENDER_PORT);
    return (
      env.DEPLOY_STAGE === 'local' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) &&
      Number.isInteger(port) &&
      port >= 1024 &&
      port <= 65535
    );
  } catch {
    return false;
  }
}
export function previewAvailable(env) {
  if (!rendererAvailable(env)) return false;
  if (env.PRIVATE_RENDERER) return env.PRIVATE_PREVIEW_ENABLED === 'true';
  return env.DEPLOY_STAGE === 'local';
}
export function outputFormats(env, native) {
  return rendererAvailable(env)
    ? [native, 'pdf', ...(['pptx', 'svg'].includes(native) ? ['jpg'] : [])]
    : [native];
}
export async function convertPrivate(env, bytes, from, to) {
  requireValue(rendererAvailable(env), 'FORMAT_UNAVAILABLE');
  requireValue(
    bytes instanceof Uint8Array &&
      bytes.length > 0 &&
      bytes.length <= 8000000 &&
      ['docx', 'xlsx', 'pptx', 'svg'].includes(from) &&
      ['pdf', 'jpg', 'preview-jpg'].includes(to),
  );
  if (to === 'preview-jpg')
    requireValue(previewAvailable(env), 'FORMAT_UNAVAILABLE');
  const remote = env.PRIVATE_RENDERER,
    base = remote
      ? 'https://private-renderer.internal'
      : 'http://127.0.0.1:' + Number(env.LOCAL_RENDER_PORT);
  const request = new Request(base + '/v1/render', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + env.RENDER_SECRET,
      'content-type': 'application/octet-stream',
      'x-source-format': from,
      'x-output-format': to,
      'cache-control': 'no-store',
    },
    body: bytes,
    redirect: 'manual',
    signal: AbortSignal.timeout(75000),
  });
  let response;
  try {
    response = remote ? await remote.fetch(request) : await fetch(request);
  } catch {
    requireValue(false, 'DEPENDENCY_UNAVAILABLE');
  }
  requireValue(response.ok, 'DEPENDENCY_UNAVAILABLE');
  const mime = to === 'pdf' ? 'application/pdf' : 'image/jpeg',
    len = Number(response.headers.get('content-length'));
  requireValue(
    response.headers.get('content-type') === mime &&
      Number.isSafeInteger(len) &&
      len > 0 &&
      len <= 8000000,
    'DEPENDENCY_UNAVAILABLE',
  );
  const out = new Uint8Array(await response.arrayBuffer());
  requireValue(
    out.byteLength === len &&
      (to === 'pdf'
        ? new TextDecoder().decode(out.subarray(0, 5)) === '%PDF-'
        : out[0] === 255 &&
          out[1] === 216 &&
          out.at(-2) === 255 &&
          out.at(-1) === 217),
    'DEPENDENCY_UNAVAILABLE',
  );
  if (to === 'preview-jpg') {
    const { width, height } = rasterSize(out);
    requireValue(
      width > 0 && height > 0 && width <= 480 && height <= 480 && len <= 120000,
      'DEPENDENCY_UNAVAILABLE',
    );
  }
  return { bytes: out, mime };
}
