/** Bounded read-only R28 deployment observation. Does not dispatch, restore or clean. */
import {readFile,open,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {request} from 'node:https';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {withPlatform,remote,lanProfile,python} from './managed-server-client.mjs';
import {sha,canonical} from './run-factory-main-repair-r26.mjs';
import {safeReadLocal} from './factory-repair-evidence-read-r26.mjs';
import {assertR28ExecutionJournal} from './run-factory-acceptance-r28.mjs';
import {verifyR28InstalledManifest,readInstalledR28Host} from './install-factory-verifier-r28.mjs';

export const liveR28Scope=Object.freeze({build:'20261012-supervision-r28-2',releaseCodeSHA256:'370bc32a7ecd8d484d9fa37960449d4bb8fb6e1204cac229a98b31516adc1b05',taskId:'bd55cfd8-33bb-4699-8de5-d43b73e46642',runId:'08ce8722e39ea5750857342cdaadc939ebb26d66',projectId:'70ec346f-6520-46ed-abed-22cac770a3e4',profileSHA256:'367749621fe0cb5aa4f0c441a9524463042f8d33d2d863d960eaae366fef12b9',journalPath:'.jarvis-dev/maintenance/factory-acceptance-r28.json',installationPath:'artifacts/software-factory/acceptance-r28/verifier-installation-9e678be1-c0cb-433d-9e80-726f1f6d4ed7.json',installationSHA256:'1dcfa2000de890d08bdc38bcfb5bb3b7090d81d89e3527ed45b15ad387562ec4',upgradePath:'artifacts/software-factory/acceptance-r28/20261012-candidate-validation-r28-1-node-upgrade.json'});
const S=liveR28Scope,need=(v,c)=>{if(!v)throw Error(c);};
export async function settledReaders(readers){const rows=await Promise.allSettled(readers.map(f=>Promise.resolve().then(f)));return rows;}
const healthProjection=v=>({status:v?.status,build:v?.build,nodeId:v?.nodeId,role:v?.role});
export function assertLiveR28(nodes,health,platform,j,development,host){
 const expectedTemplateSHA256=j.restored===true?j.originalTemplateSHA256:j.fixedTemplateSHA256;
 need(nodes.length===2&&nodes.every(n=>n.release===S.build&&n.currentRelease===S.build&&n.codeSHA256===S.releaseCodeSHA256&&n.observer.build===S.build&&n.observer.nodeId===n.nodeId&&n.observer.role===n.role&&n.services.observer.ActiveState==='active'&&n.services.observer.User==='jarvis'),'R28_LIVE_RELEASE_OR_OBSERVER_INVALID');
 const primary=nodes.find(n=>n.nodeId==='112'),standby=nodes.find(n=>n.nodeId==='101');
 need(primary?.role==='primary'&&primary.services.platform.ActiveState==='active'&&primary.services.platform.UnitFileState==='enabled'&&primary.services.platform.User==='jarvis'&&primary.observer.businessHealthy===true&&standby?.role==='standby'&&standby.services.platform.ActiveState==='inactive'&&standby.services.platform.UnitFileState==='disabled'&&standby.observer.businessHealthy===false,'R28_LIVE_ROLE_INVALID');
 need(primary.compiledTreeSHA256===standby.compiledTreeSHA256&&primary.compiledFiles===standby.compiledFiles&&primary.packageLockSHA256===standby.packageLockSHA256,'R28_LIVE_COMPILED_TREES_DIFFER');
 need(health.every(h=>h.status==='ok'&&h.build===S.build&&h.nodeId==='112'&&h.role==='primary'),'R28_LIVE_HEALTH_INVALID');
 need(platform.profileSHA256===S.profileSHA256&&platform.supervised===false&&platform.stopped===false&&platform.requiredObjectives===74&&platform.templateCount===28&&platform.targetTemplateSHA256===expectedTemplateSHA256&&platform.otherTemplatesSHA256===j.otherCentralTemplatesSHA256,'R28_LIVE_PLATFORM_SCOPE_CHANGED');
 need(platform.run.id===S.runId&&platform.run.taskId===S.taskId&&platform.run.executorId==='msf-101-claude'&&platform.run.workspace===j.scope.workspace&&platform.run.purpose==='project-candidate-validation'&&platform.run.budgetUSD===0,'R28_LIVE_RUN_SCOPE_CHANGED');
 need(development.agentId===j.nodeAgentId&&development.templateCount===28&&development.targetTemplateSHA256===expectedTemplateSHA256&&development.otherTemplatesSHA256===j.otherNodeTemplatesSHA256&&development.configNormalizedUnchanged===true&&development.bundleMatchesUpgrade===true&&development.unit.ActiveState==='active'&&development.unit.User==='superopen','R28_LIVE_DEVELOPMENT_NODE_CHANGED');
 need(host.nodeTemplates.targetSHA256===expectedTemplateSHA256&&host.nodeTemplates.otherTemplatesSHA256===j.otherNodeTemplatesSHA256,'R28_LIVE_HOST_TEMPLATE_CHANGED');
 if(j.restored===true)need(host.quiet?.children?.length===0&&Object.values(host.quiet?.counts??{unknown:1}).every(n=>n===0),'R28_LIVE_RESTORED_NODE_NOT_IDLE');
 return true;
}
export const livePlatformReadProgram=String.raw`
import os,stat,hashlib,json,subprocess,ssl,urllib.request,signal
from pathlib import Path
def need(v,c):
 if not v:raise RuntimeError(c)
signal.signal(signal.SIGALRM,lambda a,b:(_ for _ in ()).throw(RuntimeError('R28_LIVE_TIMEOUT')));signal.alarm(50)
def ident(s):return (s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def safe_read(q,limit=16777216,private=False,compiled=False):
 q=Path(q)
 for parent in q.parents:
  s=parent.lstat();inside=compiled and (parent==base or base in parent.parents);need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and (inside or not s.st_mode&0o022),'R28_LIVE_PARENT_UNTRUSTED')
 fd=os.open(q,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  a=os.fstat(fd);need(stat.S_ISREG(a.st_mode) and a.st_nlink==1 and a.st_uid==0 and (compiled or not a.st_mode&0o022) and a.st_size<=limit and (not private or not a.st_mode&0o007),'R28_LIVE_FILE_UNTRUSTED');data=bytearray()
  while len(data)<=limit:
   part=os.read(fd,min(65536,limit+1-len(data)))
   if not part:break
   data.extend(part)
  need(ident(a)==ident(os.fstat(fd))==ident(q.lstat()) and len(data)==a.st_size,'R28_LIVE_FILE_CHANGED');return bytes(data)
 finally:os.close(fd)
def digest(b):return hashlib.sha256(b).hexdigest()
current=Path('/opt/jarvis/current');need(current.is_symlink(),'R28_LIVE_CURRENT_LINK_INVALID');base=current.resolve(strict=True);need(str(base)=='/opt/jarvis/releases/'+p['build'],'R28_LIVE_RELEASE_CHANGED')
cfgraw=safe_read('/etc/jarvis/node.json',2097152,True);cfg=json.loads(cfgraw);need(cfg.get('nodeId')==p['nodeId'] and cfg.get('release')==p['build'],'R28_LIVE_NODE_IDENTITY_CHANGED')
files=[];metadata=[];writable=[]
def walk(q):
 s=q.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not stat.S_ISLNK(s.st_mode),'R28_LIVE_DIRECTORY_UNTRUSTED');metadata.append([str(q.relative_to(base)),list(ident(s))])
 if s.st_mode&0o022:writable.append(str(q.relative_to(base)))
 for child in sorted(q.iterdir()):
  s=child.lstat();need(not stat.S_ISLNK(s.st_mode),'R28_LIVE_LINKED_COMPILED_FILE')
  if stat.S_ISDIR(s.st_mode):walk(child)
  else:
   files.append([str(child.relative_to(base)),digest(safe_read(child,compiled=True))]);metadata.append([str(child.relative_to(base)),list(ident(s))])
   if s.st_mode&0o022:writable.append(str(child.relative_to(base)))
for rel in ['apps/api/dist','apps/web/dist']:walk(base/rel)
first=(files.copy(),metadata.copy(),writable.copy());files=[];metadata=[];writable=[]
for rel in ['apps/api/dist','apps/web/dist']:walk(base/rel)
need(first==(files,metadata,writable),'R28_LIVE_COMPILED_TREE_CHANGED_DURING_READ')
release_permissions=[]
for rel in ['.','apps','apps/api','apps/web']:
 q=base/rel;s=q.lstat();need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode) and s.st_uid==0,'R28_LIVE_RELEASE_PARENT_INVALID');release_permissions.append({'path':rel,'mode':oct(stat.S_IMODE(s.st_mode)),'writableByGroupOrOther':bool(s.st_mode&0o022)})
manifest=json.dumps(files,separators=(',',':')).encode()
services={}
for key,name in [('platform','jarvis-platform.service'),('observer','jarvis-observer.service')]:
 r=subprocess.run(['/usr/bin/systemctl','show',name,'--property=ActiveState,SubState,User,UnitFileState,MainPID'],capture_output=True,text=True,check=True,timeout=10);services[key]=dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x)
context=ssl.create_default_context(cafile='/etc/jarvis/tls/ca.crt');req=urllib.request.Request('https://127.0.0.1:3141/status',headers={'x-jarvis-node-token':cfg['observerToken']})
with urllib.request.urlopen(req,context=context,timeout=6) as response:
 raw=response.read(2097153);need(len(raw)<=2097152,'R28_LIVE_OBSERVER_RESPONSE_TOO_LARGE');o=json.loads(raw)
need(safe_read('/etc/jarvis/node.json',2097152,True)==cfgraw and current.resolve(strict=True)==base,'R28_LIVE_CONFIGURATION_CHANGED')
print(json.dumps({'nodeId':cfg['nodeId'],'role':cfg['role'],'release':cfg['release'],'currentRelease':base.name,'codeSHA256':safe_read(base/'.managed-release.sha256',1024,compiled=True).decode().strip(),'compiledTreeSHA256':digest(manifest),'compiledFiles':len(files),'compiledMetadataSHA256':digest(json.dumps(metadata,separators=(',',':')).encode()),'compiledWritablePaths':len(writable),'releaseParentPermissions':release_permissions,'rootTrustPermissionsVerified':len(writable)==0 and not any(v['writableByGroupOrOther'] for v in release_permissions),'packageLockSHA256':digest(safe_read(base/'package-lock.json',compiled=True)),'services':services,'observer':{k:o.get(k) for k in ['nodeId','role','build','businessHealthy','businessBuild']},'privateConfigurationSHA256':digest(cfgraw),'credentialsExported':False}))
`;
export const liveDevelopmentReadProgram=String.raw`
import os,stat,hashlib,json,subprocess,signal
from pathlib import Path
def need(v,c):
 if not v:raise RuntimeError(c)
signal.signal(signal.SIGALRM,lambda a,b:(_ for _ in ()).throw(RuntimeError('R28_LIVE_TIMEOUT')));signal.alarm(25)
def key(s):return (s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def read(q,private=False):
 q=Path(q)
 for parent in q.parents:
  s=parent.lstat();need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'R28_LIVE_NODE_PARENT_UNTRUSTED')
 fd=os.open(q,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  a=os.fstat(fd);need(stat.S_ISREG(a.st_mode) and a.st_nlink==1 and a.st_uid in ([0,1000] if private else [0]) and not a.st_mode&(0o077 if private else 0o022) and 0<a.st_size<=2097152,'R28_LIVE_NODE_FILE_UNTRUSTED');data=bytearray()
  while len(data)<=2097152:
   b=os.read(fd,min(65536,2097153-len(data)))
   if not b:break
   data.extend(b)
  need(key(a)==key(os.fstat(fd))==key(q.lstat()) and len(data)==a.st_size,'R28_LIVE_NODE_FILE_CHANGED');return bytes(data)
 finally:os.close(fd)
def digest(v):return hashlib.sha256(v).hexdigest()
def hashv(v):return digest(json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())
raw=read('/var/lib/jarvis-development/101/config.json',True);cfg=json.loads(raw);ts=cfg.get('templates',[]);target=[t for t in ts if t.get('id')=='msf-101-claude'];need(len(target)==1,'R28_LIVE_TARGET_COUNT_INVALID');original=target[0]
cfg['templates']=[p['originalTemplate'] if t.get('id')=='msf-101-claude' else t for t in ts]
normalized=digest(json.dumps(cfg,sort_keys=True,separators=(',',':')).encode())
files={n:digest(read(Path('/opt/jarvis-development/software-factory')/n)) for n in p['bundleSHA256']}
r=subprocess.run(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,SubState,MainPID,User'],capture_output=True,text=True,check=True,timeout=10);unit=dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x)
need(read('/var/lib/jarvis-development/101/config.json',True)==raw,'R28_LIVE_NODE_CONFIGURATION_CHANGED')
print(json.dumps({'agentId':cfg.get('agentId'),'machineId':cfg.get('machineId'),'templateCount':len(ts),'targetTemplateSHA256':hashv(original),'otherTemplatesSHA256':hashv(sorted([t for t in ts if t.get('id')!='msf-101-claude'],key=lambda t:t['id'])),'configSHA256':digest(raw),'configNormalizedSHA256':normalized,'configNormalizedUnchanged':normalized==p['configSemanticSHA256'],'bundleSHA256':files,'bundleMatchesUpgrade':files==p['bundleSHA256'],'unit':unit,'credentialsExported':False}))
`;
async function health(url,ca){return new Promise((ok,fail)=>{const req=request(url,{ca,rejectUnauthorized:true,timeout:10000},r=>{const parts=[];let bytes=0;r.on('data',b=>{bytes+=b.length;if(bytes>1048576)req.destroy(Error('R28_LIVE_HEALTH_TOO_LARGE'));else parts.push(b);});r.on('end',()=>{try{need(r.statusCode===200,'R28_LIVE_HEALTH_HTTP_INVALID');ok(healthProjection(JSON.parse(Buffer.concat(parts).toString('utf8'))));}catch(e){fail(e);}});});req.once('error',fail);req.once('timeout',()=>req.destroy(Error('R28_LIVE_HEALTH_TIMEOUT')));req.end();});}
export function closedLiveError(e){const v=String(e?.message??'');if(/^(?:R28_LIVE|R28_HOST|R28_EXEC|R28_INSTALL)_[A-Z0-9_]{1,120}$/.test(v))return v;const m=/(?:^|\n)(?:RuntimeError|ValueError): (R28_LIVE_[A-Z0-9_]{1,120})\s*$/.exec(v);return m?m[1]:'R28_LIVE_READ_FAILED';}
const closedError=closedLiveError;
export async function observePlatformLiveR28(){
 const journalRaw=await safeReadLocal(S.journalPath,'utf8'),j=assertR28ExecutionJournal(JSON.parse(journalRaw));need(j.taskId===S.taskId&&j.runId===S.runId&&j.started===true,'R28_LIVE_EXACT_STARTED_JOURNAL_REQUIRED');
 const installRaw=await safeReadLocal(S.installationPath,'utf8');need(sha(installRaw)===S.installationSHA256,'R28_LIVE_INSTALLATION_CHANGED');const manifest=JSON.parse(installRaw),upgrade=JSON.parse(await safeReadLocal(S.upgradePath,'utf8'));need(upgrade.result?.deployed===true&&upgrade.result.configUnchanged===true,'R28_LIVE_UPGRADE_RECEIPT_REQUIRED');
 const ca=await readFile('artifacts/linux-deployment/jarvis-lan-ca.crt');
 return withPlatform(async({api})=>{
  const readers=[()=>health('https://cc-jarvis.ikvein.com/api/health'),()=>health('https://192.168.10.112:3140/api/health',ca),()=>JSON.parse(remote(lanProfile,'jarvis-112',python({build:S.build,nodeId:'112'},livePlatformReadProgram),true,{timeoutMs:60000})),()=>JSON.parse(remote(lanProfile,'jarvis-101',python({build:S.build,nodeId:'101'},livePlatformReadProgram),true,{timeoutMs:60000})),()=>api('/api/v1/projects/'+S.projectId+'/autonomy'),()=>api('/api/v1/execution/supervision'),()=>api('/api/v1/execution/config'),()=>api('/api/v1/execution/runs/'+S.runId),()=>JSON.parse(remote(lanProfile,'jarvis-101',python({originalTemplate:j.originalTemplate,configSemanticSHA256:upgrade.result.configSemanticSHA256,bundleSHA256:upgrade.result.bundleSHA256},liveDevelopmentReadProgram),true,{timeoutMs:45000})),()=>verifyR28InstalledManifest(manifest),()=>readInstalledR28Host(manifest,{idle:j.restored===true,runId:S.runId})];
  const names=['publicHealth','lanHealth','primary','standby','profile','global','templates','run','developmentNode','installationBinding','rootToolsAndSource'],rows=await settledReaders(readers),errors=rows.flatMap((r,i)=>r.status==='rejected'?[{check:names[i],errorCode:closedError(r.reason)}]:[]);const val=i=>rows[i].status==='fulfilled'?rows[i].value:null;
  const profile=val(4)?.data,g=val(5)?.data,c=val(6)?.data,r=val(7)?.data;let platform=null;
  if(profile&&g&&c&&r){const required=new Set((profile.spec?.objectives??[]).filter(o=>o.required!==false).map(o=>o.id)),target=c.templates?.filter(t=>t.id==='msf-101-claude');platform={profileSHA256:sha(profile),supervised:g.supervised,stopped:g.stopped,requiredObjectives:required.size,verifiedObjectives:new Set((profile.verifiedObjectiveIds??[]).filter(id=>required.has(id))).size,templateCount:c.templates?.length,targetTemplateSHA256:target?.length===1?sha(target[0]):null,otherTemplatesSHA256:sha(c.templates?.filter(t=>t.id!=='msf-101-claude').sort((a,b)=>a.id.localeCompare(b.id))),run:Object.fromEntries(['id','taskId','status','executorId','workspace','purpose','budgetUSD','agentId'].map(k=>[k,r[k]])),runOutcome:r.result?.outcome??null};}
  const host=val(10),source=host?{main:host.source,oldR26Candidate:host.oldCandidate,candidate:host.candidate,originSHA256:host.originSHA256,installed:host.installed,oldImmutableSHA256:sha(host.oldImmutable),originalFixedToolHashes:host.fixedTools,nodeTemplates:host.nodeTemplates,quiet:host.quiet}:null;
  if(!errors.length)try{assertLiveR28([val(2),val(3)],[val(0),val(1)],platform,j,val(8),host);}catch(e){errors.push({check:'liveAssertions',errorCode:closedError(e)});}
  let journalStable=false;try{journalStable=sha(await safeReadLocal(S.journalPath,'utf8'))===sha(journalRaw);}catch(e){errors.push({check:'journalReadback',errorCode:closedError(e)});}if(!journalStable)errors.push({check:'journalReadback',errorCode:'R28_LIVE_JOURNAL_CHANGED_DURING_OBSERVATION'});
  return {schemaVersion:1,kind:'jarvis-r28-live-deployment-independent-observation',at:new Date().toISOString(),build:S.build,taskId:S.taskId,runId:S.runId,passed:errors.length===0,errors,publicHealth:val(0),lanHealth:val(1),nodes:[val(2),val(3)],platform,developmentNode:val(8),rootToolsAndSource:source,installationBindingVerified:val(9)===true,journalStable,executorRestored:j.restored===true,expectedTemplateSHA256:j.restored===true?j.originalTemplateSHA256:j.fixedTemplateSHA256,activityExpected:j.restored!==true,idleRequired:j.restored===true,rootTrustPermissionsVerified:[val(2),val(3)].every(n=>n?.rootTrustPermissionsVerified===true),permissionFinding:[val(2),val(3)].some(n=>n?.rootTrustPermissionsVerified===false)?'CURRENT_RELEASE_GROUP_OR_OTHER_WRITABLE':null,productAccepted:false,objectivesAccepted:false,platformMaintenanceSessionOnly:true,remoteMutationsPerformed:false,modelsInvoked:false,rawLogsExported:false,privateConfigurationExported:false,compiledRegressionTestsRerun:false};
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){let result;try{result=await observePlatformLiveR28();}catch(e){result={schemaVersion:1,kind:'jarvis-r28-live-deployment-independent-observation',at:new Date().toISOString(),passed:false,errorCode:closedError(e),remoteMutationsPerformed:false,modelsInvoked:false,rawLogsExported:false};}const out='artifacts/software-factory/acceptance-r28/platform-live-independent-'+Date.now()+'-'+randomUUID()+'.json';await mkdir('artifacts/software-factory/acceptance-r28',{recursive:true});const raw=JSON.stringify(result,null,2)+'\n',f=await open(out,'wx',0o644);try{await f.writeFile(raw);await f.sync();}finally{await f.close();}console.log(JSON.stringify({output:out,sha256:sha(raw),passed:result.passed,errorCode:result.errorCode??null,errors:result.errors??[],taskId:result.taskId??null,runId:result.runId??null}));if(!result.passed)process.exitCode=1;}
