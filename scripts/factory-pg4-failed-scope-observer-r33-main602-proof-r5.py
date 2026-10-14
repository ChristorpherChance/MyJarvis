"""Failure-only r5 current scope. Original runner receipt remains missing."""
import base64,contextlib,datetime,errno,hashlib,json,os,posixpath,pwd,re,select,sqlite3,stat,subprocess,sys
from pathlib import Path
from types import SimpleNamespace
PROTOCOL='PG4_FAILED_SCOPE_RECOVERY_R5_V1'
STARTUP='PG4_QA_STARTUP_R33_V1'
BASE='/var/lib/jarvis-development/101/r33-pg4-qa-startup-main602-proof-r5'
ATTEMPT='69e5926d169160f2b70eaab63c1b4e23'
UNIT='jarvis-pg4-qa-r33-main602-proof-r5-'+ATTEMPT+'.service'
INVOCATION='871677b985be4d0db1af91d9ac7329a1'
RUNNER_ID='34294fbf42662eac178a67a2362ecdcf8436db6363663c7ddf30483e5939c9b4'
ROLES=('postgres','pg4-runner','internal-network','postgres-data')
H=re.compile(r'[a-f0-9]{64}\Z')
CORE=('pid','ppid','startTicks','boot','procDevice','procInode')
WORKER='e8d429453fe41a9c71c02f4c9daea8b123d47ed1a468674dfaa719253bbc9eb6'
STATE_H='c690c40f2098838b6888b4990b91c63a03a0cbfe462db2e3d77e4709af1bf44d'
INSPECT_H='3782b41b438b7c052be6a661d6a1c67fbe3baf0a9a4861b7bfaf0a162d4eddef'


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

def error(e,phase):return {'phase':getattr(e,'pg4_phase',phase),'errorCode':str(e) if re.fullmatch(r'(PG4_RF|PG4_D|PG4_A|R29_CLEANUP)_[A-Z0-9_]+',str(e)) else 'PG4_D_READ_INCOMPLETE','errno':getattr(e,'errno',None),'secondaryFailures':getattr(e,'pg4_secondary',[])}

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
    p='jarvis-pg4-qa-r33-main602-proof-r5-'+attempt;return {'postgres':p+'-postgres','pg4-runner':p+'-runner','internal-network':p+'-net','postgres-data':p+'-data'}

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

def command(args):
    try:r=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'},check=False)
    except subprocess.TimeoutExpired as e:
        stdout=e.stdout or b'';stderr=e.stderr or b'';globals().get('_cli_captures_pg4',[]).append({'status':None,'timedOut':True,'stdoutBase64':base64.b64encode(stdout[:16777216]).decode(),'stderrBase64':base64.b64encode(stderr[:16777216]).decode(),'retention':'partial-returned-prefix-not-complete'});raise
    packet={'status':r.returncode,'stdoutBase64':base64.b64encode(r.stdout[:16777216]).decode(),'stderrBase64':base64.b64encode(r.stderr[:16777216]).decode(),'retention':'original-returned-bytes' if len(r.stdout)+len(r.stderr)<=16777216 else 'partial-overflow-prefix'};globals().get('_cli_captures_pg4',[]).append(packet)
    need(len(r.stdout)+len(r.stderr)<=16777216,'PG4_D_CLI_LIMIT');return packet,r.stdout,r.stderr

def argv_of(value):
    need(type(value) is str and value.startswith('{ ') and value.endswith(' }') and value.count('{')==value.count('}')==1,'PG4_D_UNIT_COMMAND_UNKNOWN');pairs=[]
    for part in value[2:-2].split(';'):
        if part.strip():need('=' in part,'PG4_D_UNIT_COMMAND_UNKNOWN');pairs.append(part.strip().split('=',1))
    d=dict(pairs);need(len(d)==len(pairs) and set(d)<={'path','argv[]','ignore_errors','start_time','stop_time','pid','code','status'} and d.get('path')=='/usr/bin/python3' and d.get('ignore_errors')=='no','PG4_D_UNIT_COMMAND_UNKNOWN');return d.get('argv[]','').split()

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

