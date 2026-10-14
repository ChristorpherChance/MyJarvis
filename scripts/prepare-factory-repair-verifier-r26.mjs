/** Offline repair-verifier preparation. No remote adapter or installer is wired into this CLI. */
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {repairScope, assertJournal, assertActualRun, repairHostProgram, canonical, sha} from './run-factory-main-repair-r26.mjs';

const S=repairScope, H=/^[a-f0-9]{64}$/, same=(a,b)=>canonical(a)===canonical(b);
const need=(v,c)=>{if(!v)throw Error(c);};
export const verifierScope=Object.freeze({workspace:S.workspace,entry:'/usr/local/libexec/jarvis-msf-main-acceptance-r26-repair',configRoot:'/etc/jarvis-development/main-acceptance-r26-repair',evidenceRoot:'/var/lib/jarvis-development/101/main-acceptance-r26-repair',sudoRule:'/etc/sudoers.d/jarvis-main-acceptance-r26-repair',templateSHA:'c2c4ba63530fcba7d32764724056987be6426d711b9bf5a7f73f0d7d59d07e4e',oldBaselineSHA:'b6d21374b5d726d7b83fce1907d578548bebdeae8c362c3241f8b1c951598fb6',oldPolicySHA:'6fe014e54299489cab1107057f1c80b7afd4a94b725aa2f18a6e1b7457452f8b',receiptSHA:'c6a0a2b69a96f694c999fde76bcaffb972649d1ba101226284068c1fbc95241c'});
export const fixedToolSHA=Object.freeze({
 'project-autonomy-fa01-coordinator.py':'f60c3e88056515e41bd0486285809b2342d783f21e225f9ffc64c3d96477740b',
 'project-autonomy-fa01-collector.mjs':'a6cc30f63134fdc6d5be4aaba6049b99c0920c0db3e89b612d607b7991e647b7',
 'project-autonomy-evidence.py':'57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2',
 'project-autonomy-fa01-browser.mjs':'4836a22a44155ad0a1bc2beedf18e2efb0c52aa57baa1c3c1cb735e47fbbada0',
 'factory-sandbox-broker-control.py':'43afea4244f741bbaa3b4d347304c51e6886b8533aceb04967a439de0a4d3dbd',
 'factory-sandbox-broker.py':'d4bcec4e88990e45c82d76574fe7c8de8eebd1db239cedceefd95a6b204d1954'
});

