import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,rename,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';
import {canonicalAiDevelopment,aiDevelopmentHash} from '../src/runtime/ai-development.js';

async function fixture({provisionQueue=true}={}){
 const dir=await mkdtemp(join(tmpdir(),'jarvis-ai-development-')),queue=join(dir,'queue'),configPath=join(dir,'policy.json');let clock=Date.now();
 if(provisionQueue){await mkdir(queue);await mkdir(join(queue,'requests'));await mkdir(join(queue,'results'));}
 const rt=await createApp({dataDir:dir,aiDevelopment:{queue,configPath,now:()=>clock},pi:{initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{}} as unknown as PiService,webDir:join(dir,'none')});
 rt.store.setPassword('AI-development-isolated-test-password');const token=rt.store.createLogin(),headers={cookie:'jarvis_session='+token};
 const call=async(method:string,path:string,body?:unknown,expected=200)=>{const r=await rt.app.inject({method:method as any,url:'/api/runtime/ai-development'+path,headers,payload:body});assert.equal(r.statusCode,expected,r.body);return r.json();};
 const register=async(name:string,scope='personal')=>{const r=await rt.app.inject({method:'POST',url:'/api/v1/machines/commands/register',headers,payload:{commandId:randomUUID(),scope,expectedVersion:0,payload:{name,role:'隔离开发节点',category:'server',ram:16,cpu:'fixture',disk:'fixture',gpu:'unknown',os:'fixture',address:scope==='company'?'192.0.2.2':'192.0.2.1',room:'fixture',always:false}}});assert.equal(r.statusCode,200,r.body);return r.json().data;};
 const machine=await register('AI测试节点'),company=await register('只读公司节点','company');
 const policy={version:1,profiles:[{id:'linux-ai-dev-v1',revision:1,name:'Linux AI开发',tools:[{name:'claude',version:'2.1.292'}],providers:[{id:'fixture',name:'私有提供方',model:'fixture-model',credentialConfigured:false}],statuslineVersion:'1'}],nodes:[{machineId:machine.id,nodeId:'112',address:machine.address,targetUser:'superopen',profileIds:['linux-ai-dev-v1']},{machineId:company.id,nodeId:'company',address:company.address,targetUser:'devuser',profileIds:['linux-ai-dev-v1']}]};
 const savePolicy=()=>writeFile(configPath,JSON.stringify(policy));await savePolicy();
 const online=()=>writeFile(join(queue,'results','_status.json'),JSON.stringify({at:new Date(clock).toISOString(),online:true}));if(provisionQueue)await online();
 const request=()=>({commandId:randomUUID(),machineId:machine.id,action:'probe',profileId:'linux-ai-dev-v1',expectedMachineVersion:machine.revision,expectedProfileRevision:1});
 const rawJob=async(id:string)=>JSON.parse(await readFile(join(queue,'requests',id+'.json'),'utf8'));
 const result=async(job:any,patch:any={})=>{const raw=await rawJob(job.id);const value={schemaVersion:1,id:job.id,machineId:job.machineId,profileId:raw.profileId,profileRevision:raw.profileRevision,profileHash:raw.profileHash,bindingHash:job.bindingHash,status:'succeeded',at:new Date(clock).toISOString(),summary:'固定探测完成',inventory:{schemaVersion:1,tools:[{name:'claude',installed:true,version:'2.1.292',path:'/home/superopen/.local/bin/claude',matchesPinned:true,authStatus:'configured'}],providers:[{id:'fixture',name:'fixture',model:'fixture-model',credentialConfigured:true,current:true}],statusline:{configured:true,commandSHA256:'a'.repeat(64),scope:'global-and-provider',resources:true},resources:{cpuPercent:12,ramUsedBytes:4096,ramTotalBytes:8192,diskFreeBytes:16384,diskTotalBytes:32768,load1m:0.25},terminalTelemetry:{schemaVersion:1,observedAt:new Date(clock).toISOString(),sessionId:null,model:'fixture-model',provider:null,contextTokens:100,contextWindow:1000,currentInputTokens:30,currentOutputTokens:20,cacheReadTokens:50,cacheCreationTokens:null,sessionCostUSD:null,billingStatus:'unknown',rateLimitFiveHourPercent:null,rateLimitSevenDayPercent:null}},...patch};await writeFile(join(queue,'results',job.id+'.json'),JSON.stringify(value));return value;};
 return {rt,dir,queue,configPath,token,headers,call,machine,company,policy,savePolicy,online,request,rawJob,result,setClock:(value:number)=>clock=value,clock:()=>clock,close:async()=>{await rt.app.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}};
}

