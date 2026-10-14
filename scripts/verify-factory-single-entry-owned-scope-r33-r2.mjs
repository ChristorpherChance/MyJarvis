/** Prepared independent read of three explicitly bound actors. No dispatch or cleanup mutation. */
import {createHash, randomUUID} from 'node:crypto';
import {open, lstat, constants} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const H = /^[a-f0-9]{64}$/, N = /^[a-f0-9]{32}$/;
const sha = value => createHash('sha256').update(value).digest('hex');
const need = (value, code) => { if (!value) throw Error(code); };
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const same = (a, b) => canonical(a) === canonical(b);
const SELF = 'scripts/verify-factory-single-entry-owned-scope-r33-r2.mjs';
const HOST = 'scripts/factory-single-entry-owned-scope-observer-r33-r2.py';
const JP = '.jarvis-dev/maintenance/factory-r33-single-entry-bound-method-r2-once.json';
const PROTOCOL = 'r33-single-entry-owned-method-v2';
const BASE = '/var/lib/jarvis-single-entry-bound-method-r33-r2';
const STARTER = 'scripts/start-factory-single-entry-bound-method-r33-r2.mjs';
const OWNER = 'scripts/factory-single-entry-bound-method-owner-r33-r2.py';
const EXECUTION_PINS = Object.freeze({owner: '0ef6b9ca43da43c19f7ae4fe97646cabbc8e72e4f11e5b342ad2452e0509a8f7',
  starter: '3d19fac9e8efbf743c0072deac6a05c688a47d9f942df677854815d67f070866',
  hostProgram: '6b1d8be1421a3074d439db65e8178d57fb700c49a37d6e38ff30c25b538a529e'});
const SOURCE = Object.freeze({
  fixture: {path: 'scripts/factory-single-entry-bound-method-fixture-r33.py', sha256: '3c97393af43ce6290baa5ca9e1253fcad16c6a62bb2677a9566c534ef4bd0fb8'},
  native: {path: 'artifacts/software-factory/goals-r29/r33-single-entry-bound-census-native-source-2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73.py', sha256: '2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73'},
  buildStatic: {path: 'artifacts/software-factory/goals-r29/r33-single-entry-bound-census-build-source-909f014941f1adbe3adf62a1dcd8d783c48f292c41f936c339cb293a2d0f7188.py', sha256: '909f014941f1adbe3adf62a1dcd8d783c48f292c41f936c339cb293a2d0f7188'},
  generator: {path: 'scripts/factory-single-entry-bound-census-r33.mjs', sha256: '7f10715ae744a24117edc34a5d44d2478400a878b77044be289aa616f406ead5'},
  pureModule: {path: 'scripts/factory-single-dirent-r33.py', sha256: 'ab981cf22e75c75946a85150bffbd051ece574143446fd6b22f6a383bc44c6d8'},
  transport: {path: 'scripts/managed-server-client.mjs', sha256: 'e287938e2d79b0335523d3d198bd93b588541866cebc2c21d997ae6fce5e4a9f'},
});
for (const value of Object.values(SOURCE)) Object.freeze(value);
const CONTROLS = ['owner.py', 'fixture.py', 'generated.py', 'activation.json', 'once.json'];
const WORK = ['owner.json', 'fixture-process.json', 'fixture.stdout.json', 'fixture.stderr.raw', 'result.json', 'stopped.json', 'owner.stderr.raw'];
const RECORDS = [...CONTROLS.map(name => 'control/' + name), ...WORK.map(name => 'work/' + name), 'unit-proof.json'];
const SELECTED = Object.freeze({SingleEntryR33: '34b11bfa298198de1d6476c0d41cfef28b7912e95dfc2692446fce0a3528a495',
  SingleEntryDirectoryR33: 'a0b59cc1a28b47715b24f2b1ffd6f949b56c039e5d48dfe156b74fa70b33dd17',
  process_record: 'd6cf839ecd4cc6fba03b7c4f6a44b6cf73180ef5809d8fc8d79914902139f640',
  pidfd_poll: '94132b924aa09bc655f476438286999b10dc37d3e6e1a27feb3bd9196ef2e533',
  pidfd_exit_proof: 'ee4ab7a845eb51a031f8fccaf8daf3eefabe9b222e3bf03a1a3819aa1c200109'});
const identityCore = value => Object.fromEntries(['pid', 'ppid', 'startTicks', 'boot', 'procDevice', 'procInode'].map(key => [key, value?.[key]]));
export const singleEntryOwnedScopeR33R2Activation = null;
export const singleEntryOwnedScopeR33R2Source = SOURCE;

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) && same(Object.keys(value).sort(), [...keys].sort());
}
function localPath(path) {
  return typeof path === 'string' && path.length <= 512 && !path.includes('\\') && !path.includes('//')
    && !path.split('/').some(part => !part || part === '.' || part === '..')
    && /^(?:scripts\/|artifacts\/software-factory\/goals-r29\/|\.jarvis-dev\/maintenance\/)[A-Za-z0-9._/-]+$/.test(path);
}
function ref(value) { return exactKeys(value, ['path', 'sha256']) && localPath(value.path) && H.test(value.sha256); }
function immutableJSON(value, depth = 0) {
  need(depth < 40, 'R33_OWNED_SCOPE_PACKET_DEPTH_CHANGED');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { need(Number.isFinite(value), 'R33_OWNED_SCOPE_PACKET_NUMBER_CHANGED'); return value; }
  need(value && typeof value === 'object' && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype), 'R33_OWNED_SCOPE_PACKET_NOT_JSON');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Object.keys(value);
  need(Reflect.ownKeys(value).length === keys.length + (Array.isArray(value) ? 1 : 0)
    && keys.every(key => descriptors[key].enumerable && Object.hasOwn(descriptors[key], 'value'))
    && (!Array.isArray(value) || keys.length === value.length && keys.every((key, i) => key === String(i))), 'R33_OWNED_SCOPE_PACKET_PROPERTIES_CHANGED');
  return Object.freeze(Array.isArray(value) ? keys.map(key => immutableJSON(value[key], depth + 1))
    : Object.fromEntries(keys.map(key => [key, immutableJSON(value[key], depth + 1)])));
}

