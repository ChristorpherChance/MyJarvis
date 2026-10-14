/** One finite self-only host feature read. Empty independent review refuses before IO. */
import {readFile, open, rename} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const sha = b => createHash('sha256').update(b).digest('hex');
const need = (v, code) => {if (!v) throw Error(code)};
const self = 'scripts/read-factory-kernel-fd-feature-r33.mjs';
const source = 'scripts/factory-kernel-fd-feature-r33.py';
const dependency = 'scripts/managed-server-client.mjs';
const dependencySHA256 = 'e287938e2d79b0335523d3d198bd93b588541866cebc2c21d997ae6fce5e4a9f';
const journal = '.jarvis-dev/maintenance/r33-kernel-fd-self-feature-once.json';
async function wx(path, v) {
 const bytes = Buffer.from(JSON.stringify(v, null, 2) + '\n');
 const f = await open(path, 'wx', 0o600);
 try {await f.writeFile(bytes); await f.sync()} finally {await f.close()}
 return {path, sha256: sha(bytes), bytes: bytes.length};
}
async function durableIntent(value) {
 const receipt = await wx(journal, value); // Exclusive reservation; a second caller refuses, even after a lost reply.
 const temp = journal + '.' + randomUUID() + '.tmp';
 const duplicate = await wx(temp, value);
 need(duplicate.sha256 === receipt.sha256, 'KERNEL_FEATURE_INTENT_CHANGED');
 if (process.platform === 'win32') {
  const r = spawnSync('python', ['-c', "import ctypes,sys;f=ctypes.WinDLL('kernel32',use_last_error=True).MoveFileExW;f.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p,ctypes.c_ulong];f.restype=ctypes.c_int;sys.exit(0 if f(sys.argv[1],sys.argv[2],9) else 1)", resolve(temp), resolve(journal)], {windowsHide: true, timeout: 10000});
  need(r.status === 0, 'KERNEL_FEATURE_LOCAL_DURABILITY_FAILED');
 } else {
  await rename(temp, journal);
  const directory = await open('.jarvis-dev/maintenance', 'r');
  try {await directory.sync()} finally {await directory.close()}
 }
 need(sha(await readFile(journal)) === receipt.sha256, 'KERNEL_FEATURE_INTENT_CHANGED');
 return receipt;
}
export async function readKernelSelfFeatureR33(reviewRef = null) {
 need(reviewRef && typeof reviewRef.path === 'string' && /^[a-f0-9]{64}$/.test(reviewRef.sha256), 'KERNEL_FEATURE_REVIEW_REQUIRED');
 const selfBytes = await readFile(self), sourceBytes = await readFile(source), dependencyBytes = await readFile(dependency);
 need(sha(dependencyBytes) === dependencySHA256, 'KERNEL_FEATURE_TRANSPORT_SOURCE_CHANGED');
 const reviewBytes = await readFile(reviewRef.path);
 need(sha(reviewBytes) === reviewRef.sha256, 'KERNEL_FEATURE_REVIEW_BYTES_CHANGED');
 const review = JSON.parse(reviewBytes);
 need(review.kind === 'r33-kernel-fd-self-feature-independent-local-review' && review.ready === true &&
      review.sourceSHA256 === sha(sourceBytes) && review.callerSHA256 === sha(selfBytes) && review.dependencySHA256 === sha(dependencyBytes) &&
      review.remoteOperationsPerformed === false && review.reviewScope === 'finite-self-only', 'KERNEL_FEATURE_REVIEW_SCOPE_MISMATCH');
 need(sha(await readFile(self)) === sha(selfBytes) && sha(await readFile(source)) === sha(sourceBytes) &&
      sha(await readFile(reviewRef.path)) === reviewRef.sha256 && sha(await readFile(dependency)) === sha(dependencyBytes), 'KERNEL_FEATURE_SOURCES_CHANGED');
 const {python, lanProfile} = await import('./managed-server-client.mjs');
 const intent = await durableIntent({
  kind: 'r33-kernel-fd-self-feature-intent', at: new Date().toISOString(), reviewRef,
  sourceSHA256: sha(sourceBytes), callerSHA256: sha(selfBytes), dependencySHA256: sha(dependencyBytes), selfOnly: true, maximumCalls: 1,
  programBudgetSeconds: 8, transportBudgetSeconds: 15, retries: 0, wholeCensusQualified: false
 });
 const r = spawnSync('ssh', ['-F', lanProfile, '-o', 'BatchMode=yes', 'jarvis-101', 'sudo -n python3 -'], {
  input: python({}, sourceBytes.toString('utf8')), windowsHide: true, timeout: 15000, maxBuffer: 20000
 });
 const stdout = Buffer.from(r.stdout ?? ''), stderr = Buffer.from(r.stderr ?? '');
 const raw = await wx('.jarvis-dev/maintenance/r33-kernel-fd-self-feature-private-' + Date.now() + '-' + randomUUID() + '.json', {
  status: r.status ?? null, stdoutBase64: stdout.toString('base64'), stderrBase64: stderr.toString('base64'),
  stdoutSHA256: sha(stdout), stderrSHA256: sha(stderr), intent, reviewRef,
  sourceSHA256: sha(sourceBytes), callerSHA256: sha(selfBytes), dependencySHA256: sha(dependencyBytes)
 });
 let v;
 try {v = JSON.parse(stdout)} catch {v = {readComplete: false, errorCode: 'KERNEL_FEATURE_RESPONSE_INCOMPLETE'}}
 const sourceUnchanged = sha(await readFile(self)) === sha(selfBytes) && sha(await readFile(source)) === sha(sourceBytes) && sha(await readFile(reviewRef.path)) === reviewRef.sha256 && sha(await readFile(dependency)) === sha(dependencyBytes);
 const complete = r.status === 0 && v.kind === 'r33-kernel-fd-self-feature' && v.readComplete === true && v.descriptorsClosed === true && sourceUnchanged;
 const publicEvidence = {
  kind: 'r33-kernel-fd-self-feature-result', at: new Date().toISOString(), ready: complete,
  kernelRelease: typeof v.kernelRelease === 'string' && /^[a-zA-Z0-9._+-]{1,100}$/.test(v.kernelRelease) ? v.kernelRelease : null,
  architecture: v.architecture === 'x86_64' ? v.architecture : null,
  callerIsolation: v.callerIsolation && /^[a-fA-F0-9]{1,16}$/.test(v.callerIsolation.CapEff) && /^[01]$/.test(v.callerIsolation.NoNewPrivs) && /^[012]$/.test(v.callerIsolation.Seccomp) ? v.callerIsolation : null,
  presentSlotErrno: Number.isSafeInteger(v.presentSlotErrno) ? v.presentSlotErrno : null,
  absentSlotErrno: Number.isSafeInteger(v.absentSlotErrno) ? v.absentSlotErrno : null,
  featureSupportedAndPermitted: complete && v.featureSupportedAndPermitted === true,
  selfSlotAbsenceProven: complete && v.selfSlotAbsenceProven === true,
  validSelfPidfdBoundThroughout: complete && v.validSelfPidfdBoundThroughout === true,
  selfOnly: true, ownedChildQualified: false, foreignProcessRead: false, sourceUnchanged,
  wholeCensusQualified: false, cleanupIndependentlyVerified: false, productAccepted: false,
  originalUnknownPreserved: true, rawPrivateDataExported: false, reviewRef, intent, privateObservation: raw,
  errorCode: /^[A-Z0-9_]{1,100}$/.test(v.errorCode ?? '') ? v.errorCode : complete ? null : 'KERNEL_FEATURE_RESPONSE_UNPROVEN'
 };
 const receipt = await wx('artifacts/software-factory/goals-r29/r33-kernel-fd-self-feature-result-' + Date.now() + '-' + randomUUID() + '.json', publicEvidence);
 return {receipt, ready: complete, featureSupportedAndPermitted: publicEvidence.featureSupportedAndPermitted,
         selfSlotAbsenceProven: publicEvidence.selfSlotAbsenceProven, wholeCensusQualified: false};
}
// This file intentionally has no command-line execution path.
