"""Trusted finite lifecycle only; default call performs no I/O.

The reviewed helper and original exit proof execute only in the UID1000 fixture.
No remote files, whole census, candidate packages, API or SQL operations.
"""
import base64
import ctypes
import errno
import hashlib
import json
import os
import select
import selectors
import signal
import stat
import subprocess
import sys
import time

WORK_SECONDS = 12
CLEANUP_SECONDS = 3
MAX_INPUT = 524288
MAX_STDOUT = 262144
MAX_STDERR = 65536
LAUNCHER = r'''import base64,ctypes,hashlib,json,os,sys,time
expected=int(sys.argv[1])
if expected<=1 or os.getppid()!=expected:raise SystemExit(71)
libc=ctypes.CDLL(None,use_errno=True)
libc.prctl.argtypes=[ctypes.c_int,ctypes.c_ulong,ctypes.c_ulong,ctypes.c_ulong,ctypes.c_ulong]
libc.prctl.restype=ctypes.c_int
if libc.prctl(38,1,0,0,0)!=0 or libc.prctl(1,9,0,0,0)!=0 or os.getppid()!=expected:raise SystemExit(72)
raw=sys.stdin.buffer.read(524289)
if len(raw)>524288:raise SystemExit(73)
p=json.loads(raw)
if set(p)!={'fixture','helper','native','expectedParentIdentity','deadline'}:raise SystemExit(74)
sources={}
for name in ['fixture','helper','native']:
 row=p[name];b=base64.b64decode(row['base64'],validate=True)
 if not b or len(b)>131072 or hashlib.sha256(b).hexdigest()!=row['sha256']:raise SystemExit(75)
 sources[name]=b
if not time.monotonic()<p['deadline']:raise SystemExit(76)
ns={'__name__':'fixed_bounded_hup_method_fixture_r33'}
exec(compile(sources['fixture'],'fixed-bounded-hup-method-fixture-r33','exec'),ns)
v=ns['execute_method'](native_source_bytes=sources['native'],helper_source_bytes=sources['helper'],enclosing_deadline=p['deadline'],expected_parent_identity=p['expectedParentIdentity'])
b=(json.dumps(v,separators=(',',':'))+'\n').encode()
if len(b)>262144:raise SystemExit(77)
sys.stdout.buffer.write(b);sys.stdout.buffer.flush()
'''


