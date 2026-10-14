import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import type {V1Repository} from '../src/v1/repository.js';
import {ProjectSupervisionPlanRuntime,r27ScopedReportDisplaySchema,r28ScopedReportDisplaySchema} from '../src/runtime/project-supervision-plan-runtime.js';
import {projectAutonomyValidationSchema} from '../src/runtime/project-autonomy-evidence.js';

// Synthetic reports are used only to test the read-only projection, not product acceptance.
const admin={actorId:'server-admin',administrator:true};
const scope={projectId:'70ec346f-6520-46ed-abed-22cac770a3e4',machineId:'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',agentId:'0b5aea06-47e1-4f4b-a32e-969417915c9c',workspace:'/home/superopen/All-Projects/msf-repair-r27/source',goalHash:'23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42'};
const source='9b07a5115c22d14f82e04ba45b66efbc5ac04f7faa696ab84d81e33696ec7b76',runId='8'.repeat(40),taskId='r28-display-fixture-task';
const mode='simple-valid-login-with-command-idempotency-invalid-401-exempt-v2';
const contract={version:'r28-d9-sdk5-exact-create-body-query-echo-v1',imageId:'sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc',reference:'alpine@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc',architecture:'amd64',os:'linux',brokerSHA256:'5440387d04ed57404b47c77aabcfea57502fb7d4e90ee74c87d8e6c1e8518f8b',controlSHA256:'cf9a0e5a7885eabe39ddebacda0b1423d007a0229f06551b21dd8615264ce4af',brokerPath:'/opt/jarvis-development/software-factory/factory-sandbox-broker-r28.py',brokerControlPath:'/opt/jarvis-development/software-factory/factory-sandbox-broker-control-r28.py',brokerRoot:'/var/lib/jarvis-development/101/full-validation-r28',runtimeRoot:'/run/jarvis-ft-sandbox-r28',originalBrokerChanged:false,createQueryCompatibility:'exact-approved-sdk5-body-echo-only',allOtherDuplicateQueriesRejected:true,unlistedImageRejectionRequired:true,networkReadOnlyTimeoutQuotaRequired:true};
const exception={id:'INVALID_LOGIN_NOT_DENIED',status:'not-applicable',executed:false,required:false,source:'explicit-user-request',authorization:'R28-BAD-LOGIN-401-EXEMPTION',scope:'invalid-credentials-must-return-401-only',originalFailurePreserved:true,countsAsPassedCheck:false};
const template={id:'msf-101-claude',machineId:scope.machineId,engine:'fixed',program:'/opt/jarvis-development/node/bin/node',args:['/opt/jarvis-development/software-factory/factory-no-model-receipt-r26.mjs'],workspaceRoot:'/home/superopen/All-Projects/msf-repair-r27',maxRounds:1,timeoutSec:4200,leaseSec:60,budgetCurrency:'USD',purpose:'project-candidate-validation',validation:{program:'/usr/bin/sudo',args:['-n','/usr/local/libexec/jarvis-msf-main-acceptance-r28','{workspace}','{runId}'],timeoutSec:3600}};
const suites=['syntax','logic','task-data','design-catalog','customer-prototype','customer-authority-boundary','customer-state-kernel','customer-route-matrix','customer-privacy-projection','prototype-commands','prototype-effects-integration','design-baseline','design-boundary','prototype-content','ui-scoring','selftest','selftest-boundary','build-artifact','merge-basis','contract-hardening','main-integration-boundary','attention-auto','autopilot-boundary','review-cases','boundary','failure-matrix','workflow','regression','visual','design-visual'];
const check=(id:string,pass=true)=>({id,command:'fixed-fixture-command',required:true,executed:true,status:pass?'pass':'fail',exitCode:pass?0:1,evidenceSha256:'c'.repeat(64)});
const report=()=>({schemaVersion:1,kind:'project-autonomy-validation',status:'fail',simulated:false,runId,workspace:scope.workspace,goalSpecHash:scope.goalHash,workPackage:'FA-01',sourceFingerprint:source,sourceStable:true,startedAt:'2026-10-12T03:00:00Z',finishedAt:'2026-10-12T03:30:00Z',checks:[{...check('tests',false),tests:{total:332,passed:327,failed:5,skipped:0,unknown:0}},...suites.map((s,i)=>check('prototype-'+s,i>=2)),...Array.from({length:18},(_,i)=>check(i===0?'prototype-extra-guard':'fixed-'+i))],artifacts:[{path:'report.json',sha256:'d'.repeat(64),bytes:100}],scopeExceptions:[{...exception}],authenticationPolicy:mode,sandboxImageContract:{...contract},productObjectivesAccepted:false});

