import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {repairScope as S,sha} from './run-factory-main-repair-r26.mjs';
import {verifierScope as V,fixedToolSHA} from './prepare-factory-repair-verifier-r26.mjs';
import {acceptanceScope as A,reviewedCandidate,fixedRepairTemplate,acceptanceTaskPayload} from './run-factory-repair-acceptance-r26.mjs';
import {expectedRunId} from './verify-software-factory-execution.mjs';
import {evidenceScope as E,parseReadArguments,readBoundExecution,observePlatform,hostReadProgram,reportReadFragment,bindTerminalReport,publicValidationMetadata} from './factory-repair-evidence-read-r26.mjs';
import {readRepairAcceptance} from './read-factory-repair-acceptance-r26.mjs';
import {verifyRepairCleanup,classifyCleanup,cleanupReadFragment} from './verify-factory-repair-cleanup-r26.mjs';
const clone=structuredClone,H='a'.repeat(64),attempt='b'.repeat(32),time='2026-10-12T00:00:00.000Z';
function fixture(){
 const original={id:S.templateId,engine:'claude'},fixed=fixedRepairTemplate(),agent='11111111-1111-4111-8111-111111111111',taskId='22222222-2222-4222-8222-222222222222',command='33333333-3333-4333-8333-333333333333',runId=expectedRunId(command);
 const main={sha256:S.baselineSHA,files:593,bytes:1000,metadataSHA:H,stable:true,identity:{device:1,inode:2}},candidate={sha256:E.candidateFingerprint,files:605,bytes:2000,metadataSHA:reviewedCandidate.metadataSHA256,stable:true,identity:{device:1,inode:3}},profile={goalSpecHash:S.goalSHA,config:{costPolicy:'record-only'}};
 const payload=acceptanceTaskPayload({now:()=>Date.parse(time)}),nativeBinding={runId:A.nativeRunId,taskId:A.nativeTaskId,candidateFingerprint:E.candidateFingerprint,candidateMetadataSHA256:candidate.metadataSHA,journalSHA256:H,originSHA256:reviewedCandidate.originSHA256,partialNative:true,nativeStatus:'round-limit',nativeOutcome:'round-limit'};
 const j={version:1,scope:A,job:'e'.repeat(32),nativeJob:'f'.repeat(32),nodeAgentId:agent,installation:{path:'artifacts/software-factory/acceptance-r26/repair-fixed-verifier-installation-44444444-4444-4444-8444-444444444444.json',sha256:H},nativeJournalSHA256:H,initialProfileSHA256:sha(profile),originalTemplate:original,originalTemplateSHA256:sha(original),fixedTemplate:fixed,fixedTemplateSHA256:sha(fixed),otherCentralTemplatesSHA256:sha([]),otherNodeTemplatesSHA256:sha([]),mainBefore:main,candidateBefore:candidate,expectedInstalled:{wrapperSHA256:H},oldImmutable:{old:H},nativeBinding,allowPartialTerminal:true,taskPayload:payload,taskPayloadSHA256:sha(payload),intents:{start:{commandId:command,scope:'personal',expectedVersion:1,payload:{taskId}}},taskId,runId,dispatchAttemptedAt:time,started:true,phase:'started'};
 const native={job:j.nativeJob,sourceBefore:clone(main),sourceAfter:clone(main),originalTemplate:original,copy:{candidate:{identity:candidate.identity},origin:{parentIdentity:{device:1,inode:4}}}};
 const task={...payload,id:taskId,ownerId:S.ownerId,scope:'personal',status:'failed',executionRequest:{id:runId}};
 const report={schemaVersion:1,kind:'project-autonomy-validation',runId,workspace:S.workspace,workPackage:'FA-01',goalSpecHash:S.goalSHA,sourceFingerprint:E.candidateFingerprint,simulated:false,sourceStable:true,status:'fail',checks:[{id:'apps-server-tests',required:true,executed:true,status:'fail',exitCode:1,evidenceSha256:H,tests:{total:10,passed:9,failed:1,skipped:0,unknown:0}}],artifacts:[]};
 const raw=JSON.stringify(report),run={id:runId,domain:'tasks',kind:'development',scope:'personal',objectId:taskId,taskId,projectId:S.projectId,machineId:S.machineId,executorId:S.templateId,workspace:S.workspace,agentId:agent,goal:payload.goal,criteria:payload.criteria,maxRounds:1,timeoutSec:fixed.timeoutSec,budgetUSD:1,status:'failed',stopRequested:false,result:{source:'signed-agent',outcome:'failed',exitCode:0,usage:{inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,totalTokens:0,costUSD:0,usageComplete:true,provider:'fixed-test',model:'no-model',costKind:'provider-reported'},validation:{exitCode:1,autonomyReportJson:raw,autonomyReportSha256:sha(raw)}}};
 const host={helperVerified:true,source:main,candidate,candidateBefore:clone(candidate),candidateAfter:clone(candidate),originBound:true,origin:{rootOwned:true,sha256:nativeBinding.originSHA256,job:j.nativeJob,phase:'ready',workspace:S.workspace,parent:S.parent,baselineSHA:S.baselineSHA,identity:candidate.identity,parentIdentity:{device:1,inode:4}},tools:clone(fixedToolSHA),toolsAfter:clone(fixedToolSHA),immutableBefore:{old:H},immutableAfter:{old:H},oldBaselineSHA:V.oldBaselineSHA,oldPolicySHA:V.oldPolicySHA,oldWrapperSHA:V.templateSHA,receiptSHA:V.receiptSHA,installed:{wrapperSHA256:H},nodeTemplates:{targetSHA256:sha(fixed),otherTemplatesSHA256:sha([])},quiet:{active:true,children:[],counts:{runs:0,deliveries:0,logs:0}},attempts:[{attempt,collectors:[],testGroups:[],final:{sha256:H,canonicalReportSHA256:sha(report),status:'fail',sourceStable:true}}],mutationsPerformed:false,rawLogsExported:false,privateEnvironmentExported:false,productCodeExecuted:false,modelsInvoked:false};
 host.origin.version=1;
 host.requiredPrototypeCheckIds=Array.from({length:30},(_,i)=>'prototype-suite-'+String.fromCharCode(97+i%26)+(i>=26?'extra':''));
 const resource=sha(runId+attempt).slice(0,40),prefix='jarvis-fa01-'+resource,broker='jarvis-ft-'+resource;
 host.cleanupAudit={runId,attempt,resourceId:resource,lifecycleVerified:true,lifecycleSHA256:H,exactNamedResourceCount:15,mainLabelScope:{containers:[],networks:[],exactNamedResources:[...['postgres','redis','minio','build','runtime','probe'].map(x=>({kind:'container',name:prefix+'-'+x,present:false})),{kind:'network',name:prefix+'-net',present:false}]},brokerLabelScope:{containers:[],networks:[],exactNamedResources:[...Array.from({length:7},(_,i)=>({kind:'container',name:broker+'-sandbox-'+(i+1),present:false})),{kind:'network',name:broker+'-sandbox-net',present:false}]},broker:{cleanupClaimsComplete:true,unresolvedCreateIntents:0,expectedProcessIdentityAlive:false,socket:{present:false},runtimeDirectory:{present:false}},coordinator:{cleanupClaimsComplete:true,expectedProcessIdentityAlive:false},relatedLiveProcesses:[],resourcesActuallyAbsent:true,processesActuallyGone:true,privateSourceObservations:{before:{present:true,sha256:H,sourceFingerprint:E.candidateFingerprint,files:605},after:{present:true,sha256:H,sourceFingerprint:E.candidateFingerprint,files:605}},errorCodes:[],readOnly:true,signalsSent:false,resourcesRemoved:false,rawLogsExported:false,privateEnvironmentExported:false};
 const context={j,native,journalRaw:'journal',nativeRaw:'native',installedRaw:'installed'},state={run,task,profile,host,j,rootReads:0,sqlReads:0,afterHost:null};
 const d={now:()=>Date.parse(time),loadContext:async()=>context,readLocal:async path=>path===A.journalPath?'journal':path===S.journalPath?'native':'installed',api:async path=>({data:clone(path.includes('/execution/runs/')?state.run:path.includes('/tasks/')?state.task:path.endsWith('/autonomy')?state.profile:path.endsWith('/supervision')?{supervised:false,stopped:false}:{templates:[j.fixedTemplate]})}),readPrimary:async()=>{state.sqlReads++;return {readOnly:true,status:state.run.status,agentId:agent,result:clone(state.run.result),frozenTemplateSHA256:j.fixedTemplateSHA256,storedRecordSHA256:H};},nodeState:async()=>({agentId:agent,unit:{ActiveState:'active',MainPID:'123'},template:j.fixedTemplate}),queueState:async()=>({readOnly:true,fullTable:true,allActive:0}),readRoot:async(p,program)=>{state.rootReads++;assert.equal(p.workspace,S.workspace);assert.equal(p.evidenceRoot,V.evidenceRoot);assert.ok(program.includes('sourceStable'));const out=clone(host);state.afterHost?.();return out;}};
 return {context,state,d,host,report,j};
}

