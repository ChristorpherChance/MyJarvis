"""Offline AST fixtures for the production R2 cache and normal-path guards.

Only selected function definitions execute, with an in-memory FD/filesystem
adapter. No Docker, subprocess, product import, Linux permission claim or race
execution is involved. The old source is reconstructed and hash checked before
demonstrating the prior pre-open metadata gap.
"""
import ast
import hashlib
import json
import stat
import unittest
from pathlib import Path, PurePosixPath
from types import SimpleNamespace


SOURCE = Path(__file__).with_name('factory-truth-gate-build-r29-r2.py')
CURRENT_SHA = '75048d1c14c42d0aa95d8dc9921957b6b89694b108b96252190be38b7fb590a4'
OLD_SHA = '0602a92a795d34f968ea5c3215b3b40ecf935843ee40e457c968d978ba671895'


def load_functions(raw, names, env):
    tree = ast.parse(raw)
    selected = [node for node in tree.body
                if isinstance(node, ast.FunctionDef) and node.name in names]
    if {node.name for node in selected} != set(names):
        raise AssertionError('production AST function selection changed')
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(SOURCE), 'exec'), env)
    return env


class Node:
    next_inode = 100

    def __init__(self, kind='file', data=b'a', uid=1000, mode=None, nlink=1):
        Node.next_inode += 1
        self.inode = Node.next_inode
        self.kind = kind
        self.data = bytearray(data)
        self.uid = self.gid = uid
        self.nlink = nlink
        self.mode = mode if mode is not None else (0o755 if kind == 'dir' else 0o644)
        self.mtime = self.ctime = 1
        self.children = {}

    def snapshot(self):
        kind = {'file': stat.S_IFREG, 'dir': stat.S_IFDIR,
                'link': stat.S_IFLNK, 'socket': stat.S_IFSOCK}[self.kind]
        return SimpleNamespace(st_dev=7, st_ino=self.inode, st_uid=self.uid,
                               st_gid=self.gid, st_mode=kind | self.mode,
                               st_nlink=self.nlink,
                               st_size=len(self.data) if self.kind == 'file' else 0,
                               st_mtime_ns=self.mtime, st_ctime_ns=self.ctime)


class MemoryFDs:
    O_RDONLY = 0
    O_WRONLY = 1
    O_CREAT = 64
    O_EXCL = 128
    O_NONBLOCK = 2048
    O_DIRECTORY = 65536
    O_NOFOLLOW = 131072

    def __init__(self, change=None, bad_output=None):
        self.source = Node('dir', uid=1000)
        self.source.children['one'] = Node(nlink=2)
        self.target = None
        self.fds = {}
        self.next_fd = 10
        self.change = change
        self.changed = False
        self.bad_output = bad_output
        self.bytes_written = 0
        self.zero_write = False

    def directory(self, path):
        return self.allocate(self.source if path == '/input' else self.target)

    def allocate(self, node):
        if node is None:
            raise FileNotFoundError('controlled adapter directory missing')
        self.next_fd += 1
        self.fds[self.next_fd] = [node, 0]
        return self.next_fd

    def fstat(self, fd):
        return self.fds[fd][0].snapshot()

    def listdir(self, fd):
        return list(self.fds[fd][0].children)

    def stat(self, name, dir_fd, follow_symlinks=False):
        assert follow_symlinks is False
        return self.fds[dir_fd][0].children[name].snapshot()

    def open(self, name, flags, mode=0o600, dir_fd=None):
        parent = self.fds[dir_fd][0]
        assert flags & self.O_NOFOLLOW
        if parent is self.source and not self.changed and self.change:
            self.changed = True
            if self.change == 'grow-in-place':
                # Writing a file changes its own timestamps, not its parent.
                parent.children[name].data = bytearray(b'abcd')
                parent.children[name].mtime += 1
                parent.children[name].ctime += 1
            elif self.change == 'replace-inode':
                parent.children[name] = Node(data=b'abcd')
                parent.mtime += 1
                parent.ctime += 1
        if flags & self.O_CREAT:
            assert flags & self.O_EXCL and name not in parent.children
            parent.children[name] = Node(uid=0, mode=mode)
            parent.children[name].data = bytearray()
            if self.bad_output == 'owner':
                parent.children[name].uid = parent.children[name].gid = 1000
            elif self.bad_output == 'hardlink':
                parent.children[name].nlink = 2
        node = parent.children[name]
        if node.kind == 'link':
            raise OSError('controlled nofollow refusal')
        return self.allocate(node)

    def mkdir(self, name, mode, dir_fd):
        parent = self.fds[dir_fd][0]
        assert name not in parent.children
        parent.children[name] = Node('dir', uid=0, mode=mode)

    def read(self, fd, limit):
        node, offset = self.fds[fd]
        data = bytes(node.data[offset:offset + limit])
        self.fds[fd][1] += len(data)
        return data

    def write(self, fd, data):
        if self.zero_write:
            return 0
        node, offset = self.fds[fd]
        node.data[offset:offset + len(data)] = data
        self.fds[fd][1] += len(data)
        self.bytes_written += len(data)
        return len(data)

    def fchmod(self, fd, mode):
        node = self.fds[fd][0]
        node.mode = mode

    def fsync(self, fd):
        assert fd in self.fds

    def close(self, fd):
        del self.fds[fd]


