/** New finite CJS stage. Default inspect is inert; operator needs explicit start. */
import {open,rename,lstat,unlink} from 'node:fs/promises';import {createHash,randomBytes,randomUUID} from 'node:crypto';import {spawnSync} from 'node:child_process';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {safeReadLocal} from './factory-repair-evidence-read-r26.mjs';import {remote,lanProfile,python} from './managed-server-client.mjs';import {verifyFactoryProtectionContractR29R2} from './verify-factory-protection-contract-r29-r2.mjs';import {assertR29R4ProtectionProof} from './start-factory-truth-gate-build-r29-r4.mjs';
const need=(v,c)=>{if(!v)throw Error(c)},hash=b=>createHash('sha256').update(b).digest('hex'),H=/^[a-f0-9]{64}$/;
export function parseCjsHostFrame(raw){const v=typeof raw==='string'?JSON.parse(raw):raw;need(v&&typeof v==='object'&&!Array.isArray(v),'QA_CJS_HOST_FRAME_INVALID');return v;}
export const pgCjsR29JournalPath='.jarvis-dev/maintenance/factory-r29-pg-cjs-once.json';
export const pgCjsR29GatePath='.jarvis-dev/maintenance/factory-r29-pg-cjs-reviewed-activation.json';
export const pgCjsR29Scope=Object.freeze({root:'/var/lib/jarvis-development/101/r29-qa-pg-cjs',worker:'scripts/factory-independent-pg-cjs-worker-r29.py',workerSHA256:'0f35d224c8540f7708ec9503dd5e2c5c71bdf02401676d374902ca38e109d04a',installedWorker:'/opt/jarvis-development/software-factory/factory-independent-pg-cjs-worker-r29-0f35d224c8540f77.py',librarySHA256:'57eb441548b433620b3b244724bb50f27abdbf981b0d5f0e031623b70cfc4ae5',imageID:'sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96',runtimeRoot:'/var/lib/jarvis-development/101/r29-qa-pg-runtime/3c7ade1178fc47184cd9aaba9e84b855/runtime',manifestSHA256:'d916c96e199ab7230a6397cd1f4f6fdbceacf30588a16b6943dc8da2996b6eb1',metadataSHA256:'3fee74b974414acce00e557f3d598f0c881f38717465ebd3abfff12d4b3345ca',fullByteProof:{path:'artifacts/software-factory/goals-r29/independent-pg-frozen-byte-readback-1791832825523-d6b400bf-45c8-4bef-908a-d7da8256ca70.json',sha256:'6ecc84270d932d63a5c980e34d345da6de63018e531c4cb3805765218e42f8a4'},tools:[{name:'consumer.mjs',path:'scripts/factory-independent-pg-cjs-consumer-r29.mjs',sha256:'45d888de21d3221a66d43d7d601de358338892f26d3d14c9b1ddb5dd32850c99'},{name:'qualify.mjs',path:'scripts/factory-independent-pg-cjs-qualify-r29.mjs',sha256:'319acc6d1c767eaf90b12e560c7949aa4255ca836ac38469f66149f4b20f6e1a'},{name:'outside.cjs',path:'scripts/factory-independent-pg-cjs-outside-r29.cjs',sha256:'0e626b0f106fe3a80f34af11b5f3831a8afe1ee8ad8e407df05e0c9bd1ad12d8'}]});
const S=pgCjsR29Scope,JP=pgCjsR29JournalPath;
async function writeWX(path,raw,mode=0o600){const f=await open(path,'wx',mode);try{await f.writeFile(raw);await f.sync()}finally{await f.close()}}
async function save(q){const t=JP+'.'+randomUUID()+'.tmp';await writeWX(t,JSON.stringify(q,null,2)+'\n');if(process.platform==='win32'){const r=spawnSync('python',['-c',"import ctypes,sys;f=ctypes.WinDLL('kernel32',use_last_error=True).MoveFileExW;f.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p,ctypes.c_ulong];f.restype=ctypes.c_int;sys.exit(0 if f(sys.argv[1],sys.argv[2],9) else 1)",resolve(t),resolve(JP)],{windowsHide:true,timeout:10000});need(r.status===0,'QA_CJS_LOCAL_DURABILITY_FAILED')}else{await rename(t,JP);const f=await open('.jarvis-dev/maintenance','r');try{await f.sync()}finally{await f.close()}}}
async function lock(){const path=JP+'.lock',fd=await open(path,'wx',0o600);return {path,fd}}
async function unlock(v){const a=await v.fd.stat(),b=await lstat(v.path);need(a.dev===b.dev&&a.ino===b.ino,'QA_CJS_LOCK_CHANGED');await v.fd.close();await unlink(v.path)}
async function receipt(r,prefix='independent-pg-cjs-start'){const path='artifacts/software-factory/goals-r29/'+prefix+'-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(r,null,2)+'\n';await writeWX(path,raw,0o644);return {path,sha256:hash(raw)}}
export function pgCjsR29HostProgram(){return String.raw`
import os,stat,json,hashlib,base64,subprocess,time,re
from pathlib import Path
def need(v,c):
 if not v:raise RuntimeError(c)
def digest(b):return hashlib.sha256(b).hexdigest()
expected=json.loads('${JSON.stringify(S)}');need(os.geteuid()==0 and p['scope']==expected and p['action'] in ['start','check'] and re.fullmatch('[a-f0-9]{32}',p['attempt']),'QA_CJS_START_SCOPE_CHANGED')
s=p['scope'];a=p['attempt'];root=Path(s['root']);private=root/a;control=private/'control';tools=private/'tools';worker=Path(s['installedWorker'])
def read(path,limit=2000000):
 parent=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 def key(v):return [v.st_dev,v.st_ino,v.st_uid,v.st_gid,v.st_mode,v.st_nlink,v.st_size,v.st_mtime_ns,v.st_ctime_ns]
 try:
  for part in path.parts[1:-1]:
   b=os.stat(part,dir_fd=parent,follow_symlinks=False);need(stat.S_ISDIR(b.st_mode) and b.st_uid==b.st_gid==0 and not b.st_mode&0o022,'QA_CJS_START_PARENT_UNTRUSTED');n=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
   try:need(key(b)==key(os.fstat(n)),'QA_CJS_START_PARENT_CHANGED')
   except BaseException:os.close(n);raise
   os.close(parent);parent=n
  b=os.stat(path.name,dir_fd=parent,follow_symlinks=False);fd=os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
  try:
   v=os.fstat(fd);need(key(b)==key(v) and stat.S_ISREG(v.st_mode) and v.st_uid==v.st_gid==0 and not v.st_mode&0o022 and v.st_nlink==1 and v.st_size<=limit,'QA_CJS_START_FILE_UNTRUSTED');raw=b''
   while len(raw)<=limit:
    block=os.read(fd,min(65536,limit+1-len(raw)))
    if not block:break
    raw+=block
   need(len(raw)==v.st_size and key(v)==key(os.fstat(fd))==key(os.stat(path.name,dir_fd=parent,follow_symlinks=False)),'QA_CJS_START_FILE_CHANGED');return raw
  finally:os.close(fd)
 finally:os.close(parent)
def trusted(path):
 for q in [path,*path.parents]:
  v=q.lstat();need(stat.S_ISDIR(v.st_mode) and v.st_uid==v.st_gid==0 and not v.st_mode&0o022,'QA_CJS_START_DIRECTORY_UNTRUSTED')
def store(path,raw,mode=0o600):
 trusted(path.parent);f=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 try:
  view=memoryview(raw)
  while view:
   n=os.write(f,view);need(n>0,'QA_CJS_START_SHORT_WRITE');view=view[n:]
  os.fchmod(f,mode);os.fsync(f)
 finally:os.close(f)
 f=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(f)
 finally:os.close(f)
if p['action']=='start':
 need(not os.path.lexists(private),'QA_CJS_DUPLICATE_ATTEMPT_USE_CHECK');body=base64.b64decode(p['workerBase64'],validate=True);need(len(body)<100000 and digest(body)==s['workerSHA256'],'QA_CJS_START_WORKER_CHANGED');trusted(worker.parent)
 if os.path.lexists(worker):need(read(worker)==body,'QA_CJS_START_WORKER_CONFLICT')
 else:store(worker,body,0o444)
 trusted(root.parent)
 if not os.path.lexists(root):root.mkdir(mode=0o700)
 trusted(root);need(stat.S_IMODE(root.lstat().st_mode)==0o700,'QA_CJS_START_ROOT_MODE');private.mkdir(mode=0o700);control.mkdir(mode=0o700);tools.mkdir(mode=0o700)
 review=base64.b64decode(p['reviewBase64'],validate=True);protection=base64.b64decode(p['protectionBase64'],validate=True);need(digest(review)==p['reviewSHA256'] and digest(protection)==p['protectionSHA256'],'QA_CJS_START_INPUT_CHANGED')
 paths={'consumer.mjs':s['tools'][0]['sha256'],'qualify.mjs':s['tools'][1]['sha256'],'outside.cjs':s['tools'][2]['sha256'],'r29-qa-runtime-manifest.json':s['manifestSHA256']}
 need(set(p['toolFiles'])==set(paths)-{'r29-qa-runtime-manifest.json'},'QA_CJS_START_TOOLS_SET_CHANGED')
 for item in s['tools']:
  raw=base64.b64decode(p['toolFiles'][item['name']],validate=True);need(digest(raw)==item['sha256'],'QA_CJS_START_TOOL_BYTES_CHANGED');store(tools/item['name'],raw,0o444)
 manifest=read(Path(s['runtimeRoot']).parent/'runtime-manifest.json');need(digest(manifest)==s['manifestSHA256'],'QA_CJS_START_ACTUAL_MANIFEST_CHANGED');store(tools/'r29-qa-runtime-manifest.json',manifest,0o444);os.chmod(tools,0o555)
 contract={'schemaVersion':1,'kind':'r29-independent-pg-cjs-readonly-tools','attempt':a,'runtimeRoot':s['runtimeRoot'],'manifestSHA256':s['manifestSHA256'],'mounts':[{'name':'runtime','root':s['runtimeRoot'],'destination':'/qa-runtime'},{'name':'tools','root':str(tools),'destination':'/tools'}],'files':paths};contract_raw=(json.dumps(contract,separators=(',',':'))+'\n').encode()
 activation={'schemaVersion':1,'kind':'r29-independent-pg-cjs-exact-activation','attempt':a,'workerSHA256':s['workerSHA256'],'imageID':s['imageID'],'runtimeRoot':s['runtimeRoot'],'manifestSHA256':s['manifestSHA256'],'fullByteProofSHA256':s['fullByteProof']['sha256'],'librarySHA256':s['librarySHA256'],'pins':{'reviewSHA256':p['reviewSHA256'],'protectionSHA256':p['protectionSHA256'],'toolsContractSHA256':digest(contract_raw)}}
 store(control/'review.json',review);store(control/'protection.json',protection);store(control/'tools-contract.json',contract_raw);store(control/'activation.json',(json.dumps(activation,separators=(',',':'))+'\n').encode())
 r=subprocess.run(['/usr/bin/python3',str(worker),'--launch',a],capture_output=True,timeout=40,env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8'});need(r.returncode==0,'QA_CJS_START_AMBIGUOUS_USE_CHECK');v=json.loads(r.stdout);need(v.get('dispatched') is True and v.get('attempt')==a,'QA_CJS_START_DISPATCH_UNKNOWN')
else:need(digest(read(worker))==s['workerSHA256'],'QA_CJS_CHECK_WORKER_CHANGED')
once=read(private/'once.json');activation=read(control/'activation.json');o=json.loads(once);need(o.get('attempt')==a and o.get('workerSHA256')==s['workerSHA256'] and o.get('activationSHA256')==digest(activation),'QA_CJS_START_ONCE_CHANGED')
deadline=time.monotonic()+15
while not os.path.lexists(private/'state.json') and time.monotonic()<deadline:time.sleep(0.1)
state_raw=read(private/'state.json');state=json.loads(state_raw);owner=state.get('owner');unit='jarvis-qa-pg-cjs-r29-'+a+'-owner.service';need(isinstance(owner,dict) and owner.get('unit')==unit and isinstance(owner.get('pid'),int) and owner['pid']>1 and owner.get('runtimeMaxSec')==300 and owner.get('stopTimeoutSec')==120,'QA_CJS_START_OWNER_UNKNOWN')
inventory={k:digest(read(control/k)) for k in ['activation.json','review.json','protection.json','tools-contract.json']};tools_inventory={k:digest(read(tools/k)) for k in ['consumer.mjs','qualify.mjs','outside.cjs','r29-qa-runtime-manifest.json']}
print(json.dumps({'schemaVersion':1,'kind':'software-factory-r29-independent-pg-cjs-start','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'attempt':a,'dispatched':True,'ownerUnit':unit,'owner':owner,'workerSHA256':s['workerSHA256'],'activationSHA256':digest(activation),'onceIntentSHA256':digest(once),'controlInventorySHA256':digest(json.dumps(inventory,sort_keys=True,separators=(',',':')).encode()),'controlFiles':inventory,'toolsInventorySHA256':digest(json.dumps(tools_inventory,sort_keys=True,separators=(',',':')).encode()),'toolsFiles':tools_inventory,'actualPrivateStateSHA256':digest(state_raw),'status':state.get('status'),'qualification':state.get('qualification'),'runtimeRoot':s['runtimeRoot'],'manifestSHA256':s['manifestSHA256'],'runtimeReady':False,'productAccepted':False,'modelsInvoked':False,'readOnly':p['action']=='check'}))
`;}
export async function startPGR29Cjs(action='inspect',deps={}){
 const d={readLocal:safeReadLocal,writeWX,save,lock,unlock,receipt,now:Date.now,nonce:()=>randomBytes(16).toString('hex'),verifyProtection:verifyFactoryProtectionContractR29R2,readRoot:async p=>JSON.parse(await remote(lanProfile,'jarvis-101',python(p,pgCjsR29HostProgram()),true,{timeoutMs:180000})),...deps};need(['inspect','start','check'].includes(action),'QA_CJS_ACTION_INVALID');
 let gate;try{gate=JSON.parse(await d.readLocal(pgCjsR29GatePath));}catch(e){if(action==='inspect')return {ready:false,actualCJSQualified:false,modelsInvoked:false,reason:'reviewed-activation-missing'};throw e;}
 const selfSHA=hash(await d.readLocal('scripts/start-factory-independent-pg-cjs-r29.mjs'));need(gate.kind==='r29-pg-cjs-reviewed-once-activation'&&gate.starterSHA256===selfSHA&&gate.workerSHA256===S.workerSHA256&&H.test(gate.review?.sha256??'')&&H.test(gate.cleanupReview?.sha256??''),'QA_CJS_REVIEWED_ACTIVATION_CHANGED');
 const reviewRaw=await d.readLocal(gate.review.path),cleanupRaw=await d.readLocal(gate.cleanupReview.path);need(hash(reviewRaw)===gate.review.sha256&&hash(cleanupRaw)===gate.cleanupReview.sha256,'QA_CJS_REVIEW_CHANGED');const review=JSON.parse(reviewRaw),cr=JSON.parse(cleanupRaw);need([review,cr].every(r=>r.workerSHA256===S.workerSHA256&&r.remainingP0P1===0&&r.staticPreparationReady===true&&r.actualCJSQualified===false)&&review.starterSHA256===selfSHA,'QA_CJS_REVIEW_UNPROVEN');
 if(action==='inspect')return {ready:true,actualCJSQualified:false,modelsInvoked:false,remoteOperations:false};
 if(action==='check'){const q=JSON.parse(await d.readLocal(JP));need(q.kind==='r29-independent-pg-cjs-once-journal'&&JSON.stringify(q.immutableScope)===JSON.stringify(S)&&q.starterSHA256===selfSHA,'QA_CJS_CHECK_CONTEXT_CHANGED');const r=parseCjsHostFrame(await d.readRoot({scope:S,action:'check',attempt:q.attempt}));need(r.kind==='software-factory-r29-independent-pg-cjs-start'&&r.attempt===q.attempt&&r.workerSHA256===S.workerSHA256&&r.readOnly===true&&['activationSHA256','onceIntentSHA256','controlInventorySHA256','toolsInventorySHA256'].every(k=>H.test(r[k]??'')),'QA_CJS_CHECK_FRAME_INVALID');
  if(q.dispatched===false&&q.startUncertain===true){q.dispatched=true;q.reconciledFromCheck=true;q.owner=r.owner;for(const k of ['activationSHA256','onceIntentSHA256','controlInventorySHA256','toolsInventorySHA256'])q[k]=r[k];q.receipts.start=await d.receipt({...r,reconciledFromCheck:true});await d.save(q);return {...r,reconciledFromCheck:true,receipt:q.receipts.start};}
  return {...r,receipt:await d.receipt(r,'independent-pg-cjs-check')};}
 const held=await d.lock();try{
  try{await d.readLocal(JP);throw Error('QA_CJS_ONCE_ALREADY_INTENDED_USE_CHECK')}catch(e){if(e.code!=='ENOENT')throw e;}
  const bytes=await d.readLocal(S.fullByteProof.path);need(hash(bytes)===S.fullByteProof.sha256,'QA_CJS_ACTUAL_BYTE_PROOF_CHANGED');const byteProof=JSON.parse(bytes);need(byteProof.frozenClosureIndependentlyVerified===true&&byteProof.twoCompleteReadbacks===true&&byteProof.manifestSHA256===S.manifestSHA256&&byteProof.runtimeReady===false,'QA_CJS_ACTUAL_BYTES_UNPROVEN');
  const worker=await d.readLocal(S.worker);need(hash(worker)===S.workerSHA256,'QA_CJS_WORKER_CHANGED');const files={};for(const f of S.tools){const b=await d.readLocal(f.path);need(hash(b)===f.sha256,'QA_CJS_TOOL_CHANGED');files[f.name]=Buffer.from(b).toString('base64');}
  const protection=await d.verifyProtection();assertR29R4ProtectionProof(protection,{fresh:true,now:d.now()});const pr=JSON.stringify(protection,null,2)+'\n',attempt=d.nonce();need(/^[a-f0-9]{32}$/.test(attempt),'QA_CJS_NONCE_INVALID');const q={schemaVersion:1,kind:'r29-independent-pg-cjs-once-journal',attempt,immutableScope:S,starterSHA256:selfSHA,startIntentAt:new Date(d.now()).toISOString(),dispatched:false,automaticRetry:false,actualCJSQualified:false,receipts:{}};
  await d.writeWX(JP,JSON.stringify(q,null,2)+'\n');await d.save(q);
  try{const r=parseCjsHostFrame(await d.readRoot({scope:S,action:'start',attempt,workerBase64:Buffer.from(worker).toString('base64'),reviewBase64:Buffer.from(reviewRaw).toString('base64'),reviewSHA256:gate.review.sha256,protectionBase64:Buffer.from(pr).toString('base64'),protectionSHA256:hash(pr),toolFiles:files}));need(r.kind==='software-factory-r29-independent-pg-cjs-start'&&r.attempt===attempt&&r.dispatched===true&&r.workerSHA256===S.workerSHA256&&H.test(r.activationSHA256??'')&&H.test(r.onceIntentSHA256??'')&&H.test(r.controlInventorySHA256??'')&&H.test(r.toolsInventorySHA256??''),'QA_CJS_ACTUAL_DISPATCH_UNKNOWN_USE_CHECK');q.dispatched=true;q.owner=r.owner;q.activationSHA256=r.activationSHA256;q.onceIntentSHA256=r.onceIntentSHA256;q.controlInventorySHA256=r.controlInventorySHA256;q.toolsInventorySHA256=r.toolsInventorySHA256;q.receipts.start=await d.receipt(r);await d.save(q);return {...r,receipt:q.receipts.start};}
  catch(e){q.startUncertain=true;await d.save(q);throw e;}
 }finally{await d.unlock(held)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(await startPGR29Cjs(process.argv[2]??'inspect')))}catch(e){console.log(JSON.stringify({ready:false,errorCode:/^QA_CJS_[A-Z0-9_]+$/.test(e.message)?e.message:'QA_CJS_UNKNOWN_USE_CHECK',automaticRetry:false,actualCJSQualified:false}));process.exitCode=1}}
