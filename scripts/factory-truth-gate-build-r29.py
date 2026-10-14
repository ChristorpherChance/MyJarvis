#!/usr/bin/python3
"""Finite first R29 build validation. Candidate code runs only UID1000, network none.

Independent DB/API semantics are a separate later stage. No production package is
replaced and no host socket is mounted in any candidate container.
"""
import os, sys, stat, json, hashlib, subprocess, time, uuid, re, pwd, selectors
from pathlib import Path
from types import ModuleType

SOURCE='/home/superopen/All-Projects/msf-targets-r29/source'
FINGERPRINT='4907e45a21799f2dd14ac2373769607f40d6b9e0319bb614fbe259b157e60493'
METADATA='2da9d3e490fd6d042113c067807a89b000a4f40fdb5fa8d3ca2911b6615ebce8'
IDENTITY={'device':66306,'inode':6718050}
ROOT=Path('/var/lib/jarvis-development/101/truth-gate-r29-build')
HELPER=Path('/opt/jarvis-development/software-factory/project-autonomy-evidence.py')
HELPER_SHA='57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2'
IMAGE='sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96'
STAGES=[('offline-install',['/usr/local/bin/node','/corepack-runtime/dist/pnpm.js','install','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/pnpm-store'],300),('build',['/usr/local/bin/node','/corepack-runtime/dist/pnpm.js','-r','--no-bail','run','build'],480),('typecheck',['/usr/local/bin/node','/corepack-runtime/dist/pnpm.js','-r','--no-bail','run','typecheck'],480),('truth-unit',['/usr/local/bin/node','--experimental-strip-types','--test','--test-reporter=tap','apps/server/src/modules/test/truth-gate.test.mjs'],120)]

def need(v,c):
    if not v:raise RuntimeError(c)

def private_read(path,limit=2000000):
    for x in [path,*path.parents]:
        s=x.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'R29_BUILD_TRUSTED_CHAIN_REQUIRED')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        a=os.fstat(fd);need(stat.S_ISREG(a.st_mode) and a.st_nlink==1 and a.st_size<=limit,'R29_BUILD_TRUSTED_FILE_INVALID');raw=os.read(fd,limit+1);b=os.fstat(fd)
        need(len(raw)==a.st_size and (a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns)==(b.st_dev,b.st_ino,b.st_size,b.st_mtime_ns,b.st_ctime_ns),'R29_BUILD_TRUSTED_FILE_CHANGED');return raw
    finally:os.close(fd)

def store(path,value):
    raw=(json.dumps(value,separators=(',',':'))+'\n').encode();tmp=path.parent/(path.name+'.'+uuid.uuid4().hex+'.tmp');fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        view=memoryview(raw)
        while view:
            n=os.write(fd,view);need(n>0,'R29_BUILD_STORE_SHORT_WRITE');view=view[n:]
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
        raise RuntimeError('R29_BUILD_CONTAINER_INSPECT_FAILED')
    values=json.loads(r.stdout);need(len(values)==1,'R29_BUILD_CONTAINER_INSPECT_FORMAT');return values[0]

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
                    n=os.write(fd,view);need(n>0,'R29_BUILD_LOG_SHORT_WRITE');view=view[n:]
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
    need(before==helper.fingerprint(path),'R29_BUILD_SOURCE_READ_CHANGED')
    return {'sha256':before['sha256'],'files':before['files'],'bytes':before['bytes'],'metadataSHA':hashlib.sha256(json.dumps(meta,separators=(',',':')).encode()).hexdigest(),'identity':identity}

