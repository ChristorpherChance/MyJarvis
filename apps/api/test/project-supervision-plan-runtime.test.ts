import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import type {V1Repository} from '../src/v1/repository.js';
import {ProjectSupervisionPlanRuntime,r27ScopedReportDisplaySchema} from '../src/runtime/project-supervision-plan-runtime.js';
import {projectAutonomyValidationSchema} from '../src/runtime/project-autonomy-evidence.js';

const admin={actorId:'server-admin',administrator:true};
const body=()=>({mode:'acceptance',title:'现有成果验收',goal:'核验已有交付物',steps:[{id:'baseline',title:'现状检查',goal:'真实运行检查',criteria:['固定检查均有证据'],taskIds:[],runIds:[]}],currentStepId:'baseline',nextAction:'按真实结果安排修复'});
const create=(extra:any={})=>({...body(),commandId:randomUUID(),expectedVersion:0,...extra});
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-supervision-plan-'));
 const records=new Map<string,any>([['projects:p',{id:'p',scope:'personal',ownerId:admin.actorId,status:'active'}],['projects:foreign',{id:'foreign',scope:'personal',ownerId:'someone-else'}],['tasks:t',{id:'t',scope:'personal',ownerId:admin.actorId,projectId:'p',machineId:'m',worktree:'/source',status:'completed'}],['tasks:t2',{id:'t2',scope:'personal',ownerId:admin.actorId,projectId:'p',machineId:'m',worktree:'/source'}]]);
 const repository={read(domain:string,id:string,actor:string){const value=records.get(domain+':'+id);return value?.ownerId===actor?value:undefined;},list(){return[];}} as unknown as Pick<V1Repository,'read'|'list'>;
 const runs=new Map<string,any>();const execution={getRun:(id:string)=>runs.get(id),runsForTask:(taskId:string)=>[...runs.values()].filter(r=>r.taskId===taskId)};
 const profile={revision:27,status:'blocked',reason:'OLD_BASELINE_FAILED',spec:{objectives:[{id:'O1'},{id:'O2'}]},verifiedObjectiveIds:['O1']};
 let runtime=new ProjectSupervisionPlanRuntime(repository,execution,{directory,executionDirectory:join(directory,'execution'),autonomy:()=>profile});
 return {directory,records,runs,profile,get runtime(){return runtime;},restart(){runtime.close();runtime=new ProjectSupervisionPlanRuntime(repository,execution,{directory,executionDirectory:join(directory,'execution'),autonomy:()=>profile});},async close(){runtime.close();await rm(directory,{recursive:true,force:true});}};
}
const run=(id:string,status:string,extra:any={})=>({id,domain:'tasks',taskId:'t',projectId:'p',machineId:'m',workspace:'/source',createdAt:'2026-10-11T10:00:00Z',updatedAt:'2026-10-11T10:00:00Z',status,...extra});

