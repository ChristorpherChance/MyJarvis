import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PiService, type PiUsageRecord } from '../src/pi.js';
import { gatewayDefinitionSchema, routingDocumentSchema, presetGateways } from '../src/pi-routing.js';
import { createApp } from '../src/app.js';
import { assertDto } from '../src/v1/contract.js';

test('routing rejects invalid protocols and permits partial scene overrides', () => {
  assert.deepEqual(routingDocumentSchema.parse({revision:0,gateways:[],routes:{memory:{provider:'cc-gateway',model:'Kimi-Coding/k3'}}}).routes,{memory:{provider:'cc-gateway',model:'Kimi-Coding/k3'}});
  assert.throws(()=>gatewayDefinitionSchema.parse({id:'openai',name:'Clobber',baseUrl:'https://example.test',api:'anthropic-messages'}));
  for(const baseUrl of ['http://example.test','https://key@example.test','https://example.test?key=secret','https://example.test#x'])assert.throws(()=>gatewayDefinitionSchema.parse({id:'gateway-test',name:'Test',baseUrl,api:'anthropic-messages'}));
});

test('configuration HTTP endpoints require administrator auth, match typed contracts and reject stale revisions',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'jarvis-routing-http-')),original=globalThis.fetch,key='nonproduction-http-gateway-key';
  const pi=new PiService(directory,{listProjects:()=>[],listDevices:()=>[],listTasks:()=>[],listExperiences:()=>[]});
  globalThis.fetch=async()=>new Response(JSON.stringify({data:[{id:'Kimi-Coding/k3'}]}));
  const runtime=await createApp({dataDir:directory,pi,webDir:join(directory,'none')});
  try{const app=runtime.app;
    for(const [method,url,payload] of [['GET','/api/settings/pi',undefined],['POST','/api/settings/pi/gateways',{}],['PUT','/api/settings/pi/routing',{}],['PUT','/api/settings/pi/pricing',{}],['POST','/api/settings/pi/test',{}]] as const){assert.equal((await app.inject({method,url,payload})).statusCode,401);}
    const setup=await app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'Isolated-long-test-passphrase'}}),headers={cookie:String(setup.headers['set-cookie']).split(';')[0]!};
    const saved=await app.inject({method:'POST',url:'/api/settings/pi/gateways',headers,payload:{definition:presetGateways[1],apiKey:key}});assert.equal(saved.statusCode,200);assertDto('PiModelSettings',saved.json());assert(!saved.body.includes(key));
    const revision=saved.json().routing.revision;
    const routed=await app.inject({method:'PUT',url:'/api/settings/pi/routing',headers,payload:{expectedVersion:revision,routes:{'family-chat':{provider:'cc-gateway',model:'Kimi-Coding/k3'}}}});assert.equal(routed.statusCode,200);assertDto('PiModelSettings',routed.json());assert.equal(pi.health('family-chat').configured,true);assert.equal(pi.health().configured,false);
    assert.equal((await app.inject({method:'PUT',url:'/api/settings/pi/routing',headers,payload:{expectedVersion:revision,routes:{}}})).statusCode,409);
    assert.equal((await app.inject({method:'PUT',url:'/api/settings/pi/routing',headers,payload:{expectedVersion:revision+1,routes:{invented:{provider:'cc-gateway',model:'Kimi-Coding/k3'}}}})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/api/settings/pi/test',headers,payload:{scenario:'family-chat',selection:{provider:'cc-gateway',model:'Kimi-Coding/k3'}}})).statusCode,400);
    const priced=await app.inject({method:'PUT',url:'/api/settings/pi/pricing',headers,payload:{expectedVersion:revision+1,provider:'cc-gateway',model:'Kimi-Coding/k3',price:{input:1,output:2,cacheRead:0,cacheWrite:0}}});assert.equal(priced.statusCode,200);assertDto('PiModelSettings',priced.json());
    assert.equal(priced.json().routing.scenarios.find((s:any)=>s.id==='family-chat').pricingKnown,true);
  }finally{await runtime.app.close();globalThis.fetch=original;await rm(directory,{recursive:true,force:true});}
});

