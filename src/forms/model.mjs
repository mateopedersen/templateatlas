export const fieldTypes=Object.freeze({short:'Short answer',long:'Long answer',date:'Date',number:'Number',choice:'Choose one',checkbox:'Checkbox'});
export const fieldId=()=>crypto.randomUUID();
export function field(type='short'){
 if(!Object.hasOwn(fieldTypes,type))throw Error('Choose a supported field type.');
 return {id:fieldId(),type,label:'New field',help:'',required:false,options:type==='choice'?['Option A','Option B']:[]};
}
export function starter(){
 const f=(type,label,required=false,help='',options=[])=>({...field(type),label,required,help,options});
 return {title:'Workshop registration',description:'Complete this form to request a place in the workshop.',fields:[f('short','Participant name',true),f('date','Preferred date',false,'Use MM/DD/YYYY.'),f('choice','Session',true,'Choose one session.',['Morning','Afternoon']),f('long','Accessibility requests')]};
}
function text(value,max,name,required=false){
 if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||(required&&!value.trim()))throw Error(name+' must contain '+(required?'1':'0')+'–'+max+' characters.');
 return value.trim();
}
export function validateForm(raw){
 if(!raw||typeof raw!=='object'||!Array.isArray(raw.fields)||raw.fields.length<1||raw.fields.length>30)throw Error('Add between 1 and 30 fields.');
 const title=text(raw.title,100,'Form title',true),description=text(raw.description??'',320,'Instructions'),ids=new Set();
 const fields=raw.fields.map((f,i)=>{
  if(!f||typeof f!=='object'||typeof f.id!=='string'||!/^[-A-Za-z0-9_]{8,64}$/.test(f.id)||ids.has(f.id))throw Error('Each field needs a unique, stable ID.');ids.add(f.id);
  if(!Object.hasOwn(fieldTypes,f.type)||typeof f.required!=='boolean')throw Error('Check the type and requirement for field '+(i+1)+'.');
  const label=text(f.label,90,'Field '+(i+1)+' label',true),help=text(f.help??'',180,'Field help'),options=f.options??[];
  if(!Array.isArray(options)||options.length>10||(f.type==='choice'?options.length<2:options.length!==0))throw Error('Provide 2–10 options for a single-choice field.');
  const normalized=options.map(v=>text(v,60,'Option text',true));if(new Set(normalized.map(v=>v.toLowerCase())).size!==normalized.length)throw Error('Use distinct choice options.');
  return {id:f.id,type:f.type,label,help,required:f.required,options:normalized};
 });return {title,description,fields};
}
export function moveField(model,id,delta){
 const index=model.fields.findIndex(f=>f.id===id),target=index+delta;
 if(index<0||![-1,1].includes(delta)||target<0||target>=model.fields.length)return false;
 const [f]=model.fields.splice(index,1);model.fields.splice(target,0,f);return true;
}
