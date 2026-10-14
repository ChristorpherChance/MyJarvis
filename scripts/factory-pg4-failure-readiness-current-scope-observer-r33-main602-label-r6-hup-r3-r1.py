"""Failure-readiness-only exact-resource observation. Default None performs no OS observation.

The caller assembles pinned single-entry census definitions and the independently
reviewed full-byte source authority. No old operational program is imported.
"""
import base64, contextlib, datetime, errno, hashlib, json, os, posixpath, pwd, re, select, sqlite3, stat, subprocess, sys
from pathlib import Path
from types import SimpleNamespace
PROTOCOL='PG4_FAILURE_READINESS_CURRENT_SCOPE_R33_V1'
STARTUP='PG4_QA_STARTUP_R33_V1'
BASE='/var/lib/jarvis-development/101/r33-pg4-qa-startup-main602-label-r6'
ROLES=('postgres','pg4-runner','internal-network','postgres-data')
REPORTS=('pg4-vitest-result.json','pg4-hook-result.json','pg4-startup-frame.json','pg4-driver-result.json','pg4-fixture-start-intent.json')
ATTEMPT='eb28a9fe320ec080c6660c27f8d58c54'
FAILURE_STATE={'sha256':'e4438c83122f4558fae0e0fae527b60daf7d7c621974cb4b9c45f522d27c057e','bytes':15709}
FAILURE_NAME='work/postgres-native-readiness-f52238f622263129.json'
FAILURE_PIN={'sha256':'e650de4524db9fdec990284ad2110c855219475d782ff3d96ec6443fbabdb12e','bytes':533}
FAILURE_STOP={'sha256':'886d72dbeeed1ce6bd1205c71390d29a6b3023b53146ea7c89c4c3b7d0d5f531','bytes':793}
FAILURE_CODE='PG4_R33_POSTGRES_READINESS_UNKNOWN'
H=re.compile(r'[a-f0-9]{64}\Z')
CORE=('pid','ppid','startTicks','boot','procDevice','procInode')

def need(v,c):
    if not v:raise RuntimeError(c)
