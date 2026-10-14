import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {repairScope as S,nativeRepairTemplate,sha} from './run-factory-main-repair-r26.mjs';
import {verifierScope as V,fixedToolSHA} from './prepare-factory-repair-verifier-r26.mjs';
import {assertInstallJournal,collectRepairVerifierEvidence,storedNativeReadProgram,rootConfigReadProgram,repairVerifierInstallProgram,safeInstallFailure} from './install-factory-repair-verifier-r26.mjs';

test('synchronous node or queue failure waits for every pending API result before scoped login cleanup',async()=>{
 const originalTemplate={id:S.templateId,machineId:S.machineId,engine:'claude',program:'/fixture/native',args:[],workspaceRoot:'/home/superopen/All-Projects',maxRounds:3,timeoutSec:100,leaseSec:60,budgetCurrency:'USD'},template=nativeRepairTemplate(originalTemplate);
 const journal={version:2,scope:S,job:'a'.repeat(32),nodeAgentId:'11111111-1111-4111-8111-111111111111',initialProfileSHA:'e'.repeat(64),originalTemplate,originalTemplateSHA:sha(originalTemplate),template,templateSHA:sha(template),baseline:{version:'r26-4',runId:'f'.repeat(40),reportSHA:'e'.repeat(64),resultSHA:'f'.repeat(64)},cleanupProof:{path:'artifacts/software-factory/acceptance-r26/main-independent-cleanup-r26-4-1791763200000-22222222-2222-4222-8222-222222222222.json',sha256:'e'.repeat(64)},diagnosis:{sha256:'f'.repeat(64),runId:'f'.repeat(40),sourceFiles:[]},intents:{start:{commandId:'43567b5e-79af-4025-80ab-7fc077d213b3',scope:'personal',expectedVersion:1,payload:{taskId:'580888fe-8edc-40a0-b6a3-46124d119870'}}},dispatchAttemptedAt:'2026-10-12T00:00:00.000Z',phase:'restored',started:true,restored:true,taskId:'580888fe-8edc-40a0-b6a3-46124d119870',runId:'5c8034046a05b0db89edebbb0e2c6876efb5882f'};
 assertInstallJournal(journal);
 for(const synchronousReader of ['nodeState','queueState'])for(const pendingOutcome of ['fulfilled','rejected']){
  let resolvePending,rejectPending,revoked=false,caught,apiSettled=0,downstreamReads=0;const calls=[];
  const pending=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject;}),sshError=Error('SSH_SYNCHRONOUS_FAILURE'),apiError=Error('API_PENDING_FAILURE');
  const d={api:path=>{calls.push(path);return (path.startsWith('/api/v1/tasks/')?pending:Promise.resolve({data:{}})).then(value=>{assert.equal(revoked,false);apiSettled++;return value;},error=>{assert.equal(revoked,false);apiSettled++;throw error;});},nodeState:()=>{calls.push('nodeState');if(synchronousReader==='nodeState')throw sshError;return {};},queueState:()=>{calls.push('queueState');if(synchronousReader==='queueState')throw sshError;return {};},readPrimary:()=>{downstreamReads++;throw Error('UNEXPECTED_PRIMARY');},readRoot:()=>{downstreamReads++;throw Error('UNEXPECTED_ROOT');}};
  const completed=collectRepairVerifierEvidence(journal,d).then(()=>{throw Error('UNEXPECTED_COLLECT_SUCCESS');},error=>{caught=error;revoked=true;});
  // Simulate withPlatform's finally: it may revoke the login only after the
  // collection promise settles, including an API rejection arriving later.
  for(let n=0;n<4;n++)await Promise.resolve();
  assert.equal(calls.length,7);assert.equal(revoked,false);assert.equal(apiSettled,4);
  if(pendingOutcome==='fulfilled')resolvePending({data:{}});else rejectPending(apiError);
  await completed;assert.equal(apiSettled,5);assert.equal(revoked,true);assert.equal(downstreamReads,0);assert.equal(caught,pendingOutcome==='fulfilled'?sshError:apiError);
 }
});

