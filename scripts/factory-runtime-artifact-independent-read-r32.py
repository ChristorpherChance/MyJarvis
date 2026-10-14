"""Independent bounded byte census. No producer, package or native execution."""
import base64,datetime,hashlib,json,os,posixpath,re,signal,stat,subprocess,sys
from pathlib import Path,PurePosixPath
from types import ModuleType

def need(v,c):
    if not v:raise RuntimeError(c)
def digest(v):return hashlib.sha256(v).hexdigest()
def compact(v):return json.dumps(v,ensure_ascii=False,separators=(',',':')).encode()
def canonical(v):return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def duplicate(rows):
    value={}
    for k,v in rows:need(k not in value,'R32_ARTIFACT_READ_DUPLICATE_JSON');value[k]=v
    return value
def decode(raw):return json.loads(raw,object_pairs_hook=duplicate,parse_constant=lambda _:need(False,'R32_ARTIFACT_READ_NONFINITE_JSON'))
def key(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def path_ok(s):return isinstance(s,str) and 0<len(s)<4096 and not s.startswith('/') and not re.search(r'[\\\x00-\x1f\x7f]',s) and all(x not in ['','.','..'] for x in s.split('/'))
def held(path,leaf=None):
    f=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);chain=[(f,None,None,key(os.fstat(f)))]
    try:
        for i,name in enumerate(Path(path).parts[1:]):
            parent=chain[-1][0];s=os.stat(name,dir_fd=parent,follow_symlinks=False);last=i==len(Path(path).parts)-2
            need(stat.S_ISDIR(s.st_mode),'R32_ARTIFACT_READ_DIRECTORY_REQUIRED')
            need(key(s)==leaf if last and leaf is not None else s.st_uid==s.st_gid==0 and not s.st_mode&0o022,'R32_ARTIFACT_READ_ANCESTOR_UNTRUSTED')
            n=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
            try:need(key(s)==key(os.fstat(n)),'R32_ARTIFACT_READ_PREOPEN_CHANGED')
            except BaseException:os.close(n);raise
            chain.append((n,parent,name,key(s)))
        return chain
    except BaseException:
        close_chain(chain);raise
def close_chain(chain):
    for f,_,_,_ in reversed(chain):os.close(f)
def check_chain(chain):
    for f,parent,name,initial in chain:need(key(os.fstat(f))==initial and (parent is None or key(os.stat(name,dir_fd=parent,follow_symlinks=False))==initial),'R32_ARTIFACT_READ_ANCESTOR_CHANGED')
def read_file(parent,name,listed,limit,expected=None):
    need(stat.S_ISREG(listed.st_mode) and 0<=listed.st_size<=limit,'R32_ARTIFACT_READ_FILE_UNTRUSTED')
    f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
    try:
        need(key(os.fstat(f))==key(listed),'R32_ARTIFACT_READ_FILE_REPLACED');parts=[];size=0;hash=hashlib.sha256()
        while True:
            block=os.read(f,65536)
            if not block:break
            size+=len(block);need(size<=listed.st_size,'R32_ARTIFACT_READ_FILE_GREW');hash.update(block)
            if expected is None:parts.append(block)
        need(size==listed.st_size and key(os.fstat(f))==key(listed)==key(os.stat(name,dir_fd=parent,follow_symlinks=False)),'R32_ARTIFACT_READ_FILE_CHANGED')
        value={'sha256':hash.hexdigest(),'bytes':size}
        if expected is not None:need(value==expected,'R32_ARTIFACT_READ_BYTES_CHANGED')
        return value,b''.join(parts) if expected is None else None
    finally:os.close(f)
def root_read(path,limit=64*1024**2):
    chain=held(str(Path(path).parent))
    try:
        f=chain[-1][0];s=os.stat(Path(path).name,dir_fd=f,follow_symlinks=False);need(s.st_uid==s.st_gid==0 and s.st_nlink==1 and not s.st_mode&0o022,'R32_ARTIFACT_READ_RECEIPT_UNTRUSTED');_,raw=read_file(f,Path(path).name,s,limit);check_chain(chain);return raw
    finally:close_chain(chain)
def resolve_entry(path,nodes):
    need(path_ok(path),'R32_ARTIFACT_READ_LINK_INVALID');seen=set()
    for _ in range(64):
        parts=path.split('/');changed=False
        for i in range(len(parts)):
            prefix='/'.join(parts[:i+1]);entry=nodes.get(prefix);need(entry is not None,'R32_ARTIFACT_READ_LINK_MISSING')
            if entry['type']=='symlink':
                target=entry['target'];need(isinstance(target,str) and target and not target.startswith('/') and not re.search(r'[\\\x00-\x1f\x7f]',target),'R32_ARTIFACT_READ_LINK_INVALID');need(path not in seen,'R32_ARTIFACT_READ_LINK_CYCLE');seen.add(path);path=posixpath.normpath(posixpath.join(posixpath.dirname(prefix),target,*parts[i+1:]));need(path_ok(path),'R32_ARTIFACT_READ_LINK_ESCAPES');changed=True;break
            if i<len(parts)-1:need(entry['type']=='directory','R32_ARTIFACT_READ_LINK_NOT_DIRECTORY')
        if not changed:return path
    need(False,'R32_ARTIFACT_READ_LINK_DEPTH')
