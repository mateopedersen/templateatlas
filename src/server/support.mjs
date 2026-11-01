import {actorCall,digest,requireValue,unix} from './common.mjs';

export async function createSupport(env,request,identity,input,idem){
  const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
  requireValue(email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  requireValue(typeof input.subject==='string' && typeof input.message==='string');
  const subject=input.subject.trim(),message=input.message.trim();
  requireValue(typeof subject==='string'&&subject.length>=3&&subject.length<=100&&typeof message==='string'&&message.length>=12&&message.length<=3000&&input.consent===true);
  const id='TA-'+(await digest(identity.actor+'|'+idem)).slice(0,20).toUpperCase();
  const prior=await env.DB.prepare('SELECT email,subject,message FROM support_requests WHERE id=? AND actor=?').bind(id,identity.actor).first();
  if(prior){requireValue(email===prior.email&&subject===prior.subject&&message===prior.message,'IDEMPOTENCY_CONFLICT');return {id,state:'received'};}
  await actorCall(env,identity.actor,'support-limit');
  const ip=request.headers.get('cf-connecting-ip');
  if(ip)await actorCall(env,'support-risk:'+await digest(env.GUEST_COOKIE_SIGNING_KEY+'|'+ip+'|'+Math.floor(unix()/86400)),'support-network-limit');
  await env.DB.prepare('INSERT OR IGNORE INTO support_requests VALUES(?,?,?,?,?,?,NULL)').bind(id,identity.actor,email,subject,message,unix()).run();
  const stored=await env.DB.prepare('SELECT email,subject,message FROM support_requests WHERE id=? AND actor=?').bind(id,identity.actor).first();
  requireValue(stored?.email===email&&stored.subject===subject&&stored.message===message,'IDEMPOTENCY_CONFLICT');
  return {id,state:'received'};
}