test('all three fixed host programs parse; root installer retains exclusive puts, source pin and visudo guards',()=>{
 const code=String.raw`import ast,json,sys
v=json.load(sys.stdin);out=[]
for body in v:
 t=ast.parse(body);out.append({'calls':[ast.unparse(n) for n in ast.walk(t) if isinstance(n,ast.Call)],'guards':{n.args[1].value:ast.unparse(n.args[0]) for n in ast.walk(t) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='need' and len(n.args)==2 and isinstance(n.args[1],ast.Constant)}})
print(json.dumps(out))`;
 const r=spawnSync('python',['-c',code],{input:JSON.stringify([storedNativeReadProgram,rootConfigReadProgram,repairVerifierInstallProgram()]),encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);
 const [stored,roots,installer]=JSON.parse(r.stdout),calls=installer.calls.join('\n');
 assert.ok(stored.calls.some(x=>x.includes('?mode=ro')));assert.ok(stored.guards.REPAIR_INSTALL_STORED_NATIVE_NOT_TERMINAL.includes("result.get('outcome') == 'success'"));
 assert.ok(roots.calls.some(x=>x.includes('O_NOFOLLOW')));
 assert.match(calls,/os\.open\(q, os\.O_WRONLY \| os\.O_CREAT \| os\.O_EXCL \| os\.O_NOFOLLOW, mode\)/);
 assert.match(calls,/os\.fsync\(fd\)/);assert.match(calls,/os\.fchmod\(fd, mode\)/);assert.ok(!calls.includes('os.replace('));assert.ok(!calls.includes('os.unlink('));assert.ok(!calls.includes('os.rename('));
 assert.ok(installer.guards.REPAIR_INSTALL_EXISTING_FILE_CONFLICT.includes('private_read(q, 2097152) == data'));
 assert.ok(installer.guards.REPAIR_INSTALL_SOURCE_CHANGED_AFTER_PUT.includes('final_main == main_after and final_candidate == candidate_after'));
 assert.ok(installer.guards.REPAIR_INSTALL_OLD_FILES_CHANGED_AFTER_PUT.includes('immutable() == immutable_after'));
 assert.ok(installer.guards.REPAIR_INSTALL_NODE_TEMPLATE_NOT_RESTORED.includes("templates == [p['originalTemplate']]"));
 assert.ok(installer.guards.REPAIR_INSTALL_DENOMINATOR_CHANGED.includes("len(baseline['requiredTestFiles']) == 45"));
 assert.ok(calls.includes("['/usr/sbin/visudo', '-cf', '-']"));assert.ok(calls.includes("['/usr/sbin/visudo', '-cf', str(rule)]"));
});
test('actual generated shared host guard retains files=593 while the installer reads exactly three installationFiles',()=>{
 const payload={...S,installationFiles:[{path:V.entry,mode:0o755},{path:V.configRoot+'/baseline.json',mode:0o600},{path:V.configRoot+'/policy.json',mode:0o600}]};
 assert.equal(payload.files,593);assert.equal(payload.installationFiles.length,3);
 const code=String.raw`
import ast,json,sys,copy
from pathlib import PurePosixPath as Path
v=json.load(sys.stdin);tree=ast.parse(v['program']);p=v['payload']
def guard(code):
 return next(n for n in tree.body if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='need' and len(n.value.args)==2 and isinstance(n.value.args[1],ast.Constant) and n.value.args[1].value==code)
def assignment(name):
 return next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id==name for t in n.targets))
selected=[guard('MAIN_REPAIR_MAIN_BASELINE_CHANGED'),assignment('payloads'),assignment('expected_paths'),guard('REPAIR_INSTALL_PAYLOAD_SCOPE_CHANGED')]
compiled=compile(ast.Module(body=selected,type_ignores=[]),'actual-generated-shared-payload-contract','exec')
def need(value,code):
 if not value:raise RuntimeError(code)
def run(value):
 scope={'p':value,'before':{'sha256':p['baselineSHA'],'files':593},'need':need,'entry':Path('/usr/local/libexec/jarvis-msf-main-acceptance-r26-repair'),'root':Path('/etc/jarvis-development/main-acceptance-r26-repair')};exec(compiled,scope)
 assert value['files']==593 and len(scope['payloads'])==3 and scope['payloads'] is value['installationFiles']
run(p)
bad=copy.deepcopy(p);bad['files']=bad['installationFiles']
try:run(bad);raise AssertionError('shared baseline count overwritten')
except RuntimeError as e:assert str(e)=='MAIN_REPAIR_MAIN_BASELINE_CHANGED'
for mutate in ['count','path','mode']:
 bad=copy.deepcopy(p)
 if mutate=='count':bad['installationFiles'].pop()
 elif mutate=='path':bad['installationFiles'][0]['path']='/arbitrary/entry'
 else:bad['installationFiles'][0]['mode']=0o600
 try:run(bad);raise AssertionError('installation payload weakened')
 except RuntimeError as e:assert str(e)=='REPAIR_INSTALL_PAYLOAD_SCOPE_CHANGED'
print(json.dumps({'checks':5,'actualGeneratedSharedContractExecuted':True,'remoteWrites':0}))
`;
 const r=spawnSync('python',['-c',code],{input:JSON.stringify({program:repairVerifierInstallProgram(),payload}),encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).checks,5);
});
test('installation errors are retained without private response bodies or automatic retry',()=>{
 const secret='API_503 PRIVATE_RESPONSE_SECRET cookie=SECRET privatejournal=SECRET';
 const r=safeInstallFailure(Error(secret),true);assert.equal(r.automaticRetry,false);assert.equal(r.productAccepted,false);assert.equal(r.installed,false);assert.match(r.installationState,/preserve/);assert.ok(!JSON.stringify(r).includes('SECRET'));
});
test('actual generated Python put refuses conflicts and races, retries identical bodies, and retains failed partial files',()=>{
 const code=String.raw`
import ast,sys,json,stat
from types import SimpleNamespace
tree=ast.parse(sys.stdin.read());put=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='put')
files={};fds={};events=[];nextfd=1;race=False;short=False
class Q:
 def __init__(self,value):self.value=value
 @property
 def parent(self):return Q(self.value.rsplit('/',1)[0])
 def lstat(self):
  v=files[self.value];return SimpleNamespace(st_mode=stat.S_IFREG|v['mode'],st_nlink=v.get('links',1))
def need(v,c):
 if not v:raise RuntimeError(c)
def trusted(q):
 need(q.value.startswith('/fixed-new/'),'UNTRUSTED_PATH')
 if q.value in files:need(not files[q.value].get('symlink'),'UNTRUSTED_PATH')
def openfd(q,flags,mode=None):
 global nextfd
 if mode is not None:
  assert flags==1|2|4|8
  if race:files[q.value]={'body':b'racing owner','mode':mode}
  if q.value in files:raise FileExistsError('exclusive create refused')
  files[q.value]={'body':b'','mode':mode}
 events.append(('open',q.value));fd=nextfd;nextfd+=1;fds[fd]=q.value;return fd
def write(fd,data):
 if short:return 0
 piece=bytes(data[:2]);files[fds[fd]]['body']+=piece;return len(piece)
os=SimpleNamespace(O_WRONLY=1,O_CREAT=2,O_EXCL=4,O_NOFOLLOW=8,O_RDONLY=16,O_DIRECTORY=32,path=SimpleNamespace(lexists=lambda q:q.value in files),open=openfd,write=write,fsync=lambda fd:events.append(('sync',fds[fd])),fchmod=lambda fd,mode:files[fds[fd]].update(mode=mode),close=lambda fd:fds.pop(fd,None))
def private_read(q,limit):return files[q.value]['body']
scope={'trusted':trusted,'os':os,'need':need,'stat':stat,'private_read':private_read,'memoryview':memoryview}
exec(compile(ast.Module(body=[put],type_ignores=[]),'generated-put-only','exec'),scope);put=scope['put'];q=Q('/fixed-new/config/wrapper')
put(q,b'abcdef',0o755);assert files[q.value]['body']==b'abcdef' and files[q.value]['mode']==0o755
before=dict(files[q.value]);opens=len(events);put(q,b'abcdef',0o755);assert files[q.value]==before and len(events)==opens
try:put(q,b'changed',0o755);raise AssertionError('overwritten')
except RuntimeError as e:assert str(e)=='REPAIR_INSTALL_EXISTING_FILE_CONFLICT'
assert files[q.value]==before
files[q.value]['links']=2
try:put(q,b'abcdef',0o755);raise AssertionError('hardlink accepted')
except RuntimeError as e:assert str(e)=='REPAIR_INSTALL_EXISTING_FILE_CONFLICT'
files[q.value]['links']=1;files[q.value]['symlink']=True
try:put(q,b'abcdef',0o755);raise AssertionError('symlink accepted')
except RuntimeError as e:assert str(e)=='UNTRUSTED_PATH'
race=True;r=Q('/fixed-new/config/race')
try:put(r,b'new',0o600);raise AssertionError('race overwritten')
except FileExistsError:pass
assert files[r.value]['body']==b'racing owner'
race=False;short=True;r=Q('/fixed-new/config/partial')
try:put(r,b'new',0o600);raise AssertionError('short write accepted')
except RuntimeError as e:assert str(e)=='REPAIR_INSTALL_SHORT_WRITE'
assert r.value in files and files[r.value]['body']==b''
assert any(x[0]=='sync' for x in events)
print(json.dumps({'checks':7,'actualGeneratedPutExecuted':True,'actualRemoteInstalled':False}))
`;
 const r=spawnSync('python',['-c',code],{input:repairVerifierInstallProgram(),encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).actualGeneratedPutExecuted,true);
});
test('installer requires the specifically dispatched real native run and restored journal',()=>{
 assert.throws(()=>assertInstallJournal({}),/JOURNAL_SCOPE_INVALID/);
});
test('stored reader uses actual status/agent SQL columns and permits null validation without trusting JSON projections',()=>{
 const code=String.raw`
import sys,json,types,io,contextlib
program=sys.stdin.read();agent='11111111-1111-4111-8111-111111111111'
p={'runId':'5c8034046a05b0db89edebbb0e2c6876efb5882f','taskId':'580888fe-8edc-40a0-b6a3-46124d119870','workspace':'/home/superopen/All-Projects/msf-main-repair-r26/source','projectId':'70ec346f-6520-46ed-abed-22cac770a3e4','machineId':'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73','templateId':'msf-101-claude','nodeAgentId':agent}
record={'id':p['runId'],'taskId':p['taskId'],'objectId':p['taskId'],'projectId':p['projectId'],'machineId':p['machineId'],'workspace':p['workspace'],'executorId':p['templateId'],'scope':'personal','template':{'engine':'claude'},'result':{'source':'signed-agent','outcome':'success','exitCode':0,'validation':None}}
status='succeeded';agent_column=agent
class DB:
 def execute(self,sql,params):
  assert sql=='SELECT json,status,agent_id FROM execution_runs WHERE id=?' and params==(p['runId'],)
  return types.SimpleNamespace(fetchone=lambda:(json.dumps(record),status,agent_column))
 def close(self):pass
def connect(path,**options):
 assert '?mode=ro' in path and options['uri'] is True
 return DB()
sys.modules['sqlite3']=types.SimpleNamespace(connect=connect)
def run():
 out=io.StringIO()
 with contextlib.redirect_stdout(out):exec(compile(program,'stored-reader-mock','exec'),{'p':p})
 return json.loads(out.getvalue())
r=run();assert r['status']=='succeeded' and r['scope']['agentId']==agent and r['result']['validation'] is None
record['status']='running';record['agentId']='forged-json-agent';assert run()['scope']['agentId']==agent
for mutate,code in [('wrong-agent','REPAIR_INSTALL_STORED_RUN_SCOPE_CHANGED'),('running','REPAIR_INSTALL_STORED_NATIVE_NOT_TERMINAL'),('validation-object','REPAIR_INSTALL_STORED_NATIVE_NOT_TERMINAL')]:
 status='succeeded';agent_column=agent;record['result']['validation']=None
 if mutate=='wrong-agent':agent_column='different-column-agent'
 elif mutate=='running':status='running'
 else:record['result']['validation']={'exitCode':0}
 try:run();raise AssertionError('invalid stored result accepted')
 except RuntimeError as e:assert str(e)==code
status='round-limit';agent_column=agent;record['result']={'source':'signed-agent','outcome':'round-limit','exitCode':0,'validation':None}
try:run();raise AssertionError('partial allowed by default')
except RuntimeError as e:assert str(e)=='REPAIR_INSTALL_STORED_NATIVE_NOT_TERMINAL'
p['allowPartialTerminal']=True;assert run()['status']=='round-limit'
for mutate in ['failed','cancelled','nonzero','late']:
 status='round-limit';record['result']={'source':'signed-agent','outcome':'round-limit','exitCode':0,'validation':None}
 if mutate in ['failed','cancelled']:status=mutate;record['result']['outcome']=mutate
 elif mutate=='nonzero':record['result']['exitCode']=1
 else:record['result']['lateEvidenceOnly']=True
 try:run();raise AssertionError('invalid partial result accepted')
 except RuntimeError as e:assert str(e)=='REPAIR_INSTALL_STORED_NATIVE_NOT_TERMINAL'
print(json.dumps({'checks':11,'actualStoredReaderExecuted':True,'remoteReads':0}))
`;
 const r=spawnSync('python',['-c',code],{input:storedNativeReadProgram,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).actualStoredReaderExecuted,true);
});

test('injected actual API/stored-row/host flow covers inspect, explicit install and independent post-read failures',async()=>{
 const source=await readFile(new URL('./install-factory-repair-verifier-r26.mjs',import.meta.url),'utf8');
 const code=String.raw`
import vm from 'node:vm';import * as fs from 'node:fs/promises';import * as path from 'node:path';import * as url from 'node:url';import * as crypto from 'node:crypto';
import * as driver from './scripts/run-factory-main-repair-r26.mjs';import * as prepare from './scripts/prepare-factory-repair-verifier-r26.mjs';
let source='';for await(const chunk of process.stdin)source+=chunk;
const {repairScope:S,sha,nativeRepairTemplate}=driver,{verifierScope:V,fixedToolSHA}=prepare;
const time='2026-10-12T00:00:00.000Z',now=()=>Date.parse(time),clone=structuredClone;
const baseline={schemaVersion:1,kind:'project-autonomy-test-baseline',workspace:'/home/superopen/All-Projects/msf-jarvis-autonomy-r22',requiredTestFiles:Array.from({length:45},(_,i)=>'fixture'+i),requiredPrototypeSuites:Array.from({length:30},(_,i)=>'suite'+i),minimumCoverage:{lines:90,branches:80}};
const policy={workspace:baseline.workspace,expectedChecks:['fixture'],imageIds:{node:'fixture'}};
const baselineBytes=Buffer.from(JSON.stringify(baseline)),policyBytes=Buffer.from(JSON.stringify(policy));
// Test-only module substitution uses synthetic policy bytes. Production constants and raw-byte gates remain fixed.
const mockedPrepare={...prepare,verifierScope:{...V,oldBaselineSHA:sha(baselineBytes),oldPolicySHA:sha(policyBytes)},prepareRepairVerifier:(e,original,b,p,opts)=>{
 const binding=prepare.assertRepairBinding(e,opts),config=prepare.cloneFixedConfiguration(JSON.parse(b),JSON.parse(p),binding),wrapper=prepare.renderRepairWrapper(original,binding.candidateFingerprint);return {wrapper,config,manifest:{wrapperSHA256:sha(wrapper)}};
}};
const filename=path.resolve('scripts/install-factory-repair-verifier-r26.mjs'),context=vm.createContext({Buffer,URL,Date,structuredClone,process:{argv:['node','fixture'],exitCode:0},console});
const definitions={'node:fs/promises':fs,'node:path':path,'node:url':url,'node:crypto':crypto,'./managed-server-client.mjs':{withPlatform:()=>{throw Error('UNEXPECTED_REMOTE');},remote:()=>{throw Error('UNEXPECTED_REMOTE');},primary:()=>{throw Error('UNEXPECTED_REMOTE');},lanProfile:'fixture',python:()=>{throw Error('UNEXPECTED_REMOTE');}},'./run-factory-supervision-probe.mjs':{nodeState:()=>{throw Error('UNEXPECTED_REMOTE');},queueState:()=>{throw Error('UNEXPECTED_REMOTE');}},'./run-factory-main-repair-r26.mjs':driver,'./prepare-factory-repair-verifier-r26.mjs':mockedPrepare};
const module=new vm.SourceTextModule(source,{context,identifier:url.pathToFileURL(filename).href,initializeImportMeta:meta=>meta.url=url.pathToFileURL(filename).href});
await module.link(name=>{const value=definitions[name];if(!value)throw Error('UNEXPECTED_IMPORT');return new vm.SyntheticModule(Object.keys(value),function(){for(const [key,item] of Object.entries(value))this.setExport(key,item);},{context});});await module.evaluate();const install=module.namespace.installRepairVerifier;
function fixture(){
 const taskId='580888fe-8edc-40a0-b6a3-46124d119870',command='43567b5e-79af-4025-80ab-7fc077d213b3',runId=sha('server-admin:'+command).slice(0,40),agent='11111111-1111-4111-8111-111111111111';
 const originalTemplate={id:S.templateId,machineId:S.machineId,engine:'claude',program:'/fixture/native',args:[],workspaceRoot:'/home/superopen/All-Projects',maxRounds:3,timeoutSec:100,leaseSec:60,budgetCurrency:'USD'},template=nativeRepairTemplate(originalTemplate);
 const sourceState={sha256:S.baselineSHA,files:S.files,bytes:100,metadataSHA:'b'.repeat(64),stable:true,identity:{device:1,inode:11}},identity={device:1,inode:22},candidate={sha256:'c'.repeat(64),files:595,bytes:110,metadataSHA:'d'.repeat(64),stable:true,identity};
 const taskPayload={title:'fixture repair',projectId:S.projectId,machineId:S.machineId,agent:S.templateId,mode:'managed',worktree:S.workspace,budget:1,retryLimit:0,skillIds:[],goal:'fixture repair',criteria:'fixed independent validation later'},profile={goalSpecHash:S.goalSHA,config:{costPolicy:'record-only'}};
 const j={version:2,scope:S,job:'a'.repeat(32),nodeAgentId:agent,initialProfileSHA:sha(profile),originalTemplate,originalTemplateSHA:sha(originalTemplate),template,templateSHA:sha(template),baseline:{version:'r26-4',runId:'f'.repeat(40),reportSHA:'e'.repeat(64),resultSHA:'f'.repeat(64)},cleanupProof:{path:'artifacts/software-factory/acceptance-r26/main-independent-cleanup-r26-4-1791763200000-22222222-2222-4222-8222-222222222222.json',sha256:'e'.repeat(64)},diagnosis:{sha256:'f'.repeat(64),runId:'f'.repeat(40),sourceFiles:[]},phase:'restored',restored:true,started:true,dispatchAttemptedAt:time,taskId,runId,taskPayload,copy:{originBound:true,candidate:{sha256:S.baselineSHA,files:S.files,identity}},sourceBefore:sourceState,sourceAfter:clone(sourceState),intents:{start:{commandId:command,scope:'personal',expectedVersion:1,payload:{taskId}}}};
 const task={id:taskId,ownerId:S.ownerId,scope:'personal',...taskPayload,executionRequest:{id:runId}},run={id:runId,domain:'tasks',kind:'development',scope:'personal',objectId:taskId,taskId,projectId:S.projectId,machineId:S.machineId,executorId:S.templateId,workspace:S.workspace,agentId:agent,goal:task.goal,criteria:task.criteria,maxRounds:1,timeoutSec:template.timeoutSec,budgetUSD:1,template,status:'succeeded',result:{source:'signed-agent',outcome:'success',exitCode:0,validation:null,usage:{totalTokens:123}}};
 const immutable={baseline:V.oldBaselineSHA,policy:V.oldPolicySHA,wrapper:V.templateSHA,receipt:V.receiptSHA,'old-report':'1'.repeat(64)};
 const host={observedAt:time,helperVerified:true,source:sourceState,candidate,candidateBefore:clone(candidate),candidateAfter:clone(candidate),originBound:true,origin:{rootOwned:true,sha256:'a'.repeat(64),version:1,phase:'ready',job:j.job,workspace:S.workspace,parent:S.parent,baselineSHA:S.baselineSHA,identity,parentIdentity:{device:1,inode:21}},quiet:{active:true,children:[],counts:{runs:0,deliveries:0,logs:0}},tools:clone(fixedToolSHA),toolsAfter:clone(fixedToolSHA),oldBaselineSHA:V.oldBaselineSHA,oldPolicySHA:V.oldPolicySHA,oldWrapperSHA:V.templateSHA,receiptSHA:V.receiptSHA,immutableBefore:immutable,immutableAfter:clone(immutable),coordinatorPatch:{version:'r26-4-summary-scan',originalSHA256:fixedToolSHA['project-autonomy-fa01-coordinator.py']},mutationsPerformed:false,rawLogsExported:false};
 const state={j,task,run,profile,host,central:originalTemplate,node:{agentId:agent,template:originalTemplate,unit:{ActiveState:'active',MainPID:'123'}},queue:{observedAt:time,allActive:0,fullTable:true,readOnly:true},installs:0,apis:[],hostReads:0,storedMutation:null,preinstallMutation:null,postinstallMutation:null};
 const d={now,readLocal:async path=>path===S.journalPath?JSON.stringify(state.j):fs.readFile('scripts/factory-main-acceptance-wrapper-r26-4.py'),api:async path=>{state.apis.push(path);return {data:path.startsWith('/api/v1/tasks/')?state.task:path.startsWith('/api/v1/execution/runs/')?state.run:path==='/api/v1/execution/config'?{templates:[state.central]}:path.endsWith('/autonomy')?state.profile:{supervised:false,stopped:false}};},nodeState:async()=>state.node,queueState:async()=>state.queue,readPrimary:async(p,program)=>{const stored={observedAt:time,status:state.run.status,scope:Object.fromEntries(['id','taskId','objectId','projectId','machineId','workspace','executorId','agentId','scope'].map(k=>[k,state.run[k]])),result:clone(state.run.result),frozenTemplate:clone(template),storedRecordSHA256:'a'.repeat(64),ingestedSignedAgentReceipt:true};state.storedMutation?.(stored);return stored;},readRoot:async(p,program)=>{
 if(program.includes('rootTrustedRead'))return {baseline:{sha256:sha(baselineBytes),base64:baselineBytes.toString('base64')},policy:{sha256:sha(policyBytes),base64:policyBytes.toString('base64')},rootTrustedRead:true};
 state.hostReads++;if(state.hostReads===2)state.preinstallMutation?.(state.host);if(state.hostReads===3)state.postinstallMutation?.(state.host);return clone(state.host);
 },installRoot:async(p,program)=>{state.installs++;if(p.files!==593||p.installationFiles?.length!==3||p.workspace!==S.workspace||p.binding.candidateFingerprint!=='c'.repeat(64)||p.installationFiles[0].path!==V.entry||p.installationFiles.some(f=>!f.path.includes('r26-repair'))||p.installationFiles.some(f=>sha(Buffer.from(f.body,'base64'))!==f.sha256))throw Error('BAD_STATIC_PAYLOAD');if(!program.includes('O_EXCL')||!program.includes('visudo')||(p.binding.partialNative&&p.allowPartialTerminal!==true))throw Error('BAD_INSTALL_PROGRAM');return {installed:true,partialNative:p.binding.partialNative,nativeStatus:p.binding.nativeStatus,nativeOutcome:p.binding.nativeOutcome,entry:V.entry,configRoot:V.configRoot,evidenceRoot:V.evidenceRoot,sudoRule:V.sudoRule,wrapperSHA256:p.installationFiles[0].sha256,sourceFingerprint:p.binding.candidateFingerprint,sourceMetadataSHA256:p.binding.candidateMetadataSHA256,originSHA256:p.binding.originSHA256,oldFilesUnchanged:true,mainSourceUnchanged:true,nodeACKIdle:true,nodeTemplateRestored:true,visudoVerified:true,productAccepted:false};}};return {state,d};
}
const outcomes=[];
async function pass(name,execute=false){const {state,d}=fixture(),r=await install({execute},d);if(r.installed!==execute||r.productAccepted!==false||state.installs!==(execute?1:0)||!state.apis.includes('/api/v1/tasks/'+state.j.taskId))throw Error(name);outcomes.push(name);}
await pass('read-only inspect does not install');await pass('explicit install binds actual candidate and performs independent post-read',true);
async function reject(name,mutate,pattern,{post=false,allowPartialTerminal=false}={}){const {state,d}=fixture();mutate(state);try{await install({execute:true,allowPartialTerminal},d);throw Error('UNEXPECTED_PASS '+name);}catch(error){if(!pattern.test(error.message))throw error;}if(!post&&state.installs!==0)throw Error('MUTATED_BEFORE_GATES '+name);outcomes.push(name);}
await reject('native running',s=>{s.run.status='running';},/NATIVE_TERMINAL/);
await reject('native unrestored',s=>{s.j.restored=false;},/NATIVE_NOT_RESTORED/);
await reject('unsigned native',s=>{s.run.result.source='model';},/NATIVE_TERMINAL/);
await reject('API task substituted',s=>{s.task.worktree=S.source;},/TASK_SCOPE_CHANGED/);
await reject('frozen stored template changed',s=>{s.storedMutation=v=>v.frozenTemplate.maxRounds=2;},/STORED_NATIVE_BINDING/);
await reject('stored result changed',s=>{s.storedMutation=v=>v.result.summary='substituted';},/STORED_NATIVE_BINDING/);
await reject('restored node differs from central',s=>{s.node={...s.node,template:clone(s.j.template)};},/RESTORE_UNCONFIRMED/);
await reject('active queue',s=>{s.queue.allActive=1;},/QUEUE_NOT_ACK_IDLE/);
await reject('unacknowledged delivery',s=>{s.host.quiet.counts.deliveries=1;},/QUEUE_NOT_ACK_IDLE/);
await reject('wrong root origin',s=>{s.host.origin.rootOwned=false;},/CANDIDATE_ORIGIN/);
await reject('old report mutation',s=>{s.host.immutableAfter['old-report']='e'.repeat(64);},/OLD_FILES_CHANGED/);
await reject('candidate changes between inspections',s=>{s.preinstallMutation=h=>{h.candidate={...h.candidate,sha256:'e'.repeat(64)};h.candidateBefore=clone(h.candidate);h.candidateAfter=clone(h.candidate);};},/PREINSTALL_EVIDENCE_CHANGED/);
await reject('candidate changes after root put',s=>{s.postinstallMutation=h=>{h.candidate={...h.candidate,sha256:'e'.repeat(64)};h.candidateBefore=clone(h.candidate);h.candidateAfter=clone(h.candidate);};},/POSTINSTALL_EVIDENCE_CHANGED/,{post:true});
function partial(s){s.run.status='round-limit';s.run.result.outcome='round-limit';}
await reject('partial terminal rejected by default',partial,/NATIVE_TERMINAL/);
for(const execute of [false,true]){const {state,d}=fixture();partial(state);const r=await install({execute,allowPartialTerminal:true},d);if(r.partialNative!==true||r.nativeStatus!=='round-limit'||r.nativeOutcome!=='round-limit'||r.binding.partialNative!==true||r.productAccepted!==false||r.installed!==execute)throw Error('PARTIAL_OPTIN_BINDING_MISSING');outcomes.push('partial explicit opt-in '+(execute?'install':'inspect'));}
for(const status of ['failed','cancelled'])await reject('partial opt-in rejects '+status,s=>{partial(s);s.run.status=status;s.run.result.outcome=status;},/NATIVE_TERMINAL/,{allowPartialTerminal:true});
await reject('partial opt-in rejects nonzero',s=>{partial(s);s.run.result.exitCode=1;},/NATIVE_TERMINAL/,{allowPartialTerminal:true});
await reject('partial opt-in rejects late result',s=>{partial(s);s.run.result.lateEvidenceOnly=true;},/NATIVE_TERMINAL/,{allowPartialTerminal:true});
await reject('partial opt-in rejects stopped result',s=>{partial(s);s.run.stopRequested=true;},/NATIVE_TERMINAL/,{allowPartialTerminal:true});
console.log(JSON.stringify({checks:outcomes,total:outcomes.length,realRemoteCalls:0,actualInstalled:false,modelsInvoked:false}));
`;
 const r=spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',code],{input:source,encoding:'utf8',windowsHide:true,cwd:new URL('..',import.meta.url)});assert.equal(r.status,0,r.stderr);const report=JSON.parse(r.stdout);assert.equal(report.total,23);assert.equal(report.realRemoteCalls,0);assert.equal(report.actualInstalled,false);
});
