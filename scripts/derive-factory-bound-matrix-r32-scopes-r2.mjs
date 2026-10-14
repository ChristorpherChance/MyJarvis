/** Pure field derivation only. Does not read references, write packets or qualify operations. */
import {createHash} from 'node:crypto';import {canonical} from './run-factory-main-repair-r26.mjs';
import {matrixR32Scope,assertMatrixR32QualifiedScope} from './start-factory-truth-gate-matrix-r32-r6.mjs';
import {matrixCleanupR32Scope,matrixCleanupR32Protocol,matrixCleanupR32MissingPins} from './verify-factory-truth-gate-matrix-cleanup-r32-r8.mjs';
import {matrixResultsR32Scope,matrixResultsR32MissingPins} from './read-factory-truth-gate-matrix-results-r32-r6.mjs';
import {assertMatrixR32BoundAdmission} from './factory-matrix-bound-admission-r32-r2.mjs';
const H=/^[a-f0-9]{64}$/,sha=b=>createHash('sha256').update(b).digest('hex'),need=(v,c)=>{if(!v)throw Error(c)},same=(a,b)=>canonical(a)===canonical(b);
export const boundMatrixR32ScopeSourcePins=Object.freeze({
 worker:{path:'scripts/factory-truth-gate-matrix-worker-r32-r6.py',sha256:'2f5755eb18f9bf689ce505bdc664cd828e4b8b5db71c43e3d706e25703104562'},
 starter:{path:'scripts/start-factory-truth-gate-matrix-r32-r6.mjs',sha256:'0f586e7222f746474b1d5c27e2cb8e5e835364dade4a3fbca49aa62e33ca7f1d'},
 normal:{path:'scripts/verify-factory-truth-gate-matrix-cleanup-r32-r8.mjs',sha256:'9ee25cc7533ff4bb61f8e7d89739e1d53a2b968055391f380f4183bf891bf36b'},
 results:{path:'scripts/read-factory-truth-gate-matrix-results-r32-r6.mjs',sha256:'bbba16ca6ce5cfe38f3a57e32512222ea1db66987d523508815bc367b8f90240'}
});
export function deriveFactoryBoundMatrixR32Scopes({producerScope=null,admission=null,artifactValue=null,imageValue=null,familyReview=null}={}){
 const empty={schemaVersion:1,kind:'r32-bound-matrix-external-packet-field-example',shapeComplete:false,operationalQualified:false,actualReferencesVerified:false,packetWritten:false,nonceGenerated:false,remoteOperations:false,producer:{scope:null,admission:null},normal:{fixedScope:null,protectionActivation:null},results:{fixedScope:null}};
 if([producerScope,admission,artifactValue,imageValue,familyReview].some(v=>v===null))return empty;
 const s=structuredClone(assertMatrixR32QualifiedScope(producerScope)),a=structuredClone(assertMatrixR32BoundAdmission(admission));
 need(familyReview.kind==='r32-bound-matrix-family-independent-local-review-r2'&&familyReview.staticPreparationReady===true&&familyReview.remainingP0P1===0&&familyReview.remoteOperations===false&&same(familyReview.sourceSHA256,Object.fromEntries(Object.entries(boundMatrixR32ScopeSourcePins).map(([k,r])=>[k,r.sha256])))&&familyReview.admissionSHA256==='faffc68729c3e1b9dd629057648b406443067adb93823a852daaf8866b977e6e','QA_R32_EXAMPLE_FAMILY_SOURCE_CHANGED');
 need(s.worker.sha256===boundMatrixR32ScopeSourcePins.worker.sha256&&same(s.qualification.workerReview,a.familyIndependentReview)&&same(s.qualification.cleanupReview,a.familyIndependentReview)&&same(s.nativePrerequisite,artifactValue.nativePrerequisite)&&artifactValue.buildProofSHA256===s.qualification.buildProof.sha256,'QA_R32_EXAMPLE_RUNTIME_BINDING_CHANGED');
 const normal={...structuredClone(matrixCleanupR32Scope),workerSHA256:s.worker.sha256,starterSHA256:boundMatrixR32ScopeSourcePins.starter.sha256,installedWorker:s.worker.installedPath,producerScope:s,protocol:structuredClone(matrixCleanupR32Protocol),producerProtocolSHA256:sha(canonical(matrixCleanupR32Protocol)),artifactContract:{...s.qualification.artifactContract,value:structuredClone(artifactValue)},imageContract:{...s.qualification.imageContract,value:structuredClone(imageValue)}};
 need(matrixCleanupR32MissingPins(normal).length===0,'QA_R32_EXAMPLE_NORMAL_FIELDS_MISSING');
 const result={...structuredClone(matrixResultsR32Scope),cleanupModule:boundMatrixR32ScopeSourcePins.normal.path,cleanupModuleSHA256:boundMatrixR32ScopeSourcePins.normal.sha256,cleanupScope:normal,workerSHA256:s.worker.sha256,starterSHA256:boundMatrixR32ScopeSourcePins.starter.sha256,activationReview:a.familyIndependentReview};
 need(matrixResultsR32MissingPins(result).length===0,'QA_R32_EXAMPLE_RESULTS_FIELDS_MISSING');
 return {...empty,shapeComplete:true,producer:{scope:s,admission:a},normal:{fixedScope:normal,protectionActivation:a.protectionActivation},results:{fixedScope:result},sourcePins:Object.values(boundMatrixR32ScopeSourcePins),originalContractBytesMustRemainUnchanged:true,contractValuesAreForValidationOnly:true,normalDependencyHooks:['readRoot'],resultsDependencyHooks:['readLocal','loadCleanupModule'],currentFreshProtectionStillRequired:true,historicalRecoveryQualificationDoesNotExpireAt300Seconds:true,sourceFiles:625,nativeDenominator:1,httpSQLDenominator:34,additionalPGDenominator:4,sqlWitnessTables:13};
}
