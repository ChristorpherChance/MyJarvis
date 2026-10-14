/**
 * Actual published settings UI, read-only. No saved preferences, speech, or model requests.
 * node scripts/qa-platform-settings-readonly.mjs --execute [--build=20261010-auto-language-r17]
 * Only the smart-routing block and language label are photographed; credentials are excluded.
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {primary,python} from './managed-server-client.mjs';

if(!process.argv.includes('--execute')){
  console.log('Prepared: published smart routing and five reply-language policies. Requires --execute after release; no connection was made.');
  process.exit(0);
}

const expectedBuild=process.argv.find(value=>value.startsWith('--build='))?.slice(8)||'20261010-auto-language-r17';
assert.match(expectedBuild,/^[A-Za-z0-9._-]{1,100}$/);
const origin='https://cc-jarvis.ikvein.com',output=resolve(expectedBuild.includes('auto-language-r17')?'artifacts/auto-language-r17/published-settings':'artifacts/voice-response-r16/published-settings'),screenshots=resolve(output,'screenshots');
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const checks=[],blockedWrites=[],blockedExternal=[];
let browser,cookie='',build,maintenanceLoginRevoked=false,pageErrors=0,stage='initializing',failure;

function ensure(condition,code){if(!condition)throw Object.assign(Error(code),{qaCode:code});}
function store(operation,token){
  const code=`import {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{const operation=${JSON.stringify(operation)};if(operation==='create')process.stdout.write(s.createLogin());else{const token=${JSON.stringify(token)};s.deleteLogin(token);process.stdout.write(JSON.stringify({revoked:!s.validateLogin(token)}));}}finally{s.close();}`;
  return primary(python({code},`import subprocess
r=subprocess.run(['/opt/jarvis/node/bin/node','--input-type=module','-e',p['code']],cwd='/opt/jarvis/current',capture_output=True,text=True)
if r.returncode:raise RuntimeError('MAINTENANCE_SESSION_OPERATION_FAILED')
print(r.stdout)
`));
}

await mkdir(screenshots,{recursive:true});
try{
  stage='maintenance-session';cookie=store('create');ensure(/^[A-Za-z0-9_-]{43}$/.test(cookie),'INVALID_MAINTENANCE_SESSION');
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--no-proxy-server','--disable-quic']});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addCookies([{name:'jarvis_session',value:cookie,domain:'cc-jarvis.ikvein.com',path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  // Hard stop any accidental configuration write, playback, transcription, or inference.
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin){blockedExternal.push({kind:'external-request'});return route.abort();}
    if(!['GET','HEAD'].includes(request.method())){blockedWrites.push({method:request.method(),endpoint:url.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,'[id]')});return route.abort();}
    return route.continue();
  });
  await context.addInitScript(()=>{
    window.__qaMicAttempts=0;
    if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async()=>{window.__qaMicAttempts++;throw new DOMException('Read-only QA','NotAllowedError');};
  });
  const page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',()=>pageErrors++);
  stage='release-health';
  const healthResponse=await context.request.get(origin+'/api/health',{timeout:20000});
  const health=await healthResponse.json();build=typeof health?.build==='string'&&/^[A-Za-z0-9._-]{1,100}$/.test(health.build)?health.build:undefined;
  ensure(healthResponse.ok()&&health?.status==='ok'&&build===expectedBuild,'EXPECTED_BUILD_NOT_ONLINE');
  stage='platform-settings';
  await page.goto(origin+'/?mode=platform&rev=readonly-settings-qa#theme=stark&view=settings',{waitUntil:'domcontentloaded'});
  await page.locator('.view-settings').waitFor({timeout:60000});
  const savedResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/settings/pi'&&response.request().method()==='GET'&&response.status()===200);
  await page.locator('.view-settings').getByRole('button',{name:'模型中心',exact:true}).click();
  const saved=(await (await savedResponse).json())?.routing?.conversation;
  ensure(saved?.enabled===true&&saved?.transition===true&&saved.fast?.model&&saved.advanced?.model,'SAVED_SMART_ROUTING_INCOMPLETE');
  const panel=page.locator('.pi-model-settings');
  await panel.getByRole('button',{name:'智能路由',exact:true}).click();
  stage='smart-routing-values';
  const fast=panel.getByLabel('快速模型模型',{exact:true}),advanced=panel.getByLabel('高级模型模型',{exact:true});
  await fast.waitFor();await advanced.waitFor();
  const selection={
    fastModel:await fast.inputValue(),fastLabel:await fast.locator('option:checked').innerText(),
    advancedModel:await advanced.inputValue(),advancedLabel:await advanced.locator('option:checked').innerText(),
  };
  ensure(selection.fastModel===saved.fast.model&&selection.advancedModel===saved.advanced.model,'UI_SAVED_MODEL_MISMATCH');
  ensure(await panel.getByLabel('快速模型服务',{exact:true}).inputValue()===saved.fast.provider,'UI_SAVED_FAST_PROVIDER_MISMATCH');
  ensure(await panel.getByLabel('高级模型服务',{exact:true}).inputValue()===saved.advanced.provider,'UI_SAVED_ADVANCED_PROVIDER_MISMATCH');
  ensure(/kimi/i.test(selection.fastModel+' '+selection.fastLabel),'FAST_MODEL_IS_NOT_KIMI');
  ensure(/(?:^|\/\s*)gpt-6\.1-sol$/.test(selection.advancedModel),'ADVANCED_MODEL_IS_NOT_GPT_6_1_SOL');
  // Field also contributes its outer label to these controls' accessible names.
  const enabled=panel.getByRole('checkbox',{name:/启用智能路由/});
  const transition=panel.getByRole('checkbox',{name:/高级回答等待时，由快速模型先回应一句/});
  ensure(await enabled.isVisible()&&await enabled.isChecked(),'SMART_ROUTING_NOT_ENABLED');
  ensure(await transition.isVisible()&&await transition.isChecked(),'TRANSITION_NOT_VISIBLE_OR_ENABLED');
  ensure(await panel.getByLabel('开始等待回复（毫秒）',{exact:true}).inputValue()===String(saved.transitionAfterMs),'UI_SAVED_TRANSITION_DELAY_MISMATCH');
  ensure(await panel.getByLabel('等待回复超时（毫秒）',{exact:true}).inputValue()===String(saved.transitionTimeoutMs),'UI_SAVED_TRANSITION_TIMEOUT_MISMATCH');
  ensure(await panel.getByRole('button',{name:'保存智能路由',exact:true}).isDisabled(),'ROUTING_DRAFT_CHANGED');
  const routingBlock=panel.locator('.d-panel-body');
  ensure(await routingBlock.locator('input[type=password]').count()===0,'SCREENSHOT_CONTAINS_CREDENTIAL_FIELD');
  await routingBlock.screenshot({path:resolve(screenshots,'smart-routing-390.png'),style:'.demo-topbar{visibility:hidden!important}'});
  checks.push({name:'saved-smart-routing',status:'passed',...selection,enabled:true,transition:true,valuesMatchSaved:true,screenshot:'screenshots/smart-routing-390.png'});
  stage='voice-language-options';
  await page.evaluate(()=>{location.hash=new URLSearchParams({view:'chat',theme:'stark',board:'all'}).toString();});
  await page.locator('.view-chat').waitFor();
  const language=page.getByRole('combobox',{name:'回复语言',exact:true});
  await language.waitFor();await page.waitForFunction(()=>!document.querySelector('select[aria-label="回复语言"]')?.disabled);
  const expectedLanguages=[{value:'auto',label:'自动跟随输入'},{value:'zh',label:'固定中文'},{value:'en',label:'固定英语 · English'},{value:'fr',label:'固定法语 · Français'},{value:'de',label:'固定德语 · Deutsch'}];
  const values=await language.locator('option').evaluateAll(options=>options.map(option=>({value:option.value,label:option.textContent})));
  ensure(JSON.stringify(values)===JSON.stringify(expectedLanguages),'MAIN_REPLY_LANGUAGE_OPTIONS_MISMATCH');
  const replyResponse=await context.request.get(origin+'/api/runtime/family/reply-language');const reply=await replyResponse.json();
  ensure(replyResponse.ok()&&Number.isInteger(reply.revision)&&expectedLanguages.some(option=>option.value===reply.replyLanguage),'SAVED_REPLY_LANGUAGE_NOT_READABLE');
  ensure(await language.inputValue()===reply.replyLanguage,'UI_SAVED_REPLY_LANGUAGE_MISMATCH');
  ensure(await page.getByRole('combobox',{name:'对话语言',exact:true}).count()===0,'OLD_INPUT_LANGUAGE_CHOICE_EXISTS');
  await page.locator('.room-capture-settings > summary').click();
  ensure(await page.getByRole('combobox',{name:'识别语言',exact:true}).count()===0,'OLD_RECOGNITION_LANGUAGE_CHOICE_EXISTS');
  await page.locator('.room-language-choice').screenshot({path:resolve(screenshots,'reply-languages-390.png')});
  checks.push({name:'five-reply-policies-auto-input',status:'passed',languages:['auto','zh','en','fr','de'],selection:reply.replyLanguage,savedRevision:reply.revision,valuesMatchSaved:true,inputChoice:false,selectionChanged:false,screenshot:'screenshots/reply-languages-390.png'});
  stage='saved-voice-choice';
  const catalogResponse=await context.request.get(origin+'/api/runtime/voice/catalog');const catalog=await catalogResponse.json();
  ensure(catalogResponse.ok()&&typeof catalog.selectedVoiceId==='string','SAVED_VOICE_NOT_READABLE');
  await page.getByRole('button',{name:'人声设置',exact:true}).click();
  const voice=page.getByRole('combobox',{name:'选择我的声音',exact:true});await voice.waitFor();
  ensure(await voice.inputValue()===catalog.selectedVoiceId,'UI_SAVED_VOICE_MISMATCH');
  checks.push({name:'saved-voice-choice',status:'passed',valuesMatchSaved:true,selectionChanged:false});
  stage='member-reply-policy';
  await page.evaluate(()=>{location.hash=new URLSearchParams({view:'personas',theme:'stark',board:'all'}).toString();});
  await page.locator('.fa-personas').waitFor();const memberReply=page.locator('.fa-personas').getByRole('combobox',{name:'回复语言',exact:true});await memberReply.waitFor();
  ensure(await memberReply.inputValue()===reply.replyLanguage,'MEMBER_REPLY_POLICY_MISMATCH');
  ensure(await page.locator('.fa-personas').getByRole('combobox',{name:'交流语言',exact:true}).count()===0,'MEMBER_INPUT_CHOICE_EXISTS');
  ensure(JSON.stringify(await memberReply.locator('option').evaluateAll(options=>options.map(option=>({value:option.value,label:option.textContent}))))===JSON.stringify(expectedLanguages),'MEMBER_REPLY_OPTIONS_MISMATCH');
  await memberReply.locator('..').screenshot({path:resolve(screenshots,'member-reply-390.png')});
  checks.push({name:'member-reply-policy',status:'passed',valuesMatchSaved:true,selection:reply.replyLanguage,selectionChanged:false,screenshot:'screenshots/member-reply-390.png'});
  stage='read-only-verification';
  ensure(await page.evaluate(()=>window.__qaMicAttempts)===0,'MICROPHONE_WAS_REQUESTED');
  ensure(blockedWrites.length===0,'UNEXPECTED_WRITE_ATTEMPTED');
  ensure(pageErrors===0,'CLIENT_PAGE_ERROR');
}catch(error){
  failure={stage,code:/^[A-Z0-9_]{1,100}$/.test(error?.qaCode??'')?error.qaCode:'UI_CHECK_FAILED'};
}finally{
  if(browser)await browser.close().catch(()=>{});
  if(cookie){try{maintenanceLoginRevoked=JSON.parse(store('revoke',cookie)).revoked===true;}catch{maintenanceLoginRevoked=false;}}
}
const passed=!failure&&maintenanceLoginRevoked&&checks.length===4;
const report={at:new Date().toISOString(),status:passed?'passed':'failed',expectedBuild,build,checks,maintenanceLoginRevoked,pageErrors,blockedWrites,blockedExternalRequests:blockedExternal.length,readOnly:true,configurationWrites:0,modelRequests:0,physicalMicrophone:false,credentialScreenshots:false,failure};
await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,expectedBuild,build,checks,maintenanceLoginRevoked,pageErrors,blockedWrites,failure,report:resolve(output,'report.json')}));
if(!passed)process.exitCode=1;
