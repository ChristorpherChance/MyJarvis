import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {createApp} from '../src/app.js';
import {assertDto,validateDto} from '../src/v1/contract.js';
import {signedExecutionText} from '../src/runtime/execution-runtime.js';
import type {DomainHandler} from '../src/v1/types.js';
import type {PiService} from '../src/pi.js';

const require=createRequire(import.meta.url),apply=require('../../../scripts/telemetry-contract.cjs');
const contractFile=fileURLToPath(new URL('../../../docs/openapi-v1-planned.json',import.meta.url));
const scriptFile=fileURLToPath(new URL('../../../scripts/update-runtime-contract.cjs',import.meta.url));
const readContract=()=>JSON.parse(readFileSync(contractFile,'utf8'));

test('runtime regeneration retains strict telemetry, NAS, power and service-resource references across repeated merges',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-telemetry-contract-'));
 try{
  const original=readContract();await mkdir(join(directory,'docs'));
  await writeFile(join(directory,'docs/openapi-v1-planned.json'),JSON.stringify(original));
  for(let iteration=0;iteration<2;iteration++){
   const result=spawnSync(process.execPath,[scriptFile],{cwd:directory,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);
   const regenerated=JSON.parse(await readFile(join(directory,'docs/openapi-v1-planned.json'),'utf8')),s=regenerated.components.schemas;
   for(const [name,property,target]of [['InfrastructureRecord','telemetry','QnapStorageReading'],['ExecutionHeartbeatInput','storage','QnapStorageSample']]as const){
    const value=name==='InfrastructureRecord'?s[name].properties[property].properties.storage:s[name].properties[property];
    assert.equal(value.$ref,'#/components/schemas/'+target);
   }
   for(const name of ['ServiceProcessInput','ServiceProcessObservation']){assert.equal(s[name].properties.resources.$ref,'#/components/schemas/ServiceResourceMetrics');assert.equal(s[name].additionalProperties,false);}
   for(const object of [s.InfrastructureRecord.properties.telemetry,s.ExecutionHeartbeatInput]){
    assert.equal(object.additionalProperties,false);assert.equal(object.properties.cpuPower.$ref,'#/components/schemas/CpuPowerSample');
    for(const name of ['metricSources','metricMeasuredAt'])assert.equal(object.properties[name].additionalProperties,false);
   }
   for(const name of ['gpuPercent','powerWatts'])assert(s.InfrastructureRecord.properties.telemetry.properties[name]);
   assert.equal(s.InfrastructureRecord.properties.telemetry.properties.metricFreshness.additionalProperties,false);
   assert.equal(s.ExecutionHeartbeatInput.properties.metrics.properties.uptimeSec.maximum,Number.MAX_SAFE_INTEGER);
   const values=s.MonitorPoint.properties.values;assert.equal(values.additionalProperties,false);
   for(const name of ['diskPercent','diskFreeGB','diskTotalGB','diskUsedGB','cpuPackageWatts'])assert(values.required.includes(name));
   for(const name of ['QnapStorageSample','QnapStorageReading','PiModelSettings','BillDocument'])assert.deepEqual(s[name],original.components.schemas[name],`${name} was unintentionally replaced`);
   assert.deepEqual(apply(structuredClone(regenerated)),regenerated,'augmentation must be idempotent');
  }
 }finally{assert(resolve(directory).startsWith(resolve(tmpdir())+sep));await rm(directory,{recursive:true,force:true});}
});

