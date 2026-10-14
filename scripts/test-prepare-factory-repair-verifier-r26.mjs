import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {repairScope as S,nativeRepairTemplate,sha} from './run-factory-main-repair-r26.mjs';
import {verifierScope as V,fixedToolSHA,assertRepairBinding,renderRepairWrapper,repairVerifierHostReadProgram,readRepairVerifierHost,localMain,cloneFixedConfiguration} from './prepare-factory-repair-verifier-r26.mjs';
const time='2026-10-12T00:00:00.000Z', options={now:Date.parse(time)}, clone=structuredClone;
const original=await readFile(new URL('./factory-main-acceptance-wrapper-r26-4.py',import.meta.url));
function fixture(){
 const agent='11111111-1111-4111-8111-111111111111',taskId='test-task',command='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const runId=sha('server-admin:'+command).slice(0,40),identity={device:1,inode:22};
 const originalTemplate={id:S.templateId,machineId:S.machineId,engine:'claude',program:'/fixture/native',args:[],workspaceRoot:'/home/superopen/All-Projects',maxRounds:3,timeoutSec:100,leaseSec:60,budgetCurrency:'USD'};
 const template=nativeRepairTemplate(originalTemplate);
 const source={sha256:S.baselineSHA,files:S.files,bytes:100,metadataSHA:'b'.repeat(64),stable:true,identity:{device:1,inode:11}};
 const candidate={sha256:'c'.repeat(64),files:595,bytes:110,metadataSHA:'d'.repeat(64),stable:true,identity};
 const payload={title:'test fixture repair',projectId:S.projectId,machineId:S.machineId,agent:S.templateId,mode:'managed',worktree:S.workspace,budget:1,retryLimit:0,skillIds:[],goal:'fixture repair',criteria:'independent validation later'};
 const j={version:2,scope:S,job:'a'.repeat(32),nodeAgentId:agent,initialProfileSHA:'e'.repeat(64),originalTemplate,originalTemplateSHA:sha(originalTemplate),template,templateSHA:sha(template),baseline:{version:'r26-4',runId:'f'.repeat(40),reportSHA:'e'.repeat(64),resultSHA:'f'.repeat(64)},cleanupProof:{path:'artifacts/software-factory/acceptance-r26/main-independent-cleanup-r26-4-1791763200000-22222222-2222-4222-8222-222222222222.json',sha256:'e'.repeat(64)},diagnosis:{sha256:'f'.repeat(64),runId:'f'.repeat(40),sourceFiles:[]},phase:'restored',restored:true,started:true,dispatchAttemptedAt:time,taskId,runId,taskPayload:payload,copy:{originBound:true,candidate:{sha256:S.baselineSHA,files:S.files,identity}},sourceBefore:source,sourceAfter:clone(source),intents:{start:{commandId:command,scope:'personal',expectedVersion:1,payload:{taskId}}}};
 const task={id:taskId,ownerId:S.ownerId,scope:'personal',...payload,executionRequest:{id:runId}};
 const run={id:runId,domain:'tasks',kind:'development',scope:'personal',objectId:taskId,taskId,projectId:S.projectId,machineId:S.machineId,executorId:S.templateId,workspace:S.workspace,agentId:agent,goal:payload.goal,criteria:payload.criteria,maxRounds:1,timeoutSec:template.timeoutSec,budgetUSD:1,template,status:'succeeded',result:{source:'signed-agent',outcome:'success',exitCode:0,usage:{totalTokens:123}}};
 const immutable={baseline:V.oldBaselineSHA,policy:V.oldPolicySHA,wrapper:V.templateSHA,receipt:V.receiptSHA,'old-report':'1'.repeat(64)};
 return {schemaVersion:1,kind:'software-factory-repair-verifier-input',observedAt:time,journal:j,task,run,terminalRead:{observedAt:time,ingestedSignedAgentReceipt:true,runRecordSHA256:sha(run),resultSHA256:sha(run.result),frozenRunTemplateSHA256:j.templateSHA},central:clone(originalTemplate),node:{agentId:agent,template:clone(originalTemplate),unit:{ActiveState:'active',MainPID:'123'}},queue:{observedAt:time,allActive:0,fullTable:true,readOnly:true},host:{observedAt:time,helperVerified:true,source,candidate,candidateBefore:clone(candidate),candidateAfter:clone(candidate),originBound:true,origin:{rootOwned:true,sha256:'a'.repeat(64),version:1,phase:'ready',job:j.job,workspace:S.workspace,parent:S.parent,baselineSHA:S.baselineSHA,identity,parentIdentity:{device:1,inode:21}},quiet:{active:true,children:[],counts:{runs:0,deliveries:0,logs:0}},tools:clone(fixedToolSHA),toolsAfter:clone(fixedToolSHA),oldBaselineSHA:V.oldBaselineSHA,oldPolicySHA:V.oldPolicySHA,oldWrapperSHA:V.templateSHA,receiptSHA:V.receiptSHA,immutableBefore:immutable,immutableAfter:clone(immutable),coordinatorPatch:{version:'r26-4-summary-scan',originalSHA256:fixedToolSHA['project-autonomy-fa01-coordinator.py']},mutationsPerformed:false,rawLogsExported:false}};
}
function rejectMutation(mutator,regex){const e=fixture();mutator(e);assert.throws(()=>assertRepairBinding(e,options),regex);}
test('real bound native terminal only prepares independent validation, never acceptance',()=>{const b=assertRepairBinding(fixture(),options);assert.equal(b.productAccepted,false);assert.equal(b.modelExecutionOnly,true);assert.equal(b.candidateFingerprint,'c'.repeat(64));});

