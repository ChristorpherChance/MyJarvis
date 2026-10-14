"""Selected production R3 AST functions with controlled memory FD adapters only."""
import ast
import hashlib
import importlib.util
import json
import stat
import unittest
from pathlib import Path, PurePosixPath
from types import SimpleNamespace

SOURCE = Path(__file__).with_name('factory-truth-gate-build-r29-r3.py')
SOURCE_SHA = '04c8716edf4397195cbda696d62f527997a37ce2aff1300c67333caee2f34798'
BASE = Path(__file__).with_name('test-factory-truth-gate-build-cache-independent-r29-r2.py')
BASE_SHA = '7a57fd7ec6af804c2117867d6902fcabd4761dc61bc26d371f0c548a18c81532'
if hashlib.sha256(BASE.read_bytes()).hexdigest() != BASE_SHA:
    raise AssertionError('CONTROLLED_FD_ADAPTER_CHANGED')
spec = importlib.util.spec_from_file_location('r29_cache_memory_adapter', BASE)
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class ManifestPath:
    def __init__(self, name, state):
        self.name = str(name)
        self.state = state

    @property
    def parent(self):
        return ManifestPath(str(PurePosixPath(self._name).parent), self.state)

    def __truediv__(self, item):
        return ManifestPath(str(PurePosixPath(self._name) / item), self.state)

    @property
    def name(self):
        return PurePosixPath(self._name).name

    @name.setter
    def name(self, value):
        self._name = value

    def __str__(self):
        return self._name

    def exists(self):
        return self._name in self.state

    def mkdir(self, mode):
        if self.exists():
            raise FileExistsError('controlled manifest directory exists')
        self.state[self._name] = adapter.Node('dir', uid=0, mode=mode)

    def lstat(self):
        return self.state[self._name].snapshot()


class TargetPath(ManifestPath):
    def __init__(self, fs, state):
        super().__init__('/private/caches/cache', state)
        self.fs = fs

    def mkdir(self, mode):
        self.fs.target = adapter.Node('dir', uid=0, mode=mode)
        self.state[str(self)] = self.fs.target


