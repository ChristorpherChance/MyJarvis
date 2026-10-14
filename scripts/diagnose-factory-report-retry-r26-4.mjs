/** Create a new, current-run diagnosis only after its signed, hash-bound terminal report exists. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {withPlatform,remote,lanProfile,python} from './managed-server-client.mjs';
const dir='artifacts/software-factory/acceptance-r26',project='70ec346f-6520-46ed-abed-22cac770a3e4';
const batch=JSON.parse(await readFile('.jarvis-dev/maintenance/factory-main-acceptance-r26-4-current-main-full.json','utf8'));
const fp='151300cf55e8e46445e5e3b85293c047f981b14f620350a217a61d9a987056ea',sha=x=>createHash('sha256').update(x).digest('hex');
const paths=['apps/server/src/modules/executor/sandbox.integration.test.ts','apps/server/src/modules/executor/sandbox.service.ts','apps/server/src/modules/platform/storage.service.test.ts','apps/server/src/modules/platform/storage.service.ts','doc/tests/syntax.cjs','doc/tests/run-all.cjs','doc/tests/prototype-commands.cjs'];
const result=await withPlatform(async({api})=>{
 const run=(await api('/api/v1/execution/runs/'+batch.runId)).data;
 const validation=run.result?.validation,raw=validation?.autonomyReportJson;
 if(!['succeeded','failed'].includes(run.status)||run.result?.source!=='signed-agent'||run.result.lateEvidenceOnly||run.stopRequested||run.projectId!==project||run.taskId!==batch.taskId||run.workspace!==batch.source||typeof raw!=='string'||sha(raw)!==validation.autonomyReportSha256)throw Error('RETRY_DIAGNOSIS_TERMINAL_REPORT_REQUIRED');
 const report=JSON.parse(raw);
 if(report.schemaVersion!==1||report.kind!=='project-autonomy-validation'||report.simulated!==false||report.runId!==run.id||report.workspace!==batch.source||report.sourceFingerprint!==fp||report.sourceStable!==true||!Array.isArray(report.checks)||new Set(report.checks.map(c=>c.id)).size!==report.checks.length)throw Error('RETRY_DIAGNOSIS_REPORT_BINDING_CHANGED');
 const host=JSON.parse(remote(lanProfile,'jarvis-101',python({runId:run.id,fp,paths,source:batch.source,helperSHA:'57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2',reportSHA:validation.autonomyReportSha256},String.raw`
import os,sys,stat,json,re,hashlib,subprocess
from pathlib import Path
from types import ModuleType
sys.dont_write_bytecode=True
def need(v,c):
 if not v:raise RuntimeError(c)
def private(q):
 for part in [q,*q.parents]:
  s=part.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'RETRY_DIAGNOSIS_TOOL_UNTRUSTED')
 fd=os.open(q,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and 0<s.st_size<=2097152,'RETRY_DIAGNOSIS_FILE_INVALID')
  raw=os.read(fd,2097153);a=os.fstat(fd);need(len(raw)==s.st_size and (s.st_ino,s.st_mtime_ns,s.st_ctime_ns)==(a.st_ino,a.st_mtime_ns,a.st_ctime_ns),'RETRY_DIAGNOSIS_FILE_CHANGED');return raw
 finally:os.close(fd)
tool=Path('/opt/jarvis-development/software-factory/project-autonomy-evidence.py');body=private(tool)
need(hashlib.sha256(body).hexdigest()==p['helperSHA'],'RETRY_DIAGNOSIS_HELPER_CHANGED')
h=ModuleType('retry_diagnosis_source');exec(compile(body,str(tool),'exec'),h.__dict__)
source=h.fingerprint(p['source']);need(source['sha256']==p['fp'] and source['files']==593,'RETRY_DIAGNOSIS_SOURCE_CHANGED')
entries={v['path']:v for v in source['manifest']};need(all(v in entries for v in p['paths']),'RETRY_DIAGNOSIS_SOURCE_FILE_MISSING')
root=Path('/var/lib/jarvis-development/101/main-acceptance-r26-4')/p['runId'];attempts=[q for q in root.iterdir() if re.fullmatch('[a-f0-9]{32}',q.name)]
need(len(attempts)==1,'RETRY_DIAGNOSIS_ATTEMPT_AMBIGUOUS');attempt=attempts[0]
detailRaw=private(attempt/'detailed-report.json');detail=json.loads(detailRaw);r=detail['report']
need(r['runId']==p['runId'] and r['sourceFingerprint']==p['fp'] and r['sourceStable'] is True,'RETRY_DIAGNOSIS_PRIVATE_REPORT_MISMATCH')
# JSON whitespace differs between detailed and published protocol; compare canonical objects separately in JS.
test=private(attempt/'evidence/apps-server-tests.json');t=json.loads(test)
need(isinstance(t,dict) and isinstance(t.get('testResults'),list),'RETRY_DIAGNOSIS_TEST_REPORT_INVALID')
failedFiles=[]
for v in t['testResults']:
 name=v.get('name','').removeprefix('/work/source/')
 if v.get('status')!='passed':need(name in entries,'RETRY_DIAGNOSIS_UNKNOWN_FAILED_SOURCE');failedFiles.append(name)
head=subprocess.run(['/usr/bin/git','-C',p['source'],'rev-parse','HEAD'],capture_output=True,text=True,check=True,timeout=10).stdout.strip()
need(head=='89e6af3ac64f707c3ba6fc09e9e09fe4a4174171' and h.fingerprint(p['source'])==source,'RETRY_DIAGNOSIS_SOURCE_CHANGED_DURING_READ')
print(json.dumps({'attempt':attempt.name,'source':{'workspace':p['source'],'head':head,'sha256':source['sha256'],'publicFiles':source['files']},'sources':[{'publicSourcePath':v, 'sha256':entries[v]['sha256']} for v in p['paths']],'detailSHA':hashlib.sha256(detailRaw).hexdigest(),'privateReport':r,'errorCodes':detail.get('errorCodes',[]),'failedTestFiles':failedFiles,'testSHA':hashlib.sha256(test).hexdigest(),'rawLogsExported':False}))
`),true));
 const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
 if(canonical(host.privateReport)!==canonical(report))throw Error('RETRY_DIAGNOSIS_PRIVATE_PUBLIC_REPORT_MISMATCH');
 const prior=dir+'/main-failures-readonly-diagnosis-r26-20261011.json';
 const currentChecks=report.checks.map(({id,status,executed,exitCode,tests})=>({id,status,executed,exitCode,...(tests?{tests}:{})}));
 return {schemaVersion:1,kind:'software-factory-current-main-readonly-failure-diagnosis',createdAt:new Date().toISOString(),projectId:project,taskId:run.taskId,runId:run.id,attempt:host.attempt,source:{role:'current-main',...host.source},
  scope:{readOnly:true,sourceModified:false,modelsInvoked:false,rawLogsExported:false,finalReportReviewed:true,objectivesAccepted:false},
  observation:{runStatus:run.status,reportStatus:report.status,reportSHA256:validation.autonomyReportSha256,currentChecks,failedTestFiles:host.failedTestFiles,errorCodes:host.errorCodes,wholeProductAccepted:false},
  evidence:[...host.sources,{privateRunRelativePath:'detailed-report.json',sha256:host.detailSHA},{privateRunRelativePath:'evidence/apps-server-tests.json',sha256:host.testSHA},{path:prior,sha256:sha(await readFile(prior)),role:'prior same-source diagnosis, not substituted for current report'}],
  repairScope:['按当前签名报告的真实失败检查定点修复，主线源码不动。','核对sandbox固定镜像与批准隔离环境契约，保留网络、只读、超时和配额断言。','核对MinIO实际SDK路径编码和签名对象，不凭修断言宣称实际下载通过。','只有真实可追溯资产存在时恢复历史fixture；缺失及超时继续记录，不虚构历史页面。',...(report.checks.some(c=>c.id==='snapshot-source-consistency'&&c.status==='fail')?['prototype-commands测试生成候选HTML触发源码一致性失败；将测试生成物迁到独立临时fixture并清理，不扩大源码忽略规则。']:[])],
  productAccepted:false};
});
const output=dir+'/main-failures-readonly-diagnosis-r26-4-20261012.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,runId:result.runId,attempt:result.attempt,reportStatus:result.observation.reportStatus,sourceFiles:result.evidence.filter(e=>e.publicSourcePath).length,productAccepted:false}));