def owner_contract(attempt):
    unit='jarvis-tg-r29-'+attempt+'-owner.service';need(os.environ.get('JARVIS_R29_BUILD_OWNER_UNIT')==unit,'R29_BUILD_FIXED_OWNER_REQUIRED')
    result=subprocess.run(['/usr/bin/systemctl','show',unit,'--property=ActiveState,MainPID,ControlGroup,RuntimeMaxUSec,TimeoutStopUSec,KillMode,ExecStopPost,Restart'],capture_output=True,text=True,timeout=10)
    need(result.returncode==0,'R29_BUILD_OWNER_READ_FAILED');values=dict(x.split('=',1) for x in result.stdout.splitlines() if '=' in x)
    post=values.get('ExecStopPost','');match=re.fullmatch(r'\{\s*path=([^;{}]+?)\s*;\s*argv\[\]=(.*?)\s*;\s*ignore_errors=(yes|no)\s*;[^{}]*\}',post)
    need(match is not None and match.group(1)=='/usr/bin/python3' and match.group(2).split()==['/usr/bin/python3',str(Path(__file__)),'--reconcile-cleanup',attempt] and match.group(3)=='no','R29_BUILD_OWNER_STOPPOST_CHANGED')
    need(values.get('ActiveState')=='active' and values.get('MainPID')==str(os.getpid()) and values.get('ControlGroup')=='/system.slice/'+unit and values.get('RuntimeMaxUSec')=='30min' and values.get('TimeoutStopUSec')=='5min' and values.get('KillMode')=='control-group' and values.get('Restart')=='no','R29_BUILD_OWNER_CONTRACT_CHANGED')
    stat_value=Path('/proc/self/stat').read_text();fields=stat_value[stat_value.rfind(')')+2:].split();groups=[x.split(':',2)[2] for x in Path('/proc/self/cgroup').read_text().splitlines()]
    need(values['ControlGroup'] in groups,'R29_BUILD_OWNER_CGROUP_CHANGED')
    return {'unit':unit,'pid':os.getpid(),'startTicks':fields[19],'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'controlGroup':values['ControlGroup'],'runtimeMaxSec':1800,'stopTimeoutSec':300,'killMode':'control-group','restart':'no','exactExecStopPostConfigured':True}

def reconcile_cleanup(attempt):
    need(os.geteuid()==0 and re.fullmatch('[a-f0-9]{32}',attempt),'R29_BUILD_RECONCILE_SCOPE_INVALID')
    for x in [ROOT,*ROOT.parents]:
        s=x.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'R29_BUILD_RECONCILE_ROOT_UNTRUSTED')
    labels={'jarvis.truthgate.r29.attempt':attempt,'jarvis.truthgate.r29.kind':'build'};names=['jarvis-tg-r29-'+attempt+'-'+stage for stage,_,_ in STAGES];errors=[]
    ownership=json.loads(private_read(ROOT/'ownership'/(attempt+'.json')));need(ownership['attempt']==attempt and ownership['sourceFingerprint']==FINGERPRINT and ownership['containers']==names and ownership['labels']==labels and ownership['imageID']==IMAGE and ownership['emptyResourceScopeVerified'] is True and ownership['toolSHA256']==hashlib.sha256(private_read(Path(__file__))).hexdigest(),'R29_BUILD_RECONCILE_OWNERSHIP_CHANGED')
    state_path=ROOT/attempt/'state.json';state=json.loads(private_read(state_path)) if os.path.lexists(state_path) else None;owned=set()
    if state is not None:
        need(state['attempt']==attempt and state['resources']['containers']==names and state['resources']['labels']==labels,'R29_BUILD_RECONCILE_STATE_CHANGED')
        intent=state.get('creationIntent',{}).get('name')
        if intent is not None:need(intent in names,'R29_BUILD_RECONCILE_INTENT_CHANGED');owned.add(intent)
        for check in state.get('checks',[]):
            name='jarvis-tg-r29-'+attempt+'-'+check['id'];need(name in names and re.fullmatch('[a-f0-9]{64}',check['containerID']),'R29_BUILD_RECONCILE_CHECK_CHANGED');owned.add(name)
    for name in names:
        try:
            current=inspect(name,timeout=15)
            if current is not None:
                need(name in owned and current['Config']['Labels'].items()>=labels.items() and current['Image']==IMAGE,'R29_BUILD_RECONCILE_RESOURCE_IDENTITY_CHANGED');need(call(['rm','-f',current['Id']],timeout=15).returncode==0,'R29_BUILD_RECONCILE_REMOVE_FAILED')
            need(inspect(name,timeout=15) is None,'R29_BUILD_RECONCILE_STILL_PRESENT')
        except BaseException:errors.append(name)
    scoped=call(['ps','-aq','--filter','label=jarvis.truthgate.r29.attempt='+attempt],timeout=15);empty=scoped.returncode==0 and not scoped.stdout.strip()
    folder=ROOT/'reconciliations'
    if not folder.exists():folder.mkdir(mode=0o700)
    s=folder.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o077,'R29_BUILD_RECONCILE_REPORT_ROOT_UNTRUSTED')
    value={'schemaVersion':1,'kind':'r29-build-fixed-owner-stoppost-resource-reconciliation','attempt':attempt,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'containers':names,'exactResourceScopeObservedAbsent':not errors and empty,'scopeErrors':errors,'attemptLabelScopeEmpty':empty,'modelsInvoked':False,'productAccepted':False,'cleanupIndependentlyVerified':False,'sourceCodeExecuted':False,'rawLogsExported':False};store(folder/(attempt+'-'+uuid.uuid4().hex+'.json'),value);print(json.dumps(value));return 0 if not errors and empty else 1

