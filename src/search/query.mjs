const normalize=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const corrections={invocie:'invoice',inovice:'invoice',calender:'calendar',agrement:'agreement'};
const supported=new Set(['pdf','xlsx','docx','pptx','svg','jpeg','jpg','png','csv','ics','canva']);
export class SearchError extends Error {constructor(message,status){super(message);this.status=status;}}
export async function querySearch(db,params){
  const raw=params.get('q')||'',format=params.get('format')||'',category=params.get('category')||'',paper=params.get('paper')||'',sort=params.get('sort')||'relevance';
  if(raw.length>160 || (format&&!supported.has(format)) || category.length>220 || (paper && paper!=='letter') || !['title','relevance','newest'].includes(sort))throw new SearchError('Invalid search filters.',400);
  const requested=Number(params.get('page')||1);if(!Number.isSafeInteger(requested)||requested<1||requested>100000)throw new SearchError('Invalid page number.',400);
  const original=normalize(raw),suggestion=Object.hasOwn(corrections,original)?corrections[original]:null;
  const query=suggestion||original, tokens=query.split(' ').filter(Boolean);
  if(tokens.length>12)throw new SearchError('Use 12 search terms or fewer.',400);
  const empty={results:[],total:0,page:1,requestedPage:requested,pages:0,facets:{formats:{}},suggestions:[],correctedQuery:suggestion};
  if((!query&&!category&&!format&&!paper) || (raw.trim()&&!query))return empty;
  const active=await db.prepare('SELECT revision FROM search_active WHERE id=1').first('revision');
  if(!active)throw new SearchError('The search index is being prepared.',503);
  const clauses=['d.revision=?'],args=[active];
  let join='',score='0',matchArgs=[];
  if(tokens.length){join='JOIN search_fts ON search_fts.rowid=d.row_id';clauses.push('search_fts MATCH ?');args.push(tokens.map(s=>'"'+s+'"*').join(' AND '));score='bm25(search_fts,12,15,6,1,0.3)';}
  if(category){clauses.push('EXISTS(SELECT 1 FROM json_each(d.memberships) WHERE value=?)');args.push(category);}
  if(paper){clauses.push("d.paper_sha IS NOT NULL AND EXISTS(SELECT 1 FROM downloadable_assets p WHERE p.template_id=d.template_id AND p.document_id IS NULL AND p.format='pdf' AND p.published=1 AND p.sha256=d.paper_sha)");}
  // Only checksum-matched, currently published catalog assets can contribute to a result or facet.
  const live="a.template_id=d.template_id AND a.document_id IS NULL AND a.published=1 AND EXISTS(SELECT 1 FROM json_each(d.assets) j WHERE j.key=a.format AND j.value=a.sha256)";
  clauses.push('NOT EXISTS(SELECT 1 FROM delivery_holds h WHERE h.template_id=d.template_id)');
  const beforeFormat=clauses.join(' AND '),beforeArgs=[...args];
  clauses.push('EXISTS(SELECT 1 FROM downloadable_assets a WHERE '+live+(format?' AND a.format=?':'')+')');if(format)args.push(format);
  const from=' FROM search_templates d '+join+' WHERE '+clauses.join(' AND ');
  const total=await db.prepare('SELECT count(*) AS n'+from).bind(...args).first('n');
  if(!total)return empty;
  const pages=Math.ceil(total/24),page=Math.min(requested,pages);
  let order='d.title COLLATE NOCASE,d.template_id';
  if(sort==='newest')order='d.first_seen DESC,d.template_id';
  if(sort==='relevance'&&tokens.length){order="CASE WHEN d.subject=? THEN 0 WHEN instr(' '||d.subject||' ',' '||?||' ')>0 THEN 1 WHEN d.subject LIKE ? THEN 2 ELSE 3 END,"+score+',d.title COLLATE NOCASE,d.template_id';matchArgs=[query,query,query+'%'];}
  const [items,facets]=await Promise.all([
    db.prepare('SELECT d.template_id id,d.title,d.path,d.preview,d.summary,d.category,(SELECT group_concat(a.format) FROM downloadable_assets a WHERE '+live+') formats'+from+' ORDER BY '+order+' LIMIT 24 OFFSET ?').bind(...args,...matchArgs,(page-1)*24).all(),
    db.prepare('SELECT a.format,count(DISTINCT d.template_id) n FROM search_templates d '+join+' JOIN downloadable_assets a ON '+live+' WHERE '+beforeFormat+' GROUP BY a.format').bind(...beforeArgs).all()
  ]);
  const results=items.results.map(r=>({...r,topic_path:r.path,formats:r.formats.split(',').sort()}));
  return {results,total,page,requestedPage:requested,pages,facets:{formats:Object.fromEntries(facets.results.map(f=>[f.format,f.n]))},
    suggestions:results.slice(0,5).map(r=>({title:r.title,path:r.path})),correctedQuery:suggestion};
}
export async function searchResponse(request,env){
  if(request.method!=='GET')return Response.json({code:'METHOD_NOT_ALLOWED'},{status:405});
  try{return Response.json(await querySearch(env.DB,new URL(request.url).searchParams),{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
  catch(e){return Response.json({code:e.status===400?'VALIDATION_ERROR':'DEPENDENCY_UNAVAILABLE'},{status:e instanceof SearchError?e.status:503,headers:{'Cache-Control':'no-store'}});}
}
