import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readPG4MockerNodeBytesOnceR33 as once,retainPG4MockerNodeOutcomeR33 as retain} from '../.jarvis-dev/maintenance/read-r33-pg4-mocker-node-bytes-once.mjs';
test('new thin entry default/malformed0IO and completed wire preserved when outcome writer fails',async()=>{
 let touched=0;const poisoned=new Proxy({},{ownKeys(){touched++;throw Error('not accessed')}});const empty=await once(null,poisoned);assert.equal(empty.localIOPerformed,false);await assert.rejects(once({},poisoned),/EXPLICIT_OPTIONS_REQUIRED/);assert.equal(touched,0);
 const primary=Error('R33_MOCKER_ROOT_TRANSPORT_INCOMPLETE'),wire={path:'.jarvis-dev/maintenance/controlled-original.json',sha256:'a'.repeat(64),bytes:88};primary.mockerNodeCaptureEvidence={wire,once:null};const value={privateOriginalTransport:wire,readComplete:false};
 await assert.rejects(retain({value,error:primary,sourceRefs:[],savePrivate:async()=>{throw Error('writer refused')},recheck:async()=>{}}),e=>{assert.equal(e,primary);assert.deepEqual(e.mockerNodeEntryEvidence.completedCaptureRefs.wire,wire);assert.equal(e.mockerNodeEntryObservedValue,value);assert.ok(e.mockerNodeEntryEvidence.secondaryFailureCodes.includes('MOCKER_NODE_ENTRY_OUTCOME_SAVE_INCOMPLETE'));return true});
 const text=(await readFile('.jarvis-dev/maintenance/read-r33-pg4-mocker-node-bytes-once.mjs')).toString();assert.ok(text.includes('c.sourceEvidence,c.acquisitionReview,c.selectedByteAudit'));assert.ok(text.includes('readPG4MockerNodeByteQualificationR33'));assert.ok(!text.includes('scopeRef'));assert.ok(text.includes('selectedByteSummary:value.selectedByteSummary'));assert.ok(!text.includes('scopeObservation:value'));
});
