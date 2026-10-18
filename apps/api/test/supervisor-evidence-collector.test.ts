import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,symlink,writeFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {collectSupervisorEvidence} from '../src/runtime/supervisor-evidence-collector.js';
import {resolveSupervisorEvidence} from '../src/runtime/supervisor-evidence.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
async function fixture(fn:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'jarvis-supervisor-evidence-'));try{await fn(root)}finally{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));await rm(root,{recursive:true,force:true})}}

test('collects a bounded referenced fixture and returns evidence accepted by the existing signed-result resolver',()=>fixture(async root=>{
 await mkdir(join(root,'src'));const text='export const fixtureEvidence = true;\n';await writeFile(join(root,'src','evidence.ts'),text);
 const receipts=await collectSupervisorEvidence(root,[{path:'src/evidence.ts',sha256:hash(text)}]);assert.equal(receipts.length,1);assert.equal(receipts[0]!.contentBase64,Buffer.from(text).toString('base64'));
 const resolved=resolveSupervisorEvidence(receipts,[{path:'src/evidence.ts',sha256:hash(text)}]);assert.equal(resolved.items.length,1);assert.equal(resolved.items[0]!.content.toString(),text);assert.deepEqual(resolved.missing,[]);
}));

test('rejects symlink traversal, hidden/private paths, content secrets, mismatches, and oversized fixtures before returning bytes',()=>fixture(async root=>{
 await mkdir(join(root,'public'));await writeFile(join(root,'public','ok.txt'),'safe');const outside=join(root,'outside.txt');await writeFile(outside,'outside fixture');await symlink(outside,join(root,'public','linked.txt'));
 await assert.rejects(collectSupervisorEvidence(root,[{path:'public/linked.txt',sha256:hash('outside fixture')}]),/LINK_NOT_ALLOWED/);
 await assert.rejects(collectSupervisorEvidence(root,[{path:'.ssh/key',sha256:hash('x')}]),/PRIVATE_OR_INVALID/);
 await writeFile(join(root,'public','secret.txt'),'api_key=fixture-secret');await assert.rejects(collectSupervisorEvidence(root,[{path:'public/secret.txt',sha256:hash('api_key=fixture-secret')}]),/PRIVATE_CONTENT/);
 await assert.rejects(collectSupervisorEvidence(root,[{path:'public/ok.txt',sha256:hash('incorrect')}]),/HASH_MISMATCH/);
 await writeFile(join(root,'public','large.txt'),Buffer.alloc(32*1024+1,0x61));await assert.rejects(collectSupervisorEvidence(root,[{path:'public/large.txt',sha256:hash('large')}]),/SIZE_INVALID/);
}));
