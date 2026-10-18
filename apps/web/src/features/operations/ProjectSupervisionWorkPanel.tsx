import {useEffect,useRef,useState} from 'react';
import {Button,Dialog,Empty,FormDialog,Note,Panel,Tag,type FormSpec,type Props} from './common';
import {usePrivateRuntime} from './usePrivateRuntime';
import {materialSessionGeneration} from './inbox-material-store';
import {supervisionWorkBase,subscribeSupervisionWork,type SupervisionWorkOverview,type SupervisionWorkDetail,type SupervisionWorkItem,type SupervisionWorkBody,type SupervisionStreamMessage,type SupervisionConsole,type SupervisionActivity} from '../../supervision-work-client';
import {supervisionConsoleView} from './supervision-console-view';
import './ProjectOversightPage.css';
import {supervisionWorkView,supervisionStatusLabel,supervisionTaskLabels,validCompletion,prepareSupervisionSubmission,supervisionSubmissionUnknown,type SupervisionSubmission} from './supervision-work-view';
import './ProjectSupervisionWorkPanel.css';

const time=(value:string)=>{const at=new Date(value);return Number.isNaN(at.valueOf())?'未报告':at.toLocaleString('zh-CN')};
const statusTone=(status:string)=>status==='completed'?'complete':status==='blocked'?'failed':status==='running'?'queued':'';
const streamLabel={connecting:'正在连接实时变化',live:'实时连接已建立',reconnecting:'实时连接中断，正在重连；当前显示上次读取',closed:'连接已停止，需重新确认身份'};
const parseEvidence=(value:unknown)=>String(value??'').split('\n').filter(line=>line.trim()).map(line=>{const found=/^(.+?)\s*\|\s*([a-f0-9]{64})$/.exec(line.trim());if(!found)throw Error('证据每行需填写“公开相对路径 | 64位小写SHA-256”。');return {path:found[1].trim(),sha256:found[2]}});

