import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const OLD='artifacts/software-factory/goals-r29/r33-pg4-pg-manifest-leaf-metadata-entry-source-e933f25b2c0941e9711fe6ec8de4f4770d3059170f9b155868a6fee150db37dc.mjs';
const NEW='.jarvis-dev/maintenance/read-r33-pg4-pg-manifest-leaf-metadata-once.mjs';
const CONTRACT='artifacts/software-factory/goals-r29/r33-pg4-pg-manifest-leaf-metadata-source-contract-61e8b1a0-e437-40d2-aeb0-3cb8a40f987b.json';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
function actualFragments(source){
 const required=pattern=>{const m=source.match(pattern);assert.ok(m);return m[0]};
 const helpers=[required(/^const canonical=.*$/m),required(/^const same=.*$/m),required(/^const allowed=.*$/m),required(/^const ref=.*$/m)].join('\n');
 const need=source.match(/need=(\(v,c\)=>\{if\(!v\)throw Error\(c\)\})/);assert.ok(need);
 const acquireGuard=required(/need\(r&&ref\(\{path:r\.path,sha256:r\.sha256\}\).*?'PG_LEAF_ENTRY_SOURCE_REF_CHANGED'\);/);
 const loop=required(/^ for\(const r of \[.*\]\)await acquire\(r\);$/m);
 const body="const H=/^[a-f0-9]{64}$/;const need="+need[1]+";\n"+helpers+"\nconst seen=[];const acquire=async r=>{"+acquireGuard+"seen.push(r)};\n"+loop+"\nreturn seen;";
 assert.doesNotMatch(body,/\b(?:import|readLocal|open|spawnSync|readPG4PGManifestLeafMetadataR33)\b/);
 return {helpers,need:need[1],acquireGuard,loop,run:new AsyncFunction('c','docs','review',body)};
}
test('scopeRef correction: actual strict13 contract and actual acquisition fragments reject old undefined and accept corrected refs',async()=>{
 const [oldRaw,newRaw,contractRaw]=await Promise.all([readFile(OLD),readFile(NEW),readFile(CONTRACT)]);
 assert.equal(sha(oldRaw),'e933f25b2c0941e9711fe6ec8de4f4770d3059170f9b155868a6fee150db37dc');
 assert.equal(sha(newRaw),'82a7f756d3d423a0ad00f427ac2b0f585d3f18e992913e15da3dc67560c32e7e');
 assert.equal(sha(contractRaw),'50ccd96152df8e8187e4d929cd22a6d0d52f49e7937582b6d9346ad386e7c340');
 const c=JSON.parse(contractRaw),expected=['schemaVersion','kind','id','revision','caller','program','scope','selection','actualFailure','designReview','sourceReview','sourceRefs','remoteReadAuthorized'];
 assert.deepEqual(Object.keys(c).sort(),expected.sort());assert.equal(Object.hasOwn(c,'scopeRef'),false);
 const sourceReviewRaw=await readFile(c.sourceReview.path);assert.equal(sha(sourceReviewRaw),c.sourceReview.sha256);
 const sourceReview=JSON.parse(sourceReviewRaw),docs={sourceReview},controlledEntryReview={sourceRefs:[]};
 assert.ok(c.sourceRefs.some(r=>r.path==='artifacts/software-factory/goals-r29/r33-pg4-pg-leaf-metadata-fixed-scope-1791933412315-f96e174a-5d37-4f4c-8efa-28ad4b5ea567.json'));
 const before=actualFragments(oldRaw.toString()),after=actualFragments(newRaw.toString());
 assert.equal(after.helpers,before.helpers);assert.equal(after.need,before.need);assert.equal(after.acquireGuard,before.acquireGuard);
 assert.equal(after.loop.replace(',c.selection]',',c.scopeRef,c.selection]'),before.loop);
 assert.equal(newRaw.toString().replace(after.loop,before.loop),oldRaw.toString());
 await assert.rejects(before.run(c,docs,controlledEntryReview),{message:'PG_LEAF_ENTRY_SOURCE_REF_CHANGED'});
 const seen=await after.run(c,docs,controlledEntryReview),expectedRefs=[...c.sourceRefs,...sourceReview.sourceRefs,c.selection];
 assert.deepEqual(seen,expectedRefs);assert.ok(seen.every(r=>r&&typeof r.path==='string'&&/^[a-f0-9]{64}$/.test(r.sha256)));
 console.log(JSON.stringify({isControlledFixture:true,actualContractKeys:13,actualContractSHA256:sha(contractRaw),actualSourceReviewSHA256:sha(sourceReviewRaw),acquisitionOperands:seen.length,oldUndefinedOperandRejected:true,newScopeArchiveRetained:true,fragmentOnlyExecuted:true,qualificationCalls:0,readerCalls:0,RootCalls:0,journalsCreated:0}));
});
