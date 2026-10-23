/** Disposable real app/browser regression; never uses production data or providers. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv.includes('--isolated-child')){
 const {chromium}=await import('/home/superopen/All-Projects/MyOperation/node_modules/playwright/index.mjs');
 const executable=chromium.executablePath();
 const home=await mkdtemp(join(tmpdir(),'jarvis-review-browser-home-'));
 const child=spawn(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'--isolated-child'],{cwd:root,env:{HOME:home,USERPROFILE:home,PATH:process.env.PATH,LANG:'C.UTF-8',PROJECT_TEST_CHROMIUM:executable},stdio:'inherit'});
 const timer=setTimeout(()=>child.kill('SIGTERM'),90000);
 child.once('exit',async code=>{clearTimeout(timer);await rm(home,{recursive:true,force:true});process.exitCode=code??1});
}else{
 const {chromium}=await import('/home/superopen/All-Projects/MyOperation/node_modules/playwright/index.mjs');
 const {startIsolatedProjectApp}=await import('../apps/api/test/helpers/isolated-project-app.ts');
 const fixture=await startIsolatedProjectApp({webDir:join(root,'apps/web/.dist-next')});const browser=await chromium.launch({headless:true,executablePath:process.env.PROJECT_TEST_CHROMIUM});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 const out=join(root,'artifacts/r58-review-fixes');await mkdir(out,{recursive:true});const checks=[];
 try{
  await context.route('**/*',route=>new URL(route.request().url()).origin===fixture.baseUrl?route.continue():route.abort());
  await page.goto(fixture.baseUrl+'/?mode=platform#view=personas');await page.getByLabel('管理密码',{exact:true}).fill('isolated-browser-settings-passphrase');await page.getByLabel('确认密码',{exact:true}).fill('isolated-browser-settings-passphrase');await page.getByRole('button',{name:'创建账户',exact:true}).click();
  await page.getByLabel('希望怎么称呼你',{exact:true}).fill('隔离测试');await page.getByLabel('唤醒词',{exact:true}).fill('测试管家');
  const toggle=page.getByLabel('启用个人安静时段',{exact:true});if(await toggle.isChecked())await toggle.uncheck();
  await page.getByRole('button',{name:'保存我的设置',exact:true}).click();await page.getByText('设置已保存',{exact:true}).waitFor();
  const read=async()=>{const response=await context.request.get(fixture.baseUrl+'/api/v1/personas');assert(response.ok());return (await response.json()).data.items.find(x=>x.kind==='persona'&&x.profileId==='me')};
  let saved=await read();assert.equal(saved.quietStart,'');assert.equal(saved.quietEnd,'');checks.push('browser save with quiet hours disabled persists paired empty times');
  await toggle.check();await page.getByLabel('安静时间开始',{exact:true}).fill('22:00');await page.getByLabel('安静时间结束',{exact:true}).fill('07:00');await page.getByRole('button',{name:'保存我的设置',exact:true}).click();await page.getByText('设置已保存',{exact:true}).waitFor();saved=await read();assert.equal(saved.quietStart,'22:00');checks.push('browser enables and saves crossing-midnight quiet hours');
  await toggle.uncheck();await page.getByRole('button',{name:'保存我的设置',exact:true}).click();await page.getByText('设置已保存',{exact:true}).waitFor();saved=await read();assert.equal(saved.quietStart,'');assert.equal(saved.quietEnd,'');checks.push('browser disables quiet hours again and HTTP readback remains empty');
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'展开导航',exact:true}).click();const side=page.locator('.demo-sidebar');
  const height=l=>l.evaluate(e=>e.getBoundingClientRect().height);const common=await height(side.locator('.nav-common .demo-nav-item').first()),parent=await height(side.getByRole('button',{name:'家庭生活',exact:true}));assert.equal(common,parent);assert.equal(parent,46);checks.push('mobile group and common row heights both46px');
  await side.screenshot({path:join(out,'mobile-46px.png')});
  await writeFile(join(out,'settings-browser-public.json'),JSON.stringify({status:'passed',checks,productionAccess:false,modelCalls:0,scope:'actual browser against disposable app and SQLite; fake Pi and blocked external origins'},null,2)+'\n');console.log(JSON.stringify({status:'passed',checks}));
 }finally{await context.close();await browser.close();await fixture.close()}
}
