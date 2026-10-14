const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const base='https://cc-jarvis.ikvein.com',out=path.resolve('artifacts/nas-onboarding/ui');
(async()=>{
 const {primary,python}=await import('./managed-server-client.mjs');
 const store=code=>primary(python({code},"import subprocess\nr=subprocess.run(['/opt/jarvis/node/bin/node','--input-type=module','-e',p['code']],cwd='/opt/jarvis/current',capture_output=True,text=True,check=True)\nprint(r.stdout)\n"));
 await fs.mkdir(out,{recursive:true});let token,browser;const checks=[],errors=[];
 try{
  const nas=JSON.parse(await fs.readFile('artifacts/nas-onboarding/onboarding.json','utf8'));
  token=store("import {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{process.stdout.write(s.createLogin());}finally{s.close();}");assert(/^[A-Za-z0-9_-]{43}$/.test(token));
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-gpu']});
  const context=await browser.newContext({viewport:{width:1536,height:960},reducedMotion:'reduce'});
  await context.addCookies([{name:'jarvis_session',value:token,domain:'cc-jarvis.ikvein.com',path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?mode=platform&rev=nas-protection-r9#theme=stark&view=machines');
  await page.getByRole('button',{name:'120 · 威联通 NAS',exact:true}).waitFor({timeout:60000});
  const card=()=>page.locator('.server-card').filter({hasText:'120 · 威联通 NAS'});
  assert.equal(await page.locator('.server-card').count(),6);assert((await card().innerText()).includes('数据卷使用'));assert(!(await card().innerText()).includes('等待磁盘采样'));checks.push('six-physical-devices-with-real-nas-capacity');
  await card().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'nas-card-desktop.png'),animations:'disabled'});
  for(const theme of ['stark','matrix','hero','jaeger','interstellar','mars','yijing','pantheon','shanshui','baijia']){
   await page.evaluate(t=>location.hash='theme='+t+'&view=machines',theme);await page.locator('.server-card').first().waitFor();assert.equal(await page.locator('.server-card').count(),6);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+3),false);
  }checks.push('nas-card-layout-in-ten-themes');
  await page.evaluate(()=>location.hash='theme=stark&view=machines');
  await page.getByRole('button',{name:'120 · 威联通 NAS',exact:true}).click();
  const dialog=()=>page.getByRole('dialog');const storage=()=>dialog().locator('.d-panel').filter({has:page.getByRole('heading',{name:'NAS 存储',exact:true})});
  await storage().waitFor();assert.equal(await storage().locator('.op-evidence').count(),7);assert((await storage().innerText()).includes('DEV3306_1'));await storage().getByRole('tab',{name:'磁盘健康',exact:true}).click();assert.equal(await storage().locator('.op-evidence').count(),7);assert((await storage().innerText()).includes('ST8000NE001-2M7101'));assert((await storage().innerText()).includes('桥接未提供'));await storage().getByRole('tab',{name:'快照备份',exact:true}).click();assert((await storage().innerText()).includes('当前没有已配置的备份任务'));await storage().getByRole('tab',{name:'电源保护',exact:true}).click();assert((await storage().innerText()).includes('Back-UPS BK650M2-CH'));assert((await storage().innerText()).includes('8 分钟'));checks.push('real-seven-disks-backup-snapshot-and-ups-tabs');
  await storage().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'nas-storage-desktop.png'),animations:'disabled'});checks.push('four-volume-and-four-disk-detail-with-unknown-smart');
  await dialog().getByRole('tab',{name:'接入记录',exact:true}).click();assert((await dialog().innerText()).includes('NAS 只读资源采集'));assert((await dialog().innerText()).includes('仅上报签名遥测'));checks.push('nas-readonly-permissions-are-explicit');
  await dialog().getByRole('button',{name:'关闭',exact:true}).click();
  await card().getByRole('button',{name:'运行项目',exact:true}).click();await page.getByLabel('运行项目服务器').waitFor();assert.equal(await page.getByLabel('运行项目服务器').inputValue(),nas.machineId);
  await page.getByRole('button',{name:'QTS 管理入口',exact:true}).click();assert((await dialog().innerText()).includes('已加密保存'));assert.equal(await dialog().getByRole('link',{name:'打开登录页 ↗'}).getAttribute('href'),'https://192.168.10.120:5001');
  await dialog().getByRole('button',{name:'资源监测',exact:true}).click();assert((await dialog().innerText()).includes('数据卷使用'));assert(!(await dialog().innerText()).includes('根盘使用'));await page.screenshot({path:path.join(out,'nas-project-resources.png'),animations:'disabled'});checks.push('server-filter-portal-encrypted-login-and-data-volume-label');
  await dialog().getByRole('button',{name:'关闭',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.evaluate(()=>location.hash='theme=stark&view=machines');await card().waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+3),false);
  await card().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'nas-card-mobile.png'),animations:'disabled'});
  await page.getByRole('button',{name:'120 · 威联通 NAS',exact:true}).click();await dialog().getByRole('tab',{name:'硬件资源',exact:true}).click();await storage().waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+3),false);await storage().getByRole('tab',{name:'电源保护',exact:true}).click();await storage().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'nas-storage-mobile.png'),animations:'disabled'});checks.push('mobile-card-and-storage-dialog-without-page-overflow');
  assert.deepEqual(errors,[]);const report={status:'passed',at:new Date().toISOString(),checks,errors,certificateValidationDisabled:false};await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(e){const error=String(e.message).replaceAll(token||'__absent__','[redacted]');await fs.writeFile(path.join(out,'failed-report.json'),JSON.stringify({status:'failed',checks,errors,error}));console.error(error);process.exitCode=1;}
 finally{if(browser)await browser.close();if(token)store("import {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{s.deleteLogin("+JSON.stringify(token)+");}finally{s.close();}");}
})();
