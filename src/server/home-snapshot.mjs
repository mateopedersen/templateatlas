import manifest from '../data/home-snapshot.json' with {type:'json'};
import {catalogState} from '../lib/publication.mjs';
import {publicPageKey} from './public-page-cache.mjs';

export async function homeSnapshot(request,env,readState=catalogState) {
  if(new URL(request.url).pathname!=='/' || !publicPageKey(request,env,'snapshot'))return null;
  let state;
  try{state=await readState(env.DB)}catch{}
  if(!state?.ready)return new Response('The template library is temporarily unavailable.',{status:503,headers:{'Cache-Control':'no-store','Retry-After':'60'}});
  if(manifest.featuredIds.some(id=>state.held.has(id)))return null;
  try{
    const response=await env.ASSETS.fetch(new Request(new URL(manifest.path,request.url)));
    if(response.status===200 && response.headers.get('content-type')?.includes('text/html')){
      const result=new Response(response.body,response);
      result.headers.set('X-TemplateAtlas-Home','snapshot');
      return result;
    }
  }catch{}
  return null;
}
