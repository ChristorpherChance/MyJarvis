/** Preparation only. Root owns the single real dispatch; no operational review is pinned. */
import {createHash,randomUUID} from 'node:crypto';
import {open,lstat,rename,unlink,constants} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {lanProfile,python} from './managed-server-client.mjs';
import {boundProcessCensusR32NativeProgram,boundProcessCensusR32BuildProgram} from './factory-bound-process-census-r32.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),need=(v,c)=>{if(!v)throw Error(c)};
const H=/^[a-f0-9]{64}$/,N=/^[a-f0-9]{32}$/,same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const boundCensusLinuxR32Activation=null;
export const boundCensusLinuxR32Journal='.jarvis-dev/maintenance/factory-r32-bound-census-linux-once.json';
export const boundCensusLinuxR32Scope=Object.freeze({schemaVersion:1,kind:'r32-bound-census-linux-parent-fixed-scope',machineId:'101',
 base:'/var/lib/jarvis-bound-census-linux-r32',starterPath:'scripts/start-factory-bound-census-linux-r32.mjs',
 owner:{path:'scripts/factory-bound-census-linux-owner-r32.py',sha256:'5983b2ab79a647582a7081d4401931e6c3adbaeeed85bd2f6d1b84eecf91da90'},
 fixture:{path:'scripts/factory-bound-census-linux-fixture-r32.py',sha256:'60a9145a1a8619dc5578345ca7def095bdeaa0ba1ca91feea33443e61d2629b7'},
 generator:{path:'scripts/factory-bound-process-census-r32.mjs',sha256:'a08c44ee006ea993452d39616a217bbf7e45169fd827f580c951a9796cac7252'},
 transport:{path:'scripts/managed-server-client.mjs',sha256:'e287938e2d79b0335523d3d198bd93b588541866cebc2c21d997ae6fce5e4a9f'},
 generated:{native:'b357b2d4afaab2938a5e226d42ffbe6d12d3757f0973488ad696108761a36a78',build:'e2385dcb6001fcc1524a72edac61fc671e83be62339308daabfb5822dda8c1ba'},
 runtimeMaxSec:80,timeoutStopSec:10,hardParentBoundSeconds:90,uid:1000,gid:1000,killMode:'control-group',killSignal:'SIGKILL',restart:'no',
 noNewPrivileges:true,capabilitiesEmpty:true,privateNetwork:true,productCodeExecuted:false,fullProtectionQualified:false});
const S=boundCensusLinuxR32Scope,JP=boundCensusLinuxR32Journal;
export async function boundCensusLinuxR32ReadLocal(path){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size<=2*1024**2,'R32_BOUND_LOCAL_FILE_UNTRUSTED');const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));try{const a=await f.stat();need(['dev','ino','size','mtimeMs','ctimeMs'].every(k=>a[k]===s[k]),'R32_BOUND_LOCAL_FILE_CHANGED');const raw=await f.readFile(),z=await f.stat(),named=await lstat(path);need(raw.length===a.size&&['dev','ino','size','mtimeMs','ctimeMs'].every(k=>a[k]===z[k]&&a[k]===named[k]),'R32_BOUND_LOCAL_FILE_CHANGED');return raw}finally{await f.close()}}
async function wx(path,raw){const f=await open(path,'wx',0o600);try{await f.writeFile(raw);await f.sync()}finally{await f.close()}}
async function save(q){const path=JP+'.'+randomUUID()+'.tmp';await wx(path,JSON.stringify(q)+'\n');if(process.platform==='win32'){const r=spawnSync('python',['-c',"import ctypes,sys;f=ctypes.WinDLL('kernel32',use_last_error=True).MoveFileExW;f.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p,ctypes.c_ulong];f.restype=ctypes.c_int;sys.exit(0 if f(sys.argv[1],sys.argv[2],9) else 1)",resolve(path),resolve(JP)],{windowsHide:true,timeout:10000});need(r.status===0,'R32_BOUND_DURABLE_SAVE_FAILED')}else{await rename(path,JP);const f=await open('.jarvis-dev/maintenance','r');try{await f.sync()}finally{await f.close()}}}
async function lock(){const path=JP+'.lock',f=await open(path,'wx',0o600);await f.sync();return{path,f}}
async function unlock(v){const a=await v.f.stat(),b=await lstat(v.path);need(a.dev===b.dev&&a.ino===b.ino,'R32_BOUND_LOCK_CHANGED');await v.f.close();await unlink(v.path)}
async function receipt(value,action){const path='artifacts/software-factory/goals-r29/bound-census-linux-r32-'+action+'-'+Date.now()+'-'+randomUUID()+'.json',raw=Buffer.from(JSON.stringify(value,null,2)+'\n');await wx(path,raw);return{path,sha256:sha(raw)}}

