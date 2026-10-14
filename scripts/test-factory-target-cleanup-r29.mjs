/** Local VM/AST fixtures only. No platform/SSH/model/Docker dependencies are called. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {canonical,sha,repairHostProgram} from './run-factory-main-repair-r26.mjs';
import {targetCopyR29Scope as S} from './prepare-factory-target-copy-r29.mjs';
import {targetRepairR29Template,targetRepairR29Payload,targetRepairR29StoredRunProgram} from './run-factory-target-repair-r29.mjs';
import {expectedRunId} from './verify-software-factory-execution.mjs';
import {settleEvidenceReads} from './factory-repair-evidence-read-r26.mjs';
const source=await readFile('scripts/verify-factory-target-cleanup-r29.mjs','utf8'),qactual=JSON.parse(await readFile('.jarvis-dev/maintenance/factory-target-repair-r29.json','utf8')),copyactual=JSON.parse(await readFile('.jarvis-dev/maintenance/factory-target-copy-r29.json','utf8')),manifestRaw=await readFile('artifacts/software-factory/acceptance-r28/verifier-installation-9e678be1-c0cb-433d-9e80-726f1f6d4ed7.json','utf8'),clone=v=>JSON.parse(JSON.stringify(v));
const profile={config:{costPolicy:'record-only'},fixture:'controlled-public-profile'},profileHash='367749621fe0cb5aa4f0c441a9524463042f8d33d2d863d960eaae366fef12b9',forbidden=()=>{throw Error('UNEXPECTED_REAL_DEPENDENCY')};
const body=source.slice(0,source.indexOf('if(process.argv[1]')).replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
const context={S,canonical,sha:v=>canonical(v)===canonical(profile)?profileHash:sha(v),repairHostProgram,targetRepairR29Template,targetRepairR29Payload,targetRepairR29StoredRunProgram,expectedRunId,settleEvidenceReads,Date,defaultReadRoot:forbidden,defaultReadPrimary:forbidden,nodeState:forbidden,queueState:forbidden,readInstalledR28Host:forbidden,verifyR28InstalledManifest:forbidden,safeReadLocal:forbidden,withPlatform:forbidden};
const F=vm.runInNewContext(body+';({targetCleanupR29Scope,parseTargetCleanupR29Arguments,assertTargetCleanupR29Context,verifyFactoryTargetCleanupR29,targetCleanupR29HostProgram,targetCleanupR29Failure})',context,{timeout:1000}),C=F.targetCleanupR29Scope;
const now=Date.parse('2026-10-12T16:00:00.000Z');
function harness(edit={}){
 const q=clone(qactual),copy=clone(copyactual);edit.q?.(q);edit.copy?.(copy);
 const state={profile:clone(profile),global:{supervised:false,stopped:false},config:{templates:[clone(q.template),...Array.from({length:27},(_,i)=>({id:'fixture-'+i}))]},node:{agentId:S.agentId,template:clone(q.template),unit:{ActiveState:'active',MainPID:'700'}},queue:{readOnly:true,fullTable:true,allActive:0},project:{id:S.projectId,ownerId:'server-admin',scope:'personal',status:'active',copies:[{machineId:S.machineId,path:S.workspace,environment:'development',branch:'snapshot:9b07a511-r29'}]}};
 q.otherTemplatesSHA=sha(state.config.templates.slice(1));edit.state?.(state,q);
 const task={id:q.taskId,ownerId:'server-admin',scope:'personal',...clone(q.payload),executionRequest:{id:q.runId}},run={id:q.runId,taskId:q.taskId,objectId:q.taskId,projectId:S.projectId,machineId:S.machineId,workspace:S.workspace,executorId:S.templateId,scope:'personal',domain:'tasks',kind:'development',goal:q.payload.goal,criteria:q.payload.criteria,maxRounds:1,timeoutSec:1800,budgetUSD:1,status:'failed',agentId:S.agentId,result:{source:'signed-agent',outcome:'round-limit',exitCode:0,summary:'PRIVATE_MODEL_BODY'}};
 edit.task?.(task);edit.run?.(run);
 const node={pid:700,ppid:1,startTicks:'1000',boot:'328726a0-5495-4892-b0a6-2fa9de26242e',procDevice:1,procInode:7,uid:1000,state:'S',cwdSHA256:sha('/safe'),exeSHA256:sha('/usr/bin/node'),argvSHA256:sha('safe-node'),active:true,cgroup:'/system.slice/jarvis-software-factory-development.service'},ack={counts:{runs:0,deliveries:0,logs:0},identity:{device:1,inode:99}},scan={node,ack,allDescendants:[],unitCgroupOtherProcesses:[],workspaceRelatedProcesses:[],relatedProcesses:[],fullProcScan:true,pidfdSupported:true,processesScanned:100,listedPIDs:Array.from({length:100},(_,i)=>700+i),inspectedPIDs:Array.from({length:100},(_,i)=>700+i),exitedDuringScan:[],counts:{listed:100,inspected:100,pidfdProvenExits:0,incomplete:0},readIncompletePIDs:[]};
 const host={observedAt:new Date(now).toISOString(),job:q.copyJob,taskId:q.taskId,runId:q.runId,workspace:S.workspace,helperVerified:true,originSHA256:C.originSHA256,originBound:true,source:clone(q.sourceBefore),candidate:{...clone(q.candidateBefore),sha256:'c'.repeat(64),metadataSHA:'d'.repeat(64),files:610},beforeAfterStable:true,node,nodeACK:ack,procScope:{fullProcScan:true,includesAllDescendants:true,includesUnitCgroupOrphans:true,includesWorkspaceCwdExeArgvFD:true,persistentMainPIDExcluded:700,twoScans:true},scans:[clone(scan),clone(scan)],workspaceSockets:{filesystem:[],procNetUnix:[],nofollow:true,entriesScanned:1000},nativeProcessAndSocketCleanupVerified:true,mutationsPerformed:false,signalsSent:false,resourcesRemoved:false,dockerQueried:false,rawLogsExported:false,privateEnvironmentExported:false,rawArgvExported:false};edit.host?.(host);for(const s of host.scans){const exited=s.exitedDuringScan.map(e=>e.pid);s.listedPIDs=[...new Set([...s.listedPIDs,...s.readIncompletePIDs,...exited])].sort((a,b)=>a-b);s.inspectedPIDs=s.inspectedPIDs.filter(p=>!s.readIncompletePIDs.includes(p)&&!exited.includes(p));s.processesScanned=s.listedPIDs.length;s.counts={listed:s.listedPIDs.length,inspected:s.inspectedPIDs.length,pidfdProvenExits:exited.length,incomplete:s.readIncompletePIDs.length};}
 let runCalls=0,stateCalls=0,rootCalls=0,inventoryCalls=0,contextReads=0;
 const qraw=JSON.stringify(q),copyraw=JSON.stringify(copy),deps={now:()=>now,readLocal:async path=>{if(path===C.journalPath){contextReads++;return edit.changedJournal&&contextReads>1?qraw+' ':qraw}if(path===C.copyJournalPath)return copyraw;if(path===C.installedManifestPath)return manifestRaw;throw Error('unexpected fixture path')},verifyInstalledManifest:async()=>true,api:async path=>{if(path.includes('/execution/runs/')){runCalls++;const r=clone(run);if(runCalls>1)edit.secondRun?.(r);return {data:r}}if(path.includes('/tasks/'))return {data:clone(task)};if(path.endsWith('/autonomy')){stateCalls++;return {data:clone(state.profile)}}if(path.endsWith('/supervision'))return {data:clone(state.global)};if(path.endsWith('/config'))return {data:clone(state.config)};if(path.endsWith(S.projectId))return {data:clone(state.project)};throw Error('unexpected fixture API')},nodeState:async()=>clone(state.node),queueState:async()=>clone(state.queue),readPrimary:async (p,program)=>{assert.equal(Object.keys(p.expected).length,15);assert.ok(program.includes("'goal','criteria','maxRounds','timeoutSec','budgetUSD'"));assert.ok(!program.includes("v.get('status')==row[1]"));const r=clone(run);if(runCalls>1)edit.secondRun?.(r);const s={readOnly:true,status:r.status,result:r.result??null,agentId:r.agentId??null,frozenTemplateSHA256:q.templateSHA,storedRecordSHA256:'e'.repeat(64)};edit.stored?.(s);return s},readRoot:async (p,program)=>{rootCalls++;assert.equal(p.runId,q.runId);assert.equal(p.job,q.copyJob);assert.ok(program.includes('includesUnitCgroupOrphans'));return clone(host)},readInstalledHost:async()=>{inventoryCalls++;const i=clone(q.protectedInventory);if(inventoryCalls>1)edit.secondInventory?.(i);return {...i,nodeTemplates:{otherTemplatesSHA256:i.otherNodeTemplatesSHA256}}}};
 return {q,host,invoke:()=>F.verifyFactoryTargetCleanupR29({},deps),counts:()=>({runCalls,stateCalls,rootCalls,inventoryCalls})};
}
test('import and exported program creation are inert',async()=>{const mod=await import('./verify-factory-target-cleanup-r29.mjs');assert.equal(typeof mod.verifyFactoryTargetCleanupR29,'function');assert.ok(mod.targetCleanupR29HostProgram().includes("sys.dont_write_bytecode=True"));});
test('exact argument scope',()=>{assert.deepEqual(JSON.parse(JSON.stringify(F.parseTargetCleanupR29Arguments([]))),{});assert.throws(()=>F.parseTargetCleanupR29Arguments(['--execute']));assert.throws(()=>F.parseTargetCleanupR29Arguments(['--run-id='+'a'.repeat(40),'--run-id='+'a'.repeat(40)]));});
test('signed stable terminal with real candidate change returns bound safe proof',async()=>{const h=harness(),r=await h.invoke();assert.equal(r.ready,true);assert.equal(r.candidate.sha256,'c'.repeat(64));assert.equal(r.cleanupIndependentlyVerified,true);assert.equal(r.terminal.readerCryptographicallyReverified,false);assert.equal(r.protectedInventorySHA256,sha(h.q.protectedInventory));assert.ok(!JSON.stringify(r).includes('PRIVATE_MODEL_BODY'));assert.ok(!JSON.stringify(r).includes('--print'));assert.equal(h.counts().rootCalls,1);assert.equal(h.counts().runCalls,2);});
for(const status of ['queued','running'])test(status+' never invokes host/inventory/platform census',async()=>{const h=harness({run:r=>{r.status=status;r.agentId=null;r.result=null}}),r=await h.invoke();assert.equal(r.ready,false);assert.equal(r.reason,'RUN_NOT_TERMINAL');assert.deepEqual(h.counts(),{runCalls:1,stateCalls:0,rootCalls:0,inventoryCalls:0});});
for(const [name,mutate] of [['unsigned',r=>r.result.source='local'],['late',r=>r.result.lateEvidenceOnly=true],['stop-requested',r=>r.stopRequested=true]])test(name+' terminal refuses before host',async()=>{const h=harness({run:mutate}),r=await h.invoke();assert.equal(r.ready,false);assert.equal(h.counts().rootCalls,0);});
for(const [name,change] of [['goal',r=>r.goal+='changed'],['criteria',r=>r.criteria+='changed'],['budget',r=>r.budgetUSD=2],['timeout',r=>r.timeoutSec=1],['agent',r=>r.agentId='foreign'],['task',r=>r.taskId='foreign']])test('frozen '+name+' mismatch refuses',async()=>{await assert.rejects(harness({run:change}).invoke(),/R29_CLEANUP_RUN_SCOPE_CHANGED/);});
test('SQL agent/template mismatch refuses',async()=>{await assert.rejects(harness({stored:s=>s.agentId=null}).invoke(),/SQL_RUN_CHANGED/);await assert.rejects(harness({stored:s=>s.frozenTemplateSHA256='0'.repeat(64)}).invoke(),/SQL_RUN_CHANGED/);});
test('foreign journal/copy job and changed candidate identity refuse before reads',async()=>{for(const q of [v=>v.scope.workspace+='foreign',v=>v.copyJob='b'.repeat(32),v=>v.candidateBefore.identity.inode++])await assert.rejects(harness({q}).invoke(),/R29_CLEANUP_/);});
test('terminal result/full stored state readback cannot drift',async()=>{await assert.rejects(harness({secondRun:r=>r.result.summary='changed'}).invoke(),/TERMINAL_READ_CHANGED/);});
test('private journal and original inventory cannot drift',async()=>{await assert.rejects(harness({changedJournal:true}).invoke(),/PRIVATE_CONTEXT_READ_CHANGED/);await assert.rejects(harness({secondInventory:i=>i.source.metadataSHA='0'.repeat(64)}).invoke(),/PLATFORM_OR_INVENTORY_READ_CHANGED/);});
test('original or partial restoration template states are read-only auditable',async()=>{for(const mode of ['both','central','node']){const h=harness({state:(s,q)=>{if(mode!=='node')s.config.templates[0]=clone(q.originalTemplate);if(mode!=='central')s.node.template=clone(q.originalTemplate)}});assert.equal((await h.invoke()).ready,true);}});
test('full active queue refuses',async()=>{await assert.rejects(harness({state:s=>s.queue.allActive=1}).invoke(),/FULL_QUEUE_NOT_IDLE/);});
function kernelExit(h){return {pid:750,boot:h.node.boot,listedProcIdentity:{device:24,inode:75000},processIdentity:{pid:750,boot:h.node.boot,procDevice:24,procInode:75000,startTicks:'123',ppid:1},kernelProof:{type:'pidfd-POLLIN',attached:true,identityBound:true,requestedPID:750,exitConfirmed:true,pollEvents:1,procPathAbsent:true}};}
test('closed kernel pidfd exit evidence preserves complete full-scan accounting',async()=>{const h=harness({host:v=>v.scans.forEach(s=>s.exitedDuringScan=[kernelExit(v)])}),r=await h.invoke();assert.equal(r.ready,true);assert.equal(r.nativeHost.scans[0].counts.pidfdProvenExits,1);assert.equal(r.nativeHost.scans[0].counts.inspected,99);assert.equal(r.nativeHost.scans[0].counts.listed,100);});
test('pidfd proof alive/present/unknown event/binding and incomplete count cannot be forged',async()=>{for(const mutate of [e=>e.kernelProof.exitConfirmed=false,e=>e.kernelProof.procPathAbsent=false,e=>e.kernelProof.pollEvents=9,e=>e.kernelProof.pollEvents=32,e=>e.kernelProof.requestedPID=751,e=>e.processIdentity.procInode++,e=>e.processIdentity.startTicks='unknown'])await assert.rejects(harness({host:v=>{const e=kernelExit(v);mutate(e);v.scans[0].exitedDuringScan=[e]}}).invoke(),/PIDFD_EXIT_PROOF_INVALID/);for(const mutate of [v=>v.scans[0].listedPIDs.push(9999),v=>v.scans[0].inspectedPIDs.push(701),v=>v.scans[0].pidfdSupported=false])await assert.rejects(harness({host:mutate}).invoke(),/R29_CLEANUP_/);});
test('unbound or missing process identity cannot certify kernel exit',async()=>{for(const mutate of [e=>e.kernelProof.identityBound=false,e=>e.processIdentity=null])await assert.rejects(harness({host:v=>{const e=kernelExit(v);mutate(e);v.scans[0].exitedDuringScan=[e]}}).invoke(),/PIDFD_EXIT_PROOF_INVALID/);});
for(const [name,mutate] of [['descendant',h=>{h.scans[0].allDescendants=[701];h.scans[0].relatedProcesses=[{pid:701}]}],['orphan-cgroup',h=>{h.scans[1].unitCgroupOtherProcesses=[702];h.scans[1].relatedProcesses=[{pid:702}]}],['workspace',h=>{h.scans[1].workspaceRelatedProcesses=[703];h.scans[1].relatedProcesses=[{pid:703}]}],['read-failure',h=>h.scans[0].readIncompletePIDs=[999]],['socket',h=>h.workspaceSockets.filesystem=[{inode:1,pathSHA256:sha('a')}]],['abstract-socket',h=>h.workspaceSockets.procNetUnix=[{inode:'1',pathSHA256:sha('a')}]],['ack',h=>{h.nodeACK.counts.logs=1;h.scans.forEach(s=>s.ack.counts.logs=1)}]])test(name+' cannot be complete',async()=>{const h=harness({host:v=>{mutate(v);v.nativeProcessAndSocketCleanupVerified=false}}),r=await h.invoke();assert.equal(r.ready,false);assert.equal(r.cleanupIndependentlyVerified,false);});
test('forged flag, PIDstart, boot and stale host reject',async()=>{for(const mutate of [h=>h.scans[0].readIncompletePIDs=[999],h=>h.scans[0].node.startTicks='900',h=>h.node.boot='foreign',h=>h.observedAt='2026-10-12T15:00:00Z'])await assert.rejects(harness({host:mutate}).invoke(),/R29_CLEANUP_/);});
test('failure receipts contain only a closed safe error code',()=>{const r=F.targetCleanupR29Failure(Error('API_400 PRIVATE_TEMPLATE PRIVATE_BODY PRIVATE_JOURNAL'));assert.equal(r.errorCode,'R29_CLEANUP_OBSERVATION_FAILED');assert.ok(!JSON.stringify(r).includes('PRIVATE_'));});
test('actual read-only SQL binds fifteen frozen fields and trusts status column rather than stale JSON status',()=>{
 const q=qactual,expected={id:q.runId,taskId:q.taskId,objectId:q.taskId,projectId:S.projectId,machineId:S.machineId,workspace:S.workspace,executorId:S.templateId,scope:'personal',domain:'tasks',kind:'development',goal:q.payload.goal,criteria:q.payload.criteria,maxRounds:1,timeoutSec:1800,budgetUSD:1};
 const py=String.raw`import sqlite3,json,sys,types,copy,contextlib,io
v=json.load(sys.stdin);original=sqlite3.connect
def run(row,agent):
 c=original(':memory:');c.execute('CREATE TABLE execution_runs(id TEXT,json TEXT,status TEXT,agent_id TEXT)');c.execute('INSERT INTO execution_runs VALUES(?,?,?,?)',(v['expected']['id'],json.dumps(row),'failed',agent));c.commit()
 def connect(path,**kwargs):
  assert path=='file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro' and kwargs.get('uri') is True;return c
 sqlite3.connect=connect
 try:
  out=io.StringIO()
  with contextlib.redirect_stdout(out):exec(v['program'],{'p':dict(runId=v['expected']['id'],expected=v['expected'],nodeAgentId=v['agent'])})
  return json.loads(out.getvalue())
 finally:sqlite3.connect=original
row={**v['expected'],'status':'queued','template':v['template'],'result':dict(source='signed-agent',outcome='round-limit',exitCode=0)}
r=run(row,v['agent']);assert r['status']=='failed' and r['result']==row['result'] and r['agentId']==v['agent'] and r['readOnly'] is True
for key in v['expected']:
 bad=copy.deepcopy(row);bad[key]=None
 try:run(bad,v['agent']);raise AssertionError('accepted '+key)
 except RuntimeError as e:assert str(e)=='REPAIR_ACCEPTANCE_STORED_RUN_SCOPE_CHANGED'
try:run(row,'foreign-agent');raise AssertionError('accepted foreign agent')
except RuntimeError as e:assert str(e)=='REPAIR_ACCEPTANCE_STORED_RUN_AGENT_CHANGED'
bad=copy.deepcopy(row);bad['template']['validation']={'program':'foreign'}
try:run(bad,v['agent']);raise AssertionError('accepted validation')
except RuntimeError as e:assert str(e)=='R29_TASK_SQL_PURPOSE_OR_VALIDATION_CHANGED'
print(json.dumps(dict(actualSQLiteCases=18,staleJSONStatusAcceptedWithAuthoritativeColumn=True,primaryAccess=False)))
`;
 const r=spawnSync('python',['-c',py],{input:JSON.stringify({program:targetRepairR29StoredRunProgram(),expected,agent:S.agentId,template:q.template}),encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).actualSQLiteCases,18);
});
test('actual process_record AST checks cwd/exe/argv/FD, inode and read errors without native process IO',()=>{
 const py=String.raw`import ast,json,sys,types,re,hashlib
v=json.load(sys.stdin);tree=ast.parse(v['program']);names={'in_workspace','argv_workspace','process_record','digest'};nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
def need(x,c):
 if not x:raise RuntimeError(c)
class FakePath:
 def __init__(self,path):self.path=path
 def __truediv__(self,n):return FakePath(self.path+'/'+n)
class OS:
 O_RDONLY=0;O_DIRECTORY=1;O_NOFOLLOW=2
 def __init__(self):self.pos={};self.fd=20;self.data={};self.swap=False;self.fail=False;self.scandirActive=False;self.fdClose=False;self.startSwap=False;self.statReads=0
 def open(self,name,flags,dir_fd=None):
  if self.fail and name=='cmdline':raise PermissionError('controlled')
  self.fd+=1;f=self.fd;self.pos[f]=0
  if name=='stat':
   self.statReads+=1;fields=['S','1']+['0']*18;fields[19]='999' if self.startSwap and self.statReads%2==0 else '123';self.data[f]=('701 (safe) '+' '.join(fields)).encode()
  elif name=='cmdline':self.data[f]=('node\0--cwd='+v['workspace']+'\0').encode()
  elif name=='cgroup':self.data[f]=b'0::/system.slice/node.service\n'
  return f
 def fstat(self,fd):return types.SimpleNamespace(st_dev=1,st_ino=701,st_uid=1000)
 def stat(self,path,follow_symlinks=False):return types.SimpleNamespace(st_ino=702 if self.swap else 701)
 def close(self,fd):pass
 def read(self,fd,n):
  b=self.data[fd][self.pos[fd]:self.pos[fd]+n];self.pos[fd]+=len(b);return b
 def readlink(self,name,dir_fd=None):
  if name=='1':
   assert self.scandirActive,'iterator duplicate closed before readlink'
   if self.fdClose:raise FileNotFoundError('controlled fd close')
   return v['workspace']+'/open (deleted)'
  return '/usr/bin/node' if name=='exe' else v['workspace']
 def scandir(self,fd):
  owner=self
  class Entries:
   def __enter__(self):owner.scandirActive=True;return self
   def __iter__(self):return iter([types.SimpleNamespace(name='1')])
   def __exit__(self,*args):owner.scandirActive=False
  return Entries()
os=OS();env=dict(p=dict(workspace=v['workspace']),Path=FakePath,os=os,need=need,re=re,hashlib=hashlib);exec(compile(ast.fix_missing_locations(ast.Module(body=nodes,type_ignores=[])),'<actual-record>','exec'),env)
r=env['process_record'](701,v['boot']);assert r['workspaceRelated'] and r['startTicks']=='123' and r['pid']==701 and r['procInode']==701 and r['uid']==1000 and r['boot']==v['boot']
assert len(r['cwdSHA256'])==64 and len(r['exeSHA256'])==64 and len(r['argvSHA256'])==64
os.swap=True
try:env['process_record'](701,v['boot']);raise AssertionError('inode swap passed')
except RuntimeError as e:assert str(e)=='R29_CLEANUP_PROCESS_IDENTITY_CHANGED'
os.swap=False;os.fail=True
try:env['process_record'](701,v['boot']);raise AssertionError('read failure passed')
except PermissionError:pass
os.fail=False;os.fdClose=True
try:env['process_record'](701,v['boot']);raise AssertionError('closed FD accepted')
except FileNotFoundError:pass
os.fdClose=False;os.startSwap=True;os.statReads=0
try:env['process_record'](701,v['boot']);raise AssertionError('startTicks swap accepted')
except RuntimeError as e:assert str(e)=='R29_CLEANUP_PROCESS_IDENTITY_CHANGED'
print(json.dumps(dict(actualProcessRecordCases=5,heldScandirDuplicateLifetime=True,nativeProcessIO=False)))
`;
 const r=spawnSync('python',['-c',py],{input:JSON.stringify({program:F.targetCleanupR29HostProgram(),workspace:S.workspace,boot:'328726a0-5495-4892-b0a6-2fa9de26242e'}),encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).actualProcessRecordCases,5);
});
test('actual Python AST/census/guard: descendants, orphan cgroup, workspace argv/FD and read failure',()=>{
 const program=F.targetCleanupR29HostProgram();
 const py=String.raw`import ast,json,sys,types,copy,re,hashlib
v=json.load(sys.stdin);tree=ast.parse(v['program']);names={'in_workspace','argv_workspace','internal_link','pidfd_poll','pidfd_exit_proof','census'}
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
def need(x,c):
 if not x:raise RuntimeError(c)
p={**v['scope'],'job':'a'*32,'runId':'b'*40,'taskId':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','originSHA256':v['originSHA'],'parentIdentity':v['parent'],'workspaceIdentity':v['workspace']}
import posixpath,errno
env={'p':p,'re':re,'need':need,'posixpath':posixpath,'errno':errno};exec(compile(ast.fix_missing_locations(ast.Module(body=nodes,type_ignores=[])),'<actual-census>','exec'),env)
unit='/system.slice/jarvis-software-factory-development.service';boot='328726a0-5495-4892-b0a6-2fa9de26242e'
def record(pid,ppid=1,cgroups=[],workspace=False):return dict(pid=pid,ppid=ppid,startTicks=str(pid),boot=boot,procDevice=1,procInode=pid,uid=1000,state='S',cwdSHA256='a'*64,exeSHA256='b'*64,argvSHA256='c'*64,cgroups=cgroups,workspaceRelated=workspace)
records={700:record(700,cgroups=[unit]),701:record(701,700),702:record(702,701),703:record(703,cgroups=[unit+'/detached']),704:record(704,workspace=True),705:record(705)}
class FakePath:
 def __init__(self,path):self.path=path
 def read_text(self):return boot
class FakeOS:
 O_RDONLY=0;O_DIRECTORY=1;O_NOFOLLOW=2
 def __init__(self):self.missing=set();self.attachFail=set();self.closed=[];self.masks={};self.swap=set()
 def open(self,*args):return 10
 def fstat(self,fd):return types.SimpleNamespace(st_dev=1)
 def close(self,fd):self.closed.append(fd)
 def pidfd_open(self,pid,flags):
  if pid in self.attachFail:raise ProcessLookupError(errno.ESRCH,'controlled attach before exit')
  return pid+10000
 def stat(self,path,follow_symlinks=False):
  pid=int(path.rsplit('/',1)[1])
  if pid in self.missing:raise FileNotFoundError(errno.ENOENT,'controlled absent PID')
  return types.SimpleNamespace(st_dev=1,st_ino=99999 if pid in self.swap else pid)
 def scandir(self,fd):
  class Entries:
   def __enter__(self):return self
   def __iter__(self):return iter([types.SimpleNamespace(name=str(pid),inode=lambda pid=pid:pid) for pid in records])
   def __exit__(self,*args):pass
  return Entries()
os=FakeOS()
class FakeSelect:
 POLLIN=1;POLLHUP=16;POLLERR=8;POLLNVAL=32
 def poll(self):
  class Poll:
   def register(self,fd,mask):self.fd=fd
   def poll(self,timeout):return [(self.fd,os.masks[self.fd])] if os.masks.get(self.fd) else []
  return Poll()
def observe(pid,boot,a):
 value=copy.deepcopy(records[pid]);a['observedIdentity']={k:value[k] for k in ['pid','ppid','boot','startTicks','procDevice','procInode']};return value
env.update(os=os,select=FakeSelect(),account=types.SimpleNamespace(pw_uid=1000),Path=FakePath,unit_state=lambda:dict(pid=700,cgroup=unit),process_record=observe,ack_state=lambda:dict(counts=dict(runs=0,deliveries=0,logs=0),identity=dict(device=1,inode=99)))
c=env['census']();assert c['allDescendants']==[701,702] and c['unitCgroupOtherProcesses']==[703] and c['workspaceRelatedProcesses']==[704] and len(c['relatedProcesses'])==4 and 700 not in [r['pid'] for r in c['relatedProcesses']]
assert c['counts']==dict(listed=6,inspected=6,pidfdProvenExits=0,incomplete=0) and len(os.closed)==7
def failed(pid,boot,a):
 if pid==705:raise PermissionError('controlled failure')
 return observe(pid,boot,a)
env['process_record']=failed;c=env['census']();assert c['readIncompletePIDs']==[705]
def gone(pid,boot,a):
 if pid==705:raise ProcessLookupError(errno.ESRCH,'controlled unknown PID')
 return observe(pid,boot,a)
env['process_record']=gone;c=env['census']();assert c['readIncompletePIDs']==[705]
def exit_read(pid,boot,a):
 if pid==705:os.missing.add(pid);os.masks[a['fd']]=1;raise ProcessLookupError(errno.ESRCH,'controlled post-binding exit')
 return observe(pid,boot,a)
os.missing=set();os.masks={};env['process_record']=exit_read;c=env['census']();assert c['readIncompletePIDs']==[] and [e['pid'] for e in c['exitedDuringScan']]==[705] and c['counts']==dict(listed=6,inspected=5,pidfdProvenExits=1,incomplete=0) and c['exitedDuringScan'][0]['processIdentity']['procInode']==705
os.missing=set();os.masks={10705:1};env['process_record']=gone;c=env['census']();assert c['readIncompletePIDs']==[705] and not c['exitedDuringScan']
os.missing=set();os.masks={10705:8};c=env['census']();assert c['readIncompletePIDs']==[705]
os.masks={10705:32};c=env['census']();assert c['readIncompletePIDs']==[705]
os.masks={10705:9};c=env['census']();assert c['readIncompletePIDs']==[705]
os.missing=set();os.masks={10705:1};env['process_record']=failed;c=env['census']();assert c['readIncompletePIDs']==[705] and not c['exitedDuringScan']
os.missing=set();os.masks={};os.attachFail={705};env['process_record']=observe;c=env['census']();assert c['readIncompletePIDs']==[705] and c['counts']['incomplete']==1
os.attachFail=set();os.masks={10705:1};c=env['census']();assert c['readIncompletePIDs']==[705] and 705 not in c['inspectedPIDs']
def exit_success(pid,boot,a):
 value=observe(pid,boot,a)
 if pid==705:os.missing.add(pid);os.masks[a['fd']]=1
 return value
os.missing=set();os.masks={};env['process_record']=exit_success;c=env['census']();assert c['counts']['pidfdProvenExits']==1 and c['exitedDuringScan'][0]['processIdentity']['startTicks']=='705'
os.missing={705};os.masks={10705:1};env['process_record']=observe;c=env['census']();assert c['readIncompletePIDs']==[705] and not c['exitedDuringScan']
unbound={'fd':10705,'requestedPID':705,'boot':boot,'listedProcIdentity':{'device':1,'inode':705},'observedIdentity':None,'identityBound':False};refused=False
try:env['pidfd_exit_proof'](705,unbound,boot)
except RuntimeError as e:refused=str(e)=='R29_CLEANUP_PIDFD_IDENTITY_UNBOUND'
assert refused
os.missing=set();os.masks={};os.swap={705};c=env['census']();assert c['readIncompletePIDs']==[705]
os.swap=set();env['process_record']=lambda pid,boot,a:record(pid);assert_false=False
try:env['census']()
except RuntimeError as e:assert_false=str(e)=='R29_CLEANUP_NODE_CGROUP_CHANGED'
assert assert_false
env['os']=types.SimpleNamespace();unsupported=False
try:env['census']()
except RuntimeError as e:unsupported=str(e)=='R29_CLEANUP_PIDFD_UNSUPPORTED'
assert unsupported;env['os']=os
for a,expected in [(p['workspace'],True),('--cwd='+p['workspace'],True),('sh -c '+p['workspace']+'/run.sh',True),(p['workspace']+'-foreign/a',False),('/other'+p['workspace'],False)]:assert env['argv_workspace'](a)==expected,(a,expected)
assert env['in_workspace'](p['workspace']+'/open-file (deleted)') and not env['in_workspace'](p['workspace']+'-foreign')
assert env['internal_link']('node_modules/.pnpm/pkg/node_modules/dep','../../../../.pnpm/dep')
assert env['internal_link']('node_modules/pkg','../.pnpm/pkg')
assert not env['internal_link']('node_modules/pkg','../../outside') and not env['internal_link']('a','/outside')
guard=[n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='expected_scope' for t in n.targets)]
guard+=[n for n in tree.body if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='need' and len(n.value.args)>1 and isinstance(n.value.args[1],ast.Constant) and n.value.args[1].value=='R29_CLEANUP_NATIVE_SCOPE_CHANGED']
code=compile(ast.fix_missing_locations(ast.Module(body=guard,type_ignores=[])),'<actual-guard>','exec')
def accepts(q,uid=0):
 try:exec(code,dict(p=q,json=json,re=re,need=need,os=types.SimpleNamespace(geteuid=lambda:uid)));return True
 except RuntimeError:return False
assert accepts(p) and not accepts(p,1000)
for k in p:
 bad=copy.deepcopy(p);bad[k]=None;assert not accepts(bad),k
assert v['program'].index('R29_CLEANUP_NATIVE_SCOPE_CHANGED')<v['program'].index('tool=Path(')
assert not any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr in ('kill','unlink','remove','rmdir','chmod','chown','fchown','replace','mkdir','write','write_bytes','write_text') for n in ast.walk(tree))
print(json.dumps(dict(pythonASTValid=True,actualCensusCases=15,actualArgvCases=5,actualNativeGuardRejectCases=len(p)+1,noMutationCalls=True,filesystemAccess=False)))
`;
 const r=spawnSync('python',['-c',py],{input:JSON.stringify({program,scope:S,originSHA:C.originSHA256,parent:C.parentIdentity,workspace:C.workspaceIdentity}),encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);assert.equal(result.pythonASTValid,true);
});
