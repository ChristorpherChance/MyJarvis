/** Independent bounded readback, no test rerun and no raw logs export. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform,remote,lanProfile,python} from './managed-server-client.mjs';
const batchKey=process.argv.find(v=>v.startsWith('--batch-key='))?.slice('--batch-key='.length)??'';
if(batchKey&&!/^[a-z][a-z0-9-]{0,63}$/.test(batchKey))throw Error('MAIN_ACCEPTANCE_BATCH_KEY_INVALID');
const suffix=batchKey?'-'+batchKey:'';
const journal=JSON.parse(await readFile('.jarvis-dev/maintenance/factory-main-baseline-r24'+suffix+'.json','utf8'));
if((journal.batchKey??'')!==batchKey)throw Error('MAIN_ACCEPTANCE_BATCH_SCOPE_MISMATCH');
const result=await withPlatform(async({api})=>{
 const run=(await api('/api/v1/execution/runs/'+journal.runId)).data;
 if(run.projectId!==journal.projectId||run.taskId!==journal.taskId||run.workspace!==journal.source||run.agentId!==journal.nodeAgentId||run.result?.source!=='signed-agent'||['running','queued'].includes(run.status))throw Error('MAIN_ACCEPTANCE_TERMINAL_BINDING_INVALID');
 const observed=JSON.parse(remote(lanProfile,'jarvis-101',python({runId:run.id,source:journal.source,expectedSource:journal.sourceObservation.sourceFingerprint,inspectionId:randomUUID()},String.raw`import json,re,subprocess,hashlib,datetime,stat
from pathlib import Path
root=Path('/var/lib/jarvis-development/101/validation')/p['runId']
latest=json.loads((root/'latest.json').read_bytes());attempt=latest.get('attempt','')
if not re.fullmatch('attempt-[0-9a-f]{32}',attempt):raise RuntimeError('MAIN_ACCEPTANCE_ATTEMPT_INVALID')
work=root/attempt
def read(name):
 q=work/name;s=q.lstat()
 if not stat.S_ISREG(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_nlink!=1 or s.st_uid!=1000 or s.st_size>2000000:raise RuntimeError('MAIN_ACCEPTANCE_REPORT_UNSAFE')
 return q.read_bytes()
raw=read('report.json');report=json.loads(raw);copyRaw=read('copy.json');copy=json.loads(copyRaw)
if report.get('runId')!=p['runId'] or report.get('source')!=p['source'] or report.get('privateEnvCopied') is not False or report.get('sourceFingerprint')!=copy.get('sha256') or copy.get('verificationSha256')!=copy.get('sha256') or copy.get('sourceStateChanged') is not False:raise RuntimeError('MAIN_ACCEPTANCE_REPORT_BINDING_INVALID')
r=subprocess.run(['/usr/local/libexec/jarvis-msf-validation',p['source'],p['inspectionId'],'--inspect-state'],capture_output=True,text=True,timeout=90)
if r.returncode!=0:raise RuntimeError('MAIN_ACCEPTANCE_SOURCE_READBACK_FAILED')
after=json.loads(r.stdout);stable=after.get('ok') and after.get('sourceFingerprint')==copy.get('sha256') and not after.get('sourceStateChanged')
logs=[];diagnostics=[]
for item in report['stages']:
 if item['name']=='safe-unit-tests':
  # unitStage executes in-process; the fixed reporter writes unit-report.json,
  # not a stage() log. Never invent a missing log or rerun the product tests.
  if (work/'safe-unit-tests.log').exists():raise RuntimeError('MAIN_ACCEPTANCE_UNEXPECTED_UNIT_STAGE_LOG')
  continue
 rawLog=read(item['name']+'.log');text=re.sub(r'\x1b\[[0-9;]*[a-zA-Z]','',rawLog.decode(errors='replace'))
 logs.append({'stage':item['name'],'sha256':hashlib.sha256(rawLog).hexdigest(),'bytes':len(rawLog)})
 for m in re.finditer(r'(src/[^:\r\n]+\.(?:ts|tsx)):(\d+):(\d+)\s*-\s*error\s+(TS\d+):\s*([^\r\n]+)',text):
  message=m.group(5)
  if 'template_refresh.start' in message or 'template_refresh.stop' in message:
   diagnostics.append({'path':m.group(1),'line':int(m.group(2)),'column':int(m.group(3)),'code':m.group(4),'message':'新增模板刷新命令尚未被命令类型定义承接','command':'template_refresh.start' if 'template_refresh.start' in message else 'template_refresh.stop'})
unit=(work/'unit-report.json');tests=None;unit_metadata=None
if unit.exists():
 unit_raw=read('unit-report.json');v=json.loads(unit_raw);tests={k:v.get(k) for k in ['numTotalTests','numPassedTests','numFailedTests','numPendingTests']}
 expected_files=['src/doc-numbering.test.ts','src/error-codes.test.ts','src/fingerprint.test.ts'];prefix=str(work/'source'/'packages'/'shared')+'/'
 reported=v.get('testResults',[])
 if not isinstance(reported,list) or sorted(row.get('name','') for row in reported)!=[prefix+name for name in expected_files]:raise RuntimeError('MAIN_ACCEPTANCE_UNIT_FILES_NOT_BOUND')
 unit_metadata={'sha256':hashlib.sha256(unit_raw).hexdigest(),'bytes':len(unit_raw),'inProcessStage':True,'files':[{'path':name,'status':next(row['status'] for row in reported if row['name']==prefix+name)} for name in expected_files],'success':v.get('success'),'failedSuites':v.get('numFailedTestSuites'),'pendingSuites':v.get('numPendingTestSuites')}
 if report.get('ok') is True and (v.get('success') is not True or any(type(tests[k]) is not int for k in tests) or tests['numTotalTests']<=0 or tests['numPassedTests']!=tests['numTotalTests'] or tests['numFailedTests']!=0 or tests['numPendingTests']!=0 or v.get('numFailedTestSuites')!=0 or v.get('numPendingTestSuites')!=0 or any(row.get('status')!='passed' for row in reported)):raise RuntimeError('MAIN_ACCEPTANCE_SUCCESS_WITHOUT_COMPLETE_UNIT_EVIDENCE')
elif any(item['name']=='safe-unit-tests' for item in report['stages']):raise RuntimeError('MAIN_ACCEPTANCE_UNIT_STAGE_WITHOUT_REPORT')
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runId':p['runId'],'reportSHA256':hashlib.sha256(raw).hexdigest(),'copySHA256':hashlib.sha256(copyRaw).hexdigest(),'sourceFingerprint':copy['sha256'],'sourceFingerprintObservedBefore':p['expectedSource'],'sourceChangedBetweenObservationAndSnapshot':copy['sha256']!=p['expectedSource'],'sourceFiles':copy['files'],'sourceStableBeforeDuringAndAfter':bool(stable),'sourceAfterFingerprint':after.get('sourceFingerprint'),'report':report,'actualTests':tests,'unitReportMetadata':unit_metadata,'executedStages':[s['name'] for s in report['stages']],'notRun':[x for x in ['offline-install','build','typecheck','safe-unit-tests'] if not any(s['name']==x for s in report['stages'])],'logMetadata':logs,'buildDiagnostics':diagnostics,'rawLogsExported':False,'modelsInvoked':False,'sourceCodeChangedByInspection':False,'productAccepted':False}))
`),true,{timeoutMs:120000}));
 return {...observed,batchKey,projectId:journal.projectId,taskId:journal.taskId,signedRunStatus:run.status,usage:run.result.usage??null,usageUnknown:!run.result.usage,scope:'current-main limited offline baseline; executed stages and notRun specify actual coverage',restored:journal.restored===true,independentlyAcceptedObjectives:0,modelCalled:false,terminalIndependentReadback:true};
});
const output='artifacts/software-factory/acceptance-r24/main-baseline-independent-review'+suffix+'.json';
await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,sourceStable:result.sourceStableBeforeDuringAndAfter,reportSHA256:result.reportSHA256,buildDiagnostics:result.buildDiagnostics,notRun:result.notRun,usageUnknown:result.usageUnknown,restored:result.restored,objectivesAccepted:0}));
