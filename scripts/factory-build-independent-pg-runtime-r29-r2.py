"""Finite offline PG-only installer; root controls bytes, UID1000 runs pnpm.

Preparation only until all reviewed, real receipt pins are fixed in a new
version. Cache manifests are reused, not copied again. No product source or
candidate node_modules is mounted. Never import package JS in this process.
"""
import calendar, hashlib, json, os, re, selectors, stat, subprocess, sys, time
from pathlib import Path
from types import ModuleType

ROOT=Path('/var/lib/jarvis-development/101/r29-qa-pg-runtime')
TOOLS=Path('/opt/jarvis-development/software-factory')
IMAGE='sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96'
PACKAGE_SHA='e65f7af605df2b5c4b2ee136cb0571c46456eb1c1c99f921170b16511165a8ea'
LOCK_SHA='fc2139a36dad144908d17339dc7e125a1e535aa3cad1064d27fca2fa76d1ccaa'
REVIEW_PIN=None
CACHE_CONTRACT_PIN=None
PROTECTION_PIN=None
FREEZER_PIN=None
CLEANUP_PIN=None
CACHE_NAMES=('corepack-runtime','corepack-cache','pnpm-store')
PACKAGES={'pg':'8.23.0','pg-cloudflare':'1.4.0','pg-connection-string':'2.14.0','pg-int8':'1.0.1','pg-pool':'3.14.0','pg-protocol':'1.16.0','pg-types':'2.2.0','pgpass':'1.0.5','postgres-array':'2.0.0','postgres-bytea':'1.0.1','postgres-date':'1.0.7','postgres-interval':'1.2.0','split2':'4.2.0','xtend':'4.0.2'}
H=re.compile('[a-f0-9]{64}')
INSTALL=['/usr/local/bin/node','/corepack-runtime/dist/pnpm.js','install','--offline','--frozen-lockfile','--ignore-scripts','--package-import-method=copy','--store-dir=/pnpm-store']

def need(v,c):
    if not v: raise RuntimeError(c)

def compact(v): return json.dumps(v,separators=(',',':')).encode()
def sha(v): return hashlib.sha256(v).hexdigest()
def metadata(s): return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def relpath(v): return isinstance(v,str) and 0<len(v)<=1000 and not v.startswith('/') and not re.search('[\\\\\x00-\x1f\x7f]',v) and all(x not in ['','..','.'] for x in v.split('/'))
def attempt_valid(v): return isinstance(v,str) and re.fullmatch('[a-f0-9]{32}',v) is not None

def root_directory(path,private=False):
    path=Path(path)
    for p in [path,*path.parents]:
        s=p.lstat();need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and s.st_gid==0 and not s.st_mode&0o022,'QA_PG_TRUSTED_DIRECTORY_REQUIRED')
    if private: need(stat.S_IMODE(path.lstat().st_mode)==0o700,'QA_PG_PRIVATE_DIRECTORY_REQUIRED')

def held_directory(path):
    fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        for part in Path(path).parts[1:]:
            expected=os.stat(part,dir_fd=fd,follow_symlinks=False)
            need(stat.S_ISDIR(expected.st_mode) and expected.st_uid==0 and expected.st_gid==0 and not expected.st_mode&0o022,'QA_PG_HELD_PARENT_UNTRUSTED')
            nxt=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
            need(metadata(expected)==metadata(os.fstat(nxt)),'QA_PG_HELD_PARENT_CHANGED');os.close(fd);fd=nxt
        return fd
    except BaseException: os.close(fd);raise