async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-r28-report-'));await mkdir(join(directory,'execution'));
 const db=new DatabaseSync(join(directory,'execution','execution.sqlite'));db.exec('CREATE TABLE execution_runs(id TEXT PRIMARY KEY,owner_id TEXT,status TEXT,agent_id TEXT,json TEXT)');
 const records=new Map<string,any>([['projects:'+scope.projectId,{id:scope.projectId,scope:'personal',ownerId:admin.actorId,status:'active'}],['tasks:'+taskId,{id:taskId,scope:'personal',ownerId:admin.actorId,projectId:scope.projectId,machineId:scope.machineId,worktree:scope.workspace}]]);
 const runs=new Map<string,any>(),repository={read(domain:string,id:string,actor:string){const v=records.get(domain+':'+id);return v?.ownerId===actor?v:undefined;},list(){return[];}} as unknown as Pick<V1Repository,'read'|'list'>;
 const profile={status:'blocked',reason:'INDEPENDENT_OBJECTIVES_UNVERIFIED',revision:28,goalSpecHash:scope.goalHash,spec:{objectives:Array.from({length:74},(_,i)=>({id:'O'+i}))},verifiedObjectiveIds:[]};
 const runtime=new ProjectSupervisionPlanRuntime(repository,{getRun:id=>runs.get(id),runsForTask:id=>[...runs.values()].filter(r=>r.taskId===id)},{directory,executionDirectory:join(directory,'execution'),autonomy:()=>profile});
 const publish=(body:any=report(),patch:any={},storedPatch:any={},owner='server-admin')=>{
  const json=JSON.stringify(body),value={id:runId,domain:'tasks',kind:'development',scope:'personal',taskId,objectId:taskId,projectId:scope.projectId,machineId:scope.machineId,executorId:template.id,purpose:'project-candidate-validation',budgetUSD:0,maxRounds:1,timeoutSec:4200,workspace:scope.workspace,agentId:scope.agentId,createdAt:'2026-10-12T03:00:00Z',status:'failed',result:{source:'signed-agent',outcome:'failed',exitCode:0,validation:{exitCode:1,autonomyReportJson:json,autonomyReportSha256:createHash('sha256').update(json).digest('hex')}},...patch};
  const {status,agentId,...raw}=value;db.prepare('INSERT OR REPLACE INTO execution_runs VALUES(?,?,?,?,?)').run(runId,owner,status,agentId,JSON.stringify({...raw,template,...storedPatch}));runs.set(runId,value);return value;
 };
 publish();const plan=runtime.create(scope.projectId,{mode:'acceptance',title:'R28读取结果',goal:'核对固定候选真实回执',steps:[{id:'fixed',title:'固定复验',goal:'读取原测试结果',criteria:['保持原分母和独立目标'],taskIds:[taskId],runIds:[runId]}],currentStepId:'fixed',nextAction:'按失败安排后续',commandId:randomUUID(),expectedVersion:0},admin);
 return {directory,db,runtime,runs,records,profile,publish,view:()=>runtime.get(scope.projectId,admin.actorId,plan.planId)!,get:()=>runtime.get(scope.projectId,admin.actorId,plan.planId)!.latestResult?.fixedReport,async close(){runtime.close();db.close();await rm(directory,{recursive:true,force:true});}};
}

