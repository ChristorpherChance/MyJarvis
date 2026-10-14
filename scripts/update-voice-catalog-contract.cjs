const fs=require('fs'),file='docs/openapi-v1-planned.json',d=JSON.parse(fs.readFileSync(file,'utf8'));
const selection={type:'string',enum:['profile-default','local-fast','jarvis-style',...Array.from({length:103},(_,i)=>`kokoro:${i}`)]};
d.paths['/api/runtime/voice/sessions/{id}/speech'].post.requestBody.content['application/json'].schema.properties.playback.properties.voiceId=selection;
const operation=(operationId,summary,body)=>({operationId,summary,tags:['中央语音'],security:[{MemberCookie:[]},{SessionCookie:[]}],'x-implementation-status':'implemented',...(body?{requestBody:{required:true,content:{'application/json':{schema:body}}}}:{}),responses:{200:{description:'当前已认证成员的声音库或选择',content:{'application/json':{schema:{type:'object',additionalProperties:true}}}},401:{description:'未验证身份'},409:{description:'声音引擎未配置'}}});
d.paths['/api/runtime/voice/catalog']={get:operation('getMemberVoiceCatalog','真实人声库及当前成员选择，不返回引擎凭证')};
d.paths['/api/runtime/voice/preference']={put:operation('setMemberVoicePreference','仅保存当前认证成员的声音选择',{type:'object',additionalProperties:false,required:['voiceId'],properties:{voiceId:selection}})};
fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');console.log('Voice catalog and per-member selection contract updated');
