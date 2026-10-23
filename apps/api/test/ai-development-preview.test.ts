import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';
import {aiDevelopmentHash} from '../src/runtime/ai-development.js';
import {compareAiDevelopment} from '../src/runtime/ai-development-preview.js';

const profile={id:'linux-ai-dev-v1',revision:1,name:'Linux AI开发',tools:[{name:'claude',version:'2.1.292'},{name:'ccswitch',version:'4.0'}],providers:[{id:'fixture',name:'Fixture Provider',model:'fixture-model',credentialConfigured:false}],statuslineVersion:'1'};
const inventory=()=>({schemaVersion:1,tools:[{name:'claude',installed:true,version:'2.1.292',path:'/secret/private/path',authStatus:'configured' as const},{name:'cc-switch',installed:true,version:'4.0',path:'/secret/other/path'}],providers:[{id:'fixture',name:'Fixture Provider',model:'fixture-model',credentialConfigured:true,current:true},{id:'extra',name:'Extra private provider',model:'private-model',credentialConfigured:true}],statusline:{configured:true,diagnosticsVersion:1 as const,layers:{script:'match' as const,global:'different' as const,common:'missing' as const,currentProvider:'unknown' as const},providers:{total:2,matched:0,missing:1,different:1,invalid:0,unknown:0},reasonCodes:['STATUSLINE_SCRIPT_MATCH','STATUSLINE_GLOBAL_DIFFERENT','STATUSLINE_COMMON_MISSING','STATUSLINE_CURRENT_PROVIDER_UNKNOWN','STATUSLINE_PROVIDER_COUNT_MISSING','STATUSLINE_PROVIDER_COUNT_DIFFERENT']} ,resources:{ramUsedBytes:4096},terminalTelemetry:{schemaVersion:1 as const,observedAt:new Date(0).toISOString(),sessionId:null,model:'private-model',provider:null,contextTokens:40,contextWindow:1000,currentInputTokens:1,currentOutputTokens:1,cacheReadTokens:0,cacheCreationTokens:null,sessionCostUSD:null,billingStatus:'unknown' as const,rateLimitFiveHourPercent:null,rateLimitSevenDayPercent:null}});

async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'jarvis-ai-preview-')),queue=join(dir,'queue'),configPath=join(dir,'policy.json');let now=Date.now();
 await mkdir(join(queue,'requests'),{recursive:true});await mkdir(join(queue,'results'));
 const rt=await createApp({dataDir:dir,aiDevelopment:{queue,configPath,now:()=>now},pi:{initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{}} as unknown as PiService,webDir:join(dir,'none')});
 rt.store.setPassword('isolated-preview-test-password');const token=rt.store.createLogin(),headers={cookie:'jarvis_session='+token};
 const inject=async(method:string,url:string,body?:unknown,expected=200)=>{const r=await rt.app.inject({method:method as any,url,headers,payload:body});assert.equal(r.statusCode,expected,r.body);return r};
 const register=async(name:string,scope='personal')=>{const r=await inject('POST','/api/v1/machines/commands/register',{commandId:randomUUID(),scope,expectedVersion:0,payload:{name,role:'test',category:'server',ram:16,cpu:'fixture',disk:'fixture',gpu:'unknown',os:'linux',address:scope==='company'?'192.0.2.2':'192.0.2.1',room:'test',always:false}});return r.json().data;};
 const machine=await register('preview-machine'),company=await register('preview-company','company');
 const policy={version:1,profiles:[structuredClone(profile)],nodes:[{machineId:machine.id,nodeId:'node112',address:machine.address,targetUser:'superopen',profileIds:[profile.id]},{machineId:company.id,nodeId:'company',address:company.address,targetUser:'devuser',profileIds:[profile.id]}]};
 const save=()=>writeFile(configPath,JSON.stringify(policy));await save();
 const online=()=>writeFile(join(queue,'results','_status.json'),JSON.stringify({at:new Date(now).toISOString(),online:true}));await online();
 const base='/api/runtime/ai-development',previewUrl=(id=machine.id,mode='supplement')=>{const hash=aiDevelopmentHash(policy.profiles[0]);return `${base}/machines/${id}/preview?profileId=${profile.id}&expectedMachineVersion=${machine.revision}&expectedProfileRevision=${profile.revision}&expectedProfileHash=${hash}&mode=${mode}`;};
 const addJob=async()=>{const created=await inject('POST',base+'/jobs',{commandId:randomUUID(),machineId:machine.id,action:'probe',profileId:profile.id,expectedMachineVersion:machine.revision,expectedProfileRevision:profile.revision});return JSON.parse(String(rt.identity.db.prepare('SELECT json FROM runtime_ai_development_jobs WHERE id=?').get(created.json().id)!.json));};
 const persistReceipt=async(job:any,patch:any={})=>{const request=JSON.parse(await readFile(join(queue,'requests',job.id+'.json'),'utf8'));const receipt={schemaVersion:1,id:job.id,machineId:job.machineId,profileId:request.profileId,profileRevision:request.profileRevision,profileHash:request.profileHash,bindingHash:job.bindingHash,status:'succeeded',at:new Date(now).toISOString(),summary:'fixture completed',inventory:inventory(),...patch};await writeFile(join(queue,'results',job.id+'.json'),JSON.stringify(receipt));return receipt;};
 return {dir,queue,configPath,rt,headers,inject,machine,company,policy,save,online,base,previewUrl,addJob,persistReceipt,setNow:(v:number)=>now=v,now:()=>now,close:async()=>{await rt.app.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}};
}

