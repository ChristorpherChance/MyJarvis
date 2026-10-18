import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deriveCurrentActivity,taskActivity} from '../src/runtime/project-workbench-activity.js';
import {ExecutionRuntime} from '../src/runtime/execution-runtime.js';
import {ProjectWorkbenchRuntime} from '../src/runtime/project-workbench-runtime.js';

const hash=(v:any)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fixture(){
 const task:any={id:'task',ownerId:'owner',scope:'personal',projectId:'project',machineId:'machine',worktree:'/fixture',agent:'cc',sessionId:'native',status:'running',executionStatus:'running',executionRequest:{id:'run'},updatedAt:'2026-10-18T14:00:00.000Z'};
 const run:any={id:'run',domain:'tasks',taskId:'task',objectId:'task',ownerId:'owner',scope:'personal',projectId:'project',machineId:'machine',workspace:'/fixture',executorId:'cc',sessionId:'native',status:'running',supervisor:{sessionId:'supervisor',goalRevision:2},createdAt:'2026-10-18T14:00:01.000Z',updatedAt:'2026-10-18T14:00:02.000Z',agentId:'agent'};
 const session:any={id:'supervisor',ownerId:'owner',scope:'personal',projectId:'project',taskId:'task',machineId:'machine',workspace:'/fixture',goalRevision:2,revision:8,runId:'run',status:'running',enabled:true};
 const event:any={eventId:'instruction',hash:'e'.repeat(64),kind:'instruction',sequence:1,taskId:'task',machineId:'machine',goalRevision:2,runId:'run',dispatchedRunId:'run',directive:'只核对已保存测试结果，不重跑',at:'2026-10-18T14:00:01.500Z'};
 const snapshot={session,events:[event]},logs:any[]=[];let reads=0;
 return {task,run,session,snapshot,logs,readCount:()=>reads,project:()=>deriveCurrentActivity('project','owner',snapshot,task,id=>id===run.id?run:null,()=>{reads++;return logs;})!};
}

test('currentActivity reads only the owned bound run and rejects foreign/mismatched lineage without reading logs',()=>{
 const f=fixture(),view=f.project();assert.equal(view.bindingVerified,true);assert.equal(view.runId,'run');assert.equal(view.taskId,'task');assert.equal(view.phase.id,'running');assert.equal(view.progress.percent,null);assert.equal(f.readCount(),1);
 for(const mutate of [(x:any)=>x.task.ownerId='other',(x:any)=>x.task.id='other',(x:any)=>x.run.projectId='other',(x:any)=>x.run.machineId='other',(x:any)=>x.run.workspace='/other',(x:any)=>x.run.executorId='other',(x:any)=>x.run.scope='private',(x:any)=>x.run.sessionId='other',(x:any)=>x.run.supervisor.sessionId='other',(x:any)=>x.run.supervisor.goalRevision=1]){const bad=fixture();mutate(bad);const result=bad.project();assert.equal(result.bindingVerified,false);assert.equal(result.runId,null);assert.equal(result.executionEventsURL,null);assert.equal(bad.readCount(),0);}
});

test('queued registration without a real run stays planned; actual queued/running and round-limit are distinct',()=>{
 const f=fixture();f.task.status='queued';f.task.executionStatus='queued';delete f.task.executionRequest;assert.equal(taskActivity(f.task,null).activityState,'planned');assert.equal(taskActivity(f.task,f.run).activityState,'planned');f.task.executionRequest={id:'run'};f.run.status='queued';assert.equal(taskActivity(f.task,f.run).activityState,'active');assert.match(taskActivity(f.task,f.run).activityLabel,/待领取/);assert.equal(f.project().phase.id,'queued');f.run.status='running';assert.match(taskActivity(f.task,f.run).activityLabel,/已领取/);f.run.status='round-limit';f.task.status='blocked';assert.equal(taskActivity(f.task,f.run).activityState,'attention');
});

test('live assistant text and tool descriptions are real redacted messages; thinking/prompt/argv do not enter timeline',()=>{
 const f=fixture();f.logs.push({id:1,at:'2026-10-18T14:00:03.000Z',channel:'stdout',text:JSON.stringify({type:'assistant',message:{content:[{type:'thinking',thinking:'HIDDEN_REASONING'},{type:'text',text:'正在核对两份既有报告。api_key=FAKE_PRIVATE_VALUE'},{type:'tool_use',name:'Read',input:{description:'核对保存的结果索引',command:'DO_NOT_SHOW_COMMAND',env:'DO_NOT_SHOW_ENV'}}]}})},{id:2,at:'2026-10-18T14:00:04.000Z',channel:'stdout',text:JSON.stringify({type:'user',message:{content:[{type:'text',text:'DO_NOT_SHOW_USER_PROMPT'}]}})},{id:3,at:'2026-10-18T14:00:05.000Z',channel:'stdout',text:'thinking: DO_NOT_SHOW_RAW_THOUGHT'},{id:4,at:'2026-10-18T14:00:06.000Z',channel:'stdout',text:'{"type":"assistant","message":'},{id:5,at:'2026-10-18T14:00:07.000Z',channel:'stdout',text:JSON.stringify({type:'user',message:{content:[{type:'tool_result',content:'DO_NOT_SHOW_TOOL_RESULT_BODY'}]}})});
 const value=f.project(),serialized=JSON.stringify(value);assert.ok(serialized.includes('正在核对两份既有报告'));assert.ok(serialized.includes('核对保存的结果索引'));for(const forbidden of ['HIDDEN_REASONING','FAKE_PRIVATE_VALUE','DO_NOT_SHOW_COMMAND','DO_NOT_SHOW_ENV','DO_NOT_SHOW_USER_PROMPT','DO_NOT_SHOW_RAW_THOUGHT','DO_NOT_SHOW_TOOL_RESULT_BODY'])assert.ok(!serialized.includes(forbidden));assert.equal(value.logCursor,5);assert.equal(value.updatedAt,'2026-10-18T14:00:07.000Z');assert.equal(value.ownerOnly,true);assert.equal(value.independentAcceptance,false);assert.ok(value.items.length<=12);assert.equal(value.items[0].role,'jarvis');assert.ok(value.items.every(x=>!!x.id));assert.equal(f.project().updatedAt,value.updatedAt);
});

