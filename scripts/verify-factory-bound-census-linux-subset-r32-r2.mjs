/** Independent raw-byte and physical-scope qualifier for one R2 Linux subset. */
import {createHash,randomUUID} from 'node:crypto';
import {open,lstat,constants} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {lanProfile,python} from './managed-server-client.mjs';
import {boundCensusLinuxSuccessR32R2HostScope,boundCensusLinuxSuccessR32R2HostProgram,assertBoundCensusLinuxSuccessR32R2Host} from './factory-bound-census-linux-success-host-r32-r2.mjs';
import {assertBoundCensusLinuxR32R2Frame} from './start-factory-bound-census-linux-r32-r2.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex');
const need=(v,c)=>{if(!v)throw Error(c)};
const H=/^[a-f0-9]{64}$/;
const canonical=v=>JSON.stringify(v);
const sortedCanonical=v=>Array.isArray(v)?'['+v.map(sortedCanonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+sortedCanonical(v[k])).join(',')+'}':JSON.stringify(v);
const READ_PHASES=new Set(['pidfd-attach','process-read','scan-close']);
const READ_SUBPHASES=new Set(['PIDFD_OPEN','POST_ATTACH_PROC_IDENTITY','PROCESS_READ','PROC_DIRECTORY_OPEN','PROC_DIRECTORY_METADATA','STAT_BEFORE','CMDLINE_READ','CGROUP_READ','CWD_READLINK','EXE_READLINK','FD_DIRECTORY_OPEN','FD_SCANDIR_OPEN','FD_SCANDIR_NEXT','FD_SCANDIR_CLOSE','FD_ENTRY_LIMIT','FD_TARGET_READLINK','FD_DIRECTORY_CLOSE','STAT_AFTER','PROC_PATH_IDENTITY_AFTER','PROC_DIRECTORY_CLOSE','PIDFD_POLL','PIDFD_EXIT_PATH_CHECK','SCAN_CLOSE_PROC_IDENTITY','SCAN_CLOSE']);
export const boundCensusLinuxSubsetR32R2Activation=null;
export const boundCensusLinuxSubsetR32R2Scope=Object.freeze({
 schemaVersion:1,kind:'r32-bound-census-linux-success-subset-read-scope-r2',
 callerPath:'scripts/verify-factory-bound-census-linux-subset-r32-r2.mjs',
 hostPath:'scripts/factory-bound-census-linux-success-host-r32-r2.mjs',
 nonce:'2b53acefd29220018a75e52343403e4a',phase:'native',
 journal:{path:'.jarvis-dev/maintenance/factory-r32-bound-census-linux-r2-once.json',sha256:'bf5cfce06580f1d6783d231e29a10eb2344983ed27c55a24d1e244f0e2bf19d5'},
 start:{path:'artifacts/software-factory/goals-r29/bound-census-linux-r32-r2-start-1791858280061-0623e18b-0397-4601-baf6-01587b390693.json',sha256:'2ed962ccb77daa62cf1ec0abacb0b9d51ef9de72da7a0895b566cc34bd99ab71'},
 terminal:{path:'artifacts/software-factory/goals-r29/bound-census-linux-r32-r2-check-1791858291243-84277130-55cb-4acc-ac55-0411bc561643.json',sha256:'2c07d9c3f99a8820756373bc93c126bf93196ea68aa576d9c8266c585d758d86'},
 sourceReview:{path:'artifacts/software-factory/goals-r29/r32-bound-census-linux-parent-independent-local-review-r2-1791858137896-83aebbac-047a-41a8-8e9b-d57599fcd7c4.json',sha256:'7f38f5ebd735b40673f543d5e9df6fefda39448e8aeee8d8326c66783990c0c3'},
 executionHostProgram:{path:'artifacts/software-factory/goals-r29/r32-bound-census-linux-parent-host-source-897cee2fc400d8df146e461db3e5944e7a0a2863e9bf19263cb7ed3eaf9bd073.py',sha256:'897cee2fc400d8df146e461db3e5944e7a0a2863e9bf19263cb7ed3eaf9bd073'},
 generated:{native:'b357b2d4afaab2938a5e226d42ffbe6d12d3757f0973488ad696108761a36a78',build:'e2385dcb6001fcc1524a72edac61fc671e83be62339308daabfb5822dda8c1ba'},
 functionSHA256:{process_record:'ef969eb538c98e9614a558da26986ab6a4247c6ec1edd6a6728b2b5fc95f2c93',pidfd_poll:'94132b924aa09bc655f476438286999b10dc37d3e6e1a27feb3bd9196ef2e533',pidfd_exit_proof:'ee4ab7a845eb51a031f8fccaf8daf3eefabe9b222e3bf03a1a3819aa1c200109'},
 sources:[
  {path:'scripts/start-factory-bound-census-linux-r32-r2.mjs',sha256:'def4a2d157eb8ad13897b397b9bc9e5f863efa8c9b2b5dda29e491800ebe8604'},
  {path:'scripts/factory-bound-census-linux-owner-r32-r2.py',sha256:'d637049a90ccc5f0c58ba35c3137f61ada97ce9c49999a0470dd896143cf72b6'},
  {path:'scripts/factory-bound-census-linux-fixture-r32-r2.py',sha256:'85ce3f6cd528851f360453ccab5e46208a6708cd45a9e45992524f8192d2e15d'},
  {path:'scripts/factory-bound-process-census-r32.mjs',sha256:'a08c44ee006ea993452d39616a217bbf7e45169fd827f580c951a9796cac7252'},
  {path:'scripts/verify-factory-target-cleanup-r29.mjs',sha256:'d4860d172aa4b4a2949281ac5ae416d216625b8ed43e394d57e30ba9f0873dd6'},
  {path:'scripts/verify-factory-truth-gate-build-cleanup-r29.mjs',sha256:'48e2089fd03db8d3186486edf207550ad157e412071c10515f5a1d892be59d86'},
  {path:'scripts/managed-server-client.mjs',sha256:'e287938e2d79b0335523d3d198bd93b588541866cebc2c21d997ae6fce5e4a9f'},
  {path:'scripts/factory-bound-census-linux-failure-host-r32.mjs',sha256:'80bec264e0b19918831e9eeeff58074b6f63473bc2e0035baa1ed0dacf5bf65c'}
 ],
 oldFailedAttemptUntouched:true,fullProtectionQualified:false,modelsInvoked:false,productCodeExecuted:false
});
const S=boundCensusLinuxSubsetR32R2Scope;

