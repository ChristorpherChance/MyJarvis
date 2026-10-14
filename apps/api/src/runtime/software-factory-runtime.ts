import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {RuntimeAccessError,runtimeHandler,type IdentityRuntime,type RuntimePrincipal} from './identity.js';
import {defineTool,type ToolDefinition} from '@earendil-works/pi-coding-agent';
import {Type} from 'typebox';

type Row=Record<string,unknown>;
type Credentials={username:string;password:string};
export interface SoftwareFactoryOptions {
 identity:Pick<IdentityRuntime,'requireAdmin'|'isPrincipalCurrent'>;
 machineId:string;
 sourceProjectId?:()=>string|undefined;
 /** Operator-owned deployment configuration. No request can select an upstream URL. */
 baseURL?:string;
 credentials?:()=>Credentials|undefined|Promise<Credentials|undefined>;
 fetchImpl?:typeof fetch;
 timeoutMs?:number;
 maxResponseBytes?:number;
}
// PostgreSQL also stores legacy seed UUIDs whose version/variant bits are zero.
// Accept only the complete GUID shape; no path, suffix or arbitrary identifier.
const projectGuidPattern='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const projectId=z.string().regex(new RegExp(projectGuidPattern));
const row=(value:unknown):Row=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const text=(value:unknown,max=300):string|null=>typeof value==='string'?value.slice(0,max):null;
const number=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&value.trim()&&Number.isFinite(Number(value))?Number(value):null;
const time=(value:unknown):string|null=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const array=(value:unknown):unknown[]=>Array.isArray(value)?value:Array.isArray(row(value).items)?row(value).items as unknown[]:[];
const stamp=()=>new Date().toISOString();
const fail=(code:string,status=502):never=>{throw new RuntimeAccessError(code,'软件工厂资料暂不可读取；请核对服务与服务端接入配置',status);};
const boundaries={sourceDevelopment:'jarvis-signed-cli-and-independent-validation',internalDevelopment:'mock-development-pipeline',internalStatus:'factory-reported-not-jarvis-verified',delivery:'factory-release-adapter-not-implemented',usage:'aggregate-only-not-billing-import',automaticAcceptance:false} as const;

