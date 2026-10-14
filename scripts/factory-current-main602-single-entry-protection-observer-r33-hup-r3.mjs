/** Pure route preparation. The caller owns all IO authorization and evidence capture. */
import {createHash} from 'node:crypto';
import {canonical} from './run-factory-main-repair-r26.mjs';
import {targetCleanupR29HostProgram} from './verify-factory-target-cleanup-r29.mjs';
import {buildCleanupR29HostProgram} from './verify-factory-truth-gate-build-cleanup-r29.mjs';
import {currentMainProtectionR33HostProgram,currentMainProtectionR33Contract} from './verify-factory-current-main602-protection-contract-r33-proof-r2.mjs';
import {singleEntryBoundCensusR33Generate} from './factory-single-entry-bound-census-r33.mjs';
import {boundedHupCensusR33Generate} from './factory-bounded-hup-census-r33.mjs';

const need = (value, code) => {if (!value) throw Error(code)};
const sha = value => createHash('sha256').update(value).digest('hex');
const KIND = 'software-factory-r33-current-main602-single-entry-hup-r3-protection-observation';
const VERSION = 'r33-current-main602-getdents47-hup-r3-source-v1';
const GETDENTS_METHOD = Object.freeze({
  kind: 'r33-current-main602-single-entry-proof-r2-protection-source-method', version: 1,
  generatorSHA256: '7f10715ae744a24117edc34a5d44d2478400a878b77044be289aa616f406ead5',
  moduleSHA256: 'ab981cf22e75c75946a85150bffbd051ece574143446fd6b22f6a383bc44c6d8',
  boundNativeSHA256: 'b357b2d4afaab2938a5e226d42ffbe6d12d3757f0973488ad696108761a36a78',
  boundBuildSHA256: 'e2385dcb6001fcc1524a72edac61fc671e83be62339308daabfb5822dda8c1ba',
  nativeSHA256: '2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73',
  buildSHA256: '909f014941f1adbe3adf62a1dcd8d783c48f292c41f936c339cb293a2d0f7188',
  acquisition: 'one getdents64 record per 47-byte read; borrowed original held directory cursor',
  pidCountLimit: 100000, fdEntryCountLimit: 100000, skipOnlyImplicitScandirDots: true,
  getfdFallback: false, legacyFirstReadSubphasePreserved: true,
  acquisitionExceptionAttributePublishedByLegacySerializer: false,
  entryToPIDRaceEliminated: false, oldUnknownsReclassified: false,
});
const METHOD = Object.freeze({
  kind: 'r33-current-main602-single-entry-hup-r3-protection-source-method', version: 1,
  getdents: GETDENTS_METHOD,
  hup: Object.freeze({
    kind: 'r33-bounded-hup-census-source-method', version: 1,
    transformerSHA256: '57d207f9e173f07891acb9ab050a0e818840dd87d30c9a150c4b88ec2aa53a13',
    helperSHA256: 'c743dcb7c14dd245074c903757747f55721cfe3b164be2af5b4e553898de3a3b',
    nativeInputSHA256: '2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73',
    buildInputSHA256: '909f014941f1adbe3adf62a1dcd8d783c48f292c41f936c339cb293a2d0f7188',
    pidfdExitProofSHA256: 'c0e02a02fe488c474e879c80cc89c2c445aead72c42275f9f0b0f264cc4d660a',
    perAttachmentMilliseconds: 250, sharedPerCensusMilliseconds: 1000, enclosingAlarmSeconds: 150,
    firstEligibleStartsSharedBudget: true, firstPollReused: true, oneSharedBudgetAcrossBothSites: true,
    onePythonPollPerAttachment: true, oneKernelSyscallClaimed: false,
    eventMaskRequested: 0, onlyAcceptedWaitMask: 16, originalExitProofUnchanged: true,
    legacyReadErrorFallbackBodiesUnchanged: true, legacyErrorSchemaUnchanged: true,
    newWaitOSErrorCannotUseLegacyFallback: true, originalFinalizerOwnsDescriptor: true,
    automaticRetry: false, oldUnknownsReclassified: false,
  }),
  nativeSHA256: '549c8b8e4711492c75d3b9fccad592a3977f02f556ce15a558a2751a81ba3165',
  buildSHA256: '1d4548a82fa40499aca346875c3d9f762967c45c40a1b782c4cc4f8832a9dcdf',
});
const ORIGINAL = Object.freeze({
  inventory: currentMainProtectionR33Contract.stockProgramSHA256,
  native: '66a241993d910da443bc1b3776ab4c6efc33bc1b44401c7dddff4caa06754155',
  build: '66e84cadadd232daa58d62b2ee7fd58c6f61cf08baec4e124e7c4ef9a237f8d6',
});
const PARAMS = Object.freeze([
  currentMainProtectionR33Contract.stockParametersSHA256,
  'f75e008012f8e6dafb9cbc1f0cd48c8be78aab9238e2ce16eef6fa53bc94f3ff',
  '905a38ec0990aba896ebdcd148289bf6786469e6d4491b475de85bf6e22242e9',
  currentMainProtectionR33Contract.stockParametersSHA256,
]);
export const currentMainSingleEntryProtectionObserverR33Preparation = Object.freeze({
  schemaVersion: 1, kind: KIND, observerVersion: VERSION, sourceMethod: METHOD,
  oldAdapterSHA256: 'f4367394cd061fa82564a1c0f602bbd71dae3a80d0dc2d9cf4b5cc0785359024',
  inventoryContractId: '2c49eb54-46c1-473c-ba40-c2557c3d429c', inventoryContractRevision: 1,
  actualMethodQualification: null, actualHupMethodQualification: null, independentLocalReview: null, activation: null,
  operationalQualified: false, inventoryPinsChanged: false, oldInventoryPinsChanged: false, oldProofsReclassified: false,
});

