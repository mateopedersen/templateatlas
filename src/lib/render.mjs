import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { zipSync, strToU8 } from 'fflate';
import { calculate,tools } from './tools.mjs';
import { invoice,money } from './invoice.mjs';
const xml=s=>String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]);
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main', rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export function workbook(title,rows){
 const sheet=rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((v,j)=>{const ref=String.fromCharCode(65+j)+(i+1),cell='<c r="'+ref+'"';if(v&&typeof v==='object')return cell+'><f>'+xml(v.formula)+'</f><v>'+v.cache+'</v></c>';if(typeof v==='number')return cell+'><v>'+v+'</v></c>';return cell+' t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is></c>';}).join('')+'</row>').join('');
 const relationships=(id,type,to)=>'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="'+id+'" Type="'+rel+'/'+type+'" Target="'+to+'"/></Relationships>';
 const files={'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
 '_rels/.rels':relationships('rId1','officeDocument','xl/workbook.xml'),'xl/_rels/workbook.xml.rels':relationships('rId1','worksheet','worksheets/sheet1.xml'),
 'xl/workbook.xml':'<workbook xmlns="'+ns+'" xmlns:r="'+rel+'"><sheets><sheet name="'+xml(title.slice(0,31))+'" sheetId="1" r:id="rId1"/></sheets><calcPr fullCalcOnLoad="1"/></workbook>',
 'xl/worksheets/sheet1.xml':'<worksheet xmlns="'+ns+'"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><cols><col min="1" max="1" width="38" customWidth="1"/><col min="2" max="7" width="19" customWidth="1"/></cols><sheetData>'+sheet+'</sheetData><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="1" fitToWidth="1" fitToHeight="0"/></worksheet>'};
 return zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])));
}
const MIME={pdf:'application/pdf',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',svg:'image/svg+xml',ics:'text/calendar'};
export const formatsFor=k=>k==='form'?['docx','pdf']:k==='invoice'?['pdf','xlsx']:k==='schedule-maker'?['pdf','xlsx','ics']:k==='grade-calculator'||k==='weeks-in-year'?['pdf','xlsx']:k==='calendar-2027'?['pdf','ics']:k==='venn-diagram-maker'?['pdf','svg']:['pdf'];
function billingRows(d,r){
 const list=[['Invoice',d.number],['From',d.seller],['Bill to',d.buyer],['Issued',d.date],['Description','Quantity','Rate (USD)','Taxable (1/0)','Amount (USD)']];
 for(const i of r.items){const n=list.length+1;list.push([i.description,+i.quantity,+i.rate,+i.taxable,{formula:'ROUND(B'+n+'*C'+n+',2)',cache:i.amount/100}]);}
 const last=list.length;const append=(name,formula,cache)=>{list.push([name,{formula,cache:cache/100}]);return 'B'+list.length;};
 const sub=append('Subtotal','SUM(E6:E'+last+')',r.subtotal);
 list.push(['Discount (%)',+d.discount]);const disc=append('Discount','ROUND('+sub+'*B'+list.length+'/100,2)',r.discount);
 const taxable='SUMPRODUCT(D6:D'+last+',E6:E'+last+')',base=append('Taxable after discount',taxable+'-IFERROR(ROUND('+disc+'*'+taxable+'/'+sub+',2),0)',r.taxable);
 list.push(['Tax (%)',+d.tax]);const tax=append('Tax','ROUND('+base+'*B'+list.length+'/100,2)',r.tax);
 const total=append('Total',sub+'-'+disc+'+'+tax,r.total);list.push(['Payments received',r.paid/100]);append('Balance due',total+'-B'+list.length,r.balance);
 for(const [label,key] of [['Street','street'],['City','city'],['State','state'],['ZIP','zip'],['Phone','phone'],['Due','due'],['Payment terms','terms']])if(d[key])list.push([label,d[key]]);
 return list;
}
async function tablePdf(title,subtitle,columns,rows,note,venn=0){
 const doc=await PDFDocument.create(),regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),ink=rgb(.13,.13,.15),wine=rgb(.42,.06,.17);
 let page,y;const left=36,usable=540,cw=usable/columns.length;
 function pageStart(){page=doc.addPage([612,792]);y=744;page.drawText('TEMPLATEATLAS  /  WORKING PAPERS',{x:left,y,size:9,font:bold,color:wine});y-=32;}
 const wrap=(s,width,size,font)=>{s=String(s).replaceAll('∩','and');const out=[];let cur='';for(const word of String(s).split(/\s+/)){const t=cur?cur+' '+word:word;if(font.widthOfTextAtSize(t,size)<=width){cur=t;continue;}if(cur)out.push(cur);cur='';for(const ch of word){if(font.widthOfTextAtSize(cur+ch,size)>width){out.push(cur);cur='';}cur+=ch;}}out.push(cur);return out;};
 const line=(s,size,font)=>{for(const text of wrap(s,usable,size,font)){if(y<56)pageStart();page.drawText(text,{x:left,y,size,font,color:ink});y-=size+5;}};
 pageStart();line(title,22,bold);line(subtitle,12,regular);y-=10;
 const row=(cells,head)=>{const font=head?bold:regular;const values=cells.map(v=>wrap(v,cw-8,9,font));const h=Math.max(...values.map(x=>x.length))*13+12;if(y-h<35){pageStart();if(!head)row(columns,true);}
 for(let c=0;c<values.length;c++)for(let j=0;j<values[c].length;j++)page.drawText(values[c][j],{x:left+c*cw+3,y:y-13-j*13,size:9,font,color:head?wine:ink});
 y-=h;page.drawLine({start:{x:left,y},end:{x:576,y},thickness:.5,color:rgb(.8,.78,.76)});};
 if(venn){const colors=[rgb(.57,.17,.32),rgb(.13,.49,.4),rgb(.27,.39,.62)];for(let i=0;i<venn;i++){const x=i===2?158:130+56*i,cy=y-(i===2?112:72);page.drawCircle({x,y:cy,size:48,color:colors[i],opacity:.25,borderWidth:1,borderColor:colors[i]});page.drawText(['A','B','C'][i],{x:x+(i===0?-22:i===1?18:0),y:cy+(i===2?-26:9),font:bold,size:14,color:ink});}y-=venn===2?143:185;}
 row(columns,true);for(const cells of rows)row(cells,false);y-=18;if(note)line(note,10,regular);return doc.save();
}
function ical(events){
 if(!events?.length)throw Error('Add an event before exporting an .ics file.');
 const escape=s=>s.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/[,;]/g,m=>'\\'+m);
 const date=s=>s.replace(/-/g,''),stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z/,'Z');
 const values=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//TemplateAtlas//Planner//EN','CALSCALE:GREGORIAN'];
 for(const e of events){const dt=date(e.day);values.push('BEGIN:VEVENT','UID:'+crypto.randomUUID()+'@templateatlas.com','DTSTAMP:'+stamp,...(e.s?['DTSTART:'+dt+'T'+e.s.replace(':','')+'00','DTEND:'+dt+'T'+e.e.replace(':','')+'00']:['DTSTART;VALUE=DATE:'+dt]),'SUMMARY:'+escape(e.title),'END:VEVENT');}
 values.push('END:VCALENDAR');const enc=new TextEncoder();return strToU8(values.map(v=>{let out='',count=0;for(const ch of v){const n=enc.encode(ch).length;if(count+n>74){out+='\r\n ';count=1;}out+=ch;count+=n;}return out;}).join('\r\n')+'\r\n');
}
export async function renderDocument({kind,data,templateId,format,paper='letter'}){
 if(kind==='form'){if(paper!=='letter'||templateId)throw Error('Invalid form source.');const {exportForm}=await import('../forms/export.mjs');return exportForm(data,format);}
 if(paper!=='letter'||!formatsFor(kind).includes(format))throw Error('This output is unavailable.');
 let title,report,rows;
 if(kind==='invoice'){
   if(templateId&&templateId!=='ta-invoice-001')throw Error('Mismatched invoice template.');
   const r=invoice(data);title='Invoice '+data.number;rows=billingRows(data,r);
   report={summary:data.seller+'  |  Bill to '+data.buyer+'  |  '+data.date,note:[data.street,[data.city,data.state,data.zip].filter(Boolean).join(' '),data.phone,data.due&&'Due '+data.due,data.terms].filter(Boolean).join(' · '),columns:['Item','Quantity','Unit price','Amount'],rows:[...r.items.map(i=>[i.description,i.quantity,money(Math.round(+i.rate*100)),money(i.amount)]),...['subtotal','discount','tax','total','paid','balance'].map(k=>['','',k.toUpperCase(),money(r[k])])]};
 }else{
   if(templateId||!Object.hasOwn(tools,kind))throw Error('Unknown tool or template.');
   report=calculate(kind,data);title=tools[kind].title;rows=[report.columns,...report.rows];
   if(kind==='grade-calculator'){rows=[['Earned','Possible','Weight','Fraction','Included']];for(const [a,b,c] of report.rows){const idx=rows.length+1;const include=a!=='Unscored'||data.missing!=='Exclude';rows.push([a==='Unscored'?'':+a,+b,c==='—'?0:parseFloat(c),{formula:'IFERROR(A'+idx+'/B'+idx+',0)',cache:a==='Unscored'?0:+a/+b},Number(include)]);}
    const n=rows.length;rows.push(['Grade (%)',{formula:data.mode==='Weighted'?'100*SUMPRODUCT(C2:C'+n+',D2:D'+n+',E2:E'+n+')/SUMPRODUCT(C2:C'+n+',E2:E'+n+')':'100*SUM(A2:A'+n+')/SUMPRODUCT(B2:B'+n+',E2:E'+n+')',cache:parseFloat(report.summary)}]);}
 }
 let bytes;if(format==='pdf')bytes=await tablePdf(title,report.summary,report.columns,report.rows,report.note,report.venn);else if(format==='xlsx')bytes=workbook(kind==='invoice'?'Invoice':'Worksheet',rows);
 else if(format==='ics')bytes=ical(report.events);else{const h=250+report.rows.length*30;bytes=strToU8('<svg xmlns="http://www.w3.org/2000/svg" width="760" height="'+h+'" viewBox="0 0 760 '+h+'"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" fill="#37252d"><text x="24" y="30" font-size="20">Venn diagram · exclusive regions</text>'+['A','B','C'].slice(0,report.venn).map((s,i)=>'<circle cx="'+(i===2?165:128+i*74)+'" cy="'+(i===2?150:105)+'" r="58" fill="'+['#901c46','#267463','#6773a6'][i]+'" fill-opacity="0.23"/><text x="'+(i===2?160:95+i*119)+'" y="'+(i===2?192:94)+'">'+s+'</text>').join('')+report.rows.map((v,i)=>'<text x="24" y="'+(246+i*30)+'">'+xml(v.join('  —  '))+'</text>').join('')+'</g></svg>');}
 return {bytes,mime:MIME[format]};
}
