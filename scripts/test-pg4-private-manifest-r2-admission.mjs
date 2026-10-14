/** One new integration group for the precise A policy and actual byte-source DATA gate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readPG4SourceAdmissionQualificationR33 as qualify} from './factory-pg4-source-admission-r33-private-manifest-r2.mjs';
test('exact private leaf current double bytes, immutable other receipts, saved source bindings and default0IO',async()=>{
 let n=0;await assert.rejects(qualify(null,new Proxy({},{ownKeys(){n++;throw Error('no dependencies')}})),/PG4_A_NOT_SOURCE_QUALIFIED/);assert.equal(n,0);
 const rawPath='.jarvis-dev/maintenance/r33-pg4-private-pg-manifest-original-d916c96e-1791936880629-b5dc0cf4-c6c4-4e4c-8999-3275d9c332fb.bin',raw=await readFile(rawPath);assert.equal(raw.length,35825);assert.equal(createHash('sha256').update(raw).digest('hex'),'d916c96e199ab7230a6397cd1f4f6fdbceacf30588a16b6943dc8da2996b6eb1');
 const script=String.raw`import pathlib,types,stat,errno
b=pathlib.Path('${rawPath}').read_bytes();m=types.ModuleType('controlled_admission');exec(compile(pathlib.Path('scripts/factory-pg4-source-admission-r33-private-manifest-r2.py').read_bytes(),'controlled-admission','exec'),m.__dict__)
class OS:
 O_RDONLY=0;O_NOFOLLOW=1;O_NONBLOCK=2;O_CLOEXEC=4;SEEK_SET=0
 def __init__(self,fail=False):
  self.fail=fail;self.second=False;self.offset=0;self.closed=[]
  self.parent=types.SimpleNamespace(st_dev=66306,st_ino=99,st_uid=0,st_gid=0,st_mode=stat.S_IFDIR|0o700,st_nlink=1,st_size=4096,st_mtime_ns=1791930000000000001,st_ctime_ns=1791930000000000002)
  self.leaf=types.SimpleNamespace(st_dev=66306,st_ino=100,st_uid=0,st_gid=0,st_mode=stat.S_IFREG|0o600,st_nlink=1,st_size=35825,st_mtime_ns=1791930000000000001,st_ctime_ns=1791930000000000002)
 def stat(self,p,dir_fd=None,follow_symlinks=False):
  assert not follow_symlinks
  return self.parent if p==m.PG_PARENT else self.leaf
 def fstat(self,fd):return self.parent if fd==88 else self.leaf
 def open(self,name,flags,dir_fd=None):assert name=='runtime-manifest.json' and dir_fd==88;return 0
 def read(self,fd,amount):
  assert fd==0
  if self.fail:
   if self.offset:raise OSError(errno.EIO,'controlled read')
   self.offset=128;return b[:128]
  if self.offset>=len(b):return b''
  block=b[self.offset:self.offset+(11111 if self.second else 17000)];self.offset+=len(block);return block
 def lseek(self,fd,pos,whence):assert (fd,pos,whence)==(0,0,0);self.second=True;self.offset=0
 def close(self,fd):
  self.closed.append(fd)
  if self.fail:raise OSError(errno.EBADF,'controlled close')
o=OS();m.os=o;r=m.Reader();x=r.private_pg_manifest(88);assert x['raw']==b and x['bytes']==35825 and x['sha256']==m.SCOPE['pgManifestSHA256'];assert o.closed==[0] and not r.opened and not r.unresolved
try:r.file(88,'runtime-metadata.json',65536,True)
except RuntimeError as e:assert str(e)=='PG4_A_FILE_UNTRUSTED'
else:raise AssertionError('other immutable receipt admitted')
o=OS(True);m.os=o;r=m.Reader()
try:r.private_pg_manifest(88)
except OSError as e:assert e.errno==errno.EIO
else:raise AssertionError('first read failure accepted')
assert r.first['errno']==errno.EIO and r.secondary[0]['errno']==errno.EBADF and r.partial[0]['bytesRead']==128 and 0 in r.unresolved
print('one controlled A integration group passed; no Linux filesystem acquisition')
`;
 const r=spawnSync('C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe',['-I','-c',script],{windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr?.toString());
 const source=(await readFile('scripts/factory-pg4-source-admission-r33-private-manifest-r2.mjs')).toString();assert.ok(source.includes('PG4_A_PRIVATE_MANIFEST_BYTE_SOURCES_REQUIRED'));assert.ok(source.includes('pgAudit.PGManifestToolInputQualified===true'));assert.ok(source.includes('pgAudit.historicalQualificationNotFreshPG4===true'));
});