def closure(entries):
    nodes={e['path']:e for e in entries};need(len(nodes)==len(entries),'R32_ARTIFACT_READ_DUPLICATE_PATH')
    for e in entries:
        if e['type']=='symlink':resolve_entry(e['path'],nodes)
    return nodes
def prospective(entries,S):
    nodes={e['path']:dict(e) for e in entries};root=S['supplement']['relativeRoot'];need(root not in nodes,'R32_ARTIFACT_READ_SUPPLEMENT_PREEXISTS');aliases=S['nativePrerequisite']['sourceOptionalAliases'];broken={}
    for e in entries:
        if e['type']=='symlink':
            try:resolve_entry(e['path'],nodes)
            except RuntimeError as x:need(str(x)=='R32_ARTIFACT_READ_LINK_MISSING' and aliases.get(e['path'])==e['target'],'R32_ARTIFACT_READ_UNEXPECTED_BROKEN_LINK');broken[e['path']]=e['target']
    need(canonical(broken)==canonical(aliases),'R32_ARTIFACT_READ_TWO_ALIAS_SCOPE_CHANGED')
    parts=root.split('/')
    for i in range(1,len(parts)+1):
        path='/'.join(parts[:i])
        if path in nodes:need(nodes[path]['type']=='directory','R32_ARTIFACT_READ_SUPPLEMENT_PARENT_INVALID')
        else:need(path.startswith('source/node_modules/.pnpm/@napi-rs+lzma-linux-x64-gnu@1.5.1/node_modules/@napi-rs'),'R32_ARTIFACT_READ_SUPPLEMENT_EXTRA_PARENT');nodes[path]={'path':path,'type':'directory'}
    for e in S['supplement']['files']:
        path=root+'/'+e['path'];need(path not in nodes,'R32_ARTIFACT_READ_SUPPLEMENT_COLLISION');nodes[path]={'path':path,'type':'file','sha256':e['sha256'],'bytes':e['bytes']}
    result=sorted(nodes.values(),key=lambda e:e['path']);closure(result);return result
