/** Independent complete frozen-byte census. Loads only reviewed Python data helpers. */
import {readFile,open} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';import {remote,lanProfile,python} from './managed-server-client.mjs';import {spawnSync} from 'node:child_process';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function independentPGFrozenRootProgram(){return String.raw`
import ast,hashlib,json,os,re,stat,time,subprocess,signal
from pathlib import Path,PurePosixPath
from types import ModuleType
def need(v,c):
 if not v:raise RuntimeError(c)
def digest(b):return hashlib.sha256(b).hexdigest()
def global_deadline(signum,frame):raise RuntimeError('QA_PG_FROZEN_GLOBAL_DEADLINE_EXCEEDED')
signal.signal(signal.SIGALRM,global_deadline);signal.alarm(150)
need(os.geteuid()==0 and p=={'attempt':'3c7ade1178fc47184cd9aaba9e84b855','manifestSHA256':'d916c96e199ab7230a6397cd1f4f6fdbceacf30588a16b6943dc8da2996b6eb1','metadataSHA256':'3fee74b974414acce00e557f3d598f0c881f38717465ebd3abfff12d4b3345ca'},'QA_PG_FROZEN_EXACT_SCOPE_CHANGED')
base=Path('/var/lib/jarvis-development/101/r29-qa-pg-runtime')/p['attempt'];control=base/'control';worker=Path('/opt/jarvis-development/software-factory/factory-build-independent-pg-runtime-r29-r2-57eb441548b43362.py')
def boot_read(path):
 parent=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 def identity(v):return (v.st_dev,v.st_ino,v.st_uid,v.st_gid,v.st_mode,v.st_nlink,v.st_size,v.st_mtime_ns,v.st_ctime_ns)
 try:
  for name in path.parts[1:-1]:
   before=os.stat(name,dir_fd=parent,follow_symlinks=False);need(stat.S_ISDIR(before.st_mode) and before.st_uid==before.st_gid==0 and not before.st_mode&0o022,'QA_PG_FROZEN_BOOT_PARENT_UNTRUSTED')
   child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
   try:need(identity(before)==identity(os.fstat(child)),'QA_PG_FROZEN_BOOT_PARENT_CHANGED')
   except BaseException:os.close(child);raise
   os.close(parent);parent=child
  before=os.stat(path.name,dir_fd=parent,follow_symlinks=False);fd=os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
  try:
   v=os.fstat(fd);need(identity(v)==identity(before) and stat.S_ISREG(v.st_mode) and v.st_uid==v.st_gid==0 and not v.st_mode&0o222 and v.st_nlink==1 and 0<=v.st_size<=100000,'QA_PG_FROZEN_BOOT_FILE_UNTRUSTED');raw=b''
   while len(raw)<=100000:
    chunk=os.read(fd,min(65536,100001-len(raw)))
    if not chunk:break
    raw+=chunk
   need(len(raw)==v.st_size and identity(v)==identity(os.fstat(fd))==identity(os.stat(path.name,dir_fd=parent,follow_symlinks=False)),'QA_PG_FROZEN_BOOT_FILE_CHANGED');return raw
  finally:os.close(fd)
 finally:os.close(parent)
body=boot_read(worker);need(digest(body)=='57eb441548b433620b3b244724bb50f27abdbf981b0d5f0e031623b70cfc4ae5','QA_PG_FROZEN_WORKER_CHANGED')
t=ast.parse(body);names={'need','metadata','held_directory','read_private'};selected=[n for n in t.body if isinstance(n,ast.FunctionDef) and n.name in names];need({n.name for n in selected}==names,'QA_PG_FROZEN_READER_FUNCTIONS_CHANGED');env={'hashlib':hashlib,'json':json,'os':os,'re':re,'stat':stat,'time':time,'Path':Path};exec(compile(ast.Module(body=selected,type_ignores=[]),'trusted-pg-independent-byte-reader','exec'),env);read=env['read_private'];need(read(worker)==body,'QA_PG_FROZEN_WORKER_CHANGED')
freezer=read(control/'factory-freeze-independent-pg-runtime-r29.py');need(digest(freezer)=='09dd6ecef0ba1df906c1f938db8fa99cde4b8fccc2fa71bae8b281b9dc8a0dbb','QA_PG_FROZEN_BYTE_HELPER_CHANGED');h=ModuleType('trusted_pg_frozen_data_only');exec(compile(freezer,'trusted-pg-byte-helper','exec'),h.__dict__)
manifest_raw=read(base/'runtime-manifest.json');meta_raw=read(base/'runtime-metadata.json');need(digest(manifest_raw)==p['manifestSHA256'] and digest(meta_raw)==p['metadataSHA256'],'QA_PG_FROZEN_RECEIPTS_CHANGED');manifest=json.loads(manifest_raw);meta=json.loads(meta_raw)
need(meta.get('attempt')==p['attempt'] and meta.get('workerSHA256')==digest(body) and meta.get('cleanupProofSHA256')=='3a77cb1726402d9e0ab3feb7af48b00bb97ae57734ad488c90300be7a4ecdcae' and meta.get('root')==str(base/'runtime') and meta.get('packageJavaScriptExecutedByRoot') is False and meta.get('runtimeCJSClosureVerified') is False and digest(read(base/'state.json'))==meta.get('inputStateSHA256'),'QA_PG_FROZEN_METADATA_BINDING_CHANGED')
fd=h.open_root(base/'runtime')
try:
 first=h.tree(fd,frozen=True);need(h.manifest(first)==manifest and first['rootIdentity']==meta['rootIdentity'] and first['metadata']==meta['metadata'] and h.sha(h.raw_json(first['metadata']))==meta.get('metadataSHA256'),'QA_PG_FROZEN_FIRST_CLOSURE_CHANGED')
 versions={};packages={'pg':'8.23.0','pg-cloudflare':'1.4.0','pg-connection-string':'2.14.0','pg-int8':'1.0.1','pg-pool':'3.14.0','pg-protocol':'1.16.0','pg-types':'2.2.0','pgpass':'1.0.5','postgres-array':'2.0.0','postgres-bytea':'1.0.1','postgres-date':'1.0.7','postgres-interval':'1.2.0','split2':'4.2.0','xtend':'4.0.2'}
 for name,path in meta['packagePaths'].items():
  need(name in packages and re.fullmatch(r'node_modules/\.pnpm/[^/]+/node_modules/'+name+r'/package\.json',path),'QA_PG_FROZEN_PACKAGE_PATH_CHANGED');raw=read(base/'runtime'/path);entry=next((e for e in first['entries'] if e['path']==path),None);need(entry is not None and entry.get('type')=='file' and digest(raw)==entry['sha256'],'QA_PG_FROZEN_PACKAGE_BYTES_CHANGED');value=json.loads(raw);need(value.get('name')==name and value.get('version')==packages[name],'QA_PG_FROZEN_PACKAGE_VERSION_CHANGED');versions[name]=value['version']
 need(versions==packages,'QA_PG_FROZEN_PACKAGE_CLOSURE_INCOMPLETE')
 for e in first['entries']:
  if e['type']=='symlink':need((base/'runtime'/e['path']).resolve(strict=True).is_relative_to(base/'runtime'),'QA_PG_FROZEN_SYMLINK_ESCAPE')
 need(first==h.tree(fd,frozen=True) and read(base/'runtime-manifest.json')==manifest_raw and read(base/'runtime-metadata.json')==meta_raw and read(control/'factory-freeze-independent-pg-runtime-r29.py')==freezer and read(worker)==body,'QA_PG_FROZEN_SECOND_CLOSURE_CHANGED')
