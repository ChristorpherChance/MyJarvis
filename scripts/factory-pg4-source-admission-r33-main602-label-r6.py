"""Phase A byte admission only. No attempt, package execution, process scan or mutation."""
import base64, contextlib, datetime, hashlib, json, os, posixpath, re, signal, stat, sys, time

PROTOCOL = 'PG4_QA_STARTUP_R33_V1'
TREE = '9e83e22a1ebfcdfc699876860879d8acefe220d3abf49e802333719b549299e3'
APP_PARENT = '/var/lib/jarvis-development/101/r32-truth-artifacts/' + TREE
PG_PARENT = '/var/lib/jarvis-development/101/r29-qa-pg-runtime/3c7ade1178fc47184cd9aaba9e84b855'
FIXTURE = 'apps/server/src/modules/test/truth-gate.integration.test.ts'
SCOPE = {'schemaVersion':1,'kind':'r33-pg4-source-admission-fixed-scope','protocol':PROTOCOL,
 'runtimeRoot':APP_PARENT+'/runtime','runtimeRootIdentity':{'device':66306,'inode':7924569},
 'runtimeContractSHA256':'27f8687bf5678a519684d4b86f21ed6147e923591ec4ba75cc5a28ec82cb7e71',
 'runtimeManifestSHA256':'b4f80840523e838500925387c332aad67b28083a448a17b04ae01999f4b6a8f7',
 'runtimeMetadataSHA256':'07924f72531aa654275d09be16f238210a9c6c7985054fc64e1c10d8bf9af834',
 'runtimeTreeSHA256':TREE,'runtimeEntries':47827,'runtimeFiles':39400,'runtimeBytes':498481064,
 'baseIndexSHA256':'c2a18d38676c0df2b3868095e0a27fb236acf1092574bdda81c52edb7f43d927',
 'overlayIndexSHA256':'b79e5d154fd21abfa422428a622ef2ba8cd3b6953bdc071079fd65c117da136e',
 'baseSourceSHA256':'f4a86cfb949863b6f5cb0dd80dde83f8b97ea4a66e1e047fbd77fc90f92d53e2',
 'effectiveSourceSHA256':'b3d6fa645cf90044fb70f8a29de5aee33bd1ee9ad33b4d770e374caa6fd696ed',
 'fixtureSHA256':'c5645f7567232c7fc797f46f06bc8adc1f2517c18be305daaad01ac9248c3e1a',
 'baseFixtureSHA256':'28dee1022f6bce8bbde8f36d9976509524a1a41a0eb7a1c4288541236b0efa9f',
 'pgRuntimeRoot':PG_PARENT+'/runtime','pgManifestSHA256':'d916c96e199ab7230a6397cd1f4f6fdbceacf30588a16b6943dc8da2996b6eb1',
 'pgMetadataRawSHA256':'3fee74b974414acce00e557f3d598f0c881f38717465ebd3abfff12d4b3345ca',
 'node':{'path':'/usr/local/bin/node','sha256':None,'bytes':None},
 'rootAlarmSeconds':180,'sshTimeoutSeconds':210,'manifestMaxBytes':67108864,
 'fileMaxBytes':419430400,'treeMaxBytes':2147483648,'depthMax':64,'transportMaxBytes':134217728}

def need(v,c):
    if not v: raise RuntimeError(c)
def sha(raw): return hashlib.sha256(raw).hexdigest()
def compact(v): return json.dumps(v,ensure_ascii=False,separators=(',',':')).encode()
def key(s): return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def path_ok(p): return type(p) is str and 0<len(p)<4096 and not p.startswith('/') and not re.search(r'[\\\x00-\x1f\x7f]',p) and all(x not in ('','.','..') for x in p.split('/'))
def duplicate(rows):
    v={}
    for k,x in rows: need(k not in v,'PG4_A_JSON_DUPLICATE');v[k]=x
    return v
