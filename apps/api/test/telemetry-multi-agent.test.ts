import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {createApp} from '../src/app.js';
import {signedExecutionText} from '../src/runtime/execution-runtime.js';
import type {DomainHandler} from '../src/v1/types.js';
import type {PiService} from '../src/pi.js';

const pi={initialize:async()=>{},dispose:async()=>{},health:()=>({configured:false})} as unknown as PiService;

test('signed multi-agent telemetry aggregates fresh per-agent snapshots, isolates machines, and removes revoked or omitted sources',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-telemetry-multi-agent-'));
 let runtime=await createApp({dataDir:directory,pi,webDir:join(directory,'none'),pythonExecutable:join(directory,'none'),whisperModelDirectory:join(directory,'none')});
 try{
  const machineId=randomUUID(),otherMachineId=randomUUID();
  const seed:DomainHandler={domain:'machines',commands:['multi-agent-telemetry-fixture'],execute:(_c,_p,c)=>{
   const base={source:'manual',verification:'unverified_external',executionDispatched:false,createdAt:c.now,updatedAt:c.now};
   const create=(id:string,name:string)=>c.create('machines',{...base,kind:'machine',name,category:'server',readOnly:false,status:'unknown'},id);
   create(machineId,'multi-agent telemetry fixture');create(otherMachineId,'isolated telemetry fixture');return c.require('machines',machineId);
  }};
  runtime.v1!.execute(seed,'multi-agent-telemetry-fixture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},'server-admin',()=>undefined);
  runtime.store.setPassword('isolated-multi-agent-test-password');
  const headers={cookie:'jarvis_session='+runtime.store.createLogin()};
  const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({format:'pem',type:'spki'}).toString();
  const pair=(id:string)=>runtime.execution.pair(runtime.execution.issueTicket(id,['telemetry']).ticket,publicKey);
  const contributor=pair(machineId),cpuAgent=pair(machineId),isolated=pair(otherMachineId);
  const send=(agentId:string,body:any)=>{
   const url=`/api/v1/agents/${agentId}/heartbeat`,timestamp=new Date().toISOString(),nonce=randomUUID();
   const signature=sign(null,Buffer.from(signedExecutionText('POST',url,timestamp,nonce,body)),keys.privateKey).toString('base64url');
   return runtime.app.inject({method:'POST',url,payload:body,headers:{'x-jarvis-timestamp':timestamp,'x-jarvis-nonce':nonce,'x-jarvis-signature':signature}});
  };
  const read=async(id:string)=>{
   const response=await runtime.app.inject({url:`/api/v1/machines/${id}`,headers});
   assert.equal(response.statusCode,200,response.body);return response.json().data;
  };
  const full={metrics:{diskPercent:0,diskFreeGB:0,diskTotalGB:512,cpuPercent:37,uptimeSec:0}};
  assert.equal((await send(contributor.agentId,full)).statusCode,200);
  await new Promise(resolve=>setTimeout(resolve,3));
  const first=await read(machineId);
  assert.equal(first.telemetry.diskPercent,0);
  assert.equal(first.telemetry.metricFreshness.diskPercent.agentId,contributor.agentId);
  assert.equal(first.telemetry.metricFreshness.diskPercent.timeBasis,'received');
  assert(Number.isFinite(Date.parse(first.telemetry.metricFreshness.diskPercent.observedAt)));

  const cpuOnly={metrics:{cpuPercent:0}};
  await new Promise(resolve=>setTimeout(resolve,3));
  assert.equal((await send(cpuAgent.agentId,cpuOnly)).statusCode,200);
  const aggregated=await read(machineId);
  assert.equal(aggregated.telemetry.diskTotalGB,512,'a different agent’s CPU-only snapshot must not erase disk');
  assert.equal(aggregated.telemetry.diskPercent,0,'zero is a present measurement');
  assert.equal(aggregated.telemetry.metricFreshness.diskPercent.agentId,contributor.agentId);
  assert.equal(aggregated.telemetry.cpuPercent,0);
  assert.equal(aggregated.telemetry.metricFreshness.cpuPercent.agentId,cpuAgent.agentId);
  assert.equal(aggregated.telemetry.metricFreshness.cpuPercent.timeBasis,'received');

  assert.equal((await send(contributor.agentId,{metrics:{cpuPercent:11}})).statusCode,200);
  const afterOmission=await read(machineId);
  assert.equal(afterOmission.telemetry.diskTotalGB,undefined,'an omitted metric in the same agent’s new full snapshot expires that source immediately');
  assert.equal(afterOmission.telemetry.metricFreshness.diskPercent,undefined);
  assert.equal(afterOmission.telemetry.cpuPercent,11,'the updated source wins while the other agent remains independently available');
  assert.equal(afterOmission.telemetry.metricFreshness.cpuPercent.agentId,contributor.agentId);

  assert.equal((await send(isolated.agentId,{metrics:{diskTotalGB:2048,cpuPercent:88}})).statusCode,200);
  assert.equal((await read(machineId)).telemetry.diskTotalGB,undefined,'a different machine’s readings never contribute');
  assert.equal((await read(otherMachineId)).telemetry.diskTotalGB,2048);

  // Repopulate a disk contribution, then verify revocation removes it on the next sanitizer/GET.
  assert.equal((await send(contributor.agentId,{metrics:{diskPercent:12,diskFreeGB:44,diskTotalGB:500,diskUsedGB:456}})).statusCode,200);
  assert.equal((await read(machineId)).telemetry.diskTotalGB,500);
  const revoked=await runtime.app.inject({method:'POST',url:`/api/v1/execution/agents/${contributor.agentId}/revoke`,headers,payload:{}});
  assert.equal(revoked.statusCode,200,revoked.body);
  const persisted=runtime.v1!.read('machines',machineId,'server-admin')!;
  const sanitized=runtime.execution.sanitizeMachine(persisted,Date.now());
  assert.equal(sanitized.telemetry.diskTotalGB,undefined);
  const afterRevoke=await read(machineId);
  assert.equal(afterRevoke.telemetry.diskPercent,undefined);
  assert.equal(afterRevoke.telemetry.diskFreeGB,undefined);
  assert.equal(afterRevoke.telemetry.diskTotalGB,undefined);
  assert.equal(afterRevoke.telemetry.diskUsedGB,undefined);
  assert.equal(afterRevoke.telemetry.metricFreshness.diskTotalGB,undefined);
  assert.equal(afterRevoke.telemetry.cpuPercent,0,'the non-revoked CPU contributor stays active');

  const isolatedAfter=await read(otherMachineId);
  assert.equal(isolatedAfter.telemetry.diskTotalGB,2048);
  assert.equal(runtime.execution.sanitizeMachine(runtime.v1!.read('machines',otherMachineId,'server-admin')!,Date.now()+60001).telemetry,undefined,'expired source readings are removed on sanitization');
  await runtime.app.close();runtime=await createApp({dataDir:directory,pi,webDir:join(directory,'none'),pythonExecutable:join(directory,'none'),whisperModelDirectory:join(directory,'none')});
  const afterRestart=runtime.execution.agents().find((item:any)=>item.id===isolated.agentId);
  assert.equal(afterRestart?.telemetry?.snapshotVersion,1,'the latest signed snapshot persists across runtime reopen');
  assert.equal(runtime.execution.sanitizeMachine(runtime.v1!.read('machines',otherMachineId,'server-admin')!,Date.now()).telemetry.diskTotalGB,2048);
 }finally{
  await runtime.app.close();assert(resolve(directory).startsWith(resolve(tmpdir())+sep));await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
});

test('heartbeat uptime accepts the full safe-integer range while other telemetry bounds stay strict and rejected beats do not touch lastSeen',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-telemetry-ranges-'));
 const runtime=await createApp({dataDir:directory,pi,webDir:join(directory,'none'),pythonExecutable:join(directory,'none'),whisperModelDirectory:join(directory,'none')});
 try{
  const machineId=randomUUID(),seed:DomainHandler={domain:'machines',commands:['telemetry-range-fixture'],execute:(_c,_p,c)=>c.create('machines',{source:'manual',verification:'unverified_external',executionDispatched:false,kind:'machine',name:'range fixture',category:'server',readOnly:false,status:'unknown',createdAt:c.now,updatedAt:c.now},machineId)};
  runtime.v1!.execute(seed,'telemetry-range-fixture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},'server-admin',()=>undefined);
  runtime.store.setPassword('isolated-telemetry-range-test-password');const headers={cookie:'jarvis_session='+runtime.store.createLogin()};
  const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({format:'pem',type:'spki'}).toString();
  const agent=runtime.execution.pair(runtime.execution.issueTicket(machineId,['telemetry']).ticket,publicKey);
  const send=(metrics:any)=>{const body={metrics},url=`/api/v1/agents/${agent.agentId}/heartbeat`,timestamp=new Date().toISOString(),nonce=randomUUID(),signature=sign(null,Buffer.from(signedExecutionText('POST',url,timestamp,nonce,body)),keys.privateKey).toString('base64url');return runtime.app.inject({method:'POST',url,payload:body,headers:{'x-jarvis-timestamp':timestamp,'x-jarvis-nonce':nonce,'x-jarvis-signature':signature}})};
  const readLastSeen=()=>runtime.execution.agents().find((item:any)=>item.id===agent.agentId)!.lastSeen;
  for(const uptimeSec of [10000000,10981939,1.25,Number.MAX_SAFE_INTEGER]){
   const response=await send({uptimeSec});assert.equal(response.statusCode,200,`uptimeSec=${uptimeSec}: ${response.body}`);
   assert.equal((await runtime.app.inject({url:`/api/v1/machines/${machineId}`,headers})).statusCode,200);
  }
  const baseline=readLastSeen();assert.equal(typeof baseline,'string');
  const invalid=[{uptimeSec:-1},{cpuPercent:101},{memoryPercent:101},{diskPercent:101},{gpuPercent:101},{powerWatts:10000000},{cpuPercent:10000000},{uptimeSec:Number.MAX_SAFE_INTEGER+1}];
  for(const metrics of invalid){
   const response=await send(metrics);assert.notEqual(response.statusCode,200,JSON.stringify(metrics));
   assert.equal(readLastSeen(),baseline,`rejected metrics must not mutate lastSeen: ${JSON.stringify(metrics)}`);
  }
 }finally{
  await runtime.app.close();assert(resolve(directory).startsWith(resolve(tmpdir())+sep));await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
});

test('monitor history counts a newly accepted sample once and does not increment on repeated query',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-telemetry-history-'));
 const runtime=await createApp({dataDir:directory,pi,webDir:join(directory,'none'),pythonExecutable:join(directory,'none'),whisperModelDirectory:join(directory,'none')});
 try{
  const machineId=randomUUID(),seed:DomainHandler={domain:'machines',commands:['telemetry-history-fixture'],execute:(_c,_p,c)=>c.create('machines',{source:'manual',verification:'unverified_external',executionDispatched:false,kind:'machine',name:'history fixture',category:'server',readOnly:false,status:'unknown',createdAt:c.now,updatedAt:c.now},machineId)};
  runtime.v1!.execute(seed,'telemetry-history-fixture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},'server-admin',()=>undefined);
  const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({format:'pem',type:'spki'}).toString(),agent=runtime.execution.pair(runtime.execution.issueTicket(machineId,['telemetry']).ticket,publicKey);
  const body={metrics:{cpuPercent:21}},url=`/api/v1/agents/${agent.agentId}/heartbeat`,timestamp=new Date().toISOString(),nonce=randomUUID(),signature=sign(null,Buffer.from(signedExecutionText('POST',url,timestamp,nonce,body)),keys.privateKey).toString('base64url');
  const accepted=await runtime.app.inject({method:'POST',url,payload:body,headers:{'x-jarvis-timestamp':timestamp,'x-jarvis-nonce':nonce,'x-jarvis-signature':signature}});assert.equal(accepted.statusCode,200,accepted.body);
  const query=()=>runtime.execution.monitoring.query({kind:'machine',id:machineId,window:'1h',points:20});
  const first=query(),again=query();assert.equal(first.totalObservations,1);assert.equal(again.totalObservations,first.totalObservations);
  const sample=first.points.flatMap((point:any)=>Object.values(point.values) as any[]).find((value:any)=>value?.average===21);
  assert.equal(sample.count,1);
 }finally{
  await runtime.app.close();assert(resolve(directory).startsWith(resolve(tmpdir())+sep));await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
});
