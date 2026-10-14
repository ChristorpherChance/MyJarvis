import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.js';
import {GovernanceRuntime} from '../src/runtime/governance.js';

test('只记账绕过金额与未定价限制，仍执行暂停及并发控制',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-record-only-')),store=new Store(directory),runtime=new GovernanceRuntime(store);
 try{
  runtime.updatePolicy(0,{dailyLimitUSD:0.01,perRunReserveUSD:1,maxConcurrent:1});
  assert.throws(()=>runtime.preflight(),/预算/);
  assert.deepEqual(runtime.reserveExecution({runId:'record-only-1',actorId:'server-admin',executorId:'fixture-record-only',budgetUSD:1,recordOnly:true}),{});
  assert.throws(()=>runtime.preflight({recordOnly:true}),/并发/);
  runtime.executionUsage({runId:'execution_record-only-1',actorId:'server-admin',provider:'fixture',model:'fixture',inputTokens:100,outputTokens:20,totalTokens:120,usageComplete:false,knownCostUSD:5,costComplete:false,costKind:'provider-reported',usageId:'partial-fixed',measuredAt:'2026-10-11T00:00:00.000Z'});
  const page=runtime.usagePage();assert.equal(page.items[0].cost_usd,5);assert.equal(page.items[0].cost_complete,0);assert.equal(page.summary.estimatedUSD,5);assert.equal(page.summary.unpricedCalls,1);
  runtime.releaseExecution({runId:'record-only-1',actorId:'server-admin',outcome:'success'});
  runtime.preflight({recordOnly:true});
  runtime.updatePolicy(1,{paused:true});assert.throws(()=>runtime.preflight({recordOnly:true}),/暂停/);
 }finally{runtime.close();store.close();await rm(directory,{recursive:true,force:true});}
});

test('不完整费用保留已知部分，重复回执不增账，后续相同范围观察不双计',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-partial-fee-')),store=new Store(directory),runtime=new GovernanceRuntime(store);
 try{
  const receipt={runId:'execution_partial-fee',actorId:'server-admin',provider:'fixture',model:'fixture',inputTokens:100,outputTokens:20,totalTokens:120,usageComplete:false,knownCostUSD:5,costComplete:false,costKind:'provider-reported' as const,usageId:'partial-one',measuredAt:'2026-10-11T00:00:00.000Z'};
  runtime.executionUsage(receipt);runtime.executionUsage(receipt);assert.equal(runtime.usagePage().total,1);
  runtime.importUsage({source:'external-cli',sourceRecordId:'fixture-overlapping-message',actorId:'server-admin',provider:'fixture',model:'fixture',inputTokens:40,outputTokens:10,totalTokens:50,costUSD:1,costKind:'provider-reported',measurementStatus:'reported',controlledRunId:'partial-fee',measuredAt:'2026-10-11T00:00:00.000Z'});
  const p=runtime.usagePage();assert.equal(p.summary.estimatedUSD,5);assert.equal(p.summary.totalTokens,120);assert.equal(p.summary.unpricedCalls,1);assert.equal(p.items.find(r=>r.source==='controlled-cli')!.cost_complete,0);
 }finally{runtime.close();store.close();await rm(directory,{recursive:true,force:true});}
});
