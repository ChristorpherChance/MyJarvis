/** Current project defect UI on disposable real HTTP/SQLite. No model or deployment. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv.includes('--isolated-child')){
 const {chromium}=await import('/home/superopen/All-Projects/MyOperation/node_modules/playwright/index.mjs');await access(join(root,'apps/web/.dist-next/index.html'));await access(chromium.executablePath());
 const home=await mkdtemp(join(tmpdir(),'project-acceptance-home-')),env={HOME:home,USERPROFILE:home,PATH:process.env.PATH,LANG:'C.UTF-8',PROJECT_TEST_CHROMIUM:chromium.executablePath()};
 const child=spawn(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'--isolated-child'],{cwd:root,env,stdio:'inherit',shell:false,detached:process.platform!=='win32'});let escalation,timedOut=false;
 const kill=signal=>{try{if(child.pid)process.kill(process.platform==='win32'?child.pid:-child.pid,signal);}catch(e){if(e.code!=='ESRCH')throw e;}};
 const timer=setTimeout(()=>{timedOut=true;kill('SIGTERM');escalation=setTimeout(()=>kill('SIGKILL'),5000);},180000);
 const finish=async code=>{clearTimeout(timer);clearTimeout(escalation);process.exitCode=timedOut?1:code??1;await rm(home,{recursive:true,force:true});};
 child.once('error',()=>void finish(1));child.once('exit',code=>void finish(code));
}else{
 const {chromium}=await import('/home/superopen/All-Projects/MyOperation/node_modules/playwright/index.mjs');const {startIsolatedProjectApp}=await import('../apps/api/test/helpers/isolated-project-app.ts');
 const attempt=randomUUID(),out=join(root,'artifacts/project-acceptance',attempt);await mkdir(out,{recursive:true});const results=[],errors=[],blocked=[],cleanupErrors=[];
 let fixture,browser,context,page,base='',active='setup';const originalFetch=globalThis.fetch,hash='a'.repeat(64),commit='b'.repeat(40);
 const check=async(name,fn)=>{active=name;await fn();results.push({name,status:'passed'});console.log('PASS '+name);};
 try{
  fixture=await startIsolatedProjectApp({webDir:join(root,'apps/web/.dist-next')});base=fixture.baseUrl;globalThis.fetch=(input,opts)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);assert.equal(url.origin,base,'fixture fetch origin');return originalFetch(input,opts);};
  assert.equal((await(await fetch(base+'/api/health')).json()).instanceId,fixture.instanceId);
  browser=await chromium.launch({headless:true,executablePath:process.env.PROJECT_TEST_CHROMIUM});context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();blocked.push(route.request().url());return route.abort();});page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  const api=async(path,data)=>{const r=await context.request.fetch(base+path,{method:data===undefined?'GET':'POST',...(data===undefined?{}:{data})});assert(r.ok(),path+':'+r.status());return r.json();};
  const dialog=()=>page.getByRole('dialog'),save=async()=>{await dialog().getByRole('button',{name:'保存记录',exact:true}).click();await dialog().waitFor({state:'hidden'});};let projectId,defectId;
  await check('acceptance-tab-reachable-in-real-project',async()=>{
   await page.goto(base+'/?mode=platform#view=projects&theme=stark');const password='Acceptance-'+randomUUID();await page.getByLabel('管理密码',{exact:true}).fill(password);await page.getByLabel('确认密码',{exact:true}).fill(password);await page.getByRole('button',{name:'创建账户',exact:true}).click();await page.getByRole('heading',{name:'项目',exact:true,level:2}).waitFor();
   const p=await api('/api/v1/projects/commands/register',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{name:'验收缺陷产品首版',description:'专用隔离项目',goal:'验证缺陷闭环不改变任务验收',milestones:['本地验收']}});projectId=p.data.id;
   await page.goto(base+'/?mode=platform#'+new URLSearchParams({theme:'stark',view:'projects/'+projectId+'?tab=acceptance'}));await page.reload();await page.getByRole('region',{name:'验收缺陷',exact:true}).waitFor();await page.getByRole('button',{name:'新增缺陷',exact:true}).waitFor();
  });
  await check('create-defect-through-browser-persists-reference-only',async()=>{
   await page.getByRole('button',{name:'新增缺陷',exact:true}).click();for(const [label,value] of [['缺陷标题','隔离缺陷：保存后回读'],['复现步骤','打开专用页面并保存'],['预期结果','保存后数据保持'],['实际结果','首次发现结果未确认'],['对应验收标准','保存结果可核对'],['环境','本地临时SQLite'],['源码版本','fixture-v1']])await dialog().getByLabel(label,{exact:true}).fill(value);await dialog().getByLabel('严重级别',{exact:true}).selectOption('P2');await dialog().getByLabel('证据引用（每行：安全相对路径 SHA-256）',{exact:true}).fill('reports/fixture.txt '+hash);await save();
   const list=(await api(`/api/v1/projects/${projectId}/defects`)).data;assert.equal(list.total,1);defectId=list.items[0].id;assert.equal(list.items[0].independentAcceptance,false);assert.equal(fixture.runtime.execution.listRuns().length,0);
  });
  const choose=async label=>{await page.getByRole('button',{name:label,exact:true}).click();};
  const submitFix=async n=>{await choose('提交修复候选');await dialog().getByLabel('源码提交（可选）',{exact:true}).fill(n===1?commit:'c'.repeat(40));await dialog().getByLabel('修复摘要',{exact:true}).fill('专用候选第'+n+'代');await dialog().getByLabel('修复证据（每行：安全相对路径 SHA-256）',{exact:true}).fill('reports/fix.txt '+hash);await save();};
  const retest=async outcome=>{await choose('记录人工复验');await dialog().getByLabel('人工复验结论',{exact:true}).selectOption(outcome);await dialog().getByLabel('复验范围',{exact:true}).fill('本地专用缺陷，不代表项目整体验收');await dialog().getByLabel('复验证据（每行：安全相对路径 SHA-256）',{exact:true}).fill('reports/retest.txt '+hash);await dialog().getByLabel('复验说明',{exact:true}).fill('本次专用人工声明');await save();};
  await check('failed-retest-remains-history-and-new-fix-can-pass',async()=>{
   await page.reload();await page.getByRole('heading',{name:'隔离缺陷：保存后回读',exact:true}).waitFor();
   await choose('开始修复记录');await dialog().getByLabel('本次说明',{exact:true}).fill('确认后开始本地修复登记');await save();await submitFix(1);await retest('fail');
   let detail=(await api(`/api/v1/projects/${projectId}/defects/${defectId}`)).data.defect;assert.equal(detail.status,'in_progress');assert.equal(detail.latestRetest.outcome,'fail');
   await submitFix(2);await retest('pass');detail=(await api(`/api/v1/projects/${projectId}/defects/${defectId}`)).data.defect;assert.equal(detail.fixGeneration,2);assert.equal(detail.latestRetest.outcome,'pass');
  });
  await check('close-and-reopen-preserve-history-and-do-not-complete-project',async()=>{
   await choose('关闭缺陷');await dialog().getByRole('checkbox').check();await dialog().getByLabel('本次说明',{exact:true}).fill('本代复验通过，仅关闭缺陷');await save();assert.equal((await api(`/api/v1/projects/${projectId}/defects/${defectId}`)).data.defect.status,'closed');
   await choose('重新打开');await dialog().getByLabel('本次说明',{exact:true}).fill('新证据要求重新复验');await save();const result=(await api(`/api/v1/projects/${projectId}/defects/${defectId}?limit=100`)).data;assert.equal(result.defect.currentFix,null);assert.equal(result.defect.latestRetest,null);assert(result.history.items.some(item=>item.latestRetest?.outcome==='fail'));assert(result.history.items.some(item=>item.status==='closed'));assert.equal((await api(`/api/v1/projects/${projectId}`)).data.status,'planned');assert.equal(fixture.runtime.execution.listRuns().length,0);
  });
  await check('defect-conflict-retains-draft-and-failed-read-can-refresh',async()=>{
   await choose('编辑');await dialog().getByLabel('缺陷标题',{exact:true}).fill('冲突草稿不应覆盖');const old=(await api(`/api/v1/projects/${projectId}/defects/${defectId}`)).data.defect;
   await api(`/api/v1/projects/${projectId}/defects/${defectId}/commands`,{commandId:randomUUID(),expectedVersion:old.revision,action:'update',patch:{actual:'其他窗口新证据'},reason:'并发验收'});
   await dialog().getByRole('button',{name:'保存记录',exact:true}).click();await dialog().getByRole('alert').filter({hasText:/版本|更新|刷新/}).waitFor();assert.equal(await dialog().getByLabel('缺陷标题',{exact:true}).inputValue(),'冲突草稿不应覆盖');await dialog().getByRole('button',{name:'取消',exact:true}).click();
   const panel=page.getByRole('region',{name:'验收缺陷',exact:true}),pattern=`**/api/v1/projects/${projectId}/acceptance`;await page.route(pattern,route=>route.abort());await panel.getByRole('button',{name:'刷新',exact:true}).click();await panel.getByRole('alert').waitFor();assert.equal(await panel.getByRole('button',{name:'新增缺陷',exact:true}).isDisabled(),true);await page.unroute(pattern);await panel.getByRole('button',{name:'刷新',exact:true}).click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='新增缺陷')?.disabled);
  });
  await check('mobile-defect-detail-and-releases-empty-state',async()=>{await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(out,'defect-mobile.png'),fullPage:true});await page.getByRole('navigation',{name:'项目资料详情'}).getByRole('button',{name:'发布记录',exact:true}).click();await page.getByRole('region',{name:'项目发布包',exact:true}).waitFor();assert.equal((await api(`/api/v1/projects/${projectId}/releases`)).data.total,0);});
  await check('project-release-pagination-is-scoped-and-renders-existing-records',async()=>{
   const repo=fixture.runtime.v1,actor='server-admin',other=randomUUID();
   const seed=(project,version)=>repo.execute({domain:'releases',commands:['fixture'],execute:(_command,_body,ctx)=>ctx.create('releases',{projectId:project,taskId:randomUUID(),version,artifactIds:['reports/synthetic-delivery.txt'],acceptance:{outcome:'pass',evidence:'synthetic human declaration',tests:'fixture only',artifacts:['reports/synthetic-delivery.txt'],reviewerId:actor,at:new Date().toISOString()},createdAt:ctx.now})},'fixture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},actor,()=>undefined);
   for(let i=0;i<28;i++)seed(other,'other-'+i);for(let i=0;i<26;i++)seed(projectId,'local-'+i);
   const first=(await api(`/api/v1/projects/${projectId}/releases?offset=0&limit=25`)).data;assert.equal(first.total,26);assert.equal(first.items.length,25);assert(first.items.every(item=>item.projectId===projectId));const last=(await api(`/api/v1/projects/${projectId}/releases?offset=25&limit=25`)).data;assert.equal(last.items.length,1);assert.equal(last.items[0].version,'local-25');
   const panel=page.getByRole('region',{name:'项目发布包',exact:true});await panel.getByRole('button',{name:'刷新',exact:true}).click();await panel.getByRole('heading',{name:'local-0',exact:true}).waitFor();await panel.getByRole('button',{name:'下一页',exact:true}).click();await panel.getByRole('heading',{name:'local-25',exact:true}).waitFor();assert.equal(await panel.getByText('other-0',{exact:true}).count(),0);assert.equal(fixture.runtime.execution.listRuns().length,0);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 }catch(e){process.exitCode=1;results.push({name:active,status:'failed',error:String(e.message).replaceAll(base,'[isolated-origin]').slice(0,1600)});if(page)await page.screenshot({path:join(out,'failure.png'),fullPage:true}).catch(()=>{});}
 finally{for(const [name,resource] of [['context',context],['browser',browser],['fixture',fixture]])try{await resource?.close();}catch(e){cleanupErrors.push(name+':'+e.name);process.exitCode=1;}globalThis.fetch=originalFetch;const report={at:new Date().toISOString(),attempt,passed:results.every(r=>r.status==='passed')&&!cleanupErrors.length,results,errors,externalOrigins:blocked.length,cleanupErrors,scope:'real browser+HTTP+SQLite; manual defect declarations only, no original-file verification/model/factory/deployment',productionAccess:false};await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
}
