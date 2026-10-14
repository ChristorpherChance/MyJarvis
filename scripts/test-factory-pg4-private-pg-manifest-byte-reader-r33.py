"""Only controlled pure basis/policy and fake OS; no real syscall or actor."""
import ast,base64,hashlib,types,unittest
from pathlib import Path
SOURCE=Path('scripts/factory-pg4-private-pg-manifest-byte-reader-r33.py').read_bytes()
ast.parse(SOURCE)
m=types.ModuleType('controlled_private_pg_reader');exec(compile(SOURCE,'controlled-private-reader','exec'),m.__dict__)
TUPLE=Path('.jarvis-dev/maintenance/r33-pg4-pg-private-manifest-basis-original-nine-stat-1791934522804-658f4e81-d88a-46a4-97e3-982bc37fd4d4.json').read_bytes()
STDOUT=Path('.jarvis-dev/maintenance/r33-pg4-pg-private-manifest-basis-original-stdout-1791934522804-658f4e81-d88a-46a4-97e3-982bc37fd4d4.bin').read_bytes()
def payload():return {'scope':m.SCOPE,'programSHA256':hashlib.sha256(SOURCE).hexdigest(),'basisTupleRawBase64':base64.b64encode(TUPLE).decode(),'metadataStdoutRawBase64':base64.b64encode(STDOUT).decode()}
def stats(row):return types.SimpleNamespace(**dict(zip(['st_dev','st_ino','st_uid','st_gid','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns'],row)))
class FakeOS:
 O_RDONLY=0;O_DIRECTORY=1;O_NOFOLLOW=2;O_CLOEXEC=4;O_NONBLOCK=8;SEEK_SET=0
 def __init__(self,basis,content,scenario):self.basis=basis;self.content=content;self.scenario=scenario;self.rows={};self.nextfd=0;self.offset=0;self.readnumber=0;self.second=False;self.closed=[]
 def getuid(self):return 0
 geteuid=getuid;getgid=getuid;getegid=getuid
 def stat(self,name,dir_fd=None,follow_symlinks=False):
  if name==m.SCOPE['leafName']:return stats(self.basis)
  if name=='runtime':return stats([66306,6863174,0,0,0o40555,2,4096,100,100])
  return stats([66306,1000+len(str(name)),0,0,0o40555,2,4096,100,100])
 def open(self,name,flags,dir_fd=None):
  fd=self.nextfd;self.nextfd+=1;self.rows[fd]=self.stat(name,dir_fd);return fd
 def fstat(self,fd):return self.rows[fd]
 def read(self,fd,n):
  self.readnumber+=1
  if self.scenario=='read-close' and self.readnumber==2:raise OSError(5,'controlled primary read')
  block=self.content[self.offset:self.offset+n]
  if self.scenario=='second-change' and self.second and self.offset==0:block=b'X'+block[1:]
  self.offset+=len(block);return block
 def lseek(self,fd,offset,whence):self.offset=offset;self.second=True;return 0
 def close(self,fd):
  self.closed.append(fd)
  if self.scenario=='read-close' and fd==0:raise OSError(9,'controlled secondary close FD0')
class Controlled(unittest.TestCase):
 def test_original_basis_private_policy_fake_reads_and_first_secondary_fd0(self):
  basis=m.checked_basis(payload());self.assertEqual(len(basis),9)
  with self.assertRaisesRegex(RuntimeError,'SOURCE_INPUT_REQUIRED'):m.run(None)
  p=payload();p['basisTupleRawBase64']=base64.b64encode(TUPLE+b' ').decode()
  with self.assertRaisesRegex(RuntimeError,'BASIS_BYTES_CHANGED'):m.checked_basis(p)
  s=stats(basis);self.assertTrue(all(m.private_predicates(s,basis).values()))
  drift=basis.copy();drift[-1]+=1;self.assertFalse(m.private_predicates(s,drift)['originalBasisTupleEqual'])
  immutable=types.SimpleNamespace(**vars(s));immutable.st_mode=0o100444
  self.assertFalse(m.private_predicates(immutable,basis)['privateMode0600'])
  original=(m.os,m.platform,m.signal,m.sys,m.SCOPE)
  try:
   m.platform=types.SimpleNamespace(system=lambda:'Linux');m.signal=types.SimpleNamespace(ITIMER_REAL=0,getitimer=lambda x:(7.0,0.0));m.sys=types.SimpleNamespace(flags=types.SimpleNamespace(isolated=1))
   content=b'a'*35825
   # Controlled bytes replace only the expected hash in an isolated fake module; no actual d916 qualification.
   m.SCOPE={**original[4],'expectedContentSHA256':hashlib.sha256(content).hexdigest()}
   for scenario in ['pass','second-change','read-close']:
    fake=FakeOS(basis,content,scenario);m.os=fake;o=m.Observer(basis)
    try:o.observe()
    except BaseException as e:o.first_error=m.closed_error(e,o.phase)
    finally:o.close_all()
    v=o.result('a'*64,m.time.monotonic())
    self.assertIn(0,fake.closed);self.assertEqual(len(fake.closed),fake.nextfd)
    if scenario=='pass':self.assertTrue(v['readComplete']);self.assertEqual(v['secondReadComparedBytes'],35825)
    elif scenario=='second-change':self.assertFalse(v['readComplete']);self.assertEqual(v['firstClosedError']['phase'],'LEAF_SECOND_READ');self.assertEqual(v['secondReadMismatch']['offset'],0)
    else:self.assertFalse(v['readComplete']);self.assertEqual(v['firstClosedError']['errno'],5);self.assertEqual(v['secondaryClosedErrors'][0]['errno'],9);self.assertEqual(v['firstReadBytes'],8192);self.assertEqual(v['firstReadSHA256'],hashlib.sha256(content[:8192]).hexdigest())
  finally:m.os,m.platform,m.signal,m.sys,m.SCOPE=original
if __name__=='__main__':unittest.main()
