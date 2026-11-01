import { ApiError, digest, isId, requireValue } from '../server/common.mjs';
import {
  convertPrivate,
  outputFormats,
  previewAvailable,
} from './renderer.mjs';
import { nativeEditor, nativeMimes } from './editor.mjs';
export async function nativeSource(
  env,
  templateId,
  version = null,
  sourceHash = null,
  legacyDocument = null,
) {
  requireValue(isId(templateId));
  // Archived access is called only with the owner-checked document's stored version and hash.
  const archived = version !== null;
  const sql = archived
    ? `SELECT format,mime,version,object_key,size_bytes,sha256 FROM catalog_version_files
     WHERE template_id=? AND version=? AND sha256=?`
    : `SELECT format,mime,version,object_key,size_bytes,sha256 FROM downloadable_assets
     WHERE template_id=? AND document_id IS NULL AND published=1`;
  const suffix = ` AND format IN ('docx','xlsx','pptx','svg') AND NOT EXISTS(SELECT 1 FROM delivery_holds WHERE template_id=?)
  ORDER BY CASE format WHEN 'docx' THEN 1 WHEN 'xlsx' THEN 2 WHEN 'pptx' THEN 3 ELSE 4 END LIMIT 1`;
  const params = archived
    ? [templateId, version, sourceHash, templateId]
    : [templateId, templateId];
  let row = await env.DB.prepare(sql + suffix)
    .bind(...params)
    .first();
  if (!row && archived && legacyDocument) {
    // Before immutable history existed, a companion-only update could overwrite the
    // release identifier on an unchanged native file. Repair only from an existing
    // owner-checked draft and approved bytes bearing its exact stored source hash.
    await env.DB.prepare(
      `INSERT OR IGNORE INTO catalog_version_files
   (template_id,version,format,object_key,sha256,size_bytes,filename,mime)
   SELECT f.template_id,d.source_version,f.format,f.object_key,f.sha256,f.size_bytes,f.filename,f.mime
   FROM catalog_version_files f JOIN member_documents d ON d.template_id=f.template_id
   WHERE d.id=? AND d.deleted IS NULL AND d.source_version=? AND f.template_id=? AND f.sha256=?
   AND f.format IN ('docx','xlsx','pptx','svg') AND NOT EXISTS(SELECT 1 FROM delivery_holds h WHERE h.template_id=f.template_id) LIMIT 1`,
    )
      .bind(legacyDocument, version, templateId, sourceHash)
      .run();
    row = await env.DB.prepare(sql + suffix)
      .bind(...params)
      .first();
  }
  requireValue(
    row &&
      row.mime === nativeMimes[row.format] &&
      row.size_bytes > 0 &&
      row.size_bytes <= 8000000,
    'FORMAT_UNAVAILABLE',
  );
  const obj = await env.ASSET_ORIGINALS.get(row.object_key);
  requireValue(
    obj &&
      obj.size === row.size_bytes &&
      obj.customMetadata?.sha256 === row.sha256,
    'FORMAT_UNAVAILABLE',
  );
  const bytes = new Uint8Array(await obj.arrayBuffer());
  requireValue(
    bytes.byteLength === row.size_bytes && (await digest(bytes)) === row.sha256,
    'FORMAT_UNAVAILABLE',
  );
  return { row, bytes };
}
export async function nativeFields(
  env,
  id,
  version = null,
  sourceHash = null,
  legacyDocument = null,
) {
  const { row, bytes } = await nativeSource(
    env,
    id,
    version,
    sourceHash,
    legacyDocument,
  );
  let fields;
  try {
    fields = nativeEditor(bytes, row.format).fields;
  } catch {
    throw new ApiError('FORMAT_UNAVAILABLE');
  }
  return {
    templateId: id,
    sourceVersion: row.version,
    sourceHash: row.sha256,
    format: row.format,
    formats: outputFormats(env, row.format),
    previewAvailable: previewAvailable(env),
    fields,
  };
}
export function checkNativeData(templateId, data) {
  requireValue(
    isId(templateId) &&
      typeof data.title === 'string' &&
      data.title.trim() &&
      data.title.length <= 140 &&
      isId(data.sourceVersion) &&
      /^[\da-f]{64}$/.test(data.sourceHash) &&
      data.edits &&
      typeof data.edits === 'object' &&
      !Array.isArray(data.edits),
  );
  const pairs = Object.entries(data.edits);
  requireValue(
    pairs.length > 0 &&
      pairs.length <= 64 &&
      pairs.every(
        ([k, v]) =>
          /^f[1-9]\d?$/.test(k) &&
          typeof v === 'string' &&
          v.trim() &&
          v.length <= 240,
      ),
  );
}
export async function renderNative(env, doc, data, format) {
  checkNativeData(doc.template_id, data);
  requireValue(doc.source_version === data.sourceVersion, 'REVISION_CONFLICT');
  const { row, bytes } = await nativeSource(
    env,
    doc.template_id,
    doc.source_version,
    data.sourceHash,
    doc.document_id ?? doc.id,
  );
  requireValue(
    row.sha256 === data.sourceHash &&
      outputFormats(env, row.format).includes(format),
    'FORMAT_UNAVAILABLE',
  );
  let result;
  try {
    result = nativeEditor(bytes, row.format, data.edits);
  } catch {
    throw new ApiError('VALIDATION_ERROR');
  }
  if (format !== row.format)
    return convertPrivate(env, result.bytes, row.format, format);
  return { bytes: result.bytes, mime: result.mime };
}
export async function checkNativeSource(
  env,
  id,
  data,
  version = null,
  legacyDocument = null,
) {
  const { row, bytes } = await nativeSource(
    env,
    id,
    version,
    data.sourceHash,
    legacyDocument,
  );
  requireValue(
    data.sourceVersion === row.version && data.sourceHash === row.sha256,
    'REVISION_CONFLICT',
  );
  try {
    nativeEditor(bytes, row.format, data.edits, { validateOnly: true });
  } catch {
    throw new ApiError('VALIDATION_ERROR');
  }
  return row;
}
