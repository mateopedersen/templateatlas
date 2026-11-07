import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const [base, output] = process.argv.slice(2);
const browser = await chromium.launch({channel:'chrome',headless:true});
const report=[];
try {
  for (const width of [1440,390]) for (const path of ['/', '/templates/agency-agreement/']) {
    const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
    const p=await context.newPage();const failures=[],errors=[];
    p.on('requestfailed',r=>failures.push({url:r.url(),error:r.failure()?.errorText}));
    p.on('pageerror',e=>errors.push(e.message));
    await p.addInitScript(()=>{window.__metrics={lcp:0,cls:0};new PerformanceObserver(l=>{window.__metrics.lcp=l.getEntries().at(-1).startTime}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__metrics.cls+=e.value}).observe({type:'layout-shift',buffered:true});});
    const response=await p.goto(new URL(path,base).href,{waitUntil:'load',timeout:60000});
    await p.waitForTimeout(1200);
    const initial=await p.evaluate(()=>({metrics:window.__metrics,navigation:performance.getEntriesByType('navigation').map(e=>({ttfb:e.responseStart,dom:e.domContentLoadedEventEnd,load:e.loadEventEnd,bytes:e.decodedBodySize,transfer:e.transferSize}))[0],overflow:document.documentElement.scrollWidth>innerWidth,images:[...document.images].filter(i=>i.getBoundingClientRect().width>0).map(i=>({url:i.currentSrc||i.src,loaded:i.complete&&i.naturalWidth>0,rect:i.getBoundingClientRect().toJSON()})),slowResources:performance.getEntriesByType('resource').sort((a,b)=>b.duration-a.duration).slice(0,8).map(e=>({url:e.name,ms:e.duration,bytes:e.transferSize}))}));
    if(path==='/')await p.locator('[data-desk]').scrollIntoViewIfNeeded();
    else await p.locator('[data-chart-card]').first().scrollIntoViewIfNeeded();
    await p.waitForTimeout(2000);
    const visible=await p.evaluate(()=>[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.top<innerHeight&&r.bottom>0}).map(i=>({src:i.currentSrc||i.src,loaded:i.complete&&i.naturalWidth>0,width:i.naturalWidth,height:i.naturalHeight})));
    await p.screenshot({path:output.replace(/\.json$/,`-${width}-${path==='/'?'home':'topic'}.png`)});
    report.push({path,width,status:response.status(),cache:response.headers()['x-templateatlas-cache'],...initial,visibleAfterScroll:visible,failures,errors});
    console.log(JSON.stringify({path,width,ttfb:initial.navigation.ttfb,lcp:initial.metrics.lcp,cls:initial.metrics.cls,overflow:initial.overflow,brokenVisible:visible.filter(i=>!i.loaded),failures:failures.length,errors:errors.length}));
    await context.close();
  }
}finally{await browser.close();}
await writeFile(output,JSON.stringify(report,null,2));
