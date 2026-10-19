/** Local project defect facts; declarations never grant execution or product acceptance. */
module.exports=function applyProjectAcceptanceContract(document){
 document.paths??={};document.components??={};const schemas=document.components.schemas??={};
 const ref=name=>({$ref:'#/components/schemas/'+name});
 const text=(max=4000)=>({type:'string',minLength:1,maxLength:max}),id=text(200),hash={type:'string',pattern:'^[a-f0-9]{64}$'},date={type:'string',format:'date-time'},integer={type:'integer',minimum:0};
 const nullable=value=>({anyOf:[value,{type:'null'}]}),array=(items,maxItems=100,minItems=0)=>({type:'array',items,maxItems,minItems});
 const object=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
 schemas.ProjectDefectEvidence=object({path:text(1000),sha256:hash});
 schemas.ProjectDefectCandidate=object({sourceCommit:{type:'string',pattern:'^(?:[a-f0-9]{40}|[a-f0-9]{64})$'},buildHash:hash,releaseId:id},[]);
 schemas.ProjectDefectCandidate.anyOf=[{required:['sourceCommit']},{required:['buildHash']},{required:['releaseId']}];
 const fields={title:text(300),severity:{enum:['P0','P1','P2','P3']},reproduction:text(8000),expected:text(8000),actual:text(8000),criterion:text(4000),environment:text(4000),sourceVersion:text(500),taskId:nullable(id),runId:nullable(id),releaseId:nullable(id),evidenceRefs:array(ref('ProjectDefectEvidence'),50)};
 schemas.ProjectDefectCreateInput=object({...fields,commandId:{type:'string',format:'uuid'},expectedVersion:{const:0}},['title','severity','reproduction','expected','actual','criterion','environment','sourceVersion','commandId','expectedVersion']);
 const command={commandId:{type:'string',format:'uuid'},expectedVersion:{type:'integer',minimum:1},reason:text(2000)};
 const commands=[
  object({...command,action:{const:'update'},patch:object(fields,[])}),
  object({...command,action:{const:'start_fix'},fixTaskId:nullable(id)},['commandId','expectedVersion','reason','action']),
  object({commandId:command.commandId,expectedVersion:command.expectedVersion,action:{const:'submit_fix'},candidate:ref('ProjectDefectCandidate'),summary:text(4000),evidenceRefs:array(ref('ProjectDefectEvidence'),50,1)}),
  object({...command,action:{const:'retest'},fixId:id,candidateFingerprint:hash,outcome:{enum:['pass','fail','blocked']},evidenceRefs:array(ref('ProjectDefectEvidence'),50,1),validationScope:text(2000)}),
  object({...command,action:{const:'close'},fixId:id,candidateFingerprint:hash,retestId:id}),
  object({...command,action:{const:'reopen'}}),
 ];
 schemas.ProjectDefectCommandInput={oneOf:commands};
 schemas.ProjectDefectTaskBinding=object({id,projectId:id,scope:ref('Scope'),machineId:id,workspace:text(2000),revision:{type:'integer',minimum:1}},['id','projectId','scope','revision']);
 schemas.ProjectDefectRunBinding=object({id,domain:{const:'tasks'},projectId:id,taskId:id,machineId:id,workspace:text(2000),status:text(100),resultHash:nullable(hash)});
 schemas.ProjectDefectReleaseBinding=object({id,projectId:id,taskId:nullable(id),version:text(300),revision:{type:'integer',minimum:1}});
 schemas.ProjectDefectFix=object({id,generation:{type:'integer',minimum:1},candidate:ref('ProjectDefectCandidate'),candidateFingerprint:hash,summary:text(4000),evidenceRefs:array(ref('ProjectDefectEvidence'),50,1),startedAt:date,submittedAt:date,fixTaskId:nullable(id)});
 schemas.ProjectDefectRetest=object({id,fixId:id,candidateFingerprint:hash,outcome:{enum:['pass','fail','blocked']},evidenceRefs:array(ref('ProjectDefectEvidence'),50,1),validationScope:text(2000),reason:text(2000),at:date});
 schemas.ProjectDefectSnapshot=object({...fields,id,projectId:id,ownerId:id,scope:ref('Scope'),revision:{type:'integer',minimum:1},status:{enum:['open','in_progress','awaiting_retest','closed']},fixGeneration:integer,fixTaskId:nullable(id),currentFix:nullable(ref('ProjectDefectFix')),latestRetest:nullable(ref('ProjectDefectRetest')),createdAt:date,updatedAt:date,previousHash:hash,hash,revisionReason:text(2000),independentAcceptance:{const:false},taskSnapshot:ref('ProjectDefectTaskBinding'),runSnapshot:ref('ProjectDefectRunBinding'),releaseSnapshot:ref('ProjectDefectReleaseBinding')},[...Object.keys(fields),'id','projectId','ownerId','scope','revision','status','fixGeneration','fixTaskId','currentFix','latestRetest','createdAt','updatedAt','previousHash','hash','revisionReason','independentAcceptance']);
 const page=(items,extra={})=>object({items:array(items,100),total:integer,offset:integer,limit:{type:'integer',minimum:1,maximum:100},nextOffset:nullable(integer),...extra});
 schemas.ProjectDefectCollection=page(ref('ProjectDefectSnapshot'));
 schemas.ProjectDefectDetail=object({defect:ref('ProjectDefectSnapshot'),history:page(ref('ProjectDefectSnapshot'))});
 schemas.ProjectReleaseCollection=page(ref('Release'),{readOnly:{const:true}});
 schemas.ProjectAcceptanceOverview=object({project:object({id,name:text(300),scope:ref('Scope'),status:text(100)}),classification:object({manualAcceptance:object({state:{const:'human_attestation_only'},independentAcceptance:{const:false}}),tasks:object({items:array(object({id,title:text(300),status:text(100),revision:{type:'integer',minimum:1},acceptanceOutcome:nullable({enum:['pass','fail']}),verification:{enum:['human_attestation','declared_external','unknown']}}),100000),total:integer}),localDefects:object({total:integer,open:integer,inProgress:integer,awaitingRetest:integer,closed:integer}),unknownMapping:object({state:{const:'unknown'},note:text(2000)})}),readOnly:{const:true},doesNotExecute:{const:true}});
 const add=(method,path,name,input,result)=>{document.paths[path]??={};const entry={operationId:name,tags:['Project acceptance'],summary:name,security:[{SessionCookie:[]}],'x-implementation-status':'implemented',parameters:[...path.matchAll(/\{([^}]+)\}/g)].map(m=>({name:m[1],in:'path',required:true,schema:id})),responses:{200:{description:'本地验收事实；引用不代表原件已核验，缺陷关闭不完成任务或部署',content:{'application/json':{schema:object({data:ref(result)})}}},400:{description:'字段、隐私或状态无效'},401:{description:'会话失效'},403:{description:'本人管理身份要求'},404:{description:'项目或缺陷不可访问'},409:{description:'版本、候选或复验代次冲突'}}};if(input)entry.requestBody={required:true,content:{'application/json':{schema:ref(input)}}};document.paths[path][method]=entry;return entry;};
 const base='/api/v1/projects/{id}';
 add('get',base+'/acceptance','ProjectAcceptanceOverview',null,'ProjectAcceptanceOverview');
 add('get',base+'/defects','ProjectDefectList',null,'ProjectDefectCollection');
 add('post',base+'/defects','ProjectDefectCreate','ProjectDefectCreateInput','ProjectDefectSnapshot');
 add('get',base+'/defects/{defectId}','ProjectDefectRead',null,'ProjectDefectDetail');
 add('post',base+'/defects/{defectId}/commands','ProjectDefectCommand','ProjectDefectCommandInput','ProjectDefectSnapshot');
 add('get',base+'/releases','ProjectReleaseList',null,'ProjectReleaseCollection');
 for(const path of [base+'/defects',base+'/defects/{defectId}',base+'/releases'])document.paths[path].get.parameters.push({name:'offset',in:'query',schema:{...integer,maximum:1000000,default:0}},{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100,default:25}});
 return {fields,object,ref,text,nullable,array,id,hash,date,integer};
};
