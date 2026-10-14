/** One finite independent PG-only installation. Product/API/DB tests are separate. */
import {readFile,open,mkdir,lstat,unlink,rename} from 'node:fs/promises';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {verifyFactoryProtectionContractR29R2} from './verify-factory-protection-contract-r29-r2.mjs';
import {assertR29R4ProtectionProof} from './start-factory-truth-gate-build-r29-r4.mjs';
const need=(v,c)=>{if(!v)throw Error(c)},H=/^[a-f0-9]{64}$/,A=/^[a-f0-9]{32}$/;
const hash=b=>createHash('sha256').update(b).digest('hex');
const identical=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function parsePGR29HostResult(raw){const v=typeof raw==='string'?JSON.parse(raw):raw;need(v&&typeof v==='object'&&!Array.isArray(v),'QA_PG_HOST_JSON_INVALID');return v;}
export const independentPGR29JournalPath='.jarvis-dev/maintenance/factory-r29-pg-runtime-once.json';
export const independentPGR29ActivationPath='.jarvis-dev/maintenance/factory-r29-pg-reviewed-activation.json';
export const independentPGR29Scope=Object.freeze({
 imageID:'sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96',
 worker:'scripts/factory-build-independent-pg-runtime-r29-r2.py',workerSHA256:'57eb441548b433620b3b244724bb50f27abdbf981b0d5f0e031623b70cfc4ae5',
 installedWorker:'/opt/jarvis-development/software-factory/factory-build-independent-pg-runtime-r29-r2-57eb441548b43362.py',
 freezer:'scripts/factory-freeze-independent-pg-runtime-r29.py',freezerSHA256:'09dd6ecef0ba1df906c1f938db8fa99cde4b8fccc2fa71bae8b281b9dc8a0dbb',
 root:'/var/lib/jarvis-development/101/r29-qa-pg-runtime',pgVersion:'8.23.0',
 candidate:{fingerprint:'4907e45a21799f2dd14ac2373769607f40d6b9e0319bb614fbe259b157e60493',files:621,metadataSHA256:'2da9d3e490fd6d042113c067807a89b000a4f40fdb5fa8d3ca2911b6615ebce8',identity:{device:66306,inode:6718050}},
 originalGoalsSHA256:'23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42',
 basisRefs:{
  sourceCheck:{path:'artifacts/software-factory/goals-r29/isolated-build-r4-check-1791829453458-fa802c0d-26fe-461a-8d31-b5f051e2a0e9.json',sha256:'f1dab15a255aaea43c3c34cd5d1a82e5855ad2e63fd60fc7017a7b495af8f0cc'},
  sourceCleanup:{path:'artifacts/software-factory/goals-r29/r4-independent-cleanup-with-evidence-1791829757472-94c01ac6-6d54-44f9-a1e2-f04621dda604.json',sha256:'324ed10f0efef0aeb29a6c03550c172a86c46072bc4bbeab93c931ffe629f610'},
  cacheReadback:{path:'artifacts/software-factory/goals-r29/independent-pg-cache-readback-1791830147231-e6bda46d-370d-4bc4-8913-a9cf80b8a0f3.json',sha256:'daeda9233ecd88defc7206c233c0fdbfc23a55b10cde6702bac6381b7622abe0'},
  historicalPreparation:{path:'artifacts/software-factory/goals-r29/pg-offline-runtime-corrections-independent-review-1791829438355-0cd7f554-97ce-4bd1-be7a-5b73513058f5.json',sha256:'ee7111341710660005699b190ca0231635d1d206d0a3008c39902dd4f77938e5'}},
 cacheContract:{path:'artifacts/software-factory/goals-r29/verified-pg-cache-reuse-contract-1791830236743-ae4e0030-8357-4298-8022-80566ae062fa.json',sha256:'464258e571628970a04363f19ec50a592959f9c3358fd501246de26e302b2b0f'},
 inputs:[{name:'package.json',path:'artifacts/software-factory/goals-r29/qa-pg-runtime-inputs/package.json',sha256:'e65f7af605df2b5c4b2ee136cb0571c46456eb1c1c99f921170b16511165a8ea'}, {name:'pnpm-lock.yaml',path:'artifacts/software-factory/goals-r29/qa-pg-runtime-inputs/pnpm-lock.yaml',sha256:'fc2139a36dad144908d17339dc7e125a1e535aa3cad1064d27fca2fa76d1ccaa'}],
});
const S=independentPGR29Scope,JP=independentPGR29JournalPath;
export function qualifyPGR29Review(v,starterSHA){
 need(v?.kind==='r29-pg-exact-activation-independent-local-review'&&v.workerSHA256===S.workerSHA256&&v.starterSHA256===starterSHA&&v.freezerSHA256===S.freezerSHA256&&v.remainingP0P1===0&&v.staticPreparationReady===true&&v.actualRuntimeReady===false&&v.modelsInvoked===false&&v.remoteOperations===false,'QA_PG_NEW_REVIEW_UNPROVEN');return v;
}
export function qualifyPGR29Activation(v,starterSHA){
 need(v?.schemaVersion===1&&v.kind==='r29-pg-reviewed-once-activation'&&v.starterSHA256===starterSHA&&v.workerSHA256===S.workerSHA256&&H.test(v.review?.sha256??'')&&/^artifacts\/software-factory\/goals-r29\/[a-zA-Z0-9_.-]+\.json$/.test(v.review?.path??'')&&H.test(v.cleanupReview?.sha256??'')&&/^artifacts\/software-factory\/goals-r29\/[a-zA-Z0-9_.-]+\.json$/.test(v.cleanupReview?.path??'')&&v.productAccepted===false&&v.actualRuntimeReady===false,'QA_PG_REVIEWED_ACTIVATION_UNAVAILABLE');return v;
}
async function privateRead(path){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size<=2000000,'QA_PG_PRIVATE_INPUT_INVALID');const raw=await readFile(path);const a=await lstat(path);need(s.dev===a.dev&&s.ino===a.ino&&s.size===raw.length&&s.mtimeMs===a.mtimeMs&&s.ctimeMs===a.ctimeMs,'QA_PG_PRIVATE_INPUT_CHANGED');return raw;}
async function writeWX(path,raw,mode=0o600){const f=await open(path,'wx',mode);try{await f.writeFile(raw);await f.sync();}finally{await f.close();}}
async function saveJournal(q){const tmp=JP+'.'+randomUUID()+'.tmp';await writeWX(tmp,JSON.stringify(q,null,2)+'\n');if(process.platform==='win32'){const r=spawnSync('python',['-c',"import ctypes,sys;f=ctypes.WinDLL('kernel32',use_last_error=True).MoveFileExW;f.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p,ctypes.c_ulong];f.restype=ctypes.c_int;sys.exit(0 if f(sys.argv[1],sys.argv[2],9) else 1)",resolve(tmp),resolve(JP)],{windowsHide:true,timeout:10000});need(r.status===0,'QA_PG_JOURNAL_SAVE_FAILED');}else{await rename(tmp,JP);const f=await open('.jarvis-dev/maintenance','r');try{await f.sync()}finally{await f.close()}}}
async function publicReceipt(value,prefix='independent-pg-runtime-start'){const path='artifacts/software-factory/goals-r29/'+prefix+'-'+Date.now()+'-'+randomUUID()+'.json';const raw=JSON.stringify(value,null,2)+'\n';await writeWX(path,raw,0o644);return {path,sha256:hash(raw)};}
async function acquireLock(){const path=JP+'.lock',fd=await open(path,'wx',0o600);return {path,fd};}
async function releaseLock(lock){const a=await lock.fd.stat(),b=await lstat(lock.path);need(a.dev===b.dev&&a.ino===b.ino,'QA_PG_START_LOCK_CHANGED');await lock.fd.close();await unlink(lock.path);}
export function independentPGR29HostProgram(){return String.raw`
import base64,hashlib,json,os,re,stat,subprocess,time,ast
from pathlib import Path
def need(v,c):
 if not v:raise RuntimeError(c)
def digest(x):return hashlib.sha256(x).hexdigest()
expected=json.loads('${JSON.stringify(S)}')
need(os.geteuid()==0 and p.get('scope')==expected and p.get('action') in ['start','check'] and re.fullmatch('[a-f0-9]{32}',p.get('attempt','')),'QA_PG_START_SCOPE_CHANGED')
s=p['scope'];attempt=p['attempt'];root=Path(s['root']);private=root/attempt;control=private/'control';worker=Path(s['installedWorker'])
def trusted(path):
 for q in [path,*path.parents]:
  v=q.lstat();need(not stat.S_ISLNK(v.st_mode) and v.st_uid==0 and v.st_gid==0 and not v.st_mode&0o022,'QA_PG_START_ROOT_CHAIN_UNTRUSTED')
def read(path):
 trusted(path);f=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  v=os.fstat(f);need(stat.S_ISREG(v.st_mode) and v.st_nlink==1 and v.st_size<=2000000,'QA_PG_START_FILE_INVALID');raw=b''
  while len(raw)<=2000000:
   block=os.read(f,min(65536,2000001-len(raw)))
   if not block:break
   raw+=block
  a=os.fstat(f);need(len(raw)==v.st_size and (v.st_dev,v.st_ino,v.st_size,v.st_mtime_ns,v.st_ctime_ns)==(a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns),'QA_PG_START_FILE_CHANGED');return raw
 finally:os.close(f)
def store(path,raw,mode=0o600):
 trusted(path.parent);fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 try:
  view=memoryview(raw)
  while view:
   n=os.write(fd,view);need(n>0,'QA_PG_START_WRITE_FAILED');view=view[n:]
  os.fchmod(fd,mode);os.fsync(fd)
 finally:os.close(fd)
 f=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(f)
 finally:os.close(f)
if p['action']=='start':
 need(not os.path.lexists(private),'QA_PG_DUPLICATE_ATTEMPT_USE_CHECK');trusted(root.parent)
 if not os.path.lexists(root):root.mkdir(mode=0o700)
 trusted(root);need(stat.S_IMODE(root.lstat().st_mode)==0o700,'QA_PG_START_ROOT_NOT_PRIVATE')
 body=base64.b64decode(p['workerBase64'],validate=True);need(digest(body)==s['workerSHA256'],'QA_PG_START_WORKER_CHANGED');trusted(worker.parent)
 if os.path.lexists(worker):need(read(worker)==body,'QA_PG_START_WORKER_CONFLICT')
 else:store(worker,body,0o444)
 files={k:base64.b64decode(v,validate=True) for k,v in p['controlFiles'].items()}
 need(set(files)=={'activation.json','r29-qa-pg-build-review.json','r29-qa-pg-cache-contract.json','r29-qa-pg-cache-readback.json','r29-qa-pg-protection-proof.json','factory-freeze-independent-pg-runtime-r29.py','r29-qa-pg-inputs/package.json','r29-qa-pg-inputs/pnpm-lock.yaml'},'QA_PG_START_CONTROL_SET_CHANGED')
 activation=json.loads(files['activation.json']);need(activation['attempt']==attempt and activation['workerSHA256']==s['workerSHA256'],'QA_PG_START_ACTIVATION_CHANGED')
 need(digest(files['activation.json'])==p['activationSHA256'] and digest(files['r29-qa-pg-build-review.json'])==activation['pins']['reviewSHA256'] and digest(files['r29-qa-pg-cache-contract.json'])==s['cacheContract']['sha256'] and digest(files['r29-qa-pg-cache-readback.json'])==s['basisRefs']['cacheReadback']['sha256'] and digest(files['r29-qa-pg-protection-proof.json'])==activation['pins']['protectionSHA256'] and digest(files['factory-freeze-independent-pg-runtime-r29.py'])==s['freezerSHA256'],'QA_PG_START_CONTROL_BYTES_CHANGED')
 for item in s['inputs']:need(digest(files['r29-qa-pg-inputs/'+item['name']])==item['sha256'],'QA_PG_START_INPUT_CHANGED')
 private.mkdir(mode=0o700);control.mkdir(mode=0o700);(control/'r29-qa-pg-inputs').mkdir(mode=0o700)
 for name,raw in files.items():store(control/name,raw)
 result=subprocess.run(['/usr/bin/python3',str(worker),'--launch',attempt],capture_output=True,timeout=150,env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8'})
 need(result.returncode==0,'QA_PG_START_LAUNCH_AMBIGUOUS_USE_CHECK');launch=json.loads(result.stdout);need(launch.get('dispatched') is True and launch.get('attempt')==attempt,'QA_PG_START_LAUNCH_RECEIPT_INVALID')
else:
 need(read(worker) and digest(read(worker))==s['workerSHA256'],'QA_PG_CHECK_WORKER_CHANGED')
 trusted(private);trusted(control);files={}
 for name in ['activation.json','r29-qa-pg-build-review.json','r29-qa-pg-cache-contract.json','r29-qa-pg-cache-readback.json','r29-qa-pg-protection-proof.json','factory-freeze-independent-pg-runtime-r29.py','r29-qa-pg-inputs/package.json','r29-qa-pg-inputs/pnpm-lock.yaml']:files[name]=read(control/name)
 activation=json.loads(files['activation.json'])
need(activation.get('attempt')==attempt and activation.get('workerSHA256')==s['workerSHA256'],'QA_PG_START_ACTIVATION_CHANGED')
once=read(private/'once.json');o=json.loads(once);need(o.get('attempt')==attempt and o.get('workerSHA256')==s['workerSHA256'] and o.get('automaticRetry') is False,'QA_PG_START_ONCE_CHANGED')
state_path=private/'state.json';deadline=time.monotonic()+15
while not os.path.lexists(state_path) and time.monotonic()<deadline:time.sleep(0.1)
state_raw=read(state_path) if os.path.lexists(state_path) else None
state=json.loads(state_raw) if state_raw is not None else None
unit='jarvis-qa-pg-r29-'+attempt+'-owner.service'
unitread=subprocess.run(['/usr/bin/systemctl','show',unit,'--property=ActiveState,MainPID,ControlGroup,RuntimeMaxUSec,TimeoutStopUSec,KillMode,Restart'],capture_output=True,text=True,timeout=10,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'})
need(unitread.returncode==0,'QA_PG_START_OWNER_READ_FAILED');unitvalues=dict(x.split('=',1) for x in unitread.stdout.splitlines() if '=' in x)
owned=state.get('owner') if isinstance(state,dict) else None
need(isinstance(owned,dict) and owned.get('unit')==unit and isinstance(owned.get('pid'),int) and owned['pid']>1 and re.fullmatch('[0-9]+',owned.get('startTicks','')) and re.fullmatch('[a-f0-9-]{36}',owned.get('boot','')) and owned.get('controlGroup')=='/system.slice/'+unit and owned.get('runtimeMaxSec')==900 and owned.get('stopTimeoutSec')==120 and owned.get('killMode')=='control-group' and owned.get('restart')=='no','QA_PG_START_OWNER_RECEIPT_UNKNOWN_USE_CHECK')
inventory={k:digest(v) for k,v in files.items()};inventory_sha=digest(json.dumps(inventory,sort_keys=True,separators=(',',':')).encode())
print(json.dumps({'schemaVersion':1,'kind':'software-factory-r29-independent-pg-runtime-start','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'attempt':attempt,'dispatched':True,'ownerUnit':unit,'owner':owned,'unitObservation':unitvalues,'activationSHA256':digest(files['activation.json']),'onceIntentSHA256':digest(once),'workerSHA256':s['workerSHA256'],'controlInventorySHA256':inventory_sha,'controlFiles':inventory,'sourceScope':s['candidate'],'stateSHA256':digest(state_raw),'status':state.get('status'),'containerID':state.get('containerID'),'containerStopped':state.get('containerStopped'),'containerExitCode':state.get('containerExitCode'),'privateLogBytes':state.get('privateLogBytes'),'privateLogSHA256':state.get('privateLogSHA256'),'cleanupClaimOnly':state.get('cleanupClaimsComplete'),'runtimeReady':False,'runtimeFrozen':False,'productAccepted':False,'productCodeExecuted':False,'modelsInvoked':False,'automaticRetry':False,'rawLogsExported':False,'readOnly':p['action']=='check'}))
`;}
export async function runIndependentPGR29(action='inspect',deps={}){
 const d={readLocal:privateRead,writeWX,saveJournal,publicReceipt,acquireLock,releaseLock,now:Date.now,nonce:()=>randomBytes(16).toString('hex'),protection:verifyFactoryProtectionContractR29R2,readRoot:(p,b)=>remote(lanProfile,'jarvis-101',python(p,b),true,{timeoutMs:180000}),...deps};
 need(['inspect','start','check'].includes(action),'QA_PG_START_ACTION_INVALID');
 const self=await d.readLocal('scripts/start-factory-independent-pg-runtime-r29.mjs'),starterSHA=hash(self);
 let gate;try{gate=qualifyPGR29Activation(JSON.parse(await d.readLocal(independentPGR29ActivationPath)),starterSHA);}catch(e){if(action==='inspect')return {ready:false,kind:'r29-independent-pg-once-preparation',reviewedActivationPresent:false,actualManifestPin:null,runtimeReady:false,productAccepted:false,modelsInvoked:false};throw e;}
 const reviewRaw=await d.readLocal(gate.review.path);need(hash(reviewRaw)===gate.review.sha256,'QA_PG_NEW_REVIEW_CHANGED');qualifyPGR29Review(JSON.parse(reviewRaw),starterSHA);
 const cleanupReview=await d.readLocal(gate.cleanupReview.path);need(hash(cleanupReview)===gate.cleanupReview.sha256,'QA_PG_CLEANUP_REVIEW_CHANGED');const cr=JSON.parse(cleanupReview);need(cr.remainingP0P1===0&&cr.workerSHA256===S.workerSHA256&&cr.staticPreparationReady===true&&cr.actualRuntimeReady===false,'QA_PG_CLEANUP_REVIEW_UNPROVEN');
 if(action==='inspect')return {ready:true,kind:'r29-independent-pg-once-preparation',reviewedActivationPresent:true,actualManifestPin:null,runtimeReady:false,productAccepted:false,modelsInvoked:false};
 if(action==='check'){
  const q=JSON.parse(await d.readLocal(JP));need(q.kind==='r29-independent-pg-runtime-once-journal'&&A.test(q.attempt)&&identical(q.immutableScope,S)&&q.startIntentAt&&q.starterSHA256===starterSHA,'QA_PG_CHECK_CONTEXT_CHANGED');
  const value=parsePGR29HostResult(await d.readRoot({scope:S,action:'check',attempt:q.attempt},independentPGR29HostProgram()));need(value.kind==='software-factory-r29-independent-pg-runtime-start'&&value.attempt===q.attempt&&value.activationSHA256===q.activationSHA256&&value.workerSHA256===S.workerSHA256&&value.readOnly===true&&H.test(value.onceIntentSHA256??'')&&H.test(value.controlInventorySHA256??''),'QA_PG_CHECK_ACTUAL_CONTEXT_CHANGED');
  if(q.startUncertain===true&&q.dispatched===false){const observed={...value,reconciledFromCheck:true};q.dispatched=true;q.reconciledFromCheck=true;q.receipts.start=await d.publicReceipt(observed);q.owner=value.owner;q.onceIntentSHA256=value.onceIntentSHA256;q.controlInventorySHA256=value.controlInventorySHA256;await d.saveJournal(q);return {...observed,receipt:q.receipts.start};}
  return {...value,receipt:await d.publicReceipt(value,'independent-pg-runtime-check')};
 }
 const lock=await d.acquireLock();
 try{
  try{await d.readLocal(JP);throw Error('QA_PG_ONCE_ALREADY_INTENDED_USE_CHECK')}catch(e){if(e.code!=='ENOENT')throw e;}
  const raws={};for(const [key,ref] of Object.entries(S.basisRefs)){const raw=await d.readLocal(ref.path);need(hash(raw)===ref.sha256,'QA_PG_START_BASIS_CHANGED');raws[key]=raw;}
  const cache=JSON.parse(raws.cacheReadback);need(cache.cacheClosureIndependentlyVerified===true&&cache.twoFullReads===true&&cache.ready===true&&cache.runtimeReady===false,'QA_PG_START_CACHE_NOT_INDEPENDENT');
  const proof=await d.protection();assertR29R4ProtectionProof(proof,{fresh:true,now:d.now()});const proofRaw=JSON.stringify(proof,null,2)+'\n';
  const attempt=d.nonce();need(A.test(attempt),'QA_PG_START_NONCE_INVALID');
  const worker=await d.readLocal(S.worker),freezer=await d.readLocal(S.freezer),contract=await d.readLocal(S.cacheContract.path);need(hash(worker)===S.workerSHA256&&hash(freezer)===S.freezerSHA256&&hash(contract)===S.cacheContract.sha256,'QA_PG_START_PREPARATION_BYTES_CHANGED');
  const activation={schemaVersion:1,kind:'r29-independent-pg-exact-activation',attempt,workerSHA256:S.workerSHA256,pgVersion:S.pgVersion,imageID:S.imageID,candidate:S.candidate,originalGoalsSHA256:S.originalGoalsSHA256,basisRefs:S.basisRefs,pins:{reviewSHA256:gate.review.sha256,cacheContractSHA256:S.cacheContract.sha256,cacheReadbackSHA256:S.basisRefs.cacheReadback.sha256,protectionSHA256:hash(proofRaw),freezerSHA256:S.freezerSHA256}};
  const activationRaw=JSON.stringify(activation,null,2)+'\n',files={'activation.json':activationRaw,'r29-qa-pg-build-review.json':reviewRaw,'r29-qa-pg-cache-contract.json':contract,'r29-qa-pg-cache-readback.json':raws.cacheReadback,'r29-qa-pg-protection-proof.json':proofRaw,'factory-freeze-independent-pg-runtime-r29.py':freezer};
  for(const x of S.inputs){const raw=await d.readLocal(x.path);need(hash(raw)===x.sha256,'QA_PG_START_INPUT_CHANGED');files['r29-qa-pg-inputs/'+x.name]=raw;}
  const q={schemaVersion:1,kind:'r29-independent-pg-runtime-once-journal',attempt,immutableScope:S,starterSHA256:starterSHA,review:gate.review,cleanupReview:gate.cleanupReview,activationSHA256:hash(activationRaw),startIntentAt:new Date(d.now()).toISOString(),dispatched:false,automaticRetry:false,modelsInvoked:false,productAccepted:false,runtimeReady:false,receipts:{}};
  await d.writeWX(JP,JSON.stringify(q,null,2)+'\n'); // Exclusive once creation.
  await d.saveJournal(q); // Parent fsync / Windows write-through before mutation.
  try{
   assertR29R4ProtectionProof(proof,{fresh:true,now:d.now()});const value=parsePGR29HostResult(await d.readRoot({scope:S,action:'start',attempt,workerBase64:Buffer.from(worker).toString('base64'),activationSHA256:q.activationSHA256,controlFiles:Object.fromEntries(Object.entries(files).map(([k,b])=>[k,Buffer.from(b).toString('base64')]))},independentPGR29HostProgram()));
   need(value.kind==='software-factory-r29-independent-pg-runtime-start'&&value.attempt===attempt&&value.dispatched===true&&value.activationSHA256===q.activationSHA256&&value.workerSHA256===S.workerSHA256&&H.test(value.onceIntentSHA256??'')&&H.test(value.controlInventorySHA256??''),'QA_PG_START_ACTUAL_RECEIPT_UNKNOWN_USE_CHECK');
   q.dispatched=true;q.receipts.start=await d.publicReceipt(value);q.owner=value.owner;q.onceIntentSHA256=value.onceIntentSHA256;q.controlInventorySHA256=value.controlInventorySHA256;await d.saveJournal(q);return {...value,receipt:q.receipts.start};
  }catch(e){q.startUncertain=true;q.errorCode=/^QA_PG_[A-Z0-9_]+$/.test(e.message)?e.message:'QA_PG_START_UNKNOWN_USE_CHECK';await d.saveJournal(q);throw Error(q.errorCode);}
 }finally{await d.releaseLock(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{need(process.argv.length<=3,'QA_PG_START_ARGUMENTS_INVALID');const r=await runIndependentPGR29(process.argv[2]??'inspect');console.log(JSON.stringify(r));}catch(e){console.log(JSON.stringify({ready:false,errorCode:/^QA_PG_[A-Z0-9_]+$/.test(e.message)?e.message:'QA_PG_START_NOT_READY',automaticRetry:false,runtimeReady:false,productAccepted:false,modelsInvoked:false}));process.exitCode=1;}}
