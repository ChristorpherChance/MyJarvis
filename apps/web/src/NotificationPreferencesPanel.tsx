import {useEffect,useRef,useState} from 'react';
import {Button,Field,Panel} from './ui';
import {notificationCategoryNames,loadNotificationPreferences,saveNotificationSettings,type NotificationPreferenceState} from './notifications-client';
import {preferenceDraft,preferenceDirty,quietHours,quietHoursError,savedPreferences,type PreferenceDraft} from './personal-settings-draft';
import {V1Error} from './v1-client';
import {memberSessionCurrent,memberSessionSnapshot,subscribeMemberSession} from './features/family/member-session';
import {materialSessionGeneration} from './features/operations/inbox-material-store';

type Values=NotificationPreferenceState['values']&{quietEnabled:boolean};
const valuesFor=(state:NotificationPreferenceState):Values=>({...state.values,quietEnabled:!!(state.values.quietStart||state.values.quietEnd)});
const browserPermission=()=>typeof Notification==='undefined'?'unsupported':Notification.permission;

export default function NotificationPreferencesPanel({onChanged}:{onChanged:()=>void|Promise<void>}) {
 const [state,setState]=useState<PreferenceDraft<Values>|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [permission,setPermission]=useState(browserPermission),[permissionBusy,setPermissionBusy]=useState(false);
 const generation=useRef(0),pending=useRef<number|null>(null),permissionRequest=useRef(0);
 const session=useRef({member:memberSessionSnapshot(),materials:materialSessionGeneration()});
 const sameSession=()=>memberSessionCurrent(session.current.member)&&session.current.materials===materialSessionGeneration();
 const current=(own:number)=>own===generation.current&&sameSession();
 const invalidate=()=>{generation.current++;pending.current=null;permissionRequest.current++;setState(null);setError('会话已变化，请重新读取本人通知偏好。');setNotice('');setBusy(false);setPermissionBusy(false)};
 useEffect(()=>{
  let active=true;const own=++generation.current;
  void loadNotificationPreferences().then(value=>{if(active&&current(own))setState(preferenceDraft(value.profileId,value.revision,valuesFor(value)))}).catch(failure=>{if(active&&current(own))setError(failure.message)});
  const focus=()=>setPermission(browserPermission());
  const unsubscribe=subscribeMemberSession(invalidate);
  window.addEventListener('jarvis:auth-required',invalidate);window.addEventListener('jarvis:inbox-materials-invalidated',invalidate);window.addEventListener('focus',focus);
  return()=>{active=false;generation.current++;permissionRequest.current++;unsubscribe();window.removeEventListener('jarvis:auth-required',invalidate);window.removeEventListener('jarvis:inbox-materials-invalidated',invalidate);window.removeEventListener('focus',focus)};
 },[]);
 const patch=(values:Partial<Values>)=>{setState(old=>old?{...old,values:{...old.values,...values}}:old);setNotice('')};
 async function reload() {
  if(pending.current!==null)return;setBusy(true);const own=++generation.current;pending.current=own;
  session.current={member:memberSessionSnapshot(),materials:materialSessionGeneration()};setState(null);
  try {const value=await loadNotificationPreferences();if(!current(own))return;setState(preferenceDraft(value.profileId,value.revision,valuesFor(value)));setError('');setNotice('已读取最新设置，本页未保存的修改已放弃。')}
  catch(failure){if(current(own))setError(failure instanceof Error?failure.message:'读取未完成')}
  finally{if(pending.current===own)pending.current=null;if(own===generation.current)setBusy(false)}
 }
 async function save() {
  if(!state||pending.current!==null||state.conflict)return;
  if(!sameSession()){invalidate();return}
  const validation=quietHoursError(state.values.quietEnabled,state.values.quietStart,state.values.quietEnd);
  if(validation){setError(validation);return}
  setBusy(true);setNotice('');const own=++generation.current;pending.current=own;
  try {
   // Browser permission belongs to the separate button below, never this server save.
   const result=await saveNotificationSettings(state.revision,state.values);
   if(!current(own))return;
   if(result.profileId!==state.identity)throw new Error('返回的成员身份已变化，请重新打开本人通知偏好。');
   setState(old=>old?savedPreferences(old,result.revision,valuesFor(result)):old);setError('');setNotice('通知偏好已保存。');
   try{await onChanged()}catch{if(current(own))setNotice('通知偏好已保存；提醒列表刷新未完成，可稍后刷新。')}
  } catch(failure) {
   if(!current(own))return;
   if(failure instanceof V1Error&&failure.status===409){setState(old=>old?{...old,conflict:true}:old);setError('其他页面或设备已更新通知偏好。你的输入已保留，请重新读取最新设置后再修改。')}
   else setError(failure instanceof Error?failure.message:'保存未完成');
  } finally {if(pending.current===own)pending.current=null;if(own===generation.current)setBusy(false)}
 }
 async function requestBrowserPermission() {
  if(typeof Notification==='undefined'||permissionBusy)return;
  const own=++permissionRequest.current;setPermissionBusy(true);
  try{const result=await Notification.requestPermission();if(own===permissionRequest.current)setPermission(result)}
  catch{if(own===permissionRequest.current)setPermission(browserPermission())}
  finally{if(own===permissionRequest.current)setPermissionBusy(false)}
 }
 const values=state?.values;
 const permissionText=permission==='granted'?'此浏览器已允许通知。':permission==='denied'?'此浏览器已拒绝通知，可在浏览器的网站设置中更改。':permission==='unsupported'?'此浏览器不支持系统通知。':'此浏览器尚未授予通知权限。';
 return <Panel title="本人通知偏好" actions={<Button disabled={!state||busy||state.conflict} onClick={()=>void save()}>{busy?'正在处理…':'保存通知偏好'}</Button>}>
  {error&&<p role="alert" className="form-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <Button kind="ghost" disabled={busy} onClick={()=>void reload()}>{state?.conflict?'重新读取最新设置（放弃本页修改）':'重新读取设置（放弃本页修改）'}</Button>
  {state&&values?<>
   <fieldset disabled={busy} style={{border:0,padding:0,margin:0}}><div className="settings-grid">
    <label className="setting-switch"><b>开启主动提醒</b><input aria-label="开启主动提醒" type="checkbox" checked={values.enabled} onChange={e=>patch({enabled:e.target.checked})}/></label>
    {Object.entries(notificationCategoryNames).map(([id,name])=><label className="setting-switch" key={id}><b>{name}</b><input aria-label={name} type="checkbox" checked={values.categories[id]!==false} onChange={e=>patch({categories:{...values.categories,[id]:e.target.checked}})}/></label>)}
    <label className="setting-switch"><b>平台内提醒</b><input aria-label="平台内提醒" type="checkbox" checked={values.channels.inApp} onChange={e=>patch({channels:{...values.channels,inApp:e.target.checked}})}/></label>
    <label className="setting-switch"><b>前台浏览器通知</b><input aria-label="前台浏览器通知" type="checkbox" checked={values.channels.browser} onChange={e=>patch({channels:{...values.channels,browser:e.target.checked}})}/></label>
    <label className="setting-switch"><b>房间主动播报（本人明确同意）</b><input aria-label="房间主动播报" type="checkbox" checked={values.channels.roomVoice} onChange={e=>patch({channels:{...values.channels,roomVoice:e.target.checked}})}/></label>
    <label className="setting-switch"><b>允许主动播报使用云端语音</b><input aria-label="主动播报云端语音" type="checkbox" checked={values.allowCloudAudio} onChange={e=>patch({allowCloudAudio:e.target.checked})}/></label>
    <label className="setting-switch"><b>启用通知安静时段</b><input aria-label="启用通知安静时段" type="checkbox" checked={values.quietEnabled} onChange={e=>patch({quietEnabled:e.target.checked,...(!e.target.checked?quietHours(false,'',''):{})})}/></label>
    <Field label="安静时段开始"><input type="time" disabled={!values.quietEnabled} value={values.quietStart} onChange={e=>patch({quietStart:e.target.value})}/></Field>
    <Field label="安静时段结束"><input type="time" disabled={!values.quietEnabled} value={values.quietEnd} onChange={e=>patch({quietEnd:e.target.value})}/></Field>
    <Field label="通知时区"><input value={values.timezone} onChange={e=>patch({timezone:e.target.value})}/></Field>
   </div></fieldset>
   <p className="muted">{permissionText} 此权限只影响浏览器通知，不影响保存安静时段、房间播报或其他偏好。</p>
   <Button kind="ghost" disabled={permissionBusy||permission==='unsupported'||permission==='granted'||permission==='denied'} onClick={()=>void requestBrowserPermission()}>{permissionBusy?'正在请求…':'允许此浏览器显示通知'}</Button>
   <p className="muted">{preferenceDirty(state)?'本页有未保存的修改。':'当前显示已读取的设置。'} 关闭安静时段后，开始和结束时间均保存为空。</p>
   <p className="muted">保存到当前已认证成员的服务端空间。房间须完成配对与成员登录；对话期间、静音及安静时段暂缓。私人正文不会在房间或浏览器提醒中直接展示。云端处理仍受本人隐私与预算边界限制。</p>
   <p className="muted">浏览器通知仅在此页面前台且获许可时显示；后台离线 Web Push 和邮箱渠道尚未配置。播放回执只说明浏览器上报，不能证明物理扬声器已发声。</p>
  </>:<p className="muted">{error?'偏好尚未读取。':'正在读取本人偏好…'}</p>}
 </Panel>;
}
