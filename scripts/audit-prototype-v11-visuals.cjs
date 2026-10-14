const fs=require('node:fs/promises'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/prototype-v11-qa/audit');
const themes=['pantheon','shanshui','baijia'];
const routes=['overview','chat','sources','temple','collation','memory','personas','research','inbox','tasks','projects','knowledge','services','machines','family','learning','approvals','operations','settings','screen'];
const boards=['family','knowledge','development','operations','research','experience'];
const overlays=['k-new-source','k-upload','vm-policy','vm-memory-new','op-register','op-policy'];
(async()=>{
 await fs.mkdir(out,{recursive:true});const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const errors=[],report=[];
 try{
  const p=await b.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(pathToFileURL(path.join(root,'贾维斯V11.0 · 十套主题与全平台交互原型.html')).href);
  await p.emulateMedia({reducedMotion:'reduce'});
  for(const theme of themes){
   await p.evaluate(t=>{J7.apply(t);handleAction('v5-vm-identify','me');J7.closeLayer()},theme);
   const shots=[];
   async function shot(name){
    const file=theme+'-'+name+'.jpg';await p.screenshot({path:path.join(out,file),type:'jpeg',quality:76});shots.push({file,name});
    const info=await p.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,view:innerWidth,theme:document.documentElement.dataset.j7Theme,bg:getComputedStyle(document.body).backgroundColor,text:getComputedStyle(document.body).color,dialog:!!document.querySelector('[role=dialog]')}));
    report.push({theme,name,...info});if(info.width>info.view)throw new Error(theme+' '+name+' overflow');
   }
   for(const route of routes){await p.evaluate(r=>{U.overlay=null;J5.state().terminal=r==='chat';if(r==='screen')J5.state().board='all';navigate(r)},route);await shot(route)}
   for(const board of boards){await p.evaluate(id=>handleAction('v5-board',id),board);await shot('board-'+board)}
   await p.evaluate(()=>{J5.state().terminal=false;navigate('temple')});
   for(const tab of ['graph','stories','courses','gaps']){await p.evaluate(tab=>handleAction('v5-k-temple-tab',tab),tab);await shot('temple-'+tab)}
   await p.evaluate(()=>navigate('sources'));
   for(const key of overlays){await p.evaluate(key=>{U.overlay=null;J5.open(key)},key);if(!await p.locator('[role=dialog]').isVisible())throw new Error('Missing '+key);await shot('modal-'+key);await p.evaluate(()=>handleAction('close-overlay'))}
   await fs.writeFile(path.join(out,theme+'-contact.html'),'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111;color:#fff;font:14px Arial}h1{padding:18px;margin:0}main{display:grid;grid-template-columns:repeat(4,360px)}figure{margin:0;padding:8px;box-sizing:border-box}img{width:344px;height:215px;object-fit:cover;object-position:top}figcaption{padding:6px}</style><h1>'+theme+' — 20 pages / 7 boards / 4 temple views / 6 dialogs</h1><main>'+shots.map(s=>'<figure><img src="'+s.file+'"><figcaption>'+s.name+'</figcaption></figure>').join('')+'</main>');
   process.stdout.write(theme+' '+shots.length+' actual surfaces captured\n');
  }
  const sheet=await b.newPage({viewport:{width:1440,height:2500}});
  for(const theme of themes){await sheet.goto(pathToFileURL(path.join(out,theme+'-contact.html')).href);await sheet.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));await sheet.screenshot({path:path.join(out,theme+'-contact.png'),fullPage:true})}
  await fs.writeFile(path.join(out,'visual-surface-report.json'),JSON.stringify({report,errors},null,2));if(errors.length)throw new Error(errors.join('\n'));console.log(JSON.stringify({surfaces:report.length,errors}));
 }finally{await b.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
