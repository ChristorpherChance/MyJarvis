const fs=require('node:fs/promises'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/prototype-v13-layout-qa');
const file=process.argv[2]||'贾维斯V13.0 · 十套主题与全平台交互原型.html';
const themes=['stark','matrix','hero','jaeger','interstellar','mars','yijing','pantheon','shanshui','baijia'];
const checks=[],errors=[],requests=[],measurements=[];
function check(label,value,detail){checks.push({label,passed:!!value,...(detail===undefined?{}:{detail})});}
function inspect(){
 const pick=list=>list.map(s=>document.querySelector(s)).find(Boolean);
 const visual=pick(['.j13-art','.vm5-stage']);
 const rail=pick(['.j13-conversation'])||document.querySelector('.vm5-dialogue')?.parentElement;
 const rect=n=>{if(!n)return null;const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
 const visible=n=>{if(!n||n.closest('[hidden]'))return false;const s=getComputedStyle(n),r=n.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
 const info=selector=>{const n=document.querySelector(selector);const r=rect(n);let hit=false;if(r&&visible(n)&&!n.closest('[inert]')){const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);hit=!!e&&(e===n||n.contains(e));}return {visible:visible(n),rect:r,hit,inert:!!n?.closest('[inert]'),disabled:!!n?.disabled}};
 const dialogue=document.querySelector('.vm5-dialogue'),core=document.querySelector('.vm5-stage .j7-core-holder');
 const selectFooters=['.av12-hero-picker','.ph11-god-cards','.bj-schools','.j11-ss-scenes','.j11-ss-scene-button'];
 return{viewport:{width:innerWidth,height:innerHeight},mode:window.J12Immersive?.state?.mode||window.J13Split?.state?.mode,terminal:rect(document.querySelector('.vm5-terminal')),visual:rect(visual),rail:rect(rail),core:rect(core),dialogue:info('.vm5-dialogue'),mic:info('[data-act="v5-vm-listen"]'),stop:info('[data-act="v5-vm-interrupt"]'),caption:info('.vm5-caption'),captionSize:Number.parseFloat(getComputedStyle(document.querySelector('.vm5-caption p')).fontSize),themeSwitch:info('.j7-film-switch'),top:info('.vm5-top'),film:info('.j7-film-bar'),sidebar:info('.sidebar'),header:info('.app-header'),footers:selectFooters.filter(s=>visible(document.querySelector(s))),dialogues:document.querySelectorAll('.vm5-dialogue').length,inputs:document.querySelectorAll('#vm5-input').length,preservedDialogue:dialogue===window.__v13OriginalDialogue,preservedInput:document.querySelector('#vm5-input')===window.__v13OriginalInput,overflow:document.documentElement.scrollWidth-innerWidth};
}
function validateDesktop(m,label,mode){
 const v=m.visual,t=m.terminal,r=m.rail,ratio=v&&t?v.width/t.width:0;
 check(label+' 左侧视觉占70%-80%',ratio>=.7&&ratio<=.8,{ratio,visual:v,terminal:t});
 check(label+' 右侧真实对话可见',m.dialogue.visible&&!m.dialogue.inert&&m.dialogues===1,m.dialogue);
 check(label+' 左右分区不重叠',v&&r&&v.right<=r.x+2&&Math.abs(v.y-r.y)<=2,{visual:v,rail:r});
 check(label+' 核心视觉确实放大',m.core&&v&&m.core.width>=v.width*.44&&m.core.height>=v.height*.38,{core:m.core,visual:v});
 for(const key of ['mic','stop']){const c=m[key],b=c.rect;check(label+' '+key+' 首屏真实点击',c.visible&&c.hit&&!c.inert&&!c.disabled&&b.y>=-1&&b.bottom<=m.viewport.height+1&&b.x>=-1&&b.right<=m.viewport.width+1,c);}
 check(label+' 实况字幕可见',m.caption.visible&&!m.caption.inert,m.caption);
 check(label+' 原对话与唯一输入节点保留',m.preservedDialogue&&m.preservedInput&&m.inputs===1,{dialogue:m.preservedDialogue,input:m.preservedInput,count:m.inputs});
 check(label+' 无横向溢出',m.overflow<=1,m.overflow);
 if(mode==='theatre'){
  check(label+' 全屏不显示原顶部/主题条/平台导航',!m.top.visible&&!m.film.visible&&!m.sidebar.visible&&!m.header.visible,{top:m.top.visible,film:m.film.visible,sidebar:m.sidebar.visible,header:m.header.visible});
  check(label+' 全屏隐藏场景选择杂项',m.footers.length===0,m.footers);
 }else check(label+' 收拢保留主题控制',m.themeSwitch.visible,m.themeSwitch);
}
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});
  await page.goto(pathToFileURL(path.resolve(root,file)).href,{waitUntil:'load'});
  await page.waitForFunction(()=>window.J12Immersive&&window.J7&&typeof U!=='undefined'&&U.route==='chat');
  await page.evaluate(()=>{window.__v13OriginalDialogue=document.querySelector('.vm5-dialogue');window.__v13OriginalInput=document.querySelector('#vm5-input');});
  const screenshots=new Set(['hero/theatre/1440','baijia/theatre/1440','stark/control/1440']);
  for(const viewport of [{width:1440,height:900},{width:1366,height:768}]){
   await page.setViewportSize(viewport);
   for(const mode of ['theatre','control'])for(const theme of themes){
    await page.evaluate(({mode,theme})=>{J7.apply(theme);J12Immersive.setMode(mode);window.scrollTo(0,0);},{mode,theme});
    await page.waitForTimeout(160);
    const m=await page.evaluate(inspect),label=theme+' '+mode+' '+viewport.width;
    measurements.push({theme,mode,...m});validateDesktop(m,label,mode);
    if(screenshots.has(theme+'/'+mode+'/'+viewport.width))await page.screenshot({path:path.join(out,theme+'-'+mode+'-'+viewport.width+'.jpg'),type:'jpeg',quality:86,timeout:60000});
   }
   process.stdout.write(viewport.width+' desktop layouts inspected\n');
  }
  await page.setViewportSize({width:812,height:375});
  for(const theme of ['stark','hero']){
   await page.evaluate(theme=>{J7.apply(theme);J12Immersive.setMode('theatre');window.scrollTo(0,0);},theme);
   await page.waitForTimeout(160);const m=await page.evaluate(inspect);measurements.push({theme,mode:'theatre',...m});validateDesktop(m,theme+' theatre landscape 812','theatre');
  }
  await page.setViewportSize({width:375,height:812});
  for(const theme of ['hero','baijia','stark'])for(const mode of ['theatre','control']){
   await page.evaluate(({theme,mode})=>{J7.apply(theme);J12Immersive.setMode(mode);window.scrollTo(0,0);},{theme,mode});
   await page.waitForTimeout(160);const m=await page.evaluate(inspect),label=theme+' '+mode+' phone';measurements.push({theme,mode,...m});
   check(label+' 无横向溢出',m.overflow<=1,m.overflow);check(label+' 对话内容可见',m.dialogue.visible,m.dialogue);
   for(const key of ['mic','stop']){const c=m[key],b=c.rect;check(label+' '+key+' 首屏可操作',c.visible&&c.hit&&!c.inert&&b.y>=-1&&b.bottom<=812&&b.right<=376,c);}
   check(label+' 字幕可读',m.caption.visible&&m.captionSize>=14,{visible:m.caption.visible,size:m.captionSize});
   if(theme==='hero'&&mode==='theatre')await page.screenshot({path:path.join(out,'hero-theatre-phone.jpg'),type:'jpeg',quality:86,timeout:60000});
  }
  for(const profile of ['dad','mom']){
   await page.evaluate(profile=>{handleAction('switch-profile',profile);J12Immersive.setMode('theatre');window.scrollTo(0,0);},profile);
   await page.waitForTimeout(160);const m=await page.evaluate(inspect);check(profile+' 手机父母字幕至少16px',m.caption.visible&&m.captionSize>=16,{size:m.captionSize});check(profile+' 手机语音控件真实点击',m.mic.hit&&m.stop.hit,{mic:m.mic,stop:m.stop});
  }
  check('无脚本异常',errors.length===0,errors);check('单HTML无外网依赖',requests.length===0,requests);
 }catch(e){errors.push(e.stack);check('执行过程完成',false,e.message);}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify({checks,measurements,errors,requests},null,2),'utf8');}
 const failed=checks.filter(c=>!c.passed);console.log(JSON.stringify({checks:checks.length,passed:checks.length-failed.length,failed:failed.length,errors,requests,failures:failed},null,2));if(failed.length)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
