"""Independent offline probes of exact production AST; never calls Docker/products."""
import ast
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import subprocess
import tempfile
import time
from types import SimpleNamespace
import unittest

SCRIPT = Path(__file__).with_name('factory-truth-gate-build-r29.py')
RAW = SCRIPT.read_bytes()
SHA = hashlib.sha256(RAW).hexdigest()
TREE = ast.parse(RAW, str(SCRIPT))
MAIN = next(n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name == 'main')


def exact_function(name, namespace, nested=False):
    nodes = list(ast.walk(MAIN)) if nested else TREE.body
    node = next(n for n in nodes if isinstance(n, ast.FunctionDef) and n.name == name)
    module = ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[]))
    exec(compile(module, str(SCRIPT), 'exec'), namespace)
    return namespace[name]


def exact_statement(node, namespace):
    exec(compile(ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[])), str(SCRIPT), 'exec'), namespace)


def need(value, code):
    if not value:
        raise RuntimeError(code)


class ProductionGuard(unittest.TestCase):
    def setUp(self):
        self.labels = {'jarvis.truthgate.r29.attempt': 'a'*32, 'jarvis.truthgate.r29.kind': 'build'}
        self.mounts = [{'source': '/user-owned/original', 'fdSource': '/proc/123/fd/7', 'destination': '/work', 'rw': True, 'device': 1, 'inode': 2}]
        self.fixture = {'Config': {'Labels': {**self.labels, 'jarvis.truthgate.r29.stage': 'build'}, 'User': '1000:1000'}, 'Image': 'sha256:approved', 'Mounts': [{'Type': 'bind', 'RW': True, 'Source': '/proc/123/fd/7', 'Destination': '/work'}], 'HostConfig': {'NetworkMode': 'none', 'Init': True, 'ReadonlyRootfs': True, 'Privileged': False, 'PidMode': '', 'IpcMode': 'private', 'CapDrop': ['ALL'], 'CapAdd': None, 'SecurityOpt': ['no-new-privileges'], 'Memory': 8589934592, 'NanoCpus': 3000000000, 'PidsLimit': 512, 'Tmpfs': {'/tmp': 'rw,nosuid,nodev,size=512m'}}}
        self.ns = {'need': need, 'labels': self.labels, 'mounts': self.mounts, 'IMAGE': 'sha256:approved', 'os': SimpleNamespace(stat=lambda _: SimpleNamespace(st_dev=1, st_ino=2))}
        self.guard = exact_function('assert_container', self.ns, nested=True)

    def test_exact_positive(self):
        self.assertIs(self.guard(self.fixture, 'build'), self.fixture)

    def test_host_flags_negative(self):
        for field, bad in [('NetworkMode', 'host'), ('Init', False), ('ReadonlyRootfs', False), ('Privileged', True), ('PidMode', 'host'), ('IpcMode', 'host'), ('CapDrop', []), ('CapAdd', ['KILL']), ('SecurityOpt', []), ('Memory', 0), ('NanoCpus', 0), ('PidsLimit', 0), ('Tmpfs', {})]:
            with self.subTest(field=field):
                f = copy.deepcopy(self.fixture); f['HostConfig'][field] = bad
                with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_SANDBOX_FLAGS_CHANGED$'):
                    self.guard(f, 'build')

    def test_mount_original_alias_and_extra_refused(self):
        for action in ('original', 'extra', 'wrong-rw', 'wrong-type'):
            with self.subTest(action=action):
                f = copy.deepcopy(self.fixture)
                if action == 'original': f['Mounts'][0]['Source'] = '/user-owned/original'
                elif action == 'extra': f['Mounts'].append({'Source': '/var/run/docker.sock', 'Destination': '/sock', 'RW': True, 'Type': 'bind'})
                elif action == 'wrong-rw': f['Mounts'][0]['RW'] = False
                else: f['Mounts'][0]['Type'] = 'volume'
                with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_MOUNTS_CHANGED$'):
                    self.guard(f, 'build')

    def test_fd_changed_refused(self):
        self.ns['os'] = SimpleNamespace(stat=lambda _: SimpleNamespace(st_dev=1, st_ino=3))
        with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_MOUNT_IDENTITY_CHANGED$'):
            self.guard(self.fixture, 'build')

    def test_scope_refused(self):
        for action in ('image', 'uid', 'label', 'stage'):
            f = copy.deepcopy(self.fixture)
            if action == 'image': f['Image'] = 'sha256:other'
            elif action == 'uid': f['Config']['User'] = '0:0'
            elif action == 'label': f['Config']['Labels']['jarvis.truthgate.r29.attempt'] = 'b'*32
            else: f['Config']['Labels']['jarvis.truthgate.r29.stage'] = 'other'
            with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_CREATED_SCOPE_CHANGED$'):
                self.guard(f, 'build')

    def test_actual_image_volume_statement(self):
        node = next(n for n in ast.walk(MAIN) if isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and any(isinstance(a, ast.Constant) and a.value == 'R29_BUILD_IMAGE_CHANGED_OR_VOLUMES_UNLISTED' for a in n.value.args))
        for config, passes in [({}, True), ({'Volumes': None}, True), ({'Volumes': {}}, True), ({'Volumes': {'/data': {}}}, False), (None, False)]:
            ns = {'need': need, 'IMAGE': 'sha256:approved', 'image': [{'Id': 'sha256:approved', 'Os': 'linux', 'Architecture': 'amd64', 'Config': config}]}
            if passes: exact_statement(node, ns)
            else:
                with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_IMAGE_CHANGED_OR_VOLUMES_UNLISTED$'): exact_statement(node, ns)


