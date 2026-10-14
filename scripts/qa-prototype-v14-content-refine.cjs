const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.resolve('artifacts/prototype-v14-content-qa');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce'}),checks=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));const check=(name,ok,detail)=>{checks.push({name,ok:!!ok,detail});if(!ok)throw new Error(name+': '+JSON.stringify(detail));};
 try{
  await page.goto(pathToFileURL(path.resolve('贾维斯V14.0 · 十套主题与全平台交互原型.html')).href,{waitUntil:'load'});
  const headings=await page.evaluate(()=>Object.entries(J7Navigation.labels).map(([route,expected])=>{navigate(route);return {route,expected,actual:document.querySelector('#app-header .breadcrumb strong')?.textContent}}));
  check('20 页面包屑名称同步',headings.length===20&&headings.every(x=>x.expected===x.actual),headings);
  await page.evaluate(()=>navigate('personas'));
  const form=await page.evaluate(()=>{const save=document.querySelector('.page-head button[type="submit"]');const el=document.querySelector('form[data-form="v5-vm-persona"]');return {connected:save?.form===el,primary:save?.classList.contains('primary'),primaryCount:document.querySelectorAll('.page-head .primary').length,label:save?.textContent.trim(),inView:save?.getBoundingClientRect().bottom<innerHeight,labels:[...el.querySelectorAll('.field>label,.field>span')].map(x=>x.textContent)}});
  check('保存按钮保留原表单关联',form.connected&&form.primary&&form.primaryCount===1&&form.label==='保存设置'&&form.inView,form);
  check('管家表单标签简短',form.labels.includes('我的称呼')&&form.labels.includes('声音偏好')&&form.labels.includes('每日语音 · 分钟'),form.labels);
  const submit=await page.evaluate(()=>{const form=document.querySelector('form[data-form="v5-vm-persona"]');form.querySelector('[name="address"]').value='V14 保存测试';form.requestSubmit(document.querySelector('.page-head button[type="submit"]'));return S.preferences[S.profile].address});
  check('页头保存实际提交成功',submit==='V14 保存测试',submit);
  await page.screenshot({path:path.join(out,'personas-refined-desktop.jpg'),type:'jpeg',quality:80,timeout:60000});
  await page.evaluate(()=>navigate('family'));
  const family=await page.evaluate(()=>{const top=document.querySelector('#main > .grid3'),shared=document.querySelector('#main > .dashboard-columns');return {previous:shared.previousElementSibling.className,todoY:top.children[2]?.querySelector('h2')?.getBoundingClientRect().top,todoHeading:top.children[2]?.querySelector('h2')?.textContent,beforeMembers:shared.compareDocumentPosition(document.querySelector('.j14-family-members'))&Node.DOCUMENT_POSITION_FOLLOWING,life:[...shared.querySelectorAll('.card p')].map(x=>x.textContent)}});
  check('共同事项位于首排第三卡并提前可见',family.previous.includes('grid3')&&family.todoHeading==='家庭共同事项'&&family.todoY<688&&family.beforeMembers,family);
  check('生活帮助说明精简',family.life.includes('告诉管家食材，或记录身体情况。'),family);
  await page.screenshot({path:path.join(out,'family-refined-desktop.jpg'),type:'jpeg',quality:80,timeout:60000});
  await page.evaluate(()=>navigate('sources'));
  const stats=await page.evaluate(()=>[...document.querySelectorAll('.kv5-stat small')].map(x=>x.textContent));check('来源统计短名统一',JSON.stringify(stats)===JSON.stringify(['有效来源','全部来源','示例资料','共享来源']),stats);
  for(const route of ['personas','family','sources']){
   await page.setViewportSize({width:375,height:812});await page.evaluate(r=>navigate(r),route);
   check(route+' 手机无水平溢出',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  }
  await page.evaluate(()=>{handleAction('switch-profile','wife');navigate('knowledge')});
  check('家人面包屑与家庭资料同步',await page.evaluate(()=>document.querySelector('#app-header .breadcrumb strong').textContent==='家庭资料'&&document.querySelector('.page-head h1').textContent==='家庭资料'));
  await page.evaluate(()=>navigate('settings'));check('家人面包屑与个人设置同步',await page.evaluate(()=>document.querySelector('#app-header .breadcrumb strong').textContent==='个人设置'&&document.querySelector('.page-head h1').textContent==='个人设置'));
  check('无脚本错误',errors.length===0,errors);console.log(JSON.stringify({checks:checks.length,ok:true,errors}));
 }finally{fs.writeFileSync(path.join(out,'refine-report.json'),JSON.stringify({checks,errors},null,2));await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
