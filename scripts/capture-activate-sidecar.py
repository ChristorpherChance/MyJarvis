"""112 activate-only candidate. No stage/install, retries, or live-data restore.
Root supplies a fresh UUID and a complete pinned input JSON. Import has no effects.
"""
import argparse
import ast
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import time
import uuid

EXPECTED = '20261018-project-goals-r48'
RELEASE = '20261018-project-goals-r48-r2'
APP = '6d8504fab6c727550ba409425c8ef0bffc68a738'
ZIP_HASH = 'e0495dc61b879d89c1a09b388c57de01e7d7c54d7291f0f3c1d4cd84704dac40'
MANAGED_HASH = '38d1572ed71b07c881083f4c7fd50fd6167fa2c3ec8e52f8982b6ecf415e5504'
RECOVERY_HASH = '1f74cb9fea17d5f3a964675fc2909e79bbf5d00b65a59146af9eb1e86d128179'
MIN_DATA = 4449810934
CLEANUP = 8


def need(ok, code):
    if not ok:
        raise Fault(code)


class Fault(Exception):
    def __init__(self, code, phase=None):
        super().__init__(code)
        self.code, self.phase = code, phase


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for b in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()


def syncdir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def wx(path, value):
    b = value if isinstance(value, bytes) else encoded(value)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(b)
        stream.flush()
        os.fsync(stream.fileno())
    syncdir(path.parent)


def safe(path, directory=False, private=False):
    need(path.is_absolute(), 'ABSOLUTE_REQUIRED')
    for p in [*reversed(path.parents), path]:
        s = p.lstat()
        need(not stat.S_ISLNK(s.st_mode) and s.st_uid == 0 and not s.st_mode & 0o022, 'UNSAFE_PATH')
    s = path.lstat()
    need(stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode) and s.st_nlink == 1, 'UNSAFE_TYPE')
    if private:
        need(stat.S_IMODE(s.st_mode) == (0o700 if directory else 0o600), 'PRIVATE_MODE')


class Budget:
    def __init__(self, clock=time.monotonic):
        self.clock, self.start = clock, clock()

    def remaining(self, rollback=False):
        return max(0.0, (900 if rollback else 650) - (self.clock() - self.start))

    def timeout(self, cap, tail=0, rollback=False):
        chosen = min(cap, self.remaining(rollback) - tail - CLEANUP)
        need(chosen >= 1, 'BUDGET_INSUFFICIENT')
        return chosen


class ChildRunner:
    """Only this Popen object is signalled; no PID search, group scan or foreign kill."""
    def __call__(self, argv, out, err, timeout, budget, rollback):
        child = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=out, stderr=err)
        timed_out, ended = False, False
        try:
            child.wait(timeout=timeout)
            ended = True
        except subprocess.TimeoutExpired:
            timed_out = True
            child.terminate()
            try:
                child.wait(timeout=min(3, max(.01, budget.remaining(rollback) - 2)))
                ended = True
            except subprocess.TimeoutExpired:
                child.kill()
                try:
                    child.wait(timeout=min(4, max(.01, budget.remaining(rollback))))
                    ended = True
                except subprocess.TimeoutExpired:
                    pass
        return {'exitCode': child.returncode, 'timeout': timed_out, 'childEnded': ended}


