import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {BusinessError,type BusinessRecord} from '../v1/types.js';
import type {V1Repository} from '../v1/repository.js';
import type {IdentityRuntime,RuntimePrincipal} from './identity.js';
import type {NotificationRuntime} from './notifications.js';
import {redactExecutionLog} from './execution-runtime.js';

const identifier=z.string().trim().min(1).max(200),optionalText=(max:number)=>z.string().trim().max(max).default('');
const evidence=z.object({path:z.string().max(1000).regex(/^(?:docs|artifacts|work\/artifacts)\/[A-Za-z0-9\u3400-\u9fff_. /()-]+$/).refine(v=>!v.split('/').some(p=>p==='.'||p==='..')&&!/(?:^|\/)(?:private|credentials|secrets)(?:\/|$)/i.test(v)&&!/(?:^|\/)(?:\.env(?:\..*)?|id_(?:rsa|ed25519|ecdsa)(?:\.pub)?|(?:token|credentials|secrets?|passwords?)(?:\.[^/]*)?)$/i.test(v)),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const body=z.object({title:z.string().trim().min(1).max(200),status:z.enum(['planned','running','blocked','completed']),summary:optionalText(2000),nextAction:optionalText(2000),blocker:optionalText(2000),stepId:identifier.nullable().default(null),taskId:identifier.nullable().default(null),runId:identifier.nullable().default(null),completionSummary:optionalText(4000),validationScope:optionalText(2000),evidenceRefs:z.array(evidence).max(30).default([])}).strict();
export const supervisionWorkCreateSchema=body.extend({commandId:z.string().uuid(),expectedVersion:z.literal(0)}).strict();
export const supervisionWorkRevisionSchema=body.extend({commandId:z.string().uuid(),expectedVersion:z.number().int().positive()}).strict();
type WorkBody=z.infer<typeof body>;
export interface SupervisionWorkItem extends WorkBody {id:string;projectId:string;ownerId:string;revision:number;createdAt:string;updatedAt:string;previousHash:string;hash:string}
export interface SupervisionWorkEvent {projectId:string;sequence:number;itemId:string|null;revision:number;kind:'work-item'|'execution';status:string;at:string}
interface StoredEvent extends SupervisionWorkEvent {id:string;ownerId:string;title:string;body:string}
interface Options {directory:string;identity:IdentityRuntime;notifications:NotificationRuntime;plans?:{get:(projectId:string,actorId:string)=>any};autonomy?:(projectId:string,actorId:string)=>any;actorId?:string}
const canonical=(v:any):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const sha=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
function fail(message:string,code='SUPERVISION_WORK_INVALID',status=400):never{throw new BusinessError(code,message,status);}
function publicInput(input:unknown){const serialized=JSON.stringify(input);if(redactExecutionLog(serialized)!==serialized||/(?:密码|密钥|令牌)\s*(?:为|是|[:：=])\s*\S+/.test(serialized)||/(?:[\\/])(?:\.secrets|\.jarvis-dev|private|credentials)(?:[\\/])/i.test(serialized))fail('工作项只保存公开摘要和证据引用，不可包含凭据或私有内容');for(const m of serialized.matchAll(/https?:\/\/[^\s<>"']+/gi)){let u:URL;try{u=new URL(m[0]);}catch{fail('公开引用网址无效');}if(u!.username||u!.password||u!.search)fail('公开摘要网址不可包含身份或查询参数');}}
const safeSummary=(v:unknown)=>{const value=String(v??'');try{publicInput(value);return value.slice(0,2000);}catch{return '详情包含受保护内容，请在原任务中核对。';}};

/** An independent factual ledger, never a dispatcher or an objective-acceptance writer. */
export class SupervisionWorkRuntime {
 private db:DatabaseSync;private closed=false;private pumping=false;private listeners=new Set<(event:SupervisionWorkEvent)=>void>();private offRepository:()=>void;private offPump:()=>void;private actor:string;
 constructor(readonly repository:V1Repository,readonly execution:{getRun:(id:string)=>any},readonly options:Options){
  this.actor=options.actorId??'server-admin';mkdirSync(options.directory,{recursive:true});this.db=new DatabaseSync(join(options.directory,'supervision-work.sqlite'));
  this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS supervision_work_items(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,owner_id TEXT NOT NULL,revision INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS supervision_work_revisions(sequence INTEGER PRIMARY KEY AUTOINCREMENT,item_id TEXT NOT NULL,revision INTEGER NOT NULL,json TEXT NOT NULL,UNIQUE(item_id,revision));
   CREATE TABLE IF NOT EXISTS supervision_work_commands(actor_id TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(actor_id,id));
   CREATE TABLE IF NOT EXISTS supervision_work_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,owner_id TEXT NOT NULL,project_id TEXT NOT NULL,json TEXT NOT NULL,notified INTEGER NOT NULL DEFAULT 0);
   CREATE INDEX IF NOT EXISTS supervision_work_events_owner ON supervision_work_events(owner_id,project_id,sequence);
   CREATE TABLE IF NOT EXISTS supervision_work_cursors(actor_id TEXT PRIMARY KEY,sequence INTEGER NOT NULL);
   CREATE TRIGGER IF NOT EXISTS supervision_work_history_no_update BEFORE UPDATE ON supervision_work_revisions BEGIN SELECT RAISE(ABORT,'Work history is immutable');END;
   CREATE TRIGGER IF NOT EXISTS supervision_work_history_no_delete BEFORE DELETE ON supervision_work_revisions BEGIN SELECT RAISE(ABORT,'Work history is immutable');END;
   CREATE TRIGGER IF NOT EXISTS supervision_work_events_no_delete BEFORE DELETE ON supervision_work_events BEGIN SELECT RAISE(ABORT,'Work events are immutable');END;
   CREATE TRIGGER IF NOT EXISTS supervision_work_events_no_rewrite BEFORE UPDATE OF sequence,id,owner_id,project_id,json ON supervision_work_events BEGIN SELECT RAISE(ABORT,'Work events are immutable');END;`);
  // First activation starts at the current durable business boundary, without replaying years of old notices.
  this.db.prepare('INSERT OR IGNORE INTO supervision_work_cursors VALUES(?,?)').run(this.actor,repository.version(this.actor));
  this.offRepository=repository.onCommitted(()=>this.pump());this.offPump=options.notifications.registerDurableSource(()=>this.pump());
 }
 private tx<T>(fn:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 assertOwner(p:RuntimePrincipal){if(!this.options.identity.isPrincipalCurrent(p))fail('会话已失效，请重新登录','LOGIN_REQUIRED',401);if(!p.administrator||p.profileId!=='me')fail('监督工作项仅管理者本人可用','ADMIN_REQUIRED',403);}
 assertAccess(projectId:string,p:RuntimePrincipal,write=false){this.assertOwner(p);const project=this.repository.read('projects',projectId,p.actorId);if(!project||project.ownerId!==p.actorId)fail('项目不存在或不可访问','NOT_FOUND',404);if(write&&project.status==='archived')fail('归档项目不能修改工作项','CONFLICT',409);return project;}
 private binding(project:BusinessRecord,input:WorkBody){
  if(input.stepId){let plan:any;try{plan=this.options.plans?.get(project.id,project.ownerId);}catch{fail('监管步骤不可访问','BINDING_INVALID',409);}if(!plan?.steps?.some((s:any)=>s.id===input.stepId))fail('步骤不属于当前监管计划','BINDING_INVALID',409);}
  const task=input.taskId?this.repository.read('tasks',input.taskId,project.ownerId):undefined;if(input.taskId&&(!task||task.projectId!==project.id||task.scope!==project.scope))fail('任务不属于此项目或范围','BINDING_INVALID',409);
  if(input.runId){const run=this.execution.getRun(input.runId),runTask=run?this.repository.read('tasks',run.taskId??run.objectId,project.ownerId):undefined;if(!run||run.domain!=='tasks'||run.projectId!==project.id||!runTask||runTask.projectId!==project.id||runTask.scope!==project.scope||input.taskId&&runTask.id!==input.taskId||runTask.machineId&&run.machineId!==runTask.machineId||runTask.worktree&&run.workspace!==runTask.worktree)fail('运行不属于此项目或任务','BINDING_INVALID',409);}
  if(input.status==='blocked'&&!input.blocker)fail('阻塞工作项必须说明阻塞原因');if(input.status==='completed'&&(!input.completionSummary||!input.validationScope||!input.evidenceRefs.length))fail('完成工作项需要完成简报、验证范围及公开证据引用');
 }
 private current(projectId:string,owner:string,id:string):SupervisionWorkItem{const row=this.db.prepare('SELECT r.json FROM supervision_work_items i JOIN supervision_work_revisions r ON r.item_id=i.id AND r.revision=i.revision WHERE i.id=? AND i.project_id=? AND i.owner_id=?').get(id,projectId,owner);if(!row)fail('工作项不存在或不可访问','NOT_FOUND',404);return JSON.parse(String(row.json));}
 private addEvent(event:Omit<StoredEvent,'sequence'>){const result=this.db.prepare('INSERT INTO supervision_work_events(id,owner_id,project_id,json) VALUES(?,?,?,?)').run(event.id,event.ownerId,event.projectId,JSON.stringify(event));return {...event,sequence:Number(result.lastInsertRowid)};}
 private command(projectId:string,itemId:string|null,raw:unknown,p:RuntimePrincipal){const project=this.assertAccess(projectId,p,true),input=itemId?supervisionWorkRevisionSchema.parse(raw):supervisionWorkCreateSchema.parse(raw);publicInput(input);const fingerprint=sha({projectId,itemId,input});
  const result=this.tx(()=>{const old=this.db.prepare('SELECT fingerprint,response FROM supervision_work_commands WHERE actor_id=? AND id=?').get(p.actorId,input.commandId);if(old){if(old.fingerprint!==fingerprint)fail('提交编号不可用于不同内容','CONFLICT',409);return JSON.parse(String(old.response)) as SupervisionWorkItem;}
   const before=itemId?this.current(projectId,p.actorId,itemId):undefined;if(before&&before.revision!==input.expectedVersion)fail('工作项已更新，请刷新后再提交','CONFLICT',409);this.binding(project,input);
   const {commandId,expectedVersion,...fields}=input;
   if(before&&canonical(fields)===canonical(body.strip().parse(before))){this.db.prepare('INSERT INTO supervision_work_commands VALUES(?,?,?,?)').run(p.actorId,commandId,fingerprint,JSON.stringify(before));return before;}
   const at=new Date().toISOString(),snapshot={...fields,id:itemId??randomUUID(),projectId,ownerId:p.actorId,revision:(before?.revision??0)+1,createdAt:before?.createdAt??at,updatedAt:at,previousHash:before?.hash??''},item={...snapshot,hash:sha(snapshot)};
   this.db.prepare('INSERT INTO supervision_work_revisions(item_id,revision,json) VALUES(?,?,?)').run(item.id,item.revision,JSON.stringify(item));this.db.prepare('INSERT INTO supervision_work_items VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision').run(item.id,projectId,p.actorId,item.revision);
   this.addEvent({id:randomUUID(),ownerId:p.actorId,projectId,itemId:item.id,revision:item.revision,kind:'work-item',status:item.status,at,title:item.title,body:item.status==='completed'?item.completionSummary:item.status==='blocked'?item.blocker:item.summary});this.db.prepare('INSERT INTO supervision_work_commands VALUES(?,?,?,?)').run(p.actorId,input.commandId,fingerprint,JSON.stringify(item));return item;});
  this.pump();return result;
 }
 create(projectId:string,input:unknown,p:RuntimePrincipal){return this.command(projectId,null,input,p);}
 revise(projectId:string,itemId:string,input:unknown,p:RuntimePrincipal){return this.command(projectId,itemId,input,p);}
 detail(projectId:string,itemId:string,p:RuntimePrincipal){this.assertAccess(projectId,p);const item=this.current(projectId,p.actorId,itemId),rows=this.db.prepare('SELECT json FROM supervision_work_revisions WHERE item_id=? ORDER BY revision DESC LIMIT 101').all(itemId);return {item,history:rows.slice(0,100).map(r=>JSON.parse(String(r.json)) as SupervisionWorkItem),historyTruncated:rows.length>100,evidenceVerification:'references-only' as const,independentAcceptance:false};}
 private briefBinding(item:SupervisionWorkItem){return {itemId:item.id,revision:item.revision,taskId:item.taskId,runId:item.runId,evidenceRefs:item.evidenceRefs,evidenceVerification:'references-only' as const,executionClaim:'unverified' as const};}
 brief(projectId:string,p:RuntimePrincipal){this.assertAccess(projectId,p);const rows=this.db.prepare('SELECT r.json FROM supervision_work_items i JOIN supervision_work_revisions r ON r.item_id=i.id AND r.revision=i.revision WHERE i.project_id=? AND i.owner_id=? ORDER BY r.sequence DESC LIMIT 100').all(projectId,p.actorId).map(r=>JSON.parse(String(r.json)) as SupervisionWorkItem);const latest=rows.find(item=>item.status==='completed'),issue=rows.find(item=>item.status==='blocked');return {latestResult:latest?{title:safeSummary(latest.title),summary:safeSummary(latest.completionSummary||latest.summary),updatedAt:latest.updatedAt,binding:this.briefBinding(latest)}:null,unresolved:issue?{title:safeSummary(issue.title),reason:safeSummary(issue.blocker),nextAction:safeSummary(issue.nextAction),binding:this.briefBinding(issue)}:null,nextAction:safeSummary(issue?.nextAction??rows[0]?.nextAction),arrangement:rows[0]?{title:safeSummary(rows[0].title),binding:this.briefBinding(rows[0])}:null,source:'saved-supervision-work',currentSupervisionAccepted:false};}
 overview(projectId:string,p:RuntimePrincipal){const project=this.assertAccess(projectId,p);this.pump();const rows=this.db.prepare('SELECT r.json FROM supervision_work_items i JOIN supervision_work_revisions r ON r.item_id=i.id AND r.revision=i.revision WHERE i.project_id=? AND i.owner_id=? ORDER BY r.sequence DESC').all(projectId,p.actorId),all=rows.map(r=>JSON.parse(String(r.json)) as SupervisionWorkItem),counts={total:all.length,planned:0,running:0,blocked:0,completed:0};for(const item of all)counts[item.status]++;
  const tasks=this.repository.list('tasks',p.actorId).filter(t=>t.projectId===projectId&&t.scope===project.scope),executionFacts=tasks.slice(-200).reverse().map(task=>{const runId=task.executionRequest?.id??null,run=runId?this.execution.getRun(runId):null,valid=run&&run.domain==='tasks'&&run.projectId===projectId&&(run.taskId??run.objectId)===task.id&&(!task.machineId||run.machineId===task.machineId)&&(!task.worktree||run.workspace===task.worktree);return {taskId:task.id,title:safeSummary(task.title),status:String(task.status??'unknown'),executionStatus:String(task.executionStatus??'unstarted'),runId:valid?runId:null,runStatus:valid?String(run.status):null,summary:safeSummary(task.executionResult?.summary??task.blockReason),lastActivityAt:valid?run.updatedAt??task.updatedAt??null:task.updatedAt??null,source:'persisted-task-and-run',independentAcceptance:false};});
  const latestSequence=this.latest(projectId,p.actorId);return {projectId,revision:latestSequence,latestSequence,items:all.slice(0,500),itemsTruncated:all.length>500,counts,executionFacts,executionFactsTruncated:tasks.length>200,independentProgress:{automaticAcceptance:false,statement:'原监督计划与独立验收另行核对；工作项完成不代表产品验收'}};
 }
 activity(projectId:string,p:RuntimePrincipal,before=0){
  this.assertAccess(projectId,p);this.pump();
  if(before&&!this.db.prepare('SELECT sequence FROM supervision_work_events WHERE sequence=? AND project_id=? AND owner_id=?').get(before,projectId,p.actorId))fail('进展记录位置无效，请刷新后重试','CURSOR_INVALID',409);
  const rows=this.db.prepare('SELECT sequence,json FROM supervision_work_events WHERE project_id=? AND owner_id=? AND (?=0 OR sequence<?) ORDER BY sequence DESC LIMIT 21').all(projectId,p.actorId,before,before);
  const items=rows.slice(0,20).map(row=>{const event=JSON.parse(String(row.json)) as StoredEvent;return {...this.publicEvent({...event,sequence:Number(row.sequence)}),title:safeSummary(event.title),summary:safeSummary(event.body)};});
  return {items,hasMore:rows.length>20,nextBefore:rows.length>20?items.at(-1)!.sequence:null};
 }
 console(projectId:string,p:RuntimePrincipal){
  const project=this.assertAccess(projectId,p),overview=this.overview(projectId,p);
  let plan:any=null,planUnavailable=false;try{plan=this.options.plans?.get(projectId,p.actorId)??null;}catch{planUnavailable=true;}
  let profile:any=plan?.independentProgress??null;if(!profile)try{profile=this.options.autonomy?.(projectId,p.actorId)??null;}catch{planUnavailable=true;}
  const tasks=this.repository.list('tasks',p.actorId).filter(t=>t.projectId===projectId&&t.scope===project.scope);
  // Only bound persisted execution receipts count as dispatched work, across all tasks.
  const runs=new Map<string,any>();for(const task of tasks){const run=task.executionRequest?.id?this.execution.getRun(task.executionRequest.id):null;if(run&&run.domain==='tasks'&&run.projectId===projectId&&(run.taskId??run.objectId)===task.id&&(!task.machineId||run.machineId===task.machineId)&&(!task.worktree||run.workspace===task.worktree))runs.set(run.id,run);}
  const running=[...runs.values()].filter(r=>r.status==='running').length,queued=[...runs.values()].filter(r=>r.status==='queued').length;
  const approvals=this.repository.list('approvals',p.actorId).filter(a=>{
   if(a.status!=='pending'||a.scope!==project.scope)return false;if(a.projectId===projectId)return true;
   if(a.deploymentId){const d=this.repository.read('operations',a.deploymentId,p.actorId);if(d?.projectId===projectId&&d.scope===project.scope)return true;}
   const b=a.authorizationBinding;if(!b||a.targetId&&a.targetId!==b.targetId)return false;
   if(b.domain==='tasks'){const t=this.repository.read('tasks',b.targetId,p.actorId);return b.projectId===projectId&&t?.projectId===projectId&&t.scope===project.scope;}
   return b.domain==='projects'&&b.targetId===projectId;
  });
  const decisions=[...approvals.map(a=>({id:a.id,kind:'approval' as const,title:safeSummary(a.title??a.name??'待审批申请'),reason:'需要本人作出审批决定',route:'approvals/'+encodeURIComponent(a.id)})),...tasks.filter(t=>['waitingUser','approval'].includes(t.status)).map(t=>({id:t.id,kind:'task' as const,title:safeSummary(t.title),reason:safeSummary(t.blockReason)||'任务等待本人处理',route:'tasks/'+encodeURIComponent(t.id)}))];
  const objectives=profile?.spec?.objectives?.filter((x:any)=>x.required!==false&&typeof x.id==='string'),ids=objectives?new Set(objectives.map((x:any)=>x.id)):null;
  const total=Number.isSafeInteger(profile?.totalObjectives)?profile.totalObjectives:ids?.size??null;
  const accepted=Number.isSafeInteger(profile?.verifiedObjectives)?profile.verifiedObjectives:ids&&Array.isArray(profile?.verifiedObjectiveIds)?new Set(profile.verifiedObjectiveIds.filter((id:any)=>ids.has(id))).size:null;
  return {...overview,reportedAt:new Date().toISOString(),project:{id:projectId,name:safeSummary(project.name??project.title),goal:safeSummary(project.goal)},
   runtime:{running,queued,runningRunIds:[...runs.values()].filter(r=>r.status==='running').map(r=>String(r.id)),scope:'bound-persisted-task-runs' as const,unavailable:planUnavailable,autonomyStatus:typeof profile?.status==='string'?profile.status:null,reason:safeSummary(profile?.reason),revision:profile?.revision??null},
   acceptance:{available:total!==null&&accepted!==null,total,accepted,source:'independent-objectives' as const},
   plan:plan?{revision:plan.revision,currentStepId:plan.currentStepId,steps:plan.steps.map((s:any)=>({id:s.id,title:safeSummary(s.title),state:s.state,goal:safeSummary(s.goal),nextAction:safeSummary(s.nextAction)}))}:null,
   attention:{total:decisions.length,items:decisions.slice(0,30),truncated:decisions.length>30},activity:this.activity(projectId,p)};
 }
 latest(projectId:string,actor:string){return Number(this.db.prepare('SELECT COALESCE(MAX(sequence),0) AS n FROM supervision_work_events WHERE owner_id=? AND project_id=?').get(actor,projectId)?.n??0);}
 events(projectId:string,p:RuntimePrincipal,after:number){this.assertAccess(projectId,p);if(after>0&&!this.db.prepare('SELECT sequence FROM supervision_work_events WHERE sequence=? AND project_id=? AND owner_id=?').get(after,projectId,p.actorId))fail('事件位置不可用，请重新读取概览','CURSOR_INVALID',409);return this.db.prepare('SELECT sequence,json FROM supervision_work_events WHERE owner_id=? AND project_id=? AND sequence>? ORDER BY sequence LIMIT 100').all(p.actorId,projectId,after).map(r=>this.publicEvent({...JSON.parse(String(r.json)),sequence:Number(r.sequence)}));}
 latestOwned(p:RuntimePrincipal){this.assertOwner(p);return Number(this.db.prepare('SELECT COALESCE(MAX(sequence),0) AS n FROM supervision_work_events WHERE owner_id=?').get(p.actorId)?.n??0);}
 eventsOwned(p:RuntimePrincipal,after:number){this.assertOwner(p);if(after>0&&!this.db.prepare('SELECT sequence FROM supervision_work_events WHERE sequence=? AND owner_id=?').get(after,p.actorId))fail('事件位置不可用，请重新读取概览','CURSOR_INVALID',409);const rows=this.db.prepare('SELECT sequence,project_id,json FROM supervision_work_events WHERE owner_id=? AND sequence>? ORDER BY sequence LIMIT 100').all(p.actorId,after);return {items:rows.filter(r=>!!this.repository.read('projects',String(r.project_id),p.actorId)).map(r=>this.publicEvent({...JSON.parse(String(r.json)),sequence:Number(r.sequence)})),cursor:rows.length?Number(rows.at(-1)!.sequence):after,hasMore:rows.length===100};}
 private publicEvent(e:StoredEvent):SupervisionWorkEvent{return {projectId:e.projectId,sequence:e.sequence,itemId:e.itemId,revision:e.revision,kind:e.kind,status:e.status,at:e.at};}
 subscribe(fn:(event:SupervisionWorkEvent)=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
 /** Replays committed source events and an idempotent notification outbox, including after a process restart. */
 pump(){if(this.closed||this.pumping)return;this.pumping=true;try{
  let cursor=Number(this.db.prepare('SELECT sequence FROM supervision_work_cursors WHERE actor_id=?').get(this.actor)?.sequence??0);let page:ReturnType<V1Repository['events']>;do{page=this.repository.events(this.actor,cursor,100);if(!page.length)break;this.tx(()=>{for(const event of page){if(event.domain==='tasks'){const task=this.repository.read('tasks',event.objectId,this.actor),project=task?.projectId?this.repository.read('projects',task.projectId,this.actor):null;if(task&&project&&task.scope===project.scope&&/execution|^task\.|recovery|handoff|^(?:create|start|pause|resume|retry|cancel|complete|block)$/.test(event.type))this.addEvent({id:'v1:'+event.id,ownerId:this.actor,projectId:project.id,itemId:null,revision:task.revision,kind:'execution',status:event.type,at:event.at,title:safeSummary(task.title),body:'任务执行事件已提交（'+event.type+'），请查看当前任务和运行详情。'});}
    cursor=event.sequence;}this.db.prepare('UPDATE supervision_work_cursors SET sequence=? WHERE actor_id=?').run(cursor,this.actor);});}while(page.length===100);
  for(const row of this.db.prepare('SELECT sequence,json FROM supervision_work_events WHERE notified=0 ORDER BY sequence').all()){const event={...JSON.parse(String(row.json)),sequence:Number(row.sequence)} as StoredEvent;try{this.options.notifications.publishSupervision({eventId:event.id,actorId:event.ownerId,projectId:event.projectId,title:event.title,body:event.body,status:event.status,at:event.at});this.db.prepare('UPDATE supervision_work_events SET notified=1 WHERE sequence=?').run(event.sequence);for(const listener of this.listeners)try{listener(this.publicEvent(event));}catch{/* A disconnected observer never changes a committed fact. */}}catch{/* Retained outbox retries on next source event, read, notification scan or restart. */}}
 }finally{this.pumping=false;}}
 start(){this.pump();}
 close(){if(this.closed)return;this.closed=true;this.offRepository();this.offPump();this.listeners.clear();this.db.close();}
}
