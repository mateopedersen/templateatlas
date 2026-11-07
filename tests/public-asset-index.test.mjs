import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = JSON.parse(readFileSync(new URL('../src/data/imported-collections.json',import.meta.url)));
import runtime from '../src/data/imported-runtime.json' with {type:'json'};
import {publicCatalogAssets} from '../src/lib/public-assets.mjs';
import {publicCatalogAssets as reviewedAssets} from '../src/lib/imported.mjs';

test('the lightweight delivery index exactly matches every reviewed public preview, and excludes private originals',()=>{
  assert.equal(publicCatalogAssets.size, reviewedAssets.size);
  for(const [path, a] of reviewedAssets){
    const delivery=publicCatalogAssets.get(path);
    assert.deepEqual([delivery.key,delivery.sha256,delivery.bytes,delivery.mime],[a.key,a.sha256,a.bytes,a.mime]);
  }
});

test('the smaller deployed catalog preserves every accepted content field, asset, ID and URL',()=>{
  assert.equal(source.length,runtime.length);
  for(let i=0;i<source.length;i++){
    assert.equal(source[i].id,runtime[i].id);
    assert.equal(source[i].items.length,runtime[i].items.length);
    for(let j=0;j<source[i].items.length;j++){
      const {editorial_review:proof,...original}=source[i].items[j];
      const {editorial_review:status,...deployed}=runtime[i].items[j];
      assert.deepEqual(deployed,original);
      if (source[i].preservedProduction) {assert.equal(proof,undefined);assert.equal(status,undefined);assert.ok(original.preservedSearch);}
      else assert.equal(status.status,proof.status);
    }
  }
});