/** Explicit strings only; no file reads, transport defaults, activation or Python execution. */
export function createCurrentMainSingleEntryProtectionObserverR33Adapter({preparation = null, sourceBundle = null} = {}, readRoot = null) {
  need(typeof readRoot === 'function' && preparation && typeof preparation === 'object', 'R33_CURRENT_MAIN_SINGLE_PROTECTION_INPUT_REQUIRED');
  const names = ['boundNativeProgram', 'boundBuildProgram', 'singleDirentSource', 'boundedHupSource'];
  need(sourceBundle && Object.getPrototypeOf(sourceBundle) === Object.prototype
    && Reflect.ownKeys(sourceBundle).length === names.length
    && names.every(name => {const d = Object.getOwnPropertyDescriptor(sourceBundle, name);
      return d?.enumerable && Object.hasOwn(d, 'value') && typeof d.value === 'string'}), 'R33_CURRENT_MAIN_SINGLE_PROTECTION_SOURCE_BUNDLE_REQUIRED');
  const bundle = Object.freeze(Object.fromEntries(names.map(name => [name, sourceBundle[name]])));
  need(sha(bundle.boundNativeProgram) === METHOD.getdents.boundNativeSHA256 && sha(bundle.boundBuildProgram) === METHOD.getdents.boundBuildSHA256
    && sha(bundle.singleDirentSource) === METHOD.getdents.moduleSHA256 && sha(bundle.boundedHupSource) === METHOD.hup.helperSHA256,
    'R33_CURRENT_MAIN_SINGLE_PROTECTION_SOURCE_BUNDLE_CHANGED');
  const nativeBase = singleEntryBoundCensusR33Generate({kind: 'native', originalProgram: bundle.boundNativeProgram, singleDirentSource: bundle.singleDirentSource});
  const buildBase = singleEntryBoundCensusR33Generate({kind: 'build', originalProgram: bundle.boundBuildProgram, singleDirentSource: bundle.singleDirentSource});
  need(nativeBase.generatedProgramSHA256 === METHOD.getdents.nativeSHA256 && buildBase.generatedProgramSHA256 === METHOD.getdents.buildSHA256
    && nativeBase.inverseExactlyEqualsOriginal === true && buildBase.inverseExactlyEqualsOriginal === true, 'R33_CURRENT_MAIN_SINGLE_PROTECTION_BASE_SOURCE_CHANGED');
  const native = boundedHupCensusR33Generate({kind: 'native', originalProgram: nativeBase.program, hupHelperSource: bundle.boundedHupSource});
  const build = boundedHupCensusR33Generate({kind: 'build', originalProgram: buildBase.program, hupHelperSource: bundle.boundedHupSource});
  need(native.generatedProgramSHA256 === METHOD.nativeSHA256 && build.generatedProgramSHA256 === METHOD.buildSHA256
    && native.inverseExactlyEqualsOriginal === true && build.inverseExactlyEqualsOriginal === true, 'R33_CURRENT_MAIN_SINGLE_PROTECTION_GENERATED_SOURCE_CHANGED');
  const inventory = currentMainProtectionR33HostProgram(preparation), nativeOld = targetCleanupR29HostProgram(), buildOld = buildCleanupR29HostProgram();
  need(sha(inventory) === ORIGINAL.inventory && sha(nativeOld) === ORIGINAL.native && sha(buildOld) === ORIGINAL.build,
    'R33_CURRENT_MAIN_SINGLE_PROTECTION_ORIGINAL_SOURCE_CHANGED');
  const expected = ['inventory-before', 'native-source', 'old-build', 'inventory-after'];
  let next = 0, failed = false, active = false;
  const sourceReceipts = [];
  async function read(params, program) {
    let stage, original, actual, paramsCanonical;
    try {
      need(!active && !failed && next < expected.length, 'R33_CURRENT_MAIN_SINGLE_PROTECTION_CALL_SEQUENCE_INVALID');
      stage = expected[next]; original = stage.startsWith('inventory') ? inventory : stage === 'native-source' ? nativeOld : buildOld;
      need(program === original, 'R33_CURRENT_MAIN_SINGLE_PROTECTION_PROGRAM_SOURCE_CHANGED');
      actual = stage === 'native-source' ? native.program : stage === 'old-build' ? build.program : original;
      paramsCanonical = canonical(params);
      need(sha(paramsCanonical) === PARAMS[next], 'R33_CURRENT_MAIN_SINGLE_PROTECTION_PARAMETERS_SCOPE_CHANGED');
    } catch (e) {failed = true; throw e}
    active = true;
    try {
      const result = await readRoot(params, actual);
      need(!failed, 'R33_CURRENT_MAIN_SINGLE_PROTECTION_CALL_FAILED_DURING_TRANSPORT');
      need(canonical(params) === paramsCanonical, 'R33_CURRENT_MAIN_SINGLE_PROTECTION_PARAMETERS_CHANGED');
      sourceReceipts.push({schemaVersion: 1, kind: 'r33-current-main602-single-entry-hup-r3-protection-source-receipt', observerKind: KIND, observerVersion: VERSION,
        sourceMethod: METHOD, stage, originalProgramSHA256: sha(original), actualProgramSHA256: sha(actual), parametersSHA256: sha(paramsCanonical),
        responseSHA256: sha(canonical(result)), responseHashDomain: 'canonical-parsed-frame'});
      next++; return result;
    } catch (e) {failed = true; throw e} finally {active = false}
  }
  function receipts() {
    need(!active && !failed && next === expected.length, 'R33_CURRENT_MAIN_SINGLE_PROTECTION_OBSERVATION_INCOMPLETE');
    return structuredClone(sourceReceipts);
  }
  return Object.freeze({readRoot: read, receipts});
}

