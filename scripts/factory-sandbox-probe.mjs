/** Supplemental six-function check with the current real image, separate from original Vitest. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const WORK = '/work/source';
const runId = process.env.JARVIS_FULL_TEST_RUN_ID;
const sourceSHA256 = process.env.JARVIS_SOURCE_SHA256;
const network = `jarvis-ft-${runId}-sandbox-net`;
const PIN = Object.freeze({ tag: 'alpine:3.20', digest: 'sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc' });
const originalTestPIN = 'sha256:bf8527eb54c3680e728d5b4b383a8ba730d72dae7236fbc8dff97ed6b224a731';
if (
  process.cwd() !== WORK || process.getuid?.() !== 1000 ||
  !/^[0-9a-f]{40}$/.test(runId ?? '') || !/^[0-9a-f]{64}$/.test(sourceSHA256 ?? '') ||
  process.env.JARVIS_SANDBOX_FIXTURE_READY !== '1' ||
  process.env.MSF_SANDBOX_NETWORK !== network ||
  (process.env.MSF_SANDBOX_CONCURRENCY ?? '2') !== '2'
) throw Error('ISOLATED_SANDBOX_PROBE_REQUIRED');

const sha256 = data => createHash('sha256').update(data).digest('hex');
const report = {
  formatVersion: 1, runId, sourceSHA256, at: new Date().toISOString(),
  scope: 'Supplemental actual SandboxService six functions with the independently inspected real image; never substitutes or changes original Vitest assertions/statistics.',
  modelsInvoked: false, productionDatabaseUsed: false, sourceCodeChanged: false,
  originalFailedAssertionsUnchanged: true, includedInOriginalTestCounts: false,
  productDeliveryAccepted: false, originalTestPIN, supplementalPIN: PIN,
  fixedPrivateNetwork: network, sourceFiles: [], socket: null,
  serviceAvailable: false, cases: [], probePassed: false, errors: [],
  cleanup: { serviceFinallyExpectedForCreatedContainers: true, brokerFinallyRequired: true, independentlyConfirmed: false },
};
const publicDomainCodes = new Set(['SANDBOX_SPEC_INVALID', 'SANDBOX_QUOTA_EXCEEDED', 'EXECUTION_TIMEOUT']);
const outcome = async promise => {
  try { return { succeeded: true, result: await promise }; }
  catch (error) { return { succeeded: false, domainCode: publicDomainCodes.has(error?.code) ? error.code : null }; }
};
const evidence = result => ({
  exitCode: result.exitCode,
  imageDigest: result.imageDigest,
  envFingerprint: result.envFingerprint,
  durationMs: result.durationMs,
  logBytes: Buffer.byteLength(result.logs),
  logSHA256: sha256(result.logs),
});
const addCase = async (name, action) => {
  const started = Date.now();
  const row = { name, attempted: true, passed: false, durationMs: null, observations: null };
  report.cases.push(row);
  try { row.observations = await action(); row.passed = true; }
  catch { row.errorCode = 'SUPPLEMENTAL_ASSERTION_FAILED'; }
  row.durationMs = Date.now() - started;
};
let previousManifest = process.env.MSF_SANDBOX_IMAGES;

try {
  const socket = await lstat('/var/run/docker.sock');
  assert(socket.isSocket() && socket.uid === 1000 && (socket.mode & 0o777) === 0o600);
  report.socket = { unixSocket: true, uid: socket.uid, permissions: '0600', expectedMount: 'per-run broker socket, never host daemon socket' };
  for (const path of [
    'apps/server/src/modules/executor/sandbox.service.ts',
    'apps/server/src/modules/executor/sandbox.integration.test.ts',
    'apps/server/dist/modules/executor/sandbox.service.js',
  ]) report.sourceFiles.push({ path, sha256: sha256(await readFile(join(WORK, path))) });
  const original = await readFile(join(WORK, 'apps/server/src/modules/executor/sandbox.integration.test.ts'), 'utf8');
  assert(original.includes(originalTestPIN));
  process.env.MSF_SANDBOX_IMAGES = JSON.stringify([PIN]);
  const { SandboxService } = await import(pathToFileURL(join(WORK, 'apps/server/dist/modules/executor/sandbox.service.js')).href);
  const sandbox = new SandboxService();
  assert.deepEqual(sandbox.manifest(), [PIN]);
  report.serviceAvailable = await sandbox.available();
  assert(report.serviceAvailable);

  await addCase('non-manifest-image-refused', async () => {
    const result = await outcome(sandbox.runOnce({ image: 'alpine:3.19', cmd: ['true'] }));
    assert(!result.succeeded && result.domainCode === 'SANDBOX_SPEC_INVALID');
    return { rejectedWith: result.domainCode };
  });
  await addCase('exit-log-environment-image-evidence', async () => {
    const result = await sandbox.runOnce({ image: PIN.tag, cmd: ['sh', '-c', 'echo hello-sandbox'] });
    assert.equal(result.exitCode, 0); assert(result.logs.includes('hello-sandbox'));
    assert.equal(result.imageDigest, PIN.digest); assert.match(result.envFingerprint, /^[0-9a-f]{64}$/);
    const expected = sha256(JSON.stringify({ digest: PIN.digest, memoryMb: 256, cpu: 0.5, network, readonly: true }));
    assert.equal(result.envFingerprint, expected);
    return { ...evidence(result), expectedEnvironmentFingerprintMatches: true };
  });
  await addCase('external-egress-refused', async () => {
    const result = await sandbox.runOnce({ image: PIN.tag,
      cmd: ['wget', '-T', '3', '-q', '-O', '-', 'http://example.com/'], limits: { timeoutMs: 15000 } });
    assert.notEqual(result.exitCode, 0);
    return { ...evidence(result), outboundCommandFailed: true };
  });
  await addCase('root-readonly-tmpfs-writable', async () => {
    const result = await sandbox.runOnce({ image: PIN.tag,
      cmd: ['sh', '-c', 'touch /x 2>/dev/null; echo root=$?; touch /tmp/y; echo tmp=$?'] });
    assert(result.logs.includes('root=1')); assert(result.logs.includes('tmp=0'));
    return { ...evidence(result), rootWriteRefused: true, tmpfsWriteSucceeded: true };
  });
  await addCase('timeout-kill-domain-error', async () => {
    const result = await outcome(sandbox.runOnce({ image: PIN.tag, cmd: ['sleep', '30'], limits: { timeoutMs: 1000 } }));
    assert(!result.succeeded && result.domainCode === 'EXECUTION_TIMEOUT');
    return { rejectedWith: result.domainCode };
  });
  await addCase('two-concurrent-third-quota-refused', async () => {
    // Attach rejection handlers immediately; a genuine service failure must not become an unhandled promise.
    const p1 = outcome(sandbox.runOnce({ image: PIN.tag, cmd: ['sleep', '5'] }));
    const p2 = outcome(sandbox.runOnce({ image: PIN.tag, cmd: ['sleep', '5'] }));
    await new Promise(resolve => setTimeout(resolve, 500));
    const third = await outcome(sandbox.runOnce({ image: PIN.tag, cmd: ['true'] }));
    const [first, second] = await Promise.all([p1, p2]);
    assert(!third.succeeded && third.domainCode === 'SANDBOX_QUOTA_EXCEEDED');
    assert(first.succeeded && second.succeeded);
    assert.equal(first.result.exitCode, 0); assert.equal(second.result.exitCode, 0);
    return { thirdRejectedWith: third.domainCode, first: evidence(first.result), second: evidence(second.result), admissionDelayMs: 500 };
  });
} catch {
  report.errors.push({ code: 'SUPPLEMENTAL_SANDBOX_SETUP_OR_IMPORT_FAILED' });
} finally {
  if (previousManifest === undefined) delete process.env.MSF_SANDBOX_IMAGES;
  else process.env.MSF_SANDBOX_IMAGES = previousManifest;
  report.finishedAt = new Date().toISOString();
  report.counts = { attempted: report.cases.length, passed: report.cases.filter(row => row.passed).length,
    failed: report.cases.filter(row => !row.passed).length };
  report.probePassed = report.errors.length === 0 && report.serviceAvailable &&
    report.counts.attempted === 6 && report.counts.passed === 6;
  await writeFile('/evidence/sandbox-functional-probe.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}
process.stdout.write(JSON.stringify({ phase: 'supplemental-sandbox-functions', probePassed: report.probePassed, ...report.counts }) + '\n');
process.exitCode = report.probePassed ? 0 : 1;
