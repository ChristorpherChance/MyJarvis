"""Two local controlled checks; no helper load, syscall, Linux traversal or actor."""
from pathlib import Path
import ast
import copy
import hashlib
import importlib.util
import json
from types import SimpleNamespace
import unittest

PATH = Path('scripts/factory-fixed-main-diagnostic-r33.py')
spec = importlib.util.spec_from_file_location('prepared_fixed_main_r33', PATH)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)  # Definitions/constants only; the program has no main or observation call.


class FixedMainDiagnosticTests(unittest.TestCase):
    def test_fixed_request_refuses_before_timer_uid_helper_or_source(self):
        touched = []
        old_signal, old_read = m.signal, m.private_read
        m.signal = SimpleNamespace(getitimer=lambda *_: touched.append('timer'))
        m.private_read = lambda *_: touched.append('helper')
        try:
            for request in [None, {**m.REQUEST, 'extra': True}, {**m.REQUEST, 'schemaVersion': True},
                            {**m.REQUEST, 'source': m.SOURCE + '/child'}]:
                with self.subTest(request=request):
                    with self.assertRaisesRegex(RuntimeError, 'R33_MAIN_DIAG_FIXED_REQUEST_REQUIRED'):
                        m.observe_fixed_main_diagnostic_r33(request)
            self.assertEqual(touched, [])
        finally:
            m.signal, m.private_read = old_signal, old_read

    def test_original_bodies_order_and_integer_hash_remain_exact_and_expectations_are_separate(self):
        raw = Path(m.EXTRACTION_SOURCE['path']).read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), m.EXTRACTION_SOURCE['sha256'])
        base = raw.decode().split('export const r28HostBase=String.raw`', 1)[1].split('`;\nfunction stateProgram(){', 1)[0]
        original = {n.name: ast.get_source_segment(base, n) for n in ast.parse(base).body if isinstance(n, ast.FunctionDef)}
        current = PATH.read_text(encoding='utf-8')
        functions = {n.name: ast.get_source_segment(current, n) for n in ast.parse(current).body if isinstance(n, ast.FunctionDef)}
        for name, expected in m.EXTRACTION_SOURCE['functionSHA256'].items():
            self.assertEqual(functions[name], original[name])
            self.assertEqual(hashlib.sha256(functions[name].encode()).hexdigest(), expected)
        entries = [{'path': 'z', 'sha256': 'b' * 64, 'bytes': 7}, {'path': 'a', 'sha256': 'c' * 64, 'bytes': 9}]
        root = SimpleNamespace(st_dev=66306, st_ino=14417953)
        stats = {0: root, 1: root}
        for fd, size in [(11, 7), (12, 9)]:
            stats[fd] = SimpleNamespace(st_dev=66306, st_ino=900 + fd, st_uid=0, st_gid=0, st_mode=0o100644,
                st_nlink=1, st_size=size, st_mtime_ns=10 ** 20 + fd, st_ctime_ns=10 ** 20 + fd + 1)
        directories = iter([0, 1]); walks = []; closed = []
        old_os, old_h = m.os, getattr(m, 'h', None)
        m.os = SimpleNamespace(fstat=lambda fd: stats[fd], close=lambda fd: closed.append(fd))
        m.h = SimpleNamespace(open_directory=lambda path: next(directories),
            open_relative=lambda fd, path: {'z': 11, 'a': 12}[path],
            walk=lambda fd, out: (walks.append(fd), out.extend(copy.deepcopy(entries))))
        try:
            value, first = m.source_state(m.SOURCE)  # Actual extracted function with exclusively fake objects.
            rows = [[e['path'], *m.key(stats[{'z': 11, 'a': 12}[e['path']]])] for e in entries]
            expected_meta = hashlib.sha256(json.dumps(rows, separators=(',', ':')).encode()).hexdigest()
            self.assertEqual(value['metadataSHA'], expected_meta)
            self.assertEqual(first['manifest'], entries)
            self.assertEqual(walks, [0, 0]); self.assertEqual(closed, [11, 12, 1, 0])
            self.assertEqual(value['identity'], m.EXPECTED['identity'])
        finally:
            m.os = old_os
            if old_h is None:
                del m.h
            else:
                m.h = old_h
        positive = {**copy.deepcopy(m.EXPECTED), 'bytes': 16, 'stable': True}
        self.assertTrue(all(m.expected_matches(positive).values()))
        for field, label, wrong in [('sha256', 'fingerprint', '0' * 64), ('files', 'files', 592),
                                   ('metadataSHA', 'metadata', '0' * 64), ('identity', 'rootIdentity', {'device': 66306, 'inode': 1})]:
            changed = copy.deepcopy(positive); changed[field] = wrong
            self.assertEqual(m.expected_matches(changed), {key: key != label for key in m.expected_matches(positive)})
        self.assertNotIn('independent_metadata', functions)


if __name__ == '__main__':
    unittest.main(verbosity=2)
