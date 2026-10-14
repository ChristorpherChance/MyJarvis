/** Export only public, source-bound fixed-check metadata. Never raw logs or private configuration. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {withPlatform,remote,lanProfile,python} from './managed-server-client.mjs';
const dir='artifacts/software-factory/acceptance-r26',j=JSON.parse(await readFile('.jarvis-dev/maintenance/factory-main-acceptance-r26-current-main-full.json','utf8'));
if(!j.started||!j.runId||!j.taskId)throw Error('ACCEPTANCE_NOT_STARTED');
const result=await withPlatform(async({api})=>{
 const run=(await api('/api/v1/execution/runs/'+j.runId)).data;
 if(run.projectId!==j.projectId||run.taskId!==j.taskId||run.workspace!==j.source)throw Error('ACCEPTANCE_READBACK_RUN_CHANGED');
 const host=JSON.parse(remote(lanProfile,'jarvis-101',python({runId:j.runId,fp:j.sourceObservation.sourceFingerprint},String.raw`
import json,stat,hashlib,re,subprocess,datetime
from pathlib import Path
root=Path('/var/lib/jarvis-development/101/main-acceptance-r26')/p['runId']
def read(q):
 for part in [q,*q.parents]:
  s=part.lstat()
  if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('ACCEPTANCE_EVIDENCE_UNTRUSTED')
 s=q.lstat()
 if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size>2000000:raise RuntimeError('ACCEPTANCE_EVIDENCE_UNSAFE')
 raw=q.read_bytes();return json.loads(raw),hashlib.sha256(raw).hexdigest()
attempts=[]
for d in sorted(root.iterdir() if root.exists() else []):
 if not re.fullmatch('[a-f0-9]{32}',d.name) or not d.is_dir():raise RuntimeError('ACCEPTANCE_ATTEMPT_INVALID')
 stages=[];detail=None
 for name in ['collector-build.json','collector-runtime.json']:
  q=d/'evidence'/name
  if not q.exists():continue
  value,sha=read(q)
  if value.get('runId')!=p['runId'] or value.get('sourceFingerprint')!=p['fp']:raise RuntimeError('ACCEPTANCE_COLLECTOR_BINDING_CHANGED')
  stages.append({'file':name,'sha256':sha,'checks':[{k:r.get(k) for k in ['id','executed','status','exitCode','tests']} for r in value.get('checks',[])],'problems':value.get('problems',[])})
 q=d/'detailed-report.json'
 if q.exists():
  detail,sha=read(q)
  if detail['report']['runId']!=p['runId'] or detail['report']['sourceFingerprint']!=p['fp']:raise RuntimeError('ACCEPTANCE_FINAL_REPORT_BINDING_CHANGED')
  detail={'sha256':sha,'report':detail['report'],'errorCodes':detail.get('errorCodes',[]),'cleanup':detail.get('cleanup'),'modelsInvoked':detail.get('modelsInvoked'),'productionDatabaseUsed':detail.get('productionDatabaseUsed'),'privateEnvCopied':detail.get('privateEnvCopied')}
 tests=[]
 for name in ['packages-shared-tests.json','apps-server-tests.json','apps-web-tests.json']:
  q=d/'evidence'/name
  if not q.exists():continue
  value,sha=read(q)
  tests.append({'file':name,'sha256':sha,'total':value.get('numTotalTests'),'passed':value.get('numPassedTests'),'failed':value.get('numFailedTests'),'pending':value.get('numPendingTests'),'success':value.get('success'),'failedFiles':[{'path':v.get('name','').removeprefix('/work/source/'),'failedAssertions':[a.get('fullName') or a.get('title') for a in v.get('assertionResults',[]) if a.get('status')=='failed']} for v in value.get('testResults',[]) if v.get('status')!='passed']})
 attempts.append({'attempt':d.name,'collectors':stages,'tests':tests,'final':detail})
containers=subprocess.run(['/usr/bin/docker','ps','-a','--filter','label=jarvis.validation.runId='+p['runId'],'--format','{{.Names}}'],capture_output=True,text=True,timeout=15)
networks=subprocess.run(['/usr/bin/docker','network','ls','--filter','label=jarvis.validation.runId='+p['runId'],'--format','{{.Name}}'],capture_output=True,text=True,timeout=15)
if containers.returncode or networks.returncode:raise RuntimeError('ACCEPTANCE_RESOURCE_READBACK_FAILED')
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z'),'attempts':attempts,'containers':containers.stdout.splitlines(),'networks':networks.stdout.splitlines(),'rawLogsExported':False,'credentialsExported':False}))
`),true));
 return {at:new Date().toISOString(),projectId:j.projectId,taskId:j.taskId,runId:j.runId,source:j.source,sourceRole:'current-main',sourceFingerprint:j.sourceObservation.sourceFingerprint,runStatus:run.status,signed:run.result?.source==='signed-agent',outcome:run.result?.outcome??null,exitCode:run.result?.exitCode??null,validationExitCode:run.result?.validation?.exitCode??null,usage:run.result?.usage??null,host,objectivesAccepted:false};
});
await mkdir(dir,{recursive:true});const output=dir+'/main-full-readback-'+Date.now()+'.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,at:result.at,status:result.runStatus,signed:result.signed,attempts:result.host.attempts.map(a=>({attempt:a.attempt,checks:a.collectors.flatMap(c=>c.checks).map(c=>({id:c.id,status:c.status,tests:c.tests})),tests:a.tests,final:a.final?{status:a.final.report.status,checks:a.final.report.checks.length,cleanup:a.final.cleanup,errors:a.final.errorCodes}:null})),containers:result.host.containers,networks:result.host.networks}));
