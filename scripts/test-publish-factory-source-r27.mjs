import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {assertR27SourceDelta,r27SourcePublishProgram,sourcePublicationHelpers,sourcePublicationScope as P,runSourcePublication,assertSourcePublicationJournal,sourcePublicationFailure} from './publish-factory-source-r27.mjs';
import {sha,repairScope as S} from './run-factory-main-repair-r26.mjs';
import {r27HostConstants as C} from './factory-verifier-host-r27.mjs';
import {r27VerifierScope as V} from './prepare-factory-verifier-r27.mjs';
import {fixedToolSHA} from './prepare-factory-repair-verifier-r26.mjs';
const baseline=[{path:'doc/msf-prototype.html',sha256:'a'.repeat(64),bytes:20}];
const input=()=>({schemaVersion:1,kind:'software-factory-r27-approved-source-delta',workspace:'/home/superopen/All-Projects/msf-repair-r27/source',baselineFingerprint:'66a56a19ce783c020ed211d7c6a2b620f1767783cd9c58525df3ca33dc0ce246',fullValidationExecuted:false,productAccepted:false,files:[{path:baseline[0].path,oldSHA256:baseline[0].sha256,newSHA256:'b'.repeat(64),bytes:22,reason:'Fix visible handoff summary and content-bound performance'}]});
test('approved explicit public delta preserves unvalidated status',()=>assert.equal(assertR27SourceDelta(input(),baseline).productAccepted,false));
test('private, main-scope, unlisted and generated evidence paths are denied',()=>{for(const path of ['.env','../msf/doc/msf-prototype.html','doc/evidence/selftest.json','doc/tests/syntax.cjs']){const v=input();v.files[0].path=path;assert.throws(()=>assertR27SourceDelta(v,baseline));}});
test('duplicate, stale old digest, unchanged digest and product-pass claims are denied',()=>{for(const change of [v=>v.files.push({...v.files[0]}),v=>v.files[0].oldSHA256='c'.repeat(64),v=>v.files[0].newSHA256='a'.repeat(64),v=>v.productAccepted=true]){const v=input();change(v);assert.throws(()=>assertR27SourceDelta(v,baseline));}});
test('new contract can be added only when absent from authenticated baseline',()=>{const v=input();v.files=[{path:'doc/tests/runtime-fixture-contract-r27.json',oldSHA256:null,newSHA256:'c'.repeat(64),bytes:40,reason:'Version actual fixed runtime fixture'}];assert.doesNotThrow(()=>assertR27SourceDelta(v,baseline));assert.throws(()=>assertR27SourceDelta(v,[...baseline,{path:v.files[0].path,sha256:'d'.repeat(64)}]));});
test('only the explicit extra cache-boundary suite may be added, requiring baseline absence and preserving original prototype denominator',()=>{const v=input();v.files=[{path:'doc/tests/cache-boundary-r27.cjs',oldSHA256:null,newSHA256:'c'.repeat(64),bytes:40,reason:'Additional local cache negative tests, separate from original required thirty suites'}];assert.doesNotThrow(()=>assertR27SourceDelta(v,baseline));assert.throws(()=>assertR27SourceDelta(v,[...baseline,{path:v.files[0].path,sha256:'d'.repeat(64)}]));for(const path of ['doc/tests/cache-boundary-r28.cjs','doc/tests/cache-r27.cjs','doc/tests/cache-boundary-r27.cjs/other']){v.files[0].path=path;assert.throws(()=>assertR27SourceDelta(v,baseline));}});
test('root publisher Python compiles without running paths or connecting',()=>{const r=spawnSync('python',['-c',"import sys;compile(sys.stdin.read(),'<fixed-r27-publisher>','exec')"],{input:r27SourcePublishProgram(),encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr);});

function fixture(){
 const raw=JSON.stringify(input()),body=Buffer.from('controlled changed public bytes'),file={path:'doc/msf-prototype.html',oldSHA256:'a'.repeat(64),newSHA256:sha(body),bytes:body.length,reason:'approved delta',base64:body.toString('base64')},deltaPath='artifacts/software-factory/repair-r27/approved-source-delta-fixture.json';
 const payload={deltaSHA256:sha(raw),...V,source:S.source,oldCandidate:C.oldCandidate,agentId:C.agentId,templateId:S.templateId,fixedTools:fixedToolSHA,mainFingerprint:S.baselineSHA,mainMetadataSHA256:C.mainMetadataSHA256,oldCandidateFingerprint:C.oldCandidateFingerprint,originSHA256:C.originSHA256,expectedBaselineFingerprint:P.baselineFingerprint,expectedBaselineMetadataSHA256:P.baselineMetadataSHA256,files:[file]};
 const source={sha256:S.baselineSHA,files:593,bytes:17914164,metadataSHA:C.mainMetadataSHA256,identity:C.mainIdentity,stable:true},old={sha256:C.oldCandidateFingerprint,files:605,bytes:18078081,metadataSHA:C.oldCandidateMetadataSHA256,identity:C.oldCandidateIdentity,stable:true},before={...old,metadataSHA:P.baselineMetadataSHA256,identity:{device:66306,inode:6713710}},after={...before,sha256:'e'.repeat(64),metadataSHA:'f'.repeat(64),files:605,bytes:18078090};
 const calls=[],writes=[];let durable;
 const response=p=>({schemaVersion:1,kind:'software-factory-r27-source-publication',action:p.action,workspace:V.workspace,job:p.job,deltaSHA256:p.deltaSHA256,mainBefore:source,mainAfter:source,oldCandidateBefore:old,oldCandidateAfter:old,candidateBefore:before,candidateAfter:p.action==='inspect'?before:after,originSHA256:C.originSHA256,originBound:true,published:p.action!=='inspect',files:p.files.map(({path,oldSHA256,newSHA256,bytes})=>({path,oldSHA256,newSHA256,bytes})),fullValidationExecuted:false,productAccepted:false,modelsInvoked:false,privateFilesCopied:false,gitHistoryCopied:false,quiet:{active:true,pid:100,start:'1010',boot:'fixtureboot',children:[],counts:{runs:0,deliveries:0,logs:0}},readOnly:p.action!=='publish',reconciledReadOnly:p.action==='reconcile',oldBytesPreserved:p.action!=='inspect',rootIntentSHA256:p.action==='inspect'?null:'1'.repeat(64)});
 const deps={now:()=>Date.parse('2026-10-12T12:00:00Z'),randomUUID:()=> '12345678-1234-1234-1234-123456789abc',readLocal:async p=>{if(p===deltaPath)return raw;if(p===P.journalPath&&durable)return JSON.stringify(durable);throw Object.assign(Error('missing'),{code:'ENOENT'});},preparePayload:async()=>payload,queueState:async()=>({readOnly:true,fullTable:true,allActive:0}),saveJournal:async j=>{assertSourcePublicationJournal(j);durable=structuredClone(j);writes.push(j.phase);},readRoot:async p=>{calls.push(p.action);return response(p);}};
 return {deps,deltaPath,calls,writes,response,payload,get journal(){return durable;},set journal(j){durable=structuredClone(j);}};
}
test('real orchestrator persists job and exact immutable intent before the only publish call; default inspect writes nothing',async()=>{
 const f=fixture(),i=await runSourcePublication({deltaPath:f.deltaPath},f.deps);assert.equal(i.readOnly,true);assert.equal(f.writes.length,0);assert.equal(f.journal,undefined);assert.deepEqual(f.calls,['inspect']);
 const g=fixture();g.deps.readRoot=async p=>{g.calls.push(p.action);if(p.action==='publish'){assert.equal(g.journal.phase,'publish-attempted');assert.equal(g.journal.job,p.job);assert.equal(g.journal.deltaSHA256,p.deltaSHA256);assert.equal(g.journal.before.candidateBefore.metadataSHA,P.baselineMetadataSHA256);}return g.response(p);};const r=await runSourcePublication({action:'publish',deltaPath:g.deltaPath},g.deps);assert.deepEqual(g.calls,['inspect','publish']);assert.deepEqual(g.writes,['prepared','publish-attempted','published']);assert.equal(r.sourceObservation.candidateFingerprint,'e'.repeat(64));assert.equal(r.productAccepted,false);
});
test('lost publish reply never retries mutation or creates a new job; exact read-only reconciliation recovers the pinned source observation',async()=>{
 const f=fixture();f.deps.readRoot=async p=>{f.calls.push(p.action);if(p.action==='publish')throw Error('fixture response lost');return f.response(p);};await assert.rejects(()=>runSourcePublication({action:'publish',deltaPath:f.deltaPath},f.deps),/response lost/);const job=f.journal.job;assert.equal(f.journal.phase,'publish-attempted');const r=await runSourcePublication({action:'publish',deltaPath:f.deltaPath},f.deps);assert.deepEqual(f.calls,['inspect','publish','reconcile']);assert.equal(r.job,job);assert.equal(r.remoteMutationsPerformed,false);assert.equal(r.readOnly,true);assert.equal(r.requestedAction,'publish');assert.equal(r.sourceObservation.files,605);
 const count=f.writes.length;await runSourcePublication({action:'inspect',deltaPath:f.deltaPath},f.deps);assert.equal(f.writes.length,count);assert.deepEqual(f.calls,['inspect','publish','reconcile','reconcile']);
});
test('partial publication, failed final save, changed delta and changed postcommit metadata remain unreconciled without a second mutation',async()=>{
 const f=fixture();f.deps.saveJournal=async j=>{if(j.phase==='published')throw Error('fixture local final save lost');f.journal=j;f.writes.push(j.phase);};await assert.rejects(()=>runSourcePublication({action:'publish',deltaPath:f.deltaPath},f.deps),/save lost/);assert.equal(f.journal.phase,'publish-attempted');f.deps.readRoot=async p=>{f.calls.push(p.action);throw Error('R27_SOURCE_PARTIAL_PUBLICATION_RECONCILIATION_REQUIRED');};await assert.rejects(()=>runSourcePublication({action:'publish',deltaPath:f.deltaPath},f.deps),/PARTIAL_PUBLICATION/);assert.deepEqual(f.calls,['inspect','publish','reconcile']);
 const g=fixture();await runSourcePublication({action:'publish',deltaPath:g.deltaPath},g.deps);g.deps.readRoot=async p=>{g.calls.push(p.action);const r=g.response(p);r.candidateAfter.metadataSHA='2'.repeat(64);return r;};await assert.rejects(()=>runSourcePublication({action:'reconcile',deltaPath:g.deltaPath},g.deps),/PUBLISHED_METADATA_CHANGED/);assert.equal(g.calls.filter(c=>c==='publish').length,1);
 g.deps.readLocal=async p=>p===P.journalPath?JSON.stringify(g.journal):'changed approval';const seen=g.calls.length;await assert.rejects(()=>runSourcePublication({action:'publish',deltaPath:g.deltaPath},g.deps),/SAVED_DELTA_CHANGED/);assert.equal(g.calls.length,seen);
 const e=sourcePublicationFailure(Error('PRIVATE_SSH_BODY'),'publish',f.journal);assert.equal(e.job,f.journal.job);assert.equal(e.reconciliationRequired,true);assert.equal(e.automaticNewJob,false);assert.ok(!JSON.stringify(e).includes('PRIVATE_SSH_BODY'));
});
test('production root helper loops short writes, fsyncs old bytes and directory, rejects zero writes; fresh ACK and PID changes reject commit',()=>{
 const script=String.raw`import ast,sys,types,json,hashlib
source=sys.stdin.read();tree=ast.parse(source);wanted={'durable_private_file','require_same_quiet','require_commit_ready'};selected=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in wanted],type_ignores=[])
class OS:
 O_WRONLY=1;O_CREAT=2;O_EXCL=4;O_NOFOLLOW=8
 def __init__(self):self.body=b'';self.events=[];self.zero=False
 def open(self,name,flags,mode,dir_fd):self.events.append(('open',name,flags,mode,dir_fd));return 10
 def write(self,fd,body):
  if self.zero:return 0
  n=min(2,len(body));self.body+=body[:n];self.events.append(('write',n));return n
 def fsync(self,fd):self.events.append(('fsync',fd))
 def close(self,fd):self.events.append(('close',fd))
def need(v,c):
 if not v:raise RuntimeError(c)
os=OS();before={'sha256':'public'};good={'pid':9,'start':'10','boot':'fixed','children':[],'counts':{'runs':0,'deliveries':0,'logs':0}};ns={'os':os,'need':need,'p':{'workspace':'candidate'},'source_state':lambda _: (before,None),'quiet':lambda:good}
exec(compile(selected,'<production-root-helpers>','exec'),ns);ns['durable_private_file'](99,'0.before',b'original');assert os.body==b'original';assert os.events[-3:]==[('fsync',10),('close',10),('fsync',99)]
os.zero=True
try:ns['durable_private_file'](99,'1.before',b'old');raise AssertionError('zero write accepted')
except RuntimeError as e:assert str(e)=='R27_SOURCE_SHORT_WRITE'
assert os.events[-1]==('close',10);ns['require_commit_ready'](before,good)
for patch in [{'children':[1]},{'counts':{'runs':0,'deliveries':0,'logs':1}},{'pid':11},{'start':'different'},{'boot':'different'}]:
 ns['quiet']=lambda patch=patch:{**good,**patch}
 try:ns['require_commit_ready'](before,good);raise AssertionError('unsafe commit accepted')
 except RuntimeError as e:assert str(e)=='R27_SOURCE_NODE_CHANGED_BEFORE_COMMIT'
ns['quiet']=lambda:good;ns['source_state']=lambda _:({'sha256':'changed'},None)
try:ns['require_commit_ready'](before,good);raise AssertionError('changed source accepted')
except RuntimeError as e:assert str(e)=='R27_SOURCE_CHANGED_DURING_STAGING'
print(json.dumps({'passed':9,'productionAST':True}))`;
 const r=spawnSync('python',['-c',script],{input:sourcePublicationHelpers,encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).productionAST,true);
 const program=r27SourcePublishProgram(),firstReplace=program.indexOf('os.replace(temp,name');assert.ok(firstReplace>program.lastIndexOf('require_commit_ready(before,quiet_before)',firstReplace));assert.ok(program.includes("durable_private_file(backupfd,str(index)+'.before',raw)"));assert.ok(program.includes("durable_json(backupfd,'committing.json'"));assert.ok(program.includes("durable_json(backupfd,'commit-'+str(index)+'.json'"));assert.ok(!program.includes('q.write_bytes(raw)'));
});
test('actual production read-only reconcile requires preserved old bytes, full after manifest, durable per-file metadata and a free root writer lock',()=>{
 const script=String.raw`import ast,sys,types,json,hashlib,stat,copy
tree=ast.parse(sys.stdin.read());names={'reconcile_publication','require_same_quiet'};selected=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[])
class Path:
 def __init__(self,v):self.v=str(v)
 def __truediv__(self,n):return Path(self.v+'/'+str(n))
 def __str__(self):return self.v
 def lstat(self):return types.SimpleNamespace(st_mode=stat.S_IFDIR|0o700)
def need(v,c):
 if not v:raise RuntimeError(c)
def encoded(v):return json.dumps(v,sort_keys=True,separators=(',',':')).encode()
def setup():
 path='doc/msf-prototype.html';old_bytes=b'old';new_bytes=b'changed';digest=lambda b:hashlib.sha256(b).hexdigest();job='a'*32;delta='b'*64;main={'sha256':'protected-main'};old={'sha256':'protected-old'};origin={'sha256':'origin'};before={'sha256':'base','metadataSHA':'old-metadata'}
 before_row=[path,1,2,1000,1000,stat.S_IFREG|0o600,1,len(old_bytes),1,1];after_row=[path,1,3,1000,1000,stat.S_IFREG|0o600,1,len(new_bytes),2,3]
 files=[{'path':path,'oldSHA256':digest(old_bytes),'newSHA256':digest(new_bytes),'bytes':len(new_bytes)}];entry={'path':path,'sha256':digest(new_bytes),'bytes':len(new_bytes)};manifest={'manifest':[entry]};current={'sha256':'changed-public-fingerprint','metadataSHA':digest(json.dumps([after_row],separators=(',',':')).encode())}
 p={'workspace':'candidate','source':'main','oldCandidate':'old','job':job,'deltaSHA256':delta,'files':files,'expectedBaselineFingerprint':'base','expectedBaselineMetadataSHA256':'old-metadata'}
 intent={'version':1,'job':job,'deltaSHA256':delta,'workspace':'candidate','files':files,'mainBefore':main,'oldCandidateBefore':old,'origin':origin,'candidateBefore':before,'manifestBefore':[{'path':path,'sha256':digest(old_bytes),'bytes':len(old_bytes)}],'metadataBefore':[before_row]};base='/var/lib/jarvis-development/101/repair-r27-preparation/source-delta-'+job;raw=encoded(intent)
 data={base+'/intent.json':raw,base+'/committing.json':encoded({'job':job,'intentSHA256':digest(raw)}),base+'/0.before':old_bytes,base+'/commit-0.json':encoded({'path':path,'sha256':digest(new_bytes),'bytes':len(new_bytes),'metadata':after_row})};good={'pid':9,'start':'10','boot':'boot','children':[],'counts':{'runs':0,'deliveries':0,'logs':0}}
 class OS:
  O_RDONLY=1;O_NOFOLLOW=2;O_NONBLOCK=4
  path=types.SimpleNamespace(lexists=lambda q:str(q) in data or str(q).endswith('/publish.lock') or str(q)==base)
  def open(self,*a):return 7
  def fstat(self,fd):return types.SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_nlink=1)
  def close(self,fd):pass
 class Locks:
  LOCK_SH=1;LOCK_NB=2
  active=False
  def flock(self,*a):
   if self.active:raise BlockingIOError()
 locks=Locks();ns={'Path':Path,'os':OS(),'stat':stat,'fcntl':locks,'need':need,'json':json,'hashlib':hashlib,'p':p,'trusted':lambda q:q,'private_read':lambda q,*a:data[str(q)],'source_state':lambda q:(main if q=='main' else old if q=='old' else current,None),'quiet':lambda:good,'origin_state':lambda _:origin}
 exec(compile(selected,'<actual-production-reconcile>','exec'),ns)
 def invoke():return ns['reconcile_publication'](main,old,current,manifest,origin,good)
 return ns,data,base,manifest,current,main,old,origin,good,locks,invoke
ns,data,base,manifest,current,main,old,origin,good,locks,invoke=setup();r=invoke();assert r['published'] and r['readOnly'] and r['reconciledReadOnly'] and r['oldBytesPreserved']
count=1
for kind in ['oldbytes','metadata','manifest','commit','rootresult','writeractive','node','source']:
 ns,data,base,manifest,current,main,old,origin,good,locks,invoke=setup()
 if kind=='oldbytes':data[base+'/0.before']=b'incorrect'
 if kind=='metadata':row=json.loads(data[base+'/commit-0.json']);row['metadata'][-1]=999;data[base+'/commit-0.json']=encoded(row)
 if kind=='manifest':manifest['manifest'].append({'path':'unapproved-extra','sha256':'x','bytes':1})
 if kind=='commit':data[base+'/committing.json']=encoded({'job':'a'*32,'intentSHA256':'wrong'})
 if kind=='rootresult':data[base+'/result.json']=encoded({'candidateAfter':{'sha256':'wrong'},'job':'a'*32,'deltaSHA256':'b'*64})
 if kind=='writeractive':locks.active=True
 if kind=='node':ns['quiet']=lambda:{**good,'pid':11}
 if kind=='source':ns['source_state']=lambda q:({'sha256':'modified'} if q=='main' else old if q=='old' else current,None)
 try:invoke();raise AssertionError('untrusted reconcile accepted '+kind)
 except RuntimeError as e:assert str(e).startswith('R27_SOURCE_')
 count+=1
print(json.dumps({'passed':count,'productionAST':True,'mutationsPerformed':False}))`;
 const r=spawnSync('python',['-c',script],{input:sourcePublicationHelpers,encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).passed,9);
});