class R3CacheTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = SOURCE.read_bytes()
        if hashlib.sha256(cls.raw).hexdigest() != SOURCE_SHA:
            raise AssertionError('R3_PRODUCTION_SOURCE_CHANGED')

    def environment(self, fs, state=None):
        state = {} if state is None else state
        saved = {}

        def store(path, value):
            key = str(path)
            if key in saved:
                raise FileExistsError('controlled manifest already stored')
            saved[key] = (json.dumps(value, separators=(',', ':')) + '\n').encode()

        def private_read(path, limit):
            value = saved[str(path)]
            if len(value) > limit:
                raise AssertionError('controlled bounded read exceeds limit')
            return value

        fs.path = SimpleNamespace(lexists=lambda p: str(p) in state or str(p) in saved)
        env = {'os': fs, 'stat': stat, 'hashlib': hashlib, 'json': json,
               'time': SimpleNamespace(monotonic=lambda: 0),
               'store': store, 'private_read': private_read}
        tree = ast.parse(self.raw)
        names = {'stage_cache', 'cache_closure', 'need'}
        selected = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
        self.assertEqual({n.name for n in selected}, names)
        exec(compile(ast.Module(body=selected, type_ignores=[]), str(SOURCE), 'exec'), env)
        return env, state, saved

    def stage(self, fs):
        env, state, saved = self.environment(fs)
        helper = SimpleNamespace(open_directory=fs.directory)
        value = env['stage_cache'](helper, '/input', TargetPath(fs, state))
        return value, saved

    def closure_fixture(self):
        fs = adapter.MemoryFDs()
        fs.target = adapter.Node('dir', uid=0, mode=0o555)
        fs.target.children['one'] = adapter.Node(uid=0, mode=0o444)
        env, _, _ = self.environment(fs)
        return fs, lambda: env['cache_closure'](SimpleNamespace(open_directory=fs.directory), '/closure')

    def test_exec_and_nonexec_preserved_readonly_with_independent_hardlink_copies(self):
        fs = adapter.MemoryFDs()
        shared = fs.source.children['one']
        shared.mode = 0o755
        fs.source.children['two'] = shared
        fs.source.children['data'] = adapter.Node(data=b'public', mode=0o644)
        result, saved = self.stage(fs)
        self.assertEqual((result['files'], result['bytes']), (3, 8))
        self.assertEqual(fs.target.children['one'].mode, 0o555)
        self.assertEqual(fs.target.children['two'].mode, 0o555)
        self.assertEqual(fs.target.children['data'].mode, 0o444)
        self.assertNotEqual(fs.target.children['one'].inode, fs.target.children['two'].inode)
        self.assertTrue(result['executableFilesPreservedReadOnly'])
        self.assertTrue(result['outputFullClosureDoubleRead'])
        stored = saved[result['manifestPath']]
        self.assertEqual(hashlib.sha256(stored).hexdigest(), result['manifestSHA256'])
        manifest = json.loads(stored)
        self.assertEqual(manifest['contentTreeSHA256'], result['outputContentTreeSHA256'])
        self.assertEqual(manifest['metadataSHA256'], result['outputMetadataSHA256'])
        self.assertEqual(manifest['files'], 3)
        self.assertEqual(fs.bytes_written, result['bytes'])
        self.assertEqual(fs.fds, {})

    def test_in_place_input_change_refused_before_copy(self):
        fs = adapter.MemoryFDs(change='grow-in-place')
        with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_CACHE_FILE_CHANGED$'):
            self.stage(fs)
        self.assertEqual(fs.bytes_written, 0)
        self.assertEqual(fs.fds, {})

    def test_replaced_input_inode_refused_before_copy(self):
        fs = adapter.MemoryFDs(change='replace-inode')
        with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_CACHE_FILE_CHANGED$'):
            self.stage(fs)
        self.assertEqual(fs.bytes_written, 0)
        self.assertEqual(fs.fds, {})

    def test_closure_content_and_metadata_hashes_are_deterministic(self):
        fs, closure = self.closure_fixture()
        first, second = closure(), closure()
        self.assertEqual(first, second)
        self.assertEqual((first['files'], first['bytes'], len(first['entries'])), (1, 1, 2))
        self.assertFalse(first['symlinks'])
        self.assertFalse(first['sharedHardlinks'])
        self.assertEqual(fs.fds, {})

    def test_closure_refuses_link_socket_hardlink_and_writable_file(self):
        for bad in ['link', 'socket', 'hardlink', 'write', 'owner', 'group']:
            with self.subTest(bad=bad):
                fs, closure = self.closure_fixture()
                node = fs.target.children['one']
                if bad in ['link', 'socket']:
                    node.kind = bad
                elif bad == 'hardlink':
                    node.nlink = 2
                elif bad == 'write':
                    node.mode = 0o644
                elif bad == 'owner':
                    node.uid = 1000
                else:
                    node.gid = 1000
                with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_CACHE_CLOSURE_FILE_INVALID$'):
                    closure()
                self.assertEqual(fs.fds, {})

    def test_closure_refuses_directory_owner_group_and_write(self):
        for bad in ['owner', 'group', 'write']:
            with self.subTest(bad=bad):
                fs, closure = self.closure_fixture()
                if bad == 'owner':
                    fs.target.uid = 1000
                elif bad == 'group':
                    fs.target.gid = 1000
                else:
                    fs.target.mode = 0o755
                with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_CACHE_CLOSURE_DIRECTORY_INVALID$'):
                    closure()
                self.assertEqual(fs.fds, {})

    def test_offline_stage_explicitly_uses_copy_and_ignores_scripts(self):
        tree = ast.parse(self.raw)
        node = next(n for n in tree.body if isinstance(n, ast.Assign)
                    and any(isinstance(t, ast.Name) and t.id == 'STAGES' for t in n.targets))
        stages = ast.literal_eval(node.value)
        self.assertEqual([s[0] for s in stages], ['offline-install', 'build', 'typecheck', 'truth-unit'])
        self.assertTrue({'--offline', '--frozen-lockfile', '--ignore-scripts',
                         '--package-import-method=copy', '--store-dir'} <= set(stages[0][1]))
        self.assertEqual(stages[0][1][-1], '/pnpm-store')


if __name__ == '__main__':
    unittest.main()
