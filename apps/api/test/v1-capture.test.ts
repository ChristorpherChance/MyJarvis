import assert from 'node:assert/strict';
import {test} from 'node:test';
import {captureHandlers} from '../src/v1/capture-domains.ts';
import {BusinessError,type BusinessRecord,type CommandContext,type Domain,type DomainEvent,type Scope} from '../src/v1/types.ts';

/** Only in-memory records. No store, database, model, network or real machine is used. */
class FakeContext implements CommandContext {
  actorId='server-admin';scope:Scope='private';expectedVersion=0;now='2026-10-05T12:00:00.000Z';
  records=new Map<Domain,Map<string,BusinessRecord>>();events:DomainEvent[]=[];serial=0;ready=false;stopped=false;failCreate:Domain|null=null;
  machines=new Map<string,Record<string,any>>([['local',{id:'local',status:'online',readOnly:false}],['company',{id:'company',status:'online',readOnly:true}]]);
  table(domain:Domain){let t=this.records.get(domain);if(!t){t=new Map();this.records.set(domain,t)}return t}
  list(domain:Domain){return [...this.table(domain).values()].filter(r=>r.ownerId===this.actorId&&r.scope===this.scope).map(r=>structuredClone(r))}
  get(domain:Domain,id:string){const r=this.table(domain).get(id);return r?structuredClone(r):undefined}
  require(domain:Domain,id:string,_write=false){const r=this.get(domain,id);if(!r||r.ownerId!==this.actorId||r.scope!==this.scope)throw new BusinessError('FORBIDDEN','对象不存在或不可见',403);return r}
  create(domain:Domain,body:Record<string,any>,id?:string){if(this.failCreate===domain)throw new BusinessError('DEPENDENCY_PENDING','注入跨领域创建失败',422);const r={...structuredClone(body),id:id??`record-${++this.serial}`,revision:1,ownerId:this.actorId,scope:this.scope} as BusinessRecord;this.table(domain).set(r.id,r);return structuredClone(r)}
  update(domain:Domain,id:string,patch:Record<string,any>){const old=this.require(domain,id,true);const r={...old,...structuredClone(patch),id:old.id,revision:old.revision+1,ownerId:old.ownerId,scope:old.scope};this.table(domain).set(id,r);return structuredClone(r)}
  check(record:BusinessRecord){if(record.revision!==this.expectedVersion)throw new BusinessError('CONFLICT','对象版本已变化',409)}
  emit(domain:Domain,objectId:string,type:string,payload:Record<string,unknown>={}){this.events.push({id:`event-${this.events.length+1}`,sequence:this.events.length+1,at:this.now,actorId:this.actorId,domain,objectId,type,payload:structuredClone(payload)})}
  machine(id:string){return this.machines.get(id)}
  executorReady(_agent:string,_machineId:string){return this.ready}
  emergencyStopped(){return this.stopped}
  seed(domain:Domain,body:Record<string,any>,scope:Scope=this.scope,ownerId=this.actorId){const previousScope=this.scope,previousActor=this.actorId;this.scope=scope;this.actorId=ownerId;try{return this.create(domain,body)}finally{this.scope=previousScope;this.actorId=previousActor}}
  call(domain:Domain,command:string,payload:Record<string,any>,options:{expectedVersion?:number;scope?:Scope;actorId?:string}={}){
    const handler=captureHandlers.find(h=>h.domain===domain);assert(handler);
    this.scope=options.scope??'private';this.actorId=options.actorId??'server-admin';
    let id=domain==='inbox'?(command==='merge'?payload.sourceId:payload.inboxId):domain==='research'?payload.researchId:payload.experienceId;
    if(command==='capture-policy')id=this.list('capture-policies').find(p=>p.machineId===payload.machineId&&p.projectId===(payload.projectId??null))?.id;
    const aggregateDomain=command==='capture-policy'?'capture-policies':domain;
    this.expectedVersion=options.expectedVersion??(id?this.get(aggregateDomain,id)?.revision??0:0);
    const before=structuredClone({records:this.records,events:this.events,serial:this.serial});
    try{return handler.execute(command,payload,this)}catch(error){this.records=before.records;this.events=before.events;this.serial=before.serial;throw error}
  }
  denied(domain:Domain,command:string,payload:Record<string,any>,code:string,options:{expectedVersion?:number;scope?:Scope;actorId?:string}={}){
    const before=structuredClone({records:this.records,events:this.events});
    assert.throws(()=>this.call(domain,command,payload,options),(e:unknown)=>e instanceof BusinessError&&e.code===code);
    assert.deepEqual({records:this.records,events:this.events},before,'失败不得提交跨领域数据或事件');
  }
}
const capture=(ctx:FakeContext,rawText='  保留原话：修复权限问题。\n下一步确认结果。  ',kind='experience',scope:Scope='private')=>ctx.call('inbox','capture',{rawText,kind,terminalId:'desk',origin:'manual'},{scope});
const experience=(ctx:FakeContext,kind='experience')=>ctx.call('experiences','capture',{title:'权限排查',content:'先检查对象归属，再确认访问范围。',kind,source:'本人实践'});
function verified(ctx:FakeContext,record:BusinessRecord){return ctx.call('experiences','verify',{experienceId:record.id,evidence:'手工复现权限隔离与通过检查，记录可复核。',conditions:'仅适用于当前项目的本地账户。'})}
function publish(ctx:FakeContext,record:BusinessRecord,version='1.0'){return ctx.call('experiences','skill-publish',{experienceId:record.id,version,content:record.content,conditions:record.conditions,evidence:record.evidence})}
function acceptedResearch(ctx:FakeContext){
 let r=ctx.call('research','create',{title:'权限中心',raw:'原始想法：整合权限并保留分域记录。'});
 r=ctx.call('research','discuss',{researchId:r.id,text:'先确认范围',question:'怎样隔离记录？',criteria:'越权拒绝且可审计。',hypotheses:['服务端检查所有者']});
 r=ctx.call('research','evidence',{researchId:r.id,kind:'support',title:'现有权限流程',summary:'本人的复现记录',source:'本地记录',locator:'检查1',status:'verified'});
 r=ctx.call('research','option',{researchId:r.id,title:'统一领域事务',approach:'所有命令检查scope',risk:'接口迁移需验证'});
 return ctx.call('research','decide',{researchId:r.id,choice:'accepted',optionId:r.options[0].id,reason:'已有证据与具体方案。'});
}

