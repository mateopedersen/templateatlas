import { isId, requireValue, unix } from './common.mjs';
import { entries } from '../lib/catalog.mjs';
const catalog = new Map(entries.map((item) => [item.id, item]));
export async function savedTemplates(env, userId, method, input = {}) {
  if (method === 'GET') {
    const saved = (
      await env.DB.prepare(
        'SELECT template_id,collection,saved FROM saved_templates WHERE user_id=? ORDER BY collection COLLATE NOCASE,saved DESC',
      )
        .bind(userId)
        .all()
    ).results;
    return {
      saved: saved.map((s) => {
        const item = catalog.get(s.template_id);
        return {
          templateId: s.template_id,
          collection: s.collection,
          title: item?.title || s.template_id,
          path: item?.topic_path || null,
        };
      }),
    };
  }
  requireValue(
    isId(input.templateId) &&
      typeof input.collection === 'string' &&
      input.collection.trim().length > 0 &&
      input.collection.length <= 60,
  );
  const collection = input.collection.trim();
  if (method === 'DELETE') {
    await env.DB.prepare(
      'DELETE FROM saved_templates WHERE user_id=? AND template_id=? AND collection=?',
    )
      .bind(userId, input.templateId, collection)
      .run();
  } else {
    const actual = await env.DB.prepare(
      'SELECT 1 AS present FROM downloadable_assets WHERE template_id=? AND published=1 LIMIT 1',
    )
      .bind(input.templateId)
      .first();
    requireValue(actual, 'NOT_FOUND');
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO saved_templates SELECT ?,?,?,? WHERE
      (SELECT count(*) FROM saved_templates WHERE user_id=?)<1000`,
    )
      .bind(userId, input.templateId, collection, unix(), userId)
      .run();
    if (!r.meta.changes)
      requireValue(
        await env.DB.prepare(
          'SELECT 1 FROM saved_templates WHERE user_id=? AND template_id=? AND collection=?',
        )
          .bind(userId, input.templateId, collection)
          .first(),
        'RATE_LIMITED',
      );
  }
  return { saved: method !== 'DELETE' };
}
