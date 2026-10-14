"""Fixed failed-check diagnostics. No lifecycle, resource or protection qualification."""
import base64,contextlib,datetime,hashlib,json,os,re,selectors,signal,stat,subprocess,sys,time
PROTOCOL='PG4_FAILURE_DIAGNOSTIC_R5_V1'
STARTUP='PG4_QA_STARTUP_R33_V1'
BASE='/var/lib/jarvis-development/101/r33-pg4-qa-startup-main602-proof-r5'
ATTEMPT='69e5926d169160f2b70eaab63c1b4e23'
UNIT='jarvis-pg4-qa-r33-main602-proof-r5-'+ATTEMPT+'.service'
INVOCATION='871677b985be4d0db1af91d9ac7329a1'
WORKER='e8d429453fe41a9c71c02f4c9daea8b123d47ed1a468674dfaa719253bbc9eb6'
STARTER='617693457e5822640c316b1c3838f33b9b81266184e96f0dfdc2ebc0ca1cfd4a'
START='8bc3332d77d160b2da6a3415a366d93d404edd364d53fe887a865f25ba92b70e'
CHECK='1deb9d40fa7f0d7ac2c778d5f8f12e79d36a9a63f47206606d1eaa31d0c52431'
CHECK_WIRE='6f07d6f559b4c4200165cb3569600658692fe320b66bccb15e1d2aa22524c13b'
ROLES=('postgres','pg4-runner','internal-network','postgres-data')
FILES=('state.json',)+tuple('work/'+r+'.created.json' for r in ROLES)
FIELDS=('Id','InvocationID','LoadState','ActiveState','SubState','MainPID','ControlGroup','RuntimeMaxUSec','TimeoutStopUSec','KillMode','Restart','NoNewPrivileges','User','Group','ExecStart','ExecStopPost','PrivateTmp','UMask')

def need(v,c):
    if not v:raise RuntimeError(c)

def digest(v):return hashlib.sha256(v if isinstance(v,bytes) else str(v).encode()).hexdigest()
def canonical(v):return json.dumps(v,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()
def stat_key(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def decode(raw):
    def pairs(rows):
        out={}
        for k,v in rows:need(k not in out,'PG4_FD_JSON_DUPLICATE');out[k]=v
        return out
    return json.loads(raw,object_pairs_hook=pairs,parse_constant=lambda _:need(False,'PG4_FD_JSON_NONFINITE'))

@contextlib.contextmanager
def held(fd,phase):
    primary=None
    try:yield fd
    except BaseException as e:
        primary=e
        if not hasattr(e,'pg4_phase'):e.pg4_phase=phase
        raise
    finally:
        try:os.close(fd)
        except BaseException as e:
            if primary is None:e.pg4_phase=phase+'_CLOSE';raise
            primary.pg4_secondary=getattr(primary,'pg4_secondary',[])+[{'phase':phase+'_CLOSE','errorCode':'PG4_D_CLOSE_INCOMPLETE','errno':getattr(e,'errno',None)}]

@contextlib.contextmanager
def chain(path,owner=0):
    need(type(path) is str and path.startswith('/') and all(x not in ('','.','..') for x in path.split('/')[1:]),'PG4_D_PATH_CHANGED')
    with contextlib.ExitStack() as stack:
        fd=stack.enter_context(held(os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW),'ROOT'))
        for i,name in enumerate(path.split('/')[1:]):
            before=os.stat(name,dir_fd=fd,follow_symlinks=False);uid=owner if i==len(path.split('/'))-2 else 0
            need(stat.S_ISDIR(before.st_mode) and before.st_uid==before.st_gid==uid and not before.st_mode&0o022,'PG4_D_DIRECTORY_UNTRUSTED')
            child=stack.enter_context(held(os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=fd),'DIRECTORY'))
            need(stat_key(before)==stat_key(os.fstat(child)),'PG4_D_DIRECTORY_REPLACED');fd=child
        before=stat_key(os.fstat(fd));yield fd
        need(before==stat_key(os.fstat(fd))==stat_key(os.stat(path,follow_symlinks=False)),'PG4_D_DIRECTORY_CHANGED')

