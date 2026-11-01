import {
  requireValue,
  actorCall,
  ApiError,
  sign,
  verify,
  uuid,
  isId,
  hex,
} from './common.mjs';
import { checkFormat, formatMimes } from './documents.mjs';

const ownedAssetQuery = `SELECT a.*,d.template_id AS source_template FROM downloadable_assets a LEFT JOIN member_documents d ON d.id=a.document_id
 WHERE a.published=1 AND NOT EXISTS(SELECT 1 FROM delivery_holds h WHERE h.template_id=COALESCE(a.template_id,d.template_id)) AND (a.document_id IS NULL OR (d.owner=? AND d.deleted IS NULL)) AND `;
function bucket(env, asset) {
  return asset.document_id ? env.USER_DOCUMENTS : env.ASSET_ORIGINALS;
}
function matches(asset, object) {
  if (
    !object ||
    object.size !== asset.size_bytes ||
    object.customMetadata?.sha256 !== asset.sha256 ||
    asset.mime !== formatMimes[asset.format]
  )
    return false;
  return (
    !object.checksums?.sha256 || hex(object.checksums.sha256) === asset.sha256
  );
}
export async function intent(env, identity, input, idem) {
  const { templateId, documentId, documentRevision, format } = input;
  requireValue(
    Object.keys(input).every((k) =>
      ['templateId', 'documentId', 'documentRevision', 'format'].includes(k),
    ),
  );
  checkFormat(format);
  requireValue(!!templateId !== !!documentId);
  let asset, resource;
  if (templateId) {
    requireValue(isId(templateId) && documentRevision === undefined);
    asset = await env.DB.prepare(
      ownedAssetQuery + 'a.template_id=? AND a.format=?',
    )
      .bind(identity.actor, templateId, format)
      .first();
    requireValue(asset, 'FORMAT_UNAVAILABLE');
    resource = 'template:' + templateId;
  } else {
    requireValue(
      uuid(documentId) &&
        Number.isSafeInteger(documentRevision) &&
        documentRevision > 0,
    );
    asset = await env.DB.prepare(
      ownedAssetQuery +
        'a.document_id=? AND a.document_revision=? AND a.format=?',
    )
      .bind(identity.actor, documentId, documentRevision, format)
      .first();
    requireValue(asset, 'NOT_FOUND');
    resource = asset.source_template
      ? 'template:' + asset.source_template
      : 'document:' + documentId;
  }
  const object = await bucket(env, asset).head(asset.object_key);
  requireValue(matches(asset, object), 'FORMAT_UNAVAILABLE');
  const reserved = await actorCall(env, identity.actor, 'intent', {
    asset: asset.id,
    resource,
    idem,
    signedIn: !!identity.user,
  });
  const mac = await sign(
    env.DOWNLOAD_TOKEN_SECRET,
    identity.actor + '|' + reserved.nonce,
  );
  return {
    url: '/api/downloads/' + reserved.nonce + '.' + mac,
    expiresAt: reserved.expiresAt,
  };
}
export function byteRange(header, size) {
  if (!header) return null;
  const parts = /^bytes=(\d*)-(\d*)$/.exec(header);
  requireValue(parts && (parts[1] || parts[2]), 'RANGE_NOT_SATISFIABLE');
  let start, end;
  if (parts[1]) {
    start = Number(parts[1]);
    end = parts[2] ? Math.min(size - 1, Number(parts[2])) : size - 1;
  } else {
    const suffix = Number(parts[2]);
    requireValue(
      suffix > 0 && Number.isSafeInteger(suffix),
      'RANGE_NOT_SATISFIABLE',
    );
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  requireValue(
    Number.isSafeInteger(start) &&
      Number.isSafeInteger(end) &&
      start >= 0 &&
      start <= end &&
      end < size,
    'RANGE_NOT_SATISFIABLE',
  );
  return { offset: start, length: end - start + 1 };
}
export async function deliver(env, identity, ticket, request) {
  const [nonce, mac, extra] = ticket.split('.');
  requireValue(
    !extra &&
      uuid(nonce) &&
      (await verify(
        env.DOWNLOAD_TOKEN_SECRET,
        identity.actor + '|' + nonce,
        mac,
      )),
    'NOT_FOUND',
  );
  const { asset: id } = await actorCall(env, identity.actor, 'resolve', {
    nonce,
  });
  const asset = await env.DB.prepare(ownedAssetQuery + 'a.id=?')
    .bind(identity.actor, id)
    .first();
  if (!asset) {
    await actorCall(env, identity.actor, 'cancel', { nonce });
    throw new ApiError('NOT_FOUND');
  }
  let range;
  try {
    range = byteRange(request.headers.get('range'), asset.size_bytes);
  } catch (e) {
    if (e instanceof ApiError && e.status === 416)
      return new Response(null, {
        status: 416,
        headers: {
          'Content-Range': 'bytes */' + asset.size_bytes,
          'Cache-Control': 'private, no-store',
        },
      });
    throw e;
  }
  const storage = bucket(env, asset);
  const obj = await storage.get(
    asset.object_key,
    range ? { range } : undefined,
  );
  if (!matches(asset, obj) || !obj.body) {
    if (obj?.body) await obj.body.cancel();
    await actorCall(env, identity.actor, 'cancel', { nonce });
    throw new ApiError('FORMAT_UNAVAILABLE');
  }
  // Older private uploads may have no native R2 SHA-256. Pin a full-object re-read to the
  // same ETag before releasing even a byte range. New uploads use the native checksum.
  if (!obj.checksums?.sha256) {
    const full = await storage.get(asset.object_key, {
      onlyIf: { etagMatches: obj.etag },
    });
    if (!full?.body) {
      await obj.body.cancel();
      await actorCall(env, identity.actor, 'cancel', { nonce });
      throw new ApiError('FORMAT_UNAVAILABLE');
    }
    const hashStream = new crypto.DigestStream('SHA-256');
    await full.body.pipeTo(hashStream);
    if (hex(await hashStream.digest) !== asset.sha256) {
      await obj.body.cancel();
      await actorCall(env, identity.actor, 'cancel', { nonce });
      throw new ApiError('FORMAT_UNAVAILABLE');
    }
  }
  try {
    await actorCall(env, identity.actor, 'commit', { nonce });
  } catch (e) {
    await obj.body.cancel();
    throw e;
  }
  const name = asset.filename.replace(/[^a-z0-9._-]/gi, '_').slice(0, 160);
  const headers = {
    'Cache-Control': 'private, no-store',
    'Accept-Ranges': 'bytes',
    'Content-Type': asset.mime,
    'Content-Disposition': 'attachment; filename="' + name + '"',
    'Content-Length': String(range?.length ?? asset.size_bytes),
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  if (range)
    headers['Content-Range'] =
      'bytes ' +
      range.offset +
      '-' +
      (range.offset + range.length - 1) +
      '/' +
      asset.size_bytes;
  return new Response(obj.body, { status: range ? 206 : 200, headers });
}
