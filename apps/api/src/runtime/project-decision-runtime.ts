import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {BusinessError} from '../v1/types.js';
import type {V1Repository} from '../v1/repository.js';
import {assertPublicSupervisorContent} from './public-privacy-guard.js';

const text=(max=2000)=>z.string().trim().min(1).max(max);
const identifier=text(200),hash=z.string().regex(/^[a-f0-9]{64}$/);
const strings=(max=1000,count=100)=>z.array(text(max)).max(count);
const nullableId=identifier.nullable().default(null);
const origin=z.enum(['human','ai','rule']);
const evidence=z.object({reference:text(2000),sha256:hash.nullable().default(null),kind:z.enum(['observation','self-report','test-report','source','requirement'])}).strict();
const context=z.object({
 observedAt:z.iso.datetime(),goalSpecHash:hash.nullable().default(null),sourceFingerprint:hash.nullable().default(null),
 sourceVersion:text(500).nullable().default(null),runId:nullableId,taskId:nullableId,machineId:nullableId,
 objectives:strings(200,1000).default([]),constraints:strings(2000).default([]),situation:text(8000),
}).strict();
const option=z.object({
 id:identifier,title:text(500),advantages:strings(2000,30),disadvantages:strings(2000,30),impact:text(4000),
 compliesWithGoals:z.enum(['yes','no','unknown']),withinAuthority:z.enum(['yes','no','unknown']),
 environmentEvidence:z.enum(['available','missing','unknown']),missingEvidence:strings(2000,30),
 reversibility:z.enum(['reversible','bounded','irreversible','unknown']),
 coveredObjectives:strings(200,1000),operationalImpact:z.number().int().min(0).max(3),
}).strict();
const rollback=z.object({plan:text(8000),triggers:strings(2000,30),impact:text(4000),requiresNewExecutionPlan:z.literal(true).default(true)}).strict();
const action=z.object({summary:text(4000),at:z.iso.datetime(),state:z.enum(['planned','performed','failed']),evidenceRefs:z.array(evidence).max(100)}).strict();
const recordFields={
 questionSummary:text(4000),context,options:z.array(option).min(1).max(30),chosenId:identifier.nullable().default(null),
 decisionRationale:text(8000),basisRefs:z.array(evidence).max(100),risk:z.enum(['low','medium','high','unknown']),
 affectedObjectives:strings(200,1000),rollbackPlan:rollback,actions:z.array(action).max(100).default([]),
 status:z.enum(['proposed','selected','implemented']).default('proposed'),origin,
};
export const projectDecisionRecordSchema=z.object({
 ...recordFields,commandId:z.string().uuid(),expectedVersion:z.literal(0),changeOf:nullableId,
}).strict();
const selectionSchema=z.object({commandId:z.string().uuid(),expectedVersion:z.number().int().positive(),mode:z.enum(['recommended','explicit']),
 chosenId:identifier.optional(),decisionRationale:text(8000),basisRefs:z.array(evidence).max(100),origin,reason:text(4000)}).strict();
