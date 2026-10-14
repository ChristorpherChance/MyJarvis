"""Finite R32 dedicated DB/HTTP validation owner. Preparation defaults are inert.

Root handles bytes and Docker ownership only. Product/QA JavaScript executes in
one UID1000 container on a new internal network. No production database, package
installation, host ports, Docker socket or supplier/model credentials are used.
Independent cleanup and independent report acceptance are separate tools.
"""
import hashlib,json,os,re,signal,stat,subprocess,sys,time,datetime,selectors
from pathlib import Path,PurePosixPath
from types import ModuleType

ROOT=Path('/var/lib/jarvis-development/101/r32-truth-gate')
ARTIFACT_BASE=Path('/var/lib/jarvis-development/101/r32-truth-artifacts')
LIBRARY=Path('/opt/jarvis-development/software-factory/factory-build-independent-pg-runtime-r29-r2-57eb441548b43362.py')
LIBRARY_SHA='57eb441548b433620b3b244724bb50f27abdbf981b0d5f0e031623b70cfc4ae5'
RUNTIME=Path('/var/lib/jarvis-development/101/r29-qa-pg-runtime/3c7ade1178fc47184cd9aaba9e84b855/runtime')
MANIFEST_SHA='d916c96e199ab7230a6397cd1f4f6fdbceacf30588a16b6943dc8da2996b6eb1'
PG_METADATA_SHA='3fee74b974414acce00e557f3d598f0c881f38717465ebd3abfff12d4b3345ca'
SOURCE_FP='f4a86cfb949863b6f5cb0dd80dde83f8b97ea4a66e1e047fbd77fc90f92d53e2'
SOURCE_INDEX_SHA='c2a18d38676c0df2b3868095e0a27fb236acf1092574bdda81c52edb7f43d927'
IMAGES={'node':'sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96','postgres':'sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d','redis':'sha256:4fa24486b8bcca8eec45ee0eb166edc674795e53a2b53d1a9ef263eecebaac85','minio':'sha256:a16cad481969d7ddb6fcd2f1c58284af3d1266190b9bedc3ef0801aeb05a93a9'}
ROLES=('postgres','redis','minio','api-probe')
VOLUMES={'postgres-data':'/var/lib/postgresql/data','redis-data':'/data','minio-data':'/data'}
CONTROL_FILES=('review.json','cleanup-review.json','protection.json','artifact-contract.json','image-contract.json','tools-contract.json','build-proof.json')
TOOLS_FILES=('supervisor.mjs','probe.mjs','factory-independent-pg-cjs-consumer-r29.mjs','r29-qa-runtime-manifest.json','r32-source-actual-index.json','execution-contract.json')
H=re.compile('[a-f0-9]{64}')
B=None;ACTIVE=None

def need(v,c):
    if not v:raise RuntimeError(c)