def scan_closed(s):
    listed=s['listedPIDs'];inspected=s['inspectedPIDs'];exits=[x['pid'] for x in s['exitedDuringScan']];unknown=s['readIncompletePIDs'];need(all(len(x)==len(set(x)) for x in (listed,inspected,exits,unknown)) and set(listed)==set(inspected)|set(exits)|set(unknown) and not(set(inspected)&set(exits) or set(inspected)&set(unknown) or set(exits)&set(unknown)),'PG4_D_CENSUS_COUNTS_NOT_CLOSED')
    for row in s['exitedDuringScan']:
        k=row['kernelProof'];need(k['type']=='pidfd-POLLIN' and k['attached'] is True and k['identityBound'] is True and k['requestedPID']==row['pid'] and k['exitConfirmed'] is True and k['procPathAbsent'] is True and k['pollEvents']&select.POLLIN and not k['pollEvents']&~(select.POLLIN|select.POLLHUP),'PG4_D_KERNEL_EXIT_UNBOUND')
    need(s['counts']=={'listed':len(listed),'inspected':len(inspected),'pidfdProvenExits':len(exits),'incomplete':len(unknown)},'PG4_D_CENSUS_DENOMINATOR_CHANGED');return not unknown and not s['relatedProcesses'] and all(x==0 for x in s['ack']['counts'].values())

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

def history(v):
    h=v['history'];raw=base64.b64decode(h['stateRawBase64'],validate=True);need(digest(raw)==STATE_H and len(raw)==11859,'PG4_RF_STATE_HISTORY_CHANGED');state=decode(raw)
    frame=decode(base64.b64decode(h['diagnosticStdoutBase64'],validate=True));need(frame['files']['state.json']['base64']==h['stateRawBase64'] and frame['files']['state.json']['sha256']==STATE_H,'PG4_RF_STATE_METADATA_HISTORY_CHANGED')
    capture=base64.b64decode(h['runnerCaptureRawBase64'],validate=True);need(digest(capture)==INSPECT_H and len(capture)==14764,'PG4_RF_RUNNER_HISTORY_CHANGED');packet=decode(capture);need(packet['status']==0 and packet['complete'] is True,'PG4_RF_RUNNER_HISTORY_INCOMPLETE');data=decode(base64.b64decode(packet['stdoutBase64'],validate=True));need(type(data) is list and len(data)==1,'PG4_RF_RUNNER_HISTORY_INCOMPLETE');runner=data[0]
    need(state['protocol']==STARTUP and state['attempt']==ATTEMPT and state['status']=='failed' and state['phase']=='preflight' and state['firstFailure']['errorCode']=='PG4_R33_CONTAINER_IDENTITY_CHANGED','PG4_RF_ORIGINAL_FAILURE_CHANGED')
    need(actor_core(state['owner'])=={'pid':2110850,'ppid':1,'startTicks':'40514946','boot':'328726a0-5495-4892-b0a6-2fa9de26242e','procDevice':24,'procInode':70194193},'PG4_RF_OWNER_HISTORY_CHANGED')
    resources={'pg4-runner':{'name':names(ATTEMPT)['pg4-runner'],'identity':RUNNER_ID}};originals={'state.json':frame['files']['state.json']}
    for role in ('postgres','internal-network','postgres-data'):
        key='work/'+role+'.created.json';row=frame['files'][key];raw=base64.b64decode(row['base64'],validate=True);need(digest(raw)==row['sha256'] and len(raw)==row['bytes'],'PG4_RF_CREATED_HISTORY_CHANGED');c=decode(raw);need(c['kind']=='r33-pg4-resource-created' and c['attempt']==ATTEMPT and c['protocol']==STARTUP and c['role']==role,'PG4_RF_CREATED_HISTORY_CHANGED');resources[role]={'name':names(ATTEMPT)[role],'identity':c['identity']};originals[key]=row
    need(runner['Id']==RUNNER_ID and runner['Name']=='/'+resources['pg4-runner']['name'] and runner['Created']=='2026-10-14T04:35:14.144877402Z' and runner['State']['Status']=='created' and runner['State']['Running'] is False and runner['State']['Pid']==0,'PG4_RF_RUNNER_HISTORY_CHANGED')
    return state,frame,runner,resources,originals

