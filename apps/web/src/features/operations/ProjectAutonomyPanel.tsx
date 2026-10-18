import {useEffect,useRef,useState} from 'react';
import type {V1Capabilities,V1Envelope} from '../../v1-client';
import {Button,Empty,Note,Panel,Tag,type Props} from './common';
import {usePrivateRuntime} from './usePrivateRuntime';
import ProjectBaselinePanel from './ProjectBaselinePanel';
import ProjectReportPanel from './ProjectReportPanel';
import ProjectSupervisionWorkPanel from './ProjectSupervisionWorkPanel';
import type {ProjectReportFixedReport} from './project-report-view';
import {baselineSnapshot,hasBaseline,type BaselineList,type BaselineSnapshot} from './project-baseline-view';
import {autonomyControls,currentAutonomyStage,stageDisplayStatus,stageExecution,stoppedExecutionText,type AutonomyRunView} from './project-autonomy-view';
import './ProjectAutonomyPanel.css';

type Objective={id:string;title:string;required?:boolean;workPackage:string;acceptance:string[]};
type WorkPackage={id:string;title:string;objectiveIds?:string[];dependsOn?:string[]};
type Criterion={objectiveId:string;outcome:string;reason?:string;evidenceRefs?:string[]};
type Decision={outcome:string;reason?:string[];reasons?:string[];evidenceHash?:string;review?:{criteria?:Criterion[]}};
type Stage={id:string;status:string;attempt:number;taskId?:string;reviewTaskId?:string;runId?:string;reviewRunId?:string;validationTaskId?:string;validationRunId?:string;checkpoint?:{repeated:number};waiting?:{waiting:{id:string;reasonCode:string;actualObservedSeconds?:number;requiredSeconds?:number}[]};nextProbeAt?:string;decision?:Decision;problem?:string};
type AutonomyEvent={seq:number;at:string;kind:string;data:Record<string,unknown>;hash:string};
interface Autonomy {
 projectId:string;revision:number;status:string;reason:string|null;goalSpecHash:string;
 spec:{version:string;objectives:Objective[];workPackages:WorkPackage[]};
 config:{costPolicy?:'limited'|'record-only';maxUSD:number|null;maxTokens:number|null;perTaskUSD:number|null;maxAttempts:number;maxRepeated?:number;workspace:string;machineId:string};
 stages:Stage[];verifiedObjectiveIds?:string[];
 budget:{spentUSD:number|null;usedTokens:number|null;unknownCostCount:number};
 events:AutonomyEvent[];createdAt:string;updatedAt:string;
}
type Command='start'|'pause'|'cancel';
type PlanRunView={runId:string;taskId?:string;status:string;source?:string|null;outcome?:string|null;exitCode?:number|null;validationExitCode?:number|null;lateEvidenceOnly?:boolean;stopRequested?:boolean;summary?:string|null;fixedReport?:ProjectReportFixedReport|null};
type SupervisionPlanView={projectId:string;planId:string;revision:number;goalBasis?:'legacy-autonomy'|'plan';supersedesPlanId?:string|null;supersedesRevision?:number|null;mode:'development'|'acceptance';title:string;goal:string;currentStepId:string|null;nextAction:string|null;latestResult:PlanRunView|null;independentProgress?:{available:boolean;totalObjectives:number|null;verifiedObjectiveIds:string[]|null}|null;steps:{id:string;title:string;goal:string;state:string;nextAction:string|null;activeRunIds:string[];runs:PlanRunView[];latestResult:PlanRunView|null}[]};
const planStepLabel=(value:string)=>({'running':'执行中','queued':'等待执行','execution-finished':'执行结束，待独立验收','needs-attention':'有问题待处理','awaiting-execution':'等待执行','planned':'待安排','stopped':'已停止','unavailable':'绑定暂不可读'}[value]??'待核对');
const guide='/api/v1/project-autonomy/guide';
const statuses:Record<string,string>={ready:'待启动',configured:'待启动',draft:'待启动',running:'监督中',active:'监督中',paused:'已暂停',blocked:'已阻塞',waitingBudget:'等待预算',waitingQuota:'等待预算',completed:'监督已结束',cancelled:'已停止',stopped:'已停止','waiting-prerequisite':'等待真实条件','validating-prerequisite':'固定复验中',pending:'待执行',queued:'待执行',worker:'开发修复中',executing:'执行中',validating:'独立验证中',reviewing:'独立评阅中',passed:'独立验证通过',failed:'未通过',waitingUser:'等待输入',waitingResource:'等待节点'};
const eventLabels:Record<string,string>={'worker-recovery-planned':'已安排新任务续做',configured:'配置已登记',start:'启动监督',pause:'暂停监督',cancel:'停止监督',started:'启动监督',paused:'暂停监督',cancelled:'停止监督',blocked:'出现阻塞',completed:'监督结束','task-intent':'准备执行任务','dispatch-intent':'准备派发任务',dispatched:'任务已派发','verification-failed':'验证未通过','repair-planned':'安排实质修复','waiting-resource':'等待执行资源','waiting-prerequisite':'等待真实运行条件','stage-verified':'工作包独立验证通过','objectives-completed':'全部目标验收结束','stage.started':'启动工作包','stage.passed':'工作包通过','stage.failed':'工作包未通过','stage.task-created':'创建执行任务','stage.review-created':'创建独立评阅','task-created':'创建执行任务','review-created':'创建独立评阅','stage-passed':'工作包通过','stage-failed':'工作包未通过'};
const label=(value:string)=>statuses[value]??value;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const number=(value:unknown)=>finite(value)?value.toLocaleString('zh-CN'):'未报告';
const dollars=(value:unknown,digits=2)=>finite(value)?`USD ${value.toFixed(digits)}`:'未知';
const time=(value:string)=>{const date=new Date(value);return Number.isNaN(date.valueOf())?'时间未报告':date.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});};
const hashValid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const stageVerified=(stage:Stage,objectiveIds:string[])=>{
 const criteria=stage.decision?.review?.criteria??[];
 return stage.status==='passed'&&stage.decision?.outcome==='pass'&&hashValid(stage.decision.evidenceHash)&&objectiveIds.length>0&&criteria.length===objectiveIds.length&&new Set(criteria.map(c=>c.objectiveId)).size===criteria.length&&objectiveIds.every(id=>criteria.some(c=>c.objectiveId===id&&c.outcome==='pass'&&!!c.evidenceRefs?.length));
};
const reasonLabels:Record<string,string>={EXECUTION_NEEDS_RECONCILIATION:'任务已中断，需要核对回执和已有产物后创建新任务',CURRENT_SOURCE_NOT_OBSERVED:'尚未取得当前源码指纹',CURRENT_SOURCE_CHANGED:'源码已变化，需要重新验证',VALIDATION_MISSING:'等待固定验证报告',REVIEW_MISSING:'等待独立评阅报告',COST_UNKNOWN:'费用尚未确定，暂不继续收费执行',TOKENS_UNKNOWN:'Token用量尚未确定',USD_BOUNDARY:'累计费用已到配置边界',TOKEN_BOUNDARY:'累计Token已到配置边界',RUN_NOT_SUCCESSFUL:'执行未成功结束',RUN_REVOKED_OR_LATE:'执行已撤销或回执过期',REPORT_HASH_MISMATCH:'验证报告指纹不一致',REPORT_NOT_FRESH:'验证报告已过期',CHECK_NOT_EXECUTED_OR_UNKNOWN:'存在未执行或未确定的检查',TEST_COVERAGE_INCOMPLETE:'必需测试尚未全部执行',FIXED_VALIDATION_FAILED:'固定验证未通过',REVIEW_NOT_INDEPENDENT:'评阅尚未满足独立性要求',OBJECTIVE_COVERAGE_INCOMPLETE:'目标验收条款未全部覆盖',REVIEW_EVIDENCE_UNBOUND:'评阅依据未绑定实际验证证据',REVIEW_COVERAGE_UNKNOWN:'仍有跳过或未确定的目标',INDEPENDENT_REVIEW_FAILED:'独立评阅未通过',REPEATED_SOURCE_AND_PROBLEMS:'源码和问题持续未变化，已停止空转'};
const reasonText=(value:string)=>reasonLabels[value]??value;
Object.assign(reasonLabels,{REPAIR_ATTEMPTS_EXHAUSTED:'工作包已达到尝试上限，需要诊断后建立新的有界执行计划',DEPENDENCIES_NOT_READY:'前置工作包尚未通过',FIXED_REPORT_MISSING_OR_INVALID:'固定验证报告缺失或格式无效',FIXED_REPORT_BINDING_CHANGED:'固定验证报告与本次执行身份不一致',EXECUTION_RECEIPT_MISSING:'执行回执缺失，需要核对任务',TRUSTED_FIXED_RETRY_EXECUTOR_MISSING:'固定复验执行器尚未配置',PROCESS_TIMEOUT:'执行超过本次时限',HEARTBEAT_FAILED:'开发节点通信中断'});
const plainReason=(value:string)=>reasonLabels[value]??(/^[A-Z][A-Z0-9_]+(?::|$)/.test(value)?'监督条件尚未满足，需要核对具体原因。':value);
const text=(value:unknown)=>typeof value==='string'?value:Array.isArray(value)?value.filter(x=>typeof x==='string').join('；'):'';
const errorMessage=(error:unknown)=>{const failure=error as {status?:number;code?:string;message?:string},message=failure?.message??'';if(failure?.code==='AUTONOMY_RETRY'||['VERSION_CONFLICT','STALE_VERSION'].includes(failure?.code??'')||failure?.status===409&&/监督状态已(?:更新|变化)|版本冲突|修订.*(?:变化|不一致)/.test(message))return '监督状态已变化，请刷新后再操作。';if(failure?.status===401)return '登录已失效，请重新登录。';if(failure?.status===403)return '当前账号无法管理项目监督。';if(failure?.code==='RESOURCE_UNAVAILABLE')return '执行节点暂未就绪，请检查节点后再启动。';return message||'监督状态暂不可读，请稍后刷新。';};
const receiptKey=(profile:Autonomy)=>`${profile.projectId}:${profile.revision}:${stageExecution(currentAutonomyStage(profile.stages)).runId??''}`;

