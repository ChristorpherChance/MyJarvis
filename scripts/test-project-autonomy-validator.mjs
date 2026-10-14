import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, readdir, lstat, copyFile, utimes, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { REQUIRED_CHECKS, validatePolicy, parseTests, runValidation } from './project-autonomy-validator.mjs';
import { projectAutonomyValidationSchema } from '../apps/api/src/runtime/project-autonomy-evidence.ts';

const exec = promisify(execFile);
const hash = body => createHash('sha256').update(body).digest('hex');
const counts = { total: 3, passed: 3, failed: 0, skipped: 0, unknown: 0 };
const excluded = new Set(['.git', '.secrets', '.claude', '.codex', 'node_modules', 'dist', 'build', 'coverage', '.jarvis-validation-output', 'data', 'uploads', 'recordings', 'sessions']);

// Fixture-only IO executes real, tiny Node subprocesses. It is not available
// through the production CLI or sudo wrapper and never touches factory source.
async function publicFingerprint(root) {
  const manifest = [];
  async function walk(dir) {
    for (const name of (await readdir(dir)).sort()) {
      if (excluded.has(name) || name.startsWith('.env') || /\.(pem|key|pfx|p12)$/.test(name)) continue;
      const path = join(dir, name), info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error('SOURCE_SYMLINK_NOT_ALLOWED');
      if (info.isDirectory()) await walk(path);
      else if (info.isFile()) { const body = await readFile(path); manifest.push({ path: relative(root, path).replaceAll('\\', '/'), sha256: hash(body), bytes: body.length }); }
    }
  }
  await walk(root);
  return { sha256: hash(manifest.map(v => `${v.path}\0${v.sha256}\n`).join('')), files: manifest.length, bytes: manifest.reduce((sum, v) => sum + v.bytes, 0), manifest };
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-validator-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'source'), evidenceRoot = join(root, 'private-evidence');
  await mkdir(workspace); await mkdir(evidenceRoot); await mkdir(join(workspace, '.jarvis-validation-output'));
  await writeFile(join(workspace, 'index.mjs'), 'export const answer=42;\n');
  await mkdir(join(workspace, 'docs')); await writeFile(join(workspace, 'docs', 'requirements.md'), '# real fixture requirement\n');
  await mkdir(join(workspace, 'test')); await writeFile(join(workspace, 'test', 'unit.mjs'), 'export const tests=3;\n');
  await writeFile(join(workspace, 'compose.yml'), 'services: {}\n');
  const input = { workspace, runId: randomUUID(), workPackage: 'FA-01', goalSpecHash: hash('fixture-only-goal-not-a-product-acceptance') };
  const testPath = '.jarvis-validation-output/tests.json', artifact = '.jarvis-validation-output/candidate.bin';
  const code = id => `const fs=require('node:fs');console.log(${JSON.stringify(id + ': actual fixture subprocess')});${id === 'tests' ? `fs.writeFileSync(${JSON.stringify(join(workspace, testPath))},JSON.stringify(${JSON.stringify(counts)}));` : ''}${id === 'package' ? `fs.writeFileSync(${JSON.stringify(join(workspace, artifact))},'actual fixture package bytes');` : ''}`;
  const checks = REQUIRED_CHECKS.filter(v => v !== 'source-stability').map(id => ({ id, required: true, program: process.execPath, args: ['-e', code(id)], timeoutSec: 5,
    ...(id === 'tests' ? { testReport: { path: testPath, format: 'standard-json', minTotal: 3 } } : {}),
    ...(id === 'package' ? { artifacts: [artifact] } : {}) }));
  const policy = { schemaVersion: 1, kind: 'project-autonomy-policy', workPackage: input.workPackage, goalSpecHash: input.goalSpecHash, workspace,
    evidenceRoot, runAsUser: 'fixtureuser', expectedChecks: [...REQUIRED_CHECKS], checks };
  let prepared;
  const io = {
    async prepare(dir) { await mkdir(dir, { recursive: true }); prepared = dir; },
    fingerprint: publicFingerprint,
    async command(check, context, _policy, log) {
      const startedAt = new Date().toISOString();
      const args = check.args.map(v => v.replace('{workspace}', context.workspace));
      let result;
      try { const out = await exec(check.program, args, { cwd: context.workspace, shell: false, timeout: check.timeoutSec * 1000 }); result = { exitCode: 0, signal: null, ...out }; }
      catch (error) { result = { exitCode: Number.isInteger(error.code) ? error.code : null, signal: error.signal, stdout: error.stdout ?? '', stderr: error.stderr ?? '', timedOut: !!error.killed }; }
      await writeFile(log, result.stdout + result.stderr);
      return { exitCode: result.exitCode, signal: result.signal, timedOut: result.timedOut ?? false, outputLimited: false, startedAt, finishedAt: new Date().toISOString() };
    },
    async readJSON(root, path) { const body = await readFile(join(root, path)); const info = await lstat(join(root, path), { bigint: true }); return { value: JSON.parse(body), sha256: hash(body), bytes: body.length, mtimeMs: Number(info.mtimeNs) / 1e6, mtimeNs: String(info.mtimeNs), inode: String(info.ino) }; },
    async artifact(root, path, dest) { await copyFile(join(root, path), dest); const body = await readFile(dest); return { path: dest, sourcePath: path, bytes: body.length, sha256: hash(body) }; },
    async writeJSON(path, value) { await writeFile(path, JSON.stringify(value, null, 2)); },
    async hashLog(path) { const body = await readFile(path); return { sha256: hash(body), bytes: body.length }; },
  };
  return { root, input, policy, io, artifact, testPath, detail: async () => JSON.parse(await readFile(join(prepared, 'detailed-report.json'), 'utf8')), evidence: () => prepared };
}

