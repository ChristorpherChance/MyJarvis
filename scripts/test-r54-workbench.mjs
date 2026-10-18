import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

let dir,view,Page,stream;
before(async()=>{
 dir=await mkdtemp(join(tmpdir(),'jarvis-r54-ui-'));
 const react=resolve('node_modules/react/index.js'),shim=join(dir,'hooks.mjs'),client=join(dir,'client.mjs');
 await writeFile(shim,`export * from ${JSON.stringify(react)};import R from ${JSON.stringify(react)};export default R;export const useState=v=>{const i=globalThis.__r54Cursor++;if(!(i in globalThis.__r54States))globalThis.__r54States[i]=typeof v==='function'?v():v;return [globalThis.__r54States[i],v=>{globalThis.__r54States[i]=typeof v==='function'?v(globalThis.__r54States[i]):v;}];};export const useRef=v=>({current:v});export const useEffect=()=>{};`);
 await writeFile(client,'export const v1Request=(...args)=>globalThis.__r54Request(...args);');
 const out=join(dir,'page.mjs');
 await build({entryPoints:['apps/web/src/features/operations/ProjectWorkbenchPage.tsx'],outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'controlled-hook-and-command-boundary',setup(b){b.onResolve({filter:/^react$/},()=>({path:shim}));b.onResolve({filter:/v1-client$/},args=>args.importer.endsWith('ProjectWorkbenchPage.tsx')?{path:client}:null);}}],logLevel:'silent'});
 Page=(await import(pathToFileURL(out).href)).EntityWorkbench;
 const helper=join(dir,'view.mjs'),events=join(dir,'stream.mjs');
 await build({entryPoints:['apps/web/src/features/operations/project-plan-workbench-view.ts'],outfile:helper,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 await build({entryPoints:['apps/web/src/supervisor-workbench-stream.ts'],outfile:events,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 view=await import(pathToFileURL(helper).href);stream=await import(pathToFileURL(events).href);
});
after(async()=>{for(const key of ['__r54Cursor','__r54States','__r54Request'])delete globalThis[key];if(dir)await rm(dir,{recursive:true,force:true});});

const plan={projectId:'p',title:'Synthetic current plan',goal:'F01 真实能力\nS01 严格监管',currentStepId:'C5',steps:[{id:'C5',title:'回收与判断',state:'running',criteria:['真实证据']}],nextAction:'继续回收'};
function fixture(status='running'){
 const session={id:'s',revision:9,goalRevision:2,taskId:'t',runId:'r',status,goal:'核验一个真实隔离路径',criteria:['原标准'],summary:'当前说明',nextAction:'核验反馈'};
 return {project:{id:'p',revision:2,goal:'项目整体目标'},supervisor:{session,events:[]},execution:{state:status==='running'?'running':'succeeded'},pending:[],choices:[],tasks:[{id:'t',title:'当前真实执行',runId:'r',runStatus:status==='running'?'running':'succeeded',bindingVerified:true,status:status==='running'?'running':'blocked'},{id:'future',title:'旧待安排，仅查看',runId:null,runStatus:null,status:'queued'},{id:'old',title:'旧失败留历史',runId:'old-r',runStatus:'failed',status:'failed'}],currentLoopBrief:{bindingVerified:true,actionLabel:status==='achieved'?'本轮达标；独立验收另列':'正在执行',blocker:'',nextAction:'核验反馈',ownerActionRequired:false,ownerQuestion:null,roundBrief:status==='achieved'?{title:'本轮目标达标回报',summary:'原件已回收',reason:'原标准满足',goalJudgedAchieved:true,criteria:[{criterion:'原标准',met:true}],evidenceRefs:[],binding:{runId:'r'},independentAcceptance:false}:null},currentActivity:{bindingVerified:true,runId:'r',taskId:'t',phase:{id:status,label:status==='achieved'?'本轮达标':'正在核对已收到的原件',status:status==='running'?'active':'ended'},items:Array.from({length:5},(_,i)=>({id:'event:'+i,role:i%2?'executor':'jarvis',status:status==='running'?'running':'reported',at:'2026-10-18T00:00:0'+i+'Z',summary:'真实互动'+i,sourceRef:{kind:'supervisor-event',runId:'r'}})),logCursor:10,executionEventsURL:status==='running'?'/api/v1/execution/runs/r/events':null,progress:{kind:'stage',percent:null}}};
}
const props={projectId:'p',projectName:'合成测试项目',params:new URLSearchParams(),data:{projects:[{id:'p',name:'合成测试项目'}],machines:[],tasks:[],theme:'test'},navigate:()=>{}};
function reset(context){globalThis.__r54States=[context,plan,new Date().toISOString(),'live'];globalThis.__r54Cursor=0;}
function render(){globalThis.__r54Cursor=0;return Page(props);}
function find(node,predicate){if(!React.isValidElement(node))return null;if(predicate(node))return node;for(const child of React.Children.toArray(node.props.children)){const value=find(child,predicate);if(value)return value;}return null;}

test('real run facts classify tasks; optional activity cannot qualify foreign run or invent percent',()=>{
 const c=fixture(),groups=view.workbenchTasks(c);assert.equal(groups.active.length,1);assert.equal(groups.planned.length,1);assert.equal(groups.attention.length,1);
 c.tasks[0].runStatus='queued';assert.equal(view.workbenchTasks(c).active.length,0);assert.equal(view.workbenchTasks(c).planned[0].activityLabel,'已提交，等待领取');
 c.tasks[0].runId=null;c.tasks[0].status='queued';assert.equal(view.workbenchTasks(c).active.length,0);assert.equal(view.workbenchTasks(c).planned[0].activityLabel,'待安排');
 c.currentActivity.runId='foreign';assert.equal(view.workbenchActivity(c),null);assert.equal(view.workbenchInteractions(c).length,0);
 assert.equal(view.workbenchReadFreshness('2026-10-18T00:00:00Z',Date.parse('2026-10-18T00:00:46Z')).stale,true);
 assert.equal(view.workbenchDetailRoute('projects','projects/p?task=t'),true);assert.equal(view.workbenchDetailRoute('projects','projects'),false);assert.equal(view.workbenchDetailRoute('tasks','tasks/project/p'),false);
});

test('production component keeps latest three interactions and visible tasks; completion stays folded with limited scope',()=>{
 reset(fixture());let html=renderToStaticMarkup(render());assert.ok(html.includes('真实互动2')&&html.includes('真实互动3')&&html.includes('真实互动4'));assert.ok(!html.includes('真实互动0')&&!html.includes('真实互动1'));assert.ok(html.includes('执行中')&&html.includes('待安排')&&html.includes('需处理'));assert.ok(!html.includes('class="workbench-loop"'));assert.ok(!html.includes('%'));
 reset(fixture('achieved'));html=renderToStaticMarkup(render());assert.ok(html.includes('安排下一目标'));assert.ok(html.includes('仅本轮目标达标，整体验收另列'));assert.match(html,/<details class="workbench-round-brief"><summary>/);assert.ok(html.includes('当前无活动运行'));assert.match(html,/aria-pressed="true">待安排/);assert.equal(globalThis.__r54States[0].tasks[0].status,'blocked');
});

test('actual primary button opens revise form; save is one revise POST with no start, and stale reads block handlers',async()=>{
 const calls=[];globalThis.__r54Request=async(...args)=>{calls.push(args);return {data:{}};};reset(fixture('achieved'));
 let tree=render();const action=find(tree,n=>n.props.children==='安排下一目标');assert.ok(action);assert.equal(calls.length,0);action.props.onClick();tree=render();const form=find(tree,n=>n.type==='form');assert.ok(form);let prevented=0;await form.props.onSubmit({preventDefault(){prevented++;}});assert.equal(prevented,1);assert.equal(calls.length,1);const body=JSON.parse(calls[0][1].body);assert.equal(body.action,'revise');assert.equal(body.expectedVersion,9);assert.deepEqual(body.criteria,['原标准']);assert.ok(!Object.hasOwn(body,'authorizeContinuous'));assert.equal(calls.filter(([,x])=>JSON.parse(x.body).action==='start').length,0);
 reset(fixture('achieved'));globalThis.__r54States[21]=true;tree=render();const disabled=find(tree,n=>n.props.children==='安排下一目标');assert.equal(disabled.props.disabled,true);disabled.props.onClick();assert.equal(calls.length,1);assert.ok(renderToStaticMarkup(tree).includes('读取失败，以下为上次信息'));
});

test('execution SSE deduplicates identical statuses/new log ids and never exposes raw text or runs commands',()=>{
 const previous=globalThis.EventSource;let instance,reads=0,expired=0;const states=[];
 class FakeSource{readyState=0;listeners={};constructor(url){this.url=url;instance=this;}addEventListener(name,callback){this.listeners[name]=callback;}close(){this.readyState=2;}emit(name,data){this.listeners[name]?.({data:JSON.stringify(data)});}}
 try{globalThis.EventSource=FakeSource;const stop=stream.subscribeWorkbenchExecution('r',10,()=>reads++,x=>states.push(x),()=>expired++);assert.match(instance.url,/runs\/r\/events\?after=10$/);instance.emit('status',{id:'r',status:'running'});instance.emit('status',{id:'r',status:'running'});assert.equal(reads,1);instance.emit('log',{id:11,text:'PRIVATE RAW TEXT MUST NOT BE DISPLAYED'});instance.emit('log',{id:11,text:'duplicate'});assert.equal(reads,2);instance.emit('status',{id:'other',status:'failed'});assert.equal(reads,2);instance.emit('status',{id:'r',status:'succeeded'});assert.equal(reads,3);instance.readyState=2;instance.onerror();assert.equal(states.at(-1),'closed');instance.emit('session-expired',{});assert.equal(expired,1);instance.emit('log',{id:12});assert.equal(reads,3);stop();}finally{globalThis.EventSource=previous;}
});
