"""Targeted local lifecycle regressions. No Docker, PG, filesystem journal or remote."""
import ast, copy, hashlib, importlib.util, json, time, unittest
from contextlib import ExitStack
from pathlib import Path, PurePosixPath
from types import SimpleNamespace
from unittest.mock import patch

HERE=Path(__file__).parent
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
b=load('pg_lifecycle_current',HERE/'factory-build-independent-pg-runtime-r29.py')
fixtures=load('pg_previous_local_fixtures',HERE/'test-factory-independent-pg-build-r29.py')

class OwnershipTests(unittest.TestCase):
    def setUp(self):
        f=fixtures.ContainerTests();f.setUp();self.a=f.attempt;self.v=copy.deepcopy(f.v);self.v['Id']='d'*64;self.caches=f.caches;self.worker='e'*64;self.pin='f'*64
        self.created={'schemaVersion':1,'kind':'r29-pg-container-create-intent','attempt':self.a,'containerName':b.container_name(self.a),'workerSHA256':self.worker,'imageID':b.IMAGE,'cacheContractSHA256':self.pin,'caches':self.caches,'emptyResourceScopeVerified':True,'createdAt':'2026-10-12T00:00:00Z'}
        self.state={'attempt':self.a,'workerSHA256':self.worker,'imageID':b.IMAGE,'containerID':None}
        self.stack=ExitStack();self.stack.enter_context(patch.object(b,'self_source',return_value=self.worker));self.stack.enter_context(patch.object(b,'CACHE_CONTRACT_PIN',self.pin))
    def tearDown(self):self.stack.close()
    def test_creation_committed_before_id_receipt_can_be_qualified(self):self.assertEqual(b.qualify_cleanup_container(self.v,self.a,self.created,self.state,self.caches),'d'*64)
    def test_creation_intent_independent_of_missing_state_file(self):self.assertEqual(b.qualify_cleanup_container(self.v,self.a,self.created,None,self.caches),'d'*64)
    def test_foreign_image_not_qualified(self):
        self.v['Image']='sha256:'+'a'*64
        with self.assertRaisesRegex(RuntimeError,'IDENTITY_CHANGED'):b.qualify_cleanup_container(self.v,self.a,self.created,self.state,self.caches)
    def test_foreign_container_label_not_qualified(self):
        self.v['Config']['Labels']['jarvis.qa.pg.r29.attempt']='b'*32
        with self.assertRaisesRegex(RuntimeError,'CONFIG_CHANGED'):b.qualify_cleanup_container(self.v,self.a,self.created,self.state,self.caches)
    def test_recorded_id_mismatch_not_recovered_via_intent(self):
        self.state['containerID']='a'*64
        with self.assertRaisesRegex(RuntimeError,'RESOURCE_ID_CHANGED'):b.qualify_cleanup_container(self.v,self.a,self.created,self.state,self.caches)
    def test_unverified_empty_scope_not_qualified(self):
        self.created['emptyResourceScopeVerified']=False
        with self.assertRaisesRegex(RuntimeError,'CREATION_INTENT_CHANGED'):b.qualify_cleanup_container(self.v,self.a,self.created,self.state,self.caches)
    def test_intent_different_name_not_qualified(self):
        self.created['containerName']='foreign'
        with self.assertRaisesRegex(RuntimeError,'CREATION_INTENT_CHANGED'):b.qualify_cleanup_container(self.v,self.a,self.created,self.state,self.caches)
    def test_real_reconcile_uses_exact_inspected_id_with_lost_receipt(self):
        once={'attempt':self.a,'workerSHA256':self.worker,'imageID':b.IMAGE};values={'once.json':once,'state.json':self.state,'creation-intent.json':self.created};removed=[];labels=[]
        with ExitStack() as s:
            s.enter_context(patch.object(b.os,'geteuid',return_value=0,create=True));s.enter_context(patch.object(b,'root_directory'));s.enter_context(patch.object(b.os.path,'lexists',return_value=True))
            s.enter_context(patch.object(b,'read_private',side_effect=lambda p,**kw:json.dumps(values[p.name]).encode()));s.enter_context(patch.object(b,'container',side_effect=[self.v,None]));s.enter_context(patch.object(b,'cleanup_cache_bindings',return_value=self.caches))
            s.enter_context(patch.object(b,'docker',side_effect=lambda args,**kw:(removed.append(args) or SimpleNamespace(returncode=0))));s.enter_context(patch.object(b,'empty_labels',side_effect=lambda a,**kw:labels.append(a)))
            result=b.reconcile_cleanup(self.a)
        self.assertEqual(removed,[['rm','-f','d'*64]]);self.assertEqual(labels,[self.a]);self.assertTrue(result['exactOwnedContainerAbsent']);self.assertFalse(result['cleanupIndependentlyVerified'])