/** Input must contain real stored native records, never the public model-execution receipt alone. */
export function assertRepairBinding(e,{now=Date.now(),fresh=true,allowPartialTerminal=false}={}){
 need(e?.schemaVersion===1&&e.kind==='software-factory-repair-verifier-input','REPAIR_VERIFIER_INPUT_INVALID');
 const {journal:j,run,task,host,node,queue,central,terminalRead}=e;
 assertJournal(j);assertActualRun(run,task,j);
 need(j.started===true&&j.restored===true&&j.phase==='restored'&&j.copy?.originBound===true,'REPAIR_VERIFIER_NATIVE_NOT_RESTORED');
 const partialNative=allowPartialTerminal===true&&j.runId==='5c8034046a05b0db89edebbb0e2c6876efb5882f'&&j.taskId==='580888fe-8edc-40a0-b6a3-46124d119870'&&run.status==='round-limit'&&run.result?.outcome==='round-limit';
 need(((run.status==='succeeded'&&run.result?.outcome==='success')||partialNative)&&run.stopRequested!==true&&run.agentId===j.nodeAgentId&&run.result?.source==='signed-agent'&&run.result.exitCode===0&&run.result.lateEvidenceOnly!==true,'REPAIR_VERIFIER_NATIVE_TERMINAL_REQUIRED');
 need(!Object.hasOwn(j.template,'validation')&&run.result.validation==null&&j.template.supervision.repairValidation===false,'REPAIR_VERIFIER_NATIVE_EXECUTION_ONLY_REQUIRED');
 need(terminalRead?.ingestedSignedAgentReceipt===true&&terminalRead.runRecordSHA256===sha(run)&&terminalRead.resultSHA256===sha(run.result)&&terminalRead.frozenRunTemplateSHA256===j.templateSHA,'REPAIR_VERIFIER_NATIVE_RESULT_BINDING_CHANGED');
 need(same(central,j.originalTemplate)&&same(node?.template,j.originalTemplate)&&node.agentId===j.nodeAgentId&&node.unit?.ActiveState==='active'&&Number(node.unit.MainPID)>1,'REPAIR_VERIFIER_TEMPLATE_RESTORE_UNCONFIRMED');
 need(queue?.readOnly===true&&queue.fullTable===true&&queue.allActive===0&&host?.quiet?.active===true&&host.quiet.children?.length===0&&same(host.quiet.counts,{runs:0,deliveries:0,logs:0}),'REPAIR_VERIFIER_QUEUE_NOT_ACK_IDLE');
 need(host.helperVerified===true&&host.source?.sha256===S.baselineSHA&&host.source.files===S.files&&host.source.stable===true&&same(host.source,j.sourceBefore)&&same(host.source,j.sourceAfter),'REPAIR_VERIFIER_ORIGINAL_MAIN_CHANGED');
 need(host.originBound===true&&host.origin?.rootOwned===true&&H.test(host.origin.sha256??'')&&host.origin.version===1&&host.origin.phase==='ready'&&host.origin.job===j.job&&host.origin.workspace===S.workspace&&host.origin.parent===S.parent&&host.origin.baselineSHA===S.baselineSHA&&same(host.origin.identity,host.candidate?.identity)&&same(host.origin.identity,j.copy.candidate?.identity),'REPAIR_VERIFIER_CANDIDATE_ORIGIN_CHANGED');
 need(H.test(host.candidate?.sha256??'')&&host.candidate.sha256!==S.baselineSHA&&host.candidate.stable===true&&Number.isSafeInteger(host.candidate.files)&&host.candidate.files>=45&&H.test(host.candidate.metadataSHA??'')&&same(host.candidate,host.candidateBefore)&&same(host.candidate,host.candidateAfter),'REPAIR_VERIFIER_ACTUAL_CANDIDATE_REQUIRED');
 need(host.mutationsPerformed===false&&host.rawLogsExported===false&&same(host.tools,fixedToolSHA)&&same(host.tools,host.toolsAfter)&&host.oldBaselineSHA===verifierScope.oldBaselineSHA&&host.oldPolicySHA===verifierScope.oldPolicySHA&&host.oldWrapperSHA===verifierScope.templateSHA&&host.receiptSHA===verifierScope.receiptSHA&&host.immutableBefore&&Object.keys(host.immutableBefore).length>=4&&Object.values(host.immutableBefore).every(v=>H.test(v))&&same(host.immutableBefore,host.immutableAfter),'REPAIR_VERIFIER_OLD_FILES_CHANGED');
 need(host.coordinatorPatch?.version==='r26-4-summary-scan'&&host.coordinatorPatch.originalSHA256===fixedToolSHA['project-autonomy-fa01-coordinator.py'],'REPAIR_VERIFIER_COORDINATOR_PATCH_BINDING_CHANGED');
 for(const time of [e.observedAt,terminalRead.observedAt,queue.observedAt,host.observedAt]){
  need(Number.isFinite(Date.parse(time)),'REPAIR_VERIFIER_OBSERVATION_TIME_REQUIRED');
  if(fresh)need(now-Date.parse(time)>=-30000&&now-Date.parse(time)<=5*60000,'REPAIR_VERIFIER_OBSERVATION_STALE');
 }
 return {journalSHA256:sha(j),runId:run.id,taskId:task.id,resultSHA256:sha(run.result),runRecordSHA256:sha(run),candidateFingerprint:host.candidate.sha256,candidateMetadataSHA256:host.candidate.metadataSHA,originSHA256:host.origin.sha256,modelExecutionOnly:true,partialNative,nativeStatus:run.status,nativeOutcome:run.result.outcome,productAccepted:false};
}

