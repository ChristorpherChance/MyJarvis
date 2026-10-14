const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/prototype-v14-qa'),themes=['stark','matrix','hero','jaeger','interstellar','mars','yijing','pantheon','shanshui','baijia'];
const requested=process.argv.slice(2).filter(x=>!x.startsWith('--')),targets=requested.length?requested:themes,views=process.argv.includes('--chat-only')?['chat']:process.argv.includes('--summary-only')?['overview','screen']:['chat','overview','screen'];
(async()=>{
 await fs.mkdir(path.join(out,'previews'),{recursive:true});const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[],geometry=[];
 try{
  const p=await b.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));await p.goto(pathToFileURL(path.join(root,'贾维斯V14.0 · 十套主题与全平台交互原型.html')).href);await p.emulateMedia({reducedMotion:'reduce'});
  for(const t of targets){
   await p.setViewportSize({width:1440,height:900});await p.evaluate(t=>J7.apply(t),t);
   for(const v of views){await p.evaluate(v=>{J5.state().terminal=v==='chat';if(v==='screen')J5.state().board='all';navigate(v)},v);await p.waitForTimeout(150);const size=await p.evaluate(()=>({width:document.documentElement.scrollWidth,view:innerWidth,bottom:document.querySelector('[data-j14-overview],[data-j14-board]')?.getBoundingClientRect().bottom,height:innerHeight}));geometry.push({theme:t,view:v,...size});if(size.width>size.view+1||size.bottom>size.height+1)throw Error(t+' '+v+' viewport overflow');await p.screenshot({path:path.join(out,'previews',t+'-'+v+'.jpg'),type:'jpeg',quality:78,timeout:60000})}
   if(process.argv.includes('--mobile')){await p.setViewportSize({width:375,height:812});await p.evaluate(()=>{J5.state().terminal=true;navigate('chat')});await p.screenshot({path:path.join(out,t+'-chat-mobile.png'),fullPage:true})}
   process.stdout.write(t+' '+views.length+' previews captured\n');
  }
  await fs.writeFile(path.join(out,requested.length?'preview-refresh-report.json':'preview-capture-report.json'),JSON.stringify({previews:30,captures:targets.length*views.length,targets,views,geometry,errors},null,2));if(errors.length)throw new Error(errors.join('\n'));console.log(JSON.stringify({previews:30,captures:targets.length*views.length,errors}));
 }finally{await b.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});

