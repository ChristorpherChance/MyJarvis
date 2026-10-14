/** R29 independent QA draft. Import has no IO. CLI can only inspect this plan.
 * No live adapter, fixture writer, database connection or HTTP client is wired.
 * New candidate schema and independent evidence rules must be reviewed first.
 */
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const code=v=>/^[A-Z][A-Z0-9_]{0,100}$/.test(v??'')?v:'QA_UNCLASSIFIED_ERROR';
const need=(v,c)=>{if(!v)throw Error(c);};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export const draftScope=Object.freeze({
 projectId:'70ec346f-6520-46ed-abed-22cac770a3e4',
 machineId:'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',
 workspace:'/home/superopen/All-Projects/msf-targets-r29/source',
 initialFingerprint:'9b07a5115c22d14f82e04ba45b66efbc5ac04f7faa696ab84d81e33696ec7b76',
 observedCandidateFingerprint:'4907e45a21799f2dd14ac2373769607f40d6b9e0319bb614fbe259b157e60493',
 observedCandidateMetadata:'2da9d3e490fd6d042113c067807a89b000a4f40fdb5fa8d3ca2911b6615ebce8',
 observedCandidateFiles:621,
 sourceTaskId:'c45462b0-6a28-433c-af8c-d656bd1d2ad3',
 sourceRunId:'d9f1095aae0edc1b848487b1b567f3be29f25f3b',
 expectedInternalBaseURL:'http://127.0.0.1:18930',
 expectedContainerSource:'/work/source',
 newCandidateBytesReadLocally:false,
 newSchemaApproved:false,
 runtimeWired:false,
 ready:false,
 acceptanceEvidence:false,
});

// These are independent readback oracles for the old known column contract.
// A future reviewed adapter must compare new migrations/columns before use.
// Queries never change data; fixture writes are deliberately not implemented.
export const draftSnapshotQueries=Object.freeze({
 batch:'SELECT id, project_id, status, environment_fingerprint FROM tst_batches WHERE id=$1 AND project_id=$2',
 reports:'SELECT id, code, verdict, status, basis_fingerprint FROM tst_reports WHERE batch_id=$1 ORDER BY created_at,id',
 decisions:"SELECT id, code, report_id, decision FROM tst_decisions WHERE batch_id=$1 ORDER BY created_at,id",
 plans:'SELECT id, code, state, version_no FROM tst_plans WHERE batch_id=$1 ORDER BY version_no,id',
 cases:'SELECT c.id,c.code,c.must_run,c.mode,c.content_hash FROM tst_cases c JOIN tst_plans p ON p.id=c.plan_id WHERE p.batch_id=$1 ORDER BY p.version_no,c.code,c.id',
 runs:'SELECT id,code,plan_id,is_simulated,conclusion FROM tst_runs WHERE batch_id=$1 AND project_id=$2 ORDER BY created_at,id',
 results:'SELECT cr.run_id,cr.case_id,cr.result,cr.is_simulated,cr.executor_kind,cr.evidence_ids FROM tst_case_runs cr JOIN tst_runs r ON r.id=cr.run_id WHERE r.batch_id=$1 AND r.project_id=$2 ORDER BY cr.run_id,cr.case_id,cr.id',
 defects:'SELECT code,status,severity FROM tst_defects WHERE batch_id=$1 AND project_id=$2 ORDER BY code',
});

const negative=(id,title,variants)=>Object.freeze({id,title,kind:'negative',variants:Object.freeze(variants),
 expectation:'No formal pass or durable release. Permit rejection at an approved semantic gate; verify committed state after every attempted request.'});
const positive=(id,title,variants)=>Object.freeze({id,title,kind:'positive',variants:Object.freeze(variants),
 expectation:'Legitimate real evidence may complete the approved workflow, including durable matching normal release and independently readable evidence bytes.'});
