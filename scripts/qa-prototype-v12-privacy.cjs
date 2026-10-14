const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/prototype-v12-qa'),errors=[],states=[];
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const p=await browser.newPage({viewport:{width:1366,height:768}});p.on('pageerror',e=>errors.push(e.message));
  await p.emulateMedia({reducedMotion:'reduce'});
  await p.goto(pathToFileURL(path.join(root,'贾维斯V12.0 · 十套主题与全平台交互原型.html')).href);
  await p.evaluate(()=>{J12Immersive.setMode('control');handleAction('switch-profile','wife');handleAction('v5-vm-sample','查看贾维斯项目进度')});
  await p.waitForFunction(()=>['answered','awaiting'].includes(U.vm5.phase));
  const read=()=>p.evaluate(()=>({profile:S.profile,unknown:U.vm5.unknown,phase:U.vm5.phase,pending:U.vm5.pending?.type,answer:U.vm5.answer,transcript:U.vm5.transcript,mode:U.vm5.mode}));
  states.push(await read());
  if(states[0].answer.includes('完成约')||!states[0].answer.includes('管理员'))throw new Error('Family project guard');
  await p.evaluate(()=>{handleAction('v5-vm-unknown');handleAction('v5-vm-sample','查看我的聊天记录密码 ABC_PRIVATE_SENTINEL')});
  states.push(await read());
  await p.waitForFunction(()=>['answered','awaiting'].includes(U.vm5.phase));
  states.push(await read());
  if(states[2].phase!=='awaiting'||!states[2].answer.includes('先确认'))throw new Error('Unknown identity guard '+JSON.stringify(states[2]));
  if((await p.locator('.j7-mind-panel').innerText()).includes('ABC_PRIVATE_SENTINEL'))throw new Error('Private text leaked in public intent');
  await p.evaluate(()=>J7.openDirectory());
  if(!await p.locator('[data-j6-route]').evaluateAll(nodes=>nodes.every(n=>['chat','screen'].includes(n.dataset.j6Route))))throw new Error('Public directory guard');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify({guard:'passed',states,errors}));
 }finally{await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'privacy-qa-report.json'),JSON.stringify({states,errors},null,2));await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
