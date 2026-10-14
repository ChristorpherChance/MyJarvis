"""Two exact-AST contextmanager checks; no fixture import, kernel or child code."""
import ast
from contextlib import contextmanager
import errno
import hashlib
from pathlib import Path
import re
import unittest

SOURCE = Path(__file__).with_name('factory-single-entry-bound-method-fixture-r33.py').read_bytes()
assert hashlib.sha256(SOURCE).hexdigest() == '3c97393af43ce6290baa5ca9e1253fcad16c6a62bb2677a9566c534ef4bd0fb8'
TREE = ast.parse(SOURCE)
SELECTED = {'need', 'safe_error', 'Diagnostics', 'preserving_descriptor'}
CONSTANTS = {'SAFE_ERROR', 'READ_SUBPHASES', 'PHASES', 'METHOD_TAGS'}
nodes = []
for node in TREE.body:
    if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in SELECTED:
        nodes.append(node)
    elif isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in CONSTANTS for t in node.targets):
        nodes.append(node)
assert len(nodes) == 8
scope = {'re': re, 'contextmanager': contextmanager}
exec(compile(ast.Module(body=nodes, type_ignores=[]), '<exact-pure-primary-close-nodes>', 'exec'), scope)


class FakeLedger:
    def __init__(self, failures):
        self.failures = failures
        self.attempts = []
        self.failed = []

    def close(self, fd):
        self.attempts.append(fd)
        if fd in self.failures:
            self.failed.append(fd)
            raise self.failures[fd]

    def complete(self):
        return not self.failed


class PrimaryCloseTests(unittest.TestCase):
    def test_read_primary_survives_one_or_two_nested_close_errors_including_fd_zero(self):
        for outer_fails in [False, True]:
            with self.subTest(outer_fails=outer_fails):
                primary = OSError(errno.EACCES, 'controlled-read')
                primary.singleDirentAcquisitionR33 = 'FD_SINGLE_GETDENTS47'
                failures = {0: OSError(errno.EIO, 'controlled-inner-close')}
                if outer_fails:
                    failures[1] = OSError(errno.EBADF, 'controlled-outer-close')
                ledger = FakeLedger(failures)
                diagnostics = scope['Diagnostics']('native')
                diagnostics.enter('CHILD_FD_ADAPTER')
                with self.assertRaises(OSError) as caught:
                    with scope['preserving_descriptor'](ledger, 1, diagnostics):
                        with scope['preserving_descriptor'](ledger, 0, diagnostics):
                            raise primary
                self.assertIs(caught.exception, primary)
                self.assertEqual(caught.exception.errno, errno.EACCES)
                self.assertEqual(diagnostics.first['errno'], errno.EACCES)
                self.assertEqual(diagnostics.first['singleDirentAcquisitionR33'], 'FD_SINGLE_GETDENTS47')
                self.assertEqual(diagnostics.first['fixturePhase'], 'CHILD_FD_ADAPTER')
                self.assertEqual(ledger.attempts, [0, 1])
                self.assertFalse(ledger.complete())
                secondary = [row['errno'] for row in diagnostics.secondary]
                self.assertIn(errno.EIO, secondary)
                if outer_fails:
                    self.assertIn(errno.EBADF, secondary)

    def test_close_only_failure_propagates_first_object_and_attempts_outer_close(self):
        first_close = OSError(errno.EIO, 'controlled-first-close')
        ledger = FakeLedger({0: first_close, 1: OSError(errno.EBADF, 'controlled-second-close')})
        diagnostics = scope['Diagnostics']('build')
        diagnostics.enter('SELF_ADAPTER')
        with self.assertRaises(OSError) as caught:
            with scope['preserving_descriptor'](ledger, 1, diagnostics):
                with scope['preserving_descriptor'](ledger, 0, diagnostics):
                    pass
        self.assertIs(caught.exception, first_close)
        self.assertEqual(diagnostics.first['errno'], errno.EIO)
        self.assertIn(errno.EBADF, [row['errno'] for row in diagnostics.secondary])
        self.assertEqual(ledger.attempts, [0, 1])
        self.assertFalse(ledger.complete())


if __name__ == '__main__':
    unittest.main()
