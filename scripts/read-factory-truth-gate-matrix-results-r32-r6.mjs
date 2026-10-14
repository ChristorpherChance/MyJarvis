/** Independent data-only result oracle. No SSH, Docker, DB, HTTP or model calls.
 * Evidence is SQL readback performed by the pinned independent QA program before
 * disposable databases were removed. This reader never claims a post-cleanup DB
 * observation. Operational qualification remains null until actual activation.
 */
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {matrixR32NativePrerequisiteSHA256,assertMatrixR32NativeObservation} from './factory-truth-gate-matrix-supervisor-r32-r2.mjs';
import {qualifyMatrixR32Supervisor as qualifyPreviousSupervisor} from './read-factory-truth-gate-matrix-results-r32.mjs';
import {safeReadLocal,settleEvidenceReads} from './factory-repair-evidence-read-r26.mjs';

const H=/^[a-f0-9]{64}$/,A=/^[a-f0-9]{32}$/,R=/^[a-f0-9]{40}$/;
const sha=v=>createHash('sha256').update(v).digest('hex');
const need=(v,c)=>{if(!v)throw Error(c)};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const code=v=>v===null||/^[A-Z][A-Z0-9_]{0,100}$/.test(v??'');
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const interval=v=>date(v?.startedAt)&&date(v?.finishedAt)&&Date.parse(v.startedAt)<=Date.parse(v.finishedAt);
const ok=v=>integer(v,200,299);
export const matrixResultsR32Source=Object.freeze({fingerprint:'f4a86cfb949863b6f5cb0dd80dde83f8b97ea4a66e1e047fbd77fc90f92d53e2',files:625,bytes:18413560,sourceIndexSHA256:'c2a18d38676c0df2b3868095e0a27fb236acf1092574bdda81c52edb7f43d927',probeSHA256:'2a8872244474d159e14a3d6c3dab68f6e66a192d7e49db73558fb651df1d056d',supervisorSHA256:'25513cbfcd37e3e1b40c52bc3312372fd51e87418d875ab700971311fd535541',pgConsumerSHA256:'45d888de21d3221a66d43d7d601de358338892f26d3d14c9b1ddb5dd32850c99',previousSupervisorOracleSHA256:'dec8f70c7a24d268f529816a1e94937addbeaa820626bd5d5f4b4d3b286288ab',originalFourSourceSHA256:'28dee1022f6bce8bbde8f36d9976509524a1a41a0eb7a1c4288541236b0efa9f'});
export const matrixResultsR32IDs=Object.freeze(['N01-mock-normal','N01-mock-conditional','N02-unknown-source','N02-unknown-run-source','N03-zero-case-run','N04-required-result-missing','N04-required-not-run','N05-fail','N05-blocked','N05-blocked-batch','N05-unwaivable-P0','N05-unwaivable-P1','N06-missing-evidence','N06-evidence-hash-tampered','N07-environment-mismatch','N07-new-current-build','N08-result-change','N08-source-change','N09-required-flag-change','N09-content-change','N09-required-case-added','N10-current-baseline-invalid','N10-new-same-build-failed-report','N10-new-postfinal-blocking-defect','N11-mandatory-na-without-applicability','N12-route-body-project-report-override','N12-manual-stale-after-batch-lock','N12-attachment-stale-after-batch-lock','N12-idempotency-same-key-other-body','P01-real-manual-http-and-byte-evidence','P02-lawful-optional-na','P03-legacy-unknown-preserved-new-real-run','P03-real-legacy-migration','P04-lawful-P2-conditional']);
export const matrixResultsR32FourTitles=Object.freeze(['orders a later serialized rerun after an older-BEGIN transaction and rejects the old draft basis','invalidates a finalized report when an older-BEGIN manual revision obtains the batch afterwards','places a manual revision strictly after a future prior timestamp without JavaScript rounding','allows only one real concurrent selftest start and orders it after a future prior selftest']);
export const matrixResultsR32Scope=Object.freeze({schemaVersion:1,kind:'r32-independent-matrix-results-fixed-scope-r2',source:matrixResultsR32Source,cleanupModule:null,cleanupModuleSHA256:null,cleanupScope:null,workerSHA256:null,starterSHA256:null,activationReview:null});
export const matrixResultsR32JournalPath='.jarvis-dev/maintenance/factory-r32-truth-gate-matrix-r6-once.json';
const base=()=>({schemaVersion:1,kind:'software-factory-r32-truth-gate-matrix-independent-results-r2',ready:false,resultSourcesIndependentlyQualified:false,httpSQLChecksIndependentlyQualified:false,additionalPGChecksIndependentlyQualified:false,nativePrerequisiteDenominator:1,nativePrerequisiteIndependentlyQualified:false,productAccepted:false,full74ObjectivesAccepted:false,customerDelivery:false,modelsInvoked:false,localDataOnly:true,remoteReadPerformed:false,remoteMutationsPerformed:false,databaseReadPerformedByThisReader:false,liveDatabaseReadAfterCleanup:false,producerPassedUsedAsProof:false,rawPrivateDataExported:false,syntheticUpstreamContext:true,httpSQLDenominator:34,additionalPGDenominator:4});
const result=(row,status,reason)=>({id:row.id,kind:row.id[0]==='N'?'negative':'positive',status,reason,producerStatusAgrees:row.status===status,sqlOnly:row.id==='P03-real-legacy-migration'});
const state=v=>obj(v)&&typeof v.batchStatus==='string'&&/^[a-z-]{1,40}$/.test(v.batchStatus)&&integer(v.releaseDecisions)&&integer(v.formalPassReports);
const noRelease=v=>v.releaseDecisions===0&&v.batchStatus!=='released';
const released=(v,formal)=>v.batchStatus==='released'&&v.releaseDecisions===1&&v.formalPassReports===formal;
const witness=v=>H.test(v.transactionBeforeSHA256??'')&&H.test(v.transactionAfterSHA256??'')&&typeof v.transactionUnchanged==='boolean';
const unchanged=v=>witness(v)&&v.transactionUnchanged===true&&v.transactionBeforeSHA256===v.transactionAfterSHA256;
const finalizedIDs=new Set(['N08-result-change','N08-source-change','N09-required-flag-change','N09-content-change','N09-required-case-added','N10-current-baseline-invalid','N10-new-same-build-failed-report','N10-new-postfinal-blocking-defect']);
function expectedNegative(id){
 if(id==='N03-zero-case-run')return {stages:['execute'],rejections:[[422,'ZERO_CASES_FORBIDDEN']],formalZero:true};
 if(id==='N05-blocked-batch')return {stages:['generate'],rejections:[[409,'INVALID_STATE']],formalZero:true};
 if(id==='N05-unwaivable-P0'||id==='N05-unwaivable-P1')return {stages:['generate','finalize','release'],rejections:[[422,'WAIVER_NOT_ALLOWED']],formalZero:true,detail:'SEVERITY_NOT_WAIVABLE'};
 if(finalizedIDs.has(id))return {stages:['release'],rejections:id==='N10-new-same-build-failed-report'?[[409,'REPORT_BASIS_MISMATCH'],[423,'GATE_BLOCKED']]:[[409,'REPORT_BASIS_MISMATCH']],formalZero:false};
 if(['N05-fail','N05-blocked','N11-mandatory-na-without-applicability'].includes(id))return {stages:['generate','finalize','release'],rejections:[[423,'GATE_BLOCKED']],formalZero:false};
 if(id==='N12-route-body-project-report-override')return {stages:['cross-project-release'],rejections:[[400,'VALIDATION_FAILED'],[409,'INVALID_STATE'],[403,'FORBIDDEN']],formalZero:false};
 if(id==='N12-idempotency-same-key-other-body')return {stages:['idempotency-replay'],rejections:[[409,'IDEMPOTENCY_CONFLICT']],formalZero:true};
 return {stages:['generate','finalize'],rejections:[[423,'GATE_BLOCKED']],formalZero:true};
}
/** Ignores row.passed and row.expectedRejection. All outcomes below are fixed by
 * this independent specification and real committed readback fields. */
