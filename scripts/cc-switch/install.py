#!/usr/bin/python3
"""Root-reviewed installer. stdin contains source/public SSH material, never API keys."""
import datetime
import grp
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import stat
import subprocess
import sys

CONF=Path('/etc/jarvis-cc-switch');CODE=Path('/opt/jarvis-cc-switch')

def check(ok):
    if not ok:raise RuntimeError('INSTALL_VALIDATION_FAILED')

def directory(path,mode=0o755,uid=0,gid=0):
    path=Path(path)
    for part in [path]+list(path.parents):
        if part.exists():check(not part.is_symlink())
    path.mkdir(parents=True,exist_ok=True);os.chown(path,uid,gid);path.chmod(mode)

def install(data):
    check(os.geteuid()==0 and data.get('mode') in ['inventory','controller','node'])
    if data['mode']=='inventory':
        config=json.loads(Path('/etc/jarvis-control/config.json').read_text())
        nodes=[]
        for host in ['101','112','116']:
            matches=[p for p in config['nodes'] if p['address']=='192.168.10.'+host]
            check(len(matches)==1)
            n=matches[0];nodes.append({'id':n['machineId'],'name':host,'address':n['address'],'host':host,'alias':'cc-switch-'+host})
        return {'nodes':nodes}
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup=Path('/var/lib/jarvis-cc-switch-install')/stamp;directory(backup,0o700)
    def put(path,raw,mode=0o644,uid=0,gid=0):
        path=Path(path);check(not path.is_symlink())
        if path.exists():
            saved=backup/(str(path).lstrip('/').replace('/','__'));shutil.copyfile(path,saved);saved.chmod(0o600)
        tmp=path.with_name(path.name+'.install-tmp');check(not tmp.exists() and not tmp.is_symlink())
        fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode)
        with os.fdopen(fd,'wb') as handle:handle.write(raw if isinstance(raw,bytes) else raw.encode())
        os.chown(tmp,uid,gid);tmp.chmod(mode);tmp.replace(path)
    directory(CODE);directory(CONF)
    for name,source in data['modules'].items():
        check(name in ['node.py','controller.py'] and isinstance(source,str));compile(source,name,'exec');put(CODE/name,source)
    if data['mode']=='node':
        user=pwd.getpwnam('superopen');check(user.pw_uid>=1000)
        node=data['node'];check(node['address']=='192.168.10.'+node['host'] and node['host'] in ['101','112','116'])
        check(re.fullmatch(r'[0-9a-f-]{36}',node['id']))
        cfg={'machineId':node['id'],'host':node['host'],'hostname':socket.gethostname(),'targetUser':user.pw_name}
        put(CONF/'node.json',json.dumps(cfg,indent=2)+'\n')
        public=data['publicKey'].strip();check(re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/=]+ jarvis-cc-switch-20261020',public))
        ssh=Path(user.pw_dir)/'.ssh';directory(ssh,0o700,user.pw_uid,user.pw_gid)
        path=ssh/'authorized_keys';check(not path.is_symlink())
        old=path.read_text() if path.exists() else ''
        line='from="192.168.10.112",restrict,command="/usr/bin/python3 -I /opt/jarvis-cc-switch/node.py" '+public
        matching=[s for s in old.splitlines() if s.endswith(' jarvis-cc-switch-20261020')]
        check(not matching or matching==[line])
        if not matching:put(path,old.rstrip()+'\n'+line+'\n',0o600,user.pw_uid,user.pw_gid)
        return {'installed':True,'host':node['host'],'targetUser':user.pw_name,'scopedForcedCommand':True,'backup':str(backup)}
    user=pwd.getpwnam('jarvis-control');app=pwd.getpwnam('jarvis');check(user.pw_uid>0 and app.pw_uid>0)
    directory(CONF,0o750,0,user.pw_gid)
    key=CONF/'id_ed25519'
    if not key.exists():
        result=subprocess.run(['/usr/bin/ssh-keygen','-q','-t','ed25519','-N','','-C','jarvis-cc-switch-20261020','-f',str(key)],capture_output=True)
        check(result.returncode==0);os.chown(key,user.pw_uid,user.pw_gid);key.chmod(0o600)
    else:
        st=key.lstat();check(stat.S_ISREG(st.st_mode) and st.st_uid==user.pw_uid and stat.S_IMODE(st.st_mode)==0o600)
    nodes=data['nodes'];check(len(nodes)==3 and {n['host'] for n in nodes}=={'101','112','116'})
    common='Host *\n  User superopen\n  Port 22\n  IdentityFile /etc/jarvis-cc-switch/id_ed25519\n  IdentitiesOnly yes\n  BatchMode yes\n  PasswordAuthentication no\n  KbdInteractiveAuthentication no\n  StrictHostKeyChecking yes\n  UserKnownHostsFile /etc/jarvis-cc-switch/known_hosts\n  GlobalKnownHostsFile /dev/null\n  RequestTTY no\n  LogLevel ERROR\n'
    for n in nodes:
        check(n['address']=='192.168.10.'+n['host'] and n['alias']=='cc-switch-'+n['host'])
        common+='\nHost '+n['alias']+'\n  HostName '+n['address']+'\n'
    put(CONF/'ssh_config',common,0o640,0,user.pw_gid)
    put(CONF/'known_hosts',data['knownHosts'],0o640,0,user.pw_gid)
    cfg={'nodes':nodes,'sshConfig':str(CONF/'ssh_config'),'socket':'/run/jarvis-cc-switch/control.sock'}
    put(CONF/'controller.json',json.dumps(cfg,indent=2)+'\n',0o640,0,user.pw_gid)
    unit='''[Unit]
Description=Jarvis local CC Switch control for three fixed machines
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=jarvis-control
Group=jarvis-control
SupplementaryGroups=jarvis
ExecStart=/usr/bin/python3 -I /opt/jarvis-cc-switch/controller.py
RuntimeDirectory=jarvis-cc-switch
RuntimeDirectoryMode=0755
UMask=0077
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/run/jarvis-cc-switch
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
[Install]
WantedBy=multi-user.target
'''
    put('/etc/systemd/system/jarvis-cc-switch-controller.service',unit)
    subprocess.run(['systemctl','daemon-reload'],check=True,capture_output=True)
    return {'installed':True,'publicKey':key.with_suffix('.pub').read_text().strip(),'nodes':nodes,'serviceStarted':False,'backup':str(backup)}

if __name__=='__main__':
    try:print(json.dumps(install(json.load(sys.stdin)),ensure_ascii=True))
    except Exception:
        print(json.dumps({'installed':False,'code':'INSTALL_VALIDATION_FAILED'}));sys.exit(1)
