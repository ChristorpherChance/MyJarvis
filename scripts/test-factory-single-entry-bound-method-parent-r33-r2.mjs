/** New R2 boundary only. All OS, Root, journal and receipt mutations are controlled in memory. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {startSingleEntryMethodR33R2,singleEntryMethodR33R2HostProgram,
 singleEntryMethodR33R2Scope as S,singleEntryMethodR33R2Journal as JP} from './start-factory-single-entry-bound-method-r33-r2.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const owner=readFileSync(S.owner.path), self=readFileSync(S.starterPath), host=singleEntryMethodR33R2HostProgram(owner);
const python='C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe';
const controlledPython=body=>{
 const r=spawnSync(python,['-I','-c',body],{input:JSON.stringify({owner:owner.toString(),host}),encoding:'utf8',windowsHide:true});
 assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
};

test('new R2 source/namespace is pinned and default null refuses before IO',async()=>{
 let calls=0;const forbidden=()=>{calls++;throw Error('NO_IO')};
 const r=await startSingleEntryMethodR33R2({action:'start'},{readLocal:forbidden,readRoot:forbidden,lock:forbidden,writeWX:forbidden});
 assert.equal(r.ready,false);assert.equal(calls,0);
 assert.equal(hash(owner),S.owner.sha256);assert.equal(S.base,'/var/lib/jarvis-single-entry-bound-method-r33-r2');
 assert.match(JP,/bound-method-r2-once/);assert.equal(S.fixtureWorkSeconds,45);assert.equal(S.runtimeMaxSec+S.timeoutStopSec,90);
 assert.equal(S.rootCapabilityMask,226);assert.ok(S.workReports.includes('owner.stderr.raw'));
 const r2=controlledPython("import ast,json,sys;p=json.load(sys.stdin);ast.parse(p['owner']);ast.parse(p['host']);print(json.dumps({'parsed':True,'bodiesExecuted':False}))");
 assert.equal(r2.bodiesExecuted,false);
});

test('actual early owner pipeline preserves runtime/control/write first error and secondary close',()=>{
 const out=controlledPython(String.raw`import ast,json,sys,types,errno,stat,re,hashlib
p=json.load(sys.stdin);tree=ast.parse(p['owner']);names={'need','sha','key','early_phase','write_early_failure','runtime','context','closed_error','run_main','main'}
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
phases=next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name)and t.id=='EARLY_PHASES' for t in n.targets))
class FakeOS:
 def __init__(self):self.written=bytearray();self.closed=[];self.bad_sink=False;self.close_error=False
 def getresuid(self):return (0,0,0)
 def getresgid(self):return (0,0,0)
 def pidfd_open(self,*a):return 0
 def fstat(self,fd):return types.SimpleNamespace(st_mode=stat.S_IFREG|(0o400 if self.bad_sink else 0o600),st_uid=0,st_gid=0,st_nlink=1,st_dev=1,st_ino=2,st_size=0,st_mtime_ns=1,st_ctime_ns=1)
 def write(self,fd,data):assert fd==2;self.written.extend(data);return len(data)
 def fsync(self,fd):assert fd==2
 def close(self,fd):self.closed.append(fd);assert fd==0;raise OSError(errno.ENOENT,'secondary close') if self.close_error else Exception('unexpected successful path')
class FakePath:
 def __init__(self,v):self.v=str(v)
 def __truediv__(self,v):return FakePath(self.v+'/'+str(v))
 def read_text(self):return 'CapEff:\t'+caps+'\nCapPrm:\t'+caps+'\nCapInh:\t0\nCapAmb:\t0\nNoNewPrivs:\t1\n'
fake=FakeOS();caps='0';ss=types.SimpleNamespace(platform='linux',flags=types.SimpleNamespace(isolated=1),argv=['owner.py','--run','1'*32],exc_info=sys.exc_info)
g={'os':fake,'sys':ss,'stat':stat,'re':re,'json':json,'hashlib':hashlib,'Path':FakePath,'ROOT_CAPS':226,'BASE':'/fixed','CONTROLS':('owner.py','fixture.py','generated.py','activation.json','once.json'),'N':re.compile('[a-f0-9]{32}'+chr(92)+'Z'),'H':re.compile('[a-f0-9]{64}'+chr(92)+'Z'),'PROTOCOL':'r33-single-entry-owned-method-v2'}
fake.environ={};exec(compile(ast.Module(body=[phases]+nodes,type_ignores=[]),'actual-early-owner-helpers','exec'),g)
assert g['main']()==1;r=json.loads(fake.written);assert r['firstFailure']['phase']=='RUNTIME_PROFILE' and r['firstFailure']['errorCode']=='R33_METHOD_OWNER_PRIVILEGES_CHANGED' and r['runtimeObserved']['capabilities']['CapEff']=='0'
fake.written.clear();caps='e2'
def missing(control,name):raise OSError(errno.ENOENT,'private control detail')
g['read_control']=missing;assert g['main']()==1;r=json.loads(fake.written);assert r['firstFailure']['phase']=='CONTROL_READ' and r['control']=='owner.py' and r['firstFailure']['errno']==2
fake.written.clear();ss.argv=['owner.py','--stopped','1'*32];assert g['main']()==1;r=json.loads(fake.written);assert r['action']=='--stopped' and r['firstFailure']['phase']=='CONTROL_READ'
fake.written.clear();ss.argv=['owner.py','--run','1'*32]
def context(nonce,early):g['early_phase'](early,'CONTEXT_FIELDS');return FakePath('/fixed'),{}, {},'unit',{}
g['context']=context;g['process_identity']=lambda *a:{'pid':7};g['fixture_poll']=lambda fd:0;g['proc_identity_matches']=lambda i:True
def failwrite(*a):raise PermissionError(errno.EACCES,'primary owned write')
g['save_work']=failwrite;fake.close_error=True;assert g['main']()==1;r=json.loads(fake.written);assert r['firstFailure']['phase']=='OWNER_RECORD_SAVE' and r['firstFailure']['errno']==13 and r['secondaryCloseErrors'][0]['errno']==2 and fake.closed==[0]
fake.written.clear();fake.bad_sink=True;caps='0';g['context']=lambda nonce,early:(_ for _ in ()).throw(RuntimeError('R33_METHOD_OWNER_CONTEXT_CHANGED'))
try:g['main']()
except RuntimeError as e:assert str(e)=='R33_METHOD_OWNER_CONTEXT_CHANGED' and e.secondaryCloseErrors[0]['phase']=='EARLY_RECORD_SAVE'
else:raise AssertionError('writer failure became success')
print(json.dumps({'cases':5,'firstErrorPreserved':True,'fd0Closed':True,'sinkFailureStayedFailed':True,'realOSCalled':False}))`);
 assert.equal(out.cases,5);assert.equal(out.realOSCalled,false);
});

test('actual Root unit/sink parser binds private path and strips private exception/profile fields',()=>{
 const out=controlledPython(String.raw`import ast,json,sys,re,hashlib
p=json.load(sys.stdin);tree=ast.parse(p['host']);names={'need','sha','argv_of','verify_unit','project_early_stderr'};nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names]
g={'json':json,'re':re,'hashlib':hashlib,'p':{'nonce':'1'*32},'S':{'sourceProtocol':'r33-single-entry-owned-method-v2','controls':['owner.py']},'stderr_sink':'/fixed/work/owner.stderr.raw','cmd':['/usr/bin/python3','-I','owner.py','--run','1'*32],'stop':['/usr/bin/python3','-I','owner.py','--stopped','1'*32]}
exec(compile(ast.Module(body=nodes,type_ignores=[]),'actual-root-sink-helpers','exec'),g)
command=lambda argv:'{ path=/usr/bin/python3 ; argv[]='+ ' '.join(argv)+' ; ignore_errors=no ; }'
v={'User':'root','Group':'root','NoNewPrivileges':'yes','CapabilityBoundingSet':'cap_dac_override cap_kill cap_setgid cap_setuid','AmbientCapabilities':'','PrivateNetwork':'yes','ProtectControlGroups':'yes','RuntimeMaxUSec':'80s','TimeoutStopUSec':'10s','KillMode':'control-group','KillSignal':'SIGKILL','Restart':'no','ExecStart':command(g['cmd']),'ExecStopPost':command(g['stop']),'StandardOutput':'null','StandardError':'append','StandardErrorFile':str(g['stderr_sink'])}
assert g['verify_unit'](v)['standardErrorFile']==str(g['stderr_sink'])
for field,value in [('StandardError','null'),('StandardErrorFile','/wrong')]:
 bad=dict(v);bad[field]=value
 try:g['verify_unit'](bad)
 except RuntimeError:pass
 else:raise AssertionError('wrong private sink accepted')
row={'schemaVersion':1,'kind':'r33-single-entry-method-owner-early-failure-r2','nonce':'1'*32,'sourceProtocol':g['S']['sourceProtocol'],'action':'--run','control':'owner.py','firstFailure':{'phase':'CONTROL_READ','errorCode':'R33_METHOD_OWNER_INCOMPLETE','errno':2},'privateExceptionMessage':'private detail','runtimeObserved':{'capabilities':'private projection'}}
row.update({k:False for k in ['methodSubsetProducerPassed','actualMethodIndependentlyQualified','currentScopeCleanupIndependentlyVerified','fullProtectionQualified','productCodeExecuted','modelsInvoked']})
projected,parsed=g['project_early_stderr']((json.dumps(row)+'\n').encode());assert parsed and set(projected[0])=={'action','control','firstFailure'} and 'private detail'not in json.dumps(projected)
bad=dict(row);bad['sourceProtocol']='old-v1';assert g['project_early_stderr'](json.dumps(bad).encode())==([],False)
assert g['project_early_stderr'](b'Traceback: private bootstrap detail')==([],False)
# Actual top-level ordering and flags, parsed only: WX sink exists before systemd-run.
source=p['host'];assert source.index('stderr_identity=prepare_stderr_sink()')<source.index("r=subprocess.run(['/usr/bin/systemd-run'")
prepare=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='prepare_stderr_sink');part=ast.get_source_segment(source,prepare)
assert 'os.O_EXCL' in part and 'os.O_NOFOLLOW' in part and '0o600' in part and 'os.fsync' in part
print(json.dumps({'newSinkPositiveAnd2NegativeChecks':True,'privateProjectionSafe':True,'malformedPreservedAsUnclassified':True,'createBeforeDispatch':True,'rootBodyExecuted':False}))`);
 assert.equal(out.rootBodyExecuted,false);
});

test('R2 production caller uses own sources/review/journal and lost reply permits only same-nonce read',async()=>{
 const rp='artifacts/software-factory/goals-r29/r33-single-entry-bound-method-parent-independent-local-review-r2-1000000000000-00000000-0000-0000-0000-000000000000.json';
 const review=Buffer.from(JSON.stringify({kind:'r33-single-entry-bound-method-parent-independent-local-review-r2',ownerSHA256:S.owner.sha256,starterSHA256:hash(self),hostProgramSHA256:hash(host),fixtureSHA256:S.fixture.sha256,staticPreparationReady:true,remainingP0P1:0,remoteOperationsPerformed:false,actualMethodIndependentlyQualified:false}));
 const activation={kind:'r33-single-entry-method-reviewed-activation-r2',schemaVersion:1,nonce:'1'.repeat(32),phase:'native',starterSHA256:hash(self),review:{path:rp,sha256:hash(review)},remoteExecutionAuthorized:true};
 const memory=new Map([[rp,review],[S.starterPath,self]]);
 for(const p of [S.owner,S.fixture,S.generated,S.buildStatic,S.generator,S.pureModule,S.fixtureReview,S.generatorReview,S.transport])memory.set(p.path,readFileSync(p.path));
 let journal,calls=0;const order=[];
 const d={readLocal:async p=>{if(p===JP){if(!journal){const e=Error('absent');e.code='ENOENT';throw e}return journal}return memory.get(p)},writeWX:async(p,r)=>{assert.equal(p,JP);assert.equal(journal,undefined);order.push('wx');journal=Buffer.from(r)},save:async q=>{order.push('durable');journal=Buffer.from(JSON.stringify(q)+'\n')},lock:async()=>({}),unlock:async()=>{},receipt:async()=>({path:'memory-only',sha256:'a'.repeat(64)}),now:()=>1,
 readRoot:async p=>{calls++;if(p.action==='start'){assert.equal(order.at(-1),'durable');assert.equal(p.scope.sourceProtocol,'r33-single-entry-owned-method-v2');assert.equal(hash(Buffer.from(p.files['owner.py'].base64,'base64')),S.owner.sha256);throw Error('CONTROLLED_LOST_REPLY')}
  assert.deepEqual(p.files,{});return {schemaVersion:1,kind:'r33-single-entry-bound-method-parent-observation-r2',nonce:p.nonce,phase:'native',sourceProtocol:S.sourceProtocol,ownerSHA256:S.owner.sha256,fixtureSHA256:S.fixture.sha256,generatedSHA256:S.generated.sha256,buildStaticMappingSHA256:S.buildStatic.sha256,activationSHA256:p.activationSHA256,onceSHA256:p.onceSHA256,dispatchSubmitted:true,readOnly:true,controlsStable:true,unitConfigVerified:true,unitProofSHA256:'b'.repeat(64),unit:{Id:'jarvis-single-entry-method-r33-r2-'+p.nonce+'.service',ActiveState:'failed'},owner:null,ownerPublicMetadataIsProjection:true,ownerStderrSinkPresent:true,ownerStderrSHA256:'c'.repeat(64),ownerStderrBytes:1,ownerStderrStructured:false,ownerStderrClosedCode:'R33_METHOD_OWNER_STDERR_UNCLASSIFIED',earlyFailures:[],status:'failed',methodSubsetProducerPassed:false,actualMethodIndependentlyQualified:false,currentScopeCleanupIndependentlyVerified:false,fullProtectionQualified:false,productCodeExecuted:false,modelsInvoked:false,rawReports:{private:'original bytes'}};
 }};
 const prep=await startSingleEntryMethodR33R2({action:'inspect',activation},d);assert.equal(prep.ready,true);assert.equal(calls,0);assert.equal(journal,undefined);
 await assert.rejects(startSingleEntryMethodR33R2({action:'start',activation},d),/CONTROLLED_LOST_REPLY/);assert.equal(calls,1);
 await assert.rejects(startSingleEntryMethodR33R2({action:'start',activation},d),/PRIOR_INTENT_ONLY_CHECK/);assert.equal(calls,1);
 const result=await startSingleEntryMethodR33R2({action:'check',activation},d);assert.equal(calls,2);assert.equal(result.status,'failed');assert.equal(Object.hasOwn(result,'rawReports'),false);
 assert.equal(JSON.parse(journal).kind,'r33-single-entry-method-local-once-r2');
 const changed={...activation,kind:'r33-single-entry-method-reviewed-activation'};await assert.rejects(startSingleEntryMethodR33R2({action:'inspect',activation:changed},d),/ACTIVATION_CHANGED/);assert.equal(calls,2);
});
