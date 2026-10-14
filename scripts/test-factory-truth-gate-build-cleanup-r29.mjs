/** Actual new observer modules, controlled evidence/transport fixtures only. No remote/product execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {sha} from './run-factory-main-repair-r26.mjs';
import {buildCleanupR29Scope as B,buildCleanupR29Names,buildCleanupR29HostProgram,assertBuildCleanupR29Context,assertBuildCleanupR29Host,verifyFactoryTruthGateBuildCleanupR29,buildCleanupR29Failure} from './verify-factory-truth-gate-build-cleanup-r29.mjs';
const clone=v=>JSON.parse(JSON.stringify(v));
const paths=[B.journalPath,B.startPath,B.checkPath,B.nativeJournalPath],raw=await Promise.all(paths.map(p=>readFile(p,'utf8'))),[q,start,check,nq]=raw.map(JSON.parse);
const prior=JSON.parse(await readFile('artifacts/software-factory/goals-r29/native-independent-cleanup-1791820491127-3cad2aa3-8c4f-44dd-9a84-59c3fa569ca2.json','utf8'));
const when=Date.parse('2026-10-12T20:00:00Z');
function host(){return {observedAt:new Date(when).toISOString(),attempt:B.attempt,source:clone(prior.candidate),work:{identity:{device:7,inode:77},metadataSHA256:'e'.repeat(64),entries:625,nofollow:true,stable:true},sourceBeforeAfterStable:true,privateReceiptsStable:true,ownershipSHA256:'1'.repeat(64),launchSHA256:'2'.repeat(64),stateSHA256:'3'.repeat(64),installedToolSHA256:B.toolSHA,node:clone(prior.nativeHost.node),nodeACK:clone(prior.nativeHost.nodeACK),procScope:{...clone(prior.nativeHost.procScope),includesBuildOwnerCgroup:true},scans:prior.nativeHost.scans.map(s=>({...clone(s),ownerCgroupProcesses:[]})),workspaceSockets:clone(prior.nativeHost.workspaceSockets),nativeProcessAndSocketCleanupVerified:true,mutationsPerformed:false,signalsSent:false,resourcesRemoved:false,rawLogsExported:false,privateEnvironmentExported:false,rawArgvExported:false,docker:{exactNames:clone(buildCleanupR29Names),absentNames:clone(buildCleanupR29Names),present:[],labelScopes:[['label=jarvis.truthgate.r29.attempt='+B.attempt],['label=jarvis.truthgate.r29.attempt='+B.attempt,'label=jarvis.truthgate.r29.kind=build']].map(filters=>({filters,containers:[],networks:[],volumes:[]})),containersNetworksVolumesQueried:true,readOnly:true,complete:true},owner:{identity:{pid:B.ownerPID,startTicks:B.ownerStartTicks,boot:B.ownerBoot},bootSame:true,pidAbsent:true,unit:{Id:'jarvis-tg-r29-'+B.attempt+'-owner.service',LoadState:'not-found',ActiveState:'inactive',SubState:'dead',MainPID:'0',ControlGroup:''},cgroupPath:'/system.slice/jarvis-tg-r29-'+B.attempt+'-owner.service',cgroupPresent:false,cgroupPIDs:[],readOnly:true,complete:true}};}
function harness(edit={}){let nativeCalls=0,rootCalls=0,reads=0;const h=host();edit.host?.(h);const d={api:()=>{throw Error('UNEXPECTED_REAL_API')},now:()=>when,readLocal:async p=>{reads++;const i=paths.indexOf(p);assert.ok(i>=0);return edit.local?.(p,reads,raw[i])??raw[i]},verifyNative:async()=>{nativeCalls++;const n=clone(prior);edit.native?.(n,nativeCalls);return n},readRoot:async(p,code)=>{rootCalls++;assert.deepEqual(p,B);assert.ok(code.includes('pidfd_exit_proof'));return clone(h)}};return {h,d,invoke:()=>verifyFactoryTruthGateBuildCleanupR29({attempt:B.attempt},d),counts:()=>({nativeCalls,rootCalls,reads})};}
test('fixed actual failed-build receipt pins and import are inert',()=>{assert.equal(sha(raw[1]),B.startSHA);assert.equal(sha(raw[2]),B.checkSHA);assertBuildCleanupR29Context(q,start,check);assert.equal(typeof verifyFactoryTruthGateBuildCleanupR29,'function');});
test('true cleanup keeps failed environment start and unknown later stages',async()=>{const h=harness(),r=await h.invoke();assert.equal(r.ready,true);assert.equal(r.cleanupIndependentlyVerified,true);assert.equal(r.productAccepted,false);assert.equal(r.candidateProductExecutionConfirmed,false);assert.deepEqual(r.noRecordedResultStages,['build','typecheck','truth-unit']);assert.deepEqual(h.counts(),{nativeCalls:2,rootCalls:1,reads:8});assert.equal(r.workerCleanupClaimsUsedAsProof,false);});
test('wrong or missing attempt refuses all IO',async()=>{for(const o of [{},{attempt:'0'.repeat(32)},{attempt:B.attempt,execute:true}])await assert.rejects(verifyFactoryTruthGateBuildCleanupR29(o,{api:()=>{},readLocal:()=>assert.fail('IO')}),/EXACT_ATTEMPT_REQUIRED/);});
test('root ownership receipt and source identity scope cannot change',()=>{for(const mutate of [v=>v.attempt='0'.repeat(32),v=>v.installedToolSHA256='0'.repeat(64),v=>v.source.identity.inode++,v=>v.privateReceiptsStable=false,v=>v.work.stable=false]){const h=host();mutate(h);assert.throws(()=>assertBuildCleanupR29Host(h,prior,nq),/R29_BUILD_CLEANUP_/);}});
test('an incomplete source scope never reads build host',async()=>{const h=harness({native:n=>{n.ready=false;n.cleanupIndependentlyVerified=false}}),r=await h.invoke();assert.equal(r.ready,false);assert.equal(h.counts().rootCalls,0);});
test('alive owner, reused present PID or uncleared cgroup cannot pass',async()=>{for(const mutate of [h=>h.owner.pidAbsent=false,h=>{h.owner.unit.ActiveState='active';h.owner.unit.MainPID=String(B.ownerPID)},h=>h.owner.cgroupPIDs=[123]]){const h=harness({host:v=>{mutate(v);v.owner.complete=false}}),r=await h.invoke();assert.equal(r.ready,false);}await assert.rejects(harness({host:h=>h.owner.bootSame=false}).invoke(),/OWNER_OBSERVATION_INVALID/);});
test('independent names and both label scopes cover container/network/volume residue',async()=>{for(const mutate of [h=>{h.docker.absentNames.pop();h.docker.present=[{name:buildCleanupR29Names[3]}]},...['containers','networks','volumes'].flatMap(k=>[0,1].map(i=>h=>h.docker.labelScopes[i][k]=['residue']))]){const h=harness({host:v=>{mutate(v);v.docker.complete=false}}),r=await h.invoke();assert.equal(r.ready,false);}await assert.rejects(harness({host:h=>h.docker.labelScopes.pop()}).invoke(),/DOCKER_CENSUS_INCOMPLETE/);});
test('forged self cleanup flags cannot hide exact scope residue',async()=>{await assert.rejects(harness({host:h=>h.docker.labelScopes[0].networks=['residue']}).invoke(),/DOCKER_COMPLETE_FLAG_CHANGED/);await assert.rejects(harness({host:h=>h.owner.pidAbsent=false}).invoke(),/OWNER_COMPLETE_FLAG_CHANGED/);});
test('FD/cwd/argv/cgroup/socket/ACK and full census accounting remain strict',async()=>{for(const mutate of [h=>{h.scans[0].ownerCgroupProcesses=[123];h.scans[0].relatedProcesses=[{pid:123}]},h=>h.workspaceSockets.filesystem=[{inode:1}],h=>h.workspaceSockets.procNetUnix=[{inode:'1'}]]){const h=harness({host:v=>{mutate(v);v.nativeProcessAndSocketCleanupVerified=false}});assert.equal((await h.invoke()).ready,false);}await assert.rejects(harness({host:h=>h.scans[0].inspectedPIDs.pop()}).invoke(),/COUNTS_NOT_CLOSED/);await assert.rejects(harness({host:h=>h.nodeACK.counts.logs=1}).invoke(),/R29_CLEANUP_/);});
test('final source/terminal/protected inventory or journal drift refuses',async()=>{for(const mutate of [n=>n.terminal.resultSHA256='0'.repeat(64),n=>n.candidate.metadataSHA='0'.repeat(64),n=>n.protectedInventorySHA256='0'.repeat(64),n=>n.queueIdle=false])await assert.rejects(harness({native:(n,i)=>{if(i===2)mutate(n)}}).invoke(),/SOURCE_PLATFORM_OBSERVATION_CHANGED/);await assert.rejects(harness({local:(p,i,text)=>i>4&&p===B.journalPath?text+' ':text}).invoke(),/LOCAL_CONTEXT_CHANGED/);});
test('stale host cannot greenlight a fresh outer observation',async()=>{await assert.rejects(harness({host:h=>h.observedAt='2026-10-11T00:00:00Z'}).invoke(),/OBSERVATION_STALE/);});
test('lazy allSettled local readers finish after synchronous failure',async()=>{let finished=false;const d={api:()=>{},readLocal:p=>{if(p===B.journalPath)throw Error('fixture-sync-fail');return new Promise(resolve=>setTimeout(()=>{finished=true;resolve('{}')},5))}};await assert.rejects(verifyFactoryTruthGateBuildCleanupR29({attempt:B.attempt},d),/fixture-sync-fail/);assert.equal(finished,true);});
test('public failure never exports private diagnostic strings',()=>{const r=buildCleanupR29Failure(Error('PRIVATE_COOKIE TOKEN=private'));assert.equal(r.errorCode,'R29_BUILD_CLEANUP_OBSERVATION_FAILED');assert.ok(!JSON.stringify(r).includes('PRIVATE_COOKIE'));assert.equal(r.resourcesRemoved,false);});
test('actual generated Python compiles and actual Docker census rejects unconfirmed reads',()=>{
 const code=buildCleanupR29HostProgram(),py=String.raw`import ast,json,sys,types
v=json.load(sys.stdin);tree=ast.parse(v['source']);compile(tree,'<actual-readonly-observer>','exec')
names=v['names'];p={'attempt':v['attempt']};mode='empty'
def need(ok,c):
 if not ok:raise RuntimeError(c)
def hashv(v):return 'a'*64
def docker(args):
 if args[:2]==['container','inspect']:
  name=args[-1]
  if mode=='unconfirmed':return types.SimpleNamespace(returncode=1,stdout=b'[]',stderr=b'Error: No such object: foreign')
  if mode=='inspectfailure':return types.SimpleNamespace(returncode=2,stdout=b'',stderr=b'private')
  if mode=='present':return types.SimpleNamespace(returncode=0,stdout=json.dumps([dict(Name='/'+name,Id='1',Image='pin',Config={})]).encode(),stderr=b'')
  return types.SimpleNamespace(returncode=1,stdout=b'[]',stderr=('Error: No such container: '+name).encode())
 if mode=='scopefailure':return types.SimpleNamespace(returncode=1,stdout=b'',stderr=b'private')
 return types.SimpleNamespace(returncode=0,stdout=b'residue\n' if mode=='residue' else b'',stderr=b'')
ns={'subprocess':None,'names':names,'p':p,'json':json,'re':__import__('re'),'need':need,'docker':docker,'hashv':hashv}
fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='docker_census');exec(compile(ast.Module(body=[fn],type_ignores=[]),'<actual-docker-census>','exec'),ns)
assert ns['docker_census']()['complete'] is True
for mode in ['unconfirmed','inspectfailure','scopefailure']:
 try:ns['docker_census']();raise AssertionError('accepted '+mode)
 except RuntimeError:pass
for mode in ['present','residue']:assert ns['docker_census']()['complete'] is False
# Mutation calls and worker cleanup code must not occur in this assembled observer.
for n in ast.walk(tree):
 if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute):assert n.func.attr not in ['kill','killpg','remove','unlink','rmdir','rmtree','mkdir','chmod','chown','replace','Popen']
assert 'reconcile_cleanup' not in v['source'] and 'os.scandir(fds)' in v['source'] and 'pidfd_exit_proof' in v['source']
print(json.dumps(dict(actualDockerCases=6,pythonASTCompiled=True,mutationCallsAbsent=True)))
`;
 const r=spawnSync('python',['-c',py],{input:JSON.stringify({source:code,names:buildCleanupR29Names,attempt:B.attempt}),encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).actualDockerCases,6);assert.ok(code.indexOf('work_before=work_state();sockets_before=workspace_sockets()')<code.indexOf('scan_before=census()'));});
