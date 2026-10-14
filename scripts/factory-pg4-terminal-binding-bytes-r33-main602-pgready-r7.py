"""Exactly five terminal binding files; no process, resource, SQL or namespace census."""
import base64,contextlib,datetime,hashlib,json,os,re,signal,stat,sys
PROTOCOL='PG4_TERMINAL_BINDING_BYTES_R5_V1'
STARTUP='PG4_QA_STARTUP_R33_V1'
BASE='/var/lib/jarvis-development/101/r33-pg4-qa-startup-main602-pgready-r7'
WORKER='0859e9094b63c4bf763cb18ed09e8c62daf893b9c225f54e5786885fac01f61c'
STARTER='ec468a5dc86041aa178f4ef8623391f20d88577049ff7dcc676aaa5fe386e5c3'
ROLES=('postgres','pg4-runner','internal-network','postgres-data')
FILES=('state.json',)+tuple('work/'+r+'.created.json' for r in ROLES)
H=re.compile(r'[a-f0-9]{64}\Z')

def need(v,c):
    if not v:raise RuntimeError(c)


def digest(v):return hashlib.sha256(v if isinstance(v,bytes) else str(v).encode()).hexdigest()


def canonical(v):return json.dumps(v,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()


def stat_key(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]


def decode(raw):
    def pairs(rows):
        out={}
        for k,v in rows:need(k not in out,'PG4_D_JSON_DUPLICATE');out[k]=v
        return out
    return json.loads(raw,object_pairs_hook=pairs,parse_constant=lambda _:need(False,'PG4_D_JSON_NONFINITE'))


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


def validate(p):
    need(type(p) is dict and set(p)=={'schemaVersion','kind','protocol','attempt','terminalStatus','knownActors','sourceExpected','records'},'PG4_TB_INPUT_REQUIRED')
    need(p['schemaVersion']==1 and p['kind']=='r33-pg4-main602-pgready-r7-terminal-binding-byte-input' and p['protocol']==PROTOCOL and re.fullmatch('[a-f0-9]{32}',p['attempt'] or ''),'PG4_TB_CONTEXT_CHANGED')
    need(p['terminalStatus'] in ('failed','completed-unqualified','owner-state-unknown'),'PG4_TB_TERMINAL_REQUIRED')
    s=p['sourceExpected'];need(type(s) is dict and set(s)=={'workerSHA256','starterSHA256','driverSHA256','sourceContractSHA256'} and s['workerSHA256']==WORKER and s['starterSHA256']==STARTER and all(H.fullmatch(v or '') for v in s.values()),'PG4_TB_SOURCE_CHANGED')
    need(type(p['records']) is dict and set(p['records'])==set(FILES),'PG4_TB_EXACT_FIVE_PINS_REQUIRED')
    for name,pin in p['records'].items():
        limit=67108864 if name=='state.json' else 1048576
        need(pin is None or type(pin) is dict and set(pin)=={'sha256','bytes'} and H.fullmatch(pin['sha256'] or '') and type(pin['bytes']) is int and 0<pin['bytes']<=limit,'PG4_TB_FILE_PIN_CHANGED')
    need(type(p['knownActors']) is dict and set(p['knownActors'])=={'owner','stop-post'},'PG4_TB_KNOWN_ACTORS_REQUIRED')
    for a in p['knownActors'].values():
        if a is None:continue
        need(type(a) is dict and all(type(a.get(k)) is int and a[k]>=(0 if k in ('ppid','procDevice') else 1) for k in ('pid','ppid','procDevice','procInode')) and re.fullmatch('[0-9]+',a.get('startTicks','')) and re.fullmatch('[a-f0-9-]{36}',a.get('boot','')) and a.get('uid')==a.get('gid')==0,'PG4_TB_ACTOR_HISTORY_REQUIRED')
    if all(a is not None for a in p['knownActors'].values()):need(p['knownActors']['owner']['pid']!=p['knownActors']['stop-post']['pid'] and p['knownActors']['owner']['boot']==p['knownActors']['stop-post']['boot'],'PG4_TB_ACTOR_RELATION_CHANGED')
    return p

def closed(e,phase):
    code=str(e);return {'phase':getattr(e,'pg4_phase',phase),'errorCode':code if re.fullmatch('(PG4_TB|PG4_D)_[A-Z0-9_]+',code) else 'PG4_TB_READ_INCOMPLETE','errno':getattr(e,'errno',None),'secondaryFailures':getattr(e,'pg4_secondary',[])}

def run(payload=None):
    # Validation precedes every OS observation; None is an honest preparation refusal.
    p=validate(payload);out={};second={};first=None;phase='profile';namespace=BASE+'/'+p['attempt']
    value={'schemaVersion':1,'kind':'r33-pg4-main602-pgready-r7-terminal-binding-byte-observation','protocol':PROTOCOL,'attempt':p['attempt'],'sourceExpected':p['sourceExpected'],'terminalStatus':p['terminalStatus'],'knownActors':p['knownActors'],'files':out,'readComplete':False,'firstClosedError':None,'secondaryClosedErrors':[],'allReaderDescriptorsClosed':False,'originalIntegerDomainPreserved':True,'readOnly':True,'knownActorHistoryComplete':all(a is not None for a in p['knownActors'].values()),'currentResourceScopeClosedVerified':False,'actualPG4Qualified':False,'fullProtectionQualified':False,'modelsInvoked':False,'mutationsPerformed':False}
    try:
        need(os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0 and sys.flags.isolated==1,'PG4_TB_ROOT_READER_PROFILE_REQUIRED')
        value['readerProfile']={'uid':os.getuid(),'euid':os.geteuid(),'gid':os.getgid(),'egid':os.getegid(),'isolated':sys.flags.isolated}
        need(0<signal.getitimer(signal.ITIMER_REAL)[0]<=30,'PG4_TB_INHERITED_TIMER_REQUIRED')
        for name in FILES:
            try:
                phase=name
                if p['records'][name] is None:
                    parent,_,leaf=name.rpartition('/')
                    with chain(namespace+('/'+parent if parent else '')) as fd:os.stat(leaf,dir_fd=fd,follow_symlinks=False)
                    raise RuntimeError('PG4_TB_UNPINNED_FILE_PRESENT')
                file_row(namespace,name,p['records'][name],out)
                phase=name+'_second';file_row(namespace,name,p['records'][name],second)
                need(out[name]==second[name],'PG4_TB_TWO_READS_CHANGED');out[name]['twoReadsStable']=True
            except BaseException as e:
                if first is None:first=e
                else:value['secondaryClosedErrors'].append(closed(e,phase))
                if str(e)=='PG4_TB_DEADLINE':break
        if first is not None:raise first
        state=decode(base64.b64decode(out['state.json']['base64'],validate=True))
        need(state.get('protocol')==STARTUP and state.get('attempt')==p['attempt'] and state.get('status')==p['terminalStatus'] and (p['knownActors']['owner'] is None or state.get('owner')==p['knownActors']['owner']),'PG4_TB_ORIGINAL_STATE_CONTEXT_CHANGED')
        for role in ROLES:
            row=decode(base64.b64decode(out['work/'+role+'.created.json']['base64'],validate=True))
            need(row.get('kind')=='r33-pg4-resource-created' and row.get('protocol')==STARTUP and row.get('attempt')==p['attempt'] and row.get('role')==role and type(row.get('identity')) is str,'PG4_TB_CREATED_CONTEXT_CHANGED')
        value['readComplete']=True;value['allReaderDescriptorsClosed']=True
    except BaseException as e:
        first=e;value['firstClosedError']=closed(e,phase);value['secondaryClosedErrors']+=getattr(e,'pg4_secondary',[])
    value['completedFiles']=sum(r.get('readComplete') is True and r.get('twoReadsStable') is True for r in out.values())
    value['observedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();return value
