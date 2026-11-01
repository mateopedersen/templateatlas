import {validate,types,calendarCells,histogram,quartiles,pareto,graphLayout} from './model.mjs';
const esc=v=>String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const fmt=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
const short=(s,n=15)=>String(s).length>n?String(s).slice(0,n-1)+'…':String(s);
const text=(x,y,s,size=13,anchor='start',extra='')=>'<text x="'+x+'" y="'+y+'" font-size="'+size+'" text-anchor="'+anchor+'" '+extra+'>'+esc(s)+'</text>';
const rect=(x,y,w,h,color,extra='')=>'<rect x="'+x+'" y="'+y+'" width="'+Math.max(0,w)+'" height="'+Math.max(0,h)+'" fill="'+color+'" '+extra+'/>';
const path=(d,color='none',stroke='none',width=1,extra='')=>'<path d="'+d+'" fill="'+color+'" stroke="'+stroke+'" stroke-width="'+width+'" '+extra+'/>';
const line=(x,y,X,Y,color='#645e5d',w=1,extra='')=>path('M'+x+' '+y+'L'+X+' '+Y,'none',color,w,extra);
const circle=(x,y,r,color,extra='')=>'<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+color+'" '+extra+'/>';
const ext=(v,zero=true)=>{const a=v.filter(n=>typeof n==='number');let lo=Math.min(...(zero?[0,...a]:a)),hi=Math.max(...(zero?[0,...a]:a));if(!Number.isFinite(lo))return[0,1];if(lo===hi){if(zero)return[0,hi||1];return[lo-1,hi+1];}return[lo,hi];};
const scale=([a,b],c,d)=>v=>c+(v-a)*(d-c)/(b-a);
const xy=(x,y,r,a)=>[x+r*Math.cos(a),y+r*Math.sin(a)];
function sector(cx,cy,r0,r1,start,end,color){if(end<=start)return '';end=Math.min(end,start+2*Math.PI-.000001);const arc=(r,s,e,dir)=>'A'+r+' '+r+' 0 '+(Math.abs(e-s)>Math.PI?1:0)+' '+dir+' '+xy(cx,cy,r,e).join(' ');return path('M'+xy(cx,cy,r1,start).join(' ')+arc(r1,start,end,1)+(r0?'L'+xy(cx,cy,r0,end).join(' ')+arc(r0,end,start,0):'L'+cx+' '+cy)+'Z',color,'#fff',1);}
export function renderChartSvg(raw){
 const m=validate(raw),k=m.type,r=m.rows,h=m.headers,n=r.length, ink='#302b2b',grid='#e6dfd9';
 const c=m.palette==='ocean'?['#205473','#b26c2d','#43827b','#70467d','#647239','#bd6579']:['#792d42','#33776f','#af7933','#4f688e','#927891','#61734c'];
 const color=i=>c[i%c.length];const W=800,L=90,R=705,T=94,H=400;
 let p='',note='',height=H,legend=[];
 const plotBottom=320,B=plotBottom;
 const labels=(rows,x,idx=0)=>{const stride=Math.max(1,Math.ceil(rows.length/8));rows.forEach((v,i)=>{if(i%stride===0)p+=text(x(i),B+20,short(v[idx],12),12,'middle');});};
 const xMid=(i,len)=>L+(i+.5)*(R-L)/len;
 const axis=(domain,xLo=L,xHi=R,top=T,bt=B)=>{const fy=scale(domain,bt,top);for(let i=0;i<=4;i++){let y=bt-i*(bt-top)/4;p+=line(xLo,y,xHi,y,grid)+text(xLo-8,y+4,fmt(domain[0]+(domain[1]-domain[0])*i/4),12,'end');}p+=line(xLo,fy(0),xHi,fy(0),'#6f6763');return fy;};
 const vpath=(pts,stroke,fill,base,dashed=false)=>{let run=[];const flush=()=>{if(!run.length)return;const seg=run.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join('');if(fill)p+=path(seg+'L'+run.at(-1)[0]+' '+base+'L'+run[0][0]+' '+base+'Z',fill,'none',1,'fill-opacity=".22"');p+=path(seg,'none',stroke,2.8,dashed?'stroke-dasharray="6 4"':'');for(const [x,y] of run)p+=dashed?rect(x-3,y-3,6,6,stroke):circle(x,y,3.5,stroke);run=[];};for(const pt of pts){if(pt===null){if(!m.connectMissing)flush();}else run.push(pt);}flush();};
 const slugs=['line-chart','area-chart','bar-graph','combo-chart','stacked-bar-chart','burndown-chart','cash-flow-chart','waterfall-chart','pareto-chart','histogram'];
 if(slugs.includes(k)){
  let rows=r,keys=h.slice(1),lohi,style=k;
  if(k==='histogram'){const v=r.map(a=>a[0]),[lo,hi]=ext(v,false),step=(hi-lo)/m.bins,edges=Array.from({length:m.bins+1},(_,i)=>i===m.bins?hi:lo+i*step);rows=histogram(v,edges).map(b=>[fmt(b.min)+'–'+fmt(b.max),b.count]);keys=['Frequency'];style='bar-graph';}
  if(k==='pareto-chart'){rows=pareto(r);keys=[h[1],'Cumulative share (%)'];lohi=ext(rows.map(a=>a[1]));}
  if(k==='cash-flow-chart'){let opening=m.opening;rows=r.map(([label,inc,out])=>{const net=inc-out;return[label,net,opening+=net];});keys=['Net cash (USD)','Closing balance (USD)'];style='combo-chart';}
  if(k==='waterfall-chart'){let balance=0;rows=r.map(([label,v])=>[label,balance,balance+=v]);keys=['Cumulative balance'];}
  if(k==='stacked-bar-chart'){lohi=ext(rows.flatMap(a=>[a.slice(1).reduce((s,v)=>s+Math.min(v,0),0),a.slice(1).reduce((s,v)=>s+Math.max(v,0),0)]));}
  const fy=axis(lohi??ext(rows.flatMap(a=>a.slice(1)))),xx=i=>xMid(i,rows.length),bw=(R-L)/rows.length*(k==='histogram'?1:.58);
  if(['bar-graph','combo-chart','pareto-chart','stacked-bar-chart','waterfall-chart'].includes(style)){
   rows.forEach((a,i)=>{const x=xx(i)-bw/2;const bar=(from,to,cc)=>{p+=rect(x,Math.min(fy(from),fy(to)),bw,Math.abs(fy(from)-fy(to)),cc);};
    if(style==='stacked-bar-chart'){let pos=0,neg=0;a.slice(1).forEach((v,j)=>{let from=v<0?neg:pos;if(v<0)neg+=v;else pos+=v;bar(from,from+v,color(j));});}
    else if(style==='waterfall-chart'){bar(a[1],a[2],a[2]>=a[1]?color(0):color(1));if(i+1<rows.length)p+=line(x+bw,fy(a[2]),xx(i+1)-bw/2,fy(a[2]),'#726e6c',1,'stroke-dasharray="3 3"');}
    else bar(0,a[1],color(0));
   });
  }
  if(['line-chart','area-chart','burndown-chart','combo-chart','pareto-chart'].includes(style)){const indices=style==='combo-chart'||style==='pareto-chart'?[2]:style==='burndown-chart'?[1,2]:[1];for(const j of indices){const sy=style==='pareto-chart'?scale([0,100],B,T):fy;vpath(rows.map((a,i)=>a[j]===null?null:[xx(i),sy(a[j])]),color(j-1),style==='area-chart'?color(0):null,fy(0),j===2);}}
  if(style==='pareto-chart'){for(const z of [0,25,50,75,100])p+=text(R+8,B-(B-T)*z/100+4,z+'%',12);}
  labels(rows,xx);legend=keys;
 } else if(['scatter-plot','bubble-chart'].includes(k)){
  const xx=scale(ext(r.map(a=>a[0])),L,R),fy=axis(ext(r.map(a=>a[1]))),max=Math.max(...r.map(a=>a[2]??1),1);
  const xb=ext(r.map(a=>a[0]));for(let i=0;i<5;i++){const v=xb[0]+i*(xb[1]-xb[0])/4;p+=text(xx(v),B+18,fmt(v),12,'middle');}
  for(const a of r)p+=circle(xx(a[0]),fy(a[1]),k==='scatter-plot'?5:17*Math.sqrt(a[2]/max),color(0),'fill-opacity=".6" stroke="'+color(0)+'"');
  legend=[h[1]+' vs. '+h[0]];if(k==='bubble-chart')note='Bubble area • '+h[2];
 } else if(k==='pie-chart'||k==='sunburst-chart'){
  const groups=new Map();for(const a of r){const g=groups.get(a[0])??[];g.push([k==='pie-chart'?a[0]:a[1],a.at(-1)]);groups.set(a[0],g);}
  const total=r.reduce((s,a)=>s+a.at(-1),0);let at=-Math.PI/2,i=0;
  for(const [g,items] of groups){const v=items.reduce((s,a)=>s+a[1],0),span=2*Math.PI*v/total;
   p+=sector(300,205,0,k==='pie-chart'?108:63,at,at+span,color(i));if(k==='sunburst-chart'){let child=at;for(const [itemName,w] of items){const en=child+2*Math.PI*w/total;p+=sector(300,205,66,109,child,en,color(i));if(en-child>.35){const pos=xy(300,205,90,(child+en)/2);p+=text(...pos,short(itemName,8),10,'middle','fill="#fff"');}child=en;}}
   p+=rect(480,85+i*25,13,13,color(i))+text(503,97+i*25,short(g,21)+' · '+fmt(v/total*100)+'%',13);at+=span;i++;
  }height=Math.max(H,145+groups.size*25);
 } else if(k==='box-and-whisker-plot'){
  const v=r.map(a=>a[0]),q=quartiles(v),dom=ext(v,false),sx=scale(dom,L,R);
  p+=line(sx(q.w1),205,sx(q.w2),205,ink,2)+line(sx(q.w1),189,sx(q.w1),221,ink,2)+line(sx(q.w2),189,sx(q.w2),221,ink,2)+rect(sx(q.q1),172,sx(q.q3)-sx(q.q1),66,color(0))+line(sx(q.median),172,sx(q.median),238,'white',3);
  q.outliers.forEach(o=>p+=circle(sx(o),205,4,color(1)));for(let i=0;i<5;i++){const v=dom[0]+i*(dom[1]-dom[0])/4;p+=text(sx(v),269,fmt(v),13,'middle');}note='Q1 '+fmt(q.q1)+'   •   Median '+fmt(q.median)+'   •   Q3 '+fmt(q.q3)+'   •   Outliers '+q.outliers.length;
 } else if(k==='funnel-chart'||k==='dot-plot'||k==='bullet-chart'||k==='population-pyramid'){
  const first=195,last=690,mid=(first+last)/2,dom=ext(r.flatMap(a=>a.slice(1))),sy=i=>T+22+i*39; height=Math.max(245,T+39*n+60);
  r.forEach((a,i)=>{const y=sy(i);p+=text(first-12,y+5,short(a[0],22),13,'end');
   if(k==='dot-plot'){const sx=scale(dom,first,last);p+=line(first,y,last,y,grid)+circle(sx(a[1]),y,7,color(0))+text(Math.min(last+4,sx(a[1])+10),y-8,fmt(a[1]),12);}
   else if(k==='funnel-chart'){const width=(last-first)*a[1]/dom[1];p+=rect(mid-width/2,y-12,width,24,color(i))+text(last+12,y+5,fmt(a[1]),12);}
   else if(k==='bullet-chart'){const sx=scale(dom,first,last);p+=rect(first,y-12,sx(a[3])-first,24,'#e8dfd6')+rect(first,y-6,sx(a[1])-first,12,color(0))+path('M'+sx(a[2])+' '+(y-10)+'l5 10 -5 10 -5 -10Z',color(1));}
   else{const sf=(last-first)/2/dom[1];p+=rect(mid-a[1]*sf,y-10,a[1]*sf,20,color(0))+rect(mid,y-10,a[2]*sf,20,color(1))+text(first-4,y+18,fmt(a[1]),10)+text(last+4,y+18,fmt(a[2]),10,'end');}
  });legend=k==='dot-plot'||k==='funnel-chart'?[h[1]]:k==='bullet-chart'?[h[1],h[2]]:h.slice(1);
 } else if(k==='heatmap'||k==='cohort-retention-chart'){
  const start=k==='heatmap'?1:2,cols=h.length-start,rows=k==='heatmap'?r.map(a=>a.slice(1)):r.map(a=>a.slice(2).map(v=>v===null?null:100*v/a[1]));
  const dom=k==='heatmap'?ext(rows.flat().filter(v=>v!==null),false):[0,100],w=Math.min(145,480/cols);
  for(let j=0;j<cols;j++)p+=text(210+w*(j+.5),T,short(h[j+start],16),12,'middle');
  rows.forEach((row,i)=>{const y=T+10+i*35;p+=text(195,y+21,short(r[i][0],20),12,'end');row.forEach((v,j)=>{let intensity=v===null?0:(v-dom[0])/(dom[1]-dom[0]);p+=rect(210+j*w,y,w-3,31,v===null?'#eeeae7':color(1),'fill-opacity="'+(v===null?1:Math.max(.12,intensity*.88+.12))+'"')+text(210+w*(j+.5),y+21,v===null?'—':fmt(v)+(k==='cohort-retention-chart'?'%':''),13,'middle',intensity>.65?'fill="white"':'');});});height=Math.max(260,T+rows.length*35+85);note='Shared scale '+fmt(dom[0])+' to '+fmt(dom[1])+'  •  — No observation';
 } else if(k==='2027-calendar-heatmap'){
  const values=new Map(r),dom=ext(r.map(a=>a[1])),days=calendarCells(m.weekStart),dayNames=m.weekStart==='Sunday'?['Su','Mo','Tu','We','Th','Fr','Sa']:['Mo','Tu','We','Th','Fr','Sa','Su'];let month=-1;
  days.forEach(d=>{const val=values.get(d.date),x=65+d.week*13,y=T+28+d.day*19;p+=rect(x,y,11,16,val===undefined?'#e9e5df':color(1),'fill-opacity="'+(val===undefined?1:.22+.78*val/dom[1])+'"');const mo=Number(d.date.slice(5,7));if(mo!==month){p+=text(x,T+15,new Intl.DateTimeFormat('en-US',{month:'short',timeZone:'UTC'}).format(new Date(d.date+'T00:00:00Z')),11);month=mo;}});dayNames.forEach((v,i)=>p+=text(56,T+41+i*19,v,12,'end'));height=330;note=m.weekStart+' first   •   Gray = missing   •   '+h[1]+': 0 to '+fmt(dom[1]);
 } else if(k==='radar-chart'){
  const max=Math.max(...r.map(a=>a[1]),1);const pts=(radius,each)=>r.map((a,i)=>xy(392,208,radius*(each?a[1]/max:1),-Math.PI/2+i*2*Math.PI/n));for(const z of [.25,.5,.75,1])p+=path('M'+pts(95*z,false).map(v=>v.join(' ')).join('L')+'Z','none',grid);
  p+=path('M'+pts(95,true).map(v=>v.join(' ')).join('L')+'Z',color(0),color(0),2,'fill-opacity=".22"');pts(116,false).forEach(([x,y],i)=>p+=text(x,y,short(r[i][0],14),12,'middle'));note='Center = 0   •   Outer ring = '+fmt(max)+' '+h[1];
 } else if(k==='slope-chart'){
  const fy=axis(ext(r.flatMap(a=>a.slice(1))),220,580);r.forEach((a,i)=>{p+=line(220,fy(a[1]),580,fy(a[2]),color(i),2)+circle(220,fy(a[1]),4,color(i))+circle(580,fy(a[2]),4,color(i))+text(212,fy(a[1])+4,short(a[0],14)+' · '+fmt(a[1]),12,'end')+text(589,fy(a[2])+4,fmt(a[2])+' · '+short(a[0],14),12);});p+=text(220,B+24,h[1],13,'middle')+text(580,B+24,h[2],13,'middle');
 } else if(k==='treemap-chart'){
  const groups=new Map();for(const [g,id,v] of r){const items=groups.get(g)??[];items.push([id,v]);groups.set(g,items);}const total=r.reduce((s,a)=>s+a[2],0);let x=60,idx=0;
  for(const [g,items] of groups){const sum=items.reduce((s,a)=>s+a[1],0);if(sum===0)continue;const w=680*sum/total;let y=T+20;p+=text(x+2,T+12,short(g,Math.max(2,Math.floor(w/8))),12);
   for(const [id,v] of items){const ht=190*v/sum;p+=rect(x,y,w,ht,color(idx),'stroke="#fff" stroke-width="2"');if(w>36&&ht>23)p+=text(x+w/2,y+ht/2+4,short(id,Math.max(3,Math.floor(w/8))),12,'middle','fill="#fff"');y+=ht;}x+=w;idx++;}
 } else if(k==='sankey-diagram'){
  const nodes=graphLayout(r),levels=[];for(const o of nodes.values())(levels[o.depth]??=[]).push(o);height=Math.max(380,T+45*Math.max(...levels.map(q=>q.length))+80);const available=height-T-75;
  const factor=Math.min(...levels.map(q=>(available-(q.length-1)*20)/(q.reduce((s,o)=>s+Math.max(o.in,o.out),0)||1)));for(const [i,q] of levels.entries()){let y=T;q.forEach(o=>{o.x=80+i*(620/Math.max(1,levels.length-1));o.y=y;o.ht=Math.max(o.in,o.out)*factor;o.inY=y;o.outY=y;y+=o.ht+20;});}
  for(const [a,b,v] of r){if(!v)continue;const s=nodes.get(a),t=nodes.get(b),hw=v*factor,x=s.x+12,z=t.x,mid=(x+z)/2,sy=s.outY+hw/2,ty=t.inY+hw/2;p+=path('M'+x+' '+sy+'C'+mid+' '+sy+' '+mid+' '+ty+' '+z+' '+ty,'none',color(s.depth),hw,'stroke-opacity=".36"');s.outY+=hw;t.inY+=hw;}
  for(const o of nodes.values())p+=rect(o.x,o.y,12,o.ht,color(o.depth))+text(o.x+6,o.y-4,short(o.name,15),12,'middle');
 } else if(k==='control-chart'){
  const means=r.map(a=>a.slice(1).reduce((s,v)=>s+v,0)/5),ranges=r.map(a=>Math.max(...a.slice(1))-Math.min(...a.slice(1))),avg=a=>a.reduce((s,v)=>s+v,0)/a.length,mn=avg(means),ra=avg(ranges);
  function control(data,low,center,high,top,bottom,label){p+=text(L,top-10,label,14);const dom=ext([low,high,...data],false),sy=scale(dom,bottom,top),xx=i=>xMid(i,n);for(const [v,t] of [[low,'LCL'],[center,'Mean'],[high,'UCL']])p+=line(L,sy(v),R,sy(v),color(1),1.25,'stroke-dasharray="5 3"')+text(R+6,sy(v)+4,t+' '+fmt(v),11);vpath(data.map((v,i)=>[xx(i),sy(v)]),color(0));}
  control(means,mn-.577*ra,mn,mn+.577*ra,110,210,'Subgroup mean');control(ranges,0,ra,2.115*ra,258,358,'Subgroup range');height=440;note='Subgroups of 5   •   Rows follow measurement order';
 }
 const titleMax=62;const stamp=(m.sample?'Sample data':'Your data')+'   /   Revision '+m.revision;const footer=m.legend&&legend.length?legend.map((a,i)=>{let x=62+i*(670/Math.max(legend.length,3));return rect(x,height-44,10,10,color(i))+text(x+16,height-35,short(a,Math.floor(92/Math.max(legend.length,3))),12);}).join(''):'';
 return '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="ta-title ta-desc" viewBox="0 0 '+W+' '+height+'" width="'+W+'" height="'+height+'"><title id="ta-title">'+esc(m.title)+'</title><desc id="ta-desc">'+esc(types[k].method+' '+r.length+' data rows. '+stamp)+'</desc><rect width="100%" height="100%" fill="white"/><g font-family="Arial, sans-serif" fill="'+ink+'">'+text(40,28,'TEMPLATEATLAS  /  DATA STUDIO',11,'start','letter-spacing="2" fill="#792d42"')+text(40,59,short(m.title,titleMax),23)+text(40,79,stamp,11,'start','fill="#655e59"')+p+footer+text(40,height-12,short([m.axisTitle,note].filter(Boolean).join('   •   '),110),12)+'</g></svg>';
}
