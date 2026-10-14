#!/usr/bin/python3
"""Fixed-source isolated test audit. Only local images; no business services touched."""
import hashlib
import importlib.util
import importlib.machinery
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import selectors
import signal
import shutil
import stat
import subprocess
import sys
import time

SOURCE = '/home/superopen/All-Projects/msf'
EXPECTED_SOURCE_SHA256 = '25ae0ce3523832bedac7d0838d0061f6a57a5af4a112f2d25e8551a980f4f4bf'
TASK_WORKSPACE = '/home/superopen/All-Projects/msf-supervised-tests'
ROOT = '/var/lib/jarvis-development/101/full-validation'
TOOLS = '/opt/jarvis-development/software-factory'
COPY_HELPER = '/usr/local/libexec/jarvis-msf-validation'
ENTRY = TOOLS + '/factory-full-test-entry.mjs'
PROBE = TOOLS + '/factory-risk-probe.mjs'
STORAGE_PROBE = TOOLS + '/factory-storage-probe.mjs'
SANDBOX_BROKER = TOOLS + '/factory-sandbox-broker.py'
SANDBOX_CONTROL = TOOLS + '/factory-sandbox-broker-control.py'
SANDBOX_PROBE = TOOLS + '/factory-sandbox-probe.mjs'
DOCKER = '/usr/bin/docker'
IMAGES = {'node':'jarvis-msf-test:20261010-r2','postgres':'postgres:16','redis':'redis:7','minio':'quay.io/minio/minio'}
STAGES = ['offline-install','build','typecheck','lint','dependency-boundaries','document-codes','all-package-tests','sandbox-functional-probe','truthfulness-probe','storage-signing-probe']
SUMMARY_FIELDS = ['testResults','coverage','allTestFilesAccountedFor','browserSuites','blocks','truthfulnessProbe','storageSigning','sandboxFunctional']
ZERO_USAGE={'inputTokens':0,'outputTokens':0,'cacheReadTokens':0,'cacheWriteTokens':0,'totalTokens':0,'usageComplete':True,'provider':'fixed-test','model':'no-model','costUSD':0,'costKind':'provider-reported'}

def reject(code):
    print(json.dumps({'type':'execution.result','summary':json.dumps({'collectorCompleted':False,'error':code}),'needs_more_work':False,'artifacts':[],'usage':ZERO_USAGE}), flush=True)
    raise SystemExit(2)