export async function readBoundCensusSubsetLocalR32R2(path){
 const named=await lstat(path);need(named.isFile()&&!named.isSymbolicLink()&&named.nlink===1&&named.size<=2*1024**2,'R32_BOUND_SUBSET_LOCAL_UNTRUSTED');
 const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{const before=await f.stat(),keys=['dev','ino','size','mtimeMs','ctimeMs'];need(keys.every(k=>before[k]===named[k]),'R32_BOUND_SUBSET_LOCAL_CHANGED');const raw=await f.readFile(),after=await f.stat(),now=await lstat(path);need(raw.length===before.size&&keys.every(k=>before[k]===after[k]&&before[k]===now[k]),'R32_BOUND_SUBSET_LOCAL_CHANGED');return raw}finally{await f.close()}
}
async function wx(path,raw){const f=await open(path,'wx',0o600);try{await f.writeFile(raw);await f.sync()}finally{await f.close()}}
async function writePrivate(value){const path='.jarvis-dev/maintenance/bound-census-linux-subset-r2-private-'+Date.now()+'-'+randomUUID()+'.json',raw=Buffer.from(JSON.stringify(value)+'\n');await wx(path,raw);return{path,sha256:sha(raw),bytes:raw.length}}
async function writeRawPrivate(name,raw){need(['stdout','host'].includes(name)&&Buffer.isBuffer(raw),'R32_BOUND_SUBSET_RAW_KIND_INVALID');const path='.jarvis-dev/maintenance/bound-census-linux-subset-r2-'+name+'-raw-'+Date.now()+'-'+randomUUID()+'.json';await wx(path,raw);return{path,sha256:sha(raw),bytes:raw.length}}
async function writePublic(value){const path='artifacts/software-factory/goals-r29/r32-bound-census-linux-subset-independent-result-r2-'+Date.now()+'-'+randomUUID()+'.json',raw=Buffer.from(JSON.stringify(value,null,2)+'\n');await wx(path,raw);return{path,sha256:sha(raw),bytes:raw.length}}
async function settledReads(paths,read){const rows=await Promise.allSettled(paths.map(path=>Promise.resolve().then(()=>read(path))));const failed=rows.find(v=>v.status==='rejected');if(failed)throw failed.reason;return rows.map(v=>Buffer.from(v.value))}
function defaultReadRoot(params,program){const r=spawnSync('ssh',['-F',lanProfile,'-o','BatchMode=yes','jarvis-101','sudo -n python3 -'],{input:python(params,program),encoding:'utf8',timeout:120000,windowsHide:true,maxBuffer:32*1024**2});return{status:r.status,signal:r.signal,stdout:r.stdout??'',stderr:r.stderr??'',errorCode:r.error?.code??null}}