test('AI development API: current admin/owner/read-only/CAS, fixed binding and durable idempotency',async()=>{
 const f=await fixture();try{
  assert.equal((await f.rt.app.inject({method:'GET',url:'/api/runtime/ai-development/capabilities'})).statusCode,401);
  const principal=f.rt.identity.principal({cookies:{jarvis_session:f.token}} as any);
  assert.throws(()=>f.rt.aiDevelopment.capabilities({...principal,administrator:false}),/仅当前已认证管理员/);
  assert.throws(()=>f.rt.aiDevelopment.details({...principal,actorId:'different-owner'},f.machine.id),/设备不存在/);
  await f.call('POST','/jobs',{...f.request(),machineId:f.company.id,expectedMachineVersion:f.company.revision},403);
  await f.call('POST','/jobs',{...f.request(),expectedMachineVersion:999},409);await f.call('POST','/jobs',{...f.request(),expectedProfileRevision:2},409);
  await f.call('POST','/jobs',{...f.request(),credentials:{password:'must-not-be-accepted'}},400);
  const input=f.request(),job=await f.call('POST','/jobs',input);assert.equal(job.status,'queued');
  const raw=await f.rawJob(job.id);assert.equal(raw.machineRevision,f.machine.revision);assert.equal(raw.targetUser,'superopen');assert.equal(raw.profileHash,aiDevelopmentHash(f.policy.profiles[0]));assert.equal(raw.policyHash,aiDevelopmentHash(f.policy));assert.equal(Date.parse(raw.expiresAt)-Date.parse(raw.createdAt),900000);
  const {bindingHash,...bound}=Object.fromEntries(['machineId','machineRevision','address','nodeId','targetUser','action','profileId','profileRevision','profileHash','policyHash','bindingHash'].map(k=>[k,raw[k]]));assert.equal(bindingHash,aiDevelopmentHash(bound));
  assert(!JSON.stringify(raw).includes(f.token));assert(!Object.hasOwn(job,'authorizationHash'));assert(!Object.hasOwn(job,'profile'));
  assert.equal((await f.call('POST','/jobs',input)).id,job.id);assert.equal((await readdir(join(f.queue,'requests'))).filter(n=>n.endsWith('.json')).length,1);
  await f.call('POST','/jobs',{...input,action:'configure'},409);
  f.policy.profiles[0].revision=2;await f.savePolicy();await f.result(job);const changed=await f.call('GET','/jobs/'+job.id);assert.equal(changed.status,'unknown');assert.equal(changed.result,null);
  f.policy.profiles[0].revision=1;f.policy.nodes[0].address='192.0.2.9';await f.savePolicy();await f.call('POST','/jobs',f.request(),409);
  const persisted=JSON.parse(String(f.rt.identity.db.prepare('SELECT json FROM runtime_ai_development_jobs WHERE id=?').get(job.id)!.json));assert.equal(persisted.commandId,input.commandId);
 }finally{await f.close();}
});

