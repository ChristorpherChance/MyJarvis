/** Read-only, exact-run cleanup audit. Never stops processes or changes a node. */
import {createHash, randomUUID} from 'node:crypto';
import {writeFile, mkdir} from 'node:fs/promises';
import {remote, primary, lanProfile, python} from './managed-server-client.mjs';

const runPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/;
const argumentsMap = new Map();
for (const value of process.argv.slice(2)) {
  const match = /^--(run-id|attempt)=([^=]+)$/.exec(value);
  if (!match || argumentsMap.has(match[1])) throw Error('CLEANUP_AUDIT_FIXED_ARGUMENTS_REQUIRED');
  argumentsMap.set(match[1], match[2]);
}
const runId = argumentsMap.get('run-id'), attempt = argumentsMap.get('attempt');
if (argumentsMap.size !== 2 || !runPattern.test(runId ?? '') || !/^[a-f0-9]{32}$/.test(attempt ?? '')) {
  throw Error('CLEANUP_AUDIT_FIXED_ARGUMENTS_REQUIRED');
}
const scope = {
  runId, attempt, projectId: '70ec346f-6520-46ed-abed-22cac770a3e4',
  workspace: '/home/superopen/All-Projects/msf',
  sourceFingerprint: '151300cf55e8e46445e5e3b85293c047f981b14f620350a217a61d9a987056ea',
  head: '89e6af3ac64f707c3ba6fc09e9e09fe4a4174171',
  helperSHA256: '57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2',
  brokerSHA256: 'd4bcec4e88990e45c82d76574fe7c8de8eebd1db239cedceefd95a6b204d1954',
};

const terminal = JSON.parse(primary(python(scope, String.raw`
import sqlite3,json,hashlib,datetime
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True,timeout=10)
try:
 row=c.execute('SELECT json,status FROM execution_runs WHERE id=?',(p['runId'],)).fetchone()
 if row is None:raise RuntimeError('CLEANUP_AUDIT_RUN_NOT_FOUND')
 raw=row[0];v=json.loads(raw);status=row[1]
 if v.get('id')!=p['runId'] or v.get('projectId')!=p['projectId'] or v.get('workspace')!=p['workspace']:raise RuntimeError('CLEANUP_AUDIT_PLATFORM_SCOPE_MISMATCH')
 r=v.get('result') or {};validation=r.get('validation') or {}
 print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runId':v['id'],'taskId':v.get('taskId'),'status':status,'terminal':status in ['succeeded','failed','cancelled'],'statusSource':'execution_runs.status','ingestedSignedAgentReceipt':r.get('source')=='signed-agent','resultSource':r.get('source'),'outcome':r.get('outcome'),'executionExitCode':r.get('exitCode'),'validationExitCode':validation.get('exitCode'),'storedRecordSHA256':hashlib.sha256(raw.encode()).hexdigest(),'signatureVerifierReexecuted':False,'rawResultExported':False}))
finally:c.close()
`)));

