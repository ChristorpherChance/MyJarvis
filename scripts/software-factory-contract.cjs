/** Narrow MSF business read adapter. Source development continues through the existing signed execution API. */
module.exports=function softwareFactoryContract(d){
 const s=d.components.schemas,ref=name=>({$ref:'#/components/schemas/'+name}),str=(max=300)=>({type:'string',maxLength:max}),nullable=schema=>({anyOf:[schema,{type:'null'}]}),nt=(max=300)=>nullable(str(max)),num={type:'number'},nn=nullable(num),time=nullable({type:'string',format:'date-time'}),obj=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required}),arr=(items,max=100)=>({type:'array',items,maxItems:max});
 s.SoftwareFactoryBoundaries=obj({sourceDevelopment:{const:'jarvis-signed-cli-and-independent-validation'},internalDevelopment:{const:'mock-development-pipeline'},internalStatus:{const:'factory-reported-not-jarvis-verified'},delivery:{const:'factory-release-adapter-not-implemented'},usage:{const:'aggregate-only-not-billing-import'},automaticAcceptance:{const:false}});
 const guid={type:'string',pattern:'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'};
 s.SoftwareFactoryProject=obj({id:guid,name:nt(),description:nt(2000),status:nt(100),isDemo:{type:'boolean'},createdAt:time});
 s.SoftwareFactoryState=obj({configured:{type:'boolean'},connected:{type:'boolean'},authenticated:{type:['boolean','null']},observedAt:time,error:nt(),projectCount:nullable({type:'integer',minimum:0}),machineId:str(200),sourceProjectId:nt(200),baseURL:nt(2000),boundaries:ref('SoftwareFactoryBoundaries'),capabilities:obj({readInternalProjects:{const:true},readBusinessProgress:{const:true},dispatchSourceTasks:{const:false},automaticAcceptance:{const:false}})});
 s.SoftwareFactoryProjects=obj({items:arr(ref('SoftwareFactoryProject')),total:{type:'integer',minimum:0},truncated:{type:'boolean'},observedAt:{type:'string',format:'date-time'},authenticated:{type:'boolean'},source:{const:'software-factory-api'},verification:{const:'factory-reported'}});
 s.SoftwareFactoryBusinessTask=obj({id:nt(200),code:nt(100),title:nt(),kind:nt(100),status:nt(100),progress:nn,updatedAt:time});
 s.SoftwareFactoryAutopilot=obj({runId:nt(200),status:nt(100),phase:nt(100),blockerCode:nt(200)});
 s.SoftwareFactoryBuild=obj({buildId:nt(200),status:nt(100),fingerprint:nt(200),createdAt:time});
 s.SoftwareFactorySelftest=obj({id:nt(200),code:nt(100),status:nt(100),fingerprint:nt(200),createdAt:time});
 s.SoftwareFactoryBatch=obj({id:nt(200),code:nt(100),status:nt(100),createdAt:time});
 s.SoftwareFactoryDefect=obj({id:nt(200),code:nt(100),title:nt(),status:nt(100),severity:nt(100)});
 s.SoftwareFactoryDecision=obj({id:nt(200),type:nt(100),status:nt(100),createdAt:time});
 s.SoftwareFactoryAggregateUsage=obj({calls:nn,inputTokens:nn,outputTokens:nn,reportedCost:nn,costCurrency:{const:'not-declared-by-factory'},verification:{const:'aggregate-reported-not-ledger-import'}});
 s.SoftwareFactoryDetail=obj({project:ref('SoftwareFactoryProject'),observedAt:{type:'string',format:'date-time'},source:{const:'software-factory-api'},verification:{const:'factory-reported'},boundaries:ref('SoftwareFactoryBoundaries'),partialErrors:arr(obj({section:str(100),code:str(200)}),8),sectionCounts:obj(Object.fromEntries(['tasks','selftestReports','acceptanceBatches','defects','decisions'].map(k=>[k,{type:'integer',minimum:0}]))),tasks:arr(ref('SoftwareFactoryBusinessTask'),200),tasksTruncated:{type:'boolean'},autopilot:nullable(ref('SoftwareFactoryAutopilot')),build:nullable(ref('SoftwareFactoryBuild')),selftestReports:arr(ref('SoftwareFactorySelftest')),acceptanceBatches:arr(ref('SoftwareFactoryBatch')),defects:arr(ref('SoftwareFactoryDefect')),decisions:arr(ref('SoftwareFactoryDecision')),usage:nullable(ref('SoftwareFactoryAggregateUsage'))});
 const error=obj({error:obj({code:str(200),message:str(2000)})});
 for(const [path,schema,operationId] of [['/api/runtime/software-factory','SoftwareFactoryState','softwareFactoryState'],['/api/runtime/software-factory/projects','SoftwareFactoryProjects','softwareFactoryProjects'],['/api/runtime/software-factory/projects/{id}','SoftwareFactoryDetail','softwareFactoryProjectDetail']]){
  const operation={operationId,tags:['Software Factory'],summary:'软件工厂内部业务资料，只读；不替代源码开发监督、真实测试与人工验收',security:[{SessionCookie:[]}],'x-implementation-status':'implemented',responses:{200:{description:'服务端固定目标的实际 HTTP 资料；内部模拟流水线保留来源标记，用量仅作附属汇总',content:{'application/json':{schema:ref(schema)}}}}};
  for(const code of [400,401,403,404,429,502,503])operation.responses[code]={description:'参数、身份、上游连接或服务端固定配置不符合要求',content:{'application/json':{schema:error}}};
  if(path.endsWith('{id}'))operation.parameters=[{name:'id',in:'path',required:true,schema:guid}];
  d.paths[path]={get:operation};
 }
};