export function assertBoundCensusSubsetContextR32R2(q,start,terminal){
 need(q?.kind==='r32-bound-census-linux-once-r2'&&q.nonce===S.nonce&&q.phase===S.phase&&q.dispatched===true&&q.startUncertain===false&&q.automaticRetry===false,'R32_BOUND_SUBSET_JOURNAL_CHANGED');
 assertBoundCensusLinuxR32R2Frame(start,q,false);assertBoundCensusLinuxR32R2Frame(terminal,q,true);
 need(sortedCanonical(q.owner)===sortedCanonical(start.owner)&&sortedCanonical(q.owner)===sortedCanonical(terminal.owner)&&terminal.owner.pid===2916845&&terminal.owner.startTicks==='31091588'&&terminal.fixtureProcess?.pid===2916847&&terminal.fixtureProcess.startTicks==='31091596'&&terminal.fixtureProcess.ppid===terminal.owner.pid,'R32_BOUND_SUBSET_KNOWN_IDENTITIES_CHANGED');
 assertBoundCensusSubsetFunctionEvidenceR32R2(terminal.fixture,terminal.result,terminal.fixtureProcess,terminal.owner);
 need(boundCensusLinuxSuccessR32R2HostScope.actualCheckSHA256===S.terminal.sha256&&Object.entries(terminal.reportSHA256).every(([name,h])=>boundCensusLinuxSuccessR32R2HostScope.records['work/'+name]?.sha256===h)&&q.unitProofSHA256===terminal.unitProofSHA256&&boundCensusLinuxSuccessR32R2HostScope.records['unit-proof.json'].sha256===terminal.unitProofSHA256,'R32_BOUND_SUBSET_REMOTE_PIN_CHANGED');
 return {q,start,terminal};
}

