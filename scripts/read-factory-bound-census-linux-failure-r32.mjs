/** Independent, read-only observation of the single failed Linux subset attempt. */
import {createHash,randomUUID} from 'node:crypto';
import {open,lstat,constants} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {lanProfile,python} from './managed-server-client.mjs';
import {boundCensusLinuxFailureHostR32Scope,boundCensusLinuxFailureHostR32Program,assertBoundCensusLinuxFailureHostR32} from './factory-bound-census-linux-failure-host-r32.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex');
const need=(v,c)=>{if(!v)throw Error(c)};
const H=/^[a-f0-9]{64}$/;
const canonical=v=>JSON.stringify(v);
const sortedCanonical=v=>Array.isArray(v)?'['+v.map(sortedCanonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+sortedCanonical(v[k])).join(',')+'}':JSON.stringify(v);
const READ_PHASES=new Set(['pidfd-attach','process-read','scan-close']);
const READ_SUBPHASES=new Set(['PIDFD_OPEN','POST_ATTACH_PROC_IDENTITY','PROCESS_READ','PROC_DIRECTORY_OPEN','PROC_DIRECTORY_METADATA','STAT_BEFORE','CMDLINE_READ','CGROUP_READ','CWD_READLINK','EXE_READLINK','FD_DIRECTORY_OPEN','FD_SCANDIR_OPEN','FD_SCANDIR_NEXT','FD_SCANDIR_CLOSE','FD_ENTRY_LIMIT','FD_TARGET_READLINK','FD_DIRECTORY_CLOSE','STAT_AFTER','PROC_PATH_IDENTITY_AFTER','PROC_DIRECTORY_CLOSE','PIDFD_POLL','PIDFD_EXIT_PATH_CHECK','SCAN_CLOSE_PROC_IDENTITY','SCAN_CLOSE']);
export const boundCensusLinuxFailureR32Activation=null;
export const boundCensusLinuxFailureR32Scope=Object.freeze({
 schemaVersion:1,kind:'r32-bound-census-linux-failed-attempt-read-scope',
 callerPath:'scripts/read-factory-bound-census-linux-failure-r32.mjs',
 hostPath:'scripts/factory-bound-census-linux-failure-host-r32.mjs',
 nonce:'3e126ddb3cc26d178a7533307f6ba0b1',phase:'native',
 journal:{path:'.jarvis-dev/maintenance/factory-r32-bound-census-linux-once.json',sha256:'bbd3ec7fd5126c987d947f7e70a2c984025a20cdb790c69a19e397c5a174ebd7'},
 start:{path:'artifacts/software-factory/goals-r29/bound-census-linux-r32-start-1791856462879-6a134556-6598-412b-896e-6c8d1588e61b.json',sha256:'8378aa949d7070f5341f7e912b190be892fb8024a559ae9e3d259cde3b00bef1'},
 terminal:{path:'artifacts/software-factory/goals-r29/bound-census-linux-r32-check-1791856512019-ff8727d4-d83e-43ad-9d51-f905d6491462.json',sha256:'1ee4da5e210ecb2817baf7b4c67e5218658dad0d0592eea770e274aa8a6758c9'},
 sources:[
  {path:'scripts/start-factory-bound-census-linux-r32.mjs',sha256:'54d7373a52e940a450b967431df9d211c15ebd72f82fdbd6b8e0c718ab2499c3'},
  {path:'scripts/factory-bound-census-linux-owner-r32.py',sha256:'5983b2ab79a647582a7081d4401931e6c3adbaeeed85bd2f6d1b84eecf91da90'},
  {path:'scripts/factory-bound-census-linux-fixture-r32.py',sha256:'60a9145a1a8619dc5578345ca7def095bdeaa0ba1ca91feea33443e61d2629b7'},
  {path:'scripts/factory-bound-process-census-r32.mjs',sha256:'a08c44ee006ea993452d39616a217bbf7e45169fd827f580c951a9796cac7252'},
  {path:'scripts/verify-factory-target-cleanup-r29.mjs',sha256:'d4860d172aa4b4a2949281ac5ae416d216625b8ed43e394d57e30ba9f0873dd6'},
  {path:'scripts/verify-factory-truth-gate-build-cleanup-r29.mjs',sha256:'48e2089fd03db8d3186486edf207550ad157e412071c10515f5a1d892be59d86'},
  {path:'scripts/managed-server-client.mjs',sha256:'e287938e2d79b0335523d3d198bd93b588541866cebc2c21d997ae6fce5e4a9f'}
 ],
 failurePreserved:true,tinyChildIdentity:null,fullProtectionQualified:false,fixtureQualified:false,modelsInvoked:false,productCodeExecuted:false
});
const S=boundCensusLinuxFailureR32Scope;

