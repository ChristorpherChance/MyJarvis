import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {V1Repository} from '../v1/repository.js';
import {BusinessError} from '../v1/types.js';
import {MEMBER_COOKIE,RuntimeAccessError,type IdentityRuntime} from './identity.js';
import type {KnowledgeRuntime} from './knowledge-runtime.js';

const commandSchema=z.object({commandId:z.string().uuid(),expectedVersion:z.number().int().positive(),expectedSnapshotFingerprint:z.string().regex(/^[a-f0-9]{64}$/),expectedConfigurationRevision:z.number().int().min(0)}).strict();

/** Source previews are read-only; confirm-sync enters the existing durable sync queue. */
export function registerKnowledgeSourcePreviewRoutes(app:FastifyInstance,repository:V1Repository,identity:IdentityRuntime,runtime:KnowledgeRuntime):void {
 const authorize=(request:any)=>{
  const principal=identity.principal(request,!Object.hasOwn(request.cookies??{},MEMBER_COOKIE));
  if(!identity.isPrincipalCurrent(principal))throw new RuntimeAccessError('SESSION_EXPIRED','当前登录已失效，请重新登录',401);
  if(!principal.administrator||principal.profileId!=='me'||principal.actorId!=='server-admin')throw new RuntimeAccessError('FORBIDDEN','仅当前管理员本人可以预览或同步知识目录',403);
  identity.requireAdmin(request);
  return principal;
 };
 const respondError=(error:unknown,reply:any)=>{
  if(error instanceof BusinessError)return reply.code(error.status).send({error:{code:error.code,message:error.message}});
  if(error instanceof RuntimeAccessError)return reply.code(error.statusCode).send({error:{code:error.code,message:error.message}});
  if(error instanceof z.ZodError)return reply.code(400).send({error:{code:'INVALID_INPUT',message:'知识来源预览请求格式无效'}});
  return reply.code(500).send({error:{code:'KNOWLEDGE_PREVIEW_FAILED',message:'知识来源预览或确认未完成'}});
 };
 app.get<{Params:{id:string}}>('/api/v1/knowledge/sources/:id/preview',async(request:any,reply:any)=>{
  try{
   reply.header('Cache-Control','private, no-store');const principal=authorize(request),id=z.string().min(1).max(200).parse(request.params.id);
   const source=repository.read('sources',id,principal.actorId);
   if(!source||source.kind!=='source'||!['personal','private','family','company'].includes(source.scope))throw new BusinessError('NOT_FOUND','知识来源不存在或范围不匹配',404);const scope=source.scope;
   const preview=await runtime.previewDirectorySource(id,principal.actorId,scope,request.raw.signal??new AbortController().signal);
   if(!identity.isPrincipalCurrent(principal))throw new RuntimeAccessError('SESSION_EXPIRED','预览期间管理员身份已失效',401);
   const current=repository.read('sources',id,principal.actorId);
   if(!current||current.revision!==source.revision||!current.active||!current.authorized)throw new BusinessError('CONFLICT','预览期间来源配置或授权已改变，请重新预览',409);
   return {data:preview};
  }catch(error){return respondError(error,reply);}
 });
 app.post<{Params:{id:string}}>('/api/v1/knowledge/sources/:id/confirm-sync',async(request:any,reply:any)=>{
  try{
   reply.header('Cache-Control','private, no-store');const principal=authorize(request),id=z.string().min(1).max(200).parse(request.params.id),body=commandSchema.parse(request.body),source=repository.read('sources',id,principal.actorId);
   if(!source||source.kind!=='source')throw new BusinessError('NOT_FOUND','知识来源不存在',404);
   if(!source.active||!source.authorized)throw new RuntimeAccessError('FORBIDDEN','来源已停用或撤销授权',403);
   const configuration=runtime.configurationState(principal.actorId);if(configuration.configurationRevision!==body.expectedConfigurationRevision)throw new BusinessError('CONFLICT','知识目录安全策略已改变，请重新预览',409);const receipt=await runtime.confirmDirectorySourceSync({commandId:body.commandId,expectedVersion:body.expectedVersion,scope:source.scope,payload:{sourceId:id,expectedSnapshotFingerprint:body.expectedSnapshotFingerprint,expectedConfigurationRevision:body.expectedConfigurationRevision}},principal.actorId);
   return {data:receipt.data,version:receipt.version,requestId:receipt.requestId,events:receipt.events};
  }catch(error){return respondError(error,reply);}
 });
}
