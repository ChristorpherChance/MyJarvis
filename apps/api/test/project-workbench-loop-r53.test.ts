import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {ProjectWorkbenchRuntime} from '../src/runtime/project-workbench-runtime.js';
import {workbenchLoopView} from '../../web/src/features/operations/project-plan-workbench-view.js';
import {subscribeWorkbenchSupervisor} from '../../web/src/supervisor-workbench-stream.js';

const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fixture(mode:'continue'|'blocked'|'wait_user'|'review'='continue'){
 const dir=mkdtempSync(join(tmpdir(),'r53-loop-'));
 const project={id:'project',ownerId:'owner',scope:'personal',revision:1,name:'Synthetic readmodel fixture',goal:'bounded goal',copies:[]};
 const feedback={state:'ready_for_review',summary:'已保存本轮原件',question:'原CC历史问题',options:[],recommendedOption:null,evidence:[{path:'artifacts/synthetic-facts.json',sha256:'e'.repeat(64)}],nextSuggestion:''};
 const result={source:'signed-agent',outcome:'success',exitCode:0,summary:JSON.stringify(feedback),sessionId:'native',evidenceReceipts:[]};
 const run=(id:string,terminal:boolean)=>({id,domain:'tasks',taskId:'task',projectId:'project',machineId:'machine',workspace:'/synthetic/nonproduction',sessionId:'native',supervisor:{sessionId:'supervisor',goalRevision:2},status:terminal?'succeeded':'queued',...(terminal?{result:structuredClone(result)}:{})});
 const runs=new Map<string,any>([['source',run('source',true)],['next',run('next',mode==='blocked')]]);
 const useSource=mode==='wait_user'||mode==='review';
 const task={id:'task',ownerId:'owner',projectId:'project',scope:'personal',machineId:'machine',worktree:'/synthetic/nonproduction',sessionId:'native',status:useSource||mode==='blocked'?'validating':'queued',executionStatus:useSource||mode==='blocked'?'succeeded':'queued',executionRequest:{id:useSource?'source':'next'}};
 const session={id:'supervisor',projectId:'project',ownerId:'owner',scope:'personal',revision:9,goalRevision:2,goal:'bounded goal',criteria:['synthetic criterion'],taskId:'task',machineId:'machine',workspace:'/synthetic/nonproduction',runId:task.executionRequest.id,consumedRunId:mode==='blocked'?'next':'source',resultHash:hash(result),decisionId:'model-source',status:mode==='review'?'achieved':mode==='wait_user'?'waiting_user':mode==='blocked'?'blocked':'running',enabled:mode==='continue',blocker:mode==='blocked'?'MODEL_CONTEXT_INCOMPLETE':'',nextAction:'已保存的新后继指令'};
 const base={taskId:'task',goalRevision:2,machineId:'machine',eventId:'source-event',hash:'d'.repeat(64),runId:'source',resultHash:hash(result)};
 const decision={...base,sequence:3,kind:mode==='review'?'review':'decision',decisionId:'model-source',feedback,decision:{action:mode==='review'?'review':mode==='wait_user'?'wait_user':'continue',reason:mode==='wait_user'?'请本人选择已核方案':'原件已回，继续补证',directive:'只读收回补充原件',criteria:[{criterion:'synthetic criterion',met:mode==='review',evidence:[]}]} };
 const events:any[]=[{...base,eventId:'feedback',sequence:2,kind:'feedback',feedback},decision];
 if(!useSource)events.push({...base,eventId:'instruction',sequence:4,kind:'instruction',runId:'next',dispatchedRunId:'next',sourceDecisionId:'model-source',directive:'已保存的新后继指令'});
 if(mode==='blocked')events.push({...base,eventId:'next-feedback',sequence:5,kind:'feedback',runId:'next',feedback},{...base,eventId:'blocked',sequence:6,kind:'blocked',runId:'next',reason:'MODEL_CONTEXT_INCOMPLETE'});
 const snapshot={session,events},before=JSON.stringify({task,snapshot,runs:[...runs]});
 const p={actorId:'owner',profileId:'me',administrator:true} as any;
 let commands=0,models=0;
 const repository={read:(domain:string,id:string)=>domain==='projects'&&id===project.id?project:domain==='tasks'&&id===task.id?task:null,list:(domain:string)=>domain==='tasks'?[task]:[],execute:()=>{commands++;throw Error('GET must not execute a command');}} as any;
 const supervisor={view:()=>snapshot,setPendingOwnership:()=>{},options:{modelReady:()=>true,model:()=>{models++;throw Error('GET must not run a model');}},command:()=>{commands++;throw Error('GET must not command supervisor');}} as any;
 const runtime=new ProjectWorkbenchRuntime(repository,supervisor,{configuration:()=>({templates:[]}),getRun:(id:string)=>runs.get(id)}, {isPrincipalCurrent:()=>true} as any,dir,{brief:()=>({unresolved:{reason:'历史旧阻塞',nextAction:'历史旧下一步'}})});
 return {runtime,task,snapshot,runs,p,context:()=>runtime.context(project.id,p),unchanged:()=>{assert.equal(JSON.stringify({task,snapshot,runs:[...runs]}),before);assert.equal(commands,0);assert.equal(models,0);},close:()=>{runtime.close();rmSync(dir,{recursive:true,force:true});}};
}

