/** Prepared read-only census generators. No IO/contract/operational activation. */
import {createHash} from 'node:crypto';
import {targetCleanupR29HostProgram} from './verify-factory-target-cleanup-r29.mjs';
import {buildCleanupR29HostProgram} from './verify-factory-truth-gate-build-cleanup-r29.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const need=(v,c)=>{if(!v)throw Error(c)};
export const boundProcessCensusR32Preparation=Object.freeze({schemaVersion:1,kind:'r32-bound-process-census-preparation',
 originalNativeSHA256:'66a241993d910da443bc1b3776ab4c6efc33bc1b44401c7dddff4caa06754155',
 originalBuildSHA256:'66e84cadadd232daa58d62b2ee7fd58c6f61cf08baec4e124e7c4ef9a237f8d6',
 preparedOnly:true,operationalQualified:false,defaultOperationalPins:null,remoteOperations:false});
export const boundProcessCensusR32ReadSubphases=Object.freeze(['PIDFD_OPEN','POST_ATTACH_PROC_IDENTITY','PROCESS_READ',
 'PROC_DIRECTORY_OPEN','PROC_DIRECTORY_METADATA','STAT_BEFORE','CMDLINE_READ','CGROUP_READ','CWD_READLINK','EXE_READLINK',
 'FD_DIRECTORY_OPEN','FD_SCANDIR_OPEN','FD_SCANDIR_NEXT','FD_SCANDIR_CLOSE','FD_ENTRY_LIMIT','FD_TARGET_READLINK',
 'FD_DIRECTORY_CLOSE','STAT_AFTER','PROC_PATH_IDENTITY_AFTER','PROC_DIRECTORY_CLOSE','PIDFD_POLL','PIDFD_EXIT_PATH_CHECK',
 'SCAN_CLOSE_PROC_IDENTITY','SCAN_CLOSE']);
function one(s,from,to){need(s.split(from).length===2,'R32_BOUND_CENSUS_UNIQUE_ANCHOR_CHANGED');return s.replace(from,to)}

