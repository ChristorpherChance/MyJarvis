import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {z} from 'zod';
import {BusinessError,type BusinessRecord} from '../v1/types.js';
import type {V1Repository} from '../v1/repository.js';
import {redactExecutionLog,validateCandidateValidationRun} from './execution-runtime.js';
import {projectAutonomyValidationSchema} from './project-autonomy-evidence.js';

const text=(max:number)=>z.string().trim().min(1).max(max);
const id=text(200),ids=z.array(id).max(100);
const stepSchema=z.object({id:text(80),title:text(100),goal:text(2000),criteria:z.array(text(1000)).min(1).max(20),
 taskIds:ids.default([]),runIds:ids.default([]),nextAction:text(2000).nullable().default(null)}).strict();
const bodySchema=z.object({mode:z.enum(['development','acceptance']),title:text(200),goal:text(4000),
 steps:z.array(stepSchema).min(1).max(50),currentStepId:text(80).nullable().default(null),
 nextAction:text(2000).nullable().default(null)}).strict();
export const projectSupervisionPlanCreateSchema=bodySchema.extend({commandId:z.string().uuid(),expectedVersion:z.literal(0),
 supersedesPlanId:z.string().uuid().nullable().default(null),supersedesRevision:z.number().int().positive().nullable().default(null),goalBasis:z.enum(['legacy-autonomy','plan']).optional()}).strict();
