"""Finite self-only syscall feature evidence; never a host census or product gate."""
import ctypes
import errno
import hashlib
import json
import os
import platform
import select
import signal
import stat


def need(value, code):
    if not value:
        raise RuntimeError(code)


def deadline(signum, frame):
    raise RuntimeError('KERNEL_FEATURE_DEADLINE')


def read_small(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        data = os.read(fd, 4097)
        need(len(data) <= 4096, 'KERNEL_FEATURE_READ_LIMIT')
        return data.decode('ascii', 'strict')
    finally:
        os.close(fd)


def pidfd_identity(fd, expected_pid):
    value = os.fstat(fd)
    rows = dict(row.split(':', 1) for row in read_small('/proc/self/fdinfo/' + str(fd)).splitlines())
    need(int(rows['Pid'].strip()) == expected_pid, 'KERNEL_FEATURE_PIDFD_IDENTITY')
    return [value.st_dev, value.st_ino, stat.S_IFMT(value.st_mode), rows['Pid'].strip(), rows['NSpid'].strip()]


def main():
    signal.signal(signal.SIGALRM, deadline)
    signal.alarm(8)
    held = []
    result = {'kind': 'r33-kernel-fd-self-feature', 'readComplete': False,
              'selfOnly': True, 'ownedChildQualified': False, 'foreignProcessRead': False,
              'wholeCensusQualified': False, 'cleanupIndependentlyVerified': False,
              'productAccepted': False, 'signalsToOtherProcesses': False}
    try:
        need(os.getuid() == 0 and os.getgid() == 0, 'KERNEL_FEATURE_EXPECT_ROOT')
        uname = platform.uname()
        need(uname.system == 'Linux' and uname.machine == 'x86_64', 'KERNEL_FEATURE_ARCH_UNSUPPORTED')
        result['kernelRelease'] = uname.release
        result['architecture'] = uname.machine
        result['bootSHA256'] = hashlib.sha256(read_small('/proc/sys/kernel/random/boot_id').strip().encode('ascii')).hexdigest()
        status = read_small('/proc/self/status')
        status_rows = dict(row.split(':', 1) for row in status.splitlines())
        result['callerIsolation'] = {key: status_rows[key].strip() for key in ['CapEff', 'NoNewPrivs', 'Seccomp']}
        pid = os.getpid()
        pfd = os.pidfd_open(pid, 0)
        held.append(pfd)
        original_pidfd = pidfd_identity(pfd, pid)
        poller = select.poll()
        poller.register(pfd, select.POLLIN | select.POLLHUP | select.POLLERR)
        need(poller.poll(0) == [], 'KERNEL_FEATURE_SELF_NOT_LIVE')
        read_end, write_end = os.pipe2(os.O_CLOEXEC | os.O_NONBLOCK)
        held.extend([read_end, write_end])
        original_pipe = os.fstat(read_end)
        libc = ctypes.CDLL(None, use_errno=True)
        libc.syscall.restype = ctypes.c_long

        def getfd(target):
            ctypes.set_errno(0)
            ret = libc.syscall(ctypes.c_long(438), ctypes.c_int(pfd), ctypes.c_int(target), ctypes.c_uint(0))
            return int(ret), ctypes.get_errno() if ret == -1 else 0

        duplicate, duplicate_errno = getfd(read_end)
        result['presentSlotErrno'] = duplicate_errno
        if duplicate < 0:
            need(duplicate_errno in [errno.EPERM, errno.ENOSYS, errno.EINVAL, errno.EMFILE, errno.ENFILE], 'KERNEL_FEATURE_UNEXPECTED_PRESENT_FAILURE')
            result['featureSupportedAndPermitted'] = False
            result['selfSlotAbsenceProven'] = False
        else:
            held.append(duplicate)
            dup_stat = os.fstat(duplicate)
            need((dup_stat.st_dev, dup_stat.st_ino, stat.S_IFMT(dup_stat.st_mode)) ==
                 (original_pipe.st_dev, original_pipe.st_ino, stat.S_IFMT(original_pipe.st_mode)), 'KERNEL_FEATURE_DUP_IDENTITY')
            need(pidfd_identity(pfd, pid) == original_pidfd and poller.poll(0) == [], 'KERNEL_FEATURE_PIDFD_CHANGED')
            os.close(duplicate)
            held.remove(duplicate)
            os.close(read_end)
            held.remove(read_end)
            # No intervening open, allocation, or child activity before this exact-slot syscall.
            absent, absent_errno = getfd(read_end)
            if absent >= 0:
                held.append(absent)
            need(absent == -1 and absent_errno == errno.EBADF, 'KERNEL_FEATURE_ABSENCE_UNPROVEN')
            need(pidfd_identity(pfd, pid) == original_pidfd and poller.poll(0) == [], 'KERNEL_FEATURE_PIDFD_CHANGED')
            result['absentSlotErrno'] = absent_errno
            result['validSelfPidfdBoundThroughout'] = True
            result['featureSupportedAndPermitted'] = True
            result['selfSlotAbsenceProven'] = True
        result['readComplete'] = True
    except (OSError, RuntimeError, ValueError, KeyError, UnicodeError) as error:
        result['errorCode'] = str(error) if isinstance(error, RuntimeError) and str(error).startswith('KERNEL_FEATURE_') else 'KERNEL_FEATURE_READ_INCOMPLETE'
        result['errno'] = getattr(error, 'errno', None)
    finally:
        close_errors = []
        for fd in reversed(held):
            try:
                os.close(fd)
            except OSError as error:
                close_errors.append(error.errno)
        if close_errors:
            result['readComplete'] = False
            result['errorCode'] = 'KERNEL_FEATURE_DESCRIPTOR_CLOSE_INCOMPLETE'
        result['descriptorsClosed'] = not close_errors
        signal.alarm(0)
    print(json.dumps(result, separators=(',', ':')))


if __name__ == '__main__':
    main()