def validate_payload(v):
    need(type(v) is dict and set(v)=={'schemaVersion','kind','protocol','phase','attempt','namespace','unitBinding','sourceExpected','sourceRevalidation','history','contextSHA256'} and v['schemaVersion']==1 and v['kind']=='r33-pg4-failed-scope-observation-input' and v['protocol']==PROTOCOL and v['phase'] in ('preflight','post') and v['attempt']==ATTEMPT,'PG4_RF_ACTUAL_PARAMETERS_REQUIRED')
    need(v['namespace']==BASE+'/'+ATTEMPT and v['unitBinding']=={'unit':UNIT,'invocationId':INVOCATION} and v['sourceExpected']['workerSHA256']==WORKER and digest(canonical({k:x for k,x in v.items() if k!='contextSHA256'}))==v['contextSHA256'],'PG4_RF_SCOPE_BINDING_CHANGED');return v

def assert_runner(value,saved):
    need(type(value) is dict and value.get('Id')==RUNNER_ID and value.get('Name')==saved.get('Name') and value.get('Created')==saved.get('Created') and value.get('Image')==saved.get('Image'),'PG4_RF_RUNNER_EXACT_ID_CHANGED')
    need(all(value.get(k)==saved.get(k) for k in ('Config','HostConfig','Mounts')),'PG4_RF_RUNNER_CONFIGURATION_CHANGED')
    s=value.get('State',{});need(s.get('Status')=='created' and s.get('Running') is False and s.get('Pid')==0 and not s.get('Restarting',False) and not s.get('Paused',False),'PG4_RF_RUNNER_RUNNING_OR_STATE_UNKNOWN');return True

def inspect_one(kind,target):
    packet,raw,err=command(['/usr/bin/docker',kind,'inspect',target])
    patterns={'container':r'(?:Error: )?No such (?:object|container): '+re.escape(target),'network':r'(?:Error response from daemon: )?network '+re.escape(target)+' not found','volume':r'Error response from daemon: get '+re.escape(target)+r': no such volume'}
    absent=packet['status']==1 and raw.strip() in (b'',b'[]') and re.fullmatch(patterns[kind],err.decode('utf-8','strict').strip(),re.I) is not None;need(absent or packet['status']==0,'PG4_RF_RESOURCE_ABSENCE_UNKNOWN')
    if absent:return None
    data=decode(raw);need(type(data) is list and len(data)==1 and type(data[0]) is dict,'PG4_RF_CURRENT_INSPECT_INCOMPLETE');return data[0]

def resource_frame(v,saved):
    facts={};allowed=set()
    for role in ROLES:
        row=v['resources'][role];kind='network' if role=='internal-network' else 'volume' if role=='postgres-data' else 'container';by_name=inspect_one(kind,row['name']);by_id=by_name if row['name']==row['identity'] else inspect_one(kind,row['identity'])
        absent=by_name is None and by_id is None
        if not absent:
            need(by_name is not None and by_id is not None and (by_name['Name'] if kind=='volume' else by_name['Id'])==row['identity'] and by_name==by_id,'PG4_RF_RESOURCE_ID_OR_NAME_CHANGED')
            if role=='pg4-runner':assert_runner(by_id,saved);allowed.add(row['identity'])
            else:raise RuntimeError('PG4_RF_OTHER_RECORDED_RESOURCE_PRESENT')
        facts[role]={'absent':absent,'exactPresentRunner':not absent and role=='pg4-runner','complete':True}
    labels=[]
    for label in ('jarvis.pg4.r33.attempt='+ATTEMPT,'jarvis.pg4.r33.kind=qa-startup-four-cases-v1'):
        row={}
        for kind,args in [('containers',['ps','--no-trunc','-aq']),('networks',['network','ls','--no-trunc','-q']),('volumes',['volume','ls','-q'])]:
            packet,raw,_=command(['/usr/bin/docker',*args,'--filter','label='+label]);need(packet['status']==0,'PG4_RF_LABEL_READ_INCOMPLETE');ids=raw.decode('ascii','strict').split();need(len(ids)==len(set(ids)) and set(ids)==(allowed if kind=='containers' else set()),'PG4_RF_LABEL_SCOPE_CHANGED');row[kind]=len(ids)
        labels.append(row)
    return {'resources':facts,'labels':labels,'complete':True}

