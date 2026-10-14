/** New execution provenance; unchanged physical inventory and queue standards. */
import {canonical,sha} from './run-factory-main-repair-r26.mjs';
import {safeReadLocal,settleEvidenceReads} from './factory-repair-evidence-read-r26.mjs';
import {targetCleanupR29Scope} from './verify-factory-target-cleanup-r29.mjs';
import {verifyFactoryProtectionContractR29R2} from './verify-factory-protection-contract-r29-r2.mjs';
import {assertR29R4ProtectionProof} from './start-factory-truth-gate-build-r29-r4.mjs';
import {createBoundProtectionObserverR32Adapter} from './factory-bound-protection-observer-r32.mjs';
import {boundProcessCensusR32NativeProgram,boundProcessCensusR32BuildProgram} from './factory-bound-process-census-r32.mjs';
import {defaultReadRoot,defaultReadPrimary} from './install-factory-repair-verifier-r26.mjs';
import {nodeState,queueState} from './run-factory-supervision-probe.mjs';
import {withPlatform} from './managed-server-client.mjs';
const need=(v,c)=>{if(!v)throw Error(c)},same=(a,b)=>canonical(a)===canonical(b),H=/^[a-f0-9]{64}$/;
export const boundProtectionContractR32Scope=Object.freeze({
 kind:'software-factory-r32-bound-census-protection-observation',observerContractId:'7248dfa2-31e8-4f0b-baaa-ca487a074189',observerVersion:'r32-bound-census-source-v1',
 generatorSHA256:'a08c44ee006ea993452d39616a217bbf7e45169fd827f580c951a9796cac7252',adapterSHA256:'6831e1faaf875d8689fce72ab2c3b372ee0ebf73cae17a52cc4d7c35a6dc279d',
 nativeSHA256:'b357b2d4afaab2938a5e226d42ffbe6d12d3757f0973488ad696108761a36a78',buildSHA256:'e2385dcb6001fcc1524a72edac61fc671e83be62339308daabfb5822dda8c1ba',
 fixtureSHA256:'60a9145a1a8619dc5578345ca7def095bdeaa0ba1ca91feea33443e61d2629b7',orchestratorSHA256:'de1c75c0becd8f2375dd2b0b1005d86f8c4052736d90725743dde3cc94a4de76',
 inventoryPayloadSHA256:'8d5dd5f7d0d8b36fa9883b3fb160bf730928799ffc7294c8b2929e2b947023dd',nativePayloadSHA256:'f75e008012f8e6dafb9cbc1f0cd48c8be78aab9238e2ce16eef6fa53bc94f3ff',buildPayloadSHA256:'905a38ec0990aba896ebdcd148289bf6786469e6d4491b475de85bf6e22242e9',
 inventoryProgramSHA256:'3fbdb6b634ad037723083550608f43b3c6e94210df5f5f56349d8605e3621b5b',
 localReview:{path:'artifacts/software-factory/goals-r29/r32-bound-census-protection-adapter-independent-local-review-1791853764838-3cbd5b33-fef4-4bc8-9452-92c074b16ac3.json',sha256:'3eaf4fce7ddd2446d429c1466a8e056c267c3c99e966b86c9b73abd10dfda1ce'},
 actualLinuxQualification:null,consumerIndependentReview:null
});
const S=boundProtectionContractR32Scope;
const sourceRefs=[['scripts/run-factory-main-repair-r26.mjs','31094cee37b1005e43d3e3810c9c7c3916fe31c6e8ed8c23185dbe6f78a3c462'],['scripts/factory-repair-evidence-read-r26.mjs','4db9e5fd1f80bde99ae53609a4bbad788d871ecc098528499cbf0c43d864911e'],['scripts/verify-factory-target-cleanup-r29.mjs','d4860d172aa4b4a2949281ac5ae416d216625b8ed43e394d57e30ba9f0873dd6'],['scripts/verify-factory-truth-gate-build-cleanup-r29.mjs','48e2089fd03db8d3186486edf207550ad157e412071c10515f5a1d892be59d86'],['scripts/verify-factory-protection-contract-r29-r2.mjs',S.orchestratorSHA256],['scripts/start-factory-truth-gate-build-r29-r4.mjs','c5fc013105aac25a23d36dde439ca71f929802f656256f0d8755aa324f8527b0'],['scripts/factory-bound-process-census-r32.mjs',S.generatorSHA256],['scripts/factory-bound-protection-observer-r32.mjs',S.adapterSHA256]].map(([path,sha256])=>({path,sha256}));
sourceRefs.push(...[['scripts/install-factory-repair-verifier-r26.mjs','ed9d65721a1cd1fa92d84b34197aa308128bb5d570f0f9b83eb1eac099262175'],['scripts/run-factory-supervision-probe.mjs','699d0b9c06557bff28e855b9505c8b6ff7a4bb980a0755f1102c8a79e8cea402'],['scripts/managed-server-client.mjs','e287938e2d79b0335523d3d198bd93b588541866cebc2c21d997ae6fce5e4a9f']].map(([path,sha256])=>({path,sha256})));
sourceRefs.push(...[['scripts/read-factory-truth-gate-build-scope-r29.mjs','3eb38ff71acc2d844e740c06d64691eb4f1823fce41be2490ea907d896af0ac4'],['scripts/run-factory-target-repair-r29.mjs','490c071eba4de31d9286e4c314c5fe2f21619401b4925fb8e86f15a18505c641']].map(([path,sha256])=>({path,sha256})));
const ref=(v,pattern)=>need(v&&Object.keys(v).every(k=>['path','sha256'].includes(k))&&pattern.test(v.path??'')&&H.test(v.sha256??''),'R32_BOUND_CONTRACT_QUALIFICATION_REFERENCE_REQUIRED');
export function assertBoundProtectionActivationR32(options){
 need(options&&Object.keys(options).every(k=>['actualLinuxQualification','consumerIndependentReview'].includes(k)),'R32_BOUND_CONTRACT_ARGUMENT_INVALID');
 ref(options.actualLinuxQualification,/^artifacts\/software-factory\/goals-r29\/r32-bound-census-linux-subset-independent-result-\d{13}-[a-f0-9-]{36}\.json$/);
 ref(options.consumerIndependentReview,/^artifacts\/software-factory\/goals-r29\/r32-bound-protection-consumer-independent-local-review-\d{13}-[a-f0-9-]{36}\.json$/);
 return options;
}
export function boundProtectionSharedFunctionSHA256R32(){
 const names=['process_record','pidfd_poll','pidfd_exit_proof'],programs=[boundProcessCensusR32NativeProgram(),boundProcessCensusR32BuildProgram()];
 const functions=programs.map(p=>Object.fromEntries(names.map(name=>{const start=p.indexOf('\ndef '+name+'(')+1;need(start>0,'R32_BOUND_CONTRACT_FUNCTION_SOURCE_CHANGED');const next=p.indexOf('\ndef ',start+1);need(next>start,'R32_BOUND_CONTRACT_FUNCTION_SOURCE_CHANGED');return [name,sha(p.slice(start,next).trimEnd())];})));
 need(sha(programs[0])===S.nativeSHA256&&sha(programs[1])===S.buildSHA256&&same(functions[0],functions[1]),'R32_BOUND_CONTRACT_GENERATED_SOURCE_CHANGED');return functions[0];
}
/** This checks a separately independently observed subset, never the whole protected host. */
export function assertBoundProtectionKernelQualificationR32(v){
 need(v?.schemaVersion===1&&v.kind==='r32-bound-census-linux-subset-independent-result'&&v.ready===true&&v.fixtureQualified===true&&v.actualLinuxProcessReads===true&&v.fullProtectionQualified===false&&v.fullProcCensusExecuted===false&&v.productCodeExecuted===false&&v.modelsInvoked===false&&v.productAccepted===false,'R32_BOUND_CONTRACT_ACTUAL_LINUX_SUBSET_UNPROVEN');
 need(v.generatorSHA256===S.generatorSHA256&&v.fixtureSHA256===S.fixtureSHA256&&same(v.bothGeneratedSHA256,{native:S.nativeSHA256,build:S.buildSHA256})&&same(v.sharedThreeFunctionSHA256,boundProtectionSharedFunctionSHA256R32()),'R32_BOUND_CONTRACT_LINUX_FUNCTION_SOURCE_CHANGED');
 need(['native','build'].includes(v.actualPhase)&&v.executedGeneratedSHA256===(v.actualPhase==='native'?S.nativeSHA256:S.buildSHA256)&&v.otherWholeProgramExecuted===false,'R32_BOUND_CONTRACT_LINUX_EXECUTION_SCOPE_CHANGED');
 need(v.owner?.uid===1000&&v.owner.gid===1000&&v.owner.noNewPrivileges===true&&v.owner.effectiveCapabilities===0&&v.owner.runtimeMaxSec===80&&v.owner.stopTimeoutSec===10&&v.owner.hardParentBoundSeconds===90&&v.owner.killMode==='control-group'&&v.owner.restart==='no'&&v.owner.initialKillSignal==='SIGKILL','R32_BOUND_CONTRACT_LINUX_PARENT_BOUNDARY_UNPROVEN');
 need(/^[a-f0-9]{32}$/.test(v.nonce??'')&&v.owner.unit==='jarvis-bound-census-r32-'+v.nonce+'.service'&&v.owner.cgroup==='/system.slice/'+v.owner.unit&&Number.isSafeInteger(v.owner.pid)&&v.owner.pid>1&&/^[0-9]+$/.test(v.owner.startTicks??'')&&/^[a-f0-9-]{36}$/.test(v.owner.boot??'')&&Number.isSafeInteger(v.owner.procDevice)&&v.owner.procDevice>=0&&Number.isSafeInteger(v.owner.procInode)&&v.owner.procInode>0&&/^[a-f0-9]{32}$/.test(v.owner.invocationId??''),'R32_BOUND_CONTRACT_LINUX_OWNER_IDENTITY_UNBOUND');
 const f=v.fixtureProcessIdentity,e=v.originalBoundExitProof,k=e?.kernelProof,i=e?.processIdentity,id=e?.listedProcIdentity;
 need(f&&Number.isSafeInteger(f.pid)&&f.pid>1&&f.pid!==v.owner.pid&&f.ppid===v.owner.pid&&f.uid===1000&&f.boot===v.owner.boot&&/^[0-9]+$/.test(f.startTicks??'')&&Number.isSafeInteger(f.procDevice)&&f.procDevice>=0&&Number.isSafeInteger(f.procInode)&&f.procInode>0,'R32_BOUND_CONTRACT_FIXTURE_PROCESS_UNBOUND');
 need(Number.isSafeInteger(e?.pid)&&e.pid>1&&e.pid!==f.pid&&e.pid!==v.owner.pid&&e.boot===v.owner.boot&&i?.pid===e.pid&&i.ppid===f.pid&&i.boot===v.owner.boot&&/^[0-9]+$/.test(i.startTicks??'')&&Number.isSafeInteger(id?.device)&&id.device>=0&&Number.isSafeInteger(id.inode)&&id.inode>0&&i.procDevice===id.device&&i.procInode===id.inode&&k?.type==='pidfd-POLLIN'&&k.attached===true&&k.identityBound===true&&k.requestedPID===e.pid&&k.exitConfirmed===true&&[1,17].includes(k.pollEvents)&&k.procPathAbsent===true,'R32_BOUND_CONTRACT_CHILD_EXIT_PROOF_UNBOUND');
 need(v.independentCleanupVerified===true&&v.ownerGone===true&&v.ownerCgroupEmpty===true&&v.knownChildGone===true&&v.descriptorClosed===true&&v.naturalChildExit===true&&v.signalsUsedByFixture===false&&v.deadAttachErrno===3&&H.test(v.stdoutSHA256??'')&&H.test(v.startReceiptSHA256??'')&&H.test(v.cleanupProofSHA256??'')&&H.test(v.owner.execStartSHA256??''),'R32_BOUND_CONTRACT_LINUX_CLEANUP_UNPROVEN');
 need(v.sourceRefs&&same(Object.keys(v.sourceRefs).sort(),['hostProgram','owner','sourceReview','starter'])&&v.evidence&&same(Object.keys(v.evidence).sort(),['cleanup','start','stdout']),'R32_BOUND_CONTRACT_KERNEL_SOURCE_REFERENCES_INCOMPLETE');
 for(const r of Object.values({...v.sourceRefs,...v.evidence}))need(r&&typeof r.path==='string'&&/^(?:scripts|artifacts\/software-factory\/goals-r29|\.jarvis-dev\/maintenance)\/[^\0\r\n\\]+$/.test(r.path)&&!r.path.split('/').some(s=>['.','..'].includes(s))&&H.test(r.sha256??''),'R32_BOUND_CONTRACT_KERNEL_EVIDENCE_REFERENCE_INVALID');
 need(v.evidence.stdout.sha256===v.stdoutSHA256&&v.evidence.start.sha256===v.startReceiptSHA256&&v.evidence.cleanup.sha256===v.cleanupProofSHA256,'R32_BOUND_CONTRACT_KERNEL_REFERENCE_SHA_CHANGED');
 return v;
}
/** Original bytes, not re-encoded producer objects, are the evidence inputs. */
export async function verifyBoundProtectionKernelEvidenceR32(v,readLocal){
 assertBoundProtectionKernelQualificationR32(v);
 const refs=[...Object.values(v.sourceRefs),...Object.values(v.evidence)],raw=await settleEvidenceReads(refs.map(r=>()=>readLocal(r.path)));need(raw.every((b,i)=>sha(b)===refs[i].sha256),'R32_BOUND_CONTRACT_KERNEL_EVIDENCE_BYTES_CHANGED');
 const at=k=>JSON.parse(raw[refs.findIndex(r=>r===v.evidence[k])]),stdout=at('stdout'),start=at('start'),cleanup=at('cleanup');
 need(stdout.kind==='r32-bound-census-linux-subset-qualification'&&stdout.fixtureQualified===true&&stdout.phase===v.actualPhase&&stdout.generatedSourceSHA256===v.executedGeneratedSHA256&&same(stdout.functionSHA256,v.sharedThreeFunctionSHA256)&&same(stdout.originalBoundExitProof,v.originalBoundExitProof)&&stdout.alreadyDeadAttachErrno===3&&stdout.naturalChildExit===true&&stdout.descriptorClosed===true&&stdout.childReaped===true&&stdout.signalsSent===false&&stdout.fullProtectionQualified===false&&stdout.fullProcCensusExecuted===false&&stdout.productCodeExecuted===false&&stdout.modelsInvoked===false,'R32_BOUND_CONTRACT_ORIGINAL_STDOUT_UNPROVEN');
 need(start.kind==='r32-bound-census-linux-parent-observation'&&start.nonce===v.nonce&&start.phase===v.actualPhase&&start.dispatchSubmitted===true&&start.owner?.pid===v.owner.pid&&start.owner.startTicks===v.owner.startTicks&&start.owner.boot===v.owner.boot&&start.owner.procDevice===v.owner.procDevice&&start.owner.procInode===v.owner.procInode&&start.owner.invocationId===v.owner.invocationId&&start.unit?.Id===v.owner.unit&&start.ownerSHA256===v.sourceRefs.owner.sha256&&start.generatedSHA256===v.executedGeneratedSHA256&&start.fixtureSHA256===S.fixtureSHA256,'R32_BOUND_CONTRACT_KERNEL_START_NOT_BOUND');
 need(cleanup.kind==='r32-bound-census-linux-subset-independent-cleanup'&&cleanup.nonce===v.nonce&&cleanup.ready===true&&cleanup.independent===true&&same(cleanup.owner,v.owner)&&same(cleanup.fixtureProcessIdentity,v.fixtureProcessIdentity)&&same(cleanup.knownChildIdentity,v.originalBoundExitProof.processIdentity)&&cleanup.ownerGone===true&&cleanup.fixtureGone===true&&cleanup.knownChildGone===true&&cleanup.ownerCgroupEmpty===true&&cleanup.processFDAndSocketScopeComplete===true&&cleanup.sourceBytesVerified===true&&cleanup.productCodeExecuted===false&&cleanup.fullProtectionQualified===false,'R32_BOUND_CONTRACT_KERNEL_INDEPENDENT_CLEANUP_UNPROVEN');
 const review=JSON.parse(raw[refs.findIndex(r=>r===v.sourceRefs.sourceReview)]);need(review.kind==='r32-bound-census-linux-parent-independent-local-review'&&review.staticPreparationReady===true&&review.remainingP0P1===0&&review.starterSHA256===v.sourceRefs.starter.sha256&&review.hostProgramSHA256===v.sourceRefs.hostProgram.sha256&&review.ownerSHA256===v.sourceRefs.owner.sha256,'R32_BOUND_CONTRACT_KERNEL_SOURCE_REVIEW_CHANGED');
 const last=await settleEvidenceReads(refs.map(r=>()=>readLocal(r.path)));need(raw.every((b,i)=>sha(b)===sha(last[i])),'R32_BOUND_CONTRACT_KERNEL_EVIDENCE_CHANGED_AFTER');return v;
}
/** Physical standard reuse is an in-memory validation projection, not old execution provenance. */
export function assertBoundProtectionContractR32(v,{fresh=false,now=Date.now()}={}){
 need(v?.kind===S.kind&&v.observerContractId===S.observerContractId&&v.observerVersion===S.observerVersion&&v.oldObserverExecutionClaimed===false&&v.inventoryValidationProjectionOnly===true,'R32_BOUND_CONTRACT_NEW_OBSERVER_PROVENANCE_REQUIRED');
 need(same(v.executedSources,{orchestrator:S.orchestratorSHA256,adapter:S.adapterSHA256,generator:S.generatorSHA256,nativeProgram:S.nativeSHA256,oldBuildProgram:S.buildSHA256})&&v.actualLinuxSubsetQualified===true&&v.actualLinuxSubsetDoesNotQualifyWholeInventory===true,'R32_BOUND_CONTRACT_EXECUTED_SOURCE_CHANGED');
 assertBoundProtectionActivationR32(v.activation);
 const rows=v.sourceReceipts;need(Array.isArray(rows)&&rows.length===4&&same(rows.map(r=>r.stage),['inventory-before','native-source','old-build','inventory-after']),'R32_BOUND_CONTRACT_SOURCE_RECEIPTS_INCOMPLETE');
 need(rows.every(r=>['originalProgramSHA256','actualProgramSHA256','parametersSHA256','responseSHA256'].every(k=>H.test(r[k]??'')))&&rows[0].originalProgramSHA256===rows[0].actualProgramSHA256&&rows[3].originalProgramSHA256===rows[3].actualProgramSHA256&&rows[0].actualProgramSHA256===rows[3].actualProgramSHA256&&rows[0].parametersSHA256===rows[3].parametersSHA256&&rows[1].originalProgramSHA256==='66a241993d910da443bc1b3776ab4c6efc33bc1b44401c7dddff4caa06754155'&&rows[1].actualProgramSHA256===S.nativeSHA256&&rows[2].originalProgramSHA256==='66e84cadadd232daa58d62b2ee7fd58c6f61cf08baec4e124e7c4ef9a237f8d6'&&rows[2].actualProgramSHA256===S.buildSHA256,'R32_BOUND_CONTRACT_PROGRAM_SUBSTITUTION_CHANGED');
 need(same(rows.map(r=>r.parametersSHA256),[S.inventoryPayloadSHA256,S.nativePayloadSHA256,S.buildPayloadSHA256,S.inventoryPayloadSHA256]),'R32_BOUND_CONTRACT_FIXED_PARAMETERS_CHANGED');
 need(rows[0].actualProgramSHA256===S.inventoryProgramSHA256&&rows[3].actualProgramSHA256===S.inventoryProgramSHA256,'R32_BOUND_CONTRACT_STOCK_READER_SOURCE_CHANGED');
 need(rows[0].responseSHA256===v.observations?.hostBeforeSHA256&&rows[3].responseSHA256===v.observations?.hostAfterSHA256&&rows[1].responseSHA256===sha(v.observations?.nativeSource)&&rows[2].responseSHA256===sha(v.observations?.oldBuild),'R32_BOUND_CONTRACT_RESPONSE_RECEIPTS_CHANGED');
 assertR29R4ProtectionProof({...v,kind:'software-factory-r29-new-protection-contract-observation'},{fresh,now});return v;
}
export function createBoundProtectionSerialReadersR32(d){
 let tail=Promise.resolve();const serial=fn=>(...args)=>{const next=tail.then(()=>fn(...args));tail=next.catch(()=>{});return next;};
 return {...Object.fromEntries(['api','readRoot','readPrimary','nodeState','queueState'].map(name=>[name,serial(d[name])])),drain:async()=>{for(;;){const captured=tail;await captured;if(captured===tail)return;}}};
}
export async function verifyFactoryBoundProtectionContractR32(options={},deps){
 const activation=structuredClone(assertBoundProtectionActivationR32(options)); // No journal, credentials, or transport before this gate.
 if(deps===undefined)return withPlatform(({api})=>verifyFactoryBoundProtectionContractR32(activation,{api}));
 const d={now:Date.now,readLocal:safeReadLocal,readRoot:defaultReadRoot,readPrimary:defaultReadPrimary,nodeState,queueState,...deps};need(typeof d.api==='function','R32_BOUND_CONTRACT_API_REQUIRED');
 const refs=[...sourceRefs,S.localReview,activation.actualLinuxQualification,activation.consumerIndependentReview,{path:targetCleanupR29Scope.installedManifestPath,sha256:targetCleanupR29Scope.installedManifestSHA256},{path:'scripts/verify-factory-bound-protection-contract-r32.mjs'}];
 const raw=await settleEvidenceReads(refs.map(r=>()=>d.readLocal(r.path)));need(raw.every((b,i)=>!refs[i].sha256||sha(b)===refs[i].sha256),'R32_BOUND_CONTRACT_CONTEXT_SOURCE_CHANGED');
 const qualified=JSON.parse(raw[sourceRefs.length+1]);await verifyBoundProtectionKernelEvidenceR32(qualified,d.readLocal);
 const consumerSHA256=sha(raw.at(-1)),review=JSON.parse(raw[sourceRefs.length+2]);need(review.kind==='r32-bound-protection-consumer-independent-local-review'&&review.consumerSHA256===consumerSHA256&&review.staticPreparationReady===true&&review.remainingP0P1===0&&review.actualLinuxQualified===false&&review.generatorSHA256===S.generatorSHA256&&review.adapterSHA256===S.adapterSHA256,'R32_BOUND_CONTRACT_CONSUMER_REVIEW_UNPROVEN');
 const manifest=JSON.parse(raw.at(-2)),serial=createBoundProtectionSerialReadersR32(d),adapter=createBoundProtectionObserverR32Adapter(manifest.preparation,serial.readRoot);
 let physical;try{physical=await verifyFactoryProtectionContractR29R2({...d,...serial,readRoot:adapter.readRoot});}finally{await serial.drain();}
 const result={...physical,kind:S.kind,observerContractId:S.observerContractId,observerVersion:S.observerVersion,consumerSHA256,oldObserverExecutionClaimed:false,inventoryValidationProjectionOnly:true,executedSources:{orchestrator:S.orchestratorSHA256,adapter:S.adapterSHA256,generator:S.generatorSHA256,nativeProgram:S.nativeSHA256,oldBuildProgram:S.buildSHA256},activation,sourceReceipts:adapter.receipts(),actualLinuxSubsetQualified:true,actualLinuxSubsetDoesNotQualifyWholeInventory:true};
 if(result.ready)assertBoundProtectionContractR32(result,{fresh:true,now:d.now()});
 await verifyBoundProtectionKernelEvidenceR32(qualified,d.readLocal);
 const last=await settleEvidenceReads(refs.map(r=>()=>d.readLocal(r.path)));need(raw.every((b,i)=>sha(b)===sha(last[i])),'R32_BOUND_CONTRACT_CONTEXT_CHANGED_AFTER');return result;
}