def digest(v):return hashlib.sha256(v if isinstance(v,bytes) else str(v).encode()).hexdigest()
def canonical(v):return json.dumps(v,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()
def stat_key(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def identity(fd):
    s=os.fstat(fd);return {'device':s.st_dev,'inode':s.st_ino}
def decode(raw):
    def pairs(rows):
        out={}
        for k,v in rows:need(k not in out,'PG4_D_JSON_DUPLICATE');out[k]=v
        return out
    return json.loads(raw,object_pairs_hook=pairs,parse_constant=lambda _:need(False,'PG4_D_JSON_NONFINITE'))
def error(e,phase):return {'phase':getattr(e,'pg4_phase',phase),'errorCode':str(e) if re.fullmatch(r'(PG4_D|PG4_A|R29_CLEANUP)_[A-Z0-9_]+',str(e)) else 'PG4_D_READ_INCOMPLETE','errno':getattr(e,'errno',None),'secondaryFailures':getattr(e,'pg4_secondary',[])}

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

def actor_core(v):
    need(type(v) is dict and all(type(v.get(k)) is int and v[k]>=(0 if k in ('ppid','procDevice') else 1) for k in ('pid','ppid','procDevice','procInode')) and re.fullmatch(r'[0-9]+',v.get('startTicks','')) and re.fullmatch(r'[a-f0-9-]{36}',v.get('boot','')),'PG4_D_ACTOR_HISTORY_UNKNOWN')
    return {k:v[k] for k in CORE}
def names(attempt):
    p='jarvis-pg4-qa-r33-main602-label-r6-'+attempt;return {'postgres':p+'-postgres','pg4-runner':p+'-runner','internal-network':p+'-net','postgres-data':p+'-data'}
def validate_payload(v):
    keys={'schemaVersion','kind','protocol','attempt','namespace','unitBinding','knownActors','resources','originalRecords','sourceExpected','sourceRevalidation','contextSHA256'}
    need(type(v) is dict and set(v)==keys and v['schemaVersion']==1 and v['kind']=='r33-pg4-failure-readiness-current-resource-scope-observation-input' and v['protocol']==PROTOCOL and v.get('attempt')==ATTEMPT,'PG4_D_PARAMETERS_CHANGED')
    unit='jarvis-pg4-qa-r33-main602-label-r6-'+v['attempt']+'.service'
    need(v['namespace']==BASE+'/'+v['attempt'] and set(v['unitBinding'])=={'unit','invocationId'} and v['unitBinding']['unit']==unit and re.fullmatch(r'[a-f0-9]{32}',v['unitBinding']['invocationId']),'PG4_D_UNIT_HISTORY_UNKNOWN')
    need(set(v['sourceExpected'])=={'workerSHA256','starterSHA256','driverSHA256','sourceContractSHA256','sourceAdmissionProgramSHA256'} and all(H.fullmatch(x) for x in v['sourceExpected'].values()),'PG4_D_SOURCE_BINDING_REQUIRED')
    need(type(v['knownActors']) is dict and set(v['knownActors'])=={'owner','stop-post'},'PG4_D_ACTOR_HISTORY_UNKNOWN');actors=[actor_core(x) for x in v['knownActors'].values()]
    need(len({a['pid'] for a in actors})==2 and len({a['boot'] for a in actors})==1 and all(x.get('unit')==unit and x.get('controlGroup')=='/system.slice/'+unit and x.get('uid')==x.get('gid')==0 for x in v['knownActors'].values()),'PG4_D_ACTOR_HISTORY_CHANGED')
    need(type(v['resources']) is dict and set(v['resources'])==set(ROLES),'PG4_D_RESOURCE_HISTORY_UNKNOWN')
    for role,x in v['resources'].items():need(set(x)=={'name','identity'} and x['name']==names(v['attempt'])[role] and (x['identity']==x['name'] if role=='postgres-data' else H.fullmatch(x['identity'] or '')),'PG4_D_RESOURCE_HISTORY_UNKNOWN')
    need(type(v['originalRecords']) is dict and 1<=len(v['originalRecords'])<=256,'PG4_D_RECORD_PINS_REQUIRED')
    for name,pin in v['originalRecords'].items():need(re.fullmatch(r'(?:control/|tools/(?:admission/|meta/)?|work/|evidence/)?[A-Za-z0-9._-]+',name) and set(pin)=={'sha256','bytes'} and H.fullmatch(pin['sha256']) and type(pin['bytes']) is int and 0<=pin['bytes']<=67108864,'PG4_D_RECORD_PIN_CHANGED')
    for name in ['state.json','once.json','control/activation.json','control/worker.py','work/stopped.json',*[f'work/{r}.created.json' for r in ROLES],*[f'work/{r}.intent.json' for r in ROLES],FAILURE_NAME]:need(name in v['originalRecords'],'PG4_D_ORIGINAL_RECORD_INCOMPLETE')
    need(v['originalRecords'].get('state.json')==FAILURE_STATE and v['originalRecords'].get(FAILURE_NAME)==FAILURE_PIN and v['originalRecords'].get('work/stopped.json')==FAILURE_STOP,'PG4_D_FAILURE_ORIGINAL_PIN_CHANGED')
    need(H.fullmatch(v['contextSHA256']) and digest(canonical({k:x for k,x in v.items() if k!='contextSHA256'}))==v['contextSHA256'],'PG4_D_CONTEXT_CHANGED');return v

def file_row(root,name,pin,out):
    parent,_,leaf=name.rpartition('/');owner=1000 if parent=='evidence' else 0
    with chain(root+('/'+parent if parent else ''),owner) as fd:
        before=os.stat(leaf,dir_fd=fd,follow_symlinks=False);need(stat.S_ISREG(before.st_mode) and before.st_uid==before.st_gid==owner and before.st_nlink==1 and not before.st_mode&0o022 and before.st_size==pin['bytes'],'PG4_D_RECORD_UNTRUSTED')
        with held(os.open(leaf,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=fd),'RECORD') as f:
            need(stat_key(before)==stat_key(os.fstat(f)),'PG4_D_RECORD_REPLACED');raw=b''
            try:
                while len(raw)<=before.st_size:
                    block=os.read(f,min(65536,before.st_size+1-len(raw)))
                    if not block:break
                    raw+=block
                row={'sha256':digest(raw),'bytes':len(raw),'metadata':stat_key(before),'metadataSHA256':digest(canonical(stat_key(before))),'readComplete':True}
                if name in ('control/postgres.env','control/pg4-runner.env','tools/pg4-db-url.txt'):row['privateEnvironmentBytesWithheld']=True
                else:row['base64']=base64.b64encode(raw).decode()
                out[name]=row
                need(len(raw)==before.st_size and row['sha256']==pin['sha256'] and stat_key(before)==stat_key(os.fstat(f))==stat_key(os.stat(leaf,dir_fd=fd,follow_symlinks=False)),'PG4_D_RECORD_CHANGED')
            except BaseException:
                out[name]={'prefixBase64':None if name in ('control/postgres.env','control/pg4-runner.env','tools/pg4-db-url.txt') else base64.b64encode(raw).decode(),'prefixSHA256':digest(raw),'prefixBytes':len(raw),'readComplete':False};raise
        return row

def namespace_read(v,out):
    directories={};sockets=[];root=v['namespace']
    def walk(fd,relative):
        before=stat_key(os.fstat(fd));listed=sorted(os.listdir(fd));directories[relative]=before;need(len(directories)<=1024,'PG4_D_NAMESPACE_LIMIT')
        for name in listed:
            need(re.fullmatch(r'[A-Za-z0-9._-]+',name),'PG4_D_NAMESPACE_NAME_CHANGED');s=os.stat(name,dir_fd=fd,follow_symlinks=False);rel=relative+'/'+name if relative else name
            if stat.S_ISDIR(s.st_mode):
                need(s.st_uid==s.st_gid==(1000 if rel=='evidence' else 0) and not s.st_mode&0o022,'PG4_D_NAMESPACE_DIRECTORY_UNTRUSTED')
                with held(os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd),'NAMESPACE_CHILD') as child:need(stat_key(s)==stat_key(os.fstat(child)),'PG4_D_NAMESPACE_REPLACED');walk(child,rel)
            elif stat.S_ISSOCK(s.st_mode):sockets.append({'pathSHA256':digest(rel),'device':s.st_dev,'inode':s.st_ino})
            else:need(stat.S_ISREG(s.st_mode) and rel in v['originalRecords'],'PG4_D_NAMESPACE_RECORD_UNBOUND')
        need(before==stat_key(os.fstat(fd)) and listed==sorted(os.listdir(fd)),'PG4_D_NAMESPACE_CHANGED')
    with chain(root) as fd:walk(fd,'')
    rows={name:file_row(root,name,pin,out) for name,pin in v['originalRecords'].items()}
    return {'directories':directories,'records':rows,'identity':{'device':directories[''][0],'inode':directories[''][1]},'metadataSHA256':digest(canonical(directories)),'filesystemSockets':sockets}

def failure_stage(state,pins,namespace):
    need(state.get('schemaVersion')==1 and state.get('kind')=='r33-pg4-qa-startup-producer-state' and state.get('protocol')==STARTUP and state.get('attempt')==ATTEMPT and state.get('status')=='failed' and state.get('phase')=='postgres-native-readiness','PG4_D_FAILURE_STAGE_CHANGED')
    need(state.get('firstFailure')=={'phase':'postgres-native-readiness','errorCode':FAILURE_CODE,'exceptionClass':'RuntimeError','errno':None,'secondaryFailures':[]},'PG4_D_FAILURE_CAUSE_CHANGED')
    need(state.get('driverEntryAttempted') is False and state.get('fixtureImportMayHaveOccurred') is False and state.get('sql')=={} and 'reports' not in state and 'driver' not in state and state.get('actualPG4Qualified') is False,'PG4_D_FAILURE_LATER_PHASE_REACHED')
    need(type(state.get('createdRoles')) is list and len(state['createdRoles'])==4 and set(state['createdRoles'])==set(ROLES),'PG4_D_FAILURE_CREATED_ROLES_CHANGED')
    need(pins.get('state.json')==FAILURE_STATE and pins.get(FAILURE_NAME)==FAILURE_PIN and pins.get('work/stopped.json')==FAILURE_STOP,'PG4_D_FAILURE_ORIGINAL_PIN_CHANGED')
    need(all('work/retained-'+n not in pins and 'evidence/'+n not in pins for n in REPORTS),'PG4_D_FAILURE_SUCCESS_REPORT_PRESENT')
    optional=state.get('optionalPhysicalError')
    need(optional=={'schemaVersion':1,'kind':'r33-pg4-optional-physical-error-original-byte-retention','name':'pg4-physical-admission-error.json','status':'absent','presenceObservationComplete':True,'retainedOriginal':None,'sourceMetadata':None,'originalSHA256':None,'originalBytes':None,'sourceWasReadTwice':None,'firstFailure':None} and 'evidence/pg4-physical-admission-error.json' not in pins and 'work/retained-pg4-physical-admission-error.json' not in pins,'PG4_D_FAILURE_OPTIONAL_ERROR_CHANGED')
    captures=state.get('captures');need(type(captures) is list and all(type(x) is dict and set(x)=={'path','sha256','bytes'} and type(x['path']) is str and x['path'].startswith(namespace+'/work/') and '/' not in x['path'][len(namespace+'/work/'):] for x in captures),'PG4_D_FAILURE_CAPTURE_DOMAIN_CHANGED')
    expected={'path':namespace+'/'+FAILURE_NAME,**FAILURE_PIN}
    need([x for x in captures if '/postgres-native-readiness-' in x['path']]==[expected],'PG4_D_FAILURE_CAPTURE_HISTORY_CHANGED')
    return True

def readiness_capture_summary(packet):
    required={'schemaVersion','kind','phase','commandSHA256','stdoutBase64','stderrBase64','status','timedOut','complete','firstFailure','secondaryFailures'}
    command=['/usr/bin/docker','exec','--user','postgres',names(ATTEMPT)['postgres'],'/usr/local/bin/pg_isready','-U','qa','-d','jarvis_truth_pg4_r33']
    need(type(packet) is dict and set(packet)==required and packet['schemaVersion']==1 and packet['kind']=='r33-pg4-trusted-cli-private-capture' and packet['phase']=='postgres-native-readiness' and packet['commandSHA256']==digest(canonical(command)),'PG4_D_FAILURE_CAPTURE_COMMAND_CHANGED')
    need(type(packet['status']) is int and -255<=packet['status']<=255 and packet['status'] not in (0,1,2) and packet['timedOut'] is False and packet['complete'] is True and packet['firstFailure'] is None and packet['secondaryFailures']==[],'PG4_D_FAILURE_CAPTURE_INCOMPLETE')
    streams={}
    for name in ('stdout','stderr'):
        encoded=packet[name+'Base64'];need(type(encoded) is str,'PG4_D_FAILURE_CAPTURE_ENCODING_CHANGED');raw=base64.b64decode(encoded,validate=True);need(base64.b64encode(raw).decode()==encoded and len(raw)<=FAILURE_PIN['bytes'],'PG4_D_FAILURE_CAPTURE_ENCODING_CHANGED');streams[name+'SHA256']=digest(raw);streams[name+'Bytes']=len(raw)
    return {'captureSHA256':FAILURE_PIN['sha256'],'captureBytes':FAILURE_PIN['bytes'],'status':packet['status'],**streams,'errorClassification':'native-readiness-return-code-outside-0-1-2','binaryPathCauseProved':False,'rawOutputPubliclyExposed':False}

def original_chain(v,rows):
    raw=lambda name:decode(base64.b64decode(rows[name]['base64'],validate=True))
    a=raw('control/activation.json');once=raw('once.json');state=raw('state.json');stop=raw('work/stopped.json');s=v['sourceExpected']
    need(all(x['protocol']==STARTUP and x['attempt']==v['attempt'] for x in (a,once,state,stop)),'PG4_D_ORIGINAL_ATTEMPT_CHANGED')
    need(a['workerSHA256']==once['workerSHA256']==s['workerSHA256']==rows['control/worker.py']['sha256'] and a['starterSHA256']==s['starterSHA256'] and a['driverSHA256']==s['driverSHA256'] and a['sourceContractSHA256']==once['sourceContractSHA256']==s['sourceContractSHA256'],'PG4_D_ORIGINAL_SOURCE_CHANGED')
    need(state['status'] in ('failed','completed-unqualified') and actor_core(state['owner'])==actor_core(v['knownActors']['owner']) and actor_core(stop['stopIdentity'])==actor_core(v['knownActors']['stop-post']),'PG4_D_ORIGINAL_ACTOR_CHANGED')
    for role in ROLES:
        c=raw('work/'+role+'.created.json');i=raw('work/'+role+'.intent.json');need(c['kind']=='r33-pg4-resource-created' and i['kind']=='r33-pg4-resource-create-intent' and c['attempt']==i['attempt']==v['attempt'] and c['role']==i['role']==role and c['identity']==v['resources'][role]['identity'] and i['name']==v['resources'][role]['name'],'PG4_D_CREATED_ID_UNBOUND')
    need(set(a['controlPins'])|{'activation.json','worker.py','postgres.env','pg4-runner.env'}=={x[8:] for x in rows if x.startswith('control/')} and all(rows['control/'+k]['sha256']==h for k,h in a['controlPins'].items()),'PG4_D_CONTROLS_CHANGED')
    need(all(rows['tools/'+k]['sha256']==h for k,h in a['toolPins'].items()),'PG4_D_TOOLS_CHANGED')
    failure_stage(state,v['originalRecords'],v['namespace'])
    readiness_capture_summary(raw(FAILURE_NAME))
    for r in state['captures']:
        name='work/'+Path(r['path']).name;need(name in rows and rows[name]['sha256']==r['sha256'] and rows[name]['bytes']==r['bytes'],'PG4_D_CAPTURE_NOT_RETAINED')
    return state

def command(args):
    try:r=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'},check=False)
    except subprocess.TimeoutExpired as e:
        stdout=e.stdout or b'';stderr=e.stderr or b'';globals().get('_cli_captures_pg4',[]).append({'status':None,'timedOut':True,'stdoutBase64':base64.b64encode(stdout[:16777216]).decode(),'stderrBase64':base64.b64encode(stderr[:16777216]).decode(),'retention':'partial-returned-prefix-not-complete'});raise
    packet={'status':r.returncode,'stdoutBase64':base64.b64encode(r.stdout[:16777216]).decode(),'stderrBase64':base64.b64encode(r.stderr[:16777216]).decode(),'retention':'original-returned-bytes' if len(r.stdout)+len(r.stderr)<=16777216 else 'partial-overflow-prefix'};globals().get('_cli_captures_pg4',[]).append(packet)
    need(len(r.stdout)+len(r.stderr)<=16777216,'PG4_D_CLI_LIMIT');return packet,r.stdout,r.stderr
def resource_frame(v):
    facts={};captures=[]
    for role,row in v['resources'].items():
        kind='network' if role=='internal-network' else 'volume' if role=='postgres-data' else 'container';packet,raw,err=command(['/usr/bin/docker',kind,'inspect',row['name']]);captures.append(packet)
        patterns={'container':r'(?:Error: )?No such (?:object|container): '+re.escape(row['name']),'network':r'(?:Error response from daemon: )?network '+re.escape(row['name'])+' not found','volume':r'Error response from daemon: get '+re.escape(row['name'])+r': no such volume'}
        absent=packet['status']==1 and raw.strip() in (b'',b'[]') and re.fullmatch(patterns[kind],err.decode('utf-8','strict').strip(),re.I) is not None;need(absent or packet['status']==0,'PG4_D_RESOURCE_ABSENCE_UNKNOWN')
        if not absent:
            data=decode(raw);need(type(data) is list and len(data)==1 and (data[0]['Name'] if kind=='volume' else data[0]['Id'])==row['identity'],'PG4_D_CURRENT_RESOURCE_ID_CHANGED')
        facts[role]={'absent':absent,'complete':True}
    counts=[]
    for label in ('jarvis.pg4.r33.attempt='+v['attempt'],'jarvis.pg4.r33.kind=qa-startup-four-cases-v1'):
        current={}
        for role,args in [('containers',['ps','-aq']),('networks',['network','ls','-q']),('volumes',['volume','ls','-q'])]:
            packet,raw,_=command(['/usr/bin/docker',*args,'--filter','label='+label]);captures.append(packet);need(packet['status']==0,'PG4_D_LABEL_READ_INCOMPLETE');current[role]=len(raw.decode('ascii','strict').split())
        counts.append(current)
    return {'resources':facts,'labels':counts,'captures':captures,'complete':True}

def argv_of(value):
    need(type(value) is str and value.startswith('{ ') and value.endswith(' }') and value.count('{')==value.count('}')==1,'PG4_D_UNIT_COMMAND_UNKNOWN');pairs=[]
    for part in value[2:-2].split(';'):
        if part.strip():need('=' in part,'PG4_D_UNIT_COMMAND_UNKNOWN');pairs.append(part.strip().split('=',1))
    d=dict(pairs);need(len(d)==len(pairs) and set(d)<={'path','argv[]','ignore_errors','start_time','stop_time','pid','code','status'} and d.get('path')=='/usr/bin/python3' and d.get('ignore_errors')=='no','PG4_D_UNIT_COMMAND_UNKNOWN');return d.get('argv[]','').split()
def unit_frame(v):
    fields=('Id','InvocationID','LoadState','ActiveState','SubState','MainPID','ControlGroup','RuntimeMaxUSec','TimeoutStopUSec','KillMode','Restart','NoNewPrivileges','User','Group','ExecStart','ExecStopPost','PrivateTmp','UMask');packet,raw,_=command(['/usr/bin/systemctl','show',v['unitBinding']['unit'],*['--property='+x for x in fields]]);need(packet['status']==0,'PG4_D_UNIT_READ_INCOMPLETE');props={}
    for line in raw.decode('utf-8','strict').splitlines():k,value=line.split('=',1);need(k in fields and k not in props,'PG4_D_UNIT_PROPERTIES_UNKNOWN');props[k]=value
    need(props.get('Id')==v['unitBinding']['unit'],'PG4_D_UNIT_SCOPE_CHANGED')
    if props.get('LoadState')=='loaded':
        need(set(props)==set(fields),'PG4_D_UNIT_SCOPE_CHANGED')
        need(props['InvocationID']==v['unitBinding']['invocationId'] and props['RuntimeMaxUSec']=='15min' and props['TimeoutStopUSec']=='2min' and props['KillMode']=='control-group' and props['Restart']=='no' and props['NoNewPrivileges']=='yes' and props['User'] in ('root','0') and props['Group'] in ('root','0') and props['PrivateTmp']=='yes' and props['UMask']=='0077','PG4_D_UNIT_INSTANCE_OR_PROFILE_CHANGED')
        for key,action in [('ExecStart','--run'),('ExecStopPost','--stop')]:need(argv_of(props[key])==['/usr/bin/python3','-I',v['namespace']+'/control/worker.py',action,v['attempt']],'PG4_D_UNIT_COMMAND_CHANGED')
    else:need(props.get('LoadState')=='not-found' and set(props)==set(fields)-{'ExecStart','ExecStopPost'} and props['InvocationID']=='' and props['ControlGroup']=='' and props['MainPID']=='0' and props['ActiveState']=='inactive' and props['SubState']=='dead','PG4_D_UNIT_STATE_UNKNOWN')
    return {'properties':props,'currentStopped':props['ActiveState'] in ('inactive','failed') and props['MainPID']=='0' and props['ControlGroup'] in ('','/system.slice/'+v['unitBinding']['unit']),'complete':True,'capture':packet}
def cgroup_frame(v):
    unit=v['unitBinding']['unit'];members=[]
    with chain('/sys/fs/cgroup'):
        with chain('/sys/fs/cgroup/system.slice') as parent:
            try:s=os.stat(unit,dir_fd=parent,follow_symlinks=False)
            except FileNotFoundError as e:need(e.errno==errno.ENOENT,'PG4_D_CGROUP_UNKNOWN');return {'absent':True,'members':[],'complete':True}
            need(stat.S_ISDIR(s.st_mode) and s.st_uid==s.st_gid==0,'PG4_D_CGROUP_UNTRUSTED')
            def walk(fd):
                listed=sorted(os.listdir(fd));before=stat_key(os.fstat(fd))
                with held(os.open('cgroup.procs',os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd),'CGROUP_PROCS') as f:
                    raw=os.read(f,1048577);need(len(raw)<=1048576,'PG4_D_CGROUP_LIMIT');values=raw.decode('ascii','strict').split();need(all(re.fullmatch(r'[1-9][0-9]*',x) for x in values),'PG4_D_CGROUP_MEMBERS_UNKNOWN');members.extend(int(x) for x in values)
                for name in listed:
                    info=os.stat(name,dir_fd=fd,follow_symlinks=False)
                    if stat.S_ISDIR(info.st_mode):
                        with held(os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd),'CGROUP_CHILD') as child:need(stat_key(info)==stat_key(os.fstat(child)),'PG4_D_CGROUP_REPLACED');walk(child)
                need(listed==sorted(os.listdir(fd)) and before==stat_key(os.fstat(fd)),'PG4_D_CGROUP_CHANGED')
            with held(os.open(unit,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent),'CGROUP') as group:need(stat_key(s)==stat_key(os.fstat(group)),'PG4_D_CGROUP_REPLACED');walk(group)
    return {'absent':False,'members':sorted(set(members)),'complete':True}