def digest(v):return hashlib.sha256(v).hexdigest()
def compact(v):return json.dumps(v,ensure_ascii=False,separators=(',',':')).encode()
def attempt_valid(a):return isinstance(a,str) and re.fullmatch('[a-f0-9]{32}',a) is not None
def prefix(a):need(attempt_valid(a),'QA_R32_ATTEMPT_INVALID');return 'jarvis-tg-r32-'+a
def labels(a):return {'jarvis.truthgate.r32.attempt':a,'jarvis.truthgate.r32.kind':'http-sql-validation'}
def names(a):return {'containers':{k:prefix(a)+'-'+k for k in ROLES},'network':prefix(a)+'-net','volumes':{k:prefix(a)+'-'+k for k in VOLUMES}}
def ident(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def boot_read(path):
    fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        for part in Path(path).parts[1:-1]:
            s=os.stat(part,dir_fd=fd,follow_symlinks=False);need(stat.S_ISDIR(s.st_mode) and s.st_uid==s.st_gid==0 and not s.st_mode&0o022,'QA_R32_PARENT_UNTRUSTED');n=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
            try:need(ident(s)==ident(os.fstat(n)),'QA_R32_PARENT_CHANGED')
            except BaseException:os.close(n);raise
            os.close(fd);fd=n
        s=os.stat(Path(path).name,dir_fd=fd,follow_symlinks=False);f=os.open(Path(path).name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
        try:
            need(ident(s)==ident(os.fstat(f)) and stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and not s.st_mode&0o222 and s.st_size<=150000,'QA_R32_BOOT_UNTRUSTED');v=b''
            while len(v)<=150000:
                q=os.read(f,min(65536,150001-len(v)))
                if not q:break
                v+=q
            need(len(v)==s.st_size and ident(s)==ident(os.fstat(f))==ident(os.stat(Path(path).name,dir_fd=fd,follow_symlinks=False)),'QA_R32_BOOT_CHANGED');return v
        finally:os.close(f)
    finally:os.close(fd)
def library():
    body=boot_read(LIBRARY);need(digest(body)==LIBRARY_SHA,'QA_R32_LIBRARY_CHANGED');m=ModuleType('trusted_r32_byte_lifecycle');m.__file__=str(Path(__file__));exec(compile(body,str(LIBRARY),'exec'),m.__dict__);return m
def docker(args,deadline=None):
    timeout=15 if deadline is None else min(15,deadline-time.monotonic());need(timeout>0,'QA_R32_DOCKER_DEADLINE');return subprocess.run(['/usr/bin/docker',*args],capture_output=True,timeout=timeout,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'})
def inspect(kind,name,deadline=None):
    r=docker(['inspect',name] if kind=='container' else [kind,'inspect',name],deadline)
    if r.returncode:
        escaped=re.escape(name);patterns={'container':[r'Error: No such object: '+escaped,r'Error response from daemon: No such container: '+escaped,r'Error response from daemon: No such object: '+escaped],'network':[r'Error: No such network: '+escaped,r'Error response from daemon: network '+escaped+r' not found',r'Error response from daemon: No such network: '+escaped],'volume':[r'Error response from daemon: get '+escaped+r': no such volume',r'Error: No such volume: '+escaped,r'Error response from daemon: No such volume: '+escaped]}
        need(r.returncode==1 and r.stdout.strip() in [b'',b'[]'] and any(re.fullmatch(x,r.stderr.decode('utf-8','strict').strip(),re.I) for x in patterns[kind]),'QA_R32_RESOURCE_INSPECTION_UNKNOWN');return None
    values=json.loads(r.stdout);need(isinstance(values,list) and len(values)==1 and isinstance(values[0],dict),'QA_R32_RESOURCE_INSPECTION_INVALID');return values[0]
def fresh(v):
    need(isinstance(v,dict) and v.get('kind')=='software-factory-r29-new-protection-contract-observation' and v.get('ready') is True and v.get('contractId')=='9bf97027-a7f6-4706-b7ad-fcb29c304e41' and all(v.get(k) is True for k in ['protectedInventoryFullyVerified','fullQueueSQLVerified','nodeACKIdle','queueIdle','profileUnchanged']) and v.get('modelsInvoked') is False,'QA_R32_PROTECTION_UNPROVEN')
    try:t=datetime.datetime.fromisoformat(v['at'].replace('Z','+00:00')).timestamp()
    except (TypeError,KeyError,ValueError):raise RuntimeError('QA_R32_PROTECTION_TIME_INVALID')
    need(-30<=time.time()-t<300,'QA_R32_PROTECTION_STALE')
def load(a):
    global B,ACTIVE
    need(os.geteuid()==0 and attempt_valid(a),'QA_R32_ROOT_SCOPE_REQUIRED');B=library();p=ROOT/a;B.root_directory(p,True);B.root_directory(p/'control',True)
    v=json.loads(B.read_private(p/'control'/'activation.json'))
    need(set(v)=={'schemaVersion','kind','attempt','runID','workerSHA256','librarySHA256','sourceFingerprint','sourceIndexSHA256','images','pins','toolPins'} and v['schemaVersion']==1 and v['kind']=='r32-truth-gate-exact-activation' and v['attempt']==a and re.fullmatch('[a-f0-9]{40}',v['runID']) and v['workerSHA256']==digest(B.read_private(Path(__file__))) and v['librarySHA256']==LIBRARY_SHA and v['sourceFingerprint']==SOURCE_FP and v['sourceIndexSHA256']==SOURCE_INDEX_SHA and v['images']==IMAGES,'QA_R32_ACTIVATION_CHANGED')
    need(set(v['pins'])==set(CONTROL_FILES) and all(isinstance(x,str) and H.fullmatch(x) for x in v['pins'].values()) and set(v['toolPins'])==set(TOOLS_FILES) and all(isinstance(x,str) and H.fullmatch(x) for x in v['toolPins'].values()),'QA_R32_ACTIVATION_PINS_CHANGED')
    for k,x in v['pins'].items():need(digest(B.read_private(p/'control'/k))==x,'QA_R32_CONTROL_CHANGED')
    for k in ['review.json','cleanup-review.json']:
        r=json.loads(B.read_private(p/'control'/k));need(r.get('workerSHA256')==v['workerSHA256'] and r.get('staticPreparationReady') is True and r.get('remainingP0P1')==0 and r.get('actualHTTPValidationAccepted') is False,'QA_R32_REVIEW_UNPROVEN')
    ACTIVE=v;return v
def link_target(path,target):
    need(isinstance(target,str) and 0<len(target)<=4096 and not target.startswith('/') and chr(92) not in target and all(ord(x)>=32 and ord(x)!=127 for x in target),'QA_R32_ARTIFACT_LINK_INVALID');parts=list(PurePosixPath(path).parent.parts)
    for k in target.split('/'):
        if k in ['','.']:continue
        if k=='..':need(parts,'QA_R32_ARTIFACT_LINK_ESCAPES');parts.pop()
        else:parts.append(k)
    need(parts,'QA_R32_ARTIFACT_LINK_ESCAPES');return '/'.join(parts)
def artifact_tree(root,deadline):
    """Complete root-owned immutable tree; no package loading or filesystem writes."""
    entries=[];metadata=[];total=0;fd=B.held_directory(root);root_info=os.fstat(fd)
    def walk(d,pre='',depth=0):
        nonlocal total
        need(depth<=64 and time.monotonic()<deadline,'QA_R32_ARTIFACT_READ_DEADLINE');before=os.fstat(d);need(before.st_uid==before.st_gid==0 and stat.S_IMODE(before.st_mode)==0o555,'QA_R32_ARTIFACT_DIRECTORY_WRITABLE');listing=sorted(os.listdir(d))
        for name in listing:
            path=pre+name;need(name not in ['.','..'] and chr(92) not in name and all(ord(x)>=32 and ord(x)!=127 for x in name) and len(entries)<200000,'QA_R32_ARTIFACT_PATH_INVALID');s=os.stat(name,dir_fd=d,follow_symlinks=False);need(s.st_uid==s.st_gid==0,'QA_R32_ARTIFACT_OWNER_CHANGED')
            if stat.S_ISDIR(s.st_mode):
                n=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=d)
                try:need(ident(s)==ident(os.fstat(n)),'QA_R32_ARTIFACT_DIRECTORY_CHANGED');entries.append({'path':path,'type':'directory'});metadata.append([path,*ident(s)]);walk(n,path+'/',depth+1)
                finally:os.close(n)
            elif stat.S_ISREG(s.st_mode):
                need(s.st_nlink==1 and stat.S_IMODE(s.st_mode) in [0o444,0o555] and s.st_size<=400*1024**2,'QA_R32_ARTIFACT_FILE_INVALID');f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=d)
                try:
                    need(ident(s)==ident(os.fstat(f)),'QA_R32_ARTIFACT_FILE_CHANGED');h=hashlib.sha256();size=0
                    while True:
                        need(time.monotonic()<deadline,'QA_R32_ARTIFACT_READ_DEADLINE');block=os.read(f,65536)
                        if not block:break
                        size+=len(block);need(size<=s.st_size,'QA_R32_ARTIFACT_FILE_CHANGED');h.update(block)
                    need(size==s.st_size and ident(s)==ident(os.fstat(f))==ident(os.stat(name,dir_fd=d,follow_symlinks=False)),'QA_R32_ARTIFACT_FILE_CHANGED');total+=size;need(total<=2*1024**3,'QA_R32_ARTIFACT_BYTES_BOUND');entries.append({'path':path,'type':'file','sha256':h.hexdigest(),'bytes':size});metadata.append([path,*ident(s)])
                finally:os.close(f)
            elif stat.S_ISLNK(s.st_mode):
                target=os.readlink(name,dir_fd=d);link_target(path,target);need(ident(s)==ident(os.stat(name,dir_fd=d,follow_symlinks=False)),'QA_R32_ARTIFACT_LINK_CHANGED');entries.append({'path':path,'type':'symlink','target':target});metadata.append([path,*ident(s)])
            else:raise RuntimeError('QA_R32_ARTIFACT_SPECIAL_FILE')
        need(listing==sorted(os.listdir(d)) and ident(before)==ident(os.fstat(d)),'QA_R32_ARTIFACT_DIRECTORY_CHANGED')
    try:walk(fd)
    finally:os.close(fd)
    entries.sort(key=lambda x:x['path']);metadata.sort(key=lambda x:x[0]);allowed={x['path'] for x in entries}
    for x in entries:
        if x['type']=='symlink':
            target=Path(root,x['path']).resolve(strict=True);need(target!=Path(root) and Path(root) in target.parents and target.relative_to(root).as_posix() in allowed,'QA_R32_ARTIFACT_LINK_RESOLUTION_ESCAPES')
    return {'entries':entries,'metadata':metadata,'rootIdentity':ident(root_info),'bytes':total}
def verify_artifact(a):
    c=json.loads(B.read_private(ROOT/a/'control'/'artifact-contract.json'));need(c.get('schemaVersion')==1 and c.get('kind')=='r32-frozen-application-runtime-artifact' and c.get('source')=={'fingerprint':SOURCE_FP,'files':625,'bytes':18413560} and c.get('sourceIndexSHA256')==SOURCE_INDEX_SHA and c.get('buildProofSHA256')==ACTIVE['pins']['build-proof.json'] and c.get('readOnlyRootOwned') is True and c.get('twoCompleteReadbacks') is True,'QA_R32_ARTIFACT_CONTRACT_UNPROVEN')
    root=Path(c['root']);need(root.parent.parent==ARTIFACT_BASE and H.fullmatch(root.parent.name) and root.name=='runtime' and c.get('manifestPath')==str(root.parent/'runtime-manifest.json'),'QA_R32_ARTIFACT_ROOT_SCOPE_CHANGED');raw=B.read_private(Path(c['manifestPath']),128*1024**2);need(digest(raw)==c.get('manifestSHA256'),'QA_R32_ARTIFACT_MANIFEST_CHANGED');m=json.loads(raw);t=artifact_tree(root,time.monotonic()+120)
    need(m.get('kind')=='r32-application-runtime-manifest' and m.get('root')=='/work' and m.get('sourceFingerprint')==SOURCE_FP and m.get('sourceIndexSHA256')==SOURCE_INDEX_SHA and m.get('entries')==t['entries'] and c.get('treeSHA256')==m.get('treeSHA256')==digest(compact(t['entries'])) and c.get('metadataSHA256')==m.get('metadataSHA256')==digest(compact({'rootIdentity':t['rootIdentity'],'metadata':t['metadata']})),'QA_R32_ARTIFACT_FULL_CLOSURE_CHANGED')
    need(c.get('rootIdentity')=={'device':t['rootIdentity'][0],'inode':t['rootIdentity'][1]},'QA_R32_ARTIFACT_IDENTITY_CHANGED');by={x['path']:x for x in t['entries']};index=json.loads(B.read_private(ROOT/a/'tools'/'r32-source-actual-index.json'))
    need(len(index.get('manifest',[]))==625 and all(by.get('source/'+x['path'],{}).get('sha256')==x['sha256'] and by['source/'+x['path']]['bytes']==x['bytes'] for x in index['manifest']),'QA_R32_ARTIFACT_SOURCE_CHANGED')
    need(by.get('source/apps/server/dist/main.js',{}).get('type')=='file' and by.get('source/apps/server/src/modules/test/truth-gate.integration.test.ts',{}).get('sha256')=='28dee1022f6bce8bbde8f36d9976509524a1a41a0eb7a1c4288541236b0efa9f','QA_R32_ARTIFACT_REQUIRED_ENTRY_MISSING');return c
def verify_images(a):
    v=json.loads(B.read_private(ROOT/a/'control'/'image-contract.json'));need(v.get('schemaVersion')==1 and v.get('kind')=='r32-exact-dependency-image-config' and set(v.get('images',{}))==set(IMAGES),'QA_R32_IMAGE_CONTRACT_CHANGED')
    for role,image in IMAGES.items():
        r=docker(['image','inspect',image]);need(r.returncode==0,'QA_R32_IMAGE_UNREADABLE');values=json.loads(r.stdout);need(len(values)==1,'QA_R32_IMAGE_UNREADABLE');z=values[0];need(isinstance(z.get('Config'),dict) and 'Volumes' in z['Config'],'QA_R32_IMAGE_CONFIG_UNREADABLE');c=z['Config'];public={'Id':z.get('Id'),'Os':z.get('Os'),'Architecture':z.get('Architecture'),'Config':{k:c.get(k) for k in ['User','Volumes','Entrypoint','Cmd']}}
        need(public==v['images'][role] and public['Id']==image and public['Os']=='linux' and public['Architecture']=='amd64','QA_R32_IMAGE_IDENTITY_CHANGED');declared=c.get('Volumes');need(declared is None or isinstance(declared,dict),'QA_R32_IMAGE_VOLUMES_UNREADABLE');allowed=[] if role=='node' else [VOLUMES[role+'-data']];need(set(declared or {})<=set(allowed),'QA_R32_IMAGE_ANONYMOUS_VOLUME_FORBIDDEN');need(isinstance(c.get('Entrypoint'),list) or c.get('Entrypoint') is None,'QA_R32_IMAGE_ENTRYPOINT_UNREADABLE')
    return v
def empty_labels(a,deadline=None):
    for filters in [['label=jarvis.truthgate.r32.attempt='+a],['label=jarvis.truthgate.r32.attempt='+a,'label=jarvis.truthgate.r32.kind=http-sql-validation']]:
        for head in [['ps','-aq'],['network','ls','-q'],['volume','ls','-q']]:
            args=list(head)
            for f in filters:args+=['--filter',f]
            r=docker(args,deadline);need(r.returncode==0 and not r.stdout.strip(),'QA_R32_LABEL_SCOPE_NOT_EMPTY')
def preflight(a,full=True):
    load(a);p=ROOT/a;need(sorted(os.listdir(p/'control'))==sorted(['activation.json',*CONTROL_FILES]),'QA_R32_CONTROL_EXTRA_FILE');fresh(json.loads(B.read_private(p/'control'/'protection.json')))
    t=json.loads(B.read_private(p/'control'/'tools-contract.json'));need(t=={'schemaVersion':1,'kind':'r32-truth-gate-readonly-tools','attempt':a,'files':ACTIVE['toolPins']},'QA_R32_TOOLS_CONTRACT_CHANGED');s=(p/'tools').lstat();need(s.st_uid==s.st_gid==0 and stat.S_IMODE(s.st_mode)==0o555 and sorted(os.listdir(p/'tools'))==sorted(TOOLS_FILES),'QA_R32_TOOLS_DIRECTORY_CHANGED')
    for k,pin in t['files'].items():need(digest(B.read_private(p/'tools'/k))==pin and stat.S_IMODE((p/'tools'/k).lstat().st_mode)==0o444,'QA_R32_TOOL_CHANGED')
    need(t['files']['r29-qa-runtime-manifest.json']==MANIFEST_SHA and t['files']['r32-source-actual-index.json']==SOURCE_INDEX_SHA and t['files']['factory-independent-pg-cjs-consumer-r29.mjs']=='45d888de21d3221a66d43d7d601de358338892f26d3d14c9b1ddb5dd32850c99','QA_R32_TRUSTED_PG_SOURCE_CHANGED');need(B.read_private(RUNTIME.parent/'runtime-manifest.json')==B.read_private(p/'tools'/'r29-qa-runtime-manifest.json'),'QA_R32_RAW_PG_MANIFEST_CHANGED')
    e=json.loads(B.read_private(p/'tools'/'execution-contract.json'));need(e.get('schemaVersion')==1 and e.get('kind')=='r32-truth-gate-nonroot-execution-contract' and e.get('attempt')==a and e.get('runID')==ACTIVE['runID'] and e.get('sourceFingerprint')==SOURCE_FP and e.get('sourceIndexSHA256')==SOURCE_INDEX_SHA and e.get('buildProofSHA256')==ACTIVE['pins']['build-proof.json'] and e.get('artifactContractSHA256')==ACTIVE['pins']['artifact-contract.json'] and e.get('PGManifestSHA256')==MANIFEST_SHA and e.get('httpSQLDenominator')==34 and e.get('additionalPGDenominator')==4,'QA_R32_NONROOT_CONTRACT_CHANGED')
    b=json.loads(B.read_private(p/'control'/'build-proof.json'));need(b.get('kind')=='r32-locked-build-independent-qualified' and b.get('sourceFingerprint')==SOURCE_FP and b.get('sourceFiles')==625 and b.get('buildPassed') is True and b.get('typecheckPassed') is True and b.get('independentLogsVerified') is True and b.get('cleanupIndependentlyVerified') is True and b.get('productAccepted') is False,'QA_R32_BUILD_UNPROVEN')
    if full:verify_artifact(a);verify_images(a)
    return e
def owner(a):
    unit=prefix(a)+'-owner.service';need(os.environ.get('JARVIS_R32_MATRIX_OWNER_UNIT')==unit,'QA_R32_OWNER_REQUIRED');r=subprocess.run(['/usr/bin/systemctl','show',unit,'--property=ActiveState,MainPID,ControlGroup,RuntimeMaxUSec,TimeoutStopUSec,KillMode,Restart,ExecStopPost'],capture_output=True,text=True,timeout=10,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'});need(r.returncode==0,'QA_R32_OWNER_UNREADABLE');v=dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x)
    need(v.get('ActiveState')=='active' and v.get('MainPID')==str(os.getpid()) and v.get('ControlGroup')=='/system.slice/'+unit and v.get('RuntimeMaxUSec')=='30min' and v.get('TimeoutStopUSec')=='2min' and v.get('KillMode')=='control-group' and v.get('Restart')=='no','QA_R32_OWNER_CONTRACT_CHANGED');post=re.fullmatch(r'\{\s*path=([^;{}]+?)\s*;\s*argv\[\]=(.*?)\s*;\s*ignore_errors=(yes|no)\s*;[^{}]*\}',v.get('ExecStopPost',''));need(post and post.group(1)=='/usr/bin/python3' and post.group(2).split()==['/usr/bin/python3',str(Path(__file__)),'--reconcile-cleanup',a] and post.group(3)=='no','QA_R32_STOPPOST_CHANGED')
    return {'unit':unit,'pid':os.getpid(),'startTicks':Path('/proc/self/stat').read_text().rsplit(')',1)[1].split()[19],'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'controlGroup':v['ControlGroup'],'runtimeMaxSec':1800,'stopTimeoutSec':120,'killMode':'control-group','restart':'no'}
def expected_resource(a,role):
    n=names(a)
    if role in ROLES:return 'container',n['containers'][role]
    if role=='network':return 'network',n['network']
    need(role in VOLUMES,'QA_R32_RESOURCE_ROLE_INVALID');return 'volume',n['volumes'][role]
def check_resource(a,role,v):
    kind,name=expected_resource(a,role);need(isinstance(v,dict),'QA_R32_RESOURCE_UNREADABLE');actual=v.get('Name');need(actual==('/'+name if kind=='container' else name),'QA_R32_RESOURCE_NAME_CHANGED');lab=v.get('Config',{}).get('Labels') if kind=='container' else v.get('Labels');need(isinstance(lab,dict) and all(lab.get(k)==x for k,x in labels(a).items()),'QA_R32_RESOURCE_LABEL_CHANGED')
    if kind=='network':need(v.get('Internal') is True and v.get('Driver')=='bridge' and not v.get('Ingress') and v.get('Attachable') is False,'QA_R32_NETWORK_CHANGED')
    elif kind=='volume':need(v.get('Driver')=='local' and not v.get('Options'),'QA_R32_VOLUME_DRIVER_CHANGED')
    else:check_container(a,role,v)
    id=v.get('Id') if kind!='volume' else v.get('Name');need(isinstance(id,str) and (H.fullmatch(id) if kind!='volume' else id==name),'QA_R32_RESOURCE_ID_INVALID');return {'schemaVersion':1,'kind':'r32-truth-gate-created-resource','attempt':a,'resourceKind':kind,'role':role,'name':name,'id':id,'createdAt':v.get('Created') if kind!='volume' else v.get('CreatedAt'),'imageID':v.get('Image') if kind=='container' else None,'labels':labels(a),'configSHA256':digest(compact(v.get('Config') if kind=='container' else {k:v.get(k) for k in ['Name','Id','Created','CreatedAt','Driver','Options','Internal','Attachable','Ingress','Labels']}))}
def app_mounts(a):
    c=json.loads(B.read_private(ROOT/a/'control'/'artifact-contract.json'));return [{'source':c['root'],'destination':'/work','readOnly':True},{'source':str(ROOT/a/'tools'),'destination':'/tools','readOnly':True},{'source':str(RUNTIME),'destination':'/qa-runtime','readOnly':True},{'source':str(ROOT/a/'evidence'),'destination':'/evidence','readOnly':False}]
def check_container(a,role,v):
    c=v.get('Config');h=v.get('HostConfig');need(isinstance(c,dict) and isinstance(h,dict),'QA_R32_CONTAINER_CONFIG_UNREADABLE');image=IMAGES['node' if role=='api-probe' else role];need(v.get('Image')==image,'QA_R32_CONTAINER_IMAGE_CHANGED');app=role=='api-probe';need(c.get('User')==('1000:1000' if app else '') and c.get('WorkingDir')==('/work/source' if app else ''),'QA_R32_CONTAINER_USER_CHANGED')
    desired_cmd=['/tools/supervisor.mjs'] if app else [] if role=='postgres' else ['redis-server','--save','','--appendonly','no'] if role=='redis' else ['server','/data'];images=json.loads(B.read_private(ROOT/a/'control'/'image-contract.json'))['images'];need(c.get('Entrypoint')==(['/usr/local/bin/node'] if app else images[role]['Config']['Entrypoint']) and c.get('Cmd')==(images[role]['Config']['Cmd'] if role=='postgres' else desired_cmd),'QA_R32_CONTAINER_COMMAND_CHANGED');declared=c.get('Volumes');allowed=[] if app else [VOLUMES[role+'-data']];need(declared is None or isinstance(declared,dict),'QA_R32_CONTAINER_VOLUMES_UNREADABLE');need(set(declared or {})<=set(allowed),'QA_R32_ANONYMOUS_VOLUME_FORBIDDEN')
    need(h.get('NetworkMode')==names(a)['network'] and h.get('Privileged') is False and h.get('PidMode')=='' and h.get('IpcMode')=='private' and h.get('CapDrop')==['ALL'] and (h.get('CapAdd') in [None,[]] if app else h.get('CapAdd')==['CHOWN','DAC_OVERRIDE','FOWNER','SETUID','SETGID']) and h.get('SecurityOpt') in [['no-new-privileges'],['no-new-privileges=true']] and h.get('Init') is True and h.get('ReadonlyRootfs') is app and h.get('Memory')==(4*1024**3 if app else 768*1024**2) and h.get('NanoCpus')==(2*10**9 if app else 10**9) and h.get('PidsLimit')==(256 if app else 128) and not h.get('PortBindings') and not h.get('Devices') and not h.get('DeviceRequests'),'QA_R32_CONTAINER_ISOLATION_CHANGED')
    need(h.get('LogConfig')=={'Type':'json-file','Config':{'max-size':'4m','max-file':'2'}},'QA_R32_CONTAINER_LOG_BOUND_CHANGED');need(h.get('Tmpfs')==({'/tmp':'rw,nosuid,nodev,size=128m'} if app else None) or not app and h.get('Tmpfs')=={},'QA_R32_CONTAINER_TMPFS_CHANGED');mounts=v.get('Mounts');need(isinstance(mounts,list),'QA_R32_CONTAINER_MOUNTS_UNREADABLE');expected=app_mounts(a) if app else [{'source':names(a)['volumes'][role+'-data'],'destination':VOLUMES[role+'-data'],'readOnly':False}];need(len(mounts)==len(expected),'QA_R32_CONTAINER_EXTRA_MOUNT')
    for m in expected:
        found=[x for x in mounts if x.get('Destination')==m['destination']];need(len(found)==1 and found[0].get('RW') is (not m['readOnly']) and (found[0].get('Type')=='bind' and found[0].get('Source')==m['source'] if app else found[0].get('Type')=='volume' and found[0].get('Name')==m['source']),'QA_R32_CONTAINER_MOUNT_CHANGED')
    env=c.get('Env');need(isinstance(env,list) and all(isinstance(x,str) for x in env),'QA_R32_CONTAINER_ENV_UNREADABLE');private_env=dict(x.split('=',1) for x in B.read_private(ROOT/a/(role+'.env')).decode().splitlines());need(all([x for x in env if x.startswith(k+'=')]==[k+'='+val] for k,val in private_env.items()) and not any(x.split('=',1)[0] in ['NODE_OPTIONS','NODE_PATH','PG_FORCE_NATIVE','LD_PRELOAD','LD_LIBRARY_PATH','BASH_ENV','ENV'] and x.split('=',1)[1] for x in env),'QA_R32_CONTAINER_ENV_CHANGED');need(not any(re.search('API_KEY|TOKEN|ANTHROPIC|OPENAI',x.split('=',1)[0]) for x in env),'QA_R32_MODEL_CREDENTIAL_FORBIDDEN')
def intent(a,role):
    kind,name=expected_resource(a,role);v={'schemaVersion':1,'kind':'r32-truth-gate-creation-intent','attempt':a,'resourceKind':kind,'role':role,'name':name,'labels':labels(a),'workerSHA256':ACTIVE['workerSHA256'],'activationSHA256':digest(B.read_private(ROOT/a/'control'/'activation.json')),'emptyResourceScopeVerified':True};B.store(ROOT/a/'registry'/(role+'.intent.json'),v);return v
def record(a,role,v):
    r=check_resource(a,role,v);r['creationIntentSHA256']=digest(B.read_private(ROOT/a/'registry'/(role+'.intent.json')));B.store(ROOT/a/'registry'/(role+'.created.json'),r);return r
def create(a,role,args):
    kind,name=expected_resource(a,role);need(inspect(kind,name) is None,'QA_R32_RESOURCE_ALREADY_EXISTS');fresh(json.loads(B.read_private(ROOT/a/'control'/'protection.json')));intent(a,role);r=docker(args);need(r.returncode==0,'QA_R32_CREATE_AMBIGUOUS_USE_CHECK');v=inspect(kind,name);actual=record(a,role,v);need(r.stdout.decode().strip()==actual['id'],'QA_R32_CREATE_REPLY_ID_CHANGED');return actual
def container_command(a,role):
    app=role=='api-probe';args=['create','--pull=never','--init','--log-driver','json-file','--log-opt','max-size=4m','--log-opt','max-file=2','--name',names(a)['containers'][role],'--network',names(a)['network'],'--user','1000:1000' if app else '','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','4g' if app else '768m','--cpus','2' if app else '1','--pids-limit','256' if app else '128','--env-file',str(ROOT/a/(role+'.env'))]
    for k,val in labels(a).items():args+=['--label',k+'='+val]
    if app:
        args+=['--read-only','--tmpfs','/tmp:rw,nosuid,nodev,size=128m','--workdir','/work/source','--entrypoint','/usr/local/bin/node']
        for m in app_mounts(a):args+=['--mount','type=bind,src='+m['source']+',dst='+m['destination']+(',readonly' if m['readOnly'] else '')]
        return args+[IMAGES['node'],'/tools/supervisor.mjs']
    for cap in ['CHOWN','DAC_OVERRIDE','FOWNER','SETUID','SETGID']:args+=['--cap-add',cap]
    args+=['--network-alias',role,'--mount','type=volume,src='+names(a)['volumes'][role+'-data']+',dst='+VOLUMES[role+'-data']]
    return args+[IMAGES[role],*(['redis-server','--save','','--appendonly','no'] if role=='redis' else ['server','/data'] if role=='minio' else [])]
def initialize_env(a):
    private=ROOT/a;password=os.urandom(24).hex();user='jarvis-qa-r32';loginpass=os.urandom(24).hex();key=os.urandom(32).hex();minuser='jarvisr32';minpass=os.urandom(24).hex();run=ACTIVE['runID'];e={'CI':'1','HOME':'/tmp/r32-qa/home','TMPDIR':'/tmp/r32-qa/tmp','XDG_CACHE_HOME':'/tmp/r32-qa/cache','XDG_CONFIG_HOME':'/tmp/r32-qa/config','MSF_AI_PROVIDER':'mock','NODE_PATH':'','NODE_OPTIONS':'','PG_FORCE_NATIVE':'','JARVIS_QA_SCOPE':'r32-truth-gate-isolated-v1','JARVIS_SOURCE_SHA256':SOURCE_FP,'JARVIS_AUTONOMY_RUN_ID':run,'JARVIS_VALIDATION_ATTEMPT':a,'JARVIS_EXECUTION_CONTRACT_SHA256':ACTIVE['toolPins']['execution-contract.json'],'MSF_DATABASE_URL':'postgres://jarvis_test:'+password+'@postgres:5432/jarvis_truth_gate_r32','R29_UPGRADE_DATABASE_URL':'postgres://jarvis_test:'+password+'@postgres:5432/jarvis_truth_upgrade_r32','MSF_REDIS_URL':'redis://redis:6379','MSF_MINIO_ENDPOINT':'minio','MSF_MINIO_PORT':'9000','MSF_MINIO_ACCESS_KEY':minuser,'MSF_MINIO_SECRET_KEY':minpass,'MSF_MINIO_BUCKET':'jarvis-truth-r32-'+run[:16]+'-'+a[:8],'MSF_PORT':'18932','MSF_SECRET_KEY':key,'MSF_AUTH_USER':user,'MSF_AUTH_PASS':loginpass,'JARVIS_VALIDATION_USER':user,'JARVIS_VALIDATION_PASSWORD':loginpass}
    for role,v in [('api-probe',e),('postgres',{'POSTGRES_USER':'jarvis_test','POSTGRES_PASSWORD':password,'POSTGRES_DB':'jarvis_truth_gate_r32'}),('redis',{}),('minio',{'MINIO_ROOT_USER':minuser,'MINIO_ROOT_PASSWORD':minpass})]:B.store_bytes(private/(role+'.env'),('\n'.join(k+'='+x for k,x in v.items())+'\n').encode())
def launch(a):
    preflight(a);p=ROOT/a;need(set(os.listdir(p))=={'control','tools'},'QA_R32_DUPLICATE_ONCE_USE_CHECK');empty_labels(a)
    for role in [*ROLES,'network',*VOLUMES]:kind,name=expected_resource(a,role);need(inspect(kind,name) is None,'QA_R32_RESOURCE_ALREADY_EXISTS')
    fresh(json.loads(B.read_private(p/'control'/'protection.json')));once={'schemaVersion':1,'kind':'r32-truth-gate-once-intent','attempt':a,'runID':ACTIVE['runID'],'workerSHA256':ACTIVE['workerSHA256'],'activationSHA256':digest(B.read_private(p/'control'/'activation.json')),'automaticRetry':False};B.store(p/'once.json',once);B.store(p/'ownership.json',{'schemaVersion':1,'kind':'r32-truth-gate-ownership','attempt':a,'resources':names(a),'labels':labels(a),'workerSHA256':ACTIVE['workerSHA256'],'activationSHA256':once['activationSHA256'],'emptyResourceScopeVerified':True});unit=prefix(a)+'-owner.service'
    argv=['/usr/bin/systemd-run','--unit='+unit,'--collect','--no-block','--property=User=root','--property=Type=simple','--property=KillMode=control-group','--property=RuntimeMaxSec=1800','--property=TimeoutStopSec=120','--property=Restart=no','--property=WorkingDirectory=/','--property=Environment=JARVIS_R32_MATRIX_OWNER_UNIT='+unit,'--property=ExecStopPost=/usr/bin/python3 '+str(Path(__file__))+' --reconcile-cleanup '+a,'/usr/bin/python3',str(Path(__file__)),'--run',a];fresh(json.loads(B.read_private(p/'control'/'protection.json')));r=subprocess.run(argv,capture_output=True,timeout=20,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'});need(r.returncode==0,'QA_R32_LAUNCH_AMBIGUOUS_USE_CHECK');return {'attempt':a,'dispatched':True,'ownerUnit':unit}
def reconcile(a):
    deadline=time.monotonic()+90;load(a);p=ROOT/a;ownership=json.loads(B.read_private(p/'ownership.json'));need(ownership.get('resources')==names(a) and ownership.get('labels')==labels(a) and ownership.get('workerSHA256')==ACTIVE['workerSHA256'] and ownership.get('emptyResourceScopeVerified') is True,'QA_R32_CLEANUP_OWNERSHIP_CHANGED');need(time.monotonic()<deadline,'QA_R32_CLEANUP_READ_DEADLINE');errors=[];removed=[]
    for role in [*reversed(ROLES),*VOLUMES,'network']:
        try:
            kind,name=expected_resource(a,role);v=inspect(kind,name,deadline);ip=p/'registry'/(role+'.intent.json');cp=p/'registry'/(role+'.created.json')
            if v is None:
                need(not os.path.lexists(ip) or os.path.lexists(cp),'QA_R32_PENDING_CREATE_ID_UNKNOWN');continue
            need(os.path.lexists(ip),'QA_R32_CLEANUP_FOREIGN_RESOURCE');i=json.loads(B.read_private(ip,deadline=deadline));need(i.get('attempt')==a and i.get('name')==name and i.get('workerSHA256')==ACTIVE['workerSHA256'],'QA_R32_CLEANUP_INTENT_CHANGED');actual=check_resource(a,role,v)
            if not os.path.lexists(cp):record(a,role,v)
            c=json.loads(B.read_private(cp,deadline=deadline));need(c.get('id')==actual['id'] and c.get('configSHA256')==actual['configSHA256'] and c.get('creationIntentSHA256')==digest(B.read_private(ip,deadline=deadline)),'QA_R32_CLEANUP_RESOURCE_ID_CHANGED');r=docker(['rm','-f',actual['id']] if kind=='container' else [kind,'rm',actual['id']],deadline);need(r.returncode==0 and inspect(kind,name,deadline) is None,'QA_R32_CLEANUP_REMOVE_UNKNOWN');removed.append({'role':role,'id':actual['id']})
        except BaseException as e:errors.append({'role':role,'code':str(e) if re.fullmatch('QA_R32_[A-Z0-9_]+',str(e)) else 'QA_R32_CLEANUP_UNKNOWN'})
    try:empty_labels(a,deadline)
    except BaseException:errors.append({'role':'labels','code':'QA_R32_CLEANUP_LABELS_UNKNOWN'})
    value={'schemaVersion':1,'kind':'r32-truth-gate-owner-resource-reconciliation','attempt':a,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'removed':removed,'errors':errors,'resourceClaimsComplete':not errors,'cleanupIndependentlyVerified':False,'productAccepted':False};B.store(p/('reconcile-'+os.urandom(8).hex()+'.json'),value);return value
def run(a):
    load(a);p=ROOT/a;need(not os.path.lexists(p/'state.json'),'QA_R32_DUPLICATE_RUN_USE_CHECK');o=json.loads(B.read_private(p/'once.json'));need(o.get('attempt')==a and o.get('workerSHA256')==ACTIVE['workerSHA256'],'QA_R32_ONCE_CHANGED');owned=owner(a);state={'schemaVersion':1,'kind':'r32-truth-gate-execution-state','attempt':a,'runID':ACTIVE['runID'],'workerSHA256':ACTIVE['workerSHA256'],'activationSHA256':o['activationSHA256'],'owner':owned,'resources':names(a),'status':'running','created':{},'httpSQLDenominator':34,'additionalPGDenominator':4,'productCodeExecuted':False,'candidateCodeMayHaveExecuted':False,'apiProbeEntryStarted':False,'modelsInvoked':False,'rootPackageJavaScriptExecuted':False,'cleanupIndependentlyVerified':False,'productAccepted':False};sp=p/'state.json';B.store(sp,state)
    try:
        preflight(a);empty_labels(a);(p/'registry').mkdir(mode=0o700);(p/'evidence').mkdir(mode=0o700);os.chown(p/'evidence',1000,1000);initialize_env(a)
        lab=[]
        for k,val in labels(a).items():lab+=['--label',k+'='+val]
        state['created']['network']=create(a,'network',['network','create','--driver','bridge','--internal',*lab,names(a)['network']]);B.replace_state(sp,state)
        for role in VOLUMES:state['created'][role]=create(a,role,['volume','create','--driver','local',*lab,names(a)['volumes'][role]]);B.replace_state(sp,state)
        for role in ROLES:
            state['created'][role]=create(a,role,container_command(a,role));B.replace_state(sp,state);cid=state['created'][role]['id']
            if role=='api-probe':state['candidateCodeMayHaveExecuted']=True;state['productCodeExecuted']=None;B.replace_state(sp,state)
            r=docker(['start',cid]);need(r.returncode==0,'QA_R32_START_AMBIGUOUS_USE_CHECK')
            if role=='api-probe':state['apiProbeEntryStarted']=True;B.replace_state(sp,state)
            need(check_resource(a,role,inspect('container',cid))['id']==cid,'QA_R32_STARTED_ID_CHANGED')
            if role!='api-probe':
                deadline=time.monotonic()+60;cmd=['pg_isready','-U','jarvis_test','-d','jarvis_truth_gate_r32'] if role=='postgres' else ['redis-cli','ping'] if role=='redis' else None
                if cmd:
                    while True:
                        need(time.monotonic()<deadline,'QA_R32_DEPENDENCY_READY_TIMEOUT');r=docker(['exec',cid,*cmd],deadline)
                        if r.returncode==0 and (role!='redis' or r.stdout.strip()==b'PONG'):break
                        time.sleep(0.3)
        B.replace_state(sp,state);cid=state['created']['api-probe']['id'];wait=docker_wait(cid,1500);state['containerWait']=wait
        raw=bounded_logs(cid);B.store_bytes(p/'api-probe.log',raw);state['privateLog']={'bytes':len(raw),'sha256':digest(raw)};v=inspect('container',cid);checked=check_resource(a,'api-probe',v);need(checked['id']==cid and isinstance(v.get('State'),dict),'QA_R32_CONTAINER_ID_CHANGED');state['containerStopped']=v['State']['Running'] is False;state['containerExitCode']=v['State']['ExitCode'];state['status']='passed' if state['containerStopped'] and state['containerExitCode']==0 and wait['cliExitCode']==0 and wait['replyExitCode']==0 and not wait['timedOut'] else 'failed'
    except BaseException as e:state['status']='failed';state['errorCode']=str(e) if re.fullmatch('QA_R32_[A-Z0-9_]+',str(e)) else 'QA_R32_OPERATION_FAILED'
    finally:
        try:B.replace_state(sp,state)
        finally:
            try:state['resourceClaims']=reconcile(a)
            except BaseException:state['resourceClaims']={'resourceClaimsComplete':False,'code':'QA_R32_RECONCILE_FAILED'}
            B.replace_state(sp,state)
    return state
def bounded_logs(cid):
    p=subprocess.Popen(['/usr/bin/docker','logs',cid],stdout=subprocess.PIPE,stderr=subprocess.PIPE,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'});sel=selectors.DefaultSelector();sel.register(p.stdout,selectors.EVENT_READ);sel.register(p.stderr,selectors.EVENT_READ);parts=[];size=0;deadline=time.monotonic()+15
    try:
        while sel.get_map():
            need(time.monotonic()<deadline,'QA_R32_PRIVATE_LOG_TIMEOUT')
            for k,_ in sel.select(min(0.2,deadline-time.monotonic())):
                block=os.read(k.fileobj.fileno(),65536)
                if not block:sel.unregister(k.fileobj);continue
                size+=len(block);need(size<=4*1024**2,'QA_R32_PRIVATE_LOG_TOO_LARGE');parts.append(block)
        need(p.wait(timeout=max(0.1,deadline-time.monotonic()))==0,'QA_R32_PRIVATE_LOG_UNREADABLE');return b''.join(parts)
    finally:
        sel.close()
        if p.poll() is None:
            p.terminate()
            try:p.wait(timeout=2)
            except subprocess.TimeoutExpired:p.kill();p.wait(timeout=2)
        p.stdout.close();p.stderr.close()
def docker_wait(cid,seconds):
    try:r=subprocess.run(['/usr/bin/docker','wait',cid],capture_output=True,timeout=seconds,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'});return {'cliExitCode':r.returncode,'timedOut':False,'replyExitCode':int(r.stdout.strip()) if r.returncode==0 and re.fullmatch(b'[0-9]+',r.stdout.strip()) else None}
    except subprocess.TimeoutExpired:return {'cliExitCode':None,'timedOut':True,'replyExitCode':None}
def main():
    if sys.argv[1:] in [[],['--inspect']]:print(json.dumps({'kind':'r32-truth-gate-matrix-worker-preparation','ready':False,'remoteOperations':False,'httpSQLExecuted':0,'additionalPGExecuted':0,'modelsInvoked':False}));return
    need(len(sys.argv)==3 and sys.argv[1] in ['--launch','--run','--check','--reconcile-cleanup'] and attempt_valid(sys.argv[2]),'QA_R32_ARGUMENTS_INVALID');a=sys.argv[2]
    if sys.argv[1]=='--launch':v=launch(a)
    elif sys.argv[1]=='--run':v=run(a)
    elif sys.argv[1]=='--reconcile-cleanup':v=reconcile(a)
    else:load(a);v=json.loads(B.read_private(ROOT/a/'state.json'))
    print(json.dumps(v))
if __name__=='__main__':main()
