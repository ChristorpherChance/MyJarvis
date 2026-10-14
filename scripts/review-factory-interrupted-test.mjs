/** Independently reconcile an interrupted audit; never promote late evidence to signed success. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {withPlatform,remote,lanProfile,python} from './managed-server-client.mjs';
import {queueState,nodeState} from './run-factory-supervision-probe.mjs';
const base='artifacts/software-factory/full-test',runId='c7371ba5ca53fa324aaafdf7ce78ad20e109fa38';
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const same=(a,b)=>canonical(a)===canonical(b);
async function json(name){const path=base+'/'+name,bytes=await readFile(path);return {path,sha256:createHash('sha256').update(bytes).digest('hex'),value:JSON.parse(bytes.toString('utf8'))};}
const files=await Promise.all(['full-validation-r2-retry1.json','report-'+runId+'.json','cancellation-terminal-evidence-r2-retry1.json','cancellation-resource-observation-r2-retry1.json','source-change-and-node-errors-r2-retry1.json'].map(json));
const [driver,report,late,resources,sourceChange]=files.map(f=>f.value),checks={};
const check=(name,value)=>checks[name]=value===true;
if(driver.intents?.start?.runId!==runId||driver.scope.projectId!=='70ec346f-6520-46ed-abed-22cac770a3e4'||!driver.finishedAt)throw Error('INTERRUPTED_RUN_IDENTITY_REQUIRED');
check('cancelledNotPromotedToAuditSuccess',driver.auditVerified===false&&!driver.completedAt&&driver.signedRun.status==='cancelled'&&driver.signedRun.result.source==='signed-agent'&&driver.signedRun.result.exitCode===143);
check('unknownUsagePreserved',driver.signedRun.result.usage===null&&driver.signedRun.result.validation===null&&late.terminalNativeUsage===null&&late.nativeIndependentValidatorRun===false);
check('lateReportBoundary',late.runId===runId&&late.lateReport===true&&late.publicCopyMatches===true&&report.runId===runId&&report.collectorCompleted===false&&late.collectorCompleted===false&&late.completedStages===report.stageSummary.length&&late.plannedStages===40);
check('sourceChangePreserved',report.sourceBefore!==report.sourceAfter&&report.sourceUnchanged===false&&late.sourceBefore===report.sourceBefore&&late.sourceAfter===report.sourceAfter);
check('explicitIsolation',['privateEnvCopied','modelsInvoked','productionDatabaseUsed','businessContainersTouched','sourceCodeChanged'].every(k=>report[k]===false));
check('cleanupAndRestoreRecorded',report.cleanup.complete===true&&resources.runId===runId&&resources.privateContainersRemaining.length===0&&resources.privateNetworksRemaining.length===0&&resources.fixedOwnedProcessesRemaining.length===0&&driver.restoration.verified===true);
const packages=report.tests.testResults;
const counts=packages.map(p=>({package:p.package,files:p.files.length,total:p.total,passed:p.passed,failed:p.failed,skipped:p.pending}));
check('actualPackageCountsReconcile',packages.every(p=>p.total===p.passed+p.failed+p.pending&&p.files.every(f=>f.tests===f.passed+f.failed+f.skipped)&&p.files.reduce((n,f)=>n+f.tests,0)===p.total&&p.files.reduce((n,f)=>n+f.passed,0)===p.passed&&p.files.reduce((n,f)=>n+f.failed,0)===p.failed&&p.files.reduce((n,f)=>n+f.skipped,0)===p.pending));
check('frozenSnapshotInventoryAccountedFor',report.tests.allTestFilesAccountedFor===true&&packages.flatMap(p=>p.files).length===44&&new Set(packages.flatMap(p=>p.files.map(f=>f.path))).size===44);
check('missingMandatoryProbesRemainUnexecuted',report.tests.truthfulnessProbe===null&&report.tests.storageSigning===null&&report.tests.sandboxFunctional===null&&late.notRunMandatoryStages.includes('truthfulness-probe')&&late.notRunMandatoryStages.includes('storage-signing-probe'));
const totals=counts.reduce((a,p)=>({total:a.total+p.total,passed:a.passed+p.passed,failed:a.failed+p.failed,skipped:a.skipped+p.skipped}),{total:0,passed:0,failed:0,skipped:0});
const stages=report.stageSummary.filter(s=>s.name.startsWith('prototype-'));
const live=await withPlatform(async({api})=>{
 const [r,t,cfg,caps]=await Promise.all(['/api/v1/execution/runs/'+runId,'/api/v1/tasks/'+driver.taskId,'/api/v1/execution/config','/api/v1/execution/capabilities'].map(p=>api(p)));
 check('liveSignedInterruption',r.data.id===runId&&r.data.agentId===driver.nodeAgentId&&r.data.taskId===driver.taskId&&r.data.status==='cancelled'&&r.data.result.source==='signed-agent'&&r.data.result.usage===null&&r.data.result.validation===null);
 check('liveNoAcceptance',t.data.id===driver.taskId&&t.data.ownerId==='server-admin'&&t.data.scope==='personal'&&['cancelled','paused','failed'].includes(t.data.status));
 const queue=queueState(),node=nodeState();
 check('liveRestoredAndNoQueue',queue.allActive===0&&queue.fullTable===true&&caps.data.supervised===false&&same(cfg.data.templates.find(t=>t.id===driver.scope.templateId),driver.originalTemplate)&&same(node.template,driver.originalTemplate)&&node.agentId===driver.nodeAgentId&&node.unit.ActiveState==='active'&&node.unit.SubState==='running');
 const owned=JSON.parse(remote(lanProfile,'jarvis-101',python({runId},String.raw`import subprocess
def count(kind):
 r=subprocess.run(['/usr/bin/docker',kind,'ls',*(['-a'] if kind=='container' else []),'--filter','label=jarvis.validation.runId='+p['runId'],'--format','{{.ID}}'],capture_output=True,text=True,timeout=15)
 if r.returncode:raise RuntimeError('RESOURCE_RECONCILIATION_FAILED')
 return len(r.stdout.splitlines())
print(json.dumps({'containers':count('container'),'networks':count('network'),'readOnly':True}))
`),true));
 check('liveNoOwnedResources',owned.containers===0&&owned.networks===0);
 return {at:new Date().toISOString(),runId,taskId:driver.taskId,runStatus:r.data.status,taskStatus:t.data.status,timeoutSec:r.data.timeoutSec,activeRequests:queue.allActive,globalSupervision:caps.data.supervised,nodeAgentId:node.agentId,owned};
});
const result={formatVersion:1,at:new Date().toISOString(),reviewer:'root-independent-read-only',runId,taskId:driver.taskId,interruptionEvidenceVerified:Object.values(checks).every(v=>v),fullAuditVerified:false,currentSourceAccepted:false,productVerdict:'NO-GO',checks,counts,totals,
 browser:{plannedSuites:30,completedStages:stages.length,completedPassed:stages.filter(s=>s.ok).length,completedFailedOrBlocked:stages.filter(s=>!s.ok).length,timedOut:stages.filter(s=>s.timeout).map(s=>s.name),structuredSuiteRows:report.tests.browserSuites.length,scope:'Interrupted legacy prototype run; remaining suites and current React application not accepted.'},
 mandatoryProbes:{truthfulness:'not-run',storageSigning:'not-run',sandboxFunctional:'fixture-failed'},sourceBefore:report.sourceBefore,sourceAfter:report.sourceAfter,sourceChangeReport:files[4].path,cancellationCause:'unknown',lateReportOriginalSha256:late.reportSHA256,live,
 evidence:files.map(({path,sha256})=>({path,sha256})),boundaries:['Partial package results belong only to the frozen 25ae snapshot.','A late root report is not a signed success or a completed independent validator.','Unreported usage remains unknown.','First completed audit remains separate.','No business source, configuration, task state or model changed by this review.']};
await writeFile(base+'/result-independent-review-r2-interrupted.json',JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({interruptionEvidenceVerified:result.interruptionEvidenceVerified,fullAuditVerified:false,totals,browser:result.browser,live}));
if(!result.interruptionEvidenceVerified)process.exitCode=1;