def current_actor(v,role,boot):
    known=v['knownActors'][role];need(known['boot']==boot,'PG4_D_ACTOR_BOOT_CHANGED');path='/proc/'+str(known['pid'])
    try:s=os.stat(path,follow_symlinks=False)
    except FileNotFoundError as e:need(e.errno==errno.ENOENT,'PG4_D_ACTOR_PATH_UNKNOWN');return {'role':role,'pid':known['pid'],'present':False,'currentPathAbsent':True,'originalKernelExitProved':False,'complete':True}
    need((s.st_dev,s.st_ino)==(known['procDevice'],known['procInode']),'PG4_D_ACTOR_PID_REUSED')
    with held(os.pidfd_open(known['pid'],0),'ACTOR_PIDFD'):
        again=os.stat(path,follow_symlinks=False);need((again.st_dev,again.st_ino)==(s.st_dev,s.st_ino),'PG4_D_ACTOR_ATTACH_CHANGED');a={'requestedPID':known['pid'],'boot':boot,'listedProcIdentity':{'device':s.st_dev,'inode':s.st_ino},'identityBound':True,'observedIdentity':None};now=process_record(known['pid'],boot,a);need(actor_core(now)==actor_core(known),'PG4_D_ACTOR_IDENTITY_CHANGED');return {'role':role,'pid':known['pid'],'present':True,'identityMatches':True,'originalKernelExitProved':False,'complete':True}
