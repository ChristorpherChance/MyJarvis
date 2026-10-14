#!/usr/bin/python3
"""Fixed, limited follow-up audit: sandbox and three representative browser timeouts."""
import hashlib
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import time

CORE = '/usr/local/libexec/jarvis-msf-full-validation'
SOURCE = '/home/superopen/All-Projects/msf'
WORKSPACE = '/home/superopen/All-Projects/msf-supervised-tests'
ROOT = '/var/lib/jarvis-development/101/full-validation'
TOOLS = '/opt/jarvis-development/software-factory'
ENTRY = TOOLS + '/factory-supplemental-test-entry.mjs'
BROKER = TOOLS + '/factory-sandbox-broker.py'
CONTROL = TOOLS + '/factory-sandbox-broker-control.py'
PROBE = TOOLS + '/factory-sandbox-probe.mjs'
DOCKER = '/usr/bin/docker'
IMAGE = 'jarvis-msf-test:20261010-r2'
EXPECTED_IMAGE = 'sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96'
EXPECTED_SOURCE = '25ae0ce3523832bedac7d0838d0061f6a57a5af4a112f2d25e8551a980f4f4bf'
TEST_FILE = 'apps/server/src/modules/executor/sandbox.integration.test.ts'
BROWSER_SUITES = ['selftest','selftest-boundary','build-artifact']
STAGES = ['timeout-cleanup-smoke','offline-install','build','original-sandbox-tests','sandbox-functional-probe',*[ 'prototype-'+name for name in BROWSER_SUITES]]
FIELDS = ['originalSandboxTests','sandboxFunctional','browserSuites','timeoutCleanupSmoke','blocks','scopeComplete','allPlannedStagesAttempted']
ZERO_USAGE = {'inputTokens':0,'outputTokens':0,'cacheReadTokens':0,'cacheWriteTokens':0,'totalTokens':0,'usageComplete':True,'provider':'fixed-test','model':'no-model','costUSD':0,'costKind':'provider-reported'}

def trusted(path):
    for part in [Path(path),*Path(path).parents]:
        s=part.lstat()
        if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('SUPPLEMENTAL_TOOL_BOUNDARY_INVALID')

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def core_module():
    trusted(CORE)
    loader=importlib.machinery.SourceFileLoader('fixed_full_test_helpers',CORE)
    spec=importlib.util.spec_from_loader(loader.name,loader)
    module=importlib.util.module_from_spec(spec);loader.exec_module(module)
    return module

def result(summary,artifacts=None):
    print(json.dumps({'type':'execution.result','summary':json.dumps(summary),'needs_more_work':False,'artifacts':artifacts or [],'usage':ZERO_USAGE}),flush=True)

