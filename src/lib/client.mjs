import {awaitExport} from './export-state.mjs';
const messages={SIGNUP_REQUIRED:'Your five free selections are in use. Create and verify an account to start your 30-day trial.',EMAIL_VERIFICATION_REQUIRED:'Verify your email to use your trial.',MEMBERSHIP_REQUIRED:'Your trial has ended. Choose a membership for new downloads.',DEPENDENCY_UNAVAILABLE:'This service is currently unavailable. Please try again later.',RATE_LIMITED:'Too many requests. Please wait a moment before trying again.',REVISION_CONFLICT:'A newer revision exists. Reload your saved document before editing.'};
export async function api(path,data,method=data?'POST':'GET',key){
 const r=await fetch(path,{method,credentials:'same-origin',headers:{...(data?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:data?JSON.stringify(data):undefined});
 const v=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error(messages[v.code]||v.message||'The request could not be completed.'),{code:v.code});return v;
}
export async function download(input){await api('/api/session');const {url}=await api('/api/download-intents',input,'POST',crypto.randomUUID());const r=await fetch(url);if(!r.ok)throw Error('The download could not be delivered. Please try again.');const a=document.createElement('a'),u=URL.createObjectURL(await r.blob());a.href=u;a.download=r.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]||'template.'+input.format;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);}
export function editorClient(kind,templateId){let saved=null,last='';
 return async(data,format)=>{await api('/api/session');const repr=JSON.stringify(data);
 if(!saved)saved=await api('/api/documents',{kind,templateId,data});else if(last!==repr)saved=await api('/api/documents/'+saved.id,{expectedRevision:saved.revision,data},'PATCH');
 last=repr;const response=await api('/api/exports',{documentId:saved.id,documentRevision:saved.revision,format,paper:'letter'},'POST',saved.id+'-'+saved.revision+'-'+format);await download((await awaitExport(response)).intent);};
}