class MemoryTarget:
    def __init__(self, fs):
        self.fs = fs

    def mkdir(self, mode):
        assert self.fs.target is None and mode == 0o700
        self.fs.target = Node('dir', uid=0, mode=mode)

    def __str__(self):
        return '/output'


class MemoryPath:
    def __init__(self, name, entries):
        self.name = str(name)
        self.entries = entries

    @property
    def parent(self):
        return MemoryPath(str(PurePosixPath(self.name).parent), self.entries)

    @property
    def parents(self):
        return [MemoryPath(str(x), self.entries) for x in PurePosixPath(self.name).parents]

    def lstat(self):
        return self.entries[self.name].snapshot()


class CacheGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = SOURCE.read_bytes()
        if hashlib.sha256(cls.raw).hexdigest() != CURRENT_SHA:
            raise AssertionError('CURRENT_PRODUCTION_SOURCE_CHANGED')
        old = cls.raw.replace(b'write_fd=None,expected=None', b'write_fd=None')
        old = old.replace(b"need(expected is None or identity(before)==identity(expected),'R29_BUILD_CACHE_FILE_CHANGED');", b'')
        old = old.replace(b'read_file(src,name,output,s)', b'read_file(src,name,output)')
        if hashlib.sha256(old).hexdigest() != OLD_SHA:
            raise AssertionError('EXACT_OLD_SOURCE_RECONSTRUCTION_FAILED')
        cls.old = old

    def run_cache(self, fs, old=False):
        env = {'os': fs, 'stat': stat, 'hashlib': hashlib, 'json': json,
               'time': SimpleNamespace(monotonic=lambda: 0)}
        load_functions(self.old if old else self.raw, ['stage_cache', 'need'], env)
        helper = SimpleNamespace(open_directory=fs.directory)
        return env['stage_cache'](helper, '/input', MemoryTarget(fs))

    def test_bound_stable_copy_is_independent_and_read_only(self):
        fs = MemoryFDs()
        result = self.run_cache(fs)
        self.assertEqual(result['bytes'], fs.bytes_written)
        self.assertEqual((result['files'], result['bytes']), (1, 1))
        self.assertTrue(result['secondInputAndOutputReadVerified'])
        self.assertEqual(fs.target.mode, 0o555)
        copied = fs.target.children['one']
        self.assertEqual((copied.mode, copied.uid, copied.gid, copied.nlink), (0o444, 0, 0, 1))
        self.assertNotEqual(copied.inode, fs.source.children['one'].inode)
        self.assertEqual(fs.fds, {})

    def test_exact_old_source_counts_one_but_copies_four_after_in_place_change(self):
        fs = MemoryFDs(change='grow-in-place')
        result = self.run_cache(fs, old=True)
        self.assertEqual(result['bytes'], 1)
        self.assertEqual(fs.bytes_written, 4)
        self.assertEqual(bytes(fs.target.children['one'].data), b'abcd')
        self.assertTrue(result['secondInputAndOutputReadVerified'])
        self.assertEqual(fs.fds, {})

    def test_new_source_rejects_in_place_change_before_any_bytes(self):
        fs = MemoryFDs(change='grow-in-place')
        with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_CACHE_FILE_CHANGED$'):
            self.run_cache(fs)
        self.assertEqual(fs.bytes_written, 0)
        self.assertEqual(fs.fds, {})

    def test_new_source_rejects_changed_inode_before_any_bytes(self):
        fs = MemoryFDs(change='replace-inode')
        with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_CACHE_FILE_CHANGED$'):
            self.run_cache(fs)
        self.assertEqual(fs.bytes_written, 0)
        self.assertEqual(fs.fds, {})

    def test_old_inode_replacement_is_rejected_only_after_copy_by_directory_metadata(self):
        fs = MemoryFDs(change='replace-inode')
        with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_CACHE_DIRECTORY_CHANGED$'):
            self.run_cache(fs, old=True)
        self.assertEqual(fs.bytes_written, 4)
        self.assertEqual(fs.fds, {})

    def test_input_symlink_refused_before_copy(self):
        fs = MemoryFDs()
        fs.source.children['one'].kind = 'link'
        with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_CACHE_SYMLINK_OR_SPECIAL_REFUSED$'):
            self.run_cache(fs)
        self.assertEqual(fs.bytes_written, 0)
        self.assertEqual(fs.fds, {})

    def test_input_socket_refused_before_copy(self):
        fs = MemoryFDs()
        fs.source.children['one'].kind = 'socket'
        with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_CACHE_SYMLINK_OR_SPECIAL_REFUSED$'):
            self.run_cache(fs)
        self.assertEqual(fs.bytes_written, 0)

    def test_output_owner_and_hardlink_refused(self):
        for bad in ['owner', 'hardlink']:
            with self.subTest(bad=bad):
                fs = MemoryFDs(bad_output=bad)
                with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_CACHE_COPY_NOT_INDEPENDENT$'):
                    self.run_cache(fs)
                self.assertEqual(fs.fds, {})

    def test_zero_write_refused_and_all_fds_closed(self):
        fs = MemoryFDs()
        fs.zero_write = True
        with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_CACHE_COPY_SHORT_WRITE$'):
            self.run_cache(fs)
        self.assertEqual(fs.fds, {})

    def mount_fixture(self):
        entries = {str(x): Node('dir', uid=0, mode=0o755)
                   for x in [PurePosixPath('/'), PurePosixPath('/root')]}
        entries['/root/attempt'] = Node('dir', uid=0, mode=0o700)
        entries['/root/attempt/caches'] = Node('dir', uid=0, mode=0o700)
        source = '/root/attempt/caches/store'
        entries[source] = Node('dir', uid=0, mode=0o555)
        held = entries[source].snapshot()
        fake_os = SimpleNamespace(fstat=lambda fd: held)
        env = {'Path': lambda name: MemoryPath(name, entries), 'stat': stat, 'os': fake_os}
        load_functions(self.raw, ['assert_mount_root', 'need'], env)
        mount = {'source': source, 'fd': 900, 'device': held.st_dev,
                 'inode': held.st_ino, 'rw': False}
        return env['assert_mount_root'], entries, mount

    def test_normal_root_private_readonly_mount_is_bound(self):
        check, _, mount = self.mount_fixture()
        self.assertTrue(check(mount))

    def test_normal_parent_symlink_untrusted_owner_and_write_refused(self):
        for bad in ['link', 'owner', 'write']:
            with self.subTest(bad=bad):
                check, entries, mount = self.mount_fixture()
                parent = entries['/root/attempt/caches']
                if bad == 'link':
                    parent.kind = 'link'
                elif bad == 'owner':
                    parent.uid = 1000
                else:
                    parent.mode = 0o722
                with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_MOUNT_PARENT_UNTRUSTED$'):
                    check(mount)

    def test_parent_must_be_exactly_private_700(self):
        check, entries, mount = self.mount_fixture()
        entries['/root/attempt/caches'].mode = 0o755
        with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_MOUNT_PRIVATE_PARENT_REQUIRED$'):
            check(mount)

    def test_mount_source_replaced_inode_refused(self):
        check, entries, mount = self.mount_fixture()
        entries[mount['source']] = Node('dir', uid=0, mode=0o555)
        with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_MOUNT_IDENTITY_CHANGED$'):
            check(mount)

    def test_readonly_cache_root_owner_and_write_refused(self):
        for bad in ['owner', 'write']:
            with self.subTest(bad=bad):
                check, entries, mount = self.mount_fixture()
                if bad == 'owner':
                    entries[mount['source']].uid = 1000
                else:
                    entries[mount['source']].mode = 0o755
                with self.assertRaisesRegex(RuntimeError, '^R29_BUILD_CACHE_ROOT_WRITABLE$'):
                    check(mount)


if __name__ == '__main__':
    unittest.main()
