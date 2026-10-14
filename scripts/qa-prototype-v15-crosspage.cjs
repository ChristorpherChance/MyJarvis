const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts/prototype-v15-qa');
const routes = ['overview','chat','sources','temple','collation','memory','personas','research','inbox','tasks','projects','knowledge','services','machines','family','learning','approvals','operations','settings','screen'];
const checks = [], errors = [];
function check(label, passed, detail) {checks.push({label,passed:!!passed,...(detail?{detail}:{})});}
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try {
    const page = await browser.newPage({viewport:{width:1366,height:768}});
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root,'贾维斯V15.0 · 十套主题与全平台交互原型.html')).href);
    await page.evaluate(()=>{S.settings.voice=false;J5.state().terminal=false;});
    for(const theme of ['stark','baijia']) {
      await page.evaluate(x=>J7.apply(x),theme);
      for(const route of routes) {
        await page.evaluate(x=>{J5.state().terminal=false;U.overlay=null;navigate(x);},route);
        const result=await page.evaluate(()=>({
          width:innerWidth,document:document.documentElement.scrollWidth,
          route:U.route,text:document.querySelector('#main')?.innerText?.length||0,
          module:!!window.J15Graphics&&!!window.J15DomainGraphics
        }));
        check(theme+' / '+route,result.route===route&&result.text>15&&result.document<=result.width,result);
      }
      await page.evaluate(()=>{J5.state().terminal=true;navigate('chat');J13Split.setMode('control');J13Split.open('text');});
      await page.locator('#vm5-input').fill(theme+' 收拢模式输入检查');
      await page.evaluate(()=>{window.__v15Input=document.getElementById('vm5-input');J13Split.close();});
      const control=await page.evaluate(()=>{
        const art=document.querySelector('.j13-art').getBoundingClientRect(),conversation=document.querySelector('.j13-conversation').getBoundingClientRect();
        return {ratio:art.width/(art.width+conversation.width),width:document.documentElement.scrollWidth,viewport:innerWidth};
      });
      check(theme+' / 收拢 75:25',Math.abs(control.ratio-.75)<.025&&control.width<=control.viewport,control);
      await page.locator('.j13-fullscreen-button').click();
      await page.waitForFunction(()=>J13Split.state.mode==='theatre');
      const full=await page.evaluate(()=>{
        const art=document.querySelector('.j13-art').getBoundingClientRect(),conversation=document.querySelector('.j13-conversation').getBoundingClientRect();
        return {ratio:art.width/(art.width+conversation.width),native:!!document.fullscreenElement,input:document.getElementById('vm5-input')===window.__v15Input,value:document.getElementById('vm5-input').value,extrasVisible:document.querySelector('.j7-film-bar')?.getBoundingClientRect().height||0};
      });
      check(theme+' / 全屏 75:25 与草稿保留',Math.abs(full.ratio-.75)<.015&&full.input&&full.value===theme+' 收拢模式输入检查'&&full.extrasVisible===0,full);
      await page.evaluate(()=>J13Split.open('text'));
      await page.locator('#vm5-input').fill(theme+' 全屏模式输入检查');
      await page.evaluate(()=>{J13Split.close();J13Split.setMode('control');});
      await page.waitForFunction(()=>!document.fullscreenElement);
      await page.evaluate(()=>J13Split.open('text'));
      const preserved=await page.evaluate(()=>({same:document.getElementById('vm5-input')===window.__v15Input,value:document.getElementById('vm5-input').value,count:document.querySelectorAll('#vm5-input').length,mode:J13Split.state.mode}));
      check(theme+' / 退出全屏输入仍可用',preserved.same&&preserved.value===theme+' 全屏模式输入检查'&&preserved.count===1&&preserved.mode==='control',preserved);
      await page.locator('#vm5-input').fill('你好，帮我讲一个历史故事');
      await page.locator('[data-act="v5-vm-send"]').click();
      await page.waitForFunction(()=>['answered','awaiting'].includes(U.vm5.phase));
      const sent=await page.evaluate(()=>({empty:document.getElementById('vm5-input').value==='',messages:document.querySelectorAll('.j13-conversation .vm5-message').length,answer:U.vm5.answer?.length||0}));
      check(theme+' / 实际发送与回应',sent.empty&&sent.messages>=2&&sent.answer>0,sent);
      await page.evaluate(()=>{handleAction('v5-vm-interrupt');J13Split.close();});
    }
    check('无脚本错误',errors.length===0,errors);
    const failed=checks.filter(x=>!x.passed);
    await fs.writeFile(path.join(out,'crosspage-report.json'),JSON.stringify({checks,errors,passed:checks.length-failed.length,failed:failed.length},null,2));
    console.log(JSON.stringify({passed:checks.length-failed.length,failed,errors}));
    if(failed.length)process.exitCode=1;
  }finally{await browser.close();}
})().catch(async error=>{await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'crosspage-failure.json'),JSON.stringify({error:error.stack,checks,errors},null,2));console.error(error.stack);process.exitCode=1;});