def closed(e,phase):
    code=str(e)
    return {'phase':getattr(e,'pg4_phase',phase),'errorCode':code if re.fullmatch('(PG4_FD|PG4_D)_[A-Z0-9_]+',code) else 'PG4_FD_READ_INCOMPLETE','errno':getattr(e,'errno',None),'secondaryFailures':getattr(e,'pg4_secondary',[])}

def file_bytes(root,name,maximum,rows,expected=None):
    parent,_,leaf=name.rpartition('/');row={'presence':'unknown','readComplete':False,'twoReadsStable':False};rows[name]=row
    with chain(root+('/'+parent if parent else '')) as directory:
        try:before=os.stat(leaf,dir_fd=directory,follow_symlinks=False)
        except FileNotFoundError as e:
            row.update({'presence':'missing','missingErrno':e.errno,'missingIsUnknownHistory':True});return row
        row.update({'presence':'present','metadata':stat_key(before)})
        need(stat.S_ISREG(before.st_mode) and before.st_uid==before.st_gid==0 and before.st_nlink==1 and not before.st_mode&0o022 and 0<=before.st_size<=maximum,'PG4_FD_FILE_UNTRUSTED')
        with held(os.open(leaf,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=directory),'FILE') as fd:
            need(stat_key(before)==stat_key(os.fstat(fd)),'PG4_FD_FILE_REPLACED');raw=bytearray()
            try:
                while len(raw)<=before.st_size:
                    block=os.read(fd,min(65536,before.st_size+1-len(raw)))
                    if not block:break
                    raw.extend(block)
                row.update({'base64':base64.b64encode(raw).decode(),'sha256':digest(bytes(raw)),'bytes':len(raw)})
                need(len(raw)==before.st_size and (expected is None or row['sha256']==expected),'PG4_FD_FILE_CHANGED')
                os.lseek(fd,0,os.SEEK_SET);offset=0
                while offset<len(raw):
                    block=os.read(fd,min(65536,len(raw)-offset));need(block and block==raw[offset:offset+len(block)],'PG4_FD_SECOND_READ_CHANGED');offset+=len(block)
                need(not os.read(fd,1) and stat_key(before)==stat_key(os.fstat(fd))==stat_key(os.stat(leaf,dir_fd=directory,follow_symlinks=False)),'PG4_FD_FILE_CHANGED')
                row.update({'readComplete':True,'twoReadsStable':True,'metadataSHA256':digest(canonical(stat_key(before)))})
            except BaseException:
                row.pop('base64',None)
                row.update({'prefixBase64':base64.b64encode(raw).decode(),'prefixSHA256':digest(bytes(raw)),'prefixBytes':len(raw),'readComplete':False});raise
    return row