test('versioned plans persist hash-linked history, idempotent receipts and distinct replacement plans',async()=>{
 const f=await fixture();try{
  const input=create(),first=f.runtime.create('p',input,admin);assert.deepEqual(f.runtime.create('p',input,admin),first);
  assert.throws(()=>f.runtime.create('p',{...input,title:'different'},admin),/提交编号/);
  const changed=f.runtime.revise('p',first.planId,{...body(),mode:'development',commandId:randomUUID(),expectedVersion:1,reason:'先修复再复验'},admin);
  assert.equal(changed.previousHash,first.hash);assert.equal(changed.revision,2);
  assert.throws(()=>f.runtime.revise('p',first.planId,{...body(),commandId:randomUUID(),expectedVersion:1,reason:'stale'},admin),/已更新/);
  const next=f.runtime.create('p',create({supersedesPlanId:first.planId,supersedesRevision:2}),admin);f.restart();
  assert.equal(f.runtime.get('p',admin.actorId)?.planId,next.planId);assert.equal(f.runtime.get('p',admin.actorId,first.planId)?.revisions.length,2);
  assert.equal(f.runtime.list('p',admin.actorId,{limit:1}).total,2);
  const db=new DatabaseSync(join(f.directory,'supervision-plans.sqlite'));try{assert.throws(()=>db.exec('DELETE FROM supervision_plan_revisions'),/immutable/);}finally{db.close();}
 }finally{await f.close();}
});
test('R48 explicit goal replacement preserves legacy history and never inherits its acceptance denominator',async()=>{
 const f=await fixture();try{
  f.profile.spec.objectives=Array.from({length:74},(_,i)=>({id:'old-'+i}));f.profile.verifiedObjectiveIds=[];
  const profileBefore=JSON.stringify(f.profile),tasksBefore=JSON.stringify([...f.records]),old=f.runtime.create('p',create(),admin);
  const oldView=f.runtime.get('p',admin.actorId,old.planId)!;assert.equal(oldView.independentProgress?.totalObjectives,74);
  assert.throws(()=>f.runtime.create('p',create({goalBasis:'plan'}),admin),/明确替代/);
  const next=f.runtime.create('p',create({goalBasis:'plan',supersedesPlanId:old.planId,supersedesRevision:old.revision,goal:'当前自有目标',steps:[{...body().steps[0],title:'既有成果核验'},{...body().steps[0],id:'repair',title:'后续真实修复'}]}),admin);
  f.restart();const view=f.runtime.get('p',admin.actorId)!;
  assert.equal(view.planId,next.planId);assert.equal(view.goal,'当前自有目标');assert.equal(view.steps[1].title,'后续真实修复');assert.equal(view.steps[1].state,'planned');
  assert.equal(view.independentProgress?.available,false);assert.equal(view.independentProgress?.totalObjectives,null);assert.equal(view.independentProgress?.verifiedObjectives,null);assert.equal(view.independentAcceptance,false);
  assert.deepEqual(f.runtime.get('p',admin.actorId,old.planId),oldView);assert.equal(JSON.stringify(f.profile),profileBefore);assert.equal(JSON.stringify([...f.records]),tasksBefore);
  const revision=f.runtime.revise('p',next.planId,{...body(),commandId:randomUUID(),expectedVersion:1,reason:'保留自身目标来源'},admin);assert.equal(revision.goalBasis,'plan');assert.equal(f.runtime.get('p',admin.actorId)!.independentProgress?.totalObjectives,null);
  const compatible=f.runtime.create('p',create({supersedesPlanId:next.planId,supersedesRevision:2}),admin);assert.equal(f.runtime.get('p',admin.actorId,compatible.planId)!.independentProgress?.totalObjectives,74);
 }finally{await f.close();}
});