export async function readBoundCensusFailureLocalR32(path){
 const named=await lstat(path);need(named.isFile()&&!named.isSymbolicLink()&&named.nlink===1&&named.size<=2*1024**2,'R32_BOUND_FAILURE_LOCAL_UNTRUSTED');
 const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{const before=await f.stat(),keys=['dev','ino','size','mtimeMs','ctimeMs'];need(keys.every(k=>before[k]===named[k]),'R32_BOUND_FAILURE_LOCAL_CHANGED');const raw=await f.readFile(),after=await f.stat(),now=await lstat(path);need(raw.length===before.size&&keys.every(k=>before[k]===after[k]&&before[k]===now[k]),'R32_BOUND_FAILURE_LOCAL_CHANGED');return raw}finally{await f.close()}
}
async function wx(path,raw){const f=await open(path,'wx',0o600);try{await f.writeFile(raw);await f.sync()}finally{await f.close()}}
async function writePrivate(value){const path='.jarvis-dev/maintenance/bound-census-linux-failure-private-'+Date.now()+'-'+randomUUID()+'.json',raw=Buffer.from(JSON.stringify(value)+'\n');await wx(path,raw);return{path,sha256:sha(raw),bytes:raw.length}}
async function writePublic(value){const path='artifacts/software-factory/goals-r29/r32-bound-census-linux-failure-independent-observation-'+Date.now()+'-'+randomUUID()+'.json',raw=Buffer.from(JSON.stringify(value,null,2)+'\n');await wx(path,raw);return{path,sha256:sha(raw),bytes:raw.length}}
async function settledReads(paths,read){const rows=await Promise.allSettled(paths.map(path=>Promise.resolve().then(()=>read(path))));const failed=rows.find(v=>v.status==='rejected');if(failed)throw failed.reason;return rows.map(v=>Buffer.from(v.value))}
function defaultReadRoot(params,program){const r=spawnSync('ssh',['-F',lanProfile,'-o','BatchMode=yes','jarvis-101','sudo -n python3 -'],{input:python(params,program),encoding:'utf8',timeout:120000,windowsHide:true,maxBuffer:32*1024**2});return{status:r.status,signal:r.signal,stdout:r.stdout??'',stderr:r.stderr??'',errorCode:r.error?.code??null}}

export function assertBoundCensusFailureContextR32(q,start,terminal){
 need(q?.kind==='r32-bound-census-linux-once'&&q.nonce===S.nonce&&q.phase===S.phase&&q.dispatched===true&&q.startUncertain===false&&q.automaticRetry===false,'R32_BOUND_FAILURE_JOURNAL_CHANGED');
 for(const v of [start,terminal])need(v?.kind==='r32-bound-census-linux-parent-observation'&&v.nonce===S.nonce&&v.phase===S.phase&&v.ownerSHA256===q.ownerSHA256&&v.activationSHA256===q.activationSHA256&&v.onceSHA256===q.onceSHA256&&v.dispatchSubmitted===true&&v.independentSubsetQualified===false&&v.fullProtectionQualified===false&&v.productCodeExecuted===false&&v.modelsInvoked===false,'R32_BOUND_FAILURE_ACTUAL_SCOPE_CHANGED');
 need(canonical(q.owner)===canonical(start.owner)&&canonical(q.owner)===canonical(terminal.owner)&&terminal.owner.pid===2851903&&terminal.owner.startTicks==='30909870'&&terminal.fixtureProcess?.pid===2851905&&terminal.fixtureProcess.startTicks==='30909878'&&terminal.fixtureProcess.ppid===terminal.owner.pid,'R32_BOUND_FAILURE_KNOWN_IDENTITIES_CHANGED');
 need(terminal.fixture?.fixtureQualified===false&&terminal.fixture.errorCode==='R32_FIXTURE_INCOMPLETE'&&terminal.fixture.errno===2&&terminal.result?.fixtureExitCode===1&&terminal.result.fixturePIDFDClosed===true&&terminal.result.fixtureEmergencyStopUsed===false&&terminal.unit?.MainPID==='0'&&terminal.unit.ActiveState==='failed','R32_BOUND_FAILURE_TERMINAL_CHANGED');
 need(canonical(terminal.result.fixtureProcessIdentity)===canonical(terminal.fixtureProcess)&&terminal.result.fixtureKernelExitProof?.requestedPID===terminal.fixtureProcess.pid&&terminal.result.fixtureKernelExitProof.identityBound===true&&terminal.result.fixtureKernelExitProof.exitConfirmed===true&&terminal.result.fixtureKernelExitProof.procPathAbsent===true&&[1,17].includes(terminal.result.fixtureKernelExitProof.pollEvents),'R32_BOUND_FAILURE_PARENT_FACTS_CHANGED');
 need(boundCensusLinuxFailureHostR32Scope.actualCheckSHA256===S.terminal.sha256&&Object.entries(terminal.reportSHA256).every(([name,h])=>boundCensusLinuxFailureHostR32Scope.records['work/'+name]?.sha256===h)&&q.unitProofSHA256===terminal.unitProofSHA256&&boundCensusLinuxFailureHostR32Scope.records['unit-proof.json'].sha256===terminal.unitProofSHA256,'R32_BOUND_FAILURE_REMOTE_PIN_CHANGED');
 return {q,start,terminal};
}

