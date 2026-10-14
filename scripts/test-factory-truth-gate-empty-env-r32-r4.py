"""Local production writer-to-reader checks. Never outputs Env or uses Docker/SSH/DB."""
import ast,base64,copy,hashlib,importlib.util,json,types,unittest
from pathlib import Path
from unittest.mock import patch

OLD=Path('scripts/factory-truth-gate-matrix-worker-r32-r3.py')
NEW=Path('scripts/factory-truth-gate-matrix-worker-r32-r4.py')
PRIVATE=Path('.jarvis-dev/maintenance/r32-matrix-failure-diagnostic-private-1791850312958-479a7ab5-b1e5-4c7d-be4c-675b370ff57c.json')
PRIVATE_SHA='daac071347e531fe57c4edf6d5829eb3b93fc3160bc2c69c79fc6df9c96aa3a7'
A='b38f16e9d9bb03df2bf7b941724265b6'
RUN='77ec2ae14512cf04be2a38f381d5893b05e29794'

def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod

old=load(OLD,'old_writer_local_definition');new=load(NEW,'new_writer_local_definition')
raw=PRIVATE.read_bytes();assert hashlib.sha256(raw).hexdigest()==PRIVATE_SHA
envelope=json.loads(raw);assert envelope['status']==0
observed=json.loads(envelope['stdout'])
assert observed['attempt']==A and observed['runID']==RUN and observed['twoPrivateReadbacks'] is True
redis_bytes=base64.b64decode(observed['exact']['redis']['stdoutBase64'],validate=True)
assert hashlib.sha256(redis_bytes).hexdigest()=='8edc2f783d14e28a34eb5253903938d2a2103637a2a937bc94bd29683d84ab37'
real_redis=json.loads(redis_bytes)[0]
image_path=Path('artifacts/software-factory/goals-r29/r32-actual-frozen-images-contract-db7c004cafdc5ca3.json')
image_bytes=image_path.read_bytes()
assert hashlib.sha256(image_bytes).hexdigest()=='db7c004cafdc5ca39789be19c7355ce57bc3ef8fc20827a6f756572311fb65d1'

class Bytes:
    def __init__(self):self.files={}
    def store_bytes(self,path,body):self.files[str(path)]=bytes(body)
    def read_private(self,path,*args,**kwargs):return self.files[str(path)]

def initialized(mod):
    mem=Bytes();mod.B=mem;mod.ACTIVE={'runID':RUN,'toolPins':{'execution-contract.json':'f'*64}}
    # Controlled deterministic fixture values, never actual credentials.
    with patch.object(mod.os,'urandom',side_effect=lambda size:bytes([17])*size):mod.initialize_env(A)
    mem.files[str(mod.ROOT/A/'control'/'image-contract.json')]=image_bytes
    mem.files[str(mod.ROOT/A/'control'/'artifact-contract.json')]=b'{"root":"/owned/artifact/runtime"}'
    return mem

def fixture(mod,mem,role):
    app=role=='api-probe';images=json.loads(image_bytes)['images'];n=mod.names(A)
    private=mem.files[str(mod.ROOT/A/(role+'.env'))].decode().splitlines()
    return {'Image':mod.IMAGES['node' if app else role],
     'Config':{'User':'1000:1000' if app else '', 'WorkingDir':'/work/source' if app else '/',
      'Entrypoint':['/usr/local/bin/node'] if app else images[role]['Config']['Entrypoint'],
      'Cmd':['/tools/supervisor.mjs'] if app else images[role]['Config']['Cmd'] if role=='postgres' else ['redis-server','--save','','--appendonly','no'] if role=='redis' else ['server','/data'],
      'Volumes':None if app else {mod.VOLUMES[role+'-data']:{}},'Env':private},
     'HostConfig':{'NetworkMode':n['network'],'Privileged':False,'PidMode':'','IpcMode':'private','CapDrop':['ALL'],
      'CapAdd':None if app else ['CAP_CHOWN','CAP_DAC_OVERRIDE','CAP_FOWNER','CAP_SETGID','CAP_SETUID'],
      'SecurityOpt':['no-new-privileges'],'Init':True,'ReadonlyRootfs':app,
      'Memory':4*1024**3 if app else 768*1024**2,'NanoCpus':2*10**9 if app else 10**9,'PidsLimit':256 if app else 128,
      'PortBindings':{},'Devices':[],'DeviceRequests':None,
      'LogConfig':{'Type':'json-file','Config':{'max-size':'4m','max-file':'2'}},
      'Tmpfs':{'/tmp':'rw,nosuid,nodev,size=128m'} if app else None},
     'Mounts':[{'Type':'bind','Source':x['source'],'Destination':x['destination'],'RW':not x['readOnly']}
      for x in mod.app_mounts(A)] if app else [{'Type':'volume','Name':n['volumes'][role+'-data'],'Destination':mod.VOLUMES[role+'-data'],'RW':True}]}

