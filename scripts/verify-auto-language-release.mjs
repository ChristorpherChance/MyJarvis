/** Current-release checks only; never relabel historical R16 evidence as R17. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {primary,withPlatform} from './managed-server-client.mjs';
const expected='20261010-auto-language-r17-1',clientBuild='20261010-auto-language-r17';
if(!process.argv.includes('--execute')){
 console.log(JSON.stringify({prepared:true,expected,readOnly:true}));
}else{
 const json=async path=>JSON.parse(await readFile(path,'utf8'));
 const activation=await json('artifacts/managed-servers/activation.json'),compiled=await json('artifacts/managed-servers/application-stage-verification.json');
 assert.equal(activation.release,expected);assert.equal(compiled.release,expected);assert.equal(compiled.status,'passed');assert(activation.results.every(node=>node.active));
 const live=await withPlatform(async({api,records})=>{
  const health=await api('/api/health');assert.equal(health.build,expected);
  const preference=await api('/api/runtime/family/reply-language');assert.equal(preference.replyLanguage,'en');
  const personas=await records('personas'),policy=await json('artifacts/auto-language-r17/family-reply-policies.json');
  assert.equal(policy.changes.length,6);
  const members=policy.changes.map(member=>{
   const current=personas.find(record=>record.kind==='persona'&&record.profileId===member.profileId);assert.equal(current?.replyLanguage,member.replyLanguage);
   return {profileId:member.profileId,name:member.name,replyLanguage:current.replyLanguage,revision:current.revision};
  });
  const settings=await api('/api/settings/pi'),route=settings.routing.conversation;
  assert(route.enabled&&route.transition&&route.fast&&route.advanced);
  return {build:health.build,ownerReplyLanguage:preference.replyLanguage,members,conversationRouting:route,configurationWrites:0};
 });
 const worker=JSON.parse(primary(`import json,urllib.request,subprocess
from pathlib import Path
token=Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip()
with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:3153/health',headers={'Authorization':'Bearer '+token}),timeout=5) as response:health=json.load(response)
properties=subprocess.run(['systemctl','show','jarvis-voice.service','--property=MemoryMax,CPUQuotaPerSecUSec,TasksMax,TasksCurrent,MemoryCurrent'],capture_output=True,text=True,check=True).stdout
print(json.dumps({'ready':health.get('ready'),'asrRevision':health.get('asrRevision'),'asrLanguages':health.get('asrLanguages'),'ttsLanguages':health.get('ttsLanguages'),'piperLanguages':health.get('piperLanguages'),'limits':dict(line.split('=',1) for line in properties.strip().splitlines())}))
`));
 assert.equal(worker.ready,true);assert.equal(worker.asrRevision,'20261010-multilingual-r2');
 for(const language of ['zh','en','fr','de']){assert(worker.asrLanguages.includes(language));assert(worker.ttsLanguages.includes(language));}
 assert(worker.asrLanguages.includes('auto'));
 assert.equal(Number(worker.limits.MemoryMax),5*1024**3);assert.equal(Number(worker.limits.TasksMax),64);assert.equal(worker.limits.CPUQuotaPerSecUSec,'2.500000s');
 assert(Number(worker.limits.TasksCurrent)>0&&Number(worker.limits.TasksCurrent)<=64);
 const policyProof=await json('artifacts/auto-language-r17/pi-output-language-review.json');
 assert.equal(policyProof.status,'source-frozen');assert.equal(policyProof.plannedRelease,expected);
 assert.equal(policyProof.validation.finalSourceTests.passed,4);assert.equal(policyProof.validation.finalSourceTests.exitCode,0);
 for(const [path,hash] of Object.entries(policyProof.sourceHashes))assert.equal(createHash('sha256').update(await readFile(path)).digest('hex').toUpperCase(),hash,path);
 const evidence={nativePiPolicy:{path:'artifacts/auto-language-r17/pi-output-language-review.json',checks:4,paidModelCalls:0}};
 for(const [name,path] of Object.entries({
  productionPipeline:'artifacts/auto-language-r17/production-pipeline.json',
  initialGet:'artifacts/platform-initial-get/published-report.json',
  mobileLayout:'artifacts/mobile-layout/published/report.json',
  sourceUi:'artifacts/auto-language-r17/source-ui/report.json',
  compiledUi:'artifacts/auto-language-r17/compiled-ui/report.json',
  publishedSettings:'artifacts/auto-language-r17/published-settings/report.json',
 })){
  const proof=await json(path);assert.equal(proof.status,'passed',name);
  if(name==='productionPipeline'||name==='publishedSettings')assert.equal(proof.build,expected,name);
  if(name==='initialGet')assert.equal(proof.release,expected,name);
  if(name==='sourceUi'||name==='compiledUi')assert.equal(proof.requiredClientBuild,clientBuild,name);
  if(name==='compiledUi')assert.equal(proof.compiled,true);
  evidence[name]={path,build:proof.build??proof.release??null,checks:Array.isArray(proof.checks)?proof.checks.length:undefined};
 }
 const report={at:new Date().toISOString(),status:'passed',release:expected,publicUrl:'https://cc-jarvis.ikvein.com/',nodes:activation.results,compiled:compiled.checks,live,worker,evidence,
  limitations:['Input language does not identify the speaker; current authenticated member owns preferences and memory.','New family profiles have no credentials until the administrator configures them.','Synthetic audio and browser tests do not verify a physical phone microphone or speaker.','Very short utterances, accents, mixed languages and noise can still affect automatic recognition.','Japanese and Spanish practice target examples remain text-only.'],verificationConfigurationWrites:0};
 await mkdir('artifacts/auto-language-r17',{recursive:true});await writeFile('artifacts/auto-language-r17/release-verification.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,release:expected,workerReady:worker.ready,members:live.members.map(({name,replyLanguage})=>({name,replyLanguage})),evidence:Object.keys(evidence)}));
}