export async function readSingleEntryOwnedScopeLocalR33R2(path) {
  need(localPath(path), 'R33_OWNED_SCOPE_LOCAL_PATH_CHANGED');
  const before = await lstat(path, {bigint: true});
  need(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size <= BigInt(8 * 1024 ** 2), 'R33_OWNED_SCOPE_LOCAL_FILE_UNTRUSTED');
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  const identityEquals = (a, b) => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key]);
  try {
    const held = await file.stat({bigint: true}); need(identityEquals(before, held), 'R33_OWNED_SCOPE_LOCAL_FILE_CHANGED');
    const raw = await file.readFile(), after = await file.stat({bigint: true}), named = await lstat(path, {bigint: true});
    need(BigInt(raw.length) === held.size && identityEquals(held, after) && identityEquals(held, named), 'R33_OWNED_SCOPE_LOCAL_FILE_CHANGED');
    return raw;
  } finally { await file.close(); }
}
async function writeWX(path, raw) {
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(raw); await file.sync(); } finally { await file.close(); }
  const observed = await readSingleEntryOwnedScopeLocalR33R2(path);
  need(observed.equals(raw), 'R33_OWNED_SCOPE_LOCAL_SAVE_CHANGED');
  return {path, sha256: sha(raw), bytes: raw.length};
}
const privateRaw = (label, raw) => writeWX('.jarvis-dev/maintenance/r33-single-entry-owned-scope-r2-' + label + '-' + Date.now() + '-' + randomUUID() + '.json', raw);
const publicValue = value => writeWX('artifacts/software-factory/goals-r29/r33-single-entry-bound-method-independent-result-r2-' + Date.now() + '-' + randomUUID() + '.json', Buffer.from(JSON.stringify(value, null, 2) + '\n'));

/** The physical observer bytes are kept intact; append only its fixed data-only entry. */
export function singleEntryOwnedScopeR33R2HostProgram(observerRaw = null) {
  need(Buffer.isBuffer(observerRaw) && observerRaw.length > 0 && observerRaw.length <= 128 * 1024, 'R33_OWNED_SCOPE_OBSERVER_BYTES_REQUIRED');
  const source = observerRaw.toString('utf8');
  need(Buffer.from(source).equals(observerRaw) && source.split('def observe_owned_scope_r33_r2(').length === 2, 'R33_OWNED_SCOPE_OBSERVER_SOURCE_CHANGED');
  return Buffer.concat([observerRaw, Buffer.from('\nimport signal\ndef _r33_observer_deadline(*_):\n raise RuntimeError("R33_OWNED_OBSERVER_DEADLINE")\nsignal.signal(signal.SIGALRM,_r33_observer_deadline)\nsignal.alarm(35)\ntry:\n print(json.dumps(observe_owned_scope_r33_r2(p),separators=(",",":")))\nfinally:\n signal.alarm(0)\n')]);
}

function validateActivation(value) {
  const a = immutableJSON(value);
  need(exactKeys(a, ['schemaVersion', 'kind', 'remoteReadAuthorized', 'callerSHA256', 'observer', 'observationHostProgram', 'review', 'execution'])
    && a.schemaVersion === 1 && a.kind === 'r33-single-entry-owned-scope-read-activation-r2' && a.remoteReadAuthorized === true
    && H.test(a.callerSHA256) && ref(a.observer) && a.observer.path === HOST && ref(a.observationHostProgram) && ref(a.review)
    && /^artifacts\/software-factory\/goals-r29\/r33-single-entry-owned-scope-independent-local-review-r2-[0-9]{13}-[a-f0-9-]{36}\.json$/.test(a.review.path)
    && exactKeys(a.execution, ['starter', 'owner', 'executionHostProgram', 'sourceReview', 'journal', 'start', 'terminal'])
    && Object.values(a.execution).every(ref) && a.execution.starter.path === STARTER && a.execution.owner.path === OWNER
    && a.execution.journal.path === JP && a.execution.owner.sha256 === EXECUTION_PINS.owner
    && a.execution.starter.sha256 === EXECUTION_PINS.starter && a.execution.executionHostProgram.sha256 === EXECUTION_PINS.hostProgram, 'R33_OWNED_SCOPE_ACTIVATION_CHANGED');
  return a;
}

function actor(value, uid, ppid = null) {
  return value && Number.isSafeInteger(value.pid) && value.pid > 1 && Number.isSafeInteger(value.ppid) && value.ppid >= 0
    && /^[0-9]+$/.test(value.startTicks ?? '') && /^[a-f0-9-]{36}$/.test(value.boot ?? '')
    && Number.isSafeInteger(value.procDevice) && value.procDevice > 0 && Number.isSafeInteger(value.procInode) && value.procInode > 0
    && (uid === null || value.uid === uid) && (ppid === null || value.ppid === ppid);
}

