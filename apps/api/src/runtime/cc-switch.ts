import {connect} from 'node:net';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import type {V1Repository} from '../v1/repository.js';
import {MEMBER_COOKIE,RuntimeAccessError,type IdentityRuntime,type RuntimePrincipal} from './identity.js';

const prefix='/api/runtime/cc-switch';
const id=z.string().uuid();
const revision=z.string().regex(/^[a-f0-9]{64}$/);
const text=(max:number)=>z.string().trim().min(1).max(max).refine(v=>!/[\u0000-\u001f\u007f]/.test(v));
const model=text(300);
const baseUrl=text(2048).refine(value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash;}catch{return false;}});
const models=z.object({opus:model,sonnet:model,haiku:model,fable:model,subagent:model}).strict();
const apiKey=z.string().max(8192).refine(v=>!/[\u0000-\u001f\u007f]/.test(v));
const provider=z.object({name:text(120),baseUrl,model,models,authType:z.enum(['auth-token','api-key']),apiKey:apiKey.optional()}).strict();
const createBody=z.object({commandId:id,provider:provider.refine(p=>!!p.apiKey?.trim())}).strict();
const updateBody=z.object({expectedRevision:revision,provider}).strict();
const versionBody=z.object({expectedRevision:revision}).strict();
const host=z.enum(['101','112','116']);
const machineSchema=z.object({id,name:text(200),address:text(200),host});
const machineListSchema=z.object({machines:z.array(machineSchema).max(3),configured:z.boolean()});
const publicProvider=z.object({id,name:text(120),baseUrl,model,models:z.object({opus:z.string().max(300),sonnet:z.string().max(300),haiku:z.string().max(300),fable:z.string().max(300),subagent:z.string().max(300)}),authType:z.enum(['auth-token','api-key']),credentialConfigured:z.boolean(),isCurrent:z.boolean(),revision});
const snapshotSchema=z.object({machineId:id,host,application:z.literal('claude'),observedAt:z.string().datetime({offset:true}),currentProviderId:id.nullable(),providers:z.array(publicProvider).max(500)});
export type CcSwitchProviderInput=z.infer<typeof provider>;
export type CcSwitchRequest={action:'machines'|'list'|'create'|'update'|'switch'|'delete';machineId?:string;providerId?:string;expectedRevision?:string;commandId?:string;provider?:CcSwitchProviderInput};
/** Transport returns only the worker protocol envelope, never a raw configuration. */
export type CcSwitchTransport=(request:CcSwitchRequest)=>Promise<unknown>;
export interface CcSwitchOptions {transport?:CcSwitchTransport;socketPath?:string}
type WorkerSuccess={ok:true;value:unknown};
const messages:Record<string,{status:number;message:string}>={
 CONFLICT:{status:409,message:'配置已在其他终端或页面更新，请刷新后重试'},
 ACTIVE_PROVIDER:{status:409,message:'请先切换到其他配置，再删除当前使用的配置'},
 NOT_FOUND:{status:404,message:'机器或模型配置不存在，请刷新列表'},
 INVALID_INPUT:{status:400,message:'请检查模型、地址和密钥的填写格式'},
 UNAVAILABLE:{status:503,message:'机器暂时无法连接，请稍后重试'},
 NOT_CONFIGURED:{status:503,message:'模型管理连接尚未配置'},
 UNKNOWN_RESULT:{status:503,message:'操作结果尚未确认，请先刷新核实，避免重复提交'},
 FORBIDDEN:{status:403,message:'当前机器不允许管理模型配置'},
};

