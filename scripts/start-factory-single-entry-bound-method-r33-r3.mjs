/** Local preparation. A separately reviewed external packet is required before any IO. */
import {createHash,randomUUID} from 'node:crypto';
import {open,lstat,rename,unlink,constants} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const sha=v=>createHash('sha256').update(v).digest('hex'),need=(v,c)=>{if(!v)throw Error(c)};
const H=/^[a-f0-9]{64}$/,N=/^[a-f0-9]{32}$/;
const earlyPhases=['ARGUMENTS','STDERR_BIND','CAPABILITY_PRE','CAPABILITY_REQUEST','CAPABILITY_POST','RUNTIME_PROFILE','CONTROL_READ','CONTEXT_FIELDS','INVOCATION','CGROUP','OWNER_IDENTITY','OWNER_PIDFD_OPEN','OWNER_PIDFD_VERIFY','OWNER_RECORD_SAVE','STOP_STATUS','STOP_RECORD_SAVE','FIXTURE_LIFECYCLE','OWNER_PIDFD_CLOSE','EARLY_RECORD_SAVE'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const frozen=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))frozen(child);Object.freeze(v)}return v};
const ref=v=>v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),['path','sha256'])&&typeof v.path==='string'&&H.test(v.sha256??'');
export const singleEntryMethodR33R3Activation=null;
export const singleEntryMethodR33R3Journal='.jarvis-dev/maintenance/factory-r33-single-entry-bound-method-r3-once.json';
export const singleEntryMethodR33R3Scope=frozen({schemaVersion:1,kind:'r33-single-entry-bound-method-fixed-scope-r3',machineId:'101',
 sourceProtocol:'r33-single-entry-owned-method-v3',base:'/var/lib/jarvis-single-entry-bound-method-r33-r3',
 starterPath:'scripts/start-factory-single-entry-bound-method-r33-r3.mjs',phase:'native',
 owner:{path:'scripts/factory-single-entry-bound-method-owner-r33-r3.py',sha256:'bc0909e65f09236cc7622c6bcfd593aae04ebd74ff139c6a751550b592d870a8'},
 fixture:{path:'scripts/factory-single-entry-bound-method-fixture-r33.py',sha256:'3c97393af43ce6290baa5ca9e1253fcad16c6a62bb2677a9566c534ef4bd0fb8'},
 generated:{path:'artifacts/software-factory/goals-r29/r33-single-entry-bound-census-native-source-2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73.py',sha256:'2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73'},
 buildStatic:{path:'artifacts/software-factory/goals-r29/r33-single-entry-bound-census-build-source-909f014941f1adbe3adf62a1dcd8d783c48f292c41f936c339cb293a2d0f7188.py',sha256:'909f014941f1adbe3adf62a1dcd8d783c48f292c41f936c339cb293a2d0f7188'},
 generator:{path:'scripts/factory-single-entry-bound-census-r33.mjs',sha256:'7f10715ae744a24117edc34a5d44d2478400a878b77044be289aa616f406ead5'},
 pureModule:{path:'scripts/factory-single-dirent-r33.py',sha256:'ab981cf22e75c75946a85150bffbd051ece574143446fd6b22f6a383bc44c6d8'},
 fixtureReview:{path:'artifacts/software-factory/goals-r29/r33-single-entry-bound-method-fixture-independent-local-review-1791878146924-926cb873-d7ff-4e4e-8019-811297eff6fa.json',sha256:'20952eb9b7b931eb021162c4fdb35d5dd0d2df42e9f7c9cd82727581c88cd9ca'},
 generatorReview:{path:'artifacts/software-factory/goals-r29/r33-single-entry-bound-census-independent-local-review-1791875012089-9af73851-9dd6-4a23-9a94-aef072eb38bc.json',sha256:'93664b82f1446328d033fb5b7ff70855c0fafe6e74ecaae4f32f5ef3797f0e1d'},
 transport:{path:'scripts/managed-server-client.mjs',sha256:'e287938e2d79b0335523d3d198bd93b588541866cebc2c21d997ae6fce5e4a9f'},
 runtimeMaxSec:80,timeoutStopSec:10,totalParentSeconds:90,fixtureWorkSeconds:45,
 rootUID:0,rootGID:0,fixtureUID:1000,fixtureGID:1000,rootCapabilityMask:226,startupAmbientCapabilityMask:128,finalAmbientCapabilityMask:0,finalInheritableCapabilityMask:0,
 rootCapabilities:['CAP_DAC_OVERRIDE','CAP_KILL','CAP_SETGID','CAP_SETUID'],
 killMode:'control-group',killSignal:'SIGKILL',restart:'no',privateNetwork:true,noNewPrivileges:true,
 controls:['owner.py','fixture.py','generated.py','activation.json','once.json'],
 workReports:['owner.json','fixture-process.json','fixture.stdout.json','fixture.stderr.raw','result.json','stopped.json','owner.stderr.raw'],
 rootReport:'unit-proof.json',stderrSinkProof:'stderr-sink-proof.json',buildWholeProgramExecutionQualified:false,fullProtectionQualified:false,productCodeExecuted:false});
const S=singleEntryMethodR33R3Scope,JP=singleEntryMethodR33R3Journal;
export async function singleEntryMethodR33R3ReadLocal(path){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size<=2*1024**2,'R33_METHOD_LOCAL_FILE_UNTRUSTED');const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));try{const a=await f.stat();need(['dev','ino','size','mtimeMs','ctimeMs'].every(k=>a[k]===s[k]),'R33_METHOD_LOCAL_FILE_CHANGED');const raw=await f.readFile(),z=await f.stat(),named=await lstat(path);need(raw.length===a.size&&['dev','ino','size','mtimeMs','ctimeMs'].every(k=>a[k]===z[k]&&a[k]===named[k]),'R33_METHOD_LOCAL_FILE_CHANGED');return raw}finally{await f.close()}}
async function wx(path,raw){const f=await open(path,'wx',0o600);try{await f.writeFile(raw);await f.sync()}finally{await f.close()}}
async function save(q){const temp=JP+'.'+randomUUID()+'.tmp';await wx(temp,JSON.stringify(q)+'\n');if(process.platform==='win32'){const r=spawnSync('python',['-I','-c',"import ctypes,sys;f=ctypes.WinDLL('kernel32',use_last_error=True).MoveFileExW;f.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p,ctypes.c_ulong];f.restype=ctypes.c_int;sys.exit(0 if f(sys.argv[1],sys.argv[2],9) else 1)",resolve(temp),resolve(JP)],{windowsHide:true,timeout:10000});need(r.status===0,'R33_METHOD_DURABLE_SAVE_FAILED')}else{await rename(temp,JP);const d=await open('.jarvis-dev/maintenance','r');try{await d.sync()}finally{await d.close()}}}
async function lock(){const path=JP+'.lock',f=await open(path,'wx',0o600);await f.sync();return{path,f}}
async function unlock(v){const a=await v.f.stat(),b=await lstat(v.path);need(a.dev===b.dev&&a.ino===b.ino,'R33_METHOD_LOCK_CHANGED');await v.f.close();await unlink(v.path)}
async function receipt(value,action){const path='artifacts/software-factory/goals-r29/r33-single-entry-method-r3-'+action+'-'+Date.now()+'-'+randomUUID()+'.json',raw=Buffer.from(JSON.stringify(value,null,2)+'\n');await wx(path,raw);return{path,sha256:sha(raw),bytes:raw.length}}