export function assertSingleEntryOwnedScopeContextR33R2(q, start, terminal, execution) {
  need(q?.kind === 'r33-single-entry-method-local-once-r2' && N.test(q.nonce ?? '') && q.phase === 'native'
    && q.dispatched === true && q.startUncertain === false && q.automaticRetry === false
    && q.ownerSHA256 === execution.owner.sha256 && q.starterSHA256 === execution.starter.sha256
    && same(q.review, execution.sourceReview) && q.hostProgramSHA256 === execution.executionHostProgram.sha256
    && H.test(q.activationSHA256 ?? '') && H.test(q.onceSHA256 ?? '') && H.test(q.unitProofSHA256 ?? ''), 'R33_OWNED_SCOPE_JOURNAL_CHANGED');
  const unit = 'jarvis-single-entry-method-r33-r2-' + q.nonce + '.service';
  const s = q.scope;
  need(s?.kind === 'r33-single-entry-bound-method-fixed-scope-r2' && s.sourceProtocol === PROTOCOL && s.base === BASE
    && s.machineId === '101' && s.starterPath === STARTER && s.phase === 'native'
    && same(s.owner, execution.owner) && same(s.fixture, SOURCE.fixture) && same(s.generated, SOURCE.native)
    && same(s.buildStatic, SOURCE.buildStatic) && same(s.generator, SOURCE.generator) && same(s.pureModule, SOURCE.pureModule)
    && same(s.transport, SOURCE.transport) && same(s.controls, CONTROLS) && same(s.workReports, WORK) && s.rootReport === 'unit-proof.json'
    && s.runtimeMaxSec === 80 && s.timeoutStopSec === 10 && s.totalParentSeconds === 90 && s.fixtureWorkSeconds === 45
    && s.rootUID === 0 && s.rootGID === 0 && s.fixtureUID === 1000 && s.fixtureGID === 1000 && s.rootCapabilityMask === 226
    && s.killMode === 'control-group' && s.killSignal === 'SIGKILL' && s.restart === 'no'
    && s.noNewPrivileges === true && s.privateNetwork === true, 'R33_OWNED_SCOPE_EXECUTION_SCOPE_CHANGED');
  for (const [frame, readOnly] of [[start, false], [terminal, true]]) {
    need(frame?.schemaVersion === 1 && frame.kind === 'r33-single-entry-bound-method-parent-observation-r2'
      && frame.nonce === q.nonce && frame.phase === 'native' && frame.sourceProtocol === PROTOCOL
      && frame.ownerSHA256 === execution.owner.sha256 && frame.fixtureSHA256 === SOURCE.fixture.sha256
      && frame.generatedSHA256 === SOURCE.native.sha256 && frame.buildStaticMappingSHA256 === SOURCE.buildStatic.sha256
      && frame.activationSHA256 === q.activationSHA256 && frame.onceSHA256 === q.onceSHA256
      && frame.readOnly === readOnly && frame.dispatchSubmitted === true && frame.controlsStable === true && frame.unitConfigVerified === true
      && frame.unit?.Id === unit && frame.unitProofSHA256 === q.unitProofSHA256
      && frame.ownerStderrSinkPresent === true && H.test(frame.ownerStderrSHA256 ?? '')
      && Number.isSafeInteger(frame.ownerStderrBytes) && frame.ownerStderrBytes >= 0 && frame.ownerStderrBytes <= 1048576
      && typeof frame.ownerStderrStructured === 'boolean' && Array.isArray(frame.earlyFailures)
      && ['actualMethodIndependentlyQualified', 'currentScopeCleanupIndependentlyVerified', 'fullProtectionQualified', 'productCodeExecuted', 'modelsInvoked'].every(key => frame[key] === false), 'R33_OWNED_SCOPE_EXECUTION_FRAME_CHANGED');
  }
  need(actor(terminal.owner, 0) && same(terminal.owner, q.owner) && (!start.owner || same(start.owner, terminal.owner))
    && terminal.owner.gid === 0 && terminal.owner.unit === unit && terminal.owner.controlGroup === '/system.slice/' + unit
    && N.test(terminal.owner.invocationId ?? '') && terminal.owner.runtimeMaxSec === 80 && terminal.owner.stopTimeoutSec === 10
    && terminal.owner.hardParentBoundSeconds === 90 && terminal.owner.killMode === 'control-group' && terminal.owner.killSignal === 'SIGKILL'
    && terminal.owner.restart === 'no', 'R33_OWNED_SCOPE_OWNER_CHANGED');
  need(actor(terminal.fixtureProcess, 1000, terminal.owner.pid) && terminal.fixtureProcess.boot === terminal.owner.boot
    && terminal.fixtureProcess.controlGroup === terminal.owner.controlGroup, 'R33_OWNED_SCOPE_FIXTURE_CHANGED');
  const tiny = terminal.fixtureSummary?.childIdentity;
  need(actor(tiny, null, terminal.fixtureProcess.pid) && tiny.boot === terminal.owner.boot
    && new Set([terminal.owner.pid, terminal.fixtureProcess.pid, tiny.pid]).size === 3, 'R33_OWNED_SCOPE_CHILD_IDENTITY_UNKNOWN');
  need(['passed', 'failed'].includes(terminal.status) && exactKeys(terminal.reportSHA256, WORK)
    && exactKeys(terminal.reportBytes, WORK) && WORK.every(name => H.test(terminal.reportSHA256[name])
      && Number.isSafeInteger(terminal.reportBytes[name]) && terminal.reportBytes[name] >= 0 && terminal.reportBytes[name] <= 1048576), 'R33_OWNED_SCOPE_TERMINAL_REPORT_SET_INCOMPLETE');
  need(terminal.ownerStderrSHA256 === terminal.reportSHA256['owner.stderr.raw']
    && terminal.ownerStderrBytes === terminal.reportBytes['owner.stderr.raw'], 'R33_OWNED_SCOPE_STDERR_FRAME_CHANGED');
  const records = Object.fromEntries(WORK.map(name => ['work/' + name, {sha256: terminal.reportSHA256[name], bytes: terminal.reportBytes[name]}]));
  for (const [name, hash] of Object.entries({'owner.py': execution.owner.sha256, 'fixture.py': SOURCE.fixture.sha256,
    'generated.py': SOURCE.native.sha256, 'activation.json': q.activationSHA256, 'once.json': q.onceSHA256})) records['control/' + name] = {sha256: hash, bytes: null};
  records['unit-proof.json'] = {sha256: q.unitProofSHA256, bytes: null};
  const owner = {...identityCore(terminal.owner), uid: 0, gid: 0, unit, controlGroup: terminal.owner.controlGroup, invocationId: terminal.owner.invocationId};
  return immutableJSON({schemaVersion: 1, kind: 'r33-single-entry-owned-scope-observation-input-r2', nonce: q.nonce, phase: 'native', sourceProtocol: PROTOCOL,
    owner, fixture: terminal.fixtureProcess, child: tiny, activationSHA256: q.activationSHA256, onceSHA256: q.onceSHA256,
    unitProofSHA256: q.unitProofSHA256, invocationId: terminal.owner.invocationId, expectedRawFiles: records,
    sourceExpected: {ownerSHA256: execution.owner.sha256, starterSHA256: execution.starter.sha256, sourceReviewSHA256: execution.sourceReview.sha256,
      fixtureSHA256: SOURCE.fixture.sha256, generatedSHA256: SOURCE.native.sha256, buildStaticMappingSHA256: SOURCE.buildStatic.sha256,
      moduleSHA256: SOURCE.pureModule.sha256, generatorSHA256: SOURCE.generator.sha256}});
}

