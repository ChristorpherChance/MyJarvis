import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateValidationScope as S,candidateValidationScopes,validateExecutionTemplate,validateCandidateValidationRun} from '../src/runtime/execution-runtime.js';
import {validateDto} from '../src/v1/contract.js';
import type {ExecutionTemplate} from '../src/runtime/execution-types.js';
const template=(entry:string):ExecutionTemplate=>({id:S.id,machineId:S.machineId,engine:'fixed',purpose:S.purpose,program:S.program,args:[S.receipt],workspaceRoot:S.workspaceRoot,maxRounds:1,timeoutSec:4200,leaseSec:60,budgetCurrency:'USD',validation:{program:'/usr/bin/sudo',args:['-n',entry,'{workspace}','{runId}'],timeoutSec:3600}});
const request=(t:ExecutionTemplate)=>({id:'r28-isolated',domain:'tasks',objectId:'r28-fixture-task',taskId:'r28-fixture-task',kind:'development',machineId:S.machineId,executorId:S.id,projectId:S.projectId,workspace:S.workspace,goal:'fixed tests',criteria:'unchanged scope',maxRounds:1,timeoutSec:4200,budgetUSD:0,purpose:S.purpose,template:t});
test('both exact verifier revisions retain the same frozen candidate and agree with the HTTP DTO',()=>{
 assert.deepEqual(candidateValidationScopes.map(s=>s.entry),[S.entry,'/usr/local/libexec/jarvis-msf-main-acceptance-r28']);
 for(const s of candidateValidationScopes){const t=template(s.entry),r=request(t);assert.deepEqual(validateExecutionTemplate(t),t);assert.doesNotThrow(()=>validateCandidateValidationRun(t,r));assert.equal(validateDto('ExecutionTemplate',t).valid,true);assert.equal(validateDto('ExecutionRequest',r).valid,true);}
});
test('adding a revision does not authorize unknown entries, another source or model/timeout/budget changes',()=>{
 const t=template('/usr/local/libexec/jarvis-msf-main-acceptance-r28');
 const changes=[{validation:{...t.validation!,args:['-n','/usr/local/libexec/jarvis-msf-main-acceptance-r29','{workspace}','{runId}']}},{validation:{...t.validation!,args:['-n',t.validation!.args[1],'{runId}','{workspace}']}},{validation:{...t.validation!,timeoutSec:3601}},{workspaceRoot:'/home/superopen/All-Projects/msf-repair-r28'},{program:'/usr/bin/node'},{engine:'claude'},{maxRounds:2},{machineId:'other'}];
 for(const change of changes){const v={...t,...change};assert.throws(()=>validateExecutionTemplate(v));assert.equal(validateDto('ExecutionTemplate',v).valid,false);}
 for(const change of [{workspace:'/home/superopen/All-Projects/msf-repair-r28/source'},{projectId:'other'},{budgetUSD:1}]){const r={...request(t),...change};assert.throws(()=>validateCandidateValidationRun(t,r));assert.equal(validateDto('ExecutionRequest',r).valid,false);}
});
test('run validation cannot substitute the other registered revision after freezing the template',()=>{
 const t=template('/usr/local/libexec/jarvis-msf-main-acceptance-r28'),r={...request(t),validation:template(S.entry).validation};assert.throws(()=>validateCandidateValidationRun(t,r));assert.doesNotThrow(()=>validateCandidateValidationRun(t,{...r,validation:t.validation}));
});
