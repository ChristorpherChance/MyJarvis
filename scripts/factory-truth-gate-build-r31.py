#!/usr/bin/python3
"""Finite R31 build preparation; actual source observation is required. Candidate code runs only UID1000, network none.

Independent DB/API semantics are a separate later stage. No production package is
replaced and no host socket is mounted in any candidate container.
"""
import os, sys, stat, json, hashlib, subprocess, time, uuid, re, selectors
try:
    import pwd
except ImportError:
    pwd=None  # Preparation inspection is portable; execution remains Linux-only.
from pathlib import Path
from types import ModuleType

SOURCE='/home/superopen/All-Projects/msf-targets-r31/source'
FINGERPRINT='7814f74e1e7c62b1aeb862a6617970551a00493ba2884bf65595cfe65ef2a981'
LOCAL_FLAT_FINGERPRINT='0800a9f384a3b96ce43b9b676c8b085fbc3666892a7376b7dde326069b2e030d'
METADATA=None
SOURCE_ORIGIN=None
SOURCE_ORIGIN_SHA=None
QA_MANIFEST_SHA=None
IDENTITY=None
ROOT=Path('/var/lib/jarvis-development/101/truth-gate-r31-build')
HELPER=Path('/opt/jarvis-development/software-factory/project-autonomy-evidence.py')
HELPER_SHA='57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2'
IMAGE='sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96'
CACHE_BINDINGS=[
    ('corepack-runtime','7912713a300f2316823a46a8e034c3c5d85a3190ca0dea9e7f13cd6138c1fe5b'),
    ('corepack-cache','746e0d599f6038fc9e09af755cb8343f2e2f2253c4d46a359f803a99058b2bff'),
    ('pnpm-store','120ec4b1f4615c0097575d77865b233fd87fb3eb1df5da7a5ec5ebf212e403bc')]
CACHE_PRODUCER=Path('/var/lib/jarvis-development/101/truth-gate-r29-build/6cc370ff0a1b82babedc165b0e574c26')
STAGES=[('offline-install',['/usr/local/bin/node','/corepack-runtime/dist/pnpm.js','install','--offline','--frozen-lockfile','--ignore-scripts','--package-import-method=copy','--store-dir','/pnpm-store'],300),('build',['/usr/local/bin/node','/corepack-runtime/dist/pnpm.js','-r','--no-bail','run','build'],480),('typecheck',['/usr/local/bin/node','/corepack-runtime/dist/pnpm.js','-r','--no-bail','run','typecheck'],480),('truth-unit',['/usr/local/bin/node','--experimental-strip-types','--test','--test-reporter=tap','apps/server/src/modules/test/truth-gate.test.mjs'],120)]

MOUNT_PROBE_JS=r'''const fs=require('node:fs'),crypto=require('node:crypto');
const expected=JSON.parse(process.argv[1]);
const fail=c=>{throw new Error(c)};
if(process.getuid()!==1000||process.getgid()!==1000)fail('UID');
const lines=fs.readFileSync('/proc/self/mountinfo','utf8').trim().split('\n');
const observed=[];
for(const e of expected){
 const matches=lines.map(x=>x.split(' ')).filter(x=>x[4]===e.root);
 if(matches.length!==1||!matches[0][5].split(',').includes('ro'))fail('RO_MOUNT');
 const root=fs.lstatSync(e.root);if(!root.isDirectory()||root.uid!==0||root.gid!==0||(root.mode&511)!==365||root.dev!==e.device||root.ino!==e.inode)fail('ROOT');
 const p=e.root+'/'+e.path,s=fs.lstatSync(p);if(!s.isFile()||s.uid!==0||s.gid!==0||s.nlink!==1||(s.mode&511)!==e.mode||s.size!==e.bytes)fail('FILE');
 if(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==e.sha256)fail('BYTES');
 let rejected=false;try{fs.writeFileSync(e.root+'/.jarvis-mount-proof','bounded-mount-proof',{flag:'wx'})}catch(x){if(x.code==='EROFS')rejected=true;else throw x}if(!rejected)fail('MUTATION');
 observed.push({...e,readOnlyMount:true,mutationRejected:true,bytesVerified:true});
}
const work=fs.lstatSync('/work');if(!work.isDirectory()||work.uid!==1000||work.gid!==1000)fail('WORK');
const path='/work/.jarvis-mount-proof';fs.writeFileSync(path,'bounded-mount-proof',{flag:'wx',mode:384});if(fs.readFileSync(path,'utf8')!=='bounded-mount-proof')fail('WORK_BYTES');fs.unlinkSync(path);
process.stdout.write(JSON.stringify({schemaVersion:1,kind:'r31-normal-bind-bootstrap',uid:1000,gid:1000,caches:observed,workWritable:true,candidateCodeExecuted:false})+'\n');'''
STAGES.insert(0,('mount-proof',[],30))
STAGES.append(('targeted-pure',['/usr/local/bin/node','--test','--test-reporter=tap','/qa-tools/targeted-pure.mjs'],120))

def mount_probe_expected(cache_reports,qa_report):
    expected=[]
    for report in cache_reports:
        raw=private_read(Path(report['manifestPath']),16*1024*1024);need(hashlib.sha256(raw).hexdigest()==report['manifestSHA256'],'R31_BUILD_CACHE_MANIFEST_CHANGED');manifest=json.loads(raw)
        need(manifest['contentTreeSHA256']==report['outputContentTreeSHA256'] and manifest['metadataSHA256']==report['outputMetadataSHA256'] and manifest['root']==report['root'] and manifest['identity']==report['identity'],'R31_BUILD_CACHE_MANIFEST_CHANGED')
        file=next((e for e in manifest['entries'] if e['kind']=='file'),None);need(file is not None,'R31_BUILD_BOOTSTRAP_CACHE_EMPTY')
        expected.append({'root':'/'+report['name'],'device':report['identity']['device'],'inode':report['identity']['inode'],'path':file['path'],'sha256':file['sha256'],'bytes':file['bytes'],'mode':stat.S_IMODE(file['metadata'][4])})
    file=qa_report['files']['targeted-pure.mjs']
    expected.append({'root':'/qa-tools','device':qa_report['identity']['device'],'inode':qa_report['identity']['inode'],
      'path':'targeted-pure.mjs','sha256':file['sha256'],'bytes':file['bytes'],'mode':0o444})
    return expected

