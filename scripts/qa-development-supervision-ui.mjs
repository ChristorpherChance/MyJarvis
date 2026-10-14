/** Published UI checks with browser-local native executor fixtures; no business configuration is changed. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {primary,python} from './managed-server-client.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://cc-jarvis.ikvein.com',output='artifacts/development-supervision-ui';await mkdir(output,{recursive:true});
function store(code){return primary(python({code:"import {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{"+code+"}finally{s.close();}"},"import subprocess\nr=subprocess.run(['/opt/jarvis/node/bin/node','--input-type=module','-e',p['code']],cwd='/opt/jarvis/current',capture_output=True,text=True,check=True)\nprint(r.stdout)\n"));}
const make=(machineId)=>({id:'coding',machineId,engine:'codex',program:'C:\\Tools\\codex.exe',args:['exec','--json','--sandbox','workspace-write','{prompt}'],workspaceRoot:'D:\\JarvisProjects',maxRounds:10,timeoutSec:1200,leaseSec:60,budgetCurrency:'USD',supervision:{billing:'priced',maxTokens:500000,maxRecoveryAttempts:3,retryDelaySec:900,repairValidation:true,fallbackExecutorIds:[]}});
let configuration={revision:41,templates:[make('qa-node-a'),make('qa-node-b')],probes:[{serviceId:'preserved-probe',url:'https://example.invalid/health',timeoutSec:3}],wol:[]},browser,cookie,page;
const errors=[],writes=[],unexpectedWrites=[],checks=[];
try{
 cookie=store('process.stdout.write(s.createLogin());');assert.match(cookie,/^[A-Za-z0-9_-]{43}$/);
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--no-proxy-server','--disable-quic']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await context.addCookies([{name:'jarvis_session',value:cookie,domain:'cc-jarvis.ikvein.com',path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
 await context.route(origin+'/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,method=req.method();let data;
  if(path==='/api/v1/execution/config'){
   if(method==='PUT'){const body=req.postDataJSON();assert.equal(body.expectedVersion,configuration.revision);writes.push(body);configuration={revision:configuration.revision+1,templates:body.templates,probes:body.probes,wol:body.wol};}
   else assert.equal(method,'GET');data=configuration;
  }else if(path==='/api/v1/execution/supervision')data={supervised:false,stopped:false,automaticAcceptance:false,tasks:[]};
  else if(path==='/api/v1/execution/capabilities')data={development:false,remoteAgents:false,supervised:false,onlineAgents:0,configuredTemplates:configuration.templates.map(t=>({id:t.id,machineId:t.machineId,engine:t.engine,ready:false}))};
  else if(!['GET','HEAD'].includes(method)){unexpectedWrites.push({method,path});return route.abort();}
  if(data===undefined)return route.continue();return route.fulfill({json:{requestId:randomUUID(),version:configuration.revision,data,events:[]}});
 });
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(origin+'/?mode=platform&rev=supervision-qa#theme=stark&view=tasks',{waitUntil:'domcontentloaded',timeout:45000});await page.getByRole('button',{name:'持续策略',exact:true}).waitFor();
 await page.getByRole('combobox',{name:'开发执行器'}).selectOption(JSON.stringify(['qa-node-b','coding']));await page.getByRole('button',{name:'持续策略',exact:true}).click();
 await page.getByRole('dialog',{name:'持续开发策略'}).waitFor();await page.getByRole('spinbutton',{name:'每次最多轮数'}).fill('7');await page.screenshot({path:output+'/policy-mobile.png'});await page.getByRole('button',{name:'保存记录',exact:true}).click();await page.getByRole('dialog',{name:'持续开发策略'}).waitFor({state:'hidden'});
 assert.equal(writes.length,1);assert.equal(writes[0].expectedVersion,41);assert.equal(writes[0].templates.find(t=>t.machineId==='qa-node-a').maxRounds,10);const updated=writes[0].templates.find(t=>t.machineId==='qa-node-b');assert.equal(updated.maxRounds,7);assert.equal(updated.supervision.inputUSDPerMillion,undefined);assert.deepEqual(writes[0].probes,configuration.probes);checks.push('duplicate executor IDs select the correct machine; blank prices remain unpriced; frozen revision and unrelated configuration preserved');
 await page.setViewportSize({width:1536,height:960});await page.screenshot({path:output+'/panel-desktop.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>location.hash='theme=stark&view=settings');await page.getByRole('button',{name:'运行引擎',exact:true}).click();await page.getByRole('button',{name:'节点执行',exact:true}).click();await page.getByRole('group',{name:/^执行模板与探测配置/}).getByRole('textbox').waitFor();
 const incoming={...make('qa-node-b'),id:'qa-node-b-claude',engine:'claude',args:['--print','{prompt}','--output-format','stream-json','--max-budget-usd','{maxBudgetUSD}']};
 await page.getByLabel('导入公共节点模板').setInputFiles({name:'agent.central-templates.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({templates:[incoming]}))});await page.getByRole('button',{name:'确认合并到编辑区'}).click();
 const merged=JSON.parse(await page.getByRole('group',{name:/^执行模板与探测配置/}).getByRole('textbox').inputValue());assert.equal(merged.templates.length,3);assert.ok(merged.templates.some(t=>t.machineId==='qa-node-a'));assert.deepEqual(merged.probes,configuration.probes);assert.equal(await page.getByLabel('已登记设备ID').inputValue(),'qa-node-b');await page.getByRole('button',{name:'保存执行配置',exact:true}).click();await page.getByText('执行模板已保存。节点仅领取已配对、允许的模板。',{exact:true}).waitFor();assert.equal(writes.length,2);checks.push('public template import merges one machine while preserving other nodes and probes');
 await page.getByLabel('导入公共节点模板').setInputFiles({name:'agent-private.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({templates:[incoming],privateKey:'fixture-not-a-real-key'}))});await page.getByText('请使用准备工具生成的 central-templates.json 公共模板文件',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'确认合并到编辑区'}).count(),0);checks.push('private node configuration rejected before import');
 await page.screenshot({path:output+'/node-import-mobile.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));assert.deepEqual(unexpectedWrites,[]);assert.deepEqual(errors,[]);
 await writeFile(output+'/report.json',JSON.stringify({at:new Date().toISOString(),status:'passed',checks,realConfigurationWrites:0,browserLocalFixtureWrites:writes.length,errors,physicalPhone:false},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,realConfigurationWrites:0,errors}));
}catch(e){const message=String(e.message).replaceAll(cookie??'__none__','[redacted]');if(page)await page.screenshot({path:output+'/failure.png'}).catch(()=>{});await writeFile(output+'/failed-report.json',JSON.stringify({status:'failed',error:message,checks,errors,unexpectedWrites},null,2));console.error(message);process.exitCode=1;}
finally{if(browser)await browser.close();if(cookie)store('s.deleteLogin('+JSON.stringify(cookie)+');');}