test('preview returns a current authorized persisted receipt, both modes, and never exposes private inventory',async()=>{
 const f=await fixture();try{
  const job=await f.addJob();await f.persistReceipt(job);await f.inject('GET',f.base+'/jobs/'+job.id);
  const preview=await f.inject('GET',f.previewUrl());const value=preview.json();
  assert.equal(value.status,'available');assert.equal(value.readOnly,true);assert.equal(value.applySupported,false);assert.equal(value.mode,'supplement');assert.equal(value.observation.source,'fixed-ai-development-worker');assert.equal(value.observation.binding,'machine-revision-verified');
  assert.equal(value.items.find((i:any)=>i.category==='tool'&&i.key==='claude').status,'match');
  assert.equal(value.items.find((i:any)=>i.category==='tool'&&i.key==='ccswitch').status,'match');
  assert.equal(value.items.find((i:any)=>i.category==='provider'&&i.key==='fixture').status,'match');
  assert.equal(value.items.find((i:any)=>i.category==='provider'&&i.key==='extra').intent,'preserve');
  assert.equal(value.items.find((i:any)=>i.key==='global').intent,'preserve');
  assert.equal((await f.inject('GET',f.previewUrl())).json().basisHash,value.basisHash);
  const reconcile=(await f.inject('GET',f.previewUrl(f.machine.id,'reconcile'))).json();assert.equal(reconcile.mode,'reconcile');assert.equal(reconcile.items.find((i:any)=>i.key==='global').intent,'adjust');
  const serialized=JSON.stringify(value);for(const secret of ['/secret/private/path','/secret/other/path','private-model','Extra private provider','ramUsedBytes','contextTokens','Fixture Provider'])assert(!serialized.includes(secret),`preview leaked ${secret}`);
  assert.match(preview.headers['cache-control']??' ',/private/);assert.match(preview.headers['cache-control']??' ',/no-store/);
 }finally{await f.close();}
});