export function assertSingleEntryMethodR33R3Profile(profile,sinkProofSHA,initialIdentitySHA){
 const b=profile?.capabilityBridge;
 need(b?.kind==='r33-owner-self-capability-bridge-v3'&&same(b.abi,{architecture:'x86_64',byteOrder:'little',version:537396514,headerBytes:8,dataBytes:24,capgetSyscall:125,capsetSyscall:126,pid:0})
  &&b.verified===true&&b.capsetReturn===0&&b.capsetErrno===0&&same(b.request,{effective:226,permitted:226,inheritable:0,highWords:[0,0,0],pid:0}),'R33_METHOD_CAPABILITY_BRIDGE_CHANGED');
 for(const [x,inh,amb]of [[b.pre,128,128],[b.post,0,0]])need(x&&x.capgetReturn===0&&x.capgetErrno===0&&same(x.capget,{effective:226,permitted:226,inheritable:inh,highWords:[0,0,0]})
  &&same(Object.keys(x.status??{}).sort(),['CapAmb','CapEff','CapInh','CapPrm'])&&Object.values(x.status).every(v=>typeof v==='string'&&/^[0-9a-fA-F]{16}$/.test(v))
  &&Number.parseInt(x.status.CapEff,16)===226&&Number.parseInt(x.status.CapPrm,16)===226&&Number.parseInt(x.status.CapInh,16)===inh&&Number.parseInt(x.status.CapAmb,16)===amb
  &&same(x.realEffectiveSavedUID,[0,0,0])&&same(x.realEffectiveSavedGID,[0,0,0])&&x.noNewPrivileges===1,'R33_METHOD_CAPABILITY_SNAPSHOT_CHANGED');
 const t=profile?.stderrSinkBinding;
 need(t&&t.fd===2&&t.proofSHA256===sinkProofSHA&&t.initialIdentitySHA256===initialIdentitySHA&&H.test(t.fdIdentityFirstSixSHA256??'')
  &&!Object.hasOwn(t,'fdIdentityFirstSix')&&t.appendMode===true&&['write-only','read-write'].includes(t.accessMode)&&H.test(t.stderrPathSHA256??''),'R33_METHOD_STDERR_BINDING_CHANGED');
 need(same(profile.capabilities,b.post.status),'R33_METHOD_FINAL_PROFILE_CHANGED');return profile;
}

export function assertSingleEntryMethodR33R3Frame(v,q,readOnly){
 const unit='jarvis-single-entry-method-r33-r3-'+q.nonce+'.service';
 need(v?.schemaVersion===1&&v.kind==='r33-single-entry-bound-method-parent-observation-r3'&&v.nonce===q.nonce&&v.phase==='native'
  &&v.sourceProtocol===S.sourceProtocol&&v.ownerSHA256===S.owner.sha256&&v.fixtureSHA256===S.fixture.sha256
  &&v.generatedSHA256===S.generated.sha256&&v.buildStaticMappingSHA256===S.buildStatic.sha256
  &&v.activationSHA256===q.activationSHA256&&v.onceSHA256===q.onceSHA256&&v.dispatchSubmitted===true&&v.readOnly===readOnly
  &&v.controlsStable===true&&v.unitConfigVerified===true&&H.test(v.unitProofSHA256??'')
  &&v.ownerPublicMetadataIsProjection===true&&v.profileMetadataIsProjection===true
  &&H.test(v.stderrSinkProofSHA256??'')&&H.test(v.ownerStderrInitialIdentitySHA256??'')
  &&v.ownerStderrSinkPresent===true&&H.test(v.ownerStderrSHA256??'')
  &&Number.isSafeInteger(v.ownerStderrBytes)&&v.ownerStderrBytes>=0&&v.ownerStderrBytes<=1048576
  &&typeof v.ownerStderrStructured==='boolean'&&Array.isArray(v.earlyFailures)&&v.earlyFailures.length<=2
  &&[null,'R33_METHOD_OWNER_STDERR_UNCLASSIFIED'].includes(v.ownerStderrClosedCode)
  &&v.unit?.Id===unit&&['active','activating','deactivating','inactive','failed'].includes(v.unit.ActiveState)
  &&v.actualMethodIndependentlyQualified===false&&v.currentScopeCleanupIndependentlyVerified===false
  &&v.fullProtectionQualified===false&&v.productCodeExecuted===false&&v.modelsInvoked===false,'R33_METHOD_FRAME_CHANGED');
 need(v.ownerStderrClosedCode===(v.ownerStderrStructured?null:'R33_METHOD_OWNER_STDERR_UNCLASSIFIED')
  &&(v.ownerStderrBytes!==0||(v.ownerStderrStructured&&v.earlyFailures.length===0)),'R33_METHOD_STDERR_PROJECTION_CHANGED');
 for(const row of v.earlyFailures)need(row&&same(Object.keys(row).sort(),['action','control','firstFailure'])&&['--run','--stopped'].includes(row.action)
  &&(row.control===null||S.controls.includes(row.control))&&row.firstFailure&&earlyPhases.includes(row.firstFailure.phase)
  &&same(Object.keys(row.firstFailure).sort(),['errno','errorCode','phase'])
  &&/^R33_METHOD_OWNER_[A-Z0-9_]{1,100}$/.test(row.firstFailure.errorCode??'')
  &&(row.firstFailure.errno===null||Number.isSafeInteger(row.firstFailure.errno)),'R33_METHOD_EARLY_FAILURE_CHANGED');
 if(v.owner){const o=v.owner;assertSingleEntryMethodR33R3Profile(o.profile,v.stderrSinkProofSHA256,v.ownerStderrInitialIdentitySHA256);need(Number.isSafeInteger(o.pid)&&o.pid>1&&Number.isSafeInteger(o.ppid)&&o.ppid>=0&&o.uid===0&&o.gid===0
  &&/^[0-9]+$/.test(o.startTicks??'')&&/^[a-f0-9-]{36}$/.test(o.boot??'')&&N.test(o.invocationId??'')
  &&o.unit===unit&&o.controlGroup==='/system.slice/'+unit&&o.ownerSHA256===S.owner.sha256&&o.fixtureSHA256===S.fixture.sha256
  &&o.generatedSHA256===S.generated.sha256&&o.activationSHA256===q.activationSHA256&&o.onceSHA256===q.onceSHA256
  &&o.profile?.realEffectiveSavedUID?.every(x=>x===0)&&o.profile?.realEffectiveSavedUID?.length===3
  &&o.profile?.realEffectiveSavedGID?.every(x=>x===0)&&o.profile?.realEffectiveSavedGID?.length===3
  &&Number.parseInt(o.profile?.capabilities?.CapEff,16)===S.rootCapabilityMask&&Number.parseInt(o.profile?.capabilities?.CapPrm,16)===S.rootCapabilityMask
  &&Number.parseInt(o.profile?.capabilities?.CapInh,16)===0&&Number.parseInt(o.profile?.capabilities?.CapAmb,16)===0
  &&o.profile?.noNewPrivileges===1&&o.profile?.rootCapabilitiesAreZero===false&&o.profile?.generatedDefinitionsLoaded===false
  &&o.profile?.methodExecutedAsRoot===false&&o.selfPIDFD?.requestedPID===o.pid&&o.selfPIDFD?.attached===true
  &&o.selfPIDFD?.identityBound===true&&o.selfPIDFD?.livePollEvents===0&&H.test(o.selfPIDFD?.fdIdentitySHA256??'')
  &&!Object.hasOwn(o.selfPIDFD,'fdIdentity'),'R33_METHOD_ROOT_OWNER_CHANGED');}
 if(v.stopped){need(v.stopped.stopProcessIdentity?.uid===0&&v.stopped.stopProcessIdentity?.gid===0,'R33_METHOD_STOP_PROFILE_CHANGED');assertSingleEntryMethodR33R3Profile(v.stopped.stopProcessIdentity.profile,v.stderrSinkProofSHA256,v.ownerStderrInitialIdentitySHA256);}
 if(q.owner)need(v.owner&&same(v.owner,q.owner),'R33_METHOD_FROZEN_OWNER_CHANGED');
 if(q.unitProofSHA256)need(v.unitProofSHA256===q.unitProofSHA256,'R33_METHOD_UNIT_PROOF_CHANGED');
 if(q.stderrSinkProofSHA256)need(v.stderrSinkProofSHA256===q.stderrSinkProofSHA256,'R33_METHOD_SINK_PROOF_CHANGED');
 if(v.fixtureProcess)need(v.owner&&v.fixtureProcess.uid===1000&&v.fixtureProcess.gid===1000&&v.fixtureProcess.ppid===v.owner.pid&&v.fixtureProcess.boot===v.owner.boot
  &&v.fixtureProcess.controlGroup==='/system.slice/'+unit&&Number.isSafeInteger(v.fixtureProcess.pid)&&v.fixtureProcess.pid>1
  &&/^[0-9]+$/.test(v.fixtureProcess.startTicks??'')
  &&same(v.fixtureProcess.profile?.UID,[1000,1000,1000,1000])&&same(v.fixtureProcess.profile?.GID,[1000,1000,1000,1000])
  &&v.fixtureProcess.profile?.noNewPrivileges==='1'&&same(Object.keys(v.fixtureProcess.profile?.capabilities??{}).sort(),['CapAmb','CapEff','CapInh','CapPrm'])
  &&Object.values(v.fixtureProcess.profile.capabilities).every(x=>Number.parseInt(x,16)===0),'R33_METHOD_FIXTURE_IDENTITY_CHANGED');
 need(['running','passed','failed','incomplete'].includes(v.status)&&typeof v.methodSubsetProducerPassed==='boolean','R33_METHOD_STATUS_UNKNOWN');
 if(v.methodSubsetProducerPassed)need(v.status==='passed'&&v.fixtureProcess&&v.fixtureSummary?.fixtureQualified===true
  &&v.ownerStderrBytes===0&&v.earlyFailures.length===0
  &&v.fixtureSummary.readyHandshakeCompleted===true&&v.fixtureSummary.releaseGateSent===true&&v.fixtureSummary.signalsSent===false
  &&v.fixtureSummary.childIdentity?.ppid===v.fixtureProcess.pid&&v.fixtureSummary.childIdentity?.boot===v.fixtureProcess.boot
  &&v.resultSummary?.fixtureExitCode===0&&v.resultSummary?.fixturePIDFDClosed===true&&v.resultSummary?.ownerSelfPIDFDClosed===true
  &&v.resultSummary?.emergencyStopAttempted===false&&v.resultSummary?.firstFailure===null
  &&v.stopped?.serviceResult==='success'&&v.stopped?.exitCode==='exited'&&v.stopped?.exitStatus==='0','R33_METHOD_PRODUCER_RESULT_CHANGED');
 return v;
}

