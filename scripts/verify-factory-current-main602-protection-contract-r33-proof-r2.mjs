/** New explicitly selected Main602 content/count/metadata epoch. Import/default activation performs no IO. Old proofs are immutable. */
import {sha,canonical} from './run-factory-main-repair-r26.mjs';
import {targetCopyR29Scope as S} from './prepare-factory-target-copy-r29.mjs';
import {safeReadLocal,settleEvidenceReads} from './factory-repair-evidence-read-r26.mjs';
import {targetCleanupR29Scope as C,assertTargetCleanupR29Context,readTargetCleanupR29Execution,targetCleanupR29HostProgram,assertTargetCleanupR29NativeHost} from './verify-factory-target-cleanup-r29.mjs';
import {hostReadParams,r28HostReadProgram,expectedR28Installed} from './factory-verifier-host-r28.mjs';
import {verifyR28InstalledManifest} from './install-factory-verifier-r28.mjs';
import {buildCleanupR29Scope as B,buildCleanupR29HostProgram} from './verify-factory-truth-gate-build-cleanup-r29.mjs';
import {assertBuildOnlyR29Scope} from './read-factory-truth-gate-build-scope-r29.mjs';
import {defaultReadRoot,defaultReadPrimary} from './install-factory-repair-verifier-r26.mjs';
import {nodeState,queueState} from './run-factory-supervision-probe.mjs';
const need=(v,c)=>{if(!v)throw Error(c)},same=(a,b)=>canonical(a)===canonical(b),H=/^[a-f0-9]{64}$/;
import {protectionContractR29R2 as L} from './verify-factory-protection-contract-r29-r2.mjs';
const SELF='scripts/verify-factory-current-main602-protection-contract-r33-proof-r2.mjs';
const KIND='software-factory-r33-current-main602-proof-r2-protection-observation';
export const currentMainProtectionR33Contract=Object.freeze({...L,
 contractId:'2c49eb54-46c1-473c-ba40-c2557c3d429c',contractRevision:1,contractVersion:'r33-current-main602-single-entry-protection-v1',
 previousContractId:'32975731-5a24-4b27-be22-4fe9d30ae4d7',previousContractRevision:1,previousMainMetadataSHA256:'ba05cf3d59e9320d2c9270ee15e906b5835b9f6338c9054cb2558c2c38185fc5',previousStockSHA256:'e8c30de94719748b17db180d08ad78e72d3d10710a959cfbee9b1b271f15031a',
 mainMetadataSHA256:'ac7131117c9782bbdb3a064568d3d4b6ce42f952eebbe9e80e84c907625dec06',
 newStockSHA256:'6419c24d981677bc95fc5061fafc0364788674093b8d74a2fbfcf26c335da2e9',
 stockProgramSHA256:'7610454057b47f204d69aeec259e048f964437a0f29ed46783c93e82066b4d5f',stockParametersSHA256:'5c6c9587c18ba5aa9e65217fc002e8bba5cd690f2c7c357033a2c57a0f89e3f8',
 selectionPath:'artifacts/software-factory/goals-r29/r33-current-main602-proof-r2-protection-root-selection-20261014.json',
 selectionSHA256:'c988e9cd8e298869ca6fd2383acdec3a3aa05680338847f4e6d15d1f1143cc65',
 actualCurrentMainWitness:null,actualCurrentMainAudit:null,independentReview:null,activation:null,operationalQualified:false});
