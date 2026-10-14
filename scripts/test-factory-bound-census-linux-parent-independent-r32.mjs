/** New owner permission/controller guards. Controlled OS only; no Linux/root/systemd execution. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {boundCensusLinuxR32HostProgram} from './start-factory-bound-census-linux-r32.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function python(code,data){const r=spawnSync('python',['-c',code],{input:JSON.stringify(data),encoding:'utf8',windowsHide:true,timeout:12000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)}
test('actual UID1000 owner uses O_PATH to traverse root0711, validates root controls and own work via separate FD modes',()=>{const source=readFileSync('scripts/factory-bound-census-linux-owner-r32.py','utf8');assert.equal(sha(source),'367e5358cbb0a6e63f2edbcb726db6f147dece552ccb0e357f67666cfdc754fc');const code=String.raw`
import ast,json,sys,stat,types,errno
from pathlib import PurePosixPath as Path
x=json.load(sys.stdin);tree=ast.parse(x['source']);wanted={'need','key','root_directory','read_control','save_bytes_work'};body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in wanted];assert len(body)==5
def info(uid,gid,mode,ino=9,size=0,nlink=1):return types.SimpleNamespace(st_dev=1,st_ino=ino,st_uid=uid,st_gid=gid,st_mode=mode,st_nlink=nlink,st_size=size,st_mtime_ns=1234567890123456789,st_ctime_ns=1234567890123456790)
class OS:
 O_RDONLY=0;O_PATH=4;O_DIRECTORY=1;O_NOFOLLOW=2;O_NONBLOCK=8;O_WRONLY=16;O_CREAT=32;O_EXCL=64
 def __init__(self):self.entries={'/':info(0,0,stat.S_IFDIR|0o755,1),'/qual':info(0,0,stat.S_IFDIR|0o711,2),'/qual/job':info(0,0,stat.S_IFDIR|0o711,3),'/qual/job/control':info(0,0,stat.S_IFDIR|0o555,4),'/qual/job/control/a':info(0,0,stat.S_IFREG|0o444,5,3),'/qual/job/work':info(1000,1000,stat.S_IFDIR|0o700,6)};self.next=20;self.fds={};self.opens=[];self.closed=[];self.fsyncs=[];self.offset={};self.swap=None;self.zero=False
 def name(self,n,dir_fd=None):return str(n) if dir_fd is None else self.fds[dir_fd].rstrip('/')+'/'+str(n)
 def stat(self,n,dir_fd=None,follow_symlinks=False):assert follow_symlinks is False;return self.entries[self.name(n,dir_fd)]
 def open(self,n,flags,mode=None,dir_fd=None):
  name=self.name(n,dir_fd);self.opens.append((name,flags))
  if flags&self.O_CREAT:self.entries[name]=info(1000,1000,stat.S_IFREG|mode,20)
  s=self.entries[name]
  if stat.S_ISDIR(s.st_mode) and s.st_uid==0 and stat.S_IMODE(s.st_mode)==0o711 and not flags&self.O_PATH:raise PermissionError(errno.EACCES,'PRIVATE_ROOT0711')
  self.next+=1;f=self.next;self.fds[f]=name;self.offset[f]=0;return f
 def fstat(self,f):
  s=self.entries[self.fds[f]]
  return info(s.st_uid,s.st_gid,s.st_mode,s.st_ino+1,s.st_size,s.st_nlink) if self.swap==self.fds[f] else s
 def read(self,f,n):b=b'abc'[self.offset[f]:self.offset[f]+n];self.offset[f]+=len(b);return b
 def write(self,f,view):return 0 if self.zero else len(view)
 def fchmod(self,f,mode):assert mode==0o600
 def fsync(self,f):self.fsyncs.append((self.fds[f],f))
 def close(self,f):self.closed.append(f)
g={'Path':Path,'stat':stat};exec(compile(ast.Module(body=body,type_ignores=[]),'actual-owner-permission-functions','exec'),g)
def frame():o=OS();g['os']=o;return o
cases=0;o=frame();raw,_=g['read_control']('/qual/job/control','a');assert raw==b'abc';assert all(flags&o.O_PATH for path,flags in o.opens if path in ['/','/qual','/qual/job','/qual/job/control']);assert set(o.closed)==set(o.fds);cases+=1
for mode in [0o700,0o733]:
 o=frame();o.entries['/qual'].st_mode=stat.S_IFDIR|mode
 try:g['root_directory']('/qual/job/control')
 except RuntimeError as e:assert str(e)=='R32_BOUND_OWNER_PARENT_UNTRUSTED'
 else:raise AssertionError('bad ancestor accepted')
 cases+=1
for change in ['writable','link','hardlink','swap']:
 o=frame();s=o.entries['/qual/job/control/a']
 if change=='writable':s.st_mode=stat.S_IFREG|0o644
 elif change=='link':s.st_mode=stat.S_IFLNK|0o777
 elif change=='hardlink':s.st_nlink=2
 else:o.swap='/qual/job/control/a'
 try:g['read_control']('/qual/job/control','a')
 except RuntimeError:pass
 else:raise AssertionError('bad control accepted')
 assert set(o.closed)==set(o.fds);cases+=1
o=frame();g['save_bytes_work'](Path('/qual/job/work'),'result.json',b'123');opened=next(flags for path,flags in o.opens if path=='/qual/job/work');assert opened&o.O_DIRECTORY and not opened&o.O_PATH;assert [path for path,_ in o.fsyncs]==['/qual/job/work/result.json','/qual/job/work'];assert set(o.closed)==set(o.fds);cases+=1
o=frame();o.entries['/qual/job/work'].st_uid=0
try:g['save_bytes_work'](Path('/qual/job/work'),'result.json',b'123')
except RuntimeError as e:assert str(e)=='R32_BOUND_OWNER_WORK_UNTRUSTED'
else:raise AssertionError('wrong work owner accepted')
cases+=1
o=frame();o.zero=True
try:g['save_bytes_work'](Path('/qual/job/work'),'result.json',b'123')
except RuntimeError as e:assert str(e)=='R32_BOUND_OWNER_SHORT_WRITE'
else:raise AssertionError('zero write accepted')
assert set(o.closed)==set(o.fds);cases+=1
print(json.dumps({'cases':cases,'actualLinuxPermissionProof':False,'rootOperations':False,'privateDataExported':False}))
`;const r=python(code,{source});assert.equal(r.cases,10);assert.equal(r.actualLinuxPermissionProof,false);});
test('actual generated unit and absence functions require the exact privilege boundary and keep reuse/read failures unknown',()=>{const code=String.raw`
import ast,json,sys,errno,hashlib,types,re
from pathlib import PurePosixPath
x=json.load(sys.stdin);tree=ast.parse(x['source']);names={'need','sha','argv_of','verify_unit','owner_absent','cgroup_absent'};nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names];assert len(nodes)==6
unit='jarvis-bound-census-r32-'+('a'*32)+'.service';cmd=['/usr/bin/python3','-I','/fixed/control/owner.py','--run','a'*32];stop=[*cmd[:3],'--stopped',cmd[-1]]
g={'json':json,'errno':errno,'hashlib':hashlib,'re':re,'unit':unit,'cmd':cmd,'stop':stop}
exec(compile(ast.Module(body=nodes,type_ignores=[]),'actual-unit-absence-functions','exec'),g)
def arg(v):return '{ path=/usr/bin/python3 ; argv[]='+' '.join(v)+' ; ignore_errors=no }'
good={'User':'1000','Group':'1000','NoNewPrivileges':'yes','CapabilityBoundingSet':'','AmbientCapabilities':'','PrivateNetwork':'yes','ProtectControlGroups':'yes','RuntimeMaxUSec':'1min 20s','TimeoutStopUSec':'10s','KillMode':'control-group','KillSignal':'9','Restart':'no','ExecStart':arg(cmd),'ExecStopPost':arg(stop)}
out=g['verify_unit'](good);assert out['hardParentBoundSeconds']==90 and out['runtimeMaxSec']==80 and out['stopTimeoutSec']==10;cases=1
for k,bad in [('User','0'),('Group','0'),('NoNewPrivileges','no'),('CapabilityBoundingSet','cap_kill'),('AmbientCapabilities','cap_kill'),('PrivateNetwork','no'),('ProtectControlGroups','no'),('RuntimeMaxUSec','90s'),('TimeoutStopUSec','90s'),('KillMode','process'),('KillSignal','15'),('Restart','always')]:
 v=dict(good);v[k]=bad
 try:g['verify_unit'](v)
 except RuntimeError as e:assert str(e)=='R32_BOUND_HOST_ACTUAL_UNIT_CONFIG_CHANGED'
 else:raise AssertionError('incorrect unit privilege or budget accepted')
 cases+=1
class P(PurePosixPath):
 def read_text(self):return 'boot-fixed\n'
class OS:
 def __init__(self,mode):self.mode=mode;self.closed=[]
 def stat(self,*args,**kwargs):
  assert kwargs['follow_symlinks']is False
  if self.mode=='gone':raise FileNotFoundError(errno.ENOENT,'gone')
  if self.mode=='denied':raise PermissionError(errno.EACCES,'denied')
  if self.mode=='unknown':raise FileNotFoundError(errno.EIO,'unknown')
  return types.SimpleNamespace(st_ino=987)
 def close(self,f):self.closed.append(f)
g.update({'Path':P,'owner':{'boot':'boot-fixed','pid':200},'cg':P('/sys/fs/cgroup/system.slice')/unit,'held':lambda _:80})
for mode in ['gone','present','denied','unknown']:
 o=OS(mode);g['os']=o
 for name in ['owner_absent','cgroup_absent']:
  try:r=g[name]()
  except OSError:assert mode in ['denied','unknown']
  except RuntimeError:assert mode=='unknown'
  else:assert r is (mode=='gone')
 assert o.closed==[80];cases+=1
g['owner']['boot']='wrong-boot';g['os']=OS('gone')
try:g['owner_absent']()
except RuntimeError as e:assert str(e)=='R32_BOUND_HOST_OWNER_BOOT_CHANGED'
else:raise AssertionError('different boot accepted')
cases+=1;g['owner']=None;assert g['owner_absent']()is False;cases+=1
print(json.dumps({'cases':cases,'actualKernelReads':False,'wholeHostQualified':False}))
`;const r=python(code,{source:boundCensusLinuxR32HostProgram()});assert.equal(r.cases,19);assert.equal(r.actualKernelReads,false);});
test('actual generated report FD reader refuses unsafe files, drift and read errors while closing every held descriptor',()=>{const code=String.raw`
import ast,json,sys,stat,types,errno
from pathlib import PurePosixPath as Path
x=json.load(sys.stdin);tree=ast.parse(x['source']);wanted={'need','key','work_read'};nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in wanted];assert len(nodes)==3
def info(uid,gid,mode,ino,size=0,nlink=1):return types.SimpleNamespace(st_dev=1,st_ino=ino,st_uid=uid,st_gid=gid,st_mode=mode,st_nlink=nlink,st_size=size,st_mtime_ns=1234567890123456789,st_ctime_ns=1234567890123456790)
class OS:
 O_RDONLY=0;O_DIRECTORY=1;O_NOFOLLOW=2;O_NONBLOCK=4
 def __init__(self):self.entries={'/scope':info(0,0,stat.S_IFDIR|0o711,1),'/scope/work':info(1000,1000,stat.S_IFDIR|0o700,2),'/scope/work/result.json':info(1000,1000,stat.S_IFREG|0o600,3,3)};self.fds={8:'/scope'};self.closed=[];self.pos=0;self.swap=None;self.error=False
 def stat(self,n,dir_fd=None,follow_symlinks=False):
  assert follow_symlinks is False;name=self.fds[dir_fd]+'/'+str(n)
  if name not in self.entries:raise FileNotFoundError(errno.ENOENT,'missing')
  return self.entries[name]
 def open(self,n,flags,dir_fd=None):
  assert flags&self.O_NOFOLLOW;name=self.fds[dir_fd]+'/'+str(n);f=20+len(self.fds);self.fds[f]=name
  if not flags&self.O_DIRECTORY:assert flags&self.O_NONBLOCK
  return f
 def fstat(self,f):
  s=self.entries[self.fds[f]]
  return info(s.st_uid,s.st_gid,s.st_mode,s.st_ino+1,s.st_size,s.st_nlink) if self.swap==self.fds[f] else s
 def read(self,f,n):
  if self.error:raise PermissionError(errno.EACCES,'private read error')
  b=b'abc'[self.pos:self.pos+n];self.pos+=len(b);return b
 def close(self,f):self.closed.append(f)
g={'stat':stat,'root':Path('/scope')};exec(compile(ast.Module(body=nodes,type_ignores=[]),'actual-root-report-read','exec'),g)
def frame():o=OS();g['os']=o;g['held']=lambda _:8;return o
o=frame();assert g['work_read']('result.json')==b'abc';assert set(o.closed)==set(o.fds);cases=1
for change in ['wrong-work-owner','writable-work','wrong-file-owner','writable-file','symlink','hardlink','oversized','directory-swap','file-swap','read-error']:
 o=frame();w=o.entries['/scope/work'];s=o.entries['/scope/work/result.json']
 if change=='wrong-work-owner':w.st_uid=0
 elif change=='writable-work':w.st_mode=stat.S_IFDIR|0o777
 elif change=='wrong-file-owner':s.st_uid=0
 elif change=='writable-file':s.st_mode=stat.S_IFREG|0o644
 elif change=='symlink':s.st_mode=stat.S_IFLNK|0o777
 elif change=='hardlink':s.st_nlink=2
 elif change=='oversized':s.st_size=1048577
 elif change=='directory-swap':o.swap='/scope/work'
 elif change=='file-swap':o.swap='/scope/work/result.json'
 else:o.error=True
 try:g['work_read']('result.json')
 except (RuntimeError,OSError):pass
 else:raise AssertionError('unsafe or unknown report accepted')
 assert set(o.closed)==set(o.fds);cases+=1
o=frame();del o.entries['/scope/work/result.json'];assert g['work_read']('result.json')is None;assert set(o.closed)==set(o.fds);cases+=1
print(json.dumps({'cases':cases,'actualLinuxPermissionProof':False,'rawPrivateErrorExported':False}))
`;const r=python(code,{source:boundCensusLinuxR32HostProgram()});assert.equal(r.cases,12);assert.equal(r.rawPrivateErrorExported,false);});
