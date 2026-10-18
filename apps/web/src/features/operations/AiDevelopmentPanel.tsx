import {useEffect,useRef,useState} from 'react';
import {Button,Empty,KV,Note,Panel,Tag,type RecordItem} from './common';
import {dateTime,number} from './infrastructure-widgets';
import {usePrivateRuntime} from './usePrivateRuntime';
import './ai-development.css';

type Profile={id:string;revision:number;name:string;tools:{name:string;version:string}[];providers:{id:string;name:string;model:string|null;credentialConfigured:boolean}[];statuslineVersion:string};
type Inventory={tools:{name:string;version:string|null;installed:boolean;path?:string|null;matchesPinned?:boolean}[];providers:{id:string;name:string;model:string|null;credentialConfigured:boolean;current?:boolean}[];statusline?:{configured:boolean;resources?:boolean;version?:string|null};resources?:{cpuPercent?:number|null;ramUsedBytes?:number|null;ramTotalBytes?:number|null;diskFreeBytes?:number|null;diskTotalBytes?:number|null;load1m?:number|null;memoryPercent?:number|null;memoryTotalGB?:number|null;memoryUsedGB?:number|null;diskFreeGB?:number|null;diskPercent?:number|null}|null;terminalTelemetry?:{observedAt?:string;provider?:string|null;model?:string|null;contextTokens?:number|null;contextWindow?:number|null;currentInputTokens?:number|null;currentOutputTokens?:number|null;sessionCostUSD?:number|null;billingStatus?:'estimated'|'unknown';rateLimitFiveHourPercent?:number|null;rateLimitSevenDayPercent?:number|null}};
type Job={id:string;action:string;profileId:string;createdAt:string;expiresAt:string;status:string;reason:string|null;result?:{at:string;summary:string;inventory?:Inventory}|null};
type Snapshot={machineId:string;machineRevision:number;name:string;address:string;readOnly:boolean;profiles:Profile[];blocked:boolean;reason:string|null;observation:{at:string;source:string;stale:boolean;inventory:Inventory}|null;resources:Record<string,unknown>|null;resourcesObservedAt:string|null;resourcesStale:boolean;jobs:Job[];usage:{url:string;summaryUrl:string;terminalSessionBilling:string;note:string}};
type Capabilities={configured:boolean;controllerOnline:boolean;controllerObservedAt:string|null;storageReady:boolean;blocked:boolean;reason:string|null;profiles:Profile[];nodes:{machineId:string}[]};
const base='/api/runtime/ai-development';
const actions:Record<string,string>={probe:'检查环境',configure:'配置开发环境',telemetry:'采集终端状态'};
const reasons:Record<string,string>={AI_DEVELOPMENT_NOT_CONFIGURED:'尚未为这台机器绑定可信节点和环境模板',AI_DEVELOPMENT_QUEUE_UNAVAILABLE:'环境任务队列暂不可用',AI_DEVELOPMENT_WORKER_OFFLINE:'环境配置执行器尚未连接',AI_DEVELOPMENT_PAUSED:'环境配置已暂停',AI_DEVELOPMENT_MACHINE_OFFLINE:'目标机器当前离线',AI_DEVELOPMENT_READ_ONLY:'这台机器为只读设备',AI_DEVELOPMENT_TARGET_CHANGED:'机器或模板已改变，请刷新后重新检查',AI_DEVELOPMENT_AUTHORIZATION_CHANGED:'此任务的认证上下文已改变，结果需重新核实',AI_DEVELOPMENT_EXPIRED:'任务已超时，结果需重新核实'};
const reasonText=(value:string)=>reasons[value]??value;
const quota=(n:unknown)=>present(n)?`${number(n)}%`:'供应商未提供';
const states:Record<string,string>={blocked:'未派发',queued:'等待节点',running:'执行中',succeeded:'节点核验通过',failed:'执行未通过',unknown:'结果待核实'};
const present=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const pct=(n:unknown)=>present(n)?`${number(n)}%`:'未采样';
const tokens=(n:unknown)=>present(n)?n.toLocaleString():'未提供';
const gib=(bytes:unknown,gb?:unknown)=>present(bytes)?`${number(bytes/1024**3)} GiB`:present(gb)?`${number(gb)} GiB`:'未采样';
const aborted=(e:unknown)=>e instanceof DOMException&&e.name==='AbortError';

