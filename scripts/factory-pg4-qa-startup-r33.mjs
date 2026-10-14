/** Prepared PG4-only parent. External source/admission/reader refs default to null.
 * Root executes only the trusted Python lifecycle; package JS runs in UID1000 QA.
 * A completed producer run is not independent product or cleanup qualification.
 */
import {open,lstat,link,unlink,rename} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const SELF='scripts/factory-pg4-qa-startup-r33.mjs';
const WORKER='scripts/factory-pg4-qa-startup-worker-r33.py';
const DRIVER='scripts/factory-pg4-qa-startup-driver-r33.mjs';
const TRANSPORT={path:'scripts/managed-server-client.mjs',sha256:'e287938e2d79b0335523d3d198bd93b588541866cebc2c21d997ae6fce5e4a9f'};
const CONSUMER={path:'scripts/verify-factory-current-main-single-entry-protection-contract-r33.mjs',sha256:'9662ed9267f71cfaf709be8a43ab0a32383ded98f471a70edcd1f8c15b399785'};
const REPORTER={path:'scripts/factory-pg4-hook-reporter-r33.mjs',sha256:'ea8fc9d658cc19c9cca9a9e00a615756f4943c9f5e41e80fed998330d1d7f342'};
const PG_CLIENT={path:'scripts/factory-independent-pg-cjs-consumer-r29.mjs',sha256:'45d888de21d3221a66d43d7d601de358338892f26d3d14c9b1ddb5dd32850c99'};
const H=/^[a-f0-9]{64}$/,ATTEMPT=/^[a-f0-9]{32}$/;
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const need=(value,code)=>{if(!value)throw Error(code)};
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const same=(a,b)=>canonical(a)===canonical(b);
const keys=(v,expected)=>v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),[...expected].sort());
const freeze=v=>{if(v&&typeof v==='object'){Object.freeze(v);for(const x of Object.values(v))freeze(x)}return v};
function jsonData(v,depth=0){
 need(depth<48,'PG4_R33_JSON_DEPTH');if(v===null||typeof v==='string'||typeof v==='boolean')return;
 if(typeof v==='number'){need(Number.isSafeInteger(v),'PG4_R33_JSON_UNSAFE_INTEGER');return}
 need(v&&typeof v==='object'&&[Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(v)),'PG4_R33_PLAIN_DATA_REQUIRED');
 need(Reflect.ownKeys(v).every(k=>typeof k==='string'),'PG4_R33_NON_JSON_KEY');
 const descriptors=Object.getOwnPropertyDescriptors(v);
 for(const[k,d]of Object.entries(descriptors)){if(Array.isArray(v)&&k==='length')continue;need(d.enumerable&&'value'in d,'PG4_R33_ACCESSOR_REFUSED');jsonData(d.value,depth+1)}
 if(Array.isArray(v))need(Object.keys(v).length===v.length&&Object.keys(v).every((k,i)=>k===String(i)),'PG4_R33_SPARSE_ARRAY_REFUSED');
}
const safePath=p=>typeof p==='string'&&p.length<768&&!p.includes('\\')&&!p.includes('//')&&!p.split('/').some(k=>k==='.'||k==='..')&&(/^(?:scripts|artifacts)\/[A-Za-z0-9._/-]+$/.test(p)||/^\.jarvis-dev\/maintenance\/[A-Za-z0-9._-]+$/.test(p)||['.jarvis-dev/workspaces/msf-targets-r33/source/apps/server/src/modules/test/truth-gate.integration.test.ts','.jarvis-dev/workspaces/msf-targets-r32/source/apps/server/package.json','.jarvis-dev/workspaces/msf-targets-r32/source/apps/server/vitest.config.ts','.jarvis-dev/workspaces/msf-targets-r32/source/pnpm-lock.yaml'].includes(p));
const ref=v=>keys(v,['path','sha256'])&&safePath(v.path)&&H.test(v.sha256);
export const pg4QAStartupR33Protocol='PG4_QA_STARTUP_R33_V1';
export const pg4QAStartupR33Journal='.jarvis-dev/maintenance/factory-r33-pg4-qa-startup-once.json';
export const pg4QAStartupR33Scope=freeze({schemaVersion:1,kind:'r33-pg4-qa-startup-fixed-scope',protocol:pg4QAStartupR33Protocol,
 base:'/var/lib/jarvis-development/101/r33-pg4-qa-startup',ownerRuntimeMaxSec:900,ownerStopSec:120,childTimeoutMilliseconds:600000,resourceCount:4,resourceRoles:['postgres','pg4-runner','internal-network','postgres-data'],
 source:{fingerprint:'b3d6fa645cf90044fb70f8a29de5aee33bd1ee9ad33b4d770e374caa6fd696ed',files:625,bytes:18413597,fixtureSHA256:'c5645f7567232c7fc797f46f06bc8adc1f2517c18be305daaad01ac9248c3e1a'},
 runtime:{root:'/var/lib/jarvis-development/101/r32-truth-artifacts/9e83e22a1ebfcdfc699876860879d8acefe220d3abf49e802333719b549299e3/runtime',rootIdentity:{device:66306,inode:7924569},manifestSHA256:'b4f80840523e838500925387c332aad67b28083a448a17b04ae01999f4b6a8f7',contractSHA256:'27f8687bf5678a519684d4b86f21ed6147e923591ec4ba75cc5a28ec82cb7e71'},
 pgRuntime:{root:'/var/lib/jarvis-development/101/r29-qa-pg-runtime/3c7ade1178fc47184cd9aaba9e84b855/runtime',manifestSHA256:'d916c96e199ab7230a6397cd1f4f6fdbceacf30588a16b6943dc8da2996b6eb1'},
 images:{runner:'sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96',postgres:'sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d'},
 sourceRelationship:{kind:'explicit-readonly-37-byte-QA-fixture-overlay',originalArtifactBuildCoversEffectiveR33Source:false,originalCallbacksHooksSQLChanged:false,productArtifactOverwritten:false},
 reportEvidenceDomain:'host-held-original-report-bytes-retained-before-parse',nativeOrHTTPHistoricalPassesAreNewPG4Passes:false,independentScopeReader:null,actualPG4Qualified:false,operationalQualified:false});
