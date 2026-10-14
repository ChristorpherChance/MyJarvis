import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonical} from './run-factory-main-repair-r26.mjs';
import {targetCopyR29Scope} from './prepare-factory-target-copy-r29.mjs';
import {targetCleanupR29Scope, targetCleanupR29HostProgram} from './verify-factory-target-cleanup-r29.mjs';
import {buildCleanupR29Scope, buildCleanupR29HostProgram} from './verify-factory-truth-gate-build-cleanup-r29.mjs';
import {newProtectionR29HostParams, newProtectionR29HostProgram} from './verify-factory-protection-contract-r29-r2.mjs';
import {boundProcessCensusR32NativeProgram, boundProcessCensusR32BuildProgram} from './factory-bound-process-census-r32.mjs';
import {createSingleEntryProtectionObserverR33Adapter, singleEntryProtectionObserverR33Preparation as S} from './factory-single-entry-protection-observer-r33.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
test('single-entry route group: exact sources and scoped receipts; refusals permanently close the controlled adapter', async () => {
  // All program builders below return strings. No generated Python, actors, API or transport is executed.
  const manifestRaw = await readFile(targetCleanupR29Scope.installedManifestPath);
  assert.equal(sha(manifestRaw), targetCleanupR29Scope.installedManifestSHA256);
  const preparation = JSON.parse(manifestRaw).preparation;
  const q = JSON.parse(await readFile(targetCleanupR29Scope.journalPath));
  const sourceBundle = {boundNativeProgram: boundProcessCensusR32NativeProgram(), boundBuildProgram: boundProcessCensusR32BuildProgram(),
    singleDirentSource: (await readFile('scripts/factory-single-dirent-r33.py')).toString('utf8')};
  const inventory = newProtectionR29HostProgram(preparation), native = targetCleanupR29HostProgram(), build = buildCleanupR29HostProgram();
  const hp = newProtectionR29HostParams(preparation);
  const params = [hp, {...targetCopyR29Scope, job: q.copyJob, taskId: q.taskId, runId: q.runId,
    originSHA256: targetCleanupR29Scope.originSHA256, parentIdentity: targetCleanupR29Scope.parentIdentity,
    workspaceIdentity: targetCleanupR29Scope.workspaceIdentity}, buildCleanupR29Scope, hp];
  const programs = [inventory, native, build, inventory];
  const newNative = await readFile('artifacts/software-factory/goals-r29/r33-single-entry-bound-census-native-source-' + S.sourceMethod.nativeSHA256 + '.py', 'utf8');
  const newBuild = await readFile('artifacts/software-factory/goals-r29/r33-single-entry-bound-census-build-source-' + S.sourceMethod.buildSHA256 + '.py', 'utf8');
  const actual = [inventory, newNative, newBuild, inventory];
  const make = callback => createSingleEntryProtectionObserverR33Adapter({preparation, sourceBundle}, callback);
  assert.equal(S.activation, null); assert.equal(S.actualMethodQualification, null); assert.equal(S.operationalQualified, false);
  assert.throws(() => createSingleEntryProtectionObserverR33Adapter(), /INPUT_REQUIRED/);
  let prematureCalls = 0;
  for (const bundle of [null, {...sourceBundle, extra: true}, {...sourceBundle, singleDirentSource: sourceBundle.singleDirentSource + '\n'}]) {
    assert.throws(() => createSingleEntryProtectionObserverR33Adapter({preparation, sourceBundle: bundle}, () => {prematureCalls++}), /SOURCE_BUNDLE_/);
  }
  assert.equal(prematureCalls, 0);
  const seen = [], responses = [];
  const adapter = make(async (p, program) => {assert.equal(program, actual[seen.length]); seen.push(program); const r = {controlled: true, call: seen.length}; responses.push(r); return r});
  assert.throws(() => adapter.receipts(), /OBSERVATION_INCOMPLETE/);
  for (let i = 0; i < 4; i++) assert.equal(await adapter.readRoot(params[i], programs[i]), responses[i]);
  const receipts = adapter.receipts();
  assert.equal(receipts.length, 4); assert.deepEqual(receipts.map(r => r.stage), ['inventory-before', 'native-source', 'old-build', 'inventory-after']);
  for (let i = 0; i < 4; i++) {
    assert.equal(receipts[i].originalProgramSHA256, sha(programs[i])); assert.equal(receipts[i].actualProgramSHA256, sha(actual[i]));
    assert.equal(receipts[i].parametersSHA256, sha(canonical(params[i]))); assert.equal(receipts[i].responseSHA256, sha(canonical(responses[i])));
    assert.equal(receipts[i].responseHashDomain, 'canonical-parsed-frame'); assert.deepEqual(receipts[i].sourceMethod, S.sourceMethod);
  }
  receipts[0].sourceMethod.moduleSHA256 = 'changed'; assert.equal(adapter.receipts()[0].sourceMethod.moduleSHA256, S.sourceMethod.moduleSHA256);
  await assert.rejects(adapter.readRoot(params[0], programs[0]), /CALL_SEQUENCE_INVALID/);
  assert.throws(() => adapter.receipts(), /OBSERVATION_INCOMPLETE/); assert.equal(seen.length, 4);
  for (const [p, program, error] of [[params[1], programs[1], /PROGRAM_SOURCE_CHANGED/], [{...params[0], extra: true}, programs[0], /PARAMETERS_SCOPE_CHANGED/]]) {
    let calls = 0; const closed = make(() => {calls++; return {controlled: true}});
    await assert.rejects(closed.readRoot(p, program), error);
    await assert.rejects(closed.readRoot(params[0], programs[0]), /CALL_SEQUENCE_INVALID/); assert.equal(calls, 0);
  }
  let release, overlapCalls = 0;
  const overlap = make(() => {overlapCalls++; return new Promise(resolve => {release = resolve})});
  const first = overlap.readRoot(params[0], programs[0]), second = overlap.readRoot(params[0], programs[0]);
  const both = Promise.allSettled([first, second]); release({controlled: true});
  assert.deepEqual((await both).map(r => r.status), ['rejected', 'rejected']); assert.equal(overlapCalls, 1);
  assert.throws(() => overlap.receipts(), /OBSERVATION_INCOMPLETE/);
  const failed = make(async () => {throw Error('CONTROLLED_TRANSPORT_FAILURE')});
  await assert.rejects(failed.readRoot(params[0], programs[0]), /CONTROLLED_TRANSPORT_FAILURE/);
  await assert.rejects(failed.readRoot(params[0], programs[0]), /CALL_SEQUENCE_INVALID/);
  const mutated = structuredClone(params[0]), drift = make(async p => {p.extra = true; return {controlled: true}});
  await assert.rejects(drift.readRoot(mutated, programs[0]), /PARAMETERS_CHANGED/);
  assert.throws(() => drift.receipts(), /OBSERVATION_INCOMPLETE/);
});
