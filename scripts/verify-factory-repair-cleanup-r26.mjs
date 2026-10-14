/** Exact-run, read-only resource/process cleanup verification. Never sends signals or removes resources. */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {sha} from './run-factory-main-repair-r26.mjs';
import {evidenceScope as E,need,hashPattern,same,loadEvidenceContext,readBoundExecution,observePlatform,hostParameters,hostReadProgram,assertEvidenceHost,bindTerminalReport,ensureObservationUnchanged,publicTerminal,parseReadArguments,withEvidencePlatform,safeEvidenceFailure,savePublicEvidence} from './factory-repair-evidence-read-r26.mjs';

export const cleanupReadFragment=String.raw`
errors=[];scope_root=run_root/p['attempt']
lifecycle,lifecycle_sha=optional_json(scope_root/'lifecycle.json');need(isinstance(lifecycle,dict),'REPAIR_EVIDENCE_LIFECYCLE_MISSING')
resource=hashlib.sha256((p['runId']+p['attempt']).encode()).hexdigest()[:40];prefix='jarvis-fa01-'+resource
labels={'jarvis.validation.runId':p['runId'],'jarvis.validation.attempt':p['attempt'],'jarvis.validation.role':'project-autonomy-fa01','jarvis.validation.sourceFingerprint':p['candidateFingerprint']}
expected_containers=[prefix+'-'+x for x in ['postgres','redis','minio','build','runtime','probe']]
broker_root=Path('/var/lib/jarvis-development/101/full-validation')/resource
need(lifecycle.get('labels')==labels and lifecycle.get('resourceId')==resource and lifecycle.get('fingerprint')==p['candidateFingerprint'] and lifecycle.get('brokerScope')==str(broker_root) and lifecycle.get('network')==prefix+'-net' and lifecycle.get('containers')==expected_containers,'REPAIR_EVIDENCE_LIFECYCLE_BINDING_CHANGED')
owner=lifecycle.get('owner');need(isinstance(owner,dict) and set(owner)=={'pid','start','boot'} and type(owner['pid']) is int and owner['pid']>1 and re.fullmatch('[0-9]+',str(owner['start'])) and re.fullmatch('[a-f0-9-]{36}',str(owner['boot'])),'REPAIR_EVIDENCE_OWNER_INVALID')
broker_labels={'jarvis.validation.runId':resource,'jarvis.validation.sourceFingerprint':p['candidateFingerprint'],'jarvis.validation.role':'sandbox-six-case-fixture'}
control,control_sha=optional_json(broker_root/'sandbox-broker/control.json');broker_cleanup,broker_cleanup_sha=optional_json(broker_root/'sandbox-broker/cleanup.json');registry,registry_sha=optional_json(broker_root/'sandbox-broker/registry.json')
for value,label in [(control,'CONTROL'),(broker_cleanup,'CLEANUP'),(registry,'REGISTRY')]:
 if value is None:errors.append('REPAIR_EVIDENCE_BROKER_'+label+'_MISSING');continue
 need(value.get('runId')==resource and value.get('sourceFingerprint')==p['candidateFingerprint'],'REPAIR_EVIDENCE_BROKER_RECORD_BINDING_CHANGED')
 if label in ['CONTROL','REGISTRY']:need(value.get('labels')==broker_labels,'REPAIR_EVIDENCE_BROKER_LABEL_BINDING_CHANGED')
socket=Path('/run/jarvis-ft-sandbox')/resource/'docker.sock'
if control is not None:
 need(control.get('socketPath')==str(socket),'REPAIR_EVIDENCE_BROKER_SOCKET_BINDING_CHANGED')
 if control.get('brokerLaunchIntent') and not (type(control.get('pid')) is int and control['pid']>1 and re.fullmatch('[0-9]+',str(control.get('processStartTicks','')))):errors.append('REPAIR_EVIDENCE_BROKER_LAUNCH_UNCONFIRMED')
intents=[] if registry is None else registry.get('createIntents');need(isinstance(intents,list) and len(intents)<=20 and all(isinstance(v,dict) for v in intents),'REPAIR_EVIDENCE_BROKER_INTENTS_INVALID')
unresolved=sum(v.get('status')!='acknowledged' for v in intents)
env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':'/root'}
def docker(args):
 r=subprocess.run(['/usr/bin/docker',*args],capture_output=True,text=True,timeout=15,env=env)
 need(r.returncode==0 and len(r.stdout)<=1024*1024,'REPAIR_EVIDENCE_DAEMON_QUERY_FAILED');return r.stdout
def census(kind,values):
 args=['ps','--all','--quiet','--no-trunc'] if kind=='container' else ['network','ls','--quiet','--no-trunc']
 for k,v in values.items():args+=['--filter','label='+k+'='+v]
 ids=docker(args).split();need(len(ids)<=20 and all(re.fullmatch('[a-f0-9]{64}',v) for v in ids),'REPAIR_EVIDENCE_DAEMON_IDS_INVALID');return sorted(ids)
def exact_names(kind,expected):
 args=['ps','--all','--no-trunc','--format','{{json .Names}}'] if kind=='container' else ['network','ls','--no-trunc','--format','{{json .Name}}']
 names=[]
 for line in docker(args).splitlines():
  value=json.loads(line);need(isinstance(value,str) and len(value)<=500,'REPAIR_EVIDENCE_DAEMON_NAMES_INVALID');names+=value.split(',') if kind=='container' else [value]
 need(len(names)<=10000,'REPAIR_EVIDENCE_DAEMON_NAMES_INVALID')
 return [{'kind':kind,'name':x,'present':x in names} for x in expected]
def resources():
 main_containers=census('container',labels);main_networks=census('network',labels);broker_containers=census('container',broker_labels);broker_networks=census('network',broker_labels)
 main_exact=exact_names('container',expected_containers)+exact_names('network',[prefix+'-net'])
 broker_exact=exact_names('container',['jarvis-ft-'+resource+'-sandbox-'+str(i) for i in range(1,8)])+exact_names('network',['jarvis-ft-'+resource+'-sandbox-net'])
 return {'main':{'containers':main_containers,'networks':main_networks,'exactNamedResources':main_exact},'broker':{'containers':broker_containers,'networks':broker_networks,'exactNamedResources':broker_exact}}
resources_before=resources();boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
def process_identity(pid):
 try:
  q=Path('/proc')/str(pid);s=q.stat();a=q.joinpath('stat').read_text().rsplit(')',1)[1].split();argv=[v.decode() for v in q.joinpath('cmdline').read_bytes().split(b'\0') if v];b=q.joinpath('stat').read_text().rsplit(')',1)[1].split()
  need(a[19]==b[19],'REPAIR_EVIDENCE_PROCESS_IDENTITY_CHANGED');return {'pid':pid,'startTicks':a[19],'boot':boot,'rootOwned':s.st_uid==0,'state':a[0],'alive':a[0]!='Z','argv':argv}
 except (FileNotFoundError,ProcessLookupError):return None
 except (OSError,IndexError,UnicodeDecodeError):errors.append('REPAIR_EVIDENCE_PROCESS_READ_INCOMPLETE');return None
def plain(argv):return [argv[0],*argv[2:]] if len(argv)>1 and argv[1]=='-I' else argv
expected_owner=['/usr/bin/python3',p['entry'],p['workspace'],p['runId']]
expected_broker=['/usr/bin/python3',str(tools_dir/'factory-sandbox-broker.py'),'--serve',resource,p['candidateFingerprint']]
expected_control=['/usr/bin/python3',str(tools_dir/'factory-sandbox-broker-control.py'),'--stop',resource,p['candidateFingerprint']]
state_path=str(scope_root/'lifecycle.json')
def process_census():
 related=[]
 for q in Path('/proc').iterdir():
  if not q.name.isdigit():continue
  v=process_identity(int(q.name))
  if not v or not v['rootOwned'] or not v['alive']:continue
  argv=plain(v['argv']);kind=None
  if argv==expected_owner:kind='coordinator'
  elif argv==expected_broker:kind='sandbox-broker'
  elif argv==expected_control:kind='sandbox-broker-stop-controller'
  elif len(argv)==4 and argv[0]=='/usr/bin/python3' and argv[1] in [p['entry'],str(tools_dir/'project-autonomy-fa01-coordinator.py')] and argv[2:]==['--watchdog',state_path]:kind='watchdog'
  if kind:related.append({k:v[k] for k in ['pid','startTicks','boot','state']}|{'kind':kind})
 return related
related_before=process_census();actual_owner=process_identity(owner['pid']);broker_pid=control.get('pid') if control else None;actual_broker=process_identity(broker_pid) if type(broker_pid) is int and broker_pid>1 else None
owner_alive=bool(actual_owner and actual_owner['alive'] and actual_owner['rootOwned'] and actual_owner['startTicks']==owner['start'] and actual_owner['boot']==owner['boot'] and plain(actual_owner['argv'])==expected_owner)
broker_alive=bool(actual_broker and actual_broker['alive'] and actual_broker['rootOwned'] and actual_broker['startTicks']==str(control.get('processStartTicks')) and plain(actual_broker['argv'])==expected_broker)
def presence(q):
 if not os.path.lexists(q):return {'present':False}
 s=q.lstat();return {'present':True,'symlink':stat.S_ISLNK(s.st_mode),'socket':stat.S_ISSOCK(s.st_mode),'directory':stat.S_ISDIR(s.st_mode),'uid':s.st_uid}
socket_before=presence(socket);runtime_before=presence(socket.parent)
cleanup,cleanup_sha=optional_json(scope_root/'cleanup.json');watchdog,watchdog_sha=optional_json(scope_root/'watchdog-cleanup.json')
need(cleanup is None or isinstance(cleanup.get('errorCodes'),list) and all(isinstance(x,str) and re.fullmatch('[A-Z][A-Z0-9_]{0,150}',x) for x in cleanup['errorCodes']),'REPAIR_EVIDENCE_CLEANUP_CODES_INVALID')
private_sources={}
for key in ['before','after']:
 v,digest=optional_json(scope_root/('source-'+key+'.json'))
 if v is not None:need(v.get('sha256')==p['candidateFingerprint'] and v.get('files')==605,'REPAIR_EVIDENCE_PRIVATE_SOURCE_BINDING_CHANGED')
 private_sources[key]={'present':v is not None,'sha256':digest,'sourceFingerprint':v.get('sha256') if v else None,'files':v.get('files') if v else None}
resources_after=resources();related_after=process_census();socket_after=presence(socket);runtime_after=presence(socket.parent)
need(resources_before==resources_after and related_before==related_after and socket_before==socket_after and runtime_before==runtime_after,'REPAIR_EVIDENCE_CLEANUP_STATE_CHANGED_RETRY_READ_ONLY')
need(private_read(scope_root/'lifecycle.json') and optional_json(scope_root/'lifecycle.json')[1]==lifecycle_sha,'REPAIR_EVIDENCE_LIFECYCLE_READ_CHANGED')
for q,digest in [(broker_root/'sandbox-broker/control.json',control_sha),(broker_root/'sandbox-broker/cleanup.json',broker_cleanup_sha),(broker_root/'sandbox-broker/registry.json',registry_sha),(scope_root/'cleanup.json',cleanup_sha),(scope_root/'watchdog-cleanup.json',watchdog_sha)]:need(optional_json(q)[1]==digest,'REPAIR_EVIDENCE_CLEANUP_METADATA_CHANGED')
all_absent=not any(resources_after[k]['containers'] or resources_after[k]['networks'] or any(x['present'] for x in resources_after[k]['exactNamedResources']) for k in ['main','broker']) and not socket_after['present'] and not runtime_after['present']
broker_claim=bool(broker_cleanup and control and broker_cleanup.get('ok') is True and broker_cleanup.get('networkRemoved') is True and broker_cleanup.get('socketRemoved') is True and broker_cleanup.get('runtimeDirectoryRemoved') is True and broker_cleanup.get('errors')==[] and control.get('status')=='stopped')
coordinator_claim=bool(cleanup and cleanup.get('complete') is True and cleanup.get('errorCodes')==[] and cleanup.get('businessResourcesTouched') is False)
cleanup_observation={'runId':p['runId'],'attempt':p['attempt'],'resourceId':resource,'lifecycleVerified':True,'lifecycleSHA256':lifecycle_sha,'mainLabelScope':resources_after['main'],'brokerLabelScope':resources_after['broker'],'exactNamedResourceCount':15,'broker':{'controlSHA256':control_sha,'cleanupSHA256':broker_cleanup_sha,'registrySHA256':registry_sha,'cleanupClaimsComplete':broker_claim,'unresolvedCreateIntents':unresolved,'recordedPID':broker_pid,'expectedProcessIdentityAlive':broker_alive,'socket':socket_after,'runtimeDirectory':runtime_after},'coordinator':{'cleanupSHA256':cleanup_sha,'cleanupClaimsComplete':coordinator_claim,'recordedPID':owner['pid'],'expectedProcessIdentityAlive':owner_alive,'errorCodes':cleanup.get('errorCodes',[]) if cleanup else []},'watchdogCleanup':{'present':watchdog is not None,'sha256':watchdog_sha,'complete':watchdog.get('complete') if watchdog else None},'relatedLiveProcesses':related_after,'resourcesActuallyAbsent':all_absent,'processesActuallyGone':not related_after and not owner_alive and not broker_alive,'privateSourceObservations':private_sources,'errorCodes':sorted(set(errors)),'readOnly':True,'rawLogsExported':False,'privateEnvironmentExported':False,'signalsSent':False,'resourcesRemoved':False}
`;

