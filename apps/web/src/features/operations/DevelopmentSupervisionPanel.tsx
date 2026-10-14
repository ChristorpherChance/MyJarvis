import {useEffect,useState} from 'react';
import {v1Request} from '../../v1-client';
import {type Props,type FormSpec,Panel,Button,Note,Empty,Tag,Status,FormDialog,machineName,exportText} from './common';

export function DevelopmentSupervisionPanel({data,navigate}:Pick<Props,'data'|'navigate'>){
 const [state,setState]=useState<any>(null),[config,setConfig]=useState<any>(null),[error,setError]=useState(''),[form,setForm]=useState<FormSpec|null>(null),[selected,setSelected]=useState('');
 async function load(){const [a,b]=await Promise.all([v1Request<any>('/api/v1/execution/supervision'),v1Request<any>('/api/v1/execution/config')]);return {state:a.data,config:b.data}}
 useEffect(()=>{let disposed=false;const update=async()=>{try{const next=await load();if(!disposed){setState(next.state);setConfig(next.config);setError('')}}catch(e){if(!disposed)setError(e instanceof Error?e.message:'监督状态读取失败')}};void update();const timer=setInterval(()=>void update(),5000);return()=>{disposed=true;clearInterval(timer)}},[]);
 const native=(config?.templates??[]).filter((t:any)=>['codex','claude'].includes(t.engine)),key=(t:any)=>JSON.stringify([t.machineId,t.id]),template=native.find((t:any)=>key(t)===selected)??native[0];
 function configure(){if(!template)return;const frozen=structuredClone(config),t=structuredClone(template),p=t.supervision;
  const fallbacks=native.filter((other:any)=>other.id!==t.id&&other.machineId===t.machineId&&other.workspaceRoot===t.workspaceRoot);
  setForm({title:'持续开发策略',description:'保存后需同步该机器的节点配置。仅推进已登记目标；达到边界停止。',fields:[
   {key:'billing',label:'用量方式',type:'select',options:[['subscription','订阅账号 · 按轮次与 Token 限制'],['priced','API 计费 · 未定价暂停续轮']]},
   {key:'maxRounds',label:'每次最多轮数',type:'number',required:true,min:1,max:50},{key:'maxTokens',label:'整个任务 Token 边界',type:'number',required:true,min:1000,max:10000000,hint:'每轮结束检查，可能超出一轮用量；不是实时硬限额'},
   {key:'maxRecoveryAttempts',label:'连续自动恢复次数',type:'number',required:true,min:0,max:8},{key:'retryDelaySec',label:'额度或网络受限后等待（秒）',type:'number',required:true,min:60,max:86400},
   {key:'repairValidation',label:'固定测试失败后继续修复',type:'checkbox'},
   {key:'fallback',label:'额度受限时的备选执行器',type:'select',options:[['','等待原执行器恢复'],...fallbacks.map((other:any)=>[other.id,`${other.id} · ${other.engine}`] as [string,string])]},
   {key:'inputRate',label:'输入每百万 Token（USD，可空）',type:'number' as const,min:0,max:1000,hint:'网关未返回可靠价格时，用于完整用量估算；输入含缓存，不是供应商账单'},
   {key:'outputRate',label:'输出每百万 Token（USD，可空）',type:'number' as const,min:0,max:1000}
  ],initial:{billing:p?.billing??'subscription',maxRounds:t.maxRounds,maxTokens:p?.maxTokens??500000,maxRecoveryAttempts:p?.maxRecoveryAttempts??3,retryDelaySec:p?.retryDelaySec??900,repairValidation:p?.repairValidation??true,fallback:p?.fallbackExecutorIds?.[0]??'',inputRate:p?.inputUSDPerMillion??'',outputRate:p?.outputUSDPerMillion??''},submit:async v=>{
   const hasInput=v.inputRate!==''&&v.inputRate!==undefined,hasOutput=v.outputRate!==''&&v.outputRate!==undefined;if(hasInput!==hasOutput)throw Error('输入和输出价格需同时填写或同时留空');
   const supervision={billing:v.billing,maxTokens:Number(v.maxTokens),maxRecoveryAttempts:Number(v.maxRecoveryAttempts),retryDelaySec:Number(v.retryDelaySec),repairValidation:v.repairValidation===true,fallbackExecutorIds:v.fallback?[v.fallback]:[],...(hasInput?{inputUSDPerMillion:Number(v.inputRate),outputUSDPerMillion:Number(v.outputRate)}:{})};
   await v1Request('/api/v1/execution/config',{method:'PUT',body:JSON.stringify({expectedVersion:frozen.revision,templates:frozen.templates.map((other:any)=>other.id===t.id&&other.machineId===t.machineId?{...other,maxRounds:Number(v.maxRounds),supervision}:other),probes:frozen.probes,wol:frozen.wol})});
   const next=await load();setConfig(next.config);setState(next.state);
  }})
 }
 const tasks=state?.tasks??[],active=tasks.filter((t:any)=>t.status==='running'||t.recovery?.automatic&&t.status==='waitingQuota');
 return <><Panel title="持续开发" actions={<Tag>{state?.stopped?'已急停':state?.supervised?'监督开启':'监督暂停'}</Tag>}>
  {error&&<Note tone="warn">{error}</Note>}
  <div className="op-row"><span>{native.length} 个原生执行器</span><span>{active.length} 项推进或等待恢复</span><Button kind="ghost" onClick={()=>navigate('settings')}>节点接入</Button><a className="op-link" href="/downloads/jarvis-development-node.zip" download>下载接入包</a></div>
  {!native.length?<Empty title="等待开发机器接入" detail="先登记设备和项目副本，再配置 Codex / Claude 节点。现有电脑会话可观察；持续执行使用项目专属会话。"/>:<div className="op-actions"><select aria-label="开发执行器" value={template?key(template):''} onChange={e=>setSelected(e.target.value)}>{native.map((t:any)=><option key={key(t)} value={key(t)}>{t.id} · {machineName(data,t.machineId)}</option>)}</select><Button onClick={configure}>持续策略</Button><Button kind="ghost" onClick={()=>exportText('开发节点执行器.json',JSON.stringify({templates:config.templates.filter((t:any)=>t.machineId===template.machineId)},null,2))}>导出节点模板</Button></div>}
  {tasks.length>0&&<div className="op-table-wrap"><table className="op-table"><thead><tr><th>任务 / 执行器</th><th>进度状态</th><th>恢复计划</th><th>Token 边界</th></tr></thead><tbody>{tasks.map((t:any)=><tr key={t.taskId}><td><button className="op-link" onClick={()=>navigate('tasks/'+t.taskId)}>{t.title}</button><br/><small>{machineName(data,t.machineId)} · {t.executorId}</small></td><td><Status value={t.status}/><br/><small>{t.ready?'节点已连接':'等待节点'} · {new Date(t.lastActivityAt).toLocaleTimeString('zh-CN')}</small></td><td>{t.status==='waitingQuota'&&t.recovery?.automatic?`${t.recovery.nextExecutorId?'切换至 '+t.recovery.nextExecutorId:'等待原执行器'} · ${new Date(t.recovery.retryAt).toLocaleTimeString('zh-CN')}`:t.status==='waitingUser'?'需要处理':t.status==='validating'?'等待独立验收':'按任务目标推进'}{t.recovery&&<small>连续恢复 {t.recovery.attempts} 次</small>}</td><td>{t.tokensUsed.toLocaleString()} / {t.tokenLimit?.toLocaleString()??'未配置'}<br/><small>{t.billing==='subscription'?'订阅边界':'计费边界'}</small></td></tr>)}</tbody></table></div>}
  <Note>同目录续接 → 固定测试 → 失败修复 → 待验收。额度受限可有限恢复；登录、权限及未知错误需要处理。</Note>
 </Panel>{form&&<FormDialog spec={form} onClose={()=>setForm(null)}/>}</>;
}