export function assertBoundCensusSubsetFunctionEvidenceR32R2(f,result,fixture,owner){
 const identity=f?.childIdentity,proof=f?.originalBoundExitProof,k=proof?.kernelProof,p=result?.fixtureKernelExitProof;
 need(f?.kind==='r32-bound-census-linux-subset-qualification-r2'&&f.phase===S.phase&&f.fixtureQualified===true&&f.uid===1000&&f.gid===1000&&f.internalDeadlineSeconds===45&&f.requiredParentDeadlineSeconds===90&&f.fixturePhase==='COMPLETE'&&f.firstReadSubphase===null&&f.readyProtocolSHA256==='14bf08734c1a58057bb3df1c7427f1896ae91b11c8c4b3b5698f9c71a61becb4'&&['descriptorClosed','childReaped','readyHandshakeCompleted','releaseGateSent','liveRecordRead','naturalChildExit','alreadyDeadAttachRejected'].every(n=>f[n]===true)&&f.signalsSent===false&&f.alreadyDeadAttachErrno===3,'R32_BOUND_SUBSET_FUNCTION_RESULT_INCOMPLETE');
 need(['fullProtectionQualified','fullProcCensusExecuted','protectedInventoryRead','nodeACKRead','queueRead','productCodeExecuted','modelsInvoked','rawArgvExported','privateEnvironmentExported'].every(n=>f[n]===false)&&f.generatedSourceSHA256===S.generated.native&&sortedCanonical(f.functionSHA256)===sortedCanonical(S.functionSHA256),'R32_BOUND_SUBSET_SOURCE_FUNCTION_CHANGED');
 need(identity?.pid===2916849&&identity.ppid===fixture.pid&&identity.boot===owner.boot&&identity.procDevice===160&&identity.procInode===53992193&&identity.startTicks==='31091601'&&f.requestedChildPID===identity.pid&&sortedCanonical(Object.keys(identity).sort())===sortedCanonical(['boot','pid','ppid','procDevice','procInode','startTicks']),'R32_BOUND_SUBSET_CHILD_IDENTITY_CHANGED');
 need(proof?.pid===identity.pid&&proof.boot===identity.boot&&proof.listedProcIdentity?.device===identity.procDevice&&proof.listedProcIdentity?.inode===identity.procInode&&sortedCanonical(proof.processIdentity)===sortedCanonical(identity)&&k?.type==='pidfd-POLLIN'&&k.requestedPID===identity.pid&&['attached','identityBound','exitConfirmed','procPathAbsent'].every(n=>k[n]===true)&&[1,17].includes(k.pollEvents),'R32_BOUND_SUBSET_ORIGINAL_KERNEL_PROOF_CHANGED');
 need(result?.fixtureExitCode===0&&result.fixturePIDFDClosed===true&&result.fixtureEmergencyStopUsed===false&&result.errorCode===null&&result.ownerInputsStable===true&&sortedCanonical(result.fixtureResult)===sortedCanonical(f)&&sortedCanonical(result.fixtureProcessIdentity)===sortedCanonical(fixture)&&p?.type==='parent-owned-fixture-pidfd-POLLIN'&&p.requestedPID===fixture.pid&&sortedCanonical(p.processIdentity)===sortedCanonical(fixture)&&['attached','identityBound','exitConfirmed','procPathAbsent'].every(n=>p[n]===true)&&[1,17].includes(p.pollEvents),'R32_BOUND_SUBSET_PARENT_KERNEL_PROOF_CHANGED');
 return true;
}

