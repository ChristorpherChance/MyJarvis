import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {delimiter,join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createApp} from '../apps/api/src/app.js';
import type {PiService} from '../apps/api/src/pi.js';

// This entry point creates its own empty databases and loopback servers. It does
// not accept a server URL, database path, model configuration, or remote target.
const require=createRequire(import.meta.url);
let playwrightModule:string;
try {playwrightModule=require.resolve('playwright');}
catch {playwrightModule=require.resolve('playwright',{paths:(process.env.JARVIS_NODE_MODULES||'').split(delimiter).filter(Boolean)});}
const {chromium}=require(playwrightModule);
const output=resolve('artifacts/inbox-capture-recovery-qa');
const draftPrefix='jarvis-inbox-draft-v1:';
const resumeAfterPreSend=process.argv.includes('--resume-after-presend');
const suffix=randomUUID().slice(0,8),password=randomUUID()+'-isolated-qa';
const results:{name:string;status:'passed'|'failed';source?:string}[]=[];
const fixtures:{runtime:Awaited<ReturnType<typeof createApp>>;directory:string;base:string}[]=[];
const browserErrors:string[]=[],blockedNetwork:string[]=[];
let browser:any,activePage:any,activeStep='initialize',modelCalls=0,cleanupVerified=false;
let captureHttpFailure:{status:number;code:string;fields:string[]}|null=null;
const pi=()=>({initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{},run:async()=>{modelCalls++;throw Error('Model calls are forbidden in this isolated check');}} as unknown as PiService);
async function fixture() {
  const directory=await mkdtemp(join(tmpdir(),'jarvis-inbox-recovery-browser-'));
  try {
    const runtime=await createApp({dataDir:directory,pi:pi(),webDir:resolve('apps/web/dist')});
    const fixture={runtime,directory,base:''};fixtures.push(fixture);
    await runtime.app.listen({host:'127.0.0.1',port:0});
    const address=runtime.app.server.address();assert.ok(address&&typeof address!=='string');
    fixture.base=`http://127.0.0.1:${address.port}`;return fixture;
  } catch(error) {
    if(!fixtures.some(item=>item.directory===directory))await removeTemporary(directory);
    throw error;
  }
}
async function removeTemporary(directory:string) {
  const absolute=resolve(directory);
  assert.ok(absolute.startsWith(resolve(tmpdir())+sep)&&absolute.includes('jarvis-inbox-recovery-browser-'));
  await rm(absolute,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
async function check(name:string,run:()=>Promise<void>) {
  activeStep=name;
  try {await run();results.push({name,status:'passed'});await writeFile(join(output,'attempt-progress.json'),JSON.stringify({at:new Date().toISOString(),activeStep:name,results},null,2));}
  catch(error) {results.push({name,status:'failed'});throw error;}
}
async function api(context:any,base:string,path:string,body?:unknown) {
  const response=body===undefined?await context.request.get(base+path):await context.request.post(base+path,{data:body});
  assert.ok(response.ok(),`Isolated API rejected ${path.split('/').slice(0,5).join('/')} (${response.status()})`);
  return response.json();
}
async function records(context:any,base:string) {return (await api(context,base,'/api/v1/inbox?limit=100')).data.items as any[];}
async function command(context:any,base:string,name:string,payload:unknown,version=0) {return api(context,base,'/api/v1/inbox/commands/'+name,{commandId:randomUUID(),expectedVersion:version,scope:'private',payload});}
async function authenticate(page:any,base:string,setup:boolean) {
  await page.goto(base+'/?mode=platform#theme=stark&view=inbox',{waitUntil:'domcontentloaded'});
  await page.getByLabel('管理密码',{exact:true}).fill(password);
  if(setup)await page.getByLabel('确认密码',{exact:true}).fill(password);
  await page.getByRole('button',{name:setup?'创建账户':'进入完整平台',exact:true}).click();
  await page.getByRole('heading',{name:'统一收件',exact:true}).waitFor();
}
async function openCapture(page:any) {
  await page.getByRole('button',{name:'快速记录',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'快速记录',exact:true});await dialog.waitFor();return dialog;
}
async function closeDialogs(page:any) {
  for(let count=0;count<3&&await page.getByRole('dialog').count();count++) {
    await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).first().click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
  }
}
async function isolatedContext(base:string,viewport:{width:number;height:number}) {
  const context=await browser.newContext({viewport,...(viewport.width<600?{isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'}:{})});
  await context.route('**/*',async(route:any)=>{
    const url=new URL(route.request().url());
    if(url.origin!==base){blockedNetwork.push(url.protocol);await route.abort('blockedbyclient');return;}
    await route.continue();
  });
  context.on('page',(page:any)=>page.on('pageerror',(error:Error)=>browserErrors.push(error.name)));
  return context;
}

try {
  await mkdir(output,{recursive:true});
  const a=await fixture(),b=await fixture();
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const phone=await isolatedContext(a.base,{width:390,height:844}),desktop=await isolatedContext(a.base,{width:1480,height:960}),other=await isolatedContext(b.base,{width:390,height:844});
  let mobile=await phone.newPage();activePage=mobile;mobile.setDefaultTimeout(15_000);
  let rawText=`  隔离手机记录 ${suffix}：先保留原话。\n第二行保留来源与空白。  `,captured:any;
  const sent:any[]=[];
  phone.on('request',(request:any)=>{if(request.url().endsWith('/api/v1/inbox/commands/capture'))sent.push(request.postDataJSON());});
  if(resumeAfterPreSend) {
    const prior=JSON.parse(await readFile(join(output,'attempt-1-failure.json'),'utf8')) as {results:{name:string;status:'passed'|'failed'}[]};
    const passed=prior.results.filter(item=>item.status==='passed');assert.equal(passed.length,3);results.push(...passed.map(item=>({...item,source:'attempt-1-failure.json'})));
    await authenticate(mobile,a.base,true);const dialog=await openCapture(mobile);rawText+='\n离线时只留本机草稿。';await dialog.getByRole('textbox',{name:'原始内容',exact:true}).fill(rawText);
  } else {
  await check('mobile original-only capture and close/reopen retain local draft',async()=>{
    await authenticate(mobile,a.base,true);
    const dialog=await openCapture(mobile),raw=dialog.getByRole('textbox',{name:'原始内容',exact:true});
    assert.equal(await dialog.locator('details').evaluate((element:HTMLDetailsElement)=>element.open),false);
    await raw.pressSequentially(rawText,{delay:8});assert.equal(await raw.inputValue(),rawText);
    assert.equal(await raw.evaluate((element:HTMLElement)=>element===document.activeElement),true);
    await dialog.getByRole('status').filter({hasText:/草稿.*保存|本机草稿/}).waitFor();
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await mobile.screenshot({path:join(output,'phone-draft.png'),fullPage:true});
    await closeDialogs(mobile);const restored=await openCapture(mobile);assert.equal(await restored.getByRole('textbox',{name:'原始内容',exact:true}).inputValue(),rawText);assert.equal(sent.length,0);
  });
  await check('offline edits never auto-submit and reconnect reopen restores draft',async()=>{
    await phone.setOffline(true);rawText+='\n离线时只留本机草稿。';
    await mobile.getByRole('dialog').getByRole('textbox',{name:'原始内容',exact:true}).fill(rawText);
    await mobile.getByRole('dialog').getByRole('status').filter({hasText:/草稿.*保存|本机草稿/}).waitFor();await closeDialogs(mobile);
    await mobile.close();await phone.setOffline(false);mobile=await phone.newPage();activePage=mobile;mobile.setDefaultTimeout(15_000);
    await mobile.goto(a.base+'/?mode=platform#theme=stark&view=inbox',{waitUntil:'domcontentloaded'});await mobile.getByRole('heading',{name:'统一收件',exact:true}).waitFor();
    const dialog=await openCapture(mobile);assert.equal(await dialog.getByRole('textbox',{name:'原始内容',exact:true}).inputValue(),rawText);assert.equal(sent.length,0);
    const identity=(await api(phone,a.base,'/api/v1/capabilities')).data.identity;
    assert.equal(await mobile.evaluate(({prefix,actor})=>Object.keys(localStorage).some(key=>key===prefix+encodeURIComponent(actor)),{prefix:draftPrefix,actor:identity.actorId}),true);
  });
  await check('unavailable durable storage prevents sending and keeps original exportable',async()=>{
    await mobile.evaluate(()=>{
      Object.defineProperty(window,'__qaInboxSetItem',{value:Storage.prototype.setItem,configurable:true});
      Storage.prototype.setItem=function(){throw new DOMException('Synthetic QA storage failure','QuotaExceededError');};
    });
    try {
      const dialog=mobile.getByRole('dialog',{name:'快速记录',exact:true});await dialog.getByRole('button',{name:'保存记录',exact:true}).click();
      await dialog.getByText(/这次没有发送/).waitFor();assert.equal(sent.length,0);assert.equal(await dialog.getByRole('textbox',{name:'原始内容',exact:true}).inputValue(),rawText);
      const pending=mobile.waitForEvent('download');await dialog.getByRole('button',{name:'导出草稿',exact:true}).click();const download=await pending,stream=await download.createReadStream(),chunks:Buffer[]=[];
      assert.ok(stream);for await(const chunk of stream)chunks.push(Buffer.from(chunk));assert.equal(Buffer.concat(chunks).toString('utf8'),rawText);
      assert.equal((await records(phone,a.base)).length,0);
    } finally {
      await mobile.evaluate(()=>{Storage.prototype.setItem=(window as unknown as {__qaInboxSetItem:typeof Storage.prototype.setItem}).__qaInboxSetItem;delete (window as unknown as {__qaInboxSetItem?:unknown}).__qaInboxSetItem;});
    }
  });
  }
  await check('lost committed response freezes original and refresh retry uses one command ID',async()=>{
    let discard=true;
    await mobile.route('**/api/v1/inbox/commands/capture',async(route:any)=>{
      try {
        if(discard){
          discard=false;const response=await route.fetch();
          if(!response.ok()) {
            const body=await response.json().catch(()=>({}));captureHttpFailure={status:response.status(),code:typeof body.code==='string'?body.code:'UNKNOWN',fields:Array.isArray(body.details?.fields)?body.details.fields.filter((value:unknown)=>typeof value==='string'):[]};
            await route.fulfill({response});return;
          }
          await route.abort('failed');
        } else await route.continue();
      } catch {captureHttpFailure={status:0,code:'QA_ROUTE_FAILURE',fields:[]};await route.abort('failed').catch(()=>{});}
    });
    await mobile.getByRole('dialog').getByRole('button',{name:/^保存(到收件|记录)?$/,exact:false}).click();
    await mobile.getByRole('dialog').getByRole('button',{name:'重试确认',exact:true}).waitFor();
    const original=mobile.getByRole('dialog').getByRole('textbox',{name:'原始内容',exact:true});
    assert.equal(await original.evaluate((element:HTMLTextAreaElement)=>element.disabled||element.readOnly),true);
    assert.equal(sent.length,1);assert.equal((await records(phone,a.base)).filter(item=>item.rawText===rawText).length,1);
    await mobile.screenshot({path:join(output,'phone-save-unconfirmed.png'),fullPage:true});
    await mobile.reload({waitUntil:'domcontentloaded'});await mobile.getByRole('heading',{name:'统一收件',exact:true}).waitFor();
    const restored=await openCapture(mobile);assert.equal(await restored.getByRole('textbox',{name:'原始内容',exact:true}).inputValue(),rawText);
    assert.equal(await restored.getByRole('textbox',{name:'原始内容',exact:true}).evaluate((element:HTMLTextAreaElement)=>element.disabled||element.readOnly),true);
    await restored.getByRole('button',{name:'重试确认',exact:true}).click();await restored.getByText(/已保存到收件/).first().waitFor();
    assert.equal(sent.length,2);assert.equal(sent[0].commandId,sent[1].commandId);assert.deepEqual(sent[0],sent[1]);
    const found=(await records(phone,a.base)).filter(item=>item.rawText===rawText);assert.equal(found.length,1);captured=found[0];assert.equal(captured.scope,'private');assert.equal(captured.terminalId,'手机网页');assert.equal(captured.title,rawText.trim().replace(/\s+/g,' ').slice(0,80));
    await closeDialogs(mobile);
  });
  const computer=await desktop.newPage();computer.setDefaultTimeout(15_000);activePage=computer;
  const annotation=`annotation-${suffix}`,tag=`tag-${suffix}`,mergedKeyword=`merged-${suffix}`,mergedTerminal=`terminal-${suffix}`;
  await check('another browser on same real server sees record and organizes searchable tags',async()=>{
    await authenticate(computer,a.base,false);await computer.getByRole('button',{name:captured.title,exact:true}).click();
    await computer.getByRole('dialog').getByRole('button',{name:'整理记录',exact:true}).click();
    const form=computer.getByRole('dialog',{name:'整理记录',exact:true});await form.getByLabel('整理批注',{exact:true}).fill(annotation);await form.getByLabel('标签',{exact:true}).fill(tag+'，跨终端');
    await form.getByRole('button',{name:'保存记录',exact:true}).click();await form.waitFor({state:'hidden'});await closeDialogs(computer);
    const search=computer.getByRole('textbox',{name:/搜索原话/});
    for(const query of [annotation,tag]){await search.fill(query);await computer.locator('.op-card').getByRole('button',{name:captured.title,exact:true}).waitFor();assert.equal(await computer.locator('.op-card').count(),1);}
    const stored=(await records(desktop,a.base)).find(item=>item.id===captured.id);assert.equal(stored.annotation,annotation);assert.deepEqual(stored.tags,[tag,'跨终端']);assert.equal(stored.rawText,rawText);assert.equal(stored.terminalId,'手机网页');await search.fill('');
  });
  await check('merged original and terminal are searchable and archive opens linked research',async()=>{
    const origin=(await command(desktop,a.base,'capture',{rawText:'隔离的合并来源 '+mergedKeyword,kind:'idea',terminalId:mergedTerminal,origin:'manual'})).data;
    await command(desktop,a.base,'merge',{sourceId:origin.id,targetId:captured.id,reason:'隔离验收：保留不同终端的相关原话'},origin.revision);
    await computer.reload({waitUntil:'domcontentloaded'});await computer.getByRole('heading',{name:'统一收件',exact:true}).waitFor();
    const search=computer.getByRole('textbox',{name:/搜索原话/});
    for(const query of [mergedKeyword,mergedTerminal]){await search.fill(query);await computer.locator('.op-card').getByRole('button',{name:captured.title,exact:true}).waitFor();assert.equal(await computer.locator('.op-card').count(),1);}
    await computer.locator('.op-card').getByRole('button',{name:captured.title,exact:true}).click();await computer.getByRole('dialog').getByRole('button',{name:'分类归档',exact:true}).click();
    const form=computer.getByRole('dialog',{name:'分类归档',exact:true});await form.getByLabel('归档目标',{exact:true}).selectOption('research');await form.getByRole('button',{name:'保存记录',exact:true}).click();await form.waitFor({state:'hidden'});
    await computer.getByRole('dialog').getByRole('button',{name:'打开归档页',exact:true}).click();await computer.getByRole('heading',{name:'灵感研究',exact:true}).waitFor();await computer.getByRole('dialog',{name:captured.title,exact:true}).waitFor();
    const source=(await api(desktop,a.base,'/api/v1/inbox/'+captured.id)).data,target=(await api(desktop,a.base,'/api/v1/research/'+source.target.id)).data;
    assert.equal(target.sourceInboxId,captured.id);assert.equal(target.raw,rawText);assert.equal(target.terminalId,'手机网页');assert.deepEqual(source.tags,[tag,'跨终端']);assert.equal(source.origins[0].rawText,'隔离的合并来源 '+mergedKeyword);
    await computer.screenshot({path:join(output,'desktop-linked-research.png'),fullPage:true});await closeDialogs(computer);
  });
  await check('isolated browser contexts and separate temporary apps do not exchange private records or drafts',async()=>{
    const stranger=await other.request.get(a.base+'/api/v1/inbox/'+captured.id);assert.equal(stranger.status(),401);
    const otherPage=await other.newPage();activePage=otherPage;otherPage.setDefaultTimeout(15_000);await authenticate(otherPage,b.base,true);
    const dialog=await openCapture(otherPage),raw=dialog.getByRole('textbox',{name:'原始内容',exact:true});assert.equal(await raw.inputValue(),'');
    const otherRaw='隔离实例 B 原话 '+suffix;await raw.fill(otherRaw);await dialog.getByRole('button',{name:/^保存(到收件|记录)?$/,exact:false}).click();await dialog.getByText(/已保存到收件/).first().waitFor();await closeDialogs(otherPage);
    const privateB=await records(other,b.base);assert.equal(privateB.length,1);assert.equal(privateB[0].rawText,otherRaw);assert.equal(privateB.some(item=>item.id===captured.id),false);
    assert.equal((await records(desktop,a.base)).some(item=>item.rawText===otherRaw),false);
    const missing=await other.request.get(b.base+'/api/v1/inbox/'+captured.id);assert.equal(missing.status(),404);
  });
  activePage=mobile;
  await check('logout clears this browser draft and subsequent login opens empty capture',async()=>{
    const dialog=await openCapture(mobile);await dialog.getByRole('textbox',{name:'原始内容',exact:true}).fill('隔离退出清理草稿 '+suffix);await dialog.getByRole('status').filter({hasText:/草稿.*保存|本机草稿/}).waitFor();await closeDialogs(mobile);
    assert.equal(await mobile.evaluate(prefix=>Object.keys(localStorage).some(key=>key.startsWith(prefix)),draftPrefix),true);
    await mobile.getByRole('button',{name:'更多功能',exact:true}).click();await mobile.getByRole('button',{name:'退出登录',exact:true}).click();await mobile.getByLabel('管理密码',{exact:true}).waitFor();
    assert.equal(await mobile.evaluate(prefix=>Object.keys(localStorage).some(key=>key.startsWith(prefix)),draftPrefix),false);
    await authenticate(mobile,a.base,false);const empty=await openCapture(mobile);assert.equal(await empty.getByRole('textbox',{name:'原始内容',exact:true}).inputValue(),'');await closeDialogs(mobile);
  });
  await check('draft removal in a sibling tab invalidates the open editor',async()=>{
    const dialog=await openCapture(mobile);await dialog.getByRole('textbox',{name:'原始内容',exact:true}).fill('隔离跨标签清理 '+suffix);
    const before=sent.length,sibling=await phone.newPage();
    try {
      await sibling.goto(a.base+'/?mode=platform#theme=stark&view=inbox',{waitUntil:'domcontentloaded'});await sibling.getByRole('heading',{name:'统一收件',exact:true}).waitFor();
      await sibling.evaluate(prefix=>{for(const key of Object.keys(localStorage))if(key.startsWith(prefix))localStorage.removeItem(key);},draftPrefix);
      await dialog.getByText(/草稿已在另一个窗口更新或清除/).waitFor();assert.equal(await dialog.getByRole('textbox',{name:'原始内容',exact:true}).count(),0);await closeDialogs(mobile);
      const empty=await openCapture(mobile);assert.equal(await empty.getByRole('textbox',{name:'原始内容',exact:true}).inputValue(),'');assert.equal(sent.length,before);await closeDialogs(mobile);
    } finally {await sibling.close();}
  });
  await check('same-revision replacement in a sibling tab invalidates stale content',async()=>{
    const dialog=await openCapture(mobile);await dialog.getByRole('textbox',{name:'原始内容',exact:true}).fill('隔离同版本冲突 '+suffix);
    const before=sent.length,sibling=await phone.newPage();
    try {
      await sibling.goto(a.base+'/?mode=platform#theme=stark&view=inbox',{waitUntil:'domcontentloaded'});await sibling.getByRole('heading',{name:'统一收件',exact:true}).waitFor();
      await sibling.evaluate(prefix=>{const key=Object.keys(localStorage).find(value=>value.startsWith(prefix));if(!key)throw Error('Synthetic draft missing');const replacement=JSON.parse(localStorage.getItem(key)!);replacement.draft.rawText='隔离其他标签更新';localStorage.setItem(key,JSON.stringify(replacement));},draftPrefix);
      await dialog.getByText(/草稿已在另一个窗口更新或清除/).waitFor();assert.equal(await dialog.getByRole('textbox',{name:'原始内容',exact:true}).count(),0);assert.equal(sent.length,before);await closeDialogs(mobile);
    } finally {await sibling.close();}
  });
  assert.equal(modelCalls,0);assert.equal(blockedNetwork.length,0);assert.deepEqual(browserErrors,[]);
  results.push({name:'no model calls, external browser network, or browser runtime exceptions',status:'passed'});
} catch {
  if(!results.some(item=>item.name===activeStep&&item.status==='failed'))results.push({name:activeStep,status:'failed'});
  // Failure images contain only synthetic QA records. Do not log request bodies,
  // browser storage, cookies, credentials, or unrestricted exception objects.
  if(activePage&&!activePage.isClosed())await activePage.screenshot({path:join(output,'failure.png'),fullPage:true}).catch(()=>{});
  process.exitCode=1;
} finally {
  if(browser)await browser.close().catch(()=>{process.exitCode=1;});
  const cleaned=await Promise.allSettled(fixtures.map(async item=>{await item.runtime.app.close();await removeTemporary(item.directory);}));
  cleanupVerified=cleaned.every(item=>item.status==='fulfilled');if(!cleanupVerified)process.exitCode=1;
  await mkdir(output,{recursive:true});
  const report={at:new Date().toISOString(),resumedAfterPreSend:resumeAfterPreSend,realHttp:true,temporarySqlite:true,randomLoopbackPorts:true,productionAccess:false,remoteExecution:false,modelCalls,externalBrowserRequests:blockedNetwork.length,browserRuntimeExceptions:browserErrors.length,cleanupVerified,captureHttpFailure,scope:{offline:'Already loaded page accepts a local draft; reconnect is required to reopen the platform.',privacy:'Two isolated browser contexts and two independent disposable applications; same-instance family-only access is covered by the API test.'},results};
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  if(resumeAfterPreSend)await writeFile(join(output,'attempt-2.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:process.exitCode?'failed':'passed',passed:results.filter(item=>item.status==='passed').length,failed:results.filter(item=>item.status==='failed').length,failedStep:results.find(item=>item.status==='failed')?.name??null,cleanupVerified,modelCalls,captureHttpFailure}));
}
