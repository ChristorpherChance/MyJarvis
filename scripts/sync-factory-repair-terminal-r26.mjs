/** Fixed R26 terminal metadata only. Import has no IO; inspect is the default. */
import {mkdir,open,rename,unlink} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {repairScope as S,canonical,sha} from './run-factory-main-repair-r26.mjs';
import {acceptanceScope as A,reviewedCandidate,zeroFixedUsage} from './run-factory-repair-acceptance-r26.mjs';
import {syncScope as ActiveScope,assertPlanLineage,cleanPlanStep,notesPayload} from './sync-factory-repair-verification-r26.mjs';
import {loadEvidenceContext,readBoundExecution,observePlatform,hostParameters,hostReadProgram,assertEvidenceHost,bindTerminalReport,ensureObservationUnchanged,safeReadLocal,withEvidencePlatform,savePublicEvidence} from './factory-repair-evidence-read-r26.mjs';

export const terminalSyncScope=Object.freeze({...ActiveScope,journalPath:'.jarvis-dev/maintenance/factory-repair-terminal-sync-r26.json',attempt:'e81a1a71df834ef3870759807a9c9438',initialPlanRevision:6,initialDecisionRevision:2});
export const terminalReferences=Object.freeze({
 report:{reference:'artifacts/software-factory/acceptance-r26/repair-full-readback-r26-1791740333002-12e812d5-6472-4044-9fcc-1c8ccc687a5a.json',kind:'observation',sha256:'e21bbfa0d9adb74481687b459447355204649f481b62161f4c63c7781ddee25a'},
 cleanup:{reference:'artifacts/software-factory/acceptance-r26/repair-independent-cleanup-r26-1791740377826-30894940-4170-4aed-9ef1-88013d3ce264.json',kind:'observation',sha256:'bc8c8ee8013197c0a7e37d0af23d151f473d0b70f277c247da6e54a1603fb001'},
 restore:{reference:'artifacts/software-factory/acceptance-r26/repair-fixed-validation-restore-1791740427170-f79148ce-5d60-4d21-ad13-d76caac31b22.json',kind:'observation',sha256:'f11d39ac182af3b705c7a1644dcbcbfd06af299df078f82a78005aa6f4371e96'}
});
const M=terminalSyncScope,H=/^[a-f0-9]{64}$/,U=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,same=(a,b)=>canonical(a)===canonical(b),need=(v,c)=>{if(!v)throw Error(c);},iso=d=>new Date(d.now()).toISOString();
export const terminalNextAction='复验未达标：先定位登录拒绝/前端认证，再修沙箱镜像、MinIO断言及原型缺失/超时；独立副本修复后按原标准完整复验';
export const terminalMarker='[R26部分候选完整复验终态 · '+M.verificationRunId+']';
export const terminalEntry=terminalMarker+'\n固定复验任务'+M.verificationTaskId+'、运行'+M.verificationRunId+'已取得签名failed：49项检查36通过13失败；332项测试326通过6失败；30组原型20通过10失败，分母分别保留。605文件候选66a56a19与原main593文件151300cf内容及元数据不变；测试生成物污染修复有效，构建、类型/代码检查、覆盖、打包及隔离健康通过。写入读回INVALID_LOGIN_NOT_DENIED、前端FRONTEND_AUTH_NOT_READY失败，沙箱5项、MinIO1项及10组原型仍失败；不据此宣布产品达标或74目标完成。独立核对本次attempt '+M.attempt+'的15精确资源、两类Docker标签范围、真实进程/socket和目录均已清理，ACK及队列空闲；之后实际恢复原执行模板并回读通过。原生round-limit、两轮基线失败与全部计划绑定、旧备注、里程碑、费用和决策保留。下一步提供可读取的公开诊断及环境契约，在独立副本定位认证失败并继续定点修复后完整复验；本次同步不派发任务、不调用模型、不发布。所选先测试部分候选方案仅追加真实实施/验证证据，产品独立验收仍false。固定测试签名用量确认Token/模型费用为0，历史未知价格继续单列，费用只记录无消费上限。automaticDispatch=false，74目标尚未独立验收，不代表通用全天自动研发闭环或从零交付已经完成。';
const planBody=v=>({mode:v.mode,title:v.title,goal:v.goal,currentStepId:v.currentStepId,steps:v.steps.map(cleanPlanStep),nextAction:v.nextAction});
const projectPreserved=v=>({id:v.id,ownerId:v.ownerId,scope:v.scope,name:v.name,description:v.description,goal:v.goal,status:v.status,milestones:v.milestones??[],copies:v.copies??[],repo:v.repo});
const decisionPreserved=v=>Object.fromEntries(['id','projectId','ownerId','scope','questionSummary','context','options','chosenId','decisionRationale','basisRefs','risk','affectedObjectives','rollbackPlan','changeOf','changeOfRevision','supersededBy','independentAcceptance'].map(k=>[k,v[k]]));
const keys=['plan','implementation',S.projectId,M.constructionProjectId];