const P=currentMainProtectionR33Contract;
const WITNESS=Object.freeze({path:'artifacts/software-factory/goals-r29/r33-pg4-preflight-fixed-main-diagnostic-result-1791944835900-8e8e38e8-ee32-42e7-8c7a-0063482b50d0.json',sha256:'89fde377ccd512bf6a01c485f882675ba1ebf7dfab98239ce7720f81c9fcfb00'});
const AUDIT=Object.freeze({path:'artifacts/software-factory/goals-r29/r33-pg4-preflight-fixed-main-diagnostic-saved-evidence-independent-limited-audit-1791945039966-7b147513-0e63-45f8-ab61-38989092ed6d.json',sha256:'cd54e89dc9375722083f6895bc5ef8852f5e11883db12cc16028d547d599c485'});
const SELECTION=Object.freeze({path:P.selectionPath,sha256:P.selectionSHA256});
const ORIGINAL_SELECTION=Object.freeze({path:'artifacts/software-factory/goals-r29/r33-current-main602-protection-root-selection-20261014.json',sha256:'643a3f7e767df8182aa728ec50ba2e6de17e6a693df3ca43ca0bfc25ebd5c460'});
const MAIN=Object.freeze({sha256:'11446020cbec373e92ab22293352bde874b18e82cca11f3a5757454dc9b9e212',files:602,bytes:18083755,metadataSHA:P.mainMetadataSHA256,stable:true,identity:Object.freeze({device:66306,inode:14417953})});
const nodeIdentity=v=>Object.fromEntries(['pid','ppid','startTicks','boot','procDevice','procInode','uid','cwdSHA256','exeSHA256','argvSHA256','active','cgroup'].map(k=>[k,v[k]]));
export function expectedCurrentMainProtectionStockR33(q){
 need(sha(q?.protectedInventory)===L.oldStockSHA256&&q.protectedInventory.source.metadataSHA===L.oldMainMetadataSHA256,'R33_CURRENT_MAIN_ORIGINAL_STOCK_CHANGED');
 const old=structuredClone(q.protectedInventory);old.source.metadataSHA=L.mainMetadataSHA256;
 need(sha(old)===L.newStockSHA256,'R33_CURRENT_MAIN_PREVIOUS_STOCK_CHANGED');
 const previous=structuredClone(old);previous.source.metadataSHA=P.previousMainMetadataSHA256;
 need(sha(previous)===P.previousStockSHA256,'R33_CURRENT_MAIN_PREVIOUS_STOCK_CHANGED');
 const stock=structuredClone(previous);stock.source={...stock.source,sha256:MAIN.sha256,files:MAIN.files,bytes:MAIN.bytes,metadataSHA:P.mainMetadataSHA256};
 need(sha(stock)===P.newStockSHA256&&same(stock.source,MAIN),'R33_CURRENT_MAIN_DERIVED_STOCK_CHANGED');return stock;
}
export function currentMainProtectionR33HostParams(preparation){return {...hostReadParams(preparation,{expectedTargetTemplateSHA256:P.baseTemplateSHA256,expectedOtherNodeTemplatesSHA256:P.otherNodeTemplatesSHA256,requireInstalled:true,verifySudo:true,idle:true}),mainFingerprint:MAIN.sha256,mainFiles:MAIN.files,mainMetadataSHA256:P.mainMetadataSHA256,contractId:P.contractId,contractRevision:P.contractRevision,contractVersion:P.contractVersion,protectedStockSHA256:P.newStockSHA256};}
export function currentMainProtectionR33HostProgram(preparation){
 const params=currentMainProtectionR33HostParams(preparation);let text=r28HostReadProgram();need(text.split(P.oldMainMetadataSHA256).length===2,'R29_NEW_PROTECTION_READER_TEMPLATE_CHANGED');text=text.replace(P.oldMainMetadataSHA256,P.mainMetadataSHA256);
 const previousMain='151300cf55e8e46445e5e3b85293c047f981b14f620350a217a61d9a987056ea';need(text.split(previousMain).length===2,'R33_CURRENT_MAIN602_MAIN_PIN_CHANGED');text=text.replace(previousMain,MAIN.sha256);
 const filesPin='\\\"mainFiles\\\":593';need(text.split(filesPin).length===2,'R33_CURRENT_MAIN602_COUNT_PIN_CHANGED');text=text.replace(filesPin,'\\\"mainFiles\\\":602');
 const filesGate="main['files']==593";need(text.split(filesGate).length===2,'R33_CURRENT_MAIN602_COUNT_GATE_CHANGED');text=text.replace(filesGate,"main['files']==602");
 const anchor="tools_dir=Path('/opt/jarvis-development/software-factory');helper_body=private_read(tools_dir/'project-autonomy-evidence.py')";need(text.split(anchor).length===2,'R29_NEW_PROTECTION_READER_TEMPLATE_CHANGED');text=text.replace(anchor,`expected_parameters=json.loads(${JSON.stringify(JSON.stringify(params))})\nneed(p==expected_parameters,'R33_CURRENT_MAIN_FIXED_PARAMETERS_CHANGED')\n`+anchor);
 const kind="'kind':'software-factory-r28-host-observation'";need(text.split(kind).length===2,'R29_NEW_PROTECTION_READER_TEMPLATE_CHANGED');return text.replace(kind,"'kind':'software-factory-r33-current-main602-protection-host-observation'");
}
function stock(h){return {source:h.source,oldCandidate:h.oldCandidate,candidate:h.candidate,oldImmutable:h.oldImmutable,installed:h.installed,originSHA256:h.originSHA256,otherNodeTemplatesSHA256:h.nodeTemplates?.otherTemplatesSHA256};}
export function assertCurrentMainProtectionR33Host(h,preparation,q){
 const expected=expectedCurrentMainProtectionStockR33(q);need(h?.schemaVersion===1&&h.kind==='software-factory-r33-current-main602-protection-host-observation'&&h.helperVerified===true&&h.mutationsPerformed===false&&h.modelsInvoked===false&&h.rawLogsExported===false&&h.privateEnvironmentExported===false&&h.productCodeExecuted===false&&h.sourceVerificationScope==='public-manifest-and-metadata'&&same(stock(h),expected),'R29_NEW_PROTECTION_ACTUAL_STOCK_CHANGED');
 need(h.originBound===true&&same(h.originIdentity,h.candidate.identity)&&same(h.fixedTools,preparation.oldFixedTools)&&h.nodeTemplates.targetSHA256===P.baseTemplateSHA256&&h.nodeTemplates.otherTemplatesSHA256===P.otherNodeTemplatesSHA256&&H.test(h.nodeTemplates.configSHA256??'')&&h.quiet?.active===true&&Number.isSafeInteger(h.quiet.pid)&&h.quiet.pid>1&&/^[0-9]+$/.test(h.quiet.start??'')&&/^[a-f0-9-]{36}$/.test(h.quiet.boot??'')&&Array.isArray(h.quiet.children)&&!h.quiet.children.length&&same(h.quiet.counts,{runs:0,deliveries:0,logs:0})&&same(h.installed,expectedR28Installed(preparation))&&h.visudoVerified===true&&h.source.metadataSHA===P.mainMetadataSHA256&&same(h.sandboxImage,{imageId:preparation.sandboxImageContract.imageId,architecture:'amd64',os:'linux',reference:preparation.sandboxImageContract.reference,observed:true}),'R29_NEW_PROTECTION_NODE_OR_TOOLS_CHANGED');return h;
}
export function assertNewProtectionTerminal(e){need(e.isTerminal&&e.signed&&e.nonlate&&e.run.id===P.sourceRunId&&e.run.taskId===P.sourceTaskId&&e.run.status==='round-limit'&&e.run.result?.outcome==='round-limit'&&e.run.result.exitCode===0&&e.run.result.validation==null&&e.resultSHA256===P.terminalResultSHA256&&e.stored.storedRecordSHA256===P.storedRecordSHA256,'R29_NEW_PROTECTION_SIGNED_TERMINAL_CHANGED');return e;}
export async function observeNewProtectionPlatform(q,d){
 const get=async path=>(await d.api(path)).data;
 const [profile,global,config,node,queue,project]=await settleEvidenceReads([()=>get('/api/v1/projects/'+S.projectId+'/autonomy'),()=>get('/api/v1/execution/supervision'),()=>get('/api/v1/execution/config'),()=>d.nodeState(),()=>d.queueState(),()=>get('/api/v1/projects/'+S.projectId)]);
 need(sha(profile)===P.profileSHA256&&profile.config?.costPolicy==='record-only'&&global.supervised===false&&global.stopped===false&&config.templates?.length===28&&config.templates.filter(t=>t.id===S.templateId).length===1&&same(config.templates.find(t=>t.id===S.templateId),q.originalTemplate)&&sha(config.templates.filter(t=>t.id!==S.templateId))===P.otherCentralTemplatesSHA256&&node.agentId===S.agentId&&same(node.template,q.originalTemplate)&&node.unit?.ActiveState==='active'&&Number(node.unit.MainPID)>1,'R29_NEW_PROTECTION_PLATFORM_CHANGED');
 need(queue?.readOnly===true&&queue.fullTable===true&&queue.allActive===0,'R29_NEW_PROTECTION_GLOBAL_QUEUE_NOT_IDLE');
 need(project?.id===S.projectId&&project.ownerId==='server-admin'&&project.scope==='personal'&&project.status!=='archived'&&project.copies?.filter(c=>c.path===S.workspace).length===1&&project.copies.some(c=>c.path===S.workspace&&c.machineId===S.machineId&&c.environment==='development'&&c.branch==='snapshot:9b07a511-r29'),'R29_NEW_PROTECTION_PROJECT_COPY_CHANGED');
 return {profileSHA256:sha(profile),globalSHA256:sha(global),configSHA256:sha(config),projectSHA256:sha(project),node,queueIdle:true};
}