export function assertBoundCensusLinuxR32Frame(v,q,readOnly){
 const unit='jarvis-bound-census-r32-'+q.nonce+'.service';
 need(v?.schemaVersion===1&&v.kind==='r32-bound-census-linux-parent-observation'&&v.nonce===q.nonce&&v.phase===q.phase
  &&v.ownerSHA256===q.ownerSHA256&&v.fixtureSHA256===S.fixture.sha256&&v.generatedSHA256===S.generated[q.phase]
  &&v.activationSHA256===q.activationSHA256&&v.onceSHA256===q.onceSHA256&&v.readOnly===readOnly&&v.dispatchSubmitted===true
  &&v.fullProtectionQualified===false&&v.productCodeExecuted===false&&v.modelsInvoked===false&&v.independentSubsetQualified===false
  &&v.unit?.Id===unit&&['active','activating','deactivating','inactive','failed'].includes(v.unit.ActiveState)
  &&v.controlsStable===true&&v.unitConfigVerified===true&&H.test(v.unitProofSHA256??''),'R32_BOUND_ACTUAL_FRAME_CHANGED');
 if(v.owner){const o=v.owner;need(o.unit===unit&&o.controlGroup==='/system.slice/'+unit&&Number.isSafeInteger(o.pid)&&o.pid>1
  &&/^[0-9]+$/.test(o.startTicks??'')&&/^[a-f0-9-]{36}$/.test(o.boot??'')&&N.test(o.invocationId??'')
  &&o.uid===1000&&o.gid===1000&&o.ownerSHA256===q.ownerSHA256&&o.fixtureSHA256===S.fixture.sha256&&o.generatedSHA256===S.generated[q.phase]
  &&o.activationSHA256===q.activationSHA256&&o.onceSHA256===q.onceSHA256&&o.runtimeMaxSec===80&&o.stopTimeoutSec===10
  &&o.hardParentBoundSeconds===90&&o.killMode==='control-group'&&o.killSignal==='SIGKILL'&&o.restart==='no'
  &&o.noNewPrivileges===true&&o.capabilitiesEmpty===true,'R32_BOUND_ACTUAL_OWNER_CHANGED');}
 if(q.owner)need(v.owner&&same(v.owner,q.owner),'R32_BOUND_FROZEN_OWNER_CHANGED');
 if(q.unitProofSHA256)need(v.unitProofSHA256===q.unitProofSHA256,'R32_BOUND_FROZEN_UNIT_PROOF_CHANGED');
 need(v.ownerScope?.complete===false||v.ownerScope?.complete===true,'R32_BOUND_SCOPE_STATUS_UNKNOWN');
 if(v.ownerScope.complete)need(v.ownerScope.unitStopped===true&&v.ownerScope.cgroupAbsent===true&&v.ownerScope.ownerPIDAbsent===true
  &&v.stopped?.invocationId===v.owner?.invocationId&&v.unit.ActiveState!=='active','R32_BOUND_OWNER_SCOPE_INCOMPLETE');
 return v;
}