test('preview is strictly read-only: queued/in-progress jobs, audit, requests, and stored job rows do not change',async()=>{
 const f=await fixture();try{
  const queued=await f.addJob();const before=String(f.rt.identity.db.prepare('SELECT json FROM runtime_ai_development_jobs WHERE id=?').get(queued.id)!.json);const auditBefore=f.rt.identity.db.prepare('SELECT COUNT(*) AS n FROM audit').get() as any;
  const requestsBefore=await readdir(join(f.queue,'requests'));const first=await f.inject('GET',f.previewUrl());
  assert.equal(first.json().status,'unavailable');assert.deepEqual(await readdir(join(f.queue,'requests')),requestsBefore);
  const row=String(f.rt.identity.db.prepare('SELECT json FROM runtime_ai_development_jobs WHERE id=?').get(queued.id)!.json);assert.equal(row,before);
  const auditAfter=f.rt.identity.db.prepare('SELECT COUNT(*) AS n FROM audit').get() as any;assert.equal(auditAfter.n,auditBefore.n);
  const tables=f.rt.identity.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r:any)=>String(r.name));
  const snapshotDb=()=>Object.fromEntries(tables.map(name=>[name,f.rt.identity.db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all()]));
  const snapshotFiles=async()=>{const values:Record<string,string>={};const visit=async(path:string)=>{for(const entry of await readdir(path,{withFileTypes:true})){const file=join(path,entry.name);if(entry.isDirectory())await visit(file);else values[file]=await readFile(file,'utf8');}};await visit(f.queue);values[f.configPath]=await readFile(f.configPath,'utf8');return values;};
  const databaseBefore=snapshotDb(),filesBefore=await snapshotFiles();await f.inject('GET',f.previewUrl());assert.deepEqual(snapshotDb(),databaseBefore);assert.deepEqual(await snapshotFiles(),filesBefore);
  const running=await f.addJob();const req=JSON.parse(await readFile(join(f.queue,'requests',running.id+'.json'),'utf8'));await writeFile(join(f.queue,'results',running.id+'.json'),JSON.stringify({schemaVersion:1,id:running.id,machineId:running.machineId,profileId:req.profileId,profileRevision:req.profileRevision,profileHash:req.profileHash,bindingHash:running.bindingHash,status:'running',at:new Date(f.now()).toISOString()}));
  await f.inject('GET',f.base+'/jobs/'+running.id);const runningRow=String(f.rt.identity.db.prepare('SELECT json FROM runtime_ai_development_jobs WHERE id=?').get(running.id)!.json);
  const prev=await f.inject('GET',f.previewUrl());assert.equal(prev.json().status,'unavailable');assert.equal(String(f.rt.identity.db.prepare('SELECT json FROM runtime_ai_development_jobs WHERE id=?').get(running.id)!.json),runningRow);
 }finally{await f.close();}
});

test('preview rejects unauthorized, read-only, stale-version, wrong-hash, and unauthorized template requests',async()=>{
 const f=await fixture();try{
  const url=f.previewUrl();assert.equal((await f.rt.app.inject({method:'GET',url:`/api/runtime/ai-development/machines/${f.machine.id}/preview?profileId=${profile.id}&expectedMachineVersion=${f.machine.revision}&expectedProfileRevision=1&expectedProfileHash=${aiDevelopmentHash(profile)}&mode=supplement`})).statusCode,401);
  assert.equal((await f.inject('GET',f.previewUrl(f.company.id),undefined,403)).statusCode,403);
  assert.equal((await f.inject('GET',url+'&credentials=must-not-be-accepted',undefined,400)).statusCode,400);
  assert.equal((await f.inject('GET',url.replace('expectedProfileRevision=1','expectedProfileRevision=2'),undefined,409)).statusCode,409);
  const badMachine=url.replace(`expectedMachineVersion=${f.machine.revision}`,`expectedMachineVersion=${f.machine.revision+1}`);assert.equal((await f.inject('GET',badMachine,undefined,409)).statusCode,409);
  const badHash=url.replace(aiDevelopmentHash(profile),'a'.repeat(64));assert.equal((await f.inject('GET',badHash,undefined,409)).statusCode,409);
  f.policy.profiles.push({...structuredClone(profile),id:'other-profile'});await f.save();const unauthorizedTemplate=url.replace(`profileId=${profile.id}`,'profileId=other-profile').replace(`expectedProfileHash=${aiDevelopmentHash(profile)}`,`expectedProfileHash=${aiDevelopmentHash(f.policy.profiles[1])}`);assert.equal((await f.inject('GET',unauthorizedTemplate,undefined,503)).statusCode,503);
 }finally{await f.close();}
});

test('preview binds current address policy and profile, does not use mismatched receipts',async()=>{
 const f=await fixture();try{
  const job=await f.addJob();await f.persistReceipt(job);f.policy.nodes[0].address='192.0.2.44';await f.save();
  assert.equal((await f.inject('GET',f.previewUrl(),undefined,409)).statusCode,409);
 }finally{await f.close();}
});

