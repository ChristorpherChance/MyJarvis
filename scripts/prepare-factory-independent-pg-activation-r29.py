"""Deterministic local revision of the reviewed PG-only worker. No remote IO."""
import hashlib
from pathlib import Path

root=Path(__file__).parent
source=(root/'factory-build-independent-pg-runtime-r29.py').read_bytes()
assert hashlib.sha256(source).hexdigest()=='91c5e75ded3aeb74b6f3c9ad7ad0e1639f4eabf3dc2db74a6209f06268e9197c'
text=source.decode()
activation=r'''
# A once-created, root-owned activation grants only this finite revision.
# Review hashes are external to avoid a source/review hash cycle. No product
# paths or commands are accepted from that control document.
BASE_TOOLS=TOOLS
ACTIVATION=None
CANDIDATE={'fingerprint':'4907e45a21799f2dd14ac2373769607f40d6b9e0319bb614fbe259b157e60493','files':621,'metadataSHA256':'2da9d3e490fd6d042113c067807a89b000a4f40fdb5fa8d3ca2911b6615ebce8','identity':{'device':66306,'inode':6718050}}
GOALS_SHA='23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42'
BASIS={'sourceCheck':'f1dab15a255aaea43c3c34cd5d1a82e5855ad2e63fd60fc7017a7b495af8f0cc','sourceCleanup':'324ed10f0efef0aeb29a6c03550c172a86c46072bc4bbeab93c931ffe629f610','cacheReadback':'daeda9233ecd88defc7206c233c0fdbfc23a55b10cde6702bac6381b7622abe0','historicalPreparation':'ee7111341710660005699b190ca0231635d1d206d0a3008c39902dd4f77938e5'}
FIXED_CACHE_PIN='464258e571628970a04363f19ec50a592959f9c3358fd501246de26e302b2b0f'
FIXED_FREEZER_PIN='09dd6ecef0ba1df906c1f938db8fa99cde4b8fccc2fa71bae8b281b9dc8a0dbb'

def qualify_activation(v,attempt,worker_sha):
    fields={'schemaVersion','kind','attempt','workerSHA256','pgVersion','imageID','candidate','originalGoalsSHA256','basisRefs','pins'}
    need(isinstance(v,dict) and set(v)==fields and v['schemaVersion']==1 and v['kind']=='r29-independent-pg-exact-activation' and attempt_valid(attempt) and v['attempt']==attempt and v['workerSHA256']==worker_sha and v['pgVersion']=='8.23.0' and v['imageID']==IMAGE and v['candidate']==CANDIDATE and v['originalGoalsSHA256']==GOALS_SHA,'QA_PG_ACTIVATION_SCOPE_CHANGED')
    refs=v['basisRefs'];need(isinstance(refs,dict) and set(refs)==set(BASIS),'QA_PG_ACTIVATION_BASIS_CHANGED')
    for k,pin in BASIS.items():
        need(isinstance(refs[k],dict) and set(refs[k])=={'path','sha256'} and refs[k]['sha256']==pin and isinstance(refs[k]['path'],str) and re.fullmatch('artifacts/software-factory/goals-r29/[a-zA-Z0-9_.-]+\\.json',refs[k]['path']),'QA_PG_ACTIVATION_BASIS_CHANGED')
    pins=v['pins'];need(isinstance(pins,dict) and set(pins)=={'reviewSHA256','cacheContractSHA256','cacheReadbackSHA256','protectionSHA256','freezerSHA256'} and all(isinstance(x,str) and H.fullmatch(x) for x in pins.values()) and pins['cacheContractSHA256']==FIXED_CACHE_PIN and pins['cacheReadbackSHA256']==BASIS['cacheReadback'] and pins['freezerSHA256']==FIXED_FREEZER_PIN,'QA_PG_ACTIVATION_PINS_CHANGED')
    return v

def load_activation(attempt,phase):
    global TOOLS,ACTIVATION,REVIEW_PIN,CACHE_CONTRACT_PIN,PROTECTION_PIN,FREEZER_PIN,CLEANUP_PIN
    need(os.geteuid()==0,'QA_PG_ROOT_CONTROL_REQUIRED');control=ROOT/attempt/'control';root_directory(ROOT/attempt,True);root_directory(control,True)
    raw=read_private(control/'activation.json');v=qualify_activation(json.loads(raw),attempt,self_source());TOOLS=control;ACTIVATION=v
    REVIEW_PIN=v['pins']['reviewSHA256'];CACHE_CONTRACT_PIN=v['pins']['cacheContractSHA256'];PROTECTION_PIN=v['pins']['protectionSHA256'];FREEZER_PIN=v['pins']['freezerSHA256'];CLEANUP_PIN=None
    review=read_private(control/'r29-qa-pg-build-review.json');need(sha(review)==REVIEW_PIN,'QA_PG_ACTIVATION_REVIEW_CHANGED');r=json.loads(review)
    need(r.get('kind')=='r29-pg-exact-activation-independent-local-review' and r.get('workerSHA256')==v['workerSHA256'] and r.get('remainingP0P1')==0 and r.get('staticPreparationReady') is True and r.get('actualRuntimeReady') is False,'QA_PG_ACTIVATION_REVIEW_UNPROVEN')
    cache=read_private(control/'r29-qa-pg-cache-readback.json');need(sha(cache)==BASIS['cacheReadback'],'QA_PG_ACTIVATION_CACHE_PROOF_CHANGED');c=json.loads(cache)
    need(c.get('ready') is True and c.get('cacheClosureIndependentlyVerified') is True and c.get('twoFullReads') is True and c.get('runtimeReady') is False and c.get('totalBytes')==475914918,'QA_PG_ACTIVATION_CACHE_PROOF_UNPROVEN')
    if phase in ['--freeze','--readback']:
        f=json.loads(read_private(control/'freeze-activation.json'))
        need(set(f)=={'schemaVersion','kind','attempt','activationSHA256','workerSHA256','cleanupProofSHA256','protectionSHA256'} and f['schemaVersion']==1 and f['kind']=='r29-pg-exact-freeze-activation' and f['attempt']==attempt and f['activationSHA256']==sha(raw) and f['workerSHA256']==v['workerSHA256'] and H.fullmatch(f.get('cleanupProofSHA256','')) and H.fullmatch(f.get('protectionSHA256','')),'QA_PG_FREEZE_ACTIVATION_CHANGED')
        CLEANUP_PIN=f['cleanupProofSHA256'];PROTECTION_PIN=f['protectionSHA256']
    return v

def assert_protection_fresh():
    need(isinstance(PROTECTION_PIN,str) and H.fullmatch(PROTECTION_PIN),'QA_PG_PROTECTION_NOT_PINNED')
    name='r29-qa-pg-freeze-protection-proof.json' if CLEANUP_PIN else 'r29-qa-pg-protection-proof.json'
    raw=read_private(TOOLS/name);need(sha(raw)==PROTECTION_PIN,'QA_PG_BOUND_PREPARATION_CHANGED');v=json.loads(raw)
    need(v.get('kind')=='software-factory-r29-new-protection-contract-observation' and v.get('ready') is True and v.get('newContract') is True and v.get('contractId')=='9bf97027-a7f6-4706-b7ad-fcb29c304e41' and v.get('contractRevision')==1 and v.get('newProtectedInventorySHA256')=='4a625c89dff8a15a347d35f7ef630aa20bf45d1e2c72986fe4eb8e6f4ddf8759' and all(v.get(k) is True for k in ['newContractInventoryVerified','protectedInventoryFullyVerified','fullQueueSQLVerified','nodeACKIdle','queueIdle','profileUnchanged']) and v.get('baseTemplateSHA256')=='9c6fd214eb3fb55020089270ff074f9217f99519f098a0ab8c05eab3ac2b5172' and v.get('productAccepted') is False and v.get('remoteMutationsPerformed') is False and v.get('modelsInvoked') is False,'QA_PG_PROTECTION_UNPROVEN')
    expected={'sha256':CANDIDATE['fingerprint'],'files':621,'bytes':18386584,'metadataSHA':CANDIDATE['metadataSHA256'],'stable':True,'identity':CANDIDATE['identity']}
    need(v.get('sources',{}).get('r29')==expected,'QA_PG_PROTECTION_SOURCE_CHANGED')
    import datetime
    try: observed=datetime.datetime.fromisoformat(v['at'].replace('Z','+00:00')).timestamp()
    except (ValueError,TypeError,KeyError): raise RuntimeError('QA_PG_PROTECTION_TIME_INVALID')
    need(-30<=time.time()-observed<300,'QA_PG_PROTECTION_STALE');return v

def check_actual_cleanup(proof,attempt,h):
    need(proof.get('schemaVersion')==1 and proof.get('kind')=='software-factory-r29-independent-pg-cleanup' and proof.get('attempt')==attempt and proof.get('imageID')==IMAGE and proof.get('workerSHA256')==self_source() and proof.get('activationSHA256')==sha(read_private(TOOLS/'activation.json')) and all(proof.get(k) is True for k in ['ready','cleanupIndependentlyVerified','independent','processesComplete','dockerComplete','ownerComplete','relatedWritersAbsent','fullQueueSQLVerified','nodeACKIdle','protectedInventoryFullyVerified']) and all(proof.get(k) is False for k in ['productCodeExecuted','pgRuntimeAccepted','runtimeFrozen']),'QA_PG_ACTUAL_CLEANUP_UNPROVEN')
    detached=dict(proof);detached['kind']='r29-pg-runtime-install-independent-cleanup';h.check_cleanup(detached,attempt)

'''
# Override only the finite activation and proof boundary; retain existing
# install/create/cleanup/byte-freeze implementation.
needle='def main():\n'
assert text.count(needle)==1
text=text.replace(needle,activation+needle)
old="assert_protection_fresh();root_directory(ROOT,True);private=ROOT/attempt;need(not os.path.lexists(private),'QA_PG_DUPLICATE_ATTEMPT_USE_CHECK');need(container(attempt) is None,'QA_PG_RESOURCE_ALREADY_EXISTS');empty_labels(attempt);assert_protection_fresh();private.mkdir(mode=0o700)"
new="assert_protection_fresh();root_directory(ROOT,True);private=ROOT/attempt;root_directory(private,True);need(set(os.listdir(private))=={'control'},'QA_PG_DUPLICATE_ATTEMPT_USE_CHECK');need(container(attempt) is None,'QA_PG_RESOURCE_ALREADY_EXISTS');empty_labels(attempt);assert_protection_fresh()"
assert text.count(old)==1;text=text.replace(old,new)
text=text.replace("proof=json.loads(proof_raw);h.check_cleanup(proof,attempt)","proof=json.loads(proof_raw);check_actual_cleanup(proof,attempt,h)")
anchor="attempt=sys.argv[2]\n    if action=='--reconcile-cleanup':"
assert text.count(anchor)==1;text=text.replace(anchor,"attempt=sys.argv[2]\n    load_activation(attempt,action)\n    if action=='--reconcile-cleanup':")
text=text.replace('value=launch(attempt,caches)','value=launch(attempt,caches)')
target=root/'factory-build-independent-pg-runtime-r29-r2.py'
with target.open('xb') as f:f.write(text.encode())
print(hashlib.sha256(text.encode()).hexdigest())