class PersistenceTests(unittest.TestCase):
    def test_first_state_write_failure_still_executes_cleanup(self):
        result={'status':'installed'};saved=[]
        def writing(_,v):
            if not saved:saved.append(None);raise RuntimeError('disk')
            saved.append(copy.deepcopy(v))
        with patch.object(b,'replace_state',side_effect=writing) as writes,patch.object(b,'reconcile_cleanup',return_value={'exactOwnedContainerAbsent':True,'labelsEmpty':True}) as cleanup:
            b.finish_install('a'*32,Path('/not-opened/state.json'),result)
        self.assertEqual(writes.call_count,2);cleanup.assert_called_once();self.assertEqual(result['status'],'failed');self.assertTrue(result['statePersistenceFailed']);self.assertTrue(result['cleanupClaimsComplete'])
        self.assertTrue(saved[1]['statePersistenceFailed'])
    def test_all_state_writes_fail_but_cleanup_still_executes(self):
        result={'status':'installed'}
        with patch.object(b,'replace_state',side_effect=OSError('not exported')),patch.object(b,'reconcile_cleanup',return_value={'exactOwnedContainerAbsent':True,'labelsEmpty':True}) as cleanup:
            b.finish_install('a'*32,Path('/not-opened/state.json'),result)
        cleanup.assert_called_once();self.assertEqual(result['status'],'failed');self.assertEqual(result['finalizationErrors'],['QA_PG_STATE_PERSISTENCE_FAILED'])
    def test_cleanup_error_retained_even_when_state_writes_succeed(self):
        result={'status':'installed'}
        with patch.object(b,'replace_state'),patch.object(b,'reconcile_cleanup',side_effect=RuntimeError('QA_PG_RESOURCE_SCOPE_NOT_EMPTY')):
            b.finish_install('a'*32,Path('/not-opened/state.json'),result)
        self.assertEqual(result['status'],'failed');self.assertFalse(result['cleanupClaimsComplete']);self.assertIn('QA_PG_RESOURCE_SCOPE_NOT_EMPTY',result['finalizationErrors'])

class BudgetAndImageTests(unittest.TestCase):
    def test_cleanup_does_not_rehash_cache_file_closure(self):
        tree=ast.parse((HERE/'factory-build-independent-pg-runtime-r29.py').read_text());functions={x.name:x for x in tree.body if isinstance(x,ast.FunctionDef)}
        for name in ['reconcile_cleanup','cleanup_cache_bindings']:
            calls=[x.func.id for x in ast.walk(functions[name]) if isinstance(x,ast.Call) and isinstance(x.func,ast.Name)]
            self.assertNotIn('cache_closure',calls);self.assertNotIn('verify_cache_reuse',calls)
        self.assertIn('deadline',ast.unparse(functions['reconcile_cleanup']))
    def test_real_cleanup_binding_reads_only_pinned_manifest_bytes(self):
        producer='a'*32;rows=[];values={}
        for name in b.CACHE_NAMES:
            root='/var/lib/jarvis-development/101/truth-gate-r29-build/'+producer+'/caches/'+name;v=fixtures.cache();v['root']=root;raw=json.dumps(v).encode();path='/var/lib/jarvis-development/101/truth-gate-r29-build/'+producer+'/cache-manifests/'+name+'.json';rows.append({'name':name,'root':root,'manifestPath':path,'manifestSHA256':hashlib.sha256(raw).hexdigest()});values[name+'.json']=raw
        raw=json.dumps({'schemaVersion':1,'kind':'r29-pg-root-cache-reuse','producerAttempt':producer,'caches':rows}).encode();pin=hashlib.sha256(raw).hexdigest();values['cache-contract.json']=raw;reads=[]
        with ExitStack() as s:
            s.enter_context(patch.object(b,'CACHE_CONTRACT_PIN',pin));s.enter_context(patch.object(b,'Path',PurePosixPath));s.enter_context(patch.object(b,'read_private',side_effect=lambda p,**kw:(reads.append(p.name) or values[p.name])));s.enter_context(patch.object(b,'cache_closure',side_effect=AssertionError('full cache bytes forbidden in cleanup')));s.enter_context(patch.object(b,'verify_cache_reuse',side_effect=AssertionError('full cache double read forbidden in cleanup')))
            actual=b.cleanup_cache_bindings(PurePosixPath('/not-opened'),{'cacheContractSHA256':pin},999999999.0)
        self.assertEqual(actual,rows);self.assertEqual(reads,['cache-contract.json','corepack-runtime.json','corepack-cache.json','pnpm-store.json'])
    def test_existing_exact_image_empty_volumes_accepted(self):
        b.assert_image([{'Id':b.IMAGE,'Os':'linux','Architecture':'amd64','Config':{'Volumes':None}}]);b.assert_image([{'Id':b.IMAGE,'Os':'linux','Architecture':'amd64','Config':{'Volumes':{}}}])
    def test_missing_config_is_unknown_not_empty(self):
        with self.assertRaisesRegex(RuntimeError,'IMAGE_CHANGED'):b.assert_image([{'Id':b.IMAGE,'Os':'linux','Architecture':'amd64'}])
    def test_missing_volumes_field_is_unknown_not_empty(self):
        with self.assertRaisesRegex(RuntimeError,'IMAGE_CHANGED'):b.assert_image([{'Id':b.IMAGE,'Os':'linux','Architecture':'amd64','Config':{}}])
    def test_nonempty_or_wrong_type_volumes_refused(self):
        for v in [{'/unlisted':{}},False,[],0]:
            with self.subTest(value=v),self.assertRaisesRegex(RuntimeError,'IMAGE_CHANGED'):b.assert_image([{'Id':b.IMAGE,'Os':'linux','Architecture':'amd64','Config':{'Volumes':v}}])

