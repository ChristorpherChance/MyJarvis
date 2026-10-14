/** Independent PG-install cleanup observation. Import has no IO; unfrozen pins never read a host. */
import {mkdir,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {sha,canonical} from './run-factory-main-repair-r26.mjs';
import {safeReadLocal} from './factory-repair-evidence-read-r26.mjs';
import {defaultReadRoot} from './install-factory-repair-verifier-r26.mjs';
import {buildCleanupR29Scope as oldScope,buildCleanupR29HostProgram} from './verify-factory-truth-gate-build-cleanup-r29.mjs';
import {targetCleanupR29HostProgram} from './verify-factory-target-cleanup-r29.mjs';
import {verifyFactoryProtectionContractR29R2,protectionContractR29R2 as P} from './verify-factory-protection-contract-r29-r2.mjs';
import {independentPGR29Scope as installerScope} from './start-factory-independent-pg-runtime-r29.mjs';

const need=(v,c)=>{if(!v)throw Error(c)},same=(a,b)=>canonical(a)===canonical(b),H=/^[a-f0-9]{64}$/,A=/^[a-f0-9]{32}$/,U=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const jp='.jarvis-dev/maintenance/factory-r29-pg-runtime-once.json';
const controlFiles=['activation.json','factory-freeze-independent-pg-runtime-r29.py','r29-qa-pg-build-review.json','r29-qa-pg-cache-contract.json','r29-qa-pg-cache-readback.json','r29-qa-pg-inputs/package.json','r29-qa-pg-inputs/pnpm-lock.yaml','r29-qa-pg-protection-proof.json'];
const nodeIdentity=v=>Object.fromEntries(['pid','ppid','startTicks','boot','procDevice','procInode','uid','cwdSHA256','exeSHA256','argvSHA256','active','cgroup'].map(k=>[k,v[k]]));
export function parseIndependentPGCleanupHost(raw){let v;try{v=typeof raw==='string'?JSON.parse(raw):raw}catch{throw Error('QA_PG_CLEANUP_HOST_RESULT_INVALID')}need(v&&typeof v==='object'&&!Array.isArray(v),'QA_PG_CLEANUP_HOST_RESULT_INVALID');return v;}
export const independentPGCleanupR29Scope=Object.freeze({
 schemaVersion:1,rootBase:'/var/lib/jarvis-development/101/r29-qa-pg-runtime',imageID:oldScope.image,
 sourceFP:oldScope.fingerprint,files:621,meta:oldScope.metadataSHA,id:oldScope.sourceIdentity,
 workerSHA256:'57eb441548b433620b3b244724bb50f27abdbf981b0d5f0e031623b70cfc4ae5',freezerSHA256:installerScope.freezerSHA256,cacheContractSHA256:installerScope.cacheContract.sha256,cacheReadbackSHA256:installerScope.basisRefs.cacheReadback.sha256,
 immutableScope:installerScope,
});
const pinned=S=>['workerSHA256','freezerSHA256','cacheContractSHA256','cacheReadbackSHA256'].every(k=>H.test(S[k]??''));
const base=()=>({schemaVersion:1,kind:'software-factory-r29-independent-pg-cleanup',ready:false,cleanupIndependentlyVerified:false,independent:true,modelsInvoked:false,productCodeExecuted:false,pgRuntimeAccepted:false,runtimeFrozen:false,runtimeReady:false,productAccepted:false,full74ObjectivesAccepted:false,remoteMutationsPerformed:false,signalsSent:false,resourcesRemoved:false,workerCleanupClaimsUsedAsProof:false,rawPrivateDataExported:false});

export function assertIndependentPGCleanupContext(q,start,S=independentPGCleanupR29Scope){
 need(pinned(S)&&q?.schemaVersion===1&&q.kind==='r29-independent-pg-runtime-once-journal'&&A.test(q.attempt??'')&&q.dispatched===true&&typeof q.startIntentAt==='string'&&Number.isFinite(Date.parse(q.startIntentAt)),'QA_PG_CLEANUP_JOURNAL_NOT_DISPATCHED');
 const s=q.immutableScope;need(s&&same(s,S.immutableScope)&&s.imageID===S.imageID&&s.workerSHA256===S.workerSHA256&&s.freezerSHA256===S.freezerSHA256&&s.cacheContract.sha256===S.cacheContractSHA256&&s.basisRefs.cacheReadback.sha256===S.cacheReadbackSHA256&&same(s.candidate,{fingerprint:S.sourceFP,files:S.files,metadataSHA256:S.meta,identity:S.id}),'QA_PG_CLEANUP_FIXED_SCOPE_CHANGED');
 const ref=q.receipts?.start;need(/^artifacts\/software-factory\/goals-r29\/independent-pg-runtime-start-\d{13}-[a-f0-9-]{36}\.json$/.test(ref?.path??'')&&H.test(ref.sha256??''),'QA_PG_CLEANUP_START_REFERENCE_INVALID');
 need(start?.schemaVersion===1&&start.kind==='software-factory-r29-independent-pg-runtime-start'&&start.attempt===q.attempt&&start.dispatched===true&&start.workerSHA256===S.workerSHA256&&same(start.sourceScope,s.candidate)&&start.ownerUnit==='jarvis-qa-pg-r29-'+q.attempt+'-owner.service'&&q.activationSHA256===start.activationSHA256&&q.onceIntentSHA256===start.onceIntentSHA256&&q.controlInventorySHA256===start.controlInventorySHA256&&same(q.owner,start.owner),'QA_PG_CLEANUP_START_BINDING_CHANGED');
 const o=start.owner;need(Number.isSafeInteger(o?.pid)&&o.pid>1&&/^[0-9]+$/.test(o.startTicks??'')&&U.test(o.boot??'')&&o.controlGroup==='/system.slice/'+start.ownerUnit&&['activationSHA256','onceIntentSHA256','controlInventorySHA256'].every(k=>H.test(start[k]??'')),'QA_PG_CLEANUP_OWNER_OR_CONTROL_UNKNOWN');
 need(s.root===S.rootBase&&s.installedWorker==='/opt/jarvis-development/software-factory/factory-build-independent-pg-runtime-r29-r2-'+S.workerSHA256.slice(0,16)+'.py','QA_PG_CLEANUP_INSTALLED_PATH_CHANGED');
 return {...oldScope,attempt:q.attempt,root:S.rootBase,tool:s.installedWorker,toolSHA:S.workerSHA256,ownerPID:o.pid,ownerStartTicks:o.startTicks,ownerBoot:o.boot,
  freezerSHA256:S.freezerSHA256,cacheContractSHA256:S.cacheContractSHA256,cacheReadbackSHA256:S.cacheReadbackSHA256,activationSHA256:start.activationSHA256,onceIntentSHA256:start.onceIntentSHA256,controlInventorySHA256:start.controlInventorySHA256,sourceFP:S.sourceFP,files:S.files,meta:S.meta,id:S.id,basisRefs:s.basisRefs,journalPath:jp,startPath:ref.path,startSHA:ref.sha256,checkPath:null,checkSHA:null};
}

export function assertIndependentPGCleanupHost(h,B){
 need(h?.attempt===B.attempt&&same(h.source,{sha256:B.fingerprint,metadataSHA:B.metadataSHA,files:621,bytes:B.sourceBytes,identity:B.sourceIdentity,stable:true})&&h.sourceBeforeAfterStable===true&&h.privateReceiptsStable===true&&h.workerSHA256===B.toolSHA&&h.activationSHA256===B.activationSHA256&&h.onceIntentSHA256===B.onceIntentSHA256&&h.controlInventorySHA256===B.controlInventorySHA256&&H.test(h.stateSHA256??'')&&['installed','failed'].includes(h.installStatus),'QA_PG_CLEANUP_HOST_BINDING_CHANGED');
 need(h.attemptDirectory?.stable===true&&h.attemptDirectory.nofollow===true&&h.attemptDirectory.uid===0&&h.attemptDirectory.mode===448&&h.control?.stable===true&&h.control.nofollow===true&&h.control.uid===0&&h.control.mode===448&&same(Object.keys(h.control.files??{}).sort(),controlFiles)&&H.test(h.control.metadataSHA256??'')&&h.work?.stable===true&&h.work.nofollow===true&&h.work.uid===1000&&h.work.mode===448&&Number.isSafeInteger(h.work.entries)&&h.work.entries>=2&&H.test(h.work.metadataSHA256??'')&&h.control.activationBound===true&&h.control.requiredFilesBound===true,'QA_PG_CLEANUP_DIRECTORY_OR_CONTROL_CHANGED');
 need([h.attemptDirectory,h.control,h.work].every(v=>Number.isSafeInteger(v.identity?.device)&&v.identity.device>=0&&Number.isSafeInteger(v.identity.inode)&&v.identity.inode>0&&H.test(v.metadataSHA256??''))&&Object.values(h.control.files).every(v=>H.test(v))&&sha(canonical(h.control.files))===B.controlInventorySHA256,'QA_PG_CLEANUP_DIRECTORY_IDENTITY_OR_INVENTORY_INVALID');
 need(h.mountPolicy?.creationIntentBound===true&&same(h.mountPolicy.expectedDestinations,['/work','/corepack-runtime','/corepack-cache','/pnpm-store'])&&h.mountPolicy.productSourceMounted===false&&h.mountPolicy.hostDockerSocketMounted===false&&typeof h.mountPolicy.actualContainerMountsObserved==='boolean','QA_PG_CLEANUP_MOUNT_POLICY_UNBOUND');
 need(h.mutationsPerformed===false&&h.signalsSent===false&&h.resourcesRemoved===false&&h.rawLogsExported===false&&h.privateEnvironmentExported===false&&h.rawArgvExported===false&&h.packageJavaScriptExecuted===false&&h.procScope?.fullProcScan===true&&h.procScope.includesAllDescendants===true&&h.procScope.includesUnitCgroupOrphans===true&&h.procScope.includesWorkspaceCwdExeArgvFD===true&&h.procScope.includesInstallerOwnerCgroup===true&&h.procScope.workspace===B.root+'/'+B.attempt&&h.procScope.persistentMainPIDExcluded===h.node?.pid&&h.procScope.twoScans===true&&h.scans?.length===2,'QA_PG_CLEANUP_READ_SCOPE_CHANGED');
 need(Number.isSafeInteger(h.node.pid)&&h.node.pid>1&&h.node.uid===1000&&h.node.active===true&&U.test(h.node.boot??'')&&/^[0-9]+$/.test(h.node.startTicks??'')&&Number.isSafeInteger(h.node.procDevice)&&Number.isSafeInteger(h.node.procInode)&&h.node.procInode>0&&h.node.cgroup==='/system.slice/jarvis-software-factory-development.service'&&['cwdSHA256','exeSHA256','argvSHA256'].every(k=>H.test(h.node[k]??'')),'QA_PG_CLEANUP_NODE_IDENTITY_INVALID');
 for(const s of h.scans){
  need(s.fullProcScan===true&&s.pidfdSupported===true&&same(s.node,h.node)&&same(s.ack,h.nodeACK)&&['allDescendants','unitCgroupOtherProcesses','workspaceRelatedProcesses','ownerCgroupProcesses','relatedProcesses','listedPIDs','inspectedPIDs','readIncompletePIDs','exitedDuringScan'].every(k=>Array.isArray(s[k])),'QA_PG_CLEANUP_CENSUS_INCOMPLETE');
  const exits=s.exitedDuringScan.map(e=>e.pid),ids=[...s.inspectedPIDs,...exits,...s.readIncompletePIDs];need(ids.every(n=>Number.isSafeInteger(n)&&n>0)&&new Set(ids).size===ids.length&&new Set(s.listedPIDs).size===s.listedPIDs.length&&same([...ids].sort((a,b)=>a-b),[...s.listedPIDs].sort((a,b)=>a-b))&&s.inspectedPIDs.includes(h.node.pid)&&s.processesScanned===ids.length&&same(s.counts,{listed:ids.length,inspected:s.inspectedPIDs.length,pidfdProvenExits:exits.length,incomplete:s.readIncompletePIDs.length}),'QA_PG_CLEANUP_COUNTS_NOT_CLOSED');
  for(const e of s.exitedDuringScan){const k=e.kernelProof,v=e.processIdentity,i=e.listedProcIdentity;need(e.boot===h.node.boot&&Number.isSafeInteger(i?.device)&&i.device>=0&&Number.isSafeInteger(i.inode)&&i.inode>0&&k?.type==='pidfd-POLLIN'&&k.attached===true&&k.identityBound===true&&k.requestedPID===e.pid&&k.exitConfirmed===true&&k.procPathAbsent===true&&[1,17].includes(k.pollEvents)&&v?.pid===e.pid&&v.boot===e.boot&&v.procDevice===i.device&&v.procInode===i.inode&&(v.startTicks===undefined||/^[0-9]+$/.test(v.startTicks))&&(v.ppid===undefined||Number.isSafeInteger(v.ppid)&&v.ppid>=0),'QA_PG_CLEANUP_PIDFD_IDENTITY_UNPROVEN');}
 }
 need(h.workspaceSockets?.nofollow===true&&Array.isArray(h.workspaceSockets.filesystem)&&Array.isArray(h.workspaceSockets.procNetUnix)&&Object.keys(h.nodeACK?.counts??{}).sort().join(',')==='deliveries,logs,runs'&&Object.values(h.nodeACK.counts).every(n=>Number.isSafeInteger(n)&&n>=0),'QA_PG_CLEANUP_ACK_OR_SOCKET_INVALID');
 const processesComplete=h.scans.every(s=>!s.readIncompletePIDs.length&&['relatedProcesses','allDescendants','unitCgroupOtherProcesses','workspaceRelatedProcesses','ownerCgroupProcesses'].every(k=>!s[k].length))&&!h.workspaceSockets.filesystem.length&&!h.workspaceSockets.procNetUnix.length&&Object.values(h.nodeACK.counts).every(n=>n===0);need(h.nativeProcessAndSocketCleanupVerified===processesComplete,'QA_PG_CLEANUP_PROCESS_FLAG_CHANGED');
 const name='jarvis-qa-pg-r29-'+B.attempt+'-install',d=h.docker;need(d?.readOnly===true&&d.containersNetworksVolumesQueried===true&&same(d.exactNames,[name])&&Array.isArray(d.absentNames)&&Array.isArray(d.present)&&new Set(d.absentNames).size===d.absentNames.length&&d.absentNames.every(n=>n===name)&&d.labelScopes?.length===2&&same(d.labelScopes.map(x=>x.filters),[['label=jarvis.qa.pg.r29.attempt='+B.attempt],['label=jarvis.qa.pg.r29.attempt='+B.attempt,'label=jarvis.qa.pg.r29.kind=independent-runtime']])&&d.labelScopes.every(x=>['containers','networks','volumes'].every(k=>Array.isArray(x[k]))),'QA_PG_CLEANUP_DOCKER_CENSUS_INCOMPLETE');
 const dockerComplete=d.absentNames.length===1&&!d.present.length&&d.labelScopes.every(s=>['containers','networks','volumes'].every(k=>!s[k].length));need(d.complete===dockerComplete,'QA_PG_CLEANUP_DOCKER_FLAG_CHANGED');
 const unit='jarvis-qa-pg-r29-'+B.attempt+'-owner.service',cg='/system.slice/'+unit,o=h.owner;need(o?.readOnly===true&&same(o.identity,{pid:B.ownerPID,startTicks:B.ownerStartTicks,boot:B.ownerBoot})&&o.bootSame===true&&typeof o.pidAbsent==='boolean'&&o.unit?.Id===unit&&['loaded','not-found'].includes(o.unit.LoadState)&&['active','inactive','failed','activating','deactivating'].includes(o.unit.ActiveState)&&/^[0-9]+$/.test(o.unit.MainPID??'')&&['',cg].includes(o.unit.ControlGroup)&&o.cgroupPath===cg&&Array.isArray(o.cgroupPIDs)&&o.cgroupPIDs.every(n=>Number.isSafeInteger(n)&&n>0)&&o.originalOwnerContractVerified===true&&o.runtimeMaxSec===900&&o.stopTimeoutSec===120&&o.exactExecStopPostConfigured===true,'QA_PG_CLEANUP_OWNER_INVALID');
 const ownerComplete=o.pidAbsent&&['inactive','failed'].includes(o.unit.ActiveState)&&o.unit.MainPID==='0'&&!o.cgroupPIDs.length;need(o.complete===ownerComplete,'QA_PG_CLEANUP_OWNER_FLAG_CHANGED');
 return {processesComplete,dockerComplete,ownerComplete,relatedWritersAbsent:processesComplete,nodeACKIdle:Object.values(h.nodeACK.counts).every(n=>n===0),cleanupIndependentlyVerified:processesComplete&&dockerComplete&&ownerComplete};
}

export function independentPGCleanupR29RootProgram(B){
 let original=buildCleanupR29HostProgram();const stop=original.indexOf('import datetime,posixpath,select,errno');need(stop>0,'QA_PG_CLEANUP_BASE_TEMPLATE_CHANGED');let baseProgram=original.slice(0,stop);need(baseProgram.split(JSON.stringify(oldScope)).length===2,'QA_PG_CLEANUP_SCOPE_TEMPLATE_CHANGED');baseProgram=baseProgram.replace(JSON.stringify(oldScope),JSON.stringify(B));
 const native=targetCleanupR29HostProgram(),a=native.indexOf('def unit_state():'),z=native.indexOf('roots_bound();source_before');need(a>0&&z>a,'QA_PG_CLEANUP_NATIVE_TEMPLATE_CHANGED');let census=native.slice(a,z),anchor='related=sorted(descendants|cgroup|workspace)';need(census.split(anchor).length===2,'QA_PG_CLEANUP_NATIVE_TEMPLATE_CHANGED');census=census.replace(anchor,"owner_group={pid for pid,v in records.items() if any(x==OWNER_CGROUP or x.startswith(OWNER_CGROUP+'/') for x in v['cgroups'])};related=sorted(descendants|cgroup|workspace|owner_group)").replace("'allDescendants':sorted(descendants)","'ownerCgroupProcesses':sorted(owner_group),'allDescendants':sorted(descendants)");
 return baseProgram+String.raw`
import datetime,posixpath,select,errno
account=pwd.getpwnam('superopen')
def digest(v):return hashlib.sha256(v if isinstance(v,bytes) else str(v).encode()).hexdigest()
def stat_key(s):return list(key(s))
OWNER_UNIT='jarvis-qa-pg-r29-'+p['attempt']+'-owner.service';OWNER_CGROUP='/system.slice/'+OWNER_UNIT
name='jarvis-qa-pg-r29-'+p['attempt']+'-install';labels={'jarvis.qa.pg.r29.attempt':p['attempt'],'jarvis.qa.pg.r29.kind':'independent-runtime'}
root=Path(p['root']);private=root/p['attempt'];work=private/'work';control=private/'control'
CONTROL_FILES=['activation.json','factory-freeze-independent-pg-runtime-r29.py','r29-qa-pg-build-review.json','r29-qa-pg-cache-contract.json','r29-qa-pg-cache-readback.json','r29-qa-pg-inputs/package.json','r29-qa-pg-inputs/pnpm-lock.yaml','r29-qa-pg-protection-proof.json']
for path in [root,private,control]:
 trusted(path);s=path.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==s.st_gid==0 and stat.S_IMODE(s.st_mode)==0o700,'QA_PG_CLEANUP_PRIVATE_ROOT_CHANGED')
worker_raw=private_read(Path(p['tool']),100000);need(digest(worker_raw)==p['toolSHA'],'QA_PG_CLEANUP_WORKER_CHANGED')
once_raw=private_read(private/'once.json');state_raw=private_read(private/'state.json');once=json.loads(once_raw);state=json.loads(state_raw)
need(digest(once_raw)==p['onceIntentSHA256'] and once.get('schemaVersion')==1 and once.get('kind')=='r29-independent-pg-once-intent' and once.get('attempt')==p['attempt'] and once.get('imageID')==p['image'] and once.get('workerSHA256')==p['toolSHA'] and once.get('cacheContractSHA256')==p['cacheContractSHA256'] and once.get('automaticRetry') is False,'QA_PG_CLEANUP_ONCE_CHANGED')
owner_identity={'pid':p['ownerPID'],'startTicks':p['ownerStartTicks'],'boot':p['ownerBoot']}
expected_owner={'unit':OWNER_UNIT,**owner_identity,'controlGroup':OWNER_CGROUP,'runtimeMaxSec':900,'stopTimeoutSec':120,'restart':'no','killMode':'control-group'}
need(state.get('schemaVersion')==1 and state.get('kind')=='r29-independent-pg-install' and state.get('attempt')==p['attempt'] and state.get('workerSHA256')==p['toolSHA'] and state.get('imageID')==p['image'] and state.get('status') in ['installed','failed'] and state.get('owner')==expected_owner and state.get('cacheContractSHA256')==p['cacheContractSHA256'] and state.get('productSourceMounted') is False and state.get('productCodeExecuted') is False and state.get('actualPGPackageLoaded') is False and state.get('packagesExecutedByRoot') is False and state.get('modelsInvoked') is False,'QA_PG_CLEANUP_STATE_BINDING_CHANGED')
if state['status']=='installed':need(state.get('containerStarted') is True and state.get('containerStopped') is True and type(state.get('containerExitCode')) is int and state['containerExitCode']==0 and type(state.get('cliExitCode')) is int and state['cliExitCode']==0 and state.get('boundedStop') is False,'QA_PG_CLEANUP_INSTALLED_WITHOUT_EXECUTION')
contract_raw=private_read(control/'r29-qa-pg-cache-contract.json');need(digest(contract_raw)==p['cacheContractSHA256'],'QA_PG_CLEANUP_CACHE_CONTRACT_CHANGED');contract=json.loads(contract_raw);caches=contract.get('caches')
need(contract.get('schemaVersion')==1 and contract.get('kind')=='r29-pg-root-cache-reuse' and contract.get('producerAttempt')=='6cc370ff0a1b82babedc165b0e574c26' and isinstance(caches,list) and [c.get('name') for c in caches]==['corepack-runtime','corepack-cache','pnpm-store'],'QA_PG_CLEANUP_CACHE_MOUNT_SET_CHANGED')
for c in caches:
 expected='/var/lib/jarvis-development/101/truth-gate-r29-build/6cc370ff0a1b82babedc165b0e574c26';need(set(c)=={'name','root','manifestPath','manifestSHA256'} and c['root']==expected+'/caches/'+c['name'] and c['manifestPath']==expected+'/cache-manifests/'+c['name']+'.json' and re.fullmatch('[a-f0-9]{64}',c['manifestSHA256']),'QA_PG_CLEANUP_CACHE_MOUNT_CHANGED')
creation_path=private/'creation-intent.json';creation_raw=private_read(creation_path) if os.path.lexists(creation_path) else None
if creation_raw is not None:
 created=json.loads(creation_raw);need(set(created)=={'schemaVersion','kind','attempt','containerName','workerSHA256','imageID','cacheContractSHA256','caches','emptyResourceScopeVerified','createdAt'} and created.get('schemaVersion')==1 and created.get('kind')=='r29-pg-container-create-intent' and created.get('attempt')==p['attempt'] and created.get('containerName')==name and created.get('workerSHA256')==p['toolSHA'] and created.get('imageID')==p['image'] and created.get('cacheContractSHA256')==p['cacheContractSHA256'] and created.get('caches')==caches and created.get('emptyResourceScopeVerified') is True,'QA_PG_CLEANUP_CREATION_INTENT_CHANGED')
else:need(state.get('containerID') is None and state['status']=='failed','QA_PG_CLEANUP_CREATION_INTENT_MISSING')
log_path=private/'install.log';log_raw=private_read(log_path,4*1024*1024) if os.path.lexists(log_path) else None
if log_raw is not None:need(type(state.get('privateLogBytes')) is int and len(log_raw)==state['privateLogBytes'] and digest(log_raw)==state.get('privateLogSHA256'),'QA_PG_CLEANUP_INSTALL_LOG_CHANGED')
else:need(state['status']=='failed' and state.get('privateLogBytes') in [None,0],'QA_PG_CLEANUP_INSTALL_LOG_MISSING')

def directory_state(path,uid,strict_owner=True):
 fd=h.open_directory(str(path));entries=[];count=0
 def walk(current,relative=''):
  nonlocal count
  before=os.fstat(current);names=sorted(os.listdir(current))
  for n in names:
   count+=1;need(count<=100000,'QA_PG_CLEANUP_TREE_LIMIT');s=os.stat(n,dir_fd=current,follow_symlinks=False);rel=relative+'/'+n if relative else n
   need(stat.S_ISREG(s.st_mode) or stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode) or stat.S_ISSOCK(s.st_mode),'QA_PG_CLEANUP_TREE_TYPE_INVALID')
   target=os.readlink(n,dir_fd=current) if stat.S_ISLNK(s.st_mode) else None
   if strict_owner:need(s.st_uid==s.st_gid==uid,'QA_PG_CLEANUP_TREE_OWNER_CHANGED')
   else:need(s.st_uid==s.st_gid and s.st_uid in [0,1000],'QA_PG_CLEANUP_TREE_OWNER_CHANGED')
   if uid==0 and strict_owner:need(not s.st_mode&0o022 and not stat.S_ISLNK(s.st_mode) and not stat.S_ISSOCK(s.st_mode),'QA_PG_CLEANUP_CONTROL_UNTRUSTED')
   if stat.S_ISREG(s.st_mode):need(s.st_nlink==1,'QA_PG_CLEANUP_TREE_HARDLINK')
   if target is not None:need(internal_link(rel,target),'QA_PG_CLEANUP_TREE_LINK_ESCAPE')
   entries.append([rel,*stat_key(s),digest(target) if target is not None else None])
   if stat.S_ISDIR(s.st_mode):
    child=os.open(n,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=current)
    try:need(key(s)==key(os.fstat(child)),'QA_PG_CLEANUP_TREE_DIRECTORY_CHANGED');walk(child,rel)
    finally:os.close(child)
  need(key(before)==key(os.fstat(current)) and names==sorted(os.listdir(current)),'QA_PG_CLEANUP_TREE_DIRECTORY_CHANGED')
 try:
  info=os.fstat(fd);need(info.st_uid==info.st_gid==uid and stat.S_IMODE(info.st_mode)==0o700,'QA_PG_CLEANUP_TREE_ROOT_CHANGED');walk(fd);ident=identity(fd);named=h.open_directory(str(path))
  try:need(identity(named)==ident,'QA_PG_CLEANUP_TREE_ROOT_CHANGED')
  finally:os.close(named)
  return {'identity':ident,'uid':uid,'mode':stat.S_IMODE(info.st_mode),'metadataSHA256':hashv(entries),'entries':count,'paths':[x[0] for x in entries],'nofollow':True,'stable':True}
 finally:os.close(fd)

def control_state():
 tree=directory_state(control,0);need(sorted(tree.pop('paths'))==sorted(CONTROL_FILES+['r29-qa-pg-inputs']),'QA_PG_CLEANUP_CONTROL_SET_CHANGED');files={x:digest(private_read(control/x,16*1024*1024)) for x in CONTROL_FILES}
 need(hashv(files)==p['controlInventorySHA256'] and files['activation.json']==p['activationSHA256'] and files['factory-freeze-independent-pg-runtime-r29.py']==p['freezerSHA256'] and files['r29-qa-pg-cache-contract.json']==p['cacheContractSHA256'] and files['r29-qa-pg-cache-readback.json']==p['cacheReadbackSHA256'],'QA_PG_CLEANUP_CONTROL_BYTES_CHANGED')
 value=json.loads(private_read(control/'activation.json'));need(set(value)=={'schemaVersion','kind','attempt','workerSHA256','pgVersion','imageID','candidate','originalGoalsSHA256','basisRefs','pins'} and value.get('schemaVersion')==1 and value.get('kind')=='r29-independent-pg-exact-activation' and value.get('attempt')==p['attempt'] and value.get('workerSHA256')==p['toolSHA'] and value.get('pgVersion')=='8.23.0' and value.get('imageID')==p['image'] and value.get('candidate')=={'fingerprint':p['sourceFP'],'files':p['files'],'metadataSHA256':p['meta'],'identity':p['id']} and value.get('originalGoalsSHA256')=='23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42' and value.get('basisRefs')==p['basisRefs'],'QA_PG_CLEANUP_ACTIVATION_CHANGED')
 pins=value.get('pins');need(isinstance(pins,dict) and set(pins)=={'cacheContractSHA256','cacheReadbackSHA256','freezerSHA256','reviewSHA256','protectionSHA256'} and pins.get('cacheContractSHA256')==p['cacheContractSHA256'] and pins.get('cacheReadbackSHA256')==p['cacheReadbackSHA256'] and pins.get('freezerSHA256')==p['freezerSHA256'] and pins.get('reviewSHA256')==files['r29-qa-pg-build-review.json'] and pins.get('protectionSHA256')==files['r29-qa-pg-protection-proof.json'],'QA_PG_CLEANUP_ACTIVATION_PINS_CHANGED')
 return {**tree,'files':files,'activationBound':True,'requiredFilesBound':True}

def docker(args):return subprocess.run(['/usr/bin/docker',*args],capture_output=True,timeout=15,env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'})
def docker_census():
 absent=[];present=[];r=docker(['container','inspect',name])
 if r.returncode==1:
  need(json.loads(r.stdout)==[] and r.stderr.decode('utf8','strict').strip() in ['Error response from daemon: No such container: '+name,'Error: No such container: '+name,'Error: No such object: '+name],'QA_PG_CLEANUP_DOCKER_ABSENCE_UNCONFIRMED');absent.append(name)
 else:
  need(r.returncode==0,'QA_PG_CLEANUP_DOCKER_READ_FAILED');v=json.loads(r.stdout);need(isinstance(v,list) and len(v)==1 and v[0].get('Name')=='/'+name,'QA_PG_CLEANUP_DOCKER_INSPECT_INVALID');v=v[0]
  expected_mounts=[(str(work),'/work',True)]+[(c['root'],'/'+c['name'],False) for c in caches];mounts=v.get('Mounts');need(v.get('Image')==p['image'] and isinstance(mounts,list) and len(mounts)==4 and v.get('Config',{}).get('User')=='1000:1000' and all(v.get('Config',{}).get('Labels',{}).get(k)==x for k,x in labels.items()),'QA_PG_CLEANUP_PRESENT_CONTAINER_SCOPE_CHANGED')
  for src,dst,rw in expected_mounts:
   match=[m for m in mounts if m.get('Destination')==dst];need(len(match)==1 and match[0].get('Type')=='bind' and match[0].get('Source')==src and match[0].get('RW') is rw,'QA_PG_CLEANUP_PRESENT_CONTAINER_MOUNT_CHANGED')
  present.append({'name':name,'id':v.get('Id'),'image':v.get('Image'),'labelsSHA256':hashv(v.get('Config',{}).get('Labels',{})),'actualMountsVerified':True})
 scopes=[]
 for filters in [['label=jarvis.qa.pg.r29.attempt='+p['attempt']],['label=jarvis.qa.pg.r29.attempt='+p['attempt'],'label=jarvis.qa.pg.r29.kind=independent-runtime']]:
  values={}
  for kind,head in [('containers',['ps','-aq']),('networks',['network','ls','-q']),('volumes',['volume','ls','-q'])]:
   args=list(head)
   for f in filters:args+=['--filter',f]
   r=docker(args);need(r.returncode==0,'QA_PG_CLEANUP_DOCKER_SCOPE_READ_FAILED');ids=r.stdout.decode('utf8','strict').splitlines();need(len(ids)<=1000 and all(re.fullmatch('[A-Za-z0-9_.-]{1,128}',x) for x in ids),'QA_PG_CLEANUP_DOCKER_SCOPE_FORMAT_INVALID');values[kind]=ids
  scopes.append({'filters':filters,**values})
 return {'exactNames':[name],'absentNames':absent,'present':present,'labelScopes':scopes,'containersNetworksVolumesQueried':True,'readOnly':True,'complete':len(absent)==1 and not present and all(not s[k] for s in scopes for k in ['containers','networks','volumes'])}

def owner_probe():
 boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip();need(boot==p['ownerBoot'],'QA_PG_CLEANUP_OWNER_BOOT_CHANGED')
 try:os.stat('/proc/'+str(p['ownerPID']),follow_symlinks=False);absent=False
 except FileNotFoundError as e:need(e.errno==errno.ENOENT,'QA_PG_CLEANUP_OWNER_READ_FAILED');absent=True
 r=subprocess.run(['/usr/bin/systemctl','show',OWNER_UNIT,'--property=Id,LoadState,ActiveState,SubState,MainPID,ControlGroup'],capture_output=True,text=True,timeout=10,env=env);need(r.returncode==0,'QA_PG_CLEANUP_OWNER_UNIT_READ_FAILED');v=dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x)
 need(v.get('Id')==OWNER_UNIT and v.get('LoadState') in ['loaded','not-found'] and v.get('ActiveState') in ['active','inactive','failed','activating','deactivating'] and re.fullmatch('[0-9]+',v.get('MainPID','')) and v.get('ControlGroup') in ['',OWNER_CGROUP],'QA_PG_CLEANUP_OWNER_UNIT_INVALID')
 cg=Path('/sys/fs/cgroup'+OWNER_CGROUP);pids=[];present=os.path.lexists(cg)
 if present:
  def visit(path):
   s=path.lstat();need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode),'QA_PG_CLEANUP_CGROUP_INVALID');text=(path/'cgroup.procs').read_text();pids.extend(int(x) for x in text.splitlines());need(len(pids)<=100000,'QA_PG_CLEANUP_CGROUP_LIMIT')
   for e in path.iterdir():
    if e.is_dir():visit(e)
  visit(cg)
 return {'identity':owner_identity,'bootSame':True,'pidAbsent':absent,'unit':{k:v[k] for k in ['Id','LoadState','ActiveState','SubState','MainPID','ControlGroup']},'cgroupPath':OWNER_CGROUP,'cgroupPresent':present,'cgroupPIDs':sorted(set(pids)),'readOnly':True,'originalOwnerContractVerified':True,'runtimeMaxSec':900,'stopTimeoutSec':120,'exactExecStopPostConfigured':True,'complete':absent and v['ActiveState'] in ['inactive','failed'] and v['MainPID']=='0' and not pids}
`+census+String.raw`
p={**p,'workspace':str(private)}
source_before,_=source_state(p['source']);expected_source={'sha256':p['fingerprint'],'files':p['sourceFiles'],'bytes':p['sourceBytes'],'metadataSHA':p['metadataSHA'],'identity':p['sourceIdentity']};need({k:source_before[k] for k in expected_source}==expected_source,'QA_PG_CLEANUP_SOURCE_CHANGED')
attempt_before=directory_state(private,0,False);control_before=control_state();work_before=directory_state(work,1000);sockets_before=workspace_sockets();docker_before=docker_census();owner_before=owner_probe();scan_before=census()
attempt_after=directory_state(private,0,False);control_after=control_state();work_after=directory_state(work,1000);sockets_after=workspace_sockets();docker_after=docker_census();owner_after=owner_probe();scan_after=census();source_after,_=source_state(p['source'])
need(source_before==source_after and attempt_before==attempt_after and control_before==control_after and work_before==work_after and sockets_before==sockets_after and docker_before==docker_after and owner_before==owner_after and scan_before['node']==scan_after['node'] and scan_before['ack']==scan_after['ack'],'QA_PG_CLEANUP_OBSERVATION_CHANGED')
need(private_read(private/'once.json')==once_raw and private_read(private/'state.json')==state_raw and private_read(Path(p['tool']),100000)==worker_raw,'QA_PG_CLEANUP_RECEIPTS_CHANGED')
need((private_read(creation_path) if os.path.lexists(creation_path) else None)==creation_raw and (private_read(log_path,4*1024*1024) if os.path.lexists(log_path) else None)==log_raw,'QA_PG_CLEANUP_CREATION_OR_LOG_CHANGED')
complete=not scan_before['readIncompletePIDs'] and not scan_after['readIncompletePIDs'] and not scan_before['relatedProcesses'] and not scan_after['relatedProcesses'] and not sockets_after['filesystem'] and not sockets_after['procNetUnix'] and all(v==0 for v in scan_after['ack']['counts'].values())
attempt_after.pop('paths');work_after.pop('paths')
print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'attempt':p['attempt'],'source':source_after,'sourceBeforeAfterStable':True,'privateReceiptsStable':True,'workerSHA256':digest(worker_raw),'activationSHA256':p['activationSHA256'],'onceIntentSHA256':digest(once_raw),'controlInventorySHA256':hashv(control_after['files']),'stateSHA256':digest(state_raw),'installStatus':state['status'],'creationIntentSHA256':digest(creation_raw) if creation_raw is not None else None,'privateInstallLogSHA256':digest(log_raw) if log_raw is not None else None,'privateInstallLogBytes':len(log_raw) if log_raw is not None else 0,'mountPolicy':{'creationIntentBound':True,'expectedDestinations':['/work','/corepack-runtime','/corepack-cache','/pnpm-store'],'productSourceMounted':False,'hostDockerSocketMounted':False,'actualContainerMountsObserved':bool(docker_after['present'])},'attemptDirectory':attempt_after,'control':control_after,'work':work_after,'docker':docker_after,'owner':owner_after,'node':scan_after['node'],'nodeACK':scan_after['ack'],'scans':[scan_before,scan_after],'workspaceSockets':sockets_after,'procScope':{'fullProcScan':True,'includesAllDescendants':True,'includesUnitCgroupOrphans':True,'includesWorkspaceCwdExeArgvFD':True,'includesInstallerOwnerCgroup':True,'workspace':str(private),'persistentMainPIDExcluded':scan_after['node']['pid'],'twoScans':True},'nativeProcessAndSocketCleanupVerified':complete,'mutationsPerformed':False,'signalsSent':False,'resourcesRemoved':False,'rawLogsExported':False,'privateEnvironmentExported':False,'rawArgvExported':False,'packageJavaScriptExecuted':False}))
`;
}

export async function verifyFactoryIndependentPGCleanupR29(options={},deps={}){
 need(Object.keys(options).every(k=>k==='attempt')&&(options.attempt===undefined||A.test(options.attempt)),'QA_PG_CLEANUP_ARGUMENT_INVALID');
 need(!deps.fixedScope||typeof deps.readRoot==='function','QA_PG_CLEANUP_TEST_SCOPE_REQUIRES_EXPLICIT_READER');
 const S=deps.fixedScope??independentPGCleanupR29Scope,d={readLocal:safeReadLocal,readRoot:defaultReadRoot,verifyProtection:verifyFactoryProtectionContractR29R2,now:Date.now,...deps};
 if(!pinned(S))return {...base(),reason:'QA_PG_CLEANUP_SCOPE_NOT_FROZEN',remoteReadPerformed:false};
 let raw;try{raw=await d.readLocal(jp)}catch(e){if(e.code==='ENOENT')return {...base(),reason:'QA_PG_CLEANUP_NOT_DISPATCHED',remoteReadPerformed:false};throw e}
 const q=JSON.parse(raw);if(q.dispatched!==true)return {...base(),reason:'QA_PG_CLEANUP_NOT_DISPATCHED',remoteReadPerformed:false};need(options.attempt===q.attempt,'QA_PG_CLEANUP_EXACT_ATTEMPT_REQUIRED');
 const ref=q.receipts?.start;need(/^artifacts\/software-factory\/goals-r29\/independent-pg-runtime-start-\d{13}-[a-f0-9-]{36}\.json$/.test(ref?.path??'')&&H.test(ref.sha256??''),'QA_PG_CLEANUP_START_REFERENCE_INVALID');const startRaw=await d.readLocal(ref.path);need(sha(startRaw)===ref.sha256,'QA_PG_CLEANUP_START_RECEIPT_CHANGED');const B=assertIndependentPGCleanupContext(q,JSON.parse(startRaw),S);
 const before=await d.verifyProtection();need(before.ready===true&&before.newContractInventoryVerified===true&&before.protectedInventoryFullyVerified===true&&before.fullQueueSQLVerified===true&&before.newProtectedInventorySHA256===P.newStockSHA256,'QA_PG_CLEANUP_NEW_PROTECTION_INCOMPLETE');
 const host=parseIndependentPGCleanupHost(await d.readRoot(B,independentPGCleanupR29RootProgram(B))),flags=assertIndependentPGCleanupHost(host,B),after=await d.verifyProtection();need(after.ready===true&&after.newContractInventoryVerified===true&&after.protectedInventoryFullyVerified===true&&after.fullQueueSQLVerified===true&&after.newProtectedInventorySHA256===P.newStockSHA256&&same(before.sources,after.sources)&&same(before.terminal,after.terminal)&&before.nodeConfigSHA256===after.nodeConfigSHA256&&same(nodeIdentity(host.node),nodeIdentity(before.node))&&same(nodeIdentity(host.node),nodeIdentity(after.node))&&same(host.nodeACK,before.observations.nativeSource.nodeACK)&&same(host.nodeACK,after.observations.nativeSource.nodeACK),'QA_PG_CLEANUP_PROTECTION_OR_ACK_CHANGED');
 need(same(await d.readLocal(jp),raw)&&sha(await d.readLocal(ref.path))===ref.sha256&&Number.isFinite(Date.parse(host.observedAt))&&d.now()-Date.parse(host.observedAt)>=-30000&&d.now()-Date.parse(host.observedAt)<300000,'QA_PG_CLEANUP_CONTEXT_OR_AGE_CHANGED');
 return {...base(),at:new Date(d.now()).toISOString(),attempt:B.attempt,imageID:B.image,ready:flags.cleanupIndependentlyVerified,...flags,protectedInventoryFullyVerified:true,fullQueueSQLVerified:true,newProtectionContract:true,originalContractProtectionVerified:false,workerSHA256:B.toolSHA,activationSHA256:B.activationSHA256,onceIntentSHA256:B.onceIntentSHA256,controlInventorySHA256:B.controlInventorySHA256,actualPrivateStateSHA256:host.stateSHA256,installStatus:host.installStatus,sourceFingerprint:B.fingerprint,sourceFiles:621,remoteReadPerformed:true,newProtectionBefore:before,newProtectionAfter:after,host};
}
export function independentPGCleanupFailure(e){const m=String(e?.message??'');return {...base(),at:new Date().toISOString(),errorCode:/^QA_PG_CLEANUP_[A-Z0-9_]+$/.test(m)?m:'QA_PG_CLEANUP_OBSERVATION_FAILED',rawErrorExported:false,automaticRetry:false};}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let r;try{need(process.argv.length<=3&&(process.argv[2]===undefined||/^--attempt=[a-f0-9]{32}$/.test(process.argv[2])),'QA_PG_CLEANUP_ARGUMENT_INVALID');r=await verifyFactoryIndependentPGCleanupR29(process.argv[2]?{attempt:process.argv[2].slice(10)}:{});if(!r.ready)process.exitCode=1}catch(e){const f=await open('.jarvis-dev/maintenance/pg-cleanup-private-error-'+Date.now()+'-'+randomUUID()+'.json','wx',0o600);try{await f.writeFile(JSON.stringify({message:String(e.message),stack:String(e.stack)})+'\n');await f.sync()}finally{await f.close()}r=independentPGCleanupFailure(e);process.exitCode=1}
 await mkdir('artifacts/software-factory/goals-r29',{recursive:true});const path='artifacts/software-factory/goals-r29/independent-pg-cleanup-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(r,null,2)+'\n',f=await open(path,'wx',0o644);try{await f.writeFile(raw);await f.sync()}finally{await f.close()}console.log(JSON.stringify({path,sha256:sha(raw),ready:r.ready,attempt:r.attempt,errorCode:r.errorCode,reason:r.reason}));
}
