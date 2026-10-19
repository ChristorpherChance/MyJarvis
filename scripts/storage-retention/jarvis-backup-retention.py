#!/usr/bin/env python3
"""Root-only retention guards. No function in this module deletes files.

Metadata/dry-run does not run the recovery verifier. verify_retained() explicitly
runs the pinned verifier, which may create temporary SQLite probes in the capture.
Detailed results contain private paths: persist only in a root-private journal.
"""
import argparse
import contextlib
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

CONTROL = Path('/var/lib/jarvis-control')
SHA = re.compile(r'^[0-9a-f]{64}$')
RELEASE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')
CAPTURE = re.compile(r'^capture-(?:activate-sidecar-[0-9a-f-]{36}|upgrade-[A-Za-z0-9_-]+-112)$')
MAX_JSON = 128 * 1024 * 1024


class RetentionError(Exception):
    pass


def require(ok, code):
    if not ok:
        raise RetentionError(code)


def encoded(value):
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(',', ':')).encode()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def _within(path, parent):
    return path == parent or parent in path.parents


def _absolute(path):
    path = Path(path)
    require(path.is_absolute() and '..' not in path.parts, 'ABSOLUTE_CANONICAL_PATH_REQUIRED')
    require(str(path) == os.path.abspath(path), 'CANONICAL_PATH_REQUIRED')
    return path


def _sig(info):
    return [info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns]


def real_path(path, uid=0, leaf_directory=None):
    """No symlink in any parent; root-owned, no group/world-write parents."""
    path = _absolute(path)
    owners = {uid} if isinstance(uid, int) else set(uid)
    require(owners and all(type(value) is int and value >= 0 for value in owners), 'OWNER_POLICY_INVALID')
    for item in [*reversed(path.parents), path]:
        info = item.lstat()
        require(not stat.S_ISLNK(info.st_mode), 'SYMLINK_REFUSED')
        require(info.st_uid in owners and not info.st_mode & 0o022, 'OWNER_OR_SHARED_WRITE_REFUSED')
        if item != path or leaf_directory is True:
            require(stat.S_ISDIR(info.st_mode), 'DIRECTORY_REQUIRED')
        elif leaf_directory is False:
            require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1, 'PRIVATE_REGULAR_FILE_REQUIRED')
    require(path.resolve(strict=True) == path, 'REDIRECTED_PATH_REFUSED')
    return path


def stable_bytes(path, uid=0, limit=MAX_JSON):
    path = real_path(path, uid, False)
    descriptor = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    try:
        before = os.fstat(descriptor)
        require(stat.S_ISREG(before.st_mode) and before.st_uid == uid and before.st_nlink == 1
                and not before.st_mode & 0o022 and before.st_size <= limit, 'FILE_GUARD_FAILED')
        chunks, count = [], 0
        while True:
            chunk = os.read(descriptor, min(1024 * 1024, limit + 1 - count))
            if not chunk:
                break
            chunks.append(chunk)
            count += len(chunk)
            require(count <= limit, 'FILE_SIZE_LIMIT')
        require(_sig(before) == _sig(os.fstat(descriptor)) == _sig(path.lstat()), 'FILE_CHANGED')
        return b''.join(chunks)
    finally:
        os.close(descriptor)


def _json(path, uid=0):
    raw = stable_bytes(path, uid)
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeError):
        raise RetentionError('JSON_INVALID') from None
    require(isinstance(value, dict), 'JSON_OBJECT_REQUIRED')
    return value, digest(raw)


def mount_points():
    require(sys.platform == 'linux', 'LINUX_REQUIRED')
    points = set()
    for line in Path('/proc/self/mountinfo').read_text().splitlines():
        fields = line.split()
        require(len(fields) >= 7 and ' - ' in line, 'MOUNTINFO_INVALID')
        points.add(Path(re.sub(r'\\([0-7]{3})', lambda m: chr(int(m[1], 8)), fields[4])))
    return points


