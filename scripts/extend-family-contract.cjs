/** Root contract updater calls this function before saving the single shared OpenAPI document. */
module.exports = function extendFamilyContract(doc) {
  const schemas = doc.components.schemas, str = max => ({type:'string',maxLength:max}), nullable = schema => ({anyOf:[schema,{type:'null'}]}), stamp = {type:'string',format:'date-time'};
  schemas.ProfileId = {type:'string',minLength:1,maxLength:200,description:'me绑定当前管理员；其他值必须为S0已登记成员ID。档案管理不代表本人认证；public仅共享展示。'};
  Object.assign(schemas.FamilyRecord.properties, {text:nullable(str(4000)),status:{type:'string',enum:['active','removed','forgotten']},context:str(1000),updatedAt:stamp,removedAt:stamp,forgottenAt:stamp});
  Object.assign(schemas.Memory.properties, {kind:{type:'string',enum:['memory','policy','export-receipt']},status:{type:'string',enum:['candidate','active','rejected','forgotten','policy','exported']},source:nullable(str(4000)),policy:{$ref:'#/components/schemas/MemoryPolicyPayload'},effective:{$ref:'#/components/schemas/MemoryPolicyPayload'},cleanupStatus:{type:'string',enum:['not-configured']},note:str(4000),history:{type:'array',maxItems:10000,items:{type:'object',additionalProperties:false,properties:{at:stamp,event:str(100),actorId:str(200)},required:['at','event','actorId']}},previousTexts:{type:'array',maxItems:0,items:str(1200)},forgottenAt:stamp,format:{type:'string',const:'json'},includeCandidates:{type:'boolean'},count:{type:'integer',minimum:0}});
  schemas.MemoryEditPayload.properties.category = {...str(60),minLength:1};
  Object.assign(schemas.FamilyLearningPayload.properties,{profile:{$ref:'#/components/schemas/ProfileId'},rounds:{type:'array',maxItems:100,items:{type:'object',additionalProperties:false,properties:{question:{...str(4000),minLength:1},answer:{...str(4000),minLength:1}},required:['question','answer']}}});
  schemas.FamilyLearningResult={allOf:[{$ref:'#/components/schemas/CommandResult'},{type:'object',properties:{data:{$ref:'#/components/schemas/KnowledgeLearningRecordV2'}}}]};
  Object.assign(schemas.Persona.properties,{kind:{type:'string',enum:['persona','profile']},name:{...str(30),minLength:1},role:{type:'string',enum:['adult','child','elder']},status:{type:'string',enum:['registered']},authentication:str(100),voiceStatus:{type:'string',enum:['browser-preview-only','runtime-managed']},wakeStatus:{type:'string',enum:['not-configured','runtime-managed']},enforcementStatus:{type:'string',enum:['preferences-saved','server-enforced']},note:str(4000),createdAt:stamp,updatedAt:stamp,dailyVoiceMinutes:{type:'number',minimum:1,maximum:300},autoSpeak:{type:'boolean'}});
  // Four single-setting commands may create a partial preference record; none imply installed TTS or wake hardware.
  schemas.Persona.required=['id','revision','scope','ownerId','profileId'];
  const save = {type:'object',additionalProperties:false,properties:{profileId:{$ref:'#/components/schemas/ProfileId'},voiceId:{type:'string',enum:['clear','warm','calm']},language:{type:'string',enum:['中文','英语','日语','法语','德语','西班牙语']},pace:{type:'string',enum:['slow','normal','fast']},wakeWord:{...str(20),minLength:1},address:{...str(30),minLength:1},replyStyle:{type:'string',enum:['清晰自然','简洁温和','轻松幽默','循序引导']},cloudPrivacy:{type:'string',enum:['ask','local','allowed']},dailyVoiceMinutes:{type:'number',minimum:1,maximum:300},autoSpeak:{type:'boolean'},start:{type:'string',pattern:'^([01][0-9]|2[0-3]):[0-5][0-9]$'},end:{type:'string',pattern:'^([01][0-9]|2[0-3]):[0-5][0-9]$'},timezone:{...str(100),minLength:1}},required:['profileId','voiceId','language','pace','wakeWord','address','replyStyle','cloudPrivacy','dailyVoiceMinutes','autoSpeak','start','end','timezone']};
  schemas.PersonasSavePayload=save;
  const replyLanguage={type:'string',enum:['auto','zh','en','fr','de'],description:'auto跟随本轮实际识别语种或文字；固定语种优先。字段省略保持既有设定，旧language仍保留。'};
  schemas.Persona.properties.replyLanguage=replyLanguage;
  for(const name of ['PersonasSavePayload','PersonasVoicePayload','PersonasPreferencePayload'])if(schemas[name]?.properties)schemas[name].properties.replyLanguage=replyLanguage;
  schemas.PersonasSaveCommand={allOf:[{$ref:'#/components/schemas/CommandEnvelope'},{type:'object',properties:{payload:{$ref:'#/components/schemas/PersonasSavePayload'}}}]};
  schemas.PersonasSaveResult=structuredClone(schemas.PersonasPreferenceResult);
  const post=structuredClone(doc.paths['/api/v1/personas/commands/preference'].post);post.operationId='personasSave';post.summary='原子保存专属管家设置';post['x-command']='personas.save';post['x-required-payload-fields']=save.required;post.requestBody.content['application/json'].schema={$ref:'#/components/schemas/PersonasSaveCommand'};
  for(const response of Object.values(post.responses))if(response.content?.['application/json']?.schema)response.content['application/json'].schema={$ref:'#/components/schemas/PersonasSaveResult'};
  doc.paths['/api/v1/personas/commands/save']={post};
  schemas.PersonasRegisterPayload={type:'object',additionalProperties:false,properties:{name:{...str(30),minLength:1},role:{type:'string',enum:['adult','child','elder']}},required:['name','role']};
  schemas.PersonasRegisterCommand={allOf:[{$ref:'#/components/schemas/CommandEnvelope'},{type:'object',properties:{payload:{$ref:'#/components/schemas/PersonasRegisterPayload'}}}]};
  schemas.PersonasRegisterResult=structuredClone(schemas.PersonasSaveResult);
  const registration=structuredClone(post);registration.operationId='personasRegister';registration.summary='登记家庭成员管理档案';registration['x-command']='personas.register';registration['x-required-payload-fields']=['name','role'];registration.requestBody.content['application/json'].schema={$ref:'#/components/schemas/PersonasRegisterCommand'};
  for(const response of Object.values(registration.responses))if(response.content?.['application/json']?.schema)response.content['application/json'].schema={$ref:'#/components/schemas/PersonasRegisterResult'};
  doc.paths['/api/v1/personas/commands/register']={post:registration};
  // Export is an authenticated metadata receipt, not a durable plaintext export or public download URL.
  schemas.MemoryExportResult=structuredClone(schemas.MemoryCandidateResult);
  return require('./reply-language-contract.cjs')(doc);
};