const oldHead=String.raw` records={};failures={};attachments={};exits={};listed={};proc=os.open('/proc',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
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
`;
const newHead=String.raw` records={};failures={};attachments={};exits={};listed={}
 def failed(pid,error,phase,subphase):
  need(subphase in CLOSED_READ_SUBPHASES,'R29_CLEANUP_READ_SUBPHASE_INVALID')
  failures[pid]={'pid':pid,'phase':phase,'readSubphase':subphase,'errorCode':str(error) if isinstance(error,RuntimeError) and re.fullmatch('R29_CLEANUP_[A-Z0-9_]+',str(error)) else 'PROCESS_READ_ERROR','errno':getattr(error,'errno',None)}
 try:
  proc=os.open('/proc',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:
   device=os.fstat(proc).st_dev
   with os.scandir(proc) as entries:
    for entry in entries:
     if entry.name.isdigit():
      pid=int(entry.name);need(pid>0 and pid not in listed,'R29_CLEANUP_PROCESS_LIST_CHANGED');listed[pid]={'device':device,'inode':entry.inode()};need(len(listed)<=100000,'R29_CLEANUP_PROCESS_LIMIT')
      a={'requestedPID':pid,'boot':boot,'listedProcIdentity':listed[pid],'observedIdentity':None,'identityBound':False};attachments[pid]=a
      subphase='PIDFD_OPEN'
      try:
       a['fd']=os.pidfd_open(pid,0)
       subphase='POST_ATTACH_PROC_IDENTITY'
       current=os.stat('/proc/'+str(pid),follow_symlinks=False);need({'device':current.st_dev,'inode':current.st_ino}==listed[pid],'R29_CLEANUP_PROCESS_LIST_IDENTITY_CHANGED')
       a['observedIdentity']={'pid':pid,'boot':boot,'procDevice':current.st_dev,'procInode':current.st_ino};a['identityBound']=True
      except (OSError,RuntimeError) as e:failed(pid,e,'pidfd-attach',subphase)
  finally:os.close(proc)
`;
const diagnosticHelpers=String.raw` def marked(subphase,call):
  need(subphase in CLOSED_READ_SUBPHASES,'R29_CLEANUP_READ_SUBPHASE_INVALID')
  if attachment is not None:attachment['readSubphase']=subphase
  try:return call()
  except BaseException as error:
   if attachment is not None:
    attachment.setdefault('failedReadSubphase',subphase);attachment.setdefault('failedReadError',error)
   raise
 def closed(subphase,call):
  try:return call()
  except BaseException as error:
   if attachment is not None:
    attachment.setdefault('failedReadSubphase',subphase);attachment.setdefault('failedReadError',error)
   raise
 class TaggedScanner:
  def __init__(self,value):self.value=value
  def __enter__(self):return marked('FD_SCANDIR_OPEN',self.value.__enter__)
  def __exit__(self,*args):return closed('FD_SCANDIR_CLOSE',lambda:self.value.__exit__(*args))
 def tagged_entries(entries):
  while True:
   try:entry=marked('FD_SCANDIR_NEXT',lambda:next(entries))
   except StopIteration:
    if attachment is not None:
     attachment.pop('failedReadSubphase',None);attachment.pop('failedReadError',None)
    return
   yield entry
 if attachment is not None:
  attachment.pop('failedReadSubphase',None);attachment.pop('failedReadError',None)
`;
function instrumentRecord(body){
 let s=body;
 const rows=[
  [" path=Path('/proc')/str(pid);fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)",diagnosticHelpers+" path=Path('/proc')/str(pid);fd=marked('PROC_DIRECTORY_OPEN',lambda:os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW))"],
  ['  info=os.fstat(fd)',"  info=marked('PROC_DIRECTORY_METADATA',lambda:os.fstat(fd))"],
  ['  def text(name):','  def text(name,subphase):'],
  ['   f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)',"   f=marked(subphase,lambda:os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd))"],
  ['     b=os.read(f,65536)',"     b=marked(subphase,lambda:os.read(f,65536))"],
  ["    need(len(data)<=1048576,'R29_CLEANUP_PROCESS_READ_LIMIT');return data.decode('utf-8','strict')","    marked(subphase,lambda:need(len(data)<=1048576,'R29_CLEANUP_PROCESS_READ_LIMIT'));return marked(subphase,lambda:data.decode('utf-8','strict'))"],
  ['   finally:os.close(f)',"   finally:closed(subphase,lambda:os.close(f))"],
  ["first=text('stat')","first=text('stat','STAT_BEFORE')"],
  ["argv=text('cmdline')","argv=text('cmdline','CMDLINE_READ')"],
  ["text('cgroup').splitlines()","text('cgroup','CGROUP_READ').splitlines()"],
  ["links={k:os.readlink(k,dir_fd=fd) for k in ['cwd','exe']}","links={k:marked('CWD_READLINK' if k=='cwd' else 'EXE_READLINK',lambda k=k:os.readlink(k,dir_fd=fd)) for k in ['cwd','exe']}"],
  ["fds=os.open('fd',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)","fds=marked('FD_DIRECTORY_OPEN',lambda:os.open('fd',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd))"],
  ['    with os.scandir(fds) as entries:',"    with TaggedScanner(marked('FD_SCANDIR_OPEN',lambda:os.scandir(fds))) as entries:"],
  ['     for entry in entries:','     for entry in tagged_entries(entries):'],
  ["count+=1;need(count<=100000,'R29_CLEANUP_PROCESS_FD_LIMIT')","count+=1;marked('FD_ENTRY_LIMIT',lambda:need(count<=100000,'R29_CLEANUP_PROCESS_FD_LIMIT'))"],
  ['fd_targets.append(os.readlink(entry.name,dir_fd=fds))',"fd_targets.append(marked('FD_TARGET_READLINK',lambda:os.readlink(entry.name,dir_fd=fds)))"],
  ['   finally:os.close(fds)',"   finally:closed('FD_DIRECTORY_CLOSE',lambda:os.close(fds))"],
  ["after=text('stat')","after=text('stat','STAT_AFTER')"],
  ['info.st_ino==os.stat(path,follow_symlinks=False).st_ino',"info.st_ino==marked('PROC_PATH_IDENTITY_AFTER',lambda:os.stat(path,follow_symlinks=False)).st_ino"],
  [' finally:os.close(fd)'," except BaseException as error:\n  if attachment is not None:\n   attachment.setdefault('failedReadSubphase',attachment.get('readSubphase','PROCESS_READ'));attachment.setdefault('failedReadError',error)\n  raise\n finally:closed('PROC_DIRECTORY_CLOSE',lambda:os.close(fd))"]
 ];
 for(const[from,to]of rows)s=one(s,from,to);
 return s;
}
function instrumentCensus(body){
 let s=one(body,oldHead,newHead);
 s=one(s,"   try:\n    value=process_record(pid,boot,a);state=pidfd_poll(a['fd'])", "   a['readSubphase']='PROCESS_READ'\n   try:\n    value=process_record(pid,boot,a);a['readSubphase']='PIDFD_POLL';state=pidfd_poll(a['fd'])");
 s=one(s,"     proof=pidfd_exit_proof(pid,a,boot);need(proof is not None,'R29_CLEANUP_EXITED_PID_STILL_PRESENT');exits[pid]=proof\n", "     a['readSubphase']='PIDFD_EXIT_PATH_CHECK';proof=pidfd_exit_proof(pid,a,boot);need(proof is not None,'R29_CLEANUP_EXITED_PID_STILL_PRESENT');exits[pid]=proof\n");
 s=one(s,'   except (OSError,UnicodeError,ValueError,IndexError,RuntimeError) as e:\n    proof=None','   except (OSError,UnicodeError,ValueError,IndexError,RuntimeError) as e:\n    failed_subphase=a.get(\'failedReadSubphase\',a.get(\'readSubphase\',\'PROCESS_READ\'));failed_error=a.get(\'failedReadError\',e);proof=None');
 s=one(s,"else:failed(pid,e,'process-read')","else:failed(pid,failed_error,'process-read',failed_subphase)");
 s=one(s,"    if isinstance(e,OSError) and e.errno in [errno.ENOENT,errno.ESRCH]:\n     try:proof=pidfd_exit_proof(pid,a,boot)\n     except (OSError,RuntimeError):proof=None\n    if proof is not None:exits[pid]=proof\n    else:failed(pid,failed_error,'process-read',failed_subphase)","    if isinstance(failed_error,OSError) and failed_error.errno in [errno.ENOENT,errno.ESRCH]:\n     try:proof=pidfd_exit_proof(pid,a,boot)\n     except (OSError,RuntimeError):proof=None\n    if proof is not None:exits[pid]=proof\n    else:failed(pid,failed_error,'process-read',failed_subphase)");
 s=one(s,"   a=attachments[pid]\n   try:\n    if pidfd_poll(a['fd'])['exitConfirmed']:","   a=attachments[pid];a['readSubphase']='PIDFD_POLL'\n   try:\n    if pidfd_poll(a['fd'])['exitConfirmed']:");
 s=one(s,"     proof=pidfd_exit_proof(pid,a,boot);need(proof is not None,'R29_CLEANUP_EXITED_PID_STILL_PRESENT');exits[pid]=proof;del records[pid]", "     a['readSubphase']='PIDFD_EXIT_PATH_CHECK';proof=pidfd_exit_proof(pid,a,boot);need(proof is not None,'R29_CLEANUP_EXITED_PID_STILL_PRESENT');exits[pid]=proof;del records[pid]");
 s=one(s,"\n     current=os.stat('/proc/'+str(pid),follow_symlinks=False);need({'device':current.st_dev,'inode':current.st_ino}==listed[pid],'R29_CLEANUP_PROCESS_LIST_IDENTITY_CHANGED')", "\n     a['readSubphase']='SCAN_CLOSE_PROC_IDENTITY';current=os.stat('/proc/'+str(pid),follow_symlinks=False);need({'device':current.st_dev,'inode':current.st_ino}==listed[pid],'R29_CLEANUP_PROCESS_LIST_IDENTITY_CHANGED')");
 s=one(s,'   except (OSError,RuntimeError) as e:\n    proof=None','   except (OSError,RuntimeError) as e:\n    failed_subphase=a.get(\'readSubphase\',\'SCAN_CLOSE\');proof=None');
 s=one(s,"else:failed(pid,e,'scan-close')","else:failed(pid,e,'scan-close',failed_subphase)");
 s=one(s," finally:\n  for a in attachments.values():os.close(a['fd'])", " finally:\n  close_errors=[]\n  for a in attachments.values():\n   if 'fd' in a:\n    try:os.close(a['fd'])\n    except BaseException as error:close_errors.append(error)\n  need(not close_errors,'R29_CLEANUP_PIDFD_CLOSE_INCOMPLETE')");
 return s;
}
function transform(original,pin){
 need(sha(original)===pin,'R32_BOUND_CENSUS_ORIGINAL_GENERATED_BYTES_CHANGED');
 const start=original.indexOf('def process_record('),end=original.indexOf('def pidfd_poll(',start),cs=original.indexOf('def census():'),ce=original.indexOf('def workspace_sockets():',cs);
 need(start>0&&end>start&&cs>end&&ce>cs,'R32_BOUND_CENSUS_FUNCTION_BOUNDARIES_CHANGED');
 const record=original.slice(start,end),census=original.slice(cs,ce);
 const closed='CLOSED_READ_SUBPHASES=set('+JSON.stringify(boundProcessCensusR32ReadSubphases)+')\n';
 let result=one(original,record,closed+instrumentRecord(record));result=one(result,census,instrumentCensus(census));
 return result;
}
export function boundProcessCensusR32NativeProgram(){return transform(targetCleanupR29HostProgram(),boundProcessCensusR32Preparation.originalNativeSHA256)}
export function boundProcessCensusR32BuildProgram(){return transform(buildCleanupR29HostProgram(),boundProcessCensusR32Preparation.originalBuildSHA256)}