const host = JSON.parse(remote(lanProfile, 'jarvis-101', python(scope, String.raw`
import os,sys,json,re,stat,hashlib,subprocess,datetime
from pathlib import Path
from types import ModuleType
sys.dont_write_bytecode=True
errors=[]
def need(v,c):
 if not v:raise RuntimeError(c)
def trusted(q):
 q=Path(q)
 for part in [q,*q.parents]:
  s=part.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'CLEANUP_AUDIT_FILE_UNTRUSTED')
 return q
def read(q,limit=1024*1024):
 q=trusted(q);fd=os.open(q,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and 0<s.st_size<=limit,'CLEANUP_AUDIT_FILE_INVALID')
  with os.fdopen(fd,'rb',closefd=False) as f:body=f.read(limit+1)
  after=os.fstat(fd);need(len(body)==s.st_size and (s.st_ino,s.st_mtime_ns,s.st_ctime_ns)==(after.st_ino,after.st_mtime_ns,after.st_ctime_ns),'CLEANUP_AUDIT_FILE_CHANGED')
  return body
 finally:os.close(fd)
def report_file(q):
 if not os.path.lexists(q):return None,None
 body=read(q);return json.loads(body),hashlib.sha256(body).hexdigest()
root=Path('/var/lib/jarvis-development/101/main-acceptance-r26-4')/p['runId']/p['attempt']
lifecycle,lifecycle_sha=report_file(root/'lifecycle.json');need(isinstance(lifecycle,dict),'CLEANUP_AUDIT_LIFECYCLE_MISSING')
resource=hashlib.sha256((p['runId']+p['attempt']).encode()).hexdigest()[:40]
prefix='jarvis-fa01-'+resource
labels={'jarvis.validation.runId':p['runId'],'jarvis.validation.attempt':p['attempt'],'jarvis.validation.role':'project-autonomy-fa01','jarvis.validation.sourceFingerprint':p['sourceFingerprint']}
broker_root=Path('/var/lib/jarvis-development/101/full-validation')/resource
expected_names=[prefix+'-'+v for v in ['postgres','redis','minio','build','runtime','probe']]
need(lifecycle.get('labels')==labels and lifecycle.get('resourceId')==resource and lifecycle.get('fingerprint')==p['sourceFingerprint'] and lifecycle.get('brokerScope')==str(broker_root) and lifecycle.get('network')==prefix+'-net' and lifecycle.get('containers')==expected_names,'CLEANUP_AUDIT_LIFECYCLE_BINDING_MISMATCH')
owner=lifecycle.get('owner');need(isinstance(owner,dict) and set(owner)=={'pid','start','boot'} and type(owner['pid']) is int and owner['pid']>1 and isinstance(owner['start'],str) and re.fullmatch('[0-9]+',owner['start']) and isinstance(owner['boot'],str) and re.fullmatch('[a-f0-9-]{36}',owner['boot']),'CLEANUP_AUDIT_OWNER_INVALID')
tools=Path('/opt/jarvis-development/software-factory')
broker_body=read(tools/'factory-sandbox-broker.py')
need(hashlib.sha256(broker_body).hexdigest()==p['brokerSHA256'],'CLEANUP_AUDIT_BROKER_TOOL_CHANGED')
runtime_match=re.search(rb"^RUNTIME_ROOT = Path\('([^']+)'\)$",broker_body,re.M)
need(runtime_match and runtime_match.group(1)==b'/run/jarvis-ft-sandbox','CLEANUP_AUDIT_SOCKET_ROOT_NOT_PINNED')
socket=Path(runtime_match.group(1).decode())/resource/'docker.sock'
broker_labels={'jarvis.validation.runId':resource,'jarvis.validation.sourceFingerprint':p['sourceFingerprint'],'jarvis.validation.role':'sandbox-six-case-fixture'}
control,control_sha=report_file(broker_root/'sandbox-broker/control.json')
broker_cleanup,broker_cleanup_sha=report_file(broker_root/'sandbox-broker/cleanup.json')
broker_registry,registry_sha=report_file(broker_root/'sandbox-broker/registry.json')
for value,code in [(control,'CONTROL'),(broker_cleanup,'CLEANUP'),(broker_registry,'REGISTRY')]:
 need(isinstance(value,dict) and value.get('runId')==resource and value.get('sourceFingerprint')==p['sourceFingerprint'],'CLEANUP_AUDIT_BROKER_'+code+'_BINDING_MISMATCH')
need(control.get('labels')==broker_labels and broker_registry.get('labels')==broker_labels and control.get('socketPath')==str(socket),'CLEANUP_AUDIT_BROKER_LABEL_SOCKET_MISMATCH')
if control.get('brokerLaunchIntent') and (type(control.get('pid')) is not int or not isinstance(control.get('processStartTicks'),str) or not re.fullmatch('[0-9]+',control['processStartTicks'])):errors.append('CLEANUP_AUDIT_BROKER_PROCESS_OUTCOME_UNRESOLVED')
env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':'/root'}
def docker(args):
 r=subprocess.run(['/usr/bin/docker',*args],capture_output=True,text=True,timeout=20,env=env)
 need(r.returncode==0,'CLEANUP_AUDIT_DAEMON_QUERY_FAILED')
 return r.stdout
def census(kind,values):
 args=['ps','--all','--quiet','--no-trunc'] if kind=='container' else ['network','ls','--quiet','--no-trunc']
 for k,v in values.items():args+=['--filter','label='+k+'='+v]
 ids=docker(args).split();need(len(ids)<=20 and all(re.fullmatch('[a-f0-9]{64}',v) for v in ids),'CLEANUP_AUDIT_DAEMON_RESULT_INVALID')
 return ids
def present(kind,name):
 r=subprocess.run(['/usr/bin/docker','inspect','--type',kind,name],capture_output=True,text=True,timeout=20,env=env)
 if r.returncode:
  # Docker returns a different fixed missing-network message than containers.
  # Match the exact requested name and empty JSON result; query failures stay failures.
  absent=re.fullmatch(r'(?:Error(?: response from daemon)?:\s*)?(?:No such (?:object|network|container):\s*'+re.escape(name)+r'|network\s+'+re.escape(name)+r'\s+not found)\.?',r.stderr.strip(),re.I)
  if r.stdout.strip()=='[]' and absent:return None
  raise RuntimeError('CLEANUP_AUDIT_EXACT_RESOURCE_QUERY_FAILED')
 v=json.loads(r.stdout);need(isinstance(v,list) and len(v)==1,'CLEANUP_AUDIT_INSPECT_RESULT_INVALID')
 return v[0]
def scoped_presence(kind,name,expected):
 v=present(kind,name)
 if v is None:return {'name':name,'present':False,'identityMatches':None}
 actual=v.get('Config',{}).get('Labels',{}) if kind=='container' else v.get('Labels',{})
 return {'name':name,'present':True,'id':v.get('Id'),'identityMatches':all(actual.get(k)==x for k,x in expected.items())}
containers=census('container',labels);networks=census('network',labels)
broker_containers=census('container',broker_labels);broker_networks=census('network',broker_labels)
exact=[scoped_presence('container',v,labels) for v in expected_names]
exact.append(scoped_presence('network',prefix+'-net',labels))
broker_exact=[scoped_presence('container','jarvis-ft-'+resource+'-sandbox-'+str(i),broker_labels) for i in range(1,8)]
broker_exact.append(scoped_presence('network','jarvis-ft-'+resource+'-sandbox-net',broker_labels))
boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
def identity(pid):
 try:
  q=Path('/proc')/str(pid);info=q.stat();body=q.joinpath('stat').read_text().rsplit(')',1)[1].split()
  argv=[v.decode() for v in q.joinpath('cmdline').read_bytes().split(b'\0') if v]
  after=q.joinpath('stat').read_text().rsplit(')',1)[1].split()
  if body[19]!=after[19]:return None
  return {'pid':pid,'startTicks':body[19],'boot':boot,'rootOwned':info.st_uid==0,'state':body[0],'alive':body[0]!='Z','argv':argv}
 except (FileNotFoundError,ProcessLookupError):return None
 except (OSError,IndexError,UnicodeDecodeError):errors.append('CLEANUP_AUDIT_PROCESS_READ_INCOMPLETE');return None
def without_isolation(argv):
 return [argv[0],*argv[2:]] if len(argv)>1 and argv[1]=='-I' else argv
entry='/usr/local/libexec/jarvis-msf-main-acceptance-r26-4';state_path=str(root/'lifecycle.json')
expected_owner=['/usr/bin/python3',entry,p['workspace'],p['runId']]
expected_broker=['/usr/bin/python3',str(tools/'factory-sandbox-broker.py'),'--serve',resource,p['sourceFingerprint']]
expected_control=['/usr/bin/python3',str(tools/'factory-sandbox-broker-control.py'),'--stop',resource,p['sourceFingerprint']]
related=[]
for q in Path('/proc').iterdir():
 if not q.name.isdigit():continue
 value=identity(int(q.name))
 if not value or not value['rootOwned'] or not value['alive']:continue
 argv=without_isolation(value['argv']);kind=None
 if argv==expected_owner:kind='coordinator'
 elif argv==expected_broker:kind='sandbox-broker'
 elif argv==expected_control:kind='sandbox-broker-stop-controller'
 elif len(argv)==4 and argv[0]=='/usr/bin/python3' and argv[1] in [entry,str(tools/'project-autonomy-fa01-coordinator.py')] and argv[2:] == ['--watchdog',state_path]:kind='watchdog'
 if kind:related.append({k:value[k] for k in ['pid','startTicks','boot','state']}|{'kind':kind})
actual_owner=identity(owner['pid']);owner_matches=bool(actual_owner and actual_owner['rootOwned'] and actual_owner['alive'] and actual_owner['startTicks']==owner['start'] and actual_owner['boot']==owner['boot'] and without_isolation(actual_owner['argv'])==expected_owner)
actual_broker=identity(control.get('pid')) if type(control.get('pid')) is int else None
broker_matches=bool(actual_broker and actual_broker['rootOwned'] and actual_broker['alive'] and actual_broker['startTicks']==control.get('processStartTicks') and actual_broker['argv']==expected_broker)
cleanup,cleanup_sha=report_file(root/'cleanup.json');watchdog_cleanup,watchdog_cleanup_sha=report_file(root/'watchdog-cleanup.json')
detailed,detailed_sha=report_file(root/'detailed-report.json')
if detailed is not None:
 v=detailed.get('report',{});need(v.get('runId')==p['runId'] and v.get('workspace')==p['workspace'] and v.get('sourceFingerprint')==p['sourceFingerprint'],'CLEANUP_AUDIT_FINAL_REPORT_BINDING_MISMATCH')
helper_body=read(tools/'project-autonomy-evidence.py');need(hashlib.sha256(helper_body).hexdigest()==p['helperSHA256'],'CLEANUP_AUDIT_HELPER_CHANGED')
helper=ModuleType('cleanup_readonly_fingerprint');helper.__file__=str(tools/'project-autonomy-evidence.py');exec(compile(helper_body,helper.__file__,'exec',dont_inherit=True),helper.__dict__)
fingerprint=helper.fingerprint(p['workspace'])
git_env={**env,'HOME':'/nonexistent','GIT_CONFIG_GLOBAL':'/dev/null','GIT_CONFIG_SYSTEM':'/dev/null','GIT_CONFIG_NOSYSTEM':'1','GIT_NO_REPLACE_OBJECTS':'1','GIT_OPTIONAL_LOCKS':'0'}
head=subprocess.run(['/usr/bin/git','--no-optional-locks','-c','safe.directory='+p['workspace'],'-C',p['workspace'],'rev-parse','--verify','HEAD'],capture_output=True,text=True,timeout=15,env=git_env)
need(head.returncode==0 and re.fullmatch('[a-f0-9]{40}',head.stdout.strip()),'CLEANUP_AUDIT_GIT_READ_FAILED')
def path_presence(q):
 if not os.path.lexists(q):return {'present':False}
 s=Path(q).lstat();return {'present':True,'symlink':stat.S_ISLNK(s.st_mode),'socket':stat.S_ISSOCK(s.st_mode),'directory':stat.S_ISDIR(s.st_mode),'uid':s.st_uid,'mode':oct(stat.S_IMODE(s.st_mode))}
socket_state=path_presence(socket);runtime_state=path_presence(socket.parent)
all_resources_absent=not containers and not networks and not broker_containers and not broker_networks and not any(v['present'] for v in exact+broker_exact) and not socket_state['present'] and not runtime_state['present']
broker_claim_ok=broker_cleanup.get('ok') is True and broker_cleanup.get('networkRemoved') is True and broker_cleanup.get('socketRemoved') is True and broker_cleanup.get('runtimeDirectoryRemoved') is True and broker_cleanup.get('errors')==[] and control.get('status')=='stopped'
coordinator_claim_ok=isinstance(cleanup,dict) and cleanup.get('complete') is True and cleanup.get('errorCodes')==[]
current_source_ok=fingerprint['sha256']==p['sourceFingerprint'] and head.stdout.strip()==p['head']
print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runId':p['runId'],'attempt':p['attempt'],'resourceId':resource,'lifecycleVerified':True,'lifecycleSHA256':lifecycle_sha,'source':{'currentSHA256':fingerprint['sha256'],'expectedSHA256':p['sourceFingerprint'],'files':fingerprint['files'],'head':head.stdout.strip(),'unchanged':current_source_ok},'mainLabelScope':{'runId':p['runId'],'containers':containers,'networks':networks,'exactNamedResources':exact},'brokerLabelScope':{'runId':resource,'containers':broker_containers,'networks':broker_networks,'exactNamedResources':broker_exact},'broker':{'controlSHA256':control_sha,'cleanupSHA256':broker_cleanup_sha,'registrySHA256':registry_sha,'status':control.get('status'),'cleanupClaimsComplete':broker_claim_ok,'createIntentCount':len(broker_registry.get('createIntents',[])),'unresolvedCreateIntents':sum(v.get('status')!='acknowledged' for v in broker_registry.get('createIntents',[])),'recordedPID':control.get('pid'),'expectedProcessIdentityAlive':broker_matches,'recordedPIDExists':actual_broker is not None,'socketRootConfirmedFromPinnedSource':True,'socketPath':str(socket),'socket':socket_state,'runtimeDirectory':runtime_state},'coordinator':{'cleanupSHA256':cleanup_sha,'cleanupClaimsComplete':coordinator_claim_ok,'recordedPID':owner['pid'],'expectedProcessIdentityAlive':owner_matches,'recordedPIDExists':actual_owner is not None},'watchdogCleanup':{'present':watchdog_cleanup is not None,'sha256':watchdog_cleanup_sha,'complete':watchdog_cleanup.get('complete') if isinstance(watchdog_cleanup,dict) else None},'relatedLiveProcesses':related,'finalPrivateReport':{'present':detailed is not None,'sha256':detailed_sha,'status':detailed.get('report',{}).get('status') if detailed else None,'sourceStable':detailed.get('report',{}).get('sourceStable') if detailed else None},'resourcesActuallyAbsent':all_resources_absent,'processesActuallyGone':not related and not owner_matches and not broker_matches,'errorCodes':sorted(set(errors)),'rawLogsExported':False,'privateEnvironmentExported':False,'mutationsPerformed':False}))
`), true, {timeoutMs: 120000}));

