import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {evaluatePG4OnlyReportR33 as evaluate, pg4OnlyR33Contract as C,
 pg4OnlyR33SelectedTitles as selected, pg4OnlyR33OtherTitles as other,
 pg4OnlyR33BusinessTables as tables} from './factory-pg4-only-report-oracle-r33.mjs';

const ref = name => ({path: `controlled-fixture/${name}.json`, sha256: 'a'.repeat(64)});
const clone = value => structuredClone(value);
function controlled() {
 const columns = Object.fromEntries(tables.map(name => [name, ['id']]));
 const snapshot = tag => ({evidenceRef: ref(tag), tables: Object.fromEntries(tables.map(name =>
  [name, {columns: ['id'], rows: tag === 'before' ? [['two'], ['one']] : [['one'], ['two']]}]))});
 return {
  isControlledFixture: true, syntheticUpstreamContext: true,
  source: {
   runtime: {contractRef: {...ref('runtime'), sha256: C.runtimeContractSHA256}, currentByteReadbackRef: ref('runtime-read'), baseSourceSHA256: C.baseSourceSHA256},
   overlay: {metadataRef: ref('overlay-meta'), mountRef: ref('overlay-mount'), path: C.testAbsolutePath, sha256: C.testSHA256, bytes: C.testBytes, readOnly: true},
   effective: {evidenceRef: ref('effective-source'), kind: 'explicit-readonly-authored-source-virtual-union', sha256: C.sourceSHA256,
    files: 625, bytes: C.sourceBytes, indexSHA256: C.sourceIndexSHA256, newFullR33Artifact: false},
  },
  closure: {fullProtectionRef: ref('global'), currentCleanupRef: ref('current'), globalCleanupQualified: true, currentCleanupQualified: true},
  execution: {evidenceRef: ref('execution'), candidateCodeMayHaveExecuted: true, codeExecuted: true, entryAttempted: true, exitCode: 0, timedOut: false},
  vitest: {evidenceRef: ref('original-vitest'), value: {
   numTotalTestSuites: 2, numPassedTestSuites: 2, numFailedTestSuites: 0, numPendingTestSuites: 0,
   numTotalTests: 15, numPassedTests: 4, numFailedTests: 0, numPendingTests: 11, numTodoTests: 0, success: true,
   testResults: [{name: C.testAbsolutePath, startTime: 1, endTime: 2, status: 'passed', message: '',
    assertionResults: [...other, ...selected].map(title => ({title, fullName: `M07 truth-gate contract (dedicated PostgreSQL integration) ${title}`,
     ancestorTitles: ['M07 truth-gate contract (dedicated PostgreSQL integration)'], status: selected.includes(title) ? 'passed' : 'skipped', failureMessages: []}))}],
  }},
  hooks: {kind: 'framework-hook-state-plus-source-await', supplementalReporterRef: ref('supplemental-source'), evidenceRef: ref('supplemental-result'),
   framework: {version: '2.1.9', bundleQualificationRef: ref('framework-qualified'), actualBundleRef: ref('framework-bundle'),
    sourceRefs: Object.fromEntries(['runnerRun', 'runnerTasks', 'runtimeDefaultRunner', 'jsonReporter'].map(k => [k, ref(k)])),
    customRunner: false, configSemantics: 'locked-default-equivalent'},
   testSHA256: C.testSHA256, beforeAllSourceSHA256: C.beforeAllSourceSHA256, afterAllSourceSHA256: C.afterAllSourceSHA256,
   poolEndEvidenceKind: 'derived-from-frozen-await-db-end-and-afterAll-pass', states: {beforeAll: 'pass', afterAll: 'pass'}},
  sql: {adapterRef: ref('sql-adapter'), projectionContractRef: ref('sql-projection'), columnsByTable: columns,
   migrations: {evidenceRef: ref('migrations'), files: Array.from({length: 30}, (_, i) => ({ordinal: i + 1,
    name: `${String(i + 1).padStart(4, '0')}_fixture.sql`, sha256: 'b'.repeat(64), sourceIndexSHA256: C.sourceIndexSHA256, status: 'applied'}))},
   identityRef: ref('db-identity'), database: C.database, productionDatabaseUsed: false, schemaEmptyBeforeMigrations: true,
   independentPGManifestSHA256: C.independentPGManifestSHA256, requiredTables: [...tables],
   requiredColumns: ['tst_runs.execution_source', 'tst_case_runs.execution_source', 'tst_case_runs.is_simulated'],
   before: snapshot('before'), after: snapshot('after')},
 };
}

