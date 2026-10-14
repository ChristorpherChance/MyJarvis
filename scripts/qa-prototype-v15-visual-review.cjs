const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/prototype-v15-qa/visual-review'),checks=[],errors=[];
function check(label,passed,detail){checks.push({label,passed:!!passed,...(detail!==undefined?{detail}:{})});}
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'贾维斯V15.0 · 十套主题与全平台交互原型.html')).href+'#theme=stark&view=overview');
  await page.evaluate(()=>{S.settings.voice=false;J5.state().terminal=false;J7.apply('stark');navigate('overview');window.__v15Original=JSON.stringify({machines:S.machines,tasks:S.tasks,approvals:S.approvals,ops:J5.state().ops,supervise:S.settings.supervise});});
  await page.waitForSelector('[data-j15-overview]');
  const rings=await page.evaluate(()=>({count:document.querySelectorAll('.j15-metric').length,labels:[...document.querySelectorAll('.j15-metric')].map(x=>x.getAttribute('aria-label')),arcs:[...document.querySelectorAll('.j15-pie circle')].map(x=>x.getAttribute('stroke-dasharray')).filter(Boolean),machineCount:S.machines.length}));
  check('四类环图分别有名称与比例说明',rings.count===4&&rings.labels[0].includes('在线设备')&&rings.labels[1].includes('开发监督')&&rings.labels[2].includes('健康服务')&&rings.labels[3].includes('待办审批'),rings);
  check('环图弧线数值有限且在0至100之间',rings.arcs.every(x=>x.split(' ').every(n=>Number.isFinite(Number(n))&&Number(n)>=0&&Number(n)<=100)),rings.arcs);
  check('默认领域六节点',await page.locator('[data-j15-domain]').count()===6);
  const note=await page.locator('[data-j15-domain="knowledge"]').getAttribute('data-j15-note');
  await page.locator('[data-j15-domain="knowledge"]').hover();check('领域悬停显示说明',await page.locator('.j15-map-caption').textContent()===note);
  await page.locator('[data-j15-domain="operations"]').focus();const focused=await page.evaluate(()=>({caption:document.querySelector('.j15-map-caption').textContent,note:document.activeElement.dataset.j15Note,wire:document.querySelector('[data-wire="operations"]').classList.contains('is-active'),outline:getComputedStyle(document.activeElement).outlineStyle}));
  check('键盘聚焦显示说明与连接线',focused.caption===focused.note&&focused.wire&&focused.outline!=='none',focused);
  await page.mouse.move(1330,5);
  const geometry=async label=>{const g=await page.evaluate(()=>{const d=document.querySelector('.j15-dashboard').getBoundingClientRect(),panels=[...document.querySelectorAll('.j15-command-layout >section')].map(x=>({cls:x.className,bottom:x.getBoundingClientRect().bottom,height:x.getBoundingClientRect().height}));return{width:innerWidth,height:innerHeight,dashboardBottom:d.bottom,scrollWidth:document.documentElement.scrollWidth,panels}});check(label+' 无页面横向溢出',g.scrollWidth<=g.width+1,g);check(label+' 重点图形完整在首屏',g.panels.every(x=>x.bottom<=g.height+1),g);return g};
  await geometry('1366×768 总览');await page.screenshot({path:path.join(out,'stark-overview-1366.jpg'),type:'jpeg',quality:84,timeout:60000});
  const startSupervise=await page.evaluate(()=>S.settings.supervise);await page.locator('.j15-task-lanes [data-act="toggle-supervise"]').click();
  check('监督开关改变真实状态',await page.evaluate(x=>S.settings.supervise===!x,startSupervise));
  await page.locator('.j15-task-lanes [data-act="toggle-supervise"]').click();
  const lanes=await page.evaluate(()=>[...document.querySelectorAll('.j15-lane')].map(x=>{const t=task(x.querySelector('button').dataset.id);return{shown:x.querySelector('b').textContent,expected:Math.max(0,Math.min(100,Number(t.progress)||0))+'%',aria:x.querySelector('.j15-lane-track').getAttribute('aria-label')}}));
  check('任务进度对应原始数据',lanes.every(x=>x.shown===x.expected&&x.aria.includes(x.expected)),lanes);
  for(const d of ['family','knowledge','development','operations','research','experience']){
   await page.evaluate(()=>{J5.state().terminal=false;navigate('overview');J15Graphics.setMap('domains')});await page.locator('[data-j15-domain="'+d+'"]').click();
   check('领域节点进入 '+d,await page.evaluate(x=>U.route==='screen'&&J5.state().board===x,d));
  }
  await page.evaluate(()=>{J5.state().terminal=false;navigate('overview');J15Graphics.setMap('devices')});
  check('设备矩阵完整显示21节点',await page.locator('.j15-device').count()===21&&rings.machineCount===21);
  await page.locator('.j15-device[data-id="hp"]').focus();check('设备键盘聚焦显示用途', (await page.locator('.j15-map-caption').textContent()).includes('公司 HP'));
  await page.locator('.j15-device[data-id="hp"]').click();
  check('公司设备进入原详情且保留只读',await page.evaluate(()=>{const o=document.querySelector('#overlay-root');return o.textContent.includes('公司 HP')&&o.textContent.includes('只读')&&!o.querySelector('[data-act="offline-machine"],[data-act="wake-machine"],[data-act="edit-machine"]')}));
  await page.evaluate(()=>closeOverlay());await page.locator('.j15-device[data-id="dev-48"]').click();
  check('个人设备进入原详情与操作',await page.evaluate(()=>{const o=document.querySelector('#overlay-root');return o.textContent.includes('48G i7')&&!!o.querySelector('[data-act="offline-machine"]')}));await page.evaluate(()=>closeOverlay());
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>{J7.apply('baijia');J5.state().board='all';navigate('screen');J15Graphics.setMap('domains')});
  await geometry('1440×900 全域');await page.screenshot({path:path.join(out,'baijia-all-1440.jpg'),type:'jpeg',quality:84,timeout:60000});
  await page.setViewportSize({width:375,height:812});await page.evaluate(()=>{J7.apply('stark');J5.state().terminal=false;navigate('overview');J15Graphics.setMap('domains')});
  const mobile=await page.evaluate(()=>({w:innerWidth,scrollWidth:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('[data-j15-domain]')].map(x=>({x:x.getBoundingClientRect().x,r:x.getBoundingClientRect().right,h:x.getBoundingClientRect().height})),hub:getComputedStyle(document.querySelector('.j15-hub')).display}));
  check('375手机领域卡可读无横向溢出',mobile.scrollWidth<=375&&mobile.nodes.every(x=>x.x>=0&&x.r<=375&&x.h>=44)&&mobile.hub==='none',mobile);
  await page.screenshot({path:path.join(out,'stark-overview-mobile.jpg'),type:'jpeg',quality:84,fullPage:true,timeout:60000});
  await page.evaluate(()=>J15Graphics.setMap('devices'));check('375手机设备节点无隐藏',await page.locator('.j15-device').count()===21);check('375手机设备矩阵无横向溢出',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1366,height:768});
  for(const scenario of ['zero','healthy','anomalous','paused','invalid-progress']){
   const data=await page.evaluate(mode=>{const backup=JSON.parse(window.__v15Original);S.machines=backup.machines;S.tasks=backup.tasks;S.approvals=backup.approvals;J5.state().ops=backup.ops;
    if(mode==='zero'){S.machines=[];S.tasks=[];S.approvals=[];J5.state().ops.services=[];J5.state().ops.deployments=[]}
    if(mode==='healthy'){S.machines.forEach(m=>m.status='online');J5.state().ops.services.forEach(x=>x.health='healthy');S.tasks.forEach(t=>t.status='completed');S.approvals.forEach(a=>a.status='approved')}
    if(mode==='anomalous'){J5.state().ops.services.forEach((x,i)=>x.health=i%2?'down':'degraded')}
    if(mode==='paused'){S.tasks.forEach(t=>t.status='paused')}
    if(mode==='invalid-progress'){S.tasks[0].progress=NaN;S.tasks[1].progress=250;S.tasks[2].progress=-45}
    navigate('overview');J15Graphics.setMap('domains');return{mode,html:document.querySelector('.j15-dashboard').outerHTML,text:document.querySelector('.j15-dashboard').textContent,labels:[...document.querySelectorAll('.j15-metric')].map(x=>x.getAttribute('aria-label')),arcs:[...document.querySelectorAll('.j15-pie circle')].map(x=>x.getAttribute('stroke-dasharray')).filter(Boolean),active:activeTasks().length,totalTasks:S.tasks.length,serviceTotal:J5.state().ops.services.length};
   },scenario);
   check(scenario+' 无NaN或Infinity图形',!data.html.includes('NaN')&&!data.html.includes('Infinity')&&data.arcs.every(x=>x.split(' ').every(n=>Number.isFinite(Number(n))&&Number(n)>=0&&Number(n)<=100)),data.labels);
   if(scenario==='zero')check('零值显示0/0且不伪造百分比',data.labels[0].includes('0 / 0')&&data.labels[2].includes('0 / 0'),data.labels);
   if(scenario==='healthy')check('全部正常时健康数量正确',data.labels[2].includes(data.serviceTotal+' / '+data.serviceTotal)&&data.labels[3].includes('0 项'),data.labels);
   if(scenario==='paused')check('人工暂停单列且推进为0',data.labels[1].includes('0 项推进')&&data.labels[1].includes('人工暂停 '+data.totalTasks),data.labels[1]);
  }
  await page.evaluate(()=>{const b=JSON.parse(window.__v15Original);S.machines=b.machines;S.tasks=b.tasks;S.approvals=b.approvals;J5.state().ops=b.ops;S.settings.supervise=b.supervise;navigate('overview')});
  check('运行无脚本错误',errors.length===0,errors);
 }finally{await browser.close()}
 const report={passed:checks.filter(x=>x.passed).length,total:checks.length,failures:checks.filter(x=>!x.passed),errors,checks};await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failures:report.failures,errors}));if(report.failures.length)process.exitCode=1;
})().catch(async e=>{await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:e.message,checks,errors},null,2));console.error(e.stack);process.exitCode=1});
