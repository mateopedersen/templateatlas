import revision from '../data/release-id.json' with { type: 'json' };
export async function catalogState(db) {
  const result = await db
    .prepare(
      'SELECT ready,revision,topics,files,(SELECT json_group_array(template_id) FROM delivery_holds) AS held FROM catalog_install WHERE id=1',
    )
    .first();
  return {
    ready: result?.ready === 1 && result.revision === revision.sha256,
    held: new Set(JSON.parse(result?.held || '[]')),
  };
}
