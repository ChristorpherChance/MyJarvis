/** Pure field derivation only. Does not read references, write packets or qualify operations. */
import {createHash} from 'node:crypto';import {canonical} from './run-factory-main-repair-r26.mjs';
import {matrixR32Scope,assertMatrixR32QualifiedScope} from './start-factory-truth-gate-matrix-r32-r5.mjs';
import {matrixCleanupR32Scope,matrixCleanupR32Protocol,matrixCleanupR32MissingPins} from './verify-factory-truth-gate-matrix-cleanup-r32-r7.mjs';
import {matrixResultsR32Scope,matrixResultsR32MissingPins} from './read-factory-truth-gate-matrix-results-r32-r5.mjs';
import {assertMatrixR32BoundAdmission} from './factory-matrix-bound-admission-r32.mjs';
const H=/^[a-f0-9]{64}$/,sha=b=>createHash('sha256').update(b).digest('hex'),need=(v,c)=>{if(!v)throw Error(c)},same=(a,b)=>canonical(a)===canonical(b);
export const boundMatrixR32ScopeSourcePins=Object.freeze({
 worker:{path:'scripts/factory-truth-gate-matrix-worker-r32-r5.py',sha256:'6dbabc002bf5216898853321e552d3e2985b740335df623ce62f6af6dcdc65b6'},
 starter:{path:'scripts/start-factory-truth-gate-matrix-r32-r5.mjs',sha256:'7f1a7408fb5ba2b9ec9d017bbe3af78f892b921e8ea50df1cc7fe4b322497692'},
 normal:{path:'scripts/verify-factory-truth-gate-matrix-cleanup-r32-r7.mjs',sha256:'92d134c01a7b69fa19cff7f1df842584826c6b630f8e1548796bc74bba083b66'},
 results:{path:'scripts/read-factory-truth-gate-matrix-results-r32-r5.mjs',sha256:'bab6082853ec493a5824e249c16f315eaeb422703e9f7828be54a275e1709b8d'}
});
export function deriveFactoryBoundMatrixR32Scopes({producerScope=null,admission=null,artifactValue=null,imageValue=null,familyReview=null}={}){
 const empty={schemaVersion:1,kind:'r32-bound-matrix-external-packet-field-example',shapeComplete:false,operationalQualified:false,actualReferencesVerified:false,packetWritten:false,nonceGenerated:false,remoteOperations:false,producer:{scope:null,admission:null},normal:{fixedScope:null,protectionActivation:null},results:{fixedScope:null}};
 if([producerScope,admission,artifactValue,imageValue,familyReview].some(v=>v===null))return empty;
 const s=structuredClone(assertMatrixR32QualifiedScope(producerScope)),a=structuredClone(assertMatrixR32BoundAdmission(admission));
 need(familyReview.kind==='r32-bound-matrix-family-independent-local-review'&&familyReview.staticPreparationReady===true&&familyReview.remainingP0P1===0&&familyReview.remoteOperations===false&&same(familyReview.sourceSHA256,Object.fromEntries(Object.entries(boundMatrixR32ScopeSourcePins).map(([k,r])=>[k,r.sha256])))&&familyReview.admissionSHA256==='f48a4a89f0c81ae2bcd22b8513a80f016101e83304bd3fe7f62fb4b079e3017d','QA_R32_EXAMPLE_FAMILY_SOURCE_CHANGED');
 need(s.worker.sha256===boundMatrixR32ScopeSourcePins.worker.sha256&&same(s.qualification.workerReview,a.familyIndependentReview)&&same(s.qualification.cleanupReview,a.familyIndependentReview)&&same(s.nativePrerequisite,artifactValue.nativePrerequisite)&&artifactValue.buildProofSHA256===s.qualification.buildProof.sha256,'QA_R32_EXAMPLE_RUNTIME_BINDING_CHANGED');
 const normal={...structuredClone(matrixCleanupR32Scope),workerSHA256:s.worker.sha256,starterSHA256:boundMatrixR32ScopeSourcePins.starter.sha256,installedWorker:s.worker.installedPath,producerScope:s,protocol:structuredClone(matrixCleanupR32Protocol),producerProtocolSHA256:sha(canonical(matrixCleanupR32Protocol)),artifactContract:{...s.qualification.artifactContract,value:structuredClone(artifactValue)},imageContract:{...s.qualification.imageContract,value:structuredClone(imageValue)}};
 need(matrixCleanupR32MissingPins(normal).length===0,'QA_R32_EXAMPLE_NORMAL_FIELDS_MISSING');
 const result={...structuredClone(matrixResultsR32Scope),cleanupModule:boundMatrixR32ScopeSourcePins.normal.path,cleanupModuleSHA256:boundMatrixR32ScopeSourcePins.normal.sha256,cleanupScope:normal,workerSHA256:s.worker.sha256,starterSHA256:boundMatrixR32ScopeSourcePins.starter.sha256,activationReview:a.familyIndependentReview};
 need(matrixResultsR32MissingPins(result).length===0,'QA_R32_EXAMPLE_RESULTS_FIELDS_MISSING');
 return {...empty,shapeComplete:true,producer:{scope:s,admission:a},normal:{fixedScope:normal,protectionActivation:a.protectionActivation},results:{fixedScope:result},sourcePins:Object.values(boundMatrixR32ScopeSourcePins),originalContractBytesMustRemainUnchanged:true,contractValuesAreForValidationOnly:true,normalDependencyHooks:['readRoot'],resultsDependencyHooks:['readLocal','loadCleanupModule'],currentFreshProtectionStillRequired:true,historicalRecoveryQualificationDoesNotExpireAt300Seconds:true,sourceFiles:625,nativeDenominator:1,httpSQLDenominator:34,additionalPGDenominator:4,sqlWitnessTables:13};
}