test('preview chooses only authorized valid persisted succeeded jobs; provider absence stays unknown and periodic data is reference-only',async()=>{
 const f=await fixture();try{
  const job=await f.addJob();await f.persistReceipt(job,{inventory:{...inventory(),providers:[]}});await f.inject('GET',f.base+'/jobs/'+job.id);
  const preview=(await f.inject('GET',f.previewUrl())).json();assert.equal(preview.status,'available');assert.equal(preview.items.find((i:any)=>i.category==='provider'&&i.key==='fixture').status,'unknown');
  const request=JSON.parse(await readFile(join(f.queue,'requests',job.id+'.json'),'utf8'));const receipt=JSON.parse(await readFile(join(f.queue,'results',job.id+'.json'),'utf8'));receipt.profileHash='f'.repeat(64);await writeFile(join(f.queue,'results',job.id+'.json'),JSON.stringify(receipt));
  // Preview reads persisted accepted jobs only, not changed receipt files.
  assert.equal((await f.inject('GET',f.previewUrl())).json().status,'available');
  const observations=join(f.queue,'results','observations');await mkdir(observations);const validPeriodic={schemaVersion:1,machineId:f.machine.id,nodeId:'node112',address:f.machine.address,targetUser:'superopen',profileId:profile.id,profileRevision:profile.revision,profileHash:aiDevelopmentHash(profile),policyHash:aiDevelopmentHash(f.policy),at:new Date(f.now()).toISOString(),inventory:inventory(),source:'fixed-ssh-ai-development-telemetry'};await writeFile(join(observations,f.machine.id+'.json'),JSON.stringify(validPeriodic));
  // Current-revision succeeded job takes precedence over periodic legacy reference.
  const ref=(await f.inject('GET',f.previewUrl())).json();assert.equal(ref.status,'available');
  const staleJob=await f.addJob();await f.persistReceipt(staleJob);await f.inject('GET',f.base+'/jobs/'+staleJob.id);f.setNow(f.now()+121000);
  const periodicOnly=(await f.inject('GET',f.previewUrl())).json();assert.equal(periodicOnly.status,'reference-only');assert.equal(periodicOnly.reason,'OBSERVATION_STALE');assert.equal(periodicOnly.observation.binding,'machine-revision-verified');
 }finally{await f.close();}
});

test('preview expires after 120 seconds, excludes future observations, and only compares current policy bindings',async()=>{
 const f=await fixture();try{
  const job=await f.addJob();await f.persistReceipt(job);await f.inject('GET',f.base+'/jobs/'+job.id);f.setNow(f.now()+121000);
  const stale=(await f.inject('GET',f.previewUrl())).json();assert.equal(stale.status,'reference-only');assert.equal(stale.reason,'OBSERVATION_STALE');
  f.setNow(f.now()-200000);const future=(await f.inject('GET',f.previewUrl())).json();assert.equal(future.status,'unavailable');assert.equal(future.observation,null);
 }finally{await f.close();}
});

test('preview never upgrades legacy periodic evidence to current and rechecks persisted authorization and binding',async()=>{
 const f=await fixture();try{
  const observations=join(f.queue,'results','observations');await mkdir(observations);
  const periodic={schemaVersion:1,machineId:f.machine.id,nodeId:'node112',address:f.machine.address,targetUser:'superopen',profileId:profile.id,profileRevision:1,profileHash:aiDevelopmentHash(profile),policyHash:aiDevelopmentHash(f.policy),at:new Date(f.now()).toISOString(),inventory:inventory(),source:'fixed-ssh-ai-development-telemetry'};
  await writeFile(join(observations,f.machine.id+'.json'),JSON.stringify(periodic));
  const reference=(await f.inject('GET',f.previewUrl())).json();assert.equal(reference.status,'reference-only');assert.equal(reference.reason,'MACHINE_REVISION_UNVERIFIED');assert(reference.items.filter((i:any)=>i.status!=='unmanaged').every((i:any)=>i.status==='unknown'));
  await rm(join(observations,f.machine.id+'.json'));
  const job=await f.addJob();await f.persistReceipt(job);await f.inject('GET',f.base+'/jobs/'+job.id);
  const saved=JSON.parse(String(f.rt.identity.db.prepare('SELECT json FROM runtime_ai_development_jobs WHERE id=?').get(job.id)!.json));
  for(const patch of [{authorizationHash:'f'.repeat(64)},{machineRevision:999},{profileHash:'e'.repeat(64)},{bindingHash:'d'.repeat(64)},{result:{...saved.result,bindingHash:'c'.repeat(64)}}]){
   f.rt.identity.db.prepare('UPDATE runtime_ai_development_jobs SET json=? WHERE id=?').run(JSON.stringify({...saved,...patch}),job.id);
   assert.equal((await f.inject('GET',f.previewUrl())).json().status,'unavailable');
  }
  f.rt.identity.db.prepare('UPDATE runtime_ai_development_jobs SET json=? WHERE id=?').run(JSON.stringify(saved),job.id);
  const principal=f.rt.identity.principal({cookies:{jarvis_session:f.headers.cookie.split('=')[1]}} as any);
  assert.throws(()=>f.rt.aiDevelopment.preview({...principal,administrator:false},f.machine.id,{}),/管理员/);
  assert.throws(()=>f.rt.aiDevelopment.preview({...principal,actorId:'other-owner'},f.machine.id,{profileId:profile.id,expectedMachineVersion:f.machine.revision,expectedProfileRevision:1,expectedProfileHash:aiDevelopmentHash(profile),mode:'supplement'}),/设备不存在/);
  f.rt.store.deleteLogin(f.headers.cookie.split('=')[1]);assert.equal((await f.rt.app.inject({method:'GET',url:f.previewUrl(),headers:f.headers})).statusCode,401);
 }finally{await f.close();}
});

