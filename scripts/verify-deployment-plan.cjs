const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL,fileURLToPath}=require('node:url'),crypto=require('node:crypto');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/deployment-plan'),name='贾维斯 · 部署运行与实施规划';
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const md=await fs.readFile(path.join(root,name+'.md'),'utf8'),html=await fs.readFile(path.join(root,name+'.html'),'utf8'),hash=crypto.createHash('sha256').update(md).digest('hex');
 if(!html.includes('content="'+hash+'"'))throw Error('HTML source mismatch');
 const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[],requests=[],checks=['Markdown and HTML content hash match'];
 try{
  const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});
  await p.goto(pathToFileURL(path.join(root,name+'.html')).href);await p.emulateMedia({reducedMotion:'reduce'});
  if(await p.locator('.doc-section').count()!==8)throw Error('Missing sections');checks.push('all eight sections and topology render');
  const urls=await p.locator('a').evaluateAll(nodes=>nodes.map(n=>n.href).filter(x=>x.startsWith('file:')&&!x.includes('#')));
  for(const url of [...new Set(urls)])await fs.access(fileURLToPath(url));checks.push('all local document and prototype links exist');
  if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Desktop horizontal overflow');
  await p.screenshot({path:path.join(out,'desktop.jpg'),type:'jpeg',quality:83});await p.locator('svg[role="img"]').screenshot({path:path.join(out,'topology.png')});checks.push('desktop layout fits');
  await p.locator('#search').fill('无此内容校验');if(!await p.locator('#no-results').isVisible())throw Error('Search empty state missing');await p.locator('#search').fill('');
  const theme=await p.evaluate(()=>document.documentElement.dataset.theme);await p.locator('#theme-toggle').click();if(await p.evaluate(()=>document.documentElement.dataset.theme)===theme)throw Error('Theme toggle failed');checks.push('search, clear and theme controls work');
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>scrollTo(0,0));if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Mobile horizontal overflow');
  await p.locator('#menu-toggle').click();if(await p.locator('#menu-toggle').getAttribute('aria-expanded')!=='true')throw Error('Mobile menu did not open');await p.locator('.toc-link.level-2').first().click();if(await p.locator('#menu-toggle').getAttribute('aria-expanded')!=='false')throw Error('Mobile menu did not close');
  await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(out,'mobile.jpg'),type:'jpeg',quality:83});checks.push('mobile layout and navigation work');
  if(errors.length||requests.length)throw Error(JSON.stringify({errors,requests}));await fs.writeFile(path.join(out,'report.json'),JSON.stringify({sourceSha256:hash,sections:8,checks,errors,requests},null,2));console.log(JSON.stringify({checks:checks.length,sections:8,errors,requests}));
 }finally{await b.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
