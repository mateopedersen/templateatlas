import seeds from '../data/seeds.json' with { type: 'json' };
import catalog from '../data/release.json' with { type: 'json' };
import categories from '../data/categories.json' with { type: 'json' };
import routes from '../data/routes.json' with { type: 'json' };
export { categories, routes };
const releases = new Map(catalog.map(r => [r.id, r]));
export const entries = seeds.flatMap(seed => {
  const release = releases.get(seed.seed_id);
  return release ? [{...seed, ...release}] : [];
});
export const byPath = new Map(entries.flatMap(s=>[[s.topic_path,s],[s.detail_path,s]]));
export const display = (s) => s.replace(/Business Commerce|Charts Graphs|Education Academic|Design Creative|Food Cooking|Health Medical|Construction Maintenance|Games Entertainment|Home Lifestyle|Music Instruments|Vehicles Transportation|Sports Recreation|Invoices Payments|Contracts Agreements|Marketing Sales|Business Plans Reports|Letters Correspondence|Certificates Licenses/g, m=>m.replace(/ (\S+)$/, ' & $1'));
export function categoryItems(cat){const members=new Set(cat.members);return entries.filter(s=>s.primary_category_path===cat.path||members.has(s.seed_id));}
export function search(query,format,group){
  const normalize=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const q=normalize(query.slice(0,160)), term=({nda:'non disclosure agreement',cv:'curriculum vitae',invocie:'invoice'})[q]||q;
  const pool=group?categoryItems(categories.find(c=>c.path===group)||{members:[]}):entries;
  if(query.trim()&&!q) return [];
  return pool.filter(s=>!format||s.formats.includes(format)).map(s=>{
    const title=normalize(s.display_title), text=title+' '+normalize(s.summary);
    const score=term===title?100:term&&title.includes(term)?50:term.split(' ').every(w=>text.includes(w))?10:0;
    return {s,score};
  }).filter(x=>x.score).sort((a,b)=>b.score-a.score||a.s.display_title.localeCompare(b.s.display_title,'en-US')).map(x=>x.s);
}
