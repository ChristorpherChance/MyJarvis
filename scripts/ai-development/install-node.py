"""Root-reviewed stdin installer. Default is validation only; never starts a service."""
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import sys
import uuid
from datetime import datetime, timezone

CODE=Path('/opt/jarvis-ai-development')
CONF=Path('/etc/jarvis-ai-development')
STATE=Path('/var/lib/jarvis-ai-development-node')
ENV_KEYS={'ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_BASE_URL','ANTHROPIC_MODEL','ANTHROPIC_DEFAULT_HAIKU_MODEL','ANTHROPIC_DEFAULT_SONNET_MODEL','ANTHROPIC_DEFAULT_OPUS_MODEL','ANTHROPIC_DEFAULT_FABLE_MODEL','CLAUDE_CODE_SUBAGENT_MODEL','CLAUDE_CODE_MAX_OUTPUT_TOKENS'}
SHA=re.compile(r'^[a-f0-9]{64}$')

def require(ok,code):
    if not ok:raise RuntimeError(code)

def canonical(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf-8')
def digest(value):return hashlib.sha256(canonical(value)).hexdigest()

def no_links(path):
    path=Path(path);require(path.is_absolute(),'ABSOLUTE_PATH_REQUIRED');cursor=Path(path.anchor)
    for part in path.parts[1:]:
        cursor=cursor/part
        try:s=cursor.lstat()
        except FileNotFoundError:continue
        require(not stat.S_ISLNK(s.st_mode),'LINKED_PATH')

def read_safe(path,uid=0,maximum=2097152):
    path=Path(path);no_links(path);s=path.lstat();require(stat.S_ISREG(s.st_mode) and s.st_uid==uid and s.st_nlink==1 and not s.st_mode&0o022 and s.st_size<=maximum,'UNSAFE_INPUT_FILE')
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        a=os.fstat(fd);raw=os.read(fd,maximum+1);b=os.fstat(fd)
        signature=lambda t:(t.st_dev,t.st_ino,t.st_size,t.st_mtime_ns,t.st_ctime_ns)
        require(signature(s)==signature(a)==signature(b) and len(raw)==s.st_size,'INPUT_FILE_CHANGED');return raw
    finally:os.close(fd)

def directory(path,uid=0,gid=0,mode=0o755):
    path=Path(path);no_links(path)
    if not path.exists():
        path.mkdir(mode=mode);os.chown(path,uid,gid)
    s=path.lstat();require(stat.S_ISDIR(s.st_mode) and s.st_uid==uid and not s.st_mode&0o002,'UNSAFE_DIRECTORY')
    os.chown(path,uid,gid);os.chmod(path,mode)

def shared_private_configuration_directory():
    if CONF.exists():
        no_links(CONF);s=CONF.lstat();require(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and stat.S_IMODE(s.st_mode) in (0o700,0o750),'UNSAFE_SHARED_CONFIGURATION_DIRECTORY')
    else:directory(CONF,mode=0o750)

def put(path,raw,uid=0,gid=0,mode=0o644,backup=None):
    path=Path(path);no_links(path)
    if path.exists():
        before=read_safe(path)
        if backup is not None:
            saved=Path(backup)/path.name
            require(not saved.exists(),'BACKUP_ALREADY_EXISTS');put(saved,before,mode=0o600)
    temporary=path.with_name(path.name+'.'+str(uuid.uuid4())+'.tmp')
    fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),mode)
    try:
        os.fchown(fd,uid,gid)
        os.fchmod(fd,mode)
        with os.fdopen(fd,'wb',closefd=False) as stream:stream.write(raw);stream.flush();os.fsync(fd)
    finally:os.close(fd)
    try:
        os.replace(temporary,path)
        parent=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(parent)
        finally:os.close(parent)
    finally:
        if temporary.exists():temporary.unlink()

def modules(payload,names):
    require(isinstance(payload,dict) and set(payload)==set(names),'MODULE_SET_DIFFERS');output={}
    for name,item in payload.items():
        require(isinstance(item,dict) and set(item)=={'content','sha256'} and isinstance(item['content'],str) and SHA.fullmatch(item['sha256']),'INVALID_MODULE')
        raw=item['content'].encode('utf-8');require(len(raw)<=2097152 and hashlib.sha256(raw).hexdigest()==item['sha256'],'MODULE_HASH_DIFFERS');output[name]=raw
    return output

