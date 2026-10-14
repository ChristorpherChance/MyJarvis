/** Finite prepared QA driver. Physical admission is external; default import performs no IO. */
import {open, lstat, realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export const pg4QAStartupR33Protocol = 'PG4_QA_STARTUP_R33_V1';
const ROOT='/work/source/apps/server', FIXTURE=ROOT+'/src/modules/test/truth-gate.integration.test.ts';
const DRIVER='/tools/driver.mjs', INPUT='/tools/driver-input.json', REPORTER='/tools/hook-reporter.mjs';
const FIXTURE_H='c5645f7567232c7fc797f46f06bc8adc1f2517c18be305daaad01ac9248c3e1a';
const EFFECTIVE_H='b3d6fa645cf90044fb70f8a29de5aee33bd1ee9ad33b4d770e374caa6fd696ed';
const REPORTER_H='ea8fc9d658cc19c9cca9a9e00a615756f4943c9f5e41e80fed998330d1d7f342';
const RUNTIME_H='27f8687bf5678a519684d4b86f21ed6147e923591ec4ba75cc5a28ec82cb7e71';
const PRIOR_R6={qualificationRef:{path:'artifacts/software-factory/goals-r29/r33-current-main-r6-scope-actual-read-1791912222149-5a007401-3410-48a9-a8d2-259e0acac3fc.json',sha256:'3830f22f633cf4d9694a2d44795936a4560019972eb7cb148e49b9c4370f353d'},auditRef:{path:'artifacts/software-factory/goals-r29/r33-current-main-r6-scope-saved-evidence-independent-limited-audit-1791913112083-2050fde5-3732-4035-b01b-f93c5f522fe7.json',sha256:'2dd222daac519dc4fd2e5497108b277e136c8014c69fe443bb624e698c93010c'},observedAt:'2026-10-13T17:23:42.075Z'};
const H=/^[a-f0-9]{64}$/, HEX=/^[a-f0-9]{32}$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(v,c)=>{if(!v)throw Error(c)};
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const same=(a,b)=>canonical(a)===canonical(b);
function data(v,depth=0){need(depth<32,'R33_PG4_DRIVER_INPUT_DEPTH');if(v===null||['string','boolean'].includes(typeof v))return;if(typeof v==='number'){need(Number.isSafeInteger(v),'R33_PG4_DRIVER_INPUT_INTEGER');return}need(v&&typeof v==='object'&&[Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(v)),'R33_PG4_DRIVER_DATA_REQUIRED');const d=Object.getOwnPropertyDescriptors(v);need(Reflect.ownKeys(v).every(k=>typeof k==='string'),'R33_PG4_DRIVER_DATA_REQUIRED');for(const[k,x]of Object.entries(d)){if(Array.isArray(v)&&k==='length')continue;need(x.enumerable&&'value'in x,'R33_PG4_DRIVER_ACCESSOR_REFUSED');data(x.value,depth+1)}}
const keys=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),[...ks].sort());
const path=p=>typeof p==='string'&&p.length<768&&/^\/[A-Za-z0-9@+._/-]+$/.test(p)&&!p.includes('//')&&!p.split('/').slice(1).some(k=>!k||k==='.'||k==='..');
const ref=(v,prefix='/tools/admission/')=>keys(v,['path','sha256'])&&path(v.path)&&v.path.startsWith(prefix)&&H.test(v.sha256);
const titles=Object.freeze([
 'orders a later serialized rerun after an older-BEGIN transaction and rejects the old draft basis',
 'invalidates a finalized report when an older-BEGIN manual revision obtains the batch afterwards',
 'places a manual revision strictly after a future prior timestamp without JavaScript rounding',
 'allows only one real concurrent selftest start and orders it after a future prior selftest',
]);
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const pattern='(?:'+titles.map(escape).join('|')+')$';
const workspaceBasenames=['vitest.workspace','vitest.projects'].flatMap(n=>['.ts','.mts','.cts','.js','.mjs','.cjs','.json'].map(e=>n+e));
const prep=()=>({schemaVersion:1,kind:'r33-pg4-qa-startup-driver-preparation',protocol:pg4QAStartupR33Protocol,ready:false,errorCode:'R33_PG4_DRIVER_PHYSICAL_ADMISSION_REQUIRED',actualStartupObserved:false,PG4Qualified:false,productAccepted:false,frameworkExecuted:false,fixtureLaunchAttempted:false,candidateMayHaveExecuted:null,operationalReady:false});
export const pg4QAStartupR33InputTemplate=Object.freeze({schemaVersion:1,kind:'r33-pg4-qa-startup-driver-input',protocol:pg4QAStartupR33Protocol,attempt:null,sourceContractHash:null,fixedRuntime:null,source:null,images:null,essentialManifestExpectations:null,config:null,preAdmission:null,sqlBaseline:null});
export function validatePG4QAStartupR33Input(input=null){
 if(input===null)return prep();data(input);
 need(keys(input,Object.keys(pg4QAStartupR33InputTemplate))&&input.schemaVersion===1&&input.kind==='r33-pg4-qa-startup-driver-input'&&input.protocol===pg4QAStartupR33Protocol&&HEX.test(input.attempt)&&H.test(input.sourceContractHash),'R33_PG4_DRIVER_INPUT_REQUIRED');
 need(keys(input.preAdmission,['sourceContract','sourceReview','runtimeQualification','freshProtection','priorScopeAdmission','preScopeAbsence','expiresAt','physicalFrame']),'R33_PG4_DRIVER_ADMISSION_REQUIRED');
 for(const role of ['sourceContract','sourceReview','runtimeQualification','freshProtection','priorScopeAdmission','preScopeAbsence'])need(ref(input.preAdmission[role])&&input.preAdmission[role].path==='/tools/admission/'+role+'.json','R33_PG4_DRIVER_ADMISSION_REF_CHANGED');
 need(input.preAdmission.sourceContract.sha256===input.sourceContractHash&&input.preAdmission.physicalFrame&&typeof input.preAdmission.expiresAt==='string','R33_PG4_DRIVER_ADMISSION_REQUIRED');
 need(keys(input.fixedRuntime,['contractSHA256','artifactRootIdentity','manifestSHA256','mountedRoot','runtimeWitness','mountWitness'])&&input.fixedRuntime.contractSHA256===RUNTIME_H&&input.fixedRuntime.mountedRoot==='/work'&&ref(input.fixedRuntime.runtimeWitness)&&ref(input.fixedRuntime.mountWitness),'R33_PG4_DRIVER_RUNTIME_REQUIRED');
 need(keys(input.source,['fixturePath','fixtureSHA256','effectiveSourceSHA256','sourceWitness','readonlyOverlayWitness'])&&input.source.fixturePath===FIXTURE&&input.source.fixtureSHA256===FIXTURE_H&&input.source.effectiveSourceSHA256===EFFECTIVE_H&&ref(input.source.sourceWitness)&&ref(input.source.readonlyOverlayWitness),'R33_PG4_DRIVER_SOURCE_REQUIRED');
 need(keys(input.images,['runnerImageID','postgresImageID','imageWitness'])&&[input.images.runnerImageID,input.images.postgresImageID].every(k=>/^sha256:[a-f0-9]{64}$/.test(k))&&ref(input.images.imageWitness),'R33_PG4_DRIVER_IMAGES_REQUIRED');
 need(keys(input.config,['testTimeoutMilliseconds','hookTimeoutMilliseconds','builtinPluginSummaries'])&&[input.config.testTimeoutMilliseconds,input.config.hookTimeoutMilliseconds].every(x=>Number.isSafeInteger(x)&&x>0&&x<=600000)&&Array.isArray(input.config.builtinPluginSummaries)&&input.config.builtinPluginSummaries.length>0&&input.config.builtinPluginSummaries.length<=128,'R33_PG4_DRIVER_CONFIG_REQUIRED');
 const e=input.essentialManifestExpectations;
 need(keys(e,['node','modules','internalPluginSources','workspaceBasenames'])&&e.node?.path==='/usr/local/bin/node'&&Array.isArray(e.modules)&&e.modules.length>0&&e.modules.length<=64&&Array.isArray(e.internalPluginSources)&&e.internalPluginSources.length>0&&same(e.workspaceBasenames,workspaceBasenames),'R33_PG4_DRIVER_MODULE_EXPECTATIONS_REQUIRED');
 for(const r of [e.node,...e.internalPluginSources])need(keys(r,['path','sha256','bytes'])&&path(r.path)&&H.test(r.sha256)&&Number.isSafeInteger(r.bytes)&&r.bytes>0&&r.bytes<=268435456,'R33_PG4_DRIVER_SOURCE_REF_CHANGED');
 need(new Set(e.modules.map(x=>x.specifier)).size===e.modules.length,'R33_PG4_DRIVER_DUPLICATE_MODULE');
 for(const m of e.modules)need(keys(m,['specifier','resolvedPath','sha256','bytes','exports'])&&typeof m.specifier==='string'&&path(m.resolvedPath)&&(m.resolvedPath.startsWith('/work/source/node_modules/')||m.resolvedPath===REPORTER)&&H.test(m.sha256)&&Number.isSafeInteger(m.bytes)&&m.bytes>0&&m.bytes<=8388608&&Array.isArray(m.exports)&&m.exports.length>0&&m.exports.every(x=>keys(x,['name','type'])&&typeof x.name==='string'&&['function','object','string','symbol'].includes(x.type)),'R33_PG4_DRIVER_MODULE_REF_CHANGED');
 for(const role of ['vitest/node','vitest/reporters','vitest/runners','vite','vite-node/client','vite-node/server','@vitest/runner','@vitest/runner/utils','@vitest/expect','@vitest/snapshot','@vitest/spy','chai','trusted-pg4-hook-reporter'])need(e.modules.some(m=>m.specifier===role),'R33_PG4_DRIVER_ESSENTIAL_MODULE_MISSING');
 const s=e.modules.find(m=>m.specifier==='trusted-pg4-hook-reporter');need(s.resolvedPath===REPORTER&&s.sha256===REPORTER_H,'R33_PG4_DRIVER_REPORTER_CHANGED');
 need(keys(input.sqlBaseline,['before','schemaIdentitySHA256','migrationsSHA256','businessRowsSHA256'])&&ref(input.sqlBaseline.before,'/tools/')&&input.sqlBaseline.before.path==='/tools/sql-baseline.json'&&[input.sqlBaseline.schemaIdentitySHA256,input.sqlBaseline.migrationsSHA256,input.sqlBaseline.businessRowsSHA256].every(k=>H.test(k)),'R33_PG4_DRIVER_SQL_BASELINE_REQUIRED');
 return JSON.parse(JSON.stringify(input));
}
async function readHeld(p,maximum=8388608){
 need(path(p)&&await realpath(p)===p,'R33_PG4_DRIVER_PHYSICAL_PATH_CHANGED');const a=await lstat(p,{bigint:true});need(a.isFile()&&!a.isSymbolicLink()&&a.nlink===1n&&a.size>=0n&&a.size<=BigInt(maximum),'R33_PG4_DRIVER_FILE_UNTRUSTED');
 const f=await open(p,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));let raw,primary=null;
 const equal=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs'].every(k=>a[k]===b[k]);
 try{const b=await f.stat({bigint:true});need(equal(a,b),'R33_PG4_DRIVER_FILE_CHANGED');raw=await f.readFile();need(BigInt(raw.length)===b.size&&equal(b,await f.stat({bigint:true}))&&equal(b,await lstat(p,{bigint:true})),'R33_PG4_DRIVER_FILE_CHANGED')}catch(e){primary=e}finally{try{await f.close()}catch(e){if(!primary)primary=e;else primary.secondaryCloseFailure='R33_PG4_DRIVER_CLOSE_INCOMPLETE'}}if(primary)throw primary;return raw;
}
async function wx(p,v){const raw=Buffer.from(JSON.stringify(v)+'\n');need(p.startsWith('/evidence/')&&path(p)&&raw.length<=8388608,'R33_PG4_DRIVER_EVIDENCE_LIMIT');const f=await open(p,'wx',0o600);let primary=null;try{await f.writeFile(raw);await f.sync()}catch(e){primary=e}finally{try{await f.close()}catch(e){if(!primary)primary=e;else primary.secondaryCloseFailure='R33_PG4_DRIVER_CLOSE_INCOMPLETE'}}if(primary)throw primary;need((await readHeld(p)).equals(raw),'R33_PG4_DRIVER_EVIDENCE_CHANGED');return{path:p,sha256:sha(raw),bytes:raw.length}}
async function ownStatus(){const f=await open('/proc/'+process.pid+'/status',constants.O_RDONLY|constants.O_NOFOLLOW);let primary=null,text;try{const b=await f.readFile();need(b.length>0&&b.length<=65536,'R33_PG4_DRIVER_STATUS_INCOMPLETE');text=b.toString('utf8')}catch(e){primary=e}finally{try{await f.close()}catch(e){if(!primary)primary=e;else primary.secondaryCloseFailure='R33_PG4_DRIVER_CLOSE_INCOMPLETE'}}if(primary)throw primary;return text}
export function assertPG4QAStartupR33Fresh(p,fresh,now){
 const f=p?.preAdmission?.physicalFrame,observed=Date.parse(f?.observedAt),expires=Date.parse(f?.expiresAt),at=Date.parse(fresh?.at);
 need(Number.isFinite(now)&&Number.isFinite(observed)&&Number.isFinite(at)&&now>=observed&&now-observed<300000&&now>=at&&now-at<300000&&expires>now&&expires-observed<=300000&&p.preAdmission.expiresAt===f.expiresAt&&fresh.at===f.protection.observedAt,'R33_PG4_DRIVER_FINAL_ADMISSION_EXPIRED');return now;
}
export function assertPG4QAStartupR33PriorScope(prior,binding,expectedSHA256){
 // Historical qualification is an admission source. It is never this batch's phase-D closure.
 need(keys(prior,['schemaVersion','kind','qualificationRef','auditRef','observedAt','historicalNotFreshAdmission','currentBatchClosureClaimed'])&&prior.schemaVersion===1&&prior.kind==='r33-pg4-prior-r6-scope-admission'&&same(prior.qualificationRef,PRIOR_R6.qualificationRef)&&same(prior.auditRef,PRIOR_R6.auditRef)&&prior.observedAt===PRIOR_R6.observedAt&&prior.historicalNotFreshAdmission===true&&prior.currentBatchClosureClaimed===false,'R33_PG4_DRIVER_PRIOR_SCOPE_UNBOUND');
 need(keys(binding,['proofSHA256','observedAt','historicalNotFreshAdmission','currentBatchClosureClaimed'])&&binding.proofSHA256===expectedSHA256&&H.test(expectedSHA256)&&binding.observedAt===prior.observedAt&&binding.historicalNotFreshAdmission===true&&binding.currentBatchClosureClaimed===false,'R33_PG4_DRIVER_PRIOR_SCOPE_UNBOUND');return true;
}
export async function recordPG4QAStartupR33FixtureIntent(p,fresh,gateRef,deps={}){
 need(p?.protocol===pg4QAStartupR33Protocol&&HEX.test(p?.attempt??'')&&H.test(p?.sourceContractHash??'')&&keys(gateRef,['path','sha256','bytes'])&&gateRef.path==='/evidence/pg4-startup-frame.json'&&H.test(gateRef.sha256)&&Number.isSafeInteger(gateRef.bytes)&&gateRef.bytes>0,'R33_PG4_DRIVER_START_INTENT_BINDING_REQUIRED');
 const now=deps.now?.()??Date.now();assertPG4QAStartupR33Fresh(p,fresh,now);
 const value={schemaVersion:1,kind:'r33-pg4-qa-fixture-start-intent',protocol:pg4QAStartupR33Protocol,attempt:p.attempt,sourceContractSHA256:p.sourceContractHash,driverSHA256:p.preAdmission.physicalFrame.driverSHA256,gateRef,at:new Date(now).toISOString(),maximumStarts:1,automaticRetry:false,fixtureLaunchAttempted:false,candidateMayHaveExecuted:true,codeExecuted:null,mayFlagIsConservativeRiskNotExecutionEvidence:true,isControlledFixture:deps.isControlledFixture===true};
 const r=await (deps.writeEvidence??wx)('/evidence/pg4-fixture-start-intent.json',value);
 need(keys(r,['path','sha256','bytes'])&&r.path==='/evidence/pg4-fixture-start-intent.json'&&H.test(r.sha256)&&Number.isSafeInteger(r.bytes)&&r.bytes>0,'R33_PG4_DRIVER_START_INTENT_RECEIPT_CHANGED');return r;
}
export function assertPG4QAStartupR33Context(ctx,p,jsonReporter,hookReporter){
 const c=ctx?.config;
 need(c?.mode==='test'&&c.root===ROOT&&!c.runner&&c.watch===false&&c.retry===0&&c.allowOnly===false&&c.passWithNoTests===false&&same(c.setupFiles,[])&&same(c.globalSetup,[])&&same(c.include,['src/modules/test/truth-gate.integration.test.ts'])&&same(c.includeSource,[])&&c.testNamePattern instanceof RegExp&&c.testNamePattern.source===pattern&&c.testNamePattern.flags===''&&c.testTimeout===p?.config?.testTimeoutMilliseconds&&c.hookTimeout===p?.config?.hookTimeoutMilliseconds&&!c.coverage?.enabled&&!c.browser?.enabled&&!c.ui&&!c.api&&!c.reporter,'R33_PG4_DRIVER_NORMALIZED_CONFIG_CHANGED');
 need(ctx.server?.config?.configFile===false&&ctx.server.config.cacheDir==='/tmp/pg4-vite-cache'&&ctx._workspaceConfigPath===undefined&&ctx.projects?.length===1&&ctx.projects[0].config?.root===ROOT&&ctx.reporters?.length===2&&ctx.reporters[0]===jsonReporter&&ctx.reporters[1]===hookReporter&&jsonReporter?.options?.outputFile==='/evidence/pg4-vitest-result.json','R33_PG4_DRIVER_CONTEXT_OR_REPORTER_CHANGED');
 const plugins=ctx.server.config.plugins;need(Array.isArray(plugins),'R33_PG4_DRIVER_PLUGIN_FRAME_REQUIRED');const summaries=plugins.map(x=>({name:x.name,hookTypes:Object.fromEntries(Object.keys(x).filter(k=>k!=='name'&&k!=='api').sort().map(k=>[k,typeof x[k]]))}));
 need(same(summaries,p.config.builtinPluginSummaries),'R33_PG4_DRIVER_BUILTIN_PLUGIN_SUMMARY_CHANGED');return summaries;
}
// Failure text stays only in the already retained private driver result, never CLI stdout.
const FAILURE_CODES=new Set(['EACCES','EPERM','ENOENT','ENOTDIR','EISDIR','ELOOP','EMFILE','ENFILE','EBADF','EINVAL','EIO','EROFS','ENOSPC','ENOMEM','ETIMEDOUT','ECONNREFUSED','ECONNRESET','EADDRINUSE','ENOTFOUND','EPIPE','ERR_MODULE_NOT_FOUND','ERR_PACKAGE_PATH_NOT_EXPORTED','ERR_PACKAGE_IMPORT_NOT_DEFINED','ERR_REQUIRE_ESM','ERR_UNSUPPORTED_DIR_IMPORT','ERR_UNKNOWN_FILE_EXTENSION','ERR_DLOPEN_FAILED','ERR_INVALID_ARG_TYPE','ERR_INVALID_ARG_VALUE','ERR_INVALID_URL','ERR_WORKER_INIT_FAILED','ERR_WORKER_OUT_OF_MEMORY','ERR_FEATURE_UNAVAILABLE_ON_PLATFORM']);
const FAILURE_CLASSES=new Set(['Error','TypeError','RangeError','SyntaxError','ReferenceError','URIError','EvalError','AggregateError']);
export function snapshotPG4QAStartupR33Failure(error,phase,operation=null){
 const fields={},unavailable=[],truncated=[];let descriptors={},name='unknown',remaining=65536;
 try{descriptors=Object.getOwnPropertyDescriptors(error);let p=error;for(let i=0;p&&i<5;i++,p=Object.getPrototypeOf(p)){const n=Object.getOwnPropertyDescriptor(p,'name');if(n&&'value'in n&&FAILURE_CLASSES.has(n.value)){name=n.value;break}}}catch{unavailable.push('error-properties')}
 for(const key of ['message','stack','code','errno','syscall','path','dest']){
  const d=descriptors[key];if(!d)continue;if(!('value'in d)){unavailable.push(key);continue}
  const value=d.value;if(typeof value==='string'){
   const bytes=Buffer.from(value),maximum=Math.min(key==='stack'?32768:key==='message'?16384:2048,remaining),saved=bytes.subarray(0,maximum);remaining-=saved.length;
   fields[key]={encoding:'utf8-original-bytes-base64',base64:saved.toString('base64'),bytes:bytes.length,retainedBytes:saved.length,sha256:sha(saved),truncated:saved.length!==bytes.length};if(saved.length!==bytes.length)truncated.push(key);
  }else if(typeof value==='number'&&Number.isSafeInteger(value))fields[key]={value};else if(value!==undefined&&value!==null)unavailable.push(key);
 }
 const code=descriptors.code&&'value'in descriptors.code&&FAILURE_CODES.has(descriptors.code.value)?descriptors.code.value:null;
 const errno=descriptors.errno&&'value'in descriptors.errno&&Number.isSafeInteger(descriptors.errno.value)&&Math.abs(descriptors.errno.value)<=4096?descriptors.errno.value:null;
 return {summary:{phase,operation,errorClass:name,nodeCode:code,errno,privateErrorFieldsRetained:Object.keys(fields),truncatedFields:truncated,unavailableFields:unavailable},privateFailure:{schemaVersion:1,kind:'r33-pg4-driver-private-error-snapshot',phase,operation,fields,maximumRetainedTextBytes:65536,truncatedFields:truncated,unavailableFields:unavailable,rawTextPubliclyExported:false}};
}
export async function runPG4QAStartupR33(input=null,deps={}){
 if(input===null)return prep();const p=validatePG4QAStartupR33Input(input),controlled=deps.isControlledFixture===true;
 const read=deps.readHeld??readHeld,write=deps.writeEvidence??wx,load=deps.importModule??(u=>import(u));
 const originals=new Map(),refs=[];let ctx=null,primary=null,failure=null,phase='admission-documents',operation=null,started=0,gate=null,fixtureIntent=null;const secondary=[];const mark=(p,o=null)=>{phase=p;operation=o};
 const bytes=async(r,max=8388608)=>{const b=await read(r.path,max);need(Buffer.isBuffer(b)&&sha(b)===r.sha256&&(r.bytes===undefined||b.length===r.bytes),'R33_PG4_DRIVER_SOURCE_BYTES_CHANGED');const old=originals.get(r.path);need(!old||old.equals(b),'R33_PG4_DRIVER_SOURCE_CHANGED');originals.set(r.path,b);return b};
 const json=async r=>JSON.parse(await bytes(r));
 const recheck=async()=>{let first=null;for(const[path,raw]of originals){try{need((await read(path,Math.max(8388608,raw.length))).equals(raw),'R33_PG4_DRIVER_SOURCE_CHANGED')}catch(e){if(!first)first=e;else secondary.push('R33_PG4_DRIVER_SOURCE_RECHECK_INCOMPLETE')}}if(first)throw first};
 let result;
 try{
  const documents={};for(const k of ['sourceContract','sourceReview','runtimeQualification','freshProtection','priorScopeAdmission','preScopeAbsence']){mark('admission-document-read',k);documents[k]=await json(p.preAdmission[k])}
  mark('physical-frame-validation');
  const f=p.preAdmission.physicalFrame;
  need(f.kind==='r33-pg4-qa-pre-fixture-physical-admission'&&f.schemaVersion===1&&f.protocol===pg4QAStartupR33Protocol&&f.attempt===p.attempt&&f.sourceContractSHA256===p.sourceContractHash&&H.test(f.driverSHA256)&&H.test(f.workerSHA256)&&ref(f.issuerSource)&&ref(f.issuerReview)&&Array.isArray(f.evidenceRefs)&&f.evidenceRefs.length>0,'R33_PG4_DRIVER_PHYSICAL_ADMISSION_REQUIRED');
  mark('driver-source-read');const own=await bytes({path:DRIVER,sha256:f.driverSHA256});mark('contract-review-validation');
  const immutable=JSON.parse(JSON.stringify({fixedRuntime:p.fixedRuntime,source:p.source,images:p.images,essentialManifestExpectations:p.essentialManifestExpectations,config:p.config}));immutable.fixedRuntime.runtimeWitness=null;immutable.fixedRuntime.mountWitness=null;immutable.source.sourceWitness=null;immutable.source.readonlyOverlayWitness=null;immutable.images.imageWitness=null;immutable.essentialManifestExpectations.node.sha256=null;immutable.essentialManifestExpectations.node.bytes=null;
  need(documents.sourceContract.kind==='r33-pg4-qa-startup-source-contract'&&documents.sourceContract.protocol===pg4QAStartupR33Protocol&&documents.sourceContract.driverSHA256===f.driverSHA256&&documents.sourceContract.workerSHA256===f.workerSHA256&&H.test(documents.sourceContract.sqlDriverSHA256??'')&&H.test(documents.sourceContract.sqlSourceSHA256??'')&&same(documents.sourceContract.driverInputExpectations,immutable),'R33_PG4_DRIVER_CONTRACT_REQUIRED');
  need(documents.sourceReview.kind==='r33-pg4-qa-startup-independent-local-review'&&documents.sourceReview.driverSHA256===f.driverSHA256&&documents.sourceReview.workerSHA256===f.workerSHA256&&documents.sourceReview.staticPreparationReady===true&&documents.sourceReview.remainingP0P1===0,'R33_PG4_DRIVER_REVIEW_REQUIRED');
  mark('issuer-source-read');await bytes(f.issuerSource);mark('issuer-review-read');await json(f.issuerReview);for(const [i,r]of f.evidenceRefs.entries()){mark('admission-evidence-read',i);await bytes(r)}mark('admission-freshness');
  const now=deps.now?.()??Date.now(),observed=Date.parse(f.observedAt),expires=Date.parse(f.expiresAt);
  need(Number.isFinite(observed)&&now>=observed&&now-observed<300000&&expires>now&&expires-observed<=300000&&p.preAdmission.expiresAt===f.expiresAt,'R33_PG4_DRIVER_ADMISSION_EXPIRED');
  mark('physical-bindings-validation');need(f.source?.originalRuntimeContractSHA256===RUNTIME_H&&f.source.fixtureSHA256===FIXTURE_H&&f.source.effectiveSourceFingerprint===EFFECTIVE_H&&f.source.fileCount===625&&f.source.totalBytes===18413597&&f.source.overlayReadOnly===true&&same(f.runtime?.rootIdentity,p.fixedRuntime.artifactRootIdentity)&&f.runtime.manifestSHA256===p.fixedRuntime.manifestSHA256,'R33_PG4_DRIVER_SOURCE_ADMISSION_CHANGED');
  need(f.credentials?.uid===1000&&f.credentials.gid===1000&&f.credentials.nnp===1&&['capEff','capPrm','capInh','capAmb'].every(k=>f.credentials[k]==='0000000000000000'),'R33_PG4_DRIVER_CREDENTIAL_ADMISSION_CHANGED');
  assertPG4QAStartupR33PriorScope(documents.priorScopeAdmission,f.priorScopeAdmission,p.preAdmission.priorScopeAdmission.sha256);
  need(f.protection?.proofSHA256===p.preAdmission.freshProtection.sha256&&f.preScopeAbsence?.proofSHA256===p.preAdmission.preScopeAbsence.sha256&&documents.freshProtection.kind===f.protection.kind&&documents.freshProtection.consumerSHA256===f.protection.consumerSHA256&&documents.freshProtection.at===f.protection.observedAt&&documents.preScopeAbsence.observedAt===f.preScopeAbsence.observedAt&&now-Date.parse(documents.freshProtection.at)<300000&&now>=Date.parse(documents.freshProtection.at),'R33_PG4_DRIVER_PHYSICAL_FRAME_UNBOUND');
  for(const role of ['runtimeWitness','mountWitness']){mark('witness-document-read',role);await json(p.fixedRuntime[role])}for(const role of ['sourceWitness','readonlyOverlayWitness']){mark('witness-document-read',role);await json(p.source[role])}mark('witness-document-read','imageWitness');await json(p.images.imageWitness);mark('sql-baseline-read');const sql=await json(p.sqlBaseline.before);
  mark('sql-request-read');const sqlRequest=await read('/tools/sql-bootstrap.json',8388608);need(Buffer.isBuffer(sqlRequest),'R33_PG4_DRIVER_SQL_REQUEST_REQUIRED');originals.set('/tools/sql-bootstrap.json',sqlRequest);
  mark('sql-frame-validation');need(sql.kind==='r33-pg4-independent-sql-result'&&sql.phase==='bootstrap'&&sql.status==='complete'&&sql.actualPG4Qualified===false&&sql.overallSourceFamilyQualified===false&&sql.attempt===p.attempt&&sql.schemaIdentitySHA256===p.sqlBaseline.schemaIdentitySHA256&&sql.migrationsSHA256===p.sqlBaseline.migrationsSHA256&&sql.businessRowsSHA256===p.sqlBaseline.businessRowsSHA256&&sql.requestSHA256===sha(sqlRequest)&&sql.sourceContractSHA256===p.sourceContractHash&&sql.driverSHA256===documents.sourceContract.sqlDriverSHA256&&sql.sqlSourceSHA256===documents.sourceContract.sqlSourceSHA256,'R33_PG4_DRIVER_SQL_FRAME_UNBOUND');
  mark('own-runtime-profile');const profile=deps.profile?await deps.profile():{uid:process.getuid?.(),gid:process.getgid?.(),status:await ownStatus(),execPath:process.execPath,versions:process.versions};
  need(profile.uid===1000&&profile.gid===1000&&profile.execPath===p.essentialManifestExpectations.node.path&&/^NoNewPrivs:\s+1$/m.test(profile.status)&&['CapEff','CapPrm','CapInh','CapAmb'].every(k=>new RegExp('^'+k+':\\s+0{16}$','m').test(profile.status)),'R33_PG4_DRIVER_CREDENTIALS_CHANGED');
  mark('node-image-validation');need(same(p.essentialManifestExpectations.node,{path:f.nodeExecutable?.path,sha256:f.nodeExecutable?.sha256,bytes:f.nodeExecutable?.bytes})&&f.nodeExecutable.runnerImageID===p.images.runnerImageID,'R33_PG4_DRIVER_NODE_IMAGE_TUPLE_UNBOUND');
  mark('node-byte-read');await bytes(p.essentialManifestExpectations.node,268435456);for(const [i,r]of p.essentialManifestExpectations.internalPluginSources.entries()){mark('internal-plugin-source-read',i);await bytes(r)}
  mark('fixture-byte-read');await bytes({path:FIXTURE,sha256:FIXTURE_H});
  for(const name of p.essentialManifestExpectations.workspaceBasenames){mark('workspace-absence',name);const absent=deps.pathAbsent?await deps.pathAbsent(ROOT+'/'+name):await lstat(ROOT+'/'+name).then(()=>false,e=>{if(e.code==='ENOENT')return true;throw e});need(absent===true,'R33_PG4_DRIVER_WORKSPACE_PRESENT_OR_UNKNOWN')}
  const modules={},loaded=[];for(const m of p.essentialManifestExpectations.modules){mark('module-source-read',m.specifier);await bytes({path:m.resolvedPath,sha256:m.sha256,bytes:m.bytes});mark('module-import',m.specifier);const mod=await load(pathToFileURL(m.resolvedPath).href);mark('module-export-validation',m.specifier);for(const ex of m.exports)need(typeof mod[ex.name]===ex.type,'R33_PG4_DRIVER_MODULE_EXPORT_CHANGED');modules[m.specifier]=mod;loaded.push({specifier:m.specifier,path:m.resolvedPath,sha256:m.sha256,exports:m.exports,actualImportReturned:!controlled,resolvedOnly:false})}
  mark('framework-api-validation');need(typeof modules['vitest/node'].createVitest==='function'&&typeof modules['vitest/reporters'].JsonReporter==='function'&&typeof modules['trusted-pg4-hook-reporter'].default==='function','R33_PG4_DRIVER_API_MISSING');
  mark('reporter-construction');const jsonReporter=new modules['vitest/reporters'].JsonReporter({outputFile:'/evidence/pg4-vitest-result.json'}),hookReporter=new modules['trusted-pg4-hook-reporter'].default();
  const options={root:ROOT,config:false,mode:'test',watch:false,run:true,retry:0,allowOnly:false,passWithNoTests:false,setupFiles:[],globalSetup:[],include:['src/modules/test/truth-gate.integration.test.ts'],includeSource:[],testNamePattern:pattern,testTimeout:p.config.testTimeoutMilliseconds,hookTimeout:p.config.hookTimeoutMilliseconds,reporters:[jsonReporter,hookReporter],coverage:{enabled:false},browser:{enabled:false},ui:false,api:false,environment:'node'};
  mark('framework-create');ctx=await modules['vitest/node'].createVitest('test',options,{configFile:false,cacheDir:'/tmp/pg4-vite-cache',plugins:[]});
  mark('framework-context-validation');const pluginSummaries=assertPG4QAStartupR33Context(ctx,p,jsonReporter,hookReporter);
  mark('prestart-source-recheck');await recheck();mark('prestart-freshness');const gateNow=assertPG4QAStartupR33Fresh(p,documents.freshProtection,deps.now?.()??Date.now());mark('startup-frame-assembly');gate={schemaVersion:1,kind:'r33-pg4-qa-pre-fixture-startup-frame',protocol:pg4QAStartupR33Protocol,attempt:p.attempt,observedAt:new Date(gateNow).toISOString(),sourceContractSHA256:p.sourceContractHash,driverSHA256:sha(own),loaded,nodeExecutableSHA256:p.essentialManifestExpectations.node.sha256,selectedNodeVersions:{node:profile.versions.node,modules:profile.versions.modules,v8:profile.versions.v8},configSHA256:sha(canonical(options)),reporterObjectReferencesMatch:true,pluginSummaries,pluginAuthorityKind:'source-derived-frozen-creators-and-no-custom-inputs',actualPluginObjectSourceAuthenticated:false,defaultRunnerSelectionKind:'actual-config-plus-frozen-selector-source-derived',actualWorkerTestRunnerInstance:null,fixtureLaunchAttempted:false,candidateMayHaveExecuted:null,frameworkABIQualified:false,PG4Qualified:false,isControlledFixture:controlled};
  mark('startup-frame-write');const gateRef=await write('/evidence/pg4-startup-frame.json',gate);refs.push(gateRef);
  mark('fixture-intent-write');fixtureIntent=await recordPG4QAStartupR33FixtureIntent(p,documents.freshProtection,gateRef,{now:deps.now,writeEvidence:write,isControlledFixture:controlled});refs.push(fixtureIntent);
  mark('final-prestart-freshness');assertPG4QAStartupR33Fresh(p,documents.freshProtection,deps.now?.()??Date.now());started=1;
  mark('fixture-start');await ctx.start([FIXTURE]);
  result={schemaVersion:1,kind:'r33-pg4-qa-startup-driver-result',protocol:pg4QAStartupR33Protocol,attempt:p.attempt,status:'framework-finished',preFixtureGateVerified:true,frameworkExecuted:!controlled,fixtureLaunchAttempted:true,candidateMayHaveExecuted:true,codeExecuted:null,reportedCodeExecuted:null,actualWorkerTestRunnerInstance:null,actualStartupObserved:!controlled,PG4Qualified:false,productAccepted:false,isControlledFixture:controlled};
 }catch(e){primary=e;failure=snapshotPG4QAStartupR33Failure(e,phase,operation)}
 if(ctx){try{await ctx.close()}catch(e){if(!primary){primary=e;failure=snapshotPG4QAStartupR33Failure(e,'context-close')}else secondary.push('R33_PG4_DRIVER_CONTEXT_CLOSE_INCOMPLETE')}}
 try{await recheck()}catch(e){if(!primary){primary=e;failure=snapshotPG4QAStartupR33Failure(e,'final-source-recheck')}else secondary.push('R33_PG4_DRIVER_FINAL_SOURCE_INCOMPLETE')}
 if(primary)result={schemaVersion:1,kind:'r33-pg4-qa-startup-driver-result',protocol:pg4QAStartupR33Protocol,attempt:p.attempt,status:'incomplete',preFixtureGateVerified:Boolean(gate),errorCode:/^R33_[A-Z0-9_]+$/.test(primary.message)?primary.message:'R33_PG4_DRIVER_STAGE_INCOMPLETE',secondaryFailureCodes:secondary,fixtureLaunchAttempted:started===1,candidateMayHaveExecuted:fixtureIntent?true:null,codeExecuted:null,actualStartupObserved:false,PG4Qualified:false,productAccepted:false,isControlledFixture:controlled};
 result.firstFailure=failure?.summary??null;result.privateFailure=failure?.privateFailure??null;
 result.fixtureStartIntent=fixtureIntent;
 result.maximumStarts=1;result.startsAttempted=started;result.actualPluginObjectSourceAuthenticated=false;result.sourceRechecksAttempted=true;result.evidenceRefs=[...refs];
 let resultRef=null,reportRetentionVerified=false;
 try{resultRef=await write('/evidence/pg4-driver-result.json',result);reportRetentionVerified=true}
 catch(e){
  if(result.firstFailure){result.secondaryFailureCodes=[...(result.secondaryFailureCodes??[]),'R33_PG4_DRIVER_REPORT_RETENTION_INCOMPLETE']}
  else{result.firstFailure=snapshotPG4QAStartupR33Failure(e,'report-retention').summary;result.errorCode='R33_PG4_DRIVER_REPORT_RETENTION_INCOMPLETE';result.secondaryFailureCodes=[]}
  result.status='incomplete';result.actualStartupObserved=false;
 }
 const {privateFailure,...publicResult}=result;return{...publicResult,privateFailureRetained:reportRetentionVerified&&privateFailure!==null,reportRetentionVerified,resultRef};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{if(process.argv.length===2)console.log(JSON.stringify(prep()));else{need(process.argv.length===4&&process.argv[2]===INPUT&&H.test(process.argv[3]),'R33_PG4_DRIVER_EXPLICIT_INPUT_REQUIRED');const raw=await readHeld(INPUT);need(sha(raw)===process.argv[3],'R33_PG4_DRIVER_INPUT_BYTES_CHANGED');console.log(JSON.stringify(await runPG4QAStartupR33(JSON.parse(raw))))}}
 catch(e){console.log(JSON.stringify({schemaVersion:1,kind:'r33-pg4-qa-startup-driver-refusal',protocol:pg4QAStartupR33Protocol,ready:false,errorCode:/^R33_[A-Z0-9_]+$/.test(e.message)?e.message:'R33_PG4_DRIVER_INCOMPLETE',PG4Qualified:false,productAccepted:false,rawErrorExported:false}));process.exitCode=1}
}
