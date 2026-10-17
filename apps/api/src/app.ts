import Fastify from 'fastify';
import {fileURLToPath} from 'node:url';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { z } from 'zod';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Store, StoreAccessError } from './store.js';
import { PiService, PiServiceError, type PiCallbacks } from './pi.js';
import { gatewayDefinitionSchema, priceSchema, conversationRoutingSchema, routingDocumentSchema, scenarioSchema, selectionSchema } from './pi-routing.js';
import { randomUUID } from 'node:crypto';
import { registerV1 } from './v1/routes.js';
import { BusinessError } from './v1/types.js';
import { V1Repository } from './v1/repository.js';
import { IdentityRuntime, registerIdentityRoutes, runtimeOwnAuthRoute, RuntimeAccessError } from './runtime/identity.js';
import { VoiceRuntime, registerVoiceRuntimeRoutes } from './runtime/voice.js';
import { KnowledgeRuntime, registerKnowledgeRuntime } from './runtime/knowledge-runtime.js';
import {registerFamilyKnowledgeRoutes} from './runtime/family-knowledge.js';
import {registerOfflineDraftSync} from './runtime/offline-draft-sync.js';
import {registerEvidenceAssistantRoutes,evidenceAssistantOwnAuth} from './runtime/evidence-assistant.js';
import { ExecutionRuntime } from './runtime/execution-runtime.js';
import { registerExecutionRoutes, isExecutionProtocolPath } from './runtime/execution-routes.js';
import { GovernanceRuntime, registerGovernanceRoutes } from './runtime/governance.js';
import { MemoryRuntime } from './runtime/memory.js';
import { PiDevelopmentService } from './runtime/pi-development.js';
import { PlatformRuntime } from './runtime/platform-runtime.js';
import {VoiceIntentRuntime,registerVoiceIntentRoutes} from './runtime/voice-intents.js';
import {NotificationRuntime,registerNotificationRoutes,notificationOwnAuthRoute} from './runtime/notifications.js';
import {WeatherRuntime,registerWeatherRoutes,createWeatherTools} from './runtime/weather-runtime.js';
import {CompanionRuntime,registerCompanionRoutes,registerCompanionVoiceRoute,createCompanionTools} from './runtime/companion.js';
import type {DomainHandler} from './v1/types.js';
import {createMonitoringTools} from './runtime/monitor-tools.js';
import {createNotificationTools} from './runtime/notification-tools.js';
import {BillingRuntime,registerBillingRoutes} from './runtime/billing.js';
import {createBillingTools} from './runtime/billing-tools.js';
import type {WeatherProvider} from './runtime/weather-provider.js';
import {ClusterRuntime,registerClusterRoutes,createClusterTools,PLATFORM_BUILD,type NodeConfiguration} from './runtime/cluster-runtime.js';
import {canonicalLocalMachine,unifiedDevices} from './runtime/managed-devices.js';
import {ApplicationRuntime,registerApplicationRoutes,createApplicationTools} from './runtime/application-runtime.js';
import {RemoteOperationsRuntime,registerRemoteOperations,createRemoteOperationsTools} from './runtime/remote-operations.js';
import {PowerRuntime,registerPowerRoutes,createPowerTool} from './runtime/power-runtime.js';
import {WebRuntime,registerWebRoutes,webOwnAuthRoute,createWebTools} from './runtime/web-runtime.js';
import {familyHandlers} from './v1/family-domains.js';
import {resolveReplyLanguage} from './runtime/conversation-language.js';
import {SoftwareFactoryRuntime,registerSoftwareFactoryRoutes,createSoftwareFactoryTools} from './runtime/software-factory-runtime.js';
import {ProjectAutonomyRuntime} from './runtime/project-autonomy-runtime.js';
import {ProjectSupervisionPlanRuntime} from './runtime/project-supervision-plan-runtime.js';
import {registerProjectSupervisionPlanRoutes} from './runtime/project-supervision-plan-routes.js';
import {SupervisionWorkRuntime} from './runtime/supervision-work-runtime.js';
import {registerSupervisionWorkRoutes} from './runtime/supervision-work-routes.js';
import {ProjectSupervisorRuntime} from './runtime/project-supervisor-runtime.js';
import {registerProjectSupervisorRoutes} from './runtime/project-supervisor-routes.js';
import {createProjectSupervisorModel} from './runtime/project-supervisor-model.js';
import {registerProjectAutonomyRoutes} from './runtime/project-autonomy-routes.js';
import {ProjectDecisionRuntime} from './runtime/project-decision-runtime.js';
import {registerProjectDecisionRoutes} from './runtime/project-decision-routes.js';
import {searchAuthorizedKnowledge,searchAuthorizedMemories} from './runtime/personal-retrieval.js';
import {parseInboxDocument} from './runtime/inbox-document-parser.js';