function replaceExactly(source,from,to,count=1){need(source.split(from).length-1===count,'REPAIR_VERIFIER_TEMPLATE_TARGET_CHANGED');return source.split(from).join(to);}
export function renderRepairWrapper(original,candidateFingerprint){
 need(sha(original)===verifierScope.templateSHA,'REPAIR_VERIFIER_TEMPLATE_HASH_CHANGED');
 need(H.test(candidateFingerprint??'')&&candidateFingerprint!==S.baselineSHA,'REPAIR_VERIFIER_ACTUAL_CANDIDATE_REQUIRED');
 let source=Buffer.isBuffer(original)?original.toString('utf8'):original;
 source=replaceExactly(source,"WORKSPACE = '"+S.source+"'","WORKSPACE = '"+S.workspace+"'");
 source=replaceExactly(source,"SOURCE_SHA256 = '"+S.baselineSHA+"'","SOURCE_SHA256 = '"+candidateFingerprint+"'");
 source=replaceExactly(source,"'/usr/local/libexec/jarvis-msf-main-acceptance-r26-4'","'"+verifierScope.entry+"'",2);
 source=replaceExactly(source,"'/etc/jarvis-development/main-acceptance-r26-4'","'"+verifierScope.configRoot+"'");
 source=replaceExactly(source,"'/var/lib/jarvis-development/101/main-acceptance-r26-4'","'"+verifierScope.evidenceRoot+"'");
 source=replaceExactly(source,'main_acceptance_coordinator_r26_4','main_acceptance_coordinator_r26_repair');
 source=replaceExactly(source,"        need(result.get('sha256') == SOURCE_SHA256, 'MAIN_ACCEPTANCE_SNAPSHOT_CHANGED')\n        return result", "        need(result.get('sha256') == SOURCE_SHA256, 'MAIN_ACCEPTANCE_SNAPSHOT_CHANGED')\n        after = helper.fingerprint(workspace)\n        need(after == before and after.get('sha256') == SOURCE_SHA256, 'MAIN_ACCEPTANCE_SOURCE_CHANGED_DURING_SNAPSHOT')\n        return result");
 return source;
}

export function cloneFixedConfiguration(baseline,policy,binding){
 need(baseline?.workspace==='/home/superopen/All-Projects/msf-jarvis-autonomy-r22'&&policy?.workspace===baseline.workspace,'REPAIR_VERIFIER_OLD_CONFIG_SCOPE_CHANGED');
 need(baseline.requiredTestFiles?.length===45&&baseline.requiredPrototypeSuites?.length===30&&baseline.minimumCoverage?.lines>=90&&baseline.minimumCoverage?.branches>=80,'REPAIR_VERIFIER_DENOMINATOR_CHANGED');
 need(binding?.productAccepted===false&&H.test(binding.candidateFingerprint??''),'REPAIR_VERIFIER_BINDING_REQUIRED');
 return {baseline:{...structuredClone(baseline),workspace:S.workspace,sourceEvidence:'native-repair-r26-independent-fixed-validation',sourceFingerprintObserved:binding.candidateFingerprint},policy:{...structuredClone(policy),workspace:S.workspace,evidenceRoot:verifierScope.evidenceRoot,sourceFingerprint:binding.candidateFingerprint}};
}

