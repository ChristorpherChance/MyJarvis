/** Independent failure-only read. No actor inference, method qualification, dispatch or mutation. */
import {createHash, randomUUID} from 'node:crypto';
import {open, lstat, constants} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const sha = raw => createHash('sha256').update(raw).digest('hex');
const need = (v, code) => {if (!v) throw Error(code);};
const H = /^[a-f0-9]{64}$/;
const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
const same = (a, b) => canonical(a) === canonical(b);
const freeze = v => {if (v && typeof v === 'object') {Object.values(v).forEach(freeze); Object.freeze(v);} return v;};
const ref = (path, sha256) => ({path, sha256});
const SELF = 'scripts/verify-factory-single-entry-failed-unit-scope-r33.mjs';
const OBSERVER = 'scripts/factory-single-entry-failure-unit-scope-observer-r33.py';
const nonce = 'e088487022a3aadb4fd5e173fdb70b85', invocation = '471c2e41fefa4c0f88546f95563f8830';
const unit = 'jarvis-single-entry-method-r33-' + nonce + '.service';
const RECORDS = freeze({
  'control/owner.py': {sha256: '9fb69d1e6d6bcf8c5561042bbca2e7258f5436791ddc49f20156b5631a9b2c39', bytes: 29447},
  'control/fixture.py': {sha256: '3c97393af43ce6290baa5ca9e1253fcad16c6a62bb2677a9566c534ef4bd0fb8', bytes: 34256},
  'control/generated.py': {sha256: '2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73', bytes: 28366},
  'control/activation.json': {sha256: 'd406276c3d333b3097f7245b85cb42bfb569bc163e6541e30e899f4c68fe0c7b', bytes: 1131},
  'control/once.json': {sha256: 'e748d574cd0fa58bc91daea2a1f221c7bb53ab1ee5dc6ca628d3fa60ba0396ca', bytes: 776},
  'unit-proof.json': {sha256: '5b4eaa39360f5e4e6e8a969f56133acbc032283f1fd0549d0de877bc9f9a073a', bytes: 953},
});
const ACTUAL = freeze({
  journal: ref('.jarvis-dev/maintenance/factory-r33-single-entry-bound-method-once.json', '7be2a90005730a5f7a33d455a20b5a803685f0901be3301d3d4970525c89e663'),
  start: ref('artifacts/software-factory/goals-r29/r33-single-entry-method-start-1791882894257-01c77463-99c6-4093-8cbd-6a8947b0fe73.json', 'f0f477b33f107262b4bb9ef7e441abb3e0a58ec5b08d934caaafd3e785007472'),
  terminal: ref('artifacts/software-factory/goals-r29/r33-single-entry-method-check-1791882974229-5b43f092-a5f6-49a0-b3cd-fe7cf50ff184.json', 'cc654757aa006a6d26cdc7ac03ad73be279816aff3d38e592270f53383793f04'),
  startTransport: ref('.jarvis-dev/maintenance/r33-single-entry-method-transport-1791882894243-817a8bd4-1f72-420a-aa58-65588c91c59e.json', '205622d6ad5c3e7e910c847bd9d40be2291a0596166ae318016a234b378f96ea'),
  terminalTransport: ref('.jarvis-dev/maintenance/r33-single-entry-method-transport-1791882974219-c1d2e582-100e-4f29-86de-378772841eed.json', '5c0960ab3ed110748d78a122c460a41998942cbc717fb41b2ef54c0d5374b05a'),
  sourceReview: ref('artifacts/software-factory/goals-r29/r33-single-entry-bound-method-parent-independent-local-review-1791881838200-c58cf2c8-b032-4005-b721-9c3d9c20105b.json', 'd560953389199aed52a1d013faefea8219afab27aac2b649895aa578639b57b5'),
});
const SOURCES = freeze([
  ref('scripts/start-factory-single-entry-bound-method-r33.mjs', '6139b1c351841ee77f806d40a699a9bef7024c4cf173d50bc1d2ea4786c094e4'),
  ref('scripts/factory-single-entry-bound-method-owner-r33.py', RECORDS['control/owner.py'].sha256),
  ref('scripts/factory-single-entry-bound-method-fixture-r33.py', RECORDS['control/fixture.py'].sha256),
  ref('artifacts/software-factory/goals-r29/r33-single-entry-bound-census-native-source-2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73.py', RECORDS['control/generated.py'].sha256),
  ref('scripts/factory-single-entry-owned-scope-observer-r33.py', 'a67cd324e19e52cf005dba94bbb0a7276b0c1f1cc2ca8b9ea5f0b99867309a26'),
  ref('scripts/managed-server-client.mjs', 'e287938e2d79b0335523d3d198bd93b588541866cebc2c21d997ae6fce5e4a9f'),
]);
const WORK = ['owner.json', 'fixture-process.json', 'fixture.stdout.json', 'fixture.stderr.raw', 'result.json', 'stopped.json'];
export const singleEntryFailedUnitR33Activation = null;
export const singleEntryFailedUnitR33ActualRefs = null;
export const singleEntryFailedUnitR33FixedActualRefs = ACTUAL;