def qualify_mount_probe(log,expected):
    def object_pairs(pairs):
        result={}
        for key,value in pairs:
            if key in result:raise ValueError('duplicate')
            result[key]=value
        return result
    def reject_constant(value):raise ValueError('constant')
    def typed_equal(a,b):
        if type(a) is not type(b):return False
        if isinstance(a,dict):return a.keys()==b.keys() and all(typed_equal(v,b[k]) for k,v in a.items())
        if isinstance(a,list):return len(a)==len(b) and all(typed_equal(x,y) for x,y in zip(a,b))
        return a==b
    try:value=json.loads(log.decode('utf-8'),object_pairs_hook=object_pairs,parse_constant=reject_constant)
    except (ValueError,UnicodeError):return None
    wanted={'schemaVersion':1,'kind':'r31-normal-bind-bootstrap','uid':1000,'gid':1000,'caches':[{**e,'readOnlyMount':True,'mutationRejected':True,'bytesVerified':True} for e in expected],'workWritable':True,'candidateCodeExecuted':False}
    return value if typed_equal(value,wanted) else None

def stage_cache(helper,source,target):
    """Copy bytes from held input fds, never execute or share input hardlinks."""
    input_root=helper.open_directory(source);target.mkdir(mode=0o700);output_root=helper.open_directory(str(target));manifest=[];bytes_total=0;entries_total=0;deadline=time.monotonic()+240
    def identity(s):return (s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
    def read_file(parent,name,write_fd=None,expected=None):
        fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
        try:
            before=os.fstat(fd);need(stat.S_ISREG(before.st_mode) and before.st_size<=128*1024*1024,'R31_BUILD_CACHE_FILE_INVALID');need(expected is None or identity(before)==identity(expected),'R31_BUILD_CACHE_FILE_CHANGED');digest=hashlib.sha256();size=0
            while True:
                need(time.monotonic()<deadline,'R31_BUILD_CACHE_COPY_TIMEOUT');chunk=os.read(fd,65536)
                if not chunk:break
                size+=len(chunk);need(size<=before.st_size,'R31_BUILD_CACHE_FILE_CHANGED');digest.update(chunk)
                if write_fd is not None:
                    view=memoryview(chunk)
                    while view:
                        n=os.write(write_fd,view);need(n>0,'R31_BUILD_CACHE_COPY_SHORT_WRITE');view=view[n:]
            need(size==before.st_size and identity(before)==identity(os.fstat(fd)) and identity(before)==identity(os.stat(name,dir_fd=parent,follow_symlinks=False)),'R31_BUILD_CACHE_FILE_CHANGED')
            return before,digest.hexdigest()
        finally:os.close(fd)
    def walk(src,dst,prefix='',depth=0,verify=False):
        nonlocal bytes_total,entries_total
        need(depth<=32 and time.monotonic()<deadline,'R31_BUILD_CACHE_COPY_BOUND_EXCEEDED');before=os.fstat(src);need(stat.S_ISDIR(before.st_mode),'R31_BUILD_CACHE_DIRECTORY_INVALID');names=sorted(os.listdir(src));values=[]
        if verify:need(names==sorted(os.listdir(dst)),'R31_BUILD_CACHE_COPY_CLOSURE_CHANGED')
        for name in names:
            entries_total+=1;need(entries_total<=100000 and name not in ['.','..'],'R31_BUILD_CACHE_COPY_BOUND_EXCEEDED');s=os.stat(name,dir_fd=src,follow_symlinks=False);path=prefix+name
            if stat.S_ISDIR(s.st_mode):
                child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=src)
                try:
                    need(identity(s)==identity(os.fstat(child)),'R31_BUILD_CACHE_DIRECTORY_CHANGED')
                    if not verify:os.mkdir(name,0o700,dir_fd=dst)
                    output=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=dst)
                    try:values.extend(walk(child,output,path+'/',depth+1,verify));os.fchmod(output,0o555) if not verify else None
                    finally:os.close(output)
                finally:os.close(child)
            else:
                need(stat.S_ISREG(s.st_mode),'R31_BUILD_CACHE_SYMLINK_OR_SPECIAL_REFUSED');bytes_total+=s.st_size;need(bytes_total<=1024*1024*1024,'R31_BUILD_CACHE_COPY_BOUND_EXCEEDED');output=None
                try:
                    if not verify:output=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=dst)
                    current,digest=read_file(src,name,output,s)
                    if output is not None:os.fchmod(output,0o555 if current.st_mode&0o111 else 0o444);os.fsync(output)
                finally:
                    if output is not None:os.close(output)
                copied,copied_digest=read_file(dst,name);need(copied.st_uid==0 and copied.st_gid==0 and copied.st_nlink==1 and stat.S_IMODE(copied.st_mode)==(0o555 if current.st_mode&0o111 else 0o444) and copied_digest==digest,'R31_BUILD_CACHE_COPY_NOT_INDEPENDENT')
                values.append([path,digest,current.st_size,*identity(current)])
        need(identity(before)==identity(os.fstat(src)),'R31_BUILD_CACHE_DIRECTORY_CHANGED');return values
    try:
        manifest=walk(input_root,output_root);count=entries_total;size=bytes_total;entries_total=0;bytes_total=0
        need(manifest==walk(input_root,output_root,verify=True),'R31_BUILD_CACHE_COPY_INPUT_CHANGED');os.fchmod(output_root,0o555);os.fsync(output_root)
        output=cache_closure(helper,str(target));need(output==cache_closure(helper,str(target)),'R31_BUILD_CACHE_OUTPUT_CHANGED')
        need(output['files']==len(manifest) and output['bytes']==size,'R31_BUILD_CACHE_OUTPUT_COUNT_CHANGED')
        manifest_path=target.parent.parent/'cache-manifests'/(target.name+'.json');manifest_folder=manifest_path.parent
        if not manifest_folder.exists():manifest_folder.mkdir(mode=0o700)
        s=manifest_folder.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o077,'R31_BUILD_CACHE_MANIFEST_ROOT_UNTRUSTED');need(not os.path.lexists(manifest_path),'R31_BUILD_CACHE_MANIFEST_EXISTS')
        store(manifest_path,output);manifest_raw=private_read(manifest_path,16*1024*1024)
        return {'files':len(manifest),'entries':count,'bytes':size,'inputSnapshotSHA256':hashlib.sha256(json.dumps(manifest,separators=(',',':')).encode()).hexdigest(),'root':str(target),'identity':output['identity'],'outputContentTreeSHA256':output['contentTreeSHA256'],'outputMetadataSHA256':output['metadataSHA256'],'manifestPath':str(manifest_path),'manifestSHA256':hashlib.sha256(manifest_raw).hexdigest(),'independentRootOwnedReadOnlyCopy':True,'sharedHardlinks':False,'secondInputAndOutputReadVerified':True,'executableFilesPreservedReadOnly':True,'outputFullClosureDoubleRead':True}
    finally:os.close(input_root);os.close(output_root)

