const fs=require('fs');const path=require('path');const assert=require('assert');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(),out=path.join(root,'artifacts/prototype-v14-dashboard-qa');fs.mkdirSync(out,{recursive:true});
const url='file:///'+path.join(root,'贾维斯V14.0 · 十套主题与全平台交互原型.html').replaceAll('\\','/');
const sizes=[{width:1366,height:768},{width:1440,height:900}];const boards=['all','family','knowledge','development','operations','research','experience'];
const finalOnly=process.argv.includes('--final');const report={stage:finalOnly?'final-fonts-priorities':'first-pass',checks:[],layouts:[],errors:[]};
function check(name,ok,data){report.checks.push({name,ok,data});if(!ok)throw new Error(name+' '+JSON.stringify(data));}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const context=await browser.newContext({viewport:sizes[0],reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(url+'#theme=stark&view=overview');await page.waitForSelector('[data-j14-overview]');
  async function measure(label){const info=await page.evaluate(()=>{const el=document.querySelector('.j14-dashboard'),box=el.getBoundingClientRect();return {width:innerWidth,height:innerHeight,bottom:box.bottom,scroll:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth,parts:[...el.children].map(n=>({class:n.className,bottom:n.getBoundingClientRect().bottom,height:n.getBoundingClientRect().height})),buttons:[...el.querySelectorAll('[data-act]')].filter(n=>n.offsetParent!==null).map(n=>({action:n.dataset.act,id:n.dataset.id,label:n.textContent.trim(),registered:!!J5.actions[n.dataset.act]}))};});report.layouts.push({label,...info});check(label+' 首屏',info.bottom<=info.height+1,info);check(label+' 无横溢',!info.overflow);}
  for(const size of sizes){
   await page.setViewportSize(size);await page.evaluate(()=>navigate('overview'));await measure('overview '+size.width);
   if(size.width===1366)await page.screenshot({path:path.join(out,'overview-stark-1366.jpg'),type:'jpeg',quality:82,timeout:60000});
   for(const key of boards){await page.evaluate(key=>handleAction('v5-board',key),key);await page.waitForSelector('[data-j14-board="'+key+'"]');await measure(key+' '+size.width);if(size.width===1440&&key==='knowledge')await page.screenshot({path:path.join(out,'knowledge-stark-1440.jpg'),type:'jpeg',quality:82,timeout:60000});}
  }
  await page.evaluate(()=>{J7.apply('baijia');navigate('overview')});await measure('overview baijia 1440');
  if(finalOnly){
   await page.evaluate(()=>{const d=J5.state().ops.deployments[0];window.__qaDeploymentBackup=structuredClone(d);Object.assign(d,{status:'failed',approved:true,tests:['模拟验证失败'],events:[...d.events,'模拟验证失败']});render()});
   const first=await page.locator('.j14-summary-row').first().evaluate(el=>({title:el.querySelector('strong').textContent,action:el.querySelector('[data-act]').dataset.act,id:el.querySelector('[data-act]').dataset.id,badge:el.querySelector('.badge').textContent}));check('失败发布按真实优先级第一',first.action==='v5-op-deployment'&&first.id==='deploy-initial'&&first.badge==='需处理',first);
   await page.locator('.j14-summary-row [data-act="v5-op-deployment"]').first().click();check('失败发布到具体版本对象',await page.evaluate(()=>U.overlay?.key==='op-deployment'&&U.overlay.id==='deploy-initial'));await page.evaluate(()=>{closeOverlay();Object.assign(J5.state().ops.deployments[0],window.__qaDeploymentBackup);navigate('overview')});
   await page.setViewportSize({width:375,height:812});await page.evaluate(()=>navigate('overview'));check('放大字体手机总览无横溢',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   for(const key of boards){await page.evaluate(key=>handleAction('v5-board',key),key);check('放大字体手机 '+key+' 无横溢',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
   await page.evaluate(()=>{S.profile='wife';U.vm5.unknown=false;J5.state().board='family';navigate('screen')});await page.screenshot({path:path.join(out,'family-baijia-phone.jpg'),type:'jpeg',quality:82,timeout:60000});
   check('最终无 JS 错误',report.errors.length===0,report.errors);
   return;
  }
  await page.locator('[data-j14-overview] [data-act="approval"]').first().click();check('审批打开具体对象',await page.locator('[role="dialog"]').count()>0);await page.evaluate(()=>closeOverlay());
  await page.evaluate(()=>handleAction('v5-board','operations'));await page.locator('[data-j14-board] [data-act="v5-op-service"]').first().click();check('服务打开具体对象',await page.locator('[role="dialog"]').count()>0);await page.evaluate(()=>closeOverlay());
  await page.evaluate(()=>handleAction('v5-board','knowledge'));await page.locator('[data-j14-board] [data-act="v5-k-collate"]').first().click();check('书籍校对到具体对象',await page.evaluate(()=>U.route==='collation'&&!!U.kv5Book));
  await page.evaluate(()=>handleAction('v5-board','knowledge'));await page.locator('[data-j14-board] [data-act="v5-k-gap-accept"]').first().click();check('缺口打开具体决定',await page.locator('[role="dialog"]').count()>0);await page.evaluate(()=>closeOverlay());
  await page.evaluate(()=>handleAction('v5-board','development'));await page.locator('[data-j14-board] [data-act="toggle-supervise"]').click();check('监督切换动态',await page.evaluate(()=>S.settings.supervise));
  const before=await page.evaluate(()=>activeTasks().length);await page.evaluate(()=>{S.tasks.find(t=>t.status==='running').status='completed';render()});const after=await page.evaluate(()=>({active:activeTasks().length,metric:document.querySelector('.j14-metrics .j14-metric strong').textContent}));check('任务指标取动态状态',after.active===before-1&&after.metric===after.active+' 项',after);
  await page.evaluate(()=>{J5.state().knowledgeCenter.courses.me.push({id:'private-marker',title:'ADMIN_PRIVATE_COURSE_MARKER',stories:[]});S.profile='wife';U.vm5.unknown=false;J5.state().board='knowledge';navigate('screen')});
  const wife=await page.locator('.j14-dashboard').innerText();check('家人知识屏隔离',!wife.includes('ADMIN_PRIVATE_COURSE_MARKER')&&!wife.includes('原文进度')&&!wife.includes('知识补充'));
  await page.evaluate(()=>{U.vm5.unknown=true;J5.state().board='knowledge';render()});const publicText=await page.locator('.j14-dashboard').innerText();check('公共知识屏无个人记录',!publicText.includes('我的课程')&&!publicText.includes('我的收藏')&&!publicText.includes('已学故事')&&!publicText.includes('ADMIN_PRIVATE_COURSE_MARKER'));
  await page.evaluate(()=>handleAction('v5-board','operations'));check('公共身份不可进管理屏',await page.evaluate(()=>J5.state().board==='knowledge'));
  await page.evaluate(()=>{U.vm5.unknown=false;S.profile='wife';J5.state().board='family';render()});await page.setViewportSize({width:375,height:812});await page.screenshot({path:path.join(out,'family-baijia-phone.jpg'),type:'jpeg',quality:82,timeout:60000});const phone=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,actions:[...document.querySelectorAll('.j14-family-actions .j14-button')].map(x=>({text:x.textContent.trim(),width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height}))}));check('手机无横溢',phone.width<=375,phone);check('手机语音主按钮易点',phone.actions[0].height>=38,phone);
  check('无 JS 错误',report.errors.length===0,report.errors);
 }finally{fs.writeFileSync(path.join(out,finalOnly?'final-report.json':'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({stage:report.stage,checks:report.checks.length,layouts:report.layouts.length,errors:report.errors}));}
 console.log(JSON.stringify({checks:report.checks.length,layouts:report.layouts.length,errors:report.errors}));
})().catch(e=>{console.error(e);process.exitCode=1});