test('CLI accepts only bound run and attempt, no paths or mutation switches',()=>{
 assert.deepEqual(parseReadArguments([]),{});assert.deepEqual(parseReadArguments(['--attempt='+attempt],{cleanup:true}),{attempt});
 for(const args of [['--execute'],['--attempt=../x'],['--run-id='+'a'.repeat(40),'--run-id='+'a'.repeat(40)],['--report=/private']])assert.throws(()=>parseReadArguments(args),/REPAIR_EVIDENCE/);
 assert.throws(()=>parseReadArguments([],{cleanup:true}),/ATTEMPT_REQUIRED/);
});
test('actual signed failed product remains a failed result while independent cleanup can pass',async()=>{
 const f=fixture(),r=await verifyRepairCleanup({attempt},f.d);assert.equal(r.cleanupIndependentlyVerified,true);assert.equal(r.productValidationStatus,'fail');assert.equal(r.productAccepted,false);assert.equal(r.terminal.executionExitCode,0);assert.equal(r.terminal.validationExitCode,1);assert.equal(r.modelsInvoked,false);assert.equal(f.state.rootReads,1);
 const read=await readRepairAcceptance({},f.d);assert.equal(read.signedReport.testGroups[0].failed,1);assert.equal(read.terminalReportBinding.bound,true);assert.equal(read.productAccepted,false);assert.equal(read.independentCleanupAuditRequired,true);
});
test('missing signed full report preserves separately proven resource cleanup',async()=>{
 const f=fixture();delete f.state.run.result.validation;f.host.attempts[0].final=null;
 const r=await verifyRepairCleanup({attempt},f.d);assert.equal(r.resourceCleanupIndependentlyVerified,true);assert.equal(r.terminalReportIndependentlyBound,false);assert.equal(r.cleanupIndependentlyVerified,false);assert.equal(r.status,'resources-clean-report-unconfirmed');
});
test('late signed cancellation is never promoted to full report confirmation or product success',async()=>{
 const f=fixture();f.state.run.status='cancelled';f.state.run.result.outcome='cancelled';f.state.run.stopRequested=true;f.state.run.result.lateEvidenceOnly=true;
 const r=await verifyRepairCleanup({attempt},f.d);assert.equal(r.resourceCleanupIndependentlyVerified,true);assert.equal(r.terminalReportIndependentlyBound,false);assert.equal(r.terminal.lateEvidenceOnly,true);assert.equal(r.terminal.stopRequested,true);assert.equal(r.productAccepted,false);
});
test('SQL template, agent/result/status and signed public report binding reject stale evidence before host',async()=>{
 for(const mutate of [s=>{s.frozenTemplateSHA256='c'.repeat(64);},s=>{s.agentId='x';},s=>{s.status='succeeded';},s=>{s.result.exitCode=1;}]){
  const f=fixture(),original=f.d.readPrimary;f.d.readPrimary=async(...args)=>{const s=await original(...args);mutate(s);return s;};await assert.rejects(readRepairAcceptance({},f.d),/STORED_RUN_CHANGED/);assert.equal(f.state.rootReads,0);
 }
 const f=fixture();f.state.run.result.source='native';await assert.rejects(readRepairAcceptance({},f.d),/SIGNED_TERMINAL/);
});
test('source metadata, origin, fixed tools, candidate count and actual private report cannot drift',async()=>{
 for(const mutate of [h=>{h.source.metadataSHA='0'.repeat(64);},h=>{h.candidate.files=604;},h=>{h.origin.sha256='0'.repeat(64);},h=>{h.tools['project-autonomy-fa01-collector.mjs']='0'.repeat(64);},h=>{h.attempts[0].final.canonicalReportSHA256='0'.repeat(64);}]){
  const f=fixture();mutate(f.host);await assert.rejects(readRepairAcceptance({},f.d),/REPAIR_(?:EVIDENCE|ACCEPTANCE)_/);
 }
});
test('fifteen exact names, both scopes, process identity, socket and ACK require actual absence',async()=>{
 const f=fixture(),snapshot=await readBoundExecution(f.context,f.d),binding={...bindTerminalReport(snapshot,f.host),expectedAttempt:attempt},platform={queueActive:0};
 assert.equal(classifyCleanup(snapshot,f.host,platform,binding).cleanupIndependentlyVerified,true);
 for(const change of [h=>{h.cleanupAudit.brokerLabelScope.containers=['a'.repeat(64)];h.cleanupAudit.resourcesActuallyAbsent=false;},h=>{h.cleanupAudit.mainLabelScope.exactNamedResources[0].present=true;h.cleanupAudit.resourcesActuallyAbsent=false;},h=>{h.cleanupAudit.broker.socket.present=true;h.cleanupAudit.resourcesActuallyAbsent=false;},h=>{h.cleanupAudit.broker.runtimeDirectory.present=true;h.cleanupAudit.resourcesActuallyAbsent=false;},h=>{h.cleanupAudit.coordinator.expectedProcessIdentityAlive=true;h.cleanupAudit.processesActuallyGone=false;},h=>{h.cleanupAudit.broker.unresolvedCreateIntents=1;},h=>{h.quiet.counts.deliveries=1;},h=>{h.cleanupAudit.broker.cleanupClaimsComplete=false;}]){
  const h=clone(f.host);change(h);assert.equal(classifyCleanup(snapshot,h,platform,binding).cleanupIndependentlyVerified,false);
 }
 const h=clone(f.host);h.cleanupAudit.mainLabelScope.exactNamedResources[0].name='unrelated';assert.throws(()=>classifyCleanup(snapshot,h,platform,binding),/METADATA_INVALID/);
 const dishonest=clone(f.host);dishonest.cleanupAudit.mainLabelScope.containers=['a'.repeat(64)];assert.throws(()=>classifyCleanup(snapshot,dishonest,platform,binding),/CLAIMS_INCONSISTENT/);
});
test('real running progress does not become a signed terminal or cleanup confirmation',async()=>{
 const f=fixture();f.state.run.status='running';f.state.run.result=null;f.host.attempts[0].final=null;
 const r=await verifyRepairCleanup({attempt},f.d);assert.equal(r.resourceCleanupIndependentlyVerified,false);assert.equal(r.status,'not-terminal');assert.equal(r.terminal.signedReceiptIngested,false);assert.equal(r.terminal.zeroModelUsageConfirmed,false);
});
test('post-observation result and local-journal changes reject mixed snapshots',async()=>{
 const f=fixture();f.state.afterHost=()=>{f.state.run.result.exitCode=1;};await assert.rejects(readRepairAcceptance({},f.d),/OBSERVATION_CHANGED/);
 const g=fixture();g.d.readLocal=async()=> 'changed';await assert.rejects(readRepairAcceptance({},g.d),/LOCAL_BINDING_CHANGED/);
});
test('synchronous node SSH failure drains all already-started API and queue reads before session cleanup',async()=>{
 const f=fixture(),initial=f.d.api;let pending=0,completed=0,revoked=false,queueComplete=false;
 f.d.api=async path=>{pending++;try{await new Promise(r=>setTimeout(r,20));assert.equal(revoked,false);completed++;return initial(path);}finally{pending--;}};
 f.d.nodeState=()=>{throw Error('SSH_SYNCHRONOUS_FIXTURE_FAILURE');};
 f.d.queueState=async()=>{await new Promise(r=>setTimeout(r,30));assert.equal(revoked,false);queueComplete=true;return {readOnly:true,fullTable:true,allActive:0};};
 try{await assert.rejects(observePlatform(f.context,f.d),/SSH_SYNCHRONOUS_FIXTURE_FAILURE/);}finally{revoked=true;}
 assert.equal(pending,0);assert.equal(completed,3);assert.equal(queueComplete,true);assert.equal(f.state.rootReads,0);
});
test('early API rejection waits for the paired task read before login owner can clean up',async()=>{
 const f=fixture(),initial=f.d.api;let taskCompleted=false,revoked=false;
 f.d.api=async path=>{if(path.includes('/execution/runs/'))throw Error('API_EARLY_REJECTION_FIXTURE');await new Promise(r=>setTimeout(r,20));assert.equal(revoked,false);taskCompleted=true;return initial(path);};
 try{await assert.rejects(readBoundExecution(f.context,f.d),/API_EARLY_REJECTION_FIXTURE/);}finally{revoked=true;}
 assert.equal(taskCompleted,true);assert.equal(f.state.sqlReads,0);assert.equal(f.state.rootReads,0);
});
test('thirty required suites exclude prototype baseline guard and missing suites stay unknown',async()=>{
 const f=fixture(),snapshot=await readBoundExecution(f.context,f.d);
 snapshot.report.checks.push({id:'prototype-baseline',status:'pass',executed:true},{id:f.host.requiredPrototypeCheckIds[0],status:'fail',executed:true});
 const v=publicValidationMetadata(snapshot,f.host);assert.equal(v.prototypeChecks.total,30);assert.equal(v.prototypeChecks.failed,1);assert.equal(v.prototypeChecks.unknown,29);assert.deepEqual(v.additionalPrototypeChecks,[{id:'prototype-baseline',status:'pass',executed:true}]);
 snapshot.report=null;assert.equal(publicValidationMetadata(snapshot,f.host).prototypeChecks,null);
});
test('actual generated daemon readers query both complete label scopes and all fifteen exact names, never inspect error text',()=>{
 const code=String.raw`import ast,json,sys,re
sys.stdin.reconfigure(encoding='utf-8');tree=ast.parse(sys.stdin.read());defs=[x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name in ['census','exact_names','resources']]
def need(v,c):
 if not v:raise RuntimeError(c)
calls=[];present=False
def docker(args):
 calls.append(args)
 if '--quiet' in args:return ''
 names=['unrelated-business']
 if present and args[0]=='ps':names+=['jarvis-fa01-'+'a'*40+'-build']
 return '\n'.join(json.dumps(x) for x in names)
scope={'json':json,'re':re,'need':need,'docker':docker,'labels':{'jarvis.validation.runId':'r'*40,'jarvis.validation.attempt':'b'*32,'jarvis.validation.role':'project-autonomy-fa01','jarvis.validation.sourceFingerprint':'c'*64},'broker_labels':{'jarvis.validation.runId':'a'*40,'jarvis.validation.role':'sandbox-six-case-fixture','jarvis.validation.sourceFingerprint':'c'*64},'resource':'a'*40,'prefix':'jarvis-fa01-'+'a'*40,'expected_containers':['jarvis-fa01-'+'a'*40+'-'+x for x in ['postgres','redis','minio','build','runtime','probe']]}
exec(compile(ast.Module(body=defs,type_ignores=[]),'controlled-daemon-readers','exec'),scope);v=scope['resources']();assert len(v['main']['exactNamedResources'])+len(v['broker']['exactNamedResources'])==15
assert not any(x['present'] for k in ['main','broker'] for x in v[k]['exactNamedResources']);assert len(calls)==8
assert sum('label=jarvis.validation.runId='+'a'*40 in x for x in calls)==2
assert sum('label=jarvis.validation.runId='+'r'*40 in x for x in calls)==2
present=True;v=scope['resources']();assert [x['name'] for x in v['main']['exactNamedResources'] if x['present']]==['jarvis-fa01-'+'a'*40+'-build']
assert all(x[0] in ['ps','network'] and not any(a in x for a in ['run','create','rm','prune','stop','kill','inspect']) for x in calls)
print(json.dumps({'actualGeneratedFunctionsExecuted':True,'readOnlyCalls':len(calls),'exactNames':15,'unrelatedNameExported':False}))`;
 const r=spawnSync('python',['-I','-c',code],{input:cleanupReadFragment,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).exactNames,15);
});
test('Python canonical report digest agrees with signed report object including public Unicode paths',()=>{
 const f=fixture();f.report.artifacts=[{path:'doc/原型/页面.html',sha256:H,bytes:100}];
 const code="import json,hashlib,sys;sys.stdin.reconfigure(encoding='utf-8');v=json.load(sys.stdin);print(hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest())";
 const r=spawnSync('python',['-I','-c',code],{input:JSON.stringify(f.report),encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),sha(f.report));
});
test('generated host programs parse and contain no process/resource mutations',()=>{
 const code=String.raw`import ast,json,sys
sys.stdin.reconfigure(encoding='utf-8')
out=[]
for source in json.load(sys.stdin):
 tree=ast.parse(source);calls=[ast.unparse(x.func) for x in ast.walk(tree) if isinstance(x,ast.Call)]
 assert not any(x in calls for x in ['os.kill','os.killpg','os.mkdir','os.rename','os.replace','os.unlink','shutil.rmtree','subprocess.Popen'])
 for x in ast.walk(tree):
  if isinstance(x,ast.Call) and ast.unparse(x.func)=='subprocess.run':
   text=ast.unparse(x);assert not any("'"+v+"'" in text for v in ['rm','stop','kill','prune','run','create','restart'])
 assert "'/usr/local/libexec/jarvis-msf-main-acceptance-r26-repair'" not in source or 'productCodeExecuted' in source
 out.append({'parsed':True,'calls':len(calls),'mutations':False})
print(json.dumps(out))`;
 const r=spawnSync('python',['-I','-c',code],{input:JSON.stringify([hostReadProgram(),hostReadProgram(cleanupReadFragment)]),encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).length,2);
});
test('actual generated public extractor only returns title/count metadata, rejects bad counts and withholds credentials',()=>{
 const code=String.raw`import ast,json,sys,re,hashlib
sys.stdin.reconfigure(encoding='utf-8')
source=sys.stdin.read();tree=ast.parse(source);defs=[x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name in ['safe_public_text','test_metadata']]
def need(v,c):
 if not v:raise RuntimeError(c)
value={'numTotalTests':2,'numPassedTests':1,'numFailedTests':1,'numPendingTests':0,'success':False,'testResults':[{'name':'/work/source/apps/server/src/foo.test.ts','status':'failed','assertionResults':[{'status':'failed','fullName':'URL signatures retain escaped paths','failureMessages':['PRIVATE_LOG_SENTINEL']}]}]}
class Q:name='apps-server-tests.json'
scope={'re':re,'hashlib':hashlib,'need':need,'optional_json':lambda q,n:(value,'a'*64)}
exec(compile(ast.Module(body=defs,type_ignores=[]),'controlled-public-extractor','exec'),scope)
result=scope['test_metadata'](Q());assert result['failed']==1 and result['failedFiles'][0]['path']=='apps/server/src/foo.test.ts';assert 'PRIVATE_LOG_SENTINEL' not in json.dumps(result)
for index,text in enumerate(['{"api_key":"fixture_secret_0123456789"}','Bearer fixture_secret_0123456789','密码=fixture','password: fixture','API_TOKEN=fixture_secret_0123456789','--api-key fixture_secret_0123456789','--token=fixture_secret_0123456789','/var/lib/jarvis/data/private','hello\nprivate']):
 assert scope['safe_public_text'](text).get('withheld') is True,'credential-case-'+str(index)
value['numTotalTests']=3
try:scope['test_metadata'](Q());raise AssertionError('bad counts passed')
except RuntimeError as e:assert str(e)=='REPAIR_EVIDENCE_TEST_COUNTS_INVALID'
print(json.dumps({'generatedExtractorExecuted':True,'failureMessagesExported':False,'credentialFixturesWithheld':True}))`;
 const r=spawnSync('python',['-I','-c',code],{input:reportReadFragment,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).failureMessagesExported,false);
});
test('old scripts are not used as executable readers and imports have no CLI work on this invocation',async()=>{
 for(const name of ['factory-repair-evidence-read-r26.mjs','read-factory-repair-acceptance-r26.mjs','verify-factory-repair-cleanup-r26.mjs']){
  const source=await readFile(new URL('./'+name,import.meta.url),'utf8');assert.ok(!source.includes("import './read-factory-main-"));assert.ok(!source.includes('failureMessages['));
 }
});
