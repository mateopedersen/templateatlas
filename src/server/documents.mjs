import { invoiceLogo } from '../forms/invoice-logo.mjs';
import { validateForm } from '../forms/model.mjs';
import { startJob, getJob, jobMimes } from './export-jobs.mjs';
import {
  ApiError,
  actorCall,
  digest,
  isId,
  requireValue,
  unix,
  uuid,
} from './common.mjs';
import {
  checkNativeData,
  checkNativeSource,
  nativeFields,
} from '../native/service.mjs';
import { rendererAvailable } from '../native/renderer.mjs';
import { formatsFor } from '../lib/render.mjs';
import { tools } from '../lib/tools.mjs';
import { chartFormats } from '../charts/capabilities.mjs';
import { chartSeedType, validate } from '../charts/model.mjs';

const revision = (n) => Number.isSafeInteger(n) && n > 0 && n < 1000000;
async function owned(env, actor, id) {
  requireValue(uuid(id), 'NOT_FOUND');
  const doc = await env.DB.prepare(
    'SELECT * FROM member_documents WHERE id=? AND owner=? AND deleted IS NULL',
  )
    .bind(id, actor)
    .first();
  requireValue(doc, 'NOT_FOUND');
  return doc;
}
export async function listDocuments(env, actor) {
  return (
    await env.DB.prepare(
      'SELECT id,kind,title,revision,updated FROM member_documents WHERE owner=? AND deleted IS NULL ORDER BY updated DESC,id LIMIT 100',
    )
      .bind(actor)
      .all()
  ).results;
}
async function readDraft(env, key) {
  const obj = await env.USER_DOCUMENTS.get(key);
  requireValue(obj, 'DEPENDENCY_UNAVAILABLE');
  return obj.json();
}
async function saveDraft(env, id, data) {
  const raw = JSON.stringify(data),
    hash = await digest(raw),
    key = 'drafts/' + id + '/' + hash + '.json';
  await env.USER_DOCUMENTS.put(key, raw, {
    sha256: hash,
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { sha256: hash },
  });
  return key;
}
function checkDocument(kind, templateId, data) {
  requireValue(
    isId(kind) &&
      (templateId === null || isId(templateId)) &&
      data &&
      typeof data === 'object' &&
      !Array.isArray(data),
  );
  if (kind === 'form') {
    requireValue(templateId === null);
    try {
      validateForm(data);
    } catch {
      throw new ApiError('VALIDATION_ERROR');
    }
  } else if (kind === 'template') {
    checkNativeData(templateId, data);
  } else if (kind === 'chart') {
    requireValue(!templateId || chartSeedType[templateId] === data.type);
    try {
      validate(data);
    } catch {
      throw new ApiError('VALIDATION_ERROR');
    }
  } else {
    requireValue(kind === 'invoice' || Object.hasOwn(tools, kind));
    requireValue(
      kind === 'invoice'
        ? templateId === null || templateId === 'ta-invoice-001'
        : templateId === null,
    );
    if (kind === 'invoice' && data.logo) {
      try {
        invoiceLogo(data.logo);
      } catch {
        throw new ApiError('VALIDATION_ERROR');
      }
    }
  }
}
function ownerGuard(actor) {
  return actor.startsWith('guest:')
    ? ['NOT EXISTS(SELECT 1 FROM guest_transfers WHERE guest=?)', actor]
    : [
        'NOT EXISTS(SELECT 1 FROM member_closures WHERE user_id=?)',
        actor.slice(5),
      ];
}
export async function duplicateDocument(env, actor, id) {
  const doc = await owned(env, actor, id);
  await actorCall(env, actor, 'write-limit');
  const data = await readDraft(env, doc.current_key),
    newId = crypto.randomUUID(),
    key = await saveDraft(env, newId, data);
  const [active, owner] = ownerGuard(actor);
  const [created] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO member_documents(id,owner,kind,template_id,revision,current_key,title,updated,source_version)
      SELECT ?,owner,kind,template_id,1,?,?,?,source_version FROM member_documents WHERE id=? AND owner=? AND revision=? AND deleted IS NULL AND ` +
        active,
    ).bind(
      newId,
      key,
      ('Copy of ' + doc.title).slice(0, 140),
      unix(),
      id,
      actor,
      doc.revision,
      owner,
    ),
    env.DB.prepare(
      'INSERT INTO member_revisions SELECT id,1,current_key FROM member_documents WHERE id=? AND owner=?',
    ).bind(newId, actor),
  ]);
  if (!created.meta.changes) {
    await env.USER_DOCUMENTS.delete(key);
    throw new ApiError('REVISION_CONFLICT');
  }
  return { id: newId, revision: 1 };
}
const titleOf = (kind, data) =>
  String(
    data.title ||
      (kind === 'invoice' && data.number
        ? 'Invoice ' + data.number
        : data.invoiceNumber) ||
      kind.split('-').join(' '),
  ).slice(0, 140);
export async function documents(env, actor, id, method, input = {}) {
  if (!id && method === 'GET')
    return { documents: await listDocuments(env, actor) };
  if (method !== 'GET') await actorCall(env, actor, 'write-limit');
  const [activeOwner, ownerKey] = ownerGuard(actor);
  if (!id && method === 'POST') {
    const { kind, data } = input,
      templateId = input.templateId || null;
    checkDocument(kind, templateId, data);
    let source = null;
    if (kind === 'template') {
      source = await checkNativeSource(env, templateId, data);
    } else if (templateId) {
      source = await env.DB.prepare(
        'SELECT version FROM downloadable_assets WHERE template_id=? AND published=1 LIMIT 1',
      )
        .bind(templateId)
        .first();
      requireValue(source, 'NOT_FOUND');
    }
    const newId = crypto.randomUUID(),
      key = await saveDraft(env, newId, data);
    const guard =
      kind === 'template'
        ? ' AND EXISTS(SELECT 1 FROM downloadable_assets a WHERE a.template_id=? AND a.version=? AND a.sha256=? AND a.published=1 AND NOT EXISTS(SELECT 1 FROM delivery_holds WHERE template_id=a.template_id))'
        : '';
    const [inserted] = await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO member_documents(id,owner,kind,template_id,revision,current_key,title,updated,source_version) SELECT ?,?,?,?,1,?,?,?,? WHERE ' +
          activeOwner +
          guard,
      ).bind(
        newId,
        actor,
        kind,
        templateId,
        key,
        titleOf(kind, data),
        unix(),
        source?.version || null,
        ownerKey,
        ...(kind === 'template'
          ? [templateId, source.version, source.sha256]
          : []),
      ),
      env.DB.prepare(
        'INSERT INTO member_revisions SELECT id,1,current_key FROM member_documents WHERE id=? AND owner=?',
      ).bind(newId, actor),
    ]);
    if (!inserted.meta.changes) {
      await env.USER_DOCUMENTS.delete(key);
      requireValue(
        await env.DB.prepare('SELECT 1 WHERE ' + activeOwner)
          .bind(ownerKey)
          .first(),
        'ACCESS_REVOKED',
      );
      throw new ApiError('REVISION_CONFLICT');
    }
    return { id: newId, revision: 1 };
  }
  const doc = await owned(env, actor, id);
  if (method === 'GET') {
    const data = await readDraft(env, doc.current_key);
    let formats =
      doc.kind === 'chart'
        ? chartFormats(data.type, rendererAvailable(env))
        : doc.kind === 'template'
          ? []
          : formatsFor(doc.kind);
    let source;
    if (doc.kind === 'template') {
      try {
        source = await nativeFields(
          env,
          doc.template_id,
          doc.source_version,
          data.sourceHash,
          doc.id,
        );
        formats = source.formats;
      } catch (error) {
        if (
          !(error instanceof ApiError) ||
          error.message !== 'FORMAT_UNAVAILABLE'
        )
          throw error;
      }
    }
    return {
      id,
      revision: doc.revision,
      kind: doc.kind,
      title: doc.title,
      templateId: doc.template_id,
      data,
      formats,
      ...(source ? { source } : {}),
    };
  }
  if (method === 'DELETE') {
    const r = await env.DB.prepare(
      'UPDATE member_documents SET deleted=? WHERE id=? AND owner=? AND ' +
        activeOwner,
    )
      .bind(unix(), id, actor, ownerKey)
      .run();
    requireValue(r.meta.changes === 1, 'ACCESS_REVOKED');
    return { deleted: true };
  }
  requireValue(method === 'PATCH', 'METHOD_NOT_ALLOWED');
  requireValue(revision(input.expectedRevision));
  requireValue(input.expectedRevision === doc.revision, 'REVISION_CONFLICT');
  checkDocument(doc.kind, doc.template_id, input.data);
  if (doc.kind === 'template') {
    const prior = await readDraft(env, doc.current_key);
    requireValue(
      input.data.sourceHash === prior.sourceHash,
      'REVISION_CONFLICT',
    );
    await checkNativeSource(
      env,
      doc.template_id,
      input.data,
      doc.source_version,
      doc.id,
    );
  }
  const key = await saveDraft(env, id, input.data),
    next = doc.revision + 1;
  const [r] = await env.DB.batch([
    env.DB.prepare(
      'UPDATE member_documents SET revision=?,current_key=?,title=?,updated=? WHERE id=? AND owner=? AND revision=? AND deleted IS NULL AND ' +
        activeOwner,
    ).bind(
      next,
      key,
      titleOf(doc.kind, input.data),
      unix(),
      id,
      actor,
      doc.revision,
      ownerKey,
    ),
    env.DB.prepare(
      'INSERT OR IGNORE INTO member_revisions SELECT id,revision,current_key FROM member_documents WHERE id=? AND owner=? AND revision=? AND current_key=? AND deleted IS NULL',
    ).bind(id, actor, next, key),
  ]);
  requireValue(r.meta.changes === 1, 'REVISION_CONFLICT');
  return { id, revision: next };
}
export const formatMimes = jobMimes;
export function checkFormat(format) {
  requireValue(
    typeof format === 'string' && Object.hasOwn(formatMimes, format),
  );
}
export async function createExport(
  env,
  actor,
  input,
  idem,
  options = {},
  ctx = null,
) {
  const {
    documentId: id,
    documentRevision: rev,
    format,
    paper = 'letter',
  } = input;
  requireValue(revision(rev) && paper === 'letter');
  checkFormat(format);
  const doc = await owned(env, actor, id);
  return startJob(env, actor, doc, rev, format, idem, options, ctx);
}
export const getExport = getJob;
