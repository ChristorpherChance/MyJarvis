/** Inspect saved documentation locally without accessing private platform data. */
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=resolve('artifacts/prepared-docs-qa');await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
const checks=[];let passed=false,failure;
try{
 for(const file of ['README.html','docs/api-contract-status.html','docs/后台完整实现与验收.html','docs/常驻修复与家庭陪练接入.html','docs/账单核对与签名采集接入.html']){
  await page.goto(pathToFileURL(resolve(file)).href);await page.locator('h1').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+3),false,file+' desktop overflow');
  if(file.endsWith('账单核对与签名采集接入.html')){
   assert.equal(await page.locator('.toc a').count(),7);assert.match(await page.locator('body').innerText(),/323个操作/);assert.match(await page.locator('header a').getAttribute('href'),/mode=platform/);
   await page.screenshot({path:join(out,'documentation-desktop.png')});
   await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+3),false,file+' mobile overflow');
   await page.locator('.toc a').last().click();assert.equal(new URL(page.url()).hash,'#section-7');await page.screenshot({path:join(out,'documentation-mobile.png')});
  }
  checks.push(file);
 }
 assert.deepEqual(errors,[]);passed=true;
}catch(error){failure=error.stack;process.exitCode=1;console.error(failure);}finally{
 await browser.close();await writeFile(join(out,'report.json'),JSON.stringify({status:passed?'passed':'failed',at:new Date().toISOString(),checks,errors,failure,productionWrites:false},null,2)+'\n');
}
console.log(JSON.stringify({status:passed?'passed':'failed',documents:checks.length}));
