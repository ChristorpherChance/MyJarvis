import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {BusinessError} from '../v1/types.js';
import {MEMBER_COOKIE,RuntimeAccessError,type IdentityRuntime} from './identity.js';
import type {ProjectSupervisorRuntime} from './project-supervisor-runtime.js';
export function registerProjectSupervisorRoutes(app:FastifyInstance,runtime:ProjectSupervisorRuntime,identity:IdentityRuntime){
 const handle=(fn:(req:any)=>unknown)=>async(req:any,reply:any)=>{try{reply.header('Cache-Control','private, no-store');return {data:await fn(req)};}catch(e){if(e instanceof BusinessError)return reply.code(e.status).send({error:{code:e.code,message:e.message}});if(e instanceof RuntimeAccessError)return reply.code(e.statusCode).send({error:{code:e.code,message:e.message}});if(e instanceof z.ZodError)return reply.code(400).send({error:{code:'INVALID_INPUT',message:'主管目标或指令格式不正确'}});throw e;}};
 const principal=(req:any)=>identity.principal(req,!Object.hasOwn(req.cookies??{},MEMBER_COOKIE));
 const id=(req:any)=>z.string().min(1).max(200).parse(req.params.id),base='/api/v1/projects/:id/supervisor';
 app.get(base,handle(req=>runtime.view(id(req),principal(req))));
 app.post(base,handle(req=>runtime.create(id(req),req.body,principal(req))));
 app.post(base+'/commands',handle(req=>runtime.command(id(req),req.body,principal(req))));
 app.post(base+'/corrections',handle(req=>runtime.correct(id(req),req.body,principal(req))));
 const streams=new Set<()=>void>();
 app.get(base+'/events',async(req:any,reply:any)=>{const p=principal(req),projectId=id(req);runtime.view(projectId,p);reply.hijack();reply.raw.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'private, no-cache, no-transform','connection':'keep-alive'});let last=-1,closed=false;const close=()=>{if(closed)return;closed=true;clearInterval(timer);streams.delete(close);if(!reply.raw.writableEnded)reply.raw.end();};const send=()=>{try{const snapshot=runtime.view(projectId,p),revision=snapshot.session?.revision??0;if(reply.raw.writableLength>65536){close();return;}if(last!==revision){last=revision;reply.raw.write('id: '+revision+'\nevent: supervisor.changed\ndata: '+JSON.stringify({projectId,revision})+'\n\n');}}catch{reply.raw.write('event: session-expired\ndata: {}\n\n');close();}};const timer=setInterval(send,1000);timer.unref();streams.add(close);reply.raw.once('close',close);send();});
 app.addHook('preClose',async()=>{for(const close of streams)close();});
}