const implementationSchema=z.object({commandId:z.string().uuid(),expectedVersion:z.number().int().positive(),actions:z.array(action).min(1).max(100),reason:text(4000),origin}).strict();
export const projectDecisionChangeSchema=z.object({...recordFields,commandId:z.string().uuid(),expectedVersion:z.number().int().positive(),reason:text(4000)}).strict();
export const projectDecisionRecommendationSchema=z.object({context,options:z.array(option).min(1).max(30)}).strict();
type Option=z.infer<typeof option>;
type Context=z.infer<typeof context>;
type DecisionBody=Omit<z.infer<typeof projectDecisionRecordSchema>,'commandId'|'expectedVersion'|'changeOf'>;
export interface DecisionRecommendation {
 algorithm:'bounded-evidence-r1';chosenId:string|null;status:'recommended'|'needs-evidence'|'ambiguous';
 candidates:{id:string;eligible:boolean;reasons:string[];rank:number[]|null}[];
 rationale:string;independentAcceptance:false;usesPaidModel:false;
}
export type ProjectDecision=Omit<DecisionBody,'status'>&{
 id:string;projectId:string;revision:number;createdAt:string;updatedAt:string;status:'proposed'|'selected'|'implemented'|'superseded';
 changeOf:string|null;changeOfRevision:number|null;supersededBy:string|null;recommendation:DecisionRecommendation;selfReported:boolean;independentAcceptance:false;
 previousHash:string;hash:string;revisionReason:string;
};
function fail(message:string,code='DECISION_INVALID',status=400):never {throw new BusinessError(code,message,status)}
function canonical(value:any):string {if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}'}
const sha=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
/** Summaries only. Credentials and private references are rejected before persistence. */
function publicSummary(value:unknown):void {try{assertPublicSupervisorContent(value);}catch(error){if(error instanceof BusinessError)fail(error.message,'DECISION_PRIVATE_CONTENT');throw error;}}
function uniqueOptions(options:Option[],ctx:Context){
 if(new Set(options.map(o=>o.id)).size!==options.length)fail('备选方案编号重复');
 if(new Set(ctx.objectives).size!==ctx.objectives.length)fail('目标编号重复');
 for(const o of options){if(new Set(o.coveredObjectives).size!==o.coveredObjectives.length||o.coveredObjectives.some(id=>!ctx.objectives.includes(id)))fail('备选方案目标覆盖不在当时目标范围内');}
}
/** A finite rule ranks supplied, evidenced options; it invents no options or environment facts. */
export function recommendProjectDecision(input:unknown):DecisionRecommendation {
 const parsed=projectDecisionRecommendationSchema.parse(input);publicSummary(parsed);uniqueOptions(parsed.options,parsed.context);
 const candidates=parsed.options.map(o=>{
  const reasons:string[]=[];
  if(o.compliesWithGoals!=='yes')reasons.push(o.compliesWithGoals==='no'?'CONFLICTS_WITH_FROZEN_GOALS':'GOAL_COMPLIANCE_UNKNOWN');
  if(o.withinAuthority!=='yes')reasons.push(o.withinAuthority==='no'?'OUTSIDE_AUTHORITY':'AUTHORITY_UNKNOWN');
  if(o.environmentEvidence!=='available'||o.missingEvidence.length)reasons.push('ENVIRONMENT_EVIDENCE_MISSING');
  if(o.reversibility==='unknown')reasons.push('REVERSIBILITY_UNKNOWN');
  if(parsed.context.objectives.some(id=>!o.coveredObjectives.includes(id)))reasons.push('REQUIRED_OBJECTIVE_NOT_COVERED');
  const eligible=reasons.length===0;
  const rank=eligible?[{reversible:0,bounded:1,irreversible:2,unknown:3}[o.reversibility],o.operationalImpact]:null;
  return {id:o.id,eligible,reasons,rank};
 });
 const eligible=candidates.filter(c=>c.eligible).sort((a,b)=>a.rank![0]-b.rank![0]||a.rank![1]-b.rank![1]);
 const tied=eligible.length>1&&eligible[0].rank!.every((v,i)=>v===eligible[1].rank![i]);
 const chosenId=eligible.length&&!tied?eligible[0].id:null;
 return {algorithm:'bounded-evidence-r1',chosenId,status:chosenId?'recommended':eligible.length?'ambiguous':'needs-evidence',candidates,
  rationale:chosenId?'在已提供的事实中，该方案覆盖全部目标、符合授权，优先可逆性，再比较运行影响。':tied?'同等可逆性与运行影响的方案尚无法区分，需补充依据。':'尚无同时满足目标、授权、环境依据和可逆性边界的方案。',
  independentAcceptance:false,usesPaidModel:false};
}

