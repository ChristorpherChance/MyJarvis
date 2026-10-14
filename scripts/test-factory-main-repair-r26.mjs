/** Local synthetic repair-driver tests. No remote machines, live API or model calls. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import * as driver from './run-factory-main-repair-r26.mjs';
const {
  repairScope, canonical, sha, nativeRepairTemplate, assertJournal,
  assertActualRun, assertBaselineRun, assertCleanupProof, safeFailureCode,
  failureReceipt, runFactoryMainRepair, parseRepairArguments, approvedBaselines, repairHostProgram, cleanupPathAllowed,
}=driver;

const clone=value=>structuredClone(value);
const S=repairScope;
const baselineStartId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const baselineRunId=sha('server-admin:'+baselineStartId).slice(0,40), baselineTaskId='baseline-task-fixture';
const attempt='b'.repeat(32), pairedAgentId='11111111-1111-4111-8111-111111111111';
const fixtureTime='2026-10-12T00:00:00.000Z';
const HEAD='89e6af3ac64f707c3ba6fc09e9e09fe4a4174171';
const cleanupPath='artifacts/software-factory/acceptance-r26/main-independent-cleanup-1791763200000-22222222-2222-4222-8222-222222222222.json';
const cleanupPathR264='artifacts/software-factory/acceptance-r26/main-independent-cleanup-r26-4-1791763200000-22222222-2222-4222-8222-222222222222.json';
const diagnosisPath='artifacts/software-factory/acceptance-r26/main-failures-readonly-diagnosis-r26-20261012.json';
const diagnosisPathR264='artifacts/software-factory/acceptance-r26/main-failures-readonly-diagnosis-r26-4-20261012.json';

function originalTemplate(){
  return {id:S.templateId,machineId:S.machineId,engine:'claude',program:'/fixture/claude',
    args:['--print','{prompt}','--model','old-model'],workspaceRoot:'/home/superopen/All-Projects',
    maxRounds:4,timeoutSec:1200,leaseSec:60,budgetCurrency:'USD',
    validation:{program:'/fixture/main-validator',args:['{workspace}','{runId}'],timeoutSec:600},
    supervision:{billing:'record-only',repairValidation:true,fallbackExecutorIds:['old-fallback']}};
}
function baselineFixture(baselineVersion='r26'){
  const selectedStartId=baselineVersion==='r26-4'?'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb':baselineStartId;
  const selectedRunId=sha('server-admin:'+selectedStartId).slice(0,40);
  const original=originalTemplate();
  const fixed={id:S.templateId,machineId:S.machineId,engine:'fixed',program:'/fixture/node',args:['/fixture/no-model.mjs'],
    workspaceRoot:original.workspaceRoot,maxRounds:1,timeoutSec:4200,leaseSec:60,budgetCurrency:'USD',
    validation:{program:'/usr/bin/sudo',args:['-n',baselineVersion==='r26-4'
      ?'/usr/local/libexec/jarvis-msf-main-acceptance-r26-4':'/usr/local/libexec/jarvis-msf-main-acceptance-r26','{workspace}','{runId}'],timeoutSec:3600}};
  const report={schemaVersion:1,kind:'project-autonomy-validation',status:'fail',simulated:false,
    runId:selectedRunId,workspace:S.source,goalSpecHash:S.goalSHA,workPackage:'FA-01',
    sourceFingerprint:S.baselineSHA,sourceStable:true,startedAt:'2026-10-11T23:00:00.000Z',finishedAt:'2026-10-11T23:30:00.000Z',
    checks:[{id:'tests',command:'fixture full test',required:true,executed:true,status:'fail',exitCode:1,
      evidenceSha256:'c'.repeat(64),tests:{total:332,passed:326,failed:6,skipped:0,unknown:0}}],
    artifacts:[{path:'fixture-report.json',sha256:'d'.repeat(64),bytes:100}]};
  const json=JSON.stringify(report);
  const batch={version:1,projectId:S.projectId,machineId:S.machineId,source:S.source,batchKey:'current-main-full',
    job:attempt,originalTemplate:original,fixedTemplate:fixed,nodeAgentId:pairedAgentId,
    sourceObservation:{sourceFingerprint:S.baselineSHA,files:593,gitBefore:{head:HEAD}},
    taskId:baselineTaskId,runId:selectedRunId,restored:true,intents:{start:{commandId:selectedStartId}}};
  const base={id:selectedRunId,domain:'tasks',kind:'development',scope:'personal',objectId:baselineTaskId,
    projectId:S.projectId,taskId:baselineTaskId,workspace:S.source,machineId:S.machineId,
    executorId:S.templateId,agentId:pairedAgentId,template:fixed,status:'failed',
    result:{source:'signed-agent',outcome:'failed',exitCode:0,
      validation:{exitCode:1,autonomyReportJson:json,autonomyReportSha256:sha(json)}}};
  return {batch,base,report};
}
function cleanupFixture(batch,base){
  return {schemaVersion:1,kind:'software-factory-current-main-independent-cleanup-audit',
    observedAt:fixtureTime,runId:batch.runId,attempt,projectId:S.projectId,expectedSourceFingerprint:S.baselineSHA,
    terminal:{observedAt:fixtureTime,runId:batch.runId,taskId:batch.taskId,status:base.status,terminal:true,ingestedSignedAgentReceipt:true,
      resultSource:'signed-agent',outcome:base.result.outcome,executionExitCode:base.result.exitCode,
      validationExitCode:base.result.validation.exitCode,storedRecordSHA256:'e'.repeat(64),signatureVerifierReexecuted:false,rawResultExported:false},
    host:{observedAt:fixtureTime,runId:batch.runId,attempt,lifecycleVerified:true,lifecycleSHA256:'f'.repeat(64),
      source:{currentSHA256:S.baselineSHA,expectedSHA256:S.baselineSHA,files:593,head:HEAD,unchanged:true},
      mainLabelScope:{runId:batch.runId,containers:[],networks:[],exactNamedResources:[{name:'fixture-main',present:false}]},
      brokerLabelScope:{containers:[],networks:[],exactNamedResources:[{name:'fixture-broker',present:false}]},
      broker:{status:'stopped',cleanupClaimsComplete:true,unresolvedCreateIntents:0,expectedProcessIdentityAlive:false,
        socketRootConfirmedFromPinnedSource:true,socket:{present:false},runtimeDirectory:{present:false}},
      coordinator:{cleanupClaimsComplete:true,expectedProcessIdentityAlive:false},relatedLiveProcesses:[],
      finalPrivateReport:{present:true,sha256:'1'.repeat(64),sourceStable:true,status:'fail'},
      resourcesActuallyAbsent:true,processesActuallyGone:true,errorCodes:[],rawLogsExported:false,
      privateEnvironmentExported:false,mutationsPerformed:false},
    cleanupIndependentlyVerified:true,status:'complete',productAccepted:false,modelsInvoked:false,businessServicesModified:false};
}

function stateFixture(options={}){
  const {batch,base,report}=baselineFixture(options.baselineVersion);
  const selectedCleanupPath=options.baselineVersion==='r26-4'?cleanupPathR264:cleanupPath;
  const selectedDiagnosisPath=options.baselineVersion==='r26-4'?diagnosisPathR264:diagnosisPath;
  if(options.partialBaseline)base.result.validation={exitCode:1,summary:'actual terminal has no detailed report'};
  if(options.baselineRunning)base.status='running';
  if(options.notRestored)batch.restored=false;
  const original=clone(batch.originalTemplate),frozen={id:'frozen-other',machineId:S.machineId,engine:'fixed',program:'/fixture/fixed',args:[]};
  const profile={goalSpecHash:S.goalSHA,config:{costPolicy:'record-only'},revision:20,templateHashes:{[frozen.id]:sha(frozen)}};
  const diagnosis={schemaVersion:1,kind:'software-factory-current-main-readonly-failure-diagnosis',
    projectId:S.projectId,taskId:batch.taskId,runId:batch.runId,attempt,
    source:{role:'current-main',workspace:S.source,head:HEAD,sha256:S.baselineSHA,publicFiles:593},
    scope:{readOnly:true,modelsInvoked:false,sourceModified:false,rawLogsExported:false,finalReportReviewed:true,objectivesAccepted:false},
    evidence:[{publicSourcePath:'apps/server/src/fixture.test.ts',sha256:'c'.repeat(64)}],
    groups:[{id:'R26-FIXTURE-FAILURE',classification:'test environment',checkId:'tests',
      sourceFingerprint:S.baselineSHA,runId:batch.runId,reportSha256:base.result.validation.autonomyReportSha256,
      currentEvidence:{failureReportBoundToCurrentRun:true}}]};
  const proof=cleanupFixture(batch,base);
  const state={batch,base,report,proof,diagnosis,profile,frozen,central:clone(original),node:clone(original),
    journal:undefined,task:undefined,runs:new Map(),events:[],reads:[],hostReads:[],outputs:[],startCount:0,
    createCount:0,copyCount:0,clock:Date.parse(fixtureTime),mainFingerprint:S.baselineSHA,runTemplateReads:[],
    queueBlockedAfterTask:options.queueBusyAfterTask===true,cancelCount:0};
  state.copies=[{machineId:S.machineId,path:S.source,branch:'main',environment:'development'},
    {machineId:S.machineId,path:'/fixture/previous-copy',branch:'previous',environment:'test'}];
  let uuid=0;
  const api=async(url,body)=>{
    state.events.push({url,mutation:body!==undefined});
    if(url.endsWith('/autonomy'))return {data:clone(state.profile)};
    if(url==='/api/v1/execution/supervision')return {data:{supervised:false,stopped:false}};
    if(url==='/api/v1/execution/config')return {data:{revision:1,templates:[clone(state.central),clone(state.frozen)],probes:[],wol:[]}};
    if(url==='/api/v1/execution/capabilities')return {data:{configuredTemplates:[{id:S.templateId,ready:!options.notReady}]}};
    if(url==='/api/v1/projects/'+S.projectId)return {data:{id:S.projectId,scope:'personal',ownerId:'server-admin',revision:1,copies:clone(state.copies)}};
    if(url==='/api/v1/projects/commands/copies'){
      state.copyCount++;assert.ok(body.payload.copies.some(copy=>copy.path===S.source),'existing copies must be retained');
      assert.ok(body.payload.copies.some(copy=>copy.path==='/fixture/previous-copy'),'all previous copies must be retained');
      state.copies=clone(body.payload.copies);
      return {data:{revision:2}};
    }
    if(url==='/api/v1/tasks/commands/create'){
      state.createCount++;state.task={id:'repair-task-fixture',ownerId:'server-admin',scope:'personal',revision:1,status:'queued',...clone(body.payload)};
      return {data:clone(state.task)};
    }
    if(url==='/api/v1/tasks/repair-task-fixture')return {data:clone(state.task)};
    if(url==='/api/v1/tasks/commands/cancel'){
      assert.equal(body.payload.taskId,state.task.id);assert.equal(body.scope,'personal');
      state.cancelCount++;state.task.status='cancelled';return {data:clone(state.task)};
    }
    if(url==='/api/v1/tasks/commands/start'){
      state.startCount++;
      const runId=sha('server-admin:'+body.commandId).slice(0,40);
      const run={id:runId,domain:'tasks',kind:'development',scope:'personal',objectId:state.task.id,taskId:state.task.id,
        projectId:S.projectId,machineId:S.machineId,executorId:S.templateId,agentId:pairedAgentId,
        workspace:S.workspace,template:clone(state.central),templateHash:sha(state.central),status:'queued',
        goal:state.task.goal,criteria:state.task.criteria,maxRounds:1,timeoutSec:state.central.timeoutSec,budgetUSD:1};
      state.runs.set(runId,run);state.task.executionRequest={id:runId};
      if(options.loseStartResponse)throw Error('API_503 fixture-start-response-lost');
      return {data:clone(state.task)};
    }
    if(url.startsWith('/api/v1/execution/runs/')){
      const runId=url.split('/').at(-1);
      if(runId===batch.runId)return {data:clone(state.base)};
      const run=state.runs.get(runId);if(!run)throw Error('API_404 fixture-run-absent');
      const publicRun=clone(run);delete publicRun.template;delete publicRun.templateHash;return {data:publicRun};
    }
    throw Error('UNEXPECTED_FIXTURE_API '+url);
  };
  const deps={api,
    readFile:async(name)=>{
      state.reads.push(String(name));
      if(String(name)===(S.journal??S.journalPath)){
        if(!state.journal)throw Object.assign(Error('fixture journal absent'),{code:'ENOENT'});
        return JSON.stringify(state.journal);
      }
      if(String(name)===(options.baselineVersion==='r26-4'
        ?'.jarvis-dev/maintenance/factory-main-acceptance-r26-4-current-main-full.json':S.batchPath))return JSON.stringify(state.batch);
      if(name===selectedCleanupPath)return JSON.stringify(state.proof);
      if(name===selectedDiagnosisPath)return JSON.stringify(state.diagnosis);
      throw Error('UNEXPECTED_FIXTURE_READ '+name);
    },
    saveJournal:async j=>{state.journal=clone(j);},
    nodeState:()=>({agentId:pairedAgentId,template:clone(state.node),unit:{ActiveState:'active',SubState:'running'},credentialsExported:false}),
    queueState:()=>({allActive:options.queueBusy||state.queueBlockedAfterTask&&state.createCount>0?1:0,fullTable:true,readOnly:true}),
    hostState:(mode,j)=>{
      state.hostReads.push({mode,j:clone(j)});
      if(mode==='prepare')state.copyPrepared=true;
      const source={sha256:state.mainFingerprint,files:593,bytes:100,metadataSHA:'3'.repeat(64),stable:true,identity:{device:1,inode:2}};
      const candidate=state.copyPrepared?{...source,identity:{device:1,inode:3}}:null;
      return {helperVerified:true,source,candidate,originBound:!!candidate,
        quiet:{active:true,children:state.hostQuietBusy?[123]:[],counts:{runs:0,deliveries:0,logs:0}},
        sourceFiles:{'apps/server/src/fixture.test.ts':'c'.repeat(64)},privateFilesCopied:false,gitHistoryCopied:false};
    },
    runTemplateSHA:async runId=>{state.runTemplateReads.push(runId);return sha(state.runs.get(runId)?.template??state.base.template);},
    putCentral:async(_api,expected,replacement)=>{
      assert.equal(canonical(state.central),canonical(expected));state.central=clone(replacement);state.events.push({centralChanged:true});return {revision:2};
    },
    patchNode:(expected,replacement)=>{
      assert.equal(canonical(state.node),canonical(expected));state.node=clone(replacement);state.events.push({nodeChanged:true});return {updated:true};
    },
    delay:async ms=>{state.clock+=ms;},now:()=>state.clock,
    randomUUID:()=>`00000000-0000-4000-8000-${String(++uuid).padStart(12,'0')}`,
    randomBytes:length=>Buffer.alloc(length,0x12),
  };
  state.execute=(action='start',overrides={})=>runFactoryMainRepair({action,cleanupPath:selectedCleanupPath,diagnosisPath:selectedDiagnosisPath,
    baselineVersion:options.baselineVersion,...overrides},deps);
  return state;
}

test('native repair is one record-only model round without main validation or a spending stop flag',()=>{
  const old=originalTemplate();
  old.args.push('--max-budget-usd','1'); old.supervision.maxCostUSD=1;
  const value=nativeRepairTemplate(old);
  assert.equal(value.engine,'claude'); assert.equal(value.maxRounds,1);
  assert.equal(value.workspaceRoot,S.parent); assert.equal(value.program,old.program);
  assert.ok(value.args.includes('gpt-6.1-sol[1m]'));
  assert.ok(!value.args.some(v=>/budget|cost-limit|max-cost/i.test(v)));
  assert.equal(value.validation,undefined); assert.equal(value.supervision.billing,'record-only');
  assert.equal(value.supervision.repairValidation,false); assert.deepEqual(value.supervision.fallbackExecutorIds,[]);
  assert.equal(value.supervision.maxCostUSD,undefined);
  assert.equal(value.budgetUSD,undefined);
});

test('terminal signed baseline requires original-template restoration and actual report bytes/hash',()=>{
  const {batch,base,report}=baselineFixture();
  assert.deepEqual(assertBaselineRun(base,batch),report);
  for(const status of ['queued','running','unknown'])assert.throws(()=>assertBaselineRun({...base,status},batch));
  assert.throws(()=>assertBaselineRun(base,{...batch,restored:false}));
  const partial=clone(base);partial.result.validation={exitCode:1,summary:'fixed process exit only'};
  assert.throws(()=>assertBaselineRun(partial,batch));
  const wrongHash=clone(base);wrongHash.result.validation.autonomyReportSha256='0'.repeat(64);
  assert.throws(()=>assertBaselineRun(wrongHash,batch));
});

test('baseline version allowlist binds r26-4 to its fixed journal and entry and rejects cross-version reuse',async()=>{
  assert.deepEqual(Object.keys(approvedBaselines).sort(),['r26','r26-4']);
  assert.deepEqual(approvedBaselines['r26-4'],{
    journalPath:'.jarvis-dev/maintenance/factory-main-acceptance-r26-4-current-main-full.json',
    entry:'/usr/local/libexec/jarvis-msf-main-acceptance-r26-4'});
  for(const baselineVersion of ['r26','r26-4']){
    assert.deepEqual(parseRepairArguments(['inspect','--baseline-version='+baselineVersion]),{action:'inspect',baselineVersion});
    assert.equal(parseRepairArguments(['start','--baseline-version='+baselineVersion,'--cleanup-proof='+cleanupPath,
      '--diagnosis='+diagnosisPath]).baselineVersion,baselineVersion);
    const {base,batch,report}=baselineFixture(baselineVersion);
    assert.deepEqual(assertBaselineRun(base,batch,{baselineVersion}),report);
    const other=baselineVersion==='r26'?'r26-4':'r26';
    assert.throws(()=>assertBaselineRun(base,batch,{baselineVersion:other}),/BASELINE_ENTRY_CHANGED/);
  }
  for(const value of ['r26-3','r26-5','r26-4/other','toString','constructor','__proto__']){
    assert.throws(()=>parseRepairArguments(['start','--baseline-version='+value]),/BASELINE_VERSION_INVALID/);
  }
  assert.throws(()=>parseRepairArguments(['start','--baseline-version=r26','--baseline-version=r26-4']),/ARGUMENT_INVALID/);
  const state=stateFixture({baselineVersion:'r26-4'});await state.execute('start');
  assert.ok(state.reads.includes(approvedBaselines['r26-4'].journalPath));
  assert.ok(!state.reads.includes(approvedBaselines.r26.journalPath));
  assert.equal(state.journal.baseline.version,'r26-4');
  assert.equal(state.journal.cleanupProof.path,cleanupPathR264);assert.equal(state.journal.diagnosis.path,diagnosisPathR264);
  const before=state.events.length;
  await assert.rejects(state.execute('check',{baselineVersion:'r26'}),/BASELINE_VERSION_INVALID/);
  assert.equal(state.events.length,before);
  const renamedOldDiagnosis=stateFixture({baselineVersion:'r26-4'});
  renamedOldDiagnosis.diagnosis.runId=baselineFixture('r26').batch.runId;
  assert.notEqual(renamedOldDiagnosis.diagnosis.runId,renamedOldDiagnosis.batch.runId);
  await assert.rejects(renamedOldDiagnosis.execute('start'),/DIAGNOSIS_BINDING_MISMATCH/);
  assert.ok(renamedOldDiagnosis.reads.includes(diagnosisPathR264));
  assert.equal(renamedOldDiagnosis.createCount,0);assert.equal(renamedOldDiagnosis.startCount,0);
  assert.ok(!renamedOldDiagnosis.events.some(e=>e.mutation||e.centralChanged||e.nodeChanged));
});

test('cleanup proof names require the exact version prefix, full timestamp and UUID',()=>{
  assert.equal(cleanupPathAllowed(cleanupPath,'r26'),true);
  assert.equal(cleanupPathAllowed(cleanupPathR264,'r26-4'),true);
  assert.equal(cleanupPathAllowed(cleanupPath,'r26-4'),false);
  assert.equal(cleanupPathAllowed(cleanupPathR264,'r26'),false);
  for(const value of [cleanupPathR264.replace('r26-4-','r26-3-'),cleanupPathR264.replace('r26-4-','r26-4-extra-'),
    cleanupPathR264.replace('1791763200000','179176320000'),cleanupPathR264.replace('22222222-2222-4222-8222-222222222222','22222222'),
    cleanupPathR264.replace('/main-independent-','/../main-independent-'),cleanupPathR264+'.json',
    cleanupPathR264.replace('main-independent-cleanup','main-cleanup')]){
    assert.equal(cleanupPathAllowed(value,'r26-4'),false,value);
  }
  assert.equal(cleanupPathAllowed(cleanupPathR264,'toString'),false);
  assert.equal(cleanupPathAllowed(cleanupPathR264,'r26-5'),false);
});

test('baseline report cannot substitute another run, workspace, goal, source or simulated evidence',()=>{
  const {batch,base,report}=baselineFixture();
  for(const [key,value] of Object.entries({runId:'9'.repeat(40),workspace:'/fixture/other',goalSpecHash:'8'.repeat(64),
    sourceFingerprint:'7'.repeat(64),sourceStable:false,simulated:true,kind:'collector-tests'})){
    const changed=clone(base),raw=JSON.stringify({...report,[key]:value});
    changed.result.validation.autonomyReportJson=raw;changed.result.validation.autonomyReportSha256=sha(raw);
    assert.throws(()=>assertBaselineRun(changed,batch),key);
  }
});

test('cleanup accepts only the independently audited exact-run schema and complete host observations',()=>{
  const {batch,base}=baselineFixture(),proof=cleanupFixture(batch,base);
  const validate=p=>assertCleanupProof(p,batch,base,{now:Date.parse(fixtureTime)});
  assert.doesNotThrow(()=>validate(proof));
  assert.throws(()=>validate({runId:batch.runId,clean:true,mainUnchanged:true}));
  const changes=[['runId','9'.repeat(40)],['projectId','other-project'],['cleanupIndependentlyVerified',false],
    ['status','incomplete'],['kind','untrusted-cleanup'],['expectedSourceFingerprint','0'.repeat(64)]];
  for(const [key,value] of changes)assert.throws(()=>validate({...proof,[key]:value}),key);
  for(const change of [p=>p.host.lifecycleVerified=false,p=>p.host.resourcesActuallyAbsent=false,
    p=>p.host.processesActuallyGone=false,p=>p.host.source.unchanged=false,
    p=>p.host.broker.unresolvedCreateIntents=1,p=>p.host.broker.cleanupClaimsComplete=false,
    p=>p.host.coordinator.cleanupClaimsComplete=false,p=>p.host.finalPrivateReport.present=false,
    p=>p.host.finalPrivateReport.sourceStable=false,p=>p.host.relatedLiveProcesses=[{pid:123}],
    p=>p.host.errorCodes=['FIXTURE_INCOMPLETE'],p=>p.terminal.ingestedSignedAgentReceipt=false]){
    const changed=clone(proof);change(changed);assert.throws(()=>validate(changed));
  }
});

test('inspect reports an incomplete signed baseline as not ready without creating or changing anything',async()=>{
  const state=stateFixture({partialBaseline:true}),result=await state.execute('inspect');
  assert.equal(result.ready,false);assert.equal(result.dispatch,false);
  assert.equal(state.startCount,0);assert.equal(state.createCount,0);assert.equal(state.copyCount,0);
  assert.ok(!state.events.some(event=>event.mutation||event.centralChanged||event.nodeChanged));
  assert.equal(state.journal,undefined);
});

test('start rejects running, unrestored or incomplete baselines before any mutation',async()=>{
  for(const options of [{baselineRunning:true},{notRestored:true},{partialBaseline:true}]){
    const state=stateFixture(options);await assert.rejects(state.execute('start'));
    assert.equal(state.startCount,0);assert.equal(state.createCount,0);
    assert.ok(!state.events.some(event=>event.mutation||event.centralChanged||event.nodeChanged));
  }
  const untrusted=stateFixture();untrusted.proof={runId:baselineRunId,clean:true,mainUnchanged:true};
  await assert.rejects(untrusted.execute('start'));
  assert.ok(!untrusted.events.some(event=>event.mutation||event.centralChanged||event.nodeChanged));
});

test('lost dispatch response reconciles the exact existing run with read-only API calls and never starts twice',async()=>{
  const state=stateFixture({loseStartResponse:true});await assert.rejects(state.execute('start'),/API_503/);
  assert.equal(state.startCount,1);
  const before=state.events.length;await state.execute('start');
  assert.equal(state.startCount,1);assert.equal(state.createCount,1);assert.equal(state.copyCount,1);
  assert.ok(!state.events.slice(before).some(event=>event.mutation||event.centralChanged||event.nodeChanged));
});

test('missing run after attempted dispatch remains ambiguous and never repeats the command',async()=>{
  const state=stateFixture({loseStartResponse:true});await assert.rejects(state.execute('start'),/API_503/);
  state.runs.clear();const before=state.events.length;
  await assert.rejects(state.execute('start'),/RECONCIL|AMBIGUOUS|UNCONFIRMED/);
  assert.equal(state.startCount,1);assert.equal(state.createCount,1);
  assert.ok(!state.events.slice(before).some(event=>event.mutation||event.centralChanged||event.nodeChanged));
});

test('prepared template can restore when no task or run was ever dispatched',async()=>{
  const state=stateFixture({notReady:true});await assert.rejects(state.execute('start'),/NOT_READY/);
  assert.ok(state.journal);assert.equal(state.startCount,0);assert.equal(state.createCount,0);
  const result=await state.execute('restore');
  assert.equal(result.restored,true);
  assert.equal(canonical(state.central),canonical(state.batch.originalTemplate));
  assert.equal(canonical(state.node),canonical(state.batch.originalTemplate));
  assert.equal(state.startCount,0);
});

test('a prepared task is cancelled before its template is restored without dispatching a run',async()=>{
  const state=stateFixture({queueBusyAfterTask:true});await assert.rejects(state.execute('start'),/QUEUE_NOT_IDLE/);
  assert.equal(state.createCount,1);assert.equal(state.startCount,0);assert.ok(state.journal.runId);
  assert.equal(state.journal.dispatchAttemptedAt,undefined);
  state.queueBlockedAfterTask=false;const before=state.events.length;
  const result=await state.execute('restore');
  assert.equal(result.restored,true);assert.equal(state.cancelCount,1);assert.equal(state.task.status,'cancelled');
  assert.equal(state.startCount,0);assert.equal(state.runs.size,0);
  const changes=state.events.slice(before);
  assert.ok(changes.findIndex(e=>e.url==='/api/v1/tasks/commands/cancel')<changes.findIndex(e=>e.centralChanged));
  assert.equal(canonical(state.central),canonical(state.batch.originalTemplate));
  assert.equal(canonical(state.node),canonical(state.batch.originalTemplate));
});

test('only signed late cancellation can restore after node quiet proof while cancelled/late/stop evidence is preserved',async()=>{
  const state=stateFixture();await state.execute('start');
  const run=state.runs.values().next().value;
  run.status='cancelled';run.stopRequested=true;
  run.result={source:'signed-agent',outcome:'cancelled',exitCode:-1,rounds:1,lateEvidenceOnly:true};
  const frozenRun=clone(run),before=state.events.length;
  state.hostQuietBusy=true;
  await assert.rejects(state.execute('restore'),/NODE_NOT_RECONCILED/);
  assert.ok(!state.events.slice(before).some(e=>e.mutation||e.centralChanged||e.nodeChanged));
  state.hostQuietBusy=false;const receipt=await state.execute('restore');
  assert.equal(receipt.restored,true);assert.equal(receipt.status,'cancelled');assert.equal(receipt.outcome,'cancelled');
  assert.equal(receipt.signed,true);assert.equal(receipt.lateEvidenceOnly,true);assert.equal(receipt.stopRequested,true);
  assert.equal(receipt.productAccepted,false);assert.deepEqual(run,frozenRun);
  assert.equal(state.cancelCount,0);assert.equal(state.startCount,1);
  for(const invalid of [{status:'cancelled',source:'unsigned',lateEvidenceOnly:true},
    {status:'failed',source:'signed-agent',lateEvidenceOnly:true},
    {status:'succeeded',source:'signed-agent',lateEvidenceOnly:true}]){
    const bad=stateFixture();await bad.execute('start');
    const r=bad.runs.values().next().value;r.status=invalid.status;r.stopRequested=true;
    r.result={source:invalid.source,outcome:invalid.status,exitCode:-1,lateEvidenceOnly:invalid.lateEvidenceOnly};
    const count=bad.events.length;await assert.rejects(bad.execute('restore'),/TERMINAL_REQUIRED/);
    assert.ok(!bad.events.slice(count).some(e=>e.mutation||e.centralChanged||e.nodeChanged));
    assert.notEqual(bad.journal.restored,true);
  }
});

test('record-only accounting accepts a real result above the compatibility task budget',async()=>{
  const state=stateFixture();await state.execute('start');
  const run=state.runs.values().next().value;
  run.status='succeeded';run.result={source:'signed-agent',outcome:'success',exitCode:0,rounds:1,
    usage:{inputTokens:100,outputTokens:50,totalTokens:150,costUSD:9000,knownCostUSD:9000,costComplete:true,usageComplete:true}};
  const result=await state.execute('check');
  assert.equal(result.costPolicy,'record-only');assert.equal(result.productAccepted,false);
  assert.equal(result.usage.costUSD,9000);assert.equal(state.task.budget,1);
  assert.equal(state.central.validation,undefined);
  assert.ok(!state.central.args.some(v=>v.startsWith('--max-budget-usd')));
});

test('main fingerprint is observed again and changed content cannot be reported unchanged',async()=>{
  const state=stateFixture();await state.execute('start');
  const before=state.hostReads.length;
  const result=await state.execute('check');
  assert.ok(state.hostReads.length>before,'check must read the actual main state');
  assert.equal(result.sourceMainObservedUnchanged,true);
  state.mainFingerprint='9'.repeat(64);
  await assert.rejects(state.execute('check'),/SOURCE|MAIN|FINGERPRINT/);
});

test('journal and actual run freeze task/run/template identities instead of trusting IDs alone',async()=>{
  const state=stateFixture();await state.execute('start');
  const j=clone(state.journal),task=clone(state.task),run=clone(state.runs.values().next().value);
  assert.doesNotThrow(()=>assertJournal(j));assert.doesNotThrow(()=>assertActualRun(run,task,j));
  for(const [key,value] of Object.entries({projectId:'other-project',machineId:'other-machine',workspace:'/fixture/other'})){
    assert.throws(()=>assertJournal({...j,scope:{...j.scope,[key]:value}}),key);
  }
  assert.throws(()=>assertJournal({...j,baseline:{...j.baseline,runId:'0'.repeat(40)}}));
  assert.throws(()=>assertJournal({...j,job:'invalid'}));
  assert.throws(()=>assertJournal({...j,templateSHA:'0'.repeat(64)}));
  assert.throws(()=>assertJournal({...j,originalTemplateSHA:'0'.repeat(64)}));
  const changedStart=clone(j);changedStart.intents.start.commandId='33333333-3333-4333-8333-333333333333';
  assert.throws(()=>assertJournal(changedStart));
  const changedCreate=clone(j);changedCreate.intents.create.payload.goal='forged goal';
  assert.throws(()=>assertJournal(changedCreate));
  for(const [key,value] of Object.entries({id:'0'.repeat(40),domain:'other',kind:'other',scope:'company',objectId:'other-task',
    taskId:'other-task',projectId:'other-project',machineId:'other-machine',executorId:'other-executor',
    agentId:'other-agent',workspace:'/fixture/other',goal:'forged-goal',criteria:'forged-criteria',maxRounds:2,
    timeoutSec:99999,budgetUSD:0,purpose:'autonomy'})){
    assert.throws(()=>assertActualRun({...run,[key]:value},task,j),key);
  }
  const wrongTemplate=clone(run);wrongTemplate.template.args.push('--max-budget-usd','1');
  assert.throws(()=>assertActualRun(wrongTemplate,task,j));
  for(const [key,value] of Object.entries({ownerId:'other-owner',scope:'company',mode:'manual',projectId:'other-project',
    machineId:'other-machine',agent:'other-executor',worktree:'/fixture/other',goal:'forged-goal',criteria:'forged-criteria',
    title:'forged-title',budget:0,retryLimit:5})){
    assert.throws(()=>assertActualRun(run,{...task,[key]:value},j),key);
  }
});

test('private frozen run template hash is re-read even when public run data omits the template',async()=>{
  const state=stateFixture();await state.execute('start');
  const run=state.runs.values().next().value,before=state.runTemplateReads.length;
  run.template.supervision.billing='capped';
  await assert.rejects(state.execute('check'),/FROZEN_RUN_TEMPLATE_CHANGED/);
  assert.ok(state.runTemplateReads.length>before);
});

test('persisted wrong journal scope is rejected before any API read and baseline result hashes stay frozen',async()=>{
  const state=stateFixture();await state.execute('start');
  const valid=clone(state.journal),before=state.events.length;
  state.journal.scope.workspace='/fixture/other';await assert.rejects(state.execute('check'),/JOURNAL_SCOPE_INVALID/);
  assert.equal(state.events.length,before);
  state.journal=valid;state.base.result.summary='a different signed terminal result';
  await assert.rejects(state.execute('check'),/FROZEN_BASELINE_CHANGED/);
});

test('public error code never contains a response body, template or private journal contents',()=>{
  const body='API_BODY_SECRET template=PRIVATE_TEMPLATE_SECRET privatejournal=PRIVATE_JOURNAL_SECRET';
  assert.equal(safeFailureCode(Error('API_503 '+body)),'MAIN_REPAIR_API_503');
  assert.match(safeFailureCode(Error(body)),/^[A-Z][A-Z0-9_]*$/);
  for(const input of [body,'MAIN_REPAIR_SCOPE_CHANGED '+body,'API_503 '+body]){
    const serialized=JSON.stringify({errorCode:safeFailureCode(Error(input))});
    assert.ok(!serialized.includes('SECRET')); assert.ok(!serialized.includes('template='));assert.ok(!serialized.includes('privatejournal='));
  }
  const receipt=failureReceipt(Error('API_503 '+body),'start',{taskId:'fixture-task',runId:'fixture-run',
    template:'PRIVATE_TEMPLATE_SECRET',privatejournal:'PRIVATE_JOURNAL_SECRET',dispatchAttemptedAt:fixtureTime});
  assert.equal(receipt.errorCode,'MAIN_REPAIR_API_503');assert.equal(receipt.privateJournalExported,false);
  assert.ok(!JSON.stringify(receipt).includes('SECRET'));
});

test('actual CLI failure receipt omits API response bodies, templates and private journal data',async()=>{
  const source=await readFile(new URL('./run-factory-main-repair-r26.mjs',import.meta.url),'utf8');
  const code=String.raw`
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as url from 'node:url';
let source='';for await(const chunk of process.stdin)source+=chunk;
const outputs=[],writes=[],errors=[];let remoteCalls=0,apiCalls=0;
const missing=()=>Object.assign(Error('fixture absent'),{code:'ENOENT'});
const forbidden=()=>{remoteCalls++;throw Error('UNEXPECTED_REMOTE_CALL');};
const filename=path.resolve('scripts/run-factory-main-repair-r26.mjs');
const api=async()=>{apiCalls++;throw Error('API_503 '+JSON.stringify({error:{code:'FIXTURE_FAILURE',message:'API_BODY_SECRET',template:'PRIVATE_TEMPLATE_SECRET',privatejournal:'PRIVATE_JOURNAL_SECRET'}}));};
const fs={readFile:async()=>{throw missing();},lstat:async()=>{throw missing();},
  writeFile:async(name,bytes)=>writes.push({name,bytes:String(bytes)}),mkdir:async()=>{},rename:async()=>{},
  open:async name=>({writeFile:async bytes=>{if(String(name).startsWith('artifacts/software-factory/acceptance-r26/'))writes.push({name,bytes:String(bytes)});},
    sync:async()=>{},close:async()=>{}}),unlink:async()=>{}};
const managed={withPlatform:async fn=>fn({api}),remote:forbidden,primary:forbidden,lanProfile:'mock-only',python:(p,s)=>({p,s})};
const helpers={nodeState:forbidden,queueState:forbidden,patchNode:forbidden,putCentral:forbidden};
const definitions={'node:fs/promises':fs,'node:crypto':crypto,'node:path':path,'node:url':url,
 './managed-server-client.mjs':managed,'./run-factory-supervision-probe.mjs':helpers,
 './verify-software-factory-execution.mjs':{expectedRunId:id=>crypto.createHash('sha256').update('server-admin:'+id).digest('hex').slice(0,40)}};
const context=vm.createContext({Buffer,URL,setTimeout,clearTimeout,Date,
  process:{argv:['node',filename,'inspect'],exitCode:0},console:{log:v=>outputs.push(String(v)),error:v=>outputs.push(String(v))}});
const module=new vm.SourceTextModule(source,{context,identifier:url.pathToFileURL(filename).href,
  initializeImportMeta:meta=>{meta.url=url.pathToFileURL(filename).href;}});
try{
 await module.link(name=>{
  const value=definitions[name];if(!value)throw Error('UNEXPECTED_IMPORT '+name);
  return new vm.SyntheticModule(Object.keys(value),function(){for(const [key,item] of Object.entries(value))this.setExport(key,item);},{context});
 });
 await module.evaluate();
}catch(error){errors.push(error.message);}
console.log(JSON.stringify({outputs,writes,errors,remoteCalls,apiCalls}));
`;
  const result=spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',code],
    {input:source,encoding:'utf8',windowsHide:true,cwd:new URL('..',import.meta.url)});
  assert.equal(result.status,0,result.stderr);
  const capture=JSON.parse(result.stdout);
  assert.equal(capture.remoteCalls,0);assert.equal(capture.apiCalls,1);
  assert.equal(capture.writes.length,1,'failure must retain one reviewable public receipt');
  const receipt=JSON.parse(capture.writes[0].bytes);
  assert.equal(receipt.errorCode,'MAIN_REPAIR_API_503');assert.equal(receipt.privateJournalExported,false);
  assert.equal(receipt.productAccepted,false);assert.equal(receipt.automaticRetry,false);
  const publicText=JSON.stringify(capture);
  assert.ok(!/API_BODY_SECRET|PRIVATE_TEMPLATE_SECRET|PRIVATE_JOURNAL_SECRET/.test(publicText));
});

test('host Python parses locally and retains trusted-byte, descriptor-copy and private recovery guards without executing them',()=>{
  const astCode=String.raw`
import ast,json,sys
tree=ast.parse(sys.stdin.read())
calls=[n for n in ast.walk(tree) if isinstance(n,ast.Call)]
guards={}
for n in calls:
 if isinstance(n.func,ast.Name) and n.func.id=='need' and len(n.args)==2 and isinstance(n.args[1],ast.Constant):
  guards.setdefault(n.args[1].value,[]).append(ast.unparse(n.args[0]))
print(json.dumps({'parsed':True,'calls':[ast.unparse(n) for n in calls],
 'assignments':[ast.unparse(n) for n in ast.walk(tree) if isinstance(n,ast.Assign)],
 'imports':[ast.unparse(n) for n in ast.walk(tree) if isinstance(n,(ast.Import,ast.ImportFrom))],
 'guards':guards}))
`;
  const result=spawnSync('python',['-c',astCode],{input:repairHostProgram,encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stderr);
  const facts=JSON.parse(result.stdout),calls=facts.calls.join('\n'),assignments=facts.assignments.join('\n');
  assert.equal(facts.parsed,true);
  assert.ok(facts.imports.includes('from types import ModuleType'));
  assert.match(assignments,/sys\.dont_write_bytecode = True/);
  assert.match(calls,/signal\.signal\(signal\.SIGALRM, deadline\)/);
  assert.match(calls,/signal\.alarm\(150\)/);
  assert.match(calls,/RuntimeError\('MAIN_REPAIR_HOST_OBSERVATION_TIMEOUT'\)/);
  assert.match(calls,/exec\(compile\(body, str\(tool\), 'exec'\), h\.__dict__\)/);
  assert.ok(!facts.imports.some(value=>value.includes('importlib')));
  const guards=facts.guards;
  assert.match(assignments,/original_write = os\.write/);assert.match(assignments,/os\.write = checked_write/);
  assert.match(calls,/original_write\(fd, data\)/);
  assert.ok(guards.MAIN_REPAIR_SNAPSHOT_SHORT_WRITE.includes('not data or n > 0'));
  assert.match(calls,/h\.snapshot\(p\['source'\], str\(prep \/ 'snapshot'\)\)/);
  assert.ok(guards.MAIN_REPAIR_COPY_TOOL_CHANGED.some(value=>value.includes("hashlib.sha256(body).hexdigest() == p['helperSHA']")));
  assert.ok(guards.MAIN_REPAIR_ROOT_CHAIN_UNTRUSTED.some(value=>value.includes('not stat.S_ISLNK')&&value.includes('s.st_uid == 0')));
  assert.match(calls,/os\.mkdir\([^\n]+dir_fd=host\)/);
  assert.match(calls,/os\.rename\([^\n]+dst_dir_fd=target\)/);
  assert.match(calls,/os\.stat\(name, dir_fd=fd, follow_symlinks=False\)/);
  assert.match(calls,/os\.open\(name, [^\n]+os\.O_NOFOLLOW[^\n]+dir_fd=fd\)/);
  assert.ok(guards.MAIN_REPAIR_COPY_ENTRY_CHANGED.some(value=>value.includes('x.st_nlink == 1')&&value.includes('x.st_dev')));
  const originScope=guards.MAIN_REPAIR_ORIGIN_SCOPE_CONFLICT.join('\n');
  for(const key of ['version','job','workspace','parent','baselineSHA'])assert.ok(originScope.includes("origin.get('"+key+"')"),key);
  assert.ok(guards.MAIN_REPAIR_PARTIAL_COPY_RECONCILIATION_REQUIRED.some(value=>
    ['snapshot-ready','handoff-intent','ready'].every(phase=>value.includes("'"+phase+"'"))));
  assert.match(assignments,/origin\['phase'\] = 'snapshot-ready'/);
  assert.match(assignments,/origin\['phase'\] = 'handoff-intent'/);
  assert.match(assignments,/origin\['phase'\] = 'ready'/);
  assert.ok(guards.MAIN_REPAIR_PARENT_REPLACED.some(value=>value.includes('identity(target)')));
  assert.ok(guards.MAIN_REPAIR_COPY_REPLACED.some(value=>value.includes('identity(q)')));
  assert.match(calls,/os\.open\(temporary, [^\n]+os\.O_EXCL[^\n]+os\.O_NOFOLLOW, 384\)/);
  assert.ok(guards.MAIN_REPAIR_ORIGIN_SHORT_WRITE.includes('n > 0'));
  assert.match(assignments,/view = view\[n:\]/);
  assert.match(calls,/os\.fsync\(fd\)/);assert.match(calls,/os\.replace\(temporary, prep \/ 'origin.json'\)/);
});
