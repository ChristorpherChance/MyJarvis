/** Explicit public-file delta into the new R27 copy only. Importing performs no IO. */
import {readFile,open,mkdir,lstat,rename,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {sha,canonical,repairScope as S} from './run-factory-main-repair-r26.mjs';
import {r27HostBase,r27HostConstants as C} from './factory-verifier-host-r27.mjs';
import {r27VerifierScope as V,assertR27Observation} from './prepare-factory-verifier-r27.mjs';
import {fixedToolSHA} from './prepare-factory-repair-verifier-r26.mjs';
import {remote,lanProfile,python,withPlatform} from './managed-server-client.mjs';
import {queueState} from './run-factory-supervision-probe.mjs';
const need=(v,c)=>{if(!v)throw Error(c);},H=/^[a-f0-9]{64}$/;
const same=(a,b)=>canonical(a)===canonical(b);
export const sourcePublicationScope=Object.freeze({workspace:V.workspace,parent:V.parent,source:S.source,oldCandidate:C.oldCandidate,originSHA256:C.originSHA256,baselineFingerprint:C.oldCandidateFingerprint,baselineMetadataSHA256:'10979b4d03a10cdc9a3616b088ee3538aae1a42d5e78709bbbf3db1a7220a44f',journalPath:'.jarvis-dev/maintenance/factory-source-publication-r27.json'});
const P=sourcePublicationScope;
export const sourceDeltaAllowedPaths=Object.freeze([
 'apps/server/src/modules/executor/sandbox.integration.test.ts',
 'apps/server/src/modules/platform/storage.service.test.ts',
 'doc/msf-prototype.html','doc/tests/runtime-fixture-contract-r27.json',
 'doc/tests/selftest.cjs','doc/tests/selftest-boundary.cjs','doc/tests/contract-hardening.cjs',
 'doc/tests/main-integration-boundary.cjs','doc/tests/attention-auto.cjs',
 'doc/tests/autopilot-boundary.cjs','doc/tests/case-queue.cjs','doc/tests/cache-boundary-r27.cjs',
]);
export function assertR27SourceDelta(input,baseline){
 need(input?.schemaVersion===1&&input.kind==='software-factory-r27-approved-source-delta'&&input.workspace===V.workspace&&input.baselineFingerprint===C.oldCandidateFingerprint&&input.fullValidationExecuted===false&&input.productAccepted===false,'R27_SOURCE_DELTA_SCOPE_INVALID');
 need(Array.isArray(input.files)&&input.files.length>0&&input.files.length<=sourceDeltaAllowedPaths.length&&new Set(input.files.map(f=>f.path)).size===input.files.length,'R27_SOURCE_DELTA_LIST_INVALID');
 for(const f of input.files){need(sourceDeltaAllowedPaths.includes(f.path)&&H.test(f.newSHA256??'')&&Number.isSafeInteger(f.bytes)&&f.bytes>0&&f.bytes<=4*1024*1024&&typeof f.reason==='string'&&f.reason.length>0&&f.reason.length<1000,'R27_SOURCE_DELTA_FILE_INVALID');const old=baseline.find(e=>e.path===f.path);need((f.oldSHA256??null)===(old?.sha256??null)&&(!old||f.newSHA256!==old.sha256),'R27_SOURCE_DELTA_BASELINE_CHANGED');}
 return input;
}
export const sourcePublicationHelpers=String.raw`
def durable_private_file(folder,name,body):
 fd=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=folder)
 try:
  offset=0
  while offset<len(body):
   written=os.write(fd,body[offset:]);need(written>0,'R27_SOURCE_SHORT_WRITE');offset+=written
  os.fsync(fd)
 finally:os.close(fd)
 os.fsync(folder)

def durable_json(folder,name,value):
 body=json.dumps(value,sort_keys=True,separators=(',',':')).encode();durable_private_file(folder,name,body);return hashlib.sha256(body).hexdigest()

def source_metadata(root,entries):
 rows=[]
 for e in entries:
  fd=h.open_relative(root,e['path'])
  try:rows.append([e['path'],*key(os.fstat(fd))])
  finally:os.close(fd)
 return rows

def require_same_quiet(before,after):
 need(not after['children'] and all(v==0 for v in after['counts'].values()) and all(before[k]==after[k] for k in ['pid','start','boot']),'R27_SOURCE_NODE_CHANGED_BEFORE_COMMIT')

def require_commit_ready(before,quiet_before):
 need(source_state(p['workspace'])[0]==before,'R27_SOURCE_CHANGED_DURING_STAGING')
 require_same_quiet(quiet_before,quiet())

def reconcile_publication(main,old,current,current_manifest,origin,quiet_before):
 stage=trusted(Path('/var/lib/jarvis-development/101/repair-r27-preparation'));lock=stage/'publish.lock';backup=stage/('source-delta-'+p['job'])
 need(os.path.lexists(lock) and os.path.lexists(backup),'R27_SOURCE_PRIOR_ATTEMPT_UNCONFIRMED_READ_ONLY')
 trusted(lock);lockfd=os.open(lock,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(lockfd);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600,'R27_SOURCE_LOCK_INVALID')
  try:fcntl.flock(lockfd,fcntl.LOCK_SH|fcntl.LOCK_NB)
  except BlockingIOError:raise RuntimeError('R27_SOURCE_PUBLICATION_STILL_ACTIVE')
  trusted(backup);need(stat.S_ISDIR(backup.lstat().st_mode) and stat.S_IMODE(backup.lstat().st_mode)==0o700,'R27_SOURCE_BACKUP_INVALID')
  raw=private_read(backup/'intent.json',4194304);intent=json.loads(raw);files=[{'path':f['path'],'oldSHA256':f.get('oldSHA256'),'newSHA256':f['newSHA256'],'bytes':f['bytes']} for f in p['files']]
  need(intent.get('version')==1 and intent.get('job')==p['job'] and intent.get('deltaSHA256')==p['deltaSHA256'] and intent.get('workspace')==p['workspace'] and intent['files']==files and intent['mainBefore']==main and intent['oldCandidateBefore']==old and intent['origin']==origin and intent['candidateBefore']['sha256']==p['expectedBaselineFingerprint'] and intent['candidateBefore']['metadataSHA']==p['expectedBaselineMetadataSHA256'],'R27_SOURCE_ROOT_INTENT_CHANGED')
  expected={e['path']:e for e in intent['manifestBefore']};metadata={r[0]:r for r in intent['metadataBefore']};commit=json.loads(private_read(backup/'committing.json'))
  need(commit.get('job')==p['job'] and commit.get('intentSHA256')==hashlib.sha256(raw).hexdigest(),'R27_SOURCE_COMMIT_INTENT_CHANGED')
  for index,f in enumerate(p['files']):
   if f.get('oldSHA256') is not None:need(hashlib.sha256(private_read(backup/(str(index)+'.before'),4194304)).hexdigest()==f['oldSHA256'],'R27_SOURCE_PREIMAGE_BACKUP_CHANGED')
   expected[f['path']]={'path':f['path'],'sha256':f['newSHA256'],'bytes':f['bytes']};row=json.loads(private_read(backup/('commit-'+str(index)+'.json')))
   need(row.get('path')==f['path'] and row.get('sha256')==f['newSHA256'] and row.get('bytes')==f['bytes'] and isinstance(row.get('metadata'),list) and row['metadata'][0]==f['path'],'R27_SOURCE_COMMIT_METADATA_UNCONFIRMED');metadata[f['path']]=row['metadata']
  need({e['path']:e for e in current_manifest['manifest']}==expected,'R27_SOURCE_PARTIAL_PUBLICATION_RECONCILIATION_REQUIRED')
  rows=[metadata[e['path']] for e in current_manifest['manifest']];need(hashlib.sha256(json.dumps(rows,separators=(',',':')).encode()).hexdigest()==current['metadataSHA'],'R27_SOURCE_POST_COMMIT_METADATA_CHANGED')
  a,_=source_state(p['source']);b,_=source_state(p['oldCandidate']);again,_=source_state(p['workspace']);now=quiet();require_same_quiet(quiet_before,now)
  need(a==main and b==old and again==current and origin_state(again)==origin,'R27_SOURCE_RECONCILIATION_SOURCES_CHANGED')
  if os.path.lexists(backup/'result.json'):
   prior=json.loads(private_read(backup/'result.json'));need(prior.get('candidateAfter')==current and prior.get('job')==p['job'] and prior.get('deltaSHA256')==p['deltaSHA256'],'R27_SOURCE_PRIOR_RESULT_CHANGED')
  return {'schemaVersion':1,'kind':'software-factory-r27-source-publication','action':'reconcile','workspace':p['workspace'],'job':p['job'],'deltaSHA256':p['deltaSHA256'],'mainBefore':main,'mainAfter':a,'oldCandidateBefore':old,'oldCandidateAfter':b,'candidateBefore':intent['candidateBefore'],'candidateAfter':current,'originSHA256':origin['sha256'],'originBound':True,'published':True,'files':files,'fullValidationExecuted':False,'productAccepted':False,'modelsInvoked':False,'privateFilesCopied':False,'gitHistoryCopied':False,'quiet':now,'readOnly':True,'reconciledReadOnly':True,'oldBytesPreserved':True,'rootIntentSHA256':hashlib.sha256(raw).hexdigest()}
 finally:os.close(lockfd)
`;
export const r27SourcePublishProgram=()=>r27HostBase+sourcePublicationHelpers+String.raw`
import base64,fcntl
allowed=json.loads('${JSON.stringify(sourceDeltaAllowedPaths)}')
need(p.get('action') in ['inspect','publish','reconcile'] and p.get('expectedBaselineFingerprint')=='${C.oldCandidateFingerprint}' and p.get('expectedBaselineMetadataSHA256')=='10979b4d03a10cdc9a3616b088ee3538aae1a42d5e78709bbbf3db1a7220a44f','R27_SOURCE_BASELINE_PINS_CHANGED')
need(re.fullmatch('[a-f0-9]{32}',str(p.get('job',''))) and re.fullmatch('[a-f0-9]{64}',str(p.get('deltaSHA256',''))),'R27_SOURCE_INTENT_INVALID')
need(p.get('mainFingerprint')=='${S.baselineSHA}' and p.get('mainMetadataSHA256')=='${C.mainMetadataSHA256}' and p.get('originSHA256')=='${C.originSHA256}' and p.get('fixedTools')==json.loads('${JSON.stringify(fixedToolSHA)}'),'R27_SOURCE_PROTECTED_PINS_CHANGED')
need(isinstance(p.get('files'),list) and 0<len(p['files'])<=len(allowed) and len(set(f.get('path') for f in p['files']))==len(p['files']),'R27_SOURCE_FILE_LIST_INVALID')
for f in p['files']:
 need(f.get('path') in allowed and re.fullmatch('[a-f0-9]{64}',str(f.get('newSHA256',''))) and isinstance(f.get('bytes'),int) and 0<f['bytes']<=4194304,'R27_SOURCE_FILE_INVALID')
 body=base64.b64decode(f['base64'],validate=True);need(len(body)==f['bytes'] and hashlib.sha256(body).hexdigest()==f['newSHA256'],'R27_SOURCE_TRANSFER_INVALID');f['_body']=body
for name,digest in p['fixedTools'].items():need(hashlib.sha256(private_read(tools_dir/name)).hexdigest()==digest,'R27_SOURCE_FIXED_TOOL_CHANGED')
main,main_manifest=source_state(p['source']);old,old_manifest=source_state(p['oldCandidate']);before,manifest=source_state(p['workspace']);origin=origin_state(before)
need(main['sha256']==p['mainFingerprint'] and main['files']==593 and main['metadataSHA']==p['mainMetadataSHA256'] and main['identity']=={'device':66306,'inode':14417953},'R27_SOURCE_ORIGINAL_MAIN_CHANGED')
need(old['sha256']=='${C.oldCandidateFingerprint}' and old['files']==605 and old['metadataSHA']=='${C.oldCandidateMetadataSHA256}' and old['identity']=={'device':66306,'inode':6713082},'R27_SOURCE_OLD_CANDIDATE_CHANGED')
need(before['identity']=={'device':66306,'inode':6713710},'R27_SOURCE_NEW_COPY_IDENTITY_CHANGED')
if p['action']!='reconcile':need(before['sha256']==p['expectedBaselineFingerprint'] and before['metadataSHA']==p['expectedBaselineMetadataSHA256'],'R27_SOURCE_NEW_COPY_CHANGED')
quiet_before=quiet();need(not quiet_before['children'] and all(v==0 for v in quiet_before['counts'].values()),'R27_SOURCE_NODE_NOT_IDLE')
if p['action']=='reconcile':
 print(json.dumps(reconcile_publication(main,old,before,manifest,origin,quiet_before),sort_keys=True));sys.exit(0)
original={e['path']:e for e in manifest['manifest']};expected={name:dict(e) for name,e in original.items()}
for f in p['files']:
 e=original.get(f['path']);need(f.get('oldSHA256')==(e['sha256'] if e else None) and (e is None or f['newSHA256']!=e['sha256']),'R27_SOURCE_OLD_FILE_CHANGED')
 expected[f['path']]={'path':f['path'],'sha256':f['newSHA256'],'bytes':f['bytes']}
root=h.open_directory(p['workspace']);stage=Path('/var/lib/jarvis-development/101/repair-r27-preparation')
trusted(stage);lockfd=None;backupfd=None;intent_sha=None
try:
 if p['action']=='publish':
  lockfd=os.open(stage/'publish.lock',os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW|os.O_NONBLOCK,0o600)
  lockinfo=os.fstat(lockfd);need(stat.S_ISREG(lockinfo.st_mode) and lockinfo.st_uid==0 and lockinfo.st_nlink==1 and stat.S_IMODE(lockinfo.st_mode)==0o600,'R27_SOURCE_LOCK_INVALID');fcntl.flock(lockfd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  need(re.fullmatch('[a-f0-9]{32}',str(p.get('job',''))),'R27_SOURCE_JOB_INVALID')
  backup=stage/('source-delta-'+p['job']);backup.mkdir(mode=0o700,exist_ok=False);stagefd=os.open(stage,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:os.fsync(stagefd)
  finally:os.close(stagefd)
  need(backup.stat().st_dev==os.fstat(root).st_dev,'R27_SOURCE_STAGING_DEVICE_CHANGED');backupfd=os.open(backup,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  require_commit_ready(before,quiet_before);metadata_before=source_metadata(root,manifest['manifest']);need(hashlib.sha256(json.dumps(metadata_before,separators=(',',':')).encode()).hexdigest()==before['metadataSHA'],'R27_SOURCE_METADATA_CHANGED_BEFORE_STAGING')
  intent={'version':1,'job':p['job'],'workspace':p['workspace'],'deltaSHA256':p['deltaSHA256'],'mainBefore':main,'oldCandidateBefore':old,'candidateBefore':before,'origin':origin,'manifestBefore':manifest['manifest'],'metadataBefore':metadata_before,'files':[{'path':f['path'],'oldSHA256':f.get('oldSHA256'),'newSHA256':f['newSHA256'],'bytes':f['bytes']} for f in p['files']]}
  intent_sha=durable_json(backupfd,'intent.json',intent)
  staged=[]
  try:
   for index,f in enumerate(p['files']):
    parts=h.relative_parts(f['path']);parent=os.dup(root)
    try:
     for item in parts[:-1]:
      child=os.open(item,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent);os.close(parent);parent=child
     existing=original.get(f['path']);mode=0o600
     if existing:
      fd=h.open_relative(root,f['path'])
      try:
       raw=h.read_fd(fd,4194304);s=os.fstat(fd);need(hashlib.sha256(raw).hexdigest()==f['oldSHA256'] and s.st_uid==1000 and s.st_gid==1000,'R27_SOURCE_PREIMAGE_CHANGED');mode=stat.S_IMODE(s.st_mode)
      finally:os.close(fd)
      durable_private_file(backupfd,str(index)+'.before',raw)
     else:need(not os.path.lexists('/proc/self/fd/'+str(parent)+'/'+parts[-1]),'R27_SOURCE_NEW_FILE_EXISTS')
     temp=str(index)+'.after';fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode,dir_fd=backupfd)
     try:
      body=f['_body'];offset=0
      while offset<len(body):
       written=os.write(fd,body[offset:]);need(written>0,'R27_SOURCE_SHORT_WRITE');offset+=written
      os.fchown(fd,1000,1000);os.fchmod(fd,mode);os.fsync(fd)
     finally:os.close(fd)
     os.fsync(backupfd);staged.append((os.dup(parent),temp,parts[-1],index,f))
    finally:os.close(parent)
   require_commit_ready(before,quiet_before)
   protected_main,_=source_state(p['source']);protected_old,_=source_state(p['oldCandidate']);need(protected_main==main and protected_old==old,'R27_SOURCE_PROTECTED_SOURCE_CHANGED_BEFORE_COMMIT')
   durable_json(backupfd,'committing.json',{'job':p['job'],'intentSHA256':intent_sha})
   require_commit_ready(before,quiet_before)
   for parent,temp,name,index,f in staged:
    os.replace(temp,name,src_dir_fd=backupfd,dst_dir_fd=parent);os.fsync(parent);os.fsync(backupfd)
    fd=h.open_relative(root,f['path'])
    try:
     s=os.fstat(fd);need(hashlib.sha256(h.read_fd(fd,4194304)).hexdigest()==f['newSHA256'] and s.st_uid==1000 and s.st_gid==1000 and s.st_nlink==1,'R27_SOURCE_COMMITTED_FILE_CHANGED')
     durable_json(backupfd,'commit-'+str(index)+'.json',{'path':f['path'],'sha256':f['newSHA256'],'bytes':f['bytes'],'metadata':[f['path'],*key(s)]})
    finally:os.close(fd)
  finally:
   # Preserve exact private staged evidence on failure; no uncertain file is deleted.
   for parent,temp,name,index,f in staged:os.close(parent)
  after,after_manifest=source_state(p['workspace']);need({e['path']:e for e in after_manifest['manifest']}==expected,'R27_SOURCE_PUBLISHED_MANIFEST_CHANGED')
 else:after=before
 main_after,_=source_state(p['source']);old_after,_=source_state(p['oldCandidate']);need(main_after==main and old_after==old,'R27_SOURCE_PROTECTED_SOURCE_CHANGED')
 quiet_after=quiet();need(not quiet_after['children'] and all(v==0 for v in quiet_after['counts'].values()) and quiet_before['pid']==quiet_after['pid'] and quiet_before['start']==quiet_after['start'] and quiet_before['boot']==quiet_after['boot'],'R27_SOURCE_NODE_CHANGED')
 need(origin_state(after)==origin,'R27_SOURCE_ORIGIN_CHANGED')
 result={'schemaVersion':1,'kind':'software-factory-r27-source-publication','action':p['action'],'workspace':p['workspace'],'job':p['job'],'deltaSHA256':p['deltaSHA256'],'mainBefore':main,'mainAfter':main_after,'oldCandidateBefore':old,'oldCandidateAfter':old_after,'candidateBefore':before,'candidateAfter':after,'originSHA256':origin['sha256'],'originBound':True,'published':p['action']=='publish','files':[{'path':f['path'],'oldSHA256':f.get('oldSHA256'),'newSHA256':f['newSHA256'],'bytes':f['bytes']} for f in p['files']],'fullValidationExecuted':False,'productAccepted':False,'modelsInvoked':False,'privateFilesCopied':False,'gitHistoryCopied':False,'quiet':quiet_after,'readOnly':p['action']=='inspect','oldBytesPreserved':p['action']=='publish','rootIntentSHA256':intent_sha}
 if p['action']=='publish':durable_json(backupfd,'result.json',result)
 print(json.dumps(result,sort_keys=True))
finally:
 os.close(root)
 if backupfd is not None:os.close(backupfd)
 if lockfd is not None:os.close(lockfd)
`;
export async function prepareR27SourcePayload(path){
 const bytes=await readFile(path),input=JSON.parse(bytes),baseline=JSON.parse(await readFile('.jarvis-dev/workspaces/msf-repair-r27/export-manifest.json','utf8'));
 const manifest=Array.isArray(baseline)?baseline:baseline.manifest;assertR27SourceDelta(input,manifest);
 const files=[];for(const f of input.files){const q=resolve(V.localWorkspace,f.path),s=await lstat(q);need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size===f.bytes,'R27_SOURCE_LOCAL_FILE_INVALID');const body=await readFile(q);need(body.length===f.bytes&&sha(body)===f.newSHA256,'R27_SOURCE_LOCAL_FILE_CHANGED');files.push({...f,oldSHA256:f.oldSHA256??null,base64:body.toString('base64')});}
 return {deltaSHA256:sha(bytes),...V,source:S.source,oldCandidate:C.oldCandidate,agentId:C.agentId,templateId:S.templateId,fixedTools:fixedToolSHA,mainFingerprint:S.baselineSHA,mainMetadataSHA256:C.mainMetadataSHA256,oldCandidateFingerprint:C.oldCandidateFingerprint,originSHA256:C.originSHA256,expectedBaselineFingerprint:C.oldCandidateFingerprint,expectedBaselineMetadataSHA256:'10979b4d03a10cdc9a3616b088ee3538aae1a42d5e78709bbbf3db1a7220a44f',files};
}
export function assertSourcePublicationJournal(j){
 need(j?.version===1&&same(j.scope,P)&&/^[a-f0-9]{32}$/.test(j.job??'')&&/^artifacts\/software-factory\/repair-r27\/approved-source-delta-[a-z0-9-]+\.json$/.test(j.deltaPath??'')&&H.test(j.deltaSHA256??'')&&j.payloadSHA256===sha(j.payload)&&j.payload?.deltaSHA256===j.deltaSHA256&&['prepared','publish-attempted','published'].includes(j.phase),'R27_SOURCE_PRIVATE_INTENT_CHANGED');
 const pins={...V,source:S.source,oldCandidate:C.oldCandidate,agentId:C.agentId,templateId:S.templateId,fixedTools:fixedToolSHA,mainFingerprint:S.baselineSHA,mainMetadataSHA256:C.mainMetadataSHA256,oldCandidateFingerprint:C.oldCandidateFingerprint,originSHA256:C.originSHA256,expectedBaselineFingerprint:P.baselineFingerprint,expectedBaselineMetadataSHA256:P.baselineMetadataSHA256};need(Object.entries(pins).every(([k,v])=>same(j.payload[k],v)),'R27_SOURCE_PRIVATE_SCOPE_CHANGED');
 need(Array.isArray(j.payload.files)&&j.payload.files.length>0&&j.payload.files.length<=sourceDeltaAllowedPaths.length&&new Set(j.payload.files.map(f=>f.path)).size===j.payload.files.length&&j.payload.files.every(f=>sourceDeltaAllowedPaths.includes(f.path)&&H.test(f.newSHA256??'')&&Number.isSafeInteger(f.bytes)&&f.bytes>0&&f.bytes<=4194304&&typeof f.base64==='string'&&sha(Buffer.from(f.base64,'base64'))===f.newSHA256&&Buffer.from(f.base64,'base64').length===f.bytes&&(f.oldSHA256===null||H.test(f.oldSHA256??'')&&f.oldSHA256!==f.newSHA256)),'R27_SOURCE_PRIVATE_PAYLOAD_CHANGED');
 if(j.publishAttemptedAt)need(Number.isFinite(Date.parse(j.publishAttemptedAt))&&j.phase!=='prepared'&&j.before,'R27_SOURCE_MUTATION_INTENT_MISSING');if(j.phase==='published')need(j.publishAttemptedAt&&j.publication?.published===true&&j.publication.job===j.job&&j.publication.deltaSHA256===j.deltaSHA256,'R27_SOURCE_PUBLISHED_RECEIPT_MISSING');return j;
}
function assertPublicationResult(r,p,j,{published=false}={}){
 need(r?.schemaVersion===1&&r.kind==='software-factory-r27-source-publication'&&r.workspace===V.workspace&&r.job===j.job&&r.deltaSHA256===p.deltaSHA256&&r.originSHA256===C.originSHA256&&r.originBound===true&&r.fullValidationExecuted===false&&r.productAccepted===false&&r.modelsInvoked===false&&r.privateFilesCopied===false&&r.gitHistoryCopied===false&&same(r.mainBefore,r.mainAfter)&&same(r.oldCandidateBefore,r.oldCandidateAfter)&&r.mainAfter?.sha256===S.baselineSHA&&r.mainAfter.files===593&&r.mainAfter.metadataSHA===C.mainMetadataSHA256&&same(r.mainAfter.identity,C.mainIdentity)&&r.oldCandidateAfter?.sha256===C.oldCandidateFingerprint&&r.oldCandidateAfter.files===605&&r.oldCandidateAfter.metadataSHA===C.oldCandidateMetadataSHA256&&same(r.oldCandidateAfter.identity,C.oldCandidateIdentity)&&r.candidateAfter?.stable===true&&same(r.candidateAfter.identity,{device:66306,inode:6713710})&&H.test(r.candidateAfter.sha256??'')&&H.test(r.candidateAfter.metadataSHA??'')&&Number.isSafeInteger(r.candidateAfter.files)&&r.candidateAfter.files>=605&&same(r.files,p.files.map(({path,oldSHA256,newSHA256,bytes})=>({path,oldSHA256:oldSHA256??null,newSHA256,bytes})))&&r.quiet?.active===true&&r.quiet.children?.length===0&&same(r.quiet.counts,{runs:0,deliveries:0,logs:0}),'R27_SOURCE_RESULT_BINDING_CHANGED');
 if(published)need(r.published===true&&r.oldBytesPreserved===true&&H.test(r.rootIntentSHA256??'')&&r.candidateAfter.sha256!==P.baselineFingerprint,'R27_SOURCE_PUBLICATION_UNCONFIRMED');if(j.before)need(same(r.candidateBefore,j.before.candidateBefore)&&same(r.mainBefore,j.before.mainBefore)&&same(r.oldCandidateBefore,j.before.oldCandidateBefore),'R27_SOURCE_INITIAL_SNAPSHOT_CHANGED');return r;
}
function publicationObservation(r){return assertR27Observation({schemaVersion:1,kind:'software-factory-r27-source-observation',workspace:V.workspace,parent:V.parent,candidateFingerprint:r.candidateAfter.sha256,candidateMetadataSHA256:r.candidateAfter.metadataSHA,originSHA256:C.originSHA256,files:r.candidateAfter.files,mainFingerprint:S.baselineSHA,mainFiles:593,helperSHA256:fixedToolSHA['project-autonomy-evidence.py'],helperVerified:true,originBound:true,originalMainUnchanged:true,publicFilesOnly:true,privateEnvironmentCopied:false,gitHistoryCopied:false});}
export async function runSourcePublication({action='inspect',deltaPath}={},deps){
 need(['inspect','publish','reconcile'].includes(action)&&/^artifacts\/software-factory\/repair-r27\/approved-source-delta-[a-z0-9-]+\.json$/.test(deltaPath??''),'R27_SOURCE_ARGUMENT_INVALID');const d={now:Date.now,randomUUID,...deps};let j;
 try{j=assertSourcePublicationJournal(JSON.parse(await d.readLocal(P.journalPath,'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
 let payload;if(j){d.observeJournal?.(j);need(j.deltaPath===deltaPath&&sha(await d.readLocal(deltaPath))===j.deltaSHA256,'R27_SOURCE_SAVED_DELTA_CHANGED');payload=j.payload;}else{need(action!=='reconcile','R27_SOURCE_RECONCILIATION_INTENT_REQUIRED');payload=await d.preparePayload(deltaPath);j={version:1,scope:P,job:d.randomUUID().replaceAll('-',''),deltaPath,deltaSHA256:payload.deltaSHA256,payload,payloadSHA256:sha(payload),phase:'prepared',createdAt:new Date(d.now()).toISOString()};assertSourcePublicationJournal(j);d.observeJournal?.(j);}
 const idle=async()=>{const q=await d.queueState();need(q.readOnly===true&&q.fullTable===true&&q.allActive===0,'R27_SOURCE_CENTRAL_QUEUE_NOT_IDLE');};
 const save=async()=>{assertSourcePublicationJournal(j);await d.saveJournal(j);};
 const read=async a=>{await idle();const r=assertPublicationResult(await d.readRoot({...payload,action:a,job:j.job},r27SourcePublishProgram()),payload,j,{published:a==='publish'});await idle();return r;};
 if(j.publishAttemptedAt){const r=await read('reconcile');need(r.readOnly===true&&r.reconciledReadOnly===true,'R27_SOURCE_PRIOR_ATTEMPT_READ_ONLY_RECONCILIATION_REQUIRED');assertPublicationResult(r,payload,j,{published:true});if(j.phase==='published')need(same(r.candidateAfter,j.publication.candidateAfter),'R27_SOURCE_PUBLISHED_METADATA_CHANGED');j.publication=r;j.phase='published';j.reconciledAt=new Date(d.now()).toISOString();if(action!=='inspect')await save();return {...r,requestedAction:action,sourceObservation:publicationObservation(r),remoteMutationsPerformed:false,automaticRetry:false,privateJournalExported:false};}
 const before=await read('inspect');need(before.readOnly===true&&before.candidateBefore.sha256===P.baselineFingerprint&&before.candidateBefore.metadataSHA===P.baselineMetadataSHA256,'R27_SOURCE_INITIAL_SNAPSHOT_CHANGED');if(action==='inspect')return {...before,requestedAction:action,ready:true,remoteMutationsPerformed:false,automaticRetry:false,privateJournalExported:false};
 need(action==='publish','R27_SOURCE_RECONCILIATION_INTENT_REQUIRED');if(j.before)need(same(j.before,before),'R27_SOURCE_INITIAL_SNAPSHOT_CHANGED');j.before=before;await save();await idle();j.publishAttemptedAt=new Date(d.now()).toISOString();j.phase='publish-attempted';await save();
 const r=await read('publish');j.publication=r;j.phase='published';j.publishedAt=new Date(d.now()).toISOString();await save();return {...r,requestedAction:action,sourceObservation:publicationObservation(r),remoteMutationsPerformed:true,automaticRetry:false,privateJournalExported:false};
}
export function sourcePublicationFailure(e,action,j){return {schemaVersion:1,kind:'software-factory-r27-source-publication',action,failed:true,errorCode:/^R27_SOURCE_[A-Z0-9_]+$/.test(e?.message??'')?e.message:'R27_SOURCE_OPERATION_FAILED',job:j?.job??null,deltaSHA256:j?.deltaSHA256??null,publishAttempted:!!j?.publishAttemptedAt,reconciliationRequired:!!j?.publishAttemptedAt,automaticRetry:false,automaticNewJob:false,fullValidationExecuted:false,productAccepted:false,modelsInvoked:false,privateJournalExported:false,rawErrorExported:false};}
async function saveLocalPublication(j){await mkdir(dirname(P.journalPath),{recursive:true});const temp=P.journalPath+'.'+randomUUID()+'.tmp';let f;try{f=await open(temp,'wx',0o600);await f.writeFile(JSON.stringify(j,null,2)+'\n');await f.sync();await f.close();f=null;await rename(temp,P.journalPath);}finally{await f?.close();await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let result,j,lock,action;try{const args=process.argv.slice(2);need(args.length===2,'R27_SOURCE_ARGUMENT_INVALID');[action]=args;need(['inspect','publish','reconcile'].includes(action),'R27_SOURCE_ARGUMENT_INVALID');if(action!=='inspect'){await mkdir(dirname(P.journalPath),{recursive:true});lock=await open(P.journalPath+'.lock','wx',0o600);await lock.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()}));await lock.sync();}result=await withPlatform(()=>runSourcePublication({action,deltaPath:args[1]},{readLocal:readFile,preparePayload:prepareR27SourcePayload,queueState,observeJournal:v=>{j=v;},saveJournal:async v=>{j=v;await saveLocalPublication(v);},readRoot:async payload=>JSON.parse(remote(lanProfile,'jarvis-101',python(payload,r27SourcePublishProgram()),true,{timeoutMs:180000}))}));}catch(e){result=sourcePublicationFailure(e,action??'invalid',j);process.exitCode=1;}finally{if(lock){await lock.close();await unlink(P.journalPath+'.lock');}}
 await mkdir('artifacts/software-factory/repair-r27',{recursive:true});const output='artifacts/software-factory/repair-r27/source-publication-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(result,null,2)+'\n',f=await open(output,'wx');try{await f.writeFile(raw);await f.sync();}finally{await f.close();}console.log(JSON.stringify({output,sha256:sha(raw),...result}));
}
