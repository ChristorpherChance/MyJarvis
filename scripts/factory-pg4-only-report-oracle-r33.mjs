/** Pure supplied-facts oracle. It performs no byte reads, persistence or admission. */
import {createHash} from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
 && [Object.prototype, null].includes(Object.getPrototypeOf(value))
 && Object.values(Object.getOwnPropertyDescriptors(value)).every(d => Object.hasOwn(d, 'value'));
const ref = value => plain(value) && Object.keys(value).length === 2
 && typeof value.path === 'string' && value.path.length > 0 && value.path.length <= 1024
 && !value.path.includes('\0') && sha(value.sha256);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const suiteTitle = 'M07 truth-gate contract (dedicated PostgreSQL integration)';

export const pg4OnlyR33SelectedTitles = Object.freeze([
 'orders a later serialized rerun after an older-BEGIN transaction and rejects the old draft basis',
 'invalidates a finalized report when an older-BEGIN manual revision obtains the batch afterwards',
 'places a manual revision strictly after a future prior timestamp without JavaScript rounding',
 'allows only one real concurrent selftest start and orders it after a future prior selftest',
]);
export const pg4OnlyR33OtherTitles = Object.freeze([
 'manual approval, simulated execute, real manual evidence, finalize and normal authorize',
 'allows a fully real manual-only run to finalize and authorize normally',
 'rejects simulated evidence, null source, empty evidence, empty cases and missing required result rows',
 'records fail/blocked truth as finalizable but prevents conditional waiver of failed results',
 'allows optional not-run/not-applicable without counting either as pass',
 'rejects changed frozen basis, must_run, case content and run/defect basis for normal and conditional release',
 'does not allow conditional release when complete real failure evidence is finalizable but unwaived',
 'rejects runtime route-ID overrides before any business or audit changes',
 'rejects old finalized report after later same-build upstream fail without release writes',
 'rejects old finalized report after later same-build upstream pass without release writes',
 'rejects old finalized report after later same-build upstream running without release writes',
]);
export const pg4OnlyR33BusinessTables = Object.freeze([
 'audit_log', 'dev_builds', 'dev_reports', 'dev_selftests', 'dsg_baselines', 'evd_events',
 'evd_records', 'policy_gates', 'projects', 'sys_notifications', 'tst_batches', 'tst_case_runs',
 'tst_cases', 'tst_decisions', 'tst_defects', 'tst_plans', 'tst_reports', 'tst_runs',
]);
const columnsRequired = Object.freeze([
 'tst_runs.execution_source', 'tst_case_runs.execution_source', 'tst_case_runs.is_simulated',
]);
export const pg4OnlyR33Contract = Object.freeze({
 kind: 'r33-pg4-only-supplied-facts-contract', schemaVersion: 1,
 baseSourceSHA256: 'f4a86cfb949863b6f5cb0dd80dde83f8b97ea4a66e1e047fbd77fc90f92d53e2',
 runtimeContractSHA256: '27f8687bf5678a519684d4b86f21ed6147e923591ec4ba75cc5a28ec82cb7e71',
 sourceSHA256: 'b3d6fa645cf90044fb70f8a29de5aee33bd1ee9ad33b4d770e374caa6fd696ed',
 sourceIndexSHA256: 'b79e5d154fd21abfa422428a622ef2ba8cd3b6953bdc071079fd65c117da136e',
 sourceFiles: 625, sourceBytes: 18413597,
 testRelativePath: 'apps/server/src/modules/test/truth-gate.integration.test.ts',
 testAbsolutePath: '/work/source/apps/server/src/modules/test/truth-gate.integration.test.ts',
 testSHA256: 'c5645f7567232c7fc797f46f06bc8adc1f2517c18be305daaad01ac9248c3e1a',
 testBytes: 47163, database: 'jarvis_truth_pg4_r33',
 beforeAllSourceSHA256: '62ba2fc4ffbb6c648551ce5b50c8ad4b8908b5801f3cfcf9d01cc83f627a5a9f',
 afterAllSourceSHA256: '7d1991bd08b5f8ea17c006ed48d11ecb822f82afc93570a4a4b41dbacbcbac1f',
 frameworkVersion: '2.1.9', frameworkBundleQualificationRef: null,
 independentPGManifestSHA256: 'd916c96e199ab7230a6397cd1f4f6fdbceacf30588a16b6943dc8da2996b6eb1',
 migrationCount: 30, selectedCount: 4, originalCaseCount: 15,
 hookAdapterQualificationRef: null, sqlProjectionContractRef: null,
 defaultPhysicalQualificationRefs: null, actualScopeQualified: false,
});