def unit_frame(v):
    fields=('Id','InvocationID','LoadState','ActiveState','SubState','MainPID','ControlGroup','RuntimeMaxUSec','TimeoutStopUSec','KillMode','Restart','NoNewPrivileges','User','Group','ExecStart','ExecStopPost','PrivateTmp','UMask');packet,raw,_=command(['/usr/bin/systemctl','show',UNIT,*['--property='+x for x in fields]]);need(packet['status']==0,'PG4_RF_UNIT_INCOMPLETE');props=decode_lines(raw);need(props.get('Id')==UNIT and set(props)<=set(fields),'PG4_RF_UNIT_SCOPE_CHANGED')
    if props.get('LoadState')=='loaded':
        need(set(props)==set(fields) and props['InvocationID']==INVOCATION and props['RuntimeMaxUSec']=='15min' and props['TimeoutStopUSec']=='2min' and props['KillMode']=='control-group' and props['Restart']=='no' and props['NoNewPrivileges']=='yes' and props['User'] in ('root','0') and props['Group'] in ('root','0') and props['PrivateTmp']=='yes' and props['UMask']=='0077','PG4_RF_UNIT_INSTANCE_OR_PROFILE_CHANGED')
        for key,action in [('ExecStart','--run'),('ExecStopPost','--stop')]:need(argv_of(props[key])==['/usr/bin/python3','-I',v['namespace']+'/control/worker.py',action,ATTEMPT],'PG4_RF_UNIT_COMMAND_CHANGED')
    else:need(props.get('LoadState')=='not-found' and set(props)==set(fields)-{'ExecStart','ExecStopPost'} and props['InvocationID']=='' and props['ControlGroup']=='' and props['MainPID']=='0' and props['ActiveState']=='inactive','PG4_RF_UNIT_NOT_FOUND_UNKNOWN')
    return {'properties':props,'missingCommandProperties':['ExecStart','ExecStopPost'] if props['LoadState']=='not-found' else [],'currentStopped':props['ActiveState'] in ('inactive','failed') and props['MainPID']=='0' and props['ControlGroup'] in ('','/system.slice/'+UNIT),'complete':True,'capture':packet}

def namespace_read(v,out):
    root=v['namespace'];directories={};rows={};sockets=[];total=0
    def walk(fd,relative,depth):
        nonlocal total
        need(depth<=8 and len(directories)<=1024,'PG4_RF_NAMESPACE_LIMIT');before=stat_key(os.fstat(fd));listed=sorted(os.listdir(fd));directories[relative]=before
        for name in listed:
            need(re.fullmatch(r'[A-Za-z0-9._-]+',name),'PG4_RF_NAMESPACE_NAME_CHANGED');info=os.stat(name,dir_fd=fd,follow_symlinks=False);rel=relative+'/'+name if relative else name
            if stat.S_ISDIR(info.st_mode):
                need(info.st_uid==info.st_gid==(1000 if rel=='evidence' else 0) and not info.st_mode&0o022,'PG4_RF_NAMESPACE_DIRECTORY_UNTRUSTED')
                with held(os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd),'NAMESPACE_CHILD') as child:need(stat_key(info)==stat_key(os.fstat(child)),'PG4_RF_NAMESPACE_REPLACED');walk(child,rel,depth+1)
            elif stat.S_ISSOCK(info.st_mode):sockets.append({'pathSHA256':digest(rel),'device':info.st_dev,'inode':info.st_ino})
            else:
                need(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and len(rows)<512 and info.st_size<=67108864,'PG4_RF_NAMESPACE_FILE_UNTRUSTED');total+=info.st_size;need(total<=134217728,'PG4_RF_NAMESPACE_BYTE_LIMIT')
                pin={'sha256':None,'bytes':info.st_size};parent,_,leaf=rel.rpartition('/');owner=1000 if parent=='evidence' else 0
                with chain(root+('/'+parent if parent else ''),owner) as directory:
                    with held(os.open(leaf,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=directory),'NAMESPACE_FILE') as f:
                        need(info.st_uid==info.st_gid==owner and not info.st_mode&0o022 and stat_key(info)==stat_key(os.fstat(f)),'PG4_RF_NAMESPACE_FILE_CHANGED');raw=bytearray()
                        while len(raw)<=info.st_size:
                            block=os.read(f,min(65536,info.st_size+1-len(raw)))
                            if not block:break
                            raw.extend(block)
                        need(len(raw)==info.st_size and stat_key(info)==stat_key(os.fstat(f))==stat_key(os.stat(leaf,dir_fd=directory,follow_symlinks=False)),'PG4_RF_NAMESPACE_FILE_CHANGED');pin['sha256']=digest(bytes(raw))
                rows[rel]=file_row(root,rel,pin,out)
        need(listed==sorted(os.listdir(fd)) and before==stat_key(os.fstat(fd)),'PG4_RF_NAMESPACE_CHANGED')
    with chain(root) as fd:walk(fd,'',0)
    return {'directories':directories,'records':rows,'identity':{'device':directories[''][0],'inode':directories[''][1]},'metadataSHA256':digest(canonical(directories)),'filesystemSockets':sockets}

