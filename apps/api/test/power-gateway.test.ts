import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {discoverGateway,GatewayError,gatewayUrl} from '../src/pi-gateway.js';
import {PiService,type PiUsageRecord} from '../src/pi.js';
import {estimatePower,PowerRuntime,type PowerProfile} from '../src/runtime/power-runtime.js';

const id='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73';
const hardware:PowerProfile={machineId:id,cpuModel:'i5-7400',tdpWatts:65,dimmCount:4,ssdCount:1,hddCount:0,evidence:'test inventory'};
const now=Date.now(),at=new Date(now).toISOString();
const machine={id,name:'101',scope:'personal',room:'家庭服务器',address:'192.168.10.101',cpu:'i5-7400',agentStatus:'connected',lastSeen:at,telemetry:{source:'signed-agent',observedAt:at,cpuPercent:0,cpuPower:{source:'intel-rapl',observedAt:at,windowSeconds:2,watts:5}}};
test('whole-box estimates exclude cloud, require fresh signed readings and keep package power separate',()=>{
 const result=estimatePower(machine,hardware,now);assert.equal(result.status,'estimated');assert.equal(result.cpuPackage?.watts,5);assert(result.estimate!.minimumWatts>5);assert(result.estimate!.maximumWatts>result.estimate!.minimumWatts);assert.equal(result.estimate?.method,'rapl-plus-components');assert.equal(result.estimate?.projection30Days.maximumKWh,Math.round(result.estimate.maximumWatts*.72*10)/10);
 assert.equal(estimatePower({...machine,address:'8.163.127.192',room:'广州云端'},hardware,now).status,'excluded');
 assert.equal(estimatePower({...machine,room:'云服务器',address:'10.0.1.2'},hardware,now).status,'excluded');
 assert.equal(estimatePower({...machine,telemetry:{...machine.telemetry,observedAt:new Date(now-61000).toISOString()}},hardware,now).estimate,null);
 assert.equal(estimatePower({...machine,cpu:'i7-7700'},hardware,now).status,'unconfigured');
 assert.equal(estimatePower({...machine,telemetry:{...machine.telemetry,cpuPower:undefined}},hardware,now).estimate?.method,'cpu-load-plus-components');
 const db=new DatabaseSync(':memory:');try{const power=new PowerRuntime(db,()=>[machine,{...machine,id:'cloud',room:'云端'}]);assert.equal(power.summary().excludedNodes,1);assert.equal(power.accept({machineId:id,capabilities:['telemetry']},machine.telemetry.cpuPower)?.watts,5);assert.throws(()=>power.accept({machineId:id,capabilities:[]},machine.telemetry.cpuPower));assert.throws(()=>power.accept({machineId:id,capabilities:['telemetry']},{...machine.telemetry.cpuPower,observedAt:new Date(now-31000).toISOString()}));assert.equal(power.accept({machineId:'cloud',capabilities:['telemetry']},machine.telemetry.cpuPower),undefined);assert.throws(()=>power.configure({expectedVersion:9,profiles:[hardware]}));}finally{db.close();}
});
test('gateway discovery is bounded, fixed-origin, sanitizes errors and rejects invalid catalogs',async()=>{
 const key='test-nonproduction-key';
 const catalog=await discoverGateway(key,async(url,options)=>{assert.equal(url,gatewayUrl+'/v1/models');assert.equal(options?.redirect,'error');return new Response(JSON.stringify({data:[{id:'test-chat',name:'Test'}]}));});assert.equal(catalog.models[0]?.id,'test-chat');
 const routed=await discoverGateway(key,async()=>new Response(JSON.stringify({data:[{id:'CPA / CLIProxyAPI/test-chat',display_name:'Test Chat'},{id:'bad\nid'},{id:'secret-reflection',display_name:key+'x'.repeat(300)}]})));assert.deepEqual(routed.models,[{id:'CPA / test-chat',name:'Test Chat'}]);
 await assert.rejects(discoverGateway(key,async()=>new Response('secret echoed upstream',{status:401})),e=>e instanceof GatewayError&&e.code==='PI_GATEWAY_AUTH_FAILED'&&!e.message.includes(key));
 await assert.rejects(discoverGateway(key,async()=>new Response(JSON.stringify({data:[{id:'!danger'}]}))),e=>e instanceof GatewayError&&e.code==='PI_GATEWAY_CATALOG_INVALID');
 await assert.rejects(discoverGateway(key,async()=>new Response('x'.repeat(513*1024))),e=>e instanceof GatewayError&&e.code==='PI_GATEWAY_CATALOG_INVALID');
});
test('Pi owns gateway auth/model persistence, sends Anthropic SSE through the fixed gateway, and records unpriced usage',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-gateway-test-')),original=globalThis.fetch,usage:PiUsageRecord[]=[];let calls=0,service:PiService|undefined;const key='test-nonproduction-gateway-key';
 try{globalThis.fetch=async(input,options)=>{
   const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
   if(url.endsWith('/v1/models'))return new Response(JSON.stringify({data:[{id:'CPA / CLIProxyAPI/test-chat'}]}));
   assert.equal(new URL(url).origin,gatewayUrl);assert.equal(new URL(url).pathname,'/v1/messages');calls++;const requestBody=JSON.parse(options?.body?String(options.body):input instanceof Request?await input.text():'{}');assert.equal(requestBody.model,'CPA / test-chat');
   const events=[{type:'message_start',message:{id:'test-response',type:'message',role:'assistant',model:'test-chat',content:[],stop_reason:null,usage:{input_tokens:4,output_tokens:0}}},{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'你好，连接正常。'}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:6}},{type:'message_stop'}];
   return new Response(events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}});
 };const callbacks={listProjects:()=>[],listDevices:()=>[],listTasks:()=>[],listExperiences:()=>[]};
 service=new PiService(directory,callbacks);await service.initialize();await service.configure({provider:'superopen',model:'CPA / test-chat',apiKey:key});assert.equal(service.health().configured,true);assert(!JSON.stringify(await service.getSettings()).includes(key));assert(!String(await readFile(join(directory,'pi/agent/models.json'))).includes(key));assert.equal(JSON.parse(await readFile(join(directory,'pi/agent/auth.json'),'utf8')).superopen.key,key);
 service.setLifecycleHooks({onUsage:value=>{usage.push(value);}});const result=await service.run({actorId:'owner',conversationId:'gateway-test',member:{name:'我',preferences:''},sessionPath:null,text:'你好',onEvent:()=>{},onSessionPath:()=>{}});assert.equal(result.status,'complete');assert.equal(result.text,'你好，连接正常。');assert.equal(calls,1);assert.equal(usage[0]?.costUSD,null);assert.equal(usage[0]?.costKind,'unavailable');
 await service.dispose();service=new PiService(directory,callbacks);await service.initialize();assert.equal(service.health().provider,'superopen');assert.equal(service.health().configured,true);await service.configure({provider:'superopen',model:'CPA / test-chat'});await assert.rejects(service.developmentContext(),/PI_PRICE_UNAVAILABLE/);assert.equal(calls,1);
 }finally{await service?.dispose();globalThis.fetch=original;await rm(directory,{recursive:true,force:true});}
});
