import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {metricSampleTime,projectFreshTelemetry} from './metric-freshness.ts';
import {projectInfrastructure} from './live-infrastructure-commands.ts';
import {renderToString} from 'react-dom/server';
import ServerCard from '../features/operations/ServerCard.tsx';

const now=Date.now();
const sample=(observedAt:string,expiresAt:string,timeBasis:'received'|'measured'='measured')=>({agentId:'agent-a',observedAt,expiresAt,timeBasis});

test('metric metadata expires individual values even while the heartbeat is fresh',()=>{
 const projected=projectFreshTelemetry({observedAt:new Date(now-1000).toISOString(),metricFreshness:{cpuPercent:sample(new Date(now-70_000).toISOString(),new Date(now-10_000).toISOString()),memoryPercent:sample(new Date(now-1000).toISOString(),new Date(now+5000).toISOString())},cpuPercent:41,memoryPercent:52},now);
 assert.equal(projected?.cpuPercent,undefined);assert.equal(projected?.memoryPercent,52);assert.equal(metricSampleTime(projected,'memoryPercent'),new Date(now-1000).toISOString());
});

test('future samples tolerate ten seconds and reject farther future or expired metadata',()=>{
 const projected=projectFreshTelemetry({observedAt:new Date(now).toISOString(),metricFreshness:{cpuPercent:sample(new Date(now+10_000).toISOString(),new Date(now+20_000).toISOString()),memoryPercent:sample(new Date(now+10_001).toISOString(),new Date(now+20_000).toISOString()),diskPercent:sample(new Date(now-1000).toISOString(),new Date(now-1).toISOString())},cpuPercent:0,memoryPercent:70,diskPercent:0},now);
 assert.equal(projected?.cpuPercent,0);assert.equal(projected?.memoryPercent,undefined);assert.equal(projected?.diskPercent,undefined);
});

test('legacy telemetry uses observedAt only for a conservative sixty-second fallback',()=>{
 assert.equal(projectFreshTelemetry({observedAt:new Date(now-59_999).toISOString(),cpuPercent:0},now)?.cpuPercent,0);
 assert.equal(projectFreshTelemetry({observedAt:new Date(now-60_001).toISOString(),cpuPercent:50},now)?.cpuPercent,undefined);
 assert.equal(projectFreshTelemetry({observedAt:new Date(now+10_001).toISOString(),cpuPercent:50},now)?.cpuPercent,undefined);
});

test('live projection drops stale metric metadata while leaving heartbeat online',()=>{
 const result=projectInfrastructure({machines:[{id:'m1',name:'test',agentStatus:'connected',lastSeen:new Date(now-1000).toISOString(),telemetry:{observedAt:new Date(now-1000).toISOString(),metricFreshness:{cpuPercent:sample(new Date(now-70_000).toISOString(),new Date(now-1).toISOString())},cpuPercent:88,memoryPercent:37}}]} as any);
 const machine=result.machines[0];assert.equal(machine.status,'online');assert.equal(machine.cpuUse,undefined);assert.equal(machine.ramUse,37);assert.equal(machine.telemetry.cpuPercent,undefined);assert.equal(machine.telemetry.memoryPercent,37);
});

test('machine card SSR labels heartbeats separately from missing metric samples',()=>{
 const machine={id:'m1',name:'test',status:'online',telemetry:{observedAt:new Date(now-70_000).toISOString(),cpuPercent:88},lastSeen:new Date(now-1000).toISOString(),cpu:'CPU',os:'Linux',role:'test'} as any;
 const data={v5:{ops:{services:[]}}} as any;
 (globalThis as any).React=React;
 const html=renderToString(React.createElement(ServerCard,{machine,data,onDetails:()=>{},navigate:()=>{}}));
 assert.match(html,/心跳/);assert.match(html,/指标采样[^<]*<!-- -->未采样或已过期/);assert.doesNotMatch(html,/88%/);
});

test('machine detail and card consume per-metric freshness, not heartbeat timestamp',async()=>{
 const {readFile}=await import('node:fs/promises');
 const card=await readFile(new URL('../features/operations/ServerCard.tsx',import.meta.url),'utf8');
 const pages=await readFile(new URL('../features/operations/ActualInfrastructurePages.tsx',import.meta.url),'utf8');
 assert.match(card,/projectFreshTelemetry\(m\.telemetry\)/);assert.match(card,/指标采样/);assert.match(card,/未采样或已过期/);
 assert.match(pages,/projectFreshTelemetry\(item\?\.telemetry\)/);assert.match(pages,/metricSampleTime\(/);assert.match(pages,/未采样或已过期/);
});
