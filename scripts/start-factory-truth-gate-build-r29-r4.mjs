/** New R4 once-only build; bootstrap runs under its already active systemd owner. */
import {open,mkdir,lstat,unlink,rename} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {sha,canonical} from './run-factory-main-repair-r26.mjs';
import {safeReadLocal,settleEvidenceReads} from './factory-repair-evidence-read-r26.mjs';
import {verifyFactoryProtectionContractR29R2,protectionContractR29R2 as P} from './verify-factory-protection-contract-r29-r2.mjs';
import {assertTargetCleanupR29NativeHost} from './verify-factory-target-cleanup-r29.mjs';
import {assertBuildOnlyR29Scope} from './read-factory-truth-gate-build-scope-r29.mjs';

const need=(value,code)=>{if(!value)throw Error(code)},same=(a,b)=>canonical(a)===canonical(b),H=/^[a-f0-9]{64}$/;
const stages=['mount-proof','offline-install','build','typecheck','truth-unit'];
const fixedTools={
 'project-autonomy-fa01-coordinator.py':'f60c3e88056515e41bd0486285809b2342d783f21e225f9ffc64c3d96477740b',
 'project-autonomy-fa01-collector.mjs':'a6cc30f63134fdc6d5be4aaba6049b99c0920c0db3e89b612d607b7991e647b7',
 'project-autonomy-evidence.py':'57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2',
 'project-autonomy-fa01-browser.mjs':'4836a22a44155ad0a1bc2beedf18e2efb0c52aa57baa1c3c1cb735e47fbbada0',
 'factory-sandbox-broker-control.py':'43afea4244f741bbaa3b4d347304c51e6886b8533aceb04967a439de0a4d3dbd',
 'factory-sandbox-broker.py':'d4bcec4e88990e45c82d76574fe7c8de8eebd1db239cedceefd95a6b204d1954',
};
const installedSevenTools={wrapperSHA256:'59b1cfcdca6b70903f0d0718e91c49727d93874845b3110ec30b8d09f4ba4547',collectorSHA256:'537bbf4f0a542ba8f6c6d71d84f26fa47101d9ab5b0c078cc2d870a9d690b0a2',baselineSHA256:'59ac16000136d928bb94db725edb85568f55102c6aa807aaaef154269542d3af',policySHA256:'2c80ac09eff1f80210f87d1d3b9cef27a2feb164380f8b0bcb33efd9f9a37103',sudoRuleSHA256:'714f4238d13c9f984914646e8c2dd9d49f24e90f2f8a3c4256125ef2b0e64abc',brokerSHA256:'5440387d04ed57404b47c77aabcfea57502fb7d4e90ee74c87d8e6c1e8518f8b',brokerControlSHA256:'cf9a0e5a7885eabe39ddebacda0b1423d007a0229f06551b21dd8615264ce4af'};
export const buildStartR29R4Scope=Object.freeze({
 source:'/home/superopen/All-Projects/msf-targets-r29/source',
 fingerprint:'4907e45a21799f2dd14ac2373769607f40d6b9e0319bb614fbe259b157e60493',
 sourceFiles:621,sourceBytes:18386584,metadataSHA:'2da9d3e490fd6d042113c067807a89b000a4f40fdb5fa8d3ca2911b6615ebce8',
 root:'/var/lib/jarvis-development/101/truth-gate-r29-build',
 tool:'/opt/jarvis-development/software-factory/factory-truth-gate-build-r29-r4-4ad07994beeb274e.py',
 toolSHA:'4ad07994beeb274e9f6b883ad02af89a1b562a1f0f094a55fbe9ebc0de81cf70',
 contractId:P.contractId,
 review:'artifacts/software-factory/goals-r29/r4-bootstrap-owner-independent-local-review-1791829184073-8b6a2050-208b-4be9-98b3-30707911fee2.json',reviewSHA:'f0ae10d21146146bb480e9fb302d2601a016a0cb0a299fe92e6ff8ccf723ecd1',ownerLifecycleReview:'artifacts/software-factory/goals-r29/r4-bootstrap-owner-independent-local-review-1791829184073-8b6a2050-208b-4be9-98b3-30707911fee2.json',ownerLifecycleReviewSHA:'f0ae10d21146146bb480e9fb302d2601a016a0cb0a299fe92e6ff8ccf723ecd1',
 historicalOwnerProof:'artifacts/software-factory/goals-r29/build-owner-lifetime-proof-1791823732398-c590b8b8-8d59-4b56-b168-74a9d242fc3b.json',
 historicalOwnerProofSHA:'a3861d19663cc3e2f4e0c7ffb31de48ee2443776ae5fcba3e79c8b85497180e9',
 originalProtectionProof:'artifacts/software-factory/goals-r29/new-protection-contract-1791828226746-050a98d2-9605-46c2-8d28-57a450f38a5d.json',
 originalProtectionProofSHA:'6a326e13362346f19aa04b8696fb9ad9eb63f27f5ef7a2a85832dad02ef848f9',
 protectionReaderSHA:'de1c75c0becd8f2375dd2b0b1005d86f8c4052736d90725743dde3cc94a4de76',
 predecessorAttempt:'87f3586d3391977c77b225d9134b6945',
});
const S=buildStartR29R4Scope;
export const buildStartR29R4JournalPath='.jarvis-dev/maintenance/factory-r29-isolated-build-r4-attempt.json';
const jp=buildStartR29R4JournalPath;