const AUTHORITY_REFS=Object.freeze([
 ['scripts/run-factory-main-repair-r26.mjs','31094cee37b1005e43d3e3810c9c7c3916fe31c6e8ed8c23185dbe6f78a3c462'],
 ['scripts/factory-repair-evidence-read-r26.mjs','4db9e5fd1f80bde99ae53609a4bbad788d871ecc098528499cbf0c43d864911e'],
 ['scripts/verify-factory-target-cleanup-r29.mjs','d4860d172aa4b4a2949281ac5ae416d216625b8ed43e394d57e30ba9f0873dd6'],
 ['scripts/verify-factory-truth-gate-build-cleanup-r29.mjs','48e2089fd03db8d3186486edf207550ad157e412071c10515f5a1d892be59d86'],
 ['scripts/verify-factory-protection-contract-r29-r2.mjs','de1c75c0becd8f2375dd2b0b1005d86f8c4052736d90725743dde3cc94a4de76'],
 ['scripts/install-factory-repair-verifier-r26.mjs','ed9d65721a1cd1fa92d84b34197aa308128bb5d570f0f9b83eb1eac099262175'],
 ['scripts/run-factory-supervision-probe.mjs','699d0b9c06557bff28e855b9505c8b6ff7a4bb980a0755f1102c8a79e8cea402'],
 ['scripts/managed-server-client.mjs','e287938e2d79b0335523d3d198bd93b588541866cebc2c21d997ae6fce5e4a9f'],
 ['scripts/read-factory-truth-gate-build-scope-r29.mjs','3eb38ff71acc2d844e740c06d64691eb4f1823fce41be2490ea907d896af0ac4'],
 ['scripts/run-factory-target-repair-r29.mjs','490c071eba4de31d9286e4c314c5fe2f21619401b4925fb8e86f15a18505c641'],
 ['scripts/prepare-factory-target-copy-r29.mjs','54120098f16812cdee930ac2e7bdd6e8106739d29e1184f6e6107524d0f51514'],
 ['scripts/factory-verifier-host-r28.mjs','967bc2394240a92059d177c0119544f833059080bc4b3d0852ba2140a5256308'],
 ['scripts/install-factory-verifier-r28.mjs','622fd73e2e19720d3dc775991508dd33c14b66aca44104dea4ceae46c338c495'],
 ['scripts/prepare-factory-repair-verifier-r26.mjs','fd65d781d6ce8a0af825fefde75dda156d878d31f5afae2818977ce91158b741'],
].map(([path,sha256])=>Object.freeze({path,sha256})));
function exactKeys(v,keys){return v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),[...keys].sort())}
function isRef(v){return exactKeys(v,['path','sha256'])&&typeof v.path==='string'&&v.path.length<=512
 &&/^(?:scripts\/|artifacts\/software-factory\/goals-r29\/|\.jarvis-dev\/maintenance\/)[A-Za-z0-9._/-]+$/.test(v.path)
 &&!v.path.split('/').some(s=>!s||s==='.'||s==='..')&&H.test(v.sha256??'')}
