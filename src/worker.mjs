import {searchResponse} from './search/query.mjs';
import astro from '@astrojs/cloudflare/entrypoints/server';
import {handleApi,resumePending,DownloadActor} from './server/index.mjs';
import * as server from './server/index.mjs';
import {renderDocument} from './lib/render.mjs';
import {entries,categories,categoryItems,routes} from './lib/catalog.mjs';
import aliases from './data/aliases.json' with {type:'json'};
import {tools} from './lib/tools.mjs';
export {DownloadActor};
export default {
 async scheduled(event,env,ctx){ctx.waitUntil(resumePending(env,{renderDocument}));},
 async fetch(req,env,ctx){
  const url=new URL(req.url), p=url.pathname,local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  // Staging is closed unless a separately verified access policy has been installed.
  if(!local && env.DEPLOY_STAGE!=='production')return new Response('Private staging environment',{status:403,headers:{'X-Robots-Tag':'noindex','Cache-Control':'no-store'}});
  if(!local && env.DEPLOY_STAGE==='production' && url.hostname==='www.templateatlas.com'){url.hostname='templateatlas.com';return Response.redirect(url,301);}
  if(local&&env.DEPLOY_STAGE==='local'&&url.origin!==env.PUBLIC_SITE_URL&&req.method==='GET'&&!p.startsWith('/api/'))return Response.redirect(new URL(p+url.search,env.PUBLIC_SITE_URL),307);
  if(!p.endsWith('/')&&Object.hasOwn(routes,p+'/'))return Response.redirect(new URL(p+'/'+url.search,url),301);
  if(p==='/api/health')return Response.json({app:'TemplateAtlas',stage:env.DEPLOY_STAGE,templates:entries.length,billing:env.BILLING_LIVE_ENABLED==='true'?'live':'disabled'},{headers:{'Cache-Control':'no-store'}});
  if(p.startsWith('/admin/')){const guard=server.guardAdminPage;const denied=guard?await guard(req,env):new Response('Administrator access required',{status:403});if(denied)return denied;}
  if(p==='/api/search')return searchResponse(req,env);
  if(p.startsWith('/api/'))return handleApi(req,env,ctx,{renderDocument});
  if(Object.hasOwn(aliases,p))return Response.redirect(new URL(aliases[p],url),301);
  if(p==='/robots.txt')return new Response((env.DEPLOY_STAGE==='production'?'User-agent: *\nAllow: /\nSitemap: https://templateatlas.com/sitemap.xml':'User-agent: *\nDisallow: /')+'\n');
  if(p==='/sitemap.xml'){const paths=['/','/templates/','/categories/','/about/','/help/','/tools/',...Object.keys(tools).map(k=>'/tools/'+k+'/'),...categories.filter(c=>categoryItems(c).length||c.path==='/categories/calculators/').map(c=>c.path),...entries.flatMap(s=>[s.topic_path,s.detail_path])];return new Response('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+paths.map(x=>'<url><loc>https://templateatlas.com'+x+'</loc></url>').join('')+'</urlset>',{headers:{'Content-Type':'application/xml'}});}
  let response=await astro.fetch(req,env,ctx);if(!response.headers.get('content-type')?.includes('text/html'))return response;response=new Response(response.body,response);
  response.headers.set('Cache-Control','private, no-store');response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('Referrer-Policy','strict-origin-when-cross-origin');response.headers.set('X-Frame-Options','DENY');
  response.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
  if(env.DEPLOY_STAGE!=='production')response.headers.set('X-Robots-Tag','noindex, nofollow');
  return response;
 }
};
