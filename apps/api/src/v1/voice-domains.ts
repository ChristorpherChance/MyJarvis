import { randomUUID } from 'node:crypto';
import { BusinessError, type DomainHandler, type CommandContext } from './types.js';
import { captureHandlers } from './capture-domains.js';
import { jobHandler } from './job-domains.js';
const need=(ok:unknown,message:string,status=400)=>{if(!ok)throw new BusinessError(status===403?'FORBIDDEN':status===409?'CONFLICT':status===503?'NOT_CONFIGURED':'VALIDATION',message,status)};
export const voiceHandler:DomainHandler={domain:'voice',commands:['session','transcript','intent','confirm','interrupt','tts'],execute(command,p,c){
 if(command==='session'){
  need(c.expectedVersion===0,'新会话版本必须为0',409);need(p.profileId===undefined||p.profileId==='me','当前只支持已认证管理员语音会话',403);
  need(!p.identityToken,'家庭独立身份令牌尚未接入',503);need(c.machine(p.terminalId),'终端不存在');
  const r=c.create('voice',{kind:'session',terminalId:p.terminalId,roomId:p.roomId||'study',profileId:'me',status:'idle',turn:0,transcripts:[],intents:[],jobId:null,lastReceipt:null,identity:'authenticated-administrator',audioTransport:'not-configured',createdAt:c.now,updatedAt:c.now});c.emit('voice',r.id,'created');return r;
 }
 const r=c.require('voice',p.sessionId);c.check(r);
 if(command==='transcript'){
  need(p.origin==='manual','中央ASR尚未接入，不能把人工文字标为ASR结果',503);
  need(typeof p.text==='string'&&p.text.trim()&&p.text.length<=20000,'请填写有效语句');
  need(!r.jobId||!['queued','running'].includes(c.get('jobs',r.jobId)?.status),'当前意图正在分析，请先打断',409);
  const turn=r.turn+1,id=randomUUID();const next=c.update('voice',r.id,{turn,status:'transcribed',jobId:null,intents:[],transcripts:[...r.transcripts,{id,turn,text:p.text,final:p.final===true,origin:'manual',language:p.language||'中文',at:c.now}],updatedAt:c.now});c.emit('voice',r.id,'transcript',{transcriptId:id,turn,final:p.final===true});return next;
 }
 if(command==='intent'){
  const transcript=r.transcripts.find((t:any)=>t.id===p.transcriptId&&t.turn===r.turn&&t.final);need(transcript,'请选择当前已结束的语句');
  const job=jobHandler.execute('create',{kind:'intent',title:'语音意图分析',instruction:transcript.text,sourceId:r.id,sourceVersion:r.revision},{...c,expectedVersion:0});
  const next=c.update('voice',r.id,{status:'analyzing',jobId:job.id,updatedAt:c.now});c.emit('voice',r.id,'analyzing',{jobId:job.id,turn:r.turn});return next;
 }
 if(command==='intent-result'){
  need(r.status==='analyzing'&&r.jobId===p.jobId,'这轮分析已打断或失效',409);
  const transcript=r.transcripts.find((t:any)=>t.turn===r.turn&&t.final);need(transcript,'会话轮次无效',409);
  const effects:Record<string,string>={chat:'继续对话，先带回输入框；不会创建任务。','inbox.capture':'仅将原话保存到灵感收件，不开始研究或开发。','research.create':'仅新建待讨论的研究记录，不启动执行器。'};
  const alternatives=(p.alternatives as any[]).map(a=>({id:randomUUID(),title:a.title,command:a.command,effect:effects[a.command],requiresConfirmation:true,rawText:transcript.text}));
  const intent={id:randomUUID(),turn:r.turn,status:'proposed',transcriptId:transcript.id,alternatives,at:c.now};
  const next=c.update('voice',r.id,{status:'proposed',intents:[intent],updatedAt:c.now});c.emit('voice',r.id,'proposed',{intentId:intent.id,alternatives:alternatives.length});return next;
 }
 if(command==='analysis-failed'){
  need(r.status==='analyzing'&&r.jobId===p.jobId,'这轮分析已打断或失效',409);
  const next=c.update('voice',r.id,{status:'failed',error:String(p.error||'意图分析未完成'),updatedAt:c.now});c.emit('voice',r.id,'failed',{jobId:p.jobId});return next;
 }
 if(command==='confirm'){
  need(p.confirmed===true,'请明确确认');const intent=r.intents.find((i:any)=>i.id===p.intentId&&i.turn===r.turn&&i.status==='proposed');need(intent,'意图已过期或已处理',409);
  const alternative=intent.alternatives.find((a:any)=>a.id===p.alternativeId);need(alternative,'选项不存在');need(p.targetVersion===0,'新建目标版本必须为0',409);
  let target:any=null;const child:CommandContext={...c,expectedVersion:0};
  if(alternative.command==='inbox.capture')target=captureHandlers.find(h=>h.domain==='inbox')!.execute('capture',{title:alternative.title.slice(0,100),rawText:alternative.rawText,kind:'idea',terminalId:r.terminalId,origin:'manual'},child);
  else if(alternative.command==='research.create')target=captureHandlers.find(h=>h.domain==='research')!.execute('create',{title:alternative.title.slice(0,100),raw:alternative.rawText,terminalId:r.terminalId},child);
  else need(alternative.command==='chat','该意图动作尚未开放',503);
  const next=c.update('voice',r.id,{status:'confirmed',intents:r.intents.map((i:any)=>i.id===intent.id?{...i,status:'confirmed',alternativeId:alternative.id,confirmedAt:c.now}:i),lastReceipt:{command:alternative.command,targetId:target?.id??null,targetDomain:alternative.command==='inbox.capture'?'inbox':alternative.command==='research.create'?'research':null,executed:!!target,at:c.now},updatedAt:c.now});c.emit('voice',r.id,'confirmed',{command:alternative.command,targetId:target?.id??null});return next;
 }
 if(command==='interrupt'){
  if(r.jobId){const job=c.get('jobs',r.jobId);if(job&&['queued','running'].includes(job.status)){c.update('jobs',job.id,{status:'cancelled',finishedAt:c.now,updatedAt:c.now});c.emit('jobs',job.id,'cancelled')}}
  const next=c.update('voice',r.id,{status:'idle',intents:r.intents.map((i:any)=>i.status==='proposed'?{...i,status:'cancelled'}:i),updatedAt:c.now});c.emit('voice',r.id,'interrupted',{turn:r.turn});return next;
 }
 if(command==='tts')throw new BusinessError('NOT_CONFIGURED','中央TTS音频服务尚未配置，未生成或播放音频',503);
 throw new BusinessError('VALIDATION','未知语音命令');
}};
