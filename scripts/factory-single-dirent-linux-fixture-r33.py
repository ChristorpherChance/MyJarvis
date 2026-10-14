"""Eight-second qualification of only /proc/self/fd and an owned held pipe.

The future trusted parent must verify these two tool sources and provide a closed
environment, UID/GID1000, NNP and zero capabilities. No parent/caller exists here.
Tool-source loading is distinct from descriptor-target or pipe content probing.
"""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import sys
import time
import types

MODULE_SHA256 = 'ab981cf22e75c75946a85150bffbd051ece574143446fd6b22f6a383bc44c6d8'
MAX_SECONDS = 8


def need(value, code):
    if not value:
        raise RuntimeError(code)


def source_module():
    path = Path(__file__).with_name('factory-single-dirent-r33.py')
    descriptor = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK)
    first_source_error = None
    try:
        before = os.fstat(descriptor)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0
             and before.st_nlink == 1 and not before.st_mode & 0o222
             and before.st_size <= 65536, 'R33_SELF_FD_TOOL_SOURCE_UNTRUSTED')
        raw = b''
        while True:
            part = os.read(descriptor, min(65536, 65537 - len(raw)))
            if not part:
                break
            raw += part
            need(len(raw) <= 65536, 'R33_SELF_FD_TOOL_SOURCE_BOUND')
        after = os.fstat(descriptor)
        linked = os.stat(path, follow_symlinks=False)
        keys = ['st_dev', 'st_ino', 'st_uid', 'st_gid', 'st_mode', 'st_nlink',
                'st_size', 'st_mtime_ns', 'st_ctime_ns']
        need(all(getattr(before, k) == getattr(after, k) == getattr(linked, k) for k in keys)
             and len(raw) == before.st_size and hashlib.sha256(raw).hexdigest() == MODULE_SHA256,
             'R33_SELF_FD_TOOL_SOURCE_CHANGED')
        module = types.ModuleType('fixed_single_dirent_r33')
        exec(compile(raw, 'fixed-single-dirent-r33', 'exec'), module.__dict__)
        return module
    except BaseException as error:
        first_source_error = error
        raise
    finally:
        try:
            os.close(descriptor)
        except BaseException as close_error:
            if first_source_error is None:
                close_error.fixtureSubphase = 'tool-source-close'
                raise
            first_source_error.secondaryCloseErrno = getattr(close_error, 'errno', None)


def self_security(module):
    module.assert_single_dirent_abi_r33()
    need(os.getuid() == os.geteuid() == 1000 and os.getgid() == os.getegid() == 1000,
         'R33_SELF_FD_UID_GID_REQUIRED')
    library = module._linux_libc_r33()
    library.prctl.restype = ctypes.c_int
    library.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong,
                             ctypes.c_ulong, ctypes.c_ulong]
    ctypes.set_errno(0)
    nnp = library.prctl(39, 0, 0, 0, 0)  # PR_GET_NO_NEW_PRIVS, read only.
    if nnp == -1:
        raise OSError(ctypes.get_errno(), 'R33_SELF_FD_NNP_QUERY_FAILED')
    need(nnp == 1, 'R33_SELF_FD_NNP_REQUIRED')

    class Header(ctypes.Structure):
        _fields_ = [('version', ctypes.c_uint32), ('pid', ctypes.c_int)]

    class Data(ctypes.Structure):
        _fields_ = [('effective', ctypes.c_uint32), ('permitted', ctypes.c_uint32),
                    ('inheritable', ctypes.c_uint32)]

    header, data = Header(0x20080522, 0), (Data * 2)()
    ctypes.set_errno(0)
    count = library.syscall(ctypes.c_long(125), ctypes.byref(header), ctypes.byref(data))
    if count == -1:
        raise OSError(ctypes.get_errno(), 'R33_SELF_FD_CAPGET_FAILED')
    need(count == 0, 'R33_SELF_FD_CAPGET_RESULT_INVALID')
    capabilities = {key: int(getattr(data[0], key)) | (int(getattr(data[1], key)) << 32)
                    for key in ['effective', 'permitted', 'inheritable']}
    need(all(v == 0 for v in capabilities.values()), 'R33_SELF_FD_CAPABILITIES_REQUIRED')
    return {'uid': 1000, 'gid': 1000, 'noNewPrivileges': True, 'capabilities': capabilities}


