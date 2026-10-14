import { randomUUID } from 'node:crypto';
import { BusinessError, type BusinessRecord, type CommandContext, type DomainHandler } from './types.js';
import { familyHandlers } from './family-domains.js';

type Payload = Record<string, any>;
const fail = (code:string, message:string, status=422):never => { throw new BusinessError(code,message,status); };
const ensure = (condition:unknown, message:string, code='REVIEW_REQUIRED', status=422):void => { if (!condition) fail(code,message,status); };
function text(value:unknown, label:string, max=20000, preserve=false):string {
  ensure(typeof value==='string' && !!value.trim(),`请填写${label}`,'VALIDATION',400);
  const string=value as string;ensure(string.length<=max,`${label}过长`,'VALIDATION',400);
  return preserve?string:string.trim();
}
function optional(value:unknown,max=4000):string {
  if (value===undefined || value===null) return '';
  ensure(typeof value==='string' && value.length<=max,'字段格式无效','VALIDATION',400);
  return (value as string).trim();
}
function strings(value:unknown,label:string,required=false):string[] {
  if (value===undefined && !required) return [];
  ensure(Array.isArray(value),`${label}格式无效`,'VALIDATION',400);
  const list=(value as unknown[]).map(v=>text(v,label,4000));
  ensure(!required || list.length>0,`${label}不能为空`,'VALIDATION',400);
  return list;
}
function number(value:unknown,label:string,min:number,max:number,integer=false):number {
  ensure(typeof value==='number' && Number.isFinite(value) && value>=min && value<=max && (!integer || Number.isInteger(value)),`${label}无效`,'VALIDATION',400);
  return value as number;
}
function choice(value:unknown,allowed:string[],label:string):string {
  ensure(typeof value==='string' && allowed.includes(value),`${label}无效`,'VALIDATION',400);return value as string;
}
function creating(ctx:CommandContext):void { ensure(ctx.expectedVersion===0,'新记录需要 expectedVersion=0','CONFLICT',409); }
function primary(ctx:CommandContext,domain:DomainHandler['domain'],id:unknown):BusinessRecord {
  const record=ctx.require(domain,text(id,'对象 ID',200),true);ctx.check(record);return record;
}
const owned = (ctx:CommandContext,r:BusinessRecord):boolean => r.ownerId===ctx.actorId && r.scope===ctx.scope;
const normalize = (value:string):string => value.normalize('NFKC').toLocaleLowerCase().replace(/[\s，。！？、,.!?;；:："'“”‘’]/g,'');
const mutableInbox = (r:BusinessRecord):void => ensure(r.status==='pending','收件已经处理，不能重复修改或分流');
const mutableResearch = (r:BusinessRecord):void => ensure(r.status!=='converted','研究已转项目，历史研究不能覆盖');
function machine(ctx:CommandContext,id:unknown,writable=true):Record<string,any> {
  const found=ctx.machine(text(id,'设备 ID',200));ensure(found,'设备不存在或不可访问','VALIDATION',400);
  const observationOnly=found!.readOnly===true || found!.readonly===true || found!.company===true || found!.scope==='company' || /公司|企业|company/i.test(String(found!.role ?? ''));
  if (writable) ensure(ctx.scope!=='company' && !observationOnly,'公司范围或只读设备不能用于采集授权或执行','FORBIDDEN',403);
  return found!;
}
function researchBody(title:string,raw:string,now:string,terminalId:string|null=null):Payload {
  return {title,raw,question:'',criteria:'',status:'inbox',evidence:[],options:[],projectId:null,budget:30,minutesLimit:30,cost:0,discussions:[],hypotheses:[],decision:null,decisionHistory:[],plan:null,terminalId,createdAt:now,updatedAt:now};
}
function experienceBody(title:string,content:string,kind:string,source:string,now:string,conditions=''):Payload {
  return {title,content,kind,source,conditions,evidence:'',version:'draft-1',verified:false,status:'inbox',history:[],references:[],mergedSources:[],createdAt:now,updatedAt:now};
}
function snapshot(record:Payload,ctx:CommandContext,reason:string):Payload {
  return {version:record.version,at:ctx.now,reason,content:record.content,conditions:record.conditions,evidence:record.evidence,verified:record.verified,status:record.status,reviewerId:ctx.actorId};
}
function latestVersion(record:BusinessRecord,version:string):Payload|undefined {
  if (record.version===version) return record;
  return [...(record.history ?? [])].reverse().find((entry:Payload)=>entry.version===version && typeof entry.content==='string');
}
function reviewed(record:BusinessRecord):void {
  ensure(record.verified && record.status==='verified' && typeof record.evidence==='string' && record.evidence.trim() && record.verifiedContent===record.content && record.verifiedConditions===record.conditions,'请先验证当前正文、适用条件和明确证据');
}
function publishMatches(record:BusinessRecord,p:Payload):void {
  ensure(text(p.content,'技能正文',20000,true)===record.content && text(p.conditions,'适用条件')===record.conditions && text(p.evidence,'验证证据')===record.evidence,'发布内容与已验证版本不一致，请重新验证','REVIEW_REQUIRED');
}

const inbox:DomainHandler = {
  domain:'inbox',commands:['capture','annotate','merge','route','ignore','capture-policy','keep-independent'],
  execute(command,p,ctx) {
    if (command==='capture') {
      creating(ctx);
      const rawText=text(p.rawText,'原话',20000,true),kind=choice(p.kind,['idea','experience','lesson','skill','memory','book'],'收件类型');
      const terminalId=text(p.terminalId,'来源终端',200),origin=choice(p.origin,['manual','voice','device'],'来源方式');
      if (p.projectId) ctx.require('projects',text(p.projectId,'关联项目',200));
      const duplicate=ctx.list('inbox').find(item=>owned(ctx,item) && item.kind===kind && item.status==='pending' && !item.duplicateOf && normalize(String(item.rawText))===normalize(rawText));
      const item=ctx.create('inbox',{title:p.title?text(p.title,'标题',300):rawText.trim().replace(/\s+/g,' ').slice(0,80),rawText,kind,terminalId,origin,status:'pending',projectId:p.projectId ?? null,target:null,annotation:'',tags:[],duplicateOf:duplicate?.id ?? null,origins:[],createdAt:ctx.now,updatedAt:ctx.now});
      ctx.emit('inbox',item.id,'captured',{kind,origin,terminalId,duplicateOf:item.duplicateOf});return item;
    }
    if (command==='capture-policy') {
      const machineId=text(p.machineId,'设备 ID',200),device=machine(ctx,machineId,false);
      const project=p.projectId?ctx.require('projects',text(p.projectId,'关联项目',200)):undefined;
      const observationOnly=device?.readOnly===true||device?.readonly===true||device?.company===true||device?.scope==='company'||/公司|企业|company/i.test(String(device?.role??''));
      ensure(!(observationOnly||ctx.scope==='company')||(ctx.scope==='company'&&project?.scope==='company'),'公司只读采集需绑定明确公司项目与公司资料范围','FORBIDDEN',403);
      const fields=[...new Set(strings(p.fields,'授权字段',true))];
      ensure(fields.every(field=>['summary','error','lesson','skill','artifact'].includes(field)),'仅允许指定摘要、错误、经验、技能和产物字段','VALIDATION',400);
      ensure(p.consent===true && typeof p.enabled==='boolean','请明确采集授权与启用状态','VALIDATION',400);
      const existing=ctx.list('capture-policies').find(item=>owned(ctx,item) && item.machineId===machineId && item.projectId===(p.projectId ?? null));
      const body={machineId,projectId:p.projectId ?? null,fields,enabled:p.enabled,consent:true,collectorStatus:'configured',notice:'仅接受已配对节点和授权字段；节点需显式提交记录或读取指定项目日志。',updatedAt:ctx.now};
      let record:BusinessRecord;
      if (existing) {const current=ctx.require('capture-policies',existing.id,true);ctx.check(current);record=ctx.update('capture-policies',current.id,body);}
      else {creating(ctx);record=ctx.create('capture-policies',{...body,createdAt:ctx.now});}
      ctx.emit('capture-policies',record.id,'configured',{machineId,enabled:p.enabled,collectorStatus:'configured'});return record;
    }
    if (!['annotate','merge','route','ignore','keep-independent'].includes(command)) fail('VALIDATION','收件命令不存在',400);
    const source=primary(ctx,'inbox',command==='merge'?p.sourceId:p.inboxId);mutableInbox(source);
    if(command==='keep-independent'){
      ensure(!!source.duplicateOf,'这条记录不是重复候选，不需要解除关联');const reason=text(p.reason,'保留独立的理由',4000);
      const record=ctx.update('inbox',source.id,{duplicateOf:null,independenceDecision:{previousDuplicateOf:source.duplicateOf,reason,actorId:ctx.actorId,at:ctx.now},updatedAt:ctx.now});
      ctx.emit('inbox',source.id,'independent',{previousDuplicateOf:source.duplicateOf});return record;
    }
    if (command==='annotate') {
      const note=text(p.note,'批注',4000),patch:Payload={annotation:note,updatedAt:ctx.now};
      if (p.title!==undefined) patch.title=text(p.title,'标题',300);
      if (p.tags!==undefined) patch.tags=[...new Set(strings(p.tags,'标签'))];
      const kind=p.kind===undefined?source.kind:choice(p.kind,['idea','experience','lesson','skill','memory','book'],'收件类型');
      if(kind!==source.kind){
        const duplicate=ctx.list('inbox').find(item=>owned(ctx,item)&&item.id!==source.id&&item.kind===kind&&item.status==='pending'&&!item.duplicateOf&&normalize(String(item.rawText))===normalize(source.rawText));
        Object.assign(patch,{kind,duplicateOf:duplicate?.id??null,independenceDecision:undefined});
        for(const item of ctx.list('inbox').filter(item=>owned(ctx,item)&&item.id!==source.id&&item.status==='pending'&&item.duplicateOf===source.id)){
          ctx.update('inbox',item.id,{duplicateOf:null,updatedAt:ctx.now});ctx.emit('inbox',item.id,'duplicate-reference-cleared',{previousDuplicateOf:source.id,reason:'referenced-record-reclassified'});
        }
      }
      const record=ctx.update('inbox',source.id,patch);ctx.emit('inbox',record.id,'annotated',{titleChanged:p.title!==undefined,previousKind:source.kind,kind,kindChanged:kind!==source.kind,previousDuplicateOf:source.duplicateOf,duplicateOf:record.duplicateOf});return record;
    }
    if (command==='ignore') {
      const reason=text(p.reason,'忽略理由');const record=ctx.update('inbox',source.id,{status:'ignored',reason,updatedAt:ctx.now});
      ctx.emit('inbox',record.id,'ignored',{reason});return record;
    }
    if (command==='merge') {
      const target=ctx.require('inbox',text(p.targetId,'主记录',200),true),reason=text(p.reason,'合并理由');mutableInbox(target);
      ensure(target.id!==source.id && target.ownerId===source.ownerId && target.scope===source.scope && target.kind===source.kind,'合并对象必须成员、范围和类型一致','VALIDATION',400);
      ensure(!target.duplicateOf,'主记录仍是重复候选，请先解决其重复关系');
      const origin={id:source.id,rawText:source.rawText,terminalId:source.terminalId,origin:source.origin,createdAt:source.createdAt};
      ctx.update('inbox',target.id,{origins:[...(target.origins ?? []),origin,...(source.origins ?? [])],updatedAt:ctx.now});
      const record=ctx.update('inbox',source.id,{status:'merged',duplicateOf:target.id,target:{domain:'inbox',id:target.id},reason,updatedAt:ctx.now});
      ctx.emit('inbox',record.id,'merged',{targetId:target.id});return record;
    }
    const destination=choice(p.target,['research','experience','memory','material'],'分流目标');
    ensure(!source.duplicateOf,'此条是重复候选，请合并或忽略，避免重复归档');
    let target:BusinessRecord;
    if(destination==='memory'){
      ensure(ctx.scope==='private','记忆候选须来自本人私有收件；共享原话不能直接转为个人记忆','FORBIDDEN',403);
      ensure(source.rawText.length<=1200,'原话超过1200字，请先在记忆页整理后创建候选；此处不截断原文','VALIDATION',422);
      target=familyHandlers.find(h=>h.domain==='memory')!.execute('candidate',{profileId:'me',text:source.rawText,category:'统一收件',source:'统一收件 '+source.id},{...ctx,expectedVersion:0,create:ctx.create.bind(ctx),emit:ctx.emit.bind(ctx)});
    }else if(destination==='material'){
      target=ctx.create('books',{kind:'material',title:source.title,text:source.rawText,sourceInboxId:source.id,terminal:source.terminalId,at:ctx.now,status:'pending',metadata:{kind:'scan-description',origin:'inbox'},createdAt:ctx.now,updatedAt:ctx.now});
      ctx.emit('books',target.id,'material-created',{sourceInboxId:source.id});
    }else if (destination==='research') {
      target=ctx.create('research',{...researchBody(source.title,source.rawText,ctx.now,source.terminalId),sourceInboxId:source.id});
      ctx.emit('research',target.id,'created',{sourceInboxId:source.id});
    } else {
      const inferred=['experience','lesson','skill','runbook'].includes(source.kind)?source.kind:'experience';
      const kind=choice(p.kind ?? inferred,['experience','lesson','skill','runbook'],'经验类型');
      target=ctx.create('experiences',{...experienceBody(source.title,source.rawText,kind,source.id,ctx.now),sourceInboxId:source.id,terminalId:source.terminalId});
      ctx.emit('experiences',target.id,'captured',{sourceInboxId:source.id,kind});
    }
    const record=ctx.update('inbox',source.id,{status:'routed',target:{domain:destination==='experience'?'experiences':destination==='material'?'books':destination,id:target.id},updatedAt:ctx.now});
    ctx.emit('inbox',record.id,'routed',{targetDomain:record.target.domain,targetId:target.id});return record;
  }
};

const research:DomainHandler = {
  domain:'research',commands:['create','discuss','start','pause','evidence','option','remove-option','decide','convert'],
  execute(command,p,ctx) {
    if (command==='create') {
      creating(ctx);const record=ctx.create('research',researchBody(text(p.title,'研究标题',300),text(p.raw,'原始想法',20000,true),ctx.now,p.terminalId?text(p.terminalId,'终端 ID',200):null));
      ctx.emit('research',record.id,'created');return record;
    }
    if (!this.commands.includes(command)) fail('VALIDATION','研究命令不存在',400);
    const item=primary(ctx,'research',p.researchId);mutableResearch(item);
    if (command==='start') {
      ensure(!ctx.emergencyStopped(),'全局急停中，不能提交后台研究');
      text(p.question,'研究问题');text(p.criteria,'判断标准');ensure(p.plan && typeof p.plan==='object','请填写研究边界','VALIDATION',400);
      number(p.plan.budget,'研究预算',1,10000);number(p.plan.minutes,'研究时限',1,1440,true);number(p.plan.retryLimit,'重试上限',0,8,true);
      const node=machine(ctx,p.plan.machineId);
      if (!ctx.executorReady('research',node.id)) fail('NOT_CONFIGURED','后台研究执行器尚未接入，请使用人工讨论、证据与方案；未启动研究',503);
      // A registered capability alone is not a dispatch receipt. This unit of work has no executor dispatch interface.
      fail('NOT_CONFIGURED','研究作业调度尚未接入，不能仅凭配置宣称开始运行',503);
    }
    if (command==='pause') {
      text(p.reason,'暂停理由');ensure(item.status==='researching','没有正在运行的后台研究，无需暂停');
      fail('NOT_CONFIGURED','研究执行器取消接口尚未接入，未伪造暂停结果',503);
    }
    if (command==='discuss') {
      const message=text(p.text,'讨论内容',20000,true),patch:Payload={status:'discussion',updatedAt:ctx.now,discussions:[...(item.discussions ?? []),{id:randomUUID(),text:message,actorId:ctx.actorId,at:ctx.now}],decision:null};
      if (p.question!==undefined) patch.question=text(p.question,'问题');if (p.criteria!==undefined) patch.criteria=text(p.criteria,'判断标准');
      if (p.hypotheses!==undefined) patch.hypotheses=strings(p.hypotheses,'假设');
      const record=ctx.update('research',item.id,patch);ctx.emit('research',record.id,'stage',{status:'discussion'});return record;
    }
    if (command==='evidence') {
      const evidence={id:randomUUID(),kind:choice(p.kind,['support','counter','unknown'],'证据性质'),title:text(p.title,'证据标题'),summary:text(p.summary,'证据摘要',20000,true),source:text(p.source,'来源'),locator:text(p.locator,'来源定位'),status:choice(p.status,['unverified','verified','rejected'],'核对状态'),recordedBy:ctx.actorId,at:ctx.now};
      const record=ctx.update('research',item.id,{evidence:[...(item.evidence ?? []),evidence],status:'discussion',decision:null,updatedAt:ctx.now});ctx.emit('research',record.id,'evidence',{evidenceId:evidence.id,kind:evidence.kind,status:evidence.status});return record;
    }
    if (command==='option') {
      const option={id:randomUUID(),title:text(p.title,'方案名称'),approach:text(p.approach,'方案做法'),risk:text(p.risk,'方案风险'),effort:optional(p.effort),budget:p.budget===undefined?null:number(p.budget,'预计预算',0,1000000),benefit:optional(p.benefit),recommended:p.recommended===true,at:ctx.now};
      const record=ctx.update('research',item.id,{options:[...(item.options ?? []),option],status:'discussion',decision:null,updatedAt:ctx.now});ctx.emit('research',record.id,'option',{optionId:option.id});return record;
    }
    if(command==='remove-option'){
      const optionId=text(p.optionId,'方案ID',200),reason=text(p.reason,'移除理由',4000);ensure((item.options??[]).some((o:Payload)=>o.id===optionId),'方案不存在','VALIDATION',404);
      const record=ctx.update('research',item.id,{options:item.options.filter((o:Payload)=>o.id!==optionId),decision:null,status:'discussion',updatedAt:ctx.now});ctx.emit('research',item.id,'option-removed',{optionId,reason});return record;
    }
    if (command==='decide') {
      const selected=choice(p.choice,['accepted','deferred','rejected'],'研究决定'),reason=text(p.reason,'决定理由');
      if (p.optionId) ensure((item.options ?? []).some((option:Payload)=>option.id===p.optionId),'选定方案不存在','VALIDATION',400);
      if (selected==='accepted') {
        text(item.question,'研究问题');text(item.criteria,'判断标准');
        ensure((item.evidence ?? []).length>0 && (item.options ?? []).length>0 && p.optionId,'采纳前需有证据、候选方案与明确的选定方案');
      }
      const decision={choice:selected,optionId:p.optionId ?? null,reason,actorId:ctx.actorId,at:ctx.now};
      const record=ctx.update('research',item.id,{status:selected,decision,decisionHistory:[...(item.decisionHistory ?? []),decision],updatedAt:ctx.now});ctx.emit('research',record.id,'decision',{choice:selected,optionId:decision.optionId});return record;
    }
    ensure(item.status==='accepted' && item.decision?.choice==='accepted' && !item.projectId,'只有已采纳且未立项研究可转项目');
    const milestones=strings(p.milestones,'里程碑',true).map((title,id)=>({id,title,completed:false,evidence:''}));
    ensure(p.copies===undefined || Array.isArray(p.copies),'开发副本格式无效','VALIDATION',400);
    // Copy registration only records metadata, including company observation copies; it never authorizes execution.
    const copies=(p.copies ?? []).map((copy:Payload)=>{machine(ctx,copy.machineId,false);return {machineId:text(copy.machineId,'设备 ID',200),path:text(copy.path,'开发目录',2000),branch:text(copy.branch,'分支',300),environment:choice(copy.environment,['development','test','staging','production'],'副本环境')};});
    const project=ctx.create('projects',{name:text(p.name,'项目名称',300),description:text(p.description,'项目说明'),goal:text(p.goal,'项目目标'),repo:optional(p.repo,2000),status:'planned',copies,milestones,sourceResearchId:item.id,createdAt:ctx.now,updatedAt:ctx.now});
    ctx.update('research',item.id,{status:'converted',projectId:project.id,updatedAt:ctx.now});ctx.emit('projects',project.id,'created',{sourceResearchId:item.id});ctx.emit('research',item.id,'stage',{status:'converted',projectId:project.id});return project;
  }
};

const experiences:DomainHandler = {
  domain:'experiences',commands:['capture','update','archive','verify','merge','skill-publish','version','reuse','deprecate'],
  execute(command,p,ctx) {
    if (command==='capture') {
      creating(ctx);const kind=choice(p.kind,['experience','lesson','skill','runbook','family','health'],'记录类型');
      ensure(kind!=='health'||ctx.scope==='private','健康资料仅可保存在本人私有空间','FORBIDDEN',403);ensure(kind!=='family'||ctx.scope==='family','家庭资料需选择家庭共享范围','FORBIDDEN',403);
      const body=experienceBody(text(p.title,'标题',300),text(p.content,'正文',20000,true),kind,text(p.source,'来源'),ctx.now,optional(p.conditions));
      if (p.terminalId!==undefined) body.terminalId=text(p.terminalId,'终端 ID',200);
      if(p.summary!==undefined)body.summary=optional(p.summary,2000);if(p.tags!==undefined)body.tags=[...new Set(strings(p.tags,'标签'))].slice(0,30);if(p.projectId){ctx.require('projects',text(p.projectId,'项目ID',200));body.projectId=p.projectId;}
      const record=ctx.create('experiences',body);ctx.emit('experiences',record.id,'captured',{kind});return record;
    }
    if (!this.commands.includes(command)) fail('VALIDATION','经验命令不存在',400);
    const item=primary(ctx,'experiences',p.experienceId);
    ensure(item.status!=='archived','此经验已归档，历史记录只读');
    if(command==='update'){
      ensure(['inbox','verified'].includes(item.status),'已发布技能需通过新版流程修订');
      const kind=choice(p.kind??item.kind,['experience','lesson','runbook','family','health'],'资料类型');ensure(kind!=='health'||ctx.scope==='private','健康资料仅允许本人私有空间','FORBIDDEN',403);ensure(kind!=='family'||ctx.scope==='family','家庭资料需要共享范围','FORBIDDEN',403);
      if(p.projectId)ctx.require('projects',text(p.projectId,'项目ID',200));
      const record=ctx.update('experiences',item.id,{title:text(p.title,'标题',300),content:text(p.content,'正文',20000,true),source:text(p.source,'来源',20000),conditions:optional(p.conditions),kind,summary:optional(p.summary,2000),tags:[...new Set(strings(p.tags,'标签'))].slice(0,30),projectId:p.projectId??null,terminalId:p.terminalId??item.terminalId??null,verified:false,verifiedContent:null,verifiedConditions:null,verifiedAt:null,verifiedBy:null,status:'inbox',history:[...(item.history??[]),snapshot(item,ctx,'人工修订；重新验证')],updatedAt:ctx.now});ctx.emit('experiences',item.id,'updated',{validationInvalidated:true});return record;
    }
    if(command==='archive'){
      ensure(ctx.scope==='private','清除正文只允许本人私有资料','FORBIDDEN',403);ensure(item.kind!=='skill','技能需停用版本，保留任务固定引用');text(p.reason,'移除理由');
      const record=ctx.update('experiences',item.id,{title:'已移除私人资料',content:'',summary:'',conditions:'',source:'',evidence:'',history:[],mergedSources:[],references:[],tags:[],verified:false,verifiedContent:null,verifiedConditions:null,status:'archived',updatedAt:ctx.now});ctx.redactReceipts('experiences',item.id,record);ctx.emit('experiences',item.id,'private-record-removed');return record;
    }
    if (command==='verify') {
      ensure(item.status==='inbox' || item.status==='verified','已发布版本不可覆盖验证记录，请先创建新版');
      const evidence=text(p.evidence,'验证证据',20000),conditions=text(p.conditions,'适用条件');text(item.content,'当前正文',20000,true);
      const patch={evidence,conditions,verified:true,status:'verified',verifiedContent:item.content,verifiedConditions:conditions,verifiedBy:ctx.actorId,verifiedAt:ctx.now,updatedAt:ctx.now};
      const record=ctx.update('experiences',item.id,{...patch,history:[...(item.history ?? []),snapshot({...item,...patch},ctx,'明确证据验证当前内容')]});ctx.emit('experiences',record.id,'verified',{version:record.version});return record;
    }
    if (command==='merge') {
      const base=ctx.require('experiences',text(p.baseId,'主经验',200),true),reason=text(p.reason,'合并理由');
      ensure(base.id!==item.id && base.ownerId===item.ownerId && base.scope===item.scope && base.kind==='experience' && item.kind==='experience','合并对象必须是同成员同范围的独立经验','VALIDATION',400);
      ensure(['inbox','verified'].includes(base.status) && ['inbox','verified'].includes(item.status),'只有未发布且未归档经验可合并');
      const source={id:item.id,title:item.title,content:item.content,source:item.source,scope:item.scope,at:ctx.now};
      ctx.update('experiences',base.id,{mergedSources:[...(base.mergedSources ?? []),source,...(item.mergedSources ?? [])],verified:false,status:'inbox',verifiedContent:null,verifiedConditions:null,history:[...(base.history ?? []),snapshot(base,ctx,`合并来源 ${item.id}：${reason}`)],updatedAt:ctx.now});
      const record=ctx.update('experiences',item.id,{status:'archived',mergedInto:base.id,history:[...(item.history ?? []),snapshot(item,ctx,`归档到 ${base.id}：${reason}`)],updatedAt:ctx.now});ctx.emit('experiences',record.id,'merged',{baseId:base.id});return record;
    }
    if (command==='skill-publish') {
      reviewed(item);publishMatches(item,p);const version=text(p.version,'技能版本',300);
      if (item.kind!=='skill') {
        ensure(!item.publishedSkillId,'源经验已派生技能，请维护技能版本','CONFLICT',409);
        const body={...experienceBody(item.title,item.content,'skill',item.source,ctx.now,item.conditions),version,evidence:item.evidence,verified:true,status:'published',verifiedContent:item.content,verifiedConditions:item.conditions,sourceExperienceId:item.id,verifiedBy:ctx.actorId,verifiedAt:ctx.now,publishedAt:ctx.now};
        const skill=ctx.create('experiences',{...body,history:[snapshot(body,ctx,'由已验证经验派生并明确发布')]});
        ctx.update('experiences',item.id,{publishedSkillId:skill.id,updatedAt:ctx.now});ctx.emit('experiences',skill.id,'published',{version,sourceExperienceId:item.id});return skill;
      }
      ensure(item.version==='draft-1' || item.version===version,'待发布版本与请求不一致','CONFLICT',409);
      ensure(!(item.history ?? []).some((v:Payload)=>v.version===version && v.status==='published'),'该版本已经发布，不能重写','CONFLICT',409);
      const patch={version,status:'published',publishedAt:ctx.now,updatedAt:ctx.now};
      const record=ctx.update('experiences',item.id,{...patch,history:[...(item.history ?? []),snapshot({...item,...patch},ctx,'明确发布验证技能版本')]});ctx.emit('experiences',record.id,'published',{version});return record;
    }
    if (command==='version') {
      ensure(item.kind==='skill' && ['published','deprecated'].includes(item.status),'请先发布当前技能版本');
      const version=text(p.version,'新版本',300);ensure(version!==item.version && !(item.history ?? []).some((v:Payload)=>v.version===version),'版本号已存在，不得覆盖','CONFLICT',409);
      const content=text(p.content,'新版正文',20000,true),conditions=text(p.conditions,'适用条件'),evidence=text(p.evidence,'修订依据',20000);
      const record=ctx.update('experiences',item.id,{version,content,conditions,evidence,verified:false,status:'inbox',verifiedContent:null,verifiedConditions:null,verifiedAt:null,verifiedBy:null,history:[...(item.history ?? []),snapshot(item,ctx,`保留旧版；新候选 ${version}`)],updatedAt:ctx.now});
      ctx.emit('experiences',record.id,'version',{version,previousVersion:item.version,status:'inbox'});return record;
    }
    if (command==='reuse') {
      ensure(item.kind==='skill' && item.status!=='deprecated','只有未停用的技能版本可新增引用');const version=text(p.version,'引用版本',300),body=latestVersion(item,version);
      ensure(body && body.verified===true && body.status==='published','所选版本尚未验证发布或已停用');
      ensure(!!p.taskId!==!!p.projectId,'请选择一个任务或项目作为引用目标','VALIDATION',400);
      const domain=p.taskId?'tasks':'projects',target=ctx.require(domain,text(p.taskId ?? p.projectId,'引用目标',200),true);
      if (domain==='tasks') ensure(target.mode==='managed' && !['completed','failed','cancelled'].includes(target.status),'只允许活动托管任务引用技能；失败任务须先重试');
      else ensure(!['archived','delivered'].includes(target.status),'已交付或归档项目不能新增引用');
      const refs=target.skillRefs ?? [];ensure(!refs.some((v:Payload)=>v.experienceId===item.id && v.version===version),'目标已经引用该固定版本','CONFLICT',409);
      const reference={experienceId:item.id,version,at:ctx.now};ctx.update(domain,target.id,{skillRefs:[...refs,reference],updatedAt:ctx.now});
      const record=ctx.update('experiences',item.id,{references:[...(item.references ?? []),{domain,objectId:target.id,version,at:ctx.now}],updatedAt:ctx.now});
      ctx.emit(domain,target.id,'skill-referenced',{experienceId:item.id,version});ctx.emit('experiences',record.id,'referenced',{targetDomain:domain,targetId:target.id,version});return record;
    }
    ensure(item.kind==='skill' && item.status==='published' && item.verified,'只有已发布技能版本可停用');
    const reason=text(p.reason,'停用理由'),patch={status:'deprecated',updatedAt:ctx.now};
    const record=ctx.update('experiences',item.id,{...patch,history:[...(item.history ?? []),snapshot({...item,...patch},ctx,reason)]});ctx.emit('experiences',record.id,'deprecated',{version:item.version});return record;
  }
};

export const captureHandlers:DomainHandler[] = [inbox,research,experiences];
