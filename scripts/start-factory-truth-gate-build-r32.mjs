/** New six-stage, once-only R32 build. Unconfigured activation performs zero IO. */
import {open,mkdir,lstat,unlink,rename} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {remote,lanProfile,python,withPlatform} from './managed-server-client.mjs';
import {safeReadLocal,settleEvidenceReads} from './factory-repair-evidence-read-r26.mjs';
import {sha,canonical} from './run-factory-main-repair-r26.mjs';
import {verifyFactoryProtectionContractR29R2} from './verify-factory-protection-contract-r29-r2.mjs';
import {assertR29R4ProtectionProof,assertR29R4HistoricalOwner} from './start-factory-truth-gate-build-r29-r4.mjs';
import {finiteBuildR32Scope as V,renderFiniteBuildR32Bundle,readR32SourcePreparation} from './render-factory-truth-gate-build-r32.mjs';
const need=(v,c)=>{if(!v)throw Error(c)},H=/^[a-f0-9]{64}$/,A=/^[a-f0-9]{32}$/,same=(a,b)=>canonical(a)===canonical(b);
export const buildStartR32Activation=null;
export const buildStartR32JournalPath='.jarvis-dev/maintenance/factory-r32-isolated-build-once.json';
export const buildStartR32Scope=Object.freeze({...V,journalPath:buildStartR32JournalPath,launcher:'scripts/factory-truth-gate-build-launch-r32.py',starter:'scripts/start-factory-truth-gate-build-r32.mjs',renderer:'scripts/render-factory-truth-gate-build-r32.mjs',configured:false,remoteExecutionAuthorized:false});
const JP=buildStartR32JournalPath,S=buildStartR32Scope;
const historicalRef={path:'artifacts/software-factory/goals-r29/build-owner-lifetime-proof-1791823732398-c590b8b8-8d59-4b56-b168-74a9d242fc3b.json',sha256:'a3861d19663cc3e2f4e0c7ffb31de48ee2443776ae5fcba3e79c8b85497180e9'};
export function buildStartR32Names(attempt){need(A.test(attempt??''),'R32_START_ATTEMPT_INVALID');return V.stages.map(stage=>'jarvis-tg-r32-'+attempt+'-'+stage)}
function reference(v){need(/^artifacts\/software-factory\/goals-r29\/[A-Za-z0-9_.-]+\.json$/.test(v?.path??'')&&H.test(v?.sha256??''),'R32_START_PUBLIC_REF_INVALID');return v}
export function assertBuildStartR32Activation(v){
 need(v?.schemaVersion===1&&v.kind==='r32-finite-build-reviewed-activation'&&v.remoteExecutionAuthorized===true&&v.modelsInvoked===false&&v.productAccepted===false&&H.test(v.workerSHA256??'')&&H.test(v.workerTemplateSHA256??'')&&H.test(v.launcherSHA256??'')&&H.test(v.starterSHA256??'')&&H.test(v.rendererSHA256??'')&&H.test(v.qaManifestSHA256??''),'R32_START_ACTIVATION_UNAVAILABLE');
 reference(v.sourcePreparation);reference(v.review);need(same(v.historicalOwner,historicalRef),'R32_START_HISTORICAL_OWNER_REF_CHANGED');return v;
}
export function assertBuildStartR32Review(v,a){
 need(v?.schemaVersion===1&&v.kind==='r32-finite-build-independent-local-review'&&v.workerSHA256===a.workerSHA256&&v.workerTemplateSHA256===a.workerTemplateSHA256&&v.launcherSHA256===a.launcherSHA256&&v.starterSHA256===a.starterSHA256&&v.rendererSHA256===a.rendererSHA256&&v.qaManifestSHA256===a.qaManifestSHA256&&v.sourcePreparationSHA256===a.sourcePreparation.sha256&&v.remainingP0P1===0&&v.staticPreparationReady===true&&v.sixNamesReviewed===true&&v.stopPostMaximumBudgetSec===285&&v.ownerStopTimeoutSec===300&&v.ownerBeforeEveryCreate===true&&v.durableCreationIntentBeforeCreate===true&&v.hardFailureBlocksCandidateStages===true&&v.actualSixNameLifecycleVerified===false&&v.actualBuildExecuted===false&&v.remoteOperations===false&&v.modelsInvoked===false&&v.productAccepted===false,'R32_START_REVIEW_UNPROVEN');return v;
}
export function assertBuildStartR32Journal(q,a,scope){need(q?.schemaVersion===1&&q.kind==='r32-finite-build-once-intent'&&A.test(q.attempt??'')&&same(q.activation,a)&&same(q.scope,scope)&&q.automaticRedispatch===false&&q.receipts&&typeof q.receipts==='object'&&!Array.isArray(q.receipts),'R32_START_JOURNAL_CHANGED');if(q.startAttemptedAt)need(q.intent?.attempt===q.attempt&&q.intent.workerSHA256===scope.toolSHA&&q.intent.sourcePreparationSHA256===scope.sourcePreparationSHA256,'R32_START_JOURNAL_INTENT_CHANGED');return q}
async function writeWX(path,raw,mode=0o600){const f=await open(path,'wx',mode);try{await f.writeFile(raw);await f.sync()}finally{await f.close()}}
async function saveJournal(q){const tmp=JP+'.'+randomUUID()+'.tmp';await writeWX(tmp,JSON.stringify(q,null,2)+'\n');if(process.platform==='win32'){const r=spawnSync('python',['-c',"import ctypes,sys;f=ctypes.WinDLL('kernel32',use_last_error=True).MoveFileExW;f.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p,ctypes.c_ulong];f.restype=ctypes.c_int;sys.exit(0 if f(sys.argv[1],sys.argv[2],9) else 1)",resolve(tmp),resolve(JP)],{encoding:'utf8',windowsHide:true,timeout:10000});need(r.status===0,'R32_START_DURABLE_SAVE_FAILED')}else{await rename(tmp,JP);const d=await open('.jarvis-dev/maintenance','r');try{await d.sync()}finally{await d.close()}}}
async function acquireLock(){const path=JP+'.lock',fd=await open(path,'wx',0o600);try{await fd.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()})+'\n');await fd.sync();return {path,fd}}catch(e){await fd.close();throw e}}
async function releaseLock(v){try{const a=await v.fd.stat(),b=await lstat(v.path);need(b.isFile()&&!b.isSymbolicLink()&&a.dev===b.dev&&a.ino===b.ino,'R32_START_LOCK_CHANGED');await unlink(v.path)}finally{await v.fd.close()}}
async function publicReceipt(kind,value){await mkdir('artifacts/software-factory/goals-r29',{recursive:true});const path='artifacts/software-factory/goals-r29/'+kind+'-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(value,null,2)+'\n';await writeWX(path,raw,0o644);return {path,sha256:sha(raw)}}
async function localContext(a,d){
 assertBuildStartR32Activation(a);
 const refs=[a.sourcePreparation,a.review,a.historicalOwner],raw=await settleEvidenceReads(refs.map(r=>()=>d.readLocal(r.path)));
 refs.forEach((r,i)=>need(sha(raw[i])===r.sha256,'R32_START_FROZEN_RECEIPT_CHANGED'));
 const prepared={...JSON.parse(raw[0]),receipt:a.sourcePreparation};await readR32SourcePreparation(prepared,d.readLocal);
 assertBuildStartR32Review(JSON.parse(raw[1]),a);assertR29R4HistoricalOwner(JSON.parse(raw[2]));
 const [bundle,launcher,starter,renderer]=await settleEvidenceReads([()=>d.render(prepared,{readLocal:d.readLocal}),()=>d.readLocal(S.launcher),()=>d.readLocal(S.starter),()=>d.readLocal(S.renderer)]);
 need(bundle?.ready===true&&bundle.workerSHA256===a.workerSHA256&&bundle.templateSHA256===a.workerTemplateSHA256&&bundle.qaTools.manifestSHA256===a.qaManifestSHA256&&bundle.sourcePreparationSHA256===a.sourcePreparation.sha256&&sha(launcher)===a.launcherSHA256&&sha(starter)===a.starterSHA256&&sha(renderer)===a.rendererSHA256,'R32_START_LOCAL_BUNDLE_CHANGED');
 const source=bundle.sourcePreparation.source,origin=bundle.sourcePreparation.rootOrigin;
 const scope={source:V.source,fingerprint:V.sourceFingerprintDFS,sourceFiles:625,sourceBytes:18413560,metadataSHA:source.metadataSHA,sourceIdentity:source.identity,sourceOrigin:origin.path,sourceOriginSHA256:origin.sha256,root:V.root,tool:'/opt/jarvis-development/software-factory/factory-truth-gate-build-r32-'+a.workerSHA256.slice(0,16)+'.py',toolSHA:a.workerSHA256,qaManifestSHA256:a.qaManifestSHA256,sourcePreparationSHA256:a.sourcePreparation.sha256,reviewSHA256:a.review.sha256,starterSHA256:a.starterSHA256,rendererSHA256:a.rendererSHA256};
 return {bundle,launcher,scope,refs:refs.map((r,i)=>({path:r.path,sha256:sha(raw[i])}))};
}
export async function startFactoryTruthGateBuildR32({action='inspect',activation=buildStartR32Activation}={},dependencies={}){
 need(['inspect','start','check'].includes(action),'R32_START_ACTION_INVALID');
 if(activation===null)return {schemaVersion:1,kind:'software-factory-r32-build-preparation',ready:false,reason:'R32_START_PREPARATION_NOT_FROZEN',scope:S,modelsInvoked:false,actualBuildExecuted:false,productAccepted:false,remoteOperations:false,automaticRedispatch:false};
 const d={readLocal:safeReadLocal,render:renderFiniteBuildR32Bundle,writeWX,saveJournal,acquireLock,releaseLock,publicReceipt,now:Date.now,randomBytes,freshProtection:()=>withPlatform(({api})=>verifyFactoryProtectionContractR29R2({api})),readRoot:(p,body)=>remote(lanProfile,'jarvis-101',python(p,body),true,{timeoutMs:180000}),...dependencies};
 const initial=await localContext(activation,d);let lease;if(action!=='inspect')lease=await d.acquireLock();
 try{
  let q;try{q=JSON.parse(await d.readLocal(JP))}catch(e){if(e.code!=='ENOENT')throw e}
  if(!q){
   if(action!=='start')return {schemaVersion:1,kind:'software-factory-r32-build-preparation',ready:false,reason:'FINITE_BUILD_ATTEMPT_NOT_STARTED',scope:initial.scope,modelsInvoked:false,actualBuildExecuted:false,productAccepted:false,remoteOperations:false,automaticRedispatch:false};
   q={schemaVersion:1,kind:'r32-finite-build-once-intent',activation,scope:initial.scope,attempt:d.randomBytes(16).toString('hex'),createdAt:new Date(d.now()).toISOString(),startAttemptedAt:null,receipts:{},automaticRedispatch:false};await d.writeWX(JP,JSON.stringify(q,null,2)+'\n');await d.saveJournal(q);
  }
  assertBuildStartR32Journal(q,activation,initial.scope);
  if(action==='inspect')return {schemaVersion:1,kind:'software-factory-r32-build-preparation',ready:true,reason:q.startAttemptedAt?'FINITE_BUILD_ALREADY_ATTEMPTED_USE_CHECK':'FINITE_BUILD_PREPARED_NOT_DISPATCHED',scope:q.scope,attempt:q.attempt,modelsInvoked:false,actualBuildExecuted:false,productAccepted:false,remoteOperations:false,automaticRedispatch:false};
  let freshRef=null,freshAt=null;
  if(action==='start'){
   need(!q.startAttemptedAt,'R32_START_AMBIGUOUS_OR_DUPLICATE_USE_READONLY_CHECK');
   const fresh=await d.freshProtection();freshRef=await d.publicReceipt('r32-build-fresh-protection',fresh);assertR29R4ProtectionProof(fresh,{fresh:true,now:d.now()});freshAt=fresh.at;
   const final=await localContext(activation,d);need(same(initial.scope,final.scope)&&same(initial.refs,final.refs)&&initial.bundle.workerSHA256===final.bundle.workerSHA256&&sha(initial.launcher)===sha(final.launcher),'R32_START_LOCAL_CONTEXT_CHANGED');
   q.receipts.freshProtection=freshRef;q.startAttemptedAt=new Date(d.now()).toISOString();q.intent={attempt:q.attempt,workerSHA256:q.scope.toolSHA,sourcePreparationSHA256:q.scope.sourcePreparationSHA256,freshProtectionSHA256:freshRef.sha256};await d.saveJournal(q);
  }else need(q.startAttemptedAt,'R32_START_NOT_ATTEMPTED_USE_INSPECT');
  const b=initial.bundle,request={scope:q.scope,action:action==='start'?'start':'check',attempt:q.attempt,workerBase64:action==='start'?Buffer.from(b.worker).toString('base64'):null,qaBase64:action==='start'?Object.fromEntries(Object.entries({...b.qaTools.files,'manifest.json':b.qaTools.manifestRaw}).map(([name,raw])=>[name,Buffer.from(raw).toString('base64')])):null,freshProtectionSHA256:action==='start'?freshRef.sha256:null,freshProtectionObservedAt:action==='start'?freshAt:null};
  const raw=await d.readRoot(request,String(initial.launcher));let observed;try{observed=typeof raw==='string'?JSON.parse(raw):raw}catch{throw Error('R32_START_HOST_JSON_INVALID')}
  const expectedSource={sha256:q.scope.fingerprint,files:q.scope.sourceFiles,bytes:q.scope.sourceBytes,metadataSHA:q.scope.metadataSHA,identity:q.scope.sourceIdentity};
  need(observed?.schemaVersion===1&&observed.kind==='software-factory-r32-once-build-observation'&&observed.attempt===q.attempt&&same(observed.scope,q.scope)&&same(observed.source,expectedSource)&&observed.sourceDoubleRead===true&&observed.qaToolsReadbackVerified===true&&['fork-intent','dispatched'].includes(observed.launchPhase)&&observed.installedToolSHA256===q.scope.toolSHA&&observed.modelsInvoked===false&&observed.productAccepted===false&&observed.automaticRedispatch===false&&observed.rawLogsExported===false&&observed.privateEnvironmentExported===false&&observed.readOnly===(action==='check'),'R32_START_OBSERVATION_CHANGED');
  const result={...observed,historicalOwnerProofOnly:true,historicalOwnerProofCoveredFourNames:true,sixNameLifecycleRequiresActualReadback:true,bootstrapExecutedOnlyIfActuallyRecorded:true,independentCleanupVerified:false,actualDBAPIValidation:false};
  const receipt=await d.publicReceipt('isolated-build-r32-'+action,result);
  // A confirmed readonly check may reconcile the missing start receipt, but never dispatch.
  if(observed.launchPhase==='dispatched'&&(action==='start'||!q.receipts.start)){q.receipts.start={...receipt,at:observed.at,launchPhase:observed.launchPhase,processIdentity:observed.processIdentity,recoveredByReadOnlyCheck:action==='check'};await d.saveJournal(q)}
  return {...result,output:receipt.path,sha256:receipt.sha256};
 }finally{if(lease)await d.releaseLock(lease)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){let v;try{need(process.argv.length<=3,'R32_START_CLI_ARGUMENTS_INVALID');v=await startFactoryTruthGateBuildR32({action:process.argv[2]??'inspect'})}catch(e){v={schemaVersion:1,kind:'software-factory-r32-build-preparation',ready:false,errorCode:/^R32_START_[A-Z0-9_]+$/.test(String(e.message))?e.message:'R32_START_OPERATION_FAILED',modelsInvoked:false,productAccepted:false,automaticRedispatch:false,rawErrorExported:false};process.exitCode=1}console.log(JSON.stringify(v.output?{output:v.output,sha256:v.sha256,attempt:v.attempt,launchPhase:v.launchPhase,modelsInvoked:false,productAccepted:false}:v))}