export const projectSupervisionPlanRevisionSchema=bodySchema.extend({commandId:z.string().uuid(),expectedVersion:z.number().int().positive(),reason:text(2000)}).strict();
type Body=z.infer<typeof bodySchema>;
export interface SupervisionPlanPrincipal {actorId:string;administrator:boolean}
export interface SupervisionPlanExecutionReader {runsForTask(taskId:string):any[];getRun(runId:string):any}
export interface SupervisionPlanOptions {directory:string;executionDirectory?:string;autonomy?:(projectId:string,actorId:string)=>any}
export interface ProjectSupervisionPlan extends Body {
 planId:string;projectId:string;ownerId:string;scope:string;revision:number;createdAt:string;updatedAt:string;
 supersedesPlanId:string|null;supersedesRevision:number|null;goalBasis?:'legacy-autonomy'|'plan';revisionReason:string;previousHash:string;hash:string;
}
const canonical=(value:any):string=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
const sha=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
function fail(message:string,code='SUPERVISION_PLAN_INVALID',status=400):never{throw new BusinessError(code,message,status)}
const active=new Set(['queued','running']);
const terminal=new Set(['succeeded','failed','cancelled','timeout','interrupted','round-limit','budget-exhausted','awaiting-cost']);
function publicInput(value:unknown){
 const walk=(v:any)=>{
  if(typeof v==='string'){
   if(redactExecutionLog(v)!==v||/(?:密码|密钥|令牌)\s*(?:为|是|[:：=])\s*\S+/.test(v)||/(?:^|[\\/])(?:\.secrets|\.jarvis-dev|private|credentials)(?:[\\/]|$)/i.test(v))fail('计划只保存公开摘要，不可包含凭据或私有内容');
   for(const m of v.matchAll(/https?:\/\/[^\s<>"']+/gi)){let url:URL;try{url=new URL(m[0]);}catch{fail('计划引用网址无效');}if(url!.username||url!.password||[...url!.searchParams.keys()].some(k=>/token|secret|password|key|cookie/i.test(k)))fail('计划引用不可包含访问凭据');}
  }else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk);
 };walk(value);
}
function unique(values:string[]){return new Set(values).size===values.length;}
const r27ReportScope=Object.freeze({projectId:'70ec346f-6520-46ed-abed-22cac770a3e4',machineId:'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',agentId:'0b5aea06-47e1-4f4b-a32e-969417915c9c',workspace:'/home/superopen/All-Projects/msf-repair-r27/source',goalHash:'23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42'});
const r27ExceptionSchema=z.object({id:z.literal('INVALID_LOGIN_NOT_DENIED'),status:z.literal('not-applicable'),executed:z.literal(false),required:z.literal(false),source:z.literal('explicit-user-request'),authorization:z.literal('R27-BAD-LOGIN-401-EXEMPTION'),scope:z.literal('invalid-credentials-must-return-401-only'),originalFailurePreserved:z.literal(true),countsAsPassedCheck:z.literal(false)}).strict();
/** This schema is only for read-only reporting; the independent objective evaluator stays strict. */
export const r27ScopedReportDisplaySchema=projectAutonomyValidationSchema.safeExtend({
 scopeExceptions:z.array(r27ExceptionSchema).length(1),authenticationPolicy:z.literal('simple-valid-login-invalid-401-exempt-v1'),
 sandboxImageContract:z.object({version:z.literal('existing-broker-d9-fixed-contract-v1'),imageId:z.literal('sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc'),reference:z.literal('alpine@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc'),architecture:z.literal('amd64'),os:z.literal('linux'),brokerSHA256:z.literal('d4bcec4e88990e45c82d76574fe7c8de8eebd1db239cedceefd95a6b204d1954'),originalBrokerChanged:z.literal(false),unlistedImageRejectionRequired:z.literal(true),networkReadOnlyTimeoutQuotaRequired:z.literal(true)}).strict(),productObjectivesAccepted:z.literal(false),
}).strict().superRefine((v,ctx)=>{if(v.workspace!==r27ReportScope.workspace||v.goalSpecHash!==r27ReportScope.goalHash||v.checks.some(c=>c.id==='INVALID_LOGIN_NOT_DENIED'))ctx.addIssue({code:'custom',message:'R27 display scope or deferred-check denominator changed'});});
const r28ReportSourceFingerprint='9b07a5115c22d14f82e04ba45b66efbc5ac04f7faa696ab84d81e33696ec7b76';
const r28AuthenticationMode='simple-valid-login-with-command-idempotency-invalid-401-exempt-v2';
const r28ExceptionSchema=r27ExceptionSchema.extend({authorization:z.literal('R28-BAD-LOGIN-401-EXEMPTION')}).strict();
/** R28 displays only the unchanged candidate under its separately frozen verifier contract. */
export const r28ScopedReportDisplaySchema=projectAutonomyValidationSchema.safeExtend({
 sourceFingerprint:z.literal(r28ReportSourceFingerprint),scopeExceptions:z.array(r28ExceptionSchema).length(1),authenticationPolicy:z.literal(r28AuthenticationMode),
 sandboxImageContract:z.object({version:z.literal('r28-d9-sdk5-exact-create-body-query-echo-v1'),imageId:z.literal('sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc'),reference:z.literal('alpine@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc'),architecture:z.literal('amd64'),os:z.literal('linux'),brokerSHA256:z.literal('5440387d04ed57404b47c77aabcfea57502fb7d4e90ee74c87d8e6c1e8518f8b'),controlSHA256:z.literal('cf9a0e5a7885eabe39ddebacda0b1423d007a0229f06551b21dd8615264ce4af'),brokerPath:z.literal('/opt/jarvis-development/software-factory/factory-sandbox-broker-r28.py'),brokerControlPath:z.literal('/opt/jarvis-development/software-factory/factory-sandbox-broker-control-r28.py'),brokerRoot:z.literal('/var/lib/jarvis-development/101/full-validation-r28'),runtimeRoot:z.literal('/run/jarvis-ft-sandbox-r28'),originalBrokerChanged:z.literal(false),createQueryCompatibility:z.literal('exact-approved-sdk5-body-echo-only'),allOtherDuplicateQueriesRejected:z.literal(true),unlistedImageRejectionRequired:z.literal(true),networkReadOnlyTimeoutQuotaRequired:z.literal(true)}).strict(),productObjectivesAccepted:z.literal(false),
}).strict().superRefine((v,ctx)=>{if(v.workspace!==r27ReportScope.workspace||v.goalSpecHash!==r27ReportScope.goalHash||v.checks.some(c=>c.id==='INVALID_LOGIN_NOT_DENIED'))ctx.addIssue({code:'custom',message:'R28 display scope or deferred-check denominator changed'});});
const originalPrototypeIds=new Set(['syntax','logic','task-data','design-catalog','customer-prototype','customer-authority-boundary','customer-state-kernel','customer-route-matrix','customer-privacy-projection','prototype-commands','prototype-effects-integration','design-baseline','design-boundary','prototype-content','ui-scoring','selftest','selftest-boundary','build-artifact','merge-basis','contract-hardening','main-integration-boundary','attention-auto','autopilot-boundary','review-cases','boundary','failure-matrix','workflow','regression','visual','design-visual'].map(v=>'prototype-'+v));
const r27FixedTemplate=()=>({id:'msf-101-claude',machineId:r27ReportScope.machineId,engine:'fixed',program:'/opt/jarvis-development/node/bin/node',args:['/opt/jarvis-development/software-factory/factory-no-model-receipt-r26.mjs'],workspaceRoot:'/home/superopen/All-Projects/msf-repair-r27',maxRounds:1,timeoutSec:4200,leaseSec:60,budgetCurrency:'USD',purpose:'project-candidate-validation',validation:{program:'/usr/bin/sudo',args:['-n','/usr/local/libexec/jarvis-msf-main-acceptance-r27','{workspace}','{runId}'],timeoutSec:3600}});
function frozenR27ReportingRun(run:any,directory:string){
 if(run.projectId!==r27ReportScope.projectId||run.machineId!==r27ReportScope.machineId||run.agentId!==r27ReportScope.agentId||run.workspace!==r27ReportScope.workspace||run.executorId!=='msf-101-claude'||run.scope!=='personal'||run.purpose!=='project-candidate-validation'||run.budgetUSD!==0||run.maxRounds!==1||run.timeoutSec!==4200||run.domain!=='tasks'||run.kind!=='development'||!['succeeded','failed'].includes(run.status)||run.stopRequested===true||run.result?.lateEvidenceOnly===true||run.result?.source!=='signed-agent')return false;
 let db:DatabaseSync|undefined;try{
  db=new DatabaseSync(join(directory,'execution.sqlite'),{readOnly:true});
  const row=db.prepare('SELECT json,status,agent_id FROM execution_runs WHERE id=? AND owner_id=?').get(run.id,'server-admin');if(!row||row.status!==run.status||row.agent_id!==run.agentId)return false;
  const raw=JSON.parse(String(row.json));
  return ['id','taskId','objectId','projectId','machineId','workspace','executorId','scope','domain','kind','purpose','budgetUSD','maxRounds','timeoutSec'].every(k=>raw[k]===run[k])&&raw.taskId===raw.objectId&&canonical(raw.result)===canonical(run.result)&&canonical(raw.template)===canonical(r27FixedTemplate());
 }catch{return false;}finally{db?.close();}
}
const r28FixedTemplate=()=>{const previous=r27FixedTemplate();return {...previous,engine:'fixed' as const,purpose:'project-candidate-validation' as const,budgetCurrency:'USD' as const,validation:{...previous.validation,args:['-n','/usr/local/libexec/jarvis-msf-main-acceptance-r28','{workspace}','{runId}']}};};
function frozenR28ReportingRun(run:any,directory:string){
 if(run.projectId!==r27ReportScope.projectId||run.machineId!==r27ReportScope.machineId||run.agentId!==r27ReportScope.agentId||run.workspace!==r27ReportScope.workspace||run.executorId!=='msf-101-claude'||run.scope!=='personal'||run.purpose!=='project-candidate-validation'||run.budgetUSD!==0||run.maxRounds!==1||run.timeoutSec!==4200||run.domain!=='tasks'||run.kind!=='development'||!['succeeded','failed'].includes(run.status)||run.stopRequested===true||run.result?.lateEvidenceOnly===true||run.result?.source!=='signed-agent'||!run.result?.validation)return false;
 let db:DatabaseSync|undefined;try{
  db=new DatabaseSync(join(directory,'execution.sqlite'),{readOnly:true});
  const row=db.prepare('SELECT json,status,agent_id FROM execution_runs WHERE id=? AND owner_id=?').get(run.id,'server-admin');if(!row||row.status!==run.status||row.agent_id!==run.agentId)return false;
  const raw=JSON.parse(String(row.json));
  validateCandidateValidationRun(r28FixedTemplate(),raw);
  return raw.stopRequested!==true&&['id','taskId','objectId','projectId','machineId','workspace','executorId','scope','domain','kind','purpose','budgetUSD','maxRounds','timeoutSec'].every(k=>raw[k]===run[k])&&raw.taskId===raw.objectId&&canonical(raw.result)===canonical(run.result)&&canonical(raw.template)===canonical(r28FixedTemplate());
 }catch{return false;}finally{db?.close();}
}
function fixedReport(run:any,executionDirectory:string){
 const result=run.result,validation=result?.validation??run.validation,json=validation?.autonomyReportJson;
 if(result?.source!=='signed-agent'||result?.lateEvidenceOnly||typeof json!=='string'||json.length>2*1024*1024||
  createHash('sha256').update(json).digest('hex')!==validation?.autonomyReportSha256)return null;
 let parsed,scoped=false;try{const value=JSON.parse(json);scoped=value.workspace===r27ReportScope.workspace||['scopeExceptions','authenticationPolicy','sandboxImageContract','productObjectivesAccepted'].some(k=>Object.hasOwn(value,k));if(scoped){if(value.authenticationPolicy===r28AuthenticationMode){if(!frozenR28ReportingRun(run,executionDirectory))return null;parsed=r28ScopedReportDisplaySchema.safeParse(value);}else{if(!frozenR27ReportingRun(run,executionDirectory))return null;parsed=r27ScopedReportDisplaySchema.safeParse(value);}}else parsed=projectAutonomyValidationSchema.safeParse(value);}catch{return null;}
 if(!parsed.success||parsed.data.runId!==run.id||parsed.data.workspace!==run.workspace||new Set(parsed.data.checks.map(c=>c.id)).size!==parsed.data.checks.length)return null;
 const checks=parsed.data.checks.map(c=>({id:c.id,required:c.required,executed:c.executed,status:c.status,exitCode:c.exitCode,tests:c.tests??null}));
 const testGroups=checks.filter(c=>c.executed&&c.tests).map(c=>({checkId:c.id,tests:c.tests!}));
 if(testGroups.some(g=>g.tests.total!==g.tests.passed+g.tests.failed+g.tests.skipped+g.tests.unknown))return null;
 const prototypes=checks.filter(c=>originalPrototypeIds.has(c.id)),prototypeChecks={total:30,observed:prototypes.length,passed:prototypes.filter(c=>c.executed&&c.status==='pass').length,failed:prototypes.filter(c=>c.executed&&c.status==='fail').length,skipped:prototypes.filter(c=>c.executed&&c.status==='skip').length,unknown:30-prototypes.filter(c=>c.executed&&c.status!=='unknown').length};
 return {kind:parsed.data.kind,status:parsed.data.status,reportSha256:validation.autonomyReportSha256,sourceFingerprint:parsed.data.sourceFingerprint,
  checks,testGroups,testsCounts:testGroups.length===1?testGroups[0].tests:null,...(scoped||prototypes.length?{prototypeChecks}:{}),independentAcceptance:false,
  ...(scoped?{scopedValidation:true,negativeLogin401Deferred:true,scopeExceptions:(parsed.data as z.infer<typeof r27ScopedReportDisplaySchema>|z.infer<typeof r28ScopedReportDisplaySchema>).scopeExceptions,authenticationPolicy:(parsed.data as z.infer<typeof r27ScopedReportDisplaySchema>|z.infer<typeof r28ScopedReportDisplaySchema>).authenticationPolicy,productObjectivesAccepted:false}: {})};
}
function resultView(run:any,executionDirectory:string){
 const r=run.result;
 return {taskId:run.taskId??run.objectId,runId:run.id,status:run.status,at:run.updatedAt??run.createdAt??null,
  outcome:typeof r?.outcome==='string'&&/^[a-z-]{1,80}$/.test(r.outcome)?r.outcome:null,
  exitCode:Number.isInteger(r?.exitCode)?r.exitCode:null,
  validationExitCode:Number.isInteger(r?.validation?.exitCode)?r.validation.exitCode:null,
  source:typeof r?.source==='string'&&/^[a-z-]{1,80}$/.test(r.source)?r.source:null,
  lateEvidenceOnly:r?.lateEvidenceOnly===true,stopRequested:run.stopRequested===true,
  summary:typeof r?.summary==='string'?redactExecutionLog(r.summary).slice(0,1000):null,
  fixedReport:fixedReport(run,executionDirectory)};
}
/** Read-only projection: execution completion never claims independent acceptance. */
const newer=(a:any,b:any)=>String(b.createdAt??b.updatedAt??'').localeCompare(String(a.createdAt??a.updatedAt??''))||String(b.updatedAt??'').localeCompare(String(a.updatedAt??''));
export function supervisionStepState(runs:any[],taskCount:number,missingBindings:boolean,expectedTaskIds:string[]=[]){
 if(missingBindings)return 'unavailable';
 if(runs.some(r=>r.status==='running'))return 'running';
 if(runs.some(r=>r.status==='queued'))return 'queued';
 if(!runs.length)return taskCount?'awaiting-execution':'planned';
 const byTask=new Map<string,any>();
 for(const run of [...runs].sort(newer).reverse())byTask.set(run.taskId??run.objectId,run);
 if(expectedTaskIds.some(taskId=>!byTask.has(taskId)))return 'awaiting-execution';
 const current=[...byTask.values()];
 if(current.some(r=>r.result?.lateEvidenceOnly||r.stopRequested||r.status==='cancelled'))return 'stopped';
 if(current.some(r=>!terminal.has(r.status)))return 'unknown';
 if(current.some(r=>r.status!=='succeeded'||r.result?.outcome!=='success'||r.result?.exitCode!==0||r.result?.validation?.exitCode!=null&&r.result.validation.exitCode!==0))return 'needs-attention';
 return 'execution-finished';
}

/** Separate append-only planning ledger. No dispatcher, model or autonomy mutation. */
export class ProjectSupervisionPlanRuntime {
 private db:DatabaseSync;private closed=false;
 constructor(readonly repository:Pick<V1Repository,'read'|'list'>,readonly execution:SupervisionPlanExecutionReader,readonly options:SupervisionPlanOptions){
  mkdirSync(options.directory,{recursive:true});this.db=new DatabaseSync(join(options.directory,'supervision-plans.sqlite'));
  this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS supervision_plans(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,owner_id TEXT NOT NULL,current_revision INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS supervision_plan_revisions(seq INTEGER PRIMARY KEY AUTOINCREMENT,plan_id TEXT NOT NULL,revision INTEGER NOT NULL,json TEXT NOT NULL,UNIQUE(plan_id,revision));
   CREATE TABLE IF NOT EXISTS supervision_plan_commands(actor_id TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(actor_id,id));
   CREATE TRIGGER IF NOT EXISTS supervision_plan_history_no_update BEFORE UPDATE ON supervision_plan_revisions BEGIN SELECT RAISE(ABORT,'Plan history is immutable');END;
   CREATE TRIGGER IF NOT EXISTS supervision_plan_history_no_delete BEFORE DELETE ON supervision_plan_revisions BEGIN SELECT RAISE(ABORT,'Plan history is immutable');END;`);
 }
 private project(projectId:string,actorId:string){const p=this.repository.read('projects',projectId,actorId);if(!p||p.ownerId!==actorId)fail('项目不存在或不可访问','NOT_FOUND',404);return p;}
 private writable(projectId:string,p:SupervisionPlanPrincipal){if(!p.administrator)fail('只有管理员可以安排监管计划','ADMIN_REQUIRED',403);const project=this.project(projectId,p.actorId);if(project.status==='archived')fail('归档项目不能修改计划','CONFLICT',409);return project;}
 private current(projectId:string,actorId:string,planId:string):ProjectSupervisionPlan{
  const r=this.db.prepare('SELECT r.json FROM supervision_plans p JOIN supervision_plan_revisions r ON r.plan_id=p.id AND r.revision=p.current_revision WHERE p.id=? AND p.project_id=? AND p.owner_id=?').get(planId,projectId,actorId);
  if(!r)fail('监管计划不存在或不可访问','NOT_FOUND',404);return JSON.parse(String(r.json));
 }
 private task(project:BusinessRecord,taskId:string){const task=this.repository.read('tasks',taskId,project.ownerId);return task?.projectId===project.id&&task.scope===project.scope?task:undefined;}
 private validRun(project:BusinessRecord,run:any){const task=run&&this.task(project,run.taskId??run.objectId);return !!task&&run.domain==='tasks'&&run.projectId===project.id&&(!task.machineId||run.machineId===task.machineId)&&(!task.worktree||run.workspace===task.worktree);}
 private validateBody(project:BusinessRecord,body:Body){
  if(!unique(body.steps.map(s=>s.id))||body.currentStepId!==null&&!body.steps.some(s=>s.id===body.currentStepId))fail('步骤编号或当前步骤无效');
  for(const step of body.steps){
   if(!unique(step.taskIds)||!unique(step.runIds))fail('步骤绑定不能重复');
   if(step.taskIds.some(taskId=>!this.task(project,taskId)))fail('任务不属于此项目或范围','SUPERVISION_BINDING_INVALID',409);
   if(step.runIds.some(runId=>!this.validRun(project,this.execution.getRun(runId))))fail('运行不属于此项目或任务','SUPERVISION_BINDING_INVALID',409);
  }
 }
 private transaction<T>(work:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const r=work();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 private append(snapshot:Omit<ProjectSupervisionPlan,'hash'>){const plan={...snapshot,hash:sha(snapshot)};
  this.db.prepare('INSERT INTO supervision_plan_revisions(plan_id,revision,json) VALUES(?,?,?)').run(plan.planId,plan.revision,JSON.stringify(plan));
  this.db.prepare('INSERT INTO supervision_plans VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET current_revision=excluded.current_revision').run(plan.planId,plan.projectId,plan.ownerId,plan.revision);return plan;
 }
 private command(projectId:string,principal:SupervisionPlanPrincipal,operation:string,input:any,work:(project:BusinessRecord)=>ProjectSupervisionPlan){
  const project=this.writable(projectId,principal);publicInput(input);const fingerprint=sha({projectId,operation,input});
  return this.transaction(()=>{const old=this.db.prepare('SELECT fingerprint,response FROM supervision_plan_commands WHERE actor_id=? AND id=?').get(principal.actorId,input.commandId);
   if(old){if(old.fingerprint!==fingerprint)fail('提交编号已用于其他操作','CONFLICT',409);return JSON.parse(String(old.response)) as ProjectSupervisionPlan;}
   const value=work(project);this.db.prepare('INSERT INTO supervision_plan_commands VALUES(?,?,?,?)').run(principal.actorId,input.commandId,fingerprint,JSON.stringify(value));return value;});
 }
 create(projectId:string,input:unknown,principal:SupervisionPlanPrincipal){const parsed=projectSupervisionPlanCreateSchema.parse(input);
  return this.command(projectId,principal,'create',parsed,project=>{const {commandId,expectedVersion,supersedesPlanId,supersedesRevision,...body}=parsed;this.validateBody(project,body);
   if((supersedesPlanId===null)!==(supersedesRevision===null))fail('替代计划须同时指定原计划和版本');
   if(body.goalBasis==='plan'&&!supersedesPlanId)fail('使用自身目标须明确替代的原计划和版本');
   if(supersedesPlanId&&this.current(projectId,principal.actorId,supersedesPlanId).revision!==supersedesRevision)fail('原计划已更新，请刷新后安排','CONFLICT',409);
   const now=new Date().toISOString();return this.append({...body,planId:randomUUID(),projectId,ownerId:project.ownerId,scope:project.scope,revision:1,createdAt:now,updatedAt:now,supersedesPlanId,supersedesRevision,revisionReason:'建立监管计划',previousHash:'0'.repeat(64)});});
 }
 revise(projectId:string,planId:string,input:unknown,principal:SupervisionPlanPrincipal){const parsed=projectSupervisionPlanRevisionSchema.parse(input);
  return this.command(projectId,principal,'revise:'+planId,parsed,project=>{const old=this.current(projectId,principal.actorId,planId);if(old.revision!==parsed.expectedVersion)fail('计划已更新，请刷新后提交','CONFLICT',409);
   const {commandId,expectedVersion,reason,...body}=parsed;this.validateBody(project,body);const {hash:previousHash,...snapshot}=old;
   return this.append({...snapshot,...body,revision:old.revision+1,updatedAt:new Date().toISOString(),revisionReason:reason,previousHash});});
 }
 private projectView(plan:ProjectSupervisionPlan,project:BusinessRecord){
  const resultViewBound=(run:any)=>resultView(run,this.options.executionDirectory??join(dirname(this.options.directory),'execution')); 
  const allRuns=new Map<string,any>();
  const steps=plan.steps.map(step=>{const runs=new Map<string,any>(),missingBindings:string[]=[];
   for(const taskId of step.taskIds){const task=this.task(project,taskId);if(!task){missingBindings.push(taskId);continue;}for(const run of this.execution.runsForTask(taskId)){if(this.validRun(project,run))runs.set(run.id,run);else missingBindings.push(run.id);}}
   for(const runId of step.runIds){const run=this.execution.getRun(runId);if(this.validRun(project,run))runs.set(run.id,run);else missingBindings.push(runId);}
   for(const run of runs.values())allRuns.set(run.id,run);
   const ordered=[...runs.values()].sort(newer);
   const latest=ordered[0];return {...step,state:supervisionStepState(ordered,step.taskIds.length,!!missingBindings.length,step.taskIds),
    activeRunIds:ordered.filter(r=>active.has(r.status)).map(r=>r.id),latestResult:latest?resultViewBound(latest):null,
    missingBindings:[...new Set(missingBindings)],runs:ordered.map(resultViewBound),independentAcceptance:false};
  });
  const orderedRuns=[...allRuns.values()].sort(newer),latest=orderedRuns[0],currentRun=orderedRuns.find(r=>active.has(r.status));
  const anomalies=steps.flatMap(s=>[...s.missingBindings.map(binding=>({stepId:s.id,code:'BINDING_UNAVAILABLE',binding})),...s.runs.filter(r=>r.lateEvidenceOnly||r.status==='cancelled'||r.exitCode!==null&&r.exitCode!==0||['failed','timeout','interrupted'].includes(r.status)).map(r=>({stepId:s.id,code:r.lateEvidenceOnly?'LATE_EVIDENCE_ONLY':r.status==='cancelled'?'RUN_CANCELLED':'RUN_FAILED',runId:r.runId}))]);
  let knownCostUSD=0,unknownCostRuns=0,knownTokens=0,unknownTokenRuns=0;
  for(const run of allRuns.values()){const usage=run.result?.usage,amount=usage?.knownCostUSD??usage?.costUSD;
   if(typeof amount==='number'&&Number.isFinite(amount)&&amount>=0)knownCostUSD+=amount;
   if(typeof usage?.costUSD!=='number'||!Number.isFinite(usage.costUSD)||usage.costUSD<0||usage.usageComplete===false||usage.costComplete===false)unknownCostRuns++;
   const tokens=usage?.totalTokens??(usage?.inputTokens+usage?.outputTokens);
   if(Number.isSafeInteger(tokens)&&tokens>=0)knownTokens+=tokens;
   if(!Number.isSafeInteger(tokens)||tokens<0||usage.usageComplete===false)unknownTokenRuns++;
  }
  const ownGoals=plan.goalBasis==='plan'&&!!plan.supersedesPlanId;
  const profile=ownGoals?null:this.options.autonomy?.(project.id,project.ownerId);
  const requiredIds=Array.isArray(profile?.spec?.objectives)?new Set<string>(profile.spec.objectives.filter((o:any)=>o.required!==false&&typeof o.id==='string').map((o:any)=>o.id)):null;
  const verifiedIds=requiredIds&&Array.isArray(profile?.verifiedObjectiveIds)?[...new Set<string>(profile.verifiedObjectiveIds.filter((v:any)=>typeof v==='string'&&requiredIds.has(v)))]:null;
  // Only an explicitly version-bound goal replacement stops inheriting autonomy goals.
  // Execution receipts and step counts are not independent acceptance mappings.
  const independentProgress=ownGoals?{available:false,status:null,reason:null,revision:null,goalSpecHash:null,totalObjectives:null,verifiedObjectives:null,verifiedObjectiveIds:null}:profile?{available:true,status:profile.status??null,reason:profile.reason??null,revision:profile.revision??null,goalSpecHash:profile.goalSpecHash??null,
   totalObjectives:requiredIds?.size??null,verifiedObjectives:verifiedIds?.length??null,verifiedObjectiveIds:verifiedIds}:null;
  return {...plan,steps,stageViews:steps,currentStep:steps.find(s=>s.id===plan.currentStepId)??null,activeStepIds:steps.filter(s=>s.activeRunIds.length).map(s=>s.id),active:!!currentRun,
   currentExecution:currentRun?{taskId:currentRun.taskId??currentRun.objectId,runId:currentRun.id,status:currentRun.status,machineId:currentRun.machineId??null,workspace:currentRun.workspace??null}:null,
   latestResult:latest?resultViewBound(latest):null,anomalies,independentProgress,
   usage:{scope:'bound-runs',costPolicy:'record-only',knownCostUSD,unknownCostRuns,knownTokens,unknownTokenRuns,runCount:allRuns.size},
   automaticDispatch:false,globalSupervisionChanged:false,independentAcceptance:false};
 }
 get(projectId:string,actorId:string,planId?:string){const project=this.project(projectId,actorId);
  if(!planId){const row=this.db.prepare('SELECT p.id FROM supervision_plans p JOIN supervision_plan_revisions r ON r.plan_id=p.id AND r.revision=p.current_revision WHERE p.project_id=? AND p.owner_id=? ORDER BY r.seq DESC LIMIT 1').get(projectId,actorId);if(!row)return null;planId=String(row.id);}
  const plan=this.current(projectId,actorId,planId),revisions=this.db.prepare('SELECT json FROM supervision_plan_revisions WHERE plan_id=? ORDER BY revision').all(planId).map(row=>JSON.parse(String(row.json)) as ProjectSupervisionPlan);
  return {...this.projectView(plan,project),revisions};
 }
 list(projectId:string,actorId:string,{offset=0,limit=25}:{offset?:number;limit?:number}={}){const project=this.project(projectId,actorId);
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)fail('分页参数无效');
  const total=Number(this.db.prepare('SELECT count(*) AS n FROM supervision_plans WHERE project_id=? AND owner_id=?').get(projectId,actorId)?.n??0);
  const rows=this.db.prepare('SELECT r.json FROM supervision_plans p JOIN supervision_plan_revisions r ON r.plan_id=p.id AND r.revision=p.current_revision WHERE p.project_id=? AND p.owner_id=? ORDER BY r.seq DESC LIMIT ? OFFSET ?').all(projectId,actorId,limit,offset);
  return {items:rows.map(row=>this.projectView(JSON.parse(String(row.json)),project)),total,offset,limit,nextOffset:offset+rows.length<total?offset+rows.length:null};
 }
 close(){if(!this.closed){this.db.close();this.closed=true;}}
}
