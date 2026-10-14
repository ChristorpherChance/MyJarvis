/** New source provenance. The frozen physical inventory and strict unknown standards remain unchanged. */
import {open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {canonical,sha} from './run-factory-main-repair-r26.mjs';
import {safeReadLocal,settleEvidenceReads} from './factory-repair-evidence-read-r26.mjs';
import {targetCleanupR29Scope} from './verify-factory-target-cleanup-r29.mjs';
import {verifyFactoryCurrentMainProtectionContractR33,assertCurrentMainProtectionR33Proof,readCurrentMainProtectionR33Qualification,currentMainProtectionR33Contract} from './verify-factory-current-main602-protection-contract-r33-meta-r4.mjs';
import {boundProcessCensusR32NativeProgram,boundProcessCensusR32BuildProgram} from './factory-bound-process-census-r32.mjs';
import {createCurrentMainSingleEntryProtectionObserverR33Adapter,currentMainSingleEntryProtectionObserverR33Preparation} from './factory-current-main602-single-entry-protection-observer-r33-meta-r4.mjs';
import {nodeState,queueState} from './run-factory-supervision-probe.mjs';
import {withPlatform,lanProfile,python} from './managed-server-client.mjs';
const need=(v,c)=>{if(!v)throw Error(c)},same=(a,b)=>canonical(a)===canonical(b),H=/^[a-f0-9]{64}$/;
const SELF='scripts/verify-factory-current-main602-single-entry-protection-contract-r33-meta-r4.mjs';
const PROTOCOL='r33-single-entry-owned-method-v3';
const ADAPTER='scripts/factory-current-main602-single-entry-protection-observer-r33-meta-r4.mjs';
const INVENTORY_VERIFIER='scripts/verify-factory-current-main602-protection-contract-r33-meta-r4.mjs';
const METHOD_READER='scripts/verify-factory-single-entry-owned-scope-r33-r3.mjs';
const METHOD_OBSERVER='scripts/factory-single-entry-owned-scope-observer-r33-r3.py';
const JP='.jarvis-dev/maintenance/factory-r33-single-entry-bound-method-r3-once.json';
const RECORDS=['control/owner.py','control/fixture.py','control/generated.py','control/activation.json','control/once.json',
 'work/owner.json','work/fixture-process.json','work/fixture.stdout.json','work/fixture.stderr.raw','work/result.json','work/stopped.json','work/owner.stderr.raw','unit-proof.json','stderr-sink-proof.json'];
const SOURCE=Object.freeze({native:{path:'artifacts/software-factory/goals-r29/r33-single-entry-bound-census-native-source-2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73.py',sha256:'2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73'},
 buildStatic:{path:'artifacts/software-factory/goals-r29/r33-single-entry-bound-census-build-source-909f014941f1adbe3adf62a1dcd8d783c48f292c41f936c339cb293a2d0f7188.py',sha256:'909f014941f1adbe3adf62a1dcd8d783c48f292c41f936c339cb293a2d0f7188'},
 pureModule:{path:'scripts/factory-single-dirent-r33.py',sha256:'ab981cf22e75c75946a85150bffbd051ece574143446fd6b22f6a383bc44c6d8'},
 generator:{path:'scripts/factory-single-entry-bound-census-r33.mjs',sha256:'7f10715ae744a24117edc34a5d44d2478400a878b77044be289aa616f406ead5'},hupNative:{"path":"artifacts/software-factory/goals-r29/r33-bounded-hup-census-native-source-549c8b8e4711492c75d3b9fccad592a3977f02f556ce15a558a2751a81ba3165.py","sha256":"549c8b8e4711492c75d3b9fccad592a3977f02f556ce15a558a2751a81ba3165"},hupBuild:{"path":"artifacts/software-factory/goals-r29/r33-bounded-hup-census-build-source-1d4548a82fa40499aca346875c3d9f762967c45c40a1b782c4cc4f8832a9dcdf.py","sha256":"1d4548a82fa40499aca346875c3d9f762967c45c40a1b782c4cc4f8832a9dcdf"},hupTransformer:{"path":"scripts/factory-bounded-hup-census-r33.mjs","sha256":"57d207f9e173f07891acb9ab050a0e818840dd87d30c9a150c4b88ec2aa53a13"},hupHelper:{"path":"scripts/factory-bounded-pidfd-hup-wait-r33.py","sha256":"c743dcb7c14dd245074c903757747f55721cfe3b164be2af5b4e553898de3a3b"}});
const METHOD=Object.freeze({result:{path:'artifacts/software-factory/goals-r29/r33-single-entry-method-r3-independent-observation-1791896751796-edc3c6d2-369d-4953-b163-a214a72b9224.json',sha256:'3f37f556d1ec228804c999fd3af2e93beca7219a6f4d3f479a93353fd9990d7d'},
 audit:{path:'artifacts/software-factory/goals-r29/r33-single-entry-method-r3-independent-observation-saved-evidence-limited-audit-1791897181401-a1497f62-57cb-4392-92a0-2599fc658b31.json',sha256:'ddb886c72cb6374a33b2ed9c2dc96ec9670f23ab1113e3fd3775eb7517003fb5'},
 reader:'1c56dc19043c63fbb408458cc0db64571033878491e9e21e2d940987c642cd2e',observer:'67298c9f8832c7bdea2aa2f4a0eb2c841023d52f9c3533a41b3dbaf2cdd6cb76',host:'5b4c8e5583df9a86e9ce317ca74a00af4185d38d9d51fdcbeaf67f774ad464be',
 parentReview:'20685b7e4282b590bfb515873a9a227651d41abcd7193a1a01df6e7ea68f11c8',readerReview:'3df88f742e7bc379114cd6fece345ec7697475f565f6c1935da21b93d0e9e59c',
 owner:'bc0909e65f09236cc7622c6bcfd593aae04ebd74ff139c6a751550b592d870a8',starter:'2c829ab40d8f905f29d6b18ac08e67d6a765f34e93470a2c2938d568f7fd1af6',executionHost:'93f7bf40ff76917891efb0ac0ae876b4102d889a4a0239a66aa9b7cc6d7991e3',
 nonce:'985f93db80fb6405f9ff3c9068448461',once:{path:'.jarvis-dev/maintenance/r33-single-entry-method-r3-independent-read-once.json',sha256:'85eb5c8a7e64e6ede0bdddefb075ec90936a935990ac37cbda7653086c74d2ff'},
 outcome:{path:'.jarvis-dev/maintenance/r33-single-entry-method-r3-independent-read-outcome.json',sha256:'1649cd66e1253c357a9ed7d6e99f99900bad691d30fd04faf5d34e47a5f1f828'}});
const HUP=Object.freeze({"result":{"path":"artifacts/software-factory/goals-r29/r33-bounded-hup-method-actual-result-1791972621857-c8d855cd-46fb-47ad-97b8-35d01bd97a55.json","sha256":"85ec33d74bfa46d5ab729e88fb1e0abbed2e5ffcf05b775ae8a5bb7a7a1f5436"},"audit":{"path":"artifacts/software-factory/goals-r29/r33-bounded-hup-method-saved-evidence-independent-local-review-1791973060024-d2530690-3c83-4ee5-8205-b5bb4daa7580.json","sha256":"5535e18972feba0fc92ae2e619b76118268bcc0c1b9c42a4542b60503acb3dff"},"selection":{"path":"artifacts/software-factory/goals-r29/r33-pg4-bounded-hup-integration-root-selection-1791973407016-21c4153b-4cbb-4673-9220-41832b65e89b.json","sha256":"64e5fb08facaae44363b34c640ed7846a303dc6db702e755300d677aceb624bc"},"once":{"path":".jarvis-dev/maintenance/r33-bounded-pidfd-hup-method-once.json","sha256":"972d6805791363f384499e26f6dd4328d1d5b8d2ddf0e70af374896069d3b009"},"wire":{"path":".jarvis-dev/maintenance/r33-bounded-hup-method-private-1791972621764-db4c3b23-b20d-43bf-ba0a-ef46468ca428.json","sha256":"4e7feb43b4b72126918a3157d59284a63744ca187e3c285a31c24c7b7cbd112b"},"caller":{"path":"scripts/run-factory-bounded-pidfd-hup-method-r33.mjs","sha256":"e31a58d9d6cd3216755525946eb4f0846b980500bf6c9bad46d80201ce140a42"},"context":{"path":".jarvis-dev/maintenance/r33-bounded-hup-method-actual-entry-context.json","sha256":"87081f9287e7f626286d4d082c7584f707ee7fb594758d9116d2b94a5e422e41"},"contract":{"path":".jarvis-dev/maintenance/r33-bounded-hup-method-actual-source-contract.json","sha256":"4628c36ee20a9fc1daadf0680a9307f384541204618e8dbeccebf95347107726"},"host":{"path":"artifacts/software-factory/goals-r29/r33-bounded-hup-method-host-source-4798c915d7cf745cdb9dd2f83e809e99e128faaf3b62f4b0889301c9a42b6ac1.py","sha256":"4798c915d7cf745cdb9dd2f83e809e99e128faaf3b62f4b0889301c9a42b6ac1"}});
export const currentMainSingleEntryProtectionContractR33Scope=Object.freeze({kind:'software-factory-r33-current-main602-meta-r4-single-entry-protection-observation',observerVersion:'r33-current-main602-meta-r4-getdents47-hup-source-v1',
 inventoryContractId:'53eac807-a6cd-44ae-ac65-eaec57f5e49e',inventoryContractRevision:1,
 sourceContract:null,consumerIndependentReview:null,adapterIndependentReview:null,actualMethodQualification:null,actualMethodAudit:null,hupMethodQualification:null,hupMethodAudit:null,hupIntegrationSelection:null,inventory:null,
 operationalQualified:false,sourceMethod:SOURCE,methodQualificationDoesNotQualifyWholeInventory:true});
const S=currentMainSingleEntryProtectionContractR33Scope;
const AUTHORITY_REFS=[
 ['scripts/run-factory-main-repair-r26.mjs','31094cee37b1005e43d3e3810c9c7c3916fe31c6e8ed8c23185dbe6f78a3c462'],
 ['scripts/factory-repair-evidence-read-r26.mjs','4db9e5fd1f80bde99ae53609a4bbad788d871ecc098528499cbf0c43d864911e'],
 ['scripts/verify-factory-target-cleanup-r29.mjs','d4860d172aa4b4a2949281ac5ae416d216625b8ed43e394d57e30ba9f0873dd6'],
 ['scripts/verify-factory-truth-gate-build-cleanup-r29.mjs','48e2089fd03db8d3186486edf207550ad157e412071c10515f5a1d892be59d86'],
 ['scripts/verify-factory-protection-contract-r29-r2.mjs','de1c75c0becd8f2375dd2b0b1005d86f8c4052736d90725743dde3cc94a4de76'],
 ['scripts/start-factory-truth-gate-build-r29-r4.mjs','c5fc013105aac25a23d36dde439ca71f929802f656256f0d8755aa324f8527b0'],
 ['scripts/factory-bound-process-census-r32.mjs','a08c44ee006ea993452d39616a217bbf7e45169fd827f580c951a9796cac7252'],
 ['scripts/factory-bound-protection-observer-r32.mjs','6831e1faaf875d8689fce72ab2c3b372ee0ebf73cae17a52cc4d7c35a6dc279d'],
 ['scripts/install-factory-repair-verifier-r26.mjs','ed9d65721a1cd1fa92d84b34197aa308128bb5d570f0f9b83eb1eac099262175'],
 ['scripts/run-factory-supervision-probe.mjs','699d0b9c06557bff28e855b9505c8b6ff7a4bb980a0755f1102c8a79e8cea402'],
 ['scripts/managed-server-client.mjs','e287938e2d79b0335523d3d198bd93b588541866cebc2c21d997ae6fce5e4a9f'],
 ['scripts/read-factory-truth-gate-build-scope-r29.mjs','3eb38ff71acc2d844e740c06d64691eb4f1823fce41be2490ea907d896af0ac4'],
 ['scripts/run-factory-target-repair-r29.mjs','490c071eba4de31d9286e4c314c5fe2f21619401b4925fb8e86f15a18505c641'],
].map(([path,sha256])=>Object.freeze({path,sha256}));
const PAYLOADS=[currentMainProtectionR33Contract.stockParametersSHA256,'f75e008012f8e6dafb9cbc1f0cd48c8be78aab9238e2ce16eef6fa53bc94f3ff','905a38ec0990aba896ebdcd148289bf6786469e6d4491b475de85bf6e22242e9',currentMainProtectionR33Contract.stockParametersSHA256];
const PROGRAMS=[currentMainProtectionR33Contract.stockProgramSHA256,SOURCE.hupNative.sha256,SOURCE.hupBuild.sha256,currentMainProtectionR33Contract.stockProgramSHA256];
const STAGES=['inventory-before','native-source','old-build','inventory-after'];
function exactKeys(v,k){return v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),[...k].sort())}
function localPath(p){return typeof p==='string'&&p.length<=512&&/^(?:scripts\/|artifacts\/software-factory\/goals-r29\/|\.jarvis-dev\/maintenance\/)[A-Za-z0-9._/-]+$/.test(p)&&!p.includes('//')&&!p.split('/').some(s=>!s||s==='.'||s==='..')}
function isRef(v){return exactKeys(v,['path','sha256'])&&localPath(v.path)&&H.test(v.sha256)}
function jsonClone(v,depth=0){need(depth<40,'R33_PROTECTION_JSON_DEPTH_CHANGED');if(v===null||['string','boolean'].includes(typeof v))return v;if(typeof v==='number'){need(Number.isFinite(v),'R33_PROTECTION_JSON_NUMBER_CHANGED');return v}
 need(v&&typeof v==='object'&&(Array.isArray(v)||Object.getPrototypeOf(v)===Object.prototype),'R33_PROTECTION_NOT_JSON');const d=Object.getOwnPropertyDescriptors(v),k=Object.keys(v);
 need(Reflect.ownKeys(v).length===k.length+(Array.isArray(v)?1:0)&&k.every(x=>d[x].enumerable&&Object.hasOwn(d[x],'value'))&&(!Array.isArray(v)||k.length===v.length&&k.every((x,i)=>x===String(i))),'R33_PROTECTION_JSON_PROPERTIES_CHANGED');
 return Object.freeze(Array.isArray(v)?k.map(x=>jsonClone(v[x],depth+1)):Object.fromEntries(k.map(x=>[x,jsonClone(v[x],depth+1)])))}
