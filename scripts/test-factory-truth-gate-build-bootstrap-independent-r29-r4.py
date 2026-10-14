"""Local R4 AST and Node VM guards; never Docker, host, model or product code."""
import ast
import contextlib
import copy
import hashlib
import io
import json
import re
import stat
import subprocess
import time
import unittest
from pathlib import Path, PurePosixPath
from types import SimpleNamespace

SOURCE = Path(__file__).with_name('factory-truth-gate-build-r29-r4.py')
ORIGINAL = Path(__file__).with_name('factory-truth-gate-build-r29.py')
R3 = Path(__file__).with_name('factory-truth-gate-build-r29-r3.py')
EXPECTED_SHA = '4ad07994beeb274e9f6b883ad02af89a1b562a1f0f094a55fbe9ebc0de81cf70'


class MemoryPath:
    def __init__(self, value, existing):
        self.value = str(value)
        self.existing = existing

    def __str__(self):
        return self.value

    def __truediv__(self, value):
        return MemoryPath(PurePosixPath(self.value) / value, self.existing)

    @property
    def parents(self):
        return [MemoryPath(x, self.existing) for x in PurePosixPath(self.value).parents]

    def lstat(self):
        return SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=0)

    def exists(self):
        return self.value in self.existing

    def mkdir(self, mode):
        assert mode == 0o700
        self.existing.add(self.value)


class BootstrapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = SOURCE.read_bytes()
        if hashlib.sha256(cls.raw).hexdigest() != EXPECTED_SHA:
            raise AssertionError('R4_WORKER_SOURCE_CHANGED')
        cls.text = cls.raw.decode()
        cls.tree = ast.parse(cls.text)
        cls.functions = {x.name: x for x in cls.tree.body if isinstance(x, ast.FunctionDef)}
        cls.stages = ast.literal_eval(next(x.value for x in cls.tree.body
                                          if isinstance(x, ast.Assign)
                                          and any(isinstance(t, ast.Name) and t.id == 'STAGES' for t in x.targets)))
        cls.stages.insert(0, ('mount-proof', [], 30))
        cls.probe = ast.literal_eval(next(x.value for x in cls.tree.body
                                        if isinstance(x, ast.Assign)
                                        and any(isinstance(t, ast.Name) and t.id == 'MOUNT_PROBE_JS' for t in x.targets)))
        cls.expected = [{'root': '/' + name, 'device': 7, 'inode': 90 + i,
                         'path': 'one.js', 'sha256': hashlib.sha256(b'public').hexdigest(),
                         'bytes': 6, 'mode': 0o555}
                        for i, name in enumerate(['corepack-runtime', 'corepack-cache', 'pnpm-store'])]
        cls.wanted = {'schemaVersion': 1, 'kind': 'r29-r4-normal-bind-bootstrap',
                      'uid': 1000, 'gid': 1000,
                      'caches': [{**x, 'readOnlyMount': True, 'mutationRejected': True,
                                  'bytesVerified': True} for x in cls.expected],
                      'workWritable': True, 'candidateCodeExecuted': False}

    def load(self, names, env):
        nodes = [self.functions[name] for name in names]
        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), 'exec'), env)
        return env

    def qualify(self, raw):
        env = self.load(['qualify_mount_probe'], {'json': json})
        return env['qualify_mount_probe'](raw, self.expected)

    def test_exact_bootstrap_frame_accepted(self):
        self.assertEqual(self.qualify(json.dumps(self.wanted).encode()), self.wanted)

    def test_duplicate_nonfinite_invalid_utf8_and_trailing_output_refused(self):
        raw = json.dumps(self.wanted).encode()
        cases = [raw.replace(b'"uid": 1000', b'"uid": 0, "uid": 1000'),
                 raw.replace(b'"uid": 1000', b'"uid": NaN'),
                 raw.replace(b'"uid": 1000', b'"uid": Infinity'),
                 raw + b'\nsecond-frame', b'\xff']
        for value in cases:
            with self.subTest(value=value[:40]):
                self.assertIsNone(self.qualify(value))

    def test_numeric_bool_float_extra_and_missing_fields_refused(self):
        for key, value in [('workWritable', 1), ('candidateCodeExecuted', 0),
                           ('uid', 1000.0), ('schemaVersion', True)]:
            changed = copy.deepcopy(self.wanted)
            changed[key] = value
            self.assertIsNone(self.qualify(json.dumps(changed).encode()))
        changed = copy.deepcopy(self.wanted)
        changed['caches'][0]['readOnlyMount'] = 1
        self.assertIsNone(self.qualify(json.dumps(changed).encode()))
        changed['caches'][0]['readOnlyMount'] = True
        changed['unexpected'] = True
        self.assertIsNone(self.qualify(json.dumps(changed).encode()))
        del changed['unexpected']
        del changed['uid']
        self.assertIsNone(self.qualify(json.dumps(changed).encode()))

    def test_original_owner_and_previously_reviewed_cache_functions_unchanged(self):
        for source, names in [(ORIGINAL, ['owner_contract']),
                              (R3, ['stage_cache', 'cache_closure', 'assert_mount_root'])]:
            text = source.read_text()
            original = {x.name: x for x in ast.parse(text).body if isinstance(x, ast.FunctionDef)}
            for name in names:
                self.assertEqual(ast.get_source_segment(text, original[name]),
                                 ast.get_source_segment(self.text, self.functions[name]))

    def test_five_stage_names_owner_before_create_and_durable_intent_order(self):
        self.assertEqual([x[0] for x in self.stages],
                         ['mount-proof', 'offline-install', 'build', 'typecheck', 'truth-unit'])
        self.assertEqual(len({x[0] for x in self.stages}), 5)
        body = ast.get_source_segment(self.text, self.functions['main'])
        self.assertLess(body.index('owner=owner_contract(attempt)'), body.index('image_result=call'))
        loop = body[body.index('for (name,args,timeout),container in zip(STAGES,names):'):]
        self.assertLess(loop.index('owner_contract(attempt)'), loop.index("command=['create'"))
        self.assertLess(loop.index("r['creationIntent']="), loop.index('store(state,r)'))
        self.assertLess(loop.index('store(state,r)'), loop.index('created=call(command)'))
        self.assertIn("else:need(bootstrap is not None,'R29_BUILD_BOOTSTRAP_REQUIRED')", loop)
        self.assertIn("if name in ['mount-proof','offline-install'] and not ok:break", loop)
        self.assertIn("len(r['checks'])==len(STAGES)", loop)

    def run_reconcile(self, foreign=False):
        attempt = 'a' * 32
        labels = {'jarvis.truthgate.r29.attempt': attempt, 'jarvis.truthgate.r29.kind': 'build'}
        names = ['jarvis-tg-r29-' + attempt + '-' + x[0] for x in self.stages]
        identifier = 'b' * 64
        image = 'sha256:' + 'c' * 64
        owned = {'Id': identifier, 'Image': image,
                 'Config': {'Labels': {**labels, **({'jarvis.truthgate.r29.attempt': 'f' * 32} if foreign else {})}}}
        records = {names[0]: owned}
        ownership = {'attempt': attempt, 'sourceFingerprint': 'fixed-source', 'containers': names,
                     'labels': labels, 'imageID': image, 'emptyResourceScopeVerified': True,
                     'toolSHA256': hashlib.sha256(self.raw).hexdigest()}
        state = {'attempt': attempt, 'resources': {'containers': names, 'labels': labels},
                 'creationIntent': {'name': names[0]}, 'checks': []}
        existing, deleted, observed, saved = set(), [], [], []

        def private_read(path):
            if str(path) == '/tool.py':
                return self.raw
            return json.dumps(state if str(path).endswith('state.json') else ownership).encode()

        def inspect(name, timeout):
            self.assertEqual(timeout, 15)
            observed.append(name)
            return records.get(name)

        def call(args, timeout):
            self.assertEqual(timeout, 15)
            if args[0] == 'rm':
                self.assertEqual(args, ['rm', '-f', identifier])
                deleted.append(identifier)
                records.clear()
            else:
                self.assertEqual(args, ['ps', '-aq', '--filter', 'label=jarvis.truthgate.r29.attempt=' + attempt])
            return SimpleNamespace(returncode=0, stdout=b'')

        env = {'os': SimpleNamespace(geteuid=lambda: 0, path=SimpleNamespace(lexists=lambda p: True)),
               're': re, 'stat': stat, 'json': json, 'hashlib': hashlib, 'time': time,
               'uuid': SimpleNamespace(uuid4=lambda: SimpleNamespace(hex='fixture-report')),
               'ROOT': MemoryPath('/bound-root', existing), 'STAGES': self.stages,
               'SOURCE': 'unused', 'FINGERPRINT': 'fixed-source', 'IMAGE': image,
               '__file__': '/tool.py', 'Path': lambda value: MemoryPath(value, existing),
               'private_read': private_read, 'inspect': inspect, 'call': call,
               'store': lambda path, value: saved.append(value)}
        self.load(['need', 'reconcile_cleanup'], env)
        with contextlib.redirect_stdout(io.StringIO()):
            result = env['reconcile_cleanup'](attempt)
        return result, deleted, observed, saved

    def test_stoppost_removes_created_unstarted_bootstrap_and_covers_five_names(self):
        code, deleted, observed, saved = self.run_reconcile()
        self.assertEqual(code, 0)
        self.assertEqual(len(deleted), 1)
        self.assertEqual(len(set(observed)), 5)
        self.assertTrue(saved[0]['exactResourceScopeObservedAbsent'])
        self.assertEqual(5 * (15 + 15 + 15) + 15, 240)
        self.assertLess(240, 300)

    def test_stoppost_refuses_same_name_with_foreign_labels(self):
        code, deleted, _, saved = self.run_reconcile(foreign=True)
        self.assertEqual(code, 1)
        self.assertEqual(deleted, [])
        self.assertFalse(saved[0]['exactResourceScopeObservedAbsent'])

    def test_actual_node_probe_vm_positive_and_rejection_paths(self):
        payload = json.dumps({'script': self.probe, 'expected': self.expected})
        harness = r'''const vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const p=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
function run(bad){let out='',work='';const e=p.expected;
 const meta=(dir,uid,gid,mode,dev=7,ino=0)=>({isDirectory:()=>dir,isFile:()=>!dir,uid,gid,mode,dev,ino,nlink:1,size:6});
 const fs={readFileSync(path){if(path==='/proc/self/mountinfo')return e.map(x=>'1 0 0:0 / '+x.root+' '+(bad==='rw'?'rw':'ro')+' - tmpfs none rw').join('\n');if(path==='/work/.jarvis-mount-proof')return work;return Buffer.from(bad==='bytes'?'wrong!':'public')},
 lstatSync(path){if(path==='/work')return meta(true,1000,1000,448);const root=e.find(x=>path===x.root);return root?meta(true,bad==='owner'?1000:0,0,365,7,root.inode+(bad==='inode'?1:0)):meta(false,0,0,365)},
 writeFileSync(path,value,options){assert.equal(options.flag,'wx');if(path.startsWith('/work/')){work=value;return}if(bad==='writable')return;const error=Error('controlled');error.code=bad==='eacces'?'EACCES':'EROFS';throw error},unlinkSync(path){assert.equal(path,'/work/.jarvis-mount-proof');work=''}};
 const process={argv:['node',JSON.stringify(e)],getuid:()=>bad==='uid'?0:1000,getgid:()=>1000,stdout:{write:value=>{out+=value}}};
 vm.runInNewContext(p.script,{require:name=>{if(name==='node:fs')return fs;if(name==='node:crypto')return crypto;throw Error('MODULE_OUT_OF_SCOPE')},process,Buffer},{timeout:1000});return JSON.parse(out)}
assert.equal(run().kind,'r29-r4-normal-bind-bootstrap');for(const bad of ['uid','rw','owner','inode','bytes','writable','eacces'])assert.throws(()=>run(bad));console.log(JSON.stringify({positive:1,rejections:7,dockerInvoked:false,hostInvoked:false}));'''
        completed = subprocess.run(['node', '-e', harness], input=payload, text=True,
                                   capture_output=True, timeout=10)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads(completed.stdout)['rejections'], 7)


if __name__ == '__main__':
    unittest.main()
