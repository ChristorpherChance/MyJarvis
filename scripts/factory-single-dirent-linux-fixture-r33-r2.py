"""Memory-bundle self-FD fixture; the trusted parent owns the entire8-second timer.

No stdin/path/source-file reads or timer changes. The future caller verifies both
physical tool hashes, starts alarm8 before input, clears env, drops groups/UID/GID
and sets NNP before same-process exec/call. Default entry performs no kernel I/O.
"""
import base64
import ctypes
import errno
import hashlib
import json
import math
import os
import signal
import stat
import time
import types
import sys

MODULE_SHA256 = 'ab981cf22e75c75946a85150bffbd051ece574143446fd6b22f6a383bc44c6d8'
MAX_SECONDS = 8


def need(value, code):
    if not value:
        raise RuntimeError(code)


def preparation_result():
    return {'schemaVersion': 1, 'kind': 'r33-single-dirent-self-fixture-preparation-r2',
            'ready': False, 'reason': 'R33_SELF_FD_EXPLICIT_BUNDLE_AND_PARENT_REQUIRED',
            'actualSingleDirentKernelQualified': False, 'kernelCallsPerformed': False,
            'wholeProcCensusExecuted': False, 'productAccepted': False}


def bundle_module(bundle):
    need(type(bundle) is dict and set(bundle) == {'moduleSHA256', 'moduleBase64'}
         and bundle['moduleSHA256'] == MODULE_SHA256
         and type(bundle['moduleBase64']) is str
         and len(bundle['moduleBase64']) <= 87384,
         'R33_SELF_FD_BUNDLE_INVALID')
    try:
        raw = base64.b64decode(bundle['moduleBase64'], validate=True)
    except (ValueError, UnicodeError):
        raise RuntimeError('R33_SELF_FD_BUNDLE_INVALID') from None
    need(len(raw) <= 65536 and hashlib.sha256(raw).hexdigest() == MODULE_SHA256
         and base64.b64encode(raw).decode('ascii') == bundle['moduleBase64'],
         'R33_SELF_FD_MODULE_BYTES_CHANGED')
    module = types.ModuleType('fixed_single_dirent_r33')
    exec(compile(raw, 'fixed-single-dirent-r33', 'exec'), module.__dict__)
    return module


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
    ctypes.set_errno(0)
    dumpable = library.prctl(3, 0, 0, 0, 0)  # PR_GET_DUMPABLE, read only.
    if dumpable == -1:
        raise OSError(ctypes.get_errno(), 'R33_SELF_FD_DUMPABLE_QUERY_FAILED')
    need(dumpable in [0, 1, 2], 'R33_SELF_FD_DUMPABLE_RESULT_INVALID')

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
    return {'uid': 1000, 'gid': 1000, 'noNewPrivileges': True, 'capabilities': capabilities,
            'dumpable': dumpable, 'expectedOwnProcDirectoryUIDGID': 1000 if dumpable == 1 else 0}