test('missing evidence remains incomplete and unknown execution is not false', () => {
 const empty = evaluate();
 assert.equal(empty.typedFactsQualified, false);
 assert.equal(empty.counts.passed, null);
 assert.equal(empty.counts.executed, null);
 assert.equal(empty.execution.codeExecuted, null);
 const f = controlled(); f.execution.codeExecuted = null;
 assert.equal(evaluate(f).execution.codeExecuted, null);
 assert.equal(evaluate(f).typedFactsQualified, false);
});

test('controlled four-pass facts permit eleven filtered skips but grant no actual admission', () => {
 const result = evaluate(controlled());
 assert.equal(result.isControlledFixture, true);
 assert.equal(result.typedFactsQualified, true);
 assert.equal(result.pg4ReportFactsQualified, true);
 assert.deepEqual(result.counts, {expected: 4, passed: 4, failed: 0, incomplete: 0, executed: 4});
 assert.equal(result.nonselectedSkipped, 11);
 assert.equal(result.businessBaselineSHA256.before, result.businessBaselineSHA256.after);
 assert.equal(result.poolEndEvidenceKind, 'derived-from-frozen-await-db-end-and-afterAll-pass');
 assert.equal(result.independentPoolEndEventObserved, false);
 for (const k of ['ready', 'actualLinuxQualified', 'actualPG4Passed', 'limitedPG4Accepted', 'productAccepted',
  'newHTTP34Qualified', 'newNativeQualified', 'newR33FullBuildQualified', 'evidenceAuthenticityVerified', 'evidenceRawBytesPersistedByOracle']) assert.equal(result[k], false);
});

test('four selected skips, duplicates and framework failures cannot qualify callbacks', () => {
 const f = controlled();
 f.vitest.value.testResults[0].assertionResults.at(-1).status = 'skipped';
 f.vitest.value.numPassedTests = 3; f.vitest.value.numPendingTests = 12;
 assert.equal(evaluate(f).counts.incomplete, 1);
 assert.equal(evaluate(f).typedFactsQualified, false);
 const d = controlled(); d.vitest.value.testResults[0].assertionResults.at(-1).title = selected[0];
 assert.equal(evaluate(d).counts.passed, null);
 const e = controlled(); e.vitest.value.success = false; e.vitest.value.numFailedTestSuites = 1; e.vitest.value.numPassedTestSuites = 1;
 assert.equal(evaluate(e).status, 'failed');
 assert.equal(evaluate(e).counts.failed, 0);
});

test('actual supplemental hook states and exact source-await derivation are mandatory', () => {
 const f = controlled(); f.hooks = null;
 assert.equal(evaluate(f).typedFactsQualified, false);
 const h = controlled(); h.hooks.states.afterAll = 'fail';
 assert.equal(evaluate(h).status, 'failed');
 const s = controlled(); s.hooks.afterAllSourceSHA256 = 'f'.repeat(64);
 assert.equal(evaluate(s).hookWitnessQualified, false);
 const p = controlled(); p.hooks.poolEndEvidenceKind = 'independent-pool-end-event';
 assert.equal(evaluate(p).hookWitnessQualified, false);
 const r = controlled(); r.hooks.framework.customRunner = true;
 assert.equal(evaluate(r).hookWitnessQualified, false);
});

