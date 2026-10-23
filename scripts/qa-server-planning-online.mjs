/** Real isolated server + browser; no remote nodes, production data or model calls. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const option=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.split('=').slice(1).join('=');
const modulePath=option('playwright-module'),chrome=option('chromium');
if(!process.argv.includes('--child')){
 assert(modulePath&&chrome,'Pass --playwright-module and --chromium explicitly');
 const home=await mkdtemp(join(tmpdir(),'server-doc-browser-home-'));
 const child=spawn(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'--child',`--playwright-module=${resolve(modulePath)}`,`--chromium=${resolve(chrome)}`],{cwd:root,env:{HOME:home,USERPROFILE:home,PATH:process.env.PATH,LANG:'C.UTF-8',TZ:'UTC'},stdio:'inherit',detached:true});
 const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGTERM')}catch{}},90000);
 child.on('exit',async code=>{clearTimeout(timer);await rm(home,{recursive:true,force:true});process.exitCode=code??1;});
}else{
 const {chromium}=await import(pathToFileURL(resolve(modulePath)).href);
 const {startIsolatedProjectApp}=await import('../apps/api/test/helpers/isolated-project-app.ts');
 const fixture=await startIsolatedProjectApp({webDir:join(root,'apps/web/.dist-next')});let browser;
 try{
  fixture.runtime.store.setPassword('isolated-document-browser-password');const token=fixture.runtime.store.createLogin();
  browser=await chromium.launch({headless:true,executablePath:resolve(chrome)});const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});await context.addCookies([{name:'jarvis_session',value:token,url:fixture.baseUrl}]);
  const external=[],errors=[];await context.route('**/*',r=>new URL(r.request().url()).origin===fixture.baseUrl?r.continue():(external.push(r.request().url()),r.abort()));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(fixture.baseUrl+'/?mode=platform#view=machines');
  const link=page.getByRole('link',{name:'服务器配置与扩容规划',exact:true});await link.waitFor();assert.equal(await link.getAttribute('href'),'/api/runtime/server-planning/document');
  const popup=context.waitForEvent('page');await link.click();const doc=await popup;doc.on('pageerror',e=>errors.push(e.message));await doc.waitForLoadState();await doc.getByRole('heading',{name:'服务器扩容与AI节点规划',exact:true}).waitFor();
  for(let n=1;n<=11;n++)assert((await doc.locator('body').innerText()).includes('新增'+String(n).padStart(2,'0')));
  const response=await doc.reload();assert(response.headers()['content-type'].startsWith('text/html'));assert.match(response.headers()['cache-control'],/no-store/);
  for(const resource of ['source','registration','preview-guide']){const r=await context.request.get(fixture.baseUrl+'/api/runtime/server-planning/document?resource='+resource);assert.equal(r.status(),200);assert((await r.body()).length>100);}
  await doc.setViewportSize({width:390,height:844});assert(await doc.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await mkdir(join(root,'artifacts/server-planning-online'),{recursive:true});await doc.screenshot({path:join(root,'artifacts/server-planning-online/mobile.png'),fullPage:true});
  const anonymous=await browser.newContext();const denied=await anonymous.request.get(fixture.baseUrl+'/api/runtime/server-planning/document');assert.equal(denied.status(),401);assert(!(await denied.text()).includes('新增01'));assert((await denied.text()).includes('登录'));await anonymous.close();
  fixture.runtime.store.deleteLogin(token);const expired=await context.request.get(fixture.baseUrl+'/api/runtime/server-planning/document');assert.equal(expired.status(),401);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const report={schemaVersion:1,status:'passed',checksPassed:7,checks:['real device-management link opens protected HTML','all11 planning labels present','refresh HTML content-type and no-store','three explicit supporting resources accessible','390px no horizontal overflow','anonymous login hint and revoked session deny正文','no external request or browser exception'],scope:'Real isolated HTTP/SQLite and Chromium, not production acceptance',modelRequests:0,productionChanges:false};await writeFile(join(root,'artifacts/server-planning-online/browser-public.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await browser?.close();await fixture.close();}
}