class ProductionEvidence(unittest.TestCase):
    def test_tap_denominator(self):
        node = next(n for n in ast.walk(MAIN) if isinstance(n, ast.If) and ast.unparse(n.test) == "name == 'truth-unit'")
        base = {'tests': 16, 'pass': 16, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}
        for changes, expected in [({}, True), ({'tests': 15, 'pass': 15}, False), ({'tests': 0, 'pass': 0}, False), ({'skipped': 1, 'pass': 15}, False), ({'fail': 1, 'pass': 15}, False)]:
            values = {**base, **changes}
            ns = {'name': 'truth-unit', 'log': ('\n'.join(f'# {k} {v}' for k,v in values.items())+'\n').encode(), 're': re, 'need': need, 'ok': True}
            exact_statement(node, ns); self.assertEqual(ns['ok'], expected)
        for raw in (b'', b'# tests 16\n# tests 16\n'):
            with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_TEST_DENOMINATOR_INVALID$'):
                exact_statement(node, {'name': 'truth-unit', 'log': raw, 're': re, 'need': need, 'ok': True})

    def test_source_or_cleanup_failure_is_not_pass(self):
        node = next(n for n in ast.walk(MAIN) if isinstance(n, ast.If) and ast.unparse(n.test) == "not r['sourceUnchanged'] or not r['cleanupClaimsComplete']")
        for source, cleanup in [(True, True), (False, True), (True, False), (False, False)]:
            result = {'status': 'pass', 'sourceUnchanged': source, 'cleanupClaimsComplete': cleanup}
            exact_statement(node, {'r': result}); self.assertEqual(result['status'], 'pass' if source and cleanup else 'fail')


class FakeProcess:
    def __init__(self): self.stdout = SimpleNamespace(close=lambda: None); self.returncode = None; self.terminated = 0; self.killed = 0
    def poll(self): return self.returncode
    def terminate(self): self.terminated += 1
    def kill(self): self.killed += 1
    def wait(self, timeout): self.returncode = -15 if self.terminated else 0; return self.returncode


