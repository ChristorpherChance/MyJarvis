import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qnapStorageSample,qnapStorageReading} from '../src/runtime/qnap-storage.js';
import {assertDto} from '../src/v1/contract.js';
const time=Date.now();
const sample=()=>({kind:'qnap',model:'TS-453Dmini',systemVersion:'5.2.6',build:'20250715',observedAt:new Date(time).toISOString(),disks:[{slot:1,type:'ssd',model:'Example SSD',capacityGB:931}],volumes:[{id:1,mount:'/share/CACHEDEV1_DATA',totalGB:600,usedGB:60,freeGB:535},{id:2,mount:'/share/CACHEDEV2_DATA',totalGB:7200,usedGB:3600,freeGB:3500}]});
test('NAS aggregates unique data volumes rather than the QTS root RAM disk',()=>{const s=qnapStorageReading({category:'storage'},['telemetry'],sample(),time)!;assert.equal(s.metrics.diskTotalGB,7800);assert.equal(s.metrics.diskFreeGB,4035);assert.equal(s.metrics.diskPercent,46.923);assert.equal(s.source,'signed-agent-qnap');assert.equal(s.volumes.length,2);});
test('NAS readings reject duplicate IDs, system roots, impossible capacity, and stale measurements',()=>{const s=sample();assert.throws(()=>qnapStorageSample.parse({...s,volumes:[s.volumes[0],s.volumes[0]]}));assert.throws(()=>qnapStorageSample.parse({...s,volumes:[{...s.volumes[0],mount:'/'}]}));assert.throws(()=>qnapStorageSample.parse({...s,volumes:[{...s.volumes[0],freeGB:601}]}));assert.throws(()=>qnapStorageReading({category:'storage'},['telemetry'],s,time+61000));assert.throws(()=>qnapStorageSample.parse({...s,disks:[s.disks[0],s.disks[0]]}));});
test('NAS reads require a storage machine and telemetry permission, while ordinary heartbeats remain compatible',()=>{assert.throws(()=>qnapStorageReading({category:'server'},['telemetry'],sample(),time));assert.throws(()=>qnapStorageReading({category:'storage'},[],sample(),time));assert.equal(qnapStorageReading(undefined,[],undefined,time),undefined);});
function extended(){const health={state:'unsupported',source:'qts-smart-cache',temperatureC:null,observedAt:new Date(time).toISOString(),attributes:[]};return {...sample(),protectionObservedAt:new Date(time).toISOString(),externalVolumes:[{id:'external-33-6-1',enclosure:33,slot:6,mount:'/share/external/DEV3306_1',device:'/dev/sdg1',filesystem:'ufsd',totalGB:1000,usedGB:993,freeGB:7}],externalDisks:[{enclosure:33,slot:6,device:'/dev/sdg',model:'External HDD',type:'hdd',capacityGB:1001,health}],ups:{state:'connected',source:'nut-upsc',model:'UPS test',mode:'battery',lowBattery:true,batteryPercent:5,runtimeSec:60,protection:{enabled:true,mode:'Shutdown',delayMinutes:8,networkServer:false}},backups:{state:'available',source:'hbs-config-db',jobs:[]},snapshots:{state:'available',source:'qts-snapshot-config',count:0,schedules:[]}};}
test('external volumes stay separate, low battery and nearly-full drives raise real alerts, and output satisfies the live DTO',()=>{const value=qnapStorageReading({category:'storage'},['telemetry'],extended(),time)!;assert.equal(value.metrics.diskTotalGB,7800);assert.equal(value.externalVolumes?.length,1);assert.equal(value.protectionState,'fresh');assert(value.alerts.some(a=>a.code==='volume-capacity'&&a.severity==='critical'));assert(value.alerts.some(a=>a.code==='ups-power'&&a.severity==='critical'));assert.equal(value.externalDisks?.[0].health.state,'unsupported');assertDto('QnapStorageReading',value);});
test('stale root protection cache never creates current UPS or external-capacity alarms, and mismatched disk bindings are rejected',()=>{const value=extended();const aged=qnapStorageReading({category:'storage'},['telemetry'],{...value,protectionObservedAt:new Date(time-181000).toISOString()},time)!;assert.equal(aged.protectionState,'stale');assert.equal(aged.alerts.length,0);assert.throws(()=>qnapStorageSample.parse({...value,externalVolumes:[{...value.externalVolumes[0],slot:7}]}));assert.throws(()=>qnapStorageSample.parse({...value,externalDisks:[]}));assert.throws(()=>qnapStorageSample.parse({...value,externalVolumes:[{...value.externalVolumes[0],mount:'/etc/passwd'}]}));assert.throws(()=>qnapStorageSample.parse({...value,ups:{...value.ups,batteryPercent:101}}));});

