/** Controlled local observer qualifications, not actual matrix cleanup or product tests. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';
import {sha,canonical} from './run-factory-main-repair-r26.mjs';
import {matrixR32Scope as producer} from './start-factory-truth-gate-matrix-r32.mjs';
import {targetCleanupR29HostProgram} from './verify-factory-target-cleanup-r29.mjs';
import {matrixCleanupR32Scope as S,matrixCleanupR32Names as names,matrixCleanupR32MissingPins as missing,verifyFactoryTruthGateMatrixCleanupR32 as verify,matrixCleanupR32Failure as failure,matrixCleanupR32Protocol as protocol,matrixCleanupR32ControlFiles as controls,matrixCleanupR32ToolFiles as tools,assertMatrixCleanupR32Context as context,assertMatrixCleanupR32Host as qualify,matrixCleanupR32HostProgram as program,parseMatrixCleanupR32Host as parse,matrixCleanupR32JournalPath as jp} from './verify-factory-truth-gate-matrix-cleanup-r32.mjs';
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
test('unknown artifact/image/worker/protocol pins refuse before journal/API/root IO',async()=>{let io=0;const no=()=>{io++;throw Error('NO_IO')};for(const attempt of [undefined,'a'.repeat(32)]){const r=await verify(attempt?{attempt}:{},{readLocal:no,readRoot:no,verifyProtection:no});assert.equal(r.ready,false);assert.equal(r.remoteReadPerformed,false);assert.equal(r.reason,'R32_MATRIX_CLEANUP_PREPARATION_NOT_FROZEN');assert.ok(r.missingPins.includes('artifactContract'));assert.ok(r.missingPins.includes('imageContract'));}assert.equal(io,0)});
test('new scope closes exactly4C/1N/3V and two exact labels without borrowing build names',()=>{const n=names('a'.repeat(32));assert.equal(n.containers.length,4);assert.equal(n.volumes.length,3);assert.equal(n.network,'jarvis-tg-r32-'+'a'.repeat(32)+'-net');assert.equal(new Set([...n.containers,n.network,...n.volumes]).size,8);assert.equal(n.labels['jarvis.truthgate.r32.kind'],'http-sql-validation');assert.ok(!n.containers.some(n=>n.includes('mount-proof')||n.includes('build')));assert.equal(S.ownerStopTimeoutSec,120);assert.equal(S.producerCleanupDeadlineSec,90)});
test('malformed scope/attempt and private errors cannot become success',async()=>{await assert.rejects(verify({attempt:'../old'}),/ARGUMENT_INVALID/);await assert.rejects(verify({retry:true}),/ARGUMENT_INVALID/);const r=failure(Error('PRIVATE api/environment/template'));assert.equal(JSON.stringify(r).includes('PRIVATE'),false);assert.equal(r.rawErrorExported,false);assert.equal(r.cleanupIndependentlyVerified,false);assert.ok(missing().length>=5)});
test('controlled full eight identities qualify passed or failed terminal without product acceptance',()=>{const f=fixture();assert.equal(qualify(f.host,f.B).cleanupIndependentlyVerified,true);f.host.executionStatus='failed';assert.equal(qualify(f.host,f.B).cleanupIndependentlyVerified,true);f.host.executionStatus='running';assert.throws(()=>qualify(f.host,f.B),/HOST_BINDING_CHANGED/)});
test('actual stdout shape is parsed as an object and malformed/array/null are rejected',()=>{const f=fixture();assert.equal(qualify(parse(JSON.stringify(f.host)),f.B).cleanupIndependentlyVerified,true);for(const v of ['broken','[]','null',null,[]])assert.throws(()=>parse(v),/HOST_RESULT_INVALID/)});
test('cross-attempt/run/root/owner/control inventories and unproven read-only receipts reject',()=>{for(const [where,k,v] of [['q','attempt','c'.repeat(32)],['q','runID','c'.repeat(40)],['q','starterSHA256',h('0')],['start','runID','c'.repeat(40)],['start','readOnly',true],['start','resources',{}],['start','toolsInventorySHA256',h('0')]]){const f=fixture();f[where][k]=v;assert.throws(()=>context(f.q,f.start,f.fs),/R32_MATRIX_CLEANUP_/)}const f=fixture();f.q.reconciledFromCheck=true;f.q.startUncertain=true;f.start.readOnly=true;assert.equal(context(f.q,f.start,f.fs).attempt,attempt);f.start.owner.startTicks='changed';assert.throws(()=>context(f.q,f.start,f.fs),/OWNER_IDENTITY_UNKNOWN/)});
test('resource names absent cannot hide missing created ID after durable intent',()=>{const f=fixture();f.host.executionStatus='failed';delete f.host.registry.records.postgres;delete f.host.registry.knownContainerIDs.postgres;delete f.host.procScope.knownContainerIDs.postgres;f.host.registry.unknownRoles=['postgres'];f.host.registry.identitiesComplete=false;f.host.nativeProcessAndSocketCleanupVerified=false;const v=qualify(f.host,f.B);assert.equal(v.dockerComplete,true);assert.equal(v.containerCgroupIdentityComplete,false);assert.equal(v.cleanupIndependentlyVerified,false);assert.equal(v.resourceScopeReadComplete,false);f.host.executionStatus='passed';assert.throws(()=>qualify(f.host,f.B),/PASSED_IDENTITIES_INCOMPLETE/)});
test('unknown PID remains notReady with closed counts and cannot be labelled physically complete',()=>{const f=fixture(),s=f.host.scans[0];s.listedPIDs.push(12345);s.readIncompletePIDs.push(12345);s.processesScanned++;s.counts.listed++;s.counts.incomplete++;f.host.nativeProcessAndSocketCleanupVerified=false;const v=qualify(f.host,f.B);assert.equal(v.resourceScopeReadComplete,false);assert.equal(v.cleanupIndependentlyVerified,false);s.counts.incomplete=0;assert.throws(()=>qualify(f.host,f.B),/COUNTS_NOT_CLOSED/)});
test('actual container cgroup orphan, owner process, workspace socket and ACK block cleanup',()=>{for(const group of ['containerCgroupProcesses','ownerCgroupProcesses','workspaceRelatedProcesses']){const f=fixture(),s=f.host.scans[0];s.inspectedPIDs.push(12345);s.listedPIDs.push(12345);s.processesScanned++;s.counts.listed++;s.counts.inspected++;s[group].push(12345);s.relatedProcesses.push({pid:12345});f.host.nativeProcessAndSocketCleanupVerified=false;assert.equal(qualify(f.host,f.B).cleanupIndependentlyVerified,false)}for(const k of ['filesystem','procNetUnix']){const f=fixture();f.host.workspaceSockets[k].push({pathSHA256:h('0')});f.host.nativeProcessAndSocketCleanupVerified=false;assert.equal(qualify(f.host,f.B).cleanupIndependentlyVerified,false)}const f=fixture();f.host.nodeACK.counts.runs=1;f.host.scans.forEach(s=>s.ack=copy(f.host.nodeACK));f.host.nativeProcessAndSocketCleanupVerified=false;assert.equal(qualify(f.host,f.B).cleanupIndependentlyVerified,false)});
test('only fully identity-bound pidfd exit evidence closes process enumeration',()=>{const f=fixture(),s=f.host.scans[0],pid=12345;s.listedPIDs.push(pid);s.processesScanned++;s.counts.listed++;s.counts.pidfdProvenExits++;s.exitedDuringScan.push({pid,boot:f.host.node.boot,listedProcIdentity:{device:1,inode:2},processIdentity:{pid,boot:f.host.node.boot,procDevice:1,procInode:2,startTicks:'1'},kernelProof:{type:'pidfd-POLLIN',attached:true,identityBound:true,requestedPID:pid,exitConfirmed:true,procPathAbsent:true,pollEvents:1}});assert.equal(qualify(f.host,f.B).cleanupIndependentlyVerified,true);for(const k of ['identityBound','procPathAbsent','exitConfirmed']){const bad=copy(f.host);bad.scans[0].exitedDuringScan[0].kernelProof[k]=false;assert.throws(()=>qualify(bad,f.B),/PIDFD_IDENTITY_UNPROVEN/)}const bad=copy(f.host);bad.scans[0].exitedDuringScan[0].kernelProof.pollEvents=32;assert.throws(()=>qualify(bad,f.B),/PIDFD_IDENTITY_UNPROVEN/)});
test('exact network/volume/label census, changed image/source/artifact/runtime and reused owner refuse',()=>{for(const mutate of [v=>v.docker.absent.pop(),v=>v.docker.exactResources[4].name+='foreign',v=>v.registry.records.redis.id=h('0'),v=>v.images.images.node.publicConfigSHA256=h('0'),v=>v.source.metadataSHA=h('0'),v=>v.artifact.metadataSHA256=h('0'),v=>v.runtimeClosure.metadataRawSHA256=h('0'),v=>v.owner.identity.startTicks='other',v=>v.control.files['review.json']=h('0')]){const f=fixture();mutate(f.host);assert.throws(()=>qualify(f.host,f.B),/R32_MATRIX_CLEANUP_/)}const f=fixture();f.host.docker.labelScopes[0].volumes.push('foreign-labelled-volume');f.host.docker.complete=false;assert.equal(qualify(f.host,f.B).cleanupIndependentlyVerified,false);f.host.docker.complete=true;assert.throws(()=>qualify(f.host,f.B),/DOCKER_FLAG_CHANGED/)});
test('controlled raw-string controller preserves full protection and host receipts before qualification',async()=>{const f=fixture(),saved=[];let calls=0;const r=await verify({attempt},{fixedScope:f.fs,readLocal:async p=>{assert.ok(f.files.has(p),p);return f.files.get(p)},now:()=>now,verifyProtection:async()=>{calls++;return copy(f.p)},readRoot:async(B,py)=>{assert.equal(B.attempt,attempt);assert.ok(py.includes('def registry_state():'));return JSON.stringify(f.host)},evidence:async(v,p)=>{saved.push({v:copy(v),p});return {path:'artifacts/software-factory/goals-r29/'+p+'-mock.json',sha256:sha(canonical(v))}}});assert.equal(r.ready,true);assert.equal(r.productAccepted,false);assert.equal(r.modelsInvoked,false);assert.equal(r.rootPackageJavaScriptExecuted,false);assert.equal(calls,2);assert.deepEqual(saved.map(s=>s.p),['matrix-cleanup-r32-protection','matrix-cleanup-r32-host','matrix-cleanup-r32-protection']);assert.equal(r.evidence.host.sha256,sha(canonical(f.host)))});
test('failed/incomplete protection or malformed host is saved and never becomes cleanup true',async()=>{const f=fixture();let root=0,saved=[];const deps={fixedScope:f.fs,readLocal:async p=>f.files.get(p),now:()=>now,verifyProtection:async()=>({...copy(f.p),ready:false}),evidence:async(v,p)=>{saved.push([p,v.ready]);return {path:p,sha256:h('0')}},readRoot:async()=>{root++;return JSON.stringify(f.host)}};await assert.rejects(verify({attempt},deps),/UNPROVEN/);assert.equal(root,0);assert.deepEqual(saved,[['matrix-cleanup-r32-protection',false]]);deps.verifyProtection=async()=>copy(f.p);deps.readRoot=async()=>'{private bad';await assert.rejects(verify({attempt},deps),/HOST_RESULT_INVALID/)});
test('pending dispatch and stale/changing local context require fresh exact evidence',async()=>{const f=fixture();f.files.set(jp,JSON.stringify({...f.q,dispatched:false}));let remote=0;const deps={fixedScope:f.fs,readLocal:async p=>f.files.get(p),readRoot:async()=>{remote++;throw Error('no')},verifyProtection:async()=>{remote++;throw Error('no')}};const r=await verify({attempt},deps);assert.equal(r.ready,false);assert.equal(remote,0);f.files.set(jp,JSON.stringify(f.q)+'\n');f.files.set(f.q.receipts.start.path,'{}');await assert.rejects(verify({attempt},deps),/LOCAL_EVIDENCE_CHANGED/);assert.equal(remote,0)});
test('generated Python compiles and retains the frozen R3 process reader byte for byte',()=>{const f=fixture(),py=program(f.B),r=spawnSync('python',['-c',"import ast,sys;v=sys.stdin.read();ast.parse(v);compile(v,'production-r32-matrix-observer','exec');print('syntax-pass')"],{input:py,encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);const native=targetCleanupR29HostProgram(),a=native.indexOf('def process_record('),b=native.indexOf('def census():',a);assert.ok(py.includes(native.slice(a,b)));assert.ok(py.includes('signal.alarm(150)'));assert.ok(py.includes('sys.dont_write_bytecode=True'));assert.ok(py.includes('identityBound'));assert.ok(!py.includes('m.reconcile('));assert.ok(!py.includes('m.run('));assert.ok(!py.includes("['rm'"));assert.ok(!py.includes('os.kill('))});
test('actual production Docker census AST has eight exact inspect and two C/N/V read-only scopes',()=>{
 const f=fixture(),py=program(f.B);const code=String.raw`import ast,json,sys,re,types
x=json.loads(sys.stdin.read());tree=ast.parse(x['program']);chosen=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['need','duplicate_pairs','strict_json','docker_census']];env={'json':json,'re':re};exec(compile(ast.Module(body=chosen,type_ignores=[]),'production-census','exec'),env)
roles=x['roles'];p=x['B'];prefix='jarvis-tg-r32-'+p['attempt'];calls=[]
def name(role):return prefix+('-net' if role=='network' else '-'+role)
def docker(args):
 calls.append(args)
 if 'inspect' in args:
  kind=args[0];n=args[-1];return types.SimpleNamespace(returncode=1,stdout=b'[]',stderr=('Error: No such '+kind+': '+n).encode())
 return types.SimpleNamespace(returncode=0,stdout=b'',stderr=b'')
env.update(p=p,roles=roles,resource_name=name,docker=docker);v=env['docker_census']();assert v['complete'] and len(v['absent'])==8 and len(calls)==14
assert sum(q[0]=='container' and q[1]=='inspect' for q in calls)==4
assert sum(q[0]=='network' and q[1]=='inspect' for q in calls)==1
assert sum(q[0]=='volume' and q[1]=='inspect' for q in calls)==3
assert all(q[0] in ['container','network','volume','ps'] and not any(k in q for k in ['rm','create','start','stop','exec','kill']) for q in calls)
for bad in [types.SimpleNamespace(returncode=1,stdout=b'[]',stderr=b'permission denied'),types.SimpleNamespace(returncode=1,stdout=b'[]',stderr=b'Error: No such container: foreign'),types.SimpleNamespace(returncode=1,stdout=b'{}',stderr=b'Error: No such container: '+name('postgres').encode())]:
 env['docker']=lambda _:bad
 try:env['docker_census']();raise AssertionError('accepted ambiguous absence')
 except RuntimeError:pass
print(json.dumps({'exactResourceReads':8,'labelReads':6,'negativeAbsenceCases':3}))`;
 const r=spawnSync('python',['-c',code],{input:JSON.stringify({program:py,B:f.B,roles:protocol.resourceKindByRole}),encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{exactResourceReads:8,labelReads:6,negativeAbsenceCases:3});
});
test('actual registry AST preserves unknown creates and refuses tampered role/ID/state inventories',()=>{
 const f=fixture(),py=program(f.B);const code=String.raw`import ast,json,sys,re,os,types,hashlib
from pathlib import Path
x=json.loads(sys.stdin.read());tree=ast.parse(x['program']);wanted=['need','digest','duplicate_pairs','strict_json','registry_state'];env={'json':json,'re':re,'hashlib':hashlib,'Path':Path};exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in wanted],type_ignores=[]),'production-registry','exec'),env)
p=x['B'];r=Path('/CONTROLLED/registry');roles=x['roles'];resources=x['resources'];labels=x['labels'];files={};records=x['records']
def name(role):return resources['containers'][role] if roles[role]=='container' else resources['network'] if role=='network' else resources['volumes'][role]
for role,kind in roles.items():
 i={'schemaVersion':1,'kind':'r32-truth-gate-creation-intent','attempt':p['attempt'],'resourceKind':kind,'role':role,'name':name(role),'labels':labels,'workerSHA256':p['toolSHA'],'activationSHA256':p['activationSHA256'],'emptyResourceScopeVerified':True};raw=json.dumps(i,separators=(',',':')).encode();files[str(r/(role+'.intent.json'))]=raw;c=records[role];c['creationIntentSHA256']=hashlib.sha256(raw).hexdigest();files[str(r/(role+'.created.json'))]=json.dumps(c).encode()
state={'status':'passed','created':records};env.update(p=p,registry=r,roles=roles,labels=labels,state=state,resource_name=name,private_read=lambda path:files[str(path)],directory_state=lambda *args:{'paths':[Path(q).name for q in files]},os=types.SimpleNamespace(path=types.SimpleNamespace(lexists=lambda path:str(path)==str(r) or str(path) in files)))
v=env['registry_state']();assert v['identitiesComplete'] and len(v['knownContainerIDs'])==4
saved=files.pop(str(r/'postgres.created.json'));state['status']='failed';state['created']={k:c for k,c in records.items() if k!='postgres'};v=env['registry_state']();assert v['unknownRoles']==['postgres'] and not v['identitiesComplete'] and 'postgres' not in v['knownContainerIDs']
state['status']='passed'
try:env['registry_state']();raise AssertionError('unpaired create was accepted')
except RuntimeError:pass
files[str(r/'postgres.created.json')]=saved;state['created']=records;state['status']='passed';bad=json.loads(saved);bad['id']='../other';files[str(r/'postgres.created.json')]=json.dumps(bad).encode()
try:env['registry_state']();raise AssertionError('unknown CID was accepted')
except RuntimeError:pass
files[str(r/'postgres.created.json')]=saved;files[str(r/'extra.created.json')]=b'{}'
try:env['registry_state']();raise AssertionError('extra registry file was accepted')
except RuntimeError:pass
print(json.dumps({'closedCreated':8,'actualCIDCount':4,'unpairedCreatesUnknown':True,'negativeCases':3}))`;
 const r=spawnSync('python',['-c',code],{input:JSON.stringify({program:py,B:f.B,roles:protocol.resourceKindByRole,resources:f.start.resources,labels:names(attempt).labels,records:copy(f.host.registry.records)}),encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{closedCreated:8,actualCIDCount:4,unpairedCreatesUnknown:true,negativeCases:3});
});
test('actual artifact link/strict JSON AST rejects escapes, backslashes, duplicate keys and nonfinite',()=>{
 const f=fixture(),py=program(f.B);const code=String.raw`import ast,json,sys,re
from pathlib import PurePosixPath
x=json.loads(sys.stdin.read());t=ast.parse(x['program']);env={'json':json,'re':re,'PurePosixPath':PurePosixPath};exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,ast.FunctionDef) and n.name in ['need','duplicate_pairs','strict_json','link_target']],type_ignores=[]),'production-link-json','exec'),env)
assert env['link_target']('source/node_modules/.pnpm/pkg/node_modules/lib','../../lib')=='source/node_modules/.pnpm/lib'
for v in ['/outside','../../../../outside','x\\y','x\x00y']:
 try:env['link_target']('source/link',v);raise AssertionError('unsafe artifact link accepted')
 except RuntimeError:pass
for v in ['{"k":1,"k":2}','{"k":NaN}','{"k":Infinity}']:
 try:env['strict_json'](v);raise AssertionError('unsafe JSON accepted')
 except RuntimeError:pass
print(json.dumps({'internalRelativeLink':True,'unsafeLinksRejected':4,'strictJSONRejected':3}))`;
 const r=spawnSync('python',['-c',code],{input:JSON.stringify({program:py}),encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{internalRelativeLink:true,unsafeLinksRejected:4,strictJSONRejected:3});
});
test('actual artifact FD reader hashes the complete controlled tree and rejects open replacement before bytes',()=>{
 const f=fixture(),py=program(f.B);const code=String.raw`import ast,json,sys,re,stat,hashlib,types
from pathlib import PurePosixPath
x=json.loads(sys.stdin.read());tree=ast.parse(x['program']);root=x['B']['artifactContract']['root'];data={};infos={};fdmap={};offset={};counts={'read':0,'open':0,'close':0};nextfd=[10];fault=[None]
def info(inode,mode,size=4096):return types.SimpleNamespace(st_dev=1,st_ino=inode,st_uid=0,st_gid=0,st_mode=mode,st_nlink=1,st_size=size,st_mtime_ns=1,st_ctime_ns=1)
def key(s):return (s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
infos[root]=info(90,stat.S_IFDIR|0o555);infos[root+'/source']=info(91,stat.S_IFDIR|0o555);entries=[{'path':'source','type':'directory'}];metadata=[['source',*key(infos[root+'/source'])]];index=[];total=18413560
for i in range(625):
 n='file'+str(i).zfill(4)+'.ts';size=total//625+(1 if i<total%625 else 0);body=b'x'*size;path=root+'/source/'+n;data[path]=body;infos[path]=info(100+i,stat.S_IFREG|0o444,size);sha=hashlib.sha256(body).hexdigest();entries.append({'path':'source/'+n,'type':'file','sha256':sha,'bytes':size});metadata.append(['source/'+n,*key(infos[path])]);index.append({'path':n,'sha256':sha,'bytes':size})
def compact(v):return json.dumps(v,ensure_ascii=False,separators=(',',':')).encode()
index_raw=compact({'manifest':index});index_sha=hashlib.sha256(index_raw).hexdigest();tree_sha=hashlib.sha256(compact(entries)).hexdigest();meta_sha=hashlib.sha256(compact({'rootIdentity':list(key(infos[root])),'metadata':metadata})).hexdigest();m={'schemaVersion':1,'kind':'r32-application-runtime-manifest','root':'/work','sourceFingerprint':x['B']['fingerprint'],'sourceIndexSHA256':index_sha,'entries':entries,'treeSHA256':tree_sha,'metadataSHA256':meta_sha};raw=compact(m);c=dict(x['B']['artifactContract'],rootIdentity={'device':1,'inode':90},manifestSHA256=hashlib.sha256(raw).hexdigest(),treeSHA256=tree_sha,metadataSHA256=meta_sha);p=dict(x['B'],artifactContract=c,sourceIndexSHA256=index_sha)
class Path(PurePosixPath):
 def lstat(self):return types.SimpleNamespace(**vars(infos[str(self)]))
def open_fd(path):
 counts['open']+=1;fd=nextfd[0];nextfd[0]+=1;fdmap[fd]=path;offset[fd]=0;return fd
def opened(name,flags,dir_fd):
 path=fdmap[dir_fd]+'/'+name;fd=open_fd(path)
 if fault[0]=='replace' and name=='file0000.ts':fdmap[fd]=path+'#replacement';infos[path+'#replacement']=info(9999,stat.S_IFREG|0o444,len(data[path]))
 return fd
def listed(fd):
 path=fdmap[fd];return sorted({q[len(path)+1:].split('/')[0] for q in infos if q.startswith(path+'/') and '#replacement' not in q})
def read(fd,amount):
 counts['read']+=1;path=fdmap[fd];body=data[path];v=body[offset[fd]:offset[fd]+amount];offset[fd]+=len(v)
 if fault[0]=='drift' and path.endswith('file0000.ts') and not v:infos[path].st_ctime_ns=2
 return v
def close(fd):counts['close']+=1;del fdmap[fd];del offset[fd]
mockOS=types.SimpleNamespace(O_RDONLY=0,O_DIRECTORY=1,O_NOFOLLOW=2,O_NONBLOCK=4,fstat=lambda fd:types.SimpleNamespace(**vars(infos[fdmap[fd]])),stat=lambda name,dir_fd,follow_symlinks:types.SimpleNamespace(**vars(infos[fdmap[dir_fd]+'/'+name])),open=opened,listdir=listed,read=read,close=close)
env={'json':json,'re':re,'stat':stat,'hashlib':hashlib,'PurePosixPath':PurePosixPath,'Path':Path,'os':mockOS,'key':key,'h':types.SimpleNamespace(open_directory=lambda path:open_fd(path)),'p':p,'tools':Path('/CONTROLLED/tools'),'private_read':lambda path,*args:raw if str(path)==c['manifestPath'] else index_raw,'identity':lambda fd:{'device':1,'inode':infos[fdmap[fd]].st_ino}}
chosen=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['need','digest','compact','stat_key','duplicate_pairs','strict_json','link_target','artifact_state']];exec(compile(ast.Module(body=chosen,type_ignores=[]),'production-artifact-FD','exec'),env);v=env['artifact_state']();assert v['entries']==626 and v['sourceFilesVerified']==625 and v['bytes']==18413560 and v['metadataSHA256']==meta_sha;assert not fdmap and counts['open']==counts['close']
counts.update(read=0,open=0,close=0);fault[0]='replace'
try:env['artifact_state']();raise AssertionError('stat-open replacement accepted')
except RuntimeError as e:assert str(e)=='R32_MATRIX_CLEANUP_ARTIFACT_FILE_REPLACED'
assert counts['read']==0 and not fdmap and counts['open']==counts['close']
fault[0]='drift';counts.update(read=0,open=0,close=0)
try:env['artifact_state']();raise AssertionError('postread metadata drift accepted')
except RuntimeError as e:assert str(e)=='R32_MATRIX_CLEANUP_ARTIFACT_FILE_CHANGED'
assert not fdmap and counts['open']==counts['close'];print(json.dumps({'controlledFullFiles':625,'controlledBytes':18413560,'replaceRejectedBeforeRead':True,'driftRejected':True,'allFDsClosed':True}))`;
 const r=spawnSync('python',['-c',code],{input:JSON.stringify({program:py,B:f.B}),encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{controlledFullFiles:625,controlledBytes:18413560,replaceRejectedBeforeRead:true,driftRejected:true,allFDsClosed:true});
});
test('actual image Config AST reads four IDs, hides Env and rejects anonymous volume/config drift',()=>{
 const f=fixture(),py=program(f.B);const code=String.raw`import ast,json,sys,re,hashlib,types,copy
x=json.loads(sys.stdin.read());tree=ast.parse(x['program']);env={'json':json,'re':re,'hashlib':hashlib};chosen=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['need','duplicate_pairs','strict_json','hashv','image_state']];exec(compile(ast.Module(body=chosen,type_ignores=[]),'production-image-state','exec'),env);rows=x['B']['imageContract']['images'];calls=[]
def docker(args):
 calls.append(args);v=copy.deepcopy(next(v for v in rows.values() if v['Id']==args[-1]));v['Config']['Env']=['PRIVATE_FIELD=must-not-export'];return types.SimpleNamespace(returncode=0,stdout=json.dumps([v]).encode())
env.update(p=x['B'],VOLUMES={'postgres-data':'/var/lib/postgresql/data','redis-data':'/data','minio-data':'/data'},docker=docker);v=env['image_state']();assert len(calls)==4 and all(q[:2]==['image','inspect'] for q in calls);assert 'PRIVATE_FIELD' not in json.dumps(v) and v['noAnonymousVolumes']
for role,mutate in [('node',lambda v:v['Config'].update(Volumes={'/anonymous':{}})),('postgres',lambda v:v.update(Id='sha256:'+'0'*64)),('redis',lambda v:v['Config'].update(Cmd=['changed']))]:
 def bad(args):
  v=copy.deepcopy(next(v for v in rows.values() if v['Id']==args[-1]));mutate(v) if v['Id']==rows[role]['Id'] else None;return types.SimpleNamespace(returncode=0,stdout=json.dumps([v]).encode())
 env['docker']=bad
 try:env['image_state']();raise AssertionError('image drift accepted')
 except RuntimeError:pass
print(json.dumps({'actualImageReads':4,'configDriftCases':3,'privateEnvironmentExcluded':True}))`;
 const r=spawnSync('python',['-c',code],{input:JSON.stringify({program:py,B:f.B}),encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{actualImageReads:4,configDriftCases:3,privateEnvironmentExcluded:true});
});
test('actual CID argv companion binds PID/boot/inode/start/hash and matches only full owned tokens',()=>{
 const f=fixture(),py=program(f.B);const code=String.raw`import ast,json,sys,types,hashlib
from pathlib import PurePosixPath as Path
x=json.loads(sys.stdin.read());tree=ast.parse(x['program']);env={'hashlib':hashlib,'Path':Path};wanted=['need','digest','container_argv_related'];exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in wanted],type_ignores=[]),'production-CID-argv','exec'),env)
cid=next(iter(x['B']['images'].values()))[7:];pid=42;boot='a';arg=['containerd-shim','-id',cid];start=['S','1']+['0']*17+['500'];stat_raw=('42 (node) '+' '.join(start)).encode();active={};offset={};counter=[10];fault=[None];calls={'read':0,'open':0,'close':0}
def info():return types.SimpleNamespace(st_dev=1,st_ino=9 if fault[0]=='inode' else 8)
def opened(name,flags,dir_fd=None):
 f=counter[0];counter[0]+=1;active[f]='directory' if dir_fd is None else name;offset[f]=0;calls['open']+=1;return f
def read(fd,n):
 calls['read']+=1;raw=stat_raw if active[fd]=='stat' else '\0'.join(arg).encode();v=raw[offset[fd]:offset[fd]+n];offset[fd]+=len(v);return v
def close(fd):calls['close']+=1;del active[fd];del offset[fd]
env.update(OWNED_CONTAINER_IDS={cid},os=types.SimpleNamespace(O_RDONLY=0,O_DIRECTORY=1,O_NOFOLLOW=2,O_NONBLOCK=4,open=opened,close=close,read=read,fstat=lambda _:info(),stat=lambda *args,**kwargs:info()))
a={'identityBound':True,'requestedPID':pid,'boot':boot,'listedProcIdentity':{'device':1,'inode':8}};value={'pid':pid,'boot':boot,'procDevice':1,'procInode':8,'startTicks':'500','ppid':1,'argvSHA256':''}
def invoke(tokens):
 global arg
 arg=tokens;value['argvSHA256']=hashlib.sha256('\0'.join(arg).encode()).hexdigest();return env['container_argv_related'](pid,boot,a,value)
for token in [cid,'-id='+cid,'--id='+cid]:assert invoke(['shim',token])
for token in ['x'+cid,cid+'x','--id='+cid+'x','other-id='+cid]:assert not invoke(['shim',token])
value['argvSHA256']='0'*64
try:env['container_argv_related'](pid,boot,a,value);raise AssertionError('argv change accepted')
except RuntimeError as e:assert str(e).endswith('ARGV_CHANGED')
value['argvSHA256']=hashlib.sha256('\0'.join(arg).encode()).hexdigest();value['startTicks']='different'
try:env['container_argv_related'](pid,boot,a,value);raise AssertionError('start change accepted')
except RuntimeError as e:assert str(e).endswith('PROCESS_CHANGED')
value['startTicks']='500';fault[0]='inode';reads=calls['read']
try:env['container_argv_related'](pid,boot,a,value);raise AssertionError('inode change accepted')
except RuntimeError as e:assert str(e).endswith('INODE_CHANGED')
assert calls['read']==reads;fault[0]=None;a['identityBound']=False
try:env['container_argv_related'](pid,boot,a,value);raise AssertionError('unbound identity accepted')
except RuntimeError as e:assert str(e).endswith('IDENTITY_UNBOUND')
assert not active and calls['open']==calls['close'];print(json.dumps({'ownedTokenMatches':3,'nearMatchesRejected':4,'identityAndHashNegatives':4,'allFDsClosed':True}))`;
 const r=spawnSync('python',['-c',code],{input:JSON.stringify({program:py,B:f.B}),encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{ownedTokenMatches:3,nearMatchesRejected:4,identityAndHashNegatives:4,allFDsClosed:true});
});
test('producer execution uncertainty remains explicit and never changes physical cleanup qualification',()=>{const f=fixture();f.host.executionStatus='failed';f.host.executionPhase.apiProbeEntryStarted=false;assert.equal(qualify(f.host,f.B).cleanupIndependentlyVerified,true);f.host.executionPhase.productCodeExecuted=true;assert.throws(()=>qualify(f.host,f.B),/EXECUTION_PHASE_UNKNOWN/);f.host.executionPhase={candidateCodeMayHaveExecuted:false,apiProbeEntryStarted:false,productCodeExecuted:false,trustedProducerDataOnly:true};assert.equal(qualify(f.host,f.B).cleanupIndependentlyVerified,true);f.host.executionStatus='passed';assert.throws(()=>qualify(f.host,f.B),/EXECUTION_PHASE_UNKNOWN/)});