test('AI development receipts: exact tuple, safe inventory, actual resources, stale/expiry and no billing fabrication',async()=>{
 const f=await fixture();try{
  const job=await f.call('POST','/jobs',f.request());
  for(const patch of [{id:randomUUID()},{machineId:f.company.id},{profileId:'other-profile'},{profileRevision:2},{profileHash:'b'.repeat(64)},{bindingHash:'c'.repeat(64)}]){await f.result(job,patch);assert.equal((await f.call('GET','/jobs/'+job.id)).status,'queued');}
  await f.result(job,{status:'running'});const running=await f.call('GET','/jobs/'+job.id);assert.equal((await f.call('GET','/jobs/'+job.id)).revision,running.revision);
  const value=await f.result(job);value.summary='password=fixture-private-value';(value.inventory as any).password='fixture-private-value';(value.inventory as any).rawLogs=['fixture-private-value'];(value.inventory.tools[0] as any).apiKey='fixture-private-value';(value.inventory.terminalTelemetry as any).totalTokens=999999;(value.inventory.terminalTelemetry as any).prompt='fixture-private-value';
  await writeFile(join(f.queue,'results',job.id+'.json'),JSON.stringify(value));const accepted=await f.call('GET','/jobs/'+job.id);assert.equal(accepted.status,'succeeded');assert(!JSON.stringify(accepted).includes('fixture-private-value'));assert(!JSON.stringify(accepted).includes('totalTokens'));
  const stored=String(f.rt.identity.db.prepare('SELECT json FROM runtime_ai_development_jobs WHERE id=?').get(job.id)!.json);assert(!stored.includes('fixture-private-value'));assert(!stored.includes('rawLogs'));
  let detail=await f.call('GET','/machines/'+f.machine.id);assert.equal(detail.observation.stale,false);assert.equal(detail.resources.ramUsedBytes,4096);assert.equal(detail.observation.inventory.terminalTelemetry.sessionCostUSD,null);assert(detail.usage.url.includes('machineId='+f.machine.id));assert.equal(detail.usage.terminalSessionBilling,'unknown');
  assert.equal(f.rt.governance.usageSummary({}).totals.records,0);
  f.setClock(f.clock()+121000);detail=await f.call('GET','/machines/'+f.machine.id);assert.equal(detail.observation.stale,true);assert.equal(detail.observation.inventory.terminalTelemetry.contextTokens,100);
  await f.online();const expired=await f.call('POST','/jobs',f.request());f.setClock(f.clock()+901000);await f.result(expired);const unknown=await f.call('GET','/jobs/'+expired.id);assert.equal(unknown.status,'unknown');assert.equal(unknown.reason,'AI_DEVELOPMENT_EXPIRED');assert.equal(unknown.result,null);
  f.rt.store.deleteLogin(f.token);assert.equal((await f.rt.app.inject({method:'GET',url:'/api/runtime/ai-development/jobs/'+job.id,headers:f.headers})).statusCode,401);
 }finally{await f.close();}
});

test('AI development unavailable worker and queue are blocked without fake dispatch; policy is required',async()=>{
 const f=await fixture();try{
  await writeFile(join(f.queue,'results','_status.json'),JSON.stringify({at:new Date(f.clock()-31000).toISOString(),online:true}));
  let caps=await f.call('GET','/capabilities');assert.equal(caps.blocked,true);assert.equal(caps.controllerOnline,false);let job=await f.call('POST','/jobs',f.request());assert.equal(job.status,'blocked');assert.equal((await readdir(join(f.queue,'requests'))).length,0);
  await f.online();const dispatched=await f.call('POST','/jobs',f.request());await writeFile(join(f.queue,'results','_status.json'),JSON.stringify({at:new Date(f.clock()-31000).toISOString(),online:true}));assert.equal((await f.call('GET','/jobs/'+dispatched.id)).status,'blocked');await f.online();assert.equal((await f.call('GET','/jobs/'+dispatched.id)).status,'queued');
  await rename(join(f.queue,'requests'),join(f.queue,'requests-offline'));try{caps=await f.call('GET','/capabilities');assert.equal(caps.reason,'AI_DEVELOPMENT_QUEUE_UNAVAILABLE');job=await f.call('POST','/jobs',f.request());assert.equal(job.status,'blocked');}finally{await rename(join(f.queue,'requests-offline'),join(f.queue,'requests'));}
  await rename(f.configPath,f.configPath+'.offline');caps=await f.call('GET','/capabilities');assert.equal(caps.configured,false);assert.equal(caps.blocked,true);await f.call('POST','/jobs',f.request(),503);
 }finally{await f.close();}
});