function reportFacts(input) {
 const missing = {status: 'incomplete', parsed: false, counts: {expected: 4, passed: null,
  failed: null, incomplete: null, executed: null}, cases: [], frameworkFailed: null};
 if (!plain(input) || !ref(input.evidenceRef) || !plain(input.value)) return missing;
 const r = input.value;
 const numeric = ['numTotalTestSuites', 'numPassedTestSuites', 'numFailedTestSuites',
  'numPendingTestSuites', 'numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests'];
 if (!numeric.every(k => integer(r[k])) || typeof r.success !== 'boolean'
  || !Array.isArray(r.testResults) || r.testResults.length !== 1) return missing;
 const s = r.testResults[0];
 if (!plain(s) || s.name !== pg4OnlyR33Contract.testAbsolutePath || !['passed', 'failed'].includes(s.status)
  || typeof s.message !== 'string' || !integer(s.startTime) || !integer(s.endTime) || s.endTime < s.startTime
  || !Array.isArray(s.assertionResults) || s.assertionResults.length !== 15) return missing;
 const rows = new Map(), allowed = new Set([...pg4OnlyR33OtherTitles, ...pg4OnlyR33SelectedTitles]);
 for (const a of s.assertionResults) {
  if (!plain(a) || !allowed.has(a.title) || rows.has(a.title)
   || a.fullName !== `${suiteTitle} ${a.title}` || !same(a.ancestorTitles, [suiteTitle])
   || !['passed', 'failed', 'skipped', 'pending', 'todo'].includes(a.status)
   || !Array.isArray(a.failureMessages) || (a.status === 'passed' && a.failureMessages.length)) return missing;
  rows.set(a.title, a);
 }
 if (r.numTotalTests !== 15 || r.numTotalTests !== r.numPassedTests + r.numFailedTests + r.numPendingTests + r.numTodoTests
  || r.numTotalTestSuites !== 2
  || r.numTotalTestSuites !== r.numPassedTestSuites + r.numFailedTestSuites + r.numPendingTestSuites
  || (r.success && (r.numPassedTestSuites !== r.numTotalTestSuites
   || r.numFailedTestSuites !== 0 || r.numPendingTestSuites !== 0))
  || (Object.hasOwn(r, 'numRuntimeErrorTestSuites') && !integer(r.numRuntimeErrorTestSuites))) return missing;
 const actual = {passed: 0, failed: 0, pending: 0, todo: 0};
 for (const a of rows.values()) actual[a.status === 'skipped' ? 'pending' : a.status]++;
 if (actual.passed !== r.numPassedTests || actual.failed !== r.numFailedTests
  || actual.pending !== r.numPendingTests || actual.todo !== r.numTodoTests) return missing;
 const cases = pg4OnlyR33SelectedTitles.map(title => ({title, status: rows.get(title).status}));
 const passed = cases.filter(a => a.status === 'passed').length;
 const failed = cases.filter(a => a.status === 'failed').length;
 const incomplete = 4 - passed - failed;
 const unexpectedExecuted = pg4OnlyR33OtherTitles.some(title => rows.get(title).status !== 'skipped');
 const frameworkFailed = !r.success || r.numFailedTestSuites > 0 || s.status !== 'passed'
  || s.message.length > 0 || (r.numRuntimeErrorTestSuites ?? 0) > 0;
 const status = failed || frameworkFailed || unexpectedExecuted ? 'failed' : incomplete ? 'incomplete' : 'passed';
 return {status, parsed: true, counts: {expected: 4, passed, failed, incomplete, executed: passed + failed},
  cases, frameworkFailed, unexpectedExecuted, frameworkTotal: 15,
  nonselectedSkipped: pg4OnlyR33OtherTitles.filter(title => rows.get(title).status === 'skipped').length};
}

function sourceFacts(s) {
 if (!plain(s) || !plain(s.runtime) || !plain(s.overlay) || !plain(s.effective)) return false;
 const c = pg4OnlyR33Contract;
 return ref(s.runtime.contractRef) && s.runtime.contractRef.sha256 === c.runtimeContractSHA256
  && ref(s.runtime.currentByteReadbackRef) && s.runtime.baseSourceSHA256 === c.baseSourceSHA256
  && ref(s.overlay.metadataRef) && ref(s.overlay.mountRef) && s.overlay.readOnly === true
  && s.overlay.path === c.testAbsolutePath && s.overlay.sha256 === c.testSHA256 && s.overlay.bytes === c.testBytes
  && ref(s.effective.evidenceRef) && s.effective.kind === 'explicit-readonly-authored-source-virtual-union'
  && s.effective.sha256 === c.sourceSHA256 && s.effective.files === c.sourceFiles && s.effective.bytes === c.sourceBytes
  && s.effective.indexSHA256 === c.sourceIndexSHA256 && s.effective.newFullR33Artifact === false;
}

