import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button,Dialog,Empty,KV,Note,Panel,Tag} from './common';
import {dateTime} from './infrastructure-widgets';
import {usePrivateRuntime} from './usePrivateRuntime';
import './cc-switch.css';

type Machine={id:string;name:string;address:string;host:'101'|'112'|'116'};
type Models={opus:string;sonnet:string;haiku:string;fable:string;subagent:string};
type Provider={id:string;name:string;baseUrl:string;model:string;models:Models;authType:'auth-token'|'api-key';credentialConfigured:boolean;isCurrent:boolean;revision:string};
type Snapshot={machineId:string;host:string;application:'claude';observedAt:string;currentProviderId:string|null;providers:Provider[]};
type Form={id?:string;revision?:string;name:string;baseUrl:string;model:string;models:Models;authType:Provider['authType'];apiKey:string;commandId:string};
const base='/api/runtime/cc-switch';
const roleNames:[keyof Models,string][]=[['opus','Opus'],['sonnet','Sonnet'],['haiku','Haiku'],['fable','Fable'],['subagent','子代理']];
const blankModels=():Models=>({opus:'',sonnet:'',haiku:'',fable:'',subagent:''});
const interrupted=(e:unknown)=>e instanceof DOMException&&e.name==='AbortError';
const denied=(e:unknown)=>[401,403].includes((e as {status?:number})?.status??0);
const conflict=(e:unknown)=>(e as {status?:number})?.status===409;
const problem=(e:unknown)=>conflict(e)?'配置已在其他终端或页面改变。请刷新，核对最新配置后再操作。':(e as {name?:string})?.name==='TimeoutError'?'请求超时，尚未确认操作结果。请刷新目标机器核对。':e instanceof Error?e.message:'目标机器暂时不可用，请稍后重试。';

/** Read from each machine's live CC Switch, independent of environment-template availability. */
export default function CcSwitchPanel({machineId}:{machineId?:string}){
 const [machines,setMachines]=useState<Machine[]>([]),[configured,setConfigured]=useState<boolean|null>(null),[selected,setSelected]=useState(''),[listLoading,setListLoading]=useState(true),[listError,setListError]=useState(''),[accessDenied,setAccessDenied]=useState(false),[machineBusy,setMachineBusy]=useState(false);
 const inventoryFlight=useRef(0);
 const request=usePrivateRuntime(()=>{inventoryFlight.current++;setMachines([]);setConfigured(null);setSelected('');setListLoading(false);setListError('');setAccessDenied(true);setMachineBusy(false)});
 async function loadMachines(){const order=++inventoryFlight.current;setListLoading(true);setListError('');try{const value=await request<{machines:Machine[];configured:boolean}>(base+'/machines');if(order!==inventoryFlight.current)return;setAccessDenied(false);setMachines(value.machines);setConfigured(value.configured);setSelected(current=>value.machines.some(m=>m.id===current)?current:value.machines.find(m=>m.host==='112')?.id??value.machines[0]?.id??'')}catch(e){if(order===inventoryFlight.current&&!interrupted(e)&&!denied(e))setListError(problem(e))}finally{if(order===inventoryFlight.current)setListLoading(false)}}
 useEffect(()=>{void loadMachines();return()=>{inventoryFlight.current++}},[]);
 const target=machines.find(m=>m.id===(machineId??selected));
 return <section className="cc-switch-console" aria-label="终端模型管理">
  <div className="cc-switch-heading"><div><h3>终端模型管理</h3><p>在贾维斯管理各台机器的 Claude Code 与 CC Switch 配置。</p></div><Tag>Claude Code</Tag></div>
  {accessDenied?<Note>请使用有权限的账号登录后查看模型配置。</Note>:<>
   {listError&&<div className="cc-switch-error" role="alert"><p>{listError}</p><Button kind="ghost" onClick={()=>void loadMachines()}>重新连接</Button></div>}
   {listLoading&&<p role="status">正在读取可管理的机器…</p>}
   {!listLoading&&configured===false&&<Empty title="模型管理连接尚未配置" detail="连接配置完成后，可以在此读取三台机器的实际配置。"><Button kind="ghost" onClick={()=>void loadMachines()}>重新检查</Button></Empty>}
   {!listLoading&&configured!==false&&!machines.length&&!listError&&<Empty title="尚无可管理的机器"><Button kind="ghost" onClick={()=>void loadMachines()}>重新检查</Button></Empty>}
   {!machineId&&machines.length>0&&<MachinePicker machines={machines} selected={selected} onChange={setSelected} disabled={machineBusy}/>}
   {target?<MachineProviders key={target.id} machine={target} onBusyChange={setMachineBusy}/>:!listLoading&&machineId&&configured!==false&&<Empty title="此机器尚未接入终端模型管理" detail="当前管理范围为 101、112、116。"/>}
  </>}
 </section>;
}

