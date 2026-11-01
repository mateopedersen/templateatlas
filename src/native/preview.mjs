import {
  ApiError,
  actorCall,
  digest,
  json,
  requireValue,
  unix,
  uuid,
} from '../server/common.mjs';
import { previewAvailable, convertPrivate } from './renderer.mjs';
import { nativeSource } from './service.mjs';
import { nativeEditor } from './editor.mjs';
import { rasterSize } from '../lib/raster.mjs';
const version = 'first-page-v1';
const authorized = `SELECT d.id,d.source_version,d.template_id,r.object_key FROM member_documents d
 JOIN member_revisions r ON r.document_id=d.id WHERE d.id=? AND r.revision=? AND d.owner=? AND d.kind='template'
 AND d.deleted IS NULL AND NOT EXISTS(SELECT 1 FROM delivery_holds h WHERE h.template_id=d.template_id)`;
async function ensureOwner(env, id, revision, actor) {
  const row = await env.DB.prepare(authorized)
    .bind(id, revision, actor)
    .first();
  requireValue(row, 'NOT_FOUND');
  return row;
}
function imageResponse(bytes, rev) {
  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Document-Revision': String(rev),
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
async function cached(env, key, hash) {
  const obj = await env.USER_DOCUMENTS.get(key);
  if (!obj) return null;
  requireValue(
    obj.size > 0 &&
      obj.size <= 120000 &&
      obj.customMetadata?.sourceHash === hash,
    'FORMAT_UNAVAILABLE',
  );
  const bytes = new Uint8Array(await obj.arrayBuffer());
  const s = rasterSize(bytes);
  requireValue(
    s.type === 'jpeg' &&
      s.width > 0 &&
      s.height > 0 &&
      Math.max(s.width, s.height) <= 480 &&
      obj.customMetadata?.sha256 === (await digest(bytes)),
    'FORMAT_UNAVAILABLE',
  );
  return bytes;
}
export async function documentPreview(env, actor, id, input) {
  requireValue(previewAvailable(env), 'FORMAT_UNAVAILABLE');
  const rev = input?.revision;
  requireValue(
    uuid(id) &&
      Number.isSafeInteger(rev) &&
      rev > 0 &&
      Object.keys(input).length === 1,
  );
  const doc = await ensureOwner(env, id, rev, actor);
  const file = await env.USER_DOCUMENTS.get(doc.object_key);
  requireValue(file, 'DEPENDENCY_UNAVAILABLE');
  const data = await file.json();
  requireValue(
    doc.source_version === data.sourceVersion &&
      /^[a-f0-9]{64}$/.test(data.sourceHash),
    'REVISION_CONFLICT',
  );
  const key =
    'exports/' +
    id +
    '/previews/' +
    version +
    '/' +
    rev +
    '-' +
    data.sourceHash +
    '.jpg';
  const existing = await cached(env, key, data.sourceHash);
  if (existing) {
    await ensureOwner(env, id, rev, actor);
    return imageResponse(existing, rev);
  }
  const token = crypto.randomUUID(),
    now = unix();
  const lease = await env.DB.prepare(
    `INSERT INTO document_previews(document_id,revision,renderer_version,object_key,lease,try_after)
 VALUES(?,?,?,?,?,?) ON CONFLICT(document_id,revision,renderer_version) DO UPDATE SET lease=excluded.lease,try_after=excluded.try_after
 WHERE try_after<=?`,
  )
    .bind(id, rev, version, key, token, now + 115, now)
    .run();
  if (!lease.meta.changes)
    return json({ state: 'rendering', retryAfterMs: 850 }, 202);
  try {
    await actorCall(env, actor, 'write-limit');
    const { row, bytes } = await nativeSource(
      env,
      doc.template_id,
      doc.source_version,
      data.sourceHash,
      doc.id,
    );
    let native;
    try {
      native = nativeEditor(bytes, row.format, data.edits).bytes;
    } catch {
      throw new ApiError('VALIDATION_ERROR');
    }
    const image = await convertPrivate(env, native, row.format, 'preview-jpg');
    await ensureOwner(env, id, rev, actor);
    const checksum = await digest(image.bytes);
    await env.USER_DOCUMENTS.put(key, image.bytes, {
      onlyIf: { etagDoesNotMatch: '*' },
      sha256: checksum,
      httpMetadata: { contentType: 'image/jpeg' },
      customMetadata: { sourceHash: data.sourceHash, sha256: checksum },
    });
    await ensureOwner(env, id, rev, actor);
    return imageResponse(image.bytes, rev);
  } finally {
    await env.DB.prepare(
      'UPDATE document_previews SET lease=NULL,try_after=0 WHERE document_id=? AND revision=? AND renderer_version=? AND lease=?',
    )
      .bind(id, rev, version, token)
      .run();
  }
}