/** One bounded newline frame over a private Unix socket. No secrets enter argv or logs. */
export function createCcSwitchSocketTransport(socketPath:string):CcSwitchTransport {
 return request=>new Promise((resolve,reject)=>{
  const data=JSON.stringify(request)+'\n';
  if(Buffer.byteLength(data)>64*1024){reject(new RuntimeAccessError('INVALID_INPUT',messages.INVALID_INPUT.message,400));return;}
  const socket=connect({path:socketPath});let settled=false,size=0;const chunks:Buffer[]=[];
  const finish=(error?:unknown,value?:unknown)=>{if(settled)return;settled=true;socket.destroy();if(error)reject(error);else resolve(value);};
  const unavailable=()=>new RuntimeAccessError('UNAVAILABLE',messages.UNAVAILABLE.message,503);
  socket.setTimeout(45_000,()=>finish(unavailable()));
  socket.on('error',()=>finish(unavailable()));
  socket.on('connect',()=>socket.write(data));
  socket.on('data',chunk=>{
   size+=chunk.length;if(size>1024*1024){finish(unavailable());return;}
   chunks.push(Buffer.from(chunk));const bytes=Buffer.concat(chunks),end=bytes.indexOf(10);
   if(end<0)return;
   try{finish(undefined,JSON.parse(bytes.subarray(0,end).toString('utf8')));}catch{finish(unavailable());}
  });
  socket.on('end',()=>{if(!settled)finish(unavailable());});
 });
}

