/** Two new thin-entry controlled groups. No shared qualification/read, Root, or journal calls. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readPG4ViteSingleCreatorBytesOnceR33 as entry,retainPG4ViteSingleCreatorOutcomeR33 as retain} from '../.jarvis-dev/maintenance/read-r33-pg4-vite-single-creator-bytes-once.mjs';
test('new entry default and malformed/accessor options refuse before dependencies',async()=>{
 let touched=0;const poison=new Proxy({},{ownKeys(){touched++;throw Error('no dependency access')}});
 const v=await entry(null,poison);assert.equal(v.ready,false);assert.equal(v.localIOPerformed,false);
 await assert.rejects(entry({},poison),/EXPLICIT_OPTIONS_REQUIRED/);
 const a={};Object.defineProperty(a,'entryReview',{enumerable:true,get(){touched++;throw Error('no getter execution')}});
 await assert.rejects(entry(a,poison),/PLAIN_OPTIONS_REQUIRED/);assert.equal(touched,0);
});
test('actual13-contract ref loop, safe explicit projection, and completed/primary retention on writer failure',async()=>{
 const source=(await readFile('.jarvis-dev/maintenance/read-r33-pg4-vite-single-creator-bytes-once.mjs')).toString();
 const template=JSON.parse(await readFile('artifacts/software-factory/goals-r29/r33-pg4-vite-single-creator-external-data-template-1791935260988-2f7d4b8b-9b98-4024-b7b6-d6f2884c0348.json'));
 const review=JSON.parse(await readFile('artifacts/software-factory/goals-r29/r33-pg4-vite-single-creator-byte-reader-independent-local-review-1791935484478-06e3b5ea-0954-42fb-82d3-2b5c1d80dbbd.json'));
 const loop=source.match(/for\(const r of \[\.\.\.\(c\.sourceRefs[\s\S]+?\]\)await acquire\(r\);/)[0];assert.ok(!loop.includes('scopeRef'));
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor,seen=[];
 await new AsyncFunction('c','docs','review','acquire',loop)(template.sourceContract,{sourceReview:review},{sourceRefs:[]},async r=>{assert.equal(typeof r.path,'string');assert.match(r.sha256,/^[a-f0-9]{64}$/);seen.push(r.path)});
 assert.equal(seen.length,review.sourceRefs.length+3);assert.ok(seen.includes(template.sourceContract.designReview.path));assert.ok(seen.includes(template.sourceContract.selectedByteAudit.path));
 const wire={path:'.jarvis-dev/maintenance/controlled-vite-entry-wire.json',sha256:'a'.repeat(64),bytes:10},once={path:'.jarvis-dev/maintenance/controlled-vite-entry-once.json',sha256:'b'.repeat(64),bytes:10};
 const value={readComplete:true,selectedBytesQualified:true,selectedFiles:1,selectedPath:'fixed-one.js',selectedSHA256:'c'.repeat(64),selectedBytes:2086035,privateOriginalTransport:wire,once,privateBase64:'must-never-enter-public-projection'};
 const returnText=source.match(/ return\{schemaVersion:1,kind:'r33-pg4-vite-single-creator-byte-entry-result'[\s\S]+?;\n\}/)[0].slice(0,-2);
 const projection=new Function('value','evidence','sourceRefs',returnText)(value,{privateOutcome:null,completedCaptureRefs:{wire,once}},[]);assert.equal(projection.selectedBytes,2086035);assert.ok(!JSON.stringify(projection).includes(value.privateBase64));assert.ok(!Object.hasOwn(projection,'result'));
 await assert.rejects(retain({value,sourceRefs:[],savePrivate:async()=>{throw Error('controlled writer failed')},recheck:async()=>{}}),e=>{assert.equal(e.viteCreatorEntryObservedValue,value);assert.deepEqual(e.viteCreatorEntryEvidence.completedCaptureRefs,{wire,once});return true});
 const primary=Object.assign(Error('R33_VITE_CONTROLLED_PRIMARY'),{errno:5,viteCreatorCaptureEvidence:{wire,once}});
 await assert.rejects(retain({error:primary,savePrivate:async()=>{throw Error('controlled second writer failed')},recheck:async()=>{}}),e=>{assert.equal(e,primary);assert.equal(e.errno,5);assert.ok(e.viteCreatorEntryEvidence.secondaryFailureCodes.includes('VITE_CREATOR_ENTRY_OUTCOME_SAVE_INCOMPLETE'));assert.deepEqual(e.viteCreatorEntryEvidence.completedCaptureRefs,{wire,once});return true});
});
