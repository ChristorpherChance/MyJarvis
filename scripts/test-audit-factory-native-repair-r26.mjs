/** Synthetic dependency tests only: no remote access, product execution or model calls. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {repairScope as S,nativeRepairTemplate,sha} from './run-factory-main-repair-r26.mjs';
import {assertAuditReady,assertHostAudit,auditToolHashes,auditHostProgram,auditReportPath,publicRepairReport,parseAuditArguments,runNativeRepairAudit} from './audit-factory-native-repair-r26.mjs';
const clone=structuredClone,agent='11111111-1111-4111-8111-111111111111';
function fixture(){
 const original={id:S.templateId,machineId:S.machineId,engine:'claude',program:'/fixture/claude',args:['--print','{prompt}'],workspaceRoot:'/home/superopen/All-Projects',maxRounds:2,timeoutSec:1200,leaseSec:60,budgetCurrency:'USD'};
 const profile={goalSpecHash:S.goalSHA,config:{costPolicy:'record-only'}};
 const source={sha256:S.baselineSHA,files:S.files,bytes:1000,metadataSHA:'a'.repeat(64),stable:true,identity:{device:1,inode:2}};
 const candidate={...source,sha256:'b'.repeat(64),files:594,metadataSHA:'c'.repeat(64),identity:{device:1,inode:3}};
 const commandId='22222222-2222-4222-8222-222222222222',runId=sha(S.ownerId+':'+commandId).slice(0,40),taskId='synthetic-repair-task';
 const template=nativeRepairTemplate(original),payload={title:'fixture',goal:'fixture goal',criteria:'fixture criteria',projectId:S.projectId,machineId:S.machineId,agent:S.templateId,worktree:S.workspace,mode:'managed',budget:1,retryLimit:0,skillIds:[]};
 const journal={version:2,scope:S,job:'d'.repeat(32),nodeAgentId:agent,initialProfileSHA:sha(profile),originalTemplate:original,originalTemplateSHA:sha(original),template,templateSHA:sha(template),baseline:{version:'r26-4',runId:'e'.repeat(40),taskId:'baseline-task',reportSHA:'f'.repeat(64),resultSHA:'1'.repeat(64)},cleanupProof:{path:'artifacts/software-factory/acceptance-r26/main-independent-cleanup-r26-4-1791736600910-6d87946a-5f81-47f5-be0d-0dafe8b39a5b.json',sha256:'2'.repeat(64)},diagnosis:{path:'fixture-public-diagnosis',sha256:'3'.repeat(64),runId:'e'.repeat(40),sourceFiles:[]},taskPayload:payload,taskPayloadSHA:sha(payload),taskId,runId,intents:{create:{commandId:'33333333-3333-4333-8333-333333333333',scope:'personal',expectedVersion:0,payload},start:{commandId,scope:'personal',expectedVersion:1,payload:{taskId}}},started:true,restored:true,phase:'restored',dispatchAttemptedAt:'2026-10-11T16:40:00Z',restoredAt:'2026-10-11T17:00:00Z',sourceBefore:source,sourceAfter:clone(source),copy:{originBound:true,source:clone(source),candidate:{...clone(source),identity:candidate.identity}}};
 const run={id:runId,domain:'tasks',kind:'development',scope:'personal',objectId:taskId,taskId,projectId:S.projectId,machineId:S.machineId,executorId:S.templateId,workspace:S.workspace,agentId:agent,goal:payload.goal,criteria:payload.criteria,maxRounds:1,timeoutSec:1800,budgetUSD:1,status:'failed',result:{source:'signed-agent',outcome:'failed',exitCode:1,validation:null}};
 const task={id:taskId,ownerId:S.ownerId,scope:'personal',...payload,executionRequest:{id:runId}};
 const report='公开修复记录：仍需独立验证。\n';
 const host={helperVerified:true,originBound:true,originSHA256:'4'.repeat(64),mainBefore:source,mainAfter:clone(source),candidateBefore:candidate,candidateAfter:clone(candidate),tools:Object.entries(auditToolHashes).map(([path,sha256])=>({path,sha256,unchanged:true})),idle:{active:true,children:[],counts:{runs:0,deliveries:0,logs:0}},changes:[{path:'apps/server/changed.ts',change:'modified',beforeSHA256:'5'.repeat(64),afterSHA256:'6'.repeat(64),beforeBytes:1,afterBytes:2},{path:auditReportPath,change:'added',beforeSHA256:null,afterSHA256:sha(report),beforeBytes:null,afterBytes:Buffer.byteLength(report)},{path:'doc/new-fixture.md',change:'added',beforeSHA256:null,afterSHA256:'8'.repeat(64),beforeBytes:null,afterBytes:3},{path:'doc/obsolete.md',change:'deleted',beforeSHA256:'7'.repeat(64),afterSHA256:null,beforeBytes:5,afterBytes:null}],repairReport:{path:auditReportPath,present:true,sha256:sha(report),bytes:Buffer.byteLength(report),content:null},privateFilesExported:false,rawLogsExported:false,productCodeExecuted:false,modelsInvoked:false,containersStarted:false,mutationsPerformed:false};
 const state={journal,profile,run,task,host,report,hostCalls:0,queue:{fullTable:true,readOnly:true,allActive:0},node:{agentId:agent,template:original,unit:{ActiveState:'active'}},global:{supervised:false,stopped:false},templateSHA:journal.templateSHA};
 const deps={readFile:async()=>JSON.stringify(state.journal),now:()=>Date.parse('2026-10-11T17:00:00Z'),queueState:async()=>state.queue,nodeState:async()=>state.node,runTemplateSHA:async()=>state.templateSHA,hostState:async()=>{state.hostCalls++;return clone(state.host);},api:async path=>{
  if(path.endsWith('/autonomy'))return {data:clone(state.profile)};
  if(path==='/api/v1/execution/supervision')return {data:clone(state.global)};
  if(path==='/api/v1/execution/config')return {data:{templates:[clone(state.node.template)]}};
  if(path.startsWith('/api/v1/execution/runs/'))return {data:clone(state.run)};
  if(path.startsWith('/api/v1/tasks/'))return {data:clone(state.task)};
  throw Error('UNEXPECTED_SYNTHETIC_API');
 }};
 return {...state,state,deps};
}
test('requires restored v2 journal before remote candidate reads',async()=>{
 for(const mutate of [s=>s.journal.started=false,s=>s.journal.restored=false,s=>s.journal.phase='started',s=>s.journal.baseline.version='r26']){
  const f=fixture();mutate(f.state);await assert.rejects(runNativeRepairAudit({},f.deps));assert.equal(f.state.hostCalls,0);
 }
});
test('requires exact signed terminal run and preserves late cancellation without accepting it',()=>{
 const f=fixture();assert.doesNotThrow(()=>assertAuditReady(f.journal,f.run,f.task));
 for(const change of [{status:'running'},{agentId:'wrong'},{workspace:S.source},{result:{source:'unsigned'}}])assert.throws(()=>assertAuditReady(f.journal,{...f.run,...change},f.task));
 assert.throws(()=>assertAuditReady(f.journal,{...f.run,result:{...f.run.result,lateEvidenceOnly:true}},f.task));
 assert.doesNotThrow(()=>assertAuditReady(f.journal,{...f.run,status:'cancelled',stopRequested:true,result:{...f.run.result,outcome:'cancelled',lateEvidenceOnly:true}},f.task));
});
test('matches real protocol validation null or absent and rejects actual validator objects',()=>{
 const f=fixture();for(const validation of [null,undefined])assert.doesNotThrow(()=>assertAuditReady(f.journal,{...f.run,result:{...f.run.result,validation}},f.task));
 for(const validation of [{}, {exitCode:0}, {autonomyReportJson:'private'}])assert.throws(()=>assertAuditReady(f.journal,{...f.run,result:{...f.run.result,validation}},f.task));
});
test('profile, global, queue, actual template or restored node drift prevents candidate reads',async()=>{
 for(const mutate of [s=>s.profile.revision=9,s=>s.global.supervised=true,s=>s.queue.allActive=1,s=>s.node.agentId='wrong',s=>s.node.template=s.journal.template,s=>s.templateSHA='0'.repeat(64)]){
  const f=fixture();mutate(f.state);await assert.rejects(runNativeRepairAudit({},f.deps));assert.equal(f.state.hostCalls,0);
 }
});
test('actual candidate can differ from the 593-file baseline while main and both observed states stay stable',async()=>{
 const f=fixture(),result=await runNativeRepairAudit({},f.deps);
 assert.equal(result.candidate.after.files,594);assert.deepEqual(result.changeCounts,{added:2,modified:1,deleted:1});assert.equal(result.main.unchanged,true);assert.equal(result.productAccepted,false);assert.equal(result.independentProductValidationPerformed,false);assert.equal(result.repairReport.content,undefined);
 assert.ok(!JSON.stringify(result).includes('fixture goal'));
});
test('changed main metadata, candidate metadata, origin, inode, idle spool or fixed tools fail closed',()=>{
 const f=fixture();for(const mutate of [h=>h.mainAfter.metadataSHA='0'.repeat(64),h=>h.candidateAfter.metadataSHA='0'.repeat(64),h=>h.originBound=false,h=>{h.candidateBefore.identity.inode=4;h.candidateAfter.identity.inode=4;},h=>h.idle.counts.logs=1,h=>h.tools[0].sha256='0'.repeat(64)]){const h=clone(f.host);mutate(h);assert.throws(()=>assertHostAudit(h,f.journal));}
});
test('public changes reject traversal, duplicate paths or invalid before/after hashes',()=>{
 const f=fixture();for(const mutate of [h=>h.changes[0].path='../outside',h=>h.changes.push(clone(h.changes[0])),h=>h.changes[0].afterSHA256='secret',h=>h.changes[0].beforeSHA256=h.changes[0].afterSHA256]){const h=clone(f.host);mutate(h);assert.throws(()=>assertHostAudit(h,f.journal));}
});
test('fixed public report is optional, size bounded, private content refused and hash bound',async()=>{
 const f=fixture();f.state.host.repairReport.content=f.report;
 await assert.rejects(runNativeRepairAudit({},f.deps));
 const result=await runNativeRepairAudit({includeReport:true},f.deps);assert.equal(result.repairReport.content,f.report);assert.equal(result.repairReport.modelClaimsIndependentlyVerified,false);
 for(const text of ['password=PRIVATE_VALUE','Cookie: PRIVATE_VALUE','{"api_key":"fixture_gateway_value_0123456789"}',"'secret'=PRIVATE_VALUE",'`password`: PRIVATE_VALUE','$env:API_KEY="PRIVATE_VALUE"','Bearer fixture_token_0123456789','--token PRIVATE_VALUE','../.env.local','x'.repeat(65537)])assert.throws(()=>publicRepairReport(text));
 f.state.host.repairReport.content='changed';await assert.rejects(runNativeRepairAudit({includeReport:true},f.deps));
});
test('terminal mutation after observation invalidates audit instead of rewriting real result',async()=>{
 const f=fixture();f.deps.hostState=async()=>{f.state.run.result.exitCode=22;return clone(f.host);};
 await assert.rejects(runNativeRepairAudit({},f.deps),/TERMINAL_CHANGED/);
});
test('real signed round-limit with zero exit remains partial and is eligible only for read-only audit',async()=>{
 const f=fixture();f.state.run.status='round-limit';f.state.run.result.outcome='round-limit';f.state.run.result.exitCode=0;
 const result=await runNativeRepairAudit({},f.deps);assert.equal(result.terminal.status,'round-limit');assert.equal(result.terminal.exitCode,0);assert.equal(result.partial,true);assert.equal(result.modelExecutionOnly,true);assert.equal(result.productAccepted,false);
});
test('CLI accepts no arbitrary paths or alternate source scope',()=>{
 assert.deepEqual(parseAuditArguments([]),{includeReport:false});assert.deepEqual(parseAuditArguments(['--include-report']),{includeReport:true});
 for(const args of [['--source=/private'],['--report=/private'],['--include-report','--include-report']])assert.throws(()=>parseAuditArguments(args));
});
test('host code parses without executing and contains read-only SQLite and descriptor guards',()=>{
 const result=spawnSync('python',['-c','import ast,sys; t=ast.parse(sys.stdin.read()); print(ast.unparse(t))'],{input:auditHostProgram,encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/sys\.dont_write_bytecode = True/);assert.match(result.stdout,/exec\(compile\(body, str\(tool\), 'exec'\), h\.__dict__\)/);assert.match(result.stdout,/h\.walk\(fd, manifest\)/);assert.match(result.stdout,/dir_fd=parent/);assert.match(result.stdout,/mode=ro/);assert.match(result.stdout,/MAIN_REPAIR_AUDIT_FILES_CHANGED_DURING_READ/);
 assert.ok(!/\b(?:mkdir|rename|replace|unlink|chown|chmod|write_text|write_bytes)\(/.test(result.stdout));assert.ok(!/\bimportlib\b|docker|node_modules/.test(result.stdout));
});
