"""Finite, root byte-only R32 artifact owner. Never executes package code.

The reviewed R2 copier remains an immutable input. Only its finite alarm changes
from 150 to 900 seconds; per-file/directory fsync and every source/link rule stay.
No partial tree is removed or resumed. StopPost records lifecycle, not cleanup.
"""
import hashlib,json,os,re,stat,subprocess,sys,time,types
from pathlib import Path

BASE=Path('/var/lib/jarvis-development/101/r32-artifact-owner-r3')
ARTIFACT_BASE=Path('/var/lib/jarvis-development/101/r32-truth-artifacts')
CORE_SHA='1d7208c35be27ffb657457dce4d758b51e9473b2dd172db6c74916e674013d10'
INPUT_SHA='acaa2073b6a0be14eb05888713a022cada63010b208aa25c908b4e942aba28fe'
TREE_SHA='9e83e22a1ebfcdfc699876860879d8acefe220d3abf49e802333719b549299e3'
OLD_NONCE='10f408804b6efae7e0622f19e2e4bfe4'
H=re.compile('[a-f0-9]{64}')
PHASES={'admitting','protecting-old-partial','qualifying','copying','installing-supplement','freezing-directory-modes','verifying-output','finished','failed'}

def need(v,c):
    if not v:raise RuntimeError(c)
def digest(v):return hashlib.sha256(v).hexdigest()
def compact(v):return json.dumps(v,ensure_ascii=False,separators=(',',':')).encode()
def key(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def nonce_ok(a):return isinstance(a,str) and re.fullmatch('[a-f0-9]{32}',a) is not None and a!=OLD_NONCE
def unit(a):need(nonce_ok(a),'R32_OWNER_NONCE_INVALID');return 'jarvis-r32-artifact-r3-'+a+'-owner.service'
def root_fd(path,mode=None):
    need(str(path).startswith('/'),'R32_OWNER_ABSOLUTE_PATH_REQUIRED');fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        for name in Path(path).parts[1:]:
            s=os.stat(name,dir_fd=fd,follow_symlinks=False);need(stat.S_ISDIR(s.st_mode) and s.st_uid==s.st_gid==0 and not s.st_mode&0o022,'R32_OWNER_PARENT_UNTRUSTED');child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
            try:need(key(s)==key(os.fstat(child)),'R32_OWNER_PARENT_CHANGED')
            except BaseException:os.close(child);raise
            os.close(fd);fd=child
        if mode is not None:need(stat.S_IMODE(os.fstat(fd).st_mode)==mode,'R32_OWNER_DIRECTORY_MODE_CHANGED')
        return fd
    except BaseException:os.close(fd);raise
def read(path,limit=64*1024**2):
    d=root_fd(Path(path).parent)
    try:
        s=os.stat(Path(path).name,dir_fd=d,follow_symlinks=False);need(stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and not s.st_mode&0o022 and 0<=s.st_size<=limit,'R32_OWNER_FILE_UNTRUSTED');fd=os.open(Path(path).name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=d)
        try:
            need(key(s)==key(os.fstat(fd)),'R32_OWNER_FILE_REPLACED');parts=[];total=0
            while True:
                block=os.read(fd,65536)
                if not block:break
                total+=len(block);need(total<=s.st_size,'R32_OWNER_FILE_GREW');parts.append(block)
            need(total==s.st_size and key(s)==key(os.fstat(fd))==key(os.stat(Path(path).name,dir_fd=d,follow_symlinks=False)),'R32_OWNER_FILE_CHANGED');return b''.join(parts)
        finally:os.close(fd)
    finally:os.close(d)
def write_all(fd,body):
    view=memoryview(body)
    while view:
        n=os.write(fd,view);need(type(n) is int and 0<n<=len(view),'R32_OWNER_SHORT_WRITE');view=view[n:]
def store(path,body,replace=False):
    d=root_fd(Path(path).parent,0o700);name=Path(path).name;tmp=name+'.'+str(os.getpid())+'.tmp' if replace else name
    try:
        fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=d)
        try:write_all(fd,body);os.fsync(fd)
        finally:os.close(fd)
        if replace:
            if name in os.listdir(d):
                s=os.stat(name,dir_fd=d,follow_symlinks=False);need(stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600,'R32_OWNER_EXISTING_STATE_UNTRUSTED')
            os.replace(tmp,name,src_dir_fd=d,dst_dir_fd=d)
        os.fsync(d)
    finally:os.close(d)