def read_private(path,limit=16*1024*1024,deadline=None):
    parent=held_directory(Path(path).parent)
    try:
        expected=os.stat(Path(path).name,dir_fd=parent,follow_symlinks=False)
        fd=os.open(Path(path).name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
        try:
            s=os.fstat(fd);need(metadata(s)==metadata(expected) and stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_gid==0 and s.st_nlink==1 and not s.st_mode&0o022 and s.st_size<=limit,'QA_PG_PRIVATE_FILE_UNTRUSTED')
            chunks=[];size=0
            while True:
                need(deadline is None or time.monotonic()<deadline,'QA_PG_PRIVATE_READ_TIMEOUT')
                block=os.read(fd,min(65536,limit+1-size))
                if not block: break
                size+=len(block);need(size<=limit,'QA_PG_PRIVATE_FILE_BOUND_EXCEEDED');chunks.append(block)
            need(size==s.st_size and metadata(s)==metadata(os.fstat(fd))==metadata(os.stat(Path(path).name,dir_fd=parent,follow_symlinks=False)),'QA_PG_PRIVATE_FILE_CHANGED');return b''.join(chunks)
        finally:os.close(fd)
    finally:os.close(parent)

def store_bytes(path,raw):
    root_directory(path.parent,True);fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        view=memoryview(raw)
        while view:
            n=os.write(fd,view);need(n>0,'QA_PG_STORE_SHORT_WRITE');view=view[n:]
        os.fsync(fd)
    finally:os.close(fd)
    parent=held_directory(path.parent)
    try:os.fsync(parent)
    finally:os.close(parent)

def store(path,value):store_bytes(path,compact(value)+b'\n')

def replace_state(path,value):
    root_directory(path.parent,True);tmp=path.with_name(path.name+'.tmp-'+os.urandom(8).hex());store(tmp,value);os.replace(tmp,path)
    fd=held_directory(path.parent)
    try:os.fsync(fd)
    finally:os.close(fd)

def validate_cache_manifest(v,root):
    keys={'schemaVersion','kind','root','identity','files','entries','bytes','contentTreeSHA256','metadataSHA256','rootOwnedReadOnly','sharedHardlinks','symlinks'}
    need(isinstance(v,dict) and set(v)==keys and v['schemaVersion']==1 and v['kind']=='r29-independent-readonly-cache-closure' and v['root']==root and v['rootOwnedReadOnly'] is True and v['sharedHardlinks'] is False and v['symlinks'] is False,'QA_PG_CACHE_MANIFEST_INVALID')
    need(re.fullmatch(r'/var/lib/jarvis-development/101/truth-gate-r29-build/[a-f0-9]{32}/caches/(?:corepack-runtime|corepack-cache|pnpm-store)',root) is not None,'QA_PG_CACHE_NAMESPACE_INVALID')
    need(isinstance(v['entries'],list) and 1<=len(v['entries'])<=100000 and isinstance(v['identity'],dict) and set(v['identity'])=={'device','inode'},'QA_PG_CACHE_ENTRIES_INVALID')
    need(all(isinstance(n,int) and not isinstance(n,bool) and n>=0 for n in [*v['identity'].values(),v['files'],v['bytes']]),'QA_PG_CACHE_TOTALS_INVALID')
    paths={};files=0;total=0;content=[]
    for e in v['entries']:
        need(isinstance(e,dict) and e.get('kind') in ['file','directory'],'QA_PG_CACHE_TYPE_INVALID');kind=e['kind'];need(set(e)==({'path','kind','metadata','sha256','bytes'} if kind=='file' else {'path','kind','metadata'}),'QA_PG_CACHE_ENTRY_FIELDS_INVALID')
        p=e['path'];need((p=='.' or relpath(p)) and p not in paths,'QA_PG_CACHE_PATH_INVALID');paths[p]=e
        m=e['metadata'];need(isinstance(m,list) and len(m)==9 and all(isinstance(n,int) and not isinstance(n,bool) and n>=0 for n in m),'QA_PG_CACHE_METADATA_INVALID')
        need(m[2]==m[3]==0 and stat.S_IMODE(m[4]) in ([0o444,0o555] if kind=='file' else [0o555]) and (stat.S_ISREG(m[4]) if kind=='file' else stat.S_ISDIR(m[4])),'QA_PG_CACHE_OWNER_OR_MODE_INVALID')
        row={'path':p,'kind':kind}
        if kind=='file':
            need(m[5]==1 and isinstance(e['bytes'],int) and not isinstance(e['bytes'],bool) and e['bytes']==m[6] and 0<=e['bytes']<=128*1024*1024 and isinstance(e['sha256'],str) and H.fullmatch(e['sha256']),'QA_PG_CACHE_FILE_INVALID');files+=1;total+=e['bytes'];row.update(sha256=e['sha256'],bytes=e['bytes'],executable=bool(m[4]&0o111))
        content.append(row)
    need(paths.get('.',{}).get('kind')=='directory' and v['entries'][0]['path']=='.' and paths['.']['metadata'][:2]==[v['identity']['device'],v['identity']['inode']],'QA_PG_CACHE_ROOT_IDENTITY_INVALID')
    for p in paths:
        if p=='.':continue
        parent=str(Path(p).parent).replace('\\','/');need(paths.get(parent,{}).get('kind')=='directory','QA_PG_CACHE_PARENT_MISSING')
    need(files==v['files'] and total==v['bytes'] and total<=1024*1024*1024 and sha(compact(content))==v['contentTreeSHA256'] and sha(compact(v['entries']))==v['metadataSHA256'],'QA_PG_CACHE_TREE_HASH_INVALID')
    return v

def cache_closure(path):
    fd=held_directory(path);entries=[];total=0;files=0;deadline=time.monotonic()+120
    def visit(current,prefix='',depth=0):
        nonlocal total,files
        before=os.fstat(current);need(depth<=32 and len(entries)<100000 and time.monotonic()<deadline,'QA_PG_CACHE_READ_BOUND_EXCEEDED');need(stat.S_ISDIR(before.st_mode) and before.st_uid==before.st_gid==0 and stat.S_IMODE(before.st_mode)==0o555,'QA_PG_CACHE_DIRECTORY_CHANGED');entries.append({'path':prefix.rstrip('/') or '.','kind':'directory','metadata':metadata(before)});names=sorted(os.listdir(current))
        for name in names:
            p=prefix+name;need(relpath(p),'QA_PG_CACHE_PATH_INVALID');s=os.stat(name,dir_fd=current,follow_symlinks=False)
            child=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|(os.O_DIRECTORY if stat.S_ISDIR(s.st_mode) else 0),dir_fd=current)
            try:
                need(metadata(s)==metadata(os.fstat(child)),'QA_PG_CACHE_PREOPEN_CHANGED')
                if stat.S_ISDIR(s.st_mode):visit(child,p+'/',depth+1)
                else:
                    need(stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode) in [0o444,0o555] and s.st_size<=128*1024*1024,'QA_PG_CACHE_FILE_CHANGED');digest=hashlib.sha256();size=0
                    while True:
                        need(time.monotonic()<deadline,'QA_PG_CACHE_READ_TIMEOUT');block=os.read(child,65536)
                        if not block:break
                        size+=len(block);need(size<=s.st_size,'QA_PG_CACHE_FILE_CHANGED');digest.update(block)
                    need(size==s.st_size and metadata(s)==metadata(os.fstat(child))==metadata(os.stat(name,dir_fd=current,follow_symlinks=False)),'QA_PG_CACHE_FILE_CHANGED');files+=1;total+=size;need(total<=1024*1024*1024 and len(entries)<100000,'QA_PG_CACHE_READ_BOUND_EXCEEDED');entries.append({'path':p,'kind':'file','sha256':digest.hexdigest(),'bytes':size,'metadata':metadata(s)})
            finally:os.close(child)
        need(names==sorted(os.listdir(current)) and metadata(before)==metadata(os.fstat(current)),'QA_PG_CACHE_DIRECTORY_CHANGED')
    try:
        s=os.fstat(fd);visit(fd);content=[{'path':e['path'],'kind':e['kind'],**({'sha256':e['sha256'],'bytes':e['bytes'],'executable':bool(e['metadata'][4]&0o111)} if e['kind']=='file' else {})} for e in entries]
        return {'schemaVersion':1,'kind':'r29-independent-readonly-cache-closure','root':path,'identity':{'device':s.st_dev,'inode':s.st_ino},'files':files,'entries':entries,'bytes':total,'contentTreeSHA256':sha(compact(content)),'metadataSHA256':sha(compact(entries)),'rootOwnedReadOnly':True,'sharedHardlinks':False,'symlinks':False}
    finally:os.close(fd)

def cache_bindings(contract):
    need(set(contract)=={'schemaVersion','kind','producerAttempt','caches'} and contract['schemaVersion']==1 and contract['kind']=='r29-pg-root-cache-reuse' and attempt_valid(contract['producerAttempt']),'QA_PG_CACHE_CONTRACT_INVALID')
    need(isinstance(contract['caches'],list) and [v.get('name') for v in contract['caches']]==list(CACHE_NAMES),'QA_PG_CACHE_SET_INVALID')
    for c in contract['caches']:
        need(set(c)=={'name','root','manifestPath','manifestSHA256'},'QA_PG_CACHE_BINDING_FIELDS_INVALID')
        base=Path('/var/lib/jarvis-development/101/truth-gate-r29-build')/contract['producerAttempt']
        need(c['root']==str(base/'caches'/c['name']) and c['manifestPath']==str(base/'cache-manifests'/(c['name']+'.json')) and H.fullmatch(c['manifestSHA256'] or ''),'QA_PG_CACHE_BINDING_INVALID')
    return contract['caches']

def verify_cache_reuse(contract):
    caches=cache_bindings(contract)
    for c in caches:
        raw=read_private(Path(c['manifestPath']));need(sha(raw)==c['manifestSHA256'],'QA_PG_CACHE_MANIFEST_CHANGED');v=validate_cache_manifest(json.loads(raw),c['root'])
        need(cache_closure(c['root'])==v==cache_closure(c['root']),'QA_PG_CACHE_REUSE_CHANGED')
    return caches

