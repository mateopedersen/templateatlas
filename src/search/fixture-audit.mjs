// Read-only check against the running site. Supply the package's search cases, local PDF size evidence and output file.
import {readFile,writeFile} from 'node:fs/promises';
import {entries} from '../lib/catalog.mjs';
const [origin,packageFile,paperFile,evidence]=process.argv.slice(2),root=new URL(origin);
if(!['https:','http:'].includes(root.protocol)||!packageFile||!paperFile||!evidence)throw Error('Usage: node src/search/fixture-audit.mjs ORIGIN FIXTURES PAPER_JSON EVIDENCE_JSON');
const fixtures=JSON.parse(await readFile(packageFile)).cases,letter=JSON.parse(await readFile(paperFile)),byId=new Map(entries.map(e=>[e.id,e]));
async function search(q,filters={}){
 const params=new URLSearchParams({q,...filters}),r=await fetch(new URL('/api/search?'+params,root),{redirect:'error'});
 if(!r.ok)throw Error('Search returned '+r.status);return r.json();
}
const checks={
 'SEARCH-01':r=>r.results[0]?.id==='ta-invoice-001',
 'SEARCH-02':r=>r.results[0]?.id==='ta-non-disclosure-agreement-001',
 'SEARCH-03':r=>r.results.length>0&&r.results.some(s=>s.id.includes('resume')),
 'SEARCH-04':r=>r.correctedQuery==='invoice'&&r.results[0]?.id==='ta-invoice-001',
 'SEARCH-05':r=>r.results[0]?.id==='ta-january-2027-calendar-001',
 'SEARCH-06':r=>r.results[0]?.id==='ta-52-week-money-challenge-001',
 'SEARCH-07':r=>r.results.some(s=>s.id==='ta-r134a-pressure-temperature-chart-001'),
 'SEARCH-08':r=>r.results.every(s=>s.formats.includes('xlsx')&&byId.get(s.id)?.assets.xlsx),
 'SEARCH-09':r=>r.results.length>0&&/(?:^|-)chart(?:-|$)/.test(r.results[0].id)&&r.results.every(s=>typeof s.category==='string'&&s.category.length>0),
 'SEARCH-10':r=>r.results.filter(s=>s.id==='ta-waterfall-chart-001').length===1,
 'SEARCH-11':r=>r.results[0]?.id==='ta-histogram-001',
 'SEARCH-12':r=>r.total===0,
 'SEARCH-13':r=>r.total===0&&r.results.length===0,
 'SEARCH-14':r=>r.total===0&&r.results.length===0,
 'SEARCH-15':r=>r.total===0,
 'SEARCH-16':r=>r.total===0,
 'SEARCH-17':r=>r.requestedPage===2&&r.page===Math.min(2,r.pages)&&new Set(r.results.map(s=>s.id)).size===r.results.length,
 'SEARCH-18':r=>r.total===0,
 'SEARCH-19':r=>r.results.length>0&&r.results.every(s=>letter[byId.get(s.id)?.assets.pdf?.sha256]==='letter'),
 'SEARCH-20':r=>r.results[0]?.id==='ta-pie-chart-001'&&r.results.filter(s=>s.id==='ta-pie-chart-001').length===1
};
const cases=[];
for(const f of fixtures){try{const r=await search(f.query,f.filters);cases.push({id:f.id,query:f.query,passed:!!checks[f.id](r),total:r.total,first:r.results[0]?.id||null});}catch(e){cases.push({id:f.id,query:f.query,passed:false,error:e.message});}}
const subjectChecks=[];
for(let i=0;i<Math.min(60,entries.length);i++){
 const s=entries[Math.floor(i*entries.length/60)],q=s.topic_slug.replaceAll('-',' ');try{const r=await search(q);subjectChecks.push({id:s.id,first:r.results[0]?.id||null,passed:r.results[0]?.id===s.id});}catch(e){subjectChecks.push({id:s.id,passed:false,error:e.message});}
}
const result={testedAt:new Date().toISOString(),origin:root.origin,publishedCatalogSize:entries.length,fixturePasses:cases.filter(c=>c.passed).length,fixtureCount:cases.length,topicChecksPassed:subjectChecks.filter(c=>c.passed).length,topicChecks:subjectChecks.length,cases,subjectChecks};
await writeFile(evidence,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({fixtures:result.fixturePasses+'/'+cases.length,topics:result.topicChecksPassed+'/'+subjectChecks.length,failed:[...cases,...subjectChecks].filter(c=>!c.passed).map(c=>c.id)}));if([...cases,...subjectChecks].some(c=>!c.passed))process.exitCode=1;
