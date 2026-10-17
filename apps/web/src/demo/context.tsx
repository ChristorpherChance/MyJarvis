import {createContext,useContext,useState,useCallback,useRef,useEffect,type ReactNode} from 'react';
import type {DemoData} from './types';
import {freshDemo,reduceDemo} from './model';
import {loadAppearance,loadLiveSnapshot,projectLiveData,DISPLAY_KEY,type LiveSnapshot,type PlatformAppearance} from './live-projection';
import {executeLiveOperation,clearLiveOperationSession} from './live-operation-commands';
import {clearInboxMaterialDrafts,materialSessionGeneration} from '../features/operations/inbox-material-store';
import {executeLiveFamily,clearLiveFamilySession} from './live-family-commands';
import {executeLiveKnowledge,clearLiveKnowledgeSession} from './live-knowledge-commands';
import {executeLiveInfrastructure,clearLiveInfrastructureSession} from './live-infrastructure-commands';
import {executeLivePlatform,clearLivePlatformSession} from './live-platform-commands';
import {v1AuthState,v1Authenticate,v1Logout,V1Error} from '../v1-client';
import {Button,Field} from '../ui';
import './live-platform.css';
import {loadNotifications,loadNotificationPreferences,saveNotificationPreferences,showForegroundNotifications,notificationQuietNow,type NotificationSnapshot} from '../notifications-client';
import {subscribeSupervisionWork,clearSupervisionStreams} from '../supervision-work-client';
const KEY='jarvis-platform-demo-v2';
const clearLiveSession=()=>{const draftsCleared=clearLiveOperationSession();clearLiveFamilySession();clearLiveKnowledgeSession();clearLiveInfrastructureSession();clearLivePlatformSession();return draftsCleared};
export interface PlatformContext {
 data:DemoData;mode:'demo'|'live';act:(action:string,payload?:Record<string,unknown>)=>void|Promise<unknown>;
 reset:()=>void;notice:string;clearNotice:()=>void;refresh:()=>Promise<void>;notify:(message:string)=>void;
 handleApiError:(error:unknown)=>void;real?:LiveSnapshot;busy:boolean;logout:()=>Promise<void>;
 piPrompt:string;discussWithPi:(prompt:string)=>void;notifications?:NotificationSnapshot|null;refreshNotifications?:()=>Promise<void>;supervisionConnection?:'connecting'|'live'|'reconnecting'|'stopped';
}
const Context=createContext<PlatformContext|null>(null);
function load():DemoData{try{const raw=JSON.parse(localStorage.getItem(KEY)||'null');if(raw?.schema===1502)return raw;}catch{}return freshDemo()}
export function DemoProvider({children}:{children:ReactNode}){
 const [data,setData]=useState(load);const current=useRef(data);const [notice,setNotice]=useState('');
 const act=useCallback((action:string,payload:Record<string,unknown>={})=>{try{const next=reduceDemo(current.current,{type:action,payload});localStorage.setItem(KEY,JSON.stringify(next));current.current=next;setData(next);if(!['profile.select','theme.select'].includes(action))setNotice(next.lastNotice || '已更新演示记录');}catch(e){setNotice('操作未执行：'+(e instanceof Error?e.message:'请核对输入'));throw e}},[]);
 const reset=useCallback(()=>{const next=freshDemo();localStorage.setItem(KEY,JSON.stringify(next));current.current=next;setData(next);setNotice('已恢复初始演示，真实数据未受影响');},[]);
 return <Context.Provider value={{data,act,mode:'demo',reset,notice,clearNotice:()=>setNotice(''),notify:setNotice,refresh:async()=>{},handleApiError:e=>setNotice(String(e)),busy:false,logout:async()=>{},piPrompt:'',discussWithPi:()=>{setNotice('此操作需要真实 Pi 对话；请打开完整平台。')}}}>{children}</Context.Provider>;
}

