import test from 'node:test';
import assert from 'node:assert/strict';
import {roundCliUsage} from '../src/runtime/cli-supervision.js';
import type {CliSupervisionPolicy} from '../src/runtime/execution-types.js';
const policy:CliSupervisionPolicy={billing:'priced',maxTokens:1000,maxRecoveryAttempts:0,retryDelaySec:60,repairValidation:false,fallbackExecutorIds:[]};
const usage={inputTokens:50,outputTokens:5,totalTokens:55,cacheReadTokens:30,model:'gpt-6-sol',provider:'claude-cli',usageComplete:true};

test('positive tokens from a compatible non-Claude model do not turn zero catalogue estimates into free priced continuation',()=>{
  const result=roundCliUsage('claude',usage,'session',0,undefined,policy);assert.equal(result.usage?.totalTokens,55);assert.equal(result.usage?.cacheReadTokens,30);assert.equal(result.usage?.costUSD,undefined);assert.equal(result.usage?.costKind,undefined);assert.equal(result.checkpoint?.costUSD,0);
  const native=roundCliUsage('claude',{...usage,model:'claude-sonnet-4-5'},'session',0,undefined,policy);assert.equal(native.usage?.costUSD,0);assert.equal(native.usage?.costKind,'catalog-estimate');
  assert.equal(roundCliUsage('claude',{...usage,model:'anthropic/claude-opus-4-6'},'session',0,undefined,policy).usage?.costUSD,0);
  assert.equal(roundCliUsage('claude',usage,'session',.15,undefined,policy).usage?.costUSD,.15);
  assert.equal(roundCliUsage('claude',usage,'session',0,undefined,{...policy,billing:'subscription'}).usage?.costUSD,0);
  assert.equal(roundCliUsage('claude',{...usage,inputTokens:0,outputTokens:0,totalTokens:0},'session',0,undefined,policy).usage?.costUSD,0);
});

test('explicit owner prices estimate complete gateway receipts and count cached input once',()=>{
  const priced={...policy,inputUSDPerMillion:2,outputUSDPerMillion:4};
  const result=roundCliUsage('claude',usage,'session',0,undefined,priced);
  assert.equal(result.usage?.costUSD,.00012);assert.equal(result.usage?.costKind,'catalog-estimate');
  assert.deepEqual({...result.usage,costUSD:undefined,costKind:undefined},{...usage,costUSD:undefined,costKind:undefined});
  assert.equal(result.checkpoint?.costUSD,0,'owner estimates never overwrite the native cumulative checkpoint');
  const noCatalogue=roundCliUsage('claude',usage,'session',undefined,undefined,priced);assert.equal(noCatalogue.usage?.costUSD,.00012);
  const explicitZero=roundCliUsage('claude',usage,'session',0,undefined,{...priced,inputUSDPerMillion:0,outputUSDPerMillion:0});assert.equal(explicitZero.usage?.costUSD,0);assert.equal(explicitZero.usage?.costKind,'catalog-estimate');
  assert.equal(roundCliUsage('claude',usage,'session',0,undefined,policy).usage?.costUSD,undefined);
});

test('resumed receipts without a reliable cost baseline use only this complete round owner estimate',()=>{
  const priced={...policy,inputUSDPerMillion:2,outputUSDPerMillion:4};
  const noBaseline=roundCliUsage('claude',usage,'session',50,undefined,priced,'session');assert.equal(noBaseline.usage?.costUSD,.00012);assert.equal(noBaseline.checkpoint?.costUSD,50);
  const negativeDelta=roundCliUsage('claude',usage,'session',40,{engine:'claude',sessionId:'session',costUSD:50},priced,'session');assert.equal(negativeDelta.usage?.costUSD,.00012);assert.equal(negativeDelta.checkpoint?.costUSD,50);
  const reliableDelta=roundCliUsage('claude',usage,'session',52,{engine:'claude',sessionId:'session',costUSD:50},priced,'session');assert.equal(reliableDelta.usage?.costUSD,2);assert.equal(reliableDelta.checkpoint?.costUSD,52);
  assert.equal(roundCliUsage('claude',usage,'session',50,undefined,policy,'session').usage?.costUSD,undefined);
});

test('owner prices do not fabricate a cost from partial or invalid token counts, or price subscriptions',()=>{
  const priced={...policy,inputUSDPerMillion:2,outputUSDPerMillion:4};
  for(const partial of [
    {...usage,usageComplete:false},
    {...usage,usageComplete:undefined},
    {...usage,inputTokens:Number.NaN},
    {...usage,outputTokens:-1},
    {...usage,totalTokens:999},
  ])assert.equal(roundCliUsage('claude',partial,'session',undefined,undefined,priced).usage?.costUSD,undefined);
  assert.equal(roundCliUsage('claude',undefined,'session',0,undefined,priced).usage,undefined);
  assert.equal(roundCliUsage('claude',usage,'session',undefined,undefined,{...priced,billing:'subscription'}).usage?.costUSD,undefined);
  assert.equal(roundCliUsage('claude',usage,'session',0,undefined,{...priced,billing:'subscription'}).usage?.costUSD,0);
  assert.equal(roundCliUsage('claude',usage,'session',undefined,undefined,{...policy,inputUSDPerMillion:2}).usage?.costUSD,undefined);
});