def guard_tree(path, uid=0, allow_leaf_symlinks=False):
    """Stable metadata inventory; bytes is logical bytes, never allocated bytes.

    Rejects links by default, non-root ownership, shared-write, specials, mounts (including
    same-device bind mounts), cross-device descendants, and changing metadata.
    Does not hash private file contents. Caller must hold all writer locks.
    """
    owners = {uid} if isinstance(uid, int) else set(uid)
    path = real_path(path, owners, True)
    mounts = mount_points()
    require(not any(_within(point, path) for point in mounts), 'MOUNT_IN_TREE_REFUSED')
    root = path.lstat()
    entries, total, files, directories = [], 0, 0, 0

    def walk(item):
        nonlocal total, files, directories
        before = item.lstat()
        require(before.st_dev == root.st_dev, 'CROSS_DEVICE_REFUSED')
        require(before.st_uid in owners and (stat.S_ISLNK(before.st_mode) or not before.st_mode & 0o022),
                'TREE_OWNER_OR_SHARED_WRITE_REFUSED')
        relative = item.relative_to(path).as_posix()
        if stat.S_ISDIR(before.st_mode):
            directories += 1
            entries.append([relative, 'directory', _sig(before)])
            with os.scandir(item) as scan:
                names = sorted(entry.name for entry in scan)
            for name in names:
                require(name not in ('.', '..') and '/' not in name, 'ENTRY_NAME_INVALID')
                walk(item / name)
        elif stat.S_ISLNK(before.st_mode):
            require(allow_leaf_symlinks and before.st_nlink == 1, 'TREE_SYMLINK_REFUSED')
            # Historical release dependencies contain links. Record as leaves;
            # deletion must use an fd-safe walker and never follow these links.
            link = os.readlink(item)
            entries.append([relative, 'symlink', _sig(before), link])
        else:
            require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1, 'TREE_TYPE_OR_HARDLINK_REFUSED')
            files += 1
            total += before.st_size
            entries.append([relative, 'file', _sig(before)])
        require(_sig(before) == _sig(item.lstat()), 'TREE_CHANGED_DURING_SCAN')

    walk(path)
    require(_sig(root) == _sig(path.lstat()), 'TREE_ROOT_CHANGED')
    return {'path': str(path), 'uid': sorted(owners), 'allowLeafSymlinks': allow_leaf_symlinks,
            'entries': entries, 'metadataSHA256': digest(encoded(entries)),
            'bytes': total, 'files': files, 'directories': directories, 'contentHashesComputed': False}


def assert_tree_unchanged(snapshot):
    current = guard_tree(snapshot['path'], snapshot.get('uid', 0), snapshot.get('allowLeafSymlinks', False))
    require(current['entries'] == snapshot['entries'] and current['metadataSHA256'] == snapshot['metadataSHA256'],
            'PLANNED_TREE_CHANGED')
    return current


@contextlib.contextmanager
def exclusive_locks(paths):
    """Existing private regular lock files only. Caller provisions locks first."""
    import fcntl
    require(os.geteuid() == 0, 'ROOT_REQUIRED')
    held = []
    try:
        for item in sorted(set(str(_absolute(path)) for path in paths)):
            path = real_path(item, 0, False)
            descriptor = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
            try:
                info = os.fstat(descriptor)
                require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1
                        and stat.S_IMODE(info.st_mode) == 0o600 and _sig(info) == _sig(path.lstat()), 'LOCK_INVALID')
                try:
                    fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    raise RetentionError('WRITER_LOCK_BUSY') from None
            except BaseException:
                os.close(descriptor)
                raise
            held.append(descriptor)
        yield
    finally:
        for descriptor in reversed(held):
            os.close(descriptor)


def _completed_summary(value, operation, manifest, fingerprint):
    rows = manifest['inventory']
    return (isinstance(value, dict) and value.get('status') == 'passed'
            and value.get('operation') == operation and value.get('release') == manifest['release']
            and value.get('scope') == 'primary' and value.get('manifestSha256') == fingerprint
            and value.get('files') == len(rows['files']) and value.get('directories') == len(rows['directories'])
            and value.get('bytes') == sum(row['size'] for row in rows['files'])
            and value.get('sqliteDatabasesChecked') == manifest.get('sqliteDatabasesChecked')
            and value.get('sqliteIntegrity') == 'ok' and value.get('completeTreeVerified') is True
            and value.get('liveDirectoryModified') is False and value.get('automaticRollback') is False)


