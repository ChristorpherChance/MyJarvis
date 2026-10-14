"""Install root-owned fixed operations; input p arrives through authorized maintenance SSH."""
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import socket

if socket.gethostname()!=p['hostname']:raise RuntimeError('Node identity differs')
name='jarvis-ops'
try:user=pwd.getpwnam(name)
except KeyError:
    subprocess.run(['useradd','--system','--user-group','--home-dir','/var/lib/jarvis-ops-login','--create-home','--shell','/bin/sh',name],check=True);user=pwd.getpwnam(name)
if user.pw_uid==0 or user.pw_dir!='/var/lib/jarvis-ops-login':raise RuntimeError('Operations account differs')
if len(os.getgrouplist(name,user.pw_gid))!=1:raise RuntimeError('Operations account has unexpected supplementary groups')
for directory,mode in [('/etc/jarvis-ops',0o755),('/opt/jarvis-ops',0o755),('/var/lib/jarvis-ops',0o700),('/var/lib/jarvis-ops-login',0o755),('/var/lib/jarvis-ops-login/.ssh',0o755)]:
    path=Path(directory);path.mkdir(exist_ok=True);os.chown(path,0,0);os.chmod(path,mode)
backup=Path('/var/lib/jarvis-ops')/'before-install';backup.mkdir(mode=0o700,exist_ok=True)
def put(path,text,mode):
    path=Path(path)
    saved=backup/path.name
    if path.exists() and not saved.exists():shutil.copy2(path,saved);os.chmod(saved,0o600)
    temp=path.with_name(path.name+'.next');temp.write_text(text);os.chown(temp,0,0);os.chmod(temp,mode);os.replace(temp,path)
put('/opt/jarvis-ops/dispatcher.py',p['code'],0o755)
put('/etc/jarvis-ops/node.json',json.dumps({'version':1,'machineId':p['machineId'],'hostname':p['hostname'],'nodeId':p['id'],'services':{s['unit']:{'controllable':s['controllable'],'expected':s['expected']} for s in p['services']},'powerEnabled':True}),0o644)
auth=Path('/var/lib/jarvis-ops-login/.ssh/authorized_keys')
line='\n'.join('restrict,command="/usr/bin/sudo -n /usr/bin/python3 /opt/jarvis-ops/dispatcher.py" '+key for key in p['sshPublic'])
if auth.exists() and auth.read_text().strip()!=line:raise RuntimeError('Existing operations key differs')
put(auth,line+'\n',0o644)
policy=Path('/etc/sudoers.d/85-jarvis-fixed-operations')
text='# Managed Jarvis fixed dispatcher only\njarvis-ops ALL=(root) NOPASSWD: /usr/bin/python3 /opt/jarvis-ops/dispatcher.py\n'
if policy.exists() and not policy.read_text().startswith('# Managed Jarvis fixed dispatcher only'):raise RuntimeError('Existing sudo policy differs')
next_policy=policy.with_name('.85-jarvis-fixed-operations.next');next_policy.write_text(text);os.chmod(next_policy,0o440)
verify=subprocess.run(['/usr/sbin/visudo','-c','-f',str(next_policy)],capture_output=True)
if verify.returncode:next_policy.unlink();raise RuntimeError('Fixed sudo policy invalid')
os.replace(next_policy,policy)
if subprocess.run(['/usr/sbin/visudo','-c'],capture_output=True).returncode:raise RuntimeError('System sudo configuration invalid')
print(json.dumps({'node':p['id'],'account':name,'forcedFixedDispatcher':True,'arbitraryShellAuthorized':False,'services':len(p['services']),'powerEnabled':True}))