/** Independent typed oracle. Large metadata integers are verified by the Python reader and retained as original bytes. */
export function assertOriginalSingleEntryMethodEvidenceR33R2(records, payload) {
  need(exactKeys(records, RECORDS), 'R33_OWNED_SCOPE_ORIGINAL_RECORD_SET_CHANGED');
  const bytes = {};
  for (const name of RECORDS) {
    const row = records[name], pin = payload.expectedRawFiles[name];
    need(row && typeof row.base64 === 'string' && Number.isSafeInteger(row.bytes) && row.bytes >= 0 && row.bytes <= 1048576,
      'R33_OWNED_SCOPE_ORIGINAL_RECORD_INCOMPLETE');
    bytes[name] = Buffer.from(row.base64, 'base64');
    need(bytes[name].toString('base64') === row.base64 && bytes[name].length === row.bytes && sha(bytes[name]) === pin.sha256
      && row.sha256 === pin.sha256 && (pin.bytes === null || pin.bytes === row.bytes), 'R33_OWNED_SCOPE_ORIGINAL_RECORD_HASH_CHANGED');
  }
  const decode = name => JSON.parse(bytes[name].toString('utf8'));
  const activation = decode('control/activation.json'), once = decode('control/once.json'), owner = decode('work/owner.json'), fixture = decode('work/fixture-process.json');
  const f = decode('work/fixture.stdout.json'), result = decode('work/result.json'), stopped = decode('work/stopped.json'), unitProof = decode('unit-proof.json');
  need(result.methodSubsetProducerPassed === true, 'R33_OWNED_SCOPE_ORIGINAL_PARENT_METHOD_NOT_PASSED');
  const unit = payload.owner.unit, root = BASE + '/' + payload.nonce, cgroup = '/system.slice/' + unit;
  need(bytes['work/owner.stderr.raw'].length === 0, 'R33_OWNED_SCOPE_OWNER_STDERR_NOT_EMPTY');
  const common = {schemaVersion: 1, nonce: payload.nonce, phase: 'native', sourceProtocol: PROTOCOL,
    ownerSHA256: payload.sourceExpected.ownerSHA256, fixtureSHA256: SOURCE.fixture.sha256, generatedSHA256: SOURCE.native.sha256,
    buildStaticMappingSHA256: SOURCE.buildStatic.sha256, fixtureWorkSeconds: 45, runtimeMaxSec: 80, timeoutStopSec: 10, hardParentBoundSeconds: 90};
  need(Object.entries(common).every(([key, value]) => activation[key] === value && once[key] === value)
    && activation.kind === 'r33-single-entry-method-root-activation-r2' && once.kind === 'r33-single-entry-method-root-once-r2'
    && once.unit === unit && once.activationSHA256 === payload.activationSHA256
    && activation.parentReview?.sha256 === payload.sourceExpected.sourceReviewSHA256, 'R33_OWNED_SCOPE_ORIGINAL_CONTROL_CHANGED');
  const profile = owner.profile, cap = (value, expected) => typeof value === 'string' && /^[a-f0-9]+$/.test(value) && Number.parseInt(value, 16) === expected;
  need(same(identityCore(owner), identityCore(payload.owner)) && owner.uid === 0 && owner.gid === 0 && owner.unit === unit
    && owner.controlGroup === cgroup && owner.invocationId === payload.invocationId && owner.ownerSHA256 === payload.sourceExpected.ownerSHA256
    && owner.fixtureSHA256 === SOURCE.fixture.sha256 && owner.generatedSHA256 === SOURCE.native.sha256
    && owner.activationSHA256 === payload.activationSHA256 && owner.onceSHA256 === payload.onceSHA256
    && same(profile?.realEffectiveSavedUID, [0, 0, 0]) && same(profile?.realEffectiveSavedGID, [0, 0, 0])
    && cap(profile?.capabilities?.CapEff, 226) && cap(profile?.capabilities?.CapPrm, 226)
    && cap(profile?.capabilities?.CapInh, 0) && cap(profile?.capabilities?.CapAmb, 0) && profile.noNewPrivileges === 1
    && profile.rootCapabilitiesAreZero === false && profile.generatedDefinitionsLoaded === false && profile.methodExecutedAsRoot === false
    && owner.selfPIDFD?.requestedPID === owner.pid && owner.selfPIDFD.attached === true && owner.selfPIDFD.identityBound === true
    && owner.selfPIDFD.livePollEvents === 0, 'R33_OWNED_SCOPE_ORIGINAL_ROOT_PROFILE_CHANGED');
  need(same(fixture, payload.fixture) && fixture.uid === 1000 && fixture.ppid === owner.pid && fixture.boot === owner.boot
    && fixture.controlGroup === cgroup && H.test(fixture.argvSHA256 ?? '') && H.test(fixture.commandSHA256 ?? ''), 'R33_OWNED_SCOPE_ORIGINAL_FIXTURE_CHANGED');
  need(f.schemaVersion === 1 && f.kind === 'r33-single-entry-bound-method-fixture-result' && f.phase === 'native'
    && f.fixtureQualified === true && f.methodSubsetExercised === true && f.fixturePhase === 'COMPLETE'
    && f.firstFailure === null && same(f.secondaryFailures, []) && f.readyProtocolSHA256 === 'b7648b15b26e79747f5dd39557acde5a710b8efd9b7e4172eee10de00dbaa408'
    && ['readyHandshakeCompleted', 'releaseGateSent', 'naturalChildExit', 'childReaped', 'descriptorClosed'].every(key => f[key] === true)
    && f.signalsSent === false && f.childExitCode === 0 && f.internalWorkSeconds === 45 && same(f.cleanupWaitSeconds, [3, 3])
    && f.requiredParentWorkSeconds === 80 && f.requiredParentStopSeconds === 10 && f.requiredParentTotalSeconds === 90,
    'R33_OWNED_SCOPE_ORIGINAL_FIXTURE_RESULT_INCOMPLETE');
  need(['wholeProgramQualified', 'fullProtectionQualified', 'fullProcCensusExecuted', 'foreignProcessInspected', 'protectedInventoryRead',
    'nodeACKRead', 'queueRead', 'productCodeExecuted', 'modelsInvoked', 'getfdFallbackUsed', 'entryToPIDRaceEliminated',
    'externalHoldersAbsenceProved', 'parentImplementedByThisFixture', 'independentClosureVerified', 'rawArgvExported', 'privateEnvironmentExported'].every(key => f[key] === false),
    'R33_OWNED_SCOPE_ORIGINAL_FIXTURE_BOUNDARY_CHANGED');
  need(f.source?.phase === 'native' && f.source.generatedSourceSHA256 === SOURCE.native.sha256
    && f.source.generatorSHA256 === SOURCE.generator.sha256 && f.source.pureModuleSHA256 === SOURCE.pureModule.sha256
    && same(f.source.selectedSourceSHA256, SELECTED) && ['wholeProgramTopLevelExecuted', 'censusDefinitionLoaded', 'actualSourceMappingQualified'].every(key => f.source[key] === false),
    'R33_OWNED_SCOPE_ORIGINAL_SELECTED_SOURCE_CHANGED');
  const runtime = f.runtime;
  need(same(runtime?.fixtureIdentity, identityCore(fixture)) && same(runtime.realEffectiveSavedUID, [1000, 1000, 1000])
    && same(runtime.realEffectiveSavedGID, [1000, 1000, 1000]) && runtime.noNewPrivileges === 1 && runtime.isolatedPython === true
    && runtime.rootOwnerProfileAsserted === false && same(runtime.cgroups, [cgroup])
    && exactKeys(runtime.capabilities, ['CapEff', 'CapPrm', 'CapInh']) && Object.values(runtime.capabilities).every(value => cap(value, 0)),
    'R33_OWNED_SCOPE_ORIGINAL_LOW_PRIVILEGE_CHANGED');
  const child = f.childIdentity, live = f.liveRecord, e = f.originalBoundExitProof, kernel = e?.kernelProof;
  need(same(child, payload.child) && exactKeys(child, ['pid', 'ppid', 'startTicks', 'boot', 'procDevice', 'procInode'])
    && f.requestedChildPID === child.pid && child.ppid === fixture.pid && child.boot === owner.boot
    && same(identityCore(live), child) && live.uid === 1000 && typeof live.state === 'string' && live.state !== 'Z'
    && same(live.cgroups, [cgroup]), 'R33_OWNED_SCOPE_ORIGINAL_LIVE_CHILD_UNBOUND');
  need(e?.pid === child.pid && e.boot === child.boot && same(e.processIdentity, child)
    && same(e.listedProcIdentity, {device: child.procDevice, inode: child.procInode})
    && exactKeys(kernel, ['type', 'attached', 'identityBound', 'requestedPID', 'exitConfirmed', 'pollEvents', 'procPathAbsent'])
    && kernel.type === 'pidfd-POLLIN' && kernel.requestedPID === child.pid && [1, 17].includes(kernel.pollEvents)
    && ['attached', 'identityBound', 'exitConfirmed', 'procPathAbsent'].every(key => kernel[key] === true), 'R33_OWNED_SCOPE_ORIGINAL_CHILD_EXIT_UNPROVEN');
  const parent = result.fixtureKernelExitProof;
  need(result.schemaVersion === 1 && result.kind === 'r33-single-entry-method-owner-result-r2' && result.nonce === payload.nonce
    && result.phase === 'native' && result.sourceProtocol === PROTOCOL && result.fixtureExitCode === 0
    && result.requestedFixturePID === fixture.pid && same(result.fixtureProcessIdentity, fixture)
    && same(identityCore(result.owner), identityCore(owner)) && same(result.fixtureResult, f)
    && result.fixtureStdoutSHA256 === sha(bytes['work/fixture.stdout.json']) && result.fixtureStderrSHA256 === sha(bytes['work/fixture.stderr.raw'])
    && result.fixturePIDFDClosed === true && result.ownerSelfPIDFDClosed === true && result.emergencyStopAttempted === false
    && result.firstFailure === null && same(result.secondaryFailures, [])
    && parent?.type === 'parent-owned-fixture-pidfd-POLLIN' && parent.requestedPID === fixture.pid && same(parent.processIdentity, fixture)
    && ['attached', 'identityBound', 'exitConfirmed', 'procPathAbsent'].every(key => parent[key] === true) && [1, 17].includes(parent.pollEvents)
    && ['actualMethodIndependentlyQualified', 'currentScopeCleanupIndependentlyVerified', 'fullProtectionQualified', 'productCodeExecuted', 'modelsInvoked', 'buildWholeProgramExecuted'].every(key => result[key] === false),
    'R33_OWNED_SCOPE_ORIGINAL_PARENT_EXIT_UNPROVEN');
  need(Array.isArray(f.descriptorLedger) && f.descriptorLedger.length > 0 && f.descriptorLedger.length <= 1000
    && f.descriptorLedgerScope === 'explicit fixture allocations and selected-function os.open/os.close; excludes standard streams and transient Popen implementation handles'
    && f.descriptorLedger.every(row => row.closeAttempted === true && row.closed === true && row.closeError === null),
    'R33_OWNED_SCOPE_ORIGINAL_DESCRIPTOR_CLOSE_UNPROVEN');
  const own = f.selfAcquisition, fd = f.childFDAcquisition;
  need(own?.numericPIDPathUsed === true && own.eofObserved === true && own.adapterMatchedPrimitiveWithoutDotEntries === true
    && own.adapterBorrowedFDStayedOpen === true && Array.isArray(own.primitiveRecords) && own.primitiveRecords.length > 0
    && own.primitiveCallsIncludingEOF === own.primitiveRecords.length + 1 && own.primitiveRecords.every(row => [24, 32, 40].includes(row.recordBytes))
    && fd?.borrowedFDStayedOpen === true && fd.getfdUsed === false && exactKeys(fd.knownPipeSlots, Object.keys(fd.knownPipeSlots ?? {}))
    && Object.keys(fd.knownPipeSlots).length === 2 && Object.values(fd.knownPipeSlots).every(row => row.matched === true), 'R33_OWNED_SCOPE_ORIGINAL_METHOD_ACQUISITION_INCOMPLETE');
  const sizes = [...new Set(own.primitiveRecords.map(row => row.recordBytes))].sort((a, b) => a - b);
  need(same(fd.childSecurity?.UID, [1000, 1000, 1000, 1000]) && same(fd.childSecurity?.GID, [1000, 1000, 1000, 1000])
    && fd.childSecurity.noNewPrivileges === '1' && exactKeys(fd.childSecurity.capabilities, ['CapEff', 'CapPrm', 'CapInh'])
    && Object.values(fd.childSecurity.capabilities).every(value => cap(value, 0)) && fd.foreignPIDRead === false && fd.targetsReadAsContents === false,
    'R33_OWNED_SCOPE_ORIGINAL_CHILD_SECURITY_CHANGED');
  const config = unitProof.configuration;
  const runCommand = ['/usr/bin/python3', '-I', root + '/control/owner.py', '--run', payload.nonce];
  const stopCommand = ['/usr/bin/python3', '-I', root + '/control/owner.py', '--stopped', payload.nonce];
  need(unitProof.kind === 'r33-single-entry-method-root-unit-proof-r2' && unitProof.nonce === payload.nonce && unitProof.unit === unit
    && unitProof.invocationId === payload.invocationId && unitProof.ownerSHA256 === payload.sourceExpected.ownerSHA256
    && unitProof.activationSHA256 === payload.activationSHA256 && unitProof.onceSHA256 === payload.onceSHA256
    && config?.rootUID === 0 && config.rootGID === 0 && config.rootCapabilityMask === 226 && config.fixtureUID === 1000 && config.fixtureGID === 1000
    && config.runtimeMaxSec === 80 && config.timeoutStopSec === 10 && config.totalParentSeconds === 90 && config.killMode === 'control-group'
    && config.killSignal === 'SIGKILL' && config.restart === 'no' && config.noNewPrivileges === true && config.ambientCapabilitiesEmpty === true && config.privateNetwork === true
    && config.execStartSHA256 === sha(JSON.stringify(runCommand)) && config.execStopPostSHA256 === sha(JSON.stringify(stopCommand))
    && config.standardOutput === 'null' && config.standardError === 'append' && config.standardErrorFile === root + '/work/owner.stderr.raw'
    && Array.isArray(unitProof.ownerStderrInitialIdentity) && unitProof.ownerStderrInitialIdentity.length === 9
    && unitProof.ownerStderrInitialIdentity.every(Number.isInteger) && same(unitProof.ownerStderrInitialIdentity.slice(2, 4), [0, 0])
    && (unitProof.ownerStderrInitialIdentity[4] & 0o170000) === 0o100000
    && (unitProof.ownerStderrInitialIdentity[4] & 0o7777) === 0o600
    && same(unitProof.ownerStderrInitialIdentity.slice(5, 7), [1, 0]) && H.test(unitProof.ownerStderrInitialIdentitySHA256 ?? '')
    && stopped.kind === 'r33-single-entry-method-owner-stopped-r2' && stopped.nonce === payload.nonce && stopped.unit === unit
    && stopped.invocationId === payload.invocationId && stopped.ownerSHA256 === payload.sourceExpected.ownerSHA256
    && stopped.activationSHA256 === payload.activationSHA256 && stopped.serviceResult === 'success' && stopped.exitCode === 'exited' && stopped.exitStatus === '0',
    'R33_OWNED_SCOPE_ORIGINAL_UNIT_LIFECYCLE_UNPROVEN');
  return {actualPhase: 'native', ownerStderrVerifiedEmpty: true, originalSinkMetadataVerifiedByPython: true, selectedSourceSHA256: SELECTED, childIdentity: child, fixtureIdentity: identityCore(fixture),
    readyHandshakeCompleted: true, releaseGateSent: true, descriptorClosed: true, naturalChildExit: true,
    originalBoundExitProof: e, parentFixtureKernelExitProof: parent, ownerProfileCapabilityMask: 226, fixtureCapabilityMask: 0,
    readyProtocolSHA256: f.readyProtocolSHA256, descriptorLedgerScope: f.descriptorLedgerScope, buildWholeProgramExecuted: false,
    actualRecordBytesObserved: sizes, actualSelfProc32And40RecordCoverage: sizes.includes(32) && sizes.includes(40)};
}

