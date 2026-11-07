import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {indexRelease} from '../src/search/indexer.mjs';

test('a complete reindex preserves discovery dates, updates full-text search, and can resume unchanged',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync(new URL('../migrations/0005_search.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../migrations/0007_search_dimensions.sql',import.meta.url),'utf8'));
 const db={prepare(sql){
  const statement=sqlite.prepare(sql);let values=[];
  return {bind(...args){values=args;return this;},async run(){return {meta:{changes:Number(statement.run(...values).changes)}};},async all(){return {results:statement.all(...values)};},async first(key){const result=statement.get(...values);return key?result?.[key]:result;}};
 },async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 try{
  sqlite.exec("INSERT INTO search_releases VALUES('old',1,1); INSERT INTO search_active VALUES(1,'old');");
  sqlite.prepare('INSERT INTO search_templates(revision,template_id,title,subject,keyword,summary,category,path,preview,memberships,assets,first_seen) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('old','fixture-existing','Earlier title','work','work','Earlier text','Work','/old/','/old.webp','[]','{}',123);
  const categories=[{path:'/categories/work/',title:'Work',members:[]}];
  const entry=(id,title)=>({id,title,topic_slug:'handoff',display_title:title,summary:'Plan a clear handoff.',primary_category_path:'/categories/work/',topic_path:`/templates/${id}/`,preview:`/${id}.webp`,assets:{docx:{sha256:'a'.repeat(64)}},builder_kind:'document'});
  const entries=[entry('fixture-existing','Updated Handoff Plan'),entry('fixture-new','Fresh Queue Handoff')];
  const result=await indexRelease(db,entries,categories);
  assert.equal(result.indexed,2);
  assert.equal(sqlite.prepare('SELECT revision FROM search_active').get().revision,result.revision);
  const records=sqlite.prepare('SELECT template_id,first_seen FROM search_templates WHERE revision=? ORDER BY template_id').all(result.revision);
  assert.equal(records[0].first_seen,123);
  assert.ok(records[1].first_seen>123);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM search_fts JOIN search_templates t ON t.row_id=search_fts.rowid WHERE search_fts MATCH 'Fresh' AND t.revision=?").get(result.revision).n,1);
  const before=sqlite.prepare('SELECT count(*) AS n FROM search_templates').get().n;
  assert.equal((await indexRelease(db,entries,categories)).reused,true);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM search_templates').get().n,before);
 }finally{sqlite.close();}
});
