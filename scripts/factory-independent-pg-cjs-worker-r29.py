"""Finite CJS-only qualification. Root controls bytes; UID1000 loads package JS.

The original installer, frozen PG tree and R3 null consumer remain unchanged.
This controller never imports package JS, connects to a DB or runs product code.
"""
import ast,hashlib,json,os,re,stat,subprocess,sys,time,datetime
from pathlib import Path
from types import ModuleType
ROOT=Path('/var/lib/jarvis-development/101/r29-qa-pg-cjs')
LIBRARY=Path('/opt/jarvis-development/software-factory/factory-build-independent-pg-runtime-r29-r2-57eb441548b43362.py')
LIBRARY_SHA='57eb441548b433620b3b244724bb50f27abdbf981b0d5f0e031623b70cfc4ae5'
RUNTIME=Path('/var/lib/jarvis-development/101/r29-qa-pg-runtime/3c7ade1178fc47184cd9aaba9e84b855/runtime')
RAW_MANIFEST=RUNTIME.parent/'runtime-manifest.json'
MANIFEST_SHA='d916c96e199ab7230a6397cd1f4f6fdbceacf30588a16b6943dc8da2996b6eb1'
CONSUMER_SHA='45d888de21d3221a66d43d7d601de358338892f26d3d14c9b1ddb5dd32850c99'
QUALIFY_SHA='319acc6d1c767eaf90b12e560c7949aa4255ca836ac38469f66149f4b20f6e1a'
OUTSIDE_SHA='0e626b0f106fe3a80f34af11b5f3831a8afe1ee8ad8e407df05e0c9bd1ad12d8'
IMAGE='sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96'
H=re.compile('[a-f0-9]{64}')
COMMAND=['/usr/local/bin/node','/tools/qualify.mjs']

def need(v,c):
    if not v:raise RuntimeError(c)