test('strict heartbeat contract permits configured measurements and resources, but rejects forged extra fields and range errors',()=>{
 const measured=new Date().toISOString(),body={metrics:{cpuPercent:10,memoryPercent:20,gpuPercent:30,powerWatts:40},observationVersion:1,metricSources:{gpuPercent:'gpu-source',powerWatts:'meter-source'},metricMeasuredAt:{gpuPercent:measured,powerWatts:measured},cpuPower:{source:'intel-rapl',watts:5,observedAt:measured,windowSeconds:2},serviceProcesses:[{serviceId:'service',unit:'jarvis.service',activeState:'active',subState:'running',observedAt:measured,resources:{cpuPercent:4,memoryUsedGB:0.1,directory:'/srv/jarvis',diskUsedGB:2,diskObservedAt:measured}}]};
 assertDto('ExecutionHeartbeatInput',body);
 assertDto('ExecutionHeartbeatInput',{metrics:{uptimeSec:10981939.5}});
 assert.equal(validateDto('ExecutionHeartbeatInput',{metrics:{uptimeSec:Number.MAX_SAFE_INTEGER+1}}).valid,false);
 const invalid=[{...body,unexpected:true},{...body,metrics:{...body.metrics,gpuPercent:101}},{...body,metrics:{...body.metrics,powerWatts:10000000}},{...body,metricSources:{gpuPercent:'x'.repeat(201)}},{...body,metricMeasuredAt:{gpuPercent:'not-a-date'}},{...body,cpuPower:{...body.cpuPower,source:'unverified-meter'}},{...body,serviceProcesses:[{...body.serviceProcesses[0],resources:{memoryUsedGB:100001}}]},{...body,serviceProcesses:[{...body.serviceProcesses[0],resources:{command:'run-anything'}}]}];
 for(const input of invalid)assert.equal(validateDto('ExecutionHeartbeatInput',input).valid,false);
 assert.equal(validateDto('ServiceResourceMetrics',{directory:'relative/path'}).valid,false);
 assert.equal(validateDto('InfrastructureRecord',{unexpected:true}).valid,false);
});

