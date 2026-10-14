/** Pure source-union preparation. Supplied bytes are local evidence, never runtime admission. */
import {createHash} from 'node:crypto';

const hash = raw => createHash('sha256').update(raw).digest('hex');
const need = (condition, code) => { if (!condition) throw new Error(code); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
 && [Object.prototype, null].includes(Object.getPrototypeOf(value))
 && Object.values(Object.getOwnPropertyDescriptors(value)).every(d => Object.hasOwn(d, 'value'));
const keys = (value, expected) => plain(value) && Object.keys(value).length === expected.length
 && expected.every(key => Object.hasOwn(value, key));
const freeze = value => {
 if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
 return value;
};
const ref = (path, sha256, bytes) => ({path, sha256, bytes});
const compare = (a, b) => {
 const left = Array.from(a, c => c.codePointAt(0)), right = Array.from(b, c => c.codePointAt(0));
 for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i] - right[i];
 return left.length - right.length;
};
const canonicalPath = value => typeof value === 'string' && value.length > 0 && value.length <= 1024
 && !value.includes('\\') && !/[\x00-\x1f\x7f]/.test(value)
 && value.split('/').every(part => part && part !== '.' && part !== '..');
const artifactRoot = '/var/lib/jarvis-development/101/r32-truth-artifacts/9e83e22a1ebfcdfc699876860879d8acefe220d3abf49e802333719b549299e3/runtime';
const relativeTest = 'apps/server/src/modules/test/truth-gate.integration.test.ts';
const absoluteTest = `/work/source/${relativeTest}`;
const baseSHA = 'f4a86cfb949863b6f5cb0dd80dde83f8b97ea4a66e1e047fbd77fc90f92d53e2';
const effectiveSHA = 'b3d6fa645cf90044fb70f8a29de5aee33bd1ee9ad33b4d770e374caa6fd696ed';
const beforeAllSHA = '62ba2fc4ffbb6c648551ce5b50c8ad4b8908b5801f3cfcf9d01cc83f627a5a9f';
const afterAllSHA = '7d1991bd08b5f8ea17c006ed48d11ecb822f82afc93570a4a4b41dbacbcbac1f';

export const pg4SourceWitnessR33Inputs = freeze({
 baseIndex: ref('artifacts/software-factory/goals-r29/r32-source-public-index-1791837951701-4991420c-d4b4-42f0-a8eb-f684d32a8127.json', 'c2a18d38676c0df2b3868095e0a27fb236acf1092574bdda81c52edb7f43d927', 110312),
 overlayIndex: ref('artifacts/software-factory/goals-r29/r33-four-fixture-source-public-index-1791868427390-693228d2-4a53-411a-9ba3-173ad79cd061.json', 'b79e5d154fd21abfa422428a622ef2ba8cd3b6953bdc071079fd65c117da136e', 109552),
 runtimeContract: ref('artifacts/software-factory/goals-r29/r32-actual-frozen-artifact-contract-27f8687bf5678a51.json', '27f8687bf5678a519684d4b86f21ed6147e923591ec4ba75cc5a28ec82cb7e71', 3354),
 runtimeQualification: ref('artifacts/software-factory/goals-r29/runtime-artifact-r32-fullbyte-independent-result-1791846219076-87040bb0-abac-496b-904e-4cc01583cc40.json', 'f46c66399d9e6289b4c8a75de57e529f6e50563823ee948ed6f349a03e1d9685', 34230),
 baseTest: ref(`.jarvis-dev/workspaces/msf-targets-r32/source/${relativeTest}`, '28dee1022f6bce8bbde8f36d9976509524a1a41a0eb7a1c4288541236b0efa9f', 47126),
 overlayTest: ref(`.jarvis-dev/workspaces/msf-targets-r33/source/${relativeTest}`, 'c5645f7567232c7fc797f46f06bc8adc1f2517c18be305daaad01ac9248c3e1a', 47163),
 oracle: ref('scripts/factory-pg4-only-report-oracle-r33.mjs', '3ec84a67e73e81732ef9710af7fab1ffbd522456b6a6db3434fc442b02b7b723', 16172),
 hookReporter: ref('scripts/factory-pg4-hook-reporter-r33.mjs', 'ea8fc9d658cc19c9cca9a9e00a615756f4943c9f5e41e80fed998330d1d7f342', 3464),
});

