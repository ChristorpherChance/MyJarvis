const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'artifacts','prototype-v5-qa');
const routes=['overview','chat','sources','temple','collation','memory','personas','research','inbox','tasks','projects','knowledge','services','machines','family','learning','approvals','operations','settings','screen'];
const checks=[],errors=[],requests=[];
function check(label,result){checks.push({label,passed:!!result});if(!result)throw new Error(label)}
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});
    await page.goto(pathToFileURL(path.join(root,'贾维斯V5.0 · 高保真交互原型.html')).href);
    await page.evaluate(()=>{S=seed();normalizeState();S.settings.supervise=false;J5.init();render()});
    for(const route of routes){
      await page.evaluate(r=>navigate(r),route);
      check('桌面内容 '+route,(await page.locator('#main').innerText()).length>40);
      check('桌面宽度 '+route,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(out,'desktop-'+route+'.png')});
    }
    for(const key of ['all','family','knowledge','development','operations','research','experience']){
      await page.evaluate(k=>handleAction('v5-board',k),key);
      check('大屏内容 '+key,(await page.locator('#main').innerText()).length>50);
      check('大屏宽度 '+key,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(out,'board-'+key+'.png')});
    }
    await page.setViewportSize({width:390,height:844});
    for(const route of routes){
      await page.evaluate(r=>navigate(r),route);
      const sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,view:innerWidth}));
      check('手机宽度 '+route,sizes.scroll<=sizes.view);
      if(['overview','chat','temple','collation','memory','services','research','inbox','screen'].includes(route))await page.screenshot({path:path.join(out,'mobile-'+route+'.png')});
    }
    check('无脚本错误',errors.length===0);
    check('默认体验不请求外网',requests.length===0);
    await fs.writeFile(path.join(out,'smoke-report.json'),JSON.stringify({checks,errors,requests},null,2),'utf8');
    process.stdout.write(JSON.stringify({passed:checks.length,errors,requests},null,2)+'\n');
  }finally{await browser.close()}
})().catch(async e=>{process.stderr.write(e.stack+'\n');await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'smoke-failure.json'),JSON.stringify({error:e.message,checks,errors,requests},null,2));process.exitCode=1});