export function qualifyMatrixR32Case(row){
 need(obj(row)&&matrixResultsR32IDs.includes(row.id),'R32_MATRIX_RESULTS_UNKNOWN_CASE');
 const incomplete=r=>result(row,'incomplete',r),fail=r=>result(row,'fail',r),pass=()=>result(row,'pass','R32_MATRIX_RESULTS_FACTS_MATCH');
 if(row.kind!==(row.id[0]==='N'?'negative':'positive')||!interval(row)||row.actualPostgreSQL!==true||row.actualHTTP!==true||!['pass','fail','incomplete'].includes(row.status))return incomplete('R32_MATRIX_RESULTS_CASE_METADATA_INCOMPLETE');
 if(row.errorCode!=null||row.readbackErrorCode!=null)return incomplete('R32_MATRIX_RESULTS_CASE_READ_OR_EXECUTION_FAILED');
 if(row.id==='P03-real-legacy-migration'){
  const fields=['oldRowsPreserved','oldRunPreserved','oldReportsPreserved','manualLegacyRemainsUnknown','knownMockMarkedSimulated','oldMockRunMarkedSimulated'];
  if(!fields.every(k=>typeof row[k]==='boolean'))return incomplete('R32_MATRIX_RESULTS_UPGRADE_READBACK_INCOMPLETE');
  return fields.every(k=>row[k])?pass():fail('R32_MATRIX_RESULTS_UPGRADE_HISTORY_CHANGED');
 }
 if(!state(row.committedState)||!Array.isArray(row.outcomes)||!row.outcomes.length||row.outcomes.length>3)return incomplete('R32_MATRIX_RESULTS_HTTP_OR_COMMIT_READBACK_INCOMPLETE');
 const outs=row.outcomes;
 if(!outs.every(x=>obj(x)&&typeof x.stage==='string'&&integer(x.status,0,599)&&code(x.errorCode)))return incomplete('R32_MATRIX_RESULTS_HTTP_METADATA_INCOMPLETE');
 if(outs.some(x=>x.status===0||x.status>=500))return incomplete('R32_MATRIX_RESULTS_HTTP_TRANSPORT_OR_SERVER_FAILURE');
 if(row.id==='N12-manual-stale-after-batch-lock'||row.id==='N12-attachment-stale-after-batch-lock'){
  const fields=['barrierActuallyObserved','oldCaseUnchanged','staleCommandAuditUnchanged','staleEvidenceLedgerUnchanged'];
  if(!fields.every(k=>typeof row[k]==='boolean')||!integer(row.runRows))return incomplete('R32_MATRIX_RESULTS_CONCURRENT_READBACK_INCOMPLETE');
  return same(outs.map(x=>x.stage),['concurrent-execute','stale-write'])&&ok(outs[0].status)&&outs[0].errorCode===null&&outs[1].status===423&&outs[1].errorCode==='STALE_EVIDENCE'&&row.runRows===2&&fields.every(k=>row[k])&&noRelease(row.committedState)?pass():fail('R32_MATRIX_RESULTS_CONCURRENT_BOUNDARY_OR_ROLLBACK_FAILED');
 }
 if(row.kind==='positive'){
  if(!same(outs.map(x=>x.stage),['generate','finalize','release'])||!outs.every(x=>ok(x.status)&&x.errorCode===null&&H.test(x.transactionBeforeSHA256??'')&&H.test(x.transactionAfterSHA256??'')&&x.transactionUnchanged===null))return fail('R32_MATRIX_RESULTS_POSITIVE_HTTP_CHAIN_FAILED');
  if(row.id==='P04-lawful-P2-conditional')return typeof row.conditionalDecisionAndFinalizedReportVerified!=='boolean'?incomplete('R32_MATRIX_RESULTS_CONDITIONAL_READBACK_INCOMPLETE'):released(row.committedState,0)&&row.conditionalDecisionAndFinalizedReportVerified?pass():fail('R32_MATRIX_RESULTS_CONDITIONAL_RELEASE_NOT_PERSISTED');
  if(!obj(row.byteEvidence)||!H.test(row.byteEvidence.sha256??'')||!integer(row.byteEvidence.bytes,1,4194304)||typeof row.byteEvidence.downloaded!=='boolean'||typeof row.legacyPreserved!=='boolean'||row.id==='P02-lawful-optional-na'&&typeof row.optionalApprovalVerified!=='boolean')return incomplete('R32_MATRIX_RESULTS_POSITIVE_BYTE_OR_LINEAGE_INCOMPLETE');
  return released(row.committedState,1)&&row.byteEvidence.downloaded&&row.legacyPreserved&&(row.id!=='P02-lawful-optional-na'||row.optionalApprovalVerified)?pass():fail('R32_MATRIX_RESULTS_POSITIVE_DELIVERY_NOT_PERSISTED');
 }
 const spec=expectedNegative(row.id),last=outs.at(-1);
 if(!witness(last))return incomplete('R32_MATRIX_RESULTS_ROLLBACK_WITNESS_MISSING');
 if(!same(outs.map(x=>x.stage),spec.stages)||!outs.slice(0,-1).every(x=>ok(x.status)&&x.errorCode===null)||!spec.rejections.some(([s,c])=>s===last.status&&c===last.errorCode))return fail('R32_MATRIX_RESULTS_EXPECTED_TARGET_REJECTION_NOT_OBSERVED');
 if(spec.detail&&(!Array.isArray(last.detailCodes)||!last.detailCodes.includes(spec.detail)))return fail('R32_MATRIX_RESULTS_EXPECTED_SEVERITY_GUARD_NOT_OBSERVED');
 if(!unchanged(last)||!noRelease(row.committedState)||spec.formalZero&&row.committedState.formalPassReports!==0)return fail('R32_MATRIX_RESULTS_REJECTED_TRANSACTION_WROTE_STATE');
 if(row.id==='N12-route-body-project-report-override'){
  if(!state(row.targetProjectCommittedState)||!state(row.sourceProjectCommittedState)||typeof row.sourceProjectAuditUnchanged!=='boolean'||typeof row.archivedTargetReleased!=='boolean')return incomplete('R32_MATRIX_RESULTS_CROSS_PROJECT_READBACK_INCOMPLETE');
  if(!noRelease(row.targetProjectCommittedState)||!noRelease(row.sourceProjectCommittedState)||!row.sourceProjectAuditUnchanged||row.archivedTargetReleased)return fail('R32_MATRIX_RESULTS_CROSS_PROJECT_BOUNDARY_CHANGED');
 }
 return pass();
}
export function qualifyMatrixR32Probe(p,context){
 need(obj(p)&&p.schemaVersion===1&&p.kind==='software-factory-r32-independent-truth-gate-probe'&&p.sourceFingerprint===matrixResultsR32Source.fingerprint&&p.sourceManifestSHA256===matrixResultsR32Source.sourceIndexSHA256&&p.attempt===context.attempt&&p.runId===context.runID&&interval(p),'R32_MATRIX_RESULTS_PROBE_SCOPE_OR_TIME_INVALID');
 need(p.syntheticUpstreamContext===true&&p.serviceReturnValuesMocked===false&&p.actualHTTP===true&&p.actualPostgreSQL===true&&['modelsInvoked','productionDatabaseUsed','sourceCodeChanged','productAccepted','full74ObjectivesAccepted','rawCredentialsExported','rawPrivateResponsesExported'].every(k=>p[k]===false),'R32_MATRIX_RESULTS_PROBE_SCOPE_FLAGS_INVALID');
 need(p.plannedCheckCount===34&&Array.isArray(p.checks)&&p.checks.length<=34&&p.checks.every(x=>obj(x)&&matrixResultsR32IDs.includes(x.id))&&new Set(p.checks.map(x=>x.id)).size===p.checks.length&&Array.isArray(p.problems)&&p.problems.length<=20&&p.problems.every(x=>obj(x)&&typeof x.errorCode==='string'&&code(x.errorCode)),'R32_MATRIX_RESULTS_PROBE_DENOMINATOR_OR_PROBLEMS_INVALID');
 const exact=same(p.checks.map(x=>x.id),matrixResultsR32IDs);
 need(typeof p.exactCheckSetCompleted==='boolean'&&p.exactCheckSetCompleted===exact&&['pass','fail'].includes(p.status),'R32_MATRIX_RESULTS_PROBE_COMPLETION_FLAG_INVALID');
 const producerCounts={total:p.checks.length,passed:p.checks.filter(x=>x.status==='pass').length,failed:p.checks.filter(x=>x.status==='fail').length,incomplete:p.checks.filter(x=>x.status==='incomplete').length};
 need(obj(p.counts)&&Object.keys(p.counts).length===4&&Object.entries(producerCounts).every(([k,v])=>p.counts[k]===v)&&producerCounts.total===producerCounts.passed+producerCounts.failed+producerCounts.incomplete,'R32_MATRIX_RESULTS_PROBE_COUNT_NOT_CLOSED');
 need(p.checks.every(x=>interval(x)&&Date.parse(x.startedAt)>=Date.parse(p.startedAt)&&Date.parse(x.finishedAt)<=Date.parse(p.finishedAt)),'R32_MATRIX_RESULTS_CASE_TIME_OUTSIDE_ATTEMPT');
 const checks=matrixResultsR32IDs.map(id=>p.checks.find(x=>x.id===id)).map((x,i)=>x?qualifyMatrixR32Case(x):{id:matrixResultsR32IDs[i],kind:matrixResultsR32IDs[i][0]==='N'?'negative':'positive',status:'incomplete',reason:'R32_MATRIX_RESULTS_CASE_NOT_EXECUTED',producerStatusAgrees:false,sqlOnly:matrixResultsR32IDs[i]==='P03-real-legacy-migration'});
 const counts={total:34,passed:checks.filter(x=>x.status==='pass').length,failed:checks.filter(x=>x.status==='fail').length,incomplete:checks.filter(x=>x.status==='incomplete').length};
 return {denominator:34,actuallyReported:p.checks.length,sqlOnlyCases:1,httpAndSQLCases:33,counts,checks,complete:exact&&p.problems.length===0,qualified:exact&&p.problems.length===0&&counts.passed===34&&checks.every(x=>x.producerStatusAgrees)&&p.status==='pass',problemCount:p.problems.length};
}
export function qualifyMatrixR32Four(f){
 need(obj(f)&&typeof f.success==='boolean'&&integer(f.numTotalTests,4,1000)&&integer(f.numFailedTestSuites,0,1000)&&(f.numRuntimeErrorTestSuites===undefined||integer(f.numRuntimeErrorTestSuites,0,1000))&&Array.isArray(f.suiteStatus)&&f.suiteStatus.length>0&&f.suiteStatus.length<=20&&f.suiteStatus.every(s=>['passed','failed','pending','skipped'].includes(s))&&Array.isArray(f.selected)&&f.selected.length<=4&&f.selected.every(x=>obj(x)&&matrixResultsR32FourTitles.includes(x.title)&&['passed','failed','pending','skipped','todo','disabled'].includes(x.status))&&new Set(f.selected.map(x=>x.title)).size===f.selected.length&&integer(f.unexpectedPassedCount,0,1000),'R32_MATRIX_RESULTS_FOUR_FRAMEWORK_INVALID');
 const cases=matrixResultsR32FourTitles.map(title=>{const row=f.selected.find(x=>x.title===title);return {title,status:!row||!['passed','failed'].includes(row.status)?'incomplete':row.status==='passed'?'pass':'fail'};});
 const counts={total:4,passed:cases.filter(x=>x.status==='pass').length,failed:cases.filter(x=>x.status==='fail').length,incomplete:cases.filter(x=>x.status==='incomplete').length};
 const lifecycle=f.success&&f.numFailedTestSuites===0&&(f.numRuntimeErrorTestSuites===undefined||f.numRuntimeErrorTestSuites===0)&&f.suiteStatus.every(x=>x==='passed')&&f.unexpectedPassedCount===0;
 return {denominator:4,counts,cases,originalBeforeAllAfterAllRequired:true,originalSourceSHA256:matrixResultsR32Source.originalFourSourceSHA256,frameworkAndLifecycleComplete:lifecycle,qualified:lifecycle&&counts.passed===4};
}
export function qualifyMatrixR32Native(n,context){
 try{assertMatrixR32NativeObservation(n,context);return {denominator:1,qualified:true,actualUID1000NativeLoad:true,nativePrerequisiteSHA256:matrixR32NativePrerequisiteSHA256,nativeModuleSHA256:n.nativeModuleSHA256,nodeABI:n.nodeABI,exportCount:n.exportCount,compressionVerified:false,databaseConnectivityVerified:false};}catch{return {denominator:1,qualified:false,actualUID1000NativeLoad:false,reason:'R32_MATRIX_RESULTS_NATIVE_ACTUAL_LOAD_INCOMPLETE',compressionVerified:false,databaseConnectivityVerified:false};}
}
export function qualifyMatrixR32Supervisor(s,context){
 need(obj(s)&&s.schemaVersion===1&&s.kind==='r32-truth-gate-supervisor-report-r2'&&s.nativePrerequisiteDenominator===1&&Array.isArray(s.stages)&&s.stages.length<=5&&(s.stages.length===0||s.stages[0].id==='locked-native-load'),'R32_MATRIX_RESULTS_NATIVE_SUPERVISOR_SCOPE_INVALID');
 const first=s.stages[0],previous=qualifyPreviousSupervisor({...s,kind:'r32-truth-gate-supervisor-report',stages:s.stages.slice(1)},context);
 const nativeStageVerified=first?.status==='pass'&&first.nativeDenominator===1&&first.actualLoadVerified===true&&first.uid===1000&&H.test(first.reportSHA256??'')&&integer(first.reportBytes,1,32767)&&first.nativePrerequisiteSHA256===matrixR32NativePrerequisiteSHA256&&first.nativeModuleSHA256==='1f62f0ff272b69f09dff7c867d840d407f2b43c5b6170fd6af0928ed0f542ed4'&&integer(first.exportCount,1)&&integer(first.nodeABI,1)&&first.compressionInvoked===false&&first.databaseQueriesInvoked===false;
 return {...previous,nativeStageVerified,nativeReportReference:nativeStageVerified?{sha256:first.reportSHA256,bytes:first.reportBytes}:null,qualified:previous.qualified&&nativeStageVerified};
}

