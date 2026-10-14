/** Fixed R26 native-candidate verifier installer. Importing performs no IO. */
import {readFile,lstat,mkdir,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {withPlatform,remote,primary,lanProfile,python} from './managed-server-client.mjs';
import {nodeState,queueState} from './run-factory-supervision-probe.mjs';
import {repairScope as S,assertJournal,assertActualRun,canonical,sha} from './run-factory-main-repair-r26.mjs';
import {verifierScope as V,fixedToolSHA,assertRepairBinding,prepareRepairVerifier,readRepairVerifierHost,repairVerifierHostReadProgram} from './prepare-factory-repair-verifier-r26.mjs';
const need=(v,c)=>{if(!v)throw Error(c);},same=(a,b)=>canonical(a)===canonical(b),H=/^[a-f0-9]{64}$/;
export const installScope=Object.freeze({nativeRunId:'5c8034046a05b0db89edebbb0e2c6876efb5882f',nativeTaskId:'580888fe-8edc-40a0-b6a3-46124d119870',...V});
export function assertInstallJournal(j){assertJournal(j);need(j.runId===installScope.nativeRunId&&j.taskId===installScope.nativeTaskId&&j.started===true&&j.restored===true&&j.phase==='restored','REPAIR_INSTALL_NATIVE_NOT_RESTORED');return j;}

export const storedNativeReadProgram=String.raw`
import sqlite3,json,hashlib,datetime
def need(v,c):
 if not v:raise RuntimeError(c)
need(p['runId']=='5c8034046a05b0db89edebbb0e2c6876efb5882f' and p['taskId']=='580888fe-8edc-40a0-b6a3-46124d119870' and p['workspace']=='/home/superopen/All-Projects/msf-main-repair-r26/source','REPAIR_INSTALL_STORED_READ_SCOPE_CHANGED')
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True,timeout=10)
try:
 row=c.execute('SELECT json,status,agent_id FROM execution_runs WHERE id=?',(p['runId'],)).fetchone();need(row is not None,'REPAIR_INSTALL_STORED_RUN_MISSING')
 raw,status,agent_id=row;v=json.loads(raw)
 need(v.get('id')==p['runId'] and v.get('taskId')==p['taskId'] and v.get('objectId')==p['taskId'] and v.get('projectId')==p['projectId'] and v.get('machineId')==p['machineId'] and v.get('workspace')==p['workspace'] and v.get('executorId')==p['templateId'] and agent_id==p['nodeAgentId'] and v.get('scope')=='personal','REPAIR_INSTALL_STORED_RUN_SCOPE_CHANGED')
 result=v.get('result') or {};partial=p.get('allowPartialTerminal') is True and status=='round-limit' and result.get('outcome')=='round-limit'
 need(((status=='succeeded' and result.get('outcome')=='success') or partial) and result.get('source')=='signed-agent' and result.get('exitCode')==0 and result.get('lateEvidenceOnly') is not True and v.get('stopRequested') is not True and result.get('validation') is None,'REPAIR_INSTALL_STORED_NATIVE_NOT_TERMINAL')
 print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':status,'scope':{**{k:v.get(k) for k in ['id','taskId','objectId','projectId','machineId','workspace','executorId','scope']},'agentId':agent_id},'result':result,'frozenTemplate':v['template'],'storedRecordSHA256':hashlib.sha256(raw.encode()).hexdigest(),'ingestedSignedAgentReceipt':True,'signatureVerifierReexecuted':False,'publicResultExported':False}))
finally:c.close()
`;
export const rootConfigReadProgram=String.raw`
import os,stat,json,hashlib,base64
from pathlib import Path
def read(path):
 q=Path(path)
 for part in [q,*q.parents]:
  s=part.lstat()
  if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('REPAIR_INSTALL_CONFIG_UNTRUSTED')
 fd=os.open(q,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(fd)
  if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or not 0<s.st_size<=2097152:raise RuntimeError('REPAIR_INSTALL_CONFIG_INVALID')
  with os.fdopen(fd,'rb',closefd=False) as f:b=f.read(2097153)
  a=os.fstat(fd)
  if len(b)!=s.st_size or (s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_size,s.st_mtime_ns,s.st_ctime_ns)!=(a.st_dev,a.st_ino,a.st_mode,a.st_uid,a.st_size,a.st_mtime_ns,a.st_ctime_ns):raise RuntimeError('REPAIR_INSTALL_CONFIG_CHANGED')
  return {'sha256':hashlib.sha256(b).hexdigest(),'base64':base64.b64encode(b).decode()}
 finally:os.close(fd)
print(json.dumps({'baseline':read('/etc/jarvis-development/project-autonomy/baseline.json'),'policy':read('/etc/jarvis-development/project-autonomy/FA-01.json'),'rootTrustedRead':True,'publicConfigExported':False}))
`;

/** Actual API task/run plus root stored frozen template/result, fixed host and root policy bytes. */
export async function collectRepairVerifierEvidence(j,d,{allowPartialTerminal=false}={}){
 assertInstallJournal(j);const get=async path=>(await d.api(path)).data;
 // Attach every outcome handler before starting an adapter: SSH adapters can
 // throw synchronously while API requests still need the scoped login alive.
 const readers=[()=>get('/api/v1/tasks/'+j.taskId),()=>get('/api/v1/execution/runs/'+j.runId),()=>get('/api/v1/execution/config'),()=>get('/api/v1/projects/'+S.projectId+'/autonomy'),()=>get('/api/v1/execution/supervision'),()=>d.nodeState(),()=>d.queueState()];
 const settled=await Promise.allSettled(readers.map(read=>Promise.resolve().then(read)));
 const rejected=settled.find(result=>result.status==='rejected');if(rejected)throw rejected.reason;
 const values=settled.map(result=>result.value);
 const [task,run,config,profile,global,node,queue]=values;assertActualRun(run,task,j);
 need(sha(profile)===j.initialProfileSHA&&profile.goalSpecHash===S.goalSHA&&profile.config?.costPolicy==='record-only'&&global.supervised===false&&global.stopped===false,'REPAIR_INSTALL_AUTHORIZED_SCOPE_CHANGED');
 const matches=config.templates?.filter(t=>t.id===S.templateId);need(matches?.length===1,'REPAIR_INSTALL_CENTRAL_TEMPLATE_INVALID');
 const stored=await d.readPrimary({runId:j.runId,taskId:j.taskId,projectId:S.projectId,machineId:S.machineId,workspace:S.workspace,templateId:S.templateId,nodeAgentId:j.nodeAgentId,allowPartialTerminal:allowPartialTerminal===true},storedNativeReadProgram);
 need(stored.status===run.status&&stored.ingestedSignedAgentReceipt===true&&same(stored.result,run.result)&&sha(stored.frozenTemplate)===j.templateSHA&&H.test(stored.storedRecordSHA256??''),'REPAIR_INSTALL_STORED_NATIVE_BINDING_CHANGED');
 for(const key of ['id','taskId','objectId','projectId','machineId','workspace','executorId','agentId','scope'])need(stored.scope?.[key]===run[key],'REPAIR_INSTALL_STORED_NATIVE_SCOPE_CHANGED');
 const host=await readRepairVerifierHost(j,d.readRoot),roots=await d.readRoot({},rootConfigReadProgram);
 const e={schemaVersion:1,kind:'software-factory-repair-verifier-input',observedAt:new Date(d.now()).toISOString(),journal:j,task,run,node,queue,central:matches[0],host,terminalRead:{observedAt:stored.observedAt,ingestedSignedAgentReceipt:true,runRecordSHA256:sha(run),resultSHA256:sha(stored.result),frozenRunTemplateSHA256:sha(stored.frozenTemplate),storedRecordSHA256:stored.storedRecordSHA256}};
 need(roots.rootTrustedRead===true&&roots.baseline.sha256===V.oldBaselineSHA&&roots.policy.sha256===V.oldPolicySHA,'REPAIR_INSTALL_OLD_CONFIG_BINDING_CHANGED');
 const baseline=Buffer.from(roots.baseline.base64,'base64'),policy=Buffer.from(roots.policy.base64,'base64');
 need(sha(baseline)===roots.baseline.sha256&&sha(policy)===roots.policy.sha256,'REPAIR_INSTALL_OLD_CONFIG_BYTES_CHANGED');
 return {e,binding:assertRepairBinding(e,{now:d.now(),allowPartialTerminal}),baseline,policy};
}

export function repairVerifierInstallProgram(){
 let body=repairVerifierHostReadProgram();const at=body.lastIndexOf('print(json.dumps(');need(at>0,'REPAIR_INSTALL_HOST_TEMPLATE_CHANGED');body=body.slice(0,at);
 return body+String.raw`
import base64
need(os.geteuid()==0,'REPAIR_INSTALL_ROOT_REQUIRED');os.umask(0o077)
need(p['workspace']=='/home/superopen/All-Projects/msf-main-repair-r26/source' and p['source']=='/home/superopen/All-Projects/msf' and p['mode']=='inspect','REPAIR_INSTALL_FIXED_SCOPE_CHANGED')
need(p['binding']['runId']=='5c8034046a05b0db89edebbb0e2c6876efb5882f' and p['binding']['taskId']=='580888fe-8edc-40a0-b6a3-46124d119870' and p['binding']['productAccepted'] is False,'REPAIR_INSTALL_NATIVE_BINDING_CHANGED')
need((p['binding']['partialNative'] is False and p['binding']['nativeStatus']=='succeeded' and p['binding']['nativeOutcome']=='success') or (p.get('allowPartialTerminal') is True and p['binding']['partialNative'] is True and p['binding']['nativeStatus']=='round-limit' and p['binding']['nativeOutcome']=='round-limit'),'REPAIR_INSTALL_PARTIAL_TERMINAL_OPTIN_REQUIRED')
need(candidate_after['sha256']==p['binding']['candidateFingerprint'] and candidate_after['metadataSHA']==p['binding']['candidateMetadataSHA256'] and hashlib.sha256(origin_bytes).hexdigest()==p['binding']['originSHA256'] and main_after==p['expectedSource'],'REPAIR_INSTALL_SOURCE_PIN_CHANGED')
need(immutable_after==p['expectedImmutable'] and tools==p['fixedTools'] and not node_after['children'] and not any(node_after['counts'].values()),'REPAIR_INSTALL_OLD_FILES_OR_ACK_CHANGED')
# Read the private node template again; only the restored native template may exist.
node_cfg=Path('/var/lib/jarvis-development/101/config.json')
for q in [node_cfg,*node_cfg.parents]:need(not q.is_symlink(),'REPAIR_INSTALL_NODE_CONFIG_UNTRUSTED')
def node_read():
 fd=os.open(node_cfg,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid in [0,account.pw_uid] and not s.st_mode&0o077 and 0<s.st_size<=2097152,'REPAIR_INSTALL_NODE_CONFIG_UNTRUSTED')
  with os.fdopen(fd,'rb',closefd=False) as f:data=f.read(2097153)
  a=os.fstat(fd);key=lambda x:(x.st_dev,x.st_ino,x.st_uid,x.st_gid,x.st_mode,x.st_nlink,x.st_size,x.st_mtime_ns,x.st_ctime_ns)
  need(key(s)==key(a) and len(data)==s.st_size,'REPAIR_INSTALL_NODE_CONFIG_READ_CHANGED');return data,key(a)
 finally:os.close(fd)
node_bytes,node_identity=node_read();cfg=json.loads(node_bytes);templates=[x for x in cfg['templates'] if x.get('id')==p['templateId']]
need(cfg.get('machineId')==p['machineId'] and cfg.get('agentId')==p['agentId'] and templates==[p['originalTemplate']],'REPAIR_INSTALL_NODE_TEMPLATE_NOT_RESTORED')
root=Path('/etc/jarvis-development/main-acceptance-r26-repair');evidence=Path('/var/lib/jarvis-development/101/main-acceptance-r26-repair');entry=Path('/usr/local/libexec/jarvis-msf-main-acceptance-r26-repair');rule=Path('/etc/sudoers.d/jarvis-main-acceptance-r26-repair')
payloads=p['installationFiles'];expected_paths=[str(entry),str(root/'baseline.json'),str(root/'policy.json')]
need([item['path'] for item in payloads]==expected_paths and [item['mode'] for item in payloads]==[0o755,0o600,0o600],'REPAIR_INSTALL_PAYLOAD_SCOPE_CHANGED')
decoded=[]
for item in payloads:
 data=base64.b64decode(item['body'],validate=True);need(hashlib.sha256(data).hexdigest()==item['sha256'],'REPAIR_INSTALL_PAYLOAD_HASH_CHANGED');decoded.append(data)
wrapper=decoded[0].decode();fp=p['binding']['candidateFingerprint']
need("WORKSPACE = '/home/superopen/All-Projects/msf-main-repair-r26/source'" in wrapper and "SOURCE_SHA256 = '"+fp+"'" in wrapper and "ENTRY = '"+str(entry)+"'" in wrapper,'REPAIR_INSTALL_WRAPPER_PIN_CHANGED')
baseline=json.loads(decoded[1]);policy=json.loads(decoded[2])
need(baseline['workspace']==p['workspace'] and baseline['sourceFingerprintObserved']==fp and policy['workspace']==p['workspace'] and policy['sourceFingerprint']==fp and policy['evidenceRoot']==str(evidence),'REPAIR_INSTALL_CONFIG_PIN_CHANGED')
need(len(baseline['requiredTestFiles'])==45 and len(baseline['requiredPrototypeSuites'])==30 and baseline['minimumCoverage']['lines']>=90 and baseline['minimumCoverage']['branches']>=80,'REPAIR_INSTALL_DENOMINATOR_CHANGED')
rule_bytes=b'superopen ALL=(root) NOPASSWD: /usr/local/libexec/jarvis-msf-main-acceptance-r26-repair *\n'
check=subprocess.run(['/usr/sbin/visudo','-cf','-'],input=rule_bytes,capture_output=True,timeout=15);need(check.returncode==0,'REPAIR_INSTALL_SUDO_RULE_INVALID')
def directory(q):
 trusted(q.parent)
 if not os.path.lexists(q):os.mkdir(q,0o700)
 trusted(q);s=q.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_mode&0o777==0o700,'REPAIR_INSTALL_DIRECTORY_UNTRUSTED')
def put(q,data,mode):
 trusted(q.parent)
 if os.path.lexists(q):
  trusted(q);s=q.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_mode&0o777==mode and private_read(q,2097152)==data,'REPAIR_INSTALL_EXISTING_FILE_CONFLICT');return
 fd=os.open(q,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 try:
  view=memoryview(data)
  while view:
   n=os.write(fd,view);need(n>0,'REPAIR_INSTALL_SHORT_WRITE');view=view[n:]
  os.fsync(fd);os.fchmod(fd,mode)
 finally:os.close(fd)
 trusted(q);need(private_read(q,2097152)==data,'REPAIR_INSTALL_TRANSFER_CHANGED')
 parentfd=os.open(q.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(parentfd)
 finally:os.close(parentfd)
directory(root);directory(evidence)
for item,data in zip(payloads,decoded):put(Path(item['path']),data,item['mode'])
# Authority is made available last, only after exact body readback.
put(rule,rule_bytes,0o440)
need(subprocess.run(['/usr/sbin/visudo','-cf',str(rule)],capture_output=True,timeout=15).returncode==0,'REPAIR_INSTALL_SUDO_READBACK_INVALID')
final_main,_=source_state(p['source']);final_candidate,_=source_state(p['workspace'])
need(final_main==main_after and final_candidate==candidate_after,'REPAIR_INSTALL_SOURCE_CHANGED_AFTER_PUT')
need(immutable()==immutable_after and {name:hashlib.sha256(private_read(tools_dir/name)).hexdigest() for name in p['fixedTools']}==tools,'REPAIR_INSTALL_OLD_FILES_CHANGED_AFTER_PUT')
need(private_read(prep/'origin.json')==origin_bytes and node_read()==(node_bytes,node_identity) and quiet()==node_after,'REPAIR_INSTALL_ORIGIN_OR_NODE_CHANGED_AFTER_PUT')
parent_final=h.open_directory(p['parent'])
try:need(identity(parent_final)==origin['parentIdentity'],'REPAIR_INSTALL_PARENT_CHANGED_AFTER_PUT')
finally:os.close(parent_final)
print(json.dumps({'observedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'installed':True,'partialNative':p['binding']['partialNative'],'nativeStatus':p['binding']['nativeStatus'],'nativeOutcome':p['binding']['nativeOutcome'],'entry':str(entry),'configRoot':str(root),'evidenceRoot':str(evidence),'sudoRule':str(rule),'wrapperSHA256':hashlib.sha256(decoded[0]).hexdigest(),'sourceFingerprint':final_candidate['sha256'],'sourceMetadataSHA256':final_candidate['metadataSHA'],'originSHA256':hashlib.sha256(origin_bytes).hexdigest(),'oldFilesUnchanged':True,'mainSourceUnchanged':True,'nodeACKIdle':True,'nodeTemplateRestored':True,'visudoVerified':True,'modelsInvoked':False,'validationDispatched':False,'productAccepted':False}))
`;
}

export async function installRepairVerifier({execute=false,allowPartialTerminal=false}={},d){
 const raw=await d.readLocal(S.journalPath,'utf8'),j=assertInstallJournal(JSON.parse(raw));
 const first=await collectRepairVerifierEvidence(j,d,{allowPartialTerminal}),original=await d.readLocal('scripts/factory-main-acceptance-wrapper-r26-4.py');
 const prepared=prepareRepairVerifier(first.e,original,first.baseline,first.policy,{now:d.now(),allowPartialTerminal});
const summary={schemaVersion:1,kind:'software-factory-repair-fixed-verifier-installation',execute,allowPartialTerminal:allowPartialTerminal===true,partialNative:first.binding.partialNative,nativeStatus:first.binding.nativeStatus,nativeOutcome:first.binding.nativeOutcome,projectId:S.projectId,nativeTaskId:j.taskId,nativeRunId:j.runId,scope:{source:S.source,workspace:S.workspace,job:j.job,entry:V.entry,configRoot:V.configRoot,evidenceRoot:V.evidenceRoot,sudoRule:V.sudoRule},fixedTools:fixedToolSHA,coordinatorPatch:{version:'r26-4-summary-scan',originalSHA256:fixedToolSHA['project-autonomy-fa01-coordinator.py']},binding:first.binding,wrapperSHA256:prepared.manifest.wrapperSHA256,installerImplemented:true,installed:false,fullValidationExecuted:false,productAccepted:false,modelsInvoked:false,validationDispatched:false,privateJournalExported:false,publicResultExported:false};
 try{
 if(!execute)return {...summary,ready:true,remoteMutationsPerformed:false};
 // Re-read the journal and every independent evidence source before first mutation.
 const again=await d.readLocal(S.journalPath,'utf8');need(again===raw,'REPAIR_INSTALL_JOURNAL_CHANGED');
 const second=await collectRepairVerifierEvidence(j,d,{allowPartialTerminal});need(same(first.binding,second.binding)&&same(first.e.host.immutableAfter,second.e.host.immutableAfter)&&same(first.e.host.source,second.e.host.source)&&same(first.e.host.candidate,second.e.host.candidate),'REPAIR_INSTALL_PREINSTALL_EVIDENCE_CHANGED');
 const installationFiles=[[V.entry,prepared.wrapper,0o755],[V.configRoot+'/baseline.json',JSON.stringify(prepared.config.baseline,null,2)+'\n',0o600],[V.configRoot+'/policy.json',JSON.stringify(prepared.config.policy,null,2)+'\n',0o600]].map(([path,body,mode])=>({path,body:Buffer.from(body).toString('base64'),mode,sha256:sha(body)}));
 const installed=await d.installRoot({...S,mode:'inspect',allowPartialTerminal:allowPartialTerminal===true,job:j.job,agentId:j.nodeAgentId,sourcePaths:[],fixedTools:fixedToolSHA,binding:first.binding,expectedSource:first.e.host.source,expectedImmutable:first.e.host.immutableAfter,originalTemplate:j.originalTemplate,installationFiles},repairVerifierInstallProgram());
 need(installed.installed===true&&installed.partialNative===first.binding.partialNative&&installed.nativeStatus===first.binding.nativeStatus&&installed.nativeOutcome===first.binding.nativeOutcome&&installed.entry===V.entry&&installed.configRoot===V.configRoot&&installed.evidenceRoot===V.evidenceRoot&&installed.sudoRule===V.sudoRule&&installed.wrapperSHA256===prepared.manifest.wrapperSHA256&&installed.sourceFingerprint===first.binding.candidateFingerprint&&installed.sourceMetadataSHA256===first.binding.candidateMetadataSHA256&&installed.originSHA256===first.binding.originSHA256&&installed.oldFilesUnchanged===true&&installed.mainSourceUnchanged===true&&installed.nodeACKIdle===true&&installed.nodeTemplateRestored===true&&installed.visudoVerified===true&&installed.productAccepted===false,'REPAIR_INSTALL_ROOT_READBACK_INVALID');
 const third=await collectRepairVerifierEvidence(j,d,{allowPartialTerminal});need(same(first.binding,third.binding)&&same(first.e.host.immutableAfter,third.e.host.immutableAfter),'REPAIR_INSTALL_POSTINSTALL_EVIDENCE_CHANGED');
 return {...summary,installed:true,rootReadback:installed,remoteMutationsPerformed:true,independentFullValidationRequired:true};
 }catch(error){error.verifierBinding=first.binding;throw error;}
}
export function safeInstallFailure(error,execute,allowPartialTerminal=false){const m=String(error?.message??'');return {schemaVersion:1,kind:'software-factory-repair-fixed-verifier-installation',errorCode:/^(REPAIR_INSTALL|REPAIR_VERIFIER|MAIN_REPAIR)_[A-Z0-9_]+$/.test(m)?m:'REPAIR_INSTALL_OPERATION_FAILED',failed:true,execute,allowPartialTerminal:allowPartialTerminal===true,partialNative:error.verifierBinding?.partialNative??null,nativeStatus:error.verifierBinding?.nativeStatus??null,nativeOutcome:error.verifierBinding?.nativeOutcome??null,installed:false,installationState:execute?'unconfirmed; preserve any exclusively created new files for read-only reconciliation':'not-attempted',automaticRetry:false,rawErrorExported:false,privateJournalExported:false,publicResultExported:false,modelsInvoked:false,validationDispatched:false,productAccepted:false};}
async function safeLocalRead(path,encoding){const st=await lstat(path);need(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.size<=4*1024*1024,'REPAIR_INSTALL_LOCAL_FILE_INVALID');return readFile(path,encoding);}
export const defaultReadRoot=(p,program)=>JSON.parse(remote(lanProfile,'jarvis-101',python(p,program),true,{timeoutMs:180000}));
export const defaultReadPrimary=(p,program)=>JSON.parse(primary(python(p,program)));
export async function cliMain(args){need(args.length<=2&&new Set(args).size===args.length&&args.every(v=>['inspect','--execute','--allow-partial-terminal'].includes(v))&&!(args.includes('inspect')&&args.includes('--execute')),'REPAIR_INSTALL_FIXED_ARGUMENTS_REQUIRED');const execute=args.includes('--execute'),allowPartialTerminal=args.includes('--allow-partial-terminal');let result;
 try{result=await withPlatform(({api})=>installRepairVerifier({execute,allowPartialTerminal},{api,readLocal:safeLocalRead,readPrimary:defaultReadPrimary,readRoot:defaultReadRoot,installRoot:defaultReadRoot,nodeState,queueState,now:Date.now}));}catch(error){result=safeInstallFailure(error,execute,allowPartialTerminal);process.exitCode=1;}
 const dir=resolve('artifacts/software-factory/acceptance-r26');await mkdir(dir,{recursive:true});const path=resolve(dir,'repair-fixed-verifier-'+(execute?'installation':'inspection')+'-'+randomUUID()+'.json');const handle=await open(path,'wx',0o600);try{await handle.writeFile(JSON.stringify(result,null,2)+'\n');await handle.sync();}finally{await handle.close();}return {output:path,...result};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(await cliMain(process.argv.slice(2))));}catch(error){console.error(JSON.stringify(safeInstallFailure(error,process.argv.includes('--execute'),process.argv.includes('--allow-partial-terminal'))));process.exitCode=1;}}