function manifest(value) {
 need(Array.isArray(value) && value.length === 625, 'R33_SOURCE_WITNESS_MANIFEST_COUNT');
 const result = new Map();
 for (const entry of value) {
  need(keys(entry, ['path', 'sha256', 'bytes']) && canonicalPath(entry.path)
   && /^[a-f0-9]{64}$/.test(entry.sha256) && Number.isSafeInteger(entry.bytes) && entry.bytes >= 0
   && !result.has(entry.path), 'R33_SOURCE_WITNESS_MANIFEST_ENTRY');
  result.set(entry.path, {...entry});
 }
 return result;
}

function fingerprints(entries) {
 const tree = new Map(), stream = [], flat = [...entries.values()].sort((a, b) => compare(a.path, b.path));
 for (const entry of flat) {
  const parts = entry.path.split('/'); let directory = tree;
  for (let i = 0; i < parts.length; i++) {
   const name = parts[i], previous = directory.get(name);
   if (i === parts.length - 1) { need(previous === undefined, 'R33_SOURCE_WITNESS_PATH_COLLISION'); directory.set(name, entry); }
   else {
    need(previous === undefined || previous instanceof Map, 'R33_SOURCE_WITNESS_PATH_COLLISION');
    if (previous === undefined) directory.set(name, new Map());
    directory = directory.get(name);
   }
  }
 }
 const visit = directory => { for (const name of [...directory.keys()].sort(compare)) {
  const item = directory.get(name); if (item instanceof Map) visit(item); else stream.push(item);
 }};
 visit(tree);
 const identity = ordered => hash(ordered.map(entry => `${entry.path}\0${entry.sha256}\n`).join(''));
 return {directoryDfsSHA256: identity(stream), flatPathSortedSHA256: identity(flat),
  files: entries.size, bytes: flat.reduce((sum, entry) => sum + entry.bytes, 0)};
}

function inverseTest(raw) {
 let text = raw.toString('utf8');
 const edits = [
  ['cases: Array<{ id: string; flowId: string | null; mode: string; required: boolean }>', 'cases: Array<{ id: string; mode: string; required: boolean }>'],
  ["[{ id: 'AT-MANUAL', flowId: null, mode: 'manual', required: true }]", "[{ id: 'AT-MANUAL', mode: 'manual', required: true }]"],
 ];
 for (const [current, original] of edits) {
  need(text.split(current).length === 2, 'R33_SOURCE_WITNESS_INVERSE_ANCHOR'); text = text.replace(current, original);
 }
 return Buffer.from(text, 'utf8');
}

