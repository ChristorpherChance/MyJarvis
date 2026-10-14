/** Prepared observer adapter. It changes the census source, not the protected inventory. */
import {createHash} from 'node:crypto';
import {canonical} from './run-factory-main-repair-r26.mjs';
import {targetCleanupR29HostProgram} from './verify-factory-target-cleanup-r29.mjs';
import {buildCleanupR29HostProgram} from './verify-factory-truth-gate-build-cleanup-r29.mjs';
import {newProtectionR29HostProgram} from './verify-factory-protection-contract-r29-r2.mjs';
import {boundProcessCensusR32NativeProgram,boundProcessCensusR32BuildProgram} from './factory-bound-process-census-r32.mjs';
const need=(v,c)=>{if(!v)throw Error(c)},sha=v=>createHash('sha256').update(v).digest('hex');
export const boundProtectionObserverR32Preparation=Object.freeze({
 schemaVersion:1,kind:'r32-bound-protection-observer-preparation',
 selection:{path:'artifacts/software-factory/goals-r29/r32-bound-census-selection-plan35-sync-1791853060714.json',sha256:'2e856ec2f1465c3d7a086bee6e6570e85ca0610c6a2c31613eb6e921127959a8',decisionId:'7248dfa2-31e8-4f0b-baaa-ca487a074189',revision:1},
 inventoryContractId:'9bf97027-a7f6-4706-b7ad-fcb29c304e41',inventoryContractRevision:1,
 oldObserverSourceSHA256:'de1c75c0becd8f2375dd2b0b1005d86f8c4052736d90725743dde3cc94a4de76',
 censusModuleSHA256:null,independentLocalReview:null,actualLinuxQualification:null,
 operationalQualified:false,inventoryPinsChanged:false,oldProofsReclassified:false
});

/** No root/API calls occur here. Only these exact frozen program bytes may be routed. */
export function createBoundProtectionObserverR32Adapter(preparation,readRoot){
 need(typeof readRoot==='function'&&preparation&&typeof preparation==='object','R32_BOUND_PROTECTION_INPUT_REQUIRED');
 const inventory=newProtectionR29HostProgram(preparation),nativeOld=targetCleanupR29HostProgram(),buildOld=buildCleanupR29HostProgram();
 const nativeNew=boundProcessCensusR32NativeProgram(),buildNew=boundProcessCensusR32BuildProgram();
 const expected=['inventory-before','native-source','old-build','inventory-after'];
 let next=0,failed=false,active=false;
 const sourceReceipts=[];
 async function read(params,program){
  let stage,original,actual,paramsCanonical;
  try{
   need(!active&&!failed&&next<expected.length,'R32_BOUND_PROTECTION_CALL_SEQUENCE_INVALID');
   stage=expected[next];original=stage.startsWith('inventory')?inventory:stage==='native-source'?nativeOld:buildOld;
   need(program===original,'R32_BOUND_PROTECTION_PROGRAM_SOURCE_CHANGED');
   actual=stage==='native-source'?nativeNew:stage==='old-build'?buildNew:original;
   paramsCanonical=canonical(params);
  }catch(e){failed=true;throw e;}
  // Bind params at call start and check them again after transport; source functions retain exact scope guards.
  active=true;
  try{
   const result=await readRoot(params,actual);
   need(!failed,'R32_BOUND_PROTECTION_CALL_FAILED_DURING_TRANSPORT');
   need(canonical(params)===paramsCanonical,'R32_BOUND_PROTECTION_PARAMETERS_CHANGED');
   sourceReceipts.push({stage,originalProgramSHA256:sha(original),actualProgramSHA256:sha(actual),parametersSHA256:sha(paramsCanonical),responseSHA256:sha(canonical(result))});
   next++;return result;
  }catch(e){failed=true;throw e;}finally{active=false;}
 }
 function receipts(){need(!active&&!failed&&next===expected.length,'R32_BOUND_PROTECTION_OBSERVATION_INCOMPLETE');return structuredClone(sourceReceipts);}
 return Object.freeze({readRoot:read,receipts});
}

/** Preparation cannot contact a machine or be consumed as an operational proof. */
export async function verifyBoundProtectionObserverR32(){
 const S=boundProtectionObserverR32Preparation;
 need(S.operationalQualified===true&&S.censusModuleSHA256&&S.independentLocalReview&&S.actualLinuxQualification,'R32_BOUND_PROTECTION_PREPARATION_NOT_QUALIFIED');
 throw Error('R32_BOUND_PROTECTION_OPERATIONAL_CONSUMER_NOT_IMPLEMENTED');
}
