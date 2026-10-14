"""Actual new functions under controlled local dependencies, not Docker/HTTP/PG tests."""
import ast,base64,copy,hashlib,importlib.util,json,types,unittest
from pathlib import Path
from unittest.mock import patch
P=Path('scripts/factory-truth-gate-matrix-worker-r32-r6.py')
spec=importlib.util.spec_from_file_location('finite_r6_local_definitions',P);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
OLD=Path('scripts/factory-truth-gate-matrix-worker-r32-r5.py');old=OLD.read_text()
A='a'*32;CID='b'*64
image_bytes=Path('artifacts/software-factory/goals-r29/r32-actual-frozen-images-contract-db7c004cafdc5ca3.json').read_bytes()
private=Path('.jarvis-dev/maintenance/r32-matrix-failure-diagnostic-private-1791850312958-479a7ab5-b1e5-4c7d-be4c-675b370ff57c.json').read_bytes()
assert m.digest(private)=='daac071347e531fe57c4edf6d5829eb3b93fc3160bc2c69c79fc6df9c96aa3a7'
source=json.loads(json.loads(private)['stdout']);actual_images={k:json.loads(base64.b64decode(v['stdoutBase64'],validate=True))[0] for k,v in source['images'].items()}

class Memory:
    def __init__(self):self.files={};self.events=[];self.fail_log=False
    def store_bytes(self,p,b):self.files[str(p)]=bytes(b);self.events.append(('store',Path(p).name))
    def store(self,p,v):
        if self.fail_log and Path(p).name.startswith('dependency-failure-'):raise OSError('PRIVATE_WRITE_ERROR')
        self.store_bytes(p,m.compact(v))
    def replace_state(self,p,v):self.files[str(p)]=m.compact(v);self.events.append(('replace',Path(p).name))
    def read_private(self,p,*args,**kwargs):return self.files[str(p)]

def initialize():
    m.B=Memory();m.ACTIVE={'runID':'c'*40,'toolPins':{'execution-contract.json':'f'*64},'workerSHA256':m.digest(P.read_bytes())}
    with patch.object(m.os,'urandom',side_effect=lambda n:bytes([17])*n):m.initialize_env(A)
    m.B.files[str(m.ROOT/A/'control'/'image-contract.json')]=image_bytes
    m.B.files[str(m.ROOT/A/'control'/'artifact-contract.json')]=b'{"root":"/owned/artifact/runtime"}'
    return m.B

def container(role,exit_code=0,running=True):
    app=role=='api-probe';images=json.loads(image_bytes)['images'];n=m.names(A);private_env=m.B.read_private(m.ROOT/A/(role+'.env')).decode().splitlines()
    return {'Name':'/'+n['containers'][role],'Id':CID,'Created':'2026-10-13T00:00:00Z','Image':m.IMAGES['node' if app else role],
     'Config':{'Labels':m.labels(A),'User':'1000:1000' if app else '', 'WorkingDir':m.CONTAINER_WORKING_DIRECTORIES[role],
      'Entrypoint':['/usr/local/bin/node'] if app else images[role]['Config']['Entrypoint'],
      'Cmd':['/tools/supervisor.mjs'] if app else images[role]['Config']['Cmd'] if role=='postgres' else ['redis-server','--save','','--appendonly','no'] if role=='redis' else ['server','/data'],
      'Volumes':None if app else {m.VOLUMES[role+'-data']:{}},'Env':private_env},
     'HostConfig':{'NetworkMode':n['network'],'Privileged':False,'PidMode':'','IpcMode':'private','CapDrop':['ALL'],'CapAdd':None if app else ['CAP_CHOWN','CAP_DAC_OVERRIDE','CAP_FOWNER','CAP_SETGID','CAP_SETUID'],
      'SecurityOpt':['no-new-privileges'],'Init':True,'ReadonlyRootfs':app,'Memory':4*1024**3 if app else 768*1024**2,'NanoCpus':2*10**9 if app else 10**9,'PidsLimit':256 if app else 128,'PortBindings':{},'Devices':[],'DeviceRequests':None,'LogConfig':{'Type':'json-file','Config':{'max-size':'4m','max-file':'2'}},'Tmpfs':{'/tmp':'rw,nosuid,nodev,size=128m'} if app else None},
     'Mounts':[{'Type':'bind','Source':x['source'],'Destination':x['destination'],'RW':not x['readOnly']} for x in m.app_mounts(A)] if app else [{'Type':'volume','Name':n['volumes'][role+'-data'],'Destination':m.VOLUMES[role+'-data'],'RW':True}],
     'State':{'Status':'running' if running else 'exited','Running':running,'ExitCode':exit_code,'OOMKilled':False,'Error':''}}

