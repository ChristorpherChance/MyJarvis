import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAgentOutput} from '../src/runtime/agent-runner.js';

test('R43 quota result carries partial usage without inventing zero and accumulates phase costs once',()=>{
 const parsed=parseAgentOutput('claude',[
  JSON.stringify({type:'assistant',message:{id:'m1',model:'fixture-model',usage:{input_tokens:19,output_tokens:2}}}),
  JSON.stringify({type:'result',session_id:'fixture-session',is_error:true,errors:['Usage limit reached 429'],total_cost_usd:0.03,usage:{input_tokens:0,output_tokens:0}}),
 ]);
 assert.equal(parsed.failure?.kind,'quota');assert.equal(parsed.usage?.inputTokens,0);assert.equal(parsed.usage?.outputTokens,0);assert.equal(parsed.usage?.usageComplete,true);assert.equal(parsed.totalCost,0.03);assert.equal(parsed.nativePhases.length,1);
});
