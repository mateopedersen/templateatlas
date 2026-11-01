import holidays from '../data/holidays.json' with {type:'json'};
const field=(name,label,value,type='text',options=[])=>({name,label,value,type,options});
export const tools={
 'aspect-ratio-calculator':{title:'Aspect ratio calculator',intro:'Resize an image while preserving its proportions.',fields:[field('width','Original width (px)',1920),field('height','Original height (px)',1080),field('target','New width (px)',1280)]},
 'grade-calculator':{title:'Grade calculator',intro:'Compare weighted grades or calculate a points-based total.',fields:[field('mode','Calculation','Weighted','select',['Weighted','Points']),field('rows','Earned, possible, weight (%) — one assignment per line','80,100,40\n90,100,60','textarea'),field('missing','Unscored assignments','Exclude','select',['Exclude','Count as zero'])]},
 'hex-to-decimal-converter':{title:'Hex to decimal converter',intro:'Convert an unsigned hexadecimal integer without losing precision.',fields:[field('hex','Hexadecimal value','0xFF')]},
 'weeks-in-year':{title:'Weeks in a year',intro:'See calendar days, ISO weeks and partial weeks for the year.',fields:[field('year','Year',2027),field('start','Week starts on','Sunday','select',['Sunday','Monday'])]},
 'calendar-2027':{title:'2027 calendar',intro:'Plan your month with actual and observed U.S. federal holidays.',fields:[field('month','Month',1,'select',Array.from({length:12},(_,i)=>String(i+1))),field('start','Week starts on','Sunday','select',['Sunday','Monday']),field('zone','Time zone for today','America/New_York'),field('events','Your events (YYYY-MM-DD, event name)','', 'textarea')]},
 'ppi-calculator':{title:'Pixel density calculator',intro:'Find screen density or the physical size of a printed image.',fields:[field('mode','Calculation','Screen density','select',['Screen density','Print size']),field('width','Image width (px)',3000),field('height','Image height (px)',2000),field('diagonal','Screen diagonal (in)',15),field('ppi','Print density (ppi)',300)]},
 'schedule-maker':{title:'Schedule maker',intro:'Arrange time blocks and check for overlaps. Times use local wall-clock time.',fields:[field('rows','Date, start, end, activity — one per line','2027-01-04,09:00,10:00,Project kickoff\n2027-01-04,10:15,11:30,Design review','textarea')]},
 'significant-figures-calculator':{title:'Significant figures calculator',intro:'Count significant digits in the number as written, then round it.',fields:[field('value','Decimal or scientific notation','0.00450'),field('digits','Round to significant digits',2)]},
 'venn-diagram-maker':{title:'Venn diagram maker',intro:'Compare two or three sets. Enter each distinct member on its own line.',fields:[field('a','Set A','Oak\nPine','textarea'),field('b','Set B','Pine\nBirch','textarea'),field('c','Set C (optional)','','textarea')]}
};
const num=(v,label,int=false,min=0,max=1e8)=>{if(v==null||String(v).trim()===''||!Number.isFinite(+v)||+v<=min||+v>max||(int&&!Number.isInteger(+v)))throw Error('Check '+label+'.');return +v};
const compact=n=>Number(n.toFixed(5)).toLocaleString('en-US',{maximumFractionDigits:5});
const lines=s=>String(s||'').trim().split(/\r?\n/).filter(x=>x.trim());
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const result=(summary,columns,rows,extra={})=>({summary,columns,rows,...extra});
const formatDate=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
export function calculate(kind,d){
 if(!Object.hasOwn(tools,kind)||!d||JSON.stringify(d).length>30000)throw Error('Check the tool inputs.');
 if(kind==='hex-to-decimal-converter'){
   const v=String(d.hex).trim().replace(/^0x/i,'');if(!/^[a-f0-9]{1,128}$/i.test(v))throw Error('Use 1–128 unsigned hexadecimal digits.');
   return result(BigInt('0x'+v).toString(),['Hexadecimal','Decimal'],[[v.toUpperCase(),BigInt('0x'+v).toString()]]);
 }
 if(kind==='aspect-ratio-calculator'){
   const w=num(d.width,'original width',true),h=num(d.height,'original height',true),t=num(d.target,'new width',true);
   let a=w,b=h;while(b){[a,b]=[b,a%b]}
   return result(w/a+':'+h/a,['Original','Resized'],[[w+' × '+h+' px',t+' × '+Math.round(t*h/w)+' px']]);
 }
 if(kind==='ppi-calculator'){
   const w=num(d.width,'image width',true),h=num(d.height,'image height',true);
   if(d.mode==='Print size'){const p=num(d.ppi,'print density');return result(compact(w/p)+' × '+compact(h/p)+' in',['Width','Height'],[[compact(w/p*25.4)+' mm',compact(h/p*25.4)+' mm']]);}
   const diag=num(d.diagonal,'screen diagonal');return result(compact(Math.hypot(w,h)/diag)+' ppi',['Pixels','Diagonal'],[[w+' × '+h,diag+' in']]);
 }
 if(kind==='grade-calculator'){
   const weighted=d.mode==='Weighted';let earned=0,total=0,weightSum=0;
   const rows=lines(d.rows).map(line=>{const cells=line.split(',').map(s=>s.trim());if(cells.length!==3)throw Error('Use earned, possible, weight for each assignment.');
     const [score,possible,weight]=cells,p=num(possible,'possible points'),w=num(weight,'weight',false,-1,100);weightSum+=w;
     const omit=!score&&d.missing==='Exclude';const e=score?num(score,'earned points',false,-1):0;
     if(!omit){earned+=weighted?e/p*w:e;total+=weighted?w:p;}
     return [score||'Unscored',possible,weighted?weight+'%':'—'];});
   if(!total||weighted&&Math.abs(weightSum-100)>1e-7) throw Error('Provide scores and weights totaling 100% in weighted mode.');
   return result(compact(100*earned/total)+'%',['Earned','Possible','Weight'],rows);
 }
 if(kind==='weeks-in-year'){
   const y=num(d.year,'year',true,1582,9998),jan=new Date(Date.UTC(y,0,1)),next=Date.UTC(y+1,0,1),days=(next-+jan)/86400000,offset=(jan.getUTCDay()+(d.start==='Monday'?6:0))%7;
   const iso=jan.getUTCDay()===4||jan.getUTCDay()===3&&days===366?53:52;
   return result(iso+' ISO weeks in '+y,['Measure','Value'],[['Gregorian year',days+' days'],['Full weeks and remainder','52 weeks + '+(days-364)+' day'+(days===366?'s':'')],['Week rows intersecting the year',Math.ceil((offset+days)/7)]]);
 }
 if(kind==='calendar-2027'){
   const month=num(d.month,'month',true,0,12),date=new Date(Date.UTC(2027,month-1,1)),offset=(date.getUTCDay()+(d.start==='Monday'?6:0))%7,n=new Date(Date.UTC(2027,month,0)).getUTCDate(), dates=Array(offset).fill('');
   const clock=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:d.zone||'UTC'}).formatToParts(new Date());
   const part=k=>clock.find(c=>c.type===k).value;const today=part('year')+'-'+part('month')+'-'+part('day');
   const tags=new Map(), add=(day,msg)=>{tags.set(day,[...(tags.get(day)||[]),msg]);};
   for(const h of holidays){if(h.actual_date)add(h.actual_date,h.name_en_us);if(h.observed_date!==h.actual_date)add(h.observed_date,h.nominal_year!==2027?h.name_en_us:h.name_en_us+' (observed)');}
   const events=lines(d.events).map(line=>{const i=line.indexOf(','),day=line.slice(0,i).trim(),title=line.slice(i+1).trim();if(i<0||!validDate(day)||day.slice(0,4)!=='2027'||!title)throw Error('Use a 2027 date and event name.');add(day,title);return {day,title};});
   for(let i=1;i<=n;i++){const iso='2027-'+String(month).padStart(2,'0')+'-'+String(i).padStart(2,'0');dates.push([i,...(today===iso?['Today']:[]),...(tags.get(iso)||[])].join(' · '));}
   const rows=[];while(dates.length){const row=dates.splice(0,7);while(row.length<7)row.push('');rows.push(row);}
   const cols=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];if(d.start==='Monday')cols.push(cols.shift());
   return result(date.toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'}),cols,rows,{events});
 }
 if(kind==='schedule-maker'){
   const events=lines(d.rows).map(line=>{const [day,s,e,...parts]=line.split(',').map(x=>x.trim());const title=parts.join(', ');if(!validDate(day)||![s,e].every(x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x))||s>=e||!title)throw Error('Each row needs a valid date, start time, later end time, and activity.');return {day,s,e,title};}).sort((a,b)=>(a.day+a.s).localeCompare(b.day+b.s));
   const rows=events.map((e,i)=>[e.day,e.s,e.e,e.title,events.some((p,j)=>j!==i&&p.day===e.day&&e.s<p.e&&e.e>p.s)?'Overlap':'Clear']);
   return result(events.length+' scheduled blocks',['Date','Start','End','Activity','Timing'],rows,{events});
 }
 if(kind==='significant-figures-calculator'){
   const raw=String(d.value).trim(),m=/^[+-]?(\d*\.?\d+|\d+\.)(?:e([+-]?\d{1,3}))?$/i.exec(raw);
   if(!m||m[1].length>45||!Number.isFinite(Number(raw)))throw Error('Enter a finite decimal or scientific value.');
   let digits=m[1].replace('.','').replace(/^0+/,'');const ambiguous=!m[1].includes('.')&&!m[2]&&/0$/.test(digits);
   if(ambiguous)digits=digits.replace(/0+$/,'');const count=digits.length||Math.max(1,(m[1].split('.')[1]||'').length);
   const precision=num(d.digits,'requested precision',true,0,15);
   const parts=m[1].split('.'),mant=m[1].replace('.',''),nz=mant.search(/[1-9]/);
   let rounded=(nz===-1?0n:BigInt(mant.slice(nz,nz+precision).padEnd(precision,'0'))+BigInt(+(mant[nz+precision]||0)>=5?1:0)).toString();
   let exp=(Number(m[2])||0)+parts[0].length-nz-1;if(rounded.length>precision){rounded=rounded.slice(0,-1);exp++;}
   rounded=rounded.padEnd(precision,'0');const out=(raw[0]==='-'&&nz>=0?'-':'')+rounded[0]+(precision>1?'.'+rounded.slice(1):'')+'e'+(nz===-1?0:exp);
   return result(count+' significant figure'+(count===1?'':'s'),['As written','Rounded (half away from zero)'],[[raw,out]],{note:ambiguous?'Trailing zeros in an integer are ambiguous. This count treats them as placeholders. Use a decimal point to mark them significant.':''});
 }
 const sets=[d.a,d.b,d.c].map(s=>new Set(lines(s).map(x=>x.trim())));const n=sets[2].size?3:2;
 const region={};for(let i=1;i<(1<<n);i++)region[i]=[];
 for(const v of new Set(sets.flatMap(s=>[...s]))){const key=sets.reduce((k,s,i)=>k+(s.has(v)?1<<i:0),0);region[key].push(v);}
 return result(n+'-set Venn diagram',['Exclusive region','Members'],Object.entries(region).map(([k,v])=>[['A','B','C'].filter((_,i)=>+k&(1<<i)).join(' ∩ ')+' only',v.join(', ')||'—']),{venn:n});
}