def decode(raw): return json.loads(raw,object_pairs_hook=duplicate,parse_constant=lambda _:need(False,'PG4_A_JSON_NONFINITE'))
def unpack(row,pin,limit):
    need(type(row) is dict and set(row)=={'base64','sha256'} and row['sha256']==pin,'PG4_A_SUPPLIED_SOURCE_CHANGED')
    raw=base64.b64decode(row['base64'],validate=True)
    need(len(raw)<=limit and sha(raw)==pin and base64.b64encode(raw).decode()==row['base64'],'PG4_A_SUPPLIED_BYTES_CHANGED');return raw

class Reader:
    def __init__(self): self.phase='PARAMETERS';self.first=None;self.secondary=[];self.opened={};self.unresolved=set();self.partial=[];self.anchors=[];self.deadline=time.monotonic()+180
    def error(self,e,phase=None):
        text=str(e);row={'phase':phase or self.phase,'errorCode':text if re.fullmatch('PG4_A_[A-Z0-9_]+',text) else 'PG4_A_READ_INCOMPLETE','errno':getattr(e,'errno',None),'exceptionClass':type(e).__name__}
        if self.first is None:self.first=row
        else:self.secondary.append(row)
    def time(self):need(time.monotonic()<self.deadline,'PG4_A_DEADLINE')
    @contextlib.contextmanager
    def held(self,fd):
        self.opened[fd]=True;primary=None
        try:yield fd
        except BaseException as e:primary=e;self.error(e);raise
        finally:
            try:os.close(fd);self.opened.pop(fd)
            except BaseException as e:
                self.opened.pop(fd,None);self.unresolved.add(fd)
                self.error(e,'DESCRIPTOR_CLOSE')
                if primary is None:raise
    @contextlib.contextmanager
    def directory(self,parent,name,expected=None):
        self.time();before=os.stat(name,dir_fd=parent,follow_symlinks=False)
        need(stat.S_ISDIR(before.st_mode) and before.st_uid==before.st_gid==0 and not before.st_mode&0o022,'PG4_A_DIRECTORY_UNTRUSTED')
        if expected is not None:need(key(before)==expected,'PG4_A_DIRECTORY_EXPECTATION_CHANGED')
        fd=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=parent)
        with self.held(fd):
            need(key(os.fstat(fd))==key(before),'PG4_A_DIRECTORY_REPLACED')
            yield fd
            need(key(os.fstat(fd))==key(before)==key(os.stat(name,dir_fd=parent,follow_symlinks=False)),'PG4_A_DIRECTORY_CHANGED')
    @contextlib.contextmanager
    def chain(self,path):
        need(path.startswith('/') and path_ok(path[1:]),'PG4_A_ANCHOR_PATH_CHANGED')
        with contextlib.ExitStack() as stack:
            fd=stack.enter_context(self.directory(None,'/'));rows=[{'path':'/','stat':key(os.fstat(fd))}];prefix=''
            for name in path.split('/')[1:]:
                prefix+='/'+name;fd=stack.enter_context(self.directory(fd,name));rows.append({'path':prefix,'stat':key(os.fstat(fd))})
            self.anchors.append(rows);yield fd
    def file(self,parent,name,limit,retain=False,expected=None,relative_leaf=None):
        self.time();self.phase='FILE_READ';before=os.stat(name,dir_fd=parent,follow_symlinks=False)
        if not (stat.S_ISREG(before.st_mode) and before.st_uid==before.st_gid==0 and before.st_nlink==1 and not before.st_mode&0o222 and 0<=before.st_size<=limit):
            leaf=name if relative_leaf is None else relative_leaf
            self.partial.append({'name':name,'relativeLeaf':leaf if path_ok(leaf) else None,'trustedAnchor':self.anchors[-1][-1]['path'] if self.anchors else None,'complete':False,'readStarted':False,'bytesRead':0,'prefixSHA256':sha(b''),'prefixBase64':None,'namedBefore':key(before),'guard':{'regular':stat.S_ISREG(before.st_mode),'uid0':before.st_uid==0,'gid0':before.st_gid==0,'nlink1':before.st_nlink==1,'immutableNoWrite':not bool(before.st_mode&0o222),'nonnegativeSize':before.st_size>=0,'sizeWithinLimit':before.st_size<=limit}})
        need(stat.S_ISREG(before.st_mode) and before.st_uid==before.st_gid==0 and before.st_nlink==1 and not before.st_mode&0o222 and 0<=before.st_size<=limit,'PG4_A_FILE_UNTRUSTED')
        if expected is not None:need(key(before)==expected,'PG4_A_FILE_METADATA_CHANGED')
        fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=parent)
        with self.held(fd):
            need(key(os.fstat(fd))==key(before),'PG4_A_FILE_REPLACED');digest=hashlib.sha256();size=0;chunks=[]
            try:
                while True:
                    self.time();block=os.read(fd,65536)
                    if not block:break
                    size+=len(block);need(size<=before.st_size,'PG4_A_FILE_GREW');digest.update(block)
                    if retain:chunks.append(block)
                need(size==before.st_size and key(os.fstat(fd))==key(before)==key(os.stat(name,dir_fd=parent,follow_symlinks=False)),'PG4_A_FILE_CHANGED')
            except BaseException:
                self.partial.append({'name':name,'complete':False,'bytesRead':size,'prefixSHA256':digest.hexdigest(),'prefixBase64':base64.b64encode(b''.join(chunks)).decode() if retain else None});raise
        return {'sha256':digest.hexdigest(),'bytes':size,'stat':key(before),'raw':b''.join(chunks) if retain else None}
    def two_file(self,parent,name,limit):
        a=self.file(parent,name,limit,True);b=self.file(parent,name,limit,True, a['stat']);need(a==b,'PG4_A_TWO_FILE_READS_CHANGED');return a
    def private_pg_manifest(self,parent):
        # Only this fixed private Root receipt changes policy. Generic file/tree reads stay immutable.
        name='runtime-manifest.json';fd=None;body=None;chunks=[];size=0;before=None;second=0;mismatch=None
        try:
            self.time();self.phase='PG_PRIVATE_MANIFEST'
            named_parent=os.stat(PG_PARENT,follow_symlinks=False)
            need(key(os.fstat(parent))==key(named_parent) and stat.S_ISDIR(named_parent.st_mode) and named_parent.st_uid==named_parent.st_gid==0 and not named_parent.st_mode&0o022,'PG4_A_PRIVATE_PG_PARENT_CHANGED')
            before=os.stat(name,dir_fd=parent,follow_symlinks=False)
            need(stat.S_ISREG(before.st_mode) and before.st_uid==before.st_gid==0 and before.st_nlink==1 and stat.S_IMODE(before.st_mode)==0o600 and before.st_size==35825,'PG4_A_PRIVATE_PG_MANIFEST_UNTRUSTED')
            fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=parent)
            with self.held(fd):
                need(key(os.fstat(fd))==key(before),'PG4_A_PRIVATE_PG_MANIFEST_REPLACED')
                while True:
                    self.time();block=os.read(fd,65536)
                    if not block:break
                    chunks.append(block);size+=len(block);need(size<=35825,'PG4_A_PRIVATE_PG_MANIFEST_GREW')
                body=b''.join(chunks)
                need(len(body)==35825 and sha(body)==SCOPE['pgManifestSHA256'],'PG4_A_PRIVATE_PG_MANIFEST_BYTES_CHANGED')
                need(key(os.fstat(fd))==key(before)==key(os.stat(name,dir_fd=parent,follow_symlinks=False)),'PG4_A_PRIVATE_PG_MANIFEST_FIRST_CHANGED')
                os.lseek(fd,0,os.SEEK_SET)
                while True:
                    self.time();block=os.read(fd,65536)
                    if not block:break
                    if block!=body[second:second+len(block)]:mismatch=block;need(False,'PG4_A_PRIVATE_PG_MANIFEST_SECOND_BYTES_CHANGED')
                    second+=len(block)
                need(second==len(body) and key(os.fstat(fd))==key(before)==key(os.stat(name,dir_fd=parent,follow_symlinks=False)) and key(os.fstat(parent))==key(named_parent)==key(os.stat(PG_PARENT,follow_symlinks=False)),'PG4_A_PRIVATE_PG_MANIFEST_SECOND_CHANGED')
            return {'sha256':sha(body),'bytes':len(body),'stat':key(before),'raw':body}
        except BaseException:
            obtained=body if body is not None else b''.join(chunks)
            self.partial.append({'name':name,'complete':False,'bytesRead':len(obtained),'prefixSHA256':sha(obtained),'prefixBase64':base64.b64encode(obtained).decode(),'namedBefore':None if before is None else key(before),'secondMatchingPrefixBytes':second,'secondMismatchBlockBase64':None if mismatch is None else base64.b64encode(mismatch).decode()})
            raise

    def private_pg_metadata(self,parent):
        # Exact second private publisher receipt only. Generic file/tree policy is unchanged.
        name='runtime-metadata.json';body=None;chunks=[];size=0;before=None;second=0;mismatch=None
        try:
            self.time();self.phase='PG_PRIVATE_METADATA'
            parent_before=os.stat(PG_PARENT,follow_symlinks=False)
            need(key(os.fstat(parent))==key(parent_before) and stat.S_ISDIR(parent_before.st_mode) and parent_before.st_uid==parent_before.st_gid==0 and not parent_before.st_mode&0o022,'PG4_A_PRIVATE_PG_PARENT_CHANGED')
            before=os.stat(name,dir_fd=parent,follow_symlinks=False)
            need(stat.S_ISREG(before.st_mode) and before.st_uid==before.st_gid==0 and before.st_nlink==1 and stat.S_IMODE(before.st_mode)==0o600 and 0<before.st_size<=67108864,'PG4_A_PRIVATE_PG_METADATA_UNTRUSTED')
            fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=parent)
            with self.held(fd):
                need(key(os.fstat(fd))==key(before),'PG4_A_PRIVATE_PG_METADATA_REPLACED')
                while True:
                    self.time();block=os.read(fd,min(65536,67108865-size))
                    if not block:break
                    chunks.append(block);size+=len(block);need(size<=before.st_size,'PG4_A_PRIVATE_PG_METADATA_GREW')
                body=b''.join(chunks)
                need(len(body)==before.st_size and sha(body)==SCOPE['pgMetadataRawSHA256'],'PG4_A_PRIVATE_PG_METADATA_BYTES_CHANGED')
                need(key(os.fstat(fd))==key(before)==key(os.stat(name,dir_fd=parent,follow_symlinks=False)),'PG4_A_PRIVATE_PG_METADATA_FIRST_CHANGED')
                os.lseek(fd,0,os.SEEK_SET)
                while True:
                    self.time();block=os.read(fd,65536)
                    if not block:break
                    if block!=body[second:second+len(block)]:mismatch=block;need(False,'PG4_A_PRIVATE_PG_METADATA_SECOND_BYTES_CHANGED')
                    second+=len(block)
                need(second==len(body) and key(os.fstat(fd))==key(before)==key(os.stat(name,dir_fd=parent,follow_symlinks=False)) and key(os.fstat(parent))==key(parent_before)==key(os.stat(PG_PARENT,follow_symlinks=False)),'PG4_A_PRIVATE_PG_METADATA_SECOND_CHANGED')
            return {'sha256':sha(body),'bytes':len(body),'stat':key(before),'raw':body}
        except BaseException:
            raw=body if body is not None else b''.join(chunks)
            self.partial.append({'name':name,'relativeLeaf':name,'complete':False,'bytesRead':len(raw),'prefixSHA256':sha(raw),'prefixBase64':base64.b64encode(raw).decode(),'namedBefore':None if before is None else key(before),'secondMatchingPrefixBytes':second,'secondMismatchBlockBase64':None if mismatch is None else base64.b64encode(mismatch).decode()})
            raise

    def tree(self,fd,max_nodes,max_bytes,max_file):
        entries=[];rows=[];total=0;files=0
        def walk(d,prefix='',depth=0):
            nonlocal total,files
            self.time();need(depth<=64,'PG4_A_TREE_DEPTH');before=os.fstat(d);need(stat.S_IMODE(before.st_mode)==0o555,'PG4_A_TREE_DIRECTORY_MODE');names=sorted(os.listdir(d))
            for name in names:
                self.time();path=prefix+name;need(path_ok(path) and len(entries)<max_nodes,'PG4_A_TREE_PATH_LIMIT');s=os.stat(name,dir_fd=d,follow_symlinks=False)
                need(s.st_uid==s.st_gid==0,'PG4_A_TREE_OWNER_CHANGED')
                if stat.S_ISDIR(s.st_mode):
                    entries.append({'path':path,'type':'directory'});rows.append([path,*key(s)])
                    with self.directory(d,name,key(s)) as child:walk(child,path+'/',depth+1)
                elif stat.S_ISREG(s.st_mode):
                    f=self.file(d,name,max_file,False,key(s),relative_leaf=path);total+=f['bytes'];files+=1;need(total<=max_bytes,'PG4_A_TREE_BYTES_LIMIT');entries.append({'path':path,'type':'file','sha256':f['sha256'],'bytes':f['bytes']});rows.append([path,*f['stat']])
                elif stat.S_ISLNK(s.st_mode):
                    target=os.readlink(name,dir_fd=d);need(type(target) is str and target and not target.startswith('/') and not re.search(r'[\\\x00-\x1f\x7f]',target),'PG4_A_LINK_INVALID')
                    resolved=posixpath.normpath(posixpath.join(posixpath.dirname(path),target));need(path_ok(resolved),'PG4_A_LINK_ESCAPE');need(key(s)==key(os.stat(name,dir_fd=d,follow_symlinks=False)),'PG4_A_LINK_CHANGED')
                    entries.append({'path':path,'type':'symlink','target':target});rows.append([path,*key(s)])
                else:need(False,'PG4_A_SPECIAL_FILE')
            need(names==sorted(os.listdir(d)) and key(before)==key(os.fstat(d)),'PG4_A_TREE_LIST_CHANGED')
        root=key(os.fstat(fd));walk(fd);need(root==key(os.fstat(fd)),'PG4_A_TREE_ROOT_CHANGED');entries.sort(key=lambda x:x['path']);rows.sort(key=lambda x:x[0]);nodes={x['path']:x for x in entries}
        for e in entries:
            if e['type']=='symlink':resolve_link(e['path'],nodes)
        return {'entries':entries,'metadata':rows,'rootStat':root,'files':files,'bytes':total}
    def finish(self):
        for fd in reversed(list(self.opened)):
            try:os.close(fd);self.opened.pop(fd)
            except BaseException as e:self.error(e,'DESCRIPTOR_FINAL_CLOSE')