function keys(v, names) {return v && typeof v === 'object' && !Array.isArray(v) && same(Object.keys(v).sort(), [...names].sort());}
const pathValid = p => typeof p === 'string' && /^[A-Za-z0-9._/-]{1,512}$/.test(p) && !p.includes('//')
  && !p.split('/').some(x => !x || x === '.' || x === '..') && /^(scripts\/|artifacts\/software-factory\/goals-r29\/|\.jarvis-dev\/maintenance\/)/.test(p);
const refValid = r => keys(r, ['path', 'sha256']) && pathValid(r.path) && H.test(r.sha256);
async function readLocal(path) {
  need(pathValid(path), 'R33_FAILED_UNIT_LOCAL_PATH_CHANGED');
  const before = await lstat(path, {bigint: true});
  need(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size <= 8n * 1024n ** 2n, 'R33_FAILED_UNIT_LOCAL_FILE_UNTRUSTED');
  const f = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  const equal = (a, b) => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(k => a[k] === b[k]);
  try {const held = await f.stat({bigint: true}); need(equal(before, held), 'R33_FAILED_UNIT_LOCAL_FILE_CHANGED');
    const raw = await f.readFile(); need(BigInt(raw.length) === held.size && equal(held, await f.stat({bigint: true})) && equal(held, await lstat(path, {bigint: true})), 'R33_FAILED_UNIT_LOCAL_FILE_CHANGED'); return raw;
  } finally {await f.close();}
}
async function wx(path, raw) {const f = await open(path, 'wx', 0o600); try {await f.writeFile(raw); await f.sync();} finally {await f.close();}
  const z = await readLocal(path); need(z.equals(raw), 'R33_FAILED_UNIT_SAVE_CHANGED'); return {path, sha256: sha(z), bytes: z.length};}
const privateRaw = (label, raw) => wx('.jarvis-dev/maintenance/r33-failed-unit-' + label + '-' + Date.now() + '-' + randomUUID() + '.json', raw);
const publicValue = value => wx('artifacts/software-factory/goals-r29/r33-single-entry-failure-unit-cgroup-independent-result-' + Date.now() + '-' + randomUUID() + '.json', Buffer.from(JSON.stringify(value, null, 2) + '\n'));
async function settled(refs, read) {const rows = await Promise.allSettled(refs.map(r => Promise.resolve().then(() => read(r.path)))); const failure = rows.find(v => v.status === 'rejected'); if (failure) throw failure.reason; return rows.map(v => Buffer.from(v.value));}

export function singleEntryFailedUnitR33HostProgram(raw = null) {
  need(Buffer.isBuffer(raw) && raw.length > 0 && raw.length <= 128 * 1024, 'R33_FAILED_UNIT_HOST_SOURCE_REQUIRED');
  const source = raw.toString('utf8'); need(Buffer.from(source).equals(raw) && source.split('def observe_failed_unit_scope_r33(').length === 2, 'R33_FAILED_UNIT_HOST_SOURCE_CHANGED');
  return Buffer.concat([raw, Buffer.from('\nimport signal\ndef _r33_failed_unit_deadline(*_):\n raise RuntimeError("R33_FAILED_UNIT_DEADLINE")\nsignal.signal(signal.SIGALRM,_r33_failed_unit_deadline)\nsignal.alarm(30)\ntry:\n print(json.dumps(observe_failed_unit_scope_r33(p),separators=(",",":")))\nfinally:\n signal.alarm(0)\n')]);
}

