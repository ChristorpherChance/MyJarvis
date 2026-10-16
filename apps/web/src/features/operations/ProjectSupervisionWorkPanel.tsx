import {useEffect,useRef,useState} from 'react';
import {Button,Empty,FormDialog,Note,Panel,Tag,type FormSpec,type Props} from './common';
import {usePrivateRuntime} from './usePrivateRuntime';
import {materialSessionGeneration} from './inbox-material-store';
import {supervisionWorkBase,subscribeSupervisionWork,type SupervisionWorkOverview,type SupervisionWorkDetail,type SupervisionWorkItem,type SupervisionWorkBody,type SupervisionStreamMessage} from '../../supervision-work-client';
import {supervisionWorkView,supervisionStatusLabel,supervisionTaskLabels,validCompletion,prepareSupervisionSubmission,supervisionSubmissionUnknown,type SupervisionSubmission} from './supervision-work-view';
import './ProjectSupervisionWorkPanel.css';

const time=(value:string)=>{const at=new Date(value);return Number.isNaN(at.valueOf())?'未报告':at.toLocaleString('zh-CN')};
const statusTone=(status:string)=>status==='completed'?'complete':status==='blocked'?'failed':status==='running'?'queued':'';
const streamLabel={connecting:'正在连接实时变化',live:'实时连接已建立',reconnecting:'实时连接中断，正在重连；当前显示上次读取',closed:'连接已停止，需重新确认身份'};
const parseEvidence=(value:unknown)=>String(value??'').split('\n').filter(line=>line.trim()).map(line=>{const found=/^(.+?)\s*\|\s*([a-f0-9]{64})$/.exec(line.trim());if(!found)throw Error('证据每行需填写“公开相对路径 | 64位小写SHA-256”。');return {path:found[1].trim(),sha256:found[2]}});

