const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/prototype-v11-pantheon-qa/cascade');
const patch='@media(min-width:1051px) and (max-height:950px){html[data-j7-theme="pantheon"] .vm5-terminal .vm5-workspace .vm5-stage .vm5-energy.j7-core-holder{width:100%;max-width:440px;height:286px}}';
const results=[],errors=[],checks=[];
const final=process.argv.includes('--final');
function check(label,value,detail){checks.push({label,passed:!!value,detail});}
async function metrics(p){return p.evaluate(()=>{
 const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};
 const host=document.querySelector('.vm5-terminal .vm5-stage .vm5-energy.j7-core-holder'),image=host.querySelector('.ph11-art'),style=getComputedStyle(host);
 return {theme:document.documentElement.dataset.j7Theme,host:rect(host),style:{width:style.width,height:style.height,maxWidth:style.maxWidth},panorama:rect(host.querySelector('.ph11-panorama')),image:{...rect(image),naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,fit:getComputedStyle(image).objectFit},buttons:Array.from(host.querySelectorAll('[data-ph11-god]')).map(n=>({name:n.querySelector('span')?.textContent,...rect(n),label:n.querySelector('span')?rect(n.querySelector('span')):null})),primary:rect(document.querySelector('[data-act="v5-vm-listen"]')),scrollY,mainScroll:document.getElementById('main').scrollTop,documentWidth:document.documentElement.scrollWidth};
 });}
(async()=>{await fs.mkdir(out,{recursive:true});const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
 for(const v of [{width:1440,height:900},{width:1366,height:768},{width:1440,height:1000},{width:375,height:812}]){
  const p=await b.newPage({viewport:v,deviceScaleFactor:1});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(pathToFileURL(path.join(root,'贾维斯V11.0 · 十套主题与全平台交互原型.html')).href+'#theme=pantheon&view=chat');await p.waitForSelector('.ph11-art');await p.waitForTimeout(100);
  await p.evaluate(()=>{window.scrollTo(0,0);document.getElementById('main').scrollTop=0});
  const direct=await metrics(p);await p.screenshot({path:path.join(out,`${v.width}x${v.height}-${final?'final':'direct'}.png`)});
  if(final&&v.width===1440&&v.height===900)await p.screenshot({path:path.join(root,'artifacts/prototype-v11-qa/final-surfaces/pantheon-chat.jpg'),type:'jpeg',quality:90});
  const row={viewport:v,direct};
  if(v.width>1050&&v.height<=950){
   if(!final){await p.addStyleTag({content:patch});await p.waitForTimeout(60);row.onlyPatch=await metrics(p);await p.screenshot({path:path.join(out,`${v.width}x${v.height}-only-patch.png`)});}
   const measured=row.onlyPatch||direct;
   check(`${v.width}x${v.height}: ${final?'final HTML':'only scoped patch'} restores 440x286`,Math.abs(measured.host.width-440)<1&&Math.abs(measured.host.height-286)<1,measured);
   check(`${v.width}x${v.height}: primary and all six choices remain in first screen`,measured.primary.bottom<=v.height&&measured.buttons.every(n=>n.bottom<=v.height)&&measured.scrollY===0&&measured.mainScroll===0,measured);
  }else if(v.width===1440){check('Normal desktop remains 540x333',Math.abs(direct.host.width-540)<1&&Math.abs(direct.host.height-333)<1,direct);}else{check('Mobile remains 320x250, two rows and first-screen control',Math.abs(direct.host.width-320)<1&&Math.abs(direct.host.height-250)<1&&new Set(direct.buttons.map(n=>Math.round(n.y))).size===2&&direct.primary.bottom<=v.height,direct);}
  results.push(row);await p.close();
 }
 check('No page errors',errors.length===0,errors);
 console.log(JSON.stringify({checks:checks.map(({label,passed})=>({label,passed})),sizes:results.map(r=>({viewport:r.viewport,direct:r.direct.host,patched:r.onlyPatch?.host,button:r.onlyPatch?.buttons[0]||r.direct.buttons[0],primaryBottom:(r.onlyPatch||r.direct).primary.bottom})),errors}));
 }finally{await fs.writeFile(path.join(out,final?'final-cascade-report.json':'cascade-report.json'),JSON.stringify({results,checks,errors},null,2));await b.close();}if(checks.some(c=>!c.passed))process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1});
