import { randomUUID } from 'node:crypto';
import type { PiService } from '../pi.js';
import type { VoiceRuntime } from './voice.js';
import { V1Repository, type CommandReceipt } from '../v1/repository.js';
import { BusinessError, type Domain, type DomainHandler, type CommandEnvelope } from '../v1/types.js';
import { jobHandler } from '../v1/job-domains.js';

/** Compatibility dispatch for original research and voice commands, using the real workers. */
export class PlatformRuntime {
 private timer?:ReturnType<typeof setInterval>;
 constructor(private repository:V1Repository,private pi:PiService,private voice:VoiceRuntime,private options:{machine:(id:string)=>Record<string,any>|undefined;stopped:()=>boolean}){}
 async dispatch(domain:Domain,command:string,envelope:CommandEnvelope,actorId:string):Promise<CommandReceipt|undefined>{
  if(!((domain==='research'&&['start','pause'].includes(command))||(domain==='voice'&&command==='tts')||(domain==='settings'&&command==='pi-provider')))return;
  const previous=this.repository.replay(domain,command,envelope,actorId);if(previous)return previous;
  const p=envelope.payload;
  if(domain==='settings'){
   if(envelope.scope!=='personal'||envelope.expectedVersion!==0)throw new BusinessError('VALIDATION','新模型选择须使用本人范围和版本0');
   if(p.credentialRef)throw new BusinessError('VALIDATION','Pi凭据由原生配置页管理，此接口不接受自定义凭据位置');
   await this.pi.configure({provider:p.provider,model:p.model});
   const handler:DomainHandler={domain,commands:[command],execute:(_command,_p,c)=>{const data=c.create('settings',{kind:'model-capability',capability:'dialogue',status:this.pi.health().configured?'connected':'credentials-required',provider:p.provider,model:p.model,runtimeConnected:this.pi.health().configured,createdAt:c.now,updatedAt:c.now});c.emit('settings',data.id,'pi-model-configured',{provider:p.provider,model:p.model});return data;}};
   return this.repository.execute(handler,command,envelope,actorId,this.options.machine);
  }
  if(domain==='voice'){
   if(!this.voice.getConfig('tts'))throw new BusinessError('NOT_CONFIGURED','请先配置真实TTS引擎',503);
   const handler:DomainHandler={domain,commands:[command],execute:(_command,_p,c)=>{const session=c.require('voice',p.sessionId);c.check(session);if(session.profileId!=='me')throw new BusinessError('FORBIDDEN','语音会话身份无效',403);const data=c.update('voice',session.id,{audioTransport:'central-runtime',speech:{status:'requested',jobId:null},updatedAt:c.now});c.emit('voice',data.id,'speech-requested');return data;}};
   const accepted=this.repository.execute(handler,command,envelope,actorId,this.options.machine);
   let speech:Record<string,any>;
   try{const principal={actorId,profileId:'me',administrator:true};const session=this.voice.createSession(principal,'local',String(accepted.data.roomId||'study'));const job=this.voice.submitSpeech(principal,session.id,String(p.text));speech={status:job.status,jobId:job.id,sessionId:session.id,audioUrl:`/api/runtime/voice/jobs/${job.id}/audio`,playback:'not-started'};}catch{speech={status:'failed',jobId:null,error:'语音作业未提交，请核查引擎配置'};}
   const update:DomainHandler={domain,commands:['speech-linked'],execute:(_c,_p,c)=>{const session=c.require('voice',accepted.data.id);c.check(session);const r=c.update('voice',session.id,{speech,updatedAt:c.now});c.emit('voice',r.id,'speech-linked',{jobId:speech.jobId,status:speech.status});return r;}};
   const final=this.repository.execute(update,'speech-linked',{commandId:randomUUID(),expectedVersion:accepted.data.revision,scope:accepted.data.scope,payload:{}},actorId,this.options.machine);
   const receipt={...final,events:[...accepted.events,...final.events]};this.repository.completeReceipt(actorId,envelope.commandId,receipt);return receipt;
  }
  const handler:DomainHandler={domain:'research',commands:[command],execute:(_command,_p,c)=>{
   const research=c.require('research',p.researchId);c.check(research);
   if(research.status==='converted')throw new BusinessError('REVIEW_REQUIRED','已立项研究不能覆盖',422);
   if(command==='pause'){
    const job=research.jobId?c.get('jobs',research.jobId):undefined;
    if(!job||!['queued','running'].includes(job.status))throw new BusinessError('CONFLICT','没有正在执行的研究',409);
    jobHandler.execute('cancel',{jobId:job.id},{...c,expectedVersion:job.revision,check:record=>{if(record.id!==job.id||record.revision!==job.revision)throw new BusinessError('CONFLICT','研究作业已更新',409);}});
    const r=c.update('research',research.id,{status:'paused',blockReason:p.reason,updatedAt:c.now});c.emit('research',r.id,'research-paused',{jobId:job.id});return r;
   }
   if(this.options.stopped())throw new BusinessError('REVIEW_REQUIRED','平台已暂停新的研究',422);
   if(!this.pi.health('research').configured)throw new BusinessError('NOT_CONFIGURED','请先配置Pi模型',503);
   const machine=this.options.machine(p.plan.machineId);if(!machine||machine.readOnly||machine.scope==='company'||envelope.scope==='company')throw new BusinessError('FORBIDDEN','研究节点不存在或仅允许观察',403);
   if(p.plan.machineId!=='local')throw new BusinessError('VALIDATION','Pi研究由中央平台运行，请选择当前平台节点');
   if(c.list('jobs').some(j=>j.kind==='research'&&j.sourceId===research.id&&['queued','running'].includes(j.status)))throw new BusinessError('CONFLICT','研究已有活动作业',409);
   const next=c.update('research',research.id,{question:p.question,criteria:p.criteria,plan:p.plan,budget:p.plan.budget,minutesLimit:p.plan.minutes,status:'researching',updatedAt:c.now});
   const job=jobHandler.execute('create',{kind:'research',title:research.title,instruction:`研究问题：${p.question}\n判断标准：${p.criteria}\n结合原始想法、已有证据与候选方案，提出可核对的分析和补充证据建议。未知来源不得当成事实。不自动采纳、立项或执行。`,sourceId:next.id,sourceVersion:next.revision},{...c,expectedVersion:0,executorReady:()=>true});
   const linked=c.update('research',research.id,{jobId:job.id,backgroundResult:null});
   c.update('jobs',job.id,{sourceVersion:linked.revision,sourceSnapshot:linked,execution:{...job.execution,managedResearch:true,budgetUSD:p.plan.budget}});
   c.emit('research',research.id,'research-queued',{jobId:job.id,engine:'pi-sdk'});return linked;
  }};
  return this.repository.execute(handler,command,envelope,actorId,this.options.machine,this.options.stopped);
 }
 start(){this.timer=setInterval(()=>this.reconcile(),500);this.timer.unref();}
 private reconcile(){const actor='server-admin';for(const research of this.repository.list('research',actor).filter(r=>r.status==='researching'&&r.jobId)){
  const job=this.repository.read('jobs',research.jobId,actor);if(!job||!['completed','failed','cancelled','interrupted'].includes(job.status))continue;
  const handler:DomainHandler={domain:'research',commands:['background-settled'],execute:(_cmd,_p,c)=>{const r=c.require('research',research.id);c.check(r);const next=c.update('research',r.id,{status:job.status==='completed'?'discussion':job.status==='cancelled'?'paused':'blocked',backgroundResult:{jobId:job.id,status:job.status,sourceStale:!!job.sourceStale,verification:'ai-unverified',finishedAt:job.finishedAt},updatedAt:c.now});c.emit('research',next.id,'background-settled',{jobId:job.id,status:job.status});return next;}};
  try{this.repository.execute(handler,'background-settled',{commandId:randomUUID(),expectedVersion:research.revision,scope:research.scope,payload:{}},actor,this.options.machine);}catch{}
 }}
 close(){if(this.timer)clearInterval(this.timer);}
}
