/** R3 delta only; all syscall/Root/once effects are controlled in memory. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {startSingleEntryMethodR33R3,singleEntryMethodR33R3HostProgram,singleEntryMethodR33R3Scope as S,
 singleEntryMethodR33R3Journal as JP,assertSingleEntryMethodR33R3Profile} from './start-factory-single-entry-bound-method-r33-r3.mjs';
const H=b=>createHash('sha256').update(b).digest('hex'),owner=readFileSync(S.owner.path),self=readFileSync(S.starterPath),host=singleEntryMethodR33R3HostProgram(owner);
const py=body=>{const r=spawnSync('python',['-I','-c',body],{input:JSON.stringify({owner:owner.toString(),host}),encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)};

test('R3 null gate, exact 14 records, actual generated host parse and before-dispatch sink durability',async()=>{
 let n=0;const no=()=>{n++;throw Error('NO_IO')};const v=await startSingleEntryMethodR33R3({action:'start'},{readLocal:no,readRoot:no,lock:no,writeWX:no});assert.equal(n,0);assert.equal(v.ready,false);
 assert.equal(H(owner),S.owner.sha256);assert.equal(S.controls.length+S.workReports.length+2,14);assert.equal(S.stderrSinkProof,'stderr-sink-proof.json');assert.equal(S.startupAmbientCapabilityMask,128);assert.equal(S.finalAmbientCapabilityMask,0);
 const r=py(String.raw`import ast,json,sys;p=json.load(sys.stdin);a=ast.parse(p['owner']);b=ast.parse(p['host']);s=p['host'];assert s.index("store(root/'stderr-sink-proof.json',sink_proof_raw)")<s.index("r=subprocess.run(['/usr/bin/systemd-run'");assert 'StandardErrorFile'not in s;assert 'AmbientCapabilities=CAP_SETUID'in s;assert 'stderrSinkProofSHA256'in s;print(json.dumps({'parsed':True,'rootBodyExecuted':False}))`);assert.equal(r.rootBodyExecuted,false);
});

test('actual capget/capset ABI preserves E/P, clears only self I, reads Ambient independently and rejects incomplete transition',()=>{
 const r=py(String.raw`import ast,ctypes,errno,hashlib,json,re,sys,types
p=json.load(sys.stdin);tree=ast.parse(p['owner']);names={'need','early_phase','own_capability_call','own_capability_snapshot','self_capability_bridge'}
nodes=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in names|{'CapabilityHeader','CapabilityData'}];phases=next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='EARLY_PHASES'for t in n.targets))
state={'effective':226,'permitted':226,'inheritable':128,'ambient':128,'capsetCalls':0,'fail':False}
class Lib:
 def syscall(self,number,header,data):
  number=number.value;h=ctypes.cast(header,ctypes.POINTER(g['CapabilityHeader'])).contents;assert (h.version,h.pid)==(537396514,0)
  d=ctypes.cast(data,ctypes.POINTER(g['CapabilityData']));assert ctypes.sizeof(g['CapabilityHeader'])==8 and ctypes.sizeof(g['CapabilityData'])==12
  if number==125:
   for k in ('effective','permitted','inheritable'):setattr(d[0],k,state[k]);setattr(d[1],k,0)
  else:
   assert number==126;state['capsetCalls']+=1;assert (d[0].effective,d[0].permitted,d[0].inheritable)==(226,226,0) and (d[1].effective,d[1].permitted,d[1].inheritable)==(0,0,0)
   if state['fail']:ctypes.set_errno(errno.EPERM);return -1
   state['inheritable']=0;state['ambient']=0
  return 0
class Path:
 def __init__(self,p):assert p=='/proc/self/status'
 def read_text(self):return 'Uid:\t0 0 0 0\nGid:\t0 0 0 0\nNoNewPrivs:\t1\n'+''.join(k+':\t'+format(state[v],'016x')+'\n' for k,v in [('CapEff','effective'),('CapPrm','permitted'),('CapInh','inheritable'),('CapAmb','ambient')])
lib=Lib();invoke=lib.syscall;lib.syscall=lambda *a:invoke(*a);ct=types.SimpleNamespace(**{k:getattr(ctypes,k)for k in ['Structure','c_uint32','c_int32','c_long','sizeof','set_errno','get_errno','byref']});ct.CDLL=lambda *a,**kw:lib
g={'ctypes':ct,'os':types.SimpleNamespace(getresuid=lambda:(0,0,0),getresgid=lambda:(0,0,0)),'sys':types.SimpleNamespace(platform='linux',byteorder='little',flags=types.SimpleNamespace(isolated=1)),'platform':types.SimpleNamespace(machine=lambda:'x86_64'),'Path':Path,'re':re,'ROOT_CAPS':226,'CONTROLS':(),'N':None};exec(compile(ast.Module(body=[phases]+nodes,type_ignores=[]),'actual-r3-capability-functions','exec'),g)
e={};b=g['self_capability_bridge'](e);assert b['verified'] and b['capsetReturn']==b['capsetErrno']==0 and b['pre']['capget']['inheritable']==128 and b['post']['capget']['inheritable']==0 and int(b['post']['status']['CapAmb'],16)==0 and 'ambient'not in b['pre']['capget'] and state['capsetCalls']==1
state.update(effective=98,permitted=98,inheritable=128,ambient=128);e={}
try:g['self_capability_bridge'](e)
except RuntimeError as ex:assert str(ex)=='R33_METHOD_OWNER_STARTUP_CAPABILITIES_CHANGED' and e['phase']=='CAPABILITY_PRE' and state['capsetCalls']==1
else:raise AssertionError('old62 admitted')
state.update(effective=226,permitted=226,inheritable=128,ambient=128,fail=True);e={}
try:g['self_capability_bridge'](e)
except OSError as ex:assert ex.errno==errno.EPERM and e['capabilityBridge']['capsetReturn']==-1 and e['capabilityBridge']['capsetErrno']==errno.EPERM and not e['capabilityBridge']['verified'] and e['phase']=='CAPABILITY_REQUEST'
else:raise AssertionError('failedcapset admitted')
print(json.dumps({'actualASTCases':3,'ambientFromStatusOnly':True,'realSyscallExecuted':False}))`);assert.equal(r.actualASTCases,3);assert.equal(r.realSyscallExecuted,false);
});

test('actual FD2 source/object/append gate precedes every writer; unbound failure emits no traceback; first read survives close failure',()=>{
 const r=py(String.raw`import ast,errno,hashlib,json,os,re,stat,sys,types
p=json.load(sys.stdin);t=ast.parse(p['owner']);names={'need','sha','key','bind_stderr_sink','main','close_preserving'};nodes=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name in names]
nonce='1'*32;base='/fixed';control=base+'/'+nonce+'/control';path=base+'/'+nonce+'/work/owner.stderr.raw';initial=[1,2,0,0,stat.S_IFREG|0o600,1,0,1700000000000000001,1700000000000000002]
raws={'owner.py':b'owner','activation.json':b'activation','once.json':b'once'};sha=lambda b:hashlib.sha256(b).hexdigest();proof={'schemaVersion':1,'kind':'r33-single-entry-method-root-stderr-sink-proof-r3','sourceProtocol':'r33-single-entry-owned-method-v3','nonce':nonce,'phase':'native','unit':'jarvis-single-entry-method-r33-r3-'+nonce+'.service','ownerSHA256':sha(raws['owner.py']),'fixtureSHA256':'f'*64,'generatedSHA256':'e'*64,'activationSHA256':sha(raws['activation.json']),'onceSHA256':sha(raws['once.json']),'stderrPath':path,'submittedStandardError':'append:'+path,'initialIdentity':initial,'initialIdentitySHA256':sha(json.dumps(initial,separators=(',',':')).encode())}
state={'inode':2,'flags':1024|1,'writer':0};fake=types.SimpleNamespace(O_APPEND=1024,O_WRONLY=1,O_RDWR=2,O_ACCMODE=3,fstat=lambda fd:types.SimpleNamespace(**dict(zip(['st_dev','st_ino','st_uid','st_gid','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns'],[1,state['inode'],0,0,initial[4],1,11,3,4]))),close=lambda fd:(_ for _ in ()).throw(OSError(errno.EBADF,'secondary')))
from pathlib import PurePosixPath
g={'os':fake,'sys':sys,'Path':PurePosixPath,'stat':stat,'json':json,'hashlib':hashlib,'BASE':base,'__file__':control+'/owner.py','FIXTURE_SHA':'f'*64,'INPUT_SHA':'e'*64,'PROTOCOL':'r33-single-entry-owned-method-v3','fcntl':types.SimpleNamespace(F_GETFL=3,fcntl=lambda *a:state['flags'])};exec(compile(ast.Module(body=nodes,type_ignores=[]),'actual-r3-sink-functions','exec'),g)
g['read_control']=lambda parent,n:(raws[n],None);g['read_sink_proof']=lambda root:json.dumps(proof,separators=(',',':')).encode();e={};g['bind_stderr_sink'](nonce,e);assert e['stderrSinkBinding']['fd']==2 and e['stderrSinkBinding']['fdIdentityFirstSix']==initial[:6]
for change in ['inode','flags']:
 state[change]=9 if change=='inode' else 1
 try:g['bind_stderr_sink'](nonce,{})
 except RuntimeError:pass
 else:raise AssertionError('wrong sink admitted')
 state.update(inode=2,flags=1024|1)
g['run_main']=lambda e:(_ for _ in ()).throw(OSError(errno.EACCES,'primary unbound'));g['write_early_failure']=lambda *a:state.update(writer=state['writer']+1);assert g['main']()==1 and state['writer']==0
primary=OSError(errno.EACCES,'primary read');g['close_preserving'](0,'actual-new-root-helper',primary);assert primary.errno==13 and primary.secondaryCloseErrors[0]['errno']==9
print(json.dumps({'actualASTCases':5,'unboundWriterCalls':state['writer'],'realFDChanged':False}))`);assert.equal(r.actualASTCases,5);assert.equal(r.unboundWriterCalls,0);
});

test('R3 production once freezes exact sources and startup contract; lost start reply only permits same-nonce check',async()=>{
 const rp='artifacts/software-factory/goals-r29/r33-single-entry-bound-method-parent-independent-local-review-r3-1000000000000-00000000-0000-0000-0000-000000000000.json';
 const review=Buffer.from(JSON.stringify({kind:'r33-single-entry-bound-method-parent-independent-local-review-r3',ownerSHA256:S.owner.sha256,starterSHA256:H(self),hostProgramSHA256:H(host),fixtureSHA256:S.fixture.sha256,staticPreparationReady:true,remainingP0P1:0,remoteOperationsPerformed:false,actualMethodIndependentlyQualified:false}));
 const activation={schemaVersion:1,kind:'r33-single-entry-method-reviewed-activation-r3',nonce:'1'.repeat(32),phase:'native',starterSHA256:H(self),remoteExecutionAuthorized:true,review:{path:rp,sha256:H(review)}};
 const mem=new Map([[rp,review],[S.starterPath,self]]);for(const v of [S.owner,S.fixture,S.generated,S.buildStatic,S.generator,S.pureModule,S.fixtureReview,S.generatorReview,S.transport])mem.set(v.path,readFileSync(v.path));
 let journal,rootCalls=0;const order=[];const d={readLocal:async p=>{if(p===JP){if(!journal){let e=Error('absent');e.code='ENOENT';throw e}return journal}return mem.get(p)},writeWX:async(p,r)=>{assert.equal(p,JP);assert.equal(journal,undefined);journal=Buffer.from(r);order.push('wx')},save:async q=>{journal=Buffer.from(JSON.stringify(q)+'\n');order.push('durable')},lock:async()=>({}),unlock:async()=>{},receipt:async()=>({path:'controlled',sha256:'a'.repeat(64)}),now:()=>1,
 readRoot:async p=>{rootCalls++;if(p.action==='start'){assert.equal(order.at(-1),'durable');assert.equal(p.scope.base,S.base);const av=JSON.parse(Buffer.from(p.files['activation.json'].base64,'base64'));assert.equal(av.startupAmbientCapabilityMask,128);assert.equal(av.finalAmbientCapabilityMask,0);assert.equal(H(Buffer.from(p.files['owner.py'].base64,'base64')),S.owner.sha256);throw Error('CONTROLLED_LOST_REPLY')}
 return{schemaVersion:1,kind:'r33-single-entry-bound-method-parent-observation-r3',nonce:p.nonce,phase:'native',sourceProtocol:S.sourceProtocol,ownerSHA256:S.owner.sha256,fixtureSHA256:S.fixture.sha256,generatedSHA256:S.generated.sha256,buildStaticMappingSHA256:S.buildStatic.sha256,activationSHA256:p.activationSHA256,onceSHA256:p.onceSHA256,dispatchSubmitted:true,readOnly:true,controlsStable:true,unitConfigVerified:true,unitProofSHA256:'b'.repeat(64),stderrSinkProofSHA256:'d'.repeat(64),ownerStderrInitialIdentitySHA256:'e'.repeat(64),ownerPublicMetadataIsProjection:true,profileMetadataIsProjection:true,ownerStderrSinkPresent:true,ownerStderrSHA256:'c'.repeat(64),ownerStderrBytes:1,ownerStderrStructured:false,ownerStderrClosedCode:'R33_METHOD_OWNER_STDERR_UNCLASSIFIED',earlyFailures:[],unit:{Id:'jarvis-single-entry-method-r33-r3-'+p.nonce+'.service',ActiveState:'failed'},owner:null,status:'failed',methodSubsetProducerPassed:false,actualMethodIndependentlyQualified:false,currentScopeCleanupIndependentlyVerified:false,fullProtectionQualified:false,productCodeExecuted:false,modelsInvoked:false,rawReports:{private:'original'}}}};
 assert.equal((await startSingleEntryMethodR33R3({action:'inspect',activation},d)).ready,true);assert.equal(rootCalls,0);assert.equal(journal,undefined);
 await assert.rejects(startSingleEntryMethodR33R3({action:'start',activation},d),/CONTROLLED_LOST_REPLY/);await assert.rejects(startSingleEntryMethodR33R3({action:'start',activation},d),/PRIOR_INTENT_ONLY_CHECK/);assert.equal(rootCalls,1);
 const v=await startSingleEntryMethodR33R3({action:'check',activation},d);assert.equal(v.status,'failed');assert.equal(rootCalls,2);assert.equal(v.rawReports,undefined);assert.equal(JSON.parse(journal).kind,'r33-single-entry-method-local-once-r3');
});
