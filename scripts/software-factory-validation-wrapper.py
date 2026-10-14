#!/usr/bin/python3
"""Root-owned, single-purpose boundary. It never executes a caller-selected program."""
import ctypes
import ctypes.util
import errno
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import stat
import sys
import tempfile
import uuid

SOURCE = '/home/superopen/All-Projects/msf'
ROOT = '/var/lib/jarvis-development/101/validation'
VALIDATOR = '/opt/jarvis-development/software-factory/validate-msf.mjs'
NODE = '/opt/jarvis-development/node/bin/node'
IGNORE_DIRS = {'.git', '.claude', '.codex', 'node_modules', 'dist', 'coverage', '.pnpm-store', '.cache', 'logs', 'data', 'uploads', 'artifacts'}
IGNORE_FILES = {'.npmrc', '.yarnrc', '.yarnrc.yml', 'credentials.json', 'auth.json', 'settings.local.json'}
MAX_FILES = 20000
MAX_BYTES = 200 * 1024 * 1024
MAX_FILE = 20 * 1024 * 1024
RUN_ID = r'(?:[0-9a-f]{40}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'

def reject(code):
    print(json.dumps({'ok': False, 'error': code}), flush=True)
    raise SystemExit(2)

def trusted(path):
    p = Path(path)
    for part in [p, *p.parents]:
        s = part.lstat()
        if stat.S_ISLNK(s.st_mode) or s.st_uid != 0 or s.st_mode & 0o022:
            reject('VALIDATOR_TRUST_BOUNDARY_INVALID')

def open_source():
    # Every component is anchored and must be a directory, never a symlink.
    parent = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for name in SOURCE.strip('/').split('/'):
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            os.close(parent)
            parent = child
        return parent
    except BaseException:
        os.close(parent)
        raise

def secure_copy(source_fd, destination, counters, fingerprint, prefix='', manifest=None):
    # Resolve each child relative to its already-open parent; directory replacement
    # and symlink races cannot redirect the read into a personal directory.
    for name in sorted(os.listdir(source_fd)):
        if name in IGNORE_DIRS or name in IGNORE_FILES or name.startswith('.env') or name.endswith(('.env', '.pem', '.key', '.p12', '.pfx')):
            continue
        st = os.stat(name, dir_fd=source_fd, follow_symlinks=False)
        if stat.S_ISLNK(st.st_mode):
            reject('SOURCE_SYMLINK_NOT_ALLOWED')
        if stat.S_ISDIR(st.st_mode):
            fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=source_fd)
            try:
                dest = destination / name if destination is not None else None
                if dest is not None:
                    dest.mkdir(mode=0o700)
                secure_copy(fd, dest, counters, fingerprint, prefix + name + '/', manifest)
            finally:
                os.close(fd)
        elif stat.S_ISREG(st.st_mode):
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=source_fd)
            try:
                current = os.fstat(fd)
                if not stat.S_ISREG(current.st_mode) or current.st_size > MAX_FILE:
                    reject('SOURCE_FILE_LIMIT')
                counters[0] += 1
                counters[1] += current.st_size
                if counters[0] > MAX_FILES or counters[1] > MAX_BYTES:
                    reject('SOURCE_COPY_LIMIT')
                out = os.open(str(destination / name), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600) if destination is not None else None
                try:
                    size = 0
                    file_hash = hashlib.sha256()
                    while True:
                        chunk = os.read(fd, 65536)
                        if not chunk:
                            break
                        size += len(chunk)
                        file_hash.update(chunk)
                        if size > MAX_FILE or size > current.st_size:
                            reject('SOURCE_CHANGED_DURING_COPY')
                        if out is not None:
                            os.write(out, chunk)
                    if size != current.st_size:
                        reject('SOURCE_CHANGED_DURING_COPY')
                    fingerprint.update((prefix + name + '\0' + file_hash.hexdigest() + '\n').encode())
                    if manifest is not None:
                        manifest.append({'path': prefix + name, 'sha256': file_hash.hexdigest(), 'bytes': size})
                finally:
                    if out is not None:
                        os.close(out)
            finally:
                os.close(fd)
        else:
            reject('SOURCE_SPECIAL_FILE_NOT_ALLOWED')

