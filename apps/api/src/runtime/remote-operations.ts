import {createHash,createHmac,randomUUID} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync,renameSync,chmodSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {defineTool,type ToolDefinition} from '@earendil-works/pi-coding-agent';
import {Type} from 'typebox';
import {IdentityRuntime,RuntimeAccessError,type RuntimePrincipal} from './identity.js';
import type {V1Repository} from '../v1/repository.js';
import type {ApplicationRuntime} from './application-runtime.js';

export const remoteAction=z.enum(['diagnose','start','stop','restart','reboot','poweroff']);
export const remoteTarget=z.object({kind:z.enum(['machine','service','application']),id:z.string().min(1).max(200)}).strict();
const prepareSchema=z.object({requestId:z.string().uuid(),target:remoteTarget,action:remoteAction}).strict();
export type RemoteAction=z.infer<typeof remoteAction>;
type Target=z.infer<typeof remoteTarget>;
type Item=Record<string,any>;
type NodePolicy={nodeId:string;machineId:string;name:string;address:string;services:{id:string;unit:string;name:string;controllable:boolean}[]};
type Configuration={version:1;nodes:NodePolicy[]};
const fingerprint=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)??'null').digest('hex');
const labels:Record<RemoteAction,string>={diagnose:'诊断',start:'启动项目',stop:'停止项目',restart:'重启项目',reboot:'重启服务器',poweroff:'关闭服务器'};
function fail(ok:unknown,message:string,status=409):asserts ok{if(!ok)throw new RuntimeAccessError(status===403?'FORBIDDEN':status===404?'NOT_FOUND':'REMOTE_OPERATION_CONFLICT',message,status);}

