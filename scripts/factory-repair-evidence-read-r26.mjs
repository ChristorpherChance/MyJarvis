/** Fixed, read-only R26 candidate observations. Importing does not perform IO. */
import {open,lstat,mkdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {withPlatform} from './managed-server-client.mjs';
import {nodeState,queueState} from './run-factory-supervision-probe.mjs';
import {repairScope as S,canonical,sha} from './run-factory-main-repair-r26.mjs';
import {assertInstallJournal,defaultReadRoot,defaultReadPrimary} from './install-factory-repair-verifier-r26.mjs';
import {verifierScope as V,fixedToolSHA} from './prepare-factory-repair-verifier-r26.mjs';
import {acceptanceScope as A,assertAcceptanceJournal,assertAcceptanceRun,assertInstalledReceipt,acceptanceStoredRunProgram,acceptanceHostReadProgram,assertAcceptanceHost,validationMetadata,zeroFixedUsage} from './run-factory-repair-acceptance-r26.mjs';

export const evidenceScope=Object.freeze({...A,candidateFingerprint:'66a56a19ce783c020ed211d7c6a2b620f1767783cd9c58525df3ca33dc0ce246',candidateFiles:605,mainFingerprint:S.baselineSHA,mainFiles:S.files});
export const terminalStates=new Set(['succeeded','failed','cancelled','timeout','interrupted','round-limit','budget-exhausted','awaiting-cost']);
export const hashPattern=/^[a-f0-9]{64}$/;
export const attemptPattern=/^[a-f0-9]{32}$/;
export const same=(a,b)=>canonical(a)===canonical(b);
export const need=(v,c)=>{if(!v)throw Error(c);};
/** Every lazy reader settles before the login owner can revoke its session. */
export async function settleEvidenceReads(readers){
 const results=await Promise.allSettled(readers.map(read=>Promise.resolve().then(read)));
 const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
 return results.map(r=>r.value);
}

export function parseReadArguments(args,{cleanup=false}={}){
 const options={};
 for(const arg of args){const m=/^--(attempt|run-id)=([^=]+)$/.exec(arg);need(m&&!Object.hasOwn(options,m[1]),'REPAIR_EVIDENCE_FIXED_ARGUMENTS_REQUIRED');options[m[1]]=m[2];}
 if(Object.hasOwn(options,'attempt'))need(attemptPattern.test(options.attempt),'REPAIR_EVIDENCE_ATTEMPT_INVALID');
 if(Object.hasOwn(options,'run-id'))need(/^[a-f0-9]{40}$/.test(options['run-id']),'REPAIR_EVIDENCE_RUN_INVALID');
 if(cleanup)need(attemptPattern.test(options.attempt??''),'REPAIR_EVIDENCE_ATTEMPT_REQUIRED');
 return options;
}

export async function safeReadLocal(path,encoding){
 const before=await lstat(path);need(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.size<=4*1024*1024,'REPAIR_EVIDENCE_LOCAL_FILE_INVALID');
 const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{const s=await f.stat();need(s.isFile()&&s.nlink===1&&s.dev===before.dev&&s.ino===before.ino&&s.size===before.size,'REPAIR_EVIDENCE_LOCAL_FILE_CHANGED');const bytes=await f.readFile();const z=await f.stat(),linked=await lstat(path);need(bytes.length===s.size&&['dev','ino','size','mtimeMs','ctimeMs'].every(k=>s[k]===z[k]&&s[k]===linked[k]),'REPAIR_EVIDENCE_LOCAL_FILE_CHANGED');return encoding?bytes.toString(encoding):bytes;}finally{await f.close();}
}

export async function loadEvidenceContext(options,d){
 const journalRaw=await d.readLocal(A.journalPath,'utf8'),j=assertAcceptanceJournal(JSON.parse(journalRaw));
 need(j.started===true&&j.runId&&j.taskId&&j.candidateBefore.sha256===evidenceScope.candidateFingerprint&&j.candidateBefore.files===605&&j.mainBefore.sha256===S.baselineSHA&&j.mainBefore.files===593,'REPAIR_EVIDENCE_FROZEN_SCOPE_CHANGED');
 if(options['run-id'])need(options['run-id']===j.runId,'REPAIR_EVIDENCE_RUN_MISMATCH');
 const nativeRaw=await d.readLocal(S.journalPath,'utf8'),native=assertInstallJournal(JSON.parse(nativeRaw));
 need(j.nativeJournalSHA256===sha(native)&&j.nativeJob===native.job,'REPAIR_EVIDENCE_NATIVE_JOURNAL_CHANGED');
 const installedRaw=await d.readLocal(j.installation.path,'utf8'),installed=assertInstalledReceipt(JSON.parse(installedRaw),native,{allowPartialTerminal:j.allowPartialTerminal});
 need(sha(installedRaw)===j.installation.sha256&&same(installed.binding,j.nativeBinding),'REPAIR_EVIDENCE_INSTALLATION_CHANGED');
 return {j,native,journalRaw,nativeRaw,installedRaw};
}

export async function readBoundExecution(context,d){
 const {j}=context,get=async path=>(await d.api(path)).data;
 const [run,task]=await settleEvidenceReads([()=>get('/api/v1/execution/runs/'+j.runId),()=>get('/api/v1/tasks/'+j.taskId)]);
 assertAcceptanceRun(run,task,j);
 const expected=Object.fromEntries(['id','taskId','objectId','projectId','machineId','workspace','executorId','scope','domain','kind'].map(k=>[k,run[k]]));
 const stored=await d.readPrimary({runId:j.runId,nodeAgentId:j.nodeAgentId,expected},acceptanceStoredRunProgram);
 need(stored.readOnly===true&&stored.status===run.status&&same(stored.result,run.result)&&stored.frozenTemplateSHA256===j.fixedTemplateSHA256&&hashPattern.test(stored.storedRecordSHA256??'')&&stored.agentId===(run.agentId??null),'REPAIR_EVIDENCE_STORED_RUN_CHANGED');
 const signed=run.result?.source==='signed-agent'&&run.agentId===j.nodeAgentId;
 const terminal=terminalStates.has(run.status);
 if(terminal)need(signed,'REPAIR_EVIDENCE_SIGNED_TERMINAL_REQUIRED');
 const validation=validationMetadata(run,j);
 let report=null;if(validation.present){need(signed,'REPAIR_EVIDENCE_SIGNED_REPORT_REQUIRED');report=JSON.parse(run.result.validation.autonomyReportJson);}
 return {run,task,stored,report,validation,signed,terminal,nonlate:run.stopRequested!==true&&run.result?.lateEvidenceOnly!==true};
}

export async function observePlatform(context,d){
 const {j,native}=context,get=async path=>(await d.api(path)).data;
 const [profile,global,config,node,queue]=await settleEvidenceReads([()=>get('/api/v1/projects/'+S.projectId+'/autonomy'),()=>get('/api/v1/execution/supervision'),()=>get('/api/v1/execution/config'),()=>d.nodeState(),()=>d.queueState()]);
 need(sha(profile)===j.initialProfileSHA256&&profile.goalSpecHash===S.goalSHA&&profile.config?.costPolicy==='record-only'&&global.supervised===false&&global.stopped===false,'REPAIR_EVIDENCE_AUTHORIZED_SCOPE_CHANGED');
 const target=config.templates?.filter(t=>t.id===S.templateId);need(target?.length===1&&node.agentId===j.nodeAgentId&&node.unit?.ActiveState==='active'&&Number(node.unit.MainPID)>1,'REPAIR_EVIDENCE_NODE_IDENTITY_CHANGED');
 const expected=j.restored?j.originalTemplate:j.fixedTemplate;
 need(same(target[0],expected)&&same(node.template,expected)&&same(native.originalTemplate,j.originalTemplate),'REPAIR_EVIDENCE_CURRENT_TEMPLATE_CHANGED');
 need(sha(config.templates.filter(t=>t.id!==S.templateId).sort((a,b)=>a.id.localeCompare(b.id)))===j.otherCentralTemplatesSHA256,'REPAIR_EVIDENCE_OTHER_TEMPLATES_CHANGED');
 need(queue.readOnly===true&&queue.fullTable===true&&Number.isSafeInteger(queue.allActive)&&queue.allActive>=0,'REPAIR_EVIDENCE_QUEUE_INVALID');
 return {profileSHA256:sha(profile),targetSHA256:sha(expected),otherTemplatesSHA256:j.otherCentralTemplatesSHA256,nodeAgentId:node.agentId,queueActive:queue.allActive};
}

/** Root-owned metadata only. No original logs, commands, private env or failureMessages are returned. */
export const reportReadFragment=String.raw`
def canonical_sha(v):return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def optional_json(q,limit=2097152):
 if not os.path.lexists(q):return None,None
 raw=private_read(q,limit)
 try:v=json.loads(raw)
 except Exception:raise RuntimeError('REPAIR_EVIDENCE_JSON_INVALID')
 need(isinstance(v,dict),'REPAIR_EVIDENCE_JSON_OBJECT_REQUIRED');return v,hashlib.sha256(raw).hexdigest()
def fixed_error(v):
 need(isinstance(v,dict) and isinstance(v.get('id'),str) and re.fullmatch(r'[A-Za-z0-9._-]{1,150}',v['id']) and isinstance(v.get('errorCode'),str) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,150}',v['errorCode']),'REPAIR_EVIDENCE_ERROR_METADATA_INVALID')
 return {'id':v['id'],'errorCode':v['errorCode']}
def safe_public_text(v):
 if not isinstance(v,str) or not 0<len(v)<=350 or re.search(r'[\x00-\x1f]',v) or re.search(r'(?:api[_ -]?key|authorization|password|passwd|secret|token|cookie|密码|密钥|令牌)[\x22\x27\x60]?\s*[:=：]|--(?:token|secret|password|api[-_]key)(?:\s+|=)\S+|\bBearer\s+|PRIVATE KEY|\b(?:sk|ghp|github_pat)[_-][A-Za-z0-9_-]{12,}|/var/lib/jarvis|/home/superopen/\.(?:secrets|claude|codex)|\.env(?:[./\s]|$)',v,re.I):return {'withheld':True,'sha256':hashlib.sha256(str(v).encode()).hexdigest()}
 return {'title':v}
def test_metadata(q):
 v,digest=optional_json(q,16*1024*1024)
 if v is None:return None
 counts={k:v.get(field) for k,field in [('total','numTotalTests'),('passed','numPassedTests'),('failed','numFailedTests'),('pending','numPendingTests')]}
 need(all(type(n) is int and n>=0 for n in counts.values()) and counts['total']==counts['passed']+counts['failed']+counts['pending'],'REPAIR_EVIDENCE_TEST_COUNTS_INVALID')
 files=v.get('testResults');need(isinstance(files,list) and len(files)<=2000,'REPAIR_EVIDENCE_TEST_FILES_INVALID');failed=[]
 for item in files:
  need(isinstance(item,dict),'REPAIR_EVIDENCE_TEST_FILE_INVALID')
  assertions=item.get('assertionResults',[]);need(isinstance(assertions,list) and len(assertions)<=10000,'REPAIR_EVIDENCE_TEST_ASSERTIONS_INVALID')
  bad=[a for a in assertions if isinstance(a,dict) and a.get('status')=='failed']
  if not bad and item.get('status')=='passed':continue
  path=item.get('name','');path=path.removeprefix('/work/source/') if isinstance(path,str) else ''
  public_path=bool(re.fullmatch(r'(?:apps|packages)/[A-Za-z0-9_./-]+\.(?:test|spec)\.[cm]?[jt]sx?',path) and '..' not in path.split('/'))
  failed.append({'path':path if public_path else None,'pathWithheld':not public_path,'assertions':[safe_public_text(a.get('fullName') or a.get('title')) for a in bad]})
 return {'file':q.name,'sha256':digest,**counts,'success':v.get('success') is True,'failedFiles':failed}
def attempt_evidence(root,attempt):
 q=root/attempt;trusted(q);need(stat.S_ISDIR(q.lstat().st_mode),'REPAIR_EVIDENCE_ATTEMPT_DIRECTORY_INVALID');collectors=[]
 for name in ['collector-build.json','collector-runtime.json']:
  v,digest=optional_json(q/'evidence'/name)
  if v is None:continue
  need(v.get('schemaVersion')==1 and v.get('runId')==p['runId'] and v.get('sourceFingerprint')==p['candidateFingerprint'],'REPAIR_EVIDENCE_COLLECTOR_BINDING_CHANGED')
  checks=v.get('checks');need(isinstance(checks,list) and len(checks)<=1000,'REPAIR_EVIDENCE_COLLECTOR_CHECKS_INVALID')
  rows=[];ids=set()
  for c in checks:
   need(isinstance(c,dict) and isinstance(c.get('id'),str) and re.fullmatch(r'[A-Za-z0-9._-]{1,150}',c['id']) and c['id'] not in ids and c.get('status') in ['pass','fail','skip','unknown'] and type(c.get('executed')) is bool and (c.get('exitCode') is None or type(c.get('exitCode')) is int),'REPAIR_EVIDENCE_COLLECTOR_CHECK_INVALID');ids.add(c['id'])
   row={k:c.get(k) for k in ['id','executed','status','exitCode']}
   if c.get('tests') is not None:
    t=c['tests'];need(isinstance(t,dict) and all(type(t.get(k)) is int and t[k]>=0 for k in ['total','passed','failed','skipped','unknown']) and t['total']==sum(t[k] for k in ['passed','failed','skipped','unknown']),'REPAIR_EVIDENCE_COLLECTOR_COUNTS_INVALID');row['tests']={k:t[k] for k in ['total','passed','failed','skipped','unknown']}
   rows.append(row)
  problems=v.get('problems',[]);need(isinstance(problems,list) and len(problems)<=1000,'REPAIR_EVIDENCE_COLLECTOR_PROBLEMS_INVALID')
  collectors.append({'file':name,'sha256':digest,'startedAt':v.get('startedAt'),'lastSavedAt':v.get('finishedAt'),'checks':rows,'errorCodes':[fixed_error(x) for x in problems]})
 detail,digest=optional_json(q/'detailed-report.json');final=None
 if detail is not None:
  v=detail.get('report');need(isinstance(v,dict) and v.get('schemaVersion')==1 and v.get('kind')=='project-autonomy-validation' and v.get('runId')==p['runId'] and v.get('workspace')==p['workspace'] and v.get('sourceFingerprint')==p['candidateFingerprint'] and v.get('workPackage')=='FA-01' and v.get('goalSpecHash')==p['goalSHA'] and v.get('simulated') is False and v.get('status') in ['pass','fail'] and type(v.get('sourceStable')) is bool,'REPAIR_EVIDENCE_FINAL_BINDING_CHANGED')
  errors=detail.get('errorCodes',[]);need(isinstance(errors,list) and len(errors)<=1000,'REPAIR_EVIDENCE_FINAL_ERRORS_INVALID')
  need(detail.get('modelsInvoked') is False and detail.get('productionDatabaseUsed') is False and detail.get('privateEnvCopied') is False,'REPAIR_EVIDENCE_PRIVATE_BOUNDARY_CHANGED')
  final={'sha256':digest,'canonicalReportSHA256':canonical_sha(v),'status':v['status'],'sourceStable':v['sourceStable'],'errorCodes':[fixed_error(x) for x in errors],'modelsInvoked':False,'productionDatabaseUsed':False,'privateEnvCopied':False}
 tests=[x for x in [test_metadata(q/'evidence'/name) for name in ['packages-shared-tests.json','apps-server-tests.json','apps-web-tests.json']] if x is not None]
 return {'attempt':attempt,'collectors':collectors,'testGroups':tests,'final':final}
baseline_scope=json.loads(private_read(Path(p['configRoot'])/'baseline.json'))
required_suites=baseline_scope.get('requiredPrototypeSuites');need(isinstance(required_suites,list) and len(required_suites)==30 and len(set(required_suites))==30 and all(isinstance(x,str) and re.fullmatch('[a-z][a-z0-9-]+',x) for x in required_suites),'REPAIR_EVIDENCE_REQUIRED_SUITES_CHANGED')
required_prototype_ids=['prototype-'+x for x in required_suites]
run_root=Path(p['evidenceRoot'])/p['runId'];attempts=[]
if os.path.lexists(run_root):
 trusted(run_root);need(stat.S_ISDIR(run_root.lstat().st_mode),'REPAIR_EVIDENCE_RUN_DIRECTORY_INVALID')
 names=sorted(x.name for x in run_root.iterdir());need(len(names)<=3 and all(re.fullmatch('[a-f0-9]{32}',x) for x in names),'REPAIR_EVIDENCE_ATTEMPT_SCOPE_INVALID')
 if p.get('attempt'):need(names==[p['attempt']],'REPAIR_EVIDENCE_EXACT_ATTEMPT_REQUIRED')
 for name in names:attempts.append(attempt_evidence(run_root,name))
elif p.get('attempt'):raise RuntimeError('REPAIR_EVIDENCE_RUN_DIRECTORY_MISSING')
`;

export function hostReadProgram(fragment=''){
 const base=acceptanceHostReadProgram(),at=base.lastIndexOf('print(json.dumps(');need(at>0,'REPAIR_EVIDENCE_HOST_TEMPLATE_CHANGED');
 return base.slice(0,at)+reportReadFragment+fragment+String.raw`
final_main,_=source_state(p['source']);final_candidate,_=source_state(p['workspace']);final_quiet=quiet()
need(final_main==source_final and final_candidate==candidate_final,'REPAIR_EVIDENCE_SOURCE_CHANGED_DURING_AUDIT')
need(final_quiet==node_final and installed()==installed_after and node_templates()==node_templates_after and private_read(prep/'origin.json')==origin_bytes,'REPAIR_EVIDENCE_NODE_CHANGED_DURING_AUDIT')
need(immutable()==immutable_after and {name:hashlib.sha256(private_read(tools_dir/name)).hexdigest() for name in p['fixedTools']}==tools,'REPAIR_EVIDENCE_OLD_FILES_CHANGED_DURING_AUDIT')
observation={'observedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'helperVerified':True,'source':final_main,'candidate':final_candidate,'candidateBefore':candidate_before,'candidateAfter':final_candidate,'originBound':bound,'origin':{**origin,'rootOwned':True,'sha256':hashlib.sha256(origin_bytes).hexdigest()},'quiet':final_quiet,'tools':tools,'toolsAfter':tools,'oldBaselineSHA':immutable_after['/etc/jarvis-development/project-autonomy/baseline.json'],'oldPolicySHA':immutable_after['/etc/jarvis-development/project-autonomy/FA-01.json'],'oldWrapperSHA':immutable_after['/usr/local/libexec/jarvis-msf-main-acceptance-r26-4'],'receiptSHA':immutable_after[str(tools_dir/'factory-no-model-receipt-r26.mjs')],'immutableBefore':immutable_before,'immutableAfter':immutable_after,'coordinatorPatch':{'version':'r26-4-summary-scan','originalSHA256':tools['project-autonomy-fa01-coordinator.py']},'installed':installed_after,'nodeTemplates':node_templates_after,'attempts':attempts,'requiredPrototypeCheckIds':required_prototype_ids,'mutationsPerformed':False,'rawLogsExported':False,'privateEnvironmentExported':False,'productCodeExecuted':False,'modelsInvoked':False}
if 'cleanup_observation' in globals():observation['cleanupAudit']=cleanup_observation
print(json.dumps(observation))
`;
}

export function hostParameters(context,options){const {j,native}=context;return {...S,...V,mode:'inspect',job:native.job,agentId:j.nodeAgentId,sourcePaths:[],fixedTools:fixedToolSHA,runId:j.runId,attempt:options.attempt??null,candidateFingerprint:evidenceScope.candidateFingerprint};}

export function assertEvidenceHost(host,context,platform,{idle=false}={}){
 const {j,native}=context;assertAcceptanceHost(host,j,native,{idle});
 need(host.source.files===593&&host.candidate.files===605&&host.candidate.sha256===evidenceScope.candidateFingerprint&&host.nodeTemplates.targetSHA256===platform.targetSHA256&&host.privateEnvironmentExported===false&&host.productCodeExecuted===false&&host.modelsInvoked===false&&Array.isArray(host.attempts)&&host.attempts.length<=3,'REPAIR_EVIDENCE_HOST_BOUNDARY_CHANGED');
 const ids=new Set();for(const a of host.attempts){need(attemptPattern.test(a.attempt??'')&&!ids.has(a.attempt),'REPAIR_EVIDENCE_ATTEMPT_SCOPE_INVALID');ids.add(a.attempt);}
 need(Array.isArray(host.requiredPrototypeCheckIds)&&host.requiredPrototypeCheckIds.length===30&&new Set(host.requiredPrototypeCheckIds).size===30&&host.requiredPrototypeCheckIds.every(x=>/^prototype-[a-z][a-z0-9-]+$/.test(x)),'REPAIR_EVIDENCE_REQUIRED_SUITES_CHANGED');
 return host;
}

export function publicValidationMetadata(snapshot,host){
 if(!snapshot.report)return {...snapshot.validation,requiredPrototypeSuiteCount:30,prototypeChecks:null};
 const required=new Set(host.requiredPrototypeCheckIds),rows=snapshot.report.checks.filter(c=>required.has(c.id)),counts={total:30,passed:0,failed:0,skipped:0,unknown:30-rows.length};
 for(const c of rows)counts[{pass:'passed',fail:'failed',skip:'skipped',unknown:'unknown'}[c.status]]++;
 return {...snapshot.validation,requiredPrototypeSuiteCount:30,prototypeChecks:counts,additionalPrototypeChecks:snapshot.report.checks.filter(c=>c.id.startsWith('prototype-')&&!required.has(c.id)).map(c=>({id:c.id,status:c.status,executed:c.executed}))};
}

export function bindTerminalReport(snapshot,host){
 if(!snapshot.report)return {present:false,bound:false,reason:'SIGNED_FULL_REPORT_UNAVAILABLE'};
 const digest=sha(snapshot.report),matches=host.attempts.filter(a=>a.final?.canonicalReportSHA256===digest);
 need(matches.length===1,'REPAIR_EVIDENCE_PRIVATE_SIGNED_REPORT_MISMATCH');
 const a=matches[0];need(a.final.status===snapshot.validation.status&&a.final.sourceStable===snapshot.validation.sourceStable,'REPAIR_EVIDENCE_FINAL_REPORT_CHANGED');
 return {present:true,bound:snapshot.terminal&&snapshot.signed&&snapshot.nonlate,attempt:a.attempt,privateEnvelopeSHA256:a.final.sha256,canonicalReportSHA256:digest,signedProtocolSHA256:snapshot.validation.sha256,status:a.final.status,sourceStable:a.final.sourceStable};
}

export async function ensureObservationUnchanged(context,first,platform,d){
 const second=await readBoundExecution(context,d),after=await observePlatform(context,d);
 need(sha(first.run)===sha(second.run)&&first.stored.storedRecordSHA256===second.stored.storedRecordSHA256&&same(platform,after),'REPAIR_EVIDENCE_OBSERVATION_CHANGED_RETRY_READ_ONLY');
 need(await d.readLocal(A.journalPath,'utf8')===context.journalRaw&&await d.readLocal(S.journalPath,'utf8')===context.nativeRaw&&await d.readLocal(context.j.installation.path,'utf8')===context.installedRaw,'REPAIR_EVIDENCE_LOCAL_BINDING_CHANGED');
}

export function publicTerminal(snapshot){const {run}=snapshot;return {status:run.status,terminal:snapshot.terminal,signedReceiptIngested:snapshot.signed,signatureVerifierReexecuted:false,nonlate:snapshot.nonlate,outcome:run.result?.outcome??null,executionExitCode:run.result?.exitCode??null,validationExitCode:Number.isInteger(run.result?.validation?.exitCode)?run.result.validation.exitCode:null,stopRequested:run.stopRequested===true,lateEvidenceOnly:run.result?.lateEvidenceOnly===true,storedRecordSHA256:snapshot.stored.storedRecordSHA256,frozenTemplateSHA256:snapshot.stored.frozenTemplateSHA256,resultSHA256:run.result?sha(run.result):null,zeroModelUsageConfirmed:snapshot.terminal&&snapshot.signed&&zeroFixedUsage(run.result?.usage),rawResultExported:false};}

export const defaultDependencies={now:Date.now,readLocal:safeReadLocal,nodeState,queueState,readPrimary:defaultReadPrimary,readRoot:defaultReadRoot};
export async function withEvidencePlatform(action){return withPlatform(({api})=>action({...defaultDependencies,api}));}
export function safeEvidenceFailure(error,kind){const m=String(error?.message??'');return {schemaVersion:1,kind,observedAt:new Date().toISOString(),failed:true,errorCode:/^(?:REPAIR_EVIDENCE|REPAIR_ACCEPTANCE|REPAIR_INSTALL|REPAIR_VERIFIER|MAIN_REPAIR)_[A-Z0-9_]{1,120}$/.test(m)?m:'REPAIR_EVIDENCE_OPERATION_FAILED',productAccepted:false,rawErrorExported:false,rawLogsExported:false,privateEnvironmentExported:false,mutationsPerformed:false,modelsInvoked:false,automaticRetry:false};}
export async function savePublicEvidence(prefix,result,now=Date.now()){
 await mkdir(A.artifactDirectory,{recursive:true});const path=A.artifactDirectory+'/'+prefix+'-'+now+'-'+randomUUID()+'.json',raw=JSON.stringify(result,null,2)+'\n',f=await open(path,'wx',0o644);
 try{await f.writeFile(raw);await f.sync();}finally{await f.close();}return {path:resolve(path),sha256:sha(raw)};
}