test('pure comparator handles null/alias tool versions, same-name different-ID providers, legacy and zero-provider diagnostics',()=>{
 const p={...structuredClone(profile),tools:[{name:'ccswitch',version:'4.0'},{name:'claude',version:'2.1.292'}],providers:[{id:'fixture',name:'Same Name',model:'fixture-model',credentialConfigured:false}]};
 const base:any={schemaVersion:1,tools:[{name:'cc-switch',installed:true,version:null},{name:'claude',installed:true,version:'2.1.292'}],providers:[{id:'other-id',name:'Same Name',model:'fixture-model',credentialConfigured:true}],statusline:{configured:true}};
 let items=compareAiDevelopment(p,base,'supplement',true);assert.equal(items.find(i=>i.category==='tool'&&i.key==='ccswitch')?.status,'unknown');assert.equal(items.find(i=>i.category==='provider'&&i.key==='fixture')?.status,'unknown');assert.equal(items.find(i=>i.category==='provider'&&i.key==='fixture')?.reason,'PROVIDER_ID_NAME_CONFLICT');
 base.providers=[];items=compareAiDevelopment(p,base,'reconcile',true);assert.equal(items.find(i=>i.category==='provider'&&i.key==='fixture')?.status,'unknown');assert.equal(items.find(i=>i.key==='providers')?.reason,'STATUSLINE_NOT_OBSERVED');
 const aliases:any={...base,tools:[{name:'cc-switch',installed:true,version:'4.0'},{name:'ccswitch',installed:true,version:'4.0'},{name:'claude',installed:true,version:'2.1.292'}]};items=compareAiDevelopment(p,aliases,'supplement',true);assert.equal(items.find(i=>i.category==='tool'&&i.key==='ccswitch')?.status,'match');
 aliases.tools[1].version='different';items=compareAiDevelopment(p,aliases,'supplement',true);assert.equal(items.find(i=>i.category==='tool'&&i.key==='ccswitch')?.status,'unknown');assert.equal(items.find(i=>i.category==='tool'&&i.key==='ccswitch')?.reason,'AMBIGUOUS_TOOL');
 const duplicateProfile={...p,tools:[...p.tools,{...p.tools[1]}],providers:[...p.providers,{...p.providers[0]}]};items=compareAiDevelopment(duplicateProfile,{...aliases,tools:[{name:'cc-switch',installed:true,version:'4.0'},{name:'claude',installed:true,version:'2.1.292'}],providers:[{id:'fixture',name:'Same Name',model:'fixture-model',credentialConfigured:true}]},'supplement',true);assert.equal(items.filter(i=>i.category==='tool'&&i.key==='claude').every(i=>i.status==='unknown'),true);assert.equal(items.filter(i=>i.category==='provider'&&i.key==='fixture').every(i=>i.status==='unknown'),true);
 base.statusline={configured:true,diagnosticsVersion:1,layers:{script:'match',global:'unknown',common:'missing',currentProvider:'not-applicable'},providers:{total:0,matched:0,missing:0,different:0,invalid:0,unknown:0}};
 items=compareAiDevelopment(p,base,'reconcile',true);assert.equal(items.find(i=>i.key==='providers')?.status,'unknown');assert.equal(items.find(i=>i.key==='providers')?.reason,'STATUSLINE_ZERO_PROVIDERS');
});
