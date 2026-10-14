const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/prototype-v10-qa'),themes=['stark','matrix','hero','jaeger','interstellar','mars','yijing','pantheon'];
(async()=>{
 await fs.mkdir(path.join(out,'previews'),{recursive:true});const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[];
 try{
  const p=await b.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));await p.goto(pathToFileURL(path.join(root,'贾维斯V10.0 · 八套主题与全平台交互原型.html')).href);
  for(const t of themes){
   await p.setViewportSize({width:1440,height:1000});await p.evaluate(t=>J7.apply(t),t);
   for(const v of ['chat','overview','screen']){await p.evaluate(v=>{J5.state().terminal=v==='chat';if(v==='screen')J5.state().board='all';navigate(v)},v);await p.waitForTimeout(350);await p.screenshot({path:path.join(out,'previews',t+'-'+v+'.jpg'),type:'jpeg',quality:78})}
   if(['yijing','pantheon'].includes(t)){await p.setViewportSize({width:375,height:812});await p.evaluate(()=>{J5.state().terminal=true;navigate('chat')});await p.screenshot({path:path.join(out,t+'-chat-mobile.png'),fullPage:true})}
   process.stdout.write(t+' three previews captured\n');
  }
  await fs.writeFile(path.join(out,'preview-capture-report.json'),JSON.stringify({previews:24,errors},null,2));if(errors.length)throw new Error(errors.join('\n'));console.log(JSON.stringify({previews:24,errors}));
 }finally{await b.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
