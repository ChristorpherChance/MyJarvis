const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/prototype-v11-baijia-qa');
const checks=[],errors=[];
function check(label,passed,detail){checks.push({label,passed:!!passed,detail});if(!passed)throw Error(label+' '+JSON.stringify(detail||''));}
(async()=>{
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'贾维斯V11.0 · 十套主题与全平台交互原型.html')).href+'#theme=baijia&view=chat');
  await page.waitForSelector('.j11-bj-core');
  check('文枢视觉已注册',await page.evaluate(()=>!!(J7Visuals.baijia?.markup&&J7Visuals.baijia?.mount)));
  check('交互视觉未对辅助技术隐藏',await page.locator('.vm5-stage .j7-core-holder').getAttribute('aria-hidden')==='false');
  check('六家按钮完整',await page.locator('.vm5-stage .bj-schools button').count()===6);
  const business=await page.evaluate(()=>JSON.stringify(S));
  for(const id of ['ru','dao','mo','fa','bing','ming']){
   await page.locator('.vm5-stage [data-bj-school="'+id+'"]').click();
   const state=await page.evaluate(()=>{const r=document.querySelector('.vm5-stage .j11-bj-core');return {school:r.dataset.school,pressed:r.querySelectorAll('[aria-pressed="true"]').length,selected:r.querySelector('.bj-school-seal.selected')?.dataset.bjSeal,tip:r.querySelector('[data-bj-tip]').textContent}});
   check('选择六家 '+id,state.school===id&&state.pressed===1&&state.selected===id&&state.tip.length>10,state);
  }
  check('视觉切换不写业务数据',await page.evaluate(before=>JSON.stringify(S)===before,business));
  const expected={ready:'文枢静候',listening:'收声入简',thinking:'六家参照',speaking:'展卷回应',interrupted:'收卷留席',answered:'释疑成章',awaiting:'请你裁定'};
  for(const [phase,label] of Object.entries(expected)){
   await page.evaluate(phase=>document.querySelector('.vm5-terminal').dataset.phase=phase,phase);
   await page.waitForFunction(phase=>document.querySelector('.vm5-stage .j11-bj-core').dataset.phase===phase,phase);
   check('公开状态 '+phase,await page.locator('.vm5-stage [data-bj-label]').textContent()===label);
   if(phase==='speaking')await page.screenshot({path:path.join(out,'baijia-1366-'+phase+'.png'),animations:'disabled',timeout:20000});
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>document.querySelector('.vm5-terminal').dataset.phase='thinking');
  await page.waitForFunction(()=>document.querySelector('.vm5-stage .j11-bj-core').dataset.motion==='off');
  const reduced=await page.evaluate(()=>{const n=document.querySelector('.vm5-stage .j11-bj-core');return {motion:n.dataset.motion,animations:Array.from(n.querySelectorAll('*')).filter(e=>getComputedStyle(e).animationName!=='none').length,text:n.querySelector('[data-bj-tip]').textContent,rect:n.getBoundingClientRect().toJSON()}});
  check('减少动画完全静止且提示保留',reduced.motion==='off'&&reduced.animations===0&&reduced.text.length>10,reduced);
  await page.emulateMedia({reducedMotion:'no-preference'});
  for(const size of [{width:375,height:812},{width:1366,height:768},{width:1440,height:900}]){
   await page.setViewportSize(size);
   for(const profile of size.width===375?['me','dad','mom']:['me']){
    await page.evaluate(profile=>{handleAction('switch-profile',profile);J7.apply('baijia');J5.state().terminal=true;navigate('chat')},profile);
    for(const phase of ['ready','listening','speaking']){
     await page.evaluate(phase=>{U.vm5.phase=phase;if(phase==='speaking')U.vm5.answer='这里是一段模拟回应。我们把一个复杂问题拆成可理解的小故事，再与你一起梳理。'.repeat(20);render()},phase);
     await page.waitForTimeout(100);
     const bounds=await page.evaluate(()=>{const mic=document.querySelector('[data-act="v5-vm-listen"]').getBoundingClientRect(),buttons=Array.from(document.querySelectorAll('.vm5-stage .bj-schools button')).map(e=>e.getBoundingClientRect().toJSON());return {mic:mic.toJSON(),buttons,scroll:document.documentElement.scrollWidth,view:innerWidth,height:innerHeight,hit:document.elementFromPoint(mic.x+mic.width/2,mic.y+mic.height/2)?.closest('[data-act="v5-vm-listen"]')!==null}});
     check(size.width+' '+profile+' '+phase+' 主控首屏',bounds.mic.bottom<=size.height+.5,bounds);
     check(size.width+' '+profile+' '+phase+' 六家完整且页面无横向溢出',bounds.scroll<=bounds.view&&bounds.buttons.every(b=>b.x>=0&&b.right<=bounds.view&&b.height>=28),bounds);
     check(size.width+' '+profile+' '+phase+' 主控未遮挡',bounds.hit,bounds.mic);
     if(phase==='ready'||profile==='mom'&&phase==='speaking')await page.screenshot({path:path.join(out,'baijia-'+size.width+'-'+profile+'-'+phase+'.png'),animations:'disabled',timeout:20000});
    }
   }
  }
  const lifecycle=await page.evaluate(async()=>{
   const host=document.createElement('div');host.style.cssText='position:fixed;left:30px;top:30px;width:420px;height:280px';host.setAttribute('aria-hidden','true');host.dataset.phase='thinking';document.body.append(host);host.innerHTML=J7Visuals.baijia.markup();const cleanup=J7Visuals.baijia.mount(host);await new Promise(r=>setTimeout(r,120));const active={aria:host.getAttribute('aria-hidden'),motion:host.firstElementChild.dataset.motion};host.style.top='-900px';for(let i=0;i<20&&host.firstElementChild.dataset.motion!=='off';i++)await new Promise(r=>setTimeout(r,100));const offscreen=host.firstElementChild.dataset.motion;cleanup();const stopped={aria:host.getAttribute('aria-hidden'),motion:host.firstElementChild.dataset.motion,phase:host.firstElementChild.dataset.phase};host.dataset.phase='speaking';await new Promise(r=>setTimeout(r,30));const after=host.firstElementChild.dataset.phase;host.remove();return {active,offscreen,stopped,after};
  });
  check('独立视觉可挂载并恢复 host aria-hidden',lifecycle.active.aria==='false'&&lifecycle.stopped.aria==='true',lifecycle);
  check('离开屏幕暂停且 cleanup 后不再响应',lifecycle.offscreen==='off'&&lifecycle.stopped.motion==='off'&&lifecycle.after===lifecycle.stopped.phase,lifecycle);
  check('无页面脚本错误',errors.length===0,errors);
  await fs.writeFile(path.join(out,'qa-report.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors,output:out}));
 }finally{await browser.close();}
})().catch(async e=>{console.error(e.stack);await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'qa-failure.json'),JSON.stringify({error:e.message,checks,errors},null,2));process.exitCode=1;});
