"""One new fake-OS private-PG helper group. No lifecycle, Root, process, or framework execution."""
import ast,contextlib,hashlib,re,stat,types,unittest
from pathlib import Path
SOURCE=Path('scripts/factory-pg4-qa-startup-worker-r33-private-manifest-r2.py').read_bytes()
TREE=ast.parse(SOURCE)
NAMES={'need','sha','key','error_frame','descriptor','read_private_pg_manifest'}
DEFS=[n for n in TREE.body if isinstance(n,ast.FunctionDef) and n.name in NAMES]
assert len(DEFS)==len(NAMES)
content=b'a'*35825
G={'__name__':'controlled_private_pg_helper','contextlib':contextlib,'hashlib':hashlib,'re':re,'stat':stat,'Path':Path,'PG_RUNTIME':Path('/var/lib/jarvis-development/101/r29-qa-pg-runtime/3c7ade1178fc47184cd9aaba9e84b855/runtime'),'PG_MANIFEST_SHA':hashlib.sha256(content).hexdigest()}
exec(compile(ast.Module(body=DEFS,type_ignores=[]),'trusted-controlled-helper-defs','exec'),G)
def st(ino,mode,size):return types.SimpleNamespace(st_dev=66306,st_ino=ino,st_uid=0,st_gid=0,st_mode=mode,st_nlink=1,st_size=size,st_mtime_ns=100,st_ctime_ns=100)
class FakeOS:
 O_RDONLY=0;O_DIRECTORY=1;O_NOFOLLOW=2;O_CLOEXEC=4;O_NONBLOCK=8;SEEK_SET=0
 def __init__(self,case):self.case=case;self.offset=0;self.second=False;self.reads=0;self.closed=[];self.primary=OSError(5,'controlled read');self.leaf=st(777,0o100600 if case!='mode' else 0o100444,35825);self.parent=st(111,0o40700,4096);self.runtime=st(6863174,0o40555,4096)
 def fstat(self,fd):return {0:self.parent,1:self.runtime,2:self.leaf}[fd]
 def stat(self,name,dir_fd=None,follow_symlinks=False):
  if isinstance(name,Path) and name==G['PG_RUNTIME'].parent:return self.parent
  return self.runtime if name=='runtime' else self.leaf
 def open(self,name,flags,dir_fd=None):return 1 if name=='runtime' else 2
 def read(self,fd,n):
  self.reads+=1
  if self.case=='read-close' and self.reads==2:raise self.primary
  b=content[self.offset:self.offset+n]
  if self.case=='second' and self.second and self.offset==0:b=b'X'+b[1:]
  self.offset+=len(b);return b
 def lseek(self,fd,offset,whence):self.offset=0;self.second=True;return 0
 def close(self,fd):
  self.closed.append(fd)
  if self.case=='read-close' and fd==2:raise OSError(9,'controlled secondary leaf close')
  if self.case=='read-close' and fd==0:raise OSError(16,'controlled secondary FD0 parent close')
class Controlled(unittest.TestCase):
 def test_fixed_private_policy_dual_held_and_first_close_secondary(self):
  G['held_dir']=lambda path:0
  for case in ['pass','mode','hash','second','read-close']:
   fake=FakeOS(case);G['os']=fake;G['PG_MANIFEST_SHA']=hashlib.sha256(content).hexdigest() if case!='hash' else 'b'*64
   if case=='pass':self.assertEqual(G['read_private_pg_manifest'](),content);self.assertEqual(fake.closed,[2,1,0])
   elif case=='read-close':
    with self.assertRaises(OSError) as got:G['read_private_pg_manifest']()
    self.assertIs(got.exception,fake.primary);self.assertEqual(got.exception.errno,5);self.assertEqual(len(got.exception.secondaryFailures),2);self.assertEqual(fake.closed,[2,1,0])
   else:
    with self.assertRaisesRegex(RuntimeError,{'mode':'MANIFEST_UNTRUSTED','hash':'HASH_CHANGED','second':'SECOND_READ_CHANGED'}[case]):G['read_private_pg_manifest']()
    self.assertIn(0,fake.closed)
  old=ast.parse(Path('scripts/factory-pg4-qa-startup-worker-r33.py').read_bytes());a=next(n for n in old.body if isinstance(n,ast.FunctionDef) and n.name=='read_root');b=next(n for n in TREE.body if isinstance(n,ast.FunctionDef) and n.name=='read_root');self.assertEqual(ast.dump(a,include_attributes=False),ast.dump(b,include_attributes=False))
if __name__=='__main__':unittest.main()