test('real Pi SDK routes each call independently, persists keys and overrides, respects local privacy and explicit prices', async () => {
  const directory=await mkdtemp(join(tmpdir(),'jarvis-routing-')),original=globalThis.fetch,callbacks={listProjects:()=>[],listDevices:()=>[],listTasks:()=>[],listExperiences:()=>[]},requests:{origin:string;model:string}[]=[],usage:PiUsageRecord[]=[];
  let service:PiService|undefined;
  const keyA='nonproduction-gateway-a',keyB='nonproduction-gateway-b',keyC='nonproduction-gateway-c';
  const requestStarted={resolve:()=>{}},requestRelease={resolve:()=>{}};let delay=false;
  const started=new Promise<void>(resolve=>{requestStarted.resolve=resolve;}),released=new Promise<void>(resolve=>{requestRelease.resolve=resolve;});
  try {
    globalThis.fetch=async(input,options)=>{
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
      const routed=url.hostname==='cc-gateway.ikvein.com',custom=url.hostname==='custom.example.test';
      if(url.pathname.endsWith('/models'))return new Response(JSON.stringify({data:[{id:custom?'custom-chat':routed?'Kimi-Coding/k3':'CPA / CLIProxyAPI/default-chat'}]}));
      assert.equal(url.pathname,'/v1/messages');const body=JSON.parse(String(options?.body));requests.push({origin:url.origin,model:body.model});
      if(delay){requestStarted.resolve();await released;delay=false;}
      const text='来自 '+body.model;
      const events=[{type:'message_start',message:{id:'response-'+requests.length,type:'message',role:'assistant',model:body.model,content:[],stop_reason:null,usage:{input_tokens:10,output_tokens:0}}},{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:5}},{type:'message_stop'}];
      return new Response(events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}});
    };
    service=new PiService(directory,callbacks);await service.initialize();
    await service.configure({provider:'superopen',model:'CPA / default-chat',apiKey:keyA});
    await service.configureGateway(presetGateways[1]!,keyB);
    await service.configureGateway({id:'gateway-custom',name:'Custom',baseUrl:'https://custom.example.test',api:'anthropic-messages'},keyC);
    const initial=await service.getSettings();assert.equal(initial.provider,'superopen');assert.equal(initial.gateways.length,3);
    for(const secret of [keyA,keyB,keyC]){assert(!JSON.stringify(initial).includes(secret));assert(!(await readFile(join(directory,'pi/agent/models.json'),'utf8')).includes(secret));assert(!(await readFile(join(directory,'pi/agent/routing.json'),'utf8')).includes(secret));}
    const updated=await service.updateRouting(initial.routing.revision,{'family-chat':{provider:'cc-gateway',model:'Kimi-Coding/k3'},memory:{provider:'cc-gateway',model:'Kimi-Coding/k3'},development:{provider:'gateway-custom',model:'custom-chat'}});
    assert.equal(service.health('chat').provider,'superopen');assert.equal(service.health('family-chat').provider,'cc-gateway');assert.equal(service.health('knowledge').provider,'superopen');assert.equal(await service.modelIsLocal('family-chat'),false);
    await assert.rejects(service.updateRouting(initial.routing.revision,{}),/PI_SETTINGS_CONFLICT/);
    await assert.rejects(service.updateRouting(updated.routing.revision,{memory:{provider:'cc-gateway',model:'invented'}}),/PI_NOT_CONFIGURED/);
    await assert.rejects(service.configureGateway({...presetGateways[1]!,baseUrl:'https://other.example.test'}),/PI_GATEWAY_ENDPOINT_IMMUTABLE/);
    service.setLifecycleHooks({onUsage:value=>usage.push(value)});
    const base={actorId:'owner',member:{name:'我',preferences:''},sessionPath:null,text:'你好',onEvent:()=>{},onSessionPath:()=>{}};
    assert.equal((await service.run({...base,conversationId:'default-1',scenario:'chat'})).text,'来自 CPA / default-chat');
    assert.equal((await service.run({...base,conversationId:'family-1',scenario:'family-chat'})).text,'来自 Kimi-Coding/k3');
    assert.deepEqual(requests.map(r=>r.origin),['https://gw.superopen.top','https://cc-gateway.ikvein.com']);assert.equal(usage[1]?.scenario,'family-chat');assert.equal(usage[1]?.provider,'cc-gateway');assert.equal(usage[1]?.costUSD,null);
    const before=requests.length;await assert.rejects(service.run({...base,conversationId:'private-1',scenario:'family-chat',requireLocalModel:true}),/PI_PRIVACY_FORBIDDEN/);await assert.rejects(service.run({...base,conversationId:'memory-1',scenario:'memory',boundedJob:true}),/PI_PRICE_UNAVAILABLE/);assert.equal(requests.length,before);
    const priced=await service.updatePrice(updated.routing.revision,'cc-gateway','Kimi-Coding/k3',{input:2,output:4,cacheRead:1,cacheWrite:3});
    assert.equal(priced.routing.scenarios.find(s=>s.id==='memory')?.budgetReady,true);
    const memory=await service.run({...base,conversationId:'memory-2',scenario:'memory',boundedJob:true,maxCostUSD:.1});assert.equal(memory.status,'complete');assert(Math.abs(usage.at(-1)!.costUSD!-.00004)<1e-12);
    delay=true;const running=service.run({...base,conversationId:'busy-1',scenario:'chat'});await started;
    await assert.rejects(service.updateRouting(priced.routing.revision,{}),/PI_BUSY/);requestRelease.resolve();await running;
    await service.dispose();service=new PiService(directory,callbacks);await service.initialize();assert.equal(service.health('family-chat').configured,true);assert.equal(service.health('development').provider,'gateway-custom');assert.equal((await service.getSettings()).routing.prices[0]?.price.input,2);
    await assert.rejects(service.developmentContext(),/PI_PRICE_UNAVAILABLE/);
    const current=await service.getSettings();await service.updatePrice(current.routing.revision,'gateway-custom','custom-chat',{input:1,output:1,cacheRead:0,cacheWrite:0});assert.equal((await service.developmentContext()).model.id,'custom-chat');
    const final=await service.getSettings();await service.updateRouting(final.routing.revision,{});assert.equal(service.health('family-chat').provider,'superopen');
  } finally { requestRelease.resolve();await service?.dispose();globalThis.fetch=original;await rm(directory,{recursive:true,force:true}); }
});
