import test from 'node:test';
import assert from 'node:assert/strict';
import {smokeTemplate,handshakePayload,expectedRunId,runBelongsToVerification,restoreAllowed,isolationChecks,sourceInspectionChecks,connectionChecks,startVerificationRun,stopVerificationRun,processStopped,existingStartEnvelope,safeApiFailure} from './verify-software-factory-execution.mjs';

test('handshake removes every tool and preserves the original template for exact restore',()=>{
  const original={id:'msf-101-claude',machineId:'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',engine:'claude',program:'/fixed/claude',args:['--print','{prompt}','--max-budget-usd','{maxBudgetUSD}'],maxRounds:10,timeoutSec:1200,validation:{program:'/fixed/validator',args:['{workspace}','{runId}']},supervision:{billing:'priced',maxRecoveryAttempts:3,repairValidation:true}},before=JSON.stringify(original),smoke=smokeTemplate(original);
  assert.equal(JSON.stringify(original),before);assert.equal(smoke.args[smoke.args.indexOf('--tools')+1],'');assert.equal(smoke.args[smoke.args.indexOf('--disallowedTools')+1],'*');assert.equal(smoke.args[smoke.args.indexOf('--max-turns')+1],'1');assert.equal(smoke.maxRounds,1);assert.equal(smoke.timeoutSec,120);assert.equal(smoke.supervision.maxRecoveryAttempts,0);assert.equal(smoke.supervision.repairValidation,false);assert.deepEqual(smoke.validation,original.validation);assert.throws(()=>smokeTemplate(smoke),/UNEXPECTED_BASE_TEMPLATE/);
});
test('one fresh handshake task never requests a resumed conversation or claims delivery',()=>{
  const payload=handshakePayload();assert.equal(payload.budget,1);assert.equal(payload.retryLimit,0);assert.equal(payload.mode,'managed');assert.equal(payload.sessionId,undefined);assert.deepEqual(payload.skillIds,[]);assert.match(payload.criteria,/不得宣称完整源码审查/);assert.match(payload.goal,/"needs_more_work":false/);
});

const taskFixture=()=>({id:'smoke-task',ownerId:'server-admin',revision:1,scope:'personal',mode:'managed',projectId:'70ec346f-6520-46ed-abed-22cac770a3e4',machineId:'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',agent:'msf-101-claude'});
const evidenceFixture=()=>{
  const task=taskFixture(),commandId='handshake-command';
  return {taskId:task.id,taskOwnerId:task.ownerId,nodeAgentId:'paired-development-agent',observations:[],events:[],start:{commandId,actorId:task.ownerId,expectedRunId:expectedRunId(commandId),taskId:task.id,projectId:task.projectId,machineId:task.machineId,executorId:task.agent}};
};
const runFixture=evidence=>({id:evidence.start.expectedRunId,domain:'tasks',kind:'development',scope:'personal',objectId:evidence.taskId,taskId:evidence.taskId,projectId:evidence.start.projectId,machineId:evidence.start.machineId,executorId:evidence.start.executorId,workspace:'/home/superopen/All-Projects/msf',agentId:evidence.nodeAgentId,status:'running'});

test('real connection receipt is required; failed native run or failed validation never verifies',()=>{
  const good={result:{status:'succeeded',outcome:'success',exitCode:0,rounds:1,source:'signed-agent',usage:{inputTokens:12,outputTokens:3,usageComplete:true},validation:{exitCode:0}},ledgerAfterObserver:[{measurement_status:'reported',input_tokens:12,output_tokens:3,total_tokens:15}],taskStatus:'validating',sourceMetadataUnchanged:true,sourceContentUnchanged:true,observerDedupConfirmed:true};
  assert.equal(Object.values(connectionChecks(good)).every(Boolean),true);
  for(const [name,change] of [
    ['native failure',value=>{value.result.status='failed';value.result.outcome='failed';}],
    ['unsigned completion',value=>{delete value.result.source;}],
    ['nonzero native exit',value=>{value.result.exitCode=1;}],
    ['second round',value=>{value.result.rounds=2;}],
    ['validator failure',value=>{value.result.validation.exitCode=1;}],
    ['unknown provider usage',value=>{value.ledgerAfterObserver[0].measurement_status='unknown';}],
    ['incomplete native snapshot',value=>{value.result.usage.usageComplete=false;}],
    ['invented ledger total',value=>{value.ledgerAfterObserver[0].total_tokens=150;}],
    ['task not validating',value=>{value.taskStatus='failed';}],
    ['source metadata changed',value=>{value.sourceMetadataUnchanged=false;}],
    ['public source content changed',value=>{value.sourceContentUnchanged=false;}],
    ['observer duplicate unconfirmed',value=>{value.observerDedupConfirmed=false;}],
  ]){const candidate=structuredClone(good);change(candidate);assert.equal(Object.values(connectionChecks(candidate)).every(Boolean),false,name);}
});

