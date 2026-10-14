/** Actual generated definitions with controlled OS only; no Linux/root/service observation. */
import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {boundProcessCensusR32NativeProgram} from './factory-bound-process-census-r32.mjs';
import {boundCensusLinuxFailureHostR32Scope as S,boundCensusLinuxFailureHostR32Program as program,assertBoundCensusLinuxFailureHostR32 as qualify} from './factory-bound-census-linux-failure-host-r32.mjs';
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v),H=v=>createHash('sha256').update(typeof v==='string'?v:canonical(v)).digest('hex');
function py(code,extra={}){const r=spawnSync('python',['-c',code],{input:JSON.stringify({source:program(),scope:S,...extra}),encoding:'utf8',timeout:12000,windowsHide:true});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)}
test('generated program parses and keeps original actual bound PIDFD read/EXIT and enumeration core unchanged',()=>{
 const native=boundProcessCensusR32NativeProgram(),current=program();for(const name of ['process_record','pidfd_poll','pidfd_exit_proof']){const slice=s=>s.slice(s.indexOf('def '+name+'('),s.indexOf('\ndef ',s.indexOf('def '+name+'(')+1));assert.equal(slice(current),slice(native));}
 const core=s=>s.slice(s.indexOf(' records={};failures={};attachments={};exits={};listed={}'),s.indexOf("  need(set(records).isdisjoint(exits)"));assert.equal(core(current),core(native));
 assert.ok(!current.includes('pidfd_send_signal'));assert.ok(!current.includes('os.kill('));assert.ok(!current.includes('sqlite3'));assert.ok(!current.includes('exec(compile('));
 assert.ok(current.indexOf('first_records,first_namespace=namespace_read()')<current.indexOf('first=census()'));assert.ok(current.indexOf('first=census()')<current.indexOf('second=census()'));assert.ok(current.indexOf('second=census()')<current.indexOf('second_records,second_namespace=namespace_read()'));
 assert.deepEqual(py('import ast,json,sys\nx=json.load(sys.stdin);ast.parse(x["source"]);print(json.dumps({"syntax":True}))'),{syntax:true});
});
test('actual root record FD reader rejects links, permissions, drift, bounds, missing bytes and EACCES with all FD closed',()=>{
 const r=py(String.raw`import ast,json,sys,stat,types,errno
x=json.load(sys.stdin);tree=ast.parse(x['source']);names={'need','key','read_file'};g={'stat':stat};exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),'actual-record-reader','exec'),g)
def s(uid=0,mode=0o444,ino=7,size=3,nlink=1):return types.SimpleNamespace(st_dev=5,st_ino=ino,st_uid=uid,st_gid=uid,st_mode=stat.S_IFREG|mode,st_nlink=nlink,st_size=size,st_mtime_ns=1234567890123456789,st_ctime_ns=1234567890123456790)
class OS:
 O_RDONLY=0;O_NOFOLLOW=1;O_NONBLOCK=2
 def __init__(self):self.info=s();self.closed=[];self.pos=0;self.drift=False;self.error=False;self.short=False
 def stat(self,*args,**kw):assert kw['follow_symlinks']is False;return self.info
 def open(self,*args,**kw):assert args[1]==3;return 20
 def fstat(self,f):return s(ino=8) if self.drift else self.info
 def read(self,f,n):
  if self.error:raise PermissionError(errno.EACCES,'private read error')
  raw=b'ab' if self.short else b'abc';b=raw[self.pos:self.pos+n];self.pos+=len(b);return b
 def close(self,f):self.closed.append(f)
o=OS();g['os']=o;raw,m=g['read_file'](10,'a',0,0o444);assert raw==b'abc' and m[-1]==1234567890123456790 and o.closed==[20];cases=1
for mode in ['uid','writable','symlink','hardlink','oversize','drift','short','read-error']:
 o=OS();g['os']=o
 if mode=='uid':o.info.st_uid=1000
 elif mode=='writable':o.info.st_mode=stat.S_IFREG|0o644
 elif mode=='symlink':o.info.st_mode=stat.S_IFLNK|0o777
 elif mode=='hardlink':o.info.st_nlink=2
 elif mode=='oversize':o.info.st_size=1048577
 elif mode=='drift':o.drift=True
 elif mode=='short':o.short=True
 else:o.error=True
 try:g['read_file'](10,'a',0,0o444)
 except (RuntimeError,OSError):pass
 else:raise AssertionError('untrusted record accepted')
 assert o.closed==([] if mode in ['uid','writable','symlink','hardlink','oversize'] else [20]);cases+=1
print(json.dumps({'cases':cases,'actualLinuxRead':False}))`);assert.equal(r.cases,9);
});
test('actual failure census adds known/descendant/cgroup/namespace scope and retains unknown PID in closed denominator without skipping scanner',()=>{
 const r=py(String.raw`import ast,json,sys,types,errno
from pathlib import PurePosixPath
x=json.load(sys.stdin);tree=ast.parse(x['source']);S=x['scope']
class P(PurePosixPath):
 def read_text(self):return S['boot']+'\n'
class Entry:
 def __init__(self,p):self.name=str(p);self.p=p
 def inode(self):return self.p
class Scanner:
 def __enter__(self):return iter([Entry(p) for p in g['pids']])
 def __exit__(self,*a):return False
class OS:
 O_RDONLY=0;O_DIRECTORY=1;O_NOFOLLOW=2
 def __init__(self):self.closed=[];self.attached=[]
 def open(self,*a):return 10
 def fstat(self,f):return types.SimpleNamespace(st_dev=5)
 def scandir(self,f):return Scanner()
 def pidfd_open(self,p,flags):self.attached.append(p);return p+100
 def stat(self,path,follow_symlinks=False):assert follow_symlinks is False;return types.SimpleNamespace(st_dev=5,st_ino=int(str(path).split('/')[-1]))
 def close(self,f):self.closed.append(f)
def need(v,c):
 if not v:raise RuntimeError(c)
g={'os':None,'Path':P,'S':S,'re':__import__('re'),'select':types.SimpleNamespace(poll=True),'errno':errno,'need':need,'CLOSED_READ_SUBPHASES':{'PIDFD_OPEN','POST_ATTACH_PROC_IDENTITY','PROCESS_READ','PIDFD_POLL','SCAN_CLOSE_PROC_IDENTITY'},'pidfd_poll':lambda f:{'exitConfirmed':False},'pids':[42,43]}
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='census'],type_ignores=[]),'actual-failure-census','exec'),g)
def record(pid,boot,a):
 if g['mode']=='unknown' and pid==43:raise PermissionError(errno.EACCES,'private read error')
 return {'pid':pid,'ppid':S['owner']['pid'] if g['mode']=='descendant' and pid==43 else 1,'startTicks':'1','boot':boot,'procDevice':5,'procInode':pid,'uid':0,'state':'R','cwdSHA256':'a'*64,'exeSHA256':'b'*64,'argvSHA256':'c'*64,'workspaceRelated':g['mode']=='namespace-self' and pid==42,'cgroups':[S['cgroup']] if g['mode']=='cgroup' and pid==43 else ['/other']}
g['process_record']=record;cases=0
for mode in ['neutral','descendant','cgroup','namespace-self','known-owner','unknown']:
 o=OS();g['os']=o;g['mode']=mode;g['pids']=[42,S['owner']['pid']] if mode=='known-owner' else [42,43];v=g['census']();assert v['total']==2 and v['total']==v['inspected']+v['provenExited']+v['incompleteCount'];assert set(o.attached)==set(v['listedPIDs']);assert set(o.closed)=={10,*[p+100 for p in g['pids']]};assert 42 in v['inspectedPIDs']
 if mode=='neutral':assert v['complete']is True
 elif mode=='unknown':assert v['complete']is False and v['incompleteCount']==1 and v['incomplete'][0]['pid']==43
 else:assert v['complete']is False and v['relatedCount']==1
 cases+=1
print(json.dumps({'cases':cases,'actualProcRead':False}))`);assert.equal(r.cases,6);
});
test('actual known PID and cgroup checks do not treat reuse or read failure as absence',()=>{
 const r=py(String.raw`import ast,json,sys,errno,types
from pathlib import PurePosixPath
x=json.load(sys.stdin);tree=ast.parse(x['source']);S=x['scope']
class P(PurePosixPath):
 def read_text(self):return S['boot']+'\n'
class OS:
 def __init__(self,mode):self.mode=mode;self.closed=[]
 def stat(self,*a,**kw):
  assert kw['follow_symlinks']is False
  if self.mode=='gone':raise FileNotFoundError(errno.ENOENT,'gone')
  if self.mode=='denied':raise PermissionError(errno.EACCES,'unknown')
  if self.mode=='other-errno':raise FileNotFoundError(errno.EIO,'unknown')
  return types.SimpleNamespace(st_dev=999,st_ino=999)
 def close(self,f):self.closed.append(f)
def need(v,c):
 if not v:raise RuntimeError(c)
g={'Path':P,'S':S,'errno':errno,'need':need,'held':lambda _:10};exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['known_process','cgroup_read']],type_ignores=[]),'actual-absence','exec'),g)
cases=0
for mode in ['gone','reuse','denied','other-errno']:
 o=OS(mode);g['os']=o
 for name in ['known_process','cgroup_read']:
  try:v=g[name](S['owner']) if name=='known_process' else g[name]()
  except (RuntimeError,OSError):assert mode in ['denied','other-errno']
  else:
   assert mode in ['gone','reuse']
   if name=='known_process':assert v['present']is (mode=='reuse');assert mode=='gone' or v['identityMatches']is False
   else:assert v['absent']is (mode=='gone')
 assert o.closed==[10];cases+=1
print(json.dumps({'cases':cases,'actualLinuxRead':False}))`);assert.equal(r.cases,4);
});
test('actual namespace predicate includes deleted root and child aliases and rejects sibling-prefix paths',()=>{
 const r=py(String.raw`import ast,json,sys
x=json.load(sys.stdin);tree=ast.parse(x['source']);g={'S':x['scope']};exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='in_workspace'],type_ignores=[]),'actual-namespace-predicate','exec'),g);root=x['scope']['root'];cases=0
for value,want in [(root,True),(root+' (deleted)',True),(root+'/work/x (deleted)',True),(root+'-other',False),(root+'-other (deleted)',False),(root+'other/work',False),(None,False)]:assert g['in_workspace'](value)is want;cases+=1
print(json.dumps({'cases':cases,'actualProcRead':False}))`);assert.equal(r.cases,7);
});
function fixture(){const scan={fullProcScan:true,pidfdSupported:true,total:1,inspected:1,provenExited:0,incompleteCount:0,incomplete:[],relatedCount:0,relatedProcesses:[],complete:true,listedPIDs:[42],inspectedPIDs:[42],exitedDuringScan:[]};return{schemaVersion:1,kind:'r32-bound-census-linux-failure-scope-host-observation',scopeBinding:S,contextSHA256:H(S),failureScope:true,tinyChildIdentity:null,unknownTinyChildIdentityPreserved:true,fixtureQualified:false,actualLinuxQualified:false,fullProtectionQualified:false,modelsInvoked:false,productCodeExecuted:false,signalsSent:false,resourcesRemoved:false,mutationsPerformed:false,recordsStable:true,namespaceStable:true,unitProofVerified:true,records:Object.fromEntries(Object.entries(S.records).map(([k,v])=>[k,{sha256:v.sha256,bytes:v.bytes??10,metadata:Array(9).fill(1),readComplete:true}])),processScans:[structuredClone(scan),structuredClone(scan)],knownProcesses:{owner:{pid:S.owner.pid,present:false},fixture:{pid:S.fixture.pid,present:false}},unit:{Id:S.unit,ActiveState:'failed',MainPID:'0',ControlGroup:''},cgroup:{absent:true,complete:true},sockets:{count:0,complete:true},namespaceFD:{relatedCount:0,complete:true},cleanupScopeComplete:true}}
test('safe actual assertion separates clean failure scope from qualification and rejects unknowns, drift and denominator lies',()=>{
 assert.equal(qualify(fixture()).fixtureQualified,false);
 for(const mutate of [h=>h.actualLinuxQualified=true,h=>h.tinyChildIdentity={pid:3},h=>h.records['unit-proof.json'].sha256='f'.repeat(64),h=>h.recordsStable=false,h=>h.processScans[0].inspectedPIDs=[42,42],h=>h.processScans[0].incomplete=[{pid:43}],h=>h.knownProcesses.fixture.present=true,h=>h.cgroup.absent=false,h=>h.sockets.count=1,h=>h.namespaceFD.relatedCount=1]){const h=fixture();mutate(h);assert.throws(()=>qualify(h));}
 const h=fixture();h.processScans[0]={...h.processScans[0],total:2,incompleteCount:1,incomplete:[{pid:43}],listedPIDs:[42,43],complete:false};h.cleanupScopeComplete=false;assert.equal(qualify(h).cleanupScopeComplete,false);
});
