import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {plannedContract,validateDto,assertReceipt} from '../src/v1/contract.js';
const purpose='project-candidate-validation';
const template={id:'msf-101-claude',machineId:'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',engine:'fixed',purpose,program:'/opt/jarvis-development/node/bin/node',args:['/opt/jarvis-development/software-factory/factory-no-model-receipt-r26.mjs'],workspaceRoot:'/home/superopen/All-Projects/msf-repair-r27',maxRounds:1,timeoutSec:4200,leaseSec:60,budgetCurrency:'USD',validation:{program:'/usr/bin/sudo',args:['-n','/usr/local/libexec/jarvis-msf-main-acceptance-r27','{workspace}','{runId}'],timeoutSec:3600}};
const request={id:'r27-contract-fixture',domain:'tasks',objectId:'fixture-task',taskId:'fixture-task',kind:'development',machineId:template.machineId,executorId:template.id,projectId:'70ec346f-6520-46ed-abed-22cac770a3e4',workspace:template.workspaceRoot+'/source',goal:'Isolated schema fixture; no real dispatch',criteria:'Strict fixed binding',maxRounds:1,timeoutSec:4200,budgetUSD:0,purpose,template};
const task={id:'fixture-task',revision:2,scope:'personal',ownerId:'server-admin',title:'R27 contract fixture',projectId:request.projectId,machineId:template.machineId,agent:template.id,mode:'managed',goal:request.goal,criteria:request.criteria,status:'running',progress:0,budget:1,cost:0,retryLimit:0,retries:0,lease:null,artifacts:[],updatedAt:'2026-10-12T00:00:00.000Z',executionRequest:request,executionStatus:'queued'};
test('real command receipt accepts frozen no-model candidate purpose and zero execution budget',()=>{
 for(const [name,value] of [['ExecutionTemplate',template],['ExecutionRequest',request]] as const){const result=validateDto(name,value);assert.equal(result.valid,true,JSON.stringify(result.errors));}
 assert.doesNotThrow(()=>assertReceipt('/api/v1/tasks/commands/start',{requestId:'fixture-command',version:2,data:task,events:[]}));
});
test('candidate cannot claim record-only with another machine, model program, source root or validation argv',()=>{
 for(const patch of [{machineId:'another-node'},{engine:'claude'},{purpose:'arbitrary-free-program'},{program:'/usr/bin/node'},{args:['/other-receipt.mjs']},{workspaceRoot:'/home/superopen/All-Projects'},{maxRounds:2},{timeoutSec:4201},{leaseSec:120},{supervision:{billing:'record-only'}},{validation:{...template.validation,args:['-n','/arbitrary-root','{workspace}','{runId}']}}])assert.equal(validateDto('ExecutionTemplate',{...template,...patch}).valid,false,JSON.stringify(patch));
 for(const patch of [{budgetUSD:1},{maxRounds:2},{workspace:'/home/superopen/All-Projects/msf'},{projectId:'other-project'},{executorId:'other'},{template:{...template,purpose:'project-autonomy-validation'}}])assert.equal(validateDto('ExecutionRequest',{...request,...patch}).valid,false,JSON.stringify(patch));
 const unbound:any={...request};delete unbound.purpose;assert.equal(validateDto('ExecutionRequest',unbound).valid,false);
});
test('legacy FA branch and contract regeneration preserve separate fixed programs',()=>{
 const legacy={...template,id:'fa-fixture',machineId:'fixture-machine',purpose:'project-autonomy-validation',program:'/usr/bin/true',args:[],workspaceRoot:'/fixture',timeoutSec:120,validation:{program:'/usr/bin/sudo',args:['-n','/usr/local/libexec/jarvis-project-autonomy-validation','{workspace}','{runId}','FA-01','a'.repeat(64)],timeoutSec:120}};
 assert.equal(validateDto('ExecutionTemplate',legacy).valid,true);assert.equal(validateDto('ExecutionTemplate',{...legacy,program:template.program,args:template.args}).valid,false);
 const require=createRequire(import.meta.url),copy=structuredClone(plannedContract);require('../../../scripts/execution-runtime-contract.cjs')(copy);
 for(const name of ['ExecutionTemplate','ExecutionRequest'])assert.deepEqual(copy.components.schemas[name],plannedContract.components.schemas[name]);
});