function originalContext(frames, q) {
  need(q.kind === 'r33-single-entry-method-local-once' && q.nonce === nonce && q.dispatched === true && q.startUncertain === false && q.automaticRetry === false
    && q.activationSHA256 === RECORDS['control/activation.json'].sha256 && q.onceSHA256 === RECORDS['control/once.json'].sha256
    && q.unitProofSHA256 === RECORDS['unit-proof.json'].sha256 && !q.owner, 'R33_FAILED_UNIT_JOURNAL_CHANGED');
  for (const [i, frame] of frames.entries()) need(frame.kind === 'r33-single-entry-bound-method-parent-observation' && frame.nonce === nonce
    && frame.phase === 'native' && frame.sourceProtocol === 'r33-single-entry-owned-method-v1' && frame.readOnly === (i === 1)
    && frame.owner === null && frame.fixtureProcess === null && frame.fixtureSummary === null && frame.resultSummary === null && frame.stopped === null
    && frame.status === 'incomplete' && frame.methodSubsetProducerPassed === false && keys(frame.reportSHA256, []) && keys(frame.reportBytes, [])
    && frame.unit?.Id === unit && frame.unit.LoadState === 'loaded' && frame.unit.ActiveState === 'failed' && frame.unit.MainPID === '0'
    && frame.unit.ControlGroup === '' && frame.unit.InvocationID === invocation, 'R33_FAILED_UNIT_ORIGINAL_CONTEXT_CHANGED');
}

function assertCurrent(v, payload) {
  need(v?.schemaVersion === 1 && v.kind === 'r33-single-entry-failure-unit-cgroup-host-observation' && v.nonce === nonce
    && v.contextSHA256 === sha(canonical(payload)) && same(v.scopeBinding, payload), 'R33_FAILED_UNIT_CURRENT_BINDING_CHANGED');
  need(v.recordsStable === true && v.namespaceStable === true && v.sourceRawBindingVerified === true
    && keys(v.originalRawFileRefs, Object.keys(RECORDS)) && Array.isArray(v.physicalFrames) && v.physicalFrames.length === 2,
    'R33_FAILED_UNIT_CURRENT_READ_INCOMPLETE');
  for (const [name, pin] of Object.entries(RECORDS)) {const row = v.originalRawFileRefs[name], raw = Buffer.from(row?.base64 ?? '', 'base64');
    need(row?.readComplete === true && row.sha256 === pin.sha256 && row.bytes === pin.bytes && raw.toString('base64') === row.base64
      && raw.length === pin.bytes && sha(raw) === pin.sha256, 'R33_FAILED_UNIT_CURRENT_BYTES_CHANGED');}
  let clean = true;
  for (const frame of v.physicalFrames) {const p = frame.unit?.properties;
    need(frame.unit?.complete === true && p?.Id === unit && typeof frame.cgroup?.complete === 'boolean' && typeof frame.cgroup.absent === 'boolean'
      && Array.isArray(frame.cgroup.members) && frame.cgroup.members.every(x => Number.isSafeInteger(x) && x > 0)
      && same(frame.missingWorkNames, WORK), 'R33_FAILED_UNIT_CURRENT_FRAME_INCOMPLETE');
    const stopped = p.LoadState === 'loaded' && p.ActiveState === 'failed' && p.MainPID === '0' && p.InvocationID === invocation && ['', '/system.slice/' + unit].includes(p.ControlGroup);
    need(frame.unit.currentStopped === stopped, 'R33_FAILED_UNIT_CURRENT_INSTANCE_CHANGED');
    clean &&= stopped && frame.cgroup.complete && frame.cgroup.members.length === 0;
  }
  need(same(v.physicalFrames[0], v.physicalFrames[1]) && v.currentFailureUnitAndCgroupScopeClosedVerified === clean
    && ['currentOwnedScopeCleanupVerified', 'actualMethodSubsetIndependentlyQualified', 'fullProtectionQualified', 'wholeProcCensusExecuted', 'modelsInvoked', 'productCodeExecuted'].every(k => v[k] === false)
    && v.unknownOriginalActorIdentitiesPreserved === true, 'R33_FAILED_UNIT_SCOPE_CLAIM_CHANGED');
  return v;
}