def run_self_fd_fixture():
    started = time.monotonic()
    held = []
    first_error = None
    phase = 'tool-source'
    value = {'schemaVersion': 1, 'kind': 'r33-single-dirent-self-fd-kernel-qualification',
             'actualSingleDirentKernelQualified': False, 'readComplete': False,
             'moduleSHA256': MODULE_SHA256, 'scope': 'only-own-proc-self-fd-and-held-pipe',
             'maximumSeconds': MAX_SECONDS, 'ownedChildCreated': False,
             'foreignProcessDescriptorsRead': False, 'descriptorTargetsRead': False,
             'descriptorOrPipeContentRead': False, 'descriptorOrPipeContentWritten': False,
             'environmentRead': False, 'filesystemWrites': False, 'externalSignalsSent': False,
             'selfDeadlineAlarmUsed': True, 'wholeProcCensusExecuted': False,
             'pidfdOrGetfdInvoked': False, 'oldExitProofChanged': False,
             'oldRaceResolved': False, 'cleanupIndependentlyVerified': False,
             'fullProtectionQualified': False, 'modelsInvoked': False,
             'productCodeExecuted': False, 'productAccepted': False}

    if sys.platform != 'linux':
        value.update({'firstError': {'phase': 'architecture',
                                    'errorCode': 'R33_SINGLE_DIRENT_LINUX_X86_64_LE_REQUIRED',
                                    'errno': None}, 'kernelCallsPerformed': False,
                      'allOwnedDescriptorsClosed': True, 'ownedDescriptorCount': 0,
                      'elapsedWithinDeadline': True, 'selfDeadlineAlarmUsed': False})
        return value

    def deadline(_signum, _frame):
        raise TimeoutError('R33_SELF_FD_DEADLINE')

    previous_handler = signal.signal(signal.SIGALRM, deadline)
    signal.alarm(MAX_SECONDS)
    try:
        module = source_module()
        phase = 'security'
        value['security'] = self_security(module)
        import fcntl  # Linux only, after architecture/security admission.
        phase = 'pipe-open'
        read_end, write_end = os.pipe2(os.O_CLOEXEC | os.O_NONBLOCK)
        held.extend([read_end, write_end])
        rd, wr = os.fstat(read_end), os.fstat(write_end)
        need(stat.S_ISFIFO(rd.st_mode) and stat.S_ISFIFO(wr.st_mode)
             and (rd.st_dev, rd.st_ino) == (wr.st_dev, wr.st_ino),
             'R33_SELF_FD_PIPE_IDENTITY_CHANGED')
        phase = 'directory-open'
        directory = os.open('/proc/self/fd', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        held.append(directory)
        before = os.fstat(directory)
        need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 1000,
             'R33_SELF_FD_DIRECTORY_UNTRUSTED')
        need(all(fcntl.fcntl(fd, fcntl.F_GETFD) & fcntl.FD_CLOEXEC for fd in held),
             'R33_SELF_FD_CLOEXEC_REQUIRED')
        phase = 'enumeration'
        records = []
        for entry in module.iter_single_dirent_r33(directory):
            need(time.monotonic() - started < MAX_SECONDS, 'R33_SELF_FD_DEADLINE')
            need(entry['name'] in [b'.', b'..'] or entry['name'].isdigit(),
                 'R33_SELF_FD_UNEXPECTED_ENTRY')
            records.append(entry)
        names = [entry['name'] for entry in records]
        need(len(set(names)) == len(names), 'R33_SELF_FD_DUPLICATE_ENTRY')
        need(b'.' in names and b'..' in names
             and all(str(fd).encode('ascii') in names for fd in held),
             'R33_SELF_FD_OWNED_SLOT_NOT_ENUMERATED')
        after = os.fstat(directory)
        need((before.st_dev, before.st_ino, before.st_uid, before.st_gid)
             == (after.st_dev, after.st_ino, after.st_uid, after.st_gid),
             'R33_SELF_FD_DIRECTORY_IDENTITY_CHANGED')
        need(all(fcntl.fcntl(fd, fcntl.F_GETFD) & fcntl.FD_CLOEXEC for fd in held),
             'R33_SELF_FD_OWNED_DESCRIPTOR_CHANGED')
        encoded = json.dumps([[v['inode'], v['type'], v['name'].hex(), v['recordBytes']]
                              for v in records], separators=(',', ':')).encode()
        value.update({'readComplete': True, 'enumerationComplete': True,
                      'entryCount': len(records), 'numericFDEntryCount': sum(n.isdigit() for n in names),
                      'recordSizeCounts': {str(n): sum(v['recordBytes'] == n for v in records)
                                           for n in [24, 32, 40]},
                      'entryRecordsSHA256': hashlib.sha256(encoded).hexdigest(),
                      'fixedBufferBytes': 47, 'minimumRecordBytes': 24,
                      'fixedEntryLimit': module.SINGLE_DIRENT_MAX_ENTRIES_R33,
                      'ownedPipeAndDirectorySlotsEnumerated': True,
                      'directoryIdentityBeforeAfterStable': True, 'allOwnedDescriptorsHeldDuringEnumeration': True,
                      'actualKernel': os.uname().release, 'actualMachine': os.uname().machine,
                      'selfPID': os.getpid(), 'getdentsCallsIncludingEOF': len(records) + 1})
    except BaseException as error:
        first_error = {'phase': getattr(error, 'fixtureSubphase', phase),
                       'errorCode': str(error) if str(error).startswith('R33_') else
                       error.strerror if isinstance(error, OSError) and str(error.strerror).startswith('R33_')
                       else 'R33_SELF_FD_OBSERVATION_INCOMPLETE',
                       'errno': getattr(error, 'errno', None),
                       'secondaryCloseErrno': getattr(error, 'secondaryCloseErrno', None)}
    finally:
        # Stop the self timer before cleanup so it cannot interrupt later closes.
        signal.alarm(0)
        close_errors = []
        for descriptor in reversed(held):
            try:
                os.close(descriptor)  # Includes descriptor zero.
            except OSError as error:
                close_errors.append({'errno': error.errno})
        signal.signal(signal.SIGALRM, previous_handler)
        value['ownedDescriptorCount'] = len(held)
        value['ownedDescriptorCloseAttempts'] = len(held)
        value['allOwnedDescriptorsClosed'] = not close_errors
        value['closeErrorCount'] = len(close_errors)
        if first_error is None and close_errors:
            first_error = {'phase': 'descriptor-close', 'errorCode': 'R33_SELF_FD_CLOSE_INCOMPLETE',
                           'errno': close_errors[0]['errno']}
    value['firstError'] = first_error
    value['actualSingleDirentKernelQualified'] = value['readComplete'] and first_error is None
    value['elapsedWithinDeadline'] = time.monotonic() - started < MAX_SECONDS
    if not value['elapsedWithinDeadline']:
        value['actualSingleDirentKernelQualified'] = False
        if value['firstError'] is None:
            value['firstError'] = {'phase': 'final', 'errorCode': 'R33_SELF_FD_DEADLINE', 'errno': None}
    return value


if __name__ == '__main__':
    if sys.argv[1:] != ['--execute-self-fd-fixture']:
        print(json.dumps({'kind': 'r33-single-dirent-self-fixture-preparation',
                          'ready': False, 'reason': 'R33_SELF_FD_EXPLICIT_ACTIVATION_REQUIRED',
                          'actualSingleDirentKernelQualified': False, 'kernelCallsPerformed': False,
                          'wholeProcCensusExecuted': False, 'productAccepted': False}))
    else:
        result = run_self_fd_fixture()
        print(json.dumps(result))
        if not result['actualSingleDirentKernelQualified']:
            sys.exit(1)