export const draftMatrix=Object.freeze([
 negative('N01','mock must remain simulated',['execute-auto-origin','mock-normal-release','mock-conditional-release']),
 negative('N02','legacy or unknown origin cannot become real',['legacy-row-with-no-origin','unknown-executor','unknown-evidence-origin']),
 negative('N03','empty required scope is not pass',['empty-approved-plan','empty-run','no-case-result-rows']),
 negative('N04','all applicable mandatory cases accounted for',['missing-result-row','not-run','unknown-result','mandatory-case-not-in-latest-run']),
 negative('N05','failure/blocking cannot be waived',['failed-case','blocked-case','blocked-batch','open-P0','open-P1']),
 negative('N06','real evidence is readable and integrity bound',['empty-evidence','unknown-evidence-id','missing-object','wrong-byte-hash','claimed-but-not-executed']),
 negative('N07','current input baseline and environment match',['wrong-build-fingerprint','wrong-design-baseline','wrong-plan-version','wrong-environment']),
 negative('N08','post-finalization results/origin mutation invalidates',['changed-result','changed-simulation','changed-executor','changed-evidence-set']),
 negative('N09','post-finalization case/scope mutation invalidates',['case-added','case-deleted','changed-case-content','changed-required-flag','new-approved-plan']),
 negative('N10','post-finalization baseline/defect mutation invalidates',['changed-batch-baseline','changed-environment','new-blocking-defect','changed-defect-severity','reopened-defect']),
 negative('N11','not-applicable requires valid applicability basis',['mandatory-na-without-basis','na-rule-invalid','na-rule-stale']),
 negative('N12','transaction/idempotency/ownership boundaries',['result-update-vs-finalize','report-update-vs-release','same-key-other-body','cross-project-object','assistant-manual-policy']),
 positive('P01','actual manual observation and real byte evidence',['real-http-observation-manual-result','actual-attachment-upload-download','current-complete-normal-release']),
 positive('P02','lawfully nonmandatory not-applicable item',['valid-nonmandatory-na-with-all-required-complete']),
 positive('P03','upgrade/new report preserves old unknown history',['clean-schema','old-schema-upgrade','new-real-run-report-after-old-unknown']),
]);

export const draftUnknowns=Object.freeze([
 'Actual new621 file manifest, all changed service/migration/fixture bytes and declared source/evidence schema have not been read locally.',
 'New execution-origin format, trusted-source allowlist, actual-required-case applicability rules and evidence integrity fields must be frozen from actual code and reviewed against business intent.',
 'New semantic rejection codes and valid report generation/finalization/export policy are unknown. Arbitrary 4xx or setup errors cannot count as passed negative checks.',
 'Legitimate positive fixtures need verified upstream/batch/plan/baseline plus actual independent execution evidence. Do not relabel a synthetic pass note as a real execution.',
 'Actual internal HTTP route payloads, per-project IDs/codes and multipart/raw-byte evidence uploads must be verified against new controllers.',
 'Migrations, backfill and downgrade behavior must be reviewed. Old defaults(false) or evidence absence cannot silently become trusted.',
 'Parallel schedule/locking and applicability exceptions need expanded frozen individual cases;15 groups are planning labels, not an executed denominator.',
]);

export function draftInspection(){return {schemaVersion:1,kind:'r29-truth-gate-probe-draft-inspection',
 scope:draftScope,plannedGroups:{negative:12,positive:3},plannedVariantCount:draftMatrix.reduce((n,x)=>n+x.variants.length,0),
 matrix:draftMatrix,unknowns:draftUnknowns,readbackQueriesSHA256:hash(draftSnapshotQueries),
 httpRoutePrefix:'/api/v1/projects/:projectId/acceptance',
 writeRequestContract:'Separate Idempotency-Key per distinct request; scoped isolated cookie only. No production origin, provider or broad SQL endpoint.',
 failureContract:'Each independent case has its own fixture; catch setup/request failures; always try durable SQL readback; continue every remaining case. Unknown/setup failure is incomplete, never a safe rejection.',
 newEntryProposed:'/usr/local/libexec/jarvis-msf-truth-gate-r29',
 newEntryInstalled:false,newScopeAuthorized:false,testsExecuted:0,modelsInvoked:false,networkOperations:false};}

