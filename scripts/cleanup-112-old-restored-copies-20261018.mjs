import {remote,lanProfile,python} from './managed-server-client.mjs';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const names=['capture-upgrade-20261016-capture-complete-r35-112','capture-upgrade-20261016-factory-supervision-r36-112','capture-upgrade-20261017-personal-settings-r39-112','capture-upgrade-20261017-action-effectiveness-r40-112','capture-upgrade-20261017-project-oversight-r41-112','capture-upgrade-20261017-cc-supervisor-r43-r7-112','capture-upgrade-20261017-cc-supervisor-r44-r1-112'];
const privateDir='.secrets/migration-112';const publicPath='artifacts/migration-112/space-cleanup-public.json';
mkdirSync(privateDir,{recursive:true});mkdirSync('artifacts/migration-112',{recursive:true});
const shared=String.raw`
import os,json,stat,hashlib,datetime,fcntl,shutil,subprocess
from pathlib import Path
base=Path('/var/lib/jarvis-control')
allowlist=['capture-upgrade-20261016-capture-complete-r35-112','capture-upgrade-20261016-factory-supervision-r36-112','capture-upgrade-20261017-personal-settings-r39-112','capture-upgrade-20261017-action-effectiveness-r40-112','capture-upgrade-20261017-project-oversight-r41-112','capture-upgrade-20261017-cc-supervisor-r43-r7-112','capture-upgrade-20261017-cc-supervisor-r44-r1-112']
def need(v,msg):
 if not v:raise RuntimeError(msg)
def at():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def free():
 s=os.statvfs('/');return s.f_bavail*s.f_frsize
def serviceStates():
 return {name:subprocess.run(['systemctl','is-active',name],capture_output=True,text=True).stdout.strip() for name in ['jarvis-platform.service','jarvis-observer.service','jarvis-control.service','jarvis-voice.service','jarvis-cloud-relay.service','jarvis-frpc.service']}
def Hfile(path):
 h=hashlib.sha256();before=path.stat()
 with path.open('rb') as f:
  while True:
   b=f.read(8*1024*1024)
   if not b:break
   h.update(b)
 after=path.stat();need(identity(before)==identity(after),'FILE_CHANGED_WHILE_HASHING');return h.hexdigest()
def identity(st):return [st.st_dev,st.st_ino,st.st_mode,st.st_uid,st.st_gid,st.st_size,str(st.st_mtime_ns),str(st.st_ctime_ns)]
def roots(name):
 need(name in allowlist,'SCOPE_NOT_ALLOWED');r=base/name;a=r/'data-snapshot'/'payload';b=r/'restored-check'
 need(r.parent==base and r.resolve()==r and not r.is_symlink(),'CAPTURE_ROOT_INVALID')
 for folder in [a,b]:
  need(folder.resolve()==folder and folder.is_dir() and not folder.is_symlink() and not os.path.ismount(folder),'TREE_ROOT_INVALID')
 need(str(b)==str(base)+'/'+name+'/restored-check','DELETE_TARGET_INVALID');return r,a,b
def processRefs(root):
 refs=[]
 for proc in Path('/proc').iterdir():
  if not proc.name.isdigit():continue
  try:
   for fd in [proc/'cwd',proc/'exe',*(proc/'fd').iterdir()]:
    try:
     v=os.readlink(fd)
     if v==str(root) or v.startswith(str(root)+'/'):refs.append(int(proc.name))
    except OSError:pass
  except OSError:pass
 return sorted(set(refs))
def inventory(folder,hashContents):
 need(folder.resolve()==folder and folder.is_dir() and not folder.is_symlink(),'TREE_ROOT_INVALID');device=folder.stat().st_dev;rows=[];identities=[];files=0;directories=0;byteCount=0;allocated=0
 for walkRoot,ds,fs in os.walk(folder,followlinks=False):
  for x in [Path(walkRoot),*(Path(walkRoot)/n for n in sorted(fs)),*(Path(walkRoot)/n for n in sorted(ds) if (Path(walkRoot)/n).is_symlink())]:
   st=x.lstat();need(st.st_dev==device,'TREE_CROSS_DEVICE');need(not os.path.ismount(x),'TREE_CONTAINS_MOUNT');rel=str(x.relative_to(folder));kind=None;content=None
   if stat.S_ISREG(st.st_mode):kind='file';content=Hfile(x) if hashContents else None;files+=1;byteCount+=st.st_size
   elif stat.S_ISDIR(st.st_mode):kind='dir';directories+=1
   elif stat.S_ISLNK(st.st_mode):kind='symlink';content=os.readlink(x)
   else:raise RuntimeError('UNSUPPORTED_FILE')
   identities.append([rel,identity(st)]);allocated+=st.st_blocks*512
   rows.append([rel,kind,st.st_size if kind=='file' else 0,stat.S_IMODE(st.st_mode),st.st_uid,st.st_gid,content])
 rows.sort(key=lambda v:v[0]);identities.sort(key=lambda v:v[0]);encoded=json.dumps(rows,separators=(',',':')).encode();digest=hashlib.sha256(encoded).hexdigest() if hashContents else None
 return {'sha256':digest,'files':files,'directories':directories,'fileBytes':byteCount,'allocatedBytes':allocated,'entries':len(rows)},rows,identities
`;
const census=()=>JSON.parse(remote(lanProfile,'jarvis-112',python({},shared+String.raw`
print(json.dumps({'at':at(),'diskAvailableBytes':free(),'services':serviceStates(),'current':os.path.realpath('/opt/jarvis/current')}))
`),true));
const report=existsSync(publicPath)?JSON.parse(readFileSync(publicPath,'utf8')):{schemaVersion:1,goal:'112开发项目迁移前，仅清理已核对可由完整快照重建的旧隔离恢复副本',selection:{maximumCaptures:8,selectedCaptures:7,latestAllowedDate:'2026-10-17',all20261018CapturesExcluded:true},before:census(),items:[],complete:false,externalArchivePerformed:false,productionDataModified:false,servicesRestarted:false};
function save(){writeFileSync(publicPath,JSON.stringify(report,null,2)+'\n');}
save();
for(const name of names){
 const existing=report.items.find(x=>x.capture===name);if(existing?.deleted)continue;
 const privateProofPath=`${privateDir}/${name}-paired-proof.json`;
 let savedRaw=existing&&existsSync(privateProofPath)?readFileSync(privateProofPath,'utf8'):null;
 if(savedRaw&&createHash('sha256').update(savedRaw).digest('hex')!==existing.privatePairedProofSHA256)throw Error('SAVED_PROOF_HASH_MISMATCH');
 if(savedRaw&&JSON.parse(savedRaw).sourceIdentities.some(x=>typeof x[1][6]!=='string'||typeof x[1][7]!=='string')){const priorPath=`${privateDir}/${name}-paired-proof-before-timestamp-repair.json`;if(!existsSync(priorPath))writeFileSync(priorPath,savedRaw,{flag:'wx',mode:0o600});existing.proofRepair={reason:'Nanosecond identity timestamps serialized beyond JavaScript safe integer range; original retained privately and exact string identities rehashed.',priorProofSHA256:existing.privatePairedProofSHA256,priorDeletionRejected:true};savedRaw=null;save();}
 const proof=savedRaw?JSON.parse(savedRaw):JSON.parse(remote(lanProfile,'jarvis-112',python({name},shared+String.raw`
root,a,b=roots(p['name']);manifest=root/'data-snapshot'/'manifest.json';need(manifest.is_file() and not manifest.is_symlink(),'MANIFEST_INVALID');manifestHash=Hfile(manifest)
need(not processRefs(root),'CAPTURE_REFERENCED_BY_PROCESS');ai,ar,aid=inventory(a,True);bi,br,bid=inventory(b,True);need(Hfile(manifest)==manifestHash,'MANIFEST_CHANGED')
print(json.dumps({'at':at(),'candidate':str(b),'retainedSnapshot':str(a),'retainedManifest':str(manifest),'retainedManifestSHA256':manifestHash,'source':ai,'restoredCopy':bi,'equal':ar==br,'sourceEntries':ar,'copyEntries':br,'sourceIdentities':aid,'copyIdentities':bid,'current':os.path.realpath('/opt/jarvis/current'),'processReferences':processRefs(root)}))
`),true,{timeoutMs:180000}));
 const privateRaw=JSON.stringify(proof,null,2)+'\n';if(!savedRaw)writeFileSync(privateProofPath,privateRaw,{mode:0o600});
 const item=Object.assign(existing??{},{capture:name,path:proof.candidate,retainedSnapshot:proof.retainedSnapshot,retainedManifest:proof.retainedManifest,retainedManifestSHA256:proof.retainedManifestSHA256,source:proof.source,restoredCopy:proof.restoredCopy,identicalIncludingContentTypeModeUidGid:proof.equal,privatePairedProofSHA256:createHash('sha256').update(privateRaw).digest('hex'),verifiedAt:proof.at,deleted:false});
 if(!existing)report.items.push(item);save();
 if(!proof.equal||proof.processReferences.length){item.skipReason=!proof.equal?'TREE_MISMATCH':'PROCESS_REFERENCE';save();console.log(JSON.stringify({capture:name,deleted:false,reason:item.skipReason}));continue;}
 let result;try{result=JSON.parse(remote(lanProfile,'jarvis-112',python({name,manifestSHA256:proof.retainedManifestSHA256,sourceIdentities:proof.sourceIdentities,copyIdentities:proof.copyIdentities},shared+String.raw`
root,a,b=roots(p['name']);manifest=root/'data-snapshot'/'manifest.json';need(shutil.rmtree.avoids_symlink_attacks,'SAFE_RMTREE_UNAVAILABLE')
with (base/'capture-activate.lock').open('rb') as lock:
 try:fcntl.flock(lock,fcntl.LOCK_SH|fcntl.LOCK_NB)
 except BlockingIOError:raise RuntimeError('ACTIVATION_RUNNING_DELETE_DEFERRED')
 need(not processRefs(root),'CAPTURE_REFERENCED_BY_PROCESS');need(Hfile(manifest)==p['manifestSHA256'],'MANIFEST_CHANGED');ai,ar,aid=inventory(a,False);bi,br,bid=inventory(b,False)
 need(aid==p['sourceIdentities'] and bid==p['copyIdentities'],'TREE_CHANGED_SINCE_HASH');before=free();beforeServices=serviceStates();beforeCurrent=os.path.realpath('/opt/jarvis/current')
 need(b.resolve()==b and not b.is_symlink() and not os.path.ismount(b),'DELETE_TARGET_CHANGED');shutil.rmtree(b)
 need(not b.exists() and not b.is_symlink(),'DELETE_INCOMPLETE');afterSource,unusedRows,afterIds=inventory(a,False);need(afterIds==p['sourceIdentities'],'RETAINED_SNAPSHOT_CHANGED');need(Hfile(manifest)==p['manifestSHA256'],'RETAINED_MANIFEST_CHANGED')
 print(json.dumps({'at':at(),'deleted':True,'deletedAllocatedBytes':bi['allocatedBytes'],'deletedFileBytes':bi['fileBytes'],'diskAvailableBeforeBytes':before,'diskAvailableAfterBytes':free(),'retainedSnapshotUnchanged':True,'retainedManifestUnchanged':True,'servicesBefore':beforeServices,'servicesAfter':serviceStates(),'currentBefore':beforeCurrent,'currentAfter':os.path.realpath('/opt/jarvis/current'),'liveProcessReferences':[]}))
`),true,{timeoutMs:180000}));}catch(error){if(!error.message.includes('ACTIVATION_RUNNING_DELETE_DEFERRED')){item.deletionRejectedAt=new Date().toISOString();item.deletionRejectedReason=/RuntimeError: ([A-Z_]+)/.exec(error.message)?.[1]??'DELETE_RESPONSE_UNCONFIRMED';save();throw error;}item.deferredAt=new Date().toISOString();item.deferReason='ACTIVATION_RUNNING_DELETE_DEFERRED';report.after=census();save();console.log(JSON.stringify({capture:name,deleted:false,deferred:true,reason:item.deferReason}));process.exit(0);}
 Object.assign(item,result);writeFileSync(`${privateDir}/${name}-deletion-receipt.json`,JSON.stringify(result,null,2)+'\n',{mode:0o600});save();console.log(JSON.stringify({capture:name,deleted:item.deleted,deletedAllocatedBytes:item.deletedAllocatedBytes,diskAvailableAfterBytes:item.diskAvailableAfterBytes}));
}
report.after=census();report.deletedAllocatedBytes=report.items.reduce((n,x)=>n+(x.deletedAllocatedBytes??0),0);report.allRetainedSnapshotsUnchanged=report.items.every(x=>!x.deleted||(x.retainedSnapshotUnchanged&&x.retainedManifestUnchanged));report.complete=true;save();console.log(JSON.stringify({publicPath,...report.after,deletedAllocatedBytes:report.deletedAllocatedBytes,complete:true}));