test('project ownership, administrator writes and actual task/run binding prevent cross-project disclosure',async()=>{
 const f=await fixture();try{
  assert.throws(()=>f.runtime.create('p',create(),{...admin,administrator:false}),/管理员/);
  assert.throws(()=>f.runtime.get('p','someone-else'),/不可访问/);
  assert.throws(()=>f.runtime.create('foreign',create(),admin),/不可访问/);
  f.runs.set('foreign-run',run('foreign-run','succeeded',{projectId:'foreign'}));
  assert.throws(()=>f.runtime.create('p',create({steps:[{...body().steps[0],runIds:['foreign-run']}]}),admin),/运行不属于/);
  const plan=f.runtime.create('p',create(),admin);assert.throws(()=>f.runtime.get('foreign','someone-else',plan.planId),/不可访问/);
 }finally{await f.close();}
});
test('live task/run changes drive status; manual task completion and plan edits never assert acceptance',async()=>{
 const f=await fixture();try{
  const plan=f.runtime.create('p',create({steps:[{...body().steps[0],taskIds:['t']}]}),admin);
  assert.equal(f.runtime.get('p',admin.actorId,plan.planId)?.steps[0].state,'awaiting-execution');
  f.runs.set('r',run('r','running'));let view=f.runtime.get('p',admin.actorId,plan.planId)!;assert.equal(view.steps[0].state,'running');assert.deepEqual(view.activeStepIds,['baseline']);assert.equal(view.currentExecution?.taskId,'t');assert.equal(view.latestResult?.taskId,'t');
  f.runs.set('r',run('r','failed',{result:{outcome:'failed',exitCode:1,summary:'password=hidden',failureMessages:['private text']}}));
  view=f.runtime.get('p',admin.actorId,plan.planId)!;assert.equal(view.steps[0].state,'needs-attention');assert.equal(view.latestResult?.exitCode,1);assert.ok(view.anomalies.length);assert.doesNotMatch(JSON.stringify(view),/hidden|private text/);
  f.runs.set('r2',run('r2','succeeded',{createdAt:'2026-10-11T11:00:00Z',result:{outcome:'success',exitCode:0}}));
  f.runs.get('r').updatedAt='2026-10-11T12:00:00Z';view=f.runtime.get('p',admin.actorId,plan.planId)!;
  assert.equal(view.steps[0].state,'execution-finished');assert.equal(view.latestResult?.runId,'r2');assert.equal(view.independentAcceptance,false);
  assert.equal(view.independentProgress?.verifiedObjectives,1);assert.equal(view.independentProgress?.totalObjectives,2);assert.equal(view.independentProgress?.status,'blocked');assert.equal(f.profile.status,'blocked');
  assert.throws(()=>f.runtime.revise('p',plan.planId,{...body(),commandId:randomUUID(),expectedVersion:1,reason:'fake',progress:100},admin));
 }finally{await f.close();}
});
test('cancelled late success stays stopped and additional unexecuted tasks keep a step unfinished',async()=>{
 const f=await fixture();try{
  f.runs.set('r',run('r','cancelled',{stopRequested:true,result:{outcome:'success',exitCode:0,lateEvidenceOnly:true}}));
  const plan=f.runtime.create('p',create({steps:[{...body().steps[0],taskIds:['t']}]}),admin);
  assert.equal(f.runtime.get('p',admin.actorId,plan.planId)?.steps[0].state,'stopped');
  f.runs.set('r',run('r','succeeded',{result:{outcome:'success',exitCode:0}}));
  f.runtime.revise('p',plan.planId,{...body(),steps:[{...body().steps[0],taskIds:['t','t2']}],commandId:randomUUID(),expectedVersion:1,reason:'补齐第二任务'},admin);
  assert.equal(f.runtime.get('p',admin.actorId,plan.planId)?.steps[0].state,'awaiting-execution');
 }finally{await f.close();}
});
test('cost record-only accounting deduplicates bound runs and keeps unknown cost and tokens explicit',async()=>{
 const f=await fixture();try{
  f.runs.set('r',run('r','succeeded',{result:{outcome:'success',exitCode:0,usage:{costUSD:0.25,totalTokens:120}}}));f.runs.set('r2',run('r2','failed'));
  const plan=f.runtime.create('p',create({steps:[{...body().steps[0],taskIds:['t'],runIds:['r']}]}),admin),usage=f.runtime.get('p',admin.actorId,plan.planId)!.usage;
  assert.deepEqual(usage,{scope:'bound-runs',costPolicy:'record-only',knownCostUSD:0.25,unknownCostRuns:1,knownTokens:120,unknownTokenRuns:1,runCount:2});
  assert.equal(f.runtime.get('p',admin.actorId,plan.planId)?.automaticDispatch,false);
 }finally{await f.close();}
});
test('removed bindings become unavailable and public planning rejects credentials and duplicate steps',async()=>{
 const f=await fixture();try{
  assert.throws(()=>f.runtime.create('p',create({goal:'api_key=private-value'}),admin),/公开摘要/);
  assert.throws(()=>f.runtime.create('p',create({goal:'https://example.test/?token=private-value'}),admin),/凭据/);
  assert.throws(()=>f.runtime.create('p',create({steps:[body().steps[0],body().steps[0]]}),admin),/步骤编号/);
  const plan=f.runtime.create('p',create({steps:[{...body().steps[0],taskIds:['t']}]}),admin);f.records.delete('tasks:t');
  const view=f.runtime.get('p',admin.actorId,plan.planId)!;assert.equal(view.steps[0].state,'unavailable');assert.equal(view.anomalies[0].code,'BINDING_UNAVAILABLE');
 }finally{await f.close();}
});
test('required-objective progress ignores optional, duplicate and unknown verified identifiers',async()=>{
 const f=await fixture();try{
  (f.profile.spec.objectives as any[]).push({id:'optional',required:false},{id:'O1'});f.profile.verifiedObjectiveIds.push('optional','unknown','O1');
  const plan=f.runtime.create('p',create(),admin),progress=f.runtime.get('p',admin.actorId,plan.planId)!.independentProgress!;
  assert.equal(progress.totalObjectives,2);assert.equal(progress.verifiedObjectives,1);assert.deepEqual(progress.verifiedObjectiveIds,['O1']);
  assert.deepEqual(f.profile.verifiedObjectiveIds,['O1','optional','unknown','O1']);
 }finally{await f.close();}
});
test('partial usage records known amounts and token observations while retaining unknown portions',async()=>{
 const f=await fixture();try{
  f.runs.set('r',run('r','failed',{result:{usage:{knownCostUSD:0.5,costComplete:false,usageComplete:false,inputTokens:20,outputTokens:10}}}));
  const plan=f.runtime.create('p',create({steps:[{...body().steps[0],taskIds:['t']}]}),admin),usage=f.runtime.get('p',admin.actorId,plan.planId)!.usage;
  assert.equal(usage.knownCostUSD,0.5);assert.equal(usage.unknownCostRuns,1);assert.equal(usage.knownTokens,30);assert.equal(usage.unknownTokenRuns,1);
 }finally{await f.close();}
});
test('only signed hash-bound same-run same-workspace fixed reports expose grouped real test counts',async()=>{
 const f=await fixture();try{
  const report={schemaVersion:1,kind:'project-autonomy-validation',status:'fail',simulated:false,runId:'r',workspace:'/source',goalSpecHash:'a'.repeat(64),workPackage:'FA-01',sourceFingerprint:'b'.repeat(64),sourceStable:true,startedAt:'2026-10-11T10:00:00Z',finishedAt:'2026-10-11T11:00:00Z',checks:[{id:'tests',command:'fixed-test',required:true,executed:true,status:'fail',exitCode:1,evidenceSha256:'c'.repeat(64),tests:{total:10,passed:9,failed:1,skipped:0,unknown:0}}],artifacts:[{path:'report',sha256:'d'.repeat(64),bytes:10}]};
  const json=JSON.stringify(report),validation={exitCode:1,autonomyReportJson:json,autonomyReportSha256:createHash('sha256').update(json).digest('hex')};
  f.runs.set('r',run('r','failed',{result:{source:'signed-agent',outcome:'failed',exitCode:1,validation}}));
  const plan=f.runtime.create('p',create({steps:[{...body().steps[0],taskIds:['t']}]}),admin);
  let view=f.runtime.get('p',admin.actorId,plan.planId)!;assert.equal(view.latestResult?.fixedReport?.testsCounts?.total,10);assert.equal(view.latestResult?.fixedReport?.checks[0].status,'fail');
  f.runs.get('r').result.source='local-pi-sdk';assert.equal(f.runtime.get('p',admin.actorId,plan.planId)?.latestResult?.fixedReport,null);f.runs.get('r').result.source='signed-agent';
  validation.autonomyReportJson=JSON.stringify({...report,runId:'other-run'});validation.autonomyReportSha256=createHash('sha256').update(validation.autonomyReportJson).digest('hex');
  assert.equal(f.runtime.get('p',admin.actorId,plan.planId)?.latestResult?.fixedReport,null);
  validation.autonomyReportJson=JSON.stringify({...report,checks:[...report.checks,{...report.checks[0],id:'package-tests'}]});validation.autonomyReportSha256=createHash('sha256').update(validation.autonomyReportJson).digest('hex');
  view=f.runtime.get('p',admin.actorId,plan.planId)!;assert.equal(view.latestResult?.fixedReport?.testGroups.length,2);assert.equal(view.latestResult?.fixedReport?.testsCounts,null);
  validation.autonomyReportJson=json;validation.autonomyReportSha256=createHash('sha256').update(json).digest('hex');
  f.runs.get('r').result.lateEvidenceOnly=true;assert.equal(f.runtime.get('p',admin.actorId,plan.planId)?.latestResult?.fixedReport,null);
  f.runs.get('r').result.lateEvidenceOnly=false;f.runs.get('r').workspace='/other';view=f.runtime.get('p',admin.actorId,plan.planId)!;assert.equal(view.steps[0].state,'unavailable');
  f.runs.get('r').workspace='/source';validation.autonomyReportSha256='0'.repeat(64);assert.equal(f.runtime.get('p',admin.actorId,plan.planId)?.latestResult?.fixedReport,null);
 }finally{await f.close();}
});

