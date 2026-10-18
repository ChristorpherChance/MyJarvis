/** Real loopback HTTP, SQLite, SSE and browser; no production, factory job or model. */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createApp} from '../apps/api/src/app.js';
import type {PiService} from '../apps/api/src/pi.js';
const require=createRequire(import.meta.url),{chromium}=require(require.resolve('playwright',{paths:[process.env.JARVIS_NODE_MODULES||'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const attempt=process.argv.find(x=>x.startsWith('--attempt='))?.slice(10)||'1',only=process.argv.find(x=>x.startsWith('--only='))?.slice(7).split(',');
const output=resolve('artifacts/factory-supervision-r36'),directory=await mkdtemp(join(tmpdir(),'jarvis-supervision-r36-'));
const results:any[]=[],errors:string[]=[];let runtime:any,browser:any,base='',cookie='',modelCalls=0;
const reportPath=join(output,'browser-'+attempt+'.json');
const pi={initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{},abort:async()=>{},run:async()=>{modelCalls++;throw Error('MODELS_FORBIDDEN')}} as unknown as PiService;
const body=(extra:any={})=>({commandId:randomUUID(),expectedVersion:0,title:'合成监督事项',status:'planned',summary:'等待实际执行',nextAction:'开始隔离检查',...extra});
async function request(path:string,value?:any,authenticated=true){const r=await fetch(base+path,{method:value===undefined?'GET':'POST',headers:{...(authenticated?{cookie}:{}),...(value===undefined?{}:{'content-type':'application/json'})},body:value===undefined?undefined:JSON.stringify(value)});return {status:r.status,value:await r.json()};}
async function check(name:string,fn:()=>Promise<any>){if(only&&!only.includes(name))return;try{results.push({name,status:'passed',evidence:await fn()});console.log(JSON.stringify({name,status:'passed'}));}catch(e){results.push({name,status:'failed',error:e instanceof Error?e.message.replaceAll(cookie,'[REDACTED]').replaceAll(base,'[LOCAL]'):String(e)});process.exitCode=1;}}
try{
 await mkdir(output,{recursive:true});runtime=await createApp({dataDir:directory,pi,webDir:resolve('apps/web/dist')});await runtime.app.listen({host:'127.0.0.1',port:0});base='http://127.0.0.1:'+runtime.app.server.address().port;
 const setup=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:randomUUID()+'-synthetic'})});assert.equal(setup.status,200);cookie=setup.headers.get('set-cookie')!.split(';')[0];await setup.arrayBuffer();
 const project=runtime.v1.execute({domain:'projects',commands:[],execute:(_c:any,_p:any,ctx:any)=>ctx.create('projects',{name:'软件工厂监督 · 合成验收',description:'本地机制验收',goal:'真实状态与简报',status:'planned',copies:[],milestones:[],createdAt:ctx.now,updatedAt:ctx.now})},'qa-fixture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},'server-admin',()=>undefined).data;
 const prefix='/api/v1/projects/'+project.id+'/supervision-work';
 await check('http-cas-auth-completion-contract',async()=>{
  assert.equal((await request(prefix+'/overview',undefined,false)).status,401);
  const input=body(),created=await request(prefix+'/items',input);assert.equal(created.status,200);const item=created.value.data;
  assert.equal((await request(prefix+'/items',input)).value.data.id,item.id);
  assert.equal((await request(prefix+'/items',{...input,title:'同号分叉'})).status,409);
  assert.equal((await request(prefix+'/items/'+item.id+'/revisions',body({expectedVersion:1,status:'completed'}))).status,400);
  const overview=await request(prefix+'/overview');assert.equal(overview.value.data.counts.completed,0);assert.equal(overview.value.data.independentProgress.automaticAcceptance,false);
  return {anonymousRejected:true,idempotent:true,conflictRejected:true,incompleteCompletionRejected:true,noObjectiveAcceptance:true};
 });
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const mobile of [false,true])await check(mobile?'mobile-brief-details-layout':'desktop-live-event-notification-reconnect',async()=>{
  const c=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},...(mobile?{isMobile:true,hasTouch:true}:{})});
  try{
   await c.addCookies([{name:'jarvis_session',value:cookie.slice('jarvis_session='.length),url:base}]);await c.route('**/*',async(route:any)=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   const p=await c.newPage();p.on('pageerror',(e:Error)=>errors.push(e.name));p.setDefaultTimeout(15000);
   const title=(mobile?'手机':'桌面')+'事件监督项';let item=(await request(prefix+'/items',body({title,status:'running',summary:'已进入本地合成检查'}))).value.data;
   await p.goto(base+'/?mode=platform#theme=stark&view='+encodeURIComponent('tasks/project/'+project.id));
   await p.getByText(title,{exact:true}).first().waitFor();
   const start=Date.now(),changed=await request(prefix+'/items/'+item.id+'/revisions',body({expectedVersion:item.revision,title,status:'completed',summary:'本地合成检查已结束',nextAction:'核对简报与证据',completionSummary:'完成简报：本地机制通过，不计产品验收',validationScope:'仅合成监督机制，不运行真实软件工厂',evidenceRefs:[{path:'docs/软件工厂监督使用说明.md',sha256:'a'.repeat(64)}]}));
   assert.equal(changed.status,200);item=changed.value.data;
   await p.locator('summary').filter({hasText:/^完成简报 ·/}).first().click();
   await p.getByText('完成简报：本地机制通过，不计产品验收',{exact:true}).first().waitFor();const visibleDelayMs=Date.now()-start;assert.ok(visibleDelayMs<8000,'completion arrived without the 15-second page polling cycle');
   const card=p.locator('article.supervision-work-item').filter({has:p.getByText(title,{exact:true})});
   if(!mobile){
    let released!:()=>void,arrived!:()=>void;const release=new Promise<void>(r=>released=r),arrival=new Promise<void>(r=>arrived=r);let first=true;
    await p.route('**'+prefix+'/items/'+item.id,async(route:any)=>{if(!first){await route.continue();return}first=false;const reply=await route.fetch();arrived();await release;await route.fulfill({response:reply})});
    await card.locator('details > summary').click();await arrival;
    try{const revised=await request(prefix+'/items/'+item.id+'/revisions',body({expectedVersion:item.revision,title,status:'completed',summary:'详情请求期间产生的新修订',nextAction:'保持简报可核对',completionSummary:'完成简报：本地机制通过，不计产品验收',validationScope:'仅合成监督机制，不运行真实软件工厂',evidenceRefs:[{path:'docs/软件工厂监督使用说明.md',sha256:'a'.repeat(64)}]}));assert.equal(revised.status,200);item=revised.value.data;}finally{released()}
    await card.locator('details').getByText('详情请求期间产生的新修订',{exact:true}).first().waitFor();
   }else await card.locator('details > summary').click();
   await card.getByText('SHA-256 '+'a'.repeat(64),{exact:true}).waitFor();
   const notices=(await request('/api/runtime/notifications?limit=100')).value;
   assert.equal(notices.items.filter((n:any)=>n.body==='完成简报：本地机制通过，不计产品验收').length,mobile?3:2,'one durable notice for each actual completion revision');
   // The visible card offers a detail control; author UI can keep the brief itself expanded.
   await p.screenshot({path:join(output,(mobile?'mobile':'desktop')+'-'+attempt+'.png'),fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   if(!mobile){await c.setOffline(true);const revised=await request(prefix+'/items/'+item.id+'/revisions',body({expectedVersion:item.revision,title,status:'blocked',summary:'断线期间产生了实际状态变化',blocker:'合成依赖未就绪',nextAction:'等待依赖恢复'}));assert.equal(revised.status,200);await c.setOffline(false);await p.getByText('合成依赖未就绪',{exact:false}).first().waitFor();}
   return {visibleDelayMs,realBrowser:true,realSSE:true,mobile,layoutWithinViewport:true};
  }finally{await c.close();}
 });
 assert.equal(errors.length,0);assert.equal(modelCalls,0);
}catch(e){process.exitCode=1;results.push({name:'harness',status:'failed',error:e instanceof Error?e.message.replaceAll(cookie,'[REDACTED]'):String(e)});}
finally{if(browser)await browser.close();if(runtime)await runtime.app.close();const report={at:new Date().toISOString(),attempt,results,modelCalls,productionAccess:false,browserRuntimeErrors:errors.length,syntheticTemporaryDataRetained:true};await mkdir(output,{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));}
