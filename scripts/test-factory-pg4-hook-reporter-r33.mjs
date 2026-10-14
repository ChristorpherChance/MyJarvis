import test from 'node:test';
import assert from 'node:assert/strict';
import {pg4HookFrameR33} from './factory-pg4-hook-reporter-r33.mjs';

const titles = [
 'orders a later serialized rerun after an older-BEGIN transaction and rejects the old draft basis',
 'invalidates a finalized report when an older-BEGIN manual revision obtains the batch afterwards',
 'places a manual revision strictly after a future prior timestamp without JavaScript rounding',
 'allows only one real concurrent selftest start and orders it after a future prior selftest',
];
const input = () => [{type: 'suite', filepath: '/work/source/apps/server/src/modules/test/truth-gate.integration.test.ts',
 result: {state: 'pass', hooks: {beforeAll: 'pass', afterAll: 'pass'}}, tasks: [{type: 'suite',
  name: 'M07 truth-gate contract (dedicated PostgreSQL integration)', result: {state: 'pass'},
  tasks: [...Array.from({length: 11}, (_, i) => ({type: 'test', name: `controlled-nonselected-${i}`, result: {state: 'skip'}})),
   ...titles.map(name => ({type: 'test', name, result: {state: 'pass'}}))]}]}];

test('controlled actual-task shape yields four closed states without actual qualification', () => {
 const f = pg4HookFrameR33(input(), []);
 assert.deepEqual(f.hooks, {beforeAll: 'pass', afterAll: 'pass'});
 assert.deepEqual(f.selectedCounts, {expected: 4, pass: 4, fail: 0, skip: 0, run: 0, todo: 0, unknown: 0});
 assert.equal(f.unexpectedPassedCount, 0);
 assert.equal(f.actualPG4Qualified, false);
 assert.equal(f.independentPoolEndEventObserved, false);
 assert.equal(f.frameworkBundleQualificationRef, null);
 assert.equal(f.sourceConfigQualificationRef, null);
});

test('missing parent hooks never borrow child pass; failed, absent and duplicate scopes stay explicit', () => {
 const files = input(); delete files[0].result.hooks;
 files[0].tasks[0].result.hooks = {beforeAll: 'pass', afterAll: 'pass'};
 assert.deepEqual(pg4HookFrameR33(files, []).hooks, {beforeAll: null, afterAll: null});
 files[0].result.hooks = {beforeAll: 'pass', afterAll: 'fail'};
 assert.equal(pg4HookFrameR33(files, [{}]).hooks.afterAll, 'fail');
 assert.equal(pg4HookFrameR33(files, [{}]).unhandledErrorCount, 1);
 assert.throws(() => pg4HookFrameR33([], []), /FINISHED_FRAME_REQUIRED/);
 files[0].tasks[0].tasks.at(-1).name = titles[0];
 assert.throws(() => pg4HookFrameR33(files, []), /SELECTED_CASE_MISSING_OR_DUPLICATE/);
});
