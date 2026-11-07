import { chromium } from 'playwright';
import { collections } from '../src/lib/imported.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const [base, output] = process.argv.slice(2);
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try {
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const path of ['/', '/templates/', '/templates/agency-agreement/', '/templates/new-hire-checklist/']){
   const response=await page.goto(new URL(path,base).href,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200,path);
   await page.evaluate(async()=>{await document.fonts.ready;await new Promise(requestAnimationFrame);});
   const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,icons:[...document.querySelectorAll('.file-button-icon svg use')].slice(0,8).map(e=>({ref:e.getAttribute('href'),box:{width:e.getBBox().width,height:e.getBBox().height},exists:!!document.querySelector(e.getAttribute('href'))})),cards:document.querySelectorAll('[data-chart-card]').length}));
   assert.equal(geometry.overflow,false,`${width} ${path}: overflow`);
   assert.ok(geometry.icons.every(e=>e.exists&&e.box.width>0),`${path}: missing file symbols`);
   if(path.includes('agency-agreement')){
    assert.equal(geometry.cards,100);
    const before=await page.locator('[data-chart-card]').first().boundingBox();
    await page.locator('[data-chart-card] .imported-card-more summary').nth(1).click();
    const after=await page.locator('[data-chart-card]').first().boundingBox();assert.equal(before.height,after.height,'Neighbor stretched');
    const select=page.locator('[data-chart-filters] select[name=edition]');
    const choice=await select.locator('option').nth(1).getAttribute('value');
    await select.evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},choice);
    const expected=collections.find(c=>c.topic_path===path).items.filter(e=>e.edition===choice).length;
    assert.equal(await page.locator('[data-chart-card]:not([hidden])').count(),expected);
    await page.locator('.chart-filter-reset').click();
    await page.waitForFunction(()=>document.querySelectorAll('[data-chart-card]:not([hidden])').length===100);
    await page.screenshot({path:output.replace(/\.json$/,`-${width}.png`)});
   }
   results.push({path,width,status:response.status(),...geometry});
  }
  const item=collections.find(c=>c.topic_path==='/templates/agency-agreement/').items[0];
  const detail=await page.goto(new URL(item.detail_path,base).href,{waitUntil:'domcontentloaded'});assert.equal(detail.status(),200);
  const preview=page.locator('[data-preview-panel] img').first();assert.ok((await preview.getAttribute('src')).includes('thumb-'));
  await page.locator('.imported-large-preview').first().click();assert.equal(await page.locator('.preview-lightbox').isVisible(),true);
  assert.equal(await page.locator('[data-zoom-image]').getAttribute('src'),item.previewPages?.[0]?.url||item.preview);
  await page.locator('[data-zoom-close]').click();
  assert.equal(await page.locator('.preview-lightbox').isVisible(),false);
  assert.deepEqual(errors,[]);results.push({width,detail:item.detail_path,zoomFullResolution:true,errors});await page.close();
 }
}finally{await browser.close();}
await writeFile(output,JSON.stringify(results,null,2));
console.log(JSON.stringify({passed:results.length,widths:[1440,390],filters:true,reset:true,more:true,svgSymbols:true,fullResolutionZoom:true}));