def run_self_fd_fixture_r33_r2(bundle=None, parentStartedMonotonic=None):
    if bundle is None or parentStartedMonotonic is None:
        return preparation_result()
    started = parentStartedMonotonic
    held = []
    first_error = None
    phase = 'bundle-and-parent-budget'
    value = {'schemaVersion': 1, 'kind': 'r33-single-dirent-self-fd-kernel-qualification-r2',
             'actualSingleDirentKernelQualified': False, 'readComplete': False,
             'moduleSHA256': MODULE_SHA256, 'scope': 'only-own-proc-self-fd-and-held-pipe',
             'maximumSeconds': MAX_SECONDS, 'ownedChildCreated': False,
             'foreignProcessDescriptorsRead': False, 'descriptorTargetsRead': False,
             'descriptorOrPipeContentRead': False, 'descriptorOrPipeContentWritten': False,
             'environmentRead': False, 'filesystemWrites': False, 'externalSignalsSent': False,
             'parentDeadlineAlarmRequired': True, 'parentTimerResetOrCancelledByFixture': False, 'wholeProcCensusExecuted': False,
             'pidfdOrGetfdInvoked': False, 'oldExitProofChanged': False,
             'oldRaceResolved': False, 'cleanupIndependentlyVerified': False,
             'fullProtectionQualified': False, 'modelsInvoked': False,
             'productCodeExecuted': False, 'productAccepted': False}

    if sys.platform != 'linux':
        value.update({'firstError': {'phase': 'architecture',
                                    'errorCode': 'R33_SINGLE_DIRENT_LINUX_X86_64_LE_REQUIRED',
                                    'errno': None}, 'kernelCallsPerformed': False,
                      'allOwnedDescriptorsClosed': True, 'ownedDescriptorCount': 0,
                      'elapsedWithinDeadline': True, 'parentBudgetValidated': False})
        return value

    try:
        need(type(started) is float and math.isfinite(started)
             and 0 <= time.monotonic() - started < MAX_SECONDS,
             'R33_SELF_FD_PARENT_START_REQUIRED')
        remaining, interval = signal.getitimer(signal.ITIMER_REAL)
        need(0 < remaining <= MAX_SECONDS and interval == 0,
             'R33_SELF_FD_PARENT_TIMER_REQUIRED')
        value['parentBudgetValidated'] = True
        module = bundle_module(bundle)
        value['moduleSourceFromMemoryBundle'] = True
        value['toolSourceFileRead'] = False
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
        expected_owner = value['security']['expectedOwnProcDirectoryUIDGID']
        need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == expected_owner,
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
                      'ownProcDirectoryUIDGID': before.st_uid, 'dumpabilityNotChanged': True,
                      'ownProcDirectoryIdentityBefore': {'device': before.st_dev, 'inode': before.st_ino,
                                                        'uid': before.st_uid, 'gid': before.st_gid,
                                                        'mode': stat.S_IMODE(before.st_mode)},
                      'ownProcDirectoryIdentityAfter': {'device': after.st_dev, 'inode': after.st_ino,
                                                       'uid': after.st_uid, 'gid': after.st_gid,
                                                       'mode': stat.S_IMODE(after.st_mode)},
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
        close_errors = []
        for descriptor in reversed(held):
            try:
                os.close(descriptor)  # Includes descriptor zero.
            except BaseException as error:
                close_errors.append({'errno': getattr(error, 'errno', None),
                                     'errorCode': str(error) if str(error).startswith('R33_')
                                     else 'R33_SELF_FD_CLOSE_INCOMPLETE'})
            # Verification is metadata-only on our own precise descriptor slot.
            try:
                os.fstat(descriptor)
                close_errors.append({'errno': None})
            except OSError as error:
                if error.errno != errno.EBADF:
                    close_errors.append({'errno': error.errno})
            except BaseException as error:
                close_errors.append({'errno': getattr(error, 'errno', None)})
        value['ownedDescriptorCount'] = len(held)
        value['ownedDescriptorCloseAttempts'] = len(held)
        value['allOwnedDescriptorsClosed'] = not close_errors
        value['closeErrorCount'] = len(close_errors)
        if first_error is None and close_errors:
            first_error = {'phase': 'descriptor-close',
                           'errorCode': close_errors[0].get('errorCode', 'R33_SELF_FD_CLOSE_INCOMPLETE'),
                           'errno': close_errors[0]['errno']}
    value['firstError'] = first_error
    value['actualSingleDirentKernelQualified'] = value['readComplete'] and first_error is None
    value['elapsedWithinDeadline'] = (type(started) is float and math.isfinite(started)
                                     and 0 <= time.monotonic() - started < MAX_SECONDS)
    if not value['elapsedWithinDeadline']:
        value['actualSingleDirentKernelQualified'] = False
        if value['firstError'] is None:
            value['firstError'] = {'phase': 'final', 'errorCode': 'R33_SELF_FD_DEADLINE', 'errno': None}
    return value


if __name__ == '__main__':
    # Actual invocation is the future reviewed parent function call, never CLI.
    print(json.dumps(preparation_result()))
