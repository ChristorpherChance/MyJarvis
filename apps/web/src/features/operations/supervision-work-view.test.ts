import assert from 'node:assert/strict';
import test from 'node:test';
import {supervisionWorkView,supervisionTaskLabels,validCompletion,prepareSupervisionSubmission,supervisionSubmissionUnknown} from './supervision-work-view.ts';
import {subscribeSupervisionWork,clearSupervisionStreams,type SupervisionStreamMessage,type SupervisionWorkItem,type SupervisionWorkOverview} from '../../supervision-work-client.ts';

test('监督事项完成、窗口计数与原产品验收分开，缺少完成依据不能通过表单',()=>{
 const item={id:'one',projectId:'project',ownerId:'server-admin',revision:2,title:'公开合成事项',status:'completed',summary:'阶段结束',nextAction:'',blocker:'',stepId:null,taskId:null,runId:null,completionSummary:'已完成该合成事项',validationScope:'仅这个事项',evidenceRefs:[{path:'docs/synthetic.json',sha256:'a'.repeat(64)}],createdAt:'2026-10-16T01:00:00Z',updatedAt:'2026-10-16T01:01:00Z'} satisfies SupervisionWorkItem;
 const overview={projectId:'project',revision:3,latestSequence:3,items:[item],counts:{total:501,planned:300,running:100,blocked:100,completed:1},itemsTruncated:true,executionFacts:[],executionFactsTruncated:false,independentProgress:{automaticAcceptance:false,statement:'独立验收另行核对'}} satisfies SupervisionWorkOverview;
 const view=supervisionWorkView(overview);assert.equal(view.total,501);assert.equal(view.running,100);assert.equal(view.blocked,100);assert.equal(view.completed.length,1);assert.equal(view.completedCount,1);assert.equal(view.items.length,0);assert.equal('percent' in view,false);assert.equal('verifiedObjectives' in view,false);assert.equal(validCompletion(item),true);
 for(const change of [{completionSummary:''},{validationScope:''},{evidenceRefs:[]},{evidenceRefs:[{path:'docs/synthetic.json',sha256:'invalid'}]}])assert.equal(validCompletion({...item,...change}),false);
 assert.equal(supervisionTaskLabels({status:'validating',executionStatus:'succeeded',runStatus:'succeeded'}).execution,'执行结束，待独立验收');
});

test('提交已落盘后502或503属于未知回执：同正文复用command，禁止改正文重建事项',()=>{
 for(const failure of [{status:500},{status:502},{status:503},new TypeError('network unavailable'),new Error('response project mismatch')]){
  let generated=0;const createId=()=>`synthetic-command-${++generated}`;
  const first=prepareSupervisionSubmission(null,'exact-original-body',createId);first.unknown=supervisionSubmissionUnknown(failure);
  assert.equal(first.unknown,true);const retry=prepareSupervisionSubmission(first,'exact-original-body',createId);
  assert.equal(retry.commandId,first.commandId);assert.equal(generated,1);assert.throws(()=>prepareSupervisionSubmission(first,'changed-body',createId),/回执未确认/);assert.equal(generated,1);
 }
 for(const status of [400,401,403,404,409,413,415,422])assert.equal(supervisionSubmissionUnknown({status}),false);
});

test('共享SSE按提交序号去重、重连补拉、当前会话撤销清屏，旧连接晚事件不得清新身份',()=>{
 const originalSource=globalThis.EventSource,originalWindow=globalThis.window;
 class FakeSource {
  static instances:FakeSource[]=[];listeners=new Map<string,((event:MessageEvent)=>void)[]>();closed=false;onerror:(()=>void)|null=null;
  constructor(readonly url:string){FakeSource.instances.push(this)}
  addEventListener(kind:string,callback:(event:MessageEvent)=>void){this.listeners.set(kind,[...(this.listeners.get(kind)??[]),callback])}
  close(){this.closed=true}
  send(kind:string,data:unknown){for(const callback of this.listeners.get(kind)??[])callback(new MessageEvent(kind,{data:JSON.stringify(data)}))}
 }
 const target=new EventTarget();let expired=0;target.addEventListener('jarvis:auth-required',()=>expired++);
 Object.assign(globalThis,{EventSource:FakeSource,window:target});
 const messages:SupervisionStreamMessage[]=[],other:SupervisionStreamMessage[]=[];
 try{
  const stop=subscribeSupervisionWork('project',message=>messages.push(message)),stopOther=subscribeSupervisionWork('project',message=>other.push(message));
  const all:SupervisionStreamMessage[]=[],stopAll=subscribeSupervisionWork(null,message=>all.push(message));
  assert.equal(FakeSource.instances.length,1);const source=FakeSource.instances[0];assert.equal(source.url,'/api/v1/supervision-work/events?after=0');
  source.send('ready',{projectId:'project',latestSequence:8});source.send('supervision.changed',{projectId:'other',sequence:9,revision:1,kind:'work-item'});
  source.send('supervision.changed',{projectId:'project',sequence:9,revision:2,kind:'work-item'});source.send('supervision.changed',{projectId:'project',sequence:9,revision:2,kind:'work-item'});
  assert.equal(messages.filter(message=>message.type==='refresh'&&message.reason==='change').length,0);
  // The wrong-project event advances the global cursor, but is not delivered to this panel.
  source.send('supervision.changed',{projectId:'project',sequence:10,revision:2,kind:'work-item'});
  assert.equal(messages.filter(message=>message.type==='refresh'&&message.reason==='change').length,1);
  assert.equal(all.filter(message=>message.type==='refresh'&&message.reason==='change').length,2);
  source.onerror?.();source.onerror?.();source.send('ready',{projectId:'project',latestSequence:10});assert.equal(messages.filter(message=>message.type==='refresh'&&message.reason==='ready').length,2);assert.equal(messages.filter(message=>message.type==='refresh'&&message.reason==='disconnect').length,1);
  stop();assert.equal(source.closed,false);stopOther();assert.equal(source.closed,false);stopAll();assert.equal(source.closed,true);
  const stopFresh=subscribeSupervisionWork('project',message=>messages.push(message)),fresh=FakeSource.instances[1];source.send('session-expired',{});assert.equal(expired,0);assert.equal(fresh.closed,false);
  fresh.send('session-expired',{});assert.equal(expired,1);assert.equal(fresh.closed,true);const count=messages.length;fresh.send('supervision.changed',{projectId:'project',sequence:11,revision:3,kind:'work-item'});assert.equal(messages.length,count);stopFresh();
 }finally{clearSupervisionStreams();Object.assign(globalThis,{EventSource:originalSource,window:originalWindow})}
});