class Operation:
    def __init__(self, parent, operation_id, pins, budget=None, runner=None):
        need(str(uuid.UUID(operation_id)) == operation_id, 'UUID_INVALID')
        self.control = parent / ('capture-activate-sidecar-' + operation_id)
        self.control.mkdir(mode=0o700)  # exclusive once: an old operation is never resumed
        os.chmod(self.control, 0o700)
        syncdir(parent)
        self.budget, self.runner = budget or Budget(), runner or ChildRunner()
        self.first, self.unended, self.stopped = None, False, False
        wx(self.control / 'operation.json', {'operationId': operation_id, 'pins': pins})

    def record_failure(self, phase, code, details=None):
        value = {'phase': phase, 'classification': code, **(details or {})}
        if self.first is None:
            self.first = value
            wx(self.control / 'first-error.json', value)
        return value

    def phase(self, name, action, cap=10, tail=0, rollback=False):
        start = self.budget.clock()
        try:
            timeout = self.budget.timeout(cap, tail, rollback)
        except Fault:
            self.record_failure(name, 'BUDGET_INSUFFICIENT')
            raise
        timing = {'elapsed': start - self.budget.start, 'remaining': self.budget.remaining(rollback), 'selectedTimeout': timeout, 'rollback': rollback}
        wx(self.control / (name + '-intent.json'), timing)
        try:
            result = action(timeout)
            need(self.budget.remaining(rollback) >= CLEANUP, 'BUDGET_EXHAUSTED')
            wx(self.control / (name + '-result.json'), {**timing, 'duration': self.budget.clock() - start, 'ok': True})
            return result
        except Exception as e:
            code = e.code if isinstance(e, Fault) else 'PHASE_EXCEPTION'
            # Exception text is private; public records never interpolate it.
            wx(self.control / (name + '-exception.txt'), str(e).encode('utf-8', errors='replace'))
            self.record_failure(name, code)
            raise Fault(code, name) from None

    def child(self, name, argv, cap, tail=0, rollback=False):
        def run(timeout):
            paths = [self.control / (name + suffix) for suffix in ('.stdout', '.stderr')]
            streams = []
            try:
                for path in paths:
                    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                    streams.append(os.fdopen(fd, 'wb'))
                syncdir(self.control)
                start = self.budget.clock()
                try:
                    value = self.runner(argv, *streams, timeout, self.budget, rollback)
                except Exception:
                    # Unknown spawn/wait state is never permission to switch or roll back.
                    value = {'exitCode': None, 'timeout': False, 'childEnded': False}
                self.unended = not value['childEnded']
                for stream in streams:
                    stream.flush()
                    os.fsync(stream.fileno())
                record = {**value, 'duration': self.budget.clock() - start, 'stdout': {'bytes': paths[0].stat().st_size, 'sha256': digest(paths[0])}, 'stderr': {'bytes': paths[1].stat().st_size, 'sha256': digest(paths[1])}}
                wx(self.control / (name + '-child.json'), record)
                if self.unended or value['timeout'] or value['exitCode'] != 0:
                    code = 'CHILD_NOT_ENDED' if self.unended else 'CHILD_TIMEOUT' if value['timeout'] else 'CHILD_EXIT'
                    self.record_failure(name, code, record)
                    raise Fault(code)
                return paths[0]
            finally:
                for stream in streams:
                    stream.close()
        return self.phase(name, run, cap, tail, rollback)

    def rollback(self, action):
        if self.unended:
            result = {'attempted': False, 'classification': 'CHILD_NOT_ENDED'}
        else:
            try:
                action()
                result = {'attempted': True, 'ok': True}
            except Exception as e:
                result = {'attempted': True, 'ok': False, 'classification': e.code if isinstance(e, Fault) else 'ROLLBACK_EXCEPTION'}
        wx(self.control / 'rollback.json', result)
        return result


# Trusted, fixed child programs. They never return configuration secrets.
HEALTH = r'''
import json,ssl,urllib.request,subprocess,sys
from pathlib import Path
release=sys.argv[1];config=json.loads(Path('/etc/jarvis/node.json').read_bytes())
assert config['role']=='primary' and config['release']==release
assert Path('/opt/jarvis/current').resolve().name==release
for unit in ['jarvis-platform.service','jarvis-observer.service']:
 r=subprocess.run(['systemctl','is-active',unit],capture_output=True,timeout=4);assert r.stdout.strip()==b'active'
c=ssl.create_default_context(cafile='/etc/jarvis/tls/ca.crt')
r=urllib.request.Request('https://127.0.0.1:3141/status',headers={'x-jarvis-node-token':config['observerToken']})
with urllib.request.urlopen(r,context=c,timeout=4) as f:o=json.load(f)
assert o.get('build')==release and o.get('businessHealthy') is True
with urllib.request.urlopen('https://127.0.0.1:3140/api/health',context=c,timeout=4) as f:h=json.load(f)
assert h.get('build')==release and h.get('status')=='ok'
print('{"healthy":true}')
'''
DRAIN = r'''
import sqlite3
c=sqlite3.connect('file:/var/lib/jarvis/data/jarvis.db?mode=ro',uri=True,timeout=4)
try:
 tables={r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
 if 'runtime_ai_runs' in tables:assert c.execute("SELECT COUNT(*) FROM runtime_ai_runs WHERE state='active'").fetchone()[0]==0
 if 'runtime_voice_jobs' in tables:assert c.execute("SELECT COUNT(*) FROM runtime_voice_jobs WHERE status IN ('queued','running')").fetchone()[0]==0
finally:c.close()
'''
SPACE = r'''
import os,stat,json,shutil
from pathlib import Path
root=Path('/var/lib/jarvis/data');total=0
for directory,dirs,files in os.walk(root,followlinks=False):
 for name in dirs+files:
  p=Path(directory)/name;s=p.lstat();assert not stat.S_ISLNK(s.st_mode)
  if stat.S_ISREG(s.st_mode):assert s.st_nlink==1;total+=s.st_size
  else:assert stat.S_ISDIR(s.st_mode)
required=2*max(4449810934,total)+1073741824
free=shutil.disk_usage('/var/lib/jarvis-control').free
assert free>=required
print(json.dumps({'sourceMetadataBytes':total,'requiredFreeBytes':required,'freeBytes':free}))
'''