def validate(payload):
    require(isinstance(payload,dict) and not set(payload)-{'schemaVersion','hostname','machineId','nodeId','address','targetUser','profiles','modules','expectedDispatcherSHA256'},'UNEXPECTED_INSTALL_FIELDS')
    require(payload.get('schemaVersion')==1 and payload.get('hostname')==socket.gethostname(),'NODE_IDENTITY_DIFFERS')
    require(re.fullmatch(r'[a-z_][a-z0-9_-]{0,31}',payload.get('targetUser','')) and payload['targetUser']!='root','ORDINARY_USER_REQUIRED')
    import pwd
    user=pwd.getpwnam(payload['targetUser']);require(user.pw_uid>=1000 and user.pw_uid!=0,'ORDINARY_USER_REQUIRED');no_links(user.pw_dir);require(Path(user.pw_dir).stat().st_uid==user.pw_uid,'HOME_OWNER_DIFFERS')
    legacy=json.loads(read_safe('/etc/jarvis-ops/node.json'));require(legacy['machineId']==payload['machineId'] and legacy['hostname']==payload['hostname'] and legacy['nodeId']==payload['nodeId'],'LEGACY_NODE_DIFFERS')
    require(re.fullmatch(r'[A-Za-z0-9.:-]{1,253}',payload.get('address','')),'INVALID_ADDRESS')
    expected=payload.get('expectedDispatcherSHA256');require(isinstance(expected,str) and SHA.fullmatch(expected) and hashlib.sha256(read_safe('/opt/jarvis-ops/dispatcher.py')).hexdigest()==expected,'DISPATCHER_BASE_CHANGED')
    source=modules(payload['modules'],{'node-dispatcher.py','provision.py','terminal-statusline.py','profile-manifest.json','remote-ops-dispatcher.py'})
    require(b"if mode=='ai-development':" in source['remote-ops-dispatcher.py'] and b'/opt/jarvis-ai-development/node-dispatcher.py' in source['remote-ops-dispatcher.py'],'FIXED_DELEGATION_MISSING')
    manifest=json.loads(source['profile-manifest.json']);require(manifest.get('profileId')=='linux-ai-dev-v1' and manifest.get('profileRevision')==1,'MANIFEST_IDENTITY_DIFFERS')
    require(isinstance(payload['profiles'],list) and 0<len(payload['profiles'])<=30,'INVALID_PROFILES');profiles=[]
    for p in payload['profiles']:
        require(p.get('id')==manifest['profileId'] and p.get('revision')==manifest['profileRevision'],'PROFILE_MANIFEST_DIFFERS')
        require(isinstance(p.get('providers'),list) and len(p['providers'])<=32 and all(isinstance(v,dict) and not set(v)-{'id','name','model','credentialConfigured'} for v in p['providers']),'PRIVATE_PROFILE_FIELDS')
        profiles.append({'id':p['id'],'revision':p['revision'],'publicHash':digest(p),'manifestSHA256':hashlib.sha256(source['profile-manifest.json']).hexdigest()})
    return source,profiles

def install(payload,execute=False):
    require(os.geteuid()==0,'ROOT_REQUIRED');source,profiles=validate(payload)
    summary={'schemaVersion':1,'validated':True,'installed':False,'machineId':payload['machineId'],'targetUser':payload['targetUser'],'profilePins':profiles,'servicesStarted':False,'modelCalls':0}
    if not execute:return summary
    directory(CODE)
    # The central worker shares this directory: preserve its private group/mode.
    shared_private_configuration_directory()
    directory(STATE,mode=0o700)
    backup=STATE/('before-install-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+str(uuid.uuid4()));directory(backup,mode=0o700)
    for name,raw in source.items():
        if name!='remote-ops-dispatcher.py':put(CODE/name,raw,backup=backup)
    config={'schemaVersion':1,**{k:payload[k] for k in ['hostname','machineId','nodeId','address','targetUser']},'profiles':profiles,'modules':{name:hashlib.sha256(raw).hexdigest() for name,raw in source.items() if name!='remote-ops-dispatcher.py'}}
    put(CONF/'node.json',canonical(config),mode=0o600,backup=backup)
    put('/opt/jarvis-ops/dispatcher.py',source['remote-ops-dispatcher.py'],mode=0o755,backup=backup)
    summary['installed']=True;summary['backup']=str(backup);return summary

def main():
    require(sys.argv[1:] in ([],['--execute']),'INVALID_ARGUMENTS');raw=sys.stdin.buffer.read(6291457);require(len(raw)<=6291456,'INSTALL_PAYLOAD_TOO_LARGE');print(json.dumps(install(json.loads(raw),'--execute' in sys.argv),ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except Exception:
        print(json.dumps({'status':'failed','error':'FIXED_NODE_INSTALLATION_REJECTED'}));sys.exit(1)
