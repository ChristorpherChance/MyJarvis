const fs=require('node:fs');
const path='docs/openapi-v1-planned.json',d=JSON.parse(fs.readFileSync(path,'utf8')),s=d.components.schemas;
require('./extend-family-contract.cjs')(d);
require('./knowledge-runtime-contract.cjs').applyKnowledgeRuntimeContract(d);
require('./execution-runtime-contract.cjs')(d);
require('./extend-voice-identity-contract.cjs')(d);
require('./notifications-runtime-contract.cjs')(d);
require('./weather-runtime-contract.cjs')(d);
require('./web-runtime-contract.cjs')(d);
require('./voice-intents-contract.cjs')(d);
const ref=n=>({$ref:'#/components/schemas/'+n}),str=(max=200)=>({type:'string',maxLength:max}),integer={type:'integer',minimum:0},obj=(properties,required=[])=>({type:'object',additionalProperties:false,properties,required});
const requiredText=(max=200)=>({...str(max),minLength:1}),command=(domain,name,properties,required,dto)=>{const n='Runtime'+domain+name;s[n+'Payload']=obj(properties,required);s[n+'Command']=obj({commandId:requiredText(),expectedVersion:integer,scope:ref('Scope'),payload:ref(n+'Payload')},['commandId','expectedVersion','scope','payload']);s[n+'Result']={allOf:[ref('CommandResult'),{type:'object',properties:{data:ref(dto)}}]};const p='/api/v1/'+domain+'/commands/'+name;d.paths[p]={post:{operationId:n,tags:[domain],'x-implementation-status':'implemented',requestBody:{required:true,content:{'application/json':{schema:ref(n+'Command')}}},responses:{200:{description:'版本保护的真实变更；修改目标会废止旧验收或验证',content:{'application/json':{schema:ref(n+'Result')}}},400:{description:'字段无效'},403:{description:'范围不符'},409:{description:'版本冲突或实际执行尚未结束'},422:{description:'人工审核状态不允许'}}}};};
command('projects','update',{projectId:requiredText(),name:requiredText(300),description:requiredText(4000),goal:requiredText(20000),repo:str(4000)},['projectId','name','description','goal'],'Project');
const environmentInfo=obj({environment:str(20000),runCommand:str(4000),verifyCommand:str(4000),notes:str(20000)});command('projects','environment-info',{projectId:requiredText(),environmentInfo},['projectId','environmentInfo'],'Project');s.Project.properties.environmentInfo=environmentInfo;
command('tasks','limits',{taskId:requiredText(),budget:{type:'number',minimum:1,maximum:10000},retryLimit:{type:'integer',minimum:0,maximum:8},goal:requiredText(20000),criteria:requiredText(20000),reason:requiredText(4000),deadline:{anyOf:[{type:'string',format:'date-time'},{type:'null'}]}},['taskId','budget','retryLimit','reason'],'Task');
command('research','remove-option',{researchId:requiredText(),optionId:requiredText(),reason:requiredText(4000)},['researchId','optionId','reason'],'Research');
const metadata={summary:str(2000),tags:{type:'array',maxItems:30,items:requiredText(40)},projectId:requiredText(),terminalId:requiredText()},kind={enum:['experience','lesson','skill','runbook','family','health']};
command('experiences','update',{experienceId:requiredText(),title:requiredText(300),content:requiredText(20000),source:requiredText(20000),conditions:str(4000),kind,...metadata},['experienceId','title','content','source'],'Experience');command('experiences','archive',{experienceId:requiredText(),reason:requiredText(4000)},['experienceId','reason'],'Experience');
const capture=s.ExperiencesCapturePayload?.properties;if(!capture)throw Error('Experience capture contract missing');Object.assign(capture,{kind,...metadata});s.Experience.properties.kind=kind;Object.assign(s.Experience.properties,{summary:str(2000),tags:metadata.tags,projectId:{type:['string','null']},terminalId:{type:['string','null']}});for(const name of ['content','source','conditions','evidence'])if(s.Experience.properties[name]?.type==='string')s.Experience.properties[name].minLength=0;
if(s.Task.properties.deadline)s.Task.properties.deadline={anyOf:[{type:'string',format:'date-time'},{type:'null'}]};
s.Memory.properties.cleanupStatus={enum:['not-configured','configured']};
Object.assign(s.Research.properties,{jobId:{type:'string'},blockReason:{type:'string'},backgroundResult:{type:['object','null'],additionalProperties:true}});
Object.assign(s.VoiceRecord.properties,{audioTransport:{enum:['not-configured','central-runtime']},speech:{type:'object',additionalProperties:true},retentionCleanedAt:{type:'string',format:'date-time'}});
s.CapturePolicy.properties.collectorStatus={enum:['not-configured','configured']};
s.MemoryExecutionRecord=obj({id:str(),ownerId:str(),scope:ref('Scope'),revision:integer,kind:{const:'memory-execution'},status:{enum:['running','completed','cancelled','failed','interrupted']},conversationId:str(),candidateIds:{type:'array',items:str()},error:{type:['string','null']},createdAt:str(),updatedAt:str(),finishedAt:str(),discarded:integer,verification:str()},['id','ownerId','scope','revision','kind','status','conversationId','candidateIds','error','createdAt','updatedAt']);
s.RuntimeOperationsRecord={anyOf:[ref('InfrastructureRecord'),ref('KnowledgeExecutionRecord'),ref('MemoryExecutionRecord')]};
s.RuntimeOperationsCollection=obj({items:{type:'array',items:ref('RuntimeOperationsRecord')},nextCursor:{type:['string','null']},snapshotVersion:integer},['items','nextCursor','snapshotVersion']);
for(const [p,dto] of [['/api/v1/operations','RuntimeOperationsCollection'],['/api/v1/operations/{id}','RuntimeOperationsRecord']]){const name=dto+'Response';s[name]={allOf:[ref('CommandResult'),{type:'object',properties:{data:ref(dto)}}]};d.paths[p].get.responses['200'].content['application/json'].schema=ref(name);}
s.V1Capabilities.properties.phase.enum=['v1-foundation','v1-expanded','v1-runtime'];
s.V1Capabilities.properties.identity.properties.familyAuthentication={type:'boolean'};
s.V1Capabilities.properties.execution.additionalProperties=true;s.V1Capabilities.properties.runtimeImplemented={type:'boolean'};
const budget=obj({dailyLimitUSD:{type:'number',minimum:0,maximum:100000},perRunReserveUSD:{type:'number',minimum:0.001,maximum:1000},maxConcurrent:{type:'integer',minimum:1,maximum:32},paused:{type:'boolean'},blockUnpriced:{type:'boolean'},timezone:str(100)});
s.RuntimeBudgetPolicy=budget;s.RuntimeBudgetInput=obj({expectedVersion:integer,patch:budget},['expectedVersion','patch']);
function add(method,p,description,body,security='SessionCookie'){
 d.paths[p]??={};const o={operationId:method+'Runtime'+p.replace(/[^a-zA-Z0-9]/g,''),summary:description,tags:['Runtime'],security:[{[security]:[]}],'x-implementation-status':'implemented',responses:{200:{description:'真实持久化数据或工作器回执；排队不表示执行完成',content:{'application/json':{schema:{type:'object',additionalProperties:true}}}},400:{description:'请求无效'},401:{description:'身份未认证'},403:{description:'跨成员访问被拒绝'},409:{description:'状态或版本冲突'},503:{description:'引擎依赖未配置'}}};
 if(body)o.requestBody={required:true,content:{'application/json':{schema:body}}};if(p.includes('{'))o.parameters=[...p.matchAll(/\{(\w+)\}/g)].map(m=>({name:m[1],in:'path',required:true,schema:str()}));d.paths[p][method]=o;
}
add('get','/api/runtime/governance','当日实际Token、估算费用和预算预留');add('put','/api/runtime/governance','版本保护的USD调用策略',ref('RuntimeBudgetInput'));add('get','/api/runtime/governance/usage','SDK及签名执行器实际用量账本');
for(const base of ['/api/runtime/memory','/api/runtime/family/memory']){const security=base.includes('/family/')?'MemberCookie':'SessionCookie';add('get',base,'本人记忆与实际保留策略',null,security);for(const command of ['candidate','confirm','edit','reject','forget','policy','export'])add('post',base+'/commands/'+command,'只修改已认证成员自己的记忆',ref('CommandEnvelope'),security);add('post',base+'/extract','本人明确同意的Pi候选分析',obj({conversationId:str(),consent:{const:true},cloudConsent:{type:'boolean',default:false}},['conversationId','consent']),security);add('post',base+'/extract/stop','中止本人活动记忆分析',obj({}),security);add('post',base+'/cleanup','清理已到期文字及中央转录',obj({confirmed:{const:true}},['confirmed']),security);add('get',base+'/export','导出本人的记忆JSON',null,security);add('delete',base+'/conversations/{id}','删除本人聊天及原生Pi会话文件',null,security);delete d.paths[base+'/commands/revise'];}
d.info.version='1.3.0-conversation';d.info.description='真实业务与运行接口：Pi SDK、中央语音、冻结选项及明确确认、持久通知、天气、家庭身份、知识解析和连接器、受控开发与节点协议、审批发布与隔离恢复、记忆保留、实际用量预算。依赖和设备通过配置接入，运行状态由真实回执决定。';
d.servers=[{url:'http://127.0.0.1:3140',description:'本机开发运行地址；48GB生产由显式配置的HTTPS入口访问','x-implementation-status':'implemented'}];
require('./cloud-monitor-contract.cjs')(d);
require('./telemetry-contract.cjs')(d);
require('./reply-language-contract.cjs')(d);
require('./software-factory-contract.cjs')(d);
require('./usage-ledger-contract.cjs')(d);
require('./project-autonomy-contract.cjs')(d);
require('./project-decision-contract.cjs')(d);
require('./project-acceptance-contract.cjs')(d);
fs.writeFileSync(path,JSON.stringify(d,null,2)+'\n');console.log('Runtime contract merged');