def verify(core,run_id):
    root=Path(ROOT)/run_id
    for file in ['report.json','copy.json','tools.json','evidence/container-report.json']:trusted(root/file)
    report=json.loads((root/'report.json').read_text());copy=json.loads((root/'copy.json').read_text());collector=json.loads((root/'evidence/container-report.json').read_text());tools=json.loads((root/'tools.json').read_text())
    valid=report.get('mode')=='limited-supplement' and report.get('runId')==collector.get('runId')==run_id
    valid=valid and report.get('collectorCompleted') is True and collector.get('collectorCompleted') is True
    valid=valid and report.get('sourceBefore')==report.get('sourceAfter')==copy.get('sha256')==collector.get('sourceFingerprint')==EXPECTED_SOURCE
    valid=valid and report.get('containerReportSHA256')==sha(root/'evidence/container-report.json') and report.get('productVerdict')==collector.get('productVerdict')=='NO-GO'
    valid=valid and all(sha(path)==value for path,value in tools.items())
    valid=valid and report.get('tests')=={key:collector.get(key) for key in FIELDS}
    valid=valid and report.get('stageSummary')==[{key:row.get(key) for key in ['name','ok','exitCode','timeout','durationMs','attempted']} for row in collector.get('stages',[])]
    stages=collector.get('stages',[]);names=[row.get('name') for row in stages]
    valid=valid and sorted(names)==sorted(STAGES) and len(names)==len(set(names))
    for row in stages:
        info=row.get('log',{});name=info.get('path','')
        if not re.fullmatch('[a-z0-9-]+\\.log',name):valid=False;continue
        path=root/'evidence'/name
        valid=valid and path.is_file() and not path.is_symlink() and sha(path)==info.get('sha256') and path.stat().st_size==info.get('bytes')
    manifest={row['path']:row['sha256'] for row in copy['manifest']}
    valid=valid and collector.get('testManifest')==[{'path':TEST_FILE,'sha256':manifest.get(TEST_FILE)}]
    valid=valid and collector.get('browserSuiteManifest')==BROWSER_SUITES
    fixture=report.get('sandboxFixture',{})
    valid=valid and report.get('cleanup',{}).get('complete') is True
    if fixture.get('ready'):
        valid=valid and fixture.get('readyEvidence',{}).get('runId')==run_id and fixture.get('readyEvidence',{}).get('sourceFingerprint')==EXPECTED_SOURCE
        valid=valid and fixture.get('cleanup',{}).get('ok') is True and fixture.get('cleanup',{}).get('networkRemoved') is True
        valid=valid and fixture.get('bindSmoke',{}).get('ok') is True and fixture.get('bindSmoke',{}).get('daemonActions')==0
    valid=valid and type(collector.get('scopeComplete')) is bool and type(collector.get('allPlannedStagesAttempted')) is bool
    if collector.get('scopeComplete'):
        original=collector.get('originalSandboxTests',{});supplement=collector.get('sandboxFunctional',{})
        valid=valid and fixture.get('ready') is True and original.get('total')==6 and original.get('pending')==0
        valid=valid and len(original.get('files',[]))==1 and original['files'][0].get('path')==TEST_FILE
        valid=valid and supplement.get('counts',{}).get('attempted')==6 and not supplement.get('errors')
        valid=valid and collector.get('timeoutCleanupSmoke',{}).get('passed') is True
        valid=valid and collector.get('allPlannedStagesAttempted') is True
        valid=valid and len(collector.get('browserSuites',[]))==3 and all(row.get('attempted') is True and row.get('timeout') is False for row in collector['browserSuites'])
        registry=fixture.get('daemonRegistry',{})
        valid=valid and registry.get('runId')==run_id and registry.get('sourceFingerprint')==EXPECTED_SOURCE and registry.get('creates')==6
        valid=valid and len(registry.get('containers',[]))==6 and len({r.get('id') for r in registry['containers']})==6
        valid=valid and all(r.get('removed') is True for r in registry['containers']) and registry.get('allCreateIntentsAcknowledged') is True
    else:valid=valid and bool(collector.get('blocks'))
    current=core.source_fingerprint(core.load_helper());valid=valid and current==EXPECTED_SOURCE
    print(json.dumps({'ok':bool(valid),'runId':run_id,'scopeComplete':collector.get('scopeComplete'),'allPlannedStagesAttempted':collector.get('allPlannedStagesAttempted'),'productVerdict':'NO-GO','sourceUnchanged':current==EXPECTED_SOURCE,'toolsVerified':all(sha(path)==value for path,value in tools.items()),'stages':len(stages),'reportSHA256':sha(root/'report.json'),'scope':'limited supplemental audit, not a new full-suite pass or delivery'}),flush=True)
    return 0 if valid else 2