def physical(v):
    boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip();need(re.fullmatch(r'[a-f0-9-]{36}',boot),'PG4_D_BOOT_UNKNOWN');return {'boot':boot,'actors':[current_actor(v,k,boot) for k in ('owner','stop-post')],'unit':unit_frame(v),'cgroup':cgroup_frame(v),'docker':resource_frame(v)}
def scan_closed(s):
    listed=s['listedPIDs'];inspected=s['inspectedPIDs'];exits=[x['pid'] for x in s['exitedDuringScan']];unknown=s['readIncompletePIDs'];need(all(len(x)==len(set(x)) for x in (listed,inspected,exits,unknown)) and set(listed)==set(inspected)|set(exits)|set(unknown) and not(set(inspected)&set(exits) or set(inspected)&set(unknown) or set(exits)&set(unknown)),'PG4_D_CENSUS_COUNTS_NOT_CLOSED')
    for row in s['exitedDuringScan']:
        k=row['kernelProof'];need(k['type']=='pidfd-POLLIN' and k['attached'] is True and k['identityBound'] is True and k['requestedPID']==row['pid'] and k['exitConfirmed'] is True and k['procPathAbsent'] is True and k['pollEvents']&select.POLLIN and not k['pollEvents']&~(select.POLLIN|select.POLLHUP),'PG4_D_KERNEL_EXIT_UNBOUND')
    need(s['counts']=={'listed':len(listed),'inspected':len(inspected),'pidfdProvenExits':len(exits),'incomplete':len(unknown)},'PG4_D_CENSUS_DENOMINATOR_CHANGED');return not unknown and not s['relatedProcesses'] and all(x==0 for x in s['ack']['counts'].values())

