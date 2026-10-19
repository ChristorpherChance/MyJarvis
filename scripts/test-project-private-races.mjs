import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

let dir,stream,privateRuntime;
const originalWindow=globalThis.window;
after(()=>{globalThis.window=originalWindow;for(const key of ['__privateHooks','__privateCleanups'])delete globalThis[key];});
before(async()=>{
 await mkdir(resolve('.r54-tools'),{recursive:true});dir=await mkdtemp(resolve('.r54-tools/private-races-'));
 const react=resolve('node_modules/react/index.js'),shim=join(dir,'hooks.mjs'),client=join(dir,'client.mjs');
 await writeFile(shim,`export * from ${JSON.stringify(react)};import R from ${JSON.stringify(react)};export default R;export const useState=v=>{const i=globalThis.__privateCursor++;if(!(i in globalThis.__privateStates))globalThis.__privateStates[i]=typeof v==='function'?v():v;return [globalThis.__privateStates[i],v=>{globalThis.__privateStates[i]=typeof v==='function'?v(globalThis.__privateStates[i]):v;}];};export const useRef=v=>globalThis.__privateHooks.useRef(v);export const useEffect=fn=>globalThis.__privateHooks.useEffect(fn);`);
 await writeFile(client,'export const v1Request=(...args)=>globalThis.__privateRequest(...args);');
 const events=join(dir,'stream.mjs'),runtime=join(dir,'runtime.mjs');
 await build({entryPoints:['apps/web/src/supervisor-workbench-stream.ts'],outfile:events,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 await build({entryPoints:['apps/web/src/features/operations/usePrivateRuntime.ts'],outfile:runtime,bundle:true,platform:'node',format:'esm',plugins:[{name:'controlled-private-runtime-boundary',setup(b){b.onResolve({filter:/^react$/},()=>({path:shim}));b.onResolve({filter:/v1-client$/},()=>({path:client}));}}],logLevel:'silent'});
 stream=await import(pathToFileURL(events).href);privateRuntime=await import(pathToFileURL(runtime).href);
});
after(async()=>{for(const key of ['__privateCursor','__privateStates','__privateRequest'])delete globalThis[key];if(dir)await rm(dir,{recursive:true,force:true});});

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
function fakeWindow(){const listeners=new Map();return {addEventListener:(n,f)=>listeners.set(n,[...(listeners.get(n)||[]),f]),removeEventListener:(n,f)=>listeners.set(n,(listeners.get(n)||[]).filter(x=>x!==f)),dispatchEvent:e=>{for(const f of listeners.get(e.type)||[])f(e);return true;},listeners};}
function setupPrivate(){globalThis.__privateCursor=0;globalThis.__privateStates=[];globalThis.window=fakeWindow();let refs=[],cursor=0,effects=[];globalThis.__privateCleanups=[];globalThis.__privateHooks={begin(){cursor=0;effects=[];},useRef(value){const i=cursor++;return refs[i]??(refs[i]={current:value});},useEffect(effect){effects.push(effect);}};const reset=()=>{globalThis.__privateStates.push('CLEARED')};globalThis.__privateCursor=0;const request=privateRuntime.usePrivateRuntime(reset);for(const effect of effects){const cleanup=effect();if(cleanup)globalThis.__privateCleanups.push(cleanup);}return {request,render(){globalThis.__privateHooks.begin();return privateRuntime.usePrivateRuntime(reset);},unmount(){for(const cleanup of globalThis.__privateCleanups.splice(0))cleanup();}};}

test('private-runtime unmount aborts late response; server result is never returned to caller',async()=>{
 const pending=[];globalThis.__privateRequest=(path,options)=>{const d=deferred();pending.push({path,options,...d});return d.promise;};
 const {request,unmount}=setupPrivate();const old=request('/private/project/old');unmount();assert.equal(pending[0].options.signal.aborted,true);pending[0].resolve({projectId:'old',secret:'late old fixture'});await assert.rejects(old,e=>e.name==='AbortError');
});

test('401 auth-required clears state; older in-flight response becomes AbortError',async()=>{
 const pending=[];globalThis.__privateRequest=(path,options)=>{const d=deferred();pending.push({path,options,...d});return d.promise;};
 const {request}=setupPrivate();const late=request('/private/old'),denied=request('/private/current');
 pending[1].reject(Object.assign(new Error('synthetic auth expiry'),{status:401}));await assert.rejects(denied,/synthetic auth expiry/);
 assert.equal(pending[0].options.signal.aborted,true);pending[0].resolve({secret:'late fixture'});await assert.rejects(late,e=>e.name==='AbortError');
 assert.equal(globalThis.__privateStates.at(-1),'CLEARED');
});

test('403 denial clears private state and invalidates parallel response without impersonating a 401',async()=>{
 const pending=[];globalThis.__privateRequest=(path,options)=>{const d=deferred();pending.push({path,options,...d});return d.promise;};
 const {request,unmount}=setupPrivate(),late=request('/private/old'),denied=request('/private/current');
 pending[1].reject(Object.assign(new Error('synthetic forbidden'),{status:403}));await assert.rejects(denied,/synthetic forbidden/);assert.equal(globalThis.__privateStates.at(-1),'CLEARED');
 assert.equal(pending[0].options.signal.aborted,true);pending[0].resolve({projectId:'old'});await assert.rejects(late,error=>error.name==='AbortError');unmount();
});

test('execution SSE accepts monotonic metadata only and session expiry closes before late notifications',()=>{
 const previous=globalThis.EventSource;let source,changes=0,expired=0;const states=[];class FakeSource{readyState=0;listeners={};constructor(url){this.url=url;source=this;}addEventListener(name,fn){this.listeners[name]=fn;}close(){this.readyState=2;}emit(name,value){this.listeners[name]?.({data:JSON.stringify(value)});}}
 try{globalThis.EventSource=FakeSource;const stop=stream.subscribeWorkbenchExecution('run-current',10,()=>changes++,state=>states.push(state),()=>expired++);
  source.emit('log',{id:10,text:'ignored duplicate'});source.emit('log',{id:11,text:'raw body is not exposed'});source.emit('log',{id:11});source.emit('status',{id:'run-foreign',status:'running'});source.emit('status',{id:'run-current',status:'running'});source.emit('status',{id:'run-current',status:'running'});assert.equal(changes,2);
  source.readyState=0;source.onerror();assert.equal(states.at(-1),'reconnecting');source.emit('session-expired',{});assert.equal(expired,1);assert.equal(source.readyState,2);assert.equal(states.at(-1),'closed');source.emit('log',{id:12});source.emit('status',{id:'run-current',status:'succeeded'});assert.equal(changes,2);stop();
 }finally{globalThis.EventSource=previous;}
});

test('real supervisor SSE ignores duplicate, stale, foreign-project and post-close notifications',()=>{
 const previous=globalThis.EventSource;let source,changes=0;class FakeSource{readyState=0;listeners={};constructor(url){this.url=url;source=this;}addEventListener(n,fn){this.listeners[n]=fn;}close(){this.readyState=2;}emit(n,value){this.listeners[n]?.({data:JSON.stringify(value)});}}
 try{globalThis.EventSource=FakeSource;const stop=stream.subscribeWorkbenchSupervisor('project-new',()=>changes++,()=>{},()=>{});assert.match(source.url,/projects\/project-new\/supervisor\/events$/);source.emit('supervisor.changed',{projectId:'project-new',revision:2});source.emit('supervisor.changed',{projectId:'project-new',revision:2});source.emit('supervisor.changed',{projectId:'project-new',revision:1});source.emit('supervisor.changed',{projectId:'project-old',revision:3});source.emit('supervisor.changed',{projectId:'project-new',revision:3});assert.equal(changes,2);stop();source.emit('supervisor.changed',{projectId:'project-new',revision:4});assert.equal(changes,2);}finally{globalThis.EventSource=previous;}
});

