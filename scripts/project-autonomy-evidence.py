#!/usr/bin/python3
"""Private evidence IO for the root-owned validator; never a sudo entry point.

Directory-fd anchored reads avoid following a model-writable parent replacement.
No git config, hooks, filters, source programs or shell are executed here.
"""
import hashlib
import json
import os
from pathlib import Path
import stat
import sys

IGNORE_DIRS = {'.git', '.claude', '.codex', '.cc-switch', '.secrets', 'node_modules',
               'dist', 'build', 'coverage', '.pnpm-store', '.cache', '.turbo', '.next',
               '.jarvis-validation-output', 'logs', 'data', 'uploads', 'recordings', 'sessions'}
IGNORE_FILES = {'.npmrc', '.yarnrc', '.yarnrc.yml', 'credentials.json', 'auth.json',
                'settings.local.json', 'config.local.json'}
GENERATED_FILES = {'jarvis-test-report.json', 'jarvis-package-manifest.json'}
MAX_FILES = 20000
MAX_TOTAL = 200 * 1024 * 1024
MAX_FILE = 20 * 1024 * 1024
MAX_ARTIFACT = 512 * 1024 * 1024


def fail(code):
    raise ValueError(code)


def private_name(name):
    return (name in IGNORE_FILES or name.startswith('.env') or
            name.endswith(('.env', '.pem', '.key', '.p12', '.pfx')))


def open_directory(path):
    p = Path(path)
    if not p.is_absolute() or '..' in p.parts:
        fail('EVIDENCE_PATH_INVALID')
    parent = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for name in p.parts[1:]:
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            os.close(parent)
            parent = child
        return parent
    except BaseException:
        os.close(parent)
        raise


def relative_parts(name):
    p = Path(name)
    if p.is_absolute() or not p.parts or any(v in ('..', '.') for v in p.parts):
        fail('EVIDENCE_RELATIVE_PATH_INVALID')
    if any(private_name(v) or v in {'.secrets', '.claude', '.codex', '.cc-switch',
                                   'data', 'uploads', 'recordings', 'sessions'} for v in p.parts):
        fail('EVIDENCE_PRIVATE_PATH_REFUSED')
    return p.parts