export function assertBoundCensusSubsetHostR32R2(v,terminal){
 const scope=boundCensusLinuxSuccessR32R2HostScope;
 assertBoundCensusLinuxSuccessR32R2Host(v);
 need(v?.schemaVersion===1&&v.kind==='r32-bound-census-linux-success-scope-host-observation-r2'&&v.contextSHA256===sha(sortedCanonical(scope))&&sortedCanonical(v.scopeBinding)===sortedCanonical(scope)&&v.mutationsPerformed===false&&v.resourcesRemoved===false&&v.signalsSent===false,'R32_BOUND_SUBSET_HOST_SCOPE_CHANGED');
 need(v.actualLinuxQualified===false&&v.fullProtectionQualified===false&&v.modelsInvoked===false&&v.productCodeExecuted===false&&sortedCanonical(v.tinyChildIdentity)===sortedCanonical(terminal.fixture.childIdentity),'R32_BOUND_SUBSET_FALSE_QUALIFICATION');
 need(v.recordsStable===true&&v.namespaceStable===true&&v.unitProofVerified===true&&v.unit?.Id===terminal.owner.unit&&/^[0-9]+$/.test(v.unit.MainPID??'')&&['failed','inactive','active','activating','deactivating'].includes(v.unit.ActiveState),'R32_BOUND_SUBSET_HOST_LIFECYCLE_INCOMPLETE');
 need(['owner','fixture','tiny'].every(n=>v.knownProcesses?.[n]?.pid===({owner:terminal.owner.pid,fixture:terminal.fixtureProcess.pid,tiny:terminal.fixture.childIdentity.pid})[n]&&typeof v.knownProcesses[n].present==='boolean'),'R32_BOUND_SUBSET_PROCESS_BINDING_CHANGED');
 need(Array.isArray(v.processScans)&&v.processScans.length===2,'R32_BOUND_SUBSET_PROCESS_DENOMINATOR_MISSING');
 for(const scan of v.processScans){need(['total','inspected','provenExited','incompleteCount','relatedCount'].every(k=>Number.isSafeInteger(scan[k])&&scan[k]>=0)&&scan.total===scan.inspected+scan.provenExited+scan.incompleteCount&&Array.isArray(scan.incomplete)&&scan.incomplete.length===scan.incompleteCount&&typeof scan.complete==='boolean','R32_BOUND_SUBSET_PROCESS_DENOMINATOR_CHANGED');need(scan.complete===(scan.incompleteCount===0&&scan.relatedCount===0),'R32_BOUND_SUBSET_PROCESS_COMPLETENESS_CHANGED');for(const f of scan.incomplete)need(Number.isSafeInteger(f.pid)&&f.pid>0&&READ_PHASES.has(f.phase)&&READ_SUBPHASES.has(f.readSubphase)&&/^(PROCESS_READ_ERROR|R29_CLEANUP_[A-Z0-9_]+)$/.test(f.errorCode??'')&&(f.errno===null||Number.isSafeInteger(f.errno)),'R32_BOUND_SUBSET_PROCESS_ERROR_SHAPE_CHANGED')}
 const expected=scope.records;
 need(expected&&v.records&&canonical(Object.keys(v.records).sort())===canonical(Object.keys(expected).sort()),'R32_BOUND_SUBSET_REPORT_SET_CHANGED');
 for(const [name,pin]of Object.entries(expected)){const row=v.records[name];need(row&&row.readComplete===true&&row.sha256===pin.sha256&&Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=1048576&&(pin.bytes===null||pin.bytes===undefined||row.bytes===pin.bytes)&&typeof row.base64==='string','R32_BOUND_SUBSET_REPORT_BYTES_CHANGED');const raw=Buffer.from(row.base64,'base64');need(raw.toString('base64')===row.base64&&raw.length===row.bytes&&sha(raw)===pin.sha256,'R32_BOUND_SUBSET_REPORT_RAW_CHANGED')}
 const decode=n=>JSON.parse(Buffer.from(v.records[n].base64,'base64'));const actualFixture=decode('work/fixture.stdout.json'),actualResult=decode('work/result.json');assertBoundCensusSubsetFunctionEvidenceR32R2(actualFixture,actualResult,decode('work/fixture-process.json'),decode('work/owner.json'));need(sortedCanonical(actualFixture)===sortedCanonical(terminal.fixture)&&sortedCanonical(actualResult)===sortedCanonical(terminal.result),'R32_BOUND_SUBSET_RAW_PRODUCER_CHANGED');
 need(typeof v.cgroup?.absent==='boolean'&&typeof v.cgroup.complete==='boolean'&&typeof v.namespaceFD?.complete==='boolean'&&Number.isSafeInteger(v.namespaceFD.relatedCount)&&v.namespaceFD.relatedCount>=0&&typeof v.sockets?.complete==='boolean'&&Number.isSafeInteger(v.sockets.count)&&v.sockets.count>=0,'R32_BOUND_SUBSET_SCOPE_READ_INCOMPLETE');
 const complete=['owner','fixture','tiny'].every(n=>v.knownProcesses[n].present===false)&&v.unit.MainPID==='0'&&['failed','inactive'].includes(v.unit.ActiveState)&&v.unit.ControlGroup===''&&v.cgroup.absent===true&&v.cgroup.complete&&v.processScans.every(s=>s.complete&&s.relatedCount===0)&&v.namespaceFD.relatedCount===0&&v.namespaceFD.complete&&v.sockets.count===0&&v.sockets.complete;
 need(v.cleanupScopeComplete===complete,'R32_BOUND_SUBSET_CLEANUP_CLAIM_CHANGED');
 return v;
}

