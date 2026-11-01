const sourceFormats=new Set(['svg','xlsx','pptx','docx']);
const outputFormats=new Set(['pdf','jpg','preview-jpg']);
const encoder=new TextEncoder();
const maxBytes=8_000_000;
export const idleMilliseconds=120_000;
const privateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function invalid(status){return new Response(null,{status,headers:privateHeaders});}
function authorized(request,secret){
 if(typeof secret!=='string'||secret.length<32||secret.length>256)return false;
 const supplied=encoder.encode(request.headers.get('authorization')??''),wanted=encoder.encode('Bearer '+secret);
 if(supplied.length!==wanted.length)return false;
 let difference=0;for(let i=0;i<wanted.length;i++)difference|=supplied[i]^wanted[i];return difference===0;
}
export async function gateway(request,env){
 const url=new URL(request.url);
 if(url.hostname!=='private-renderer.internal'||url.pathname!=='/v1/render'||url.search||request.method!=='POST'||!authorized(request,env.RENDER_SECRET))return invalid(404);
 if(request.headers.get('content-type')!=='application/octet-stream'||!sourceFormats.has(request.headers.get('x-source-format'))||!outputFormats.has(request.headers.get('x-output-format')))return invalid(400);
 const claimed=Number(request.headers.get('content-length')||0);if(claimed>maxBytes)return invalid(413);
 if(!request.body)return invalid(400);
 const reader=request.body.getReader();let length=0;const parts=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>maxBytes){await reader.cancel();return invalid(413);}parts.push(value);}}finally{reader.releaseLock();}
 if(!length)return invalid(400);
 const bytes=new Uint8Array(length);let pos=0;for(const part of parts){bytes.set(part,pos);pos+=part.length;}
 const id=env.RENDER_INSTANCES.idFromName('private-renderer-v1');
 const forwarded=new Request('https://container.internal/v1/render',{method:'POST',body:bytes,headers:{'content-type':'application/octet-stream','x-source-format':request.headers.get('x-source-format'),'x-output-format':request.headers.get('x-output-format')},redirect:'manual'});
 return env.RENDER_INSTANCES.get(id).fetch(forwarded);
}
export async function transportToken(secret){
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode('TemplateAtlas private container transport v1')));return [...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function proxy(container,request,secret){
 if(!container||typeof secret!=='string'||secret.length<32)return invalid(503);
 const token=await transportToken(secret),auth='Bearer '+token;
 // No awaits between the state check and start: two requests cannot start the same instance.
 if(!container.running)container.start({enableInternet:false,env:{TEMPLATEATLAS_RENDER_SECRET:token}});
 await container.setInactivityTimeout(idleMilliseconds);
 const port=container.getTcpPort(8080);
 let ready=false;
 for(let i=0;i<25;i++){
  try{const result=await port.fetch('http://container/health',{headers:{authorization:auth},redirect:'manual',signal:AbortSignal.timeout(600)});await result.body?.cancel();if(result.status===200){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,200));
 }
 if(!ready)return invalid(503);
 const bytes=await request.arrayBuffer();
 const headers={'authorization':auth,'content-type':'application/octet-stream','x-source-format':request.headers.get('x-source-format'),'x-output-format':request.headers.get('x-output-format')};
 try{
  // Never repeat a conversion after the container accepted the body.
  const rendered=await port.fetch('http://container/v1/render',{method:'POST',headers,body:bytes,redirect:'manual',signal:AbortSignal.timeout(65000)});
  if(rendered.status!==200){await rendered.body?.cancel();return invalid(rendered.status===422?422:503);}
  const type=rendered.headers.get('content-type'),size=Number(rendered.headers.get('content-length'));
  if(!['application/pdf','image/jpeg'].includes(type)||!Number.isSafeInteger(size)||size<1||size>maxBytes){await rendered.body?.cancel();return invalid(502);}
  const verified=await rendered.arrayBuffer();
  if(verified.byteLength!==size)return invalid(502);
  // Known-length body survives both Cloudflare service-binding hops.
  return new Response(verified,{headers:{...privateHeaders,'Content-Type':type,'Content-Length':String(size)}});
 }catch{return invalid(503);}
}