function assertHost(value, payload) {
  need(value?.schemaVersion === 1 && value.kind === 'r33-single-entry-owned-scope-host-observation-r2'
    && value.nonce === payload.nonce && value.phase === 'native' && value.sourceProtocol === PROTOCOL
    && value.contextSHA256 === sha(canonical(payload)) && same(value.scopeBinding, payload), 'R33_OWNED_SCOPE_HOST_BINDING_CHANGED');
  need(['remoteMutationsPerformed', 'wholeProcCensusExecuted', 'externalHoldersAbsenceProved',
    'fullProtectionQualified', 'productAccepted', 'nodeACKRead', 'queueRead'].every(key => value[key] === false), 'R33_OWNED_SCOPE_SCOPE_EXPANDED');
  need(value.recordsStable === true && value.namespaceStable === true && value.sourceRawBindingVerified === true
    && value.actualMethodSubsetSourceFactsVerified === false && exactKeys(value.originalRawFileRefs, RECORDS), 'R33_OWNED_SCOPE_SOURCE_FACTS_INCOMPLETE');
  for (const name of RECORDS) {
    const row = value.originalRawFileRefs[name], expected = payload.expectedRawFiles[name];
    need(row?.readComplete === true && row.sha256 === expected.sha256 && Number.isSafeInteger(row.bytes) && row.bytes >= 0
      && row.bytes <= 1048576 && (expected.bytes === null || row.bytes === expected.bytes)
      && typeof row.base64 === 'string', 'R33_OWNED_SCOPE_RECORD_INCOMPLETE');
    const raw = Buffer.from(row.base64, 'base64');
    need(raw.toString('base64') === row.base64 && raw.length === row.bytes && sha(raw) === expected.sha256, 'R33_OWNED_SCOPE_RECORD_BYTES_CHANGED');
  }
  need(typeof value.currentOwnedScopeCleanupVerified === 'boolean' && Array.isArray(value.physicalFrames) && value.physicalFrames.length === 2,
    'R33_OWNED_SCOPE_CURRENT_FRAME_INCOMPLETE');
  const unit = payload.owner.unit;
  let clean = true;
  for (const frame of value.physicalFrames) {
    need(frame?.boot === payload.owner.boot && Array.isArray(frame.actors) && frame.actors.length === 3
      && same(frame.actors.map(row => row.role), ['owner', 'fixture', 'child']), 'R33_OWNED_SCOPE_ACTOR_FRAME_CHANGED');
    for (const row of frame.actors) {
      need(row.pid === payload[row.role].pid && typeof row.complete === 'boolean' && [true, false, null].includes(row.present),
        'R33_OWNED_SCOPE_CURRENT_ACTOR_CHANGED');
      if (row.complete && row.present === false) need(row.currentPathAbsent === true && row.historicalExitInferredFromAbsence === false,
        'R33_OWNED_SCOPE_CURRENT_ABSENCE_UNPROVEN');
      if (row.complete && row.present === true) need(row.identityMatches === true && row.pidfdBound === true
        && [0, 1, 17].includes(row.pollEvents) && Number.isSafeInteger(row.namespaceRelatedFDOrLinkCount) && row.namespaceRelatedFDOrLinkCount >= 0,
        'R33_OWNED_SCOPE_CURRENT_PRESENT_UNBOUND');
      clean &&= row.complete && row.present === false;
    }
    const u = frame.unit?.properties, c = frame.cgroup, sockets = frame.namespaceSockets;
    need(typeof frame.unit?.complete === 'boolean' && u?.Id === unit && /^[0-9]+$/.test(u.MainPID ?? '')
      && typeof frame.unit.currentStopped === 'boolean' && typeof c?.complete === 'boolean' && typeof c.absent === 'boolean'
      && Array.isArray(c.members) && c.members.every(pid => Number.isSafeInteger(pid) && pid > 0) && new Set(c.members).size === c.members.length
      && typeof sockets?.complete === 'boolean' && Number.isSafeInteger(sockets.count) && sockets.count >= 0
      && Array.isArray(sockets.rows) && sockets.rows.length === sockets.count, 'R33_OWNED_SCOPE_CURRENT_UNIT_FRAME_INCOMPLETE');
    const absentUnit = u.LoadState === 'not-found' && u.ActiveState === 'inactive' && u.SubState === 'dead'
      && u.MainPID === '0' && u.ControlGroup === '' && u.InvocationID === '';
    const stoppedKnownUnit = u.LoadState === 'loaded' && u.InvocationID === payload.invocationId
      && ['inactive', 'failed'].includes(u.ActiveState) && u.MainPID === '0' && ['', '/system.slice/' + unit].includes(u.ControlGroup);
    const stopped = absentUnit || stoppedKnownUnit;
    need(frame.unit.currentStopped === stopped, 'R33_OWNED_SCOPE_CURRENT_UNIT_STATE_CHANGED');
    clean &&= frame.unit.complete && stopped && c.complete && c.members.length === 0 && sockets.complete && sockets.count === 0;
  }
  need(same(value.physicalFrames[0], value.physicalFrames[1]) && value.currentOwnedScopeCleanupVerified === clean,
    'R33_OWNED_SCOPE_CURRENT_CLEANUP_CLAIM_CHANGED');
  return value;
}

