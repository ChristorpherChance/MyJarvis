import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {withPlatform} from './managed-server-client.mjs';
const result=await withPlatform(async({api})=>{
 const health=await api('/api/health'),catalog=await api('/api/runtime/voice/catalog');assert.equal(health.build,'20261008-nas-protection-r9');assert.equal(catalog.nativeVoices,103);assert.equal(catalog.items.filter(v=>v.id.startsWith('kokoro:')).length,103);assert.equal(catalog.cloning.available,false);
 const session=await api('/api/runtime/voice/sessions',{roomId:'study'}),samples=[];
 try{for(const voiceId of ['local-fast','kokoro:3','kokoro:58','kokoro:2','jarvis-style']){
  const text=voiceId==='kokoro:2'?'Good evening. How can I help you?':'你好，我是你的管家。';let job=await api(`/api/runtime/voice/sessions/${session.id}/speech`,{text,playback:{voiceId}});
  for(let i=0;i<120&&['queued','running'].includes(job.status);i++){await new Promise(r=>setTimeout(r,100));job=await api('/api/runtime/voice/jobs/'+job.id);}assert.equal(job.status,'complete');assert.equal(job.result.voiceId,voiceId);assert(job.result.bytes>44);assert(job.result.seconds>0);samples.push({voiceId,voice:job.result.voice,engine:job.result.engine,bytes:job.result.bytes,seconds:job.result.seconds});
 }}finally{await api('/api/runtime/voice/sessions/'+session.id,undefined,'DELETE');}
 assert.equal((await api('/api/runtime/voice/catalog')).selectedVoiceId,catalog.selectedVoiceId);return {status:'passed',at:new Date().toISOString(),build:health.build,nativeVoices:103,cloningAvailable:false,previewDoesNotChangeMemberSelection:true,samples};
},{syntheticVoice:true});
await mkdir('artifacts/mobile-audio',{recursive:true});await writeFile('artifacts/mobile-audio/voice-library-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