class FreshnessTests(unittest.TestCase):
    def test_protection_rechecked_after_costly_cache_reads(self):
        now=[1700000000.0];p={'kind':'r29-pg-build-new-protection-contract','independent':True,'protectedInventoryFullyVerified':True,'fullQueueVerified':True,'templatesVerified':True,'candidateFingerprint':'4907e45a21799f2dd14ac2373769607f40d6b9e0319bb614fbe259b157e60493','candidateFiles':621,'productAccepted':False,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(now[0]))};raw=json.dumps(p).encode();values={'r29-qa-pg-build-review.json':b'{}','r29-qa-pg-cache-contract.json':b'{}','factory-freeze-independent-pg-runtime-r29.py':b'# not executed','r29-qa-pg-protection-proof.json':raw}
        def cache_cost(_):now[0]+=301;return []
        with ExitStack() as s:
            for key,value in [('REVIEW_PIN',values['r29-qa-pg-build-review.json']),('CACHE_CONTRACT_PIN',values['r29-qa-pg-cache-contract.json']),('FREEZER_PIN',values['factory-freeze-independent-pg-runtime-r29.py']),('PROTECTION_PIN',raw)]:s.enter_context(patch.object(b,key,hashlib.sha256(value).hexdigest()))
            s.enter_context(patch.object(b.os,'geteuid',return_value=0,create=True));s.enter_context(patch.object(b,'read_private',side_effect=lambda path:values[path.name]));s.enter_context(patch.object(b.time,'time',side_effect=lambda:now[0]));s.enter_context(patch.object(b,'verify_cache_reuse',side_effect=cache_cost))
            with self.assertRaisesRegex(RuntimeError,'PROTECTION_STALE'):b.preflight()
    def test_creation_and_launcher_fresh_checks_are_before_external_mutation(self):
        tree=ast.parse((HERE/'factory-build-independent-pg-runtime-r29.py').read_text());functions={x.name:ast.unparse(x) for x in tree.body if isinstance(x,ast.FunctionDef)}
        run=functions['run_install'];self.assertLess(run.index("store(private / 'creation-intent.json'"),run.index('docker(create_command'));between=run[run.index("store(private / 'creation-intent.json'"):run.index('docker(create_command')];self.assertIn('assert_protection_fresh()',between)
        launch=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='launch');external=next(i for i,x in enumerate(launch.body) if isinstance(x,ast.Assign) and isinstance(x.value,ast.Call) and isinstance(x.value.func,ast.Attribute) and x.value.func.attr=='run');before=launch.body[external-1];self.assertIsInstance(before,ast.Expr);self.assertEqual(before.value.func.id,'assert_protection_fresh')
    def test_all_default_real_pins_still_null(self):
        self.assertTrue(all(getattr(b,k) is None for k in ['REVIEW_PIN','CACHE_CONTRACT_PIN','PROTECTION_PIN','FREEZER_PIN','CLEANUP_PIN']));self.assertFalse(b.inspect_preparation()['ready'])

if __name__=='__main__':unittest.main(verbosity=1)
