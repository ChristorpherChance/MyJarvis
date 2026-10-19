#!/usr/bin/env python3
"""Keep exactly two complete Jarvis snapshot payloads; remove completed restores.

Linux root maintenance, default --check. Never deletes captures, receipts,
manifests, releases, pre-* or live data. No service operations or model calls.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import time
import types

sys.dont_write_bytecode = True
CONTROL = Path('/var/lib/jarvis-control')
GUARD_SHA256 = '88cda2b6ff1a7cf73aedaee85d27da4b4af7db51b8a3bdf00f0b5fb752294124'
STOP = None


class MaintenanceError(Exception):
    pass


def need(value, code):
    if not value:
        raise MaintenanceError(code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def inside(path, parent):
    return path == parent or parent in path.parents


def overlap(left, right):
    return inside(left, right) or inside(right, left)


def signature(info):
    return [info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns]


def trusted_bytes(path, limit=1024 * 1024):
    path = Path(path)
    need(path.is_absolute() and '..' not in path.parts, 'TRUSTED_PATH_INVALID')
    for item in [*reversed(path.parents), path]:
        info = item.lstat()
        need(info.st_uid == 0 and not info.st_mode & 0o022 and not stat.S_ISLNK(info.st_mode), 'TRUSTED_PATH_UNSAFE')
        if item != path:
            need(stat.S_ISDIR(info.st_mode), 'TRUSTED_PARENT_INVALID')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size <= limit, 'TRUSTED_FILE_INVALID')
        chunks, count = [], 0
        while count <= limit:
            chunk = os.read(fd, min(262144, limit + 1 - count))
            if not chunk:
                break
            count += len(chunk)
            chunks.append(chunk)
        need(count <= limit and signature(before) == signature(os.fstat(fd)) == signature(path.lstat()), 'TRUSTED_FILE_CHANGED')
        return b''.join(chunks)
    finally:
        os.close(fd)


def load_guard(path):
    raw = trusted_bytes(path)
    need(sha(raw) == GUARD_SHA256, 'GUARD_PIN_MISMATCH')
    module = types.ModuleType('jarvis_backup_retention_frozen')
    module.__file__ = str(path)
    # Execute precisely the SHA-verified bytes; do not reopen a mutable path.
    exec(compile(raw, str(path), 'exec'), module.__dict__)
    return module


def checked_policy(path):
    if path is None:
        return None
    raw = trusted_bytes(path, 65536)
    value = json.loads(raw)
    need(value == {'schemaVersion': 1, 'keepCompleteSnapshots': 2,
                   'removeCompletedRestoredChecks': True, 'controlRoot': str(CONTROL),
                   'deletePreBackups': False, 'deleteReleases': False}, 'POLICY_CONTRACT_INVALID')
    return sha(raw)


def capture_namespace(guard):
    """Detect new/removed captures, including one with no manifest yet."""
    result = []
    for item in sorted(CONTROL.iterdir()):
        if not guard.CAPTURE.fullmatch(item.name):
            continue
        path = guard.real_path(item, 0, True)
        info = path.lstat()
        result.append([item.name, info.st_dev, info.st_ino, info.st_uid, stat.S_IMODE(info.st_mode)])
    return result


def kept_binding(selection):
    return [[row['capture'], row['manifestSHA256'], row['terminalSHA256']] for row in selection['kept']]


def build_plan(guard, selection):
    candidates = []
    for row in [*selection['kept'], *selection['older']]:
        capture = Path(row['capture'])
        if row in selection['older']:
            candidates.append({'path': row['payload'], 'capture': row['capture'], 'kind': 'old-snapshot-payload'})
        restore = capture / 'restored-check'
        if restore.exists() or restore.is_symlink():
            candidates.append({'path': str(restore), 'capture': row['capture'], 'kind': 'completed-restored-check'})
    # Older complete receipts whose payload was already removed still justify
    # deleting their completed isolated restore copy. Unknown terminals do not.
    known = {row['capture'] for row in [*selection['kept'], *selection['older']]}
    for item in sorted(CONTROL.iterdir()):
        if not guard.CAPTURE.fullmatch(item.name) or str(item) in known or str(item) in selection['protected']:
            continue
        row = guard.metadata_capture(item)
        restore = item / 'restored-check'
        if restore.exists() or restore.is_symlink():
            candidates.append({'path': str(restore), 'capture': str(item), 'kind': 'completed-restored-check'})
    need(len({row['path'] for row in candidates}) == len(candidates), 'DUPLICATE_CANDIDATE')
    return candidates


def validate_candidate(guard, row, kept_paths, dependencies):
    capture, path = Path(row['capture']), Path(row['path'])
    need(capture.parent == CONTROL and guard.CAPTURE.fullmatch(capture.name), 'CANDIDATE_CAPTURE_INVALID')
    allowed = capture / ('data-snapshot/payload' if row['kind'] == 'old-snapshot-payload' else 'restored-check')
    need(row['kind'] in ('old-snapshot-payload', 'completed-restored-check') and path == allowed, 'CANDIDATE_SCOPE_INVALID')
    need(not any(overlap(path, item) for item in [*kept_paths, *dependencies]), 'PROTECTED_DEPENDENCY')
    guard.metadata_capture(capture)
    path = guard.real_path(path, 0, True)
    need(path.lstat().st_dev == CONTROL.lstat().st_dev, 'CANDIDATE_DEVICE_INVALID')
    proof = guard.guard_tree(path, uid=0)
    refs = guard.references([str(capture), str(path)])
    return proof, refs


def safe_remove(guard, path, expected):
    """The only deletion primitive: exact guarded root, fd-safe stdlib walker."""
    need(shutil.rmtree.avoids_symlink_attacks, 'FD_SAFE_RMTREE_REQUIRED')
    path = Path(path)
    guard.real_path(path.parent, 0, True)
    parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    target = None
    try:
        target = os.open(path.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        before = os.fstat(target)
        need(signature(before) == expected == signature(os.stat(path.name, dir_fd=parent, follow_symlinks=False)), 'CANDIDATE_CHANGED_BEFORE_REMOVE')
        shutil.rmtree(path.name, dir_fd=parent)
        try:
            os.stat(path.name, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            return
        raise MaintenanceError('CANDIDATE_STILL_PRESENT')
    finally:
        if target is not None:
            os.close(target)
        os.close(parent)


def stop_handler(number, frame):
    global STOP
    if STOP is None:
        STOP = number


def stopped():
    need(STOP is None, 'STOP_REQUESTED')


def verify_in_worker(script, guard_path, capture, timeout):
    """Own process group; SSH/systemd stop cannot orphan a long verifier."""
    child = subprocess.Popen([sys.executable, '-I', str(script), '--guard-module', str(guard_path),
                              '--verify-worker', str(capture)], stdin=subprocess.DEVNULL,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True,
                             env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8'})
    deadline, stopping_deadline, sent_stop = time.monotonic() + timeout, None, False
    try:
        while True:
            if (STOP is not None or time.monotonic() >= deadline) and not sent_stop:
                sent_stop = True
                stopping_deadline = time.monotonic() + 8
                try:
                    os.killpg(child.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            if stopping_deadline is not None and time.monotonic() >= stopping_deadline:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            try:
                stdout, stderr = child.communicate(timeout=0.25)
                break
            except subprocess.TimeoutExpired:
                continue
        stopped()
        need(not sent_stop, 'VERIFIER_DEADLINE_EXCEEDED')
        need(child.returncode == 0, 'RETAINED_VERIFIER_FAILED')
        value = json.loads(stdout)
        need(isinstance(value, dict) and value.get('verified') is True, 'VERIFIER_SUMMARY_INVALID')
        return value
    finally:
        if child.poll() is None:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait(timeout=10)


def run(args, guard, report):
    report['policySHA256'] = checked_policy(args.policy)
    selection = guard.select_latest_two()
    namespace = capture_namespace(guard)
    initial_kept, protected_hash = kept_binding(selection), selection['protectedSHA256']
    candidates = build_plan(guard, selection)
    report.update({'retainedSnapshots': 2, 'candidateDirectories': len(candidates),
                   'protectedUnknownCaptures': len(selection['protected']),
                   'protectedUnknownCodes': sorted({row['code'] for row in selection['protectedBindings']}),
                   'selectionSHA256': selection['selectionSHA256'], 'protectedSHA256': protected_hash})
    kept_paths = [Path(row['payload']) for row in selection['kept']]
    pins = [guard.pinned_recovery(row['capture']) for row in selection['kept']]
    report['retainedSnapshotBindingsSHA256'] = sha(guard.encoded(initial_kept))
    report['recoveryToolPinsSHA256'] = sha(guard.encoded(pins))
    dependencies = [Path(pin['path']) for pin in pins]
    prepared, held = [], []
    for row in candidates:
        proof, refs = validate_candidate(guard, row, kept_paths, dependencies)
        if refs['blocked']:
            held.append(row)
        else:
            prepared.append((row, proof))
    report['heldLiveReferenceDirectories'] = len(held)
    report['eligibleDirectories'] = len(prepared)
    report['candidatePlanSHA256'] = sha(guard.encoded([
        {'path': row['path'], 'capture': row['capture'], 'kind': row['kind'],
         'metadataSHA256': proof.get('metadataSHA256')}
        for row, proof in prepared]))
    if not args.execute or not prepared:
        report.update({'complete': True, 'recoveryContentsVerifiedThisRun': False,
                       'phase': 'check-complete' if not args.execute else 'no-deletion-needed'})
        return

    def recheck(expected_older):
        stopped()
        need(capture_namespace(guard) == namespace, 'CAPTURE_NAMESPACE_CHANGED')
        current = guard.select_latest_two()
        need(kept_binding(current) == initial_kept and current['protectedSHA256'] == protected_hash, 'RETAINED_OR_UNKNOWN_BINDING_CHANGED')
        need({row['capture'] for row in current['older']} == expected_older, 'OLDER_PAYLOAD_SET_CHANGED')
        need([guard.pinned_recovery(row['capture']) for row in current['kept']] == pins, 'PINNED_RECOVERY_CHANGED')

    older = {row['capture'] for row in selection['older']}
    recheck(older)
    verified = [verify_in_worker(Path(__file__).absolute(), args.guard_module, row['capture'], args.verify_timeout)
                for row in selection['kept']]
    need(len(verified) == 2, 'TWO_VERIFICATIONS_REQUIRED')
    report['recoveryContentsVerifiedThisRun'] = True
    report['recoveryVerificationCount'] = 2
    retained = [guard.guard_tree(path) for path in kept_paths]
    recheck(older)
    for row, planned in prepared:
        recheck(older)
        proof, refs = validate_candidate(guard, row, kept_paths, dependencies)
        need(proof['entries'] == planned['entries'], 'CANDIDATE_TREE_CHANGED')
        if refs['blocked']:
            report['heldLiveReferenceDirectories'] += 1
            continue
        guard.assert_tree_unchanged(proof)
        stopped()
        safe_remove(guard, row['path'], proof['entries'][0][2])
        report['deletedDirectories'] += 1
        report['deletedLogicalBytes'] += proof['bytes']
        if row['kind'] == 'old-snapshot-payload':
            older.remove(row['capture'])
    recheck(older)
    for proof in retained:
        guard.assert_tree_unchanged(proof)
    report.update({'complete': True, 'retainedPayloadMetadataUnchanged': True, 'phase': 'complete'})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--check', action='store_true')
    modes.add_argument('--execute', action='store_true')
    parser.add_argument('--guard-module', type=Path, default=Path(__file__).absolute().with_name('jarvis-backup-retention.py'))
    parser.add_argument('--policy', type=Path)
    parser.add_argument('--verify-timeout', type=int, default=600)
    parser.add_argument('--verify-worker', type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    report = {'schemaVersion': 1, 'kind': 'jarvis-112-keep-two-capture-maintenance',
              'startedAt': now(), 'complete': False, 'executed': bool(args.execute),
              'guardSHA256': GUARD_SHA256, 'deletedDirectories': 0, 'deletedLogicalBytes': 0,
              'modelsInvoked': False, 'serviceOperations': 0, 'preBackupsTouched': False, 'releasesTouched': False}
    try:
        need(sys.platform == 'linux' and os.geteuid() == 0, 'LINUX_ROOT_REQUIRED')
        need(30 <= args.verify_timeout <= 1800, 'VERIFY_TIMEOUT_INVALID')
        guard = load_guard(args.guard_module)
        if args.verify_worker is not None:
            need(not args.execute and not args.check and args.policy is None, 'WORKER_MODE_INVALID')
            print(json.dumps(guard.verify_retained(args.verify_worker, timeout=1800), separators=(',', ':')))
            return 0
        for number in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            signal.signal(number, stop_handler)
        if args.execute:
            # This EX lock also excludes existing SH cleanup and every known
            # capture publisher; no separate maintenance lock is necessary.
            with guard.exclusive_locks([CONTROL / 'capture-activate.lock']):
                run(args, guard, report)
        else:
            run(args, guard, report)
    except BaseException as error:
        raw = str(error).encode('utf-8', 'replace')
        code = str(error)
        if code == 'WRITER_LOCK_BUSY':
            report.update({'complete': True, 'skipped': True, 'phase': 'skipped-writer-lock-busy',
                           'recoveryContentsVerifiedThisRun': False})
        else:
            report['errorCode'] = code if re.fullmatch(r'[A-Z][A-Z0-9_]{2,100}', code) else 'MAINTENANCE_FAILED'
            report['errorMessageSHA256'] = sha(raw)
            report['errorMessageBytes'] = len(raw)
            report['rawErrorMessageRetained'] = False
    finally:
        report['finishedAt'] = now()
    print(json.dumps(report, separators=(',', ':')))
    return 0 if report['complete'] else (128 + STOP if STOP else 1)


if __name__ == '__main__':
    sys.exit(main())
