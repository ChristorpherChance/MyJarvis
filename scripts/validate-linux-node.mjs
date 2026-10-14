/** Real CPU and protected-HTTP smoke tests; fixtures never create family business records. */
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {request} from 'node:https';
import {createHash} from 'node:crypto';
import {Store} from '../apps/api/dist/store.js';
import {readNodeConfiguration,PLATFORM_BUILD,enforceNodeStartup} from '../apps/api/dist/runtime/cluster-runtime.js';
const execute=promisify(execFile),config=await readNodeConfiguration('/etc/jarvis/node.json'),ca=await readFile(config.caPath),root=resolve('.'),python='/opt/jarvis/venv/bin/python';
const checks=[];
const runPython=(args,options)=>execute('/usr/sbin/runuser',['-u','jarvis','--',python,...args],options);
async function get(path,{cookie='',token='',expect=200,port=3140,method='GET',payload,trust=ca}={}){
 return await new Promise((ok,fail)=>{const req=request('https://127.0.0.1:'+port+path,{ca:trust,rejectUnauthorized:true,method,headers:{...(cookie?{cookie}:{}),...(token?{'x-jarvis-node-token':token}:{}),...(payload?{'content-type':'application/json'}:{})}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>{if(res.statusCode!==expect)return fail(Error(path+' unexpected status '+res.statusCode));ok({body:Buffer.concat(chunks),headers:res.headers});});});req.setTimeout(6000,()=>req.destroy(Error('HTTP timeout')));req.on('error',fail);req.end(payload?JSON.stringify(payload):undefined);});
}
const fixture=await mkdtemp(join(tmpdir(),'jarvis-node-validate-'));
try{
 await execute('/usr/bin/chown',['jarvis:jarvis',fixture]);
 const text=join(fixture,'speech.txt'),wav=join(fixture,'speech.wav'),asr=join(fixture,'asr.json');await writeFile(text,'Jarvis study test. Learning requires thought.');
 await runPython([join(root,'apps/api/resources/voice/tts_espeak.py'),'--text-file',text,'--output',wav,'--language','en','--speed','1'],{timeout:65000});
 const audio=await readFile(wav);if(audio.toString('ascii',0,4)!=='RIFF'||audio.length<1000)throw Error('Real TTS failed');checks.push('real-offline-tts');
 await runPython([join(root,'apps/api/resources/voice/asr_faster_whisper.py'),'--input',wav,'--output',asr,'--model',join(config.dataDir,'runtime/models/whisper-tiny'),'--language','en'],{timeout:180000,env:{...process.env,HF_HUB_OFFLINE:'1',OMP_NUM_THREADS:'2'}});
 const transcript=JSON.parse(await readFile(asr,'utf8'));if(!transcript.text?.trim()||!Number.isFinite(transcript.duration))throw Error('Real ASR failed');checks.push('real-cpu-asr');
 await runPython([join(root,'apps/api/resources/knowledge-runtime/make_test_originals.py'),'--directory',fixture],{timeout:30000});
 const {stdout}=await runPython([join(root,'apps/api/resources/knowledge-runtime/scan_worker.py'),'--input',join(fixture,'scan-original.png'),'--mime','image/png','--round','1','--engine','rapidocr','--max-pages','1'],{timeout:180000});
 const extracted=JSON.parse(stdout);const contents=JSON.stringify(extracted);if(!/JARVIS|STUDY/i.test(contents)||!/学习|思考/.test(contents))throw Error('Real Chinese OCR failed');checks.push('real-chinese-ocr');
 if(config.role==='standby'){
  await enforceNodeStartup('/etc/jarvis/node.json',config.dataDir).then(()=>{throw Error('Standby startup was accepted');},e=>{if(!e.message.includes('Standby'))throw e;});
  try{await get('/api/health');throw Error('Standby business is running');}catch(e){if(!['ECONNREFUSED','ECONNRESET'].includes(e.code))throw e;}
  checks.push('standby-business-stopped','standby-startup-denied');
 }else{
  const health=JSON.parse((await get('/api/health')).body);if(health.nodeId!==config.nodeId||health.role!=='primary'||health.build!==PLATFORM_BUILD)throw Error('Primary identity failed');checks.push('primary-https-identity');
  await get('/api/bootstrap',{expect:401});await get('/api/runtime/cluster',{expect:401});checks.push('unauthenticated-private-api-denied');
  const html=(await get('/')).body.toString();if(!html.includes('id="root"'))throw Error('Missing frontend');checks.push('frontend-served');
  const store=new Store(config.dataDir);const session=store.createLogin();
  try{
   const cookie='jarvis_session='+session;
   for(const path of ['/api/bootstrap','/api/runtime/voice/engines','/api/runtime/governance','/api/runtime/cluster','/api/runtime/cluster/nodes','/api/runtime/cluster/snapshot']){await get(path,{cookie});checks.push('protected-read:'+path);}
   const cluster=JSON.parse((await get('/api/runtime/cluster/check',{cookie,method:'POST',payload:{}})).body);if(cluster.nodes.length!==1||cluster.nodes[0].status!=='reachable'||cluster.nodes[0].observation.businessHealthy)throw Error('Standby observation failed');
   checks.push('authenticated-peer-observation');
  }finally{store.deleteLogin(session);store.close();}
 }
 await get('/status',{port:3141,expect:401});const observed=JSON.parse((await get('/status',{port:3141,token:config.observerToken})).body);if(observed.nodeId!==config.nodeId||observed.role!==config.role||observed.snapshot?.verified!==true)throw Error('Observer identity failed');checks.push('observer-auth-and-restore');
 const result={status:'passed',build:PLATFORM_BUILD,nodeId:config.nodeId,at:new Date().toISOString(),checks,tts:'espeak-ng-offline-fallback',realMicrophoneTest:false,realRoomWakeTest:false};
 console.log(JSON.stringify(result));await writeFile(join(config.controlDir,'node-validation.json'),JSON.stringify(result));
 const dependencies={status:'passed',build:PLATFORM_BUILD,at:result.at,checks:checks.filter(x=>x.startsWith('real-')),naturalVoiceModelInstalled:false};await writeFile(join(config.controlDir,'dependencies.json'),JSON.stringify(dependencies));
}catch(error){console.error(error.message);process.exitCode=1;}
finally{await rm(fixture,{recursive:true,force:true});}
