import {awaitExport} from '../lib/export-state.mjs';
const messages={GUEST_SESSION_REQUIRED:'Reload the page to reconnect your visitor session.',UNAUTHENTICATED:'Sign in to open this document.',SIGNUP_REQUIRED:'You have used your five free selections. Create an account to start your trial.',EMAIL_VERIFICATION_REQUIRED:'Verify your email to start your trial.',MEMBERSHIP_REQUIRED:'Your trial has ended. An active membership is required for a new selection.',REVISION_CONFLICT:'The source or document changed. Reopen the current template before applying your edits.',FORMAT_UNAVAILABLE:'The original is unavailable for editing. Your entries are saved in this tab.',RATE_LIMITED:'Please wait a moment before trying again.',VALIDATION_ERROR:'Check your entries and try again.',NOT_FOUND:'This document is unavailable in the current session.'};
function init(root){
 const find=s=>root.querySelector(s),templateId=root.dataset.templateId,title=root.dataset.templateTitle,storeKey='templateatlas.native.v1.'+templateId;
 const status=t=>find('[data-native-message]').textContent=t;const name=find('[data-native-name]'),start=find('[data-native-start]'),panel=find('[data-native-fields]'),form=find('form');
 let schema=null,edits={},record=null,pending=false,opened=false;
 async function call(url,method='GET',data,idem=false){const headers={'content-type':'application/json'};if(idem)headers['Idempotency-Key']=crypto.randomUUID();
  const res=await fetch(url,{method,credentials:'same-origin',headers,body:data===undefined?undefined:JSON.stringify(data)});let result;try{result=await res.json();}catch{throw Error('The service could not be reached. Try again.');}
  if(!res.ok){find('[data-native-gate]').hidden=!['SIGNUP_REQUIRED','EMAIL_VERIFICATION_REQUIRED','MEMBERSHIP_REQUIRED'].includes(result.code);throw Error(messages[result.code]??'We could not complete this request. Please try again.');}return result;
 }
 function persist(){try{sessionStorage.setItem(storeKey,JSON.stringify({name:name.value,edits,record,sourceHash:schema.sourceHash}));return true;}catch{return false;}}
 function changed(){const ok=persist();status(ok?'Changes saved in this tab.':'Your browser could not save the changes. Keep this page open.');}
 function controls(){
  const first=find('[data-native-inputs]'),extra=find('[data-native-extra]');first.replaceChildren();extra.replaceChildren();find('[data-native-more]').hidden=schema.fields.length<=4;
  schema.fields.forEach((f,i)=>{const wrap=document.createElement('label'),text=document.createTextNode(f.label);
   if(f.type==='section'){const control=document.createElement('select');for(const [value,label] of [['','Include in this copy'],['omit','Omit from this copy']]){const o=document.createElement('option');o.value=value;o.textContent=label;control.append(o);}control.value=edits[f.id]??'';control.onchange=()=>{if(control.value)edits[f.id]=control.value;else delete edits[f.id];changed();};wrap.append(text,control);(i<4?first:extra).append(wrap);return;}
   const input=document.createElement('input');input.name=f.id;input.type=f.type==='date'?'date':f.type==='number'?'number':'text';input.maxLength=f.maxLength;if(input.type==='number')input.step='any';
   input.value=edits[f.id]??'';input.placeholder='Keep original';input.oninput=()=>{if(input.value.trim())edits[f.id]=input.value;else delete edits[f.id];changed();};wrap.append(text,input);(i<4?first:extra).append(wrap);
  });const selector=find('[data-native-format]');selector.replaceChildren();for(const fmt of schema.formats??[schema.format]){const opt=document.createElement('option');opt.value=fmt;opt.textContent=fmt===schema.format?fmt.toUpperCase()+' · editable original':fmt==='pdf'?'PDF document':'JPEG · first page';selector.append(opt);}const label=()=>{find('[data-native-export]').textContent='Download edited '+selector.value.toUpperCase();find('[data-native-image]').hidden=selector.value!=='jpg';};selector.onchange=label;label();
 }
 async function open(){
  if(pending||opened)return;pending=true;start.disabled=true;status('Loading the template fields…');
  try{await call('/api/session');
   const requested=new URLSearchParams(location.search).get('document');
   if(requested&&/^[\da-f-]{36}$/i.test(requested)){
    const doc=await call('/api/documents/'+requested);
    if(doc.kind!=='template'||doc.templateId!==templateId)throw Error('Open this saved document from its original template.');
    if(!doc.source)throw Error('The approved original for this document is unavailable for editing.');
    schema=doc.source;name.value=doc.data.title;edits=doc.data.edits;record={id:requested,revision:doc.revision,snapshot:JSON.stringify(doc.data)};
   }else{
    schema=await call('/api/template-fields/'+encodeURIComponent(templateId));
    let local;try{local=JSON.parse(sessionStorage.getItem(storeKey));}catch{}
    if(local?.sourceHash===schema.sourceHash){name.value=local.name||title;edits=local.edits??{};record=local.record??null;}
   }
   controls();panel.hidden=false;start.hidden=true;opened=true;status('Complete any fields you want to change. Blank fields keep their original content.');panel.querySelector('input')?.focus();
  }catch(e){status(e.message);}finally{pending=false;start.disabled=false;}
 }
 async function submit(download){
  if(pending||!schema||!form.reportValidity())return;if(!Object.keys(edits).length){status('Enter at least one template field before saving or exporting.');return;}pending=true;form.inert=true;status('Saving your document…');
  try{await call('/api/session');const data={title:name.value.trim(),sourceVersion:schema.sourceVersion,sourceHash:schema.sourceHash,edits};
   const snapshot=JSON.stringify(data);
   if(!record){const r=await call('/api/documents','POST',{kind:'template',templateId,data});record={id:r.id,revision:r.revision,snapshot};}
   else if(record.snapshot!==snapshot){const r=await call('/api/documents/'+record.id,'PATCH',{expectedRevision:record.revision,data});record={id:record.id,revision:r.revision,snapshot};}
   persist();if(!download){status('Saved. Document revision '+record.revision+'.');return;}
   status('Preparing revision '+record.revision+'…');let job=await call('/api/exports','POST',{documentId:record.id,documentRevision:record.revision,format:find('[data-native-format]').value,paper:'letter'},true);job=await awaitExport(job,status);const ticket=await call('/api/download-intents','POST',job.intent,true);const url=new URL(ticket.url,location.origin);if(url.origin!==location.origin||!url.pathname.startsWith('/api/downloads/'))throw Error('The download link is unavailable.');status('Your edited file is ready.');location.assign(url.href);
  }catch(e){status(e.message);}finally{pending=false;form.inert=false;}
 }
 name.oninput=changed;start.onclick=open;find('[data-native-save]').onclick=()=>submit(false);form.onsubmit=e=>{e.preventDefault();submit(true);};
 if(root.dataset.expanded==='yes')open();
}
document.querySelectorAll('.native-customize').forEach(init);