def open_relative(root, name):
    parts = relative_parts(name)
    parent = os.dup(root)
    try:
        for item in parts[:-1]:
            child = os.open(item, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            os.close(parent)
            parent = child
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            os.close(fd)
            fail('EVIDENCE_FILE_NOT_REGULAR_SINGLE_LINK')
        return fd
    finally:
        os.close(parent)


def read_fd(fd, limit):
    before = os.fstat(fd)
    if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
        fail('EVIDENCE_FILE_NOT_REGULAR_SINGLE_LINK')
    if before.st_size > limit:
        fail('EVIDENCE_FILE_LIMIT')
    result = bytearray()
    while True:
        chunk = os.read(fd, min(65536, limit + 1 - len(result)))
        if not chunk:
            break
        result.extend(chunk)
        if len(result) > limit:
            fail('EVIDENCE_FILE_LIMIT')
    after = os.fstat(fd)
    if (len(result) != before.st_size or before.st_size != after.st_size or
            before.st_mtime_ns != after.st_mtime_ns or before.st_ctime_ns != after.st_ctime_ns):
        fail('SOURCE_CHANGED_DURING_READ')
    return bytes(result)


def walk(root, manifest, prefix='', counts=None, destination=None):
    counts = counts if counts is not None else [0, 0]
    for name in sorted(os.listdir(root)):
        if name in IGNORE_DIRS or name in GENERATED_FILES or private_name(name):
            continue
        info = os.stat(name, dir_fd=root, follow_symlinks=False)
        if stat.S_ISLNK(info.st_mode):
            fail('SOURCE_SYMLINK_NOT_ALLOWED')
        if stat.S_ISDIR(info.st_mode):
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root)
            try:
                dest = destination / name if destination is not None else None
                if dest is not None:
                    dest.mkdir(mode=0o700)
                walk(child, manifest, prefix + name + '/', counts, dest)
            finally:
                os.close(child)
        elif stat.S_ISREG(info.st_mode):
            if info.st_nlink != 1:
                fail('SOURCE_HARDLINK_NOT_ALLOWED')
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root)
            try:
                body = read_fd(fd, MAX_FILE)
            finally:
                os.close(fd)
            counts[0] += 1
            counts[1] += len(body)
            if counts[0] > MAX_FILES or counts[1] > MAX_TOTAL:
                fail('SOURCE_MANIFEST_LIMIT')
            manifest.append({'path': prefix + name, 'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body)})
            if destination is not None:
                out = os.open(destination / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                              0o700 if info.st_mode & 0o111 else 0o600)
                try:
                    view = memoryview(body)
                    while view:
                        size = os.write(out, view)
                        view = view[size:]
                    os.fsync(out)
                finally:
                    os.close(out)
        else:
            fail('SOURCE_SPECIAL_FILE_NOT_ALLOWED')


def fingerprint(workspace):
    root = open_directory(workspace)
    manifest = []
    try:
        walk(root, manifest)
    finally:
        os.close(root)
    identity = ''.join(v['path'] + '\0' + v['sha256'] + '\n' for v in manifest).encode('utf-8')
    return {'sha256': hashlib.sha256(identity).hexdigest(), 'files': len(manifest),
            'bytes': sum(v['bytes'] for v in manifest), 'manifest': manifest}


def snapshot(workspace, destination):
    dest = trusted_destination(destination)
    dest.mkdir(mode=0o700)
    root = open_directory(workspace)
    manifest = []
    try:
        walk(root, manifest, destination=dest)
    finally:
        os.close(root)
    identity = ''.join(v['path'] + '\0' + v['sha256'] + '\n' for v in manifest).encode('utf-8')
    before = {'sha256': hashlib.sha256(identity).hexdigest(), 'files': len(manifest),
              'bytes': sum(v['bytes'] for v in manifest), 'manifest': manifest}
    after = fingerprint(workspace)
    if before['sha256'] != after['sha256']:
        fail('SOURCE_CHANGED_DURING_SNAPSHOT')
    return before


def publish_protocol(text):
    root = Path('/var/lib/jarvis-development/101/autonomy-public')
    root.mkdir(mode=0o755, exist_ok=True)
    for part in [root, *root.parents]:
        info = part.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            fail('PUBLIC_REPORT_ROOT_UNTRUSTED')
    os.chmod(root, 0o755)
    body = text.encode('utf-8')
    if len(body) > 1024 * 1024:
        fail('PUBLIC_REPORT_SIZE_LIMIT')
    path = root / (hashlib.sha256(body).hexdigest() + '.json')
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
    except FileExistsError:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            info = os.fstat(fd)
            if info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o022 or read_fd(fd, 1024 * 1024) != body:
                fail('PUBLIC_REPORT_IDENTITY_CONFLICT')
        finally:
            os.close(fd)
        return str(path)
    try:
        view = memoryview(body)
        while view:
            written = os.write(fd, view)
            view = view[written:]
        os.fsync(fd)
        os.fchmod(fd, 0o644)
    finally:
        os.close(fd)
    return str(path)


def trusted_destination(path):
    p = Path(path)
    if not p.is_absolute() or p.exists():
        fail('EVIDENCE_DESTINATION_INVALID')
    for parent in [p.parent, *p.parent.parents]:
        info = parent.lstat()
        if (not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or
                info.st_mode & 0o022):
            fail('EVIDENCE_DESTINATION_UNTRUSTED')
    return p


def artifact(workspace, relative, destination):
    dest = trusted_destination(destination)
    root = open_directory(workspace)
    source = None
    output = None
    try:
        source = open_relative(root, relative)
        before = os.fstat(source)
        if before.st_size > MAX_ARTIFACT:
            fail('ARTIFACT_SIZE_LIMIT')
        output = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        digest = hashlib.sha256()
        size = 0
        while True:
            chunk = os.read(source, 65536)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_ARTIFACT or size > before.st_size:
                fail('ARTIFACT_CHANGED_DURING_READ')
            digest.update(chunk)
            view = memoryview(chunk)
            while view:
                written = os.write(output, view)
                view = view[written:]
        after = os.fstat(source)
        if (size != before.st_size or before.st_size != after.st_size or
                before.st_mtime_ns != after.st_mtime_ns or before.st_ctime_ns != after.st_ctime_ns):
            fail('ARTIFACT_CHANGED_DURING_READ')
        os.fsync(output)
        return {'path': str(dest), 'sourcePath': relative, 'sha256': digest.hexdigest(), 'bytes': size}
    finally:
        for fd in [output, source, root]:
            if fd is not None:
                os.close(fd)


def main():
    if os.geteuid() != 0:
        fail('EVIDENCE_ROOT_REQUIRED')
    mode = sys.argv[1]
    if mode == 'fingerprint' and len(sys.argv) == 3:
        result = fingerprint(sys.argv[2])
    elif mode == 'read-json' and len(sys.argv) == 4:
        root = open_directory(sys.argv[2])
        fd = None
        try:
            fd = open_relative(root, sys.argv[3])
            info = os.fstat(fd)
            body = read_fd(fd, 4 * 1024 * 1024)
            result = {'value': json.loads(body), 'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body),
                      'mtimeNs': str(info.st_mtime_ns), 'mtimeMs': info.st_mtime_ns / 1000000,
                      'inode': str(info.st_ino)}
        finally:
            for item in [fd, root]:
                if item is not None:
                    os.close(item)
    elif mode == 'artifact' and len(sys.argv) == 5:
        result = artifact(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        fail('EVIDENCE_OPERATION_INVALID')
    print(json.dumps(result, ensure_ascii=True, separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except BaseException as exc:
        # Deliberately no exception text/path/raw private contents in public stdout.
        code = str(exc) if isinstance(exc, ValueError) and str(exc).replace('_', '').isalnum() else 'EVIDENCE_IO_FAILED'
        print(json.dumps({'ok': False, 'error': code}))
        sys.exit(2)