export default function ProjectSupervisionWorkPanel({projectId,navigate}:{projectId:string;navigate:Props['navigate']}){
 const [overview,setOverview]=useState<SupervisionWorkOverview|null>(null),[error,setError]=useState(''),[denied,setDenied]=useState(false),[loading,setLoading]=useState(true);
 const [stream,setStream]=useState<'connecting'|'live'|'reconnecting'|'closed'>('connecting'),[readAt,setReadAt]=useState<string|null>(null),[form,setForm]=useState<FormSpec|null>(null);
 const [details,setDetails]=useState<Record<string,SupervisionWorkDetail>>({}),[detailErrors,setDetailErrors]=useState<Record<string,string>>({});
 const flight=useRef(0),mounted=useRef(false),accessStopped=useRef(false),reading=useRef<object|null>(null),reloadPending=useRef(false),unsubscribe=useRef<()=>void>(()=>{});
 const detailFlights=useRef(new Set<string>());
 const api=usePrivateRuntime(()=>{flight.current++;accessStopped.current=true;reloadPending.current=false;setOverview(null);setDetails({});setDetailErrors({});setForm(null);setDenied(true);setLoading(false);unsubscribe.current();setStream('closed')});
 const base=supervisionWorkBase(projectId);
 async function load(){
  if(!mounted.current||accessStopped.current)return;if(reading.current){reloadPending.current=true;return}
  const ticket={};reading.current=ticket;const own=flight.current,session=materialSessionGeneration();
  try{const result=await api<{data:SupervisionWorkOverview}>(base+'/overview');if(!mounted.current||own!==flight.current||session!==materialSessionGeneration())return;
   if(result.data.projectId!==projectId||result.data.items.some(item=>item.projectId!==projectId))throw Error('监督事项与当前项目不匹配。');
   setOverview(result.data);setReadAt(new Date().toISOString());setError('');setDenied(false);
  }catch(failure){if(own!==flight.current||!mounted.current||(failure as Error).name==='AbortError')return;setError((failure as Error).message||'监督进展暂不可读；上次内容不能代表当前状态。')}
  finally{if(reading.current===ticket){reading.current=null;if(own===flight.current&&mounted.current)setLoading(false);if(reloadPending.current&&mounted.current&&!accessStopped.current){reloadPending.current=false;void loader.current()}}}
 }
 const loader=useRef(load);loader.current=load;
 useEffect(()=>{
  mounted.current=true;accessStopped.current=false;flight.current++;reading.current=null;reloadPending.current=false;setOverview(null);setDetails({});setDetailErrors({});setForm(null);setDenied(false);setLoading(true);setReadAt(null);setError('');
  void loader.current();
  const onStream=(message:SupervisionStreamMessage)=>{if(message.type==='connection')setStream(message.state);else void loader.current()};
  const stop=subscribeSupervisionWork(projectId,onStream);unsubscribe.current=stop;
  const invalidated=()=>{flight.current++;accessStopped.current=true;reloadPending.current=false;stop();setOverview(null);setDetails({});setDetailErrors({});setForm(null);setDenied(true);setStream('closed');setLoading(false)};
  const focus=()=>{if(!accessStopped.current)void loader.current()};window.addEventListener('jarvis:inbox-materials-invalidated',invalidated);window.addEventListener('focus',focus);
  return()=>{mounted.current=false;flight.current++;stop();window.removeEventListener('jarvis:inbox-materials-invalidated',invalidated);window.removeEventListener('focus',focus)};
 },[projectId]);
 useEffect(()=>{if(!overview)return;for(const item of overview.items){const loaded=details[item.id];if(loaded&&loaded.item.revision<item.revision)void loadDetail(item)}},[overview,details]);
 async function loadDetail(item:SupervisionWorkItem){const own=flight.current,session=materialSessionGeneration(),key=own+':'+item.id+':'+item.revision;if(detailFlights.current.has(key))return;detailFlights.current.add(key);try{const result=await api<{data:SupervisionWorkDetail}>(base+'/items/'+encodeURIComponent(item.id));if(!mounted.current||own!==flight.current||session!==materialSessionGeneration())return;
  if(result.data.item.id!==item.id||result.data.item.projectId!==projectId||result.data.item.revision<item.revision||result.data.history.some(row=>row.id!==item.id||row.projectId!==projectId))throw Error('事项详情与当前记录不匹配。');
  setDetails(previous=>previous[item.id]?.item.revision>result.data.item.revision?previous:{...previous,[item.id]:result.data});setDetailErrors(previous=>({...previous,[item.id]:''}));
 }catch(failure){if(own===flight.current&&mounted.current&&(failure as Error).name!=='AbortError')setDetailErrors(previous=>({...previous,[item.id]:(failure as Error).message}))}finally{detailFlights.current.delete(key)}}
 function edit(item:SupervisionWorkItem|null){
  let attempted:SupervisionSubmission|null=null;
  setForm({title:item?'更新监督事项':'登记监督事项',description:'记录真实安排和结果。保存不会启动执行器，也不会更改原项目验收。完成需填写简报、验证范围及公开证据引用。',
   fields:[{key:'title',label:'监督事项',required:true},{key:'status',label:'事项状态',type:'select',options:[['planned','待推进'],['running','推进中'],['blocked','需要处理'],['completed','本项已完成']]},
    {key:'summary',label:'简明进展',type:'textarea',required:true},{key:'nextAction',label:'下一步',type:'textarea'},{key:'blocker',label:'当前阻塞',type:'textarea'},
    {key:'completionSummary',label:'完成简报',type:'textarea'},{key:'validationScope',label:'验证范围与边界',type:'textarea'},
    {key:'evidenceText',label:'公开证据引用',type:'textarea',hint:'每行：docs/或artifacts/公开路径 | 64位小写SHA-256。引用登记不等于原件已验证。'}],
   initial:item?{...item,evidenceText:item.evidenceRefs.map(ref=>ref.path+' | '+ref.sha256).join('\n')}:{status:'planned'},
   submit:async values=>{
    const body:SupervisionWorkBody={title:String(values.title).trim(),status:values.status,summary:String(values.summary).trim(),nextAction:String(values.nextAction??'').trim(),blocker:String(values.blocker??'').trim(),stepId:item?.stepId??null,taskId:item?.taskId??null,runId:item?.runId??null,completionSummary:String(values.completionSummary??'').trim(),validationScope:String(values.validationScope??'').trim(),evidenceRefs:parseEvidence(values.evidenceText)};
    if(body.status==='blocked'&&!body.blocker)throw Error('需要处理的事项须填写当前阻塞。');if(body.status==='completed'&&!validCompletion(body))throw Error('完成事项须填写完成简报、验证范围及至少一条完整公开证据引用。');
    attempted=prepareSupervisionSubmission(attempted,JSON.stringify(body),()=>crypto.randomUUID());
    const own=flight.current,session=materialSessionGeneration();try{
     const response=await api<{data:SupervisionWorkItem}>(base+'/items'+(item?'/'+encodeURIComponent(item.id)+'/revisions':''),'POST',{commandId:attempted.commandId,expectedVersion:item?.revision??0,...body});
     if(own!==flight.current||session!==materialSessionGeneration())return;if(response.data.projectId!==projectId)throw Error('返回的监督事项项目不匹配。');attempted.unknown=false;await loader.current();
    }catch(failure){if(attempted)attempted.unknown=supervisionSubmissionUnknown(failure);throw failure}
   }});
 }
 if(denied)return null;
 const view=overview?supervisionWorkView(overview):null;
 function row(item:SupervisionWorkItem){const detail=details[item.id],currentDetail=detail&&detail.item.revision>=item.revision?detail:null;return <article className={'supervision-work-item is-'+item.status} key={item.id}>
  <header><h4>{item.title}</h4><Tag tone={statusTone(item.status)}>{supervisionStatusLabel[item.status]}</Tag></header>
  <p className="supervision-work-summary">{item.status==='completed'?item.completionSummary:item.summary}</p>
  {item.blocker&&item.status!=='completed'&&<p className="supervision-work-blocker"><strong>当前阻塞：</strong>{item.blocker}</p>}
  {item.status!=='completed'&&<p><strong>下一步：</strong>{item.nextAction||'尚未登记，需核对后安排。'}</p>}
  {item.status==='completed'&&<p><strong>验证范围：</strong>{item.validationScope}</p>}
  <details onToggle={event=>{if(event.currentTarget.open&&!currentDetail)void loadDetail(item)}}><summary>展开详情、证据与历史</summary>
   {detailErrors[item.id]&&<p role="alert">{detailErrors[item.id]}</p>}{!currentDetail?<p>正在读取该事项详情…</p>:<>
    <p>{currentDetail.item.summary}</p>{currentDetail.item.validationScope&&<p>验证范围与边界：{currentDetail.item.validationScope}</p>}
    <dl><div><dt>记录修订</dt><dd>{item.revision} · {time(item.updatedAt)}</dd></div>{item.stepId&&<div><dt>关联阶段</dt><dd>{item.stepId}</dd></div>}{item.taskId&&<div><dt>关联任务</dt><dd><Button kind="ghost" onClick={()=>navigate('tasks/'+encodeURIComponent(item.taskId!))}>查看任务</Button></dd></div>}{item.runId&&<div><dt>执行编号</dt><dd>{item.runId}</dd></div>}</dl>
    <h5>公开证据引用</h5><p className="supervision-work-muted">这里展示登记的路径与指纹，尚未据此读取或核验原件。</p>
    {currentDetail.item.evidenceRefs.length?<ul className="supervision-work-evidence">{currentDetail.item.evidenceRefs.map(ref=><li key={ref.path+ref.sha256}><span>{ref.path}</span><code>SHA-256 {ref.sha256}</code></li>)}</ul>:<p>尚未登记证据引用。</p>}
    <h5>修订历史</h5>{currentDetail.historyTruncated&&<p>仅展示最近100条修订，旧记录保留。</p>}<ol className="supervision-work-history">{[...currentDetail.history].sort((a,b)=>b.revision-a.revision).map(history=><li key={history.revision}><strong>修订 {history.revision} · {supervisionStatusLabel[history.status]}</strong><time>{time(history.updatedAt)}</time><p>{history.summary}</p>{history.completionSummary&&<p>完成简报：{history.completionSummary}</p>}</li>)}</ol>
   </>}<Button kind="ghost" onClick={()=>edit(item)}>更新此事项</Button>
  </details>
 </article>}
 return <section className="supervision-work" aria-label="监督进展"><Panel title="监督进展" actions={<div className="op-actions"><Button kind="ghost" disabled={loading} onClick={()=>void loader.current()}>刷新</Button><Button onClick={()=>edit(null)}>登记事项</Button></div>}>
  <p className="supervision-work-connection" role="status">{streamLabel[stream]}{readAt&&<> · 最近读取 {time(readAt)}</>}</p>
  {error&&<Note tone="warn">{error} 当前事实需重新读取确认。</Note>}
  {view&&overview?<><div className="supervision-work-counts"><div><span>监督事项</span><strong>{view.total} 项</strong></div><div><span>推进中</span><strong>{view.running} 项</strong></div><div><span>需要处理</span><strong>{view.blocked} 项</strong></div><div><span>已完成简报</span><strong>{view.completedCount} 项</strong></div></div>
   <p className="supervision-work-muted">{view.independentStatement} 监督事项不使用耗时、模型自报或模拟百分比计算进度。</p>
   {overview.itemsTruncated&&<Note>计数覆盖全部事项；以下仅展示最近500项，较早事项未被删除。</Note>}
   <div className="supervision-work-list">{view.items.map(row)}</div>{!view.items.length&&<Empty title={view.total?'当前没有未完成的监督事项':'尚未登记监督事项'} detail="事项登记、执行结果与产品验收分别保留。"/>}
   {view.completed.length>0&&<details className="supervision-work-completed"><summary>完成简报 · 本次展示 {view.completed.length} 项</summary><div className="supervision-work-list">{view.completed.map(row)}</div></details>}
   {overview.executionFacts.length>0&&<details className="supervision-work-completed"><summary>真实任务与执行记录 · 本次展示 {overview.executionFacts.length} 项</summary><p>来自已保存任务与执行回执；执行结束不代表独立验收通过。{overview.executionFactsTruncated?' 当前最多展示200项，旧任务仍保留。':''}</p><ul className="supervision-work-facts">{overview.executionFacts.map(fact=>{const labels=supervisionTaskLabels(fact);return <li key={fact.taskId}><Button kind="ghost" onClick={()=>navigate('tasks/'+encodeURIComponent(fact.taskId))}>{fact.title}</Button><span>{labels.task} · {labels.execution}</span>{fact.summary&&<p>{fact.summary}</p>}</li>})}</ul></details>}
  </>:loading?<p role="status">正在读取真实监督事项…</p>:!error&&<Empty title="暂无监督事项"/>}
  <p className="supervision-work-muted">平台内实时更新；连接中断会重连并重新读取。浏览器系统提醒沿用本人偏好与权限，关闭页面或断网时不承诺离线推送。</p>
 </Panel>{form&&<FormDialog spec={form} onClose={()=>setForm(null)}/>}</section>
}
