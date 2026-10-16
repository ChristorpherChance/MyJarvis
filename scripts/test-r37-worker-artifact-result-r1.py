"""One bounded AST/mock group; no worker entry, filesystem or framework execution."""
import ast
import contextlib
import copy
import hashlib
import json
import re
import stat
import unittest
from pathlib import Path
from types import SimpleNamespace


SOURCE = Path(__file__).with_name('factory-pg4-qa-startup-worker-r37-artifact-result-r1.py')
RAW = SOURCE.read_bytes()
TREE = ast.parse(RAW)
NAMES = {'need', 'sha', 'key', 'error_frame', 'descriptor', 'read_evidence',
         'retain_reports', 'remember_worker_failure', 'safe_driver_failure',
         'structured_driver_result', 'run_driver_with_after_hooks'}
NODES = [n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name in NAMES]
assert len(NODES) == len(NAMES)


class HeldEvidenceOS:
    """Synthetic descriptors only. Actual read_evidence enforces the trust gates."""
    O_RDONLY = O_DIRECTORY = O_NOFOLLOW = O_CLOEXEC = O_NONBLOCK = 0
    SEEK_SET = 0

    def __init__(self, raw, bad_identity=False, drift=False, close_error=False):
        self.raw, self.offset, self.closed = raw, 0, []
        self.bad_identity, self.drift, self.close_error = bad_identity, drift, close_error
        self.directory = self.info(stat.S_IFDIR | 0o700, 1000, 1000, 0, 20)
        self.file = self.info(stat.S_IFREG | 0o600, 0 if bad_identity else 1000,
                              1000, len(raw), 30)
        self.stat_reads = 0

    @staticmethod
    def info(mode, uid, gid, size, ino):
        return SimpleNamespace(st_dev=7, st_ino=ino, st_uid=uid, st_gid=gid,
                               st_mode=mode, st_nlink=1, st_size=size,
                               st_mtime_ns=90071992547409931,
                               st_ctime_ns=90071992547409933)

    def stat(self, name, dir_fd, follow_symlinks=False):
        assert follow_symlinks is False
        if name == 'evidence':
            assert dir_fd == 10
            return self.directory
        assert name == 'pg4-driver-result.json' and dir_fd == 20
        self.stat_reads += 1
        if self.drift and self.stat_reads > 1:
            changed = copy.copy(self.file)
            changed.st_mtime_ns += 1
            return changed
        return self.file

    def open(self, name, flags, dir_fd):
        return 20 if name == 'evidence' else 30

    def fstat(self, fd):
        return self.directory if fd == 20 else self.file

    def read(self, fd, count):
        assert fd == 30
        value = self.raw[self.offset:self.offset + count]
        self.offset += len(value)
        return value

    def lseek(self, fd, offset, whence):
        assert (fd, offset, whence) == (30, 0, 0)
        self.offset = 0

    def close(self, fd):
        self.closed.append(fd)
        if self.close_error and fd == 30:
            raise RuntimeError('PG4_R33_CONTROLLED_REPORT_CLOSE_FAILED')


def namespace():
    ns = {'json': json, 'hashlib': hashlib, 're': re, 'stat': stat,
          'Path': Path, 'contextlib': contextlib,
          'PROTOCOL': 'PG4_QA_STARTUP_R33_V1', 'ROOT': Path('/synthetic/attempt'),
          'ACTIVE': {'attempt': 'a' * 32, 'sourceContractSHA256': 'b' * 64,
                     'driverSHA256': 'c' * 64}}
    exec(compile(ast.Module(body=NODES, type_ignores=[]), str(SOURCE), 'exec'), ns)
    return ns


def result_value():
    return {'kind': 'r33-pg4-qa-startup-driver-result', 'protocol': 'PG4_QA_STARTUP_R33_V1',
            'diagnosticVersion': 'r37-first-error-retention-v1', 'attempt': 'a' * 32,
            'sourceContractSHA256': 'b' * 64, 'driverSHA256': 'c' * 64,
            'status': 'framework-finished', 'preFixtureGateVerified': True,
            'frameworkExecuted': True, 'fixtureLaunchAttempted': True,
            'startsAttempted': 1, 'actualStartupObserved': True,
            'firstFailure': None, 'privateFailure': None,
            'codeExecuted': None, 'PG4Qualified': False, 'productAccepted': False}


