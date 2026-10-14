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

test('cloud signed process observations bind device, unit, capability, freshness and replay; running never asserts application health',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-cloud-process-')),
 pi={initialize:async()=>{},dispose:async()=>{},health:()=>({configured:false})} as unknown as PiService,
 r=await createApp({dataDir:directory,pi,pythonExecutable:join(directory,'none'),whisperModelDirectory:join(directory,'none')});
 try{
  const machineId=randomUUID(),otherId=randomUUID(),serviceId=randomUUID();
  const h:DomainHandler={domain:'machines',commands:['fixture'],execute:(_c,_p,c)=>{
   const base={source:'manual',verification:'unverified_external',executionDispatched:false,createdAt:c.now,updatedAt:c.now};const m=c.create('machines',{...base,kind:'machine',name:'cloud',readOnly:false,status:'unknown'},machineId);
   c.create('machines',{...base,kind:'machine',name:'other',readOnly:false,status:'unknown'},otherId);
   c.create('services',{...base,kind:'service',name:'nginx',machineId,method:'systemd',entry:'systemd:nginx.service',health:'unknown',status:'registered',version:'existing'},serviceId);return m;
  }};
  r.v1!.execute(h,'fixture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},'server-admin',()=>undefined);
  const keys=generateKeyPairSync('ed25519'),pub=keys.publicKey.export({format:'pem',type:'spki'}).toString();
  function paired(machine:string,caps:string[]){const t=r.execution.issueTicket(machine,caps);return r.execution.pair(t.ticket,pub);}
  const agent=paired(machineId,['telemetry','service-status']),other=paired(otherId,['telemetry','service-status']),telemetry=paired(machineId,['telemetry']);
  const observation=()=>({serviceId,unit:'nginx.service',activeState:'active',subState:'running',observedAt:new Date().toISOString()});
  const request=(a:any,body:any,nonce=randomUUID())=>{const url=`/api/v1/agents/${a.agentId}/heartbeat`,timestamp=new Date().toISOString(),headers={'x-jarvis-timestamp':timestamp,'x-jarvis-nonce':nonce,'x-jarvis-signature':sign(null,Buffer.from(signedExecutionText('POST',url,timestamp,nonce,body)),keys.privateKey).toString('base64url')};return r.app.inject({method:'POST',url,headers,payload:body});};
  const body={metrics:{cpuPercent:0,memoryPercent:20,diskPercent:25,diskFreeGB:30,diskTotalGB:40},serviceProcesses:[observation()]},nonce=randomUUID();
  assert.equal((await request(agent,body,nonce)).statusCode,200);
  const record=r.v1!.read('services',serviceId,'server-admin')!;assert.equal(record.health,'unknown');assert.equal(record.processObservation.processStatus,'running');
  assert.equal(r.v1!.read('machines',machineId,'server-admin')!.telemetry.diskFreeGB,30);
  assert.equal((await request(agent,body,nonce)).statusCode,403);
  assert.equal((await request(other,{serviceProcesses:[observation()]})).statusCode,403);
  assert.equal((await request(telemetry,{serviceProcesses:[observation()]})).statusCode,403);
  assert.equal((await request(agent,{serviceProcesses:[{...observation(),unit:'ssh.service'}]})).statusCode,403);
  assert.equal((await request(agent,{serviceProcesses:[{...observation(),observedAt:new Date(Date.now()-40000).toISOString()}]})).statusCode,403);
  assert.equal((await request(agent,{serviceProcesses:[observation(),observation()]})).statusCode,403);
  assert.equal((await request(agent,{serviceProcesses:[{...observation(),unit:'nginx.service;reboot'}]})).statusCode,400);
  assert.equal((await request(agent,{serviceProcesses:[{...observation(),subState:'exited'}]})).statusCode,200);assert.equal(r.v1!.read('services',serviceId,'server-admin')!.processObservation.processStatus,'active');r.execution.revoke(agent.agentId);assert.equal((await request(agent,body)).statusCode,403);
  const history=r.execution.monitoring.query({kind:'machine',id:machineId});assert(history.points.some(p=>p.values.diskFreeGB?.average===30));
  r.store.setPassword('isolated-cloud-test-password');const login=r.store.createLogin(),read=await r.app.inject({url:'/api/v1/services/'+serviceId,headers:{cookie:'jarvis_session='+login}});assert.equal(read.statusCode,200,read.body);
 }finally{await r.app.close();assert(resolve(directory).startsWith(resolve(tmpdir())+sep));await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
