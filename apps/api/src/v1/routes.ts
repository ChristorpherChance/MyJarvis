import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from '../store.js';
import type { PiService } from '../pi.js';
import { V1Repository, type CommandReceipt } from './repository.js';
import { BusinessError,type CommandEnvelope,type Domain,type BusinessRecord } from './types.js';
import { validateCommand,assertReceipt,assertDto,plannedContract } from './contract.js';
import { captureHandlers } from './capture-domains.js';
import { workHandlers } from './work-domains.js';
import { familyHandlers, familyDtoNames } from './family-domains.js';
import { knowledgeHandlers } from './knowledge-domains.js';
import { registerKnowledgeFiles } from './knowledge-files.js';
import { infrastructureHandlers, infrastructureDtoNames } from './infrastructure-domains.js';
import { jobHandler } from './job-domains.js';
import { voiceHandler } from './voice-domains.js';
import { settingsHandler } from './settings-domains.js';
import { PiJobRuntime } from './job-runtime.js';
import { dirname,join } from 'node:path';
const ACTOR='server-admin';
const scope=z.enum(['personal','private','family','company']);
const query=z.object({cursor:z.string().min(1).max(300).optional(),limit:z.coerce.number().int().min(1).max(100).default(25),scope:scope.optional()}).strict();
const eventQuery=z.object({afterSequence:z.coerce.number().int().min(0).default(0),limit:z.coerce.number().int().min(1).max(100).default(100),scope:scope.optional(),domain:z.string().refine(v=>plannedContract.components.schemas.DomainEvent.properties.domain.enum.includes(v)).optional(),objectId:z.string().min(1).max(200).optional(),excludeObservations:z.enum(['true','false']).default('false').transform(v=>v==='true')}).strict();
const handlers=[...captureHandlers,...workHandlers,...familyHandlers,...knowledgeHandlers,...infrastructureHandlers,jobHandler,voiceHandler,settingsHandler];
const prefixes=(domain:string)=>`/api/v1/${['sources','books','stories'].includes(domain)?'knowledge/':''}${domain}`;
const dtoNames:Record<string,string>={inbox:'InboxItem',research:'Research',projects:'Project',tasks:'Task',experiences:'Experience',...familyDtoNames,...infrastructureDtoNames,sources:'KnowledgeSourcesRecordV2',books:'KnowledgeBooksRecordV2',stories:'KnowledgeStoriesRecordV2',learning:'KnowledgeLearningRecordV2',jobs:'PiJob',voice:'VoiceRecord',settings:'PlatformSettingsRecord'};
const domainDescription:Record<string,string>={inbox:'原话收件、归档与授权；被动采集待接入',research:'人工讨论、证据、方案、决策及立项；Pi有限作业由jobs提供',projects:'项目副本、里程碑与任务计划',tasks:'任务台账、外部人工进度、独立验收和交付包；自动执行器待接入',experiences:'经验审阅、真实版本与固定技能引用',family:'家庭共同待办及本人健康备忘',memory:'本人候选、明确确认、修订与实际遗忘；聊天定期清理待接入',personas:'已登记成员的管家偏好；不是成员登录或唤醒执行',sources:'知识来源与授权、已发布资料本地查询；外部连接器待接入',books:'实际扫描件存储、人工页文与校对、疑点及版本发布',stories:'原文引用、审核、知识故事与进度',learning:'课程与实际人工练习记录；不伪造评分',machines:'设备登记与人工观察，远程Agent未连接',services:'服务台账与人工健康报告；远程部署未连接',operations:'预算规则及外部备份、账单和功耗证据；不伪造执行',approvals:'指定部署申请的人工审批，批准不会自行执行',jobs:'一次Pi提示轮次、待审核结果与取消；关闭工具和自动付费重试',voice:'管理员文字转录、Pi意图建议与明确确认；中央音频未接通',settings:'实际平台策略与房间登记；原生Pi认证沿用S0接口'};
export interface V1RuntimeHooks {
 repository?: V1Repository;
 dispatchers?: {dispatch(domain:Domain,command:string,envelope:CommandEnvelope,actorId:string):Promise<CommandReceipt|undefined>}[];
 sanitizeRead?: (domain:Domain,record:BusinessRecord,actorId:string)=>BusinessRecord;
 capabilities?: ()=>Record<string,any>;
 ready?: (agent:string,machineId:string)=>boolean;
 afterCommand?: (domain:Domain,command:string,receipt:CommandReceipt)=>void|Promise<void>;
 stopped?: ()=>boolean;
}
export function registerV1(app:FastifyInstance,store:Store,pi:PiService,hooks:V1RuntimeHooks={}){
 const repository=hooks.repository??new V1Repository(store.databasePath),streams=new Set<()=>void>();
 if(hooks.repository)repository.setReceiptValidator((domain,receipt)=>{const name=domain==='operations'?'RuntimeOperationsRecord':domain==='capture-policies'?'CapturePolicy':domain==='releases'?'Release':dtoNames[domain];if(name)assertDto(name,receipt.data);});
 const response=(data:unknown,version=repository.version(ACTOR))=>({requestId:randomUUID(),version,data,events:[]});
 const machine=(id:string)=>{const registered=repository.read('machines',id,ACTOR);if(registered)return registered;const d=store.get('devices',id);return d?{...d,status:id==='local'?'online':'unknown',lastSeen:id==='local'?new Date().toISOString():null}:undefined};
 const stopped=()=>hooks.stopped?.()||store.getSetting<{emergency:boolean}>('v1.supervision')?.emergency===true||repository.list('settings',ACTOR).some(s=>s.kind==='policy'&&s.emergency===true);
 const jobs=new PiJobRuntime(repository,pi,stopped);jobs.start();
 const runtime={ready:(agent:string,machineId:string)=>agent==='pi-job'?pi.health().configured:hooks.ready?.(agent,machineId)??false,member:(id:string)=>{const member=store.get('members',id==='me'?'owner':id);if(member)return member;const profile=repository.read('personas',id,ACTOR);return profile?.kind==='profile'&&profile.status==='registered'?profile:undefined}};
 app.get('/api/v1/capabilities',async()=>{const actual=hooks.capabilities?.();return response({phase:actual?'v1-runtime':'v1-expanded',identity:{actorId:ACTOR,role:'administrator',familyAuthentication:!!actual?.familyAuthentication},domains:handlers.map(h=>({domain:h.domain,route:prefixes(h.domain),status:actual?'ready':['projects','experiences','stories','learning'].includes(h.domain)?'ready':'partial',commands:h.commands,unavailableCommands:actual?[]:({research:['start','pause'],tasks:['start','resume','retry'],machines:['wake','sleep'],services:['execute','restore'],sources:['sync'],books:['advance','review-all'],voice:['tts'],settings:['pi-provider']} as Record<string,string[]>)[h.domain]||[],description:actual?.descriptions?.[h.domain]??domainDescription[h.domain]})),execution:{piChat:true,piConfigured:pi.health().configured,development:false,backgroundResearch:pi.health().configured,remoteAgents:false,voice:false,ocr:false,...actual},runtimeImplemented:!!actual});});
 app.get('/api/v1/openapi',async()=>plannedContract);
 for(const handler of handlers){
  const prefix=prefixes(handler.domain);
 const dto=handler.domain==='operations'&&hooks.repository?'RuntimeOperationsRecord':dtoNames[handler.domain];
  app.get(prefix,async req=>{const q=query.parse(req.query);const data=repository.page(handler.domain,ACTOR,q.limit,q.cursor,q.scope);data.items=data.items.map(item=>hooks.sanitizeRead?.(handler.domain,item,ACTOR)??item);for(const item of data.items)assertDto(dto,item);return response(data,data.snapshotVersion)});
  app.get<{Params:{id:string}}>(`${prefix}/:id`,async req=>{const id=z.string().min(1).max(200).parse(req.params.id);let data=repository.read(handler.domain,id,ACTOR);if(!data)throw new BusinessError('VALIDATION','记录不存在或不可访问',404);data=hooks.sanitizeRead?.(handler.domain,data,ACTOR)??data;assertDto(dto,data);return response(data,data.revision)});
  for(const command of handler.commands){const route=`${prefix}/commands/${command}`;app.post(route,async req=>{validateCommand(route,req.body);let receipt:CommandReceipt|undefined;for(const dispatcher of hooks.dispatchers??[]){receipt=await dispatcher.dispatch(handler.domain,command,req.body as CommandEnvelope,ACTOR);if(receipt)break;}receipt??=repository.execute(handler,command,req.body as CommandEnvelope,ACTOR,machine,stopped,result=>assertReceipt(route,result),runtime);if(handler.domain==='jobs'&&command==='cancel')await jobs.cancel(receipt.data.id);if(handler.domain==='voice'&&command==='interrupt'&&receipt.data.jobId)await jobs.cancel(receipt.data.jobId);if(handler.domain==='research'&&command==='pause'&&receipt.data.jobId)await jobs.cancel(receipt.data.jobId);await hooks.afterCommand?.(handler.domain,command,receipt);receipt={...receipt,data:hooks.sanitizeRead?.(handler.domain,receipt.data,ACTOR)??receipt.data};assertReceipt(route,receipt);return receipt})}
 }
 for(const domain of ['releases','capture-policies'] as Domain[]){app.get(`/api/v1/${domain}`,async req=>{const q=query.parse(req.query),data=repository.page(domain,ACTOR,q.limit,q.cursor,q.scope);return response(data,data.snapshotVersion)});app.get<{Params:{id:string}}>(`/api/v1/${domain}/:id`,async req=>{const data=repository.read(domain,req.params.id,ACTOR);if(!data)throw new BusinessError('VALIDATION','记录不存在或不可访问',404);return response(data,data.revision)})}
 app.get('/api/v1/events/history',async req=>{const q=eventQuery.parse(req.query);return response({items:repository.events(ACTOR,q.afterSequence,q.limit,q.scope,q.domain,q.objectId,q.excludeObservations),latestSequence:repository.version(ACTOR)})});
 app.get('/api/v1/events',async(req,reply)=>{
  const q=eventQuery.parse(req.query);let cursor=q.afterSequence;const lastId=req.headers['last-event-id'];
  if(lastId){if(typeof lastId!=='string'||lastId.length>200)throw new BusinessError('VALIDATION','事件位置无效');const found=repository.eventSequence(ACTOR,lastId);if(found===undefined)throw new BusinessError('CONFLICT','事件位置不可用，请重新读取当前记录',409);cursor=Math.max(cursor,found)}
  if(cursor>repository.version(ACTOR))throw new BusinessError('VALIDATION','事件序号超过当前记录');
  reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});reply.raw.write(': connected\n\n');
  let closed=false;const close=()=>{if(closed)return;closed=true;clearInterval(poll);clearInterval(heartbeat);streams.delete(close);reply.raw.off('close',close);if(!reply.raw.writableEnded)reply.raw.end()};
  const send=()=>{if(closed)return;if(!store.validateLogin(req.cookies.jarvis_session??'')){reply.raw.write('event: session-expired\ndata: {"code":"FORBIDDEN"}\n\n');close();return}if(reply.raw.writableLength>1024*1024){close();return}try{for(const event of repository.events(ACTOR,cursor,100,q.scope,q.domain,q.objectId,q.excludeObservations)){reply.raw.write(`id: ${event.id}\nevent: ${event.domain}.${event.type}\ndata: ${JSON.stringify(event)}\n\n`);cursor=event.sequence}}catch{close()}};
  const poll=setInterval(send,500),heartbeat=setInterval(()=>{if(!closed)reply.raw.write(': heartbeat\n\n')},15000);poll.unref();heartbeat.unref();streams.add(close);reply.raw.on('close',close);send();
 });
 registerKnowledgeFiles(app,repository,{directory:join(dirname(store.databasePath),'knowledge-uploads'),authenticated:cookie=>store.validateLogin(cookie)});
 app.addHook('preClose',async()=>{for(const close of [...streams])close();await jobs.close()});
 app.addHook('onClose',async()=>repository.close());
 return repository;
}
