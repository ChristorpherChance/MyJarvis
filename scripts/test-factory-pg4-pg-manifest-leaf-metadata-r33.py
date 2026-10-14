"""Two controlled OS-data groups. No Linux acquisition, subprocess, or remote calls."""
import errno
import pathlib
import stat
import types
import unittest

source = pathlib.Path("scripts/factory-pg4-pg-manifest-leaf-metadata-r33.py").read_bytes()
module = types.ModuleType("controlled_pg_leaf_metadata")
exec(compile(source, "controlled-pg-leaf-metadata-source", "exec"), module.__dict__)


def st(mode, inode, size=1):
    return types.SimpleNamespace(st_dev=66306, st_ino=inode, st_uid=0, st_gid=0,
                                st_mode=mode, st_nlink=1, st_size=size,
                                st_mtime_ns=1791930000000000001, st_ctime_ns=1791930000000000002)


class FakeOS:
    O_RDONLY=0; O_DIRECTORY=0x10000; O_NOFOLLOW=0x20000; O_CLOEXEC=0x80000; O_PATH=0x200000
    def __init__(self, mode, fail_open=False, fail_close=False):
        self.mode=mode; self.fail_open=fail_open; self.fail_close=fail_close
        self.fds={}; self.next=0; self.opened=[]; self.closed=[]
    getuid=geteuid=getgid=getegid=lambda self: 0
    def stat(self, name, dir_fd=None, follow_symlinks=False):
        assert follow_symlinks is False
        if name == 'runtime-manifest.json': return st(self.mode,90001,123)
        return st(stat.S_IFDIR|0o755,6863174 if name=='runtime' else 100+len(str(name)))
    def open(self, name, flags, dir_fd=None):
        self.opened.append((name,flags))
        if name=='runtime-manifest.json':
            assert flags & self.O_PATH and flags & self.O_NOFOLLOW
            if self.fail_open: raise FileNotFoundError(errno.ENOENT,'controlled absent')
        else: assert flags & self.O_DIRECTORY and flags & self.O_NOFOLLOW
        fd=self.next; self.next+=1; self.fds[fd]=self.stat(name,dir_fd,False); return fd
    def fstat(self, fd): return self.fds[fd]
    def close(self, fd):
        self.closed.append(fd)
        if fd==0 and self.fail_close: raise OSError(errno.EIO,'controlled close')
        del self.fds[fd]


class MetadataGroups(unittest.TestCase):
    def invoke(self, fake):
        old_os,old_platform,old_sys=module.os,module.platform,module.sys
        module.os=fake;module.platform=types.SimpleNamespace(system=lambda:'Linux')
        module.sys=types.SimpleNamespace(flags=types.SimpleNamespace(isolated=1))
        try:return module.run({'scope':module.SCOPE,'programSHA256':'a'*64})
        finally:module.os,module.platform,module.sys=old_os,old_platform,old_sys
    def test_named_metadata_before_old_trust_and_symlink_object(self):
        for mode in (stat.S_IFREG|0o600,stat.S_IFLNK|0o777):
            fake=FakeOS(mode);v=self.invoke(fake)
            self.assertTrue(v['metadataReadComplete']);self.assertFalse(v['currentOldPredicateAll'])
            self.assertEqual(v['leafMetadata']['namedBefore'],v['leafMetadata']['heldAfter'])
            self.assertEqual(v['leafMetadata']['namedBefore'][7],1791930000000000001)
            self.assertTrue(v['allDescriptorsClosed']);self.assertIn(0,fake.closed)
            self.assertFalse(v['leafContentRead']);self.assertFalse(v['symlinkTargetRead'])
            self.assertEqual(v['leafAttributesSafe']['type'],'regular' if stat.S_ISREG(mode) else 'symlink')
    def test_first_errno_partial_named_tuple_and_secondary_close_fd_zero(self):
        fake=FakeOS(stat.S_IFREG|0o600,fail_open=True,fail_close=True);v=self.invoke(fake)
        self.assertFalse(v['metadataReadComplete']);self.assertFalse(v['allDescriptorsClosed'])
        self.assertEqual(v['firstClosedError']['phase'],'LEAF_OPATH_BIND')
        self.assertEqual(v['firstClosedError']['errno'],errno.ENOENT)
        self.assertEqual(v['secondaryClosedErrors'][0]['errno'],errno.EIO)
        self.assertIsNotNone(v['leafMetadata']['namedBefore']);self.assertIsNone(v['leafMetadata']['heldBefore'])
        self.assertIn(0,fake.closed);self.assertFalse(v['d916ContentQualified'])


if __name__=='__main__':unittest.main()