def resolve_link(path,nodes):
    seen=set()
    for _ in range(64):
        need(path_ok(path) and path not in seen,'PG4_A_LINK_CYCLE_OR_ESCAPE');seen.add(path);parts=path.split('/');changed=False
        for i in range(len(parts)):
            prefix='/'.join(parts[:i+1]);e=nodes.get(prefix);need(e is not None,'PG4_A_LINK_MISSING')
            if e['type']=='symlink':path=posixpath.normpath(posixpath.join(posixpath.dirname(prefix),e['target'],*parts[i+1:]));changed=True;break
            if i<len(parts)-1:need(e['type']=='directory','PG4_A_LINK_NOT_DIRECTORY')
        if not changed:return path
    need(False,'PG4_A_LINK_LIMIT')

def fingerprints(rows):
    by={x['path']:x for x in rows};need(len(by)==625 and all(path_ok(x) for x in by),'PG4_A_SOURCE_INDEX_INVALID');tree={}
    for path,row in by.items():
        need(set(row)=={'path','sha256','bytes'} and re.fullmatch('[a-f0-9]{64}',row['sha256']) and type(row['bytes']) is int and row['bytes']>=0,'PG4_A_SOURCE_ROW_CHANGED');d=tree
        for name in path.split('/')[:-1]:d=d.setdefault(name,{})
        need(path.split('/')[-1] not in d,'PG4_A_SOURCE_COLLISION');d[path.split('/')[-1]]=row
    order=[]
    def visit(d):
        for name in sorted(d):
            row=d[name]
            if 'path' in row:order.append(row)
            else:visit(row)
    visit(tree)
    return sha(''.join(x['path']+'\0'+x['sha256']+'\n' for x in order).encode())

