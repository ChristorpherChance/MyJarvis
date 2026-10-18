import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {captureHandlers} from '../v1/capture-domains.js';
import type {V1Repository} from '../v1/repository.js';
import {BusinessError,type Scope} from '../v1/types.js';
import {MEMBER_COOKIE,RuntimeAccessError,type IdentityRuntime} from './identity.js';

const command=z.enum(['counterexample','revoke-verification','supersede']);
const payload=z.object({
 commandId:z.string().uuid(),experienceId:z.string().min(1).max(200),expectedVersion:z.number().int().positive(),scope:z.enum(['personal','private','family','company']),
 reason:z.string().trim().min(1).max(4000),evidence:z.string().trim().min(1).max(20000),
 replacementId:z.string().min(1).max(200).optional(),source:z.string().max(4000).optional(),
}).strict();
export function registerExperienceSupervisorRoutes(app:FastifyInstance,repository:V1Repository,identity:IdentityRuntime){
 const handler=captureHandlers.find(h=>h.domain==='experiences')!;
 app.post('/api/v1/experiences/:id/supervisor/:command',async(req:any,reply:any)=>{
  try{
   reply.header('Cache-Control','private, no-store');const principal=identity.principal(req,!Object.hasOwn(req.cookies??{},MEMBER_COOKIE));
   if(!identity.isPrincipalCurrent(principal)||!principal.administrator||principal.profileId!=='me')throw new RuntimeAccessError('FORBIDDEN','仅当前管理员本人可处理主管经验',403);
   const id=z.string().min(1).max(200).parse(req.params.id),op=command.parse(req.params.command),body=payload.parse(req.body);
   if(body.experienceId!==id)throw new BusinessError('VALIDATION','经验记录编号不一致',400);
   if(body.scope==='company')throw new RuntimeAccessError('FORBIDDEN','主管学习记录不能写入公司范围',403);
   if(op==='supersede'&&!body.replacementId||op!=='supersede'&&body.replacementId)throw new BusinessError('VALIDATION','替代记录编号与命令不匹配',400);
   const receipt=repository.execute(handler,op,{commandId:body.commandId,expectedVersion:body.expectedVersion,scope:body.scope as Scope,payload:{...body}},principal.actorId,()=>undefined);
   return {data:receipt.data,version:receipt.version,requestId:receipt.requestId,events:receipt.events};
  }catch(e){
   if(e instanceof BusinessError)return reply.code(e.status).send({error:{code:e.code,message:e.message}});
   if(e instanceof RuntimeAccessError)return reply.code(e.statusCode).send({error:{code:e.code,message:e.message}});
   if(e instanceof z.ZodError)return reply.code(400).send({error:{code:'INVALID_INPUT',message:'主管经验请求格式不正确'}});
   throw e;
  }
 });
}