function scopeReceipt(v){need(v?.schemaVersion===1&&v.projectId===S.projectId&&v.taskId===M.verificationTaskId&&v.runId===M.verificationRunId&&v.workspace===S.workspace&&v.productAccepted===false&&v.modelsInvoked===false&&v.failed!==true,'REPAIR_TERMINAL_RECEIPT_SCOPE_CHANGED');}
function sourcePair(v,j){need(v?.mainUnchanged===true&&v.candidateUnchanged===true&&same(v.mainBefore,j.mainBefore)&&same(v.mainAfter,j.mainBefore)&&same(v.candidateBefore,j.candidateBefore)&&same(v.candidateAfter,j.candidateBefore),'REPAIR_TERMINAL_SOURCE_BINDING_CHANGED');}
export function assertTerminalReceipts({report,cleanup,restore},j){
 for(const v of [report,cleanup,restore])scopeReceipt(v);
 need(j.started===true&&j.restored===true&&j.phase==='restored'&&j.runId===M.verificationRunId&&j.taskId===M.verificationTaskId&&j.allowPartialTerminal===true&&j.nativeBinding.partialNative===true&&j.candidateBefore.files===605&&j.candidateBefore.sha256===reviewedCandidate.fingerprint,'REPAIR_TERMINAL_RESTORE_JOURNAL_REQUIRED');
 const t=report.terminal;
 need(report.kind==='software-factory-repair-candidate-fixed-report-readback'&&report.readOnly===true&&t?.terminal===true&&t.status==='failed'&&t.outcome==='failed'&&t.signedReceiptIngested===true&&t.nonlate===true&&t.stopRequested===false&&t.lateEvidenceOnly===false&&t.zeroModelUsageConfirmed===true&&t.frozenTemplateSHA256===j.fixedTemplateSHA256&&H.test(t.storedRecordSHA256??'')&&H.test(t.resultSHA256??''),'REPAIR_TERMINAL_SIGNED_REPORT_REQUIRED');
 const b=report.terminalReportBinding;
 need(b?.present===true&&b.bound===true&&b.attempt===M.attempt&&b.sourceStable===true&&b.status==='fail'&&b.signedProtocolSHA256===report.signedReport?.sha256&&report.candidateFingerprint===reviewedCandidate.fingerprint&&report.mainFingerprint===S.baselineSHA&&report.signedReport.status==='fail'&&report.signedReport.sourceStable===true&&same(report.signedReport.checks,{total:49,passed:36,failed:13,skipped:0,unknown:0})&&same(report.signedReport.testGroups,[{checkId:'tests',total:332,passed:326,failed:6,skipped:0,unknown:0}])&&same(report.signedReport.prototypeChecks,{total:30,passed:20,failed:10,skipped:0,unknown:0}),'REPAIR_TERMINAL_REPORT_COUNTS_OR_BINDING_CHANGED');
 sourcePair(report.source,j);
 need(report.oldProfileUnchanged===true&&report.otherTemplatesUnchanged===true&&report.oldEvidenceUnchanged===true,'REPAIR_TERMINAL_OLD_EVIDENCE_CHANGED');
 need(cleanup.kind==='software-factory-repair-candidate-independent-cleanup-audit'&&cleanup.attempt===M.attempt&&cleanup.status==='complete'&&cleanup.resourceCleanupIndependentlyVerified===true&&cleanup.terminalReportIndependentlyBound===true&&cleanup.cleanupIndependentlyVerified===true&&cleanup.nodeACKIdle===true&&cleanup.readOnly===true&&same(cleanup.terminal,t)&&same(cleanup.terminalReportBinding,b),'REPAIR_TERMINAL_INDEPENDENT_CLEANUP_REQUIRED');
 sourcePair(cleanup.host?.source,j);
 const c=cleanup.host.cleanup,resource=sha(M.verificationRunId+M.attempt).slice(0,40);
 const main=['postgres','redis','minio','build','runtime','probe'].map(x=>({kind:'container',name:'jarvis-fa01-'+resource+'-'+x,present:false}));main.push({kind:'network',name:'jarvis-fa01-'+resource+'-net',present:false});
 const broker=Array.from({length:7},(_,i)=>({kind:'container',name:'jarvis-ft-'+resource+'-sandbox-'+(i+1),present:false}));broker.push({kind:'network',name:'jarvis-ft-'+resource+'-sandbox-net',present:false});
 need(c?.runId===M.verificationRunId&&c.attempt===M.attempt&&c.resourceId===resource&&c.lifecycleVerified===true&&c.exactNamedResourceCount===15&&same(c.mainLabelScope,{containers:[],networks:[],exactNamedResources:main})&&same(c.brokerLabelScope,{containers:[],networks:[],exactNamedResources:broker})&&c.resourcesActuallyAbsent===true&&c.processesActuallyGone===true&&same(c.relatedLiveProcesses,[])&&c.broker?.expectedProcessIdentityAlive===false&&c.broker.socket.present===false&&c.broker.runtimeDirectory.present===false&&c.broker.unresolvedCreateIntents===0&&c.coordinator?.expectedProcessIdentityAlive===false&&same(c.errorCodes,[])&&c.readOnly===true&&c.signalsSent===false&&c.resourcesRemoved===false&&same(cleanup.host.node,{queueActive:0,acknowledgementCounts:{runs:0,deliveries:0,logs:0},childCount:0}),'REPAIR_TERMINAL_ACTUAL_RESOURCES_NOT_CLEAN');
 need(restore.kind==='software-factory-repair-fixed-validation-receipt'&&restore.action==='restore'&&restore.restored===true&&restore.signed===true&&restore.status==='failed'&&restore.outcome==='failed'&&restore.stopRequested===false&&restore.lateEvidenceOnly===false&&restore.storedRecordSHA256===t.storedRecordSHA256&&restore.frozenTemplateSHA256===j.fixedTemplateSHA256&&restore.installationSHA256===j.installation.sha256&&restore.candidateFingerprint===reviewedCandidate.fingerprint&&restore.candidateMetadataSHA256===reviewedCandidate.metadataSHA256&&restore.mainUnchanged===true&&restore.mainMetadataUnchanged===true&&restore.candidateUnchanged===true&&restore.oldProfileUnchanged===true&&restore.otherTemplatesUnchanged===true&&restore.oldEvidenceUnchanged===true&&restore.zeroModelUsageConfirmed===true&&restore.actualCostUSD===0&&restore.validation?.sha256===report.signedReport.sha256&&restore.validation.sourceStable===true&&restore.validation.status==='fail'&&Date.parse(restore.at)>=Date.parse(cleanup.observedAt),'REPAIR_TERMINAL_ACTUAL_RESTORE_REQUIRED');
 return {taskId:M.verificationTaskId,runId:M.verificationRunId,attempt:M.attempt,fixedTemplateSHA256:j.fixedTemplateSHA256,storedRecordSHA256:t.storedRecordSHA256,resultSHA256:t.resultSHA256,reportSHA256:report.signedReport.sha256,canonicalReportSHA256:b.canonicalReportSHA256,candidateFingerprint:reviewedCandidate.fingerprint,candidateMetadataSHA256:reviewedCandidate.metadataSHA256,references:Object.values(terminalReferences)};
}
export function assertCurrentTerminal(snapshot,j,binding){
 need(snapshot.terminal===true&&snapshot.signed===true&&snapshot.nonlate===true&&snapshot.run.status==='failed'&&snapshot.run.agentId===j.nodeAgentId&&snapshot.run.result?.outcome==='failed'&&snapshot.run.stopRequested!==true&&snapshot.run.result.lateEvidenceOnly!==true&&zeroFixedUsage(snapshot.run.result.usage)&&snapshot.stored.storedRecordSHA256===binding.storedRecordSHA256&&snapshot.stored.frozenTemplateSHA256===binding.fixedTemplateSHA256&&sha(snapshot.run.result)===binding.resultSHA256&&snapshot.validation.sha256===binding.reportSHA256&&sha(snapshot.report)===binding.canonicalReportSHA256,'REPAIR_TERMINAL_CURRENT_API_SQL_CHANGED');
 return snapshot;
}
export function terminalPlanPayload(v,commandId){
 assertPlanLineage(v);const body=planBody(v),repair=body.steps.find(s=>s.id===M.stepId);
 need(repair.taskIds.includes(M.verificationTaskId)&&repair.runIds.includes(M.verificationRunId),'REPAIR_TERMINAL_CURRENT_BINDING_MISSING');
 return {commandId,expectedVersion:v.revision,...body,currentStepId:M.stepId,steps:body.steps.map(s=>s.id===M.stepId?{...s,nextAction:terminalNextAction}:s),nextAction:terminalNextAction,reason:'固定候选完整复验取得签名失败；源码一致性和隔离健康已通过，认证/沙箱/MinIO及原型仍失败。独立清理实证完成后恢复原模板，下一步按真实失败继续定点修复；保留全部历史和原标准，不新增派发或验收。'};
}
export function terminalImplementationPayload(v,refs,commandId,at){
 need(v?.id===M.decisionId&&v.projectId===S.projectId&&v.chosenId==='test-partial'&&v.status==='implemented'&&v.independentAcceptance===false&&v.context?.sourceFingerprint===reviewedCandidate.fingerprint&&v.context.runId===A.nativeRunId&&v.context.taskId===A.nativeTaskId&&Array.isArray(v.actions)&&v.actions.length<100&&Number.isSafeInteger(v.revision)&&v.revision>0,'REPAIR_TERMINAL_DECISION_CHANGED');
 return {commandId,expectedVersion:v.revision,origin:'ai',reason:'所选先测试部分候选方案已实际完成固定完整复验、独立清理与模板恢复，只追加实施/验证证据；签名产品结果失败，独立验收仍false。',actions:[{summary:'固定605文件候选复验签名failed：49检查36通过13失败；332测试326通过6失败，30原型20通过10失败。源码一致性和隔离健康通过，认证及其余失败待修复；15资源独立清理完成后原模板恢复，未验收产品或74目标。',at,state:'performed',evidenceRefs:refs}]};
}
export function assertTerminalSyncJournal(q,binding){
 need(q?.version===1&&same(q.scope,M)&&same(q.binding,binding)&&H.test(q.initialProfileSHA256??'')&&Number.isFinite(Date.parse(q.createdAt))&&q.before&&q.intents&&q.receipts&&same(Object.keys(q.intents).sort(),[...keys].sort())&&Object.keys(q.receipts).every(k=>keys.includes(k))&&keys.every(k=>U.test(q.intents[k]?.commandId??''))&&new Set(keys.map(k=>q.intents[k].commandId)).size===4,'REPAIR_TERMINAL_PRIVATE_INTENT_CHANGED');
 need(same(q.intents.plan,terminalPlanPayload(q.before.plan,q.intents.plan.commandId))&&same(q.intents.implementation,terminalImplementationPayload(q.before.decision,binding.references,q.intents.implementation.commandId,q.createdAt)),'REPAIR_TERMINAL_PRIVATE_PAYLOAD_CHANGED');
 for(const id of [S.projectId,M.constructionProjectId])need(same(q.intents[id],notesPayload(q.before[id],terminalEntry,terminalMarker,q.intents[id].commandId)),'REPAIR_TERMINAL_PRIVATE_NOTES_CHANGED');
 need(q.before.plan.revision===M.initialPlanRevision&&q.before.decision.revision===M.initialDecisionRevision&&q.before[S.projectId].revision===28&&q.before[M.constructionProjectId].revision===22,'REPAIR_TERMINAL_INITIAL_VERSIONS_CHANGED');
 return q;
}
const assertJournal=assertTerminalSyncJournal;
function assertPlanAfter(v,q){assertPlanLineage(v);need(v.revision===q.intents.plan.expectedVersion+1&&same(planBody(v),planBody(q.intents.plan)),'REPAIR_TERMINAL_PLAN_READBACK_CHANGED');}
/** POST returns the append-only revision; automaticDispatch/acceptance are GET projections. */
export function assertTerminalPlanWriteResponse(v,q){
 const prior=q.before.plan,{hash,...snapshot}=v??{};
 need(v?.planId===prior.planId&&v.projectId===prior.projectId&&v.ownerId===prior.ownerId&&v.scope===prior.scope&&v.revision===q.intents.plan.expectedVersion+1&&same(planBody(v),planBody(q.intents.plan))&&v.previousHash===prior.hash&&H.test(v.hash??'')&&sha(snapshot)===hash,'REPAIR_TERMINAL_PLAN_WRITE_RESPONSE_CHANGED');
 return v;
}
function assertDecisionAfter(v,q){const old=q.before.decision;need(v.id===M.decisionId&&v.revision===old.revision+1&&v.status==='implemented'&&v.independentAcceptance===false&&same(decisionPreserved(v),decisionPreserved(old))&&same(v.actions,[...old.actions,...q.intents.implementation.actions]),'REPAIR_TERMINAL_DECISION_READBACK_CHANGED');}
function assertProjectAfter(v,id,q){need(v.revision===q.intents[id].expectedVersion+1&&same(projectPreserved(v),projectPreserved(q.before[id]))&&same(v.environmentInfo,q.intents[id].payload.environmentInfo),'REPAIR_TERMINAL_NOTES_READBACK_CHANGED');}

