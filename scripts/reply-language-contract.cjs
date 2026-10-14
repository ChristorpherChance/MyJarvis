/** Canonical persona reply policy; does not reinterpret the legacy input language. */
module.exports=function applyReplyLanguageContract(document){
 const s=document.components.schemas,ref=name=>({$ref:'#/components/schemas/'+name});
 const object=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
 const language={type:'string',enum:['auto','zh','en','fr','de'],description:'固定语种优先；auto跟随当前实际识别语种或本轮文字。旧language字段不自动变为固定回复语种。'};
 s.ReplyLanguage=language;
 s.Persona.properties.replyLanguage=ref('ReplyLanguage');
 for(const name of ['PersonasSavePayload','PersonasVoicePayload','PersonasPreferencePayload'])if(s[name]?.properties)s[name].properties.replyLanguage=ref('ReplyLanguage');
 s.PersonasReplyLanguagePayload=object({profileId:ref('ProfileId'),replyLanguage:ref('ReplyLanguage')});
 s.PersonasReplyLanguageCommand={allOf:[ref('CommandEnvelope'),{type:'object',properties:{payload:ref('PersonasReplyLanguagePayload')}}]};
 s.PersonasReplyLanguageResult=structuredClone(s.PersonasSaveResult??s.PersonasPreferenceResult);
 const command=structuredClone(document.paths['/api/v1/personas/commands/preference'].post);
 Object.assign(command,{operationId:'personasReplyLanguage',summary:'按档案修订版本仅修改回复语言','x-command':'personas.reply-language','x-required-payload-fields':['profileId','replyLanguage'],'x-implementation-status':'implemented'});
 command.requestBody.content['application/json'].schema=ref('PersonasReplyLanguageCommand');
 command.responses['200'].content['application/json'].schema=ref('PersonasReplyLanguageResult');
 document.paths['/api/v1/personas/commands/reply-language']={post:command};
 s.RuntimeReplyLanguage=object({replyLanguage:ref('ReplyLanguage'),revision:{type:'integer',minimum:0}});
 s.RuntimeReplyLanguageInput=object({expectedVersion:{type:'integer',minimum:0},replyLanguage:ref('ReplyLanguage')});
 const speechLanguage={type:'string',enum:['zh','en','fr','de']};
 // Family JSON and named SSE frames expose the same per-turn frozen server value.
 const familyMessage=document.paths['/api/runtime/family/conversations/{id}/messages']?.post;
 const json=familyMessage?.responses?.['200']?.content?.['application/json']?.schema;
 if(json?.properties)json.properties.responseLanguage=speechLanguage;
 s.RuntimeFamilyStreamStatus=object({state:{type:'string'},userMessageId:{type:'string'},attempt:{type:'integer',minimum:0},responseLanguage:speechLanguage},['state']);
 s.RuntimeFamilyStreamRoute=object({tier:{type:'string',enum:['fast','advanced']},reason:{type:'string',maxLength:100},provider:{type:'string',maxLength:100},model:{type:'string',maxLength:200},fallback:{type:'string',maxLength:100},responseLanguage:speechLanguage},['tier','reason','provider','model']);
 s.RuntimeFamilyStreamDone=object({message:ref('RuntimeFamilyMessage'),status:{enum:['complete','failed','cancelled']},profileId:{type:'string',minLength:1,maxLength:128},responseLanguage:speechLanguage,speech:object({mode:{enum:['incremental','final']},segments:{type:'integer',minimum:0},text:{type:'string'}},['mode','segments','text']),transition:object({segments:{type:'integer',minimum:0,maximum:1},text:{type:'string'}},['segments','text'])},['message','status','profileId']);
 if(familyMessage){familyMessage.responses['200'].content['text/event-stream']??={schema:{type:'string'}};familyMessage.responses['200'].content['text/event-stream']['x-event-schemas']={status:ref('RuntimeFamilyStreamStatus'),route:ref('RuntimeFamilyStreamRoute'),done:ref('RuntimeFamilyStreamDone')};}
 const speechSegments={type:'array',maxItems:100,items:object({text:{type:'string',minLength:1,maxLength:10000},language:{type:'string',enum:['zh','en','fr','de','ja','es']},kind:{type:'string',enum:['guide','target']}})};
 if(s.CompanionSession?.properties)Object.assign(s.CompanionSession.properties,{speechLanguage,speechSegments});
 for(const branch of s.CompanionVoiceResult?.anyOf??[])if(branch.properties?.handled?.const===true)Object.assign(branch.properties,{speechLanguage,speechSegments});
 const operation=(method)=>({operationId:method+'CurrentMemberReplyLanguage',summary:method==='get'?'读取当前认证成员的回复语言与档案修订版本':'只修改当前认证成员同一档案的回复语言',tags:['runtime-family'],security:[{MemberCookie:[]},{SessionCookie:[]}],'x-implementation-status':'implemented',...(method==='put'?{requestBody:{required:true,content:{'application/json':{schema:ref('RuntimeReplyLanguageInput')}}}}:{}),responses:{200:{description:'同一canonical persona档案；不修改声音、隐私、配额或旧输入language',content:{'application/json':{schema:ref('RuntimeReplyLanguage')}}},400:{description:'语言、修订版本或额外字段无效'},401:{description:'未认证或当前主体已失效'},403:{description:'跨成员修改被拒绝'},409:{description:'canonical persona修订版本冲突'}}});
 document.paths['/api/runtime/family/reply-language']={get:operation('get'),put:operation('put')};
 return document;
};
