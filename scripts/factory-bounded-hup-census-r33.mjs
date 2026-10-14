/** Pure bounded-HUP source composition; no IO, transport, CLI or activation. */
import {createHash} from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const need = (value, code) => {if (!value) throw Error(code)};
const ORIGINAL = Object.freeze({
  native: '2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73',
  build: '909f014941f1adbe3adf62a1dcd8d783c48f292c41f936c339cb293a2d0f7188',
});
const HELPER = 'c743dcb7c14dd245074c903757747f55721cfe3b164be2af5b4e553898de3a3b';
const PROOF = 'c0e02a02fe488c474e879c80cc89c2c445aead72c42275f9f0b0f264cc4d660a';

export const boundedHupCensusR33Preparation = Object.freeze({
  schemaVersion: 1, kind: 'r33-bounded-hup-census-preparation',
  originalProgramSHA256: ORIGINAL, hupHelperSHA256: HELPER, pidfdExitProofSHA256: PROOF,
  actualSourceQualificationRef: null, independentLocalReview: null, activation: null,
  preparedOnly: true, operationalQualified: false, wholeCensusQualified: false, remoteOperations: false,
});

const glue = String.raw`
class R33HupIntegrationRefusal(RuntimeError):
 def __init__(self,code,error):
  super().__init__(code)
  self.errno=getattr(error,'errno',None)
  self.originalExceptionType=type(error).__name__

_R33_HUP_REFUSAL_CODES={
 'R33_HUP_ATTEMPT_ALREADY_CONSUMED':'R29_CLEANUP_HUP_ATTEMPT_ALREADY_CONSUMED',
 'R33_HUP_BINDING_CHANGED':'R29_CLEANUP_HUP_BINDING_CHANGED',
 'R33_HUP_BINDING_INVALID':'R29_CLEANUP_HUP_BINDING_INVALID',
 'R33_HUP_BUDGET_EXHAUSTED':'R29_CLEANUP_HUP_BUDGET_EXHAUSTED',
 'R33_HUP_DEADLINE_EXCEEDED':'R29_CLEANUP_HUP_DEADLINE_EXCEEDED',
 'R33_HUP_DESCRIPTOR_IDENTITY_CHANGED':'R29_CLEANUP_HUP_DESCRIPTOR_IDENTITY_CHANGED',
 'R33_HUP_DESCRIPTOR_INVALID':'R29_CLEANUP_HUP_DESCRIPTOR_INVALID',
 'R33_HUP_ENCLOSING_DEADLINE_REQUIRED':'R29_CLEANUP_HUP_ENCLOSING_DEADLINE_REQUIRED',
 'R33_HUP_EVENT_REFUSED':'R29_CLEANUP_HUP_EVENT_REFUSED',
 'R33_HUP_FIRST_EXIT_POLL_REQUIRED':'R29_CLEANUP_HUP_FIRST_EXIT_POLL_REQUIRED',
 'R33_HUP_HELD_DESCRIPTOR_IDENTITY_REQUIRED':'R29_CLEANUP_HUP_HELD_DESCRIPTOR_IDENTITY_REQUIRED',
 'R33_HUP_IDENTITY_INVALID':'R29_CLEANUP_HUP_IDENTITY_INVALID',
 'R33_HUP_IDENTITY_UNBOUND':'R29_CLEANUP_HUP_IDENTITY_UNBOUND',
 'R33_HUP_MONOTONIC_INVALID':'R29_CLEANUP_HUP_MONOTONIC_INVALID',
 'R33_HUP_ORIGINAL_PROOF_REQUIRED':'R29_CLEANUP_HUP_ORIGINAL_PROOF_REQUIRED',
 'R33_HUP_SHARED_BUDGET_REQUIRED':'R29_CLEANUP_HUP_SHARED_BUDGET_REQUIRED',
 'R33_HUP_WAIT_EXCEPTION':'R29_CLEANUP_HUP_WAIT_EXCEPTION',
}

def r33_hup_exit_proof(pid,attachment,boot,first_poll,budget):
 try:
  result=wait_for_hup_then_prove(pid,attachment,boot,first_poll,budget,
   pidfd_exit_proof,attachment['hupHeldDescriptorIdentity'])
  return result['originalExitProof']
 except HupWaitRefusal as error:
  # Original None remains the old caller's STILL_PRESENT refusal; never retry proof.
  if error.code=='R33_HUP_ORIGINAL_PROOF_REFUSED':return None
  raise R33HupIntegrationRefusal(_R33_HUP_REFUSAL_CODES.get(error.code,'R29_CLEANUP_HUP_WAIT_EXCEPTION'),error) from error
 except RuntimeError:
  # Includes the original raising alarm and original proof's strict binding guards.
  raise
 except Exception as error:
  # Never let a new ENOENT/ESRCH enter either unchanged legacy read-error fallback.
  raise R33HupIntegrationRefusal('R29_CLEANUP_HUP_WAIT_EXCEPTION',error) from error

`;

function one(value, before, after) {
  need(value.split(before).length === 2, 'R33_HUP_CENSUS_UNIQUE_ANCHOR_CHANGED');
  return value.replace(before, after);
}
function exitProof(value) {
  const start = value.indexOf('def pidfd_exit_proof('), end = value.indexOf('def census():', start);
  need(start > 0 && end > start, 'R33_HUP_CENSUS_EXIT_BOUNDARY_CHANGED');
  return value.slice(start, end);
}