export function singleEntryMethodR33R3HostProgram(ownerRaw=null){
 need(ownerRaw!==null&&sha(ownerRaw)===S.owner.sha256,'R33_METHOD_HOST_OWNER_SOURCE_REQUIRED');
 const source=Buffer.from(ownerRaw).toString('utf8'),anchor='def validate_fixture_result(value, fixture):',end='\n\ndef closed_error(error, phase):';
 need(source.split(anchor).length===2&&source.split(end).length===2,'R33_METHOD_VALIDATOR_ANCHOR_CHANGED');
 const validator=source.slice(source.indexOf(anchor),source.indexOf(end));
 const selected=source.slice(source.indexOf('SELECTED_SHA = {'),source.indexOf('\n\n\ndef need'));
 return String.raw`
import base64,errno,hashlib,json,os,re,signal,stat,subprocess,sys,time
from pathlib import Path
S=json.loads('${JSON.stringify(S)}')
def need(v,c):
 if not v:raise RuntimeError(c)
def sha(v):return hashlib.sha256(v).hexdigest()
def key(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
need(os.getresuid()==(0,0,0) and os.getresgid()==(0,0,0) and p['scope']==S and p['action'] in ['start','check'] and re.fullmatch('[a-f0-9]{32}',p['nonce']) and p['phase']=='native' and p['sourceProtocol']==S['sourceProtocol'] and p['ownerSHA256']==S['owner']['sha256'] and p['fixtureSHA256']==S['fixture']['sha256'] and p['generatedSHA256']==S['generated']['sha256'],'R33_METHOD_HOST_SCOPE_CHANGED')
signal.signal(signal.SIGALRM,lambda *_:(_ for _ in ()).throw(RuntimeError('R33_METHOD_HOST_DEADLINE')));signal.alarm(30)
root=Path(S['base'])/p['nonce'];control=root/'control';work=root/'work';stderr_sink=work/'owner.stderr.raw';unit='jarvis-single-entry-method-r33-r3-'+p['nonce']+'.service';env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'}
def close_preserving(fd):
 primary=sys.exc_info()[1]
 try:os.close(fd)
 except BaseException as error:
  if primary is None:raise
  rows=getattr(primary,'secondaryCloseErrors',[])
  if len(rows)<8:rows.append({'phase':'HOST_READ_CLOSE','errno':error.errno if type(getattr(error,'errno',None))is int else None})
  primary.secondaryCloseErrors=rows
def held(path):
 fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  for name in Path(path).parts[1:]:
   before=os.stat(name,dir_fd=fd,follow_symlinks=False);need(stat.S_ISDIR(before.st_mode) and before.st_uid==before.st_gid==0 and not before.st_mode&0o022 and before.st_mode&0o001,'R33_METHOD_HOST_PARENT_UNTRUSTED');child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
   try:need(key(before)==key(os.fstat(child)),'R33_METHOD_HOST_PARENT_CHANGED')
   except BaseException:close_preserving(child);raise
   previous,fd=fd,child;close_preserving(previous)
  return fd
 except BaseException:close_preserving(fd);raise
def read_file(path,uid,mode,limit=1048576,expected_identity=None):
 parent=held(path.parent) if uid==0 and path.parent!=work else held(root)
 try:
  if path.parent==work:
   info=os.stat('work',dir_fd=parent,follow_symlinks=False);need(stat.S_ISDIR(info.st_mode) and info.st_uid==info.st_gid==0 and stat.S_IMODE(info.st_mode)==0o700,'R33_METHOD_HOST_WORK_UNTRUSTED');directory=os.open('work',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
  else:directory=os.dup(parent)
  try:
   try:before=os.stat(path.name,dir_fd=directory,follow_symlinks=False)
   except FileNotFoundError as e:
    need(e.errno==errno.ENOENT,'R33_METHOD_HOST_ABSENCE_UNKNOWN');return None
   need(stat.S_ISREG(before.st_mode) and before.st_uid==before.st_gid==uid and before.st_nlink==1 and stat.S_IMODE(before.st_mode)==mode and before.st_size<=limit,'R33_METHOD_HOST_FILE_UNTRUSTED');fd=os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=directory)
   try:
    if expected_identity is not None:need(key(before)[:6]==expected_identity[:6],'R33_METHOD_HOST_STDERR_IDENTITY_CHANGED')
    need(key(before)==key(os.fstat(fd)),'R33_METHOD_HOST_FILE_CHANGED');raw=b''
    while len(raw)<=before.st_size:
     chunk=os.read(fd,min(65536,before.st_size+1-len(raw)))
     if not chunk:break
     raw+=chunk
    need(len(raw)==before.st_size and key(before)==key(os.fstat(fd))==key(os.stat(path.name,dir_fd=directory,follow_symlinks=False)),'R33_METHOD_HOST_FILE_CHANGED');return raw
   finally:close_preserving(fd)
  finally:close_preserving(directory)
 finally:close_preserving(parent)
def store(path,raw):
 directory=held(path.parent)
 try:
  fd=os.open(path.name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o444,dir_fd=directory)
  try:
   view=memoryview(raw)
   while view:
    count=os.write(fd,view);need(0<count<=len(view),'R33_METHOD_HOST_SHORT_WRITE');view=view[count:]
   os.fchmod(fd,0o444);os.fsync(fd)
  finally:close_preserving(fd)
  os.fsync(directory)
 finally:close_preserving(directory)
def mkdir(path,mode):
 parent=held(path.parent)
 try:
  os.mkdir(path.name,mode=mode,dir_fd=parent);fd=os.open(path.name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
  try:
   info=os.fstat(fd);need(stat.S_ISDIR(info.st_mode) and info.st_uid==info.st_gid==0,'R33_METHOD_HOST_NEW_DIRECTORY_UNTRUSTED');os.fchmod(fd,mode);os.fsync(fd);need(key(os.fstat(fd))==key(os.stat(path.name,dir_fd=parent,follow_symlinks=False)) and stat.S_IMODE(os.fstat(fd).st_mode)==mode,'R33_METHOD_HOST_NEW_DIRECTORY_CHANGED')
  finally:close_preserving(fd)
  os.fsync(parent)
 finally:close_preserving(parent)

def prepare_stderr_sink():
 parent=held(root)
 try:
  before=os.stat('work',dir_fd=parent,follow_symlinks=False);need(stat.S_ISDIR(before.st_mode) and before.st_uid==before.st_gid==0 and stat.S_IMODE(before.st_mode)==0o700,'R33_METHOD_HOST_WORK_UNTRUSTED');directory=os.open('work',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
  try:
   need(key(before)==key(os.fstat(directory)),'R33_METHOD_HOST_WORK_CHANGED');fd=os.open('owner.stderr.raw',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=directory)
   try:
    os.fchmod(fd,0o600);os.fsync(fd);s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600 and s.st_size==0 and key(s)==key(os.stat('owner.stderr.raw',dir_fd=directory,follow_symlinks=False)),'R33_METHOD_HOST_STDERR_SINK_UNTRUSTED');identity=key(s)
   finally:close_preserving(fd)
   os.fsync(directory);return identity
  finally:close_preserving(directory)
 finally:close_preserving(parent)

def assert_profile(profile,sink_proof,sink_sha):
 need(type(profile)is dict and profile.get('realEffectiveSavedUID')==profile.get('realEffectiveSavedGID')==[0,0,0] and profile.get('noNewPrivileges')==1 and profile.get('rootCapabilitiesAreZero')is False and profile.get('generatedDefinitionsLoaded')is False and profile.get('methodExecutedAsRoot')is False,'R33_METHOD_HOST_PROFILE_CHANGED')
 b=profile.get('capabilityBridge');need(type(b)is dict and b.get('kind')=='r33-owner-self-capability-bridge-v3' and b.get('abi')=={'architecture':'x86_64','byteOrder':'little','version':537396514,'headerBytes':8,'dataBytes':24,'capgetSyscall':125,'capsetSyscall':126,'pid':0} and b.get('verified')is True and type(b.get('capsetReturn'))is int and b['capsetReturn']==0 and type(b.get('capsetErrno'))is int and b['capsetErrno']==0 and b.get('request')=={'effective':226,'permitted':226,'inheritable':0,'highWords':[0,0,0],'pid':0},'R33_METHOD_HOST_BRIDGE_CHANGED')
 for x,inh,amb in [(b.get('pre'),128,128),(b.get('post'),0,0)]:
  need(type(x)is dict and type(x.get('capgetReturn'))is int and x['capgetReturn']==0 and type(x.get('capgetErrno'))is int and x['capgetErrno']==0 and x.get('capget')=={'effective':226,'permitted':226,'inheritable':inh,'highWords':[0,0,0]} and x.get('realEffectiveSavedUID')==x.get('realEffectiveSavedGID')==[0,0,0] and x.get('noNewPrivileges')==1,'R33_METHOD_HOST_BRIDGE_SNAPSHOT_CHANGED');v=x.get('status');need(type(v)is dict and set(v)=={'CapEff','CapPrm','CapInh','CapAmb'} and all(type(k)is str and re.fullmatch('[0-9a-fA-F]{16}',k) for k in v.values()) and [int(v[k],16) for k in ['CapEff','CapPrm','CapInh','CapAmb']]==[226,226,inh,amb],'R33_METHOD_HOST_BRIDGE_STATUS_CHANGED')
 need(profile.get('capabilities')==b['post']['status'],'R33_METHOD_HOST_FINAL_CAPABILITIES_CHANGED')
 t=profile.get('stderrSinkBinding');need(type(t)is dict and t.get('proofSHA256')==sink_sha and t.get('initialIdentitySHA256')==sink_proof['initialIdentitySHA256'] and t.get('fd')==2 and t.get('fdIdentityFirstSix')==sink_proof['initialIdentity'][:6] and t.get('appendMode')is True and t.get('accessMode')in ['write-only','read-write'] and t.get('stderrPathSHA256')==sha(str(stderr_sink).encode()),'R33_METHOD_HOST_SINK_BINDING_CHANGED')
def public_profile(profile):
 value=dict(profile);binding=dict(value['stderrSinkBinding']);binding['fdIdentityFirstSixSHA256']=sha(json.dumps(binding.pop('fdIdentityFirstSix'),separators=(',',':')).encode());value['stderrSinkBinding']=binding;return value

def project_early_stderr(raw):
 if not raw:return [],True
 phases={'ARGUMENTS','STDERR_BIND','CAPABILITY_PRE','CAPABILITY_REQUEST','CAPABILITY_POST','RUNTIME_PROFILE','CONTROL_READ','CONTEXT_FIELDS','INVOCATION','CGROUP','OWNER_IDENTITY','OWNER_PIDFD_OPEN','OWNER_PIDFD_VERIFY','OWNER_RECORD_SAVE','STOP_STATUS','STOP_RECORD_SAVE','FIXTURE_LIFECYCLE','OWNER_PIDFD_CLOSE','EARLY_RECORD_SAVE'}
 rows=raw.splitlines();out=[]
 if not 1<=len(rows)<=2:return [],False
 for line in rows:
  try:
   row=json.loads(line);failure=row.get('firstFailure')
   need(type(row)is dict and row.get('schemaVersion')==1 and row.get('kind')=='r33-single-entry-method-owner-early-failure-r3' and row.get('nonce')==p['nonce'] and row.get('sourceProtocol')==S['sourceProtocol'] and row.get('action') in ['--run','--stopped'] and (row.get('control')is None or row.get('control')in S['controls']) and type(failure)is dict and set(failure)=={'phase','errorCode','errno'} and failure['phase']in phases and type(failure['errorCode'])is str and re.fullmatch('R33_METHOD_OWNER_[A-Z0-9_]{1,100}',failure['errorCode']) and (failure['errno']is None or type(failure['errno'])is int) and all(row.get(k)is False for k in ['methodSubsetProducerPassed','actualMethodIndependentlyQualified','currentScopeCleanupIndependentlyVerified','fullProtectionQualified','productCodeExecuted','modelsInvoked']),'R33_METHOD_HOST_EARLY_RECORD_CHANGED')
   out.append({'action':row['action'],'control':row.get('control'),'firstFailure':failure})
  except (ValueError,TypeError,AttributeError,RuntimeError):return [],False
 return out,True

props='Id,LoadState,ActiveState,SubState,MainPID,ControlGroup,InvocationID,User,Group,NoNewPrivileges,CapabilityBoundingSet,AmbientCapabilities,PrivateNetwork,ProtectControlGroups,RuntimeMaxUSec,TimeoutStopUSec,KillMode,KillSignal,Restart,ExecStart,ExecStopPost,StandardOutput,StandardError,Result,ExecMainCode,ExecMainStatus'
def unit_read():
 r=subprocess.run(['/usr/bin/systemctl','show',unit,'--property='+props],capture_output=True,text=True,timeout=8,env=env);need(r.returncode==0,'R33_METHOD_HOST_UNIT_READ_FAILED');v=dict(part.split('=',1) for part in r.stdout.splitlines() if '=' in part);need(v.get('Id')==unit,'R33_METHOD_HOST_UNIT_CHANGED');return v
cmd=['/usr/bin/python3','-I',str(control/'owner.py'),'--run',p['nonce']];stop=['/usr/bin/python3','-I',str(control/'owner.py'),'--stopped',p['nonce']]
def argv_of(value):
 need(type(value)is str and len(value)<=20000 and value.startswith('{ ') and value.endswith(' }') and value.count('{')==value.count('}')==1,'R33_METHOD_HOST_UNIT_COMMAND_UNKNOWN');pairs=[]
 for part in value[2:-2].split(';'):
  part=part.strip()
  if not part:continue
  need('=' in part,'R33_METHOD_HOST_UNIT_COMMAND_UNKNOWN');pairs.append(part.split('=',1))
 values=dict(pairs);need(len(values)==len(pairs) and set(values)<=set(['path','argv[]','ignore_errors','start_time','stop_time','pid','code','status']) and all(k in values for k in ['path','argv[]','ignore_errors']) and values['path']=='/usr/bin/python3' and values['ignore_errors']=='no','R33_METHOD_HOST_UNIT_COMMAND_UNKNOWN');return values['argv[]'].split()
def verify_unit(v):
 capabilities=v.get('CapabilityBoundingSet','').split();need(len(capabilities)==len(set(capabilities)) and set(capabilities)=={'cap_dac_override','cap_kill','cap_setgid','cap_setuid'},'R33_METHOD_HOST_ROOT_CAPS_CHANGED')
 need(v.get('User') in ['root','0'] and v.get('Group') in ['root','0'] and v.get('NoNewPrivileges')=='yes' and v.get('AmbientCapabilities')=='cap_setuid' and v.get('PrivateNetwork')=='yes' and v.get('ProtectControlGroups')=='yes' and v.get('RuntimeMaxUSec') in ['1min 20s','80s','80000000'] and v.get('TimeoutStopUSec') in ['10s','10000000'] and v.get('KillMode')=='control-group' and v.get('KillSignal') in ['9','SIGKILL'] and v.get('Restart')=='no' and argv_of(v.get('ExecStart',''))==cmd and argv_of(v.get('ExecStopPost',''))==stop and v.get('StandardOutput')=='null' and v.get('StandardError')=='append','R33_METHOD_HOST_UNIT_CONFIG_CHANGED')
 return {'rootUID':0,'rootGID':0,'rootCapabilityMask':226,'fixtureUID':1000,'fixtureGID':1000,'noNewPrivileges':True,'startupAmbientCapabilityMask':128,'finalAmbientCapabilityMask':0,'finalInheritableCapabilityMask':0,'privateNetwork':True,'runtimeMaxSec':80,'timeoutStopSec':10,'totalParentSeconds':90,'killMode':'control-group','killSignal':'SIGKILL','restart':'no','execStartSHA256':sha(json.dumps(cmd,separators=(',',':')).encode()),'execStopPostSHA256':sha(json.dumps(stop,separators=(',',':')).encode()),'standardOutput':'null','standardError':'append','submittedStandardError':'append:'+str(stderr_sink),'stderrDestinationEvidence':'source-command-plus-inherited-fd2-object'}
if p['action']=='start':
 need(set(p['files'])==set(S['controls']),'R33_METHOD_HOST_CONTROL_SET_CHANGED');files={name:base64.b64decode(v['base64'],validate=True) for name,v in p['files'].items()};need(all(0<len(raw)<=1048576 and sha(raw)==p['files'][name]['sha256'] for name,raw in files.items()),'R33_METHOD_HOST_CONTROL_BYTES_CHANGED')
 need(sha(files['owner.py'])==p['ownerSHA256'] and sha(files['fixture.py'])==p['fixtureSHA256'] and sha(files['generated.py'])==p['generatedSHA256'] and sha(files['activation.json'])==p['activationSHA256'] and sha(files['once.json'])==p['onceSHA256'],'R33_METHOD_HOST_CONTROL_PINS_CHANGED')
 av,ov=json.loads(files['activation.json']),json.loads(files['once.json']);need(av.get('kind')=='r33-single-entry-method-root-activation-r3' and ov.get('kind')=='r33-single-entry-method-root-once-r3' and av.get('nonce')==ov.get('nonce')==p['nonce'] and av.get('phase')==ov.get('phase')=='native' and ov.get('unit')==unit and ov.get('activationSHA256')==p['activationSHA256'],'R33_METHOD_HOST_INTENT_CHANGED')
 old=unit_read();need(old.get('LoadState')=='not-found' and old.get('ActiveState')=='inactive' and old.get('MainPID')=='0' and old.get('ControlGroup')=='','R33_METHOD_HOST_UNIT_ALREADY_EXISTS');need(not os.path.lexists(root),'R33_METHOD_HOST_PRIOR_NONCE_ONLY_CHECK')
 parent=held(Path(S['base']).parent);os.close(parent)
 if not os.path.lexists(S['base']):mkdir(Path(S['base']),0o711)
 directory=held(Path(S['base']));need(stat.S_IMODE(os.fstat(directory).st_mode)==0o711,'R33_METHOD_HOST_BASE_MODE_CHANGED');os.close(directory)
 mkdir(root,0o711);mkdir(control,0o755);mkdir(work,0o700)
 for name,raw in files.items():store(control/name,raw)
 os.chmod(control,0o555);directory=held(root);os.fsync(directory);os.close(directory)
 stderr_identity=prepare_stderr_sink()
 sink_proof={'schemaVersion':1,'kind':'r33-single-entry-method-root-stderr-sink-proof-r3','sourceProtocol':S['sourceProtocol'],'nonce':p['nonce'],'phase':'native','unit':unit,'ownerSHA256':p['ownerSHA256'],'fixtureSHA256':p['fixtureSHA256'],'generatedSHA256':p['generatedSHA256'],'activationSHA256':p['activationSHA256'],'onceSHA256':p['onceSHA256'],'stderrPath':str(stderr_sink),'submittedStandardError':'append:'+str(stderr_sink),'initialIdentity':stderr_identity,'initialIdentitySHA256':sha(json.dumps(stderr_identity,separators=(',',':')).encode())}
 sink_proof_raw=json.dumps(sink_proof,separators=(',',':')).encode()+b'\n';store(root/'stderr-sink-proof.json',sink_proof_raw)
 properties=['User=root','Group=root','RuntimeMaxSec=80','TimeoutStopSec=10','KillMode=control-group','KillSignal=SIGKILL','SendSIGKILL=yes','Restart=no','NoNewPrivileges=yes','CapabilityBoundingSet=CAP_DAC_OVERRIDE CAP_KILL CAP_SETGID CAP_SETUID','AmbientCapabilities=CAP_SETUID','PrivateNetwork=yes','RestrictAddressFamilies=AF_UNIX','ProtectControlGroups=yes','ProtectSystem=strict','ProtectHome=yes','PrivateTmp=yes','WorkingDirectory='+str(control),'ReadWritePaths='+str(work),'StandardOutput=null','StandardError=append:'+str(stderr_sink),'ExecStopPost='+' '.join(stop)]
 r=subprocess.run(['/usr/bin/systemd-run','--quiet','--unit='+unit]+['--property='+property for property in properties]+cmd,capture_output=True,timeout=10,env=env);need(r.returncode==0,'R33_METHOD_HOST_START_UNCERTAIN_ONLY_CHECK')
 actual=unit_read();configuration=verify_unit(actual);need(re.fullmatch('[a-f0-9]{32}',actual.get('InvocationID','')),'R33_METHOD_HOST_INVOCATION_UNKNOWN')
 store(root/'unit-proof.json',json.dumps({'kind':'r33-single-entry-method-root-unit-proof-r3','nonce':p['nonce'],'unit':unit,'invocationId':actual['InvocationID'],'ownerSHA256':p['ownerSHA256'],'activationSHA256':p['activationSHA256'],'onceSHA256':p['onceSHA256'],'configuration':configuration,'ownerStderrInitialIdentity':stderr_identity,'ownerStderrInitialIdentitySHA256':sha(json.dumps(stderr_identity,separators=(',',':')).encode()),'stderrSinkProofSHA256':sha(sink_proof_raw)},separators=(',',':')).encode()+b'\n')
 for _ in range(20):
  if os.path.lexists(work/'owner.json') or os.path.lexists(work/'stopped.json') or os.stat(stderr_sink,follow_symlinks=False).st_size>0:break
  time.sleep(.1)
else:need(p['files']=={},'R33_METHOD_HOST_CHECK_HAS_MUTATION_PAYLOAD')
before={name:read_file(control/name,0,0o444) for name in S['controls']};need(all(before.values()),'R33_METHOD_HOST_CONTROL_MISSING')
need(sha(before['owner.py'])==p['ownerSHA256'] and sha(before['fixture.py'])==p['fixtureSHA256'] and sha(before['generated.py'])==p['generatedSHA256'] and sha(before['activation.json'])==p['activationSHA256'] and sha(before['once.json'])==p['onceSHA256'],'R33_METHOD_HOST_INSTALLED_SOURCE_CHANGED')
sink_proof_raw=read_file(root/'stderr-sink-proof.json',0,0o444);need(sink_proof_raw is not None,'R33_METHOD_HOST_SINK_PROOF_MISSING');sink_proof=json.loads(sink_proof_raw);stderr_identity=sink_proof.get('initialIdentity')
sink_expected={'schemaVersion':1,'kind':'r33-single-entry-method-root-stderr-sink-proof-r3','sourceProtocol':S['sourceProtocol'],'nonce':p['nonce'],'phase':'native','unit':unit,'ownerSHA256':p['ownerSHA256'],'fixtureSHA256':p['fixtureSHA256'],'generatedSHA256':p['generatedSHA256'],'activationSHA256':p['activationSHA256'],'onceSHA256':p['onceSHA256'],'stderrPath':str(stderr_sink),'submittedStandardError':'append:'+str(stderr_sink)}
need(type(sink_proof)is dict and set(sink_proof)==set(sink_expected)|{'initialIdentity','initialIdentitySHA256'} and all(sink_proof.get(k)==v for k,v in sink_expected.items()) and type(stderr_identity)is list and len(stderr_identity)==9 and all(type(v)is int for v in stderr_identity) and stderr_identity[2:4]==[0,0] and stat.S_ISREG(stderr_identity[4]) and stat.S_IMODE(stderr_identity[4])==0o600 and stderr_identity[5:7]==[1,0] and sink_proof['initialIdentitySHA256']==sha(json.dumps(stderr_identity,separators=(',',':')).encode()),'R33_METHOD_HOST_STDERR_PROOF_CHANGED')
raw_reports={};values={};hashes={};counts={}
for name in S['workReports']:
 raw=read_file(work/name,0,0o600,expected_identity=stderr_identity if name=='owner.stderr.raw' else None)
 if raw is not None:
  raw_reports['work/'+name]={'base64':base64.b64encode(raw).decode(),'sha256':sha(raw),'bytes':len(raw)};hashes[name]=sha(raw);counts[name]=len(raw)
  if name not in ['fixture.stderr.raw','owner.stderr.raw']:values[name]=json.loads(raw)
INPUT_SHA=S['generated']['sha256'];BUILD_STATIC_SHA=S['buildStatic']['sha256'];MODULE_SHA=S['pureModule']['sha256'];GENERATOR_SHA=S['generator']['sha256']
${selected}
${validator}
owner=values.get('owner.json');fixture=values.get('fixture-process.json');result=values.get('result.json');stopped=values.get('stopped.json');method=values.get('fixture.stdout.json')
if owner is not None:
 assert_profile(owner.get('profile'),sink_proof,sha(sink_proof_raw))
 need(owner.get('uid')==owner.get('gid')==0 and owner.get('unit')==unit and owner.get('controlGroup')=='/system.slice/'+unit and owner.get('ownerSHA256')==p['ownerSHA256'] and owner.get('activationSHA256')==p['activationSHA256'] and owner.get('onceSHA256')==p['onceSHA256'] and re.fullmatch('[a-f0-9]{32}',owner.get('invocationId','')),'R33_METHOD_HOST_OWNER_CHANGED')
if fixture is not None:need(owner is not None and fixture.get('uid')==1000 and fixture.get('ppid')==owner['pid'] and fixture.get('boot')==owner['boot'] and fixture.get('controlGroup')==owner['controlGroup'],'R33_METHOD_HOST_FIXTURE_CHANGED')
if method is not None:validate_fixture_result(method,fixture)
if result is not None:
 need(result.get('kind')=='r33-single-entry-method-owner-result-r3' and result.get('nonce')==p['nonce'] and result.get('phase')=='native' and result.get('sourceProtocol')==S['sourceProtocol'] and result.get('owner')==owner and result.get('fixtureProcessIdentity')==fixture and result.get('fixtureResult')==method and result.get('fixtureStdoutSHA256')==hashes.get('fixture.stdout.json') and result.get('fixtureStderrSHA256')==hashes.get('fixture.stderr.raw') and all(result.get(k)is False for k in ['actualMethodIndependentlyQualified','currentScopeCleanupIndependentlyVerified','fullProtectionQualified','productCodeExecuted','modelsInvoked','buildWholeProgramExecuted']),'R33_METHOD_HOST_RESULT_CHANGED')
proof_raw=read_file(root/'unit-proof.json',0,0o444);need(proof_raw is not None,'R33_METHOD_HOST_UNIT_PROOF_MISSING');proof=json.loads(proof_raw)
need(proof.get('kind')=='r33-single-entry-method-root-unit-proof-r3' and proof.get('nonce')==p['nonce'] and proof.get('unit')==unit and proof.get('ownerSHA256')==p['ownerSHA256'] and proof.get('activationSHA256')==p['activationSHA256'] and proof.get('onceSHA256')==p['onceSHA256'] and proof.get('stderrSinkProofSHA256')==sha(sink_proof_raw) and proof.get('ownerStderrInitialIdentity')==stderr_identity and proof.get('ownerStderrInitialIdentitySHA256')==sink_proof['initialIdentitySHA256'],'R33_METHOD_HOST_UNIT_PROOF_CHANGED')
current=unit_read()
if current.get('LoadState')!='not-found':need(verify_unit(current)==proof['configuration'],'R33_METHOD_HOST_UNIT_PROOF_CONFIG_CHANGED')
if owner is not None:need(proof['invocationId']==owner['invocationId'],'R33_METHOD_HOST_INVOCATION_CHANGED')
if stopped is not None:assert_profile(stopped.get('stopProcessIdentity',{}).get('profile'),sink_proof,sha(sink_proof_raw));need(stopped.get('kind')=='r33-single-entry-method-owner-stopped-r3' and stopped.get('nonce')==p['nonce'] and stopped.get('unit')==unit and stopped.get('invocationId')==proof['invocationId'],'R33_METHOD_HOST_STOPPED_CHANGED')
after={name:read_file(control/name,0,0o444) for name in S['controls']};need(before==after and read_file(root/'unit-proof.json',0,0o444)==proof_raw,'R33_METHOD_HOST_SOURCE_READ_CHANGED')
need(read_file(root/'stderr-sink-proof.json',0,0o444)==sink_proof_raw and 'owner.stderr.raw'in hashes,'R33_METHOD_HOST_STDERR_MISSING')
stderr_raw=base64.b64decode(raw_reports['work/owner.stderr.raw']['base64'],validate=True);need(read_file(stderr_sink,0,0o600,expected_identity=stderr_identity)==stderr_raw,'R33_METHOD_HOST_STDERR_CHANGED');early_failures,stderr_structured=project_early_stderr(stderr_raw)
for name,raw in before.items():raw_reports['control/'+name]={'base64':base64.b64encode(raw).decode(),'sha256':sha(raw),'bytes':len(raw)}
raw_reports['unit-proof.json']={'base64':base64.b64encode(proof_raw).decode(),'sha256':sha(proof_raw),'bytes':len(proof_raw)}
raw_reports['stderr-sink-proof.json']={'base64':base64.b64encode(sink_proof_raw).decode(),'sha256':sha(sink_proof_raw),'bytes':len(sink_proof_raw)}
passed=bool(not stderr_raw and result is not None and result.get('methodSubsetProducerPassed')is True and result.get('fixtureExitCode')==0 and result.get('fixturePIDFDClosed')is True and result.get('ownerSelfPIDFDClosed')is True and result.get('emergencyStopAttempted')is False and result.get('firstFailure')is None and method is not None and method.get('fixtureQualified')is True and stopped is not None and stopped.get('serviceResult')=='success' and stopped.get('exitCode')=='exited' and stopped.get('exitStatus')=='0')
status='passed' if passed else 'failed' if stopped is not None or stderr_raw or current.get('ActiveState')=='failed' else 'running' if current.get('ActiveState') in ['active','activating','deactivating'] else 'incomplete'
summary={k:method.get(k) for k in ['fixtureQualified','requestedChildPID','childIdentity','readyHandshakeCompleted','releaseGateSent','childReaped','descriptorClosed','signalsSent','firstFailure','fixturePhase']} if method is not None else None
result_summary={k:result.get(k) for k in ['fixtureExitCode','fixturePIDFDClosed','ownerSelfPIDFDClosed','emergencyStopAttempted','firstFailure','secondaryFailures']} if result is not None else None
public_owner=dict(owner) if owner is not None else None
if public_owner is not None:public_owner['profile']=public_profile(public_owner['profile'])
public_stopped=dict(stopped) if stopped is not None else None
if public_stopped is not None:public_stopped['stopProcessIdentity']=dict(stopped['stopProcessIdentity']);public_stopped['stopProcessIdentity']['profile']=public_profile(stopped['stopProcessIdentity']['profile'])
if public_owner is not None and 'selfPIDFD' in public_owner:
 raw_pidfd=public_owner['selfPIDFD'];public_owner['selfPIDFD']={k:raw_pidfd.get(k) for k in ['requestedPID','attached','identityBound','livePollEvents']};public_owner['selfPIDFD']['fdIdentitySHA256']=sha(json.dumps(raw_pidfd.get('fdIdentity'),separators=(',',':')).encode())
signal.alarm(0)
print(json.dumps({'schemaVersion':1,'kind':'r33-single-entry-bound-method-parent-observation-r3','nonce':p['nonce'],'phase':'native','sourceProtocol':S['sourceProtocol'],'ownerSHA256':p['ownerSHA256'],'fixtureSHA256':p['fixtureSHA256'],'generatedSHA256':p['generatedSHA256'],'buildStaticMappingSHA256':S['buildStatic']['sha256'],'activationSHA256':p['activationSHA256'],'onceSHA256':p['onceSHA256'],'owner':public_owner,'ownerPublicMetadataIsProjection':True,'profileMetadataIsProjection':True,'stderrSinkProofSHA256':sha(sink_proof_raw),'ownerStderrInitialIdentitySHA256':sink_proof['initialIdentitySHA256'],'fixtureProcess':fixture,'fixtureSummary':summary,'resultSummary':result_summary,'stopped':public_stopped,'status':status,'methodSubsetProducerPassed':passed,'unit':{k:current.get(k) for k in ['Id','LoadState','ActiveState','SubState','MainPID','ControlGroup','InvocationID','Result','ExecMainCode','ExecMainStatus']},'reportSHA256':hashes,'reportBytes':counts,'rawReports':raw_reports,'ownerStderrSinkPresent':True,'ownerStderrSHA256':hashes['owner.stderr.raw'],'ownerStderrBytes':counts['owner.stderr.raw'],'ownerStderrStructured':stderr_structured,'ownerStderrClosedCode':None if stderr_structured else 'R33_METHOD_OWNER_STDERR_UNCLASSIFIED','earlyFailures':early_failures,'controlsStable':True,'unitConfigVerified':True,'unitProofSHA256':sha(proof_raw),'dispatchSubmitted':True,'readOnly':p['action']=='check','actualMethodIndependentlyQualified':False,'currentScopeCleanupIndependentlyVerified':False,'fullProtectionQualified':False,'productCodeExecuted':False,'modelsInvoked':False},separators=(',',':')))
`;}