test('三领域28个命令包含经验反例撤证与替代的正式handler入口',()=>{
 assert.deepEqual(captureHandlers.map(h=>[h.domain,h.commands.length]),[['inbox',7],['research',9],['experiences',12]]);
 const ctx=new FakeContext();ctx.denied('inbox','fake-success',{},'VALIDATION');
});

test('重复候选可由本人有理由保留独立，原文旧关联和版本检查保留',()=>{
 const ctx=new FakeContext(),base=capture(ctx,'同一原始表达'),candidate=capture(ctx,'同一原始表达');
 assert.equal(candidate.duplicateOf,base.id);
 ctx.denied('inbox','keep-independent',{inboxId:candidate.id,reason:'独立的实践案例'},'CONFLICT',{expectedVersion:0});
 const kept=ctx.call('inbox','keep-independent',{inboxId:candidate.id,reason:'表达相同，但来自另一次独立实践'});
 assert.equal(kept.rawText,candidate.rawText);assert.equal(kept.duplicateOf,null);assert.equal(kept.status,'pending');assert.equal(kept.independenceDecision.previousDuplicateOf,base.id);assert.equal(kept.independenceDecision.reason,'表达相同，但来自另一次独立实践');
 ctx.denied('inbox','keep-independent',{inboxId:kept.id,reason:'重复决定'},'REVIEW_REQUIRED');
 const routed=ctx.call('inbox','route',{inboxId:kept.id,target:'experience'});assert.equal(ctx.require('experiences',routed.target.id).content,candidate.rawText);
});