export function buildStartR29R4Names(attempt){
 need(/^[a-f0-9]{32}$/.test(attempt),'R29_BUILD_START_ATTEMPT_INVALID');
 return stages.map(stage=>'jarvis-tg-r29-'+attempt+'-'+stage);
}

export function assertR29R4ProtectionProof(value,{fresh=false,now=Date.now()}={}){
 need(value?.schemaVersion===1&&value.kind==='software-factory-r29-new-protection-contract-observation'&&value.ready===true&&value.newContract===true&&value.contractId===P.contractId&&value.contractRevision===1&&value.contractVersion===P.contractVersion,'R29_BUILD_START_NEW_CONTRACT_UNPROVEN');
 need(value.oldProofsUntouched===true&&value.originalMainMetadataDriftRecorded===true&&value.originalMainMetadataUnchanged===false&&value.originalContractProtectionVerified===false&&value.originalMetadataDriftAttribution==='unknown'&&value.priorOriginalInventorySHA256===P.oldStockSHA256&&value.newProtectedInventorySHA256===P.newStockSHA256,'R29_BUILD_START_ORIGINAL_DRIFT_BOUNDARY_CHANGED');
 need(value.newContractInventoryVerified===true&&value.protectedInventoryFullyVerified===true&&value.oldBuildAttempt===S.predecessorAttempt&&value.oldBuildCleanupScopeVerified===true&&value.nativeSourceProcessAndSocketCleanupVerified===true&&value.queueIdle===true&&value.fullQueueSQLVerified===true&&value.nodeACKIdle===true&&value.globalSupervisorEnabled===false&&value.profileUnchanged===true&&value.profileSHA256===P.profileSHA256&&value.baseTemplateSHA256===P.baseTemplateSHA256&&value.otherCentralTemplatesSHA256===P.otherCentralTemplatesSHA256&&value.otherNodeTemplatesSHA256===P.otherNodeTemplatesSHA256,'R29_BUILD_START_NEW_INVENTORY_OR_QUEUE_UNPROVEN');
 need(value.sourceTaskId===P.sourceTaskId&&value.sourceRunId===P.sourceRunId&&value.terminal?.status==='round-limit'&&value.terminal.signed===true&&value.terminal.nonlate===true&&value.terminal.resultSHA256===P.terminalResultSHA256&&value.terminal.storedRecordSHA256===P.storedRecordSHA256&&value.terminal.ingestedSignedAgentReceipt===true&&value.terminal.readerCryptographicallyReverified===false&&H.test(value.terminal.runRecordSHA256??'')&&H.test(value.terminal.taskRecordSHA256??''),'R29_BUILD_START_SOURCE_TERMINAL_CHANGED');
 need(value.modelsInvoked===false&&value.productCodeExecuted===false&&value.productAccepted===false&&value.full74ObjectivesAccepted===false&&value.actualNewBuild===false&&value.remoteMutationsPerformed===false&&value.signalsSent===false&&value.resourcesRemoved===false&&value.rawLogsExported===false&&value.privateEnvironmentExported===false&&value.privateJournalExported===false,'R29_BUILD_START_PROTECTION_BOUNDARY_CHANGED');
 need(same(value.sources?.main,{sha256:'151300cf55e8e46445e5e3b85293c047f981b14f620350a217a61d9a987056ea',files:593,bytes:17914164,metadataSHA:P.mainMetadataSHA256,stable:true,identity:{device:66306,inode:14417953}})&&same(value.sources?.r26,{sha256:'66a56a19ce783c020ed211d7c6a2b620f1767783cd9c58525df3ca33dc0ce246',files:605,bytes:18078081,metadataSHA:'627d3db589bc56dbbdd1fc2510cc738f78297551d8ecc12648a80fd081bdc1d0',stable:true,identity:{device:66306,inode:6713082}})&&same(value.sources?.r27,{sha256:'9b07a5115c22d14f82e04ba45b66efbc5ac04f7faa696ab84d81e33696ec7b76',files:608,bytes:18127511,metadataSHA:'c62497e11de2bb1eeb4873b7d4d70cd8cc05974cafe4c5408d5bfbd041de43ac',stable:true,identity:{device:66306,inode:6713710}})&&same(value.sources?.r29,{sha256:S.fingerprint,files:S.sourceFiles,bytes:S.sourceBytes,metadataSHA:S.metadataSHA,stable:true,identity:{device:66306,inode:6718050}}),'R29_BUILD_START_PROTECTED_SOURCE_CHANGED');
 const native=value.observations?.nativeSource,old=value.observations?.oldBuild;
 need(assertTargetCleanupR29NativeHost(native,{copyJob:'31fe2645b7f847e6c0a7d0eb8fe02ee1',runId:P.sourceRunId,taskId:P.sourceTaskId,sourceBefore:value.sources.r27})===true&&same(native.candidate,value.sources.r29)&&assertBuildOnlyR29Scope(old).buildResourcesIndependentlyClean===true,'R29_BUILD_START_ACTUAL_CENSUS_UNPROVEN');
 need(same(old.source,native.candidate)&&same(old.nodeACK,native.nodeACK)&&same(value.node,native.node)&&H.test(value.nodeConfigSHA256??'')&&value.oldImmutableInventorySHA256==='0388cb0ec341e58f1353b4c82e8202cfd072d9212318eee8228bc7b2b3bdbb09'&&same(value.fixedTools,fixedTools)&&same(value.installedSevenTools,installedSevenTools),'R29_BUILD_START_TOOL_OR_NODE_SCOPE_CHANGED');
 const at=Date.parse(value.at);need(Number.isFinite(at),'R29_BUILD_START_PROTECTION_TIME_INVALID');
 if(fresh)need(now-at>=-30000&&now-at<300000,'R29_BUILD_START_FRESH_PROTECTION_STALE');
 return value;
}