def identity(pid):
    body=Path('/proc/'+str(pid)+'/stat').read_text();f=body[body.rfind(')')+2:].split();need(len(f)>=20 and f[19].isdigit(),'R32_OWNER_PROC_IDENTITY_INVALID')
    return {'pid':pid,'startTicks':f[19],'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip()}
def owner_contract(a,worker):
    r=subprocess.run(['/usr/bin/systemctl','show',unit(a),'--property=Id,LoadState,ActiveState,MainPID,ControlGroup,RuntimeMaxUSec,TimeoutStopUSec,KillMode,Restart,ExecStopPost'],capture_output=True,text=True,timeout=10,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'});need(r.returncode==0,'R32_OWNER_SYSTEMD_READ_INCOMPLETE');v=dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x);cg='/system.slice/'+unit(a)
    need(v.get('Id')==unit(a) and v.get('LoadState')=='loaded' and v.get('ActiveState') in ['active','activating'] and v.get('MainPID')==str(os.getpid()) and v.get('ControlGroup')==cg and v.get('RuntimeMaxUSec')=='15min' and v.get('TimeoutStopUSec')=='2min' and v.get('KillMode')=='control-group' and v.get('Restart')=='no','R32_OWNER_SYSTEMD_CONTRACT_CHANGED')
    post=re.fullmatch(r'\{\s*path=([^;{}]+?)\s*;\s*argv\[\]=(.*?)\s*;\s*ignore_errors=(yes|no)\s*;[^{}]*\}',v.get('ExecStopPost',''));need(post and post.group(1)=='/usr/bin/python3' and post.group(2).split()==['/usr/bin/python3',str(worker),'--owner-stopped',a] and post.group(3)=='no','R32_OWNER_STOPPOST_CHANGED')
    groups=[x.split(':',2)[2] for x in Path('/proc/self/cgroup').read_text().splitlines() if x.count(':')==2];need(cg in groups,'R32_OWNER_CGROUP_CHANGED');return {**identity(os.getpid()),'unit':unit(a),'controlGroup':cg,'runtimeMaxSec':900,'stopTimeoutSec':120,'killMode':'control-group','restart':'no'}
def inputs(a,launch=False):
    need(os.geteuid()==os.getegid()==0 and nonce_ok(a),'R32_OWNER_ROOT_SCOPE_REQUIRED');p=BASE/a;fd=root_fd(p,0o700);os.close(fd);c=p/'control';fd=root_fd(c,0o700);os.close(fd);raw=read(c/'activation.json',32768);v=json.loads(raw)
    need(set(v)=={'schemaVersion','kind','nonce','workerSHA256','coreSHA256','inputSHA256','requestSHA256','reconciliationSHA256','reconciliationEvidenceSHA256','protectionSHA256','reviewSHA256'} and v['schemaVersion']==1 and v['kind']=='r32-artifact-owner-exact-activation-r3' and v['nonce']==a and v['coreSHA256']==CORE_SHA and v['inputSHA256']==INPUT_SHA and all(isinstance(v[k],str) and H.fullmatch(v[k]) for k in v if k.endswith('SHA256')),'R32_OWNER_ACTIVATION_CHANGED')
    worker=Path(__file__);need(digest(read(worker,150000))==v['workerSHA256'],'R32_OWNER_WORKER_CHANGED');core=read(c/'r2-byte-controller.py',150000);need(digest(core)==CORE_SHA,'R32_OWNER_ORIGINAL_CORE_CHANGED');request_raw=read(c/'request.json');need(digest(request_raw)==v['requestSHA256'],'R32_OWNER_REQUEST_CHANGED');req=json.loads(request_raw)
    need(set(req)=={'scope','action','nonce','sourceIndex','expectedInspection','programSHA256','packageSupplement'} and req['action']=='freeze' and req['nonce']==a and req['programSHA256']==v['workerSHA256'] and req['scope']['freezeRoot']==str(ARTIFACT_BASE),'R32_OWNER_REQUEST_SCOPE_CHANGED')
    import base64
    old=base64.b64decode(req['expectedInspection']['_rawBase64'],validate=True);need(digest(old)==INPUT_SHA,'R32_OWNER_ACTUAL_INPUT_CHANGED');qual=json.loads(old);need(qual.get('prospectiveTreeSHA256')==TREE_SHA and qual.get('runtime',{}).get('legacyWorkEntries')==47822 and qual['runtime']['legacyWorkMetadataSHA256']=='461b6c1b791f74dce4b7dcf520d12f12a87ec9b2ba6e6f3c634769af221227ab','R32_OWNER_INPUT_BASIS_CHANGED')
    for name,k in [('reconciliation.json','reconciliationSHA256'),('reconciliation-evidence.json','reconciliationEvidenceSHA256'),('protection.json','protectionSHA256'),('review.json','reviewSHA256')]:need(digest(read(c/name))==v[k],'R32_OWNER_CONTROL_BYTES_CHANGED')
    recon=json.loads(read(c/'reconciliation.json'));need(recon.get('schemaVersion')==1 and recon.get('kind')=='r32-failed-byte-attempt-readonly-reconciliation' and recon.get('nonce')==OLD_NONCE and recon.get('ready') is True and all(recon.get(k) is True for k in ['originalInspectionUnchanged','source625FullyVerified','partialTwoCompleteByteReadbacks','processAndSocketScopeClean','fullProtectedInventoryAndQueueVerified','oldOnceJournalUnchanged']) and recon.get('publishedTreePresent') is False and recon.get('partialLinkClosureQualified') is False and recon.get('immutableArtifactQualified') is False and recon.get('remoteMutationsPerformed') is False and recon.get('modelsInvoked') is False and recon.get('actualObservation',{}).get('sha256')==v['reconciliationEvidenceSHA256'],'R32_OWNER_ACTUAL_RECONCILIATION_REQUIRED')
    protection=json.loads(read(c/'protection.json'))
    need(protection.get('kind')=='software-factory-r29-new-protection-contract-observation' and protection.get('ready') is True and all(protection.get(k) is True for k in ['protectedInventoryFullyVerified','fullQueueSQLVerified','nodeACKIdle','queueIdle','profileUnchanged']) and protection.get('modelsInvoked') is False,'R32_OWNER_FRESH_PROTECTION_REQUIRED')
    import datetime
    try:at=datetime.datetime.fromisoformat(protection['at'].replace('Z','+00:00')).timestamp()
    except (TypeError,KeyError,ValueError):raise RuntimeError('R32_OWNER_PROTECTION_TIME_INVALID')
    if launch:need(-30<=time.time()-at<300,'R32_OWNER_PROTECTION_STALE')
    if launch:
        try:recon_at=datetime.datetime.fromisoformat(recon['at'].replace('Z','+00:00')).timestamp()
        except (TypeError,KeyError,ValueError):raise RuntimeError('R32_OWNER_RECONCILIATION_TIME_INVALID')
        need(-30<=time.time()-recon_at<300,'R32_OWNER_RECONCILIATION_STALE')
    review=json.loads(read(c/'review.json'));need(review.get('workerSHA256')==v['workerSHA256'] and review.get('staticPreparationReady') is True and review.get('remainingP0P1')==0 and review.get('actualFrozenArtifact') is False,'R32_OWNER_REVIEW_UNPROVEN')
    return p,v,core,req
def stopped(a):
    p,v,_,_=inputs(a);owner_raw=read(p/'owner.json',32768);o=json.loads(owner_raw);need(o.get('unit')==unit(a) and o.get('controlGroup')=='/system.slice/'+unit(a) and o.get('workerSHA256')==v['workerSHA256'],'R32_OWNER_STOP_IDENTITY_UNBOUND')
    service=os.environ.get('SERVICE_RESULT');allowed={'success','exit-code','signal','timeout','watchdog','protocol','resources','start-limit-hit'}
    store(p/'lifecycle.json',compact({'schemaVersion':1,'kind':'r32-byte-owner-stop-post-r3','nonce':a,'owner':o,'ownerSHA256':digest(owner_raw),'serviceResult':service if service in allowed else 'unknown','observedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'partialTreesRemoved':False,'copyResumed':False,'cleanupIndependentlyVerified':False,'productAccepted':False}))
def run(a):
    p,v,source,req=inputs(a,launch=True);o={**owner_contract(a,Path(__file__)),'workerSHA256':v['workerSHA256'],'activationSHA256':digest(read(p/'control'/'activation.json'))};store(p/'owner.json',compact(o));source=source.decode('utf8');need(source.count('signal.alarm(150)')==1,'R32_OWNER_CORE_ALARM_DRIFT');patched=source.replace('signal.alarm(150)','signal.alarm(900)');core=types.ModuleType('reviewed_r32_byte_copy_r3');core.__file__=str(p/'control'/'r2-byte-controller.py');exec(compile(patched,core.__file__,'exec'),core.__dict__)
    state={'schemaVersion':1,'kind':'r32-artifact-owner-progress-r3','nonce':a,'workerSHA256':v['workerSHA256'],'owner':o,'phase':'admitting','status':'running','filesRead':0,'directoriesCopied':0,'readBytes':0,'actualFrozenArtifact':False,'packageCodeExecuted':False,'modelsInvoked':False,'productAccepted':False};last=[0.0]
    def checkpoint(force=False):
        now=time.monotonic()
        if force or now-last[0]>=2:
            need(state['phase'] in PHASES,'R32_OWNER_PROGRESS_PHASE_INVALID');state['updatedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());store(p/'progress.json',compact(state),True);last[0]=now
    original_read=core.read_file;original_copy=core.copy_tree;original_install=core.install_supplement;original_modes=core.freeze_directories;original_scan=core.double_scan
    def file_read(*args,**kwargs):
        value=original_read(*args,**kwargs);state['filesRead']+=1;state['readBytes']+=value[0]['bytes'];checkpoint();return value
    def copy(*args,**kwargs):state['phase']='copying';state['directoriesCopied']+=1;checkpoint();return original_copy(*args,**kwargs)
    def install(*args,**kwargs):state['phase']='installing-supplement';checkpoint(True);return original_install(*args,**kwargs)
    def modes(*args,**kwargs):state['phase']='freezing-directory-modes';checkpoint();return original_modes(*args,**kwargs)
    def scan(*args,**kwargs):
        if kwargs.get('immutable') is True:state['phase']='verifying-output';checkpoint(True)
        return original_scan(*args,**kwargs)
    core.read_file=file_read;core.copy_tree=copy;core.install_supplement=install;core.freeze_directories=modes;core.double_scan=scan
    def old_partial():
        chain=core.open_chain(str(ARTIFACT_BASE/OLD_NONCE));original_links=core.validate_input_links
        try:
            # Failed old bytes are protected inventory, never qualified as an artifact.
            core.validate_input_links=lambda _:None
            value=core.double_scan(chain[-1][0]);core.check_chain(chain);return value
        finally:core.validate_input_links=original_links;core.close_chain(chain)
    try:
        state['phase']='protecting-old-partial';checkpoint(True);old_expected=json.loads(read(p/'control'/'reconciliation-evidence.json'))['partialAttempt'];old_before=old_partial();need(old_before==old_expected,'R32_OWNER_OLD_PARTIAL_CHANGED_BEFORE_COPY');state['oldPartialBeforeSHA256']=digest(compact(old_before));state['phase']='qualifying';checkpoint(True)
        result=core.main(req);need(result.get('ready') is True and result.get('nonce')==a and result.get('artifact',{}).get('treeSHA256')==TREE_SHA,'R32_OWNER_COMPLETE_OUTPUT_REQUIRED');state['phase']='protecting-old-partial';checkpoint(True);old_after=old_partial();need(old_after==old_before,'R32_OWNER_OLD_PARTIAL_CHANGED_AFTER_COPY');result['oldPartialPreserved']=True;result['oldPartialInventorySHA256']=digest(compact(old_after));body=compact(result);store(p/'result.json',body);state.update({'phase':'finished','status':'frozen','actualFrozenArtifact':True,'resultSHA256':digest(body),'resultBytes':len(body),'oldPartialAfterSHA256':digest(compact(old_after))});checkpoint(True)
    except BaseException as error:
        state.update({'phase':'failed','status':'failed','actualFrozenArtifact':False,'errorCode':str(error) if re.fullmatch('R32_(ARTIFACT|OWNER)_[A-Z0-9_]+',str(error)) else 'R32_OWNER_BYTE_OPERATION_INCOMPLETE'})
        try:checkpoint(True)
        finally:raise

if __name__=='__main__':
    if len(sys.argv)==3 and sys.argv[1] in ['--run','--owner-stopped']:
        (run if sys.argv[1]=='--run' else stopped)(sys.argv[2])
    else:raise RuntimeError('R32_OWNER_FIXED_ARGUMENTS_REQUIRED')