/** No command here starts, resumes, restores or stops an executor. Selection is an auditable instruction basis. */
export class ProjectDecisionRuntime {
 private db:DatabaseSync;private closed=false;
 constructor(readonly repository:V1Repository,readonly options:{directory:string;actorId?:string}){
  mkdirSync(options.directory,{recursive:true});this.db=new DatabaseSync(join(options.directory,'decisions.sqlite'));
  this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS project_decisions(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,current_revision INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS project_decision_revisions(seq INTEGER PRIMARY KEY AUTOINCREMENT,decision_id TEXT NOT NULL,project_id TEXT NOT NULL,revision INTEGER NOT NULL,json TEXT NOT NULL,UNIQUE(decision_id,revision));
   CREATE INDEX IF NOT EXISTS project_decision_revisions_project ON project_decision_revisions(project_id,seq);
   CREATE TABLE IF NOT EXISTS project_decision_commands(actor_id TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(actor_id,id));
   CREATE TRIGGER IF NOT EXISTS project_decision_no_revision_update BEFORE UPDATE ON project_decision_revisions BEGIN SELECT RAISE(ABORT,'Decision history is immutable');END;
   CREATE TRIGGER IF NOT EXISTS project_decision_no_revision_delete BEFORE DELETE ON project_decision_revisions BEGIN SELECT RAISE(ABORT,'Decision history is immutable');END;`);
 }
 get actor(){return this.options.actorId??'server-admin'}
 private project(id:string){if(!this.repository.read('projects',id,this.actor))fail('项目不存在或不可访问','NOT_FOUND',404);}
 private transaction<T>(work:()=>T){this.db.exec('BEGIN IMMEDIATE');try{const result=work();this.db.exec('COMMIT');return result}catch(error){this.db.exec('ROLLBACK');throw error}}
 private current(projectId:string,id:string):ProjectDecision {
  const row=this.db.prepare('SELECT r.json FROM project_decisions d JOIN project_decision_revisions r ON r.decision_id=d.id AND r.revision=d.current_revision WHERE d.id=? AND d.project_id=?').get(id,projectId);
  if(!row)fail('决策记录不存在或不属于此项目','NOT_FOUND',404);return JSON.parse(String(row.json));
 }
 private append(snapshot:Omit<ProjectDecision,'hash'>):ProjectDecision {
  const result={...snapshot,hash:sha(snapshot)};
  this.db.prepare('INSERT INTO project_decision_revisions(decision_id,project_id,revision,json) VALUES(?,?,?,?)').run(result.id,result.projectId,result.revision,JSON.stringify(result));
  this.db.prepare('INSERT INTO project_decisions(id,project_id,current_revision) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET current_revision=excluded.current_revision').run(result.id,result.projectId,result.revision);
  return result;
 }
 private command(projectId:string,operation:string,commandId:string,input:unknown,work:()=>ProjectDecision):ProjectDecision {
  this.project(projectId);publicSummary(input);const fingerprint=sha({projectId,operation,input});
  return this.transaction(()=>{
   const prior=this.db.prepare('SELECT fingerprint,response FROM project_decision_commands WHERE actor_id=? AND id=?').get(this.actor,commandId);
   if(prior){if(prior.fingerprint!==fingerprint)fail('同一提交编号不能用于不同决策操作','CONFLICT',409);return JSON.parse(String(prior.response));}
   const result=work();this.db.prepare('INSERT INTO project_decision_commands VALUES(?,?,?,?)').run(this.actor,commandId,fingerprint,JSON.stringify(result));return result;
  });
 }
 private validateBody(body:DecisionBody){
  uniqueOptions(body.options,body.context);
  if(body.affectedObjectives.some(id=>!body.context.objectives.includes(id))||new Set(body.affectedObjectives).size!==body.affectedObjectives.length)fail('受影响目标必须来自当时目标范围');
  if((body.status==='proposed')!==(body.chosenId===null))fail('待选状态须没有已选方案；已选或实施状态须记录方案');
  if(body.chosenId){
   const selected=body.options.find(o=>o.id===body.chosenId);if(!selected)fail('已选方案不在备选列表内');
   if(selected.compliesWithGoals==='no'||selected.withinAuthority==='no')fail('不能选定已声明违背目标或授权的方案');
   const recommendation=recommendProjectDecision({context:body.context,options:body.options});
   if(body.origin!=='human'&&!recommendation.candidates.find(c=>c.id===selected.id)?.eligible)fail('自主选择缺少目标、授权或环境依据','DECISION_EVIDENCE_REQUIRED',409);
  }
  if(body.actions.some(a=>a.state==='performed'&&!a.evidenceRefs.length))fail('实际动作必须保留证据引用');
  if(body.status==='implemented'&&!body.actions.some(a=>a.state==='performed'&&a.evidenceRefs.length))fail('已实施状态必须有实际动作及证据引用；选择不代表实施');
  if(body.status!=='implemented'&&body.actions.some(a=>a.state==='performed'))fail('存在实际完成动作时应明确登记实施状态');
 }
 private create(projectId:string,body:DecisionBody,changeOf:string|null,reason:string,changeOfRevision:number|null=null):ProjectDecision {
  this.validateBody(body);const now=new Date().toISOString();
  return this.append({...body,id:randomUUID(),projectId,revision:1,createdAt:now,updatedAt:now,changeOf,changeOfRevision,supersededBy:null,
   recommendation:recommendProjectDecision({context:body.context,options:body.options}),selfReported:body.origin==='ai',independentAcceptance:false,
   previousHash:'0'.repeat(64),revisionReason:reason});
 }
 list(projectId:string,{offset=0,limit=25}: {offset?:number;limit?:number}={}){
  this.project(projectId);if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)fail('分页参数无效');
  const total=Number(this.db.prepare('SELECT COUNT(*) AS n FROM project_decisions WHERE project_id=?').get(projectId)?.n??0);
  const rows=this.db.prepare('SELECT r.json FROM project_decisions d JOIN project_decision_revisions r ON r.decision_id=d.id AND r.revision=d.current_revision WHERE d.project_id=? ORDER BY r.seq DESC LIMIT ? OFFSET ?').all(projectId,limit,offset);
  return {items:rows.map(r=>JSON.parse(String(r.json)) as ProjectDecision),total,offset,limit,nextOffset:offset+rows.length<total?offset+rows.length:null};
 }
 get(projectId:string,id:string){this.project(projectId);const value=this.current(projectId,id);const revisions=this.db.prepare('SELECT json FROM project_decision_revisions WHERE decision_id=? AND project_id=? ORDER BY revision').all(id,projectId).map(r=>JSON.parse(String(r.json)) as ProjectDecision);return {...value,revisions};}
 record(projectId:string,input:unknown){
  const parsed=projectDecisionRecordSchema.parse(input);const {commandId,expectedVersion:_,changeOf,...body}=parsed;
  if(changeOf!==null)fail('修改既有决策请使用带旧版本检查的变更入口');
  return this.command(projectId,'record',commandId,parsed,()=>this.create(projectId,body,null,'记录当时的问题与选择'));
 }
 select(projectId:string,id:string,input:unknown){
  const parsed=selectionSchema.parse(input);
  return this.command(projectId,'select:'+id,parsed.commandId,parsed,()=>{
   const old=this.current(projectId,id);if(old.revision!==parsed.expectedVersion)fail('决策已更新，请刷新后提交','CONFLICT',409);
   if(old.status==='superseded')fail('已替代的历史决策不能重新选定；请登记新的变更','CONFLICT',409);
   if(old.status==='implemented')fail('已实施决策需通过变更入口保留实际动作和回退依据','CONFLICT',409);
   const chosenId=parsed.mode==='recommended'?old.recommendation.chosenId:parsed.chosenId;
   if(!chosenId)fail('尚无唯一、有依据的方案，请补充事实或明确选择','DECISION_EVIDENCE_REQUIRED',409);
   const body={...old,status:'selected' as const,chosenId,actions:chosenId===old.chosenId?old.actions:[],origin:parsed.origin,decisionRationale:parsed.decisionRationale,basisRefs:parsed.basisRefs};this.validateBody(body);
   if(old.changeOf&&old.status==='proposed'){
    const previous=this.current(projectId,old.changeOf);
    if(previous.revision!==old.changeOfRevision||previous.status==='superseded')fail('变更依据已经改变，请从最新决策重新制定变更','CONFLICT',409);
    const {hash:previousHash,...snapshot}=previous;
    this.append({...snapshot,status:'superseded',supersededBy:old.id,revision:previous.revision+1,updatedAt:new Date().toISOString(),previousHash,revisionReason:parsed.reason});
   }
   const {hash:previousHash,...snapshot}=body;
   return this.append({...snapshot,revision:old.revision+1,updatedAt:new Date().toISOString(),previousHash,revisionReason:parsed.reason,selfReported:old.selfReported||parsed.origin==='ai'});
  });
 }
 implementation(projectId:string,id:string,input:unknown){
  const parsed=implementationSchema.parse(input);
  return this.command(projectId,'implementation:'+id,parsed.commandId,parsed,()=>{
   const old=this.current(projectId,id);if(old.revision!==parsed.expectedVersion)fail('决策已更新，请刷新后提交','CONFLICT',409);
   if(!['selected','implemented'].includes(old.status))fail('应先选定有效方案，再登记实际动作','CONFLICT',409);
   const actions=[...old.actions,...parsed.actions];if(actions.length>100)fail('动作数量已超范围，请另记后续决策');
   if(parsed.actions.some(a=>a.state==='performed'&&!a.evidenceRefs.length))fail('实际动作必须保留证据引用');
   const performed=actions.some(a=>a.state==='performed'&&a.evidenceRefs.length),status=performed?'implemented':'selected';
   const {hash:previousHash,...snapshot}=old;
   return this.append({...snapshot,status,actions,origin:parsed.origin,revision:old.revision+1,updatedAt:new Date().toISOString(),previousHash,revisionReason:parsed.reason,selfReported:old.selfReported||parsed.origin==='ai'});
  });
 }
 change(projectId:string,id:string,input:unknown){
  const parsed=projectDecisionChangeSchema.parse(input);const {commandId,expectedVersion,reason,...body}=parsed;
  return this.command(projectId,'change:'+id,commandId,parsed,()=>{
   const old=this.current(projectId,id);if(old.revision!==expectedVersion)fail('原决策已更新，请刷新后提交','CONFLICT',409);
   if(old.status==='superseded')fail('请从当前有效决策创建后续变更','CONFLICT',409);
   const result=this.create(projectId,body,id,reason,old.revision);
   // A proposal is not yet a replacement. No server rollback is performed by this ledger.
   if(result.status!=='proposed'){
    const {hash:previousHash,...snapshot}=old;
    this.append({...snapshot,status:'superseded',supersededBy:result.id,revision:old.revision+1,updatedAt:result.createdAt,previousHash,revisionReason:reason});
   }
   return result;
  });
 }
 recommendation(projectId:string,input:unknown){this.project(projectId);return recommendProjectDecision(input);}
 close(){if(!this.closed){this.db.close();this.closed=true;}}
}