def scan(fd,immutable=False,expected=None):
    entries=[];metadata=[];legacy=[];total=0;root=key(os.fstat(fd));old={r[0]:r[1:] for r in expected['metadata']} if expected else None;expected_entries={e['path']:e for e in expected['entries']} if expected else None
    if immutable:need(root[2:4]==[0,0] and stat.S_IMODE(root[4])==0o555,'R32_ARTIFACT_READ_RUNTIME_ROOT_UNTRUSTED')
    if expected:need(root==expected['rootStat'],'R32_ARTIFACT_READ_OLD_ROOT_CHANGED')
    def walk(parent,prefix='',depth=0):
        nonlocal total
        need(depth<=48,'R32_ARTIFACT_READ_DEPTH');before=key(os.fstat(parent));names=sorted(os.listdir(parent))
        for name in names:
            path=prefix+name;need(path_ok(path) and len(entries)<200000,'R32_ARTIFACT_READ_PATH_LIMIT');s=os.stat(name,dir_fd=parent,follow_symlinks=False);meta=key(s)
            if expected:need(old.get(path)==meta,'R32_ARTIFACT_READ_OLD_METADATA_CHANGED')
            if immutable:need(s.st_uid==s.st_gid==0 and s.st_nlink==1 if not stat.S_ISDIR(s.st_mode) else s.st_uid==s.st_gid==0,'R32_ARTIFACT_READ_RUNTIME_OWNER_OR_LINK_CHANGED')
            target=None
            if stat.S_ISLNK(s.st_mode):target=os.readlink(name,dir_fd=parent)
            legacy.append([path,*meta,digest(target.encode()) if target is not None else None])
            if stat.S_ISDIR(s.st_mode):
                if immutable:need(stat.S_IMODE(s.st_mode)==0o555,'R32_ARTIFACT_READ_RUNTIME_DIRECTORY_WRITABLE')
                n=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
                try:need(meta==key(os.fstat(n)),'R32_ARTIFACT_READ_DIRECTORY_REPLACED');e={'path':path,'type':'directory'};entries.append(e);metadata.append([path,*meta]);walk(n,path+'/',depth+1);need(meta==key(os.fstat(n))==key(os.stat(name,dir_fd=parent,follow_symlinks=False)),'R32_ARTIFACT_READ_DIRECTORY_CHANGED')
                finally:os.close(n)
            elif stat.S_ISREG(s.st_mode):
                if immutable:need(stat.S_IMODE(s.st_mode) in [0o444,0o555],'R32_ARTIFACT_READ_RUNTIME_FILE_WRITABLE')
                prior=expected_entries.get(path) if expected else None
                if expected:need(prior and prior['type']=='file','R32_ARTIFACT_READ_OLD_FILE_CHANGED')
                f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
                try:
                    need(meta==key(os.fstat(f)) and 0<=s.st_size<=400*1024**2,'R32_ARTIFACT_READ_FILE_REPLACED');h=hashlib.sha256();size=0
                    while True:
                        block=os.read(f,65536)
                        if not block:break
                        size+=len(block);need(size<=s.st_size,'R32_ARTIFACT_READ_FILE_GREW');h.update(block)
                    need(size==s.st_size and meta==key(os.fstat(f))==key(os.stat(name,dir_fd=parent,follow_symlinks=False)),'R32_ARTIFACT_READ_FILE_CHANGED');value={'sha256':h.hexdigest(),'bytes':size}
                finally:os.close(f)
                if prior:need(value=={k:prior[k] for k in ['sha256','bytes']},'R32_ARTIFACT_READ_OLD_BYTES_CHANGED')
                total+=size;need(total<=3*1024**3,'R32_ARTIFACT_READ_BYTE_LIMIT');e={'path':path,'type':'file',**value};entries.append(e);metadata.append([path,*meta])
            elif stat.S_ISLNK(s.st_mode):
                target=os.readlink(name,dir_fd=parent);need(isinstance(target,str) and target and not target.startswith('/') and not re.search(r'[\\\x00-\x1f\x7f]',target) and meta==key(os.stat(name,dir_fd=parent,follow_symlinks=False)),'R32_ARTIFACT_READ_LINK_CHANGED');e={'path':path,'type':'symlink','target':target};entries.append(e);metadata.append([path,*meta])
            else:need(False,'R32_ARTIFACT_READ_SPECIAL_FILE')
            if expected:need(e==expected_entries.get(path),'R32_ARTIFACT_READ_OLD_ENTRY_CHANGED')
        need(names==sorted(os.listdir(parent)) and before==key(os.fstat(parent)),'R32_ARTIFACT_READ_DIRECTORY_CLOSURE_CHANGED')
    walk(fd);entries.sort(key=lambda e:e['path']);metadata.sort(key=lambda e:e[0]);need(root==key(os.fstat(fd)),'R32_ARTIFACT_READ_ROOT_CHANGED')
    if immutable:closure(entries)
    if expected:need(entries==expected['entries'] and metadata==expected['metadata'],'R32_ARTIFACT_READ_OLD_FULL_CLOSURE_CHANGED')
    return {'entries':entries,'metadata':metadata,'rootStat':root,'identity':{'device':root[0],'inode':root[1]},'treeSHA256':digest(compact(entries)),'metadataSHA256':digest(compact({'rootIdentity':root,'metadata':metadata})),'files':sum(e['type']=='file' for e in entries),'bytes':total,'links':sum(e['type']=='symlink' for e in entries),'legacyWorkMetadataSHA256':digest(canonical(legacy)),'legacyWorkEntries':len(legacy)}
def double(fd,immutable=False,expected=None):
    a=scan(fd,immutable,expected);b=scan(fd,immutable,expected);need(a==b,'R32_ARTIFACT_READ_DOUBLE_SCAN_CHANGED');return a
