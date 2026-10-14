import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.js';
import {GovernanceRuntime} from '../src/runtime/governance.js';

async function fixture(run:(ledger:GovernanceRuntime)=>void){const directory=await mkdtemp(join(tmpdir(),'jarvis-partial-reconcile-')),store=new Store(directory),ledger=new GovernanceRuntime(store);try{run(ledger);}finally{ledger.close();store.close();await rm(directory,{recursive:true,force:true});}}
const aggregate={runId:'execution_failed',actorId:'server-admin',provider:'claude-cli',model:'actual-model',inputTokens:39,outputTokens:3,cacheReadTokens:14,cacheWriteTokens:10,totalTokens:42,costUSD:.03,costKind:'catalog-estimate' as const,usageId:'partial',usageComplete:false,projectId:'factory',machineId:'101'};
const receipt=(id:string,inputTokens:number,outputTokens:number)=>({source:'external-cli' as const,sourceRecordId:'cli:claude:session:'+id,provider:'claude-cli',model:'actual-model',measuredAt:'2026-10-09T12:00:00Z',controlledRunId:'failed',projectId:'factory',machineId:'101',inputTokens,outputTokens,cacheReadTokens:7,cacheWriteTokens:5,totalTokens:inputTokens+outputTokens,costUSD:null});
const first=receipt('one',22,5),second=receipt('two',17,2);
function complete(ledger:GovernanceRuntime){const totals=ledger.usageSummary().totals;assert.equal(totals.inputTokens,39);assert.equal(totals.outputTokens,7);assert.equal(totals.totalTokens,46);assert.equal(totals.cacheReadTokens,14);assert.equal(totals.cacheWriteTokens,10);assert.equal(totals.estimatedUSD,.03);const remainder=ledger.usagePage().items.find((row:any)=>row.id==='partial');assert.equal(remainder.usage_kind,'cli-partial-remainder');assert.equal(remainder.total_tokens,0);assert.equal(remainder.cost_usd,.03);}

test('failed aggregate first: later stable snapshots add real growth, reconcile caches once and retry atomically',()=>fixture(ledger=>{
  ledger.executionUsage(aggregate);assert.equal(ledger.importUsage(first).recorded,true);
  const remainder=ledger.usagePage().items.find((row:any)=>row.id==='partial');assert.equal(remainder.input_tokens,17);assert.equal(remainder.output_tokens,0);assert.equal(remainder.total_tokens,17);assert.equal(remainder.cache_read,7);assert.equal(remainder.cache_write,5);
  const before=ledger.usageSummary().totals;assert.equal(ledger.importUsage(first).duplicate,true);assert.deepEqual(ledger.usageSummary().totals,before);
  assert.throws(()=>ledger.importUsage({...first,outputTokens:99,totalTokens:121}),/同一用量/);assert.deepEqual(ledger.usageSummary().totals,before,'invalid retry must not change the remainder');
  ledger.importUsage(second);complete(ledger);assert.equal(ledger.importUsage(second).duplicate,true);complete(ledger);
}));

test('stable observer first: a smaller failed partial aggregate keeps only nonnegative uncovered evidence',()=>fixture(ledger=>{
  ledger.importUsage(first);ledger.executionUsage(aggregate);ledger.importUsage(second);complete(ledger);
  assert.throws(()=>ledger.executionUsage({...aggregate,usageId:'impossible-final',sourceRecordId:'impossible-final',usageComplete:true}),/汇总小于/,'a real complete final receipt may not contradict observed usage');complete(ledger);
}));

test('real complete and older legacy aggregates continue to suppress duplicate observer tokens',()=>fixture(ledger=>{
  ledger.executionUsage({...aggregate,usageComplete:true,inputTokens:39,outputTokens:7,totalTokens:46});assert.equal(ledger.importUsage(first).controlled,true);assert.equal(ledger.importUsage(second).controlled,true);assert.equal(ledger.usageSummary().totals.totalTokens,46);
  ledger.executionUsage({...aggregate,runId:'execution_legacy',usageId:'legacy',usageComplete:undefined});assert.equal(ledger.importUsage({...first,controlledRunId:'legacy',sourceRecordId:'legacy-message'}).controlled,true);assert.equal(ledger.usageSummary().totals.totalTokens,88);
}));

test('original aggregate replay remains identical after observer changes the stored remainder',()=>fixture(ledger=>{
 const original={...aggregate,measuredAt:'2026-10-10T12:00:00Z'};ledger.executionUsage(original);ledger.importUsage(first);const before=ledger.usageSummary().totals;ledger.executionUsage(original);assert.deepEqual(ledger.usageSummary().totals,before);assert.throws(()=>ledger.executionUsage({...original,inputTokens:original.inputTokens+1,totalTokens:original.totalTokens+1}),/原始回执/);assert.deepEqual(ledger.usageSummary().totals,before);ledger.importUsage(second);complete(ledger);
}));
test('already committed CLI usage is acknowledged at the budget line while the next execution is blocked',()=>fixture(ledger=>{
 ledger.updatePolicy(0,{dailyLimitUSD:.01,perRunReserveUSD:.001});const original={...aggregate,costUSD:.02,measuredAt:new Date().toISOString()};assert.doesNotThrow(()=>ledger.executionUsage(original));const before=ledger.usageSummary().totals;assert.equal(before.estimatedUSD,.02);assert.doesNotThrow(()=>ledger.executionUsage(original));assert.deepEqual(ledger.usageSummary().totals,before);assert.throws(()=>ledger.preflight(),/预算/);
}));