def cleanup_cache_bindings(private,intent,deadline):
    # Read only the pinned root-owned manifests, not 476MB of cache bytes in
    # ExecStopPost. Real cache integrity is observed separately after cleanup.
    need(isinstance(CACHE_CONTRACT_PIN,str) and H.fullmatch(CACHE_CONTRACT_PIN) and intent.get('cacheContractSHA256')==CACHE_CONTRACT_PIN,'QA_PG_CLEANUP_CACHE_PIN_INVALID')
    raw=read_private(private/'cache-contract.json',deadline=deadline);need(sha(raw)==CACHE_CONTRACT_PIN,'QA_PG_CLEANUP_CACHE_CONTRACT_CHANGED');caches=cache_bindings(json.loads(raw))
    for c in caches:
        manifest=read_private(Path(c['manifestPath']),deadline=deadline);need(sha(manifest)==c['manifestSHA256'],'QA_PG_CLEANUP_CACHE_MANIFEST_CHANGED');validate_cache_manifest(json.loads(manifest),c['root'])
    return caches

def preparation_ready(): return all(isinstance(x,str) and H.fullmatch(x) for x in [REVIEW_PIN,CACHE_CONTRACT_PIN,PROTECTION_PIN,FREEZER_PIN])
def inspect_preparation(): return {'kind':'r29-independent-pg-build-preparation','ready':preparation_ready(),'imageID':IMAGE,'pgVersion':'8.23.0','containerUID':'1000:1000','network':'none','hostSocketMounted':False,'cacheCopiedAgain':False,'runtimeFrozen':False,'actualManifestPin':None,'productAccepted':False,'modelsInvoked':False}