export default function ProjectAutonomyPanel({projectId,navigate,machines=[]}:{projectId:string;navigate:Props['navigate'];machines?:Props['data']['machines']}) {
 const [state,setState]=useState<Autonomy|null>(null),[administrator,setAdministrator]=useState<boolean|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState<Command|null>(null),[error,setError]=useState(''),[commandError,setCommandError]=useState(''),[notice,setNotice]=useState(''),[reason,setReason]=useState('');
 const [latestReceipt,setLatestReceipt]=useState<{key:string;run:AutonomyRunView|null;error:string}|null>(null);
 const [baselines,setBaselines]=useState<BaselineSnapshot|null>(null),[baselineError,setBaselineError]=useState('');
 const [readAt,setReadAt]=useState<string|null>(null);
 const [planState,setPlanState]=useState<SupervisionPlanView|null>(null),[planError,setPlanError]=useState('');
 const flight=useRef(0),commandRunning=useRef<number|null>(null),mounted=useRef(false);
 const api=usePrivateRuntime(()=>{flight.current++;commandRunning.current=null;setState(null);setLatestReceipt(null);setBaselines(null);setBaselineError('');setPlanState(null);setPlanError('');setAdministrator(false);setLoading(false);setBusy(null);setError('');setCommandError('');setNotice('');setReason('');});
 const base=`/api/v1/projects/${encodeURIComponent(projectId)}/autonomy`;
 async function load(checkIdentity=false,manual=false) {
  if(!mounted.current||commandRunning.current!==null)return;
  const own=++flight.current;if(manual){setLoading(true);setLatestReceipt(null);}
  try {
   if(checkIdentity||administrator===null){const caps=await api<V1Envelope<V1Capabilities>>('/api/v1/capabilities');if(own!==flight.current)return;const allowed=['administrator','admin'].includes(caps.data.identity.role);setAdministrator(allowed);if(!allowed){setState(null);setBaselines(null);setBaselineError('');return;}}
   else if(!administrator)return;
   const [profileResult,baselineResult,planResult]=await Promise.allSettled([api<{data:Autonomy|null}>(base),api<{data:BaselineList}>(base+'/baselines'),api<{data:SupervisionPlanView|null}>(`/api/v1/projects/${encodeURIComponent(projectId)}/supervision-plans/current`)]);
   if(own!==flight.current)return;
   if(planResult.status==='fulfilled'){
    if(planResult.value.data&&planResult.value.data.projectId!==projectId)throw new Error('监管计划与当前项目不匹配。');
    setPlanState(planResult.value.data);setPlanError('');setReadAt(new Date().toISOString());
   }else if((planResult.reason as {status?:number}).status===404){setPlanState(null);setPlanError('');}
   else if((planResult.reason as Error).name!=='AbortError')setPlanError('监管计划暂不可读；需刷新确认当前执行。');
   if(baselineResult.status==='fulfilled'){
    try{setBaselines(baselineSnapshot(projectId,baselineResult.value.data));setReadAt(new Date().toISOString());setBaselineError('');}catch(e){setBaselines(null);setReadAt(null);setBaselineError((e as Error).message);}
   }else if((baselineResult.reason as {status?:number}).status===404){setBaselines(null);setBaselineError('');}
   else if((baselineResult.reason as Error).name!=='AbortError')setBaselineError('现有成果验收暂不可读；上次读取的检查状态需刷新确认。');
   // The independent planning ledger remains readable when the old autonomy
   // runtime is unavailable. One source failure must not erase another's facts.
   if(profileResult.status==='rejected'){setState(null);setLatestReceipt(null);setError(errorMessage(profileResult.reason));return;}
   const response=profileResult.value;
   if(response.data&&response.data.projectId!==projectId)throw new Error('返回的项目不匹配，请刷新重试。');
   const profile=response.data;setState(profile);setLatestReceipt(null);setError('');if(manual)setCommandError('');
   if(profile){
    const execution=stageExecution(currentAutonomyStage(profile.stages)),key=receiptKey(profile);
    if(execution.runId){
     try{const latest=await api<{data:AutonomyRunView}>(`/api/v1/execution/runs/${encodeURIComponent(execution.runId)}`);if(own!==flight.current)return;if(latest.data?.id!==execution.runId||latest.data.projectId!==projectId||execution.taskId&&latest.data.taskId!==execution.taskId)throw new Error('执行回执与当前项目任务不匹配。');setLatestReceipt({key,run:latest.data,error:''});}
     catch(e){if(own===flight.current&&(e as Error).name!=='AbortError')setLatestReceipt({key,run:null,error:'最新执行回执暂不可读，当前停因仍以监督记录为准。'});}
    }else setLatestReceipt({key,run:null,error:''});
   }
  }catch(e){if(own===flight.current&&(e as Error).name!=='AbortError')setError(errorMessage(e));}
  finally{if(own===flight.current)setLoading(false);}
 }
 const loader=useRef(load);loader.current=load;
 useEffect(()=>{mounted.current=true;flight.current++;commandRunning.current=null;setState(null);setLatestReceipt(null);setBaselines(null);setBaselineError('');setPlanState(null);setPlanError('');setAdministrator(null);setLoading(true);setBusy(null);setError('');setCommandError('');setNotice('');setReason('');void loader.current(true);const timer=setInterval(()=>{if(document.visibilityState==='visible')void loader.current();},15000);return()=>{mounted.current=false;clearInterval(timer);flight.current++;};},[projectId]);
 async function command(action:Command) {
  if(!state||state.projectId!==projectId||hasBaseline(baselines,projectId)||administrator!==true||commandRunning.current!==null||loading||error||commandError||action==='start'&&!canStart||action==='pause'&&!canPause||action==='cancel'&&!canCancel)return;
  const own=++flight.current;commandRunning.current=own;setBusy(action);setError('');setCommandError('');setNotice('');
  const descriptions:Record<Command,string>={start:'管理员从项目详情启动已有自治监督配置',pause:'管理员从项目详情暂停自治监督',cancel:'管理员从项目详情停止自治监督'};
  try {
   const response=await api<{data:Autonomy|null}>(`${base}/${action}`,'POST',{expectedVersion:state.revision,commandId:crypto.randomUUID(),reason:reason.trim()||descriptions[action]});
   if(own===flight.current){if(response.data&&response.data.projectId===projectId)setState(response.data);setNotice(action==='start'?'已提交启动监督。':action==='pause'?'已提交暂停监督。':'已提交停止监督。');setReason('');}
  }catch(e){if(own===flight.current&&(e as Error).name!=='AbortError')setCommandError(errorMessage(e));}
  finally{if(commandRunning.current===own)commandRunning.current=null;if(own===flight.current){setBusy(null);if(mounted.current)void loader.current();}}
 }
 if(administrator===false)return null;
 if(state&&state.projectId!==projectId||planState&&planState.projectId!==projectId)return <section className="project-autonomy"><Panel title="自治监督"><p className="project-autonomy-caption" role="status">正在读取项目监督…</p></Panel></section>;
 const required=state?.spec.objectives.filter(o=>o.required!==false)??[];
 // Only the server's independently validated identities count; stage or model progress does not.
 const known=new Set(required.map(o=>o.id)),verified=state?.verifiedObjectiveIds&&required.length>0?new Set(state.verifiedObjectiveIds.filter(id=>known.has(id))):null;
 const stageList=state?.stages??[],packages=state?.spec.workPackages??[];
 const packageGoalIds=(packageId:string)=>packages.find(p=>p.id===packageId)?.objectiveIds??required.filter(o=>o.workPackage===packageId).map(o=>o.id);
 const current=currentAutonomyStage(stageList) as Stage|undefined,execution=stageExecution(current);
 const currentPackage=packages.find(p=>p.id===current?.id);
 const events=[...(state?.events??[])].sort((a,b)=>b.seq-a.seq).slice(0,15);
 const receipt=state&&latestReceipt?.key===receiptKey(state)?latestReceipt:null,run=receipt?.run??null;
 const controls=state?autonomyControls(state,run,!!receipt&&!receipt.error):null;
 const terminal=controls?.terminal??false,operating=busy!==null||loading||!!error||!!commandError;
 const canStart=!!controls?.canStart&&!operating,canPause=!!controls?.canPause&&!operating,canCancel=!!controls?.canCancel&&!operating;
 const stopped=!!state&&['blocked','paused','cancelled','stopped'].includes(state.status);
 const stopDetail=current?.status==='waiting-prerequisite'?'':stoppedExecutionText(run);
 const headline=state?.status==='blocked'?'监督已停下，当前条件未满足':state?.status==='paused'?'监督已暂停':terminal?'这份监督计划已结束':controls?.active?'按验收要求监督中':'监督尚未启动';
 const why=controls?.reason==='attempts'?`当前工作包已尝试 ${number(current?.attempt)} / ${number(state?.config.maxAttempts)} 次，达到保护上限。`:controls?.reason==='reconciliation'?'旧任务已经暂停或结束，需要先核对已有成果与费用。':controls?.reason==='stalled'?'源码和问题持续未变化，已触发停止空转的保护。':state?.reason?plainReason(state.reason):controls?.active?'只有固定验证和独立评阅通过，才会计入验收。':terminal?'目标与已有记录保留，可继续查看验收证据。':'目标与执行配置已登记，启动后按工作包逐项验证。';
 const needsPlan=['attempts','reconciliation','stalled'].includes(controls?.reason??'');
 const next=needsPlan?'核对已有成果，拆小任务后安排续做。':state?.status==='blocked'?'先处理上述条件，再核对可用执行计划。':state?.status==='paused'?'确认执行条件后再启动。':terminal?'核对剩余目标和交付证据，安排后续工作。':controls?.active?current?.status==='waiting-prerequisite'?'等待真实条件满足，按计划做固定复验。':'继续当前阶段的实际执行、固定验证和独立评阅。':'确认执行条件后，点击启动监督。';
 const userAction=needsPlan?'暂不能直接继续；可查看任务与处理记录。':state?.status==='blocked'?'可查看最新任务和决策记录，了解待处理条件。':state?.status==='paused'?'需要确认后启动。':terminal?'当前计划无需操作；产品是否交付以验收证据为准。':controls?.active?'无需操作；监督按当前计划进行。':'需要启动监督。';
 const machine=machines.find(m=>m.id===state?.config.machineId)?.name??state?.config.machineId;
 const acceptanceFirst=!!planState||hasBaseline(baselines,projectId),budget=acceptanceFirst&&baselines?.latest?baselines.latest.projectBudget:state?.budget;
 const reportSnapshot=baselines&&!(planState&&baselineError)?baselines:{projectId,latest:null,main:null,total:0};
 const ownGoals=planState?.goalBasis==='plan'&&!!planState.supersedesPlanId;
 const reportRequired=ownGoals?0:required.length||(planState?.independentProgress?.available?planState.independentProgress.totalObjectives??0:0);
 const reportVerified=ownGoals?null:verified?[...verified]:planState?.independentProgress?.available?planState.independentProgress.verifiedObjectiveIds:null;
 const reportStale=planState?!!planError:!!error||!!baselineError||!!planError;
 const reportMode=planState?.mode??(hasBaseline(baselines,projectId)?'acceptance':'development');
 const planCurrent=planState?.steps.find(s=>s.id===planState.currentStepId);
 const activePlanStep=planState?.steps.find(s=>s.activeRunIds.length);
 const activePlanRun=activePlanStep?.runs.find(r=>['running','queued'].includes(r.status));
 const reportWork=planState?{status:activePlanRun?.status??(planCurrent?.state==='needs-attention'?'blocked':planCurrent?.state??'planned'),active:!!activePlanRun,stageTitle:activePlanStep?.title??planCurrent?.title,taskId:activePlanRun?.taskId,summary:planCurrent?.nextAction??undefined,nextAction:planState.nextAction??undefined,result:planState.latestResult?{...planState.latestResult,outcome:planState.latestResult.outcome??undefined,summary:planState.latestResult.summary??undefined,signed:planState.latestResult.source==='signed-agent'}:null}:undefined;
 const spentPercent=state&&finite(budget?.spentUSD)&&finite(state.config.maxUSD)&&state.config.maxUSD>0?Math.min(100,budget?.spentUSD/state.config.maxUSD*100):null;
 const tokenPercent=state&&finite(budget?.usedTokens)&&finite(state.config.maxTokens)&&state.config.maxTokens>0?Math.min(100,budget?.usedTokens/state.config.maxTokens*100):null;
 const oldOverview=state&&<div className={`project-autonomy-overview ${stopped?'is-stopped':''}`}>
     <h4>{headline}</h4><p>{why}{stopDetail&&<> {stopDetail}</>}</p>
     {state.status==='blocked'&&<p className="project-autonomy-caption">“阻塞”表示继续执行的条件未满足，监督已停止派发；已有目标与证据仍保留。</p>}
     <dl className="project-autonomy-guidance"><div><dt>当前阶段</dt><dd>{currentPackage?.title??(terminal?'计划结束':'等待就绪任务')}{stopped&&current&&<small>已停在此阶段</small>}</dd></div><div><dt>独立验收</dt><dd><strong>{verified?`${verified.size} / ${required.length}`:'待报告'}</strong><small>按必需目标的独立证据计数</small></dd></div><div><dt>下一步</dt><dd>{next}</dd></div><div><dt>是否需要操作</dt><dd>{userAction}</dd></div></dl>
     {receipt?.error&&<p className="project-autonomy-caption" role="status">{receipt.error}</p>}
     <div className="project-autonomy-actions">{execution.taskId&&<Button onClick={()=>navigate('tasks/'+encodeURIComponent(execution.taskId!))}>查看最新任务</Button>}<Button kind="ghost" onClick={()=>navigate('projects/'+encodeURIComponent(projectId)+'?tab=decisions')}>决策记录</Button></div>
    </div>;
 const oldControls=state&&<div className="project-autonomy-controls"><div className="project-autonomy-actions">{controls?.canStart&&<Button disabled={!canStart} onClick={()=>void command('start')}>{busy==='start'?'提交中…':controls.startLabel}</Button>}{controls?.canPause&&<Button kind="ghost" disabled={!canPause} onClick={()=>void command('pause')}>{busy==='pause'?'提交中…':'暂停监督'}</Button>}{!terminal&&<Button kind="danger" disabled={!canCancel} onClick={()=>void command('cancel')}>{busy==='cancel'?'提交中…':'结束监督计划'}</Button>}</div>{!terminal&&<small>结束会停止当前计划并保留记录；这份计划结束后不能再次启动。</small>}<details className="project-autonomy-operation-note"><summary>添加操作说明（选填）</summary><label><span className="sr-only">操作说明</span><input aria-label="操作说明（选填）" value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} disabled={busy!==null||terminal} placeholder="记录本次安排的原因"/></label></details></div>;
 const technicalDetails=state&&<details className="project-autonomy-definition"><summary>技术详情与执行配置</summary><dl><dt>当前工作包</dt><dd>{current?.id??'未安排'}</dd><dt>节点</dt><dd>{machine||'未登记'}</dd><dt>尝试边界</dt><dd>{number(current?.attempt)} / {number(state.config.maxAttempts)}</dd><dt>目标版本</dt><dd>{state.spec.version}</dd><dt>更新</dt><dd>{time(state.updatedAt)}</dd><dt>工作副本</dt><dd>{state.config.workspace||'未登记'}</dd><dt>目标指纹</dt><dd>{state.goalSpecHash||'未报告'}</dd><dt>配置修订</dt><dd>{state.revision}</dd>{state.reason&&<><dt>停因原码</dt><dd>{state.reason}</dd></>}{execution.taskId&&<><dt>当前任务</dt><dd>{execution.taskId}</dd></>}{execution.runId&&<><dt>当前执行</dt><dd>{execution.runId}</dd></>}{run?.result?.stopReason?.code&&<><dt>执行停止码</dt><dd>{run.result.stopReason.code}</dd></>}{current?.problem&&<><dt>原始问题</dt><dd>{current.problem}</dd></>}</dl><p className="project-autonomy-caption">{state.config.costPolicy==='record-only'?'费用与Token按工厂、客户产品、Agent能力分别统计；缺失用量标为待补，不视为零。':'客户产品与能力实验分别配置额度。'}任务结束不等于验收通过。</p></details>;
 const workPackages=state&&<Panel title="工作包与验收" actions={<span className="project-autonomy-caption">{stageList.filter(s=>stageVerified(s,packageGoalIds(s.id))).length} / {packages.length} 包独立验证通过</span>}>
   <div className="project-autonomy-stages">{packages.map((pack,index)=>{
    const stage=stageList.find(s=>s.id===pack.id),passed=!!stage&&stageVerified(stage,packageGoalIds(pack.id)),members=required.filter(o=>o.workPackage===pack.id),count=verified?members.filter(o=>verified.has(o.id)).length:null;
    const problem=stage?.problem||'',reasons=stage?.decision?.reasons??stage?.decision?.reason??[],criteria=stage?.decision?.review?.criteria??[];
    const dependenciesReady=(pack.dependsOn??[]).every(id=>{const dependency=stageList.find(s=>s.id===id);return !!dependency&&stageVerified(dependency,packageGoalIds(id));});
    const displayStatus=stageDisplayStatus(state.status,stage?.status??'pending',passed,dependenciesReady)??(pack.id===current?.id&&stopped?state.status==='paused'?'已暂停':'已停在此阶段':stage?label(stage.status):'待安排');
    return <article className={`project-autonomy-stage ${passed?'is-verified':''} ${pack.id===current?.id?'is-current':''}`} key={pack.id}>
     <header><div><small>工作包 {index+1}</small><h4>{pack.title}</h4></div><Tag tone={passed?'complete':pack.id===current?.id&&state.status==='blocked'||stage?.status==='failed'||stage?.status==='blocked'?'failed':''}>{displayStatus}</Tag></header>
     <div className="project-autonomy-stage-meta"><span>目标验证：{count===null?'待报告':`${count} / ${members.length}`}</span><span>尝试：{stage?number(stage.attempt):'未开始'}</span></div>
     {stage?.status==='waiting-prerequisite'&&controls?.active&&<p className="project-autonomy-caption">等待{stage.waiting?.waiting.length??0}项真实条件，期间不调用修复模型。{stage.nextProbeAt&&'下次固定复验：'+time(stage.nextProbeAt)}</p>}
     <div className="project-autonomy-actions">{stage?.taskId&&<Button kind="ghost" onClick={()=>navigate('tasks/'+encodeURIComponent(stage.taskId!))}>查看执行任务</Button>}{stage?.validationTaskId&&<Button kind="ghost" onClick={()=>navigate('tasks/'+encodeURIComponent(stage.validationTaskId!))}>查看固定复验</Button>}{stage?.reviewTaskId&&<Button kind="ghost" onClick={()=>navigate('tasks/'+encodeURIComponent(stage.reviewTaskId!))}>查看独立评阅</Button>}</div>
     {(reasons.length>0||criteria.length>0||stage?.decision?.evidenceHash)&&<details><summary>证据与判定{stage?.decision?` · ${stage.decision.outcome==='pass'?'通过':stage.decision.outcome==='fail'?'未通过':'待核验'}`:''}</summary>{reasons.map((r,i)=><p key={i}>{reasonText(r)}</p>)}{hashValid(stage?.decision?.evidenceHash)&&<p className="project-autonomy-evidence">证据摘要：{stage.decision.evidenceHash}</p>}{criteria.length>0&&<ul className="project-autonomy-criteria">{criteria.map((c,i)=><li key={`${c.objectiveId}-${i}`}><strong>{c.objectiveId} · {c.outcome==='pass'?'通过':c.outcome==='fail'?'未通过':c.outcome==='skip'?'跳过':'未确定'}</strong>{c.reason&&<span>{reasonText(c.reason)}</span>}{c.evidenceRefs?.map((r,j)=><small key={j}>{r}</small>)}</li>)}</ul>}</details>}
     <details><summary>必需目标 · {members.length} 项</summary><ul className="project-autonomy-objectives">{members.map(o=><li key={o.id}><strong>{verified?.has(o.id)?'✓ 已验证':'待验'} · {o.id} · {o.title}</strong>{o.acceptance.map((a,i)=><span key={i}>{a}</span>)}</li>)}</ul></details>
     <details><summary>工作包技术记录</summary><p>工作包：{pack.id} · 原始状态：{stage?.status??'未安排'}</p>{problem&&<p>{reasonText(problem)}</p>}{stage?.taskId&&<p>开发任务：{stage.taskId}</p>}{stage?.runId&&<p>开发执行：{stage.runId}</p>}{stage?.reviewRunId&&<p>评阅执行：{stage.reviewRunId}</p>}{stage?.validationRunId&&<p>固定复验：{stage.validationRunId}</p>}</details>
    </article>;
   })}</div>{!packages.length&&<Empty title="尚未登记工作包" detail="目标配置没有工作包，不能推算完成率。"/>}
  </Panel>;
 const recentEvents=state&&<details className="project-autonomy-history"><summary>最近事件与记录</summary><Panel title="最近事件" actions={<span className="project-autonomy-caption">最多 15 条 · 时间倒序</span>}>
   {events.length?<ol className="project-autonomy-events">{events.map(event=><li key={`${event.seq}-${event.hash}`}><time dateTime={event.at}>{time(event.at)}</time><div><strong>{event.kind==='task-created'&&event.data.review===true?'创建独立评阅任务':eventLabels[event.kind]??event.kind}</strong>{text(event.data.reason||event.data.problem||event.data.workPackage||event.data.stageId)&&<p>{reasonText(text(event.data.reason||event.data.problem||event.data.workPackage||event.data.stageId))}</p>}<small>记录 {event.seq} · {event.hash?.slice(0,12)||'指纹未报告'}</small></div></li>)}</ol>:<Empty title="暂无监督事件" detail="开始执行后会保留真实安排、异常及验收记录。"/>}
  </Panel></details>;
 return <section className="project-autonomy" aria-label="项目自治监督">
  {administrator===true&&<ProjectSupervisionWorkPanel key={projectId} projectId={projectId} navigate={navigate}/>}
  {baselineError&&<Note tone="warn">{baselineError}</Note>}
  {planError&&<Note tone="warn">{planError}</Note>}
  <ProjectReportPanel snapshot={reportSnapshot} navigate={navigate} mode={reportMode} factory={reportSnapshot.main?.workspace==='/home/superopen/All-Projects/msf'} plan={planState?{title:planState.title,intro:planState.goal,steps:planState.steps.map(s=>({title:s.title,detail:s.goal}))}:undefined} work={reportWork} acceptancePending={ownGoals} required={reportRequired} verifiedIds={reportVerified} stale={reportStale} readAt={readAt} refresh={()=>void load(administrator===null,true)} loading={loading||busy!==null}/>
  {planState&&<section aria-label="当前目标与阶段"><h3>当前计划：{planState.title}</h3><p>{planState.goal}</p>{ownGoals&&<p>使用本计划自身目标；原自治目标已被替代，仅保留历史。独立验收：待验证（尚无新目标证据映射）。</p>}<p>当前阶段：{planCurrent?.title??'尚未指定'} · {planCurrent?planStepLabel(planCurrent.state):'待安排'}</p><ol>{planState.steps.map(step=><li key={step.id}><strong>{step.title}</strong> · {planStepLabel(step.state)}<p>{step.goal}</p>{step.nextAction&&<p>下一步：{step.nextAction}</p>}</li>)}</ol></section>}
  {planState&&<details className="project-autonomy-history"><summary>计划记录 · {planState.revision} 次修订</summary><p>{planState.mode==='acceptance'?'测试验收':'持续开发'} · 每次安排保留版本，执行结束后仍须独立验收。</p>{planState.steps.map(step=><p key={step.id}><strong>{step.title}</strong> · {planStepLabel(step.state)}{step.latestResult?.fixedReport&&` · 检查 ${step.latestResult.fixedReport.checks.filter(c=>c.executed&&c.status==='pass').length} 通过 / ${step.latestResult.fixedReport.checks.filter(c=>c.status==='fail').length} 失败 / ${step.latestResult.fixedReport.checks.filter(c=>!c.executed||c.status==='unknown').length} 待验`}</p>)}</details>}
  {acceptanceFirst&&baselines&&<details className="project-autonomy-history"><summary>检查详情 · 主线与历史候选</summary><ProjectBaselinePanel snapshot={baselines} navigate={navigate}/></details>}
  <details className={acceptanceFirst?'project-autonomy-history':'project-autonomy-unfolded'} open={acceptanceFirst?undefined:true}><summary hidden={!acceptanceFirst}>验收目标 · 费用与用量</summary>
  <Panel title={acceptanceFirst?"独立验收与费用":"自治监督"} actions={<div className="project-autonomy-actions"><a href={guide} target="_blank" rel="noreferrer">交付总纲 ↗</a><Button kind="ghost" disabled={busy!==null||loading} onClick={()=>void load(administrator===null,true)}>刷新</Button>{state&&!acceptanceFirst&&<Tag tone={state.status==='blocked'?'failed':''}>{label(state.status)}</Tag>}</div>}>
   {(error||commandError)&&<p className="project-autonomy-error" role="alert">{commandError||error}</p>}{notice&&<p className="project-autonomy-caption" role="status">{notice}</p>}
   {!state?<>{loading?<p className="project-autonomy-caption" role="status">正在读取项目监督…</p>:!error&&<Empty title="尚未配置专项监督" detail="登记目标、执行环境和费用策略后，可在这里启动、暂停或停止。这里不使用模拟进度。"/>}</>:<>
    {!acceptanceFirst&&oldOverview}
    {acceptanceFirst&&<dl className="project-autonomy-guidance"><div><dt>必需目标独立验收</dt><dd><strong>{ownGoals?'待验证':verified?`${verified.size} / ${required.length}`:'待报告'}</strong><small>{ownGoals?'新目标尚无独立验收证据映射，不借用旧目标分母':'按必需目标的独立证据计数，固定检查不改写此计数'}</small></dd></div><div><dt>当前安排</dt><dd>核验现有成果，再按证实缺陷分批修复<small>当前任务可在上方直接查看</small></dd></div></dl>}
    <div className="project-autonomy-summary">
     <div><span>{acceptanceFirst?(baselines?.latest?'项目累计已知费用':'旧监督累计已知费用'):'累计已知费用'}</span><strong>{dollars(budget?.spentUSD,4)}</strong><small>{state.config.costPolicy==='record-only'?'费用只记录，不设上限':'上限 '+dollars(state.config.maxUSD)}</small>{spentPercent!==null&&<div className="project-autonomy-budget-bar" role="meter" aria-label="累计费用预算使用" aria-valuemin={0} aria-valuemax={state.config.maxUSD??undefined} aria-valuenow={budget?.spentUSD!}><i style={{width:`${spentPercent}%`}}/></div>}</div>
     <div><span>{acceptanceFirst&&!baselines?.latest?'旧监督累计 Token':'累计 Token'}</span><strong>{number(budget?.usedTokens)}</strong><small>{state.config.costPolicy==='record-only'?'持续统计，不设消费额度':'上限 '+number(state.config.maxTokens)}</small>{tokenPercent!==null&&<div className="project-autonomy-budget-bar" role="meter" aria-label="累计Token预算使用" aria-valuemin={0} aria-valuemax={state.config.maxTokens??undefined} aria-valuenow={budget?.usedTokens!}><i style={{width:`${tokenPercent}%`}}/></div>}</div>
    </div>
    {(budget?.unknownCostCount??0)>0&&<Note tone="warn">{number((budget?.unknownCostCount??0))} 笔费用尚未确定，未按零计算。</Note>}
    {!ownGoals&&state.status==='completed'&&(!verified||verified.size<required.length)&&<Note tone="warn">监督已结束，仍有目标未取得当前独立验收记录，不能据此宣布产品交付完成。</Note>}
    {!acceptanceFirst&&oldControls}
    {!acceptanceFirst&&technicalDetails}
   </>}
  </Panel>
  </details>
  {acceptanceFirst?<details className="project-autonomy-history project-autonomy-old-development"><summary>{ownGoals?'已被替代 · 旧目标与开发监督历史':'旧开发监督记录'} · {label(state?.status??'unknown')}</summary>{oldOverview}{technicalDetails}{workPackages}{recentEvents}</details>:<>{workPackages}{recentEvents}</>}
 </section>;
}
