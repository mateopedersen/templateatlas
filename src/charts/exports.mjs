// Server-only exports. Entitlement, ownership and revision checks run in the calling Worker.
import { zipSync, strToU8 } from 'fflate';
import { validate } from './model.mjs';
import { renderChartSvg } from './render.mjs';
const mimeXlsx='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const nativeTypes={'line-chart':'line','area-chart':'area','bar-graph':'bar','stacked-bar-chart':'stacked','pie-chart':'pie','scatter-plot':'scatter','bubble-chart':'bubble','radar-chart':'radar','burndown-chart':'line'};
export { chartFormats } from './capabilities.mjs';
const X='http://schemas.openxmlformats.org/spreadsheetml/2006/main',C='http://schemas.openxmlformats.org/drawingml/2006/chart',D='http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',A='http://schemas.openxmlformats.org/drawingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const e=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
const col=i=>String.fromCharCode(65+i);
function series(m,j,kind){
 const scatter=['scatter','bubble'].includes(kind),end=m.rows.length+4;
 function ref(tag,colNo,isText){const arr=m.rows.map(r=>r[colNo]);let cat=isText?'str':'num',refcol=col(colNo);
  return '<c:'+tag+'><c:'+cat+'Ref><c:f>Data!$'+refcol+'$5:$'+refcol+'$'+end+'</c:f><c:'+cat+'Cache>'+(isText?'':'<c:formatCode>General</c:formatCode>')+'<c:ptCount val="'+arr.length+'"/>'+arr.map((v,i)=>v===null?'':'<c:pt idx="'+i+'"><c:v>'+e(v)+'</c:v></c:pt>').join('')+'</c:'+cat+'Cache></c:'+cat+'Ref></c:'+tag+'>';
 }
 const marker=['line','scatter','radar'].includes(kind)?'<c:marker><c:symbol val="'+(j%2?'circle':'square')+'"/><c:size val="6"/></c:marker>':'';
 const color=(m.palette==='ocean'?['205473','B26C2D']:['792D42','33776F'])[(j-1)%2];
 const paint='<c:spPr><a:solidFill><a:srgbClr val="'+color+'"/></a:solidFill><a:ln w="24000">'+(kind==='scatter'?'<a:noFill/>':'<a:solidFill><a:srgbClr val="'+color+'"/></a:solidFill>')+'</a:ln></c:spPr>';
 return '<c:ser><c:idx val="'+(j-1)+'"/><c:order val="'+(j-1)+'"/><c:tx><c:v>'+e(m.headers[j])+'</c:v></c:tx>'+paint+marker+ref(scatter?'xVal':'cat',0,!scatter)+ref(scatter?'yVal':'val',j,false)+(kind==='bubble'?ref('bubbleSize',2,false):'')+(['line','scatter'].includes(kind)?'<c:smooth val="0"/>':'')+'</c:ser>';
}
function workbook(raw){
 const m=validate(raw),kind=nativeTypes[m.type];if(!kind)throw Error('This chart has no native workbook export.');
 const rows=[[m.title],[m.sample?'Sample data • Revision '+m.revision:'Revision '+m.revision],['Edit the table to update the chart.'],m.headers,...m.rows];
 const sheet='<worksheet xmlns="'+X+'" xmlns:r="'+R+'"><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><cols><col min="1" max="'+m.headers.length+'" width="24" customWidth="1"/></cols><sheetData>'+rows.map((r,i)=>'<row r="'+(i+1)+'">'+r.map((v,j)=>v===null?'':typeof v==='number'?'<c r="'+col(j)+(i+1)+'"><v>'+v+'</v></c>':'<c r="'+col(j)+(i+1)+'" t="inlineStr"><is><t xml:space="preserve">'+e(v)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData><drawing r:id="rId1"/></worksheet>';
 const k=kind==='stacked'?'bar':kind;const opts={line:'<c:grouping val="standard"/>',area:'<c:grouping val="standard"/>',bar:'<c:barDir val="col"/><c:grouping val="clustered"/>',stacked:'<c:barDir val="col"/><c:grouping val="stacked"/>',radar:'<c:radarStyle val="marker"/>',pie:'<c:varyColors val="1"/>',scatter:'<c:scatterStyle val="marker"/>'};
 const axes=kind==='pie'?'':'<c:axId val="1"/><c:axId val="2"/>';const scatter=['scatter','bubble'].includes(kind);const ax=(tag,id,pos,other,zero)=>'<c:'+tag+'><c:axId val="'+id+'"/><c:scaling><c:orientation val="minMax"/>'+(zero?'<c:min val="0"/>':'')+'</c:scaling><c:axPos val="'+pos+'"/><c:tickLblPos val="nextTo"/><c:crossAx val="'+other+'"/><c:crosses val="autoZero"/>'+(tag==='valAx'?'<c:crossBetween val="between"/>':'')+'</c:'+tag+'>';
 const colors=Array.from({length:m.rows.length},(_,i)=>'<c:dPt><c:idx val="'+i+'"/><c:spPr><a:solidFill><a:srgbClr val="'+['792D42','33776F','AF7933','4F688E','927891','61734C'][i%6]+'"/></a:solidFill></c:spPr></c:dPt>').join('');
 let pieces=m.headers.slice(1,scatter?2:undefined).map((_,i)=>series(m,i+1,kind)).join('');if(kind==='pie')pieces=pieces.replace('<c:cat>',colors+'<c:cat>');
 const title='<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>'+e(m.title)+'</a:t></a:r></a:p></c:rich></c:tx><c:layout/></c:title>';
 const chart='<c:chartSpace xmlns:c="'+C+'" xmlns:a="'+A+'"><c:lang val="en-US"/><c:chart>'+title+'<c:plotArea><c:layout/><c:'+k+'Chart>'+(opts[kind]??'')+pieces+(kind==='bubble'?'<c:sizeRepresents val="area"/>':kind==='stacked'?'<c:overlap val="100"/>':'')+axes+'</c:'+k+'Chart>'+(axes?ax(scatter?'valAx':'catAx',1,'b',2,false)+ax('valAx',2,'l',1,['bar','stacked','area'].includes(kind)&&m.rows.every(r=>r.slice(1).every(v=>v===null||v>=0))):'')+'</c:plotArea>'+(m.legend?'<c:legend><c:legendPos val="b"/><c:layout/></c:legend>':'')+'<c:plotVisOnly val="1"/><c:dispBlanksAs val="'+(m.connectMissing?'span':'gap')+'"/></c:chart></c:chartSpace>';
 const rel=(id,typ,target)=>'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="'+id+'" Type="'+R+'/'+typ+'" Target="'+target+'"/></Relationships>';
 const anchor=(tag,c,r)=>'<xdr:'+tag+'><xdr:col>'+c+'</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>'+r+'</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:'+tag+'>';
 const dx='<xdr:wsDr xmlns:xdr="'+D+'" xmlns:a="'+A+'"><xdr:twoCellAnchor>'+anchor('from',m.headers.length+1,1)+anchor('to',m.headers.length+13,21)+'<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Data chart"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="'+C+'"><c:chart xmlns:c="'+C+'" xmlns:r="'+R+'" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>';
 const parts={'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+Object.entries({'/xl/workbook.xml':'spreadsheetml.sheet.main','/xl/worksheets/sheet1.xml':'spreadsheetml.worksheet','/xl/drawings/drawing1.xml':'drawing','/xl/charts/chart1.xml':'drawingml.chart'}).map(([name,t])=>'<Override PartName="'+name+'" ContentType="application/vnd.openxmlformats-officedocument.'+t+'+xml"/>').join('')+'</Types>','_rels/.rels':rel('rId1','officeDocument','xl/workbook.xml'),'xl/workbook.xml':'<workbook xmlns="'+X+'" xmlns:r="'+R+'"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':rel('rId1','worksheet','worksheets/sheet1.xml'),'xl/worksheets/sheet1.xml':sheet,'xl/worksheets/_rels/sheet1.xml.rels':rel('rId1','drawing','../drawings/drawing1.xml'),'xl/drawings/drawing1.xml':dx,'xl/drawings/_rels/drawing1.xml.rels':rel('rId1','chart','../charts/chart1.xml'),'xl/charts/chart1.xml':chart};
 return zipSync(Object.fromEntries(Object.entries(parts).map(([n,x])=>[n,strToU8('<?xml version="1.0" encoding="UTF-8"?>'+x)])),{level:6});
}
export function exportChart(raw,format){
 if(format==='svg')return {bytes:strToU8(renderChartSvg(raw)),mime:'image/svg+xml'};
 if(format==='xlsx')return {bytes:workbook(raw),mime:mimeXlsx};
 throw Error('Choose a supported chart export format.');
}