def trusted(path):
    for part in [Path(path), *Path(path).parents]:
        s = part.lstat()
        if stat.S_ISLNK(s.st_mode) or s.st_uid != 0 or s.st_mode & 0o022:
            reject('TRUSTED_TEST_TOOL_BOUNDARY_INVALID')

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def write_json(path,value):
    fd = os.open(str(path),os.O_CREAT|os.O_WRONLY|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as f:json.dump(value,f,ensure_ascii=False,indent=2);f.write('\n')

def load_helper():
    trusted(COPY_HELPER)
    loader = importlib.machinery.SourceFileLoader('fixed_snapshot_boundary', COPY_HELPER)
    spec = importlib.util.spec_from_loader(loader.name,loader)
    helper = importlib.util.module_from_spec(spec);loader.exec_module(helper)
    return helper

def snapshot(helper,destination):
    counters, manifest, fingerprint = [0,0],[],hashlib.sha256()
    fd = helper.open_source()
    try:
        before = helper.raw_git_metadata(fd)
        helper.secure_copy(fd,destination,counters,fingerprint,manifest=manifest)
        second, checked = hashlib.sha256(),[0,0]
        helper.secure_copy(fd,None,checked,second)
        after = helper.raw_git_metadata(fd)
    finally:os.close(fd)
    if before!=after or counters!=checked or fingerprint.digest()!=second.digest():reject('SOURCE_CHANGED_DURING_SNAPSHOT')
    return {'source':SOURCE,'sha256':fingerprint.hexdigest(),'files':counters[0],'bytes':counters[1],'privateEnvCopied':False,'git':before,'manifest':manifest}

def docker(args,log,timeout=120,phases=False):
    with open(log,'ab',buffering=0) as stream:
        if not phases:
            result = subprocess.run([DOCKER,*args],stdin=subprocess.DEVNULL,stdout=stream,stderr=stream,timeout=timeout,check=False)
            return result.returncode
        child=subprocess.Popen([DOCKER,*args],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        select=selectors.DefaultSelector();select.register(child.stdout,selectors.EVENT_READ);pending=b'';start=time.monotonic()
        try:
            while True:
                if time.monotonic()-start>timeout:raise TimeoutError('FULL_TEST_TIMEOUT')
                events=select.select(1)
                for key,_ in events:
                    chunk=os.read(key.fd,65536)
                    if not chunk:select.unregister(child.stdout);break
                    stream.write(chunk);pending+=chunk
                    while b'\n' in pending:
                        line,pending=pending.split(b'\n',1)
                        if len(line)>4096:continue
                        try:
                            row=json.loads(line)
                            if not isinstance(row,dict) or not re.fullmatch('[a-z0-9-]{1,100}',str(row.get('phase',''))):continue
                            out={'type':'execution.progress','phase':row['phase']}
                            for field in ['ok','timeout']:
                                if type(row.get(field)) is bool:out[field]=row[field]
                            if row.get('exitCode') is None or type(row.get('exitCode')) is int:out['exitCode']=row.get('exitCode')
                            if type(row.get('durationMs')) is int and 0<=row['durationMs']<=14400000:out['durationMs']=row['durationMs']
                            print(json.dumps(out),flush=True)
                        except (ValueError,UnicodeDecodeError):pass
                    if len(pending)>65536:pending=b''
                if not select.get_map():break
            return child.wait(timeout=15)
        finally:
            select.close()
            if child.poll() is None:child.kill();child.wait(timeout=15)
            child.stdout.close()

def image_ids(log):
    result={}
    for kind,image in IMAGES.items():
        r=subprocess.run([DOCKER,'image','inspect','--format','{{.Id}}',image],capture_output=True,text=True,timeout=15)
        if r.returncode!=0 or not re.fullmatch(r'sha256:[0-9a-f]{64}',r.stdout.strip()):reject('REQUIRED_LOCAL_IMAGE_UNAVAILABLE_'+kind.upper())
        result[kind]={'tag':image,'id':r.stdout.strip()}
    return result

def sandbox_control(action,run_id,fingerprint,log):
    with open(log,'xb') as out:
        os.chmod(log,0o600)
        r=subprocess.run(['/usr/bin/python3',SANDBOX_CONTROL,action,run_id,fingerprint],stdout=out,stderr=out,timeout=180 if action=='--stop' else 120)
    answer={'ok':False,'code':'SANDBOX_FIXTURE_CONTROL_OUTPUT_INVALID'}
    for line in Path(log).read_text(errors='replace').splitlines():
        try:
            row=json.loads(line)
            if isinstance(row,dict) and type(row.get('ok')) is bool:answer=row
        except ValueError:pass
    if r.returncode!=0:answer['ok']=False
    return answer

def source_fingerprint(helper):
    return snapshot(helper,None)['sha256']

def verify(run_id):
    root=Path(ROOT)/run_id
    trusted(root);trusted(root/'report.json');trusted(root/'copy.json');trusted(root/'tools.json')
    report=json.loads((root/'report.json').read_text());copied=json.loads((root/'copy.json').read_text());tools=json.loads((root/'tools.json').read_text())
    collector=json.loads((root/'evidence/container-report.json').read_text())
    valid=report.get('runId')==run_id==collector.get('runId') and report.get('collectorCompleted') is True and collector.get('collectorCompleted') is True
    valid=valid and report.get('sourceBefore')==report.get('sourceAfter')==copied.get('sha256')==collector.get('sourceFingerprint')==EXPECTED_SOURCE_SHA256
    valid=valid and digest(root/'evidence/container-report.json')==report.get('containerReportSHA256') and report.get('productVerdict')==collector.get('productVerdict')
    valid=valid and report.get('tests')=={k:collector.get(k) for k in SUMMARY_FIELDS}
    valid=valid and report.get('stageSummary')==[{k:row.get(k) for k in ['name','ok','exitCode','timeout','durationMs']} for row in collector.get('stages',[])]
    valid=valid and all(digest(path)==hash_value for path,hash_value in tools.items())
    names=[row.get('name') for row in collector.get('stages',[])]
    valid=valid and all(name in names for name in STAGES) and len(names)==len(set(names))
    browser=collector.get('browserSuiteManifest',[])
    if len(browser)==30:
        valid=valid and all('prototype-'+name in names or any(r.get('name')==name and r.get('reason')=='SCRIPT_MISSING' for r in collector.get('browserSuites',[])) for name in browser)
    else:
        valid=valid and any(b.get('code')=='DOCUMENTED_BROWSER_MANIFEST_MISSING_OR_INVALID' for b in collector.get('blocks',[]))
    expected=sorted(r['path'] for r in copied['manifest'] if re.search(r'\.(?:test|spec)\.tsx?$',r['path']))
    observed=sorted(r['path'] for r in collector.get('testManifest',[]))
    valid=valid and expected==observed and len(expected)>0
    manifest={r['path']:r['sha256'] for r in copied['manifest']}
    valid=valid and all(manifest.get(row['path'])==row['sha256'] for row in collector.get('testManifest',[]))
    for row in collector.get('stages',[]):
        info=row.get('log',{});name=info.get('path','')
        if not re.fullmatch(r'[a-z0-9-]+\.log',name):valid=False;continue
        p=root/'evidence'/name
        if not p.is_file() or p.is_symlink() or digest(p)!=info.get('sha256') or p.stat().st_size!=info.get('bytes'):valid=False
    valid=valid and report.get('cleanup',{}).get('complete') is True
    fixture=report.get('sandboxFixture',{})
    valid=valid and fixture.get('requested') is True and type(fixture.get('ready')) is bool
    if fixture.get('ready'):
        valid=valid and fixture.get('cleanup',{}).get('ok') is True and fixture.get('cleanup',{}).get('networkRemoved') is True
        valid=valid and fixture.get('readyEvidence',{}).get('sourceFingerprint')==copied.get('sha256') and fixture.get('readyEvidence',{}).get('runId')==run_id
    if report.get('productVerdict')=='GO-CANDIDATE':
        valid=valid and fixture.get('ready') is True
        valid=valid and not collector.get('blocks') and all(row.get('ok') is True for row in collector.get('stages',[]))
        valid=valid and collector.get('allTestFilesAccountedFor') is True and collector.get('truthfulnessProbe',{}).get('productSafe') is True
        valid=valid and collector.get('storageSigning',{}).get('probePassed') is True and collector.get('sandboxFunctional',{}).get('probePassed') is True
        valid=valid and len(collector.get('browserSuites',[]))==30 and all(row.get('ok') is True for row in collector.get('browserSuites',[]))
        valid=valid and len(collector.get('testResults',[]))==3 and all(row.get('success') is True and row.get('failed')==0 and row.get('pending')==0 for row in collector.get('testResults',[]))
        valid=valid and len(collector.get('coverage',[]))==2 and all(row.get('lines',{}).get('percent',0)>=row.get('thresholds',{}).get('lines',101) and row.get('branches',{}).get('percent',0)>=row.get('thresholds',{}).get('branches',101) for row in collector.get('coverage',[]))
    helper=load_helper();current=source_fingerprint(helper)
    valid=valid and current==report.get('sourceAfter')
    answer={'ok':valid,'runId':run_id,'collectorCompleted':report.get('collectorCompleted') is True,'productVerdict':report.get('productVerdict'),'sourceUnchanged':current==report.get('sourceBefore'),'sourceFingerprint':current,'testFiles':len(expected),'stages':len(names),'reportSHA256':digest(root/'report.json'),'toolsVerified':all(digest(path)==hash_value for path,hash_value in tools.items()),'scope':'independent test-audit evidence verification; product verdict remains separate'}
    print(json.dumps(answer),flush=True)
    return 0 if valid else 2

def publish(run_id,report):
    # Public summary only: no raw stdout, credentials, environment or private config.
    account=pwd.getpwnam('superopen')
    pid=os.fork()
    if pid==0:
        # A user-controlled destination cannot redirect root writes or chown.
        os.setgroups([]);os.setgid(account.pw_gid);os.setuid(account.pw_uid)
        try:
            target=Path(TASK_WORKSPACE)/'evidence'/run_id
            if not Path(TASK_WORKSPACE).is_dir() or Path(TASK_WORKSPACE).is_symlink() or Path(TASK_WORKSPACE).resolve()!=Path(TASK_WORKSPACE):os._exit(1)
            for part in [Path(TASK_WORKSPACE)/'evidence',target]:
                if part.exists() and (part.is_symlink() or not part.is_dir()):os._exit(1)
                part.mkdir(mode=0o700,exist_ok=True)
            candidate=target/'report.json'
            if candidate.exists():os._exit(1)
            write_json(candidate,report)
            os._exit(0)
        except Exception:os._exit(1)
    _,status=os.waitpid(pid,0)
    return os.WIFEXITED(status) and os.WEXITSTATUS(status)==0

def main():
    if os.geteuid()!=0 or len(sys.argv) not in (3,4) or sys.argv[1] not in (SOURCE,TASK_WORKSPACE) or not re.fullmatch('[0-9a-f]{40}',sys.argv[2]):reject('FIXED_FULL_TEST_ARGUMENTS_REQUIRED')
    run_id=sys.argv[2]
    for path in [__file__,ENTRY,DOCKER]:trusted(path)
    if len(sys.argv)==4:
        if sys.argv[3]!='--verify':reject('FIXED_FULL_TEST_ARGUMENTS_REQUIRED')
        return verify(run_id)
    for path in [PROBE,STORAGE_PROBE,SANDBOX_BROKER,SANDBOX_CONTROL,SANDBOX_PROBE]:trusted(path)
    root=Path(ROOT);root.mkdir(mode=0o700,parents=True,exist_ok=True);trusted(root)
    work=root/run_id;work.mkdir(mode=0o700) # Existing signed run cannot overwrite evidence.
    helper=load_helper();source=work/'snapshot';source.mkdir(mode=0o700)
    copied=snapshot(helper,source);write_json(work/'copy.json',copied)
    if copied['sha256']!=EXPECTED_SOURCE_SHA256:reject('SOURCE_CHANGED_REQUIRES_SCOPE_REVIEW')
    tools={str(Path(__file__).resolve()):digest(__file__),ENTRY:digest(ENTRY),PROBE:digest(PROBE),STORAGE_PROBE:digest(STORAGE_PROBE),SANDBOX_BROKER:digest(SANDBOX_BROKER),SANDBOX_CONTROL:digest(SANDBOX_CONTROL),SANDBOX_PROBE:digest(SANDBOX_PROBE),COPY_HELPER:digest(COPY_HELPER)};write_json(work/'tools.json',tools)
    evidence=work/'evidence';evidence.mkdir(mode=0o700);os.chown(evidence,1000,1000)
    writable=work/'work';writable.mkdir(mode=0o700);shutil.copytree(source,writable/'source')
    for directory,dirs,files in os.walk(writable,followlinks=False):
        os.chown(directory,1000,1000)
        for name in files:os.chown(Path(directory)/name,1000,1000)
    log=work/'infrastructure.log';log.touch(mode=0o600)
    images=image_ids(log)
    prefix='jarvis-ft-'+run_id;network=prefix+'-net';names={k:prefix+'-'+k for k in ['postgres','redis','minio','node']};created=[];network_created=False
    for name in names.values():
        r=subprocess.run([DOCKER,'container','inspect',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
        if r.returncode==0:reject('VALIDATION_CONTAINER_NAME_ALREADY_EXISTS')
    password=secrets.token_hex(24)
    pg_env=work/'postgres.env';minio_env=work/'minio.env';node_env=work/'node.env'
    for file,content in [(pg_env,'POSTGRES_USER=jarvis_test\nPOSTGRES_PASSWORD='+password+'\nPOSTGRES_DB=jarvis_test\n'),(minio_env,'MINIO_ROOT_USER=jarvis_test\nMINIO_ROOT_PASSWORD='+password+'\n'),(node_env,'CI=1\nHOME=/work/home\nCOREPACK_HOME=/corepack-cache\nCOREPACK_ENABLE_NETWORK=0\nMSF_DATABASE_URL=postgres://jarvis_test:'+password+'@postgres:5432/jarvis_test\nMSF_REDIS_URL=redis://redis:6379\nMSF_MINIO_ENDPOINT=minio\nMSF_MINIO_PORT=9000\nMSF_MINIO_ACCESS_KEY=jarvis_test\nMSF_MINIO_SECRET_KEY='+password+'\nMSF_MINIO_BUCKET=jarvis-test-'+run_id+'\nMSF_SECRET_KEY='+secrets.token_hex(32)+'\nMSF_SANDBOX_NETWORK='+prefix+'-sandbox-net\nJARVIS_FULL_TEST_RUN_ID='+run_id+'\nJARVIS_SOURCE_SHA256='+copied['sha256']+'\n')]:
        fd=os.open(file,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as f:f.write(content)
    report={'formatVersion':1,'runId':run_id,'source':SOURCE,'sourceBefore':copied['sha256'],'sourceAfter':None,'sourceGit':copied['git'],'privateEnvCopied':False,'modelsInvoked':False,'productionDatabaseUsed':False,'businessContainersTouched':False,'sourceCodeChanged':False,'collectorCompleted':False,'productVerdict':'NO-GO','startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'images':images,'tools':tools,'scope':'isolated test audit, not product delivery or production release','cancellationProtection':'SIGTERM enters private-resource cleanup; forced SIGKILL requires a separate scoped cleanup check','cleanup':{'complete':False}}
    report['sandboxFixture']={'requested':True,'ready':False,'hostDaemonSocketExposedToTests':False}
    def interrupted(signum,frame):raise InterruptedError('FULL_TEST_CANCELLED')
    signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
    try:
        if docker(['network','create','--internal',network],log)!=0:raise RuntimeError('PRIVATE_NETWORK_CREATE_FAILED')
        network_created=True
        common=['run','--pull=never','--detach','--label','jarvis.validation.runId='+run_id,'--network',network,'--security-opt','no-new-privileges','--cap-drop','ALL','--cap-add','CHOWN','--cap-add','DAC_OVERRIDE','--cap-add','FOWNER','--cap-add','SETUID','--cap-add','SETGID','--memory','768m','--cpus','1']
        # Service processes need their image defaults, never host data or Docker socket.
        for kind,args in [('postgres',['--env-file',str(pg_env),images['postgres']['id']]),('redis',[images['redis']['id'],'redis-server','--save','','--appendonly','no']),('minio',['--env-file',str(minio_env),images['minio']['id'],'server','/data'])]:
            name=names[kind];created.append(name)
            if docker([*common,'--name',name,'--network-alias',kind,*args],log)!=0:raise RuntimeError('PRIVATE_SERVICE_START_FAILED_'+kind.upper())
        ready=False
        for _ in range(45):
            pg=docker(['exec',names['postgres'],'pg_isready','-U','jarvis_test','-d','jarvis_test'],log,15)
            redis=docker(['exec',names['redis'],'redis-cli','ping'],log,15)
            mini=docker(['run','--rm','--pull=never','--network',network,'--user','1000:1000','--security-opt','no-new-privileges','--cap-drop','ALL','--read-only',images['node']['id'],'node','-e',"fetch('http://minio:9000/minio/health/live',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],log,15)
            if pg==0 and redis==0 and mini==0:ready=True;break
            time.sleep(2)
        if not ready:raise RuntimeError('PRIVATE_INFRASTRUCTURE_NOT_READY')
        # Migration uses real SQL but only this new isolated database.
        migration_log=work/'migrations.log';migration_log.touch(mode=0o600)
        for path in sorted((source/'apps/server/src/db/migrations').glob('*.sql')):
            with open(path,'rb') as sql,open(migration_log,'ab') as out:
                r=subprocess.run([DOCKER,'exec','-i',names['postgres'],'psql','-U','jarvis_test','-d','jarvis_test','-v','ON_ERROR_STOP=1'],stdin=sql,stdout=out,stderr=out,timeout=30)
            if r.returncode!=0:raise RuntimeError('ISOLATED_MIGRATION_FAILED')
        fixture=sandbox_control('--start',run_id,copied['sha256'],work/'sandbox-control-start.log')
        sandbox_mount=[]
        if fixture.get('ok'):
            sock=work/'sandbox-broker/docker.sock'
            info=sock.lstat()
            if not stat.S_ISSOCK(info.st_mode) or info.st_uid!=1000 or info.st_mode&0o077:raise RuntimeError('SANDBOX_FIXTURE_SOCKET_BOUNDARY_INVALID')
            report['sandboxFixture'].update({'ready':True,'readyEvidence':fixture})
            sandbox_mount=['--mount','type=bind,src='+str(sock)+',dst=/var/run/docker.sock,readonly']
        else:
            code=fixture.get('code','SANDBOX_FIXTURE_NOT_READY')
            report['sandboxFixture']['blockedCode']=code if re.fullmatch('[A-Z_]+',str(code)) else 'SANDBOX_FIXTURE_NOT_READY'
        with open(node_env,'a') as f:f.write('JARVIS_SANDBOX_FIXTURE_READY='+('1' if fixture.get('ok') else '0')+'\n')
        name=names['node'];created.append(name)
        command=['run','--pull=never','--init','--shm-size','512m','--label','jarvis.validation.runId='+run_id,'--name',name,'--network',network,'--user','1000:1000','--security-opt','no-new-privileges','--cap-drop','ALL','--read-only','--memory','8g','--cpus','3','--pids-limit','512','--tmpfs','/tmp:rw,nosuid,nodev,size=512m','--env-file',str(node_env),'--workdir','/work/source','--mount','type=bind,src='+str(writable)+',dst=/work','--mount','type=bind,src='+str(evidence)+',dst=/evidence','--mount','type=bind,src='+TOOLS+',dst=/tools,readonly','--mount','type=bind,src=/home/superopen/opt/node22/lib/node_modules/corepack,dst=/corepack-runtime,readonly','--mount','type=bind,src=/home/superopen/.cache/node/corepack,dst=/corepack-cache,readonly','--mount','type=bind,src=/home/superopen/.local/share/pnpm/store,dst=/pnpm-store,readonly',images['node']['id'],'node','/tools/factory-full-test-entry.mjs']
        command[1:1]=sandbox_mount
        report['collectorExitCode']=docker(command,log,3600,phases=True)
        container=json.loads((evidence/'container-report.json').read_text())
        report['collectorCompleted']=container.get('collectorCompleted') is True
        report['productVerdict']=container.get('productVerdict','NO-GO')
        report['containerReportSHA256']=digest(evidence/'container-report.json')
        report['tests']={k:container.get(k) for k in SUMMARY_FIELDS}
        report['stageSummary']=[{k:row.get(k) for k in ['name','ok','exitCode','timeout','durationMs']} for row in container.get('stages',[])]
    except Exception as exc:
        report['error']=str(exc) if re.fullmatch('[A-Z_]+',str(exc)) else 'FULL_TEST_INFRASTRUCTURE_OR_COLLECTOR_FAILED'
    finally:
        signal.signal(signal.SIGTERM,signal.SIG_IGN);signal.signal(signal.SIGINT,signal.SIG_IGN)
        cleanup=[]
        # Stop the unprivileged test process before revoking/cleaning its fixture.
        stopped_node=False
        if names['node'] in created:
            label=subprocess.run([DOCKER,'container','inspect','--format','{{index .Config.Labels "jarvis.validation.runId"}}',names['node']],capture_output=True,text=True,timeout=15)
            code=docker(['rm','--force','--volumes',names['node']],log,30) if label.returncode==0 and label.stdout.strip()==run_id else (0 if label.returncode!=0 else 2)
            cleanup.append({'container':names['node'],'exitCode':code});stopped_node=True
        if (work/'sandbox-broker/control.json').exists():
            try:report['sandboxFixture']['cleanup']=sandbox_control('--stop',run_id,copied['sha256'],work/'sandbox-control-stop.log')
            except Exception:report['sandboxFixture']['cleanup']={'ok':False,'code':'SANDBOX_FIXTURE_CLEANUP_FAILED'}
        for name in reversed(created):
            if name==names['node'] and stopped_node:continue
            label=subprocess.run([DOCKER,'container','inspect','--format','{{index .Config.Labels "jarvis.validation.runId"}}',name],capture_output=True,text=True,timeout=15)
            code=docker(['rm','--force','--volumes',name],log,30) if label.returncode==0 and label.stdout.strip()==run_id else (0 if label.returncode!=0 else 2)
            cleanup.append({'container':name,'exitCode':code})
        network_code=docker(['network','rm',network],log,30) if network_created else 0
        fixture_clean=report['sandboxFixture'].get('cleanup',{}).get('ok') is True if (work/'sandbox-broker/control.json').exists() else True
        report['cleanup']={'complete':all(r['exitCode']==0 for r in cleanup) and network_code==0 and fixture_clean,'containers':cleanup,'networkExitCode':network_code,'sandboxFixtureClean':fixture_clean}
        report['sourceAfter']=source_fingerprint(helper)
        report['sourceUnchanged']=report['sourceBefore']==report['sourceAfter']
        if not report['sourceUnchanged']:report['productVerdict']='NO-GO'
        report['finishedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
        for directory,dirs,files in os.walk(evidence,followlinks=False):
            os.chown(directory,0,0);os.chmod(directory,0o700)
            for name in files:
                p=Path(directory)/name
                if p.is_symlink():continue
                os.chown(p,0,0);os.chmod(p,0o600)
        write_json(work/'report.json',report)
        report['publicEvidenceWritten']=publish(run_id,report)
    summary={'runId':run_id,'collectorCompleted':report['collectorCompleted'],'productVerdict':report['productVerdict'],'sourceUnchanged':report['sourceUnchanged'],'cleanupComplete':report['cleanup']['complete'],'stages':len(report.get('stageSummary',[])),'error':report.get('error'),'publicEvidenceWritten':report.get('publicEvidenceWritten')}
    print(json.dumps({'type':'execution.result','summary':json.dumps(summary),'needs_more_work':False,'artifacts':['evidence/'+run_id+'/report.json'] if report.get('publicEvidenceWritten') else [],'usage':ZERO_USAGE}),flush=True)
    return 0 if report['collectorCompleted'] and report['sourceUnchanged'] and report['cleanup']['complete'] else 1

if __name__=='__main__':
    raise SystemExit(main())
