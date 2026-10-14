import {useEffect,useRef,useState} from 'react';
import type {V1Capabilities,V1Envelope} from '../../v1-client';
import {Button,Empty,Note,Panel,Tag,type Props} from './common';
import {usePrivateRuntime} from './usePrivateRuntime';
import './ProjectDecisionPanel.css';

type Reference={reference:string;sha256:string|null;kind:string};
type Option={id:string;title:string;advantages:string[];disadvantages:string[];impact:string;compliesWithGoals:string;withinAuthority:string;environmentEvidence:string;missingEvidence:string[];reversibility:string;coveredObjectives:string[];operationalImpact:number};
type Context={observedAt:string;goalSpecHash:string|null;sourceFingerprint:string|null;sourceVersion:string|null;runId:string|null;taskId:string|null;machineId:string|null;objectives:string[];constraints:string[];situation:string};
type Decision={id:string;projectId:string;revision:number;createdAt:string;updatedAt:string;questionSummary:string;context:Context;options:Option[];chosenId:string|null;decisionRationale:string;basisRefs:Reference[];risk:string;affectedObjectives:string[];rollbackPlan:{plan:string;triggers:string[];impact:string;requiresNewExecutionPlan:true};actions:{summary:string;at:string;state:string;evidenceRefs:Reference[]}[];status:string;origin:string;changeOf:string|null;supersededBy:string|null;hash:string;previousHash:string;revisionReason:string;selfReported:boolean;independentAcceptance:false;recommendation:{chosenId:string|null;status:string;rationale:string;candidates:{id:string;eligible:boolean;reasons:string[]}[]};revisions?:Decision[]};
type Collection={items:Decision[];total:number;offset:number;limit:number;nextOffset:number|null};
const statusLabels:Record<string,string>={proposed:'待选方案',selected:'已选待执行',implemented:'已记实施',superseded:'已有新决定'};
const reversible:Record<string,string>={reversible:'可逆',bounded:'限定恢复',irreversible:'不可逆',unknown:'待核对'};
const reasonLabels:Record<string,string>={CONFLICTS_WITH_FROZEN_GOALS:'不符合目标',GOAL_COMPLIANCE_UNKNOWN:'目标依据待补',OUTSIDE_AUTHORITY:'超出授权',AUTHORITY_UNKNOWN:'授权范围待核对',ENVIRONMENT_EVIDENCE_MISSING:'环境依据待补',REVERSIBILITY_UNKNOWN:'回退条件待核对',REQUIRED_OBJECTIVE_NOT_COVERED:'目标覆盖不完整'};
const date=(value:string)=>new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const empty:Collection={items:[],total:0,offset:0,limit:10,nextOffset:null};