def capture(command,maximum,seconds,output):
    # Only the two fixed systemctl shows and one exact AND-filtered journal query.
    output.update({'stdoutBase64':'','stderrBase64':'','status':None,'complete':False,'commandSHA256':digest(canonical(command))})
    proc=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'},close_fds=True)
    streams={'stdout':bytearray(),'stderr':bytearray()};primary=None;secondary=[];sel=selectors.DefaultSelector();deadline=time.monotonic()+seconds
    try:
        for role,f in (('stdout',proc.stdout),('stderr',proc.stderr)):
            os.set_blocking(f.fileno(),False);sel.register(f,selectors.EVENT_READ,role)
        while sel.get_map():
            need(time.monotonic()<deadline,'PG4_FD_COMMAND_DEADLINE')
            for key,_ in sel.select(min(.1,max(0,deadline-time.monotonic()))):
                block=os.read(key.fileobj.fileno(),min(65536,maximum+1-sum(map(len,streams.values()))))
                if not block:sel.unregister(key.fileobj)
                else:streams[key.data].extend(block);need(sum(map(len,streams.values()))<=maximum,'PG4_FD_COMMAND_OUTPUT_LIMIT')
        while proc.poll() is None:
            need(time.monotonic()<deadline,'PG4_FD_COMMAND_DEADLINE');time.sleep(.01)
        output['status']=proc.returncode
    except BaseException as e:primary=e
    finally:
        for f in (sel,proc.stdout,proc.stderr):
            try:f.close()
            except BaseException as e:
                if primary is None:primary=e
                else:secondary.append(closed(e,'COMMAND_CLOSE'))
        returned={k:bytes(b) for k,b in streams.items()};left=maximum;retained={}
        for k,b in returned.items():retained[k]=b[:left];left-=len(retained[k])
        output.update({'stdoutBase64':base64.b64encode(retained['stdout']).decode(),'stderrBase64':base64.b64encode(retained['stderr']).decode(),'stdoutSHA256':digest(retained['stdout']),'stderrSHA256':digest(retained['stderr']),'stdoutBytes':len(retained['stdout']),'stderrBytes':len(retained['stderr']),'returnedStdoutBytes':len(returned['stdout']),'returnedStderrBytes':len(returned['stderr']),'retention':'partial-overflow-prefix' if sum(map(len,returned.values()))>maximum else 'original-returned-buffers','status':proc.poll(),'complete':primary is None,'childCompletionUnknown':proc.poll() is None,'secondaryClosedErrors':secondary})
    if primary is not None:
        primary.pg4_secondary=getattr(primary,'pg4_secondary',[])+secondary;raise primary
    need(output['status']==0,'PG4_FD_COMMAND_STATUS_UNKNOWN');return bytes(streams['stdout'])

def unit_frame(out):
    raw=capture(['/usr/bin/systemctl','show',UNIT,*['--property='+k for k in FIELDS]],131072,6,out);props={}
    for line in raw.decode('utf-8','strict').splitlines():
        need('=' in line,'PG4_FD_UNIT_PROPERTIES_MALFORMED');key,value=line.split('=',1)
        need(key in FIELDS and key not in props,'PG4_FD_UNIT_PROPERTIES_MALFORMED');props[key]=value
    out.update({'properties':props,'missingProperties':[k for k in FIELDS if k not in props],'allRequestedPropertiesPresent':set(props)==set(FIELDS),'idMatchesRequestedUnit':props.get('Id')==UNIT,'currentInvocationMatchesInitialStart':props.get('InvocationID')==INVOCATION,'originalCheckPredicateSatisfiedByCurrentFrame':set(props)==set(FIELDS) and props.get('Id')==UNIT})

def validate(p):
    need(type(p) is dict and set(p)=={'schemaVersion','kind','protocol','attempt','sourceExpected','historicalStart','failedCheck'},'PG4_FD_EXPLICIT_INPUT_REQUIRED')
    need(p['schemaVersion']==1 and p['kind']=='r33-pg4-main602-proof-r5-failure-diagnostic-input' and p['protocol']==PROTOCOL and p['attempt']==ATTEMPT,'PG4_FD_CONTEXT_CHANGED')
    need(p['sourceExpected']=={'workerSHA256':WORKER,'starterSHA256':STARTER},'PG4_FD_SOURCE_CHANGED')
    need(p['historicalStart']=={'publicSHA256':START,'unit':UNIT,'invocationId':INVOCATION,'mainPID':2110850},'PG4_FD_START_BINDING_CHANGED')
    need(p['failedCheck']=={'publicSHA256':CHECK,'wireSHA256':CHECK_WIRE,'outerErrorCode':'PG4_R33_ROOT_CALL_UNCONFIRMED_USE_CHECK','rootErrorCode':'PG4_R33_UNIT_SCOPE_CHANGED','rootStatus':1,'stdoutBytes':0},'PG4_FD_FAILED_CHECK_CHANGED');return p

