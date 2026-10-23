"""Fixed root wrapper delegated by the existing forced SSH dispatcher; never a shell."""
import hashlib
import json
import math
import os
from pathlib import Path
import re
import signal
import socket
import stat
import subprocess
import sys
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

CONFIG = Path('/etc/jarvis-ai-development/node.json')
LEGACY = Path('/etc/jarvis-ops/node.json')
CODE = Path('/opt/jarvis-ai-development')
STATE = Path('/var/lib/jarvis-ai-development-node')
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
SHA = re.compile(r'^[a-f0-9]{64}$')
SLUG = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$')
PROVIDER_ENV = frozenset(['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_BASE_URL','ANTHROPIC_MODEL','ANTHROPIC_DEFAULT_HAIKU_MODEL','ANTHROPIC_DEFAULT_SONNET_MODEL','ANTHROPIC_DEFAULT_OPUS_MODEL','ANTHROPIC_DEFAULT_FABLE_MODEL','CLAUDE_CODE_SUBAGENT_MODEL','CLAUDE_CODE_MAX_OUTPUT_TOKENS'])

def require(ok, code):
    if not ok: raise RuntimeError(code)

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf-8')

def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()

def exact(value, keys):
    require(isinstance(value, dict) and not set(value).difference(keys), 'UNEXPECTED_FIELDS')

def safe_text(value, maximum=300):
    require(isinstance(value, str) and len(value) <= maximum and not any(ord(c)<32 or ord(c)==127 for c in value), 'INVALID_PUBLIC_TEXT')
    return value

def no_links(path):
    path=Path(path)
    require(path.is_absolute(), 'ABSOLUTE_PATH_REQUIRED')
    current=Path(path.anchor)
    for part in path.parts[1:]:
        current=current/part
        require(not stat.S_ISLNK(current.lstat().st_mode), 'LINKED_STORAGE')

