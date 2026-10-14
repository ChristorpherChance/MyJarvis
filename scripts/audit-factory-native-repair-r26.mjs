/** Explicit read-only candidate audit. Importing performs no IO or remote access. */
import {readFile,mkdir,open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {withPlatform,remote,primary,lanProfile,python} from './managed-server-client.mjs';
import {nodeState,queueState} from './run-factory-supervision-probe.mjs';
import {assertJournal,assertActualRun,repairScope,canonical,sha,safeFailureCode} from './run-factory-main-repair-r26.mjs';

const S=repairScope,H=/^[a-f0-9]{64}$/;
const terminal=new Set(['succeeded','failed','cancelled','timeout','interrupted','round-limit','budget-exhausted','awaiting-cost']);
const need=(value,code)=>{if(!value)throw Error(code);};
const same=(a,b)=>canonical(a)===canonical(b);
export const auditReportPath='doc/repair/r26-report.md';
export const auditToolHashes=Object.freeze({
 'project-autonomy-fa01-coordinator.py':'f60c3e88056515e41bd0486285809b2342d783f21e225f9ffc64c3d96477740b',
 'project-autonomy-fa01-collector.mjs':'a6cc30f63134fdc6d5be4aaba6049b99c0920c0db3e89b612d607b7991e647b7',
 'project-autonomy-evidence.py':S.helperSHA,
 'project-autonomy-fa01-browser.mjs':'4836a22a44155ad0a1bc2beedf18e2efb0c52aa57baa1c3c1cb735e47fbbada0',
 'factory-sandbox-broker-control.py':'43afea4244f741bbaa3b4d347304c51e6886b8533aceb04967a439de0a4d3dbd',
 'factory-sandbox-broker.py':'d4bcec4e88990e45c82d76574fe7c8de8eebd1db239cedceefd95a6b204d1954'
});
export function assertAuditReady(j,run,task){
 assertJournal(j);
 need(j.baseline.version==='r26-4'&&j.started===true&&j.restored===true&&j.phase==='restored'&&Number.isFinite(Date.parse(j.restoredAt))&&j.copy?.originBound===true&&j.copy.candidate?.sha256===S.baselineSHA&&j.copy.candidate.files===S.files,'MAIN_REPAIR_AUDIT_RESTORATION_REQUIRED');
 need(j.sourceBefore?.sha256===S.baselineSHA&&j.sourceBefore.files===S.files&&H.test(j.sourceBefore.metadataSHA??'')&&same(j.sourceBefore,j.sourceAfter)&&same(j.sourceBefore,j.copy.source),'MAIN_REPAIR_AUDIT_MAIN_HISTORY_CHANGED');
 assertActualRun(run,task,j);
 need(terminal.has(run.status)&&run.agentId===j.nodeAgentId&&run.result?.source==='signed-agent'&&(run.result.lateEvidenceOnly!==true||run.status==='cancelled'),'MAIN_REPAIR_AUDIT_SIGNED_TERMINAL_REQUIRED');
 need(run.result.validation===null||run.result.validation===undefined,'MAIN_REPAIR_AUDIT_UNEXPECTED_VALIDATION');
 return j;
}
export function publicRepairReport(text){
 need(typeof text==='string'&&Buffer.byteLength(text)<=65536&&!text.includes('\u0000'),'MAIN_REPAIR_AUDIT_PUBLIC_REPORT_INVALID');
 need(!/(?:api[_ -]?key|authorization|password|passwd|secret|access[_-]?token|cookie|密码|密钥|令牌)[\x22\x27\x60]?\s*[:=：]\s*\S+|\bBearer\s+[A-Za-z0-9._~+\/-]{12,}|--(?:token|secret|password|api-key)\s+\S+|\b(?:sk|ghp|github_pat)[_-][A-Za-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:^|[\\/])(?:\.secrets|\.jarvis-dev|credentials|recordings|sessions)(?:[\\/]|$)|\.env(?:\b|\.)/im.test(text),'MAIN_REPAIR_AUDIT_REPORT_PRIVATE_CONTENT_REFUSED');
 return text;
}
export function parseAuditArguments(args){
 need(args.length===0||args.length===1&&args[0]==='--include-report','MAIN_REPAIR_AUDIT_ARGUMENT_INVALID');
 return {includeReport:args.length===1};
}

// Only trusted helper bytes are compiled. Product files are descriptor-read and hashed.
export const auditHostProgram=String.raw`
import os,sys,stat,pwd,json,hashlib,sqlite3,subprocess,signal
from pathlib import Path
from types import ModuleType
sys.dont_write_bytecode=True
def need(v,c):
 if not v:raise RuntimeError(c)
def deadline(signum,frame):raise RuntimeError('MAIN_REPAIR_AUDIT_HOST_TIMEOUT')
signal.signal(signal.SIGALRM,deadline);signal.alarm(150)
def private_read(path,limit=2097152):
 q=Path(path)
 for part in [q,*q.parents]:
  s=part.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'MAIN_REPAIR_AUDIT_ROOT_CHAIN_UNTRUSTED')
 fd=os.open(q,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and 0<s.st_size<=limit,'MAIN_REPAIR_AUDIT_PRIVATE_FILE_INVALID')
  data=b''
  while len(data)<=limit:
   piece=os.read(fd,min(65536,limit+1-len(data)))
   if not piece:break
   data+=piece
  a=os.fstat(fd);need((s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)==(a.st_dev,a.st_ino,a.st_uid,a.st_gid,a.st_mode,a.st_nlink,a.st_size,a.st_mtime_ns,a.st_ctime_ns) and len(data)==s.st_size,'MAIN_REPAIR_AUDIT_PRIVATE_FILE_CHANGED')
  return data
 finally:os.close(fd)
tool=Path('/opt/jarvis-development/software-factory/project-autonomy-evidence.py');body=private_read(tool)
need(hashlib.sha256(body).hexdigest()==p['helperSHA'],'MAIN_REPAIR_AUDIT_HELPER_CHANGED')
h=ModuleType('audit_public_source');exec(compile(body,str(tool),'exec'),h.__dict__)
def identity(fd):
 s=os.fstat(fd);return {'device':s.st_dev,'inode':s.st_ino}
def fingerprint_fd(fd):
 manifest=[];h.walk(fd,manifest)
 value=''.join(v['path']+'\0'+v['sha256']+'\n' for v in manifest).encode('utf-8')
 return {'sha256':hashlib.sha256(value).hexdigest(),'files':len(manifest),'bytes':sum(v['bytes'] for v in manifest),'manifest':manifest}
def source_state(fd):
 first=fingerprint_fd(fd);meta=[]
 for e in first['manifest']:
  f=h.open_relative(fd,e['path'])
  try:
   s=os.fstat(f);meta.append([e['path'],s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns])
  finally:os.close(f)
 second=fingerprint_fd(fd);need(first==second,'MAIN_REPAIR_AUDIT_SOURCE_READ_CHANGED')
 return {'sha256':first['sha256'],'files':first['files'],'bytes':first['bytes'],'metadataSHA':hashlib.sha256(json.dumps(meta,separators=(',',':')).encode()).hexdigest(),'stable':True,'identity':identity(fd)},first
def quiet():
 unit=dict(x.split('=',1) for x in subprocess.check_output(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,MainPID'],text=True,timeout=10).splitlines() if '=' in x)
 pid=int(unit.get('MainPID',0));need(pid>1 and unit.get('ActiveState')=='active','MAIN_REPAIR_AUDIT_NODE_NOT_ACTIVE')
 def proc(q):
  raw=(q/'stat').read_text();v=raw[raw.rfind(')')+2:].split();return int(v[1]),v[19]
 initial=proc(Path('/proc')/str(pid));children=[]
 for q in Path('/proc').iterdir():
  if not q.name.isdigit():continue
  try:
   if proc(q)[0]==pid:children.append(int(q.name))
  except (FileNotFoundError,PermissionError,ProcessLookupError):pass
 journal=Path('/var/lib/jarvis-development/101')/('.delivery-'+p['agentId'])/'journal.sqlite'
 for q in [journal,*journal.parents]:need(not q.is_symlink(),'MAIN_REPAIR_AUDIT_DELIVERY_PATH_UNTRUSTED')
 s=journal.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1,'MAIN_REPAIR_AUDIT_DELIVERY_PATH_UNTRUSTED')
 c=sqlite3.connect('file:'+str(journal)+'?mode=ro',uri=True,timeout=10)
 try:counts={'runs':c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0],'deliveries':c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0],'logs':c.execute('SELECT count(*) FROM logs').fetchone()[0]}
 finally:c.close()
 need(initial==proc(Path('/proc')/str(pid)) and not children and not any(counts.values()),'MAIN_REPAIR_AUDIT_NODE_NOT_IDLE')
 return {'pid':pid,'start':initial[1],'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'children':children,'counts':counts,'active':True}
idle_before=quiet()
originRaw=private_read('/var/lib/jarvis-development/101/main-repair-r26-preparation/origin.json');origin=json.loads(originRaw)
need(origin.get('version')==1 and origin.get('phase')=='ready' and origin.get('job')==p['job'] and origin.get('workspace')==p['workspace'] and origin.get('parent')==p['parent'] and origin.get('baselineSHA')==p['baselineSHA'],'MAIN_REPAIR_AUDIT_ORIGIN_CHANGED')
account=pwd.getpwnam('superopen');main=h.open_directory(p['source']);parent=h.open_directory(p['parent']);candidate=None
try:
 s=os.fstat(parent);need(identity(parent)==origin.get('parentIdentity') and s.st_uid==account.pw_uid and s.st_gid==account.pw_gid and s.st_mode&0o077==0,'MAIN_REPAIR_AUDIT_PARENT_CHANGED')
 candidate=os.open('source',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
 s=os.fstat(candidate);need(identity(candidate)==origin.get('identity')==p['candidateIdentity'] and s.st_uid==account.pw_uid and s.st_gid==account.pw_gid and s.st_mode&0o077==0,'MAIN_REPAIR_AUDIT_COPY_CHANGED')
 main_before,baseline=source_state(main);need(main_before==p['sourceBefore'] and main_before['sha256']==p['baselineSHA'] and main_before['files']==p['files'],'MAIN_REPAIR_AUDIT_MAIN_CHANGED')
 before,actual=source_state(candidate)
 tools=[]
 for name,expected in p['toolHashes'].items():
  observed=hashlib.sha256(private_read('/opt/jarvis-development/software-factory/'+name)).hexdigest()
  need(observed==expected,'MAIN_REPAIR_AUDIT_FIXED_TOOL_CHANGED');tools.append({'path':name,'sha256':observed,'unchanged':True})
 report_entry=next((v for v in actual['manifest'] if v['path']==p['reportPath']),None);report_text=None
 if report_entry and p['includeReport']:
  f=h.open_relative(candidate,p['reportPath'])
  try:report_bytes=h.read_fd(f,65536)
  finally:os.close(f)
  need(hashlib.sha256(report_bytes).hexdigest()==report_entry['sha256'],'MAIN_REPAIR_AUDIT_REPORT_CHANGED');report_text=report_bytes.decode('utf-8')
 after,_=source_state(candidate);main_after,_=source_state(main)
 need(before==after and main_before==main_after,'MAIN_REPAIR_AUDIT_FILES_CHANGED_DURING_READ')
 for path,expected in [(p['source'],identity(main)),(p['parent'],identity(parent)),(p['workspace'],identity(candidate))]:
  f=h.open_directory(path)
  try:need(identity(f)==expected,'MAIN_REPAIR_AUDIT_PATH_REPLACED')
  finally:os.close(f)
 need(private_read('/var/lib/jarvis-development/101/main-repair-r26-preparation/origin.json')==originRaw and quiet()==idle_before,'MAIN_REPAIR_AUDIT_IDLE_OR_ORIGIN_CHANGED')
 old={v['path']:v for v in baseline['manifest']};new={v['path']:v for v in actual['manifest']};changes=[]
 for path in sorted(set(old)|set(new)):
  a=old.get(path);b=new.get(path)
  if a and b and a['sha256']==b['sha256']:continue
  changes.append({'path':path,'change':'added' if a is None else 'deleted' if b is None else 'modified','beforeSHA256':a['sha256'] if a else None,'afterSHA256':b['sha256'] if b else None,'beforeBytes':a['bytes'] if a else None,'afterBytes':b['bytes'] if b else None})
 print(json.dumps({'helperVerified':True,'mainBefore':main_before,'mainAfter':main_after,'candidateBefore':before,'candidateAfter':after,'originBound':True,'originSHA256':hashlib.sha256(originRaw).hexdigest(),'changes':changes,'tools':tools,'repairReport':{'path':p['reportPath'],'present':bool(report_entry),'sha256':report_entry['sha256'] if report_entry else None,'bytes':report_entry['bytes'] if report_entry else None,'content':report_text},'idle':idle_before,'privateFilesExported':False,'rawLogsExported':False,'productCodeExecuted':False,'modelsInvoked':False,'containersStarted':False,'mutationsPerformed':False}))
finally:
 if candidate is not None:os.close(candidate)
 os.close(parent);os.close(main)
`;

export function assertHostAudit(host,j,{includeReport=false}={}){
 need(host?.helperVerified===true&&host.originBound===true&&H.test(host.originSHA256??'')&&same(host.mainBefore,j.sourceBefore)&&same(host.mainBefore,host.mainAfter)&&same(host.candidateBefore,host.candidateAfter)&&same(host.candidateBefore?.identity,j.copy.candidate.identity)&&host.candidateBefore?.stable===true&&H.test(host.candidateBefore?.sha256??'')&&H.test(host.candidateBefore?.metadataSHA??'')&&Number.isSafeInteger(host.candidateBefore.files)&&host.candidateBefore.files>0&&host.candidateBefore.files<=20000,'MAIN_REPAIR_AUDIT_HOST_BINDING_INVALID');
 need(host.idle?.active===true&&Array.isArray(host.idle.children)&&host.idle.children.length===0&&['runs','deliveries','logs'].every(k=>host.idle.counts?.[k]===0),'MAIN_REPAIR_AUDIT_NODE_NOT_IDLE');
 need(Array.isArray(host.tools)&&host.tools.length===6&&new Set(host.tools.map(t=>t.path)).size===6&&host.tools.every(t=>auditToolHashes[t.path]===t.sha256&&t.unchanged===true),'MAIN_REPAIR_AUDIT_FIXED_TOOL_CHANGED');
 need(['privateFilesExported','rawLogsExported','productCodeExecuted','modelsInvoked','containersStarted','mutationsPerformed'].every(k=>host[k]===false)&&Array.isArray(host.changes)&&host.changes.length<=20000&&new Set(host.changes.map(c=>c.path)).size===host.changes.length,'MAIN_REPAIR_AUDIT_HOST_SCOPE_INVALID');
 for(const c of host.changes){
  need(typeof c.path==='string'&&c.path.length>0&&c.path.length<=2000&&!/[\u0000-\u001f\\]/.test(c.path)&&!c.path.startsWith('/')&&!c.path.split('/').includes('..')&&['added','deleted','modified'].includes(c.change),'MAIN_REPAIR_AUDIT_CHANGE_INVALID');
  need(c.change==='added'?c.beforeSHA256===null&&H.test(c.afterSHA256??''):c.change==='deleted'?H.test(c.beforeSHA256??'')&&c.afterSHA256===null:H.test(c.beforeSHA256??'')&&H.test(c.afterSHA256??'')&&c.beforeSHA256!==c.afterSHA256,'MAIN_REPAIR_AUDIT_CHANGE_INVALID');
 }
 need(host.candidateBefore.files===host.mainBefore.files+host.changes.filter(c=>c.change==='added').length-host.changes.filter(c=>c.change==='deleted').length,'MAIN_REPAIR_AUDIT_CHANGE_COUNTS_INVALID');
 need(host.repairReport?.path===auditReportPath&&typeof host.repairReport.present==='boolean'&&(!host.repairReport.present||H.test(host.repairReport.sha256??'')),'MAIN_REPAIR_AUDIT_REPORT_INVALID');
 if(includeReport&&host.repairReport.present){publicRepairReport(host.repairReport.content);need(sha(host.repairReport.content)===host.repairReport.sha256,'MAIN_REPAIR_AUDIT_REPORT_CHANGED');}
 else need(host.repairReport.content===null,'MAIN_REPAIR_AUDIT_REPORT_UNEXPECTED_CONTENT');
 return host;
}

export async function runNativeRepairAudit(options={},deps){
 const d={now:Date.now,...deps},j=assertJournal(JSON.parse(await d.readFile(S.journalPath,'utf8'))),get=async path=>(await d.api(path)).data;
 need(j.started===true&&j.restored===true&&j.phase==='restored','MAIN_REPAIR_AUDIT_RESTORATION_REQUIRED');
 const [run,task]=await Promise.all([get('/api/v1/execution/runs/'+j.runId),get('/api/v1/tasks/'+j.taskId)]);assertAuditReady(j,run,task);
 need(await d.runTemplateSHA(j.runId,j.taskId)===j.templateSHA,'MAIN_REPAIR_AUDIT_RUN_TEMPLATE_CHANGED');
 const quiet=async()=>{
  const [profile,global,config,queue,node]=await Promise.all([get('/api/v1/projects/'+S.projectId+'/autonomy'),get('/api/v1/execution/supervision'),get('/api/v1/execution/config'),d.queueState(),d.nodeState()]);
  need(sha(profile)===j.initialProfileSHA&&profile.goalSpecHash===S.goalSHA&&profile.config?.costPolicy==='record-only'&&global.supervised===false&&global.stopped===false,'MAIN_REPAIR_AUDIT_OLD_PROFILE_CHANGED');
  need(queue.fullTable===true&&queue.readOnly===true&&queue.allActive===0&&node.agentId===j.nodeAgentId&&node.unit?.ActiveState==='active'&&same(node.template,j.originalTemplate)&&same(config.templates.find(t=>t.id===S.templateId),j.originalTemplate),'MAIN_REPAIR_AUDIT_NOT_RESTORED_OR_IDLE');
 };
 await quiet();
 const host=assertHostAudit(await d.hostState(j,{includeReport:options.includeReport===true}),j,options);
 await quiet();
 const [afterRun,afterTask]=await Promise.all([get('/api/v1/execution/runs/'+j.runId),get('/api/v1/tasks/'+j.taskId)]);assertAuditReady(j,afterRun,afterTask);
 need(sha(afterRun.result)===sha(run.result)&&afterRun.status===run.status&&await d.runTemplateSHA(j.runId,j.taskId)===j.templateSHA,'MAIN_REPAIR_AUDIT_TERMINAL_CHANGED');
 const {content,...report}=host.repairReport;
 return {schemaVersion:1,kind:'software-factory-native-repair-independent-candidate-audit',observedAt:new Date(d.now()).toISOString(),projectId:S.projectId,taskId:j.taskId,runId:j.runId,baselineRunId:j.baseline.runId,workspace:S.workspace,terminal:{status:run.status,signedReceiptIngested:true,signatureVerifierReexecuted:false,resultSHA256:sha(run.result),outcome:run.result.outcome,exitCode:run.result.exitCode,lateEvidenceOnly:run.result.lateEvidenceOnly===true,stopRequested:run.stopRequested===true},main:{unchanged:true,before:host.mainBefore,after:host.mainAfter},candidate:{before:host.candidateBefore,after:host.candidateAfter,stableDuringAudit:true},origin:{bound:true,sha256:host.originSHA256},changes:host.changes,changeCounts:Object.fromEntries(['added','modified','deleted'].map(k=>[k,host.changes.filter(c=>c.change===k).length])),repairReport:{...report,modelClaimsIndependentlyVerified:false,...(options.includeReport&&report.present?{content}:{} )},fixedTools:host.tools,executorRestored:true,configurationVerificationScope:'target-template-and-agent-only',nodeIdleAndDeliveriesAcknowledged:true,oldProfileUnchanged:true,readOnly:true,modelExecutionOnly:true,partial:run.status!=='succeeded'||run.result.outcome!=='success'||run.result.exitCode!==0,productCodeExecuted:false,modelsInvoked:false,containersStarted:false,privateJournalExported:false,rawLogsExported:false,privateEnvironmentExported:false,productAccepted:false,independentProductValidationPerformed:false};
}

async function safeLocalRead(path,encoding){
 const before=await lstat(path);need(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.size<=4*1024*1024,'MAIN_REPAIR_AUDIT_LOCAL_FILE_INVALID');
 const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const s=await f.stat();need(s.ino===before.ino&&s.dev===before.dev&&s.isFile()&&s.nlink===1&&s.size===before.size&&s.size<=4*1024*1024,'MAIN_REPAIR_AUDIT_LOCAL_FILE_CHANGED');const raw=await f.readFile(encoding),after=await f.stat();need(s.size===after.size&&s.mtimeMs===after.mtimeMs&&s.ctimeMs===after.ctimeMs,'MAIN_REPAIR_AUDIT_LOCAL_FILE_CHANGED');return raw;}finally{await f.close();}
}
const runTemplateProgram=String.raw`
import sqlite3,json,hashlib
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True,timeout=10)
try:
 row=c.execute('SELECT json FROM execution_runs WHERE id=?',(p['runId'],)).fetchone()
 if row is None:raise RuntimeError('MAIN_REPAIR_AUDIT_RUN_MISSING')
 v=json.loads(row[0])
 if any(v.get(k)!=p[k] for k in ['id','projectId','machineId','workspace','taskId']):raise RuntimeError('MAIN_REPAIR_AUDIT_RUN_SCOPE_CHANGED')
 print(json.dumps({'sha256':hashlib.sha256(json.dumps(v['template'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()}))
finally:c.close()
`;
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let result;
 try{
  const options=parseAuditArguments(process.argv.slice(2));
  result=await withPlatform(({api})=>runNativeRepairAudit(options,{api,readFile:safeLocalRead,nodeState,queueState,
   runTemplateSHA:async(runId,taskId)=>JSON.parse(primary(python({runId,id:runId,taskId,projectId:S.projectId,machineId:S.machineId,workspace:S.workspace},runTemplateProgram))).sha256,
   hostState:async(j,o)=>JSON.parse(remote(lanProfile,'jarvis-101',python({...S,job:j.job,agentId:j.nodeAgentId,candidateIdentity:j.copy.candidate.identity,sourceBefore:j.sourceBefore,toolHashes:auditToolHashes,reportPath:auditReportPath,includeReport:o.includeReport},auditHostProgram),true,{timeoutMs:180000}))}));
 }catch(error){process.exitCode=1;result={schemaVersion:1,kind:'software-factory-native-repair-independent-candidate-audit',observedAt:new Date().toISOString(),failed:true,errorCode:safeFailureCode(error),readOnly:true,rawErrorExported:false,privateJournalExported:false,productAccepted:false};}
 await mkdir(S.artifactDirectory,{recursive:true});const output=S.artifactDirectory+'/native-repair-candidate-audit-'+Date.now()+'-'+randomUUID()+'.json',f=await open(output,'wx',0o644);
 try{await f.writeFile(JSON.stringify(result,null,2)+'\n');await f.sync();}finally{await f.close();}
 console.log(JSON.stringify({output,failed:result.failed===true,errorCode:result.errorCode??null,runId:result.runId??null,candidateFingerprint:result.candidate?.after.sha256??null,changeCounts:result.changeCounts??null,reportPresent:result.repairReport?.present??null,productAccepted:false}));
}