def public_images(S):
    images={}
    for role,id in S['images'].items():
        r=subprocess.run(['/usr/bin/docker','image','inspect',id],capture_output=True,timeout=15,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':'/root','DOCKER_API_VERSION':'1.49'});need(r.returncode==0 and len(r.stdout)<=1024**2,'R32_ARTIFACT_READ_IMAGE_INCOMPLETE');rows=decode(r.stdout);need(isinstance(rows,list) and len(rows)==1 and rows[0].get('Id')==id,'R32_ARTIFACT_READ_IMAGE_ID_CHANGED');v=rows[0];images[role]={k:v[k] for k in ['Id','Os','Architecture']};images[role]['Config']={k:v['Config'][k] for k in ['User','Volumes','Entrypoint','Cmd']}
    return {'schemaVersion':1,'kind':'r32-exact-dependency-image-config','images':images}
def transport(value,limit,expected):
    need(isinstance(value,str) and len(value)<=4*((limit+2)//3),'R32_ARTIFACT_READ_TRANSPORT_LIMIT')
    raw=base64.b64decode(value,validate=True);need(len(raw)<=limit and base64.b64encode(raw).decode()==value and digest(raw)==expected,'R32_ARTIFACT_READ_TRANSPORT_CHANGED');return raw
def owner_unit(S):
    o=S['owner'];env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'}
    r=subprocess.run(['/usr/bin/systemctl','show',o['unit'],'--property=Id,LoadState,ActiveState,SubState,MainPID,ControlGroup,RuntimeMaxUSec,TimeoutStopUSec,KillMode,Restart,ExecStopPost'],capture_output=True,text=True,timeout=10,env=env)
    need(r.returncode==0 and len(r.stdout)<=32768,'R32_ARTIFACT_READ_UNIT_INCOMPLETE');v=dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x)
    need(v.get('Id')==o['unit'] and v.get('LoadState') in ['loaded','not-found'] and v.get('ActiveState') in ['inactive','failed'] and v.get('MainPID')=='0' and v.get('ControlGroup') in ['',o['controlGroup']],'R32_ARTIFACT_READ_OWNER_STILL_ACTIVE')
    if v['LoadState']=='loaded':
        need(v.get('RuntimeMaxUSec')=='15min' and v.get('TimeoutStopUSec')=='2min' and v.get('KillMode')=='control-group' and v.get('Restart')=='no','R32_ARTIFACT_READ_OWNER_CONTRACT_CHANGED')
        post=re.fullmatch(r'\{\s*path=([^;{}]+?)\s*;\s*argv\[\]=(.*?)\s*;\s*ignore_errors=(yes|no)\s*;[^{}]*\}',v.get('ExecStopPost',''))
        need(post and post.group(1)=='/usr/bin/python3' and post.group(2).split()==['/usr/bin/python3',S['installedWorker'],'--owner-stopped',S['nonce']] and post.group(3)=='no','R32_ARTIFACT_READ_STOPPOST_CHANGED')
    else:need(v['ActiveState']=='inactive' and v.get('ControlGroup')=='','R32_ARTIFACT_READ_COLLECTED_UNIT_CHANGED')
    return {k:v[k] for k in ['Id','LoadState','ActiveState','SubState','MainPID','ControlGroup']}
def cgroup_members(S):
    group=S['owner']['controlGroup'];need(group=='/system.slice/'+S['owner']['unit'],'R32_ARTIFACT_READ_CGROUP_SCOPE_CHANGED');chain=held('/sys/fs/cgroup/system.slice');parent=chain[-1][0];name=S['owner']['unit'];members=[]
    try:
        try:listed=os.stat(name,dir_fd=parent,follow_symlinks=False)
        except FileNotFoundError:check_chain(chain);return {'present':False,'pids':[]}
        need(stat.S_ISDIR(listed.st_mode) and listed.st_uid==listed.st_gid==0 and not listed.st_mode&0o022,'R32_ARTIFACT_READ_CGROUP_UNTRUSTED');root=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
        def walk(fd,depth=0):
            need(depth<=48,'R32_ARTIFACT_READ_CGROUP_DEPTH');before=key(os.fstat(fd));names=sorted(os.listdir(fd));s=os.stat('cgroup.procs',dir_fd=fd,follow_symlinks=False);need(stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0,'R32_ARTIFACT_READ_CGROUP_PROCS_UNTRUSTED');f=os.open('cgroup.procs',os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
            try:
                need(key(os.fstat(f))==key(s),'R32_ARTIFACT_READ_CGROUP_PROCS_REPLACED');raw=b''
                while True:
                    b=os.read(f,65536)
                    if not b:break
                    raw+=b;need(len(raw)<=4*1024**2,'R32_ARTIFACT_READ_CGROUP_PROCS_LIMIT')
                need(key(os.fstat(f))==key(s)==key(os.stat('cgroup.procs',dir_fd=fd,follow_symlinks=False)),'R32_ARTIFACT_READ_CGROUP_PROCS_CHANGED');rows=raw.decode().splitlines();need(all(re.fullmatch('[1-9][0-9]*',x) for x in rows),'R32_ARTIFACT_READ_CGROUP_PID_INVALID');members.extend(int(x) for x in rows)
            finally:os.close(f)
            for child in names:
                s=os.stat(child,dir_fd=fd,follow_symlinks=False)
                if stat.S_ISDIR(s.st_mode):
                    need(s.st_uid==s.st_gid==0 and not s.st_mode&0o022,'R32_ARTIFACT_READ_CGROUP_CHILD_UNTRUSTED');n=os.open(child,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
                    try:need(key(os.fstat(n))==key(s),'R32_ARTIFACT_READ_CGROUP_CHILD_REPLACED');walk(n,depth+1);need(key(os.fstat(n))==key(s)==key(os.stat(child,dir_fd=fd,follow_symlinks=False)),'R32_ARTIFACT_READ_CGROUP_CHILD_CHANGED')
                    finally:os.close(n)
            need(before==key(os.fstat(fd)) and names==sorted(os.listdir(fd)),'R32_ARTIFACT_READ_CGROUP_CHANGED')
        try:need(key(os.fstat(root))==key(listed),'R32_ARTIFACT_READ_CGROUP_REPLACED');walk(root);need(key(os.fstat(root))==key(listed)==key(os.stat(name,dir_fd=parent,follow_symlinks=False)),'R32_ARTIFACT_READ_CGROUP_CHANGED')
        finally:os.close(root)
        check_chain(chain);return {'present':True,'pids':sorted(set(members))}
    finally:close_chain(chain)
def census_runtime(S,native_raw,params):
    n={'p':params};exec(compile(native_raw,'<independent-reviewed-pidfd-definitions>','exec'),n)
    paths=[params['workspace'],S['oldWork'],S['freezeRoot'],S['ownerBase'],*S['protectedSources']]
    def related(v):
        v=v.removesuffix(' (deleted)');return any(v==x or v.startswith(x+'/') for x in paths)
    def argv(v):return any(re.search(r'(?<![A-Za-z0-9_./-])'+re.escape(x)+r'(?=$|[/\s\x00\x22\x27])',v) for x in paths)
    original=n['process_record'];owner=S['owner']
    def record(pid,boot,attachment=None):
        value=original(pid,boot,attachment)
        if pid==owner['pid']:need(value['boot']==owner['boot'] and value['startTicks']==owner['startTicks'],'R29_CLEANUP_OWNER_PID_REUSED');value['workspaceRelated']=True
        if any(v==owner['controlGroup'] or v.startswith(owner['controlGroup']+'/') for v in value['cgroups']):value['workspaceRelated']=True
        return value
    n['in_workspace']=related;n['argv_workspace']=argv;n['process_record']=record
    def sockets():
        found=[]
        with open('/proc/net/unix',encoding='utf8') as f:
            for line in f.read().splitlines()[1:]:
                parts=line.split(maxsplit=7)
                if len(parts)==8 and related(parts[7].removeprefix('@')):found.append({'pathSHA256':digest(parts[7].encode()),'inode':parts[6]})
        return found
    return n,sockets
def process_clean(scans,sockets,groups,S):
    return len(scans)==2 and all(s['fullProcScan'] is True and s['pidfdSupported'] is True and not s['readIncompletePIDs'] and not s['relatedProcesses'] and not s['allDescendants'] and not s['unitCgroupOtherProcesses'] and not s['workspaceRelatedProcesses'] and S['owner']['pid'] not in s['inspectedPIDs'] and all(e['pid']!=S['owner']['pid'] or e['processIdentity'].get('startTicks')==S['owner']['startTicks'] for e in s['exitedDuringScan']) and all(v==0 for v in s['ack']['counts'].values()) for s in scans) and not sockets and all(not g['pids'] for g in groups)
def inventory_same(value,expected):
    keys=['entries','metadata','rootStat','identity','treeSHA256','metadataSHA256','files','bytes','legacyWorkMetadataSHA256','legacyWorkEntries'];return all(value[k]==expected[k] for k in keys)
def partial_trusted(v):
    return v['rootStat'][2:4]==[0,0] and stat.S_IMODE(v['rootStat'][4])==0o700 and all(r[3:5]==[0,0] and (r[6]==1 if stat.S_ISLNK(r[5]) else not r[5]&0o022 and (not stat.S_ISREG(r[5]) or r[6]==1)) for r in v['metadata'])
def owner_records(S,a):
    chain=held(S['ownerBase']+'/'+S['nonce'])
    try:
        need(stat.S_IMODE(os.fstat(chain[-1][0]).st_mode)==0o700 and sorted(os.listdir(chain[-1][0]))==sorted(['control','owner.json','progress.json','result.json','lifecycle.json','owner.private.log']),'R32_ARTIFACT_READ_OWNER_NAMESPACE_CHANGED');check_chain(chain)
    finally:close_chain(chain)
    chain=held(S['ownerBase']+'/'+S['nonce']+'/control')
    try:
        need(stat.S_IMODE(os.fstat(chain[-1][0]).st_mode)==0o700 and sorted(os.listdir(chain[-1][0]))==sorted(['activation.json','r2-byte-controller.py','request.json','reconciliation.json','reconciliation-evidence.json','protection.json','review.json']),'R32_ARTIFACT_READ_CONTROL_NAMESPACE_CHANGED');check_chain(chain)
    finally:close_chain(chain)
    root=S['ownerBase']+'/'+S['nonce'];raws={name:root_read(root+'/'+name) for name in ['owner.json','progress.json','result.json','lifecycle.json']};need({k:digest(v) for k,v in raws.items()}==S['ownerRecordHashes'],'R32_ARTIFACT_READ_OWNER_RAW_RECEIPTS_CHANGED');o=decode(raws['owner.json']);progress=decode(raws['progress.json']);result=decode(raws['result.json']);life=decode(raws['lifecycle.json']);activation_raw=root_read(root+'/control/activation.json');v=decode(activation_raw)
    need(canonical(o)==canonical(S['owner']) and digest(activation_raw)==S['activationSHA256'] and v.get('schemaVersion')==1 and v.get('kind')=='r32-artifact-owner-exact-activation-r3' and v.get('nonce')==S['nonce'] and v.get('workerSHA256')==S['workerSHA256'] and v.get('coreSHA256')==S['coreSHA256'] and v.get('inputSHA256')==S['oldInspectionSHA256'] and v.get('reconciliationSHA256')==S['reconciliation']['sha256'] and v.get('reconciliationEvidenceSHA256')==S['reconciliationRaw']['sha256'],'R32_ARTIFACT_READ_OWNER_CONTROL_CHANGED')
    controls={'activation.json':activation_raw,'owner.private.log':root_read(root+'/owner.private.log')}
    for name,k in [('r2-byte-controller.py','coreSHA256'),('request.json','requestSHA256'),('reconciliation.json','reconciliationSHA256'),('reconciliation-evidence.json','reconciliationEvidenceSHA256'),('protection.json','protectionSHA256'),('review.json','reviewSHA256')]:
        raw=root_read(root+'/control/'+name);need(digest(raw)==v.get(k),'R32_ARTIFACT_READ_OWNER_CONTROL_CHANGED');controls[name]=raw
    need(digest(root_read(S['installedWorker'],150000))==S['workerSHA256'],'R32_ARTIFACT_READ_INSTALLED_WORKER_CHANGED')
    need(progress.get('schemaVersion')==1 and progress.get('kind')=='r32-artifact-owner-progress-r3' and progress.get('nonce')==S['nonce'] and progress.get('workerSHA256')==S['workerSHA256'] and canonical(progress.get('owner'))==canonical(o) and progress.get('phase')=='finished' and progress.get('status')=='frozen' and progress.get('actualFrozenArtifact') is True and progress.get('resultSHA256')==digest(raws['result.json']) and progress.get('resultBytes')==len(raws['result.json']),'R32_ARTIFACT_READ_OWNER_TERMINAL_REQUIRED')
    need(result.get('schemaVersion')==1 and result.get('kind')=='r32-artifact-byte-freeze-observation' and result.get('nonce')==S['nonce'] and result.get('ready') is True and canonical(result.get('artifact'))==canonical(a) and result.get('oldPartialPreserved') is True and result.get('sourceUnchanged') is True and result.get('newInodesIndependent') is True and result.get('candidateCodeExecuted') is False and result.get('modelsInvoked') is False,'R32_ARTIFACT_READ_RESULT_BYTES_UNBOUND')
    need(life.get('schemaVersion')==1 and life.get('kind')=='r32-byte-owner-stop-post-r3' and life.get('nonce')==S['nonce'] and canonical(life.get('owner'))==canonical(o) and life.get('ownerSHA256')==digest(raws['owner.json']) and life.get('serviceResult')=='success' and life.get('partialTreesRemoved') is False and life.get('copyResumed') is False and life.get('cleanupIndependentlyVerified') is False,'R32_ARTIFACT_READ_STOPPOST_NOT_COMPLETE')
    return raws,controls,result
def main(p):
    need(isinstance(p,dict) and set(p)=={'scope','artifact','imageContract','inspectionRawBase64','indexRawBase64','reconciliationRawBase64','nativeRawBase64','nativeParams'} and canonical(p['scope'])==canonical(EXPECTED_SCOPE),'R32_ARTIFACT_READ_SCOPE_CHANGED');S=p['scope'];need(os.geteuid()==os.getegid()==0,'R32_ARTIFACT_READ_ROOT_REQUIRED');signal.signal(signal.SIGALRM,lambda *_:need(False,'R32_ARTIFACT_READ_TIME_LIMIT'));signal.alarm(150)
    inspection=transport(p['inspectionRawBase64'],64*1024**2,S['oldInspectionSHA256']);index=transport(p['indexRawBase64'],4*1024**2,S['sourceIndex']['sha256']);recon_raw=transport(p['reconciliationRawBase64'],64*1024**2,S['reconciliationRaw']['sha256']);native=transport(p['nativeRawBase64'],150000,S['nativeSHA256']);need(digest(canonical(p['nativeParams']))==S['nativeParamsSHA256'],'R32_ARTIFACT_READ_NATIVE_SCOPE_CHANGED');old=decode(inspection)['runtime'];recon=decode(recon_raw);partial_expected=recon['partialAttempt'];manifest_index=decode(index)['manifest'];a=p['artifact'];need(a.get('schemaVersion')==1 and a.get('kind')=='r32-frozen-application-runtime-artifact' and a.get('root')==S['freezeRoot']+'/'+S['newTreeSHA256']+'/runtime' and a.get('manifestPath')==S['freezeRoot']+'/'+S['newTreeSHA256']+'/runtime-manifest.json' and a.get('treeSHA256')==S['newTreeSHA256'] and a.get('sourceIndexSHA256')==S['sourceIndex']['sha256'] and a.get('buildProofSHA256')==S['buildProofSHA256'] and canonical(a.get('source'))==canonical({'fingerprint':S['sourceFingerprint'],'files':625,'bytes':18413560}) and isinstance(a.get('metadataSHA256'),str) and re.fullmatch('[a-f0-9]{64}',a['metadataSHA256']) and isinstance(a.get('manifestSHA256'),str) and re.fullmatch('[a-f0-9]{64}',a['manifestSHA256']) and canonical(a.get('nativePrerequisite'))==canonical(S['nativePrerequisite']) and canonical(a.get('dependencySupplement'))==canonical(S['supplement']) and a.get('twoCompleteReadbacks') is True and a.get('readOnlyRootOwned') is True,'R32_ARTIFACT_READ_CONTRACT_UNPROVEN')
    need(recon.get('namespaceIdentity')==S['namespaceIdentity'] and partial_expected['identity']==S['oldPartial']['identity'] and partial_expected['treeSHA256']==S['oldPartial']['treeSHA256'] and partial_expected['metadataSHA256']==S['oldPartial']['metadataSHA256'],'R32_ARTIFACT_READ_RECONCILIATION_CHANGED')
    unit_before=owner_unit(S);groups_before=cgroup_members(S);need(not groups_before['pids'],'R32_ARTIFACT_READ_OWNER_CGROUP_ACTIVE');owner_raws,controls,result=owner_records(S,a);n,sockets=census_runtime(S,native,p['nativeParams']);protected_before={path:n['source_state'](path)[0] for path in S['protectedSources']};need(canonical(protected_before)==canonical(S['protectedSources']),'R32_ARTIFACT_READ_PROTECTED_SOURCE_CHANGED');scan_before=n['census']();sockets_before=sockets()
    chains=[]
    try:
        partial=held(S['freezeRoot']+'/'+S['oldNonce'],partial_expected['rootStat']);chains.append(partial);partial_before=double(partial[-1][0],False,partial_expected);need(inventory_same(partial_before,partial_expected) and partial_trusted(partial_before),'R32_ARTIFACT_READ_OLD_PARTIAL_CHANGED');need(result.get('oldPartialInventorySHA256')==digest(compact(partial_expected)),'R32_ARTIFACT_READ_OLD_PARTIAL_RESULT_UNBOUND')
        current=held(S['freezeRoot']+'/'+S['nonce']);chains.append(current);need(stat.S_IMODE(os.fstat(current[-1][0]).st_mode)==0o700 and os.listdir(current[-1][0])==['once.json'],'R32_ARTIFACT_READ_CURRENT_ATTEMPT_CHANGED');once_raw=root_read(S['freezeRoot']+'/'+S['nonce']+'/once.json');need(decode(once_raw)=={'schemaVersion':1,'kind':'r32-artifact-byte-once-intent','nonce':S['nonce'],'scope':decode(inspection)['scope'],'qualifiedSHA256':digest(compact(decode(inspection))),'programSHA256':S['workerSHA256'],'treeSHA256':S['newTreeSHA256']},'R32_ARTIFACT_READ_CURRENT_ONCE_CHANGED')
        namespace=held(S['freezeRoot']);chains.append(namespace);outer=namespace[-1][0];namespace_stat=key(os.fstat(outer));names=sorted(os.listdir(outer));need({'device':namespace_stat[0],'inode':namespace_stat[1]}==S['namespaceIdentity'] and names==sorted([S['oldNonce'],S['nonce'],S['newTreeSHA256']]),'R32_ARTIFACT_READ_NAMESPACE_CHANGED')
        work=held(S['oldWork'],old['rootStat']);chains.append(work);original=double(work[-1][0],False,old);need(original['identity']==S['oldIdentity'] and original['legacyWorkMetadataSHA256']==S['oldMetadataSHA256'] and len(original['entries'])==47822 and original['files']==39397 and original['bytes']==497034759,'R32_ARTIFACT_READ_OLD_WORK_CHANGED');union=prospective(original['entries'],S);need(digest(compact(union))==S['newTreeSHA256'] and len(union)==47827,'R32_ARTIFACT_READ_UNION_CHANGED')
        raws={name:root_read(a['manifestPath'].rsplit('/',1)[0]+'/'+name) for name in ['runtime-manifest.json','artifact-contract.json','image-contract.json']};need(digest(raws['runtime-manifest.json'])==a['manifestSHA256'] and canonical(decode(raws['artifact-contract.json']))==canonical(a) and canonical(decode(raws['image-contract.json']))==canonical(p['imageContract']),'R32_ARTIFACT_READ_RECEIPT_CHANGED');m=decode(raws['runtime-manifest.json']);runtime=held(a['root']);chains.append(runtime);fresh=double(runtime[-1][0],True);need(fresh['identity']==a['rootIdentity'] and fresh['entries']==union and fresh['treeSHA256']==a['treeSHA256']==S['newTreeSHA256'] and fresh['metadataSHA256']==a['metadataSHA256'] and fresh['files']==39400 and fresh['bytes']==498481064 and fresh['links']==2168,'R32_ARTIFACT_READ_NEW_CLOSURE_CHANGED');need(m.get('schemaVersion')==1 and m.get('kind')=='r32-application-runtime-manifest' and m.get('root')=='/work' and m.get('sourceFingerprint')==S['sourceFingerprint'] and m.get('sourceIndexSHA256')==S['sourceIndex']['sha256'] and m['entries']==fresh['entries'] and m['metadata']==fresh['metadata'] and m['rootStat']==fresh['rootStat'] and m['metadataSHA256']==fresh['metadataSHA256'] and m['treeSHA256']==fresh['treeSHA256'],'R32_ARTIFACT_READ_MANIFEST_CHANGED')
        nodes=closure(fresh['entries']);need(len(manifest_index)==625 and all(nodes['source/'+e['path']] == {'path':'source/'+e['path'],'type':'file','sha256':e['sha256'],'bytes':e['bytes']} for e in manifest_index),'R32_ARTIFACT_READ_SOURCE625_CHANGED');old_ids={tuple(r[1:3]) for r in old['metadata']};need(fresh['identity']!=original['identity'] and all(tuple(r[1:3]) not in old_ids for r in fresh['metadata']),'R32_ARTIFACT_READ_SHARED_INODE');image=public_images(S);need(canonical(image)==canonical(p['imageContract']),'R32_ARTIFACT_READ_IMAGE_CONFIG_CHANGED')
        need(double(work[-1][0],False,old)==original and double(runtime[-1][0],True)==fresh and double(partial[-1][0],False,partial_expected)==partial_before and public_images(S)==image,'R32_ARTIFACT_READ_FINAL_OBSERVATION_CHANGED')
        for name,raw in raws.items():need(root_read(a['manifestPath'].rsplit('/',1)[0]+'/'+name)==raw,'R32_ARTIFACT_READ_RAW_RECEIPT_CHANGED')
        need(os.listdir(current[-1][0])==['once.json'] and root_read(S['freezeRoot']+'/'+S['nonce']+'/once.json')==once_raw,'R32_ARTIFACT_READ_CURRENT_ONCE_CHANGED')
        for chain in chains:check_chain(chain)
        need(names==sorted(os.listdir(outer)) and namespace_stat==key(os.fstat(outer)),'R32_ARTIFACT_READ_NAMESPACE_CHANGED')
    finally:
        for chain in reversed(chains):close_chain(chain)
    protected_after={path:n['source_state'](path)[0] for path in S['protectedSources']};need(canonical(protected_after)==canonical(protected_before),'R32_ARTIFACT_READ_PROTECTED_SOURCE_CHANGED');owner_final,controls_final,result_final=owner_records(S,a);need(owner_final==owner_raws and controls_final==controls and result_final==result,'R32_ARTIFACT_READ_OWNER_FRAME_CHANGED');unit_after=owner_unit(S);groups_after=cgroup_members(S);scan_after=n['census']();sockets_after=sockets();identity=lambda v:{k:value for k,value in v.items() if k!='state'};need(identity(scan_before['node'])==identity(scan_after['node']) and scan_before['ack']==scan_after['ack'] and sockets_before==sockets_after and unit_before==unit_after and groups_before==groups_after,'R32_ARTIFACT_READ_PROCESS_OBSERVATION_CHANGED')
    # Neither a producer-frozen claim nor StopPost is a process-cleanup proof.
    scans=[scan_before,scan_after];clean=process_clean(scans,sockets_after,[groups_before,groups_after],S);summary=lambda v:{k:v[k] for k in ['identity','treeSHA256','metadataSHA256','files','bytes','links']};signal.alarm(0)
    return {'schemaVersion':1,'kind':'r32-runtime-artifact-independent-root-read','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'nonce':S['nonce'],'owner':S['owner'],'ownerTerminalRecordsVerified':True,'ownerRecordHashes':{k:digest(v) for k,v in owner_raws.items()},'controlHashes':{k:digest(v) for k,v in controls.items()},'unit':unit_after,'ownerCgroup':groups_after,'scans':scans,'relatedSockets':sockets_after,'processAndSocketScopeClean':clean,'artifact':summary(fresh),'originalWork':summary(original),'oldPartial':summary(partial_before),'oldPartialProtected':True,'oldPartialLinkClosureQualified':False,'namespaceIdentity':S['namespaceIdentity'],'namespaceNames':names,'protectedSources':protected_after,'originalLegacyMetadataSHA256':original['legacyWorkMetadataSHA256'],'originalInspectionSHA256':digest(inspection),'originalReconciliationSHA256':digest(recon_raw),'rawReceipts':{name:digest(b) for name,b in raws.items()},'source625Verified':True,'newInodesIndependent':True,'allInternalLinksClosed':True,'fullTreeTwiceBeforeAndAfter':True,'images':image,'readOnly':True,'candidateCodeExecuted':False,'nativeCodeExecuted':False,'modelsInvoked':False,'mutationsPerformed':False,'rawPrivateDataExported':False}

if __name__=='__main__':print(json.dumps(main(p),separators=(',',':')))
