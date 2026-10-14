/** Inert until the real R2 reconciliation and independent review are pinned. */
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {open,lstat,rename,unlink,constants} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {settleEvidenceReads} from './factory-repair-evidence-read-r26.mjs';
import {canonical} from './run-factory-main-repair-r26.mjs';
import {verifyFactoryProtectionContractR29R2} from './verify-factory-protection-contract-r29-r2.mjs';
import {assertR29R4ProtectionProof} from './start-factory-truth-gate-build-r29-r4.mjs';
import {runtimeArtifactR32R2References as references,runtimeArtifactR32R2Journal} from './prepare-factory-runtime-artifact-r32-r2.mjs';
import {readLockedLzmaPackageR32} from './verify-factory-lzma-archive-r32.mjs';
import {lanProfile,python} from './managed-server-client.mjs';
const H=/^[a-f0-9]{64}$/,N=/^[a-f0-9]{32}$/,need=(v,c)=>{if(!v)throw Error(c)},hash=b=>createHash('sha256').update(b).digest('hex'),same=(a,b)=>canonical(a)===canonical(b);
export const artifactOwnerR32R3Activation=null;
export const artifactOwnerR32R3Journal='.jarvis-dev/maintenance/factory-r32-runtime-artifact-r3-once.json';
export const artifactOwnerR32R3Scope=Object.freeze({schemaVersion:1,kind:'r32-artifact-root-byte-owner-fixed-scope-r3',base:'/var/lib/jarvis-development/101/r32-artifact-owner-r3',artifactBase:'/var/lib/jarvis-development/101/r32-truth-artifacts',oldNonce:'10f408804b6efae7e0622f19e2e4bfe4',treeSHA256:'9e83e22a1ebfcdfc699876860879d8acefe220d3abf49e802333719b549299e3',inputSHA256:'acaa2073b6a0be14eb05888713a022cada63010b208aa25c908b4e942aba28fe',core:{path:'scripts/factory-runtime-artifact-byte-controller-r32-r2.py',sha256:'1d7208c35be27ffb657457dce4d758b51e9473b2dd172db6c74916e674013d10'},workerPath:'scripts/factory-runtime-artifact-owner-r32-r3.py',starterPath:'scripts/start-factory-runtime-artifact-owner-r32-r3.mjs',runtimeMaxSec:900,stopTimeoutSec:120,resourceCount:0,packageCodeExecuted:false,modelsInvoked:false,productAccepted:false});
const S=artifactOwnerR32R3Scope,JP=artifactOwnerR32R3Journal;
export async function artifactOwnerR32R3ReadLocal(path){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size<=64*1024**2,'R32_OWNER_LOCAL_FILE_UNTRUSTED');const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));try{const b=await f.stat();need(['dev','ino','size','mtimeMs','ctimeMs'].every(k=>b[k]===s[k]),'R32_OWNER_LOCAL_FILE_CHANGED');const body=await f.readFile(),z=await f.stat(),named=await lstat(path);need(body.length===b.size&&['dev','ino','size','mtimeMs','ctimeMs'].every(k=>b[k]===z[k]&&b[k]===named[k]),'R32_OWNER_LOCAL_FILE_CHANGED');return body}finally{await f.close()}}
async function wx(path,b){const f=await open(path,'wx',0o600);try{await f.writeFile(b);await f.sync()}finally{await f.close()}}
async function receipt(v,action){const path='artifacts/software-factory/goals-r29/runtime-artifact-owner-r32-r3-'+action+'-'+Date.now()+'-'+randomUUID()+'.json',b=Buffer.from(JSON.stringify(v,null,2)+'\n');await wx(path,b);return{path,sha256:hash(b)}}
async function save(q){const path=JP+'.'+randomUUID()+'.tmp';await wx(path,JSON.stringify(q)+'\n');if(process.platform==='win32'){const r=spawnSync('python',['-c',"import ctypes,sys;f=ctypes.WinDLL('kernel32',use_last_error=True).MoveFileExW;f.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p,ctypes.c_ulong];f.restype=ctypes.c_int;sys.exit(0 if f(sys.argv[1],sys.argv[2],9) else 1)",resolve(path),resolve(JP)],{windowsHide:true,timeout:10000});need(r.status===0,'R32_OWNER_DURABLE_SAVE_FAILED')}else{await rename(path,JP);const d=await open('.jarvis-dev/maintenance','r');try{await d.sync()}finally{await d.close()}}}
async function acquire(){const path=JP+'.lock',f=await open(path,'wx',0o600);await f.sync();return{path,f}}
async function release(v){const a=await v.f.stat(),b=await lstat(v.path);need(a.dev===b.dev&&a.ino===b.ino,'R32_OWNER_LOCK_CHANGED');await v.f.close();await unlink(v.path)}
export function assertArtifactOwnerR32R3Reconciliation(v){need(v?.schemaVersion===1&&v.kind==='r32-failed-byte-attempt-readonly-reconciliation'&&v.nonce===S.oldNonce&&v.ready===true&&['originalInspectionUnchanged','source625FullyVerified','partialTwoCompleteByteReadbacks','processAndSocketScopeClean','fullProtectedInventoryAndQueueVerified','oldOnceJournalUnchanged'].every(k=>v[k]===true)&&v.publishedTreePresent===false&&v.partialLinkClosureQualified===false&&v.immutableArtifactQualified===false&&v.remoteMutationsPerformed===false&&v.modelsInvoked===false&&H.test(v.actualObservation?.sha256??'')&&v.originalWork?.entries===47822&&v.originalWork.files===39397&&v.originalWork.bytes===497034759&&same(v.originalWork.identity,{device:66306,inode:8054874}),'R32_OWNER_ACTUAL_OLD_SCOPE_RECONCILIATION_REQUIRED');return v}
function frame(p,now){assertR29R4ProtectionProof(p,{fresh:true,now});return{sources:p.sources,terminal:p.terminal,nodeConfigSHA256:p.nodeConfigSHA256,profileSHA256:p.profileSHA256,baseTemplateSHA256:p.baseTemplateSHA256,otherCentralTemplatesSHA256:p.otherCentralTemplatesSHA256,otherNodeTemplatesSHA256:p.otherNodeTemplatesSHA256,oldImmutableInventorySHA256:p.oldImmutableInventorySHA256,fixedTools:p.fixedTools,installedSevenTools:p.installedSevenTools}}
export function assertArtifactOwnerR32R3Frame(v,q,readonly){const expectedUnit='jarvis-r32-artifact-r3-'+q.nonce+'-owner.service';need(v?.schemaVersion===1&&v.kind==='r32-artifact-owner-observation-r3'&&v.nonce===q.nonce&&v.workerSHA256===q.workerSHA256&&v.activationSHA256===q.activationSHA256&&v.dispatchSubmitted===true&&v.readOnly===readonly&&v.unit?.Id===expectedUnit&&['active','activating','deactivating','inactive','failed'].includes(v.unit.ActiveState)&&v.actualFrozenArtifact===false&&v.artifactIndependentlyVerified===false&&v.productAccepted===false&&v.packageCodeExecuted===false&&v.modelsInvoked===false,'R32_OWNER_ACTUAL_FRAME_CHANGED');if(v.owner){const o=v.owner;need(o.unit===expectedUnit&&o.controlGroup==='/system.slice/'+expectedUnit&&Number.isSafeInteger(o.pid)&&o.pid>1&&/^[0-9]+$/.test(o.startTicks??'')&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(o.boot??'')&&o.runtimeMaxSec===900&&o.stopTimeoutSec===120&&o.killMode==='control-group'&&o.restart==='no'&&o.workerSHA256===q.workerSHA256&&o.activationSHA256===q.activationSHA256,'R32_OWNER_ACTUAL_IDENTITY_UNKNOWN');}if(q.ownerIdentityKnown)need(v.owner&&same(v.owner,q.owner),'R32_OWNER_FROZEN_IDENTITY_CHANGED');return v}
export function artifactOwnerR32R3HostProgram(){return String.raw`
import base64,hashlib,json,os,re,stat,subprocess,time,types,signal
from pathlib import Path
S=json.loads('${JSON.stringify(S)}')
def need(v,c):
 if not v:raise RuntimeError(c)
def sha(v):return hashlib.sha256(v).hexdigest()
def key(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
need(os.geteuid()==os.getegid()==0 and p['scope']==S and p['action'] in ['start','check'] and re.fullmatch('[a-f0-9]{32}',p['nonce']) and p['nonce']!=S['oldNonce'] and re.fullmatch('[a-f0-9]{64}',p['workerSHA256']),'R32_OWNER_HOST_FIXED_SCOPE_REQUIRED')
signal.signal(signal.SIGALRM,lambda *_: (_ for _ in ()).throw(RuntimeError('R32_OWNER_HOST_TIME_LIMIT')));signal.alarm(110)
a=p['nonce'];root=Path(S['base'])/a;control=root/'control';worker=Path('/opt/jarvis-development/software-factory/factory-runtime-artifact-owner-r32-r3-'+p['workerSHA256'][:16]+'.py');unit='jarvis-r32-artifact-r3-'+a+'-owner.service'
def held(path):
 fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  for n in Path(path).parts[1:]:
   s=os.stat(n,dir_fd=fd,follow_symlinks=False);need(stat.S_ISDIR(s.st_mode) and s.st_uid==s.st_gid==0 and not s.st_mode&0o022,'R32_OWNER_HOST_PARENT_UNTRUSTED');child=os.open(n,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
   try:need(key(s)==key(os.fstat(child)),'R32_OWNER_HOST_PARENT_CHANGED')
   except BaseException:os.close(child);raise
   os.close(fd);fd=child
  return fd
 except BaseException:os.close(fd);raise
def read(path,limit=64*1024**2):
 d=held(path.parent)
 try:
  s=os.stat(path.name,dir_fd=d,follow_symlinks=False);need(stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and not s.st_mode&0o022 and s.st_size<=limit,'R32_OWNER_HOST_FILE_UNTRUSTED');f=os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=d)
  try:
   need(key(s)==key(os.fstat(f)),'R32_OWNER_HOST_FILE_CHANGED');body=b''
   while len(body)<=s.st_size:
    block=os.read(f,min(65536,s.st_size+1-len(body)))
    if not block:break
    body+=block
   need(len(body)==s.st_size and key(s)==key(os.fstat(f))==key(os.stat(path.name,dir_fd=d,follow_symlinks=False)),'R32_OWNER_HOST_FILE_CHANGED');return body
  finally:os.close(f)
 finally:os.close(d)
def store(path,body,mode=0o600):
 d=held(path.parent)
 try:
  f=os.open(path.name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode,dir_fd=d)
  try:
   view=memoryview(body)
   while view:
    n=os.write(f,view);need(type(n)is int and 0<n<=len(view),'R32_OWNER_HOST_SHORT_WRITE');view=view[n:]
   os.fchmod(f,mode);os.fsync(f)
  finally:os.close(f)
  os.fsync(d)
 finally:os.close(d)
env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'}
if p['action']=='start':
 core_raw=base64.b64decode(p['files']['r2-byte-controller.py']['base64'],validate=True);need(sha(core_raw)==S['core']['sha256'],'R32_OWNER_HOST_ORIGINAL_CORE_CHANGED');core=types.ModuleType('r32_old_partial_inventory_only');exec(compile(core_raw,'<reviewed-partial-byte-reader>','exec'),core.__dict__)
 old_raw=base64.b64decode(p['files']['reconciliation-evidence.json']['base64'],validate=True);need(sha(old_raw)==p['files']['reconciliation-evidence.json']['sha256'],'R32_OWNER_HOST_RECONCILIATION_CHANGED');old_expected=json.loads(old_raw)['partialAttempt']
 def old_partial():
  chain=core.open_chain(S['artifactBase']+'/'+S['oldNonce']);link_check=core.validate_input_links
  try:
   core.validate_input_links=lambda _:None
   result=core.double_scan(chain[-1][0]);core.check_chain(chain);return result
  finally:core.validate_input_links=link_check;core.close_chain(chain)
 old_before=old_partial();need(old_before==old_expected,'R32_OWNER_OLD_PARTIAL_CHANGED_BEFORE_DISPATCH')
 prior=subprocess.run(['/usr/bin/systemctl','show',unit,'--property=Id,LoadState,ActiveState,MainPID,ControlGroup'],capture_output=True,text=True,timeout=10,env=env);need(prior.returncode==0,'R32_OWNER_PRIOR_UNIT_READ_FAILED');pv=dict(x.split('=',1) for x in prior.stdout.splitlines() if '=' in x);need(pv.get('Id')==unit and pv.get('LoadState')=='not-found' and pv.get('ActiveState')=='inactive' and pv.get('MainPID')=='0' and pv.get('ControlGroup')=='','R32_OWNER_PRIOR_UNIT_NOT_EMPTY')
 need(not os.path.lexists(root),'R32_OWNER_EXISTING_ATTEMPT_USE_CHECK');body=base64.b64decode(p['workerBase64'],validate=True);need(sha(body)==p['workerSHA256'] and len(body)<=150000,'R32_OWNER_HOST_WORKER_CHANGED');d=held(worker.parent);os.close(d)
 # Caller intent is already durable. Root only installs reviewed byte controls.
 if os.path.lexists(worker):need(read(worker,150000)==body,'R32_OWNER_HOST_WORKER_CONFLICT')
 else:store(worker,body,0o444)
 base=Path(S['base']);d=held(base.parent);os.close(d)
 if not os.path.lexists(base):base.mkdir(mode=0o700);d=held(base.parent);os.fsync(d);os.close(d)
 d=held(base);need(stat.S_IMODE(os.fstat(d).st_mode)==0o700,'R32_OWNER_HOST_NAMESPACE_MODE');root.mkdir(mode=0o700);os.fsync(d);os.close(d);control.mkdir(mode=0o700);d=held(root);os.fsync(d);os.close(d)
 expected={'activation.json','r2-byte-controller.py','request.json','reconciliation.json','reconciliation-evidence.json','protection.json','review.json'};need(set(p['files'])==expected,'R32_OWNER_HOST_CONTROL_SET_CHANGED')
 for name,transport in p['files'].items():
  b=base64.b64decode(transport['base64'],validate=True);need(sha(b)==transport['sha256'],'R32_OWNER_HOST_CONTROL_BYTES_CHANGED');store(control/name,b,0o444 if name=='r2-byte-controller.py' else 0o600)
 activation=json.loads(read(control/'activation.json',32768));need(activation['workerSHA256']==p['workerSHA256'] and activation['nonce']==a and sha(read(control/'r2-byte-controller.py',150000))==S['core']['sha256'],'R32_OWNER_HOST_ACTIVATION_CHANGED')
 stop='/usr/bin/python3 '+str(worker)+' --owner-stopped '+a
 store(root/'owner.private.log',b'')
 r=subprocess.run(['/usr/bin/systemd-run','--quiet','--collect','--unit='+unit,'--property=RuntimeMaxSec=900','--property=TimeoutStopSec=120','--property=KillMode=control-group','--property=Restart=no','--property=StandardOutput=null','--property=StandardError=append:'+str(root/'owner.private.log'),'--property=ExecStopPost='+stop,'/usr/bin/python3',str(worker),'--run',a],capture_output=True,timeout=15,env=env);need(r.returncode==0,'R32_OWNER_SYSTEMD_START_UNCERTAIN')
 for _ in range(100):
  if os.path.lexists(root/'owner.json') or os.path.lexists(root/'lifecycle.json'):break
  time.sleep(.1)
 need(old_partial()==old_before,'R32_OWNER_OLD_PARTIAL_CHANGED_AFTER_DISPATCH')
else:need(sha(read(worker,150000))==p['workerSHA256'],'R32_OWNER_HOST_WORKER_CHANGED')
activation_raw=read(control/'activation.json',32768);need(sha(activation_raw)==p['activationSHA256'],'R32_OWNER_HOST_ACTIVATION_CHANGED')
values={};hashes={}
for name in ['owner.json','progress.json','result.json','lifecycle.json']:
 if os.path.lexists(root/name):
  raw=read(root/name);values[name]=json.loads(raw);hashes[name]=sha(raw)
r=subprocess.run(['/usr/bin/systemctl','show',unit,'--property=Id,LoadState,ActiveState,SubState,MainPID,ControlGroup,RuntimeMaxUSec,TimeoutStopUSec,KillMode,Restart,ExecStopPost'],capture_output=True,text=True,timeout=10,env=env);need(r.returncode==0,'R32_OWNER_HOST_UNIT_READ_INCOMPLETE');v=dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x);need(v.get('Id')==unit,'R32_OWNER_HOST_UNIT_CHANGED')
signal.alarm(0)
print(json.dumps({'schemaVersion':1,'kind':'r32-artifact-owner-observation-r3','nonce':a,'workerSHA256':p['workerSHA256'],'activationSHA256':sha(activation_raw),'owner':values.get('owner.json'),'progress':values.get('progress.json'),'result':values.get('result.json'),'lifecycle':values.get('lifecycle.json'),'hashes':hashes,'unit':v,'dispatchSubmitted':True,'actualFrozenArtifact':False,'artifactIndependentlyVerified':False,'packageCodeExecuted':False,'modelsInvoked':False,'productAccepted':False,'readOnly':p['action']=='check'},separators=(',',':')))
`;}
async function readRoot(p){const r=spawnSync('ssh',['-F',lanProfile,'-o','BatchMode=yes','jarvis-101','sudo -n python3 -'],{input:python(p,artifactOwnerR32R3HostProgram()),encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:64*1024**2});if(r.status!==0){const b=Buffer.from(JSON.stringify({status:r.status,signal:r.signal,stdout:r.stdout??'',stderr:r.stderr??'',errorCode:r.error?.code??null})+'\n'),path='.jarvis-dev/maintenance/r32-owner-r3-private-failure-'+Date.now()+'-'+randomUUID()+'.json';await wx(path,b);const code=/^(?:RuntimeError|ValueError): (R32_OWNER_[A-Z0-9_]+)$/.exec(String(r.stderr??'').trim().split(/\r?\n/).at(-1)??'')?.[1]??'R32_OWNER_HOST_READ_INCOMPLETE',e=Error(code);e.privateDiagnosticSHA256=hash(b);throw e}return r.stdout}
export async function startArtifactOwnerR32R3({action='inspect',activation=artifactOwnerR32R3Activation}={},deps={}){
 need(['inspect','start','check'].includes(action),'R32_OWNER_ACTION_INVALID');if(activation===null)return{schemaVersion:1,kind:'r32-artifact-owner-preparation-r3',ready:false,reason:'R32_OWNER_RECONCILIATION_AND_REVIEW_NOT_PINNED',journalCreated:false,remoteOperations:false,actualFrozenArtifact:false,modelsInvoked:false,productAccepted:false};
 const d={readLocal:artifactOwnerR32R3ReadLocal,readRoot,verifyProtection:verifyFactoryProtectionContractR29R2,writeWX:wx,save,acquire,release,receipt,now:Date.now,nonce:()=>randomBytes(16).toString('hex'),...deps};
 need(activation?.kind==='r32-byte-owner-reviewed-activation-r3'&&activation.remoteExecutionAuthorized===true&&H.test(activation.workerSHA256??'')&&H.test(activation.starterSHA256??'')&&['review','reconciliation','reconciliationEvidence'].every(k=>activation[k]?.path&&H.test(activation[k].sha256??'')),'R32_OWNER_REVIEWED_ACTIVATION_REQUIRED');
 const paths=[S.workerPath,S.starterPath,S.core.path,activation.review.path,activation.reconciliation.path,activation.reconciliationEvidence.path,runtimeArtifactR32R2Journal,references.index.path,'scripts/prepare-factory-runtime-artifact-r32-r2.mjs','scripts/verify-factory-lzma-archive-r32.mjs'];const raw=await settleEvidenceReads(paths.map(p=>()=>d.readLocal(p)));need(hash(raw[0])===activation.workerSHA256&&hash(raw[1])===activation.starterSHA256&&hash(raw[2])===S.core.sha256&&hash(raw[3])===activation.review.sha256&&hash(raw[4])===activation.reconciliation.sha256&&hash(raw[5])===activation.reconciliationEvidence.sha256&&hash(raw[7])===references.index.sha256&&hash(raw[8])==='9add1d79957a9ee6e3e219b9d23c014e86477655576177f0a019ed3967df7906'&&hash(raw[9])==='14c4535a24b221acaa0e115adbe4d67246c622cb17b8b2755c602fd5f036d231','R32_OWNER_LOCAL_PROVENANCE_CHANGED');
 const review=JSON.parse(raw[3]);need(review.workerSHA256===activation.workerSHA256&&review.starterSHA256===activation.starterSHA256&&review.staticPreparationReady===true&&review.remainingP0P1===0&&review.actualFrozenArtifact===false&&review.remoteOperations===false&&review.modelsInvoked===false,'R32_OWNER_INDEPENDENT_REVIEW_REQUIRED');const recon=assertArtifactOwnerR32R3Reconciliation(JSON.parse(raw[4]));need(recon.actualObservation.sha256===activation.reconciliationEvidence.sha256,'R32_OWNER_RECONCILIATION_EVIDENCE_CHANGED');
 const old=JSON.parse(raw[6]);need(old.nonce===S.oldNonce&&old.freezeAttemptedAt&&old.actualFrozenArtifact!==true&&old.inspection?.sha256===S.inputSHA256,'R32_OWNER_OLD_ATTEMPT_BINDING_CHANGED');const input=await d.readLocal(old.inspection.path);need(hash(input)===S.inputSHA256,'R32_OWNER_ORIGINAL_INSPECTION_BYTES_CHANGED');const inspection=JSON.parse(input),pkg=await readLockedLzmaPackageR32({readLocal:d.readLocal});
 if(action==='inspect')return{schemaVersion:1,kind:'r32-artifact-owner-preparation-r3',ready:true,staticInputsQualified:true,dispatchSubmitted:false,remoteOperations:false,actualFrozenArtifact:false,modelsInvoked:false,productAccepted:false};
 let lock,q;try{lock=await d.acquire();try{q=JSON.parse(await d.readLocal(JP))}catch(e){if(e.code!=='ENOENT')throw e}if(q)need(q.kind==='r32-artifact-byte-owner-once-r3'&&q.workerSHA256===activation.workerSHA256&&q.starterSHA256===activation.starterSHA256&&same(q.scope,S)&&N.test(q.nonce??'')&&q.nonce!==S.oldNonce&&q.automaticRetry===false,'R32_OWNER_JOURNAL_CHANGED');
 const before=await d.verifyProtection(),bound=frame(before,d.now());let p;
 if(action==='start'){
  need(typeof recon.at==='string'&&Number.isFinite(Date.parse(recon.at))&&d.now()-Date.parse(recon.at)>=-30000&&d.now()-Date.parse(recon.at)<300000,'R32_OWNER_ACTUAL_RECONCILIATION_STALE');
  need(!q,'R32_OWNER_PRIOR_INTENT_ONLY_CHECK');const nonce=d.nonce();need(N.test(nonce)&&nonce!==S.oldNonce,'R32_OWNER_NONCE_INVALID');const request={scope:inspection.scope,action:'freeze',nonce,sourceIndex:{_rawBase64:Buffer.from(raw[7]).toString('base64')},expectedInspection:{_rawBase64:Buffer.from(input).toString('base64')},programSHA256:activation.workerSHA256,packageSupplement:{contractRawBase64:pkg.contractBytes.toString('base64'),files:Object.fromEntries([...pkg.files].map(([k,b])=>[k,b.toString('base64')]))}};
  const requestRaw=Buffer.from(JSON.stringify(request)),protectionRaw=Buffer.from(JSON.stringify(before));const rootActivation={schemaVersion:1,kind:'r32-artifact-owner-exact-activation-r3',nonce,workerSHA256:activation.workerSHA256,coreSHA256:S.core.sha256,inputSHA256:S.inputSHA256,requestSHA256:hash(requestRaw),reconciliationSHA256:activation.reconciliation.sha256,reconciliationEvidenceSHA256:activation.reconciliationEvidence.sha256,protectionSHA256:hash(protectionRaw),reviewSHA256:activation.review.sha256},activationRaw=Buffer.from(JSON.stringify(rootActivation));
  q={schemaVersion:1,kind:'r32-artifact-byte-owner-once-r3',nonce,scope:S,workerSHA256:activation.workerSHA256,starterSHA256:activation.starterSHA256,activationSHA256:hash(activationRaw),reconciliationSHA256:activation.reconciliation.sha256,startAttemptedAt:new Date(d.now()).toISOString(),dispatchSubmitted:false,automaticRetry:false,receipts:{}};await d.writeWX(JP,JSON.stringify(q)+'\n');await d.save(q);const blobs={'activation.json':activationRaw,'r2-byte-controller.py':raw[2],'request.json':requestRaw,'reconciliation.json':raw[4],'reconciliation-evidence.json':raw[5],'protection.json':protectionRaw,'review.json':raw[3]};p={scope:S,action,nonce,workerSHA256:q.workerSHA256,activationSHA256:q.activationSHA256,workerBase64:Buffer.from(raw[0]).toString('base64'),files:Object.fromEntries(Object.entries(blobs).map(([k,b])=>[k,{sha256:hash(b),base64:Buffer.from(b).toString('base64')}]))};
 }else{need(q?.startAttemptedAt,'R32_OWNER_NO_ATTEMPT_USE_INSPECT');p={scope:S,action,nonce:q.nonce,workerSHA256:q.workerSHA256,activationSHA256:q.activationSHA256}}
 try{const rootRaw=await d.readRoot(p);need(typeof rootRaw==='string'||Buffer.isBuffer(rootRaw),'R32_OWNER_RAW_ROOT_REQUIRED');const v=assertArtifactOwnerR32R3Frame(JSON.parse(rootRaw),q,action==='check');const after=await d.verifyProtection();need(same(bound,frame(after,d.now())),'R32_OWNER_PROTECTION_CHANGED');const final=await settleEvidenceReads(paths.map(p=>()=>d.readLocal(p)));need(final.every((b,i)=>hash(b)===hash(raw[i])),'R32_OWNER_LOCAL_REFERENCES_CHANGED');q.dispatchSubmitted=true;q.lastObservationSHA256=hash(Buffer.from(rootRaw));q.owner=v.owner??null;q.ownerIdentityKnown=!!v.owner;const result={...v,ready:false,producerFrozenClaim:v.progress?.actualFrozenArtifact===true,actualFrozenArtifact:false,artifactIndependentlyVerified:false};q.receipts[action]=await d.receipt(result,action);await d.save(q);return{...result,receipt:q.receipts[action]}}catch(e){q.uncertain=true;try{await d.save(q)}catch{}throw e}
 }finally{if(lock)await d.release(lock)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){let v;try{need(process.argv.length<=3,'R32_OWNER_ARGUMENTS_INVALID');v=await startArtifactOwnerR32R3({action:process.argv[2]??'inspect'})}catch(e){v={ready:false,errorCode:/^R32_OWNER_[A-Z0-9_]+$/.test(e.message)?e.message:'R32_OWNER_OPERATION_INCOMPLETE',privateDiagnosticSHA256:H.test(e.privateDiagnosticSHA256??'')?e.privateDiagnosticSHA256:null,automaticRetry:false,modelsInvoked:false,productAccepted:false};process.exitCode=1}console.log(JSON.stringify(v))}