test('native runner success outcome differs from stored succeeded status',async()=>{
 const runner=await readFile(new URL('../apps/api/src/runtime/agent-runner.ts',import.meta.url),'utf8');
 assert.match(runner,/exitCode===0&&!parsed\.failure\?'success':'failed'/);
 assert.match(runner,/outcome==='success'\?'succeeded':outcome/);
 rejectMutation(e=>e.run.result.outcome='succeeded',/NATIVE_TERMINAL_REQUIRED/);
 assert.equal(assertRepairBinding(fixture(),options).modelExecutionOnly,true);
});

test('central storage normalizes omitted native validation to null',async()=>{
 const runtime=await readFile(new URL('../apps/api/src/runtime/execution-runtime.ts',import.meta.url),'utf8');
 assert.match(runtime,/validation:body\.validation\?\?null/);
 const e=fixture();e.run.result.validation=null;e.terminalRead.runRecordSHA256=sha(e.run);e.terminalRead.resultSHA256=sha(e.run.result);
 assert.equal(assertRepairBinding(e,options).modelExecutionOnly,true);
 rejectMutation(v=>v.run.result.validation={exitCode:0},/EXECUTION_ONLY_REQUIRED/);
});
test('public execution receipt is insufficient without the private bound journal and stored run',()=>{assert.throws(()=>assertRepairBinding({schemaVersion:1,kind:'software-factory-repair-verifier-input',modelExecutionOnly:true,productAccepted:false},options));});
test('partial candidate opt-in permits only this real signed round-limit lineage and never acceptance',()=>{
 function partial(){const e=fixture(),task='580888fe-8edc-40a0-b6a3-46124d119870',run='5c8034046a05b0db89edebbb0e2c6876efb5882f';e.journal.taskId=task;e.journal.runId=run;e.journal.intents.start.commandId='43567b5e-79af-4025-80ab-7fc077d213b3';e.journal.intents.start.payload.taskId=task;e.task.id=task;e.task.executionRequest.id=run;e.run.id=run;e.run.taskId=task;e.run.objectId=task;e.run.status='round-limit';e.run.result.outcome='round-limit';e.run.result.validation=null;e.terminalRead.runRecordSHA256=sha(e.run);e.terminalRead.resultSHA256=sha(e.run.result);return e;}
 assert.throws(()=>assertRepairBinding(partial(),options),/NATIVE_TERMINAL_REQUIRED/);
 const bound=assertRepairBinding(partial(),{...options,allowPartialTerminal:true});assert.equal(bound.partialNative,true);assert.equal(bound.nativeStatus,'round-limit');assert.equal(bound.nativeOutcome,'round-limit');assert.equal(bound.productAccepted,false);
 for(const change of [e=>{e.run.status='failed';e.run.result.outcome='failed';},e=>{e.run.status='cancelled';e.run.result.outcome='cancelled';},e=>e.run.result.exitCode=1,e=>e.run.result.lateEvidenceOnly=true,e=>e.run.stopRequested=true,e=>e.run.result.source='model']){const e=partial();change(e);assert.throws(()=>assertRepairBinding(e,{...options,allowPartialTerminal:true}),/NATIVE_TERMINAL_REQUIRED/);}
 const other=fixture();other.run.status='round-limit';other.run.result.outcome='round-limit';assert.throws(()=>assertRepairBinding(other,{...options,allowPartialTerminal:true}),/NATIVE_TERMINAL_REQUIRED/);
});
test('wrong source journal or task/run workspace is rejected',()=>{
 rejectMutation(e=>e.journal.scope={...S,workspace:S.source},/JOURNAL_SCOPE_INVALID/);
 rejectMutation(e=>e.run.workspace=S.source,/ACTUAL_RUN_CHANGED/);
 rejectMutation(e=>e.task.worktree='/fixture/model-path',/TASK_SCOPE_CHANGED/);
});
test('model success cannot supply validation or substitute an unsigned or late result',()=>{
 for(const mutation of [e=>e.run.result.source='model',e=>e.run.status='failed',e=>e.run.result.exitCode=1,e=>e.run.result.lateEvidenceOnly=true])rejectMutation(mutation,/NATIVE_TERMINAL_REQUIRED/);
 rejectMutation(e=>e.run.result.validation={status:'pass'},/EXECUTION_ONLY_REQUIRED/);
 rejectMutation(e=>e.terminalRead.resultSHA256='a'.repeat(64),/RESULT_BINDING_CHANGED/);
 rejectMutation(e=>e.terminalRead.frozenRunTemplateSHA256='a'.repeat(64),/RESULT_BINDING_CHANGED/);
});
test('original main requires exact metadata and before/after identity equality',()=>{
 rejectMutation(e=>e.host.source.sha256='a'.repeat(64),/ORIGINAL_MAIN_CHANGED/);
 rejectMutation(e=>e.journal.sourceAfter.metadataSHA='a'.repeat(64),/ORIGINAL_MAIN_CHANGED/);
});
test('origin must be root owned and bind native job, candidate inode and independent path',()=>{
 for(const mutate of [e=>e.host.origin.rootOwned=false,e=>e.host.origin.job='b'.repeat(32),e=>e.host.origin.workspace=S.source,e=>e.host.origin.identity={device:1,inode:999},e=>e.host.origin.sha256=''])rejectMutation(mutate,/CANDIDATE_ORIGIN_CHANGED/);
});
test('actual candidate fingerprint is required; baseline or moving source cannot be blessed',()=>{
 rejectMutation(e=>e.host.candidate.sha256=S.baselineSHA,/ACTUAL_CANDIDATE_REQUIRED/);
 rejectMutation(e=>e.host.candidate.sha256='model self report',/ACTUAL_CANDIDATE_REQUIRED/);
 rejectMutation(e=>e.host.candidateAfter.metadataSHA='a'.repeat(64),/ACTUAL_CANDIDATE_REQUIRED/);
});
test('old policies, six tools, coordinator original SHA and existing reports remain immutable',()=>{
 rejectMutation(e=>e.host.tools['project-autonomy-fa01-collector.mjs']='a'.repeat(64),/OLD_FILES_CHANGED/);
 rejectMutation(e=>e.host.oldPolicySHA='a'.repeat(64),/OLD_FILES_CHANGED/);
 rejectMutation(e=>e.host.immutableAfter['old-report']='a'.repeat(64),/OLD_FILES_CHANGED/);
 rejectMutation(e=>e.host.coordinatorPatch.originalSHA256='a'.repeat(64),/PATCH_BINDING_CHANGED/);
});
test('restoration, central/node equality and zero unacknowledged deliveries are mandatory',()=>{
 rejectMutation(e=>e.journal.restored=false,/NATIVE_NOT_RESTORED/);
 rejectMutation(e=>e.central=clone(e.journal.template),/RESTORE_UNCONFIRMED/);
 rejectMutation(e=>e.queue.allActive=1,/QUEUE_NOT_ACK_IDLE/);
 rejectMutation(e=>e.host.quiet.counts.deliveries=1,/QUEUE_NOT_ACK_IDLE/);
 rejectMutation(e=>e.host.quiet.children=[999],/QUEUE_NOT_ACK_IDLE/);
 rejectMutation(e=>e.observedAt='2026-10-11T00:00:00Z',/OBSERVATION_STALE/);
});
test('wrapper has only a new static namespace and FP, keeps all original strict guards',()=>{
 const output=renderRepairWrapper(original,'c'.repeat(64));
 assert.match(output,new RegExp("WORKSPACE = '"+S.workspace+"'"));
 assert.match(output,/SOURCE_SHA256 = 'c{64}'/);assert.ok(!output.includes("'/usr/local/libexec/jarvis-msf-main-acceptance-r26-4'"));
 for(const [name,value] of Object.entries(fixedToolSHA))assert.ok(output.includes("'"+name+"': '"+value+"'"));
 for(const guard of ['MAIN_ACCEPTANCE_FIXED_ARGUMENTS_REQUIRED','MAIN_ACCEPTANCE_ORIGINAL_TESTS_REQUIRED','MAIN_ACCEPTANCE_ORIGINAL_SUITES_REQUIRED','MAIN_ACCEPTANCE_COVERAGE_FLOOR_REQUIRED','MAIN_ACCEPTANCE_SNAPSHOT_CHANGED','MAIN_ACCEPTANCE_SOURCE_CHANGED','MAIN_ACCEPTANCE_SOURCE_CHANGED_DURING_SNAPSHOT'])assert.ok(output.includes(guard));
 assert.throws(()=>renderRepairWrapper(Buffer.concat([original,Buffer.from(' ')]),'c'.repeat(64)),/TEMPLATE_HASH_CHANGED/);
 assert.throws(()=>renderRepairWrapper(original,S.baselineSHA),/ACTUAL_CANDIDATE_REQUIRED/);
 assert.throws(()=>renderRepairWrapper(original,"x'; arbitrary()"),/ACTUAL_CANDIDATE_REQUIRED/);
});
test('configuration clones retain fixed denominator and coverage fields without changing originals',()=>{
 const b={workspace:'/home/superopen/All-Projects/msf-jarvis-autonomy-r22',requiredTestFiles:Array.from({length:45},(_,i)=>'t'+i),requiredPrototypeSuites:Array.from({length:30},(_,i)=>'s'+i),minimumCoverage:{lines:90,branches:80},other:'keep'},p={workspace:b.workspace,expectedChecks:['keep'],imageIds:{node:'keep'}},before=clone({b,p});
 const c=cloneFixedConfiguration(b,p,assertRepairBinding(fixture(),options));assert.deepEqual({b,p},before);assert.deepEqual(c.baseline.requiredTestFiles,b.requiredTestFiles);assert.deepEqual(c.policy.expectedChecks,p.expectedChecks);assert.equal(c.policy.sourceFingerprint,'c'.repeat(64));
 for(const values of [{...b,requiredTestFiles:b.requiredTestFiles.slice(1)},{...b,minimumCoverage:{lines:89,branches:80}}])assert.throws(()=>cloneFixedConfiguration(values,p,{productAccepted:false,candidateFingerprint:'c'.repeat(64)}),/DENOMINATOR_CHANGED/);
});
test('host program parses, has no copy/install mutations, re-reads actual fingerprints and inventories',()=>{
 const program=repairVerifierHostReadProgram();
 const check=spawnSync('python',['-c',"import ast,sys,json; t=ast.parse(sys.stdin.read()); print(json.dumps([ast.unparse(n) for n in ast.walk(t) if isinstance(n,ast.Call)]))"],{input:program,encoding:'utf8',windowsHide:true});
 assert.equal(check.status,0,check.stderr);const calls=JSON.parse(check.stdout).join('\n');
 for(const mutate of ['os.mkdir(','os.rename(','os.fchown(','os.replace(','h.snapshot(','fcntl.flock('])assert.ok(!calls.includes(mutate),mutate);
 assert.match(calls,/source_state\(p\['workspace'\]\)/);assert.match(calls,/source_state\(p\['source'\]\)/);assert.match(calls,/private_read\(prep \/ 'origin.json'\)/);
 assert.ok(program.includes('immutable_before==immutable_after'));assert.ok(program.includes('candidate_before==candidate_after'));
});
test('actual report inventory scans only fixed root metadata/evidence, detects deletion and rejects untrusted report links',()=>{
 const code=String.raw`
import ast,sys,json,tempfile,os,stat,re,hashlib
from pathlib import Path
tree=ast.parse(sys.stdin.read());definitions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['report_file_sha','report_inventory']]
os.O_NOFOLLOW=getattr(os,'O_NOFOLLOW',0);os.O_NONBLOCK=getattr(os,'O_NONBLOCK',0)
with tempfile.TemporaryDirectory() as temp:
 root=Path(temp)/'reports';attempt=root/('a'*40)/('b'*32);evidence=attempt/'evidence';evidence.mkdir(parents=True)
 files_read=[];checked=[];untrusted=set()
 def need(v,c):
  if not v:raise RuntimeError(c)
 def trusted(q):
  q=Path(q);checked.append(str(q));need(not q.is_symlink() and str(q) not in untrusted,'MOCK_ROOT_OWNER_OR_LINK_UNTRUSTED');return q
 def private_read(q,limit):
  q=Path(q);trusted(q);s=q.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<=limit,'MOCK_ROOT_FILE_UNTRUSTED');files_read.append(str(q));return q.read_bytes()
 scope={'Path':Path,'os':os,'stat':stat,'re':re,'hashlib':hashlib,'trusted':trusted,'private_read':private_read,'need':need}
 exec(compile(ast.Module(body=definitions,type_ignores=[]),'generated-inventory-only','exec'),scope);inventory=scope['report_inventory']
 for name in ['source-before.json','cleanup.json','detailed-report.json','watchdog-cleanup.json','watchdog.log']:(attempt/name).write_bytes(b'root report')
 for name in ['postgres.env','minio.env','node.env','runtime.env']:(attempt/name).write_bytes(b'PRIVATE_ENV_SENTINEL')
 for name in ['source','work','snapshot','installed','install']:
  q=attempt/name/'node_modules';q.mkdir(parents=True);(q/'third-party.js').write_bytes(b'UNTRUSTED_THIRD_PARTY');untrusted.add(str(attempt/name));untrusted.add(str(q/'third-party.js'))
 screenshots=evidence/'screenshots';screenshots.mkdir();(screenshots/'desktop.png').write_bytes(b'PNG fixture');(evidence/'collector.json').write_bytes(b'first report');(evidence/'empty').mkdir()
 first=inventory(root)
 assert str(evidence/'collector.json') in first and str(screenshots/'desktop.png') in first and str(attempt/'watchdog-cleanup.json') in first and str(evidence/'empty')+'/' in first
 assert all('/node_modules/' not in q.replace('\\','/') and not q.endswith('.env') for q in files_read)
 assert not any(str(attempt/name) in checked for name in ['source','work','snapshot','installed','install'])
 (evidence/'collector.json').write_bytes(b'changed report');assert inventory(root)!=first
 (evidence/'collector.json').write_bytes(b'first report');assert inventory(root)==first
 (evidence/'collector.json').unlink();assert inventory(root)!=first;(evidence/'collector.json').write_bytes(b'first report')
 (evidence/'empty').rmdir();assert inventory(root)!=first;(evidence/'empty').mkdir()
 (evidence/'new-report.json').write_bytes(b'added');assert inventory(root)!=first;(evidence/'new-report.json').unlink()
 (attempt/'unexpected.json').write_bytes(b'unrecognized root metadata')
 try:inventory(root);raise AssertionError('unexpected metadata accepted')
 except RuntimeError as e:assert str(e)=='REPAIR_VERIFIER_REPORT_METADATA_SCOPE_INVALID'
 (attempt/'unexpected.json').unlink();untrusted.add(str(evidence/'collector.json'))
 try:inventory(root);raise AssertionError('non-root evidence accepted')
 except RuntimeError as e:assert str(e)=='MOCK_ROOT_OWNER_OR_LINK_UNTRUSTED'
 untrusted.clear();link=evidence/'linked-report.json'
 # Actual symlink behavior when supported by this local host; always verify the
 # same lstat branch by mapping just this one fixture to a symlink otherwise.
 actual_symlink=True
 try:os.symlink(attempt/'detailed-report.json',link)
 except OSError:
  actual_symlink=False;link.write_bytes(b'fallback fixture');real_lstat=Path.lstat
  def mapped_lstat(q,*args,**kwargs):
   if q==link:return type('LinkInfo',(),{'st_mode':stat.S_IFLNK})()
   return real_lstat(q,*args,**kwargs)
  Path.lstat=mapped_lstat
 try:
  try:inventory(root);raise AssertionError('report link accepted')
  except RuntimeError as e:assert str(e)=='REPAIR_VERIFIER_REPORT_SYMLINK_REJECTED'
 finally:
  if not actual_symlink:Path.lstat=real_lstat
  link.unlink()
 print(json.dumps({'actualDirectoryEnumeration':True,'symlinkCreated':actual_symlink,'checks':9,'privateEnvRead':False,'thirdPartyTreeRead':False,'remoteReads':0}))
`;
 const r=spawnSync('python',['-c',code],{input:repairVerifierHostReadProgram(),encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout);assert.equal(out.actualDirectoryEnumeration,true);assert.equal(out.thirdPartyTreeRead,false);
});
test('historical candidate package above 64MiB is fully streamed under the original 512MiB bound only at its exact artifact path',async()=>{
 const coordinator=await readFile(new URL('./project-autonomy-fa01-coordinator.py',import.meta.url),'utf8');assert.match(coordinator,/MAX_PACKAGE = 512 \* 1024 \* 1024/);
 const code=String.raw`
import ast,sys,tempfile,os,stat,re,hashlib,json
from pathlib import Path
os.O_NOFOLLOW=getattr(os,'O_NOFOLLOW',0);os.O_NONBLOCK=getattr(os,'O_NONBLOCK',0)
t=ast.parse(sys.stdin.read());definitions=[n for n in t.body if isinstance(n,ast.FunctionDef) and n.name in ['report_file_sha','report_inventory']]
def need(v,c):
 if not v:raise RuntimeError(c)
def trusted(q):
 q=Path(q);need(not q.is_symlink(),'SYMLINK');return q
real_read=os.read;requested=[]
def tracked_read(fd,size):requested.append(size);return real_read(fd,size)
os.read=tracked_read
scope={'Path':Path,'os':os,'stat':stat,'re':re,'hashlib':hashlib,'need':need,'trusted':trusted};exec(compile(ast.Module(body=definitions,type_ignores=[]),'generated-stream-inventory','exec'),scope)
with tempfile.TemporaryDirectory() as temp:
 root=Path(temp)/'reports';attempt=root/('a'*40)/('b'*32);evidence=attempt/'evidence';evidence.mkdir(parents=True);package=evidence/'candidate.tar.gz'
 with package.open('wb') as f:f.seek(64*1024*1024+4095);f.write(b'Z')
 (attempt/'infrastructure.log').write_bytes(b'')
 digest=hashlib.sha256()
 for _ in range(64):digest.update(bytes(1024*1024))
 digest.update(bytes(4095)+b'Z');expected=digest.hexdigest()
 inventory=scope['report_inventory'](root);assert inventory[str(package)]==expected and max(requested)<=1024*1024 and len(requested)>=65
 other=evidence/'oversized.json';package.rename(other)
 try:scope['report_inventory'](root);raise AssertionError('general report bound relaxed')
 except RuntimeError as e:assert str(e)=='REPAIR_VERIFIER_REPORT_FILE_LIMIT_INVALID'
 other.rename(package);nested=evidence/'nested';nested.mkdir();moved=nested/'candidate.tar.gz';package.rename(moved)
 try:scope['report_inventory'](root);raise AssertionError('nested artifact bound relaxed')
 except RuntimeError as e:assert str(e)=='REPAIR_VERIFIER_REPORT_FILE_LIMIT_INVALID'
 moved.rename(package)
 # A stable descriptor with changed reported size is also rejected after the read.
 real_fstat=os.fstat;calls=0
 def changed(fd):
  global calls
  calls+=1;s=real_fstat(fd)
  if calls==2:
   from types import SimpleNamespace
   return SimpleNamespace(**{k:getattr(s,k) for k in ['st_dev','st_ino','st_uid','st_gid','st_mode','st_nlink','st_mtime_ns','st_ctime_ns']},st_size=s.st_size+1)
  return s
 os.fstat=changed
 try:scope['report_file_sha'](package,512*1024*1024);raise AssertionError('changed descriptor accepted')
 except RuntimeError as e:assert str(e)=='REPAIR_VERIFIER_REPORT_FILE_CHANGED'
 finally:os.fstat=real_fstat
 print(json.dumps({'actualLargeArtifactStreamed':True,'maximumReadChunk':max(requested),'checks':5,'generalLimitPreserved':True,'contentsExported':False}))
`;
 const r=spawnSync('python',['-c',code],{input:repairVerifierHostReadProgram(),encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).generalLimitPreserved,true);
});
test('rendered Python executes snapshot guards and rejects weakened fixed config',async()=>{
 const coordinator=await readFile(new URL('./project-autonomy-fa01-coordinator.py',import.meta.url));
 const payload={wrapper:renderRepairWrapper(original,'c'.repeat(64)),coordinator:coordinator.toString('base64')};
 const code=String.raw`
import sys,json,base64
from types import SimpleNamespace
p=json.load(sys.stdin);w={'__name__':'fixture_only','__file__':'fixture_only'}
exec(compile(p['wrapper'],'fixture_only','exec'),w)
fp=w['SOURCE_SHA256'];coordinator=SimpleNamespace();helper=SimpleNamespace(snapshot=lambda a,b:{'sha256':fp})
w['load_python']=lambda name,body,path: coordinator if 'coordinator' in name else helper
bodies={'project-autonomy-fa01-coordinator.py':base64.b64decode(p['coordinator']),'project-autonomy-evidence.py':b'fixture'}
def scenario(values):
 helper.snapshot=lambda a,b:{'sha256':fp}
 values=iter(values);helper.fingerprint=lambda a:next(values)
 _,h=w['adapt_tools'](bodies,'a'*40)
 return h.snapshot(w['WORKSPACE'],w['ROOT']+'/'+'a'*40+'/'+'b'*32+'/snapshot')
assert scenario([{'sha256':fp},{'sha256':fp}])=={'sha256':fp}
for values,code in [([{'sha256':'d'*64}], 'MAIN_ACCEPTANCE_SOURCE_CHANGED'),([{'sha256':fp},{'sha256':'d'*64}], 'MAIN_ACCEPTANCE_SOURCE_CHANGED_DURING_SNAPSHOT')]:
 try:scenario(values);raise AssertionError('moving source accepted')
 except ValueError as e:assert str(e)==code
policy={'mode':'fa01-isolated-v1','workspace':w['WORKSPACE'],'workPackage':'FA-01','goalSpecHash':w['GOAL_HASH'],'evidenceRoot':w['ROOT'],'sourceFingerprint':fp,'expectedChecks':w['REQUIRED'],'imageIds':{k:'sha256:'+'e'*64 for k in ['node','postgres','redis','minio']}}
baseline={'schemaVersion':1,'kind':'project-autonomy-test-baseline','workspace':w['WORKSPACE'],'sourceFingerprintObserved':fp,'requiredTestFiles':list(w['ORIGINAL_TESTS']),'requiredPrototypeSuites':list(w['ORIGINAL_SUITES']),'minimumCoverage':{'lines':90,'branches':80}}
w['validate_config'](policy,baseline)
for key,value,code in [('requiredTestFiles',baseline['requiredTestFiles'][1:],'MAIN_ACCEPTANCE_ORIGINAL_TESTS_REQUIRED'),('requiredPrototypeSuites',baseline['requiredPrototypeSuites'][1:],'MAIN_ACCEPTANCE_ORIGINAL_SUITES_REQUIRED'),('minimumCoverage',{'lines':89,'branches':80},'MAIN_ACCEPTANCE_COVERAGE_FLOOR_REQUIRED')]:
 bad={**baseline,key:value}
 try:w['validate_config'](policy,bad);raise AssertionError('weakened config accepted')
 except ValueError as e:assert str(e)==code
print(json.dumps({'executed':True,'sourceBeforeAfterGuards':True,'denominatorAndCoverageGuards':True,'installed':False}))
`;
 const result=spawnSync('python',['-I','-c',code],{input:JSON.stringify(payload),encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).executed,true);
});
test('fixed remote read adapter receives static scope; arbitrary model path is not accepted',async()=>{
 let calls=0;const e=fixture();await readRepairVerifierHost(e.journal,async(p,program)=>{calls++;assert.equal(p.mode,'inspect');assert.equal(p.workspace,S.workspace);assert.equal(p.source,S.source);assert.deepEqual(p.fixedTools,fixedToolSHA);assert.ok(program.includes('mutationsPerformed'));return {};});assert.equal(calls,1);
 e.journal.scope={...S,workspace:'/fixture/untrusted'};await assert.rejects(readRepairVerifierHost(e.journal,async()=>{calls++;}),/JOURNAL_SCOPE_INVALID/);assert.equal(calls,1);
});
test('default inspect/prepare do no IO and execute explicitly reports installer unsupported',async()=>{
 const forbidden=async()=>{throw Error('UNEXPECTED_IO');};
 for(const action of ['inspect','prepare']){const r=await localMain([action],{read:forbidden,write:forbidden,mkdirLocal:forbidden});assert.equal(r.remoteReadsPerformed,false);assert.equal(r.installed,false);assert.equal(r.installerImplemented,false);}
 await assert.rejects(localMain(['execute'],{read:forbidden}),/INSTALLER_NOT_IMPLEMENTED/);
 await assert.rejects(localMain(['prepare','--execute'],{read:forbidden}),/INSTALLER_NOT_IMPLEMENTED/);
});