export default function ProjectDecisionPanel({projectId,navigate}:{projectId:string;navigate?:Props['navigate']}){
 const [list,setList]=useState<Collection>(empty),[detail,setDetail]=useState<Decision|null>(null),[administrator,setAdministrator]=useState<boolean|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[chosen,setChosen]=useState(''),[reason,setReason]=useState(''),[changing,setChanging]=useState(false);
 const flight=useRef(0),mounted=useRef(false),activeId=useRef(''),mutating=useRef(false);
 const api=usePrivateRuntime(()=>{flight.current++;setList(empty);setDetail(null);setAdministrator(false);setLoading(false);setBusy(false);setError('');setNotice('');setReason('');setChosen('');activeId.current='';});
 const base=`/api/v1/projects/${encodeURIComponent(projectId)}/decisions`;
 async function load(offset=0,id=activeId.current,checkIdentity=false){
  if(!mounted.current||mutating.current)return;const own=++flight.current;setLoading(true);setError('');
  try{
   if(checkIdentity||administrator===null){const caps=await api<V1Envelope<V1Capabilities>>('/api/v1/capabilities');if(own!==flight.current)return;const allowed=['administrator','admin'].includes(caps.data.identity.role);setAdministrator(allowed);if(!allowed){setList(empty);setDetail(null);return;}}
   else if(administrator===false)return;
   const response=await api<{data:Collection}>(`${base}?offset=${offset}&limit=10`);if(own!==flight.current)return;
   if(response.data.items.some(item=>item.projectId!==projectId))throw new Error('返回的项目不匹配，请刷新。');setList(response.data);
   const selectedId=id||response.data.items[0]?.id||'';
   if(selectedId){const response=await api<{data:Decision}>(`${base}/${encodeURIComponent(selectedId)}`);if(own!==flight.current)return;if(response.data.projectId!==projectId)throw new Error('决策所属项目不匹配。');setDetail(response.data);activeId.current=response.data.id;setChosen(response.data.chosenId??response.data.recommendation.chosenId??'');setChanging(false);setReason('');}
   else{setDetail(null);activeId.current='';}
  }catch(e){if(own===flight.current&&(e as Error).name!=='AbortError')setError((e as Error).message);}
  finally{if(own===flight.current)setLoading(false);}
 }
 const loader=useRef(load);loader.current=load;
 useEffect(()=>{mounted.current=true;activeId.current='';setDetail(null);setList(empty);setNotice('');setReason('');setChosen('');void loader.current(0,'',true);return()=>{mounted.current=false;flight.current++;};},[projectId]);
 async function submit(){
  if(!detail||!administrator||mutating.current||!chosen||!reason.trim()||loading)return;
  const own=++flight.current,snapshot=detail;mutating.current=true;setBusy(true);setError('');setNotice('');
  try{
   let response:{data:Decision};
   if(changing){
    response=await api(`${base}/${snapshot.id}/change`,'POST',{commandId:crypto.randomUUID(),expectedVersion:snapshot.revision,
     questionSummary:snapshot.questionSummary,context:snapshot.context,options:snapshot.options,chosenId:chosen,decisionRationale:reason.trim(),basisRefs:snapshot.basisRefs,risk:snapshot.risk,affectedObjectives:snapshot.affectedObjectives,rollbackPlan:snapshot.rollbackPlan,actions:[],status:'selected',origin:'human',reason:reason.trim()});
   }else response=await api(`${base}/${snapshot.id}/select`,'POST',{commandId:crypto.randomUUID(),expectedVersion:snapshot.revision,mode:'explicit',chosenId:chosen,decisionRationale:reason.trim(),basisRefs:snapshot.basisRefs,origin:'human',reason:reason.trim()});
   if(own!==flight.current)return;activeId.current=response.data.id;setDetail(response.data);setNotice(changing?'已建立关联变更；等待独立执行计划。原决定及实施证据保留。':'已记录选择；执行与验收状态单独记录。');setChanging(false);setReason('');
  }catch(e){if(own===flight.current&&(e as Error).name!=='AbortError')setError((e as {status?:number}).status===409?'决策或原依据已变化，请刷新后重新安排。':(e as Error).message);}
  finally{mutating.current=false;if(own===flight.current)setBusy(false);if(mounted.current)void loader.current(list.offset,activeId.current);}
 }
 if(administrator===false)return null;
 const canChoose=detail&&detail.status!=='superseded'&&(changing||['proposed','selected'].includes(detail.status));
 return <section className="project-decisions" aria-label="项目决策台账">
  <Panel title="决策台账" actions={<Button kind="ghost" disabled={loading||busy} onClick={()=>void load(list.offset,activeId.current,administrator===null)}>刷新</Button>}>
   <p className="project-decision-caption">保留当时问题、备选、选择依据和实施证据。变更另建记录，历史可追溯。</p>
   {error&&<p className="project-decision-error" role="alert">{error}</p>}{notice&&<Note>{notice}</Note>}
   {!list.items.length?loading?<p role="status">正在读取决策…</p>:<Empty title="尚无结构化决策" detail="监督产生的已记录决定会出现在这里。执行器的问题自动采集仍待接入。"/>:
    <div className="project-decision-layout"><nav className="project-decision-list" aria-label="决策列表">{list.items.map(item=><button className={detail?.id===item.id?'active':''} key={item.id} disabled={loading||busy} onClick={()=>void load(list.offset,item.id)}><small>{date(item.updatedAt)} · 版本 {item.revision}</small><strong>{item.questionSummary}</strong><span>{statusLabels[item.status]??item.status}</span></button>)}</nav>
     {detail&&<article className="project-decision-detail">
      <header><h3>{detail.questionSummary}</h3><Tag>{statusLabels[detail.status]??detail.status}</Tag></header>
      <div className="project-decision-meta"><span>{detail.origin==='ai'?'AI记录':detail.origin==='rule'?'有限规则':'人工记录'}</span><span>风险：{({low:'低',medium:'中',high:'高',unknown:'待核对'} as Record<string,string>)[detail.risk]}</span><span>版本 {detail.revision} · {date(detail.updatedAt)}</span></div>
      <p>{detail.context.situation}</p><blockquote>{detail.decisionRationale}</blockquote>
      <div className="project-decision-options">{detail.options.map(option=>{const recommendation=detail.recommendation.candidates.find(c=>c.id===option.id);return <section className={detail.chosenId===option.id?'chosen':''} key={option.id}><header><h4>{option.title}</h4><Tag>{detail.chosenId===option.id?'当时已选':detail.recommendation.chosenId===option.id?'规则推荐':'备选'}</Tag></header><p>{option.impact}</p><dl><dt>优点</dt><dd>{option.advantages.join('；')||'未记录'}</dd><dt>代价</dt><dd>{option.disadvantages.join('；')||'未记录'}</dd></dl><small>{reversible[option.reversibility]} · {recommendation?.eligible?'已声明条件满足':recommendation?.reasons.map(r=>reasonLabels[r]??r).join('；')}</small></section>;})}</div>
      {detail.selfReported&&<p className="project-decision-caption">包含AI自报信息；记录或选择不代表独立验收通过。</p>}
      <details><summary>当时目标与依据</summary><dl><dt>目标</dt><dd>{detail.affectedObjectives.join('、')||'未关联编号'}</dd><dt>约束</dt><dd>{detail.context.constraints.join('；')||'未记录'}</dd><dt>源码版本</dt><dd>{detail.context.sourceVersion||'未观察'}</dd><dt>目标指纹</dt><dd>{detail.context.goalSpecHash||'未观察'}</dd><dt>源码指纹</dt><dd>{detail.context.sourceFingerprint||'未观察'}</dd></dl>{detail.basisRefs.map((ref,i)=><p className="project-decision-ref" key={i}>{ref.reference}{ref.sha256&&<small>SHA-256：{ref.sha256}</small>}</p>)}{detail.context.taskId&&navigate&&<Button kind="ghost" onClick={()=>navigate('tasks/'+encodeURIComponent(detail.context.taskId!))}>关联任务</Button>}</details>
      <details><summary>实际动作 · {detail.actions.length}</summary>{detail.actions.length?detail.actions.map((action,i)=><div className="project-decision-action" key={i}><small>{date(action.at)} · {action.state==='performed'?'已记完成':action.state==='failed'?'已记失败':'计划中'}</small><p>{action.summary}</p>{action.evidenceRefs.map((ref,j)=><small key={j}>{ref.reference}</small>)}</div>):<p>尚未登记实际动作。</p>}</details>
      <details><summary>回退与调整依据</summary><p>{detail.rollbackPlan.plan}</p><p>触发：{detail.rollbackPlan.triggers.join('；')||'未记录'}</p><p>影响：{detail.rollbackPlan.impact}</p><p className="project-decision-caption">回退需建立新的执行计划；这里登记依据，不直接恢复服务器。</p></details>
      <details><summary>历史版本 · {detail.revisions?.length??1}</summary>{[...(detail.revisions??[])].reverse().map(revision=><div className="project-decision-history" key={revision.revision}><strong>版本 {revision.revision} · {statusLabels[revision.status]}</strong><small>{date(revision.updatedAt)} · {revision.revisionReason}</small><p>选择：{revision.options.find(o=>o.id===revision.chosenId)?.title??'尚未选择'}</p><p>{revision.decisionRationale}</p><small>指纹：{revision.hash}</small></div>)}</details>
      {detail.changeOf&&<Button kind="ghost" disabled={busy||loading} onClick={()=>void load(list.offset,detail.changeOf!)}>查看原决定</Button>}{detail.supersededBy&&<Button kind="ghost" disabled={busy||loading} onClick={()=>void load(list.offset,detail.supersededBy!)}>查看后续决定</Button>}
      {detail.status!=='superseded'&&<div className="project-decision-controls"><label><input type="checkbox" checked={changing} disabled={busy||loading} onChange={e=>setChanging(e.target.checked)}/>建立新变更，保留原决定</label>{canChoose&&<><label>选择方案<select value={chosen} disabled={busy||loading} onChange={e=>setChosen(e.target.value)}><option value="">请选择</option>{detail.options.map(o=><option key={o.id} value={o.id} disabled={o.compliesWithGoals==='no'||o.withinAuthority==='no'}>{o.title}</option>)}</select></label><label>本次依据<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={4000} disabled={busy||loading} placeholder="说明新事实、选择或调整原因"/></label><Button disabled={!chosen||!reason.trim()||busy||loading} onClick={()=>void submit()}>{busy?'保存中…':changing?'保存新变更':'记录选择'}</Button></>}</div>}
     </article>}
    </div>}
   {list.total>10&&<div className="project-decision-pagination"><span>{list.offset+1}–{Math.min(list.offset+list.items.length,list.total)} / {list.total}</span><Button kind="ghost" disabled={list.offset===0||loading||busy} onClick={()=>void load(Math.max(0,list.offset-10),'')}>上一页</Button><Button kind="ghost" disabled={list.nextOffset===null||loading||busy} onClick={()=>void load(list.nextOffset??0,'')}>下一页</Button></div>}
  </Panel>
 </section>;
}