class FakeSelector:
    def __init__(self): self.map = {}
    def register(self, value, event): self.map[1] = SimpleNamespace(fd=777, fileobj=value)
    def get_map(self): return self.map
    def select(self, timeout): return [(value, 1) for value in self.map.values()]
    def unregister(self, value): self.map.clear()
    def close(self): self.map.clear()


class ProductionStream(unittest.TestCase):
    def probe(self, mode):
        proc = FakeProcess(); count = {'reads': 0, 'written': 0}; argv = []
        def popen(args, **kwargs): argv.append(args); return proc
        def read(fd, size):
            self.assertEqual(fd, 777); self.assertEqual(size, 65536); count['reads'] += 1
            return b'x'*65536 if mode == 'limit' or count['reads'] <= 2 else b''
        def write(fd, value):
            if mode == 'iofailure': return 0
            count['written'] += len(value); return len(value)
        clock = iter([0, 2] if mode == 'timeout' else [0]*10000)
        os_adapter = SimpleNamespace(open=os.open, O_WRONLY=os.O_WRONLY, O_CREAT=os.O_CREAT, O_EXCL=os.O_EXCL, O_NOFOLLOW=getattr(os,'O_NOFOLLOW',0), read=read, write=write, fsync=os.fsync, close=os.close)
        subprocess_adapter = SimpleNamespace(Popen=popen, PIPE=subprocess.PIPE, STDOUT=subprocess.STDOUT, TimeoutExpired=subprocess.TimeoutExpired)
        ns = {'os': os_adapter, 'subprocess': subprocess_adapter, 'selectors': SimpleNamespace(DefaultSelector=FakeSelector, EVENT_READ=1), 'hashlib': hashlib, 'time': SimpleNamespace(monotonic=lambda: next(clock)), 'need': need}
        fn = exact_function('stream_start', ns)
        with tempfile.TemporaryDirectory(prefix='jarvis-r29-build-review-') as folder:
            target = str(Path(folder)/'bounded.log')
            if mode == 'iofailure':
                with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_LOG_SHORT_WRITE$'): fn('a'*64, target, 1)
                result = None
            else: result = fn('a'*64, target, 1)
        self.assertEqual(argv, [['/usr/bin/docker','start','-a','a'*64]])
        return result, count, proc

    def test_bounded_stream_normal(self):
        result,count,proc = self.probe('normal'); self.assertEqual(result['exitCode'],0); self.assertFalse(result['timeout']); self.assertFalse(result['logLimitExceeded']); self.assertEqual(result['logBytes'],131072); self.assertEqual(count['written'],131072); self.assertEqual(proc.terminated,0)

    def test_bounded_stream_limit(self):
        result,count,proc = self.probe('limit'); self.assertTrue(result['logLimitExceeded']); self.assertEqual(result['logBytes'],50*1024*1024); self.assertEqual(count['written'],50*1024*1024); self.assertEqual(count['reads'],801); self.assertEqual(proc.terminated,1)

    def test_bounded_stream_timeout(self):
        result,count,proc = self.probe('timeout'); self.assertTrue(result['timeout']); self.assertEqual(result['logBytes'],0); self.assertEqual(proc.terminated,1)

    def test_bounded_stream_io_failure(self):
        result,count,proc = self.probe('iofailure'); self.assertIsNone(result); self.assertEqual(count['written'],0); self.assertEqual(proc.terminated,1)


