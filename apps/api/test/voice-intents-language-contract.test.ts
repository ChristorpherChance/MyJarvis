import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {assertDto} from '../src/v1/contract.js';

const original=()=>JSON.parse(readFileSync(fileURLToPath(new URL('../../../docs/openapi-v1-planned.json',import.meta.url)),'utf8'));
test('strict reply and intent language metadata survives actual runtime/voice contract regeneration without replacing other fields',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-intent-language-contract-'));
 try{
  const baseline=original();await mkdir(join(directory,'docs'));await writeFile(join(directory,'docs/openapi-v1-planned.json'),JSON.stringify(baseline));
  for(const script of ['update-runtime-contract.cjs','update-voice-stream-contract.cjs','update-runtime-contract.cjs']){
   const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../../scripts/'+script,import.meta.url))],{cwd:directory,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);
   const generated=JSON.parse(await readFile(join(directory,'docs/openapi-v1-planned.json'),'utf8')),schemas=generated.components.schemas,language=['zh','en','fr','de'];
   assert.deepEqual(schemas.RoomIntentProposal.properties.speechLanguage.enum,language);assert(!schemas.RoomIntentProposal.required.includes('speechLanguage'));assert.equal(schemas.RoomIntentProposal.additionalProperties,false);
   for(const branch of schemas.RoomIntentConfirmation.oneOf){assert.deepEqual(branch.properties.speechLanguage.enum,language);assert.equal(branch.additionalProperties,false);}
   assert(schemas.RoomIntentAlternative.properties.action.enum.includes('remote.operation'));assert.equal(schemas.RoomIntentAlternative.properties.remoteJobId.format,'uuid');assert(schemas.RoomIntentReceipt.properties.status);assert.equal(schemas.RoomIntentReceipt.additionalProperties,false);
   const content=generated.paths['/api/runtime/family/conversations/{id}/messages'].post.responses['200'].content;
   assert.deepEqual(content['application/json'].schema.properties.responseLanguage.enum,language);
   for(const [event,name]of [['status','RuntimeFamilyStreamStatus'],['route','RuntimeFamilyStreamRoute'],['done','RuntimeFamilyStreamDone']]){assert.equal(content['text/event-stream']['x-event-schemas'][event].$ref,'#/components/schemas/'+name);assert.deepEqual(schemas[name].properties.responseLanguage.enum,language);assert.equal(schemas[name].additionalProperties,false);}
   for(const name of ['RuntimeFamilyMessage','RuntimeVoiceSession','QnapStorageReading','ServiceResourceMetrics'])assert.deepEqual(schemas[name],baseline.components.schemas[name]);
  }
 }finally{assert(resolve(directory).startsWith(resolve(tmpdir())+sep));await rm(directory,{recursive:true,force:true});}
});
test('language metadata is optional for old frames but unsupported values and extra properties fail strict DTO validation',()=>{
 const route={tier:'fast',reason:'ordinary',provider:'fixture',model:'fixture'};assertDto('RuntimeFamilyStreamRoute',route);assertDto('RuntimeFamilyStreamRoute',{...route,responseLanguage:'fr'});
 for(const invalid of [{...route,responseLanguage:'ja'},{...route,responseLanguage:'auto'},{...route,responseLanguage:'de',permission:'admin'}])assert.throws(()=>assertDto('RuntimeFamilyStreamRoute',invalid));
 assertDto('RuntimeFamilyStreamStatus',{state:'thinking',responseLanguage:'en'});assert.throws(()=>assertDto('RuntimeFamilyStreamStatus',{state:'thinking',responseLanguage:'english'}));
});