export function assertR29R4Review(value){
 need(value?.kind==='r29-r4-bootstrap-and-owner-independent-local-review'&&value.workerSHA256===S.toolSHA&&value.remainingP0P1===0&&value.staticPreparationReady===true&&value.fiveNamesReviewed===true&&value.ownerBeforeEveryCreate===true&&value.durableCreationIntentBeforeCreate===true&&value.hardFailureBlocksCandidateStages===true&&value.stopPostMaximumBudgetSec===240&&value.ownerStopTimeoutSec===300&&value.ownerContractUnchangedFromOriginal===true&&value.actualR4FiveNameLifecycleVerified===false&&value.actualR4NormalBindVerified===false&&value.productAccepted===false,'R29_BUILD_START_R4_REVIEW_UNPROVEN');
 return value;
}

export function assertR29R4HistoricalOwner(value){
 need(value?.schemaVersion===1&&value.kind==='software-factory-r29-nonproduct-systemd-owner-lifetime-proof'&&value.toolSHA256==='0b94c6191e3e2e53e6d47ee6631a721d2291fd98e923ab440e1a8960b35f4a6b'&&value.status==='pass'&&value.scopeUnknown===false&&value.fixtureOnly===true&&value.productCodeExecuted===false&&value.modelsInvoked===false&&value.ownerTimeoutObserved===true&&value.ownerProcessGone===true&&value.ownerChildGone===true&&value.ownContainerGone===true&&value.exactFourNamesAbsent===true&&value.attemptLabelScopeEmpty===true&&value.foreignWasPreserved===true&&value.actualProductionStopPostFunctionUsed===true&&value.actualOwnerProperties?.KillMode==='control-group'&&value.actualOwnerProperties.TimeoutStopUSec==='5min'&&value.actualOwnerProperties.exactExecStopPostVerified===true,'R29_BUILD_START_HISTORICAL_OWNER_UNPROVEN');
 return value;
}

