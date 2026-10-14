import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {independentPGCacheScope,independentPGCacheRootProgram,qualifyIndependentPGCacheReadback,readIndependentPGCacheR29} from './read-factory-independent-pg-cache-r29.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x));
const scope=await independentPGCacheScope();
function envelope(){return {schemaVersion:1,kind:'r29-independent-pg-cache-full-readback',at:new Date().toISOString(),producerAttempt:scope.producerAttempt,producerToolSHA256:scope.producerToolSHA256,producerStateSHA256:'a'.repeat(64),helperSHA256:scope.helper.sha256,totalBytes:scope.totalBytes,caches:scope.caches.map(c=>({...c,entries:c.files+1,fullClosureDoubleRead:true,rootOwnedReadOnly:true,sharedHardlinks:false,symlinks:false})),ready:true,cacheClosureIndependentlyVerified:true,twoFullReads:true,packageJavaScriptExecuted:false,packagesInstalled:false,runtimeFrozen:false,runtimeReady:false,productAccepted:false,modelsInvoked:false,mutationsPerformed:false,signalsSent:false,resourcesRemoved:false,rawPrivateDataExported:false};}
test('actual local scope binds exact R4 producer and all three full manifests',()=>{assert.equal(scope.totalBytes,475914918);assert.equal(scope.caches.length,3);assert.equal(sha(JSON.stringify(scope)),'3d3a9fdf3168245f67b6abf8ddc9ab868fff275303e2e083f5a1b22fc64141d6');});
test('modified producer receipt fails before remote',async()=>{await assert.rejects(independentPGCacheScope(async p=>(await readFile(p)).subarray(1)),/RECEIPT_CHANGED/);});
test('inspect qualifies actual stored cleanup proof without remote or acceptance',async()=>{let calls=0;const r=await readIndependentPGCacheR29('inspect',{readRoot:()=>{calls++;throw Error('remote forbidden');}});assert.equal(calls,0);assert.equal(r.ready,false);assert.equal(r.cleanupProofQualified,true);assert.equal(r.remoteReadPerformed,false);assert.equal(r.runtimeReady,false);});
test('changed cleanup bytes refuse before remote',async()=>{let calls=0;await assert.rejects(readIndependentPGCacheR29('read',{readLocal:async p=>{const b=await readFile(p);return p.includes('r4-independent-cleanup-with-evidence')?Buffer.concat([b,Buffer.from(' ') ]):b;},readRoot:()=>{calls++;throw Error('not called');}}),/CLEANUP_PROOF_CHANGED/);assert.equal(calls,0);});
test('qualification fixture accepts only cache envelope and keeps runtime false',()=>{const r=envelope();assert.equal(qualifyIndependentPGCacheReadback(r,scope),r);assert.equal(r.runtimeReady,false);});
for(const [name,change,code]of [
 ['different attempt',r=>r.producerAttempt='a'.repeat(32),'BINDING_INVALID'],
 ['different helper',r=>r.helperSHA256='b'.repeat(64),'BINDING_INVALID'],
 ['one read only',r=>r.twoFullReads=false,'BINDING_INVALID'],
 ['missing tree',r=>r.caches.pop(),'SET_INVALID'],
 ['wrong manifest byte pin',r=>r.caches[0].manifestSHA256='c'.repeat(64),'ENTRY_INVALID'],
 ['wrong immutable inode',r=>r.caches[0].identity.inode++,'ENTRY_INVALID'],
 ['wrong content hash',r=>r.caches[0].contentTreeSHA256='c'.repeat(64),'ENTRY_INVALID'],
 ['metadata drift',r=>r.caches[1].metadataSHA256='c'.repeat(64),'ENTRY_INVALID'],
 ['incomplete directory closure',r=>r.caches[1].entries=r.caches[1].files,'CLOSURE_INCOMPLETE'],
 ['shared input hardlinks',r=>r.caches[2].sharedHardlinks=true,'CLOSURE_INCOMPLETE'],
 ['unexpected symlinks',r=>r.caches[2].symlinks=true,'CLOSURE_INCOMPLETE'],
 ['runtime accepted by cache test',r=>r.runtimeReady=true,'BOUNDARY_INVALID'],
 ['package executed by observer',r=>r.packageJavaScriptExecuted=true,'BOUNDARY_INVALID'],
 ['unknown mutation flag',r=>delete r.mutationsPerformed,'BOUNDARY_INVALID']
])test('closed envelope rejects '+name,()=>{const r=copy(envelope());change(r);assert.throws(()=>qualifyIndependentPGCacheReadback(r,scope),new RegExp(code));});
test('actual generated read-only Python parses locally without executing it',()=>{const p=independentPGCacheRootProgram();const r=spawnSync('python',['-c','import ast,sys; ast.parse(sys.stdin.read()); print("AST_OK")'],{input:p,encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'AST_OK');assert.ok(p.includes('3d3a9fdf3168245f67b6abf8ddc9ab868fff275303e2e083f5a1b22fc64141d6'));assert.ok(p.includes("'producerStateSHA256'"));assert.ok(p.includes('class BoundedTime'));assert.ok(!p.includes('subprocess'));assert.ok(!p.includes('docker'));});