/** Emits a local review bundle; does not claim installed or product accepted. */
export function prepareRepairVerifier(e,original,oldBaselineBytes,oldPolicyBytes,options){
 const binding=assertRepairBinding(e,options);
 need(sha(oldBaselineBytes)===verifierScope.oldBaselineSHA&&sha(oldPolicyBytes)===verifierScope.oldPolicySHA,'REPAIR_VERIFIER_OLD_CONFIG_BYTES_CHANGED');
 const config=cloneFixedConfiguration(JSON.parse(oldBaselineBytes),JSON.parse(oldPolicyBytes),binding);
 const wrapper=renderRepairWrapper(original,binding.candidateFingerprint);
 return {wrapper,config,manifest:{schemaVersion:1,kind:'software-factory-repair-fixed-verifier-preparation',binding,partialNative:binding.partialNative,nativeStatus:binding.nativeStatus,nativeOutcome:binding.nativeOutcome,scope:verifierScope,wrapperSHA256:sha(wrapper),fixedTools:fixedToolSHA,coordinatorPatch:{version:'r26-4-summary-scan',originalSHA256:fixedToolSHA['project-autonomy-fa01-coordinator.py']},installed:false,installerImplemented:false,fullValidationExecuted:false,modelsInvoked:false,productAccepted:false,necessaryNextSteps:['Freshly re-read bound stored native result, frozen run template, queue/node ACK idle and restored original template.','Root exclusively create new fixed namespace files and validate the exact new sudo rule with visudo; preserve old policies, tools and report inventories.','Re-read root-helper fingerprints and origin identities before and after installation; pin this rendered candidate fingerprint.','Dispatch a separate fixed no-model full validation only after installer readback, then independently audit cleanup and source consistency.']}};
}