def main():
    if os.geteuid()!=0 or len(sys.argv) not in [3,4] or sys.argv[1]!=WORKSPACE or not re.fullmatch('[a-f0-9]{40}',sys.argv[2]):raise RuntimeError('FIXED_SUPPLEMENTAL_ARGUMENTS_REQUIRED')
    run_id=sys.argv[2]
    for path in [__file__,CORE,ENTRY,BROKER,CONTROL,PROBE,DOCKER]:trusted(path)
    core=core_module()
    if len(sys.argv)==4:
        if sys.argv[3]!='--verify':raise RuntimeError('FIXED_SUPPLEMENTAL_ARGUMENTS_REQUIRED')
        return verify(core,run_id)
    root=Path(ROOT);trusted(root)
    work=root/run_id;work.mkdir(mode=0o700)
    source=work/'snapshot';source.mkdir(mode=0o700)
    helper=core.load_helper();copy=core.snapshot(helper,source);core.write_json(work/'copy.json',copy)
    if copy['sha256']!=EXPECTED_SOURCE:raise RuntimeError('SOURCE_CHANGED_REQUIRES_SCOPE_REVIEW')
    tools={str(Path(__file__).resolve()):sha(__file__),**{path:sha(path) for path in [CORE,ENTRY,BROKER,CONTROL,PROBE,core.COPY_HELPER]}};core.write_json(work/'tools.json',tools)
    evidence=work/'evidence';evidence.mkdir(mode=0o700);os.chown(evidence,1000,1000)
    writable=work/'work';writable.mkdir(mode=0o700);shutil.copytree(source,writable/'source')
    for directory,dirs,files in os.walk(writable,followlinks=False):
        os.chown(directory,1000,1000)
        for name in files:os.chown(Path(directory)/name,1000,1000)
    log=work/'infrastructure.log';log.touch(mode=0o600)
    image=subprocess.run([DOCKER,'image','inspect','--format','{{.Id}}',IMAGE],capture_output=True,text=True,timeout=15)
    if image.returncode!=0 or image.stdout.strip()!=EXPECTED_IMAGE:raise RuntimeError('VERIFIED_FIXED_IMAGE_CHANGED')
    name='jarvis-supplement-'+run_id+'-node'
    existing=subprocess.run([DOCKER,'inspect',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
    if existing.returncode==0:raise RuntimeError('SUPPLEMENTAL_CONTAINER_NAME_EXISTS')
    report={'formatVersion':1,'mode':'limited-supplement','runId':run_id,'source':SOURCE,'sourceBefore':copy['sha256'],'sourceAfter':None,'sourceGit':copy['git'],'sourceCodeChanged':False,'privateEnvCopied':False,'modelsInvoked':False,'productionDatabaseUsed':False,'businessContainersTouched':False,'collectorCompleted':False,'productVerdict':'NO-GO','fullSuiteRerun':False,'images':{'node':{'tag':IMAGE,'id':EXPECTED_IMAGE}},'tools':tools,'startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'scope':'Only original Sandbox 6, independent current-image 6 and three representative browser timeout suites; other full-audit failures remain unchanged','sandboxFixture':{'requested':True,'ready':False,'hostDaemonSocketExposedToTests':False},'cleanup':{'complete':False}}
    started=False
    def interrupted(*args):raise InterruptedError('SUPPLEMENTAL_CANCELLED')
    signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
    try:
        bind=core.sandbox_control('--check-bind',run_id,copy['sha256'],work/'sandbox-check-bind.log')
        report['sandboxFixture']['bindSmoke']=bind
        if bind.get('ok') is not True or bind.get('daemonActions')!=0:raise RuntimeError('SHORT_SOCKET_BIND_SMOKE_FAILED')
        fixture=core.sandbox_control('--start',run_id,copy['sha256'],work/'sandbox-control-start.log')
        if not fixture.get('ok'):raise RuntimeError('SUPPLEMENTAL_SANDBOX_FIXTURE_START_FAILED')
        sock=Path('/run/jarvis-ft-sandbox')/run_id/'docker.sock'
        for parent in [sock.parent,*sock.parent.parents]:
            s=parent.lstat()
            if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('SHORT_SOCKET_PARENT_BOUNDARY_INVALID')
        s=sock.lstat()
        if not stat.S_ISSOCK(s.st_mode) or s.st_uid!=1000 or stat.S_IMODE(s.st_mode)!=0o600 or fixture.get('socketPath')!=str(sock):raise RuntimeError('SHORT_SOCKET_BOUNDARY_INVALID')
        report['sandboxFixture'].update({'ready':True,'readyEvidence':fixture})
        env=work/'node.env'
        contents='CI=1\nHOME=/work/home\nCOREPACK_HOME=/corepack-cache\nCOREPACK_ENABLE_NETWORK=0\nMSF_SANDBOX_NETWORK=jarvis-ft-'+run_id+'-sandbox-net\nMSF_SANDBOX_CONCURRENCY=2\nJARVIS_FULL_TEST_RUN_ID='+run_id+'\nJARVIS_SOURCE_SHA256='+copy['sha256']+'\nJARVIS_SANDBOX_FIXTURE_READY=1\nJARVIS_SUPPLEMENTAL_TEST=1\n'
        fd=os.open(env,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(fd,'w') as out:out.write(contents)
        command=['run','--pull=never','--init','--shm-size','512m','--name',name,'--label','jarvis.validation.runId='+run_id,'--label','jarvis.validation.role=limited-supplement','--network','none','--user','1000:1000','--security-opt','no-new-privileges','--cap-drop','ALL','--read-only','--memory','8g','--cpus','3','--pids-limit','512','--tmpfs','/tmp:rw,nosuid,nodev,size=512m','--env-file',str(env),'--workdir','/work/source','--mount','type=bind,src='+str(writable)+',dst=/work','--mount','type=bind,src='+str(evidence)+',dst=/evidence','--mount','type=bind,src='+TOOLS+',dst=/tools,readonly','--mount','type=bind,src='+str(sock)+',dst=/var/run/docker.sock,readonly','--mount','type=bind,src=/home/superopen/opt/node22/lib/node_modules/corepack,dst=/corepack-runtime,readonly','--mount','type=bind,src=/home/superopen/.cache/node/corepack,dst=/corepack-cache,readonly','--mount','type=bind,src=/home/superopen/.local/share/pnpm/store,dst=/pnpm-store,readonly',EXPECTED_IMAGE,'node','/tools/factory-supplemental-test-entry.mjs']
        started=True;report['collectorExitCode']=core.docker(command,log,2400,phases=True)
        collector=json.loads((evidence/'container-report.json').read_text());report['collectorCompleted']=collector.get('collectorCompleted') is True
        report['containerReportSHA256']=sha(evidence/'container-report.json');report['tests']={key:collector.get(key) for key in FIELDS}
        report['stageSummary']=[{key:row.get(key) for key in ['name','ok','exitCode','timeout','durationMs','attempted']} for row in collector.get('stages',[])]
    except Exception as error:
        text=str(error);report['error']=text if re.fullmatch('[A-Z_]+',text) else 'SUPPLEMENTAL_INFRASTRUCTURE_OR_COLLECTOR_FAILED'
    finally:
        signal.signal(signal.SIGTERM,signal.SIG_IGN);signal.signal(signal.SIGINT,signal.SIG_IGN)
        container_code=0
        if started:
            owner=subprocess.run([DOCKER,'inspect','--format','{{index .Config.Labels "jarvis.validation.runId"}}',name],capture_output=True,text=True,timeout=15)
            container_code=core.docker(['rm','-f','--volumes',name],log,30) if owner.returncode==0 and owner.stdout.strip()==run_id else (0 if owner.returncode!=0 else 2)
        fixture_cleanup={'ok':True,'notCreated':True}
        if (work/'sandbox-broker/control.json').exists():
            try:fixture_cleanup=core.sandbox_control('--stop',run_id,copy['sha256'],work/'sandbox-control-stop.log')
            except Exception:fixture_cleanup={'ok':False,'code':'SUPPLEMENTAL_FIXTURE_CLEANUP_FAILED'}
        report['sandboxFixture']['cleanup']=fixture_cleanup
        registry_path=work/'sandbox-broker/registry.json'
        if registry_path.exists():
            trusted(registry_path);registry=json.loads(registry_path.read_text())
            if registry.get('runId')!=run_id or registry.get('sourceFingerprint')!=copy['sha256']:raise RuntimeError('SANDBOX_REGISTRY_IDENTITY_CHANGED')
            report['sandboxFixture']['daemonRegistry']={'runId':run_id,'sourceFingerprint':copy['sha256'],'creates':registry.get('creates'),'allCreateIntentsAcknowledged':all(r.get('status')=='acknowledged' for r in registry.get('createIntents',[])),'containers':[{'id':key,'removed':value.get('removed') is True,'started':value.get('started') is True,'logsRead':value.get('logsRead') is True} for key,value in registry.get('containers',{}).items()],'registrySHA256':sha(registry_path),'supplementalResultsCountedSeparatelyFromOriginal':True}
        report['cleanup']={'complete':container_code==0 and fixture_cleanup.get('ok') is True,'nodeContainerExitCode':container_code,'sandboxFixtureClean':fixture_cleanup.get('ok') is True}
        report['sourceAfter']=core.source_fingerprint(helper);report['sourceUnchanged']=report['sourceAfter']==EXPECTED_SOURCE
        report['finishedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
        for directory,dirs,files in os.walk(evidence,followlinks=False):
            os.chown(directory,0,0);os.chmod(directory,0o700)
            for file in files:os.chown(Path(directory)/file,0,0);os.chmod(Path(directory)/file,0o600)
        core.write_json(work/'report.json',report)
        report['publicEvidenceWritten']=core.publish(run_id,report)
        # Publish result is kept as a separate immutable receipt; report copy never changes.
        core.write_json(work/'publish-receipt.json',{'ok':report['publicEvidenceWritten']})
    summary={key:report.get(key) for key in ['runId','collectorCompleted','productVerdict','sourceUnchanged','fullSuiteRerun','error']}
    summary.update({'scopeComplete':report.get('tests',{}).get('scopeComplete'),'cleanupComplete':report['cleanup']['complete'],'publicEvidenceWritten':report.get('publicEvidenceWritten'),'stages':len(report.get('stageSummary',[]))})
    result(summary,['evidence/'+run_id+'/report.json'] if report.get('publicEvidenceWritten') else [])
    return 0 if report['collectorCompleted'] and report['sourceUnchanged'] and report['cleanup']['complete'] and report.get('publicEvidenceWritten') else 1

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as error:
        text=str(error);code=text if re.fullmatch('[A-Z_]+',text) else 'SUPPLEMENTAL_FIXED_TOOL_FAILED'
        result({'collectorCompleted':False,'productVerdict':'NO-GO','error':code});sys.exit(2)