export function projectBoundCensusSubsetHostR32R2(v){return{
 scope:v.scopeBinding,records:Object.fromEntries(Object.entries(v.records).map(([name,r])=>[name,{sha256:r.sha256,bytes:r.bytes,readComplete:r.readComplete}])),recordsStable:v.recordsStable,namespaceStable:v.namespaceStable,
 knownProcesses:Object.fromEntries(['owner','fixture','tiny'].map(k=>[k,{pid:v.knownProcesses[k].pid,present:v.knownProcesses[k].present}])),unit:{Id:v.unit.Id,LoadState:v.unit.LoadState,ActiveState:v.unit.ActiveState,SubState:v.unit.SubState,MainPID:v.unit.MainPID,InvocationID:v.unit.InvocationID},unitProofVerified:v.unitProofVerified,
 processScans:v.processScans.map(s=>({total:s.total,inspected:s.inspected,provenExited:s.provenExited,incompleteCount:s.incompleteCount,relatedCount:s.relatedCount,complete:s.complete,incomplete:s.incomplete.map(x=>({pid:x.pid,phase:x.phase,readSubphase:x.readSubphase,errorCode:x.errorCode,errno:x.errno}))})),
 cgroup:{absent:v.cgroup.absent,complete:v.cgroup.complete},namespaceFD:{relatedCount:v.namespaceFD.relatedCount,complete:v.namespaceFD.complete},sockets:{count:v.sockets.count,complete:v.sockets.complete},cleanupScopeComplete:v.cleanupScopeComplete,tinyChildIdentity:v.tinyChildIdentity
}}