export function registerCcSwitchRoutes(app:FastifyInstance,identity:IdentityRuntime,repository:Pick<V1Repository,'read'>,options:CcSwitchOptions={}){
 const transport=options.transport??createCcSwitchSocketTransport(options.socketPath??process.env.JARVIS_CC_SWITCH_SOCKET??'/run/jarvis-cc-switch/control.sock');
 const current=(p:RuntimePrincipal)=>{
  if(!identity.isPrincipalCurrent(p))throw new RuntimeAccessError('SESSION_EXPIRED','当前登录已失效，请重新登录',401);
  if(!p.administrator||p.profileId!=='me'||p.actorId!=='server-admin')throw new RuntimeAccessError('ADMIN_REQUIRED','模型管理仅管理员本人可用',403);
 };
 const principal=(req:FastifyRequest)=>{
  // A stale member cookie must not silently restore the administrator identity.
  const p=identity.principal(req,!Object.hasOwn(req.cookies??{},MEMBER_COOKIE));current(p);return p;
 };
 const call=async(request:CcSwitchRequest)=>{
  let response:unknown;
  try{response=await transport(request);}catch(error){
   if(error instanceof RuntimeAccessError&&Object.hasOwn(messages,error.code)){const failure=messages[error.code];throw new RuntimeAccessError(error.code,failure.message,failure.status);}
   throw new RuntimeAccessError('UNAVAILABLE',messages.UNAVAILABLE.message,503);
  }
  if(!response||typeof response!=='object')throw new RuntimeAccessError('UNAVAILABLE',messages.UNAVAILABLE.message,503);
  const result=response as WorkerSuccess|{ok?:unknown;code?:unknown};
  if(result.ok!==true){
   const code='code' in result&&typeof result.code==='string'&&Object.hasOwn(messages,result.code)?result.code:'UNAVAILABLE',failure=messages[code];
   throw new RuntimeAccessError(code,failure.message,failure.status);
  }
  return (result as WorkerSuccess).value;
 };
 const permitted=(p:RuntimePrincipal,m:z.infer<typeof machineSchema>)=>{
  const record=repository.read('machines',m.id,p.actorId);
  return !!record&&record.kind==='machine'&&record.ownerId===p.actorId&&!record.readOnly&&!record.readonly&&!record.company&&record.scope!=='company'&&record.address===m.address&&m.address==='192.168.10.'+m.host;
 };
 const machines=async(p:RuntimePrincipal)=>{
  const parsed=machineListSchema.safeParse(await call({action:'machines'}));
  if(!parsed.success)throw new RuntimeAccessError('UNAVAILABLE',messages.UNAVAILABLE.message,503);
  current(p);const seen=new Set<string>(),hosts=new Set<string>();
  const allowed=parsed.data.machines.filter(m=>{
   if(seen.has(m.id)||hosts.has(m.host))throw new RuntimeAccessError('UNAVAILABLE',messages.UNAVAILABLE.message,503);
   seen.add(m.id);hosts.add(m.host);return permitted(p,m);
  });
  return {machines:allowed,configured:parsed.data.configured};
 };
 const machine=async(p:RuntimePrincipal,machineId:string)=>{
  const result=await machines(p),m=result.machines.find(entry=>entry.id===machineId);
  if(!m)throw new RuntimeAccessError('NOT_FOUND',messages.NOT_FOUND.message,404);
  return m;
 };
 const snapshot=(value:unknown,m:z.infer<typeof machineSchema>)=>{
  const parsed=snapshotSchema.safeParse(value);
  if(!parsed.success||parsed.data.machineId!==m.id||parsed.data.host!==m.host)throw new RuntimeAccessError('UNAVAILABLE',messages.UNAVAILABLE.message,503);
  const ids=new Set(parsed.data.providers.map(entry=>entry.id));
  if(ids.size!==parsed.data.providers.length||parsed.data.currentProviderId!==null&&!ids.has(parsed.data.currentProviderId)||parsed.data.providers.some(entry=>entry.isCurrent!==(entry.id===parsed.data.currentProviderId)))throw new RuntimeAccessError('UNAVAILABLE',messages.UNAVAILABLE.message,503);
  return parsed.data;
 };
 const handle=(fn:(req:any,p:RuntimePrincipal)=>unknown)=>async(req:any,reply:any)=>{
  reply.header('Cache-Control','private, no-store');
  try{return await fn(req,principal(req));}catch(error){
   if(error instanceof RuntimeAccessError)return reply.code(error.statusCode).send({error:{code:error.code,message:error.message}});
   if(error instanceof z.ZodError)return reply.code(400).send({error:{code:'INVALID_INPUT',message:messages.INVALID_INPUT.message}});
   return reply.code(503).send({error:{code:'UNAVAILABLE',message:messages.UNAVAILABLE.message}});
  }
 };
 const mutation=async(req:any,p:RuntimePrincipal,action:'create'|'update'|'switch'|'delete')=>{
  const machineId=id.parse(req.params.machineId),providerId=action==='create'?undefined:id.parse(req.params.providerId);
  const body=action==='create'?createBody.parse(req.body):action==='update'?updateBody.parse(req.body):versionBody.parse(req.body);
  const m=await machine(p,machineId);current(p);
  const request:CcSwitchRequest={action,machineId,...(providerId?{providerId}:{}),...body};
  if(request.provider&&!request.provider.apiKey?.trim())delete request.provider.apiKey;
  const result=snapshot(await call(request),m);
  // Audit identifiers only. Neither request bodies nor provider records are serialized.
  identity.store.audit('cc-switch.'+action,providerId??request.commandId!,{machineId});
  current(p);
  if(!permitted(p,m))throw new RuntimeAccessError('FORBIDDEN',messages.FORBIDDEN.message,403);
  return result;
 };
 app.get(prefix+'/machines',handle((_req,p)=>machines(p)));
 app.get(prefix+'/machines/:machineId/providers',handle(async(req,p)=>{
  const m=await machine(p,id.parse(req.params.machineId)),result=snapshot(await call({action:'list',machineId:m.id}),m);
  current(p);if(!permitted(p,m))throw new RuntimeAccessError('FORBIDDEN',messages.FORBIDDEN.message,403);return result;
 }));
 app.post(prefix+'/machines/:machineId/providers',{bodyLimit:64*1024},handle((req,p)=>mutation(req,p,'create')));
 app.patch(prefix+'/machines/:machineId/providers/:providerId',{bodyLimit:64*1024},handle((req,p)=>mutation(req,p,'update')));
 app.post(prefix+'/machines/:machineId/providers/:providerId/switch',{bodyLimit:64*1024},handle((req,p)=>mutation(req,p,'switch')));
 app.delete(prefix+'/machines/:machineId/providers/:providerId',{bodyLimit:64*1024},handle((req,p)=>mutation(req,p,'delete')));
}