test('trusted FA01 policy requires all eight IDs and exact run/workspace/goal identity', async t => {
  const f = await fixture(t); assert.equal(validatePolicy(f.policy, f.input), f.policy);
  for (const id of REQUIRED_CHECKS) { const p = structuredClone(f.policy); p.expectedChecks = p.expectedChecks.filter(v => v !== id); assert.throws(() => validatePolicy(p, f.input), /REQUIRED_CHECK_MISSING/); }
  for (const field of ['goalSpecHash', 'workPackage', 'workspace']) { const input = { ...f.input, [field]: field === 'workspace' ? join(f.root, 'other') : field === 'workPackage' ? 'FA-02' : hash('other') }; assert.throws(() => validatePolicy(f.policy, input), /MISMATCH|NOT_APPROVED/); }
});

test('fixed argv policy rejects unknown tokens, traversal/private artifacts, secrets and root execution', async t => {
  const f = await fixture(t);
  for (const mutate of [p => p.runAsUser = 'root', p => p.checks[0].args = ['{arbitraryShell}'], p => p.checks[0].program = 'node', p => p.checks[0].args = ['--api-key', 'secret'], p => p.artifacts = ['../private'], p => p.artifacts = ['.secrets/key.txt'], p => p.env = { NODE_OPTIONS: '--import=evil.mjs' }, p => p.checks[0].cwd = '/tmp', p => p.checks[0].timeoutSec = 0, p => p.checks.push(p.checks[0])]) { const p = structuredClone(f.policy); mutate(p); assert.throws(() => validatePolicy(p, f.input)); }
});

test('actual fixture subprocesses, current counts and a real package yield strict protocol; not a product acceptance', async t => {
  const f = await fixture(t), report = await runValidation(f.input, f.policy, f.io);
  assert.equal(report.status, 'pass'); assert.equal(report.simulated, false); assert.equal(report.sourceStable, true);
  assert.equal(report.checks.length, 8); assert.deepEqual(report.checks.find(v => v.id === 'tests').tests, counts);
  assert.ok(report.checks.every(v => v.executed && v.exitCode === 0 && v.status === 'pass' && v.command.length > 0 && /^[a-f0-9]{64}$/.test(v.evidenceSha256)));
  assert.equal(report.artifacts[0].path, f.artifact); assert.equal(report.artifacts[0].sha256, hash('actual fixture package bytes'));
  assert.equal(projectAutonomyValidationSchema.safeParse(report).success, true);
  assert.ok(!JSON.stringify(report).includes('private-evidence')); assert.ok(!('tests' in report));
  assert.equal((await f.detail()).artifacts[0].path.startsWith(f.evidence()), true);
});

test('missing isolated deployment adapters stay unexecuted/unknown and fail instead of shrinking denominator', async t => {
  const f = await fixture(t); f.policy.checks = f.policy.checks.filter(v => ['build', 'typecheck', 'tests'].includes(v.id));
  const report = await runValidation(f.input, f.policy, f.io);
  assert.equal(report.status, 'fail'); assert.equal(report.checks.length, 8);
  for (const id of ['package', 'isolated-health', 'frontend', 'write-readback']) { const check = report.checks.find(v => v.id === id); assert.equal(check.executed, false); assert.equal(check.status, 'unknown'); assert.equal(check.exitCode, null); }
});

