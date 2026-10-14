"""Exact post-failure resource recovery. No product code, restart or forced rm.

New recovery evidence never repairs the original missing creation record.
"""
import base64, datetime, hashlib, json, os, re, signal, stat, subprocess, sys, time
from pathlib import Path

ATTEMPT='393a2f452c36993061f271475f2bffda'
RUN='d0c9e0b4b9c40d1be04b0307fd57dda56d8b38b1'
ROOT='/var/lib/jarvis-development/101/r32-truth-gate/'+ATTEMPT
BASE='/var/lib/jarvis-development/101/r32-matrix-failure-recovery'
PREFIX='jarvis-tg-r32-'+ATTEMPT
PGID='889502be55b878981ffe7f4c499488df82b79d422b65bfa3378a500a893bef0d'
PGIMAGE='sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d'
CONFIG_SHA='7e784b10fe705f48742ecd22be5cbe62dfb075cf97593d632ca39ad68b36a7a5'
HOST_SHA='2149ade54aa665adef55417a5265794362214a4ff68b04411143af204d9f6ea0'
VOLUME_SHA='c1b39383d9385c9512cd8de1ae0fc57b875a2d4bbdfb18df2bbf74691bf2c3a3'
DIAG_SHA='3c14e8d310b78bb77bb2a71923da930fb6d3ec150d532b9b49ce965c2b2b0d4f'
LABELS={'jarvis.truthgate.r32.attempt':ATTEMPT,'jarvis.truthgate.r32.kind':'http-sql-validation'}
ROLES={'postgres':'container','redis':'container','minio':'container','api-probe':'container','network':'network','postgres-data':'volume','redis-data':'volume','minio-data':'volume'}
CAPS={'CHOWN','DAC_OVERRIDE','FOWNER','SETUID','SETGID'}
H=re.compile('[a-f0-9]{64}')
def need(v,c):
    if not v:raise RuntimeError(c)