class ProductionOwner(unittest.TestCase):
    def setUp(self):
        self.attempt = 'a'*32
        self.unit = 'jarvis-tg-r29-'+self.attempt+'-owner.service'
        self.filename = '/opt/jarvis-development/software-factory/frozen-build.py'
        self.props = {'ActiveState': 'active', 'MainPID': '321', 'ControlGroup': '/system.slice/'+self.unit, 'RuntimeMaxUSec': '30min', 'TimeoutStopUSec': '5min', 'KillMode': 'control-group', 'Restart': 'no', 'ExecStopPost': '{ path=/usr/bin/python3 ; argv[]=/usr/bin/python3 '+self.filename+' --reconcile-cleanup '+self.attempt+' ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }'}
        texts = {'/proc/self/stat': '321 (python3) '+' '.join(['S']+['0']*18+['4321']), '/proc/self/cgroup': '0::/system.slice/'+self.unit, '/proc/sys/kernel/random/boot_id': 'boot-fixture'}
        class PathAdapter:
            def __init__(this, value): this.value = value
            def __str__(this): return this.value
            def read_text(this): return texts[this.value]
        self.ns = {'need':need,'re':re,'Path':PathAdapter,'__file__':self.filename,'os':SimpleNamespace(environ={'JARVIS_R29_BUILD_OWNER_UNIT':self.unit},getpid=lambda:321),'subprocess':SimpleNamespace(run=lambda *args,**kw:SimpleNamespace(returncode=0,stdout='\n'.join(k+'='+v for k,v in self.props.items())))}
        self.fn = exact_function('owner_contract', self.ns)

    def test_exact_owner_positive(self):
        result = self.fn(self.attempt); self.assertEqual(result['pid'],321); self.assertTrue(result['exactExecStopPostConfigured']); self.assertEqual(result['startTicks'],'4321')

    def test_echo_extra_and_ignored_stoppost_refused(self):
        expected = self.props['ExecStopPost']
        for text in [expected.replace('path=/usr/bin/python3','path=/bin/echo'), expected.replace('argv[]=/usr/bin/python3','argv[]=/bin/echo /usr/bin/python3'), expected.replace(' ; ignore_errors',' extra ; ignore_errors'), expected.replace('ignore_errors=no','ignore_errors=yes'), expected+' '+expected]:
            self.props['ExecStopPost'] = text
            with self.assertRaisesRegex(RuntimeError,'^R29_BUILD_OWNER_STOPPOST_CHANGED$'): self.fn(self.attempt)

    def test_wrong_lifetime_cgroup_pid_and_restart_refused(self):
        for field,bad in [('RuntimeMaxUSec','infinity'),('TimeoutStopUSec','1min'),('KillMode','process'),('Restart','always'),('MainPID','322'),('ControlGroup','/other.slice/unit'),('ActiveState','inactive')]:
            old = self.props[field]; self.props[field] = bad
            with self.assertRaisesRegex(RuntimeError,'^R29_BUILD_OWNER_CONTRACT_CHANGED$'): self.fn(self.attempt)
            self.props[field] = old


class ProductionAbsence(unittest.TestCase):
    def test_only_exact_named_absence(self):
        name = 'jarvis-tg-r29-'+'a'*32+'-build'
        for rc,out,err,accepted in [(1,b'[]',('Error: No such object: '+name).encode(),True),(1,b'[]',b'Error: No such object: other',False),(1,b'',('Error: No such object: '+name).encode(),False),(2,b'[]',('Error: No such object: '+name).encode(),False),(1,b'[]',b'connection denied No such container',False)]:
            ns={'need':need,'json':json,'call':lambda *args,**kw:SimpleNamespace(returncode=rc,stdout=out,stderr=err)}
            fn=exact_function('inspect',ns)
            if accepted:self.assertIsNone(fn(name,timeout=15))
            else:
                with self.assertRaisesRegex(RuntimeError,'^R29_BUILD_CONTAINER_INSPECT_FAILED$'):fn(name,timeout=15)