/** No filesystem, module evaluation, persistence, runtime qualification or admission. */
export function buildPG4SourceWitnessR33(suppliedRaw = null) {
 const names = Object.keys(pg4SourceWitnessR33Inputs);
 need(keys(suppliedRaw, names), 'R33_SOURCE_WITNESS_RAW_INPUT_REQUIRED');
 const raw = {};
 // All byte pins precede any JSON parsing; copied buffers cannot later mutate this calculation.
 for (const name of names) {
  const pin = pg4SourceWitnessR33Inputs[name], input = suppliedRaw[name];
  need(Buffer.isBuffer(input) && input.length === pin.bytes, 'R33_SOURCE_WITNESS_RAW_SIZE');
  raw[name] = Buffer.from(input);
  need(hash(raw[name]) === pin.sha256, 'R33_SOURCE_WITNESS_RAW_CHANGED');
 }
 const base = JSON.parse(raw.baseIndex.toString('utf8')), overlay = JSON.parse(raw.overlayIndex.toString('utf8'));
 const contract = JSON.parse(raw.runtimeContract.toString('utf8')), historical = JSON.parse(raw.runtimeQualification.toString('utf8'));
 need(base.kind === 'r32-truth-gate-public-source-index' && overlay.kind === 'r33-four-fixture-public-source-index', 'R33_SOURCE_WITNESS_INDEX_KIND');
 const baseEntries = manifest(base.manifest), overlayEntries = manifest(overlay.manifest);
 const original = fingerprints(baseEntries), authored = fingerprints(overlayEntries);
 need(original.directoryDfsSHA256 === baseSHA && original.files === 625 && original.bytes === 18413560
  && base.candidate.sha256 === baseSHA && base.candidate.files === 625 && base.candidate.bytes === original.bytes,
 'R33_SOURCE_WITNESS_BASE_FINGERPRINT');
 need(authored.directoryDfsSHA256 === effectiveSHA && authored.flatPathSortedSHA256 === '7b06a36a1cdf01bdb7c020a378abf1aa16b36d78fa0fcf006438e0df7391b0ed'
  && authored.files === 625 && authored.bytes === 18413597
  && overlay.candidate.directoryDfsSHA256 === effectiveSHA && overlay.candidate.flatPathSortedSHA256 === authored.flatPathSortedSHA256
  && overlay.candidate.files === 625 && overlay.candidate.bytes === authored.bytes, 'R33_SOURCE_WITNESS_OVERLAY_FINGERPRINT');
 const changed = [];
 for (const [path, before] of baseEntries) {
  const after = overlayEntries.get(path); need(after !== undefined, 'R33_SOURCE_WITNESS_PATH_SET_CHANGED');
  if (before.sha256 !== after.sha256 || before.bytes !== after.bytes) changed.push(path);
 }
 need(changed.length === 1 && changed[0] === relativeTest, 'R33_SOURCE_WITNESS_EXTRA_DELTA');
 for (const [name, entry] of [['baseTest', baseEntries.get(relativeTest)], ['overlayTest', overlayEntries.get(relativeTest)]]) {
  need(entry.sha256 === pg4SourceWitnessR33Inputs[name].sha256 && entry.bytes === raw[name].length, 'R33_SOURCE_WITNESS_TEST_INDEX_MISMATCH');
 }
 need(inverseTest(raw.overlayTest).equals(raw.baseTest), 'R33_SOURCE_WITNESS_TEST_INVERSE_FAILED');
 const union = new Map(baseEntries); union.set(relativeTest, overlayEntries.get(relativeTest));
 const computedUnion = fingerprints(union);
 need(computedUnion.directoryDfsSHA256 === authored.directoryDfsSHA256 && computedUnion.bytes === authored.bytes
  && computedUnion.flatPathSortedSHA256 === authored.flatPathSortedSHA256, 'R33_SOURCE_WITNESS_UNION_CHANGED');
 need(contract.kind === 'r32-frozen-application-runtime-artifact' && contract.root === artifactRoot
  && contract.rootIdentity.device === 66306 && contract.rootIdentity.inode === 7924569
  && contract.treeSHA256 === '9e83e22a1ebfcdfc699876860879d8acefe220d3abf49e802333719b549299e3'
  && contract.manifestSHA256 === 'b4f80840523e838500925387c332aad67b28083a448a17b04ae01999f4b6a8f7'
  && contract.metadataSHA256 === '07924f72531aa654275d09be16f238210a9c6c7985054fc64e1c10d8bf9af834'
  && contract.source.fingerprint === baseSHA && contract.source.files === 625 && contract.source.bytes === original.bytes
  && contract.sourceIndexSHA256 === pg4SourceWitnessR33Inputs.baseIndex.sha256
  && contract.readOnlyRootOwned === true && contract.twoCompleteReadbacks === true,
 'R33_SOURCE_WITNESS_RUNTIME_CONTRACT');
 need(historical.kind === 'software-factory-r32-runtime-artifact-independent-read' && historical.ready === true
  && historical.actualFrozenArtifactIndependentlyRead === true && historical.fullByteReadbacksVerified === true
  && JSON.stringify(historical.artifact) === JSON.stringify(contract), 'R33_SOURCE_WITNESS_HISTORICAL_RUNTIME_BINDING');

 const inputRefs = Object.fromEntries(names.map(name => [name, {...pg4SourceWitnessR33Inputs[name]}]));
 return freeze({
  schemaVersion: 1, kind: 'r33-pg4-only-source-witness-preparation', ready: false,
  suppliedBytesPinned: true, suppliedSourceUnionVerified: true, suppliedHistoricalRuntimeBindingVerified: true,
  evidenceAuthenticityVerified: false, independentIOConsumerRequired: true, inputRefs,
  authoredUnion: {...computedUnion, kind: 'explicit-readonly-authored-source-virtual-union',
   indexSHA256: pg4SourceWitnessR33Inputs.overlayIndex.sha256, changedPaths: [relativeTest], otherFilesIdentical: 624,
   inverseTwoLineTestBytesVerified: true, newPhysical625Root: false, newFullR33Artifact: false},
  runtimeIdentityRequired: {root: contract.root, rootIdentity: {...contract.rootIdentity}, manifestPath: contract.manifestPath,
   manifestSHA256: contract.manifestSHA256, treeSHA256: contract.treeSHA256, metadataSHA256: contract.metadataSHA256,
   buildProofSHA256: contract.buildProofSHA256, source: {...contract.source}, sourceIndexSHA256: contract.sourceIndexSHA256,
   productDistAndInstalledDependencies: 'original R32 entity bytes outside the authored625 projection'},
  oracleSourceTemplate: {
   runtime: {contractRef: {path: inputRefs.runtimeContract.path, sha256: inputRefs.runtimeContract.sha256}, currentByteReadbackRef: null, baseSourceSHA256: baseSHA},
   overlay: {metadataRef: null, mountRef: null, readOnly: null, path: absoluteTest, sha256: inputRefs.overlayTest.sha256, bytes: inputRefs.overlayTest.bytes},
   effective: {evidenceRef: null, kind: 'explicit-readonly-authored-source-virtual-union', sha256: effectiveSHA,
    files: 625, bytes: 18413597, indexSHA256: inputRefs.overlayIndex.sha256, newFullR33Artifact: false},
  },
  actualEvidenceRequired: {
   runtime: {currentFullByteReadbackRef: null, originalManifestRawByteRef: null, originalArtifactIdentityRef: null},
   overlay: {freezeReceiptRef: null, linuxIdentity: null, originalMetadataRawRef: null,
    requiredUID: 0, requiredGID: 0, requiredMode: '0444', requiredNlink: 1, protectedAncestorProofRef: null},
   effective: {runnerContainerIdentityRef: null, originalMountInfoRef: null, canonicalNestedReadonlyMountRef: null,
    uid1000DataOnly625ReadbackRef: null, runtimeAndOverlayBeforeAfterRefs: null},
   framework: {version: '2.1.9', bundleQualificationRef: null, actualBundleRef: null,
    sourceRefs: {runnerRun: null, runnerTasks: null, runtimeDefaultRunner: null, jsonReporter: null},
    actualPackageVersionRef: null, actualDefaultRunnerAndCLIRef: null, originalGeneratedConfigRawRef: null,
    customRunner: false, configSemantics: 'locked-default-equivalent',
    sourceRoleBoundary: 'installed bundle paths, hashes and waiting semantics require actual runtime bytes; upstream source links are insufficient'},
   hooks: {testSHA256: inputRefs.overlayTest.sha256, beforeAllSourceSHA256: beforeAllSHA, afterAllSourceSHA256: afterAllSHA,
    supplementalReporterSource: {...inputRefs.hookReporter}, actualReporterLoadedRef: null,
    originalVitestJSONRef: null, originalSupplementaryHookReportRef: null, originalProcessExitRef: null,
    actualBeforeAllState: null, actualAfterAllState: null,
    poolEndEvidenceKind: 'derived-from-frozen-await-db-end-and-afterAll-pass', independentPoolEndEventObserved: false},
  },
  syntheticUpstreamContext: true, selectedPGDenominator: 4, originalFrameworkCases: 15,
  historicalNative1AndHTTP34Only: true, newNativeOrHTTPStage: false,
  actualRuntimeOrOverlayRead: false, actualFrameworkQualified: false, actualHooksQualified: false,
  actualPG4Qualified: false, newR33BuildQualified: false, fullProtectionQualified: false,
  operationalActivation: null, remoteOperations: false, modelsInvoked: false, productCodeExecuted: false, productAccepted: false,
 });
}
