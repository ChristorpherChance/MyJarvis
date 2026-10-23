import {useEffect,useRef,useState} from 'react';
import {Empty,Note,Panel,Tag,type RecordItem} from './common';
import {dateTime} from './infrastructure-widgets';
import {usePrivateRuntime} from './usePrivateRuntime';
import './ai-development.css';

type Profile={id:string;revision:number;profileHash:string;name:string};
type PreviewMode='supplement'|'reconcile';
type ItemStatus='match'|'missing'|'different'|'unknown'|'invalid'|'unreadable'|'not-applicable'|'unmanaged';
type PreviewItem={category:'tool'|'provider'|'statusline';key:string;status:ItemStatus;reason:string;intent:'none'|'supplement'|'adjust'|'verify'|'preserve';expected:string|null;observed:string|null};
type Preview={schemaVersion:1;comparisonVersion:1;mode:PreviewMode;readOnly:true;applySupported:false;machineId:string;machineRevision:number;profile:{id:string;revision:number;hash:string};policyHash:string;basisHash:string;observation:null|{at:string;source:string;hash:string;stale:boolean;binding:'machine-revision-verified'|'machine-revision-unverified'};status:'available'|'reference-only'|'unavailable';reason:string|null;items:PreviewItem[];preserved:string[];notCompared:string[]};
type NotCompared='role-models'|'compression-policy'|'credential-values'|'terminal-rendering';
const notComparedText:Record<NotCompared,string>={'role-models':'角色模型映射','compression-policy':'压缩策略','credential-values':'凭据内容','terminal-rendering':'终端实际渲染结果'};
const statusText:Record<ItemStatus,string>={match:'一致',missing:'缺失',different:'不同',unknown:'未知',invalid:'无效',unreadable:'不可读取','not-applicable':'不适用',unmanaged:'未纳管'};
const categoryText={tool:'工具',provider:'供应商 / 通道',statusline:'状态栏'};
const intentText={none:'无需处理',supplement:'仅供补充参考',adjust:'仅供调整参考',verify:'需要核验',preserve:'保留现状'};
const reasonText:Record<string,string>={AI_DEVELOPMENT_NOT_CONFIGURED:'机器或模板未完成受信绑定',AI_DEVELOPMENT_READ_ONLY:'该机器为只读设备',AI_DEVELOPMENT_TARGET_CHANGED:'机器或模板版本已变化，请刷新后重新选择',AI_DEVELOPMENT_VERSION_CHANGED:'预期版本不匹配，请重新读取',AI_DEVELOPMENT_AUTHORIZATION_CHANGED:'绑定授权已变化，无法确认此观察',AI_DEVELOPMENT_OBSERVATION_UNAVAILABLE:'没有可用的近期观察',AI_DEVELOPMENT_OBSERVATION_STALE:'观察已过期',AI_DEVELOPMENT_OBSERVATION_UNBOUND:'观察未绑定当前机器修订',AI_DEVELOPMENT_POLICY_CHANGED:'策略已变化，比较依据已失效',AI_DEVELOPMENT_CONTROLLER_OFFLINE:'配置节点当前离线',AI_DEVELOPMENT_PREVIEW_UNAVAILABLE:'当前条件下无法生成预览',OBSERVATION_UNAVAILABLE:'没有可用观察；不把缺失推断为配置缺失',OBSERVATION_STALE:'观察已过期，仅供参考',MACHINE_REVISION_UNVERIFIED:'观察未绑定可核验的机器修订；仅供参考',AMBIGUOUS_TOOL:'工具标识重复或存在歧义',TOOL_NOT_OBSERVED:'观察没有提供此工具',TOOL_NOT_INSTALLED:'观察报告工具未安装',TOOL_VERSION_UNKNOWN:'工具版本未知',TOOL_VERSION_MATCH:'工具版本一致',TOOL_VERSION_DIFFERENT:'工具版本不同',EXTRA_TOOL_PRESERVED:'模板之外的工具保留',PROVIDER_ID_NAME_CONFLICT:'供应商标识或名称冲突',PROVIDER_NOT_OBSERVED:'观察没有提供此供应商',PROVIDER_MODEL_UNKNOWN:'供应商模型字段未知',PROVIDER_MODEL_MATCH:'供应商模型一致',PROVIDER_MODEL_DIFFERENT:'供应商模型不同',EXTRA_PROVIDER_PRESERVED:'额外供应商保留',STATUSLINE_NOT_OBSERVED:'没有状态栏分层观察',STATUSLINE_ZERO_PROVIDERS:'没有可比较的供应商项目，不能推断为一致',OBSERVATION_NOT_CURRENT:'观察不能确认为当前机器修订',STATUSLINE_LAYER_MATCH:'该状态栏分层与观察目标一致',STATUSLINE_LAYER_MISSING:'该状态栏分层未找到',STATUSLINE_LAYER_DIFFERENT:'该状态栏分层与目标不同',STATUSLINE_LAYER_UNKNOWN:'该状态栏分层未知',STATUSLINE_LAYER_INVALID:'该状态栏分层格式无效',STATUSLINE_LAYER_UNREADABLE:'该状态栏分层不可读取',STATUSLINE_LAYER_NOT_APPLICABLE:'该状态栏分层不适用',STATUSLINE_PROVIDER_AGGREGATE:'供应商比较结果为安全汇总，不包含配置原文'};
const statusTone=(s:ItemStatus)=>s==='match'?'complete':s==='missing'||s==='different'||s==='invalid'?'failed':s==='unmanaged'?'':'queued';
const aborted=(e:unknown)=>e instanceof DOMException&&e.name==='AbortError';
export default function AiDevelopmentPreviewPanel({machine,machineId,profiles}:{machine?:RecordItem;machineId:string;profiles:Profile[]}){
 const [profileId,setProfileId]=useState(''),[mode,setMode]=useState<PreviewMode>('supplement'),[preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const serial=useRef(0),selectionKey=useRef('');
 const request=usePrivateRuntime(()=>{serial.current++;setPreview(null);setError('');setLoading(false)});
 const selected=profiles.find(p=>p.id===profileId),revision=Number(machine?.revision);
 const selectedKey=`${machineId}:${Number.isSafeInteger(revision)?revision:'invalid'}:${profiles.map(p=>`${p.id}:${p.revision}:${p.profileHash}`).join('|')}`;
 if(selectionKey.current!==selectedKey){selectionKey.current=selectedKey;serial.current++;}
 const resetAndSetProfile=(value:string)=>{serial.current++;setPreview(null);setError('');setLoading(false);setProfileId(value)};
 const resetAndSetMode=(value:PreviewMode)=>{serial.current++;setPreview(null);setError('');setLoading(false);setMode(value)};
 useEffect(()=>{if(!profiles.some(p=>p.id===profileId)){serial.current++;setPreview(null);setError('');setLoading(false);setProfileId(profiles[0]?.id??'')}},[profiles,profileId,machineId]);
 useEffect(()=>{serial.current++;setPreview(null);setError('');setLoading(false);return()=>{serial.current++}},[machineId,revision,selected?.id,selected?.revision,selected?.profileHash]);
 const run=async()=>{
  const order=++serial.current;setPreview(null);setError('');
  if(!selected||!Number.isSafeInteger(revision)||revision<1){setError('缺少有效的机器修订或环境模板，暂不能请求预览。');return}
  setLoading(true);
  const query=new URLSearchParams({profileId:selected.id,expectedMachineVersion:String(revision),expectedProfileRevision:String(selected.revision),expectedProfileHash:selected.profileHash,mode});
  try{const result=await request<Preview>(`/api/runtime/ai-development/machines/${encodeURIComponent(machineId)}/preview?${query}`);if(order===serial.current)setPreview(result)}catch(e){if(order===serial.current&&!aborted(e))setError(e instanceof Error?e.message:'差异预览读取失败')}finally{if(order===serial.current)setLoading(false)}
 };
 const reasons=preview?.reason?reasonText[preview.reason]??'服务端报告当前预览受限':null;
 const preservedText:Record<string,string>={credentials:'凭据', 'current-provider':'当前供应商 / 通道','extra-providers':'额外供应商','hooks':'Hooks','permissions':'权限'};
 return <div className="ai-development-stack ai-preview" aria-label="AI配置只读差异预览">
  <Panel title="只读差异预览" actions={<Tag>只读 · 不支持应用</Tag>}>
   <Note>此视图只发送安全 GET，不派发配置、不修改节点、不调用模型。管理环境详情、任务与 CC Switch 轮询在此模式下不会挂载。</Note>
   <div className="ai-preview-controls">
    <label>环境模板<select aria-label="预览环境模板" value={profileId} onChange={e=>resetAndSetProfile(e.target.value)} disabled={!profiles.length}><option value="">选择模板</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.name} · 修订 {p.revision}</option>)}</select></label>
    <label>比较方式<select aria-label="预览比较方式" value={mode} onChange={e=>resetAndSetMode(e.target.value as PreviewMode)}><option value="supplement">补充建议</option><option value="reconcile">差异收敛参考</option></select></label>
    <button type="button" className="button d-btn primary" onClick={()=>void run()} disabled={loading||!selected||!Number.isSafeInteger(revision)||revision<1}>{loading?'读取中…':'生成预览'}</button>
   </div>
   {machine?.readOnly===true&&<Note tone="warn">该机器标记为只读。预览不会授予控制权，也不会产生配置动作。</Note>}
   {!profiles.length&&<Note tone="warn">该机器没有绑定可预览的环境模板；不能请求跨机器或未授权模板的比较。</Note>}
   {error&&<p role="alert" className="ai-development-error">{error}</p>}
   {loading&&<p role="status">正在读取只读比较结果…</p>}
  </Panel>
  {preview&&<>
   <Panel title="比较依据" actions={<Tag tone={preview.status==='available'?'complete':preview.status==='reference-only'?'queued':'failed'}>{preview.status==='available'?'可用':preview.status==='reference-only'?'仅供参考':'不可用'}</Tag>}>
    <dl className="ai-preview-facts"><div><dt>机器修订</dt><dd>{preview.machineRevision}</dd></div><div><dt>模板</dt><dd>{preview.profile.id} · 修订 {preview.profile.revision}</dd></div><div><dt>比较模式</dt><dd>{preview.mode==='supplement'?'补充建议':'差异收敛参考'}</dd></div><div><dt>观察时间</dt><dd>{preview.observation?dateTime(preview.observation.at):'无可用观察'}</dd></div><div><dt>观察绑定</dt><dd>{preview.observation?.binding==='machine-revision-verified'?'机器修订已核验':preview.observation?'机器修订未核验':'无观察'}</dd></div><div><dt>模板指纹</dt><dd><code>{preview.profile.hash}</code></dd></div><div><dt>比较依据指纹</dt><dd><code>{preview.basisHash}</code></dd></div><div><dt>观察摘要指纹</dt><dd>{preview.observation?<code>{preview.observation.hash}</code>:'无观察指纹'}</dd></div></dl>
    {reasons&&<Note tone="warn">{reasons}（{preview.reason}）</Note>}
    {preview.observation?.stale&&<Note tone="warn">此观察已过期，仅可作参考，不代表当前配置。</Note>}
    <p className="ai-preview-hash-note">这些摘要指纹仅用于识别本次比较依据，不是执行凭证或配置计划。预览不保证未来 configure 的行为，也不能证明终端实际渲染结果。界面不展示配置原文、凭据、命令或路径。</p>
   </Panel>
   <Panel title="逐项比较">
    {preview.items.length?<div className="op-table-wrap"><table className="op-table ai-preview-table"><thead><tr><th>类别</th><th>项目</th><th>状态</th><th>理由</th><th>意图</th><th>模板期望</th><th>观察结果</th></tr></thead><tbody>{preview.items.map((item,index)=><tr key={`${item.category}:${item.key}:${index}`}><td>{categoryText[item.category]}</td><td>{item.key}</td><td><Tag tone={statusTone(item.status)}>{statusText[item.status]}</Tag></td><td>{reasonText[item.reason]??item.reason}</td><td>{intentText[item.intent]}</td><td>{item.expected??'未提供'}</td><td>{item.observed??'未观测'}</td></tr>)}</tbody></table></div>:<Empty title="没有可比较项目" detail="空结果不代表配置完全一致；请结合观察和不比较范围判断。"/>}
   </Panel>
   <Panel title="明确保留与未比较范围">
    <h4>始终保留，不纳入模板写入</h4><ul>{preview.preserved.map(x=><li key={x}>{preservedText[x]??x}</li>)}</ul>
    <h4>本次没有比较</h4><ul>{preview.notCompared.map(x=><li key={x}>{notComparedText[x as NotCompared]??x}</li>)}</ul>
    <Note>预览默认不自动提交任何写入。这里没有“应用”操作；后续配置能力需单独设计和授权。</Note>
   </Panel>
  </>}
 </div>;
}
