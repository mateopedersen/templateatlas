import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {indexRelease} from '../src/search/indexer.mjs';
import {querySearch} from '../src/search/query.mjs';

test('long supported titles rank correctly within D1 pattern limits and retain format, checksum and hold gates',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  for(const file of ['0001_membership.sql','0003_admin.sql','0005_search.sql','0007_search_dimensions.sql'])sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  // Model D1's stricter LIKE-pattern boundary, which native SQLite defaults do not enforce.
  sqlite.function('like',(pattern,value)=>{
    if(Buffer.byteLength(pattern)>50)throw Error('D1 LIKE pattern limit');
    return Number(String(value).toLowerCase().startsWith(pattern.replace(/%$/,'').toLowerCase()));
  });
  const db={prepare(sql){const statement=sqlite.prepare(sql);let values=[];return{
    bind(...args){values=args;return this},async run(){return{meta:{changes:Number(statement.run(...values).changes)}}},
    async all(){return{results:statement.all(...values)}},async first(key){const row=statement.get(...values);return key?row?.[key]:row},
  }},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}};
  const title='Comprehensive International Equipment Lease Agreement for Manufacturing Facilities',sha='a'.repeat(64);
  const entry=(id,title)=>({id,title,display_title:title,summary:'Record the leased equipment, delivery and return.',topic_slug:id,topic_path:'/templates/'+id+'/',primary_category_path:'/categories/legal/',builder_kind:'agreement',preview:'/preview.webp',assets:{pdf:{sha256:sha}}});
  try{
    assert.ok(title.length>50);
    assert.throws(()=>sqlite.prepare('SELECT ? LIKE ?').get(title,title.toLowerCase()+'%'));
    const entries=[entry('fixture-equipment',title),entry('fixture-appendix',title+' Appendix')];
    await indexRelease(db,entries,[{path:'/categories/legal/',title:'Legal',members:[]}]);
    for(const item of entries)sqlite.prepare("INSERT INTO downloadable_assets(id,template_id,version,format,object_key,sha256,size_bytes,filename,mime,published) VALUES(?,?,'v1','pdf',?,?,100,'template.pdf','application/pdf',1)").run(item.id+'-pdf',item.id,'private/'+item.id,sha);
    const search=(format='pdf')=>querySearch(db,new URLSearchParams({q:title,format}));
    const result=await search();assert.equal(result.total,2);assert.equal(result.results[0].id,'fixture-equipment');
    assert.equal((await search('docx')).total,0);
    sqlite.prepare('INSERT INTO delivery_holds VALUES(?,?)').run('fixture-equipment','review');
    assert.deepEqual((await search()).results.map(r=>r.id),['fixture-appendix']);
    sqlite.prepare('UPDATE downloadable_assets SET sha256=? WHERE template_id=?').run('b'.repeat(64),'fixture-appendix');
    assert.equal((await search()).total,0);
  }finally{sqlite.close()}
});