def switch(target, operation_id):
    current = Path('/opt/jarvis/current')
    temp = current.with_name('current.sidecar-' + operation_id)
    need(not temp.exists() and not temp.is_symlink(), 'TEMP_EXISTS')
    temp.symlink_to(target)
    os.replace(temp, current)
    syncdir(current.parent)


def config_write(path, data, mode, operation_id):
    temp = path.with_name('node.sidecar-' + operation_id + '.json')
    wx(temp, data)
    os.chmod(temp, mode)
    os.replace(temp, path)
    syncdir(path.parent)


def activate(pins, operation_id):
    need(os.geteuid() == 0, 'ROOT_REQUIRED')
    need(set(pins) == {'node', 'release', 'expectedCurrent', 'sourceCommit', 'archiveSHA256', 'manifestSHA256', 'installSHA256', 'configSHA256', 'managedPath', 'recoveryPath'}, 'INPUT_KEYS')
    need(pins['node'] == '112' and pins['release'] == RELEASE and pins['expectedCurrent'] == EXPECTED and pins['sourceCommit'] == APP and pins['archiveSHA256'] == ZIP_HASH, 'INPUT_BINDING')
    for key in ['manifestSHA256', 'installSHA256', 'configSHA256']:
        need(isinstance(pins[key], str) and len(pins[key]) == 64 and all(c in '0123456789abcdef' for c in pins[key]), 'PIN_INVALID')
    parent = Path('/var/lib/jarvis-control')
    safe(parent, directory=True)
    fd = os.open(parent / 'capture-activate.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        s = os.fstat(fd)
        need(stat.S_ISREG(s.st_mode) and s.st_uid == 0 and s.st_nlink == 1 and stat.S_IMODE(s.st_mode) == 0o600, 'UNSAFE_LOCK')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        op = Operation(parent, operation_id, pins)
        base = Path('/opt/jarvis/releases') / RELEASE
        config_path = Path('/etc/jarvis/node.json')
        prior = Path('/opt/jarvis/releases') / EXPECTED
        safe(prior, directory=True)
        safe(config_path)
        old, mode = config_path.read_bytes(), stat.S_IMODE(config_path.stat().st_mode)
        need(hashlib.sha256(old).hexdigest() == pins['configSHA256'], 'CONFIG_PIN')
        config = json.loads(old)
        need(config['release'] == EXPECTED and config['role'] == 'primary' and Path('/opt/jarvis/current').resolve() == prior, 'CURRENT_BINDING')
        wx(op.control / 'node-before.json', old)
        wx(op.control / 'previous-release.txt', str(prior).encode())
        try:
            managed, recovery = Path(pins['managedPath']), Path(pins['recoveryPath'])
            for path, expected in [(managed, MANAGED_HASH), (recovery, RECOVERY_HASH)]:
                safe(path)
                need(digest(path) == expected, 'TOOL_PIN')
            # Reuse the original complete manifest verifier, extracted as data, not its CLI.
            tree = ast.parse(managed.read_text())
            common = next(n.value.value for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'common' for t in n.targets))
            common = common.replace('signal.alarm(900)', '')
            verify = "p=" + repr({'release': RELEASE, 'node': '112'}) + '\n' + common + '\nmanifest_verify()\n'
            op.child('manifest-verify', ['python3', '-I', '-c', verify], 40, 130)
            for name, key in [('release-manifest.json', 'manifestSHA256'), ('.capture-install.json', 'installSHA256')]:
                safe(base / name)
                need(digest(base / name) == pins[key], 'CANDIDATE_PIN')
            manifest = json.loads((base / 'release-manifest.json').read_bytes())
            need(manifest['sourceCommit'] == APP and manifest['archiveVersion'] == RELEASE and manifest['runtimeBuild'] == RELEASE, 'SOURCE_PIN')
            safe(base / '.managed-release.sha256')
            need((base / '.managed-release.sha256').read_text().strip() == ZIP_HASH, 'ARCHIVE_PIN')
            receipt = json.loads((base / '.capture-install.json').read_bytes())
            need(receipt.get('node') == '112' and receipt.get('release') == RELEASE and receipt.get('installed') is True and receipt.get('lifecycleScriptsExecuted') is False and receipt.get('manifestStillMatches') is True and receipt.get('businessServiceChanged') is False and receipt.get('lockfileSha256') == digest(base / 'package-lock.json'), 'INSTALL_RECEIPT')
            op.child('old-health', ['python3', '-I', '-c', HEALTH, EXPECTED], 25, 110)
            op.child('drain', ['python3', '-I', '-c', DRAIN], 10, 100)
            op.child('space', ['python3', '-I', '-c', SPACE], 25, 100)
            # Budget preflight before any stop request. Stop may have taken effect even on error.
            op.phase('stop-budget-preflight', lambda _timeout: None, 1, 100)
            op.stopped = True
            for unit in ['jarvis-observer.service', 'jarvis-platform.service']:
                op.child('stop-' + unit, ['systemctl', 'stop', unit], 30, 80)
            op.phase('snapshot-tool-pin', lambda _timeout: need(digest(recovery) == RECOVERY_HASH, 'TOOL_PIN'), 2, 100)
            snapshot = op.child('snapshot', ['python3', '-I', str(recovery), 'snapshot', '--source', '/var/lib/jarvis/data', '--snapshot', str(op.control / 'data-snapshot'), '--release', RELEASE, '--scope', 'primary'], 300, 100)
            snap = json.loads(snapshot.read_bytes())
            need(snap.get('status') == 'passed' and snap.get('completeTreeVerified') is True and snap.get('sqliteIntegrity') == 'ok' and snap.get('operation') == 'snapshot-created', 'SNAPSHOT_INVALID')
            op.phase('restore-tool-pin', lambda _timeout: need(digest(recovery) == RECOVERY_HASH, 'TOOL_PIN'), 2, 85)
            restored = op.child('restore', ['python3', '-I', str(recovery), 'restore', '--snapshot', str(op.control / 'data-snapshot'), '--target', str(op.control / 'restored-check'), '--expect-manifest-sha256', snap['manifestSha256'], '--release', RELEASE], 360, 85)
            restored = json.loads(restored.read_bytes())
            need(restored.get('status') == 'passed' and restored.get('completeTreeVerified') is True and restored.get('sqliteIntegrity') == 'ok' and restored.get('operation') == 'isolated-restore-verified' and restored.get('manifestSha256') == snap['manifestSha256'], 'RESTORE_INVALID')
            def change(_timeout):
                need(digest(config_path) == pins['configSHA256'] and Path('/opt/jarvis/current').resolve() == prior, 'CURRENT_CHANGED')
                config_write(config_path, encoded({**config, 'release': RELEASE}), mode, operation_id)
                switch(base, operation_id)
            op.phase('switch', change, 5, 75)
            for unit in ['jarvis-platform.service', 'jarvis-observer.service']:
                op.child('start-' + unit, ['systemctl', 'start', unit], 25, 30)
            op.child('new-health', ['python3', '-I', '-c', HEALTH, RELEASE], 25)
            wx(op.control / 'activation.json', {'ok': True, 'snapshot': snap, 'restore': restored, 'liveDataRestored': False})
            return {'ok': True, 'operationId': operation_id}
        except Exception as e:
            op.record_failure(getattr(e, 'phase', None) or 'validation', e.code if isinstance(e, Fault) else 'ACTIVATION_EXCEPTION')
            def rollback():
                for unit in ['jarvis-observer.service', 'jarvis-platform.service']:
                    op.child('rollback-stop-' + unit, ['systemctl', 'stop', unit], 25, 100, True)
                def revert(_timeout):
                    config_write(config_path, old, mode, operation_id + '-rollback')
                    switch(prior, operation_id + '-rollback')
                op.phase('rollback-switch', revert, 5, 85, True)
                for unit in ['jarvis-platform.service', 'jarvis-observer.service']:
                    op.child('rollback-start-' + unit, ['systemctl', 'start', unit], 25, 30, True)
                op.child('rollback-health', ['python3', '-I', '-c', HEALTH, EXPECTED], 25, rollback=True)
            result = op.rollback(rollback) if op.stopped else {'attempted': False, 'reason': 'NOT_STOPPED'}
            if not op.stopped:
                wx(op.control / 'rollback.json', result)
            return {'ok': False, 'operationId': operation_id, 'firstError': op.first, 'rollback': result, 'liveDataRestored': False}
    finally:
        os.close(fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--operation-id', required=True)
    parser.add_argument('--input', required=True)
    parser.add_argument('--input-sha256', required=True)
    args = parser.parse_args()
    try:
        path = Path(args.input)
        safe(path, private=True)
        need(digest(path) == args.input_sha256, 'INPUT_PIN')
        result = activate(json.loads(path.read_bytes()), args.operation_id)
    except Exception as e:
        result = {'ok': False, 'classification': e.code if isinstance(e, Fault) else 'SIDECAR_PREFLIGHT_FAILED'}
    print(json.dumps(result, separators=(',', ':')))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