test('start identity is durable before sending, even when response is lost',async()=>{
  const task=taskFixture(),evidence={events:[],nodeAgentId:'paired-development-agent'},writes=[];
  await assert.rejects(startVerificationRun(async(path,payload)=>{
    assert.equal(path,'/api/v1/tasks/commands/start');assert.equal(writes.length,1);
    assert.equal(writes[0].start.commandId,payload.commandId);assert.equal(writes[0].runId,expectedRunId(payload.commandId));assert.equal(writes[0].taskOwnerId,'server-admin');
    throw Error('API_RESPONSE_LOST');
  },task,evidence,async()=>{writes.push(structuredClone(evidence));}),/API_RESPONSE_LOST/);
  assert.equal(evidence.runId,evidence.start.expectedRunId);assert.match(evidence.runId,/^[a-f0-9]{40}$/);
  const run=runFixture(evidence);assert.equal(runBelongsToVerification(run,evidence,{...task,executionRequest:{id:evidence.runId}}),true);
});

test('recovery never stops a different owner or mismatched project request',async()=>{
  const evidence=evidenceFixture();evidence.runId=evidence.start.expectedRunId;
  const run=runFixture(evidence),task={...taskFixture(),ownerId:'another-owner',executionRequest:{id:evidence.runId}};let stops=0;
  await assert.rejects(stopVerificationRun(async(path,body)=>{if(body)stops++;return {data:path.includes('/execution/runs/')?run:task};},evidence),/VERIFICATION_STOP_SCOPE_MISMATCH/);
  assert.equal(stops,0);assert.equal(runBelongsToVerification({...run,projectId:'other-project'},evidence),false);assert.equal(runBelongsToVerification({...run,agentId:'another-agent'},evidence),false);
});

test('own queued or running request also blocks template restore',()=>{
  const evidence=evidenceFixture(),run=runFixture(evidence);
  assert.equal(restoreAllowed([run]),false);assert.equal(restoreAllowed([{...run,status:'queued'}]),false);assert.equal(restoreAllowed([{...run,status:'succeeded'},{id:'other',status:'running'}]),false);assert.equal(restoreAllowed([{...run,status:'succeeded'}]),true);assert.equal(restoreAllowed(undefined),false);
});

test('a central stop request is not a signed process-termination receipt',()=>{
  const run={...runFixture(evidenceFixture()),status:'cancelled',stopRequested:true};
  assert.equal(processStopped(run),false);assert.equal(processStopped({...run,result:{source:'unsigned'}}),false);assert.equal(processStopped({...run,result:{source:'signed-agent',outcome:'cancelled'}}),true);assert.equal(processStopped({...run,agentId:null}),true);
});

test('isolation gate rejects missing assertions, empty objects and truthy substitutes',()=>{
  const valid={exitCode:0,probe:{ok:true,uid:1001,runIdShape:'central-40hex',landlockABI:6,networkNamespace:true,connectDenied:{tcp:true,unix:true},filesystem:{scratchReadable:true,scratchWritable:true,selfStatReadable:true,outsideFixtureDenied:true,originalSourceDenied:true,agentConfigDenied:true,otherProcessStatDenied:true}}};
  const ready=report=>Object.values(isolationChecks(report)).every(value=>value===true);
  assert.equal(ready(valid),true);
  for(const [name,change] of [
    ['missing filesystem',report=>{delete report.probe.filesystem;}],
    ['empty filesystem',report=>{report.probe.filesystem={};}],
    ['one missing filesystem assertion',report=>{delete report.probe.filesystem.agentConfigDenied;}],
    ['one denied read failed',report=>{report.probe.filesystem.originalSourceDenied=false;}],
    ['another process stat accessible',report=>{report.probe.filesystem.otherProcessStatDenied=false;}],
    ['truthy text is not proof',report=>{report.probe.filesystem.outsideFixtureDenied='true';}],
    ['missing network proof',report=>{delete report.probe.connectDenied;}],
    ['unix socket allowed',report=>{report.probe.connectDenied.unix=false;}],
    ['namespace absent',report=>{delete report.probe.networkNamespace;}],
    ['wrong run ID shape',report=>{report.probe.runIdShape='uuid';}],
    ['kernel isolation absent',report=>{report.probe.landlockABI=0;}],
    ['root validator',report=>{report.probe.uid=0;}],
    ['nonzero probe exit',report=>{report.exitCode=1;}],
  ]){const invalid=structuredClone(valid);change(invalid);assert.equal(ready(invalid),false,name);}
  assert.equal(ready({}),false);assert.equal(ready(undefined),false);
});