def exercise(value=None, *, code=0, raw_override=None, missing=False,
             drift=False, retention_close=False, retained_change=False,
             after_error=False, tool_error=False):
    ns = namespace()
    ns['STATE'] = {'firstFailure': None, 'secondaryFailures': [], 'captures': []}
    raw = raw_override if raw_override is not None else json.dumps(
        result_value() if value is None else value, separators=(',', ':')).encode()
    # Both metadata values are original Python integers beyond the JS safe range.
    metadata = [7, 30, 1000, 1000, stat.S_IFREG | 0o600, 1, len(raw),
                90071992547409931, 90071992547409933]
    stored, calls = {}, {'driver_reads': 0, 'sql': 0, 'diagnostic_stdout': 0}

    def tool(*args):
        if tool_error:
            raise RuntimeError('PG4_R33_COMMAND_TIMEOUT')
        calls['diagnostic_stdout'] += 1
        # Deliberately not JSON, with a JSON-looking tail: never an input protocol.
        return code, b'synthetic diagnostic prefix\n{"untrustedTail":true}', b'diagnostic stderr', {
            'path': 'synthetic-capture', 'sha256': 'd' * 64, 'bytes': 1}

    def read_evidence(name):
        if name != 'pg4-driver-result.json':
            return b'{}', [7, 31, 1000, 1000, stat.S_IFREG | 0o600, 1, 2, 1, 1]
        calls['driver_reads'] += 1
        if missing:
            raise FileNotFoundError()
        changed = metadata[:]
        if drift and calls['driver_reads'] > 1:
            changed[-1] += 1
        return raw, changed

    def store(path, data, mode):
        assert mode == 0o444
        if retention_close and path.name == 'retained-pg4-driver-result.json':
            raise RuntimeError('PG4_R33_CONTROLLED_RETENTION_CLOSE_FAILED')
        assert path not in stored
        stored[path] = data
        return {'path': str(path), 'sha256': ns['sha'](data), 'bytes': len(data)}

    def read_root(path, limit, immutable):
        assert immutable is True and limit == 16 * 1024**2
        data = stored[path]
        return data + b' ' if retained_change else data

    def after(*args):
        calls['sql'] += 1
        if after_error:
            raise RuntimeError('PG4_R33_CONTROLLED_AFTER_SQL_FAILED')

    ns.update(tool_exec=tool, read_evidence=read_evidence, store=store,
              read_root=read_root, save_state=lambda: None, sql_phase=after,
              private_worker_first_error=lambda *args: {'path': 'synthetic-private-error',
                                                       'sha256': 'e' * 64, 'bytes': 1})
    outcome = ns['run_driver_with_after_hooks']()
    assert calls['sql'] == 1
    return outcome, ns['STATE'], calls


class ArtifactResultTargeted(unittest.TestCase):
    def test_artifact_channel_retention_and_first_error(self):
        # Exercise the unchanged real descriptor/metadata checks with synthetic OS.
        ns = namespace()
        for bad_identity, drift, close_error in [(False, False, False),
                                                  (True, False, False),
                                                  (False, True, False),
                                                  (False, False, True)]:
            mock = HeldEvidenceOS(b'{"synthetic":true}', bad_identity, drift, close_error)
            ns.update(os=mock, held_dir=lambda path: 10)
            if not any([bad_identity, drift, close_error]):
                raw, metadata = ns['read_evidence']('pg4-driver-result.json')
                self.assertEqual(raw, mock.raw)
                self.assertEqual(metadata[-1], 90071992547409933)
            else:
                with self.assertRaises(RuntimeError):
                    ns['read_evidence']('pg4-driver-result.json')
            self.assertEqual(sorted(mock.closed), [10, 20, 30])

        ok, state, calls = exercise()
        self.assertTrue(ok)
        self.assertIsNone(state['firstFailure'])
        self.assertEqual(calls['driver_reads'], 2)
        self.assertIn('stdoutSHA256', state['driver'])
        # No reportRetentionVerified flag in the body; actual retention is required.
        self.assertNotIn('reportRetentionVerified', result_value())
        for options in [dict(missing=True), dict(drift=True), dict(code=1),
                        dict(raw_override=b'not-json'), dict(retention_close=True),
                        dict(retained_change=True), dict(tool_error=True)]:
            with self.subTest(boundary=next(iter(options))):
                ok, state, _ = exercise(**options)
                self.assertFalse(ok)
                self.assertIsNotNone(state['firstFailure'])
        for field in ['attempt', 'sourceContractSHA256', 'driverSHA256',
                      'protocol', 'kind', 'diagnosticVersion']:
            changed = result_value()
            changed[field] = 'wrong'
            self.assertFalse(exercise(changed)[0])
        forged_retention = result_value()
        forged_retention['reportRetentionVerified'] = True
        self.assertFalse(exercise(forged_retention, retention_close=True)[0])
        incomplete = result_value()
        incomplete.update(status='incomplete', privateFailure={'synthetic': True},
                          firstFailure={'phase': 'fixture-start', 'errorClass': 'Error',
                                        'errno': None, 'nodeCode': None,
                                        'closedErrorCode': 'R33_CONTROLLED_DRIVER_PRIMARY'})
        ok, state, _ = exercise(incomplete, retention_close=True, after_error=True)
        self.assertFalse(ok)
        self.assertEqual(state['firstFailure']['errorCode'], 'R33_CONTROLLED_DRIVER_PRIMARY')
        self.assertEqual(state['firstFailure']['origin'], 'source-bound-driver')
        self.assertTrue(state['firstFailure']['driverInputBindingVerified'])
        self.assertEqual([x['errorCode'] for x in state['secondaryFailures']],
                         ['PG4_R33_DRIVER_REPORT_RETENTION_UNCONFIRMED',
                          'PG4_R33_CONTROLLED_AFTER_SQL_FAILED'])
        ok, state, _ = exercise(incomplete)
        self.assertFalse(ok)
        self.assertIsNotNone(state['firstFailure']['privateDriverReport'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
