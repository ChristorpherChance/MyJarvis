"""Finite CJS local controller guards; no remote, Docker, package JS or DB."""
import copy,hashlib,importlib.util,json,unittest,ast
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
P=Path(__file__).parent
s=importlib.util.spec_from_file_location('cjs_worker',P/'factory-independent-pg-cjs-worker-r29.py');w=importlib.util.module_from_spec(s);s.loader.exec_module(w)
class Container(unittest.TestCase):
    def setUp(self):
        self.a='a'*32;self.mounts=w.mounts(self.a)
        self.v={'Image':w.IMAGE,'Name':'/'+w.name(self.a),'Config':{'User':'1000:1000','Entrypoint':w.COMMAND[:1],'Cmd':w.COMMAND[1:],'WorkingDir':'/tmp','Volumes':None,'Healthcheck':None,'Labels':w.labels(self.a),'Env':[k+'='+v for k,v in {'CI':'1','HOME':'/tmp','NODE_PATH':'','NODE_OPTIONS':'','PG_FORCE_NATIVE':'','PGHOST':'','PGPORT':'','PGDATABASE':'','PGUSER':'','PGPASSWORD':''}.items()]},'HostConfig':{'NetworkMode':'none','ReadonlyRootfs':True,'Privileged':False,'CapDrop':['ALL'],'CapAdd':None,'SecurityOpt':['no-new-privileges'],'PidsLimit':64,'Memory':512*1024**2,'NanoCpus':10**9,'Init':True,'Devices':[],'DeviceRequests':None,'PortBindings':None,'Tmpfs':{'/tmp':'rw,nosuid,nodev,size=32m'}},'Mounts':[{'Source':r['root'],'Destination':r['destination'],'Type':'bind','RW':False} for r in self.mounts]}
    def test_exact_uid1000_none_and_two_ro_mounts(self):w.assert_container(self.v,self.a,None,self.mounts)
    def test_no_shell_or_host_socket_in_command(self):
        cmd=w.create_command(self.a,None,self.mounts);self.assertEqual(cmd[-4:],['--entrypoint',w.COMMAND[0],w.IMAGE,w.COMMAND[1]]);self.assertNotIn('docker.sock',' '.join(cmd));self.assertNotIn('/work/source',' '.join(cmd))
    def test_other_network(self):
        self.v['HostConfig']['NetworkMode']='host'
        with self.assertRaises(RuntimeError):w.assert_container(self.v,self.a,None,self.mounts)
    def test_root_user(self):
        self.v['Config']['User']='0:0'
        with self.assertRaises(RuntimeError):w.assert_container(self.v,self.a,None,self.mounts)
    def test_extra_mount(self):
        self.v['Mounts'].append({'Source':'/var/run/docker.sock','Destination':'/var/run/docker.sock','Type':'bind','RW':True})
        with self.assertRaises(RuntimeError):w.assert_container(self.v,self.a,None,self.mounts)
    def test_runtime_must_be_readonly(self):
        self.v['Mounts'][0]['RW']=True
        with self.assertRaises(RuntimeError):w.assert_container(self.v,self.a,None,self.mounts)
    def test_foreign_runtime(self):
        self.v['Mounts'][0]['Source']='/candidate/node_modules'
        with self.assertRaises(RuntimeError):w.assert_container(self.v,self.a,None,self.mounts)
    def test_nonempty_node_options(self):
        self.v['Config']['Env'].append('NODE_OPTIONS=--require=/foreign')
        with self.assertRaises(RuntimeError):w.assert_container(self.v,self.a,None,self.mounts)
    def test_production_password_not_inherited(self):
        self.v['Config']['Env']=[x for x in self.v['Config']['Env'] if not x.startswith('PGPASSWORD=')]+['PGPASSWORD=not-exported-test-value']
        with self.assertRaises(RuntimeError):w.assert_container(self.v,self.a,None,self.mounts)
    def test_foreign_label(self):
        self.v['Config']['Labels']['jarvis.qa.pg.cjs.r29.attempt']='b'*32
        with self.assertRaises(RuntimeError):w.assert_container(self.v,self.a,None,self.mounts)
    def test_foreign_image(self):
        self.v['Image']='sha256:'+'a'*64
        with self.assertRaises(RuntimeError):w.assert_container(self.v,self.a,None,self.mounts)
    def test_privileged(self):
        self.v['HostConfig']['Privileged']=True
        with self.assertRaises(RuntimeError):w.assert_container(self.v,self.a,None,self.mounts)
class Lifetime(unittest.TestCase):
    def test_creation_durable_fresh_before_actual_create(self):
        nodes=ast.parse((P/'factory-independent-pg-cjs-worker-r29.py').read_text()).body;f=next(n for n in nodes if isinstance(n,ast.FunctionDef) and n.name=='run');text=ast.unparse(f);self.assertLess(text.index("B.store(private / 'creation-intent.json'"),text.index('B.docker(create_command'));self.assertIn('fresh(',text[text.index("B.store(private / 'creation-intent.json'"):text.index('B.docker(create_command')]);self.assertIn('B.finish_install',text)
    def test_original_lifecycle_library_source_hash_fixed(self):self.assertEqual(hashlib.sha256((P/'factory-build-independent-pg-runtime-r29-r2.py').read_bytes()).hexdigest(),w.LIBRARY_SHA)
    def test_controller_package_js_never_executed_by_root(self):
        text=(P/'factory-independent-pg-cjs-worker-r29.py').read_text();self.assertNotIn('node_modules',text);self.assertIn("'--network','none'",text);self.assertIn("'--user','1000:1000'",text)
    def test_cleanup_only_exact_two_readonly_roots(self):
        a='a'*32;contract={'attempt':a,'mounts':w.mounts(a),'manifestSHA256':w.MANIFEST_SHA};raw=json.dumps(contract).encode();fake=SimpleNamespace(read_private=lambda *x,**kw:raw,CACHE_CONTRACT_PIN=hashlib.sha256(raw).hexdigest())
        with patch.object(w,'B',fake,create=True):self.assertEqual(w.cleanup_mounts(Path('/trusted')/a,{'cacheContractSHA256':fake.CACHE_CONTRACT_PIN},999),w.mounts(a))
    def test_labels_are_new_scope_and_three_resource_kinds(self):
        queries=[];fake=SimpleNamespace(docker=lambda args,**kw:(queries.append(args) or SimpleNamespace(returncode=0,stdout=b'')))
        with patch.object(w,'B',fake,create=True):w.empty_labels('a'*32)
        self.assertEqual(len(queries),6);self.assertTrue(all(any('jarvis.qa.pg.cjs.r29.attempt=' in arg for arg in q) for q in queries))
if __name__=='__main__':unittest.main()