/** Durable approved outbox. SSH credentials and execution remain in a separate OS service. */
export class RemoteOperationsRuntime {
 private timer?:ReturnType<typeof setInterval>;private key:Buffer;
 readonly queue:string;readonly configPath:string;
 constructor(readonly identity:IdentityRuntime,readonly repository:V1Repository,readonly applications:ApplicationRuntime,dir:string,readonly stopped:()=>boolean,options:{queue?:string;configPath?:string}={}){
  this.queue=options.queue??process.env.JARVIS_OPS_QUEUE??join(dir,'remote-ops-queue');this.configPath=options.configPath??process.env.JARVIS_OPS_CONFIG??join(dir,'remote-ops-policy.json');
  this.key=createHmac('sha256',readFileSync(join(dir,'runtime','voice-master.key'))).update('jarvis-control-cookie-v1').digest();
  if(!existsSync(this.queue))mkdirSync(this.queue,{recursive:true,mode:0o700});
  for(const name of ['requests','results'])if(!existsSync(join(this.queue,name)))mkdirSync(join(this.queue,name),{mode:0o750});
  identity.db.exec(`CREATE TABLE IF NOT EXISTS runtime_remote_operations(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,authorization_hash TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,status TEXT NOT NULL,revision INTEGER NOT NULL,json TEXT NOT NULL,UNIQUE(actor_id,request_id));`);
 }
 private admin(p:RuntimePrincipal){fail(p.administrator&&p.profileId==='me'&&this.identity.isPrincipalCurrent(p),'仅已认证管理员可操作服务器',403);}
 private configuration():Configuration{try{const raw=JSON.parse(readFileSync(this.configPath,'utf8'));fail(raw.version===1&&Array.isArray(raw.nodes),'运维配置无效',503);return raw;}catch(e){if(e instanceof RuntimeAccessError)throw e;throw new RuntimeAccessError('OPS_NOT_CONFIGURED','远程运维节点尚未配置',503);}}
 capabilities(p:RuntimePrincipal){this.admin(p);let nodes:NodePolicy[]=[];try{nodes=this.configuration().nodes;}catch{}let worker:Item|null=null;try{worker=JSON.parse(readFileSync(join(this.queue,'results','_status.json'),'utf8'));}catch{}return {configured:nodes.length>0,controllerOnline:!!worker&&Date.now()-Date.parse(worker.at)<30000,nodes,actions:Object.keys(labels),machineStartSupported:false};}
 private binding(p:RuntimePrincipal,target:Target,action:RemoteAction){
  const config=this.configuration();let app:Item|undefined,machine:Item|undefined,services:Item[]=[];
  if(target.kind==='application'){app=this.applications.read(p.actorId,target.id);fail(app.status!=='archived','项目已归档');machine=this.repository.read('machines',app.machineId,p.actorId);services=app.serviceIds.map((id:string)=>this.repository.read('services',id,p.actorId)).filter(Boolean);}
  else if(target.kind==='service'){const s=this.repository.read('services',target.id,p.actorId);fail(s,'服务不存在',404);services=[s];machine=this.repository.read('machines',s.machineId,p.actorId);}
  else machine=this.repository.read('machines',target.id,p.actorId);
  fail(machine&&!machine.readOnly&&machine.scope!=='company','这台机器不在本人运维范围',403);
  const node=config.nodes.find(n=>n.machineId===machine!.id);fail(node,'这台机器尚未接入运维',503);
  fail(node.address===machine.address,'机器地址与固定运维授权不一致，请重新核对接入',409);
  const mapped=services.map(s=>{const allowed=node.services.find(a=>a.id===s.id&&s.method==='systemd'&&s.entry==='systemd:'+a.unit);fail(allowed,'服务与节点授权不一致',403);return {id:s.id,unit:allowed.unit,name:s.name,controllable:allowed.controllable,environment:s.environment};});
  if(target.kind==='machine')fail(['diagnose','reboot','poweroff'].includes(action),'服务器仅支持诊断、重启和关机',400);
  else fail(['diagnose','start','stop','restart'].includes(action),'项目仅支持诊断、启动、停止和重启',400);
  const selected=action==='diagnose'?mapped:mapped.filter(s=>s.controllable);if(target.kind!=='machine')fail(selected.length>0,'该项目没有授权的可操作服务',403);
  if(node.nodeId==='101'&&['start','restart'].includes(action)&&selected.some(s=>s.unit==='jarvis-platform.service'))throw new RuntimeAccessError('STANDBY_PROTECTED','101仍为冷备，请先完成正式主备接管',409);
  const health=app?.health?.enabled?{url:app.health.url||app.url,expectedStatus:app.health.expectedStatus,timeoutSec:app.health.timeoutSec}:null;
  return {target,machineId:machine.id,nodeId:node.nodeId,machineName:machine.name,address:machine.address,targetName:app?.name??(target.kind==='service'?services[0].name:machine.name),action,services:selected,health,projectPaused:app?.status==='paused',bindingHash:fingerprint({target,action,machineId:machine.id,address:machine.address,services:selected,health,appRevision:app?.revision,policy:fingerprint(config)})};
 }
 private row(p:RuntimePrincipal,id:string){const r=this.identity.db.prepare('SELECT * FROM runtime_remote_operations WHERE id=? AND actor_id=?').get(id,p.actorId);fail(r,'运维任务不存在',404);return {row:r,job:JSON.parse(String(r.json)) as Item};}
 private save(p:RuntimePrincipal,job:Item){this.identity.db.prepare('UPDATE runtime_remote_operations SET status=?,revision=?,json=? WHERE id=? AND actor_id=?').run(job.status,job.revision,JSON.stringify(job),job.id,p.actorId);}
 prepare(p:RuntimePrincipal,input:unknown){this.admin(p);fail(!this.stopped(),'平台已急停或暂停');const request=prepareSchema.parse(input),hash=fingerprint(request);const old=this.identity.db.prepare('SELECT * FROM runtime_remote_operations WHERE actor_id=? AND request_id=?').get(p.actorId,request.requestId);if(old){fail(old.request_hash===hash,'同一提交编号不能改变目标');return this.read(p,String(old.id));}
  const bound=this.binding(p,request.target,request.action),title=labels[request.action]+' · '+bound.machineName+(request.target.kind==='machine'?'':' · '+bound.targetName),power=['reboot','poweroff'].includes(request.action);
  const projects=this.applications.list(p.actorId,{machineId:bound.machineId,limit:100}).items.map(a=>a.name);
  const impact=request.action==='diagnose'?'只读取诊断信息，不修改服务或数据。':power?`${bound.machineName}上的${projects.length}个登记项目会中断。${request.action==='poweroff'?'关机后本平台暂不支持开机，需要人工或云控制台启动。':'机器重新上线后将核对新的启动标识及服务状态。'}${bound.nodeId==='gz'?'此机承载公网域名网关，关闭会影响家庭项目域名访问。':''}${bound.nodeId==='112'?'此机运行贾维斯，操作期间平台会暂时离线；独立运维进程保留回执。':''}`:`只${labels[request.action]}所列的${bound.services.length}个服务；${bound.services.map(s=>s.name).join('、')}。${bound.services.some(s=>s.unit==='jarvis-platform.service')?'贾维斯会暂时不可访问，可提前打开独立运维入口。':''}`;
  const job={id:randomUUID(),requestId:request.requestId,...bound,title,impact,affectedProjects:projects,status:'prepared',revision:1,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+5*60000).toISOString(),requiresConfirmation:request.action!=='diagnose',result:null};
  this.identity.db.prepare('INSERT INTO runtime_remote_operations VALUES(?,?,?,?,?,?,?,?)').run(job.id,p.actorId,p.authorizationHash??'',request.requestId,hash,job.status,job.revision,JSON.stringify(job));return job;
 }
 private publish(job:Item){const target=join(this.queue,'requests',job.id+'.json');if(existsSync(target))return;const temp=target+'.next';writeFileSync(temp,JSON.stringify({version:1,...job}),{mode:0o640});chmodSync(temp,0o640);renameSync(temp,target);}
 execute(p:RuntimePrincipal,id:string,input:unknown){this.admin(p);const command=z.object({expectedVersion:z.number().int().min(1),confirmed:z.boolean().default(false),confirmTitle:z.string().max(500).default('')}).strict().parse(input);const {row,job}=this.row(p,id);
  if(job.status!=='prepared'){fail(!['cancelled','expired'].includes(job.status),'任务已取消或过期');return this.read(p,id);}
  fail(row.authorization_hash===(p.authorizationHash??''),'请使用创建该操作的登录身份');fail(job.revision===command.expectedVersion,'操作已更新，请重新核对');fail(Date.parse(job.expiresAt)>Date.now(),'操作已过期，请重新发起');fail(!this.stopped(),'平台已急停或暂停');
  const current=this.binding(p,job.target,job.action);fail(current.bindingHash===job.bindingHash,'目标或授权已改变，请重新准备');if(job.requiresConfirmation)fail(command.confirmed&&command.confirmTitle===job.title,'请确认当前明确的操作名称',400);
  const caps=this.capabilities(p);fail(caps.controllerOnline,'独立运维进程未在线，未执行操作',503);
  job.status='queued';job.revision++;job.approvedAt=new Date().toISOString();job.executeBefore=new Date(Date.now()+60000).toISOString();this.save(p,job);this.identity.store.audit('remote-operation.dispatch',job.id);this.publish(job);return job;
 }
 cancel(p:RuntimePrincipal,id:string){this.admin(p);const {job}=this.row(p,id);fail(job.status==='prepared','已派发操作不能撤回或抹去');job.status='cancelled';job.revision++;this.save(p,job);return job;}
 private reconcile(){
  // Receipts created through the separately authenticated recovery portal join the same audit list.
  for(const file of readdirSync(join(this.queue,'results')).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n))){try{const receipt=JSON.parse(readFileSync(join(this.queue,'results',file),'utf8')),job={...receipt.job};if(receipt.source!=='independent-control'||!job.id||job.source!=='independent-control'||receipt.id!==job.id||receipt.machineId!==job.machineId||receipt.bindingHash!==job.bindingHash||file!==job.id+'.json'||!['queued','running','verifying','accepted','succeeded','failed','offline-unconfirmed','unknown'].includes(receipt.status)||this.identity.db.prepare('SELECT id FROM runtime_remote_operations WHERE id=?').get(job.id))continue;if(!this.configuration().nodes.some(n=>n.machineId===job.machineId))continue;const {job:embedded,...result}=receipt;job.result=result;job.status=receipt.status;this.identity.db.prepare('INSERT INTO runtime_remote_operations VALUES(?,?,?,?,?,?,?,?)').run(job.id,'server-admin','independent-control',job.requestId,fingerprint(job),job.status,job.revision??1,JSON.stringify(job));}catch{/* An incomplete or untrusted receipt is not an imported command. */}}
  for(const raw of this.identity.db.prepare("SELECT * FROM runtime_remote_operations WHERE status IN ('queued','running','verifying','accepted','offline-unconfirmed','unknown')").all()){
  const job=JSON.parse(String(raw.json));const file=join(this.queue,'results',job.id+'.json');if(!existsSync(file)){if(job.status==='queued'&&Date.parse(job.executeBefore)>Date.now())this.publish(job);continue;}
  try{const response=JSON.parse(readFileSync(file,'utf8'));if(response.id!==job.id||response.machineId!==job.machineId||response.bindingHash!==job.bindingHash||!['running','verifying','accepted','succeeded','failed','offline-unconfirmed','unknown'].includes(response.status))continue;if(fingerprint(job.result)===fingerprint(response)&&job.status===response.status)continue;job.status=response.status;job.result=response;job.revision++;this.identity.db.prepare('UPDATE runtime_remote_operations SET status=?,revision=?,json=? WHERE id=?').run(job.status,job.revision,JSON.stringify(job),job.id);}catch{/* Partial or invalid result cannot become success. */}
 }}
 read(p:RuntimePrincipal,id:string){this.admin(p);this.reconcile();return this.row(p,id).job;}
 list(p:RuntimePrincipal,machineId=''){this.admin(p);this.reconcile();return this.identity.db.prepare('SELECT json FROM runtime_remote_operations WHERE actor_id=? ORDER BY rowid DESC LIMIT 100').all(p.actorId).map(r=>JSON.parse(String(r.json))).filter(j=>!machineId||j.machineId===machineId);}
 controlCookie(p:RuntimePrincipal){this.admin(p);const body=Buffer.from(JSON.stringify({expires:Date.now()+15*60000,authorizationHash:p.authorizationHash,nonce:randomUUID()})).toString('base64url');return body+'.'+createHmac('sha256',this.key).update(body).digest('base64url');}
 recoveryCode(p:RuntimePrincipal){this.admin(p);this.identity.store.audit('remote-operation.recovery-code-view','control');return createHmac('sha256',this.key).update('owner-recovery-code').digest('base64url');}
 voiceCandidate(p:RuntimePrincipal,text:string){text=text.normalize('NFKC').trim();const wake=String(this.identity.profile(p).wakeWord??'贾维斯');if(text.startsWith(wake))text=text.slice(wake.length).replace(/^[，,\s]+/,'');for(const [words,id] of [['一一六','116'],['一百一十六','116'],['幺幺六','116'],['一一二','112'],['一百一十二','112'],['一零一','101'],['一〇一','101'],['一百零一','101']])text=text.replaceAll(words,id);
  if(!/诊断|检查|巡检|重启|关机|关闭|停止|启动/.test(text)||/不要|别|不需要|不用|不必|暂不|如何|怎么|能否|是否|如果|假如|必要时/.test(text))return null;let config:Configuration;try{config=this.configuration();}catch(e){if(/服务器|项目|机器/.test(text))throw e;return null;}
  const nodeMatches=config.nodes.filter(n=>text.includes(n.address)||new RegExp('(?:^|[^0-9])'+n.nodeId+'(?:[^0-9]|$)').test(text)||text.includes(n.name)||(n.nodeId==='gz'&&/广州/.test(text))||(n.nodeId==='jp'&&/日本/.test(text)));
  const allApps=this.applications.list(p.actorId,{limit:100}).items;
  const applications=allApps.filter(a=>{const alias=a.name.replace(/（[^）]*）|\([^)]*\)/g,'').trim().toLowerCase();return text.toLowerCase().includes(alias)&&(!nodeMatches.length||nodeMatches.some(n=>n.machineId===a.machineId))&&(!/开发/.test(text)||a.environment==='test');});
  if(!nodeMatches.length&&!applications.length&&!/服务器|项目|机器/.test(text))return null;this.admin(p);
  const projectExplicit=/项目|服务(?!器)/.test(text),machine=applications.length===0&&!projectExplicit;
  const residue=text.replace(/请|帮我|把|一下|现在|立即|重启|启动|关闭|关机|停止|诊断|检查|巡检|服务器|机器|主机|整机|号|的|吧|[，。！？\s]/g,'');
  if(machine&&(nodeMatches.length!==1||!(/服务器|机器|主机|整机/.test(text)||[nodeMatches[0]?.nodeId,nodeMatches[0]?.address,nodeMatches[0]?.name].includes(residue)))||!machine&&applications.length!==1)throw new RuntimeAccessError('TARGET_AMBIGUOUS','请明确服务器编号和项目名称，例如：诊断116服务器，或重启116上的MyFamily。',422);
  let action:RemoteAction=/重启/.test(text)?(machine?'reboot':'restart'):/关机|关闭/.test(text)?(machine?'poweroff':'stop'):/停止/.test(text)?(machine?'poweroff':'stop'):/启动/.test(text)?'start':'diagnose';
  const target:Target=machine?{kind:'machine',id:nodeMatches[0].machineId}:{kind:'application',id:applications[0].id};
  return this.prepare(p,{requestId:randomUUID(),target,action});
 }
 start(){this.timer=setInterval(()=>{try{this.reconcile();}catch{/* Control storage failure must neither crash the platform nor become success. */}},2000);this.timer.unref();}
 close(){if(this.timer)clearInterval(this.timer);}
}
export function registerRemoteOperations(app:FastifyInstance,r:RemoteOperationsRuntime){const base='/api/runtime/remote-ops',principal=(req:any)=>r.identity.principal(req),cookie=(req:any,reply:any)=>{reply.setCookie('jarvis_control_session',r.controlCookie(principal(req)),{httpOnly:true,secure:!!(req.protocol==='https'),sameSite:'strict',path:'/control',maxAge:900});};
 app.get(base+'/capabilities',async req=>r.capabilities(principal(req)));app.get(base+'/jobs',async req=>r.list(principal(req),z.object({machineId:z.string().max(200).default('')}).strict().parse(req.query).machineId));app.get<{Params:{id:string}}>(base+'/jobs/:id',async req=>r.read(principal(req),req.params.id));
 app.post(base+'/prepare',async(req,reply)=>{const job=r.prepare(principal(req),req.body);cookie(req,reply);return job;});
 app.post<{Params:{id:string}}>(base+'/jobs/:id/execute',async(req,reply)=>{const job=r.execute(principal(req),req.params.id,req.body);cookie(req,reply);return job;});app.post<{Params:{id:string}}>(base+'/jobs/:id/cancel',async req=>r.cancel(principal(req),req.params.id));
 app.post(base+'/control-session',async(req,reply)=>{z.object({}).strict().parse(req.body);cookie(req,reply);return {url:'/control/'};});app.post(base+'/recovery-code',async(req,reply)=>{z.object({}).strict().parse(req.body);reply.header('Cache-Control','no-store');return {code:r.recoveryCode(principal(req))};});
}
export function createRemoteOperationsTools(r:RemoteOperationsRuntime,p:RuntimePrincipal):ToolDefinition[]{return [defineTool({name:'jarvis_remote_operations',label:'远程运维进度',description:'只读查看本人服务器的诊断及启停任务真实回执。未核实的关机不能视为已关闭。不执行或批准操作。',parameters:Type.Object({machineId:Type.Optional(Type.String())},{additionalProperties:false}),annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},execute:async(_id,input,signal)=>{signal?.throwIfAborted();const jobs=r.list(p,input.machineId).slice(0,15).map(j=>({id:j.id,title:j.title,status:j.status,createdAt:j.createdAt,summary:j.result?.summary,applicationHealth:j.result?.applicationHealth,findings:j.result?.receipt?.diagnostic?.findings,services:(j.result?.receipt?.services??j.result?.receipt?.diagnostic?.services)?.map((s:Item)=>({unit:s.unit,state:s.fields?.ActiveState})),powerVerified:j.action==='poweroff'?false:undefined}));return {content:[{type:'text',text:JSON.stringify(jobs)}],details:{readOnly:true}};}})];}