test('a real nonzero check and its dependent check cannot pass', async t => {
  const f = await fixture(t); f.policy.checks.find(v => v.id === 'build').args = ['-e', 'console.error("actual fixture failure");process.exit(7)'];
  f.policy.checks.find(v => v.id === 'package').dependsOn = ['build'];
  const report = await runValidation(f.input, f.policy, f.io);
  assert.equal(report.status, 'fail'); assert.equal(report.checks.find(v => v.id === 'build').exitCode, 7);
  assert.equal(report.checks.find(v => v.id === 'package').executed, false);
});

test('missing, zero, inconsistent and failed test counts never pass; all five count fields are mandatory', () => {
  for (const value of [{ total: 0, passed: 0, failed: 0, skipped: 0, unknown: 0 }, { total: 3, passed: 3, failed: 0, skipped: 0 }, { ...counts, total: 4 }, { ...counts, unknown: -1 }]) assert.throws(() => parseTests(value, 'standard-json', 1));
  assert.deepEqual(parseTests(counts, 'standard-json', 3), counts);
  assert.deepEqual(parseTests({ success: true, numTotalTests: 3, numPassedTests: 2, numFailedTests: 0, numPendingTests: 0 }, 'vitest-json'), { total: 3, passed: 2, failed: 0, skipped: 0, unknown: 1 });
  assert.throws(() => parseTests({ success: false, numTotalTests: 3, numPassedTests: 3, numFailedTests: 0, numPendingTests: 0 }, 'vitest-json'));
});

for (const problem of ['failed', 'skipped', 'unknown']) test(`actual required test report with ${problem} remains fail`, async t => {
  const f = await fixture(t), check = f.policy.checks.find(v => v.id === 'tests');
  const value = { ...counts, passed: 2, [problem]: 1 };
  check.args = ['-e', `require('node:fs').writeFileSync(${JSON.stringify(join(f.input.workspace, f.testPath))},JSON.stringify(${JSON.stringify(value)}))`];
  const report = await runValidation(f.input, f.policy, f.io); assert.equal(report.status, 'fail'); assert.equal(report.checks.find(v => v.id === 'tests').tests[problem], 1);
});

test('exit zero cannot reuse an old unmodified test report', async t => {
  const f = await fixture(t); await writeFile(join(f.input.workspace, f.testPath), JSON.stringify(counts));
  const old = new Date(Date.now() - 300000); await utimes(join(f.input.workspace, f.testPath), old, old);
  f.policy.checks.find(v => v.id === 'tests').args = ['-e', 'console.log("fixture does not run tests")'];
  const report = await runValidation(f.input, f.policy, f.io); assert.equal(report.status, 'fail');
  assert.equal(report.checks.find(v => v.id === 'tests').status, 'fail');
  assert.match((await f.detail()).checks.find(v => v.id === 'tests').errorCode, /TEST_REPORT_NOT_FRESH|TEST_REPORT_NOT_REWRITTEN/);
});

test('changing docs, tests or deployment configuration invalidates the source binding', async t => {
  const f = await fixture(t); const initial = await publicFingerprint(f.input.workspace);
  for (const path of ['docs/requirements.md', 'test/unit.mjs', 'compose.yml']) { const full = join(f.input.workspace, path); await writeFile(full, 'changed\n'); assert.notEqual((await publicFingerprint(f.input.workspace)).sha256, initial.sha256); }
  f.policy.checks[0].args = ['-e', `require('node:fs').appendFileSync(${JSON.stringify(join(f.input.workspace, 'index.mjs'))},${JSON.stringify('// changed while checking\n')})`];
  const report = await runValidation(f.input, f.policy, f.io); assert.equal(report.sourceStable, false); assert.equal(report.status, 'fail'); assert.equal(report.checks.find(v => v.id === 'source-stability').status, 'fail');
});

test('private env and generated outputs are excluded, while current public source remains included', async t => {
  const f = await fixture(t), initial = await publicFingerprint(f.input.workspace);
  await mkdir(join(f.input.workspace, '.secrets')); await writeFile(join(f.input.workspace, '.secrets', 'api-key.txt'), 'fixture secret never exported');
  await writeFile(join(f.input.workspace, '.env.local'), 'SECRET=fixture'); await mkdir(join(f.input.workspace, 'dist')); await writeFile(join(f.input.workspace, 'dist', 'compiled.js'), 'generated');
  const current = await publicFingerprint(f.input.workspace); assert.equal(current.sha256, initial.sha256); assert.ok(!JSON.stringify(current).includes('fixture secret'));
});

test('root evidence snapshots preserve bytes even after workspace artifact is changed', async t => {
  const f = await fixture(t), report = await runValidation(f.input, f.policy, f.io), detail = await f.detail();
  await writeFile(join(f.input.workspace, f.artifact), 'subsequent workspace change');
  assert.equal(hash(await readFile(detail.artifacts[0].path)), report.artifacts[0].sha256);
  assert.notEqual(hash(await readFile(join(f.input.workspace, f.artifact))), report.artifacts[0].sha256);
});