def metadata_capture(capture, control=CONTROL):
    """Strict terminal+manifest classification. Unknown/partial captures raise."""
    control = real_path(control, 0, True)
    capture = real_path(capture, 0, True)
    require(capture.parent == control and CAPTURE.fullmatch(capture.name), 'CAPTURE_SCOPE_REFUSED')
    manifest, fingerprint = _json(capture / 'data-snapshot' / 'manifest.json')
    require(manifest.get('schema') == 1 and manifest.get('scope') == 'primary'
            and manifest.get('sourceRoot') == '/var/lib/jarvis/data'
            and manifest.get('privateManifest') is True and manifest.get('sourceWasRequiredQuiescent') is True
            and RELEASE.fullmatch(manifest.get('release', '')) and isinstance(manifest.get('inventory'), dict), 'MANIFEST_BINDING_INVALID')
    inventory = manifest['inventory']
    require(isinstance(inventory.get('files'), list) and isinstance(inventory.get('directories'), list)
            and all(isinstance(row, dict) and type(row.get('size')) is int and row['size'] >= 0
                    and SHA.fullmatch(row.get('sha256', '')) for row in inventory['files']), 'MANIFEST_INVENTORY_INVALID')
    try:
        created = datetime.datetime.fromisoformat(manifest['createdAt'].replace('Z', '+00:00'))
        require(created.tzinfo is not None, 'CREATED_AT_TIMEZONE_REQUIRED')
    except (KeyError, TypeError, ValueError):
        raise RetentionError('CREATED_AT_INVALID') from None
    good, failed = capture / 'activation.json', capture / 'activation-failed.json'
    require(good.exists() != failed.exists(), 'UNAMBIGUOUS_TERMINAL_REQUIRED')
    terminal_path = good if good.exists() else failed
    terminal, terminal_hash = _json(terminal_path)
    sidecar = 'activate-sidecar-' in capture.name
    if sidecar:
        require(terminal.get('node') == '112' and terminal.get('release') == manifest['release']
                and terminal.get('liveDataRestored') is False
                and _completed_summary(terminal.get('snapshot'), 'snapshot-created', manifest, fingerprint)
                and _completed_summary(terminal.get('restore'), 'isolated-restore-verified', manifest, fingerprint), 'SIDECAR_RECOVERY_INCOMPLETE')
        if terminal_path == good:
            require(terminal.get('ok') is True and isinstance(terminal.get('health'), dict)
                    and terminal['health'].get('healthy') is True and terminal['health'].get('release') == manifest['release']
                    and isinstance(terminal.get('rollback'), dict) and terminal['rollback'].get('attempted') is False,
                    'SUCCESS_TERMINAL_INCOMPLETE')
        else:
            rollback = terminal.get('rollback')
            require(terminal.get('ok') is False and isinstance(rollback, dict) and rollback.get('attempted') is True
                    and rollback.get('ok') is True and isinstance(rollback.get('health'), dict)
                    and rollback['health'].get('healthy') is True and rollback['health'].get('release') == terminal.get('prior'),
                    'ROLLBACK_TERMINAL_INCOMPLETE')
            rollback_file, _ = _json(capture / 'rollback.json')
            require(rollback_file.get('ok') is True, 'ROLLBACK_RECEIPT_INCOMPLETE')
    else:
        require(terminal_path == good and terminal.get('node') == '112' and terminal.get('release') == manifest['release']
                and terminal.get('active') is True and terminal.get('activationLockHeld') is True
                and terminal.get('productionDataRestored') is False
                and _completed_summary(terminal.get('dataSnapshot'), 'snapshot-created', manifest, fingerprint)
                and _completed_summary(terminal.get('isolatedRestore'), 'isolated-restore-verified', manifest, fingerprint),
                'LEGACY_RECOVERY_INCOMPLETE')
    payload = capture / 'data-snapshot' / 'payload'
    if payload.exists() or payload.is_symlink():
        real_path(payload, 0, True)
        available = True
    else:
        available = False
    return {'capture': str(capture), 'release': manifest['release'], 'createdAt': manifest['createdAt'],
            'createdAtEpoch': created.timestamp(), 'manifestSHA256': fingerprint, 'terminalSHA256': terminal_hash,
            'terminalPath': str(terminal_path), 'payload': str(payload), 'availablePayload': available,
            'completeRecoveryMetadata': True, 'manifest': manifest, 'terminal': terminal}


