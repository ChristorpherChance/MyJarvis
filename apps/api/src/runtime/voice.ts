import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Store } from '../store.js';
import type { PiService } from '../pi.js';
import { z } from 'zod';
import { IdentityRuntime, RuntimeAccessError, runtimeHandler, type RuntimePrincipal } from './identity.js';
import { VoiceAdapter, engineSchema, audioExtension, type VoiceEngineConfig, type VoiceTranscription } from './voice-adapter.js';
import {measureAudioSeconds} from './voice-duration.js';
import {cloudGate,isLocalEndpoint} from './voice-policy.js';
import {voiceCatalog,catalogVoice} from './voice-catalog.js';
import {publicAnswer} from '../public-answer.js';
import {resolveReplyLanguage} from './conversation-language.js';
import type {GovernanceRuntime} from './governance.js';
import type {VoiceProviderUsage} from './voice-usage.js';

const at=()=>new Date().toISOString();
const voiceLanguage=z.enum(['zh','en','ja','fr','de','es','auto']);
const voiceIdSchema=z.string().max(60).refine(id=>!!catalogVoice(id),'声音不在已登记的声音库中');
const playbackSchema=z.object({language:voiceLanguage.optional(),voice:z.enum(['clear','warm','calm']).optional(),voiceId:voiceIdSchema.optional(),pace:z.enum(['slow','normal','fast']).optional()}).strict().refine(value=>!value.voice||!value.voiceId,'不能同时指定声音映射和声音库ID');
const diagnosticUnit=z.number().finite().min(0).max(1);
const diagnosticMilliseconds=z.number().finite().min(0).max(86_400_000);
const clientDiagnosticsSchema=z.object({
 clientBuild:z.string().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/),
 mode:z.enum(['direct','standby','single','paused']),
 phase:z.enum(['idle','preparing','listening','transcribing','thinking','speaking','awaiting-playback','paused','error']),
 contextState:z.enum(['running','suspended','interrupted','closed','none']),
 trackState:z.enum(['live','ended','none']),muted:z.boolean(),trackMuted:z.boolean().optional(),
 capture:z.object({frames:z.number().finite().int().min(0).max(10_000_000).optional(),lastFrameAgeMs:diagnosticMilliseconds.optional(),rms:diagnosticUnit.optional(),peak:diagnosticUnit.optional(),noiseFloor:diagnosticUnit.optional(),threshold:diagnosticUnit.optional(),active:z.boolean().optional(),lastOutcome:z.enum(['pending','speech','silence','interrupted','error','none']).optional(),durationMs:diagnosticMilliseconds.optional()}).strict(),
}).strict();
const clientDiagnosticsTtlMs=24*3600_000,clientDiagnosticsCooldownMs=2000,clientDiagnosticsLimit=200;
export type VoicePlaybackOverrides=z.infer<typeof playbackSchema>;
export type VoiceSession={id:string;actorId:string;profileId:string;terminalId:string;roomId:string;conversationId:string|null;turn:number;status:string;muted:boolean;createdAt:string;updatedAt:string};
export type VoiceJob={id:string;sessionId:string;kind:'asr'|'tts';turn:number;status:string;result:any;createdAt:string;updatedAt:string};
export interface VoiceRuntimeOptions {pi?:PiService;store?:Store;governance?:GovernanceRuntime;audioRetention?:(actorId:string)=>'never'|'session'|'7';defaultLocalTts?:boolean;audioProbeExecutable?:string;now?:()=>Date;}
/** Audio jobs are asynchronous and cancellable. Input audio is retained only after member opt-in. */
export class VoiceRuntime {
 private controllers=new Map<string,AbortController>();private pending=new Set<Promise<void>>();private key:Buffer;private stopped=false;
 private materialActors=new Map<string,string>();
 private outputDir:string;private cleanupTimer:ReturnType<typeof setInterval>;
 private async metered<T>(p:RuntimePrincipal,jobId:string,kind:'asr'|'tts',config:VoiceEngineConfig,seconds:number|undefined,work:(adapter:VoiceAdapter)=>Promise<T>):Promise<T>{
  const local=config.adapter==='command'||(['sensevoice-resident','whisper-small-resident','matcha-resident','kokoro-resident','piper-resident'].includes(config.model)&&isLocalEndpoint(config.baseUrl)),provider=config.adapter==='http'?new URL(config.baseUrl).hostname:'local-command';let reported=false;
  const meta={runId:'voice_'+jobId,actorId:p.actorId,conversationId:jobId,provider,model:config.model||'local-voice',origin:'bounded-job' as const,source:local?'local-voice':'voice-api',usageKind:kind};
  const meter=(u:VoiceProviderUsage)=>{if(reported)return;reported=true;this.options.governance?.recordUsage({...meta,...u,usageId:'voice_'+jobId,sourceRecordId:'voice:'+jobId,costKind:u.costUSD===null?'unavailable':'provider-reported',measurementStatus:'reported',measuredAt:at(),seconds});};
  if(!local)this.options.governance?.beforeRun(meta);
  try{return await work(new VoiceAdapter(config,meter));}finally{try{if(!reported&&this.options.governance)this.options.governance.recordUsage({...meta,usageId:'voice_'+jobId,sourceRecordId:'voice:'+jobId,inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,totalTokens:0,costUSD:local?0:null,costKind:local?'provider-reported':'unavailable',measurementStatus:local?'local':'unknown',measuredAt:at(),seconds});}finally{if(!local)this.options.governance?.afterRun(meta);}}
 }
 private availablePiper=new Set<string>();
 constructor(readonly dataDir:string,readonly identity:IdentityRuntime,readonly options:VoiceRuntimeOptions={}){
  const folder=resolve(dataDir,'runtime');mkdirSync(folder,{recursive:true,mode:0o700});
  const tableExists=!!identity.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='runtime_voice_engines'").get();
  const savedEngines=tableExists?identity.db.prepare('SELECT config FROM runtime_voice_engines').all():[];
  const keyPath=join(folder,'voice-master.key');
  if(!existsSync(keyPath)){
   const vaultExists=!!identity.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='runtime_application_credentials'").get();
   if(savedEngines.length||vaultExists&&Number(identity.db.prepare('SELECT COUNT(*) AS n FROM runtime_application_credentials').get()?.n))throw new RuntimeAccessError('VOICE_KEY_MISSING','语音或项目凭据解密密钥缺失；请恢复同一份完整备份中的runtime/voice-master.key',503);
   writeFileSync(keyPath,randomBytes(32),{mode:0o600,flag:'wx'});
  }
  this.key=readFileSync(keyPath);
  if(this.key.length!==32)throw new RuntimeAccessError('VOICE_KEY_INVALID','语音配置解密密钥无效；请恢复同一份完整备份，现有密钥未被改写',503);
  // Validate every encrypted configuration before changing job states or creating a replacement key.
  try{for(const row of savedEngines)engineSchema.parse(JSON.parse(this.decrypt(String(row.config))));}
  catch{throw new RuntimeAccessError('VOICE_KEY_INVALID','语音配置无法由现有密钥解密；请恢复匹配的完整备份，现有密钥未被改写',503);}
  try{chmodSync(keyPath,0o600);}catch{}
  this.outputDir=join(folder,'voice-output');mkdirSync(this.outputDir,{recursive:true,mode:0o700});
  identity.db.exec(`CREATE TABLE IF NOT EXISTS runtime_voice_engines(kind TEXT PRIMARY KEY,config TEXT NOT NULL,updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS runtime_voice_sessions(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,profile_id TEXT NOT NULL,terminal_id TEXT NOT NULL,room_id TEXT NOT NULL,conversation_id TEXT,turn INTEGER NOT NULL,status TEXT NOT NULL,muted INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS runtime_voice_jobs(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,actor_id TEXT NOT NULL,kind TEXT NOT NULL,turn INTEGER NOT NULL,status TEXT NOT NULL,result TEXT NOT NULL,audio_file TEXT,audio_mime TEXT,expires_at INTEGER,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS runtime_voice_playback(id TEXT PRIMARY KEY,job_id TEXT NOT NULL,actor_id TEXT NOT NULL,state TEXT NOT NULL,at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS runtime_voice_speech_queue(job_id TEXT PRIMARY KEY,previous_job_id TEXT NOT NULL UNIQUE);
   CREATE TABLE IF NOT EXISTS runtime_voice_wake(sequence INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL UNIQUE,terminal_id TEXT NOT NULL,word TEXT NOT NULL,at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS runtime_voice_usage(job_id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,kind TEXT NOT NULL,seconds REAL NOT NULL,at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS runtime_voice_preferences(actor_id TEXT PRIMARY KEY,profile_id TEXT NOT NULL,voice_id TEXT NOT NULL,updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS runtime_voice_client_diagnostics(session_id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,diagnostics TEXT NOT NULL,received_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS runtime_voice_client_diagnostics_expiry ON runtime_voice_client_diagnostics(expires_at);
   CREATE INDEX IF NOT EXISTS runtime_voice_usage_actor_time ON runtime_voice_usage(actor_id,at);
  `);
  identity.db.prepare("UPDATE runtime_voice_jobs SET status='interrupted',result=?,updated_at=? WHERE status IN('queued','running')").run(JSON.stringify({code:'RESTART_INTERRUPTED',message:'服务重启，任务未自动重试'}),at());
  identity.db.prepare("UPDATE runtime_voice_sessions SET status='idle',updated_at=? WHERE status NOT IN('closed','idle')").run(at());
  if(process.platform==='win32'&&options.defaultLocalTts!==false&&!this.getConfig('tts')){
   const executable=join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
   const worker=fileURLToPath(new URL('../../resources/voice/tts_sapi.ps1',import.meta.url));
   if(existsSync(executable)&&existsSync(worker))this.configure('tts',{adapter:'command',executable,args:['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',worker,'-TextFile','{textFile}','-Output','{output}','-Voice','{voice}','-Language','{language}','-Rate','{rate}'],model:'windows-sapi',voice:'',language:'auto',format:'wav',timeoutMs:60000});
  }
  this.cleanupTimer=setInterval(()=>{void this.cleanup().catch(()=>{});},60_000);this.cleanupTimer.unref();
 }
 private encrypt(value:string){const nonce=randomBytes(12),c=createCipheriv('aes-256-gcm',this.key,nonce),encrypted=Buffer.concat([c.update(value,'utf8'),c.final()]);return JSON.stringify({nonce:nonce.toString('base64'),tag:c.getAuthTag().toString('base64'),value:encrypted.toString('base64')});}
 private decrypt(value:string){const data=JSON.parse(value),d=createDecipheriv('aes-256-gcm',this.key,Buffer.from(data.nonce,'base64'));d.setAuthTag(Buffer.from(data.tag,'base64'));return Buffer.concat([d.update(Buffer.from(data.value,'base64')),d.final()]).toString('utf8');}
 configure(kind:'asr'|'tts',input:unknown){const config=engineSchema.parse(input);if(config.adapter==='http'&&!Object.hasOwn(input as object,'apiKey')){const previous=this.getConfig(kind);if(previous?.adapter==='http'&&previous.baseUrl===config.baseUrl)config.apiKey=previous.apiKey;}if(config.adapter==='command'&&!existsSync(config.executable))throw new RuntimeAccessError('ENGINE_CONFIGURATION','本地可执行程序不存在');this.identity.db.prepare('INSERT INTO runtime_voice_engines(kind,config,updated_at) VALUES(?,?,?) ON CONFLICT(kind) DO UPDATE SET config=excluded.config,updated_at=excluded.updated_at').run(kind,this.encrypt(JSON.stringify(config)),at());this.identity.store.audit('voice.engine.configure',kind,{adapter:config.adapter,model:config.model});return this.engineState(kind);}
 removeConfig(kind:'asr'|'tts'){this.identity.db.prepare('DELETE FROM runtime_voice_engines WHERE kind=?').run(kind);return {kind,configured:false};}
 private hasResidentVoices(c=this.getConfig('tts')){return !!c&&c.adapter==='http'&&['matcha-resident','kokoro-resident','piper-resident'].includes(c.model)&&['127.0.0.1','localhost','[::1]'].includes(new URL(c.baseUrl).hostname);}
 voiceChoice(p:RuntimePrincipal){this.identity.profile(p);const row=this.identity.db.prepare('SELECT voice_id FROM runtime_voice_preferences WHERE actor_id=? AND profile_id=?').get(p.actorId,p.profileId);return String(row?.voice_id??'profile-default');}
 catalog(p:RuntimePrincipal){return {selectedVoiceId:this.voiceChoice(p),items:voiceCatalog.map(v=>({...v,available:v.id==='profile-default'||this.hasResidentVoices()&&(v.model!=='piper-resident'||this.availablePiper.has(v.language))})),nativeVoices:this.hasResidentVoices()?103+this.availablePiper.size:0,cloning:{available:false,note:'电影原声复刻需要参考音频与支持克隆的引擎；当前提供真实人声库和风格试选。'}};}
 chooseVoice(p:RuntimePrincipal,id:string){this.identity.profile(p);const entry=catalogVoice(id);if(!entry)throw new RuntimeAccessError('INVALID_VOICE','声音不在已登记的声音库中');if(id!=='profile-default'&&(!this.hasResidentVoices()||entry.model==='piper-resident'&&!this.availablePiper.has(entry.language)))throw new RuntimeAccessError('VOICE_LIBRARY_UNAVAILABLE','对应语言的本地人声模型尚未就绪',409);this.identity.db.prepare('INSERT INTO runtime_voice_preferences(actor_id,profile_id,voice_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(actor_id) DO UPDATE SET profile_id=excluded.profile_id,voice_id=excluded.voice_id,updated_at=excluded.updated_at').run(p.actorId,p.profileId,id,at());this.identity.store.audit('voice.preference',p.profileId,{voiceId:id});return {voiceId:id,profileId:p.profileId};}
 getConfig(kind:'asr'|'tts'):VoiceEngineConfig|undefined{const r=this.identity.db.prepare('SELECT config FROM runtime_voice_engines WHERE kind=?').get(kind);return r?engineSchema.parse(JSON.parse(this.decrypt(String(r.config)))):undefined;}
 engineState(kind:'asr'|'tts'){const c=this.getConfig(kind);return c?{kind,configured:true,adapter:c.adapter,model:c.model,voice:c.voice,voiceMap:c.voiceMap??{},language:c.language,format:c.format,timeoutMs:c.timeoutMs,...(c.adapter==='http'?{baseUrl:c.baseUrl}:{}),credentialConfigured:c.adapter==='http'&&!!c.apiKey}:{kind,configured:false};}
 async health(){
  this.availablePiper.clear();const tts=this.getConfig('tts'),asr=this.getConfig('asr'),c=this.hasResidentVoices(tts)?tts:asr;
  if(c?.adapter!=='http'||!['sensevoice-resident','whisper-small-resident','matcha-resident','kokoro-resident','piper-resident'].includes(c.model)||!['127.0.0.1','localhost','[::1]'].includes(new URL(c.baseUrl).hostname))return {configured:false,ready:false};
  try{const response=await fetch(c.baseUrl.replace(/\/v1\/?$/,'')+'/health',{headers:c.apiKey?{Authorization:`Bearer ${c.apiKey}`}:{},signal:AbortSignal.timeout(2000),redirect:'error'});if(!response.ok)return {configured:true,ready:false};const value=await response.json() as any;
   const languages=(input:unknown,allowed:string[])=>Array.isArray(input)?input.filter((x):x is string=>typeof x==='string'&&allowed.includes(x)):[];
   const piperLanguages=value.ready===true?languages(value.piperLanguages,['en','fr','de']):[];for(const language of piperLanguages)this.availablePiper.add(language);
   return {configured:true,ready:value.ready===true,runtime:String(value.runtime??''),asr:String(value.asr??''),asrRevision:String(value.asrRevision??''),multilingualAsr:String(value.multilingualAsr??''),asrLanguages:languages(value.asrLanguages,['zh','en','fr','de','ja','ko','yue','auto']),ttsLanguages:languages(value.ttsLanguages,['zh','en','fr','de']),piperLanguages,tts:String(value.tts??''),fastTts:String(value.fastTts??''),kws:String(value.kws??''),voices:Number(value.voices)||0,speechDetection:String(value.speechDetection??''),inputPreparation:String(value.inputPreparation??''),metrics:value.metrics};
  }catch{return {configured:true,ready:false};}
 }
 state(){const resident=this.getConfig('asr')?.model==='sensevoice-resident';return {asr:this.engineState('asr'),tts:this.engineState('tts'),transport:'http-binary',inputAudioRetention:'per-member-opt-in-default-never',wake:{mode:resident?'central-keyword-model-or-authenticated-bridge':'authenticated-bridge-event-or-asr-phrase',professionalHotwordModel:resident,audioLocation:resident?'central-local-server':'configured-asr',identityVerified:false},conversation:{streaming:true,sentenceSpeech:true,continuousWindowSeconds:45,utteranceLimitSeconds:45},browserRequirements:{secureContext:true,echoCancellation:true,foregroundOrKiosk:true}};}
 private preferences(p:RuntimePrincipal):Record<string,any>{const profile=this.identity.profile(p);return profile.preferences&&typeof profile.preferences==='object'?profile.preferences as Record<string,any>:{};}
 private localTime(time:Date,zone:string){try{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(time),get=(type:string)=>parts.find(p=>p.type===type)?.value??'';return {day:`${get('year')}-${get('month')}-${get('day')}`,minutes:Number(get('hour'))*60+Number(get('minute'))};}catch{throw new RuntimeAccessError('PROFILE_CONFIGURATION','成员时区设置无效，请管理员修订');}}
 guardState(p:RuntimePrincipal){const pref=this.preferences(p),time=this.options.now?.()??new Date(),timezone=String(pref.timezone??'Asia/Shanghai'),local=this.localTime(time,timezone),parse=(value:any)=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):null,start=parse(pref.quietStart),end=parse(pref.quietEnd);
  const quietHoursActive=start!==null&&end!==null&&start!==end&&(start<end?local.minutes>=start&&local.minutes<end:local.minutes>=start||local.minutes<end);
  const configured=Number(pref.dailyVoiceMinutes??30),limitMinutes=Number.isFinite(configured)&&configured>=1&&configured<=300?configured:30;
  // UTC offset changes and daylight saving are handled by Intl for every recorded instant.
  const usage=this.identity.db.prepare('SELECT seconds,at FROM runtime_voice_usage WHERE actor_id=? AND at>=? AND at<=?').all(p.actorId,time.getTime()-48*3600_000,time.getTime()+1);const usedSeconds=usage.reduce((total,r)=>total+(this.localTime(new Date(Number(r.at)),timezone).day===local.day?Number(r.seconds):0),0);
  return {timezone,day:local.day,limitMinutes,usedSeconds,remainingSeconds:Math.max(0,limitMinutes*60-usedSeconds),quietHoursActive,quietStart:pref.quietStart??'',quietEnd:pref.quietEnd??'',meter:'decoded-audio-seconds-input-and-output'};
 }
 memberState(p:RuntimePrincipal){return {...this.state(),guard:this.guardState(p),audioRetention:this.options.audioRetention?.(p.actorId)??'never'};}
 private allowVoice(p:RuntimePrincipal){const state=this.guardState(p);if(state.quietHoursActive)throw new RuntimeAccessError('QUIET_HOURS','当前处于本人的安静时间，可改用文字交流',409);if(state.remainingSeconds<=0)throw new RuntimeAccessError('DAILY_VOICE_LIMIT','本人今日语音分钟已用完，可继续文字交流',429);return state;}
 private chargeVoice(p:RuntimePrincipal,jobId:string,kind:'asr'|'tts',seconds:number){if(!Number.isFinite(seconds)||seconds<=0)throw new RuntimeAccessError('INVALID_AUDIO','无法获得真实音频时长',422);const state=this.allowVoice(p);this.identity.db.prepare('INSERT OR IGNORE INTO runtime_voice_usage(job_id,actor_id,kind,seconds,at) VALUES(?,?,?,?,?)').run(jobId,p.actorId,kind,seconds,(this.options.now?.()??new Date()).getTime());if(seconds>state.remainingSeconds)throw new RuntimeAccessError('DAILY_VOICE_LIMIT','本段音频超过本人今日剩余分钟，已计入实际处理时长',429);}
 private personalConfig(c:VoiceEngineConfig,p:RuntimePrincipal,tts=false,override?:VoicePlaybackOverrides['language'],text?:string):VoiceEngineConfig{
  // Input language is independent of a member's preferred reply language.
  if(!tts)return {...c,language:override??'auto'};
  return {...c,language:override??resolveReplyLanguage(this.preferences(p),undefined,text)};
 }
 private allowEngine(p:RuntimePrincipal,c:VoiceEngineConfig,consent=false){const gate=cloudGate(this.identity.profile(p).preferences,c.adapter==='command'||isLocalEndpoint(c.baseUrl),consent);if(gate)throw new RuntimeAccessError(gate,gate==='CLOUD_FORBIDDEN'?'本人偏好仅本地，当前语音引擎为外部服务':'本次语音请求需要明确允许云端处理，或配置本地引擎',403);}
 private sessionRow(row:any):VoiceSession{return {id:String(row.id),actorId:String(row.actor_id),profileId:String(row.profile_id),terminalId:String(row.terminal_id),roomId:String(row.room_id),conversationId:row.conversation_id?String(row.conversation_id):null,turn:Number(row.turn),status:String(row.status),muted:!!row.muted,createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
 session(id:string,p:RuntimePrincipal):VoiceSession{const row=this.identity.db.prepare('SELECT * FROM runtime_voice_sessions WHERE id=? AND actor_id=?').get(id,p.actorId);if(!row)throw new RuntimeAccessError('NOT_FOUND','语音会话不存在或不可访问',404);return this.sessionRow(row);}
 private trimClientDiagnostics(now=(this.options.now?.()??new Date()).getTime()){
  this.identity.db.prepare('DELETE FROM runtime_voice_client_diagnostics WHERE expires_at<=?').run(now);
  this.identity.db.prepare('DELETE FROM runtime_voice_client_diagnostics WHERE session_id IN (SELECT session_id FROM runtime_voice_client_diagnostics ORDER BY received_at DESC,rowid DESC LIMIT -1 OFFSET ?)').run(clientDiagnosticsLimit);
 }
 reportClientDiagnostics(p:RuntimePrincipal,id:string,input:unknown){
  this.identity.profile(p);const session=this.session(id,p),diagnostics=clientDiagnosticsSchema.parse(input),now=(this.options.now?.()??new Date()).getTime();this.trimClientDiagnostics(now);
  const previous=this.identity.db.prepare('SELECT received_at FROM runtime_voice_client_diagnostics WHERE session_id=? AND actor_id=?').get(id,p.actorId);
  const elapsed=previous?now-Number(previous.received_at):clientDiagnosticsCooldownMs;
  if(elapsed<clientDiagnosticsCooldownMs)return {accepted:false,cooldownMs:Math.min(clientDiagnosticsCooldownMs,Math.max(0,clientDiagnosticsCooldownMs-elapsed))};
  this.identity.db.prepare('INSERT INTO runtime_voice_client_diagnostics(session_id,actor_id,diagnostics,received_at,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET actor_id=excluded.actor_id,diagnostics=excluded.diagnostics,received_at=excluded.received_at,expires_at=excluded.expires_at').run(session.id,p.actorId,JSON.stringify(diagnostics),now,now+clientDiagnosticsTtlMs);
  this.trimClientDiagnostics(now);return {accepted:true,receivedAt:new Date(now).toISOString(),expiresAt:new Date(now+clientDiagnosticsTtlMs).toISOString()};
 }
 clientDiagnostics(p:RuntimePrincipal,id:string){
  this.identity.profile(p);this.session(id,p);this.trimClientDiagnostics();const row=this.identity.db.prepare('SELECT diagnostics,received_at,expires_at FROM runtime_voice_client_diagnostics WHERE session_id=? AND actor_id=?').get(id,p.actorId);
  return row?{available:true,receivedAt:new Date(Number(row.received_at)).toISOString(),expiresAt:new Date(Number(row.expires_at)).toISOString(),diagnostics:clientDiagnosticsSchema.parse(JSON.parse(String(row.diagnostics)))}:{available:false};
 }
 createSession(p:RuntimePrincipal,terminalId:string,roomId:string,conversationId?:string){
  this.identity.profile(p);if(conversationId){try{if(!this.options.store?.getConversation(p.actorId,conversationId))throw Error();}catch{throw new RuntimeAccessError('FORBIDDEN','对话不属于当前成员',403);}}
  const id=randomUUID(),time=at();this.identity.db.prepare('INSERT INTO runtime_voice_sessions(id,actor_id,profile_id,terminal_id,room_id,conversation_id,turn,status,created_at,updated_at) VALUES(?,?,?,?,?,?,0,?,?,?)').run(id,p.actorId,p.profileId,terminalId,roomId,conversationId??null,'idle',time,time);
  return this.session(id,p);
 }
 private updateSession(id:string,patch:{status?:string;turn?:number;muted?:boolean}){const fields:string[]=[],args:any[]=[];for(const [key,val] of Object.entries(patch)){fields.push(`${key}=?`);args.push(key==='muted'?Number(val):val);}fields.push('updated_at=?');args.push(at(),id);this.identity.db.prepare(`UPDATE runtime_voice_sessions SET ${fields.join(',')} WHERE id=?`).run(...args);}
 listSessions(p:RuntimePrincipal){return this.identity.db.prepare('SELECT * FROM runtime_voice_sessions WHERE actor_id=? ORDER BY created_at DESC LIMIT 30').all(p.actorId).map(r=>this.sessionRow(r));}
 private jobRow(r:any):VoiceJob{return {id:String(r.id),sessionId:String(r.session_id),kind:r.kind,turn:Number(r.turn),status:String(r.status),result:JSON.parse(String(r.result)),createdAt:String(r.created_at),updatedAt:String(r.updated_at)};}
 job(id:string,p:RuntimePrincipal){const r=this.identity.db.prepare('SELECT * FROM runtime_voice_jobs WHERE id=? AND actor_id=?').get(id,p.actorId);if(!r)throw new RuntimeAccessError('NOT_FOUND','语音任务不存在或不可访问',404);return this.jobRow(r);}
 private createJob(session:VoiceSession,kind:'asr'|'tts',turn:number){const id=randomUUID(),time=at();this.identity.db.prepare('INSERT INTO runtime_voice_jobs(id,session_id,actor_id,kind,turn,status,result,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,session.id,session.actorId,kind,turn,'queued','{}',time,time);return id;}
 private capacity(actorId:string){if(this.controllers.size>=4)throw new RuntimeAccessError('VOICE_BUSY','中央语音正在处理其他请求，请稍后重试',429);const count=Number(this.identity.db.prepare("SELECT COUNT(*) AS n FROM runtime_voice_jobs WHERE actor_id=? AND status IN('queued','running')").get(actorId)?.n??0)+[...this.materialActors.values()].filter(actor=>actor===actorId).length;if(count>=2)throw new RuntimeAccessError('VOICE_BUSY','当前成员已有语音任务在处理，请先打断',409);}
 private settle(id:string,status:string,result:unknown){this.identity.db.prepare('UPDATE runtime_voice_jobs SET status=?,result=?,updated_at=? WHERE id=?').run(status,JSON.stringify(result),at(),id);}
 private async runJob(id:string,session:VoiceSession,action:(signal:AbortSignal)=>Promise<any>,principal:RuntimePrincipal){
  const control=new AbortController();this.controllers.set(id,control);this.settle(id,'running',{});
  const authorizationMonitor=setInterval(()=>{if(!this.identity.isPrincipalCurrent(principal))this.cancel(id,principal);},500);authorizationMonitor.unref();
  try{const result=await action(control.signal);if(control.signal.aborted)return;if(!this.identity.isPrincipalCurrent(principal)){this.cancel(id,principal);return;}const row=this.identity.db.prepare('SELECT status FROM runtime_voice_jobs WHERE id=?').get(id);const current=this.identity.db.prepare('SELECT turn FROM runtime_voice_sessions WHERE id=?').get(session.id);if(row?.status!=='running'||Number(current?.turn)!==session.turn)return;this.settle(id,'complete',result);this.updateSession(session.id,{status:result.audioUrl?this.outputStatus(session.id,session.turn):'transcribed'});}
  catch(error){const err=error instanceof RuntimeAccessError?error:new RuntimeAccessError('ENGINE_FAILED','语音任务未完成',502);if(!control.signal.aborted){this.settle(id,'failed',{code:err.code,message:err.message});const current=this.identity.db.prepare('SELECT turn FROM runtime_voice_sessions WHERE id=?').get(session.id);if(Number(current?.turn)===session.turn)this.updateSession(session.id,{status:'idle'});}}
  finally{clearInterval(authorizationMonitor);this.controllers.delete(id);}
 }
 private launch(id:string,session:VoiceSession,action:(signal:AbortSignal)=>Promise<any>,principal:RuntimePrincipal){const promise=this.runJob(id,session,action,principal);this.pending.add(promise);void promise.finally(()=>this.pending.delete(promise));}
 /** Transcribe a supplied original only. No room, conversation, playback or memory is created. */
 async transcribeMaterial(p:RuntimePrincipal,audio:Buffer,mime:string,options:{cloudConsent?:boolean;language?:VoicePlaybackOverrides['language'];signal?:AbortSignal}={}):Promise<VoiceTranscription>{
  const current=()=>{if(!this.identity.isPrincipalCurrent(p))throw new RuntimeAccessError('IDENTITY_CHANGED','当前身份已失效，录音转写已停止',401);};
  current();if(this.stopped)throw new RuntimeAccessError('SHUTTING_DOWN','语音服务正在关闭',503);
  const config=this.getConfig('asr');if(!config)throw new RuntimeAccessError('ASR_NOT_CONFIGURED','请配置本地或HTTP语音识别引擎',503);
  const language=options.language===undefined?undefined:voiceLanguage.parse(options.language);
  this.allowEngine(p,config,options.cloudConsent===true);this.allowVoice(p);
  if(!Buffer.isBuffer(audio)||audio.length>25*1024*1024)throw new RuntimeAccessError('AUDIO_TOO_LARGE','转写原件须为不超过25MiB的音频',413);
  audioExtension(mime,audio);this.capacity(p.actorId);
  const id=randomUUID(),controller=new AbortController(),signal=options.signal?AbortSignal.any([controller.signal,options.signal]):controller.signal;
  let release!:()=>void;const finished=new Promise<void>(resolve=>{release=resolve});
  this.controllers.set(id,controller);this.materialActors.set(id,p.actorId);this.pending.add(finished);
  const monitor=setInterval(()=>{if(!this.identity.isPrincipalCurrent(p))controller.abort();},500);monitor.unref();
  const live=()=>{current();if(signal.aborted)throw new RuntimeAccessError('CANCELLED','录音转写已取消',409);};
  try{
   live();const seconds=await measureAudioSeconds(audio,mime,signal,this.options.audioProbeExecutable);live();
   if(seconds>600)throw new RuntimeAccessError('AUDIO_TOO_LONG','单份转写原件最长10分钟',413);
   this.allowEngine(p,config,options.cloudConsent===true);
   if(seconds>this.allowVoice(p).remainingSeconds)throw new RuntimeAccessError('DAILY_VOICE_LIMIT','本份录音超过本人今日剩余语音分钟',429);
   const result=await this.metered(p,id,'asr',this.personalConfig(config,p,false,language),seconds,adapter=>{live();this.chargeVoice(p,id,'asr',seconds);return adapter.transcribe(audio,mime,signal);});
   live();if(!result.text.trim())throw new RuntimeAccessError('NO_SPEECH','原件未识别到可保存的文字，请核对录音后重试',422);
   // Allow only a small decoder/alignment tolerance. Never clamp or invent a provider timestamp.
   if(result.segments?.some(segment=>segment.start>seconds+0.25||segment.end>seconds+0.25))throw new RuntimeAccessError('ENGINE_RESPONSE','识别引擎的时间分段超出原件实际时长，未保存为可回听定位',502);
   return result;
  }catch(error){current();if(signal.aborted)throw new RuntimeAccessError('CANCELLED','录音转写已取消',409);throw error;}
  finally{clearInterval(monitor);this.controllers.delete(id);this.materialActors.delete(id);this.pending.delete(finished);release();}
 }
 submitAudio(p:RuntimePrincipal,id:string,audio:Buffer,mime:string,cloudConsent=false,language?:VoicePlaybackOverrides['language'],wakeCheck=false){
  if(this.stopped)throw new RuntimeAccessError('SHUTTING_DOWN','语音服务正在关闭',503);const c=this.getConfig('asr');if(!c)throw new RuntimeAccessError('ASR_NOT_CONFIGURED','请配置本地或HTTP语音识别引擎',503);
  this.allowEngine(p,c,cloudConsent);
  audioExtension(mime,audio);if(audio.length>25*1024*1024)throw new RuntimeAccessError('AUDIO_TOO_LARGE','音频超过25MiB',413);
  const s=this.session(id,p);if(s.status==='closed')throw new RuntimeAccessError('SESSION_CLOSED','语音会话已关闭',409);if(s.muted)throw new RuntimeAccessError('MUTED','当前终端已静音',409);this.allowVoice(p);
  this.cancelJobs(s,p);this.capacity(p.actorId);const turn=s.turn+1;this.updateSession(id,{turn,status:'transcribing'});const current=this.session(id,p),jobId=this.createJob(current,'asr',turn);
  const keywordGate=wakeCheck&&c.adapter==='http'&&['sensevoice-resident','whisper-small-resident'].includes(c.model)&&['127.0.0.1','localhost','[::1]'].includes(new URL(c.baseUrl).hostname);
  this.launch(jobId,current,async signal=>{
   const seconds=await measureAudioSeconds(audio,mime,signal,this.options.audioProbeExecutable);if(seconds>65)throw new RuntimeAccessError('AUDIO_TOO_LONG','单段语音最长65秒',413);signal.throwIfAborted();if(!keywordGate)this.chargeVoice(p,jobId,'asr',seconds);
   const retention=this.options.audioRetention?.(p.actorId)??'never';
   if(retention!=='never'){const filename=`${jobId}.${audioExtension(mime,audio)}`,path=join(this.outputDir,filename);await writeFile(path,audio,{mode:0o600});if(signal.aborted){await rm(path,{force:true});signal.throwIfAborted();}this.identity.db.prepare('UPDATE runtime_voice_jobs SET audio_file=?,audio_mime=?,expires_at=? WHERE id=?').run(filename,mime.split(';')[0],Date.now()+(retention==='7'?7*86400_000:8*3600_000),jobId);}
   const result=await this.metered(p,jobId,'asr',this.personalConfig(c,p,false,language),seconds,adapter=>adapter.transcribe(audio,mime,signal,wakeCheck?String(this.identity.profile(p).wakeWord??'贾维斯'):undefined));signal.throwIfAborted();const keywordOnly=keywordGate&&result.wakeDetected===false&&result.wakeWord===String(this.identity.profile(p).wakeWord??'贾维斯');if(keywordGate&&!keywordOnly)this.chargeVoice(p,jobId,'asr',seconds);return {...result,seconds,keywordOnly,dailyVoiceChargeSeconds:keywordOnly?0:seconds,audioRetention:retention,...(retention==='never'?{}:{rawAudioUrl:`/api/runtime/voice/jobs/${jobId}/audio`})};
  },p);return this.job(jobId,p);
 }
 submitSpeech(p:RuntimePrincipal,id:string,text:string,cloudConsent=false,playback:VoicePlaybackOverrides={},afterJobId?:string){
  if(this.stopped)throw new RuntimeAccessError('SHUTTING_DOWN','语音服务正在关闭',503);const c=this.getConfig('tts');if(!c)throw new RuntimeAccessError('TTS_NOT_CONFIGURED','请配置本地或HTTP语音合成引擎',503);
  const selected=playback.voiceId??(playback.voice?'profile-default':this.voiceChoice(p));let entry=catalogVoice(selected);if(!entry)throw new RuntimeAccessError('INVALID_VOICE','声音不在已登记的声音库中');if(entry.model&&!this.hasResidentVoices(c))throw new RuntimeAccessError('VOICE_LIBRARY_UNAVAILABLE','本地多声线引擎尚未配置',409);
  const personal=this.personalConfig(c,p,true,playback.language,text);
  if(this.hasResidentVoices(c)){
   if(personal.language==='auto'&&/[\u4e00-\u9fff]/.test(text))personal.language='zh';
   if(playback.voiceId&&entry.model==='piper-resident'&&personal.language!==entry.language)throw new RuntimeAccessError('VOICE_LANGUAGE_MISMATCH','试听语言与选择的人声不一致，请使用该人声的语种',422);
   const piper:Record<string,string>={en:'piper:en-lessac',fr:'piper:fr-siwis',de:'piper:de-thorsten'};
   if(piper[personal.language]&&!(personal.language==='en'&&entry.model==='kokoro-resident'&&entry.language==='en'))entry=catalogVoice(piper[personal.language])!;
   else if(personal.language==='zh'&&entry.model==='piper-resident')entry=catalogVoice('local-fast')!;
   if(personal.language==='auto'&&!/[\u4e00-\u9fff]/.test(text))throw new RuntimeAccessError('TTS_LANGUAGE_REQUIRED','请明确本轮朗读语言；自动识别的录音应沿用实际识别语种',422);
   if(!['zh','en','fr','de','auto'].includes(personal.language))throw new RuntimeAccessError('TTS_LANGUAGE_UNSUPPORTED','本地人声当前支持中文、英语、法语和德语',422);
  }
  const effective=entry.model?{...personal,model:entry.model,voice:entry.sid!}:personal;this.allowEngine(p,effective,cloudConsent);
  if(!text.trim()||text.length>8000)throw new RuntimeAccessError('INVALID_INPUT','合成文字需1至8000字');const s=this.session(id,p);if(s.status==='closed')throw new RuntimeAccessError('SESSION_CLOSED','语音会话已关闭',409);if(s.muted)throw new RuntimeAccessError('MUTED','当前终端已静音',409);this.allowVoice(p);
  text=publicAnswer(text);if(!text)throw new RuntimeAccessError('INVALID_INPUT','没有可朗读的最终回答');
  if(afterJobId){
   const previous=this.job(afterJobId,p),started=this.identity.db.prepare("SELECT 1 FROM runtime_voice_playback WHERE job_id=? AND state='started'").get(afterJobId);
   if(previous.sessionId!==id||previous.kind!=='tts'||previous.status!=='complete'||previous.turn!==s.turn||!['started','ended'].includes(previous.result.playback)||!started)throw new RuntimeAccessError('STALE_SPEECH_QUEUE','下一段只能接续当前已经开始播放的回答',409);
   if(text.length>1000||this.identity.db.prepare('SELECT 1 FROM runtime_voice_speech_queue WHERE previous_job_id=?').get(afterJobId))throw new RuntimeAccessError('SPEECH_QUEUE_LIMIT','同一段只可提前准备一段不超过1000字的后续内容',409);
  }else this.cancelJobs(s,p);
  this.capacity(p.actorId);const turn=afterJobId?s.turn:s.turn+1;if(!afterJobId)this.updateSession(id,{turn,status:'synthesizing'});const current=this.session(id,p),jobId=this.createJob(current,'tts',turn);if(afterJobId)this.identity.db.prepare('INSERT INTO runtime_voice_speech_queue(job_id,previous_job_id) VALUES(?,?)').run(jobId,afterJobId);const profile=this.identity.profile(p),preferred=playback.voice??(typeof profile.voice==='string'?profile.voice:'');
  // Human labels such as 默认 are not sent as engine-specific voice IDs.
  const selectedVoice=entry.sid??c.voiceMap?.[preferred]??(preferred&&!['clear','warm','calm','default','默认','温柔女声','沉稳男声'].includes(preferred)?preferred:undefined);
  const spokenEntry=entry;this.launch(jobId,current,async signal=>{const pace=playback.pace??this.preferences(p).pace,speed=['slow','较慢'].includes(pace)?.8:['fast','较快'].includes(pace)?1.2:1;const output=await this.metered(p,jobId,'tts',effective,undefined,adapter=>adapter.synthesize(text,signal,selectedVoice,speed*(spokenEntry.speed??1)));signal.throwIfAborted();const seconds=await measureAudioSeconds(output.audio,output.mime,signal,this.options.audioProbeExecutable);signal.throwIfAborted();this.options.governance?.observeUsageSeconds('voice_'+jobId,seconds);this.chargeVoice(p,jobId,'tts',seconds);const filename=`${jobId}.${c.format}`,path=join(this.outputDir,filename);await writeFile(path,output.audio,{mode:0o600});if(signal.aborted){await rm(path,{force:true});signal.throwIfAborted();}
   const retention=this.options.audioRetention?.(p.actorId)??'never';const ttl=retention==='7'?7*86400_000:retention==='session'?8*3600_000:10*60_000;
   this.identity.db.prepare('UPDATE runtime_voice_jobs SET audio_file=?,audio_mime=?,expires_at=? WHERE id=?').run(filename,output.mime,Date.now()+ttl,jobId);
   return {audioUrl:`/api/runtime/voice/jobs/${jobId}/audio`,mime:output.mime,bytes:output.audio.length,seconds,engine:output.engine,voice:selectedVoice||effective.voice,voiceId:spokenEntry.id,requestedVoiceId:selected,language:effective.language,model:effective.model,speed:speed*(spokenEntry.speed??1),retention,playback:'not-started'};
  },p);return this.job(jobId,p);
 }
 /** Compatibility hook for the original V1 admin flow. Completion is never a playback claim. */
 async synthesize(input:{actorId:string;profileId:string;text:string;sessionId?:string;cloudConsent?:boolean},signal?:AbortSignal){
  const p:RuntimePrincipal={actorId:input.actorId,profileId:input.profileId,administrator:input.actorId==='server-admin'};
  let session:VoiceSession;try{session=input.sessionId?this.session(input.sessionId,p):this.createSession(p,'local','study');}catch{session=this.createSession(p,'local','study');}
  const job=this.submitSpeech(p,session.id,input.text,input.cloudConsent===true);const abort=()=>this.cancel(job.id,p);signal?.addEventListener('abort',abort,{once:true});
  try{while(['queued','running'].includes(this.job(job.id,p).status)){if(signal?.aborted)throw new RuntimeAccessError('CANCELLED','合成已取消',409);await new Promise(resolve=>setTimeout(resolve,20));}return this.job(job.id,p);}finally{signal?.removeEventListener('abort',abort);}
 }
 private cancelJobs(s:VoiceSession,p:RuntimePrincipal){const rows=this.identity.db.prepare("SELECT id FROM runtime_voice_jobs WHERE session_id=? AND actor_id=? AND status IN('queued','running')").all(s.id,p.actorId);for(const row of rows)this.cancel(String(row.id),p);}
 cancel(id:string,p:RuntimePrincipal){const job=this.job(id,p);if(!['queued','running','complete'].includes(job.status))return job;this.controllers.get(id)?.abort();this.settle(id,'cancelled',{code:'CANCELLED',message:'已取消'});const session=this.session(job.sessionId,p);if(session.turn===job.turn&&session.status!=='closed')this.updateSession(session.id,{status:this.outputStatus(session.id,session.turn)});void this.deleteOutput(id).catch(()=>{});return this.job(id,p);}
 async interrupt(p:RuntimePrincipal,id:string,muted?:boolean){const s=this.session(id,p);this.cancelJobs(s,p);if((this.options.audioRetention?.(p.actorId)??'never')==='never'){const outputJobs=this.identity.db.prepare('SELECT id FROM runtime_voice_jobs WHERE session_id=? AND audio_file IS NOT NULL').all(id);for(const j of outputJobs)await this.deleteOutput(String(j.id));}this.updateSession(id,{turn:s.turn+1,status:'idle',...(muted===undefined?{}:{muted})});if(s.conversationId)await this.options.pi?.abort(s.conversationId,p.actorId);return this.session(id,p);}
 async closeSession(p:RuntimePrincipal,id:string){await this.interrupt(p,id,true);if((this.options.audioRetention?.(p.actorId)??'never')!=='7')for(const r of this.identity.db.prepare('SELECT id FROM runtime_voice_jobs WHERE session_id=? AND audio_file IS NOT NULL').all(id))await this.deleteOutput(String(r.id));this.updateSession(id,{status:'closed'});return this.session(id,p);}
 async audio(id:string,p:RuntimePrincipal){this.job(id,p);const r=this.identity.db.prepare("SELECT audio_file,audio_mime,expires_at,status FROM runtime_voice_jobs WHERE id=? AND actor_id=?").get(id,p.actorId);if(!r?.audio_file||r.status!=='complete'||Number(r.expires_at)<Date.now())throw new RuntimeAccessError('AUDIO_EXPIRED','音频已取消或过期，请重新合成',410);try{return {bytes:await readFile(join(this.outputDir,String(r.audio_file))),mime:String(r.audio_mime)};}catch{throw new RuntimeAccessError('AUDIO_EXPIRED','音频已过期，请重新合成',410);}}
 async playback(id:string,p:RuntimePrincipal,state:'started'|'ended'|'interrupted'|'blocked'){
  const job=this.job(id,p);if(job.kind!=='tts'||job.status!=='complete')throw new RuntimeAccessError('INVALID_PLAYBACK','音频未就绪',409);
  const s=this.session(job.sessionId,p);if(job.turn!==s.turn)throw new RuntimeAccessError('STALE_PLAYBACK','播放回执属于旧轮次',409);
  const queued=this.identity.db.prepare('SELECT previous_job_id FROM runtime_voice_speech_queue WHERE job_id=?').get(id);
  if(state==='started'){
   if(['ended','interrupted'].includes(job.result.playback))throw new RuntimeAccessError('STALE_PLAYBACK','本段播放已经结束',409);
   if(queued&&this.job(String(queued.previous_job_id),p).result.playback!=='ended')throw new RuntimeAccessError('PLAYBACK_ORDER','先播放完上一段，再开始下一段',409);
  }
  const receipt={id:randomUUID(),jobId:id,state,at:at(),origin:'client-reported'};this.identity.db.prepare('INSERT INTO runtime_voice_playback(id,job_id,actor_id,state,at) VALUES(?,?,?,?,?)').run(receipt.id,id,p.actorId,state,receipt.at);
  const row=this.identity.db.prepare('SELECT result FROM runtime_voice_jobs WHERE id=?').get(id);this.identity.db.prepare('UPDATE runtime_voice_jobs SET result=?,updated_at=? WHERE id=?').run(JSON.stringify({...JSON.parse(String(row?.result??'{}')),playback:state}),at(),id);
  this.updateSession(s.id,{status:this.outputStatus(s.id,s.turn)});if(state!=='started'&&(this.options.audioRetention?.(p.actorId)??'never')==='never')await this.deleteOutput(id);return receipt;
 }
 private outputStatus(id:string,turn:number){const rows=this.identity.db.prepare("SELECT status,result FROM runtime_voice_jobs WHERE session_id=? AND turn=? AND kind='tts'").all(id,turn);if(rows.some(r=>r.status==='complete'&&JSON.parse(String(r.result)).playback==='started'))return 'speaking';if(rows.some(r=>['queued','running'].includes(String(r.status))))return 'synthesizing';if(rows.some(r=>r.status==='complete'&&JSON.parse(String(r.result)).playback==='not-started'))return 'ready-to-play';return 'idle';}
 private async deleteOutput(id:string){const r=this.identity.db.prepare('SELECT audio_file FROM runtime_voice_jobs WHERE id=?').get(id);if(r?.audio_file){this.identity.db.prepare('UPDATE runtime_voice_jobs SET expires_at=0 WHERE id=?').run(id);await rm(join(this.outputDir,String(r.audio_file)),{force:true});this.identity.db.prepare('UPDATE runtime_voice_jobs SET audio_file=NULL,audio_mime=NULL,expires_at=NULL WHERE id=?').run(id);}}
 async cleanup(){this.trimClientDiagnostics();const rows=this.identity.db.prepare('SELECT id,actor_id,kind,created_at,expires_at FROM runtime_voice_jobs WHERE audio_file IS NOT NULL').all();for(const r of rows){const policy=this.options.audioRetention?.(String(r.actor_id))??'never';const expired=Number(r.expires_at)<=Date.now();const nowNever=policy==='never'&&(r.kind==='asr'||Date.parse(String(r.created_at))+10*60_000<=Date.now());if(expired||nowNever)await this.deleteOutput(String(r.id));}this.identity.db.prepare('DELETE FROM runtime_voice_wake WHERE at<?').run(new Date(Date.now()-86400_000).toISOString());}
 async purgeActorAudio(actorId:string){const rows=this.identity.db.prepare('SELECT id FROM runtime_voice_jobs WHERE actor_id=? AND audio_file IS NOT NULL').all(actorId);this.identity.db.prepare('UPDATE runtime_voice_jobs SET expires_at=0 WHERE actor_id=? AND audio_file IS NOT NULL').run(actorId);for(const r of rows)await this.deleteOutput(String(r.id));}
 purgeActorTranscripts(actorId:string,before:string){this.identity.db.prepare("UPDATE runtime_voice_jobs SET result='{}' WHERE actor_id=? AND kind='asr' AND created_at<? AND status NOT IN('running','queued')").run(actorId,before);}
 wake(terminalId:string,eventId:string,word:string){const previous=this.identity.db.prepare('SELECT sequence,at FROM runtime_voice_wake WHERE event_id=? AND terminal_id=?').get(eventId,terminalId);if(previous)return {...previous,replayed:true};const result=this.identity.db.prepare('INSERT INTO runtime_voice_wake(event_id,terminal_id,word,at) VALUES(?,?,?,?)').run(eventId,terminalId,word,at());return {sequence:Number(result.lastInsertRowid),accepted:true,origin:'authenticated-bridge',identityVerified:false};}
 wakeEvents(terminalId:string,after:number){return {events:this.identity.db.prepare('SELECT sequence,word,at FROM runtime_voice_wake WHERE terminal_id=? AND sequence>? ORDER BY sequence LIMIT 30').all(terminalId,after)};}
 async close(){if(this.stopped)return;this.stopped=true;clearInterval(this.cleanupTimer);for(const c of this.controllers.values())c.abort();await Promise.allSettled([...this.pending]);await this.cleanup();}
}

export function registerVoiceRuntimeRoutes(app:FastifyInstance,voice:VoiceRuntime){
 const identity=voice.identity;
 app.addContentTypeParser(/^audio\/(?:wav|x-wav|webm|ogg|opus|mpeg|mp3|mp4|m4a)(?:;.*)?$/,{parseAs:'buffer',bodyLimit:25*1024*1024},(_req,body,done)=>done(null,body));
 app.get('/api/runtime/voice/engines',runtimeHandler(req=>{identity.requireAdmin(req);return voice.state();}));
 app.get('/api/runtime/voice/engines/health',runtimeHandler(req=>{identity.requireAdmin(req);return voice.health();}));
 app.put('/api/runtime/voice/engines/:kind',runtimeHandler(req=>{identity.requireAdmin(req);const kind=z.enum(['asr','tts']).parse(req.params.kind);return voice.configure(kind,req.body);}));
 app.delete('/api/runtime/voice/engines/:kind',runtimeHandler(req=>{identity.requireAdmin(req);return voice.removeConfig(z.enum(['asr','tts']).parse(req.params.kind));}));
 app.get('/api/runtime/voice/state',runtimeHandler(req=>voice.memberState(identity.principal(req))));
 app.get('/api/runtime/voice/sessions',runtimeHandler(req=>voice.listSessions(identity.principal(req))));
 app.post('/api/runtime/voice/sessions',runtimeHandler(req=>{
  const p=identity.principal(req);const d=z.object({terminalId:z.string().min(1).max(128).default('local'),roomId:z.string().min(1).max(128).default('study'),conversationId:z.string().uuid().optional()}).strict().parse(req.body??{});
  let roomId=d.roomId;if(!p.administrator||d.terminalId!=='local'){const terminal=identity.terminal(req,d.terminalId,p);roomId=terminal.roomId;}
  return voice.createSession(p,d.terminalId,roomId,d.conversationId);
 }));
 app.get('/api/runtime/voice/sessions/:id',runtimeHandler(req=>voice.session(req.params.id,identity.principal(req))));
 app.get('/api/runtime/voice/sessions/:id/diagnostics',runtimeHandler((req,reply)=>{const p=identity.principal(req),s=voice.session(req.params.id,p);if(!p.administrator||s.terminalId!=='local')identity.terminal(req,s.terminalId,p);reply.header('Cache-Control','private, no-store');return voice.clientDiagnostics(p,s.id);}));
 app.post('/api/runtime/voice/sessions/:id/diagnostics',{bodyLimit:4096,config:{rateLimit:{max:30,timeWindow:'1 minute'}}},runtimeHandler((req,reply)=>{const p=identity.principal(req),s=voice.session(req.params.id,p);if(!p.administrator||s.terminalId!=='local')identity.terminal(req,s.terminalId,p);reply.header('Cache-Control','private, no-store');return voice.reportClientDiagnostics(p,s.id,req.body);}));
 app.post('/api/runtime/voice/sessions/:id/audio',{bodyLimit:25*1024*1024},runtimeHandler((req,reply)=>{
  const p=identity.principal(req);const s=voice.session(req.params.id,p);if(!p.administrator||s.terminalId!=='local')identity.terminal(req,s.terminalId,p);
  if(!Buffer.isBuffer(req.body))throw new RuntimeAccessError('INVALID_AUDIO','请直接上传二进制音频');const job=voice.submitAudio(p,s.id,req.body,String(req.headers['content-type']??''),req.headers['x-jarvis-cloud-consent']==='true',voiceLanguage.optional().parse(req.headers['x-jarvis-language']),req.headers['x-jarvis-wake-check']==='true');reply.code(202);return job;
 }));
 app.post('/api/runtime/voice/sessions/:id/speech',runtimeHandler((req,reply)=>{const p=identity.principal(req),{text,cloudConsent,playback,afterJobId}=z.object({text:z.string().trim().min(1).max(8000),cloudConsent:z.boolean().default(false),playback:playbackSchema.optional(),afterJobId:z.string().uuid().optional()}).strict().parse(req.body);const job=voice.submitSpeech(p,req.params.id,text,cloudConsent,playback,afterJobId);reply.code(202);return job;}));
 app.post('/api/runtime/voice/sessions/:id/interrupt',runtimeHandler(req=>{const d=z.object({muted:z.boolean().optional()}).strict().parse(req.body??{});return voice.interrupt(identity.principal(req),req.params.id,d.muted);}));
 app.delete('/api/runtime/voice/sessions/:id',runtimeHandler(req=>voice.closeSession(identity.principal(req),req.params.id)));
 app.get('/api/runtime/voice/catalog',runtimeHandler(async req=>{const principal=identity.principal(req);await voice.health();if(!identity.isPrincipalCurrent(principal))throw new RuntimeAccessError('UNAUTHORIZED','身份已失效',401);return voice.catalog(principal);}));
 app.put('/api/runtime/voice/preference',runtimeHandler(async req=>{const principal=identity.principal(req),{voiceId}=z.object({voiceId:voiceIdSchema}).strict().parse(req.body);await voice.health();if(!identity.isPrincipalCurrent(principal))throw new RuntimeAccessError('UNAUTHORIZED','身份已失效',401);return voice.chooseVoice(principal,voiceId);}));
 app.get('/api/runtime/voice/jobs/:id',runtimeHandler(req=>voice.job(req.params.id,identity.principal(req))));
 app.post('/api/runtime/voice/jobs/:id/cancel',runtimeHandler(req=>voice.cancel(req.params.id,identity.principal(req))));
 app.get('/api/runtime/voice/jobs/:id/audio',runtimeHandler(async(req,reply)=>{const audio=await voice.audio(req.params.id,identity.principal(req));return reply.type(audio.mime).header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').send(audio.bytes);}));
 app.post('/api/runtime/voice/jobs/:id/playback',runtimeHandler(req=>{const {state}=z.object({state:z.enum(['started','ended','interrupted','blocked'])}).strict().parse(req.body);return voice.playback(req.params.id,identity.principal(req),state);}));
 app.post('/api/runtime/voice/wake',{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},runtimeHandler(req=>{
  const d=z.object({terminalId:z.string().min(1).max(128),eventId:z.string().uuid(),wakeWord:z.string().min(1).max(100)}).strict().parse(req.body);const terminal=identity.terminal(req,d.terminalId);
  const accepted=terminal.allowedProfileIds.some(id=>{const profile=identity.options.memberProfile(id);return profile&&String(profile.wakeWord??'贾维斯')===d.wakeWord;});if(!accepted)throw new RuntimeAccessError('WAKE_WORD_MISMATCH','唤醒词不在当前终端成员设置中',422);
  return voice.wake(terminal.terminalId,d.eventId,d.wakeWord);
 }));
 app.get('/api/runtime/voice/wake',runtimeHandler(req=>{const d=z.object({terminalId:z.string().min(1).max(128),after:z.coerce.number().int().min(0).default(0)}).strict().parse(req.query);const terminal=identity.terminal(req,d.terminalId);return voice.wakeEvents(terminal.terminalId,d.after);}));
}