async function defaultReadRoot(params,program){
 const {lanProfile,python}=await import('./managed-server-client.mjs');
 const r=spawnSync('ssh',['-F',lanProfile,'-o','BatchMode=yes','jarvis-101','sudo -n python3 -'],{input:python(params,program),timeout:60000,windowsHide:true,maxBuffer:4*1024**2});
 const packet={status:r.status,signal:r.signal??null,stdoutBase64:Buffer.from(r.stdout??'').toString('base64'),stderrBase64:Buffer.from(r.stderr??'').toString('base64'),errorCode:r.error?.code??null};
 const raw=Buffer.from(JSON.stringify(packet)+'\n'),path='.jarvis-dev/maintenance/r33-single-entry-method-r3-transport-'+Date.now()+'-'+randomUUID()+'.json';
 await wx(path,raw);const evidence={path,sha256:sha(raw),bytes:raw.length,stdoutSHA256:sha(r.stdout??Buffer.alloc(0)),stderrSHA256:sha(r.stderr??Buffer.alloc(0)),representation:'original-transport-bytes',status:r.status};
 if(r.status!==0){const error=Error('R33_METHOD_ROOT_RESPONSE_INCOMPLETE_ONLY_CHECK');error.transportEvidence=evidence;throw error}
 return{raw:Buffer.from(r.stdout),transportEvidence:evidence};
}

