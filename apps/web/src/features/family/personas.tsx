import {resolveReplyLanguage,voicePreviewText} from './conversation-language';
import {useEffect,useRef,useState} from 'react';
import {Button,Field,Panel,Tag} from '../../ui';
import {CentralVoicePermission,ErrorNotice,Heading,Hint,Icon,PolicySummary,PrivateGate,useFamily,useSpeech,type FamilyProps} from './shared';
import {useDemo} from '../../demo/context';
import {v1All,V1Error,type V1Envelope,type V1Record} from '../../v1-client';
import {personaValues,personaRecordValues,personaValidation,preferenceDraft,preferenceDirty,quietHours,savedPreferences} from '../../personal-settings-draft';
import {usePreferenceDraft} from '../../usePreferenceDraft';

export default function Personas({navigate}:FamilyProps){
 const {data,execute,busy:familyBusy,error,profile,person,pref,policy,isPublic}=useFamily();
 const platform=useDemo(),identity=`${platform.real?.capabilities.identity.actorId??'demo'}:${profile}`;
 const projected={...pref,address:pref.configured===false&&!pref.address?person.name:pref.address};
 const {state,setState}=usePreferenceDraft(identity,pref.revision??0,personaValues(projected));
 const draft=state.values,dirty=preferenceDirty(state);
 const [saved,setSaved]=useState(false),[saving,setSaving]=useState(false),[failure,setFailure]=useState('');
 const request=useRef(0),pending=useRef<number|null>(null),active=useRef(true),currentIdentity=useRef(identity);currentIdentity.current=identity;
 const busy=familyBusy||saving;
 const speech=useSpeech(profile,draft,{demo:data.runtime?.mode!=='live'});
 const live=data.runtime?.mode==='live';
 useEffect(()=>{request.current++;pending.current=null;setSaving(false);setSaved(false);setFailure('')},[identity]);
 useEffect(()=>{active.current=true;const invalidate=()=>{request.current++;pending.current=null;setSaving(false);setSaved(false);setFailure('会话已变化，请重新打开个人设置。')};window.addEventListener('jarvis:auth-required',invalidate);window.addEventListener('jarvis:inbox-materials-invalidated',invalidate);return()=>{active.current=false;request.current++;window.removeEventListener('jarvis:auth-required',invalidate);window.removeEventListener('jarvis:inbox-materials-invalidated',invalidate)}},[]);
 const change=(key:string,value:unknown)=>{setState(old=>({...old,values:{...old.values,[key]:value}}));setSaved(false)};
 const isCurrent=(id:number,owner:string)=>active.current&&request.current===id&&currentIdentity.current===owner;
 async function save(){
  if(pending.current!==null||state.conflict||isPublic)return;
  const validation=personaValidation(draft);if(validation){setFailure(validation);return}
  const id=++request.current,owner=identity,submitted=draft;pending.current=id;setSaving(true);setFailure('');
  try {
   const result=await platform.act('persona.save',{profile,...submitted,...quietHours(submitted.quietEnabled,submitted.quietStart,submitted.quietEnd),expectedVersion:state.revision});
   if(!isCurrent(id,owner))return;
   if(live){
    const record=(result as V1Envelope<V1Record>|undefined)?.data;
    if(!record||!Number.isInteger(record.revision)||record.profileId!==profile){setState(old=>({...old,conflict:true}));throw new Error('保存回执缺少当前档案版本，请重新读取设置，避免重复提交。')}
    setState(old=>savedPreferences(old,record.revision,personaRecordValues(record)));
   }else setState(old=>savedPreferences(old,old.revision,{...submitted,...quietHours(submitted.quietEnabled,submitted.quietStart,submitted.quietEnd)}));
   setSaved(true);
  }catch(e){if(isCurrent(id,owner)){if(e instanceof V1Error&&e.status===409){setState(old=>({...old,conflict:true}));setFailure('其他页面或设备已更新个人设置。你的输入已保留，请重新载入最新设置后再修改。')}else setFailure(e instanceof Error?e.message:'保存未完成')}}
  finally{if(isCurrent(id,owner)){pending.current=null;setSaving(false)}}
 }
 async function reload(){
  if(pending.current!==null)return;
  const id=++request.current,owner=identity;pending.current=id;setSaving(true);
  try {
   if(live){const rows=await v1All('personas');if(!isCurrent(id,owner))return;const record=rows.items.find(row=>row.kind==='persona'&&row.profileId===profile);setState(preferenceDraft(owner,record?.revision??0,record?personaRecordValues(record):personaValues({...projected,configured:false})))}
   else setState(preferenceDraft(owner,pref.revision??0,personaValues(projected)));
   if(isCurrent(id,owner)){setFailure('');setSaved(false)}
  }catch(e){if(isCurrent(id,owner))setFailure(e instanceof Error?e.message:'读取未完成')}
  finally{if(isCurrent(id,owner)){pending.current=null;setSaving(false)}}
 }
 if(isPublic)return <><Heading title="专属管家" subtitle="为每个人保留不同的声音、习惯与记忆。"/><PrivateGate/></>;
 return <div className="fa-personas"><Heading title="专属管家" subtitle={`正在设置${person.name}的声音与交流习惯`}><Tag>{state.conflict?'设置版本冲突':dirty?'有未保存修改':saved?'设置已保存':'个人档案'}</Tag><Button disabled={busy||state.conflict} onClick={()=>void save()}>保存设置</Button><Button kind="ghost" onClick={()=>navigate('chat')}>回到语音</Button></Heading>
  <div className="fa-persona-layout"><Panel className="fa-persona-side"><div className="fa-avatar large">{person.avatar}</div><h2>{person.name}的贾维斯</h2><p>不同声线，清楚的归属</p><div className="fa-person-list">{data.profiles.filter((p:any)=>p.id!=='public').map((p:any)=><button key={p.id} className={p.id===profile?'selected':''} onClick={()=>{speech.stop();execute('profile.select',{id:p.id})}}><span className="fa-avatar">{p.avatar}</span><span><strong>{p.name}</strong><small>{p.caption}</small></span>{p.id===profile&&<Icon name="check" size={16}/>}</button>)}</div><Hint>{live?'这里管理家庭档案；成员在房间入口用独立密码或PIN验证。切换档案不授予本人身份或私人记忆权限。':'切换模拟档案会结束当前播放、识别和待确认指令。声线与唤醒词不授予操作权限。'}</Hint><Button kind="ghost" onClick={()=>navigate('memory')}><Icon name="lock"/>管理我的记忆</Button>{live&&<Button kind="ghost" onClick={()=>window.open('/?mode=room','_blank','noopener')}>打开房间入口</Button>}</Panel>
   <div className="fa-stack"><fieldset disabled={busy} style={{border:0,padding:0,margin:0,display:'contents'}}><Panel title="交流与声音" actions={<span className="fa-small">个性化偏好</span>}><form onSubmit={e=>{e.preventDefault();save()}} className="fa-stack"><div className="fa-form-grid"><Field label="希望怎么称呼你"><input required maxLength={30} value={draft.address||''} onChange={e=>change('address',e.target.value)}/></Field><Field label="唤醒词"><input required maxLength={20} value={draft.wakeword||''} onChange={e=>change('wakeword',e.target.value)}/></Field><Field label="喜欢的声音"><select value={draft.voice||'clear'} onChange={e=>change('voice',e.target.value)}><option value="clear">清澈 · 自然明亮</option><option value="warm">温暖 · 柔和舒缓</option><option value="calm">沉稳 · 平静清晰</option></select></Field><Field label="回复语言"><select aria-label="回复语言" value={draft.replyLanguage} onChange={e=>change('replyLanguage',e.target.value)}><option value="auto">自动跟随输入</option><option value="zh">固定中文</option><option value="en">固定英语 · English</option><option value="fr">固定法语 · Français</option><option value="de">固定德语 · Deutsch</option></select></Field><Field label="说话速度"><select value={draft.pace||'正常'} onChange={e=>change('pace',e.target.value)}>{['较慢','正常','较快'].map(s=><option key={s}>{s}</option>)}</select></Field><Field label="交流风格"><select value={draft.replyStyle||'清晰自然'} onChange={e=>change('replyStyle',e.target.value)}>{['清晰自然','简洁温和','轻松幽默','循序引导'].map(s=><option key={s}>{s}</option>)}</select></Field></div><div className="fa-voice-preview"><div className={`fa-voice-bars ${speech.speaking?'playing':''}`} aria-hidden="true">{Array.from({length:28},(_,i)=><i key={i} style={{height:`${8+Math.abs(Math.sin(i*.7))*24}px`,animationDelay:`${i*.07}s`}}/>)}</div><div><strong>听听你的专属声音</strong><p>用未保存的设置试听，点击后才播放。</p></div><Button kind="ghost" onClick={()=>speech.speaking?speech.stop():speech.speak(voicePreviewText[resolveReplyLanguage(draft)],{replyLanguage:resolveReplyLanguage(draft),language:({zh:'中文',en:'英语',fr:'法语',de:'德语'})[resolveReplyLanguage(draft)]})}><Icon name={speech.speaking?'stop':'play'}/>{speech.speaking?'停止试听':'试听声线'}</Button></div><CentralVoicePermission speech={speech}/><Hint>{live?'输入语言每轮自动识别；回复语言随成员档案跨设备保存。自动跟随的试听使用中文示例，固定语言使用对应示例。档案选择不改变登录身份。':'演示试听使用浏览器声音，不代表中央引擎效果。'}</Hint></form></Panel>
    <Panel title="隐私与陪伴"><div className="fa-form-grid"><Field label="云端使用偏好"><select value={draft.privacy||'ask'} onChange={e=>change('privacy',e.target.value)}><option value="ask">需要联网时给我选择</option><option value="local">仅在本地处理，必要时提示降级</option><option value="allowed">允许已授权云端能力</option></select></Field><Field label="每日语音预算 · 分钟"><input type="number" min={1} max={300} value={draft.dailyVoice} onChange={e=>change('dailyVoice',e.target.value===''?'':Number(e.target.value))}/></Field><label className="setting-switch"><b>启用个人安静时段</b><input aria-label="启用个人安静时段" type="checkbox" checked={draft.quietEnabled} onChange={e=>{const enabled=e.target.checked;setState(old=>({...old,values:{...old.values,quietEnabled:enabled,...(!enabled?quietHours(false,'',''):{})}}));setSaved(false)}}/></label><Field label="安静时间开始"><input type="time" disabled={!draft.quietEnabled} value={draft.quietStart} onChange={e=>change('quietStart',e.target.value)}/></Field><Field label="安静时间结束"><input type="time" disabled={!draft.quietEnabled} value={draft.quietEnd} onChange={e=>change('quietEnd',e.target.value)}/></Field><Field label="回答播放方式"><select value={String(draft.autoSpeak||false)} onChange={e=>change('autoSpeak',e.target.value==='true')}><option value="false">由我点击播放</option><option value="true">开启后自动朗读，可随时打断</option></select></Field></div><Hint>关闭个人安静时段会将开始和结束时间都保存为空。家庭聊天以语音为主；涉及私人资料、实际执行或身份不确定时再补充确认。自动朗读需要在当前会话主动开启声音。</Hint></Panel>
    <Panel title="我的保存策略" actions={<Button kind="ghost" onClick={()=>navigate('memory')}>前往设置</Button>}><PolicySummary policy={policy}/></Panel>
    </fieldset><ErrorNotice text={failure||(state.conflict?'其他页面或设备已更新个人设置。你的输入已保留；重新载入会放弃本页修改。':'')||error||speech.speechError}/><Button kind="ghost" disabled={busy} onClick={()=>void reload()}>重新载入最新设置（放弃本页修改）</Button><div className="fa-section-footer"><Hint>{dirty?'当前修改尚未保存。':live?'房间登录后使用本人的声音、语速、唤醒词及偏好。实际声线请在运行引擎中映射；中央语音按成员时区执行安静时间，并累计真实音频分钟。':'设置仅属于当前演示档案。'}</Hint><Button disabled={busy||state.conflict} onClick={()=>void save()}>保存我的设置</Button></div>
   </div></div>
 </div>
}