finally:os.close(fd)
def docker(args):return subprocess.run(['/usr/bin/docker',*args],capture_output=True,timeout=15,env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'})
name='jarvis-qa-pg-r29-'+p['attempt']+'-install';r=docker(['container','inspect',name]);need(r.returncode==1 and json.loads(r.stdout)==[] and r.stderr.decode().strip() in ['Error response from daemon: No such container: '+name,'Error: No such container: '+name,'Error: No such object: '+name],'QA_PG_FROZEN_INSTALLER_ABSENCE_UNPROVEN')
for filters in [['label=jarvis.qa.pg.r29.attempt='+p['attempt']],['label=jarvis.qa.pg.r29.attempt='+p['attempt'],'label=jarvis.qa.pg.r29.kind=independent-runtime']]:
 for query in [['ps','-aq'],['network','ls','-q'],['volume','ls','-q']]:
  args=list(query)
  for v in filters:args+=['--filter',v]
  r=docker(args);need(r.returncode==0 and not r.stdout.strip(),'QA_PG_FROZEN_RESOURCES_NOT_ABSENT')
print(json.dumps({'schemaVersion':1,'kind':'software-factory-r29-independent-pg-frozen-byte-readback','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'attempt':p['attempt'],'ready':True,'frozenClosureIndependentlyVerified':True,'twoCompleteReadbacks':True,'runtimeRoot':str(base/'runtime'),'runtimeRootIdentity':first['rootIdentity'],'manifestSHA256':p['manifestSHA256'],'manifest':manifest,'metadataSHA256':p['metadataSHA256'],'actualTreeSHA256':manifest['treeSHA256'],'entryCount':len(first['entries']),'files':sum(e['type']=='file' for e in first['entries']),'symlinks':sum(e['type']=='symlink' for e in first['entries']),'bytes':sum(e.get('bytes',0) for e in first['entries']),'packageVersions':versions,'packageMetadataClosureVerified':True,'installerAbsentNow':True,'twoDockerLabelScopesEmptyNow':True,'packageJavaScriptExecuted':False,'rootPackageJavaScriptExecuted':False,'runtimeCJSClosureVerified':False,'runtimeReady':False,'productAccepted':False,'modelsInvoked':False,'signalsSent':False,'resourcesRemoved':False,'mutationsPerformed':False}))
`;}
const params={attempt:'3c7ade1178fc47184cd9aaba9e84b855',manifestSHA256:'d916c96e199ab7230a6397cd1f4f6fdbceacf30588a16b6943dc8da2996b6eb1',metadataSHA256:'3fee74b974414acce00e557f3d598f0c881f38717465ebd3abfff12d4b3345ca'};
if(process.argv[2]==='syntax'){const r=spawnSync('python',['-c','import ast,sys;ast.parse(sys.stdin.read());print("frozen-independent-reader-syntax-pass")'],{input:independentPGFrozenRootProgram(),encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr);console.log(r.stdout.trim());}
else if(process.argv[2]==='read'){
 const r=JSON.parse(remote(lanProfile,'jarvis-101',python(params,independentPGFrozenRootProgram()),true,{timeoutMs:180000}));const path='artifacts/software-factory/goals-r29/independent-pg-frozen-byte-readback-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(r,null,2)+'\n',f=await open(path,'wx',0o644);try{await f.writeFile(raw);await f.sync()}finally{await f.close()}console.log(JSON.stringify({path,sha256:hash(raw),ready:r.ready,entries:r.entryCount,files:r.files,bytes:r.bytes,manifestSHA256:r.manifestSHA256,runtimeReady:r.runtimeReady}));
}else console.log(JSON.stringify({ready:false,reason:'explicit-read-required',mutationsPerformed:false,runtimeReady:false,productAccepted:false}));