def read_safe(path, owner=0, maximum=524288, private=False):
    path=Path(path);no_links(path);before=path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid==owner and before.st_nlink==1 and before.st_size<=maximum and not before.st_mode&0o022 and (not private or not before.st_mode&0o077), 'UNSAFE_FILE')
    fd=os.open(path, os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        a=os.fstat(fd)
        with os.fdopen(fd,'rb',closefd=False) as stream:raw=stream.read(maximum+1)
        b=os.fstat(fd)
        signature=lambda s:(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
        require(signature(a)==signature(before)==signature(b) and len(raw)==a.st_size, 'FILE_CHANGED')
        return raw
    finally:os.close(fd)

def read_json(path, **options):
    return json.loads(read_safe(path,**options))

def atomic(path, value):
    path=Path(path);no_links(path.parent)
    if path.exists():
        s=path.lstat();require(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1, 'UNSAFE_DESTINATION')
    temporary=path.with_name(path.name+'.'+str(uuid.uuid4())+'.tmp')
    fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    try:
        with os.fdopen(fd,'wb',closefd=False) as stream:stream.write(canonical(value));stream.flush();os.fsync(fd)
    finally:os.close(fd)
    try:
        os.replace(temporary,path)
        directory=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(directory)
        finally:os.close(directory)
    finally:
        if temporary.exists():temporary.unlink()

def timestamp(value):
    require(isinstance(value,str),'INVALID_DEADLINE')
    parsed=datetime.fromisoformat(value.replace('Z','+00:00'))
    require(parsed.tzinfo is not None,'INVALID_DEADLINE')
    return parsed.timestamp()

def validate_providers(providers):
    require(isinstance(providers,list) and len(providers)<=32,'INVALID_PROVIDERS')
    ids=set()
    for p in providers:
        exact(p,{'id','name','settingsConfig'});require(isinstance(p.get('id'),str) and SLUG.fullmatch(p['id']) and p['id'] not in ids,'INVALID_PROVIDER_ID');ids.add(p['id']);safe_text(p['name'])
        settings=p['settingsConfig'];exact(settings,{'env','model'});env=settings.get('env',{})
        require(isinstance(env,dict) and not set(env).difference(PROVIDER_ENV),'INVALID_PROVIDER_ENV')
        for value in env.values():safe_text(value,8192)
        if 'model' in settings:safe_text(settings['model'],300)
    require(len(canonical(providers))<=45000,'PROVIDERS_TOO_LARGE')
    return providers

def validate_envelope(envelope, config, legacy, now=None):
    now=time.time() if now is None else now
    exact(envelope,{'schemaVersion','mode','operation','id','machineId','request','providers'})
    require(envelope.get('schemaVersion')==1 and envelope.get('mode')=='ai-development' and envelope.get('operation') in ('start','status','observe'),'INVALID_MODE')
    require(isinstance(envelope.get('id'),str) and UUID.fullmatch(envelope['id']),'INVALID_JOB_ID')
    require(envelope.get('machineId')==config['machineId']==legacy['machineId'] and legacy['hostname']==socket.gethostname() and config['hostname']==socket.gethostname(),'NODE_IDENTITY_DIFFERS')
    r=envelope['request'];exact(r,{'schemaVersion','id','commandId','machineId','machineRevision','nodeId','address','targetUser','action','profileId','profileRevision','profileHash','policyHash','bindingHash','createdAt','expiresAt','actorId','authorizationHash','profile'})
    require(r.get('schemaVersion')==1 and r.get('id')==envelope['id'] and r.get('machineId')==config['machineId'] and r.get('nodeId')==config['nodeId'] and r.get('targetUser')==config['targetUser'] and r.get('action') in ('probe','configure','telemetry'),'REQUEST_TARGET_DIFFERS')
    require(type(r.get('machineRevision')) is int and r['machineRevision']>0 and isinstance(r.get('address'),str) and r['address']==config['address'],'REQUEST_TARGET_DIFFERS')
    require(all(isinstance(r.get(k),str) and SHA.fullmatch(r[k]) for k in ['profileHash','policyHash','bindingHash','authorizationHash']),'INVALID_REQUEST_HASH')
    profile=next((p for p in config['profiles'] if p['id']==r.get('profileId')),None)
    require(profile and r.get('profileRevision')==profile['revision'] and r['profileHash']==profile['publicHash'] and digest(r['profile'])==profile['publicHash'],'PROFILE_PIN_DIFFERS')
    binding={k:r[k] for k in ['machineId','machineRevision','address','nodeId','targetUser','action','profileId','profileRevision','profileHash','policyHash']}
    require(digest(binding)==r['bindingHash'],'BINDING_DIFFERS')
    created,expires=timestamp(r['createdAt']),timestamp(r['expiresAt'])
    require(created<=now+5 and 0<expires-created<=900,'INVALID_DEADLINE')
    if envelope['operation'] in ('start','observe'):require(expires>now,'REQUEST_EXPIRED')
    if envelope['operation']=='observe':require(r['action']=='telemetry' and 'providers' not in envelope,'OBSERVE_REQUIRES_TELEMETRY')
    if 'providers' in envelope:
        require(envelope['operation']=='start' and r['action']=='configure','UNEXPECTED_PROVIDERS');validate_providers(envelope['providers'])
    return r,profile

def validate_modules(config):
    expected={'node-dispatcher.py','provision.py','terminal-statusline.py','profile-manifest.json'}
    require(set(config['modules'])==expected,'MODULE_SET_DIFFERS')
    for name,sha in config['modules'].items():
        require(SHA.fullmatch(sha) and hashlib.sha256(read_safe(CODE/name)).hexdigest()==sha,'MODULE_PIN_DIFFERS')

def process_identity(pid):
    try:
        raw=Path('/proc')/str(pid)/'stat';fields=raw.read_text().rsplit(')',1)[1].split()
        return fields[19]
    except (OSError,IndexError):return None

def public_receipt(state):
    return {k:state[k] for k in ['schemaVersion','id','machineId','bindingHash','profileId','profileRevision','profileHash','status','at','summary','inventory'] if k in state}

def initial_receipt(r):
    return {'schemaVersion':1,**{k:r[k] for k in ['id','machineId','bindingHash','profileId','profileRevision','profileHash']},'status':'running','at':datetime.now(timezone.utc).isoformat(),'summary':'Fixed operation accepted; not yet verified'}

STATUSLINE_STATES={'match','missing','different','invalid','unreadable','unknown','not-applicable'}
STATUSLINE_LAYERS={'SCRIPT','GLOBAL','COMMON','CURRENT_PROVIDER'}
STATUSLINE_REASONS={f'STATUSLINE_{layer}_{state.replace("-","_").upper()}' for layer in STATUSLINE_LAYERS for state in STATUSLINE_STATES}
STATUSLINE_REASONS.update(f'STATUSLINE_PROVIDER_COUNT_{state}' for state in ('ZERO','MATCHED','MISSING','DIFFERENT','INVALID','UNKNOWN'))
STATUSLINE_COUNTS=('total','matched','missing','different','invalid','unknown')

def sanitize_statusline_diagnostics(value):
    if not isinstance(value,dict) or 'diagnosticsVersion' not in value or value.get('diagnosticsVersion')!=1:return None
    layers=value.get('layers');providers=value.get('providers');codes=value.get('reasonCodes')
    if not isinstance(layers,dict) or set(layers)!={'script','global','common','currentProvider'} or any(v not in STATUSLINE_STATES for v in layers.values()):return None
    if not isinstance(providers,dict) or set(providers)!=set(STATUSLINE_COUNTS) or any(type(providers.get(k)) is not int or providers[k]<0 or providers[k]>9007199254740991 for k in STATUSLINE_COUNTS):return None
    if providers['total']!=sum(providers[k] for k in STATUSLINE_COUNTS[1:]):return None
    if not isinstance(codes,list) or len(codes)>34 or any(code not in STATUSLINE_REASONS for code in codes):return None
    return {'diagnosticsVersion':1,'layers':{k:layers[k] for k in ('script','global','common','currentProvider')},'providers':{k:providers[k] for k in STATUSLINE_COUNTS},'reasonCodes':list(dict.fromkeys(codes))}

def sanitize_inventory(value):
    require(isinstance(value,dict) and isinstance(value.get('tools'),list) and len(value['tools'])<=20 and isinstance(value.get('providers'),list) and len(value['providers'])<=32,'INVALID_INVENTORY')
    nullable=lambda v,maximum=300:None if v is None else safe_text(v,maximum)
    out={'schemaVersion':1,'tools':[],'providers':[]}
    for t in value['tools']:
        require(isinstance(t,dict) and isinstance(t.get('name'),str) and SLUG.fullmatch(t['name']) and type(t.get('installed')) is bool,'INVALID_TOOL')
        out['tools'].append({'name':t['name'],'version':nullable(t.get('version'),100),'installed':t['installed'],'path':nullable(t.get('path'),2000),'matchesPinned':t.get('matchesPinned') is True,'authStatus':t.get('authStatus') if t.get('authStatus') in ('configured','missing','unknown') else 'unknown'})
    for p in value['providers']:
        require(isinstance(p.get('id'),str) and SLUG.fullmatch(p['id']),'INVALID_PROVIDER_ID')
        out['providers'].append({'id':p['id'],'name':safe_text(p['name']),'model':nullable(p.get('model')),'credentialConfigured':p.get('credentialConfigured') is True,'current':p.get('current') is True})
    if 'observedAt' in value:out['observedAt']=safe_text(value['observedAt'],100)
    if isinstance(value.get('statusline'),dict):
        s=value['statusline'];sha=s.get('commandSHA256')
        out['statusline']={'configured':s.get('configured') is True,'commandSHA256':sha if isinstance(sha,str) and SHA.fullmatch(sha) else None,'scope':'global-and-provider','resources':s.get('resources') is True}
        diagnostics=sanitize_statusline_diagnostics(s)
        if diagnostics:out['statusline'].update(diagnostics)
    def numbers(v,keys):
        return {k:v[k] for k in keys if isinstance(v,dict) and k in v and (v[k] is None or type(v[k]) in (int,float) and math.isfinite(v[k]) and 0<=v[k]<=9007199254740991)}
    out['resources']=None if value.get('resources') is None else numbers(value['resources'],['cpuPercent','ramUsedBytes','ramTotalBytes','diskFreeBytes','diskTotalBytes','load1m'])
    s=value.get('sessionSummary')
    if isinstance(s,dict):
        keys=['contextTokens','contextWindow','currentInputTokens','currentOutputTokens','cacheReadTokens','cacheCreationTokens','sessionCostUSD','rateLimitFiveHourPercent','rateLimitSevenDayPercent'];counts=numbers(s,keys)
        out['terminalTelemetry']={'schemaVersion':1,'observedAt':safe_text(s['observedAt'],100),'sessionId':s['sessionId'] if isinstance(s.get('sessionId'),str) and re.fullmatch(r'[A-Za-z0-9_-]{1,128}',s['sessionId']) else None,**{k:nullable(s.get(k)) for k in ['model','provider']},**{k:counts.get(k) for k in keys},'billingStatus':'estimated' if s.get('billingStatus')=='estimated' else 'unknown'}
    else:out['terminalTelemetry']=None
    return out

def provision_result(envelope, config, r, profile, timeout):
    import pwd
    user=pwd.getpwnam(config['targetUser']);require(user.pw_uid>=1000 and user.pw_uid!=0 and user.pw_shell not in ('/usr/sbin/nologin','/bin/false'),'ORDINARY_USER_REQUIRED');no_links(Path(user.pw_dir));require(Path(user.pw_dir).stat().st_uid==user.pw_uid,'HOME_OWNER_DIFFERS')
    payload={'schemaVersion':1,'action':r['action'],'profileId':r['profileId']}
    if 'providers' in envelope:payload['providers']=envelope['providers']
    process=None
    try:
        process=subprocess.Popen(['/usr/sbin/runuser','-u',user.pw_name,'--','/usr/bin/python3','-I',str(CODE/'provision.py')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,start_new_session=True,env={'PATH':'/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8','HOME':user.pw_dir,'USER':user.pw_name,'LOGNAME':user.pw_name})
        output,_=process.communicate(canonical(payload),timeout=timeout)
        require(len(output)<=524288,'PROVISION_OUTPUT_TOO_LARGE');result=json.loads(output)
        require(result.get('schemaVersion')==1 and result.get('profileId')==r['profileId'] and result.get('profileRevision')==r['profileRevision'] and result.get('profileHash')==profile['manifestSHA256'] and result.get('action')==r['action'],'PROVISION_BINDING_DIFFERS')
        inventory=sanitize_inventory(result['inventory'])
        return {'status':'succeeded' if process.returncode==0 and (r['action']!='configure' or result.get('complete') is True) else 'failed','inventory':inventory,'summary':'Fixed provision result and installed profile identity checked'}
    except subprocess.TimeoutExpired:
        if process:
            try:os.killpg(process.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            process.communicate()
        return {'status':'unknown','summary':'Operation exceeded its authorization deadline; no replay'}
    except Exception:return {'status':'failed','summary':'Fixed provision or its bound inventory could not be verified'}

def validate_state():
    no_links(STATE);st=STATE.stat();require(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and stat.S_IMODE(st.st_mode)==0o700,'UNSAFE_STATE_DIRECTORY')

@contextmanager
def locked(name, nonblocking=False):
    import fcntl
    lock_fd=os.open(STATE/name,os.O_RDWR|os.O_CREAT|getattr(os,'O_NOFOLLOW',0),0o600)
    try:
        st=os.fstat(lock_fd);require(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600,'UNSAFE_LOCK')
        fcntl.flock(lock_fd,fcntl.LOCK_EX|(fcntl.LOCK_NB if nonblocking else 0));yield
    finally:os.close(lock_fd)

def execute_worker(envelope):
    config=read_json(CONFIG);legacy=read_json(LEGACY);r,profile=validate_envelope(envelope,config,legacy);validate_modules(config);validate_state()
    path=STATE/(r['id']+'.json');state=read_json(path,private=True);require(state['requestHash']==digest(r),'REQUEST_REPLAY_DIFFERS')
    try:
        # Distinct jobs cannot concurrently mutate the same ordinary user's tool/config tree.
        with locked('provision.lock', nonblocking=True):
            state.update(provision_result(envelope,config,r,profile,min(900,max(1,timestamp(r['expiresAt'])-time.time()))))
    except BlockingIOError:state.update(status='failed',summary='Another fixed provision operation holds the node lock; no changes made')
    state['at']=datetime.now(timezone.utc).isoformat();atomic(path,state)

def dispatch(envelope, launch=None):
    config=read_json(CONFIG);legacy=read_json(LEGACY);r,profile=validate_envelope(envelope,config,legacy);validate_modules(config)
    validate_state()
    if envelope['operation']=='observe':
        state=initial_receipt(r);state.update(provision_result(envelope,config,r,profile,min(12,max(1,timestamp(r['expiresAt'])-time.time()))));state['at']=datetime.now(timezone.utc).isoformat();return public_receipt(state)
    with locked('dispatcher.lock'):
        path=STATE/(r['id']+'.json')
        if path.exists():
            state=read_json(path,private=True);require(state['requestHash']==digest(r),'REQUEST_REPLAY_DIFFERS')
            if state['status']=='running':
                alive=state.get('workerPid') and state.get('workerStart') and process_identity(state['workerPid'])==state['workerStart']
                if not alive or time.time()>timestamp(r['expiresAt']):state.update(status='unknown',at=datetime.now(timezone.utc).isoformat(),summary='Durable worker no longer verifiable; no replay');atomic(path,state)
            return public_receipt(state)
        if envelope['operation']=='status':
            state=initial_receipt(r);state.update(status='unknown',summary='No durable node receipt; configuration not replayed');return public_receipt(state)
        state=initial_receipt(r);state['requestHash']=digest(r);atomic(path,state)
        try:
            child=(launch or subprocess.Popen)(['/usr/bin/python3','-I',str(CODE/'node-dispatcher.py'),'--worker'],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True,close_fds=True,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C.UTF-8'})
            state['workerPid']=child.pid;state['workerStart']=process_identity(child.pid);atomic(path,state)
            child.stdin.write(canonical(envelope));child.stdin.close()
        except Exception:
            state.update(status='unknown',at=datetime.now(timezone.utc).isoformat(),summary='Worker launch unconfirmed; configuration not replayed');atomic(path,state)
        return public_receipt(state)

def main():
    require(os.geteuid()==0,'ROOT_WRAPPER_REQUIRED');raw=sys.stdin.buffer.read(65537);require(len(raw)<=65536,'REQUEST_TOO_LARGE');envelope=json.loads(raw)
    if sys.argv[1:]==['--worker']:execute_worker(envelope)
    else:require(not sys.argv[1:],'INVALID_ARGUMENTS');print(json.dumps(dispatch(envelope),ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except Exception:
        print(json.dumps({'status':'failed','error':'FIXED_AI_DEVELOPMENT_DISPATCH_FAILED'}));sys.exit(1)