class Dependencies(unittest.TestCase):
    def test_01_unrelated_functions_and_security_source_are_byte_preserved(self):
        def funcs(s):return {n.name:ast.get_source_segment(s,n) for n in ast.parse(s).body if isinstance(n,ast.FunctionDef)}
        before,after=funcs(old),funcs(P.read_text());changed={k for k in before if before[k]!=after[k]}
        self.assertEqual(changed,{'verify_images','check_container','container_command','run'})
        self.assertEqual(before['reconcile'],after['reconcile']);self.assertEqual(before['bounded_logs'],after['bounded_logs'])
        for f,h in {'factory-truth-gate-probe-r32.mjs':'2a8872244474d159e14a3d6c3dab68f6e66a192d7e49db73558fb651df1d056d','factory-truth-gate-matrix-supervisor-r32-r2.mjs':'25513cbfcd37e3e1b40c52bc3312372fd51e87418d875ab700971311fd535541'}.items():self.assertEqual(m.digest(Path('scripts',f).read_bytes()),h)

    def test_02_actual_old_image_bytes_prove_exact_role_directories_without_entrypoint_cause(self):
        initialize();calls=[]
        def fake(args,deadline=None):calls.append(args);role=next(k for k,v in m.IMAGES.items() if v==args[2]);return types.SimpleNamespace(returncode=0,stdout=json.dumps([actual_images[role]]).encode())
        with patch.object(m,'docker',fake):self.assertEqual(m.verify_images(A),json.loads(image_bytes))
        self.assertEqual(len(calls),4)
        for role in m.IMAGES:self.assertEqual(actual_images[role]['Config']['WorkingDir'],m.IMAGE_WORKING_DIRECTORIES[role])
        contract=json.loads(Path('artifacts/software-factory/goals-r29/r32-dependency-working-directory-local-source-contract.json').read_bytes());self.assertFalse(contract['oldFailureSpecificEntrypointCauseProven'])

    def test_03_image_missing_or_wrong_working_directory_remains_rejected(self):
        initialize()
        for bad in ['/','/data/other',None,False]:
            def fake(args,deadline=None):role=next(k for k,v in m.IMAGES.items() if v==args[2]);v=copy.deepcopy(actual_images[role]);v['Config']['WorkingDir']=bad if role=='redis' else v['Config']['WorkingDir'];return types.SimpleNamespace(returncode=0,stdout=json.dumps([v]).encode())
            with patch.object(m,'docker',fake),self.assertRaisesRegex(RuntimeError,'IMAGE_WORKING_DIRECTORY_CHANGED'):m.verify_images(A)
        def missing(args,deadline=None):v=copy.deepcopy(actual_images['node']);del v['Config']['WorkingDir'];return types.SimpleNamespace(returncode=0,stdout=json.dumps([v]).encode())
        with patch.object(m,'docker',missing),self.assertRaisesRegex(RuntimeError,'IMAGE_WORKING_DIRECTORY_CHANGED'):m.verify_images(A)

    def test_04_creator_and_checker_agree_for_all_four_roles_and_reject_redis_old_root(self):
        initialize()
        for role in m.ROLES:
            args=m.container_command(A,role);self.assertEqual(args[args.index('--workdir')+1],m.CONTAINER_WORKING_DIRECTORIES[role]);m.check_container(A,role,container(role))
        for role in ['postgres','redis','minio']:
            v=container(role);v['Config']['WorkingDir']='/tmp';
            with self.assertRaisesRegex(RuntimeError,'CONTAINER_USER_CHANGED'):m.check_container(A,role,v)
        v=container('redis');v['Config']['WorkingDir']='/'
        with self.assertRaises(RuntimeError):m.check_container(A,'redis',v)

    def test_05_wrong_caps_environment_and_mount_still_fail(self):
        initialize()
        for change in [lambda v:v['HostConfig'].update(CapAdd=['CAP_SYS_ADMIN']),lambda v:v['Config']['Env'].append('NODE_OPTIONS=--require=/outside'),lambda v:v['Mounts'].append({'Type':'bind','Source':'/var/run/docker.sock','Destination':'/sock','RW':True})]:
            v=container('redis');change(v)
            with self.assertRaises(RuntimeError):m.check_container(A,'redis',v)

    def test_06_last_health_is_saved_before_failing_inspection_and_public_does_not_leak_response(self):
        mem=initialize();state={};r=types.SimpleNamespace(returncode=1,stdout=b'PRIVATE_RESPONSE',stderr=b'PRIVATE_ERROR')
        with patch.object(m,'dependency_state',side_effect=RuntimeError('QA_R32_DEPENDENCY_STATE_UNREADABLE')),self.assertRaises(RuntimeError):m.save_dependency_health(A,'redis',CID,['redis-cli','ping'],r,None,state,m.ROOT/A/'state.json',1)
        last=state['dependencyHealth']['redis'];self.assertEqual(last['exitCode'],1);self.assertEqual(last['stdoutSHA256'],m.digest(r.stdout));self.assertEqual(last['containerStateErrorCode'],'QA_R32_DEPENDENCY_STATE_UNREADABLE')
        self.assertNotIn('PRIVATE_RESPONSE',json.dumps(state));self.assertNotIn('PRIVATE_ERROR',json.dumps(state));self.assertEqual(base64.b64decode(json.loads(mem.read_private(m.ROOT/A/'dependency-health-redis.json'))['stdoutBase64']),r.stdout)

    def test_07_live_redis_only_exact_pong_passes(self):
        initialize();v=container('redis');state={}
        with patch.object(m,'inspect',return_value=v),patch.object(m,'docker',return_value=types.SimpleNamespace(returncode=0,stdout=b'PONG\n',stderr=b'')):m.wait_dependency_ready(A,'redis',CID,state,m.ROOT/A/'state.json')
        self.assertEqual(state['dependencyHealth']['redis']['containerState']['running'],True)
        times=iter([0,0,0,0,0,61])
        with patch.object(m.time,'monotonic',side_effect=lambda:next(times)),patch.object(m.time,'sleep'),patch.object(m,'inspect',return_value=v),patch.object(m,'docker',return_value=types.SimpleNamespace(returncode=0,stdout=b'NOT_PONG',stderr=b'')),self.assertRaisesRegex(RuntimeError,'DEPENDENCY_READY_TIMEOUT'):m.wait_dependency_ready(A,'redis',CID,state,m.ROOT/A/'state.json')

    def test_08_dependency_exited_preserves_exact_state_before_closed_failure(self):
        initialize();state={}
        with patch.object(m,'inspect',return_value=container('redis',17,False)),patch.object(m,'docker',return_value=types.SimpleNamespace(returncode=1,stdout=b'',stderr=b'PRIVATE_ERR')),self.assertRaisesRegex(RuntimeError,'DEPENDENCY_EXITED'):m.wait_dependency_ready(A,'redis',CID,state,m.ROOT/A/'state.json')
        self.assertEqual(state['dependencyHealth']['redis']['containerState']['exitCode'],17)

    def test_09_probe_timeout_keeps_partial_response_but_never_passes(self):
        initialize();state={};e=m.subprocess.TimeoutExpired(['docker','exec'],1,output=b'PRIVATE_PARTIAL',stderr=b'PRIVATE_PARTIAL_ERR')
        with patch.object(m,'inspect',return_value=container('redis')),patch.object(m,'docker',side_effect=e),self.assertRaisesRegex(RuntimeError,'DEPENDENCY_PROBE_TIMEOUT'):m.wait_dependency_ready(A,'redis',CID,state,m.ROOT/A/'state.json')
        self.assertEqual(state['dependencyHealth']['redis']['stdoutSHA256'],m.digest(b'PRIVATE_PARTIAL'));self.assertIsNone(state['dependencyHealth']['redis']['exitCode'])

    def integration(self,fail_log=False):
        mem=initialize();mem.fail_log=fail_log;events=[]
        def create(a,role,args):return {'id':CID if role in m.ROLES else role,'role':role}
        def inspect(kind,cid,deadline=None):return container('redis',23,False)
        def check(a,role,value):return {'id':CID}
        def reconcile(a):
            saved=json.loads(mem.read_private(m.ROOT/A/'state.json'));self.assertEqual(saved['errorCode'],'QA_R32_DEPENDENCY_EXITED');self.assertIn('dependencyFailure',saved);events.append('reconcile');return {'resourceClaimsComplete':True,'cleanupIndependentlyVerified':False}
        def fake_docker(args,deadline=None):return types.SimpleNamespace(returncode=0 if args[0]=='start' else 1,stdout=b'',stderr=b'')
        def wait(a,role,cid,state,sp):
            if role=='redis':raise RuntimeError('QA_R32_DEPENDENCY_EXITED')
        logs={'stdout':b'PRIVATE_DEP_LOG','stderr':b'PRIVATE_DEP_ERR','bytes':30,'truncated':False,'timedOut':False,'cliExitCode':0,'captureComplete':True,'readBudgetSec':5,'stopGraceSec':4,'combinedByteBound':262144}
        with patch.object(m,'load'),patch.object(m,'owner',return_value={}),patch.object(m,'preflight'),patch.object(m,'empty_labels'),patch.object(m.os.path,'lexists',return_value=False),patch.object(Path,'mkdir'),patch.object(m.os,'chown',create=True),patch.object(m,'create',create),patch.object(m,'check_resource',check),patch.object(m,'inspect',inspect),patch.object(m,'docker',fake_docker),patch.object(m,'wait_dependency_ready',wait),patch.object(m,'bounded_dependency_logs',return_value=logs),patch.object(m,'reconcile',reconcile):
            mem.files[str(m.ROOT/A/'once.json')]=m.compact({'attempt':A,'workerSHA256':m.ACTIVE['workerSHA256'],'activationSHA256':'d'*64});state=m.run(A)
        self.assertEqual(events,['reconcile']);self.assertEqual(state['status'],'failed');self.assertEqual(state['errorCode'],'QA_R32_DEPENDENCY_EXITED');self.assertEqual(state['dependencyFailure']['role'],'redis');self.assertFalse(state['productCodeExecuted']);self.assertFalse(state['candidateCodeMayHaveExecuted']);self.assertNotIn('PRIVATE_DEP',json.dumps(state));return mem,state

    def test_10_actual_run_saves_diagnostic_before_reconcile_without_entering_product(self):
        mem,state=self.integration();self.assertTrue(state['dependencyFailure']['diagnosticComplete']);self.assertEqual(state['dependencyFailure']['containerState']['exitCode'],23);self.assertIn(str(m.ROOT/A/'dependency-failure-redis.json'),mem.files)

    def test_11_diagnostic_write_failure_never_replaces_primary_error_or_skips_reconcile(self):
        mem,state=self.integration(True);self.assertFalse(state['dependencyFailure']['diagnosticComplete']);self.assertEqual(state['dependencyFailure']['diagnosticErrorCode'],'QA_R32_DEPENDENCY_DIAGNOSTIC_INCOMPLETE')

    def test_12_bounded_actual_log_reader_closes_both_pipes_and_stops_only_its_cli_on_limit(self):
        class Pipe:
            def __init__(self,id):self.id=id;self.closed=False
            def fileno(self):return self.id
            def close(self):self.closed=True
        class Proc:
            def __init__(self):self.stdout=Pipe(10);self.stderr=Pipe(11);self.stopped=False;self.terminated=0
            def poll(self):return 0 if self.stopped else None
            def terminate(self):self.terminated+=1;self.stopped=True
            def kill(self):raise AssertionError('not needed')
            def wait(self,timeout):self.stopped=True;return 0
        class Select:
            def __init__(self):self.items={};self.closed=False
            def register(self,p,e,data):self.items[p.id]=types.SimpleNamespace(fileobj=p,data=data)
            def get_map(self):return self.items
            def select(self,timeout):return [(x,0) for x in self.items.values()]
            def unregister(self,p):del self.items[p.id]
            def close(self):self.closed=True
        p=Proc();s=Select()
        with patch.object(m.subprocess,'Popen',return_value=p),patch.object(m.selectors,'DefaultSelector',return_value=s),patch.object(m.os,'read',side_effect=lambda fd,size:b'x'*size):v=m.bounded_dependency_logs(CID)
        self.assertEqual(v['bytes'],262144);self.assertEqual(len(v['stdout'])+len(v['stderr']),262144);self.assertTrue(v['truncated']);self.assertFalse(v['captureComplete']);self.assertEqual(p.terminated,1);self.assertTrue(p.stdout.closed and p.stderr.closed and s.closed)

if __name__=='__main__':unittest.main()