test('原文保留、去重仅提示、批注不覆盖原话，忽略保留来源',()=>{
 const ctx=new FakeContext(),original=capture(ctx),duplicate=capture(ctx,'保留原话:修复权限问题! 下一步确认结果。');
 assert.equal(original.ownerId,'server-admin');assert.equal(original.rawText,'  保留原话：修复权限问题。\n下一步确认结果。  ');
 assert.equal(duplicate.duplicateOf,original.id);assert.equal(duplicate.status,'pending');assert.equal(ctx.list('inbox').length,2);
 const annotation=ctx.call('inbox','annotate',{inboxId:original.id,note:'补充定位',title:'明确标题',tags:['权限','权限']});
 assert.equal(annotation.rawText,original.rawText);assert.deepEqual(annotation.tags,['权限']);assert.equal(annotation.annotation,'补充定位');
 ctx.denied('inbox','route',{inboxId:duplicate.id,target:'experience'},'REVIEW_REQUIRED');
 const ignored=ctx.call('inbox','ignore',{inboxId:duplicate.id,reason:'重复原记录'});assert.equal(ignored.rawText,duplicate.rawText);assert.equal(ignored.status,'ignored');
 ctx.denied('inbox','annotate',{inboxId:ignored.id,note:'尝试改写'},'REVIEW_REQUIRED');
});

test('收件重新分类保留原话，重新核对自身重复候选并清理旧分类的待处理引用',()=>{
 const ctx=new FakeContext(),raw='  一个原始案例。\n保留全部空白  ',source=capture(ctx,raw,'idea'),oldDuplicate=capture(ctx,'一个原始案例。保留全部空白','idea'),newBase=capture(ctx,raw,'skill');
 const changed=ctx.call('inbox','annotate',{inboxId:source.id,note:'按实际内容修订分类',kind:'skill',title:'明确的技能候选'});
 assert.equal(changed.kind,'skill');assert.equal(changed.rawText,raw);assert.equal(changed.duplicateOf,newBase.id);assert.equal(changed.status,'pending');assert.equal(changed.target,null);assert.deepEqual(changed.origins,[]);
 const detached=ctx.require('inbox',oldDuplicate.id);assert.equal(detached.kind,'idea');assert.equal(detached.duplicateOf,null);assert.equal(detached.rawText,oldDuplicate.rawText);assert.equal(detached.status,'pending');assert.equal(ctx.list('experiences').length,0);assert.equal(ctx.list('research').length,0);
 ctx.denied('inbox','annotate',{inboxId:source.id,note:'非法分类',kind:'health'},'VALIDATION');ctx.denied('inbox','annotate',{inboxId:source.id,note:'旧版本覆盖',kind:'book'},'CONFLICT',{expectedVersion:1});ctx.denied('inbox','annotate',{inboxId:source.id,note:'跨范围改动',kind:'lesson'},'FORBIDDEN',{scope:'family'});
 capture(ctx,raw,'lesson','family');const cleared=ctx.call('inbox','annotate',{inboxId:source.id,note:'属于独立教训',kind:'lesson'});assert.equal(cleared.duplicateOf,null,'不能将私人原话关联到同文的家庭记录');assert.equal(cleared.rawText,raw);const archived=ctx.call('inbox','route',{inboxId:source.id,target:'experience'});assert.equal(archived.status,'routed');ctx.denied('inbox','annotate',{inboxId:source.id,note:'已归档不得改分类',kind:'book'},'REVIEW_REQUIRED');
});

