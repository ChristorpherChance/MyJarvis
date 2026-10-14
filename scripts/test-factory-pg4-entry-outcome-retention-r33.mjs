import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pg4QAStartupR33SourceReadOnce} from '../.jarvis-dev/maintenance/run-r33-pg4-qa-startup-once.mjs';
test('PG4 entry new retention: successful source proof survives outcome-save failure',async()=>{
 const proof={isControlledFixture:true,kind:'r33-pg4-root-source-runtime-admission',evidenceRefs:[{path:'.jarvis-dev/maintenance/controlled-original-wire.json',sha256:'a'.repeat(64),bytes:7}]},first=Object.assign(Error('PG4_ENTRY_CONTROLLED_OUTCOME_WRITE_FAILED'),{errno:5});let reads=0,saves=0;const events=[];
 await assert.rejects(pg4QAStartupR33SourceReadOnce({intent:{},recheck:async()=>events.push('recheck'),writeIntent:async()=>events.push('intent'),readSource:async()=>{reads++;events.push('read');return proof},saveOutcome:async()=>{saves++;events.push('save');throw first}}),e=>e===first&&e.errno===5&&e.entrySourceAdmission===proof&&e.entrySourceOutcome===null);
 assert.equal(reads,1);assert.equal(saves,1);assert.deepEqual(events,['recheck','intent','recheck','read','save','recheck']);
 const source=await readFile('.jarvis-dev/maintenance/run-r33-pg4-qa-startup-once.mjs','utf8');assert.ok(source.includes('sourceAdmissionOnFailure:primary?.entrySourceAdmission??null'));
});
