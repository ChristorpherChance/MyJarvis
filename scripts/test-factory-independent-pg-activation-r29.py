"""Only local activation guards; no actual Docker, PG or journals."""
import copy, importlib.util, json, unittest, time
from pathlib import Path
from unittest.mock import patch

P=Path(__file__).parent
s=importlib.util.spec_from_file_location('pg_r2_activation',P/'factory-build-independent-pg-runtime-r29-r2.py');b=importlib.util.module_from_spec(s);s.loader.exec_module(b)
def fixture():
    return {'schemaVersion':1,'kind':'r29-independent-pg-exact-activation','attempt':'a'*32,'workerSHA256':'b'*64,'pgVersion':'8.23.0','imageID':b.IMAGE,'candidate':copy.deepcopy(b.CANDIDATE),'originalGoalsSHA256':b.GOALS_SHA,'basisRefs':{k:{'path':'artifacts/software-factory/goals-r29/'+k+'.json','sha256':v} for k,v in b.BASIS.items()},'pins':{'reviewSHA256':'c'*64,'cacheContractSHA256':b.FIXED_CACHE_PIN,'cacheReadbackSHA256':b.BASIS['cacheReadback'],'protectionSHA256':'d'*64,'freezerSHA256':b.FIXED_FREEZER_PIN}}
