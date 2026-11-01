// Select editable locations from an approved master. Client input never supplies XML, ZIP paths or cell addresses.
import {unzipSync,zipSync,strToU8,strFromU8} from 'fflate';
export const nativeMimes={docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',svg:'image/svg+xml'};
const clean=s=>String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
const esc=s=>clean(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const unesc=s=>s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,v)=>v[0]==='#'?String.fromCodePoint(v[1]==='x'?parseInt(v.slice(2),16):Number(v.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[v]);
const attr=(s,n)=>new RegExp('(?:^|\\s)'+n+'=["\']([^"\']*)["\']').exec(s)?.[1];
const word=s=>s.replace(/\s+/g,' ').trim();
const cap=s=>s[0]?.toUpperCase()+s.slice(1);
const nodes=(xml,regexp)=>[...xml.matchAll(regexp)].map(m=>({start:m.index,end:m.index+m[0].length,raw:m[0],v:unesc(m[1]??'')}));
function replaceSlices(xml,edits){let result=xml;for(const [a,b,s] of [...edits].sort((x,y)=>y[0]-x[0]))result=result.slice(0,a)+s+result.slice(b);return result;}
const content=/^<[^>]+>([\s\S]*)<\/[^>]+>$/;
function inner(node,s){const a=node.raw.indexOf('>')+1,b=node.raw.lastIndexOf('</');return [node.start+a,node.start+b,esc(s)];}
function officeText(xml,type,part,fields,add,changes){
 const wordFile=type==='docx';const pars=wordFile?/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g:/<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g;
 const tag=wordFile?/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g:/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
 const replacements=[];let found=0;const paragraphs=[];
 for(const par of xml.matchAll(pars)){
  const ns=nodes(par[0],tag);if(!ns.length)continue;ns.forEach(n=>{n.start+=par.index;n.end+=par.index;});
  const text=ns.map(n=>n.v).join('');paragraphs.push({text,ns});let block=[];let place=0;
  for(const node of ns){block.push([place,place+node.v.length,node]);place+=node.v.length;}
  const inside=new Map();
  for(const mark of text.matchAll(/\[([^\[\]\r\n]{1,90})\]/g)){
   if(fields.length>=64)break;
   const before=word(text.slice(0,mark.index)).split(/[.;!?:]/).at(-1).trim();const hint=word(mark[1].replace(/^enter\s+/i,''));const short=before.length>=2&&before.length<=42?before:'';
   const label=cap(short&&short.toLowerCase()!==hint.toLowerCase()&&!/^dear$/i.test(short)?short+' · '+hint:hint);
   const id=add(label,'text',wordFile?240:100);found++;
   if(!Object.hasOwn(changes,id))continue;
   const end=mark.index+mark[0].length;
   for(const [a,b,node] of block){if(b<=mark.index||a>=end)continue;const entry=inside.get(node)??[];entry.push([Math.max(0,mark.index-a),Math.min(node.v.length,end-a),a<=mark.index?changes[id]:'']);inside.set(node,entry);}
  }
  for(const [node,v] of inside)replacements.push(inner(node,replaceSlices(node.v,v)));
 }
 // Slide decks without bracket fields expose editable, bounded text runs, retaining the remaining shapes.
 if((!found&&!wordFile)||(!found&&wordFile&&!fields.length)){
  const slide=part.match(/slide(\d+)\.xml$/)?.[1];let section='';let count=0;
  for(const {text,ns} of paragraphs){
   const labelText=word(text);if(labelText.length<3||labelText.length>400||/^\d+\s*\//.test(labelText)||labelText===labelText.toUpperCase())continue;
   if(fields.length>=64||count>=12)break;
   const standalone=labelText.length<=43&&!/[.!?]$/.test(labelText);
   const label=(slide?'Slide '+slide+' · ':'')+(standalone?labelText:section?section+' text':'Opening text');if(standalone)section=labelText;
   const id=add(label,'text',Math.min(240,Math.max(36,labelText.length+45)));count++;
   if(Object.hasOwn(changes,id))ns.forEach((node,i)=>replacements.push(inner(node,i===0?changes[id]:'')));
  }
 }
 return replaceSlices(xml,replacements);
}
function svgText(xml,fields,add,changes){
 const ns=nodes(xml,/<text(?:\s[^>]*)?>([^<]*)<\/text>/g);const groups=new Map();
 for(const node of ns){const orig=word(node.v);if(!orig||orig.length>120||/^\d{1,3}$|^[A-F]$|^0\d$/.test(orig))continue;
  if(!groups.has(orig))groups.set(orig,[]);groups.get(orig).push(node);
 }
 const ordered=[...groups].sort(([a],[b])=>{const rank=t=>t===t.toUpperCase()?3:t.length<=38?0:t.length<65?1:2;return rank(a)-rank(b);});
 const edits=[];for(const [s,group] of ordered.slice(0,36)){const label=s.length<=46?s:'Text line '+(fields.length+1);
  const id=add(label,'text',Math.min(120,Math.max(12,Math.ceil(s.length*1.5))));if(Object.hasOwn(changes,id))for(const node of group)edits.push(inner(node,changes[id]));}
 // Bind repeated labels on print-and-cut cards to the same input.
 return replaceSlices(xml,edits);
}
const cellRe=/<(?:\w+:)?c(?=[\s/>])([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
const localText=(xml,tag)=>[...xml.matchAll(new RegExp('<(?:\\w+:)?'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?'+tag+'>','g'))].map(m=>unesc(m[1]));
function xlsxStyles(parts){
 const xml=strFromU8(parts['xl/styles.xml']??new Uint8Array());const body=name=>new RegExp('<(?:\\w+:)?'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?'+name+'>').exec(xml)?.[1]??'';
 const fonts=[...body('fonts').matchAll(/<(?:\w+:)?font(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?font>/g)].map(m=>attr(m[1],'rgb')?.slice(-6)?.toLowerCase());
 const fmts=new Map([...xml.matchAll(/<(?:\w+:)?numFmt\s([^>]+)\/>/g)].map(m=>[attr(m[1],'numFmtId'),unesc(attr(m[1],'formatCode')??'')]));
 const styles=[...body('cellXfs').matchAll(/<(?:\w+:)?xf(?=[\s>])([^>]*?)\/?>/g)].map(m=>{const color=fonts[Number(attr(m[1],'fontId'))],n=attr(m[1],'numFmtId')??'0';return {input:['1f526c','164c69','185585','194e69','245779','174b6b','23628a'].includes(color),date:(+n>=14&&+n<=17)||/y{2,4}|m{1,3}\/d/i.test(fmts.get(n)??'')};});return styles;
}
function cellText(attrs,body,ss){const t=attr(attrs,'t');if(t==='inlineStr')return localText(body,'t').join('');const val=localText(body,'v')[0]??'';return t==='s'&&val!==''?ss[Number(val)]??'':val;}
function xlsxVisit(xml,name,ss,styles,fields,add,changes){
 const all=[],byRef=new Map();const prefix=/<(\w+:)?worksheet\b/.exec(xml)?.[1]??'';
 for(const m of xml.matchAll(cellRe)){const r=attr(m[1],'r'),loc=/^([A-Z]+)(\d+)$/.exec(r??'');if(!loc)continue;const cell={start:m.index,end:m.index+m[0].length,attrs:m[1],body:m[2]??'',r,col:loc[1],row:+loc[2],style:styles[Number(attr(m[1],'s')??0)]??{},value:cellText(m[1],m[2]??'',ss)};all.push(cell);byRef.set(r,cell);}
 const chosen=all.filter(c=>c.style.input&&!/<(?:\w+:)?f\b/.test(c.body));const selected=chosen.length?chosen:all.filter(c=>c.col==='A'&&c.row<=4&&c.value.length>2&&!/^\d/.test(c.value)).slice(0,3);
 const edits=[];
 for(const c of selected){if(fields.length>=64)break;
  let label='',kind='text';const parent=byRef.get(c.col+(c.row-1));
  const direct=typeof parent?.value==='string'&&!Number.isFinite(Number(parent.value))&&parent.value.length<=55?parent.value:'';
  const h=all.findLast(o=>o.col===c.col&&o.row<c.row&&o.row>=4&&!o.style.input&&o.value&&o.value.length<=42&&!Number.isFinite(Number(o.value)));
  if(parent?.style.date&&Number(parent.value)>30000){label='Note for '+new Date((Number(parent.value)-25569)*86400000).toISOString().slice(0,10);}
  else if(!chosen.length){label=c.row===1?'Section heading':c.row===2?'Worksheet title':'Worksheet introduction';}
  else{label=(h?.value||direct||c.r)+' · row '+c.row;const origType=attr(c.attrs,'t');if(c.style.date)kind='date';else if(origType!=='s'&&origType!=='str'&&c.value!==''&&Number.isFinite(Number(c.value)))kind='number';}
  const id=add(name+' · '+label,kind,kind==='text'?120:24);if(!Object.hasOwn(changes,id))continue;let value=changes[id],body='';
  let attrs=c.attrs.replace(/\s+t\s*=\s*(?:"[^"]*"|'[^']*')/g,'').replace(/\s*\/$/,'');
  if(kind==='number'||kind==='date'){if(kind==='date')value=String(Date.parse(value+'T00:00:00Z')/86400000+25569);body='<'+prefix+'v>'+value+'</'+prefix+'v>';}
  else{attrs+=' t="inlineStr"';body='<'+prefix+'is><'+prefix+'t xml:space="preserve">'+esc(value)+'</'+prefix+'t></'+prefix+'is>';}
  edits.push([c.start,c.end,'<'+prefix+'c'+attrs+'>'+body+'</'+prefix+'c>']);
 }
 return replaceSlices(xml,edits);
}
export function nativeEditor(bytes,format,changes={},options={}){
 if(!Object.hasOwn(nativeMimes,format)||!(bytes instanceof Uint8Array)||bytes.byteLength<10||bytes.byteLength>8_000_000)throw Error('Unsupported native source.');
 if(!changes||Array.isArray(changes)||typeof changes!=='object'||Object.keys(changes).length>64)throw Error('Invalid template edits.');
 const fields=[];const add=(label,type,maxLength)=>{const id='f'+(fields.length+1);fields.push({id,label:clean(label).slice(0,95),type,maxLength});
  if(Object.hasOwn(changes,id)){const v=changes[id];if(typeof v!=='string'||!v.trim()||v.length>maxLength||clean(v)!==v)throw Error('Enter a valid value for '+label+'.');
   if(type==='number'&&(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)||!Number.isFinite(Number(v))||Math.abs(Number(v))>1e12))throw Error('Enter a valid number.');
   if(type==='date'&&(!/^\d{4}-\d\d-\d\d$/.test(v)||v<'1900-03-01'||v>'9999-12-31'||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v))throw Error('Enter a valid date.');}
  return id;};
 let output;const writing=Object.keys(changes).length>0;
 if(format==='svg'){
  const xml=strFromU8(bytes);if(!/<svg\b/i.test(xml)||/<(?:script|foreignObject|image)\b|<!DOCTYPE|<!ENTITY|\son[a-z]+\s*=|(?:href|src)\s*=/i.test(xml))throw Error('Unsafe SVG source.');
  const safe=svgText(xml,fields,add,changes);if(writing)output=strToU8(safe);
 }else{
  let n=0,total=0;const parts=unzipSync(bytes,{filter:f=>{if(++n>750||f.originalSize>8e6||(total+=f.originalSize)>32e6||/(?:^|\/)\.\.(?:\/|$)|vbaProject\.bin/i.test(f.name))throw Error('Unsupported archive.');return true;}});
  const ch=(p,fn)=>{if(!parts[p])return;const xml=strFromU8(parts[p]);const next=fn(xml);if(writing&&next!==xml)parts[p]=strToU8(next);};
  if(format==='xlsx'){
   const ssXml=strFromU8(parts['xl/sharedStrings.xml']??new Uint8Array());const ss=[...ssXml.matchAll(/<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m=>localText(m[1],'t').join(''));const styles=xlsxStyles(parts);
   const wb=strFromU8(parts['xl/workbook.xml']);const sheets=[...wb.matchAll(/<(?:\w+:)?sheet\s+([^>]+)/g)].map(m=>({name:unesc(attr(m[1],'name')??'Worksheet'),id:attr(m[1],'r:id')??/\s[\w]+:id="([^"]+)"/.exec(m[1])?.[1]}));
   const rels=strFromU8(parts['xl/_rels/workbook.xml.rels']??new Uint8Array());const paths=new Map([...rels.matchAll(/<(?:\w+:)?Relationship\s+([^>]+)/g)].map(m=>[attr(m[1],'Id'),attr(m[1],'Target')??'']));sheets.sort((a,b)=>Number(b.name==='Data')-Number(a.name==='Data'));
   for(const s of sheets){if(fields.length>=64)break;const rel=(paths.get(s.id)??'').replace(/^\/xl\//,'');if(!/^worksheets\/[^/]+\.xml$/.test(rel))continue;ch('xl/'+rel,x=>xlsxVisit(x,s.name,ss,styles,fields,add,changes));}
   if(writing){for(const p of Object.keys(parts).filter(p=>/^xl\/worksheets\/[^/]+\.xml$/.test(p))){
    ch(p,xml=>xml.replace(cellRe,(s,attrs,body)=>body&&/<(?:\w+:)?f\b/.test(body)?s.replace(/<(?:\w+:)?v(?:\s[^>]*)?>[\s\S]*?<\/(?:\w+:)?v>/,''):s));}
    ch('xl/workbook.xml',xml=>{const prefix=/<(\w+:)?workbook\b/.exec(xml)?.[1]??'';const calc='<'+prefix+'calcPr calcId="0" fullCalcOnLoad="1" forceFullCalc="1" calcMode="auto"/>';return /<(?:\w+:)?calcPr\b/.test(xml)?xml.replace(/<(?:\w+:)?calcPr\b[^>]*(?:\/>|>[\s\S]*?<\/(?:\w+:)?calcPr>)/,calc):xml.replace(/<\/(?:\w+:)?workbook>/,s=>calc+s);});}
  }else{
   const names=format==='docx'?['word/document.xml']:Object.keys(parts).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a,b)=>Number(a.match(/(\d+)\.xml/)[1])-Number(b.match(/(\d+)\.xml/)[1]));
   for(const p of names){if(fields.length>=64)break;ch(p,x=>officeText(x,format,p,fields,add,changes));}
  }
  if(writing&&!options.validateOnly)output=zipSync(parts,{level:4});
 }
 if(!fields.length||Object.keys(changes).some(k=>!fields.some(f=>f.id===k)))throw Error('This source does not contain the requested editable fields.');
 return {fields,bytes:output,mime:nativeMimes[format]};
}