function jsonClone(v,depth=0){need(depth<40,'R33_CURRENT_MAIN_JSON_DEPTH_CHANGED');if(v===null||['string','boolean'].includes(typeof v))return v;
 if(typeof v==='number'){need(Number.isFinite(v),'R33_CURRENT_MAIN_JSON_NUMBER_CHANGED');return v}
 need(v&&typeof v==='object'&&(Array.isArray(v)||Object.getPrototypeOf(v)===Object.prototype),'R33_CURRENT_MAIN_JSON_REQUIRED');
 const d=Object.getOwnPropertyDescriptors(v),keys=Object.keys(v);need(Reflect.ownKeys(v).length===keys.length+(Array.isArray(v)?1:0)
 &&keys.every(k=>d[k].enumerable&&Object.hasOwn(d[k],'value'))&&(!Array.isArray(v)||keys.length===v.length&&keys.every((k,i)=>k===String(i))),'R33_CURRENT_MAIN_JSON_PROPERTIES_CHANGED');
 return Object.freeze(Array.isArray(v)?keys.map(k=>jsonClone(v[k],depth+1)):Object.fromEntries(keys.map(k=>[k,jsonClone(v[k],depth+1)])))}
export function assertCurrentMainProtectionR33Activation(value){const a=jsonClone(value);need(exactKeys(a,['contract','independentReview','actualCurrentMainWitness','actualCurrentMainAudit'])
 &&Object.values(a).every(isRef)&&same(a.actualCurrentMainWitness,WITNESS)&&same(a.actualCurrentMainAudit,AUDIT),'R33_CURRENT_MAIN_ACTIVATION_REQUIRED');return a}
export function assertCurrentMainProtectionR33SourceContract(v,selfSHA256){need(exactKeys(v,['schemaVersion','kind','contractId','contractRevision','contractVersion','selection','currentMain','newProtectedStockSHA256','physicalVerifier','stockProgramSHA256','stockParametersSHA256','actualCurrentMainWitness','actualCurrentMainAudit','remoteReadAuthorized'])
 &&v.schemaVersion===1&&v.kind==='r33-current-main602-proof-r2-inventory-contract'&&v.contractId===P.contractId&&v.contractRevision===1&&v.contractVersion===P.contractVersion
 &&same(v.selection,SELECTION)&&same(v.currentMain,MAIN)&&v.newProtectedStockSHA256===P.newStockSHA256&&isRef(v.physicalVerifier)&&v.physicalVerifier.path===SELF&&v.physicalVerifier.sha256===selfSHA256
 &&v.stockProgramSHA256===P.stockProgramSHA256&&v.stockParametersSHA256===P.stockParametersSHA256&&same(v.actualCurrentMainWitness,WITNESS)&&same(v.actualCurrentMainAudit,AUDIT)
 &&v.remoteReadAuthorized===true,'R33_CURRENT_MAIN_SOURCE_CONTRACT_UNQUALIFIED');return v}