/** A narrow read-only view of MSF business records. It never starts factory jobs or accepts Jarvis tasks. */
export class SoftwareFactoryRuntime {
 readonly identity:SoftwareFactoryOptions['identity'];
 private base?:URL;private fetcher:typeof fetch;private cookie?:string;private cookieUntil=0;
 private login?:Promise<void>;private authRetryAt=0;private active=0;private waiting:(()=>void)[]=[];
 private cache=new Map<string,{until:number;value:unknown}>();private inflight=new Map<string,Promise<unknown>>();
 private last:{connected:boolean;authenticated:boolean|null;observedAt:string|null;error:string|null;projectCount:number|null}={connected:false,authenticated:null,observedAt:null,error:null,projectCount:null};
 constructor(readonly options:SoftwareFactoryOptions){
  this.identity=options.identity;this.fetcher=options.fetchImpl??fetch;
  if(options.timeoutMs!==undefined&&(!Number.isInteger(options.timeoutMs)||options.timeoutMs<10||options.timeoutMs>15000)||options.maxResponseBytes!==undefined&&(!Number.isInteger(options.maxResponseBytes)||options.maxResponseBytes<128||options.maxResponseBytes>1024*1024))throw new RuntimeAccessError('INVALID_FACTORY_LIMIT','软件工厂读取超时和体积必须处于固定边界内',400);
  if(options.baseURL){
   const u=new URL(options.baseURL);
   if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||(u.pathname!=='/'&&u.pathname!==''))throw new RuntimeAccessError('INVALID_FACTORY_TARGET','软件工厂接入地址必须是固定 HTTP(S) 服务源地址',400);
   this.base=u;
  }
 }
 private authorize(p:RuntimePrincipal){if(p.actorId!=='server-admin'||p.profileId!=='me'||!this.identity.isPrincipalCurrent(p))throw new RuntimeAccessError('FORBIDDEN','仅当前管理者身份可查询软件工厂',403);}
 private pathAllowed(path:string){return path==='/api/projects'||/^\/api\/projects\/[0-9a-f-]{36}$/i.test(path)||/^\/api\/v1\/projects\/[0-9a-f-]{36}\/(?:dev\/(?:tasks|autopilot|build|selftest\/reports)|acceptance\/(?:batches|defects|decisions)|ai\/usage\?limit=1)$/i.test(path);}
 private async bounded(body:Response,limit:number):Promise<unknown>{
  const declared=Number(body.headers.get('content-length'));if(Number.isFinite(declared)&&declared>limit){await body.body?.cancel();fail('FACTORY_RESPONSE_TOO_LARGE');}
  if(!body.body)fail('FACTORY_INVALID_RESPONSE');const reader=body.body!.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();fail('FACTORY_RESPONSE_TOO_LARGE');}chunks.push(part.value);}}finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('FACTORY_INVALID_RESPONSE');}
 }
 private async slot<T>(work:()=>Promise<T>):Promise<T>{
  if(this.active>=2){if(this.waiting.length>=32)fail('FACTORY_BUSY',429);await new Promise<void>(resolve=>this.waiting.push(resolve));}else this.active++;
  try{return await work();}finally{const next=this.waiting.shift();if(next)next();else this.active--;}
 }
 private signal(external?:AbortSignal){return external?AbortSignal.any([external,AbortSignal.timeout(this.options.timeoutMs??8000)]):AbortSignal.timeout(this.options.timeoutMs??8000);}
 private async authenticate(signal?:AbortSignal){
  if(this.login)return this.login;if(Date.now()<this.authRetryAt)fail('FACTORY_AUTH_REQUIRED',503);
  this.login=(async()=>{
   const credentials=await this.options.credentials?.();if(!credentials||!credentials.username||!credentials.password)fail('FACTORY_AUTH_REQUIRED',503);
   const response=await this.fetcher(new URL('/api/auth/login',this.base),{method:'POST',redirect:'error',signal:this.signal(signal),headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify(credentials)});
   if(response.status!==200){await response.body?.cancel();fail('FACTORY_AUTH_REQUIRED',503);}
   const data=row(await this.bounded(response,65536)),headers=response.headers.get('set-cookie')??'',match=/(?:^|,\s*)msf_auth=([A-Za-z0-9._-]{1,1000})(?:;|$)/.exec(headers);
   if(data.ok!==true||!match)return fail('FACTORY_AUTH_REQUIRED',503);
   this.cookie='msf_auth='+match![1];this.cookieUntil=Date.now()+6*24*3600000;
  })().catch(error=>{this.cookie=undefined;this.cookieUntil=0;this.authRetryAt=Date.now()+60000;throw error;}).finally(()=>{this.login=undefined;});
  return this.login;
 }
 private async read(path:string,signal?:AbortSignal):Promise<unknown>{
  if(!this.base)fail('FACTORY_NOT_CONFIGURED',503);if(!this.pathAllowed(path))fail('FACTORY_PATH_FORBIDDEN',403);
  signal?.throwIfAborted();return this.slot(async()=>{
   if(this.cookieUntil<Date.now())this.cookie=undefined;
   const request=()=>this.fetcher(new URL(path,this.base),{method:'GET',redirect:'error',signal:this.signal(signal),headers:{accept:'application/json',...(this.cookie?{cookie:this.cookie}:{})}});
   let response=await request();if(response.status===401){await response.body?.cancel();this.cookie=undefined;await this.authenticate(signal);response=await request();}
   if(response.status!==200){await response.body?.cancel();fail(response.status===404?'FACTORY_NOT_FOUND':response.status===401?'FACTORY_AUTH_REQUIRED':'FACTORY_REQUEST_FAILED',response.status===404?404:502);}
   return this.bounded(response,this.options.maxResponseBytes??1024*1024);
  }).catch(error=>{if(error instanceof RuntimeAccessError)throw error;fail('FACTORY_REQUEST_FAILED');});
 }
 private async memo<T>(key:string,work:()=>Promise<T>):Promise<T>{
  const saved=this.cache.get(key);if(saved&&saved.until>Date.now())return structuredClone(saved.value) as T;
  const running=this.inflight.get(key);if(running)return structuredClone(await running) as T;
  const next=work().then(value=>{if(this.cache.size>=100)this.cache.delete(this.cache.keys().next().value!);this.cache.set(key,{until:Date.now()+5000,value:structuredClone(value)});return value;}).finally(()=>this.inflight.delete(key));
  this.inflight.set(key,next);return next;
 }
 private projectSummary(value:unknown){const r=row(value);return {id:text(r.id,200),name:text(r.name),description:text(r.description,2000),status:text(r.status,100),isDemo:r.is_demo===true,createdAt:time(r.created_at)};}
 async state(p:RuntimePrincipal,signal?:AbortSignal){
  this.authorize(p);if(this.base)try{const items=await this.projectList(signal);this.last={connected:true,authenticated:items.authenticated,observedAt:items.observedAt,error:null,projectCount:items.total};}catch(error){this.last={connected:false,authenticated:null,observedAt:stamp(),error:error instanceof RuntimeAccessError?error.code:'FACTORY_REQUEST_FAILED',projectCount:null};}
  signal?.throwIfAborted();this.authorize(p);return {configured:!!this.base,machineId:this.options.machineId,sourceProjectId:this.options.sourceProjectId?.()??null,baseURL:this.base?.origin??null,...this.last,boundaries,capabilities:{readInternalProjects:true,readBusinessProgress:true,dispatchSourceTasks:false,automaticAcceptance:false}};
 }
 private async projectList(signal?:AbortSignal){return this.memo('projects',async()=>{
  const raw=await this.read('/api/projects',signal);if(!Array.isArray(raw))return fail('FACTORY_INVALID_RESPONSE');
  const values=raw as unknown[],items=values.slice(0,100).map(r=>this.projectSummary(r));if(items.some(r=>!r.id||!projectId.safeParse(r.id).success))fail('FACTORY_INVALID_RESPONSE');
  return {items,total:values.length,truncated:values.length>100,observedAt:stamp(),authenticated:!!this.cookie,source:'software-factory-api' as const,verification:'factory-reported' as const};
 });}
 async projects(p:RuntimePrincipal,signal?:AbortSignal){this.authorize(p);const data=await this.projectList(signal);this.authorize(p);return data;}
 async project(p:RuntimePrincipal,id:string,signal?:AbortSignal){
  this.authorize(p);projectId.parse(id);const readSignal=this.signal(signal),data=await this.memo('project:'+id,async()=>{
   const project=this.projectSummary(await this.read('/api/projects/'+id,readSignal));if(project.id!==id)fail('FACTORY_PROJECT_MISMATCH');
   const paths={tasks:'dev/tasks',autopilot:'dev/autopilot',build:'dev/build',selftestReports:'dev/selftest/reports',acceptanceBatches:'acceptance/batches',defects:'acceptance/defects',decisions:'acceptance/decisions',usage:'ai/usage?limit=1'} as const;
   const values:Record<string,unknown>={},partialErrors:{section:string;code:string}[]=[];
   await Promise.all(Object.entries(paths).map(async([key,path])=>{try{
    const value=await this.read(`/api/v1/projects/${id}/${path}`,readSignal),r=row(value);
    if(['tasks','selftestReports','acceptanceBatches','defects','decisions'].includes(key)&&!Array.isArray(value)&&!Array.isArray(r.items)||key==='autopilot'&&!Object.hasOwn(r,'run')||key==='build'&&!Object.hasOwn(r,'build')||key==='usage'&&(!Object.hasOwn(r,'totals')||Object.keys(row(r.totals)).length===0))fail('FACTORY_INVALID_RESPONSE');
    values[key]=value;
   }catch(error){partialErrors.push({section:key,code:error instanceof RuntimeAccessError?error.code:'FACTORY_REQUEST_FAILED'});}}));
   readSignal.throwIfAborted();const taskRows=array(values.tasks),run=row(row(values.autopilot).run),build=row(row(values.build).build);
   const totals=row(row(values.usage).totals);
   return {project,observedAt:stamp(),source:'software-factory-api' as const,verification:'factory-reported' as const,boundaries,partialErrors,sectionCounts:{tasks:taskRows.length,selftestReports:array(values.selftestReports).length,acceptanceBatches:array(values.acceptanceBatches).length,defects:array(values.defects).length,decisions:array(values.decisions).length},
    tasks:taskRows.slice(0,200).map(value=>{const r=row(value);return {id:text(r.id,200),code:text(r.code,100),title:text(r.title),kind:text(r.kind,100),status:text(r.col??r.status,100),progress:number(r.prog),updatedAt:time(r.updated_at)};}),tasksTruncated:taskRows.length>200,
    autopilot:run.runId?{runId:text(run.runId,200),status:text(run.status,100),phase:text(run.phase,100),blockerCode:text(row(run.blocker).code,200)}:null,
    build:build.buildId?{buildId:text(build.buildId,200),status:text(build.status,100),fingerprint:text(build.buildFingerprint,200),createdAt:time(build.createdAt)}:null,
    selftestReports:array(values.selftestReports).slice(0,100).map(value=>{const r=row(value);return {id:text(r.id,200),code:text(r.code,100),status:text(r.status,100),fingerprint:text(r.report_fingerprint,200),createdAt:time(r.created_at)};}),
    acceptanceBatches:array(values.acceptanceBatches).slice(0,100).map(value=>{const r=row(value);return {id:text(r.id??r.batchId,200),code:text(r.code??r.batchId,100),status:text(r.status,100),createdAt:time(r.createdAt??r.created_at??r.receivedAt)};}),
    defects:array(values.defects).slice(0,100).map(value=>{const r=row(value);return {id:text(r.id??r.defectId,200),code:text(r.code??r.defectId,100),title:text(r.title),status:text(r.status,100),severity:text(r.severity,100)};}),
    decisions:array(values.decisions).slice(0,100).map(value=>{const r=row(value);return {id:text(r.id??r.decisionId,200),type:text(r.type??r.decision_type,100),status:text(r.status??r.verdict,100),createdAt:time(r.createdAt??r.created_at??r.at)};}),
    usage:values.usage===undefined?null:{calls:number(totals.calls),inputTokens:number(totals.tokens_in),outputTokens:number(totals.tokens_out),reportedCost:number(totals.cost),costCurrency:'not-declared-by-factory' as const,verification:'aggregate-reported-not-ledger-import' as const}
   };
  });this.authorize(p);return data;
 }
}
export function registerSoftwareFactoryRoutes(app:FastifyInstance,runtime:SoftwareFactoryRuntime){
 const base='/api/runtime/software-factory',empty=z.object({}).strict();
 const handler=(work:(p:RuntimePrincipal,req:any,signal:AbortSignal)=>Promise<unknown>)=>runtimeHandler(async(req,reply)=>{
  empty.parse(req.query);const p=runtime.identity.requireAdmin(req),controller=new AbortController(),close=()=>{if(!reply.raw.writableEnded)controller.abort();};reply.raw.once('close',close);
  reply.header('Cache-Control','no-store');try{return await work(p,req,controller.signal);}finally{reply.raw.removeListener('close',close);}
 });
 app.get(base,handler((p,_req,signal)=>runtime.state(p,signal)));
 app.get(base+'/projects',handler((p,_req,signal)=>runtime.projects(p,signal)));
 app.get(base+'/projects/:id',handler((p,req,signal)=>runtime.project(p,projectId.parse(req.params.id),signal)));
}
export function createSoftwareFactoryTools(runtime:SoftwareFactoryRuntime,p:RuntimePrincipal):ToolDefinition[]{return [defineTool({
 name:'jarvis_software_factory',label:'软件工厂资料',description:'只读查询软件工厂服务连接、关联的工厂源码项目，以及工厂内部业务项目的状态与汇总用量。内部开发、构建、自测仍含模拟流程，只是工厂报告，不能当作源码测试通过、真实部署或交付验收；源码研发由贾维斯受控任务另行监督。不读取聊天、密钥，不启动、修改或验收任务。',
 parameters:Type.Object({view:Type.Union([Type.Literal('state'),Type.Literal('projects'),Type.Literal('project')]),projectId:Type.Optional(Type.String({pattern:projectGuidPattern}))},{additionalProperties:false}),annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
 execute:async(_id,input,signal)=>{
  signal?.throwIfAborted();const data=input.view==='state'?await runtime.state(p,signal):input.view==='projects'?await runtime.projects(p,signal):await runtime.project(p,projectId.parse(input.projectId),signal);
  return {content:[{type:'text',text:JSON.stringify(data)}],details:{readOnly:true,credentialsExcluded:true,automaticAcceptance:false,source:'software-factory-api',untrustedBusinessText:true}};
 }
})];}
