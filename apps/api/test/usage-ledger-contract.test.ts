import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Ajv2020} from 'ajv/dist/2020.js';
const require=createRequire(import.meta.url),apply=require('../../../scripts/usage-ledger-contract.cjs');

test('usage contract is idempotent, precise, signed and nullable only when metering is unknown',()=>{
  const document=JSON.parse(readFileSync(new URL('../../../docs/openapi-v1-planned.json',import.meta.url),'utf8'));
  apply(document);const first=JSON.stringify(document);apply(document);assert.equal(JSON.stringify(document),first);
  const ajv=new Ajv2020({strict:false,validateFormats:false});ajv.addSchema({components:{schemas:document.components.schemas}},'urn:jarvis:usage-contract');
  const compile=(name:string)=>ajv.compile({$ref:'urn:jarvis:usage-contract#/components/schemas/'+name});
  const input=compile('ExternalUsageInput'),receipt={source:'external-cli',sourceRecordId:'cli:claude:session:message',provider:'claude-cli',model:'actual-model',measuredAt:'2026-10-08T01:00:00Z',inputTokens:12,outputTokens:4,cacheReadTokens:5,totalTokens:16};
  assert(input(receipt),JSON.stringify(input.errors));assert.equal(input({...receipt,inputTokens:undefined}),false);
  assert(input({source:'factory-api',sourceRecordId:'factory:call:1',provider:'actual-provider',model:'actual-model',measuredAt:receipt.measuredAt,measurementStatus:'unknown'}));
  assert.equal(input({...receipt,source:'daily-summary'}),false);assert.equal(input({...receipt,inputTokens:1.5}),false);
  const signed=compile('SignedAgentUsageInput');assert(signed({items:[{...receipt,projectId:'msf'}]}));assert.equal(signed({items:[receipt]}),false);assert.equal(signed({items:[{...receipt,projectId:'msf',source:'factory-api'}]}),false);assert.equal(signed({items:Array(101).fill({...receipt,projectId:'msf'})}),false);
  const record=compile('UsageLedgerRecord'),row={id:'u',run_id:'r',actor_id:'me',provider:'actual-provider',model:'actual-model',origin:'bounded-job',day:'2026-10-08',input_tokens:12,output_tokens:4,cache_read:5,cache_write:0,total_tokens:16,cost_usd:null,cost_complete:0,cost_kind:'unavailable',measured_at:receipt.measuredAt,scenario:'development',source:'external-cli',source_record_id:receipt.sourceRecordId,usage_kind:'external-model',report_kind:'external-model',measurement_status:'reported',project_id:'msf',task_id:null,machine_id:'101',executor_id:null,seconds:null,fingerprint:null};
  assert(record(row),JSON.stringify(record.errors));const unknown={...row,measurement_status:'unknown',input_tokens:null,output_tokens:null,cache_read:null,cache_write:null,total_tokens:null};assert(record(unknown),JSON.stringify(record.errors));assert.equal(record({...unknown,input_tokens:0}),false);assert.equal(record({...row,total_tokens:null}),false);
  const usage=compile('ExecutionReportedUsage');assert(usage({inputTokens:12,outputTokens:4,cacheReadTokens:5,cacheWriteTokens:0,totalTokens:16,provider:'claude-cli',model:'actual-model',usageComplete:false}),JSON.stringify(usage.errors));assert.equal(usage({inputTokens:12,outputTokens:4,cacheReadTokens:-1}),false);assert.equal(usage({inputTokens:12,outputTokens:4,usageComplete:'unknown'}),false);
  for(const path of ['/api/runtime/governance/usage','/api/runtime/governance/usage/summary','/api/runtime/governance/usage/import','/api/v1/agents/{agentId}/usage']){
    for(const operation of Object.values(document.paths[path]) as any[]){assert.equal(operation['x-implementation-status'],'implemented');for(const choice of operation.security)for(const scheme of Object.keys(choice))assert(document.components.securitySchemes[scheme]);}
  }
  assert.deepEqual(document.paths['/api/v1/agents/{agentId}/usage'].post.security,[{AgentEd25519:[]}]);
  assert(document.paths['/api/runtime/governance/usage'].get.parameters.some((p:any)=>p.name==='from'));
  for(const name of ['UsageLedgerPage','UsageLedgerSummary','SignedAgentUsageResult'])compile(name);
});