export async function readCurrentMainProtectionR33Qualification(activation,readLocal){
 const a=assertCurrentMainProtectionR33Activation(activation),refs=[{path:SELF,sha256:null},...AUTHORITY_REFS,ORIGINAL_SELECTION,SELECTION,...['contract','independentReview','actualCurrentMainWitness','actualCurrentMainAudit'].map(k=>a[k])],
 raw=await settleEvidenceReads(refs.map(r=>()=>readLocal(r.path)));for(let i=1;i<refs.length;i++)need(sha(raw[i])===refs[i].sha256,'R33_CURRENT_MAIN_AUTHORITY_BYTES_CHANGED');
 const selfSHA256=sha(raw[0]),offset=2+AUTHORITY_REFS.length,selection=JSON.parse(raw[offset]),[contract,review,witness,audit]=raw.slice(offset+1).map(JSON.parse);
 assertCurrentMainProtectionR33SourceContract(contract,selfSHA256);
 need(review.kind==='r33-current-main602-proof-r2-protection-physical-verifier-independent-local-review'&&review.verifierSHA256===selfSHA256&&review.stockProgramSHA256===P.stockProgramSHA256
 &&review.stockParametersSHA256===P.stockParametersSHA256&&review.staticPreparationReady===true&&review.remainingP0P1===0&&review.remoteOperationsPerformed===false&&review.actualFullProtectionQualified===false,'R33_CURRENT_MAIN_INDEPENDENT_REVIEW_UNQUALIFIED');
 need(selection.schemaVersion===1&&selection.kind==='r33-current-main602-proof-r2-protection-root-selection'&&selection.selected==='B-new-explicit-current-Main602-protected-inventory-snapshot'
 &&same(selection.originalSelection,ORIGINAL_SELECTION)&&selection.inventoryContractId===P.contractId&&selection.inventoryRevision===1&&selection.contractVersion===P.contractVersion&&selection.physicalKind===KIND
 &&same(selection.currentMainExpected,{root:'/home/superopen/All-Projects/msf',fingerprint:MAIN.sha256,files:MAIN.files,bytes:MAIN.bytes,metadataSHA256:MAIN.metadataSHA,rootIdentity:MAIN.identity})
 &&same(selection.originalMainExpectedPreserved,{fingerprint:'151300cf55e8e46445e5e3b85293c047f981b14f620350a217a61d9a987056ea',files:593,bytes:17914164,metadataSHA256:P.previousMainMetadataSHA256,inventoryContractId:P.previousContractId})
 &&same(selection.evidence.actualCurrentMain,WITNESS)&&same(selection.evidence.savedAudit,AUDIT)&&selection.sourceImplementationScope.physicalVerifier===SELF&&selection.sourceImplementationScope.otherStockAnd13AuthoritiesUnchanged===true
 &&selection.currentMainChangedCodeQualityQualified===false&&selection.currentMainDeploymentQualified===false&&selection.actualPG4Qualified===false,'R33_CURRENT_MAIN_SELECTION_UNBOUND');
 const frames=witness.currentMain?.frames;need(witness.schemaVersion===1&&witness.kind==='r33-pg4-preflight-fixed-main-diagnostic-result'&&witness.ready===true&&witness.diagnosticReadComplete===true&&witness.sourcesStable===true
 &&witness.errorCode===null&&witness.currentMain.readError===null&&witness.currentMain.helperVerified===true&&Array.isArray(frames)&&frames.length===2
 &&frames.every(f=>same({sha256:f.fingerprint,files:f.files,bytes:f.bytes,metadataSHA:f.metadataSHA256,stable:true,identity:f.rootIdentity},MAIN))
 &&same(witness.currentMain.framesEqual,{tuple:true,manifest:true,rootMetadata9:true})&&witness.mainBaselineQualified===false&&witness.fullProtectionQualified===false&&witness.currentR6CleanupQualified===false,'R33_CURRENT_MAIN_ACTUAL_WITNESS_UNBOUND');
 need(audit.kind==='r33-pg4-preflight-fixed-main-diagnostic-saved-evidence-independent-limited-audit'&&audit.savedEvidenceAuditPassed===true&&audit.actualDiagnosticReadComplete===true&&audit.currentMainSelectedManifestAndTupleIndependentlyAudited===true
 &&same({path:audit.publicRef?.path,sha256:audit.publicRef?.sha256},WITNESS)&&same(audit.currentMain?.framesEqualIndependentlyCompared,{tuple:true,manifest:true,rootMetadata9:true})
 &&Array.isArray(audit.currentMain.frames)&&audit.currentMain.frames.length===2&&audit.currentMain.frames.every(f=>same(f.tuple,MAIN)&&f.manifestRows===MAIN.files&&f.uniquePaths===MAIN.files&&f.manifestByteSum===MAIN.bytes&&f.identityEncodingSHA256===MAIN.sha256)
 &&audit.currentMain.helperVerifiedSourceBound===true&&audit.currentMain.readError===null&&audit.sourceRefsInitialFinalStable===true&&audit.mainBaselineQualified===false&&audit.fullProtectionQualified===false&&audit.currentR6CleanupQualified===false,'R33_CURRENT_MAIN_SAVED_AUDIT_UNBOUND');
 return {selfSHA256,refs,async recheck(){const final=await settleEvidenceReads(refs.map(r=>()=>readLocal(r.path)));need(final.every((v,i)=>sha(v)===sha(raw[i])),'R33_CURRENT_MAIN_QUALIFICATION_CHANGED')}};
}
export function currentMainProtectionR33Failure(e){const code=String(e?.message??'');return {schemaVersion:1,kind:KIND,at:new Date().toISOString(),ready:false,newContract:true,contractId:P.contractId,contractRevision:1,contractVersion:P.contractVersion,
 errorCode:/^(?:R33_CURRENT_MAIN|R29_NEW_PROTECTION|R29_BUILD_CLEANUP|R29_CLEANUP|R28_HOST)_[A-Z0-9_]+$/.test(code)?code:'R33_CURRENT_MAIN_OBSERVATION_FAILED',automaticRetry:false,
 oldProofsUntouched:true,newContractInventoryVerified:false,protectedInventoryFullyVerified:false,currentR6CleanupQualified:false,PG4Qualified:false,modelsInvoked:false,productAccepted:false,remoteMutationsPerformed:false,signalsSent:false,resourcesRemoved:false,rawErrorExported:false};}
