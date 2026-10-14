const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/prototype-v12-qa/effects'),errors=[],captures=[];
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-03T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-10-03T12:00:01Z'));
  await page.goto(pathToFileURL(path.join(root,'贾维斯V12.0 · 十套主题与全平台交互原型.html')).href+'#theme=pantheon&view=chat&demo=effects');
  await page.clock.runFor(1000);
  if(!await page.evaluate(()=>J7Effects.state.active&&U.vm5.phase==='listening'))throw new Error('Autoplay link did not begin the effects demo');
  await page.evaluate(()=>handleAction('v5-vm-interrupt'));
  for(const theme of (process.argv.slice(2).length?process.argv.slice(2):['stark','matrix','hero','jaeger','interstellar','mars','yijing','pantheon','shanshui','baijia'])){
   await page.evaluate(theme=>{J7.apply(theme);handleAction('v5-vm-mode','progress');J7Effects.start()},theme);
   await page.clock.runFor(1000);
   await page.screenshot({path:path.join(out,theme+'-listening.png')});
   await page.clock.runFor(2000);
   if(!await page.evaluate(()=>U.vm5.phase==='thinking'))throw new Error('Missing processing stage');
   await page.screenshot({path:path.join(out,theme+'-thinking.png')});
   await page.clock.runFor(2400);
   if(!await page.evaluate(()=>U.vm5.phase==='speaking'&&J7Effects.state.stage==='output'))throw new Error('Missing silent output stage');
   await page.screenshot({path:path.join(out,theme+'-speaking.png')});
   captures.push(await page.evaluate(()=>({theme:J7.state.theme,phase:U.vm5.phase,stage:J7Effects.state.stage,caption:document.querySelector('.vm5-caption small').textContent})));
   await page.evaluate(()=>handleAction('v5-vm-interrupt'));
  }
  await fs.writeFile(path.join(out,process.argv.slice(2).length?'refresh-capture-report.json':'capture-report.json'),JSON.stringify({captures,errors},null,2));
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify({effectSnapshots:captures.length*3,autoplayLink:true,errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