test('收件编辑接受六个合法分类，标题和分类修订都不能改写原话',()=>{
 const ctx=new FakeContext();for(const kind of ['idea','experience','lesson','skill','memory','book']){const raw=` ${kind} 原始文字\n `,source=capture(ctx,raw,'idea'),updated=ctx.call('inbox','annotate',{inboxId:source.id,kind,note:'分类由本人核对',title:'整理标题'});assert.equal(updated.kind,kind);assert.equal(updated.rawText,raw);assert.equal(updated.origin,'manual');assert.equal(updated.terminalId,'desk');}
});

test('原话合并仅同所有者/范围/类型，保留各来源且不可重复归档',()=>{
 const ctx=new FakeContext(),base=capture(ctx,'第一台终端的原始表达。'),source=capture(ctx,'第二台终端的原始表达。');
 const merged=ctx.call('inbox','merge',{sourceId:source.id,targetId:base.id,reason:'确认同一问题'});
 assert.equal(merged.status,'merged');assert.equal(merged.rawText,source.rawText);assert.deepEqual(merged.target,{domain:'inbox',id:base.id});
 assert.equal(ctx.require('inbox',base.id).origins[0].rawText,source.rawText);assert.equal(ctx.require('inbox',base.id).rawText,base.rawText);
 ctx.denied('inbox','route',{inboxId:merged.id,target:'experience'},'REVIEW_REQUIRED');
 const family=capture(ctx,'家庭记录','experience','family');ctx.denied('inbox','merge',{sourceId:base.id,targetId:family.id,reason:'不能扩大'},'FORBIDDEN');
 const other=ctx.seed('inbox',{...base,id:undefined},'private','other-member');ctx.denied('inbox','merge',{sourceId:base.id,targetId:other.id,reason:'越权'},'FORBIDDEN');
});

test('收件分流创建研究经验和待确认记忆资料，失败原子回滚',()=>{
 const ctx=new FakeContext(),item=capture(ctx,'需要真实整理的经验');
 const routed=ctx.call('inbox','route',{inboxId:item.id,target:'experience'}),target=ctx.require('experiences',routed.target.id);
 assert.equal(target.content,item.rawText);assert.equal(target.scope,item.scope);assert.equal(target.sourceInboxId,item.id);assert.equal(target.verified,false);
 ctx.denied('inbox','route',{inboxId:item.id,target:'experience'},'REVIEW_REQUIRED');
 const idea=capture(ctx,'要研究的原始想法','idea');const researchRoute=ctx.call('inbox','route',{inboxId:idea.id,target:'research'});
 assert.equal(ctx.require('research',researchRoute.target.id).raw,idea.rawText);
 const memoryItem=capture(ctx,'希望记住的个人约定','memory');const memoryRoute=ctx.call('inbox','route',{inboxId:memoryItem.id,target:'memory'});assert.equal(ctx.require('memory',memoryRoute.target.id).status,'candidate');
 const materialItem=capture(ctx,'尚待补交扫描原件的资料','book');const materialRoute=ctx.call('inbox','route',{inboxId:materialItem.id,target:'material'});assert.equal(ctx.require('books',materialRoute.target.id).kind,'material');assert.equal(ctx.require('books',materialRoute.target.id).file,undefined);
 const pending=capture(ctx,'需要保留的资料');
 ctx.failCreate='experiences';ctx.denied('inbox','route',{inboxId:pending.id,target:'experience'},'DEPENDENCY_PENDING');
});