def original_failure_chain(v,rows,saved,old_rows):
    raw=lambda n:decode(base64.b64decode(rows[n]['base64'],validate=True));a=raw('control/activation.json');once=raw('once.json');state=raw('state.json');s=v['sourceExpected'];need(all(x['protocol']==STARTUP and x['attempt']==ATTEMPT for x in (a,once,state)),'PG4_RF_ORIGINAL_ATTEMPT_CHANGED')
    need(a['workerSHA256']==once['workerSHA256']==s['workerSHA256']==rows['control/worker.py']['sha256'] and a['starterSHA256']==s['starterSHA256'] and a['driverSHA256']==s['driverSHA256'] and a['sourceContractSHA256']==once['sourceContractSHA256']==s['sourceContractSHA256'],'PG4_RF_ORIGINAL_SOURCE_CHANGED')
    for name,previous in old_rows.items():need(rows[name]['sha256']==previous['sha256'] and rows[name]['bytes']==previous['bytes'] and rows[name]['metadata']==previous['metadata'],'PG4_RF_ORIGINAL_RECORD_CHANGED')
    need('work/pg4-runner.created.json' not in rows and state['status']=='failed' and state['phase']=='preflight' and state['firstFailure']['errorCode']=='PG4_R33_CONTAINER_IDENTITY_CHANGED' and not state.get('sql') and not state.get('reports'),'PG4_RF_ORIGINAL_FAILURE_CHANGED')
    need(all(rows['control/'+k]['sha256']==h for k,h in a['controlPins'].items()) and all(rows['tools/'+k]['sha256']==h for k,h in a['toolPins'].items()),'PG4_RF_ORIGINAL_CONTROL_OR_TOOLS_CHANGED')
    stop=None
    if 'work/stopped.json' in rows:
        record=raw('work/stopped.json');need(record['kind']=='r33-pg4-qa-startup-stopped' and record['protocol']==STARTUP and record['attempt']==ATTEMPT,'PG4_RF_STOP_HISTORY_CHANGED');stop=record.get('stopIdentity');actor_core(stop);need(stop.get('uid')==stop.get('gid')==0 and stop.get('unit')==UNIT and stop.get('controlGroup')=='/system.slice/'+UNIT and stop.get('noNewPrivileges')==1,'PG4_RF_STOP_HISTORY_CHANGED')
    v['knownActors']={'owner':saved['owner']}
    if stop is not None:v['knownActors']['stop-post']=stop
    return stop

def physical(v,saved):
    boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip();need(re.fullmatch(r'[a-f0-9-]{36}',boot),'PG4_RF_BOOT_UNKNOWN');actors=[current_actor(v,'owner',boot)]
    actors.append(current_actor(v,'stop-post',boot) if 'stop-post' in v['knownActors'] else {'role':'stop-post','pid':None,'present':None,'complete':False,'historyUnknown':True,'originalKernelExitProved':False})
    return {'boot':boot,'actors':actors,'unit':unit_frame(v),'cgroup':cgroup_frame(v),'docker':resource_frame(v,saved)}

