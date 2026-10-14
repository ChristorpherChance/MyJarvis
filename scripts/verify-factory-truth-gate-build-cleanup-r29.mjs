/** Independent, read-only observation of the first failed R29 build. Import has no IO. */
import {mkdir,open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sha,canonical} from './run-factory-main-repair-r26.mjs';
import {safeReadLocal,settleEvidenceReads} from './factory-repair-evidence-read-r26.mjs';
import {verifyFactoryTargetCleanupR29,targetCleanupR29HostProgram,assertTargetCleanupR29NativeHost} from './verify-factory-target-cleanup-r29.mjs';
import {r28HostBase} from './factory-verifier-host-r28.mjs';
import {defaultReadRoot} from './install-factory-repair-verifier-r26.mjs';
import {withPlatform} from './managed-server-client.mjs';

const need=(v,c)=>{if(!v)throw Error(c)},same=(a,b)=>canonical(a)===canonical(b),H=/^[a-f0-9]{64}$/;
export const buildCleanupR29Scope=Object.freeze({
 attempt:'87f3586d3391977c77b225d9134b6945',source:'/home/superopen/All-Projects/msf-targets-r29/source',fingerprint:'4907e45a21799f2dd14ac2373769607f40d6b9e0319bb614fbe259b157e60493',metadataSHA:'2da9d3e490fd6d042113c067807a89b000a4f40fdb5fa8d3ca2911b6615ebce8',sourceFiles:621,sourceBytes:18386584,
 sourceIdentity:Object.freeze({device:66306,inode:6718050}),root:'/var/lib/jarvis-development/101/truth-gate-r29-build',tool:'/opt/jarvis-development/software-factory/factory-truth-gate-build-r29-0b94c6191e3e2e53.py',toolSHA:'0b94c6191e3e2e53e6d47ee6631a721d2291fd98e923ab440e1a8960b35f4a6b',helperSHA:'57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2',agentId:'0b5aea06-47e1-4f4b-a32e-969417915c9c',
 image:'sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96',ownerPID:1651810,ownerStartTicks:'27659847',ownerBoot:'328726a0-5495-4892-b0a6-2fa9de26242e',
 journalPath:'.jarvis-dev/maintenance/factory-r29-isolated-build-attempt.json',nativeJournalPath:'.jarvis-dev/maintenance/factory-target-repair-r29.json',startPath:'artifacts/software-factory/goals-r29/isolated-build-start-1791823962604.json',startSHA:'b4753aa1aa0c5538efc781fe117bf8bb95dcffc73c2a4353b5e2e8840bf2ac0a',checkPath:'artifacts/software-factory/goals-r29/isolated-build-check-1791824207811.json',checkSHA:'64d9bd97dc53d517054a16d23fcab5eddc425544987710a0dd32c23d158070a6',artifactDirectory:'artifacts/software-factory/goals-r29'
});
const B=buildCleanupR29Scope,stages=Object.freeze(['offline-install','build','typecheck','truth-unit']);
export const buildCleanupR29Names=Object.freeze(stages.map(s=>'jarvis-tg-r29-'+B.attempt+'-'+s));
const ownerIdentity=()=>({pid:B.ownerPID,startTicks:B.ownerStartTicks,boot:B.ownerBoot}),ownerUnit='jarvis-tg-r29-'+B.attempt+'-owner.service',ownerCgroup='/system.slice/'+ownerUnit;
const source=()=>({sha256:B.fingerprint,files:B.sourceFiles,bytes:B.sourceBytes,metadataSHA:B.metadataSHA,identity:B.sourceIdentity});
export function assertBuildCleanupR29Context(q,start,check){
 need(q?.version===1&&q.attempt===B.attempt&&q.startAttemptedAt&&q.scope?.source===B.source&&q.scope.fingerprint===B.fingerprint&&q.scope.metadataSHA===B.metadataSHA&&q.scope.sourceFiles===621&&q.scope.sourceBytes===B.sourceBytes&&q.scope.root===B.root&&q.scope.tool===B.tool&&q.scope.toolSHA===B.toolSHA,'R29_BUILD_CLEANUP_JOURNAL_CHANGED');
 need(start?.attempt===B.attempt&&start.kind==='software-factory-r29-once-build-observation'&&start.launchPhase==='dispatched'&&start.ownerUnit===ownerUnit&&same(start.processIdentity,ownerIdentity())&&start.installedToolSHA256===B.toolSHA&&same(start.scope,q.scope)&&same(q.receipts?.start?.processIdentity,ownerIdentity())&&q.receipts.start.launchPhase==='dispatched','R29_BUILD_CLEANUP_START_BINDING_CHANGED');
 need(check?.attempt===B.attempt&&same(check.scope,q.scope)&&check.kind===start.kind&&check.readOnly===true&&check.ownerUnit===ownerUnit&&check.launchPhase==='dispatched'&&same(check.processIdentity,ownerIdentity())&&check.installedToolSHA256===B.toolSHA&&check.state?.status==='fail'&&same(check.state.source,source())&&same(check.state.sourceAfter,source())&&check.state.sourceUnchanged===true&&check.state.sourceReadComplete===true&&check.state.productAccepted===false&&check.state.independentDBAPIValidation===false&&same(check.state.resources?.containers,buildCleanupR29Names),'R29_BUILD_CLEANUP_TERMINAL_BINDING_CHANGED');
 need(check.state.checks?.length===1&&check.state.checks[0].id==='offline-install'&&check.state.checks[0].executed===false&&check.state.checks[0].status==='fail'&&check.state.checks[0].exitCode===1&&same(check.state.noRecordedResultStages,['build','typecheck','truth-unit'])&&check.state.noRecordedResultExecutionState==='unknown','R29_BUILD_CLEANUP_EXECUTION_BOUNDARY_CHANGED');
 return q;
}
export function buildCleanupR29HostProgram(){
 // Use the frozen R3 observer's actual pidfd/FD/socket readers; no worker cleanup code is loaded.
 const native=targetCleanupR29HostProgram(),a=native.indexOf('def unit_state():'),z=native.indexOf('roots_bound();source_before');need(a>0&&z>a,'R29_BUILD_CLEANUP_CENSUS_TEMPLATE_CHANGED');
 let census=native.slice(a,z),anchor='related=sorted(descendants|cgroup|workspace)';need(census.split(anchor).length===2,'R29_BUILD_CLEANUP_CENSUS_TEMPLATE_CHANGED');
 census=census.replace(anchor,"owner_group={pid for pid,v in records.items() if any(x==OWNER_CGROUP or x.startswith(OWNER_CGROUP+'/') for x in v['cgroups'])};related=sorted(descendants|cgroup|workspace|owner_group)").replace("'allDescendants':sorted(descendants)","'ownerCgroupProcesses':sorted(owner_group),'allDescendants':sorted(descendants)");
 const stop=r28HostBase.indexOf('def quiet():');need(stop>0,'R29_BUILD_CLEANUP_HELPER_TEMPLATE_CHANGED');
 let base=r28HostBase.slice(0,stop);const guard=base.indexOf("need(p['workspace']=="),end=base.indexOf("\nenv=",guard);need(guard>0&&end>guard,'R29_BUILD_CLEANUP_HELPER_TEMPLATE_CHANGED');
 base=base.slice(0,guard)+`expected_scope=json.loads('${JSON.stringify(B)}')\nneed(p==expected_scope,'R29_BUILD_CLEANUP_FIXED_SCOPE_CHANGED')\n`+base.slice(end);
 base=base.replace("p['fixedTools']['project-autonomy-evidence.py']","p['helperSHA']");
 return base+String.raw`
import datetime,posixpath,select,errno
account=pwd.getpwnam('superopen')
def digest(v):return hashlib.sha256(v if isinstance(v,bytes) else str(v).encode()).hexdigest()
def stat_key(s):return list(key(s))
OWNER_UNIT='jarvis-tg-r29-'+p['attempt']+'-owner.service';OWNER_CGROUP='/system.slice/'+OWNER_UNIT
names=['jarvis-tg-r29-'+p['attempt']+'-'+s for s in ['offline-install','build','typecheck','truth-unit']]
labels={'jarvis.truthgate.r29.attempt':p['attempt'],'jarvis.truthgate.r29.kind':'build'}
root=Path(p['root']);attempt_root=root/p['attempt'];work=attempt_root/'work'
for path in [root,attempt_root,root/'ownership',root/'launches']:
 trusted(path);s=path.lstat();need(stat.S_ISDIR(s.st_mode) and not s.st_mode&0o077,'R29_BUILD_CLEANUP_PRIVATE_ROOT_CHANGED')
owner_path=root/'ownership'/(p['attempt']+'.json');launch_path=root/'launches'/(p['attempt']+'.json');state_path=attempt_root/'state.json'
owner_raw=private_read(owner_path);launch_raw=private_read(launch_path);state_raw=private_read(state_path)
ownership=json.loads(owner_raw);launch=json.loads(launch_raw);state=json.loads(state_raw)
owner_identity={'pid':p['ownerPID'],'startTicks':p['ownerStartTicks'],'boot':p['ownerBoot']}
need(ownership.get('schemaVersion')==1 and ownership.get('attempt')==p['attempt'] and ownership.get('toolSHA256')==p['toolSHA'] and ownership.get('sourceFingerprint')==p['fingerprint'] and ownership.get('containers')==names and ownership.get('labels')==labels and ownership.get('imageID')==p['image'] and ownership.get('emptyResourceScopeVerified') is True,'R29_BUILD_CLEANUP_OWNERSHIP_CHANGED')
need(launch.get('schemaVersion')==1 and launch.get('kind')=='r29-build-once-launch' and launch.get('attempt')==p['attempt'] and launch.get('phase')=='dispatched' and launch.get('toolSHA256')==p['toolSHA'] and launch.get('sourceFingerprint')==p['fingerprint'] and launch.get('ownerUnit')==OWNER_UNIT and launch.get('processIdentity')==owner_identity,'R29_BUILD_CLEANUP_LAUNCH_CHANGED')
expected_source={'sha256':p['fingerprint'],'files':p['sourceFiles'],'bytes':p['sourceBytes'],'metadataSHA':p['metadataSHA'],'identity':p['sourceIdentity']}
need(state.get('attempt')==p['attempt'] and state.get('status')=='fail' and state.get('source')==expected_source and state.get('sourceAfter')==expected_source and state.get('sourceUnchanged') is True and state.get('sourceReadComplete') is True and state.get('imageID')==p['image'] and state.get('resources')=={'containers':names,'networks':[],'volumes':[],'labels':labels} and state.get('productAccepted') is False and state.get('independentDBAPIValidation') is False,'R29_BUILD_CLEANUP_STATE_BINDING_CHANGED')
need(digest(private_read(Path(p['tool']),100000))==p['toolSHA'],'R29_BUILD_CLEANUP_INSTALLED_TOOL_CHANGED')
expected_state_owner={'unit':OWNER_UNIT,**owner_identity,'controlGroup':OWNER_CGROUP,'runtimeMaxSec':1800,'stopTimeoutSec':300,'killMode':'control-group','restart':'no','exactExecStopPostConfigured':True}
need(state.get('owner')==expected_state_owner,'R29_BUILD_CLEANUP_OWNER_RECEIPT_CHANGED')
checks=state.get('checks');need(isinstance(checks,list) and len(checks)==1 and checks[0].get('id')=='offline-install' and checks[0].get('executed') is False and checks[0].get('status')=='fail' and checks[0].get('exitCode')==1 and state.get('noRecordedResultStages')==['build','typecheck','truth-unit'] and state.get('noRecordedResultExecutionState')=='unknown','R29_BUILD_CLEANUP_EXECUTION_BOUNDARY_CHANGED')

def work_state():
 fd=h.open_directory(str(work));entries=[];count=0
 def walk(current,relative):
  nonlocal count
  before=os.fstat(current);current_names=sorted(os.listdir(current))
  for name in current_names:
   count+=1;need(count<=200000,'R29_BUILD_CLEANUP_WORK_LIMIT');s=os.stat(name,dir_fd=current,follow_symlinks=False);rel=relative+'/'+name if relative else name
   need(stat.S_ISREG(s.st_mode) or stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode) or stat.S_ISSOCK(s.st_mode),'R29_BUILD_CLEANUP_WORK_SPECIAL_FILE')
   target=digest(os.readlink(name,dir_fd=current)) if stat.S_ISLNK(s.st_mode) else None
   entries.append([rel,*stat_key(s),target])
   if stat.S_ISDIR(s.st_mode):
    child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=current)
    try:need(key(s)==key(os.fstat(child)),'R29_BUILD_CLEANUP_WORK_DIRECTORY_CHANGED');walk(child,rel)
    finally:os.close(child)
  need(key(before)==key(os.fstat(current)) and current_names==sorted(os.listdir(current)),'R29_BUILD_CLEANUP_WORK_DIRECTORY_CHANGED')
 try:
  info=os.fstat(fd);need(info.st_uid==1000 and not info.st_mode&0o077,'R29_BUILD_CLEANUP_WORK_ROOT_CHANGED');walk(fd,'');ident=identity(fd)
  named=h.open_directory(str(work))
  try:need(identity(named)==ident,'R29_BUILD_CLEANUP_WORK_ROOT_CHANGED')
  finally:os.close(named)
  return {'identity':ident,'metadataSHA256':hashv(entries),'entries':count,'nofollow':True,'stable':True}
 finally:os.close(fd)

def docker(args):
 r=subprocess.run(['/usr/bin/docker',*args],capture_output=True,timeout=15,env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'})
 return r
def docker_census():
 absent=[];present=[]
 for name in names:
  r=docker(['container','inspect',name])
  if r.returncode==1:
   need(json.loads(r.stdout)==[] and r.stderr.decode('utf8','strict').strip() in ['Error response from daemon: No such container: '+name,'Error: No such container: '+name,'Error: No such object: '+name],'R29_BUILD_CLEANUP_DOCKER_ABSENCE_UNCONFIRMED');absent.append(name)
  else:
   need(r.returncode==0,'R29_BUILD_CLEANUP_DOCKER_READ_FAILED');v=json.loads(r.stdout);need(isinstance(v,list) and len(v)==1 and v[0].get('Name')=='/'+name,'R29_BUILD_CLEANUP_DOCKER_INSPECT_INVALID');present.append({'name':name,'id':v[0].get('Id'),'image':v[0].get('Image'),'labelsSHA256':hashv(v[0].get('Config',{}).get('Labels',{}))})
 scopes=[]
 for filters in [['label=jarvis.truthgate.r29.attempt='+p['attempt']],['label=jarvis.truthgate.r29.attempt='+p['attempt'],'label=jarvis.truthgate.r29.kind=build']]:
  values={}
  for kind,head in [('containers',['ps','-aq']),('networks',['network','ls','-q']),('volumes',['volume','ls','-q'])]:
   args=list(head)
   for f in filters:args+=['--filter',f]
   r=docker(args);need(r.returncode==0,'R29_BUILD_CLEANUP_DOCKER_SCOPE_READ_FAILED');ids=r.stdout.decode('utf8','strict').splitlines();need(len(ids)<=1000 and all(re.fullmatch('[A-Za-z0-9_.-]{1,128}',x) for x in ids),'R29_BUILD_CLEANUP_DOCKER_SCOPE_FORMAT_INVALID');values[kind]=ids
  scopes.append({'filters':filters,**values})
 return {'exactNames':names,'absentNames':absent,'present':present,'labelScopes':scopes,'containersNetworksVolumesQueried':True,'readOnly':True,'complete':len(absent)==4 and not present and all(not s[k] for s in scopes for k in ['containers','networks','volumes'])}

def owner_probe():
 boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip();need(boot==p['ownerBoot'],'R29_BUILD_CLEANUP_OWNER_BOOT_CHANGED')
 try:os.stat('/proc/'+str(p['ownerPID']),follow_symlinks=False);absent=False
 except FileNotFoundError as e:need(e.errno==errno.ENOENT,'R29_BUILD_CLEANUP_OWNER_READ_FAILED');absent=True
 r=subprocess.run(['/usr/bin/systemctl','show',OWNER_UNIT,'--property=Id,LoadState,ActiveState,SubState,MainPID,ControlGroup'],capture_output=True,text=True,timeout=10,env=env)
 need(r.returncode==0,'R29_BUILD_CLEANUP_OWNER_UNIT_READ_FAILED');v=dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x)
 need(v.get('Id')==OWNER_UNIT and v.get('LoadState') in ['loaded','not-found'] and v.get('ActiveState') in ['active','inactive','failed','activating','deactivating'] and re.fullmatch('[0-9]+',v.get('MainPID','')) and v.get('ControlGroup') in ['',OWNER_CGROUP],'R29_BUILD_CLEANUP_OWNER_UNIT_INVALID')
 cg=Path('/sys/fs/cgroup'+OWNER_CGROUP);pids=[];cg_present=os.path.lexists(cg)
 if cg_present:
  def visit(path):
   s=path.lstat();need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode),'R29_BUILD_CLEANUP_CGROUP_INVALID')
   text=(path/'cgroup.procs').read_text();pids.extend(int(x) for x in text.splitlines());need(len(pids)<=100000,'R29_BUILD_CLEANUP_CGROUP_LIMIT')
   for entry in path.iterdir():
    if entry.is_dir():visit(entry)
  visit(cg)
 return {'identity':owner_identity,'bootSame':True,'pidAbsent':absent,'unit':{k:v[k] for k in ['Id','LoadState','ActiveState','SubState','MainPID','ControlGroup']},'cgroupPath':OWNER_CGROUP,'cgroupPresent':cg_present,'cgroupPIDs':sorted(set(pids)),'readOnly':True,'complete':absent and v['ActiveState'] in ['inactive','failed'] and v['MainPID']=='0' and not pids}
`+census+String.raw`
# p is already exactly bound. This private override scopes the imported pure census to build work.
p={**p,'workspace':str(work)}
source_before,_=source_state(p['source']);need({k:source_before[k] for k in expected_source}==expected_source,'R29_BUILD_CLEANUP_SOURCE_CHANGED')
work_before=work_state();sockets_before=workspace_sockets();docker_before=docker_census();owner_before=owner_probe();scan_before=census()
work_after=work_state();sockets_after=workspace_sockets();docker_after=docker_census();owner_after=owner_probe();scan_after=census();source_after,_=source_state(p['source'])
need(source_before==source_after and work_before==work_after and sockets_before==sockets_after and docker_before==docker_after and owner_before==owner_after and scan_before['node']==scan_after['node'] and scan_before['ack']==scan_after['ack'],'R29_BUILD_CLEANUP_OBSERVATION_CHANGED')
need(private_read(owner_path)==owner_raw and private_read(launch_path)==launch_raw and private_read(state_path)==state_raw and digest(private_read(Path(p['tool']),100000))==p['toolSHA'],'R29_BUILD_CLEANUP_RECEIPT_CHANGED')
complete=not scan_before['readIncompletePIDs'] and not scan_after['readIncompletePIDs'] and not scan_before['relatedProcesses'] and not scan_after['relatedProcesses'] and not sockets_after['filesystem'] and not sockets_after['procNetUnix'] and all(v==0 for v in scan_after['ack']['counts'].values())
print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'attempt':p['attempt'],'source':source_after,'work':work_after,'sourceBeforeAfterStable':True,'privateReceiptsStable':True,'ownershipSHA256':digest(owner_raw),'launchSHA256':digest(launch_raw),'stateSHA256':digest(state_raw),'installedToolSHA256':p['toolSHA'],'docker':docker_after,'owner':owner_after,'node':scan_after['node'],'nodeACK':scan_after['ack'],'procScope':{'fullProcScan':True,'includesAllDescendants':True,'includesUnitCgroupOrphans':True,'includesWorkspaceCwdExeArgvFD':True,'includesBuildOwnerCgroup':True,'persistentMainPIDExcluded':scan_after['node']['pid'],'twoScans':True},'scans':[scan_before,scan_after],'workspaceSockets':sockets_after,'nativeProcessAndSocketCleanupVerified':complete,'mutationsPerformed':False,'signalsSent':False,'resourcesRemoved':False,'rawLogsExported':False,'privateEnvironmentExported':False,'rawArgvExported':False}))
`;
}
export function assertBuildCleanupR29Host(h,native,q){
 need(h?.attempt===B.attempt&&same(h.source,{...source(),stable:true})&&h.sourceBeforeAfterStable===true&&h.privateReceiptsStable===true&&['ownershipSHA256','launchSHA256','stateSHA256'].every(k=>H.test(h[k]??''))&&h.installedToolSHA256===B.toolSHA&&h.work?.stable===true&&h.work.nofollow===true&&Number.isSafeInteger(h.work.entries)&&h.work.entries>=621&&Number.isSafeInteger(h.work.identity?.device)&&Number.isSafeInteger(h.work.identity.inode)&&h.work.identity.inode>0&&H.test(h.work.metadataSHA256??''),'R29_BUILD_CLEANUP_HOST_BINDING_CHANGED');
 need(h.mutationsPerformed===false&&h.signalsSent===false&&h.resourcesRemoved===false&&h.rawLogsExported===false&&h.privateEnvironmentExported===false&&h.rawArgvExported===false&&h.procScope?.includesBuildOwnerCgroup===true,'R29_BUILD_CLEANUP_READ_ONLY_BOUNDARY_CHANGED');
 // This validates the actual two-scan closed census with the reviewed R3 invariants, not a cleanup claim.
 const scanComplete=assertTargetCleanupR29NativeHost({...native.nativeHost,node:h.node,nodeACK:h.nodeACK,scans:h.scans,workspaceSockets:h.workspaceSockets,procScope:h.procScope,nativeProcessAndSocketCleanupVerified:h.nativeProcessAndSocketCleanupVerified},q);
 need(h.scans.every(s=>Array.isArray(s.ownerCgroupProcesses))&&same(h.node,native.nativeHost.node)&&same(h.nodeACK,native.nativeHost.nodeACK),'R29_BUILD_CLEANUP_CENSUS_NODE_CHANGED');
 const d=h.docker;need(d?.readOnly===true&&d.containersNetworksVolumesQueried===true&&same(d.exactNames,buildCleanupR29Names)&&Array.isArray(d.absentNames)&&Array.isArray(d.present)&&d.absentNames.every(x=>buildCleanupR29Names.includes(x))&&new Set(d.absentNames).size===d.absentNames.length&&d.labelScopes?.length===2&&same(d.labelScopes.map(x=>x.filters),[['label=jarvis.truthgate.r29.attempt='+B.attempt],['label=jarvis.truthgate.r29.attempt='+B.attempt,'label=jarvis.truthgate.r29.kind=build']])&&d.labelScopes.every(x=>['containers','networks','volumes'].every(k=>Array.isArray(x[k]))),'R29_BUILD_CLEANUP_DOCKER_CENSUS_INCOMPLETE');
 const dockerComplete=d.absentNames.length===4&&!d.present.length&&d.labelScopes.every(x=>['containers','networks','volumes'].every(k=>!x[k].length));need(d.complete===dockerComplete,'R29_BUILD_CLEANUP_DOCKER_COMPLETE_FLAG_CHANGED');
 const o=h.owner;need(o?.readOnly===true&&same(o.identity,ownerIdentity())&&o.bootSame===true&&typeof o.pidAbsent==='boolean'&&o.unit?.Id===ownerUnit&&['loaded','not-found'].includes(o.unit.LoadState)&&['active','inactive','failed','activating','deactivating'].includes(o.unit.ActiveState)&&/^[0-9]+$/.test(o.unit.MainPID??'')&&['',ownerCgroup].includes(o.unit.ControlGroup)&&o.cgroupPath===ownerCgroup&&typeof o.cgroupPresent==='boolean'&&Array.isArray(o.cgroupPIDs)&&o.cgroupPIDs.every(x=>Number.isSafeInteger(x)&&x>0),'R29_BUILD_CLEANUP_OWNER_OBSERVATION_INVALID');
 const ownerComplete=o.pidAbsent&&['inactive','failed'].includes(o.unit.ActiveState)&&o.unit.MainPID==='0'&&!o.cgroupPIDs.length;need(o.complete===ownerComplete,'R29_BUILD_CLEANUP_OWNER_COMPLETE_FLAG_CHANGED');
 return scanComplete&&h.scans.every(s=>!s.ownerCgroupProcesses.length)&&dockerComplete&&ownerComplete;
}
export async function verifyFactoryTruthGateBuildCleanupR29(options={},deps){
 need(Object.keys(options).length===1&&options.attempt===B.attempt,'R29_BUILD_CLEANUP_EXACT_ATTEMPT_REQUIRED');
 if(deps===undefined)return withPlatform(({api})=>verifyFactoryTruthGateBuildCleanupR29(options,{api}));
 const d={now:Date.now,readLocal:safeReadLocal,readRoot:defaultReadRoot,verifyNative:verifyFactoryTargetCleanupR29,...deps};need(typeof d.api==='function','R29_BUILD_CLEANUP_API_REQUIRED');
 const paths=[B.journalPath,B.startPath,B.checkPath,B.nativeJournalPath],raw=await settleEvidenceReads(paths.map(path=>()=>d.readLocal(path,'utf8')));need(sha(raw[1])===B.startSHA&&sha(raw[2])===B.checkSHA,'R29_BUILD_CLEANUP_CHECK_RECEIPT_CHANGED');const [q,start,check,nq]=raw.map(JSON.parse);assertBuildCleanupR29Context(q,start,check);need(nq.restored===true,'R29_BUILD_CLEANUP_SOURCE_TASK_NOT_RESTORED');
 const before=await d.verifyNative({},d),base={schemaVersion:1,kind:'software-factory-r29-build-independent-cleanup',attempt:B.attempt,sourceFingerprint:B.fingerprint,sourceMetadataSHA256:B.metadataSHA,sourceFiles:621,sourceTaskId:nq.taskId,sourceRunId:nq.runId,buildResultStatus:'fail',candidateProductExecutionConfirmed:false,noRecordedResultStages:['build','typecheck','truth-unit'],noRecordedResultExecutionState:'unknown',productAccepted:false,independentDBAPIValidation:false,modelsInvoked:false,remoteMutationsPerformed:false,signalsSent:false,resourcesRemoved:false,workerCleanupClaimsUsedAsProof:false,privateJournalExported:false,rawLogsExported:false,startReceiptSHA256:sha(raw[1]),checkReceiptSHA256:sha(raw[2])};
 if(!before.ready||before.cleanupIndependentlyVerified!==true)return {...base,at:new Date(d.now()).toISOString(),ready:false,cleanupIndependentlyVerified:false,reason:'SOURCE_SCOPE_NOT_INDEPENDENTLY_CLEAN',sourceObservation:before};
 need(same(before.candidate,{...source(),stable:true}),'R29_BUILD_CLEANUP_NATIVE_SOURCE_CHANGED');
 const h=await d.readRoot(B,buildCleanupR29HostProgram()),complete=assertBuildCleanupR29Host(h,before,nq),after=await d.verifyNative({},d);
 need(after.ready&&after.cleanupIndependentlyVerified===true&&same(before.terminal,after.terminal)&&same(before.candidate,after.candidate)&&before.protectedInventorySHA256===after.protectedInventorySHA256&&same(before.nativeHost.node,after.nativeHost.node)&&same(before.nativeHost.nodeACK,after.nativeHost.nodeACK)&&same(after.nativeHost.node,h.node)&&same(after.nativeHost.nodeACK,h.nodeACK)&&before.protectedInventoryUnchanged===true&&after.protectedInventoryUnchanged===true&&before.queueIdle===true&&after.queueIdle===true,'R29_BUILD_CLEANUP_SOURCE_PLATFORM_OBSERVATION_CHANGED');
 const final=await settleEvidenceReads(paths.map(path=>()=>d.readLocal(path,'utf8')));need(same(raw,final),'R29_BUILD_CLEANUP_LOCAL_CONTEXT_CHANGED');need(Number.isFinite(Date.parse(h.observedAt))&&d.now()-Date.parse(h.observedAt)>=-30000&&d.now()-Date.parse(h.observedAt)<300000,'R29_BUILD_CLEANUP_HOST_OBSERVATION_STALE');
 return {...base,at:new Date(d.now()).toISOString(),ready:complete,cleanupIndependentlyVerified:complete,...(complete?{}:{reason:'BUILD_SCOPE_RESOURCES_PROCESSES_OR_SOCKETS_NOT_CLEAN'}),sourceBeforeAfterStable:true,protectedInventoryUnchanged:true,protectedInventorySHA256:after.protectedInventorySHA256,terminal:after.terminal,nodeACKIdle:true,queueIdle:true,nativeSourceObservationSHA256Before:sha(before),nativeSourceObservationSHA256After:sha(after),buildHost:h};
}
export function buildCleanupR29Failure(e){const m=String(e?.message??''),remote=/^RuntimeError: (R29_(?:BUILD_CLEANUP|CLEANUP)_[A-Z0-9_]+)$/.exec(m.trim().split(/\r?\n/).at(-1));return {schemaVersion:1,kind:'software-factory-r29-build-independent-cleanup',attempt:B.attempt,at:new Date().toISOString(),ready:false,cleanupIndependentlyVerified:false,errorCode:/^R29_(BUILD_CLEANUP|CLEANUP)_[A-Z0-9_]+$/.test(m)?m:remote?.[1]??'R29_BUILD_CLEANUP_OBSERVATION_FAILED',automaticRetry:false,remoteMutationsPerformed:false,signalsSent:false,resourcesRemoved:false,modelsInvoked:false,productAccepted:false,rawErrorExported:false,rawLogsExported:false};}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){let r;try{need(process.argv.length===3&&process.argv[2]==='--attempt='+B.attempt,'R29_BUILD_CLEANUP_EXACT_ATTEMPT_REQUIRED');r=await verifyFactoryTruthGateBuildCleanupR29({attempt:B.attempt});if(!r.ready)process.exitCode=1;}catch(e){const pf=await open('.jarvis-dev/maintenance/build-cleanup-r29-private-error-'+Date.now()+'-'+randomUUID()+'.json','wx',0o600);try{await pf.writeFile(JSON.stringify({message:String(e?.message??''),stack:String(e?.stack??'')})+'\n');await pf.sync();}finally{await pf.close();}r=buildCleanupR29Failure(e);process.exitCode=1;}await mkdir(B.artifactDirectory,{recursive:true});const output=B.artifactDirectory+'/build-independent-cleanup-'+Date.now()+'-'+randomUUID()+'.json',text=JSON.stringify(r,null,2)+'\n',fd=await open(output,'wx',0o644);try{await fd.writeFile(text);await fd.sync();}finally{await fd.close();}console.log(JSON.stringify({output,sha256:sha(text),...r}));}
