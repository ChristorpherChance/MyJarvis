import test from 'node:test';
import assert from 'node:assert/strict';
import {readPG4CurrentPrivateManifestR2Once as read,runPG4CurrentPrivateManifestR2ReadOnce as gated} from '../.jarvis-dev/maintenance/read-r33-pg4-current-private-manifest-r2-once.mjs';
test('D once default0IO, durable failure prevents read and one attempted read retains primary captures',async()=>{
 let touched=0;const dependencies=new Proxy({},{ownKeys(){touched++;throw Error('deps')}});const empty=await read(null,dependencies);assert.equal(empty.localIOPerformed,false);await assert.rejects(read({},dependencies),/EXPLICIT_OPTIONS_REQUIRED/);assert.equal(touched,0);
 let called=0;await assert.rejects(gated({intent:{},writeIntent:async()=>{throw Error('write rejected')},readScope:async()=>{called++},savePrivate:async()=>{},recheck:async()=>{}}),/write rejected/);assert.equal(called,0);
 const once={path:'.jarvis-dev/maintenance/controlled-only.json',sha256:'a'.repeat(64),bytes:100},wire={path:'.jarvis-dev/maintenance/controlled-wire.json',sha256:'b'.repeat(64),bytes:200};let written=false;
 const primary=Error('PG4_D_CURRENT_TRANSPORT_INCOMPLETE');primary.pg4CurrentEvidence={wire,protectionBefore:{realData:'before'},protectionAfter:{realData:'after'},sourceRefs:[]};
 const argumentsData={intent:{maximumReaderRuns:1},writeIntent:async()=>{if(written)throw Error('exclusive already exists');written=true;return once},readScope:async()=>{called++;throw primary},savePrivate:async()=>{throw Error('save rejected')},recheck:async()=>{}};
 await assert.rejects(gated(argumentsData),e=>{assert.equal(e,primary);assert.equal(e.pg4CurrentOnceEvidence.once,once);assert.equal(e.pg4CurrentOnceEvidence.rawCurrentTransport,wire);assert.equal(e.pg4CurrentOnceEvidence.protectionBeforeAvailable,true);assert.equal(e.pg4CurrentOnceEvidence.protectionAfterAvailable,true);assert.ok(e.pg4CurrentOnceEvidence.secondaryFailureCodes.includes('CURRENT_SCOPE_ENTRY_OUTCOME_SAVE_INCOMPLETE'));assert.ok(e.pg4CurrentEvidence.protectionAfter);return true});assert.equal(called,1);
 await assert.rejects(gated(argumentsData),/exclusive already exists/);assert.equal(called,1);
});