class ProductionReconciliation(unittest.TestCase):
    def probe(self, mode):
        attempt='a'*32;names=['jarvis-tg-r29-'+attempt+'-'+name for name in ['offline-install','build','typecheck','truth-unit']]
        labels={'jarvis.truthgate.r29.attempt':attempt,'jarvis.truthgate.r29.kind':'build'};toolbytes=b'trusted-fixture-worker'
        ownership={'attempt':attempt,'sourceFingerprint':'fixed-source','containers':names,'labels':labels,'imageID':'sha256:approved','emptyResourceScopeVerified':True,'toolSHA256':hashlib.sha256(toolbytes).hexdigest()}
        state={'attempt':attempt,'resources':{'containers':names,'labels':labels},'creationIntent':{'name':names[0]},'checks':[]}
        class FakePath:
            def __init__(self, value):self.value=value
            def __truediv__(self,item):return FakePath(self.value+'/'+str(item))
            @property
            def parents(self):return []
            def __str__(self):return self.value
            def lstat(self):return SimpleNamespace(st_mode=0o040700,st_uid=0)
            def exists(self):return True
        root=FakePath('/approved-root');removed=[];saved=[]
        current={'Id':'f'*64,'Config':{'Labels':{**labels}},'Image':'sha256:approved'}
        if mode=='foreign':current['Config']['Labels']['jarvis.truthgate.r29.attempt']='b'*32
        def read(path):
            value=str(path)
            if value.endswith('/ownership/'+attempt+'.json'):return json.dumps(ownership).encode()
            if value.endswith('/'+attempt+'/state.json'):return json.dumps(state).encode()
            if value=='/trusted.py':return toolbytes
            raise AssertionError('unexpected private read')
        def inspect(name,timeout):
            self.assertEqual(timeout,15)
            return current if name==names[0] and not removed else None
        def call(args,timeout):
            self.assertEqual(timeout,15)
            if args[:2]==['rm','-f']:removed.append(args[2]);return SimpleNamespace(returncode=0)
            self.assertEqual(args[:2],['ps','-aq']);return SimpleNamespace(returncode=0,stdout=b'' if removed or mode=='empty' else b'foreign-or-unowned')
        if mode=='no-state':state=None
        elif mode=='no-intent':state.pop('creationIntent')
        elif mode=='bad-ownership':ownership['emptyResourceScopeVerified']=False
        if mode=='empty':current=None
        ns={'need':need,'os':SimpleNamespace(geteuid=lambda:0,path=SimpleNamespace(lexists=lambda p:mode!='no-state')),'re':re,'ROOT':root,'stat':__import__('stat'),'STAGES':[(s,[],1) for s in ['offline-install','build','typecheck','truth-unit']],'private_read':read,'json':json,'FINGERPRINT':'fixed-source','IMAGE':'sha256:approved','Path':FakePath,'__file__':'/trusted.py','hashlib':hashlib,'inspect':inspect,'call':call,'store':lambda p,v:saved.append(v),'time':time,'uuid':__import__('uuid')}
        fn=exact_function('reconcile_cleanup',ns)
        if mode=='bad-ownership':
            with self.assertRaisesRegex(RuntimeError,'^R29_BUILD_RECONCILE_OWNERSHIP_CHANGED$'):fn(attempt)
            self.assertEqual(removed,[]);return
        result=fn(attempt)
        if mode in ['no-state','no-intent','foreign']:
            self.assertEqual(result,1);self.assertEqual(removed,[]);self.assertFalse(saved[0]['exactResourceScopeObservedAbsent'])
        else:self.assertEqual(result,0);self.assertTrue(saved[0]['exactResourceScopeObservedAbsent'])
        self.assertFalse(saved[0]['cleanupIndependentlyVerified'])

    def test_owned_intent_cleanup_only(self):self.probe('owned')
    def test_existing_resource_without_state_refused(self):self.probe('no-state')
    def test_existing_resource_without_intent_refused(self):self.probe('no-intent')
    def test_foreign_labels_refused(self):self.probe('foreign')
    def test_bad_ownership_refused(self):self.probe('bad-ownership')
    def test_confirmed_empty_scope(self):self.probe('empty')


if __name__ == '__main__':
    print(json.dumps({'productionSourceSHA256': SHA, 'method': 'Exact production AST with controlled in-memory adapters; no Docker, product, model or SSH. OS filesystem limited to an exclusive temp log.', 'linuxDockerMountSemanticsProven': False}))
    unittest.main(verbosity=2)