/** Explicit immutable source inputs only; no default file or network access. */
export function boundedHupCensusR33Generate({kind = null, originalProgram = null, hupHelperSource = null} = {}) {
  need(Object.hasOwn(ORIGINAL, kind), 'R33_HUP_CENSUS_KIND_REQUIRED');
  need(typeof originalProgram === 'string' && typeof hupHelperSource === 'string', 'R33_HUP_CENSUS_SOURCE_INPUTS_REQUIRED');
  need(sha(originalProgram) === ORIGINAL[kind], 'R33_HUP_CENSUS_ORIGINAL_PROGRAM_CHANGED');
  need(sha(hupHelperSource) === HELPER, 'R33_HUP_CENSUS_HELPER_CHANGED');
  need(!['HupWaitRefusal', 'BoundedHupBudget', 'descriptor_identity', 'binding_snapshot',
    'wait_for_hup_then_prove', 'def require(', 'PER_PID_MS', 'SHARED_SCAN_MS',
    'R33HupIntegrationRefusal', '_R33_HUP_', 'r33_hup_exit_proof', 'hup_budget',
    'hupHeldDescriptorIdentity'].some(symbol => originalProgram.includes(symbol)), 'R33_HUP_CENSUS_HELPER_COLLISION');
  const proof = exitProof(originalProgram);
  need(sha(proof) === PROOF, 'R33_HUP_CENSUS_EXIT_PROOF_CHANGED');
  const inserted = '# BEGIN R33 BOUNDED-HUP EXACT HELPER\n' + hupHelperSource
    + (hupHelperSource.endsWith('\n') ? '' : '\n') + '# END R33 BOUNDED-HUP EXACT HELPER\n' + glue;
  const first = "     a['readSubphase']='PIDFD_EXIT_PATH_CHECK';proof=pidfd_exit_proof(pid,a,boot);need(proof is not None,'R29_CLEANUP_EXITED_PID_STILL_PRESENT');exits[pid]=proof\n";
  const last = "     a['readSubphase']='PIDFD_EXIT_PATH_CHECK';proof=pidfd_exit_proof(pid,a,boot);need(proof is not None,'R29_CLEANUP_EXITED_PID_STILL_PRESENT');exits[pid]=proof;del records[pid]\n";
  const recipe = [
    {before: 'signal.signal(signal.SIGALRM,deadline);signal.alarm(150)',
     after: 'import time as _r33_hup_time\n_R33_HUP_ENCLOSING_DEADLINE=_r33_hup_time.monotonic()+150\nsignal.signal(signal.SIGALRM,deadline);signal.alarm(150)'},
    {before: 'def pidfd_poll(fd):', after: inserted + 'def pidfd_poll(fd):'},
    {before: ' records={};failures={};attachments={};exits={};listed={}\n',
     after: ' records={};failures={};attachments={};exits={};listed={}\n hup_budget=BoundedHupBudget(_R33_HUP_ENCLOSING_DEADLINE)\n'},
    {before: "       subphase='POST_ATTACH_PROC_IDENTITY'\n",
     after: "       subphase='POST_ATTACH_PROC_IDENTITY'\n       a['hupHeldDescriptorIdentity']=descriptor_identity(a['fd'])\n"},
    {before: first, after: first.replace('pidfd_exit_proof(pid,a,boot)', 'r33_hup_exit_proof(pid,a,boot,state,hup_budget)')},
    {before: "    if pidfd_poll(a['fd'])['exitConfirmed']:\n",
     after: "    state=pidfd_poll(a['fd'])\n    if state['exitConfirmed']:\n"},
    {before: last, after: last.replace('pidfd_exit_proof(pid,a,boot)', 'r33_hup_exit_proof(pid,a,boot,state,hup_budget)')},
  ];
  let program = originalProgram;
  for (const row of recipe) program = one(program, row.before, row.after);
  need(exitProof(program) === proof, 'R33_HUP_CENSUS_EXIT_PROOF_CHANGED');
  let inverse = program;
  for (const row of [...recipe].reverse()) inverse = one(inverse, row.after, row.before);
  need(inverse === originalProgram, 'R33_HUP_CENSUS_INVERSE_CHANGED');
  return {
    schemaVersion: 1, kind: 'r33-bounded-hup-census-generated-preparation', program,
    generatedProgramSHA256: sha(program), generatedProgramBytes: Buffer.byteLength(program),
    originalProgramSHA256: ORIGINAL[kind], hupHelperSHA256: HELPER, pidfdExitProofSHA256: sha(proof),
    inverseExactlyEqualsOriginal: true, recipe,
    sourceProtocol: {
      kind: 'r33-bounded-hup-census-source-protocol', version: 1, scope: kind,
      perAttachmentMilliseconds: 250, sharedPerCensusMilliseconds: 1000, enclosingAlarmSeconds: 150,
      firstEligibleStartsSharedBudget: true, firstPollReused: true, oneSharedBudgetAcrossBothSites: true,
      onePythonPollPerAttachment: true, oneKernelSyscallClaimed: false,
      eventMaskRequested: 0, onlyAcceptedWaitMask: 16, originalExitProofUnchanged: true,
      legacyReadErrorFallbackBodiesUnchanged: true, legacyErrorSchemaUnchanged: true,
      originalFinalizerOwnsDescriptor: true, automaticRetry: false,
      actualSourceQualificationRef: null, independentLocalReview: null,
      wholeCensusQualified: false,
    },
    preparedOnly: true, operationalQualified: false, generatedPythonExecuted: false,
  };
}