test('AI development canonical binding uses sorted UTF8 with no implicit credential/session data',()=>{
 const expected='{"a":{"x":1,"z":"中文"},"b":[true,null]}';assert.equal(canonicalAiDevelopment({b:[true,null],a:{z:'中文',x:1}}),expected);assert.equal(aiDevelopmentHash({b:[true,null],a:{z:'中文',x:1}}),createHash('sha256').update(expected,'utf8').digest('hex'));
});

test('AI development queue requires installer-created directories and never fabricates readiness',async()=>{
 const f=await fixture({provisionQueue:false});try{
  const caps=await f.call('GET','/capabilities');assert.equal(caps.storageReady,false);assert.equal(caps.reason,'AI_DEVELOPMENT_QUEUE_UNAVAILABLE');
  const job=await f.call('POST','/jobs',f.request());assert.equal(job.status,'blocked');assert.equal(job.reason,'AI_DEVELOPMENT_QUEUE_UNAVAILABLE');
  await assert.rejects(stat(f.queue),{code:'ENOENT'});
 }finally{await f.close();}
});

test('AI development request remains group-readable with process umask 0077',{skip:process.platform==='win32'?'Windows has no POSIX file mode semantics':false},async()=>{
 const f=await fixture();const previous=process.umask(0o077);try{
  const job=await f.call('POST','/jobs',f.request());assert.equal(job.status,'queued');
  const path=join(f.queue,'requests',job.id+'.json'),info=await stat(path);assert.equal(info.mode&0o777,0o640);assert.equal(info.nlink,1);assert.equal((await f.rawJob(job.id)).bindingHash,job.bindingHash);
 }finally{process.umask(previous);await f.close();}
});

test('AI development periodic observation: exact machine/profile/policy bindings, latest selection and stale retain real values without jobs',async()=>{
 const f=await fixture();try{
  const job=await f.call('POST','/jobs',f.request()),result=await f.result(job);await f.call('GET','/jobs/'+job.id);f.setClock(f.clock()+1000);
  const folder=join(f.queue,'results','observations');await mkdir(folder);const path=join(folder,f.machine.id+'.json');
  const observation={schemaVersion:1,machineId:f.machine.id,nodeId:'112',address:f.machine.address,targetUser:'superopen',profileId:'linux-ai-dev-v1',profileRevision:1,profileHash:aiDevelopmentHash(f.policy.profiles[0]),policyHash:aiDevelopmentHash(f.policy),at:new Date(f.clock()).toISOString(),inventory:structuredClone(result.inventory),source:'fixed-ssh-ai-development-telemetry'};
  observation.inventory.terminalTelemetry.contextTokens=101;observation.inventory.resources.cpuPercent=25;
  for(const patch of [{machineId:f.company.id},{profileHash:'e'.repeat(64)},{policyHash:'f'.repeat(64)},{targetUser:'different-user'}]){await writeFile(path,JSON.stringify({...observation,...patch}));const detail=await f.call('GET','/machines/'+f.machine.id);assert.equal(detail.observation.source,'fixed-ai-development-worker');assert.equal(detail.observation.inventory.terminalTelemetry.contextTokens,100);}
  await writeFile(path,JSON.stringify(observation));let detail=await f.call('GET','/machines/'+f.machine.id);assert.equal(detail.observation.source,'fixed-ssh-ai-development-telemetry');assert.equal(detail.observation.inventory.terminalTelemetry.contextTokens,101);assert.equal(detail.resources.cpuPercent,25);assert.equal(detail.observation.stale,false);assert.equal(detail.jobs.length,1);
  f.setClock(f.clock()+121000);await f.online();detail=await f.call('GET','/machines/'+f.machine.id);assert.equal(detail.observation.stale,true);assert.equal(detail.observation.inventory.terminalTelemetry.contextTokens,101);assert.equal(detail.jobs.length,1);assert.equal(f.rt.governance.usageSummary({}).totals.records,0);
 }finally{await f.close();}
});