test('R27 read-only scoped reporting preserves denominators and exemption while original independent evaluator rejects it',async()=>{
 const f=await fixture(),workspace='/home/superopen/All-Projects/msf-repair-r27/source',projectId='70ec346f-6520-46ed-abed-22cac770a3e4',machineId='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',agentId='0b5aea06-47e1-4f4b-a32e-969417915c9c',runId='a'.repeat(40);
 await mkdir(join(f.directory,'execution'));const db=new DatabaseSync(join(f.directory,'execution','execution.sqlite'));db.exec('CREATE TABLE execution_runs(id TEXT PRIMARY KEY,owner_id TEXT,status TEXT,agent_id TEXT,json TEXT)');
 const suites=['syntax','logic','task-data','design-catalog','customer-prototype','customer-authority-boundary','customer-state-kernel','customer-route-matrix','customer-privacy-projection','prototype-commands','prototype-effects-integration','design-baseline','design-boundary','prototype-content','ui-scoring','selftest','selftest-boundary','build-artifact','merge-basis','contract-hardening','main-integration-boundary','attention-auto','autopilot-boundary','review-cases','boundary','failure-matrix','workflow','regression','visual','design-visual'];
 const check=(id:string,pass:boolean)=>({id,command:'fixed-command',required:true,executed:true,status:pass?'pass':'fail',exitCode:pass?0:1,evidenceSha256:'c'.repeat(64)});
 const exception={id:'INVALID_LOGIN_NOT_DENIED',status:'not-applicable',executed:false,required:false,source:'explicit-user-request',authorization:'R27-BAD-LOGIN-401-EXEMPTION',scope:'invalid-credentials-must-return-401-only',originalFailurePreserved:true,countsAsPassedCheck:false};
 const report:any={schemaVersion:1,kind:'project-autonomy-validation',status:'fail',simulated:false,runId,workspace,goalSpecHash:'23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42',workPackage:'FA-01',sourceFingerprint:'b'.repeat(64),sourceStable:true,startedAt:'2026-10-12T03:00:00Z',finishedAt:'2026-10-12T03:30:00Z',checks:[{...check('tests',false),tests:{total:332,passed:326,failed:6,skipped:0,unknown:0}},...suites.map((s,i)=>check('prototype-'+s,i<20)),...Array.from({length:18},(_,i)=>check(i===0?'prototype-baseline':'fixed-'+i,i<16))],artifacts:[{path:'report.json',sha256:'d'.repeat(64),bytes:100}],scopeExceptions:[exception],authenticationPolicy:'simple-valid-login-invalid-401-exempt-v1',sandboxImageContract:{version:'existing-broker-d9-fixed-contract-v1',imageId:'sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc',reference:'alpine@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc',architecture:'amd64',os:'linux',brokerSHA256:'d4bcec4e88990e45c82d76574fe7c8de8eebd1db239cedceefd95a6b204d1954',originalBrokerChanged:false,unlistedImageRejectionRequired:true,networkReadOnlyTimeoutQuotaRequired:true},productObjectivesAccepted:false};
 const template={id:'msf-101-claude',machineId,engine:'fixed',program:'/opt/jarvis-development/node/bin/node',args:['/opt/jarvis-development/software-factory/factory-no-model-receipt-r26.mjs'],workspaceRoot:'/home/superopen/All-Projects/msf-repair-r27',maxRounds:1,timeoutSec:4200,leaseSec:60,budgetCurrency:'USD',purpose:'project-candidate-validation',validation:{program:'/usr/bin/sudo',args:['-n','/usr/local/libexec/jarvis-msf-main-acceptance-r27','{workspace}','{runId}'],timeoutSec:3600}};
 f.records.set('projects:'+projectId,{id:projectId,scope:'personal',ownerId:admin.actorId,status:'active'});f.records.set('tasks:r27-task',{id:'r27-task',scope:'personal',ownerId:admin.actorId,projectId,machineId,worktree:workspace});
 const publish=(body:any=report,patch:any={},storedPatch:any={},owner='server-admin')=>{
  const json=JSON.stringify(body),value={id:runId,domain:'tasks',kind:'development',scope:'personal',taskId:'r27-task',objectId:'r27-task',projectId,machineId,executorId:'msf-101-claude',purpose:'project-candidate-validation',budgetUSD:0,maxRounds:1,timeoutSec:4200,workspace,agentId,createdAt:'2026-10-12T03:00:00Z',status:'failed',result:{source:'signed-agent',outcome:'failed',exitCode:0,validation:{exitCode:1,autonomyReportJson:json,autonomyReportSha256:createHash('sha256').update(json).digest('hex')}},...patch};
  const {status,agentId:normalizedAgent,...raw}=value; // Real SQL JSON omits normalized status/agent and ownerId.
  db.prepare('INSERT OR REPLACE INTO execution_runs VALUES(?,?,?,?,?)').run(runId,owner,status,normalizedAgent,JSON.stringify({...raw,template,...storedPatch}));f.runs.set(runId,value);
 };
 try{
  publish();const p=f.runtime.create(projectId,{...create(),steps:[{...body().steps[0],taskIds:['r27-task'],runIds:[runId]}]},admin),get=()=>f.runtime.get(projectId,admin.actorId,p.planId)!.latestResult?.fixedReport;
  const admission=r27ScopedReportDisplaySchema.safeParse(report);assert.equal(admission.success,true,admission.success?undefined:JSON.stringify(admission.error.issues));const projected=get()!;assert.equal(projected.scopedValidation,true);assert.equal(projected.negativeLogin401Deferred,true);assert.equal(projected.productObjectivesAccepted,false);assert.equal(projected.independentAcceptance,false);assert.deepEqual(projected.scopeExceptions,[exception]);assert.equal(projected.checks.length,49);assert.equal(projected.checks.filter(c=>c.status==='pass').length,36);assert.equal(projected.testsCounts?.total,332);assert.deepEqual(projected.prototypeChecks,{total:30,observed:30,passed:20,failed:10,skipped:0,unknown:0});assert.equal(projectAutonomyValidationSchema.safeParse(report).success,false);assert.equal(r27ScopedReportDisplaySchema.safeParse(report).success,true);
  for(const mutate of [(r:any)=>r.scopeExceptions.push({...exception}),(r:any)=>r.scopeExceptions[0].countsAsPassedCheck=true,(r:any)=>r.scopeExceptions[0].id='OTHER_AUTH_CHECK',(r:any)=>r.authenticationPolicy='no-auth',(r:any)=>r.sandboxImageContract.networkReadOnlyTimeoutQuotaRequired=false,(r:any)=>r.productObjectivesAccepted=true,(r:any)=>r.goalSpecHash='0'.repeat(64),(r:any)=>r.sourceStable=false,(r:any)=>r.unreviewedExtra=true,(r:any)=>r.checks.push(check('INVALID_LOGIN_NOT_DENIED',true))]){const v=structuredClone(report);mutate(v);publish(v);assert.equal(get(),null);}
  for(const patch of [{agentId:'other-node'},{stopRequested:true},{status:'cancelled'},{result:{source:'local-pi-sdk'}}]){publish(report,patch);assert.equal(get(),null);}
  publish(report,{}, {template:{...template,engine:'claude'}});assert.equal(get(),null);publish(report,{}, {},'someone-else');assert.equal(get(),null);publish(report,{}, {result:{source:'signed-agent',summary:'different stored result'}});assert.equal(get(),null);
  publish();const current=f.runs.get(runId);current.result.lateEvidenceOnly=true;assert.equal(get(),null);publish();f.runs.get(runId).result.validation.autonomyReportSha256='0'.repeat(64);assert.equal(get(),null);publish();assert.equal(get()?.checks.length,49);
 }finally{db.close();await f.close();}
});
