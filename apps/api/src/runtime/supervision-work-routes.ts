import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {BusinessError} from '../v1/types.js';
import {MEMBER_COOKIE,RuntimeAccessError,type IdentityRuntime} from './identity.js';
import type {SupervisionWorkRuntime} from './supervision-work-runtime.js';

export function registerSupervisionWorkRoutes(app:FastifyInstance,runtime:SupervisionWorkRuntime,identity:IdentityRuntime){
 const streams=new Set<()=>void>(),identifier=z.string().trim().min(1).max(200);
 const principal=(req:any)=>identity.principal(req,!Object.prototype.hasOwnProperty.call(req.cookies??{},MEMBER_COOKIE));
 const handle=(fn:(req:any,reply:any)=>unknown)=>async(req:any,reply:any)=>{try{reply.header('Cache-Control','private, no-store');return await fn(req,reply);}catch(e){if(e instanceof BusinessError)return reply.code(e.status).send({error:{code:e.code,message:e.message}});if(e instanceof RuntimeAccessError)return reply.code(e.statusCode).send({error:{code:e.code,message:e.message}});if(e instanceof z.ZodError)return reply.code(400).send({error:{code:'INVALID_INPUT',message:'工作项或事件位置格式不正确'}});throw e;}};
 const base='/api/v1/projects/:id/supervision-work';
 app.get(base+'/overview',handle(req=>({data:runtime.overview(identifier.parse(req.params.id),principal(req))})));
 app.get(base+'/items/:itemId',handle(req=>({data:runtime.detail(identifier.parse(req.params.id),identifier.parse(req.params.itemId),principal(req))})));
 app.post(base+'/items',handle(req=>({data:runtime.create(identifier.parse(req.params.id),req.body,principal(req))})));
 app.post(base+'/items/:itemId/revisions',handle(req=>({data:runtime.revise(identifier.parse(req.params.id),identifier.parse(req.params.itemId),req.body,principal(req))})));
 const stream=(projectScoped:boolean)=>handle((req,reply)=>{
  const projectId=projectScoped?identifier.parse(req.params.id):undefined,p=principal(req),query=z.object({after:z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0)}).strict().parse(req.query),last=req.headers['last-event-id'];
  if(last!==undefined&&(typeof last!=='string'||!/^\d{1,16}$/.test(last)||!Number.isSafeInteger(Number(last))))throw new BusinessError('CURSOR_INVALID','事件位置无效');let cursor=Math.max(query.after,last===undefined?0:Number(last));if(projectId)runtime.events(projectId,p,cursor);else runtime.eventsOwned(p,cursor);
  reply.hijack();reply.raw.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'private, no-cache, no-transform','connection':'keep-alive','x-accel-buffering':'no'});let closed=false;let unsubscribe=()=>{};let timer:ReturnType<typeof setInterval>|undefined;
  const close=()=>{if(closed)return;closed=true;if(timer)clearInterval(timer);unsubscribe();streams.delete(close);if(!reply.raw.writableEnded)reply.raw.end();};
  const valid=()=>{if(closed)return false;try{if(projectId)runtime.assertAccess(projectId,p);else runtime.assertOwner(p);if(reply.raw.writableLength>1024*1024){close();return false;}return true;}catch{reply.raw.write('event: session-expired\ndata: {}\n\n');close();return false;}};
  const send=()=>{if(!valid())return;let more;do{const page=projectId?{items:runtime.events(projectId,p,cursor),cursor:0,hasMore:false}:runtime.eventsOwned(p,cursor);for(const event of page.items){if(!valid())return;reply.raw.write('id: '+event.sequence+'\nevent: supervision.changed\ndata: '+JSON.stringify(event)+'\n\n');cursor=event.sequence;}if(projectId)more=page.items.length===100;else{cursor=page.cursor;more=page.hasMore;}}while(more&&!closed);};
  unsubscribe=runtime.subscribe(event=>{if(!projectId||event.projectId===projectId)send();});streams.add(close);reply.raw.once('close',close);reply.raw.once('error',close);if(valid())reply.raw.write('event: ready\ndata: '+JSON.stringify({...(projectId?{projectId}:{}),latestSequence:projectId?runtime.latest(projectId,p.actorId):runtime.latestOwned(p)})+'\n\n');send();if(!closed){timer=setInterval(()=>{if(valid())reply.raw.write(': heartbeat\n\n');},15000);timer.unref();}
 });
 app.get(base+'/events',stream(true));
 app.get('/api/v1/supervision-work/events',stream(false));
 app.addHook('preClose',async()=>{for(const close of streams)close();});
}