export function matrixResultsR32MissingPins(s=matrixResultsR32Scope){return ['cleanupModuleSHA256','workerSHA256','starterSHA256'].filter(k=>!H.test(s[k]??'')).concat(!s.cleanupScope?['cleanupScope']:[],!s.activationReview?.path||!H.test(s.activationReview.sha256??'')?['activationReview']:[],s.cleanupModule!=='scripts/verify-factory-truth-gate-matrix-cleanup-r32-r8.mjs'?['cleanupModule']:[]);}
function assertScope(s){need(s.schemaVersion===1&&s.kind===matrixResultsR32Scope.kind&&same(s.source,matrixResultsR32Source)&&s.cleanupScope?.source?.fingerprint===s.source.fingerprint&&s.cleanupScope.workerSHA256===s.workerSHA256&&s.cleanupScope.starterSHA256===s.starterSHA256&&s.cleanupScope.producerScope?.tools?.find(x=>x.name==='probe.mjs')?.sha256===s.source.probeSHA256&&s.cleanupScope.producerScope?.tools?.find(x=>x.name==='supervisor.mjs')?.sha256===s.source.supervisorSHA256&&s.cleanupScope.producerScope?.tools?.find(x=>x.name==='factory-independent-pg-cjs-consumer-r29.mjs')?.sha256===s.source.pgConsumerSHA256,'R32_MATRIX_RESULTS_ACTIVATED_SCOPE_CHANGED');}
function assertReference(r){need(obj(r)&&/^artifacts\/software-factory\/goals-r29\/[A-Za-z0-9._-]+\.json$/.test(r.path??'')&&H.test(r.sha256??''),'R32_MATRIX_RESULTS_REFERENCE_INVALID');}
const reportPaths={probe:'/evidence/truth-gate-result.json',supervisor:'/evidence/supervisor-result.json',four:'/evidence/pg-four-result.json',native:'/evidence/locked-native-load-result.json'};
export function qualifyMatrixR32ReportEvidence(reports,context){
 need(obj(reports)&&same(Object.keys(reports).sort(),['four','native','probe','supervisor']),'R32_MATRIX_RESULTS_REPORT_SET_INVALID');
 const hashes={},available={},unqualifiedReports=[];for(const k of Object.keys(reportPaths)){const r=reports[k];need(obj(r)&&r.path===reportPaths[k]&&typeof r.readComplete==='boolean'&&typeof r.stable==='boolean'&&typeof r.parseComplete==='boolean','R32_MATRIX_RESULTS_REPORT_READER_METADATA_INVALID');if(!r.readComplete||!r.stable||!r.parseComplete||r.errorCode!=null){unqualifiedReports.push(k);continue;}need(H.test(r.sha256??'')&&integer(r.bytes,1,4194304)&&obj(r.projection),'R32_MATRIX_RESULTS_REPORT_BYTES_UNBOUND');hashes[k]={sha256:r.sha256,bytes:r.bytes};available[k]=r.projection;}
 const httpSQL=available.probe?qualifyMatrixR32Probe(available.probe,context):undefined,additionalPG=available.four?qualifyMatrixR32Four(available.four):undefined,environment=available.supervisor?qualifyMatrixR32Supervisor(available.supervisor,context):undefined,native=available.native?qualifyMatrixR32Native(available.native,context):undefined,complete=unqualifiedReports.length===0;
 const nativeReportBound=!!environment?.nativeStageVerified&&environment.nativeReportReference.sha256===hashes.native?.sha256&&environment.nativeReportReference.bytes===hashes.native?.bytes;
 return {...base(),ready:complete,resultSourcesIndependentlyQualified:complete,httpSQLChecksIndependentlyQualified:httpSQL?.qualified===true,additionalPGChecksIndependentlyQualified:additionalPG?.qualified===true,nativePrerequisiteDenominator:1,nativePrerequisiteIndependentlyQualified:native?.qualified===true&&nativeReportBound,limitedMatrixAccepted:complete&&httpSQL.qualified&&additionalPG.qualified&&environment.qualified&&native.qualified&&nativeReportBound,...(complete?{}:{reason:'R32_MATRIX_RESULTS_REPORT_READ_OR_PARSE_INCOMPLETE',failedReport:unqualifiedReports[0],unqualifiedReports}),sourceFingerprint:matrixResultsR32Source.fingerprint,attempt:context.attempt,runID:context.runID,reports:hashes,...(httpSQL?{httpSQL}:{}),...(additionalPG?{additionalPG}:{}),...(environment?{environment}:{}),...(native?{native}:{}),nativeReportBound,sqlWitnessTiming:'actual pinned independent PG read before and after each HTTP mutation, prior to disposable resource cleanup',sqlWitnessTables:13,normalLoginRequiredByPinnedProbe:true,strictLoginNegativeAdded:false,allHistoricalPrototypeComparisonsRequired:false};
}

