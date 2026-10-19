import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateTelemetry,validTelemetryMetric} from '../src/runtime/telemetry-aggregation.js';
const at=Date.parse('2026-10-19T12:00:00Z'),iso=(n:number)=>new Date(n).toISOString();
const machine={id:'one',scope:'personal',address:'192.168.10.101',cpu:'Intel fixture'};
const agent=(id:string,metrics:any,time=at,extra:any={})=>({id,machineId:'one',revoked:false,capabilities:['telemetry'],telemetry:{snapshotVersion:1,source:'signed-agent',observedAt:iso(time),metrics,...extra}});
const project=(agents:any[],time=at,hardware=()=>true,power:any=undefined)=>aggregateTelemetry(machine,agents,{at:time,hardware,power});
test('latest independent snapshots retain zero and original times without refreshing absent metrics',()=>{
 const full=agent('monitor',{diskPercent:0,cpuPercent:40},at-20000),cpu=agent('executor',{cpuPercent:2});
 const result=project([cpu,full]);assert.equal(result.diskPercent,0);assert.equal(result.cpuPercent,2);assert.equal(result.metricFreshness.diskPercent.observedAt,iso(at-20000));assert.equal(result.metricFreshness.diskPercent.timeBasis,'received');
 assert.equal(project([cpu,full],at+40000).diskPercent,undefined);assert.equal(project([cpu,full],at+60000),undefined);
 assert.equal(project([cpu,{...full,revoked:true}]).diskPercent,undefined);assert.equal(project([cpu,{...full,machineId:'other'}]).diskPercent,undefined);
 assert.equal(project([agent('monitor',{cpuPercent:1})]).diskPercent,undefined);
 assert.equal(project([agent('legacy',{diskPercent:4},at,{snapshotVersion:undefined})]),undefined);
 assert.equal(project([agent('future',{cpuPercent:2},at+11000)]),undefined);
 const tied=[agent('b',{cpuPercent:2}),agent('a',{cpuPercent:1})];assert.equal(project(tied).cpuPercent,project(tied.reverse()).cpuPercent);
});
test('hardware and RAPL use measured time, current authority and independent expiry',()=>{
 const hardware=agent('monitor',{gpuPercent:0,powerWatts:20},at,{observationVersion:1,metricMeasuredAt:{gpuPercent:iso(at-25000),powerWatts:iso(at-25000)},metricSources:{gpuPercent:'gpu-source',powerWatts:'meter-source'},cpuPower:{source:'intel-rapl',watts:1,observedAt:iso(at-25000),windowSeconds:2},powerVersion:1});
 const power={version:1,profiles:[{machineId:'one',cpuModel:'Intel fixture'}]},cpu=agent('executor',{cpuPercent:2});
 const result=project([hardware,cpu],at,()=>true,power);assert.equal(result.gpuPercent,0);assert.equal(result.metricSources.gpuPercent,'gpu-source');assert.equal(result.cpuPower.watts,1);assert.equal(result.metricFreshness.cpuPower.timeBasis,'measured');
 const expired=project([hardware,cpu],at+5000,()=>true,power);assert.equal(expired.cpuPower,undefined);assert.equal(expired.gpuPercent,undefined);assert.equal(expired.cpuPercent,2);
 assert.equal(project([hardware,cpu],at,()=>false,power).gpuPercent,undefined);
 assert.equal(project([hardware,cpu],at,()=>true,{...power,version:2}).cpuPower,undefined);
 assert.equal(project([{...hardware,capabilities:[]},cpu],at,()=>false,power).cpuPower,undefined);
});
test('NAS-derived capacity retains the actual storage time rather than heartbeat receipt',()=>{
 const nas=agent('nas',{diskPercent:20,diskFreeGB:80,diskTotalGB:100},at,{storage:{observedAt:iso(at-59000)}});
 const current=project([nas]);assert.equal(current.metricFreshness.diskPercent.timeBasis,'measured');assert.equal(current.metricFreshness.diskPercent.observedAt,iso(at-59000));
 assert.equal(project([nas],at+1000),undefined);
});
test('uptime alone has a safe large range; malformed values and existing metric limits stay rejected',()=>{
 for(const value of [0,1.5,9999999,10000000,10981939,Number.MAX_SAFE_INTEGER])assert(validTelemetryMetric('uptimeSec',value));
 for(const value of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert(!validTelemetryMetric('uptimeSec',value));
 assert(!validTelemetryMetric('diskTotalGB',10000000));assert(!validTelemetryMetric('cpuPercent',101));assert(validTelemetryMetric('cpuPercent',100));
});