export const pg4QAStartupR33Activation=null;
export const pg4QAStartupR33ActivationTemplate=freeze({schemaVersion:1,kind:'r33-pg4-qa-startup-parent-activation',protocol:pg4QAStartupR33Protocol,sourceContract:null,sourceReview:null,sourceAdmission:null,closureReview:null,protectionActivation:null,driverInputTemplate:null,sqlBootstrapRequest:null,sqlAfterRequest:null,admissionFiles:null});
const CONTROL={'source-contract.json':'sourceContract','worker-review.json':'sourceReview','driver-review.json':'sourceReview','source-admission.json':'sourceAdmission','driver-input-template.json':'driverInputTemplate','sql-bootstrap-request.json':'sqlBootstrapRequest','sql-after-request.json':'sqlAfterRequest'};
export const pg4QAStartupR33AdmissionPhasePlan=freeze({schemaVersion:1,kind:'r33-pg4-qa-four-phase-admission-plan',providedRoles:['sourceContract','sourceReview','runtimeQualification','priorScopeAdmission','issuerReview','sourceAdmission','entryReview'],sourceWitnessRoles:['runtimeWitness','sourceWitness','overlayVirtualWitness','pgRuntimeWitness'],deferredRoles:['freshProtection','preScopeAbsence','mountWitness','imageWitness','readonlyOverlayWitness','nodeExecutableRootWitness'],postTerminalRole:'newPG4CurrentScopeClosure',postTerminalIsPreFixtureInput:false});
const ADMISSION_ROLES=pg4QAStartupR33AdmissionPhasePlan.providedRoles;
const TOOL_ROLES={'driver.mjs':'driver','hook-reporter.mjs':'hookReporter','independent-sql.mjs':'independentSQL','physical-admission.mjs':'physicalAdmission','factory-independent-pg-cjs-consumer-r29.mjs':'pgConsumer','r29-qa-runtime-manifest.json':'pgManifest'};
/** Pure late A/entry data slots only. Files and qualification remain the reviewed caller's job. */
export function buildPG4QAStartupR33LateAdmissionDocuments(input=null){
 need(input!==null,'PG4_R33_LATE_ADMISSION_INPUT_REQUIRED');jsonData(input);
 need(keys(input,['driverInputTemplate','sqlBootstrapRequest','sqlAfterRequest','sourceAdmissionRef','entryReviewRef'])&&ref(input.sourceAdmissionRef)&&ref(input.entryReviewRef),'PG4_R33_LATE_ADMISSION_INPUT_CHANGED');
 const driver=structuredClone(input.driverInputTemplate),bootstrap=structuredClone(input.sqlBootstrapRequest),after=structuredClone(input.sqlAfterRequest);
 need(keys(driver,['schemaVersion','kind','protocol','attempt','sourceContractHash','fixedRuntime','source','images','essentialManifestExpectations','config','preAdmission','sqlBaseline'])&&driver.schemaVersion===1&&driver.kind==='r33-pg4-qa-startup-driver-input'&&driver.protocol===pg4QAStartupR33Protocol&&driver.attempt===null&&H.test(driver.sourceContractHash),'PG4_R33_LATE_DRIVER_TEMPLATE_CHANGED');
 need(same(driver.preAdmission?.runtimeQualification,{path:'/tools/admission/runtimeQualification.json',sha256:null}),'PG4_R33_LATE_RUNTIME_SLOT_CHANGED');
 driver.preAdmission.runtimeQualification.sha256=input.sourceAdmissionRef.sha256;
 for(const[q,phase]of [[bootstrap,'bootstrap'],[after,'after-hooks']]){
  need(keys(q,['schemaVersion','kind','protocol','attempt','phase','sourceContractSHA256','driverSHA256','sqlSourceSHA256','runtimeWitness','migrationWitness','databaseIdentity','selectedFixtureSHA256'])&&q.schemaVersion===1&&q.kind==='r33-pg4-independent-sql-request'&&q.protocol===pg4QAStartupR33Protocol&&q.attempt===null&&q.phase===phase&&q.sourceContractSHA256===driver.sourceContractHash&&H.test(q.driverSHA256)&&H.test(q.sqlSourceSHA256)&&q.selectedFixtureSHA256===pg4QAStartupR33Scope.source.fixtureSHA256,'PG4_R33_LATE_SQL_TEMPLATE_CHANGED');
  need(same(q.runtimeWitness?.sourceAdmissionRef,{path:'/tools/meta/sourceAdmission.json',sha256:null})&&same(q.runtimeWitness?.entryReviewRef,{path:'/tools/meta/entryReview.json',sha256:null}),'PG4_R33_LATE_SQL_REF_SLOT_CHANGED');
  q.runtimeWitness.sourceAdmissionRef.sha256=input.sourceAdmissionRef.sha256;q.runtimeWitness.entryReviewRef.sha256=input.entryReviewRef.sha256;
 }
 need(bootstrap.driverSHA256===after.driverSHA256&&bootstrap.sqlSourceSHA256===after.sqlSourceSHA256,'PG4_R33_LATE_SQL_SOURCE_CHANGED');
 const providedRefPatch={sourceAdmission:{...input.sourceAdmissionRef},admissionFiles:{sourceAdmission:{...input.sourceAdmissionRef},runtimeQualification:{...input.sourceAdmissionRef},entryReview:{...input.entryReviewRef}}};
 return freeze({driverInputTemplate:driver,sqlBootstrapRequest:bootstrap,sqlAfterRequest:after,providedRefPatch});
}
export function assertPG4QAStartupR33Activation(activation=null){
 need(activation!==null,'PG4_R33_EXECUTION_FAMILY_NOT_QUALIFIED');jsonData(activation);
 need(keys(activation,Object.keys(pg4QAStartupR33ActivationTemplate))&&activation.schemaVersion===1&&activation.kind===pg4QAStartupR33ActivationTemplate.kind&&activation.protocol===pg4QAStartupR33Protocol,'PG4_R33_ACTIVATION_INVALID');
 for(const key of Object.keys(pg4QAStartupR33ActivationTemplate).filter(k=>!['schemaVersion','kind','protocol','admissionFiles'].includes(k)))need(ref(activation[key]),'PG4_R33_EXECUTION_FAMILY_NOT_QUALIFIED');
 need(keys(activation.admissionFiles,ADMISSION_ROLES)&&Object.values(activation.admissionFiles).every(ref),'PG4_R33_ADMISSION_FILES_MISSING');
 return freeze(JSON.parse(JSON.stringify(activation)));
}
export async function readPG4QAStartupR33Local(path,maximum=128*1024*1024){
 need(safePath(path),'PG4_R33_LOCAL_PATH_REFUSED');const before=await lstat(path,{bigint:true});need(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size<=BigInt(maximum),'PG4_R33_LOCAL_FILE_UNTRUSTED');
 const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));let raw,primary;
 const equal=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs'].every(k=>a[k]===b[k]);
 try{const held=await f.stat({bigint:true});need(equal(before,held),'PG4_R33_LOCAL_FILE_CHANGED');raw=await f.readFile();need(BigInt(raw.length)===held.size&&equal(held,await f.stat({bigint:true}))&&equal(held,await lstat(path,{bigint:true})),'PG4_R33_LOCAL_FILE_CHANGED')}catch(e){primary=e}finally{try{await f.close()}catch(e){if(primary)primary.secondaryCloseFailure='PG4_R33_LOCAL_CLOSE_FAILED';else primary=e}}if(primary)throw primary;return raw;
}
function assertSourceContract(c){
 need(c?.schemaVersion===1&&c.kind==='r33-pg4-qa-startup-source-contract'&&c.protocol===pg4QAStartupR33Protocol&&same(c.scope,pg4QAStartupR33Scope)&&keys(c.sources,['worker','starter','sourceAdmission','closureReader',...Object.values(TOOL_ROLES)])&&Object.values(c.sources).every(ref)&&c.sources.worker.path===WORKER&&c.sources.starter.path===SELF&&c.sources.driver.path===DRIVER&&same(c.sources.hookReporter,REPORTER)&&same(c.sources.pgConsumer,PG_CLIENT),'PG4_R33_SOURCE_CONTRACT_CHANGED');
 need(c.sources.sourceAdmission.path==='scripts/factory-pg4-source-admission-r33.mjs'&&c.sources.independentSQL.path==='scripts/factory-pg4-independent-sql-r33.mjs'&&c.sources.physicalAdmission.path==='scripts/factory-pg4-physical-admission-r33.mjs'&&Array.isArray(c.sourceRefs)&&c.sourceRefs.length>0&&c.sourceRefs.length<=1024&&c.sourceRefs.every(r=>ref({path:r.path,sha256:r.sha256}))&&c.independentReaderImplemented===true&&c.sqlImplemented===true&&c.sourceAdmissionImplemented===true&&c.completeExecutionFamily===true,'PG4_R33_EXECUTION_FAMILY_NOT_QUALIFIED');
 need(c.driverInputExpectations&&same(c.driverInputExpectations.source?.fixtureSHA256,pg4QAStartupR33Scope.source.fixtureSHA256),'PG4_R33_DRIVER_EXPECTATIONS_MISSING');return c;
}
export async function readPG4QAStartupR33Qualification(activation=null,deps={}){
 const a=assertPG4QAStartupR33Activation(activation); // Before dependency hooks or IO.
 const d={readLocal:readPG4QAStartupR33Local,...deps},raws=new Map(),rows=[];
 async function acquire(r){need(ref({path:r.path,sha256:r.sha256}),'PG4_R33_SOURCE_REF_INVALID');const prior=raws.get(r.path);if(prior){need(sha(prior)===r.sha256,'PG4_R33_DUPLICATE_PATH_HASH_CHANGED');return prior}const raw=Buffer.from(await d.readLocal(r.path));need(sha(raw)===r.sha256&&(r.bytes===undefined||raw.length===r.bytes),'PG4_R33_SOURCE_BYTES_CHANGED');raws.set(r.path,raw);rows.push({path:r.path,sha256:r.sha256,bytes:raw.length});return raw}
 const contract=assertSourceContract(JSON.parse(await acquire(a.sourceContract)));
 need(same(a.admissionFiles.sourceContract,a.sourceContract)&&same(a.admissionFiles.sourceReview,a.sourceReview)&&same(a.admissionFiles.sourceAdmission,a.sourceAdmission),'PG4_R33_STAGED_ROLE_SOURCE_CHANGED');
 need(contract.workerSHA256===contract.sources.worker.sha256&&contract.driverSHA256===contract.sources.driver.sha256&&contract.sqlDriverSHA256===contract.sources.driver.sha256&&contract.sqlSourceSHA256===contract.sources.independentSQL.sha256&&same(contract.admissionPhasePlan,pg4QAStartupR33AdmissionPhasePlan),'PG4_R33_SOURCE_CONTRACT_INTERFACE_CHANGED');
 for(const r of [TRANSPORT,CONSUMER,...Object.values(contract.sources),...contract.sourceRefs,...Object.values(a.admissionFiles)])await acquire(r);
 const docs={};for(const key of ['sourceReview','sourceAdmission','closureReview','protectionActivation','driverInputTemplate','sqlBootstrapRequest','sqlAfterRequest'])docs[key]=JSON.parse(await acquire(a[key]));
 const review=docs.sourceReview;
 need(review.kind==='r33-pg4-qa-startup-independent-local-review'&&review.staticPreparationReady===true&&review.remainingP0P1===0&&review.actualPG4Qualified===false&&review.completeExecutionFamily===true&&review.workerSHA256===contract.sources.worker.sha256&&review.starterSHA256===contract.sources.starter.sha256&&review.driverSHA256===contract.sources.driver.sha256&&same(review.sourceSHA256,Object.fromEntries(Object.entries(contract.sources).map(([k,r])=>[k,r.sha256]))),'PG4_R33_FULL_FAMILY_REVIEW_REQUIRED');
 for(const r of review.sourceRefs??[])await acquire(r);
 const closure=docs.closureReview;need(closure.kind==='r33-pg4-current-resource-scope-independent-local-review'&&closure.staticPreparationReady===true&&closure.remainingP0P1===0&&closure.actualPG4Qualified===false&&closure.callerSHA256===contract.sources.closureReader.sha256&&closure.resourceCount===4&&same(closure.resourceRoles,pg4QAStartupR33Scope.resourceRoles),'PG4_R33_CURRENT_SCOPE_READER_REQUIRED');for(const r of closure.sourceRefs??[])await acquire(r);
 const admission=docs.sourceAdmission;
 need(admission.kind==='r33-pg4-root-source-runtime-admission'&&admission.protocol===pg4QAStartupR33Protocol&&admission.sourceContractSHA256===a.sourceContract.sha256&&admission.workerSHA256===contract.sources.worker.sha256&&admission.driverSHA256===contract.sources.driver.sha256&&same(admission.effectiveSource,pg4QAStartupR33Scope.source)&&admission.runtimeContractSHA256===pg4QAStartupR33Scope.runtime.contractSHA256&&admission.runtimeManifestSHA256===pg4QAStartupR33Scope.runtime.manifestSHA256&&ref(admission.issuerSource)&&ref(admission.issuerReview)&&Array.isArray(admission.evidenceRefs)&&admission.evidenceRefs.length>0,'PG4_R33_SOURCE_ADMISSION_REQUIRED');
 need(same(admission.issuerSource,contract.sources.sourceAdmission),'PG4_R33_ADMISSION_ISSUER_SOURCE_CHANGED');
 await acquire(admission.issuerSource);const admissionReview=JSON.parse(await acquire(admission.issuerReview));need(admissionReview.kind==='r33-pg4-source-admission-independent-local-review'&&admissionReview.staticPreparationReady===true&&admissionReview.remainingP0P1===0&&admissionReview.actualPG4Qualified===false&&admissionReview.issuerSHA256===admission.issuerSource.sha256,'PG4_R33_SOURCE_ADMISSION_REVIEW_REQUIRED');for(const r of admission.evidenceRefs)await acquire(r);
 need(admission.phase==='A'&&admission.attempt===null&&admission.sourceBytesAdmitted===true&&admission.overlayInstalled===false&&admission.nodeActualMeasured===false&&admission.mountsObserved===false&&admission.currentBatchClosureClaimed===false&&same(a.admissionFiles.runtimeQualification,a.sourceAdmission)&&ref(admission.parametersRef)&&ref(admission.observationRef)&&admissionReview.programSHA256===admission.programSHA256,'PG4_R33_SOURCE_PHASE_A_REQUIRED');
 const parameters=JSON.parse(await acquire(admission.parametersRef)),observation=JSON.parse(await acquire(admission.observationRef));
 const {assertPG4SourceAdmissionHostR33,pg4SourceAdmissionR33Scope}=await import('./factory-pg4-source-admission-r33.mjs');need(same(parameters.scope,pg4SourceAdmissionR33Scope)&&parameters.executionContractSHA256===a.sourceContract.sha256&&parameters.workerSHA256===contract.sources.worker.sha256&&parameters.driverSHA256===contract.sources.driver.sha256&&parameters.programSHA256===admission.programSHA256,'PG4_R33_SOURCE_PHASE_A_CONTEXT_CHANGED');assertPG4SourceAdmissionHostR33(observation,parameters);need(same(admission.witnessBytes,observation.witnessBytes),'PG4_R33_SOURCE_PHASE_A_RAW_WITNESS_CHANGED');
 const wire=JSON.parse(await acquire(admission.transportRef));const originalStdout=Buffer.from(wire.stdoutBase64,'base64');need(wire.kind==='r33-pg4-source-admission-private-wire'&&wire.wireComplete===true&&wire.status===0&&wire.signal===null&&wire.errorCode===null&&wire.programSHA256===admission.hostProgramSHA256&&wire.parametersSHA256===sha(canonical(parameters))&&sha(originalStdout)===admission.observationRef.sha256&&originalStdout.toString('base64')===wire.stdoutBase64,'PG4_R33_SOURCE_PHASE_A_WIRE_CHANGED');
 const prior=JSON.parse(await acquire(a.admissionFiles.priorScopeAdmission));need(keys(prior,['schemaVersion','kind','qualificationRef','auditRef','observedAt','historicalNotFreshAdmission','currentBatchClosureClaimed'])&&prior.schemaVersion===1&&prior.kind==='r33-pg4-prior-r6-scope-admission'&&prior.historicalNotFreshAdmission===true&&prior.currentBatchClosureClaimed===false&&prior.qualificationRef?.sha256==='3830f22f633cf4d9694a2d44795936a4560019972eb7cb148e49b9c4370f353d'&&prior.auditRef?.sha256==='2dd222daac519dc4fd2e5497108b277e136c8014c69fe443bb624e698c93010c','PG4_R33_PRIOR_SCOPE_NOT_HISTORICAL');const priorOutcome=JSON.parse(await acquire(prior.qualificationRef)),priorAudit=JSON.parse(await acquire(prior.auditRef));need(priorAudit.kind==='r33-current-main-r6-scope-saved-evidence-independent-limited-audit'&&priorAudit.savedEvidenceAuditPassed===true&&priorAudit.currentR6CleanupQualified===true&&priorAudit.qualificationIsHistoricalNotFreshAdmission===true&&priorAudit.qualificationAt===prior.observedAt&&priorOutcome.at===prior.observedAt&&priorOutcome.currentR6CleanupQualified===true&&priorOutcome.actualCurrentR6ScopeObserved===true,'PG4_R33_PRIOR_SCOPE_SOURCE_CHANGED');
 const normalized=structuredClone(docs.driverInputTemplate);need(normalized?.kind==='r33-pg4-qa-startup-driver-input'&&normalized.protocol===pg4QAStartupR33Protocol&&normalized.attempt===null&&normalized.sourceContractHash===a.sourceContract.sha256,'PG4_R33_DRIVER_INPUT_TEMPLATE_CHANGED');
 const expected={fixedRuntime:normalized.fixedRuntime,source:normalized.source,images:normalized.images,essentialManifestExpectations:normalized.essentialManifestExpectations,config:normalized.config};
 need(same(expected.essentialManifestExpectations?.node,{path:'/usr/local/bin/node',sha256:null,bytes:null}),'PG4_R33_NODE_STATIC_STAGE_CHANGED');
 expected.essentialManifestExpectations.node.sha256=null;expected.essentialManifestExpectations.node.bytes=null;
 for(const[k,roles]of Object.entries({fixedRuntime:['runtimeWitness','mountWitness'],source:['sourceWitness','readonlyOverlayWitness'],images:['imageWitness']}))for(const role of roles){need(keys(expected[k][role],['path','sha256'])&&expected[k][role].path==='/tools/admission/'+role+'.json'&&expected[k][role].sha256===null,'PG4_R33_DRIVER_WITNESS_MISSING');expected[k][role]=null}
 need(keys(normalized.preAdmission,['sourceContract','sourceReview','runtimeQualification','freshProtection','priorScopeAdmission','preScopeAbsence','expiresAt','physicalFrame'])&&normalized.preAdmission.expiresAt===null&&normalized.preAdmission.physicalFrame===null,'PG4_R33_DRIVER_PHASE_TEMPLATE_CHANGED');for(const role of ['sourceContract','sourceReview','runtimeQualification','priorScopeAdmission'])need(same(normalized.preAdmission[role],{path:'/tools/admission/'+role+'.json',sha256:a.admissionFiles[role].sha256}),'PG4_R33_DRIVER_PROVIDED_ROLE_CHANGED');for(const role of ['freshProtection','preScopeAbsence'])need(same(normalized.preAdmission[role],{path:'/tools/admission/'+role+'.json',sha256:null}),'PG4_R33_DRIVER_DEFERRED_ROLE_CHANGED');
 need(same(expected,contract.driverInputExpectations),'PG4_R33_DRIVER_STATIC_EXPECTATIONS_CHANGED');
 for(const[phase,key]of [['bootstrap','sqlBootstrapRequest'],['after-hooks','sqlAfterRequest']]){const q=docs[key];need(q.kind==='r33-pg4-independent-sql-request'&&q.protocol===pg4QAStartupR33Protocol&&q.attempt===null&&q.phase===phase&&q.sourceContractSHA256===a.sourceContract.sha256&&q.driverSHA256===contract.sources.driver.sha256&&q.sqlSourceSHA256===contract.sources.independentSQL.sha256&&q.selectedFixtureSHA256===pg4QAStartupR33Scope.source.fixtureSHA256,'PG4_R33_SQL_REQUEST_TEMPLATE_CHANGED')}
 const recheck=async()=>{let first;for(const[path,raw]of raws){try{need((await d.readLocal(path)).equals(raw),'PG4_R33_SOURCE_CHANGED_AFTER')}catch(e){if(!first)first=e;else first.secondarySourceFailure='PG4_R33_SOURCE_RECHECK_INCOMPLETE'}}if(first)throw first};
 await recheck();return {kind:'r33-pg4-qa-startup-local-qualification',ready:true,activation:a,contract,documents:docs,sourceRefs:rows,worker:raws.get(WORKER),sources:new Map(raws),recheck,actualPG4Qualified:false,remoteOperationsPerformed:false};
}
async function wx(path,raw,mode=0o600){
 const f=await open(path,'wx',mode);let first;
 try{await f.writeFile(raw);await f.sync()}catch(e){first=e}finally{try{await f.close()}catch(e){if(first)first.secondaryCloseFailure='PG4_R33_WRITE_CLOSE_FAILED';else first=e}}if(first)throw first;
 if(process.platform!=='win32'){const d=await open(dirname(path),'r');try{await d.sync()}finally{await d.close()}}
 return {path,sha256:sha(raw),bytes:Buffer.byteLength(raw)};
}
async function durableOnce(path,raw){
 const temporary=path+'.'+randomUUID()+'.tmp';await wx(temporary,raw);
 if(process.platform==='win32'){
  const r=spawnSync('python',['-c',"import ctypes,sys;f=ctypes.WinDLL('kernel32',use_last_error=True).MoveFileExW;f.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p,ctypes.c_ulong];f.restype=ctypes.c_int;sys.exit(0 if f(sys.argv[1],sys.argv[2],8) else 1)",resolve(temporary),resolve(path)],{windowsHide:true,timeout:10000});need(r.status===0,'PG4_R33_DURABLE_ONCE_FAILED');
 }else{await link(temporary,path);const d=await open(dirname(path),'r');try{await d.sync()}finally{await d.close()}await unlink(temporary)}
 need((await readPG4QAStartupR33Local(path)).equals(Buffer.from(raw)),'PG4_R33_ONCE_READBACK_FAILED');
}
async function save(q){const temporary=pg4QAStartupR33Journal+'.'+randomUUID()+'.tmp';await wx(temporary,Buffer.from(JSON.stringify(q)+'\n'));if(process.platform==='win32'){const r=spawnSync('python',['-c',"import ctypes,sys;f=ctypes.WinDLL('kernel32',use_last_error=True).MoveFileExW;f.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p,ctypes.c_ulong];f.restype=ctypes.c_int;sys.exit(0 if f(sys.argv[1],sys.argv[2],9) else 1)",resolve(temporary),resolve(pg4QAStartupR33Journal)],{windowsHide:true,timeout:10000});need(r.status===0,'PG4_R33_JOURNAL_DURABILITY_FAILED')}else{await rename(temporary,pg4QAStartupR33Journal);const d=await open(dirname(pg4QAStartupR33Journal),'r');try{await d.sync()}finally{await d.close()}}}
async function privateEvidence(value){const raw=Buffer.from(JSON.stringify(value)+'\n');need(raw.length<=128*1024*1024,'PG4_R33_PRIVATE_CAPTURE_LIMIT');return wx('.jarvis-dev/maintenance/pg4-r33-parent-private-'+Date.now()+'-'+randomUUID()+'.json',raw)}
export function pg4QAStartupR33HostProgram(workerRaw=null){
 need(Buffer.isBuffer(workerRaw)&&workerRaw.length>0&&workerRaw.length<160000,'PG4_R33_WORKER_SOURCE_REQUIRED');
 return "import base64,hashlib,json,sys,signal\nsignal.alarm(90)\nfrom types import ModuleType\nbody=base64.b64decode('"+workerRaw.toString('base64')+"',validate=True)\nif hashlib.sha256(body).hexdigest()!=p['workerSHA256']:raise RuntimeError('PG4_R33_HOST_WORKER_CHANGED')\nm=ModuleType('trusted_pg4_root_lifecycle');m.__file__='/trusted/source-only/worker.py'\nexec(compile(body,m.__file__,'exec'),m.__dict__)\nv=m.host_request(p,body)\nprint(json.dumps(v,separators=(',',':')))\n";
}
async function rawRoot(payload,program){const {lanProfile,python}=await import('./managed-server-client.mjs');return spawnSync('ssh',['-F',lanProfile,'-o','BatchMode=yes','jarvis-101','sudo -n python3 -I -'],{input:python(payload,program),windowsHide:true,timeout:120000,maxBuffer:32*1024*1024})}
function assertFrame(v,q,readonly){
 need(v?.schemaVersion===1&&v.kind==='r33-pg4-qa-startup-parent-observation'&&v.protocol===pg4QAStartupR33Protocol&&v.attempt===q.attempt&&v.readOnly===readonly&&v.workerSHA256===q.workerSHA256&&v.starterSHA256===q.starterSHA256&&v.driverSHA256===q.driverSHA256&&v.sourceContractSHA256===q.activation.sourceContract.sha256&&v.actualPG4Qualified===false&&v.cleanupIndependentlyVerified===false&&v.modelsInvoked===false&&v.unitProperties?.Id==='jarvis-pg4-qa-r33-'+q.attempt+'.service','PG4_R33_PARENT_RESPONSE_UNBOUND');
 const stem='jarvis-pg4-qa-r33-'+q.attempt;need(same(v.resources,{postgres:stem+'-postgres','pg4-runner':stem+'-runner','internal-network':stem+'-net','postgres-data':stem+'-data'}),'PG4_R33_RESOURCE_RESPONSE_CHANGED');
 if(q.invocationID&&v.unitProperties.LoadState==='loaded')need(v.unitProperties.InvocationID===q.invocationID,'PG4_R33_CURRENT_UNIT_INVOCATION_CHANGED');return v;
}
export async function startPG4QAStartupR33({action='inspect',activation=pg4QAStartupR33Activation}={},deps={}){
 need(['inspect','start','check'].includes(action),'PG4_R33_ACTION_INVALID');if(action==='inspect')return {kind:'r33-pg4-qa-startup-preparation',ready:false,completeExecutionFamily:false,actualPG4Qualified:false,remoteOperationsPerformed:false,journalCreated:false,modelsInvoked:false};
 assertPG4QAStartupR33Activation(activation); // Null refuses before dependencies/IO/nonce.
 const d={readLocal:readPG4QAStartupR33Local,qualify:readPG4QAStartupR33Qualification,writeOnce:durableOnce,save,privateEvidence,rawRoot,now:Date.now,nonce:()=>randomBytes(16).toString('hex'),verifyProtection:async a=>{const {verifyFactoryCurrentMainSingleEntryProtectionContractR33}=await import('./verify-factory-current-main-single-entry-protection-contract-r33.mjs');return verifyFactoryCurrentMainSingleEntryProtectionContractR33(a)},...deps};
 const qualification=await d.qualify(activation,{readLocal:d.readLocal}),a=qualification.activation,c=qualification.contract;await qualification.recheck();
 let q;if(action==='check'){q=JSON.parse(await d.readLocal(pg4QAStartupR33Journal));need(q.kind==='r33-pg4-qa-startup-local-once'&&same(q.activation,a)&&q.workerSHA256===c.sources.worker.sha256&&q.starterSHA256===c.sources.starter.sha256&&q.driverSHA256===c.sources.driver.sha256&&q.automaticRetry===false,'PG4_R33_CHECK_CONTEXT_CHANGED')}
 else{
  try{await d.readLocal(pg4QAStartupR33Journal);throw Error('PG4_R33_ONCE_ALREADY_INTENDED_USE_CHECK')}catch(e){if(e.code!=='ENOENT')throw e}
  const proof=await d.verifyProtection(qualification.documents.protectionActivation);
  const {assertCurrentMainSingleEntryProtectionContractR33}=await import('./verify-factory-current-main-single-entry-protection-contract-r33.mjs');assertCurrentMainSingleEntryProtectionContractR33(proof,{fresh:true,now:d.now()});
  need(proof.consumerSHA256===CONSUMER.sha256,'PG4_R33_NEW_PROTECTION_SOURCE_CHANGED');const proofRaw=Buffer.from(JSON.stringify(proof)+'\n'),proofRef=await d.privateEvidence({schemaVersion:1,kind:'r33-pg4-parent-fresh-protection',proof});await qualification.recheck();
  const attempt=d.nonce();need(ATTEMPT.test(attempt),'PG4_R33_NONCE_INVALID');q={schemaVersion:1,kind:'r33-pg4-qa-startup-local-once',protocol:pg4QAStartupR33Protocol,attempt,activation:a,workerSHA256:c.sources.worker.sha256,starterSHA256:c.sources.starter.sha256,driverSHA256:c.sources.driver.sha256,hostProgramSHA256:sha(pg4QAStartupR33HostProgram(qualification.worker)),sourceRefs:qualification.sourceRefs,intendedAt:new Date(d.now()).toISOString(),maximumStarts:1,automaticRetry:false,dispatched:false,startUncertain:false,protection:proofRef,receipts:[]};
  const controls={};for(const[name,key]of Object.entries(CONTROL)){const raw=qualification.sources.get(a[key].path);controls[name]={sha256:sha(raw),base64:raw.toString('base64')}}controls['protection.json']={sha256:sha(proofRaw),base64:proofRaw.toString('base64')};
  const fixture=await d.readLocal('.jarvis-dev/workspaces/msf-targets-r33/source/apps/server/src/modules/test/truth-gate.integration.test.ts');need(sha(fixture)===pg4QAStartupR33Scope.source.fixtureSHA256,'PG4_R33_FIXTURE_CHANGED');controls['fixture.ts']={sha256:sha(fixture),base64:fixture.toString('base64')};
  const tools={};for(const[name,role]of Object.entries(TOOL_ROLES)){const raw=qualification.sources.get(c.sources[role].path);tools[name]={sha256:sha(raw),base64:raw.toString('base64')}}
  const admissionFiles={};for(const role of Object.keys(a.admissionFiles)){const raw=role==='freshProtection'?proofRaw:qualification.sources.get(a.admissionFiles[role].path);admissionFiles[role]={sha256:sha(raw),base64:raw.toString('base64')}}
  admissionFiles.freshProtection={sha256:sha(proofRaw),base64:proofRaw.toString('base64')};
  q.payload={action:'start',protocol:pg4QAStartupR33Protocol,attempt,workerSHA256:q.workerSHA256,starterSHA256:q.starterSHA256,driverSHA256:q.driverSHA256,sourceContractSHA256:a.sourceContract.sha256,controls,tools,admissionFiles};
  await d.writeOnce(pg4QAStartupR33Journal,Buffer.from(JSON.stringify(q)+'\n')); // Durable before the only dispatch.
 }
 if(action==='check')await d.writeOnce(pg4QAStartupR33Journal+'.check-once.json',Buffer.from(JSON.stringify({kind:'r33-pg4-qa-startup-check-once',attempt:q.attempt,sourceContractSHA256:a.sourceContract.sha256,maximumChecks:1,automaticRetry:false})+'\n'));
 const payload=action==='start'?q.payload:{action:'check',protocol:pg4QAStartupR33Protocol,attempt:q.attempt,workerSHA256:q.workerSHA256,starterSHA256:q.starterSHA256,sourceContractSHA256:a.sourceContract.sha256,driverSHA256:q.driverSHA256,controls:{},tools:{},admissionFiles:{}};
 let result,primary;const captures=[];
 try{
  await qualification.recheck();const program=pg4QAStartupR33HostProgram(qualification.worker);need(sha(program)===q.hostProgramSHA256,'PG4_R33_HOST_PROGRAM_CHANGED');
  const transport=await d.rawRoot(payload,program),stdout=Buffer.from(transport.stdout??''),stderr=Buffer.from(transport.stderr??'');
  const wire=await d.privateEvidence({schemaVersion:1,kind:'r33-pg4-parent-private-wire',action,programSHA256:sha(program),parametersSHA256:sha(canonical(payload)),status:transport.status??null,signal:transport.signal??null,errorCode:transport.error?.code??null,stdoutBase64:stdout.toString('base64'),stderrBase64:stderr.toString('base64')});captures.push(wire);
  need(transport.status===0&&!transport.error,'PG4_R33_ROOT_CALL_UNCONFIRMED_USE_CHECK');const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(stdout));result=assertFrame(value,q,action==='check');
  q.receipts.push({action,wire,status:value.status,at:new Date(d.now()).toISOString()});if(action==='start'){q.dispatched=true;q.invocationID=value.unitProperties.InvocationID||null}q.lastStatus=value.status;await d.save(q);
 }catch(e){primary=e;if(action==='start'){q.startUncertain=true;try{await d.save(q)}catch(s){primary.secondaryJournalFailure='PG4_R33_JOURNAL_SAVE_FAILED'}}}
 try{await qualification.recheck()}catch(e){if(primary)primary.secondarySourceFailure='PG4_R33_SOURCE_CHANGED_AFTER';else primary=e}
 if(primary){primary.pg4CaptureEvidence={captures,sourceRefs:qualification.sourceRefs,maximumStarts:1,automaticRetry:false};throw primary}
 return {...result,transportEvidence:captures,sourceRefs:qualification.sourceRefs,sourceBytesVerifiedInitiallyAndFinally:true,actualPG4Qualified:false,cleanupIndependentlyVerified:false};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 // CLI has no implicit execution and cannot invent an activation/context.
 try{need(process.argv.length===2,'PG4_R33_EXPLICIT_REVIEWED_ENTRY_REQUIRED');console.log(JSON.stringify(await startPG4QAStartupR33()))}catch(e){console.log(JSON.stringify({ready:false,errorCode:/^PG4_R33_[A-Z0-9_]+$/.test(e.message)?e.message:'PG4_R33_UNKNOWN',actualPG4Qualified:false,modelsInvoked:false}));process.exitCode=1}
}
