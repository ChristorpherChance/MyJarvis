"""Root-owned fixed dispatcher reached only through forced SSH and one sudo grant."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

CONFIG = Path('/etc/jarvis-ops/node.json')
STATE = Path('/var/lib/jarvis-ops')
UNIT = re.compile(r'^[A-Za-z0-9_.@-]{1,180}\.service$')
UUID = re.compile(r'^[a-f0-9-]{36}$')

def redact(value):
    text = str(value)
    text = re.sub(r'(?i)(?:Bearer|Basic)\s+\S+', '[credential removed]', text)
    text = re.sub(r'(?i)(password|passwd|token|secret|api[_-]?key|authorization|cookie)([\s"\x27]*[:=][\s"\x27]*)[^\s,;}]+', r'\1\2[removed]', text)
    text = re.sub(r'\bsk-[A-Za-z0-9_-]{12,}', '[key removed]', text)
    return text[:1200]

def command(args, timeout=12):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout, env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C'})

def boot_id():
    return Path('/proc/sys/kernel/random/boot_id').read_text().strip()

def write(path, value):
    temp = path.with_suffix('.next')
    with open(temp, 'w') as f:
        os.chmod(temp, 0o600)
        json.dump(value, f, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp, path)
    fd = os.open(str(path.parent), os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)

def service_info(unit, logs=True):
    r = command(['/usr/bin/systemctl','show',unit,'--property=Id,LoadState,ActiveState,SubState,User,MainPID,ExecMainStatus,ActiveEnterTimestampMonotonic,MemoryCurrent,CPUUsageNSec'])
    if r.returncode: raise RuntimeError('SERVICE_READ_FAILED')
    fields = dict(line.split('=',1) for line in r.stdout.splitlines() if '=' in line)
    lines = []
    if logs:
        log = command(['/usr/bin/journalctl','--unit='+unit,'-n','35','--no-pager','--output=json'],15)
        for line in log.stdout.splitlines()[-35:]:
            try:
                item = json.loads(line); lines.append({'at':item.get('__REALTIME_TIMESTAMP'), 'message':redact(item.get('MESSAGE',''))})
            except (ValueError, TypeError): pass
    return {'unit':unit,'fields':fields,'logs':lines}

def diagnostics(config, units):
    def cpu_ticks():return [int(v) for v in Path('/proc/stat').read_text().splitlines()[0].split()[1:9]]
    first=cpu_ticks();time.sleep(.2);second=cpu_ticks();diff=[b-a for a,b in zip(first,second)];ticks=sum(diff)
    cpu_percent=round(100*(1-(diff[3]+diff[4])/ticks),2) if ticks else None
    memory = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        key,value = line.split(':',1)
        if key in ['MemTotal','MemAvailable','SwapTotal','SwapFree']: memory[key] = int(value.split()[0])*1024
    filesystems = []
    # Fixed local mount inventory. No caller supplied paths or file contents.
    mounts = command(['/usr/bin/findmnt','--json','--real','--output','TARGET,SOURCE,FSTYPE,OPTIONS'])
    def collect(items):
        for item in items:
            path=item.get('target','')
            if path.startswith('/') and not path.startswith(('/proc','/sys','/dev','/run','/snap/')) and item.get('fstype') not in ['squashfs','iso9660','erofs']:
                try:
                    s=os.statvfs(path);total=s.f_blocks*s.f_frsize
                    if total: filesystems.append({'mount':path,'source':item.get('source'),'type':item.get('fstype'),'totalBytes':total,'availableBytes':s.f_bavail*s.f_frsize,'usedPercent':round((1-s.f_bfree/s.f_blocks)*100,2),'inodeUsedPercent':round((1-s.f_ffree/s.f_files)*100,2) if s.f_files else None,'readOnly':'ro' in item.get('options','').split(',')})
                except OSError: pass
            collect(item.get('children',[]))
    try: collect(json.loads(mounts.stdout).get('filesystems',[]))
    except ValueError: pass
    failed=command(['/usr/bin/systemctl','--failed','--type=service','--no-legend','--no-pager'])
    failed_units=[line.split()[1] if line.split()[0]=='●' else line.split()[0] for line in failed.stdout.splitlines() if line.strip()][:80]
    details=[service_info(u) for u in units]
    findings=[]
    for f in filesystems:
        if f['usedPercent']>=85:findings.append({'level':'critical' if f['usedPercent']>=95 else 'warning','message':f[ 'mount']+' disk usage '+str(f['usedPercent'])+'%'})
        if f['readOnly']:findings.append({'level':'warning','message':f['mount']+' mounted read-only'})
    if failed_units:findings.append({'level':'warning','message':'Failed system services: '+', '.join(failed_units)})
    available=memory.get('MemAvailable',0);total=memory.get('MemTotal',0)
    if total and available/total<.1:findings.append({'level':'warning','message':'Available memory below 10%'})
    disk_health=[];smart=shutil.which('smartctl')
    if smart:
        try:
            scan=command([smart,'--scan','--json'],8)
            for device in json.loads(scan.stdout).get('devices',[])[:4]:
                name=device.get('name','')
                if not re.fullmatch(r'/dev/(?:sd[a-z]{1,3}|nvme\d+n\d+)',name):continue
                try:
                    value=json.loads(command([smart,'-a','-j',name],12).stdout);passed=value.get('smart_status',{}).get('passed')
                    disk_health.append({'device':name,'healthy':passed if isinstance(passed,bool) else None,'temperatureC':value.get('temperature',{}).get('current'),'powerOnHours':value.get('power_on_time',{}).get('hours')})
                    if passed is False:findings.append({'level':'critical','message':name+' SMART reports failing health'})
                except (ValueError,subprocess.TimeoutExpired):disk_health.append({'device':name,'healthy':None})
        except (ValueError,subprocess.TimeoutExpired):pass
    network=[]
    ip=shutil.which('ip')
    if ip:
        try:network=json.loads(command([ip,'-json','link','show'],8).stdout)
        except (ValueError,subprocess.TimeoutExpired):pass
    return {'hostname':socket.gethostname(),'bootId':boot_id(),'uptimeSec':float(Path('/proc/uptime').read_text().split()[0]),'logicalCPUs':os.cpu_count(),'cpuPercent':cpu_percent,'loadAverage':list(os.getloadavg()),'memory':memory,'filesystems':filesystems[:40],'diskHealth':disk_health,'networkInterfaces':[{'name':v.get('ifname'),'state':v.get('operstate'),'mtu':v.get('mtu')} for v in network],'failedSystemServices':failed_units,'services':details,'findings':findings,'hardwareHealth':'SMART values are shown only when the actual device returns them; sensors remain unknown','businessData':'No database records or private project files read'}

def dispatch(config, request):
    if request.get('machineId')!=config['machineId'] or socket.gethostname()!=config['hostname']:raise RuntimeError('NODE_IDENTITY_DIFFERS')
    mode=request.get('mode')
    if mode=='ai-development':
        # This fixed delegation adds no shell, path, service or argv capability.
        fixed=Path('/opt/jarvis-ai-development/node-dispatcher.py')
        for parent in [fixed.parent,fixed]:
            st=parent.lstat()
            if parent.is_symlink() or st.st_uid!=0 or st.st_mode&0o022:raise RuntimeError('UNSAFE_AI_DEVELOPMENT_WRAPPER')
        st=fixed.lstat()
        if not fixed.is_file() or st.st_nlink!=1:raise RuntimeError('UNSAFE_AI_DEVELOPMENT_WRAPPER')
        child=subprocess.run(['/usr/bin/python3','-I',str(fixed)],input=json.dumps(request,ensure_ascii=False),text=True,capture_output=True,timeout=15,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C.UTF-8'})
        if child.returncode or len(child.stdout)>524288:raise RuntimeError('AI_DEVELOPMENT_WRAPPER_FAILED')
        return json.loads(child.stdout)
    if mode=='probe':return {'machineId':config['machineId'],'hostname':socket.gethostname(),'bootId':boot_id(),'at':datetime.now(timezone.utc).isoformat()}
    id=request.get('id','')
    if not UUID.fullmatch(id):raise RuntimeError('INVALID_JOB_ID')
    path=STATE/(id+'.json')
    if mode=='status':
        if not path.exists():return {'machineId':config['machineId'],'id':id,'status':'not-found','bootId':boot_id()}
        result=json.loads(path.read_text())
        if result['action']=='poweroff' and result['status']=='accepted' and result['beforeBootId']!=boot_id():
            result.update(status='unknown',summary='机器已重新上线；此前关机的实际电源状态未核实',afterBootId=boot_id());write(path,result)
        if result['action']=='reboot' and result['status']=='accepted' and result['beforeBootId']!=boot_id():
            services=[service_info(u,False) for u in config['services']]
            matched=all(s['fields'].get('ActiveState')==('inactive' if config['services'][s['unit']].get('expected')=='stopped' else 'active') for s in services)
            uptime=float(Path('/proc/uptime').read_text().split()[0])
            status='succeeded' if matched else 'accepted' if uptime<90 else 'failed'
            result.update(status=status,summary='已核实新的启动标识及服务状态' if matched else '机器已重新启动，等待服务恢复' if status=='accepted' else '机器已重新启动，但部分服务未恢复预期状态',afterBootId=boot_id(),services=services);write(path,result)
        return result
    if mode!='execute':raise RuntimeError('INVALID_MODE')
    allowed_keys={'version','mode','id','machineId','bindingHash','action','units','executeBefore'}
    if set(request)-allowed_keys:raise RuntimeError('UNEXPECTED_FIELDS')
    action=request.get('action');units=request.get('units')
    if action not in ['diagnose','start','stop','restart','reboot','poweroff'] or not isinstance(units,list) or len(units)>32 or len(set(units))!=len(units):raise RuntimeError('INVALID_ACTION')
    if action in ['reboot','poweroff'] and units:raise RuntimeError('POWER_TARGET_MUST_BE_MACHINE')
    for unit in units:
        if not isinstance(unit,str) or not UNIT.fullmatch(unit) or unit not in config['services']:raise RuntimeError('SERVICE_NOT_AUTHORIZED')
        if action in ['start','stop','restart'] and not config['services'][unit]['controllable']:raise RuntimeError('INFRASTRUCTURE_SERVICE_PROTECTED')
    if action in ['start','stop','restart'] and not units:raise RuntimeError('EMPTY_SERVICE_TARGET')
    node=Path('/etc/jarvis/node.json')
    if action in ['start','restart'] and 'jarvis-platform.service' in units and node.exists() and json.loads(node.read_text()).get('role')!='primary':raise RuntimeError('STANDBY_START_PROTECTED')
    digest=hashlib.sha256(json.dumps(request,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    if path.exists():
        prior=json.loads(path.read_text())
        if prior['requestHash']!=digest:raise RuntimeError('JOB_REPLAY_DIFFERENT_TARGET')
        # Persist-before-execute protects against rerunning after a broken SSH connection.
        if prior['status']=='running':prior.update(status='unknown',summary='Prior execution interrupted; no duplicate command sent');write(path,prior)
        return prior
    deadline=datetime.fromisoformat(request['executeBefore'].replace('Z','+00:00')).timestamp()
    if not time.time()<deadline<=time.time()+90:raise RuntimeError('EXPIRED_EXECUTION')
    result={'id':id,'machineId':config['machineId'],'bindingHash':request.get('bindingHash'),'action':action,'requestHash':digest,'status':'running','beforeBootId':boot_id(),'at':datetime.now(timezone.utc).isoformat()}
    write(path,result)
    try:
        if action=='diagnose':result.update(status='succeeded',summary='固定只读诊断已完成',diagnostic=diagnostics(config,units or list(config['services'])))
        elif action in ['reboot','poweroff']:
            if not config.get('powerEnabled'):raise RuntimeError('POWER_NOT_AUTHORIZED')
            r=command(['/usr/bin/systemd-run','--unit=jarvis-ops-power-'+id,'--on-active=12s','--property=Type=oneshot','/usr/bin/systemctl',action],10)
            if r.returncode:raise RuntimeError('POWER_SCHEDULE_FAILED')
            result.update(status='accepted',summary='电源指令已接受；最终状态仍需独立核实',scheduledDelaySec=12)
        else:
            before=[service_info(u,False) for u in units]
            r=command(['/usr/bin/systemctl',action,*units],50)
            after=[service_info(u) for u in units]
            expected=all(s['fields'].get('ActiveState')=='inactive' for s in after) if action=='stop' else all(s['fields'].get('ActiveState')=='active' for s in after)
            restarted=action!='restart' or all(b['fields'].get('ActiveEnterTimestampMonotonic')!=a['fields'].get('ActiveEnterTimestampMonotonic') for b,a in zip(before,after))
            result.update(status='succeeded' if r.returncode==0 and expected and restarted else 'failed',summary='服务操作及实际状态已核实' if r.returncode==0 and expected and restarted else '服务操作未通过状态核实',exitCode=r.returncode,before=before,services=after)
    except Exception as e:result.update(status='failed',summary=redact(e))
    write(path,result)
    return result

def main():
    if os.geteuid()!=0:raise RuntimeError('ROOT_WRAPPER_REQUIRED')
    st=CONFIG.stat()
    if st.st_uid!=0 or st.st_mode&0o022:raise RuntimeError('UNSAFE_NODE_POLICY')
    config=json.loads(CONFIG.read_text());STATE.mkdir(mode=0o700,exist_ok=True)
    raw=sys.stdin.buffer.read(65537)
    if len(raw)>65536:raise RuntimeError('REQUEST_TOO_LARGE')
    request=json.loads(raw)
    with open(STATE/'dispatcher.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        print(json.dumps(dispatch(config,request),ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except Exception as e:print(json.dumps({'status':'failed','error':redact(e)}));sys.exit(1)
