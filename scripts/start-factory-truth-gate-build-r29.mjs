/** A once-only finite R29 build attempt. No model or platform task is dispatched. */
import {readFile,open,mkdir,lstat,unlink,rename} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {sha,canonical} from './run-factory-main-repair-r26.mjs';
import {safeReadLocal} from './factory-repair-evidence-read-r26.mjs';
import {runFactoryTargetRepairR29} from './run-factory-target-repair-r29.mjs';
const S={source:'/home/superopen/All-Projects/msf-targets-r29/source',fingerprint:'4907e45a21799f2dd14ac2373769607f40d6b9e0319bb614fbe259b157e60493',sourceFiles:621,sourceBytes:18386584,metadataSHA:'2da9d3e490fd6d042113c067807a89b000a4f40fdb5fa8d3ca2911b6615ebce8',root:'/var/lib/jarvis-development/101/truth-gate-r29-build',tool:'/opt/jarvis-development/software-factory/factory-truth-gate-build-r29-0b94c6191e3e2e53.py',toolSHA:'0b94c6191e3e2e53e6d47ee6631a721d2291fd98e923ab440e1a8960b35f4a6b',review:'artifacts/software-factory/goals-r29/build-owner-lifecycle-independent-review-1791823274912-ec79a41b-0ea7-4e1a-bdcb-aec4f26d9e7d.json',reviewSHA:'24adb6a33ad654073aaecf6f6c2cc4bc84e2b6f83a9dbbe5059ed49fce71dadb',lifecycleProof:'artifacts/software-factory/goals-r29/build-owner-lifetime-proof-1791823732398-c590b8b8-8d59-4b56-b168-74a9d242fc3b.json',lifecycleProofSHA:'a3861d19663cc3e2f4e0c7ffb31de48ee2443776ae5fcba3e79c8b85497180e9'};
const jp='.jarvis-dev/maintenance/factory-r29-isolated-build-attempt.json',need=(v,c)=>{if(!v)throw Error(c)},same=(a,b)=>canonical(a)===canonical(b);
async function save(q){const tmp=jp+'.'+randomUUID()+'.tmp',f=await open(tmp,'wx',0o600);try{await f.writeFile(JSON.stringify(q,null,2)+'\n');await f.sync()}finally{await f.close()}if(process.platform==='win32'){const r=spawnSync('python',['-c',"import ctypes,sys;f=ctypes.WinDLL('kernel32',use_last_error=True).MoveFileExW;f.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p,ctypes.c_ulong];f.restype=ctypes.c_int;sys.exit(0 if f(sys.argv[1],sys.argv[2],9) else 1)",resolve(tmp),resolve(jp)],{encoding:'utf8',windowsHide:true,timeout:10000});need(r.status===0,'R29_BUILD_START_DURABLE_SAVE_FAILED')}else{await rename(tmp,jp);const d=await open('.jarvis-dev/maintenance','r');try{await d.sync()}finally{await d.close()}}}
export function buildStartR29HostProgram(){return String.raw`
import os,json,stat,hashlib,base64,subprocess,time,re,uuid
from pathlib import Path
def need(v,c):
 if not v:raise RuntimeError(c)
expected_scope=json.loads('${JSON.stringify(S)}')
need(os.geteuid()==0 and isinstance(p,dict) and set(p)==set(expected_scope)|{'action','attempt','toolBase64'} and all(p.get(k)==v for k,v in expected_scope.items()) and p['action'] in ['start','check'] and isinstance(p['attempt'],str) and re.fullmatch('[a-f0-9]{32}',p['attempt']),'R29_BUILD_START_FIXED_SCOPE_INVALID')
def trusted(path):
 for x in [path,*path.parents]:
  s=x.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'R29_BUILD_START_ROOT_CHAIN_INVALID')
def read(path,limit=2000000):
 trusted(path);f=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(f);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<=limit,'R29_BUILD_START_FILE_INVALID');raw=b''
  while len(raw)<=limit:
   chunk=os.read(f,min(65536,limit+1-len(raw)))
   if not chunk:break
   raw+=chunk
  a=os.fstat(f);need(len(raw)==s.st_size and (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)==(a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns),'R29_BUILD_START_FILE_CHANGED');return raw
 finally:os.close(f)
def store(path,value):
 raw=(json.dumps(value,separators=(',',':'))+'\n').encode();tmp=path.parent/(path.name+'.'+uuid.uuid4().hex+'.tmp');f=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 try:
  view=memoryview(raw)
  while view:
   n=os.write(f,view);need(n>0,'R29_BUILD_START_SHORT_WRITE');view=view[n:]
  os.fsync(f)
 finally:os.close(f)
 os.replace(tmp,path);d=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(d)
 finally:os.close(d)
root=Path(p['root']);launches=root/'launches';tool=Path(p['tool']);launch=launches/(p['attempt']+'.json');state_path=root/p['attempt']/'state.json';ownership_dir=root/'ownership';ownership_path=ownership_dir/(p['attempt']+'.json')
if p['action']=='start':
 body=base64.b64decode(p['toolBase64'],validate=True);need(len(body)<=100000 and hashlib.sha256(body).hexdigest()==p['toolSHA'],'R29_BUILD_START_TOOL_BYTES_INVALID');trusted(tool.parent)
 if os.path.lexists(tool):need(read(tool)==body,'R29_BUILD_START_TOOL_CONFLICT')
 else:
  f=os.open(tool,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o755)
  try:
   view=memoryview(body)
   while view:
    n=os.write(f,view);need(n>0,'R29_BUILD_START_SHORT_WRITE');view=view[n:]
   os.fchmod(f,0o755);os.fsync(f)
  finally:os.close(f)
  d=os.open(tool.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:os.fsync(d)
  finally:os.close(d)
 trusted(root.parent)
 if not os.path.lexists(root):root.mkdir(mode=0o700)
 trusted(root);need(stat.S_ISDIR(root.lstat().st_mode) and root.lstat().st_mode&0o077==0,'R29_BUILD_START_ROOT_MODE')
 if not os.path.lexists(launches):launches.mkdir(mode=0o700)
 trusted(launches);need(stat.S_ISDIR(launches.lstat().st_mode) and launches.lstat().st_mode&0o077==0,'R29_BUILD_START_LAUNCH_MODE')
 if not os.path.lexists(ownership_dir):ownership_dir.mkdir(mode=0o700)
 trusted(ownership_dir);need(stat.S_ISDIR(ownership_dir.lstat().st_mode) and ownership_dir.lstat().st_mode&0o077==0,'R29_BUILD_START_OWNERSHIP_MODE')
 need(not os.path.lexists(launch) and not os.path.lexists(root/p['attempt']) and not os.path.lexists(ownership_path),'R29_BUILD_START_EXCLUSIVE_ATTEMPT_REQUIRED')
 names=['jarvis-tg-r29-'+p['attempt']+'-'+name for name in ['offline-install','build','typecheck','truth-unit']];labels={'jarvis.truthgate.r29.attempt':p['attempt'],'jarvis.truthgate.r29.kind':'build'};image='sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96';docker_env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'}
 for name in names:
  result=subprocess.run(['/usr/bin/docker','container','inspect',name],capture_output=True,timeout=15,env=docker_env)
  try:empty=json.loads(result.stdout)==[]
  except (ValueError,UnicodeError):empty=False
  need(result.returncode==1 and empty and result.stderr.decode('utf-8','replace').strip() in ['Error response from daemon: No such container: '+name,'Error: No such container: '+name,'Error: No such object: '+name],'R29_BUILD_START_RESOURCES_NOT_CONFIRMED_EMPTY')
 result=subprocess.run(['/usr/bin/docker','ps','-aq','--filter','label=jarvis.truthgate.r29.attempt='+p['attempt']],capture_output=True,timeout=15,env=docker_env);need(result.returncode==0 and not result.stdout.strip(),'R29_BUILD_START_LABEL_NOT_EMPTY')
 store(ownership_path,{'schemaVersion':1,'attempt':p['attempt'],'toolSHA256':p['toolSHA'],'sourceFingerprint':p['fingerprint'],'containers':names,'labels':labels,'imageID':image,'emptyResourceScopeVerified':True,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
 value={'schemaVersion':1,'kind':'r29-build-once-launch','attempt':p['attempt'],'toolSHA256':p['toolSHA'],'sourceFingerprint':p['fingerprint'],'phase':'fork-intent','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())};store(launch,value)
 out=os.open(launches/(p['attempt']+'.out'),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);err=os.open(launches/(p['attempt']+'.err'),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 os.close(out);os.close(err);unit='jarvis-tg-r29-'+p['attempt']+'-owner.service'
 request=['/usr/bin/systemd-run','--unit='+unit,'--collect','--no-block','--property=User=root','--property=Type=simple','--property=KillMode=control-group','--property=RuntimeMaxSec=1800','--property=TimeoutStopSec=300','--property=Restart=no','--property=WorkingDirectory=/','--property=Environment=JARVIS_R29_BUILD_OWNER_UNIT='+unit,'--property=StandardOutput=append:'+str(launches/(p['attempt']+'.out')),'--property=StandardError=append:'+str(launches/(p['attempt']+'.err')),'--property=ExecStopPost=/usr/bin/python3 '+str(tool)+' --reconcile-cleanup '+p['attempt'],'/usr/bin/python3',str(tool),'--run',p['attempt']]
 dispatched=subprocess.run(request,capture_output=True,timeout=20,env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8'});need(dispatched.returncode==0,'R29_BUILD_START_OWNER_DISPATCH_FAILED')
 shown=subprocess.run(['/usr/bin/systemctl','show',unit,'--property=MainPID'],capture_output=True,text=True,timeout=10);main=dict(x.split('=',1) for x in shown.stdout.splitlines() if '=' in x);pid=int(main.get('MainPID','0'));value['ownerUnit']=unit;value['runtimeMaxSec']=1800;value['stopTimeoutSec']=300;value['fixedExecStopPostConfigured']=True
 try:
  need(pid>1,'R29_BUILD_START_OWNER_NOT_RUNNING');fields=Path('/proc',str(pid),'stat').read_text();parts=fields[fields.rfind(')')+2:].split();value['processIdentity']={'pid':pid,'startTicks':parts[19],'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip()}
 except (FileNotFoundError,RuntimeError):value['processIdentity']={'pid':pid if pid>1 else None,'startTicks':None,'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip()};value['identityReadComplete']=False
 value['phase']='dispatched';value['dispatchedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());store(launch,value)
else:need(p['toolBase64'] is None,'R29_BUILD_START_CHECK_INPUT_INVALID')
value=json.loads(read(launch));need(value['attempt']==p['attempt'] and value['sourceFingerprint']==p['fingerprint'] and value['toolSHA256']==p['toolSHA'],'R29_BUILD_START_LAUNCH_CHANGED');need(hashlib.sha256(read(tool)).hexdigest()==p['toolSHA'],'R29_BUILD_START_INSTALLED_TOOL_CHANGED')
state=json.loads(read(state_path)) if os.path.lexists(state_path) else None
if state is not None:
 need(state['attempt']==p['attempt'] and state['source']['sha256']==p['fingerprint'] and state['source']['files']==p['sourceFiles'] and state['source']['metadataSHA']==p['metadataSHA'],'R29_BUILD_START_STATE_SCOPE_CHANGED')
state_fields=['status','owner','startedAt','finishedAt','source','sourceAfter','sourceUnchanged','sourceReadComplete','sourceReadErrorCode','checks','resources','cleanupClaimsComplete','cleanupUnresolvedNames','labelScopeActuallyEmpty','noRecordedResultStages','noRecordedResultExecutionState','errorCode','independentDBAPIValidation','productAccepted','cleanupIndependentlyVerified']
print(json.dumps({'schemaVersion':1,'kind':'software-factory-r29-once-build-observation','attempt':p['attempt'],'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'launchPhase':value['phase'],'ownerUnit':value.get('ownerUnit'),'processIdentity':value.get('processIdentity'),'state':{k:state[k] for k in state_fields if k in state} if state else None,'installedToolSHA256':p['toolSHA'],'modelsInvoked':False,'productAccepted':False,'rawLogsExported':False,'privateEnvironmentExported':False,'readOnly':p['action']=='check','automaticRedispatch':False}))
`;}
export async function startFactoryTruthGateBuildR29(action='inspect'){
 need(['inspect','start','check'].includes(action),'R29_BUILD_START_ACTION_INVALID');need(sha(await safeReadLocal('scripts/factory-truth-gate-build-r29.py'))===S.toolSHA&&sha(await safeReadLocal(S.review))===S.reviewSHA,'R29_BUILD_START_LOCAL_TOOL_REVIEW_CHANGED');const proofRaw=await safeReadLocal(S.lifecycleProof);need(sha(proofRaw)===S.lifecycleProofSHA,'R29_BUILD_START_LIFECYCLE_PROOF_CHANGED');const proof=JSON.parse(proofRaw);need(proof.schemaVersion===1&&proof.kind==='software-factory-r29-nonproduct-systemd-owner-lifetime-proof'&&proof.toolSHA256===S.toolSHA&&proof.status==='pass'&&proof.scopeUnknown===false&&proof.fixtureOnly===true&&proof.productCodeExecuted===false&&proof.modelsInvoked===false&&proof.ownerTimeoutObserved===true&&proof.ownerProcessGone===true&&proof.ownerChildGone===true&&proof.ownContainerGone===true&&proof.exactFourNamesAbsent===true&&proof.attemptLabelScopeEmpty===true&&proof.foreignWasPreserved===true&&proof.actualProductionStopPostFunctionUsed===true,'R29_BUILD_START_LIFECYCLE_UNPROVEN');
 let lock;const lockPath=jp+'.lock';if(action==='start'){lock=await open(lockPath,'wx',0o600);await lock.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()})+'\n');await lock.sync()}
 try{let q;try{q=JSON.parse(await safeReadLocal(jp,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}if(!q){if(action!=='start')return {ready:false,reason:'FINITE_BUILD_ATTEMPT_NOT_STARTED',scope:S,modelsInvoked:false,productAccepted:false};const actual=await runFactoryTargetRepairR29('check');need(actual.restored&&actual.signed&&actual.status==='round-limit','R29_BUILD_START_SOURCE_TASK_NOT_CLOSED');q={version:1,scope:S,attempt:randomBytes(16).toString('hex'),createdAt:new Date().toISOString(),startAttemptedAt:null,receipts:{}};await save(q)}need(q.version===1&&same(q.scope,S)&&/^[a-f0-9]{32}$/.test(q.attempt),'R29_BUILD_START_JOURNAL_CHANGED');
  if(action==='start'){need(!q.startAttemptedAt,'R29_BUILD_START_AMBIGUOUS_OR_DUPLICATE_USE_READ_ONLY_CHECK');q.startAttemptedAt=new Date().toISOString();await save(q)}const hostAction=action==='start'?'start':'check',toolBase64=hostAction==='start'?(await safeReadLocal('scripts/factory-truth-gate-build-r29.py')).toString('base64'):null;const result=JSON.parse(remote(lanProfile,'jarvis-101',python({...S,action:hostAction,attempt:q.attempt,toolBase64},buildStartR29HostProgram()),true));if(action==='start'){q.receipts.start={at:result.at,launchPhase:result.launchPhase,processIdentity:result.processIdentity};await save(q)}return {scope:S,...result};
 }finally{if(lock){try{const a=await lock.stat(),b=await lstat(lockPath);need(b.isFile()&&!b.isSymbolicLink()&&a.dev===b.dev&&a.ino===b.ino,'R29_BUILD_START_LOCK_IDENTITY_CHANGED');await unlink(lockPath)}finally{await lock.close()}}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){let r;try{need(process.argv.length<=3,'R29_BUILD_START_ARGUMENTS_INVALID');r=await startFactoryTruthGateBuildR29(process.argv[2]??'inspect')}catch(e){r={failed:true,errorCode:/^R29_BUILD_START_[A-Z0-9_]+$/.test(e.message)?e.message:'R29_BUILD_START_OPERATION_FAILED',modelsInvoked:false,productAccepted:false,automaticRetry:false,rawErrorExported:false};process.exitCode=1;const f=await open('.jarvis-dev/maintenance/factory-r29-build-private-error-'+Date.now()+'.json','wx',0o600);try{await f.writeFile(JSON.stringify({message:String(e.message)})+'\n');await f.sync()}finally{await f.close()}}await mkdir('artifacts/software-factory/goals-r29',{recursive:true});const output='artifacts/software-factory/goals-r29/isolated-build-'+(process.argv[2]??'inspect')+'-'+Date.now()+'.json',raw=JSON.stringify(r,null,2)+'\n',f=await open(output,'wx',0o644);try{await f.writeFile(raw);await f.sync()}finally{await f.close()}console.log(JSON.stringify({output,sha256:sha(raw),...r}));}