test('采集策略只保存明确授权，不能伪造被动采集或覆盖公司只读边界',()=>{
 const ctx=new FakeContext();const p={machineId:'local',fields:['summary','error'],enabled:true,consent:true};
 const policy=ctx.call('inbox','capture-policy',p);assert.equal(policy.collectorStatus,'configured');assert.match(policy.notice,/已配对节点和授权字段/);assert.equal(ctx.list('inbox').length,0);
 const disabled=ctx.call('inbox','capture-policy',{...p,enabled:false});assert.equal(disabled.id,policy.id);assert.equal(disabled.revision,2);
 ctx.denied('inbox','capture-policy',{...p,fields:['password']},'VALIDATION');
 ctx.denied('inbox','capture-policy',{...p,consent:false},'VALIDATION');
 ctx.denied('inbox','capture-policy',{...p,machineId:'company'},'FORBIDDEN');
 ctx.machines.set('company-role',{id:'company-role',status:'online',role:'公司主开发'});
 ctx.denied('inbox','capture-policy',{...p,machineId:'company-role'},'FORBIDDEN');
 ctx.denied('inbox','capture-policy',p,'FORBIDDEN',{scope:'company'});
 const project=ctx.seed('projects',{name:'明确授权的公司项目',status:'active'},'company');
 const scoped=ctx.call('inbox','capture-policy',{...p,machineId:'company',projectId:project.id},{scope:'company'});assert.equal(scoped.scope,'company');assert.equal(scoped.projectId,project.id);assert.equal(scoped.collectorStatus,'configured');assert.equal(ctx.list('inbox').length,0);
});

test('每个写目标检查revision，新记录也拒绝非零版本和其他成员/范围',()=>{
 const ctx=new FakeContext(),item=capture(ctx);
 ctx.denied('inbox','annotate',{inboxId:item.id,note:'冲突'},'CONFLICT',{expectedVersion:0});
 ctx.denied('inbox','capture',{rawText:'新原话',kind:'idea',terminalId:'desk',origin:'manual'},'CONFLICT',{expectedVersion:1});
 ctx.denied('inbox','ignore',{inboxId:item.id,reason:'越权'},'FORBIDDEN',{actorId:'other-member'});
 ctx.denied('inbox','ignore',{inboxId:item.id,reason:'扩大范围'},'FORBIDDEN',{scope:'family'});
});

test('研究使用真实人工讨论/证据/方案，不能假启动或假暂停执行器',()=>{
 const ctx=new FakeContext();let r=ctx.call('research','create',{title:'研究问题',raw:'  原始表达  '});assert.equal(r.raw,'  原始表达  ');
 r=ctx.call('research','discuss',{researchId:r.id,text:'增加假设',question:'怎么验证？',criteria:'有可复查结果',hypotheses:['前后对照']});assert.equal(r.discussions[0].actorId,'server-admin');
 const payload={researchId:r.id,question:'怎么验证？',criteria:'有可复查结果',plan:{budget:30,minutes:30,retryLimit:2,machineId:'local'}};
  ctx.denied('research','start',payload,'NOT_CONFIGURED');ctx.ready=true;ctx.denied('research','start',payload,'NOT_CONFIGURED');
  ctx.stopped=true;ctx.denied('research','start',payload,'REVIEW_REQUIRED');ctx.stopped=false;
 ctx.denied('research','pause',{researchId:r.id,reason:'暂停'},'REVIEW_REQUIRED');assert.equal(ctx.require('research',r.id).status,'discussion');
 ctx.denied('research','decide',{researchId:r.id,choice:'accepted',optionId:'missing',reason:'无证据'},'VALIDATION');
 r=ctx.call('research','evidence',{researchId:r.id,kind:'counter',title:'反证',summary:'还未核实',source:'本人记录',locator:'测试2',status:'unverified'});assert.equal(r.evidence[0].status,'unverified');
 r=ctx.call('research','option',{researchId:r.id,title:'候选',approach:'有限验证',risk:'尚有未知'});
 const accepted=ctx.call('research','decide',{researchId:r.id,choice:'accepted',optionId:r.options[0].id,reason:'本人在明确未知条件下采纳'});assert.equal(accepted.status,'accepted');assert.equal(accepted.cost,0);
 const changed=ctx.call('research','evidence',{researchId:r.id,kind:'unknown',title:'新问题',summary:'新增线索',source:'本人记录',locator:'测试3',status:'unverified'});assert.equal(changed.status,'discussion');assert.equal(changed.decision,null);assert.equal(changed.decisionHistory.length,1);
});

