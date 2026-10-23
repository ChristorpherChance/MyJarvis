import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { plannedContract, validateDto, assertReceipt } from '../src/v1/contract.js';

const policy = {billing:'priced',maxTokens:500000,maxRecoveryAttempts:3,retryDelaySec:900,repairValidation:true,fallbackExecutorIds:[],inputUSDPerMillion:2,outputUSDPerMillion:8};
const template = {id:'msf-101-claude',machineId:'machine-101',engine:'claude',program:'/usr/bin/claude',args:['--print','{prompt}'],workspaceRoot:'/projects',maxRounds:10,timeoutSec:1200,leaseSec:60,budgetCurrency:'USD',supervision:policy};
const request = {id:'8bf9837f5730adc49abd178d6c3ea49b97281742',domain:'tasks',objectId:'task',taskId:'task',kind:'development',machineId:'machine-101',executorId:template.id,projectId:'project',workspace:'/projects/msf',goal:'Verify connection',criteria:'Native receipt and fixed validation',maxRounds:1,timeoutSec:120,budgetUSD:1,remainingTokens:500000,template,sessionBilling:{engine:'claude',sessionId:'native-session',costUSD:.25},handoff:{executorId:'previous',summary:'Previous validated work'}};
const usage = {inputTokens:12,outputTokens:5,cacheReadTokens:3,cacheWriteTokens:1,totalTokens:17,provider:'gateway',model:'model',usageComplete:true,costUSD:.01,costKind:'catalog-estimate'};
const result = {outcome:'success',exitCode:0,rounds:1,summary:'Connection verified',artifacts:[],usage,validation:{exitCode:0},source:'signed-agent',verification:'executor-observed-not-human-accepted',at:'2026-10-10T00:00:00.000Z',sessionBilling:{engine:'claude',sessionId:'native-session',costUSD:.26},recovery:{kind:'network',automatic:false,attempts:1}};

function valid(name:string,value:unknown) {const check=validateDto(name,value);assert.equal(check.valid,true,JSON.stringify(check.errors));}

test('a complete supervised start receipt accepts the actual native execution metadata',()=>{
 valid('ExecutionRequest',request);
 const task={id:'task',revision:2,scope:'personal',ownerId:'server-admin',title:'Connection verification',projectId:'project',machineId:'machine-101',agent:template.id,mode:'managed',goal:request.goal,criteria:request.criteria,status:'running',progress:0,budget:1,cost:0,retryLimit:0,retries:0,lease:null,artifacts:[],updatedAt:result.at,executionRequest:request,executionStatus:'queued'};
 assert.doesNotThrow(()=>assertReceipt('/api/v1/tasks/commands/start',{requestId:'command',version:2,data:task,events:[]}));
 valid('Task',{...task,status:'validating',executionStatus:'succeeded',executionResult:result});
 valid('ExecutionResultInput',{runId:request.id,leaseToken:'lease',outcome:'success',exitCode:0,rounds:1,summary:'Verified',usage,validation:{exitCode:0},sessionId:'native-session',sessionBilling:result.sessionBilling,failureKind:'network'});
 valid('ExecutionResult',{...result,executionMetadata:{agentBuild:'fixture-build',programSha256:'a'.repeat(64),invocationId:'invocation-1'}});
 valid('ExecutionResultInput',{runId:request.id,leaseToken:'lease',outcome:'success',exitCode:0,rounds:1,summary:'Verified',usage,validation:{exitCode:0},sessionId:'native-session',sessionBilling:result.sessionBilling,executionMetadata:{agentBuild:'fixture-build',programSha256:'a'.repeat(64),invocationId:'invocation-1'}});
});

test('native metadata keeps strict bounds and rejects unsupported fields',()=>{
 for(const value of [{...request,remainingTokens:-1},{...request,remainingTokens:10000001},{...request,unknown:true},{...request,handoff:{executorId:'x',summary:'x',shell:'unsafe'}},{...request,sessionBilling:{engine:'claude',sessionId:'../foreign',costUSD:1}},{...request,template:{...template,supervision:{...policy,inputUSDPerMillion:undefined}}},{...request,template:{...template,supervision:{...policy,maxRecoveryAttempts:9}}}])assert.equal(validateDto('ExecutionRequest',JSON.parse(JSON.stringify(value))).valid,false);
 assert.equal(validateDto('ExecutionResult',{...result,recovery:{...result.recovery,kind:'unsupported'}}).valid,false);
 assert.equal(validateDto('ExecutionResultInput',{runId:'run',leaseToken:'lease',outcome:'success',exitCode:0,rounds:1,summary:'Verified',usage:{...usage,ledgerRecorded:true}}).valid,false);
});

test('regenerating execution and usage contracts preserves native metadata and strictness',()=>{
 const require=createRequire(import.meta.url),copy=structuredClone(plannedContract);
 require('../../../scripts/execution-runtime-contract.cjs')(copy);
 require('../../../scripts/usage-ledger-contract.cjs')(copy);
 for(const [name,fields] of Object.entries({ExecutionTemplate:['supervision'],ExecutionRequest:['remainingTokens','sessionBilling','handoff'],ExecutionResult:['sessionBilling','recovery'],ExecutionResultInput:['sessionBilling','failureKind'],ExecutionActualUsage:['cacheReadTokens','totalTokens','usageComplete']})){
  assert.equal(copy.components.schemas[name].additionalProperties,false);
  for(const field of fields)assert.deepEqual(copy.components.schemas[name].properties[field],plannedContract.components.schemas[name].properties[field]);
 }
 assert.deepEqual(copy.components.schemas.CliSupervisionPolicy.dependencies,{inputUSDPerMillion:['outputUSDPerMillion'],outputUSDPerMillion:['inputUSDPerMillion']});
 const conditional=copy.components.schemas.ExecutionResult.allOf.find((rule:any)=>rule.if?.properties?.notStarted);
 assert.deepEqual(conditional.if.required,['notStarted']);
});