function PlatformLogin({setup,onLogin,error}:{setup:boolean;onLogin:(password:string)=>Promise<void>;error:string}){
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[localError,setLocalError]=useState('');
 return <div className="platform-auth"><div className="platform-auth-art"><div className="platform-auth-orbit"><b>J</b></div><small>JARVIS / YOUR PERSONAL SYSTEM</small><h1>你的贾维斯，<br/>从这里开始。</h1><p>完整界面 · 真实数据 · Pi 智能基础</p></div><section className="platform-auth-form"><small>CONTROL / AUTHENTICATION</small><h2>{setup?'建立管理账户':'欢迎回来'}</h2><p>{setup?'设置管理员密码，开始管理自己的平台。':'使用原管理员账号进入完整平台。'}</p><form onSubmit={async e=>{e.preventDefault();if(busy)return;setLocalError('');if(setup&&password!==confirm){setLocalError('两次输入的密码不一致');return}setBusy(true);try{await onLogin(password)}catch(err){setLocalError(err instanceof Error?err.message:'登录未完成')}finally{setBusy(false)}}}><Field label="管理密码"><input aria-label="管理密码" type="password" autoComplete={setup?'new-password':'current-password'} minLength={setup?12:undefined} required value={password} onChange={e=>setPassword(e.target.value)}/></Field>{setup&&<Field label="确认密码"><input aria-label="确认密码" type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></Field>}{(localError||error)&&<p role="alert" className="form-error">{localError||error}</p>}<Button type="submit" disabled={busy}>{busy?'正在验证…':setup?'创建账户':'进入完整平台'}</Button></form><a href="/?mode=demo">查看完整交互演示 ↗</a><p className="muted">管理员登录后可管理平台；家庭语音可使用房间入口。</p></section></div>;
}
export function LiveProvider({children}:{children:ReactNode}){
 const [supervisionConnection,setSupervisionConnection]=useState<'connecting'|'live'|'reconnecting'|'stopped'>('stopped');
 const [notifications,setNotifications]=useState<NotificationSnapshot|null>(null);const notificationFlight=useRef<Promise<void>|null>(null),knownNotificationIds=useRef<Set<string>|null>(null);
 const [auth,setAuth]=useState<{setupRequired:boolean;authenticated:boolean}|null>(null),[snapshot,setSnapshot]=useState<LiveSnapshot|null>(null),[display,setDisplay]=useState(loadAppearance),[notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[piPrompt,setPiPrompt]=useState('');
 const current=useRef<LiveSnapshot|null>(null),appearance=useRef<PlatformAppearance>(display),epoch=useRef(0),refreshing=useRef<Promise<void>|null>(null),alive=useRef(true);
 const materialCleanup=useRef<Promise<boolean>|null>(null);
 const clearMaterials=useCallback(()=>{if(materialCleanup.current)return materialCleanup.current;const pending=clearInboxMaterialDrafts().then(()=>true,()=>false).finally(()=>{if(materialCleanup.current===pending)materialCleanup.current=null});materialCleanup.current=pending;return pending;},[]);
 useEffect(()=>{const invalidate=()=>setBusy(false);window.addEventListener('jarvis:inbox-materials-invalidated',invalidate);return()=>window.removeEventListener('jarvis:inbox-materials-invalidated',invalidate)},[]);
 const notify=useCallback((message:string)=>setNotice(message),[]);
 const handleApiError=useCallback((err:unknown)=>{const message=err instanceof Error?err.message:'请求未完成';setNotice(message);if(err instanceof V1Error&&err.status===401){const draftsCleared=clearLiveSession();const serial=++epoch.current;const cleanup=clearMaterials();current.current=null;setSnapshot(null);setPiPrompt('');setBusy(false);setAuth({setupRequired:false,authenticated:false});setError('会话已失效，请重新登录。'+(draftsCleared?'':'此浏览器未能清理文字草稿，请清除本站数据。'));void cleanup.then(ok=>{if(!ok&&alive.current&&epoch.current===serial)setError(previous=>previous+'此浏览器未能清理附件草稿，请清除本站数据。')})}},[clearMaterials]);
 const refresh=useCallback(()=>{if(refreshing.current)return refreshing.current;const serial=epoch.current,sharedSession=materialSessionGeneration();
  const pending=loadLiveSnapshot(current.current).then(value=>{if(alive.current&&serial===epoch.current&&sharedSession===materialSessionGeneration()){current.current=value;setSnapshot(value);setError('')}}).catch(err=>{if(alive.current&&serial===epoch.current&&sharedSession===materialSessionGeneration()){handleApiError(err);if(!(err instanceof V1Error&&err.status===401))setError(err instanceof Error?err.message:'加载未完成')}throw err}).finally(()=>{if(refreshing.current===pending)refreshing.current=null});refreshing.current=pending;return pending;
 },[handleApiError]);
 useEffect(()=>{alive.current=true;const serial=epoch.current;void v1AuthState().then(value=>{if(!alive.current||serial!==epoch.current)return;setAuth(value);if(value.authenticated)void refresh().catch(()=>{})}).catch(err=>{if(alive.current&&serial===epoch.current)setError(err instanceof Error?err.message:'无法连接本机服务')});return()=>{alive.current=false;epoch.current++;refreshing.current=null}},[refresh]);
 useEffect(()=>{if(!auth?.authenticated)return;const reload=()=>{if(document.visibilityState==='visible')void refresh().catch(()=>{})};const timer=setInterval(reload,15000);window.addEventListener('focus',reload);const expired=()=>handleApiError(new V1Error('会话已失效',401,'FORBIDDEN'));window.addEventListener('jarvis:auth-required',expired);return()=>{clearInterval(timer);window.removeEventListener('focus',reload);window.removeEventListener('jarvis:auth-required',expired)}},[auth?.authenticated,refresh,handleApiError]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),7000);return()=>clearTimeout(timer)},[notice]);
 const refreshNotifications=useCallback(()=>{if(notificationFlight.current)return notificationFlight.current;const serial=epoch.current,sharedSession=materialSessionGeneration();const pending=loadNotifications().then(value=>{if(alive.current&&serial===epoch.current&&sharedSession===materialSessionGeneration()){setNotifications(value);const pref=value.preferences.values,newItems=value.items.filter(item=>item.state==='unread'&&pref.categories[item.category]&&!knownNotificationIds.current?.has(item.id));if(knownNotificationIds.current&&newItems.length&&appearance.current.profile==='me'&&pref.enabled&&pref.channels.inApp&&!notificationQuietNow(pref))notify(newItems.length===1?newItems[0].title:`你有 `+newItems.length+' 条新的本人事项');knownNotificationIds.current=new Set(value.items.map(item=>item.id));if(appearance.current.profile==='me')showForegroundNotifications(value,route=>{location.hash=route})}}).finally(()=>{if(notificationFlight.current===pending)notificationFlight.current=null});notificationFlight.current=pending;return pending;},[notify]);
 // Supervision uses committed events. This timer only catches other sources or gaps.
 useEffect(()=>{if(!auth?.authenticated){setNotifications(null);knownNotificationIds.current=null;clearSupervisionStreams();setSupervisionConnection('stopped');return}void refreshNotifications().catch(()=>{});const timer=setInterval(()=>void refreshNotifications().catch(()=>{}),60000);return()=>clearInterval(timer)},[auth?.authenticated,refreshNotifications]);
 const supervisionActor=snapshot?.capabilities.identity.actorId??'';
 const supervisionAllowed=!!auth?.authenticated&&['administrator','admin'].includes(snapshot?.capabilities.identity.role??'');
 useEffect(()=>{
  if(!supervisionAllowed){setSupervisionConnection('stopped');return}
  const serial=epoch.current,session=materialSessionGeneration();let active=true;
  const currentSession=()=>active&&alive.current&&serial===epoch.current&&session===materialSessionGeneration();
  const changed=()=>{const previous=notificationFlight.current;void Promise.resolve(previous).catch(()=>{}).then(()=>{if(currentSession())return refreshNotifications()}).catch(failure=>{if(currentSession())handleApiError(failure)})};
  setSupervisionConnection('connecting');
  const stop=subscribeSupervisionWork(null,message=>{
   if(!currentSession())return;
   if(message.type==='refresh'){changed();return}
   setSupervisionConnection(message.state==='closed'?'stopped':message.state);
  });
  const invalidate=()=>{active=false;stop();clearSupervisionStreams();setSupervisionConnection('stopped');setNotifications(null);knownNotificationIds.current=null;notificationFlight.current=null};
  window.addEventListener('jarvis:inbox-materials-invalidated',invalidate);window.addEventListener('jarvis:auth-required',invalidate);
  return()=>{active=false;stop();window.removeEventListener('jarvis:inbox-materials-invalidated',invalidate);window.removeEventListener('jarvis:auth-required',invalidate)};
 },[supervisionAllowed,supervisionActor,refreshNotifications,handleApiError]);
 const saveDisplay=useCallback((patch:Partial<PlatformAppearance>)=>{const next={...appearance.current,...patch};localStorage.setItem(DISPLAY_KEY,JSON.stringify(next));appearance.current=next;setDisplay(next);},[]);
 const act=useCallback((action:string,payload:Record<string,unknown>={})=>{
  const serial=epoch.current,sharedSession=materialSessionGeneration();
  const operationCurrent=()=>serial===epoch.current&&sharedSession===materialSessionGeneration();
  if(action==='theme.select'){saveDisplay({theme:String(payload.id)});return}
  if(action==='profile.select'){const id=String(payload.id);const members=current.current?.bootstrap.members||[];const registered=current.current?.records.personas.filter(p=>p.kind==='profile'&&p.status==='registered')||[];if(!['me','public',...members.map((m:any)=>m.id),...registered.map(p=>p.id)].includes(id)){const err=new V1Error('请先登记这个成员档案。',403,'FORBIDDEN');notify(err.message);throw err}saveDisplay({profile:id});if(id!=='me')notify(id==='public'?'公共展示模式，仅展示共享内容。':'管理员查看已登记档案；不改变登录身份。');return}
  if(action==='settings.save'&&Object.keys(payload).every(k=>['appearance','notify','notifications','quietStart','quietEnd'].includes(k))){if(Object.keys(payload).every(k=>k==='appearance')){saveDisplay(payload as Partial<PlatformAppearance>);notify('本机显示偏好已保存');return}return loadNotificationPreferences().then(pref=>{if(!operationCurrent())throw new Error('旧会话操作已停止。');return saveNotificationPreferences(pref.revision,{...pref.values,enabled:payload.notify!==undefined?payload.notify===true:pref.values.enabled,categories:{...pref.values.categories,...(payload.notifications as Record<string,boolean>??{})},quietStart:payload.quietStart!==undefined?String(payload.quietStart):pref.values.quietStart,quietEnd:payload.quietEnd!==undefined?String(payload.quietEnd):pref.values.quietEnd})}).then(async()=>{if(!operationCurrent())return;await refreshNotifications();if(operationCurrent())notify('本人通知偏好已保存到服务端')}).catch(err=>{if(operationCurrent())handleApiError(err);throw err})}
  if(action==='live.refresh'||action==='op.device'&&payload.command==='refresh')return refresh();
  const operation=['op.inbox','op.research','op.project','op.task','op.experience'].includes(action);
  const infrastructure=['op.device','op.service','op.deployment','op.approval','op.policy','op.backup','op.metering','op.power'].includes(action);
  const knowledge=action.startsWith('knowledge.')||action==='family.learning.complete';
  const family=action.startsWith('memory.')||action.startsWith('family.todo.')||action.startsWith('family.health.')||action==='family.member.register'||action==='persona.save';
  const platform=action.startsWith('platform.')||action.startsWith('voice.')||action==='pi.job';
  if(!operation&&!infrastructure&&!knowledge&&!family&&!platform){const err=new V1Error('这项后台能力尚未接入，操作没有保存。',503,'NOT_CONFIGURED');notify(err.message);throw err}
  const value=current.current;if(!value){const err=new Error('真实数据尚未加载，请先刷新');notify(err.message);throw err}
  const data=projectLiveData(value,appearance.current);if(data.profile==='public'){const err=new V1Error('公共展示模式不能修改记录，请返回管理者空间。',403,'FORBIDDEN');notify(err.message);throw err}setBusy(true);
  const submit=operation?()=>executeLiveOperation(action,payload,data,value.records):infrastructure?()=>executeLiveInfrastructure(action,payload,data,value.records):knowledge?()=>executeLiveKnowledge(action,payload,data,value.records):family?()=>executeLiveFamily(action,payload,data,value.records):()=>executeLivePlatform(action,payload,value.records);
  return Promise.resolve().then(()=>{if(!operationCurrent())throw new Error('旧会话操作已停止。');return submit()}).then(async result=>{if(!operationCurrent())return result;try{const inFlight=refreshing.current;if(inFlight)await inFlight.catch(()=>{});if(!operationCurrent())return result;await refresh();if(operationCurrent())notify('已保存到本机服务')}catch{if(operationCurrent())notify('记录已保存，但列表刷新未完成，请手动刷新；不需要再次提交。')}return result}).catch(err=>{if(operationCurrent())handleApiError(err);throw err}).finally(()=>{if(operationCurrent())setBusy(false)});
 },[saveDisplay,notify,refresh,handleApiError,refreshNotifications]);
 const logout=useCallback(async()=>{await v1Logout();const draftsCleared=clearLiveSession();const serial=++epoch.current;const cleanup=clearMaterials();current.current=null;setSnapshot(null);setPiPrompt('');setBusy(false);setAuth({setupRequired:false,authenticated:false});setError(draftsCleared?'':'此浏览器未能清理文字草稿，请清除本站数据。');const cleared=await cleanup;if(!cleared&&alive.current&&epoch.current===serial)setError(previous=>previous+'此浏览器未能清理附件草稿，请清除本站数据。')},[clearMaterials]);
 if(!auth)return <div className="demo-loading">{error?<><p role="alert">{error}</p><Button onClick={()=>location.reload()}>重新连接</Button></>:'正在连接本机贾维斯…'}</div>;
 if(!auth.authenticated)return <PlatformLogin setup={auth.setupRequired} error={error} onLogin={async password=>{if(materialCleanup.current)await materialCleanup.current;await v1Authenticate(auth.setupRequired,password);epoch.current++;refreshing.current=null;setAuth({setupRequired:false,authenticated:true});setError('');await refresh()}}/>;
 if(!snapshot)return <div className="demo-loading">{error?<><p role="alert">{error}</p><Button onClick={()=>void refresh().catch(()=>{})}>重新加载</Button><Button onClick={()=>void logout()}>退出登录</Button></>:'正在读取真实业务记录…'}</div>;
 const data=projectLiveData(snapshot,display);
 if(notifications){const p=notifications.preferences;Object.assign(data.settings,{notify:p.values.enabled,notifications:p.values.categories,quietStart:p.values.quietStart,quietEnd:p.values.quietEnd,notificationRevision:p.revision});Object.assign(data.runtime,{notifications:notifications.items,notificationUnread:notifications.unread});}
 return <Context.Provider value={{data,mode:'live',act,real:snapshot,refresh,notifications,refreshNotifications,supervisionConnection,notify,handleApiError,busy,logout,notice,clearNotice:()=>setNotice(''),reset:()=>notify('真实数据不能通过演示重置清除。'),piPrompt,discussWithPi:prompt=>{setPiPrompt(prompt);location.hash='chat'}}}>{children}</Context.Provider>;
}
export function useDemo(){const value=useContext(Context);if(!value)throw new Error('PlatformProvider missing');return value}