const resourceCleanupVerified = terminal.terminal && terminal.ingestedSignedAgentReceipt && host.lifecycleVerified
  && host.resourcesActuallyAbsent && host.processesActuallyGone && host.source.unchanged
  && host.broker.cleanupClaimsComplete && host.broker.unresolvedCreateIntents === 0
  && host.coordinator.cleanupClaimsComplete && host.errorCodes.length === 0;
const complete = resourceCleanupVerified && host.finalPrivateReport.present
  && host.finalPrivateReport.sourceStable === true && host.errorCodes.length === 0;
const result = {
  schemaVersion: 1, kind: 'software-factory-current-main-independent-cleanup-audit',
  observedAt: new Date().toISOString(), runId, attempt, projectId: scope.projectId,
  expectedSourceFingerprint: scope.sourceFingerprint, terminal, host,
  cleanupIndependentlyVerified: Boolean(complete),
  resourceCleanupIndependentlyVerified: Boolean(resourceCleanupVerified),
  status: complete ? 'complete' : !terminal.terminal ? 'not-terminal' : host.resourcesActuallyAbsent && !host.processesActuallyGone ? 'process-finalization-pending' : 'incomplete',
  productAccepted: false, modelsInvoked: false, businessServicesModified: false,
};
const dir = 'artifacts/software-factory/acceptance-r26';
await mkdir(dir, {recursive: true});
const path = `${dir}/main-independent-cleanup-r26-4-${Date.now()}-${randomUUID()}.json`;
const raw = JSON.stringify(result, null, 2) + '\n';
await writeFile(path, raw, {flag: 'wx'});
console.log(JSON.stringify({path, sha256: createHash('sha256').update(raw).digest('hex'), ...result}));
if (!complete) process.exitCode = 2;
