/** Pure legacy-current source wrapper. No file, credential, transport or observer entry is called. */
import {createHash} from 'node:crypto';
import {canonical} from './run-factory-main-repair-r26.mjs';
import {assertMatrixCleanupR32Context,matrixCleanupR32HostProgram,parseMatrixCleanupR32Host,assertMatrixCleanupR32Host} from './verify-factory-truth-gate-matrix-cleanup-r32-r8.mjs';
const need=(v,c)=>{if(!v)throw Error(c)},sha=v=>createHash('sha256').update(v).digest('hex');
export const currentMainR6LegacySourceR33=Object.freeze({
 schemaVersion:1,kind:'r33-current-main-r6-legacy-current-source',version:1,
 sourceRole:'legacy-r8-d486-scandir-and-two-stage-pidfd',
 legacyModulePath:'scripts/verify-factory-truth-gate-matrix-cleanup-r32-r8.mjs',legacyModuleSHA256:'9ee25cc7533ff4bb61f8e7d89739e1d53a2b968055391f380f4183bf891bf36b',
 originalAcquireMethodsChanged:false,originalExitUnknownAndCountsChanged:false,
 singleEntryWholeProgramsUsedForCurrent:false,currentReportFileBytesReturnedToNode:false,
 currentReportEvidenceDomain:'Root source-bound held two-read file SHA/bytes/metadata and typed projection; original response wire captured separately',
 originalClosedObserverEntryInvoked:false,actualCurrentQualification:null,operationalQualified:false,
});
const same=(a,b)=>canonical(a)===canonical(b),keys=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),[...k].sort());
function immutableJSON(v,depth=0){need(depth<40,'R33_R6_CURRENT_JSON_DEPTH_CHANGED');if(v===null||['string','boolean'].includes(typeof v))return v;
 if(typeof v==='number'){need(Number.isFinite(v),'R33_R6_CURRENT_JSON_NUMBER_CHANGED');return v;}
 need(v&&typeof v==='object'&&(Array.isArray(v)||Object.getPrototypeOf(v)===Object.prototype),'R33_R6_CURRENT_JSON_REQUIRED');const d=Object.getOwnPropertyDescriptors(v),k=Object.keys(v);
 need(Reflect.ownKeys(v).length===k.length+(Array.isArray(v)?1:0)&&k.every(x=>d[x].enumerable&&Object.hasOwn(d[x],'value'))&&(!Array.isArray(v)||k.length===v.length&&k.every((x,i)=>x===String(i))),'R33_R6_CURRENT_JSON_PROPERTIES_CHANGED');
 return Object.freeze(Array.isArray(v)?k.map(x=>immutableJSON(v[x],depth+1)):Object.fromEntries(k.map(x=>[x,immutableJSON(v[x],depth+1)])));
}
/** Exact source string supplied by a separately held-byte caller gate. This only generates a trusted program string. */
export function prepareCurrentMainR6LegacySourceR33({sourceBundle=null,journal=null,start=null,scope=null}={}){
 need(sourceBundle&&keys(sourceBundle,['path','sha256','source'])&&sourceBundle.path===currentMainR6LegacySourceR33.legacyModulePath
  &&sourceBundle.sha256===currentMainR6LegacySourceR33.legacyModuleSHA256&&typeof sourceBundle.source==='string'&&sha(sourceBundle.source)===sourceBundle.sha256,
  'R33_R6_CURRENT_LEGACY_SOURCE_REQUIRED');
 need(journal&&start&&scope,'R33_R6_CURRENT_FIXED_CONTEXT_REQUIRED');
 const q=immutableJSON(journal),s=immutableJSON(start),fixed=immutableJSON(scope),payload=immutableJSON(assertMatrixCleanupR32Context(q,s,fixed));
 const program=matrixCleanupR32HostProgram(payload);
 return Object.freeze({schemaVersion:1,kind:'r33-current-main-r6-legacy-source-preparation',sourceRole:currentMainR6LegacySourceR33.sourceRole,
  legacyModuleSHA256:sourceBundle.sha256,program,programSHA256:sha(program),parameters:payload,parametersSHA256:sha(canonical(payload)),
  originalProgramAndPayloadUnmodified:true,currentReportFileBytesReturnedToNode:false,operationalQualified:false});
}
/** Only the physical/report predicates are reused; this cannot call the frozen R8 run or infer old whole protection. */
export function assertCurrentMainR6LegacyPhysicalR33(value,preparation){
 need(preparation?.kind==='r33-current-main-r6-legacy-source-preparation'&&preparation.sourceRole===currentMainR6LegacySourceR33.sourceRole
  &&preparation.legacyModuleSHA256===currentMainR6LegacySourceR33.legacyModuleSHA256&&sha(preparation.program)===preparation.programSHA256
  &&sha(canonical(preparation.parameters))===preparation.parametersSHA256,'R33_R6_CURRENT_SOURCE_PREPARATION_CHANGED');
 need(matrixCleanupR32HostProgram(preparation.parameters)===preparation.program,'R33_R6_CURRENT_LEGACY_PROGRAM_CHANGED');
 const host=parseMatrixCleanupR32Host(value),flags=assertMatrixCleanupR32Host(host,preparation.parameters);
 return {host,flags,sourceRole:currentMainR6LegacySourceR33.sourceRole,currentReportFileBytesReturnedToNode:false,
  currentReportEvidenceDomain:currentMainR6LegacySourceR33.currentReportEvidenceDomain,oldFullCleanupAcceptanceClaimed:false};
}
