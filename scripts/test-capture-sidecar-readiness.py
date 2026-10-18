"""Only new readiness/receipt fixtures. Never invoke activate/recovery/systemctl/DB."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import uuid

spec = importlib.util.spec_from_file_location('sidecar', Path(__file__).with_name('capture-activate-sidecar.py'))
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)


class Clock:
    def __init__(self):
        self.value = 0
    def __call__(self):
        return self.value
    def sleep(self, seconds):
        self.value += seconds


def pins():
    return {'node': '112', 'release': s.RELEASE, 'expectedCurrent': s.EXPECTED, 'sourceCommit': s.APP, 'archiveSHA256': s.ZIP_HASH, 'manifestSHA256': 'a'*64, 'installSHA256': 'b'*64}


class Readiness(unittest.TestCase):
    def test_normal_and_rollback_not_ready_then_success_keep_first_and_bind_receipts(self):
        for rollback in (False, True):
            with self.subTest(rollback=rollback), tempfile.TemporaryDirectory() as tmp:
                clock = Clock()
                clock.value = 0
                calls = []
                def runner(argv, out, err, timeout, budget, rb):
                    calls.append((argv, timeout, rb))
                    clock.value += 1
                    out.write(b'{"healthy":true}\n' if len(calls) == 2 else b'')
                    err.write(b'' if len(calls) == 2 else b'private not ready detail')
                    return {'childEnded': True, 'timeout': False, 'exitCode': 0 if len(calls) == 2 else 1}
                op = s.Operation(Path(tmp), str(uuid.uuid4()), pins(), s.Budget(clock), runner)
                clock.value = 700 if rollback else 500
                op.binding['inputSHA256'] = hashlib.sha256(b'actual fixture input').hexdigest()
                op.binding['recoverySHA256'] = s.digest(Path(s.__file__).with_name('capture-release-recovery.py'))
                first = None
                if rollback:
                    op.record_failure('snapshot', 'CHILD_EXIT', {'exitCode': 7})
                    first = (op.control/'first-error.json').read_bytes()
                health = op.readiness('rollback-health' if rollback else 'new-health', s.EXPECTED if rollback else s.RELEASE, rollback, clock.sleep)
                self.assertEqual(len(calls), 2)
                self.assertEqual(clock.value, 703 if rollback else 503)
                self.assertTrue(health['healthy'])
                if rollback:
                    op.rollback_health = health
                    self.assertEqual((op.control/'first-error.json').read_bytes(), first)
                    result = op.rollback(lambda: None)
                else:
                    op.health = health
                    self.assertIsNone(op.first)
                    self.assertFalse((op.control/'first-error.json').exists())
                    result = {'attempted': False}
                receipt = op.finalize(not rollback, result)
                self.assertEqual(receipt['inputSHA256'], op.binding['inputSHA256'])
                self.assertEqual(receipt['selfSHA256'], s.digest(Path(s.__file__)))
                self.assertEqual(receipt['sourceCommit'], s.APP)
                self.assertEqual(receipt['archiveSHA256'], s.ZIP_HASH)
                self.assertEqual(receipt['node'], '112')
                self.assertEqual(receipt['prior'], s.EXPECTED)
                self.assertEqual(receipt['snapshot'], None)
                self.assertEqual(receipt['restore'], None)
                self.assertTrue(receipt['rollback']['health']['healthy'] if rollback else receipt['health']['healthy'])
                for row in receipt['logs']:
                    b=(op.control/row['path']).read_bytes()
                    self.assertEqual(len(b), row['bytes'])
                    self.assertEqual(hashlib.sha256(b).hexdigest(), row['sha256'])
                self.assertNotIn('private not ready detail', json.dumps(receipt))
                name='activation-failed.json' if rollback else 'activation.json'
                self.assertEqual(json.loads((op.control/name).read_bytes()), receipt)
                self.assertEqual((op.control/name).stat().st_mode & 0o777, 0o600)

    def test_normal_and_rollback_deadlines_have_no_new_window_and_preserve_first(self):
        for rollback in (False, True):
            with self.subTest(rollback=rollback), tempfile.TemporaryDirectory() as tmp:
                clock=Clock()
                calls=[]
                def runner(argv,out,err,timeout,budget,rb):
                    calls.append(timeout)
                    self.assertLessEqual(timeout, budget.remaining(rb)-s.CLEANUP)
                    clock.value += timeout
                    err.write(b'not ready')
                    return {'exitCode': -9, 'timeout': True, 'childEnded': True}
                budget=s.Budget(clock)
                op=s.Operation(Path(tmp),str(uuid.uuid4()),pins(),budget,runner)
                if rollback:
                    op.record_failure('original', 'CHILD_EXIT')
                clock.value=889 if rollback else 639
                with self.assertRaises(s.Fault):
                    op.readiness('rollback-health' if rollback else 'new-health',s.EXPECTED if rollback else s.RELEASE,rollback,clock.sleep)
                self.assertEqual(calls,[3])
                self.assertLessEqual(clock.value,900 if rollback else 650)
                self.assertEqual(budget.start,0)
                self.assertIsNone(op.health)
                self.assertIsNone(op.rollback_health)
                self.assertEqual(op.first['phase'],'original' if rollback else 'new-health-wait-1')
                self.assertEqual(op.first['classification'],'CHILD_EXIT' if rollback else 'BUDGET_INSUFFICIENT')
                self.assertEqual(s.MIN_DATA,4449810934)
                # A failed timeout cleanup is terminal, not another health probe.
                op.unended=True
                self.assertFalse(op.rollback(lambda: self.fail('must not rollback'))['attempted'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
