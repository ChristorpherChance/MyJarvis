const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/prototype-v11-baijia-qa'),rows=[];
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
 await fs.mkdir(out,{recursive:true});const page=await browser.newPage({viewport:{width:375,height:812}});
 await page.goto(pathToFileURL(path.join(root,'贾维斯V11.0 · 十套主题与全平台交互原型.html')).href+'#theme=baijia&view=chat');
 await page.addStyleTag({path:path.join(root,'prototype-v11/baijia.css')});
 for(const profile of ['me','dad','mom'])for(const phase of ['ready','listening','speaking']){
  await page.evaluate(({profile,phase})=>{handleAction('switch-profile',profile);J7.apply('baijia');J5.state().terminal=true;navigate('chat');U.vm5.phase=phase;U.vm5.transcript='我们来聊一段故事，然后整理今天的学习与安排。'.repeat(15);if(phase==='speaking')U.vm5.answer='这是模拟的长回应。把问题拆成可理解的小故事，再一起梳理。'.repeat(30);render();scrollTo(0,0)}, {profile,phase});
  await page.waitForTimeout(100);await page.evaluate(()=>scrollTo(0,0));
  const row=await page.evaluate(({profile,phase})=>{const n=document.querySelector('[data-act="v5-vm-listen"]'),r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {profile,phase,viewport:innerHeight,clientHeight:document.documentElement.clientHeight,scrollY,mic:r.toJSON(),spare:innerHeight-r.bottom,hit:!!hit?.closest('[data-act="v5-vm-listen"]'),scrollWidth:document.documentElement.scrollWidth,view:innerWidth,coreHeight:document.querySelector('.vm5-stage .j7-core-holder').getBoundingClientRect().height}}, {profile,phase});rows.push(row);
  if(row.viewport!==812||row.clientHeight!==812||row.scrollY!==0||row.spare<20||!row.hit||row.scrollWidth>row.view)throw Error('手机首屏检查失败 '+JSON.stringify(row));
  if(profile==='mom'&&phase==='speaking')await page.screenshot({path:path.join(out,'baijia-375-mom-speaking-final.png'),animations:'disabled'});
 }
 await page.setViewportSize({width:1366,height:768});await page.evaluate(()=>{handleAction('switch-profile','me');J7.apply('baijia');J5.state().terminal=true;navigate('chat');scrollTo(0,0)});await page.waitForTimeout(100);const desktop=await page.evaluate(()=>{const r=document.querySelector('[data-act="v5-vm-listen"]').getBoundingClientRect();return {mic:r.toJSON(),scrollY,viewport:innerHeight,coreHeight:document.querySelector('.vm5-stage .j7-core-holder').getBoundingClientRect().height}});if(desktop.scrollY!==0||desktop.mic.bottom>768)throw Error('桌面主控 '+JSON.stringify(desktop));
 await fs.writeFile(path.join(out,'qa-fold-final.json'),JSON.stringify({rows,desktop},null,2));console.log(JSON.stringify({checks:rows.length+1,minSpare:Math.min(...rows.map(r=>r.spare)),rows:rows.map(r=>({profile:r.profile,phase:r.phase,bottom:r.mic.bottom,spare:r.spare,core:r.coreHeight})),desktop}));
 }finally{await browser.close()}})().catch(async e=>{console.error(e.stack);await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'qa-fold-final-failure.json'),JSON.stringify({error:e.message,rows},null,2));process.exitCode=1});
