import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {IdentityRuntime,type RuntimePrincipal} from '../src/runtime/identity.js';
import {NotificationRuntime} from '../src/runtime/notifications.js';
import {SupervisionWorkRuntime} from '../src/runtime/supervision-work-runtime.js';
import {registerSupervisionWorkRoutes} from '../src/runtime/supervision-work-routes.js';
import type {Domain,DomainHandler} from '../src/v1/types.js';
import {supervisionConsoleView} from '../../web/src/features/operations/supervision-console-view.js';
import {infrastructureHandlers} from '../src/v1/infrastructure-domains.js';
const admin={actorId:'server-admin',profileId:'me',administrator:true} as RuntimePrincipal;
const body=(extra:any={})=>({commandId:randomUUID(),expectedVersion:0,title:'真实监管事项',status:'running',summary:'已完成来源检查，等待实际验证',nextAction:'核对模型实际运行条件',blocker:'实际验证条件尚未齐',...extra});
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'jarvis-oversight-r41-')),store=new Store(dir),repo=new V1Repository(store.databasePath);store.setPassword('r41-isolated-http-check');const token=store.createLogin();
 const identity=new IdentityRuntime(store,{memberExists:id=>id==='me',memberProfile:id=>id==='me'?{id:'me',name:'合成管理者'}:undefined}),notifications=new NotificationRuntime(store.databasePath,{identity,repository:repo});
 const seed=(domain:Domain,id:string,value:any,owner=admin.actorId)=>{const h:DomainHandler={domain,commands:['fixture'],execute:(_c,_p,ctx)=>ctx.create(domain,value,id)};return repo.execute(h,'fixture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},owner,()=>undefined).data;};
 seed('projects','p',{name:'隔离软件工厂',goal:'真实交付',status:'active'});seed('projects','other',{name:'另一项目',status:'active'});seed('projects','foreign',{name:'另一所有者项目',status:'active'},'foreign-owner');
 const runs=new Map<string,any>();let plan:any={revision:108,currentStepId:'dev',steps:[{id:'dev',title:'开发与验证',state:'needs-attention',goal:'验证实际运行',nextAction:'补齐条件'}],independentProgress:{status:'blocked',reason:'REPAIR_ATTEMPTS_EXHAUSTED',revision:20,totalObjectives:74,verifiedObjectives:0}};
 const options={directory:join(dir,'work'),identity,notifications,plans:{get:()=>plan}},execution={getRun:(id:string)=>runs.get(id)};
 let runtime=new SupervisionWorkRuntime(repo,execution,options);const app=Fastify();await app.register(cookie);registerSupervisionWorkRoutes(app,runtime,identity);await app.ready();
 return {dir,store,repo,identity,notifications,seed,runs,app,token,headers:{cookie:'jarvis_session='+token},get runtime(){return runtime;},setPlan:(p:any)=>{plan=p},restart(){runtime.close();runtime=new SupervisionWorkRuntime(repo,execution,options)},async close(){await app.close();runtime.close();await notifications.close();repo.close();identity.close();store.close()}};
}
test('R41 real overview keeps recorded work, actual dispatch and independent acceptance distinct',async()=>{
 const f=await fixture();try{
  f.runtime.create('p',body({stepId:'dev'}),admin);f.runtime.create('p',body({title:'有限完成',status:'completed',completionSummary:'有限机制通过',validationScope:'不是整体交付',evidenceRefs:[{path:'artifacts/r41/scoped.json',sha256:'a'.repeat(64)}]}),admin);
  const count=f.notifications.list(admin).items.length;
  const response=await f.app.inject({url:'/api/v1/projects/p/supervision-work/console',headers:f.headers});assert.equal(response.statusCode,200,response.body);assert.equal(response.headers['cache-control'],'private, no-store');const data=response.json().data;
  assert.equal(data.counts.running,1);assert.equal(data.runtime.running,0);assert.equal(data.runtime.queued,0);assert.equal(data.acceptance.accepted,0);assert.equal(data.acceptance.total,74);assert.equal(data.attention.total,0);
  const view=supervisionConsoleView(data);assert.equal(view.state.code,'blocked');assert.equal(view.acceptance,'0 / 74');assert.equal(view.focusState,'存在阻塞');assert.equal(view.recordedCompletion,1);assert.equal(f.notifications.list(admin).items.length,count,'reading cannot invent progress or notices');
  const unrelated={...data,runtime:{...data.runtime,running:1,runningRunIds:['another-run']},items:data.items.map((x:any)=>({...x,blocker:'',runId:'stale-run'}))};assert.equal(supervisionConsoleView(unrelated).focusState,'待接续','another run must not make this work item look executing');
 }finally{await f.close()}
});
test('R41 only project-bound receipts count; human actions exclude technical blockers and foreign approvals',async()=>{
 const f=await fixture();try{
  f.seed('tasks','active',{projectId:'p',title:'真实已派发',status:'running',executionRequest:{id:'run'},machineId:'m',worktree:'/work/p'});f.runs.set('run',{id:'run',domain:'tasks',taskId:'active',projectId:'p',machineId:'m',workspace:'/work/p',status:'running'});
  f.seed('tasks','wrong',{projectId:'p',title:'错误绑定不计运行',status:'running',executionStatus:'running',executionRequest:{id:'foreign'}});f.runs.set('foreign',{id:'foreign',domain:'tasks',taskId:'wrong',projectId:'other',status:'running'});
  f.seed('tasks','waiting',{projectId:'p',title:'明确等本人输入',status:'waitingUser',blockReason:'请提供验收选择'});
  f.seed('approvals','approve',{projectId:'p',title:'本项目审批',status:'pending'});f.seed('approvals','unrelated',{projectId:'other',title:'别的审批',status:'pending'});
  const value=f.runtime.console('p',admin);assert.equal(value.runtime.running,1);assert.equal(value.attention.total,2);assert.deepEqual(value.attention.items.map(x=>x.id),['approve','waiting']);assert.equal(supervisionConsoleView(value).state.code,'running');
  f.runs.get('run').status='queued';assert.equal(supervisionConsoleView(f.runtime.console('p',admin)).state.code,'queued');
  f.setPlan(null);f.runs.get('run').status='succeeded';const empty=f.runtime.console('p',admin);assert.equal(empty.acceptance.available,false);assert.equal(supervisionConsoleView(empty).acceptance,'尚未建立');assert.equal(empty.runtime.running,0);
 }finally{await f.close()}
});
test('R41 chronological activity is durable, owner-bound, paginated and safe after session revocation',async()=>{
 const f=await fixture();try{
  let item=f.runtime.create('p',body(),admin);for(let i=1;i<24;i++)item=f.runtime.revise('p',item.id,body({expectedVersion:item.revision,summary:'已提交进展 '+i}),admin);
  f.runtime.create('other',body({title:'其他项目记录'}),admin);const first=f.runtime.activity('p',admin);assert.equal(first.items.length,20);assert.equal(first.hasMore,true);assert(first.items.every((x,i,a)=>i===0||a[i-1].sequence>x.sequence));
  const second=f.runtime.activity('p',admin,first.nextBefore!);assert.equal(second.items.length,4);assert.equal(second.hasMore,false);assert.equal(new Set([...first.items,...second.items].map(x=>x.sequence)).size,24);
  const other=f.runtime.latest('other',admin.actorId);assert.throws(()=>f.runtime.activity('p',admin,other),/位置无效/);
  f.restart();assert.equal(f.runtime.console('p',admin).activity.items[0].revision,24);assert.equal(f.runtime.detail('p',item.id,admin).history.length,24);
  assert.equal((await f.app.inject({url:'/api/v1/projects/foreign/supervision-work/console',headers:f.headers})).statusCode,404);
  f.store.deleteLogin(f.token);assert.equal((await f.app.inject({url:'/api/v1/projects/p/supervision-work/console',headers:f.headers})).statusCode,401);
  assert.equal((await f.app.inject({url:'/api/v1/projects/p/supervision-work/activity',headers:f.headers})).statusCode,401);
 }finally{await f.close()}
});
test('R41 adjustment preserves original evidence and versions, replay stays singular and notification opens standalone console',async()=>{
 const f=await fixture();try{
  const item=f.runtime.create('p',body({stepId:'dev',evidenceRefs:[{path:'artifacts/r41/basis.json',sha256:'b'.repeat(64)}]}),admin),{id,projectId,ownerId,revision,createdAt,updatedAt,previousHash,hash,...fields}=item;
  const input={...fields,nextAction:'先完成受限真实评审，再报告结果',commandId:randomUUID(),expectedVersion:revision};
  const changed=f.runtime.revise('p',id,input,admin);assert.equal(changed.nextAction,input.nextAction);assert.deepEqual(changed.evidenceRefs,item.evidenceRefs);assert.equal(changed.stepId,'dev');assert.deepEqual(f.runtime.revise('p',id,input,admin),changed);
  assert.throws(()=>f.runtime.revise('p',id,{...input,commandId:randomUUID()},admin),/已更新/);assert.equal(f.runtime.detail('p',id,admin).history.length,2);assert.equal(f.notifications.list(admin).items.length,2);assert(f.notifications.list(admin).items.every(x=>x.route==='supervision/p'));
  assert.equal(f.runtime.console('p',admin).runtime.running,0);assert.equal(f.runtime.console('p',admin).acceptance.accepted,0);
 }finally{await f.close()}
});

test('R41 authorization-bound budget and project approvals appear only for their current owned project',async()=>{
 const f=await fixture();try{
  f.seed('machines','m',{name:'隔离节点',status:'online'});
  f.seed('tasks','budget-task',{projectId:'p',machineId:'m',mode:'managed',title:'申请预算的任务',status:'blocked',budget:10,cost:2});
  f.seed('tasks','foreign-task',{projectId:'other',machineId:'m',mode:'managed',title:'另一项目任务',status:'blocked',budget:10,cost:2});
  const handler=infrastructureHandlers.find(x=>x.domain==='approvals')!;
  const request=(kind:string,targetId:string)=>f.repo.execute(handler,'request',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{kind,targetId,reason:'隔离审批验证',rollbackPlan:'保留原配置',...(kind==='budget'?{amount:20}:{})}},admin.actorId,id=>f.repo.read('machines',id,admin.actorId)).data;
  const budget=request('budget','budget-task'),project=request('other','p');request('budget','foreign-task');request('other','other');
  assert.equal(budget.projectId,undefined);assert.equal(project.projectId,undefined);assert.equal(project.authorizationBinding.projectId,null);
  f.seed('approvals','false-project-metadata',{status:'pending',title:'不能只信声明项目',authorizationBinding:{domain:'tasks',targetId:'foreign-task',projectId:'p'}});
  f.seed('approvals','missing-target',{status:'pending',title:'目标已不存在',authorizationBinding:{domain:'tasks',targetId:'missing',projectId:'p'}});
  const value=f.runtime.console('p',admin);assert.equal(value.attention.total,2);assert.deepEqual(new Set(value.attention.items.map(x=>x.id)),new Set([budget.id,project.id]));
  const other=f.runtime.console('other',admin);assert.equal(other.attention.total,2);assert(!other.attention.items.some(x=>x.id===budget.id||x.id===project.id));
  assert.equal(value.runtime.running,0);assert.equal(value.acceptance.accepted,0);
 }finally{await f.close()}
});
