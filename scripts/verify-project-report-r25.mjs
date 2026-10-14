/** Scoped read-only report verification. Transient browser credentials stay in memory. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {withPlatform,primary,python} from './managed-server-client.mjs';
import {queueState} from './run-factory-supervision-probe.mjs';
const revision=process.env.JARVIS_REPORT_REVISION??'1';assert.match(revision,/^[12]$/);
const project='70ec346f-6520-46ed-abed-22cac770a3e4',release='20261011-project-report-r25-'+revision,dir='artifacts/software-factory/report-r25'+(revision==='1'?'':'/r'+revision);
const phase=process.argv[2]??'preflight';
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
await mkdir(dir,{recursive:true});
async function snapshot(){return withPlatform(async({api})=>{
 const health=await api('/api/health'),profile=(await api(`/api/v1/projects/${project}/autonomy`)).data,baselines=(await api(`/api/v1/projects/${project}/autonomy/baselines`)).data,supervision=(await api('/api/v1/execution/supervision')).data;
 assert.equal(supervision.supervised,false);assert.equal(profile.spec.objectives.length,74);assert.equal(profile.verifiedObjectiveIds.length,0);assert.equal(profile.config.costPolicy,'record-only');assert.equal(profile.config.maxUSD,null);assert.equal(profile.config.maxTokens,null);assert.equal(profile.config.perTaskUSD,null);assert.deepEqual(baselines.latest.projectBudget.activeRuns,[]);
 const queue=queueState();assert.equal(queue.allActive,0);assert.equal(queue.fullTable,true);
 const evidence={at:new Date().toISOString(),build:health.build,project,profileRevision:profile.revision,profileSHA256:hash(profile),supervisionSHA256:hash(supervision),objectives:74,accepted:0,main:baselines.currentMainBaseline,budget:baselines.latest.projectBudget,oldCandidate:{id:baselines.latest.id,status:baselines.latest.status,runStatus:baselines.latest.runStatus},queue,modelsInvoked:false,productAccepted:false};
 if(phase==='live'){
  const before=JSON.parse(await readFile(dir+'/preflight.json','utf8'));assert.equal(health.build,release);assert.equal(evidence.profileSHA256,before.profileSHA256);assert.equal(evidence.supervisionSHA256,before.supervisionSHA256);assert.equal(evidence.main.taskId,before.main.taskId);assert.equal(evidence.main.runId,before.main.runId);assert.equal(evidence.main.receiptVerified,true);assert.ok(evidence.main.observedAt);assert.equal(evidence.main.validationExitCode,0);assert.equal(evidence.main.sourceFingerprint,null);assert.equal(evidence.budget.unknownCostCount,before.budget.unknownCostCount);
  const plan=await api('/api/v1/project-autonomy/acceptance-plan',undefined,'GET',{binary:true});assert.ok(plan.toString('utf8').includes('简洁汇报入口'));
  const report=await api('/api/v1/project-autonomy/acceptance-plan?reference='+encodeURIComponent('docs/软件工厂现有成果首轮验收报告.html'),undefined,'GET',{binary:true});assert.ok(report.toString('utf8').includes(evidence.main.runId));assert.ok(report.toString('utf8').includes('15/15'));
  evidence.documents={planSHA256:hash(plan.toString('utf8')),reportSHA256:hash(report.toString('utf8')),readersLive:true};
 }
 return evidence;
});}
if(phase==='preflight'||phase==='live'){
 const result=await snapshot();await writeFile(dir+'/'+phase+'.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({phase,build:result.build,profileUnchanged:phase==='live',queue:result.queue,receiptVerified:result.main.receiptVerified,accepted:result.accepted}));
}else if(phase==='browser'){
 const req=createRequire('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');const {chromium}=req('playwright');
 const storeCode=code=>python({code},String.raw`import subprocess
r=subprocess.run(['/opt/jarvis/node/bin/node','--input-type=module','-e',p['code']],cwd='/opt/jarvis/current',capture_output=True,text=True,check=True)
print(r.stdout)
`);
 const cookie=primary(storeCode("import {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{process.stdout.write(s.createLogin());}finally{s.close();}"));assert.match(cookie,/^[A-Za-z0-9_-]{43}$/);
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true});await context.addCookies([{name:'jarvis_session',value:cookie,url:'https://cc-jarvis.ikvein.com/',httpOnly:true,secure:true}]);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,300)));
  const url=theme=>`https://cc-jarvis.ikvein.com/?mode=platform&rev=report-r25#theme=${theme}&view=tasks%2Fproject%2F${project}&board=all`;
  await page.goto(url('stark'),{waitUntil:'domcontentloaded',timeout:45000});await page.getByRole('heading',{name:'项目汇报',exact:true}).waitFor({timeout:45000});await page.getByText('主线限定检查执行成功',{exact:true}).waitFor({timeout:45000});
  const themes=['stark','matrix','hero','jaeger','interstellar','mars','yijing','pantheon','shanshui','baijia'],checks=[];
  for(const theme of themes){await page.goto(url(theme),{waitUntil:'domcontentloaded',timeout:45000});await page.getByRole('heading',{name:'项目汇报',exact:true}).waitFor({timeout:45000});await page.getByText('主线限定检查执行成功',{exact:true}).waitFor({timeout:45000});const layout=await page.evaluate(()=>{const report=document.querySelector('.project-report-grid'),r=report.getBoundingClientRect();return {themeName:document.querySelector('.theme-trigger')?.textContent?.trim(),accent:getComputedStyle(document.querySelector('.demo-app')).getPropertyValue('--accent').trim(),width:innerWidth,scrollWidth:document.documentElement.scrollWidth,reportBottom:r.bottom,reportColumns:getComputedStyle(report).gridTemplateColumns};});assert.ok(layout.scrollWidth<=layout.width+1,theme+' horizontal overflow');const names={stark:'光核战术',matrix:'矩阵代码',hero:'复仇联盟',jaeger:'机甲驾驶',interstellar:'星际航行',mars:'火星基地',yijing:'易经八卦',pantheon:'西方众神',shanshui:'水墨山河',baijia:'百家书院'};assert.ok(layout.themeName?.includes(names[theme]),'Theme not selected: '+theme);checks.push({requestedTheme:theme,...layout});}
  await page.goto(url('stark'),{waitUntil:'domcontentloaded'});await page.getByText('主线限定检查执行成功',{exact:true}).waitFor();await page.screenshot({path:dir+'/desktop.png',fullPage:false});await page.setViewportSize({width:1366,height:768});const compact=await page.evaluate(()=>({reportBottom:document.querySelector('.project-report-grid').getBoundingClientRect().bottom,height:innerHeight}));assert.ok(compact.reportBottom<=compact.height,'Core report should fit standard desktop');checks.push({compactDesktop:compact});await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'查看本次结果',exact:true}).click();await page.getByRole('dialog').waitFor();assert.ok(page.url().includes('4244fb55'));checks.push({latestTaskNavigation:true});
  await page.goto(url('stark'),{waitUntil:'domcontentloaded'});await page.getByText('主线限定检查执行成功',{exact:true}).waitFor();const taskSummary=page.locator('summary').filter({hasText:'任务详情与管理'});await taskSummary.click();assert.equal(await taskSummary.evaluate(el=>el.parentElement.open),true);checks.push({taskDetailsExpandable:true});
  const mobilePage=await context.newPage();await mobilePage.setViewportSize({width:390,height:844});await mobilePage.goto(url('stark'),{waitUntil:'domcontentloaded'});await mobilePage.getByText('主线限定检查执行成功',{exact:true}).waitFor();const mobile=await mobilePage.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,columns:getComputedStyle(document.querySelector('.project-report-grid')).gridTemplateColumns,taskDetailsClosed:!Array.from(document.querySelectorAll('details')).find(d=>d.querySelector('summary')?.textContent?.includes('任务详情与管理'))?.open}));assert.ok(mobile.scrollWidth<=mobile.width+1);assert.equal(mobile.taskDetailsClosed,true);await mobilePage.screenshot({path:dir+'/mobile.png',fullPage:true});await mobilePage.screenshot({path:dir+'/mobile-first-screen.png',fullPage:false});checks.push({mobile});assert.deepEqual(errors,[]);
  const result={at:new Date().toISOString(),release,checks,screenshots:['desktop.png','mobile.png'],pageErrors:errors,realPublicWebsite:true,modelsInvoked:false,productAccepted:false};await writeFile(dir+'/browser.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({browserPassed:true,checks:checks.length,screenshots:result.screenshots}));
 }finally{if(browser)await browser.close();primary(storeCode("import {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{s.deleteLogin("+JSON.stringify(cookie)+");}finally{s.close();}"));}
}else throw Error('Use preflight, live or browser');
