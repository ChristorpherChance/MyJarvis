#!/usr/bin/env node
/** Fixed-policy verification. Model prose cannot turn missing evidence into pass.
 * Production CLI is Linux/root-only; actual product commands always drop to the
 * policy user. The exported function accepts fixture IO for local tests only;
 * neither the privileged wrapper nor this CLI expose that override.
 */
import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { chmod, lstat, mkdir, open, readFile, realpath } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const executeFile = promisify(execFile);
const SELF = fileURLToPath(import.meta.url);
const EVIDENCE_HELPER = join(dirname(SELF), 'project-autonomy-evidence.py');
const PUBLIC_REPORT_ROOT = '/var/lib/jarvis-development/101/autonomy-public';
export const REQUIRED_CHECKS = Object.freeze(['source-stability', 'build', 'typecheck', 'tests', 'package', 'isolated-health', 'frontend', 'write-readback']);
const HASH = /^[a-f0-9]{64}$/;
const RUN = /^(?:[a-f0-9]{40}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/;
const PACKAGE = /^FA-?\d{2}$/;
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const PRIVATE = /(?:^|[\\/])(?:\.secrets|\.claude|\.codex|\.cc-switch|data|uploads|recordings|sessions)(?:[\\/]|$)|(?:^|[\\/])\.env[^\\/]*$|\.(?:pem|key|p12|pfx)$/i;
const ENV_KEYS = new Set(['PATH', 'LANG', 'LC_ALL', 'CI', 'NODE_ENV', 'TZ', 'HOME', 'XDG_CACHE_HOME', 'PNPM_HOME', 'COREPACK_ENABLE_NETWORK', 'npm_config_cache']);
const TOKENS = new Set(['workspace', 'evidenceDir', 'runId', 'goalSpecHash', 'workPackage']);
const sha = body => createHash('sha256').update(body).digest('hex');
const now = () => new Date().toISOString();
const errorCode = error => /^[A-Z][A-Z0-9_]{2,80}$/.test(error?.message ?? '') ? error.message : 'VALIDATION_IO_FAILED';
function requireValue(value, code) { if (!value) throw new Error(code); }
function cleanAbsolute(value) { return typeof value === 'string' && isAbsolute(value) && resolve(value) === value && !value.includes('\0'); }
function within(root, target) { const rel = relative(root, target); return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)); }
function safeRelative(value) { return typeof value === 'string' && value.length > 0 && value.length <= 400 && !isAbsolute(value) && !value.split(/[\\/]/).some(v => !v || v === '..' || v === '.') && !PRIVATE.test(value); }
function render(value, context) {
  requireValue(typeof value === 'string' && value.length <= 4096 && !value.includes('\0'), 'POLICY_ARGUMENT_INVALID');
  return value.replace(/\{([A-Za-z][A-Za-z0-9_-]*)\}/g, (_, token) => { requireValue(TOKENS.has(token), 'POLICY_TOKEN_INVALID'); return context[token]; });
}

