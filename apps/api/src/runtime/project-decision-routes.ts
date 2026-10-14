import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {BusinessError} from '../v1/types.js';
import {RuntimeAccessError,type IdentityRuntime} from './identity.js';
import type {ProjectDecisionRuntime} from './project-decision-runtime.js';

export function registerProjectDecisionRoutes(app:FastifyInstance,runtime:ProjectDecisionRuntime,identity:IdentityRuntime){
 const handle=(fn:(req:any)=>unknown)=>async(req:any,reply:any)=>{
  try{
   const principal=identity.principal(req);
   if(!principal.administrator||principal.profileId!=='me')throw new RuntimeAccessError('ADMIN_REQUIRED','请先以管理员登录',403);
   reply.header('Cache-Control','private, no-store');return {data:await fn(req)};
  }catch(error){
   if(error instanceof BusinessError)return reply.code(error.status).send({error:{code:error.code,message:error.message}});
   if(error instanceof RuntimeAccessError)return reply.code(error.statusCode).send({error:{code:error.code,message:error.message}});
   if(error instanceof z.ZodError)return reply.code(400).send({error:{code:'INVALID_INPUT',message:'决策摘要或版本格式不正确'}});
   throw error;
  }
 };
 const base='/api/v1/projects/:id/decisions';
 app.get(base,handle(req=>runtime.list(req.params.id,z.object({offset:z.coerce.number().int().nonnegative().default(0),limit:z.coerce.number().int().min(1).max(100).default(25)}).strict().parse(req.query))));
 app.get(base+'/:decisionId',handle(req=>runtime.get(req.params.id,req.params.decisionId)));
 app.post(base,handle(req=>runtime.record(req.params.id,req.body)));
 app.post(base+'/recommendations',handle(req=>runtime.recommendation(req.params.id,req.body)));
 app.post(base+'/:decisionId/select',handle(req=>runtime.select(req.params.id,req.params.decisionId,req.body)));
 app.post(base+'/:decisionId/implementation',handle(req=>runtime.implementation(req.params.id,req.params.decisionId,req.body)));
 app.post(base+'/:decisionId/change',handle(req=>runtime.change(req.params.id,req.params.decisionId,req.body)));
}