export async function startSingleEntryMethodR33R3({action='inspect',activation=singleEntryMethodR33R3Activation}={},deps={}){
 need(['inspect','start','check'].includes(action),'R33_METHOD_ACTION_INVALID');
 if(activation===null||activation?.review===null||activation?.review===undefined)return{schemaVersion:1,kind:'r33-single-entry-bound-method-parent-preparation-r3',ready:false,reason:'R33_METHOD_REVIEW_NOT_PINNED',journalCreated:false,remoteOperations:false,actualMethodIndependentlyQualified:false};
 need(activation?.kind==='r33-single-entry-method-reviewed-activation-r3'&&activation.schemaVersion===1&&activation.phase==='native'
  &&same(Object.keys(activation).sort(),['kind','nonce','phase','remoteExecutionAuthorized','review','schemaVersion','starterSHA256'])
  &&activation.remoteExecutionAuthorized===true&&N.test(activation.nonce??'')&&H.test(activation.starterSHA256??'')&&ref(activation.review)
  &&/^artifacts\/software-factory\/goals-r29\/r33-single-entry-bound-method-parent-independent-local-review-r3-[0-9]{13}-[a-f0-9-]{36}\.json$/.test(activation.review.path),'R33_METHOD_ACTIVATION_CHANGED');
 const packet=structuredClone(activation),d={readLocal:singleEntryMethodR33R3ReadLocal,readRoot:defaultReadRoot,writeWX:wx,save,lock,unlock,receipt,now:Date.now,...deps};
 const sourceRefs=[S.owner,S.fixture,S.generated,S.buildStatic,S.generator,S.pureModule,S.fixtureReview,S.generatorReview,S.transport,{path:S.starterPath,sha256:packet.starterSHA256},packet.review];
 const bodies=[];for(const item of sourceRefs){const raw=await d.readLocal(item.path);need(sha(raw)===item.sha256,'R33_METHOD_LOCAL_SOURCE_CHANGED');bodies.push(Buffer.from(raw))}
 const review=JSON.parse(bodies.at(-1)),program=singleEntryMethodR33R3HostProgram(bodies[0]);
 need(review.kind==='r33-single-entry-bound-method-parent-independent-local-review-r3'&&review.ownerSHA256===S.owner.sha256
  &&review.starterSHA256===packet.starterSHA256&&review.hostProgramSHA256===sha(program)&&review.fixtureSHA256===S.fixture.sha256
  &&review.staticPreparationReady===true&&review.remainingP0P1===0&&review.remoteOperationsPerformed===false
  &&review.actualMethodIndependentlyQualified===false,'R33_METHOD_INDEPENDENT_REVIEW_REQUIRED');
 if(action==='inspect')return{schemaVersion:1,kind:'r33-single-entry-bound-method-parent-preparation-r3',ready:true,sourceRefs,hostProgramSHA256:sha(program),dispatchSubmitted:false,remoteOperations:false,actualMethodIndependentlyQualified:false};
 let heldLock,q;
 try{
  heldLock=await d.lock();try{q=JSON.parse(await d.readLocal(JP))}catch(error){if(error.code!=='ENOENT')throw error}
  if(q)need(q.kind==='r33-single-entry-method-local-once-r3'&&q.nonce===packet.nonce&&q.phase==='native'&&same(q.scope,S)
   &&q.ownerSHA256===S.owner.sha256&&q.starterSHA256===packet.starterSHA256&&same(q.review,packet.review)&&q.automaticRetry===false,'R33_METHOD_JOURNAL_CHANGED');
  let params;
  if(action==='start'){
   need(!q,'R33_METHOD_PRIOR_INTENT_ONLY_CHECK');
   const common={schemaVersion:1,nonce:packet.nonce,phase:'native',sourceProtocol:S.sourceProtocol,ownerSHA256:S.owner.sha256,fixtureSHA256:S.fixture.sha256,generatedSHA256:S.generated.sha256,buildStaticMappingSHA256:S.buildStatic.sha256,fixtureWorkSeconds:45,runtimeMaxSec:80,timeoutStopSec:10,hardParentBoundSeconds:90,startupAmbientCapabilityMask:128,finalAmbientCapabilityMask:0,finalInheritableCapabilityMask:0};
   const av=Buffer.from(JSON.stringify({...common,kind:'r33-single-entry-method-root-activation-r3',parentReview:packet.review,fixtureReview:S.fixtureReview})+'\n');
   const once=Buffer.from(JSON.stringify({...common,kind:'r33-single-entry-method-root-once-r3',unit:'jarvis-single-entry-method-r33-r3-'+packet.nonce+'.service',activationSHA256:sha(av)})+'\n');
   q={kind:'r33-single-entry-method-local-once-r3',nonce:packet.nonce,phase:'native',scope:S,sourceRefs,review:packet.review,
    ownerSHA256:S.owner.sha256,starterSHA256:packet.starterSHA256,hostProgramSHA256:sha(program),activationSHA256:sha(av),onceSHA256:sha(once),automaticRetry:false,dispatched:false,startUncertain:true,startedAt:new Date(d.now()).toISOString()};
   const intentRaw=Buffer.from(JSON.stringify(q)+'\n');
   await d.writeWX(JP,intentRaw);await d.save(q);
   need(Buffer.from(await d.readLocal(JP)).equals(intentRaw),'R33_METHOD_DURABLE_INTENT_READBACK_CHANGED');
   const files={'owner.py':bodies[0],'fixture.py':bodies[1],'generated.py':bodies[2],'activation.json':av,'once.json':once};
   params={scope:S,action:'start',nonce:packet.nonce,phase:'native',sourceProtocol:S.sourceProtocol,ownerSHA256:S.owner.sha256,fixtureSHA256:S.fixture.sha256,generatedSHA256:S.generated.sha256,activationSHA256:q.activationSHA256,onceSHA256:q.onceSHA256,files:Object.fromEntries(Object.entries(files).map(([name,raw])=>[name,{sha256:sha(raw),base64:raw.toString('base64')}]))};
  }else{
   need(q,'R33_METHOD_CHECK_REQUIRES_SAME_INTENT');params={scope:S,action:'check',nonce:q.nonce,phase:'native',sourceProtocol:S.sourceProtocol,ownerSHA256:S.owner.sha256,fixtureSHA256:S.fixture.sha256,generatedSHA256:S.generated.sha256,activationSHA256:q.activationSHA256,onceSHA256:q.onceSHA256,files:{}};
  }
  let actual,evidence;
  try{
   const response=await d.readRoot(params,program);
   if(response?.raw!==undefined){evidence=response.transportEvidence;actual=JSON.parse(Buffer.from(response.raw).toString('utf8'))}
   else if(typeof response==='string'||Buffer.isBuffer(response))actual=JSON.parse(Buffer.from(response).toString('utf8'));
   else actual=response; // Controlled parsed-frame DI only; never claimed as original wire.
   assertSingleEntryMethodR33R3Frame(actual,q,action==='check');
  }catch(error){q.startUncertain=q.startUncertain||action==='start';q.lastErrorCode=/^R33_METHOD_[A-Z0-9_]+$/.test(error?.message??'')?error.message:'R33_METHOD_RESPONSE_UNKNOWN_ONLY_CHECK';if(error.transportEvidence)q.transportEvidence=error.transportEvidence;else if(evidence)q.transportEvidence=evidence;await d.save(q);throw error}
  try{const after=[];for(const item of sourceRefs)after.push(await d.readLocal(item.path));need(after.every((raw,i)=>Buffer.from(raw).equals(bodies[i])),'R33_METHOD_SOURCE_CHANGED_AFTER_ROOT')}
  catch(error){q.lastErrorCode=error.message;if(evidence)q.transportEvidence=evidence;await d.save(q);throw error}
  const {rawReports,...safeActual}=actual;
  q.dispatched=true;q.startUncertain=false;q.unitProofSHA256=actual.unitProofSHA256;q.stderrSinkProofSHA256=actual.stderrSinkProofSHA256;if(actual.owner)q.owner=actual.owner;
  if(evidence)q.transportEvidence=evidence;
  q.lastObservation=await d.receipt({...safeActual,transportEvidence:evidence??null,rawReportsPubliclyExported:false},action);await d.save(q);
  return{...safeActual,receipt:q.lastObservation,transportEvidence:evidence??null,rawReportsPubliclyExported:false};
 }finally{if(heldLock)await d.unlock(heldLock)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){let value;try{need(process.argv.length===2,'R33_METHOD_CLI_ACTIVATION_IS_EXTERNAL');value=await startSingleEntryMethodR33R3()}catch(error){value={kind:'r33-single-entry-bound-method-parent-preparation-r3',ready:false,errorCode:/^R33_METHOD_[A-Z0-9_]+$/.test(error?.message??'')?error.message:'R33_METHOD_INCOMPLETE',actualMethodIndependentlyQualified:false,rawErrorExported:false};process.exitCode=1}console.log(JSON.stringify(value));}
