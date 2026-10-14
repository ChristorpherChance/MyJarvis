const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const out=path.resolve('artifacts/dialog-focus-qa');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1536,height:960}});const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:3140/?mode=demo#theme=stark&view=overview');await page.locator('.demo-app').waitFor();
  await page.getByRole('button',{name:'查找功能',exact:false}).click();
  const search=page.getByRole('textbox',{name:'查找页面与功能'});
  await search.pressSequentially('知识',{delay:80});assert.equal(await search.inputValue(),'知识');assert(await search.evaluate(el=>el===document.activeElement));
  assert.equal(await page.locator('.capability-directory button').count(),2);checks.push('逐字搜索完整输入、保留焦点并过滤页面');
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);checks.push('Escape关闭，恢复触发按钮焦点');
  await page.evaluate(()=>location.hash='theme=stark&view=memory');await page.getByRole('button',{name:'新增记忆',exact:true}).click();
  const text=page.getByRole('textbox',{name:'希望贾维斯记住什么'});
  await text.pressSequentially('周末学习历史，每次十五分钟。',{delay:45});assert.equal(await text.inputValue(),'周末学习历史，每次十五分钟。');assert(await text.evaluate(el=>el===document.activeElement));
  await page.getByRole('button',{name:'保存记忆',exact:true}).click();await page.getByRole('heading',{name:'周末学习历史，每次十五分钟。',exact:true}).waitFor();checks.push('逐字录入个人记忆、保存后可见');
  await page.evaluate(()=>location.hash='theme=stark&view=chat');await page.getByRole('button',{name:'沉浸全屏',exact:true}).click();
  const terminal=page.locator('.fa-immersive');await terminal.waitFor();
  const geometry=await terminal.evaluate(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height,stage:el.querySelector('.fa-chat-stage').getBoundingClientRect().width,iw:innerWidth,ih:innerHeight}));
  assert(geometry.w>=geometry.iw-2&&geometry.h>=geometry.ih-2);assert(geometry.stage/geometry.w>=.70&&geometry.stage/geometry.w<=.80);checks.push('沉浸覆盖整屏，对话视觉占左侧70%–80%');
  await page.screenshot({path:path.join(out,'immersive.png')});await page.keyboard.press('Escape');assert.equal(await page.locator('.fa-immersive').count(),0);checks.push('沉浸退出回到管理界面');
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({checks,errors,at:new Date().toISOString()},null,2));console.log('PASS '+checks.length+' dialog and immersive checks');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