def need(ok, code):
    if not ok:
        raise RuntimeError(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def safe_error(error, phase):
    code = str(error)
    if not code.startswith('R33_HUP_PARENT_') or not code.replace('_', '').isalnum():
        code = 'R33_HUP_PARENT_INCOMPLETE'
    return {'phase': phase, 'code': code,
            'errno': error.errno if type(getattr(error, 'errno', None)) is int else None}


def identity(pid):
    need(type(pid) is int and pid > 1, 'R33_HUP_PARENT_PID_INVALID')
    path = '/proc/' + str(pid)
    before = os.stat(path, follow_symlinks=False)
    need(stat.S_ISDIR(before.st_mode), 'R33_HUP_PARENT_PROC_NOT_DIRECTORY')
    with open(path + '/stat', 'rb') as f:
        raw = f.read(4097)
    with open(path + '/status', 'rb') as f:
        status_raw = f.read(65537)
    need(len(status_raw) <= 65536, 'R33_HUP_PARENT_STATUS_LIMIT')
    status_fields = dict(line.split(b':', 1) for line in status_raw.splitlines() if b':' in line)
    uids, gids = [int(x) for x in status_fields[b'Uid'].split()], [int(x) for x in status_fields[b'Gid'].split()]
    need(len(uids) == len(gids) == 4, 'R33_HUP_PARENT_CREDENTIALS_INVALID')
    need(len(raw) <= 4096 and raw.startswith(str(pid).encode() + b' ('),
         'R33_HUP_PARENT_STAT_INVALID')
    end = raw.rfind(b') ')
    fields = raw[end + 2:].split()
    need(end > 1 and len(fields) >= 20, 'R33_HUP_PARENT_STAT_INVALID')
    with open('/proc/sys/kernel/random/boot_id', encoding='ascii') as f:
        boot = f.read(37).strip()
    need(len(boot) == 36 and all(c in '0123456789abcdef-' for c in boot),
         'R33_HUP_PARENT_BOOT_INVALID')
    after = os.stat(path, follow_symlinks=False)
    need((before.st_dev, before.st_ino, before.st_uid, before.st_gid) ==
         (after.st_dev, after.st_ino, after.st_uid, after.st_gid),
         'R33_HUP_PARENT_PROC_CHANGED')
    return {'pid': pid, 'ppid': int(fields[1]), 'startTime': int(fields[19]),
            'boot': boot, 'procDevice': before.st_dev, 'procInode': before.st_ino,
            'uid': uids[1], 'gid': gids[1]}


def pidfd_mask(fd):
    poll = select.poll()
    poll.register(fd, select.POLLIN)
    rows = poll.poll(0)
    need(len(rows) <= 1 and all(row[0] == fd for row in rows),
         'R33_HUP_PARENT_PIDFD_ROWS_INVALID')
    mask = rows[0][1] if rows else 0
    need(mask & ~(select.POLLIN | select.POLLHUP) == 0,
         'R33_HUP_PARENT_PIDFD_MASK_INVALID')
    return mask


def absent(pid):
    try:
        os.stat('/proc/' + str(pid), follow_symlinks=False)
        return False
    except OSError as error:
        if error.errno != errno.ENOENT:
            raise
        return True


def communicate_bounded(process, payload, deadline):
    """Bounded pipe transport; never reaps or signals the fixture's own child."""
    output, errors = bytearray(), bytearray()
    selector = selectors.DefaultSelector()
    streams = [('stdin', process.stdin), ('stdout', process.stdout), ('stderr', process.stderr)]
    offset, primary = 0, None
    try:
        for role, stream in streams:
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_WRITE if role == 'stdin' else selectors.EVENT_READ, role)
        while selector.get_map():
            remaining = deadline - time.monotonic()
            need(remaining > 0, 'R33_HUP_PARENT_WORK_TIMEOUT')
            events = selector.select(remaining)
            need(events, 'R33_HUP_PARENT_WORK_TIMEOUT')
            for key, _ in events:
                role, stream = key.data, key.fileobj
                if role == 'stdin':
                    offset += os.write(stream.fileno(), payload[offset:offset + 16384])
                    if offset == len(payload):
                        selector.unregister(stream)
                        stream.close()
                else:
                    block = os.read(stream.fileno(), 16384)
                    if not block:
                        selector.unregister(stream)
                        stream.close()
                    else:
                        target, limit = (output, MAX_STDOUT) if role == 'stdout' else (errors, MAX_STDERR)
                        target.extend(block)
                        need(len(target) <= limit, 'R33_HUP_PARENT_OUTPUT_LIMIT')
        process.wait(timeout=max(0.001, deadline - time.monotonic()))
        need(time.monotonic() <= deadline, 'R33_HUP_PARENT_WORK_TIMEOUT')
        return bytes(output), bytes(errors)
    except BaseException as error:
        primary = error
        error.capturedStdout = bytes(output)
        error.capturedStderr = bytes(errors)
        raise
    finally:
        try:
            selector.close()
        except BaseException as error:
            if primary is None:
                error.capturedStdout = bytes(output)
                error.capturedStderr = bytes(errors)
                raise
            primary.selectorCloseError = safe_error(error, 'TRANSPORT_SELECTOR_CLOSE')


