/** Bounded, exact-attempt log classification. No HTTP product probe or mutation. */
import {readFile,open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sha} from './run-factory-main-repair-r26.mjs';
import {hostReadParams,assertHostObservation} from './factory-verifier-host-r27.mjs';
import {assertR27FreshHost} from './run-factory-acceptance-r27.mjs';
import {settleEvidenceReads} from './factory-repair-evidence-read-r26.mjs';
import {withR27EvidencePlatform,loadR27EvidenceContext,readR27BoundExecution,observeR27Platform,ensureR27EvidenceUnchanged,r27EvidenceHostProgram,publicR27Terminal,need,safeR27EvidenceFailure} from './factory-evidence-read-r27.mjs';
const scope=Object.freeze({runId:'44cfcd018b8e12c78928b9bb1a5eabd4fb93705a',attempt:'52b825d227a04303a48404260a5f8f4a',taskId:'5b0b27b2-43ad-4153-bff4-63cb4387e024',fingerprint:'9b07a5115c22d14f82e04ba45b66efbc5ac04f7faa696ab84d81e33696ec7b76',files:608});
export function authContractDiagnosisProgram(){
 let program=r27EvidenceHostProgram();const anchor='second=state();need(first==second';need(program.split(anchor).length===2,'R27_EVIDENCE_AUTH_DIAG_ANCHOR_CHANGED');
 const body=String.raw`
need(p['runId']==p['diagnosticScope']['runId'] and p['attempt']==p['diagnosticScope']['attempt'] and p['candidateFingerprint']==p['diagnosticScope']['fingerprint'] and p['candidateFiles']==608,'R27_EVIDENCE_AUTH_DIAG_SCOPE_CHANGED')
logs=[]
for label,q in [('collector-runtime',run_root/p['attempt']/'runtime.log'),('api-runtime',run_root/p['attempt']/'evidence'/'api-runtime.log')]:
 try:q.lstat()
 except FileNotFoundError:
  logs.append({'label':label,'present':False});continue
 raw=private_read(q,8388608);text=raw.decode('utf-8','replace')
 marker='AUTH_LOGIN_OR_COOKIE_INVALID' in text
 status=sorted(set(int(x) for x in re.findall(r'(?:HTTP code\s+|statusCode[\x22\x27]?\s*[:=]\s*)([1-5][0-9]{2})',text)))
 logs.append({'label':label,'present':True,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'closedFlags':{'AUTH_LOGIN_OR_COOKIE_INVALID':marker,'VALIDATION_FAILED':bool(re.search(r'(?<![A-Z0-9_])VALIDATION_FAILED(?![A-Z0-9_])',text)),'Idempotency-Key': 'Idempotency-Key' in text,'missingIdempotencyHeaderMessage':'缺少 Idempotency-Key 头' in text},'explicitHTTPStatusCodesInLog':status,'statusAttributionToLoginEstablished':False,'rawLogExported':False})
 need(hashlib.sha256(private_read(q,8388608)).hexdigest()==logs[-1]['sha256'],'R27_EVIDENCE_AUTH_DIAG_LOG_CHANGED')
collector=[]
for a in attempts:
 for c in a['collectors']:
  if c['file']!='collector-runtime.json':continue
  collector.append({'sha256':c['sha256'],'checks':[{'id':x['id'],'status':x['status'],'executed':x['executed']} for x in c['checks']],'errorCodes':c['errorCodes']})
auth_diagnosis={'logs':logs,'runtimeCollector':collector,'logStatusNotEquivalentToRequestResponse':True,'rawLogsExported':False,'privateEnvironmentExported':False}
`;
 program=program.replace(anchor,body+'\n'+anchor);const output="'productCodeExecuted':False,";need(program.split(output).length===2,'R27_EVIDENCE_AUTH_DIAG_OUTPUT_CHANGED');return program.replace(output,output+"'authContractDiagnosis':auth_diagnosis,");
}
export async function diagnoseAuthContractR27(d){
 const context=await loadR27EvidenceContext({'run-id':scope.runId,attempt:scope.attempt},d);need(context.j.taskId===scope.taskId&&context.j.candidateBefore.sha256===scope.fingerprint&&context.j.candidateBefore.files===scope.files,'R27_EVIDENCE_AUTH_DIAG_PRIVATE_SCOPE_CHANGED');
 const paths=['scripts/project-autonomy-fa01-collector-r27.mjs','.jarvis-dev/workspaces/msf-repair-r27/source/apps/server/src/modules/api/idempotency.middleware.ts','.jarvis-dev/workspaces/msf-repair-r27/source/apps/web/src/AuthGate.tsx'];
 const [snapshot,platform,...sources]=await settleEvidenceReads([()=>readR27BoundExecution(context,d),()=>observeR27Platform(context,d),...paths.map(p=>()=>readFile(p,'utf8'))]);
 need(sources[0].includes("headers: { 'content-type': 'application/json' }")&&sources[0].includes("const login = await request('/api/auth/login'" )&&sources[1].includes("req.header('Idempotency-Key')")&&sources[2].includes("'Idempotency-Key'"),'R27_EVIDENCE_AUTH_DIAG_STATIC_SOURCE_CHANGED');
 const p={...hostReadParams(context.installed.preparation,{expectedTargetTemplateSHA256:platform.targetSHA256,expectedOtherNodeTemplatesSHA256:context.j.otherNodeTemplatesSHA256,requireInstalled:true,runId:scope.runId,attempt:scope.attempt,idle:false}),diagnosticScope:scope};
 const host=await d.readRoot(p,authContractDiagnosisProgram());assertHostObservation(host,context.installed.preparation,{expectedTargetTemplateSHA256:platform.targetSHA256,expectedOtherNodeTemplatesSHA256:context.j.otherNodeTemplatesSHA256,expectedMain:context.j.mainBefore,expectedOldCandidate:context.installed.rootReadback.oldCandidate,expectedOldImmutable:context.installed.rootReadback.oldImmutable,requireInstalled:true});assertR27FreshHost(host,context.j,context.installed);await ensureR27EvidenceUnchanged(context,snapshot,platform,d);
 return {schemaVersion:1,kind:'software-factory-r27-auth-contract-bounded-diagnosis',observedAt:new Date().toISOString(),...scope,terminal:publicR27Terminal(snapshot),diagnosis:host.authContractDiagnosis,publicSourceHashes:paths.map((path,i)=>({path,sha256:sha(sources[i])})),staticFinding:{collectorLoginHasIdempotencyKey:false,productClientLoginHasIdempotencyKey:true,productMiddlewareRequiresWriteIdempotencyKey:true,actualLoginHTTP400Proven:false,productLoginBugProven:false},sourceAndOldToolsUnchanged:true,readOnly:true,modelsInvoked:false,productCodeExecuted:false,httpProductRequestsSent:false,signalsSent:false,resourcesRemoved:false,rawLogsExported:false,privateEnvironmentExported:false,productAccepted:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){let result;try{need(process.argv.length===2,'R27_EVIDENCE_AUTH_DIAG_FIXED_ARGUMENTS_ONLY');result=await withR27EvidencePlatform(diagnoseAuthContractR27);}catch(e){result=safeR27EvidenceFailure(e,'software-factory-r27-auth-contract-bounded-diagnosis');process.exitCode=1;}const path='artifacts/software-factory/acceptance-r27/auth-contract-diagnosis-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(result,null,2)+'\n',f=await open(path,'wx',0o644);try{await f.writeFile(raw);await f.sync();}finally{await f.close();}console.log(JSON.stringify({path,sha256:sha(raw),...result}));}
