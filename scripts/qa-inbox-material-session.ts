import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {delimiter,join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createApp} from '../apps/api/src/app.js';
import type {PiService} from '../apps/api/src/pi.js';

// These are narrow regressions for session invalidation and recorder-start failure.
// The browser uses Chromium's synthetic microphone and its real MediaRecorder.
const require=createRequire(import.meta.url);
let modulePath:string;try{modulePath=require.resolve('playwright')}catch{modulePath=require.resolve('playwright',{paths:(process.env.JARVIS_NODE_MODULES||'').split(delimiter).filter(Boolean)})}
const {chromium}=require(modulePath),output=resolve('artifacts/inbox-material-session-qa');
const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7),attempt=process.argv.find(arg=>arg.startsWith('--attempt='))?.slice(10)||'1';
const results:{name:string;status:'passed'|'failed';evidence?:Record<string,unknown>;failedStep?:string;errorName?:string;diagnostic?:string}[]=[],errors:string[]=[],outside:string[]=[];
const directory=await mkdtemp(join(tmpdir(),'jarvis-inbox-material-session-browser-')),password=randomUUID()+'-isolated';
let runtime:Awaited<ReturnType<typeof createApp>>|undefined,browser:any,page:any,modelCalls=0,cleanupVerified=false,step='initialize',base='',failureProbe:Record<string,unknown>|undefined;
const pi={initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{},run:async()=>{modelCalls++;throw Error('No model in local material session verification')}} as unknown as PiService;
async function check(name:string,fn:()=>Promise<Record<string,unknown>>){
 if(only&&only!==name)return;
 failureProbe=undefined;try{const evidence=await fn();results.push({name,status:'passed',evidence});console.log(JSON.stringify({name,status:'passed'}))}
 catch(error){results.push({name,status:'failed',evidence:failureProbe,failedStep:step,errorName:error instanceof Error?error.name:'unknown',diagnostic:String(error instanceof Error?error.stack:error).replaceAll(password,'[REDACTED]').slice(0,7000)});process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:join(output,`${name}-failure-${attempt}.png`),fullPage:true}).catch(()=>{});}
}
async function databaseRows(p:any){
 return p.evaluate(()=>new Promise<any[]>((resolve,reject)=>{
  const request=indexedDB.open('jarvis-inbox-materials-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'key'});
  request.onerror=()=>reject(Error('Could not inspect synthetic material draft database'));
  request.onsuccess=()=>{const db=request.result,tx=db.transaction('drafts','readonly'),read=tx.objectStore('drafts').getAll();let rows:any[]=[];read.onsuccess=()=>{rows=read.result};tx.oncomplete=()=>{db.close();resolve(rows.map(row=>({items:row.items.map((item:any)=>({filename:item.filename,bytes:item.blob?.size??0}))})))};tx.onerror=()=>{db.close();reject(Error('Could not read synthetic material draft rows'))};};
 }));
}
async function openCapture(p:any){
 await p.getByRole('button',{name:'快速记录',exact:true}).click();const dialog=p.getByRole('dialog',{name:'快速记录',exact:true});await dialog.waitFor();await dialog.getByText('正在恢复本机附件…',{exact:true}).waitFor({state:'hidden'});return dialog;
}
async function login(p:any){await p.getByLabel('管理密码',{exact:true}).fill(password);await p.getByRole('button',{name:'进入完整平台',exact:true}).click();await p.getByRole('heading',{name:'统一收件',exact:true}).waitFor();}
async function context(){
 const c=await browser.newContext({viewport:{width:1480,height:960},permissions:['microphone']});
 await c.route('**/*',async(route:any)=>{const url=new URL(route.request().url());if(url.origin!==base){outside.push(url.protocol);await route.abort('blockedbyclient');return}await route.continue()});
 await c.addInitScript(()=>{
  const state={tracks:[] as MediaStreamTrack[],microphoneRequests:0,startCalls:0,forceStartThrows:0,failNextStart:false,holdNextOpen:false,openCalls:0,dataEvents:0,heldOpens:0,releasedOpens:0,heldDatabaseCloses:0,release:null as null|(()=>void),recordingTimers:new Set<number>()};(window as any).__sessionQa=state;
  const getUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async options=>{state.microphoneRequests++;const stream=await getUserMedia(options);state.tracks.push(...stream.getTracks());return stream};
  const start=MediaRecorder.prototype.start;
  MediaRecorder.prototype.start=function(timeslice?:number){state.startCalls++;if(state.failNextStart){state.failNextStart=false;state.forceStartThrows++;throw new DOMException('Synthetic first recorder start failure','UnknownError')}this.addEventListener('dataavailable',()=>{state.dataEvents++});return start.call(this,timeslice)};
  const setTimer=window.setTimeout.bind(window),clearTimer=window.clearTimeout.bind(window);
  window.setTimeout=((callback:TimerHandler,timeout?:number,...args:any[])=>{const id=setTimer(callback,timeout,...args);if(timeout===600000)state.recordingTimers.add(id);return id}) as typeof window.setTimeout;
  window.clearTimeout=((id?:number)=>{if(id!==undefined)state.recordingTimers.delete(id);clearTimer(id)}) as typeof window.clearTimeout;
  const open=IDBFactory.prototype.open;
  IDBFactory.prototype.open=function(name:string,version?:number){
   state.openCalls++;
   const request=version===undefined?open.call(this,name):open.call(this,name,version);
   if(name!=='jarvis-inbox-materials-v1'||!state.holdNextOpen)return request;
   state.holdNextOpen=false;
   request.addEventListener('success',function(event:Event){
    event.stopImmediatePropagation();
    state.heldOpens++;const db=request.result,close=db.close.bind(db);db.close=()=>{state.heldDatabaseCloses++;close()};
    state.release=()=>{const callback=request.onsuccess;if(!callback||state.releasedOpens)return;state.releasedOpens++;callback.call(request,event)};
   },{capture:true,once:true});
   return request;
  };
 });
 const p=await c.newPage();page=p;p.setDefaultTimeout(15000);p.on('pageerror',(error:Error)=>errors.push(error.name));await p.goto(base+'/?mode=platform#theme=stark&view=inbox');await login(p);return {c,p};
}
try{
 await mkdir(output,{recursive:true});runtime=await createApp({dataDir:directory,pi,webDir:resolve('apps/web/dist')});await runtime.app.listen({host:'127.0.0.1',port:0});const address=runtime.app.server.address();assert.ok(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const setup=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});assert.equal(setup.status,200);
 await check('cross-tab-clear',async()=>{
  const {c,p:a}=await context();try{
   step='cross-tab/open-secondary';const b=await c.newPage();page=b;b.setDefaultTimeout(15000);b.on('pageerror',(error:Error)=>errors.push(error.name));await b.goto(base+'/?mode=platform#theme=stark&view=inbox');await b.getByRole('heading',{name:'统一收件',exact:true}).waitFor();const dialog=await openCapture(b);
   step='cross-tab/persist-synthetic-old-file';await dialog.getByLabel('选择文档或音频',{exact:true}).setInputFiles({name:'会话隔离旧附件.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic old material must be cleared on logout.')});await dialog.getByRole('button',{name:'下载本机原件',exact:true}).waitFor();await dialog.getByText('正在保存原件，请稍候…',{exact:true}).waitFor({state:'hidden'});
   assert.ok((await databaseRows(a)).some(row=>row.items.some((item:any)=>item.bytes>0)));
   step='cross-tab/hold-first-recording-idb-open';await b.evaluate(()=>{(window as any).__sessionQa.holdNextOpen=true});await dialog.getByRole('button',{name:'开始录音',exact:true}).click();await dialog.getByRole('button',{name:/^停止录音/}).waitFor();assert.equal(await b.evaluate(()=>(window as any).__sessionQa.tracks.some((track:MediaStreamTrack)=>track.readyState==='live')),true);await b.waitForFunction(()=>(window as any).__sessionQa.heldOpens===1);
   const epochBefore=await a.evaluate(()=>localStorage.getItem('jarvis-inbox-material-session-v1'));
   step='cross-tab/logout-primary-and-clear';page=a;await a.getByRole('button',{name:'退出登录',exact:true}).click();await a.getByLabel('管理密码',{exact:true}).waitFor();await a.waitForFunction(previous=>localStorage.getItem('jarvis-inbox-material-session-v1')!==previous,epochBefore);
   step='cross-tab/verify-secondary-tracks-stopped';page=b;await b.waitForFunction(()=>(window as any).__sessionQa.tracks.length>0&&(window as any).__sessionQa.tracks.every((track:MediaStreamTrack)=>track.readyState==='ended'));await dialog.getByText('草稿已在另一个窗口更新或清除。请重新打开快速记录，以免覆盖新内容。',{exact:true}).waitFor();
   assert.deepEqual(await databaseRows(a),[]);
   step='cross-tab/release-old-save-after-clear';await b.evaluate(()=>{const state=(window as any).__sessionQa;if(!state.release)throw Error('No held IDB success callback');state.release()});await b.waitForFunction(()=>(window as any).__sessionQa.releasedOpens===1&&(window as any).__sessionQa.heldDatabaseCloses===1);
   assert.deepEqual(await databaseRows(a),[]);
   step='cross-tab/relogin-primary-no-old-attachments';page=a;await login(a);const fresh=await openCapture(a);assert.equal(await fresh.locator('.inbox-material-row').count(),0);assert.equal(await fresh.locator('audio').count(),0);assert.match(await fresh.getByRole('region',{name:'文档与录音',exact:true}).textContent(),/0 \/ 5 个原件/);assert.deepEqual(await databaseRows(a),[]);await a.screenshot({path:join(output,'cross-tab-relogin-empty.png'),fullPage:true});
   step='cross-tab/reopen-secondary-no-old-attachments';page=b;await b.reload();await b.getByRole('heading',{name:'统一收件',exact:true}).waitFor();const freshB=await openCapture(b);assert.equal(await freshB.locator('.inbox-material-row').count(),0);assert.deepEqual(await databaseRows(b),[]);
   return {actualRecordingBeforeLogout:true,queuedIdbOpenHeld:1,releaseOccurredAfterClear:true,oldBlobReappeared:false,tracksStoppedOnOtherTab:true,reloginAttachmentCount:0,secondaryReloadAttachmentCount:0};
  }catch(error){if(page&&!page.isClosed()){failureProbe=await page.evaluate(()=>{const s=(window as any).__sessionQa;return s?{tracks:s.tracks.map((track:MediaStreamTrack)=>track.readyState),microphoneRequests:s.microphoneRequests,startCalls:s.startCalls,dataEvents:s.dataEvents,openCalls:s.openCalls,holdNextOpen:s.holdNextOpen,heldOpens:s.heldOpens,releasedOpens:s.releasedOpens,heldDatabaseCloses:s.heldDatabaseCloses}:{};}).catch(()=>({}));await page.screenshot({path:join(output,`cross-tab-clear-failure-${attempt}.png`),fullPage:true}).catch(()=>{});}throw error;}finally{await c.close();}
 });
 await check('recorder-start-failure',async()=>{
  const {c,p}=await context();try{
   step='recorder-start/force-first-start-throw';let dialog=await openCapture(p);await p.evaluate(()=>{(window as any).__sessionQa.failNextStart=true});await dialog.getByRole('button',{name:'开始录音',exact:true}).click();await dialog.getByText('无法开始录音，可以选择已有音频文件上传。',{exact:true}).waitFor();
   await p.waitForFunction(()=>{const state=(window as any).__sessionQa;return state.forceStartThrows===1&&state.tracks.length>0&&state.tracks.every((track:MediaStreamTrack)=>track.readyState==='ended')&&state.recordingTimers.size===0});assert.equal(await dialog.getByRole('button',{name:'开始录音',exact:true}).isEnabled(),true);assert.equal(await dialog.getByRole('button',{name:/^停止录音/}).count(),0);assert.equal(await dialog.getByText('正在保存原件，请稍候…',{exact:true}).count(),0);
   step='recorder-start/close-after-failure';await dialog.getByRole('button',{name:'稍后整理',exact:true}).click();await dialog.waitFor({state:'hidden'});
   step='recorder-start/retry-real-recorder';dialog=await openCapture(p);await dialog.getByRole('button',{name:'开始录音',exact:true}).click();await dialog.getByRole('button',{name:/^停止录音/}).waitFor();await p.waitForFunction(()=>{const state=(window as any).__sessionQa;return state.startCalls===2&&state.tracks.some((track:MediaStreamTrack)=>track.readyState==='live')});
   step='recorder-start/close-active-recording';await dialog.getByRole('button',{name:'稍后整理',exact:true}).click();await dialog.waitFor({state:'hidden'});await p.waitForFunction(()=>{const state=(window as any).__sessionQa;return state.tracks.every((track:MediaStreamTrack)=>track.readyState==='ended')&&state.recordingTimers.size===0});await p.screenshot({path:join(output,'recorder-start-recovered-closed.png'),fullPage:true});
   return {forcedStartExceptions:1,realMicrophoneStreams:2,firstFailureTracksEnded:true,failedStartTimerCleared:true,closeAfterFailureCompleted:true,retryReachedRecording:true,closeDuringRetryCompleted:true,allTracksEnded:true};
  }finally{await c.close();}
 });
 assert.equal(modelCalls,0);assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
}catch(error){results.push({name:'harness',status:'failed',failedStep:step,errorName:error instanceof Error?error.name:'unknown',diagnostic:String(error instanceof Error?error.stack:error).replaceAll(password,'[REDACTED]').slice(0,7000)});process.exitCode=1;}
finally{
 if(browser)await browser.close();try{if(runtime)await runtime.app.close();const target=resolve(directory);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes('jarvis-inbox-material-session-browser-'));await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100});cleanupVerified=true}catch{process.exitCode=1}
 await mkdir(output,{recursive:true});const report={at:new Date().toISOString(),attempt,only,realHttp:true,temporarySqlite:true,syntheticMicrophone:true,actualMediaRecorder:true,physicalMicrophoneVerified:false,productionAccess:false,modelCalls,externalBrowserRequests:outside.length,browserRuntimeExceptions:errors.length,cleanupVerified,results};await writeFile(join(output,'attempt-'+attempt+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