test('business row drift, missing current closure and overlay drift reject typed qualification', () => {
 const f = controlled(); f.sql.after.tables.tst_runs.rows.push(['new-row']);
 assert.equal(evaluate(f).status, 'failed');
 assert.ok(evaluate(f).reasons.includes('BUSINESS_ROW_BASELINE_CHANGED'));
 const g = controlled(); g.closure.globalCleanupQualified = false;
 assert.equal(evaluate(g).typedFactsQualified, false);
 assert.equal(evaluate(g).pg4ReportFactsQualified, true);
 const s = controlled(); s.source.overlay.sha256 = 'f'.repeat(64);
 assert.equal(evaluate(s).typedFactsQualified, false);
 const m = controlled(); m.sql.migrations.files.pop();
 assert.equal(evaluate(m).businessBaselineQualified, false);
 const unsafe = controlled(); unsafe.sql.before.tables.projects.rows = [[9007199254740992]];
 assert.equal(evaluate(unsafe).businessBaselineQualified, false);
});

test('original saved R6 beforeAll failure proves zero selected executed, not four business failures', async () => {
 const raw = await readFile('.jarvis-dev/maintenance/r32-r6-original-four-report-private-1791867975534-19982823-2381-4e63-8b2c-77475d93bc57.json');
 assert.equal(createHash('sha256').update(raw).digest('hex'), '9047728b721e4c920542d48c7c28f14bb3590af29b51a564f770aa45167f6c40');
 const transport = JSON.parse(raw), frame = JSON.parse(Buffer.from(transport.stdoutBase64, 'base64'));
 const bytes = Buffer.from(frame.base64, 'base64');
 assert.equal(createHash('sha256').update(bytes).digest('hex'), '18bb2ad847b0efc3626d30dcb79883ec1f65faa8df17180ff791f293b61cc3cc');
 const f = controlled(); f.vitest.value = JSON.parse(bytes); f.vitest.evidenceRef = {path: 'saved-R6-original-report', sha256: frame.sha256};
 f.hooks = null; f.execution.codeExecuted = null; f.closure.globalCleanupQualified = false;
 const r = evaluate(f);
 assert.deepEqual(r.counts, {expected: 4, passed: 0, failed: 0, incomplete: 4, executed: 0});
 assert.equal(r.frameworkFailed, true);
 assert.equal(r.hookWitnessQualified, false);
 assert.equal(r.typedFactsQualified, false);
 assert.equal(r.execution.codeExecuted, null);
});

test('binding delta: success cannot hide pending or an altered frozen suite denominator', () => {
 const f = controlled(); f.vitest.value.numPassedTestSuites = 0; f.vitest.value.numPendingTestSuites = 2;
 const r = evaluate(f);
 assert.equal(r.typedFactsQualified, false);
 assert.equal(r.pg4ReportFactsQualified, false);
 assert.equal(r.counts.passed, null);
 const g = controlled(); g.vitest.value.numTotalTestSuites = 1; g.vitest.value.numPassedTestSuites = 1;
 assert.equal(evaluate(g).pg4ReportFactsQualified, false);
});

test('binding delta: false after a possible start is retained as a report, not proof of nonexecution', () => {
 const f = controlled(); f.execution.codeExecuted = false;
 const r = evaluate(f);
 assert.equal(r.execution.codeExecuted, null);
 assert.equal(r.execution.reportedCodeExecuted, false);
 assert.equal(r.execution.contradictoryExecutionFacts, true);
 assert.equal(r.typedFactsQualified, false);
 const notStarted = controlled();
 notStarted.execution = {evidenceRef: ref('never-started'), candidateCodeMayHaveExecuted: false, entryAttempted: false, codeExecuted: false};
 assert.equal(evaluate(notStarted).execution.codeExecuted, false);
 const noProof = clone(notStarted); noProof.execution.evidenceRef = null;
 assert.equal(evaluate(noProof).execution.codeExecuted, null);
});