/** A fixed read-only host observation program, derived without the native copy/handoff branch. */
export function repairVerifierHostReadProgram(){
 const start="if p['mode']=='prepare':", end="if origin is None and os.path.lexists(prep/'origin.json'):";
 const a=repairHostProgram.indexOf(start),b=repairHostProgram.indexOf(end);
 need(a>0&&b>a,'REPAIR_VERIFIER_HOST_READ_TEMPLATE_CHANGED');
 let body=repairHostProgram.slice(0,a)+repairHostProgram.slice(b);
 body=replaceExactly(body,'0<s.st_size<=limit','0<=s.st_size<=limit');
 const output=body.lastIndexOf('print(json.dumps(');need(output>0,'REPAIR_VERIFIER_HOST_READ_TEMPLATE_CHANGED');
 body=body.slice(0,output)+String.raw`
candidate_before=candidate
need(origin is not None and bound,'REPAIR_VERIFIER_CANDIDATE_ORIGIN_CHANGED')
origin_bytes=private_read(prep/'origin.json')
need(json.loads(origin_bytes)==origin,'REPAIR_VERIFIER_ORIGIN_READ_CHANGED')
tools_dir=Path('/opt/jarvis-development/software-factory')
import re
def report_file_sha(q,limit):
 q=trusted(q);fd=os.open(q,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and 0<=s.st_size<=limit,'REPAIR_VERIFIER_REPORT_FILE_LIMIT_INVALID')
  digest=hashlib.sha256();count=0
  while count<=limit:
   piece=os.read(fd,min(1024*1024,limit+1-count))
   if not piece:break
   count+=len(piece);need(count<=limit,'REPAIR_VERIFIER_REPORT_FILE_GREW');digest.update(piece)
  a=os.fstat(fd);named=q.lstat();key=lambda x:(x.st_dev,x.st_ino,x.st_uid,x.st_gid,x.st_mode,x.st_nlink,x.st_size,x.st_mtime_ns,x.st_ctime_ns)
  # Named identity binds the held descriptor; full descriptor timestamps stay
  # unchanged. Windows path ctime may represent birth time rather than the
  # descriptor change time, so it is not part of that named-path comparison.
  need(key(s)==key(a) and key(a)[:-1]==key(named)[:-1] and count==s.st_size,'REPAIR_VERIFIER_REPORT_FILE_CHANGED')
  return digest.hexdigest()
 finally:os.close(fd)
def report_inventory(root):
 # Only the frozen coordinator's root metadata and evidence belong to this
 # inventory. Snapshot/work/installed trees contain disposable UID1000 source
 # and third-party links; private env files are never read or exported here.
 values={}
 def directory(q):
  trusted(q);s=q.lstat();need(stat.S_ISDIR(s.st_mode),'REPAIR_VERIFIER_REPORT_DIRECTORY_INVALID')
  values[str(q)+'/']=hashlib.sha256(b'root-report-directory').hexdigest()
 def file(q):
  # The frozen coordinator MAX_PACKAGE is 512MiB. Only its exact top-level
  # candidate artifact gets that bound; other metadata/evidence remain 64MiB.
  package=q.name=='candidate.tar.gz' and len(q.relative_to(Path(root)).parts)==4 and q.parent.name=='evidence'
  values[str(q)]=report_file_sha(q,(512 if package else 64)*1024*1024)
 def evidence(q):
  directory(q)
  for child in sorted(q.iterdir()):
   s=child.lstat();need(not stat.S_ISLNK(s.st_mode),'REPAIR_VERIFIER_REPORT_SYMLINK_REJECTED')
   if stat.S_ISDIR(s.st_mode):evidence(child)
   else:need(stat.S_ISREG(s.st_mode),'REPAIR_VERIFIER_REPORT_FILE_INVALID');file(child)
 q=Path(root)
 if not os.path.lexists(q):return values
 directory(q)
 for run in sorted(q.iterdir()):
  need(re.fullmatch(r'(?:[a-f0-9]{40}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})',run.name),'REPAIR_VERIFIER_REPORT_RUN_SCOPE_INVALID')
  directory(run)
  for attempt in sorted(run.iterdir()):
   need(re.fullmatch(r'[a-f0-9]{32}',attempt.name),'REPAIR_VERIFIER_REPORT_ATTEMPT_SCOPE_INVALID');directory(attempt)
   for child in sorted(attempt.iterdir()):
    name=child.name
    if name in ['snapshot','source','work','installed','install','postgres.env','minio.env','node.env','runtime.env']:continue
    if name=='evidence':evidence(child);continue
    need(name in ['source-before.json','source-after.json','lifecycle.json','image-ids.json','cleanup.json','failure-summary.json','detailed-report.json','infrastructure.log','watchdog-process.log','watchdog.log','watchdog-cleanup.json','phase-contract.log'] or re.fullmatch(r'phase-artifact-[0-9]+\.bin',name),'REPAIR_VERIFIER_REPORT_METADATA_SCOPE_INVALID')
    file(child)
 return values
def immutable():
 paths=[Path('/etc/jarvis-development/project-autonomy/baseline.json'),Path('/etc/jarvis-development/project-autonomy/FA-01.json'),Path('/usr/local/libexec/jarvis-msf-main-acceptance-r26-4'),tools_dir/'factory-no-model-receipt-r26.mjs']
 values={str(q):hashlib.sha256(private_read(q)).hexdigest() for q in paths}
 for root in ['/var/lib/jarvis-development/101/main-acceptance-r26','/var/lib/jarvis-development/101/main-acceptance-r26-4']:
  values.update(report_inventory(root))
 return values
immutable_before=immutable()
tools={name:hashlib.sha256(private_read(tools_dir/name)).hexdigest() for name in p['fixedTools']}
candidate_after,_=source_state(p['workspace'])
tools_after={name:hashlib.sha256(private_read(tools_dir/name)).hexdigest() for name in p['fixedTools']}
immutable_after=immutable()
main_after,_=source_state(p['source']);need(before==main_after,'REPAIR_VERIFIER_MAIN_READ_CHANGED')
need(candidate_before==candidate_after,'REPAIR_VERIFIER_CANDIDATE_READ_CHANGED')
need(immutable_before==immutable_after and tools==tools_after,'REPAIR_VERIFIER_IMMUTABLE_READ_CHANGED')
need(private_read(prep/'origin.json')==origin_bytes,'REPAIR_VERIFIER_ORIGIN_READ_CHANGED')
parent_after=h.open_directory(p['parent'])
try:need(identity(parent_after)==origin['parentIdentity'],'REPAIR_VERIFIER_PARENT_READ_CHANGED')
finally:os.close(parent_after)
node_after=quiet();need(node_after==node,'REPAIR_VERIFIER_NODE_READ_CHANGED')
print(json.dumps({'observedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'helperVerified':True,'source':main_after,'candidate':candidate_after,'candidateBefore':candidate_before,'candidateAfter':candidate_after,'originBound':bound,'origin':{**origin,'rootOwned':True,'sha256':hashlib.sha256(origin_bytes).hexdigest()},'quiet':node_after,'tools':tools,'toolsAfter':tools_after,'oldBaselineSHA':immutable_after['/etc/jarvis-development/project-autonomy/baseline.json'],'oldPolicySHA':immutable_after['/etc/jarvis-development/project-autonomy/FA-01.json'],'oldWrapperSHA':immutable_after['/usr/local/libexec/jarvis-msf-main-acceptance-r26-4'],'receiptSHA':immutable_after[str(tools_dir/'factory-no-model-receipt-r26.mjs')],'immutableBefore':immutable_before,'immutableAfter':immutable_after,'coordinatorPatch':{'version':'r26-4-summary-scan','originalSHA256':tools['project-autonomy-fa01-coordinator.py']},'mutationsPerformed':False,'rawLogsExported':False}))
`;
 return body;
}

