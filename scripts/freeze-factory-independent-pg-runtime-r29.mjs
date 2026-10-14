/** Consume one actual independent cleanup to freeze only the PG install output. */
import {readFile,open,rename,lstat,unlink} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';import {spawnSync} from 'node:child_process';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {safeReadLocal} from './factory-repair-evidence-read-r26.mjs';
import {independentPGR29Scope as S,independentPGR29JournalPath as JP} from './start-factory-independent-pg-runtime-r29.mjs';
import {assertR29R4ProtectionProof} from './start-factory-truth-gate-build-r29-r4.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),need=(v,c)=>{if(!v)throw Error(c)};
export const pgFreezeCleanupRef={path:'artifacts/software-factory/goals-r29/independent-pg-cleanup-1791831764802-1d877c6c-7965-450c-a6d8-e97b02983b10.json',sha256:'1cff0013d11f48719cea1f9d424261ef1aa139f36e3463aa04751bd2cad4c5b5'};
export function pgFreezeRootProgram(){return String.raw`
import ast,base64,hashlib,json,os,re,stat,subprocess,time
from pathlib import Path
def need(v,c):
 if not v:raise RuntimeError(c)
def digest(b):return hashlib.sha256(b).hexdigest()
need(os.geteuid()==0 and p['attempt']=='3c7ade1178fc47184cd9aaba9e84b855' and p['workerSHA256']=='57eb441548b433620b3b244724bb50f27abdbf981b0d5f0e031623b70cfc4ae5' and p['cleanupSHA256']=='1cff0013d11f48719cea1f9d424261ef1aa139f36e3463aa04751bd2cad4c5b5','QA_PG_FREEZE_EXACT_SCOPE_CHANGED')
worker=Path('/opt/jarvis-development/software-factory/factory-build-independent-pg-runtime-r29-r2-57eb441548b43362.py');private=Path('/var/lib/jarvis-development/101/r29-qa-pg-runtime')/p['attempt'];control=private/'control'
# Root executes this reviewed byte controller, never package JS.
body=worker.read_bytes();need(digest(body)==p['workerSHA256'],'QA_PG_FREEZE_WORKER_CHANGED')
tree=ast.parse(body);names={'need','compact','sha','metadata','held_directory','read_private','root_directory','store_bytes'};selected=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names];need({n.name for n in selected}==names,'QA_PG_FREEZE_BYTE_HELPERS_CHANGED')
env={'hashlib':hashlib,'json':json,'os':os,'re':re,'stat':stat,'time':time,'Path':Path};exec(compile(ast.Module(body=selected,type_ignores=[]),'trusted-pg-freeze-byte-controller','exec'),env);read=env['read_private'];store=env['store_bytes']
need(read(worker)==body,'QA_PG_FREEZE_WORKER_CHANGED');activation_raw=read(control/'activation.json');need(digest(activation_raw)==p['activationSHA256'],'QA_PG_FREEZE_ACTIVATION_CHANGED')
cleanup=base64.b64decode(p['cleanupBase64'],validate=True);protection=base64.b64decode(p['protectionBase64'],validate=True);need(digest(cleanup)==p['cleanupSHA256'] and digest(protection)==p['protectionSHA256'],'QA_PG_FREEZE_PROOF_BYTES_CHANGED')
c=json.loads(cleanup);need(c.get('ready') is True and c.get('cleanupIndependentlyVerified') is True and c.get('attempt')==p['attempt'] and c.get('activationSHA256')==p['activationSHA256'] and c.get('workerSHA256')==p['workerSHA256'] and c.get('actualPrivateStateSHA256')==digest(read(private/'state.json')),'QA_PG_FREEZE_CLEANUP_CONTEXT_CHANGED')
need(not os.path.lexists(private/'runtime') and not os.path.lexists(control/'freeze-activation.json'),'QA_PG_FREEZE_ALREADY_INTENDED_USE_READBACK')
freeze={'schemaVersion':1,'kind':'r29-pg-exact-freeze-activation','attempt':p['attempt'],'activationSHA256':p['activationSHA256'],'workerSHA256':p['workerSHA256'],'cleanupProofSHA256':p['cleanupSHA256'],'protectionSHA256':p['protectionSHA256']}
store(private/'independent-cleanup.json',cleanup);store(control/'r29-qa-pg-freeze-protection-proof.json',protection);store(control/'freeze-activation.json',(json.dumps(freeze,separators=(',',':'))+'\n').encode())
r=subprocess.run(['/usr/bin/python3',str(worker),'--freeze',p['attempt']],capture_output=True,timeout=150,env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8'});need(r.returncode==0,'QA_PG_FREEZE_OPERATION_FAILED_USE_READBACK');result=json.loads(r.stdout)
need(result.get('frozenBytesDoubleRead') is True and result.get('runtimeReady') is False,'QA_PG_FREEZE_RESULT_INCOMPLETE')
print(json.dumps({'schemaVersion':1,'kind':'software-factory-r29-independent-pg-runtime-freeze','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'attempt':p['attempt'],'workerSHA256':p['workerSHA256'],'cleanupProofSHA256':p['cleanupSHA256'],'freezeActivationSHA256':digest(read(control/'freeze-activation.json')),'actualResult':result,'rootPackageJavaScriptExecuted':False,'runtimeCJSClosureVerified':False,'runtimeReady':False,'productAccepted':False,'modelsInvoked':False}))
`;}
async function save(q){const tmp=JP+'.'+randomUUID()+'.tmp';const f=await open(tmp,'wx',0o600);try{await f.writeFile(JSON.stringify(q,null,2)+'\n');await f.sync()}finally{await f.close()}if(process.platform==='win32'){const r=spawnSync('python',['-c',"import ctypes,sys;f=ctypes.WinDLL('kernel32',use_last_error=True).MoveFileExW;f.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p,ctypes.c_ulong];f.restype=ctypes.c_int;sys.exit(0 if f(sys.argv[1],sys.argv[2],9) else 1)",resolve(tmp),resolve(JP)],{windowsHide:true,timeout:10000});need(r.status===0,'QA_PG_FREEZE_LOCAL_DURABILITY_FAILED')}else{await rename(tmp,JP);const d=await open('.jarvis-dev/maintenance','r');try{await d.sync()}finally{await d.close()}}}
async function lock(){const path=JP+'.lock',fd=await open(path,'wx',0o600);return {path,fd}}
async function unlock(value){const a=await value.fd.stat(),b=await lstat(value.path);need(a.dev===b.dev&&a.ino===b.ino,'QA_PG_FREEZE_LOCK_CHANGED');await value.fd.close();await unlink(value.path)}
async function receipt(r){const path='artifacts/software-factory/goals-r29/independent-pg-runtime-freeze-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(r,null,2)+'\n',f=await open(path,'wx',0o644);try{await f.writeFile(raw);await f.sync()}finally{await f.close()}return {path,sha256:hash(raw)}}
export async function freezeIndependentPGR29(action='inspect',deps={}){
 const d={readLocal:safeReadLocal,lock,unlock,save,receipt,now:Date.now,readRoot:p=>JSON.parse(remote(lanProfile,'jarvis-101',python(p,pgFreezeRootProgram()),true,{timeoutMs:180000})),...deps};
 need(['inspect','execute'].includes(action),'QA_PG_FREEZE_ACTION_INVALID');const held=action==='execute'?await d.lock():null;
 try{
 const cleanupRaw=await d.readLocal(pgFreezeCleanupRef.path);need(hash(cleanupRaw)===pgFreezeCleanupRef.sha256,'QA_PG_FREEZE_CLEANUP_CHANGED');const c=JSON.parse(cleanupRaw),q=JSON.parse(await d.readLocal(JP));
 need(q.attempt==='3c7ade1178fc47184cd9aaba9e84b855'&&q.dispatched===true&&q.immutableScope.workerSHA256===S.workerSHA256&&c.attempt===q.attempt&&c.cleanupIndependentlyVerified===true&&c.ready===true&&c.workerSHA256===S.workerSHA256&&c.activationSHA256===q.activationSHA256&&c.installStatus==='installed','QA_PG_FREEZE_ACTUAL_BASIS_UNPROVEN');
 if(action==='inspect')return {ready:true,attempt:q.attempt,executed:false,runtimeReady:false,productAccepted:false,modelsInvoked:false};
 need(!q.freezeIntentAt,'QA_PG_FREEZE_ALREADY_INTENDED_USE_READBACK');const protection=c.newProtectionAfter;assertR29R4ProtectionProof(protection,{fresh:true,now:d.now()});need(d.now()-Date.parse(c.at)<300000,'QA_PG_FREEZE_CLEANUP_STALE');
 const protectionRaw=JSON.stringify(protection,null,2)+'\n';q.freezeIntentAt=new Date(d.now()).toISOString();q.receipts.cleanup=pgFreezeCleanupRef;await d.save(q);
 try{
  const r=await d.readRoot({attempt:q.attempt,workerSHA256:S.workerSHA256,activationSHA256:q.activationSHA256,cleanupSHA256:pgFreezeCleanupRef.sha256,cleanupBase64:Buffer.from(cleanupRaw).toString('base64'),protectionSHA256:hash(protectionRaw),protectionBase64:Buffer.from(protectionRaw).toString('base64')});
  q.receipts.freeze=await d.receipt(r);await d.save(q);return {...r,receipt:q.receipts.freeze};
 }catch(e){q.freezeUncertain=true;await d.save(q);throw e;}
 }finally{if(held)await d.unlock(held)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{need(process.argv.length<=3,'QA_PG_FREEZE_ARGUMENT_INVALID');console.log(JSON.stringify(await freezeIndependentPGR29(process.argv[2]??'inspect')))}catch(e){console.log(JSON.stringify({ready:false,errorCode:/^QA_PG_[A-Z0-9_]+$/.test(e.message)?e.message:'QA_PG_FREEZE_UNKNOWN_USE_READBACK',automaticRetry:false,runtimeReady:false,productAccepted:false}));process.exitCode=1}}