async function saveJournal(q){
 const tmp=jp+'.'+randomUUID()+'.tmp',f=await open(tmp,'wx',0o600);
 try{await f.writeFile(JSON.stringify(q,null,2)+'\n');await f.sync()}finally{await f.close()}
 if(process.platform==='win32'){
  const result=spawnSync('python',['-c',"import ctypes,sys;f=ctypes.WinDLL('kernel32',use_last_error=True).MoveFileExW;f.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p,ctypes.c_ulong];f.restype=ctypes.c_int;sys.exit(0 if f(sys.argv[1],sys.argv[2],9) else 1)",resolve(tmp),resolve(jp)],{encoding:'utf8',windowsHide:true,timeout:10000});
  need(result.status===0,'R29_BUILD_START_DURABLE_SAVE_FAILED');
 }else{await rename(tmp,jp);const dir=await open('.jarvis-dev/maintenance','r');try{await dir.sync()}finally{await dir.close()}}
}
async function acquireLock(){const path=jp+'.lock',fd=await open(path,'wx',0o600);try{await fd.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()})+'\n');await fd.sync();return {fd,path};}catch(e){await fd.close();throw e;}}
async function releaseLock(lock){try{const held=await lock.fd.stat(),current=await lstat(lock.path);need(current.isFile()&&!current.isSymbolicLink()&&held.dev===current.dev&&held.ino===current.ino,'R29_BUILD_START_LOCK_IDENTITY_CHANGED');await unlink(lock.path);}finally{await lock.fd.close();}}
async function writePublicReceipt(kind,value){
 await mkdir('artifacts/software-factory/goals-r29',{recursive:true});
 const path='artifacts/software-factory/goals-r29/'+kind+'-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(value,null,2)+'\n',fd=await open(path,'wx',0o644);
 try{await fd.writeFile(raw);await fd.sync()}finally{await fd.close()}
 return {path,sha256:sha(raw)};
}
export function buildStartR29R4HostProgram(){return String.raw`
import os,json,stat,hashlib,base64,subprocess,time,re,uuid,datetime
from pathlib import Path
def need(v,c):
 if not v:raise RuntimeError(c)
expected_scope=json.loads('${JSON.stringify(S)}')
need(all(isinstance(expected_scope[k],str) and re.fullmatch('[a-f0-9]{64}',expected_scope[k]) for k in ['reviewSHA','ownerLifecycleReviewSHA']),'R29_BUILD_START_PREPARATION_NOT_FROZEN')
need(os.geteuid()==0 and isinstance(p,dict) and set(p)==set(expected_scope)|{'action','attempt','toolBase64','freshProtectionSHA256','freshProtectionObservedAt'} and all(p.get(k)==v for k,v in expected_scope.items()) and p['action'] in ['start','check'] and isinstance(p['attempt'],str) and re.fullmatch('[a-f0-9]{32}',p['attempt']),'R29_BUILD_START_FIXED_SCOPE_INVALID')
if p['action']=='start':
 need(isinstance(p['freshProtectionSHA256'],str) and re.fullmatch('[a-f0-9]{64}',p['freshProtectionSHA256']) and isinstance(p['freshProtectionObservedAt'],str),'R29_BUILD_START_FRESH_PROTECTION_INVALID')
 try:protection_at=datetime.datetime.fromisoformat(p['freshProtectionObservedAt'].replace('Z','+00:00')).timestamp()
 except (ValueError,TypeError):raise RuntimeError('R29_BUILD_START_FRESH_PROTECTION_INVALID')
 need(-30<=time.time()-protection_at<300,'R29_BUILD_START_FRESH_PROTECTION_STALE')
else:need(p['freshProtectionSHA256'] is None and p['freshProtectionObservedAt'] is None,'R29_BUILD_START_CHECK_PROTECTION_INPUT_INVALID')
def trusted(path):
 for x in [path,*path.parents]:
  s=x.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'R29_BUILD_START_ROOT_CHAIN_INVALID')
def read(path,limit=2000000):
 trusted(path);f=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(f);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<=limit,'R29_BUILD_START_FILE_INVALID');raw=b''
  while len(raw)<=limit:
   chunk=os.read(f,min(65536,limit+1-len(raw)))
   if not chunk:break
   raw+=chunk
  a=os.fstat(f);need(len(raw)==s.st_size and (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)==(a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns),'R29_BUILD_START_FILE_CHANGED');return raw
 finally:os.close(f)
def store(path,value):
 raw=(json.dumps(value,separators=(',',':'))+'\n').encode();tmp=path.parent/(path.name+'.'+uuid.uuid4().hex+'.tmp');f=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 try:
  view=memoryview(raw)
  while view:
   n=os.write(f,view);need(n>0,'R29_BUILD_START_SHORT_WRITE');view=view[n:]
  os.fsync(f)
 finally:os.close(f)
 os.replace(tmp,path);d=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(d)
 finally:os.close(d)
root=Path(p['root']);launches=root/'launches';tool=Path(p['tool']);launch=launches/(p['attempt']+'.json');state_path=root/p['attempt']/'state.json';ownership_dir=root/'ownership';ownership_path=ownership_dir/(p['attempt']+'.json')
if p['action']=='start':
 body=base64.b64decode(p['toolBase64'],validate=True);need(len(body)<=100000 and hashlib.sha256(body).hexdigest()==p['toolSHA'],'R29_BUILD_START_TOOL_BYTES_INVALID');trusted(tool.parent)
 if os.path.lexists(tool):need(read(tool)==body,'R29_BUILD_START_TOOL_CONFLICT')
 else:
  f=os.open(tool,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o755)
  try:
   view=memoryview(body)
   while view:
    n=os.write(f,view);need(n>0,'R29_BUILD_START_SHORT_WRITE');view=view[n:]
   os.fchmod(f,0o755);os.fsync(f)
  finally:os.close(f)
  d=os.open(tool.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:os.fsync(d)
  finally:os.close(d)
 trusted(root.parent)
 if not os.path.lexists(root):root.mkdir(mode=0o700)
 trusted(root);need(stat.S_ISDIR(root.lstat().st_mode) and root.lstat().st_mode&0o077==0,'R29_BUILD_START_ROOT_MODE')
 if not os.path.lexists(launches):launches.mkdir(mode=0o700)
 trusted(launches);need(stat.S_ISDIR(launches.lstat().st_mode) and launches.lstat().st_mode&0o077==0,'R29_BUILD_START_LAUNCH_MODE')
 if not os.path.lexists(ownership_dir):ownership_dir.mkdir(mode=0o700)
 trusted(ownership_dir);need(stat.S_ISDIR(ownership_dir.lstat().st_mode) and ownership_dir.lstat().st_mode&0o077==0,'R29_BUILD_START_OWNERSHIP_MODE')
 need(not os.path.lexists(launch) and not os.path.lexists(root/p['attempt']) and not os.path.lexists(ownership_path),'R29_BUILD_START_EXCLUSIVE_ATTEMPT_REQUIRED')
 names=['jarvis-tg-r29-'+p['attempt']+'-'+name for name in ['mount-proof','offline-install','build','typecheck','truth-unit']];labels={'jarvis.truthgate.r29.attempt':p['attempt'],'jarvis.truthgate.r29.kind':'build'};image='sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96';docker_env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'}
 for name in names:
  result=subprocess.run(['/usr/bin/docker','container','inspect',name],capture_output=True,timeout=15,env=docker_env)
  try:empty=json.loads(result.stdout)==[]
  except (ValueError,UnicodeError):empty=False
  need(result.returncode==1 and empty and result.stderr.decode('utf-8','replace').strip() in ['Error response from daemon: No such container: '+name,'Error: No such container: '+name,'Error: No such object: '+name],'R29_BUILD_START_RESOURCES_NOT_CONFIRMED_EMPTY')
 for filters in [['label=jarvis.truthgate.r29.attempt='+p['attempt']],['label=jarvis.truthgate.r29.attempt='+p['attempt'],'label=jarvis.truthgate.r29.kind=build']]:
  for command in [['ps','-aq'],['network','ls','-q'],['volume','ls','-q']]:
   query=['/usr/bin/docker',*command]
   for flag in filters:query+=['--filter',flag]
   result=subprocess.run(query,capture_output=True,timeout=15,env=docker_env);need(result.returncode==0 and not result.stdout.strip(),'R29_BUILD_START_LABEL_NOT_EMPTY')
 store(ownership_path,{'schemaVersion':1,'attempt':p['attempt'],'toolSHA256':p['toolSHA'],'sourceFingerprint':p['fingerprint'],'containers':names,'labels':labels,'imageID':image,'emptyResourceScopeVerified':True,'newProtectionContractId':p['contractId'],'freshProtectionSHA256':p['freshProtectionSHA256'],'freshProtectionObservedAt':p['freshProtectionObservedAt'],'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
 value={'schemaVersion':1,'kind':'r29-build-once-launch','attempt':p['attempt'],'toolSHA256':p['toolSHA'],'sourceFingerprint':p['fingerprint'],'phase':'fork-intent','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())};store(launch,value)
 out=os.open(launches/(p['attempt']+'.out'),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);err=os.open(launches/(p['attempt']+'.err'),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 os.close(out);os.close(err);unit='jarvis-tg-r29-'+p['attempt']+'-owner.service'
 need(-30<=time.time()-protection_at<300,'R29_BUILD_START_FRESH_PROTECTION_STALE')
 request=['/usr/bin/systemd-run','--unit='+unit,'--collect','--no-block','--property=User=root','--property=Type=simple','--property=KillMode=control-group','--property=RuntimeMaxSec=1800','--property=TimeoutStopSec=300','--property=Restart=no','--property=WorkingDirectory=/','--property=Environment=JARVIS_R29_BUILD_OWNER_UNIT='+unit,'--property=StandardOutput=append:'+str(launches/(p['attempt']+'.out')),'--property=StandardError=append:'+str(launches/(p['attempt']+'.err')),'--property=ExecStopPost=/usr/bin/python3 '+str(tool)+' --reconcile-cleanup '+p['attempt'],'/usr/bin/python3',str(tool),'--run',p['attempt']]
 dispatched=subprocess.run(request,capture_output=True,timeout=20,env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8'});need(dispatched.returncode==0,'R29_BUILD_START_OWNER_DISPATCH_FAILED')
 shown=subprocess.run(['/usr/bin/systemctl','show',unit,'--property=MainPID'],capture_output=True,text=True,timeout=10);main=dict(x.split('=',1) for x in shown.stdout.splitlines() if '=' in x);pid=int(main.get('MainPID','0'));value['ownerUnit']=unit;value['runtimeMaxSec']=1800;value['stopTimeoutSec']=300;value['fixedExecStopPostConfigured']=True
 try:
  need(pid>1,'R29_BUILD_START_OWNER_NOT_RUNNING');fields=Path('/proc',str(pid),'stat').read_text();parts=fields[fields.rfind(')')+2:].split();value['processIdentity']={'pid':pid,'startTicks':parts[19],'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip()}
 except (FileNotFoundError,RuntimeError):value['processIdentity']={'pid':pid if pid>1 else None,'startTicks':None,'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip()};value['identityReadComplete']=False
 value['phase']='dispatched';value['dispatchedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());store(launch,value)
else:need(p['toolBase64'] is None,'R29_BUILD_START_CHECK_INPUT_INVALID')
value=json.loads(read(launch));need(value['attempt']==p['attempt'] and value['sourceFingerprint']==p['fingerprint'] and value['toolSHA256']==p['toolSHA'],'R29_BUILD_START_LAUNCH_CHANGED');need(hashlib.sha256(read(tool)).hexdigest()==p['toolSHA'],'R29_BUILD_START_INSTALLED_TOOL_CHANGED')
state=json.loads(read(state_path)) if os.path.lexists(state_path) else None
if state is not None:
 need(state['attempt']==p['attempt'] and state['source']['sha256']==p['fingerprint'] and state['source']['files']==p['sourceFiles'] and state['source']['metadataSHA']==p['metadataSHA'],'R29_BUILD_START_STATE_SCOPE_CHANGED')
state_fields=['normalBindBootstrap','imageID','snapshotFingerprint','candidateUID','candidateNetwork','hostDockerSocketMounted','productionDatabaseUsed','modelsInvoked','status','owner','startedAt','finishedAt','source','sourceAfter','sourceUnchanged','sourceReadComplete','sourceReadErrorCode','cacheCopies','checks','resources','cleanupClaimsComplete','cleanupUnresolvedNames','labelScopeActuallyEmpty','noRecordedResultStages','noRecordedResultExecutionState','errorCode','independentDBAPIValidation','productAccepted','cleanupIndependentlyVerified']
print(json.dumps({'schemaVersion':1,'kind':'software-factory-r29-r4-once-build-observation','attempt':p['attempt'],'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'launchPhase':value['phase'],'ownerUnit':value.get('ownerUnit'),'processIdentity':value.get('processIdentity'),'state':{k:state[k] for k in state_fields if k in state} if state else None,'installedToolSHA256':p['toolSHA'],'modelsInvoked':False,'productAccepted':False,'rawLogsExported':False,'privateEnvironmentExported':False,'readOnly':p['action']=='check','automaticRedispatch':False}))
`;}