function publicFrame(f) {
  const properties = f.unit.properties;
  return {unit: Object.fromEntries(['Id', 'LoadState', 'ActiveState', 'SubState', 'MainPID', 'ControlGroup', 'InvocationID', 'Result', 'ExecMainCode', 'ExecMainStatus'].map(k => [k, properties[k] ?? null])),
    unitComplete: f.unit.complete, currentStopped: f.unit.currentStopped,
    cgroup: {absent: f.cgroup.absent, complete: f.cgroup.complete, memberCount: f.cgroup.members.length},
    missingWorkNames: WORK, namespaceIdentity: f.namespaceIdentity ?? null,
    namespaceMetadataSHA256: H.test(f.namespaceMetadataSHA256 ?? '') ? f.namespaceMetadataSHA256 : null};
}

async function readRoot(p, program) {const {lanProfile, python} = await import('./managed-server-client.mjs');
  const r = spawnSync('ssh', ['-F', lanProfile, '-o', 'BatchMode=yes', 'jarvis-101', 'sudo -n python3 -'], {input: python(p, program.toString('utf8')), timeout: 45000, windowsHide: true, maxBuffer: 4 * 1024 ** 2});
  return {status: r.status, signal: r.signal ?? null, stdout: Buffer.from(r.stdout ?? ''), stderr: Buffer.from(r.stderr ?? ''), errorCode: r.error?.code ?? null};}

