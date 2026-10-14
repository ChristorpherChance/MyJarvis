"""Two source-bound saved inspect packets. No unit, journal or resource command."""
import base64,contextlib,datetime,hashlib,json,os,re,signal,stat,sys
PROTOCOL='PG4_INSPECT_CAPTURE_BYTES_R5_V1'
BASE='/var/lib/jarvis-development/101/r33-pg4-qa-startup-main602-proof-r5'
ATTEMPT='69e5926d169160f2b70eaab63c1b4e23'
STATE='c690c40f2098838b6888b4990b91c63a03a0cbfe462db2e3d77e4709af1bf44d'
WORKER='e8d429453fe41a9c71c02f4c9daea8b123d47ed1a468674dfaa719253bbc9eb6'
STARTER='617693457e5822640c316b1c3838f33b9b81266184e96f0dfdc2ebc0ca1cfd4a'
RECORDS={'work/inspect-pg4-runner-cd1b5fb207baa0ef.json':{'sha256':'3782b41b438b7c052be6a661d6a1c67fbe3baf0a9a4861b7bfaf0a162d4eddef','bytes':14764},'work/inspect-pg4-runner-44e7814dfcab893e.json':{'sha256':'160f8feb4d0dc7e48f1908144d5f457694d97b0541d14eed978ed4429e0ea967','bytes':14764}}


def need(v,c):
    if not v:raise RuntimeError(c)

def digest(v):return hashlib.sha256(v if isinstance(v,bytes) else str(v).encode()).hexdigest()

def canonical(v):return json.dumps(v,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()

def stat_key(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]

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
    code=str(e);return {'phase':getattr(e,'pg4_phase',phase),'errorCode':code if re.fullmatch('(PG4_CB|PG4_D)_[A-Z0-9_]+',code) else 'PG4_CB_READ_INCOMPLETE','errno':getattr(e,'errno',None),'secondaryFailures':getattr(e,'pg4_secondary',[])}

def read_pair(root,name,pin,row):
    parent,_,leaf=name.rpartition('/');raw=bytearray()
    try:
        with chain(root+'/'+parent) as directory:
            before=os.stat(leaf,dir_fd=directory,follow_symlinks=False);meta=stat_key(before);row['metadata']=meta
            need(stat.S_ISREG(before.st_mode) and before.st_uid==before.st_gid==0 and before.st_nlink==1 and stat.S_IMODE(before.st_mode)==0o600 and before.st_size==pin['bytes'],'PG4_CB_FILE_POLICY_CHANGED')
            with held(os.open(leaf,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=directory),'FIRST_FILE') as first:
                need(meta==stat_key(os.fstat(first)),'PG4_CB_FILE_REPLACED')
                while len(raw)<=pin['bytes']:
                    block=os.read(first,min(65536,pin['bytes']+1-len(raw)))
                    if not block:break
                    raw.extend(block)
                row.update({'base64':base64.b64encode(raw).decode(),'sha256':digest(bytes(raw)),'bytes':len(raw)})
                need(len(raw)==pin['bytes'] and row['sha256']==pin['sha256'] and meta==stat_key(os.fstat(first))==stat_key(os.stat(leaf,dir_fd=directory,follow_symlinks=False)),'PG4_CB_FIRST_READ_CHANGED');row['firstReadComplete']=True
            with held(os.open(leaf,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=directory),'SECOND_FILE') as second:
                need(meta==stat_key(os.fstat(second))==stat_key(os.stat(leaf,dir_fd=directory,follow_symlinks=False)),'PG4_CB_FILE_REPLACED');offset=0;h=hashlib.sha256()
                while offset<len(raw):
                    block=os.read(second,min(65536,len(raw)-offset));need(block and block==raw[offset:offset+len(block)],'PG4_CB_SECOND_READ_CHANGED');h.update(block);offset+=len(block)
                need(not os.read(second,1) and h.hexdigest()==pin['sha256'] and meta==stat_key(os.fstat(second))==stat_key(os.stat(leaf,dir_fd=directory,follow_symlinks=False)),'PG4_CB_SECOND_READ_CHANGED')
                row['secondReadComplete']=True
        row.update({'readComplete':True,'twoHeldReadsStable':True,'metadataSHA256':digest(canonical(meta))})
    except BaseException:
        row.update({'readComplete':False,'partialBase64':base64.b64encode(raw).decode(),'partialSHA256':digest(bytes(raw)),'partialBytes':len(raw)});row.pop('base64',None);raise

def validate(p):
    need(type(p) is dict and set(p)=={'schemaVersion','kind','protocol','attempt','sourceExpected','stateSHA256','records'},'PG4_CB_EXPLICIT_INPUT_REQUIRED')
    need(p['schemaVersion']==1 and p['kind']=='r33-pg4-main602-proof-r5-inspect-capture-byte-input' and p['protocol']==PROTOCOL and p['attempt']==ATTEMPT,'PG4_CB_CONTEXT_CHANGED')
    need(p['sourceExpected']=={'workerSHA256':WORKER,'starterSHA256':STARTER} and p['stateSHA256']==STATE and p['records']==RECORDS,'PG4_CB_SOURCE_BINDING_CHANGED');return p

def run(payload=None):
    p=validate(payload);rows={name:{'readComplete':False,'firstReadComplete':False,'secondReadComplete':False,'twoHeldReadsStable':False} for name in RECORDS};first=None;phase='profile'
    v={'schemaVersion':1,'kind':'r33-pg4-main602-proof-r5-inspect-capture-byte-observation','protocol':PROTOCOL,'attempt':ATTEMPT,'sourceExpected':p['sourceExpected'],'stateSHA256':STATE,'files':rows,'readComplete':False,'firstClosedError':None,'secondaryClosedErrors':[],'allReaderDescriptorsClosed':False,'originalIntegerDomainPreserved':True,'readOnly':True,'currentWorkerRemoteBytesRead':False,'historicalFailureConjunctDetermined':False,'currentResourceScopeClosedVerified':False,'actualPG4Qualified':False,'fullProtectionQualified':False,'modelsInvoked':False,'mutationsPerformed':False,'signalsSent':False,'resourcesRemoved':False}
    try:
        need(os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0 and sys.flags.isolated==1,'PG4_CB_ROOT_PROFILE_REQUIRED')
        v['readerProfile']={'uid':os.getuid(),'euid':os.geteuid(),'gid':os.getgid(),'egid':os.getegid(),'isolated':sys.flags.isolated};need(0<signal.getitimer(signal.ITIMER_REAL)[0]<=30,'PG4_CB_INHERITED_TIMER_REQUIRED')
        for name,pin in RECORDS.items():
            phase=name
            try:read_pair(BASE+'/'+ATTEMPT,name,pin,rows[name])
            except BaseException as e:
                if not hasattr(e,'pg4_phase'):e.pg4_phase=name
                if first is None:first=e
                else:v['secondaryClosedErrors'].append(closed(e,name))
                if str(e)=='PG4_CB_DEADLINE':break
        if first is not None:raise first
        v['readComplete']=True;v['allReaderDescriptorsClosed']=True
    except BaseException as e:
        first=e;v['firstClosedError']=closed(e,phase);v['secondaryClosedErrors']+=getattr(e,'pg4_secondary',[])
    v['completedFiles']=sum(r.get('readComplete') is True for r in rows.values());v['observedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();return v