def docker(args,timeout=20):return subprocess.run(['/usr/bin/docker',*args],capture_output=True,timeout=timeout,env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'})
def labels(attempt):return {'jarvis.qa.pg.r29.attempt':attempt,'jarvis.qa.pg.r29.kind':'independent-runtime'}
def container_name(attempt):need(attempt_valid(attempt),'QA_PG_ATTEMPT_INVALID');return 'jarvis-qa-pg-r29-'+attempt+'-install'

def create_command(attempt,work,caches):
    need(attempt_valid(attempt) and str(work)==str(ROOT/attempt/'work') and [x['name'] for x in caches]==list(CACHE_NAMES),'QA_PG_CONTAINER_SCOPE_INVALID')
    command=['create','--pull=never','--init','--name',container_name(attempt),'--network','none','--user','1000:1000','--security-opt','no-new-privileges','--cap-drop','ALL','--read-only','--memory','1g','--cpus','1','--pids-limit','128','--tmpfs','/tmp:rw,nosuid,nodev,size=128m','--env','CI=1','--env','HOME=/work/home','--env','COREPACK_HOME=/corepack-cache','--env','COREPACK_ENABLE_NETWORK=0','--env','NODE_PATH=','--env','NODE_OPTIONS=','--env','PG_FORCE_NATIVE=','--workdir','/work/runtime','--mount','type=bind,src='+str(work)+',dst=/work']
    for c in caches:command+=['--mount','type=bind,src='+c['root']+',dst=/'+c['name']+',readonly']
    for k,v in labels(attempt).items():command+=['--label',k+'='+v]
    return command+['--entrypoint',INSTALL[0],IMAGE,*INSTALL[1:]]

def assert_container(v,attempt,work,caches):
    need(isinstance(v,dict) and v.get('Image')==IMAGE and v.get('Name')=='/'+container_name(attempt),'QA_PG_CONTAINER_IDENTITY_CHANGED')
    config=v.get('Config',{});host=v.get('HostConfig',{})
    need(config.get('User')=='1000:1000' and config.get('Entrypoint')==[INSTALL[0]] and config.get('Cmd')==INSTALL[1:] and config.get('WorkingDir')=='/work/runtime' and not config.get('Volumes') and not config.get('Healthcheck') and all(config.get('Labels',{}).get(k)==x for k,x in labels(attempt).items()),'QA_PG_CONTAINER_CONFIG_CHANGED')
    env=config.get('Env');need(isinstance(env,list) and all(isinstance(x,str) for x in env),'QA_PG_CONTAINER_ENV_CHANGED')
    for name,value in {'CI':'1','HOME':'/work/home','COREPACK_HOME':'/corepack-cache','COREPACK_ENABLE_NETWORK':'0','NODE_PATH':'','NODE_OPTIONS':'','PG_FORCE_NATIVE':''}.items():
        need([x for x in env if x.startswith(name+'=')]==[name+'='+value],'QA_PG_CONTAINER_ENV_CHANGED')
    need(not any(x.split('=',1)[0] in ['LD_PRELOAD','LD_LIBRARY_PATH','BASH_ENV','ENV'] for x in env),'QA_PG_CONTAINER_ENV_CHANGED')
    need(host.get('NetworkMode')=='none' and host.get('ReadonlyRootfs') is True and host.get('Privileged') is False and host.get('CapDrop')==['ALL'] and host.get('CapAdd') in [None,[]] and host.get('SecurityOpt')==['no-new-privileges'] and host.get('PidsLimit')==128 and host.get('Memory')==1024**3 and host.get('NanoCpus')==10**9 and host.get('Init') is True,'QA_PG_CONTAINER_ISOLATION_CHANGED')
    need(not host.get('PortBindings') and not host.get('Devices') and not host.get('DeviceRequests') and host.get('Tmpfs')=={'/tmp':'rw,nosuid,nodev,size=128m'},'QA_PG_CONTAINER_EXTRA_CAPABILITY')
    expected=[(str(work),'/work',True)]+[(x['root'],'/'+x['name'],False) for x in caches]
    mounts=v.get('Mounts');need(isinstance(mounts,list) and len(mounts)==4,'QA_PG_CONTAINER_MOUNTS_CHANGED')
    for source,destination,writable in expected:
        matches=[m for m in mounts if m.get('Destination')==destination]
        need(len(matches)==1 and matches[0].get('Source')==source and matches[0].get('Type')=='bind' and matches[0].get('RW') is writable,'QA_PG_CONTAINER_MOUNTS_CHANGED')
    return v

def assert_protection_fresh():
    need(isinstance(PROTECTION_PIN,str) and H.fullmatch(PROTECTION_PIN),'QA_PG_PROTECTION_NOT_PINNED');raw=read_private(TOOLS/'r29-qa-pg-protection-proof.json');need(sha(raw)==PROTECTION_PIN,'QA_PG_BOUND_PREPARATION_CHANGED');protection=json.loads(raw)
    need(protection.get('kind')=='r29-pg-build-new-protection-contract' and all(protection.get(k) is True for k in ['independent','protectedInventoryFullyVerified','fullQueueVerified','templatesVerified']) and protection.get('candidateFingerprint')=='4907e45a21799f2dd14ac2373769607f40d6b9e0319bb614fbe259b157e60493' and protection.get('candidateFiles')==621 and protection.get('productAccepted') is False,'QA_PG_PROTECTION_UNPROVEN')
    observed=protection.get('at');need(isinstance(observed,str),'QA_PG_PROTECTION_TIME_INVALID');age=time.time()-calendar.timegm(time.strptime(observed,'%Y-%m-%dT%H:%M:%SZ'));need(-30<=age<300,'QA_PG_PROTECTION_STALE')
    return protection

def preflight():
    need(os.geteuid()==0 and preparation_ready(),'QA_PG_PREPARATION_NOT_PINNED')
    checks=[('r29-qa-pg-build-review.json',REVIEW_PIN),('r29-qa-pg-cache-contract.json',CACHE_CONTRACT_PIN),('factory-freeze-independent-pg-runtime-r29.py',FREEZER_PIN)]
    values={}
    for name,pin in checks:
        raw=read_private(TOOLS/name);need(sha(raw)==pin,'QA_PG_BOUND_PREPARATION_CHANGED');values[name]=raw
    assert_protection_fresh()
    caches=verify_cache_reuse(json.loads(values['r29-qa-pg-cache-contract.json']))
    assert_protection_fresh()
    return caches,values['factory-freeze-independent-pg-runtime-r29.py']

def container(attempt,timeout=20):
    name=container_name(attempt);r=docker(['container','inspect',name],timeout=timeout)
    if r.returncode:
        try:empty=json.loads(r.stdout)==[]
        except (ValueError,UnicodeError):empty=False
        text=r.stderr.decode('utf-8','replace').strip()
        need(r.returncode==1 and empty and text in ['Error response from daemon: No such container: '+name,'Error: No such container: '+name,'Error: No such object: '+name],'QA_PG_CONTAINER_READ_FAILED');return None
    rows=json.loads(r.stdout);need(isinstance(rows,list) and len(rows)==1,'QA_PG_CONTAINER_READ_INVALID');return rows[0]

def empty_labels(attempt,deadline=None):
    for filters in [['label=jarvis.qa.pg.r29.attempt='+attempt],['label=jarvis.qa.pg.r29.attempt='+attempt,'label=jarvis.qa.pg.r29.kind=independent-runtime']]:
        for command in [['ps','-aq'],['network','ls','-q'],['volume','ls','-q']]:
            args=list(command)
            for f in filters:args+=['--filter',f]
            left=20 if deadline is None else min(10,deadline-time.monotonic());need(left>0,'QA_PG_CLEANUP_DEADLINE_EXCEEDED');r=docker(args,timeout=left);need(r.returncode==0 and not r.stdout.strip(),'QA_PG_RESOURCE_SCOPE_NOT_EMPTY')

def self_source():
    raw=read_private(Path(__file__));return sha(raw)

def owner(attempt):
    unit='jarvis-qa-pg-r29-'+attempt+'-owner.service';need(os.environ.get('JARVIS_R29_PG_OWNER_UNIT')==unit,'QA_PG_OWNER_REQUIRED')
    r=subprocess.run(['/usr/bin/systemctl','show',unit,'--property=ActiveState,MainPID,ControlGroup,RuntimeMaxUSec,TimeoutStopUSec,KillMode,ExecStopPost,Restart'],capture_output=True,text=True,timeout=10,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'})
    need(r.returncode==0,'QA_PG_OWNER_READ_FAILED');v=dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x)
    need(v.get('ActiveState')=='active' and v.get('MainPID')==str(os.getpid()) and v.get('ControlGroup')=='/system.slice/'+unit and v.get('RuntimeMaxUSec')=='15min' and v.get('TimeoutStopUSec')=='2min' and v.get('KillMode')=='control-group' and v.get('Restart')=='no','QA_PG_OWNER_CONTRACT_CHANGED')
    post=re.fullmatch(r'\{\s*path=([^;{}]+?)\s*;\s*argv\[\]=(.*?)\s*;\s*ignore_errors=(yes|no)\s*;[^{}]*\}',v.get('ExecStopPost',''))
    need(post is not None and post.group(1)=='/usr/bin/python3' and post.group(2).split()==['/usr/bin/python3',str(Path(__file__)),'--reconcile-cleanup',attempt] and post.group(3)=='no','QA_PG_OWNER_STOPPOST_CHANGED')
    return {'unit':unit,'pid':os.getpid(),'startTicks':Path('/proc/self/stat').read_text().rsplit(')',1)[1].split()[19],'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'controlGroup':v['ControlGroup'],'runtimeMaxSec':900,'stopTimeoutSec':120,'restart':'no','killMode':'control-group'}

def install_stream(cid,path):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);selector=selectors.DefaultSelector();proc=None;count=0;digest=hashlib.sha256();deadline=time.monotonic()+180;bounded=False
    try:
        proc=subprocess.Popen(['/usr/bin/docker','start','-a',cid],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'});selector.register(proc.stdout,selectors.EVENT_READ)
        while selector.get_map():
            if time.monotonic()>=deadline:bounded=True;break
            for key,_ in selector.select(min(1,max(0,deadline-time.monotonic()))):
                block=os.read(key.fd,65536)
                if not block:selector.unregister(key.fileobj);continue
                if count+len(block)>4*1024*1024:bounded=True;break
                count+=len(block);digest.update(block);view=memoryview(block)
                while view:
                    n=os.write(fd,view);need(n>0,'QA_PG_LOG_SHORT_WRITE');view=view[n:]
            if bounded:break
        if bounded and proc.poll() is None:proc.terminate()
        try:proc.wait(timeout=10 if bounded else max(1,deadline-time.monotonic()))
        except subprocess.TimeoutExpired:bounded=True;proc.kill();proc.wait(timeout=10)
        os.fsync(fd);return {'cliExitCode':proc.returncode,'boundedStop':bounded,'privateLogBytes':count,'privateLogSHA256':digest.hexdigest(),'rawLogsExported':False}
    finally:
        selector.close()
        if proc is not None:
            if proc.poll() is None:
                proc.terminate()
                try:proc.wait(timeout=10)
                except subprocess.TimeoutExpired:proc.kill();proc.wait(timeout=10)
            if proc.stdout is not None:proc.stdout.close()
        os.close(fd)

def assert_image(rows):
    need(isinstance(rows,list) and len(rows)==1 and isinstance(rows[0],dict),'QA_PG_IMAGE_CHANGED')
    v=rows[0];config=v.get('Config')
    need(v.get('Id')==IMAGE and v.get('Os')=='linux' and v.get('Architecture')=='amd64' and isinstance(config,dict) and 'Volumes' in config and (config['Volumes'] is None or isinstance(config['Volumes'],dict) and not config['Volumes']),'QA_PG_IMAGE_CHANGED')
    return v

def creation_intent(attempt,caches):
    return {'schemaVersion':1,'kind':'r29-pg-container-create-intent','attempt':attempt,'containerName':container_name(attempt),'workerSHA256':self_source(),'imageID':IMAGE,'cacheContractSHA256':CACHE_CONTRACT_PIN,'caches':caches,'emptyResourceScopeVerified':True,'createdAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}

def qualify_cleanup_container(value,attempt,created,state,caches):
    expected={'schemaVersion','kind','attempt','containerName','workerSHA256','imageID','cacheContractSHA256','caches','emptyResourceScopeVerified','createdAt'}
    need(isinstance(created,dict) and set(created)==expected and created['schemaVersion']==1 and created['kind']=='r29-pg-container-create-intent' and created['attempt']==attempt and created['containerName']==container_name(attempt) and created['workerSHA256']==self_source() and created['imageID']==IMAGE and created['cacheContractSHA256']==CACHE_CONTRACT_PIN and created['caches']==caches and created['emptyResourceScopeVerified'] is True,'QA_PG_CLEANUP_CREATION_INTENT_CHANGED')
    v=assert_container(value,attempt,ROOT/attempt/'work',caches);cid=v.get('Id');need(isinstance(cid,str) and H.fullmatch(cid),'QA_PG_CLEANUP_CONTAINER_ID_INVALID')
    if state is not None:
        need(isinstance(state,dict) and state.get('attempt')==attempt and state.get('workerSHA256')==self_source() and state.get('imageID')==IMAGE,'QA_PG_CLEANUP_STATE_CHANGED')
        recorded=state.get('containerID')
        if recorded is not None:need(isinstance(recorded,str) and H.fullmatch(recorded) and recorded==cid,'QA_PG_CLEANUP_RESOURCE_ID_CHANGED')
    return cid

def closed_error(e):return str(e) if re.fullmatch('QA_PG_[A-Z0-9_]+',str(e)) else 'QA_PG_OPERATION_FAILED'

def finish_install(attempt,state,result):
    errors=[]
    try:replace_state(state,result)
    except BaseException:errors.append('QA_PG_STATE_PERSISTENCE_FAILED')
    finally:
        try:
            cleanup=reconcile_cleanup(attempt);result['cleanupClaimsComplete']=cleanup.get('exactOwnedContainerAbsent') is True and cleanup.get('labelsEmpty') is True
        except BaseException as e:errors.append(closed_error(e));result['cleanupClaimsComplete']=False
    if errors:result['status']='failed';result['finalizationErrors']=errors
    if 'QA_PG_STATE_PERSISTENCE_FAILED' in errors:result['statePersistenceFailed']=True
    try:replace_state(state,result)
    except BaseException:
        result['status']='failed';result['statePersistenceFailed']=True
        if 'QA_PG_STATE_PERSISTENCE_FAILED' not in errors:errors.append('QA_PG_STATE_PERSISTENCE_FAILED')
        result['finalizationErrors']=errors
    if 'QA_PG_STATE_PERSISTENCE_FAILED' in errors:result['statePersistenceFailed']=True
    return result

def run_install(attempt,caches):
    owned=owner(attempt);private=ROOT/attempt;root_directory(private,True);intent=json.loads(read_private(private/'once.json'))
    need(intent.get('attempt')==attempt and intent.get('workerSHA256')==self_source() and intent.get('imageID')==IMAGE,'QA_PG_ONCE_INTENT_CHANGED')
    need(not os.path.lexists(private/'state.json'),'QA_PG_DUPLICATE_RUN_USE_READ_ONLY_CHECK')
    need(container(attempt) is None,'QA_PG_RESOURCE_ALREADY_EXISTS');empty_labels(attempt)
    image=docker(['image','inspect',IMAGE]);need(image.returncode==0,'QA_PG_IMAGE_READ_FAILED');assert_image(json.loads(image.stdout))
    work=private/'work';work.mkdir(mode=0o700);runtime=work/'runtime';runtime.mkdir(mode=0o700);home=work/'home';home.mkdir(mode=0o700)
    for name,pin in [('package.json',PACKAGE_SHA),('pnpm-lock.yaml',LOCK_SHA)]:
        raw=read_private(TOOLS/'r29-qa-pg-inputs'/name);need(sha(raw)==pin,'QA_PG_INSTALL_INPUT_CHANGED');fd=os.open(runtime/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        try:
            view=memoryview(raw)
            while view:
                n=os.write(fd,view);need(n>0,'QA_PG_INPUT_SHORT_WRITE');view=view[n:]
            os.fchown(fd,1000,1000);os.fsync(fd)
        finally:os.close(fd)
    for p in [runtime,home,work]:os.chown(p,1000,1000,follow_symlinks=False)
    result={'schemaVersion':1,'kind':'r29-independent-pg-install','attempt':attempt,'workerSHA256':self_source(),'owner':owned,'imageID':IMAGE,'status':'running','containerID':None,'cacheContractSHA256':CACHE_CONTRACT_PIN,'sourceUID':1000,'productSourceMounted':False,'productCodeExecuted':False,'actualPGPackageLoaded':False,'packagesExecutedByRoot':False,'runtimeFrozen':False,'modelsInvoked':False,'cleanupIndependentlyVerified':False}
    state=private/'state.json';store(state,result)
    try:
        cache_raw=read_private(TOOLS/'r29-qa-pg-cache-contract.json');need(sha(cache_raw)==CACHE_CONTRACT_PIN and cache_bindings(json.loads(cache_raw))==caches,'QA_PG_CACHE_CONTRACT_CHANGED');store_bytes(private/'cache-contract.json',cache_raw)
        # The separately durable intent covers create-committed/receipt-lost
        # windows. No container operation precedes its file+directory fsync.
        assert_protection_fresh();store(private/'creation-intent.json',creation_intent(attempt,caches));assert_protection_fresh()
        r=docker(create_command(attempt,work,caches));need(r.returncode==0,'QA_PG_CONTAINER_CREATE_FAILED');v=assert_container(container(attempt),attempt,work,caches);cid=v.get('Id');need(isinstance(cid,str) and H.fullmatch(cid) and r.stdout.decode().strip()==cid,'QA_PG_CREATED_ID_CHANGED');result['containerID']=cid;replace_state(state,result)
        assert_protection_fresh()
        streamed=install_stream(cid,private/'install.log');v=assert_container(container(attempt),attempt,work,caches)
        need(v['Id']==cid,'QA_PG_CONTAINER_ID_CHANGED');s=v.get('State',{});result.update(streamed);result['containerStarted']=isinstance(s.get('StartedAt'),str) and s['StartedAt']!='0001-01-01T00:00:00Z';result['containerExitCode']=s.get('ExitCode');result['containerStopped']=s.get('Running') is False
        result['status']='installed' if result['containerStarted'] and result['containerStopped'] and s.get('ExitCode')==0 and streamed['cliExitCode']==0 and streamed['boundedStop'] is False else 'failed'
    except BaseException as e:result['status']='failed';result['errorCode']=str(e) if re.fullmatch('QA_PG_[A-Z0-9_]+',str(e)) else 'QA_PG_INSTALL_OPERATION_FAILED'
    finally:
        finish_install(attempt,state,result)
    return result

def reconcile_cleanup(attempt):
    need(os.geteuid()==0 and attempt_valid(attempt),'QA_PG_CLEANUP_ARGUMENTS_INVALID');deadline=time.monotonic()+90;private=ROOT/attempt;root_directory(private,True)
    intent=json.loads(read_private(private/'once.json',deadline=deadline));need(intent.get('workerSHA256')==self_source() and intent.get('attempt')==attempt and intent.get('imageID')==IMAGE,'QA_PG_CLEANUP_INTENT_CHANGED')
    state_path=private/'state.json';s=json.loads(read_private(state_path,deadline=deadline)) if os.path.lexists(state_path) else None;v=container(attempt,timeout=min(15,max(0.1,deadline-time.monotonic())))
    if v is not None:
        created=json.loads(read_private(private/'creation-intent.json',deadline=deadline));caches=cleanup_cache_bindings(private,created,deadline);cid=qualify_cleanup_container(v,attempt,created,s,caches)
        left=deadline-time.monotonic();need(left>0,'QA_PG_CLEANUP_DEADLINE_EXCEEDED');need(docker(['rm','-f',cid],timeout=min(15,left)).returncode==0,'QA_PG_CLEANUP_REMOVE_FAILED')
    left=deadline-time.monotonic();need(left>0,'QA_PG_CLEANUP_DEADLINE_EXCEEDED');need(container(attempt,timeout=min(15,left)) is None,'QA_PG_CLEANUP_CONTAINER_PRESENT');empty_labels(attempt,deadline=deadline)
    return {'attempt':attempt,'exactOwnedContainerAbsent':True,'labelsEmpty':True,'cleanupIndependentlyVerified':False,'productAccepted':False}

def launch(attempt,caches):
    assert_protection_fresh();root_directory(ROOT,True);private=ROOT/attempt;root_directory(private,True);need(set(os.listdir(private))=={'control'},'QA_PG_DUPLICATE_ATTEMPT_USE_CHECK');need(container(attempt) is None,'QA_PG_RESOURCE_ALREADY_EXISTS');empty_labels(attempt);assert_protection_fresh()
    store(private/'once.json',{'schemaVersion':1,'kind':'r29-independent-pg-once-intent','attempt':attempt,'imageID':IMAGE,'workerSHA256':self_source(),'reviewSHA256':REVIEW_PIN,'cacheContractSHA256':CACHE_CONTRACT_PIN,'protectionSHA256':PROTECTION_PIN,'createdAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'automaticRetry':False})
    unit='jarvis-qa-pg-r29-'+attempt+'-owner.service'
    argv=['/usr/bin/systemd-run','--unit='+unit,'--collect','--no-block','--property=User=root','--property=Type=simple','--property=KillMode=control-group','--property=RuntimeMaxSec=900','--property=TimeoutStopSec=120','--property=Restart=no','--property=WorkingDirectory=/','--property=Environment=JARVIS_R29_PG_OWNER_UNIT='+unit,'--property=ExecStopPost=/usr/bin/python3 '+str(Path(__file__))+' --reconcile-cleanup '+attempt,'/usr/bin/python3',str(Path(__file__)),'--run',attempt]
    assert_protection_fresh();r=subprocess.run(argv,capture_output=True,timeout=20,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'});need(r.returncode==0,'QA_PG_LAUNCH_AMBIGUOUS_USE_CHECK');return {'attempt':attempt,'dispatched':True,'ownerUnit':unit,'automaticRetry':False,'runtimeReady':False,'productAccepted':False}

def freezer_module(body):
    module=ModuleType('trusted_r29_pg_byte_freezer');exec(compile(body,str(TOOLS/'factory-freeze-independent-pg-runtime-r29.py'),'exec'),module.__dict__);return module

def check_package_metadata(entries,root):
    selected={}
    for entry in entries:
        m=re.fullmatch(r'node_modules/\.pnpm/[^/]+/node_modules/([a-z0-9-]+)/package\.json',entry['path'])
        if m is None:continue
        name=m.group(1);need(entry['type']=='file' and name in PACKAGES and name not in selected,'QA_PG_PACKAGE_CLOSURE_CHANGED')
        raw=read_private(root/entry['path']);need(sha(raw)==entry['sha256'],'QA_PG_PACKAGE_METADATA_CHANGED');v=json.loads(raw)
        need(v.get('name')==name and v.get('version')==PACKAGES[name],'QA_PG_PACKAGE_VERSION_CHANGED');selected[name]=entry['path']
    need(set(selected)==set(PACKAGES),'QA_PG_PACKAGE_CLOSURE_INCOMPLETE')
    return selected

def freeze(attempt,body):
    need(isinstance(CLEANUP_PIN,str) and H.fullmatch(CLEANUP_PIN),'QA_PG_INSTALL_CLEANUP_NOT_PINNED');private=ROOT/attempt;root_directory(private,True);proof_raw=read_private(private/'independent-cleanup.json');need(sha(proof_raw)==CLEANUP_PIN,'QA_PG_CLEANUP_PROOF_CHANGED');h=freezer_module(body);proof=json.loads(proof_raw);check_actual_cleanup(proof,attempt,h)
    assert_cleanup_time(proof)
    state=json.loads(read_private(private/'state.json'));need(state.get('attempt')==attempt and state.get('status')=='installed' and state.get('workerSHA256')==self_source() and state.get('containerStopped') is True and state.get('containerExitCode')==0 and state.get('cleanupClaimsComplete') is True,'QA_PG_INSTALL_NOT_COMPLETE');need(container(attempt) is None,'QA_PG_INSTALLER_STILL_PRESENT');empty_labels(attempt)
    parent=held_directory(private);source=None;target=None
    try:
        work=os.open('work',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
        try:source=os.open('runtime',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=work)
        finally:os.close(work)
        before=h.tree(source);os.mkdir('runtime',0o700,dir_fd=parent);target=os.open('runtime',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
        copied=h.tree(source,copy_fd=target);need(before==copied==h.tree(source),'QA_PG_INSTALL_OUTPUT_CHANGED_DURING_FREEZE');os.fchmod(target,0o555);os.fsync(target)
        actual=h.tree(target,frozen=True);need(actual['entries']==before['entries'],'QA_PG_FROZEN_CONTENT_CHANGED')
        for e in actual['entries']:
            if e['type']=='symlink':
                real=(private/'runtime'/e['path']).resolve(strict=True);need(real.is_relative_to(private/'runtime'),'QA_PG_FROZEN_LINK_ESCAPE')
        package_paths=check_package_metadata(actual['entries'],private/'runtime');frozen_manifest=h.manifest(actual);metadata={'schemaVersion':1,'kind':'r29-independent-pg-runtime-frozen-metadata','attempt':attempt,'imageID':IMAGE,'workerSHA256':self_source(),'inputStateSHA256':sha(read_private(private/'state.json')),'cleanupProofSHA256':CLEANUP_PIN,'root':str(private/'runtime'),'rootIdentity':actual['rootIdentity'],'metadata':actual['metadata'],'metadataSHA256':h.sha(h.raw_json(actual['metadata'])),'packageJavaScriptExecutedByRoot':False,'packageMetadataClosureVerified':True,'packagePaths':package_paths,'runtimeCJSClosureVerified':False,'productAccepted':False}
        store(private/'runtime-manifest.json',frozen_manifest);store(private/'runtime-metadata.json',metadata)
        need(actual==h.tree(target,frozen=True),'QA_PG_FROZEN_READBACK_CHANGED');return {'attempt':attempt,'frozenBytesDoubleRead':True,'manifestSHA256':sha(read_private(private/'runtime-manifest.json')),'metadataSHA256':sha(read_private(private/'runtime-metadata.json')),'logicalRoot':'/qa-runtime','actualR3ManifestPinSet':False,'packageMetadataClosureVerified':True,'runtimeCJSClosureVerified':False,'runtimeReady':False,'productAccepted':False}
    finally:
        for fd in [source,target,parent]:
            if fd is not None:os.close(fd)

def readback(attempt,body):
    private=ROOT/attempt;root_directory(private,True);h=freezer_module(body);manifest=json.loads(read_private(private/'runtime-manifest.json'));meta=json.loads(read_private(private/'runtime-metadata.json'));fd=held_directory(private/'runtime')
    try:
        before=h.tree(fd,frozen=True);need(h.manifest(before)==manifest and before['rootIdentity']==meta['rootIdentity'] and before['metadata']==meta['metadata'] and check_package_metadata(before['entries'],private/'runtime')==meta['packagePaths'],'QA_PG_FROZEN_READBACK_CHANGED');need(before==h.tree(fd,frozen=True),'QA_PG_FROZEN_READBACK_CHANGED');return {'attempt':attempt,'frozenBytesDoubleRead':True,'manifestSHA256':sha(read_private(private/'runtime-manifest.json')),'metadataSHA256':sha(read_private(private/'runtime-metadata.json')),'actualR3ManifestPinSet':False,'packageMetadataClosureVerified':True,'runtimeCJSClosureVerified':False,'runtimeReady':False,'productAccepted':False}
    finally:os.close(fd)


# A once-created, root-owned activation grants only this finite revision.
# Review hashes are external to avoid a source/review hash cycle. No product
# paths or commands are accepted from that control document.
BASE_TOOLS=TOOLS
ACTIVATION=None
CANDIDATE={'fingerprint':'4907e45a21799f2dd14ac2373769607f40d6b9e0319bb614fbe259b157e60493','files':621,'metadataSHA256':'2da9d3e490fd6d042113c067807a89b000a4f40fdb5fa8d3ca2911b6615ebce8','identity':{'device':66306,'inode':6718050}}
GOALS_SHA='23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42'
BASIS={'sourceCheck':'f1dab15a255aaea43c3c34cd5d1a82e5855ad2e63fd60fc7017a7b495af8f0cc','sourceCleanup':'324ed10f0efef0aeb29a6c03550c172a86c46072bc4bbeab93c931ffe629f610','cacheReadback':'daeda9233ecd88defc7206c233c0fdbfc23a55b10cde6702bac6381b7622abe0','historicalPreparation':'ee7111341710660005699b190ca0231635d1d206d0a3008c39902dd4f77938e5'}
FIXED_CACHE_PIN='464258e571628970a04363f19ec50a592959f9c3358fd501246de26e302b2b0f'
FIXED_FREEZER_PIN='09dd6ecef0ba1df906c1f938db8fa99cde4b8fccc2fa71bae8b281b9dc8a0dbb'

def qualify_activation(v,attempt,worker_sha):
    fields={'schemaVersion','kind','attempt','workerSHA256','pgVersion','imageID','candidate','originalGoalsSHA256','basisRefs','pins'}
    need(isinstance(v,dict) and set(v)==fields and v['schemaVersion']==1 and v['kind']=='r29-independent-pg-exact-activation' and attempt_valid(attempt) and v['attempt']==attempt and v['workerSHA256']==worker_sha and v['pgVersion']=='8.23.0' and v['imageID']==IMAGE and v['candidate']==CANDIDATE and v['originalGoalsSHA256']==GOALS_SHA,'QA_PG_ACTIVATION_SCOPE_CHANGED')
    refs=v['basisRefs'];need(isinstance(refs,dict) and set(refs)==set(BASIS),'QA_PG_ACTIVATION_BASIS_CHANGED')
    for k,pin in BASIS.items():
        need(isinstance(refs[k],dict) and set(refs[k])=={'path','sha256'} and refs[k]['sha256']==pin and isinstance(refs[k]['path'],str) and re.fullmatch('artifacts/software-factory/goals-r29/[a-zA-Z0-9_.-]+\\.json',refs[k]['path']),'QA_PG_ACTIVATION_BASIS_CHANGED')
    pins=v['pins'];need(isinstance(pins,dict) and set(pins)=={'reviewSHA256','cacheContractSHA256','cacheReadbackSHA256','protectionSHA256','freezerSHA256'} and all(isinstance(x,str) and H.fullmatch(x) for x in pins.values()) and pins['cacheContractSHA256']==FIXED_CACHE_PIN and pins['cacheReadbackSHA256']==BASIS['cacheReadback'] and pins['freezerSHA256']==FIXED_FREEZER_PIN,'QA_PG_ACTIVATION_PINS_CHANGED')
    return v

def load_activation(attempt,phase):
    global TOOLS,ACTIVATION,REVIEW_PIN,CACHE_CONTRACT_PIN,PROTECTION_PIN,FREEZER_PIN,CLEANUP_PIN
    need(os.geteuid()==0,'QA_PG_ROOT_CONTROL_REQUIRED');control=ROOT/attempt/'control';root_directory(ROOT/attempt,True);root_directory(control,True)
    raw=read_private(control/'activation.json');v=qualify_activation(json.loads(raw),attempt,self_source());TOOLS=control;ACTIVATION=v
    REVIEW_PIN=v['pins']['reviewSHA256'];CACHE_CONTRACT_PIN=v['pins']['cacheContractSHA256'];PROTECTION_PIN=v['pins']['protectionSHA256'];FREEZER_PIN=v['pins']['freezerSHA256'];CLEANUP_PIN=None
    review=read_private(control/'r29-qa-pg-build-review.json');need(sha(review)==REVIEW_PIN,'QA_PG_ACTIVATION_REVIEW_CHANGED');r=json.loads(review)
    need(r.get('kind')=='r29-pg-exact-activation-independent-local-review' and r.get('workerSHA256')==v['workerSHA256'] and r.get('remainingP0P1')==0 and r.get('staticPreparationReady') is True and r.get('actualRuntimeReady') is False,'QA_PG_ACTIVATION_REVIEW_UNPROVEN')
    cache=read_private(control/'r29-qa-pg-cache-readback.json');need(sha(cache)==BASIS['cacheReadback'],'QA_PG_ACTIVATION_CACHE_PROOF_CHANGED');c=json.loads(cache)
    need(c.get('ready') is True and c.get('cacheClosureIndependentlyVerified') is True and c.get('twoFullReads') is True and c.get('runtimeReady') is False and c.get('totalBytes')==475914918,'QA_PG_ACTIVATION_CACHE_PROOF_UNPROVEN')
    if phase in ['--freeze','--readback']:
        f=json.loads(read_private(control/'freeze-activation.json'))
        need(set(f)=={'schemaVersion','kind','attempt','activationSHA256','workerSHA256','cleanupProofSHA256','protectionSHA256'} and f['schemaVersion']==1 and f['kind']=='r29-pg-exact-freeze-activation' and f['attempt']==attempt and f['activationSHA256']==sha(raw) and f['workerSHA256']==v['workerSHA256'] and H.fullmatch(f.get('cleanupProofSHA256','')) and H.fullmatch(f.get('protectionSHA256','')),'QA_PG_FREEZE_ACTIVATION_CHANGED')
        CLEANUP_PIN=f['cleanupProofSHA256'];PROTECTION_PIN=f['protectionSHA256']
    return v

def assert_protection_fresh():
    need(isinstance(PROTECTION_PIN,str) and H.fullmatch(PROTECTION_PIN),'QA_PG_PROTECTION_NOT_PINNED')
    name='r29-qa-pg-freeze-protection-proof.json' if CLEANUP_PIN else 'r29-qa-pg-protection-proof.json'
    raw=read_private(TOOLS/name);need(sha(raw)==PROTECTION_PIN,'QA_PG_BOUND_PREPARATION_CHANGED');v=json.loads(raw)
    need(v.get('kind')=='software-factory-r29-new-protection-contract-observation' and v.get('ready') is True and v.get('newContract') is True and v.get('contractId')=='9bf97027-a7f6-4706-b7ad-fcb29c304e41' and v.get('contractRevision')==1 and v.get('newProtectedInventorySHA256')=='4a625c89dff8a15a347d35f7ef630aa20bf45d1e2c72986fe4eb8e6f4ddf8759' and all(v.get(k) is True for k in ['newContractInventoryVerified','protectedInventoryFullyVerified','fullQueueSQLVerified','nodeACKIdle','queueIdle','profileUnchanged']) and v.get('baseTemplateSHA256')=='9c6fd214eb3fb55020089270ff074f9217f99519f098a0ab8c05eab3ac2b5172' and v.get('productAccepted') is False and v.get('remoteMutationsPerformed') is False and v.get('modelsInvoked') is False,'QA_PG_PROTECTION_UNPROVEN')
    expected={'sha256':CANDIDATE['fingerprint'],'files':621,'bytes':18386584,'metadataSHA':CANDIDATE['metadataSHA256'],'stable':True,'identity':CANDIDATE['identity']}
    need(v.get('sources',{}).get('r29')==expected,'QA_PG_PROTECTION_SOURCE_CHANGED')
    import datetime
    try: observed=datetime.datetime.fromisoformat(v['at'].replace('Z','+00:00')).timestamp()
    except (ValueError,TypeError,KeyError): raise RuntimeError('QA_PG_PROTECTION_TIME_INVALID')
    need(-30<=time.time()-observed<300,'QA_PG_PROTECTION_STALE');return v

def check_actual_cleanup(proof,attempt,h):
    need(proof.get('schemaVersion')==1 and proof.get('kind')=='software-factory-r29-independent-pg-cleanup' and proof.get('attempt')==attempt and proof.get('imageID')==IMAGE and proof.get('workerSHA256')==self_source() and proof.get('activationSHA256')==sha(read_private(TOOLS/'activation.json')) and all(proof.get(k) is True for k in ['ready','cleanupIndependentlyVerified','independent','processesComplete','dockerComplete','ownerComplete','relatedWritersAbsent','fullQueueSQLVerified','nodeACKIdle','protectedInventoryFullyVerified']) and all(proof.get(k) is False for k in ['productCodeExecuted','pgRuntimeAccepted','runtimeFrozen']),'QA_PG_ACTUAL_CLEANUP_UNPROVEN')
    detached=dict(proof);detached['kind']='r29-pg-runtime-install-independent-cleanup';h.check_cleanup(detached,attempt)

def assert_cleanup_time(proof):
    import datetime
    at=proof.get('at')
    try: observed=datetime.datetime.fromisoformat(at.replace('Z','+00:00')).timestamp() if isinstance(at,str) and at.endswith('Z') else None
    except (ValueError,TypeError): observed=None
    need(observed is not None and -30<=time.time()-observed<300,'QA_PG_CLEANUP_PROOF_STALE')

def main():
    need(len(sys.argv)<=3,'QA_PG_ARGUMENTS_INVALID');action=sys.argv[1] if len(sys.argv)>1 else '--inspect'
    if action=='--inspect':need(len(sys.argv)<=2,'QA_PG_ARGUMENTS_INVALID');print(json.dumps(inspect_preparation()));return
    need(action in ['--launch','--run','--freeze','--readback','--check','--reconcile-cleanup'] and len(sys.argv)==3 and attempt_valid(sys.argv[2]),'QA_PG_ARGUMENTS_INVALID');attempt=sys.argv[2]
    load_activation(attempt,action)
    if action=='--reconcile-cleanup':value=reconcile_cleanup(attempt)
    elif action=='--check':
        need(os.geteuid()==0,'QA_PG_ROOT_CONTROL_REQUIRED');root_directory(ROOT/attempt,True);value=json.loads(read_private(ROOT/attempt/'state.json'))
    else:
        caches,body=preflight()
        if action=='--launch':value=launch(attempt,caches)
        elif action=='--run':value=run_install(attempt,caches)
        elif action=='--freeze':value=freeze(attempt,body)
        else:value=readback(attempt,body)
    # Private per-attempt state and logs stay local; filtered public facts only.
    allowed={'attempt','status','dispatched','ownerUnit','runtimeReady','runtimeFrozen','frozenBytesDoubleRead','manifestSHA256','metadataSHA256','actualR3ManifestPinSet','packageMetadataClosureVerified','runtimeCJSClosureVerified','exactOwnedContainerAbsent','labelsEmpty','cleanupIndependentlyVerified','cleanupClaimsComplete','statePersistenceFailed','finalizationErrors','productAccepted','automaticRetry','errorCode','containerStarted','containerStopped','containerExitCode','sourceUID','privateLogBytes','privateLogSHA256','rawLogsExported'}
    print(json.dumps({k:v for k,v in value.items() if k in allowed}))

if __name__=='__main__':main()