export async function verifyFactoryCurrentMainProtectionContractR33(activation=null,deps={}){
 if(activation===null)return currentMainProtectionR33Failure(Error('R33_CURRENT_MAIN_ACTIVATION_REQUIRED'));
 const a=assertCurrentMainProtectionR33Activation(activation);
 const d={now:Date.now,readLocal:safeReadLocal,readRoot:defaultReadRoot,readPrimary:defaultReadPrimary,nodeState,queueState,verifyManifest:verifyR28InstalledManifest,...deps};need(typeof d.api==='function','R33_CURRENT_MAIN_API_REQUIRED');
 const qualification=await readCurrentMainProtectionR33Qualification(a,d.readLocal);
 const paths=[C.journalPath,C.copyJournalPath,C.installedManifestPath],raw=await settleEvidenceReads(paths.map(path=>()=>d.readLocal(path,'utf8')));need(sha(raw[2])===C.installedManifestSHA256,'R33_CURRENT_MAIN_INPUT_EVIDENCE_CHANGED');
 const [q,copy,manifest]=raw.map(JSON.parse);assertTargetCleanupR29Context(q,copy);need(q.restored===true&&q.taskId===P.sourceTaskId&&q.runId===P.sourceRunId&&sha(q.originalTemplate)===P.baseTemplateSHA256&&q.otherTemplatesSHA===P.otherCentralTemplatesSHA256,'R29_NEW_PROTECTION_SOURCE_TASK_CONTEXT_CHANGED');expectedCurrentMainProtectionStockR33(q);
 await d.verifyManifest(manifest,d.readLocal);await qualification.recheck();
 const [first,before]=await settleEvidenceReads([()=>readTargetCleanupR29Execution(q,d),()=>observeNewProtectionPlatform(q,d)]);assertNewProtectionTerminal(first);
 const hp=currentMainProtectionR33HostParams(manifest.preparation),program=currentMainProtectionR33HostProgram(manifest.preparation);need(sha(hp)===P.stockParametersSHA256&&sha(program)===P.stockProgramSHA256,'R33_CURRENT_MAIN_STOCK_READER_CHANGED');await qualification.recheck();const hostBefore=assertCurrentMainProtectionR33Host(await d.readRoot(hp,program),manifest.preparation,q);
 const native=await d.readRoot({...S,job:q.copyJob,taskId:q.taskId,runId:q.runId,originSHA256:C.originSHA256,parentIdentity:C.parentIdentity,workspaceIdentity:C.workspaceIdentity},targetCleanupR29HostProgram()),nativeComplete=assertTargetCleanupR29NativeHost(native,q);
 need(same(native.candidate,{sha256:B.fingerprint,files:621,bytes:B.sourceBytes,metadataSHA:B.metadataSHA,stable:true,identity:B.sourceIdentity})&&same(native.source,hostBefore.candidate)&&Number(before.node.unit.MainPID)===native.node.pid&&hostBefore.quiet.pid===native.node.pid&&hostBefore.quiet.start===native.node.startTicks&&hostBefore.quiet.boot===native.node.boot,'R29_NEW_PROTECTION_CANDIDATE_OR_NODE_CHANGED');
 const buildHost=await d.readRoot(B,buildCleanupR29HostProgram()),buildFlags=assertBuildOnlyR29Scope(buildHost);need(same(nodeIdentity(buildHost.node),nodeIdentity(native.node))&&same(buildHost.nodeACK,native.nodeACK)&&same(buildHost.source,native.candidate),'R29_NEW_PROTECTION_BUILD_RANGE_NODE_CHANGED');
 const hostAfter=assertCurrentMainProtectionR33Host(await d.readRoot(hp,program),manifest.preparation,q),[second,after]=await settleEvidenceReads([()=>readTargetCleanupR29Execution(q,d),()=>observeNewProtectionPlatform(q,d)]);assertNewProtectionTerminal(second);
 need(same(hostBefore,hostAfter)||same({...hostBefore,observedAt:null},{...hostAfter,observedAt:null}),'R29_NEW_PROTECTION_STOCK_OBSERVATION_CHANGED');need(same(before,after)&&first.runSHA256===second.runSHA256&&first.taskSHA256===second.taskSHA256&&first.resultSHA256===second.resultSHA256&&first.stored.storedRecordSHA256===second.stored.storedRecordSHA256,'R29_NEW_PROTECTION_PLATFORM_OR_TERMINAL_CHANGED');
 const final=await settleEvidenceReads(paths.map(path=>()=>d.readLocal(path,'utf8')));need(same(raw,final),'R29_NEW_PROTECTION_LOCAL_CONTEXT_CHANGED');for(const h of [hostBefore,native,buildHost,hostAfter])need(Number.isFinite(Date.parse(h.observedAt))&&d.now()-Date.parse(h.observedAt)>=-30000&&d.now()-Date.parse(h.observedAt)<300000,'R29_NEW_PROTECTION_OBSERVATION_STALE');
 await qualification.recheck();
 const ready=nativeComplete&&buildFlags.buildResourcesIndependentlyClean;
 return {schemaVersion:1,kind:KIND,at:new Date(d.now()).toISOString(),ready,newContract:true,contractId:P.contractId,contractRevision:1,contractVersion:P.contractVersion,oldProofsUntouched:true,originalMainMetadataDriftRecorded:true,originalMainMetadataUnchanged:false,originalMetadataDriftAttribution:'unknown',priorOriginalInventorySHA256:P.oldStockSHA256,newProtectedInventorySHA256:P.newStockSHA256,newContractInventoryVerified:true,protectedInventoryFullyVerified:true,originalContractProtectionVerified:false,oldBuildAttempt:B.attempt,oldBuildCleanupScopeVerified:buildFlags.buildResourcesIndependentlyClean,nativeSourceProcessAndSocketCleanupVerified:nativeComplete,queueIdle:true,fullQueueSQLVerified:true,nodeACKIdle:Object.values(native.nodeACK.counts).every(x=>x===0),globalSupervisorEnabled:false,profileUnchanged:true,profileSHA256:P.profileSHA256,baseTemplateSHA256:P.baseTemplateSHA256,otherCentralTemplatesSHA256:P.otherCentralTemplatesSHA256,otherNodeTemplatesSHA256:P.otherNodeTemplatesSHA256,sourceTaskId:q.taskId,sourceRunId:q.runId,terminal:{status:first.run.status,signed:true,nonlate:true,resultSHA256:first.resultSHA256,storedRecordSHA256:first.stored.storedRecordSHA256,runRecordSHA256:first.runSHA256,taskRecordSHA256:first.taskSHA256,ingestedSignedAgentReceipt:true,readerCryptographicallyReverified:false},sources:{main:hostAfter.source,r26:hostAfter.oldCandidate,r27:hostAfter.candidate,r29:native.candidate},fixedTools:hostAfter.fixedTools,installedSevenTools:hostAfter.installed,oldImmutableInventorySHA256:sha(hostAfter.oldImmutable),nodeConfigSHA256:hostAfter.nodeTemplates.configSHA256,node:native.node,selectionEvidence:SELECTION,actualCurrentMainWitness:a.actualCurrentMainWitness,actualCurrentMainAudit:a.actualCurrentMainAudit,physicalQualification:{activation:a,sourceSHA256:qualification.selfSHA256,stockProgramSHA256:P.stockProgramSHA256,stockParametersSHA256:P.stockParametersSHA256,sourcesStable:true},observations:{stockBefore:hostBefore,stockAfter:hostAfter,hostBeforeSHA256:sha(hostBefore),hostAfterSHA256:sha(hostAfter),nativeSource:native,oldBuild:buildHost},modelsInvoked:false,productCodeExecuted:false,productAccepted:false,full74ObjectivesAccepted:false,actualNewBuild:false,remoteMutationsPerformed:false,signalsSent:false,resourcesRemoved:false,rawLogsExported:false,privateEnvironmentExported:false,privateJournalExported:false,currentR6CleanupQualified:false,PG4Qualified:false,priorContractProtectionVerified:false,previousContractId:P.previousContractId,previousProtectedInventorySHA256:P.previousStockSHA256};
}