export function assertBoundCensusFailureHostR32(v,terminal){
 const scope=boundCensusLinuxFailureHostR32Scope;
 assertBoundCensusLinuxFailureHostR32(v);
 need(v?.schemaVersion===1&&v.kind==='r32-bound-census-linux-failure-scope-host-observation'&&v.failureScope===true&&v.contextSHA256===sha(sortedCanonical(scope))&&sortedCanonical(v.scopeBinding)===sortedCanonical(scope)&&v.mutationsPerformed===false&&v.resourcesRemoved===false&&v.signalsSent===false,'R32_BOUND_FAILURE_HOST_SCOPE_CHANGED');
 need(v.tinyChildIdentity===null&&v.unknownTinyChildIdentityPreserved===true&&v.fixtureQualified===false&&v.fullProtectionQualified===false&&v.actualLinuxQualified===false&&v.modelsInvoked===false&&v.productCodeExecuted===false,'R32_BOUND_FAILURE_FALSE_QUALIFICATION');
 need(v.recordsStable===true&&v.namespaceStable===true&&v.unitProofVerified===true&&v.unit?.Id===terminal.owner.unit&&/^[0-9]+$/.test(v.unit.MainPID??'')&&['failed','inactive','active','activating','deactivating'].includes(v.unit.ActiveState),'R32_BOUND_FAILURE_HOST_LIFECYCLE_INCOMPLETE');
 need(v.knownProcesses?.owner?.pid===terminal.owner.pid&&v.knownProcesses?.fixture?.pid===terminal.fixtureProcess.pid&&typeof v.knownProcesses.owner.present==='boolean'&&typeof v.knownProcesses.fixture.present==='boolean','R32_BOUND_FAILURE_PROCESS_BINDING_CHANGED');
 need(Array.isArray(v.processScans)&&v.processScans.length===2,'R32_BOUND_FAILURE_PROCESS_DENOMINATOR_MISSING');
 for(const scan of v.processScans){need(['total','inspected','provenExited','incompleteCount','relatedCount'].every(k=>Number.isSafeInteger(scan[k])&&scan[k]>=0)&&scan.total===scan.inspected+scan.provenExited+scan.incompleteCount&&Array.isArray(scan.incomplete)&&scan.incomplete.length===scan.incompleteCount&&typeof scan.complete==='boolean','R32_BOUND_FAILURE_PROCESS_DENOMINATOR_CHANGED');need(scan.complete===(scan.incompleteCount===0&&scan.relatedCount===0),'R32_BOUND_FAILURE_PROCESS_COMPLETENESS_CHANGED');for(const f of scan.incomplete)need(Number.isSafeInteger(f.pid)&&f.pid>0&&READ_PHASES.has(f.phase)&&READ_SUBPHASES.has(f.readSubphase)&&/^(PROCESS_READ_ERROR|R29_CLEANUP_[A-Z0-9_]+)$/.test(f.errorCode??'')&&(f.errno===null||Number.isSafeInteger(f.errno)),'R32_BOUND_FAILURE_PROCESS_ERROR_SHAPE_CHANGED')}
 const expected=scope.records;
 need(expected&&v.records&&canonical(Object.keys(v.records).sort())===canonical(Object.keys(expected).sort()),'R32_BOUND_FAILURE_REPORT_SET_CHANGED');
 for(const [name,pin]of Object.entries(expected)){const row=v.records[name];need(row&&row.readComplete===true&&row.sha256===pin.sha256&&Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=1048576&&(pin.bytes===null||pin.bytes===undefined||row.bytes===pin.bytes)&&typeof row.base64==='string','R32_BOUND_FAILURE_REPORT_BYTES_CHANGED');const raw=Buffer.from(row.base64,'base64');need(raw.toString('base64')===row.base64&&raw.length===row.bytes&&sha(raw)===pin.sha256,'R32_BOUND_FAILURE_REPORT_RAW_CHANGED')}
 need(typeof v.cgroup?.absent==='boolean'&&typeof v.cgroup.complete==='boolean'&&typeof v.namespaceFD?.complete==='boolean'&&Number.isSafeInteger(v.namespaceFD.relatedCount)&&v.namespaceFD.relatedCount>=0&&typeof v.sockets?.complete==='boolean'&&Number.isSafeInteger(v.sockets.count)&&v.sockets.count>=0,'R32_BOUND_FAILURE_SCOPE_READ_INCOMPLETE');
 const complete=v.knownProcesses.owner.present===false&&v.knownProcesses.fixture.present===false&&v.unit.MainPID==='0'&&['failed','inactive'].includes(v.unit.ActiveState)&&v.unit.ControlGroup===''&&v.cgroup.absent===true&&v.cgroup.complete&&v.processScans.every(s=>s.complete&&s.relatedCount===0)&&v.namespaceFD.relatedCount===0&&v.namespaceFD.complete&&v.sockets.count===0&&v.sockets.complete;
 need(v.cleanupScopeComplete===complete,'R32_BOUND_FAILURE_CLEANUP_CLAIM_CHANGED');
 return v;
}

