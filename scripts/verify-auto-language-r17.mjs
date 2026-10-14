/** Synthetic speech through the deployed automatic input and fixed English output. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';

const expectedBuild='20261010-auto-language-r17-1';
if(!process.argv.includes('--execute')){
 console.log(JSON.stringify({prepared:true,expectedBuild,maximumModelRequests:3,configurationWrites:0}));
}else{
 const only=process.argv.find(value=>value.startsWith('--only='))?.slice(7);if(only&&!['zh','en','fr','de'].includes(only))throw Error('INVALID_LANGUAGE_SUBSET');
 const runId=randomUUID(),startedAt=new Date().toISOString(),samples=[
  {language:'zh',text:'你好，今天我想和你聊一聊。'},
  {language:'en',text:'Hello. I would like to learn English with you.'},
  {language:'fr',text:'Bonjour. Je voudrais pratiquer le français avec vous.'},
  {language:'de',text:'Guten Tag. Ich möchte mit Ihnen Deutsch lernen.'},
 ];
 const results=[],cleanupErrors=[];let failure=null,modelRequests=0,removed=0,build=null,activeStage='health';
 try{await withPlatform(async({api})=>{
  const health=await api('/api/health');build=health.build;assert.equal(build,expectedBuild);
  const preference=await api('/api/runtime/family/reply-language');assert.equal(preference.replyLanguage,'en');
  const session=await api('/api/runtime/voice/sessions',{roomId:'study'}),created=[];
  async function complete(job){
   const deadline=Date.now()+45000;
   while(['queued','running'].includes(job.status)){
    assert(Date.now()<deadline,'VOICE_JOB_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,200));job=await api('/api/runtime/voice/jobs/'+job.id);
   }
   assert.equal(job.status,'complete','VOICE_JOB_FAILED');return job;
  }
  try{for(const sample of samples.filter(sample=>!only||sample.language===only)){
   const evidence={inputLanguage:sample.language,status:'failed'};results.push(evidence);
   activeStage=sample.language+':sample-tts';const began=Date.now(),tts=await complete(await api('/api/runtime/voice/sessions/'+session.id+'/speech',{text:sample.text,cloudConsent:true,playback:{language:sample.language}}));
   assert.equal(tts.result.language,sample.language);const audio=await api(tts.result.audioUrl,undefined,'GET',{binary:true});assert.equal(audio.subarray(0,4).toString(),'RIFF');
   const asrBegan=Date.now();activeStage=sample.language+':automatic-asr';
   // Intentionally no X-Jarvis-Language header: the member's fixed English output must not force ASR.
   const asr=await complete(await api('/api/runtime/voice/sessions/'+session.id+'/audio',audio,'POST',{contentType:'audio/wav'}));
   assert.equal(asr.result.language,sample.language);assert(String(asr.result.text).trim());
   Object.assign(evidence,{detectedLanguage:asr.result.language,asrModel:asr.result.model,asrMs:Date.now()-asrBegan,automaticInput:true,audioBytes:audio.length});
   if(sample.language!=='en'){
    activeStage=sample.language+':model';
    const conversation=await api('/api/runtime/family/conversations',{title:'R17 synthetic '+runId+' '+sample.language});created.push(conversation.id);
    assert(modelRequests<3);modelRequests++;
    const answer=await api('/api/runtime/family/conversations/'+conversation.id+'/messages',{text:asr.result.text,voiceMode:true,voiceLanguage:asr.result.language,cloudConsent:true},'POST',{timeoutMs:150000});
    Object.assign(evidence,{responseLanguage:answer.responseLanguage,modelStatus:answer.status});
    Object.assign(evidence,{englishMarkers:(answer.message.content.match(/\b(hello|hi|you|we|english|with|can|let|practice|learn|happy|sure|how|today|absolutely|certainly|great|perfect|wonderful|of course|what|excellent|good)\b/gi)??[]).length,frenchMarkers:(answer.message.content.match(/\b(bonjour|salut|vous|je|nous|pour|avec|bien|merci|comment|français)\b/gi)??[]).length,germanMarkers:(answer.message.content.match(/\b(hallo|ich|wir|sie|du|mit|gerne|deutsch|wie|danke)\b/gi)??[]).length});
    assert.equal(answer.status,'complete','MODEL_TURN_INCOMPLETE');assert.equal(answer.responseLanguage,'en','FIXED_OUTPUT_METADATA_MISMATCH');
    assert(!/[\p{Script=Han}]/u.test(answer.message.content),'FIXED_ENGLISH_HAS_CHINESE');
    assert(/\b(hello|hi|you|english|french|german|with|can|let|practice|learn|happy|sure|how|today)\b/i.test(answer.message.content),'ENGLISH_REPLY_NOT_OBSERVED');
    activeStage=sample.language+':reply-tts';const spoken=await complete(await api('/api/runtime/voice/sessions/'+session.id+'/speech',{text:answer.message.content,cloudConsent:true}));
    Object.assign(evidence,{ttsLanguage:spoken.result.language,ttsModel:spoken.result.model});
    assert.equal(spoken.result.language,'en','FIXED_OUTPUT_TTS_MISMATCH');assert.equal(spoken.result.model,'piper-resident','FIXED_OUTPUT_MODEL_MISMATCH');
    Object.assign(evidence,{responseLanguage:answer.responseLanguage,ttsLanguage:spoken.result.language,ttsModel:spoken.result.model,fixedEnglishReply:true});
   }
   evidence.elapsedMs=Date.now()-began;evidence.status='passed';
  }}finally{for(const id of created){
   try{await api('/api/runtime/family/conversations/'+id+'/abort',{});await api('/api/runtime/family/memory/conversations/'+id,undefined,'DELETE');removed++;}
   catch{cleanupErrors.push('SYNTHETIC_CONVERSATION_CLEANUP_FAILED');}
  }}
 },{syntheticVoice:true});}catch(error){failure=String(error?.message??'').match(/^([A-Z][A-Z0-9_]{2,79})\b/)?.[1]??String(error?.code??'VERIFICATION_FAILED').match(/^([A-Z][A-Z0-9_]{2,79})/)?.[1]??'VERIFICATION_FAILED';process.exitCode=1;}
 if(cleanupErrors.length){failure??='SYNTHETIC_CLEANUP_FAILED';process.exitCode=1;}
 const report={status:failure?'failed':'passed',build,expectedBuild,startedAt,completedAt:new Date().toISOString(),samples:results,modelRequests,maximumModelRequests:3,syntheticConversationsRemoved:removed,cleanupErrors,configurationWrites:0,rawAudioStored:false,privateTranscriptsInReport:false,source:'Synthetic native speech through authenticated API; physical microphone and speaker not tested',failure,failureStage:failure?activeStage:null};
 await mkdir('artifacts/auto-language-r17',{recursive:true});await writeFile('artifacts/auto-language-r17/production-pipeline'+(only?'-'+only:'')+'.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,build,samples:results.map(({inputLanguage,detectedLanguage,responseLanguage,status})=>({inputLanguage,detectedLanguage,responseLanguage,status})),modelRequests,cleanupErrors,failure,failureStage:report.failureStage}));
}