def digest(v):return hashlib.sha256(v).hexdigest()
def attempt_valid(v):return isinstance(v,str) and re.fullmatch('[a-f0-9]{32}',v) is not None
def boot_read(path):
    parent=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    def ident(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
    try:
        for part in path.parts[1:-1]:
            v=os.stat(part,dir_fd=parent,follow_symlinks=False);need(stat.S_ISDIR(v.st_mode) and v.st_uid==v.st_gid==0 and not v.st_mode&0o022,'QA_CJS_PARENT_UNTRUSTED');n=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
            try:need(ident(v)==ident(os.fstat(n)),'QA_CJS_PARENT_CHANGED')
            except BaseException:os.close(n);raise
            os.close(parent);parent=n
        before=os.stat(path.name,dir_fd=parent,follow_symlinks=False);fd=os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
        try:
            s=os.fstat(fd);need(ident(s)==ident(before) and stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and not s.st_mode&0o222 and s.st_size<=100000,'QA_CJS_BOOT_FILE_UNTRUSTED');raw=b''
            while len(raw)<=100000:
                block=os.read(fd,min(65536,100001-len(raw)))
                if not block:break
                raw+=block
            need(len(raw)==s.st_size and ident(s)==ident(os.fstat(fd))==ident(os.stat(path.name,dir_fd=parent,follow_symlinks=False)),'QA_CJS_BOOT_FILE_CHANGED');return raw
        finally:os.close(fd)
    finally:os.close(parent)

def library():
    body=boot_read(LIBRARY);need(digest(body)==LIBRARY_SHA,'QA_CJS_LIFECYCLE_LIBRARY_CHANGED');m=ModuleType('trusted_pg_cjs_lifecycle');m.__file__=str(Path(__file__));exec(compile(body,str(LIBRARY),'exec'),m.__dict__)
    m.ROOT=ROOT;m.IMAGE=IMAGE;m.INSTALL=COMMAND;m.container_name=name;m.labels=labels;m.create_command=create_command;m.assert_container=assert_container;m.owner=owner;m.empty_labels=empty_labels;m.cleanup_cache_bindings=cleanup_mounts
    return m

def name(attempt):need(attempt_valid(attempt),'QA_CJS_ATTEMPT_INVALID');return 'jarvis-qa-pg-cjs-r29-'+attempt+'-qualify'
def labels(attempt):return {'jarvis.qa.pg.cjs.r29.attempt':attempt,'jarvis.qa.pg.cjs.r29.kind':'cjs-qualification'}
def mounts(attempt):return [{'name':'runtime','root':str(RUNTIME),'destination':'/qa-runtime'},{'name':'tools','root':str(ROOT/attempt/'tools'),'destination':'/tools'}]
def fresh(proof):
    need(proof.get('kind')=='software-factory-r29-new-protection-contract-observation' and proof.get('ready') is True and proof.get('contractId')=='9bf97027-a7f6-4706-b7ad-fcb29c304e41' and all(proof.get(k) is True for k in ['protectedInventoryFullyVerified','fullQueueSQLVerified','nodeACKIdle','queueIdle','profileUnchanged']) and proof.get('productAccepted') is False and proof.get('modelsInvoked') is False,'QA_CJS_NEW_PROTECTION_UNPROVEN')
    try:at=datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00')).timestamp()
    except (KeyError,ValueError,TypeError):raise RuntimeError('QA_CJS_PROTECTION_TIME_INVALID')
    need(-30<=time.time()-at<300,'QA_CJS_PROTECTION_STALE')

def load(attempt):
    global B,ACTIVE
    need(os.geteuid()==0 and attempt_valid(attempt),'QA_CJS_ROOT_SCOPE_REQUIRED');B=library();private=ROOT/attempt;B.root_directory(private,True);control=private/'control';B.root_directory(control,True);v=json.loads(B.read_private(control/'activation.json'))
    need(set(v)=={'schemaVersion','kind','attempt','workerSHA256','imageID','runtimeRoot','manifestSHA256','fullByteProofSHA256','librarySHA256','pins'} and v['schemaVersion']==1 and v['kind']=='r29-independent-pg-cjs-exact-activation' and v['attempt']==attempt and v['workerSHA256']==B.self_source() and v['imageID']==IMAGE and v['runtimeRoot']==str(RUNTIME) and v['manifestSHA256']==MANIFEST_SHA and v['fullByteProofSHA256']=='6ecc84270d932d63a5c980e34d345da6de63018e531c4cb3805765218e42f8a4' and v['librarySHA256']==LIBRARY_SHA,'QA_CJS_ACTIVATION_CHANGED')
    pins=v['pins'];need(set(pins)=={'reviewSHA256','protectionSHA256','toolsContractSHA256'} and all(isinstance(x,str) and H.fullmatch(x) for x in pins.values()),'QA_CJS_ACTIVATION_PINS_CHANGED')
    for file,key in [('review.json','reviewSHA256'),('protection.json','protectionSHA256'),('tools-contract.json','toolsContractSHA256')]:need(digest(B.read_private(control/file))==pins[key],'QA_CJS_CONTROL_PIN_CHANGED')
    review=json.loads(B.read_private(control/'review.json'));need(review.get('workerSHA256')==v['workerSHA256'] and review.get('staticPreparationReady') is True and review.get('remainingP0P1')==0 and review.get('actualCJSQualified') is False,'QA_CJS_REVIEW_UNPROVEN')
    ACTIVE=v;B.CACHE_CONTRACT_PIN=pins['toolsContractSHA256'];return v

def preflight(attempt):
    load(attempt);private=ROOT/attempt;contract_raw=B.read_private(private/'control'/'tools-contract.json');contract=json.loads(contract_raw)
    expected={'schemaVersion':1,'kind':'r29-independent-pg-cjs-readonly-tools','attempt':attempt,'runtimeRoot':str(RUNTIME),'manifestSHA256':MANIFEST_SHA,'mounts':mounts(attempt),'files':{'consumer.mjs':CONSUMER_SHA,'qualify.mjs':QUALIFY_SHA,'outside.cjs':OUTSIDE_SHA,'r29-qa-runtime-manifest.json':MANIFEST_SHA}}
    need(contract==expected,'QA_CJS_TOOLS_CONTRACT_CHANGED');fresh(json.loads(B.read_private(private/'control'/'protection.json')))
    tools=private/'tools';s=tools.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==s.st_gid==0 and stat.S_IMODE(s.st_mode)==0o555 and sorted(os.listdir(tools))==sorted(contract['files']),'QA_CJS_TOOLS_DIRECTORY_CHANGED')
    for filename,pin in contract['files'].items():need(digest(B.read_private(tools/filename))==pin and stat.S_IMODE((tools/filename).lstat().st_mode)==0o444,'QA_CJS_TOOL_BYTES_CHANGED')
    need(B.read_private(RAW_MANIFEST)==B.read_private(tools/'r29-qa-runtime-manifest.json'),'QA_CJS_RAW_MANIFEST_COPY_CHANGED');s=RUNTIME.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==s.st_gid==0 and stat.S_IMODE(s.st_mode)==0o555,'QA_CJS_RUNTIME_NOT_READONLY')
    return contract_raw