const fixedTools={
 'project-autonomy-fa01-coordinator.py':'f60c3e88056515e41bd0486285809b2342d783f21e225f9ffc64c3d96477740b',
 'project-autonomy-fa01-collector.mjs':'a6cc30f63134fdc6d5be4aaba6049b99c0920c0db3e89b612d607b7991e647b7',
 'project-autonomy-evidence.py':'57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2',
 'project-autonomy-fa01-browser.mjs':'4836a22a44155ad0a1bc2beedf18e2efb0c52aa57baa1c3c1cb735e47fbbada0',
 'factory-sandbox-broker-control.py':'43afea4244f741bbaa3b4d347304c51e6886b8533aceb04967a439de0a4d3dbd',
 'factory-sandbox-broker.py':'d4bcec4e88990e45c82d76574fe7c8de8eebd1db239cedceefd95a6b204d1954',
};
const installedSevenTools={wrapperSHA256:'59b1cfcdca6b70903f0d0718e91c49727d93874845b3110ec30b8d09f4ba4547',collectorSHA256:'537bbf4f0a542ba8f6c6d71d84f26fa47101d9ab5b0c078cc2d870a9d690b0a2',baselineSHA256:'59ac16000136d928bb94db725edb85568f55102c6aa807aaaef154269542d3af',policySHA256:'2c80ac09eff1f80210f87d1d3b9cef27a2feb164380f8b0bcb33efd9f9a37103',sudoRuleSHA256:'714f4238d13c9f984914646e8c2dd9d49f24e90f2f8a3c4256125ef2b0e64abc',brokerSHA256:'5440387d04ed57404b47c77aabcfea57502fb7d4e90ee74c87d8e6c1e8518f8b',brokerControlSHA256:'cf9a0e5a7885eabe39ddebacda0b1423d007a0229f06551b21dd8615264ce4af'};
export function assertCurrentMainProtectionR33Proof(value,{fresh=false,now=Date.now()}={}){
 need(value?.schemaVersion===1&&value.kind===KIND&&value.ready===true&&value.newContract===true&&value.contractId===P.contractId&&value.contractRevision===1&&value.contractVersion===P.contractVersion,'R29_BUILD_START_NEW_CONTRACT_UNPROVEN');
 need(value.oldProofsUntouched===true&&value.originalMainMetadataDriftRecorded===true&&value.originalMainMetadataUnchanged===false&&value.originalContractProtectionVerified===false&&value.originalMetadataDriftAttribution==='unknown'&&value.priorOriginalInventorySHA256===P.oldStockSHA256&&value.newProtectedInventorySHA256===P.newStockSHA256,'R29_BUILD_START_ORIGINAL_DRIFT_BOUNDARY_CHANGED');
 need(value.newContractInventoryVerified===true&&value.protectedInventoryFullyVerified===true&&value.oldBuildAttempt===B.attempt&&value.oldBuildCleanupScopeVerified===true&&value.nativeSourceProcessAndSocketCleanupVerified===true&&value.queueIdle===true&&value.fullQueueSQLVerified===true&&value.nodeACKIdle===true&&value.globalSupervisorEnabled===false&&value.profileUnchanged===true&&value.profileSHA256===P.profileSHA256&&value.baseTemplateSHA256===P.baseTemplateSHA256&&value.otherCentralTemplatesSHA256===P.otherCentralTemplatesSHA256&&value.otherNodeTemplatesSHA256===P.otherNodeTemplatesSHA256,'R29_BUILD_START_NEW_INVENTORY_OR_QUEUE_UNPROVEN');
 need(value.sourceTaskId===P.sourceTaskId&&value.sourceRunId===P.sourceRunId&&value.terminal?.status==='round-limit'&&value.terminal.signed===true&&value.terminal.nonlate===true&&value.terminal.resultSHA256===P.terminalResultSHA256&&value.terminal.storedRecordSHA256===P.storedRecordSHA256&&value.terminal.ingestedSignedAgentReceipt===true&&value.terminal.readerCryptographicallyReverified===false&&H.test(value.terminal.runRecordSHA256??'')&&H.test(value.terminal.taskRecordSHA256??''),'R29_BUILD_START_SOURCE_TERMINAL_CHANGED');
 need(value.modelsInvoked===false&&value.productCodeExecuted===false&&value.productAccepted===false&&value.full74ObjectivesAccepted===false&&value.actualNewBuild===false&&value.remoteMutationsPerformed===false&&value.signalsSent===false&&value.resourcesRemoved===false&&value.rawLogsExported===false&&value.privateEnvironmentExported===false&&value.privateJournalExported===false,'R29_BUILD_START_PROTECTION_BOUNDARY_CHANGED');
 need(same(value.sources?.main,MAIN)&&same(value.sources?.r26,{sha256:'66a56a19ce783c020ed211d7c6a2b620f1767783cd9c58525df3ca33dc0ce246',files:605,bytes:18078081,metadataSHA:'627d3db589bc56dbbdd1fc2510cc738f78297551d8ecc12648a80fd081bdc1d0',stable:true,identity:{device:66306,inode:6713082}})&&same(value.sources?.r27,{sha256:'9b07a5115c22d14f82e04ba45b66efbc5ac04f7faa696ab84d81e33696ec7b76',files:608,bytes:18127511,metadataSHA:'c62497e11de2bb1eeb4873b7d4d70cd8cc05974cafe4c5408d5bfbd041de43ac',stable:true,identity:{device:66306,inode:6713710}})&&same(value.sources?.r29,{sha256:B.fingerprint,files:621,bytes:B.sourceBytes,metadataSHA:B.metadataSHA,stable:true,identity:{device:66306,inode:6718050}}),'R29_BUILD_START_PROTECTED_SOURCE_CHANGED');
 const native=value.observations?.nativeSource,old=value.observations?.oldBuild;
 need(assertTargetCleanupR29NativeHost(native,{copyJob:'31fe2645b7f847e6c0a7d0eb8fe02ee1',runId:P.sourceRunId,taskId:P.sourceTaskId,sourceBefore:value.sources.r27})===true&&same(native.candidate,value.sources.r29)&&assertBuildOnlyR29Scope(old).buildResourcesIndependentlyClean===true,'R29_BUILD_START_ACTUAL_CENSUS_UNPROVEN');
 need(same(old.source,native.candidate)&&same(old.nodeACK,native.nodeACK)&&same(value.node,native.node)&&H.test(value.nodeConfigSHA256??'')&&value.oldImmutableInventorySHA256==='0388cb0ec341e58f1353b4c82e8202cfd072d9212318eee8228bc7b2b3bdbb09'&&same(value.fixedTools,fixedTools)&&same(value.installedSevenTools,installedSevenTools),'R29_BUILD_START_TOOL_OR_NODE_SCOPE_CHANGED');
 const at=Date.parse(value.at);need(Number.isFinite(at),'R29_BUILD_START_PROTECTION_TIME_INVALID');
 if(fresh)need(now-at>=-30000&&now-at<300000,'R29_BUILD_START_FRESH_PROTECTION_STALE');
 const hs=[value.observations?.stockBefore,value.observations?.nativeSource,value.observations?.oldBuild,value.observations?.stockAfter];
 need(hs.every(h=>Number.isFinite(Date.parse(h?.observedAt)))&&same(value.selectionEvidence,SELECTION)&&same(value.actualCurrentMainWitness,WITNESS)&&same(value.actualCurrentMainAudit,AUDIT)
 &&value.previousContractId===P.previousContractId&&value.previousProtectedInventorySHA256===P.previousStockSHA256&&value.priorContractProtectionVerified===false&&value.currentR6CleanupQualified===false&&value.PG4Qualified===false,'R33_CURRENT_MAIN_PROOF_PROVENANCE_CHANGED');
 const a=assertCurrentMainProtectionR33Activation(value.physicalQualification?.activation);
 need(value.physicalQualification.sourcesStable===true&&H.test(value.physicalQualification.sourceSHA256??'')&&value.physicalQualification.stockProgramSHA256===P.stockProgramSHA256
 &&value.physicalQualification.stockParametersSHA256===P.stockParametersSHA256,'R33_CURRENT_MAIN_READER_PROOF_UNBOUND');
 for(const h of [hs[0],hs[3]]){
  need(h.schemaVersion===1&&h.kind==='software-factory-r33-current-main602-protection-host-observation'&&h.helperVerified===true&&h.mutationsPerformed===false&&h.modelsInvoked===false
  &&h.rawLogsExported===false&&h.privateEnvironmentExported===false&&h.productCodeExecuted===false&&h.sourceVerificationScope==='public-manifest-and-metadata'
  &&sha(stock(h))===P.newStockSHA256&&same(h.fixedTools,fixedTools)&&same(h.installed,installedSevenTools),'R33_CURRENT_MAIN_STOCK_PROOF_CHANGED');
  need(h.originBound===true&&same(h.originIdentity,h.candidate.identity)&&h.nodeTemplates?.targetSHA256===P.baseTemplateSHA256&&h.nodeTemplates.otherTemplatesSHA256===P.otherNodeTemplatesSHA256
  &&H.test(h.nodeTemplates.configSHA256??'')&&h.quiet?.active===true&&h.quiet.pid===native.node.pid&&h.quiet.start===native.node.startTicks&&h.quiet.boot===native.node.boot
  &&same(h.quiet.children,[])&&same(h.quiet.counts,{runs:0,deliveries:0,logs:0})&&h.visudoVerified===true
  &&same(h.sandboxImage,{imageId:'sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc',architecture:'amd64',os:'linux',reference:'alpine@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc',observed:true}),'R33_CURRENT_MAIN_STOCK_NODE_OR_TOOL_CHANGED');
 }
 need(sha(hs[0])===value.observations.hostBeforeSHA256&&sha(hs[3])===value.observations.hostAfterSHA256
 &&same({...hs[0],observedAt:null},{...hs[3],observedAt:null})&&same(nodeIdentity(old.node),nodeIdentity(native.node)),'R33_CURRENT_MAIN_OBSERVATION_CHANGED');
 if(fresh)for(const h of hs)need(now-Date.parse(h.observedAt)>=-30000&&now-Date.parse(h.observedAt)<300000,'R33_CURRENT_MAIN_FRESH_OBSERVATION_STALE');
 return value;
}
