/** Fixed R31 public-byte upload. Default null activation performs no IO. */
import {readFile,open,lstat,readdir,rename,unlink,mkdir} from 'node:fs/promises';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonical,sha} from './run-factory-main-repair-r26.mjs';
import {remote,lanProfile,python,withPlatform} from './managed-server-client.mjs';
import {verifyFactoryProtectionContractR29R2} from './verify-factory-protection-contract-r29-r2.mjs';
import {assertR29R4ProtectionProof} from './start-factory-truth-gate-build-r29-r4.mjs';

const need=(v,c)=>{if(!v)throw Error(c)},H=/^[a-f0-9]{64}$/,A=/^[a-f0-9]{32}$/;
export const targetSourceR31JournalPath='.jarvis-dev/maintenance/factory-target-source-r31-r2-once.json';
export const targetSourceR31ProgramPath='scripts/factory-target-source-byte-controller-r31-r2.py';
export const targetSourceR31Scope=Object.freeze({
 kind:'r31-target-source-byte-scope-r2',schemaVersion:1,
 projectId:'70ec346f-6520-46ed-abed-22cac770a3e4',machineId:'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',
 source:'/home/superopen/All-Projects/msf-targets-r29/source',parent:'/var/lib/jarvis-development/101/targets-r31-candidate-r2',workspace:'/var/lib/jarvis-development/101/targets-r31-candidate-r2/source',
 preparationRoot:'/var/lib/jarvis-development/101/targets-r31-preparation-r2',helperPath:'/opt/jarvis-development/software-factory/project-autonomy-evidence.py',helperSHA256:'57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2',
 baselineSHA256:'4907e45a21799f2dd14ac2373769607f40d6b9e0319bb614fbe259b157e60493',baselineMetadataSHA256:'2da9d3e490fd6d042113c067807a89b000a4f40fdb5fa8d3ca2911b6615ebce8',baselineIdentity:{device:66306,inode:6718050},baselineFiles:621,baselineBytes:18386584,
 candidateSHA256:'7814f74e1e7c62b1aeb862a6617970551a00493ba2884bf65595cfe65ef2a981',flatManifestSHA256:'0800a9f384a3b96ce43b9b676c8b085fbc3666892a7376b7dde326069b2e030d',candidateFiles:625,candidateBytes:18413026,
 manifestSHA256:'bd836464db3898667db0e10270821b3af54d4baa33a6f3c07de0368a8f702d27',deltaMetadataSHA256:'4210324de567c391c9b201388c12a8bcdfeb52c5b21c8574cae2ddcd0a17bad1',deltaPayloadSHA256:'16602d803deb25eff15a69db77d8f932e35998bb8acc2b31ff4abe655fef7fb6',deltaFiles:18,changedFiles:14,addedFiles:4,
});
export const targetSourceR31ActivationPins=null;
const S=targetSourceR31Scope,JP=targetSourceR31JournalPath;
const R31={path:'artifacts/software-factory/goals-r29/r31-monotonic-basis-final-local-implementation-1791832853761-27e5c2ca-0f28-4de5-9fa8-322675f7ae09.json',sha256:'a8d3df7881dad4937deecc10251683547e0333b208312aae271a40aaf6ee50f7'};
const R29={path:'artifacts/software-factory/goals-r29/frozen-source-export-1791820634349-291ed43f-893c-4f9d-b45c-53f055b5af3d.json',sha256:'ece7a3064b6d90d62bef7439012043fea8ca289cd308a07100d562ad11110028'};
const identical=(a,b)=>canonical(a)===canonical(b);
export function parseTargetSourceR31HostResult(raw){let v;try{v=typeof raw==='string'?JSON.parse(raw):raw}catch{throw Error('R31_SOURCE_HOST_JSON_INVALID')}need(v&&typeof v==='object'&&!Array.isArray(v),'R31_SOURCE_HOST_JSON_INVALID');return v;}
function dfs(a,b){const x=a.path.split('/'),y=b.path.split('/');for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]<y[i]?-1:1;return x.length-y.length;}
async function stableRead(path,limit=20000000){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size<=limit,'R31_SOURCE_LOCAL_FILE_UNTRUSTED');const data=await readFile(path),a=await lstat(path);need(s.dev===a.dev&&s.ino===a.ino&&s.size===data.length&&s.mtimeMs===a.mtimeMs&&s.ctimeMs===a.ctimeMs,'R31_SOURCE_LOCAL_FILE_CHANGED');return data;}
export async function targetSourceR31Plan(reader=stableRead){
 const [oldRaw,newRaw]=await Promise.all([reader(R29.path),reader(R31.path)]);need(sha(oldRaw)===R29.sha256&&sha(newRaw)===R31.sha256,'R31_SOURCE_REPORT_CHANGED');
 const old=JSON.parse(oldRaw),next=JSON.parse(newRaw),manifest=next.manifest.slice().sort(dfs),before=new Map(old.manifest.map(e=>[e.path,e]));
 need(manifest.length===625&&sha(manifest)===S.manifestSHA256&&sha(manifest.map(e=>e.path+'\0'+e.sha256+'\n').join(''))===S.candidateSHA256,'R31_SOURCE_LOCAL_MANIFEST_CHANGED');
 const delta=[];
 for(const e of manifest){const body=await reader('.jarvis-dev/workspaces/msf-targets-r31/source/'+e.path);need(body.length===e.bytes&&sha(body)===e.sha256,'R31_SOURCE_LOCAL_CANDIDATE_CHANGED');if(before.get(e.path)?.sha256!==e.sha256)delta.push({...e,baselineSHA256:before.get(e.path)?.sha256??null,base64:body.toString('base64')});}
 need(delta.length===18&&sha(delta)===S.deltaPayloadSHA256&&sha(delta.map(({base64,...e})=>e))===S.deltaMetadataSHA256,'R31_SOURCE_LOCAL_DELTA_CHANGED');
 const value={scope:S,manifest,delta};return {...value,planSHA256:sha(value)};
}
export function qualifyTargetSourceR31Activation(v,controllerSHA256,programSHA256){
 need(v?.schemaVersion===1&&v.kind==='r31-target-source-reviewed-activation-r2'&&v.controllerSHA256===controllerSHA256&&v.programSHA256===programSHA256&&H.test(v.review?.sha256??'')&&/^artifacts\/software-factory\/goals-r29\/[a-zA-Z0-9_.-]+\.json$/.test(v.review?.path??'')&&v.manifestSHA256===S.manifestSHA256&&v.deltaPayloadSHA256===S.deltaPayloadSHA256&&v.remoteExecutionAuthorized===true&&v.modelsInvoked===false&&v.productAccepted===false,'R31_SOURCE_ACTIVATION_UNAVAILABLE');return v;
}
export function assertTargetSourceR31Journal(q,plan,programSHA256){
 need(q?.schemaVersion===1&&q.kind==='r31-target-source-once-journal'&&identical(q.scope,S)&&typeof q.job==='string'&&A.test(q.job)&&q.planSHA256===plan.planSHA256&&q.programSHA256===programSHA256&&q.automaticRetry===false,'R31_SOURCE_LOCAL_JOURNAL_SCOPE_CHANGED');
 if(q.prepareAttemptedAt)need(q.intent?.action==='prepare'&&q.intent.job===q.job&&q.intent.planSHA256===q.planSHA256&&q.intent.programSHA256===programSHA256,'R31_SOURCE_LOCAL_INTENT_CHANGED');return q;
}
export function targetSourceR31ProtectionFrame(p,now=Date.now()){
 assertR29R4ProtectionProof(p,{fresh:true,now});
 need(p.sources?.r29?.sha256===S.baselineSHA256&&p.sources.r29.metadataSHA===S.baselineMetadataSHA256&&identical(p.sources.r29.identity,S.baselineIdentity),'R31_SOURCE_PROTECTED_BASELINE_CHANGED');
 return {contractId:p.contractId,inventory:p.newProtectedInventorySHA256,sources:p.sources,fixedTools:p.fixedTools,installedSevenTools:p.installedSevenTools,oldImmutableInventorySHA256:p.oldImmutableInventorySHA256,nodeConfigSHA256:p.nodeConfigSHA256,profileSHA256:p.profileSHA256,baseTemplateSHA256:p.baseTemplateSHA256,otherCentralTemplatesSHA256:p.otherCentralTemplatesSHA256,otherNodeTemplatesSHA256:p.otherNodeTemplatesSHA256,terminal:p.terminal,node:{...p.node,state:null},nodeACKIdle:p.nodeACKIdle,queueIdle:p.queueIdle,fullQueueSQLVerified:p.fullQueueSQLVerified};
}
export function assertTargetSourceR31Host(v,q,plan,programSHA256){
 need(v?.schemaVersion===1&&v.kind==='r31-target-source-host-observation-r2'&&v.job===q.job&&v.planSHA256===plan.planSHA256,'R31_SOURCE_HOST_SCOPE_CHANGED');
 need(identical(v.source,{sha256:S.baselineSHA256,files:621,bytes:18386584,metadataSHA:S.baselineMetadataSHA256,stable:true,identity:S.baselineIdentity}),'R31_SOURCE_ACTUAL_BASELINE_CHANGED');
 if(!v.prepared)return false;
 need(v.prepared===true&&v.originBound===true&&v.phase==='ready'&&v.programSHA256===programSHA256&&v.outOfScopeUnchanged===true&&H.test(v.outOfScopeInventorySHA256??'')&&H.test(v.originSHA256??'')&&H.test(v.phaseSHA256??''),'R31_SOURCE_ACTUAL_ORIGIN_UNPROVEN');
 need(v.rootOrigin?.path===S.preparationRoot+'/'+q.job+'/origin.json'&&v.rootOrigin.job===q.job&&v.rootOrigin.sha256===v.originSHA256,'R31_SOURCE_ACTUAL_ROOT_ORIGIN_CHANGED');
 need(v.candidate?.sha256===S.candidateSHA256&&v.candidate.files===625&&v.candidate.bytes===18413026&&v.candidate.stable===true&&H.test(v.candidate.metadataSHA??'')&&Number.isSafeInteger(v.candidate.identity?.device)&&Number.isSafeInteger(v.candidate.identity?.inode)&&v.candidate.identity.inode>0&&v.sourceUID===0&&v.sourceGID===0&&v.sourceFileMode==='0644'&&v.sourceDirectoryMode==='0755'&&v.newInodesIndependent===true&&v.privateFilesCopied===false&&v.gitHistoryCopied===false&&v.candidateCodeExecuted===false&&v.modelsInvoked===false,'R31_SOURCE_ACTUAL_CANDIDATE_UNPROVEN');return true;
}
async function writeWX(path,raw,mode=0o600){const f=await open(path,'wx',mode);try{await f.writeFile(raw);await f.sync()}finally{await f.close()}}
async function syncDirectory(path){const d=await open(path,'r');try{await d.sync()}finally{await d.close()}}
async function saveJournal(q){const temp=JP+'.'+randomUUID()+'.tmp';await writeWX(temp,JSON.stringify(q,null,2)+'\n');if(process.platform==='win32'){const r=spawnSync('python',['-c',"import ctypes,sys;f=ctypes.WinDLL('kernel32',use_last_error=True).MoveFileExW;f.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p,ctypes.c_ulong];f.restype=ctypes.c_int;sys.exit(0 if f(sys.argv[1],sys.argv[2],9) else 1)",resolve(temp),resolve(JP)],{windowsHide:true,timeout:10000});need(r.status===0,'R31_SOURCE_JOURNAL_DURABLE_SAVE_FAILED')}else{await rename(temp,JP);await syncDirectory('.jarvis-dev/maintenance')}}
async function lock(){const path=JP+'.lock',f=await open(path,'wx',0o600);return {path,f};}
async function unlock(v){const a=await v.f.stat(),b=await lstat(v.path);need(a.dev===b.dev&&a.ino===b.ino,'R31_SOURCE_LOCAL_LOCK_CHANGED');await v.f.close();await unlink(v.path);}
async function publicReceipt(value){const path='artifacts/software-factory/goals-r29/target-source-r31-r2-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(value,null,2)+'\n';await writeWX(path,raw,0o644);return {path,sha256:sha(raw)};}
export async function targetSourceR31HostProgram(reader=stableRead){return (await reader(targetSourceR31ProgramPath,100000)).toString('utf8');}
export async function prepareFactoryTargetSourceR31({action='inspect',activation=targetSourceR31ActivationPins}={},deps={}){
 need(['inspect','prepare','check'].includes(action),'R31_SOURCE_ACTION_INVALID');
 if(activation===null)return {schemaVersion:1,kind:'software-factory-r31-target-source-preparation-r2',ready:false,prepared:false,reason:'reviewed-activation-not-configured',action,remoteOperations:false,modelsInvoked:false,productAccepted:false};
 const d={readLocal:stableRead,plan:targetSourceR31Plan,program:targetSourceR31HostProgram,saveJournal,writeWX,lock,unlock,publicReceipt,now:Date.now,randomBytes,protection:()=>withPlatform(({api})=>verifyFactoryProtectionContractR29R2({api})),readRoot:(params,body)=>remote(lanProfile,'jarvis-101',python(params,body),true,{timeoutMs:180000}),...deps};
 const [controller,program]=await Promise.all([d.readLocal('scripts/prepare-factory-target-source-r31-r2.mjs',100000),d.program(d.readLocal)]),controllerSHA256=sha(controller),programSHA256=sha(program);
 qualifyTargetSourceR31Activation(activation,controllerSHA256,programSHA256);
 const reviewRaw=await d.readLocal(activation.review.path,2000000);need(sha(reviewRaw)===activation.review.sha256,'R31_SOURCE_REVIEW_BYTES_CHANGED');const review=JSON.parse(reviewRaw);
 need(review.kind==='r31-target-source-byte-controller-independent-local-review-r2'&&review.controllerSHA256===controllerSHA256&&review.programSHA256===programSHA256&&review.remainingP0P1===0&&review.staticPreparationReady===true&&review.actualRemoteSourcePrepared===false&&review.modelsInvoked===false&&review.remoteOperations===false,'R31_SOURCE_REVIEW_UNPROVEN');
 const plan=await d.plan(d.readLocal);need(identical(plan.scope,S)&&sha({scope:S,manifest:plan.manifest,delta:plan.delta})===plan.planSHA256&&sha(plan.manifest)===S.manifestSHA256&&sha(plan.delta)===S.deltaPayloadSHA256,'R31_SOURCE_PLAN_UNPROVEN');
 if(action==='inspect')return {schemaVersion:1,kind:'software-factory-r31-target-source-preparation-r2',action,ready:true,prepared:false,planSHA256:plan.planSHA256,programSHA256,remoteOperations:false,modelsInvoked:false,productAccepted:false};
 const lease=await d.lock();let q;
 try{
  try{q=JSON.parse(await d.readLocal(JP,2000000))}catch(e){if(e.code!=='ENOENT')throw e;need(action==='prepare','R31_SOURCE_NO_INTENT_READ_ONLY_CHECK_REFUSED')}
  if(q)assertTargetSourceR31Journal(q,plan,programSHA256);
  const before=await d.protection(),frame=targetSourceR31ProtectionFrame(before,d.now());
  if(action==='prepare'){
   need(!q?.prepareAttemptedAt,'R31_SOURCE_ALREADY_ATTEMPTED_READ_ONLY_CHECK_REQUIRED');
   if(!q){q={schemaVersion:1,kind:'r31-target-source-once-journal',scope:S,job:d.randomBytes(16).toString('hex'),planSHA256:plan.planSHA256,programSHA256,automaticRetry:false,createdAt:new Date(d.now()).toISOString(),receipts:{}};await d.writeWX(JP,JSON.stringify(q,null,2)+'\n');await d.saveJournal(q)}
   q.prepareAttemptedAt=new Date(d.now()).toISOString();q.intent={action:'prepare',job:q.job,planSHA256:plan.planSHA256,programSHA256,protectedBeforeSHA256:sha(frame)};await d.saveJournal(q);
  }else need(q.prepareAttemptedAt,'R31_SOURCE_NO_ATTEMPT_READ_ONLY_CHECK_REFUSED');
  const params={...plan,action,job:q.job,programSHA256};let host;
  try{
   host=parseTargetSourceR31HostResult(await d.readRoot(params,program));
   const complete=assertTargetSourceR31Host(host,q,plan,programSHA256),after=await d.protection();need(identical(frame,targetSourceR31ProtectionFrame(after,d.now())),'R31_SOURCE_FULL_PROTECTION_CHANGED');
   need(Number.isFinite(Date.parse(host.observedAt))&&d.now()-Date.parse(host.observedAt)>=-30000&&d.now()-Date.parse(host.observedAt)<=300000,'R31_SOURCE_HOST_OBSERVATION_STALE');
   const result={schemaVersion:1,kind:'software-factory-r31-target-source-preparation-r2',at:new Date(d.now()).toISOString(),action,ready:complete,prepared:complete,readbackOnly:action==='check',job:q.job,workspace:S.workspace,source:host.candidate,originalSource:host.source,rootOrigin:host.rootOrigin??null,originBound:host.originBound===true,planSHA256:plan.planSHA256,controllerSHA256,programSHA256,twoCompleteSourceReadbacks:complete,outOfScopeUnchanged:complete&&host.outOfScopeUnchanged,protectedInventorySHA256:after.newProtectedInventorySHA256,protectedInventoryFullyVerified:true,profileAndTemplatesUnchanged:true,nodeACKIdle:true,queueIdle:true,fullQueueSQLVerified:true,privateFilesCopied:false,gitHistoryCopied:false,sourceCodeExecuted:false,candidateCodeExecuted:false,modelsInvoked:false,productAccepted:false,automaticRetry:false,rawPayloadExported:false};
   const receipt=await d.publicReceipt(result);q.receipts[action]=receipt;q.prepared=complete;if(complete){q.candidate=host.candidate;q.rootOrigin=host.rootOrigin;q.preparedAt=q.preparedAt??new Date(d.now()).toISOString()}await d.saveJournal(q);return {...result,receipt};
  }catch(e){q.uncertain=true;q.lastPrivateFailure={at:new Date(d.now()).toISOString(),message:String(e.message).slice(0,4000)};await d.saveJournal(q);throw Error('R31_SOURCE_REMOTE_OR_POSTCHECK_UNCERTAIN_READ_ONLY_CHECK_REQUIRED')}
 }finally{await d.unlock(lease)}
}
export function targetSourceR31Failure(e){const m=String(e?.message??'');return {schemaVersion:1,kind:'software-factory-r31-target-source-preparation-r2',ready:false,prepared:false,errorCode:/^R31_SOURCE_[A-Z0-9_]+$/.test(m)?m:'R31_SOURCE_OPERATION_FAILED',automaticRetry:false,rawErrorExported:false,modelsInvoked:false,productAccepted:false};}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let result;try{need(process.argv.length<=3,'R31_SOURCE_CLI_ARGUMENTS_INVALID');result=await prepareFactoryTargetSourceR31({action:process.argv[2]??'inspect'})}catch(e){result=targetSourceR31Failure(e);process.exitCode=1}console.log(JSON.stringify(result));
}