def run(payload=None):
    p=validate(payload);root=BASE+'/'+ATTEMPT;files={};frames=[];first=None;phase='profile'
    v={'schemaVersion':1,'kind':'r33-pg4-main602-proof-r5-failure-diagnostic-observation','protocol':PROTOCOL,'attempt':ATTEMPT,'sourceExpected':p['sourceExpected'],'historicalStart':p['historicalStart'],'failedCheck':p['failedCheck'],'files':files,'unitFrames':frames,'journal':{},'ownerStderr':{'sourceSinkBound':False,'path':None},'readComplete':False,'firstClosedError':None,'secondaryClosedErrors':[],'originalIntegerDomainPreserved':True,'readOnly':True,'allReaderDescriptorsClosed':False,'historicalFailureConjunctDetermined':False,'normalTerminalBindingQualified':False,'actualTerminalQualified':False,'currentResourceScopeClosedVerified':False,'actualPG4Qualified':False,'fullProtectionQualified':False,'modelsInvoked':False,'mutationsPerformed':False,'signalsSent':False,'resourcesRemoved':False}
    try:
        need(os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0 and sys.flags.isolated==1,'PG4_FD_ROOT_PROFILE_REQUIRED')
        v['readerProfile']={'uid':os.getuid(),'euid':os.geteuid(),'gid':os.getgid(),'egid':os.getegid(),'isolated':sys.flags.isolated}
        need(0<signal.getitimer(signal.ITIMER_REAL)[0]<=30,'PG4_FD_INHERITED_TIMER_REQUIRED')
        phase='worker-source';source={};v['workerSourceObservation']=source;file_bytes(root,'control/worker.py',160000,source,WORKER);need(source['control/worker.py']['readComplete'],'PG4_FD_WORKER_SOURCE_MISSING');v['workerSourceObservation']={k:x for k,x in source['control/worker.py'].items() if k!='base64'}
        def attempt_read(label,operation):
            nonlocal first,phase
            phase=label
            try:operation()
            except BaseException as e:
                if not hasattr(e,'pg4_phase'):e.pg4_phase=label
                if first is None:first=e
                else:v['secondaryClosedErrors'].append(closed(e,label))
                if str(e)=='PG4_FD_DEADLINE':raise
        frame={};frames.append(frame);attempt_read('unit-first',lambda:unit_frame(frame))
        for name in FILES:attempt_read(name,lambda name=name:file_bytes(root,name,67108864 if name=='state.json' else 1048576,files))
        attempt_read('journal',lambda:capture(['/usr/bin/journalctl','--no-pager','--quiet','--output=json','--lines=32','_SYSTEMD_UNIT='+UNIT,'_SYSTEMD_INVOCATION_ID='+INVOCATION],131072,5,v['journal']))
        v['journal']['zeroEntriesProvesNoError']=False
        frame={};frames.append(frame);attempt_read('unit-second',lambda:unit_frame(frame))
        v['missingFiles']=[name for name,row in files.items() if row.get('presence')=='missing'];v['partialFiles']=[name for name in FILES if not files.get(name,{}).get('readComplete')]
        v['partial']=bool(v['partialFiles']) or first is not None;v['allRequestedFilesPresent']=not v['partialFiles']
        v['readComplete']=first is None and len(frames)==2 and all(f.get('complete') is True for f in frames) and len(files)==5 and all(r.get('presence')=='missing' or r.get('readComplete') is True for r in files.values())
        v['allReaderDescriptorsClosed']=first is None
    except BaseException as e:
        if first is None:first=e
        elif e is not first:v['secondaryClosedErrors'].append(closed(e,phase))
    if first is not None:v['firstClosedError']=closed(first,phase);v['secondaryClosedErrors']+=getattr(first,'pg4_secondary',[])
    v['observedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();return v
