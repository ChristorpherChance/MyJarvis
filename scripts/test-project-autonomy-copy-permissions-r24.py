#!/usr/bin/python3
"""Finite copy-permission fixtures; --linux-proof requires real Linux root.

Default tests use disposable local files and mocked ownership only. They are
not proof of Linux UID/capability behavior. The explicit Linux proof prepares
dummy source/evidence, then runs direct filesystem operations in forked children
with all effective/permitted/inheritable capabilities cleared. No server,
container, model, network, project build or product test is started here.
"""
import ctypes
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

COORDINATOR = Path(__file__).with_name('project-autonomy-fa01-coordinator.py')
COLLECTOR = Path(__file__).with_name('project-autonomy-fa01-collector.mjs')
spec = importlib.util.spec_from_file_location('copy_permission_coordinator', COORDINATOR)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CopyPermissionTests(unittest.TestCase):
    def test_owner_permissions_and_exec_are_preserved_group_read_only(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            (root / 'source').mkdir()
            plain, executable = root / 'source/plain.txt', root / 'source/tool.sh'
            plain.write_text('dummy source\n')
            executable.write_text('#!/bin/sh\ntrue\n')
            observed = []
            real_lstat = Path.lstat

            def controlled_lstat(path):
                info = real_lstat(path)
                mode = stat.S_IFMT(info.st_mode) | (0o700 if path == executable or path.is_dir() else 0o600)
                values = list(info)
                values[0] = mode
                return os.stat_result(values)

            with patch.object(Path, 'lstat', controlled_lstat), \
                    patch.object(module.os, 'chown', create=True) as owner, \
                    patch.object(module.os, 'chmod', side_effect=lambda path, mode, **kw: observed.append((Path(path), mode, kw))):
                module.chown_copy(root)
            self.assertEqual({path: mode for path, mode, _ in observed},
                             {root: 0o750, root / 'source': 0o750, plain: 0o640, executable: 0o740})
            self.assertEqual(owner.call_count, 4)
            self.assertTrue(all(call.args[1:] == (1000, 0) and call.kwargs == {'follow_symlinks': False}
                                for call in owner.call_args_list))
            self.assertTrue(all(kwargs == {'follow_symlinks': False} for _, _, kwargs in observed))

    def test_leaf_link_is_rejected_before_any_permission_mutation(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            (root / 'safe').write_text('dummy')
            link = root / 'unexpected-link'
            link.write_text('fixture link metadata')
            real_lstat = Path.lstat
            def link_lstat(path):
                info = real_lstat(path)
                if path == link:
                    values = list(info); values[0] = stat.S_IFLNK | 0o777
                    return os.stat_result(values)
                return info
            with patch.object(Path, 'lstat', link_lstat), patch.object(module.os, 'chown', create=True) as owner, patch.object(module.os, 'chmod') as mode:
                with self.assertRaisesRegex(ValueError, 'COPY_PERMISSION_ENTRY_INVALID'):
                    module.chown_copy(root)
                owner.assert_not_called()
                mode.assert_not_called()

    def test_directory_link_and_root_link_are_rejected(self):
        with tempfile.TemporaryDirectory() as raw:
            parent = Path(raw)
            root, target = parent / 'copy', parent / 'target'
            root.mkdir()
            target.mkdir()
            nested, root_link = root / 'nested-link', parent / 'root-link'
            nested.mkdir(); root_link.mkdir()
            real_lstat = Path.lstat
            def link_lstat(path):
                info = real_lstat(path)
                if path in (nested, root_link):
                    values = list(info); values[0] = stat.S_IFLNK | 0o777
                    return os.stat_result(values)
                return info
            with patch.object(Path, 'lstat', link_lstat), patch.object(module.os, 'chown', create=True) as owner, patch.object(module.os, 'chmod') as mode:
                with self.assertRaisesRegex(ValueError, 'COPY_PERMISSION_ENTRY_INVALID'):
                    module.chown_copy(root)
                with self.assertRaisesRegex(ValueError, 'COPY_PERMISSION_ROOT_INVALID'):
                    module.chown_copy(parent / 'root-link')
                owner.assert_not_called()
                mode.assert_not_called()

    def test_only_exact_verified_installed_dependency_link_is_preserved_without_mutation(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            (root / 'source/node_modules').mkdir(parents=True)
            target, link = root / 'source/library.js', root / 'source/node_modules/library'
            target.write_text('fixture'); link.write_text('fake link metadata')
            real_lstat, real_resolve = Path.lstat, Path.resolve
            def link_lstat(path):
                info = real_lstat(path)
                if path == link:
                    values = list(info); values[0] = stat.S_IFLNK | 0o777
                    return os.stat_result(values)
                return info
            def link_resolve(path, *args, **kwargs):
                return real_resolve(target if path == link else path, *args, **kwargs)
            row = {'path': 'source/node_modules/library', 'kind': 'symlink', 'linktext': '../library.js', 'resolved': 'source/library.js'}
            with patch.object(Path, 'lstat', link_lstat), patch.object(Path, 'resolve', link_resolve), \
                    patch.object(module.os, 'readlink', return_value='../library.js'), \
                    patch.object(module.os, 'chown', create=True) as owner, patch.object(module.os, 'chmod') as mode:
                module.chown_copy(root, [row])
                self.assertNotIn(link, [Path(call.args[0]) for call in owner.call_args_list])
                self.assertNotIn(link, [Path(call.args[0]) for call in mode.call_args_list])
                owner.reset_mock(); mode.reset_mock()
                for invalid in ({**row, 'resolved': '../outside'}, {**row, 'linktext': 'changed'}, {**row, 'path': 'source/library.js'}):
                    with self.assertRaises(ValueError): module.chown_copy(root, [invalid])
                    owner.assert_not_called(); mode.assert_not_called()

    def test_manifest_precreation_is_exclusive_nofollow_and_exact_root_owned(self):
        with patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), \
                patch.object(module.os, 'O_NONBLOCK', 0x800, create=True), \
                patch.object(module.os, 'open', return_value=41) as opened, \
                patch.object(module.os, 'fstat', return_value=SimpleNamespace(st_mode=stat.S_IFREG | 0o640, st_nlink=1)), \
                patch.object(module.os, 'fchown', create=True) as owner, patch.object(module.os, 'fchmod', create=True) as mode, \
                patch.object(module.os, 'fsync') as synced, patch.object(module.os, 'close') as closed:
            module.prepare_collector_manifest(Path('/private/work/source'))
            flags = opened.call_args.args[1]
            self.assertTrue(flags & os.O_CREAT and flags & os.O_EXCL and flags & module.os.O_NOFOLLOW)
            self.assertFalse(flags & os.O_TRUNC)
            self.assertEqual(opened.call_args.args[0].name, 'jarvis-package-manifest.json')
            owner.assert_called_once_with(41, 0, 0); mode.assert_called_once_with(41, 0o640)
            synced.assert_called_once_with(41); closed.assert_called_once_with(41)

    def test_verified_pnpm_workspace_link_can_target_public_package_outside_node_modules(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            target = root / 'source/packages/shared'
            link = root / 'source/apps/server/node_modules/@msf/shared'
            target.mkdir(parents=True); link.parent.mkdir(parents=True); link.write_text('fake link metadata')
            real_lstat, real_resolve = Path.lstat, Path.resolve
            def link_lstat(path):
                info = real_lstat(path)
                if path == link:
                    values = list(info); values[0] = stat.S_IFLNK | 0o777
                    return os.stat_result(values)
                return info
            def link_resolve(path, *args, **kwargs):
                return real_resolve(target if path == link else path, *args, **kwargs)
            row = {'path': 'source/apps/server/node_modules/@msf/shared', 'kind': 'symlink',
                   'linktext': '../../../../packages/shared', 'resolved': 'source/packages/shared'}
            with patch.object(Path, 'lstat', link_lstat), patch.object(Path, 'resolve', link_resolve), \
                    patch.object(module.os, 'readlink', return_value='../../../../packages/shared'), \
                    patch.object(module.os, 'chown', create=True) as owner, patch.object(module.os, 'chmod') as mode:
                module.chown_copy(root, [row])
                self.assertNotIn(link, [Path(call.args[0]) for call in owner.call_args_list])
                self.assertIn(target, [Path(call.args[0]) for call in owner.call_args_list])
                self.assertNotIn(link, [Path(call.args[0]) for call in mode.call_args_list])

    def test_installed_manifest_reownership_preserves_verified_bytes_and_rejects_multilink(self):
        with patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), \
                patch.object(module.os, 'O_NONBLOCK', 0x800, create=True), patch.object(module.os, 'open', return_value=42) as opened, \
                patch.object(module.os, 'fstat', return_value=SimpleNamespace(st_mode=stat.S_IFREG | 0o644, st_nlink=1)) as info, \
                patch.object(module.os, 'fchown', create=True) as owner, patch.object(module.os, 'fchmod', create=True), \
                patch.object(module.os, 'fsync'), patch.object(module.os, 'close') as closed:
            module.prepare_collector_manifest(Path('/private/installed/source'), existing=True)
            flags = opened.call_args.args[1]
            self.assertFalse(flags & (os.O_CREAT | os.O_TRUNC))
            owner.assert_called_once_with(42, 0, 0)
            owner.reset_mock(); closed.reset_mock()
            info.return_value = SimpleNamespace(st_mode=stat.S_IFREG, st_nlink=2)
            with self.assertRaisesRegex(ValueError, 'COPY_MANIFEST_FILE_INVALID'):
                module.prepare_collector_manifest(Path('/private/installed/source'), existing=True)
            owner.assert_not_called(); closed.assert_called_once_with(42)

    def test_generated_manifest_is_explicitly_excluded_from_public_source_identity(self):
        import ast
        tree = ast.parse(Path(__file__).with_name('project-autonomy-evidence.py').read_text())
        declared = next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign)
                        and any(isinstance(target, ast.Name) and target.id == 'GENERATED_FILES' for target in node.targets))
        self.assertIn('jarvis-package-manifest.json', declared)

    def test_verified_hardlink_targets_same_inode_and_permission_change_is_applied_once(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            (root / 'source/node_modules').mkdir(parents=True)
            target, alias = root / 'source/library.js', root / 'source/node_modules/hard-library.js'
            target.write_text('dummy target'); alias.write_text('dummy inode metadata')
            real_lstat = Path.lstat
            target_info, changed_modes = real_lstat(target), {}
            def linked_lstat(path):
                info = real_lstat(path)
                if path in (target, alias):
                    values = list(info); values[1] = target_info.st_ino; values[2] = target_info.st_dev
                    values[3] = 2; values[0] = stat.S_IFREG | changed_modes.get((values[2], values[1]), stat.S_IMODE(target_info.st_mode))
                    return os.stat_result(values)
                return info
            def changed_mode(path, mode, **_kwargs):
                info = linked_lstat(Path(path)); changed_modes[(info.st_dev, info.st_ino)] = mode
            row = {'path': 'source/node_modules/hard-library.js', 'kind': 'hardlink', 'linktext': 'source/library.js', 'resolved': 'source/library.js'}
            with patch.object(Path, 'lstat', linked_lstat), patch.object(module.os, 'chown', create=True) as owner, \
                    patch.object(module.os, 'chmod', side_effect=changed_mode):
                module.chown_copy(root, [row])
                touched = [Path(call.args[0]) for call in owner.call_args_list]
                self.assertEqual(sum(path in (target, alias) for path in touched), 1)
            # A different alias inode must be rejected before any mutation.
            with patch.object(module.os, 'chown', create=True) as owner, patch.object(module.os, 'chmod'):
                with self.assertRaisesRegex(ValueError, 'COPY_PACKAGE_LINK_CHANGED'): module.chown_copy(root, [row])
                owner.assert_not_called()

    def test_embedded_linux_node_proof_preserves_javascript_regex_escaping(self):
        import ast
        tree = ast.parse(Path(__file__).read_text())
        script = next(node.value for node in ast.walk(tree) if isinstance(node, ast.Constant)
                      and isinstance(node.value, str) and 'const match = status.match' in node.value)
        self.assertIn("':\\\\s*", script)

    def test_special_file_rejected_before_any_mutation(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            item = root / 'special'
            item.write_text('dummy')
            real_lstat = Path.lstat

            def special_lstat(path):
                info = real_lstat(path)
                if path == item:
                    values = list(info)
                    values[0] = stat.S_IFIFO | 0o600
                    return os.stat_result(values)
                return info

            with patch.object(Path, 'lstat', special_lstat), \
                    patch.object(module.os, 'chown', create=True) as owner, patch.object(module.os, 'chmod') as mode:
                with self.assertRaisesRegex(ValueError, 'COPY_PERMISSION_ENTRY_INVALID'):
                    module.chown_copy(root)
                owner.assert_not_called()
                mode.assert_not_called()


def clear_capabilities():
    class Header(ctypes.Structure):
        _fields_ = [('version', ctypes.c_uint32), ('pid', ctypes.c_int)]

    class Data(ctypes.Structure):
        _fields_ = [('effective', ctypes.c_uint32), ('permitted', ctypes.c_uint32), ('inheritable', ctypes.c_uint32)]

    library = ctypes.CDLL(None, use_errno=True)
    header, data = Header(0x20080522, 0), (Data * 2)()
    if library.prctl(38, 1, 0, 0, 0) != 0:  # PR_SET_NO_NEW_PRIVS
        raise OSError(ctypes.get_errno(), 'NO_NEW_PRIVS_FAILED')
    if library.capset(ctypes.byref(header), ctypes.byref(data)) != 0:
        raise OSError(ctypes.get_errno(), 'CAP_CLEAR_FAILED')
    fields = dict(line.split(':', 1) for line in Path('/proc/self/status').read_text().splitlines() if ':' in line)
    for name in ('CapEff', 'CapPrm', 'CapInh', 'CapAmb'):
        if int(fields[name].strip(), 16) != 0:
            raise RuntimeError('CAPABILITY_NOT_CLEARED')
    return {name: fields[name].strip() for name in ('CapEff', 'CapPrm', 'CapInh', 'CapAmb')}


def child_proof(uid, gid, operations):
    read_fd, write_fd = os.pipe()
    pid = os.fork()
    if pid == 0:
        os.close(read_fd)
        try:
            os.setgroups([])
            os.setgid(gid)
            os.setuid(uid)
            caps = clear_capabilities()
            checks = []
            for name, operation, expected in operations:
                try:
                    operation()
                    allowed = True
                except PermissionError:
                    allowed = False
                if allowed != expected:
                    raise RuntimeError('ACCESS_BOUNDARY_FAILED_' + name)
                checks.append({'id': name, 'allowed': allowed, 'expected': expected, 'passed': True})
            data = {'uid': os.getuid(), 'gid': os.getgid(), 'groups': os.getgroups(), 'capabilities': caps, 'checks': checks}
            os.write(write_fd, json.dumps({'ok': True, 'proof': data}).encode())
            os._exit(0)
        except BaseException as exc:
            os.write(write_fd, json.dumps({'ok': False, 'errorType': type(exc).__name__}).encode())
            os._exit(1)
    os.close(write_fd)
    body = b''
    while True:
        chunk = os.read(read_fd, 65536)
        if not chunk:
            break
        body += chunk
    os.close(read_fd)
    _, status = os.waitpid(pid, 0)
    value = json.loads(body)
    if status != 0 or not value['ok']:
        raise RuntimeError('LINUX_CHILD_PROOF_FAILED')
    return value['proof']


def linux_proof(node_program):
    if sys.platform != 'linux' or os.geteuid() != 0:
        raise RuntimeError('LINUX_ROOT_REQUIRED')
    with tempfile.TemporaryDirectory(prefix='jarvis-copy-r24-') as raw:
        base = Path(raw)
        base.chmod(0o755)  # Dummy test bytes only; lets identities reach their bind root.
        work, evidence = base / 'work', base / 'evidence'
        work.mkdir(mode=0o700)
        (work / 'source').mkdir(mode=0o700)
        (work / 'home').mkdir(mode=0o700)
        evidence.mkdir(mode=0o700)
        plain, executable, private = work / 'source/plain.txt', work / 'source/tool.sh', evidence / 'private.txt'
        plain.write_text('fixture\n')
        executable.write_text('#!/bin/sh\ntrue\n')
        private.write_text('private dummy fixture\n')
        plain.chmod(0o600)
        executable.chmod(0o700)
        private.chmod(0o600)
        module.chown_copy(work)
        manifest = work / 'source/jarvis-package-manifest.json'
        module.prepare_collector_manifest(work / 'source')
        if (manifest.stat().st_uid, manifest.stat().st_gid, stat.S_IMODE(manifest.stat().st_mode)) != (0, 0, 0o640):
            raise RuntimeError('MANIFEST_MODE_INVALID')
        for path in (work, work / 'source', work / 'home'):
            info = path.lstat()
            if (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) != (1000, 0, 0o750):
                raise RuntimeError('COPY_DIRECTORY_MODE_INVALID')
        if stat.S_IMODE(plain.stat().st_mode) != 0o640 or stat.S_IMODE(executable.stat().st_mode) != 0o740:
            raise RuntimeError('COPY_FILE_MODE_INVALID')
        write = lambda path: path.open('ab').close()
        def manifest_writer(expected_code=None):
            script = r"""
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const status = await readFile('/proc/self/status','utf8');
for (const field of ['CapEff','CapPrm','CapInh','CapAmb']) {
  const match = status.match(new RegExp('^'+field+':\\s*([a-f0-9]+)$','m'));
  if (!match || BigInt('0x'+match[1]) !== 0n) throw Error('NODE_CAPABILITY_NOT_CLEARED');
}
const { writeTrustedPackageManifest } = await import(pathToFileURL(process.argv[1]).href);
try { await writeTrustedPackageManifest(process.argv[2], '{"fixture":"trusted-root-writer"}');
  process.stdout.write(JSON.stringify({allowed:true})); }
catch(error) { process.stdout.write(JSON.stringify({allowed:false,code:error.code??error.message})); }
"""
            result = subprocess.run([node_program, '--input-type=module', '-e', script, str(COLLECTOR), str(manifest)],
                                    capture_output=True, text=True, timeout=15)
            if result.returncode != 0:
                raise RuntimeError('ACTUAL_NODE_WRITER_PROOF_FAILED')
            value = json.loads(result.stdout)
            if expected_code is not None:
                acceptable = expected_code if isinstance(expected_code, tuple) else (expected_code,)
                if value.get('allowed') is not False or value.get('code') not in acceptable:
                    raise RuntimeError('MANIFEST_REPLACEMENT_NOT_REJECTED')
                raise PermissionError('EXPECTED_MANIFEST_REJECTION')
            if not value.get('allowed'):
                raise RuntimeError('ROOT_MANIFEST_WRITE_FAILED')
        root = child_proof(0, 0, [
            ('collector-enumerates-source', lambda: list((work / 'source').iterdir()), True),
            ('collector-reads-source', plain.read_bytes, True),
            ('collector-cannot-write-candidate', lambda: write(plain), False),
            ('collector-cannot-create-other-source-file', lambda: (work / 'source/root-created.txt').write_text('dummy'), False),
            ('collector-writes-only-precreated-manifest-through-real-node-fd', manifest_writer, True),
            ('collector-can-read-evidence', private.read_bytes, True),
        ])
        candidate = child_proof(1000, 1000, [
            ('owner-reads-source', plain.read_bytes, True),
            ('owner-writes-source', lambda: write(plain), True),
            ('owner-cannot-write-root-manifest', lambda: write(manifest), False),
            ('owner-writes-home', lambda: (work / 'home/new.txt').write_text('dummy'), True),
            ('owner-cannot-read-evidence', private.read_bytes, False),
            ('owner-cannot-write-evidence', lambda: write(private), False),
        ])
        outsider = child_proof(1001, 1001, [
            ('nongroup-cannot-enumerate-source', lambda: list((work / 'source').iterdir()), False),
            ('nongroup-cannot-read-source', plain.read_bytes, False),
            ('nongroup-cannot-write-source', lambda: write(plain), False),
        ])
        # Owner1000 can replace names in its directory. The real root collector
        # must reject both symlinks and a root-owned multi-link victim before IO.
        replacement = child_proof(1000, 1000, [
            ('owner-can-replace-manifest-with-symlink', lambda: (manifest.unlink(), manifest.symlink_to(private)), True),
        ])
        symlink = child_proof(0, 0, [('actual-root-writer-rejects-symlink', lambda: manifest_writer('ELOOP'), False)])
        manifest.unlink()
        os.link(private, manifest)
        hardlink = child_proof(0, 0, [('actual-root-writer-rejects-root-owned-hardlink', lambda: manifest_writer('PACKAGE_MANIFEST_FILE_UNTRUSTED'), False)])
        manifest.unlink()
        manifest.write_text('candidate-owned dummy')
        os.chown(manifest, 1000, 0); manifest.chmod(0o660)
        replaced = child_proof(0, 0, [('actual-root-writer-rejects-candidate-owned-replacement', lambda: manifest_writer('PACKAGE_MANIFEST_FILE_UNTRUSTED'), False)])
        if private.read_text() != 'private dummy fixture\n' or manifest.read_text() != 'candidate-owned dummy':
            raise RuntimeError('REJECTED_MANIFEST_VICTIM_CHANGED')
        os.chown(manifest, 0, 0); manifest.chmod(0o640)
        source, retained = work / 'source', work / 'source-retained'
        parent_replacement = child_proof(1000, 1000, [
            ('owner-can-rename-source-and-replace-parent-with-symlink', lambda: (source.rename(retained), source.symlink_to(evidence, target_is_directory=True)), True),
        ])
        parent_link = child_proof(0, 0, [('actual-root-writer-rejects-source-parent-symlink', lambda: manifest_writer(('ELOOP', 'ENOTDIR')), False)])
        source.unlink(); retained.rename(source)
        if private.read_text() != 'private dummy fixture\n':
            raise RuntimeError('PARENT_REPLACEMENT_VICTIM_CHANGED')
        links = base / 'installed-links'
        (links / 'source/node_modules').mkdir(parents=True)
        target, link = links / 'source/library.js', links / 'source/node_modules/library'
        target.write_text('dummy dependency'); target.chmod(0o600)
        link.symlink_to('../library.js')
        try:
            module.chown_copy(links)
            raise RuntimeError('WORK_SOURCE_LINK_ACCEPTED')
        except ValueError as error:
            if str(error) != 'COPY_PERMISSION_ENTRY_INVALID': raise
        row = {'path': 'source/node_modules/library', 'kind': 'symlink', 'linktext': '../library.js', 'resolved': 'source/library.js'}
        workspace_target = links / 'source/packages/shared'
        workspace_link = links / 'source/apps/server/node_modules/@msf/shared'
        workspace_target.mkdir(parents=True); workspace_link.parent.mkdir(parents=True)
        (workspace_target / 'index.js').write_text('dummy workspace package')
        workspace_link.symlink_to('../../../../packages/shared', target_is_directory=True)
        workspace_row = {'path': 'source/apps/server/node_modules/@msf/shared', 'kind': 'symlink',
                         'linktext': '../../../../packages/shared', 'resolved': 'source/packages/shared'}
        hard_dependency = links / 'source/node_modules/hard-library.js'
        os.link(target, hard_dependency)
        hard_row = {'path': 'source/node_modules/hard-library.js', 'kind': 'hardlink',
                    'linktext': 'library.js', 'resolved': 'source/library.js'}
        module.chown_copy(links, [row, workspace_row, hard_row])
        if not link.is_symlink() or os.readlink(link) != '../library.js' or target.stat().st_uid != 1000:
            raise RuntimeError('VERIFIED_PACKAGE_LINK_NOT_PRESERVED')
        if not workspace_link.is_symlink() or workspace_target.stat().st_uid != 1000:
            raise RuntimeError('VERIFIED_WORKSPACE_PACKAGE_LINK_NOT_PRESERVED')
        if target.stat().st_ino != hard_dependency.stat().st_ino or target.stat().st_uid != 1000:
            raise RuntimeError('VERIFIED_DEPENDENCY_HARDLINK_NOT_PRESERVED')
        link.unlink(); link.symlink_to('../../../../outside')
        try:
            module.chown_copy(links, [row])
            raise RuntimeError('ESCAPING_PACKAGE_LINK_ACCEPTED')
        except ValueError as error:
            if str(error) != 'COPY_PACKAGE_LINK_CHANGED': raise
        if stat.S_IMODE(evidence.stat().st_mode) != 0o700 or evidence.stat().st_uid != 0:
            raise RuntimeError('EVIDENCE_BOUNDARY_CHANGED')
        return {'schemaVersion': 1, 'kind': 'project-autonomy-copy-linux-permission-proof',
                'simulated': False, 'productAcceptance': False, 'proofs': [root, candidate, outsider, replacement, symlink, hardlink, replaced, parent_replacement, parent_link],
                'actualCollectorWriterUsed': True, 'verifiedDependencyLinksRetainedWithoutFollowing': True,
                'ordinarySourceLinksRejected': True, 'escapingChangedPackageLinksRejected': True,
                'verifiedPnpmWorkspaceDependencyLinkRetained': True, 'verifiedDependencyHardlinkRetained': True,
                'evidencePrivateMode': '0700',
                'containerStarted': False, 'projectTestsRun': False, 'networkUsed': False}


if __name__ == '__main__':
    if sys.argv[1:2] == ['--linux-proof']:
        import shutil
        node_program = sys.argv[2] if len(sys.argv) == 3 else shutil.which('node')
        if not node_program or len(sys.argv) > 3:
            raise RuntimeError('LINUX_NODE_PROGRAM_REQUIRED')
        print(json.dumps(linux_proof(node_program), sort_keys=True))
    else:
        unittest.main()
