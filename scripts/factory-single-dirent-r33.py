"""Fixed Linux x86_64 single-dirent reader. No path/process/census operations.

47 < 2 * 24 bounds each successful getdents64 call to one minimum-size record.
This shortens prefetch; it does not remove races after a returned directory entry.
"""
import ctypes
import os
import struct
import sys

GETDENTS64_SYSCALL_R33 = 217
SINGLE_DIRENT_BUFFER_BYTES_R33 = 47
SINGLE_DIRENT_MAX_ENTRIES_R33 = 2048
_RECORD_LENGTHS = (24, 32, 40)


def _need(value, code):
    if not value:
        raise ValueError(code)


def parse_single_dirent_r33(raw):
    """Parse only the bytes actually returned; EOF is exactly an empty buffer."""
    _need(type(raw) is bytes, 'R33_SINGLE_DIRENT_BYTES_REQUIRED')
    if not raw:
        return None
    _need(len(raw) <= SINGLE_DIRENT_BUFFER_BYTES_R33,
          'R33_SINGLE_DIRENT_BUFFER_BOUND')
    _need(len(raw) in _RECORD_LENGTHS, 'R33_SINGLE_DIRENT_LENGTH_INVALID')
    reclen = struct.unpack_from('<H', raw, 16)[0]
    _need(reclen == len(raw) and reclen in _RECORD_LENGTHS,
          'R33_SINGLE_DIRENT_RECORD_NOT_SINGLE')
    tail = raw[19:reclen]
    terminator = tail.find(b'\0')
    _need(terminator > 0, 'R33_SINGLE_DIRENT_NAME_INVALID')
    name = tail[:terminator]
    _need(b'/' not in name, 'R33_SINGLE_DIRENT_NAME_INVALID')
    _need(((19 + len(name) + 1 + 7) // 8) * 8 == reclen,
          'R33_SINGLE_DIRENT_NAME_LENGTH_MISMATCH')
    # d_off is intentionally not exposed, used, or supplied to lseek.
    # Bytes after the first NUL are padding, not text (and need not be zero).
    return {'inode': struct.unpack_from('<Q', raw, 0)[0],
            'type': raw[18], 'name': name, 'recordBytes': reclen}


def assert_single_dirent_abi_r33():
    _need(sys.platform == 'linux' and os.uname().machine == 'x86_64'
          and sys.byteorder == 'little' and ctypes.sizeof(ctypes.c_void_p) == 8
          and ctypes.sizeof(ctypes.c_long) == 8,
          'R33_SINGLE_DIRENT_LINUX_X86_64_LE_REQUIRED')


def _linux_libc_r33():
    assert_single_dirent_abi_r33()
    library = ctypes.CDLL(None, use_errno=True)
    library.syscall.restype = ctypes.c_long
    return library


def _read_single_dirent_from_libc_r33(fd, library):
    """Private production primitive; controlled tests supply only a fake libc."""
    _need(type(fd) is int and 0 <= fd <= 2147483647,
          'R33_SINGLE_DIRENT_DESCRIPTOR_INVALID')
    buffer = ctypes.create_string_buffer(SINGLE_DIRENT_BUFFER_BYTES_R33)
    ctypes.set_errno(0)
    count = library.syscall(ctypes.c_long(GETDENTS64_SYSCALL_R33),
                            ctypes.c_int(fd), ctypes.cast(buffer, ctypes.c_void_p),
                            ctypes.c_uint(SINGLE_DIRENT_BUFFER_BYTES_R33))
    _need(type(count) is int, 'R33_SINGLE_DIRENT_RESULT_INVALID')
    if count == -1:
        # Do not retry or reinterpret EINTR, ENOENT, EINVAL or any other errno.
        error_number = ctypes.get_errno()
        raise OSError(error_number, 'R33_SINGLE_DIRENT_SYSCALL_FAILED')
    _need(0 <= count <= SINGLE_DIRENT_BUFFER_BYTES_R33,
          'R33_SINGLE_DIRENT_RESULT_INVALID')
    return parse_single_dirent_r33(buffer.raw[:count])


def read_single_dirent_r33(fd):
    return _read_single_dirent_from_libc_r33(fd, _linux_libc_r33())


def iter_single_dirent_r33(fd):
    """Use the held directory's kernel cursor; never reopen, seek or retry."""
    library = _linux_libc_r33()
    count = 0
    while True:
        record = _read_single_dirent_from_libc_r33(fd, library)
        if record is None:
            return
        _need(count < SINGLE_DIRENT_MAX_ENTRIES_R33,
              'R33_SINGLE_DIRENT_ENTRY_LIMIT')
        count += 1
        yield record
