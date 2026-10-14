import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionChecks,smokeTemplate} from './verify-101-strong-model-r19.mjs';
const evidence=()=>({result:{status:'succeeded',outcome:'success',exitCode:0,rounds:1,source:'signed-agent',usage:{model:'gpt-6.1-sol[1m]',inputTokens:10,outputTokens:5,usageComplete:true},validation:{exitCode:0}},ledgerAfterObserver:[{measurement_status:'reported',input_tokens:10,output_tokens:5,total_tokens:15}],taskStatus:'validating',sourceMetadataUnchanged:true,sourceContentUnchanged:true,observerDedupConfirmed:true});
test('only a signed exact strong-model receipt verifies; configured labels and downgraded models do not',()=>{
 const ready=x=>Object.values(connectionChecks(x)).every(v=>v===true);assert.equal(ready(evidence()),true);
 for(const model of [undefined,'gpt-6-sol[1m]','gpt-6.1-sol','gpt-6.1-sol[1M]']){const v=evidence();v.result.usage.model=model;assert.equal(ready(v),false,String(model))}
 const unsigned=evidence();unsigned.result.source='configured-model';assert.equal(ready(unsigned),false);
});
test('a strong-model response still fails connection validation when usage, independent checks or source identity are unknown',()=>{
 for(const change of [v=>{v.result.validation=null},v=>{v.result.usage.usageComplete=false},v=>{v.ledgerAfterObserver[0].measurement_status='unknown'},v=>{v.sourceContentUnchanged=false},v=>{v.observerDedupConfirmed=false}]){const v=evidence();change(v);assert.equal(Object.values(connectionChecks(v)).every(Boolean),false)}
});
test('the bounded smoke preserves the pinned strong-model argument for restoration and disables every model tool',()=>{
 const original={id:'msf-101-claude',machineId:'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',engine:'claude',args:['--print','{prompt}','--model','gpt-6.1-sol[1m]'],maxRounds:10,timeoutSec:1200,supervision:{billing:'priced',maxRecoveryAttempts:3,repairValidation:true}};
 const before=JSON.stringify(original),smoke=smokeTemplate(original);assert.equal(JSON.stringify(original),before);assert.equal(smoke.args[smoke.args.indexOf('--model')+1],'gpt-6.1-sol[1m]');assert.equal(smoke.args[smoke.args.indexOf('--tools')+1],'');assert.equal(smoke.args[smoke.args.indexOf('--disallowedTools')+1],'*');assert.equal(smoke.maxRounds,1);assert.equal(smoke.timeoutSec,120);assert.equal(smoke.supervision.maxRecoveryAttempts,0);
});
