const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/prototype-v9-qa/final-surfaces'),themes=['stark','matrix','hero','jaeger','interstellar','mars'],checks=[],errors=[];
function check(label,value,detail){checks.push({label,passed:!!value,...(detail?{detail}:{})});if(!value)throw new Error(label+' '+JSON.stringify(detail))}
(async()=>{
 await fs.mkdir(out,{recursive:true});const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const p=await b.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(pathToFileURL(path.join(root,'贾维斯V9.0 · 六套主题与全平台交互原型.html')).href);await p.emulateMedia({reducedMotion:'reduce'});
  for(const t of themes){
   await p.evaluate(t=>{J7.apply(t);J5.state().terminal=false;navigate('learning')},t);
   const colors=await p.locator('.lesson-banner').evaluate(n=>({bg:getComputedStyle(n).backgroundImage,text:getComputedStyle(n).color}));check(t+' 学习横幅使用主题颜色',!colors.bg.includes('rgb(85, 105, 229)')&&!colors.bg.includes('rgb(104, 118, 238)'),colors);
   const contrast=await p.locator('.j7-header-theme').evaluate(n=>{const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number),l=s=>{const [r,g,b]=rgb(s).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b},a=l(getComputedStyle(n.querySelector('button')).color),z=l(getComputedStyle(n).backgroundColor);return (Math.max(a,z)+.05)/(Math.min(a,z)+.05)});check(t+' 顶部外观按钮文字对比度',contrast>=4.5,contrast);
   await p.screenshot({path:path.join(out,t+'-learning.png')});
   await p.evaluate(()=>navigate('family'));await p.screenshot({path:path.join(out,t+'-family.png')});
   await p.evaluate(()=>handleAction('v5-board','family'));
   check(t+' 家庭大屏复用自己的核心',await p.locator('.j7-board-core').getAttribute('data-renderer')===t);
   check(t+' 家庭核心没有残留蓝色J球',await p.locator('.j7-board-core>.vm5-core').count()===0);
   check(t+' 家庭大屏只挂载一个核心生命周期',await p.evaluate(()=>J7.state.mounted-J7.state.disposed===1));
   for(const width of [1440,375]){await p.setViewportSize({width,height:width===375?812:900});await p.waitForTimeout(150);check(t+' '+width+' 家庭大屏无溢出',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:path.join(out,t+'-family-board-'+width+'.png')})}
   await p.setViewportSize({width:1366,height:768});await p.evaluate(()=>{J5.state().terminal=true;navigate('chat')});const mic=await p.locator('[data-act="v5-vm-listen"]').boundingBox();check(t+' 1366x768语音主控首屏',mic.y+mic.height<=768,mic);
   await p.setViewportSize({width:1440,height:900});
  }
  check('最后表面复验无脚本错误',errors.length===0,errors);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors}));
 }finally{await b.close()}
})().catch(async e=>{console.error(e.stack);await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:e.message,checks,errors},null,2));process.exitCode=1});