def create_command(attempt,unused,caches):
    need(caches==mounts(attempt),'QA_CJS_MOUNTS_CHANGED');args=['create','--pull=never','--init','--name',name(attempt),'--network','none','--user','1000:1000','--security-opt','no-new-privileges','--cap-drop','ALL','--read-only','--memory','512m','--cpus','1','--pids-limit','64','--tmpfs','/tmp:rw,nosuid,nodev,size=32m','--workdir','/tmp']
    for k,v in {'CI':'1','HOME':'/tmp','NODE_PATH':'','NODE_OPTIONS':'','PG_FORCE_NATIVE':'','PGHOST':'','PGPORT':'','PGDATABASE':'','PGUSER':'','PGPASSWORD':''}.items():args+=['--env',k+'='+v]
    for row in caches:args+=['--mount','type=bind,src='+row['root']+',dst='+row['destination']+',readonly']
    for k,v in labels(attempt).items():args+=['--label',k+'='+v]
    return args+['--entrypoint',COMMAND[0],IMAGE,COMMAND[1]]

def assert_container(v,attempt,unused,caches):
    need(isinstance(v,dict) and v.get('Image')==IMAGE and v.get('Name')=='/'+name(attempt),'QA_CJS_CONTAINER_IDENTITY_CHANGED');c=v.get('Config',{});h=v.get('HostConfig',{})
    need(c.get('User')=='1000:1000' and c.get('Entrypoint')==COMMAND[:1] and c.get('Cmd')==COMMAND[1:] and c.get('WorkingDir')=='/tmp' and not c.get('Volumes') and not c.get('Healthcheck') and all(c.get('Labels',{}).get(k)==x for k,x in labels(attempt).items()),'QA_CJS_CONTAINER_CONFIG_CHANGED')
    need(h.get('NetworkMode')=='none' and h.get('ReadonlyRootfs') is True and h.get('Privileged') is False and h.get('CapDrop')==['ALL'] and h.get('CapAdd') in [None,[]] and h.get('SecurityOpt')==['no-new-privileges'] and h.get('PidsLimit')==64 and h.get('Memory')==512*1024**2 and h.get('NanoCpus')==10**9 and h.get('Init') is True and not h.get('Devices') and not h.get('DeviceRequests') and not h.get('PortBindings') and h.get('Tmpfs')=={'/tmp':'rw,nosuid,nodev,size=32m'},'QA_CJS_CONTAINER_ISOLATION_CHANGED')
    env=c.get('Env');need(isinstance(env,list) and all(isinstance(x,str) for x in env),'QA_CJS_CONTAINER_ENV_CHANGED')
    for k,x in {'CI':'1','HOME':'/tmp','NODE_PATH':'','NODE_OPTIONS':'','PG_FORCE_NATIVE':'','PGHOST':'','PGPORT':'','PGDATABASE':'','PGUSER':'','PGPASSWORD':''}.items():need([z for z in env if z.startswith(k+'=')]==[k+'='+x],'QA_CJS_CONTAINER_ENV_CHANGED')
    need(not any(z.split('=',1)[0] in ['LD_PRELOAD','LD_LIBRARY_PATH','BASH_ENV','ENV'] for z in env),'QA_CJS_CONTAINER_ENV_CHANGED');actual=v.get('Mounts');need(isinstance(actual,list) and len(actual)==2 and caches==mounts(attempt),'QA_CJS_CONTAINER_MOUNTS_CHANGED')
    for row in caches:
        found=[m for m in actual if m.get('Destination')==row['destination']];need(len(found)==1 and found[0].get('Type')=='bind' and found[0].get('Source')==row['root'] and found[0].get('RW') is False,'QA_CJS_CONTAINER_MOUNTS_CHANGED')
    return v

def empty_labels(attempt,deadline=None):
    for filters in [['label=jarvis.qa.pg.cjs.r29.attempt='+attempt],['label=jarvis.qa.pg.cjs.r29.attempt='+attempt,'label=jarvis.qa.pg.cjs.r29.kind=cjs-qualification']]:
        for head in [['ps','-aq'],['network','ls','-q'],['volume','ls','-q']]:
            args=list(head)
            for f in filters:args+=['--filter',f]
            left=10 if deadline is None else min(10,deadline-time.monotonic());need(left>0,'QA_CJS_CLEANUP_DEADLINE_EXCEEDED');r=B.docker(args,timeout=left);need(r.returncode==0 and not r.stdout.strip(),'QA_CJS_LABEL_SCOPE_NOT_EMPTY')

