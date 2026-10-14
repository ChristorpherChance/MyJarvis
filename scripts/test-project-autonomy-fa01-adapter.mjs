import test from 'node:test';
import assert from 'node:assert/strict';
import { countsFromVitest, coverageFromIstanbul, validateBaseline, assertFreshReport } from './project-autonomy-fa01-collector.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdtemp, writeFile, lstat, utimes, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const exec = promisify(execFile);

test('actual Vitest missing and inconsistent counts cannot become a pass', () => {
  assert.throws(() => countsFromVitest({}), /TEST_COUNTS_INVALID/);
  assert.throws(() => countsFromVitest({ numTotalTests: 1, numPassedTests: 2, numFailedTests: 0, numPendingTests: 0 }), /TEST_COUNTS_INCONSISTENT/);
  assert.deepEqual(countsFromVitest({ numTotalTests: 4, numPassedTests: 1, numFailedTests: 1, numPendingTests: 1 }), { total: 4, passed: 1, failed: 1, skipped: 1, unknown: 1 });
});

test('coverage counts each real start line once and every branch separately', () => {
  const result = coverageFromIstanbul({ source: { s: { 1: 0, 2: 2, 3: 0 }, statementMap: { 1: { start: { line: 1 } }, 2: { start: { line: 1 } }, 3: { start: { line: 3 } } }, b: { 1: [0, 2] } } });
  assert.deepEqual(result, { lines: { total: 2, covered: 1 }, branches: { total: 2, covered: 1 } });
  assert.throws(() => coverageFromIstanbul({ source: { s: { 1: 1 } } }), /COVERAGE_DATA_INVALID/);
});

test('the trusted floor refuses removal of 45 files, 30 suites and 90/80 coverage', async () => {
  const baseline = JSON.parse(await readFile('scripts/project-autonomy-baseline-r22.json', 'utf8'));
  assert.equal(validateBaseline(baseline), baseline);
  assert.throws(() => validateBaseline({ ...baseline, requiredTestFiles: baseline.requiredTestFiles.slice(1) }), /TEST_BASELINE/);
  assert.throws(() => validateBaseline({ ...baseline, requiredPrototypeSuites: baseline.requiredPrototypeSuites.slice(1) }), /TEST_BASELINE/);
  assert.throws(() => validateBaseline({ ...baseline, minimumCoverage: { lines: 89, branches: 80 } }), /COVERAGE_BASELINE/);
});

test('exit zero cannot make an actual old unmodified report fresh', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-fa01-fresh-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'report.json'); await writeFile(path, JSON.stringify({ numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0 }));
  await utimes(path, new Date(1), new Date(1));
  const started = new Date().toISOString(); await exec(process.execPath, ['-e', 'process.exit(0)']);
  const old = await lstat(path);
  assert.throws(() => assertFreshReport(old, started), /TEST_REPORT_NOT_FRESH/);
  await writeFile(path, '{}');
  assert.equal(assertFreshReport(await lstat(path), started), undefined);
});

test('new adapter programs parse and the coordinator fixtures do not invoke Docker', async () => {
  await exec(process.execPath, ['--check', 'scripts/project-autonomy-fa01-collector.mjs']);
  await exec(process.execPath, ['--check', 'scripts/project-autonomy-fa01-browser.mjs']);
  await exec('python', ['-B', 'scripts/test-project-autonomy-fa01-adapter.py']);
});

test('fixed isolation contains no published ports or caller supplied shell; cancellation has scoped cleanup', async () => {
  const text = await readFile('scripts/project-autonomy-fa01-coordinator.py', 'utf8');
  assert.equal(text.includes("'--publish'"), false);
  assert.equal(text.includes('shell=True'), false);
  assert.ok(text.includes("'--internal'"));
  assert.ok(text.includes('process_identity'));
  assert.ok(text.includes("cleanup(state, log)"));
  assert.ok(text.includes("'businessResourcesTouched': False"));
});
