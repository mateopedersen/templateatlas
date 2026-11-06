import {
  ApiError,
  actorCall,
  digest,
  hex,
  requireValue,
  unix,
} from './common.mjs';
import { renderNative } from '../native/service.mjs';
import { convertPrivate, rendererAvailable } from '../native/renderer.mjs';
import { chartFormats } from '../charts/capabilities.mjs';

const leaseSeconds = 120,
  maxAttempts = 3;
const mime = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  svg: 'image/svg+xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  csv: 'text/csv',
  txt: 'text/plain',
  ics: 'text/calendar',
  png: 'image/png',
  webp: 'image/webp',
};
export const jobMimes = Object.freeze(mime);
const stateQuery = `SELECT j.*,d.owner,d.kind,d.template_id,d.source_version,d.deleted,
 r.object_key AS draft_key FROM export_jobs j JOIN member_documents d ON d.id=j.document_id
 JOIN member_revisions r ON r.document_id=j.document_id AND r.revision=j.revision`;
const released = `NOT EXISTS(SELECT 1 FROM delivery_holds WHERE template_id=d.template_id)`;
function pending(job) {
  return { id: job.id, state: job.state, retryAfterMs: 800 };
}
function ready(id, documentId, revision, format) {
  return {
    id,
    state: 'succeeded',
    intent: { documentId, documentRevision: revision, format },
  };
}
function retryable(err) {
  return (
    !(err instanceof ApiError) ||
    err.message === 'DEPENDENCY_UNAVAILABLE' ||
    err.message === 'RATE_LIMITED'
  );
}
async function finalAsset(env, actor, id) {
  const a = await env.DB.prepare(
    `SELECT a.document_id,a.document_revision,a.format FROM downloadable_assets a
 JOIN member_documents d ON d.id=a.document_id WHERE a.id=? AND d.owner=? AND d.deleted IS NULL AND a.published=1 AND ` +
      released,
  )
    .bind(id, actor)
    .first();
  return a ? ready(id, a.document_id, a.document_revision, a.format) : null;
}
async function render(env, job, options) {
  const obj = await env.USER_DOCUMENTS.get(job.draft_key);
  requireValue(obj, 'DEPENDENCY_UNAVAILABLE');
  const data = await obj.json();
  if (job.kind === 'template') return renderNative(env, job, data, job.format);
  if (job.kind === 'chart') {
    requireValue(
      chartFormats(data.type, rendererAvailable(env)).includes(job.format),
      'FORMAT_UNAVAILABLE',
    );
    const { exportChart } = await import('../charts/exports.mjs'),
      convert = ['pdf', 'jpg'].includes(job.format);
    let result;
    try {
      result = await exportChart(data, convert ? 'svg' : job.format);
    } catch {
      throw new ApiError('VALIDATION_ERROR');
    }
    return convert
      ? convertPrivate(env, result.bytes, 'svg', job.format)
      : result;
  }
  const renderDocument =
    options?.renderDocument ??
    (await import('../lib/render.mjs')).renderDocument;
  try {
    return await renderDocument({
      kind: job.kind,
      data,
      templateId: job.template_id,
      format: job.format,
      paper: 'letter',
    });
  } catch {
    throw new ApiError('VALIDATION_ERROR');
  }
}
function metadata(job, obj) {
  const sha = obj?.customMetadata?.sha256;
  requireValue(
    obj?.customMetadata?.exportJob === job.id &&
      /^[a-f0-9]{64}$/.test(sha) &&
      obj.size > 0 &&
      obj.size <= 8000000 &&
      obj.httpMetadata?.contentType === mime[job.format],
    'FORMAT_UNAVAILABLE',
  );
  return { sha, size: obj.size };
}
async function recoverObject(env, job) {
  const prior = await env.USER_DOCUMENTS.head(job.object_key);
  if (!prior) return null;
  const rec = metadata(job, prior);
  if (prior.checksums?.sha256)
    requireValue(hex(prior.checksums.sha256) === rec.sha, 'FORMAT_UNAVAILABLE');
  else {
    const object = await env.USER_DOCUMENTS.get(job.object_key);
    requireValue(
      object && (await digest(await object.arrayBuffer())) === rec.sha,
      'FORMAT_UNAVAILABLE',
    );
  }
  return rec;
}
async function runJob(env, id, options) {
  const now = unix(),
    token = crypto.randomUUID();
  const claim = await env.DB.prepare(
    `UPDATE export_jobs SET state='running',lease_token=?,next_attempt=?,attempts=attempts+1
 WHERE id=? AND state IN ('queued','running') AND next_attempt<=? AND attempts<?`,
  )
    .bind(token, now + leaseSeconds, id, now, maxAttempts)
    .run();
  if (!claim.meta.changes) return;
  try {
    const job = await env.DB.prepare(
      stateQuery + ' WHERE j.id=? AND d.deleted IS NULL AND ' + released,
    )
      .bind(id)
      .first();
    requireValue(job, 'ACCESS_REVOKED');
    await actorCall(env, job.owner, 'can-export', {
      resource: job.template_id
        ? 'template:' + job.template_id
        : 'document:' + job.document_id,
    });
    let rec = await recoverObject(env, job);
    if (!rec) {
      await actorCall(env, job.owner, 'write-limit');
      const output = await render(env, job, options);
      const bytes = output?.bytes;
      requireValue(
        bytes?.byteLength > 0 &&
          bytes.byteLength <= 8000000 &&
          output.mime === mime[job.format],
        'FORMAT_UNAVAILABLE',
      );
      const hash = await digest(bytes);
      // The persistent job owns this immutable key even if the process exits after the put.
      const written = await env.USER_DOCUMENTS.put(job.object_key, bytes, {
        onlyIf: { etagDoesNotMatch: '*' },
        sha256: hash,
        httpMetadata: { contentType: output.mime },
        customMetadata: { sha256: hash, exportJob: job.id },
      });
      rec = written
        ? { sha: hash, size: bytes.byteLength }
        : await recoverObject(env, job);
      requireValue(rec, 'DEPENDENCY_UNAVAILABLE');
    }
    const insert = env.DB.prepare(
      `INSERT OR IGNORE INTO downloadable_assets
    (id,version,document_id,document_revision,renderer_version,format,object_key,sha256,size_bytes,filename,mime,published)
    SELECT j.id,CAST(j.revision AS TEXT),j.document_id,j.revision,'1',j.format,j.object_key,?,?,?,?,1
    FROM export_jobs j JOIN member_documents d ON d.id=j.document_id WHERE j.id=? AND j.lease_token=? AND d.deleted IS NULL AND ` +
        released,
    ).bind(
      rec.sha,
      rec.size,
      job.kind + '-r' + job.revision + '.' + job.format,
      mime[job.format],
      id,
      token,
    );
    const done = env.DB.prepare(
      "UPDATE export_jobs SET state='succeeded',lease_token=NULL,error_code=NULL WHERE id=? AND lease_token=? AND EXISTS(SELECT 1 FROM downloadable_assets WHERE id=?)",
    ).bind(id, token, id);
    const receipt = env.DB.prepare(
      'UPDATE export_receipts SET asset_id=? WHERE fingerprint=? AND EXISTS(SELECT 1 FROM downloadable_assets WHERE id=?)',
    ).bind(id, id.slice(4), id);
    const [, changed] = await env.DB.batch([insert, done, receipt]);
    if (!changed.meta.changes) throw new ApiError('ACCESS_REVOKED');
  } catch (err) {
    const code =
      err instanceof ApiError ? err.message : 'DEPENDENCY_UNAVAILABLE';
    await env.DB.prepare(
      `UPDATE export_jobs SET state=CASE WHEN attempts<? AND ?=1 THEN 'queued' ELSE 'failed' END,
    error_code=?,next_attempt=?,lease_token=NULL WHERE id=? AND lease_token=?`,
    )
      .bind(maxAttempts, Number(retryable(err)), code, unix() + 2, id, token)
      .run();
  }
}
async function trigger(env, job, options, ctx, background) {
  if (job.state === 'failed')
    throw new ApiError(job.error_code || 'DEPENDENCY_UNAVAILABLE');
  if (
    job.state === 'running' &&
    job.next_attempt <= unix() &&
    job.attempts >= maxAttempts
  ) {
    // An expired last lease may already have staged its file. Allow one recovery pass without conversion.
    const existing = await env.USER_DOCUMENTS.head(job.object_key);
    if (existing)
      await env.DB.prepare(
        "UPDATE export_jobs SET state='queued',attempts=attempts-1 WHERE id=? AND state='running' AND next_attempt<=? AND attempts=?",
      )
        .bind(job.id, unix(), job.attempts)
        .run();
    else {
      await env.DB.prepare(
        "UPDATE export_jobs SET state='failed',error_code='DEPENDENCY_UNAVAILABLE',lease_token=NULL WHERE id=? AND state='running' AND next_attempt<=?",
      )
        .bind(job.id, unix())
        .run();
      throw new ApiError('DEPENDENCY_UNAVAILABLE');
    }
  }
  if (job.state === 'succeeded' || job.next_attempt > unix()) return;
  if (background && ctx?.waitUntil) {
    ctx.waitUntil(runJob(env, job.id, options));
    return;
  }
  await runJob(env, job.id, options);
}
export async function getJob(env, actor, id, options = {}, ctx = null) {
  const asset = await finalAsset(env, actor, id);
  if (asset) return asset;
  let job = await env.DB.prepare(
    stateQuery +
      ' WHERE j.id=? AND d.owner=? AND d.deleted IS NULL AND ' +
      released,
  )
    .bind(id, actor)
    .first();
  requireValue(job, 'NOT_FOUND');
  await trigger(env, job, options, ctx, true);
  job = await env.DB.prepare(
    stateQuery +
      ' WHERE j.id=? AND d.owner=? AND d.deleted IS NULL AND ' +
      released,
  )
    .bind(id, actor)
    .first();
  requireValue(job, 'NOT_FOUND');
  if (job.state === 'succeeded') {
    const complete = await finalAsset(env, actor, id);
    requireValue(complete, 'NOT_FOUND');
    return complete;
  }
  if (job.state === 'failed')
    throw new ApiError(job.error_code || 'DEPENDENCY_UNAVAILABLE');
  return pending(job);
}
export async function startJob(
  env,
  actor,
  doc,
  rev,
  format,
  idem,
  options,
  ctx,
) {
  const fingerprint = await digest(
      JSON.stringify([doc.id, rev, format, 'letter', '1']),
    ),
    id = 'exp-' + fingerprint;
  const receiptQuery = env.DB.prepare(
    'SELECT fingerprint FROM export_receipts WHERE owner=? AND idem=?',
  ).bind(actor, idem);
  const receipt = await receiptQuery.first();
  requireValue(
    !receipt || receipt.fingerprint === fingerprint,
    'IDEMPOTENCY_CONFLICT',
  );
  await actorCall(env, actor, 'can-export', {
    resource: doc.template_id
      ? 'template:' + doc.template_id
      : 'document:' + doc.id,
  });
  const asset = await finalAsset(env, actor, id);
  if (asset) {
    if (!receipt) {
      await actorCall(env, actor, 'export-request-limit');
      await env.DB.prepare(
        `INSERT OR IGNORE INTO export_receipts(owner,idem,fingerprint,asset_id)
         SELECT ?,?,?,a.id FROM downloadable_assets a JOIN member_documents d ON d.id=a.document_id
         WHERE a.id=? AND a.published=1 AND d.owner=? AND d.deleted IS NULL AND ` + released,
      ).bind(actor, idem, fingerprint, id, actor).run();
      const reserved = await receiptQuery.first();
      requireValue(reserved, 'NOT_FOUND');
      requireValue(reserved.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT');
    }
    await env.DB.prepare(
      'UPDATE export_receipts SET asset_id=? WHERE owner=? AND idem=?',
    )
      .bind(id, actor, idem)
      .run();
    return asset;
  }
  const key =
    'exports/' + doc.id + '/' + rev + '/' + fingerprint + '.' + format;
  const createJob = env.DB.prepare(
    `INSERT OR IGNORE INTO export_jobs(id,document_id,revision,format,object_key,created)
   SELECT ?,d.id,?,?,?,? FROM member_documents d JOIN member_revisions r ON d.id=r.document_id AND r.revision=?
   WHERE d.id=? AND d.owner=? AND d.deleted IS NULL
   AND NOT EXISTS(SELECT 1 FROM export_receipts WHERE owner=? AND idem=? AND fingerprint<>?)
   AND ` + released,
  ).bind(id, rev, format, key, unix(), rev, doc.id, actor, actor, idem, fingerprint);
  if (receipt) {
    await createJob.run();
  } else {
    const revision = await env.DB.prepare(
      'SELECT 1 FROM member_revisions WHERE document_id=? AND revision=?',
    ).bind(doc.id, rev).first();
    requireValue(revision, 'NOT_FOUND');
    await actorCall(env, actor, 'export-request-limit');
    // A new idempotency receipt must commit with its owning job.
    await env.DB.batch([
      createJob,
      env.DB.prepare(
        `INSERT OR IGNORE INTO export_receipts(owner,idem,fingerprint)
         SELECT ?,?,? FROM export_jobs j JOIN member_documents d ON d.id=j.document_id
         WHERE j.id=? AND d.owner=? AND d.deleted IS NULL AND ` + released,
      ).bind(actor, idem, fingerprint, id, actor),
    ]);
    const reserved = await receiptQuery.first();
    requireValue(reserved, 'NOT_FOUND');
    requireValue(reserved.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT');
  }
  await env.DB.prepare(
    "UPDATE export_jobs SET state='queued',attempts=0,error_code=NULL,next_attempt=0 WHERE id=? AND state='failed' AND error_code IN ('DEPENDENCY_UNAVAILABLE','RATE_LIMITED','SIGNUP_REQUIRED','EMAIL_VERIFICATION_REQUIRED','MEMBERSHIP_REQUIRED','ACCESS_REVOKED')",
  )
    .bind(id)
    .run();
  const job = await env.DB.prepare(
    stateQuery +
      ' WHERE j.id=? AND d.owner=? AND d.deleted IS NULL AND ' +
      released,
  )
    .bind(id, actor)
    .first();
  requireValue(job, 'NOT_FOUND');
  // Native downloads resolve in the request; expensive conversions continue under a lease.
  const heavy =
    ['template', 'chart'].includes(doc.kind) && ['pdf', 'jpg'].includes(format);
  await trigger(env, job, options, ctx, heavy);
  const resolved = await finalAsset(env, actor, id);
  if (resolved) return resolved;
  const next = await env.DB.prepare(
    'SELECT id,state,error_code FROM export_jobs WHERE id=?',
  )
    .bind(id)
    .first();
  if (next?.state === 'failed')
    throw new ApiError(next.error_code || 'DEPENDENCY_UNAVAILABLE');
  return pending(next);
}
export async function recoverJobs(env, options = {}) {
  const due = (
    await env.DB.prepare(
      stateQuery +
        " WHERE j.state IN ('queued','running') AND j.next_attempt<=? AND d.deleted IS NULL ORDER BY j.created LIMIT 3",
    )
      .bind(unix())
      .all()
  ).results;
  for (const job of due) {
    try {
      await trigger(env, job, options, null, false);
    } catch {}
  }
}