def isolate():
    libc = ctypes.CDLL(None, use_errno=True)
    libc.unshare.argtypes = [ctypes.c_int]
    if libc.unshare(0x40000000) != 0: # CLONE_NEWNET: no host interfaces or IP routes
        reject('NETWORK_NAMESPACE_UNAVAILABLE')
    name = ctypes.util.find_library('seccomp')
    if not name:
        reject('SECCOMP_UNAVAILABLE')
    lib = ctypes.CDLL(name, use_errno=True)
    lib.seccomp_init.argtypes = [ctypes.c_uint32]
    lib.seccomp_init.restype = ctypes.c_void_p
    lib.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    lib.seccomp_syscall_resolve_name.restype = ctypes.c_int
    lib.seccomp_rule_add.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint]
    lib.seccomp_load.argtypes = [ctypes.c_void_p]
    lib.seccomp_release.argtypes = [ctypes.c_void_p]
    ctx = lib.seccomp_init(0x7fff0000) # SCMP_ACT_ALLOW
    syscall = lib.seccomp_syscall_resolve_name(b'connect')
    if not ctx or syscall < 0:
        reject('SECCOMP_UNAVAILABLE')
    try:
        # Deny both Internet and pathname/abstract Unix-socket connects. Pipes and
        # socketpair IPC remain usable by compiler/test worker processes.
        if lib.seccomp_rule_add(ctx, 0x00050000 | errno.EPERM, syscall, 0) != 0:
            reject('SECCOMP_RULE_FAILED')
        if libc.prctl(38, 1, 0, 0, 0) != 0 or lib.seccomp_load(ctx) != 0:
            reject('SECCOMP_LOAD_FAILED')
    finally:
        lib.seccomp_release(ctx)

def raw_git_metadata(source_fd):
    """Read bounded raw refs; never run Git, config, hooks or clean filters."""
    def read(parent, name, limit):
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
                reject('SOURCE_GIT_METADATA_INVALID')
            value = os.read(fd, limit + 1)
            if len(value) > limit:
                reject('SOURCE_GIT_METADATA_INVALID')
            return value.decode('ascii').strip()
        finally:
            os.close(fd)
    git = os.open('.git', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=source_fd)
    try:
        head = read(git, 'HEAD', 1024)
        branch = ''
        if head.startswith('ref: '):
            ref = head[5:]
            if not re.fullmatch(r'refs/(?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_.-]+', ref) or any(part in ('.', '..') for part in ref.split('/')):
                reject('SOURCE_GIT_METADATA_INVALID')
            branch = ref[len('refs/heads/'):] if ref.startswith('refs/heads/') else ''
            parent = os.dup(git)
            try:
                try:
                    parts = ref.split('/')
                    for part in parts[:-1]:
                        next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
                        os.close(parent)
                        parent = next_fd
                    head = read(parent, parts[-1], 1024)
                except FileNotFoundError:
                    packed = read(git, 'packed-refs', 2 * 1024 * 1024)
                    matches = [line.split(' ', 1)[0] for line in packed.splitlines() if line.endswith(' ' + ref) and not line.startswith(('#', '^'))]
                    if len(matches) != 1:
                        reject('SOURCE_GIT_METADATA_UNAVAILABLE')
                    head = matches[0]
            finally:
                os.close(parent)
        if not re.fullmatch('[0-9a-f]{40}', head):
            reject('SOURCE_GIT_METADATA_INVALID')
        return {'head': head, 'branch': branch[:200], 'trackedDirtyCount': None, 'untrackedCount': None, 'statusInspection': 'not-run', 'metadataMethod': 'bounded-raw-ref-no-git-process'}
    finally:
        os.close(git)