def cache_closure(helper,path):
    root=helper.open_directory(path);entries=[];files=0;total=0;deadline=time.monotonic()+120
    def metadata(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
    def visit(fd,prefix='',depth=0):
        nonlocal files,total
        need(depth<=32 and len(entries)<=100000 and time.monotonic()<deadline,'R31_BUILD_CACHE_CLOSURE_BOUND_EXCEEDED');before=os.fstat(fd);need(stat.S_ISDIR(before.st_mode) and before.st_uid==0 and before.st_gid==0 and stat.S_IMODE(before.st_mode)==0o555,'R31_BUILD_CACHE_CLOSURE_DIRECTORY_INVALID');entries.append({'path':prefix.rstrip('/') or '.','kind':'directory','metadata':metadata(before)})
        for name in sorted(os.listdir(fd)):
            s=os.stat(name,dir_fd=fd,follow_symlinks=False);name_path=prefix+name
            if stat.S_ISDIR(s.st_mode):
                child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
                try:need(metadata(s)==metadata(os.fstat(child)),'R31_BUILD_CACHE_CLOSURE_CHANGED');visit(child,name_path+'/',depth+1)
                finally:os.close(child)
            else:
                need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_gid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode) in [0o444,0o555] and s.st_size<=128*1024*1024,'R31_BUILD_CACHE_CLOSURE_FILE_INVALID');child=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
                try:
                    before_file=os.fstat(child);need(metadata(s)==metadata(before_file),'R31_BUILD_CACHE_CLOSURE_CHANGED');digest=hashlib.sha256();size=0
                    while True:
                        need(time.monotonic()<deadline,'R31_BUILD_CACHE_CLOSURE_TIMEOUT');chunk=os.read(child,65536)
                        if not chunk:break
                        size+=len(chunk);need(size<=s.st_size,'R31_BUILD_CACHE_CLOSURE_CHANGED');digest.update(chunk)
                    need(size==s.st_size and metadata(s)==metadata(os.fstat(child)) and metadata(s)==metadata(os.stat(name,dir_fd=fd,follow_symlinks=False)),'R31_BUILD_CACHE_CLOSURE_CHANGED');files+=1;total+=size;need(total<=1024*1024*1024 and len(entries)<100000,'R31_BUILD_CACHE_CLOSURE_BOUND_EXCEEDED');entries.append({'path':name_path,'kind':'file','sha256':digest.hexdigest(),'bytes':size,'metadata':metadata(s)})
                finally:os.close(child)
        need(metadata(before)==metadata(os.fstat(fd)),'R31_BUILD_CACHE_CLOSURE_CHANGED')
    try:
        s=os.fstat(root);identity={'device':s.st_dev,'inode':s.st_ino};visit(root)
        content=[{'path':e['path'],'kind':e['kind'],**({'sha256':e['sha256'],'bytes':e['bytes'],'executable':bool(e['metadata'][4]&0o111)} if e['kind']=='file' else {})} for e in entries]
        return {'schemaVersion':1,'kind':'r29-independent-readonly-cache-closure','root':path,'identity':identity,'files':files,'entries':entries,'bytes':total,'contentTreeSHA256':hashlib.sha256(json.dumps(content,separators=(',',':')).encode()).hexdigest(),'metadataSHA256':hashlib.sha256(json.dumps(entries,separators=(',',':')).encode()).hexdigest(),'rootOwnedReadOnly':True,'sharedHardlinks':False,'symlinks':False}
    finally:os.close(root)

def assert_mount_root(mount):
    """Normal paths are confined by root-private parents and held inode identity."""
    source=Path(mount['source']);parent=source.parent
    for entry in [parent,*parent.parents]:
        s=entry.lstat();need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'R31_BUILD_MOUNT_PARENT_UNTRUSTED')
    need(stat.S_IMODE(parent.lstat().st_mode)==0o700,'R31_BUILD_MOUNT_PRIVATE_PARENT_REQUIRED')
    current=source.lstat();held=os.fstat(mount['fd'])
    need(stat.S_ISDIR(current.st_mode) and not stat.S_ISLNK(current.st_mode) and (current.st_dev,current.st_ino)==(held.st_dev,held.st_ino)==(mount['device'],mount['inode']),'R31_BUILD_MOUNT_IDENTITY_CHANGED')
    if not mount['rw']:need(current.st_uid==0 and not current.st_mode&0o222,'R31_BUILD_CACHE_ROOT_WRITABLE')
    return True

def need(v,c):
    if not v:raise RuntimeError(c)