def main():
    need(os.geteuid()==0 and len(sys.argv)==3 and sys.argv[1]=='--run' and re.fullmatch('[a-f0-9]{32}',sys.argv[2]),'R29_BUILD_ARGUMENTS_INVALID')
    attempt=sys.argv[2];owner=owner_contract(attempt);body=private_read(HELPER);need(hashlib.sha256(body).hexdigest()==HELPER_SHA,'R29_BUILD_HELPER_CHANGED');h=ModuleType('r29_build_evidence');exec(compile(body,str(HELPER),'exec'),h.__dict__)
    ownership=json.loads(private_read(ROOT/'ownership'/(attempt+'.json')));need(ownership['attempt']==attempt and ownership['sourceFingerprint']==FINGERPRINT and ownership['toolSHA256']==hashlib.sha256(private_read(Path(__file__))).hexdigest() and ownership['emptyResourceScopeVerified'] is True,'R29_BUILD_OWNERSHIP_REQUIRED')
    expected={'sha256':FINGERPRINT,'files':621,'bytes':18386584,'metadataSHA':METADATA,'identity':IDENTITY};before=source_state(h,SOURCE);need(before==expected,'R29_BUILD_SOURCE_BINDING_CHANGED')
    root=ROOT
    if not root.exists():root.mkdir(mode=0o700)
    for x in [root,*root.parents]:
        s=x.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'R29_BUILD_ROOT_UNTRUSTED')
    private=root/attempt;private.mkdir(mode=0o700);work=private/'work';work.mkdir(mode=0o700);home=work/'home';home.mkdir(mode=0o700)
    prefix='jarvis-tg-r29-'+attempt;labels={'jarvis.truthgate.r29.attempt':attempt,'jarvis.truthgate.r29.kind':'build'};names=[prefix+'-'+s[0] for s in STAGES]
    for name in names:need(inspect(name) is None,'R29_BUILD_RESOURCE_ALREADY_EXISTS')
    inventory=call(['ps','-aq','--filter','label=jarvis.truthgate.r29.attempt='+attempt]);need(inventory.returncode==0 and not inventory.stdout.strip(),'R29_BUILD_LABEL_SCOPE_NOT_EMPTY')
    image_result=call(['image','inspect',IMAGE]);need(image_result.returncode==0,'R29_BUILD_IMAGE_READ_FAILED');image=json.loads(image_result.stdout);need(len(image)==1 and image[0]['Id']==IMAGE and image[0]['Os']=='linux' and image[0]['Architecture']=='amd64' and isinstance(image[0].get('Config'),dict) and not image[0]['Config'].get('Volumes'),'R29_BUILD_IMAGE_CHANGED_OR_VOLUMES_UNLISTED')
    snapshot=h.snapshot(SOURCE,str(work/'source'));need(snapshot['sha256']==FINGERPRINT and snapshot['files']==621,'R29_BUILD_SNAPSHOT_CHANGED')
    need(source_state(h,SOURCE)==before,'R29_BUILD_SOURCE_CHANGED_AFTER_SNAPSHOT')
    account=pwd.getpwnam('superopen');need(account.pw_uid==1000 and account.pw_gid==1000,'R29_BUILD_UID_CHANGED')
    def handoff(fd):
        for name in os.listdir(fd):
            s=os.stat(name,dir_fd=fd,follow_symlinks=False)
            if stat.S_ISDIR(s.st_mode):
                child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
                try:handoff(child)
                finally:os.close(child)
            else:need(stat.S_ISREG(s.st_mode) and s.st_nlink==1,'R29_BUILD_SNAPSHOT_NOT_REGULAR');os.chown(name,1000,1000,dir_fd=fd,follow_symlinks=False)
        os.fchown(fd,1000,1000)
    fd=h.open_directory(str(work))
    try:handoff(fd)
    finally:os.close(fd)
    held=[];mounts=[]
    for source,destination,rw in [(str(work),'/work',True),('/home/superopen/opt/node22/lib/node_modules/corepack','/corepack-runtime',False),('/home/superopen/.cache/node/corepack','/corepack-cache',False),('/home/superopen/.local/share/pnpm/store','/pnpm-store',False)]:
        handle=h.open_directory(source);held.append(handle);info=os.fstat(handle);need(stat.S_ISDIR(info.st_mode) and info.st_uid in [0,1000] and not info.st_mode&0o002,'R29_BUILD_MOUNT_SOURCE_INVALID')
        mounts.append({'source':source,'fdSource':'/proc/'+str(os.getpid())+'/fd/'+str(handle),'destination':destination,'rw':rw,'device':info.st_dev,'inode':info.st_ino})
    def assert_container(current,stage):
        need(current is not None and current['Config']['Labels'].items()>=labels.items() and current['Config']['Labels'].get('jarvis.truthgate.r29.stage')==stage and current['Image']==IMAGE and current['Config']['User']=='1000:1000','R29_BUILD_CREATED_SCOPE_CHANGED')
        host=current['HostConfig'];need(host['NetworkMode']=='none' and host['Init'] is True and host['ReadonlyRootfs'] is True and host['Privileged'] is False and host['PidMode']=='' and host['IpcMode']=='private' and host['CapDrop']==['ALL'] and host.get('CapAdd') in [None,[]] and any(v in host['SecurityOpt'] for v in ['no-new-privileges','no-new-privileges=true']) and host['Memory']==8589934592 and host['NanoCpus']==3000000000 and host['PidsLimit']==512 and host['Tmpfs']=={'/tmp':'rw,nosuid,nodev,size=512m'},'R29_BUILD_SANDBOX_FLAGS_CHANGED')
        actual=current['Mounts'];need(len(actual)==len(mounts),'R29_BUILD_MOUNTS_CHANGED')
        for mount in mounts:
            values=[x for x in actual if x['Destination']==mount['destination']];need(len(values)==1,'R29_BUILD_MOUNTS_CHANGED');value=values[0]
            need(value['Type']=='bind' and value['RW'] is mount['rw'] and value['Source']==mount['fdSource'],'R29_BUILD_MOUNTS_CHANGED')
            current_stat=os.stat(mount['fdSource']);need(current_stat.st_dev==mount['device'] and current_stat.st_ino==mount['inode'],'R29_BUILD_MOUNT_IDENTITY_CHANGED')
        return current
    r={'schemaVersion':1,'kind':'software-factory-r29-isolated-build-validation','attempt':attempt,'owner':owner,'startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'source':before,'imageID':IMAGE,'snapshotFingerprint':snapshot['sha256'],'resources':{'containers':names,'networks':[],'volumes':[],'labels':labels},'candidateUID':1000,'candidateNetwork':'none','hostDockerSocketMounted':False,'productionDatabaseUsed':False,'modelsInvoked':False,'checks':[],'status':'running','productAccepted':False,'independentDBAPIValidation':False,'cleanupIndependentlyVerified':False};state=private/'state.json';store(state,r)
    try:
        for (name,args,timeout),container in zip(STAGES,names):
            r['creationIntent']={'name':container,'stage':name,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())};store(state,r)
            need(h.fingerprint(str(work/'source'))['sha256']==FINGERPRINT,'R29_BUILD_WORK_SOURCE_CHANGED')
            command=['create','--pull=never','--init','--name',container,'--network','none','--user','1000:1000','--security-opt','no-new-privileges','--cap-drop','ALL','--read-only','--memory','8g','--cpus','3','--pids-limit','512','--tmpfs','/tmp:rw,nosuid,nodev,size=512m','--env','CI=1','--env','HOME=/work/home','--env','COREPACK_HOME=/corepack-cache','--env','COREPACK_ENABLE_NETWORK=0','--workdir','/work/source']
            for mount in mounts:command+=['--mount','type=bind,src='+mount['fdSource']+',dst='+mount['destination']+('' if mount['rw'] else ',readonly')]
            for k,v in labels.items():command+=['--label',k+'='+v]
            command+=['--label','jarvis.truthgate.r29.stage='+name,'--entrypoint',args[0],IMAGE,*args[1:]]
            created=call(command);need(created.returncode==0,'R29_BUILD_CONTAINER_CREATE_FAILED');current=assert_container(inspect(container),name);need(re.fullmatch('[a-f0-9]{64}',current['Id']) and created.stdout.decode().strip()==current['Id'],'R29_BUILD_CREATED_ID_CHANGED')
            logfile=private/(name+'.log');result=stream_start(current['Id'],logfile,timeout);current=assert_container(inspect(container),name);log=private_read(logfile,50*1024*1024);code=result['exitCode'];executed=current['State']['StartedAt']!='0001-01-01T00:00:00Z';ok=executed and code==0 and current['State']['ExitCode']==0 and not current['State']['Running'] and not result['timeout'] and not result['logLimitExceeded'];counts=None
            if name=='truth-unit':
                counts={}
                for field in ['tests','pass','fail','cancelled','skipped','todo']:
                    matches=re.findall(r'^# '+field+r' ([0-9]+)\s*$',log.decode('utf-8','replace'),re.M);need(len(matches)==1,'R29_BUILD_TEST_DENOMINATOR_INVALID');counts[field]=int(matches[0])
                ok=ok and counts=={'tests':16,'pass':16,'fail':0,'cancelled':0,'skipped':0,'todo':0}
            diagnostics=[]
            for line in log.decode('utf-8','replace').splitlines():
                m=re.search(r'((?:apps|packages)/[A-Za-z0-9_./-]+\.(?:ts|tsx))[^\n]{0,60}(error TS[0-9]{4})',line)
                if m:diagnostics.append({'path':m.group(1),'code':m.group(2).replace('error ','')})
            r['checks'].append({'id':name,'executed':executed,'status':'pass' if ok else 'fail','exitCode':code,'timeout':result['timeout'],'logLimitExceeded':result['logLimitExceeded'],'containerID':current['Id'],'logSHA256':result['logSHA256'],'logBytes':result['logBytes'],'rawLogsExported':False,'compilerDiagnosticCodes':diagnostics,'tests':counts,'mountsAndSandboxFlagsActuallyVerified':True});store(state,r)
            removed=call(['rm','-f',container]);need(removed.returncode==0 and inspect(container) is None,'R29_BUILD_STAGE_CLEANUP_FAILED')
            if name=='offline-install' and not ok:break
        r['status']='pass' if len(r['checks'])==len(STAGES) and all(c['status']=='pass' for c in r['checks']) else 'fail'
    except BaseException as error:
        r['status']='fail';message=str(error);r['errorCode']=message if re.fullmatch('R29_BUILD_[A-Z0-9_]+',message) else 'R29_BUILD_OPERATION_FAILED'
    finally:
        failures=[]
        for name in names:
            try:
                current=inspect(name)
                if current is not None:
                    need(current['Config']['Labels'].items()>=labels.items() and current['Image']==IMAGE,'R29_BUILD_CLEANUP_SCOPE_CHANGED');need(call(['rm','-f',name]).returncode==0,'R29_BUILD_CLEANUP_FAILED')
                need(inspect(name) is None,'R29_BUILD_RESOURCE_STILL_PRESENT')
            except BaseException:failures.append(name)
        try:after=source_state(h,SOURCE);r['sourceAfter']=after;r['sourceUnchanged']=before==after;r['sourceReadComplete']=True
        except BaseException:r['sourceAfter']=None;r['sourceUnchanged']=False;r['sourceReadComplete']=False;r['sourceReadErrorCode']='R29_BUILD_FINAL_SOURCE_READ_FAILED'
        try:inventory=call(['ps','-aq','--filter','label=jarvis.truthgate.r29.attempt='+attempt]);label_empty=inventory.returncode==0 and not inventory.stdout.strip()
        except BaseException:label_empty=False
        r['cleanupClaimsComplete']=not failures and label_empty;r['cleanupUnresolvedNames']=failures;r['labelScopeActuallyEmpty']=label_empty;r['noRecordedResultStages']=[name for name,_,_ in STAGES if name not in {c['id'] for c in r['checks']}];r['noRecordedResultExecutionState']='unknown'
        if not r['sourceUnchanged'] or not r['cleanupClaimsComplete']:r['status']='fail'
        for fd in held:os.close(fd)
        r['finishedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());store(state,r)
    print(json.dumps({'attempt':attempt,'status':r['status'],'sourceUnchanged':r['sourceUnchanged'],'checks':r['checks'],'cleanupClaimsComplete':r['cleanupClaimsComplete'],'independentDBAPIValidation':False,'productAccepted':False,'rawLogsExported':False}))

if __name__=='__main__':
    if len(sys.argv)==3 and sys.argv[1]=='--reconcile-cleanup':sys.exit(reconcile_cleanup(sys.argv[2]))
    main()
