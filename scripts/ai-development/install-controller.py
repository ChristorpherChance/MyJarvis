"""Install a separate worker/vault from root-reviewed stdin. Does not start services."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import subprocess
import sys
import uuid
from datetime import datetime, timezone

_spec=importlib.util.spec_from_file_location('fixed_ai_install_helpers',Path(__file__).with_name('install-node.py'))
helpers=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(helpers)
require,canonical,digest=helpers.require,helpers.canonical,helpers.digest
read_safe,directory,put,no_links=helpers.read_safe,helpers.directory,helpers.put,helpers.no_links
CONF=Path('/etc/jarvis-ai-development')
CODE=Path('/opt/jarvis-ai-development')
STATE=Path('/var/lib/jarvis-ai-development')
QUEUE=Path('/var/lib/jarvis-ai-development-queue')
POLICY=Path('/etc/jarvis-ai-development-policy.json')
LEGACY=Path('/etc/jarvis-control/config.json')
NODE=Path('/opt/jarvis-control/node')
ENV_KEYS=helpers.ENV_KEYS

def public_profile(p):
    require(isinstance(p,dict) and set(p)=={'id','revision','name','tools','providers','statuslineVersion'},'INVALID_PUBLIC_PROFILE')
    require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,99}',p['id']) and type(p['revision']) is int and p['revision']>0,'INVALID_PROFILE_ID')
    require(isinstance(p['name'],str) and len(p['name'])<=300 and isinstance(p['statuslineVersion'],str) and len(p['statuslineVersion'])<=100,'INVALID_PROFILE_LABEL')
    require(isinstance(p['tools'],list) and len(p['tools'])<=20 and all(isinstance(t,dict) and set(t)=={'name','version'} and isinstance(t['name'],str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,99}',t['name']) and isinstance(t['version'],str) and len(t['version'])<=100 for t in p['tools']),'INVALID_PUBLIC_TOOLS')
    require(isinstance(p['providers'],list) and len(p['providers'])<=32,'INVALID_PUBLIC_PROVIDERS')
    for v in p['providers']:
        require(isinstance(v,dict) and set(v)=={'id','name','model','credentialConfigured'} and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,99}',v['id']) and isinstance(v['name'],str) and len(v['name'])<=300 and (v['model'] is None or isinstance(v['model'],str) and len(v['model'])<=300) and type(v['credentialConfigured']) is bool,'INVALID_PUBLIC_PROVIDER')
    require(len({v['id'] for v in p['providers']})==len(p['providers']),'DUPLICATE_PROVIDER')
    return p

def policy_validate(policy,legacy):
    require(isinstance(policy,dict) and set(policy)=={'version','profiles','nodes'} and policy['version']==1 and isinstance(policy['profiles'],list) and len(policy['profiles'])<=30 and isinstance(policy['nodes'],list) and len(policy['nodes'])<=100,'INVALID_PUBLIC_POLICY')
    for p in policy['profiles']:public_profile(p)
    require(len({p['id'] for p in policy['profiles']})==len(policy['profiles']),'DUPLICATE_PROFILE')
    for n in policy['nodes']:
        require(isinstance(n,dict) and set(n)=={'machineId','nodeId','address','targetUser','profileIds'} and isinstance(n['machineId'],str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,99}',n['machineId']),'INVALID_PUBLIC_NODE')
        peers=[p for p in legacy['nodes'] if p['machineId']==n['machineId'] and p['nodeId']==n['nodeId'] and p['address']==n['address']]
        require(len(peers)==1 and re.fullmatch(r'[A-Za-z0-9_-]{1,100}',peers[0]['alias']) and re.fullmatch(r'[a-z_][a-z0-9_-]{0,31}',n['targetUser']) and n['targetUser']!='root','UNTRUSTED_OPERATIONS_NODE')
        require(isinstance(n['profileIds'],list) and 0<len(n['profileIds'])<=30 and all(any(p['id']==i for p in policy['profiles']) for i in n['profileIds']),'INVALID_PROFILE_BINDING')
    require(len({n['machineId'] for n in policy['nodes']})==len(policy['nodes']),'DUPLICATE_NODE')

def export_providers(user_name):
    """Only portable env/model fields. Source DB and global settings are never changed."""
    import pwd
    user=pwd.getpwnam(user_name);require(user.pw_uid>=1000 and user.pw_uid!=0,'ORDINARY_USER_REQUIRED')
    path=Path(user.pw_dir)/'.cc-switch/cc-switch.db';no_links(path)
    s=path.lstat();require(stat.S_ISREG(s.st_mode) and s.st_uid==user.pw_uid and s.st_nlink==1 and not s.st_mode&0o077,'UNSAFE_PROVIDER_DATABASE')
    uri=path.as_uri()+'?mode=ro';connection=sqlite3.connect(uri,uri=True,timeout=5)
    try:
        connection.execute('PRAGMA query_only=ON');connection.execute('BEGIN')
        columns={r[1] for r in connection.execute('PRAGMA table_info(providers)')};require({'id','name','app_type','settings_config'}<=columns,'PROVIDER_SCHEMA_DIFFERS')
        result=[]
        for provider_id,name,raw in connection.execute("SELECT id,name,settings_config FROM providers WHERE app_type='claude' ORDER BY id LIMIT 33"):
            require(len(result)<32 and isinstance(provider_id,str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,99}',provider_id) and isinstance(name,str) and len(name)<=300,'INVALID_PROVIDER_METADATA')
            require(isinstance(raw,str) and len(raw)<=262144,'INVALID_PROVIDER_CONFIGURATION');settings=json.loads(raw);env=settings.get('env',{})
            require(isinstance(env,dict),'INVALID_PROVIDER_ENV');portable={k:v for k,v in env.items() if k in ENV_KEYS}
            require(all(isinstance(v,str) and len(v)<=8192 and not any(ord(c)<32 or ord(c)==127 for c in v) for v in portable.values()),'INVALID_PROVIDER_ENV')
            clean={'env':portable}
            if isinstance(settings.get('model'),str):require(len(settings['model'])<=300,'INVALID_PROVIDER_MODEL');clean['model']=settings['model']
            result.append({'id':provider_id,'name':name,'settingsConfig':clean})
        require(result,'NO_PORTABLE_PROVIDERS');return result
    finally:connection.close()

def provider_metadata(provider):
    env=provider['settingsConfig'].get('env',{})
    return {'id':provider['id'],'name':provider['name'],'model':env.get('ANTHROPIC_MODEL') or provider['settingsConfig'].get('model') or '', 'credentialConfigured':bool(env.get('ANTHROPIC_AUTH_TOKEN') or env.get('ANTHROPIC_API_KEY'))}

ENCRYPT="""const{randomBytes,createCipheriv}=require('node:crypto');let a='';process.stdin.on('data',c=>{a+=c;if(Buffer.byteLength(a)>262144)process.exit(2)});process.stdin.on('end',()=>{const k=randomBytes(32),iv=randomBytes(12),c=createCipheriv('aes-256-gcm',k,iv);c.setAAD(Buffer.from('jarvis-ai-development-v1'));const ciphertext=Buffer.concat([c.update(a,'utf8'),c.final()]);process.stdout.write(JSON.stringify({key:k.toString('base64'),vault:{schemaVersion:1,algorithm:'AES-256-GCM',iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')}}))});"""

def install(payload,execute=False):
    require(os.geteuid()==0,'ROOT_REQUIRED');require(isinstance(payload,dict) and not set(payload)-{'schemaVersion','nodeId','controllerUser','policy','modules','exportProfiles','providersByProfile','expectedLegacyConfigSHA256','expectedControllerSHA256'},'UNEXPECTED_INSTALL_FIELDS');require(payload.get('schemaVersion')==1,'INVALID_INSTALL_SCHEMA')
    import pwd
    user=pwd.getpwnam(payload.get('controllerUser','jarvis-control'));app=pwd.getpwnam('jarvis');require(user.pw_name=='jarvis-control' and user.pw_uid!=0,'CONTROLLER_IDENTITY_DIFFERS')
    legacy_raw=read_safe(LEGACY);require(hashlib.sha256(legacy_raw).hexdigest()==payload.get('expectedLegacyConfigSHA256'),'LEGACY_CONFIG_CHANGED');legacy=json.loads(legacy_raw)
    require(legacy['sshConfig']=='/etc/jarvis-control/ssh_config','LEGACY_SSH_CONFIG_DIFFERS');read_safe(legacy['sshConfig']);policy=payload['policy'];policy_validate(policy,legacy)
    node=json.loads(read_safe('/etc/jarvis/node.json'));require(node.get('nodeId')==payload['nodeId'] and node.get('role')=='primary','PRIMARY_CONTROLLER_REQUIRED')
    source=helpers.modules(payload['modules'],{'controller.mjs'});require(hashlib.sha256(source['controller.mjs']).hexdigest()==payload.get('expectedControllerSHA256'),'CONTROLLER_PIN_DIFFERS');read_safe(NODE,maximum=200*1024*1024)
    exports=payload.get('exportProfiles',[]);secrets=payload.get('providersByProfile',{})
    require(isinstance(exports,list) and isinstance(secrets,dict) and not (exports and secrets),'INVALID_SECRET_SOURCE')
    # Explicit root input only; the API never accepts this document or provider values.
    vault_profiles={}
    from_export=set()
    for e in exports:
        require(isinstance(e,dict) and set(e)=={'profileId','targetUser'} and any(n['nodeId']==payload['nodeId'] and n['targetUser']==e['targetUser'] and e['profileId'] in n['profileIds'] for n in policy['nodes']),'EXPORT_TARGET_NOT_FIXED')
        require(e['profileId'] not in vault_profiles,'DUPLICATE_SECRET_PROFILE');vault_profiles[e['profileId']]={'providers':export_providers(e['targetUser'])};from_export.add(e['profileId'])
    for profile_id,providers in secrets.items():
        require(any(p['id']==profile_id for p in policy['profiles']),'UNKNOWN_SECRET_PROFILE')
        # Validate portable shape using the reviewed sibling implementation, without executing it.
        require(isinstance(providers,list) and len(providers)<=32,'INVALID_PROVIDERS')
        for p in providers:
            require(isinstance(p,dict) and set(p)=={'id','name','settingsConfig'} and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,99}',p['id']) and isinstance(p['name'],str) and len(p['name'])<=300,'INVALID_PROVIDER')
            require(isinstance(p['settingsConfig'],dict) and not set(p['settingsConfig'])-{'env','model'},'INVALID_PROVIDER_SETTINGS')
            env=p['settingsConfig'].get('env',{});require(isinstance(env,dict) and not set(env)-ENV_KEYS and all(isinstance(v,str) and len(v)<=8192 and not any(ord(c)<32 or ord(c)==127 for c in v) for v in env.values()),'INVALID_PROVIDER_ENV')
            if 'model' in p['settingsConfig']:require(isinstance(p['settingsConfig']['model'],str) and len(p['settingsConfig']['model'])<=300,'INVALID_PROVIDER_MODEL')
        vault_profiles[profile_id]={'providers':providers}
    for p in policy['profiles']:
        require(p['id'] in vault_profiles,'MISSING_VAULT_PROFILE')
        actual=[provider_metadata(v) for v in vault_profiles[p['id']]['providers']]
        require(digest(sorted(actual,key=lambda v:v['id']))==digest(sorted(p['providers'],key=lambda v:v['id'])),'PUBLIC_SECRET_METADATA_DIFFERS')
    require(len(canonical({'profiles':vault_profiles}))<=262144,'VAULT_TOO_LARGE')
    legacy_queue=Path(legacy['queue']);require(str(legacy_queue)=='/var/lib/jarvis-ops-queue','LEGACY_QUEUE_DIFFERS');no_links(legacy_queue)
    request_st=(legacy_queue/'requests').stat();result_st=(legacy_queue/'results').stat();require(request_st.st_uid==app.pw_uid and result_st.st_uid==user.pw_uid and stat.S_ISDIR(request_st.st_mode) and stat.S_ISDIR(result_st.st_mode),'LEGACY_QUEUE_OWNERS_DIFFER')
    summary={'schemaVersion':1,'validated':True,'installed':False,'service':'jarvis-ai-development-controller.service','controllerUser':user.pw_name,'queue':str(QUEUE),'policy':str(POLICY),'policyHash':digest(policy),'profiles':[{'id':p['id'],'revision':p['revision'],'profileHash':digest(p),'providerCount':len(p['providers'])} for p in policy['profiles']],'vaultAlgorithm':'AES-256-GCM','credentialsReturned':False,'servicesStarted':False,'modelCalls':0}
    if not execute:return summary
    encrypted=subprocess.run([str(NODE),'-e',ENCRYPT],input=canonical({'schemaVersion':1,'profiles':vault_profiles}),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=15,check=True,env={'PATH':'/usr/bin:/bin'})
    sealed=json.loads(encrypted.stdout);key=base64.b64decode(sealed['key'],validate=True);require(len(key)==32,'INVALID_VAULT_KEY')
    directory(CONF,gid=user.pw_gid,mode=0o750);directory(CODE);directory(STATE,uid=user.pw_uid,gid=user.pw_gid,mode=0o700)
    backup_root=Path('/var/lib/jarvis-ai-development-install');directory(backup_root,mode=0o700)
    backup=backup_root/('before-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+str(uuid.uuid4()));directory(backup,mode=0o700)
    directory(QUEUE,mode=0o755)
    directory(QUEUE/'requests',uid=request_st.st_uid,gid=request_st.st_gid,mode=stat.S_IMODE(request_st.st_mode))
    directory(QUEUE/'results',uid=result_st.st_uid,gid=result_st.st_gid,mode=stat.S_IMODE(result_st.st_mode))
    directory(QUEUE/'results'/'observations',uid=result_st.st_uid,gid=result_st.st_gid,mode=stat.S_IMODE(result_st.st_mode))
    config={'schemaVersion':1,'queue':str(QUEUE),'state':str(STATE),'policy':str(POLICY),'legacyConfig':str(LEGACY),'sshConfig':legacy['sshConfig'],'producerUid':app.pw_uid,'vault':str(CONF/'vault.json'),'vaultKey':str(CONF/'vault.key')}
    put(CODE/'controller.mjs',source['controller.mjs'],backup=backup)
    put(CONF/'vault.key',key,gid=user.pw_gid,mode=0o640,backup=backup)
    put(CONF/'vault.json',canonical(sealed['vault']),gid=user.pw_gid,mode=0o640,backup=backup)
    put(CONF/'controller.json',canonical(config),gid=user.pw_gid,mode=0o640,backup=backup)
    put(POLICY,canonical(policy),mode=0o644,backup=backup)
    drop=Path('/etc/systemd/system/jarvis-platform.service.d');directory(drop)
    put(drop/'45-ai-development.conf',b'[Service]\nEnvironment="JARVIS_AI_DEVELOPMENT_QUEUE=/var/lib/jarvis-ai-development-queue"\nEnvironment="JARVIS_AI_DEVELOPMENT_CONFIG=/etc/jarvis-ai-development-policy.json"\nReadWritePaths=/var/lib/jarvis-ai-development-queue/requests\n',backup=backup)
    unit='''[Unit]
Description=Jarvis fixed AI development environment worker
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=jarvis-control
Group=jarvis-control
ExecStartPre=+/usr/bin/python3 /opt/jarvis-control/require-primary.py
ExecStart=/opt/jarvis-control/node /opt/jarvis-ai-development/controller.mjs --config /etc/jarvis-ai-development/controller.json
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/jarvis-ai-development /var/lib/jarvis-ai-development-queue/results
MemoryMax=192M
TasksMax=64
UMask=0077
[Install]
WantedBy=multi-user.target
'''
    put('/etc/systemd/system/jarvis-ai-development-controller.service',unit.encode(),backup=backup)
    summary['installed']=True;summary['backup']=str(backup);return summary

def main():
    require(sys.argv[1:] in ([],['--execute'],['--export-public']),'INVALID_ARGUMENTS');raw=sys.stdin.buffer.read(6291457);require(len(raw)<=6291456,'INSTALL_PAYLOAD_TOO_LARGE');payload=json.loads(raw)
    if sys.argv[1:]==['--export-public']:
        require(os.geteuid()==0 and isinstance(payload,dict) and set(payload)=={'schemaVersion','targetUser'} and payload['schemaVersion']==1 and payload['targetUser']=='superopen','FIXED_EXPORT_TARGET_REQUIRED')
        print(json.dumps({'schemaVersion':1,'providers':[provider_metadata(v) for v in export_providers(payload['targetUser'])],'sourceModified':False,'credentialsReturned':False},ensure_ascii=False))
    else:print(json.dumps(install(payload,'--execute' in sys.argv),ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except Exception:
        print(json.dumps({'status':'failed','error':'FIXED_CONTROLLER_INSTALLATION_REJECTED'}));sys.exit(1)
