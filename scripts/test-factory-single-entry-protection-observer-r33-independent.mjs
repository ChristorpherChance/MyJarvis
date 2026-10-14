import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha = v => createHash('sha256').update(v).digest('hex');
const authorPath = 'artifacts/software-factory/goals-r29/r33-single-entry-protection-adapter-local-preparation-1791898006156-b5869457-bf88-4483-9899-1150c2a1052d.json';
const authorRaw = await readFile(authorPath);
assert.equal(sha(authorRaw), '57d33c2ce366d6f60a9daeaf0d036d9582d6fc5f449ed4c1bb04ef74f762881e');
const refs = JSON.parse(authorRaw).sourceRefs;
const initial = await Promise.all(refs.map(r => readFile(r.path)));
for (let i = 0; i < refs.length; i++) {assert.equal(sha(initial[i]), refs[i].sha256); assert.equal(initial[i].length, refs[i].bytes)}
const {canonical} = await import('./run-factory-main-repair-r26.mjs');
const {createSingleEntryProtectionObserverR33Adapter: create} = await import('./factory-single-entry-protection-observer-r33.mjs');
const {targetCopyR29Scope: copy} = await import('./prepare-factory-target-copy-r29.mjs');
const {targetCleanupR29Scope: nativeScope, targetCleanupR29HostProgram: nativeOld} = await import('./verify-factory-target-cleanup-r29.mjs');
const {buildCleanupR29Scope: buildScope, buildCleanupR29HostProgram: buildOld} = await import('./verify-factory-truth-gate-build-cleanup-r29.mjs');
const {newProtectionR29HostParams: hp, newProtectionR29HostProgram: stock} = await import('./verify-factory-protection-contract-r29-r2.mjs');
const {boundProcessCensusR32NativeProgram: nativeBound, boundProcessCensusR32BuildProgram: buildBound} = await import('./factory-bound-process-census-r32.mjs');

test('independent cross-boundary receipt domain: parsed frame binds only actual middle source; raw wire is distinct', async () => {
  const preparation = JSON.parse(await readFile(nativeScope.installedManifestPath)).preparation;
  const q = JSON.parse(await readFile(nativeScope.journalPath));
  const params = [hp(preparation), {...copy, job:q.copyJob, taskId:q.taskId, runId:q.runId,
    originSHA256:nativeScope.originSHA256, parentIdentity:nativeScope.parentIdentity, workspaceIdentity:nativeScope.workspaceIdentity}, buildScope, hp(preparation)];
  const programs = [stock(preparation), nativeOld(), buildOld(), stock(preparation)];
  const expectedActual = ['3fbdb6b634ad037723083550608f43b3c6e94210df5f5f56349d8605e3621b5b',
    '2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73',
    '909f014941f1adbe3adf62a1dcd8d783c48f292c41f936c339cb293a2d0f7188',
    '3fbdb6b634ad037723083550608f43b3c6e94210df5f5f56349d8605e3621b5b'];
  // This is an in-memory fake wire. No transport or generated Python is run.
  const wire = ' { "z": {"listed":2,"unknown":1}, "a": [0,true,null] }\n';
  const response = JSON.parse(wire);
  let calls = 0;
  const adapter = create({preparation, sourceBundle:{boundNativeProgram:nativeBound(), boundBuildProgram:buildBound(),
    singleDirentSource:(await readFile('scripts/factory-single-dirent-r33.py')).toString('utf8')}}, async (p, actual) => {
      assert.equal(sha(actual), expectedActual[calls]); assert.equal(canonical(p), canonical(params[calls])); calls++; return response;
    });
  for (let i = 0; i < 4; i++) assert.equal(await adapter.readRoot(params[i], programs[i]), response);
  const receipts = adapter.receipts();
  assert.equal(calls, 4);
  for (let i = 0; i < 4; i++) {
    const receipt = receipts[i];
    assert.equal(receipt.originalProgramSHA256, sha(programs[i])); assert.equal(receipt.actualProgramSHA256, expectedActual[i]);
    assert.equal(receipt.responseHashDomain, 'canonical-parsed-frame'); assert.equal(receipt.responseSHA256, sha(canonical(response)));
    assert.notEqual(receipt.responseSHA256, sha(wire));
  }
  assert.equal(receipts[0].originalProgramSHA256, receipts[0].actualProgramSHA256);
  assert.notEqual(receipts[1].originalProgramSHA256, receipts[1].actualProgramSHA256);
  assert.notEqual(receipts[2].originalProgramSHA256, receipts[2].actualProgramSHA256);
  assert.equal(receipts[3].originalProgramSHA256, receipts[3].actualProgramSHA256);
  // A domain label is an explicit consumer assertion, not a claim that raw wire has been captured.
  assert.ok(receipts.every(r => r.kind === 'r33-single-entry-protection-source-receipt'
    && r.observerKind === 'software-factory-r33-single-entry-protection-observation'));
  const final = await Promise.all(refs.map(r => readFile(r.path)));
  for (let i = 0; i < refs.length; i++) assert.deepEqual(final[i], initial[i]);
});