def isolate_files(work):
    """Fail-closed kernel filesystem rules inherited by every build child."""
    libc = ctypes.CDLL(None, use_errno=True)
    libc.syscall.restype = ctypes.c_long
    abi = libc.syscall(444, 0, 0, 1) # landlock_create_ruleset VERSION
    if abi < 1:
        reject('LANDLOCK_UNAVAILABLE')
    handled = (1 << 13) - 1
    if abi >= 2:
        handled |= 1 << 13 # REFER
    if abi >= 3:
        handled |= 1 << 14 # TRUNCATE
    class Ruleset(ctypes.Structure):
        _fields_ = [('handled_access_fs', ctypes.c_uint64)]
    class PathRule(ctypes.Structure):
        _fields_ = [('allowed_access', ctypes.c_uint64), ('parent_fd', ctypes.c_int)]
    rules = Ruleset(handled)
    fd = libc.syscall(444, ctypes.byref(rules), ctypes.sizeof(rules), 0)
    if fd < 0:
        reject('LANDLOCK_RULESET_FAILED')
    read = 1 | 4 | 8 # execute, read-file, read-directory
    scratch = handled & ~((1 << 6) | (1 << 11)) # no make-char / make-block
    paths = [(str(work), scratch), (VALIDATOR, read), ('/opt/jarvis-development/node', read), ('/home/superopen/opt/node22/lib/node_modules/corepack', read), ('/home/superopen/.cache/node/corepack', read), ('/home/superopen/.local/share/pnpm/store', read)]
    paths += [(p, read) for p in ['/usr', '/lib', '/lib64', '/bin', '/sbin', '/etc/ld.so.cache', '/etc/localtime', '/etc/os-release', '/etc/hosts', '/etc/host.conf', '/etc/resolv.conf', '/etc/nsswitch.conf', '/etc/ssl/openssl.cnf', '/etc/ssl/certs', '/proc/meminfo', '/proc/cpuinfo', '/proc/stat', '/proc/sys/kernel/osrelease', '/sys/devices/system/cpu/online', '/dev/urandom', '/dev/random', '/dev/zero']]
    # Rule resolves to this PID's stat inode, inherited by exec and its threads;
    # it does not grant access to other processes or any proc directory.
    paths += [('/proc/self/stat', 4)]
    paths += [('/dev/null', 2 | 4)]
    try:
        for path, access in paths:
            if not os.path.exists(path):
                continue
            handle = os.open(path, os.O_PATH | os.O_CLOEXEC)
            try:
                if not stat.S_ISDIR(os.fstat(handle).st_mode):
                    access &= 1 | 2 | 4 | (1 << 14)
                rule = PathRule(access & handled, handle)
                if libc.syscall(445, fd, 1, ctypes.byref(rule), 0) != 0:
                    reject('LANDLOCK_PATH_RULE_FAILED')
            finally:
                os.close(handle)
        if libc.prctl(38, 1, 0, 0, 0) != 0 or libc.syscall(446, fd, 0) != 0:
            reject('LANDLOCK_RESTRICT_FAILED')
    finally:
        os.close(fd)
    return abi