function projectPhysicalFrames(value) {
  return value.physicalFrames.map(frame => ({boot: frame.boot, actors: frame.actors.map(row => ({role: row.role, pid: row.pid,
    present: row.present, complete: row.complete, errorCode: typeof row.errorCode === 'string' && /^R33_OWNED_[A-Z0-9_]+$/.test(row.errorCode) ? row.errorCode : null,
    errno: Number.isSafeInteger(row.errno) ? row.errno : null,
    readPhase: typeof row.readPhase === 'string' && /^[A-Z0-9_]{1,80}$/.test(row.readPhase) ? row.readPhase : null,
    namespaceRelatedFDOrLinkCount: Number.isSafeInteger(row.namespaceRelatedFDOrLinkCount) ? row.namespaceRelatedFDOrLinkCount : null})),
  unit: Object.fromEntries(['Id', 'LoadState', 'ActiveState', 'SubState', 'MainPID', 'ControlGroup', 'InvocationID'].map(key => [key, frame.unit.properties[key] ?? null])),
  cgroup: {absent: frame.cgroup.absent, complete: frame.cgroup.complete, memberCount: frame.cgroup.members.length},
  namespaceSockets: {complete: frame.namespaceSockets.complete, count: frame.namespaceSockets.count}}));
}

async function defaultReadRoot(payload, program) {
  const {lanProfile, python} = await import('./managed-server-client.mjs');
  const result = spawnSync('ssh', ['-F', lanProfile, '-o', 'BatchMode=yes', 'jarvis-101', 'sudo -n python3 -'],
    {input: python(payload, program.toString('utf8')), timeout: 60000, windowsHide: true, maxBuffer: 8 * 1024 ** 2});
  return {status: result.status, signal: result.signal ?? null, stdout: Buffer.from(result.stdout ?? ''), stderr: Buffer.from(result.stderr ?? ''), errorCode: result.error?.code ?? null};
}

