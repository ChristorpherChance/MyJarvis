import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readPG4SourceAdmissionQualificationR33 as q} from './factory-pg4-source-admission-r33-private-receipts-r3.mjs';
test('r3 exact metadata private reader and generic refusal retains original relative-leaf guard facts',async()=>{
 let n=0;await assert.rejects(q(null,new Proxy({},{ownKeys(){n++;throw Error('deps')}})),/PG4_A_NOT_SOURCE_QUALIFIED/);assert.equal(n,0);
 const python=String.raw`import pathlib,types,stat,errno,hashlib
m=types.ModuleType('controlled');exec(compile(pathlib.Path('scripts/factory-pg4-source-admission-r33-private-receipts-r3.py').read_bytes(),'controlled-source','exec'),m.__dict__)
body=b'{"controlledMetadata":"original bytes only"}'
class OS:
 O_RDONLY=0;O_NOFOLLOW=1;O_NONBLOCK=2;O_CLOEXEC=4;SEEK_SET=0
 def __init__(self,fail=False):
  self.fail=fail;self.offset=0;self.second=False;self.closed=[]
  self.parent=types.SimpleNamespace(st_dev=66306,st_ino=70,st_uid=0,st_gid=0,st_mode=stat.S_IFDIR|0o700,st_nlink=1,st_size=4096,st_mtime_ns=1791940000000000001,st_ctime_ns=1791940000000000002)
  self.leaf=types.SimpleNamespace(st_dev=66306,st_ino=71,st_uid=0,st_gid=0,st_mode=stat.S_IFREG|0o600,st_nlink=1,st_size=len(body),st_mtime_ns=1791940000000000001,st_ctime_ns=1791940000000000002)
 def stat(self,p,dir_fd=None,follow_symlinks=False):assert follow_symlinks is False;return self.parent if p==m.PG_PARENT else self.leaf
 def fstat(self,fd):return self.parent if fd==88 else self.leaf
 def open(self,name,flags,dir_fd=None):assert name=='runtime-metadata.json' and dir_fd==88;return 0
 def read(self,fd,amount):
  assert fd==0
  if self.fail:
   if self.offset:raise OSError(errno.EIO,'controlled read')
   self.offset=12;return body[:12]
  if self.offset>=len(body):return b''
  x=body[self.offset:self.offset+(7 if self.second else 13)];self.offset+=len(x);return x
 def lseek(self,fd,pos,whence):assert (fd,pos,whence)==(0,0,0);self.second=True;self.offset=0
 def close(self,fd):
  self.closed.append(fd)
  if self.fail:raise OSError(errno.EBADF,'controlled close')
o=OS();m.os=o;r=m.Reader()
try:r.private_pg_metadata(88)
except RuntimeError as e:assert str(e)=='PG4_A_PRIVATE_PG_METADATA_BYTES_CHANGED' and r.partial[0]['bytesRead']==len(body)
else:raise AssertionError('real3fee expected hash bypassed')
m.SCOPE=dict(m.SCOPE);m.SCOPE['pgMetadataRawSHA256']=hashlib.sha256(body).hexdigest() # only this controlled module's fake data pin
o=OS();m.os=o;r=m.Reader();x=r.private_pg_metadata(88);assert x['raw']==body and x['bytes']==len(body) and o.closed==[0] and not r.unresolved
r=m.Reader()
try:r.file(88,'index.js',1000,False,None,relative_leaf='node_modules/pg/lib/index.js')
except RuntimeError as e:assert str(e)=='PG4_A_FILE_UNTRUSTED'
else:raise AssertionError('generic mutable file admitted')
row=r.partial[0];assert row['relativeLeaf']=='node_modules/pg/lib/index.js' and row['namedBefore']==m.key(o.leaf) and row['guard']['regular'] and row['guard']['uid0'] and row['guard']['gid0'] and row['guard']['nlink1'] and not row['guard']['immutableNoWrite'] and row['bytesRead']==0 and row['readStarted'] is False
o=OS(True);m.os=o;r=m.Reader()
try:r.private_pg_metadata(88)
except OSError as e:assert e.errno==errno.EIO
else:raise AssertionError('first read error lost')
assert r.first['errno']==errno.EIO and r.secondary[0]['errno']==errno.EBADF and r.partial[0]['bytesRead']==12 and 0 in r.unresolved
print('one new controlled r3 data group; no physical metadata value measured')
`;
 const p=spawnSync('C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe',['-I','-c',python],{windowsHide:true,timeout:10000});assert.equal(p.status,0,p.stderr?.toString());
});