export async function startFactoryTruthGateBuildR29R4(action='inspect',dependencies={}){
 need(['inspect','start','check'].includes(action),'R29_BUILD_START_ACTION_INVALID');
 // Until explicit reviews are pinned, no journal, API, SSH or installation is touched.
 if(!S.review||!S.reviewSHA||!S.ownerLifecycleReview||!S.ownerLifecycleReviewSHA)
  return {ready:false,reason:'R29_R4_PREPARATION_NOT_FROZEN',sourceFingerprint:S.fingerprint,predecessorAttempt:S.predecessorAttempt,modelsInvoked:false,productAccepted:false,actualR4FiveNameLifecycleVerified:false,actualR4NormalBindVerified:false,automaticRedispatch:false};
 const d={now:Date.now,readLocal:safeReadLocal,saveJournal,acquireLock,releaseLock,writePublicReceipt,
  freshProtection:verifyFactoryProtectionContractR29R2,
  remoteHost:p=>JSON.parse(remote(lanProfile,'jarvis-101',python(p,buildStartR29R4HostProgram()),true)),...dependencies};
 const localPaths=['scripts/factory-truth-gate-build-r29-r4.py',S.review,S.ownerLifecycleReview,S.historicalOwnerProof,S.originalProtectionProof,'scripts/verify-factory-protection-contract-r29-r2.mjs'];
 const initial=await settleEvidenceReads(localPaths.map(path=>()=>d.readLocal(path)));
 need(sha(initial[0])===S.toolSHA&&sha(initial[1])===S.reviewSHA&&sha(initial[2])===S.ownerLifecycleReviewSHA&&sha(initial[3])===S.historicalOwnerProofSHA&&sha(initial[4])===S.originalProtectionProofSHA&&sha(initial[5])===S.protectionReaderSHA,'R29_BUILD_START_LOCAL_FROZEN_INPUT_CHANGED');
 assertR29R4Review(JSON.parse(initial[1]));assertR29R4Review(JSON.parse(initial[2]));
 assertR29R4HistoricalOwner(JSON.parse(initial[3]));assertR29R4ProtectionProof(JSON.parse(initial[4]));
 let lock;
 if(action==='start')lock=await d.acquireLock();
 try{
  let q;
  try{q=JSON.parse(await d.readLocal(jp,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!q){
   if(action!=='start')return {ready:false,reason:'FINITE_BUILD_ATTEMPT_NOT_STARTED',scope:S,modelsInvoked:false,productAccepted:false,actualR4FiveNameLifecycleVerified:false,actualR4NormalBindVerified:false};
   q={version:1,kind:'r29-r4-once-build-intent',scope:S,attempt:randomBytes(16).toString('hex'),createdAt:new Date(d.now()).toISOString(),startAttemptedAt:null,receipts:{}};
   await d.saveJournal(q);
  }
  need(q.version===1&&q.kind==='r29-r4-once-build-intent'&&same(q.scope,S)&&/^[a-f0-9]{32}$/.test(q.attempt)&&q.receipts&&typeof q.receipts==='object','R29_BUILD_START_JOURNAL_CHANGED');
  if(action==='inspect')return {ready:true,reason:q.startAttemptedAt?'FINITE_BUILD_ALREADY_ATTEMPTED_USE_CHECK':'FINITE_BUILD_PREPARED_NOT_DISPATCHED',scope:S,attempt:q.attempt,startAttemptedAt:q.startAttemptedAt,modelsInvoked:false,productAccepted:false,actualR4FiveNameLifecycleVerified:false,actualR4NormalBindVerified:false};
  let freshReference=null,freshObservedAt=null;
  if(action==='start'){
   need(!q.startAttemptedAt,'R29_BUILD_START_AMBIGUOUS_OR_DUPLICATE_USE_READ_ONLY_CHECK');
   const fresh=await d.freshProtection();
   // The complete observation is retained even when qualification rejects it.
   freshReference=await d.writePublicReceipt('r4-fresh-new-protection-contract',fresh);
   assertR29R4ProtectionProof(fresh,{fresh:true,now:d.now()});freshObservedAt=fresh.at;
   const final=await settleEvidenceReads(localPaths.map(path=>()=>d.readLocal(path)));
   need(initial.every((raw,index)=>sha(raw)===sha(final[index])),'R29_BUILD_START_LOCAL_CONTEXT_CHANGED');
   // Persisting the dispatch intent happens before SSH; uncertain replies never redispatch.
   q.receipts.freshProtection={...freshReference,at:fresh.at,newContractInventoryVerified:true,oldBuildCleanupScopeVerified:true};
   q.startAttemptedAt=new Date(d.now()).toISOString();await d.saveJournal(q);
  }else need(q.startAttemptedAt,'R29_BUILD_START_NOT_ATTEMPTED_USE_INSPECT');
  const request={...S,action:action==='start'?'start':'check',attempt:q.attempt,
   toolBase64:action==='start'?Buffer.from(initial[0]).toString('base64'):null,
   freshProtectionSHA256:action==='start'?freshReference.sha256:null,
   freshProtectionObservedAt:action==='start'?freshObservedAt:null};
  const observation=await d.remoteHost(request);
  need(observation?.schemaVersion===1&&observation.kind==='software-factory-r29-r4-once-build-observation'&&observation.attempt===q.attempt&&observation.installedToolSHA256===S.toolSHA&&observation.modelsInvoked===false&&observation.productAccepted===false&&observation.automaticRedispatch===false&&observation.rawLogsExported===false&&observation.privateEnvironmentExported===false&&observation.readOnly===(action==='check'),'R29_BUILD_START_OBSERVATION_SCOPE_CHANGED');
  const result={scope:S,...observation,historicalOwnerProofOnly:true,historicalOwnerProofCoveredFourNames:true,r4FiveNameLifecycleRequiresActualReadback:true,bootstrapExecutedOnlyIfActuallyRecorded:true,independentCleanupVerified:false};
  const receipt=await d.writePublicReceipt('isolated-build-r4-'+action,result);
  if(action==='start'){
   q.receipts.start={...receipt,at:observation.at,launchPhase:observation.launchPhase,processIdentity:observation.processIdentity};
   await d.saveJournal(q);
  }
  return {...result,output:receipt.path,sha256:receipt.sha256};
 }finally{if(lock)await d.releaseLock(lock);}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let result;
 try{need(process.argv.length<=3,'R29_BUILD_START_ARGUMENTS_INVALID');result=await startFactoryTruthGateBuildR29R4(process.argv[2]??'inspect');}
 catch(error){
  const fd=await open('.jarvis-dev/maintenance/factory-r29-r4-build-private-error-'+Date.now()+'-'+randomUUID()+'.json','wx',0o600);
  try{await fd.writeFile(JSON.stringify({message:String(error.message),stack:String(error.stack)})+'\n');await fd.sync()}finally{await fd.close()}
  result={ready:false,failed:true,errorCode:/^R29_BUILD_START_[A-Z0-9_]+$/.test(error.message)?error.message:'R29_BUILD_START_OPERATION_FAILED',modelsInvoked:false,productAccepted:false,automaticRedispatch:false,rawErrorExported:false};process.exitCode=1;
 }
 const receipt=result.output?{path:result.output,sha256:result.sha256}:await writePublicReceipt('isolated-build-r4-'+(process.argv[2]??'inspect'),result);
 console.log(JSON.stringify({output:receipt.path,sha256:receipt.sha256,attempt:result.attempt,ready:result.ready,reason:result.reason,errorCode:result.errorCode,launchPhase:result.launchPhase,modelsInvoked:false,productAccepted:false,automaticRedispatch:false}));
}