test('signed actual heartbeat commits complete machine and service DTOs, NAS detail and empty/measured monitoring history',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-telemetry-runtime-')),pi={initialize:async()=>{},dispose:async()=>{},health:()=>({configured:false})}as unknown as PiService;
 const runtime=await createApp({dataDir:directory,pi,webDir:join(directory,'none'),pythonExecutable:join(directory,'none'),whisperModelDirectory:join(directory,'none')});
 try{
  const machineId=randomUUID(),nasId=randomUUID(),serviceId=randomUUID();
  const seed:DomainHandler={domain:'machines',commands:['telemetry-fixture'],execute:(_c,_p,c)=>{
   const base={source:'manual',verification:'unverified_external',executionDispatched:false,createdAt:c.now,updatedAt:c.now};
   const machine=c.create('machines',{...base,kind:'machine',name:'fixture physical node',category:'server',address:'192.168.77.20',cpu:'i5-7400',readOnly:false,status:'unknown'},machineId);
   c.create('machines',{...base,kind:'machine',name:'fixture NAS',category:'storage',readOnly:false,status:'unknown'},nasId);
   c.create('services',{...base,kind:'service',name:'fixture service',machineId,method:'systemd',entry:'systemd:jarvis.service',health:'unknown',status:'registered',version:'fixture'},serviceId);return machine;
  }};
  runtime.v1!.execute(seed,'telemetry-fixture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},'server-admin',()=>undefined);
  runtime.store.setPassword('isolated-telemetry-test-password');const headers={cookie:'jarvis_session='+runtime.store.createLogin()};
  const power=await runtime.app.inject({method:'PUT',url:'/api/runtime/power/profiles',headers,payload:{expectedVersion:0,profiles:[{machineId,cpuModel:'i5-7400',tdpWatts:65,dimmCount:4,ssdCount:1,hddCount:0,evidence:'isolated fixture'}]}});assert.equal(power.statusCode,200,power.body);
  const configuration=runtime.execution.observability.configure({expectedVersion:0,logSources:[],hardwareSources:[{id:'gpu-source',machineId,field:'gpuPercent',adapterId:'fixture-gpu',enabled:true},{id:'meter-source',machineId,field:'powerWatts',adapterId:'fixture-meter',enabled:true}]});
  const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({format:'pem',type:'spki'}).toString();
  const pair=(id:string,caps:string[])=>runtime.execution.pair(runtime.execution.issueTicket(id,caps).ticket,publicKey);
  const agent=pair(machineId,['telemetry','service-status']),nas=pair(nasId,['telemetry']);
  const send=(id:string,body:any)=>{const url=`/api/v1/agents/${id}/heartbeat`,timestamp=new Date().toISOString(),nonce=randomUUID();return runtime.app.inject({method:'POST',url,payload:body,headers:{'x-jarvis-timestamp':timestamp,'x-jarvis-nonce':nonce,'x-jarvis-signature':sign(null,Buffer.from(signedExecutionText('POST',url,timestamp,nonce,body)),keys.privateKey).toString('base64url')}});};
  assert.equal((await send(agent.agentId,{metrics:{cpuPercent:1}})).statusCode,200);
  const read=async(domain:string,id:string)=>{const response=await runtime.app.inject({url:`/api/v1/${domain}/${id}`,headers});assert.equal(response.statusCode,200,response.body);assertDto('InfrastructureRecord',response.json().data);return response.json().data;};
  const ordinary=await read('machines',machineId);assert.deepEqual(ordinary.telemetry.metricSources,{});assert.deepEqual(ordinary.telemetry.metricMeasuredAt,{});
  const measured=new Date().toISOString(),body={metrics:{cpuPercent:12,gpuPercent:25,powerWatts:75},observationVersion:configuration.version,metricSources:{gpuPercent:'gpu-source',powerWatts:'meter-source'},metricMeasuredAt:{gpuPercent:measured,powerWatts:measured},cpuPower:{source:'intel-rapl',watts:8,observedAt:measured,windowSeconds:2},serviceProcesses:[{serviceId,unit:'jarvis.service',activeState:'active',subState:'running',observedAt:measured,resources:{cpuPercent:3,memoryUsedGB:.1,directory:'/srv/fixture',diskUsedGB:2,diskObservedAt:measured}}]};
  const detailed=await send(agent.agentId,body);assert.equal(detailed.statusCode,200,detailed.body);
  const machine=await read('machines',machineId),service=await read('services',serviceId);assert.equal(machine.telemetry.cpuPower.watts,8);assert.equal(machine.telemetry.gpuPercent,25);assert.equal(machine.telemetry.powerWatts,75);assert.equal(service.processObservation.resources.diskUsedGB,2);assert.equal(service.health,'unknown');
  const storage={kind:'qnap',model:'fixture NAS',systemVersion:'5.2.6',build:'20250715',observedAt:new Date().toISOString(),disks:[],volumes:[{id:1,mount:'/share/CACHEDEV1_DATA',totalGB:1000,usedGB:100,freeGB:900}]};
  assertDto('ExecutionHeartbeatInput',{storage});const nasBeat=await send(nas.agentId,{storage});assert.equal(nasBeat.statusCode,200,nasBeat.body);const savedNas=await read('machines',nasId);assert.equal(savedNas.telemetry.storage.metrics.diskTotalGB,1000);assert.equal(savedNas.telemetry.storage.source,'signed-agent-qnap');
  for(const [kind,id]of [['machine',machineId],['machine',nasId],['service',serviceId],['service','empty-fixture']]as const){const history=runtime.execution.monitoring.query({kind,id,points:20});assertDto('MonitorSnapshot',history);assert(Object.hasOwn(history.points[0].values,'diskUsedGB'));}
  const endpoint=await runtime.app.inject({url:`/api/v1/execution/monitoring?kind=machine&id=${nasId}&points=20`,headers});assert.equal(endpoint.statusCode,200,endpoint.body);assertDto('MonitorResponse',endpoint.json());
 }finally{await runtime.app.close();assert(resolve(directory).startsWith(resolve(tmpdir())+sep));await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