test('timeout and missing test report do not turn process completion into acceptance', async t => {
  const f = await fixture(t); f.policy.checks[0].args = ['-e', 'setTimeout(()=>{},5000)']; f.policy.checks[0].timeoutSec = 1;
  f.policy.checks.find(v => v.id === 'tests').args = ['-e', 'console.log("missing actual report")'];
  const report = await runValidation(f.input, f.policy, f.io); assert.equal(report.status, 'fail'); assert.equal(report.checks[0].status, 'fail'); assert.equal(report.checks.find(v => v.id === 'tests').status, 'fail');
});

test('subsequent stages require their own trusted objective contract and actual tests', async t => {
  const f = await fixture(t); f.input.workPackage = 'FA-02'; f.policy.workPackage = 'FA-02';
  assert.throws(() => validatePolicy(f.policy, f.input), /PHASE_CONTRACT/);
  f.policy.expectedChecks = ['source-stability', 'tests', 'requirements-contract']; f.policy.contractChecks = ['requirements-contract'];
  f.policy.checks = [f.policy.checks.find(v => v.id === 'tests'), { id: 'requirements-contract', required: true, program: process.execPath, args: ['-e', 'console.log("fixture contract")'], timeoutSec: 5, artifacts: [f.testPath] }];
  const report = await runValidation(f.input, f.policy, f.io); assert.equal(report.status, 'pass'); assert.deepEqual(report.checks.map(v => v.id).sort(), ['requirements-contract', 'source-stability', 'tests']);
});

test('retry keeps previous proof and emits a new private attempt; no source task is restarted by validator', async t => {
  const f = await fixture(t); const first = await runValidation(f.input, f.policy, f.io), firstDir = f.evidence();
  const second = await runValidation(f.input, f.policy, f.io); assert.equal(first.status, 'pass'); assert.equal(second.status, 'pass');
  assert.notEqual(firstDir, f.evidence()); assert.equal(JSON.parse(await readFile(join(firstDir, 'validation-report.json'), 'utf8')).runId, f.input.runId);
});

test('production CLI refuses an untrusted/non-Linux entry instead of allowing the fixture override', async () => {
  if (process.platform === 'linux' && process.geteuid?.() === 0) return;
  const result = await exec(process.execPath, [resolve('scripts/project-autonomy-validator.mjs'), '--policy', resolve('package.json'), '--workspace', resolve('.'), '--run-id', randomUUID(), '--goal-spec-hash', hash('x'), '--work-package', 'FA-01']).catch(v => v);
  assert.equal(result.code, 2); const report = JSON.parse(result.stdout); assert.equal(report.status, 'fail'); assert.equal(report.errorCode, 'VALIDATOR_ROOT_REQUIRED');
});

test('Python boundary/helpers parse without execution or writing bytecode', async () => {
  await exec('python', ['-c', 'import ast,pathlib,sys;[ast.parse(pathlib.Path(v).read_text(encoding="utf-8")) for v in sys.argv[1:]]', resolve('scripts/project-autonomy-evidence.py'), resolve('scripts/project-autonomy-validation-wrapper.py')]);
});

test('Linux anchored evidence reader refuses symlink/hardlink/private paths', { skip: process.platform !== 'linux' || process.geteuid?.() !== 0 }, async t => {
  const f = await fixture(t);
  const script = 'import runpy,sys,os,json;m=runpy.run_path(sys.argv[1]);root=sys.argv[2];os.symlink("/etc/passwd",root+"/link");\ntry:m["fingerprint"](root);raise Exception("unexpected")\nexcept ValueError as e:assert str(e)=="SOURCE_SYMLINK_NOT_ALLOWED"\nos.unlink(root+"/link");os.link(root+"/index.mjs",root+"/hardlink");\ntry:m["fingerprint"](root);raise Exception("unexpected")\nexcept ValueError as e:assert str(e)=="SOURCE_HARDLINK_NOT_ALLOWED"\ntry:m["relative_parts"](".secrets/secret");raise Exception("unexpected")\nexcept ValueError as e:assert str(e)=="EVIDENCE_PRIVATE_PATH_REFUSED"\nprint(json.dumps({"checks":3,"passed":3}))';
  const out = await exec('/usr/bin/python3', ['-c', script, resolve('scripts/project-autonomy-evidence.py'), f.input.workspace]); assert.deepEqual(JSON.parse(out.stdout), { checks: 3, passed: 3 });
});