def source_union(base_raw,overlay_raw,fixture,entries):
    base=decode(base_raw);overlay=decode(overlay_raw)
    need(base['kind']=='r32-truth-gate-public-source-index' and overlay['kind']=='r33-four-fixture-public-source-index','PG4_A_SOURCE_INDEX_ORIGIN')
    a=base['manifest'];b=overlay['manifest'];need(fingerprints(a)==SCOPE['baseSourceSHA256'] and fingerprints(b)==SCOPE['effectiveSourceSHA256'] and sum(x['bytes'] for x in a)==18413560 and sum(x['bytes'] for x in b)==18413597,'PG4_A_SOURCE_FINGERPRINT_CHANGED')
    by={x['path']:x for x in entries};bm={x['path']:x for x in b};need(len(bm)==625 and set(bm)=={x['path'] for x in a},'PG4_A_SOURCE_PATHS_CHANGED')
    changes=[]
    for x in a:
        current=by.get('source/'+x['path']);need(current is not None and current['type']=='file' and current['sha256']==x['sha256'] and current['bytes']==x['bytes'],'PG4_A_RUNTIME_SOURCE625_CHANGED')
        if bm[x['path']]!=x:changes.append(x['path'])
    need(changes==[FIXTURE] and len(fixture)==47163 and sha(fixture)==SCOPE['fixtureSHA256'],'PG4_A_OVERLAY_RELATION_CHANGED')
    text=fixture.decode('utf-8')
    for old,new in [('cases: Array<{ id: string; flowId: string | null; mode: string; required: boolean }>','cases: Array<{ id: string; mode: string; required: boolean }>'),("[{ id: 'AT-MANUAL', flowId: null, mode: 'manual', required: true }]","[{ id: 'AT-MANUAL', mode: 'manual', required: true }]")]:
        need(text.count(old)==1,'PG4_A_OVERLAY_INVERSE_ANCHOR');text=text.replace(old,new)
    need(sha(text.encode())==SCOPE['baseFixtureSHA256'] and len(text.encode())==47126,'PG4_A_OVERLAY_INVERSE_CHANGED')
    return {'kind':'r33-pg4-source-virtual-union-witness','originalSourceFilesRead':625,'otherSourceFilesUnchanged':624,'overlayDeltaBytes':37,'effectiveSourceSHA256':SCOPE['effectiveSourceSHA256'],'files':625,'bytes':18413597,'fixtureSHA256':SCOPE['fixtureSHA256'],'originalCallbacksHooksSQLChanged':False,'overlaySupplyMethod':'source-bound-original-payload-bytes','protectedOverlayPhysicalInstalled':False,'mountObserved':False,'effectiveManifest':b,'sourceIndexRef':{'path':'artifacts/software-factory/goals-r29/r33-four-fixture-source-public-index-1791868427390-693228d2-4a53-411a-9ba3-173ad79cd061.json','sha256':SCOPE['overlayIndexSHA256']},'sourceIndexOriginalBase64':base64.b64encode(overlay_raw).decode()}

