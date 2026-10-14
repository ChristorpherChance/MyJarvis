/** Local R4 reader qualification only. No SSH, Docker, product or model execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {sha} from './run-factory-main-repair-r26.mjs';
import {buildStartR29R4Scope as S} from './start-factory-truth-gate-build-r29-r4.mjs';
import {buildCleanupR29Scope as Old} from './verify-factory-truth-gate-build-cleanup-r29.mjs';
import {assertBuildR29R4Scope,buildCleanupR29R4HostProgram,verifyFactoryTruthGateBuildCleanupR29R4} from './verify-factory-truth-gate-build-cleanup-r29-r4.mjs';

const readerPath='scripts/verify-factory-truth-gate-build-cleanup-r29-r4.mjs';
const readerSHA='202b87ba0bda17f356beaec55b3b29bc5d8ea8466134fc1ba5729682dcefa219';
const proofPath=S.originalProtectionProof,proofRaw=await readFile(proofPath,'utf8');
assert.equal(sha(proofRaw),S.originalProtectionProofSHA);
assert.equal(sha(await readFile(readerPath)),readerSHA);
const historical=JSON.parse(proofRaw),worker=await readFile('scripts/factory-truth-gate-build-r29-r4.py');
assert.equal(sha(worker),S.toolSHA);
const clone=v=>JSON.parse(JSON.stringify(v)),attempt='a'.repeat(32),now=Date.now();
const stages=['mount-proof','offline-install','build','typecheck','truth-unit'];
const jp='.jarvis-dev/maintenance/factory-r29-isolated-build-r4-attempt.json';
const startPath='artifacts/software-factory/goals-r29/isolated-build-r4-start-1791829000000-11111111-1111-1111-1111-111111111111.json';
const identity={pid:1700000,startTicks:'28000000',boot:historical.node.boot};
const start={kind:'software-factory-r29-r4-once-build-observation',attempt,scope:S,processIdentity:identity,launchPhase:'dispatched',ownerUnit:'jarvis-tg-r29-'+attempt+'-owner.service',installedToolSHA256:S.toolSHA,productAccepted:false,modelsInvoked:false};
const startRaw=JSON.stringify(start),startSHA=sha(startRaw);
const B={...Old,attempt,tool:S.tool,toolSHA:S.toolSHA,ownerPID:identity.pid,ownerStartTicks:identity.startTicks,ownerBoot:identity.boot,journalPath:jp,startPath,startSHA,checkPath:null,checkSHA:null};
const allNames=stages.map(s=>'jarvis-tg-r29-'+attempt+'-'+s);
function host(){
 const h=clone(historical.observations.oldBuild);
 h.attempt=attempt;h.observedAt=new Date(now).toISOString();h.installedToolSHA256=S.toolSHA;
 h.node.state='R';for(const s of h.scans)s.node=clone(h.node);
 h.docker.exactNames=clone(allNames);h.docker.absentNames=clone(allNames);
 h.docker.labelScopes[0].filters=['label=jarvis.truthgate.r29.attempt='+attempt];
 h.docker.labelScopes[1].filters=['label=jarvis.truthgate.r29.attempt='+attempt,'label=jarvis.truthgate.r29.kind=build'];
 h.owner.identity=clone(identity);h.owner.unit.Id=start.ownerUnit;h.owner.cgroupPath='/system.slice/'+start.ownerUnit;
 h.buildResultStatus='fail';h.stageResults=[];h.normalBindBootstrap=null;
 return h;
}
function harness(edit={}){
 const q={version:1,kind:'r29-r4-once-build-intent',startAttemptedAt:new Date(now).toISOString(),attempt,scope:clone(S),receipts:{start:{path:startPath,sha256:startSHA,launchPhase:'dispatched',processIdentity:clone(identity)}}};
 edit.q?.(q);const raw=JSON.stringify(q),h=host();edit.host?.(h);
 let rootReads=0,protectionReads=0,localReads=0;
 const deps={now:()=>now,readLocal:async p=>{localReads++;if(p===jp)return raw;if(p===startPath)return edit.startRaw??startRaw;if(p==='scripts/factory-truth-gate-build-r29-r4.py')return worker;throw Error('UNEXPECTED_LOCAL_PATH')},
  verifyProtection:async()=>{const p=clone(historical);p.at=new Date(now).toISOString();protectionReads++;edit.protection?.(p,protectionReads);return p},
  readRoot:async(scope,program)=>{rootReads++;assert.equal(scope.attempt,attempt);assert.ok(program.includes("len(absent)==5"));return h}};
 return {run:()=>verifyFactoryTruthGateBuildCleanupR29R4(deps),counts:()=>({rootReads,protectionReads,localReads}),h,q};
}

test('actual caller permits cleaned pass/fail terminal evidence without product acceptance or claims substitution',async()=>{
 for(const status of ['pass','fail']){
  const f=harness({host:h=>{h.buildResultStatus=status;h.cleanupClaimsComplete=false}}),r=await f.run();
  assert.equal(r.ready,true);assert.equal(r.cleanupIndependentlyVerified,true);assert.equal(r.buildHost.buildResultStatus,status);
  assert.equal(r.workerCleanupClaimsUsedAsProof,false);assert.equal(r.productAccepted,false);assert.equal(r.full74ObjectivesAccepted,false);
  assert.equal(r.remoteMutationsPerformed,false);assert.equal(f.counts().rootReads,1);assert.equal(f.counts().protectionReads,2);
 }
});

test('whole-proc unknown identity remains notReady despite terminal/cleanup claims',async()=>{
 const f=harness({host:h=>{const s=h.scans[0],pid=s.inspectedPIDs.find(p=>p!==h.node.pid);s.inspectedPIDs=s.inspectedPIDs.filter(p=>p!==pid);s.readIncompletePIDs=[pid];s.counts.inspected--;s.counts.incomplete++;h.nativeProcessAndSocketCleanupVerified=false;h.buildResultStatus='pass';h.cleanupClaimsComplete=true}});
 const r=await f.run();assert.equal(r.ready,false);assert.equal(r.cleanupIndependentlyVerified,false);
 const bad=host();bad.scans[0].counts.listed++;assert.throws(()=>assertBuildR29R4Scope(bad,B),/COUNTS_NOT_CLOSED/);
});

test('five exact names, both label scopes and owner group independently determine cleanup',()=>{
 for(const mutate of [
  h=>{h.docker.absentNames.pop();h.docker.present=[{name:allNames.at(-1)}];h.docker.complete=false},
  h=>{h.docker.labelScopes[0].volumes=['retained'];h.docker.complete=false},
  h=>{h.owner.pidAbsent=false;h.owner.complete=false},
  h=>{h.scans[0].ownerCgroupProcesses=[1900000];h.scans[0].relatedProcesses=[1900000];h.nativeProcessAndSocketCleanupVerified=false},
  h=>{h.workspaceSockets.filesystem=['retained.sock'];h.nativeProcessAndSocketCleanupVerified=false}
 ]){const h=host();mutate(h);assert.equal(assertBuildR29R4Scope(h,B).buildResourcesIndependentlyClean,false);}
 const old=host();old.docker.exactNames.shift();assert.throws(()=>assertBuildR29R4Scope(old,B),/DOCKER_INCOMPLETE/);
});

test('exact frozen intent/public receipt rejects wrong kind, scope or hash before root census',async()=>{
 for(const edit of [
  {q:q=>{q.kind='legacy-build'}},
  {q:q=>{q.scope.ownerLifecycleReviewSHA='0'.repeat(64)}},
  {q:q=>{q.receipts.start.path='../outside.json'}},
  {startRaw:startRaw+' '}
 ]){const f=harness(edit);await assert.rejects(f.run(),/R29_R4_CLEANUP_/);assert.equal(f.counts().rootReads,0);}
});

test('R/S scheduling is harmless but complete identity and ACK cross-read changes are refused',async()=>{
 assert.equal((await harness().run()).ready,true);
 for(const mutate of [p=>{p.node.startTicks+='1'},p=>{p.node.argvSHA256='0'.repeat(64)},p=>{p.observations.nativeSource.nodeACK.identity.inode++},p=>{p.sources.main.metadataSHA='0'.repeat(64)}]){
  const f=harness({protection:(p,n)=>{if(n===2)mutate(p)}});await assert.rejects(f.run(),/PROTECTED_SOURCE_CHANGED/);
 }
});

test('actual generated Python parses and independently rejects log/hash/TAP/bypass/false-pass evidence',()=>{
 const program=buildCleanupR29R4HostProgram(B),a=program.indexOf("\nstages=['mount-proof','offline-install','build','typecheck','truth-unit'];checks="),z=program.indexOf('\ndef work_state():',a);
 assert.ok(a>0&&z>a);const block=program.slice(a,z);
 assert.ok(program.includes("'buildResultStatus':state['status'],'stageResults':checks"));
 assert.ok(program.includes("'normalBindBootstrap':state.get('normalBindBootstrap')"));
 const python=String.raw`
import ast,json,sys,hashlib,re
from pathlib import Path
p=json.load(sys.stdin);ast.parse(p['program']);block=compile(p['block'],'<actual-r4-result-reader>','exec')
def need(v,c):
 if not v:raise RuntimeError(c)
def digest(v):return hashlib.sha256(v).hexdigest()
bootstrap={'schemaVersion':1,'kind':'r29-r4-normal-bind-bootstrap','uid':1000,'gid':1000,'workWritable':True,'candidateCodeExecuted':False,'caches':[{'readOnlyMount':True,'mutationRejected':True,'bytesVerified':True} for _ in range(3)]}
ids=['mount-proof','offline-install','build','typecheck','truth-unit']
logs={ids[0]:json.dumps(bootstrap).encode(),ids[1]:b'install',ids[2]:b'build',ids[3]:b'typecheck',ids[4]:b'# tests 16\n# pass 16\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n'}
def fixture():
 checks=[{'id':i,'status':'pass','executed':True,'candidateCodeExecuted':i!='mount-proof','containerID':'a'*64,'logSHA256':digest(logs[i]),'logBytes':len(logs[i]),'exitCode':0,'timeout':False,'logLimitExceeded':False,'tests':{'tests':16,'pass':16,'fail':0,'cancelled':0,'skipped':0,'todo':0} if i=='truth-unit' else None} for i in ids]
 return {'status':'pass','checks':checks,'noRecordedResultStages':[],'noRecordedResultExecutionState':'unknown','normalBindBootstrap':bootstrap}
def run(s,l):
 g={'need':need,'digest':digest,'json':json,'re':re,'state':s,'attempt_root':Path('/controlled'),'private_read':lambda path,limit:l[path.stem]};exec(block,g)
results=[]
s=fixture();run(s,logs);results.append('five-pass')
s=fixture();s['status']='fail';s['checks']=s['checks'][:1];s['checks'][0]['status']='fail';s['noRecordedResultStages']=ids[1:];run(s,logs);results.append('failed-prefix')
for name in ['log-hash','tap-denominator','false-execution','bootstrap-bypass','install-bypass','false-terminal-pass']:
 s=fixture();l=dict(logs)
 if name=='log-hash':l['build']+=b'x'
 if name=='tap-denominator':l['truth-unit']=l['truth-unit'].replace(b'# tests 16',b'# tests 15');s['checks'][4]['logSHA256']=digest(l['truth-unit']);s['checks'][4]['logBytes']=len(l['truth-unit'])
 if name=='false-execution':s['checks'][2]['executed']=False;s['checks'][2]['candidateCodeExecuted']=False
 if name=='bootstrap-bypass':s['checks'][0]['status']='fail'
 if name=='install-bypass':s['checks'][1]['status']='fail'
 if name=='false-terminal-pass':s['checks']=s['checks'][:1];s['noRecordedResultStages']=ids[1:]
 try:run(s,l)
 except RuntimeError as e:results.append(name+':'+str(e));continue
 raise AssertionError(name+' was accepted')
print(json.dumps({'compiled':True,'scenarios':results,'count':len(results)}))
`;
 const r=spawnSync('python',['-c',python],{input:JSON.stringify({program,block}),encoding:'utf8',timeout:10000,windowsHide:true});
 assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout);assert.equal(out.compiled,true);assert.equal(out.count,8);
});
