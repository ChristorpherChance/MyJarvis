import {createHash} from 'node:crypto';
import {redactExecutionLog} from './execution-runtime.js';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp=(value:any):string|null=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;
const safe=(value:any,max=2000)=>redactExecutionLog(typeof value==='string'?value:'').replace(/\u001b\[[0-9;]*[A-Za-z]/g,'').replace(/(?:密码|密钥|令牌|口令)\s*[:：=]\s*\S+/g,'[已脱敏]').slice(0,max);
const brief=(value:string)=>value.replace(/\s+/g,' ').trim().slice(0,180);
const terminal=new Set(['succeeded','failed','timeout','round-limit','budget-exhausted','awaiting-cost','blocked','cancelled']);
export function boundTaskRun(task:any,run:any){return !!task&&!!run&&task.executionRequest?.id===run.id&&run.domain==='tasks'&&run.taskId===task.id&&run.projectId===task.projectId&&run.machineId===task.machineId&&run.workspace===task.worktree&&(run.ownerId===undefined||run.ownerId===task.ownerId)&&(run.scope===undefined||run.scope===task.scope)&&(run.executorId===undefined||run.executorId===task.agent)&&(!run.sessionId||!task.sessionId||run.sessionId===task.sessionId)&&(!run.result?.sessionId||!task.sessionId||run.result.sessionId===task.sessionId);}
/** A task's registered queued state is not an actual execution lease. */
export function taskActivity(task:any,run:any){
 const bound=boundTaskRun(task,run),runStatus=bound?run.status:null;
 const activityState=bound&&run.stopRequested?'attention':bound&&['queued','running'].includes(runStatus)?'active':bound&&['failed','timeout','round-limit','budget-exhausted','awaiting-cost','blocked','cancelled'].includes(runStatus)?'attention':bound&&terminal.has(runStatus)?'ended':['blocked','failed','paused','waitingUser'].includes(task.status)?'attention':['completed','cancelled'].includes(task.status)?'ended':'planned';
 const activityLabel=bound&&run.stopRequested?'停止已请求，等待节点确认':bound&&runStatus==='running'?'执行中（已领取）':bound&&runStatus==='queued'?'已派发，排队待领取':activityState==='attention'?'有问题待处理':bound&&runStatus==='succeeded'?'已回传，验收另列':activityState==='ended'?'登记已结束，验收另列':'待安排（暂无绑定运行）';
 return {bindingVerified:bound,activityState,activityLabel,updatedAt:stamp(bound?run.updatedAt:task.updatedAt)};
}

export interface WorkbenchActivityItem {id:string;role:'jarvis'|'executor'|'owner';status:'requested'|'running'|'reported'|'judged'|'blocked';at:string|null;summary:string;detail:string;sourceRef:{kind:'supervisor-event'|'execution-log';runId:string|null;eventId?:string;eventHash?:string;resultHash?:string;logId?:number};}
/** A private owner readmodel of already-redacted logs, not a public transcript or completion proof. */
function processItems(log:any,runId:string):WorkbenchActivityItem[]{
 if(!Number.isSafeInteger(Number(log?.id))||Number(log.id)<1||typeof log.text!=='string')return [];
 const id=Number(log.id),text=log.text.slice(0,16000),at=stamp(log.at),sourceRef={kind:'execution-log' as const,runId,logId:id};
 const item=(suffix:string,summary:string,detail:string,status:WorkbenchActivityItem['status']='running'):WorkbenchActivityItem=>({id:`log:${runId}:${id}:${suffix}`,role:'executor',status,at,summary:brief(safe(summary,1000)),detail:safe(detail),sourceRef});
 let value:any;try{value=JSON.parse(text);}catch{
  // Truncated or redacted JSON is not reinterpreted as an assistant message.
  if(/^[\s]*[\[{"']/.test(text)||/^\s*(?:thinking|analysis|reasoning|user|human|prompt|思考|推理|用户|系统提示)\s*[:：]/i.test(text)||log.channel==='stdout')return [];
  const detail=safe(text);return detail.trim()?[item('output',detail,detail,log.channel==='stderr'?'blocked':'running')]:[];
 }
 if(!value||typeof value!=='object'||Array.isArray(value))return [];
 if(value.type==='assistant'){
  const content=value.message?.content;if(!Array.isArray(content))return [];
  return content.flatMap((part:any,index:number)=>{
   if(part?.type==='text'&&typeof part.text==='string'&&part.text.trim())return [item('text-'+index,part.text,part.text)];
   if(part?.type==='tool_use'){
    const name=typeof part.name==='string'&&/^[A-Za-z0-9_.:-]{1,80}$/.test(part.name)?part.name:'工具';
    const description=safe(part.input?.description,500);
    return [item('tool-'+index,`使用${name}${description?'：'+description:''}`,`工具：${name}${description?'\n说明：'+description:''}\n工具参数、命令、环境及文件正文保留在已有受保护日志中，不投影。`)];
   }
   return []; // Never expose thinking, signatures or native user/prompt/tool-input envelopes.
  });
 }
 if(value.type==='user'&&Array.isArray(value.message?.content))return value.message.content.flatMap((part:any,index:number)=>part?.type==='tool_result'?[item('tool-result-'+index,part.is_error?'工具回报错误':'工具已回报，继续处理中','这是实际工具结果事件；不把工具输出或退出码当本轮验收。',part.is_error?'blocked':'running')]:[]);
 if(['item.started','item.completed','item.updated'].includes(value.type)){
  const entry=value.item??{};
  if(entry.type==='agent_message'&&typeof entry.text==='string')return [item('message',entry.text,entry.text)];
  if(entry.type==='command_execution')return [item('command',value.type==='item.started'?'正在执行命令':Number.isInteger(entry.exit_code)?`命令已返回，退出码${entry.exit_code}`:'命令执行事件已收到','实际命令事件；不投影命令参数或环境，执行回报不等于验收。',entry.exit_code!==undefined&&entry.exit_code!==0?'blocked':'running')];
  if(entry.type==='mcp_tool_call')return [item('tool','正在使用已登记工具','实际工具事件；不投影arguments/result。')];
 }
 if(value.type==='system'&&value.subtype==='init')return [item('init','CC会话已初始化','节点已回传初始化事件；不代表任务已完成。')];
 if(value.type==='result')return [item('result',value.is_error?'CC已回报执行异常':'CC已回传，等待签名结果与主管判断','节点过程日志中的终态事件；正式结果与判断以绑定签名回执为准。',value.is_error?'blocked':'reported')];
 return [];
}

export function deriveCurrentActivity(projectId:string,ownerId:string,snapshot:any,task:any,readRun:(id:string)=>any,readRecentLogs:(id:string)=>any[]){
 const s=snapshot.session;if(!s)return null;
 const owned=!!task&&s.ownerId===ownerId&&s.projectId===projectId&&task.ownerId===ownerId&&task.projectId===projectId&&task.id===s.taskId&&task.scope===s.scope&&task.machineId===s.machineId&&task.worktree===s.workspace;
 const runs=new Map<string,any>();
 const run=(id:string)=>{if(!runs.has(id)){const r=readRun(id);runs.set(id,owned&&r&&r.domain==='tasks'&&r.taskId===s.taskId&&r.projectId===projectId&&r.machineId===s.machineId&&r.workspace===s.workspace&&r.executorId===task.agent&&r.scope===s.scope&&r.supervisor?.sessionId===s.id&&r.supervisor?.goalRevision===s.goalRevision&&(r.ownerId===undefined||r.ownerId===ownerId)?r:null);}return runs.get(id);};
 const current=s.runId?run(s.runId):null,bound=!!current&&boundTaskRun(task,current);
 const events=(snapshot.events??[]).filter((e:any)=>owned&&e.taskId===s.taskId&&e.goalRevision===s.goalRevision&&e.machineId===s.machineId).sort((a:any,b:any)=>b.sequence-a.sequence);
 const messages:WorkbenchActivityItem[]=[];
 for(const e of events){
  const r=e.runId?run(e.runId):null,source=r?.result?.source==='signed-agent'&&!r.result.lateEvidenceOnly&&terminal.has(r.status)&&e.resultHash===hash(r.result);
  let role:WorkbenchActivityItem['role']='jarvis',status:WorkbenchActivityItem['status']='requested',text='';
  if(e.kind==='instruction'&&r&&e.dispatchedRunId===r.id)text=String(e.directive??'');
  else if(['decision','review'].includes(e.kind)&&source){status='judged';text=String(e.decision?.reason??'')+(e.decision?.directive?'\n下一步：'+e.decision.directive:'');}
  else if(e.kind==='feedback'&&source){role='executor';status='reported';text=String(e.feedback?.summary??'');}
  else if(e.kind==='command'&&['reply','start','resume','revise'].includes(e.action)){role='owner';text=String(e.directive??(e.action==='revise'?'本人已修订目标与标准':'本人已明确继续本目标'));}
  else if(e.kind==='correction'){role='owner';text='本人事实更正：'+String(e.correctedFact??e.reason??'');}
  else if(e.kind==='blocked'&&(!e.runId||r)){status='blocked';text=String(e.reason??'当前监管处理受阻');}
  else continue;
  const detail=safe(text);if(!detail.trim())continue;
  messages.push({id:'event:'+e.eventId,role,status,at:stamp(e.at),summary:brief(detail),detail,sourceRef:{kind:'supervisor-event',runId:e.runId??null,eventId:e.eventId,eventHash:e.hash,...(source?{resultHash:e.resultHash}:{})}});
  if(messages.length>=4)break;
 }
 let logs:any[]=[],logsAvailable=false;
 if(bound){try{const value=readRecentLogs(current.id);if(Array.isArray(value)){logs=value.slice(-80);logsAvailable=true;}}catch{/* Unavailable private process logs never change status or trigger recovery. */}}
 const process=logs.flatMap(row=>processItems(row,current.id)).slice(-8).map(item=>terminal.has(current.status)&&item.status==='running'?{...item,status:'reported' as const}:item);
 const items=[...messages,...process].sort((a,b)=>Date.parse(a.at??'')-Date.parse(b.at??'')||a.id.localeCompare(b.id)).slice(-12);
 let phaseId='planned',label='尚未开始，等待明确安排',status='planned';
 if(!owned||s.runId&&!bound){phaseId='unbound';label='当前执行绑定待核对';status='attention';}
 else if(['paused','stopped','human_control'].includes(s.status)||current?.stopRequested){phaseId=s.status==='paused'?'paused':'stopped';label=current?.stopRequested?'停止已请求，等待节点确认':s.status==='human_control'?'本人已接管':s.status==='paused'?'已暂停':'已停止';status='attention';}
 else if(bound&&current.status==='queued'){phaseId='queued';label='已派发，等待执行器领取';status='active';}
 else if(bound&&current.status==='running'){phaseId='running';label='CC正在执行';status='active';}
 else if(s.status==='dispatching'){phaseId='queued';label='主管正在派发，尚未领取';status='active';}
 else if(s.status==='judging'){phaseId='judging';label='CC已回传，贾维斯正在判断';status='active';}
 else if(['blocked','review_required'].includes(s.status)){phaseId='blocked';label='有问题待处理';status='attention';}
 else if(s.status==='waiting_user'){phaseId='waiting_user';label='本轮等待回应，具体原因见主管判断';status='attention';}
 else if(s.status==='achieved'){
  const review=events.find((e:any)=>e.kind==='review'&&e.decision?.action==='review'&&e.decisionId===s.decisionId&&e.runId===s.consumedRunId&&e.runId===s.runId&&e.resultHash===s.resultHash&&current?.result?.source==='signed-agent'&&!current.result.lateEvidenceOnly&&current.result.outcome==='success'&&e.resultHash===hash(current.result));
  phaseId=review?'achieved':'unbound';label=review?'本轮主管判定达标，独立验收另列':'已登记达标，当前来源待核对';status=review?'ended':'attention';
 }
 const dates=[stamp(current?.updatedAt),stamp(current?.createdAt),...logs.map(x=>stamp(x.at)),...items.map(x=>x.at)].filter((v):v is string=>!!v).sort((a,b)=>Date.parse(b)-Date.parse(a));
 const cursors=logs.map(x=>Number(x.id)).filter(n=>Number.isSafeInteger(n)&&n>0);
 return {bindingVerified:owned&&(!s.runId||bound),runId:bound?current.id:null,taskId:s.taskId,phase:{id:phaseId,label,status},updatedAt:dates[0]??null,items,progress:{kind:'stage',percent:null},logCursor:cursors.length?Math.max(...cursors):null,logsAvailable,executionEventsURL:bound&&['queued','running'].includes(current.status)?`/api/v1/execution/runs/${encodeURIComponent(current.id)}/events`:null,emptyProcessNote:phaseId==='running'&&!process.length?'已领取，暂无可显示的新过程回报':null,ownerOnly:true,privacy:'owner-redacted-process-summary',processEvidence:'accepted-node-log-not-terminal-acceptance',independentAcceptance:false};
}