function hookFacts(h) {
 if (!plain(h) || h.kind !== 'framework-hook-state-plus-source-await' || !ref(h.supplementalReporterRef)
  || !ref(h.evidenceRef) || !plain(h.framework) || h.framework.version !== '2.1.9'
  || !ref(h.framework.bundleQualificationRef) || !ref(h.framework.actualBundleRef)
  || !plain(h.framework.sourceRefs) || !['runnerRun', 'runnerTasks', 'runtimeDefaultRunner', 'jsonReporter']
   .every(k => ref(h.framework.sourceRefs[k])) || h.framework.customRunner !== false
  || h.framework.configSemantics !== 'locked-default-equivalent'
  || h.testSHA256 !== pg4OnlyR33Contract.testSHA256
  || h.beforeAllSourceSHA256 !== pg4OnlyR33Contract.beforeAllSourceSHA256
  || h.afterAllSourceSHA256 !== pg4OnlyR33Contract.afterAllSourceSHA256
  || h.poolEndEvidenceKind !== 'derived-from-frozen-await-db-end-and-afterAll-pass'
  || !plain(h.states) || !['beforeAll', 'afterAll'].every(k => ['pass', 'fail', 'unknown', 'not-run'].includes(h.states[k])))
  return {qualified: false, failed: false};
 return {qualified: h.states.beforeAll === 'pass' && h.states.afterAll === 'pass',
  failed: h.states.beforeAll === 'fail' || h.states.afterAll === 'fail'};
}

// SQL adapter must supply exact pinned column projections and text for large integers,
// timestamps and numerics. No row or SQL value is exported by this module.
function businessSnapshot(value, projection) {
 if (!plain(value) || !ref(value.evidenceRef) || !plain(value.tables)) return null;
 const names = Object.keys(value.tables).sort();
 if (!same(names, [...pg4OnlyR33BusinessTables].sort())) return null;
 const canonical = [];
 for (const name of names) {
  const t = value.tables[name], columns = projection[name];
  if (!plain(t) || !Array.isArray(columns) || !columns.length || columns.length > 128
   || !columns.every(c => typeof c === 'string' && /^[a-z_][a-z0-9_]{0,62}$/.test(c))
   || new Set(columns).size !== columns.length || !same(columns, [...columns].sort())
   || !same(t.columns, columns) || !Array.isArray(t.rows) || t.rows.length > 20000) return null;
  const rows = [];
  for (const row of t.rows) {
   if (!Array.isArray(row) || row.length !== columns.length || !row.every(v => v === null
    || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 65536) || Number.isSafeInteger(v))) return null;
   rows.push(JSON.stringify(row));
  }
  rows.sort(); canonical.push([name, columns, rows]);
 }
 return hash(JSON.stringify(canonical));
}

function sqlFacts(s) {
 const no = {qualified: false, changed: false, beforeSHA256: null, afterSHA256: null};
 if (!plain(s) || !ref(s.adapterRef) || !ref(s.projectionContractRef) || !plain(s.columnsByTable)
  || !plain(s.migrations) || !ref(s.migrations.evidenceRef) || !ref(s.identityRef)
  || s.database !== pg4OnlyR33Contract.database || s.productionDatabaseUsed !== false
  || s.schemaEmptyBeforeMigrations !== true || s.independentPGManifestSHA256 !== pg4OnlyR33Contract.independentPGManifestSHA256
  || !same([...Object.keys(s.columnsByTable)].sort(), [...pg4OnlyR33BusinessTables].sort())
  || !Array.isArray(s.migrations.files) || s.migrations.files.length !== 30
  || !same(s.requiredTables, pg4OnlyR33BusinessTables) || !same(s.requiredColumns, columnsRequired)) return no;
 const seen = new Set();
 for (let i = 0; i < 30; i++) {
  const m = s.migrations.files[i];
  if (!plain(m) || m.ordinal !== i + 1 || !sha(m.sha256) || m.sourceIndexSHA256 !== pg4OnlyR33Contract.sourceIndexSHA256
   || m.status !== 'applied' || typeof m.name !== 'string' || !new RegExp(`^${String(i + 1).padStart(4, '0')}[-_][a-zA-Z0-9_.-]+\\.sql$`).test(m.name)
   || seen.has(m.name)) return no;
  seen.add(m.name);
 }
 const beforeSHA256 = businessSnapshot(s.before, s.columnsByTable);
 const afterSHA256 = businessSnapshot(s.after, s.columnsByTable);
 if (!beforeSHA256 || !afterSHA256) return no;
 return {qualified: beforeSHA256 === afterSHA256, changed: beforeSHA256 !== afterSHA256, beforeSHA256, afterSHA256};
}

