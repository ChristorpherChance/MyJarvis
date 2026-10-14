import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {sha,repairScope as S} from './run-factory-main-repair-r26.mjs';
import {fixedToolSHA} from './prepare-factory-repair-verifier-r26.mjs';
import {r28VerifierScope as V,r28AuthenticationPolicy,r28SandboxImageContract,assertR28Observation,renderR28Wrapper,r28VerifierToolSHA} from './prepare-factory-verifier-r28.mjs';
import {r28HostConstants as C,r28ProtectedInstalledSHA,assertR28Preparation,hostReadParams,r28HostReadProgram,r28InstallProgram,r28CleanupReadProgram,expectedR28Installed,assertHostObservation,buildR28InstallPayload} from './factory-verifier-host-r28.mjs';
const H='a'.repeat(64),T='b'.repeat(64),original=await readFile(new URL('./factory-main-acceptance-wrapper-r26-4.py',import.meta.url)),collector=await readFile(new URL('./project-autonomy-fa01-collector-r28.mjs',import.meta.url)),broker=await readFile(new URL('./factory-sandbox-broker-r28.py',import.meta.url)),brokerControl=await readFile(new URL('./factory-sandbox-broker-control-r28.py',import.meta.url));
function fixture(){
 const sourceObservation={schemaVersion:1,kind:'software-factory-r28-source-observation',workspace:V.workspace,parent:V.parent,candidateFingerprint:'9b07a5115c22d14f82e04ba45b66efbc5ac04f7faa696ab84d81e33696ec7b76',candidateMetadataSHA256:'c62497e11de2bb1eeb4873b7d4d70cd8cc05974cafe4c5408d5bfbd041de43ac',originSHA256:C.originSHA256,files:608,mainFingerprint:S.baselineSHA,mainFiles:593,helperSHA256:fixedToolSHA['project-autonomy-evidence.py'],helperVerified:true,originBound:true,originalMainUnchanged:true,publicFilesOnly:true,privateEnvironmentCopied:false,gitHistoryCopied:false};
 const baseline=JSON.stringify({workspace:V.workspace,sourceFingerprintObserved:sourceObservation.candidateFingerprint,requiredTestFiles:Array.from({length:45},(_,i)=>'fixture-'+i),requiredPrototypeSuites:Array.from({length:30},(_,i)=>'suite-'+i),minimumCoverage:{lines:90,branches:80}})+'\n';
 const policy=JSON.stringify({workspace:V.workspace,sourceFingerprint:sourceObservation.candidateFingerprint,evidenceRoot:V.evidenceRoot,authenticationPolicy:r28AuthenticationPolicy,sandboxImageContract:r28SandboxImageContract})+'\n';
 const wrapper=renderR28Wrapper(original,{candidateFingerprint:sourceObservation.candidateFingerprint,collectorSHA256:sha(collector),brokerSHA256:sha(broker),brokerControlSHA256:sha(brokerControl)}),preparation={schemaVersion:1,kind:'software-factory-r28-independent-verifier-preparation',scope:V,sourceObservation,sourceObservationSHA256:sha(assertR28Observation(sourceObservation)),authenticationPolicy:r28AuthenticationPolicy,sandboxImageContract:r28SandboxImageContract,oldFixedTools:fixedToolSHA,newCollectorSHA256:sha(collector),newBrokerSHA256:sha(broker),newBrokerControlSHA256:sha(brokerControl),wrapperSHA256:sha(wrapper),baselineSHA256:sha(baseline),policySHA256:sha(policy),requiredTestFiles:45,requiredPrototypeSuites:30,minimumCoverage:{lines:90,branches:80},preparedOffline:true,installed:false,verificationDispatched:false,productAccepted:false,modelsInvoked:false};
 const state=(fp,files,meta,identity,bytes)=>({sha256:fp,files,metadataSHA:meta,identity,bytes,stable:true});
 const host={schemaVersion:1,kind:'software-factory-r28-host-observation',helperVerified:true,source:state(S.baselineSHA,593,C.mainMetadataSHA256,C.mainIdentity,17914164),oldCandidate:state(C.oldCandidateFingerprint,605,C.oldCandidateMetadataSHA256,C.oldCandidateIdentity,18078081),candidate:state(sourceObservation.candidateFingerprint,608,sourceObservation.candidateMetadataSHA256,{device:66306,inode:6713710},18080000),originSHA256:C.originSHA256,originBound:true,originIdentity:{device:66306,inode:6713710},originParentIdentity:{device:66306,inode:6713709},quiet:{active:true,pid:123,start:'42',boot:'328726a0-5495-4892-b0a6-2fa9de26242e',children:[],counts:{runs:0,deliveries:0,logs:0}},nodeTemplates:{targetSHA256:T,otherTemplatesSHA256:H,configSHA256:H},fixedTools:structuredClone(fixedToolSHA),oldImmutable:{old:H,...r28ProtectedInstalledSHA},installed:null,visudoVerified:false,sandboxImage:{imageId:r28SandboxImageContract.imageId,architecture:'amd64',os:'linux',reference:r28SandboxImageContract.reference,observed:true},sourceVerificationScope:'public-manifest-and-metadata',mutationsPerformed:false,modelsInvoked:false,rawLogsExported:false,privateEnvironmentExported:false,productCodeExecuted:false};
 return {preparation,host,wrapper,collector,baseline,policy,broker,brokerControl};
}
test('parameter builder pins exact namespace, original metadata, source observation, node and old tools',()=>{
 const f=fixture(),p=hostReadParams(f.preparation,{expectedTargetTemplateSHA256:T,idle:true,requireInstalled:true});assert.equal(p.workspace,V.workspace);assert.equal(p.source,S.source);assert.equal(p.oldCandidate,C.oldCandidate);assert.equal(p.agentId,C.agentId);assert.equal(p.candidateFiles,608);assert.equal(p.mainMetadataSHA256,C.mainMetadataSHA256);assert.deepEqual(p.fixedTools,fixedToolSHA);assert.deepEqual(p.expectedInstalled,expectedR28Installed(f.preparation));
 assert.throws(()=>hostReadParams(f.preparation,{}),/TEMPLATE_HASH_REQUIRED/);assert.throws(()=>hostReadParams(f.preparation,{expectedTargetTemplateSHA256:T,runId:'../x'}),/RUN_SCOPE_INVALID/);
 assert.throws(()=>hostReadParams(f.preparation,{expectedTargetTemplateSHA256:T,verifySudo:true}),/SUDO_READBACK_REQUIRES_INSTALLED/);
 const wrong=structuredClone(f.preparation);wrong.scope.entry='/arbitrary-root';assert.throws(()=>assertR28Preparation(wrong),/PREPARATION_INVALID/);
 assert.throws(()=>{p.mainIdentity.inode++;},TypeError);assert.throws(()=>{r28AuthenticationPolicy.exceptions.push({id:'unapproved'});},TypeError);
});
test('source/main/old candidate/origin/node/architecture mismatches fail; active scope differs from idle',()=>{
 const f=fixture(),opts={expectedTargetTemplateSHA256:T,idle:true};assert.equal(assertHostObservation(f.host,f.preparation,opts),f.host);
 for(const mutate of [h=>{h.source.metadataSHA=H;},h=>{h.source.identity.inode++;},h=>{h.oldCandidate.metadataSHA=H;},h=>{h.candidate.sha256=H;},h=>{h.originSHA256=H;},h=>{h.nodeTemplates.targetSHA256=H;},h=>{h.sandboxImage.architecture='arm64';},h=>{h.fixedTools['project-autonomy-evidence.py']=H;}]){const h=structuredClone(f.host);mutate(h);assert.throws(()=>assertHostObservation(h,f.preparation,opts),/R28_HOST_/);}
 const busy=structuredClone(f.host);busy.quiet.counts.runs=1;assertHostObservation(busy,f.preparation,{expectedTargetTemplateSHA256:T});assert.throws(()=>assertHostObservation(busy,f.preparation,opts),/NODE_NOT_ACK_IDLE/);
});
test('installed hashes are absent until actual readback and seven exact paths require exact bytes',()=>{
 const f=fixture();assert.throws(()=>assertHostObservation(f.host,f.preparation,{expectedTargetTemplateSHA256:T,requireInstalled:true}),/NEW_INSTALLATION_CHANGED/);
 const payload=buildR28InstallPayload({...f,installJob:'e'.repeat(32)});assert.equal(payload.files.length,7);assert.deepEqual(payload.files.map(x=>x.path),[V.entry,V.collectorPath,V.configRoot+'/baseline.json',V.configRoot+'/policy.json',C.sudoRule,V.brokerPath,V.brokerControlPath]);assert.deepEqual(payload.files.map(x=>x.mode),[0o755,0o644,0o600,0o600,0o440,0o644,0o644]);assert.ok(payload.files.every(x=>sha(Buffer.from(x.body,'base64'))===x.sha256));
 assert.throws(()=>buildR28InstallPayload({...f,collector:Buffer.from('changed'),installJob:'e'.repeat(32)}),/BODY_HASH_CHANGED/);assert.throws(()=>buildR28InstallPayload({...f,installJob:'../x'}),/JOB_REQUIRED/);
 const done=structuredClone(f.host);done.installed=expectedR28Installed(f.preparation);assert.throws(()=>assertHostObservation(done,f.preparation,{expectedTargetTemplateSHA256:T,requireInstalled:true,verifySudo:true}),/SUDO_READBACK_INVALID/);done.visudoVerified=true;assertHostObservation(done,f.preparation,{expectedTargetTemplateSHA256:T,requireInstalled:true,verifySudo:true});
});
test('all actual generated Python programs parse; observation/cleanup have no mutations and trusted pinned helper precedes compilation',()=>{
 const code=String.raw`import ast,json,sys
sys.stdin.reconfigure(encoding='utf-8');values=json.load(sys.stdin);out=[]
for kind,source in values.items():
 tree=ast.parse(source);calls=[ast.unparse(n.func) for n in ast.walk(tree) if isinstance(n,ast.Call)]
 if kind!='install':assert not any(x in calls for x in ['os.mkdir','os.link','os.unlink','os.write','os.fchmod','os.kill','os.killpg','subprocess.Popen'])
 assert source.index("R28_HOST_FIXED_PINS_CHANGED")<source.index("exec(compile(helper_body")
 assert "json.loads" in source and "mode=ro" in source and "sourceVerificationScope" in source if kind!='install' else True
 assert "p['mainMetadataSHA256']" in source and "p['oldCandidateMetadataSHA256']" in source and "p['candidateMetadataSHA256']" in source
 if kind=='cleanup':assert "v.get('files')==p['candidateFiles']" in source and 'exactNamedResourceCount' in source and "p['entry']" in source
 if kind=='install':
  assert 'os.link(temporary, q, follow_symlinks=False)' in [ast.unparse(n) for n in ast.walk(tree) if isinstance(n,ast.Call)]
  assert 'os.replace' not in calls and 'os.rename' not in calls and 'os.kill' not in calls
 out.append(kind)
print(json.dumps({'parsed':out,'rootProgramsExecuted':False}))`;
 const r=spawnSync('python',['-I','-c',code],{input:JSON.stringify({read:r28HostReadProgram(),install:r28InstallProgram(),cleanup:r28CleanupReadProgram()}),encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout).parsed,['read','install','cleanup']);
});
test('actual generated atomic put publishes complete bytes without replacing old files; conflict/race/zero-write preserve outcomes',()=>{
 const code=String.raw`import ast,json,sys,stat
from types import SimpleNamespace
sys.stdin.reconfigure(encoding='utf-8');tree=ast.parse(sys.stdin.read());definition=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='put_atomic')
files={};fds={};events=[];nextfd=1;race=False;zero=False
class Q:
 def __init__(self,path):self.path=path
 @property
 def parent(self):return Q(self.path.rsplit('/',1)[0])
 @property
 def name(self):return self.path.rsplit('/',1)[1]
 def __truediv__(self,name):return Q(self.path+'/'+name)
 def lstat(self):
  v=files[self.path];return SimpleNamespace(st_mode=stat.S_IFREG|v['mode'],st_nlink=v['nlink'])
def need(v,c):
 if not v:raise RuntimeError(c)
def trusted(q):need(q.path.startswith('/fixed'),'TEST_UNTRUSTED_PARENT');return q
def private_read(q):return bytes(files[q.path]['body'])
def openfd(q,flags,mode=None):
 global nextfd
 if flags&os.O_DIRECTORY:fd=nextfd;nextfd+=1;fds[fd]=q.path;return fd
 if flags&os.O_EXCL:
  if q.path in files:raise FileExistsError('FIXTURE_EXISTS')
  files[q.path]={'body':bytearray(),'mode':mode,'nlink':1}
 fd=nextfd;nextfd+=1;fds[fd]=q.path;return fd
def write(fd,data):
 if zero:return 0
 n=min(2,len(data));files[fds[fd]]['body'].extend(data[:n]);return n
def link(a,b,follow_symlinks=False):
 if race:files[b.path]={'body':bytearray(b'racing-owner'),'mode':0o600,'nlink':1}
 if b.path in files:raise FileExistsError('FIXTURE_NO_REPLACE')
 files[b.path]=files[a.path];files[b.path]['nlink']=2;events.append(('publish',b.path,bytes(files[b.path]['body'])))
def unlink(q):
 assert '.r28-' in q.name and q.name.endswith('.tmp');files[q.path]['nlink']-=1;files.pop(q.path);events.append(('unlink-temp',q.path))
os=SimpleNamespace(O_WRONLY=1,O_CREAT=2,O_EXCL=4,O_NOFOLLOW=8,O_RDONLY=16,O_DIRECTORY=32,path=SimpleNamespace(lexists=lambda q:q.path in files),open=openfd,write=write,fchmod=lambda fd,mode:files[fds[fd]].update(mode=mode),fsync=lambda fd:events.append(('fsync',fds[fd])),close=lambda fd:fds.pop(fd,None),link=link,unlink=unlink)
scope={'os':os,'stat':stat,'trusted':trusted,'private_read':private_read,'need':need,'p':{'installJob':'a'*32}};exec(compile(ast.Module(body=[definition],type_ignores=[]),'controlled-atomic-put','exec'),scope);put=scope['put_atomic']
target=Q('/fixed/config/policy.json');put(target,b'complete-body',0o600);assert bytes(files[target.path]['body'])==b'complete-body' and files[target.path]['nlink']==1
count=len(events);put(target,b'complete-body',0o600);assert len(events)==count
try:put(target,b'changed',0o600);raise AssertionError('conflict overwritten')
except RuntimeError as e:assert str(e)=='R28_INSTALL_EXISTING_FILE_CONFLICT'
race=True
try:put(Q('/fixed/config/race'),b'new',0o600);raise AssertionError('race overwritten')
except FileExistsError:assert bytes(files['/fixed/config/race']['body'])==b'racing-owner'
race=False;zero=True
try:put(Q('/fixed/config/zero'),b'new',0o600);raise AssertionError('zero-write published')
except RuntimeError as e:assert str(e)=='R28_INSTALL_SHORT_WRITE'
assert '/fixed/config/zero' not in files;assert any('/zero.r28-' in x for x in files)
assert all(kind!='remove-target' for kind,*rest in events)
print(json.dumps({'actualGeneratedAtomicPutExecuted':True,'rootFilesTouched':False,'conflictsPreserved':True,'shortWritePreserved':True}))`;
 const r=spawnSync('python',['-I','-c',code],{input:r28InstallProgram(),encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).actualGeneratedAtomicPutExecuted,true);
});