test('terminal review cannot be overwritten by old running logs; unqualified achieved and pending stop remain attention',()=>{
 const f=fixture();f.run.status='succeeded';f.run.result={source:'signed-agent',outcome:'success',sessionId:'native',summary:'saved feedback'};f.session.status='achieved';f.session.enabled=false;f.session.consumedRunId='run';f.session.resultHash=hash(f.run.result);f.session.decisionId='model-run';f.snapshot.events.push({...f.snapshot.events[0],eventId:'review',kind:'review',sequence:3,resultHash:f.session.resultHash,decisionId:'model-run',decision:{action:'review',reason:'本轮标准满足'},at:'2026-10-18T14:00:04.000Z'});f.logs.push({id:1,at:'2026-10-18T14:00:03.000Z',channel:'stdout',text:JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'先前正在读取报告'}]}})});let value=f.project();assert.equal(value.phase.id,'achieved');assert.equal(value.phase.status,'ended');assert.equal(value.items.find(x=>x.sourceRef.kind==='execution-log')?.status,'reported');f.session.resultHash='0'.repeat(64);assert.equal(f.project().phase.id,'unbound');f.session.status='paused';f.run.status='running';f.run.stopRequested=true;value=f.project();assert.equal(value.phase.status,'attention');assert.match(value.phase.label,/等待节点确认/);assert.ok(!value.phase.label.includes('节点已停止'));
});

test('workbench GET adds activity and task grouping without model/command writes or false legacy historical activity',()=>{
 const f=fixture(),dir=mkdtempSync(join(tmpdir(),'r54-workbench-'));let commands=0,models=0;
 const project={id:'project',ownerId:'owner',scope:'personal',revision:1,name:'fixture',copies:[]};const pending={...f.task,id:'pending',status:'queued',executionStatus:'queued',executionRequest:null};
 const repository:any={read:(domain:string,id:string)=>domain==='projects'?project:id==='task'?f.task:pending,list:(domain:string)=>domain==='tasks'?[f.task,pending]:[],execute:()=>{commands++;throw Error('GET must not write');}};
 const supervisor:any={setPendingOwnership(){},view:()=>f.snapshot,options:{modelReady:()=>true,model:()=>{models++;throw Error('GET must not model');}},command:()=>{commands++;throw Error('GET must not command');}};
 const execution:any={configuration:()=>({templates:[]}),getRun:(id:string)=>id==='run'?f.run:null,recentLogs:()=>f.logs};const identity:any={isPrincipalCurrent:()=>true};const runtime=new ProjectWorkbenchRuntime(repository,supervisor,execution,identity,dir);
 try{const before=JSON.stringify([f.task,f.run,f.snapshot]);const value=runtime.context('project',{actorId:'owner',profileId:'me',administrator:true} as any);assert.equal(value.currentActivity?.phase.id,'running');assert.equal(value.tasks.find(x=>x.id==='pending')?.activityState,'planned');assert.equal(value.execution.historicalActive.length,1);assert.equal(value.execution.historicalActive[0].id,'task');assert.equal(commands,0);assert.equal(models,0);assert.equal(JSON.stringify([f.task,f.run,f.snapshot]),before);}finally{runtime.close();rmSync(dir,{recursive:true,force:true});}
});

test('real recentLogs SQLite query returns the owned last80 in order with bounded limits and no missing/foreign reads',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE execution_logs(id INTEGER PRIMARY KEY,run_id TEXT,at TEXT,channel TEXT,text TEXT)');const insert=db.prepare('INSERT INTO execution_logs VALUES(?,?,?,?,?)');for(let i=1;i<=245;i++)insert.run(i,i===245?'other':'run','2026-10-18T14:00:00Z','stdout','synthetic '+i);
 const self:any={actorId:'owner',db,row:(id:string)=>id==='run'?{owner_id:'owner'}:id==='foreign'?{owner_id:'other'}:null};
 try{const rows:any[]=ExecutionRuntime.prototype.recentLogs.call(self,'run',80);assert.equal(rows.length,80);assert.equal(rows[0].id,165);assert.equal(rows.at(-1)?.id,244);assert.equal(ExecutionRuntime.prototype.recentLogs.call(self,'run',2).length,2);for(const limit of [0,81,1.5])assert.throws(()=>ExecutionRuntime.prototype.recentLogs.call(self,'run',limit));for(const id of ['missing','foreign'])assert.throws(()=>ExecutionRuntime.prototype.recentLogs.call(self,id,80),(e:any)=>e.code==='FORBIDDEN');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM execution_logs').get()?.n,245);}finally{db.close();}
});
