/** Local-only tests of exact public evidence and durable metadata intents. No remote access. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {tsImport} from 'tsx/esm/api';
import Fastify from 'fastify';
import {terminalSyncScope as M,terminalReferences,terminalNextAction,terminalEntry,terminalMarker,assertTerminalReceipts,assertCurrentTerminal,terminalPlanPayload,terminalImplementationPayload,assertTerminalSyncJournal,assertTerminalPlanWriteResponse,applyDurableTerminalIntent,parseTerminalSyncArguments,terminalSyncFailure} from './sync-factory-repair-terminal-r26.mjs';
import {repairScope as S,sha} from './run-factory-main-repair-r26.mjs';
import {acceptanceScope as A,reviewedCandidate} from './run-factory-repair-acceptance-r26.mjs';
import {notesPayload} from './sync-factory-repair-verification-r26.mjs';
const command='11111111-1111-4111-8111-111111111111',at='2026-10-11T18:00:00.000Z';
const evidence={};
for(const [name,ref] of Object.entries(terminalReferences)){const raw=await readFile(ref.reference,'utf8');assert.equal(sha(raw),ref.sha256);evidence[name]=JSON.parse(raw);}
function journal(){const {report,restore}=evidence;return {started:true,restored:true,phase:'restored',runId:M.verificationRunId,taskId:M.verificationTaskId,allowPartialTerminal:true,nativeBinding:{partialNative:true},candidateBefore:report.source.candidateBefore,mainBefore:report.source.mainBefore,fixedTemplateSHA256:restore.frozenTemplateSHA256,installation:{sha256:restore.installationSHA256},nodeAgentId:'0b5aea06-47e1-4f4b-a32e-969417915c9c'};}
function plan(){return {planId:M.planId,projectId:S.projectId,ownerId:S.ownerId,scope:'personal',mode:'acceptance',revision:6,title:'原计划',goal:'74目标原文不变',currentStepId:'repair',nextAction:'正在复验',automaticDispatch:false,independentAcceptance:false,steps:[{id:'first',title:'首轮',goal:'原目标1',criteria:['原标准1'],taskIds:['98ee355a-6912-46c1-b551-df4ba7ac6030'],runIds:['e5ca06dfe49f0e3692b90b0fa9f0120ebc58e849'],nextAction:null,state:'needs-attention'},{id:'second',title:'复验',goal:'原目标2',criteria:['原标准2'],taskIds:['bf43cd17-453d-428f-81c3-2a0020726a31'],runIds:['f4b26c4c95047ff24f2f5eff7a21ec7d14c579a2'],nextAction:null,state:'needs-attention'},{id:'repair',title:'修复',goal:'原修复目标',criteria:['45/30/90/80完整标准'],taskIds:[A.nativeTaskId,M.verificationTaskId],runIds:[A.nativeRunId,M.verificationRunId],nextAction:'正在复验',latestResult:{privateText:'DO_NOT_COPY'}}]};}
function decision(){return {id:M.decisionId,projectId:S.projectId,chosenId:'test-partial',status:'implemented',revision:2,independentAcceptance:false,context:{sourceFingerprint:reviewedCandidate.fingerprint,runId:A.nativeRunId,taskId:A.nativeTaskId},actions:[{summary:'旧方案选择',state:'performed',evidenceRefs:[{reference:'old-public.json',kind:'observation',sha256:'1'.repeat(64)}]}]};}
function project(id,revision){return {id,ownerId:S.ownerId,scope:'personal',revision,status:'developing',name:'原项目',goal:'原目标',milestones:[{id:'old',completed:false,evidence:'保留旧失败'}],copies:[{machineId:S.machineId,path:S.workspace}],environmentInfo:{notes:'原备注与未知费用保留',environment:'原环境',verifyCommand:'原检查'}};}
function intentJournal(){const binding=assertTerminalReceipts(evidence,journal()),before={plan:plan(),decision:decision(),[S.projectId]:project(S.projectId,28),[M.constructionProjectId]:project(M.constructionProjectId,22)},intents={plan:terminalPlanPayload(before.plan,command),implementation:terminalImplementationPayload(before.decision,binding.references,'22222222-2222-4222-8222-222222222222',at)};
 for(const [i,id] of [S.projectId,M.constructionProjectId].entries())intents[id]=notesPayload(before[id],terminalEntry,terminalMarker,(i===0?'33333333-3333-4333-8333-333333333333':'44444444-4444-4444-8444-444444444444'));
 return {version:1,scope:M,binding,initialProfileSHA256:'5'.repeat(64),createdAt:at,before,intents,receipts:{}};
}
test('pinned actual signed failed report, 15-resource independent cleanup and restore all bind',()=>{
 const before=structuredClone(evidence),bound=assertTerminalReceipts(evidence,journal());assert.equal(bound.attempt,M.attempt);assert.deepEqual(bound.references,Object.values(terminalReferences));assert.deepEqual(evidence,before);assert.equal(bound.reportSHA256,evidence.report.signedReport.sha256);
});
test('unsigned, late, stopped, wrong source, wrong denominator and other attempt fail closed',()=>{
 const changes=[v=>v.report.terminal.signedReceiptIngested=false,v=>v.report.terminal.nonlate=false,v=>v.report.terminal.stopRequested=true,v=>v.report.terminal.lateEvidenceOnly=true,v=>v.report.source.candidateAfter.files=604,v=>v.report.signedReport.testGroups[0].total=331,v=>v.report.signedReport.prototypeChecks.total=29,v=>v.cleanup.attempt='1'.repeat(32),v=>v.restore.restored=false,v=>v.restore.at='2026-10-11T17:30:00Z',v=>v.restore.storedRecordSHA256='2'.repeat(64)];
 for(const change of changes){const v=structuredClone(evidence);change(v);assert.throws(()=>assertTerminalReceipts(v,journal()));}
});
test('actual exact resource absence, both label scopes, process identity, socket, ACK and queue all mandatory',()=>{
 const changes=[v=>v.cleanup.host.cleanup.mainLabelScope.exactNamedResources.pop(),v=>v.cleanup.host.cleanup.brokerLabelScope.exactNamedResources[0].present=true,v=>v.cleanup.host.cleanup.mainLabelScope.containers.push('unexpected'),v=>v.cleanup.host.cleanup.coordinator.expectedProcessIdentityAlive=true,v=>v.cleanup.host.cleanup.broker.runtimeDirectory.present=true,v=>v.cleanup.host.cleanup.broker.socket.present=true,v=>v.cleanup.host.cleanup.broker.unresolvedCreateIntents=1,v=>v.cleanup.host.cleanup.relatedLiveProcesses.push({pid:123}),v=>v.cleanup.host.node.queueActive=1,v=>v.cleanup.host.node.acknowledgementCounts.runs=1,v=>v.cleanup.host.cleanup.signalsSent=true];
 for(const change of changes){const v=structuredClone(evidence);change(v);assert.throws(()=>assertTerminalReceipts(v,journal()),/CLEAN/);}
});
test('plan updates next repair step while preserving every task/run/criteria and not projecting state',()=>{
 const v=plan(),copy=structuredClone(v),payload=terminalPlanPayload(v,command);assert.deepEqual(v,copy);assert.equal(payload.expectedVersion,6);assert.equal(payload.nextAction,terminalNextAction);assert.equal(payload.currentStepId,'repair');assert.ok(!JSON.stringify(payload).includes('DO_NOT_COPY'));assert.ok(!JSON.stringify(payload).includes('latestResult'));
 for(let i=0;i<v.steps.length;i++){assert.deepEqual(payload.steps[i].taskIds,v.steps[i].taskIds);assert.deepEqual(payload.steps[i].runIds,v.steps[i].runIds);assert.deepEqual(payload.steps[i].criteria,v.steps[i].criteria);assert.equal(payload.steps[i].goal,v.steps[i].goal);}
 const missing=plan();missing.steps[2].runIds.pop();assert.throws(()=>terminalPlanPayload(missing,command),/BINDING_MISSING/);const wrong=plan();wrong.automaticDispatch=true;assert.throws(()=>terminalPlanPayload(wrong,command));
});
test('decision records performed verification and failure separately from product acceptance',()=>{
 const v=decision(),copy=structuredClone(v),p=terminalImplementationPayload(v,Object.values(terminalReferences),command,at);assert.deepEqual(v,copy);assert.equal(p.expectedVersion,2);assert.equal(p.actions[0].state,'performed');assert.match(p.actions[0].summary,/failed/);assert.match(p.actions[0].summary,/未验收产品/);assert.equal(p.actions[0].evidenceRefs.length,3);assert.ok(!('status' in p));assert.ok(!('independentAcceptance' in p));
 for(const changes of [{independentAcceptance:true},{chosenId:'other'},{status:'selected'},{projectId:'other'}])assert.throws(()=>terminalImplementationPayload({...v,...changes},[],command,at));
});
test('private durable journal rejects arbitrary payloads, version changes and reused commands',()=>{
 const q=intentJournal(),copy=structuredClone(q);assert.equal(assertTerminalSyncJournal(q,q.binding),q);assert.deepEqual(q,copy);
 const changes=[v=>v.intents.plan.nextAction='claim completed',v=>v.intents.plan.steps[0].taskIds=[],v=>v.before.plan.revision=7,v=>v.intents.implementation.actions[0].state='planned',v=>v.intents[S.projectId].payload.environmentInfo.notes='erase old',v=>v.intents[S.projectId].commandId=v.intents.plan.commandId,v=>v.intents.start={commandId:command}];
 for(const change of changes){const v=structuredClone(q);change(v);assert.throws(()=>assertTerminalSyncJournal(v,q.binding));}
});
test('ambiguous committed response replays one fixed CAS envelope and appends once',async()=>{
 const q=intentJournal(),requests=[],dedupe=new Map(),result={revision:7,hash:'6'.repeat(64)},check=v=>assert.deepEqual(v,result);let writes=0,loseResponse=true,verifications=0,saves=0;
 const api=async(path,payload)=>{if(!payload)return {data:result};requests.push(structuredClone(payload));let prior=dedupe.get(payload.commandId);if(!prior){writes++;prior=result;dedupe.set(payload.commandId,prior);}if(loseResponse){loseResponse=false;throw Error('response lost');}return {data:prior};};
 const options={q,key:'plan',path:'revisions',readPath:'plan',check,verifyActual:async()=>{verifications++;},save:async()=>{saves++;},api};
 await assert.rejects(applyDurableTerminalIntent(options),/response lost/);assert.equal(q.receipts.plan,undefined);assert.equal(writes,1);
 assert.deepEqual(await applyDurableTerminalIntent(options),result);assert.equal(writes,1);assert.equal(saves,1);assert.equal(verifications,2);assert.deepEqual(requests[0],requests[1]);assert.equal(requests[1].expectedVersion,6);
 await applyDurableTerminalIntent(options);assert.equal(requests.length,2);assert.equal(verifications,3);
});
test('readback failure retains CAS receipt and does not repeat writes or invent next version',async()=>{
 const q=intentJournal();let writes=0,changed=true;const result={revision:7,hash:'7'.repeat(64)},api=async(path,payload)=>{if(payload){writes++;return {data:result};}return {data:changed?{revision:8}:result};},check=v=>assert.deepEqual(v,result),options={q,key:'plan',path:'revisions',readPath:'plan',check,verifyActual:async()=>{},save:async()=>{},api};
 await assert.rejects(applyDurableTerminalIntent(options));assert.equal(q.receipts.plan.revision,7);changed=false;await applyDurableTerminalIntent(options);assert.equal(writes,1);assert.equal(q.intents.plan.expectedVersion,6);
});
test('changed actual terminal before mutation prevents write and current SQL/result/report/usage gates are strict',async()=>{
 const q=intentJournal();let writes=0;await assert.rejects(applyDurableTerminalIntent({q,key:'plan',path:'revision',readPath:'plan',check:()=>{},verifyActual:async()=>{throw Error('REPAIR_TERMINAL_CURRENT_API_SQL_CHANGED');},save:async()=>{},api:async()=>{writes++;return {data:{}};}}));assert.equal(writes,0);
 const j=journal(),binding=q.binding,usage={inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,totalTokens:0,costUSD:0,usageComplete:true,provider:'fixed-test',model:'no-model',costKind:'provider-reported'},report={a:'exact'},result={outcome:'failed',usage,validation:{value:'same'}},b={...binding,resultSHA256:sha(result),canonicalReportSHA256:sha(report)},snapshot={terminal:true,signed:true,nonlate:true,run:{status:'failed',agentId:j.nodeAgentId,result},stored:{storedRecordSHA256:b.storedRecordSHA256,frozenTemplateSHA256:b.fixedTemplateSHA256},validation:{sha256:b.reportSHA256},report};assert.equal(assertCurrentTerminal(snapshot,j,b),snapshot);
 for(const change of [v=>v.signed=false,v=>v.run.agentId='other',v=>v.run.result.usage.totalTokens=1,v=>v.stored.storedRecordSHA256='a'.repeat(64),v=>v.validation.sha256='b'.repeat(64),v=>v.run.result.lateEvidenceOnly=true]){const v=structuredClone(snapshot);change(v);assert.throws(()=>assertCurrentTerminal(v,j,b));}
});
test('fixed CLI defaults inspect and safe failure cannot export raw private errors',()=>{
 assert.deepEqual(parseTerminalSyncArguments([]),{action:'inspect'});assert.deepEqual(parseTerminalSyncArguments(['sync']),{action:'sync'});assert.deepEqual(parseTerminalSyncArguments(['--execute']),{action:'sync'});
 for(const args of [['start'],['--run-id=other'],['sync','--execute'],['--private=secret']])assert.throws(()=>parseTerminalSyncArguments(args));
 const failure=terminalSyncFailure(Error('API_500 PRIVATE_COOKIE'),'sync',{receipts:{plan:{}}});assert.equal(failure.errorCode,'REPAIR_TERMINAL_OPERATION_FAILED');assert.ok(!JSON.stringify(failure).includes('COOKIE'));assert.equal(failure.automaticNewIntent,false);assert.equal(failure.productAccepted,false);
});
test('real controller POST returns a raw hash-linked revision; GET adds projections and exact replay does not append',async()=>{
 const {ProjectSupervisionPlanRuntime}=await tsImport('../apps/api/src/runtime/project-supervision-plan-runtime.ts',import.meta.url);
 const {registerProjectSupervisionPlanRoutes}=await tsImport('../apps/api/src/runtime/project-supervision-plan-routes.ts',import.meta.url);
 const directory=await mkdtemp(join(tmpdir(),'jarvis-terminal-post-contract-')),principal={actorId:S.ownerId,administrator:true},record={id:S.projectId,ownerId:S.ownerId,scope:'personal',status:'active'};
 const runtime=new ProjectSupervisionPlanRuntime({read(domain,id,actor){return domain==='projects'&&id===S.projectId&&actor===S.ownerId?record:undefined;},list(){return[];}},{getRun(){return undefined;},runsForTask(){return[];}},{directory}),app=Fastify();
 registerProjectSupervisionPlanRoutes(app,runtime,{principal(){return principal;}});
 const body={mode:'acceptance',title:'实际controller契约',goal:'不修改真实服务器',currentStepId:'repair',steps:[{id:'repair',title:'修复',goal:'原标准',criteria:['真实证据'],taskIds:[],runIds:[],nextAction:'正在复验'}],nextAction:'正在复验'},base='/api/v1/projects/'+S.projectId+'/supervision-plans';
 try{
  let response=await app.inject({method:'POST',url:base,payload:{...body,commandId:randomUUID(),expectedVersion:0}});assert.equal(response.statusCode,200);const id=response.json().data.planId,path=base+'/'+id;
  for(let version=1;version<6;version++){response=await app.inject({method:'POST',url:path+'/revisions',payload:{...body,commandId:randomUUID(),expectedVersion:version,reason:'本地原历史'}});assert.equal(response.statusCode,200);}
  const prior=(await app.inject({method:'GET',url:path})).json().data,payload={...body,steps:body.steps.map(s=>({...s,nextAction:terminalNextAction})),nextAction:terminalNextAction,commandId:randomUUID(),expectedVersion:6,reason:'固定终态结果'},q={before:{plan:prior},intents:{plan:payload},receipts:{}};
  assert.equal(prior.automaticDispatch,false);assert.equal(prior.independentAcceptance,false);
  const requests=[],api=async(url,input)=>{requests.push(input?.commandId??'GET');const r=await app.inject({method:input?'POST':'GET',url:input?path+'/revisions':path,payload:input});assert.equal(r.statusCode,200);return r.json();};
  let rejectFirst=true;const checkResponse=v=>{assert.equal(v.automaticDispatch,undefined);assert.equal(v.independentAcceptance,undefined);assertTerminalPlanWriteResponse(v,q);if(rejectFirst){rejectFirst=false;throw Error('simulated old projection check rejected committed POST');}},check=v=>{assert.equal(v.revision,7);assert.equal(v.automaticDispatch,false);assert.equal(v.independentAcceptance,false);assert.equal(v.nextAction,terminalNextAction);assert.equal(v.revisions.length,7);};
  const options={q,key:'plan',path:path+'/revisions',readPath:path,checkResponse,check,verifyActual:async()=>{},save:async()=>{},api};
  await assert.rejects(applyDurableTerminalIntent(options),/projection check/);assert.equal(q.receipts.plan,undefined);
  await applyDurableTerminalIntent(options);assert.deepEqual(requests.slice(0,2),[payload.commandId,payload.commandId]);assert.equal(q.receipts.plan.revision,7);check((await app.inject({method:'GET',url:path})).json().data);
  const raw=(await app.inject({method:'POST',url:path+'/revisions',payload})).json().data;assertTerminalPlanWriteResponse(raw,q);assert.throws(()=>assertTerminalPlanWriteResponse({...raw,hash:'f'.repeat(64)},q));assert.throws(()=>assertTerminalPlanWriteResponse({...raw,scope:'family'},q));
 }finally{await app.close();runtime.close();await rm(directory,{recursive:true,force:true});}
});