/** Same CAS envelope is retained even if the server commits but the response is lost. */
export async function applyDurableTerminalIntent({q,key,path,readPath,check,checkResponse=check,verifyActual,save,api}){
 need(keys.includes(key)&&q.intents[key]&&typeof verifyActual==='function'&&typeof save==='function','REPAIR_TERMINAL_DURABLE_INTENT_INVALID');
 await verifyActual();
 if(!q.receipts[key]){const response=(await api(path,q.intents[key])).data;checkResponse(response);q.receipts[key]={revision:response.revision,hash:response.hash??sha(response)};await save();}
 const actual=(await api(readPath)).data;check(actual);need(actual.revision===q.receipts[key].revision,'REPAIR_TERMINAL_DURABLE_RECEIPT_CHANGED');return actual;
}

export async function syncFactoryRepairTerminal({action='inspect'}={},deps){
 need(['inspect','sync'].includes(action),'REPAIR_TERMINAL_ACTION_INVALID');const d={now:Date.now,randomUUID,...deps},get=async p=>(await d.api(p)).data;
 const context=await (d.loadContext??loadEvidenceContext)({'run-id':M.verificationRunId,attempt:M.attempt},d),j=context.j,receipts={};
 for(const [name,ref] of Object.entries(terminalReferences)){const raw=await d.readLocal(ref.reference,'utf8');need(sha(raw)===ref.sha256,'REPAIR_TERMINAL_PUBLIC_RECEIPT_CHANGED');receipts[name]=JSON.parse(raw);}
 const binding=assertTerminalReceipts(receipts,j);
 const verifyActual=async({host=false}={})=>{
  const snapshot=assertCurrentTerminal(await (d.readExecution??readBoundExecution)(context,d),j,binding),platform=await (d.observePlatform??observePlatform)(context,d);
  need(platform.profileSHA256===j.initialProfileSHA256&&platform.targetSHA256===j.originalTemplateSHA256&&platform.queueActive===0,'REPAIR_TERMINAL_RESTORED_PLATFORM_CHANGED');
  if(host){const observed=assertEvidenceHost(await d.readRoot(hostParameters(context,{attempt:M.attempt}),hostReadProgram()),context,platform,{idle:true});need(same(bindTerminalReport(snapshot,observed),receipts.report.terminalReportBinding),'REPAIR_TERMINAL_HOST_REPORT_BINDING_CHANGED');}
  await (d.ensureUnchanged??ensureObservationUnchanged)(context,snapshot,platform,d);return {snapshot,platform};
 };
 await verifyActual({host:true});
 let q;try{q=assertJournal(JSON.parse(await d.readLocal(M.journalPath,'utf8')),binding);}catch(e){if(e.code!=='ENOENT')throw e;}
 const planBase='/api/v1/projects/'+S.projectId+'/supervision-plans/'+M.planId,decisionBase='/api/v1/projects/'+S.projectId+'/decisions/'+M.decisionId;
 if(!q){
  const before={plan:await get(planBase),decision:await get(decisionBase)};for(const id of [S.projectId,M.constructionProjectId])before[id]=await get('/api/v1/projects/'+id);
  q={version:1,scope:M,binding,initialProfileSHA256:j.initialProfileSHA256,createdAt:iso(d),before,intents:{},receipts:{}};
  q.intents.plan=terminalPlanPayload(before.plan,d.randomUUID());q.intents.implementation=terminalImplementationPayload(before.decision,binding.references,d.randomUUID(),q.createdAt);
  for(const id of [S.projectId,M.constructionProjectId])q.intents[id]=notesPayload(before[id],terminalEntry,terminalMarker,d.randomUUID());assertJournal(q,binding);
 }
 need(q.initialProfileSHA256===j.initialProfileSHA256,'REPAIR_TERMINAL_PROFILE_BINDING_CHANGED');
 const summary={schemaVersion:1,kind:'software-factory-repair-terminal-metadata-sync',at:iso(d),action,taskId:j.taskId,runId:j.runId,attempt:M.attempt,status:'failed',planId:M.planId,decisionId:M.decisionId,referenceHashes:binding.references,oldProfileUnchanged:true,oldBindingsPreserved:true,oldNotesPreserved:true,milestonesPreserved:true,projectStatusPreserved:true,automaticDispatch:false,productAccepted:false,objectivesAccepted:false,modelsInvoked:false,actualCostUSD:0,zeroModelUsageConfirmed:true,unknownHistoricalCostPreserved:true,rawLogsExported:false,privateJournalExported:false};
 if(action==='inspect')return {...summary,ready:true,mutationsPerformed:false,completedOperationKeys:Object.keys(q.receipts),proposedPayloadSHA256:Object.fromEntries(keys.map(k=>[k,sha(q.intents[k])]))};
 const save=async()=>{assertJournal(q,binding);await d.saveJournal(q);};await save();
 // Replays reuse the persisted command ID and original CAS version, including ambiguous responses.
 const apply=(key,path,readPath,check,checkResponse=check)=>applyDurableTerminalIntent({q,key,path,readPath,check,checkResponse,verifyActual,save,api:d.api});
 const plan=await apply('plan',planBase+'/revisions',planBase,v=>assertPlanAfter(v,q),v=>assertTerminalPlanWriteResponse(v,q));
 const decision=await apply('implementation',decisionBase+'/implementation',decisionBase,v=>assertDecisionAfter(v,q));
 for(const id of [S.projectId,M.constructionProjectId])await apply(id,'/api/v1/projects/commands/environment-info','/api/v1/projects/'+id,v=>assertProjectAfter(v,id,q));
 await verifyActual({host:true});q.completedAt??=iso(d);await save();
 return {...summary,complete:true,mutationsPerformed:true,planRevision:plan.revision,decisionRevision:decision.revision,decisionStatus:decision.status,projects:[{projectId:S.projectId,revision:q.receipts[S.projectId].revision},{projectId:M.constructionProjectId,revision:q.receipts[M.constructionProjectId].revision}],completedOperationKeys:Object.keys(q.receipts)};
}
export function parseTerminalSyncArguments(args){need(args.length<=1,'REPAIR_TERMINAL_FIXED_ARGUMENTS_REQUIRED');const arg=args[0]??'inspect';need(['inspect','sync','--execute'].includes(arg),'REPAIR_TERMINAL_ACTION_INVALID');return {action:arg==='--execute'?'sync':arg};}
export function terminalSyncFailure(e,action,q){const code=String(e?.message??'');return {schemaVersion:1,kind:'software-factory-repair-terminal-metadata-sync',at:new Date().toISOString(),action,failed:true,errorCode:/^(?:REPAIR_TERMINAL|REPAIR_EVIDENCE|REPAIR_ACCEPTANCE|REPAIR_SYNC|REPAIR_INSTALL|MAIN_REPAIR)_[A-Z0-9_]{1,120}$/.test(code)?code:'REPAIR_TERMINAL_OPERATION_FAILED',taskId:M.verificationTaskId,runId:M.verificationRunId,completedOperationKeys:Object.keys(q?.receipts??{}),reconciliationRequired:true,automaticNewIntent:false,modelsInvoked:false,productAccepted:false,rawLogsExported:false,privateJournalExported:false,rawErrorExported:false};}
async function saveLocal(q){await mkdir(dirname(M.journalPath),{recursive:true});const temp=M.journalPath+'.'+randomUUID()+'.tmp';let f;try{f=await open(temp,'wx',0o600);await f.writeFile(JSON.stringify(q,null,2)+'\n');await f.sync();await f.close();f=null;await rename(temp,M.journalPath);}finally{await f?.close();await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let options,q,lock,result;try{options=parseTerminalSyncArguments(process.argv.slice(2));if(options.action==='sync'){await mkdir(dirname(M.journalPath),{recursive:true});lock=await open(M.journalPath+'.lock','wx',0o600);await lock.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()}));await lock.sync();}result=await withEvidencePlatform(d=>syncFactoryRepairTerminal(options,{...d,readLocal:safeReadLocal,saveJournal:async v=>{q=v;await saveLocal(v);}}));}catch(e){result=terminalSyncFailure(e,options?.action??'invalid',q);process.exitCode=1;}finally{if(lock){await lock.close();await unlink(M.journalPath+'.lock');}}
 const output=await savePublicEvidence('repair-terminal-metadata-sync-'+(options?.action??'invalid'),result);console.log(JSON.stringify({...output,...result}));
}