export function classifyCleanup(snapshot,host,platform,binding){
 const c=host.cleanupAudit;
 need(c&&c.runId===snapshot.run.id&&c.attempt===binding.expectedAttempt&&c.resourceId===sha(snapshot.run.id+c.attempt).slice(0,40)&&c.lifecycleVerified===true&&hashPattern.test(c.lifecycleSHA256??'')&&c.exactNamedResourceCount===15&&c.readOnly===true&&c.signalsSent===false&&c.resourcesRemoved===false&&c.rawLogsExported===false&&c.privateEnvironmentExported===false,'REPAIR_EVIDENCE_CLEANUP_SCOPE_CHANGED');
 const exact=[...(c.mainLabelScope?.exactNamedResources??[]),...(c.brokerLabelScope?.exactNamedResources??[])];
 const prefix='jarvis-fa01-'+c.resourceId,broker='jarvis-ft-'+c.resourceId;
 const expectedMain=[...['postgres','redis','minio','build','runtime','probe'].map(x=>'container:'+prefix+'-'+x),'network:'+prefix+'-net'].sort();
 const expectedBroker=[...Array.from({length:7},(_,i)=>'container:'+broker+'-sandbox-'+(i+1)),'network:'+broker+'-sandbox-net'].sort();
 need(exact.length===15&&same(c.mainLabelScope?.exactNamedResources.map(x=>x.kind+':'+x.name).sort(),expectedMain)&&same(c.brokerLabelScope?.exactNamedResources.map(x=>x.kind+':'+x.name).sort(),expectedBroker)&&Array.isArray(c.relatedLiveProcesses)&&Array.isArray(c.errorCodes)&&c.errorCodes.every(x=>/^[A-Z][A-Z0-9_]{0,150}$/.test(x)),'REPAIR_EVIDENCE_CLEANUP_METADATA_INVALID');
 for(const scope of ['mainLabelScope','brokerLabelScope'])for(const key of ['containers','networks'])need(Array.isArray(c[scope][key])&&c[scope][key].length<=20&&c[scope][key].every(x=>hashPattern.test(x)),'REPAIR_EVIDENCE_CLEANUP_METADATA_INVALID');
 const emptyScopes=['mainLabelScope','brokerLabelScope'].every(k=>Array.isArray(c[k].containers)&&!c[k].containers.length&&Array.isArray(c[k].networks)&&!c[k].networks.length);
 const actualAbsent=emptyScopes&&exact.every(x=>x.present===false)&&c.broker.socket.present===false&&c.broker.runtimeDirectory.present===false;
 const actualGone=c.relatedLiveProcesses.length===0&&c.coordinator.expectedProcessIdentityAlive===false&&c.broker.expectedProcessIdentityAlive===false;
 need(c.resourcesActuallyAbsent===actualAbsent&&c.processesActuallyGone===actualGone,'REPAIR_EVIDENCE_CLEANUP_CLAIMS_INCONSISTENT');
 const nodeIdle=platform.queueActive===0&&host.quiet.children.length===0&&same(host.quiet.counts,{runs:0,deliveries:0,logs:0});
 const resourceVerified=snapshot.terminal&&snapshot.signed&&actualAbsent&&actualGone&&nodeIdle&&c.broker.cleanupClaimsComplete===true&&c.coordinator.cleanupClaimsComplete===true&&c.broker.unresolvedCreateIntents===0&&c.errorCodes.length===0;
 const sourceFilesBound=['before','after'].every(k=>c.privateSourceObservations?.[k]?.present===true&&c.privateSourceObservations[k].sourceFingerprint===E.candidateFingerprint&&c.privateSourceObservations[k].files===605&&hashPattern.test(c.privateSourceObservations[k].sha256??''));
 const reportBound=binding.bound===true&&binding.attempt===c.attempt&&binding.sourceStable===true&&sourceFilesBound;
 return {resourceCleanupIndependentlyVerified:resourceVerified,terminalReportIndependentlyBound:reportBound,cleanupIndependentlyVerified:resourceVerified&&reportBound,nodeACKIdle:nodeIdle,status:!snapshot.terminal?'not-terminal':!actualGone?'process-finalization-pending':resourceVerified&&reportBound?'complete':resourceVerified?'resources-clean-report-unconfirmed':'incomplete'};
}