test('研究人工采纳后原子转项目，保持目标、范围、副本和来源',()=>{
 const ctx=new FakeContext(),r=acceptedResearch(ctx),payload={researchId:r.id,name:'真实项目',description:'研究决定形成项目',goal:'权限隔离验证',milestones:['定义规则','实现与验收'],copies:[{machineId:'local',path:'D:/projects/real',branch:'main',environment:'development'}]};
 const project=ctx.call('research','convert',payload);assert.equal(project.sourceResearchId,r.id);assert.equal(project.scope,r.scope);assert.equal(project.status,'planned');assert.equal(project.milestones[1].id,1);assert.equal(project.milestones[1].completed,false);
 assert.equal(project.milestones[1].evidence,'');
 assert.equal(ctx.require('research',r.id).projectId,project.id);assert.equal(ctx.require('research',r.id).status,'converted');
 ctx.denied('research','convert',payload,'REVIEW_REQUIRED');ctx.denied('research','discuss',{researchId:r.id,text:'覆盖'},'REVIEW_REQUIRED');
 const observation=acceptedResearch(ctx);const recorded=ctx.call('research','convert',{...payload,researchId:observation.id,copies:[{machineId:'company',path:'D:/project-observation',branch:'main',environment:'development'}]});assert.equal(recorded.copies[0].machineId,'company');assert.equal(ctx.ready,false);
 const second=acceptedResearch(ctx);ctx.failCreate='projects';ctx.denied('research','convert',{...payload,researchId:second.id},'DEPENDENCY_PENDING');assert.equal(ctx.require('research',second.id).status,'accepted');
});

test('经验发布必须绑定已验证正文与明确证据，源经验保留',()=>{
 const ctx=new FakeContext();let e=experience(ctx);
 ctx.denied('experiences','skill-publish',{experienceId:e.id,version:'1.0',content:e.content,conditions:'任意',evidence:'模型说成功'},'REVIEW_REQUIRED');
 ctx.denied('experiences','verify',{experienceId:e.id,evidence:'   ',conditions:'有条件'},'VALIDATION');
 e=verified(ctx,e);assert.equal(e.status,'verified');
 ctx.denied('experiences','skill-publish',{experienceId:e.id,version:'1.0',content:'验证后偷偷改内容',conditions:e.conditions,evidence:e.evidence},'REVIEW_REQUIRED');
 const skill=publish(ctx,e);assert.notEqual(skill.id,e.id);assert.equal(skill.sourceExperienceId,e.id);assert.equal(skill.status,'published');assert.equal(skill.verified,true);
 assert.equal(skill.publishedAt,ctx.now);
 assert.equal(ctx.require('experiences',e.id).content,e.content);assert.equal(ctx.require('experiences',e.id).publishedSkillId,skill.id);
 ctx.denied('experiences','skill-publish',{experienceId:e.id,version:'1.1',content:e.content,conditions:e.conditions,evidence:e.evidence},'CONFLICT');
});