/** Typed conditions only. An independent IO consumer must verify raw bytes and refs. */
export function evaluatePG4OnlyReportR33(facts = null) {
 const f = plain(facts) ? facts : null;
 const report = reportFacts(f?.vitest), hooks = hookFacts(f?.hooks), sql = sqlFacts(f?.sql);
 const reasons = [];
 const controlled = typeof f?.isControlledFixture === 'boolean' ? f.isControlledFixture : null;
 if (controlled === null) reasons.push('EXPLICIT_FACT_ORIGIN_REQUIRED');
 if (!sourceFacts(f?.source)) reasons.push('SOURCE_RUNTIME_OVERLAY_WITNESS_INCOMPLETE');
 const gates = f?.closure;
 if (!plain(gates) || !ref(gates.fullProtectionRef) || !ref(gates.currentCleanupRef)
  || gates.globalCleanupQualified !== true || gates.currentCleanupQualified !== true) reasons.push('CURRENT_GLOBAL_AND_SCOPE_CLOSURE_UNQUALIFIED');
 const execution = plain(f?.execution) ? f.execution : null;
 const may = typeof execution?.candidateCodeMayHaveExecuted === 'boolean' ? execution.candidateCodeMayHaveExecuted : null;
 const reportedCode = [true, false, null].includes(execution?.codeExecuted) ? execution.codeExecuted : null;
 const contradictoryExecutionFacts = reportedCode === false
  && (!ref(execution?.evidenceRef) || may !== false || execution?.entryAttempted !== false);
 const code = contradictoryExecutionFacts ? null : reportedCode;
 const executionQualified = execution && ref(execution.evidenceRef) && may === true && code === true
  && execution.entryAttempted === true && execution.exitCode === 0 && execution.timedOut === false;
 if (!executionQualified) reasons.push('EXECUTION_UNPROVEN_OR_INCOMPLETE');
 if (!report.parsed) reasons.push('ORIGINAL_REPORT_MISSING_OR_INVALID');
 else if (report.status !== 'passed') reasons.push(report.status === 'failed' ? 'FRAMEWORK_OR_CASE_FAILED' : 'SELECTED_CASES_INCOMPLETE');
 if (!hooks.qualified) reasons.push(hooks.failed ? 'ORIGINAL_HOOK_FAILED' : 'INDEPENDENT_HOOK_WITNESS_INCOMPLETE');
 if (!sql.qualified) reasons.push(sql.changed ? 'BUSINESS_ROW_BASELINE_CHANGED' : 'INDEPENDENT_SQL_WITNESS_INCOMPLETE');
 if (f?.syntheticUpstreamContext !== true) reasons.push('SYNTHETIC_UPSTREAM_CONTEXT_NOT_DECLARED');
 const typedFactsQualified = reasons.length === 0;
 return {
  schemaVersion: 1, kind: 'r33-pg4-only-report-oracle-evaluation', ready: false,
  isControlledFixture: controlled, typedFactsQualified,
  pg4ReportFactsQualified: report.parsed && report.status === 'passed',
  status: typedFactsQualified ? 'passed' : report.status === 'failed' || hooks.failed || sql.changed ? 'failed' : 'incomplete',
  selected: report.cases, counts: report.counts, frameworkFailed: report.frameworkFailed,
  nonselectedSkipped: report.nonselectedSkipped ?? null,
  hookWitnessQualified: hooks.qualified, businessBaselineQualified: sql.qualified,
  poolEndEvidenceKind: hooks.qualified ? 'derived-from-frozen-await-db-end-and-afterAll-pass' : null,
  independentPoolEndEventObserved: false,
  businessBaselineSHA256: {before: sql.beforeSHA256, after: sql.afterSHA256},
  execution: {candidateCodeMayHaveExecuted: may, codeExecuted: code,
   reportedCodeExecuted: reportedCode, contradictoryExecutionFacts}, reasons,
  evidenceAuthenticityVerified: false, evidenceRawBytesPersistedByOracle: false,
  independentIOConsumerRequired: true, hookAdapterAndColumnContractMustBeIndependentlyPinned: true,
  actualLinuxQualified: false, actualPG4Passed: false, limitedPG4Accepted: false,
  newNativeQualified: false, newHTTP34Qualified: false, newR33FullBuildQualified: false,
  newR33PackagedArtifactQualified: false, cleanupIndependentlyVerified: false,
  fullProtectionQualified: false, modelsInvoked: false, productAccepted: false,
  full74ObjectivesAccepted: false, customerDelivery: false,
 };
}
