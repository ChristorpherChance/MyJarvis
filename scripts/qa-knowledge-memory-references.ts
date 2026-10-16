import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {delimiter,join,resolve,sep} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createApp} from '../apps/api/src/app.js';
import type {PiService} from '../apps/api/src/pi.js';

// New reference/query UI only. The PDF, manual transcriptions and private
// memories below are synthetic fixtures owned by this disposable local app.
const require=createRequire(import.meta.url),execute=promisify(execFile);
let modulePath:string;
try{modulePath=require.resolve('playwright')}catch{modulePath=require.resolve('playwright',{paths:(process.env.JARVIS_NODE_MODULES||'').split(delimiter).filter(Boolean)})}
const {chromium}=require(modulePath),output=resolve('artifacts/knowledge-memory-references-qa');
const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7),attempt=process.argv.find(arg=>arg.startsWith('--attempt='))?.slice(10)||'1';
const selected=only?.split(',').filter(Boolean),expectedMemoryBundle=process.argv.find(arg=>arg.startsWith('--memory-bundle='))?.slice(16),loadedBundles=new Set<string>();
const names=['knowledge-book-context','knowledge-revoked-reference','knowledge-version-stale-reference','memory-query-edit-forget','memory-session-details-cleared'];
assert.ok(!selected||selected.every(name=>names.includes(name)),'Unknown --only case');
const python=process.env.JARVIS_KNOWLEDGE_PYTHON??resolve('.runtime-venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const directory=await mkdtemp(join(tmpdir(),'jarvis-knowledge-memory-reference-')),password=randomUUID()+'-isolated';
const generator=join(directory,'make_reference_pdf.py');
const results:{name:string;status:'passed'|'failed';evidence?:Record<string,unknown>;failedStep?:string;diagnostic?:string}[]=[],browserErrors:string[]=[],outside:string[]=[];
let runtime:Awaited<ReturnType<typeof createApp>>|undefined,browser:any,base='',cookie='',step='initialize',modelCalls=0,cleanupVerified=false;
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const pi={initialize:async()=>{},health:()=>({configured:false}),modelIsLocal:()=>true,abort:async()=>{},dispose:async()=>{},run:async()=>{modelCalls++;throw Error('No model in local reference browser verification')}} as unknown as PiService;
function diagnostic(error:unknown){let value=String(error instanceof Error?error.stack:error).replaceAll(password,'[REDACTED]');if(cookie)value=value.replaceAll(cookie,'[REDACTED]');return value.slice(0,7000)}
async function bounded<T>(value:Promise<T>,label:string):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([value,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Timed out at '+label)),30000)})])}finally{clearTimeout(timer)}}
async function check(name:string,fn:()=>Promise<Record<string,unknown>>){
 if(selected&&!selected.includes(name))return;
 try{results.push({name,status:'passed',evidence:await fn()});console.log(JSON.stringify({name,status:'passed'}))}
 catch(error){results.push({name,status:'failed',failedStep:step,diagnostic:diagnostic(error)});console.log(JSON.stringify({name,status:'failed',failedStep:step}));process.exitCode=1;}
}
async function api(path:string,body?:unknown,method=body===undefined?'GET':'POST'){
 const response=await fetch(base+path,{method,headers:{cookie,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json() as any;assert.equal(response.status,200,JSON.stringify({path,status:response.status,error:data.error??data.message}));return data;
}
async function command(domain:'sources'|'books',name:string,payload:Record<string,unknown>,version=0,scope='family'){
 return (await api(`/api/v1/knowledge/${domain}/commands/${name}`,{commandId:randomUUID(),expectedVersion:version,scope,payload})).data;
}
async function context(view:'sources'|'memory'){
 const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36'});
 await c.route('**/*',async(route:any)=>{const url=new URL(route.request().url());if(url.origin!==base){outside.push(url.protocol);await route.abort('blockedbyclient');return}await route.continue()});
 const p=await c.newPage(),chunks=new Set<string>();p.setDefaultTimeout(20000);p.on('pageerror',(error:Error)=>browserErrors.push(error.name));p.on('response',(response:any)=>{const url=new URL(response.url());if(url.origin===base&&url.pathname.endsWith('.js')){loadedBundles.add(url.pathname);chunks.add(url.pathname)}});
 await p.goto(base+`/?mode=platform#theme=stark&view=${view}`);await p.getByLabel('管理密码',{exact:true}).fill(password);await p.getByRole('button',{name:'进入完整平台',exact:true}).click();await p.getByRole('heading',{name:view==='sources'?'知识接入':'记忆神殿',exact:true}).waitFor();if(view==='memory'&&expectedMemoryBundle)assert.ok([...chunks].some(url=>url.endsWith('/'+expectedMemoryBundle)),'Expected final memory bundle was not loaded');return {c,p,chunks};
}
async function screenshot(p:any,name:string){await p.screenshot({path:join(output,`${name}-${attempt}.png`),fullPage:true});}
async function failureScreenshot(p:any,name:string){if(!p.isClosed())await screenshot(p,name+'-failure').catch(()=>{});}
async function mobileFits(p:any){assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
async function bookFixture(label:string){
 const texts=[`REFERENCE PAGE ONE ${label}. This is the first source page.`,`Before the citation. ${label} is preserved on page two. After the citation, the source keeps the exact wording.`];
 const input=join(directory,label+'.json'),original=join(directory,label+'.pdf');await writeFile(input,JSON.stringify(texts));
 await execute(python,[generator,input,original],{windowsHide:true,timeout:30000,maxBuffer:65536,env:{...process.env,PYTHONIOENCODING:'utf-8'}});const pdf=await readFile(original);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
 const source=await command('sources','save',{name:`自建出处 ${label}`,type:'本地原件',mode:'local',endpoint:`inbox://reference-fixture-${randomUUID()}`,topics:'隔离引用验收',rights:'自行生成夹具，仅本机验收',authorized:true});
 const ticket=await command('books','create-upload',{sourceId:source.id,filename:'reference-original.pdf',size:pdf.length,mime:'application/pdf'});
 const uploaded=await fetch(base+`/api/v1/book-uploads/${ticket.id}/file`,{method:'PUT',headers:{cookie,'content-type':'application/octet-stream'},body:pdf});assert.equal(uploaded.status,200);await uploaded.arrayBuffer();
 let book=await command('books','create',{uploadId:ticket.id,title:`隔离书页 ${label}`,edition:'自行生成第一版',author:'本机验收',pages:2,rights:'自建夹具',layout:'两页英文文本'});
 for(let index=0;index<texts.length;index++){
  book=await command('books','page',{bookId:book.id,page:index+1,text:texts[index],evidence:`本机自建PDF第${index+1}页手工登记`,pagesVerified:true},book.revision);
  book=await command('books','review-page',{bookId:book.id,page:index+1,confirmed:true,pagesVerified:true,evidence:`独立回查自建PDF第${index+1}页`},book.revision);
 }
 book=await command('books','publish',{bookId:book.id,confirmed:true},book.revision);return {source,book,texts,label};
}
async function searchBook(p:any,fixture:Awaited<ReturnType<typeof bookFixture>>){
 await p.getByRole('tab',{name:'联合检索',exact:true}).click();await p.getByLabel('知识检索问题',{exact:true}).fill(fixture.label);
 const receive=p.waitForResponse((response:any)=>response.request().method()==='POST'&&response.url().endsWith('/knowledge/sources/commands/query'));
 await p.getByRole('button',{name:'开始检索',exact:true}).click();const response=await receive;assert.equal(response.status(),200);const query=(await response.json()).data;
 const result=query.results.find((r:any)=>r.book===fixture.book.id&&r.page===2);assert.ok(result);assert.equal(result.version,'1.0');assert.equal(result.sha256,hash(fixture.texts[1]));
 const card=p.locator('.kn-query-results article').filter({hasText:fixture.book.title}).filter({hasText:'第2页'});await card.getByRole('button',{name:'打开命中内容',exact:true}).waitFor();
 return {query,result,card,reference:{queryId:query.id,source:result.source,location:result.location,sha256:result.sha256}};
}
async function openReference(p:any,card:any){
 const receive=p.waitForResponse((response:any)=>response.request().method()==='POST'&&response.url().endsWith('/knowledge/references/resolve'));
 await card.getByRole('button',{name:'打开命中内容',exact:true}).click();const response=await receive;assert.equal(response.status(),200);const resolved=await response.json(),dialog=p.getByRole('dialog',{name:'检索出处',exact:true});await dialog.waitFor();return {dialog,resolved};
}
async function staleReference(p:any,card:any,expectedStatus:number,mutate:()=>Promise<void>){
 let release!:()=>void,arrive!:()=>void,finish!:(value:any)=>void,fail!:(error:unknown)=>void;
 const ready=new Promise<void>(resolve=>{arrive=resolve}),hold=new Promise<void>(resolve=>{release=resolve}),done=new Promise<any>((resolve,reject)=>{finish=resolve;fail=reject});
 void done.catch(()=>{});
 const pattern='**/api/v1/knowledge/references/resolve';
 await p.route(pattern,async(route:any)=>{try{arrive();await hold;const response=await route.fetch();const body=await response.json();assert.equal(response.status(),expectedStatus);assert.equal(body.text,undefined);assert.equal(body.data?.text,undefined);await route.fulfill({response}).catch(()=>{});finish({status:response.status()})}catch(error){fail(error);await route.abort('failed').catch(()=>{})}});
 try{
  await card.getByRole('button',{name:'打开命中内容',exact:true}).click();await bounded(ready,'old citation request');await mutate();release();const response=await bounded(done,'old citation response');
  await p.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const dialog=p.getByRole('dialog',{name:'检索出处',exact:true}),uiState=(await dialog.count())?'human-error':'closed';if(uiState==='human-error')await dialog.getByText(expectedStatus===403?'这份来源已经停用、撤销授权或不在当前可见范围内，无法打开。':'这条出处的来源或原文版本已经变化，请重新检索后再打开。',{exact:true}).waitFor();
  assert.equal(await p.getByLabel('检索摘录',{exact:true}).count(),0);return {status:response.status,uiState};
 }finally{release();await p.unroute(pattern)}
}
try{
 await mkdir(output,{recursive:true});
 await writeFile(generator,String.raw`from pathlib import Path
import sys,json,textwrap,pymupdf
texts=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
document=pymupdf.open()
for text in texts:
    page=document.new_page(width=595,height=400)
    page.insert_textbox(pymupdf.Rect(45,50,550,350),'\n'.join(textwrap.wrap(text,70)),fontsize=12)
document.save(sys.argv[2])
`);
 runtime=await createApp({dataDir:join(directory,'data'),pi,webDir:resolve('apps/web/dist'),pythonExecutable:python});
 await runtime.app.listen({host:'127.0.0.1',port:0});const address=runtime.app.server.address();assert.ok(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;
 const setup=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});assert.equal(setup.status,200);cookie=String(setup.headers.get('set-cookie')).split(';')[0];await setup.arrayBuffer();
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 await check('knowledge-book-context',async()=>{
  step='knowledge/context/setup-real-pdf-and-published-pages';const fixture=await bookFixture('REFERENCE-IRIS-CONTEXT'),{c,p}=await context('sources');
  try{
   step='knowledge/context/query-and-open';const found=await searchBook(p,fixture),{dialog,resolved}=await openReference(p,found.card);
   assert.equal(resolved.kind,'book-page');assert.equal(resolved.verifiedSourceText,true);assert.equal(resolved.page,2);assert.equal(resolved.version,'1.0');assert.equal(resolved.sha256,hash(fixture.texts[1]));assert.equal(resolved.text.slice(resolved.quoteStart,resolved.quoteStart+resolved.quote.length),found.result.text);
   await dialog.getByText('第2页 · 原文版本 1.0',{exact:true}).waitFor();const excerpt=dialog.getByLabel('检索摘录',{exact:true});assert.equal(await excerpt.textContent(),found.result.text);assert.ok((await dialog.innerText()).includes(fixture.texts[1]));
   await mobileFits(p);await excerpt.scrollIntoViewIfNeeded();await screenshot(p,'phone-book-page-context');
   return {publishedFixturePages:2,openedPage:2,resultVersion:'1.0',canonicalReference:true,currentWholePageShaVerified:true,excerptRangeVerified:true,mobileOverflow:false};
  }catch(error){await failureScreenshot(p,'knowledge-book-context');throw error}finally{await c.close()}
 });
 await check('knowledge-revoked-reference',async()=>{
  step='knowledge/revoked/setup';const fixture=await bookFixture('REFERENCE-IRIS-REVOKED'),{c,p}=await context('sources');
  try{
   const found=await searchBook(p,fixture);const opened=await openReference(p,found.card);await opened.dialog.getByRole('button',{name:'关闭',exact:true}).last().click();
   step='knowledge/revoked/revoke-while-old-canonical-open-is-held';const rejected=await staleReference(p,found.card,403,async()=>{const current=await api(`/api/v1/knowledge/sources/${fixture.source.id}`);await command('sources','authorize',{sourceId:fixture.source.id,authorized:false,reason:'本机验收撤销合成来源授权'},current.data.revision)});await mobileFits(p);await screenshot(p,'phone-revoked-reference-'+rejected.uiState);
   await p.reload();await p.getByRole('heading',{name:'知识接入',exact:true}).waitFor();await p.getByRole('tab',{name:'联合检索',exact:true}).click();assert.equal(await p.getByRole('dialog',{name:'检索出处',exact:true}).count(),0);assert.equal(await p.getByLabel('检索摘录',{exact:true}).count(),0);assert.equal(await p.locator('.kn-query-results article').filter({hasText:fixture.book.title}).count(),0);await mobileFits(p);await screenshot(p,'phone-revoked-source-no-old-text');
   return {oldCanonicalReferenceStatus:rejected.status,rejectedReaderState:rejected.uiState,returnedPrivateText:false,staleContextCleared:true,revokedResultRemoved:true,mobileOverflow:false};
  }catch(error){await failureScreenshot(p,'knowledge-revoked-reference');throw error}finally{await c.close()}
 });
 await check('knowledge-version-stale-reference',async()=>{
  step='knowledge/version/setup';const fixture=await bookFixture('REFERENCE-IRIS-VERSION'),{c,p}=await context('sources');
  try{
   const found=await searchBook(p,fixture);const opened=await openReference(p,found.card);await opened.dialog.getByRole('button',{name:'关闭',exact:true}).last().click();
   step='knowledge/version/republish-while-old-canonical-open-is-held';const rejected=await staleReference(p,found.card,409,async()=>{let book=await command('books','revision',{bookId:fixture.book.id,page:2,text:'CURRENT-EDITION-FERN replaces the prior page text.',reason:'本机合成新证据修订',checked:true},fixture.book.revision);book=await command('books','review-page',{bookId:book.id,page:2,confirmed:true,pagesVerified:true,evidence:'独立回查本机合成修订'},book.revision);book=await command('books','publish',{bookId:book.id,confirmed:true},book.revision);assert.equal(book.version,'1.1')});await mobileFits(p);await screenshot(p,'phone-stale-reference-'+rejected.uiState);
   await p.reload();await p.getByRole('heading',{name:'知识接入',exact:true}).waitFor();await p.getByRole('tab',{name:'联合检索',exact:true}).click();assert.equal(await p.getByRole('dialog',{name:'检索出处',exact:true}).count(),0);assert.equal(await p.getByLabel('检索摘录',{exact:true}).count(),0);assert.equal(await p.locator('.kn-query-results article').filter({hasText:fixture.book.title}).count(),0);await mobileFits(p);await screenshot(p,'phone-stale-book-version');
   return {oldCanonicalReferenceStatus:rejected.status,rejectedReaderState:rejected.uiState,currentPublishedVersion:'1.1',oldBodyNotSubstituted:true,staleContextCleared:true,mobileOverflow:false};
  }catch(error){await failureScreenshot(p,'knowledge-version-stale-reference');throw error}finally{await c.close()}
 });
 await check('memory-query-edit-forget',async()=>{
  step='memory/setup-55-confirmed-own-records';let target:any;
  const memory=(name:string,payload:Record<string,unknown>,revision=0,actor='server-admin')=>runtime!.memory.command(name,{commandId:randomUUID(),expectedVersion:revision,scope:'private',payload},actor).data;
  for(let i=1;i<=55;i++){const text=i===51?'I prefer VIOLET-QUARTZ notebooks.':`Confirmed local preference number ${i}.`;const candidate=memory('candidate',{text,category:'学习偏好',source:i===51?'Self-confirmed VIOLET-QUARTZ statement.':'自行生成的本人确认夹具'}),confirmed=memory('confirm',{memoryId:candidate.id,confirmed:true},candidate.revision);if(i===51)target=confirmed;}
  const foreign=memory('candidate',{text:'FOREIGN-MEMORY-ONLY belongs to a different actor.',category:'学习偏好',source:'另一身份自建夹具'},0,'member_reference_other');memory('confirm',{memoryId:foreign.id,confirmed:true},foreign.revision,'member_reference_other');
  const {c,p}=await context('memory');
  try{
   const input=p.getByLabel('按问题查找本人记忆',{exact:true}),resultsArea=p.getByLabel('本人记忆查询结果',{exact:true});
   const search=async(query:string)=>{await input.fill(query);const received=p.waitForResponse((response:any)=>response.request().method()==='POST'&&response.url().endsWith('/api/runtime/memory/query'));await p.getByRole('button',{name:'按问题查找',exact:true}).click();const response=await received;assert.equal(response.status(),200);assert.deepEqual(response.request().postDataJSON(),{query,limit:50});const data=await response.json();await resultsArea.waitFor();return data;};
   step='memory/query-record-after-first-50';const found=await search('VIOLET-QUARTZ');assert.equal(found.actorId,'server-admin');assert.equal(found.total,1);assert.equal(found.records[0].id,target.id);assert.equal(found.records[0].revision,target.revision);await resultsArea.getByText(target.text,{exact:true}).first().waitFor();await mobileFits(p);await resultsArea.scrollIntoViewIfNeeded();await screenshot(p,'phone-memory-51st-result');
   step='memory/edit-through-ui-invalidates-old-query';const card=p.locator('.fa-memory-card').filter({hasText:target.text});await card.getByRole('button',{name:'编辑',exact:true}).click();const editor=p.getByRole('dialog',{name:'修订这条记忆',exact:true});await editor.locator('textarea').fill('I now prefer CURRENT-VERMILION notebooks.');await editor.getByRole('button',{name:'确认修订',exact:true}).click();await editor.waitFor({state:'hidden'});await p.getByText('记忆已更新，请重新查询。',{exact:true}).waitFor();assert.equal(await resultsArea.getByText('本次命中摘录与定位',{exact:true}).count(),0);
   const old=await search('VIOLET-QUARTZ');assert.equal(old.total,0);assert.deepEqual(old.records,[]);const current=await search('CURRENT-VERMILION');assert.equal(current.total,1);assert.equal(current.records[0].id,target.id);assert.equal(current.records[0].sourceEvidenceStatus,'historical-before-edit');
   step='memory/forget-through-ui-invalidates-and-removes-current-query';const corrected=p.locator('.fa-memory-card').filter({hasText:'I now prefer CURRENT-VERMILION notebooks.'});await corrected.getByRole('button',{name:'忘记',exact:true}).click();const forget=p.getByRole('dialog',{name:'遗忘这条长期偏好',exact:true});await forget.getByRole('button',{name:'确认遗忘',exact:true}).click();await forget.waitFor({state:'hidden'});await p.getByText('记忆已更新，请重新查询。',{exact:true}).waitFor();const forgotten=await search('CURRENT-VERMILION');assert.equal(forgotten.total,0);assert.deepEqual(forgotten.records,[]);
   step='memory/foreign-owner-does-not-match';const different=await search('FOREIGN-MEMORY-ONLY');assert.equal(different.total,0);assert.deepEqual(different.records,[]);await mobileFits(p);await resultsArea.scrollIntoViewIfNeeded();await screenshot(p,'phone-memory-edited-forgotten-empty');
   const stored=runtime!.v1.read('memory',target.id,'server-admin')!;assert.equal(stored.status,'forgotten');assert.ok(!stored.text);return {confirmedOwnFixtureCount:55,foundPosition:51,actualOwner:'server-admin',editedThroughUi:true,oldEvidenceNotRecalled:true,forgottenThroughUi:true,foreignOwnerMatches:0,modelsInvoked:0,mobileOverflow:false};
  }catch(error){await failureScreenshot(p,'memory-query-edit-forget');throw error}finally{await c.close()}
 });
 await check('memory-session-details-cleared',async()=>{
  step='memory-session/setup-one-owned-active-record';const text='My SESSION-PURPLE-DETAIL preference is private.',candidate=runtime!.memory.command('candidate',{commandId:randomUUID(),expectedVersion:0,scope:'private',payload:{text,category:'学习偏好',source:'本人自建会话失效夹具'}},'server-admin').data;
  runtime!.memory.command('confirm',{commandId:randomUUID(),expectedVersion:candidate.revision,scope:'private',payload:{memoryId:candidate.id,confirmed:true}},'server-admin');
  const {c,p,chunks}=await context('memory');let other:any;
  try{
   step='memory-session/second-tab-authenticated-inbox';const auth=await c.request.get(base+'/api/auth/state');assert.equal((await auth.json()).authenticated,true);other=await c.newPage();other.setDefaultTimeout(20000);await other.goto(base+'/?mode=platform#theme=stark&view=inbox');await other.getByRole('heading',{name:'统一收件',exact:true}).waitFor();await p.reload();await p.getByRole('heading',{name:'记忆神殿',exact:true}).waitFor();
   step='memory-session/query-and-open-private-detail';await p.getByLabel('按问题查找本人记忆',{exact:true}).fill('SESSION-PURPLE-DETAIL');const response=p.waitForResponse((r:any)=>r.request().method()==='POST'&&r.url().endsWith('/api/runtime/memory/query'));await p.getByRole('button',{name:'按问题查找',exact:true}).click();assert.equal((await response).status(),200);const card=p.locator('.fa-memory-card').filter({hasText:text});await card.getByRole('button',{name:'来源与记录',exact:true}).click();const detail=p.getByRole('dialog',{name:'来源与修订记录',exact:true});await detail.waitFor();await detail.getByText(text,{exact:true}).waitFor();
   step='memory-session/another-tab-logout-clears-detail-and-query';assert.equal(await detail.isVisible(),true);await other.getByRole('button',{name:'更多功能',exact:true}).click();assert.equal(await detail.isVisible(),true);assert.ok((await detail.innerText()).includes('SESSION-PURPLE-DETAIL'));await other.locator('#platform-navigation').getByRole('button',{name:'退出登录',exact:true}).click();await other.getByLabel('管理密码',{exact:true}).waitFor();await detail.waitFor({state:'hidden'});
   await p.getByText('登录会话已变化',{exact:true}).waitFor();await p.getByRole('button',{name:'重新验证身份',exact:true}).waitFor();await p.waitForFunction(()=>!document.body.innerText.includes('SESSION-PURPLE-DETAIL')&&Array.from(document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')).every(element=>!element.value.includes('SESSION-PURPLE-DETAIL')));assert.equal(await p.getByText('本次命中摘录与定位',{exact:true}).count(),0);assert.equal(await p.locator('.fa-memory-card').filter({hasText:text}).count(),0);const input=p.getByLabel('按问题查找本人记忆',{exact:true});if(await input.count())assert.equal(await input.inputValue(),'');await mobileFits(p);await screenshot(p,'phone-cross-tab-logout-private-detail-cleared');
   return {secondTabAuthenticatedBeforeDetailOpened:true,detailStillVisibleImmediatelyBeforeLogout:true,secondTabActuallyLoggedOut:true,oldDetailClosed:true,queryTextCleared:true,oldInputTextCleared:true,oldRetrievalDetailsCleared:true,oldPrivateBodyHidden:true,oldAllCardNotRestored:true,mobileOverflow:false,loadedBundleUrls:[...chunks]};
  }catch(error){await failureScreenshot(p,'memory-session-details-cleared');if(other){await failureScreenshot(other,'memory-session-second-tab');const state={hasLogin:await other.getByLabel('管理密码',{exact:true}).count(),h1:await other.locator('h1').allTextContents()};throw new Error(String(error instanceof Error?error.message:error)+'\nSecond-tab state: '+JSON.stringify(state),{cause:error})}throw error}finally{await c.close()}
 });
 assert.equal(modelCalls,0);assert.deepEqual(browserErrors,[]);assert.deepEqual(outside,[]);
}catch(error){results.push({name:'harness',status:'failed',failedStep:step,diagnostic:diagnostic(error)});process.exitCode=1;}
finally{
 if(browser)await browser.close();try{if(runtime)await runtime.app.close();const target=resolve(directory);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes('jarvis-knowledge-memory-reference-'));await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100});cleanupVerified=true}catch{process.exitCode=1}
 await mkdir(output,{recursive:true});const report={at:new Date().toISOString(),attempt,only,expectedMemoryBundle,loadedBundleUrls:[...loadedBundles],realHttp:true,temporarySqlite:true,syntheticPdfAndManualTranscriptions:true,productionAccess:false,modelCalls,externalBrowserRequests:outside.length,browserRuntimeExceptions:browserErrors.length,cleanupVerified,results};await writeFile(join(output,`attempt-${attempt}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
