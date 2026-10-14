import test from 'node:test';
import assert from 'node:assert/strict';
import {observeFiniteBuildEvidenceR32,finiteBuildEvidenceR32Failure,assertTerminalEvidenceStatusR32,closedResourceCensusR32,finiteBuildEvidenceReadersR32,finiteBuildEvidenceR32Pins} from './factory-build-evidence-read-r32.mjs';
import {buildEvidenceHostProgramR32,buildEvidenceR32Pins} from './factory-build-evidence-host-r32.mjs';
test('no actual journal cannot trigger any API or root reader',async()=>{
 const noIO=()=>{throw Error('UNEXPECTED_IO')};
 assert.equal(finiteBuildEvidenceR32Pins.workerSHA256,buildEvidenceR32Pins.toolSHA);
 const result=await observeFiniteBuildEvidenceR32({cleanup:true},{readLocal:async()=>{throw Object.assign(Error('absent'),{code:'ENOENT'})},render:noIO,readRoot:noIO,verifyProtection:noIO});assert.equal(result.reason,'R32_EVIDENCE_NOT_STARTED');assert.equal(result.cleanupIndependentlyVerified,false);
 assert.throws(()=>buildEvidenceHostProgramR32({}),/R32_EVIDENCE_FIXED_SCOPE_OR_OWNER_UNKNOWN/);
});
test('terminal by itself never asserts a complete physical census',()=>{
 const complete={buildResourcesIndependentlyClean:true,processesComplete:true,dockerComplete:true,ownerComplete:true,containerCgroupIdentityComplete:true,nodeACKIdle:true};
 assert.equal(closedResourceCensusR32(false,complete),false);assert.equal(closedResourceCensusR32(true,null),false);assert.equal(closedResourceCensusR32(true,complete),true);
 for(const key of Object.keys(complete))for(const value of [false,undefined,null,1,'true'])assert.equal(closedResourceCensusR32(true,{...complete,[key]:value}),false,key);
});
test('actual current and independent host terminal states must match',()=>{
 for(const status of ['pass','fail'])assert.doesNotThrow(()=>assertTerminalEvidenceStatusR32({state:{status}},{buildResultStatus:status}));
 for(const[current,host]of [['pass','fail'],['fail','pass'],['running','running'],['fail',undefined]])assert.throws(()=>assertTerminalEvidenceStatusR32({state:{status:current}},{buildResultStatus:host}),/TERMINAL_STATUS_CHANGED/);
});
test('incomplete evidence is saved unchanged before the qualification caller rejects',async()=>{
 const saved=[];const readers=finiteBuildEvidenceReadersR32({verifyProtection:async()=>({ready:false,rawErrorExported:false}),readRoot:async()=>({ready:false,rawLogsExported:false,privateEnvironmentExported:false}),saveEvidence:async value=>{saved.push(value);return{path:'CONTROLLED',sha256:'a'.repeat(64)}}});
 await readers.verifyProtection();await readers.readRoot({},'');assert.equal(saved.length,2);assert.equal(saved[0].ready,false);assert.equal(saved[1].ready,false);
});
test('public errors remain closed and cannot leak a private exception',()=>{
 const result=finiteBuildEvidenceR32Failure(Error('PRIVATE cookie and environment'));assert.equal(result.errorCode,'R32_EVIDENCE_OBSERVATION_FAILED');assert.equal(JSON.stringify(result).includes('PRIVATE'),false);assert.equal(result.productAccepted,false);assert.equal(result.cleanupIndependentlyVerified,false);
});
test('both new thin CLI modules import with no observation',async()=>{await import('./read-factory-truth-gate-build-r32.mjs');await import('./verify-factory-truth-gate-build-cleanup-r32.mjs')});
