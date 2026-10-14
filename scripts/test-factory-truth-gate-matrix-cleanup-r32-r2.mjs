/** Controlled local observer qualifications, not actual matrix cleanup or product tests. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';
import {sha,canonical} from './run-factory-main-repair-r26.mjs';
import {matrixR32Scope as producer} from './start-factory-truth-gate-matrix-r32.mjs';
import {targetCleanupR29HostProgram} from './verify-factory-target-cleanup-r29.mjs';
import {matrixCleanupR32Scope as S,matrixCleanupR32Names as names,matrixCleanupR32MissingPins as missing,verifyFactoryTruthGateMatrixCleanupR32 as verify,matrixCleanupR32Failure as failure,matrixCleanupR32Protocol as protocol,matrixCleanupR32ControlFiles as controls,matrixCleanupR32ToolFiles as tools,assertMatrixCleanupR32Context as context,assertMatrixCleanupR32Host as qualify,matrixCleanupR32HostProgram as program,parseMatrixCleanupR32Host as parse,matrixCleanupR32JournalPath as jp} from './verify-factory-truth-gate-matrix-cleanup-r32-r2.mjs';
const h=n=>n.repeat(64),copy=v=>structuredClone(v),attempt='a'.repeat(32),runID='b'.repeat(40),now=1791840000000;
function fixture(){
 const ps=copy(producer);ps.worker.sha256=h('1');ps.worker.installedPath='/opt/jarvis-development/software-factory/factory-truth-gate-matrix-worker-r32-'+h('1').slice(0,16)+'.py';ps.tools=ps.tools.map((t,i)=>({...t,sha256:t.sha256??h(String(i+2))}));ps.qualification=Object.fromEntries(Object.keys(ps.qualification).map((k,i)=>[k,{path:'artifacts/software-factory/goals-r29/controlled-'+k+'.json',sha256:h(String(i+2))}]));
 const images={schemaVersion:1,kind:'r32-exact-dependency-image-config',images:Object.fromEntries(Object.entries(ps.images).map(([r,Id])=>[r,{Id,Os:'linux',Architecture:'amd64',Config:{User:'',Volumes:r==='node'?null:{[r==='postgres'?'/var/lib/postgresql/data':'/data']:{}},Entrypoint:[],Cmd:[]}}]))};
 const artifact={schemaVersion:1,kind:'r32-frozen-application-runtime-artifact',root:'/var/lib/jarvis-development/101/r32-truth-artifacts/'+h('c')+'/runtime',manifestPath:'/var/lib/jarvis-development/101/r32-truth-artifacts/'+h('c')+'/runtime-manifest.json',rootIdentity:{device:9,inode:90},manifestSHA256:h('d'),metadataSHA256:h('e'),treeSHA256:h('f'),source:{fingerprint:S.source.fingerprint,files:625,bytes:18413560},sourceIndexSHA256:ps.sourceIndex.sha256,buildProofSHA256:ps.qualification.buildProof.sha256,readOnlyRootOwned:true,twoCompleteReadbacks:true};
 const ar=JSON.stringify(artifact)+'\n',ir=JSON.stringify(images)+'\n';ps.qualification.artifactContract.sha256=sha(ar);ps.qualification.imageContract.sha256=sha(ir);
 const fs={...copy(S),workerSHA256:ps.worker.sha256,starterSHA256:h('8'),installedWorker:ps.worker.installedPath,producerProtocolSHA256:sha(canonical(protocol)),protocol:copy(protocol),producerScope:ps,artifactContract:{...ps.qualification.artifactContract,value:artifact},imageContract:{...ps.qualification.imageContract,value:images}};
 const n=names(attempt),resources={containers:Object.fromEntries(S.containerRoles.map((r,i)=>[r,n.containers[i]])),network:n.network,volumes:Object.fromEntries(S.volumeRoles.map((r,i)=>[r,n.volumes[i]]))};
 const cf=Object.fromEntries(controls.map(k=>[k,h('7')]));cf['activation.json']=h('9');cf['artifact-contract.json']=sha(ar);cf['image-contract.json']=sha(ir);cf['build-proof.json']=ps.qualification.buildProof.sha256;const tf=Object.fromEntries(tools.map(k=>[k,h('6')]));for(const t of ps.tools)tf[t.name]=t.sha256;tf['r29-qa-runtime-manifest.json']=ps.PGManifestSHA256;tf['r32-source-actual-index.json']=ps.sourceIndex.sha256;
 const owner={unit:n.ownerUnit,pid:4242,startTicks:'500',boot:'328726a0-5495-4892-b0a6-2fa9de26242e',controlGroup:'/system.slice/'+n.ownerUnit,runtimeMaxSec:1800,stopTimeoutSec:120,restart:'no',killMode:'control-group'};
 const start={schemaVersion:1,kind:protocol.startKind,attempt,runID,dispatched:true,workerSHA256:ps.worker.sha256,owner,resources,httpSQLDenominator:34,additionalPGDenominator:4,cleanupIndependentlyVerified:false,productAccepted:false,modelsInvoked:false,readOnly:false,onceIntentSHA256:h('4'),ownershipSHA256:h('5'),activationSHA256:cf['activation.json'],controlInventorySHA256:sha(canonical(cf)),toolsInventorySHA256:sha(canonical(tf)),controlFiles:cf,toolsFiles:tf};
 const sr=JSON.stringify(start)+'\n',ref={path:'artifacts/software-factory/goals-r29/truth-gate-matrix-r32-start-1791840000000-11111111-2222-3333-4444-555555555555.json',sha256:sha(sr)};
 const q={schemaVersion:1,kind:protocol.journalKind,attempt,runID,dispatched:true,automaticRetry:false,starterSHA256:fs.starterSHA256,immutableScope:ps,startIntentAt:new Date(now).toISOString(),owner,receipts:{start:ref},...Object.fromEntries(['onceIntentSHA256','ownershipSHA256','activationSHA256','controlInventorySHA256','toolsInventorySHA256'].map(k=>[k,start[k]]))};
 const qr=JSON.stringify(q)+'\n',B=context(q,start,fs),p=JSON.parse(readFileSync('artifacts/software-factory/goals-r29/new-protection-contract-1791828226746-050a98d2-9605-46c2-8d28-57a450f38a5d.json','utf8'));p.at=new Date(now).toISOString();const node=copy(p.node),ack=copy(p.observations.nativeSource.nodeACK);
 const records={},raws={};for(const [i,[role,resourceKind]] of Object.entries(protocol.resourceKindByRole).entries()){const name=role==='network'?n.network:resources[resourceKind==='container'?'containers':'volumes'][role],id=resourceKind==='volume'?name:sha('mock-id-'+role),intent=sha('mock-intent-'+role);records[role]={schemaVersion:1,kind:'r32-truth-gate-created-resource',attempt,role,resourceKind,name,id,createdAt:new Date(now).toISOString(),imageID:resourceKind==='container'?ps.images[role==='api-probe'?'node':role]:null,labels:n.labels,creationIntentSHA256:intent,configSHA256:sha('mock-config-'+role)};raws[role]={intent,created:sha('mock-created-'+role)};}
 const known=Object.fromEntries(S.containerRoles.map(r=>[r,records[r].id])),registry={readOnly:true,records,raws,intentRoles:Object.keys(records).sort(),unknownRoles:[],knownContainerIDs:known,identitiesComplete:true};
 const dir=(mode,entries)=>({stable:true,nofollow:true,uid:0,mode,entries,identity:{device:10,inode:entries+100},metadataSHA256:h('2')});
 const scan=()=>({node:copy(node),ack:copy(ack),fullProcScan:true,pidfdSupported:true,allDescendants:[],unitCgroupOtherProcesses:[],workspaceRelatedProcesses:[],ownerCgroupProcesses:[],containerCgroupProcesses:[],relatedProcesses:[],listedPIDs:[node.pid],inspectedPIDs:[node.pid],readIncompletePIDs:[],exitedDuringScan:[],processesScanned:1,counts:{listed:1,inspected:1,pidfdProvenExits:0,incomplete:0}});
 const exact=Object.entries(protocol.resourceKindByRole).map(([role,resourceKind])=>({role,resourceKind,name:records[role].name}));
 const host={observedAt:new Date(now).toISOString(),attempt,runID,executionStatus:'passed',source:{sha256:B.fingerprint,files:625,bytes:18413560,metadataSHA:B.metadataSHA,identity:B.sourceIdentity,stable:true},sourceBeforeAfterStable:true,protectedSources:copy(B.protectedSources),sourceOriginSHA256:B.sourceOriginSHA256,privateReceiptsStable:true,workerSHA256:B.toolSHA,...Object.fromEntries(['activationSHA256','onceIntentSHA256','ownershipSHA256','controlInventorySHA256','toolsInventorySHA256'].map(k=>[k,B[k]])),stateSHA256:h('3'),attemptDirectory:dir(448,30),control:{...dir(448,8),files:cf,activationBound:true,requiredFilesBound:true},tools:{...dir(365,6),files:tf},registry,artifact:{root:artifact.root,identity:artifact.rootIdentity,entries:626,bytes:18413561,manifestSHA256:artifact.manifestSHA256,metadataSHA256:artifact.metadataSHA256,treeSHA256:artifact.treeSHA256,sourceIndexSHA256:B.sourceIndexSHA256,fullClosureVerified:true,sourceFilesVerified:625,stable:true,nofollow:true,uid:0,mode:365},artifactBeforeAfterStable:true,runtimeClosure:{identity:{device:1,inode:44},stable:true,nofollow:true,uid:0,mode:365,manifestSHA256:B.manifestSHA256,metadataRawSHA256:B.runtimeMetadataSHA256,treeSHA256:h('4'),metadataSHA256:h('5'),entries:232},runtimeBeforeAfterStable:true,images:{readOnly:true,actualConfigRead:true,noAnonymousVolumes:true,images:Object.fromEntries(Object.entries(images.images).map(([r,v])=>[r,{imageID:v.Id,publicConfigSHA256:sha(canonical(v))}]))},privateExecutionLogSHA256:h('5'),privateExecutionLogBytes:10,docker:{exactResources:exact,absent:exact,present:[],labelScopes:[['label=jarvis.truthgate.r32.attempt='+attempt],['label=jarvis.truthgate.r32.attempt='+attempt,'label=jarvis.truthgate.r32.kind=http-sql-validation']].map(filters=>({filters,containers:[],networks:[],volumes:[]})),readOnly:true,containersNetworksVolumesQueried:true,complete:true},owner:{identity:{pid:B.ownerPID,startTicks:B.ownerStartTicks,boot:B.ownerBoot},bootSame:true,pidAbsent:true,unit:{Id:n.ownerUnit,LoadState:'not-found',ActiveState:'inactive',MainPID:'0',ControlGroup:''},cgroupPath:owner.controlGroup,cgroupPresent:false,cgroupPIDs:[],readOnly:true,originalOwnerContractReceiptBound:true,runtimeMaxSec:1800,stopTimeoutSec:120,currentOwnerContractObserved:false,complete:true},node,nodeACK:ack,scans:[scan(),scan()],workspaceSockets:{nofollow:true,filesystem:[],procNetUnix:[]},procScope:{fullProcScan:true,includesAllDescendants:true,includesUnitCgroupOrphans:true,includesWorkspaceCwdExeArgvFD:true,includesInstallerOwnerCgroup:true,includesAllKnownContainerCgroups:true,knownContainerIDs:known,workspace:B.root+'/'+attempt,persistentMainPIDExcluded:node.pid,twoScans:true},nativeProcessAndSocketCleanupVerified:true,mutationsPerformed:false,signalsSent:false,resourcesRemoved:false,rawLogsExported:false,privateEnvironmentExported:false,rawArgvExported:false,packageJavaScriptExecuted:false,workerCleanupClaimsUsedAsProof:false};
 host.procScope.includesKnownContainerArgv=true;host.executionPhase={candidateCodeMayHaveExecuted:true,apiProbeEntryStarted:true,productCodeExecuted:null,trustedProducerDataOnly:true};
 return {fs,B,q,start,host,p,files:new Map([[jp,qr],[ref.path,sr],[fs.artifactContract.path,ar],[fs.imageContract.path,ir]])};
}

import {matrixReportWitnessSpec as spec,matrixReportWitnessFourTitles as fourTitles,matrixReportWitnessCheckIDs as ids,projectMatrixReportWitnessR32 as project,assertMatrixReportEvidenceR32 as assertReports,matrixCleanupR32ReportWitnessPython as witnessPython,matrixCleanupR32PreparedPins as pins} from './verify-factory-truth-gate-matrix-cleanup-r32-r2.mjs';
import {assertMatrixCleanupR32Host as physicalQualify,matrixCleanupR32HostProgram as physicalProgram} from './verify-factory-truth-gate-matrix-cleanup-r32.mjs';
function reports(B){
 const time=new Date(now).toISOString(),row={id:ids[0],kind:'negative',status:'fail',actualHTTP:true,actualPostgreSQL:true,startedAt:time,finishedAt:time,outcomes:[{stage:'finalize',status:423,errorCode:'GATE_BLOCKED',detailCodes:['TRUTH_GATE'],transactionBeforeSHA256:h('c'),transactionAfterSHA256:h('c'),transactionUnchanged:true}],committedState:{batchStatus:'executing',releaseDecisions:0,formalPassReports:0},passed:true,expectedRejection:[{SECRET:'not public'}],rawResponse:{cookie:'PRIVATE_SECRET'},errorMessage:'PRIVATE_SECRET'};
 const probe={schemaVersion:1,kind:'software-factory-r32-independent-truth-gate-probe',sourceFingerprint:B.fingerprint,sourceManifestSHA256:B.sourceIndexSHA256,runId:B.runID,attempt:B.attempt,startedAt:time,finishedAt:time,status:'fail',plannedCheckCount:34,exactCheckSetCompleted:false,counts:{total:1,passed:0,failed:1,incomplete:0},checks:[row],problems:[],...Object.fromEntries(Object.entries(spec.probe[2]).filter(([,v])=>Array.isArray(v)&&v[0]==='literal'&&typeof v[1]==='boolean').map(([k,v])=>[k,v[1]])),httpObservations:[{cookie:'PRIVATE_SECRET'}],failureMessages:['PRIVATE_SECRET']};
 const supervisor={schemaVersion:1,kind:'r32-truth-gate-supervisor-report',sourceFingerprint:B.fingerprint,runID:B.runID,attempt:B.attempt,sourceUID:1000,status:'failed',httpSQLDenominator:34,additionalPGDenominator:4,productAccepted:false,customerDelivery:false,modelsInvoked:false,stages:[{id:'fresh-databases-and-migrations',status:'pass',actualSQLMigrations:30,main:'jarvis_truth_gate_r32',upgrade:'jarvis_truth_upgrade_r32',upgradeInitialPublicTables:0},{id:'http-sql34',code:1,signal:null,logBytes:120,timedOut:false,errorCode:null}],fourOriginalCases:fourTitles.map(title=>({title,status:'passed'})),apiChildStopped:true,fourReportErrorCode:null,privateEnv:'PRIVATE_SECRET'};
 const four={success:true,numTotalTests:13,numFailedTestSuites:0,numRuntimeErrorTestSuites:0,testResults:[{status:'passed',name:'PRIVATE_SECRET',message:'PRIVATE_SECRET',assertionResults:[...fourTitles.map(title=>({title,status:'passed',failureMessages:['PRIVATE_SECRET']})),{title:'PRIVATE_OTHER_TITLE',status:'pending',failureMessages:['PRIVATE_SECRET']}]}],failureMessages:['PRIVATE_SECRET']};
 return {probe,supervisor,four};
}
function missingEvidence(){return Object.fromEntries(Object.entries(spec.paths).map(([kind,name])=>[kind,{path:'/evidence/'+name,sha256:null,bytes:null,metadataSHA256:null,readComplete:false,stable:false,parseComplete:false,reportQualified:false,projection:null,errorCode:'R32_REPORT_WITNESS_MISSING'}]));}
function qualifiedEvidence(B){return Object.fromEntries(Object.entries(reports(B)).map(([kind,v])=>{const raw=JSON.stringify(v);return [kind,{path:'/evidence/'+spec.paths[kind],sha256:sha(raw),bytes:Buffer.byteLength(raw),metadataSHA256:h('d'),readComplete:true,stable:true,parseComplete:true,reportQualified:true,projection:project(kind,v,B),errorCode:null}]}));}
function pythonRun(code,input){const r=spawnSync('python',['-c',code],{input:JSON.stringify(input),encoding:'utf8',timeout:12000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)}
const pythonPrelude=String.raw`
import ast,sys,json,re,datetime,hashlib,stat,types,errno
data=json.load(sys.stdin);tree=ast.parse(data['program'])
def need(v,c):
 if not v:raise RuntimeError(c)
names={'key','stat_key','digest','compact','strict_json','duplicate_pairs','report_project_value','report_projection','witness_need','report_read_once','report_read_all','report_finish'}
body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
assert names=={n.name for n in body}
ns={'json':json,'re':re,'datetime':datetime,'hashlib':hashlib,'stat':stat,'need':need,'p':data['B'],'REPORT_SPEC':data['spec']}
exec(compile(ast.Module(body=body,type_ignores=[]),'actual-generated-report-functions','exec'),ns)
`;
test('new default null qualification is zero IO and old exact bytes stay frozen',async()=>{
 let io=0;const no=()=>{io++;throw Error('NO_IO')};const r=await verify({},{readLocal:no,readRoot:no,verifyProtection:no,evidence:no});assert.equal(io,0);assert.equal(r.ready,false);assert.equal(r.productResultsIndependentlyQualified,false);
 assert.equal(sha(readFileSync('scripts/verify-factory-truth-gate-matrix-cleanup-r32.mjs')),'5274cf9e5b45e24d037894ed8317c4fa6eb4409623911485e043f886bb4b98d3');assert.equal(sha(readFileSync('scripts/test-factory-truth-gate-matrix-cleanup-r32.mjs')),'1724db08d3edde827cf58a80894f6320407d2d2842f7107fc281af0bd92de4d7');assert.equal(pins.workerSHA256,'5530c010079b8d148fcdb4ad842d6bb31cd75ab6702fae9b85d5083cc92c371e');assert.equal(pins.starterSHA256,'3fbce67612871888cc9044dfdaae610ebbf42e2c5e41f0f4a54c70ef23ecd046');
});
test('safe projection strips private fields and never derives business pass from row.passed',()=>{
 const f=fixture(),v=reports(f.B),p=project('probe',v.probe,f.B);assert.equal(p.checks[0].status,'fail');assert.equal(p.counts.passed,0);assert.equal(p.checks[0].passed,undefined);assert.equal(p.checks[0].expectedRejection,undefined);assert.equal(p.httpObservations,undefined);assert.ok(!JSON.stringify(p).includes('PRIVATE'));
 const s=project('supervisor',v.supervisor,f.B),four=project('four',v.four,f.B);assert.equal(s.fourReportErrorCode,null);assert.equal(four.numTotalTests,13);assert.equal(four.selected.length,4);assert.equal(four.unexpectedPassedCount,0);assert.ok(!JSON.stringify([s,four]).includes('PRIVATE'));assert.equal(four.suiteStatus[0],'passed');
});
test('projector fixed IDs, four titles and batch statuses match public frozen producer/schema',()=>{
 const f=fixture(),probe=readFileSync('scripts/factory-truth-gate-probe-r32.mjs','utf8'),supervisor=readFileSync('scripts/factory-truth-gate-matrix-supervisor-r32.mjs','utf8'),schema=readFileSync('.jarvis-dev/workspaces/msf-targets-r32/source/apps/server/src/db/migrations/0008_m5_test.sql','utf8');
 const actualIDs=Function('return '+probe.match(/const CHECK_IDS=Object\.freeze\((\[[\s\S]*?\])\);/)[1])(),actualFour=Function('return '+supervisor.match(/const FOUR=Object\.freeze\((\[[\s\S]*?\])\);/)[1])();assert.deepEqual(ids,actualIDs);assert.deepEqual(fourTitles,actualFour);const statuses=spec.probe[2].checks[2][2].committedState[2].batchStatus[1];assert.ok(schema.includes("CHECK (status IN ("+statuses.map(s=>"'"+s+"'").join(',')+"))"));
 const v=reports(f.B).probe;v.checks=ids.map(id=>({...copy(v.checks[0]),id,kind:id.startsWith('P')?'positive':'negative',status:'pass'}));v.counts={total:34,passed:34,failed:0,incomplete:0};v.exactCheckSetCompleted=true;v.status='pass';const p=project('probe',v,f.B);assert.equal(p.checks.length,34);assert.ok(p.checks.every(c=>c.passed===undefined));assert.equal(p.checks.find(c=>c.id==='P03-real-legacy-migration').actualHTTP,true); // Producer generic flag is retained as a fact, not independent case HTTP proof.
});
test('scope, missing counts, wrong types and duplicate selected titles remain incomplete',()=>{
 const f=fixture();for(const mutate of [v=>delete v.counts,v=>v.counts.passed=1,v=>v.attempt='f'.repeat(32),v=>v.sourceManifestSHA256=h('0'),v=>v.modelsInvoked=true,v=>v.checks[0].actualPostgreSQL=1,v=>v.checks.push(copy(v.checks[0])),v=>v.checks[0].committedState.releaseDecisions='0']){const p=reports(f.B).probe;mutate(p);assert.throws(()=>project('probe',p,f.B),/R32_REPORT_WITNESS_/)}
 const four=reports(f.B).four;four.testResults[0].assertionResults.push(copy(four.testResults[0].assertionResults[0]));assert.throws(()=>project('four',four,f.B),/SHAPE_INVALID/);const other=reports(f.B).four;other.testResults[0].assertionResults.at(-1).status='passed';assert.equal(project('four',other,f.B).unexpectedPassedCount,1);
});
test('closed unknown errors do not export arbitrary upper-case private strings',()=>{const f=fixture(),v=reports(f.B).probe;v.checks[0].errorCode='PRIVATE_COOKIE_AND_SQL';v.checks[0].outcomes[0].detailCodes.push('PRIVATE_SECRET');const p=project('probe',v,f.B);assert.equal(p.checks[0].errorCode,'R32_REPORT_WITNESS_UNCLASSIFIED_CODE');assert.ok(!JSON.stringify(p).includes('PRIVATE'));});
test('missing or malformed reports never change physical cleanup and never fake zero counts',()=>{
 const f=fixture(),old=physicalQualify(f.host,f.B);f.host.reportEvidence=missingEvidence();const r=qualify(f.host,f.B);for(const [k,v] of Object.entries(old))assert.equal(r[k],v);assert.equal(r.cleanupIndependentlyVerified,true);assert.equal(r.reportWitnessesShapeComplete,false);assert.equal(r.productResultsIndependentlyQualified,false);assert.equal(f.host.reportEvidence.probe.bytes,null);assert.equal(f.host.reportEvidence.probe.projection,null);
 f.host.reportEvidence=qualifiedEvidence(f.B);assert.equal(qualify(f.host,f.B).reportWitnessesShapeComplete,true);f.host.reportEvidence.probe.projection.PRIVATE_SECRET='hidden';assert.throws(()=>qualify(f.host,f.B),/PRIVATE_FIELDS_PRESENT/);f.host.reportEvidence=missingEvidence();f.host.reportEvidence.probe.parseComplete=true;assert.throws(()=>qualify(f.host,f.B),/EVIDENCE_INVALID|QUALIFICATION_INVALID/);
});
test('actual stdout controller archives host facts and preserves both full protection receipts',async()=>{
 const f=fixture(),saved=[];f.host.reportEvidence=qualifiedEvidence(f.B);const r=await verify({attempt},{fixedScope:f.fs,readLocal:async p=>f.files.get(p),now:()=>now,verifyProtection:async()=>copy(f.p),readRoot:async(B,py)=>{assert.ok(py.includes('reports_before=report_read_all()'));assert.ok(py.includes('reports_after=report_read_all()'));return JSON.stringify(f.host)},evidence:async(v,p)=>{saved.push({v:copy(v),p});return {path:'artifacts/software-factory/goals-r29/'+p+'-controlled.json',sha256:sha(canonical(v))}}});assert.equal(r.ready,true);assert.equal(r.productResultsIndependentlyQualified,false);assert.equal(r.productAccepted,false);assert.equal(r.host.reportEvidence.four.projection.selected.length,4);assert.deepEqual(saved.map(x=>x.p),['matrix-cleanup-r32-protection','matrix-cleanup-r32-host','matrix-cleanup-r32-protection']);assert.equal(saved[1].v.reportEvidence.probe.sha256,r.host.reportEvidence.probe.sha256);
});
test('generated Python only inserts report reads around unchanged two-census physical program',()=>{
 const f=fixture(),py=program(f.B),old=physicalProgram(f.B),newPhysical=py.slice(0,py.indexOf('REPORT_SPEC=json.loads('))+py.slice(py.indexOf('protected_before=protected_source_state();'));assert.ok(py.includes('signal.alarm(150)'));const native=targetCleanupR29HostProgram(),a=native.indexOf('def process_record('),b=native.indexOf('def census():',a);assert.ok(py.includes(native.slice(a,b)));assert.equal(py.match(/scan_before=census\(\)/g).length,1);assert.equal(py.match(/scan_after=census\(\)/g).length,1);assert.ok(newPhysical.includes(old.slice(old.indexOf('protected_before=protected_source_state();'),old.indexOf('print(json.dumps({'))));assert.ok(!py.includes('m.run(')&&!py.includes('m.reconcile('));assert.ok(py.indexOf('reports_before=report_read_all()')<py.indexOf('scan_before=census()'));assert.ok(py.indexOf('reports_after=report_read_all()')>py.indexOf('scan_after=census()'));
 const r=spawnSync('python',['-c','import ast,sys;v=sys.stdin.read();ast.parse(v);compile(v,"actual-r2-eight-scope","exec")'],{input:py,encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);
});
test('actual generated Python projections match JS safe facts and reject bad JSON/types',()=>{
 const f=fixture(),rs=reports(f.B),result=pythonRun(pythonPrelude+String.raw`
out={kind:ns['report_projection'](kind,v) for kind,v in data['reports'].items()}
for raw in ['{"a":1,"a":2}','{"a":NaN}','{"a":Infinity}']:
 try:ns['strict_json'](raw);raise AssertionError('bad JSON accepted')
 except (RuntimeError,ValueError):pass
v=data['reports']['probe'];v['checks'][0]['actualHTTP']=1
try:ns['report_projection']('probe',v);raise AssertionError('bool=int accepted')
except RuntimeError:pass
print(json.dumps({'projection':out,'strictJSONNegatives':3,'typedNegative':True}))
`,{program:program(f.B),B:f.B,spec,reports:rs});assert.deepEqual(result.projection,Object.fromEntries(Object.entries(rs).map(([kind,v])=>[kind,project(kind,v,f.B)])));assert.equal(result.strictJSONNegatives,3);assert.equal(result.typedNegative,true);
});
test('actual generated FD reader rejects FIFO/link/UID/hardlink/oversize before bytes and binds replacement/drift',()=>{
 const f=fixture(),result=pythonRun(pythonPrelude+String.raw`
class FS:
 O_RDONLY=0;O_DIRECTORY=65536;O_NOFOLLOW=131072;O_NONBLOCK=2048
 def __init__(self,variant='good'):
  self.variant=variant;self.fds={};self.next=10;self.reads=0;self.opens=0;self.positions={};self.end=False
 def info(self,kind):
  mode=stat.S_IFDIR|0o700 if kind in ['root','evidence'] else stat.S_IFREG|0o644;uid=0 if kind=='root' else 1000;ino={'root':1,'evidence':2,'file':3}[kind];size=len(self.raw) if kind=='file' else 64;nlink=1 if kind=='file' else 2;ctime=1791840000000000001
  if kind=='file':
   if self.variant=='fifo':mode=stat.S_IFIFO|0o600
   if self.variant=='symlink':mode=stat.S_IFLNK|0o777
   if self.variant=='uid':uid=999
   if self.variant=='hardlink':nlink=2
   if self.variant=='oversize':size=4194305
   if self.variant=='file-drift' and self.end:ctime+=1
   if self.variant=='inode-after-read' and self.end:ino+=1
  if kind=='evidence' and self.variant=='directory-drift' and self.end:ino+=1
  return types.SimpleNamespace(st_dev=1,st_ino=ino,st_mode=mode,st_uid=uid,st_gid=uid,st_nlink=nlink,st_size=size,st_mtime_ns=1791840000000000000,st_ctime_ns=ctime)
 def stat(self,path,dir_fd=None,follow_symlinks=False):
  assert follow_symlinks is False
  if path=='root':kind='root'
  elif path=='evidence':assert self.fds[dir_fd]=='root';kind='evidence'
  else:
   assert self.fds[dir_fd]=='evidence';kind='file'
   if self.variant=='missing':raise FileNotFoundError(errno.ENOENT,'controlled missing')
  return self.info(kind)
 def open(self,path,flags,dir_fd=None):
  assert flags&self.O_NOFOLLOW
  if path=='root':assert flags&self.O_DIRECTORY;kind='root'
  elif path=='evidence':assert flags&self.O_DIRECTORY and self.fds[dir_fd]=='root';kind='evidence'
  else:assert flags&self.O_NONBLOCK and self.fds[dir_fd]=='evidence';kind='file';self.opens+=1
  fd=self.next;self.next+=1;self.fds[fd]=kind;self.positions[fd]=0;return fd
 def fstat(self,fd):
  kind=self.fds[fd];s=self.info(kind)
  if self.variant=='open-replacement' and kind=='file':s.st_ino+=1
  return s
 def read(self,fd,n):
  assert self.fds[fd]=='file';self.reads+=1;pos=self.positions[fd];q=self.raw[pos:pos+n];self.positions[fd]+=len(q)
  if not q:self.end=True
  return q
 def close(self,fd):assert fd in self.fds;del self.fds[fd]
def run(variant,raw):
 fs=FS(variant);fs.raw=raw;ns['os']=fs;ns['private']='root';v=ns['report_read_once']('truth-gate-result.json');assert not fs.fds;return v,fs
raw=json.dumps(data['reports']['probe'],separators=(',',':')).encode();v,fs=run('good',raw);assert v['raw']==raw and fs.reads>0 and v['errorCode'] is None
negatives=['fifo','symlink','uid','hardlink','oversize','open-replacement']
for variant in negatives:
 v,fs=run(variant,raw);assert v['raw'] is None and fs.reads==0,(variant,v)
for variant in ['file-drift','inode-after-read','directory-drift']:
 v,fs=run(variant,raw);assert v['errorCode']=='R32_REPORT_WITNESS_CHANGED' and v['raw'] is None
v,fs=run('missing',raw);assert v['errorCode']=='R32_REPORT_WITNESS_MISSING' and fs.reads==0
print(json.dumps({'beforeByteNegatives':len(negatives),'driftNegatives':3,'missingNoRead':True,'file644Accepted':True,'allFDsClosed':True,'rawBytesPreserved':True}))
`,{program:program(f.B),B:f.B,spec,reports:reports(f.B)});assert.deepEqual(result,{beforeByteNegatives:6,driftNegatives:3,missingNoRead:true,file644Accepted:true,allFDsClosed:true,rawBytesPreserved:true});
});
test('actual two-read finish retains raw SHA and distinguishes missing, drift, JSON and shape failure',()=>{
 const f=fixture(),result=pythonRun(pythonPrelude+String.raw`
def frame(values):return {k:{'raw':json.dumps(v,separators=(',',':')).encode(),'metadataSHA256':'d'*64,'errorCode':None} for k,v in values.items()}
a=frame(data['reports']);b=frame(data['reports']);out=ns['report_finish'](a,b);assert all(v['reportQualified'] for v in out.values());assert all(v['readComplete'] and v['stable'] and v['parseComplete'] for v in out.values());assert out['probe']['sha256']==hashlib.sha256(b['probe']['raw']).hexdigest();assert 'PRIVATE' not in json.dumps(out)
missing={'raw':None,'metadataSHA256':None,'errorCode':'R32_REPORT_WITNESS_MISSING'};a['probe']=missing;b['probe']=missing;outmissing=ns['report_finish'](a,b);assert outmissing['probe']['bytes'] is None and outmissing['probe']['projection'] is None
a=frame(data['reports']);b=frame(data['reports']);b['probe']['metadataSHA256']='e'*64;drift=ns['report_finish'](a,b)['probe'];assert drift['errorCode']=='R32_REPORT_WITNESS_CHANGED' and drift['readComplete'] and not drift['stable']
for raw,code in [(b'{"cookie":"PRIVATE", "cookie":1}','R32_REPORT_WITNESS_JSON_INVALID'),(b'{"cookie":"PRIVATE"}','R32_REPORT_WITNESS_SHAPE_INVALID')]:
 a=frame(data['reports']);b=frame(data['reports']);a['probe']['raw']=b['probe']['raw']=raw;v=ns['report_finish'](a,b)['probe'];assert v['readComplete'] and v['stable'] and not v['parseComplete'] and v['projection'] is None and v['errorCode']==code and v['sha256']==hashlib.sha256(raw).hexdigest()
print(json.dumps({'evidence':out,'missingIsNull':True,'driftRejected':True,'parseFailuresPreserveSHA':True}))
`,{program:program(f.B),B:f.B,spec,reports:reports(f.B)});assert.equal(assertReports(result.evidence,f.B).reportWitnessesShapeComplete,true);assert.equal(result.missingIsNull,true);assert.equal(result.driftRejected,true);assert.equal(result.parseFailuresPreserveSHA,true);
});
