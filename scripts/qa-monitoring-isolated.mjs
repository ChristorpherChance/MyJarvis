/** Isolated real-browser monitoring regression check; no model, execution dispatch, or deployment. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv.includes('--isolated-child')){
 const {chromium}=await import('/home/superopen/All-Projects/MyJevis-project-acceptance/node_modules/@playwright/test/index.mjs');
 await access(join(root,'apps/web/dist/index.html'));await access(chromium.executablePath());
 const home=await mkdtemp(join(tmpdir(),'jarvis-monitoring-home-'));
 const env={HOME:home,USERPROFILE:home,PATH:process.env.PATH,LANG:'C.UTF-8',JARVIS_MONITORING_CHROMIUM:chromium.executablePath()};
 const child=spawn(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'--isolated-child'],{cwd:root,env,stdio:'inherit',shell:false,detached:process.platform!=='win32'});
 let escalation,timedOut=false;const kill=signal=>{try{if(child.pid)process.kill(process.platform==='win32'?child.pid:-child.pid,signal)}catch(e){if(e.code!=='ESRCH')throw e}};
 const timer=setTimeout(()=>{timedOut=true;kill('SIGTERM');escalation=setTimeout(()=>kill('SIGKILL'),5000)},180000);
 const finish=async code=>{clearTimeout(timer);clearTimeout(escalation);process.exitCode=timedOut?1:code??1;await rm(home,{recursive:true,force:true})};child.once('error',()=>void finish(1));child.once('exit',code=>void finish(code));
}else{
 const {chromium}=await import('/home/superopen/All-Projects/MyJevis-project-acceptance/node_modules/@playwright/test/index.mjs');
 const {createApp}=await import('../apps/api/src/app.ts');
 const {signedExecutionText}=await import('../apps/api/src/runtime/execution-runtime.ts');
 const {generateKeyPairSync,sign}=await import('node:crypto');
 const attempt=randomUUID(),out=join(root,'artifacts/monitoring-fix',`qa-${attempt}`);await mkdir(out,{recursive:true});
 const report={at:new Date().toISOString(),attempt,passed:false,checks:[],errors:[],blockedExternalRequests:[],productionAccess:false,scope:'isolated createApp HTTP + SQLite + real Chromium; signed fixture telemetry; no model, execution dispatch, or deployment'};
 let runtime,browser,context,page,server,dataDir,base='',active='setup';
 const check=async(name,fn)=>{active=name;await fn();report.checks.push({name,status:'passed'});console.log('PASS '+name)};
 try{
  dataDir=await mkdtemp(join(tmpdir(),'jarvis-monitoring-data-'));const fakePi={initialize:async()=>{},dispose:async()=>{},health:()=>({configured:false})};
  runtime=await createApp({dataDir,pi:fakePi,webDir:join(root,'apps/web/dist'),pythonExecutable:join(dataDir,'nonexistent-python'),whisperModelDirectory:join(dataDir,'nonexistent-model'),healthInstanceId:randomUUID()});
  server=await runtime.app.listen({host:'127.0.0.1',port:0});base=server;
  assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal((await (await fetch(base+'/api/health')).json()).instanceId!==undefined,true);
  browser=await chromium.launch({headless:true,executablePath:process.env.JARVIS_MONITORING_CHROMIUM});
  context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base)return route.continue();report.blockedExternalRequests.push(url.origin);return route.abort()});
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>report.errors.push(error.message));
  const api=async(path,method='GET',data)=>{const response=await context.request.fetch(base+path,{method,...(data===undefined?{}:{data})});const body=await response.json();assert(response.ok(),`${method} ${path}: ${response.status()} ${JSON.stringify(body)}`);return body};
  let machineId,agents=[];
  await check('initialize-only-temporary-admin-and-register-machine',async()=>{
   await page.goto(base+'/?mode=platform#'+new URLSearchParams({theme:'stark',view:'machines'}));
   const password='Isolated-'+randomUUID()+'-Only';await page.getByLabel('管理密码',{exact:true}).fill(password);await page.getByLabel('确认密码',{exact:true}).fill(password);await page.getByRole('button',{name:'创建账户',exact:true}).click();
   await page.getByRole('heading',{name:'设备管理',exact:true}).waitFor();
   const env={commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{name:'隔离遥测服务器',role:'浏览器回归验证专用',category:'server',cpu:'Fixture CPU',ram:32,disk:'fixture',gpu:'',os:'Linux',address:'127.0.0.1',room:'临时隔离环境',always:false,readOnly:false}};
   const created=await api('/api/v1/machines/commands/register','POST',env);machineId=created.data.id;assert.equal(created.data.name,'隔离遥测服务器');
  });
  await check('pair-two-signed-telemetry-agents-and-preserve-per-metric-snapshots',async()=>{
   const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({format:'pem',type:'spki'}).toString();
   const pair=async()=>{const ticket=(await api('/api/v1/execution/tickets','POST',{machineId,capabilities:['telemetry'],ttlSec:60})).data.ticket;return (await api('/api/v1/agents/pair','POST',{ticket,publicKey})).data};
   agents=[await pair(),await pair()];
   const send=async(agent,body)=>{const path=`/api/v1/agents/${agent.agentId}/heartbeat`,timestamp=new Date().toISOString(),nonce=randomUUID(),signature=sign(null,Buffer.from(signedExecutionText('POST',path,timestamp,nonce,body)),keys.privateKey).toString('base64url');return api(path,'POST',body,{ 'x-jarvis-timestamp':timestamp,'x-jarvis-nonce':nonce,'x-jarvis-signature':signature })};
   const signedSend=async(agent,body)=>{const path=`/api/v1/agents/${agent.agentId}/heartbeat`,timestamp=new Date().toISOString(),nonce=randomUUID(),signature=sign(null,Buffer.from(signedExecutionText('POST',path,timestamp,nonce,body)),keys.privateKey).toString('base64url');const r=await context.request.fetch(base+path,{method:'POST',data:body,headers:{'x-jarvis-timestamp':timestamp,'x-jarvis-nonce':nonce,'x-jarvis-signature':signature}});const json=await r.json();assert(r.ok(),`signed heartbeat: ${r.status()} ${JSON.stringify(json)}`);return json};
   const full={metrics:{diskPercent:41,diskFreeGB:81,diskTotalGB:512,cpuPercent:37,uptimeSec:10981939}};
   await signedSend(agents[0],full);await new Promise(r=>setTimeout(r,3));
   const cpuOnly={metrics:{cpuPercent:12}};await signedSend(agents[1],cpuOnly);
   const machine=(await api(`/api/v1/machines/${machineId}`)).data;
   assert.equal(machine.telemetry.diskTotalGB,512);assert.equal(machine.telemetry.diskFreeGB,81);assert.equal(machine.telemetry.diskPercent,41);assert.equal(machine.telemetry.uptimeSec,10981939);assert.equal(machine.telemetry.cpuPercent,12);
   assert.equal(machine.telemetry.metricFreshness.diskTotalGB.agentId,agents[0].agentId);assert.equal(machine.telemetry.metricFreshness.cpuPercent.agentId,agents[1].agentId);
   await page.goto(base+'/?mode=platform#'+new URLSearchParams({theme:'stark',view:'machines'}));await page.getByText('隔离遥测服务器',{exact:true}).waitFor();
   const card=page.locator('.server-card').filter({hasText:'隔离遥测服务器'});await card.waitFor();await card.getByText('81.0 / 总计 512.0 GiB',{exact:false}).waitFor();await card.getByText('127天 2小时',{exact:false}).waitFor();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'desktop page horizontal overflow');
   report._signedSend=signedSend;
  });
  await check('cpu-only-snapshot-keeps-disk-and-uptime-in-real-device-card',async()=>{
   const signedSend=report._signedSend;await signedSend(agents[1],{metrics:{cpuPercent:5}});await page.getByRole('button',{name:'刷新真实数据'}).click();
   const card=page.locator('.server-card').filter({hasText:'隔离遥测服务器'});await card.getByText('81.0 / 总计 512.0 GiB',{exact:false}).waitFor();await card.getByText('127天 2小时',{exact:false}).waitFor();
   const machine=(await api(`/api/v1/machines/${machineId}`)).data;assert.equal(machine.telemetry.diskTotalGB,512);assert.equal(machine.telemetry.uptimeSec,10981939);assert.equal(machine.telemetry.cpuPercent,5);
  });
  await check('expire-per-metric-projection-is-distinct-between-api-and-ui',async()=>{
   const {projectFreshTelemetry}=await import('../apps/web/src/demo/metric-freshness.ts');const current=(await api(`/api/v1/machines/${machineId}`)).data;
   const projected=projectFreshTelemetry(current.telemetry,Date.now()+61000);assert.equal(projected.diskTotalGB,undefined);assert.equal(projected.uptimeSec,undefined);
   const apiAtRead=(await api(`/api/v1/machines/${machineId}`)).data;assert.equal(apiAtRead.telemetry.diskTotalGB,512,'API reads stay live; future projection time is test-only');
   report.expiration={apiRead:'fresh/live projection at actual time',browserProjection:'expired via explicit future at override (61s)',fixtureOnly:true};
  });
  await check('mobile-390px-device-page-has-no-horizontal-overflow',async()=>{
   await page.setViewportSize({width:390,height:844});await page.goto(base+'/?mode=platform#'+new URLSearchParams({theme:'stark',view:'machines'}));
   await page.locator('.server-card').filter({hasText:'隔离遥测服务器'}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'390px page horizontal overflow');
   await page.screenshot({path:join(out,'monitoring-device-mobile.png'),fullPage:true});
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.blockedExternalRequests,[]);
  report.passed=true;
 }catch(error){process.exitCode=1;report.resultsFailure={name:active,error:String(error?.stack||error).replaceAll(base,'[isolated-origin]').slice(0,5000)};if(page)await page.screenshot({path:join(out,'failure.png'),fullPage:true}).catch(()=>{})}
 finally{
  delete report._signedSend;
  for(const [name,resource] of [['context',context],['browser',browser],['server',server?{close:()=>runtime?.app.close()}:null]])try{await resource?.close?.()}catch(error){report.errors.push(`cleanup ${name}: ${error.name}`);process.exitCode=1}
  if(!server&&runtime)try{await runtime.app.close()}catch(error){report.errors.push(`cleanup app: ${error.name}`);process.exitCode=1}
  if(dataDir)await rm(dataDir,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(error=>{report.errors.push(`cleanup sqlite: ${error.name}`);process.exitCode=1});
  report.passed=report.passed&&process.exitCode!==1;await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 }
}
