/** Read-only, independent reconciliation of the completed r2 audit with the live platform. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {withPlatform,remote,lanProfile,python} from './managed-server-client.mjs';
import {queueState,nodeState} from './run-factory-supervision-probe.mjs';

const base='artifacts/software-factory/full-test';
const source='25ae0ce3523832bedac7d0838d0061f6a57a5af4a112f2d25e8551a980f4f4bf';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4';
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const same=(a,b)=>canonical(a)===canonical(b);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function json(path){const bytes=await readFile(path);return {value:JSON.parse(bytes.toString('utf8')),sha256:sha(bytes),path};}
const fullFile=await json(base+'/full-validation-r2-retry1.json'),full=fullFile.value;
const runId=full.intents?.start?.runId;
if(!/^[a-f0-9]{40}$/.test(runId??'')||full.auditVerified!==true||!full.completedAt||full.restoration?.verified!==true)throw Error('COMPLETED_RESTORED_R2_AUDIT_REQUIRED');
const reportFile=await json(base+'/report-'+runId+'.json'),report=reportFile.value;
const baseline=(await json(base+'/report-216cb095e33d438ad85d266baa72654e5ef283e3.json')).value;
const checks={};
function check(name,passed){checks[name]=passed===true;}
check('reportMatchesDriver',same(report,full.evidence?.report));
check('immutableSource',report.sourceBefore===source&&report.sourceAfter===source&&report.sourceUnchanged===true);
check('auditNotProductAcceptance',report.collectorCompleted===true&&report.productVerdict==='NO-GO'&&full.automaticAcceptance===false);
check('explicitIsolation', ['privateEnvCopied','modelsInvoked','productionDatabaseUsed','businessContainersTouched','sourceCodeChanged'].every(k=>report[k]===false));
check('ownedResourcesCleaned',report.cleanup?.complete===true&&full.evidence?.privateContainersRemaining?.length===0);
check('allFilesAccountedFor',report.tests?.allTestFilesAccountedFor===true);
const packages=report.tests?.testResults??[];
const filePaths=packages.flatMap(p=>p.files.map(f=>f.path)).sort();
const expectedFiles=baseline.tests.testResults.flatMap(p=>p.files.map(f=>f.path)).sort();
check('sameCurrentBusinessTestInventory',filePaths.length===44&&new Set(filePaths).size===44&&same(filePaths,expectedFiles));
const counts=packages.map(p=>({package:p.package,files:p.files.length,total:p.total,passed:p.passed,failed:p.failed,skipped:p.pending}));
check('countsReconcile',packages.length===2&&packages.every(p=>{
 const fields=['total','passed','failed','pending'];
 return fields.every(k=>Number.isSafeInteger(p[k])&&p[k]>=0)&&p.total===p.passed+p.failed+p.pending&&p.files.every(f=>f.tests===f.passed+f.failed+f.skipped)&&p.files.reduce((n,f)=>n+f.tests,0)===p.total&&p.files.reduce((n,f)=>n+f.passed,0)===p.passed&&p.files.reduce((n,f)=>n+f.failed,0)===p.failed&&p.files.reduce((n,f)=>n+f.skipped,0)===p.pending;
}));
const totals=counts.reduce((a,p)=>({total:a.total+p.total,passed:a.passed+p.passed,failed:a.failed+p.failed,skipped:a.skipped+p.skipped}),{total:0,passed:0,failed:0,skipped:0});
const stages=report.stageSummary??[],browser=report.tests?.browserSuites??[];
check('allStagesReported',stages.length===40&&new Set(stages.map(s=>s.name)).size===40);
check('allLegacySuitesAttempted',browser.length===30&&browser.every(s=>s.attempted===true)&&browser.every(s=>stages.some(p=>p.name===s.stage&&p.ok===s.ok)));
check('engineeringStagesPass',['offline-install','build','typecheck','lint','dependency-boundaries','document-codes'].every(n=>stages.find(s=>s.name===n)?.ok===true));
const riskFile=await json(base+'/truthfulness-'+runId+'.json'),storageFile=await json(base+'/storage-signing-'+runId+'.json'),sandboxFile=await json(base+'/sandbox-functional-'+runId+'.json');
check('riskEvidenceMatches',same(riskFile.value,report.tests?.truthfulnessProbe)&&riskFile.value.runId===runId&&riskFile.value.checks?.length===7&&riskFile.value.errors?.length===0);
check('storageEvidenceMatches',same(storageFile.value,report.tests?.storageSigning));
check('sandboxEvidenceMatches',same(sandboxFile.value,report.tests?.sandboxFunctional));
const snapshot=await withPlatform(async({api})=>{
 const [runReply,taskReply,capsReply,configReply]=await Promise.all(['/api/v1/execution/runs/'+runId,'/api/v1/tasks/'+full.taskId,'/api/v1/execution/capabilities','/api/v1/execution/config'].map(p=>api(p)));
 const run=runReply.data,task=taskReply.data,usage=run.result?.usage;
 check('liveSignedIdentity',run.id===runId&&run.agentId===full.nodeAgentId&&run.taskId===full.taskId&&run.projectId===projectId&&run.machineId===full.scope.machineId&&run.executorId===full.scope.templateId&&run.workspace===full.scope.workspace&&run.result?.source==='signed-agent');
 check('liveCompletedOneRound',run.status==='succeeded'&&run.result?.outcome==='success'&&run.result?.rounds===1&&run.result?.exitCode===0&&run.result?.validation?.exitCode===0);
 check('fixedToolUsageReportedZero',!!usage&&['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','totalTokens','costUSD'].every(k=>usage[k]===0)&&usage.usageComplete===true&&usage.provider==='fixed-test'&&usage.model==='no-model');
 check('liveTaskStillAwaitingAcceptance',task.status==='validating'&&task.ownerId==='server-admin'&&task.scope==='personal'&&task.executionRequest?.id===runId);
 const queue=queueState(),node=nodeState();
 check('liveGlobalPolicyAndQueue',capsReply.data.supervised===false&&queue.allActive===0&&queue.fullTable===true);
 check('liveTemplatesRestored',same(configReply.data.templates.find(t=>t.id===full.scope.templateId),full.originalTemplate)&&same(node.template,full.originalTemplate)&&node.agentId===full.nodeAgentId&&node.unit.ActiveState==='active'&&node.unit.SubState==='running');
 const resources=JSON.parse(remote(lanProfile,'jarvis-101',python({runId},String.raw`import subprocess
def remaining(kind):
 r=subprocess.run(['/usr/bin/docker',kind,'ls',*(['-a'] if kind=='container' else []),'--filter','label=jarvis.validation.runId='+p['runId'],'--format','{{.ID}}'],capture_output=True,text=True,timeout=15)
 if r.returncode:raise RuntimeError('RESOURCE_RECONCILIATION_FAILED')
 return len(r.stdout.splitlines())
print(json.dumps({'containers':remaining('container'),'networks':remaining('network'),'readOnly':True}))
`),true));
 check('liveOwnedResourcesAbsent',resources.containers===0&&resources.networks===0);
 return {at:new Date().toISOString(),runId,taskId:task.id,runStatus:run.status,taskStatus:task.status,nodeAgentId:node.agentId,globalSupervision:capsReply.data.supervised,activeRequests:queue.allActive,resources};
});
const result={formatVersion:1,at:new Date().toISOString(),reviewer:'root-independent-read-only',runId,taskId:full.taskId,sourceSha256:source,reviewPassed:Object.values(checks).every(v=>v),productVerdict:report.productVerdict,checks,counts,totals,
 browser:{scope:'legacy prototypes; does not accept current React web application',attempted:browser.filter(s=>s.attempted).length,passed:browser.filter(s=>s.ok).length,failedOrBlocked:browser.filter(s=>!s.ok).length,timeouts:stages.filter(s=>s.name.startsWith('prototype-')&&s.timeout).map(s=>s.name)},
 truthfulness:{checks:riskFile.value.checks.length,unsafe:riskFile.value.checks.filter(c=>!c.passed).length,correctlyRejected:riskFile.value.checks.filter(c=>c.passed).length,productSafe:riskFile.value.productSafe},
 storage:storageFile.value,sandbox:sandboxFile.value,snapshot,evidence:[fullFile,reportFile,riskFile,storageFile,sandboxFile].map(({path,sha256})=>({path,sha256})),
 boundaries:['No models invoked by this review.','No business source, database, execution configuration or acceptance changed.','Signed completion verifies audit execution; product remains NO-GO.','Supplemental runs are independent and must not be combined with these package counts.','The actual software-factory runtime provider remains unproven.']};
await writeFile(base+'/result-independent-review-r2.json',JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({reviewPassed:result.reviewPassed,runId,totals,browser:result.browser,productVerdict:result.productVerdict}));
if(!result.reviewPassed)process.exitCode=1;
