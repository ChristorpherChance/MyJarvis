/** Read-only layout checks; optional local compiled assets at the authenticated public origin. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import {primary,python} from './managed-server-client.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const local=process.argv.includes('--local'),baseline=process.argv.includes('--baseline'),smoke=process.argv.includes('--smoke');
const origin='https://cc-jarvis.ikvein.com',out='artifacts/mobile-layout/'+(baseline?'before':local?'local':'published');
const routes=['overview','chat','screen','inbox','research','projects','tasks','knowledge','sources','temple','collation','learning','family','memory','personas','machines','services','operations','approvals','settings'];
const themes=['stark','matrix','hero','jaeger','interstellar','mars','yijing','pantheon','shanshui','baijia'];
function store(code){return primary(python({code:"import {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{"+code+"}finally{s.close();}"},"import subprocess\nr=subprocess.run(['/opt/jarvis/node/bin/node','--input-type=module','-e',p['code']],cwd='/opt/jarvis/current',capture_output=True,text=True,check=True)\nprint(r.stdout)\n"));}
let browser,cookie,page;const checks=[],errors=[],overflow=[];
await mkdir(out,{recursive:true});
try{
 cookie=store('process.stdout.write(s.createLogin());');assert.match(cookie,/^[A-Za-z0-9_-]{43}$/);
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--no-proxy-server','--disable-quic']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await context.addCookies([{name:'jarvis_session',value:cookie,domain:'cc-jarvis.ikvein.com',path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
 if(local)await context.route(origin+'/**',async route=>{
  const req=route.request(),url=new URL(req.url());if(req.method()!=='GET'||url.pathname.startsWith('/api/'))return route.continue();
  const base=resolve('apps/web/dist'),file=resolve(base,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(base+sep))return route.abort();
  try{await route.fulfill({body:await readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[extname(file)]||'application/octet-stream'});}catch{await route.continue();}
 });
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 page.setDefaultTimeout(20000);
 await page.goto(origin+'/?mode=platform&rev=mobile-layout-qa#theme=stark&view=overview');await page.locator('.pd-overview').waitFor({timeout:60000});
 async function open(view,theme='stark'){
  await page.evaluate(([view,theme])=>location.hash=new URLSearchParams({view,theme,board:'all'}).toString(),[view,theme]);
  await page.locator('.view-'+view).waitFor();await page.waitForTimeout(300);
  if(view==='chat')await page.waitForFunction(()=>document.querySelector('.room-controls button')?.disabled===false,{},{timeout:30000});
 }
 async function inspect(view,width){
  const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,contentWidth:document.querySelector('.demo-content')?.getBoundingClientRect().width,offenders:[...document.querySelectorAll('.demo-workspace *')].filter(e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return b.width&&b.right>innerWidth+2&&s.position!=='fixed'&&!e.closest('.op-table-wrap, .op-table-scroll');}).slice(0,12).map(e=>({tag:e.tagName,class:e.className,right:Math.round(e.getBoundingClientRect().right)}))}));
  if(state.scrollWidth>width+2)overflow.push({view,width,...state});
  checks.push({view,width,scrollWidth:state.scrollWidth,contentWidth:state.contentWidth});
 }
 for(const width of baseline?[390]:smoke?[390]:[320,390,430,768,1024,1536]){
  await page.setViewportSize({width,height:width>=1024?960:844});
  for(const view of baseline?['overview','chat','screen','machines','services','settings']:routes){await open(view);await inspect(view,width);if((width===390&&['overview','chat','screen','machines','services','settings'].includes(view))||width===1536&&view==='overview')await page.screenshot({path:out+'/'+view+'-'+width+'.png'});}console.log('Viewport checked: '+width);
 }
 if(!baseline){
  await page.setViewportSize({width:390,height:844});await open('overview');
  await page.getByRole('button',{name:'更多功能',exact:true}).click();await page.locator('.demo-app.mobile-nav-open').waitFor();const deviceLink=page.locator('.demo-sidebar').getByRole('button',{name:'设备管理',exact:true});if(!await deviceLink.isVisible())await page.getByRole('button',{name:/^系统运维/}).click();await deviceLink.waitFor();await page.screenshot({path:out+'/navigation-390.png'});
  await page.locator('.demo-sidebar').getByRole('button',{name:'设备管理',exact:true}).click();await page.locator('.view-machines').waitFor();assert.equal(await page.locator('.mobile-nav-open').count(),0);
  await page.getByRole('button',{name:'更多功能',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.locator('.mobile-nav-open').count(),0);
  await page.getByRole('button',{name:'查找功能',exact:true}).click();await page.getByRole('dialog',{name:'功能目录'}).waitFor();await page.screenshot({path:out+'/dialog-390.png'});await page.getByRole('dialog',{name:'功能目录'}).getByRole('button',{name:'关闭',exact:true}).click();
  for(const theme of themes){await open('chat',theme);await page.getByRole('button',{name:'开始交流',exact:true}).waitFor();await inspect('chat-'+theme,390);await page.getByRole('button',{name:'沉浸全屏',exact:true}).click();await page.screenshot({path:out+'/voice-'+theme+'-390.png'});assert(await page.locator('.room-immersive').evaluate(e=>{const b=e.getBoundingClientRect();return Math.abs(b.height-innerHeight)<2&&b.x===0&&b.y===0;}));await page.getByRole('button',{name:'退出全屏',exact:true}).click();}
  await open('chat');await page.getByRole('button',{name:'文字交流',exact:true}).click();await page.getByRole('textbox',{name:'和真实贾维斯交流'}).waitFor();await inspect('text-chat',390);await page.screenshot({path:out+'/text-chat-390.png'});
  await page.getByRole('button',{name:'沉浸全屏',exact:true}).click();await page.screenshot({path:out+'/text-chat-immersive-390.png'});await page.getByRole('button',{name:'退出沉浸全屏',exact:true}).click();
 }
 const report={at:new Date().toISOString(),status:overflow.length||errors.length?'failed':'passed',baseline,local,checks,overflow,errors,physicalPhone:false,readOnly:true};await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:checks.length,overflow,errors}));
 if(!baseline){assert.deepEqual(overflow,[]);assert.deepEqual(errors,[]);}
}catch(e){const message=String(e.message).replaceAll(cookie||'__none__','[redacted]');if(page)await page.screenshot({path:out+'/failure.png'}).catch(()=>{});await writeFile(out+'/failed-report.json',JSON.stringify({status:'failed',checks,overflow,errors,error:message},null,2));console.error(message);process.exitCode=1;}
finally{if(browser)await browser.close();if(cookie)store('s.deleteLogin('+JSON.stringify(cookie)+');');}