def run(p, manage_alarm=True):
    r=Reader();started=time.monotonic();out={'schemaVersion':1,'kind':'r33-pg4-source-runtime-byte-observation','protocol':PROTOCOL,'phase':'A','attempt':None,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readComplete':False,'sourceBytesAdmitted':False,'runtimeWitness':None,'pgRuntimeWitness':None,'sourceWitness':None,'node':SCOPE['node'],'frameworkABIQualified':False,'actualPG4Qualified':False,'current4ScopeQualified':False,'mutationsPerformed':False}
    def timeout(_s,_f):raise RuntimeError('PG4_A_DEADLINE')
    need(type(manage_alarm) is bool,'PG4_A_ALARM_ARGUMENT_CHANGED')
    if manage_alarm:signal.signal(signal.SIGALRM,timeout);signal.alarm(180)
    else:
        remaining=signal.getitimer(signal.ITIMER_REAL)[0];need(0<remaining<=300,'PG4_A_PARENT_ALARM_REQUIRED');r.deadline=min(r.deadline,time.monotonic()+remaining)
    try:
        need(type(p) is dict and set(p)=={'scope','programSHA256','executionContractSHA256','workerSHA256','driverSHA256','bundle'} and p['scope']==SCOPE and all(re.fullmatch('[a-f0-9]{64}',p[k] or '') for k in ['programSHA256','executionContractSHA256','workerSHA256','driverSHA256']),'PG4_A_PARAMETERS_CHANGED')
        need(sys.platform=='linux' and os.getuid()==os.getgid()==os.geteuid()==os.getegid()==0 and sys.flags.isolated==1,'PG4_A_ROOT_ISOLATED_REQUIRED')
        out['profile']={'uid':os.getuid(),'gid':os.getgid(),'euid':os.geteuid(),'egid':os.getegid(),'isolated':sys.flags.isolated};out['programSHA256']=p['programSHA256'];out['executionContractSHA256']=p['executionContractSHA256'];out['workerSHA256']=p['workerSHA256'];out['driverSHA256']=p['driverSHA256']
        need(set(p['bundle'])=={'contract','baseIndex','overlayIndex','fixture'},'PG4_A_BUNDLE_KEYS_CHANGED')
        supplied=unpack(p['bundle']['contract'],SCOPE['runtimeContractSHA256'],65536);base=unpack(p['bundle']['baseIndex'],SCOPE['baseIndexSHA256'],1048576);overlay=unpack(p['bundle']['overlayIndex'],SCOPE['overlayIndexSHA256'],1048576);fixture=unpack(p['bundle']['fixture'],SCOPE['fixtureSHA256'],65536)
        with r.chain(APP_PARENT) as parent:
            need(stat.S_IMODE(os.fstat(parent).st_mode)==0o700,'PG4_A_PUBLISH_PARENT_CHANGED')
            manifest=r.two_file(parent,'runtime-manifest.json',SCOPE['manifestMaxBytes']);need(manifest['sha256']==SCOPE['runtimeManifestSHA256'],'PG4_A_RUNTIME_MANIFEST_CHANGED');m=decode(manifest['raw'])
            contract=r.two_file(parent,'artifact-contract.json',65536);need(contract['raw']==supplied,'PG4_A_RUNTIME_CONTRACT_CHANGED');c=decode(supplied)
            with r.directory(parent,'runtime',m['rootStat']) as root:
                identity={'device':os.fstat(root).st_dev,'inode':os.fstat(root).st_ino};need(identity==SCOPE['runtimeRootIdentity'],'PG4_A_RUNTIME_ROOT_CHANGED');r.phase='APPLICATION_TREE_FIRST';a=r.tree(root,47827,SCOPE['treeMaxBytes'],SCOPE['fileMaxBytes']);r.phase='APPLICATION_TREE_SECOND';b=r.tree(root,47827,SCOPE['treeMaxBytes'],SCOPE['fileMaxBytes']);need(a==b,'PG4_A_RUNTIME_READBACK_CHANGED')
                need(m['entries']==a['entries'] and m['metadata']==a['metadata'] and m['rootStat']==a['rootStat'] and m['treeSHA256']==sha(compact(a['entries']))==c['treeSHA256']==SCOPE['runtimeTreeSHA256'] and m['metadataSHA256']==sha(compact({'rootIdentity':a['rootStat'],'metadata':a['metadata']}))==c['metadataSHA256']==SCOPE['runtimeMetadataSHA256'],'PG4_A_RUNTIME_MANIFEST_DOMAIN_CHANGED')
                need(m['schemaVersion']==1 and m['kind']=='r32-application-runtime-manifest' and m['root']=='/work' and m['sourceFingerprint']==SCOPE['baseSourceSHA256'] and m['sourceIndexSHA256']==SCOPE['baseIndexSHA256'] and m['legacyWorkEntries']==47827 and m['identity']==identity and a['files']==39400 and a['bytes']==498481064,'PG4_A_RUNTIME_COUNTS_OR_ORIGIN_CHANGED')
                out['sourceWitness']=source_union(base,overlay,fixture,a['entries'])
                out['runtimeWitness']={'kind':'r33-pg4-original-runtime-full-byte-witness','root':SCOPE['runtimeRoot'],'identity':identity,'rootStat':a['rootStat'],'manifestSHA256':manifest['sha256'],'manifestBytes':manifest['bytes'],'treeSHA256':sha(compact(a['entries'])),'metadataSHA256':m['metadataSHA256'],'entries':len(a['entries']),'files':a['files'],'bytes':a['bytes'],'twoCompleteReadbacks':True,'sourceFilesVerified':625,'currentByteContentsExported':False}
            need(r.two_file(parent,'runtime-manifest.json',SCOPE['manifestMaxBytes'])==manifest and r.two_file(parent,'artifact-contract.json',65536)==contract,'PG4_A_RUNTIME_PUBLISH_RECEIPTS_CHANGED')
        with r.chain(PG_PARENT) as parent:
            r.phase='PG_RECEIPTS';pm=r.private_pg_manifest(parent);meta=r.private_pg_metadata(parent);need(pm['sha256']==SCOPE['pgManifestSHA256'] and meta['sha256']==SCOPE['pgMetadataRawSHA256'],'PG4_A_PG_RECEIPTS_CHANGED');m=decode(pm['raw']);mmeta=decode(meta['raw'])
            with r.directory(parent,'runtime',mmeta['rootIdentity']) as root:
                r.phase='PG_TREE_FIRST';a=r.tree(root,20000,104857600,104857600);r.phase='PG_TREE_SECOND';b=r.tree(root,20000,104857600,104857600);need(a==b and m['entries']==a['entries'] and m['treeSHA256']==sha(compact(a['entries'])) and mmeta['rootIdentity']==a['rootStat'] and mmeta['metadata']==a['metadata'] and mmeta['metadataSHA256']==sha(compact(a['metadata'])),'PG4_A_PG_DOMAIN_CHANGED')
                need(m['schemaVersion']==1 and m['kind']=='r29-independent-pg-runtime' and m['root']=='/qa-runtime' and m['pgVersion']=='8.23.0' and a['files']==sum(e['type']=='file' for e in m['entries']),'PG4_A_PG_ORIGIN_CHANGED')
                out['pgRuntimeWitness']={'kind':'r33-pg4-independent-pg-full-byte-witness','root':SCOPE['pgRuntimeRoot'],'rootStat':a['rootStat'],'manifestSHA256':pm['sha256'],'metadataRawSHA256':meta['sha256'],'metadataSHA256':mmeta['metadataSHA256'],'treeSHA256':m['treeSHA256'],'entries':len(a['entries']),'files':a['files'],'bytes':a['bytes'],'twoCompleteReadbacks':True,'packageJavaScriptExecuted':False}
            need(r.private_pg_manifest(parent)==pm and r.private_pg_metadata(parent)==meta,'PG4_A_PG_PUBLISH_RECEIPTS_CHANGED')
        out['readComplete']=out['sourceBytesAdmitted']=True
    except BaseException as e:
        if r.first is None:r.error(e)
    finally:
        r.finish()
        if manage_alarm:signal.alarm(0)
    out['dataDescriptorsClosed']=not r.opened and not r.unresolved;out['firstFailure']=r.first;out['secondaryFailures']=r.secondary;out['partialReads']=r.partial;out['ancestorFrames']=r.anchors
    if r.first is not None or r.secondary or r.opened or r.unresolved:out['readComplete']=out['sourceBytesAdmitted']=False
    out['overlayVirtualWitness']={'kind':'r33-pg4-overlay-virtual-byte-witness','fixtureSHA256':SCOPE['fixtureSHA256'],'bytes':47163,'physicalOverlayInstalled':False,'mountObserved':False,'originalBuildCoversEffectiveR33Source':False} if out['readComplete'] else None
    out['witnessBytes']={role:{'sha256':sha(compact(out[role])),'bytes':len(compact(out[role])),'base64':base64.b64encode(compact(out[role])).decode()} for role in ['runtimeWitness','sourceWitness','overlayVirtualWitness','pgRuntimeWitness'] if out[role] is not None}
    out['elapsedMilliseconds']=int((time.monotonic()-started)*1000);return out

if __name__=='__main__':
    # No implicit filesystem or runtime admission from a default invocation.
    print(json.dumps({'kind':'r33-pg4-source-admission-preparation','ready':False,'actualPG4Qualified':False}))