export async function verifySingleEntryOwnedScopeR33R2({activation = singleEntryOwnedScopeR33R2Activation} = {}, deps = {}) {
  if (activation === null || activation?.review == null || activation?.execution == null) return {schemaVersion: 1,
    kind: 'r33-single-entry-owned-scope-reader-preparation-r2', ready: false, reason: 'R33_OWNED_SCOPE_ACTIVATION_NOT_PINNED',
    remoteOperations: false, localIOPerformed: false, actualMethodSubsetIndependentlyQualified: false,
    currentOwnedScopeCleanupVerified: false, fullProtectionQualified: false, productCodeExecuted: false, modelsInvoked: false};
  const a = validateActivation(activation);
  const d = {readLocal: readSingleEntryOwnedScopeLocalR33R2, readRoot: defaultReadRoot, writePrivateRaw: privateRaw,
    writePublic: publicValue, now: Date.now, ...deps};
  const refs = [...Object.values(SOURCE), ...Object.values(a.execution), {path: SELF, sha256: a.callerSHA256}, a.observer, a.observationHostProgram, a.review];
  const before = [];
  for (const item of refs) { const raw = Buffer.from(await d.readLocal(item.path)); need(sha(raw) === item.sha256, 'R33_OWNED_SCOPE_SOURCE_CHANGED'); before.push(raw); }
  const rows = new Map(refs.map((item, i) => [item.path, before[i]]));
  const review = JSON.parse(rows.get(a.review.path)), sourceReview = JSON.parse(rows.get(a.execution.sourceReview.path));
  const program = singleEntryOwnedScopeR33R2HostProgram(rows.get(HOST));
  need(program.equals(rows.get(a.observationHostProgram.path)) && sha(program) === a.observationHostProgram.sha256,
    'R33_OWNED_SCOPE_GENERATED_HOST_CHANGED');
  need(review.kind === 'r33-single-entry-owned-scope-independent-local-review-r2' && review.callerSHA256 === a.callerSHA256
    && review.observerSHA256 === a.observer.sha256 && review.hostProgramSHA256 === a.observationHostProgram.sha256
    && review.staticPreparationReady === true && review.remainingP0P1 === 0 && review.remoteOperations === false,
    'R33_OWNED_SCOPE_READER_REVIEW_REQUIRED');
  need(sourceReview.kind === 'r33-single-entry-bound-method-parent-independent-local-review-r2' && sourceReview.ownerSHA256 === a.execution.owner.sha256
    && sourceReview.starterSHA256 === a.execution.starter.sha256 && sourceReview.hostProgramSHA256 === a.execution.executionHostProgram.sha256
    && sourceReview.fixtureSHA256 === SOURCE.fixture.sha256 && sourceReview.staticPreparationReady === true
    && sourceReview.remainingP0P1 === 0 && sourceReview.remoteOperationsPerformed === false && sourceReview.actualMethodIndependentlyQualified === false,
    'R33_OWNED_SCOPE_PARENT_REVIEW_REQUIRED');
  let payload;
  try {
    payload = assertSingleEntryOwnedScopeContextR33R2(JSON.parse(rows.get(JP)), JSON.parse(rows.get(a.execution.start.path)),
      JSON.parse(rows.get(a.execution.terminal.path)), a.execution);
  } catch (error) {
    // A missing original actor/report is a local preparation refusal, not an invitation
    // to read again, invent an EXIT identity, or dispatch a second fixture.
    for (let i = 0; i < refs.length; i++) need(Buffer.from(await d.readLocal(refs[i].path)).equals(before[i]), 'R33_OWNED_SCOPE_SOURCE_CHANGED_AFTER');
    return {schemaVersion: 1, kind: 'r33-single-entry-owned-scope-reader-preparation-r2', ready: false,
      reason: /^R33_OWNED_SCOPE_[A-Z0-9_]+$/.test(error?.message ?? '') ? error.message : 'R33_OWNED_SCOPE_ORIGINAL_CONTEXT_INCOMPLETE',
      sourceRefs: refs, sourceRefsStable: true, remoteOperations: false, remoteReadAttempted: false,
      localIOPerformed: true, rawReportsRead: false, originalContextIncomplete: true,
      actualMethodSubsetIndependentlyQualified: false, currentOwnedScopeCleanupVerified: false,
      fullProtectionQualified: false, productCodeExecuted: false, modelsInvoked: false};
  }
  const terminalMethodState = JSON.parse(rows.get(a.execution.terminal.path));
  const parentMethodPassed = terminalMethodState.status === 'passed' && terminalMethodState.methodSubsetProducerPassed === true;
  let transport, remoteReadAttempted = false, host = null, kernelFacts = null, methodEvidenceErrorCode = null, transportRef = null, hostRef = null, rawFileRefs = null, errorCode = null, reportedRootReadErrors = null;
  try {
    remoteReadAttempted = true;
    transport = await d.readRoot(payload, program);
    need(transport && Object.hasOwn(transport, 'status') && Buffer.isBuffer(transport.stdout) && Buffer.isBuffer(transport.stderr), 'R33_OWNED_SCOPE_TRANSPORT_SHAPE_CHANGED');
    const packet = Buffer.from(JSON.stringify({kind: 'r33-single-entry-owned-scope-original-transport-r2', at: new Date(d.now()).toISOString(),
      programSHA256: sha(program), payloadSHA256: sha(canonical(payload)), status: transport.status, signal: transport.signal,
      errorCode: transport.errorCode ?? null, stdoutBase64: transport.stdout.toString('base64'), stderrBase64: transport.stderr.toString('base64')}) + '\n');
    transportRef = await d.writePrivateRaw('transport', packet); // Before parsing or interpreting the response.
    need(transport.status === 0 && transport.signal === null, 'R33_OWNED_SCOPE_ROOT_READ_INCOMPLETE');
    hostRef = await d.writePrivateRaw('host-raw', transport.stdout);
    need(hostRef.sha256 === sha(transport.stdout) && hostRef.bytes === transport.stdout.length, 'R33_OWNED_SCOPE_RAW_SAVE_CHANGED');
    const parsedHost = JSON.parse(transport.stdout.toString('utf8'));
    if (Array.isArray(parsedHost?.readErrors)) reportedRootReadErrors = parsedHost.readErrors.slice(0, 8).map(row => ({
      errorCode: typeof row?.errorCode === 'string' && /^R33_OWNED_[A-Z0-9_]+$/.test(row.errorCode) ? row.errorCode : 'R33_OWNED_READ_INCOMPLETE',
      errno: Number.isSafeInteger(row?.errno) ? row.errno : null,
      readPhase: typeof row?.readPhase === 'string' && /^[A-Z0-9_]{1,80}$/.test(row.readPhase) ? row.readPhase : null,
      secondaryCloseFailures: Array.isArray(row?.secondaryCloseFailures) ? row.secondaryCloseFailures.slice(0, 8).map(close => ({
        errorCode: typeof close?.errorCode === 'string' && /^R33_OWNED_[A-Z0-9_]+$/.test(close.errorCode) ? close.errorCode : 'R33_OWNED_READ_INCOMPLETE',
        errno: Number.isSafeInteger(close?.errno) ? close.errno : null,
        readPhase: typeof close?.readPhase === 'string' && /^[A-Z0-9_]{1,80}$/.test(close.readPhase) ? close.readPhase : null})) : []}));
    host = assertHost(parsedHost, payload);
    try {
      kernelFacts = assertOriginalSingleEntryMethodEvidenceR33R2(host.originalRawFileRefs, payload);
      need(host.originalKernelFactsVerified === true, 'R33_OWNED_SCOPE_PYTHON_KERNEL_FACTS_INCOMPLETE');
    }
    catch (error) { kernelFacts = null; methodEvidenceErrorCode = /^R33_OWNED_SCOPE_[A-Z0-9_]+$/.test(error?.message ?? '') ? error.message : 'R33_OWNED_SCOPE_METHOD_EVIDENCE_INCOMPLETE'; }
    rawFileRefs = {};
    for (const name of RECORDS) { const raw = Buffer.from(host.originalRawFileRefs[name].base64, 'base64'); const saved = await d.writePrivateRaw('record', raw);
      need(saved.sha256 === host.originalRawFileRefs[name].sha256 && saved.bytes === raw.length, 'R33_OWNED_SCOPE_RAW_SAVE_CHANGED'); rawFileRefs[name] = saved; }
  } catch (error) { errorCode = /^R33_OWNED_SCOPE_[A-Z0-9_]+$/.test(error?.message ?? '') ? error.message : 'R33_OWNED_SCOPE_OBSERVATION_INCOMPLETE'; host = null; }
  let sourcesStable = true;
  try { for (let i = 0; i < refs.length; i++) need(Buffer.from(await d.readLocal(refs[i].path)).equals(before[i]), 'R33_OWNED_SCOPE_SOURCE_CHANGED_AFTER'); }
  catch (error) { sourcesStable = false; host = null; errorCode = 'R33_OWNED_SCOPE_SOURCE_CHANGED_AFTER'; }
  const currentCleanup = Boolean(host && sourcesStable && host.currentOwnedScopeCleanupVerified === true);
  const methodQualified = Boolean(host && sourcesStable && kernelFacts && parentMethodPassed);
  if (host && !parentMethodPassed && methodEvidenceErrorCode === null) methodEvidenceErrorCode = 'R33_OWNED_SCOPE_PARENT_PRODUCER_NOT_PASSED';
  const ready = methodQualified && currentCleanup;
  const value = {schemaVersion: 1, kind: 'r33-single-entry-bound-method-independent-result-r2', at: new Date(d.now()).toISOString(), nonce: payload.nonce,
    actualPhase: 'native', ready, errorCode, methodEvidenceErrorCode, reportedRootReadErrors, sourceRefs: refs, readerIndependentReview: a.review,
    executionHostProgram: a.execution.executionHostProgram, independentObservationHostProgram: a.observationHostProgram,
    hostProgramSHA256: sha(program), payloadSHA256: sha(canonical(payload)), sourceRefsStable: sourcesStable,
    transportEvidence: transportRef, hostOriginalBytes: hostRef, rawFileRefs,
    actualMethodSubsetIndependentlyQualified: methodQualified, currentOwnedScopeCleanupVerified: currentCleanup,
    generatedNativeSHA256: SOURCE.native.sha256, generatedBuildStaticMappingSHA256: SOURCE.buildStatic.sha256,
    actualSelfProc32And40RecordCoverage: methodQualified ? kernelFacts.actualSelfProc32And40RecordCoverage : false,
    buildWholeProgramExecuted: false, wholeProcCensusExecuted: false, externalHoldersAbsenceProved: false,
    historicalNamespaceIdentityRecorded: false, namespaceEvidenceRetained: Boolean(host && sourcesStable && host.namespaceStable), namespaceEvidenceDeletionPerformed: false,
    fullProtectionQualified: false, globalCleanupQualified: false, productCodeExecuted: false, modelsInvoked: false,
    remoteReadAttempted, remoteReadPerformed: transport === undefined ? null : true, mutationsPerformed: false, originalKernelFacts: methodQualified ? kernelFacts : null,
    currentScopeSummary: host ? {physicalFrames: projectPhysicalFrames(host), recordsStable: host.recordsStable,
      namespaceStable: host.namespaceStable, namespaceIdentity: host.namespaceIdentity,
      namespaceMetadataSHA256: host.namespaceMetadataSHA256} : null};
  const result = await d.writePublic(value);
  return {...value, receipt: result};
}