const ACTOR = 'server-admin';
const COOKIE = 'jarvis_session';
const now = () => new Date().toISOString();
const text = (max = 200) => z.string().trim().min(1).max(max);
const optionalText = (max = 2000) => z.string().trim().max(max).default('');
class ApiError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
const schemas = {
  members: z.object({ name: text(60), role: z.enum(['adult','child','elder']), voice: optionalText(100).default('默认'), wakeWord: optionalText(100).default('贾维斯'), preferences: optionalText(4000) }).strict(),
  devices: z.object({ name: text(100), role: text(100), host: optionalText(200), address: optionalText(200), cpu: optionalText(200), memoryGB: z.coerce.number().min(0).max(4096).default(0) }).strict(),
  projects: z.object({ name: text(100), description: optionalText(4000), deviceId: optionalText(100), status: z.enum(['planned','active','paused','delivered']).default('planned'), path: optionalText(1000) }).strict(),
  tasks: z.object({ title: text(200), projectId: optionalText(100), notes: optionalText(8000), executor: z.literal('manual').default('manual'), status: z.literal('queued').default('queued') }).strict(),
  experiences: z.object({ title: text(200), content: text(16000), tags: z.array(text(40)).max(12).default([]), memberId: z.literal('owner').default('owner'), projectId: optionalText(100), source: optionalText(300).default('管理控制台'), status: z.literal('inbox').default('inbox') }).strict(),
};
const capabilities = [
  {id:'console',name:'管理控制台',status:'ready',description:'真实本机状态与登记数据'},
  {id:'projects',name:'项目台账',status:'ready',description:'项目、人工任务与经验留存'},
  {id:'pi',name:'Pi 智能对话',status:'ready',description:'配置模型后使用真实 SDK 会话'},
  {id:'voice',name:'房间语音',status:'ready',description:'中央ASR/Pi/TTS、房间配对与成员认证；先在书房验证收音'},
  {id:'supervisor',name:'开发监督',status:'ready',description:'受控执行器、实际日志、预算与独立验收；节点需配置'},
  {id:'knowledge',name:'知识神殿',status:'ready',description:'真实多轮OCR、疑点人工校对、引用与课程候选'},
  {id:'memory',name:'家庭记忆',status:'ready',description:'成员隔离、候选确认、按策略整理与文字清理'},
  {id:'web',name:'联网资料',status:'ready',description:'真实搜索、公开网页与新闻源；按本人隐私策略查询'},
  {id:'connectors',name:'外部知识',status:'ready',description:'动态目录与HTTP知识源、真实同步及授权过滤'},
];
export async function createApp(options: {dataDir: string; pi?: PiService; webDir?: string; pythonExecutable?:string; whisperModelDirectory?:string; weatherProvider?:WeatherProvider; allowedHosts?:string[]; tls?:{key:Buffer;cert:Buffer};healthInstanceId?:string;nodeConfiguration?:NodeConfiguration|null;remoteOperations?:{queue?:string;configPath?:string}}) {
  let shuttingDown=false;
  const startupCleanup:(()=>unknown|Promise<unknown>)[]=[];let startupApp:ReturnType<typeof Fastify>|undefined;
  try {
  const workspaceRoot=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
  if(options.nodeConfiguration?.role==='standby')throw new Error('Standby role blocks business startup');
  const store = new Store(options.dataDir);
  const cluster = new ClusterRuntime(options.nodeConfiguration ?? null);
  startupCleanup.push(()=>cluster.close());
  startupCleanup.push(()=>store.close());
  let v1:V1Repository|undefined = new V1Repository(store.databasePath);
  startupCleanup.push(()=>v1?.close());
  const governance = new GovernanceRuntime(store);
  startupCleanup.push(()=>governance.close());
  const billing=new BillingRuntime(store);
  startupCleanup.push(()=>billing.close());
  let knowledge: KnowledgeRuntime | undefined;
  let weather:WeatherRuntime|undefined;
  let web:WebRuntime|undefined;
  let notifications:NotificationRuntime|undefined;
  let companion:CompanionRuntime|undefined;
  let applications:ApplicationRuntime|undefined;
  let remoteOps:RemoteOperationsRuntime|undefined;
  const administratorCallbacks:PiCallbacks = {
    listProjects: () => [...store.list('projects'),...(v1?.list('projects',ACTOR)??[])], listDevices: () => unifiedDevices(devices(),v1?.list('machines',ACTOR)??[]),
    listTasks: () => [...store.list('tasks'),...(v1?.list('tasks',ACTOR)??[])], listExperiences: () => [...store.list('experiences'),...(v1?.list('experiences',ACTOR)??[])],
    listInbox:()=>v1?.list('inbox',ACTOR)??[],listResearch:()=>v1?.list('research',ACTOR)??[],listReleases:()=>v1?.list('releases',ACTOR)??[],
    listKnowledge:()=>{const books=(v1?.list('books',ACTOR)??[]).filter(r=>{const source=v1?.read('sources',r.source,ACTOR);return r.kind==='book'&&r.status==='published'&&source?.scope===r.scope&&source.active&&source.authorized});return [...books.map(r=>({id:r.id,title:r.title,version:r.version,source:r.source,pageTexts:(r.pageTexts??[]).map((p:any)=>({page:p.page,text:p.text}))})),...(v1?.list('stories',ACTOR)??[]).filter(r=>r.status==='published'&&r.released&&!r.dirty&&books.some(b=>b.id===r.book&&b.version===r.version)),...(knowledge?.authorizedKnowledgeEntries(ACTOR)??[])];},
    listMemory:()=> (v1?.list('memory',ACTOR)??[]).filter(r=>r.kind==='memory'&&r.profileId==='me'&&r.scope==='private'&&r.status==='active').map(r=>({id:r.id,title:r.title,text:r.text,category:r.category,revision:r.revision})),
    searchKnowledge:query=>v1?searchAuthorizedKnowledge(v1,ACTOR,query):[],
    searchMemory:query=>v1?searchAuthorizedMemories(v1,ACTOR,query):[],
    listFamily:()=> (v1?.list('family',ACTOR)??[]).filter(r=>r.kind==='todo'&&r.scope==='family'&&r.status!=='removed'),
    listServices:()=>v1?.list('services',ACTOR)??[],
  };
  const pi = options.pi ?? new PiService(options.dataDir, administratorCallbacks);
  startupCleanup.push(()=>pi.dispose());await pi.initialize();
  if (typeof pi.setLifecycleHooks === 'function') pi.setLifecycleHooks({beforeRun:meta=>governance.beforeRun(meta,meta.recordOnly?0:undefined,{recordOnly:meta.recordOnly===true}),onUsage:governance.recordUsage,afterRun:governance.afterRun});
  const app = Fastify({logger:false, pluginTimeout:60000, bodyLimit:128 * 1024, trustProxy:false,...(options.tls?{https:options.tls}:{})});
  startupApp=app;
  await app.register(cookie);
  await app.register(rateLimit, {max:300,timeWindow:'1 minute',allowList:req=>!(req.routeOptions.url?.startsWith('/api/')||req.url.split('?')[0].startsWith('/api/'))});
  const runs = new Set<string>();
  function devices() {
    const addresses=Object.values(os.networkInterfaces()).flatMap(items=>(items??[]).map(item=>item.address));
    const canonical=canonicalLocalMachine(v1?.list('machines',ACTOR)??[],addresses);
    return store.list('devices').map(d => d.id === 'local' ? {...d,...(canonical?{canonicalMachineId:canonical.id,role:canonical.role}:{}),status:'online',memoryGB:Math.round(os.totalmem()/2**30*10)/10,lastSeen:now()} : {...d,status:'unknown',lastSeen:null});
  }
  const actualMember=(id:string)=>{if(id==='me'||id==='owner')return store.get('members','owner');const member=store.get('members',id);if(member)return member;const profile=v1!.read('personas',id,ACTOR);return profile?.kind==='profile'&&profile.status==='registered'?profile:undefined;};
  const memberProfile=(id:string)=>{const member=actualMember(id);if(!member)return undefined;const persona=v1!.list('personas',ACTOR).find(p=>p.kind==='persona'&&p.profileId===(id==='owner'?'me':id));return {...member,...persona,id,name:String(member.name),voice:String(persona?.voiceId??member.voice??'默认'),wakeWord:String(persona?.wakeWord??member.wakeWord??'贾维斯'),preferences:{base:member.preferences??'',pace:persona?.pace??'normal',dailyVoiceMinutes:persona?.dailyVoiceMinutes??30,autoSpeak:persona?.autoSpeak??true,language:persona?.language??'中文',replyLanguage:persona?.replyLanguage??'auto',replyLanguageRevision:persona?.revision??0,address:persona?.address??member.name,replyStyle:persona?.replyStyle??'清晰自然',cloudPrivacy:persona?.cloudPrivacy??'ask',quietStart:persona?.quietStart??'',quietEnd:persona?.quietEnd??'',timezone:persona?.timezone??'Asia/Shanghai'}};};
  let memory: MemoryRuntime;
  const identity:IdentityRuntime = new IdentityRuntime(store,{memberExists:id=>!!actualMember(id),memberProfile,setReplyLanguage:(principal,input)=>{
    if(!identity.isPrincipalCurrent(principal)||principal.administrator&&(principal.actorId!==ACTOR||principal.profileId!=='me'))throw new RuntimeAccessError('IDENTITY_CHANGED','当前成员身份已变化，请重新登录',401);
    const profile=identity.profile(principal);if(profile.id!==principal.profileId)throw new RuntimeAccessError('PROFILE_FORBIDDEN','只能修改当前已验证成员的回复语言',403);
    const base=familyHandlers.find(handler=>handler.domain==='personas')!;
    const handler:DomainHandler={...base,execute:(command,payload,context)=>base.execute(command,payload,{...context,emit:(domain,id,event,data)=>context.emit(domain,id,event,{...data,authenticatedActorId:principal.actorId,preferenceSource:'authenticated-member'})})};
    try{const receipt=v1!.execute(handler,'reply-language',{commandId:randomUUID(),expectedVersion:input.expectedVersion,scope:'private',payload:{profileId:principal.profileId,replyLanguage:input.replyLanguage}},ACTOR,()=>undefined,()=>false,()=>{},{member:actualMember});store.audit('family.reply-language',principal.profileId,{actorId:principal.actorId,replyLanguage:input.replyLanguage,revision:receipt.version});return identity.profile(principal);}
    catch(error){if(error instanceof BusinessError)throw new RuntimeAccessError(error.code,error.message,error.status);throw error;}
  },terminalExists:id=>id==='local'||v1!.list('settings',ACTOR).some(t=>t.kind==='terminal'&&t.id===id&&t.enabled!==false),callbacksForMember:(profileId,actorId,principal,context)=>{
    const current=()=>{if(principal&&(principal.actorId!==actorId||principal.profileId!==profileId||!identity.isPrincipalCurrent(principal)))throw new RuntimeAccessError('IDENTITY_CHANGED','当前成员身份已变化，请重新登录',401);};
    const checked=<T>(read:()=>T)=>()=>{current();return read();};
    const owner=profileId==='me';const shared=(domain:any)=>v1!.list(domain,ACTOR).filter(r=>owner||r.scope==='family');
    const books=()=>shared('books').filter(r=>{const source=v1!.read('sources',r.source,ACTOR);return r.kind==='book'&&r.status==='published'&&source?.scope===r.scope&&source.active&&source.authorized;});
    const externalKnowledge=()=>{const entries=knowledge?.authorizedKnowledgeEntries(ACTOR)??[];return owner?entries:entries.filter(entry=>entry.scope==='family'&&v1!.read('sources',String(entry.sourceId??entry.source),ACTOR)?.scope==='family');};
    return {listProjects:()=>owner?[...store.list('projects'),...v1!.list('projects',ACTOR)]:[],listDevices:()=>owner?unifiedDevices(devices(),v1!.list('machines',ACTOR)):[],listTasks:()=>owner?[...store.list('tasks'),...v1!.list('tasks',ACTOR)]:[],listExperiences:()=>shared('experiences'),listInbox:()=>owner?v1!.list('inbox',ACTOR):[],listResearch:()=>owner?v1!.list('research',ACTOR):[],listReleases:()=>owner?v1!.list('releases',ACTOR):[],listMemory:checked(()=>v1!.list('memory',actorId,'private').filter(r=>r.kind==='memory'&&r.profileId==='me'&&r.status==='active')),searchMemory:query=>{current();return searchAuthorizedMemories(v1!,actorId,query);},listFamily:()=>v1!.list('family',ACTOR,'family').filter(r=>r.kind==='todo'&&r.status!=='removed'),listKnowledge:checked(()=>{const available=books();return [...available,...shared('stories').filter(s=>s.status==='published'&&!s.dirty&&available.some(b=>b.id===s.book&&b.version===s.version)),...externalKnowledge()];}),searchKnowledge:query=>{current();return searchAuthorizedKnowledge(v1!,ACTOR,query,!owner);},listServices:()=>owner?v1!.list('services',ACTOR):[],readOnlyTools:()=>principal?[...(weather?createWeatherTools(weather,principal):[]),...(web?createWebTools(web,principal,{networkConsent:()=>context?.cloudConsent===true}):[]),...(notifications?createNotificationTools(notifications,principal):[]),...(companion?createCompanionTools(companion,principal):[]),...(owner?[...createMonitoringTools(execution,identity,principal),...createClusterTools(cluster,identity,principal),...createSoftwareFactoryTools(softwareFactory,principal)]:[]),...(owner&&principal.administrator?createBillingTools(billing,identity,principal):[]),...(owner&&applications&&principal.administrator?createApplicationTools(applications,principal):[]),...(owner&&principal.administrator?[createPowerTool(power,()=>identity.isPrincipalCurrent(principal))]:[]),...(owner&&remoteOps&&principal.administrator?createRemoteOperationsTools(remoteOps,principal):[])]:[]};
  },onConversationComplete:(actorId,id)=>memory.onConversationComplete(actorId,id)});
  startupCleanup.push(()=>identity.close());
  const pythonExecutable=options.pythonExecutable??process.env.JARVIS_PYTHON??resolve(workspaceRoot,'.runtime-venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const voice = new VoiceRuntime(options.dataDir,identity,{pi,store,governance,audioProbeExecutable:pythonExecutable,audioRetention:actor=>memory?.audioRetention(actor)??'never'});
  startupCleanup.push(()=>voice.close());
  applications=new ApplicationRuntime(identity,v1,options.dataDir,fetch,()=>stopped());
  startupCleanup.push(()=>applications!.close());
  const actorPrivacy=(actor:string)=>{if(actor===ACTOR)return memberProfile('me')?.preferences.cloudPrivacy??'ask';const credential=identity.db.prepare('SELECT profile_id FROM runtime_member_credentials WHERE id=?').get(actor.replace(/^member_/,''));return credential?memberProfile(String(credential.profile_id))?.preferences.cloudPrivacy??'ask':'local';};
  memory=new MemoryRuntime(v1,store,pi,{principal:req=>identity.principal(req),cloudAllowed:async(actor,cloudConsent)=>{const privacy=actorPrivacy(actor);return privacy==='allowed'||privacy==='ask'&&cloudConsent||(typeof pi.modelIsLocal==='function'&&await pi.modelIsLocal('memory'));},requireLocalModel:(actor,cloudConsent)=>{const privacy=actorPrivacy(actor);return privacy==='local'||privacy==='ask'&&!cloudConsent;},purgeTranscripts:(actor,before)=>voice.purgeActorTranscripts(actor,before),purgeActorAudio:actor=>voice.purgeActorAudio(actor)});
  startupCleanup.push(()=>memory.close());
  const whisperModel=options.whisperModelDirectory??process.env.JARVIS_WHISPER_MODEL??join(options.dataDir,'runtime','models','whisper-tiny');
  if(existsSync(pythonExecutable)&&existsSync(join(whisperModel,'model.bin'))&&!voice.getConfig('asr'))voice.configure('asr',{adapter:'command',executable:pythonExecutable,args:[resolve(workspaceRoot,'apps/api/resources/voice/asr_faster_whisper.py'),'--input','{input}','--output','{output}','--model','{model}','--language','{language}'],model:whisperModel,language:'zh',format:'wav',timeoutMs:180000});
  const executionPolicy=()=>[...v1!.list('settings',ACTOR).filter(r=>r.kind==='policy'),...v1!.list('operations',ACTOR).filter(r=>r.kind==='resource-policy')].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  const stopped=()=>[...v1!.list('settings',ACTOR).filter(r=>r.kind==='policy'),...v1!.list('operations',ACTOR).filter(r=>r.kind==='resource-policy')].some(r=>r.emergency===true)||governance.policy().values.paused;
  remoteOps=new RemoteOperationsRuntime(identity,v1,applications,options.dataDir,stopped,options.remoteOperations);
  startupCleanup.push(()=>remoteOps?.close());
  knowledge=new KnowledgeRuntime(v1,pi,{uploadsDirectory:join(options.dataDir,'knowledge-uploads'),workDirectory:join(options.dataDir,'knowledge-runtime'),pythonExecutable,stopped,member:actualMember});
  startupCleanup.push(()=>knowledge?.close());
  const development=new PiDevelopmentService(pi,governance,options.dataDir);
  const machine=(id:string)=>v1!.read('machines',id,ACTOR)??devices().find(d=>d.id===id);
  const power=new PowerRuntime(identity.db,()=>v1!.list('machines',ACTOR));
  let autonomy:ProjectAutonomyRuntime|undefined;
  const execution=new ExecutionRuntime(v1,{powerReading:(agent,raw)=>power.accept(agent,raw),directory:join(options.dataDir,'execution'),machine,stopped,actorId:ACTOR,runPi:development.run,piReady:()=>pi.health('development').configured,supervised:()=>executionPolicy()?.supervise===true,taskSupervised:taskId=>autonomy?.supervisesTask(taskId)??false,autoWake:()=>executionPolicy()?.autoWake===true,preflight:input=>governance.preflight(input),beforeExecution:input=>governance.reserveExecution(input),afterExecution:input=>governance.releaseExecution(input),onExternalUsage:input=>governance.importUsage(input),onUsage:input=>{if(input.usage.ledgerRecorded)return;governance.executionUsage({...input.usage,runId:'execution_'+input.runId,actorId:ACTOR,provider:input.usage.provider??input.agentId??'executor',model:input.usage.model??'cli-reported',projectId:input.projectId,taskId:input.taskId,machineId:input.machineId,executorId:input.executorId,usageId:`execution_${input.runId}`,measuredAt:input.at});}});
  startupCleanup.push(()=>execution.close());
  autonomy=new ProjectAutonomyRuntime(v1,execution,{directory:join(options.dataDir,'project-autonomy'),actorId:ACTOR,stopped});
  startupCleanup.push(()=>autonomy?.close());
  const supervisionPlans=new ProjectSupervisionPlanRuntime(v1,execution,{directory:join(options.dataDir,'project-supervision-plans'),autonomy:projectId=>autonomy?.get(projectId)});
  startupCleanup.push(()=>supervisionPlans.close());
  const projectDecisions=new ProjectDecisionRuntime(v1,{directory:join(options.dataDir,'project-decisions'),actorId:ACTOR});
  startupCleanup.push(()=>projectDecisions.close());
  const factoryMachineId='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73';
  const factoryDirectory='/home/superopen/All-Projects/msf';
  const factoryProjectId=()=>v1!.list('projects',ACTOR).find(p=>p.status!=='archived'&&p.copies?.some((copy:any)=>copy.machineId===factoryMachineId&&copy.path===factoryDirectory))?.id;
  const softwareFactory=new SoftwareFactoryRuntime({identity,machineId:factoryMachineId,sourceProjectId:factoryProjectId,baseURL:factoryProjectId()?'http://192.168.10.101:8080':undefined,credentials:()=>{
    const application=applications!.list(ACTOR,{machineId:factoryMachineId,search:'软件工厂',limit:100}).items.find(item=>item.directory===factoryDirectory&&item.status==='active'&&item.credentialConfigured);
    return application?applications!.reveal(ACTOR,application.id):undefined;
  }});
  const platformRuntime=new PlatformRuntime(v1,pi,voice,{machine,stopped});
  startupCleanup.push(()=>platformRuntime.close());
  weather=new WeatherRuntime(store,{authorizePrincipal:p=>identity.isPrincipalCurrent(p),provider:options.weatherProvider});
  web=new WebRuntime(store,{identity});startupCleanup.push(()=>web?.close());
  startupCleanup.push(()=>weather?.close());
  notifications=new NotificationRuntime(store.databasePath,{identity,repository:v1,voiceSession:(p,id)=>voice.session(id,p),audio:(p,id)=>voice.audio(id,p),playback:(p,id,state)=>voice.playback(id,p,state),cancelSpeech:(p,id)=>voice.cancel(id,p),beforeVoice:()=>governance.preflight(),synthesize:async(p,input)=>{
    input.signal.throwIfAborted();const job=voice.submitSpeech(p,input.sessionId,input.text,input.cloudConsent,{language:input.language}),stop=()=>{voice.cancel(job.id,p);};input.signal.addEventListener('abort',stop,{once:true});
    try{let current=job;while(['queued','running'].includes(current.status)){input.signal.throwIfAborted();await new Promise(resolve=>setTimeout(resolve,100));current=voice.job(job.id,p);}input.signal.throwIfAborted();if(current.status!=='complete')throw new RuntimeAccessError(String(current.result.code??'TTS_FAILED'),String(current.result.message??'播报合成未完成'),502);return {jobId:job.id,audioUrl:String(current.result.audioUrl),mime:String(current.result.mime),seconds:Number(current.result.seconds),turn:current.turn};}finally{input.signal.removeEventListener('abort',stop);if(input.signal.aborted)try{voice.cancel(job.id,p);}catch{/* Revoked identities cannot fetch or replay the job. */}}
  }});
  startupCleanup.push(()=>notifications?.close());
  const supervisionWork=new SupervisionWorkRuntime(v1,execution,{directory:join(options.dataDir,'project-supervision-work'),identity,notifications,plans:supervisionPlans,autonomy:projectId=>autonomy?.get(projectId)});
  startupCleanup.push(()=>supervisionWork.close());
  const projectSupervisor=new ProjectSupervisorRuntime(v1,execution,{directory:join(options.dataDir,'project-supervisor'),identity,stopped,modelReady:()=>pi.health('project-supervisor').configured,model:createProjectSupervisorModel(pi)});
  startupCleanup.push(()=>projectSupervisor.close());
  const learningSummary:DomainHandler={domain:'learning',commands:['companion-summary'],execute:(_command,p,ctx)=>{const record=ctx.create('learning',{kind:'practice',profile:'me',memberProfileId:p.profileId,type:'language',title:p.title,minutes:Math.floor(p.activeSeconds/60),activeSeconds:p.activeSeconds,rounds:p.rounds,answers:p.rounds.map((r:any)=>r.answer),corrections:p.rounds.filter((r:any)=>r.correction).map((r:any)=>r.correction),score:null,source:'pi-text-companion',assessmentStatus:'text-feedback',lessonId:p.id,time:ctx.now,status:'recorded',createdAt:ctx.now,updatedAt:ctx.now});ctx.emit('learning',record.id,'practice-recorded',{source:'pi-text-companion',rounds:p.rounds.length});return record;}};
  companion=new CompanionRuntime(identity,pi,notifications,{onLearning:(p,s)=>v1!.execute(learningSummary,'companion-summary',{commandId:'companion_'+s.id,expectedVersion:0,scope:'private',payload:{id:s.id,profileId:p.profileId,title:s.title,rounds:s.rounds,activeSeconds:s.activeSeconds}},p.actorId,()=>undefined).data.id});
  startupCleanup.push(()=>companion?.close());
  const voiceIntents=new VoiceIntentRuntime(identity,voice,v1,pi,{remoteOperations:remoteOps,createReminder:(p,input)=>{const preferences=identity.profile(p).preferences as Record<string,unknown>|undefined;return notifications!.createReminder(p,{requestId:input.id.replace(/^voiceintent_/,''),text:input.text,dueAt:input.dueAt,timezone:String(preferences?.timezone??'Asia/Shanghai'),scope:'private'});}});
  startupCleanup.push(()=>voiceIntents.close());
  app.addHook('onRequest', async (req, reply) => {
    const route = req.routeOptions.url ?? req.url.split('?')[0];
    if (!route.startsWith('/api/') && !req.url.startsWith('/api/')) return;
    if(shuttingDown)return reply.code(503).send({error:{code:'PLATFORM_RESTARTING',message:'平台正在更新，请稍后重试'}});
    try {
      const allowedHosts=options.allowedHosts??(process.env.JARVIS_ALLOWED_HOSTS??'localhost,127.0.0.1,[::1]').split(',').map(v=>v.trim()).filter(Boolean);
      if (!allowedHosts.includes(new URL(`http://${req.headers.host ?? ''}`).hostname)) throw new Error();
    } catch { throw new ApiError('HOST_DENIED','请使用本机贾维斯地址',403); }
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin) {
      let origin:URL;
      try { origin = new URL(req.headers.origin); } catch { throw new ApiError('ORIGIN_DENIED','请求来源无效',403); }
      const host = req.headers.host;
      if (origin.host !== host || !['http:','https:'].includes(origin.protocol)) throw new ApiError('ORIGIN_DENIED','请从贾维斯页面操作',403);
    }
    if (['/api/health','/api/auth/state','/api/auth/setup','/api/auth/login','/api/auth/logout'].includes(route)) return;
    if(evidenceAssistantOwnAuth(req.method,req.url.split('?')[0])||runtimeOwnAuthRoute(route)||notificationOwnAuthRoute(route)||webOwnAuthRoute(route)||isExecutionProtocolPath(req.method,req.url.split('?')[0]))return;
    if (!store.validateLogin(req.cookies[COOKIE] ?? '')) return reply.code(401).send(route.startsWith('/api/v1/')?{requestId:randomUUID(),code:'FORBIDDEN',message:'请先登录'}:{error:{code:'LOGIN_REQUIRED',message:'请先登录'}});
  });
  app.setErrorHandler((error, req, reply) => {
    const err = error as Error & {statusCode?:number};
    if(error instanceof RuntimeAccessError)return reply.code(error.statusCode).send({error:{code:error.code,message:error.message}});
    if(error instanceof BusinessError&&!req.url.startsWith('/api/v1/'))return reply.code(error.status).send({error:{code:error.code,message:error.message,details:error.details}});
    if(req.url.split('?')[0].startsWith('/api/v1/')){
      const requestId=randomUUID();
      if(error instanceof BusinessError){
        const allowed=['VALIDATION','FORBIDDEN','CONFLICT','BUDGET_EXHAUSTED','DEPENDENCY_PENDING','REVIEW_REQUIRED','NOT_CONFIGURED','CONTRACT_INVALID'];
        const code=allowed.includes(error.code)?error.code:error.status===403?'FORBIDDEN':/CONFLICT/.test(error.code)?'CONFLICT':/BUDGET|QUOTA/.test(error.code)?'BUDGET_EXHAUSTED':/DEPEND/.test(error.code)?'DEPENDENCY_PENDING':/INVALID|ARTIFACT|UNKNOWN/.test(error.code)?'VALIDATION':'REVIEW_REQUIRED';
        return reply.code(code==='NOT_CONFIGURED'?503:error.status).send({requestId,code,message:error.message,details:{...error.details,...(code!==error.code?{reason:error.code}:{})}});
      }
      if(error instanceof z.ZodError)return reply.code(400).send({requestId,code:'VALIDATION',message:'请检查数据格式',details:{fields:error.issues.slice(0,8).map(i=>i.path.join('.'))}});
      if(error instanceof ApiError)return reply.code(error.status).send({requestId,code:'FORBIDDEN',message:error.message});
      const status=err.statusCode&&err.statusCode<500?err.statusCode:500;
      return reply.code(status).send({requestId,code:status===500?'NOT_CONFIGURED':'VALIDATION',message:status===500?'操作未完成，请重试或检查服务状态':status===413?'单次请求超过 '+Math.floor((req.routeOptions.bodyLimit??128*1024)/1024)+' KiB，请减少内容后重试':'请求格式无效或操作过于频繁'});
    }
    if (error instanceof z.ZodError) return reply.code(400).send({error:{code:'INVALID_INPUT',message:'请检查必填项、字数和数据格式'}});
    if (error instanceof ApiError) return reply.code(error.status).send({error:{code:error.code,message:error.message}});
    if (error instanceof StoreAccessError) return reply.code(403).send({error:{code:'ACCESS_DENIED',message:'无权访问此会话'}});
    if (error instanceof PiServiceError) {
      const messages:Record<string,string>={PI_SETTINGS_CONFLICT:'配置已由其他页面更新，请刷新后再保存',PI_GATEWAY_ENDPOINT_IMMUTABLE:'已接入服务的地址固定，请为新地址添加新的服务',PI_GATEWAY_REFERENCED_MODEL_MISSING:'新目录缺少正在使用的模型，请先修改默认或场景分配',PI_PRICE_UNAVAILABLE:'此模型尚未定价，请先在模型中心补充价格后执行预算作业',PI_PRIVACY_FORBIDDEN:'此场景使用云端模型，当前成员仅允许本地处理',PI_GATEWAY_KEY_REQUIRED:'请填写网关密钥',PI_GATEWAY_AUTH_FAILED:'网关拒绝此密钥，请检查有效期与权限',PI_GATEWAY_UNAVAILABLE:'网关暂时无法连接，请稍后重试',PI_GATEWAY_CATALOG_INVALID:'网关模型列表格式无法识别',PI_MODEL_INVALID:'请选择有效的模型',PI_PROVIDER_SETUP_REQUIRED:'该服务需要额外配置，请选择支持密钥登录的服务',PI_CONFIGURATION_FAILED:'模型配置未保存，请检查输入后重试',PI_NOT_CONFIGURED:'请先配置模型与凭证',PI_BUSY:'当前对话正在运行，请稍后重试'};
      return reply.code(['PI_BUSY','PI_SETTINGS_CONFLICT'].includes(error.code)?409:messages[error.code]?400:500).send({error:{code:error.code,message:messages[error.code] ?? '模型服务未就绪，请检查配置'}});
    }
    if (err.message === 'PI_NOT_CONFIGURED') return reply.code(503).send({error:{code:'PI_NOT_CONFIGURED',message:'请先在设置中配置模型与凭证'}});
    if (err.message === 'PI_BUSY') return reply.code(409).send({error:{code:'PI_BUSY',message:'该会话正在回答，请先停止或等待'}});
    if (err.statusCode === 429) return reply.code(429).send({error:{code:'TOO_MANY_REQUESTS',message:'操作过于频繁，请稍后重试'}});
    if(err.statusCode===413||err.statusCode===415)return reply.code(err.statusCode).send({error:{code:err.statusCode===413?'PAYLOAD_TOO_LARGE':'UNSUPPORTED_MEDIA_TYPE',message:err.statusCode===413?'文件超过此接口上限':'不支持此内容格式'}});
    reply.code(500).send({error:{code:'INTERNAL_ERROR',message:'操作未完成，请重试'}});
  });
  const requireConversation = (id:string) => {
    const c = store.getConversation(ACTOR,id);
    if (!c) throw new ApiError('NOT_FOUND','会话不存在',404);
    return c;
  };
  const requireRecord = (kind:string, id:string) => {
    if (!store.get(kind,id)) throw new ApiError('INVALID_REFERENCE','关联记录不存在');
  };
  const login = (reply:any) => reply.setCookie(COOKIE, store.createLogin(), {path:'/',httpOnly:true,sameSite:'strict',secure:!!options.tls,maxAge:8*3600});
  app.get('/api/health', async () => ({status:'ok',version:'0.1.0',build:PLATFORM_BUILD,...(options.healthInstanceId?{instanceId:options.healthInstanceId}:{}),...(options.nodeConfiguration?{nodeId:options.nodeConfiguration.nodeId,role:options.nodeConfiguration.role,epoch:options.nodeConfiguration.epoch}:{})}));
  app.get('/api/auth/state', async req => ({setupRequired:!store.hasAccount(),authenticated:store.validateLogin(req.cookies[COOKIE] ?? '')}));
  app.post('/api/auth/setup', {config:{rateLimit:{max:5,timeWindow:'1 minute'}}}, async (req,reply) => {
    const {password} = z.object({password:z.string().min(12).max(256)}).strict().parse(req.body);
    if (store.hasAccount()) throw new ApiError('ALREADY_CONFIGURED','管理员已建立，请登录',409);
    store.setPassword(password); store.audit('account.setup','owner',{}); login(reply);
    return {ok:true};
  });
  app.post('/api/auth/login', {config:{rateLimit:{max:8,timeWindow:'1 minute'}}}, async (req,reply) => {
    const {password} = z.object({password:z.string().min(1).max(256)}).strict().parse(req.body);
    if (!store.verifyPassword(password)) throw new ApiError('INVALID_CREDENTIALS','密码不正确',401);
    login(reply); return {ok:true};
  });
  app.post('/api/auth/logout', async (req,reply) => {store.deleteLogin(req.cookies[COOKIE] ?? '');reply.clearCookie(COOKIE,{path:'/'});return {ok:true};});
  app.get('/api/bootstrap', async () => {
    const disk = await statfs(options.dataDir).then(s=>({total:Number(s.blocks)*Number(s.bsize),free:Number(s.bavail)*Number(s.bsize)})).catch(()=>null);
    const health = {time:now(),version:'0.1.0',host:{id:'local',name:os.hostname(),platform:os.platform(),release:os.release(),cpuModel:os.cpus()[0]?.model ?? '',cpuCores:os.cpus().length,memoryTotal:os.totalmem(),memoryFree:os.freemem(),uptime:os.uptime(),disk},pi:pi.health()};
    return {members:store.list('members'),devices:devices(),projects:store.list('projects'),tasks:store.list('tasks'),experiences:store.list('experiences'),health,capabilities};
  });
  for (const kind of Object.keys(schemas) as (keyof typeof schemas)[]) {
    app.get(`/api/${kind}`, async () => kind === 'devices' ? devices() : store.list(kind));
    app.post(`/api/${kind}`, async req => {
      const data = schemas[kind].parse(req.body);
      if ('deviceId' in data && data.deviceId) requireRecord('devices',data.deviceId);
      if ('projectId' in data && data.projectId) requireRecord('projects',data.projectId);
      const record = store.create(kind,kind === 'devices' ? {...data,status:'unknown',lastSeen:null,source:'manual-registration'} : data);
      store.audit(`${kind}.create`,record.id,{});return record;
    });
  }
  app.patch<{Params:{id:string}}>('/api/members/:id', async req => {
    requireRecord('members',req.params.id);
    const data = z.object({name:text(60).optional(),voice:z.string().trim().max(100).optional(),wakeWord:z.string().trim().max(100).optional(),preferences:z.string().trim().max(4000).optional()}).strict().parse(req.body);
    const result=store.update('members',req.params.id,data);store.audit('members.update',req.params.id,{});return result;
  });
  app.patch<{Params:{id:string}}>('/api/projects/:id', async req => {
    requireRecord('projects',req.params.id);
    const data=z.object({name:text(100).optional(),description:z.string().trim().max(4000).optional(),deviceId:z.string().trim().max(100).optional(),status:z.enum(['planned','active','paused','delivered']).optional(),path:z.string().trim().max(1000).optional()}).strict().parse(req.body);
    if(data.deviceId)requireRecord('devices',data.deviceId);
    const result=store.update('projects',req.params.id,data);store.audit('projects.update',req.params.id,{});return result;
  });
  app.patch<{Params:{id:string}}>('/api/tasks/:id', async req => {
    requireRecord('tasks',req.params.id);
    const data = z.object({status:z.enum(['queued','running','blocked','done','cancelled']),notes:z.string().trim().max(8000).optional()}).strict().parse(req.body);
    if (data.status === 'done' && !data.notes) throw new ApiError('EVIDENCE_REQUIRED','请填写完成说明或交付证据');
    const result=store.update('tasks',req.params.id,data);store.audit('tasks.status',req.params.id,{status:data.status,source:'manual'});return result;
  });
  app.patch<{Params:{id:string}}>('/api/experiences/:id', async req => {
    requireRecord('experiences',req.params.id);
    const data=z.object({status:z.enum(['inbox','verified'])}).strict().parse(req.body);
    const result=store.update('experiences',req.params.id,data);store.audit('experiences.review',req.params.id,{status:data.status});return result;
  });
  app.get('/api/audit',async()=>store.listAudit());
  app.get('/api/settings/pi',async()=>pi.getSettings());
  app.post('/api/settings/pi/gateway/discover',async req=>{
    const data=z.object({apiKey:z.string().min(1).max(8192).optional(),provider:text(100).default('superopen'),definition:gatewayDefinitionSchema.optional()}).strict().parse(req.body??{});
    return pi.discoverGateway(data.apiKey,data.provider,data.definition);
  });
  app.post('/api/settings/pi/gateways',async req=>{
    const input=z.object({definition:gatewayDefinitionSchema,apiKey:z.string().min(1).max(8192).optional()}).strict().parse(req.body);
    const result=await pi.configureGateway(input.definition,input.apiKey);store.audit('pi.gateway',input.definition.id,{baseUrl:input.definition.baseUrl,api:input.definition.api});return result;
  });
  app.put('/api/settings/pi/routing',async req=>{
    const input=z.object({expectedVersion:z.number().int().min(0),routes:routingDocumentSchema.shape.routes}).strict().parse(req.body);
    const result=await pi.updateRouting(input.expectedVersion,input.routes);store.audit('pi.routing','platform',{revision:result.routing.revision,routes:input.routes});return result;
  });
  app.put('/api/settings/pi/pricing',async req=>{
    const input=z.object({expectedVersion:z.number().int().min(0),...selectionSchema.shape,price:priceSchema.nullable()}).strict().parse(req.body);
    const result=await pi.updatePrice(input.expectedVersion,input.provider,input.model,input.price);store.audit('pi.pricing',input.provider,{model:input.model,revision:result.routing.revision,price:input.price});return result;
  });
  app.put('/api/settings/pi/conversation-routing',async req=>{const input=z.object({expectedVersion:z.number().int().min(0),conversation:conversationRoutingSchema}).strict().parse(req.body);const result=await pi.updateConversationRouting(input.expectedVersion,input.conversation);store.audit('pi.conversation-routing','platform',{revision:result.routing.revision,conversation:input.conversation});return result;});
  app.post('/api/settings/pi/test',async req=>{
    const input=z.object({scenario:scenarioSchema.optional(),selection:selectionSchema.optional()}).strict().parse(req.body??{});if(runs.size||pi.health().activeRuns)throw new ApiError('PI_BUSY','请等待对话结束后验证',409);
    if(input.scenario&&input.selection)throw new ApiError('VALIDATION','选择一个场景或一个模型进行验证');
    const selected=input.selection??pi.health(input.scenario);
    const result=await pi.run({actorId:ACTOR,conversationId:'connection_'+randomUUID(),selection:{provider:selected.provider,model:selected.model},scenario:input.scenario,member:{name:'连接检查',preferences:''},text:'这是一条接口连通性检查，请只回复：连接成功。',sessionPath:null,onEvent:()=>{},onSessionPath:()=>{},businessCallbacks:{listProjects:()=>[],listDevices:()=>[],listTasks:()=>[],listExperiences:()=>[]}});
    const checkedAt=now();store.audit('pi.connection-check',selected.provider,{model:selected.model,scenario:input.scenario,status:result.status});
    return {ok:result.status==='complete',status:result.status,provider:selected.provider,model:selected.model,reply:result.text.slice(0,500),checkedAt};
  });
  app.put('/api/settings/pi',async req=>{
    if(runs.size)throw new ApiError('PI_BUSY','请等待当前对话结束再切换模型',409);
    const data=z.object({provider:text(100),model:text(200),apiKey:z.string().min(1).max(8192).optional()}).strict().parse(req.body);
    await pi.configure(data);store.audit('pi.configure',data.provider,{model:data.model});return {ok:true,...await pi.getSettings()};
  });
  app.get<{Querystring:{memberId?:string}}>('/api/chat/conversations',async req=>{
    if(req.query.memberId && req.query.memberId!=='owner')throw new ApiError('MEMBER_IDENTITY_REQUIRED','该成员尚未绑定个人身份',403);
    return store.listConversations(ACTOR,'owner').map(({id,memberId,title,createdAt})=>({id,memberId,title,createdAt}));
  });
  app.post('/api/chat/conversations',async req=>{
    const data=z.object({memberId:z.literal('owner'),title:optionalText(100).default('新对话')}).strict().parse(req.body);
    const {id,memberId,title,createdAt}=store.createConversation(ACTOR,data.memberId,data.title || '新对话');
    return {id,memberId,title,createdAt};
  });
  app.get<{Params:{id:string}}>('/api/chat/conversations/:id/messages',async req=>{requireConversation(req.params.id);return store.messages(ACTOR,req.params.id);});
  app.post<{Params:{id:string}}>('/api/chat/conversations/:id/abort',async req=>{requireConversation(req.params.id);await pi.abort(req.params.id,ACTOR);return {ok:true};});
  app.post<{Params:{id:string}}>('/api/chat/conversations/:id/stream',async(req,reply)=>{
    const {text:prompt}=z.object({text:text(16000)}).strict().parse(req.body);
    const c=requireConversation(req.params.id);
    if(!pi.health('chat').configured)throw new ApiError('PI_NOT_CONFIGURED','请先在设置中配置模型与凭证',503);
    if(runs.has(c.id))throw new ApiError('PI_BUSY','该会话正在回答，请先停止或等待',409);
    runs.add(c.id);
    try {
    const userMessage=store.addMessage(ACTOR,c.id,{role:'user',content:prompt,status:'complete'});
    reply.hijack();
    reply.raw.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
    let disconnected=false;let partial='';
    const emit=(event:string,data:unknown)=>{if(!disconnected)reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);};
    const onClose=()=>{if(!reply.raw.writableEnded){disconnected=true;void pi.abort(c.id,ACTOR);}};
    reply.raw.on('close',onClose);
    const heartbeat=setInterval(()=>{if(!disconnected)reply.raw.write(': heartbeat\n\n');},15000);heartbeat.unref();
    emit('status',{state:'thinking',userMessageId:userMessage.id});
    try{
      const principal=identity.requireAdmin(req);
      const profile=identity.profile(principal);
      const currentRetrieval=<T>(read:()=>T)=>{if(!identity.isPrincipalCurrent(principal))throw new RuntimeAccessError('IDENTITY_CHANGED','管理员会话已失效，请重新登录',401);return read();};
      const result=await pi.run({scenario:'chat',conversationId:c.id,actorId:ACTOR,member:{name:String(profile.name),preferences:JSON.stringify(profile.preferences)},responseLanguage:resolveReplyLanguage(profile.preferences,undefined,prompt),sessionPath:c.sessionPath,text:prompt,businessCallbacks:{...administratorCallbacks,listKnowledge:()=>currentRetrieval(()=>administratorCallbacks.listKnowledge!()),listMemory:()=>currentRetrieval(()=>administratorCallbacks.listMemory!()),searchKnowledge:query=>currentRetrieval(()=>administratorCallbacks.searchKnowledge!(query)),searchMemory:query=>currentRetrieval(()=>administratorCallbacks.searchMemory!(query)),readOnlyTools:()=>[...createWeatherTools(weather!,principal),...createWebTools(web!,principal),...createNotificationTools(notifications!,principal),...createCompanionTools(companion!,principal),...createMonitoringTools(execution,identity,principal),...createClusterTools(cluster,identity,principal),...createSoftwareFactoryTools(softwareFactory,principal),...createBillingTools(billing,identity,principal),...createApplicationTools(applications!,principal),...createRemoteOperationsTools(remoteOps!,principal),createPowerTool(power,()=>identity.isPrincipalCurrent(principal))]},onEvent:(event,data)=>{if(event==='delta')partial+=data.text;emit(event,data);},onSessionPath:path=>store.setSessionPath(ACTOR,c.id,path)});
      const msg=store.addMessage(ACTOR,c.id,{role:'assistant',content:result.text || partial,status:result.status});
      emit('done',{messageId:msg.id,status:result.status,persisted:true});
      if(result.status==='complete')memory.onConversationComplete(ACTOR,c.id);
    }catch{
      // A terminal transport event must not depend on another database write.
      // In particular, a full disk can make both the first and fallback write fail.
      emit('error',{message:'回答未完成或未能保存，请检查配置和存储后重试'});
      try {
        const msg=store.addMessage(ACTOR,c.id,{role:'assistant',content:partial,status:disconnected?'cancelled':'failed'});
        emit('done',{messageId:msg.id,status:msg.status,persisted:true});
      } catch {
        emit('error',{message:'回答未能保存，请先复制当前内容再重试'});
        emit('done',{messageId:null,status:'failed',persisted:false});
      }
    }finally{clearInterval(heartbeat);reply.raw.off('close',onClose);reply.raw.end();}
    } finally { runs.delete(c.id); }
  });
  v1=registerV1(app,store,pi,{repository:v1,stopped,inboxMaterials:{principal:req=>identity.requireAdmin(req),current:p=>identity.isPrincipalCurrent(p),stopped,document:(bytes,mime,sha256,signal)=>parseInboxDocument({bytes,mime,sha256,pythonExecutable,signal}),transcribe:(p,bytes,mime,input)=>voice.transcribeMaterial(p,bytes,mime,input),policy:()=>{const c=knowledge!.configuration();return {allowedHttpOrigins:c.allowedHttpOrigins,allowedDirectoryRoots:c.allowedDirectoryRoots,timeoutMs:c.timeoutMs,maxBytes:c.maxBytes,maxDocuments:c.maxDocuments};}},dispatchers:[platformRuntime,knowledge,execution],sanitizeRead:(domain,record,actor)=>knowledge!.sanitizeRead(domain,record,actor),ready:(agent,machineId)=>agent==='supervisor'?execution.capabilities().development:agent==='wol'?true:execution.ready(agent,machineId),capabilities:()=>({familyAuthentication:true,development:execution.capabilities().development,remoteAgents:execution.capabilities().remoteAgents,voice:!!voice.getConfig('asr')&&!!voice.getConfig('tts'),ocr:knowledge!.capabilities().ocr.configured,knowledge:knowledge!.capabilities(),nodes:execution.capabilities(),voiceEngines:{asr:!!voice.getConfig('asr'),tts:!!voice.getConfig('tts')},budget:governance.summary(),descriptions:{inbox:'签名节点按已授权字段提交收件，保留原话和人工归档',research:'真实Pi有限研究、预算和时限、取消与人工决策',tasks:'已实现受控节点执行、租约、日志、停止、预算与独立验收；执行器需先配置',memory:'按认证身份隔离，候选确认、自动整理与文字清理',personas:'真实成员认证、偏好与声音映射，房间配对独立',sources:'目录与HTTP连接器、授权过滤、真实同步与本地检索',books:'真实OCR多轮识别、页序和疑点复核、版本发布',machines:'Ed25519节点配对、真实遥测、WoL及受控休眠',services:'真实探测、固定审批绑定的发布和恢复执行',operations:'实际备份演练、节点用量及预算门禁',voice:'中央音频、ASR、Pi对话、TTS、播放回执与打断',settings:'运行引擎、身份配对、知识连接器及节点配置'}}),afterCommand:(domain,command,receipt)=>{if(domain==='voice'&&command==='interrupt'&&receipt.data.speech?.jobId)voice.cancel(receipt.data.speech.jobId,{actorId:ACTOR,profileId:'me',administrator:true});}});
  registerIdentityRoutes(app,identity,store,pi);registerVoiceRuntimeRoutes(app,voice);registerKnowledgeRuntime(app,knowledge,{authenticated:cookie=>store.validateLogin(cookie),authorizeReference:req=>identity.requireAdmin(req)});registerExecutionRoutes(app,execution,cookie=>store.validateLogin(cookie),identity);registerGovernanceRoutes(app,governance,identity);registerBillingRoutes(app,billing,identity);registerClusterRoutes(app,cluster,identity);memory.register(app);
  registerFamilyKnowledgeRoutes(app,v1,identity);
  registerEvidenceAssistantRoutes(app,v1,identity,pi,{stopped});
  const offlineDraftSync=registerOfflineDraftSync(app,identity,store.databasePath);
  startupCleanup.push(()=>offlineDraftSync.close());
  registerVoiceIntentRoutes(app,voiceIntents,identity);registerNotificationRoutes(app,notifications);registerWeatherRoutes(app,weather,identity);registerWebRoutes(app,web,identity);
  registerCompanionRoutes(app,companion,identity);registerCompanionVoiceRoute(app,companion,identity,voice);
  registerApplicationRoutes(app,applications);registerPowerRoutes(app,power);
  registerSoftwareFactoryRoutes(app,softwareFactory);
  registerProjectAutonomyRoutes(app,autonomy,identity,join(workspaceRoot,'docs','软件工厂无人值守交付总纲.html'));
  registerProjectDecisionRoutes(app,projectDecisions,identity);
  registerProjectSupervisionPlanRoutes(app,supervisionPlans,identity);
  registerSupervisionWorkRoutes(app,supervisionWork,identity);
  registerProjectSupervisorRoutes(app,projectSupervisor,identity);
  app.addHook('preClose',async()=>projectSupervisor.close());
  projectSupervisor.start();
  registerRemoteOperations(app,remoteOps);remoteOps.start();
  knowledge.start();execution.start();autonomy.start();memory.start();platformRuntime.start();notifications.start();supervisionWork.start();cluster.start();applications.start();
  const webDir = options.webDir ?? resolve(workspaceRoot,'apps/web/dist');
  if(existsSync(webDir)){
    await app.register(staticFiles,{root:webDir,prefix:'/'});
  }
  app.setNotFoundHandler((req,reply)=> req.url.startsWith('/api/v1/') ? reply.code(404).send({requestId:randomUUID(),code:'VALIDATION',message:'接口不存在'}) : req.url.startsWith('/api/') ? reply.code(404).send({error:{code:'NOT_FOUND',message:'接口不存在'}}) : existsSync(webDir)?reply.sendFile('index.html'):reply.code(404).send({error:{code:'NOT_FOUND',message:'页面不存在'}}));
  // Stop SDK streams before Fastify waits for existing SSE connections to close.
  app.addHook('preClose',async()=>{shuttingDown=true;platformRuntime.close();remoteOps?.close();await applications!.close();await cluster.close();await companion!.close();await voiceIntents.close();supervisionWork.close();await notifications!.close();weather!.close();await Promise.all([memory.close(),knowledge!.close(),execution.close(),voice.close()]);await autonomy?.close();await pi.dispose();});
  app.addHook('onClose',async()=>{supervisionPlans.close();projectDecisions.close();web?.close();identity.close();billing.close();governance.close();store.close();});
  return {app,store,pi,v1,identity,voice,knowledge,execution,governance,billing,memory,voiceIntents,notifications,weather,web,companion,cluster,applications,remoteOps,softwareFactory,autonomy};
  }catch(error){
    try{await startupApp?.close();}catch{/* Preserve the initialization error. */}
    for(const close of startupCleanup.reverse())try{await close();}catch{/* Other handles must still be released. */}
    throw error;
  }
}
