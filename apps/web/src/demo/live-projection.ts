import type {DemoData, DemoRecord} from './types';
import {v1All, v1Request, v1Capabilities, type V1CollectionDomain, type V1Record, type V1Event, type V1Capabilities} from '../v1-client';
import {projectLiveFamily} from './live-family-projection';
import {projectLiveKnowledge,projectLiveLearning} from './live-knowledge-commands';
import {projectInfrastructure} from './live-infrastructure-commands';
export const LIVE_DOMAINS:V1CollectionDomain[]=['inbox','research','projects','tasks','experiences','family','memory','personas','sources','books','stories','learning','machines','services','operations','approvals','settings','voice','jobs'];

export interface LiveSnapshot {
  records:Record<V1CollectionDomain,V1Record[]>;
  releases:V1Record[];
  capturePolicies:V1Record[];
  capabilities:V1Capabilities;
  bootstrap:any;
  events:V1Event[];
  eventSequence?:number;
  audit:any[];
}
export interface PlatformAppearance {profile:string;theme:string;appearance:string;notify:boolean;notifications:Record<string,boolean>;quietStart:string;quietEnd:string}
export const DISPLAY_KEY='jarvis-platform-display-v1';
export function loadAppearance():PlatformAppearance {
  let saved:any={};try{saved=JSON.parse(localStorage.getItem(DISPLAY_KEY)||'{}')}catch{}
  return {profile:saved.profile||'me',theme:saved.theme||'stark',appearance:saved.appearance||'theme',notify:saved.notify!==false,notifications:saved.notifications||{},quietStart:saved.quietStart||'',quietEnd:saved.quietEnd||''};
}
async function allEvents(after=0):Promise<{events:V1Event[];sequence:number}> {
  const events:V1Event[]=[];
  for(;;){const result=await v1Request<{data:{items:V1Event[];latestSequence:number}}>(`/api/v1/events/history?afterSequence=${after}&limit=100&excludeObservations=true`);const page=result.data.items;if(!page.length)return {events,sequence:result.data.latestSequence};const last=page.at(-1)!.sequence;if(last<=after)throw new Error('事件分页位置无效');events.push(...page);after=last;if(page.length<100||after>=result.data.latestSequence)return {events,sequence:result.data.latestSequence}}
}
export async function loadLiveSnapshot(previous?:LiveSnapshot|null):Promise<LiveSnapshot> {
  const {events:changes,sequence}=await allEvents(previous?.eventSequence??previous?.events.at(-1)?.sequence??0);
  const changed=new Set(changes.map(e=>e.domain));
  // Telemetry remains in its history APIs; refresh live infrastructure every cycle.
  const collection=(domain:V1CollectionDomain|'releases'|'capture-policies')=>!previous||changed.has(domain)||domain==='machines'||domain==='services'||(domain!=='releases'&&domain!=='capture-policies'&&!previous.records[domain])?v1All(domain):Promise.resolve({items:domain==='releases'?previous.releases:domain==='capture-policies'?previous.capturePolicies:previous.records[domain]});
  const [collections,releases,capturePolicies,caps,bootstrap,events,audit]=await Promise.all([
    Promise.all(LIVE_DOMAINS.map(collection)),collection('releases'),collection('capture-policies'),v1Capabilities(),v1Request<any>('/api/bootstrap'),Promise.resolve([...(previous?.events||[]),...changes]),v1Request<any[]>('/api/audit'),
  ]);
  return {records:Object.fromEntries(LIVE_DOMAINS.map((domain,i)=>[domain,collections[i].items])) as Record<V1CollectionDomain,V1Record[]>,releases:releases.items,capturePolicies:capturePolicies.items,capabilities:caps.data,bootstrap,events,eventSequence:sequence,audit};
}
const timestamp=(value:unknown)=>value?new Date(String(value)).toLocaleString('zh-CN',{hour12:false}):'未记录';
const owned=(r:any)=>({...r,owner:r.ownerId==='server-admin'?'me':r.ownerId,originalDto:r});
const eventLabel=(type:string)=>({
  'inbox.captured':'原话已记录','inbox.annotated':'批注已保存','inbox.routed':'收件已归档',
  'research.created':'研究已登记','research.discussed':'讨论已补充','research.decided':'决定已记录','research.converted':'研究已立项',
  'project.registered':'项目已登记','project.planned':'任务计划已生成','task.created':'任务已登记','task.external_reported':'外部人工进度已录入','task.accepted':'独立验收已记录','task.packaged':'交付版本已固定',
  'experience.captured':'经验已记录','experience.verified':'经验已验证','skill.published':'技能已发布',
} as Record<string,string>)[type]||type;
/** Only projects actual service records into the approved UI shape. Never imports the demonstration seed. */
export function projectLiveData(snapshot:LiveSnapshot,display:PlatformAppearance):DemoData {
  const {bootstrap,events}=snapshot;
  const records=display.profile==='public'?Object.fromEntries(Object.entries(snapshot.records).map(([domain,items])=>[domain,items.filter(r=>r.scope==='family')])) as LiveSnapshot['records']:snapshot.records;
  const timeline=(id:string)=>events.filter(e=>e.objectId===id).map(e=>({id:e.id,time:timestamp(e.at),text:eventLabel(e.type),action:e.type,sequence:e.sequence,payload:e.payload}));
  const owner=bootstrap.members?.find((m:any)=>m.id==='owner')||{name:'我',voice:'',wakeWord:''};
  const health=bootstrap.health;
  const machines=(bootstrap.devices||[]).map((m:any)=>{
    const local=m.id==='local',h=local?health?.host:undefined;
    return {...m,scope:m.scope||'personal',kind:m.kind||'workstation',cpu:m.cpuModel||h?.cpuModel||'未登记',ram:m.memoryGB??(h?.memoryTotal?Math.round(h.memoryTotal/1024**3):undefined),disk:m.diskGB?`${m.diskGB} GB`:h?.disk?`${Math.round(h.disk.total/1024**3)} GB · 可用 ${Math.round(h.disk.free/1024**3)} GB`:'未登记',gpu:m.gpu||'未登记',os:m.os||h?.platform||'未登记',status:local?'online':'unknown',ramUse:h?Math.round((1-h.memoryFree/h.memoryTotal)*100):undefined,cpuUse:undefined,last:timestamp(m.lastSeen||local&&health?.time),readOnly:m.readOnly===true||m.scope==='company',always:m.always===true,events:[],metricsSource:local?'本机系统采样':'尚未接入远程 Agent'};
  });
  const inbox=records.inbox.map(r=>({...owned(r),text:r.rawText,originalText:r.rawText,terminal:r.terminalId||'未登记',project:r.projectId,created:timestamp(r.createdAt),targetDomain:(r.target as any)?.domain,target:(r.target as any)?.id,revisions:timeline(r.id)}));
  const research=records.research.map(r=>({...owned(r),terminal:r.terminalId||'未登记',plan:r.plan?{...(r.plan as any),machine:(r.plan as any).machineId??(r.plan as any).machine}:{budget:0,minutes:0,retryLimit:0,machine:''},stage:0,cost:0,minutes:0,retries:0,evidence:((r.evidence as any[])||[]).map(e=>({...e,type:e.kind})),discussions:((r.discussions as any[])||[]).map(d=>({...d,time:timestamp(d.at),author:d.actorId==='server-admin'?'我':d.actorId})),decision:r.decision?{...(r.decision as any),time:timestamp((r.decision as any).at)}:null,timeline:timeline(r.id)}));
  const projects=records.projects.map(r=>{const milestones=(r.milestones as any[])||[];return {...owned(r),desc:r.description,stage:r.status,milestones:milestones.map(m=>m.title),milestoneRecords:milestones,doneMilestones:milestones.flatMap((m,i)=>m.completed?[i]:[]),progress:milestones.length?Math.round(milestones.filter(m=>m.completed).length/milestones.length*100):0,copies:((r.copies as any[])||[]).map(c=>({...c,machine:c.machineId})),timeline:timeline(r.id)}});
  const tasks=records.tasks.map(r=>({...owned(r),project:r.projectId,machine:r.machineId,session:r.sessionId||'',tests:(r.acceptance as any)?.tests||'',log:timeline(r.id),events:timeline(r.id),skillRefs:((r.skillRefs as any[])||[]).map(s=>({...s,id:s.experienceId,time:s.at})),costSource:r.executionResult?r.costKind==='provider-reported'?'节点报告金额 · USD':r.costKind==='catalog-estimate'?'模型目录估算 · USD':'实际用量 · 金额待补充':'外部人工登记 · USD'}));
  const experiences=records.experiences.map(r=>({...owned(r),summary:r.summary||String(r.content||'').slice(0,160),tags:r.tags||[],project:r.projectId||'',machine:r.terminalId||'',sourceExperience:r.sourceExperienceId,versions:r.history||[],uses:((r.references as any[])||[]).length,reuseHistory:r.references||[],timeline:timeline(r.id),history:r.history||[],lastUse:''}));
  const knowledge={sources:[],books:[],stories:[],gaps:[],materials:[],favorites:{me:[]},courses:{me:[]},progress:{me:{}},query:{text:'',results:[],at:''},events:[]};
  const releases=snapshot.releases.map(r=>({...owned(r),name:(projects.find(p=>p.id===r.projectId)?.name||'交付版本'),project:r.projectId,task:r.taskId,artifacts:r.artifactIds,artifact:((r.artifactIds as string[])||[]).join('\n'),criteria:(events.find(e=>e.type==='task.packaged'&&(e.payload as any)?.releaseId===r.id)?.payload as any)?.criteria||tasks.find(t=>t.id===r.taskId)?.criteria||'',evidence:[(r.acceptance as any)?.evidence,(r.acceptance as any)?.tests].filter(Boolean),tests:(r.acceptance as any)?.tests||'',time:timestamp(r.createdAt),status:'accepted',deploymentStatus:'not-deployed'}));
  const policy=snapshot.capturePolicies[0];
  const data:DemoData={schema:1502,profile:'me',theme:display.theme,profiles:[{id:'me',name:owner.name||'我',avatar:'我',caption:'管理员本人',admin:true}],machines,projects,tasks,experiences,approvals:[],
    audit:[...snapshot.audit.map(a=>({id:'s0-'+a.id,time:timestamp(a.createdAt),actor:'me',action:a.action,scope:a.subjectId,result:'已记录'})),...events.map(e=>({id:e.id,time:timestamp(e.at),actor:'me',action:e.type,scope:e.objectId,result:'已提交'}))].sort((a,b)=>b.time.localeCompare(a.time)),activity:[],
    settings:{appearance:display.appearance,notify:display.notify,notifications:display.notifications,quietStart:display.quietStart,quietEnd:display.quietEnd,supervise:false,autoWake:false,voice:false,emergency:false,dailyBudget:0,retryLimit:0,terminals:[],simulated:false},
    preferences:{me:{address:owner.name||'我',voice:owner.voice||'',wakeword:owner.wakeWord||'',language:'中文',pace:'正常',replyStyle:owner.preferences||'',privacy:'explicit',quietStart:'',quietEnd:'',dailyVoice:0,autoSpeak:false}},
    chat:{me:[]},learning:{me:{minutes:0,completed:0,days:0,events:[],configured:false}},familyTodos:[],knowledge,backups:[],lastBackup:'未接入备份记录接口',lastDrill:'未接入恢复演练接口',
    v5:{schema:5,board:'all',welcome:false,terminal:false,knowledgeCenter:knowledge,vm:{memories:{me:[]},policies:{me:{text:'forever',audio:'never',longterm:'explicit',configured:false}},publicChat:[],inbox:[],pendingCommands:[],nowPlaying:null,privateNotes:[]},research:{items:research,inbox,capturePolicy:{...(policy||{}),enabled:policy?.enabled===true,authorizationEnabled:policy?.enabled===true,collectorStatus:policy?.collectorStatus||'not-configured',scopes:policy?.projectId?[policy.projectId]:[],allowedOrigins:[],fields:policy?.fields||[],events:[]}},ops:{services:[],releases,deployments:[],policy:{humanReserve:0,voiceReserve:0,batchLimit:0,quiet:'未配置',autotest:false},events:events.map(e=>({time:timestamp(e.at),text:eventLabel(e.type)}))}},
    runtime:{mode:'live',health,capabilities:snapshot.capabilities,loadedAt:new Date().toISOString(),legacyCounts:{projects:bootstrap.projects?.length||0,tasks:bootstrap.tasks?.length||0,experiences:bootstrap.experiences?.length||0},metricsMetered:false},
  };
  const family=projectLiveFamily(records,bootstrap),infrastructure=projectInfrastructure(records,bootstrap);
  data.profiles=family.profiles;data.profile=family.profiles.some(p=>p.id===display.profile)?display.profile:'me';
  data.preferences=family.preferences;data.familyTodos=family.familyTodos;data.learning=projectLiveLearning(records);
  data.v5.vm={...data.v5.vm,...family.vm};data.knowledge=projectLiveKnowledge(records);data.v5.knowledgeCenter=data.knowledge;
  data.machines=[...machines.filter((m:DemoRecord)=>!m.canonicalMachineId||!infrastructure.machines.some(r=>r.id===m.canonicalMachineId)),...infrastructure.machines];data.approvals=infrastructure.approvals as DemoRecord[];data.backups=infrastructure.backups;
  data.v5.ops={...data.v5.ops,services:infrastructure.services,deployments:infrastructure.deployments,records:infrastructure.records,policy:infrastructure.policy,metering:infrastructure.metering,power:infrastructure.power};
  const platformPolicy=records.settings.find(r=>r.kind==='policy');const terminals=records.settings.filter(r=>r.kind==='terminal'&&r.status!=='disabled').map(r=>({...r,machine:r.machineId,profile:r.profileId}));
  data.settings={...data.settings,...(platformPolicy||{}),appearance:display.appearance,notify:display.notify,notifications:display.notifications,quietStart:display.quietStart,quietEnd:display.quietEnd,terminals,supervise:(snapshot.capabilities.execution as any)?.nodes?.supervised??platformPolicy?.supervise??false,autoWake:platformPolicy?.autoWake??false};
  data.lastBackup=infrastructure.backups.at(-1)?.time||'未登记';data.lastDrill=infrastructure.backups.filter(b=>b.restoration).at(-1)?.restoration?.observedAt||'未登记';
  if(data.profile==='public'){data.preferences={};data.v5.vm.memories={};data.v5.vm.policies={};data.v5.vm.privateNotes=[];data.audit=[];data.machines=data.machines.filter(m=>m.scope==='family');}
  return data;
}
