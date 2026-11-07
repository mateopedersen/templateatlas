import test from 'node:test';
import assert from 'node:assert/strict';
import collections from '../src/data/imported-collections.json' with {type:'json'};
import {validateImportedEditorial} from '../src/lib/imported-editorial.mjs';

test('reviewed catalog passes the shared editorial intake gate',()=>{
  assert.equal(validateImportedEditorial(collections),true);
});
test('preserved production records cannot introduce new items or unreviewed copy',()=>{
  for(const change of [e=>e.id='new-unreviewed-item',e=>e.title='Unreviewed replacement',e=>e.assets.webp.sha256='replaced']){
    const preserved=structuredClone(collections.find(c=>c.preservedProduction));
    change(preserved.items[0]);
    assert.throws(()=>validateImportedEditorial([preserved]),/Preserved/);
  }
});
test('changing original assets or reviewed copy invalidates the review',()=>{
  for(const change of [e=>e.assets.pdf.sha256='replaced', e=>e.intro='Unreviewed replacement', e=>e.description_paragraphs[0]='Unreviewed paragraph']) {
    const candidate=structuredClone(collections);
    change(candidate[0].items[0]);
    assert.throws(()=>validateImportedEditorial(candidate),/review/i);
  }
});
test('numeric-only legacy summaries cannot replace authored More content',()=>{
  const candidate=structuredClone(collections);
  delete candidate[0].items[0].description_paragraphs;
  assert.throws(()=>validateImportedEditorial(candidate),/expanded paragraphs/);
});
test('duplicate template titles and expanded descriptions fail intake',()=>{
  const candidate=structuredClone(collections);
  const [first,second]=candidate[0].items;
  second.title=first.title;second.description_paragraphs=first.description_paragraphs;
  assert.throws(()=>validateImportedEditorial(candidate),/Duplicate/);
});
