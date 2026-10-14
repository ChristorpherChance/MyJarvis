/** Independent R29 native cleanup observation. Import performs no IO; no mutation dependency. */
import {mkdir,open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonical,sha,repairHostProgram} from './run-factory-main-repair-r26.mjs';
import {targetCopyR29Scope as S} from './prepare-factory-target-copy-r29.mjs';
import {targetRepairR29Template,targetRepairR29Payload,targetRepairR29StoredRunProgram} from './run-factory-target-repair-r29.mjs';
import {expectedRunId} from './verify-software-factory-execution.mjs';
import {safeReadLocal,settleEvidenceReads} from './factory-repair-evidence-read-r26.mjs';
import {defaultReadRoot,defaultReadPrimary} from './install-factory-repair-verifier-r26.mjs';
import {readInstalledR28Host,verifyR28InstalledManifest} from './install-factory-verifier-r28.mjs';
import {nodeState,queueState} from './run-factory-supervision-probe.mjs';
import {withPlatform} from './managed-server-client.mjs';

export const targetCleanupR29Scope=Object.freeze({...S,journalPath:'.jarvis-dev/maintenance/factory-target-repair-r29.json',copyJournalPath:'.jarvis-dev/maintenance/factory-target-copy-r29.json',installedManifestPath:'artifacts/software-factory/acceptance-r28/verifier-installation-9e678be1-c0cb-433d-9e80-726f1f6d4ed7.json',installedManifestSHA256:'1dcfa2000de890d08bdc38bcfb5bb3b7090d81d89e3527ed45b15ad387562ec4',originSHA256:'83cea0e063c2df7f8e45691f42be781cefa9113faacd5138945d6586e70cf893',parentIdentity:Object.freeze({device:66306,inode:16919}),workspaceIdentity:Object.freeze({device:66306,inode:6718050}),artifactDirectory:'artifacts/software-factory/goals-r29'});
const C=targetCleanupR29Scope,H=/^[a-f0-9]{64}$/,U=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,R=/^[a-f0-9]{40}$/,J=/^[a-f0-9]{32}$/;
const need=(v,c)=>{if(!v)throw Error(c)},same=(a,b)=>canonical(a)===canonical(b),terminal=new Set(['succeeded','failed','cancelled','timeout','round-limit','budget-exhausted','awaiting-cost','interrupted']);
const profileSHA='367749621fe0cb5aa4f0c441a9524463042f8d33d2d863d960eaae366fef12b9',baseSHA='9c6fd214eb3fb55020089270ff074f9217f99519f098a0ab8c05eab3ac2b5172';
export function parseTargetCleanupR29Arguments(args){need(args.length<=1,'R29_CLEANUP_ARGUMENTS_INVALID');if(!args.length)return {};const m=/^--run-id=([a-f0-9]{40})$/.exec(args[0]);need(m,'R29_CLEANUP_ARGUMENTS_INVALID');return {'run-id':m[1]};}
export function assertTargetCleanupR29Context(q,copy){
 need(copy?.version===1&&same(copy.scope,S)&&typeof copy.job==='string'&&J.test(copy.job)&&copy.prepared===true&&copy.lastObservation?.originBound===true&&same(copy.lastObservation.candidate?.identity,C.workspaceIdentity),'R29_CLEANUP_COPY_SCOPE_CHANGED');
 need(q?.version===1&&same(q.scope,S)&&q.copyJob===copy.job&&q.started===true&&sha(q.originalTemplate)===baseSHA&&same(q.template,targetRepairR29Template(q.originalTemplate))&&q.templateSHA===sha(q.template)&&same(q.payload,targetRepairR29Payload(q.payload?.deadline))&&Number.isFinite(Date.parse(q.payload.deadline)),'R29_CLEANUP_JOURNAL_SCOPE_CHANGED');
 need(U.test(q.taskId??'')&&R.test(q.runId??'')&&U.test(q.startIntent?.commandId??'')&&q.startIntent.scope==='personal'&&Number.isSafeInteger(q.startIntent.expectedVersion)&&q.startIntent.payload?.taskId===q.taskId&&q.runId===expectedRunId(q.startIntent.commandId)&&q.receipts?.start?.runId===q.runId&&q.attempts?.start&&q.createIntent?.scope==='personal'&&q.createIntent.expectedVersion===0&&same(q.createIntent.payload,q.payload)&&q.receipts.create?.id===q.taskId,'R29_CLEANUP_DISPATCH_BINDING_CHANGED');
 need(H.test(q.otherTemplatesSHA??'')&&q.sourceBefore?.sha256===S.baselineSHA&&q.sourceBefore.metadataSHA===S.baselineMetadataSHA&&q.sourceBefore.files===608&&q.sourceBefore.stable===true&&same(q.candidateBefore,copy.lastObservation.candidate)&&same(q.candidateBefore.identity,C.workspaceIdentity)&&q.protectedInventory&&Object.keys(q.protectedInventory.installed??{}).length===7&&H.test(q.protectedInventory.otherNodeTemplatesSHA256??'')&&same(q.protectedInventory.candidate,q.sourceBefore),'R29_CLEANUP_FROZEN_INVENTORY_CHANGED');
 return q;
}
export async function readTargetCleanupR29Execution(q,d){
 const get=async path=>(await d.api(path)).data;
 const [r,t]=await settleEvidenceReads([()=>get('/api/v1/execution/runs/'+q.runId),()=>get('/api/v1/tasks/'+q.taskId)]);
 need(t?.id===q.taskId&&t.ownerId==='server-admin'&&t.scope==='personal'&&['title','projectId','machineId','agent','mode','worktree','budget','retryLimit','deadline','goal','criteria','skillIds'].every(k=>same(t[k]??(k==='skillIds'?[]:undefined),q.payload[k]))&&t.executionRequest?.id===q.runId,'R29_CLEANUP_TASK_SCOPE_CHANGED');
 const expected={id:q.runId,taskId:q.taskId,objectId:q.taskId,projectId:S.projectId,machineId:S.machineId,workspace:S.workspace,executorId:S.templateId,scope:'personal',domain:'tasks',kind:'development',goal:q.payload.goal,criteria:q.payload.criteria,maxRounds:1,timeoutSec:1800,budgetUSD:1};
 need(r&&Object.entries(expected).every(([k,v])=>same(r[k],v))&&!r.purpose&&(r.template===undefined||same(r.template,q.template))&&(!r.agentId||r.agentId===S.agentId),'R29_CLEANUP_RUN_SCOPE_CHANGED');
 // execution_runs.status is authoritative; the JSON contains the frozen request and terminal result.
 const stored=await d.readPrimary({runId:q.runId,nodeAgentId:S.agentId,expected},targetRepairR29StoredRunProgram());
 need(stored?.readOnly===true&&stored.status===r.status&&same(stored.result??null,r.result??null)&&stored.frozenTemplateSHA256===q.templateSHA&&H.test(stored.storedRecordSHA256??'')&&stored.agentId===(r.agentId??null),'R29_CLEANUP_SQL_RUN_CHANGED');
 const isTerminal=terminal.has(r.status),signed=r.result?.source==='signed-agent'&&r.agentId===S.agentId&&stored.agentId===S.agentId,nonlate=r.stopRequested!==true&&r.result?.lateEvidenceOnly!==true;
 return {run:r,task:t,stored,isTerminal,signed,nonlate,runSHA256:sha(r),taskSHA256:sha(t),resultSHA256:sha(r.result??null)};
}
export function targetCleanupR29HostProgram(){
 const end=repairHostProgram.indexOf("before,manifest=source_state(p['source'])");need(end>0,'R29_CLEANUP_HOST_TEMPLATE_CHANGED');
 let prefix=repairHostProgram.slice(0,end);
 const at=prefix.indexOf('# Preserve the approved helper'),last=prefix.indexOf('def trusted(q):');need(at>0&&last>at,'R29_CLEANUP_HOST_TEMPLATE_CHANGED');prefix=prefix.slice(0,at)+prefix.slice(last);
 const guard=`\nimport re,datetime,posixpath,select,errno\nexpected_scope=json.loads('${JSON.stringify(S)}')\nneed(os.geteuid()==0 and set(p)==set(expected_scope)|{'job','runId','taskId','originSHA256','parentIdentity','workspaceIdentity'} and all(p.get(k)==v for k,v in expected_scope.items()) and isinstance(p.get('job'),str) and re.fullmatch('[a-f0-9]{32}',p['job']) and isinstance(p.get('runId'),str) and re.fullmatch('[a-f0-9]{40}',p['runId']) and isinstance(p.get('taskId'),str) and re.fullmatch('[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}',p['taskId']) and p.get('originSHA256')=='${C.originSHA256}' and p.get('parentIdentity')==json.loads('${JSON.stringify(C.parentIdentity)}') and p.get('workspaceIdentity')==json.loads('${JSON.stringify(C.workspaceIdentity)}'),'R29_CLEANUP_NATIVE_SCOPE_CHANGED')\n`;
 const anchor="tool=Path('/opt/jarvis-development/software-factory/project-autonomy-evidence.py')";need(prefix.split(anchor).length===2,'R29_CLEANUP_HOST_TEMPLATE_CHANGED');prefix=prefix.replace(anchor,guard+'\n'+anchor);
 return prefix+String.raw`
account=pwd.getpwnam('superopen');errors=[]
def digest(v):return hashlib.sha256(v if isinstance(v,bytes) else str(v).encode()).hexdigest()
def stat_key(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
origin_path=Path('/var/lib/jarvis-development/101/targets-r29-preparation/origin.json')
origin_bytes=private_read(origin_path);origin=json.loads(origin_bytes)
need(digest(origin_bytes)==p['originSHA256'] and origin.get('version')==1 and origin.get('phase')=='ready' and origin.get('job')==p['job'] and origin.get('parent')==p['parent'] and origin.get('workspace')==p['workspace'] and origin.get('baselineSHA')==p['baselineSHA'] and origin.get('parentIdentity')==p['parentIdentity'] and origin.get('identity')==p['workspaceIdentity'],'R29_CLEANUP_ORIGIN_CHANGED')
def roots_bound():
 for path,key in [(p['parent'],'parentIdentity'),(p['workspace'],'workspaceIdentity')]:
  fd=h.open_directory(path)
  try:
   s=os.fstat(fd);need(identity(fd)==p[key] and s.st_uid==account.pw_uid and s.st_gid==account.pw_gid and s.st_mode&0o077==0,'R29_CLEANUP_WORKSPACE_ROOT_CHANGED')
  finally:os.close(fd)
def unit_state():
 value=dict(x.split('=',1) for x in subprocess.check_output(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,MainPID,ControlGroup'],text=True,timeout=10).splitlines() if '=' in x)
 need(value.get('ActiveState')=='active' and re.fullmatch('[1-9][0-9]*',value.get('MainPID','')) and int(value['MainPID'])>1 and value.get('ControlGroup','').startswith('/system.slice/') and '..' not in value['ControlGroup'].split('/'),'R29_CLEANUP_NODE_NOT_ACTIVE')
 return {'pid':int(value['MainPID']),'cgroup':value['ControlGroup']}
def ack_state():
 path=Path('/var/lib/jarvis-development/101')/('.delivery-'+p['agentId'])/'journal.sqlite'
 trusted(path.parent.parent)
 fd=h.open_directory(str(path.parent))
 try:
  directory=os.fstat(fd);need(directory.st_uid in [0,account.pw_uid] and not directory.st_mode&0o077,'R29_CLEANUP_ACK_DIRECTORY_UNTRUSTED')
  s=os.stat(path.name,dir_fd=fd,follow_symlinks=False);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid in [0,account.pw_uid] and not s.st_mode&0o077,'R29_CLEANUP_ACK_JOURNAL_UNTRUSTED')
  file=os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
  try:
   need(stat_key(os.fstat(file))==stat_key(s),'R29_CLEANUP_ACK_JOURNAL_CHANGED')
   # Directory anchoring preserves the actual adjacent WAL filename, unlike opening the file FD alias.
   c=sqlite3.connect('file:/proc/self/fd/'+str(fd)+'/'+path.name+'?mode=ro',uri=True,timeout=10)
   try:
    counts={'runs':c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0],'deliveries':c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0],'logs':c.execute('SELECT count(*) FROM logs').fetchone()[0]}
   finally:c.close()
   need(stat_key(os.fstat(file))==stat_key(s) and stat_key(os.stat(path.name,dir_fd=fd,follow_symlinks=False))==stat_key(s) and stat_key(os.fstat(fd))==stat_key(directory),'R29_CLEANUP_ACK_JOURNAL_CHANGED')
   return {'counts':counts,'identity':identity(file)}
  finally:os.close(file)
 finally:os.close(fd)
def in_workspace(value):
 value=value.removesuffix(' (deleted)');return value==p['workspace'] or value.startswith(p['workspace']+'/')
def argv_workspace(value):
 # An absolute workspace argument, including key=value and command text, with path boundaries.
 return bool(re.search(r'(?<![A-Za-z0-9_./-])'+re.escape(p['workspace'])+r'(?=$|[/\s\x00\x22\x27])',value))
def internal_link(relative,target):
 if posixpath.isabs(target):return False
 resolved=posixpath.normpath(posixpath.join(posixpath.dirname(relative),target))
 return resolved!='..' and not resolved.startswith('../') and not posixpath.isabs(resolved)
def process_record(pid,boot,attachment=None):
 path=Path('/proc')/str(pid);fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  info=os.fstat(fd)
  if attachment is not None:
   attachment['observedIdentity']={'pid':pid,'boot':boot,'procDevice':info.st_dev,'procInode':info.st_ino}
   need(attachment['listedProcIdentity']=={'device':info.st_dev,'inode':info.st_ino},'R29_CLEANUP_PROCESS_LIST_IDENTITY_CHANGED')
  def text(name):
   f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)
   try:
    data=b''
    while len(data)<=1048576:
     b=os.read(f,65536)
     if not b:break
     data+=b
    need(len(data)<=1048576,'R29_CLEANUP_PROCESS_READ_LIMIT');return data.decode('utf-8','strict')
   finally:os.close(f)
  first=text('stat');fields=first[first.rfind(')')+2:].split();need(len(fields)>=20 and fields[19].isdigit(),'R29_CLEANUP_PROCESS_STAT_INVALID')
  if attachment is not None:attachment['observedIdentity'].update({'ppid':int(fields[1]),'startTicks':fields[19]})
  argv=text('cmdline').split('\0');groups=[x.split(':',2)[2] for x in text('cgroup').splitlines() if x.count(':')>=2]
  kernel=bool(int(fields[6])&0x00200000);zombie=fields[0]=='Z';links={};fd_targets=[]
  if not kernel and not zombie:
   links={k:os.readlink(k,dir_fd=fd) for k in ['cwd','exe']}
   fds=os.open('fd',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
   try:
    # Keep scandir's own duplicate FD alive while inspecting our /proc/self/fd entry.
    # Materializing listdir(fd) closes its temporary descriptor before the subsequent readlink.
    count=0
    with os.scandir(fds) as entries:
     for entry in entries:
      count+=1;need(count<=100000,'R29_CLEANUP_PROCESS_FD_LIMIT')
      fd_targets.append(os.readlink(entry.name,dir_fd=fds))
   finally:os.close(fds)
  after=text('stat');again=after[after.rfind(')')+2:].split()
  need(fields[19]==again[19] and fields[1]==again[1] and info.st_ino==os.stat(path,follow_symlinks=False).st_ino,'R29_CLEANUP_PROCESS_IDENTITY_CHANGED')
  related=any(in_workspace(v) for v in links.values()) or any(argv_workspace(v) for v in argv) or any(in_workspace(v) for v in fd_targets)
  return {'pid':pid,'ppid':int(fields[1]),'startTicks':fields[19],'boot':boot,'procDevice':info.st_dev,'procInode':info.st_ino,'uid':info.st_uid,'state':fields[0],'cwdSHA256':digest(links.get('cwd','')),'exeSHA256':digest(links.get('exe','')),'argvSHA256':digest('\0'.join(argv)),'cgroups':groups,'workspaceRelated':related}
 finally:os.close(fd)
def pidfd_poll(fd):
 poller=select.poll();poller.register(fd,select.POLLIN);events=poller.poll(0)
 need(len(events)<=1 and all(x[0]==fd for x in events),'R29_CLEANUP_PIDFD_POLL_INVALID')
 mask=events[0][1] if events else 0
 need(mask==0 or (mask&select.POLLIN and not mask&~(select.POLLIN|select.POLLHUP)),'R29_CLEANUP_PIDFD_POLL_UNKNOWN')
 return {'exitConfirmed':bool(mask&select.POLLIN),'pollEvents':mask}
def pidfd_exit_proof(pid,attachment,boot):
 need(attachment.get('requestedPID')==pid and attachment.get('boot')==boot,'R29_CLEANUP_PIDFD_BINDING_CHANGED')
 known=attachment.get('observedIdentity')
 need(attachment.get('identityBound') is True and known is not None and known.get('pid')==pid and known.get('boot')==boot and {'device':known['procDevice'],'inode':known['procInode']}==attachment['listedProcIdentity'],'R29_CLEANUP_PIDFD_IDENTITY_UNBOUND')
 state=pidfd_poll(attachment['fd'])
 if not state['exitConfirmed']:return None
 try:os.stat('/proc/'+str(pid),follow_symlinks=False);return None
 except FileNotFoundError as e:
  if e.errno!=errno.ENOENT:raise
 return {'pid':pid,'boot':boot,'listedProcIdentity':attachment['listedProcIdentity'],'processIdentity':known,'kernelProof':{'type':'pidfd-POLLIN','attached':True,'identityBound':True,'requestedPID':pid,'exitConfirmed':True,'pollEvents':state['pollEvents'],'procPathAbsent':True}}
def census():
 need(hasattr(os,'pidfd_open') and hasattr(select,'poll'),'R29_CLEANUP_PIDFD_UNSUPPORTED')
 unit=unit_state();boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip();need(re.fullmatch('[a-f0-9-]{36}',boot),'R29_CLEANUP_BOOT_ID_INVALID')
 records={};failures={};attachments={};exits={};listed={};proc=os.open('/proc',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  device=os.fstat(proc).st_dev
  with os.scandir(proc) as entries:
   for entry in entries:
    if entry.name.isdigit():
     pid=int(entry.name);need(pid>0 and pid not in listed,'R29_CLEANUP_PROCESS_LIST_CHANGED');listed[pid]={'device':device,'inode':entry.inode()};need(len(listed)<=100000,'R29_CLEANUP_PROCESS_LIMIT')
 finally:os.close(proc)
 def failed(pid,error,phase):failures[pid]={'pid':pid,'phase':phase,'errorCode':str(error) if isinstance(error,RuntimeError) and re.fullmatch('R29_CLEANUP_[A-Z0-9_]+',str(error)) else 'PROCESS_READ_ERROR','errno':getattr(error,'errno',None)}
 try:
  # Attach the full listed set before slower metadata reads. Every held descriptor closes in finally.
  for pid in sorted(listed):
   try:
    a={'fd':os.pidfd_open(pid,0),'requestedPID':pid,'boot':boot,'listedProcIdentity':listed[pid],'observedIdentity':None,'identityBound':False};attachments[pid]=a
    current=os.stat('/proc/'+str(pid),follow_symlinks=False);need({'device':current.st_dev,'inode':current.st_ino}==listed[pid],'R29_CLEANUP_PROCESS_LIST_IDENTITY_CHANGED')
    a['observedIdentity']={'pid':pid,'boot':boot,'procDevice':current.st_dev,'procInode':current.st_ino};a['identityBound']=True
   except (OSError,RuntimeError) as e:failed(pid,e,'pidfd-attach')
  for pid,a in attachments.items():
   if pid in failures:continue
   try:
    value=process_record(pid,boot,a);state=pidfd_poll(a['fd'])
    if state['exitConfirmed']:
     proof=pidfd_exit_proof(pid,a,boot);need(proof is not None,'R29_CLEANUP_EXITED_PID_STILL_PRESENT');exits[pid]=proof
    else:records[pid]=value
   except (OSError,UnicodeError,ValueError,IndexError,RuntimeError) as e:
    proof=None
    if isinstance(e,OSError) and e.errno in [errno.ENOENT,errno.ESRCH]:
     try:proof=pidfd_exit_proof(pid,a,boot)
     except (OSError,RuntimeError):proof=None
    if proof is not None:exits[pid]=proof
    else:failed(pid,e,'process-read')
  # A record read successfully can also exit before this scan closes. Never accept a reused/present PID.
  for pid in list(records):
   a=attachments[pid]
   try:
    if pidfd_poll(a['fd'])['exitConfirmed']:
     proof=pidfd_exit_proof(pid,a,boot);need(proof is not None,'R29_CLEANUP_EXITED_PID_STILL_PRESENT');exits[pid]=proof;del records[pid]
    else:
     current=os.stat('/proc/'+str(pid),follow_symlinks=False);need({'device':current.st_dev,'inode':current.st_ino}==listed[pid],'R29_CLEANUP_PROCESS_LIST_IDENTITY_CHANGED')
   except (OSError,RuntimeError) as e:
    proof=None
    if isinstance(e,OSError) and e.errno in [errno.ENOENT,errno.ESRCH]:
     try:proof=pidfd_exit_proof(pid,a,boot)
     except (OSError,RuntimeError):proof=None
    del records[pid]
    if proof is not None:exits[pid]=proof
    else:failed(pid,e,'scan-close')
  need(set(records).isdisjoint(exits) and set(records).isdisjoint(failures) and set(exits).isdisjoint(failures) and set(listed)==set(records)|set(exits)|set(failures),'R29_CLEANUP_PROCESS_COUNTS_NOT_CLOSED')
  need(unit['pid'] in records,'R29_CLEANUP_MAIN_PID_UNREADABLE');node=records[unit['pid']];need(unit['cgroup'] in node['cgroups'] and node['uid']==account.pw_uid,'R29_CLEANUP_NODE_CGROUP_CHANGED')
  ancestry={pid:v for pid,v in records.items()}
  for pid,e in exits.items():
   if e['processIdentity'] is not None and 'ppid' in e['processIdentity']:ancestry[pid]=e['processIdentity']
  descendants=set();front={unit['pid']}
  while front:
   next_set={pid for pid,v in ancestry.items() if v['ppid'] in front and pid!=unit['pid']} - descendants;descendants|=next_set;front=next_set
  descendants&=set(records)
  cgroup={pid for pid,v in records.items() if pid!=unit['pid'] and any(x==unit['cgroup'] or x.startswith(unit['cgroup']+'/') for x in v['cgroups'])};workspace={pid for pid,v in records.items() if pid!=unit['pid'] and v['workspaceRelated']};related=sorted(descendants|cgroup|workspace)
  def public(v):return {k:v[k] for k in ['pid','ppid','startTicks','boot','procDevice','procInode','uid','state','cwdSHA256','exeSHA256','argvSHA256']}
  return {'node':public(node)|{'active':True,'cgroup':unit['cgroup']},'allDescendants':sorted(descendants),'unitCgroupOtherProcesses':sorted(cgroup),'workspaceRelatedProcesses':sorted(workspace),'relatedProcesses':[public(records[x]) for x in related],'fullProcScan':True,'pidfdSupported':True,'processesScanned':len(listed),'listedPIDs':sorted(listed),'inspectedPIDs':sorted(records),'readIncompletePIDs':sorted(failures),'readIncompleteReasons':[failures[x] for x in sorted(failures)],'exitedDuringScan':[exits[x] for x in sorted(exits)],'counts':{'listed':len(listed),'inspected':len(records),'pidfdProvenExits':len(exits),'incomplete':len(failures)},'ack':ack_state()}
 finally:
  for a in attachments.values():os.close(a['fd'])
def workspace_sockets():
 root=h.open_directory(p['workspace']);sockets=[];count=0
 def walk(fd,relative):
  nonlocal count
  before=os.fstat(fd);names=sorted(os.listdir(fd))
  for name in names:
   count+=1;need(count<=100000,'R29_CLEANUP_WORKSPACE_ENTRY_LIMIT');s=os.stat(name,dir_fd=fd,follow_symlinks=False);rel=relative+'/'+name if relative else name
   if stat.S_ISSOCK(s.st_mode):sockets.append({'pathSHA256':digest(rel),'device':s.st_dev,'inode':s.st_ino})
   elif stat.S_ISDIR(s.st_mode):
    child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
    try:need(stat_key(os.fstat(child))==stat_key(s),'R29_CLEANUP_WORKSPACE_DIRECTORY_CHANGED');walk(child,rel)
    finally:os.close(child)
   elif stat.S_ISLNK(s.st_mode):
    # Links cannot hide sockets outside the explicit workspace scope.
    target=os.readlink(name,dir_fd=fd);need(internal_link(rel,target),'R29_CLEANUP_WORKSPACE_LINK_SCOPE_INVALID')
  need(stat_key(before)==stat_key(os.fstat(fd)) and names==sorted(os.listdir(fd)),'R29_CLEANUP_WORKSPACE_DIRECTORY_CHANGED')
 try:walk(root,'')
 finally:os.close(root)
 lines=Path('/proc/net/unix').read_text().splitlines()[1:]
 unix=[]
 for line in lines:
  parts=line.split(maxsplit=7)
  if len(parts)==8 and (in_workspace(parts[7]) or (parts[7].startswith('@') and in_workspace(parts[7][1:]))):unix.append({'pathSHA256':digest(parts[7]),'inode':parts[6]})
 return {'filesystem':sockets,'procNetUnix':unix,'nofollow':True,'entriesScanned':count}
roots_bound();source_before,_=source_state(p['source']);candidate_before,_=source_state(p['workspace']);scan_before=census();sockets_before=workspace_sockets()
need(source_before['sha256']==p['baselineSHA'] and source_before['metadataSHA']==p['baselineMetadataSHA'] and source_before['files']==608,'R29_CLEANUP_ORIGINAL_R27_CHANGED')
candidate_after,_=source_state(p['workspace']);source_after,_=source_state(p['source']);scan_after=census();sockets_after=workspace_sockets();roots_bound()
need(source_before==source_after and candidate_before==candidate_after and private_read(origin_path)==origin_bytes,'R29_CLEANUP_SOURCE_OR_ORIGIN_READ_CHANGED')
need(scan_before['node']==scan_after['node'] and scan_before['ack']==scan_after['ack'] and sockets_before==sockets_after,'R29_CLEANUP_NATIVE_READ_CHANGED')
complete=not scan_before['readIncompletePIDs'] and not scan_after['readIncompletePIDs'] and not scan_before['relatedProcesses'] and not scan_after['relatedProcesses'] and not sockets_after['filesystem'] and not sockets_after['procNetUnix'] and all(v==0 for v in scan_after['ack']['counts'].values())
print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'job':p['job'],'runId':p['runId'],'taskId':p['taskId'],'workspace':p['workspace'],'helperVerified':True,'originSHA256':digest(origin_bytes),'originBound':True,'source':source_after,'candidate':candidate_after,'beforeAfterStable':True,'node':scan_after['node'],'nodeACK':scan_after['ack'],'procScope':{'fullProcScan':True,'includesAllDescendants':True,'includesUnitCgroupOrphans':True,'includesWorkspaceCwdExeArgvFD':True,'persistentMainPIDExcluded':scan_after['node']['pid'],'twoScans':True},'scans':[scan_before,scan_after],'workspaceSockets':sockets_after,'nativeProcessAndSocketCleanupVerified':complete,'mutationsPerformed':False,'signalsSent':False,'resourcesRemoved':False,'dockerQueried':False,'rawLogsExported':False,'privateEnvironmentExported':False,'rawArgvExported':False}))
`;
}
function inventory(h){return {source:h.source,oldCandidate:h.oldCandidate,candidate:h.candidate,oldImmutable:h.oldImmutable,installed:h.installed,originSHA256:h.originSHA256,otherNodeTemplatesSHA256:h.nodeTemplates.otherTemplatesSHA256};}
async function platform(q,d){
 const get=async path=>(await d.api(path)).data;
 const [p,g,c,n,queue,project]=await settleEvidenceReads([()=>get('/api/v1/projects/'+S.projectId+'/autonomy'),()=>get('/api/v1/execution/supervision'),()=>get('/api/v1/execution/config'),()=>d.nodeState(),()=>d.queueState(),()=>get('/api/v1/projects/'+S.projectId)]);
 const approved=t=>same(t,q.template)||same(t,q.originalTemplate);
 need(sha(p)===profileSHA&&p.config?.costPolicy==='record-only'&&g.supervised===false&&g.stopped===false&&c.templates?.length===28&&c.templates.filter(t=>t.id===S.templateId).length===1&&approved(c.templates.find(t=>t.id===S.templateId))&&sha(c.templates.filter(t=>t.id!==S.templateId))===q.otherTemplatesSHA&&n.agentId===S.agentId&&n.unit?.ActiveState==='active'&&Number(n.unit.MainPID)>1&&approved(n.template)&&(!q.restored||(same(c.templates.find(t=>t.id===S.templateId),q.originalTemplate)&&same(n.template,q.originalTemplate))),'R29_CLEANUP_PLATFORM_SCOPE_CHANGED');
 need(queue.readOnly===true&&queue.fullTable===true&&queue.allActive===0,'R29_CLEANUP_FULL_QUEUE_NOT_IDLE');
 need(project?.id===S.projectId&&project.ownerId==='server-admin'&&project.scope==='personal'&&project.status!=='archived'&&project.copies?.filter(x=>x.path===S.workspace).length===1&&project.copies.some(x=>x.path===S.workspace&&x.machineId===S.machineId&&x.environment==='development'&&x.branch==='snapshot:9b07a511-r29'),'R29_CLEANUP_PROJECT_COPY_CHANGED');
 return {profileSHA256:sha(p),globalSHA256:sha(g),configSHA256:sha(c),node:n,projectSHA256:sha(project),queueIdle:true};
}
export function assertTargetCleanupR29NativeHost(h,q){
 need(h?.job===q.copyJob&&h.runId===q.runId&&h.taskId===q.taskId&&h.workspace===S.workspace&&h.helperVerified===true&&h.originBound===true&&h.originSHA256===C.originSHA256&&h.beforeAfterStable===true&&same(h.source,q.sourceBefore)&&h.candidate?.stable===true&&H.test(h.candidate.sha256??'')&&H.test(h.candidate.metadataSHA??'')&&same(h.candidate.identity,C.workspaceIdentity)&&Number.isSafeInteger(h.candidate.files)&&h.candidate.files>0&&Number.isSafeInteger(h.candidate.bytes)&&h.candidate.bytes>0,'R29_CLEANUP_NATIVE_SOURCE_BINDING_CHANGED');
 need(h.mutationsPerformed===false&&h.signalsSent===false&&h.resourcesRemoved===false&&h.dockerQueried===false&&h.rawLogsExported===false&&h.privateEnvironmentExported===false&&h.rawArgvExported===false&&h.procScope?.fullProcScan===true&&h.procScope.includesAllDescendants===true&&h.procScope.includesUnitCgroupOrphans===true&&h.procScope.includesWorkspaceCwdExeArgvFD===true&&h.procScope.twoScans===true&&h.scans?.length===2&&h.workspaceSockets?.nofollow===true,'R29_CLEANUP_NATIVE_CENSUS_INCOMPLETE');
 for(const scan of h.scans){
  need(scan.fullProcScan===true&&scan.pidfdSupported===true&&Array.isArray(scan.readIncompletePIDs)&&Array.isArray(scan.relatedProcesses)&&same(scan.node,h.node)&&same(scan.ack,h.nodeACK)&&['allDescendants','unitCgroupOtherProcesses','workspaceRelatedProcesses','listedPIDs','inspectedPIDs','exitedDuringScan'].every(k=>Array.isArray(scan[k])),'R29_CLEANUP_NATIVE_CENSUS_INCOMPLETE');
  const exited=scan.exitedDuringScan.map(e=>e.pid),all=[...scan.inspectedPIDs,...exited,...scan.readIncompletePIDs],listed=new Set(scan.listedPIDs);
  need(all.every(p=>Number.isSafeInteger(p)&&p>0)&&new Set(all).size===all.length&&listed.size===scan.listedPIDs.length&&same([...listed].sort((a,b)=>a-b),[...all].sort((a,b)=>a-b))&&scan.inspectedPIDs.includes(h.node.pid)&&scan.processesScanned===listed.size&&same(scan.counts,{listed:listed.size,inspected:scan.inspectedPIDs.length,pidfdProvenExits:exited.length,incomplete:scan.readIncompletePIDs.length}),'R29_CLEANUP_PROCESS_COUNTS_NOT_CLOSED');
  for(const e of scan.exitedDuringScan){const k=e.kernelProof,v=e.processIdentity,id=e.listedProcIdentity;need(e.boot===h.node.boot&&Number.isSafeInteger(id?.device)&&id.device>=0&&Number.isSafeInteger(id.inode)&&id.inode>0&&k?.type==='pidfd-POLLIN'&&k.attached===true&&k.identityBound===true&&k.requestedPID===e.pid&&k.exitConfirmed===true&&k.procPathAbsent===true&&[1,17].includes(k.pollEvents)&&v?.pid===e.pid&&v.boot===e.boot&&v.procDevice===id.device&&v.procInode===id.inode&&(v.startTicks===undefined||/^[0-9]+$/.test(v.startTicks))&&(v.ppid===undefined||Number.isSafeInteger(v.ppid)&&v.ppid>=0),'R29_CLEANUP_PIDFD_EXIT_PROOF_INVALID');}
 }
 need(Number.isSafeInteger(h.node?.pid)&&h.node.pid>1&&Number.isSafeInteger(h.node.procDevice)&&h.node.procDevice>=0&&Number.isSafeInteger(h.node.procInode)&&h.node.procInode>0&&h.node.uid===1000&&h.procScope.persistentMainPIDExcluded===h.node.pid&&/^[0-9]+$/.test(h.node.startTicks??'')&&U.test(h.node.boot??'')&&h.node.active===true&&h.node.cgroup?.startsWith('/system.slice/')&&H.test(h.node.cwdSHA256??'')&&H.test(h.node.exeSHA256??'')&&H.test(h.node.argvSHA256??'')&&Object.keys(h.nodeACK?.counts??{}).sort().join(',')==='deliveries,logs,runs','R29_CLEANUP_NODE_IDENTITY_INVALID');
 const complete=h.scans.every(s=>!s.readIncompletePIDs.length&&!s.relatedProcesses.length&&['allDescendants','unitCgroupOtherProcesses','workspaceRelatedProcesses'].every(k=>!s[k].length))&&Array.isArray(h.workspaceSockets.filesystem)&&!h.workspaceSockets.filesystem.length&&Array.isArray(h.workspaceSockets.procNetUnix)&&!h.workspaceSockets.procNetUnix.length&&Object.values(h.nodeACK.counts).every(v=>v===0);
 need(h.nativeProcessAndSocketCleanupVerified===complete,'R29_CLEANUP_NATIVE_COMPLETE_FLAG_CHANGED');return complete;
}
export async function verifyFactoryTargetCleanupR29(options={},deps){
 need(Object.keys(options).every(k=>k==='run-id')&&(!options['run-id']||R.test(options['run-id'])),'R29_CLEANUP_ARGUMENTS_INVALID');
 if(deps===undefined)return withPlatform(({api})=>verifyFactoryTargetCleanupR29(options,{api}));
 const d={now:Date.now,readLocal:safeReadLocal,readPrimary:defaultReadPrimary,readRoot:defaultReadRoot,nodeState,queueState,readInstalledHost:readInstalledR28Host,verifyInstalledManifest:verifyR28InstalledManifest,...deps};need(typeof d.api==='function','R29_CLEANUP_API_DEPENDENCY_REQUIRED');
 const [qraw,copyraw]=await settleEvidenceReads([()=>d.readLocal(C.journalPath,'utf8'),()=>d.readLocal(C.copyJournalPath,'utf8')]);const q=assertTargetCleanupR29Context(JSON.parse(qraw),JSON.parse(copyraw));need(!options['run-id']||options['run-id']===q.runId,'R29_CLEANUP_RUN_ARGUMENT_CHANGED');
 const first=await readTargetCleanupR29Execution(q,d),base={schemaVersion:1,kind:'software-factory-r29-target-independent-cleanup',projectId:S.projectId,machineId:S.machineId,job:q.copyJob,taskId:q.taskId,runId:q.runId,agentId:S.agentId,workspace:S.workspace,frozenTemplateSHA256:q.templateSHA,goalSHA256:sha(q.payload.goal),criteriaSHA256:sha(q.payload.criteria),modelsInvoked:false,productAccepted:false,independentProductValidation:false,remoteMutationsPerformed:false,privateJournalExported:false,rawResultExported:false,rawLogsExported:false,dockerResourcesVerified:false};
 if(!first.isTerminal||!first.signed||!first.nonlate){const at=new Date(d.now()).toISOString();return {...base,at,observedAt:at,ready:false,status:'notReady',reason:!first.isTerminal?'RUN_NOT_TERMINAL':!first.signed?'SIGNED_TERMINAL_REQUIRED':'NONLATE_UNSTOPPED_TERMINAL_REQUIRED',runStatus:first.run.status,cleanupIndependentlyVerified:false,nativeProcessAndSocketCleanupVerified:false};}
 const manifestRaw=await d.readLocal(C.installedManifestPath,'utf8');need(sha(manifestRaw)===C.installedManifestSHA256,'R29_CLEANUP_INSTALLED_MANIFEST_CHANGED');const manifest=JSON.parse(manifestRaw);await d.verifyInstalledManifest(manifest,d.readLocal);
 const before=await platform(q,d),oldBefore=inventory(await d.readInstalledHost(manifest,{idle:true}));need(same(oldBefore,q.protectedInventory),'R29_CLEANUP_PROTECTED_INVENTORY_CHANGED');
 const h=await d.readRoot({...S,job:q.copyJob,taskId:q.taskId,runId:q.runId,originSHA256:C.originSHA256,parentIdentity:C.parentIdentity,workspaceIdentity:C.workspaceIdentity},targetCleanupR29HostProgram());const complete=assertTargetCleanupR29NativeHost(h,q);need(Number(before.node.unit.MainPID)===h.node.pid,'R29_CLEANUP_NODE_PID_CHANGED');
 const oldAfter=inventory(await d.readInstalledHost(manifest,{idle:true})),after=await platform(q,d),second=await readTargetCleanupR29Execution(q,d);
 need(same(oldBefore,oldAfter)&&same(oldAfter,q.protectedInventory)&&same(before,after)&&Number(after.node.unit.MainPID)===h.node.pid,'R29_CLEANUP_PLATFORM_OR_INVENTORY_READ_CHANGED');
 need(second.isTerminal&&second.signed&&second.nonlate&&first.runSHA256===second.runSHA256&&first.taskSHA256===second.taskSHA256&&first.resultSHA256===second.resultSHA256&&first.stored.storedRecordSHA256===second.stored.storedRecordSHA256,'R29_CLEANUP_TERMINAL_READ_CHANGED');
 const [qfinal,copyfinal]=await settleEvidenceReads([()=>d.readLocal(C.journalPath,'utf8'),()=>d.readLocal(C.copyJournalPath,'utf8')]);need(qfinal===qraw&&copyfinal===copyraw,'R29_CLEANUP_PRIVATE_CONTEXT_READ_CHANGED');
 const at=new Date(d.now()).toISOString();need(Number.isFinite(Date.parse(h.observedAt))&&d.now()-Date.parse(h.observedAt)>=-30000&&d.now()-Date.parse(h.observedAt)<=5*60000,'R29_CLEANUP_NATIVE_OBSERVATION_STALE');
 return {...base,at,observedAt:at,ready:complete,status:complete?'complete':'notReady',...(complete?{}:{reason:'NATIVE_PROCESS_SOCKET_OR_ACK_NOT_CLEAN'}),terminal:{status:first.run.status,resultSHA256:first.resultSHA256,storedRecordSHA256:first.stored.storedRecordSHA256,runRecordSHA256:first.runSHA256,taskRecordSHA256:first.taskSHA256,signed:true,nonlate:true,ingestedSignedAgentReceipt:true,readerCryptographicallyReverified:false,rawResultExported:false},candidate:h.candidate,protectedInventorySHA256:sha(oldAfter),protectedInventoryUnchanged:true,sourceBeforeAfterStable:true,nodeACKIdle:Object.values(h.nodeACK.counts).every(v=>v===0),queueIdle:true,nativeProcessAndSocketCleanupVerified:complete,cleanupIndependentlyVerified:complete,nativeHost:h};
}
export function targetCleanupR29Failure(error){const value=String(error?.message??'');return {schemaVersion:1,kind:'software-factory-r29-target-independent-cleanup',at:new Date().toISOString(),ready:false,status:'notReady',failed:true,errorCode:/^R29_CLEANUP_[A-Z0-9_]{1,100}$/.test(value)?value:'R29_CLEANUP_OBSERVATION_FAILED',cleanupIndependentlyVerified:false,nativeProcessAndSocketCleanupVerified:false,automaticRetry:false,modelsInvoked:false,productAccepted:false,remoteMutationsPerformed:false,privateJournalExported:false,rawErrorExported:false,rawLogsExported:false};}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){let result;try{const options=parseTargetCleanupR29Arguments(process.argv.slice(2));result=await withPlatform(({api})=>verifyFactoryTargetCleanupR29(options,{api}));}catch(e){result=targetCleanupR29Failure(e);process.exitCode=1;}await mkdir(C.artifactDirectory,{recursive:true});const output=C.artifactDirectory+'/native-independent-cleanup-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(result,null,2)+'\n',file=await open(output,'wx',0o644);try{await file.writeFile(raw);await file.sync();}finally{await file.close();}console.log(JSON.stringify({output,sha256:sha(raw),...result}));}
