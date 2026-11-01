import {localPrincipal} from './local-admin.mjs';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {createOTP} from '@better-auth/utils/otp';
import {base32} from '@better-auth/utils/base32';
import {ApiError,actorCall,digest,isId,json,object,requireValue,unix} from './common.mjs';
import {formatMimes} from './documents.mjs';

const certs=new Map();
async function access(request,env){
  if(env.LOCAL_ADMIN_ENABLED==='true')return localPrincipal(request,env);
  const issuer=env.ACCESS_ISSUER, aud=env.ACCESS_AUD, raw=request.headers.get('cf-access-jwt-assertion');
  requireValue(/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer||'') && aud && env.ADMIN_TOTP_KEYS && raw?.length<24000,'ACCESS_REVOKED');
  try{
    if(!certs.has(issuer))certs.set(issuer,createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs'),{timeoutDuration:6000}));
    const {payload}=await jwtVerify(raw,certs.get(issuer),{issuer,audience:aud,algorithms:['RS256'],requiredClaims:['sub','exp','email','iat']});
    const email=String(payload.email).toLowerCase(),keys=JSON.parse(env.ADMIN_TOTP_KEYS);
    requireValue(payload.type==='app' && Object.hasOwn(keys,email) && /^[A-Z2-7]{32,128}$/.test(keys[email]),'ACCESS_REVOKED');
    return {sub:payload.sub,email,exp:payload.exp,seed:keys[email]};
  }catch{throw new ApiError('ACCESS_REVOKED');}
}
export async function guardAdminPage(request,env){
  try{await access(request,env);return null;}catch{return new Response('Administrator access is required.',{status:403,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'}});}
}
async function unlock(request,env,a){
  await actorCall(env,'admin:'+a.sub,'reauth-limit');
  const {code}=await object(request),now=unix(),counter=Math.floor(now/30);
  requireValue(typeof code==='string' && /^\d{6}$/.test(code),'ACCESS_REVOKED');
  requireValue(await createOTP(base32.decode(a.seed)).verify(code,{window:0}),'ACCESS_REVOKED');
  const nonce=crypto.randomUUID(),expires=Math.min(a.exp,now+600);
  const result=await env.DB.prepare(`INSERT INTO admin_unlocks VALUES(?,?,?,?) ON CONFLICT(subject)
    DO UPDATE SET token_hash=excluded.token_hash,last_counter=excluded.last_counter,expires=excluded.expires
    WHERE admin_unlocks.last_counter<excluded.last_counter`).bind(a.sub,await digest(nonce),counter,expires).run();
  requireValue(result.meta.changes===1,'ACCESS_REVOKED');
  const r=json({unlocked:true,expires});r.headers.append('Set-Cookie','__Host-atlas-operator='+nonce+'; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age='+Math.max(0,expires-now));return r;
}
async function catalogRows(env,id){
  const rows=(await env.DB.prepare(`SELECT id,template_id,version,format,sha256,size_bytes,mime,object_key
    FROM downloadable_assets WHERE template_id=? AND document_id IS NULL AND published=1 ORDER BY id`).bind(id).all()).results;
  requireValue(rows.length>0 && rows.length<=32,'NOT_FOUND');
  const held=!!(await env.DB.prepare('SELECT audit_id FROM delivery_holds WHERE template_id=?').bind(id).first());
  const fingerprint=await digest(JSON.stringify([held,rows.map(r=>[r.id,r.version,r.sha256])]));
  return {rows,held,fingerprint};
}
const safeReason=input=>{requireValue(typeof input.reason==='string' && input.reason.trim().length>=6 && input.reason.length<=180);return input.reason.trim();};
async function deliveryChange(env,a,templateId,action,input){
  const {rows,held,fingerprint}=await catalogRows(env,templateId), reason=safeReason(input);
  requireValue(fingerprint===input.expected && (action==='publish'?held:!held),'REVISION_CONFLICT');
  if(action==='publish'){
    for(const r of rows){
      requireValue(r.size_bytes<=25000000 && r.mime===formatMimes[r.format],'FORMAT_UNAVAILABLE');
      const obj=await env.ASSET_ORIGINALS.get(r.object_key);
      requireValue(obj && obj.size===r.size_bytes && obj.customMetadata?.sha256===r.sha256,'FORMAT_UNAVAILABLE');
      requireValue(await digest(await obj.arrayBuffer())===r.sha256,'FORMAT_UNAVAILABLE');
    }
  }
  const event=crypto.randomUUID();
  const checks=rows.map(()=>'(id=? AND sha256=? AND version=?)').join(' OR ');
  // Write the audit record only when the same immutable files and prior hold still exist.
  const verifyAudit=env.DB.prepare(`INSERT INTO operator_audit SELECT ?,?,?,?,?,? WHERE
    (SELECT count(*) FROM downloadable_assets WHERE template_id=? AND published=1)=? AND
    (SELECT count(*) FROM downloadable_assets WHERE template_id=? AND published=1 AND (${checks}))=? AND
    EXISTS(SELECT 1 FROM delivery_holds WHERE template_id=?)=?`).bind(event,a.email,action,templateId,reason,unix(),templateId,rows.length,
      templateId,...rows.flatMap(r=>[r.id,r.sha256,r.version]),rows.length,templateId,held?1:0);
  const update=action==='publish'?env.DB.prepare('DELETE FROM delivery_holds WHERE template_id=? AND EXISTS(SELECT 1 FROM operator_audit WHERE id=?)').bind(templateId,event)
    :env.DB.prepare('INSERT INTO delivery_holds SELECT target,id FROM operator_audit WHERE id=?').bind(event);
  const [audit]=await env.DB.batch([verifyAudit,update]);
  requireValue(audit.meta.changes===1,'REVISION_CONFLICT');
  return json({held:action!=='publish'});
}
export async function adminApi(request,env,path,runMaintenance){
  const a=await access(request,env),method=request.method,url=new URL(request.url);
  if(path==='/api/admin/unlock' && method==='POST')return unlock(request,env,a);
  const nonce=/(?:^|;\s*)__Host-atlas-operator=([a-f\d-]{36})(?:;|$)/.exec(request.headers.get('cookie')||'')?.[1];
  const ok=nonce && await env.DB.prepare('SELECT 1 AS allowed FROM admin_unlocks WHERE subject=? AND token_hash=? AND expires>?').bind(a.sub,await digest(nonce),unix()).first();
  if(path==='/api/admin/session' && method==='GET')return json({unlocked:!!ok});
  requireValue(ok,'ACCESS_REVOKED');
  if(path==='/api/admin/catalog' && method==='GET'){
    const templateId=url.searchParams.get('id');
    if(templateId){requireValue(isId(templateId));const {rows,held,fingerprint}=await catalogRows(env,templateId);
      return json({id:templateId,held,fingerprint,files:rows.map(({format,size_bytes,version})=>({format,bytes:size_bytes,version}))});}
    const q=(url.searchParams.get('q')||'').slice(0,120);
    const rows=await env.DB.prepare(`SELECT a.template_id id,count(*) files,max(h.template_id IS NOT NULL) held
      FROM downloadable_assets a LEFT JOIN delivery_holds h ON h.template_id=a.template_id WHERE a.template_id IS NOT NULL
      AND published=1 AND instr(a.template_id,?)>0 GROUP BY a.template_id ORDER BY a.template_id LIMIT 50`).bind(q).all();return json({templates:rows.results});
  }
  const change=/^\/api\/admin\/templates\/([\w-]+)\/(publish|unpublish)$/.exec(path);
  if(change && method==='POST')return deliveryChange(env,a,change[1],change[2],await object(request));
  if(path==='/api/admin/support' && method==='GET'){
    return json({requests:(await env.DB.prepare('SELECT id,email,subject,message,received FROM support_requests WHERE closed IS NULL ORDER BY received,id LIMIT 50').all()).results});
  }
  if(path==='/api/admin/support/close' && method==='POST'){
    const input=await object(request);requireValue(typeof input.id==='string' && /^TA-[A-F0-9]{20}$/.test(input.id));
    const ev=crypto.randomUUID(),now=unix();
    const [log]=await env.DB.batch([env.DB.prepare('INSERT INTO operator_audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM support_requests WHERE id=? AND closed IS NULL)')
      .bind(ev,a.email,'support_close',input.id,safeReason(input),now,input.id),env.DB.prepare('UPDATE support_requests SET closed=? WHERE id=? AND EXISTS(SELECT 1 FROM operator_audit WHERE id=?)').bind(now,input.id,ev)]);
    requireValue(log.meta.changes===1,'NOT_FOUND');return json({closed:true});
  }
  if(path==='/api/admin/audit' && method==='GET'){
    return json({events:(await env.DB.prepare('SELECT operator,action,target,reason,created FROM operator_audit ORDER BY created DESC,id LIMIT 100').all()).results});
  }
  if(path==='/api/admin/members' && method==='POST'){
    const input=await object(request),email=String(input.email).trim().toLowerCase();
    requireValue(email.length<=254 && email.includes('@'));
    const member=await env.DB.prepare('SELECT id,email,name,emailVerified FROM user WHERE email=?').bind(email).first();requireValue(member,'NOT_FOUND');
    await env.DB.prepare('INSERT INTO operator_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),a.email,'member_lookup',member.id,safeReason(input),unix()).run();
    return json({email:member.email,name:member.name,verified:!!member.emailVerified});
  }
  if(path==='/api/admin/jobs/retry' && method==='POST'){
    const reason=safeReason(await object(request));
    await env.DB.prepare('INSERT INTO operator_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),a.email,'retry_pending','maintenance',reason,unix()).run();
    await runMaintenance(env);return json({processed:true});
  }
  if(path==='/api/admin/overview' && method==='GET'){
    const row=await env.DB.prepare(`SELECT (SELECT COUNT(DISTINCT template_id) FROM downloadable_assets WHERE published=1) catalogTemplates,
      (SELECT COUNT(*) FROM delivery_holds) deliveryHolds,(SELECT COUNT(*) FROM guest_transfers WHERE completed=0) pendingTransfers,
      (SELECT COUNT(*) FROM billing_events WHERE applied IS NULL) pendingBillingEvents,(SELECT COUNT(*) FROM member_closures) pendingClosures`).first();return json(row);
  }
  throw new ApiError('NOT_FOUND');
}