export function projectBoundCensusFailureHostR32(v){return{
 scope:v.scopeBinding,records:Object.fromEntries(Object.entries(v.records).map(([name,r])=>[name,{sha256:r.sha256,bytes:r.bytes,readComplete:r.readComplete}])),recordsStable:v.recordsStable,namespaceStable:v.namespaceStable,
 knownProcesses:Object.fromEntries(['owner','fixture'].map(k=>[k,{pid:v.knownProcesses[k].pid,present:v.knownProcesses[k].present}])),unit:{Id:v.unit.Id,LoadState:v.unit.LoadState,ActiveState:v.unit.ActiveState,SubState:v.unit.SubState,MainPID:v.unit.MainPID,InvocationID:v.unit.InvocationID},unitProofVerified:v.unitProofVerified,
 processScans:v.processScans.map(s=>({total:s.total,inspected:s.inspected,provenExited:s.provenExited,incompleteCount:s.incompleteCount,relatedCount:s.relatedCount,complete:s.complete,incomplete:s.incomplete.map(x=>({pid:x.pid,phase:x.phase,readSubphase:x.readSubphase,errorCode:x.errorCode,errno:x.errno}))})),
 cgroup:{absent:v.cgroup.absent,complete:v.cgroup.complete},namespaceFD:{relatedCount:v.namespaceFD.relatedCount,complete:v.namespaceFD.complete},sockets:{count:v.sockets.count,complete:v.sockets.complete},cleanupScopeComplete:v.cleanupScopeComplete,tinyChildIdentity:null,unknownTinyChildIdentityPreserved:true
}}

