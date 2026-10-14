import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {BusinessError} from '../v1/types.js';
import {RuntimeAccessError,type IdentityRuntime} from './identity.js';
import type {ProjectSupervisionPlanRuntime} from './project-supervision-plan-runtime.js';

/** Planning is scoped to a project; reading it never starts execution or revives older plans. */
export function registerProjectSupervisionPlanRoutes(app:FastifyInstance,runtime:ProjectSupervisionPlanRuntime,identity:IdentityRuntime){
 const handle=(fn:(req:any,principal:ReturnType<IdentityRuntime['principal']>)=>unknown)=>async(req:any,reply:any)=>{
  try{const principal=identity.principal(req);reply.header('Cache-Control','private, no-store');return {data:await fn(req,principal)};}
  catch(error){
   if(error instanceof BusinessError)return reply.code(error.status).send({error:{code:error.code,message:error.message}});
   if(error instanceof RuntimeAccessError)return reply.code(error.statusCode).send({error:{code:error.code,message:error.message}});
   if(error instanceof z.ZodError)return reply.code(400).send({error:{code:'INVALID_INPUT',message:'监管计划或版本格式不正确'}});
   throw error;
  }
 };
 const base='/api/v1/projects/:id/supervision-plans';
 app.get(base,handle((req,p)=>runtime.list(req.params.id,p.actorId,z.object({offset:z.coerce.number().int().nonnegative().default(0),limit:z.coerce.number().int().min(1).max(100).default(25)}).strict().parse(req.query))));
 app.get(base+'/current',handle((req,p)=>runtime.get(req.params.id,p.actorId)));
 app.get(base+'/:planId',handle((req,p)=>runtime.get(req.params.id,p.actorId,req.params.planId)));
 app.post(base,handle((req,p)=>runtime.create(req.params.id,req.body,p)));
 app.post(base+'/:planId/revisions',handle((req,p)=>runtime.revise(req.params.id,req.params.planId,req.body,p)));
}
