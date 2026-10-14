/** Root-owned fixed FA01 collector inside its disposable container.
 * The trusted collector owns /evidence; all candidate/browsers run as 1000:1000.
 * No host Docker socket, private source env, external model or production DB.
 */
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile, writeFile, chmod, readdir, lstat, rm } from 'node:fs/promises';
import { join, relative, resolve, dirname, basename } from 'node:path';
const WORK = '/work/source', OUTPUT = '/evidence', PNPM = '/corepack-runtime/dist/pnpm.js';
const sha = value => createHash('sha256').update(value).digest('hex');
const rows = [], problems = [], artifacts = [], children = new Set();
const START = new Date().toISOString();
const deadline = Date.now() + 2700 * 1000;
let cancelled = false;
const cleanCode = e => /^[A-Z][A-Z_0-9]+$/.test(e?.message ?? '') ? e.message : 'FIXED_CHECK_FAILED';
function need(value, code) { if (!value) throw Error(code); }
export async function writeTrustedPackageManifest(path, contents) {
  // Coordinator precreates this one root-owned file in the disposable copy.
  // Never create or truncate through a candidate-controlled symlink/path.
  need(typeof constants.O_NOFOLLOW === 'number', 'PACKAGE_MANIFEST_NOFOLLOW_UNAVAILABLE');
  need(basename(path) === 'jarvis-package-manifest.json', 'PACKAGE_MANIFEST_PATH_UNTRUSTED');
  const directory = await open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const parent = await directory.stat();
    need(parent.isDirectory() && parent.uid === 1000 && parent.gid === 0, 'PACKAGE_MANIFEST_PARENT_UNTRUSTED');
    const file = await open(join('/proc/self/fd', String(directory.fd), basename(path)), constants.O_WRONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await file.stat();
      need(info.isFile() && info.nlink === 1 && info.uid === 0 && info.gid === 0, 'PACKAGE_MANIFEST_FILE_UNTRUSTED');
      await file.truncate(0);
      await file.writeFile(contents, 'utf8');
      await file.chmod(0o644);
      await file.sync();
    } finally { await file.close(); }
  } finally { await directory.close(); }
}
const env = () => ({ ...process.env, HOME: '/work/home', CI: '1', COREPACK_ENABLE_NETWORK: '0' });
// This trusted, same-UID supervisor is the detached group's live anchor.
// The parent never signals a numeric PID: its private IPC channel can request
// only stop, and the supervisor can signal only its own process group.
export const scopedSupervisorSource = String.raw`
const {spawn}=require('node:child_process');
const {readFileSync}=require('node:fs');
let stopping=false;
function send(value,done){if(!process.connected)return process.exit(71);process.send(value,error=>error?process.exit(71):done?.());}
function stopGroup(value){if(stopping)return;stopping=true;send(value,()=>{try{process.kill(-process.pid,'SIGKILL');}catch{send({type:'supervisor-error',code:'GROUP_STOP_FAILED'},()=>process.exit(72));}});}
process.on('message',value=>{if(value?.type==='stop'&&Object.keys(value).length===1)stopGroup({type:'command-exit',exitCode:null,signal:'SIGKILL',stopped:true});else stopGroup({type:'supervisor-error',code:'CONTROL_MESSAGE_INVALID'});});
process.on('disconnect',()=>{try{process.kill(-process.pid,'SIGKILL');}catch{process.exit(73);}});
process.once('SIGTERM',()=>stopGroup({type:'command-exit',exitCode:null,signal:'SIGTERM',stopped:true}));
process.once('SIGINT',()=>stopGroup({type:'command-exit',exitCode:null,signal:'SIGINT',stopped:true}));
try{
 const text=readFileSync('/proc/self/stat','utf8'),fields=text.slice(text.lastIndexOf(')')+2).trim().split(/\s+/);
 if(process.getuid()!==1000||process.getgid()!==1000||Number(fields[2])!==process.pid||Number(fields[3])!==process.pid)throw Error('GROUP_IDENTITY_INVALID');
 const command=JSON.parse(process.argv[1]);
 if(typeof command.program!=='string'||!Array.isArray(command.args)||!command.args.every(v=>typeof v==='string')||!(command.nodePath===null||typeof command.nodePath==='string'))throw Error('COMMAND_INVALID');
 const childEnv={...process.env};delete childEnv.NODE_CHANNEL_FD;delete childEnv.NODE_CHANNEL_SERIALIZATION_MODE;
 if(command.nodePath===null)delete childEnv.NODE_PATH;else childEnv.NODE_PATH=command.nodePath;
 send({type:'supervisor-ready',pid:process.pid,pgid:Number(fields[2]),sid:Number(fields[3]),uid:process.getuid(),gid:process.getgid(),startTime:fields[19]},()=>{
  if(stopping)return;
  const commandChild=spawn(command.program,command.args,{cwd:process.cwd(),env:childEnv,uid:1000,gid:1000,shell:false,detached:false,stdio:['ignore',1,2]});
  commandChild.once('error',()=>stopGroup({type:'command-exit',exitCode:null,signal:null,spawnError:true}));
  commandChild.once('exit',(exitCode,signal)=>stopGroup({type:'command-exit',exitCode,signal}));
 });
}catch{stopGroup({type:'supervisor-error',code:'SUPERVISOR_SETUP_FAILED'});}
`;
export function spawnScopedCommand(program, args, options = {}) {
  // The inline trusted supervisor must never load candidate-supplied preload
  // code before it installs its fixed IPC protocol.
  need(!options.env?.NODE_OPTIONS, 'COLLECTOR_SUPERVISOR_ENV_UNTRUSTED');
  const child = spawn(process.execPath, ['-e', scopedSupervisorSource, JSON.stringify({ program, args, nodePath: options.env?.NODE_PATH ?? null })], {
    ...options, env: { ...options.env, NODE_OPTIONS: '', NODE_PATH: '' }, uid: 1000, gid: 1000, shell: false, detached: true,
    stdio: ['ignore', options.stdio?.[1] ?? 'ignore', options.stdio?.[2] ?? 'ignore', 'ipc']
  });
  let ready = false, commandResult, settled = false, stopTimer, stopRequested = false, resolveCompletion;
  const completion = new Promise(resolve => { resolveCompletion = resolve; });
  const finish = value => { if (!settled) { settled = true; clearTimeout(stopTimer); resolveCompletion(value); } };
  const unconfirmed = () => {
    finish({ exitCode: null, signal: null, stopFailure: true });
    if (child.connected) child.disconnect();
    child.unref();
  };
  child.on('message', value => {
    if (value?.type === 'supervisor-ready' && !ready && !commandResult && value.pid === child.pid && value.pgid === child.pid && value.sid === child.pid && value.uid === 1000 && value.gid === 1000 && /^\d+$/.test(value.startTime)) { ready = true; return; }
    if (value?.type === 'command-exit' && !commandResult && (ready || stopRequested) && (value.exitCode === null || Number.isInteger(value.exitCode) && value.exitCode >= 0 && value.exitCode <= 255) && (value.signal === null || typeof value.signal === 'string' && /^SIG[A-Z0-9]+$/.test(value.signal))) { commandResult = value; return; }
    unconfirmed();
  });
  child.once('error', unconfirmed);
  child.once('close', (exitCode, signal) => {
    if (commandResult && signal === 'SIGKILL') finish({ ...commandResult, stopFailure: false });
    else finish({ exitCode: null, signal, stopFailure: true });
  });
  child.once('disconnect', () => {
    // A normal supervisor sends its result before killing its own group.
    if (!commandResult && !settled) unconfirmed();
  });
  const requestStop = () => {
    if (settled || stopRequested) return completion;
    stopRequested = true;
    stopTimer = setTimeout(unconfirmed, 5000);
    if (!child.connected) unconfirmed();
    else child.send({ type: 'stop' }, error => { if (error) unconfirmed(); });
    return completion;
  };
  return { child, completion, requestStop };
}
async function stop() {
  const results = await Promise.all([...children].map(child => child.requestStop()));
  need(results.every(result => !result.stopFailure), 'COLLECTOR_PROCESS_STOP_UNCONFIRMED');
}
function cancel() { cancelled = true; process.exitCode = 1; void stop().catch(() => problems.push({ id: 'collector', errorCode: 'COLLECTOR_PROCESS_STOP_UNCONFIRMED' })); }
process.once('SIGTERM', cancel);
process.once('SIGINT', cancel);
async function save() { await writeFile(join(OUTPUT, 'collector-' + (process.argv[2] ?? 'invalid') + '.json'), JSON.stringify({ schemaVersion: 1, runId: process.env.JARVIS_AUTONOMY_RUN_ID, sourceFingerprint: process.env.JARVIS_SOURCE_SHA256, startedAt: START, finishedAt: new Date().toISOString(), checks: rows, problems, artifacts }, null, 2), { mode: 0o600 }); }
export async function processCheck(id, program, args, { cwd = WORK, timeoutMs = 420000, childEnv = env(), stdoutFile } = {}) {
  need(!cancelled, 'VALIDATION_CANCELLED');
  const logPath = join(OUTPUT, id + '.log'), log = await open(logPath, 'wx', 0o600), output = stdoutFile ? await open(stdoutFile, 'wx', 0o600) : undefined;
  let child, timer, limitTimer, timedOut = false, outputLimited = false, result;
  const startedAt = new Date().toISOString();
  try {
    child = spawnScopedCommand(program, args, { cwd, env: childEnv, stdio: ['ignore', output?.fd ?? log.fd, log.fd] });
      children.add(child);
      timer = setTimeout(() => { timedOut = true; void child.requestStop(); }, Math.max(1, Math.min(timeoutMs, deadline - Date.now())));
      limitTimer = setInterval(async () => {
        try {
          if ((await log.stat()).size > 16 * 1024 * 1024 || (output && (await output.stat()).size > 512 * 1024 * 1024)) {
            outputLimited = true; void child.requestStop();
          }
        } catch {}
      }, 200);
      result = await child.completion;
  } finally { clearTimeout(timer); clearInterval(limitTimer); if (child) await child.requestStop(); children.delete(child); await log.close(); await output?.close(); }
  const body = await readFile(logPath);
  const row = { id, required: true, command: JSON.stringify([program, ...args]), executed: true, status: result.exitCode === 0 && !result.signal && !result.spawnError && !result.stopFailure && !result.stopped && !timedOut && !outputLimited && !cancelled ? 'pass' : 'fail', exitCode: result.exitCode, evidenceSha256: sha(body), startedAt, timedOut, outputLimited };
  rows.push(row); await save(); process.stdout.write(JSON.stringify({ type: 'execution.progress', phase: id, ok: row.status === 'pass', exitCode: row.exitCode }) + '\n');
  need(!result.stopFailure, 'COLLECTOR_PROCESS_STOP_UNCONFIRMED');
  return row;
}
async function functionCheck(id, command, callback) {
  need(!cancelled, 'VALIDATION_CANCELLED');
  const row = { id, required: true, command: JSON.stringify(command), executed: true, status: 'fail', exitCode: 1, evidenceSha256: sha(id + ':failure') };
  try { const proof = await callback(); const body = JSON.stringify(proof); await writeFile(join(OUTPUT, id + '-proof.json'), body, { mode: 0o600 }); row.status = 'pass'; row.exitCode = 0; row.evidenceSha256 = sha(body); }
  catch (error) { const errorCode = cleanCode(error); problems.push({ id, errorCode }); row.evidenceSha256 = sha(JSON.stringify({ id, errorCode })); }
  rows.push(row); await save(); return row;
}
export function countsFromVitest(value) {
  const result = { total: value?.numTotalTests, passed: value?.numPassedTests, failed: value?.numFailedTests, skipped: value?.numPendingTests, unknown: 0 };
  need(['total', 'passed', 'failed', 'skipped'].every(key => Number.isInteger(result[key]) && result[key] >= 0), 'TEST_COUNTS_INVALID');
  result.unknown = result.total - result.passed - result.failed - result.skipped;
  need(result.unknown >= 0, 'TEST_COUNTS_INCONSISTENT');
  return result;
}
export function validateBaseline(value) {
  need(value?.kind === 'project-autonomy-test-baseline' && value.schemaVersion === 1, 'TEST_BASELINE_INVALID');
  need(Array.isArray(value.requiredTestFiles) && value.requiredTestFiles.length >= 45 && value.requiredTestFiles.length <= 1000 && new Set(value.requiredTestFiles).size === value.requiredTestFiles.length && value.requiredTestFiles.every(v => typeof v === 'string' && /^(?:apps|packages)\/[a-zA-Z0-9_./-]+\.(?:test|spec)\.[cm]?[jt]sx?$/.test(v) && !v.split('/').includes('..')), 'TEST_BASELINE_INVALID');
  need(Array.isArray(value.requiredPrototypeSuites) && value.requiredPrototypeSuites.length >= 30 && value.requiredPrototypeSuites.length <= 100 && new Set(value.requiredPrototypeSuites).size === value.requiredPrototypeSuites.length && value.requiredPrototypeSuites.every(v => /^[a-z][a-z0-9-]+$/.test(v)), 'TEST_BASELINE_INVALID');
  need(Number.isFinite(value.minimumCoverage?.lines) && value.minimumCoverage.lines >= 90 && value.minimumCoverage.lines <= 100 && Number.isFinite(value.minimumCoverage?.branches) && value.minimumCoverage.branches >= 80 && value.minimumCoverage.branches <= 100, 'COVERAGE_BASELINE_INVALID');
  return value;
}
export function assertFreshReport(info, startedAt, label = 'TEST') {
  need(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.mtimeMs >= Date.parse(startedAt), label + '_REPORT_NOT_FRESH');
}
export function coverageFromIstanbul(raw) {
  const result = { lines: { total: 0, covered: 0 }, branches: { total: 0, covered: 0 } };
  for (const file of Object.values(raw)) {
    const lines = new Map();
    for (const [id, hits] of Object.entries(file.s ?? {})) {
      const line = file.statementMap?.[id]?.start?.line;
      need(Number.isInteger(line) && line > 0 && Number.isFinite(hits) && hits >= 0, 'COVERAGE_DATA_INVALID');
      lines.set(line, Math.max(lines.get(line) ?? 0, hits));
    }
    result.lines.total += lines.size;
    result.lines.covered += [...lines.values()].filter(v => v > 0).length;
    for (const values of Object.values(file.b ?? {})) for (const hits of values) {
      need(Number.isFinite(hits) && hits >= 0, 'COVERAGE_DATA_INVALID');
      result.branches.total++; if (hits > 0) result.branches.covered++;
    }
  }
  return result;
}
async function manifest(root, matcher, prefix = '') {
  const found = [];
  for (const name of (await readdir(root)).sort()) {
    if (['node_modules', '.git', 'dist', 'coverage', '.jarvis-validation-output'].includes(name)) continue;
    const path = join(root, name), info = await lstat(path);
    need(!info.isSymbolicLink(), 'CANDIDATE_SYMLINK_REFUSED');
    if (info.isDirectory()) found.push(...await manifest(path, matcher, prefix + name + '/'));
    else if (info.isFile() && matcher(prefix + name)) found.push({ path: prefix + name, sha256: sha(await readFile(path)) });
  }
  return found;
}
async function request(path, options = {}) {
  const response = await fetch('http://127.0.0.1:18930' + path, { ...options, signal: AbortSignal.timeout(10000) });
  const text = await response.text(); let value; try { value = JSON.parse(text); } catch {}
  return { status: response.status, value, response, text };
}
async function main() {
  need(process.getuid?.() === 0 && process.cwd() === WORK && /^(?:[a-f0-9]{40}|[a-f0-9-]{36})$/.test(process.env.JARVIS_AUTONOMY_RUN_ID ?? '') && /^[a-f0-9]{64}$/.test(process.env.JARVIS_SOURCE_SHA256 ?? ''), 'COLLECTOR_SCOPE_INVALID');
  need((await lstat(OUTPUT)).uid === 0 && ((await lstat(OUTPUT)).mode & 0o077) === 0, 'COLLECTOR_EVIDENCE_NOT_PRIVATE');
  need(['build', 'runtime'].includes(process.argv[2]), 'COLLECTOR_MODE_INVALID');
  if (process.argv[2] === 'runtime') return runtime();
  const baseline = validateBaseline(JSON.parse(process.env.JARVIS_TEST_BASELINE ?? 'null'));
  const originalTests = await manifest(WORK, path => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path));
  need(originalTests.length > 0, 'NO_APPLICABLE_TESTS');
  await writeFile(join(OUTPUT, 'applicable-tests.json'), JSON.stringify(originalTests), { mode: 0o600 });
  await functionCheck('test-baseline', ['all-trusted-baseline-files-remain-applicable'], async () => {
    const found = new Set(originalTests.map(v => v.path)); need(baseline.requiredTestFiles.every(v => found.has(v)), 'ORIGINAL_REQUIRED_TEST_FILE_REMOVED');
    return { current: originalTests.map(v => v.path), required: baseline.requiredTestFiles };
  });
  const runPnpm = (id, args, timeoutMs) => processCheck(id, process.execPath, [PNPM, ...args], { timeoutMs });
  await runPnpm('offline-install', ['install', '--offline', '--frozen-lockfile', '--ignore-scripts', '--store-dir', '/pnpm-store'], 240000);
  await runPnpm('build', ['-r', '--no-bail', 'run', 'build'], 420000);
  await runPnpm('typecheck', ['-r', '--no-bail', 'run', 'typecheck'], 420000);
  await runPnpm('lint', ['run', 'lint'], 240000);
  await runPnpm('dependency-boundaries', ['run', 'check:deps'], 240000);
  await runPnpm('document-codes', ['run', 'check:codes'], 180000);
  // Never accept a success report left by an older source/run. Only the new
  // invocation may produce these fixed paths; generated coverage is separate.
  for (const pkg of ['packages/shared', 'apps/server', 'apps/web']) {
    await rm(join(WORK, pkg, 'jarvis-test-report.json'), { force: true });
    await rm(join(WORK, pkg, 'coverage'), { recursive: true, force: true });
  }
  const test = await runPnpm('tests', ['-r', '--no-bail', '--workspace-concurrency=1', 'run', 'test', '--reporter=json', '--outputFile=jarvis-test-report.json', '--coverage.reportOnFailure=true', '--fileParallelism=false', '--maxWorkers=1', '--minWorkers=1'], 1200000);
  const totals = { total: 0, passed: 0, failed: 0, skipped: 0, unknown: 0 }, observed = [];
  for (const pkg of ['packages/shared', 'apps/server', 'apps/web']) {
    try {
      const path = join(WORK, pkg, 'jarvis-test-report.json'), info = await lstat(path);
      assertFreshReport(info, test.startedAt);
      const raw = await readFile(path), report = JSON.parse(raw), n = countsFromVitest(report);
      for (const key of Object.keys(totals)) totals[key] += n[key];
      for (const file of report.testResults ?? []) {
        const rel = relative(WORK, resolve(file.name)).replaceAll('\\', '/'); need(!rel.startsWith('../'), 'TEST_FILE_OUTSIDE_CANDIDATE'); observed.push(rel);
      }
      await writeFile(join(OUTPUT, pkg.replaceAll('/', '-') + '-tests.json'), raw, { mode: 0o600 });
    } catch (error) {
      // The current frontend package explicitly permits no unit test files.
      // This absence contributes zero counts, never fabricated passed tests;
      // every actual frontend test and real browser checks remain required.
      if (error?.code === 'ENOENT' && !originalTests.some(v => v.path.startsWith(pkg + '/'))) continue;
      test.status = 'fail'; problems.push({ id: 'tests', package: pkg, errorCode: cleanCode(error) });
    }
  }
  if (totals.total > 0) test.tests = totals;
  if (totals.total === 0 || totals.failed || totals.skipped || totals.unknown) test.status = 'fail';
  await functionCheck('test-manifest', ['all-current-test-files-accounted-for'], async () => {
    const expected = originalTests.map(v => v.path).sort(); need(new Set(observed).size === observed.length && JSON.stringify(expected) === JSON.stringify(observed.sort()), 'APPLICABLE_TESTS_NOT_ALL_EXECUTED');
    return { expected, observed, counts: totals };
  });
  const guide = await readFile(join(WORK, 'doc/tests/run-all.cjs'), 'utf8');
  const match = guide.match(/const suites\s*=\s*\[([^\]]+)\]/), suites = match ? [...match[1].matchAll(/'([a-z][a-z0-9-]+)'/g)].map(v => v[1]) : [];
  need(suites.length > 0 && suites.length <= 100 && new Set(suites).size === suites.length, 'PROTOTYPE_TEST_MANIFEST_INVALID');
  await functionCheck('prototype-baseline', ['all-trusted-prototype-suites-remain-required'], async () => {
    need(baseline.requiredPrototypeSuites.every(v => suites.includes(v)), 'ORIGINAL_REQUIRED_PROTOTYPE_SUITE_REMOVED');
    return { current: suites, required: baseline.requiredPrototypeSuites };
  });
  for (const name of suites) await processCheck('prototype-' + name, process.execPath, [join(WORK, 'doc/tests', name + '.cjs')], { timeoutMs: 120000 });
  await functionCheck('coverage', ['actual-coverage-and-configured-thresholds'], async () => {
    const results = [];
    for (const pkg of ['packages/shared', 'apps/server']) {
      const path = join(WORK, pkg, 'coverage/coverage-final.json'), info = await lstat(path);
      assertFreshReport(info, test.startedAt, 'COVERAGE');
      const raw = JSON.parse(await readFile(path, 'utf8'));
      const config = await readFile(join(WORK, pkg, 'vitest.config.ts'), 'utf8');
      const thresholds = config.match(/thresholds\s*:\s*\{\s*lines\s*:\s*(\d+)\s*,\s*branches\s*:\s*(\d+)\s*\}/);
      need(thresholds && Number(thresholds[1]) >= baseline.minimumCoverage.lines && Number(thresholds[2]) >= baseline.minimumCoverage.branches, 'COVERAGE_THRESHOLDS_REDUCED');
      const actual = coverageFromIstanbul(raw);
      need(actual.lines.total > 0 && actual.branches.total > 0 && actual.lines.covered / actual.lines.total * 100 >= Number(thresholds[1]) && actual.branches.covered / actual.branches.total * 100 >= Number(thresholds[2]), 'COVERAGE_NOT_MET');
      results.push({ package: pkg, ...actual, configuredLineThreshold: Number(thresholds[1]), configuredBranchThreshold: Number(thresholds[2]) });
    }
    return results;
  });
  const requiredPaths = ['apps/server/dist/main.js', 'apps/web/dist/index.html', 'packages/shared/dist/index.js', 'packages/shared/dist/esm/index.js', 'pnpm-lock.yaml', 'package.json'];
  const content = [];
  for (const path of requiredPaths) { try { const body = await readFile(join(WORK, path)); need(body.length > 0, 'REQUIRED_PACKAGE_FILE_EMPTY'); content.push({ path, sha256: sha(body), bytes: body.length }); } catch (error) { problems.push({ id: 'package', errorCode: cleanCode(error), path }); } }
  const packageManifest = JSON.stringify({ schemaVersion: 1, sourceFingerprint: process.env.JARVIS_SOURCE_SHA256, runId: process.env.JARVIS_AUTONOMY_RUN_ID, goalSpecHash: process.env.JARVIS_GOAL_SPEC_HASH, files: content });
  await writeTrustedPackageManifest(join(WORK, 'jarvis-package-manifest.json'), packageManifest);
  await writeFile(join(OUTPUT, 'package-manifest.json'), packageManifest, { mode: 0o600 });
  const packagePath = join(OUTPUT, 'candidate.tar.gz');
  const packageRow = await processCheck('package', '/bin/tar', ['--exclude=./.git', '--exclude=./.env*', '--exclude=./.secrets', '--exclude=*/coverage', '--exclude=*/jarvis-test-report.json', '--exclude=./doc/evidence', '--exclude=./data', '--exclude=./logs', '--exclude=./uploads', '--exclude=./.jarvis-validation-output', '-czf', '-', '-C', WORK, '.'], { stdoutFile: packagePath, timeoutMs: 240000 });
  if (content.length !== requiredPaths.length || !(await lstat(join(WORK, 'node_modules/.pnpm'))).isDirectory()) packageRow.status = 'fail';
  need((await lstat(packagePath)).size <= 512 * 1024 * 1024, 'PACKAGE_SIZE_LIMIT');
  const pack = await readFile(packagePath); artifacts.push({ name: 'candidate.tar.gz', sha256: sha(pack), bytes: pack.length });
}