def cleanup_mounts(private,intent,deadline):
    raw=B.read_private(private/'cache-contract.json',deadline=deadline);need(digest(raw)==B.CACHE_CONTRACT_PIN and intent.get('cacheContractSHA256')==B.CACHE_CONTRACT_PIN,'QA_CJS_CLEANUP_CONTRACT_CHANGED');v=json.loads(raw);need(v.get('attempt')==private.name and v.get('mounts')==mounts(private.name) and v.get('manifestSHA256')==MANIFEST_SHA,'QA_CJS_CLEANUP_MOUNTS_CHANGED');return v['mounts']

def owner(attempt):
    unit='jarvis-qa-pg-cjs-r29-'+attempt+'-owner.service';need(os.environ.get('JARVIS_R29_CJS_OWNER_UNIT')==unit,'QA_CJS_OWNER_REQUIRED');r=subprocess.run(['/usr/bin/systemctl','show',unit,'--property=ActiveState,MainPID,ControlGroup,RuntimeMaxUSec,TimeoutStopUSec,KillMode,ExecStopPost,Restart'],capture_output=True,text=True,timeout=10,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'});need(r.returncode==0,'QA_CJS_OWNER_READ_FAILED');v=dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x)
    need(v.get('ActiveState')=='active' and v.get('MainPID')==str(os.getpid()) and v.get('ControlGroup')=='/system.slice/'+unit and v.get('RuntimeMaxUSec')=='5min' and v.get('TimeoutStopUSec')=='2min' and v.get('KillMode')=='control-group' and v.get('Restart')=='no','QA_CJS_OWNER_CONTRACT_CHANGED')
    post=re.fullmatch(r'\{\s*path=([^;{}]+?)\s*;\s*argv\[\]=(.*?)\s*;\s*ignore_errors=(yes|no)\s*;[^{}]*\}',v.get('ExecStopPost',''));need(post is not None and post.group(1)=='/usr/bin/python3' and post.group(2).split()==['/usr/bin/python3',str(Path(__file__)),'--reconcile-cleanup',attempt] and post.group(3)=='no','QA_CJS_STOPPOST_CHANGED')
    return {'unit':unit,'pid':os.getpid(),'startTicks':Path('/proc/self/stat').read_text().rsplit(')',1)[1].split()[19],'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'controlGroup':v['ControlGroup'],'runtimeMaxSec':300,'stopTimeoutSec':120,'restart':'no','killMode':'control-group'}

def launch(attempt):
    contract=preflight(attempt);private=ROOT/attempt;need(set(os.listdir(private))=={'control','tools'},'QA_CJS_DUPLICATE_ONCE_USE_CHECK');need(B.container(attempt) is None,'QA_CJS_RESOURCE_ALREADY_EXISTS');empty_labels(attempt);fresh(json.loads(B.read_private(private/'control'/'protection.json')))
    B.store(private/'once.json',{'schemaVersion':1,'kind':'r29-independent-pg-cjs-once-intent','attempt':attempt,'workerSHA256':B.self_source(),'imageID':IMAGE,'activationSHA256':digest(B.read_private(private/'control'/'activation.json')),'automaticRetry':False});unit='jarvis-qa-pg-cjs-r29-'+attempt+'-owner.service'
    argv=['/usr/bin/systemd-run','--unit='+unit,'--collect','--no-block','--property=User=root','--property=Type=simple','--property=KillMode=control-group','--property=RuntimeMaxSec=300','--property=TimeoutStopSec=120','--property=Restart=no','--property=WorkingDirectory=/','--property=Environment=JARVIS_R29_CJS_OWNER_UNIT='+unit,'--property=ExecStopPost=/usr/bin/python3 '+str(Path(__file__))+' --reconcile-cleanup '+attempt,'/usr/bin/python3',str(Path(__file__)),'--run',attempt]
    fresh(json.loads(B.read_private(private/'control'/'protection.json')));r=subprocess.run(argv,capture_output=True,timeout=20,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'});need(r.returncode==0,'QA_CJS_LAUNCH_AMBIGUOUS_USE_CHECK');return {'attempt':attempt,'dispatched':True,'ownerUnit':unit}

def run(attempt):
    contract=preflight(attempt);private=ROOT/attempt;intent=json.loads(B.read_private(private/'once.json'));need(intent.get('workerSHA256')==B.self_source() and intent.get('attempt')==attempt,'QA_CJS_ONCE_CHANGED');need(not os.path.lexists(private/'state.json'),'QA_CJS_DUPLICATE_RUN_USE_CHECK');owned=owner(attempt);need(B.container(attempt) is None,'QA_CJS_RESOURCE_ALREADY_EXISTS');empty_labels(attempt)
    image=B.docker(['image','inspect',IMAGE]);need(image.returncode==0,'QA_CJS_IMAGE_UNREADABLE');B.assert_image(json.loads(image.stdout));B.store_bytes(private/'cache-contract.json',contract)
    result={'schemaVersion':1,'kind':'r29-independent-pg-cjs-qualification-state','attempt':attempt,'workerSHA256':B.self_source(),'imageID':IMAGE,'owner':owned,'status':'running','containerID':None,'cacheContractSHA256':B.CACHE_CONTRACT_PIN,'sourceUID':1000,'productSourceMounted':False,'productCodeExecuted':False,'modelsInvoked':False,'rootPackageJavaScriptExecuted':False,'actualCJSQualified':False}
    state=private/'state.json';B.store(state,result)
    try:
        fresh(json.loads(B.read_private(private/'control'/'protection.json')));B.store(private/'creation-intent.json',B.creation_intent(attempt,mounts(attempt)));fresh(json.loads(B.read_private(private/'control'/'protection.json')));r=B.docker(create_command(attempt,None,mounts(attempt)));need(r.returncode==0,'QA_CJS_CONTAINER_CREATE_FAILED');v=assert_container(B.container(attempt),attempt,None,mounts(attempt));cid=v.get('Id');need(isinstance(cid,str) and H.fullmatch(cid) and r.stdout.decode().strip()==cid,'QA_CJS_CREATED_ID_CHANGED');result['containerID']=cid;B.replace_state(state,result)
        stream=B.install_stream(cid,private/'qualify.log');v=assert_container(B.container(attempt),attempt,None,mounts(attempt));need(v['Id']==cid,'QA_CJS_CONTAINER_ID_CHANGED');s=v.get('State',{});result.update(stream);result['containerStopped']=s.get('Running') is False;result['containerExitCode']=s.get('ExitCode')
        raw=B.read_private(private/'qualify.log',4*1024*1024);report=json.loads(raw);need(report.get('schemaVersion')==1 and report.get('kind')=='r29-independent-pg-cjs-qualification' and report.get('denominator')==16 and report.get('manifestSHA256')==MANIFEST_SHA and report.get('networkCalls')==0 and report.get('databaseConnected') is False and report.get('queriesIssued')==0 and report.get('productionDBAccessed') is False,'QA_CJS_EXECUTION_REPORT_INVALID');result['qualification']=report
        expected=['nonroot','trusted-outside-preload','actual-pg-loaded','actual-pool-constructor','actual-client-constructor','builtin-resolution','native-client-rejected','external-preloaded-fastpath-rejected','external-initializer-not-reexecuted','unsafe-node-options-rejected','unsafe-node-path-rejected','forced-native-rejected','actual-cache-closure','actual-post-load-full-tree','no-network-method-called','loader-hooks-restored'];checks=report.get('checks',[])
        complete=isinstance(checks,list) and checks==[{'id':k,'status':'pass'} for k in expected] and all(report.get(k) is True for k in ['actualPGRequired','actualPoolConstructed','actualClientConstructed'])
        result['status']='qualified' if report.get('status')=='pass' and report.get('passed')==16 and report.get('failed')==0 and complete and result['containerStopped'] and result['containerExitCode']==0 and stream['cliExitCode']==0 and not stream['boundedStop'] else 'failed';result['actualCJSQualified']=result['status']=='qualified'
    except BaseException as e:result['status']='failed';result['errorCode']=str(e) if re.fullmatch('QA_(?:CJS|PG)_[A-Z0-9_]+',str(e)) else 'QA_CJS_OPERATION_FAILED'
    finally:B.finish_install(attempt,state,result)
    return result

def main():
    if len(sys.argv)==1 or sys.argv[1]=='--inspect':print(json.dumps({'kind':'r29-independent-pg-cjs-preparation','ready':False,'actualCJSQualified':False,'remoteOperations':False}));return
    need(len(sys.argv)==3 and attempt_valid(sys.argv[2]) and sys.argv[1] in ['--launch','--run','--check','--reconcile-cleanup'],'QA_CJS_ARGUMENTS_INVALID');a=sys.argv[2]
    if sys.argv[1]=='--launch':value=launch(a)
    elif sys.argv[1]=='--run':value=run(a)
    else:
        load(a);value=B.reconcile_cleanup(a) if sys.argv[1]=='--reconcile-cleanup' else json.loads(B.read_private(ROOT/a/'state.json'))
    print(json.dumps(value))
if __name__=='__main__':main()