class EmptyEnvIntegration(unittest.TestCase):
    def test_01_single_expression_inverse_and_all_other_function_asts_unchanged(self):
        delta=json.loads(Path('artifacts/software-factory/goals-r29/r32-matrix-empty-env-local-delta.json').read_bytes())
        text=NEW.read_text();self.assertEqual(text.count(delta['to']),1)
        self.assertEqual(hashlib.sha256(text.replace(delta['to'],delta['from']).encode()).hexdigest(),delta['base']['sha256'])
        funcs=lambda path:{n.name:ast.dump(n,include_attributes=False) for n in ast.parse(path.read_text()).body if isinstance(n,ast.FunctionDef)}
        before,after=funcs(OLD),funcs(NEW);self.assertEqual([k for k in before if before[k]!=after[k]],['initialize_env'])
        self.assertEqual(before['check_container'],after['check_container'])

    def test_02_original_failed_writer_reproduces_value_error_on_actual_redis_readback(self):
        mem=initialized(old);body=mem.files[str(old.ROOT/A/'redis.env')]
        self.assertEqual(body,b'\n')
        self.assertEqual(hashlib.sha256(body).hexdigest(),'01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b')
        with self.assertRaises(ValueError) as caught:old.check_container(A,'redis',real_redis)
        self.assertEqual(hashlib.sha256(str(caught.exception).encode()).hexdigest(),
                         '942c4a4c454537153e6043d6f101a92942f07890aad937c0a9e32f04e677ac55')

    def test_03_new_actual_writer_empty_file_accepts_same_real_redis_config_without_parser_relaxation(self):
        mem=initialized(new);self.assertEqual(mem.files[str(new.ROOT/A/'redis.env')],b'')
        new.check_container(A,'redis',real_redis)

    def test_04_all_nonempty_role_files_preserve_original_exact_bytes_and_one_trailing_newline(self):
        before=initialized(old);after=initialized(new)
        for role in ['postgres','minio','api-probe']:
            key=str(new.ROOT/A/(role+'.env'));self.assertEqual(before.files[key],after.files[key])
            self.assertTrue(after.files[key].endswith(b'\n'));self.assertFalse(after.files[key].endswith(b'\n\n'))
            self.assertTrue(all(line and b'=' in line for line in after.files[key].splitlines()))

    def test_05_actual_production_writer_to_private_reader_matches_all_four_generated_env_files(self):
        mem=initialized(new)
        for role in new.ROLES:new.check_container(A,role,fixture(new,mem,role))
        self.assertEqual(set(Path(x).name for x in mem.files if x.endswith('.env')),
                         {'api-probe.env','postgres.env','redis.env','minio.env'})

    def test_06_old_blank_line_and_malformed_env_remain_strict_failures(self):
        for bad in [b'\n',b'no-equals\n',b'\nKEY=value\n']:
            mem=initialized(new);mem.files[str(new.ROOT/A/'redis.env')]=bad
            with self.assertRaises(ValueError):new.check_container(A,'redis',real_redis)

    def test_07_private_env_mismatch_is_rejected_after_actual_write_on_nonempty_roles(self):
        for role in ['postgres','minio','api-probe']:
            mem=initialized(new);v=fixture(new,mem,role);v['Config']['Env'][0]=v['Config']['Env'][0].split('=',1)[0]+'=changed'
            with self.assertRaisesRegex(RuntimeError,'QA_R32_CONTAINER_ENV_CHANGED'):new.check_container(A,role,v)

    def test_08_real_redis_guard_still_rejects_environment_or_isolation_injection(self):
        for change in [lambda v:v['Config']['Env'].append('NODE_OPTIONS=--require=/outside.js'),
                       lambda v:v['Config']['Env'].append('OPENAI_API_KEY=controlled'),
                       lambda v:v['HostConfig'].update(Privileged=True),
                       lambda v:v['HostConfig'].update(CapAdd=['CAP_SYS_ADMIN']),
                       lambda v:v['Config'].update(WorkingDir='/data')]:
            initialized(new);v=copy.deepcopy(real_redis);change(v)
            with self.assertRaises(RuntimeError):new.check_container(A,'redis',v)

if __name__=='__main__':unittest.main()