def observe_pg4_failure_readiness_current_scope_r33(payload=None):
    out={'schemaVersion':1,'kind':'r33-pg4-failure-readiness-current-resource-scope-host-observation','protocol':PROTOCOL,'phase':'failure-readiness-current','ready':False,'observationReadComplete':False,'sourceRawBindingVerified':False,'failureCaptureSummary':None,'normalQAQualified':False,'currentBusinessQualified':False,'recordsStable':False,'namespaceStable':False,'currentResourceScopeClosedVerified':False,'originalRawFileRefs':{},'namespaceFrames':[],'physicalFrames':[],'processScans':[],'cliCaptures':[],'currentSourceRevalidation':None,'actualPG4Qualified':False,'productAccepted':False,'overallSourceFamilyQualified':False,'mutationsPerformed':False,'signalsSent':False,'resourcesRemoved':False,'modelsInvoked':False,'legacyCurrentProgramClaimedAsSingleEntry':False}
    if payload is None:out['errorCode']='PG4_D_ACTUAL_CONTEXT_REQUIRED';return out
    try:
        v=validate_payload(payload);out['attempt']=v['attempt'];out['scopeBinding']=v;out['contextSHA256']=v['contextSHA256'];need(os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0 and sys.flags.isolated==1,'PG4_D_ROOT_ISOLATED_REQUIRED');need(callable(globals().get('_census_pg4_original')) and callable(globals().get('_source_byte_revalidation_pg4')),'PG4_D_GENERATED_AUTHORITY_REQUIRED');bind_native_globals(v)
        globals()['_cli_captures_pg4']=out['cliCaptures'];first=namespace_read(v,out['originalRawFileRefs']);out['namespaceFrames'].append({k:x for k,x in first.items() if k!='records'});original_chain(v,first['records']);out['failureCaptureSummary']=readiness_capture_summary(decode(base64.b64decode(first['records'][FAILURE_NAME]['base64'],validate=True)));out['sourceRawBindingVerified']=True;out['physicalFrames'].append(physical(v))
        out['processScans'].append(_census_pg4_original());out['processScans'].append(_census_pg4_original())
        source=_source_byte_revalidation_pg4(v['sourceRevalidation']);out['currentSourceRevalidation']=source;out['sourceRevalidationPurpose']='phase-D-current-entity-bytes; internal phase-A label is not admission or closure';need(source['readComplete'] is True and source['sourceBytesAdmitted'] is True and source['dataDescriptorsClosed'] is True,'PG4_D_CURRENT_SOURCE_REVALIDATION_INCOMPLETE')
        second=namespace_read(v,out['originalRawFileRefs']);out['namespaceFrames'].append({k:x for k,x in second.items() if k!='records'});original_chain(v,second['records']);need(out['failureCaptureSummary']==readiness_capture_summary(decode(base64.b64decode(second['records'][FAILURE_NAME]['base64'],validate=True))),'PG4_D_FAILURE_CAPTURE_CHANGED');out['physicalFrames'].append(physical(v));out['recordsStable']=first['records']==second['records'];out['namespaceStable']=first['directories']==second['directories'];out['observationReadComplete']=True
        def clear(f):return all(a['complete'] and not a['present'] for a in f['actors']) and f['unit']['currentStopped'] and f['cgroup']['complete'] and f['cgroup']['absent'] and not f['cgroup']['members'] and all(r['absent'] for r in f['docker']['resources'].values()) and all(n==0 for c in f['docker']['labels'] for n in c.values())
        scans=out['processScans'];clean=all(scan_closed(s) for s in scans);need(scans[0]['node']==scans[1]['node'] and scans[0]['ack']==scans[1]['ack'],'PG4_D_NODE_OR_ACK_CHANGED')
        unix=[]
        for line in Path('/proc/net/unix').read_text().splitlines()[1:]:
            parts=line.split(maxsplit=7)
            if len(parts)==8 and in_workspace(parts[7].removeprefix('@')):unix.append(digest(parts[7]))
        out['namespaceSocketCount']=len(first['filesystemSockets'])+len(second['filesystemSockets'])+len(unix);out['currentResourceScopeClosedVerified']=out['recordsStable'] and out['namespaceStable'] and all(clear(f) for f in out['physicalFrames']) and clean and out['namespaceSocketCount']==0;out['ready']=out['currentResourceScopeClosedVerified']
    except BaseException as e:out['readError']=error(e,'OBSERVATION');out['ready']=False;out['currentResourceScopeClosedVerified']=False
    out['observedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();return out

def bind_native_globals(v):
    global p,account,h,process_record
    p={'workspace':v['namespace'],'agentId':'0b5aea06-47e1-4f4b-a32e-969417915c9c'};account=pwd.getpwnam('superopen');h=SimpleNamespace(open_directory=trusted_directory_fd);original=globals()['_process_record_pg4_original']
    def enriched(pid,boot,attachment=None):
        row=original(pid,boot,attachment);row['workspaceRelated']=row['workspaceRelated'] or pid in {x['pid'] for x in v['knownActors'].values()} or any(g=='/system.slice/'+v['unitBinding']['unit'] or g.startswith('/system.slice/'+v['unitBinding']['unit']+'/') or any(cid['identity'] in g for role,cid in v['resources'].items() if role in ('postgres','pg4-runner')) for g in row['cgroups']);return row
    process_record=enriched
def trusted(path):
    for q in [Path(path),*Path(path).parents]:s=q.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'PG4_D_PLATFORM_CHAIN_UNTRUSTED')
    return Path(path)