/** Preparation helper only. Results from arbitrary adapters never become acceptance.
 * The live reviewed adapter must later bind HTTP and SQL to the fresh isolated
 * runtime and to the source/schema/tool hashes. This draft does not implement it.
 */
export async function observeDraftCase(scenario,adapter){
 need(draftMatrix.some(x=>x.id===scenario?.groupId&&x.variants.includes(scenario?.variant)),'QA_CASE_NOT_IN_DRAFT_MATRIX');
 need(typeof adapter?.prepareFixture==='function'&&typeof adapter?.attemptActualWorkflow==='function'&&typeof adapter?.readCommittedState==='function','QA_DRAFT_ADAPTER_INCOMPLETE');
 const row={groupId:scenario.groupId,variant:scenario.variant,acceptanceEvidence:false,status:'incomplete',
   fixturePrepared:false,workflowAttempted:false,durableReadbackObserved:false,rejection:null,errorCode:null,observedFormalState:null};
 let fixture;
 try{fixture=await adapter.prepareFixture(scenario);need(uuid.test(fixture?.projectId??'')&&uuid.test(fixture?.batchId??'')&&fixture.isolated===true,'QA_DRAFT_FIXTURE_SCOPE_INVALID');row.fixturePrepared=true;
  row.workflowAttempted=true;const attempt=await adapter.attemptActualWorkflow(scenario,fixture);row.rejection=attempt?.rejection?{stage:attempt.rejection.stage,errorCode:code(attempt.rejection.errorCode)}:null;
 }catch(e){row.errorCode=code(e?.code??e?.message);}
 finally{if(fixture){try{const state=await adapter.readCommittedState(fixture);need(state?.batchId===fixture.batchId&&state.projectId===fixture.projectId&&state.observed===true,'QA_DRAFT_READBACK_SCOPE_INVALID');
   need(Number.isSafeInteger(state.releaseDecisions)&&state.releaseDecisions>=0&&Number.isSafeInteger(state.formalPassReports)&&state.formalPassReports>=0&&typeof state.batchStatus==='string','QA_DRAFT_READBACK_INCOMPLETE');
   row.durableReadbackObserved=true;row.observedFormalState={batchStatus:state.batchStatus,releaseDecisions:state.releaseDecisions,formalPassReports:state.formalPassReports};
   if(state.releaseDecisions>0||state.batchStatus==='released'||state.formalPassReports>0)row.status='formal-state-observed-unclassified';
  }catch(e){row.readbackErrorCode=code(e?.code??e?.message);}}}
 // Do not turn arbitrary adapter results or anticipated schema into a green check.
 return row;
}

export async function observeDraftMatrix(expandedCases,adapter){
 need(Array.isArray(expandedCases)&&expandedCases.length>0&&expandedCases.length<=100,'QA_DRAFT_CASE_MANIFEST_INVALID');
 const ids=new Set();for(const x of expandedCases){need(typeof x.id==='string'&&/^[NP][0-9]{2}-[a-z0-9-]+$/.test(x.id)&&!ids.has(x.id),'QA_DRAFT_CASE_ID_INVALID');ids.add(x.id);}
 const rows=[];for(const x of expandedCases){try{rows.push({id:x.id,...await observeDraftCase(x,adapter)});}catch(e){rows.push({id:x.id,status:'incomplete',errorCode:code(e?.code??e?.message),acceptanceEvidence:false});}}
 return {schemaVersion:1,kind:'r29-truth-gate-controlled-adapter-draft-observation',sourceSchemaFrozen:false,
   acceptanceEvidence:false,productAccepted:false,ready:false,casesObserved:rows.length,rows};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{need(process.argv.slice(2).length<=1&&['--inspect',undefined].includes(process.argv[2]),'QA_DRAFT_EXECUTION_NOT_READY');
  console.log(JSON.stringify(draftInspection(),null,2));
 }catch(e){console.error(JSON.stringify({kind:'r29-truth-gate-probe-draft',errorCode:code(e?.message),ready:false,testsExecuted:0,networkOperations:false,acceptanceEvidence:false}));process.exitCode=1;}
}