def observe_pg4_qa_current_scope_r33(payload=None):
    out={'schemaVersion':1,'kind':'r33-pg4-failed-scope-host-observation','protocol':PROTOCOL,'ready':False,'observationReadComplete':False,'sourceRawBindingVerified':False,'recordsStable':False,'namespaceStable':False,'readyForExactRunnerRecovery':False,'currentResourceScopeClosedVerified':False,'unknownOriginalRunnerCreationIdentityPreserved':True,'originalPG4Failed':True,'originalRawFileRefs':{},'namespaceFrames':[],'physicalFrames':[],'processScans':[],'cliCaptures':[],'currentSourceRevalidation':None,'actualPG4Qualified':False,'productAccepted':False,'overallSourceFamilyQualified':False,'mutationsPerformed':False,'signalsSent':False,'resourcesRemoved':False,'modelsInvoked':False}
    if payload is None:out['errorCode']='PG4_RF_ACTUAL_CONTEXT_REQUIRED';return out
    try:
        v=validate_payload(payload);out['attempt']=ATTEMPT;out['phase']=v['phase'];out['contextSHA256']=v['contextSHA256'];need(os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0 and sys.flags.isolated==1,'PG4_RF_ROOT_ISOLATED_REQUIRED');saved,prior,runner,resources,old_rows=history(v);v['resources']=resources
        globals()['_cli_captures_pg4']=out['cliCaptures'];first=namespace_read(v,out['originalRawFileRefs']);stop=original_failure_chain(v,first['records'],saved,old_rows);bind_native_globals(v);out['stopHistoryUnknown']=stop is None;out['sourceRawBindingVerified']=True;out['namespaceFrames'].append({k:x for k,x in first.items() if k!='records'});out['physicalFrames'].append(physical(v,runner))
        out['processScans'].append(_census_pg4_original());out['processScans'].append(_census_pg4_original());source=_source_byte_revalidation_pg4(v['sourceRevalidation']);out['currentSourceRevalidation']=source;need(source['readComplete'] is True and source['sourceBytesAdmitted'] is True and source['dataDescriptorsClosed'] is True,'PG4_RF_CURRENT_SOURCE_REVALIDATION_INCOMPLETE')
        second=namespace_read(v,out['originalRawFileRefs']);original_failure_chain(v,second['records'],saved,old_rows);out['namespaceFrames'].append({k:x for k,x in second.items() if k!='records'});out['physicalFrames'].append(physical(v,runner));out['recordsStable']=first['records']==second['records'];out['namespaceStable']=first['directories']==second['directories'];out['observationReadComplete']=True
        scans=out['processScans'];clean=all(scan_closed(s) for s in scans);need(scans[0]['node']==scans[1]['node'] and scans[0]['ack']==scans[1]['ack'],'PG4_RF_NODE_OR_ACK_CHANGED')
        unix=[]
        for line in Path('/proc/net/unix').read_text().splitlines()[1:]:
            parts=line.split(maxsplit=7)
            if len(parts)==8 and in_workspace(parts[7].removeprefix('@')):unix.append(digest(parts[7]))
        out['namespaceSocketCount']=len(first['filesystemSockets'])+len(second['filesystemSockets'])+len(unix)
        def physical_clean(f):return all(a['complete'] and a['present'] is False for a in f['actors']) and f['unit']['currentStopped'] and f['cgroup']['complete'] and f['cgroup']['absent'] and not f['cgroup']['members']
        common=out['recordsStable'] and out['namespaceStable'] and not out['stopHistoryUnknown'] and all(physical_clean(f) for f in out['physicalFrames']) and clean and out['namespaceSocketCount']==0
        all_absent=all(all(r['absent'] for r in f['docker']['resources'].values()) and all(n==0 for c in f['docker']['labels'] for n in c.values()) for f in out['physicalFrames'])
        recoverable=all(f['docker']['resources']['pg4-runner']['exactPresentRunner'] and all(f['docker']['resources'][r]['absent'] for r in ('postgres','internal-network','postgres-data')) for f in out['physicalFrames'])
        out['currentProcessScopeClean']=common;out['readyForExactRunnerRecovery']=common and recoverable and v['phase']=='preflight';out['currentResourceScopeClosedVerified']=common and all_absent and v['phase']=='post';out['ready']=out['readyForExactRunnerRecovery'] or out['currentResourceScopeClosedVerified']
    except BaseException as e:out['readError']=error(e,'OBSERVATION');out['ready']=False;out['readyForExactRunnerRecovery']=False;out['currentResourceScopeClosedVerified']=False
    out['observedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();return out