export function assertCurrentMainSingleEntryProtectionActivationR33(value){const a=jsonClone(value);need(exactKeys(a,['sourceContract','consumerIndependentReview','adapterIndependentReview','actualMethodQualification','actualMethodAudit','hupMethodQualification','hupMethodAudit','hupIntegrationSelection','inventory'])
 &&['sourceContract','consumerIndependentReview','adapterIndependentReview','actualMethodQualification','actualMethodAudit','hupMethodQualification','hupMethodAudit','hupIntegrationSelection'].every(k=>isRef(a[k]))
 &&exactKeys(a.inventory,['contract','independentReview','actualCurrentMainWitness','actualCurrentMainAudit'])&&Object.values(a.inventory).every(isRef)
 &&same(a.actualMethodQualification,METHOD.result)&&same(a.actualMethodAudit,METHOD.audit)
  &&same(a.hupMethodQualification,HUP.result)&&same(a.hupMethodAudit,HUP.audit)&&same(a.hupIntegrationSelection,HUP.selection),'R33_CURRENT_MAIN_PROTECTION_ACTIVATION_REQUIRED');return a}

// BEGIN EXACT FROZEN 1c56 PRIVATE HOST PREDICATES -- appended by the local source assembler.
function assertHost(value, payload) {
  need(value?.schemaVersion === 1 && value.kind === 'r33-single-entry-owned-scope-host-observation-r3'
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
  need(value.knownActorCount === 4 && value.expectedKnownActorCount === 4
    && typeof value.currentOwnedScopeCleanupVerified === 'boolean' && Array.isArray(value.physicalFrames) && value.physicalFrames.length === 2,
    'R33_OWNED_SCOPE_CURRENT_FRAME_INCOMPLETE');
  const unit = payload.owner.unit;
  let clean = true;
  for (const frame of value.physicalFrames) {
    need(frame?.boot === payload.owner.boot && Array.isArray(frame.actors) && frame.actors.length === 4
      && same(frame.actors.map(row => row.role), ['owner', 'fixture', 'child', 'stop-post']), 'R33_OWNED_SCOPE_ACTOR_FRAME_CHANGED');
    for (const row of frame.actors) {
      const key = row.role === 'stop-post' ? 'stopPost' : row.role;
      need(row.pid === payload[key].pid && typeof row.complete === 'boolean' && [true, false, null].includes(row.present),
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

// END EXACT FROZEN 1c56 PRIVATE HOST PREDICATES

/** Only the historical saved independent method is consumed here. This never invokes its reader or a root operation. */
export async function verifySingleEntryMethodQualificationEvidenceR33(v,readLocal){
 need(v?.schemaVersion===1&&v.kind==='r33-single-entry-bound-method-independent-result-r3'&&v.nonce===METHOD.nonce&&v.actualPhase==='native'&&v.ready===true
  &&v.actualMethodSubsetIndependentlyQualified===true&&v.currentOwnedScopeCleanupVerified===true&&v.sourceRefsStable===true
  &&v.errorCode===null&&v.methodEvidenceErrorCode===null&&v.wholeProcCensusExecuted===false&&v.externalHoldersAbsenceProved===false
  &&v.fullProtectionQualified===false&&v.globalCleanupQualified===false&&v.productCodeExecuted===false&&v.modelsInvoked===false&&v.mutationsPerformed===false,'R33_PROTECTION_FINITE_METHOD_UNPROVEN');
 need(v.generatedNativeSHA256===SOURCE.native.sha256&&v.generatedBuildStaticMappingSHA256===SOURCE.buildStatic.sha256
  &&v.hostProgramSHA256===METHOD.host&&v.readerIndependentReview?.sha256===METHOD.readerReview
  &&Array.isArray(v.sourceRefs)&&v.sourceRefs.length===17&&new Set(v.sourceRefs.map(r=>r.path)).size===17&&v.sourceRefs.every(isRef)
  &&exactKeys(v.rawFileRefs,RECORDS),'R33_PROTECTION_METHOD_SOURCES_INCOMPLETE');
 const expected=[{path:METHOD_READER,sha256:METHOD.reader},{path:METHOD_OBSERVER,sha256:METHOD.observer},SOURCE.native,SOURCE.buildStatic,SOURCE.generator,SOURCE.pureModule];
 need(expected.every(r=>v.sourceRefs.some(x=>same(x,r)))&&v.executionHostProgram?.sha256===METHOD.executionHost&&v.independentObservationHostProgram?.sha256===METHOD.host,'R33_PROTECTION_METHOD_SOURCE_ROLE_CHANGED');
 const refs=[...v.sourceRefs,...Object.values(v.rawFileRefs),v.transportEvidence,v.hostOriginalBytes,METHOD.once,METHOD.outcome];
 need(refs.every(r=>r&&localPath(r.path)&&H.test(r.sha256)&&(r.bytes===undefined||Number.isSafeInteger(r.bytes)&&r.bytes>=0&&r.bytes<=8*1024**2)),'R33_PROTECTION_METHOD_REFERENCE_CHANGED');
 const raw=await settleEvidenceReads(refs.map(r=>()=>readLocal(r.path)));need(raw.every((b,i)=>sha(b)===refs[i].sha256&&(refs[i].bytes===undefined||refs[i].bytes===b.length)),'R33_PROTECTION_METHOD_BYTES_CHANGED');
 const map=new Map(refs.map((r,i)=>[r.path,Buffer.from(raw[i])])),decode=r=>JSON.parse(map.get(r.path));
 const findH=h=>{const r=v.sourceRefs.find(r=>r.sha256===h);need(r,'R33_PROTECTION_METHOD_GRAPH_ROLE_MISSING');return r};
 const execution={starter:findH(METHOD.starter),owner:findH(METHOD.owner),executionHostProgram:v.executionHostProgram,
  sourceReview:findH(METHOD.parentReview),journal:v.sourceRefs.find(r=>r.path===JP),start:v.sourceRefs.find(r=>/\/r33-single-entry-method-r3-start-/.test(r.path)),terminal:v.sourceRefs.find(r=>/\/r33-single-entry-method-r3-check-/.test(r.path))};
 need(Object.values(execution).every(isRef),'R33_PROTECTION_METHOD_EXECUTION_GRAPH_INCOMPLETE');
 const review=decode(v.readerIndependentReview);need(review.kind==='r33-single-entry-owned-scope-independent-local-review-r3'&&review.callerSHA256===METHOD.reader&&review.observerSHA256===METHOD.observer&&review.hostProgramSHA256===METHOD.host&&review.staticPreparationReady===true&&review.remainingP0P1===0&&review.remoteOperations===false,'R33_PROTECTION_METHOD_READER_REVIEW_CHANGED');
 const module=await import('./verify-factory-single-entry-owned-scope-r33-r3.mjs');
 const q=decode(execution.journal),start=decode(execution.start),terminal=decode(execution.terminal),payload=module.assertSingleEntryOwnedScopeContextR33R3(q,start,terminal,execution);
 need(terminal.status==='passed'&&terminal.methodSubsetProducerPassed===true,'R33_PROTECTION_METHOD_TERMINAL_NOT_PASSED');
 const transport=decode(v.transportEvidence),hostRaw=map.get(v.hostOriginalBytes.path),stdout=Buffer.from(transport.stdoutBase64??'','base64'),stderr=Buffer.from(transport.stderrBase64??'','base64');
 need(transport.kind==='r33-single-entry-owned-scope-original-transport-r3'&&transport.status===0&&transport.signal===null&&transport.errorCode===null
  &&stdout.toString('base64')===transport.stdoutBase64&&stderr.toString('base64')===transport.stderrBase64&&stdout.equals(hostRaw)&&stderr.length===0
  &&transport.programSHA256===METHOD.host&&transport.payloadSHA256===sha(canonical(payload))&&v.payloadSHA256===sha(canonical(payload)),'R33_PROTECTION_METHOD_ORIGINAL_WIRE_CHANGED');
 const host=assertHost(JSON.parse(hostRaw),payload);need(host.currentOwnedScopeCleanupVerified===true&&host.originalKernelFactsVerified===true,'R33_PROTECTION_METHOD_CURRENT_OR_KERNEL_INCOMPLETE');
 const facts=module.assertOriginalSingleEntryMethodEvidenceR33R3(host.originalRawFileRefs,payload);
 need(same(facts,v.originalKernelFacts)&&same(projectPhysicalFrames(host),v.currentScopeSummary?.physicalFrames)&&v.currentScopeSummary?.namespaceMetadataSHA256===host.namespaceMetadataSHA256,'R33_PROTECTION_METHOD_PUBLIC_PROJECTION_CHANGED');
 for(const name of RECORDS){const row=host.originalRawFileRefs[name],r=v.rawFileRefs[name];need(row.sha256===r.sha256&&row.bytes===r.bytes&&Buffer.from(row.base64,'base64').equals(map.get(r.path)),'R33_PROTECTION_METHOD_RAW_RECORD_CHANGED')}
 const intent=decode(METHOD.once),outcome=decode(METHOD.outcome);
 need(intent.kind==='r33-single-entry-method-r3-independent-read-once'&&intent.nonce===METHOD.nonce&&intent.readOnly===true&&intent.maximumRootReads===1&&intent.automaticRetry===false
  &&intent.payloadSHA256===v.payloadSHA256&&same(intent.activation?.execution,execution)&&outcome.kind==='r33-single-entry-method-r3-independent-read-outcome'&&outcome.nonce===METHOD.nonce
  &&outcome.status==='passed'&&outcome.errorCode===null&&outcome.sourcesStable===true&&outcome.maximumRootReads===1&&outcome.automaticRetry===false
  &&outcome.result?.sha256===METHOD.result.sha256&&outcome.intent?.sha256===METHOD.once.sha256&&outcome.actualMethodSubsetIndependentlyQualified===true&&outcome.currentOwnedScopeCleanupVerified===true,'R33_PROTECTION_METHOD_ONCE_CHAIN_CHANGED');
 const last=await settleEvidenceReads(refs.map(r=>()=>readLocal(r.path)));need(raw.every((b,i)=>Buffer.from(b).equals(Buffer.from(last[i]))),'R33_PROTECTION_METHOD_CHANGED_AFTER');return {qualified:true,methodResult:METHOD.result,originalKernelFacts:facts,scope:'historical finite native method and four known actors only'};
}

/** Only frozen local saved evidence is consumed; the method executor is never invoked. */
export async function verifyBoundedHupMethodQualificationEvidenceR33(readLocal){
 const headRefs=[HUP.result,HUP.audit,HUP.selection],head=await settleEvidenceReads(headRefs.map(r=>()=>readLocal(r.path)));
 need(head.every((b,i)=>sha(b)===headRefs[i].sha256),'R33_PROTECTION_HUP_HEAD_CHANGED');
 const result=JSON.parse(head[0]),audit=JSON.parse(head[1]),selection=JSON.parse(head[2]);
 need(audit.kind==='r33-bounded-hup-method-saved-evidence-independent-local-review'&&audit.savedEvidenceAuditPassed===true&&audit.remainingP0P1===0
  &&audit.actualMethodIndependentlyQualified===true&&audit.actualFiniteMethodSubsetQualified===true&&audit.initialFinalSourceRefsEqual===true
  &&audit.sourceRefsCount===38&&Array.isArray(audit.sourceRefs)&&audit.sourceRefs.length===38&&new Set(audit.sourceRefs.map(r=>r.path)).size===38
  &&audit.remoteOperationsPerformed===false&&audit.RootCalls===0&&audit.subjectFunctionsExecuted===0&&audit.testsExecuted===0
  &&audit.fullProtectionQualified===false&&audit.currentProtectedPostClosed===false&&audit.actualPG4Qualified===false&&audit.productAccepted===false
  &&audit.parentSupervisorProcessClosureIndependentlyVerified===false&&audit.externalHolderClosureVerified===false,'R33_PROTECTION_HUP_SAVED_AUDIT_REQUIRED');
 const refMatches=(a,b)=>a&&b&&a.path===b.path&&a.sha256===b.sha256;
 need(refMatches(audit.actualResult,HUP.result)&&refMatches(audit.once,HUP.once)&&refMatches(audit.rootWire,HUP.wire)
  &&audit.operatorSHA256===HUP.caller.sha256&&audit.sourceSHA256.helper===SOURCE.hupHelper.sha256
  &&audit.sourceSHA256.native===SOURCE.native.sha256&&audit.contextSHA256===HUP.context.sha256
  &&audit.sourceContractSHA256===HUP.contract.sha256&&audit.hostProgramSHA256===HUP.host.sha256,'R33_PROTECTION_HUP_AUDIT_BINDING_CHANGED');
 need(selection.kind==='software-factory-r33-pg4-bounded-hup-integration-root-selection'&&selection.state==='selected'
  &&selection.selectedScope.thirdPostSelected===false&&selection.selectedScope.qaNonceSelected===false
  &&selection.actualBasis.finiteMethodIndependentlyQualified===true&&selection.actualBasis.wholeIntegrationQualified===false
  &&selection.evidence.some(r=>refMatches(r,HUP.audit))&&selection.evidence.some(r=>refMatches(r,HUP.result)),'R33_PROTECTION_HUP_SELECTION_REQUIRED');
 const refs=audit.sourceRefs;
 need(refs.every(r=>exactKeys(r,['path','sha256','bytes'])&&localPath(r.path)&&H.test(r.sha256)&&Number.isSafeInteger(r.bytes)&&r.bytes>=0&&r.bytes<=8388608)
  &&[HUP.result,HUP.once,HUP.wire,HUP.caller,HUP.context,HUP.contract,HUP.host,SOURCE.hupHelper].every(r=>refs.some(x=>refMatches(x,r))),'R33_PROTECTION_HUP_GRAPH_INCOMPLETE');
 const raw=await settleEvidenceReads(refs.map(r=>()=>readLocal(r.path)));
 need(raw.every((b,i)=>sha(b)===refs[i].sha256&&b.length===refs[i].bytes),'R33_PROTECTION_HUP_BYTES_CHANGED');
 const map=new Map(refs.map((r,i)=>[r.path,Buffer.from(raw[i])])),decode=r=>JSON.parse(map.get(r.path));
 const wire=decode(HUP.wire),intent=decode(HUP.once),context=decode(HUP.context),contract=decode(HUP.contract);
 need(result.kind==='r33-bounded-hup-method-actual-result'&&result.ready===true&&result.methodProducerPassed===true&&result.currentOwnedScopeProducerClosed===true
  &&result.actualMethodIndependentlyQualified===false&&result.fullProtectionQualified===false&&result.actualPG4Qualified===false&&result.productAccepted===false
  &&result.RootCalls===1&&result.automaticRetry===false&&result.onceConsumed===true&&result.firstFailureCode===null&&result.sourceBytesStable===true
  &&refMatches(result.intent,HUP.once)&&refMatches(result.rawRef,HUP.wire)&&refMatches(result.context,HUP.context)&&result.hostProgramSHA256===HUP.host.sha256,'R33_PROTECTION_HUP_ACTUAL_SNAPSHOT_CHANGED');
 need(intent.kind==='r33-bounded-hup-method-once-intent'&&intent.maximumRemoteCalls===1&&intent.automaticRetry===false
  &&intent.operatorSHA256===HUP.caller.sha256&&refMatches(intent.context,HUP.context)&&refMatches(intent.sourceContract,HUP.contract)
  &&intent.hostProgramSHA256===HUP.host.sha256&&same(wire.intent,result.intent),'R33_PROTECTION_HUP_ONCE_BINDING_CHANGED');
 need(contract.kind==='r33-bounded-hup-method-source-contract'&&same(Object.fromEntries(Object.entries(contract.sources).map(([k,r])=>[k,r.sha256])),audit.sourceSHA256)
  &&context.kind==='r33-bounded-hup-method-entry-context'&&refMatches(context.sourceContract,HUP.contract),'R33_PROTECTION_HUP_CONTRACT_CHANGED');
 const stdout=Buffer.from(wire.stdoutBase64??'','base64'),stderr=Buffer.from(wire.stderrBase64??'','base64');
 need(wire.kind==='r33-bounded-hup-method-root-wire'&&wire.status===0&&wire.signal===null&&wire.transportErrorCode===null
  &&stdout.toString('base64')===wire.stdoutBase64&&stderr.toString('base64')===wire.stderrBase64
  &&stdout.length===wire.stdoutBytes&&sha(stdout)===wire.stdoutSHA256&&stderr.length===0&&wire.stderrBytes===0&&sha(stderr)===wire.stderrSHA256
  &&wire.hostProgramSHA256===HUP.host.sha256&&wire.stdoutSHA256===audit.rawEvidence.rootStdout.sha256&&wire.stdoutBytes===audit.rawEvidence.rootStdout.bytes,'R33_PROTECTION_HUP_ORIGINAL_WIRE_CHANGED');
 const {assertBoundedHupMethodHost}=await import('./run-factory-bounded-pidfd-hup-method-r33.mjs');
 const host=JSON.parse(stdout);need(assertBoundedHupMethodHost(host,HUP.context.sha256,contract.sources)===true,'R33_PROTECTION_HUP_HOST_INCOMPLETE');
 const recheck=async()=>{const last=await settleEvidenceReads([...refs,...headRefs].map(r=>()=>readLocal(r.path)));
  need([...raw,...head].every((b,i)=>Buffer.from(b).equals(Buffer.from(last[i]))),'R33_PROTECTION_HUP_CHANGED_AFTER');};
 await recheck();return {qualified:true,result:HUP.result,audit:HUP.audit,scope:'one saved finite fixture and owned child only',recheck};
}

/** A new source contract binds external reviews without a self-review hash cycle. */
function sourceContract(v,{consumerH,adapterH,activation}){
 need(exactKeys(v,['schemaVersion','kind','id','revision','observerKind','observerVersion','remoteReadAuthorized','inventoryContractId','inventoryContractRevision','inventoryVerifier','inventoryActivation','consumer','adapter','sourceMethod','selectionRef','actualMethodQualification','actualMethodAudit','hupMethodQualification','hupMethodAudit','hupIntegrationSelection'])
  &&v.schemaVersion===1&&v.kind==='r33-current-main602-meta-r4-single-entry-protection-source-contract'&&/^[a-f0-9-]{36}$/.test(v.id)&&v.revision===1
  &&v.observerKind===S.kind&&v.observerVersion===S.observerVersion&&v.remoteReadAuthorized===true&&v.inventoryContractId===S.inventoryContractId&&v.inventoryContractRevision===1
  &&isRef(v.inventoryVerifier)&&v.inventoryVerifier.path===INVENTORY_VERIFIER&&same(v.inventoryActivation,activation.inventory)
  &&same(v.consumer,{path:SELF,sha256:consumerH})&&same(v.adapter,{path:ADAPTER,sha256:adapterH})&&same(v.sourceMethod,SOURCE)
  &&same(v.selectionRef,{path:currentMainProtectionR33Contract.selectionPath,sha256:currentMainProtectionR33Contract.selectionSHA256})
  &&same(v.actualMethodQualification,activation.actualMethodQualification)&&same(v.actualMethodAudit,activation.actualMethodAudit)
   &&same(v.hupMethodQualification,activation.hupMethodQualification)&&same(v.hupMethodAudit,activation.hupMethodAudit)&&same(v.hupIntegrationSelection,activation.hupIntegrationSelection),'R33_PROTECTION_SOURCE_CONTRACT_REQUIRED');return jsonClone(v);
}
/** New physical proof is validated in its own kind. No old-kind or metadata projection. */
export function assertCurrentMainSingleEntryProtectionContractR33(v,{fresh=false,now=Date.now()}={}){
 need(v?.kind===S.kind&&v.observerVersion===S.observerVersion&&v.oldObserverExecutionClaimed===false&&v.inventoryValidationProjectionOnly===false&&v.newInventoryVerifierUsed===true
  &&v.methodQualificationDoesNotQualifyWholeInventory===true&&v.finiteMethodQualified===true&&same(v.actualMethodQualification,METHOD.result)
   &&v.boundedHupFiniteMethodQualified===true&&same(v.hupMethodQualification,HUP.result)&&same(v.hupMethodAudit,HUP.audit),'R33_PROTECTION_NEW_PROVENANCE_REQUIRED');
 assertCurrentMainSingleEntryProtectionActivationR33(v.activation);
 need(H.test(v.consumerSHA256??'')&&H.test(v.sourceContract?.adapter?.sha256??''),'R33_PROTECTION_SOURCE_CONTRACT_REQUIRED');
 sourceContract(v.sourceContract,{consumerH:v.consumerSHA256,adapterH:v.sourceContract.adapter.sha256,activation:v.activation});
 need(same(v.executedSources,{orchestrator:v.sourceContract.inventoryVerifier.sha256,adapter:v.sourceContract.adapter.sha256,generator:SOURCE.generator.sha256,pureModule:SOURCE.pureModule.sha256,hupTransformer:SOURCE.hupTransformer.sha256,hupHelper:SOURCE.hupHelper.sha256,nativeProgram:SOURCE.hupNative.sha256,oldBuildProgram:SOURCE.hupBuild.sha256})
  &&v.consumerSHA256===v.sourceContract.consumer.sha256&&v.observerContractId===v.sourceContract.id,'R33_PROTECTION_EXECUTED_SOURCE_CHANGED');
 const rows=v.sourceReceipts;need(Array.isArray(rows)&&rows.length===4&&same(rows.map(r=>r.stage),STAGES),'R33_PROTECTION_SOURCE_RECEIPTS_INCOMPLETE');
 need(rows.every((r,i)=>r.schemaVersion===1&&r.kind==='r33-current-main602-meta-r4-single-entry-protection-source-receipt'&&r.observerKind===S.kind&&r.observerVersion===S.observerVersion
  &&r.responseHashDomain==='canonical-parsed-frame'&&same(r.sourceMethod,currentMainSingleEntryProtectionObserverR33Preparation.sourceMethod)
  &&r.actualProgramSHA256===PROGRAMS[i]&&r.parametersSHA256===PAYLOADS[i]&&H.test(r.responseSHA256)
  &&r.originalProgramSHA256===[PROGRAMS[0],'66a241993d910da443bc1b3776ab4c6efc33bc1b44401c7dddff4caa06754155','66e84cadadd232daa58d62b2ee7fd58c6f61cf08baec4e124e7c4ef9a237f8d6',PROGRAMS[3]][i]),'R33_PROTECTION_FIXED_ROUTE_CHANGED');
 need(rows[0].responseSHA256===v.observations?.hostBeforeSHA256&&rows[3].responseSHA256===v.observations?.hostAfterSHA256&&rows[1].responseSHA256===sha(v.observations?.nativeSource)&&rows[2].responseSHA256===sha(v.observations?.oldBuild),'R33_PROTECTION_RESPONSE_RECEIPTS_CHANGED');
 const physical=v.physicalInventoryProof;assertCurrentMainProtectionR33Proof(physical,{fresh,now});
 need(same(physical.physicalQualification.activation,v.activation.inventory)&&physical.physicalQualification.sourceSHA256===v.sourceContract.inventoryVerifier.sha256
  &&Object.keys(physical).every(k=>k==='kind'||same(v[k],physical[k])),'R33_CURRENT_MAIN_PROTECTION_PHYSICAL_FIELDS_CHANGED');return v;
}
export function createCurrentMainSingleEntryProtectionSerialReadersR33(d){
 let tail=Promise.resolve();const serial=fn=>(...args)=>{const next=tail.then(()=>fn(...args));tail=next.catch(()=>{});return next;};
 return {...Object.fromEntries(['api','readRoot','readPrimary','nodeState','queueState'].map(name=>[name,serial(d[name])])),drain:async()=>{for(;;){const captured=tail;await captured;if(captured===tail)return;}}};
}
async function privateWX(v){const raw=Buffer.from(JSON.stringify(v)+'\n'),path='.jarvis-dev/maintenance/r33-current-main602-meta-r4-single-entry-protection-capture-'+Date.now()+'-'+randomUUID()+'.json',f=await open(path,'wx',0o600);
 try{await f.writeFile(raw);await f.sync()}finally{await f.close()}need(Buffer.from(await safeReadLocal(path)).equals(raw),'R33_PROTECTION_CAPTURE_SAVE_CHANGED');return{path,sha256:sha(raw),bytes:raw.length}}
function rawTransport(target,p,program){need(['root','primary'].includes(target)&&typeof program==='string','R33_PROTECTION_CAPTURE_TARGET_CHANGED');return spawnSync('ssh',['-F',lanProfile,'-o','BatchMode=yes',target==='root'?'jarvis-101':'jarvis-112','sudo -n python3 -'],{input:python(p,program),windowsHide:true,timeout:target==='root'?180000:45000,maxBuffer:2000000})}
export function createCurrentMainSingleEntryProtectionCaptureR33(d){let failed=false,root=0;const rows=[],secondaryFailures=[];
 async function save(value,record){try{const r=await d.privateEvidence(value);need(r&&localPath(r.path)&&H.test(r.sha256)&&Number.isSafeInteger(r.bytes),'R33_PROTECTION_CAPTURE_REF_CHANGED');rows.push({...record,privateEvidence:r})}catch(e){failed=true;throw e}}
 async function transport(target,p,program){need(!failed,'R33_PROTECTION_CAPTURE_ALREADY_FAILED');const sourceSHA256=sha(program),parametersSHA256=sha(canonical(p)),stage=target==='root'?STAGES[root++]:null;
  try{if(target==='root')need(stage&&sourceSHA256===PROGRAMS[root-1]&&parametersSHA256===PAYLOADS[root-1],'R33_PROTECTION_CAPTURE_ROOT_SEQUENCE_CHANGED');
   const r=await d.rawTransport(target,p,program),stdout=Buffer.from(r.stdout??''),stderr=Buffer.from(r.stderr??'');
   const row={target,stage,sourceSHA256,parametersSHA256,representation:'transport-stdout-bytes',wireBytes:true,status:r.status??null,responseSHA256:sha(stdout),bytes:stdout.length};
   await save({schemaVersion:1,kind:'r33-current-main602-meta-r4-single-entry-protection-private-transport',...row,stdoutBase64:stdout.toString('base64'),stderrBase64:stderr.toString('base64'),signal:r.signal??null,errorCode:r.error?.code??null},row);
   need(r.status===0&&r.signal===null&&!r.error,'R33_PROTECTION_CAPTURE_TRANSPORT_INCOMPLETE');const frame=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(stdout));rows.at(-1).parsedFrameSHA256=sha(canonical(frame));return frame;
  }catch(e){failed=true;throw e}}
 async function parsed(target,fn,args){need(!failed,'R33_PROTECTION_CAPTURE_ALREADY_FAILED');const sourceSHA256=AUTHORITY_REFS[target==='api'?10:9].sha256,parametersSHA256=sha(canonical(args));let frame;
  try{frame=await fn(...args)}catch(e){failed=true;try{await save({schemaVersion:1,kind:'r33-current-main602-meta-r4-single-entry-protection-private-parsed-failure',target,sourceSHA256,parametersSHA256,errorCode:'R33_PROTECTION_PARSED_READ_INCOMPLETE'}, {target,stage:null,sourceSHA256,parametersSHA256,representation:'parsed-failure',wireBytes:false,responseSHA256:null})}catch{secondaryFailures.push('R33_PROTECTION_FAILURE_CAPTURE_SAVE_INCOMPLETE')}throw e}
  const row={target,stage:null,sourceSHA256,parametersSHA256,representation:'parsed-json-frame',wireBytes:false,responseSHA256:sha(canonical(frame))};await save({schemaVersion:1,kind:'r33-current-main602-meta-r4-single-entry-protection-private-parsed-frame',...row,frame},row);return frame;
 }
 return{api:(...args)=>parsed('api',d.api,args),readRoot:(p,s)=>transport('root',p,s),readPrimary:(p,s)=>transport('primary',p,s),nodeState:()=>parsed('nodeState',d.nodeState,[]),queueState:()=>parsed('queueState',d.queueState,[]),evidence:()=>({kind:'r33-current-main602-meta-r4-single-entry-protection-capture-evidence',captureComplete:!failed,apiFramesAreWireBytes:false,records:structuredClone(rows),secondaryFailures:[...secondaryFailures]})};
}
export function assertCurrentMainSingleEntryProtectionSourceReviewsR33(reviews,{consumerH,adapterH,inventoryVerifierH}){
 need(Array.isArray(reviews)&&reviews.length===2&&reviews[0].kind==='r33-current-main602-meta-r4-single-entry-protection-consumer-independent-local-review'&&reviews[0].consumerSHA256===consumerH&&reviews[0].adapterSHA256===adapterH
  &&reviews[1].kind==='r33-current-main602-meta-r4-single-entry-protection-adapter-independent-local-review'&&reviews[1].adapterSHA256===adapterH
  &&reviews.every(r=>r.staticPreparationReady===true&&r.remainingP0P1===0&&r.remoteOperationsPerformed===false&&r.actualFullProtectionQualified===false&&r.inventoryVerifierSHA256===inventoryVerifierH
   &&r.generatorSHA256===SOURCE.generator.sha256&&r.moduleSHA256===SOURCE.pureModule.sha256
    &&r.hupTransformerSHA256===SOURCE.hupTransformer.sha256&&r.hupHelperSHA256===SOURCE.hupHelper.sha256
    &&r.hupNativeSHA256===SOURCE.hupNative.sha256&&r.hupBuildSHA256===SOURCE.hupBuild.sha256),'R33_PROTECTION_SOURCE_REVIEWS_REQUIRED');return reviews;
}
export async function verifyFactoryCurrentMainSingleEntryProtectionContractR33(options={},deps){
 const activation=assertCurrentMainSingleEntryProtectionActivationR33(options); // Missing external refs refuse before any credentials, file, transport or platform read.
 const d={now:Date.now,readLocal:safeReadLocal,privateEvidence:privateWX,rawTransport,nodeState,queueState,...deps};
 const refs=[...AUTHORITY_REFS,...Object.values(SOURCE),{path:SELF},{path:ADAPTER},...['sourceContract','consumerIndependentReview','adapterIndependentReview','actualMethodQualification','actualMethodAudit','hupMethodQualification','hupMethodAudit','hupIntegrationSelection'].map(k=>activation[k]),...Object.values(activation.inventory),{path:targetCleanupR29Scope.installedManifestPath,sha256:targetCleanupR29Scope.installedManifestSHA256}];
 const initial=await settleEvidenceReads(refs.map(r=>()=>d.readLocal(r.path)));need(initial.every((b,i)=>!refs[i].sha256||sha(b)===refs[i].sha256),'R33_PROTECTION_SOURCE_CHANGED');
 const map=new Map(refs.map((r,i)=>[r.path,Buffer.from(initial[i])])),decode=r=>JSON.parse(map.get(r.path)),consumerH=sha(map.get(SELF)),adapterH=sha(map.get(ADAPTER));
 const contract=sourceContract(decode(activation.sourceContract),{consumerH,adapterH,activation});
 const inventoryVerifierRaw=await d.readLocal(contract.inventoryVerifier.path);need(sha(inventoryVerifierRaw)===contract.inventoryVerifier.sha256,'R33_CURRENT_MAIN_PROTECTION_INVENTORY_SOURCE_CHANGED');
 const selection=await d.readLocal(contract.selectionRef.path);need(sha(selection)===contract.selectionRef.sha256,'R33_PROTECTION_SELECTION_SOURCE_CHANGED');
 const reviews=[decode(activation.consumerIndependentReview),decode(activation.adapterIndependentReview)];
 assertCurrentMainSingleEntryProtectionSourceReviewsR33(reviews,{consumerH,adapterH,inventoryVerifierH:contract.inventoryVerifier.sha256});
 const inventoryQualification=await readCurrentMainProtectionR33Qualification(activation.inventory,d.readLocal);
 need(inventoryQualification.selfSHA256===contract.inventoryVerifier.sha256,'R33_CURRENT_MAIN_PROTECTION_INVENTORY_SOURCE_CHANGED');
 const method=decode(activation.actualMethodQualification);await verifySingleEntryMethodQualificationEvidenceR33(method,d.readLocal);
 const audit=decode(activation.actualMethodAudit);need(audit.kind==='r33-single-entry-method-r3-independent-observation-saved-evidence-limited-audit'&&audit.remoteOperationsPerformed===false
  &&audit.savedEvidenceAuditPassed===true&&audit.nonce===METHOD.nonce&&audit.actualMethodSubsetIndependentlyQualified===true&&audit.currentOwnedScopeCleanupVerified===true
  &&audit.references?.actualIndependentResult?.sha256===METHOD.result.sha256,'R33_PROTECTION_METHOD_SAVED_AUDIT_REQUIRED');
 const hup=await verifyBoundedHupMethodQualificationEvidenceR33(d.readLocal);
 const run=async api=>{d.api=api;need(typeof api==='function','R33_PROTECTION_API_REQUIRED');const captured=createCurrentMainSingleEntryProtectionCaptureR33(d),serial=createCurrentMainSingleEntryProtectionSerialReadersR33(captured),manifest=decode(refs.at(-1));
  const adapter=createCurrentMainSingleEntryProtectionObserverR33Adapter({preparation:manifest.preparation,sourceBundle:{boundNativeProgram:boundProcessCensusR32NativeProgram(),boundBuildProgram:boundProcessCensusR32BuildProgram(),singleDirentSource:map.get(SOURCE.pureModule.path).toString('utf8'),boundedHupSource:map.get(SOURCE.hupHelper.path).toString('utf8')}},serial.readRoot);
  let physical,result,primary=null,stable=false;
  try{physical=await verifyFactoryCurrentMainProtectionContractR33(activation.inventory,{...d,...serial,readRoot:adapter.readRoot});result={...physical,kind:S.kind,observerVersion:S.observerVersion,observerContractId:contract.id,sourceContract:contract,consumerSHA256:consumerH,activation,physicalInventoryProof:physical,
   oldObserverExecutionClaimed:false,inventoryValidationProjectionOnly:false,newInventoryVerifierUsed:true,finiteMethodQualified:true,methodQualificationDoesNotQualifyWholeInventory:true,actualMethodQualification:METHOD.result,boundedHupFiniteMethodQualified:hup.qualified,hupMethodQualification:HUP.result,hupMethodAudit:HUP.audit,
   executedSources:{orchestrator:contract.inventoryVerifier.sha256,adapter:adapterH,generator:SOURCE.generator.sha256,pureModule:SOURCE.pureModule.sha256,hupTransformer:SOURCE.hupTransformer.sha256,hupHelper:SOURCE.hupHelper.sha256,nativeProgram:SOURCE.hupNative.sha256,oldBuildProgram:SOURCE.hupBuild.sha256},sourceReceipts:adapter.receipts()};
   if(result.ready)assertCurrentMainSingleEntryProtectionContractR33(result,{fresh:true,now:d.now()});
  }catch(e){primary=e;}finally{try{await serial.drain()}catch(e){if(!primary)primary=e;}}
  try{await verifySingleEntryMethodQualificationEvidenceR33(method,d.readLocal);await hup.recheck();const last=await settleEvidenceReads(refs.map(r=>()=>d.readLocal(r.path)));stable=initial.every((b,i)=>Buffer.from(b).equals(Buffer.from(last[i])))&&Buffer.from(await d.readLocal(contract.selectionRef.path)).equals(Buffer.from(selection))&&Buffer.from(await d.readLocal(contract.inventoryVerifier.path)).equals(Buffer.from(inventoryVerifierRaw));need(stable,'R33_PROTECTION_SOURCE_CHANGED_AFTER');}catch(e){if(!primary)primary=e;else primary.secondarySourceFailure='R33_PROTECTION_SOURCE_RECHECK_INCOMPLETE';}
  const evidence={...captured.evidence(),consumerSHA256:consumerH,sourceBytesCheckedInitially:true,sourceBytesCheckedFinally:stable};
  if(primary){primary.captureEvidence=evidence;throw primary}
  const root=evidence.records.filter(r=>r.target==='root');try{need(evidence.captureComplete&&root.length===4&&root.every((r,i)=>r.stage===result.sourceReceipts[i].stage&&r.sourceSHA256===result.sourceReceipts[i].actualProgramSHA256&&r.parametersSHA256===result.sourceReceipts[i].parametersSHA256&&r.parsedFrameSHA256===result.sourceReceipts[i].responseSHA256),'R33_PROTECTION_CAPTURE_CONSUMPTION_CHANGED')}catch(e){e.captureEvidence=evidence;throw e}
  return{...result,transportEvidence:evidence,currentR6CleanupQualified:false,productCodeExecuted:false,modelsInvoked:false};
 };
 await inventoryQualification.recheck();
 return typeof d.api==='function'?run(d.api):withPlatform(({api})=>run(api));
}