export async function readFactoryTruthGateMatrixResultsR32(options={},deps={}){
 need(Object.keys(options).every(k=>['attempt','cleanupRef'].includes(k))&&(options.attempt===undefined||A.test(options.attempt)),'R32_MATRIX_RESULTS_ARGUMENT_INVALID');
 need(!deps.fixedScope||typeof deps.readLocal==='function'&&typeof deps.loadCleanupModule==='function','R32_MATRIX_RESULTS_TEST_SCOPE_REQUIRES_READERS');
 const s=deps.fixedScope??matrixResultsR32Scope,missing=matrixResultsR32MissingPins(s);if(missing.length)return {...base(),reason:'R32_MATRIX_RESULTS_ACTIVATION_NOT_FROZEN',missingPins:missing};
 assertScope(s);need(A.test(options.attempt??''),'R32_MATRIX_RESULTS_EXACT_ATTEMPT_REQUIRED');assertReference(options.cleanupRef);assertReference(s.activationReview);
 const d={readLocal:safeReadLocal,loadCleanupModule:()=>import('./verify-factory-truth-gate-matrix-cleanup-r32-r8.mjs'),...deps};
 const sources=['scripts/factory-truth-gate-probe-r32.mjs','scripts/factory-truth-gate-matrix-supervisor-r32-r2.mjs','scripts/factory-independent-pg-cjs-consumer-r29.mjs',s.cleanupModule,'scripts/read-factory-truth-gate-matrix-results-r32.mjs'];
 const pins=[s.source.probeSHA256,s.source.supervisorSHA256,s.source.pgConsumerSHA256,s.cleanupModuleSHA256,s.source.previousSupervisorOracleSHA256],n=sources.length;
 const initial=await settleEvidenceReads([...sources,options.cleanupRef.path,s.activationReview.path,matrixResultsR32JournalPath].map(path=>()=>d.readLocal(path,'utf8')));
 need(initial.slice(0,n).every((v,i)=>sha(v)===pins[i])&&sha(initial[n])===options.cleanupRef.sha256&&sha(initial[n+1])===s.activationReview.sha256,'R32_MATRIX_RESULTS_SOURCE_OR_RECEIPT_CHANGED');
 const cleanup=JSON.parse(initial[n]),review=JSON.parse(initial[n+1]),q=JSON.parse(initial[n+2]);
 need(review.staticPreparationReady===true&&review.remainingP0P1===0&&review.workerSHA256===s.workerSHA256&&review.starterSHA256===s.starterSHA256&&review.cleanupReaderSHA256===s.cleanupModuleSHA256,'R32_MATRIX_RESULTS_ACTIVATION_REVIEW_INVALID');
 need(cleanup.schemaVersion===1&&cleanup.kind==='software-factory-r32-truth-gate-matrix-independent-cleanup'&&cleanup.attempt===options.attempt&&cleanup.workerSHA256===s.workerSHA256&&cleanup.starterSHA256===s.starterSHA256&&R.test(cleanup.runID??'')&&cleanup.sourceFingerprint===s.source.fingerprint&&cleanup.sourceFiles===625&&cleanup.ready===true&&cleanup.cleanupIndependentlyVerified===true&&cleanup.protectedInventoryFullyVerified===true&&cleanup.fullQueueSQLVerified===true&&cleanup.productResultsIndependentlyQualified===false&&cleanup.rawPrivateDataExported===false&&obj(cleanup.host),'R32_MATRIX_RESULTS_ACTUAL_INDEPENDENT_CLEANUP_REQUIRED');
 const ref=cleanup.evidence?.host;assertReference(ref);const startRef=q.receipts?.start;assertReference(startRef);
 const secondPaths=[ref.path,startRef.path,s.cleanupScope.artifactContract.path,s.cleanupScope.imageContract.path];
 const second=await settleEvidenceReads(secondPaths.map(path=>()=>d.readLocal(path,'utf8')));
 need(sha(second[0])===ref.sha256&&same(JSON.parse(second[0]),cleanup.host)&&sha(second[1])===startRef.sha256&&sha(second[2])===s.cleanupScope.artifactContract.sha256&&sha(second[3])===s.cleanupScope.imageContract.sha256,'R32_MATRIX_RESULTS_ACTUAL_CONTEXT_CHANGED');
 const module=await d.loadCleanupModule(),B=module.assertMatrixCleanupR32Context(q,JSON.parse(second[1]),s.cleanupScope);
 need(B.attempt===options.attempt&&B.runID===cleanup.runID,'R32_MATRIX_RESULTS_ACTUAL_ATTEMPT_CHANGED');const flags=module.assertMatrixCleanupR32Host(cleanup.host,B);
 need(flags.cleanupIndependentlyVerified===true&&['activationSHA256','onceIntentSHA256','ownershipSHA256','controlInventorySHA256','toolsInventorySHA256'].every(k=>cleanup[k]===B[k])&&cleanup.stateSHA256===cleanup.host.stateSHA256&&cleanup.executionStatus===cleanup.host.executionStatus,'R32_MATRIX_RESULTS_CLEANUP_CONTEXT_NOT_CLOSED');
 const value=qualifyMatrixR32ReportEvidence(cleanup.host.reportEvidence,{attempt:B.attempt,runID:B.runID,artifactContractSHA256:s.cleanupScope.artifactContract.sha256});
 const final=await settleEvidenceReads([...sources,options.cleanupRef.path,s.activationReview.path,matrixResultsR32JournalPath,...secondPaths].map(path=>()=>d.readLocal(path,'utf8')));
 need(same(final,[...initial,...second]),'R32_MATRIX_RESULTS_LOCAL_EVIDENCE_CHANGED');
 return {...value,cleanupIndependentlyVerified:true,cleanupReference:options.cleanupRef,hostReference:ref,activationSHA256:B.activationSHA256,controlInventorySHA256:B.controlInventorySHA256,toolsInventorySHA256:B.toolsInventorySHA256,stateSHA256:cleanup.stateSHA256,localEvidenceDoubleReadStable:true};
}
export async function matrixResultsR32EvidenceWX(value){const path='artifacts/software-factory/goals-r29/truth-gate-matrix-r32-independent-results-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(value,null,2)+'\n';await mkdir('artifacts/software-factory/goals-r29',{recursive:true});const f=await open(path,'wx',0o644);try{await f.writeFile(raw);await f.sync()}finally{await f.close()}return {path,sha256:sha(raw)};}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let value;try{const args=process.argv.slice(2);need(args.length===0||args.length===3&&/^--attempt=[a-f0-9]{32}$/.test(args[0])&&/^--cleanup-path=artifacts\/software-factory\/goals-r29\/[A-Za-z0-9._-]+\.json$/.test(args[1])&&/^--cleanup-sha=[a-f0-9]{64}$/.test(args[2]),'R32_MATRIX_RESULTS_ARGUMENT_INVALID');value=await readFactoryTruthGateMatrixResultsR32(args.length?{attempt:args[0].slice(10),cleanupRef:{path:args[1].slice(15),sha256:args[2].slice(14)}}:{});}catch(e){value={...base(),reason:/^R32_MATRIX_RESULTS_[A-Z0-9_]+$/.test(e.message)?e.message:'R32_MATRIX_RESULTS_READ_INCOMPLETE'};}
 if(value.reason==='R32_MATRIX_RESULTS_ACTIVATION_NOT_FROZEN')console.log(JSON.stringify(value));else{const ref=await matrixResultsR32EvidenceWX(value);console.log(JSON.stringify({...ref,ready:value.ready,limitedMatrixAccepted:value.limitedMatrixAccepted??false,reason:value.reason}));}if(!value.ready)process.exitCode=1;
}
