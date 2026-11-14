import test from 'node:test';
import assert from 'node:assert/strict';
import {collections as source} from '../src/lib/imported.mjs';
import {collections,importedEntries,getImportedCollection} from '../src/lib/imported-runtime.mjs';

test('bounded runtime retains every accepted collection, detail URL and complete source payload',async()=>{
  assert.equal(collections.length,source.length);
  assert.equal(importedEntries.length,source.reduce((sum,c)=>sum+c.items.length,0));
  for(const expected of source){
    const actual=await getImportedCollection(expected.topic_path);
    const normalized={...expected,items:expected.items.map(item=>({...item,...(item.editorial_review?{editorial_review:{status:item.editorial_review.status}}:{})}))};
    assert.deepEqual(actual,normalized,expected.id);
    const index=collections.find(c=>c.id===expected.id);
    assert.deepEqual(index.items.map(i=>i.id),expected.items.map(i=>i.id));
    for(const item of expected.items){
      const indexed=index.items.find(i=>i.id===item.id);
      for(const key of ['title','display_title','summary','formats','preview','detail_path','topic_path','pages','primary_category_path','builder_kind','year'])assert.deepEqual(indexed[key],item[key],`${item.id} ${key}`);
      assert.equal((await getImportedCollection(item.detail_path)).id,expected.id);
    }
  }
  assert.equal(await getImportedCollection('/templates/not-a-reviewed-topic/'),undefined);
  assert.equal(await getImportedCollection('/templates/forbearance-agreement/not-a-real-item/'),undefined);
});

test('simultaneous detail reads share the same immutable collection without changing order',async()=>{
  const c=source.find(c=>c.kind==='forbearance-agreement');
  const results=await Promise.all(c.items.map(i=>getImportedCollection(i.detail_path)));
  assert.ok(results.every(result=>result===results[0]));
  assert.deepEqual(results[0].items.map(i=>i.id),c.items.map(i=>i.id));
});
