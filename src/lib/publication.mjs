import revision from '../data/release-id.json' with { type: 'json' };
const pending = new WeakMap();
export function catalogState(db) {
  if (!db?.prepare) return Promise.reject(new Error('Catalog database unavailable'));
  const current = pending.get(db);
  if (current) return current;
  const task = (async () => {
    let result;
    for (let attempt = 0; ; attempt++) {
      try {
        result = await db.prepare('SELECT ready,revision,topics,files,(SELECT json_group_array(template_id) FROM delivery_holds) AS held FROM catalog_install WHERE id=1').first();
        break;
      } catch (error) {
        if (attempt >= 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 60));
      }
    }
    return { ready: result?.ready === 1 && result.revision === revision.sha256, held: new Set(JSON.parse(result?.held || '[]')) };
  })();
  pending.set(db, task);
  task.finally(() => { if (pending.get(db) === task) pending.delete(db); }).catch(() => {});
  return task;
}
