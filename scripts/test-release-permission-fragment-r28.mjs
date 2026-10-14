import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {releasePermissionHardeningFragment,permissionsR28Params} from './read-platform-release-permissions-r28.mjs';
test('fixed dry-run scope rejects other machine IDs',()=>{assert.equal(permissionsR28Params('101').release,'20261012-supervision-r28-2');assert.throws(()=>permissionsR28Params('116'),/NODE_INVALID/);});
test('actual Python fragment parses and controlled FD filesystem exercises default read, CAS, ordered strip-only and link boundaries',()=>{
 const fixture=String.raw`
import ast,types,copy,posixpath
from pathlib import PurePosixPath
source=p['fragment'];ast.parse(source)
class FakePath(PurePosixPath):
 def lstat(self):return fs.stat(str(self))
class FakeFS:
 def __init__(self):
  self.nodes={};self.fds={};self.nextfd=10;self.changes=[];self.syncs=[]
  for name in ['/','/opt','/opt/jarvis','/opt/jarvis/releases']:self.add(name,stat.S_IFDIR|0o755)
  self.root='/opt/jarvis/releases/fixture-release';self.add(self.root,stat.S_IFDIR|0o777)
  self.add(self.root+'/.managed-release.sha256',stat.S_IFREG|0o644,body=b'a'*64+b'\n')
  self.add(self.root+'/apps',stat.S_IFDIR|0o777);self.add(self.root+'/apps/code.js',stat.S_IFREG|0o666,body=b'public-code')
  self.add(self.root+'/private',stat.S_IFDIR|0o700);self.add(self.root+'/private/config',stat.S_IFREG|0o600,body=b'not-read')
  self.add(self.root+'/tool',stat.S_IFREG|0o755,body=b'public-tool');self.add(self.root+'/inside',stat.S_IFLNK|0o777,target='tool')
  self.add(self.root+'/hard-a',stat.S_IFREG|0o444,body=b'x',nlink=2);self.add(self.root+'/hard-b',stat.S_IFREG|0o444,body=b'x',nlink=2,inode=self.nodes[self.root+'/hard-a']['inode'])
 def add(self,name,mode,body=b'',target=None,nlink=1,inode=None):self.nodes[name]={'mode':mode,'uid':0,'gid':973,'inode':inode or len(self.nodes)+100,'nlink':nlink,'body':body,'target':target,'ctime':1,'mtime':2}
 def stat(self,name):
  n=self.nodes[str(name)];return types.SimpleNamespace(st_dev=7,st_ino=n['inode'],st_uid=n['uid'],st_gid=n['gid'],st_mode=n['mode'],st_nlink=n['nlink'],st_size=len(n['body']),st_mtime_ns=n['mtime'],st_ctime_ns=n['ctime'])
 def path(self,name,dir_fd=None):return posixpath.normpath(str(name) if dir_fd is None else posixpath.join(self.fds[dir_fd],str(name)))
 def open(self,name,flags,dir_fd=None):
  path=self.path(name,dir_fd);s=self.stat(path)
  if flags&os.O_NOFOLLOW and stat.S_ISLNK(s.st_mode):raise OSError('nofollow')
  if flags&os.O_DIRECTORY and not stat.S_ISDIR(s.st_mode):raise OSError('not-dir')
  self.nextfd+=1;self.fds[self.nextfd]=path;return self.nextfd
 def close(self,fd):del self.fds[fd]
 def dup(self,fd):self.nextfd+=1;self.fds[self.nextfd]=self.fds[fd];return self.nextfd
 def listdir(self,fd):return [name.rsplit('/',1)[1] for name in self.nodes if name!='/' and posixpath.dirname(name)==self.fds[fd]]
 def read(self,fd,count):return self.nodes[self.fds[fd]]['body'][:count]
 def readlink(self,name,dir_fd=None):return self.nodes[self.path(name,dir_fd)]['target']
 def realpath(self,name):
  n=self.nodes[str(name)]
  return posixpath.normpath(posixpath.join(posixpath.dirname(str(name)),n['target'])) if n['target'] else str(name)
 def chmod(self,fd,mode):
  path=self.fds[fd];n=self.nodes[path];self.changes.append([path,n['mode']&0o7777,mode]);n['mode']=stat.S_IFMT(n['mode'])|mode;n['ctime']+=1
 def sync(self,fd):self.syncs.append(self.fds[fd])
class FakeOS:
 O_RDONLY=0;O_DIRECTORY=1;O_NOFOLLOW=2;O_NONBLOCK=4
 def __init__(self):self.path=types.SimpleNamespace(realpath=lambda name:fs.realpath(name))
 def geteuid(self):return 0
 def open(self,*a,**k):return fs.open(*a,**k)
 def close(self,fd):return fs.close(fd)
 def dup(self,fd):return fs.dup(fd)
 def fstat(self,fd):return fs.stat(fs.fds[fd])
 def stat(self,name,dir_fd=None,follow_symlinks=False):assert follow_symlinks is False;return fs.stat(fs.path(name,dir_fd))
 def listdir(self,fd):return fs.listdir(fd)
 def read(self,fd,count):return fs.read(fd,count)
 def readlink(self,*a,**k):return fs.readlink(*a,**k)
 def fchmod(self,fd,mode):return fs.chmod(fd,mode)
 def fsync(self,fd):return fs.sync(fd)
namespace={};exec(compile(ast.parse(source),'actual-fragment','exec'),namespace);os=FakeOS();namespace['os']=os;namespace['Path']=FakePath
fn=namespace['release_permission_hardening'];fs=FakeFS();before=copy.deepcopy(fs.nodes)
dry=fn('fixture-release','a'*64);assert dry['dryRun'] and not dry['mutationsPerformed'] and fs.nodes==before and not fs.changes and not fs.fds
assert [(v['path'],v['afterMode']) for v in dry['changes']]==[('',0o755),('apps',0o755),('apps/code.js',0o644)]
try:fn('fixture-release','a'*64,True,dry['identity'],'b'*64);raise AssertionError('CAS bypass')
except RuntimeError as e:assert str(e)=='RELEASE_PERMISSION_APPROVED_SNAPSHOT_REQUIRED'
assert not fs.changes and not fs.fds
result=fn('fixture-release','a'*64,True,dry['identity'],dry['metadataSHA256']);assert result['verified'] and len(fs.changes)==3 and not fs.fds
assert [v[0] for v in fs.changes]==[fs.root,fs.root+'/apps',fs.root+'/apps/code.js']
for path,n in fs.nodes.items():
 old=before[path];assert n['body']==old['body'] and n['inode']==old['inode'] and n['uid']==old['uid'] and n['gid']==old['gid'] and n['mtime']==old['mtime'];assert n['mode']==old['mode']&~0o022 if path in [v[0] for v in fs.changes] else n['mode']==old['mode']
assert fs.nodes[fs.root+'/private']['mode']&0o777==0o700 and fs.nodes[fs.root+'/private/config']['mode']&0o777==0o600 and fs.nodes[fs.root+'/tool']['mode']&0o777==0o755
assert fs.nodes[fs.root+'/inside']['target']=='tool' and fs.nodes[fs.root+'/hard-a']['mode']==before[fs.root+'/hard-a']['mode']
for case,expected in [('outside','RELEASE_PERMISSION_EXTERNAL_SYMLINK_REQUIRES_REVIEW'),('hardlink','RELEASE_PERMISSION_WRITABLE_HARDLINK_REQUIRES_REVIEW'),('owner','RELEASE_PERMISSION_FILE_OWNER_UNTRUSTED')]:
 fs=FakeFS()
 if case=='outside':fs.nodes[fs.root+'/inside']['target']='/etc/private'
 if case=='hardlink':fs.nodes[fs.root+'/hard-a']['mode']=stat.S_IFREG|0o666
 if case=='owner':fs.nodes[fs.root+'/apps/code.js']['uid']=1000
 try:fn('fixture-release','a'*64);raise AssertionError('unsafe boundary accepted')
 except RuntimeError as e:assert str(e)==expected
 assert not fs.changes and not fs.fds
for release in ['../current','/opt','fixture/release']:
 try:fn(release,'a'*64);raise AssertionError('scope bypass')
 except RuntimeError as e:assert str(e)=='RELEASE_PERMISSION_SCOPE_INVALID'
print(json.dumps({'passed':True,'actualProductionFunctionExecuted':True,'filesystem':'controlled Python FD adapter; not a Linux permission or race proof','checks':['default-no-write','approved-snapshot-CAS','root-first-order','strip022-only','700-600-execute-preserved','inode-owner-content-mtime-preserved','internal-link-never-chmod','readonly-hardlink-unchanged','external-link-reject','writable-hardlink-reject','nonroot-file-reject','fixed-release-scope','no-FD-leaks']}))
`;
 const payload=Buffer.from(JSON.stringify({fragment:releasePermissionHardeningFragment})).toString('base64');const input="import json,base64,stat\np=json.loads(base64.b64decode('"+payload+"'))\n"+fixture;
 const r=spawnSync('python',['-'],{input,encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:100000});assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout.trim());assert.equal(result.passed,true);assert.equal(result.checks.length,13);
});
