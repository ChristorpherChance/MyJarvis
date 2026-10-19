/** Real platform browser/HTTP/SQLite acceptance. Never accepts an existing server URL. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {access,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv.includes('--isolated-child')){
 const env={};
 for(const key of ['PATH','SystemRoot','WINDIR','TMPDIR','TMP','TEMP','LANG','LC_ALL','TZ'])if(process.env[key]!==undefined)env[key]=process.env[key];
 const {chromium}=await import('@playwright/test');
 try{await access(join(root,'apps/web/dist/index.html'));await access(chromium.executablePath());}catch{throw Error('Build the web workspace and run npx playwright install chromium before project browser acceptance.');}
 const privateHome=await mkdtemp(join(tmpdir(),'jarvis-project-browser-home-'));
 env.HOME=privateHome;env.USERPROFILE=privateHome;
 env.PROJECT_TEST_CHROMIUM=chromium.executablePath();
 const child=spawn(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'--isolated-child'],{cwd:root,env,stdio:'inherit',shell:false,detached:process.platform!=='win32'});
 let escalation,timedOut=false;
 const signal=kind=>{if(child.pid)try{process.kill(process.platform==='win32'?child.pid:-child.pid,kind);}catch(error){if(error.code!=='ESRCH')throw error;}};
 const stop=()=>{signal('SIGTERM');escalation??=setTimeout(()=>signal('SIGKILL'),5000);};
 const timer=setTimeout(()=>{timedOut=true;stop();},240000);
 for(const kind of ['SIGINT','SIGTERM'])process.once(kind,stop);
 child.once('error',error=>{clearTimeout(timer);clearTimeout(escalation);console.error(error.message);process.exitCode=1;void rm(privateHome,{recursive:true,force:true}).catch(()=>{process.exitCode=1;});});
 child.once('exit',code=>{clearTimeout(timer);clearTimeout(escalation);process.exitCode=timedOut?1:code??1;void rm(privateHome,{recursive:true,force:true}).catch(()=>{process.exitCode=1;});});
}else{
 const {chromium}=await import('@playwright/test');
 const {startIsolatedProjectApp}=await import('../apps/api/test/helpers/isolated-project-app.ts');
 const attempt=randomUUID(),out=join(root,'artifacts/project-acceptance',attempt);
 await mkdir(out,{recursive:true});
 const results=[],pageErrors=[],unexpectedHTTP=[],externalRequests=[];
 let fixture,browser,context,base='',modelCalls=0,activeCheck='setup',page;
 const password='Isolated-project-'+randomUUID();
 const pi={initialize:async()=>{},dispose:async()=>{},abort:async()=>{},health:()=>({configured:false}),run:async()=>{modelCalls++;throw Error('MODELS_FORBIDDEN');}};
 const originalFetch=globalThis.fetch;
 globalThis.fetch=(input,options)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(url.origin!==base){externalRequests.push(url.origin);throw Error('EXTERNAL_FETCH_FORBIDDEN');}return originalFetch(input,options);};
 const check=async(name,fn)=>{activeCheck=name;await fn();results.push({name,status:'passed'});console.log('PASS '+name);};
 try{
  fixture=await startIsolatedProjectApp({webDir:join(root,'apps/web/dist'),pi});base=fixture.baseUrl;
  const health=await (await fetch(base+'/api/health')).json();assert.equal(health.instanceId,fixture.instanceId);assert(![3140,3141,3142,43140,45173].includes(Number(new URL(base).port)));
  browser=await chromium.launch({headless:true,executablePath:process.env.PROJECT_TEST_CHROMIUM});context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  let apiSlot=0;
  await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base){externalRequests.push(url.origin);return route.abort();}if(url.pathname.startsWith('/api/')){const now=Date.now(),wait=Math.max(0,apiSlot-now);apiSlot=Math.max(now,apiSlot)+250;if(wait)await new Promise(resolve=>setTimeout(resolve,wait));}return route.continue();});
  page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('response',r=>{if(r.status()>=500)unexpectedHTTP.push({path:new URL(r.url()).pathname,status:r.status()});});
  const api=async(path,body,method=body===undefined?'GET':'POST')=>{let response=await context.request.fetch(base+path,{method,...(body===undefined?{}:{data:body})});if(method==='GET'&&response.status()===429){const seconds=Number(response.headers()['retry-after']);assert(Number.isFinite(seconds)&&seconds>=0&&seconds<=65,'bounded GET rate-limit wait');await new Promise(resolve=>setTimeout(resolve,(seconds+1)*1000));response=await context.request.get(base+path);}const value=await response.json();assert(response.ok(),`${path}: HTTP ${response.status()}`);return value;};
  const records=async domain=>(await api('/api/v1/'+domain+'?limit=100')).data.items;
  const dialog=()=>page.getByRole('dialog');
  const submitDialog=async()=>{await dialog().getByRole('button',{name:'保存记录',exact:true}).click();await dialog().waitFor({state:'hidden'});};
  const details=async()=>{const region=page.locator('details').filter({has:page.locator(':scope > summary').filter({hasText:/^项目资料与开发副本$/})}).first();if(!await region.evaluate(e=>e.open))await region.locator('summary').first().click();return region;};
  let projectId,machineId;
  await check('fresh-admin-setup-real-platform',async()=>{
   await page.goto(base+'/?mode=platform#theme=stark&view=projects');await page.getByLabel('管理密码',{exact:true}).fill(password);await page.getByLabel('确认密码',{exact:true}).fill(password);await page.getByRole('button',{name:'创建账户',exact:true}).click();await page.getByRole('heading',{name:'项目',exact:true,level:2}).waitFor();assert.equal((await records('projects')).length,0);
  });
  await check('create-project-through-current-ui',async()=>{
   await page.getByRole('button',{name:'新建项目',exact:true}).click();await dialog().getByLabel('项目名称',{exact:true}).fill('项目板块隔离验收');await dialog().getByLabel('项目说明',{exact:true}).fill('真实浏览器和临时SQLite，不调用模型');await dialog().getByLabel('交付目标',{exact:true}).fill('验证项目管理及受控监管');await dialog().getByLabel('里程碑（每行一项）',{exact:true}).fill('基础管理\n独立验证');await submitDialog();
   await page.getByRole('heading',{name:'项目板块隔离验收',exact:true}).first().waitFor();const projects=await records('projects');assert.equal(projects.length,1);projectId=projects[0].id;assert(page.url().includes(projectId));
  });
  await check('edit-project-and-environment-persist',async()=>{
   await details();await page.getByRole('button',{name:'编辑项目资料',exact:true}).click();await dialog().getByLabel('名称',{exact:true}).fill('项目板块隔离验收·已编辑');await submitDialog();assert.equal((await records('projects'))[0].name,'项目板块隔离验收·已编辑');
   await page.getByRole('button',{name:'环境资料',exact:true}).click();await dialog().getByLabel('环境与依赖',{exact:true}).fill('Node24 / 专用临时数据库');await dialog().getByLabel('启动方式',{exact:true}).fill('仅隔离fixture启动');await dialog().getByLabel('验收方式',{exact:true}).fill('真实浏览器回读');await submitDialog();assert.equal((await records('projects'))[0].environmentInfo.runCommand,'仅隔离fixture启动');
  });
  await check('register-copy-record-only-and-preflight-no-dispatch',async()=>{
   const created=await api('/api/v1/machines/commands/register',{commandId:randomUUID(),scope:'personal',expectedVersion:0,payload:{name:'隔离开发机器',role:'test',category:'workstation',ram:16,always:false}});machineId=created.data.id;
   await page.reload();await details();await page.getByRole('button',{name:'登记开发目录',exact:true}).click();await dialog().getByLabel('执行服务器',{exact:true}).selectOption(machineId);await dialog().getByLabel('已授权目录',{exact:true}).fill(join(fixture.dataDir,'workspace'));await dialog().getByLabel('分支',{exact:true}).fill('acceptance');await submitDialog();
   const project=(await records('projects'))[0];assert.equal(project.copies.length,1);assert.equal((await records('tasks')).length,0);assert.equal(fixture.runtime.execution.listRuns().length,0);
   const response=await context.request.post(base+`/api/v1/projects/${projectId}/workbench/kickoff`,{data:{commandId:randomUUID(),expectedProjectRevision:project.revision,goal:'尚未配置不得执行',criteria:['没有新运行'],machineId,executorId:'unconfigured',workspace:join(fixture.dataDir,'workspace'),acknowledgeUnknownHistory:true,maxParentTokens:1000}});assert.equal(response.status(),409);assert.equal((await records('tasks')).length,0);assert.equal(fixture.runtime.execution.listRuns().length,0);
  });
  await check('milestone-cas-and-browser-reload',async()=>{
   await details();await page.getByRole('navigation',{name:'项目资料详情'}).getByRole('button',{name:'里程碑',exact:true}).click();await page.getByRole('button',{name:'记录验收',exact:true}).first().click();await dialog().getByLabel('依据/证据',{exact:true}).fill('专用验收：已通过资料保存和副本登记回读，不代表产品完成');await submitDialog();assert.equal((await records('projects'))[0].milestones[0].completed,true);
   const old=(await records('projects'))[0];await api('/api/v1/projects/commands/update',{commandId:randomUUID(),expectedVersion:old.revision,scope:'personal',payload:{projectId,name:old.name,goal:old.goal,description:'并发修订'}});
   const conflict=await context.request.post(base+'/api/v1/projects/commands/update',{data:{commandId:randomUUID(),expectedVersion:old.revision,scope:'personal',payload:{projectId,name:old.name,goal:old.goal,description:'不得覆盖新版本'}}});assert.equal(conflict.status(),409);assert.equal((await records('projects'))[0].description,'并发修订');
   await page.reload();await page.getByRole('heading',{name:'项目板块隔离验收·已编辑',exact:true}).first().waitFor();
  });
  await check('browser-cas-conflict-retains-draft-without-overwriting-new-version',async()=>{
   await details();await page.getByRole('button',{name:'编辑项目资料',exact:true}).click();await dialog().getByLabel('名称',{exact:true}).fill('冲突草稿需保留');
   const old=(await records('projects'))[0];await api('/api/v1/projects/commands/update',{commandId:randomUUID(),expectedVersion:old.revision,scope:'personal',payload:{projectId,name:old.name,goal:old.goal,description:'另一窗口已保存的新内容'}});
   await dialog().getByRole('button',{name:'保存记录',exact:true}).click();await dialog().getByRole('alert').filter({hasText:/版本|刷新/}).waitFor();assert.equal(await dialog().getByLabel('名称',{exact:true}).inputValue(),'冲突草稿需保留');
   assert.equal((await records('projects'))[0].description,'另一窗口已保存的新内容');assert.notEqual((await records('projects'))[0].name,'冲突草稿需保留');await dialog().getByRole('button',{name:'取消',exact:true}).click();await page.reload();await page.getByRole('heading',{name:'项目板块隔离验收·已编辑',exact:true}).first().waitFor();
  });
  await check('workbench-read-failure-disables-actions-and-recovers',async()=>{
   const path=`/api/v1/projects/${projectId}/workbench`,pattern='**'+path;
   await page.route(pattern,route=>route.abort('connectionfailed'));
   await page.getByRole('button',{name:'刷新',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'读取失败'}).waitFor();
   assert.equal(await page.locator('.workbench-focus-heading button').isDisabled(),true);
   assert.equal(fixture.runtime.execution.listRuns().length,0);
   await page.unroute(pattern);await page.getByRole('button',{name:'刷新',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('.workbench-focus-heading button')?.disabled);
   assert.equal(await page.getByRole('alert').filter({hasText:'读取失败'}).count(),0);
  });
  await check('legacy-deep-links-and-unknown-task-isolation',async()=>{
   await page.goto(base+'/?mode=platform#theme=stark&view='+encodeURIComponent('supervision/'+projectId));await page.getByRole('heading',{name:'项目板块隔离验收·已编辑',exact:true}).first().waitFor();
   await page.goto(base+'/?mode=platform#theme=stark&view='+encodeURIComponent('tasks/'+randomUUID()));await page.getByRole('heading',{name:'项目',exact:true,level:2}).waitFor();assert.equal((await records('projects')).length,1);
  });
  await check('project-archive-persists-and-prevents-subsequent-edit',async()=>{
   const archived=await api('/api/v1/projects/commands/register',{commandId:randomUUID(),scope:'personal',expectedVersion:0,payload:{name:'专用归档验收',description:'仅测试归档',goal:'归档后不可修改',milestones:['历史保留']}});
   await page.goto(base+'/?mode=platform#theme=stark&view='+encodeURIComponent('projects/'+archived.data.id+'?tab=copies'));await page.reload();await page.getByRole('button',{name:'归档项目',exact:true}).click();await dialog().getByLabel('归档原因',{exact:true}).fill('专用空项目验收结束');await submitDialog();
   const stored=(await records('projects')).find(p=>p.id===archived.data.id);assert.equal(stored.status,'archived');
   const rejected=await context.request.post(base+'/api/v1/projects/commands/update',{data:{commandId:randomUUID(),scope:'personal',expectedVersion:stored.revision,payload:{projectId:stored.id,name:stored.name,description:'不应被保存',goal:stored.goal}}});assert.equal(rejected.status(),409);
   await page.reload();await page.getByRole('heading',{name:'专用归档验收',exact:true}).first().waitFor();
  });
  for(const width of [390,360])await check('mobile-'+width+'-project-form-and-layout',async()=>{
   await page.setViewportSize({width,height:844});await page.goto(base+'/?mode=platform#theme=stark&view='+encodeURIComponent('projects/'+projectId+'?tab=copies'));await page.getByRole('button',{name:'编辑项目资料',exact:true}).click();await dialog().getByLabel('名称',{exact:true}).fill('项目板块隔离验收·已编辑');await submitDialog();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(out,'mobile-'+width+'.png'),fullPage:true});
  });
  await check('offline-current-project-recovers-without-duplicate-writes',async()=>{
   await page.setViewportSize({width:1440,height:1000});await context.setOffline(true);
   try{await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByRole('alert').filter({hasText:'读取失败'}).waitFor();assert.equal(await page.locator('.workbench-focus-heading button').isDisabled(),true);}
   finally{await context.setOffline(false);}
   await page.getByRole('button',{name:'刷新',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.workbench-focus-heading button')?.disabled);
   assert.equal((await records('projects')).length,2);assert.equal((await records('tasks')).length,0);
  });
  await check('late-workbench-response-cannot-replace-new-project',async()=>{
   const foreign=(await records('projects')).find(item=>item.id!==projectId);assert(foreign);
   const path=`/api/v1/projects/${projectId}/workbench`,pattern='**'+path;let held=false,release,arrived;const released=new Promise(resolve=>release=resolve),arrival=new Promise(resolve=>arrived=resolve);
   await page.route(pattern,async route=>{if(held)return route.continue();held=true;const response=await route.fetch();arrived();await released;await route.fulfill({response}).catch(()=>{});});
   try{await page.getByRole('button',{name:'刷新',exact:true}).click();await Promise.race([arrival,new Promise((_,reject)=>setTimeout(()=>reject(Error('late-response fixture did not intercept GET')),10000))]);
    await page.getByLabel('切换项目',{exact:true}).selectOption(foreign.id);await page.getByRole('heading',{name:foreign.name,exact:true}).first().waitFor();release();
    await page.waitForTimeout(300);assert.equal(await page.getByRole('heading',{name:'项目板块隔离验收·已编辑',exact:true}).count(),0);assert.equal(await page.getByLabel('切换项目',{exact:true}).inputValue(),foreign.id);
   }finally{release();await page.unroute(pattern);}
   await page.getByLabel('切换项目',{exact:true}).selectOption(projectId);await page.getByRole('heading',{name:'项目板块隔离验收·已编辑',exact:true}).first().waitFor();
  });
  await check('auth-revocation-rejects-late-private-response-without-page-reload',async()=>{
   const pattern=`**/api/v1/projects/${projectId}/workbench`;let intercepted=false,release,arrived;const gate=new Promise(resolve=>release=resolve),arrival=new Promise(resolve=>arrived=resolve);
   await page.route(pattern,async route=>{if(intercepted)return route.continue();intercepted=true;const response=await route.fetch();arrived();await gate;await route.fulfill({response}).catch(()=>{});});
   try{await page.getByRole('button',{name:'刷新',exact:true}).click();await Promise.race([arrival,new Promise((_,reject)=>setTimeout(()=>reject(Error('revocation fixture did not intercept GET')),10000))]);
    await api('/api/auth/logout',{},'POST');
    const denied=await page.evaluate(()=>fetch('/api/v1/projects?limit=1').then(response=>response.status));assert.equal(denied,401);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('heading',{name:'欢迎回来',exact:true}).waitFor();release();await page.waitForTimeout(250);
    assert.equal(await page.locator('.project-workbench').count(),0);assert.equal(await page.getByRole('button',{name:'编辑项目资料',exact:true}).count(),0);
   }finally{release();await page.unroute(pattern);}
   await page.getByLabel('管理密码',{exact:true}).fill(password);await page.getByRole('button',{name:'进入完整平台',exact:true}).click();await page.getByRole('heading',{name:'项目板块隔离验收·已编辑',exact:true}).first().waitFor();
  });
  await check('auth-revocation-clears-private-project-view',async()=>{
   await api('/api/auth/logout',{},'POST');await page.reload();await page.getByRole('heading',{name:'欢迎回来',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'编辑项目资料',exact:true}).count(),0);const r=await context.request.get(base+`/api/v1/projects/${projectId}/workbench`);assert.equal(r.status(),401);
  });
  await check('aggregate-no-model-network-or-browser-errors',async()=>{assert.equal(modelCalls,0);assert.equal(externalRequests.length,0);assert.deepEqual(pageErrors,[]);assert.deepEqual(unexpectedHTTP,[]);});
 }catch(error){process.exitCode=1;results.push({name:activeCheck,status:'failed',error:String(error.message).replaceAll(base,'[isolated-origin]').replaceAll(password,'[redacted]')});if(page)await page.screenshot({path:join(out,'failure.png'),fullPage:true}).catch(()=>{});}
 finally{
  const cleanupErrors=[];
  for(const [name,resource] of [['context',context],['browser',browser],['fixture',fixture]])try{await resource?.close();}catch(error){cleanupErrors.push({resource:name,errorType:error.name});process.exitCode=1;}
  globalThis.fetch=originalFetch;
  const report={schemaVersion:1,at:new Date().toISOString(),attempt,passed:results.every(r=>r.status==='passed')&&cleanupErrors.length===0,scope:'real-browser-loopback-HTTP-SQLite; no real model or factory execution',results,modelCalls,externalRequests:externalRequests.length,pageErrors,unexpectedHTTP,cleanupComplete:cleanupErrors.length===0,cleanupErrors,productionAccess:false};
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
 }
}
