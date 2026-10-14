/** Summarize an activated release using read-only health/configuration probes and existing proof reports. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {primary,withPlatform} from './managed-server-client.mjs';

if(!process.argv.includes('--execute')){
 console.log('Prepared read-only release verification; use --execute after deployment.');
}else{
 const expected=process.argv.find(value=>value.startsWith('--build='))?.slice(8);
 assert.match(expected??'',/^[a-z0-9-]{1,80}$/);
 const json=async file=>JSON.parse(await readFile(file,'utf8'));
 const activation=await json('artifacts/managed-servers/activation.json');
 const compiled=await json('artifacts/managed-servers/application-stage-verification.json');
 assert.equal(activation.release,expected);assert.equal(compiled.release,expected);
 assert.equal(compiled.status,'passed');assert(activation.results.every(node=>node.active));
 const live=await withPlatform(async({api})=>{
  const health=await api('/api/health');assert.equal(health.build,expected);
  const settings=await api('/api/settings/pi');const route=settings.routing.conversation;
  assert(route.enabled&&route.transition&&route.fast&&route.advanced);
  const catalog=await api('/api/runtime/voice/catalog');
  const native=['en','fr','de'].map(language=>{
   const voice=catalog.items.find(item=>item.language===language&&item.model==='piper-resident');
   assert(voice?.available);return {language,id:voice.id,available:true};
  });
  return {build:health.build,conversationRouting:route,nativeVoices:native,personalVoicePreferencesChanged:false};
 });
 const worker=JSON.parse(primary(`import json,urllib.request,subprocess
from pathlib import Path
token=Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip()
req=urllib.request.Request('http://127.0.0.1:3153/health',headers={'Authorization':'Bearer '+token})
with urllib.request.urlopen(req,timeout=5) as response:health=json.load(response)
properties=subprocess.run(['systemctl','show','jarvis-voice.service','--property=MemoryMax,CPUQuotaPerSecUSec,TasksMax,TasksCurrent,MemoryCurrent'],capture_output=True,text=True,check=True).stdout
print(json.dumps({'ready':health.get('ready'),'asrRevision':health.get('asrRevision'),'multilingualAsr':health.get('multilingualAsr'),'asrLanguages':health.get('asrLanguages'),'ttsLanguages':health.get('ttsLanguages'),'piperLanguages':health.get('piperLanguages'),'limits':dict(line.split('=',1) for line in properties.strip().splitlines()),'memoryMeaning':'current systemd cgroup memory, including applicable cache; not RSS or peak'}))
`));
 assert.equal(worker.ready,true);
 assert.equal(worker.asrRevision,'20261010-multilingual-r1');assert.equal(worker.multilingualAsr,'faster-whisper-small');
 for(const language of ['zh','en','fr','de']){assert(worker.asrLanguages.includes(language));assert(worker.ttsLanguages.includes(language));}
 assert(worker.asrLanguages.includes('auto'));
 for(const language of ['en','fr','de'])assert(worker.piperLanguages.includes(language));
 assert.equal(Number(worker.limits.MemoryMax),5*1024**3);
 assert.equal(Number(worker.limits.TasksMax),64,'Existing task-capacity drop-in remains effective');
 assert(['4s','4.000000s'].includes(worker.limits.CPUQuotaPerSecUSec),'Configured 400% CPU quota, not a utilization reading');
 assert(Number(worker.limits.TasksCurrent)>0&&Number(worker.limits.TasksCurrent)<=Number(worker.limits.TasksMax));
 assert(Number(worker.limits.MemoryCurrent)>0&&Number(worker.limits.MemoryCurrent)<=Number(worker.limits.MemoryMax));
 const evidence={};
 for(const [name,path] of Object.entries({
  liveConversation:'artifacts/voice-web-r16-production/a795f6c0-ec64-4f7f-98b4-fe3e8e6f3c0f/report.json',
  multilingualPipeline:'artifacts/voice-response-r16/multilingual-platform.json',
  productionWeb:'artifacts/voice-response-r16/production-web.json',
  compiledVoiceUi:'artifacts/voice-response-r16/compiled-smoke/report.json',
  compiledWebUi:'artifacts/web-information-ui/compiled/report.json',
  initialGet:'artifacts/platform-initial-get/published-report.json',
  publishedMobileLayout:'artifacts/mobile-layout/published/report.json',
  publishedSettings:'artifacts/voice-response-r16/published-settings/report.json',
 })){
  const proof=await json(path);assert.equal(proof.status,'passed',name);
  const current=['initialGet','publishedMobileLayout','publishedSettings'].includes(name);
  evidence[name]={path,build:proof.build??proof.release??null,scope:current?'current-release-read-only':'earlier-R16-functionality-unchanged-in-contract-patch',checks:Array.isArray(proof.checks)?proof.checks.length:undefined};
 }
 assert.equal((await json(evidence.initialGet.path)).release,expected);
 assert.equal((await json(evidence.publishedSettings.path)).build,expected);
 const report={at:new Date().toISOString(),status:'passed',release:expected,
  publicUrl:'https://cc-jarvis.ikvein.com/',nodes:activation.results,
  compiledFiles:compiled.checks,live,worker,evidence,
  limitations:['Physical phone microphone and speaker are not verified by synthetic/browser tests.',
   'French and German recognition verification used synthetic native-language speech; real accents still need use.',
   'Reported Chinese trailing syllable was not reproduced and is not claimed fixed.',
   'Recording/upload/enrolment of a custom cloned voice is not implemented.'],
  verificationConfigurationWrites:0};
 await writeFile('artifacts/voice-response-r16/release-verification.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,release:expected,workerReady:worker.ready,evidence:Object.keys(evidence)}));
}