test('trusted public-source inspection requires two equal content hashes and raw Git refs',()=>{
  const git={head:'b'.repeat(40),branch:'main',trackedDirtyCount:null,untrackedCount:null,statusInspection:'not-run',metadataMethod:'bounded-raw-ref-no-git-process'};
  const valid={exitCode:0,wrapperSHA256:'249b7757b0887d594dcebd6dd92af76a83b9f70b31a03ce28baf1b1e5ff574fd',inspection:{ok:true,source:'/home/superopen/All-Projects/msf',sourceFingerprint:'a'.repeat(64),verificationSha256:'a'.repeat(64),sourceStateChanged:false,gitBefore:git,gitAfter:{...git},files:100,bytes:20000,privateEnvCopied:false,modelCalled:false,testsRun:false}};
  const ready=report=>Object.values(sourceInspectionChecks(report)).every(value=>value===true);
  assert.equal(ready(valid),true);
  for(const [name,change] of [
    ['installed wrapper changed',report=>{report.wrapperSHA256='c'.repeat(64);}],
    ['second source read changed',report=>{report.inspection.verificationSha256='c'.repeat(64);}],
    ['source changed flag',report=>{report.inspection.sourceStateChanged=true;}],
    ['branch changed',report=>{report.inspection.gitAfter.head='d'.repeat(40);}],
    ['Git process used',report=>{report.inspection.gitBefore.statusInspection='git-status';}],
    ['private files copied',report=>{report.inspection.privateEnvCopied=true;}],
    ['model called',report=>{report.inspection.modelCalled=true;}],
    ['missing hash',report=>{delete report.inspection.sourceFingerprint;}],
    ['unbounded files',report=>{report.inspection.files=20001;}],
    ['source inspection failed',report=>{report.exitCode=1;}],
  ]){const invalid=structuredClone(valid);change(invalid);assert.equal(ready(invalid),false,name);}
  assert.equal(ready({}),false);
});

test('an uncommitted start resumes only its original command, owner and frozen one-round task',()=>{
  const payload=handshakePayload(),originalTemplate={id:payload.agent,machineId:payload.machineId,engine:'claude',args:['--print','{prompt}'],maxRounds:10,timeoutSec:1200,supervision:{billing:'priced'}},evidence={...evidenceFixture(),payload,originalTemplate,smokeTemplate:smokeTemplate(originalTemplate),scope:{machineId:payload.machineId,projectId:payload.projectId,templateId:payload.agent,source:payload.worktree,config:'/var/lib/jarvis-development/101/config.json',unit:'jarvis-software-factory-development.service'}};
  evidence.runId=evidence.start.expectedRunId;
  const task={...taskFixture(),...payload,status:'queued',sessionId:null,executionStatus:null};
  const before=JSON.stringify(evidence),envelope=existingStartEnvelope(evidence,task);
  assert.deepEqual(envelope,{commandId:evidence.start.commandId,scope:'personal',expectedVersion:1,payload:{taskId:task.id}});
  assert.equal(JSON.stringify(evidence),before);
  for(const [name,change] of [
    ['another owner',(e,t)=>{t.ownerId='another-owner';}],
    ['another project',(e,t)=>{t.projectId='other-project';}],
    ['another machine',(e,t)=>{t.machineId='other-machine';}],
    ['recorded intent scope altered',e=>{e.start.projectId='other-project';}],
    ['new revision',(e,t)=>{t.revision=2;}],
    ['task already claimed',(e,t)=>{t.executionRequest={id:e.runId};}],
    ['task resumed from another session',(e,t)=>{t.sessionId='other-session';}],
    ['budget widened',(e,t)=>{t.budget=2;}],
    ['changed deadline',(e,t)=>{t.deadline='2099-01-01T00:00:00Z';}],
    ['invented goal in both task and evidence',(e,t)=>{e.payload.goal=t.goal='Develop features and use tools';}],
    ['tools re-enabled',e=>{e.smokeTemplate.args=['--tools','Read'];}],
    ['wrong deterministic ID',e=>{e.runId='a'.repeat(40);}],
  ]){const e=structuredClone(evidence),t=structuredClone(task);change(e,t);assert.throws(()=>existingStartEnvelope(e,t),/EXISTING_VERIFICATION_SCOPE_MISMATCH/,name);}
});

test('HTTP diagnostics retain stable status and code without server bodies, values or private fields',()=>{
 const error=new Error('API_500 '+JSON.stringify({error:{code:'CONTRACT_INVALID',message:'接口返回校验未通过，操作未提交',details:{privateKey:'never-print-this-secret',fields:[{value:'private-chat'}]}},cookie:'private-cookie'}));
 const safe=safeApiFailure(error);assert.deepEqual(safe,{httpStatus:500,code:'CONTRACT_INVALID',message:'接口返回校验未通过，操作未提交'});assert.doesNotMatch(JSON.stringify(safe),/never-print|private-chat|private-cookie|details/);
 assert.deepEqual(safeApiFailure(new Error('API_503 '+JSON.stringify({code:'EXECUTOR_NOT_READY',message:'unexpected server content secret'}))),{httpStatus:503,code:'EXECUTOR_NOT_READY'});
 assert.deepEqual(safeApiFailure(new Error('API_502 not json private secret')),{httpStatus:502,code:'API_ERROR'});
 assert.deepEqual(safeApiFailure(new Error('ECONNRESET private values')),{code:'LOCAL_VERIFICATION_ERROR'});
 assert.deepEqual(safeApiFailure(new Error('API_TIMEOUT')),{code:'API_TIMEOUT'});
});