export async function verifyBoundCensusLinuxSubsetR32R2({activation=boundCensusLinuxSubsetR32R2Activation}={},deps={}){
 if(activation===null)return{schemaVersion:1,kind:'r32-bound-census-linux-subset-reader-preparation-r2',ready:false,reason:'R32_BOUND_SUBSET_REVIEW_NOT_PINNED',remoteOperations:false,fullProtectionQualified:false,actualLinux3FunctionQualified:false,modelsInvoked:false,productCodeExecuted:false};
 need(activation?.kind==='r32-bound-census-linux-subset-read-activation-r2'&&activation.remoteReadAuthorized===true&&H.test(activation.callerSHA256??'')&&H.test(activation.hostSHA256??'')&&/^artifacts\/software-factory\/goals-r29\/r32-bound-census-linux-subset-reader-independent-local-review-r2-[0-9]{13}-[a-f0-9-]{36}\.json$/.test(activation.review?.path??'')&&H.test(activation.review.sha256??'')&&H.test(activation.hostProgram?.sha256??'')&&activation.hostProgram.path==='artifacts/software-factory/goals-r29/r32-bound-census-linux-success-host-source-'+activation.hostProgram.sha256+'.py','R32_BOUND_SUBSET_ACTIVATION_REQUIRED');
 const d={readLocal:readBoundCensusSubsetLocalR32R2,readRoot:defaultReadRoot,writePrivate,writeRawPrivate,writePublic,now:Date.now,...deps};
 const refs=[...S.sources,S.journal,S.start,S.terminal,{path:S.callerPath,sha256:activation.callerSHA256},{path:S.hostPath,sha256:activation.hostSHA256},S.sourceReview,S.executionHostProgram,activation.hostProgram,activation.review];
 const before=await settledReads(refs.map(r=>r.path),d.readLocal);need(before.every((b,i)=>sha(b)===refs[i].sha256),'R32_BOUND_SUBSET_LOCAL_SOURCE_CHANGED');
 const review=JSON.parse(before.at(-1));need(review.kind==='r32-bound-census-linux-subset-reader-independent-local-review-r2'&&review.callerSHA256===activation.callerSHA256&&review.hostSHA256===activation.hostSHA256&&review.hostProgramSHA256===activation.hostProgram.sha256&&review.remainingP0P1===0&&review.staticPreparationReady===true&&review.remoteOperations===false&&review.actualIndependentSubsetRead===false,'R32_BOUND_SUBSET_REVIEW_REQUIRED');
 const q=JSON.parse(before[S.sources.length]),start=JSON.parse(before[S.sources.length+1]),terminal=JSON.parse(before[S.sources.length+2]);assertBoundCensusSubsetContextR32R2(q,start,terminal);
 const program=boundCensusLinuxSuccessR32R2HostProgram(),params=boundCensusLinuxSuccessR32R2HostScope;
 need(sha(program)===activation.hostProgram.sha256,'R32_BOUND_SUBSET_GENERATED_PROGRAM_CHANGED');
 let transport,host,privateRef,errorCode,rawFileRefs=null,cleanupRef=null;
 try{transport=await d.readRoot(params,program);if(typeof transport==='string')transport={status:0,signal:null,stdout:transport,stderr:'',errorCode:null};need(transport&&Object.hasOwn(transport,'status')&&typeof transport.stdout==='string'&&typeof transport.stderr==='string','R32_BOUND_SUBSET_TRANSPORT_SHAPE_CHANGED');privateRef=await d.writePrivate({kind:'r32-bound-census-linux-subset-private-observation-r2',at:new Date(d.now()).toISOString(),sourceRefs:refs,programSHA256:sha(program),paramsSHA256:sha(canonical(params)),transport});if(transport.status!==0||transport.signal!==null){const closed=transport.stderr.match(/(?:^|\n)(?:RuntimeError|ValueError): (R32_BOUND_(?:SUBSET|SUCCESS_R2)_[A-Z0-9_]+)\r?\n?$/);throw Error(closed?.[1]??'R32_BOUND_SUBSET_SSH_READ_INCOMPLETE')}host=assertBoundCensusSubsetHostR32R2(JSON.parse(transport.stdout),terminal);rawFileRefs={};for(const[name,row]of Object.entries(host.records)){const bytes=Buffer.from(row.base64,'base64'),ref=await d.writeRawPrivate('stdout',bytes);need(ref.sha256===row.sha256&&ref.bytes===row.bytes,'R32_BOUND_SUBSET_RAW_SAVE_CHANGED');rawFileRefs[name]=ref}cleanupRef=await d.writeRawPrivate('host',Buffer.from(transport.stdout));need(cleanupRef.sha256===sha(transport.stdout)&&cleanupRef.bytes===Buffer.byteLength(transport.stdout),'R32_BOUND_SUBSET_RAW_SAVE_CHANGED')}catch(error){host=null;rawFileRefs=null;cleanupRef=null;errorCode=/^R32_BOUND_(?:SUBSET|SUCCESS_R2)_[A-Z0-9_]+$/.test(error?.message??'')?error.message:'R32_BOUND_SUBSET_READ_INCOMPLETE';if(!privateRef)privateRef=await d.writePrivate({kind:'r32-bound-census-linux-subset-private-error-r2',transport:transport??null,error:{name:error?.name,message:error?.message,stack:error?.stack}})}
 const after=await settledReads(refs.map(r=>r.path),d.readLocal);need(after.every((b,i)=>b.equals(before[i])),'R32_BOUND_SUBSET_LOCAL_SOURCE_READ_CHANGED');
 const f=terminal.fixture;
 const value={schemaVersion:1,kind:'r32-bound-census-linux-subset-independent-result-r2',at:new Date(d.now()).toISOString(),nonce:S.nonce,actualPhase:S.phase,ready:!!host&&host.cleanupScopeComplete===true,errorCode:errorCode??null,
 sourceRefs:{starter:S.sources[0],hostProgram:S.executionHostProgram,owner:S.sources[1],fixture:S.sources[2],sourceReview:S.sourceReview},executionHostProgramSHA256:S.executionHostProgram.sha256,independentObservationHostProgram:activation.hostProgram,readerSourceRefs:refs,readerIndependentReview:activation.review,evidence:{start:S.start,terminal:S.terminal,stdout:rawFileRefs?.['work/fixture.stdout.json']??null,cleanup:cleanupRef},rawFileRefs,
 hostProgramSHA256:sha(program),payloadSHA256:sha(canonical(params)),privateObservation:{path:privateRef.path,sha256:privateRef.sha256,bytes:privateRef.bytes},
 actualLinux3FunctionQualified:!!host,fixtureQualified:!!host,currentScopeCleanupIndependentlyVerified:!!host&&host.cleanupScopeComplete===true,actualLinuxProcessReads:!!host,executedGeneratedSHA256:S.generated.native,bothGeneratedSHA256:S.generated,functionSHA256:S.functionSHA256,sharedThreeFunctionSHA256:S.functionSHA256,sharedThreeFunctionSetSHA256:sha(sortedCanonical(S.functionSHA256)),generatorSHA256:S.sources[3].sha256,fixtureSHA256:S.sources[2].sha256,
 owner:{...terminal.owner,cgroup:terminal.owner.controlGroup,initialKillSignal:terminal.owner.killSignal,effectiveCapabilities:0,execStartSHA256:terminal.unitExecStartSHA256},fixtureProcessIdentity:terminal.fixtureProcess,tinyChildIdentity:host?f.childIdentity:null,originalBoundExitProof:host?f.originalBoundExitProof:null,parentFixtureKernelExitProof:host?terminal.result.fixtureKernelExitProof:null,
 descriptorClosed:!!host&&f.descriptorClosed,childReaped:!!host&&f.childReaped,naturalChildExit:!!host&&f.naturalChildExit,signalsUsed:false,fixturePIDFDClosed:!!host&&terminal.result.fixturePIDFDClosed,fixtureEmergencyStopUsed:false,alreadyDeadAttachRejected:!!host&&f.alreadyDeadAttachRejected,alreadyDeadAttachErrno:host?f.alreadyDeadAttachErrno:null,
 readyHandshakeCompleted:!!host&&f.readyHandshakeCompleted,releaseGateSent:!!host&&f.releaseGateSent,readyProtocolSHA256:f.readyProtocolSHA256,firstReadSubphase:null,firstFixtureError:null,
 stdoutSHA256:rawFileRefs?.['work/fixture.stdout.json']?.sha256??null,startReceiptSHA256:S.start.sha256,cleanupProofSHA256:cleanupRef?.sha256??null,independentCleanupVerified:!!host&&host.cleanupScopeComplete===true,ownerGone:!!host&&host.knownProcesses.owner.present===false,fixtureGone:!!host&&host.knownProcesses.fixture.present===false,knownChildGone:!!host&&host.knownProcesses.tiny.present===false,ownerCgroupEmpty:!!host&&host.cgroup.absent===true,signalsUsedByFixture:false,deadAttachErrno:host?f.alreadyDeadAttachErrno:null,
 fullProtectionQualified:false,fullProcCensusExecuted:!!host,fixtureFullProcCensusExecuted:false,protectedInventoryRead:false,nodeACKRead:false,queueRead:false,modelsInvoked:false,productCodeExecuted:false,productAccepted:false,otherWholeProgramExecuted:false,wholeGeneratedProgramExecuted:false,oldFailedAttemptUntouched:true,remoteReadOnly:true,remoteMutations:false,host:host?projectBoundCensusSubsetHostR32R2(host):null};
 const receipt=await d.writePublic(value);return{...value,receipt};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){let v;try{need(process.argv.length===2,'R32_BOUND_SUBSET_CLI_INVALID');v=await verifyBoundCensusLinuxSubsetR32R2()}catch(e){v={kind:'r32-bound-census-linux-subset-reader-preparation-r2',ready:false,errorCode:/^R32_BOUND_SUBSET_[A-Z0-9_]+$/.test(e?.message??'')?e.message:'R32_BOUND_SUBSET_PREPARATION_INCOMPLETE',rawErrorExported:false,actualLinux3FunctionQualified:false,fullProtectionQualified:false};process.exitCode=1}console.log(JSON.stringify(v))}