/** One shared console in operations, also embedded in the existing machine detail. */
export default function AiDevelopmentPanel({machines,machineId,navigate}:{machines:RecordItem[];machineId?:string;navigate:(route:string)=>void}){
 const [cap,setCap]=useState<Capabilities|null>(null),[error,setError]=useState(''),[selected,setSelected]=useState(machineId??'');
 const request=usePrivateRuntime(()=>{setCap(null);setError('');setSelected('')});
 useEffect(()=>{let alive=true;const load=async()=>{try{const value=await request<Capabilities>(base+'/capabilities');if(alive){setCap(value);setError('')}}catch(e){if(alive&&!aborted(e))setError(e instanceof Error?e.message:'环境能力读取失败')}};void load();const timer=setInterval(()=>void load(),10000);return()=>{alive=false;clearInterval(timer)}},[]);
 useEffect(()=>{if(machineId)setSelected(machineId);else if(!selected){const known=machines.find(m=>!m.readOnly&&cap?.nodes.some(n=>n.machineId===m.id)&&m.revision);if(known)setSelected(known.id)}},[machineId,cap?.configured,machines.length]);
 const id=machineId??selected;
 return <section className="ai-development-console" aria-label="AI开发环境">
  <div className="ai-development-title"><div><h3>AI 开发环境</h3><p>把终端工具、模型通道和机器状态接入日常运维。</p></div><Tag tone={cap?.controllerOnline?'complete':''}>{cap?.controllerOnline?'配置节点已连接':'等待配置节点'}</Tag></div>
  {error&&<p role="alert" className="ai-development-error">{error}</p>}
  {!machineId&&<label className="ai-development-selector">目标机器<select aria-label="AI开发环境目标机器" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">选择机器</option>{machines.map(m=><option key={m.id} value={m.id}>{m.name}{m.readOnly?' · 只读':''}</option>)}</select></label>}
  {cap?.reason&&<Note>{reasonText(cap.reason)}</Note>}
  {id?<AiMachineEnvironment key={id} machineId={id} capabilities={cap} navigate={navigate}/>:<Empty title="选择一台机器查看开发环境" detail="已接入运维的机器可以使用固定模板配置，尚未连接的机器会显示所缺条件。"/>}
 </section>;
}

function AiMachineEnvironment({machineId,capabilities,navigate}:{machineId:string;capabilities:Capabilities|null;navigate:(route:string)=>void}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[profileId,setProfileId]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const request=usePrivateRuntime(()=>{setSnapshot(null);setError('');setBusy(false);setNotice('')});
 const serial=useRef(0);
 const load=async()=>{const order=++serial.current;const value=await request<Snapshot>(base+'/machines/'+encodeURIComponent(machineId));if(order!==serial.current)return;setSnapshot(value);setProfileId(current=>value.profiles.some(p=>p.id===current)?current:value.profiles[0]?.id??'');setError('')};
 useEffect(()=>{let alive=true;const refresh=async()=>{const order=++serial.current;try{const value=await request<Snapshot>(base+'/machines/'+encodeURIComponent(machineId));if(alive&&order===serial.current){setSnapshot(value);setProfileId(current=>value.profiles.some(p=>p.id===current)?current:value.profiles[0]?.id??'');setError('')}}catch(e){if(alive&&!aborted(e))setError(e instanceof Error?e.message:'机器环境读取失败')}};void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>{alive=false;clearInterval(timer)}},[machineId]);
 const profile=snapshot?.profiles.find(p=>p.id===profileId),observation=snapshot?.observation,inventory=observation?.inventory;
 const fresh=!!observation&&!observation.stale;
 const pending=snapshot?.jobs.some(j=>['queued','running'].includes(j.status));
 const blocked=!snapshot||snapshot.blocked||!capabilities?.controllerOnline||!profile||busy||pending;
 async function act(action:'probe'|'configure'|'telemetry'){
  if(!snapshot||!profile||blocked)return;setBusy(true);setError('');setNotice('');
  try{const result=await request<Job>(base+'/jobs','POST',{commandId:crypto.randomUUID(),machineId,action,profileId:profile.id,expectedMachineVersion:snapshot.machineRevision,expectedProfileRevision:profile.revision});setNotice(result.status==='blocked'?(result.reason?reasonText(result.reason):'节点尚未满足配置条件'):result.status==='succeeded'?'节点已返回核验结果。':`${actions[action]}已派发，等待节点回执。`);await load()}
  catch(e){if(!aborted(e))setError(e instanceof Error?e.message:'操作未完成')}
  finally{setBusy(false)}
 }
 const resources=snapshot?.resources,resourceFresh=!!snapshot?.resourcesObservedAt&&!snapshot.resourcesStale,session=inventory?.terminalTelemetry;
 return <div className="ai-development-stack">
  {error&&<p role="alert" className="ai-development-error">{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  {snapshot?.reason&&<Note>{reasonText(snapshot.reason)}</Note>}
  <Panel title="标准配置" actions={<Tag>{profile?`模板修订 ${profile.revision}`:'未绑定模板'}</Tag>}>
   {snapshot?.profiles.length?<><label className="ai-development-selector">环境模板<select aria-label="AI环境模板" value={profileId} disabled={busy||pending} onChange={e=>setProfileId(e.target.value)}>{snapshot.profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    {profile&&<p className="ai-development-pins">{profile.tools.map(t=>`${t.name} ${t.version}`).join(' · ')}</p>}
    <p>安装或补齐工具，接入已配置的模型通道，并启用对话底部状态栏。现有默认通道与权限设置会保留。</p>
   </>:<p>这台机器尚未绑定开发环境模板。</p>}
   <div className="op-actions"><Button disabled={!!blocked} onClick={()=>void act('configure')}>一键配置开发环境</Button><Button kind="ghost" disabled={!!blocked} onClick={()=>void act('probe')}>检查环境</Button><Button kind="ghost" disabled={!!blocked} onClick={()=>void act('telemetry')}>刷新终端状态</Button></div>
   <small>新机器完成可信节点接入后，可复用此模板；配置结果以节点核验回执为准。</small>
  </Panel>
  <Panel title="已观察的开发环境" actions={<Tag tone={fresh?'complete':''}>{observation?fresh?'近期节点观察':'观察已过期':'尚未采集'}</Tag>}>
   {observation&&<p className="ai-development-stamp">采集时间：{dateTime(observation.at)}</p>}
   {inventory?<><div className="op-table-wrap"><table className="op-table"><thead><tr><th>工具</th><th>实际版本</th><th>模板核对</th></tr></thead><tbody>{inventory.tools.map(t=><tr key={t.name}><td>{t.name}</td><td>{t.installed?t.version??'版本未提供':'未安装'}</td><td>{!profile?.tools.some(pin=>pin.name===(t.name==='ccswitch'?'cc-switch':t.name))?'模板未指定':t.matchesPinned===true?'符合':t.matchesPinned===false?'需要调整':'未核对'}</td></tr>)}</tbody></table></div>
    <KV items={[["对话状态栏",inventory.statusline?.configured?'已配置':'尚未配置'],['机器资源显示',inventory.statusline?.configured&&inventory.statusline.resources?'已启用':'未核实']]}/>
   </>:<Empty title="还没有工具盘点回执" detail="点击检查环境后，版本、模型通道与状态栏配置会保存到本机运维记录。"/>}
  </Panel>
  <Panel title="模型通道"><div className="ai-development-providers">{inventory?.providers.map(p=><article key={p.id}><div className="op-row between"><strong>{p.name}</strong>{p.current&&<Tag>默认通道</Tag>}</div><p>{p.model||'模型未提供'}</p><small>{p.credentialConfigured?'凭据已配置':'凭据待配置'}</small></article>)}</div>{!inventory?.providers.length&&<p>模型通道尚未采集。</p>}<Note>配置存在与模型实际调用分别核验；这里不展示凭据。</Note></Panel>
  <div className="ai-development-grid"><Panel title="机器资源">{snapshot?.resourcesObservedAt&&<small>资源采样：{dateTime(snapshot.resourcesObservedAt)}</small>}<KV items={[["CPU",resourceFresh?pct(resources?.cpuPercent):'等待近期采样'],['内存占用',resourceFresh?gib(resources?.ramUsedBytes,resources?.memoryUsedGB):'等待近期采样'],['内存总量',resourceFresh?gib(resources?.ramTotalBytes,resources?.memoryTotalGB):'等待近期采样'],['磁盘可用',resourceFresh?gib(resources?.diskFreeBytes,resources?.diskFreeGB):'等待近期采样'],['一分钟负载',resourceFresh&&present(resources?.load1m)?number(resources.load1m):'未采样']]}/></Panel>
   <Panel title="最近终端状态"><KV items={[["观察时间",session?.observedAt?dateTime(session.observedAt):'尚未收到状态栏采样'],['通道 / 模型',[session?.provider,session?.model].filter(Boolean).join(' / ')||'未提供'],['当前上下文',`${tokens(session?.contextTokens)} / ${tokens(session?.contextWindow)}`],['最近响应输入 / 输出',`${tokens(session?.currentInputTokens)} / ${tokens(session?.currentOutputTokens)}`],['本会话费用估算',session?.billingStatus==='estimated'&&present(session.sessionCostUSD)?`USD ${session.sessionCostUSD.toFixed(4)}（CLI估算）`:'未提供'],['五小时 / 七天额度用量',`${quota(session?.rateLimitFiveHourPercent)} / ${quota(session?.rateLimitSevenDayPercent)}`]]}/><Note>上下文和最近响应 Token 不作为累计账单；供应商未返回的额度保持未知。</Note><Button kind="ghost" onClick={()=>navigate('operations/usage')}>查看实际用量账本</Button></Panel></div>
  <Panel title="环境运维记录">{snapshot?.jobs.length?<div className="ai-development-history">{snapshot.jobs.map(j=><article key={j.id}><div className="op-row between"><strong>{actions[j.action]??j.action}</strong><Tag tone={j.status==='succeeded'?'complete':j.status==='failed'?'failed':''}>{states[j.status]??'待核实'}</Tag></div><small>{dateTime(j.createdAt)}</small>{(j.reason||j.result?.summary)&&<p>{j.reason?reasonText(j.reason):j.result?.summary}</p>}</article>)}</div>:<p>暂无环境配置记录。</p>}</Panel>
 </div>;
}
