/** Disposable browser/API check for AI configuration preview; no remote actions or model calls. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile,readdir,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const getArg=name=>{const prefix=`--${name}=`;return process.argv.find(x=>x.startsWith(prefix))?.slice(prefix.length)};
const playwrightInput=getArg('playwright-module')??process.env.PROJECT_PLAYWRIGHT_MODULE;
const chromiumPath=getArg('chromium')??process.env.PROJECT_TEST_CHROMIUM;
if(!process.argv.includes('--child')){
 if(!playwrightInput||!chromiumPath)throw new Error('Configure Playwright using --playwright-module=<absolute module path> and --chromium=<browser executable>, or PROJECT_PLAYWRIGHT_MODULE / PROJECT_TEST_CHROMIUM.');
 const playwrightPath=resolve(playwrightInput);assert(isAbsolute(playwrightPath));
 const home=await mkdtemp(join(tmpdir(),'ai-development-preview-home-'));
 const child=spawn(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'--child',`--playwright-module=${playwrightPath}`,`--chromium=${resolve(chromiumPath)}`],{cwd:root,env:{HOME:home,USERPROFILE:home,PATH:process.env.PATH,LANG:'C.UTF-8',TZ:'UTC'},stdio:'inherit',detached:true});
 let hardTimer;const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGTERM')}catch{}hardTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}},5000)},120000);child.once('exit',async code=>{clearTimeout(timer);clearTimeout(hardTimer);await rm(home,{recursive:true,force:true});process.exitCode=code??1;});
}else{
 const playwrightPath=getArg('playwright-module')??process.env.PROJECT_PLAYWRIGHT_MODULE;
 const chromiumPath=getArg('chromium')??process.env.PROJECT_TEST_CHROMIUM;
 if(!playwrightPath||!chromiumPath)throw new Error('Playwright module and Chromium executable must be configured.');
 const {chromium}=await import(pathToFileURL(resolve(playwrightPath)).href);
 const {startIsolatedProjectApp}=await import('../apps/api/test/helpers/isolated-project-app.ts');
 const fixture=await startIsolatedProjectApp({webDir:join(root,'apps/web/.dist-next')});let browser;
 const hash=value=>createHash('sha256').update(value).digest('hex');
 async function snapshotFiles(directory){let result=[];for(const entry of await readdir(directory,{withFileTypes:true}).catch(()=>[])){const path=join(directory,entry.name);if(entry.isDirectory())result.push(...await snapshotFiles(path));else if(entry.isFile()&&path.includes(`${join(fixture.dataDir,'ai-development')}/`)){const info=await stat(path);result.push([path.slice(fixture.dataDir.length),info.size,info.mtimeMs,hash(await readFile(path))]);}}return result.sort((a,b)=>a[0].localeCompare(b[0]));}
 function snapshotDatabase(){const db=fixture.runtime.identity.db;const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);return tables.map(name=>[name,db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()]);}
 try{
  fixture.runtime.store.setPassword('isolated-preview-browser-password');const token=fixture.runtime.store.createLogin();
  const api=async(path,body)=>{const response=await fetch(fixture.baseUrl+path,{method:body?'POST':'GET',headers:{cookie:'jarvis_session='+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const text=await response.text();assert(response.ok,`${path} HTTP ${response.status}: ${text}`);return JSON.parse(text)};
  const machine=(await api('/api/v1/machines/commands/register',{commandId:randomUUID(),scope:'personal',expectedVersion:0,payload:{name:'隔离预览合成节点',role:'仅浏览器测试',category:'server',ram:8,always:false,address:'192.0.2.123'}})).data;
  const queue=join(fixture.dataDir,'ai-development/queue');await mkdir(join(queue,'requests'),{recursive:true});await mkdir(join(queue,'results/observations'),{recursive:true});
  const profile={id:'preview-fixture-v1',revision:1,name:'合成只读预览模板',tools:[{name:'claude',version:'2.1.292'}],providers:[{id:'fixture-provider',name:'合成供应商',model:'fixture-model',credentialConfigured:false}],statuslineVersion:'1'};
  const policy={version:1,profiles:[profile],nodes:[{machineId:machine.id,nodeId:'fixture-node',address:machine.address,targetUser:'fixture',profileIds:[profile.id]}]};
  await writeFile(join(fixture.dataDir,'ai-development/config.json'),JSON.stringify(policy));
  await writeFile(join(queue,'results/_status.json'),JSON.stringify({online:true,at:new Date().toISOString()}));
  // Legacy periodic evidence is deliberately machine-revision-unverified, hence reference-only.
  const observation={schemaVersion:1,machineId:machine.id,nodeId:'fixture-node',address:machine.address,targetUser:'fixture',profileId:profile.id,profileRevision:profile.revision,profileHash:hash(Buffer.from(JSON.stringify(profile))),policyHash:'0'.repeat(64),at:new Date().toISOString(),source:'fixed-ssh-ai-development-telemetry',inventory:{schemaVersion:1,tools:[{name:'claude',version:'2.1.292',installed:true}],providers:[],statusline:{configured:false}}};
  // The periodic parser enforces canonical profile/policy hashes; derive them using the app helper.
  const {aiDevelopmentHash}=await import('../apps/api/src/runtime/ai-development.ts');observation.profileHash=aiDevelopmentHash(profile);observation.policyHash=aiDevelopmentHash(policy);
  await writeFile(join(queue,'results/observations',machine.id+'.json'),JSON.stringify(observation));
  browser=await chromium.launch({headless:true,executablePath:resolve(chromiumPath)});
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});await context.addCookies([{name:'jarvis_session',value:token,url:fixture.baseUrl}]);
  const requests=[],errors=[],external=[];
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==new URL(fixture.baseUrl).origin){external.push(url.href);return route.abort()}const path=url.pathname;if(path.startsWith('/api/runtime/ai-development/')||path.includes('cc-switch')||path.includes('ccswitch'))requests.push({method:route.request().method(),path});return route.continue()});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(fixture.baseUrl+'/?mode=platform#view=operations/ai-development');
  await page.getByLabel('AI开发环境目标机器').waitFor();
  await page.getByLabel('AI开发环境目标机器').selectOption(machine.id);
  await page.getByRole('button',{name:'只读差异预览',exact:true}).click();
  const afterEnter=requests.length;
  await page.getByLabel('预览环境模板').selectOption(profile.id);
  await page.getByRole('button',{name:'生成预览',exact:true}).click();
  await page.getByRole('heading',{name:'比较依据',exact:true}).waitFor();
  assert(await page.getByText('仅供参考',{exact:true}).isVisible());
  assert(await page.getByText('机器修订未核验',{exact:true}).isVisible());
  assert(await page.getByText('观察未绑定可核验的机器修订；仅供参考（MACHINE_REVISION_UNVERIFIED）',{exact:true}).isVisible());
  const previewRequest=requests.find(r=>r.path.endsWith('/preview'));
  assert(previewRequest&&previewRequest.method==='GET');
  assert(!requests.slice(afterEnter).some(r=>/\/machines\/[^/]+$/.test(r.path)||r.path.endsWith('/jobs')||r.path.includes('/jobs/')),'preview mode must not poll machine details or jobs');
  assert(!requests.slice(afterEnter).some(r=>r.method!=='GET'),'preview mode may only issue safe GETs');
  assert(await page.getByText('凭据',{exact:true}).isVisible());assert(await page.getByText('权限',{exact:true}).isVisible());
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'390px viewport overflows horizontally');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const beforeDb=snapshotDatabase(),beforeFiles=await snapshotFiles(fixture.dataDir);
  const beforePreviewCount=requests.filter(r=>r.path.endsWith('/preview')).length;
  // Wait for the response, not a heading left over from a previous request.
  const nextResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/preview'));
  await page.getByRole('button',{name:'生成预览',exact:true}).click();await nextResponse;await page.getByRole('heading',{name:'比较依据',exact:true}).waitFor();
  assert.equal(requests.filter(r=>r.path.endsWith('/preview')).length,beforePreviewCount+1);
  await page.waitForTimeout(5500);
  assert(!requests.slice(afterEnter).some(r=>/\/machines\/[^/]+$/.test(r.path)||r.path.endsWith('/jobs')||r.path.includes('/jobs/')||r.path.includes('cc-switch')||r.path.includes('ccswitch')),'no old management polling after its 5s interval');
  assert.deepEqual(snapshotDatabase(),beforeDb,'initial repeated preview must not write SQLite');assert.deepEqual(await snapshotFiles(fixture.dataDir),beforeFiles,'initial repeated preview must not change file metadata');
  await page.getByLabel('预览比较方式').selectOption('reconcile');assert.equal(await page.getByRole('heading',{name:'比较依据',exact:true}).count(),0);
  const modeResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/preview'));await page.getByRole('button',{name:'生成预览',exact:true}).click();await modeResponse;await page.getByRole('heading',{name:'比较依据',exact:true}).waitFor();
  await rm(join(queue,'results/observations',machine.id+'.json'));
  const emptyResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/preview'));await page.getByRole('button',{name:'生成预览',exact:true}).click();await emptyResponse;await page.getByText('无可用观察',{exact:true}).waitFor();
  await writeFile(join(queue,'results/observations',machine.id+'.json'),JSON.stringify(observation));
  let release,intercepted;const ready=new Promise(resolve=>{intercepted=resolve}),hold=new Promise(resolve=>{release=resolve});
  await page.route('**/api/runtime/ai-development/machines/*/preview?*',async route=>{const response=await route.fetch();intercepted();await hold;await route.fulfill({response});},{times:1});
  await page.getByRole('button',{name:'生成预览',exact:true}).click();await ready;await page.getByLabel('预览比较方式').selectOption('supplement');release();
  await page.waitForTimeout(200);assert.equal(await page.getByRole('heading',{name:'比较依据',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'生成预览',exact:true}).isEnabled(),true);
  const finalResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/preview'));await page.getByRole('button',{name:'生成预览',exact:true}).click();await finalResponse;await page.getByRole('heading',{name:'比较依据',exact:true}).waitFor();
  const screenshot=join(root,'artifacts/ai-config-preview/preview-mobile.png');await mkdir(dirname(screenshot),{recursive:true});await page.screenshot({path:screenshot,fullPage:true});
  assert.deepEqual(snapshotDatabase(),beforeDb,'preview must not mutate SQLite rows (including jobs/audit/usage)');
  // The fixture deliberately removed/restored one observation above; its mtime must change, its bytes must not.
  assert.deepEqual((await snapshotFiles(fixture.dataDir)).map(([path,size,_mtime,digest])=>[path,size,digest]),beforeFiles.map(([path,size,_mtime,digest])=>[path,size,digest]),'preview must not mutate queue, policy, or observation contents');
  const report={status:'passed',checks:['periodic observation renders reference-only with machine revision unverified','only GET preview request; machine details/jobs/CC Switch are not polled after entering preview','preserved credentials and permissions explained','390px viewport has no horizontal overflow','no external request or browser exception','repeat preview leaves every SQLite table and data/queue file unchanged','mode change clears old result and late response is discarded without a stuck loading state','removed observation displays unavailable without dispatch'],checksPassed:8,fixture:'Synthetic owned machine and legacy periodic observation; not a real node diagnosis',modelRequests:0,remoteActions:0,productionChanges:false};
  await writeFile(join(root,'artifacts/ai-config-preview/browser-public.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await browser?.close();await fixture.close();}
}