test('R28 exact signed frozen SQL result displays original denominators and leaves all 74 objectives unchanged',async()=>{
 const f=await fixture();try{
  const v=f.get()!;assert.ok(v);assert.equal(v.authenticationPolicy,mode);assert.equal(v.scopedValidation,true);assert.equal(v.productObjectivesAccepted,false);assert.equal(v.independentAcceptance,false);assert.equal(v.sourceFingerprint,source);assert.equal(v.checks.length,49);assert.equal(v.checks.filter(c=>c.status==='pass').length,46);assert.deepEqual(v.testsCounts,{total:332,passed:327,failed:5,skipped:0,unknown:0});assert.deepEqual(v.prototypeChecks,{total:30,observed:30,passed:28,failed:2,skipped:0,unknown:0});
  assert.deepEqual(v.scopeExceptions,[exception]);assert.equal(v.negativeLogin401Deferred,true);assert.ok(!v.checks.some(c=>c.id===exception.id));assert.equal(f.view().independentProgress?.totalObjectives,74);assert.equal(f.view().independentProgress?.verifiedObjectives,0);assert.equal(f.profile.status,'blocked');assert.equal(f.view().automaticDispatch,false);
  assert.equal(r28ScopedReportDisplaySchema.safeParse(report()).success,true);assert.equal(r27ScopedReportDisplaySchema.safeParse(report()).success,false);assert.equal(projectAutonomyValidationSchema.safeParse(report()).success,false);
 }finally{await f.close();}
});
test('R28 complete finite broker contract rejects every missing, altered and extra field',async()=>{
 const f=await fixture();try{
  for(const key of Object.keys(contract)){
   for(const replacement of [undefined,typeof (contract as any)[key]==='boolean'?!(contract as any)[key]:'unapproved']){
    const r:any=report();if(replacement===undefined)delete r.sandboxImageContract[key];else r.sandboxImageContract[key]=replacement;f.publish(r);assert.equal(f.get(),null,key);
   }
  }
  const r:any=report();r.sandboxImageContract.extra=true;f.publish(r);assert.equal(f.get(),null);
 }finally{await f.close();}
});
test('R28 exemption stays exactly not-applicable and never becomes another passed or executed check',async()=>{
 const f=await fixture();try{
  const mutations=[(r:any)=>r.scopeExceptions.push({...exception}),(r:any)=>r.scopeExceptions=[],(r:any)=>r.scopeExceptions[0].authorization='R27-BAD-LOGIN-401-EXEMPTION',(r:any)=>r.scopeExceptions[0].countsAsPassedCheck=true,(r:any)=>r.scopeExceptions[0].status='pass',(r:any)=>r.scopeExceptions[0].executed=true,(r:any)=>r.scopeExceptions[0].required=true,(r:any)=>r.scopeExceptions[0].originalFailurePreserved=false,(r:any)=>r.scopeExceptions[0].id='OTHER',(r:any)=>r.scopeExceptions[0].extra=true,(r:any)=>r.checks.push(check(exception.id))];
  for(const mutate of mutations){const r=report();mutate(r);f.publish(r);assert.equal(f.get(),null);}
 }finally{await f.close();}
});
test('R28 report binds actual source, goal, workspace, run and strict schema',async()=>{
 const f=await fixture();try{
  for(const patch of [{sourceFingerprint:'b'.repeat(64)},{goalSpecHash:'0'.repeat(64)},{workspace:'/other'},{runId:'other'},{sourceStable:false},{simulated:true},{productObjectivesAccepted:true},{authenticationPolicy:'simple-valid-login-invalid-401-exempt-v1'},{authenticationPolicy:'unapproved'},{schemaVersion:2},{extra:true}]){f.publish({...report(),...patch});assert.equal(f.get(),null,JSON.stringify(patch));}
 }finally{await f.close();}
});
test('R28 SQL frozen template rejects old or unknown entry, swapped argv, model, timeout and machine drift',async()=>{
 const f=await fixture();try{
  const changed=[{validation:{...template.validation,args:['-n','/usr/local/libexec/jarvis-msf-main-acceptance-r27','{workspace}','{runId}']}},{validation:{...template.validation,args:['-n','/usr/local/libexec/jarvis-msf-main-acceptance-r29','{workspace}','{runId}']}},{validation:{...template.validation,args:['-n',template.validation.args[1],'{runId}','{workspace}']}},{validation:{...template.validation,timeoutSec:3601}},{validation:{...template.validation,program:'/bin/sh'}},{engine:'claude'},{args:['model-task']},{program:'/usr/bin/node'},{machineId:'other'},{workspaceRoot:'/home/superopen/All-Projects/msf-repair-r28'},{maxRounds:2},{timeoutSec:4201},{leaseSec:61},{budgetCurrency:'EUR'},{purpose:'other'},{extra:true}];
  for(const patch of changed){f.publish(report(),{},{template:{...template,...patch}});assert.equal(f.get(),null,JSON.stringify(patch));}
  f.publish();assert.ok(f.get());
 }finally{await f.close();}
});
test('R28 only same project, machine, agent, task and fixed no-model execution can supply the display',async()=>{
 const f=await fixture();try{
  for(const patch of [{projectId:'other'},{machineId:'other'},{agentId:'other'},{taskId:'other'},{objectId:'other'},{executorId:'other'},{scope:'family'},{purpose:'project-development'},{budgetUSD:1},{maxRounds:2},{timeoutSec:4201},{domain:'projects'},{kind:'research'},{status:'running'},{status:'queued'},{status:'cancelled'},{status:'timeout'},{stopRequested:true}]){f.publish(report(),patch);assert.ok(f.get()==null,JSON.stringify(patch));}
 }finally{await f.close();}
});
test('R28 SQL owner, status, agent and exact signed payload are authoritative rather than API-only assertions',async()=>{
 const f=await fixture();try{
  f.publish(report(),{},{},'other-owner');assert.equal(f.get(),null);
  for(const patch of [{projectId:'other'},{machineId:'other'},{taskId:'other'},{objectId:'other'},{purpose:'other'},{workspace:'/other'},{stopRequested:true},{sessionId:'other-model-session'},{sessionBilling:'unapproved'},{binding:{providerId:'other-model'}},{skillSnapshots:[{id:'model-skill'}]},{validation:{...template.validation,args:['-n','/usr/local/libexec/jarvis-msf-main-acceptance-r27','{workspace}','{runId}']}},{result:{source:'signed-agent',outcome:'failed',summary:'different store'}}]){f.publish(report(),{},patch);assert.equal(f.get(),null,JSON.stringify(patch));}
  f.publish();f.db.prepare('UPDATE execution_runs SET status=? WHERE id=?').run('succeeded',runId);assert.equal(f.get(),null);
  f.publish();f.db.prepare('UPDATE execution_runs SET agent_id=? WHERE id=?').run('other',runId);assert.equal(f.get(),null);
  f.publish();f.db.prepare('DELETE FROM execution_runs WHERE id=?').run(runId);assert.equal(f.get(),null);
 }finally{await f.close();}
});
test('R28 rejects unsigned, late, mutated hash and unsigned top-level validation fallback',async()=>{
 const f=await fixture();try{
  const baseline=f.publish();for(const patch of [{...baseline.result,source:'local-pi-sdk'},{...baseline.result,lateEvidenceOnly:true},{...baseline.result,validation:{...baseline.result.validation,autonomyReportSha256:'0'.repeat(64)}}]){f.publish(report(),{result:patch});assert.equal(f.get(),null);}
  f.publish(report(),{result:{source:'signed-agent',outcome:'failed',exitCode:0},validation:baseline.result.validation});assert.equal(f.get(),null);
  f.publish();f.runs.get(runId).result.validation.autonomyReportJson+=' ';assert.equal(f.get(),null);
 }finally{await f.close();}
});
test('R28 retains observed missing original suites, skips, unknowns and extra guards outside the 30 denominator',async()=>{
 const f=await fixture();try{
  const r=report();r.checks=r.checks.filter(c=>c.id!=='prototype-visual');Object.assign(r.checks.find(c=>c.id==='prototype-regression')!,{executed:true,status:'skip',exitCode:null});Object.assign(r.checks.find(c=>c.id==='prototype-logic')!,{executed:false,status:'unknown',exitCode:null});f.publish(r);
  assert.deepEqual(f.get()!.prototypeChecks,{total:30,observed:29,passed:26,failed:1,skipped:1,unknown:2});
  r.checks.push(check('prototype-new-guard'));f.publish(r);assert.deepEqual(f.get()!.prototypeChecks,{total:30,observed:29,passed:26,failed:1,skipped:1,unknown:2});
  r.checks.push({...r.checks[0]});f.publish(r);assert.equal(f.get(),null);
  const bad=report();bad.checks[0].tests!.passed++;f.publish(bad);assert.equal(f.get(),null);
 }finally{await f.close();}
});
test('R28 successful fixed checks are still separate from unchanged independent acceptance',async()=>{
 const f=await fixture();try{
  const r=report();r.status='pass';r.checks.forEach(c=>Object.assign(c,{status:'pass',exitCode:0}));Object.assign(r.checks[0].tests!,{passed:332,failed:0});
  const prior=f.publish(r),result={...prior.result,outcome:'success',validation:{...prior.result.validation,exitCode:0}};f.publish(r,{status:'succeeded',result});
  assert.equal(f.get()!.status,'pass');assert.equal(f.get()!.independentAcceptance,false);assert.equal(f.get()!.productObjectivesAccepted,false);assert.equal(f.view().steps[0].state,'execution-finished');assert.equal(f.view().independentProgress?.verifiedObjectives,0);assert.equal(f.profile.status,'blocked');
 }finally{await f.close();}
});
