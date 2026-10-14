"""Local real-controller guards. No Docker/socket/HTTP/SQL/remote operations."""
import ast,copy,importlib.util,json,re,subprocess,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
FILE=Path(__file__).with_name('factory-truth-gate-matrix-worker-r32.py')
spec=importlib.util.spec_from_file_location('r32_controller_under_test',FILE);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
A='a'*32;W='b'*64;AA='c'*64
class MemoryBytes:
    def __init__(self):self.files={};self.events=[]
    def read_private(self,p,*args,**kwargs):return self.files[str(p)]
    def store(self,p,v):self.events.append(('durable-store',Path(p).name));self.files[str(p)]=m.compact(v)
    def store_bytes(self,p,v):self.events.append(('durable-store',Path(p).name));self.files[str(p)]=v
    def replace_state(self,p,v):self.events.append(('durable-replace',Path(p).name));self.files[str(p)]=m.compact(v)
class ControllerGuards(unittest.TestCase):
    def setUp(self):
        self.b=MemoryBytes();m.B=self.b;m.ACTIVE={'workerSHA256':W,'runID':'e'*40,'pins':{},'toolPins':{'execution-contract.json':AA}}
        self.b.files[str(m.ROOT/A/'control'/'activation.json')]=b'{}'
        self.b.files[str(m.ROOT/A/'control'/'protection.json')]=b'{}'
        self.b.files[str(m.ROOT/A/'control'/'artifact-contract.json')]=m.compact({'root':'/var/lib/jarvis-development/101/r32-truth-artifacts/'+'f'*64+'/runtime'})
        self.b.files[str(m.ROOT/A/'control'/'image-contract.json')]=m.compact({'images':{k:{'Config':{'Entrypoint':['entry-'+k],'Cmd':['command-'+k]}} for k in m.IMAGES}})
        for role in m.ROLES:self.b.files[str(m.ROOT/A/(role+'.env'))]=b''
    def fixture(self,role):
        app=role=='api-probe';name=m.names(A)['containers'][role];image=m.IMAGES['node' if app else role]
        return {'Id':'1'*64,'Name':'/'+name,'Image':image,'Created':'2026-10-13T00:00:00Z','State':{'Running':False,'ExitCode':0},'Config':{'User':'1000:1000' if app else '','WorkingDir':'/work/source' if app else '', 'Entrypoint':['/usr/local/bin/node'] if app else ['entry-'+role], 'Cmd':['/tools/supervisor.mjs'] if app else ['command-postgres'] if role=='postgres' else ['redis-server','--save','','--appendonly','no'] if role=='redis' else ['server','/data'],'Volumes':None if app else {m.VOLUMES[role+'-data']:{}},'Labels':m.labels(A),'Env':[]},'HostConfig':{'NetworkMode':m.names(A)['network'],'Privileged':False,'PidMode':'','IpcMode':'private','CapDrop':['ALL'],'CapAdd':None if app else ['CHOWN','DAC_OVERRIDE','FOWNER','SETUID','SETGID'],'SecurityOpt':['no-new-privileges'],'Init':True,'ReadonlyRootfs':app,'Memory':4*1024**3 if app else 768*1024**2,'NanoCpus':2*10**9 if app else 10**9,'PidsLimit':256 if app else 128,'PortBindings':{},'Devices':[],'DeviceRequests':None,'LogConfig':{'Type':'json-file','Config':{'max-size':'4m','max-file':'2'}},'Tmpfs':{'/tmp':'rw,nosuid,nodev,size=128m'} if app else None},'Mounts':[{'Type':'bind','Source':x['source'],'Destination':x['destination'],'RW':not x['readOnly']} for x in m.app_mounts(A)] if app else [{'Type':'volume','Name':m.names(A)['volumes'][role+'-data'],'Destination':m.VOLUMES[role+'-data'],'RW':True}]}
    def test_real_cli_absence_is_exact_name_closed_exit_and_empty_json(self):
        name=m.names(A)['network'];good=SimpleNamespace(returncode=1,stdout=b'[]\n',stderr=('Error response from daemon: network '+name+' not found\n').encode())
        with patch.object(m,'docker',return_value=good):self.assertIsNone(m.inspect('network',name))
        for change in [{'returncode':2},{'stdout':b'not-json'},{'stderr':b'Error response from daemon: network other not found'}]:
            bad=SimpleNamespace(**{**vars(good),**change})
            with patch.object(m,'docker',return_value=bad):
                with self.assertRaisesRegex(RuntimeError,'INSPECTION_UNKNOWN'):m.inspect('network',name)
    def test_exact_eight_names_and_two_label_scopes(self):
        n=m.names(A);values=[*n['containers'].values(),n['network'],*n['volumes'].values()];self.assertEqual(len(set(values)),8);self.assertTrue(all(x.startswith(m.prefix(A)+'-') for x in values));self.assertEqual(m.labels(A)['jarvis.truthgate.r32.kind'],'http-sql-validation')
    def test_invalid_attempts_rejected(self):
        for a in [None,'','a'*31,'A'*32,'../source']:
            with self.assertRaisesRegex(RuntimeError,'ATTEMPT_INVALID'):m.prefix(a)
    def test_all_four_actual_config_shapes_accepted(self):
        for role in m.ROLES:self.assertEqual(m.check_resource(A,role,self.fixture(role))['id'],'1'*64)
    def test_uid_root_product_and_host_port_rejected(self):
        for edit in [lambda v:v['Config'].update(User='0'),lambda v:v['HostConfig'].update(PortBindings={'18932/tcp':[{'HostPort':'18932'}]})]:
            v=self.fixture('api-probe');edit(v)
            with self.assertRaises(RuntimeError):m.check_container(A,'api-probe',v)
    def test_extra_host_socket_mount_rejected(self):
        v=self.fixture('api-probe');v['Mounts'].append({'Type':'bind','Source':'/var/run/docker.sock','Destination':'/var/run/docker.sock','RW':True})
        with self.assertRaisesRegex(RuntimeError,'EXTRA_MOUNT'):m.check_container(A,'api-probe',v)
    def test_runtime_or_artifact_writable_rejected(self):
        for index in [0,2]:
            v=self.fixture('api-probe');v['Mounts'][index]['RW']=True
            with self.assertRaisesRegex(RuntimeError,'MOUNT_CHANGED'):m.check_container(A,'api-probe',v)
    def test_anonymous_image_volume_rejected(self):
        v=self.fixture('redis');v['Config']['Volumes']['/anonymous']={}
        with self.assertRaisesRegex(RuntimeError,'ANONYMOUS_VOLUME'):m.check_container(A,'redis',v)
    def test_missing_config_or_mounts_fails_closed(self):
        for field in ['Config','HostConfig','Mounts']:
            v=self.fixture('api-probe');v.pop(field)
            with self.assertRaises(RuntimeError):m.check_container(A,'api-probe',v)
    def test_supplier_credentials_and_unsafe_options_rejected(self):
        for env in [['OPENAI_API_KEY=not-real'],['NODE_OPTIONS=--require=/outside.js']]:
            v=self.fixture('api-probe');v['Config']['Env']=env
            with self.assertRaises(RuntimeError):m.check_container(A,'api-probe',v)
    def test_network_noninternal_and_volume_options_rejected(self):
        v={'Id':'2'*64,'Name':m.names(A)['network'],'Labels':m.labels(A),'Internal':False,'Driver':'bridge','Attachable':False,'Ingress':False}
        with self.assertRaisesRegex(RuntimeError,'NETWORK_CHANGED'):m.check_resource(A,'network',v)
        v={'Name':m.names(A)['volumes']['postgres-data'],'Labels':m.labels(A),'Driver':'local','Options':{'device':'/production'}}
        with self.assertRaisesRegex(RuntimeError,'VOLUME_DRIVER'):m.check_resource(A,'postgres-data',v)
    def test_intent_is_durable_before_create_and_created_id_is_saved(self):
        v=self.fixture('api-probe');calls=iter([None,v]);events=self.b.events
        def docker(args):events.append(('docker-mutation',args[0]));return SimpleNamespace(returncode=0,stdout=('1'*64+'\n').encode())
        with patch.object(m,'inspect',side_effect=lambda *args:next(calls)),patch.object(m,'docker',side_effect=docker),patch.object(m,'fresh'):
            r=m.create(A,'api-probe',['create']);self.assertEqual(r['id'],'1'*64)
        self.assertEqual(events,[('durable-store','api-probe.intent.json'),('docker-mutation','create'),('durable-store','api-probe.created.json')])
    def test_create_ambiguous_keeps_intent_and_never_fabricates_cid(self):
        with patch.object(m,'inspect',return_value=None),patch.object(m,'docker',return_value=SimpleNamespace(returncode=1,stdout=b'')),patch.object(m,'fresh'):
            with self.assertRaisesRegex(RuntimeError,'AMBIGUOUS_USE_CHECK'):m.create(A,'api-probe',['create'])
        self.assertIn(str(m.ROOT/A/'registry'/'api-probe.intent.json'),self.b.files);self.assertNotIn(str(m.ROOT/A/'registry'/'api-probe.created.json'),self.b.files)
    def test_pending_unknown_cid_never_cleanup_green(self):
        own={'resources':m.names(A),'labels':m.labels(A),'workerSHA256':W,'emptyResourceScopeVerified':True};self.b.files[str(m.ROOT/A/'ownership.json')]=m.compact(own)
        with patch.object(m,'load'),patch.object(m,'inspect',return_value=None),patch.object(m,'empty_labels'),patch.object(m.os.path,'lexists',side_effect=lambda p:Path(p).name=='api-probe.intent.json'):
            v=m.reconcile(A)
        self.assertFalse(v['resourceClaimsComplete']);self.assertEqual(v['errors'],[{'role':'api-probe','code':'QA_R32_PENDING_CREATE_ID_UNKNOWN'}]);self.assertFalse(v['cleanupIndependentlyVerified'])
    def test_state_save_failure_cannot_skip_exact_reconcile(self):
        self.b.files[str(m.ROOT/A/'once.json')]=m.compact({'attempt':A,'workerSHA256':W,'activationSHA256':AA});calls=[]
        def replace(*args):raise RuntimeError('save-failed')
        self.b.replace_state=replace
        with patch.object(m,'load'),patch.object(m.os.path,'lexists',return_value=False),patch.object(m,'owner',return_value={'unit':'test'}),patch.object(m,'preflight',side_effect=RuntimeError('QA_R32_TEST_SETUP_STOP')),patch.object(m,'reconcile',side_effect=lambda a:calls.append(a) or {'resourceClaimsComplete':False}):
            with self.assertRaisesRegex(RuntimeError,'save-failed'):m.run(A)
        self.assertEqual(calls,[A])
    def test_cleanup_global_deadline_is_single90_without_artifact_cache_hash(self):
        raw=FILE.read_text(encoding='utf-8');node=next(x for x in ast.parse(raw).body if isinstance(x,ast.FunctionDef) and x.name=='reconcile');s=ast.get_source_segment(raw,node)
        self.assertIn('time.monotonic()+90',s);self.assertNotIn('verify_artifact(',s);self.assertNotIn('verify_images(',s);self.assertNotIn('artifact_tree(',s)
    def test_relative_symlinks_stay_inside_complete_artifact(self):
        self.assertEqual(m.link_target('source/node_modules/a','../.pnpm/a'),'source/.pnpm/a')
        for path,target in [('source/a','../../outside'),('a','../outside'),('source/a','/outside'),('source/a','inside'+chr(92)+'file'),('source/a','inside'+chr(0)+'file')]:
            with self.assertRaises(RuntimeError):m.link_target(path,target)
    def test_all_root_package_execution_is_docker_node_uid1000(self):
        c=m.container_command(A,'api-probe');self.assertEqual(c[c.index('--user')+1],'1000:1000');self.assertIn('--read-only',c);self.assertNotIn('/var/run/docker.sock',' '.join(c));self.assertEqual(c[-2:], [m.IMAGES['node'],'/tools/supervisor.mjs']);self.assertEqual(c.count('--mount'),4)
    def test_worker_default_inspect_performs_zero_subprocess(self):
        with patch.object(m.sys,'argv',['worker','--inspect']),patch.object(m.subprocess,'run',side_effect=AssertionError('IO forbidden')):m.main()
    def test_actual_pass_condition_rejects_missing_or_nonzero_wait_reply_even_with_cli0(self):
        module=ast.parse(FILE.read_text(encoding='utf-8'));run=next(x for x in module.body if isinstance(x,ast.FunctionDef) and x.name=='run');expr=next(x.value.test for x in ast.walk(run) if isinstance(x,ast.Assign) and isinstance(x.value,ast.IfExp) and any(isinstance(t,ast.Subscript) and isinstance(t.slice,ast.Constant) and t.slice.value=='status' for t in x.targets));code=compile(ast.Expression(expr),str(FILE),'eval')
        for reply,expected in [(0,True),(None,False),(1,False)]:self.assertEqual(bool(eval(code,{'state':{'containerStopped':True,'containerExitCode':0},'wait':{'cliExitCode':0,'replyExitCode':reply,'timedOut':False}})),expected)
    def test_daemon_log_rotation_is_fixed_not_just_reader_cap(self):
        v=self.fixture('api-probe');v['HostConfig']['LogConfig']['Config']['max-size']='100g'
        with self.assertRaisesRegex(RuntimeError,'LOG_BOUND_CHANGED'):m.check_container(A,'api-probe',v)
    def test_maybe_execution_is_durable_before_api_start_even_when_postread_unknown(self):
        raw=FILE.read_text(encoding='utf-8');node=next(x for x in ast.parse(raw).body if isinstance(x,ast.FunctionDef) and x.name=='run');s=ast.get_source_segment(raw,node);mark=s.index("state['candidateCodeMayHaveExecuted']=True");unknown=s.index("state['productCodeExecuted']=None",mark);saved=s.index('B.replace_state(sp,state)',unknown);start=s.index("r=docker(['start',cid])",saved);self.assertLess(mark,unknown);self.assertLess(unknown,saved);self.assertLess(saved,start);self.assertNotIn("state['productCodeExecuted']=True",s)
    def test_generated_private_env_matches_actual_auth_and_owned_temp_paths(self):
        m.initialize_env(A);env=dict(x.split('=',1) for x in self.b.files[str(m.ROOT/A/'api-probe.env')].decode().splitlines());self.assertIn('MSF_AUTH_PASS',env);self.assertNotIn('MSF_AUTH_PASSWORD',env);self.assertEqual(env['MSF_AUTH_PASS'],env['JARVIS_VALIDATION_PASSWORD']);self.assertEqual(env['HOME'],'/tmp/r32-qa/home');self.assertEqual(env['TMPDIR'],'/tmp/r32-qa/tmp');self.assertEqual(env['MSF_AI_PROVIDER'],'mock');self.assertEqual(env['NODE_OPTIONS'],'');self.assertFalse(any(re.search('API_KEY|TOKEN|ANTHROPIC|OPENAI',k) for k in env));auth=Path('.jarvis-dev/workspaces/msf-targets-r32/source/apps/server/src/modules/platform/auth.ts').read_text(encoding='utf-8');self.assertIn('MSF_AUTH_PASS',auth)
if __name__=='__main__':unittest.main()
