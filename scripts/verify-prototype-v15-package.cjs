const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/prototype-v15-qa'),themes=['stark','matrix','hero','jaeger','interstellar','mars','yijing','pantheon','shanshui','baijia'];
(async()=>{
 const file=path.join(root,'贾维斯V15.0 · 十套主题与全平台交互原型.html'),html=await fs.readFile(file,'utf8'),previews=JSON.parse(html.match(/const previews=(\{[^\n]+\}),key='jarvis-v15-cinematic-preferences'/)[1]);
 const fresh=[];for(const theme of themes)for(const view of ['overview','screen']){const image='data:image/jpeg;base64,'+(await fs.readFile(path.join(out,'previews',theme+'-'+view+'.jpg'))).toString('base64');if(previews[theme][view]!==image)throw Error('Stale preview '+theme+' '+view);fresh.push(theme+'-'+view)}
 const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[],requests=[],checks=[];
 try{
  const p=await b.newPage({viewport:{width:1366,height:768}});p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});await p.goto(pathToFileURL(file).href+'#theme=stark&view=overview');await p.emulateMedia({reducedMotion:'reduce'});await p.screenshot({path:path.join(out,'final-overview.jpg'),type:'jpeg',quality:80,timeout:60000});
  const semantics=await p.evaluate(()=>{
   const tasks=S.tasks,services=J5.state().ops.services;
   try{
    S.tasks=[{status:'waitingResource'},{status:'unknown'}];
    J5.state().ops.services=[{host:S.machines.find(m=>m.status==='online').id,health:'unknown'}];
    const box=document.createElement('div');box.innerHTML=J15Graphics.metrics();
    const task=box.querySelector('[data-id="tasks"]').getAttribute('aria-label'),health=box.querySelector('[data-id="services"]').getAttribute('aria-label');
    return task.includes('待处理 0')&&task.includes('待执行 1')&&task.includes('待核实 1')&&health.includes('异常或离线 0')&&health.includes('待检查 1')&&!/NaN|Infinity/.test(box.innerHTML);
   }finally{S.tasks=tasks;J5.state().ops.services=services}
  });if(!semantics)throw Error('Unknown and queued state categories incorrect');checks.push('unknown states stay neutral; resource waits stay queued');
  const bottom=await p.locator('[data-j14-overview]').evaluate(n=>n.getBoundingClientRect().bottom);if(bottom>769)throw Error('Final overview does not fit');checks.push('final overview fits 1366x768');
  await p.evaluate(()=>J7.openCompare());if(await p.locator('.j7-design-card').count()!==10)throw Error('Missing themes');await p.locator('.j7-card-image img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));checks.push('all ten embedded theme previews render');await p.evaluate(()=>J7.closeLayer());await p.evaluate(()=>J7.openDirectory());if(await p.locator('[data-j6-route]').count()!==20)throw Error('Missing routes');checks.push('all twenty directory routes remain available');await p.evaluate(()=>J7.closeLayer());
  const contact=path.join(out,'theme-contact.html');await fs.writeFile(contact,'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#171b20;color:#fff;font:14px Arial}h1{font-size:20px;margin:0;padding:15px}main{display:grid;grid-template-columns:repeat(4,360px)}figure{margin:0;padding:8px}img{width:344px;height:215px;object-fit:cover}figcaption{padding:7px}</style><h1>V15 · 10 themes / overview + command board</h1><main>'+themes.flatMap(t=>['overview','screen'].map(v=>'<figure><img src="'+previews[t][v]+'"><figcaption>'+t+' / '+v+'</figcaption></figure>')).join('')+'</main>');await p.setViewportSize({width:1440,height:1350});await p.goto(pathToFileURL(contact).href);await p.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));await p.screenshot({path:path.join(out,'theme-contact.png'),fullPage:true,timeout:60000});
  if(errors.length||requests.length)throw Error(JSON.stringify({errors,requests}));await fs.writeFile(path.join(out,'package-report.json'),JSON.stringify({bytes:Buffer.byteLength(html),embeddedPreviews:Object.values(previews).reduce((n,x)=>n+Object.keys(x).length,0),freshPreviews:fresh,checks,errors,requests},null,2));console.log(JSON.stringify({freshPreviews:fresh.length,checks:checks.length,errors,requests}));
 }finally{await b.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
