"""Execute the single SHA-bound 2026-10-18 retention plan, after explicit --execute.

No service commands, new backups, models, production data targets, or link following.
--check is metadata-only: it never runs recovery verify (which creates SQLite probes).
"""
import argparse,datetime,hashlib,importlib.util,json,os,re,shutil,signal,stat,sys,uuid
from pathlib import Path,PurePosixPath

PLAN_SHA256='6643767cc71ee6c867f1430d7fd5daaa70681547ad48bdec7d1999202ce6a00c'
GUARD_SHA256='88cda2b6ff1a7cf73aedaee85d27da4b4af7db51b8a3bdf00f0b5fb752294124'
CONTROL=Path('/var/lib/jarvis-control')
RELEASES=Path('/opt/jarvis/releases')
CURRENT=Path('/opt/jarvis/current')
MAX_PLAN=8*1024*1024
STOP=None

class ExecutionError(RuntimeError):pass
def need(ok,code):
 if not ok:raise ExecutionError(code)
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def sha(raw):return hashlib.sha256(raw).hexdigest()
def canon(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def stopped():need(STOP is None,'STOP_REQUESTED')
def code(error):
 value=str(error).split(':',1)[0].split(' ',1)[0]
 return value if re.fullmatch(r'[A-Z][A-Z0-9_]{2,100}',value) else 'RETENTION_EXECUTION_FAILED'
def failure(error,phase):
 raw=str(error).encode('utf-8','replace')
 return {'at':now(),'phase':phase,'code':code(error),'messageSHA256':sha(raw),'messageBytes':len(raw),'rawMessageRetained':False}
def path_inside(path,parent):
 try:Path(path).relative_to(Path(parent));return True
 except ValueError:return False
def overlaps(a,b):return path_inside(a,b) or path_inside(b,a)
def ident(path):
 s=os.lstat(path)
 return {'dev':str(s.st_dev),'ino':str(s.st_ino),'mode':oct(stat.S_IMODE(s.st_mode)),'uid':s.st_uid,'gid':s.st_gid,'size':str(s.st_size),'mtimeNs':str(s.st_mtime_ns),'ctimeNs':str(s.st_ctime_ns),'directory':stat.S_ISDIR(s.st_mode),'symlink':stat.S_ISLNK(s.st_mode)}
def signature(s):return (s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def mounts():
 out=[]
 for line in Path('/proc/self/mountinfo').read_text().splitlines():
  fields=line.split()
  if len(fields)>4:out.append(Path(re.sub(r'\\([0-7]{3})',lambda m:chr(int(m.group(1),8)),fields[4])))
 return out
def no_links(path):
 p=Path(path)
 for component in [*reversed(p.parents),p]:
  s=os.lstat(component)
  need(not stat.S_ISLNK(s.st_mode),'SYMLINK_COMPONENT_REJECTED')
 return p
def read_regular(path,limit,private=False):
 no_links(path);s=os.lstat(path)
 need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<=limit,'INPUT_FILE_UNSAFE')
 if private:need(s.st_uid==0 and stat.S_IMODE(s.st_mode)==0o600,'INPUT_PRIVATE_MODE_REQUIRED')
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  before=os.fstat(fd);parts=[];total=0
  while total<=limit:
   part=os.read(fd,min(262144,limit+1-total))
   if not part:break
   total+=len(part);parts.append(part)
  after=os.fstat(fd)
 finally:os.close(fd)
 need(signature(before)==signature(after) and total<=limit,'INPUT_FILE_CHANGED')
 return b''.join(parts)
def protected_paths(plan):
 out=[Path(row['path'])/'data-snapshot'/'payload' for row in plan['selectedSnapshots']]
 out.extend(Path(row['path']) for row in plan['keepReleases'])
 out.append(Path(plan['currentRealpath']))
 return out

def validate_target(row,plan,*,control=CONTROL,releases=RELEASES,mount_points=None,fixture=False):
 """Pure boundary/type/identity gate; no mutation, suitable for tiny local fixtures."""
 value=row.get('path');need(isinstance(value,str) and value and '\x00' not in value,'TARGET_PATH_INVALID')
 if not fixture:
  need(value.startswith('/') and str(PurePosixPath(value))==value and '..' not in PurePosixPath(value).parts,'TARGET_PATH_ESCAPE')
 else:need('..' not in Path(value).parts,'TARGET_PATH_ESCAPE')
 target=Path(value);kind=row.get('kind');root=control if path_inside(target,control) else releases if path_inside(target,releases) else None
 need(root is not None and target!=root,'TARGET_OUTSIDE_ALLOWED_ROOTS')
 rel=target.relative_to(root).parts
 need(not any(overlaps(target,p) for p in protected_paths(plan)),'RETAINED_TARGET_REJECTED')
 known={c['name'] for c in plan['allCaptureSummaries']};selected={c['name'] for c in plan['selectedSnapshots']}
 if kind=='old-snapshot-payload':allowed=root==control and len(rel)==3 and rel[0] in known-selected and rel[1:]==('data-snapshot','payload')
 elif kind=='isolated-restore-check':allowed=root==control and len(rel)==2 and rel[0] in known and rel[1]=='restored-check'
 elif kind=='old-pre-upgrade-data':allowed=root==control and len(rel)==2 and rel[0].startswith('pre-') and rel[1]=='data'
 elif kind=='old-migration-data':allowed=root==control and len(rel)==2 and rel[0].startswith(('migration-','failed-migration-')) and rel[1]=='data'
 elif kind=='historical-release':allowed=root==releases and len(rel)==1 and re.fullmatch(r'20[0-9]{6}-[A-Za-z0-9_.-]{1,160}',rel[0]) is not None
 else:allowed=False
 need(allowed,'TARGET_KIND_BOUNDARY_INVALID')
 no_links(target);actual=ident(target)
 need(actual['directory'] and not actual['symlink'],'TARGET_NOT_PLAIN_DIRECTORY')
 need(actual==row['identity'],'TARGET_IDENTITY_CHANGED')
 need(actual['dev']==str(os.lstat(root).st_dev),'TARGET_DEVICE_CHANGED')
 need(Path(os.path.realpath(target))==target,'TARGET_REALPATH_CHANGED')
 need(not any(path_inside(m,target) for m in (mount_points if mount_points is not None else mounts())),'TARGET_CONTAINS_MOUNT')
 return target

def validate_plan(plan):
 need(plan.get('schemaVersion')==1 and plan.get('kind')=='jarvis-112-two-recovery-points-readonly-retention-plan' and plan.get('complete') is True,'PLAN_CONTRACT_INVALID')
 retained=plan.get('selectedSnapshots',[])
 need(len(retained)==2 and len({r['name'] for r in retained})==2,'TWO_RETAINED_POINTS_REQUIRED')
 need(len(plan.get('candidates',[]))==136,'FIXED_CANDIDATE_COUNT_CHANGED')
 targets=[r['path'] for r in plan['candidates']]
 need(len(set(targets))==len(targets),'DUPLICATE_TARGET')
 for i,target in enumerate(targets):need(not any(overlaps(target,p) for p in targets[:i]),'OVERLAPPING_TARGETS')
 need(plan.get('currentRealpath')==str(RELEASES/plan['currentRelease']),'CURRENT_PLAN_PATH_INVALID')

def load_guard(path):
 raw=read_regular(path,2*1024*1024)
 need(GUARD_SHA256!='GUARD_MODULE_NOT_FROZEN' and sha(raw)==GUARD_SHA256,'GUARD_MODULE_PIN_MISMATCH')
 spec=importlib.util.spec_from_file_location('jarvis_retention_guard',path)
 module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module
 exec(compile(raw,str(path),'exec'),module.__dict__)
 return module

def capture_names():
 return {e.name for e in os.scandir(CONTROL) if e.is_dir(follow_symlinks=False) and e.name.startswith('capture-')}

def selected_bindings(plan,expected_capture_names=None):
 need(str(CURRENT.resolve(strict=True))==plan['currentRealpath'],'CURRENT_RELEASE_CHANGED')
 if expected_capture_names is not None:need(capture_names()==expected_capture_names,'CAPTURE_DIRECTORY_SET_CHANGED')
 names=[]
 for row in plan['selectedSnapshots']:
  root=Path(row['path']);need(root==CONTROL/row['name'],'RETAINED_ROOT_BOUNDARY_INVALID')
  raw=read_regular(root/'data-snapshot'/'manifest.json',4*1024*1024)
  need(sha(raw)==row['manifestSHA256'],'RETAINED_MANIFEST_CHANGED')
  manifest=json.loads(raw);need(manifest.get('createdAt')==row['createdAt'] and manifest.get('release')==row['release'],'RETAINED_MANIFEST_BINDING_CHANGED')
  names.append(row['name'])
  for filename,key in [('activation.json','activationSHA256'),('activation-failed.json','activationFailedSHA256'),('rollback.json','rollbackSHA256'),('node-before.json','nodeBeforeSHA256'),('previous-release.txt','previousReleaseSHA256')]:
   expected=row.get(key)
   if expected is not None:need(sha(read_regular(root/filename,4*1024*1024))==expected,'RETAINED_ACTIVATION_BINDING_CHANGED')
 # Any newly completed snapshot newer than the second retained point invalidates
 # this fixed allowlist. Unknown/new in-flight metadata also stops the operation.
 known={r['name']:r for r in plan['allCaptureSummaries']}
 def epoch(value):
  parsed=datetime.datetime.fromisoformat(value.replace('Z','+00:00'));need(parsed.tzinfo is not None,'CAPTURE_TIMEZONE_REQUIRED');return parsed.timestamp()
 cut=min(epoch(r['createdAt']) for r in plan['selectedSnapshots'])
 for entry in os.scandir(CONTROL):
  if not entry.is_dir(follow_symlinks=False):continue
  m=Path(entry.path)/'data-snapshot'/'manifest.json'
  if not m.exists():continue
  raw=read_regular(m,4*1024*1024);v=json.loads(raw);created=v.get('createdAt')
  if isinstance(created,str) and epoch(created)>cut and entry.name not in names:raise ExecutionError('NEWER_SNAPSHOT_REPLAN_REQUIRED')
  if entry.name not in known and isinstance(created,str):raise ExecutionError('NEW_CAPTURE_REPLAN_REQUIRED')
 return names

def selector_bindings(guard,plan):
 selected=guard.select_latest_two()
 expected={(str(Path(r['path'])),r['manifestSHA256'],r.get('activationSHA256') or r.get('activationFailedSHA256')) for r in plan['selectedSnapshots']}
 actual={(r['capture'],r['manifestSHA256'],r['terminalSHA256']) for r in selected['kept']}
 need(actual==expected,'LATEST_TWO_SELECTION_CHANGED')
 return {'selectionSHA256':selected['selectionSHA256'],'protectedCaptureCount':len(selected['protected'])}

def dependency_paths(guard,plan):
 out=[];pins=[]
 for row in plan['selectedSnapshots']:
  pinned=guard.pinned_recovery(Path(row['path']))
  need(isinstance(pinned,dict) and isinstance(pinned.get('path'),(str,Path)),'RECOVERY_PIN_CONTRACT_INVALID')
  path=Path(pinned['path']);resolved=path.resolve(strict=True)
  out.extend([path,resolved]);pins.append({'capture':row['name'],**pinned,'path':str(path),'realpath':str(resolved)})
 return list(dict.fromkeys(out)),pins

def refcheck(guard,paths,*,process_only=False):
 result=guard.references([str(p) for p in paths],**({'scan_roots':()} if process_only else {}))
 need(isinstance(result,dict) and 'blocked' in result,'REFERENCES_CONTRACT_INVALID')
 return result

def owners(row):
 # The immutable plan has uid0 roots plus three migration/data uid997 roots.
 # Root's separate read-only inspection confirmed uid973 historical data files.
 root_uid=row['identity']['uid'];need(root_uid in (0,997),'UNREVIEWED_TARGET_OWNER')
 return (0,) if row['kind']=='historical-release' else tuple(sorted({0,973,root_uid}))

def release_tree_guard(path):
 """Delete-only metadata census of an exact reviewed historical program tree.

 Owner/mode/hardlinks are recorded, never repaired. Hardlink unlinking removes
 only directory entries; symlinks are leaves. Mounts/devices/specials are refused.
 """
 root=Path(path);no_links(root);before_root=os.lstat(root);root_dev=before_root.st_dev
 need(stat.S_ISDIR(before_root.st_mode),'RELEASE_ROOT_NOT_DIRECTORY')
 need(not any(path_inside(m,root) for m in mounts()),'TARGET_CONTAINS_MOUNT')
 entries=[];total=0;files=0;directories=0
 def sig(s):return [str(s.st_dev),str(s.st_ino),s.st_mode,s.st_uid,s.st_gid,s.st_nlink,s.st_size,str(s.st_mtime_ns),str(s.st_ctime_ns)]
 def walk(item):
  nonlocal total,files,directories
  st=os.lstat(item);need(st.st_dev==root_dev,'RELEASE_CROSS_DEVICE_REFUSED');relative=item.relative_to(root).as_posix()
  if stat.S_ISDIR(st.st_mode):
   directories+=1;entries.append([relative,'directory',sig(st)])
   with os.scandir(item) as scan:names=sorted(e.name for e in scan)
   for name in names:need(name not in ('.','..') and '/' not in name,'RELEASE_ENTRY_NAME_INVALID');walk(item/name)
  elif stat.S_ISREG(st.st_mode):files+=1;total+=st.st_size;entries.append([relative,'file',sig(st)])
  elif stat.S_ISLNK(st.st_mode):entries.append([relative,'symlink',sig(st),os.readlink(item)])
  else:raise ExecutionError('RELEASE_SPECIAL_FILE_REFUSED')
  need(signature(st)==signature(os.lstat(item)),'RELEASE_TREE_CHANGED_DURING_SCAN')
 walk(root);need(signature(before_root)==signature(os.lstat(root)),'RELEASE_ROOT_CHANGED')
 return {'path':str(root),'guardType':'historical-release-delete-only','entries':entries,'metadataSHA256':sha(canon(entries).encode()),'bytes':total,'files':files,'directories':directories,'contentHashesComputed':False,'leafSymlinksFollowed':False,'ownersAndModesRecordedWithoutChanges':True,'hardlinksUnlinkedOnly':True}

def tree_guard(guard,row):
 if row['kind']=='historical-release':return release_tree_guard(row['path'])
 return guard.guard_tree(row['path'],uid=owners(row),allow_leaf_symlinks=False)

def assert_delete_tree_unchanged(guard,tree):
 if tree.get('guardType')=='historical-release-delete-only':
  fresh=release_tree_guard(tree['path']);need(fresh['entries']==tree['entries'],'RELEASE_TREE_CHANGED')
 else:guard.assert_tree_unchanged(tree)

def compare_preflight_tree(before,current,unlink_ledger):
 old=before['entries'];new=current['entries'];need(len(old)==len(new),'PREDELETE_TREE_CHANGED_SINCE_PREFLIGHT')
 link_updates=0
 for a,b in zip(old,new):
  if a==b:continue
  need(before.get('guardType')=='historical-release-delete-only' and a[:2]==b[:2] and a[1] in ('file','symlink') and a[3:]==b[3:],'PREDELETE_TREE_CHANGED_SINCE_PREFLIGHT')
  sa,sb=a[2],b[2];dropped=unlink_ledger.get((sa[0],sa[1]),0)
  # Earlier authorized unlink of a shared inode can reduce nlink and advance
  # ctime. Every other field, including size/mtime/mode/owner/inode, must match.
  need(dropped>0 and sa[5]>1 and sa[5]-sb[5]==dropped and sb[5]>=1 and all(sa[i]==sb[i] for i in range(len(sa)) if i not in (5,8)),'PREDELETE_TREE_CHANGED_SINCE_PREFLIGHT')
  link_updates+=1
 return link_updates

def record_unlinks(tree,ledger):
 if tree.get('guardType')!='historical-release-delete-only':return
 for entry in tree['entries']:
  if entry[1] in ('file','symlink'):
   s=entry[2];key=(s[0],s[1])
   if s[5]>1 or key in ledger:ledger[key]=ledger.get(key,0)+1

def atomic_json(path,value):
 path=Path(path);temporary=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
 fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 try:
  with os.fdopen(fd,'w',encoding='utf-8') as stream:json.dump(value,stream,ensure_ascii=False,separators=(',',':'));stream.write('\n');stream.flush();os.fsync(stream.fileno())
  os.replace(temporary,path)
  parent=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:os.fsync(parent)
  finally:os.close(parent)
 finally:
  try:os.unlink(temporary)
  except FileNotFoundError:pass

def safe_rmtree(target,expected):
 """Standard library's fd-safe remover, anchored to a no-follow parent FD."""
 need(shutil.rmtree.avoids_symlink_attacks,'FD_SAFE_RMTREE_UNAVAILABLE')
 no_links(target.parent)
 parent=os.open(target.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 target_fd=None
 try:
  target_fd=os.open(target.name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
  s=os.fstat(target_fd);need(signature(s)==signature(os.stat(target.name,dir_fd=parent,follow_symlinks=False)),'TARGET_SWAPPED_BEFORE_DELETE')
  need(ident(target)==expected,'TARGET_IDENTITY_CHANGED')
  # rmtree reopens with O_NOFOLLOW/dir_fd and checks its own lstat/open identity;
  # symlinks inside are unlinked as leaves, never followed to their targets.
  shutil.rmtree(target.name,dir_fd=parent)
  try:os.stat(target.name,dir_fd=parent,follow_symlinks=False)
  except FileNotFoundError:return
  raise ExecutionError('TARGET_STILL_PRESENT_AFTER_DELETE')
 finally:
  if target_fd is not None:os.close(target_fd)
  os.close(parent)

def make_parser():
 p=argparse.ArgumentParser(description=__doc__)
 source=p.add_mutually_exclusive_group(required=True);source.add_argument('--plan');source.add_argument('--plan-stdin',action='store_true')
 mode=p.add_mutually_exclusive_group();mode.add_argument('--check',action='store_true');mode.add_argument('--execute',action='store_true')
 p.add_argument('--guard-module',required=True)
 p.add_argument('--private-dir',default=str(CONTROL/'retention-execution-20261018'))
 p.add_argument('--verify-timeout',type=int,default=600)
 return p

def main():
 global STOP
 args=make_parser().parse_args();phase='startup';journal=None;run_dir=None;lockfd=None;guard=None;plan=None
 report={'schemaVersion':1,'kind':'jarvis-112-fixed-retention-execution','complete':False,'executed':bool(args.execute),'startedAt':now(),'planSHA256':PLAN_SHA256,'guardSHA256':GUARD_SHA256,'modelsInvoked':False,'serviceOperations':0,'newBackupsCreated':0,'payloadRehashedByCheck':False,'deletedDirectories':0,'plannedAllocatedBytesDeleted':0,'heldCandidates':[],'failures':[]}
 def save():
  if journal is not None:atomic_json(run_dir/'journal.private.json',journal)
 def event(value):
  journal['events'].append({'at':now(),**value});save()
 try:
  need(sys.platform.startswith('linux') and os.geteuid()==0,'LINUX_ROOT_REQUIRED')
  need(30<=args.verify_timeout<=1800,'VERIFY_TIMEOUT_INVALID')
  raw=sys.stdin.buffer.read(MAX_PLAN+1) if args.plan_stdin else read_regular(Path(args.plan),MAX_PLAN,private=True)
  need(len(raw)<=MAX_PLAN and sha(raw)==PLAN_SHA256,'FIXED_PLAN_SHA256_MISMATCH')
  plan=json.loads(raw);validate_plan(plan)
  guard=load_guard(Path(args.guard_module))
  if args.execute:
   phase='activation-lock'
   import fcntl
   lockpath=CONTROL/'capture-activate.lock';no_links(lockpath)
   lockfd=os.open(lockpath,os.O_RDONLY|os.O_NOFOLLOW);s=os.fstat(lockfd)
   need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600,'ACTIVATION_LOCK_UNSAFE')
   try:fcntl.flock(lockfd,fcntl.LOCK_EX|fcntl.LOCK_NB)
   except BlockingIOError:raise ExecutionError('ACTIVATION_LOCK_BUSY')
  baseline_capture_names=capture_names();selected_bindings(plan,baseline_capture_names)
  selection_proof=selector_bindings(guard,plan)
  dependencies,pins=dependency_paths(guard,plan)
  dependencies.extend([Path(__file__).resolve(),Path(args.guard_module).resolve()])
  report.update({'currentRelease':plan['currentRelease'],'plannedCandidateDirectories':len(plan['candidates']),'retainedSnapshots':[{'capture':r['name'],'release':r['release'],'manifestSHA256':r['manifestSHA256']} for r in plan['selectedSnapshots']],'recoveryToolPins':[{'capture':p['capture'],'sha256':p.get('sha256'),'manifestSHA256':p.get('manifestSHA256')} for p in pins]})
  phase='all-target-preflight';possible=[];eligible=[];preflight_trees={}
  mp=mounts()
  for i,row in enumerate(plan['candidates']):
   target=validate_target(row,plan,mount_points=mp)
   if any(overlaps(target,p) for p in dependencies):report['heldCandidates'].append({'index':i,'kind':row['kind'],'reason':'PINNED_TOOL_DEPENDENCY'});continue
   preflight_trees[i]=tree_guard(guard,row)
   possible.append((i,row))
  # One global symlink/proc census per pass, rather than 136 complete scans.
  # Recompute only if holding one tree exposes links from it to another target.
  reference_proofs=[]
  while possible:
   batch_paths=list(dict.fromkeys(p for _,r in possible for p in [r['ownerRoot'],r['path']]))
   refs=refcheck(guard,batch_paths);reference_proofs.append(refs)
   blocked={str(r.get('target')) for r in refs.get('references',[])}
   held_this=[(i,r) for i,r in possible if r['ownerRoot'] in blocked or r['path'] in blocked]
   if not held_this:break
   held_indices={i for i,_ in held_this}
   for i,row in held_this:report['heldCandidates'].append({'index':i,'kind':row['kind'],'reason':'LIVE_PROCESS_OR_SYMLINK_REFERENCE'})
   possible=[item for item in possible if item[0] not in held_indices]
  eligible=possible
  report['eligibleDirectories']=len(eligible)
  if not args.execute:
   report.update({'complete':True,'phase':'check-complete','recoveryContentsVerifiedThisRun':False,'checkScope':'fixed plan/bindings/root identities/types/devices/mounts/live references/tool pins only; no mutation, lock acquisition, recovery probe or deletion'});return report

  phase='private-evidence-directory'
  base=Path(args.private_dir);need(base.parent==CONTROL and re.fullmatch(r'retention-execution-[A-Za-z0-9_.-]{1,100}',base.name),'PRIVATE_EVIDENCE_BOUNDARY_INVALID')
  if not base.exists():base.mkdir(mode=0o700)
  no_links(base);s=base.stat();need(s.st_uid==0 and stat.S_IMODE(s.st_mode)==0o700,'PRIVATE_EVIDENCE_MODE_INVALID')
  run_id=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:12];run_dir=base/run_id;run_dir.mkdir(mode=0o700)
  journal={'schemaVersion':1,'runId':run_id,'startedAt':now(),'planSHA256':PLAN_SHA256,'guardSHA256':GUARD_SHA256,'selfSHA256':sha(Path(__file__).read_bytes()),'complete':False,'events':[],'recoveryToolPins':pins,'initialReferenceProofs':reference_proofs,'selectionProof':selection_proof,'baselineCaptureNames':sorted(baseline_capture_names),'report':report};save();report['runId']=run_id
  for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]:signal.signal(sig,lambda n,frame:globals().__setitem__('STOP',STOP or n))
  phase='retained-full-recovery-verification';selected_bindings(plan,baseline_capture_names);stopped()
  verified=[]
  for row in plan['selectedSnapshots']:
   stopped();value=guard.verify_retained(Path(row['path']),timeout=args.verify_timeout)
   need(isinstance(value,dict),'RETAINED_VERIFY_CONTRACT_INVALID')
   verified.append(value);event({'state':'retained-verified','capture':row['name'],'result':value})
  report['recoveryContentsVerifiedThisRun']=True;report['recoveryVerificationCount']=len(verified)
  selected_bindings(plan,baseline_capture_names);selector_bindings(guard,plan)
  retained_trees=[guard.guard_tree(Path(r['path'])/'data-snapshot'/'payload',uid=0) for r in plan['selectedSnapshots']]
  phase='exact-allowlist-deletion'
  unlink_ledger={}
  for index,row in eligible:
   stopped();selected_bindings(plan,baseline_capture_names)
   target=validate_target(row,plan)
   # Re-pin the actual recovery dependencies after verification, before deletion.
   live_deps,_=dependency_paths(guard,plan)
   if any(overlaps(target,p) for p in [*dependencies,*live_deps]):
    report['heldCandidates'].append({'index':index,'kind':row['kind'],'reason':'PINNED_TOOL_DEPENDENCY'});event({'index':index,'path':str(target),'state':'held-tool-dependency'});continue
   refs=refcheck(guard,[row['ownerRoot'],target],process_only=True)
   if refs['blocked']:
    report['heldCandidates'].append({'index':index,'kind':row['kind'],'reason':'LIVE_PROCESS_OR_SYMLINK_REFERENCE'});event({'index':index,'path':str(target),'state':'held-live-reference','referenceProof':refs});continue
   tree=tree_guard(guard,row)
   link_updates=compare_preflight_tree(preflight_trees[index],tree,unlink_ledger)
   assert_delete_tree_unchanged(guard,tree)
   validate_target(row,plan);stopped()
   event({'index':index,'path':str(target),'kind':row['kind'],'state':'deleting','identity':row['identity'],'plannedAllocatedBytes':row['allocatedBytes'],'expectedHardlinkMetadataUpdatesFromEarlierAuthorizedUnlinks':link_updates,'treeProof':{k:v for k,v in tree.items() if k!='entries'}})
   safe_rmtree(target,row['identity'])
   record_unlinks(tree,unlink_ledger)
   report['deletedDirectories']+=1;report['plannedAllocatedBytesDeleted']+=row['allocatedBytes'] or 0
   v=os.statvfs(CONTROL);event({'index':index,'path':str(target),'state':'deleted','availableBytesAfter':v.f_bavail*v.f_frsize})
  phase='retained-after-check';selected_bindings(plan,baseline_capture_names);selector_bindings(guard,plan)
  for tree in retained_trees:guard.assert_tree_unchanged(tree)
  report['retainedPayloadMetadataUnchanged']=True;report['complete']=True;report['policyFullyApplied']=not report['heldCandidates'];report['phase']='complete';journal['complete']=True
  return report
 except BaseException as error:
  item=failure(error,phase);report['failures'].append(item);report['phase']=phase
  if journal is not None:journal['failure']=item
  return report
 finally:
  report['finishedAt']=now()
  if sys.platform.startswith('linux'):
   try:v=os.statvfs(CONTROL);report['availableBytesAfter']=v.f_bavail*v.f_frsize
   except OSError:pass
  if journal is not None:
   journal['report']=report;journal['finishedAt']=now()
   try:save();atomic_json(run_dir/'public-report.json',report)
   except BaseException:report['complete']=False;report['failures'].append({'code':'PRIVATE_EVIDENCE_WRITE_FAILED','phase':'finally'})
  if lockfd is not None:os.close(lockfd)

if __name__=='__main__':
 result=main()
 try:print(json.dumps(result,separators=(',',':')))
 except BrokenPipeError:pass
 sys.exit(0 if result.get('complete') else 1)
