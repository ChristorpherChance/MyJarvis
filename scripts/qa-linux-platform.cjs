const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),{spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const cfg=path.resolve('artifacts/server-access/lenovo/ssh-config'),base='https://192.168.10.112:3140',out=path.resolve('artifacts/linux-platform-ui');
function remote(script){const r=spawnSync('ssh',['-F',cfg,'jarvis-112','sudo -n bash -s'],{input:script,encoding:'utf8',maxBuffer:20000,windowsHide:true});if(r.status)throw Error(r.stderr.slice(-1000));return r.stdout.trim();}
(async()=>{await fs.mkdir(out,{recursive:true});let session,browser;const checks=[],errors=[];
try{
 session=remote("cd /opt/jarvis/current\n/opt/jarvis/node/bin/node --input-type=module - <<'JS'\nimport {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{process.stdout.write(s.createLogin());}finally{s.close();}\nJS\n");
 assert(/^[A-Za-z0-9_-]{43}$/.test(session));browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const context=await browser.newContext({viewport:{width:1536,height:960}});
 // Trust the installed home CA normally; this context never disables certificate validation.
 await context.addCookies([{name:'jarvis_session',value:session,domain:'192.168.10.112',path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/?mode=platform#theme=stark&view=machines');await page.locator('.demo-content.view-machines').waitFor({timeout:60000});
 const panel=page.locator('.d-panel,.op-panel').filter({has:page.getByRole('heading',{name:'中心主备',exact:true})});await page.getByRole('heading',{name:'中心主备',exact:true}).waitFor();await page.getByRole('button',{name:'检查节点',exact:true}).click();await page.getByText('节点可连接',{exact:true}).waitFor();assert((await page.locator('.demo-content').innerText()).includes('101'));checks.push('actual-admin-cluster-panel-and-fixed-peer-check');
 await page.screenshot({path:path.join(out,'machines-desktop.png')});
 for(const view of ['overview','screen','chat','settings']){await page.evaluate(view=>location.hash='theme=stark&view='+view+'&board=all',view);await page.locator('.demo-content.view-'+view).waitFor();assert((await page.locator('.demo-content').innerText()).length>30);checks.push('actual-view:'+view);}
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>location.hash='theme=stark&view=machines&board=all');await page.locator('.demo-content.view-machines').waitFor();await page.getByRole('heading',{name:'中心主备',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+3),false);checks.push('actual-cluster-mobile-layout');await page.screenshot({path:path.join(out,'machines-mobile.png')});
 await page.evaluate(async()=>{await fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});window.dispatchEvent(new Event('jarvis:auth-required'));});await page.waitForTimeout(350);assert.equal(await page.getByRole('heading',{name:'中心主备',exact:true}).count(),0);checks.push('logout-clears-private-cluster');
 assert.deepEqual(errors,[]);const report={status:'passed',at:new Date().toISOString(),checks,errors,certificateValidationDisabled:false};await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){await fs.writeFile(path.join(out,'failed-report.json'),JSON.stringify({status:'failed',checks,errors,error:e.message}));throw e;}
finally{if(browser)await browser.close();if(session)remote("cd /opt/jarvis/current\n/opt/jarvis/node/bin/node --input-type=module - <<'JS'\nimport {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{s.deleteLogin('"+session+"');}finally{s.close();}\nJS\n");}
})().catch(e=>{console.error(e.message);process.exitCode=1});

