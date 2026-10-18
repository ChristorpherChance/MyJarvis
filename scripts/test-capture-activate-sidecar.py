"""Pure isolated fixtures: fake runner/clock; no recovery, service or real DB access."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import subprocess
import uuid

spec = importlib.util.spec_from_file_location('sidecar', Path(__file__).with_name('capture-activate-sidecar.py'))
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)


class Clock:
    value = 0
    def __call__(self):
        return self.value


class Fixtures(unittest.TestCase):
    def test_first_error_and_rollback_error_preserve_original_streams(self):
        with tempfile.TemporaryDirectory() as tmp:
            clock = Clock()
            def runner(argv, out, err, timeout, budget, rollback):
                out.write(b'fixture stdout\n')
                err.write(b'fixture stderr\n')
                clock.value += 2
                return {'exitCode': 7 if not rollback else 9, 'timeout': False, 'childEnded': True}
            op = s.Operation(Path(tmp), str(uuid.uuid4()), {'fixture': True}, s.Budget(clock), runner)
            with self.assertRaises(s.Fault):
                op.child('snapshot', ['FAKE_ONLY'], 300, 100)
            first = (op.control / 'first-error.json').read_bytes()
            result = op.rollback(lambda: op.child('rollback-health', ['FAKE_ONLY'], 25, rollback=True))
            self.assertFalse(result['ok'])
            self.assertEqual(first, (op.control / 'first-error.json').read_bytes())
            error = json.loads(first)
            self.assertEqual(error['phase'], 'snapshot')
            self.assertEqual(error['exitCode'], 7)
            for name, b in [('stdout', b'fixture stdout\n'), ('stderr', b'fixture stderr\n')]:
                self.assertEqual(error[name]['sha256'], hashlib.sha256(b).hexdigest())
                self.assertEqual(error[name]['bytes'], len(b))
                self.assertEqual((op.control / ('snapshot.' + name)).read_bytes(), b)
            self.assertEqual((op.control / 'snapshot.stderr').stat().st_mode & 0o777, 0o600)
            self.assertEqual(op.control.stat().st_mode & 0o777, 0o700)

    def test_deadline_dynamic_caps_owned_child_cleanup_and_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            clock = Clock()
            budget = s.Budget(clock)
            self.assertEqual(budget.timeout(300, 100), 300)
            clock.value = 400
            self.assertEqual(budget.timeout(360, 85), 157)
            clock.value = 640
            with self.assertRaises(s.Fault):
                budget.timeout(300, 100)
            self.assertEqual(budget.remaining(True), 260)
            operation_id = str(uuid.uuid4())
            op = s.Operation(Path(tmp), operation_id, {}, budget)
            with self.assertRaises(FileExistsError):
                s.Operation(Path(tmp), operation_id, {}, budget)
            class Child:
                returncode = None
                calls = []
                def wait(self, timeout):
                    self.calls.append(('wait', timeout))
                    if not any(c[0] == 'kill' for c in self.calls):
                        raise subprocess.TimeoutExpired('fake', timeout)
                    self.returncode = -9
                def terminate(self):
                    self.calls.append(('terminate',))
                def kill(self):
                    self.calls.append(('kill',))
            child = Child()
            with patch.object(s.subprocess, 'Popen', return_value=child) as popen:
                result = s.ChildRunner()(['FAKE_ONLY'], None, None, 1, budget, True)
            self.assertTrue(result['childEnded'])
            self.assertTrue(result['timeout'])
            self.assertEqual(popen.call_count, 1)
            self.assertIn(('terminate',), child.calls)
            self.assertIn(('kill',), child.calls)
            self.assertTrue(all(c[1] <= 4 for c in child.calls if c[0] == 'wait'))
            # A separate unended child forbids rollback, not a foreign process kill.
            op.unended = True
            called = []
            self.assertEqual(op.rollback(lambda: called.append(True))['classification'], 'CHILD_NOT_ENDED')
            self.assertEqual(called, [])
            clock.value = 900
            with self.assertRaises(s.Fault):
                budget.timeout(1, rollback=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
