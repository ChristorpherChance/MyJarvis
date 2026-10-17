import {replyLanguagePreference} from './features/family/conversation-language';

export interface PreferenceDraft<T> {
 identity:string; revision:number; latestRevision:number; base:T; values:T; conflict:boolean;
}
export function samePreferenceValues(a:unknown,b:unknown):boolean {
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 const ak=Object.keys(a),bk=Object.keys(b);
 return ak.length===bk.length&&ak.every(key=>Object.hasOwn(b,key)&&samePreferenceValues((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]));
}
export const preferenceDirty=<T>(state:PreferenceDraft<T>)=>!samePreferenceValues(state.base,state.values);
export function preferenceDraft<T>(identity:string,revision:number,values:T):PreferenceDraft<T> {
 return {identity,revision,latestRevision:revision,base:values,values,conflict:false};
}
/** Background refreshes may advance a clean form, but never an edited form's CAS version. */
export function receivePreferences<T>(state:PreferenceDraft<T>,identity:string,revision:number,values:T):PreferenceDraft<T> {
 if(identity!==state.identity)return preferenceDraft(identity,revision,values);
 if(revision<state.revision||revision<state.latestRevision)return state;
 if(revision===state.latestRevision&&samePreferenceValues(state.base,values))return state;
 if(preferenceDirty(state))return {...state,latestRevision:revision,conflict:true};
 return preferenceDraft(identity,revision,values);
}
export function savedPreferences<T>(state:PreferenceDraft<T>,revision:number,values:T):PreferenceDraft<T> {
 const next=preferenceDraft(state.identity,revision,values);
 return state.latestRevision>revision?{...next,latestRevision:state.latestRevision,conflict:true}:next;
}
export function quietHoursError(enabled:boolean,start:string,end:string):string {
 if(!enabled)return '';
 const time=/^([01]\d|2[0-3]):[0-5]\d$/;
 return time.test(start)&&time.test(end)?'':'请填写完整的安静时段开始和结束时间，或关闭安静时段。';
}
export function quietHours(enabled:boolean,start:string,end:string) {
 return {quietStart:enabled?start:'',quietEnd:enabled?end:''};
}
export function personaValues(value:Record<string,any>) {
 return {
  address:value.address??'',wakeword:value.configured===false&&!value.wakeword?'贾维斯':value.wakeword??'',language:value.language??'中文',
  replyLanguage:replyLanguagePreference(value),
  voice:['clear','warm','calm'].includes(value.voice)?value.voice:'clear',
  pace:value.pace??'正常',
  replyStyle:['清晰自然','简洁温和','轻松幽默','循序引导'].includes(value.replyStyle)?value.replyStyle:'清晰自然',
  privacy:['ask','local','allowed'].includes(value.privacy)?value.privacy:'ask',
  quietStart:value.quietStart??'',quietEnd:value.quietEnd??'',
  quietEnabled:!!(value.quietStart||value.quietEnd),dailyVoice:value.dailyVoice??30,
  autoSpeak:value.autoSpeak??false,timezone:value.timezone??'Asia/Shanghai',
 };
}
export type PersonaValues=ReturnType<typeof personaValues>;
export function personaRecordValues(record:Record<string,any>) {
 return personaValues({...record,voice:record.voiceId,wakeword:record.wakeWord,
  privacy:record.cloudPrivacy,dailyVoice:record.dailyVoiceMinutes,
  pace:({slow:'较慢',normal:'正常',fast:'较快'} as Record<string,string>)[record.pace]??record.pace});
}
export function personaValidation(values:PersonaValues):string {
 if(!String(values.address).trim()||String(values.address).trim().length>30)return '请填写 1 至 30 字的称呼。';
 if(!String(values.wakeword).trim()||String(values.wakeword).trim().length>20)return '请填写 1 至 20 字的唤醒词。';
 if(values.dailyVoice===''||!Number.isFinite(Number(values.dailyVoice))||Number(values.dailyVoice)<1||Number(values.dailyVoice)>300)return '每日语音预算应为 1 至 300 分钟。';
 return quietHoursError(values.quietEnabled,values.quietStart,values.quietEnd);
}