def trusted_directory_fd(path):
    trusted(Path(path).parent);before=os.stat(path,follow_symlinks=False);need(stat.S_ISDIR(before.st_mode) and before.st_uid in (0,account.pw_uid) and before.st_gid in (0,account.pw_gid) and not before.st_mode&0o077,'PG4_D_PLATFORM_DIRECTORY_UNTRUSTED');fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:need(stat_key(before)==stat_key(os.fstat(fd)),'PG4_D_PLATFORM_DIRECTORY_REPLACED');return fd
    except BaseException:
        with held(fd,'PLATFORM_ATTACH'):raise
def in_workspace(value):
    value=value.removesuffix(' (deleted)');return value==p['workspace'] or value.startswith(p['workspace']+'/')
def argv_workspace(value):return bool(re.search(r'(?<![A-Za-z0-9_./-])'+re.escape(p['workspace'])+r'(?=$|[/\s\x00\x22\x27])',value))
def unit_state():
    packet,raw,_=command(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,MainPID,ControlGroup']);need(packet['status']==0,'PG4_D_PLATFORM_UNIT_INCOMPLETE');v=decode_lines(raw);need(v.get('ActiveState')=='active' and re.fullmatch(r'[1-9][0-9]*',v.get('MainPID','')) and int(v['MainPID'])>1 and v.get('ControlGroup','').startswith('/system.slice/') and '..' not in v['ControlGroup'].split('/'),'PG4_D_PLATFORM_UNIT_UNKNOWN');return {'pid':int(v['MainPID']),'cgroup':v['ControlGroup']}
def decode_lines(raw):
    d={}
    for line in raw.decode('utf-8','strict').splitlines():k,v=line.split('=',1);need(k not in d,'PG4_D_PROPERTY_DUPLICATE');d[k]=v
    return d