export function boundCensusLinuxR32HostProgram(){return String.raw`
import base64,errno,hashlib,json,os,re,signal,stat,subprocess,time
from pathlib import Path
S=json.loads('${JSON.stringify(S)}')
def need(v,c):
 if not v:raise RuntimeError(c)
def sha(v):return hashlib.sha256(v).hexdigest()
def key(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
need(os.getresuid()==(0,0,0) and os.getresgid()==(0,0,0) and p['scope']==S and p['action'] in ['start','check'] and re.fullmatch('[a-f0-9]{32}',p['nonce']) and p['phase'] in S['generated'] and p['ownerSHA256']==S['owner']['sha256'] and p['fixtureSHA256']==S['fixture']['sha256'] and p['generatedSHA256']==S['generated'][p['phase']],'R32_BOUND_HOST_SCOPE_CHANGED')
signal.signal(signal.SIGALRM,lambda *_:(_ for _ in ()).throw(RuntimeError('R32_BOUND_HOST_DEADLINE')));signal.alarm(30)
root=Path(S['base'])/p['nonce'];control=root/'control';work=root/'work';unit='jarvis-bound-census-r32-'+p['nonce']+'.service';env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'}
def held(path):
 fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  for n in Path(path).parts[1:]:
   s=os.stat(n,dir_fd=fd,follow_symlinks=False);need(stat.S_ISDIR(s.st_mode) and s.st_uid==s.st_gid==0 and not s.st_mode&0o022 and s.st_mode&0o001,'R32_BOUND_HOST_PARENT_UNTRUSTED');c=os.open(n,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
   try:need(key(s)==key(os.fstat(c)),'R32_BOUND_HOST_PARENT_CHANGED')
   except BaseException:os.close(c);raise
   os.close(fd);fd=c
  return fd
 except BaseException:os.close(fd);raise
def root_read(path,limit=1048576):
 d=held(path.parent)
 try:
  s=os.stat(path.name,dir_fd=d,follow_symlinks=False);need(stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o444 and s.st_size<=limit,'R32_BOUND_HOST_FILE_UNTRUSTED');f=os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=d)
  try:
   need(key(s)==key(os.fstat(f)),'R32_BOUND_HOST_FILE_CHANGED');raw=b''
   while len(raw)<=s.st_size:
    b=os.read(f,min(65536,s.st_size+1-len(raw)))
    if not b:break
    raw+=b
   need(len(raw)==s.st_size and key(s)==key(os.fstat(f))==key(os.stat(path.name,dir_fd=d,follow_symlinks=False)),'R32_BOUND_HOST_FILE_CHANGED');return raw
  finally:os.close(f)
 finally:os.close(d)
def store(path,raw):
 d=held(path.parent)
 try:
  f=os.open(path.name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o444,dir_fd=d)
  try:
   view=memoryview(raw)
   while view:
    n=os.write(f,view);need(type(n)is int and 0<n<=len(view),'R32_BOUND_HOST_SHORT_WRITE');view=view[n:]
   os.fchmod(f,0o444);os.fsync(f)
  finally:os.close(f)
  os.fsync(d)
 finally:os.close(d)
def make_root_dir(path,mode):
 d=held(path.parent)
 try:
  os.mkdir(path.name,mode=mode,dir_fd=d);f=os.open(path.name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=d)
  try:
   before=os.fstat(f);need(stat.S_ISDIR(before.st_mode) and before.st_uid==before.st_gid==0,'R32_BOUND_HOST_NEW_DIRECTORY_UNTRUSTED')
   os.fchmod(f,mode);os.fsync(f);after=os.fstat(f);named=os.stat(path.name,dir_fd=d,follow_symlinks=False)
   need(key(after)==key(named) and stat.S_IMODE(after.st_mode)==mode and before.st_dev==after.st_dev and before.st_ino==after.st_ino,'R32_BOUND_HOST_NEW_DIRECTORY_CHANGED')
  finally:os.close(f)
  os.fsync(d)
 finally:os.close(d)
props='Id,LoadState,ActiveState,SubState,MainPID,ControlGroup,InvocationID,User,Group,NoNewPrivileges,CapabilityBoundingSet,AmbientCapabilities,PrivateNetwork,ProtectControlGroups,RuntimeMaxUSec,TimeoutStopUSec,KillMode,KillSignal,Restart,ExecStart,ExecStopPost,Result,ExecMainCode,ExecMainStatus'
def unit_read():
 r=subprocess.run(['/usr/bin/systemctl','show',unit,'--property='+props],capture_output=True,text=True,timeout=8,env=env);need(r.returncode==0,'R32_BOUND_HOST_UNIT_READ_FAILED');v=dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x);need(v.get('Id')==unit,'R32_BOUND_HOST_UNIT_CHANGED');return v
cmd=['/usr/bin/python3','-I',str(control/'owner.py'),'--run',p['nonce']];stop=['/usr/bin/python3','-I',str(control/'owner.py'),'--stopped',p['nonce']]
def argv_of(value):
 need(type(value)is str and len(value)<=20000 and value.startswith('{ ') and value.endswith(' }') and value.count('{')==value.count('}')==1,'R32_BOUND_HOST_UNIT_COMMAND_UNKNOWN')
 pairs=[]
 for part in value[2:-2].split(';'):
  part=part.strip()
  if not part:continue
  need('=' in part,'R32_BOUND_HOST_UNIT_COMMAND_UNKNOWN');pairs.append(part.split('=',1))
 values=dict(pairs);need(len(values)==len(pairs) and set(values)<=set(['path','argv[]','ignore_errors','start_time','stop_time','pid','code','status']) and all(k in values for k in ['path','argv[]','ignore_errors']) and values['path']=='/usr/bin/python3' and values['ignore_errors']=='no','R32_BOUND_HOST_UNIT_COMMAND_UNKNOWN');return values['argv[]'].split()
def verify_unit(v):
 need(v.get('User')==v.get('Group')=='1000' and v.get('NoNewPrivileges')=='yes' and v.get('CapabilityBoundingSet')==v.get('AmbientCapabilities')=='' and v.get('PrivateNetwork')=='yes' and v.get('ProtectControlGroups')=='yes' and v.get('RuntimeMaxUSec') in ['1min 20s','80s','80000000'] and v.get('TimeoutStopUSec') in ['10s','10000000'] and v.get('KillMode')=='control-group' and v.get('KillSignal') in ['9','SIGKILL'] and v.get('Restart')=='no' and argv_of(v.get('ExecStart',''))==cmd and argv_of(v.get('ExecStopPost',''))==stop,'R32_BOUND_HOST_ACTUAL_UNIT_CONFIG_CHANGED')
 return {'uid':1000,'gid':1000,'noNewPrivileges':True,'capabilitiesEmpty':True,'privateNetwork':True,'protectControlGroups':True,'runtimeMaxSec':80,'stopTimeoutSec':10,'hardParentBoundSeconds':90,'killMode':'control-group','killSignal':'SIGKILL','restart':'no','execStartSHA256':sha(json.dumps(cmd,separators=(',',':')).encode()),'execStopPostSHA256':sha(json.dumps(stop,separators=(',',':')).encode())}
if p['action']=='start':
 need(set(p['files'])=={'owner.py','fixture.py','generated.py','activation.json','once.json'},'R32_BOUND_HOST_CONTROL_SET_CHANGED')
 files={k:base64.b64decode(v['base64'],validate=True) for k,v in p['files'].items()};need(all(len(b)<=1048576 and sha(b)==p['files'][k]['sha256'] for k,b in files.items()),'R32_BOUND_HOST_CONTROL_BYTES_CHANGED')
 need(sha(files['owner.py'])==p['ownerSHA256'] and sha(files['fixture.py'])==p['fixtureSHA256'] and sha(files['generated.py'])==p['generatedSHA256'] and sha(files['activation.json'])==p['activationSHA256'] and sha(files['once.json'])==p['onceSHA256'],'R32_BOUND_HOST_PIN_CHANGED')
 av=json.loads(files['activation.json']);ov=json.loads(files['once.json']);need(av['nonce']==ov['nonce']==p['nonce'] and av['phase']==ov['phase']==p['phase'] and av['kind']=='r32-bound-census-root-activation' and ov['kind']=='r32-bound-census-root-once' and ov['unit']==unit and av['ownerSHA256']==ov['ownerSHA256']==p['ownerSHA256'] and av['fixtureSHA256']==ov['fixtureSHA256']==p['fixtureSHA256'] and av['generatedSHA256']==ov['generatedSHA256']==p['generatedSHA256'],'R32_BOUND_HOST_INTENT_CHANGED')
 previous=unit_read();need(previous.get('LoadState')=='not-found' and previous.get('ActiveState')=='inactive' and previous.get('MainPID')=='0' and previous.get('ControlGroup')=='','R32_BOUND_HOST_UNIT_ALREADY_EXISTS')
 parent=held(Path(S['base']).parent);os.close(parent);need(not os.path.lexists(root),'R32_BOUND_HOST_PRIOR_NONCE_ONLY_CHECK')
 if not os.path.lexists(S['base']):
  make_root_dir(Path(S['base']),0o711)
 d=held(Path(S['base']));need(stat.S_IMODE(os.fstat(d).st_mode)==0o711,'R32_BOUND_HOST_NAMESPACE_MODE');os.close(d);make_root_dir(root,0o711)
 make_root_dir(control,0o755);work.mkdir(mode=0o700);os.chown(work,1000,1000);os.chmod(work,0o700);d=held(root);os.fsync(d);os.close(d)
 for name,body in files.items():store(control/name,body)
 os.chmod(control,0o555);d=held(root);os.fsync(d);os.close(d)
 # Both root and local WX intents precede this sole dispatch. No root tool/package code is loaded.
 properties=['User=1000','Group=1000','RuntimeMaxSec=80','TimeoutStopSec=10','KillMode=control-group','KillSignal=SIGKILL','SendSIGKILL=yes','Restart=no','NoNewPrivileges=yes','CapabilityBoundingSet=','AmbientCapabilities=','PrivateNetwork=yes','RestrictAddressFamilies=AF_UNIX','ProtectControlGroups=yes','ProtectSystem=strict','ProtectHome=yes','PrivateTmp=yes','ReadWritePaths='+str(work),'StandardOutput=null','StandardError=null','ExecStopPost='+' '.join(stop)]
 r=subprocess.run(['/usr/bin/systemd-run','--quiet','--unit='+unit]+['--property='+x for x in properties]+cmd,capture_output=True,timeout=10,env=env);need(r.returncode==0,'R32_BOUND_HOST_START_UNCERTAIN_USE_CHECK')
 actual_unit=unit_read();actual_config=verify_unit(actual_unit);need(re.fullmatch('[a-f0-9]{32}',actual_unit.get('InvocationID','')),'R32_BOUND_HOST_INVOCATION_UNKNOWN')
 store(root/'unit-proof.json',json.dumps({'kind':'r32-bound-census-root-unit-proof','nonce':p['nonce'],'unit':unit,'invocationId':actual_unit['InvocationID'],'ownerSHA256':p['ownerSHA256'],'activationSHA256':p['activationSHA256'],'onceSHA256':p['onceSHA256'],'configuration':actual_config},separators=(',',':')).encode()+b'\n')
 for _ in range(20):
  if os.path.lexists(work/'owner.json') or os.path.lexists(work/'stopped.json'):break
  time.sleep(.1)
else:need(p['files']=={},'R32_BOUND_HOST_CHECK_MUTATION_PAYLOAD')
before={n:root_read(control/n) for n in ['owner.py','fixture.py','generated.py','activation.json','once.json']}
need(sha(before['owner.py'])==p['ownerSHA256'] and sha(before['fixture.py'])==p['fixtureSHA256'] and sha(before['generated.py'])==p['generatedSHA256'] and sha(before['activation.json'])==p['activationSHA256'] and sha(before['once.json'])==p['onceSHA256'],'R32_BOUND_HOST_INSTALLED_SOURCE_CHANGED')
def work_read(name):
 parent=held(root)
 try:
  s=os.stat('work',dir_fd=parent,follow_symlinks=False);need(stat.S_ISDIR(s.st_mode) and s.st_uid==s.st_gid==1000 and stat.S_IMODE(s.st_mode)==0o700,'R32_BOUND_HOST_WORK_UNTRUSTED');d=os.open('work',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
  try:
   need(key(s)==key(os.fstat(d)),'R32_BOUND_HOST_WORK_CHANGED')
   try:s=os.stat(name,dir_fd=d,follow_symlinks=False)
   except FileNotFoundError:return None
   need(stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==1000 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600 and s.st_size<=1048576,'R32_BOUND_HOST_REPORT_UNTRUSTED');f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=d)
   try:
    need(key(s)==key(os.fstat(f)),'R32_BOUND_HOST_REPORT_CHANGED');raw=b''
    while len(raw)<=s.st_size:
     b=os.read(f,min(65536,s.st_size+1-len(raw)))
     if not b:break
     raw+=b
    need(len(raw)==s.st_size and key(s)==key(os.fstat(f))==key(os.stat(name,dir_fd=d,follow_symlinks=False)),'R32_BOUND_HOST_REPORT_CHANGED');return raw
   finally:os.close(f)
  finally:os.close(d)
 finally:os.close(parent)
values={};hashes={};bytecounts={}
for name in ['owner.json','fixture-process.json','result.json','stopped.json','fixture.stdout.json']:
 raw=work_read(name)
 if raw is not None:hashes[name]=sha(raw);bytecounts[name]=len(raw);values[name]=json.loads(raw)
def safe_identity(v):
 need(type(v)is dict and set(v)=={'pid','startTicks','boot','procDevice','procInode','unit','controlGroup','invocationId','uid','gid','ownerSHA256','fixtureSHA256','generatedSHA256','activationSHA256','onceSHA256','runtimeMaxSec','stopTimeoutSec','hardParentBoundSeconds','killMode','killSignal','restart','noNewPrivileges','capabilitiesEmpty'},'R32_BOUND_HOST_OWNER_REPORT_SHAPE_CHANGED')
 need(type(v['pid'])is int and v['pid']>1 and type(v['procDevice'])is int and type(v['procInode'])is int and re.fullmatch('[0-9]+',v['startTicks']) and re.fullmatch('[a-f0-9-]{36}',v['boot']) and re.fullmatch('[a-f0-9]{32}',v['invocationId']) and v['unit']==unit and v['controlGroup']=='/system.slice/'+unit and v['uid']==v['gid']==1000 and v['runtimeMaxSec']==80 and v['stopTimeoutSec']==10 and v['hardParentBoundSeconds']==90 and v['killMode']=='control-group' and v['killSignal']=='SIGKILL' and v['restart']=='no' and v['noNewPrivileges']is True and v['capabilitiesEmpty']is True and all(re.fullmatch('[a-f0-9]{64}',v[k]) for k in ['ownerSHA256','fixtureSHA256','generatedSHA256','activationSHA256','onceSHA256']),'R32_BOUND_HOST_OWNER_REPORT_IDENTITY_CHANGED');return v
def safe_fixture(v):
 need(type(v)is dict and v.get('kind')=='r32-bound-census-linux-subset-qualification' and type(v.get('fixtureQualified'))is bool,'R32_BOUND_HOST_FIXTURE_REPORT_SHAPE_CHANGED')
 if not v['fixtureQualified']:
  need(set(v)=={'schemaVersion','kind','fixtureQualified','fullProtectionQualified','errorCode','errno','rawErrorExported','productCodeExecuted','modelsInvoked'} and v['schemaVersion']==1 and all(v[k]is False for k in ['fullProtectionQualified','rawErrorExported','productCodeExecuted','modelsInvoked']) and re.fullmatch('(R32_FIXTURE|R29_CLEANUP)_[A-Z0-9_]{1,100}',v['errorCode']) and (v['errno'] is None or type(v['errno'])is int),'R32_BOUND_HOST_FIXTURE_ERROR_SHAPE_CHANGED');return v
 keys={'schemaVersion','kind','phase','fixtureQualified','uid','gid','internalDeadlineSeconds','requiredParentDeadlineSeconds','descriptorClosed','childReaped','signalsSent','fullProtectionQualified','fullProcCensusExecuted','protectedInventoryRead','nodeACKRead','queueRead','productCodeExecuted','modelsInvoked','rawArgvExported','privateEnvironmentExported','generatedSourceSHA256','functionSHA256','liveRecordRead','naturalChildExit','originalBoundExitProof','alreadyDeadAttachRejected','alreadyDeadAttachErrno'}
 need(set(v)==keys and v['phase']==p['phase'] and v['generatedSourceSHA256']==p['generatedSHA256'] and set(v['functionSHA256'])=={'process_record','pidfd_poll','pidfd_exit_proof'} and all(re.fullmatch('[a-f0-9]{64}',x) for x in v['functionSHA256'].values()),'R32_BOUND_HOST_FIXTURE_SCOPE_CHANGED')
 need(v['schemaVersion']==1 and v['uid']==v['gid']==1000 and v['internalDeadlineSeconds']==45 and v['requiredParentDeadlineSeconds']==90 and all(v[k]is True for k in ['descriptorClosed','childReaped','liveRecordRead','naturalChildExit','alreadyDeadAttachRejected']) and all(v[k]is False for k in ['signalsSent','fullProtectionQualified','fullProcCensusExecuted','protectedInventoryRead','nodeACKRead','queueRead','productCodeExecuted','modelsInvoked','rawArgvExported','privateEnvironmentExported']) and type(v['alreadyDeadAttachErrno'])is int,'R32_BOUND_HOST_FIXTURE_FLAGS_CHANGED')
 proof=v['originalBoundExitProof'];need(type(proof)is dict and set(proof)=={'pid','boot','listedProcIdentity','processIdentity','kernelProof'} and type(proof['pid'])is int and proof['pid']>1 and re.fullmatch('[a-f0-9-]{36}',proof['boot']),'R32_BOUND_HOST_FIXTURE_PROOF_CHANGED')
 identity=proof['processIdentity'];need(set(identity)=={'pid','boot','procDevice','procInode','ppid','startTicks'} and all(type(identity[k])is int for k in ['pid','procDevice','procInode','ppid']) and re.fullmatch('[0-9]+',identity['startTicks']) and identity['boot']==proof['boot'],'R32_BOUND_HOST_FIXTURE_PROOF_IDENTITY_CHANGED')
 need(set(proof['listedProcIdentity'])=={'device','inode'} and all(type(x)is int for x in proof['listedProcIdentity'].values()) and set(proof['kernelProof'])=={'type','attached','identityBound','requestedPID','exitConfirmed','pollEvents','procPathAbsent'} and proof['kernelProof']['type']=='pidfd-POLLIN' and all(proof['kernelProof'][k]is True for k in ['attached','identityBound','exitConfirmed','procPathAbsent']) and proof['kernelProof']['requestedPID']==proof['pid'] and proof['kernelProof']['pollEvents'] in [1,17],'R32_BOUND_HOST_FIXTURE_KERNEL_PROOF_CHANGED');return v
def safe_fixture_process(v):
 need(type(v)is dict and set(v)=={'pid','ppid','startTicks','boot','procDevice','procInode','uid','controlGroup','argvSHA256','commandSHA256'} and all(type(v[k])is int for k in ['pid','ppid','procDevice','procInode','uid']) and v['pid']>1 and v['ppid']>1 and v['uid']==1000 and v['controlGroup']=='/system.slice/'+unit and re.fullmatch('[0-9]+',v['startTicks']) and re.fullmatch('[a-f0-9-]{36}',v['boot']) and all(re.fullmatch('[a-f0-9]{64}',v[k]) for k in ['argvSHA256','commandSHA256']),'R32_BOUND_HOST_FIXTURE_PROCESS_SHAPE_CHANGED');return v
if 'owner.json' in values:values['owner.json']=safe_identity(values['owner.json'])
if 'fixture-process.json' in values:
 safe_fixture_process(values['fixture-process.json']);need('owner.json' in values and values['fixture-process.json']['ppid']==values['owner.json']['pid'] and values['fixture-process.json']['boot']==values['owner.json']['boot'],'R32_BOUND_HOST_FIXTURE_PROCESS_PARENT_CHANGED')
if 'fixture.stdout.json' in values:values['fixture.stdout.json']=safe_fixture(values['fixture.stdout.json'])
if 'result.json' in values:
 r=values['result.json'];need(type(r)is dict and set(r)=={'schemaVersion','kind','nonce','phase','owner','fixtureResult','fixtureExitCode','fixtureStdoutSHA256','fixtureStderrSHA256','fixtureProcessIdentity','fixtureKernelExitProof','fixturePIDFDClosed','fixtureEmergencyStopUsed','errorCode','ownerInputsStable','productCodeExecuted','modelsInvoked','fullProtectionQualified'} and r['schemaVersion']==1 and r['kind']=='r32-bound-census-owner-result' and r['nonce']==p['nonce'] and r['phase']==p['phase'] and (r['fixtureExitCode']is None or type(r['fixtureExitCode'])is int) and type(r['fixturePIDFDClosed'])is bool and type(r['fixtureEmergencyStopUsed'])is bool and r['ownerInputsStable']is True and all(r[k]is False for k in ['productCodeExecuted','modelsInvoked','fullProtectionQualified']) and (r['errorCode'] is None or re.fullmatch('R32_BOUND_OWNER_[A-Z0-9_]{1,100}',r['errorCode'])) and all(r[k]is None or re.fullmatch('[a-f0-9]{64}',r[k]) for k in ['fixtureStdoutSHA256','fixtureStderrSHA256']),'R32_BOUND_HOST_RESULT_REPORT_SHAPE_CHANGED');safe_identity(r['owner'])
 if r['fixtureProcessIdentity'] is not None:
  safe_fixture_process(r['fixtureProcessIdentity']);need(r['fixtureProcessIdentity']==values.get('fixture-process.json'),'R32_BOUND_HOST_FIXTURE_PROCESS_WITNESS_CHANGED')
 if r['fixtureKernelExitProof'] is not None:
  fp=r['fixtureKernelExitProof'];need(type(fp)is dict and set(fp)=={'type','requestedPID','processIdentity','attached','identityBound','exitConfirmed','pollEvents','procPathAbsent'} and fp['type']=='parent-owned-fixture-pidfd-POLLIN' and all(fp[k]is True for k in ['attached','identityBound','exitConfirmed','procPathAbsent']) and fp['pollEvents'] in [1,17] and fp['processIdentity']==r['fixtureProcessIdentity'] and fp['requestedPID']==r['fixtureProcessIdentity']['pid'],'R32_BOUND_HOST_PARENT_FIXTURE_EXIT_PROOF_CHANGED')
 if r['fixtureResult'] is not None:safe_fixture(r['fixtureResult'])
 if r['fixtureResult'] is not None and r['fixtureResult']['fixtureQualified'] is True:need(r['fixtureProcessIdentity'] is not None and r['fixtureResult']['originalBoundExitProof']['processIdentity']['ppid']==r['fixtureProcessIdentity']['pid'],'R32_BOUND_HOST_TINY_CHILD_PARENT_CHANGED')
if 'stopped.json' in values:
 v=values['stopped.json'];need(set(v)=={'kind','nonce','unit','invocationId','serviceResult','exitCode','exitStatus','ownerSHA256','activationSHA256','productCodeExecuted','fullProtectionQualified'} and v['kind']=='r32-bound-census-owner-stopped' and v['nonce']==p['nonce'] and v['unit']==unit and re.fullmatch('[a-f0-9]{32}',v['invocationId']) and v['serviceResult'] in ['success','timeout','exit-code','signal','core-dump','resources','protocol','start-limit-hit','watchdog','oom-kill'] and v['exitCode'] in [None,'exited','killed','dumped'] and (v['exitStatus']is None or re.fullmatch('[A-Z0-9]+',v['exitStatus'])) and v['ownerSHA256']==p['ownerSHA256'] and v['activationSHA256']==p['activationSHA256'] and v['productCodeExecuted']is False and v['fullProtectionQualified']is False,'R32_BOUND_HOST_STOP_REPORT_SHAPE_CHANGED')
u=unit_read();stopped=u.get('ActiveState') in ['inactive','failed'];owner=values.get('owner.json');end=values.get('stopped.json');cg=Path('/sys/fs/cgroup/system.slice')/unit
unit_proof_raw=root_read(root/'unit-proof.json');unit_proof=json.loads(unit_proof_raw)
need(unit_proof.get('kind')=='r32-bound-census-root-unit-proof' and unit_proof.get('nonce')==p['nonce'] and unit_proof.get('unit')==unit and re.fullmatch('[a-f0-9]{32}',unit_proof.get('invocationId','')) and unit_proof.get('ownerSHA256')==p['ownerSHA256'] and unit_proof.get('activationSHA256')==p['activationSHA256'] and unit_proof.get('onceSHA256')==p['onceSHA256'],'R32_BOUND_HOST_UNIT_PROOF_CHANGED')
def owner_absent():
 if owner is None:return False
 need(owner['boot']==Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'R32_BOUND_HOST_OWNER_BOOT_CHANGED')
 try:os.stat('/proc/'+str(owner['pid']),follow_symlinks=False);return False
 except FileNotFoundError as error:
  need(error.errno==errno.ENOENT,'R32_BOUND_HOST_OWNER_ABSENCE_UNKNOWN');return True
def cgroup_absent():
 d=held(cg.parent)
 try:
  try:os.stat(cg.name,dir_fd=d,follow_symlinks=False);return False
  except FileNotFoundError as error:
   need(error.errno==errno.ENOENT,'R32_BOUND_HOST_CGROUP_ABSENCE_UNKNOWN');return True
 finally:os.close(d)
config_verified=True
if u.get('LoadState')!='not-found':
 need(verify_unit(u)==unit_proof['configuration'],'R32_BOUND_HOST_UNIT_PROOF_CONFIG_CHANGED')
 if owner is not None and not stopped:need(u.get('InvocationID')==owner['invocationId'] and u.get('MainPID')==str(owner['pid']) and u.get('ControlGroup')==owner['controlGroup'],'R32_BOUND_HOST_ACTIVE_OWNER_CHANGED')
if owner is not None:need(owner.get('invocationId')==unit_proof['invocationId'],'R32_BOUND_HOST_OWNER_INVOCATION_CHANGED')
cg_absent=cgroup_absent();pid_absent=owner_absent();complete=bool(owner is not None and end is not None and stopped and cg_absent and pid_absent and end.get('invocationId')==owner.get('invocationId'))
after={n:root_read(control/n) for n in before};need(after==before and root_read(root/'unit-proof.json')==unit_proof_raw,'R32_BOUND_HOST_CONTROL_READ_CHANGED')
signal.alarm(0)
safe_unit={k:u.get(k) for k in ['Id','LoadState','ActiveState','SubState','MainPID','ControlGroup','InvocationID','Result','ExecMainCode','ExecMainStatus']}
print(json.dumps({'schemaVersion':1,'kind':'r32-bound-census-linux-parent-observation','nonce':p['nonce'],'phase':p['phase'],'ownerSHA256':p['ownerSHA256'],'fixtureSHA256':p['fixtureSHA256'],'generatedSHA256':p['generatedSHA256'],'activationSHA256':p['activationSHA256'],'onceSHA256':p['onceSHA256'],'owner':owner,'fixtureProcess':values.get('fixture-process.json'),'stopped':end,'result':values.get('result.json'),'fixture':values.get('fixture.stdout.json'),'reportSHA256':hashes,'reportBytes':bytecounts,'unit':safe_unit,'unitConfigVerified':config_verified,'unitProofSHA256':sha(unit_proof_raw),'unitExecStartSHA256':unit_proof['configuration']['execStartSHA256'],'unitExecStopPostSHA256':unit_proof['configuration']['execStopPostSHA256'],'ownerScope':{'complete':complete,'unitStopped':stopped,'cgroupAbsent':cg_absent,'ownerPIDAbsent':pid_absent},'controlsStable':True,'dispatchSubmitted':True,'readOnly':p['action']=='check','independentSubsetQualified':False,'fullProtectionQualified':False,'productCodeExecuted':False,'modelsInvoked':False},separators=(',',':')))
`;}