export function validatePolicy(policy, input) {
  requireValue(policy?.schemaVersion === 1 && policy.kind === 'project-autonomy-policy', 'POLICY_FORMAT_INVALID');
  requireValue(PACKAGE.test(input.workPackage) && RUN.test(input.runId) && HASH.test(input.goalSpecHash), 'VALIDATION_IDENTITY_INVALID');
  requireValue(cleanAbsolute(input.workspace), 'WORKSPACE_PATH_INVALID');
  requireValue(policy.workPackage === input.workPackage && policy.goalSpecHash === input.goalSpecHash, 'POLICY_IDENTITY_MISMATCH');
  requireValue(cleanAbsolute(policy.evidenceRoot) && !within(input.workspace, policy.evidenceRoot) && !within(policy.evidenceRoot, input.workspace), 'EVIDENCE_ROOT_INVALID');
  requireValue((!!policy.workspace) !== (!!policy.workspaceRoot), 'POLICY_WORKSPACE_INVALID');
  if (policy.workspace) requireValue(cleanAbsolute(policy.workspace) && input.workspace === policy.workspace, 'WORKSPACE_NOT_APPROVED');
  else requireValue(cleanAbsolute(policy.workspaceRoot) && input.workspace === join(policy.workspaceRoot, input.runId, 'source'), 'WORKSPACE_NOT_APPROVED');
  requireValue(typeof policy.runAsUser === 'string' && /^[a-z_][a-z0-9_-]{0,31}$/.test(policy.runAsUser) && policy.runAsUser !== 'root', 'POLICY_EXECUTION_USER_INVALID');
  requireValue(Array.isArray(policy.expectedChecks) && policy.expectedChecks.length <= 40 && new Set(policy.expectedChecks).size === policy.expectedChecks.length && policy.expectedChecks.every(v => ID.test(v)), 'POLICY_EXPECTED_CHECKS_INVALID');
  // Full candidate verification is the supported stage gate. Future stage
  // policies can add checks; they cannot silently remove the common floor.
  const floor = /^FA-?01$/.test(input.workPackage) ? REQUIRED_CHECKS : ['source-stability', 'tests'];
  requireValue(floor.every(v => policy.expectedChecks.includes(v)), 'POLICY_REQUIRED_CHECK_MISSING');
  requireValue(/^FA-?01$/.test(input.workPackage) || policy.expectedChecks.some(v => v !== 'source-stability' && v !== 'tests'), 'POLICY_PHASE_CONTRACT_MISSING');
  if (!/^FA-?01$/.test(input.workPackage)) requireValue(Array.isArray(policy.contractChecks) && policy.contractChecks.length > 0 && policy.contractChecks.every(v => policy.expectedChecks.includes(v) && !REQUIRED_CHECKS.includes(v)), 'POLICY_PHASE_CONTRACT_MISSING');
  requireValue(Array.isArray(policy.checks) && policy.checks.length <= 40 && new Set(policy.checks.map(v => v.id)).size === policy.checks.length, 'POLICY_CHECKS_INVALID');
  requireValue(policy.checks.every(v => policy.expectedChecks.includes(v.id) && v.id !== 'source-stability'), 'POLICY_UNEXPECTED_CHECK');
  const earlier = new Set();
  for (const check of policy.checks) {
    requireValue(ID.test(check.id) && check.required === true && cleanAbsolute(check.program), 'POLICY_CHECK_INVALID');
    requireValue(Array.isArray(check.args) && check.args.length <= 100, 'POLICY_ARGUMENT_INVALID');
    for (const value of check.args) {
      render(value, { workspace: input.workspace, evidenceDir: policy.evidenceRoot, ...input });
      // Command is public metadata. Secrets belong in a private isolated adapter
      // input, never in argv or the exported report.
      requireValue(!/(?:--(?:api[-_]?key|password|access[-_]?token)|Bearer\s|https?:\/\/[^/\s]+:[^/\s]+@)/i.test(value), 'POLICY_SECRET_ARGUMENT_REFUSED');
    }
    requireValue(check.cwd === undefined || check.cwd === '{workspace}', 'POLICY_CWD_INVALID');
    requireValue(Number.isInteger(check.timeoutSec) && check.timeoutSec >= 1 && check.timeoutSec <= 7200, 'POLICY_TIMEOUT_INVALID');
    if (check.dependsOn !== undefined) requireValue(Array.isArray(check.dependsOn) && check.dependsOn.every(v => earlier.has(v)), 'POLICY_DEPENDENCY_INVALID');
    if (check.testReport) {
      requireValue(safeRelative(check.testReport.path) && ['standard-json', 'vitest-json'].includes(check.testReport.format), 'POLICY_TEST_REPORT_INVALID');
      requireValue(Number.isInteger(check.testReport.minTotal) && check.testReport.minTotal >= 1, 'POLICY_TEST_REPORT_INVALID');
    }
    if (check.id === 'tests') requireValue(!!check.testReport, 'POLICY_TEST_REPORT_REQUIRED');
    if (check.artifacts !== undefined) requireValue(Array.isArray(check.artifacts) && check.artifacts.length <= 40 && check.artifacts.every(safeRelative), 'POLICY_ARTIFACT_INVALID');
    if (check.id === 'package') requireValue(check.artifacts?.length > 0, 'POLICY_PACKAGE_ARTIFACT_REQUIRED');
    earlier.add(check.id);
  }
  requireValue(policy.artifacts === undefined || (Array.isArray(policy.artifacts) && policy.artifacts.length <= 40 && policy.artifacts.every(safeRelative)), 'POLICY_ARTIFACT_INVALID');
  requireValue(policy.trustedFiles === undefined || (Array.isArray(policy.trustedFiles) && policy.trustedFiles.length <= 80 && policy.trustedFiles.every(cleanAbsolute)), 'POLICY_TRUSTED_FILES_INVALID');
  requireValue(policy.maxTotalSec === undefined || (Number.isInteger(policy.maxTotalSec) && policy.maxTotalSec >= 1 && policy.maxTotalSec <= 3600), 'POLICY_TOTAL_TIMEOUT_INVALID');
  requireValue(policy.env === undefined || (typeof policy.env === 'object' && policy.env !== null && Object.entries(policy.env).every(([key, value]) => ENV_KEYS.has(key) && typeof value === 'string' && value.length <= 4096 && !value.includes('\0'))), 'POLICY_ENV_INVALID');
  return policy;
}

