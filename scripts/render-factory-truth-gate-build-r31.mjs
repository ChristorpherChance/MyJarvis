/** Deterministic, local-only bundle rendering. Actual source preparation is a separate root byte operation. */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {safeReadLocal} from './factory-repair-evidence-read-r26.mjs';
const need=(v,c)=>{if(!v)throw Error(c)},H=/^[a-f0-9]{64}$/,A=/^[a-f0-9]{32}$/;
export const shaR31=b=>createHash('sha256').update(b).digest('hex');
export const finiteBuildR31Scope=Object.freeze({
 source:'/home/superopen/All-Projects/msf-targets-r31/source',sourceFingerprintDFS:'7814f74e1e7c62b1aeb862a6617970551a00493ba2884bf65595cfe65ef2a981',
 localFlatFingerprint:'0800a9f384a3b96ce43b9b676c8b085fbc3666892a7376b7dde326069b2e030d',sourceFiles:625,sourceBytes:18413026,
 root:'/var/lib/jarvis-development/101/truth-gate-r31-build',sourceOriginRoot:'/var/lib/jarvis-development/101/targets-r31-preparation',
 image:'sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96',
 workerTemplate:'scripts/factory-truth-gate-build-r31.py',nativeTests:'scripts/test-factory-targeted-source-r31.mjs',
 nativeTestsSHA256:'4ab11676eb91967d9510dece4cd2d4ea7e6f748a7c0451748f7f5e69ab1fc040',
 stages:Object.freeze(['mount-proof','offline-install','build','typecheck','truth-unit','targeted-pure']),runtimeMaxSec:1800,stopTimeoutSec:300,
 configured:false,review:null,sourcePreparation:null,
});
export function assertR31SourcePreparation(v){
 const s=v?.source,o=v?.rootOrigin;
 need(v?.schemaVersion===1&&v.kind==='software-factory-r31-target-source-preparation'&&['prepare','check'].includes(v.action)&&v.readbackOnly===(v.action==='check')&&Number.isFinite(Date.parse(v.at))&&v.ready===true&&v.prepared===true&&v.twoCompleteSourceReadbacks===true&&v.originBound===true&&v.outOfScopeUnchanged===true&&v.protectedInventoryFullyVerified===true&&v.profileAndTemplatesUnchanged===true&&v.fullQueueSQLVerified===true&&v.nodeACKIdle===true&&v.queueIdle===true&&v.workspace===finiteBuildR31Scope.source&&v.modelsInvoked===false&&v.sourceCodeExecuted===false&&v.candidateCodeExecuted===false&&v.productAccepted===false&&v.privateFilesCopied===false&&v.gitHistoryCopied===false&&v.automaticRetry===false&&v.rawPayloadExported===false,'R31_BUILD_SOURCE_PREPARATION_UNPROVEN');
 need(isDeepStrictEqual(v.originalSource,{sha256:'4907e45a21799f2dd14ac2373769607f40d6b9e0319bb614fbe259b157e60493',files:621,bytes:18386584,metadataSHA:'2da9d3e490fd6d042113c067807a89b000a4f40fdb5fa8d3ca2911b6615ebce8',stable:true,identity:{device:66306,inode:6718050}}),'R31_BUILD_ORIGINAL_SOURCE_CHANGED');
 need(s?.sha256===finiteBuildR31Scope.sourceFingerprintDFS&&s.files===625&&s.bytes===18413026&&s.stable===true&&H.test(s.metadataSHA??'')&&Object.keys(s.identity??{}).sort().join(',')==='device,inode'&&Object.values(s.identity).every(n=>Number.isSafeInteger(n)&&n>0),'R31_BUILD_SOURCE_IDENTITY_UNPROVEN');
 need(A.test(v.job??'')&&o?.job===v.job&&o.path===finiteBuildR31Scope.sourceOriginRoot+'/'+o.job+'/origin.json'&&H.test(o.sha256??''),'R31_BUILD_ORIGIN_UNPROVEN');
 need(H.test(v.planSHA256??'')&&H.test(v.controllerSHA256??'')&&H.test(v.programSHA256??'')&&H.test(v.protectedInventorySHA256??''),'R31_BUILD_SOURCE_RECEIPT_BINDING_UNPROVEN');
 return {metadata:s.metadataSHA,identity:{device:s.identity.device,inode:s.identity.inode},originPath:o.path,originSHA:o.sha256};
}
/** The actual caller receipt, including its original bytes, is the source qualification. */
export async function readR31SourcePreparation(v,read=safeReadLocal){
 assertR31SourcePreparation(v);
 const ref=v.receipt;
 need(/^artifacts\/software-factory\/goals-r29\/target-source-r31-\d{13}-[a-f0-9-]{36}\.json$/.test(ref?.path??'')&&H.test(ref?.sha256??''),'R31_BUILD_SOURCE_RECEIPT_REQUIRED');
 const raw=await read(ref.path);
 need(Buffer.byteLength(raw)<=2000000&&shaR31(raw)===ref.sha256,'R31_BUILD_SOURCE_RECEIPT_CHANGED');
 let actual;try{actual=JSON.parse(String(raw))}catch{throw Error('R31_BUILD_SOURCE_RECEIPT_JSON_INVALID')}
 const bound=assertR31SourcePreparation(actual),{receipt,...supplied}=v;
 need(isDeepStrictEqual(supplied,actual),'R31_BUILD_SOURCE_RECEIPT_CONTEXT_CHANGED');
 return {actual,bound,receipt:{path:ref.path,sha256:ref.sha256}};
}
export function adaptR31PureTool(raw){
 let source=String(raw);
 const replacements=[
  ["const require=createRequire(import.meta.url),ts=require('typescript');","const require=createRequire('/work/source/package.json'),ts=require('typescript');"],
  ["const root=resolve('.jarvis-dev/workspaces/msf-targets-r31/source')","const root=resolve('/work/source')"],
  ["resolve('.jarvis-dev/workspaces/msf-targets-r29/source/apps/server/src/modules/test/test.integration.test.ts')","'/qa-tools/baseline-r29-t8.ts'"],
  ["resolve('.jarvis-dev/workspaces/msf-targets-r30/source/apps/server/src/modules/test/truth-gate.integration.test.ts')","'/qa-tools/baseline-r30-truth.ts'"],
 ];
 for(const [from,to] of replacements){need(source.includes(from),'R31_BUILD_PURE_TOOL_TEMPLATE_CHANGED');source=source.split(from).join(to);}
 need(!source.includes('msf-targets-r29/source')&&!source.includes('msf-targets-r30/source')&&!source.includes('msf-targets-r31/source'),'R31_BUILD_PURE_TOOL_UNCONFINED');
 return source;
}
export async function renderFiniteBuildR31Bundle(sourcePreparation,deps={}){
 if(sourcePreparation===undefined)return {kind:'software-factory-r31-build-local-preparation',ready:false,reason:'R31_BUILD_SOURCE_PREPARATION_UNAVAILABLE',source:finiteBuildR31Scope,actualBuildExecuted:false,modelsInvoked:false,productAccepted:false};
 const read=deps.readLocal??safeReadLocal,{actual,bound,receipt}=await readR31SourcePreparation(sourcePreparation,read);
 const [template,pure,r29,r30]=await Promise.allSettled([
  ()=>read(finiteBuildR31Scope.workerTemplate),()=>read(finiteBuildR31Scope.nativeTests),
  ()=>read('.jarvis-dev/workspaces/msf-targets-r29/source/apps/server/src/modules/test/test.integration.test.ts'),
  ()=>read('.jarvis-dev/workspaces/msf-targets-r30/source/apps/server/src/modules/test/truth-gate.integration.test.ts'),
 ].map(fn=>Promise.resolve().then(fn)));
 for(const r of [template,pure,r29,r30])if(r.status==='rejected')throw r.reason;
 need(shaR31(pure.value)===finiteBuildR31Scope.nativeTestsSHA256&&shaR31(r29.value)==='33fe6b985a940dea3fe62c82010c5727379374b5f813b89a5807fa4a001442f3'&&shaR31(r30.value)==='941bf1261f3ca26ea0edc77494efa69e70070b1148f8f97888d33f5b8ee4593b','R31_BUILD_QA_SOURCE_CHANGED');
 const files={'baseline-r29-t8.ts':r29.value,'baseline-r30-truth.ts':r30.value,'targeted-pure.mjs':adaptR31PureTool(pure.value)};
 const manifest={schemaVersion:1,kind:'r31-bounded-qa-tools',files:Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)).map(([name,body])=>[name,{sha256:shaR31(body),bytes:Buffer.byteLength(body)}]))};
 const manifestRaw=JSON.stringify(manifest)+'\n',manifestSHA=shaR31(manifestRaw);let worker=String(template.value);
 const substitutions={"METADATA=None":'METADATA='+JSON.stringify(bound.metadata),"IDENTITY=None":'IDENTITY='+JSON.stringify(bound.identity),"SOURCE_ORIGIN=None":'SOURCE_ORIGIN='+JSON.stringify(bound.originPath),"SOURCE_ORIGIN_SHA=None":'SOURCE_ORIGIN_SHA='+JSON.stringify(bound.originSHA),"QA_MANIFEST_SHA=None":'QA_MANIFEST_SHA='+JSON.stringify(manifestSHA)};
 for(const [from,to] of Object.entries(substitutions)){need(worker.split(from).length===2,'R31_BUILD_WORKER_TEMPLATE_CHANGED');worker=worker.replace(from,to);}
 need(!/^(?:METADATA|IDENTITY|SOURCE_ORIGIN|SOURCE_ORIGIN_SHA|QA_MANIFEST_SHA)=None$/m.test(worker),'R31_BUILD_NULL_SLOT_REMAINS');
 return {kind:'software-factory-r31-build-rendered-bundle',ready:true,scope:finiteBuildR31Scope,sourcePreparation:actual,sourcePreparationReceipt:receipt,sourcePreparationSHA256:receipt.sha256,worker,workerSHA256:shaR31(worker),templateSHA256:shaR31(template.value),qaTools:{files,manifest,manifestRaw,manifestSHA256:manifestSHA},renderedOnly:true,actualBuildExecuted:false,modelsInvoked:false,productAccepted:false};
}