def sha(b):return hashlib.sha256(b).hexdigest()
def canonical(v):return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def key(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def caps_match(values):
    if not isinstance(values,list) or len(values)!=5:return False
    normalized=[]
    for v in values:
        if not isinstance(v,str) or not re.fullmatch('(?:CAP_)?(?:CHOWN|DAC_OVERRIDE|FOWNER|SETUID|SETGID)',v):return False
        normalized.append(v[4:] if v.startswith('CAP_') else v)
    return len(set(normalized))==5 and set(normalized)==CAPS
def held(path):
    fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);chain=[(fd,None,None,key(os.fstat(fd)))]
    try:
        for n in Path(path).parts[1:]:
            parent=chain[-1][0];s=os.stat(n,dir_fd=parent,follow_symlinks=False)
            need(stat.S_ISDIR(s.st_mode) and s.st_uid==s.st_gid==0 and not s.st_mode&0o022,'R32_RECOVERY_DIRECTORY_UNTRUSTED')
            f=os.open(n,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
            try:need(key(s)==key(os.fstat(f)),'R32_RECOVERY_DIRECTORY_REPLACED')
            except BaseException:os.close(f);raise
            chain.append((f,parent,n,key(s)))
        return chain
    except BaseException:close_chain(chain);raise
def close_chain(chain):
    for f,_,_,_ in reversed(chain):os.close(f)
def check_chain(chain):
    for f,parent,n,k in chain:need(key(os.fstat(f))==k and (parent is None or key(os.stat(n,dir_fd=parent,follow_symlinks=False))==k),'R32_RECOVERY_DIRECTORY_CHANGED')
def owned_directory_write_done(chain,created_directory=False):
    # Only our last held directory may acquire new entry bookkeeping.
    f,parent,n,before=chain[-1];after=key(os.fstat(f))
    need(after[:5]==before[:5] and after[5]==before[5]+(1 if created_directory else 0),'R32_RECOVERY_DIRECTORY_CHANGED')
    need(parent is None or key(os.stat(n,dir_fd=parent,follow_symlinks=False))==after,'R32_RECOVERY_DIRECTORY_REPLACED')
    chain[-1]=(f,parent,n,after);check_chain(chain)
def read(path,expected=None):
    chain=held(str(Path(path).parent))
    try:
        parent=chain[-1][0];n=Path(path).name;s=os.stat(n,dir_fd=parent,follow_symlinks=False)
        need(stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and not s.st_mode&0o022 and s.st_size<=4*1024**2,'R32_RECOVERY_FILE_UNTRUSTED')
        f=os.open(n,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
        try:
            need(key(s)==key(os.fstat(f)),'R32_RECOVERY_FILE_REPLACED');parts=[];size=0
            while True:
                b=os.read(f,65536)
                if not b:break
                size+=len(b);need(size<=s.st_size,'R32_RECOVERY_FILE_GREW');parts.append(b)
            raw=b''.join(parts);need(size==s.st_size and key(s)==key(os.fstat(f))==key(os.stat(n,dir_fd=parent,follow_symlinks=False)),'R32_RECOVERY_FILE_CHANGED')
            if expected:need(key(s)==expected['metadata'] and sha(raw)==expected['sha256'],'R32_RECOVERY_ORIGINAL_RECORD_CHANGED')
            check_chain(chain);return raw
        finally:os.close(f)
    finally:close_chain(chain)
def wx(path,raw):
    chain=held(str(Path(path).parent))
    try:
        parent=chain[-1][0];f=os.open(Path(path).name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=parent)
        try:
            view=memoryview(raw)
            while view:
                n=os.write(f,view);need(n>0,'R32_RECOVERY_SHORT_WRITE');view=view[n:]
            os.fchmod(f,0o600);os.fsync(f)
        finally:os.close(f)
        os.fsync(parent);owned_directory_write_done(chain)
    finally:close_chain(chain)
def name(role):return PREFIX+'-'+('net' if role=='network' else role)
def docker(args):
    r=subprocess.run(['/usr/bin/docker',*args],capture_output=True,timeout=15,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':'/root','DOCKER_API_VERSION':'1.49'})
    need(len(r.stdout)<=4*1024**2 and len(r.stderr)<=4*1024**2,'R32_RECOVERY_DOCKER_LIMIT');return r
def inspect(role):
    kind=ROLES[role];r=docker([kind,'inspect',name(role)])
    if r.returncode==1:
        allowed=['Error: No such object: '+name(role),'Error response from daemon: No such '+kind+': '+name(role),'Error: No such '+kind+': '+name(role)]
        if kind=='network':allowed.append('Error response from daemon: network '+name(role)+' not found')
        if kind=='volume':allowed.append('Error response from daemon: get '+name(role)+': no such volume')
        need(r.stdout.strip()==b'[]' and r.stderr.decode('utf8','strict').strip() in allowed,'R32_RECOVERY_ABSENCE_UNKNOWN');return None
    need(r.returncode==0,'R32_RECOVERY_INSPECT_INCOMPLETE');rows=json.loads(r.stdout)
    need(isinstance(rows,list) and len(rows)==1 and isinstance(rows[0],dict),'R32_RECOVERY_INSPECT_SHAPE');return rows[0]
def label_scope(pg_present,volume_present):
    for filters in [['label=jarvis.truthgate.r32.attempt='+ATTEMPT],['label=jarvis.truthgate.r32.attempt='+ATTEMPT,'label=jarvis.truthgate.r32.kind=http-sql-validation']]:
        for kind,args,expected in [('container',['ps','-aq','--no-trunc'],[PGID] if pg_present else []),('network',['network','ls','-q','--no-trunc'],[]),('volume',['volume','ls','-q'],[name('postgres-data')] if volume_present else [])]:
            r=docker(args+sum((['--filter',f] for f in filters),[]));need(r.returncode==0 and sorted(r.stdout.decode('utf8','strict').splitlines())==expected,'R32_RECOVERY_LABEL_SCOPE_CHANGED')
def owner_gone():
    need(not os.path.lexists('/proc/2495824'),'R32_RECOVERY_ORIGINAL_OWNER_PRESENT')
    unit=PREFIX+'-owner.service';r=subprocess.run(['/usr/bin/systemctl','show',unit,'--property=Id,LoadState,ActiveState,MainPID,ControlGroup'],capture_output=True,text=True,timeout=10,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'})
    need(r.returncode==0,'R32_RECOVERY_OWNER_UNKNOWN');v=dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x)
    need(v.get('Id')==unit and v.get('MainPID')=='0' and v.get('ActiveState') in ['inactive','failed'] and v.get('LoadState') in ['loaded','not-found'] and v.get('ControlGroup')=='','R32_RECOVERY_OWNER_ACTIVE')
    need(not os.path.lexists('/sys/fs/cgroup/system.slice/'+unit),'R32_RECOVERY_OWNER_CGROUP_PRESENT')
def original_records(diag):
    expected=diag['files'];need(len(expected)==14 and all(k.startswith(ROOT+'/') for k in expected),'R32_RECOVERY_RECORD_SCOPE_CHANGED')
    allowed={'once.json','ownership.json','state.json','reconcile-193890d9816939f8.json','reconcile-d71aeee723765b4c.json','registry/network.intent.json','registry/network.created.json','registry/postgres-data.intent.json','registry/postgres-data.created.json','registry/redis-data.intent.json','registry/redis-data.created.json','registry/minio-data.intent.json','registry/minio-data.created.json','registry/postgres.intent.json'}
    need({k[len(ROOT)+1:] for k in expected}==allowed,'R32_RECOVERY_RECORD_SCOPE_CHANGED')
    raw={k:read(k,v) for k,v in expected.items()};need(not os.path.lexists(ROOT+'/registry/postgres.created.json'),'R32_RECOVERY_OLD_CREATED_RECORD_APPEARED')
    s=json.loads(raw[ROOT+'/state.json']);need(s.get('status')=='failed' and s.get('attempt')==ATTEMPT and s.get('runID')==RUN and s.get('errorCode')=='QA_R32_CONTAINER_ISOLATION_CHANGED','R32_RECOVERY_ORIGINAL_TERMINAL_CHANGED')
    return {k:sha(v) for k,v in raw.items()}
def pg_bound(v):
    need(v is not None and v.get('Id')==PGID and v.get('Name')=='/'+name('postgres') and v.get('Created')=='2026-10-12T23:12:33.226647699Z' and v.get('Image')==PGIMAGE,'R32_RECOVERY_CURRENT_CONTAINER_ID_CHANGED')
    need(v.get('State',{}).get('Status')=='created' and v['State'].get('Running') is False and v['State'].get('Pid')==0 and v['State'].get('StartedAt')==v['State'].get('FinishedAt')=='0001-01-01T00:00:00Z','R32_RECOVERY_CONTAINER_HAS_RUN_OR_ACTIVE')
    need(v.get('Config',{}).get('Labels')==LABELS and sha(canonical(v['Config']))==CONFIG_SHA and sha(canonical(v.get('HostConfig')))==HOST_SHA and caps_match(v['HostConfig'].get('CapAdd')),'R32_RECOVERY_CONTAINER_CONFIG_CHANGED')
def volume_bound(v):
    need(v is not None and v.get('Name')==name('postgres-data') and v.get('CreatedAt')=='2026-10-13T07:12:33+08:00' and v.get('Driver')=='local' and v.get('Options') is None and v.get('Labels')==LABELS and sha(canonical(v))==VOLUME_SHA,'R32_RECOVERY_CURRENT_VOLUME_CHANGED')
def current(pg_present,volume_present):
    values={r:inspect(r) for r in ROLES}
    if pg_present is None:pg_present=values['postgres'] is not None
    if volume_present is None:volume_present=values['postgres-data'] is not None
    for role,v in values.items():
        if role=='postgres' and pg_present:pg_bound(v)
        elif role=='postgres-data' and volume_present:volume_bound(v)
        else:need(v is None,'R32_RECOVERY_UNEXPECTED_PRESENT_RESOURCE')
    label_scope(pg_present,volume_present);owner_gone();return {'postgresPresent':pg_present,'postgresVolumePresent':volume_present}
def main(p):
    need(isinstance(p,dict) and set(p)=={'action','recoveryNonce','originalAttempt','originalRunID','programSHA256','callerSHA256','reviewSHA256','protectionSHA256','preflightSHA256','diagnosticRawBase64','reviewRawBase64','protectionRawBase64','preflightRawBase64'} and os.geteuid()==os.getegid()==0 and p.get('action') in ['inspect','execute','check'] and re.fullmatch('[a-f0-9]{32}',p.get('recoveryNonce','')) and p['recoveryNonce']!=ATTEMPT,'R32_RECOVERY_FIXED_REQUEST_REQUIRED')
    need(p.get('originalAttempt')==ATTEMPT and p.get('originalRunID')==RUN and all(isinstance(p.get(k),str) and H.fullmatch(p[k]) for k in ['programSHA256','callerSHA256','reviewSHA256','protectionSHA256','preflightSHA256']),'R32_RECOVERY_FIXED_REQUEST_REQUIRED')
    signal.signal(signal.SIGALRM,lambda *_:need(False,'R32_RECOVERY_TIME_LIMIT'));signal.alarm(90)
    review_raw=base64.b64decode(p['reviewRawBase64'],validate=True);protection_raw=base64.b64decode(p['protectionRawBase64'],validate=True)
    need(len(review_raw)<=1024**2 and len(protection_raw)<=4*1024**2 and sha(review_raw)==p['reviewSHA256'] and sha(protection_raw)==p['protectionSHA256'],'R32_RECOVERY_REVIEW_OR_PROTECTION_BYTES_CHANGED')
    review=json.loads(review_raw);protection=json.loads(protection_raw)
    need(review.get('kind')=='r32-failed-matrix-resource-recovery-independent-local-review' and review.get('programSHA256')==p['programSHA256'] and review.get('callerSHA256')==p['callerSHA256'] and review.get('remainingP0P1')==0 and review.get('staticPreparationReady') is True and review.get('remoteOperations') is False,'R32_RECOVERY_REVIEW_UNPROVEN')
    need(protection.get('kind')=='software-factory-r29-new-protection-contract-observation' and protection.get('ready') is True and all(protection.get(k) is True for k in ['protectedInventoryFullyVerified','fullQueueSQLVerified','nodeACKIdle','queueIdle','profileUnchanged']) and protection.get('modelsInvoked') is False,'R32_RECOVERY_PROTECTION_UNPROVEN')
    try:protection_at=datetime.datetime.fromisoformat(protection['at'].replace('Z','+00:00')).timestamp()
    except (KeyError,TypeError,ValueError):raise RuntimeError('R32_RECOVERY_PROTECTION_TIME_INVALID')
    need(-30<=time.time()-protection_at<300,'R32_RECOVERY_PROTECTION_STALE')
    preflight_raw=base64.b64decode(p['preflightRawBase64'],validate=True);need(len(preflight_raw)<=4*1024**2 and sha(preflight_raw)==p['preflightSHA256'],'R32_RECOVERY_PREFLIGHT_BYTES_CHANGED');preflight=json.loads(preflight_raw)
    need(preflight.get('kind')=='software-factory-r32-truth-gate-recovery-preflight' and preflight.get('attempt')==ATTEMPT and preflight.get('runID')==RUN and all(preflight.get(k) is True for k in ['ready','currentProcessScopeClean','currentResourcesRemain','originalRecordsUnchanged','unknownOriginalCreationIdentityPreserved']) and all(preflight.get(k) is False for k in ['originalMatrixCleanupQualified','cleanupIndependentlyVerified','modelsInvoked','resourcesRemoved','remoteMutations']),'R32_RECOVERY_CURRENT_PROCESS_SCOPE_UNPROVEN')
    need(all(isinstance(preflight.get('evidence',{}).get(k),dict) and H.fullmatch(preflight['evidence'][k].get('sha256','')) for k in ['host','protectionBefore','protectionAfter']),'R32_RECOVERY_PREFLIGHT_EVIDENCE_MISSING')
    try:preflight_at=datetime.datetime.fromisoformat(preflight['at'].replace('Z','+00:00')).timestamp()
    except (KeyError,TypeError,ValueError):raise RuntimeError('R32_RECOVERY_PREFLIGHT_TIME_INVALID')
    if p['action']!='check':need(-30<=time.time()-preflight_at<300,'R32_RECOVERY_PREFLIGHT_STALE')
    raw=base64.b64decode(p['diagnosticRawBase64'],validate=True);need(len(raw)<=8*1024**2 and sha(raw)==DIAG_SHA,'R32_RECOVERY_REAL_DIAGNOSTIC_REQUIRED');wrapped=json.loads(raw);need(wrapped.get('status')==0,'R32_RECOVERY_DIAGNOSTIC_INCOMPLETE');diag=json.loads(wrapped['stdout']);need(diag.get('attempt')==ATTEMPT and diag.get('runID')==RUN and diag.get('twoPrivateReadbacks') is True,'R32_RECOVERY_REAL_DIAGNOSTIC_REQUIRED')
    before=original_records(diag);private=BASE+'/'+p['recoveryNonce'];result_path=private+'/result.json';intent_path=private+'/intent.json'
    if p['action']=='check':
        result_raw=read(result_path);intent_raw=read(intent_path);result=json.loads(result_raw);intent=json.loads(intent_raw)
        need(result.get('recoveryNonce')==p['recoveryNonce'] and result.get('programSHA256')==p['programSHA256'] and result.get('callerSHA256')==p['callerSHA256'] and result.get('intentSHA256')==sha(intent_raw) and intent.get('recoveryNonce')==p['recoveryNonce'] and intent.get('originalAttempt')==ATTEMPT and intent.get('originalRunID')==RUN and intent.get('diagnosticSHA256')==DIAG_SHA and intent.get('programSHA256')==p['programSHA256'] and intent.get('callerSHA256')==p['callerSHA256'],'R32_RECOVERY_RESULT_UNBOUND')
        current_scope=current(None,None);need(original_records(diag)==before,'R32_RECOVERY_ORIGINAL_RECORD_CHANGED');signal.alarm(0);return {'namespace':private,'rootIntent':{'path':intent_path,'sha256':sha(intent_raw)},'rootResult':{'path':result_path,'sha256':sha(result_raw)},'result':result,'currentResourcePresence':current_scope,'readOnly':True}
    current(True,True)
    if p['action']=='inspect':signal.alarm(0);return {'readyForExactRecovery':True,'unknownOriginalCreationIdentityPreserved':True,'originalMatrixCleanupQualified':False,'readOnly':True}
    # New namespace and intent must never overwrite or amend the failed job.
    parent=held(str(Path(BASE).parent))
    try:
        fd=parent[-1][0];base_name=Path(BASE).name
        if not os.path.lexists(BASE):os.mkdir(base_name,0o700,dir_fd=fd);os.fsync(fd);owned_directory_write_done(parent,True)
        else:check_chain(parent)
    finally:close_chain(parent)
    chain=held(BASE)
    try:
        fd=chain[-1][0];need(stat.S_IMODE(os.fstat(fd).st_mode)==0o700,'R32_RECOVERY_NAMESPACE_UNTRUSTED');os.mkdir(p['recoveryNonce'],0o700,dir_fd=fd);os.fsync(fd);owned_directory_write_done(chain,True)
    finally:close_chain(chain)
    control_chain=held(private)
    try:os.mkdir('control',0o700,dir_fd=control_chain[-1][0]);os.fsync(control_chain[-1][0]);owned_directory_write_done(control_chain,True)
    finally:close_chain(control_chain)
    wx(private+'/control/diagnostic.json',raw);wx(private+'/control/review.json',review_raw);wx(private+'/control/protection.json',protection_raw);wx(private+'/control/preflight.json',preflight_raw)
    intent={'schemaVersion':1,'kind':'r32-failed-matrix-resource-recovery-intent','originalAttempt':ATTEMPT,'originalRunID':RUN,'recoveryNonce':p['recoveryNonce'],'programSHA256':p['programSHA256'],'callerSHA256':p['callerSHA256'],'reviewSHA256':p['reviewSHA256'],'diagnosticSHA256':DIAG_SHA,'protectionSHA256':p['protectionSHA256'],'preflightSHA256':p['preflightSHA256'],'postgresID':PGID,'postgresVolume':name('postgres-data'),'originalRecordsSHA256':sha(canonical(before)),'unknownOriginalCreationIdentityPreserved':True,'originalMatrixCleanupQualified':False,'removeRunningContainersPermitted':False}
    intent_raw=canonical(intent);wx(intent_path,intent_raw);removed=[];errors=[]
    try:
        need(original_records(diag)==before,'R32_RECOVERY_ORIGINAL_RECORD_CHANGED');current(True,True);need(-30<=time.time()-protection_at<300 and -30<=time.time()-preflight_at<300,'R32_RECOVERY_PROTECTION_OR_PREFLIGHT_STALE')
        r=docker(['container','rm',PGID]);need(r.returncode==0 and r.stdout.decode('utf8','strict').strip()==PGID,'R32_RECOVERY_CONTAINER_REMOVE_UNKNOWN');removed.append('postgres');current(False,True)
        r=docker(['volume','rm',name('postgres-data')]);need(r.returncode==0 and r.stdout.decode('utf8','strict').strip()==name('postgres-data'),'R32_RECOVERY_VOLUME_REMOVE_UNKNOWN');removed.append('postgres-data');current(False,False)
    except BaseException as e:errors.append(str(e) if re.fullmatch('R32_RECOVERY_[A-Z0-9_]+',str(e)) else 'R32_RECOVERY_OPERATION_INCOMPLETE')
    try:original_stable=original_records(diag)==before
    except BaseException as e:
        original_stable=False;errors.append(str(e) if re.fullmatch('R32_RECOVERY_[A-Z0-9_]+',str(e)) else 'R32_RECOVERY_ORIGINAL_READ_INCOMPLETE')
    result={'schemaVersion':1,'kind':'r32-failed-matrix-resource-recovery-result','originalAttempt':ATTEMPT,'originalRunID':RUN,'recoveryNonce':p['recoveryNonce'],'programSHA256':p['programSHA256'],'callerSHA256':p['callerSHA256'],'diagnosticSHA256':DIAG_SHA,'reviewSHA256':p['reviewSHA256'],'preflightSHA256':p['preflightSHA256'],'intentSHA256':sha(intent_raw),'resources':{'postgres':{'id':PGID,'name':name('postgres'),'createdAt':'2026-10-12T23:12:33.226647699Z','imageID':PGIMAGE,'configSHA256':CONFIG_SHA,'hostConfigSHA256':HOST_SHA},'postgresVolume':{'name':name('postgres-data'),'createdAt':'2026-10-13T07:12:33+08:00','inspectionSHA256':VOLUME_SHA}},'removedRoles':removed,'status':'removed' if not errors and original_stable and removed==['postgres','postgres-data'] else 'failed','errorCodes':errors,'originalRecordsUnchanged':original_stable,'unknownOriginalCreationIdentityPreserved':True,'originalCreatedRecordStillMissing':True,'originalMatrixCleanupQualified':False,'cleanupIndependentlyVerified':False,'modelsInvoked':False,'productCodeExecutedByRecovery':False,'productAccepted':False}
    result_raw=canonical(result);wx(result_path,result_raw);signal.alarm(0);return {'namespace':private,'rootIntent':{'path':intent_path,'sha256':sha(intent_raw)},'rootResult':{'path':result_path,'sha256':sha(result_raw)},'result':result,'readOnly':False}

if __name__=='__main__':print(json.dumps(main(p),separators=(',',':')))
