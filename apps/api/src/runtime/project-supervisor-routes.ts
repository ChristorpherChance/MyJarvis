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
}
