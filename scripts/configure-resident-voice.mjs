import {primary,withPlatform} from './managed-server-client.mjs';
const key=primary("from pathlib import Path\nprint(Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip())\n");
if(!/^[A-Za-z0-9_-]{64}$/.test(key))throw Error('Private service credential invalid');
await withPlatform(async({api})=>{
 await api('/api/runtime/voice/engines/asr',{adapter:'http',baseUrl:'http://127.0.0.1:3153/v1',apiKey:key,model:'sensevoice-resident',language:'auto',voice:'',format:'wav',timeoutMs:30000},'PUT');
 await api('/api/runtime/voice/engines/tts',{adapter:'http',baseUrl:'http://127.0.0.1:3153/v1',apiKey:key,model:'matcha-resident',language:'auto',voice:'0',voiceMap:{clear:'0',warm:'0',calm:'0'},format:'wav',timeoutMs:60000},'PUT');
 const health=await api('/api/runtime/voice/engines/health');if(!health.ready)throw Error('Resident voice not ready');console.log(JSON.stringify({configured:true,ready:true,asr:health.asr,tts:health.fastTts,kws:health.kws}));
});
