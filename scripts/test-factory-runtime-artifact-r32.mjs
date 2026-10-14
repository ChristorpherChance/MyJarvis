/** Controlled actual Python functions and caller contracts; no Linux/remote/package execution. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {prepareRuntimeArtifactR32,parseRuntimeArtifactR32Raw,runtimeArtifactR32Failure,runtimeArtifactR32References,runtimeArtifactR32Program,runtimeArtifactR32Journal} from './prepare-factory-runtime-artifact-r32.mjs';
const source=readFileSync('scripts/factory-runtime-artifact-byte-controller-r32.py','utf8'),index=readFileSync('artifacts/software-factory/goals-r29/r32-source-public-index-1791837951701-4991420c-d4b4-42f0-a8eb-f684d32a8127.json');
const prefix=String.raw`import ast,base64,ctypes,hashlib,json,os,posixpath,re,stat,sys,types,copy
from unittest.mock import patch
x=json.loads(sys.stdin.read());t=ast.parse(x['source']);names=x['names'];nodes=[n for n in t.body if isinstance(n,ast.FunctionDef) and n.name in names or isinstance(n,ast.Assign) and all(isinstance(y,ast.Name) and y.id in ['SCOPE','LIMIT_FILE','LIMIT_BYTES','LIMIT_ENTRIES'] for y in n.targets)];env=globals();exec(compile(ast.Module(body=nodes,type_ignores=[]),'actual-artifact-functions','exec'),env)
`;
function py(names,code,extra={}){const r=spawnSync('python',['-c',prefix+code],{input:JSON.stringify({source,names,...extra}),encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(r.status,0,r.stderr||r.error?.code);return r.stdout.trim()}
test('default missing review is zero IO for inspect/freeze/check',async()=>{const no=()=>{throw Error('UNEXPECTED_IO')};for(const action of ['inspect','freeze','check']){const r=await prepareRuntimeArtifactR32({action},Object.fromEntries(['readLocal','readRoot','verifyProtection','acquire','writeWX'].map(n=>[n,no])));assert.equal(r.ready,false);assert.equal(r.remoteOperations,false)}});
test('actual complete fixed preIO envelope accepts original index and rejects scope/extra/bool/hash changes',()=>{
 assert.equal(py(['need','raw','canonical','sha','path_ok','validate'],String.raw`
p={'scope':SCOPE,'action':'inspect','nonce':None,'sourceIndex':{'_rawBase64':x['index']},'expectedInspection':None,'programSHA256':'a'*64};assert len(validate(p))==625
for mutation in [lambda p:p.update(extra=True),lambda p:p['scope'].update(work='/tmp'),lambda p:p['scope'].update(schemaVersion=True),lambda p:p.update(action='retry'),lambda p:p.update(nonce='b'*32),lambda p:p.update(programSHA256='private'),lambda p:p['sourceIndex'].update(_rawBase64='YQ==')]:
 q=copy.deepcopy(p);mutation(q)
 try:validate(q)
 except (RuntimeError,ValueError):pass
 else:raise AssertionError('bad envelope accepted')
print('625+7closed')`,{index:index.toString('base64')}),'625+7closed')
});
test('actual pure link closure resolves internal pnpm aliases and rejects escape/missing/cycle/non-directory',()=>{
 assert.equal(py(['need','path_ok','resolve_path','resolve_closure'],String.raw`
entries=[{'path':'source','type':'directory'},{'path':'source/node_modules','type':'directory'},{'path':'source/package','type':'directory'},{'path':'source/package/index.js','type':'file'},{'path':'source/node_modules/pkg','type':'symlink','target':'../package'}];nodes=resolve_closure(entries);assert resolve_path('source/node_modules/pkg/index.js',nodes)=='source/package/index.js'
for target in ['../../../outside','../missing','pkg','../package/index.js/extra']:
 q=copy.deepcopy(entries);q[-1]['target']=target
 try:resolve_closure(q)
 except RuntimeError:pass
 else:raise AssertionError('invalid link passed')
print('internal+4closed')`),'internal+4closed');
});
test('actual regular file reader rejects preopen identity replacement before reading bytes',()=>{
 assert.equal(py(['need','meta','sha','read_file','write_all'],String.raw`
def s(i):return types.SimpleNamespace(st_dev=1,st_ino=i,st_uid=1000,st_gid=1000,st_mode=stat.S_IFREG|0o644,st_nlink=1,st_size=1,st_mtime_ns=1,st_ctime_ns=1)
with patch.object(os,'O_NOFOLLOW',0,create=True),patch.object(os,'O_NONBLOCK',0,create=True),patch.object(os,'stat',return_value=s(1)),patch.object(os,'open',return_value=4),patch.object(os,'fstat',return_value=s(2)),patch.object(os,'close'),patch.object(os,'read',side_effect=AssertionError('bytes opened too early')):
 try:read_file(1,'file')
 except RuntimeError as e:assert str(e)=='R32_ARTIFACT_FILE_PREOPEN_CHANGED'
 else:raise AssertionError('replacement accepted')
print('no-bytes-on-replacement')`),'no-bytes-on-replacement');
});
test('actual byte reader rejects metadata drift or different expected content',()=>{
 assert.equal(py(['need','meta','sha','read_file','write_all'],String.raw`
def s(i=1):return types.SimpleNamespace(st_dev=1,st_ino=i,st_uid=1000,st_gid=1000,st_mode=stat.S_IFREG|0o644,st_nlink=2,st_size=1,st_mtime_ns=1,st_ctime_ns=1)
for changed in [True,False]:
 with patch.object(os,'O_NOFOLLOW',0,create=True),patch.object(os,'O_NONBLOCK',0,create=True),patch.object(os,'stat',side_effect=[s(),s(2) if changed else s()]),patch.object(os,'open',return_value=4),patch.object(os,'fstat',return_value=s()),patch.object(os,'close'),patch.object(os,'read',side_effect=[b'x',b'']):
  try:read_file(1,'file',{'sha256':'a'*64,'bytes':1})
  except RuntimeError as e:assert str(e) in ['R32_ARTIFACT_FILE_CHANGED','R32_ARTIFACT_FILE_BYTES_CHANGED']
  else:raise AssertionError('drift accepted')
print('metadata+bytes-refused')`),'metadata+bytes-refused');
});
test('actual write loop handles short write and rejects zero/bool/oversized results',()=>{
 assert.equal(py(['need','write_all'],String.raw`
out=[]
def short(fd,b):out.append(bytes(b[:2]));return min(2,len(b))
with patch.object(os,'write',side_effect=short):write_all(1,b'abcdef')
assert b''.join(out)==b'abcdef'
for v in [0,True,-1,99]:
 with patch.object(os,'write',return_value=v):
  try:write_all(1,b'x')
  except RuntimeError:pass
  else:raise AssertionError('bad write accepted')
print('partial+4closed')`),'partial+4closed');
});
test('actual image projection uses fixed API1.49 and excludes environment/unknown volumes',()=>{
 assert.equal(py(['need','image_contract'],String.raw`
calls=[];bad=False
def run(args,**kw):
 calls.append((args,kw));pin=args[-1];role=next(k for k,v in SCOPE['images'].items() if v==pin);volume=None if role=='node' else {'/var/lib/postgresql/data' if role=='postgres' else '/data':{}};config={'User':'','Volumes':volume,'Entrypoint':['entry'],'Cmd':['cmd'],'Env':['SECRET=PRIVATE']}
 if bad:config['Volumes']={'/unknown':{}}
 return types.SimpleNamespace(returncode=0,stdout=json.dumps([{'Id':pin,'Os':'linux','Architecture':'amd64','Config':config}]).encode())
subprocess=types.SimpleNamespace(run=run,PIPE=-1);v=image_contract();assert len(calls)==4 and 'SECRET' not in json.dumps(v)
for args,kw in calls:assert args[:3]==['/usr/bin/docker','image','inspect'] and kw['env']['DOCKER_API_VERSION']=='1.49' and 'DOCKER_HOST' not in kw['env']
bad=True
try:image_contract()
except RuntimeError as e:assert str(e)=='R32_ARTIFACT_IMAGE_UNLISTED_VOLUME'
else:raise AssertionError('unknown volume accepted')
print('4images+closed-env+badvolume')`),'4images+closed-env+badvolume');
});
test('raw host bytes preserve nanosecond integers for later Python equality',()=>{
 const original=Buffer.from('{"rootStat":[1791838580123456789],"kind":"controlled"}\n');const r=parseRuntimeArtifactR32Raw(original);assert.deepEqual(r.bytes,original);assert.notEqual(JSON.stringify(r.value),original.toString().trim());
 assert.equal(py(['need'],String.raw`
qualified={'rootStat':[1791838580123456789],'kind':'controlled'};p={'expectedInspection':{'_rawBase64':x['raw']}};f=next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name=='main');nodes=[n for n in f.body if isinstance(n,ast.Assign) and any(isinstance(y,ast.Name) and y.id=='expected_raw' for y in n.targets) or isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and len(n.value.args)>1 and isinstance(n.value.args[1],ast.Constant) and n.value.args[1].value=='R32_ARTIFACT_QUALIFIED_INPUT_CHANGED'];exec(compile(ast.Module(body=nodes,type_ignores=[]),'actual-raw-metadata-guard','exec'));print('ns-int-preserved')`,{raw:original.toString('base64')}),'ns-int-preserved');
});
test('actual no-replace publication refuses collisions without claiming fsync commit',()=>{
 assert.equal(py(['need','publish'],String.raw`
class Rename:
 def __call__(self,*a):assert a[-1]==1;return -1
with patch.object(ctypes,'CDLL',return_value=types.SimpleNamespace(renameat2=Rename())),patch.object(os,'fsync',side_effect=AssertionError('collision not commit')):
 try:publish(1,2,'a'*64)
 except RuntimeError as e:assert str(e)=='R32_ARTIFACT_PUBLICATION_COLLISION'
 else:raise AssertionError('collision overwritten')
print('collision-closed')`),'collision-closed');
});
test('closed public failure cannot leak raw environment or stack',()=>{const v=runtimeArtifactR32Failure(Error('PRIVATE password=private'));assert.equal(v.errorCode,'R32_ARTIFACT_OPERATION_FAILED');assert.equal(JSON.stringify(v).includes('PRIVATE'),false);assert.equal(v.productAccepted,false)});
test('actual full controller AST parses and root package loading is absent',()=>{assert.equal(py([],"print('AST_OK')"),'AST_OK');assert.ok(!source.includes('importlib'));assert.ok(!source.includes("'node',"));assert.ok(source.includes("copy_tree(work, runtime, observation)"));assert.ok(source.indexOf("write_new(attempt, 'once.json'")<source.indexOf('copy_tree(work, runtime, observation)'));assert.ok(source.includes('newInodesIndependent'));});

test('actual path whitelist rejects backslash controls and traversal',()=>{assert.equal(py(['path_ok'],String.raw`
assert path_ok('source/node_modules/pkg/index.js')
for s in [chr(92)+'file','a'+chr(92)+'b','a'+chr(0)+'b','a'+chr(31)+'b','a'+chr(127)+'b','../source','/source','a//b','a/./b']:assert not path_ok(s)
print('nine-path-negatives')`),'nine-path-negatives')});
test('actual immutable full scanner rejects root-owner/shared-inode/write/special/closure violations',()=>{
 assert.equal(py(['need','raw','canonical','sha','meta','ident','path_ok','scan','read_file','write_all','resolve_path','resolve_closure'],String.raw`
def row(ino,mode,nlink=1,uid=0,size=1):return types.SimpleNamespace(st_dev=1,st_ino=ino,st_uid=uid,st_gid=uid,st_mode=mode,st_nlink=nlink,st_size=size,st_mtime_ns=1791838580123456789,st_ctime_ns=1791838580123456789)
class ControlledOS:
 O_RDONLY=O_NOFOLLOW=O_NONBLOCK=O_DIRECTORY=0
 def __init__(self,kind=None):self.kind=kind;self.reads=0;self.root=row(1,stat.S_IFDIR|0o555,2,size=0);self.file=row(2,stat.S_IFREG|0o444);self.lists=0
 def fstat(self,fd):return self.root if fd==1 else self.file
 def listdir(self,fd):self.lists+=1;return ['item','unknown'] if self.kind=='closure' and self.lists>1 else ['item']
 def stat(self,*args,**kwargs):return self.file
 def open(self,*args,**kwargs):return 2
 def close(self,*args):pass
 def read(self,*args):self.reads+=1;return b'x' if self.reads==1 else b''
 def readlink(self,*args,**kwargs):return '../outside'
for kind in [None,'owner','hardlink','write','special','closure']:
 os=ControlledOS(kind)
 if kind=='owner':os.file.st_uid=os.file.st_gid=1000
 if kind=='hardlink':os.file.st_nlink=2
 if kind=='write':os.file.st_mode=stat.S_IFREG|0o644
 if kind=='special':os.file.st_mode=stat.S_IFIFO|0o444
 if kind is None:assert scan(1,True)['files']==1
 else:
  try:scan(1,True)
  except RuntimeError:pass
  else:raise AssertionError('unsafe immutable tree accepted '+kind)
print('safe+5tree-negatives')`),'safe+5tree-negatives');
});

test('actual contract builder closes all source/path/qualification fields without extra adapters',()=>{assert.equal(py(['sha','artifact_contract'],String.raw`
r={'identity':{'device':66306,'inode':9000},'metadataSHA256':'b'*64};v=artifact_contract('a'*64,r,b'manifest')
assert v['buildProofSHA256']==SCOPE['buildProofSHA256'] and v['manifestSHA256']==sha(b'manifest') and v['root']==SCOPE['freezeRoot']+'/'+('a'*64)+'/runtime'
for k,z in [('root','/tmp/runtime'),('buildProofSHA256','c'*64),('source',{'fingerprint':'d'*64,'files':625,'bytes':18413560}),('extra','private')]:
 q=copy.deepcopy(v);q[k]=z;assert q!=artifact_contract('a'*64,r,b'manifest')
print('full-contract+4changed-fields')`),'full-contract+4changed-fields')});
test('actual byte copy creates exclusive new inode, preserves only executable bits and refuses stale input before write',()=>{assert.equal(py(['need','meta','sha','write_all','read_file','copy_tree'],String.raw`
def s(i=7,mode=0o755):return types.SimpleNamespace(st_dev=1,st_ino=i,st_uid=1000,st_gid=1000,st_mode=stat.S_IFREG|mode,st_nlink=9,st_size=3,st_mtime_ns=1,st_ctime_ns=1)
for executable in [True,False]:
 original=s(mode=0o755 if executable else 0o644);rows={'entries':[{'path':'file','type':'file','sha256':sha(b'abc'),'bytes':3}],'metadata':[['file',*meta(original)]]};out=[];opened=[];modes=[]
 def op(name,flags,*args,dir_fd=None):opened.append((name,flags,dir_fd));return 4 if dir_fd==2 else 3
 with patch.object(os,'O_NOFOLLOW',8,create=True),patch.object(os,'O_NONBLOCK',16,create=True),patch.object(os,'listdir',return_value=['file']),patch.object(os,'stat',return_value=original),patch.object(os,'open',side_effect=op),patch.object(os,'fstat',return_value=original),patch.object(os,'read',side_effect=[b'abc',b'']),patch.object(os,'write',side_effect=lambda fd,b:(out.append(bytes(b)) or len(b))),patch.object(os,'close'),patch.object(os,'fsync'),patch.object(os,'fchmod',side_effect=lambda fd,mode:modes.append(mode),create=True):
  copy_tree(1,2,rows)
 assert b''.join(out)==b'abc' and opened[0][1]&os.O_EXCL and opened[0][1]&8 and modes==[0o555 if executable else 0o444]
 stale=s(8)
 with patch.object(os,'listdir',return_value=['file']),patch.object(os,'stat',return_value=stale),patch.object(os,'open',side_effect=AssertionError('stale input wrote output')):
  try:copy_tree(1,2,rows)
  except RuntimeError as e:assert str(e)=='R32_ARTIFACT_COPY_INPUT_CHANGED'
  else:raise AssertionError('stale input accepted')
print('exclusive-copy+exec-modes+stale-input')`),'exclusive-copy+exec-modes+stale-input')});

async function controlledCaller(){
 const H=b=>createHash('sha256').update(b).digest('hex'),files=new Map(Object.values(runtimeArtifactR32References).map(r=>[r.path,readFileSync(r.path)])),program=Buffer.from(source),caller=readFileSync('scripts/prepare-factory-runtime-artifact-r32.mjs');files.set(runtimeArtifactR32Program,program);files.set('scripts/prepare-factory-runtime-artifact-r32.mjs',caller);
 const scope=JSON.parse(py([],"print(json.dumps(SCOPE))")),review=Buffer.from(JSON.stringify({kind:'r32-runtime-artifact-byte-independent-local-review',programSHA256:H(program),controllerSHA256:H(caller),staticPreparationReady:true,remainingP0P1:0,actualFrozenArtifact:false,modelsInvoked:false,remoteOperations:false}));files.set('controlled-review.json',review);
 const activation={kind:'r32-runtime-artifact-reviewed-activation',remoteExecutionAuthorized:true,programSHA256:H(program),controllerSHA256:H(caller),modelsInvoked:false,productAccepted:false,review:{path:'controlled-review.json',sha256:H(review)}};
 const proof=JSON.parse(readFileSync('artifacts/software-factory/goals-r29/new-protection-contract-1791828226746-050a98d2-9605-46c2-8d28-57a450f38a5d.json')),now=Date.now();proof.at=new Date(now).toISOString();
 const inspection={schemaVersion:1,kind:'r32-runtime-artifact-readonly-qualification',scope,sourceIndexSHA256:runtimeArtifactR32References.index.sha256,buildSHA256:runtimeArtifactR32References.build.sha256,cleanupSHA256:runtimeArtifactR32References.cleanup.sha256,twoCompleteReadbacks:true,immutableArtifactExists:false,candidateCodeExecuted:false,modelsInvoked:false,runtime:{treeSHA256:'a'.repeat(64),metadataSHA256:'b'.repeat(64),legacyWorkMetadataSHA256:scope.workMetadataSHA256,legacyWorkEntries:47822,identity:scope.workIdentity,files:1,bytes:1,entries:Array.from({length:47822},(_,i)=>({path:'fixture/'+i,type:'directory'})),rootStat:[1791838580123456789]},images:{kind:'r32-exact-dependency-image-config',images:Object.fromEntries(Object.keys(scope.images).map(k=>[k,{Id:scope.images[k]}]))}};
 // This is an explicit controlled state-flow receipt, not a fake Linux qualification.
 const inspectionRaw=Buffer.from(JSON.stringify(inspection).replace('1791838580123456800','1791838580123456789'));let mode='normal',failSave=false,locked=false;const events=[];
 const d={readLocal:async p=>{if(!files.has(p))throw Object.assign(Error('absent'),{code:'ENOENT'});return files.get(p)},verifyProtection:async()=>structuredClone(proof),now:()=>now,randomBytes:()=>Buffer.alloc(16,3),acquire:async()=>{assert.equal(locked,false);locked=true;events.push('lock');return{}},release:async()=>{locked=false;events.push('unlock')},writeWX:async(p,b)=>{assert.equal(files.has(p),false);files.set(p,Buffer.from(b));events.push('wx')},saveJournal:async q=>{if(failSave&&q.freezeAttemptedAt)throw Error('R32_ARTIFACT_DURABLE_SAVE_FAILED');files.set(runtimeArtifactR32Journal,Buffer.from(JSON.stringify(q)));events.push(q.freezeAttemptedAt?'save-attempt':'save')},privateInspection:async b=>{files.set('controlled-private-inspection.json',Buffer.from(b));return{path:'controlled-private-inspection.json',sha256:H(b)}},publicReceipt:async v=>({path:'controlled-public-'+v.action+'.json',sha256:H(Buffer.from(JSON.stringify(v)))}),readRoot:async p=>{events.push('root-'+p.action);if(p.action==='inspect')return inspectionRaw;assert.ok(JSON.parse(files.get(runtimeArtifactR32Journal)).freezeAttemptedAt,'root freeze/check before durable intent');assert.deepEqual(Buffer.from(p.expectedInspection._rawBase64,'base64'),inspectionRaw,'ns raw bytes changed');if(mode==='lost'&&p.action==='freeze')throw Error('R32_ARTIFACT_SSH_READ_INCOMPLETE');return JSON.stringify({schemaVersion:1,kind:'r32-artifact-byte-freeze-observation',nonce:p.nonce,ready:false,reason:'R32_ARTIFACT_PUBLICATION_INCOMPLETE',modelsInvoked:false,candidateCodeExecuted:false})}};
 return{activation,d,events,files,setMode:v=>mode=v,setFailSave:v=>failSave=v,locked:()=>locked};
}
test('production caller persists once intent before ambiguous freeze and never repeats it; readonly check keeps failure',async()=>{const f=await controlledCaller();const first=await prepareRuntimeArtifactR32({action:'inspect',activation:f.activation},f.d);assert.equal(first.ready,true);f.setMode('lost');await assert.rejects(prepareRuntimeArtifactR32({action:'freeze',activation:f.activation},f.d),/SSH_READ_INCOMPLETE/);const q=JSON.parse(f.files.get(runtimeArtifactR32Journal));assert.equal(q.uncertain,true);assert.ok(f.events.indexOf('save-attempt')<f.events.indexOf('root-freeze'));await assert.rejects(prepareRuntimeArtifactR32({action:'freeze',activation:f.activation},f.d),/ALREADY_ATTEMPTED/);await assert.rejects(prepareRuntimeArtifactR32({action:'inspect',activation:f.activation},f.d),/EXISTING_ATTEMPT/);const check=await prepareRuntimeArtifactR32({action:'check',activation:f.activation},f.d);assert.equal(check.ready,false);assert.equal(check.productAccepted,false);assert.equal(f.events.filter(x=>x==='root-freeze').length,1);assert.equal(f.events.filter(x=>x==='root-check').length,1);assert.equal(f.locked(),false)});
test('production caller durable-intent failure and unattempted check prevent root mutations',async()=>{const f=await controlledCaller();await prepareRuntimeArtifactR32({action:'inspect',activation:f.activation},f.d);await assert.rejects(prepareRuntimeArtifactR32({action:'check',activation:f.activation},f.d),/NO_ATTEMPT/);f.setFailSave(true);await assert.rejects(prepareRuntimeArtifactR32({action:'freeze',activation:f.activation},f.d),/DURABLE_SAVE_FAILED/);assert.equal(f.events.includes('root-freeze'),false);assert.equal(f.events.includes('root-check'),false);assert.equal(f.locked(),false)});
test('production caller changed private inspection bytes blocks freeze',async()=>{const f=await controlledCaller();await prepareRuntimeArtifactR32({action:'inspect',activation:f.activation},f.d);const old=f.files.get('controlled-private-inspection.json');f.files.set('controlled-private-inspection.json',Buffer.concat([old,Buffer.from(' ')]));await assert.rejects(prepareRuntimeArtifactR32({action:'freeze',activation:f.activation},f.d),/PRIOR_INSPECTION_BYTES_CHANGED/);assert.equal(f.events.includes('root-freeze'),false);assert.equal(f.locked(),false)});
test('production caller post-read protected configuration drift cannot save a qualified inspection',async()=>{const f=await controlledCaller(),original=f.d.verifyProtection;let n=0;f.d.verifyProtection=async()=>{const p=await original();if(++n===2)p.nodeConfigSHA256='a'.repeat(64);return p};await assert.rejects(prepareRuntimeArtifactR32({action:'inspect',activation:f.activation},f.d),/FULL_PROTECTION_CHANGED/);assert.equal(f.files.has(runtimeArtifactR32Journal),false);assert.equal(f.events.filter(x=>x==='root-inspect').length,1);assert.equal(f.events.includes('root-freeze'),false);assert.equal(f.locked(),false)});
