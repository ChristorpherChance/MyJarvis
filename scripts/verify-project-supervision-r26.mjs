/** Read-only R26 UI verification. Login credentials and raw API bodies stay in memory. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {withPlatform,primary,python} from './managed-server-client.mjs';

const phase=process.argv[2]??'browser';
const options=new Map(process.argv.slice(3).map(value=>{const index=value.indexOf('=');return [value.slice(0,index),value.slice(index+1)];}));
assert.ok(['preflight','live','browser'].includes(phase),'INVALID_PHASE');
assert.ok([...options.keys()].every(key=>['--expected-build','--label','--execution-version'].includes(key)),'INVALID_OPTION');
const expectedBuild=options.get('--expected-build')??'20261011-supervision-r26-3';
const label=options.get('--label')??'final';
assert.match(expectedBuild,/^[A-Za-z0-9._-]{1,100}$/,'INVALID_BUILD');
assert.match(label,/^[A-Za-z0-9_-]{1,40}$/,'INVALID_LABEL');
const project='70ec346f-6520-46ed-abed-22cac770a3e4';
const executionVersion=options.get('--execution-version')??'r26';
const executionCases={
 'r26':{task:'98ee355a-6912-46c1-b551-df4ba7ac6030',run:'e5ca06dfe49f0e3692b90b0fa9f0120ebc58e849'},
 'r26-4':{task:'bf43cd17-453d-428f-81c3-2a0020726a31',run:'f4b26c4c95047ff24f2f5eff7a21ec7d14c579a2'},
 'native-r26':{task:'580888fe-8edc-40a0-b6a3-46124d119870',run:'5c8034046a05b0db89edebbb0e2c6876efb5882f'},
 'repair-r26':{task:'456b2038-a782-4da2-b2d8-d3b291aba8ed',run:'a11ac3a06c0f14e9f85bc897c8a766d41e165f24'}
};
assert.ok(Object.hasOwn(executionCases,executionVersion),'INVALID_EXECUTION_VERSION');
const {task:expectedTask,run:expectedRun}=executionCases[executionVersion];
const origin='https://cc-jarvis.ikvein.com';
const directory='artifacts/software-factory/acceptance-r26';
const stem=`ui-${phase}-${label}-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`;
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const ensure=(condition,code)=>{if(!condition)throw Error(code);};
const responseData=response=>response?.data;
const routes={plan:`/api/v1/projects/${project}/supervision-plans/current`,profile:`/api/v1/projects/${project}/autonomy`,baselines:`/api/v1/projects/${project}/autonomy/baselines`};
const artifact={schemaVersion:1,at:new Date().toISOString(),phase,expectedBuild,project,expectedTask,expectedRun,checks:[],screenshots:[],status:'failed',modelsInvoked:false,tasksDispatched:false,productionChanged:false,productAccepted:false,privateDataPersisted:false};
await mkdir(directory,{recursive:true});

function verifyState({health,plan,profile,baselines},requireBuild=true){
 ensure(health&&typeof health.build==='string','HEALTH_BUILD_UNAVAILABLE');
 if(requireBuild)ensure(health.build===expectedBuild,'EXPECTED_BUILD_NOT_ACTIVE');
 ensure(plan?.projectId===project,'CURRENT_PLAN_PROJECT_MISMATCH');
 ensure(['acceptance','development'].includes(plan.mode),'CURRENT_PLAN_MODE_INVALID');
 ensure(Array.isArray(plan.steps)&&plan.steps.length>0,'CURRENT_PLAN_STEPS_MISSING');
 ensure(plan.steps.some(step=>step.runIds?.includes(expectedRun)&&step.taskIds?.includes(expectedTask)),'R26_EXECUTION_NOT_BOUND_TO_CURRENT_PLAN');
 ensure(plan.independentAcceptance===false,'EXECUTION_IS_NOT_INDEPENDENT_ACCEPTANCE');
 ensure(profile?.projectId===project,'PROFILE_PROJECT_MISMATCH');
 ensure(profile.config?.costPolicy==='record-only','COST_POLICY_MISMATCH');
 ensure(profile.config.maxUSD===null&&profile.config.maxTokens===null&&profile.config.perTaskUSD===null,'UNREQUESTED_SPENDING_LIMIT');
 ensure(Array.isArray(profile.spec?.objectives),'OBJECTIVES_UNAVAILABLE');
 const requiredIds=new Set(profile.spec.objectives.filter(objective=>objective.required!==false).map(objective=>objective.id));
 ensure(Array.isArray(profile.verifiedObjectiveIds),'INDEPENDENT_GOAL_EVIDENCE_UNAVAILABLE');
 const accepted=new Set(profile.verifiedObjectiveIds.filter(id=>requiredIds.has(id))).size;
 if(plan.independentProgress?.available){
  ensure(plan.independentProgress.totalObjectives===requiredIds.size,'PLAN_OBJECTIVE_TOTAL_MISMATCH');
  ensure(plan.independentProgress.verifiedObjectives===accepted,'PLAN_OBJECTIVE_ACCEPTANCE_MISMATCH');
 }
 const activeStep=plan.steps.find(step=>step.activeRunIds?.length);
 const activeRun=activeStep?.runs?.find(run=>['queued','running'].includes(run.status));
 if(activeRun)ensure(activeStep.activeRunIds.includes(activeRun.runId),'ACTIVE_RUN_BINDING_MISMATCH');
 const latest=plan.latestResult??null;
 if(latest)ensure(plan.steps.some(step=>step.runIds?.includes(latest.runId)),'LATEST_RESULT_NOT_BOUND');
 return {build:health.build,plan,profile,baselines,accepted,required:requiredIds.size,activeStep,activeRun,latest};
}

function resultLabel(result){
 if(!result)return '本轮执行结果待报告';
 if(['running','queued'].includes(result.status))return '本轮执行中，等待结果';
 if(result.stopRequested||result.lateEvidenceOnly||['cancelled','interrupted','stopped'].includes(result.status))return result.lateEvidenceOnly?'本轮已停止，晚到结果仅留作记录':'本轮执行已停止';
 const fixed=fixedProjection(result),required=fixed?result.fixedReport.checks.filter(check=>check.required):[];
 const reportFailed=!!fixed&&(result.fixedReport.status==='fail'||fixed.checks.failed>0||required.length===0||required.some(check=>!check.executed||check.status!=='pass'||check.exitCode!==0||!!check.tests&&(check.tests.failed>0||check.tests.skipped>0||check.tests.unknown>0)));
 if(reportFailed||['failed','timeout','error','round-limit'].includes(result.status)||['failed','timeout','round-limit'].includes(result.outcome)||typeof result.exitCode==='number'&&result.exitCode!==0||typeof result.validationExitCode==='number'&&result.validationExitCode!==0)return '本轮执行未成功结束';
 if(result.status==='succeeded'&&result.outcome==='success'&&result.source==='signed-agent'&&result.exitCode===0)return result.validationExitCode===0&&fixed?'本轮固定验证执行成功':'本轮执行已结束，独立验证待报告';
 return '本轮结果待核对';
}

function publicState(state){
 const latest=state.latest;
 return {build:state.build,planId:state.plan.planId,planRevision:state.plan.revision,mode:state.plan.mode,planSHA256:digest(state.plan),profileSHA256:digest(state.profile),baselineSHA256:digest(state.baselines),requiredObjectives:state.required,independentlyAcceptedObjectives:state.accepted,currentStepId:state.plan.currentStepId,activeTaskId:state.activeRun?.taskId??null,activeRunId:state.activeRun?.runId??null,latest:latest?{taskId:latest.taskId??null,runId:latest.runId,status:latest.status,outcome:latest.outcome??null,source:latest.source??null,exitCode:latest.exitCode??null,validationExitCode:latest.validationExitCode??null,lateEvidenceOnly:!!latest.lateEvidenceOnly,stopRequested:!!latest.stopRequested,summarySHA256:latest.summary?digest(latest.summary):null,fixedReport:fixedProjection(latest)}:null,expectedResultLabel:resultLabel(latest),oldNarrowResultUsedAsCurrent:false,independentAcceptance:false};
}

function fixedProjection(result){
 const report=result?.fixedReport;
 if(!report||result.source!=='signed-agent'||result.lateEvidenceOnly||result.stopRequested||!['succeeded','failed','timeout','error','round-limit'].includes(result.status))return null;
 ensure(report.kind==='project-autonomy-validation'&&report.independentAcceptance===false,'FIXED_REPORT_PROVENANCE_INVALID');
 ensure(/^[a-f0-9]{64}$/i.test(report.reportSha256)&&/^[a-f0-9]{64}$/i.test(report.sourceFingerprint),'FIXED_REPORT_FINGERPRINT_INVALID');
 ensure(Array.isArray(report.checks)&&report.checks.length>0&&new Set(report.checks.map(check=>check.id)).size===report.checks.length,'FIXED_REPORT_CHECK_IDS_INVALID');
 const checks={total:report.checks.length,executed:0,passed:0,failed:0,skipped:0,unknown:0},testGroups=[];
 for(const check of report.checks){
  ensure(['pass','fail','skip','unknown'].includes(check.status),'FIXED_CHECK_STATUS_INVALID');
  if(check.executed)checks.executed++;
  if(!check.executed||check.status==='unknown')checks.unknown++;
  else if(check.status==='pass')checks.passed++;
  else if(check.status==='fail')checks.failed++;
  else checks.skipped++;
  if(check.executed&&check.tests){
   const counts=check.tests;
   ensure(Object.values(counts).length===5&&Object.values(counts).every(value=>Number.isSafeInteger(value)&&value>=0)&&counts.total>0&&counts.total===counts.passed+counts.failed+counts.skipped+counts.unknown,'FIXED_TEST_COUNT_INVALID');
   testGroups.push({checkId:check.id,tests:{...counts}});
  }
 }
 return {reportSha256:report.reportSha256,sourceFingerprint:report.sourceFingerprint,checks,testGroups,crossGroupTotalCombined:false,independentAcceptance:false};
}

async function verifyFixedCounts(panel,result){
 const fixed=fixedProjection(result),checksLine=panel.locator('.project-report-fixed-checks'),testsLines=panel.locator('.project-report-fixed-tests');
 if(!fixed){ensure(await checksLine.count()===0&&await testsLines.count()===0,'UNTRUSTED_FIXED_COUNTS_SHOWN');return;}
 ensure(await checksLine.count()===1,'CURRENT_FIXED_CHECK_OVERVIEW_MISSING');
 const checkText=`检查 · 共 ${fixed.checks.total} 项，已执行 ${fixed.checks.executed}；通过 ${fixed.checks.passed} / 失败 ${fixed.checks.failed} / 跳过 ${fixed.checks.skipped} / 待验 ${fixed.checks.unknown}`;
 ensure((await checksLine.innerText()).replace(/\s/g,'')===checkText.replace(/\s/g,''),'FIXED_CHECK_OVERVIEW_MISMATCH');
 ensure(await testsLines.count()===fixed.testGroups.length,'FIXED_TEST_GROUP_COUNT_MISMATCH');
 for(const [index,group] of fixed.testGroups.entries()){
  const line=testsLines.nth(index),counts=group.tests;
  ensure(await line.getAttribute('data-check-id')===group.checkId,'FIXED_TEST_GROUP_ID_MISMATCH');
  const expected=`测试组 · ${group.checkId}：共 ${counts.total}，通过 ${counts.passed} / 失败 ${counts.failed} / 跳过 ${counts.skipped} / 待核验 ${counts.unknown}`;
  ensure((await line.innerText()).replace(/\s/g,'')===expected.replace(/\s/g,''),'FIXED_TEST_GROUP_COUNTS_MISMATCH');
 }
 if(fixed.testGroups.length>1)ensure((await panel.innerText()).includes('各测试组可能重叠，分别计数。'),'FIXED_TEST_GROUP_OVERLAP_NOT_EXPLAINED');
}

async function apiSnapshot(requireBuild=true){
 return withPlatform(async({api})=>{
  const [health,plan,profile,baselines]=await Promise.all([api('/api/health'),api(routes.plan),api(routes.profile),api(routes.baselines)]);
  return verifyState({health,plan:responseData(plan),profile:responseData(profile),baselines:responseData(baselines)},requireBuild);
 });
}

const storeCode=code=>python({code},String.raw`import subprocess
r=subprocess.run(['/opt/jarvis/node/bin/node','--input-type=module','-e',p['code']],cwd='/opt/jarvis/current',capture_output=True,text=True,check=True)
print(r.stdout)
`);
const reportUrl=`${origin}/?mode=platform&rev=${encodeURIComponent(expectedBuild)}#theme=stark&view=tasks%2Fproject%2F${project}&board=all`;
const panelOn=page=>page.locator('.project-autonomy > .d-panel').filter({has:page.getByRole('heading',{name:'项目汇报',exact:true})});
const isApiResponse=(response,path)=>new URL(response.url()).pathname===path&&response.request().method()==='GET';

async function refreshAndVerify(page,health){
 const panel=panelOn(page);
 await panel.waitFor({timeout:45000});
 await panel.getByRole('button',{name:'刷新',exact:true}).waitFor({timeout:45000});
 let lastFailure;
 // A run may finish while the page is open. Compare with this refresh's responses, not an old snapshot.
 for(let attempt=0;attempt<3;attempt++){
  try{
   const incoming=Promise.all(Object.values(routes).map(path=>page.waitForResponse(response=>isApiResponse(response,path),{timeout:30000})));
   const [responses]=await Promise.all([incoming,panel.getByRole('button',{name:'刷新',exact:true}).click({timeout:30000})]);
   ensure(responses.every(response=>response.ok()),'REPORT_API_READ_FAILED');
   const [plan,profile,baselines]=await Promise.all(responses.map(response=>response.json()));
   const state=verifyState({health,plan:responseData(plan),profile:responseData(profile),baselines:responseData(baselines)});
   await panel.getByText(resultLabel(state.latest),{exact:true}).waitFor({timeout:10000});
   ensure(await panel.locator('.project-report-block').count()===4,'REPORT_CARD_COUNT_MISMATCH');
   ensure((await panel.locator('.project-report-plan h4').innerText()).replace(/\s+/g,' ').trim()===`01 ${state.plan.title}`,'PLAN_TITLE_MISMATCH');
   const stepTitles=await panel.locator('.project-report-plan li strong').allTextContents();
   ensure(JSON.stringify(stepTitles)===JSON.stringify(state.plan.steps.map(step=>step.title)),'PLAN_STEPS_MISMATCH');
   const counter=panel.locator('.project-report-count');
   ensure((await counter.locator('strong').innerText()).trim()===String(state.accepted),'ACCEPTED_GOAL_COUNT_MISMATCH');
   ensure((await counter.innerText()).replace(/\s/g,'').includes(`/ ${state.required} 项目标验收`.replace(/\s/g,'')),'REQUIRED_GOAL_COUNT_MISMATCH');
   ensure((await panel.locator('.project-report-foot').innerText()).includes('检查结果与产品验收分别记录'),'ACCEPTANCE_BOUNDARY_NOT_SHOWN');
   const body=await panel.innerText();
   ensure(!body.includes('最近主线限定检查执行成功')&&!body.includes('15/15'),'OLD_NARROW_RESULT_SHOWN_AS_CURRENT');
   ensure(!body.includes('状态暂不可读')&&!body.includes('上次结果，仅供参考'),'CURRENT_REPORT_IS_STALE');
   await verifyFixedCounts(panel,state.latest);
   if(state.plan.nextAction?.trim())ensure((await panel.locator('.project-report-block').nth(3).locator('strong.project-report-result').innerText())===state.plan.nextAction.trim(),'NEXT_ACTION_MISMATCH');
   if(state.activeRun){
    ensure((await panel.locator('.project-report-heading').innerText()).includes('项目有任务在执行'),'ACTIVE_RUN_NOT_SHOWN');
    ensure((await panel.locator('.project-report-stage').innerText()).includes(state.activeStep.title),'ACTIVE_STEP_NOT_SHOWN');
   }
   return state;
  }catch(error){lastFailure=error;}
 }
 throw lastFailure??Error('REPORT_VERIFICATION_FAILED');
}

async function layoutAndFolds(page,viewport){
 const layout=await page.evaluate(()=>{
  const grid=document.querySelector('.project-report-grid');
  const summaries=['计划记录','检查详情','验收目标','旧开发监督记录','任务详情与管理'];
  return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,reportHeight:grid.getBoundingClientRect().height,details:summaries.map(title=>{const summary=[...document.querySelectorAll('summary')].find(node=>node.textContent?.includes(title));return {kind:title,present:!!summary,closed:summary?summary.parentElement.open===false:null};})};
 });
 ensure(layout.width===viewport.width&&layout.height===viewport.height,'VIEWPORT_MISMATCH');
 ensure(layout.scrollWidth<=layout.width+1,'HORIZONTAL_OVERFLOW');
 ensure(layout.columns===(viewport.width<600?1:2),'RESPONSIVE_CARD_COLUMNS_MISMATCH');
 ensure(layout.details.every(detail=>detail.present&&detail.closed),'DETAILS_NOT_COLLAPSED_BY_DEFAULT');
 return layout;
}

async function screenshotReport(page,name){
 const panel=panelOn(page);
 const text=await panel.innerText();
 // Preserve only the public summary panel; execution prose is additionally covered in the image.
 const secretPatterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bsk-[A-Za-z0-9_-]{16,}/,/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,/(?:api[_ -]?key|access[_ -]?token|authorization|password|密码|cookie)\s*[:=]\s*(?!\*|\[redacted\]|已隐藏|待填写)\S{6,}/i,/https?:\/\/[^\s/@]+:[^\s/@]+@/i];
 ensure(!secretPatterns.some(pattern=>pattern.test(text)),'SCREENSHOT_PRIVATE_CONTENT_DETECTED');
 ensure(await panel.locator('input[type="password"]').count()===0,'SCREENSHOT_PASSWORD_INPUT_DETECTED');
 const filename=`${stem}-${name}.png`;
 await panel.screenshot({path:`${directory}/${filename}`,animations:'disabled',mask:[panel.locator('.project-report-block').nth(2).locator('p').filter({hasText:'执行摘要：'}),panel.locator('.project-report-work')],maskColor:'#26303d'});
 return {file:filename,scope:'project-report-panel',executionProseMasked:true,taskLogsExcluded:true,credentialsExcluded:true};
}

async function navigationCheck(page,state,buttonName,taskId){
 const button=panelOn(page).getByRole('button',{name:buttonName,exact:true});
 if(!taskId){ensure(await button.count()===0,'TASK_NAVIGATION_WITHOUT_CURRENT_ID');return {button:buttonName,available:false};}
 await button.click();
 await page.getByRole('dialog').waitFor({timeout:30000});
 const fragment=decodeURIComponent(new URL(page.url()).hash);
 ensure(fragment.includes(`view=tasks/${taskId}`),'TASK_NAVIGATION_ID_MISMATCH');
 return {button:buttonName,available:true,taskId,planRevision:state.plan.revision,correctTaskOpened:true,taskLogsCaptured:false};
}

let browser,cookie;
try{
 const initial=await apiSnapshot(phase!=='preflight');
 artifact.initial=publicState(initial);
 artifact.checks.push({kind:'current-plan-api',passed:true});
 if(phase==='browser'){
  const req=createRequire('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
  const {chromium}=req('playwright');
  cookie=primary(storeCode("import {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{process.stdout.write(s.createLogin());}finally{s.close();}"));
  ensure(/^[A-Za-z0-9_-]{43}$/.test(cookie),'MAINTENANCE_SESSION_INVALID');
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true});
  await context.addCookies([{name:'jarvis_session',value:cookie,url:origin+'/',httpOnly:true,secure:true}]);
  const pageErrors=[];
  const attachErrorCheck=page=>page.on('pageerror',error=>pageErrors.push(digest(error.message)));
  // This verifier never submits a task, plan edit, command, voice request or other application mutation.
  await context.route('**/*',route=>['POST','PUT','PATCH','DELETE'].includes(route.request().method())?route.abort():route.continue());
  const page=await context.newPage();attachErrorCheck(page);
  await page.goto(reportUrl,{waitUntil:'domcontentloaded',timeout:45000});
  const desktop=await refreshAndVerify(page,{build:initial.build});
  artifact.checks.push({kind:'desktop-current-result',passed:true,state:publicState(desktop),layout:await layoutAndFolds(page,{width:1440,height:1000})});
  artifact.screenshots.push(await screenshotReport(page,'desktop'));
  artifact.checks.push({kind:'latest-result-navigation',...await navigationCheck(page,desktop,'查看本次结果',desktop.latest?.taskId)});
  if(desktop.activeRun?.taskId){
   await page.goto(reportUrl,{waitUntil:'domcontentloaded',timeout:45000});
   const activeState=await refreshAndVerify(page,{build:initial.build});
   if(activeState.activeRun?.taskId)artifact.checks.push({kind:'active-task-navigation',...await navigationCheck(page,activeState,'查看执行任务',activeState.activeRun.taskId)});
   else artifact.checks.push({kind:'active-task-navigation',available:false,reason:'Execution became terminal before navigation; latest result navigation verified separately.'});
  }
  await page.goto(reportUrl,{waitUntil:'domcontentloaded',timeout:45000});
  await refreshAndVerify(page,{build:initial.build});
  const summary=page.locator('summary').filter({hasText:'任务详情与管理'});
  await summary.click();ensure(await summary.evaluate(element=>element.parentElement.open),'DETAILS_CANNOT_EXPAND');
  await summary.click();ensure(await summary.evaluate(element=>!element.parentElement.open),'DETAILS_CANNOT_COLLAPSE');
  artifact.checks.push({kind:'details-toggle',passed:true,mutationSubmitted:false});
  const mobile=await context.newPage();attachErrorCheck(mobile);await mobile.setViewportSize({width:390,height:844});
  await mobile.goto(reportUrl,{waitUntil:'domcontentloaded',timeout:45000});
  const mobileState=await refreshAndVerify(mobile,{build:initial.build});
  artifact.checks.push({kind:'mobile-current-result',passed:true,state:publicState(mobileState),layout:await layoutAndFolds(mobile,{width:390,height:844})});
  artifact.screenshots.push(await screenshotReport(mobile,'mobile'));
  artifact.pageErrors={count:pageErrors.length,messageSHA256:pageErrors};
  ensure(pageErrors.length===0,'BROWSER_PAGE_ERROR');
  const final=await apiSnapshot();artifact.final=publicState(final);
  artifact.realPublicWebsite=true;
 }
 artifact.status='passed';
}catch(error){
 const message=error?.message??'UNKNOWN_VERIFICATION_ERROR';
 artifact.failure={code:/^[A-Z][A-Z0-9_]+$/.test(message)?message:'VERIFICATION_FAILED',messageSHA256:digest(message)};
 process.exitCode=1;
}finally{
 try{if(browser)await browser.close();}
 catch(error){artifact.status='failed';artifact.browserClose={code:'BROWSER_CLOSE_FAILED',messageSHA256:digest(error?.message??'unknown')};process.exitCode=1;}
 finally{
  if(cookie){
   try{primary(storeCode("import {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{s.deleteLogin("+JSON.stringify(cookie)+");}finally{s.close();}"));artifact.browserLoginRevoked=true;}
   catch(error){artifact.status='failed';artifact.browserLoginRevoked=false;artifact.revoke={code:'MAINTENANCE_SESSION_REVOCATION_FAILED',messageSHA256:digest(error?.message??'unknown')};process.exitCode=1;}
   cookie=undefined;
  }
 }
 artifact.completedAt=new Date().toISOString();
 await writeFile(`${directory}/${stem}.json`,JSON.stringify(artifact,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({phase,status:artifact.status,qa:`${directory}/${stem}.json`,screenshots:artifact.screenshots.map(image=>image.file),failureCode:artifact.failure?.code??null,browserLoginRevoked:artifact.browserLoginRevoked??null,modelsInvoked:false,tasksDispatched:false,productAccepted:false}));
}