function MachinePicker({machines,selected,onChange,disabled}:{machines:Machine[];selected:string;onChange:(id:string)=>void;disabled:boolean}){
 return <div className="cc-switch-machines" role="group" aria-label="模型配置目标机器">{machines.map(machine=><button type="button" key={machine.id} disabled={disabled} aria-pressed={selected===machine.id} className={selected===machine.id?'selected':''} onClick={()=>onChange(machine.id)}><strong>{machine.host}</strong><span>{machine.name}</span><small>{machine.address}</small></button>)}</div>;
}

function MachineProviders({machine,onBusyChange}:{machine:Machine;onBusyChange:(busy:boolean)=>void}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[form,setForm]=useState<Form|null>(null),[deleting,setDeleting]=useState<Provider|null>(null),[accessDenied,setAccessDenied]=useState(false);
 const flight=useRef(0),locked=useRef(false),active=useRef(true);
 const request=usePrivateRuntime(()=>{flight.current++;locked.current=false;setSnapshot(null);setForm(null);setDeleting(null);setError('');setNotice('');setBusy(false);onBusyChange(false);setLoading(false);setAccessDenied(true)});
 const endpoint=base+'/machines/'+encodeURIComponent(machine.id)+'/providers';
 function accept(value:Snapshot){if(value.machineId!==machine.id)throw new Error('目标机器回执不匹配，请刷新重试。');setSnapshot(value)}
 async function load(){if(locked.current)return;const order=++flight.current;setLoading(true);setError('');try{const value=await request<Snapshot>(endpoint);if(order===flight.current&&active.current){accept(value);setAccessDenied(false)}}catch(e){if(order===flight.current&&active.current&&!interrupted(e)&&!denied(e))setError(problem(e))}finally{if(order===flight.current&&active.current)setLoading(false)}}
 useEffect(()=>{active.current=true;void load();return()=>{active.current=false;flight.current++;onBusyChange(false)}},[machine.id]);
 const current=snapshot?.providers.find(provider=>provider.id===snapshot.currentProviderId||provider.isCurrent);
 const isCurrent=(provider:Provider)=>provider.isCurrent||snapshot?.currentProviderId===provider.id;
 async function mutate(path:string,method:string,body:unknown,message:string){
  if(locked.current||loading||accessDenied)return false;locked.current=true;flight.current++;setBusy(true);onBusyChange(true);setError('');setNotice('');
  try{const value=await request<Snapshot>(path,method,body);if(!active.current)return false;accept(value);setNotice(message);return true}
  catch(e){if(active.current&&!interrupted(e)&&!denied(e))setError(problem(e));return false}
  finally{locked.current=false;if(active.current){setBusy(false);onBusyChange(false)}}
 }
 function openForm(provider?:Provider){setError('');setForm({...(provider?{id:provider.id,revision:provider.revision}:{}),name:provider?.name??'',baseUrl:provider?.baseUrl??'',model:provider?.model??'',models:{...blankModels(),...provider?.models},authType:provider?.authType??'auth-token',apiKey:'',commandId:crypto.randomUUID()})}
 async function save(e:FormEvent){e.preventDefault();if(!form)return;const {name,baseUrl,model,models,authType,apiKey}=form;const provider={name:name.trim(),baseUrl:baseUrl.trim(),model:model.trim(),models:Object.fromEntries(Object.entries(models).map(([key,value])=>[key,value.trim()||model.trim()])),authType,...(apiKey.trim()?{apiKey:apiKey.trim()}:{})};const saved=await mutate(form.id?endpoint+'/'+encodeURIComponent(form.id):endpoint,form.id?'PATCH':'POST',form.id?{expectedRevision:form.revision,provider}:{commandId:form.commandId,provider},`已保存到 ${machine.host}。新开 Claude Code 会话后使用最新配置。`);if(saved)setForm(null)}
 if(accessDenied)return <Note>请重新登录后读取这台机器的模型配置。</Note>;
 return <div className="cc-switch-stack" aria-busy={busy||loading}>
  <div className="cc-switch-target"><div><strong>正在管理：{machine.host} · {machine.name}</strong><span>{machine.address}</span></div><div className="op-actions"><Button kind="ghost" disabled={busy||loading} onClick={()=>void load()}>{loading?'读取中…':'刷新'}</Button><Button disabled={busy||loading||!snapshot} onClick={()=>openForm()}>新增模型配置</Button></div></div>
  <Note>修改只影响 {machine.host} 这台机器。与本机终端 CC Switch 使用同一份配置；保存或切换后，新开 Claude Code 会话生效。API Key 仅在填写时提交，不回显已有密钥。</Note>
  {error&&<div className="cc-switch-error" role="alert"><p>{error}</p>{!form&&!deleting&&<Button kind="ghost" disabled={busy||loading} onClick={()=>void load()}>刷新并重试</Button>}</div>}
  {notice&&<p className="cc-switch-notice" role="status">{notice}</p>}
  {snapshot&&<Panel title="当前启用" actions={<Tag tone={current?'complete':''}>{current?'已读取本机配置':'未启用配置'}</Tag>}><KV items={[["供应商配置",current?.name??'尚未选择'],['主模型',current?.model??'尚未配置'],['API 地址',current?.baseUrl??'尚未配置'],['API Key',current?.credentialConfigured?'已配置':'未配置']]}/><small className="cc-switch-stamp">读取于 {dateTime(snapshot.observedAt)} · 配置状态与供应商实际可用性分别核验</small></Panel>}
  {!snapshot&&loading&&<p role="status">正在连接 {machine.host}，读取 CC Switch 配置…</p>}
  {snapshot?.providers.length===0&&<Empty title="这台机器还没有模型配置" detail="添加 API 地址、模型名称与 API Key 后，即可选择启用。"><Button disabled={busy||loading} onClick={()=>openForm()}>添加第一个模型配置</Button></Empty>}
  <div className="cc-switch-providers">{snapshot?.providers.map(provider=><article className={'cc-switch-provider '+(isCurrent(provider)?'current':'')} key={provider.id}><div className="cc-switch-provider-heading"><h4>{provider.name}</h4>{isCurrent(provider)&&<Tag tone="complete">当前启用</Tag>}</div><p className="cc-switch-model">{provider.model||'主模型未配置'}</p><p className="cc-switch-url">{provider.baseUrl||'API 地址未配置'}</p><div className="cc-switch-provider-meta"><span>{provider.credentialConfigured?'API Key 已配置':'API Key 未配置'}</span><span>{provider.authType==='api-key'?'API Key 认证':'Auth Token 认证'}</span></div><details><summary>角色模型</summary><dl className="cc-switch-role-list">{roleNames.map(([role,label])=><div key={role}><dt>{label}</dt><dd>{provider.models?.[role]||'跟随主模型'}</dd></div>)}</dl></details><div className="cc-switch-provider-actions"><Button disabled={busy||loading||isCurrent(provider)} kind={isCurrent(provider)?'ghost':'primary'} onClick={()=>void mutate(endpoint+'/'+encodeURIComponent(provider.id)+'/switch','POST',{expectedRevision:provider.revision},`已将 ${machine.host} 切换为 ${provider.name}。新开 Claude Code 会话后生效。`)}>{isCurrent(provider)?'已启用':'切换到此配置'}</Button><Button kind="ghost" disabled={busy||loading} onClick={()=>openForm(provider)}>编辑</Button><Button kind="ghost" className="cc-switch-delete" disabled={busy||loading||isCurrent(provider)} title={isCurrent(provider)?'当前启用的配置不能删除，请先切换到其他配置':`删除 ${machine.host} 的此项配置`} onClick={()=>{setError('');setDeleting(provider)}}>删除</Button></div>{isCurrent(provider)&&<small className="cc-switch-delete-hint">删除此项前，请先切换到其他配置。</small>}</article>)}</div>
  {form&&<Dialog title={`${form.id?'编辑':'新增'}模型配置 · ${machine.host}`} onClose={()=>{if(!locked.current){setForm(null);setError('')}}} wide><form className="cc-switch-form" autoComplete="off" onSubmit={e=>void save(e)}><p className="cc-switch-form-target">目标机器：<strong>{machine.host} · {machine.name}</strong></p><fieldset disabled={busy}><div className="cc-switch-fields"><label><span>配置名称 *</span><input aria-label="配置名称" required maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label><span>API 地址 *</span><input aria-label="API 地址" type="url" required placeholder="https://api.example.com" value={form.baseUrl} onChange={e=>setForm({...form,baseUrl:e.target.value})}/></label><label><span>主模型 *</span><input aria-label="主模型" required maxLength={200} placeholder="供应商提供的模型名称" value={form.model} onChange={e=>setForm({...form,model:e.target.value})}/></label><label><span>认证方式</span><select aria-label="认证方式" value={form.authType} onChange={e=>setForm({...form,authType:e.target.value as Provider['authType']})}><option value="auth-token">Auth Token</option><option value="api-key">API Key</option></select></label><label className="cc-switch-full"><span>API Key{form.id?'（留空保留已有密钥）':' *'}</span><input aria-label="API Key" type="password" autoComplete="off" spellCheck={false} autoCapitalize="none" required={!form.id} value={form.apiKey} onChange={e=>setForm({...form,apiKey:e.target.value})}/><small>{form.id?'已有密钥不会被读取到表单。只有填写新值才会替换。':'密钥写入所选机器的 CC Switch 配置。'}</small></label></div><details className="cc-switch-model-overrides"><summary>角色模型设置（可选）</summary><p>留空时跟随主模型；按供应商实际支持的模型名称填写。</p><div className="cc-switch-fields">{roleNames.map(([role,label])=><label key={role}><span>{label} 模型</span><input aria-label={`${label} 模型`} maxLength={200} placeholder="跟随主模型" value={form.models[role]} onChange={e=>setForm({...form,models:{...form.models,[role]:e.target.value}})}/></label>)}</div></details></fieldset>{error&&<p className="cc-switch-error" role="alert">{error}</p>}<div className="op-form-footer"><Button kind="ghost" disabled={busy} onClick={()=>{setForm(null);setError('')}}>取消</Button><Button type="submit" disabled={busy}>{busy?'正在保存…':`保存到 ${machine.host}`}</Button></div></form></Dialog>}
  {deleting&&<Dialog title={`删除模型配置 · ${machine.host}`} onClose={()=>{if(!locked.current){setDeleting(null);setError('')}}}><p>从 <strong>{machine.host} · {machine.name}</strong> 删除 <strong>{deleting.name}</strong>？</p><p>将删除这台机器上的此项 CC Switch 配置及其中保存的 API Key。</p>{error&&<p className="cc-switch-error" role="alert">{error}</p>}<div className="op-form-footer"><Button kind="ghost" disabled={busy} onClick={()=>{setDeleting(null);setError('')}}>取消</Button><Button className="cc-switch-delete" disabled={busy} onClick={async()=>{if(await mutate(endpoint+'/'+encodeURIComponent(deleting.id),'DELETE',{expectedRevision:deleting.revision},`已删除 ${machine.host} 的 ${deleting.name}。`))setDeleting(null)}}>{busy?'正在删除…':'确认删除'}</Button></div></Dialog>}
 </div>;
}
