// Used by trusted catalog intake, outside the public request path.
import {createHash} from 'node:crypto';
const digest=s=>createHash('sha256').update(s).digest('hex');
const alias={
 'non-disclosure-agreement':'nda nondisclosure confidentiality',
 'curriculum-vitae':'cv resume',
 'r134a-pressure-temperature-chart':'134a r 134a refrigerant',
 '2027-julian-day-of-year-calendar':'ordinal day calendar'
};
export function searchRows(entries,categories,paper={}){
  const memberships=new Map(entries.map(e=>[e.id,new Set([e.primary_category_path])]));
  for(const c of categories)for(const id of c.members||[])memberships.get(id)?.add(c.path);
  const byPath=new Map(categories.map(c=>[c.path,c]));
  return entries.map(e=>{
    const groups=memberships.get(e.id);
    for(const current of groups){const parent=byPath.get(current)?.parent;if(parent&&byPath.has(parent))groups.add(parent);}
    const assets=Object.fromEntries(Object.entries(e.assets).map(([f,a])=>[f,a.sha256]));
    const pdf=assets.pdf;
    return {id:e.id,title:e.title,subject:e.topic_slug.replaceAll('-',' '),keyword:[e.display_title,alias[e.topic_slug]||''].join(' '),
      summary:e.summary,category:[...groups].map(p=>byPath.get(p)?.title).filter(Boolean).join(' '),
      path:e.topic_path,preview:e.preview,memberships:JSON.stringify([...groups].sort()),assets:JSON.stringify(assets),
      paperSha:pdf && paper[pdf]==='letter'?pdf:null};
  }).sort((a,b)=>a.id.localeCompare(b.id,'en-US'));
}
export async function indexRelease(db,entries,categories,paper={}){
  const rows=searchRows(entries,categories,paper),revision=digest(JSON.stringify(rows));
  if(!rows.length)throw Error('Refusing to activate an empty release');
  await db.prepare('INSERT OR IGNORE INTO search_releases(revision,expected) VALUES(?,?)').bind(revision,rows.length).run();
  const active=await db.prepare('SELECT revision FROM search_active WHERE id=1').first('revision');
  if(active===revision)return {indexed:rows.length,revision,reused:true};
  for(let i=0;i<rows.length;i+=50){
    await db.batch(rows.slice(i,i+50).map(r=>db.prepare(`INSERT OR IGNORE INTO search_templates
      (revision,template_id,title,subject,keyword,summary,category,path,preview,memberships,assets,paper_sha,first_seen)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT MIN(first_seen) FROM search_templates WHERE template_id=?),unixepoch()))`)
      .bind(revision,r.id,r.title,r.subject,r.keyword,r.summary,r.category,r.path,r.preview,r.memberships,r.assets,r.paperSha,r.id)));
  }
  const [verified,switched]=await db.batch([
    db.prepare('UPDATE search_releases SET completed=unixepoch() WHERE revision=? AND expected=(SELECT count(*) FROM search_templates WHERE revision=?)').bind(revision,revision),
    db.prepare(`INSERT INTO search_active SELECT 1,revision FROM search_releases WHERE revision=? AND completed IS NOT NULL
      AND COALESCE((SELECT revision FROM search_active WHERE id=1),'')=? ON CONFLICT(id) DO UPDATE SET revision=excluded.revision`).bind(revision,active||'')
  ]);
  if(verified.meta.changes!==1||switched.meta.changes!==1)throw Error('Search release changed concurrently or failed its count check. Retry against the current release.');
  return {indexed:rows.length,revision,reused:false};
}