def select_latest_two(control=CONTROL):
    """Returns kept (2), older, protected; unknown captures are NEVER candidates.

    Unknown/partial payloads remain protected and are never deletion candidates.
    The protected inventory fingerprint lets callers reject any newly appearing
    incomplete capture against their reviewed fixed plan.
    """
    control = real_path(control, 0, True)
    complete, protected, protected_bindings = [], [], []
    for item in sorted(control.iterdir()):
        if not CAPTURE.fullmatch(item.name):
            continue
        try:
            row = metadata_capture(item, control)
        except (RetentionError, OSError) as error:
            protected.append(str(item))
            binding = {'capture': str(item), 'identity': _sig(item.lstat()),
                       'code': str(error) if isinstance(error, RetentionError) else 'OS_GUARD_FAILED', 'files': {}}
            for relative in ('data-snapshot/manifest.json', 'activation.json', 'activation-failed.json', 'operation.json', 'rollback.json'):
                file = item / relative
                if file.exists() or file.is_symlink():
                    try:
                        binding['files'][relative] = digest(stable_bytes(file))
                    except (RetentionError, OSError):
                        binding['files'][relative] = 'UNREADABLE_OR_UNSAFE'
            protected_bindings.append(binding)
            continue
        if row['availablePayload']:
            complete.append(row)
    complete.sort(key=lambda row: (row['createdAtEpoch'], row['capture']), reverse=True)
    require(len(complete) >= 2 and complete[0]['createdAtEpoch'] != complete[1]['createdAtEpoch'], 'TWO_DISTINCT_COMPLETE_SNAPSHOTS_REQUIRED')
    require(len(complete) < 3 or complete[1]['createdAtEpoch'] != complete[2]['createdAtEpoch'], 'SNAPSHOT_ORDER_AMBIGUOUS')
    return {'kept': complete[:2], 'older': complete[2:], 'protected': protected,
            'protectedBindings': protected_bindings, 'protectedSHA256': digest(encoded(protected_bindings)),
            'selectionSHA256': digest(encoded([[r['capture'], r['manifestSHA256'], r['terminalSHA256']] for r in complete]))}


def pinned_recovery(capture, control=CONTROL):
    row = metadata_capture(capture, control)
    operation, _ = _json(Path(capture) / 'operation.json')
    pins = operation.get('pins')
    require(isinstance(pins, dict) and pins.get('node') == '112' and pins.get('release') == row['release'], 'RECOVERY_PINS_INVALID')
    path = real_path(pins.get('recoveryPath', ''), 0, False)
    expected = row['terminal'].get('recoverySHA256')
    require(isinstance(expected, str) and SHA.fullmatch(expected), 'RECOVERY_HASH_MISSING')
    require(digest(stable_bytes(path, 0, 16 * 1024 * 1024)) == expected, 'RECOVERY_SCRIPT_HASH_MISMATCH')
    return {'path': str(path), 'sha256': expected, 'manifestSHA256': row['manifestSHA256'],
            'release': row['release'], 'capture': row['capture']}


