import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAgentOutput} from '../src/runtime/agent-runner.js';

const assistant=(id:string,output:number)=>({type:'assistant',message:{id,model:'actual-claude',usage:{input_tokens:10,cache_read_input_tokens:7,cache_creation_input_tokens:5,output_tokens:output}}});
const parse=(lines:unknown[])=>parseAgentOutput('claude',lines.map(line=>JSON.stringify(line)));

test('cancelled Claude stream keeps the latest cumulative snapshot per message without adding duplicates',()=>{
  const messages=[assistant('one',1),assistant('one',5),assistant('one',5),assistant('two',3)];
  const cancelled=parse(messages);assert.equal(cancelled.completed,false);assert.equal(cancelled.usage?.usageComplete,false);assert.equal(cancelled.usage?.inputTokens,44);assert.equal(cancelled.usage?.outputTokens,8);assert.equal(cancelled.usage?.cacheReadTokens,14);assert.equal(cancelled.usage?.cacheWriteTokens,10);assert.equal(cancelled.usage?.totalTokens,52);
  const failure=parse([...messages,{type:'result',is_error:true,subtype:'error_quota',usage:{input_tokens:0,output_tokens:0,cache_read_input_tokens:0,cache_creation_input_tokens:0},total_cost_usd:0}]);assert(failure.failure);assert.equal(failure.usage?.totalTokens,52);assert.equal(failure.usage?.costUSD,undefined);assert.equal(failure.usage?.knownCostUSD,undefined);
  const final=parse([...messages,{type:'result',usage:{input_tokens:30,output_tokens:10,cache_read_input_tokens:14,cache_creation_input_tokens:10},total_cost_usd:.1}]);assert.equal(final.usage?.usageComplete,true);assert.equal(final.usage?.inputTokens,54);assert.equal(final.usage?.totalTokens,64);assert.equal(final.totalCost,.1,'native cumulative total is retained separately for round billing');assert.equal(final.usage?.costUSD,undefined,'session cumulative cost is not a per-round charge');assert.equal(final.usage?.knownCostUSD,.1);
  const regressed=parse([...messages,{type:'result',usage:{input_tokens:30,output_tokens:10,cache_read_input_tokens:8,cache_creation_input_tokens:2},total_cost_usd:.1}]);assert.equal(regressed.usage?.usageComplete,false);assert.equal(regressed.usage?.costComplete,false);assert.equal(regressed.usage?.costUSD,undefined);assert.ok((regressed.usage?.inputTokens??0)>=44);assert.ok((regressed.usage?.cacheReadTokens??0)>=14);assert.ok((regressed.usage?.cacheWriteTokens??0)>=10);
});