class Activation(unittest.TestCase):
    def test_valid_exact_activation(self): self.assertEqual(b.qualify_activation(fixture(),'a'*32,'b'*64),fixture())
    def test_default_inspect_is_unready(self):self.assertFalse(b.inspect_preparation()['ready'])
    def test_unknown_field(self):
        v=fixture();v['command']='id'
        with self.assertRaises(RuntimeError):b.qualify_activation(v,'a'*32,'b'*64)
    def test_wrong_worker(self):
        with self.assertRaises(RuntimeError):b.qualify_activation(fixture(),'a'*32,'e'*64)
    def test_wrong_attempt(self):
        with self.assertRaises(RuntimeError):b.qualify_activation(fixture(),'f'*32,'b'*64)
    def test_source_wrong_fingerprint(self):
        v=fixture();v['candidate']['fingerprint']='f'*64
        with self.assertRaises(RuntimeError):b.qualify_activation(v,'a'*32,'b'*64)
    def test_source_wrong_metadata(self):
        v=fixture();v['candidate']['metadataSHA256']='f'*64
        with self.assertRaises(RuntimeError):b.qualify_activation(v,'a'*32,'b'*64)
    def test_source_wrong_file_count(self):
        v=fixture();v['candidate']['files']=620
        with self.assertRaises(RuntimeError):b.qualify_activation(v,'a'*32,'b'*64)
    def test_original_goals_changed(self):
        v=fixture();v['originalGoalsSHA256']='f'*64
        with self.assertRaises(RuntimeError):b.qualify_activation(v,'a'*32,'b'*64)
    def test_image_changed(self):
        v=fixture();v['imageID']='sha256:'+'f'*64
        with self.assertRaises(RuntimeError):b.qualify_activation(v,'a'*32,'b'*64)
    def test_cache_readback_cannot_be_worker_claim(self):
        v=fixture();v['pins']['cacheReadbackSHA256']='f'*64
        with self.assertRaises(RuntimeError):b.qualify_activation(v,'a'*32,'b'*64)
    def test_freezer_changed(self):
        v=fixture();v['pins']['freezerSHA256']='f'*64
        with self.assertRaises(RuntimeError):b.qualify_activation(v,'a'*32,'b'*64)
    def test_extra_cleanup_pin_not_initially_accepted(self):
        v=fixture();v['pins']['cleanupSHA256']='f'*64
        with self.assertRaises(RuntimeError):b.qualify_activation(v,'a'*32,'b'*64)
    def test_non_public_basis_path(self):
        v=fixture();v['basisRefs']['sourceCheck']['path']='.secrets/password.json'
        with self.assertRaises(RuntimeError):b.qualify_activation(v,'a'*32,'b'*64)
    def test_old_failed_cleanup_not_current_basis(self):
        v=fixture();v['basisRefs']['sourceCleanup']['sha256']='f'*64
        with self.assertRaises(RuntimeError):b.qualify_activation(v,'a'*32,'b'*64)
    def test_missing_pin(self):
        v=fixture();v['pins']['reviewSHA256']=None
        with self.assertRaises(RuntimeError):b.qualify_activation(v,'a'*32,'b'*64)
    def test_new_protection_rechecked_after_costly_cache_reads(self):
        now=[1700000000.0]
        p={'kind':'software-factory-r29-new-protection-contract-observation','ready':True,'newContract':True,'contractId':'9bf97027-a7f6-4706-b7ad-fcb29c304e41','contractRevision':1,'newProtectedInventorySHA256':'4a625c89dff8a15a347d35f7ef630aa20bf45d1e2c72986fe4eb8e6f4ddf8759','baseTemplateSHA256':'9c6fd214eb3fb55020089270ff074f9217f99519f098a0ab8c05eab3ac2b5172','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(now[0])),**{k:True for k in ['newContractInventoryVerified','protectedInventoryFullyVerified','fullQueueSQLVerified','nodeACKIdle','queueIdle','profileUnchanged']},**{k:False for k in ['productAccepted','remoteMutationsPerformed','modelsInvoked']},'sources':{'r29':{'sha256':b.CANDIDATE['fingerprint'],'files':621,'bytes':18386584,'metadataSHA':b.CANDIDATE['metadataSHA256'],'stable':True,'identity':b.CANDIDATE['identity']}}}
        encoded=json.dumps(p).encode();values={'r29-qa-pg-build-review.json':b'{}','r29-qa-pg-cache-contract.json':b'{}','factory-freeze-independent-pg-runtime-r29.py':b'# not executed','r29-qa-pg-protection-proof.json':encoded}
        from contextlib import ExitStack
        with ExitStack() as s:
            for key,name in [('REVIEW_PIN','r29-qa-pg-build-review.json'),('CACHE_CONTRACT_PIN','r29-qa-pg-cache-contract.json'),('FREEZER_PIN','factory-freeze-independent-pg-runtime-r29.py'),('PROTECTION_PIN','r29-qa-pg-protection-proof.json')]:s.enter_context(patch.object(b,key,b.sha(values[name])))
            s.enter_context(patch.object(b.os,'geteuid',return_value=0,create=True));s.enter_context(patch.object(b,'read_private',side_effect=lambda path:values[path.name]));s.enter_context(patch.object(b.time,'time',side_effect=lambda:now[0]))
            def cost(_):now[0]+=301;return []
            s.enter_context(patch.object(b,'verify_cache_reuse',side_effect=cost))
            with self.assertRaisesRegex(RuntimeError,'PROTECTION_STALE'):b.preflight()
    def test_actual_cleanup_requires_every_independent_flag(self):
        proof={'schemaVersion':1,'kind':'software-factory-r29-independent-pg-cleanup','attempt':'a'*32,'imageID':b.IMAGE,'workerSHA256':'b'*64,'activationSHA256':b.sha(b'activation'),**{k:True for k in ['ready','cleanupIndependentlyVerified','independent','processesComplete','dockerComplete','ownerComplete','relatedWritersAbsent','fullQueueSQLVerified','nodeACKIdle','protectedInventoryFullyVerified']},**{k:False for k in ['productCodeExecuted','pgRuntimeAccepted','runtimeFrozen']}}
        accepted=[]
        class H:
            def check_cleanup(_,v,a): accepted.append(v)
        with patch.object(b,'self_source',return_value='b'*64),patch.object(b,'read_private',return_value=b'activation'):
            b.check_actual_cleanup(proof,'a'*32,H())
            for key in ['ready','cleanupIndependentlyVerified','independent','processesComplete','dockerComplete','ownerComplete','relatedWritersAbsent','fullQueueSQLVerified','nodeACKIdle','protectedInventoryFullyVerified']:
                v=copy.deepcopy(proof);v[key]=False
                with self.assertRaises(RuntimeError):b.check_actual_cleanup(v,'a'*32,H())
        self.assertEqual(len(accepted),1);self.assertEqual(accepted[0]['kind'],'r29-pg-runtime-install-independent-cleanup');self.assertEqual(proof['kind'],'software-factory-r29-independent-pg-cleanup')
    def test_cleanup_utc_time_accepts_milliseconds_and_refuses_stale_or_unzoned(self):
        with patch.object(b.time,'time',return_value=1700000000.123):
            b.assert_cleanup_time({'at':'2023-11-14T22:13:20.123Z'})
            for value in ['2023-11-14T22:00:00Z','2023-11-14T22:13:20.123','invalid',None]:
                with self.subTest(value=value),self.assertRaises(RuntimeError):b.assert_cleanup_time({'at':value})

if __name__=='__main__':unittest.main()