async function runtime() {
  const log = await open(join(OUTPUT, 'api-runtime.log'), 'wx', 0o600);
  const childEnv = { ...env(), NODE_ENV: 'production', MSF_PORT: '18930', MSF_WEB_DIST: join(WORK, 'apps/web/dist'), MSF_AUTH_USER: process.env.JARVIS_VALIDATION_USER, MSF_AUTH_PASS: process.env.JARVIS_VALIDATION_PASSWORD };
  const server = spawnScopedCommand(process.execPath, [join(WORK, 'apps/server/dist/main.js')], { cwd: join(WORK, 'apps/server'), env: childEnv, stdio: ['ignore', log.fd, log.fd] });
  children.add(server);
  let cookie;
  try {
    await functionCheck('isolated-health', ['actual-installed-api', '/health', 'postgres-redis-minio'], async () => {
      let health;
      for (let attempt = 0; attempt < 60; attempt++) { try { const r = await request('/health'); if (r.status === 200 && r.value?.ok && r.value.db && r.value.redis && r.value.minio) { health = r.value; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 1000)); }
      need(health, 'ISOLATED_SERVICE_HEALTH_FAILED'); return { status: 200, ...health, packageInstalled: true, hostPortsPublished: false };
    });
    await functionCheck('write-readback', ['installed-package-authentication-and-project-create-update-archive-readback'], async () => {
      const anonymous = await request('/api/projects'); need(anonymous.status === 401, 'UNAUTHENTICATED_ACCESS_NOT_DENIED');
      const who = await request('/api/auth/whoami'); need(who.status === 200 && who.value?.enabled === true && who.value.user === null, 'AUTH_NOT_ENABLED');
      const bad = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'jarvis-invalid', password: 'invalid' }) }); need(bad.status === 401, 'INVALID_LOGIN_NOT_DENIED');
      const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: childEnv.MSF_AUTH_USER, password: childEnv.MSF_AUTH_PASS }) });
      const setCookie = login.response.headers.get('set-cookie'); need(login.status === 200 && login.value?.ok === true && setCookie?.includes('HttpOnly') && setCookie?.includes('SameSite=Lax'), 'AUTH_LOGIN_OR_COOKIE_INVALID');
      cookie = setCookie.split(';')[0];
      const headers = { 'content-type': 'application/json', cookie }, name = 'Jarvis isolated validation ' + randomUUID();
      const create = await request('/api/projects', { method: 'POST', headers, body: JSON.stringify({ name, description: 'isolated candidate write-readback' }) }); need([200, 201].includes(create.status) && /^[a-f0-9-]{36}$/.test(create.value?.id ?? ''), 'PROJECT_CREATE_FAILED');
      const id = create.value.id, first = await request('/api/projects/' + id, { headers }); need(first.status === 200 && first.value?.name === name, 'PROJECT_CREATE_READBACK_FAILED');
      const updated = name + ' updated', update = await request('/api/projects/' + id, { method: 'PUT', headers, body: JSON.stringify({ name: updated, description: 'verified update' }) }); need([200, 201].includes(update.status), 'PROJECT_UPDATE_FAILED');
      const second = await request('/api/projects/' + id, { headers }); need(second.value?.name === updated && second.value.description === 'verified update', 'PROJECT_UPDATE_READBACK_FAILED');
      const archived = await request('/api/projects/' + id + '/archive', { method: 'POST', headers, body: '{}' }); need([200, 201].includes(archived.status), 'PROJECT_ARCHIVE_FAILED');
      const third = await request('/api/projects/' + id, { headers }); need(third.value?.status === 'archived', 'PROJECT_ARCHIVE_READBACK_FAILED');
      return { anonymousRejected: true, invalidLoginRejected: true, loginConfirmed: true, createReadback: true, updateReadback: true, archiveReadback: true, projectId: id, privateCredentialsExported: false };
    });
    await functionCheck('frontend', ['installed-package-html-assets-and-real-browser'], async () => {
      need(cookie, 'FRONTEND_AUTH_NOT_READY');
      const html = await request('/'); need(html.status === 200 && html.text.includes('id="root"'), 'FRONTEND_HTML_MISSING');
      const assets = [...html.text.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(v => v[1]); need(assets.some(v => v.endsWith('.js')) && assets.some(v => v.endsWith('.css')), 'FRONTEND_ASSETS_MISSING');
      const assetProof = [];
      for (const path of new Set(assets)) { const r = await fetch('http://127.0.0.1:18930' + path, { signal: AbortSignal.timeout(10000) }), bytes = Buffer.from(await r.arrayBuffer()), local = await readFile(join(WORK, 'apps/web/dist', path)); need(r.status === 200 && sha(bytes) === sha(local), 'FRONTEND_ASSET_BYTES_MISMATCH'); assetProof.push({ path, sha256: sha(bytes), bytes: bytes.length }); }
      const result = await processCheck('browser-smoke', process.execPath, ['/tools/project-autonomy-fa01-browser.mjs'], { timeoutMs: 120000, childEnv: { ...env(), JARVIS_VALIDATION_COOKIE: cookie.slice('msf_auth='.length) } }); need(result.status === 'pass', 'BROWSER_SMOKE_FAILED');
      const raw = await readFile(join(OUTPUT, 'browser-smoke.log'), 'utf8'), proof = JSON.parse(raw.trim().split(/\r?\n/).at(-1)); need(proof.ok === true && proof.screenshotBase64, 'BROWSER_PROOF_MISSING');
      const image = Buffer.from(proof.screenshotBase64, 'base64'); need(image.length > 1000 && image.length <= 4 * 1024 * 1024, 'BROWSER_SCREENSHOT_INVALID');
      await writeFile(join(OUTPUT, 'frontend.png'), image, { mode: 0o600 }); artifacts.push({ name: 'frontend.png', sha256: sha(image), bytes: image.length });
      return { htmlSha256: sha(html.text), assets: assetProof, rendered: proof.checks, screenshotSha256: sha(image) };
    });
    if (process.env.JARVIS_PHASE_CONTRACT_REQUIRED === '1') {
      process.stdout.write(JSON.stringify({ type: 'execution.progress', phase: 'phase-contract-ready', ok: true }) + '\n');
      let confirmed = false;
      for (let attempt = 0; attempt < 480; attempt++) {
        need(!cancelled, 'VALIDATION_CANCELLED');
        try {
          const marker = JSON.parse(await readFile(join(OUTPUT, 'phase-contract-complete.json'), 'utf8'));
          need(marker.runId === process.env.JARVIS_AUTONOMY_RUN_ID && marker.sourceFingerprint === process.env.JARVIS_SOURCE_SHA256 && marker.workPackage === process.env.JARVIS_WORK_PACKAGE, 'PHASE_COMPLETION_IDENTITY_MISMATCH');
          confirmed = true; break;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      need(confirmed, 'TRUSTED_PHASE_CONTRACT_NOT_COMPLETED');
    }
  } finally { try { await stop(); } finally { children.delete(server); await log.close(); } }
}

if (process.argv[1] === '/tools/project-autonomy-fa01-collector.mjs') main().then(save).catch(async error => { problems.push({ id: 'collector', errorCode: cleanCode(error) }); try { await stop(); } catch { problems.push({ id: 'collector', errorCode: 'COLLECTOR_PROCESS_STOP_UNCONFIRMED' }); } await save(); process.exitCode = 1; });