def preparation_ready():
    return (isinstance(METADATA,str) and re.fullmatch('[a-f0-9]{64}',METADATA) is not None
      and isinstance(IDENTITY,dict) and set(IDENTITY)=={'device','inode'} and all(type(v) is int and v>0 for v in IDENTITY.values())
      and isinstance(SOURCE_ORIGIN,str) and re.fullmatch(r'/var/lib/jarvis-development/101/targets-r31-preparation/[a-f0-9]{32}/origin.json',SOURCE_ORIGIN) is not None
      and all(isinstance(v,str) and re.fullmatch('[a-f0-9]{64}',v) is not None for v in [SOURCE_ORIGIN_SHA,QA_MANIFEST_SHA]))

def reuse_cache_reports(helper):
    reports=[]
    for name,pin in CACHE_BINDINGS:
        path=CACHE_PRODUCER/'cache-manifests'/(name+'.json');raw=private_read(path,16*1024*1024)
        need(hashlib.sha256(raw).hexdigest()==pin,'R31_BUILD_CACHE_MANIFEST_CHANGED');manifest=json.loads(raw)
        source=str(CACHE_PRODUCER/'caches'/name)
        need(manifest.get('root')==source and manifest.get('kind')=='r29-independent-readonly-cache-closure','R31_BUILD_CACHE_SCOPE_CHANGED')
        first=cache_closure(helper,source);second=cache_closure(helper,source)
        need(first==manifest==second,'R31_BUILD_CACHE_REUSE_CHANGED')
        reports.append({'name':name,'root':source,'identity':manifest['identity'],'manifestPath':str(path),'manifestSHA256':pin,
          'outputContentTreeSHA256':manifest['contentTreeSHA256'],'outputMetadataSHA256':manifest['metadataSHA256'],
          'cacheCopiedAgain':False,'rootOwnedReadOnly':True,'fullClosureDoubleRead':True,'files':manifest['files'],'bytes':manifest['bytes']})
    return reports

def qa_tools_state(path):
    raw=private_read(path/'manifest.json');need(hashlib.sha256(raw).hexdigest()==QA_MANIFEST_SHA,'R31_BUILD_QA_MANIFEST_CHANGED');value=json.loads(raw)
    names=['baseline-r29-t8.ts','baseline-r30-truth.ts','targeted-pure.mjs']
    need(set(value)=={'schemaVersion','kind','files'} and value['schemaVersion']==1 and value['kind']=='r31-bounded-qa-tools'
      and sorted(value['files'])==names and sorted(os.listdir(path))==sorted(names+['manifest.json']),'R31_BUILD_QA_MANIFEST_INVALID')
    info=path.lstat();need(stat.S_ISDIR(info.st_mode) and info.st_uid==info.st_gid==0 and stat.S_IMODE(info.st_mode)==0o555,'R31_BUILD_QA_DIRECTORY_UNTRUSTED')
    for name,item in value['files'].items():
        need(set(item)=={'sha256','bytes'} and type(item['bytes']) is int and 0<item['bytes']<=2000000
          and re.fullmatch('[a-f0-9]{64}',item['sha256']) is not None,'R31_BUILD_QA_FILE_SCOPE_CHANGED')
        file=path/name;s=file.lstat();body=private_read(file);need(s.st_uid==s.st_gid==0 and stat.S_IMODE(s.st_mode)==0o444 and len(body)==item['bytes'] and hashlib.sha256(body).hexdigest()==item['sha256'],'R31_BUILD_QA_FILE_CHANGED')
    return {'identity':{'device':info.st_dev,'inode':info.st_ino},'manifestSHA256':QA_MANIFEST_SHA,'files':value['files']}

def private_read(path,limit=2000000):
    for x in [path,*path.parents]:
        s=x.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'R31_BUILD_TRUSTED_CHAIN_REQUIRED')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        a=os.fstat(fd);need(stat.S_ISREG(a.st_mode) and a.st_nlink==1 and a.st_size<=limit,'R31_BUILD_TRUSTED_FILE_INVALID');raw=os.read(fd,limit+1);b=os.fstat(fd)
        need(len(raw)==a.st_size and (a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns)==(b.st_dev,b.st_ino,b.st_size,b.st_mtime_ns,b.st_ctime_ns),'R31_BUILD_TRUSTED_FILE_CHANGED');return raw
    finally:os.close(fd)

def store(path,value):
    raw=(json.dumps(value,separators=(',',':'))+'\n').encode();tmp=path.parent/(path.name+'.'+uuid.uuid4().hex+'.tmp');fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        view=memoryview(raw)
        while view:
            n=os.write(fd,view);need(n>0,'R31_BUILD_STORE_SHORT_WRITE');view=view[n:]
        os.fsync(fd)
    finally:os.close(fd)
    os.replace(tmp,path);d=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(d)
    finally:os.close(d)

