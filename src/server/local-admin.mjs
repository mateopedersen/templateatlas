import {json,object,requireValue,sign,unix,uuid,verify} from './common.mjs';

export function localOperatorEnabled(env,request){
  if(env.DEPLOY_STAGE!=='local'||env.LOCAL_ADMIN_ENABLED!=='true'||env.LOCAL_ADMIN_ISSUER_SECRET?.length<32||!env.LOCAL_ADMIN_ISSUER_SECRET||!/^[A-Z2-7]{32,128}$/.test(env.LOCAL_ADMIN_TOTP_SEED||''))return false;
  try{const u=new URL(request.url);return u.origin===env.PUBLIC_SITE_URL && ['localhost','127.0.0.1','[::1]'].includes(u.hostname);}catch{return false;}
}
export async function localPrincipal(request,env){
  requireValue(localOperatorEnabled(env,request),'ACCESS_REVOKED');
  const cookie=/(?:^|;\s*)__Host-atlas-local-operator=([\w.-]+)/.exec(request.headers.get('cookie')||'')?.[1];
  const [time,id,mac]=(cookie||'').split('.'),now=unix();
  requireValue(/^\d{10}$/.test(time)&&uuid(id)&&Number(time)>now&&Number(time)<=now+900&&await verify(env.LOCAL_ADMIN_ISSUER_SECRET,'operator|'+env.PUBLIC_SITE_URL+'|'+time+'|'+id,mac),'ACCESS_REVOKED');
  return {sub:'local-owner',email:'local-owner',exp:Number(time),seed:env.LOCAL_ADMIN_TOTP_SEED};
}
export async function localOperatorLogin(request,env){
  requireValue(localOperatorEnabled(env,request),'NOT_FOUND');
  if(request.method==='GET'){
    const nonce=crypto.randomUUID();
    const page=`<!doctype html><html lang="en-US"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Local administrator sign-in</title><main><h1>Local administrator sign-in</h1><p id="s" role="status">Checking the one-time owner link…</p></main><script nonce="${nonce}">(async()=>{const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);try{if(!token)throw Error();const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});if(!r.ok)throw Error();location.replace('/admin/');}catch{document.getElementById('s').textContent='Open a fresh owner link with the local operator launcher.';}})()</script></html>`;
    return new Response(page,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex','Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}});
  }
  requireValue(request.method==='POST','METHOD_NOT_ALLOWED');
  const {token}=await object(request);requireValue(typeof token==='string'&&token.length<=200,'ACCESS_REVOKED');
  const [time,id,mac]=token.split('.'),now=unix();
  requireValue(/^\d{10}$/.test(time)&&uuid(id)&&Number(time)>=now&&Number(time)<=now+120&&await verify(env.LOCAL_ADMIN_ISSUER_SECRET,'login|'+env.PUBLIC_SITE_URL+'|'+time+'|'+id,mac),'ACCESS_REVOKED');
  const used=await env.DB.prepare('INSERT OR IGNORE INTO local_inbox_nonces VALUES(?,?)').bind('operator:'+id,Number(time)).run();requireValue(used.meta.changes===1,'ACCESS_REVOKED');
  const expires=now+900,s=await sign(env.LOCAL_ADMIN_ISSUER_SECRET,'operator|'+env.PUBLIC_SITE_URL+'|'+expires+'|'+id);
  const r=json({next:'/admin/'});r.headers.append('Set-Cookie','__Host-atlas-local-operator='+expires+'.'+id+'.'+s+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=900');return r;
}