export async function verifySingleEntryFailedUnitScopeR33({activation = singleEntryFailedUnitR33Activation} = {}, deps = {}) {
  if (activation === null || activation?.review == null || activation?.actualRefs == null) return {schemaVersion: 1, kind: 'r33-single-entry-failed-unit-scope-reader-preparation',
    ready: false, localIOPerformed: false, remoteReadAttempted: false, currentFailureUnitAndCgroupScopeClosedVerified: false,
    unknownOriginalActorIdentitiesPreserved: true, actualMethodSubsetIndependentlyQualified: false, currentOwnedScopeCleanupVerified: false, fullProtectionQualified: false};
  need(keys(activation, ['schemaVersion', 'kind', 'remoteReadAuthorized', 'callerSHA256', 'observer', 'hostProgram', 'review', 'actualRefs'])
    && activation.schemaVersion === 1 && activation.kind === 'r33-single-entry-failed-unit-scope-read-activation' && activation.remoteReadAuthorized === true
    && H.test(activation.callerSHA256) && refValid(activation.observer) && activation.observer.path === OBSERVER && refValid(activation.hostProgram)
    && refValid(activation.review) && same(activation.actualRefs, ACTUAL), 'R33_FAILED_UNIT_ACTIVATION_CHANGED');
  const a = freeze(JSON.parse(JSON.stringify(activation))), d = {readLocal, readRoot, writePrivateRaw: privateRaw, writePublic: publicValue, now: Date.now, ...deps};
  const refs = [...SOURCES, ...Object.values(ACTUAL), ref(SELF, a.callerSHA256), a.observer, a.hostProgram, a.review];
  const before = await settled(refs, d.readLocal); need(before.every((raw, i) => sha(raw) === refs[i].sha256), 'R33_FAILED_UNIT_SOURCE_CHANGED');
  const byPath = new Map(refs.map((r, i) => [r.path, before[i]])), review = JSON.parse(byPath.get(a.review.path));
  const program = singleEntryFailedUnitR33HostProgram(byPath.get(OBSERVER));
  need(program.equals(byPath.get(a.hostProgram.path)) && sha(program) === a.hostProgram.sha256 && review.kind === 'r33-single-entry-failed-unit-scope-independent-local-review'
    && review.callerSHA256 === a.callerSHA256 && review.observerSHA256 === a.observer.sha256 && review.hostProgramSHA256 === a.hostProgram.sha256
    && review.staticPreparationReady === true && review.remainingP0P1 === 0 && review.remoteOperations === false, 'R33_FAILED_UNIT_REVIEW_REQUIRED');
  const frames = [ACTUAL.startTransport, ACTUAL.terminalTransport].map(r => {const t = JSON.parse(byPath.get(r.path)); need(t.status === 0 && t.signal === null, 'R33_FAILED_UNIT_ORIGINAL_TRANSPORT_CHANGED'); return JSON.parse(Buffer.from(t.stdoutBase64, 'base64').toString('utf8'));});
  originalContext(frames, JSON.parse(byPath.get(ACTUAL.journal.path)));
  for (const f of frames) for (const [name, pin] of Object.entries(RECORDS)) {const row = f.rawReports?.[name]; const raw = Buffer.from(row?.base64 ?? '', 'base64');
    need(row?.sha256 === pin.sha256 && row.bytes === pin.bytes && raw.length === pin.bytes && sha(raw) === pin.sha256, 'R33_FAILED_UNIT_ORIGINAL_SIX_BYTES_CHANGED');}
  const payload = {schemaVersion: 1, kind: 'r33-single-entry-failure-unit-cgroup-observation-input', nonce, sourceProtocol: 'r33-single-entry-owned-method-v1',
    invocationId: invocation, readerReview: a.review, actualRefs: ACTUAL, expectedRawFiles: RECORDS};
  let transport, rawRef = null, hostRef = null, host = null, errorCode = null, remoteReadAttempted = false;
  try {remoteReadAttempted = true; transport = await d.readRoot(payload, program);
    need(transport && Buffer.isBuffer(transport.stdout) && Buffer.isBuffer(transport.stderr), 'R33_FAILED_UNIT_TRANSPORT_SHAPE_CHANGED');
    rawRef = await d.writePrivateRaw('transport', Buffer.from(JSON.stringify({kind: 'r33-single-entry-failed-unit-original-transport', sourceRefs: refs,
      hostProgramSHA256: sha(program), payloadSHA256: sha(canonical(payload)), status: transport.status, signal: transport.signal,
      stdoutBase64: transport.stdout.toString('base64'), stderrBase64: transport.stderr.toString('base64'), errorCode: transport.errorCode ?? null}) + '\n'));
    need(transport.status === 0 && transport.signal === null, 'R33_FAILED_UNIT_ROOT_READ_INCOMPLETE');
    hostRef = await d.writePrivateRaw('host-original', transport.stdout); host = assertCurrent(JSON.parse(transport.stdout.toString('utf8')), payload);
  } catch (error) {host = null; errorCode = /^R33_FAILED_UNIT_[A-Z0-9_]+$/.test(error?.message ?? '') ? error.message : 'R33_FAILED_UNIT_READ_INCOMPLETE';}
  const after = await settled(refs, d.readLocal); need(after.every((raw, i) => raw.equals(before[i])), 'R33_FAILED_UNIT_SOURCE_CHANGED_AFTER');
  const closed = Boolean(host && host.currentFailureUnitAndCgroupScopeClosedVerified);
  const value = {schemaVersion: 1, kind: 'r33-single-entry-failure-unit-cgroup-independent-result', at: new Date(d.now()).toISOString(), nonce,
    ready: closed, errorCode, currentFailureUnitAndCgroupScopeClosedVerified: closed, sourceRefs: refs, sourcesStable: true,
    readerIndependentReview: a.review, hostProgram: a.hostProgram, payloadSHA256: sha(canonical(payload)), privateTransport: rawRef, originalHostBytes: hostRef,
    remoteReadAttempted, remoteReadPerformed: transport === undefined ? null : true, mutationsPerformed: false,
    originalOwnerIdentity: null, originalFixtureIdentity: null, originalChildIdentity: null, unknownOriginalActorIdentitiesPreserved: true,
    bootstrapFirstPhase: null, bootstrapFirstError: null, methodExecutionState: 'unknown', serviceStderrCaptured: false,
    actualMethodSubsetIndependentlyQualified: false, currentOwnedScopeCleanupVerified: false, wholeProcCensusExecuted: false,
    externalHoldersAbsenceProved: false, fullProtectionQualified: false, globalCleanupQualified: false, modelsInvoked: false, productCodeExecuted: false,
    currentScope: host ? {physicalFrames: host.physicalFrames.map(publicFrame), recordsStable: true, namespaceStable: true} : null};
  return {...value, receipt: await d.writePublic(value)};
}