async function defaultReadRoot(params,program){const r=spawnSync('ssh',['-F',lanProfile,'-o','BatchMode=yes','jarvis-101','sudo -n python3 -'],{input:python(params,program),encoding:'utf8',timeout:60000,windowsHide:true,maxBuffer:2*1024**2});if(r.status!==0){const raw=JSON.stringify({status:r.status,signal:r.signal,stdout:r.stdout??'',stderr:r.stderr??'',errorCode:r.error?.code??null})+'\n',path='.jarvis-dev/maintenance/bound-census-linux-private-'+Date.now()+'-'+randomUUID()+'.json';await wx(path,raw);const e=Error('R32_BOUND_HOST_RESPONSE_INCOMPLETE_USE_CHECK');e.privateDiagnosticSHA256=sha(raw);throw e}return r.stdout}
export async function startBoundCensusLinuxR32({action='inspect',phase='native',activation=boundCensusLinuxR32Activation}={},deps={}){
 need(['inspect','start','check'].includes(action)&&Object.hasOwn(S.generated,phase),'R32_BOUND_ACTION_INVALID');
 if(activation===null||S.owner.sha256===null)return{schemaVersion:1,kind:'r32-bound-census-linux-parent-preparation',ready:false,reason:'R32_BOUND_INDEPENDENT_REVIEW_NOT_PINNED',journalCreated:false,remoteOperations:false,actualLinuxQualificationPassed:false,fullProtectionQualified:false};
 need(activation?.kind==='r32-bound-census-linux-reviewed-activation'&&activation.remoteExecutionAuthorized===true&&N.test(activation.nonce??'')&&H.test(activation.starterSHA256??'')&&activation.review?.path&&H.test(activation.review.sha256??''),'R32_BOUND_ACTIVATION_REQUIRED');
 const d={readLocal:boundCensusLinuxR32ReadLocal,readRoot:defaultReadRoot,writeWX:wx,save,lock,unlock,receipt,now:Date.now,...deps};
 const paths=[S.owner.path,S.fixture.path,S.generator.path,S.transport.path,S.starterPath,activation.review.path];const raw=[];for(const path of paths)raw.push(await d.readLocal(path));
 need(sha(raw[0])===S.owner.sha256&&sha(raw[1])===S.fixture.sha256&&sha(raw[2])===S.generator.sha256&&sha(raw[3])===S.transport.sha256&&sha(raw[4])===activation.starterSHA256&&sha(raw[5])===activation.review.sha256,'R32_BOUND_LOCAL_SOURCES_CHANGED');
 const review=JSON.parse(raw[5]);need(review.kind==='r32-bound-census-linux-parent-independent-local-review'&&review.ownerSHA256===S.owner.sha256&&review.starterSHA256===activation.starterSHA256&&review.staticPreparationReady===true&&review.remainingP0P1===0&&review.remoteOperations===false&&review.actualLinuxQualificationPassed===false,'R32_BOUND_INDEPENDENT_REVIEW_REQUIRED');
 const generated=Buffer.from(phase==='native'?boundProcessCensusR32NativeProgram():boundProcessCensusR32BuildProgram());need(sha(generated)===S.generated[phase],'R32_BOUND_GENERATED_SOURCE_CHANGED');
 if(action==='inspect')return{schemaVersion:1,kind:'r32-bound-census-linux-parent-preparation',ready:true,phase,dispatchSubmitted:false,remoteOperations:false,actualLinuxQualificationPassed:false,fullProtectionQualified:false};
 let heldLock,q;
 try{
  heldLock=await d.lock();try{q=JSON.parse(await d.readLocal(JP))}catch(e){if(e.code!=='ENOENT')throw e}
  if(q)need(q.kind==='r32-bound-census-linux-once'&&q.nonce===activation.nonce&&q.phase===phase&&same(q.scope,S)&&q.ownerSHA256===S.owner.sha256&&q.starterSHA256===activation.starterSHA256&&q.automaticRetry===false,'R32_BOUND_JOURNAL_CHANGED');
  let params;
  if(action==='start'){
   need(!q,'R32_BOUND_PRIOR_INTENT_ONLY_CHECK');const nonce=activation.nonce,unit='jarvis-bound-census-r32-'+nonce+'.service';
   const once=Buffer.from(JSON.stringify({schemaVersion:1,kind:'r32-bound-census-root-once',nonce,phase,unit,ownerSHA256:S.owner.sha256,fixtureSHA256:S.fixture.sha256,generatedSHA256:S.generated[phase]})+'\n');
   const av=Buffer.from(JSON.stringify({schemaVersion:1,kind:'r32-bound-census-root-activation',nonce,phase,ownerSHA256:S.owner.sha256,fixtureSHA256:S.fixture.sha256,generatedSHA256:S.generated[phase]})+'\n');
   q={kind:'r32-bound-census-linux-once',nonce,phase,scope:S,ownerSHA256:S.owner.sha256,starterSHA256:activation.starterSHA256,activationSHA256:sha(av),onceSHA256:sha(once),automaticRetry:false,startedAt:new Date(d.now()).toISOString(),dispatched:false,startUncertain:true};
   await d.writeWX(JP,JSON.stringify(q)+'\n');await d.save(q); // WT/parent fsync must complete before any root mutation.
   const bodies={'owner.py':raw[0],'fixture.py':raw[1],'generated.py':generated,'activation.json':av,'once.json':once};
   params={scope:S,action:'start',nonce,phase,ownerSHA256:S.owner.sha256,fixtureSHA256:S.fixture.sha256,generatedSHA256:S.generated[phase],activationSHA256:q.activationSHA256,onceSHA256:q.onceSHA256,files:Object.fromEntries(Object.entries(bodies).map(([name,body])=>[name,{sha256:sha(body),base64:Buffer.from(body).toString('base64')}]))};
  }else{
   need(q,'R32_BOUND_CHECK_REQUIRES_SAME_INTENT');params={scope:S,action:'check',nonce:q.nonce,phase:q.phase,ownerSHA256:q.ownerSHA256,fixtureSHA256:S.fixture.sha256,generatedSHA256:S.generated[q.phase],activationSHA256:q.activationSHA256,onceSHA256:q.onceSHA256,files:{}};
  }
  let actual;
  try{const response=await d.readRoot(params,boundCensusLinuxR32HostProgram());actual=assertBoundCensusLinuxR32Frame(typeof response==='string'?JSON.parse(response):response,q,action==='check');}catch(error){q.startUncertain=q.startUncertain||action==='start';q.lastErrorCode=/^R32_BOUND_[A-Z0-9_]+$/.test(error?.message??'')?error.message:'R32_BOUND_RESPONSE_UNKNOWN_ONLY_CHECK';if(error.privateDiagnosticSHA256)q.privateDiagnosticSHA256=error.privateDiagnosticSHA256;await d.save(q);throw error}
  const after=[];for(const path of paths)after.push(await d.readLocal(path));need(after.every((b,i)=>Buffer.from(b).equals(Buffer.from(raw[i]))),'R32_BOUND_LOCAL_SOURCE_READ_CHANGED');
  q.dispatched=true;q.startUncertain=false;q.unitProofSHA256=actual.unitProofSHA256;if(actual.owner)q.owner=actual.owner;q.lastObservation=await d.receipt(actual,action);await d.save(q);return{...actual,receipt:q.lastObservation,actualLinuxQualificationPassed:false};
 }finally{if(heldLock)await d.unlock(heldLock)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){let value;try{const args=process.argv.slice(2);need(args.length<=2&&args.every(v=>/^--(action=(inspect|start|check)|phase=(native|build))$/.test(v))&&new Set(args.map(v=>v.split('=')[0])).size===args.length,'R32_BOUND_CLI_INVALID');value=await startBoundCensusLinuxR32(Object.fromEntries(args.map(v=>v.slice(2).split('='))))}catch(error){value={kind:'r32-bound-census-linux-parent-preparation',ready:false,errorCode:/^R32_BOUND_[A-Z0-9_]+$/.test(error?.message??'')?error.message:'R32_BOUND_INCOMPLETE',actualLinuxQualificationPassed:false,fullProtectionQualified:false,rawErrorExported:false};process.exitCode=1}console.log(JSON.stringify(value));}