/** Only an explicitly supplied root read adapter can perform remote reads. No caller-controlled paths/FP. */
export async function readRepairVerifierHost(j,readRoot){assertJournal(j);need(typeof readRoot==='function','REPAIR_VERIFIER_READ_ADAPTER_REQUIRED');return readRoot({...S,mode:'inspect',job:j.job,agentId:j.nodeAgentId,sourcePaths:[],fixedTools:fixedToolSHA},repairVerifierHostReadProgram());}

export async function localMain(argv,{read=readFile,write=writeFile,mkdirLocal=mkdir}={}){
 const [action='inspect',...args]=argv;
 need(['inspect','prepare'].includes(action)&&!args.includes('--execute'),'REPAIR_VERIFIER_INSTALLER_NOT_IMPLEMENTED');
 if(!args.length)return {schemaVersion:1,kind:'software-factory-repair-verifier-readiness',ready:false,remoteReadsPerformed:false,remoteMutationsPerformed:false,installed:false,productAccepted:false,missing:['real native journal/task/stored run and frozen template read','fresh fixed host/queue/node/restored-template observation','original baseline/policy bytes'],installerImplemented:false};
 need(args.length===2&&args[0]==='--evidence','REPAIR_VERIFIER_LOCAL_ARGUMENTS_INVALID');
 const e=JSON.parse(await read(resolve(args[1]),'utf8'));
 const binding=assertRepairBinding(e);
 if(action==='inspect')return {ready:true,...binding,remoteReadsPerformed:false,installed:false,productAccepted:false,installerImplemented:false};
 const original=await read(resolve('scripts/factory-main-acceptance-wrapper-r26-4.py'));
 const result=prepareRepairVerifier(e,original,Buffer.from(e.oldBaselineBase64,'base64'),Buffer.from(e.oldPolicyBase64,'base64'));
 const dir=resolve('artifacts/software-factory/acceptance-r26/repair-verifier-'+binding.candidateFingerprint.slice(0,16));
 await mkdirLocal(dir,{recursive:false});
 for(const [name,value] of [['wrapper.py',result.wrapper],['baseline.json',JSON.stringify(result.config.baseline,null,2)+'\n'],['policy.json',JSON.stringify(result.config.policy,null,2)+'\n'],['manifest.json',JSON.stringify(result.manifest,null,2)+'\n']])await write(resolve(dir,name),value,{flag:'wx',mode:0o600});
 return {directory:dir,...result.manifest};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(await localMain(process.argv.slice(2))));}catch(error){console.error(JSON.stringify({errorCode:/^(REPAIR_VERIFIER|MAIN_REPAIR)_[A-Z0-9_]+$/.test(error.message)?error.message:'REPAIR_VERIFIER_PREPARATION_FAILED',installed:false,productAccepted:false,rawErrorExported:false}));process.exitCode=1;}}
