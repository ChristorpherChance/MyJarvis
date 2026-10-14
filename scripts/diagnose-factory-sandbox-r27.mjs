/** Exact R27 attempt diagnosis; no product code, Docker mutation or model is executed. */
import {readFile,open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {sha} from './run-factory-main-repair-r26.mjs';
import {fixedToolSHA} from './prepare-factory-repair-verifier-r26.mjs';
import {hostReadParams,assertHostObservation} from './factory-verifier-host-r27.mjs';
import {assertR27FreshHost} from './run-factory-acceptance-r27.mjs';
import {settleEvidenceReads} from './factory-repair-evidence-read-r26.mjs';
import {withR27EvidencePlatform,loadR27EvidenceContext,readR27BoundExecution,observeR27Platform,ensureR27EvidenceUnchanged,r27EvidenceHostProgram,need,safeR27EvidenceFailure} from './factory-evidence-read-r27.mjs';
const scope=Object.freeze({runId:'44cfcd018b8e12c78928b9bb1a5eabd4fb93705a',attempt:'52b825d227a04303a48404260a5f8f4a',taskId:'5b0b27b2-43ad-4153-bff4-63cb4387e024',fingerprint:'9b07a5115c22d14f82e04ba45b66efbc5ac04f7faa696ab84d81e33696ec7b76',files:608,image:'sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc'});
const relative='apps/server/src/modules/executor/sandbox.integration.test.ts',serviceRelative='apps/server/src/modules/executor/sandbox.service.ts';
export function sandboxDiagnosisProgram(){
 let program=r27EvidenceHostProgram();const anchor="second=state();need(first==second";need(program.split(anchor).length===2,'R27_EVIDENCE_DIAG_ANCHOR_CHANGED');
 const body=String.raw`
need(p['runId']==p['diagnosticScope']['runId'] and p['attempt']==p['diagnosticScope']['attempt'] and p['candidateFingerprint']==p['diagnosticScope']['fingerprint'] and p['candidateFiles']==608,'R27_EVIDENCE_DIAG_SCOPE_CHANGED')
q=run_root/p['attempt']/'evidence'/'apps-server-tests.json';raw=private_read(q,16*1024*1024);v=json.loads(raw);digest=hashlib.sha256(raw).hexdigest()
need(any(t['file']=='apps-server-tests.json' and t['sha256']==digest for t in attempts[0]['testGroups']),'R27_EVIDENCE_DIAG_TEST_RECEIPT_CHANGED')
need(type(v.get('numTotalTests')) is int and type(v.get('numPassedTests')) is int and type(v.get('numFailedTests')) is int,'R27_EVIDENCE_DIAG_COUNTS_INVALID')
rows=[]
for file in v.get('testResults',[]):
 path=file.get('name','');failed=[a for a in file.get('assertionResults',[]) if a.get('status')=='failed']
 if not failed:continue
 need(isinstance(path,str) and path.endswith('/'+p['diagnosticSource']),'R27_EVIDENCE_DIAG_UNEXPECTED_FAILED_FILE')
 for a in failed:
  title=a.get('title');need(title in p['diagnosticTitles'],'R27_EVIDENCE_DIAG_UNEXPECTED_FAILED_TITLE')
  messages=a.get('failureMessages',[]);need(isinstance(messages,list) and all(isinstance(m,str) and len(m)<=262144 for m in messages),'R27_EVIDENCE_DIAG_FAILURE_BOUND_INVALID')
  text='\n'.join(messages);packed=json.dumps(a,ensure_ascii=False);need(len(packed)<=2097152,'R27_EVIDENCE_DIAG_ASSERTION_BOUND_INVALID');codes=sorted(c for c in p['diagnosticCodes'] if re.search(r'(?<![A-Z0-9_])'+re.escape(c)+r'(?![A-Z0-9_])',packed));http=sorted(set(int(n) for n in re.findall(r'(?:HTTP code\s+|statusCode[\x22\x27]?\s*[:=]\s*)([1-5][0-9]{2})',packed)))
  frames=[]
  for public in [p['diagnosticSource'],p['diagnosticService']]:
   for line,column in re.findall(re.escape(public)+r':([1-9][0-9]{0,5}):([1-9][0-9]{0,5})',text):frames.append({'path':public,'line':int(line),'column':int(column)})
  rows.append({'title':title,'codes':codes,'expectedCode':('EXECUTION_TIMEOUT' if title.startswith('超时') else 'SANDBOX_QUOTA_EXCEEDED' if title.startswith('并发') else None),'httpStatusCodes':http,'publicSourceFrames':frames,'imageSHA256Values':sorted(set(re.findall(r'sha256:[a-f0-9]{64}',packed))),'classificationFlags':{'imagePinMismatch':bool(re.search('镜像 digest 与清单锚定不一致',packed)),'imageNotLocalized':bool(re.search('镜像未本地化',packed)),'expectedRejectedButResolved':bool(re.search(r'promise resolved.*rejects|resolved.*instead of rejecting',packed,re.I)),'connectionRefused':bool(re.search(r'ECONNREFUSED',packed)),'assertionExpectedTimeoutOrQuota':title.startswith('超时') or title.startswith('并发')},'assertionJSONSHA256':hashlib.sha256(packed.encode()).hexdigest(),'failureMessagesSHA256':hashlib.sha256(text.encode()).hexdigest(),'rawFailureMessagesExported':False})
need(len(rows)==5 and v['numFailedTests']==5,'R27_EVIDENCE_DIAG_FIVE_FAILURES_REQUIRED')
resource=hashlib.sha256((p['runId']+p['attempt']).encode()).hexdigest()[:40];broker_root=Path('/var/lib/jarvis-development/101/full-validation')/resource/'sandbox-broker'
control,control_sha=optional_json(broker_root/'control.json');registry,registry_sha=optional_json(broker_root/'registry.json')
need(control is not None and registry is not None and control.get('runId')==resource and registry.get('runId')==resource and control.get('sourceFingerprint')==p['candidateFingerprint'] and registry.get('sourceFingerprint')==p['candidateFingerprint'],'R27_EVIDENCE_DIAG_BROKER_BINDING_CHANGED')
image_id=control.get('realImageId');need(isinstance(image_id,str) and re.fullmatch('sha256:[a-f0-9]{64}',image_id),'R27_EVIDENCE_DIAG_IMAGE_INVALID')
repodigests=control.get('realRepoDigests');need(isinstance(repodigests,list) and all(isinstance(x,str) and re.fullmatch(r'[A-Za-z0-9./:_-]+@sha256:[a-f0-9]{64}',x) for x in repodigests),'R27_EVIDENCE_DIAG_IMAGE_INVALID')
counts={k:registry.get(k) for k in ['creates','requestCount']};need(all(type(n) is int and 0<=n<=100000 for n in counts.values()),'R27_EVIDENCE_DIAG_BROKER_COUNTS_INVALID')
need(hashlib.sha256(private_read(q,16*1024*1024)).hexdigest()==digest,'R27_EVIDENCE_DIAG_TEST_CHANGED_DURING_READ')
sandbox_diagnosis={'serverPackageCounts':{'total':v['numTotalTests'],'passed':v['numPassedTests'],'failed':v['numFailedTests'],'pending':v.get('numPendingTests')},'testReceiptSHA256':digest,'sourcePath':p['diagnosticSource'],'sourceSHA256':p['diagnosticSourceSHA256'],'servicePath':p['diagnosticService'],'serviceSHA256':p['diagnosticServiceSHA256'],'failedCases':rows,'broker':{'controlSHA256':control_sha,'registrySHA256':registry_sha,'imageId':image_id,'repoDigestHashes':[x.split('@')[1] for x in repodigests],'counts':counts,'toolSHA256':second['fixedTools']['factory-sandbox-broker.py'] if 'second' in globals() else first['fixedTools']['factory-sandbox-broker.py']},'rawLogsExported':False,'privateEnvironmentExported':False}
`;
 program=program.replace(anchor,body+'\n'+anchor);const output="'productCodeExecuted':False,";need(program.split(output).length===2,'R27_EVIDENCE_DIAG_OUTPUT_CHANGED');return program.replace(output,output+"'sandboxFailureDiagnosis':sandbox_diagnosis,");
}
export async function diagnoseSandboxR27(d){
 const options={'run-id':scope.runId,attempt:scope.attempt},context=await loadR27EvidenceContext(options,d);need(context.j.taskId===scope.taskId&&context.j.candidateBefore.sha256===scope.fingerprint&&context.j.candidateBefore.files===scope.files,'R27_EVIDENCE_DIAG_PRIVATE_SCOPE_CHANGED');
 const [snapshot,platform,testRaw,serviceRaw,brokerRaw]=await settleEvidenceReads([()=>readR27BoundExecution(context,d),()=>observeR27Platform(context,d),()=>readFile('.jarvis-dev/workspaces/msf-repair-r27/source/'+relative,'utf8'),()=>readFile('.jarvis-dev/workspaces/msf-repair-r27/source/'+serviceRelative,'utf8'),()=>readFile('scripts/factory-sandbox-broker.py','utf8')]);need(sha(brokerRaw)===fixedToolSHA['factory-sandbox-broker.py'],'R27_EVIDENCE_DIAG_LOCAL_BROKER_CHANGED');
 const titles=[...testRaw.matchAll(/it(?:\.skip)?\('([^']+)'/g)].map(m=>m[1]),codes=[...new Set([...brokerRaw.matchAll(/Denied\('([A-Z][A-Z0-9_]+)'/g)].map(m=>m[1]).concat(['SANDBOX_SPEC_INVALID','SANDBOX_QUOTA_EXCEEDED','EXECUTION_TIMEOUT','ECONNREFUSED','ENOENT','EACCES']))];
 const p={...hostReadParams(context.installed.preparation,{expectedTargetTemplateSHA256:platform.targetSHA256,expectedOtherNodeTemplatesSHA256:context.j.otherNodeTemplatesSHA256,requireInstalled:true,runId:scope.runId,attempt:scope.attempt,idle:false}),diagnosticScope:scope,diagnosticSource:relative,diagnosticService:serviceRelative,diagnosticSourceSHA256:sha(testRaw),diagnosticServiceSHA256:sha(serviceRaw),diagnosticTitles:titles,diagnosticCodes:codes};
 const host=await d.readRoot(p,sandboxDiagnosisProgram());assertHostObservation(host,context.installed.preparation,{expectedTargetTemplateSHA256:platform.targetSHA256,expectedOtherNodeTemplatesSHA256:context.j.otherNodeTemplatesSHA256,expectedMain:context.j.mainBefore,expectedOldCandidate:context.installed.rootReadback.oldCandidate,expectedOldImmutable:context.installed.rootReadback.oldImmutable,requireInstalled:true});assertR27FreshHost(host,context.j,context.installed);await ensureR27EvidenceUnchanged(context,snapshot,platform,d);
 return {schemaVersion:1,kind:'software-factory-r27-sandbox-failure-bounded-diagnosis',observedAt:new Date().toISOString(),...scope,status:snapshot.run.status,partial:!snapshot.terminal,signedTerminal:snapshot.terminal&&snapshot.signed,diagnosis:host.sandboxFailureDiagnosis,sourceAndOldToolsUnchanged:true,readOnly:true,modelsInvoked:false,productCodeExecuted:false,signalsSent:false,resourcesRemoved:false,rawLogsExported:false,privateEnvironmentExported:false,productAccepted:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){let result;try{need(process.argv.length===2,'R27_EVIDENCE_DIAG_FIXED_ARGUMENTS_ONLY');result=await withR27EvidencePlatform(diagnoseSandboxR27);}catch(e){result=safeR27EvidenceFailure(e,'software-factory-r27-sandbox-failure-bounded-diagnosis');process.exitCode=1;}const path='artifacts/software-factory/acceptance-r27/sandbox-failure-diagnosis-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(result,null,2)+'\n',f=await open(path,'wx',0o644);try{await f.writeFile(raw);await f.sync();}finally{await f.close();}console.log(JSON.stringify({path,sha256:sha(raw),...result}));}