test('current bound continue/queued action and next instruction outrank stale manual item without writes',()=>{
 const f=fixture();try{const c=f.context(),v=workbenchLoopView(c,null);assert.equal(c.currentLoopBrief?.actionLabel,'排队等待执行器领取');assert.equal(v.blocker,'');assert.equal(v.nextAction,'已保存的新后继指令');assert.equal(c.currentLoopBrief?.roundBrief?.nextRunId,'next');assert.equal(c.currentLoopBrief?.roundBrief?.goalJudgedAchieved,false);assert.equal(c.brief.unresolved.reason,'历史旧阻塞');f.context();f.unchanged();}finally{f.close();}
});

test('technical block is not owner wait; a real current bound wait_user question is retained',()=>{
 const blocked=fixture('blocked'),ask=fixture('wait_user');try{const b=blocked.context(),v=workbenchLoopView(b,null);assert.equal(v.ownerActionRequired,false);assert.equal(v.ownerQuestion,null);assert.equal(v.blocker,'MODEL_CONTEXT_INCOMPLETE');assert.match(b.currentLoopBrief!.actionLabel,/技术问题/);assert.equal(b.currentLoopBrief!.judgment!.currentResult,false);const a=ask.context();assert.equal(a.currentLoopBrief!.ownerActionRequired,true);assert.equal(a.currentLoopBrief!.ownerQuestion,'请本人选择已核方案');blocked.unchanged();ask.unchanged();}finally{blocked.close();ask.close();}
});

test('bound review automatically yields only a round brief; stale goal/foreign result cannot qualify it',()=>{
 const f=fixture('review');try{const c=f.context();assert.equal(c.currentLoopBrief?.roundBrief?.goalJudgedAchieved,true);assert.equal(c.currentLoopBrief?.roundBrief?.independentAcceptance,false);assert.equal(c.currentLoopBrief?.roundBrief?.binding.resultHash,f.snapshot.session.resultHash);assert.equal(f.task.status,'validating');f.context();f.unchanged();f.snapshot.events.find(e=>e.kind==='review')!.goalRevision=1;assert.equal(f.context().currentLoopBrief?.judgment,null);assert.equal(f.context().currentLoopBrief?.roundBrief?.goalJudgedAchieved,false);f.snapshot.events.find(e=>e.kind==='review')!.goalRevision=2;f.runs.get('source').projectId='other-project';assert.equal(f.context().currentLoopBrief?.roundBrief,null);}finally{f.close();}
});

test('production workbench SSR shows automatic report/current technical block, with legacy item in history',async()=>{
 const f=fixture('blocked');mkdirSync(resolve('.r43-tools'),{recursive:true});const dir=mkdtempSync(resolve('.r43-tools/r53-loop-render-'));
 try{const {build}=await import('esbuild'),React=(await import('react')).default,{renderToStaticMarkup}=await import('react-dom/server');const shim=join(dir,'hooks.mjs'),out=join(dir,'page.mjs');
  writeFileSync(shim,`export * from ${JSON.stringify(resolve('node_modules/react/index.js'))};import R from ${JSON.stringify(resolve('node_modules/react/index.js'))};export default R;export const useState=v=>[globalThis.__r53States.length?globalThis.__r53States.shift():typeof v==='function'?v():v,()=>{}];export const useRef=v=>({current:v});export const useEffect=()=>{};`);
  await build({entryPoints:['apps/web/src/features/operations/ProjectWorkbenchPage.tsx'],outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'isolated-read-hooks',setup(b:any){b.onResolve({filter:/^react$/},()=>({path:shim}));}}],logLevel:'silent'});
  const Page=(await import(pathToFileURL(out).href)).EntityWorkbench;(globalThis as any).__r53States=[f.context(),null,'2026-10-18T00:00:00Z','live'];
  const html=renderToStaticMarkup(React.createElement(Page,{projectId:'project',projectName:'Synthetic project',params:new URLSearchParams(),data:{projects:[{id:'project',name:'Synthetic project'}],machines:[],tasks:[]},navigate:()=>{throw Error('SSR cannot navigate');}}));
  const first=html.slice(0,html.indexOf('workbench-plan-details'));assert.ok(first.includes('自动本轮回报'));assert.ok(first.includes('报告资料超过本轮审阅容量'));assert.ok(!first.includes('等待本人'));assert.ok(!first.includes('历史旧阻塞'));assert.ok(html.includes('历史登记事项'));assert.ok(first.includes('不代表任务完成'));f.unchanged();
 }finally{delete(globalThis as any).__r53States;rmSync(dir,{recursive:true,force:true});f.close();}
});

test('existing supervisor SSE refreshes on new revision only and closes truthfully on auth loss',()=>{
 const previous=globalThis.EventSource;let instance:any,reads=0,expired=0;const states:string[]=[];
 class FakeSource {readyState=0;listeners=new Map<string,(e:any)=>void>();onerror:any;constructor(readonly url:string){instance=this;}addEventListener(k:string,fn:(e:any)=>void){this.listeners.set(k,fn);}close(){this.readyState=2;}emit(k:string,v:any={}){this.listeners.get(k)?.({data:JSON.stringify(v)});}}
 try{globalThis.EventSource=FakeSource as any;const stop=subscribeWorkbenchSupervisor('project',()=>reads++,s=>states.push(s),()=>expired++);assert.match(instance.url,/\/projects\/project\/supervisor\/events$/);instance.emit('supervisor.changed',{projectId:'other',revision:1});assert.equal(reads,0);instance.emit('supervisor.changed',{projectId:'project',revision:3});instance.emit('supervisor.changed',{projectId:'project',revision:3});assert.equal(reads,1);instance.readyState=2;instance.onerror();assert.equal(states.at(-1),'closed');instance.emit('session-expired');assert.equal(expired,1);instance.emit('supervisor.changed',{projectId:'project',revision:4});assert.equal(reads,1);stop();}finally{globalThis.EventSource=previous;}
});