export async function readBoundCensusLinuxFailureR32({activation=boundCensusLinuxFailureR32Activation}={},deps={}){
 if(activation===null)return{schemaVersion:1,kind:'r32-bound-census-linux-failure-reader-preparation',ready:false,reason:'R32_BOUND_FAILURE_REVIEW_NOT_PINNED',remoteOperations:false,fullProtectionQualified:false,fixtureQualified:false,modelsInvoked:false,productCodeExecuted:false};
 need(activation?.kind==='r32-bound-census-linux-failure-read-activation'&&activation.remoteReadAuthorized===true&&H.test(activation.callerSHA256??'')&&H.test(activation.hostSHA256??'')&&/^artifacts\/software-factory\/goals-r29\/r32-bound-census-linux-failure-reader-independent-local-review-[0-9]{13}-[a-f0-9-]{36}\.json$/.test(activation.review?.path??'')&&H.test(activation.review.sha256??''),'R32_BOUND_FAILURE_ACTIVATION_REQUIRED');
 const d={readLocal:readBoundCensusFailureLocalR32,readRoot:defaultReadRoot,writePrivate,writePublic,now:Date.now,...deps};
 const refs=[...S.sources,S.journal,S.start,S.terminal,{path:S.callerPath,sha256:activation.callerSHA256},{path:S.hostPath,sha256:activation.hostSHA256},activation.review];
 const before=await settledReads(refs.map(r=>r.path),d.readLocal);need(before.every((b,i)=>sha(b)===refs[i].sha256),'R32_BOUND_FAILURE_LOCAL_SOURCE_CHANGED');
 const review=JSON.parse(before.at(-1));need(review.kind==='r32-bound-census-linux-failure-reader-independent-local-review'&&review.callerSHA256===activation.callerSHA256&&review.hostSHA256===activation.hostSHA256&&review.remainingP0P1===0&&review.staticPreparationReady===true&&review.remoteOperations===false&&review.actualFailureScopeRead===false,'R32_BOUND_FAILURE_REVIEW_REQUIRED');
 const q=JSON.parse(before[S.sources.length]),start=JSON.parse(before[S.sources.length+1]),terminal=JSON.parse(before[S.sources.length+2]);assertBoundCensusFailureContextR32(q,start,terminal);
 const program=boundCensusLinuxFailureHostR32Program(),params=boundCensusLinuxFailureHostR32Scope;
 let transport,host,privateRef,errorCode;
 try{transport=await d.readRoot(params,program);if(typeof transport==='string')transport={status:0,signal:null,stdout:transport,stderr:'',errorCode:null};need(transport&&Object.hasOwn(transport,'status')&&typeof transport.stdout==='string'&&typeof transport.stderr==='string','R32_BOUND_FAILURE_TRANSPORT_SHAPE_CHANGED');privateRef=await d.writePrivate({kind:'r32-bound-census-linux-failure-private-observation',at:new Date(d.now()).toISOString(),sourceRefs:refs,programSHA256:sha(program),paramsSHA256:sha(canonical(params)),transport});if(transport.status!==0||transport.signal!==null){const closed=transport.stderr.match(/(?:^|\n)(?:RuntimeError|ValueError): (R32_BOUND_FAILURE_[A-Z0-9_]+)\r?\n?$/);throw Error(closed?.[1]??'R32_BOUND_FAILURE_SSH_READ_INCOMPLETE')}host=assertBoundCensusFailureHostR32(JSON.parse(transport.stdout),terminal)}catch(error){errorCode=/^R32_BOUND_FAILURE_[A-Z0-9_]+$/.test(error?.message??'')?error.message:'R32_BOUND_FAILURE_READ_INCOMPLETE';if(!privateRef)privateRef=await d.writePrivate({kind:'r32-bound-census-linux-failure-private-error',transport:transport??null,error:{name:error?.name,message:error?.message,stack:error?.stack}})}
 const after=await settledReads(refs.map(r=>r.path),d.readLocal);need(after.every((b,i)=>b.equals(before[i])),'R32_BOUND_FAILURE_LOCAL_SOURCE_READ_CHANGED');
 const value={schemaVersion:1,kind:'r32-bound-census-linux-failure-independent-observation',at:new Date(d.now()).toISOString(),nonce:S.nonce,phase:S.phase,ready:!!host&&host.cleanupScopeComplete===true,errorCode:errorCode??null,
 sourceRefs:refs,hostProgramSHA256:sha(program),payloadSHA256:sha(canonical(params)),privateObservation:{path:privateRef.path,sha256:privateRef.sha256,bytes:privateRef.bytes},
 failurePreserved:true,originalFixtureError:{errorCode:'R32_FIXTURE_INCOMPLETE',errno:2,readSubphase:null},actualSubsetPassed:false,fixtureQualified:false,actualLinuxQualificationPassed:false,fullProtectionQualified:false,modelsInvoked:false,productCodeExecuted:false,tinyChildIdentity:null,unknownTinyChildIdentityPreserved:true,
 currentFailureScopeIndependentlyObserved:!!host,currentFailureScopeCleanupVerified:!!host&&host.cleanupScopeComplete===true,originalHistoricalChildIdentityComplete:false,remoteReadOnly:true,remoteMutations:false,host:host?projectBoundCensusFailureHostR32(host):null};
 const receipt=await d.writePublic(value);return{...value,receipt};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){let v;try{need(process.argv.length===2,'R32_BOUND_FAILURE_CLI_INVALID');v=await readBoundCensusLinuxFailureR32()}catch(e){v={kind:'r32-bound-census-linux-failure-reader-preparation',ready:false,errorCode:/^R32_BOUND_FAILURE_[A-Z0-9_]+$/.test(e?.message??'')?e.message:'R32_BOUND_FAILURE_PREPARATION_INCOMPLETE',rawErrorExported:false,fixtureQualified:false,fullProtectionQualified:false};process.exitCode=1}console.log(JSON.stringify(v))}