test('新版保留旧正文与固定引用，候选须重验，不能覆盖既有版本',()=>{
 const ctx=new FakeContext();let skill=publish(ctx,verified(ctx,experience(ctx)));
 const task=ctx.seed('tasks',{title:'后续任务',mode:'managed',status:'queued',skillRefs:[]});
 skill=ctx.call('experiences','reuse',{experienceId:skill.id,version:'1.0',taskId:task.id});const oldReference=structuredClone(ctx.require('tasks',task.id).skillRefs);
 const oldContent=skill.content;skill=ctx.call('experiences','version',{experienceId:skill.id,version:'1.1',content:'新版步骤，增加权限边界检查。',conditions:'用于新版接口',evidence:'修订理由，不自动成为验证'});
 assert.equal(skill.verified,false);assert.equal(skill.status,'inbox');assert(skill.history.some((v:any)=>v.version==='1.0'&&v.content===oldContent&&v.status==='published'));
 assert.deepEqual(ctx.require('tasks',task.id).skillRefs,oldReference);
 ctx.denied('experiences','skill-publish',{experienceId:skill.id,version:'1.1',content:skill.content,conditions:skill.conditions,evidence:skill.evidence},'REVIEW_REQUIRED');
 skill=verified(ctx,skill);skill=publish(ctx,skill,'1.1');assert.equal(skill.version,'1.1');assert.deepEqual(ctx.require('tasks',task.id).skillRefs,oldReference);
 ctx.denied('experiences','version',{experienceId:skill.id,version:'1.0',content:'覆盖旧版',conditions:'条件',evidence:'理由'},'CONFLICT');
 const project=ctx.seed('projects',{name:'复用项目',status:'active',skillRefs:[]});skill=ctx.call('experiences','reuse',{experienceId:skill.id,version:'1.1',projectId:project.id});assert.equal(ctx.require('projects',project.id).skillRefs[0].version,'1.1');
 ctx.denied('experiences','reuse',{experienceId:skill.id,version:'1.1',projectId:project.id},'CONFLICT');
 skill=ctx.call('experiences','deprecate',{experienceId:skill.id,reason:'规则已有变化'});assert.equal(skill.status,'deprecated');assert.deepEqual(ctx.require('tasks',task.id).skillRefs,oldReference);
 const fresh=ctx.seed('tasks',{mode:'managed',status:'queued',skillRefs:[]});ctx.denied('experiences','reuse',{experienceId:skill.id,version:'1.0',taskId:fresh.id},'REVIEW_REQUIRED');
});

test('经验合并保留正文来源并使主经验待重验，不允许越界合并',()=>{
 const ctx=new FakeContext();const base=verified(ctx,experience(ctx)),source=experience(ctx);
 const merged=ctx.call('experiences','merge',{experienceId:source.id,baseId:base.id,reason:'重复经验同一问题'});assert.equal(merged.status,'archived');assert.equal(merged.content,source.content);
 const target=ctx.require('experiences',base.id);assert.equal(target.verified,false);assert.equal(target.status,'inbox');assert.equal(target.mergedSources[0].content,source.content);
 ctx.denied('experiences','verify',{experienceId:merged.id,evidence:'再验证',conditions:'条件'},'REVIEW_REQUIRED');
 const different=ctx.seed('experiences',{...source,status:'inbox'},'family');ctx.denied('experiences','merge',{experienceId:base.id,baseId:different.id,reason:'越界'},'FORBIDDEN');
});

test('固定技能引用拒绝观察/终态任务、交付/归档项目、未验证版本与越权目标',()=>{
 const ctx=new FakeContext(),skill=publish(ctx,verified(ctx,experience(ctx))),observe=ctx.seed('tasks',{mode:'observe',status:'paused'}),archived=ctx.seed('projects',{status:'archived'}),foreign=ctx.seed('tasks',{mode:'managed',status:'queued'},'family');
 ctx.denied('experiences','reuse',{experienceId:skill.id,version:'1.0',taskId:observe.id},'REVIEW_REQUIRED');
 ctx.denied('experiences','reuse',{experienceId:skill.id,version:'1.0',projectId:archived.id},'REVIEW_REQUIRED');
 const delivered=ctx.seed('projects',{status:'delivered'}),failed=ctx.seed('tasks',{mode:'managed',status:'failed'});
 ctx.denied('experiences','reuse',{experienceId:skill.id,version:'1.0',projectId:delivered.id},'REVIEW_REQUIRED');
 ctx.denied('experiences','reuse',{experienceId:skill.id,version:'1.0',taskId:failed.id},'REVIEW_REQUIRED');
 ctx.denied('experiences','reuse',{experienceId:skill.id,version:'2.0',taskId:observe.id},'REVIEW_REQUIRED');
 ctx.denied('experiences','reuse',{experienceId:skill.id,version:'1.0',taskId:foreign.id},'FORBIDDEN');
 assert.equal(ctx.require('experiences',skill.id).references.length,0);
});