test('valid tiny positive NAS capacity stays positive after display rounding and preserves the signed volume',()=>{
 const raw={...sample(),volumes:[{id:1,mount:'/share/CACHEDEV1_DATA',totalGB:.0001,usedGB:0,freeGB:.0001}]};
 const value=qnapStorageReading({category:'storage'},['telemetry'],raw,time)!;
 assert.equal(value.metrics.diskTotalGB,.0001);assert.deepEqual(value.volumes,raw.volumes);assertDto('QnapStorageReading',value);
});

test('accepted filesystem capacity tolerance clamps only derived percent while raw signed capacity remains unchanged',()=>{
 const raw={...sample(),volumes:[{id:1,mount:'/share/CACHEDEV1_DATA',totalGB:1,usedGB:1.01,freeGB:0}]};
 const value=qnapStorageReading({category:'storage'},['telemetry'],raw,time)!;
 assert.equal(value.metrics.diskPercent,100);assert.equal(value.volumes[0].usedGB,1.01);assert.deepEqual(value.volumes,raw.volumes);assertDto('QnapStorageReading',value);
 assert.throws(()=>qnapStorageReading({category:'storage'},['telemetry'],{...raw,volumes:[{...raw.volumes[0],usedGB:1.03}]},time),'larger capacity inconsistency still must be rejected');
});

test('maximum configured NAS sources keep all 229 real alarms within the strict output contract',()=>{
 const health={state:'warning',source:'qts-smart-cache',temperatureC:65,observedAt:new Date(time).toISOString(),attributes:[]};
 const raw={...extended(),
  volumes:Array.from({length:32},(_,i)=>({id:i+1,mount:`/share/CACHEDEV${i+1}_DATA`,totalGB:1000,usedGB:990,freeGB:10})),
  disks:Array.from({length:32},(_,i)=>({slot:i+1,type:'hdd',model:'fixture internal drive',capacityGB:1001})),
  diskHealth:Array.from({length:32},(_,i)=>({...health,enclosure:0,slot:i+1})),
  externalVolumes:Array.from({length:32},(_,i)=>({id:`external-1-${i+1}-1`,enclosure:1,slot:i+1,mount:`/share/external/DEV01${String(i+1).padStart(2,'0')}_1`,device:'/dev/sdg1',filesystem:'ext4',totalGB:1000,usedGB:990,freeGB:10})),
  externalDisks:Array.from({length:32},(_,i)=>({slot:i+1,enclosure:1,device:'/dev/sdg',model:'fixture external drive',type:'hdd',capacityGB:1001,health})),
  backups:{state:'available',source:'hbs-config-db',jobs:Array.from({length:100},(_,i)=>({id:'job-'+i,name:'fixture backup '+i,state:'failed',enabled:true}))},
 };
 const value=qnapStorageReading({category:'storage'},['telemetry'],raw,time)!;
 assert.equal(value.alerts.length,229);assert.equal(value.alerts.filter(a=>a.code==='backup-job').length,100);assert.equal(value.alerts.filter(a=>a.code==='volume-capacity').length,64);assertDto('QnapStorageReading',value);
});
