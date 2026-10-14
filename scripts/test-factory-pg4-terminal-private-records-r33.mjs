/** One related controlled group. Root/Docker/source runtime is never executed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('private 0600 receipts retain strict held reads while 0444 sources stay immutable',()=>{
 const r=spawnSync('C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe',['-c',String.raw`
import ast,pathlib,types,stat,posixpath
new=pathlib.Path('scripts/factory-pg4-qa-startup-worker-r33.py').read_bytes()
old=pathlib.Path('artifacts/software-factory/goals-r29/r33-pg4-terminal-record-immutable-defect-source-ad61d7f9b394bd64fd05e9ae85126edc3e167dba4d8e1e3d48c1cb9456c0ed7e.py').read_bytes()
def module(raw):
 t=ast.parse(raw);t.body=[n for n in t.body if not isinstance(n,ast.If)];m=types.ModuleType('controlled_receipts');exec(compile(t,'controlled','exec'),m.__dict__);m.Path=pathlib.PurePosixPath;m.ROOT=m.Path('/controlled/root');return m
class FakeOS:
 O_RDONLY=0;O_NOFOLLOW=0x20000;O_NONBLOCK=0x800;O_CLOEXEC=0x80000
 def __init__(self):
  self.next=0;self.fd={};self.opens={};self.change=False
  self.files={'once.json':[b'once',0o444],'state.json':[b'state',0o600],'control/worker.py':[b'source',0o444],'control/postgres.env':[b'private1',0o600],'control/pg4-runner.env':[b'private2',0o600],'tools/driver.mjs':[b'driver',0o444],'work/capture.json':[b'capture',0o600]}
  self.dirs=['','control','tools','work']
 def rel(self,p,dir_fd=None):
  p=str(p)
  if not p.startswith('/'):p=self.fd[dir_fd][0]+'/'+p
  return p.removeprefix('/controlled/root').lstrip('/')
 def frame(self,rel):
  d=rel in self.dirs;body,mode=(b'',0o555) if d else self.files[rel]
  return types.SimpleNamespace(st_dev=7,st_ino=100+sum(map(ord,rel)),st_uid=0,st_gid=0,st_mode=(stat.S_IFDIR if d else stat.S_IFREG)|mode,st_nlink=2 if d else 1,st_size=4096 if d else len(body),st_mtime_ns=1791916234428123456,st_ctime_ns=1791916234428123457)
 def stat(self,p,dir_fd=None,follow_symlinks=False):return self.frame(self.rel(p,dir_fd))
 def fstat(self,fd):return self.frame(self.rel(self.fd[fd][0]))
 def open(self,p,flags=0,dir_fd=None):
  rel=self.rel(p,dir_fd);fd=self.next;self.next+=1;self.opens[rel]=self.opens.get(rel,0)+1
  body=None if rel in self.dirs else self.files[rel][0]
  if self.change and rel=='state.json' and self.opens[rel]%2==0:body=b'other'
  self.fd[fd]=['/controlled/root'+('/'+rel if rel else ''),body,0];return fd
 def read(self,fd,n):
  v=self.fd[fd];b=v[1][v[2]:v[2]+n];v[2]+=len(b);return b
 def close(self,fd):self.fd.pop(fd)
 def listdir(self,fd):
  rel=self.rel(self.fd[fd][0]);prefix=rel+'/' if rel else '';return sorted({p[len(prefix):].split('/')[0] for p in [*self.files,*self.dirs] if p.startswith(prefix) and p!=rel})
def setup(raw):
 m=module(raw);f=FakeOS();m.os=f;m.held_dir=lambda p:f.open(p);return m,f
m,f=setup(old)
try:m.terminal_original_records()
except RuntimeError as e:assert str(e)=='PG4_R33_FILE_UNTRUSTED'
else:raise AssertionError('old defect must refuse private600')
m,f=setup(new);rows=m.terminal_original_records();assert len(rows)==7 and f.fd=={} and all(f.opens[p]==2 for p in f.files)
assert rows['state.json']['sha256']==m.sha(b'state') and rows['control/postgres.env']['bytes']==8
m,f=setup(new);f.files['control/worker.py'][1]=0o600
try:m.terminal_original_records()
except RuntimeError as e:assert str(e)=='PG4_R33_FILE_UNTRUSTED'
else:raise AssertionError('static600 accepted')
assert f.fd=={}
m,f=setup(new);f.files['state.json'][1]=0o620
try:m.terminal_original_records()
except RuntimeError as e:assert str(e)=='PG4_R33_FILE_UNTRUSTED'
else:raise AssertionError('private group writable accepted')
m,f=setup(new);f.change=True
try:m.terminal_original_records()
except RuntimeError as e:assert str(e)=='PG4_R33_TERMINAL_RECORD_CHANGED'
else:raise AssertionError('second changed bytes accepted')
assert f.fd=={}
print('old600 refused; new private exact records accepted; static/group write/second change reject; mock-only')
`],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/mock-only/);
});