export async function verifyRepairCleanup(options,d){
 need(options?.attempt&&/^[a-f0-9]{32}$/.test(options.attempt),'REPAIR_EVIDENCE_ATTEMPT_REQUIRED');
 const context=await (d.loadContext??loadEvidenceContext)(options,d),snapshot=await readBoundExecution(context,d),platform=await observePlatform(context,d);
 const host=assertEvidenceHost(await d.readRoot(hostParameters(context,options),hostReadProgram(cleanupReadFragment)),context,platform);
 const reportBinding=bindTerminalReport(snapshot,host),classification=classifyCleanup(snapshot,host,platform,{...reportBinding,expectedAttempt:options.attempt});
 await ensureObservationUnchanged(context,snapshot,platform,d);
 return {schemaVersion:1,kind:'software-factory-repair-candidate-independent-cleanup-audit',observedAt:new Date(d.now()).toISOString(),projectId:E.projectId,taskId:context.j.taskId,runId:context.j.runId,attempt:options.attempt,workspace:E.workspace,expectedSourceFingerprint:E.candidateFingerprint,terminal:publicTerminal(snapshot),terminalReportBinding:reportBinding,host:{source:{mainBefore:context.j.mainBefore,mainAfter:host.source,candidateBefore:context.j.candidateBefore,candidateAfter:host.candidate,mainUnchanged:true,candidateUnchanged:true,verificationScope:'public-manifest-and-metadata'},node:{queueActive:platform.queueActive,acknowledgementCounts:host.quiet.counts,childCount:host.quiet.children.length},cleanup:host.cleanupAudit},...classification,executorRestored:context.j.restored===true,partialNative:context.j.nativeBinding.partialNative,productValidationStatus:reportBinding.status??null,productAccepted:false,objectivesAccepted:false,readOnly:true,modelsInvoked:false,productCodeExecuted:false,signalsSent:false,resourcesRemoved:false,businessServicesModified:false,rawLogsExported:false,privateEnvironmentExported:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let result;try{const options=parseReadArguments(process.argv.slice(2),{cleanup:true});result=await withEvidencePlatform(d=>verifyRepairCleanup(options,d));if(!result.cleanupIndependentlyVerified)process.exitCode=2;}catch(error){result=safeEvidenceFailure(error,'software-factory-repair-candidate-independent-cleanup-audit');process.exitCode=1;}
 const receipt=await savePublicEvidence('repair-independent-cleanup-r26',result);console.log(JSON.stringify({...receipt,...result}));
}