def verify_retained(capture, timeout=1800, control=CONTROL):
    """Full SHA/inventory/SQLite verification of one explicitly kept snapshot.

    Invoke only after holding EX writer+cleanup locks and root/proc gates.
    Only trusted pinned code executes; stdout/stderr never returned raw on error.
    """
    require(os.geteuid() == 0, 'ROOT_REQUIRED')
    row = metadata_capture(capture, control)
    require(row['availablePayload'], 'RETAINED_PAYLOAD_MISSING')
    pin = pinned_recovery(capture, control)
    before = guard_tree(row['payload'])
    try:
        result = subprocess.run([sys.executable, '-I', pin['path'], 'verify', '--snapshot',
                                 str(Path(capture) / 'data-snapshot'), '--expect-manifest-sha256',
                                 pin['manifestSHA256'], '--release', pin['release']],
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=timeout, check=False, env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8'})
    except subprocess.TimeoutExpired:
        raise RetentionError('RETAINED_VERIFIER_TIMEOUT') from None
    require(result.returncode == 0, 'RETAINED_VERIFIER_FAILED')
    try:
        output = json.loads(result.stdout)
    except (ValueError, UnicodeError):
        raise RetentionError('RETAINED_VERIFIER_OUTPUT_INVALID') from None
    require(_completed_summary(output, 'snapshot-verified', row['manifest'], row['manifestSHA256']), 'RETAINED_VERIFIER_BINDING_FAILED')
    assert_tree_unchanged(before)
    require(pinned_recovery(capture, control) == pin, 'RECOVERY_BINDING_CHANGED')
    return {'verified': True, 'capture': row['capture'], 'release': row['release'],
            'manifestSHA256': row['manifestSHA256'], 'recoveryPath': pin['path'], 'recoverySHA256': pin['sha256'],
            'stdoutSHA256': digest(result.stdout), 'stdoutBytes': len(result.stdout),
            'stderrSHA256': digest(result.stderr), 'stderrBytes': len(result.stderr), 'returnCode': result.returncode,
            'files': output['files'], 'bytes': output['bytes'], 'sqliteIntegrity': 'ok'}


def references(targets, scan_roots=('/opt/jarvis', '/etc/jarvis', '/var/lib/jarvis-control')):
    """References are private detail dictionaries; blocked is a bool.

    References live process cwd/root/exe/fd/maps/absolute argv and filesystem
    symlinks. All scanning errors except disappearing /proc processes fail closed.
    Does not follow filesystem symlinks. Caller must recheck immediately per batch.
    """
    require(sys.platform == 'linux' and os.geteuid() == 0, 'LINUX_ROOT_REQUIRED')
    targets = [_absolute(item) for item in targets]
    # Callers may include an owner capture root for process-argv detection plus
    # its exact payload target. Only the deepest targets are actually removed.
    deletion_leaves = [target for target in targets
                       if not any(other != target and _within(other, target) for other in targets)]
    found, scanned = [], 0

    def check(raw, source):
        raw = raw.removesuffix(' (deleted)')
        if not raw.startswith('/'):
            return
        path = Path(os.path.normpath(raw))
        for target in targets:
            if _within(path, target):
                found.append({'target': str(target), 'reference': raw, 'source': source})

    for process in Path('/proc').iterdir():
        if not process.name.isdigit():
            continue
        try:
            scanned += 1
            for key in ('cwd', 'root', 'exe'):
                try:
                    check(os.readlink(process / key), 'process:' + process.name + ':' + key)
                except FileNotFoundError:
                    pass
            for fd in (process / 'fd').iterdir():
                try:
                    check(os.readlink(fd), 'process:' + process.name + ':fd')
                except FileNotFoundError:
                    pass
            for line in (process / 'maps').read_text().splitlines():
                parts = line.split(None, 5)
                if len(parts) == 6:
                    check(parts[5].replace('\\040', ' '), 'process:' + process.name + ':maps')
            for argument in (process / 'cmdline').read_bytes().split(b'\0'):
                text = argument.decode('utf-8', 'surrogateescape')
                check(text, 'process:' + process.name + ':argv')
                if '=' in text:
                    check(text.split('=', 1)[1], 'process:' + process.name + ':argv')
        except (FileNotFoundError, ProcessLookupError):
            continue
        except (OSError, UnicodeError):
            raise RetentionError('PROCESS_REFERENCES_UNREADABLE') from None
    for root in scan_roots:
        root = real_path(root, 0, True)
        for current, dirs, files in os.walk(root, followlinks=False):
            for name in dirs + files:
                path = Path(current) / name
                if path.is_symlink():
                    if any(_within(path, target) for target in deletion_leaves):
                        continue
                    link = os.readlink(path)
                    absolute = link if link.startswith('/') else str(path.parent / link)
                    check(os.path.normpath(absolute), 'symlink:' + str(path))
    return {'blocked': bool(found), 'references': found, 'scannedProcesses': scanned,
            'referencesSHA256': digest(encoded(found))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='metadata-only; no verifier, locks, writes, or deletion')
    parser.add_argument('--execute', action='store_true', help='not implemented: use reviewed fixed-plan executor')
    arguments = parser.parse_args()
    require(not arguments.execute, 'NO_DELETION_ENTRYPOINT_USE_REVIEWED_EXECUTOR')
    selection = select_latest_two()
    print(json.dumps({'status': 'checked', 'metadataOnly': True, 'deletionImplemented': False,
                      'keptCount': 2, 'olderCompletePayloads': len(selection['older']),
                      'protectedCount': len(selection['protected']), 'selectionSHA256': selection['selectionSHA256']}))


if __name__ == '__main__':
    try:
        main()
    except (RetentionError, OSError) as error:
        print(json.dumps({'status': 'refused', 'code': str(error) if isinstance(error, RetentionError) else 'OS_GUARD_FAILED'}))
        sys.exit(1)