def main():
    if os.geteuid() != 0 or len(sys.argv) not in (3, 4) or sys.argv[1] != SOURCE or not re.fullmatch(RUN_ID, sys.argv[2]):
        reject('FIXED_VALIDATION_ARGUMENTS_REQUIRED')
    option = sys.argv[3] if len(sys.argv) == 4 else None
    probe = option == '--probe'
    if option is not None and option not in ('--probe', '--inspect-state'):
        reject('FIXED_VALIDATION_ARGUMENTS_REQUIRED')
    trusted(__file__)
    trusted(VALIDATOR)
    trusted(NODE)
    if os.path.realpath(SOURCE) != SOURCE:
        reject('SOURCE_PATH_CHANGED')
    account = pwd.getpwnam('superopen')
    isolate()
    os.setgroups([])
    os.setgid(account.pw_gid)
    os.setuid(account.pw_uid)
    os.umask(0o077)
    # All reads of the user-owned source happen after dropping root.
    if probe:
        import socket
        checks = {}
        for name, family, address in [('tcp', socket.AF_INET, ('127.0.0.1', 5432)), ('unix', socket.AF_UNIX, '/var/run/postgresql/.s.PGSQL.5432')]:
            with socket.socket(family, socket.SOCK_STREAM) as s:
                try:
                    s.connect(address)
                    checks[name] = False
                except OSError as exc:
                    checks[name] = exc.errno == errno.EPERM
        temporary = Path(tempfile.mkdtemp(prefix='.probe-', dir=ROOT))
        sandbox = temporary / 'sandbox'
        sandbox.mkdir(mode=0o700)
        (sandbox / 'public.txt').write_text('safe-fixture')
        outside = temporary / 'private-auth-fixture'
        outside.write_text('synthetic-only-not-a-credential')
        abi = isolate_files(sandbox)
        files = {'scratchReadable': (sandbox / 'public.txt').read_text() == 'safe-fixture'}
        (sandbox / 'write.txt').write_text('safe-write')
        files['scratchWritable'] = True
        handle = os.open('/proc/self/stat', os.O_RDONLY)
        os.close(handle)
        files['selfStatReadable'] = True
        for name, path in [('outsideFixtureDenied', str(outside)), ('originalSourceDenied', SOURCE + '/README.md'), ('agentConfigDenied', '/var/lib/jarvis-development/101/config.json'), ('otherProcessStatDenied', '/proc/' + str(os.getppid()) + '/stat')]:
            try:
                handle = os.open(path, os.O_RDONLY)
                os.close(handle) # Never read any contents, even if a boundary fails.
                files[name] = False
            except OSError as exc:
                files[name] = exc.errno in (errno.EACCES, errno.EPERM) or name == 'agentConfigDenied' and exc.errno == errno.ENOENT
        ok = all(checks.values()) and all(files.values())
        print(json.dumps({'ok': ok, 'uid': os.getuid(), 'networkNamespace': True, 'connectDenied': checks, 'landlockABI': abi, 'filesystem': files, 'temporaryRoot': str(temporary), 'runIdShape': 'central-40hex' if len(sys.argv[2]) == 40 else 'uuid'}), flush=True)
        raise SystemExit(0 if ok else 2)
    if option == '--inspect-state':
        fd = open_source()
        try:
            before = raw_git_metadata(fd)
            first, second = hashlib.sha256(), hashlib.sha256()
            counts, checked = [0, 0], [0, 0]
            secure_copy(fd, None, counts, first)
            secure_copy(fd, None, checked, second)
            after = raw_git_metadata(fd)
        finally:
            os.close(fd)
        changed = before != after or counts != checked or first.digest() != second.digest()
        print(json.dumps({'ok': not changed, 'source': SOURCE, 'sourceFingerprint': first.hexdigest(), 'verificationSha256': second.hexdigest(), 'sourceStateChanged': changed, 'gitBefore': before, 'gitAfter': after, 'files': counts[0], 'bytes': counts[1], 'privateEnvCopied': False, 'modelCalled': False, 'testsRun': False}), flush=True)
        raise SystemExit(0 if not changed else 2)
    root = Path(ROOT)
    if root.is_symlink() or root.resolve() != root or root.stat().st_uid != account.pw_uid:
        reject('VALIDATION_ROOT_INVALID')
    run_root = root / sys.argv[2]
    run_root.mkdir(mode=0o700, exist_ok=True)
    if run_root.is_symlink() or run_root.resolve() != run_root or run_root.stat().st_uid != account.pw_uid:
        reject('VALIDATION_RUN_ROOT_INVALID')
    # Repairs reuse the signed central runId but never overwrite an earlier snapshot.
    attempt = 'attempt-' + uuid.uuid4().hex
    work = run_root / attempt
    work.mkdir(mode=0o700)
    fd, latest = tempfile.mkstemp(prefix='.latest-', dir=run_root)
    with os.fdopen(fd, 'w') as stream:
        json.dump({'attempt': attempt}, stream)
    os.replace(latest, run_root / 'latest.json')
    source = work / 'source'
    source.mkdir(mode=0o700)
    fd = open_source()
    counters = [0, 0]
    fingerprint = hashlib.sha256()
    manifest = []
    try:
        before = raw_git_metadata(fd)
        secure_copy(fd, source, counters, fingerprint, manifest=manifest)
        verification = hashlib.sha256()
        verification_counts = [0, 0]
        secure_copy(fd, None, verification_counts, verification)
        after = raw_git_metadata(fd)
    finally:
        os.close(fd)
    changed = before != after or counters != verification_counts or fingerprint.digest() != verification.digest()
    (work / 'copy.json').write_text(json.dumps({'files': counters[0], 'bytes': counters[1], 'sha256': fingerprint.hexdigest(), 'source': SOURCE, 'privateEnvCopied': False, 'gitBefore': before, 'gitAfter': after, 'sourceStateChanged': changed, 'snapshotVerification': 'second-bounded-public-source-hash', 'verificationSha256': verification.hexdigest(), 'manifest': manifest}))
    env = {'PATH': '/opt/jarvis-development/node/bin:/usr/bin:/bin', 'HOME': str(work), 'USER': 'superopen', 'LOGNAME': 'superopen', 'LANG': 'C.UTF-8', 'TMPDIR': str(work), 'CI': '1', 'COREPACK_HOME': '/home/superopen/.cache/node/corepack', 'MSF_DATABASE_URL': 'postgresql://invalid:invalid@127.0.0.1:1/isolated', 'MSF_REDIS_URL': 'redis://127.0.0.1:1', 'MSF_MINIO_ENDPOINT': '127.0.0.1', 'MSF_MINIO_PORT': '1'}
    abi = isolate_files(work)
    env['JARVIS_VALIDATION_LANDLOCK_ABI'] = str(abi)
    os.chdir(source)
    os.execve(NODE, [NODE, VALIDATOR, str(work), sys.argv[2]], env)

if __name__ == '__main__':
    main()