export default function ProjectSupervisionWorkPanel({projectId,navigate,consoleMode=false}:{projectId:string;navigate:Props['navigate'];consoleMode?:boolean}){
 const [overview,setOverview]=useState<SupervisionWorkOverview|null>(null),[error,setError]=useState(''),[denied,setDenied]=useState(false),[loading,setLoading]=useState(true);
 const [stream,setStream]=useState<'connecting'|'live'|'reconnecting'|'closed'>('connecting'),[readAt,setReadAt]=useState<string|null>(null),[form,setForm]=useState<FormSpec|null>(null);
 const [details,setDetails]=useState<Record<string,SupervisionWorkDetail>>({}),[detailErrors,setDetailErrors]=useState<Record<string,string>>({});
 const [phase,setPhase]=useState('all'),[briefId,setBriefId]=useState(''),[older,setOlder]=useState<SupervisionActivity['items']>([]),[olderMore,setOlderMore]=useState<number|null>(null),[historyBusy,setHistoryBusy]=useState(false),[historyError,setHistoryError]=useState('');
 const flight=useRef(0),mounted=useRef(false),accessStopped=useRef(false),reading=useRef<object|null>(null),reloadPending=useRef(false),unsubscribe=useRef<()=>void>(()=>{});
 const detailFlights=useRef(new Set<string>());
 const api=usePrivateRuntime(()=>{flight.current++;accessStopped.current=true;reloadPending.current=false;setOverview(null);setDetails({});setDetailErrors({});setForm(null);setBriefId('');setOlder([]);setDenied(true);setLoading(false);unsubscribe.current();setStream('closed')});
 const base=supervisionWorkBase(projectId);
 async function load(){
  if(!mounted.current||accessStopped.current)return;if(reading.current){reloadPending.current=true;return}
  const ticket={};reading.current=ticket;const own=flight.current,session=materialSessionGeneration();
  try{const result=await api<{data:SupervisionWorkOverview}>(base+(consoleMode?'/console':'/overview'));if(!mounted.current||own!==flight.current||session!==materialSessionGeneration())return;
   if(result.data.projectId!==projectId||result.data.items.some(item=>item.projectId!==projectId))throw Error('监督事项与当前项目不匹配。');
   setOverview(result.data);setReadAt(new Date().toISOString());setError('');setDenied(false);
  }catch(failure){if(own!==flight.current||!mounted.current||(failure as Error).name==='AbortError')return;setError((failure as Error).message||'监督进展暂不可读；上次内容不能代表当前状态。')}
  finally{if(reading.current===ticket){reading.current=null;if(own===flight.current&&mounted.current)setLoading(false);if(reloadPending.current&&mounted.current&&!accessStopped.current){reloadPending.current=false;void loader.current()}}}
 }
 const loader=useRef(load);loader.current=load;
 useEffect(()=>{
  mounted.current=true;accessStopped.current=false;flight.current++;reading.current=null;reloadPending.current=false;setOverview(null);setDetails({});setDetailErrors({});setForm(null);setDenied(false);setLoading(true);setReadAt(null);setError('');setPhase('all');setBriefId('');setOlder([]);setOlderMore(null);setHistoryBusy(false);setHistoryError('');
  void loader.current();
  const onStream=(message:SupervisionStreamMessage)=>{if(message.type==='connection')setStream(message.state);else void loader.current()};
  const stop=subscribeSupervisionWork(projectId,onStream);unsubscribe.current=stop;
  const invalidated=()=>{flight.current++;accessStopped.current=true;reloadPending.current=false;stop();setOverview(null);setDetails({});setDetailErrors({});setForm(null);setDenied(true);setStream('closed');setLoading(false)};
  const focus=()=>{if(!accessStopped.current)void loader.current()};window.addEventListener('jarvis:inbox-materials-invalidated',invalidated);window.addEventListener('focus',focus);
  const timer=consoleMode?window.setInterval(()=>{if(document.visibilityState==='visible')focus()},60000):undefined;
  return()=>{if(timer!==undefined)window.clearInterval(timer);mounted.current=false;flight.current++;stop();window.removeEventListener('jarvis:inbox-materials-invalidated',invalidated);window.removeEventListener('focus',focus)};
 },[projectId,consoleMode]);
 useEffect(()=>{if(!overview)return;for(const item of overview.items){const loaded=details[item.id];if(loaded&&loaded.item.revision<item.revision)void loadDetail(item)}},[overview,details]);
 async function loadDetail(item:SupervisionWorkItem){const own=flight.current,session=materialSessionGeneration(),key=own+':'+item.id+':'+item.revision;if(detailFlights.current.has(key))return;detailFlights.current.add(key);try{const result=await api<{data:SupervisionWorkDetail}>(base+'/items/'+encodeURIComponent(item.id));if(!mounted.current||own!==flight.current||session!==materialSessionGeneration())return;
  if(result.data.item.id!==item.id||result.data.item.projectId!==projectId||result.data.item.revision<item.revision||result.data.history.some(row=>row.id!==item.id||row.projectId!==projectId))throw Error('事项详情与当前记录不匹配。');
  setDetails(previous=>previous[item.id]?.item.revision>result.data.item.revision?previous:{...previous,[item.id]:result.data});setDetailErrors(previous=>({...previous,[item.id]:''}));
 }catch(failure){if(own===flight.current&&mounted.current&&(failure as Error).name!=='AbortError')setDetailErrors(previous=>({...previous,[item.id]:(failure as Error).message}))}finally{detailFlights.current.delete(key)}}
 function edit(item:SupervisionWorkItem|null){
  setBriefId('');
  let attempted:SupervisionSubmission|null=null;
  setForm({title:item?'更新监督事项':'登记监督事项',description:'记录真实安排和结果。保存不会启动执行器，也不会更改原项目验收。完成需填写简报、验证范围及公开证据引用。',
   fields:[{key:'title',label:'监督事项',required:true},{key:'status',label:'事项状态',type:'select',options:[['planned','待推进'],['running','推进中'],['blocked','需要处理'],['completed','本项已完成']]},
    {key:'summary',label:'简明进展',type:'textarea',required:true},{key:'nextAction',label:'下一步',type:'textarea'},{key:'blocker',label:'当前阻塞',type:'textarea'},
    {key:'completionSummary',label:'完成简报',type:'textarea'},{key:'validationScope',label:'验证范围与边界',type:'textarea'},
    {key:'taskId',label:'绑定现有任务ID',hint:'仅填本项目已有任务；留空表示未绑定，不会创建或派发。'},{key:'runId',label:'绑定现有运行ID',hint:'仅填真实已存在且属于此项目/任务的run；无运行保持空。'},
    {key:'evidenceText',label:'公开证据引用',type:'textarea',hint:'每行：docs/或artifacts/公开路径 | 64位小写SHA-256。引用登记不等于原件已验证。'}],
   initial:item?{...item,evidenceText:item.evidenceRefs.map(ref=>ref.path+' | '+ref.sha256).join('\n')}:{status:'planned'},
   submit:async values=>{
    const body:SupervisionWorkBody={title:String(values.title).trim(),status:values.status,summary:String(values.summary).trim(),nextAction:String(values.nextAction??'').trim(),blocker:String(values.blocker??'').trim(),stepId:item?.stepId??null,taskId:String(values.taskId??'').trim()||null,runId:String(values.runId??'').trim()||null,completionSummary:String(values.completionSummary??'').trim(),validationScope:String(values.validationScope??'').trim(),evidenceRefs:parseEvidence(values.evidenceText)};
    if(body.status==='blocked'&&!body.blocker)throw Error('需要处理的事项须填写当前阻塞。');if(body.status==='completed'&&!validCompletion(body))throw Error('完成事项须填写完成简报、验证范围及至少一条完整公开证据引用。');
    attempted=prepareSupervisionSubmission(attempted,JSON.stringify(body),()=>crypto.randomUUID());
    const own=flight.current,session=materialSessionGeneration();try{
     const response=await api<{data:SupervisionWorkItem}>(base+'/items'+(item?'/'+encodeURIComponent(item.id)+'/revisions':''),'POST',{commandId:attempted.commandId,expectedVersion:item?.revision??0,...body});
     if(own!==flight.current||session!==materialSessionGeneration())return;if(response.data.projectId!==projectId)throw Error('返回的监督事项项目不匹配。');attempted.unknown=false;await loader.current();
    }catch(failure){if(attempted)attempted.unknown=supervisionSubmissionUnknown(failure);throw failure}
   }});
 }
 function arrange(item:SupervisionWorkItem){let attempted:SupervisionSubmission|null=null;setForm({title:'调整下一步监管安排',description:'保存到本项目并保留修订记录，供执行方接续。此操作不会启动执行器或恢复定时跟进。',fields:[{key:'nextAction',label:'你希望下一步做什么',type:'textarea',required:true}],initial:{nextAction:item.nextAction},submit:async values=>{
  const fields=['title','status','summary','blocker','stepId','taskId','runId','completionSummary','validationScope','evidenceRefs'] as const;
  const body={...Object.fromEntries(fields.map(k=>[k,item[k]])),nextAction:String(values.nextAction).trim()};attempted=prepareSupervisionSubmission(attempted,JSON.stringify(body),()=>crypto.randomUUID());
  const own=flight.current,session=materialSessionGeneration();try{await api(base+'/items/'+encodeURIComponent(item.id)+'/revisions','POST',{...body,commandId:attempted.commandId,expectedVersion:item.revision});if(own!==flight.current||session!==materialSessionGeneration())return;attempted.unknown=false;await loader.current();}catch(failure){attempted.unknown=supervisionSubmissionUnknown(failure);throw failure;}
 }});}
 async function earlier(before:number){if(historyBusy)return;const own=flight.current,session=materialSessionGeneration();setHistoryBusy(true);setHistoryError('');try{const response=await api<{data:SupervisionActivity}>(base+'/activity?before='+before);if(own!==flight.current||session!==materialSessionGeneration())return;setOlder(rows=>[...rows,...response.data.items].filter((r,i,a)=>a.findIndex(x=>x.sequence===r.sequence)===i));setOlderMore(response.data.nextBefore);}catch(e){if(own===flight.current&&mounted.current)setHistoryError((e as Error).message);}finally{if(own===flight.current&&mounted.current)setHistoryBusy(false);}}
 if(denied)return consoleMode?<Note tone="warn">当前身份无法读取项目监管，请重新登录管理者本人。</Note>:null;
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
 if(consoleMode){const current=overview as SupervisionConsole|null,c=current?supervisionConsoleView(current):null,brief=current?.items.find(x=>x.id===briefId),focus=c?.focus;
  const activity=current?[...current.activity.items,...older].filter((r,i,a)=>a.findIndex(x=>x.sequence===r.sequence)===i).sort((a,b)=>b.sequence-a.sequence):[];
  const nextBefore=older.length?olderMore:current?.activity.nextBefore;
  return <section className="oversight-console" aria-label="项目监管台">
   <div className="oversight-live"><span className={'oversight-dot '+(stream==='live'&&!error?'is-live':'')}/><span>{error?'读取失败，以下为上次记录':streamLabel[stream]}</span><span>{readAt?'最近核对 '+time(readAt):'正在读取'}</span><Button kind="ghost" disabled={loading} onClick={()=>void loader.current()}>核对最新状态</Button></div>
   {error&&<Note tone="warn">{error} 请先重新核对，再据此作出操作决定。</Note>}
   {!current||!c?<Empty title={loading?'正在读取项目监管状态':'监管信息暂不可读'} detail="不会使用演示记录或估算百分比替代。"/>:<>
    <section className={'oversight-hero is-'+c.state.code} aria-label="真实运行状态"><div><span className="oversight-eyebrow">平台受控执行 · {error?'上次读取':'最近核对'}</span><h2>{c.state.label}</h2><p>{c.state.detail}</p></div><Button kind="ghost" onClick={()=>navigate('projects/'+encodeURIComponent(projectId)+'?tab=autonomy')}>查看执行与授权</Button></section>
    <div className="oversight-stats"><div><span>需要你处理</span><strong>{current.attention.total}<small> 项</small></strong><span>审批或任务明确等待本人</span></div><div><span>已完成简报</span><strong>{c.recordedCompletion}<small> 项</small></strong><span>监管工作事项，不等于产品交付</span></div><div><span>产品目标独立验收</span><strong>{c.acceptance}</strong><span>仅按真实目标验收记录统计</span></div></div>
    <div className="oversight-main-grid"><section className="oversight-box oversight-focus" aria-label="当前重点"><header><span className="oversight-eyebrow">当前重点</span>{focus&&<Tag tone={focus.blocker?'failed':''}>{c.focusState}</Tag>}</header>{focus?<><h3>{focus.title}</h3><p>{focus.summary}</p>{focus.blocker&&<div className="oversight-blocker"><strong>卡在哪里</strong><p>{focus.blocker}</p></div>}<div className="oversight-next"><strong>下一步</strong><p>{focus.nextAction||'尚未登记下一步，需要执行方补充。'}</p></div><div className="op-actions"><Button onClick={()=>arrange(focus)}>调整下一步安排</Button><Button kind="ghost" onClick={()=>{setBriefId(focus.id);void loadDetail(focus)}}>查看本项记录</Button></div><small className="supervision-work-muted">最近更新 {time(focus.updatedAt)} · 这是一项监管工作记录，实际执行见上方。</small></>:<Empty title="当前没有未完成的监管事项" detail="已有完成简报仍保留在下方。"/>}</section>
    <section className="oversight-box" aria-label="需要本人处理"><header><h3>需要你处理</h3><Tag>{current.attention.total} 项</Tag></header>{current.attention.items.length?current.attention.items.map(x=><article className="oversight-attention" key={x.kind+x.id}><strong>{x.title}</strong><p>{x.reason}</p><Button onClick={()=>navigate(x.route)}>前往处理</Button></article>):<div className="oversight-empty"><span aria-hidden="true">✓</span><strong>目前没有待你审批或输入的任务</strong><p>{focus?.blocker?'当前阻塞需要执行方核清条件，不等于在等你批准。':'有明确需要你决定的事项，会在这里单独列出。'}</p></div>}{current.attention.truncated&&<p>这里只展示前30项，其余可到审批和任务页处理。</p>}<p className="supervision-work-muted">监管安排、审批与真正启动执行分别记录。</p></section></div>
    {current.plan&&<section className="oversight-box" aria-label="推进阶段"><header><h3>推进阶段</h3><small>点击查看各阶段事项</small></header><div className="oversight-stages"><button aria-pressed={phase==='all'} onClick={()=>setPhase('all')}><b>全部</b><span>{current.counts.total} 项监管记录</span></button>{current.plan.steps.map((step,i)=>{const records=current.items.filter(x=>x.stepId===step.id),open=records.filter(x=>x.status!=='completed').length;return <button key={step.id} aria-pressed={phase===step.id} onClick={()=>setPhase(step.id)}><b><i>{i+1}</i>{step.title}</b><span>{records.length?open?`${open} 项待接续`:`${records.length} 项已有简报`:'尚无监管事项绑定'}</span></button>})}</div><small className="supervision-work-muted">阶段按当前计划排列，事项简报与产品验收分开；计划本身不会自动派发任务。</small></section>}
    <section className="oversight-box" aria-label="监管事项"><header><h3>{phase==='all'?'待推进事项':'本阶段事项'}</h3><Button kind="ghost" onClick={()=>edit(null)}>登记监管事项</Button></header><div className="oversight-work-list">{c.work.filter(x=>phase==='all'||x.stepId===phase).map(x=><article key={x.id}><div><Tag tone={x.blocker?'failed':''}>{x.blocker?'存在阻塞':x.status==='planned'?'待安排':'待接续'}</Tag><h4>{x.title}</h4><p>{x.nextAction||x.summary}</p></div><Button kind="ghost" onClick={()=>{setBriefId(x.id);void loadDetail(x)}}>查看事项</Button></article>)}</div>{!c.work.some(x=>phase==='all'||x.stepId===phase)&&<Empty title="当前筛选没有待推进事项"/>}</section>
    <div className="oversight-main-grid"><section className="oversight-box" aria-label="最近完成简报"><header><h3>最近完成简报</h3><span>{current.counts.completed} 项已登记</span></header>{c.done.filter(x=>phase==='all'||x.stepId===phase).slice(0,3).map(x=><article className="oversight-brief" key={x.id}><time>{time(x.updatedAt)}</time><h4>{x.title}</h4><p>{x.completionSummary}</p><Button kind="ghost" onClick={()=>{setBriefId(x.id);void loadDetail(x)}}>阅读简报与验收范围</Button></article>)}{!c.done.some(x=>phase==='all'||x.stepId===phase)&&<Empty title="当前筛选尚无完成简报"/>}{c.done.filter(x=>phase==='all'||x.stepId===phase).length>3&&<details><summary>更早完成简报</summary>{c.done.filter(x=>phase==='all'||x.stepId===phase).slice(3).map(x=><p key={x.id}><Button kind="ghost" onClick={()=>{setBriefId(x.id);void loadDetail(x)}}>{x.title}</Button></p>)}</details>}<small className="supervision-work-muted">这里的“完成”只指该监管事项，不增加产品目标验收数。</small></section>
    <section className="oversight-box" aria-label="推进时间线"><header><h3>推进时间线</h3><span>已提交的真实事件</span></header><ol className="oversight-timeline">{activity.map(event=><li key={event.sequence}><time>{time(event.at)}</time><strong>{event.title||'执行记录更新'}</strong><p>{event.summary}</p><small>{event.kind==='work-item'?'监管记录更新':'执行回执变化'}</small></li>)}</ol>{!activity.length&&<Empty title="尚无推进事件" detail="打开页面或读取状态不会生成虚假的进展。"/>}{historyError&&<p role="alert">{historyError}</p>}{nextBefore!==null&&nextBefore!==undefined&&<Button kind="ghost" disabled={historyBusy} onClick={()=>void earlier(nextBefore)}>{historyBusy?'正在读取…':'查看更早记录'}</Button>}</section></div>
    <details className="oversight-box oversight-technical"><summary>详细工作记录、公开证据与维护</summary><p className="supervision-work-muted">保留所有原始修订，公开引用登记不等于原件已经验证。</p><div className="supervision-work-list">{current.items.map(row)}</div>{current.itemsTruncated&&<Note>仅展示最近500项；更早记录未删除。</Note>}<details><summary>关联任务与执行记录</summary><ul className="supervision-work-facts">{current.executionFacts.map(x=><li key={x.taskId}><Button kind="ghost" onClick={()=>navigate('tasks/'+encodeURIComponent(x.taskId))}>{x.title}</Button><span>{Object.values(supervisionTaskLabels(x)).join(' · ')}</span></li>)}</ul></details><Button kind="ghost" onClick={()=>navigate('projects/'+encodeURIComponent(projectId)+'?tab=decisions')}>项目决策与依据</Button></details>
   </>}
   <p className="supervision-work-muted">有已提交的新事件时更新此页并沿用本人提醒偏好。实时连接不等于自动执行，也不会恢复外部定时跟进；关闭页面后的离线推送未开通。</p>
   {brief&&<Dialog title={brief.status==='completed'?'完成简报':'监管事项记录'} onClose={()=>setBriefId('')} wide><p className="supervision-work-muted">更新于 {time(brief.updatedAt)}。{brief.status==='completed'?'本项简报不代表整个项目交付。':'监管事项状态不代表执行器正在运行。'}</p>{row(brief)}</Dialog>}
   {form&&<FormDialog spec={form} onClose={()=>setForm(null)}/>}
  </section>;
 }
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
