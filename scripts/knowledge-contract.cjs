// Called by the integration build. This module does not modify the shared contract on import.
const ref=name=>({$ref:'#/components/schemas/'+name});
const text=(max=20000,min=1)=>({type:'string',minLength:min,maxLength:max});
const int=(min,max)=>({type:'integer',minimum:min,maximum:max});
const bool={type:'boolean'},list=(min=0,max=100)=>({type:'array',minItems:min,maxItems:max,items:text(4000)});
const object=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const id=text(200),book={bookId:id},story={storyId:id},course={courseId:id,profile:text(200)};
const definitions={
 sources:{
  save:object({sourceId:id,name:text(300),type:text(100),mode:{enum:['local','live','hybrid'],type:'string'},endpoint:text(2000),topics:text(2000),rights:text(4000),authorized:bool},['name','type','mode','endpoint','topics','rights','authorized']),
  toggle:object({sourceId:id,active:bool}),authorize:object({sourceId:id,authorized:bool,reason:text(4000)}),
  query:object({query:text(1000),mode:{type:'string',enum:['all','local','live']}},['query']),sync:object({sourceId:id})
 },
 books:{
  'create-upload':object({sourceId:id,filename:text(300),mime:{type:'string',enum:['application/pdf','image/png','image/jpeg','image/webp']},size:int(1,33554432)}),
  create:object({uploadId:id,materialId:id,title:text(300),edition:text(500),author:text(4000,0),pages:int(1,10000),rights:text(4000),layout:text(4000,0)},['uploadId','title','edition','pages','rights']),
  'material-source':object({materialId:id}),
  page:object({...book,page:int(1,10000),text:text(60000),normalized:text(20000,0),evidence:text(4000),pagesVerified:bool},['bookId','page','text','evidence','pagesVerified']),
  doubt:object({...book,page:int(1,10000),type:text(100),critical:bool,ocr:text(20000),alternate:text(20000,0),focus:text(4000,0),reason:text(4000)},['bookId','page','type','ocr','reason']),
  verdict:object({...book,doubtId:id,decision:{type:'string',enum:['confirm','rescan']},text:text(20000,0),note:text(4000)},['bookId','doubtId','decision','note']),
  'review-page':object({...book,page:int(1,10000),confirmed:bool,evidence:text(4000)}),
  'review-all':object(book),publish:object({...book,confirmed:bool}),
  revision:object({...book,page:int(1,10000),text:text(60000),reason:text(4000),checked:bool}),
  recheck:object(book),advance:object(book),rescan:object({...book,doubtId:id,uploadId:id,note:text(4000)})
 },
 stories:{
  create:object({bookId:id,title:text(300),page:int(1,10000),chapter:text(4000,0),version:text(200),topic:text(200),duration:int(1,120),level:text(100),summary:text(4000),quote:text(20000),sections:list(1,40),connections:list(0,30),quiz:object({question:text(2000),choices:list(2,8),answer:int(0,7),explanation:text(4000)})},['bookId','title','page','version','topic','duration','level','summary','quote','sections','quiz']),
  review:object({...story,confirmed:bool,evidence:text(4000),quote:text(20000),sections:list(1,40),page:int(1,10000)},['storyId','confirmed','evidence']),
  update:object({...story,confirmed:bool,evidence:text(4000),quote:text(20000),sections:list(1,40),page:int(1,10000)},['storyId','confirmed','evidence']),
  favorite:object({...story,profile:text(200)},['storyId']),listen:object({...story,profile:text(200)},['storyId']),quiz:object({...story,profile:text(200),answer:int(0,7)},['storyId','answer'])
 },
 learning:{
  practice:object({profile:text(200),type:{type:'string',enum:['language','story','science','history','other']},title:text(300),minutes:int(0,480),rounds:{type:'array',maxItems:100,items:object({question:text(4000),answer:text(4000)})}},['type','title','minutes','rounds']),
  create:object({profile:text(200),title:text(300),goal:text(4000),structure:{type:'string',enum:['theme','book','people']},pace:{type:'string',enum:['short','normal','long']},stories:list(1,100)},['title','goal','structure','pace','stories']),
  refresh:object(course,['courseId']),remove:object(course,['courseId']),review:object({...course,note:text(4000)},['courseId','note']),
  'gap-create':object({title:text(300),type:text(4000,0),reason:text(4000),need:text(4000),impact:text(4000)},['title','reason','need','impact']),
  'gap-accept':object({gapId:id,next:{type:'string',enum:['search','collect','story']},note:text(4000,0)},['gapId','next']),
  'gap-state':object({gapId:id,state:{type:'string',enum:['pending','deferred','ignored']}})
 }
};
function applyKnowledgeContract(contract){
 const schemas=contract.components.schemas;
 for(const [domain,commands]of Object.entries(definitions)){
  const dto='Knowledge'+domain[0].toUpperCase()+domain.slice(1)+'RecordV2';
  schemas[dto]={type:'object',additionalProperties:true,properties:{id,revision:int(1,2147483647),scope:{type:'string',enum:['personal','private','family','company']},ownerId:id,kind:text(100)},required:['id','revision','scope','ownerId','kind']};
  const envelope=name=>object({requestId:text(200),version:int(0,2147483647),data:ref(name),events:{type:'array',items:ref('DomainEvent')}},['requestId','version','data','events']);
  schemas[dto+'Receipt']=envelope(dto);
  schemas[dto+'Page']=object({items:{type:'array',items:ref(dto)},nextCursor:{type:['string','null']},snapshotVersion:int(0,2147483647)});
  schemas[dto+'Collection']=envelope(dto+'Page');
  const prefix='/api/v1/'+(['sources','books','stories'].includes(domain)?'knowledge/':'')+domain;
  contract.paths[prefix]={get:{tags:['knowledge'],operationId:'list'+dto,'x-implementation':'implemented',parameters:[{in:'query',name:'limit',schema:int(1,100)},{in:'query',name:'cursor',schema:text(300)},{in:'query',name:'scope',schema:{type:'string',enum:['personal','private','family','company']}}],responses:{200:{description:'Persisted records',content:{'application/json':{schema:ref(dto+'Collection')}}}}}};
  contract.paths[prefix+'/{id}']={get:{tags:['knowledge'],operationId:'read'+dto,'x-implementation':'implemented',parameters:[{in:'path',name:'id',required:true,schema:id}],responses:{200:{description:'Persisted record',content:{'application/json':{schema:ref(dto+'Receipt')}}}}}};
  for(const [command,payload]of Object.entries(commands)){
   const name=dto+command.replace(/(^|-)(\w)/g,(_,__,c)=>c.toUpperCase())+'Command';schemas[name]=object({commandId:text(200),expectedVersion:int(0,2147483647),scope:{type:'string',enum:['personal','private','family','company']},payload},['commandId','expectedVersion','scope','payload']);
   contract.paths[prefix+'/commands/'+command]={post:{tags:['knowledge'],operationId:'knowledgeV2_'+domain+'_'+command.replaceAll('-','_'),'x-implementation':['sync','advance','review-all'].includes(command)?'unavailable':'implemented',requestBody:{required:true,content:{'application/json':{schema:ref(name)}}},responses:{200:{description:'Atomic command receipt',content:{'application/json':{schema:ref(dto+'Receipt')}}},400:{description:'Invalid input'},409:{description:'Version conflict'},422:{description:'Review required'},503:{description:'Executor not configured'}}}};
  }
 }
 const upload='/api/v1/book-uploads/{id}/file';contract.paths[upload]={put:{tags:['knowledge'],operationId:'uploadScanOriginal','x-implementation':'implemented',parameters:[{in:'path',name:'id',required:true,schema:id}],requestBody:{required:true,content:{'application/octet-stream':{schema:{type:'string',format:'binary'}}}},responses:{200:{description:'Verified upload receipt'},400:{description:'File type/size mismatch'},401:{description:'Login required'},413:{description:'Maximum 32 MB'}}},get:{tags:['knowledge'],operationId:'readScanOriginal','x-implementation':'implemented',parameters:[{in:'path',name:'id',required:true,schema:id}],responses:{200:{description:'Authenticated immutable original'},401:{description:'Login required'},409:{description:'Hash mismatch'}}}};
 const prefixes=['/api/v1/knowledge/sources','/api/v1/knowledge/books','/api/v1/knowledge/stories','/api/v1/learning'];
 for(const [path,operations]of Object.entries(contract.paths))if(path===upload||prefixes.some(prefix=>path===prefix||path===prefix+'/{id}'||Object.keys(definitions[prefix.split('/').at(-1)]).some(command=>path===prefix+'/commands/'+command)))for(const method of ['get','post','put'])if(operations[method])operations[method]['x-implementation-status']='implemented';
 return contract;
}
module.exports={applyKnowledgeContract,knowledgeDefinitions:definitions};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),file=path.resolve(__dirname,'../docs/openapi-v1-planned.json');const contract=JSON.parse(fs.readFileSync(file,'utf8'));applyKnowledgeContract(contract);fs.writeFileSync(file,JSON.stringify(contract,null,2)+'\n');}