export function parseTests(value, format, minTotal = 1) {
  let tests;
  if (format === 'standard-json') tests = Object.fromEntries(['total', 'passed', 'failed', 'skipped', 'unknown'].map(key => [key, value?.[key]]));
  else if (format === 'vitest-json') {
    tests = { total: value?.numTotalTests, passed: value?.numPassedTests, failed: value?.numFailedTests, skipped: value?.numPendingTests, unknown: 0 };
    requireValue(value?.success === true, 'TEST_REPORT_UNSUCCESSFUL');
    if (Number.isInteger(tests.total) && Number.isInteger(tests.passed) && Number.isInteger(tests.failed) && Number.isInteger(tests.skipped)) tests.unknown = tests.total - tests.passed - tests.failed - tests.skipped;
  } else throw new Error('TEST_REPORT_FORMAT_INVALID');
  requireValue(Object.values(tests).every(v => Number.isInteger(v) && v >= 0), 'TEST_COUNTS_INVALID');
  requireValue(tests.total === tests.passed + tests.failed + tests.skipped + tests.unknown, 'TEST_COUNTS_INCONSISTENT');
  requireValue(tests.total >= minTotal, 'TEST_DENOMINATOR_EMPTY');
  return tests;
}

async function trusted(path, options = {}) {
  requireValue(process.platform === 'linux' && process.geteuid?.() === 0, 'VALIDATOR_ROOT_REQUIRED');
  requireValue(cleanAbsolute(path), 'TRUST_PATH_INVALID');
  let cursor = path;
  while (true) {
    const info = await lstat(cursor);
    requireValue(!info.isSymbolicLink() && info.uid === 0 && (info.mode & 0o022) === 0, 'VALIDATOR_TRUST_BOUNDARY_INVALID');
    if (cursor === path && options.private) requireValue((info.mode & 0o077) === 0, 'EVIDENCE_DIRECTORY_NOT_PRIVATE');
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  if (options.regular) requireValue((await lstat(path)).isFile(), 'TRUST_FILE_INVALID');
}

async function secureJSON(path, value) {
  const fd = await open(path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
  try { await fd.writeFile(JSON.stringify(value, null, 2) + '\n'); await fd.sync(); } finally { await fd.close(); }
}

async function publishProtocol(text) {
  await trusted(dirname(PUBLIC_REPORT_ROOT));
  await mkdir(PUBLIC_REPORT_ROOT, { mode: 0o755 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  await trusted(PUBLIC_REPORT_ROOT);
  await chmod(PUBLIC_REPORT_ROOT, 0o755);
  const path = join(PUBLIC_REPORT_ROOT, sha(text) + '.json');
  let fd;
  try { fd = await open(path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o644); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    await trusted(path, { regular: true });
    requireValue(await readFile(path, 'utf8') === text, 'PUBLIC_REPORT_IDENTITY_CONFLICT');
    return;
  }
  try { await fd.writeFile(text); await fd.chmod(0o644); await fd.sync(); } finally { await fd.close(); }
}

async function helper(operation, args) {
  const python = await realpath('/usr/bin/python3');
  await trusted(python, { regular: true });
  const result = await executeFile(python, [EVIDENCE_HELPER, operation, ...args], { timeout: 60000, maxBuffer: 16 * 1024 * 1024, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } });
  const value = JSON.parse(result.stdout);
  requireValue(value.ok !== false, value.error ?? 'EVIDENCE_IO_FAILED');
  return value;
}

async function productionCommand(check, context, policy, logPath) {
  await trusted(check.program, { regular: true });
  await trusted('/usr/sbin/runuser', { regular: true });
  const args = check.args.map(value => render(value, context));
  const env = { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', CI: '1', ...policy.env };
  const log = await open(logPath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
  const startedAt = now();
  let child;
  let timer;
  let sizeTimer;
  let timedOut = false;
  let outputLimited = false;
  let cancelled = false;
  let kill;
  const cancel = () => { cancelled = true; context.deadlineAt = 0; kill?.(); };
  // The root process owns evidence; only the command receives user privileges.
  // The fixed policy must use a disposable, isolated validation environment for
  // commands which start services. This runner does not grant a Docker socket.
  try {
    process.once('SIGTERM', cancel);
    process.once('SIGINT', cancel);
    const outcome = await new Promise((accept, reject) => {
      child = spawn('/usr/sbin/runuser', ['--user', policy.runAsUser, '--', check.program, ...args], { cwd: context.workspace, env, shell: false, detached: true, stdio: ['ignore', log.fd, log.fd] });
      kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
      timer = setTimeout(() => { timedOut = true; kill(); }, Math.min(check.timeoutSec * 1000, Math.max(1, context.deadlineAt - Date.now())));
      sizeTimer = setInterval(async () => { try { if ((await log.stat()).size > 16 * 1024 * 1024) { outputLimited = true; kill(); } } catch {} }, 200);
      child.once('error', reject);
      child.once('close', (exitCode, signal) => accept({ exitCode, signal }));
    });
    await log.sync();
    return { ...outcome, startedAt, finishedAt: now(), timedOut, outputLimited, cancelled };
  } finally { process.off('SIGTERM', cancel); process.off('SIGINT', cancel); clearTimeout(timer); clearInterval(sizeTimer); kill?.(); await log.close(); }
}

function blockedCheck(id, reason) {
  return { id, required: true, command: JSON.stringify(['fixed-policy-check', id]), executed: false, status: 'unknown', exitCode: null, evidenceSha256: sha(JSON.stringify({ id, reason, executed: false })), errorCode: reason };
}

/** Only this public, strictly bounded protocol is returned to the central API.
 * Raw output, private paths, error details and timings remain in the root spool.
 */
export function protocolReport(detail) {
  const keys = ['schemaVersion', 'kind', 'runId', 'workspace', 'goalSpecHash', 'workPackage', 'sourceFingerprint', 'sourceStable', 'status', 'simulated', 'startedAt', 'finishedAt'];
  const report = Object.fromEntries(keys.map(key => [key, detail[key]]));
  report.checks = detail.checks.map(check => Object.fromEntries(['id', 'required', 'command', 'executed', 'status', 'exitCode', 'evidenceSha256', ...(check.tests ? ['tests'] : [])].map(key => [key, check[key]])));
  report.artifacts = detail.artifacts.map(artifact => ({ path: artifact.publicPath, sha256: artifact.sha256, bytes: artifact.bytes }));
  return report;
}

/** The IO argument is deliberately available only to imported fixture tests.
 * Production CLI always constructs immutable productionIO, never policy IO.
 */
export async function runValidation(input, policy, io) {
  const startedAt = now();
  const report = { schemaVersion: 1, kind: 'project-autonomy-validation', runId: input.runId, workspace: input.workspace,
    goalSpecHash: input.goalSpecHash, workPackage: input.workPackage, sourceFingerprint: null, sourceStable: false,
    status: 'fail', simulated: false, startedAt, finishedAt: null, checks: [], artifacts: [],
    errorCodes: [] };
  let context;
  let before;
  const checksById = new Map();
  try {
    validatePolicy(policy, input);
    requireValue(io && ['fingerprint', 'command', 'readJSON', 'artifact', 'prepare', 'writeJSON', 'hashLog'].every(key => typeof io[key] === 'function'), 'VALIDATION_IO_MISSING');
    // Unique attempt folders avoid overwriting previous failure or retry proof.
    const evidenceDir = join(policy.evidenceRoot, input.runId, randomUUID());
    await io.prepare(evidenceDir, policy);
    context = { ...input, evidenceDir, deadlineAt: Date.parse(startedAt) + (policy.maxTotalSec ?? 1200) * 1000 };
    report.evidenceDir = evidenceDir;
    report.policyHash = sha(JSON.stringify(policy));
    before = await io.fingerprint(input.workspace);
    requireValue(HASH.test(before.sha256) && before.files > 0, 'SOURCE_FINGERPRINT_INVALID');
    report.sourceFingerprint = before.sha256;
    report.sourceFiles = before.files;
    await io.writeJSON(join(evidenceDir, 'source-before.json'), before);
    for (const id of policy.expectedChecks.filter(value => value !== 'source-stability')) {
      const check = policy.checks.find(value => value.id === id);
      let result;
      if (!check) result = blockedCheck(id, 'FIXED_CHECK_NOT_CONFIGURED');
      else if (Date.now() >= context.deadlineAt) result = blockedCheck(id, 'VALIDATION_TOTAL_TIMEOUT');
      else if ((check.dependsOn ?? []).some(dependency => checksById.get(dependency)?.status !== 'pass')) result = blockedCheck(id, 'DEPENDENCY_NOT_PASSED');
      else {
        const args = check.args.map(value => render(value, context));
        requireValue(JSON.stringify([check.program, ...args]).length <= 4000, 'POLICY_COMMAND_METADATA_LIMIT');
        result = { id, required: true, command: JSON.stringify([check.program, ...args]), executed: false, status: 'fail', exitCode: null, evidenceSha256: null };
        const logPath = join(evidenceDir, `${id}.log`);
        try {
          let oldTestReport;
          if (check.testReport) { try { oldTestReport = await io.readJSON(input.workspace, check.testReport.path); } catch {} }
          const execution = await io.command(check, context, policy, logPath);
          result.executed = true;
          Object.assign(result, execution);
          result.evidenceSha256 = (await io.hashLog(logPath)).sha256;
          result.status = execution.exitCode === 0 && !execution.signal && !execution.timedOut && !execution.outputLimited && !execution.cancelled ? 'pass' : 'fail';
          if (check.testReport) {
            const proof = await io.readJSON(input.workspace, check.testReport.path);
            requireValue(Number.isFinite(proof.mtimeMs) && proof.mtimeMs >= Date.parse(execution.startedAt), 'TEST_REPORT_NOT_FRESH');
            requireValue(!oldTestReport || proof.mtimeNs !== oldTestReport.mtimeNs || proof.inode !== oldTestReport.inode, 'TEST_REPORT_NOT_REWRITTEN');
            await io.writeJSON(join(evidenceDir, `${id}-test-report.json`), proof);
            result.tests = parseTests(proof.value, check.testReport.format, check.testReport.minTotal);
            result.testReportSha256 = proof.sha256;
            if (result.tests.failed || result.tests.skipped || result.tests.unknown) { result.status = 'fail'; result.errorCode = 'REQUIRED_TESTS_NOT_ALL_PASSED'; }
          }
          if (result.status === 'pass') {
            for (const sourcePath of check.artifacts ?? []) {
              const snapshotName = `artifact-${report.artifacts.length}.bin`;
              report.artifacts.push({ ...await io.artifact(input.workspace, sourcePath, join(evidenceDir, snapshotName)), publicPath: sourcePath });
            }
          }
        } catch (error) { result.status = 'fail'; result.errorCode = errorCode(error); }
      }
      checksById.set(id, result);
      report.checks.push(result);
    }
    // Package/health/frontend/write-readback have fixed commands just like
    // build/tests. A text report produced by the model is never an adapter.
    for (const sourcePath of policy.artifacts ?? []) {
      try { const snapshotName = `artifact-${report.artifacts.length}.bin`; report.artifacts.push({ ...await io.artifact(input.workspace, sourcePath, join(evidenceDir, snapshotName)), publicPath: sourcePath }); }
      catch (error) { report.errorCodes.push(errorCode(error)); }
    }
  } catch (error) { report.errorCodes.push(errorCode(error)); }
  if (context && before) {
    try {
      const after = await io.fingerprint(input.workspace);
      await io.writeJSON(join(context.evidenceDir, 'source-after.json'), after);
      report.sourceAfterFingerprint = after.sha256;
      report.sourceStable = before.sha256 === after.sha256;
      report.checks.push({ id: 'source-stability', required: true,
        command: JSON.stringify(['public-source-sha256', input.workspace, 'before-and-after']), executed: true,
        status: report.sourceStable ? 'pass' : 'fail', exitCode: report.sourceStable ? 0 : 1,
        evidenceSha256: sha(JSON.stringify({ before: before.sha256, after: after.sha256 })),
        ...(report.sourceStable ? {} : { errorCode: 'SOURCE_CHANGED_DURING_VALIDATION' }) });
    } catch (error) { report.checks.push(blockedCheck('source-stability', errorCode(error))); }
  }
  const floor = /^FA-?01$/.test(input.workPackage) ? REQUIRED_CHECKS : ['source-stability', 'tests'];
  const expected = Array.isArray(policy?.expectedChecks) ? new Set([...floor, ...policy.expectedChecks]) : new Set(floor);
  for (const id of expected) if (!report.checks.some(check => check.id === id)) report.checks.push(blockedCheck(id, 'VALIDATION_NOT_EXECUTED'));
  if (new Set(report.artifacts.map(artifact => artifact.publicPath)).size !== report.artifacts.length) report.errorCodes.push('DUPLICATE_ARTIFACT');
  for (const check of report.checks) if (!HASH.test(check.evidenceSha256 ?? '')) check.evidenceSha256 = sha(JSON.stringify({ id: check.id, executed: check.executed, errorCode: check.errorCode ?? 'CHECK_EVIDENCE_MISSING' }));
  report.status = report.errorCodes.length === 0 && report.sourceStable && report.artifacts.length > 0 && [...expected].every(id => report.checks.some(check => check.id === id && check.required && check.executed && check.status === 'pass' && check.exitCode === 0 && HASH.test(check.evidenceSha256 ?? ''))) ? 'pass' : 'fail';
  report.finishedAt = now();
  const output = protocolReport(report);
  if (context) { await io.writeJSON(join(context.evidenceDir, 'detailed-report.json'), report); await io.writeJSON(join(context.evidenceDir, 'validation-report.json'), output); }
  return output;
}

const productionIO = {
  async prepare(evidenceDir, policy) {
    await trusted(SELF, { regular: true });
    await trusted(process.execPath, { regular: true });
    await trusted(EVIDENCE_HELPER, { regular: true });
    await trusted(await realpath('/usr/bin/python3'), { regular: true });
    for (const file of policy.trustedFiles ?? []) await trusted(file, { regular: true });
    await trusted(policy.evidenceRoot, { private: true });
    await mkdir(dirname(evidenceDir), { mode: 0o700, recursive: true });
    await trusted(dirname(evidenceDir), { private: true });
    await mkdir(evidenceDir, { mode: 0o700 });
    await trusted(evidenceDir, { private: true });
  },
  fingerprint: workspace => helper('fingerprint', [workspace]),
  command: productionCommand,
  readJSON: (workspace, path) => helper('read-json', [workspace, path]),
  artifact: (workspace, sourcePath, destination) => helper('artifact', [workspace, sourcePath, destination]),
  writeJSON: secureJSON,
  async hashLog(path) { const fd = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)); try { const body = await fd.readFile(); return { sha256: sha(body), bytes: body.length }; } finally { await fd.close(); } },
};

export async function cli(args = process.argv.slice(2)) {
  const options = {};
  requireValue(args.length === 10, 'VALIDATION_ARGUMENTS_INVALID');
  for (let index = 0; index < args.length; index += 2) {
    requireValue(['--policy', '--workspace', '--run-id', '--goal-spec-hash', '--work-package'].includes(args[index]) && options[args[index]] === undefined, 'VALIDATION_ARGUMENTS_INVALID');
    options[args[index]] = args[index + 1];
  }
  await trusted(SELF, { regular: true });
  await trusted(options['--policy'], { regular: true });
  const policy = JSON.parse(await readFile(options['--policy'], 'utf8'));
  const report = await runValidation({ workspace: options['--workspace'], runId: options['--run-id'], goalSpecHash: options['--goal-spec-hash'], workPackage: options['--work-package'] }, policy, productionIO);
  const bytes = JSON.stringify(report);
  await publishProtocol(bytes);
  process.stdout.write(bytes + '\n');
  return report.status === 'pass' ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) cli().then(code => { process.exitCode = code; }).catch(error => {
  process.stdout.write(JSON.stringify({ schemaVersion: 1, kind: 'project-autonomy-validation', status: 'fail', simulated: false, errorCode: errorCode(error) }) + '\n');
  process.exitCode = 2;
});