def run_supervisor(bundle=None):
    if bundle is None:
        return {'kind': 'r33-bounded-hup-method-supervisor-preparation', 'ready': False,
                'reason': 'R33_HUP_PARENT_EXPLICIT_BUNDLE_REQUIRED', 'remoteOperationsPerformed': False}
    started = time.monotonic()
    deadline = started + WORK_SECONDS
    def on_deadline(signum, frame):
        raise TimeoutError('R33_HUP_PARENT_WORK_OR_CLEANUP_TIMEOUT')
    previous_alarm = signal.signal(signal.SIGALRM, on_deadline)
    signal.alarm(WORK_SECONDS)
    phase = 'INPUT'
    result = {'schemaVersion': 1, 'kind': 'r33-bounded-hup-method-parent-observation',
              'methodProducerPassed': False, 'currentOwnedScopeProducerClosed': False,
              'independentlyQualified': False, 'fullProtectionQualified': False,
              'actualPG4Qualified': False, 'productAccepted': False, 'signalsSent': False,
              'firstFailure': None, 'secondaryFailures': [], 'fixtureIdentity': None,
              'fixtureResult': None, 'fixtureExitCode': None, 'fixturePIDFDClosed': False,
              'pipeDescriptorsClosed': False, 'knownActorFrames': []}
    process, fd, stdout, stderr, bound = None, None, b'', b'', None
    try:
        need(type(bundle) is dict and set(bundle) == {'fixture', 'helper', 'native', 'contextSHA256'},
             'R33_HUP_PARENT_BUNDLE_INVALID')
        need(type(bundle['contextSHA256']) is str and len(bundle['contextSHA256']) == 64,
             'R33_HUP_PARENT_CONTEXT_INVALID')
        for name in ['fixture', 'helper', 'native']:
            row = bundle[name]
            need(type(row) is dict and set(row) == {'base64', 'sha256'}, 'R33_HUP_PARENT_SOURCE_INVALID')
            raw = base64.b64decode(row['base64'], validate=True)
            need(0 < len(raw) <= 131072 and digest(raw) == row['sha256'], 'R33_HUP_PARENT_SOURCE_CHANGED')
        need(sys.platform == 'linux' and os.uname().machine == 'x86_64', 'R33_HUP_PARENT_PLATFORM_INVALID')
        need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0, 'R33_HUP_PARENT_ROOT_REQUIRED')
        parent = identity(os.getpid())
        result['parentIdentity'] = parent
        result['contextSHA256'] = bundle['contextSHA256']
        result['sourceSHA256'] = {name: bundle[name]['sha256'] for name in ['fixture', 'helper', 'native']}
        phase = 'SPAWN'
        process = subprocess.Popen(['/usr/bin/python3', '-I', '-B', '-c', LAUNCHER, str(parent['pid'])],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   user=1000, group=1000, extra_groups=[], close_fds=True,
                                   env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'})
        phase = 'BIND_FIXTURE_BEFORE_INPUT'
        bound = identity(process.pid)
        fd = os.pidfd_open(process.pid, 0)
        need(bound == identity(process.pid) and bound['ppid'] == parent['pid']
             and bound['boot'] == parent['boot'], 'R33_HUP_PARENT_FIXTURE_ATTACH_CHANGED')
        need(pidfd_mask(fd) == 0, 'R33_HUP_PARENT_FIXTURE_NOT_LIVE')
        result['fixtureIdentity'] = bound
        payload = json.dumps({name: bundle[name] for name in ['fixture', 'helper', 'native']} |
                             {'expectedParentIdentity': parent, 'deadline': deadline}, separators=(',', ':')).encode()
        need(len(payload) <= MAX_INPUT, 'R33_HUP_PARENT_INPUT_LIMIT')
        phase = 'FIXTURE_COMMUNICATION'
        stdout, stderr = communicate_bounded(process, payload, deadline)
        result['fixtureExitCode'] = process.returncode
        phase = 'FIXTURE_RESULT'
        need(process.returncode == 0 and not stderr, 'R33_HUP_PARENT_FIXTURE_FAILED')
        value = json.loads(stdout)
        result['fixtureResult'] = value
        need(type(value) is dict and value.get('selfIdentity') == bound, 'R33_HUP_PARENT_FIXTURE_IDENTITY_CHANGED')
        child = value.get('childIdentity')
        need(type(child) is dict and set(child) == set(bound) and child['pid'] not in [parent['pid'], process.pid]
             and type(child['pid']) is int and child['pid'] > 1 and child['ppid'] == process.pid
             and child['boot'] == parent['boot'], 'R33_HUP_PARENT_CHILD_IDENTITY_MISSING')
        phase = 'FINITE_CURRENT_SCOPE'
        for _ in range(2):
            mask = pidfd_mask(fd)
            frame = {'atMonotonic': time.monotonic(), 'fixturePIDFDEvents': mask,
                     'fixturePathAbsent': absent(process.pid), 'childPathAbsent': absent(child['pid'])}
            result['knownActorFrames'].append(frame)
            need(mask & select.POLLIN and frame['fixturePathAbsent'] and frame['childPathAbsent'],
                 'R33_HUP_PARENT_OWNED_SCOPE_INCOMPLETE')
        need(time.monotonic() <= deadline, 'R33_HUP_PARENT_WORK_TIMEOUT')
        result['currentOwnedScopeProducerClosed'] = True
        # The exact reviewed fixture contract is checked by the caller and independent saved audit.
        result['methodProducerPassed'] = value.get('fixtureQualified') is True
    except BaseException as error:
        result['firstFailure'] = safe_error(error, phase)
        if hasattr(error, 'selectorCloseError'):
            result['secondaryFailures'].append(error.selectorCloseError)
        stdout = getattr(error, 'capturedStdout', stdout)
        stderr = getattr(error, 'capturedStderr', stderr)
        result['methodProducerPassed'] = False
        result['currentOwnedScopeProducerClosed'] = False
    finally:
        signal.alarm(CLEANUP_SECONDS)
        if process is not None:
            try:
                if process.poll() is None:
                    # Exact owned fixture PIDFD only. Its child has parent-death protection.
                    need(fd is not None and bound is not None and identity(process.pid) == bound,
                         'R33_HUP_PARENT_EMERGENCY_IDENTITY_UNKNOWN')
                    signal.pidfd_send_signal(fd, signal.SIGKILL, None, 0)
                    result['signalsSent'] = True
                    process.wait(timeout=CLEANUP_SECONDS)
            except BaseException as error:
                result['secondaryFailures'].append(safe_error(error, 'OWNED_EMERGENCY_CLEANUP'))
            pipe_ok = True
            for stream in [process.stdin, process.stdout, process.stderr]:
                try:
                    if stream is not None and not stream.closed:
                        stream.close()
                except BaseException as error:
                    pipe_ok = False
                    result['secondaryFailures'].append(safe_error(error, 'PIPE_CLOSE'))
            result['pipeDescriptorsClosed'] = pipe_ok
        if fd is not None:
            try:
                os.close(fd)
                result['fixturePIDFDClosed'] = True
            except BaseException as error:
                result['secondaryFailures'].append(safe_error(error, 'FIXTURE_PIDFD_CLOSE'))
        result['fixtureStdoutBase64'] = base64.b64encode(stdout).decode()
        result['fixtureStderrBase64'] = base64.b64encode(stderr).decode()
        result['fixtureStdoutSHA256'] = digest(stdout)
        result['fixtureStderrSHA256'] = digest(stderr)
        result['fixtureStdoutBytes'] = len(stdout)
        result['fixtureStderrBytes'] = len(stderr)
        result['elapsedSeconds'] = time.monotonic() - started
        if result['firstFailure'] or result['secondaryFailures'] or result['signalsSent'] or not result['fixturePIDFDClosed'] or not result['pipeDescriptorsClosed']:
            result['methodProducerPassed'] = False
            result['currentOwnedScopeProducerClosed'] = False
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous_alarm)
    return result
