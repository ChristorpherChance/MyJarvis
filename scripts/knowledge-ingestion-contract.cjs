/** Narrow knowledge ingestion merge; does not regenerate unrelated runtime contracts. */
module.exports=function knowledgeIngestionContract(doc){
 const s=doc.components.schemas,ref=n=>({$ref:'#/components/schemas/'+n}),str={type:'string'},id={type:'string',format:'uuid'},revision={type:'integer',minimum:1},hash={type:'string',pattern:'^[a-f0-9]{64}$'},scope={type:'string',enum:['personal','private','family','company']};
 const obj=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
 s.KnowledgeDocumentCreateInput=obj({commandId:id,expectedVersion:{const:0},scope,sourceId:id,assetId:id,title:{type:'string',minLength:1,maxLength:300}},['commandId','expectedVersion','sourceId','assetId','title']);
 s.KnowledgeDocumentReviewInput=obj({commandId:id,expectedVersion:revision,confirmed:{const:true},evidence:{type:'string',minLength:1,maxLength:4000}});
 s.KnowledgeDocumentPublishInput=obj({commandId:id,expectedVersion:revision,confirmed:{const:true}});
 s.KnowledgeDocumentReviseInput=obj({commandId:id,expectedVersion:revision,title:{type:'string',minLength:1,maxLength:300}},['commandId','expectedVersion']);
 s.KnowledgeDirectoryConfirmInput=obj({commandId:id,expectedVersion:revision,expectedConfigurationRevision:{type:'integer',minimum:0},expectedSnapshotFingerprint:hash});
 s.KnowledgeDocumentSegment=obj({id, index:{type:'integer',minimum:0},text:str,sha256:hash,location:{type:['string','null']}});
 s.KnowledgeDocumentRecord={type:'object',additionalProperties:true,properties:{id,revision,scope,ownerId:str,kind:{const:'document'},status:{enum:['draft','reviewed','published','revised']},title:str,sourceId:id,assetId:id,version:revision,materialSha256:hash,textSha256:hash,segments:{type:'array',maxItems:2000,items:ref('KnowledgeDocumentSegment')}},required:['id','revision','scope','ownerId','kind','status','title','sourceId','assetId','version','materialSha256','textSha256','segments']};
 s.KnowledgeDocumentReceipt={type:'object',properties:{requestId:str,version:{type:'integer',minimum:0},data:ref('KnowledgeDocumentRecord'),events:{type:'array',items:{type:'object'}}},required:['data']};
 const operation=(operationId,result,input)=>({operationId,tags:['知识入库'],security:[{SessionCookie:[]}],'x-implementation-status':'implemented',...(input?{requestBody:{required:true,content:{'application/json':{schema:ref(input)}}}}:{}),responses:{200:{description:'当前身份范围内的真实记录；不自动审核或调用模型',...(result?{content:{'application/json':{schema:ref(result)}}}:{})},400:{description:'严格输入校验失败'},401:{description:'管理员未登录'},403:{description:'身份或来源授权拒绝'},409:{description:'版本或原件绑定变化'}}});
 doc.paths['/api/v1/knowledge/documents']={get:operation('knowledgeDocumentList'),post:operation('knowledgeDocumentCreate','KnowledgeDocumentReceipt','KnowledgeDocumentCreateInput')};
 doc.paths['/api/v1/knowledge/documents/{id}']={get:operation('knowledgeDocumentRead','KnowledgeDocumentReceipt')};
 for(const [action,input] of [['review','KnowledgeDocumentReviewInput'],['publish','KnowledgeDocumentPublishInput'],['revise','KnowledgeDocumentReviseInput']])doc.paths['/api/v1/knowledge/documents/{id}/'+action]={post:operation('knowledgeDocument_'+action,'KnowledgeDocumentReceipt',input)};
 doc.paths['/api/v1/knowledge/documents/{id}/original']={get:operation('knowledgeDocumentOriginal')};
 doc.paths['/api/v1/knowledge/sources/{id}/preview']={get:operation('knowledgeDirectoryPreview')};
 doc.paths['/api/v1/knowledge/sources/{id}/confirm-sync']={post:operation('knowledgeDirectoryConfirm',undefined,'KnowledgeDirectoryConfirmInput')};
 const context=s.KnowledgeReferenceContext;
 if(context){context.properties.kind.enum=[...new Set([...context.properties.kind.enum,'reviewed-document'])];Object.assign(context.properties,{documentId:id,segment:{type:'integer',minimum:0},originalUrl:str});}
 for(const name of ['FamilyKnowledgeMatch','FamilyKnowledgeReferenceResult']){
  const p=s[name]?.properties;if(!p)continue;
  if(p.kind?.enum)p.kind.enum=[...new Set([...p.kind.enum,name==='FamilyKnowledgeMatch'?'knowledge-document':'reviewed-document'])];
  if(p.quoteKind?.enum)p.quoteKind.enum=[...new Set([...p.quoteKind.enum,'reviewed-document'])];
  p.segment={type:'integer',minimum:0};
 }
 return doc;
};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),file=path.resolve(__dirname,'../docs/openapi-v1-planned.json');fs.writeFileSync(file,JSON.stringify(module.exports(JSON.parse(fs.readFileSync(file,'utf8'))),null,2)+'\n');}
