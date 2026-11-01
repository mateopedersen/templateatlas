import { auth } from './identity.mjs';
import { actorCall, ApiError, requireValue, unix, uuid } from './common.mjs';
import { stopRenewals } from './billing.mjs';

async function reauthenticate(request, env, identity, password) {
  requireValue(identity.user?.emailVerified,'UNAUTHENTICATED');
  requireValue(typeof password==='string' && password.length>=1 && password.length<=128);
  await actorCall(env,identity.actor,'reauth-limit');
  try {
    const result=await auth(env).api.verifyPassword({headers:request.headers,body:{password}});
    requireValue(result.status,'UNAUTHENTICATED');
  } catch { throw new ApiError('UNAUTHENTICATED'); }
}
export async function privateArchive(request,env,identity,input) {
  await reauthenticate(request,env,identity,input.password);
  const after=input.after||'';
  requireValue(after==='' || uuid(after));
  const rows=(await env.DB.prepare(`SELECT id,kind,title,template_id,revision,current_key,updated FROM member_documents
    WHERE owner=? AND id>? AND deleted IS NULL ORDER BY id LIMIT 11`).bind(identity.actor,after).all()).results;
  // Each page is bounded by ten private JSON inputs of at most 32 KiB each.
  const documents=[];
  for(const row of rows.slice(0,10)) {
    const draft=await env.USER_DOCUMENTS.get(row.current_key);
    requireValue(draft,'DEPENDENCY_UNAVAILABLE');
    documents.push({id:row.id,kind:row.kind,title:row.title,sourceTemplateId:row.template_id,
      revision:row.revision,updatedAt:new Date(row.updated*1000).toISOString(),data:await draft.json()});
  }
  const savedTemplates=(await env.DB.prepare('SELECT template_id,collection,saved FROM saved_templates WHERE user_id=? ORDER BY collection,saved').bind(identity.user.id).all()).results;
  const timeZone=await env.DB.prepare('SELECT time_zone FROM member_preferences WHERE user_id=?').bind(identity.user.id).first('time_zone');
  const support=(await env.DB.prepare('SELECT id,subject,message,received,closed FROM support_requests WHERE actor=? ORDER BY received DESC LIMIT 100').bind(identity.actor).all()).results;
  return {savedTemplates,timeZone,support,generatedAt:new Date().toISOString(),profile:{name:identity.user.name,email:identity.user.email},
    membership:await actorCall(env,identity.actor,'summary'),documents,nextCursor:rows.length>10?rows[9].id:null};
}
export async function closeAccount(request,env,identity,input) {
  requireValue(input.confirm==='DELETE');
  await reauthenticate(request,env,identity,input.password);
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO member_closures(user_id,requested) VALUES(?,?)').bind(identity.user.id,unix()),
    env.DB.prepare('DELETE FROM session WHERE userId=?').bind(identity.user.id),
    env.DB.prepare('UPDATE member_documents SET deleted=COALESCE(deleted,?) WHERE owner=?').bind(unix(),identity.actor)
  ]);
  await actorCall(env,identity.actor,'suspend');
  return {state:'pending_deletion'};
}
async function removeObjects(bucket,prefix) {
  const page=await bucket.list({prefix,limit:100});
  if(page.objects.length) await bucket.delete(page.objects.map(x=>x.key));
  return !page.truncated;
}
export async function retention(env) {
  const now=unix();
  await env.DB.batch([env.DB.prepare('DELETE FROM local_test_messages WHERE expires<=?').bind(now),
    env.DB.prepare('DELETE FROM local_inbox_nonces WHERE expires<?').bind(now),env.DB.prepare('DELETE FROM support_requests WHERE closed IS NOT NULL AND closed<?').bind(now-90*86400)]);
  await env.DB.prepare("UPDATE member_documents SET deleted=? WHERE owner LIKE 'guest:%' AND deleted IS NULL AND updated<?")
    .bind(now,now-7*86400).run();
  const expired=await env.DB.prepare('SELECT id FROM member_documents WHERE deleted IS NOT NULL AND deleted<=? ORDER BY deleted LIMIT 10').bind(now-86400).all();
  for(const {id} of expired.results) {
    const cleared=await Promise.all([removeObjects(env.USER_DOCUMENTS,'drafts/'+id+'/'),removeObjects(env.USER_DOCUMENTS,'exports/'+id+'/')]);
    if(!cleared.every(Boolean))continue;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM export_receipts WHERE asset_id IN (SELECT id FROM downloadable_assets WHERE document_id=?) OR fingerprint IN (SELECT substr(id,5) FROM export_jobs WHERE document_id=?)').bind(id,id),
      env.DB.prepare('DELETE FROM downloadable_assets WHERE document_id=?').bind(id),
      env.DB.prepare('DELETE FROM member_revisions WHERE document_id=?').bind(id),
      env.DB.prepare('DELETE FROM member_documents WHERE id=? AND deleted IS NOT NULL').bind(id)
    ]);
  }
  const closing=await env.DB.prepare('SELECT user_id,billing_cleared FROM member_closures ORDER BY requested LIMIT 10').all();
  for(const closure of closing.results) {
    const id=closure.user_id,actor='user:'+id;
    if(!closure.billing_cleared) {
      const customer=await env.DB.prepare('SELECT stripe_id FROM billing_customers WHERE user_id=?').bind(id).first('stripe_id');
      if(customer) await stopRenewals(env,customer);
      await env.DB.prepare('UPDATE member_closures SET billing_cleared=1 WHERE user_id=?').bind(id).run();
    }
    const remaining=await env.DB.prepare('SELECT id FROM member_documents WHERE owner=? LIMIT 1').bind(actor).first();
    if(remaining) continue;
    await actorCall(env,actor,'erase');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM billing_events WHERE customer_id IN (SELECT stripe_id FROM billing_customers WHERE user_id=?)').bind(id),
      env.DB.prepare('DELETE FROM billing_customers WHERE user_id=?').bind(id),
      env.DB.prepare('DELETE FROM guest_transfers WHERE target=?').bind(actor),
      env.DB.prepare('DELETE FROM export_receipts WHERE owner=?').bind(actor),
      env.DB.prepare('DELETE FROM support_requests WHERE actor=?').bind(actor),
      env.DB.prepare('DELETE FROM user WHERE id=?').bind(id),
      env.DB.prepare('DELETE FROM member_closures WHERE user_id=?').bind(id)
    ]);
  }
}
