import {DurableObject} from 'cloudflare:workers';
import {gateway,proxy,idleMilliseconds} from './handler.mjs';
export class RendererInstance extends DurableObject{
 constructor(ctx,env){super(ctx,env);if(ctx.container?.running)ctx.blockConcurrencyWhile(()=>ctx.container.setInactivityTimeout(idleMilliseconds));}
 async fetch(request){return proxy(this.ctx.container,request,this.env.RENDER_SECRET);}
}
export default {fetch:gateway};
