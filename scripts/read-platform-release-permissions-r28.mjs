/** Exact-release permissions dry run. No chmod/chown/link/restart/deploy operation. */
import {open,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {sha,canonical} from './run-factory-main-repair-r26.mjs';
import {settledReaders,closedLiveError} from './verify-platform-live-r28.mjs';
export const releasePermissionsR28Scope=Object.freeze({release:'20261012-supervision-r28-2',base:'/opt/jarvis/releases/20261012-supervision-r28-2',current:'/opt/jarvis/current',codeSHA256:'370bc32a7ecd8d484d9fa37960449d4bb8fb6e1204cac229a98b31516adc1b05',compiledTreeSHA256:'6b3e9aee435fd9e5e1f7eed71ea84d63e541f6c0fd7b0a8ae304db4d083544b4',compiledFiles:817});
const S=releasePermissionsR28Scope,need=(v,c)=>{if(!v)throw Error(c);};
export function permissionsR28Params(nodeId){need(['112','101'].includes(nodeId),'R28_LIVE_PERMISSION_NODE_INVALID');return {...S,nodeId};}
/** Caller must persist the dry-run binding before apply=True. No top-level writes. */
export const releasePermissionHardeningFragment=String.raw`
import os,stat,hashlib,json,re
from pathlib import Path
def release_permission_hardening(release,expected_archive_sha256,apply=False,expected_identity=None,expected_metadata_sha256=None):
 def require(v,c):
  if not v:raise RuntimeError(c)
 require(os.geteuid()==0 and isinstance(release,str) and re.fullmatch('[a-z0-9-]{1,80}',release) and isinstance(expected_archive_sha256,str) and re.fullmatch('[a-f0-9]{64}',expected_archive_sha256),'RELEASE_PERMISSION_SCOPE_INVALID')
 base=Path('/opt/jarvis/releases')/release
 for parent in [base.parent,*base.parent.parents]:
  s=parent.lstat();require(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'RELEASE_PERMISSION_ANCESTOR_UNTRUSTED')
 def signature(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
 def hashrows(rows):return hashlib.sha256(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()).hexdigest()
 fd=os.open(base,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);initial=os.fstat(fd);identity={'device':initial.st_dev,'inode':initial.st_ino};require(initial.st_uid==0 and signature(initial)==signature(base.lstat()),'RELEASE_PERMISSION_ROOT_UNTRUSTED')
 def marker():
  q=os.open('.managed-release.sha256',os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
  try:
   s=os.fstat(q);require(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and 0<s.st_size<=1024,'RELEASE_PERMISSION_MARKER_INVALID');raw=os.read(q,1025);require(len(raw)==s.st_size and signature(s)==signature(os.fstat(q))==signature(os.stat('.managed-release.sha256',dir_fd=fd,follow_symlinks=False)),'RELEASE_PERMISSION_MARKER_CHANGED');return raw.decode().strip()
  finally:os.close(q)
 def inventory():
  rows={};links=[];changes=[]
  def walk(directory,relative):
   before=os.fstat(directory);require(stat.S_ISDIR(before.st_mode) and before.st_uid==0,'RELEASE_PERMISSION_DIRECTORY_UNTRUSTED');rows[relative]=signature(before);names=sorted(os.listdir(directory))
   if before.st_mode&0o022:changes.append({'path':relative,'kind':'directory','beforeMode':stat.S_IMODE(before.st_mode),'afterMode':stat.S_IMODE(before.st_mode)&~0o022})
   for name in names:
    path=(relative+'/' if relative else '')+name;require(len(path)<=4096 and len(rows)<100000,'RELEASE_PERMISSION_INVENTORY_TOO_LARGE');s=os.stat(name,dir_fd=directory,follow_symlinks=False)
    if stat.S_ISDIR(s.st_mode):
     child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=directory)
     try:require(signature(s)==signature(os.fstat(child)),'RELEASE_PERMISSION_DIRECTORY_REPLACED');walk(child,path)
     finally:os.close(child)
    elif stat.S_ISREG(s.st_mode):
     require(s.st_uid==0,'RELEASE_PERMISSION_FILE_OWNER_UNTRUSTED');rows[path]=signature(s)
     if s.st_mode&0o022:
      require(s.st_nlink==1,'RELEASE_PERMISSION_WRITABLE_HARDLINK_REQUIRES_REVIEW');changes.append({'path':path,'kind':'file','beforeMode':stat.S_IMODE(s.st_mode),'afterMode':stat.S_IMODE(s.st_mode)&~0o022})
    elif stat.S_ISLNK(s.st_mode):
     text=os.readlink(name,dir_fd=directory);require(s.st_uid==0 and signature(s)==signature(os.stat(name,dir_fd=directory,follow_symlinks=False)),'RELEASE_PERMISSION_LINK_CHANGED');resolved=os.path.realpath(str(base/path));require(resolved==str(base) or resolved.startswith(str(base)+'/'),'RELEASE_PERMISSION_EXTERNAL_SYMLINK_REQUIRES_REVIEW');rows[path]=signature(s)+[hashlib.sha256(text.encode()).hexdigest()];links.append(path)
    else:raise RuntimeError('RELEASE_PERMISSION_SPECIAL_FILE_REQUIRES_REVIEW')
   require(names==sorted(os.listdir(directory)) and signature(before)==signature(os.fstat(directory)),'RELEASE_PERMISSION_DIRECTORY_CHANGED')
  walk(fd,'');return rows,links,changes
 try:
  require(marker()==expected_archive_sha256,'RELEASE_PERMISSION_ARCHIVE_BINDING_CHANGED');first=inventory();second=inventory();require(first==second and signature(os.fstat(fd))==signature(base.lstat()),'RELEASE_PERMISSION_SNAPSHOT_CHANGED');rows,links,changes=second;before_hash=hashrows(rows)
  if not apply:return {'release':release,'identity':identity,'archiveSHA256':expected_archive_sha256,'metadataSHA256':before_hash,'changes':changes,'symlinkBoundaries':links,'dryRun':True,'mutationsPerformed':False,'rule':'old_mode & ~0o022'}
  require(expected_identity==identity and isinstance(expected_metadata_sha256,str) and expected_metadata_sha256==before_hash,'RELEASE_PERMISSION_APPROVED_SNAPSHOT_REQUIRED')
  current={k:list(v) for k,v in rows.items()};applied=[]
  def open_bound(path,directory=False):
   pieces=path.split('/') if path else [];parent=os.dup(fd);prefix=''
   try:
    require(signature(os.fstat(parent))==current[''],'RELEASE_PERMISSION_ROOT_CHANGED')
    for part in pieces[:-1]:
     prefix=(prefix+'/' if prefix else '')+part;child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent);os.close(parent);parent=child;require(signature(os.fstat(parent))==current[prefix],'RELEASE_PERMISSION_PARENT_CHANGED')
    if not pieces:return parent
    target=os.open(pieces[-1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|(os.O_DIRECTORY if directory else 0),dir_fd=parent);os.close(parent);parent=None
    try:require(signature(os.fstat(target))==current[path],'RELEASE_PERMISSION_TARGET_CHANGED');return target
    except:os.close(target);raise
   except:
    if parent is not None:os.close(parent)
    raise
  # Close the writable directory namespace first, starting at the release root.
  order=sorted(changes,key=lambda v:(0 if v['kind']=='directory' else 1,v['path'].count('/'),v['path']))
  for change in order:
   target=open_bound(change['path'],change['kind']=='directory')
   try:
    before=os.fstat(target);require(before.st_uid==0 and stat.S_IMODE(before.st_mode)==change['beforeMode'],'RELEASE_PERMISSION_MODE_CAS_CONFLICT');os.fchmod(target,change['afterMode']);os.fsync(target);after=os.fstat(target);old=signature(before);new=signature(after);require(new[:4]==old[:4] and new[5:8]==old[5:8] and stat.S_IFMT(new[4])==stat.S_IFMT(old[4]) and stat.S_IMODE(new[4])==change['afterMode'],'RELEASE_PERMISSION_APPROVED_FIELDS_CHANGED');current[change['path']]=new;applied.append(change)
   finally:os.close(target)
  after=inventory();require(after[0]==current and after[1]==links and not after[2] and signature(os.fstat(fd))==signature(base.lstat()) and marker()==expected_archive_sha256,'RELEASE_PERMISSION_FINAL_READBACK_CHANGED');os.fsync(fd)
  return {'release':release,'identity':identity,'archiveSHA256':expected_archive_sha256,'beforeMetadataSHA256':before_hash,'afterMetadataSHA256':hashrows(after[0]),'applied':applied,'symlinkBoundaries':links,'dryRun':False,'mutationsPerformed':True,'verified':True,'rule':'old_mode & ~0o022','inodeUIDGIDSizeMtimePreserved':True,'symlinkTargetsModified':False,'restartPerformed':False}
 finally:os.close(fd)
`;
export const readReleasePermissionsR28Program=releasePermissionHardeningFragment+String.raw`
import os,stat,hashlib,json,pwd,grp,signal
from pathlib import Path
def need(v,c):
 if not v:raise RuntimeError(c)
def timeout(a,b):raise RuntimeError('R28_LIVE_PERMISSION_TIMEOUT')
signal.signal(signal.SIGALRM,timeout);signal.alarm(60)
need(os.geteuid()==0 and p['base']=='/opt/jarvis/releases/20261012-supervision-r28-2' and p['current']=='/opt/jarvis/current' and p['release']=='20261012-supervision-r28-2' and p['nodeId'] in ['112','101'] and p['codeSHA256']=='370bc32a7ecd8d484d9fa37960449d4bb8fb6e1204cac229a98b31516adc1b05' and p['compiledTreeSHA256']=='6b3e9aee435fd9e5e1f7eed71ea84d63e541f6c0fd7b0a8ae304db4d083544b4' and p['compiledFiles']==817,'R28_LIVE_PERMISSION_FIXED_SCOPE_INVALID')
base=Path(p['base']);current=Path(p['current']);jarvis_gid=grp.getgrnam('jarvis').gr_gid
def key(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def digest(v):return hashlib.sha256(v).hexdigest()
ancestors=[]
for q in [base.parent,*base.parent.parents]:
 s=q.lstat();need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'R28_LIVE_PERMISSION_ANCESTOR_UNTRUSTED');ancestors.append({'path':str(q),'uid':s.st_uid,'gid':s.st_gid,'mode':oct(stat.S_IMODE(s.st_mode))})
cs=current.lstat();need(stat.S_ISLNK(cs.st_mode) and cs.st_uid==0 and current.resolve(strict=True)==base,'R28_LIVE_PERMISSION_CURRENT_CHANGED');current_key=key(cs)
rootfd=os.open(base,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);root_key=key(os.fstat(rootfd));need(os.fstat(rootfd).st_uid==0,'R28_LIVE_PERMISSION_RELEASE_OWNER_INVALID')
def read_regular(parent,name,limit):
 fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
 try:
  a=os.fstat(fd);need(stat.S_ISREG(a.st_mode) and a.st_nlink==1 and 0<=a.st_size<=limit,'R28_LIVE_PERMISSION_FILE_INVALID');data=bytearray()
  while len(data)<=limit:
   part=os.read(fd,min(65536,limit+1-len(data)))
   if not part:break
   data.extend(part)
  need(key(a)==key(os.fstat(fd))==key(os.stat(name,dir_fd=parent,follow_symlinks=False)) and len(data)==a.st_size,'R28_LIVE_PERMISSION_FILE_CHANGED');return bytes(data)
 finally:os.close(fd)
need(read_regular(rootfd,'.managed-release.sha256',1024).decode().strip()==p['codeSHA256'],'R28_LIVE_PERMISSION_ARCHIVE_BINDING_CHANGED')
def inventory():
 rows=[];writable=[];ownership=[];links=[];compiled=[];executables=[];hardlink_rows={};counts={'directories':0,'regularFiles':0,'symlinks':0}
 def visit(fd,relative):
  a=os.fstat(fd);need(stat.S_ISDIR(a.st_mode),'R28_LIVE_PERMISSION_DIRECTORY_INVALID');rows.append([relative or '.',*key(a)]);counts['directories']+=1
  if a.st_mode&0o022:writable.append({'path':relative or '.','kind':'directory','uid':a.st_uid,'gid':a.st_gid,'mode':oct(stat.S_IMODE(a.st_mode)),'recommendedMode':oct(stat.S_IMODE(a.st_mode)&~0o022)})
  if a.st_uid!=0 or a.st_gid!=jarvis_gid:ownership.append(relative or '.')
  names=sorted(os.listdir(fd))
  for name in names:
   path=(relative+'/' if relative else '')+name;need(len(path)<=4096 and len(rows)<100000,'R28_LIVE_PERMISSION_INVENTORY_TOO_LARGE');s=os.stat(name,dir_fd=fd,follow_symlinks=False)
   if stat.S_ISDIR(s.st_mode):
    child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
    try:need(key(s)==key(os.fstat(child)),'R28_LIVE_PERMISSION_DIRECTORY_REPLACED');visit(child,path)
    finally:os.close(child)
   elif stat.S_ISREG(s.st_mode):
    rows.append([path,*key(s)]);counts['regularFiles']+=1;is_exec=bool(s.st_mode&0o111);desired=oct(stat.S_IMODE(s.st_mode)&~0o022)
    if s.st_nlink!=1:
     inode_key=(s.st_dev,s.st_ino);h=hardlink_rows.setdefault(inode_key,{'paths':[],'linkCount':s.st_nlink,'writableByGroupOrOther':bool(s.st_mode&0o022)});h['paths'].append(path)
    if is_exec:executables.append(path)
    if s.st_mode&0o022:writable.append({'path':path,'kind':'file','uid':s.st_uid,'gid':s.st_gid,'mode':oct(stat.S_IMODE(s.st_mode)),'recommendedMode':desired})
    if s.st_uid!=0 or s.st_gid!=jarvis_gid:ownership.append(path)
    if path.startswith('apps/api/dist/') or path.startswith('apps/web/dist/'):compiled.append([path,digest(read_regular(fd,name,16777216))])
   elif stat.S_ISLNK(s.st_mode):
    text=os.readlink(name,dir_fd=fd);need(key(s)==key(os.stat(name,dir_fd=fd,follow_symlinks=False)),'R28_LIVE_PERMISSION_LINK_CHANGED');resolved=os.path.realpath(str(base/path));inside=resolved==str(base) or resolved.startswith(str(base)+'/');links.append({'path':path,'targetSHA256':digest(text.encode()),'resolvesWithinRelease':inside,'targetObservedOnly':True,'followedForPermissionChange':False});rows.append([path,*key(s),digest(text.encode())]);counts['symlinks']+=1
   else:raise RuntimeError('R28_LIVE_PERMISSION_SPECIAL_FILE_REVIEW_REQUIRED')
  need(names==sorted(os.listdir(fd)) and key(a)==key(os.fstat(fd)),'R28_LIVE_PERMISSION_DIRECTORY_CHANGED')
 visit(rootfd,'');compiled.sort(key=lambda v:v[0]);need(len(compiled)==p['compiledFiles'] and digest(json.dumps(compiled,separators=(',',':')).encode())==p['compiledTreeSHA256'],'R28_LIVE_PERMISSION_COMPILED_BYTES_CHANGED')
 hardlinks=[{**v,'allLinksAccountedWithinRelease':len(v['paths'])==v['linkCount']} for _,v in sorted(hardlink_rows.items())]
 return {'metadataSHA256':digest(json.dumps(rows,separators=(',',':')).encode()),'counts':counts,'writable':writable,'ownershipCorrections':ownership,'symlinkBoundaries':links,'hardlinkBoundaries':hardlinks,'existingExecutableFiles':executables}
try:
 first=inventory();second=inventory();need(first==second and key(os.fstat(rootfd))==root_key and key(base.lstat())==root_key and key(current.lstat())==current_key and current.resolve(strict=True)==base,'R28_LIVE_PERMISSION_INVENTORY_CHANGED');need(read_regular(rootfd,'.managed-release.sha256',1024).decode().strip()==p['codeSHA256'],'R28_LIVE_PERMISSION_MARKER_CHANGED')
 fragment_plan=release_permission_hardening(p['release'],p['codeSHA256'],apply=False)
 need(fragment_plan['identity']=={'device':root_key[0],'inode':root_key[1]} and len(fragment_plan['changes'])==len(second['writable']) and key(base.lstat())==root_key,'R28_LIVE_PERMISSION_FRAGMENT_PLAN_CHANGED')
 result={'schemaVersion':1,'kind':'jarvis-r28-release-permissions-read-only-plan','nodeId':p['nodeId'],'release':p['release'],'releaseIdentity':{'device':root_key[0],'inode':root_key[1]},'codeSHA256':p['codeSHA256'],'compiledTreeSHA256':p['compiledTreeSHA256'],'compiledFiles':p['compiledFiles'],'ancestors':ancestors,**second,'applicationFragmentDryRun':fragment_plan,'permissionRule':'old_mode & ~0o022','rootOwnershipMustBeVerified':True,'ownershipChangesProposed':False,'private700And600Preserved':True,'existingExecuteBitsPreserved':True,'readAccessExpanded':False,'symlinkPolicy':'never follow or chmod; parent directory protection only; outside targets unverified','allLinksRequireExplicitApplicationBoundary':bool(second['symlinkBoundaries']),'directFileInodesWouldRemain':True,'dryRun':True,'mutationsPerformed':False,'privateConfigurationRead':False,'modelCalls':0}
 raw=json.dumps(result,separators=(',',':'));need(len(raw.encode())<1900000,'R28_LIVE_PERMISSION_OUTPUT_TOO_LARGE');print(raw)
finally:os.close(rootfd)
`;
export async function readReleasePermissionsR28(){const rows=await settledReaders(['112','101'].map(id=>()=>JSON.parse(remote(lanProfile,'jarvis-'+id,python(permissionsR28Params(id),readReleasePermissionsR28Program),true,{timeoutMs:75000}))));return {schemaVersion:1,kind:'jarvis-r28-release-permissions-independent-dry-run',at:new Date().toISOString(),scope:S,passed:rows.every(r=>r.status==='fulfilled'),nodes:rows.flatMap(r=>r.status==='fulfilled'?[r.value]:[]),errors:rows.flatMap((r,i)=>r.status==='rejected'?[{nodeId:['112','101'][i],errorCode:closedLiveError(r.reason)}]:[]),applicationAuthorized:false,remoteMutationsPerformed:false,restartsPerformed:false,modelsInvoked:false,rawLogsExported:false};}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){need(process.argv.length===2,'R28_LIVE_PERMISSION_NO_MUTATION_ARGUMENTS_ALLOWED');const r=await readReleasePermissionsR28(),out='artifacts/software-factory/acceptance-r28/release-permissions-dry-run-'+Date.now()+'-'+randomUUID()+'.json';await mkdir('artifacts/software-factory/acceptance-r28',{recursive:true});const raw=JSON.stringify(r,null,2)+'\n',f=await open(out,'wx',0o644);try{await f.writeFile(raw);await f.sync();}finally{await f.close();}console.log(JSON.stringify({output:out,sha256:sha(raw),passed:r.passed,errors:r.errors,nodes:r.nodes.map(n=>({nodeId:n.nodeId,counts:n.counts,writable:n.writable.length,ownershipCorrections:n.ownershipCorrections.length,symlinks:n.symlinkBoundaries.length,metadataSHA256:n.metadataSHA256}))}));if(!r.passed)process.exitCode=1;}
