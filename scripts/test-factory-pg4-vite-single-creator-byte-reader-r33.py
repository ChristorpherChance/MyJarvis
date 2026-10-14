"""Two new controlled leaf groups. No Linux acquisition or package execution."""
import errno
import hashlib
import pathlib
import stat
import types
import unittest

raw=pathlib.Path('scripts/factory-pg4-vite-single-creator-byte-reader-r33.py').read_bytes()
module=types.ModuleType('controlled_vite_byte_reader')
exec(compile(raw,'controlled-vite-byte-source','exec'),module.__dict__)


class FakeOS:
    O_RDONLY=0;O_NOFOLLOW=1;O_CLOEXEC=2;O_NONBLOCK=4;SEEK_SET=0
    def __init__(self,read_error=False,close_error=False,mode=0o444):
        self.s=types.SimpleNamespace(st_dev=66306,st_ino=1000,st_uid=0,st_gid=0,
                                    st_mode=stat.S_IFREG|mode,st_nlink=1,st_size=3,
                                    st_mtime_ns=1791930000000000001,st_ctime_ns=1791930000000000002)
        self.read_error=read_error;self.close_error=close_error;self.second=False;self.offset=0;self.closes=[]
    def stat(self,name,dir_fd=None,follow_symlinks=False):assert not follow_symlinks;return self.s
    def fstat(self,fd):assert fd==0;return self.s
    def open(self,name,flags,dir_fd=None):assert flags&self.O_NOFOLLOW;return 0
    def read(self,fd,limit):
        assert fd==0
        if self.read_error and self.offset>0:raise OSError(errno.EIO,'controlled first read')
        blocks=[b'ab',b'c',b''] if not self.second else [b'a',b'bc',b'']
        b=blocks[self.offset];self.offset+=1;return b
    def lseek(self,fd,n,kind):assert (fd,n,kind)==(0,0,0);self.second=True;self.offset=0
    def close(self,fd):
        self.closes.append(fd)
        if self.close_error:raise OSError(errno.EBADF,'controlled close')


class LeafGroups(unittest.TestCase):
    def setUp(self):
        self.original_os=module.os;self.original_scope=module.SCOPE
        module.SCOPE={**module.SCOPE,'selectedBytes':3,'selectedSHA256':hashlib.sha256(b'abc').hexdigest()}
    def tearDown(self):module.os=self.original_os;module.SCOPE=self.original_scope
    def test_actual_second_blocks_and_large_nine_stat_fd_zero(self):
        fake=FakeOS();module.os=fake;r=module.Reader();r.read_leaf(123,'fixed.js',module.nine(fake.s));r.close_all()
        self.assertEqual(r.selected['bytes'],3);self.assertEqual(r.selected['sha256'],hashlib.sha256(b'abc').hexdigest())
        self.assertTrue(r.selected['twoReadsStable']);self.assertEqual(r.leaf_frame['namedBefore'][7],1791930000000000001)
        self.assertEqual(r.leaf_frame['namedBefore'],r.leaf_frame['heldAfter']);self.assertEqual(fake.closes,[0]);self.assertIsNone(r.first)
    def test_primary_read_partial_then_close_secondary_and_pretrust_metadata(self):
        fake=FakeOS(read_error=True,close_error=True);module.os=fake;r=module.Reader()
        with self.assertRaises(OSError):r.read_leaf(123,'fixed.js',module.nine(fake.s))
        r.close_all();self.assertEqual(r.first['errno'],errno.EIO);self.assertEqual(r.first['phase'],'LEAF_FIRST_READ')
        self.assertEqual(r.secondary[0]['errno'],errno.EBADF);self.assertEqual(r.partial[0]['originalFirstReadBytes'],2)
        self.assertEqual(fake.closes,[0]);self.assertFalse(r.closed[0]['closed'])
        fake=FakeOS(mode=0o600);module.os=fake;r=module.Reader()
        with self.assertRaisesRegex(RuntimeError,'UNTRUSTED'):r.read_leaf(123,'fixed.js',module.nine(fake.s))
        self.assertIsNotNone(r.leaf_frame['namedBefore']);self.assertEqual(r.partial[0]['originalFirstReadBytes'],0)


if __name__=='__main__':unittest.main()
