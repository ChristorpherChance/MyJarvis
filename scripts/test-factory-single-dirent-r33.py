"""Eight bounded local parser/syscall-adapter tests. No real kernel invocation."""
import ctypes
import errno
import importlib.util
from pathlib import Path
import struct
import unittest

spec = importlib.util.spec_from_file_location('single_dirent_under_test',
                                             Path(__file__).with_name('factory-single-dirent-r33.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def record(name, inode=7, offset=-100, kind=0, padding=0xFF):
    length = ((19 + len(name) + 1 + 7) // 8) * 8
    return (struct.pack('<QqHB', inode, offset, length, kind) + name + b'\0'
            + bytes([padding]) * (length - 19 - len(name) - 1))


class FakeLibc:
    def __init__(self, payload=b'', result=None, error_number=0):
        self.payload = payload
        self.result = len(payload) if result is None else result
        self.error_number = error_number
        self.calls = 0

    def syscall(self, number, fd, buffer, limit):
        self.calls += 1
        assert number.value == 217 and fd.value == 0 and limit.value == 47
        if self.payload:
            ctypes.memmove(buffer, self.payload, len(self.payload))
        ctypes.set_errno(self.error_number)
        return self.result


class SingleDirentTests(unittest.TestCase):
    def test_1_minimum_record_ignores_nonzero_padding_and_offset(self):
        parsed = module.parse_single_dirent_r33(record(b'.', offset=-9223372036854775808))
        self.assertEqual(parsed, {'inode': 7, 'type': 0, 'name': b'.', 'recordBytes': 24})
        self.assertNotIn('offset', parsed)

    def test_2_legal_longer_record_lengths_keep_name_bytes(self):
        self.assertEqual(module.parse_single_dirent_r33(record(b'12345'))['recordBytes'], 32)
        parsed = module.parse_single_dirent_r33(record(b'\xff' * 20))
        self.assertEqual(parsed['recordBytes'], 40)
        self.assertEqual(parsed['name'], b'\xff' * 20)

    def test_3_zero_is_only_eof_and_one_real_adapter_call(self):
        fake = FakeLibc(result=0)
        self.assertIsNone(module._read_single_dirent_from_libc_r33(0, fake))
        self.assertEqual(fake.calls, 1)

    def test_4_two_minimum_records_rejected(self):
        with self.assertRaisesRegex(ValueError, 'R33_SINGLE_DIRENT_BUFFER_BOUND'):
            module.parse_single_dirent_r33(record(b'.') + record(b'..'))

    def test_5_returned_length_must_equal_reclen(self):
        raw = bytearray(record(b'12345'))
        struct.pack_into('<H', raw, 16, 24)
        with self.assertRaisesRegex(ValueError, 'R33_SINGLE_DIRENT_RECORD_NOT_SINGLE'):
            module.parse_single_dirent_r33(bytes(raw))

    def test_6_missing_name_nul_rejected(self):
        raw = struct.pack('<QqHB', 7, 0, 24, 0) + b'abcde'
        with self.assertRaisesRegex(ValueError, 'R33_SINGLE_DIRENT_NAME_INVALID'):
            module.parse_single_dirent_r33(raw)

    def test_7_long_entry_einval_is_preserved_not_buffer_expansion(self):
        fake = FakeLibc(result=-1, error_number=errno.EINVAL)
        with self.assertRaises(OSError) as caught:
            module._read_single_dirent_from_libc_r33(0, fake)
        self.assertEqual(caught.exception.errno, errno.EINVAL)
        self.assertEqual(fake.calls, 1)

    def test_8_eintr_and_enoent_are_not_retried_or_eof(self):
        for number in [errno.EINTR, errno.ENOENT]:
            fake = FakeLibc(result=-1, error_number=number)
            with self.assertRaises(OSError) as caught:
                module._read_single_dirent_from_libc_r33(0, fake)
            self.assertEqual(caught.exception.errno, number)
            self.assertEqual(fake.calls, 1)


if __name__ == '__main__':
    unittest.main()