def call(args,timeout=30):
    return subprocess.run(['/usr/bin/docker',*args],capture_output=True,timeout=timeout,env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'})

def inspect(name,timeout=30):
    r=call(['container','inspect',name],timeout=timeout);
    if r.returncode:
        text=r.stderr.decode('utf-8','replace').strip()
        try:empty=json.loads(r.stdout)==[]
        except (ValueError,UnicodeError):empty=False
        if r.returncode==1 and empty and text in ['Error response from daemon: No such container: '+name,'Error: No such container: '+name,'Error: No such object: '+name]:return None
        raise RuntimeError('R31_BUILD_CONTAINER_INSPECT_FAILED')
    values=json.loads(r.stdout);need(len(values)==1,'R31_BUILD_CONTAINER_INSPECT_FORMAT');return values[0]

def stream_start(container,logfile,timeout):
    fd=os.open(logfile,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);proc=None;selector=selectors.DefaultSelector();size=0;digest=hashlib.sha256();timeout_hit=False;limit_hit=False
    try:
        proc=subprocess.Popen(['/usr/bin/docker','start','-a',container],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'});selector.register(proc.stdout,selectors.EVENT_READ);deadline=time.monotonic()+timeout
        while selector.get_map():
            if time.monotonic()>=deadline:timeout_hit=True;break
            for key,_ in selector.select(min(1,max(0,deadline-time.monotonic()))):
                piece=os.read(key.fd,65536)
                if not piece:selector.unregister(key.fileobj);continue
                if size+len(piece)>50*1024*1024:limit_hit=True;break
                view=memoryview(piece)
                while view:
                    n=os.write(fd,view);need(n>0,'R31_BUILD_LOG_SHORT_WRITE');view=view[n:]
                size+=len(piece);digest.update(piece)
            if limit_hit:break
        if timeout_hit or limit_hit:
            if proc.poll() is None:proc.terminate()
            try:proc.wait(timeout=10)
            except subprocess.TimeoutExpired:proc.kill();proc.wait(timeout=10)
        else:proc.wait(timeout=max(1,deadline-time.monotonic()))
        os.fsync(fd);return {'exitCode':proc.returncode,'timeout':timeout_hit,'logLimitExceeded':limit_hit,'logSHA256':digest.hexdigest(),'logBytes':size}
    finally:
        selector.close()
        if proc is not None:
            if proc.poll() is None:
                proc.terminate()
                try:proc.wait(timeout=10)
                except subprocess.TimeoutExpired:proc.kill();proc.wait(timeout=10)
            if proc.stdout is not None:proc.stdout.close()
        os.close(fd)

def source_state(helper,path):
    before=helper.fingerprint(path);root=helper.open_directory(path);meta=[]
    try:
        info=os.fstat(root);identity={'device':info.st_dev,'inode':info.st_ino}
        for e in before['manifest']:
            fd=helper.open_relative(root,e['path'])
            try:
                s=os.fstat(fd);meta.append([e['path'],s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns])
            finally:os.close(fd)
    finally:os.close(root)
    need(before==helper.fingerprint(path),'R31_BUILD_SOURCE_READ_CHANGED')
    return {'sha256':before['sha256'],'files':before['files'],'bytes':before['bytes'],'metadataSHA':hashlib.sha256(json.dumps(meta,separators=(',',':')).encode()).hexdigest(),'identity':identity}

def owner_contract(attempt):
    unit='jarvis-tg-r31-'+attempt+'-owner.service';need(os.environ.get('JARVIS_R31_BUILD_OWNER_UNIT')==unit,'R31_BUILD_FIXED_OWNER_REQUIRED')
    result=subprocess.run(['/usr/bin/systemctl','show',unit,'--property=ActiveState,MainPID,ControlGroup,RuntimeMaxUSec,TimeoutStopUSec,KillMode,ExecStopPost,Restart'],capture_output=True,text=True,timeout=10)
    need(result.returncode==0,'R31_BUILD_OWNER_READ_FAILED');values=dict(x.split('=',1) for x in result.stdout.splitlines() if '=' in x)
    post=values.get('ExecStopPost','');match=re.fullmatch(r'\{\s*path=([^;{}]+?)\s*;\s*argv\[\]=(.*?)\s*;\s*ignore_errors=(yes|no)\s*;[^{}]*\}',post)
    need(match is not None and match.group(1)=='/usr/bin/python3' and match.group(2).split()==['/usr/bin/python3',str(Path(__file__)),'--reconcile-cleanup',attempt] and match.group(3)=='no','R31_BUILD_OWNER_STOPPOST_CHANGED')
    need(values.get('ActiveState')=='active' and values.get('MainPID')==str(os.getpid()) and values.get('ControlGroup')=='/system.slice/'+unit and values.get('RuntimeMaxUSec')=='30min' and values.get('TimeoutStopUSec')=='5min' and values.get('KillMode')=='control-group' and values.get('Restart')=='no','R31_BUILD_OWNER_CONTRACT_CHANGED')
    stat_value=Path('/proc/self/stat').read_text();fields=stat_value[stat_value.rfind(')')+2:].split();groups=[x.split(':',2)[2] for x in Path('/proc/self/cgroup').read_text().splitlines()]
    need(values['ControlGroup'] in groups,'R31_BUILD_OWNER_CGROUP_CHANGED')
    return {'unit':unit,'pid':os.getpid(),'startTicks':fields[19],'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'controlGroup':values['ControlGroup'],'runtimeMaxSec':1800,'stopTimeoutSec':300,'killMode':'control-group','restart':'no','exactExecStopPostConfigured':True}

def reconcile_cleanup(attempt):
    need(preparation_ready(),'R31_BUILD_PREPARATION_NOT_FROZEN')
    need(os.geteuid()==0 and re.fullmatch('[a-f0-9]{32}',attempt),'R31_BUILD_RECONCILE_SCOPE_INVALID')
    for x in [ROOT,*ROOT.parents]:
        s=x.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'R31_BUILD_RECONCILE_ROOT_UNTRUSTED')
    labels={'jarvis.truthgate.r31.attempt':attempt,'jarvis.truthgate.r31.kind':'build'};names=['jarvis-tg-r31-'+attempt+'-'+stage for stage,_,_ in STAGES];errors=[]
    ownership=json.loads(private_read(ROOT/'ownership'/(attempt+'.json')));need(ownership['attempt']==attempt and ownership['sourceFingerprint']==FINGERPRINT and ownership['containers']==names and ownership['labels']==labels and ownership['imageID']==IMAGE and ownership['emptyResourceScopeVerified'] is True and ownership['toolSHA256']==hashlib.sha256(private_read(Path(__file__))).hexdigest(),'R31_BUILD_RECONCILE_OWNERSHIP_CHANGED')
    state_path=ROOT/attempt/'state.json';state=json.loads(private_read(state_path)) if os.path.lexists(state_path) else None;owned=set()
    if state is not None:
        need(state['attempt']==attempt and state['resources']['containers']==names and state['resources']['labels']==labels,'R31_BUILD_RECONCILE_STATE_CHANGED')
        intent=state.get('creationIntent',{}).get('name')
        if intent is not None:need(intent in names,'R31_BUILD_RECONCILE_INTENT_CHANGED');owned.add(intent)
        for check in state.get('checks',[]):
            name='jarvis-tg-r31-'+attempt+'-'+check['id'];need(name in names and re.fullmatch('[a-f0-9]{64}',check['containerID']),'R31_BUILD_RECONCILE_CHECK_CHANGED');owned.add(name)
    for name in names:
        try:
            current=inspect(name,timeout=15)
            if current is not None:
                need(name in owned and current['Config']['Labels'].items()>=labels.items() and current['Image']==IMAGE,'R31_BUILD_RECONCILE_RESOURCE_IDENTITY_CHANGED');need(call(['rm','-f',current['Id']],timeout=15).returncode==0,'R31_BUILD_RECONCILE_REMOVE_FAILED')
            need(inspect(name,timeout=15) is None,'R31_BUILD_RECONCILE_STILL_PRESENT')
        except BaseException:errors.append(name)
    scoped=call(['ps','-aq','--filter','label=jarvis.truthgate.r31.attempt='+attempt],timeout=15);empty=scoped.returncode==0 and not scoped.stdout.strip()
    folder=ROOT/'reconciliations'
    if not folder.exists():folder.mkdir(mode=0o700)
    s=folder.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o077,'R31_BUILD_RECONCILE_REPORT_ROOT_UNTRUSTED')
    value={'schemaVersion':1,'kind':'r31-build-fixed-owner-stoppost-resource-reconciliation','attempt':attempt,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'containers':names,'exactResourceScopeObservedAbsent':not errors and empty,'scopeErrors':errors,'attemptLabelScopeEmpty':empty,'modelsInvoked':False,'productAccepted':False,'cleanupIndependentlyVerified':False,'sourceCodeExecuted':False,'rawLogsExported':False};store(folder/(attempt+'-'+uuid.uuid4().hex+'.json'),value);print(json.dumps(value));return 0 if not errors and empty else 1

def main():
    need(preparation_ready(),'R31_BUILD_PREPARATION_NOT_FROZEN')
    need(os.geteuid()==0 and len(sys.argv)==3 and sys.argv[1]=='--run' and re.fullmatch('[a-f0-9]{32}',sys.argv[2]),'R31_BUILD_ARGUMENTS_INVALID')
    attempt=sys.argv[2];owner=owner_contract(attempt);body=private_read(HELPER);need(hashlib.sha256(body).hexdigest()==HELPER_SHA,'R31_BUILD_HELPER_CHANGED');h=ModuleType('r31_build_evidence');exec(compile(body,str(HELPER),'exec'),h.__dict__)
    ownership=json.loads(private_read(ROOT/'ownership'/(attempt+'.json')));need(ownership['attempt']==attempt and ownership['sourceFingerprint']==FINGERPRINT and ownership['toolSHA256']==hashlib.sha256(private_read(Path(__file__))).hexdigest() and ownership['emptyResourceScopeVerified'] is True,'R31_BUILD_OWNERSHIP_REQUIRED')
    need(hashlib.sha256(private_read(Path(SOURCE_ORIGIN))).hexdigest()==SOURCE_ORIGIN_SHA,'R31_BUILD_SOURCE_ORIGIN_CHANGED')
    qa_path=ROOT/'qa-tools';qa_before=qa_tools_state(qa_path)
    expected={'sha256':FINGERPRINT,'files':625,'bytes':18413026,'metadataSHA':METADATA,'identity':IDENTITY};before=source_state(h,SOURCE);need(before==expected,'R31_BUILD_SOURCE_BINDING_CHANGED')
    root=ROOT
    if not root.exists():root.mkdir(mode=0o700)
    for x in [root,*root.parents]:
        s=x.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'R31_BUILD_ROOT_UNTRUSTED')
    private=root/attempt;private.mkdir(mode=0o700);work=private/'work';work.mkdir(mode=0o700);home=work/'home';home.mkdir(mode=0o700)
    prefix='jarvis-tg-r31-'+attempt;labels={'jarvis.truthgate.r31.attempt':attempt,'jarvis.truthgate.r31.kind':'build'};names=[prefix+'-'+s[0] for s in STAGES]
    for name in names:need(inspect(name) is None,'R31_BUILD_RESOURCE_ALREADY_EXISTS')
    inventory=call(['ps','-aq','--filter','label=jarvis.truthgate.r31.attempt='+attempt]);need(inventory.returncode==0 and not inventory.stdout.strip(),'R31_BUILD_LABEL_SCOPE_NOT_EMPTY')
    image_result=call(['image','inspect',IMAGE]);need(image_result.returncode==0,'R31_BUILD_IMAGE_READ_FAILED');image=json.loads(image_result.stdout);need(len(image)==1 and image[0]['Id']==IMAGE and image[0]['Os']=='linux' and image[0]['Architecture']=='amd64' and isinstance(image[0].get('Config'),dict) and 'Volumes' in image[0]['Config'] and image[0]['Config']['Volumes'] in [None,{}],'R31_BUILD_IMAGE_CHANGED_OR_VOLUMES_UNLISTED')
    snapshot=h.snapshot(SOURCE,str(work/'source'));need(snapshot['sha256']==FINGERPRINT and snapshot['files']==625,'R31_BUILD_SNAPSHOT_CHANGED')
    need(source_state(h,SOURCE)==before,'R31_BUILD_SOURCE_CHANGED_AFTER_SNAPSHOT')
    account=pwd.getpwnam('superopen');need(account.pw_uid==1000 and account.pw_gid==1000,'R31_BUILD_UID_CHANGED')
    def handoff(fd):
        for name in os.listdir(fd):
            s=os.stat(name,dir_fd=fd,follow_symlinks=False)
            if stat.S_ISDIR(s.st_mode):
                child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
                try:handoff(child)
                finally:os.close(child)
            else:need(stat.S_ISREG(s.st_mode) and s.st_nlink==1,'R31_BUILD_SNAPSHOT_NOT_REGULAR');os.chown(name,1000,1000,dir_fd=fd,follow_symlinks=False)
        os.fchown(fd,1000,1000)
    fd=h.open_directory(str(work))
    try:handoff(fd)
    finally:os.close(fd)
    cache_reports=reuse_cache_reports(h)
    held=[];mounts=[]
    for source,destination,rw in [(str(work),'/work',True),*[(report['root'],'/'+report['name'],False) for report in cache_reports],(str(qa_path),'/qa-tools',False)]:
        handle=h.open_directory(source);held.append(handle);info=os.fstat(handle);need(stat.S_ISDIR(info.st_mode) and info.st_uid in [0,1000] and not info.st_mode&0o002,'R31_BUILD_MOUNT_SOURCE_INVALID')
        mounts.append({'source':source,'fd':handle,'destination':destination,'rw':rw,'device':info.st_dev,'inode':info.st_ino});assert_mount_root(mounts[-1])
    def assert_container(current,stage,command_args):
        need(current is not None and current['Config']['Labels'].items()>=labels.items() and current['Config']['Labels'].get('jarvis.truthgate.r31.stage')==stage and current['Image']==IMAGE and current['Config']['User']=='1000:1000','R31_BUILD_CREATED_SCOPE_CHANGED')
        config=current['Config'];need(config.get('Entrypoint')==[command_args[0]] and config.get('Cmd')==command_args[1:] and config.get('WorkingDir')=='/work/source' and not config.get('Volumes') and not config.get('Healthcheck'),'R31_BUILD_CREATED_COMMAND_CHANGED')
        environment=config.get('Env');need(isinstance(environment,list) and all(isinstance(x,str) for x in environment),'R31_BUILD_CREATED_ENV_CHANGED')
        for name,value in {'CI':'1','HOME':'/work/home','COREPACK_HOME':'/corepack-cache','COREPACK_ENABLE_NETWORK':'0','NODE_PATH':'','NODE_OPTIONS':'','PG_FORCE_NATIVE':''}.items():
            need([x for x in environment if x.startswith(name+'=')]==[name+'='+value],'R31_BUILD_CREATED_ENV_CHANGED')
        need(not any(x.split('=',1)[0] in ['LD_PRELOAD','LD_LIBRARY_PATH','BASH_ENV','ENV'] for x in environment),'R31_BUILD_CREATED_ENV_CHANGED')
        host=current['HostConfig'];need(host['NetworkMode']=='none' and host['Init'] is True and host['ReadonlyRootfs'] is True and host['Privileged'] is False and host['PidMode']=='' and host['IpcMode']=='private' and host['CapDrop']==['ALL'] and host.get('CapAdd') in [None,[]] and any(v in host['SecurityOpt'] for v in ['no-new-privileges','no-new-privileges=true']) and host['Memory']==8589934592 and host['NanoCpus']==3000000000 and host['PidsLimit']==512 and host['Tmpfs']=={'/tmp':'rw,nosuid,nodev,size=512m'},'R31_BUILD_SANDBOX_FLAGS_CHANGED')
        need(not host.get('PortBindings') and not host.get('Devices') and not host.get('DeviceRequests'),'R31_BUILD_EXTRA_CAPABILITY')
        actual=current['Mounts'];need(len(actual)==len(mounts),'R31_BUILD_MOUNTS_CHANGED')
        for mount in mounts:
            values=[x for x in actual if x['Destination']==mount['destination']];need(len(values)==1,'R31_BUILD_MOUNTS_CHANGED');value=values[0]
            need(value['Type']=='bind' and value['RW'] is mount['rw'] and value['Source']==mount['source'],'R31_BUILD_MOUNTS_CHANGED');assert_mount_root(mount)
        return current
    r={'schemaVersion':1,'kind':'software-factory-r31-isolated-build-validation','attempt':attempt,'owner':owner,'startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'source':before,'imageID':IMAGE,'snapshotFingerprint':snapshot['sha256'],'cacheReuse':cache_reports,'qaTools':qa_before,'sourceOriginSHA256':SOURCE_ORIGIN_SHA,'sourceFingerprintAlgorithm':'trusted-helper-directory-DFS','localFlatFingerprint':LOCAL_FLAT_FINGERPRINT,'resources':{'containers':names,'networks':[],'volumes':[],'labels':labels},'candidateUID':1000,'candidateNetwork':'none','hostDockerSocketMounted':False,'productionDatabaseUsed':False,'modelsInvoked':False,'checks':[],'status':'running','productAccepted':False,'independentDBAPIValidation':False,'cleanupIndependentlyVerified':False};state=private/'state.json';store(state,r)
    try:
        bootstrap=None;probe_expected=mount_probe_expected(cache_reports,qa_before)
        for (name,args,timeout),container in zip(STAGES,names):
            owner_contract(attempt)
            need(qa_tools_state(qa_path)==qa_before,'R31_BUILD_QA_TOOLS_CHANGED')
            if name=='mount-proof':args=['/usr/local/bin/node','-e',MOUNT_PROBE_JS,json.dumps(probe_expected,separators=(',',':'))]
            else:need(bootstrap is not None,'R31_BUILD_BOOTSTRAP_REQUIRED')
            r['creationIntent']={'name':container,'stage':name,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())};store(state,r)
            need(h.fingerprint(str(work/'source'))['sha256']==FINGERPRINT,'R31_BUILD_WORK_SOURCE_CHANGED')
            command=['create','--pull=never','--init','--name',container,'--network','none','--user','1000:1000','--security-opt','no-new-privileges','--cap-drop','ALL','--read-only','--memory','8g','--cpus','3','--pids-limit','512','--tmpfs','/tmp:rw,nosuid,nodev,size=512m','--env','CI=1','--env','HOME=/work/home','--env','COREPACK_HOME=/corepack-cache','--env','COREPACK_ENABLE_NETWORK=0','--env','NODE_PATH=','--env','NODE_OPTIONS=','--env','PG_FORCE_NATIVE=','--workdir','/work/source']
            for mount in mounts:assert_mount_root(mount);command+=['--mount','type=bind,src='+mount['source']+',dst='+mount['destination']+('' if mount['rw'] else ',readonly')]
            for k,v in labels.items():command+=['--label',k+'='+v]
            command+=['--label','jarvis.truthgate.r31.stage='+name,'--entrypoint',args[0],IMAGE,*args[1:]]
            created=call(command);need(created.returncode==0,'R31_BUILD_CONTAINER_CREATE_FAILED');current=assert_container(inspect(container),name,args);need(re.fullmatch('[a-f0-9]{64}',current['Id']) and created.stdout.decode().strip()==current['Id'],'R31_BUILD_CREATED_ID_CHANGED')
            logfile=private/(name+'.log');result=stream_start(current['Id'],logfile,timeout);current=assert_container(inspect(container),name,args);log=private_read(logfile,50*1024*1024);code=result['exitCode'];executed=current['State']['StartedAt']!='0001-01-01T00:00:00Z';ok=executed and code==0 and current['State']['ExitCode']==0 and not current['State']['Running'] and not result['timeout'] and not result['logLimitExceeded'];counts=None
            if name=='mount-proof':
                bootstrap=qualify_mount_probe(log,probe_expected) if ok else None;ok=ok and bootstrap is not None;r['normalBindBootstrap']=bootstrap
            if name in ['truth-unit','targeted-pure']:
                counts={}
                for field in ['tests','pass','fail','cancelled','skipped','todo']:
                    matches=re.findall(r'^# '+field+r' ([0-9]+)\s*$',log.decode('utf-8','replace'),re.M);need(len(matches)==1,'R31_BUILD_TEST_DENOMINATOR_INVALID');counts[field]=int(matches[0])
                total=16 if name=='truth-unit' else 26
                ok=ok and counts=={'tests':total,'pass':total,'fail':0,'cancelled':0,'skipped':0,'todo':0}
            diagnostics=[]
            for line in log.decode('utf-8','replace').splitlines():
                m=re.search(r'((?:apps|packages)/[A-Za-z0-9_./-]+\.(?:ts|tsx))[^\n]{0,60}(error TS[0-9]{4})',line)
                if m:diagnostics.append({'path':m.group(1),'code':m.group(2).replace('error ','')})
            r['checks'].append({'id':name,'executed':executed,'status':'pass' if ok else 'fail','exitCode':code,'timeout':result['timeout'],'logLimitExceeded':result['logLimitExceeded'],'containerID':current['Id'],'logSHA256':result['logSHA256'],'logBytes':result['logBytes'],'rawLogsExported':False,'compilerDiagnosticCodes':diagnostics,'tests':counts,'mountsAndSandboxFlagsActuallyVerified':True});store(state,r)
            r['checks'][-1]['candidateCodeExecuted']=executed and name!='mount-proof';store(state,r)
            removed=call(['rm','-f',container]);need(removed.returncode==0 and inspect(container) is None,'R31_BUILD_STAGE_CLEANUP_FAILED')
            if name in ['mount-proof','offline-install'] and not ok:break
        r['status']='pass' if len(r['checks'])==len(STAGES) and all(c['status']=='pass' for c in r['checks']) else 'fail'
    except BaseException as error:
        r['status']='fail';message=str(error);r['errorCode']=message if re.fullmatch('R31_BUILD_[A-Z0-9_]+',message) else 'R31_BUILD_OPERATION_FAILED'
    finally:
        failures=[]
        for name in names:
            try:
                current=inspect(name)
                if current is not None:
                    need(current['Config']['Labels'].items()>=labels.items() and current['Image']==IMAGE,'R31_BUILD_CLEANUP_SCOPE_CHANGED');need(call(['rm','-f',name]).returncode==0,'R31_BUILD_CLEANUP_FAILED')
                need(inspect(name) is None,'R31_BUILD_RESOURCE_STILL_PRESENT')
            except BaseException:failures.append(name)
        try:after=source_state(h,SOURCE);r['sourceAfter']=after;r['sourceUnchanged']=before==after;r['sourceReadComplete']=True
        except BaseException:r['sourceAfter']=None;r['sourceUnchanged']=False;r['sourceReadComplete']=False;r['sourceReadErrorCode']='R31_BUILD_FINAL_SOURCE_READ_FAILED'
        try:inventory=call(['ps','-aq','--filter','label=jarvis.truthgate.r31.attempt='+attempt]);label_empty=inventory.returncode==0 and not inventory.stdout.strip()
        except BaseException:label_empty=False
        r['cleanupClaimsComplete']=not failures and label_empty;r['cleanupUnresolvedNames']=failures;r['labelScopeActuallyEmpty']=label_empty;r['noRecordedResultStages']=[name for name,_,_ in STAGES if name not in {c['id'] for c in r['checks']}];r['noRecordedResultExecutionState']='unknown'
        if not r['sourceUnchanged'] or not r['cleanupClaimsComplete']:r['status']='fail'
        for fd in held:os.close(fd)
        r['finishedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());store(state,r)
    print(json.dumps({'attempt':attempt,'status':r['status'],'sourceUnchanged':r['sourceUnchanged'],'checks':r['checks'],'cleanupClaimsComplete':r['cleanupClaimsComplete'],'independentDBAPIValidation':False,'productAccepted':False,'rawLogsExported':False}))

if __name__=='__main__':
    if sys.argv[1:]==['--inspect']:
        print(json.dumps({'kind':'r31-finite-build-preparation','ready':preparation_ready(),'sourceFingerprintDFS':FINGERPRINT,'sourceFingerprintFlat':LOCAL_FLAT_FINGERPRINT,'sourceFiles':625,'stages':[s[0] for s in STAGES],'modelsInvoked':False,'actualBuildExecuted':False,'productAccepted':False}));sys.exit(0)
    if len(sys.argv)==3 and sys.argv[1]=='--reconcile-cleanup':sys.exit(reconcile_cleanup(sys.argv[2]))
    main()
