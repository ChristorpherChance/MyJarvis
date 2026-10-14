import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, mkdir, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/store.js';
import { V1Repository } from '../src/v1/repository.js';
import { GovernanceRuntime } from '../src/runtime/governance.js';
import { MemoryRuntime } from '../src/runtime/memory.js';
import type { PiService, PiRunInput, PiUsageRecord } from '../src/pi.js';
import { BusinessError } from '../src/v1/types.js';

async function fixture(work: (f: { directory:string; store:Store; repository:V1Repository; ledger:GovernanceRuntime })=>Promise<void>) {
  const directory=await mkdtemp(join(tmpdir(),'jarvis-runtime-governance-')),store=new Store(directory),repository=new V1Repository(store.databasePath),ledger=new GovernanceRuntime(store);
  try { await work({directory,store,repository,ledger}); } finally { ledger.close();repository.close();store.close();await rm(directory,{recursive:true,force:true}); }
}
const metadata=(runId=randomUUID())=>({runId,actorId:'server-admin',conversationId:'owned_conversation',provider:'offline-fixture',model:'fixture-model',origin:'chat' as const});
const measured=(meta:ReturnType<typeof metadata>,cost:number|null,usageId=randomUUID()):PiUsageRecord=>({...meta,usageId,inputTokens:100,outputTokens:50,cacheReadTokens:0,cacheWriteTokens:0,totalTokens:150,costUSD:cost,costKind:cost===null?'unavailable':'catalog-estimate',measuredAt:new Date().toISOString()});

test('budget reservations are atomic, released and counted independently of supplier invoices',async()=>fixture(async f=>{
  f.ledger.updatePolicy(0,{dailyLimitUSD:0.25,perRunReserveUSD:0.1,maxConcurrent:3});
  const first=metadata(),second=metadata();f.ledger.beforeRun(first);f.ledger.beforeRun(second);
  assert.throws(()=>f.ledger.beforeRun(metadata()),(e:unknown)=>e instanceof BusinessError&&e.code==='BUDGET_EXHAUSTED');
  const usage=measured(first,0.16);f.ledger.recordUsage(usage);f.ledger.recordUsage(usage);
  assert.equal(f.ledger.summary().estimatedUSD,0.16);assert.equal(f.ledger.summary().calls,1);assert.equal(f.ledger.summary().invoicesConnected,false);
  f.ledger.afterRun(first);f.ledger.afterRun(second);assert.equal(f.ledger.summary().active,0);
  assert.throws(()=>f.ledger.beforeRun(metadata()),(e:unknown)=>e instanceof BusinessError&&e.code==='BUDGET_EXHAUSTED');
  assert.throws(()=>f.ledger.updatePolicy(0,{paused:true}),(e:unknown)=>e instanceof BusinessError&&e.code==='CONFLICT');
}));
test('unknown pricing and a pause prevent new calls without manufacturing a zero price',async()=>fixture(async f=>{
  f.ledger.updatePolicy(0,{dailyLimitUSD:1});const meta=metadata();f.ledger.beforeRun(meta);
  assert.throws(()=>f.ledger.recordUsage(measured(meta,null)),(e:unknown)=>e instanceof BusinessError&&e.code==='BUDGET_EXHAUSTED');f.ledger.afterRun(meta);
  assert.equal(f.ledger.summary().unpricedCalls,1);assert.equal(f.ledger.usage()[0].cost_usd,null);
  assert.throws(()=>f.ledger.preflight(),(e:unknown)=>e instanceof BusinessError&&e.code==='BUDGET_EXHAUSTED');
  f.ledger.updatePolicy(1,{dailyLimitUSD:0,paused:true});assert.throws(()=>f.ledger.preflight(),(e:unknown)=>e instanceof BusinessError&&e.code==='REVIEW_REQUIRED');
}));
test('cancelled external calls without receipts remain unpriced and do not invent tokens',async()=>fixture(async f=>{
 f.ledger.updatePolicy(0,{dailyLimitUSD:1});
 f.ledger.reserveExecution({runId:'cancelled',actorId:'server-admin',executorId:'codex',budgetUSD:0.5});
 f.ledger.releaseExecution({runId:'cancelled',actorId:'server-admin',outcome:'cancelled'});
 assert.equal(f.ledger.summary().unreportedRuns,1);assert.equal(f.ledger.summary().totalTokens,0);assert.equal(f.ledger.usage().length,0);assert.equal(f.ledger.summary().reservedUSD,0);
 assert.throws(()=>f.ledger.preflight(),(e:unknown)=>e instanceof BusinessError&&e.code==='BUDGET_EXHAUSTED');
 f.ledger.executionUsage({runId:'execution_cancelled',actorId:'server-admin',provider:'codex',model:'fixture',inputTokens:12,outputTokens:3,costUSD:0.02,usageId:'late-receipt'});
 assert.equal(f.ledger.summary().unreportedRuns,0);assert.equal(f.ledger.summary().totalTokens,15);assert.equal(f.ledger.summary().estimatedUSD,0.02);f.ledger.preflight();
}));
test('Pi extraction checks exact owner quotes, keeps candidates and never writes another member memory',async()=>fixture(async f=>{
  const conversation=f.store.createConversation('member_alice','alice','本人对话',true);f.store.addMessage('member_alice',conversation.id,{role:'user',content:'我喜欢中国历史，也喜欢晚上读书。',status:'complete'});
  const calls:PiRunInput[]=[],removed:string[]=[];
  const pi={health:()=>({configured:true}),run:async(input:PiRunInput)=>{calls.push(input);return {status:'complete',text:JSON.stringify({items:[{text:'喜欢中国历史',category:'学习',evidenceQuote:'我喜欢中国历史'},{text:'喜欢天文学',category:'学习',evidenceQuote:'根本没有说过的话'}]})};},removeConversationSession:async(_actor:string,id:string)=>{removed.push(id);},isRunning:()=>false,abort:async()=>{}} as unknown as PiService;
  const memory=new MemoryRuntime(f.repository,f.store,pi);
  const result=await memory.extract('member_alice',conversation.id,true);assert.equal(result.status,'completed');assert.equal(result.candidateIds.length,1);assert.equal(result.discarded,1);
  assert.equal(memory.records('member_alice')[0].status,'candidate');assert.equal(memory.records('server-admin').length,0);assert.equal(memory.records('member_bob').length,0);
  assert.equal(calls[0].boundedJob,true);assert.equal(calls[0].actorId,'member_alice');assert.equal(removed.length,1);
  await assert.rejects(memory.extract('member_bob',conversation.id,true));await memory.close();
}));
test('never-retain deletes owned message bodies and canonical Pi files while other people remain',async()=>fixture(async f=>{
  const alice=f.store.createConversation('member_alice','alice','alice',true),bob=f.store.createConversation('member_bob','bob','bob',true);
  f.store.addMessage('member_alice',alice.id,{role:'user',content:'用于验收的私人文本',status:'complete'});f.store.addMessage('member_bob',bob.id,{role:'user',content:'另一个成员原话',status:'complete'});
  const file=join(f.directory,'sessions',alice.id,'canonical.jsonl');await mkdir(join(f.directory,'sessions',alice.id),{recursive:true});await writeFile(file,'private');
  const pi={health:()=>({configured:false}),removeConversationSession:async(actor:string,id:string)=>{assert.equal(actor,'member_alice');assert.equal(id,alice.id);await rm(join(f.directory,'sessions',id),{recursive:true,force:true});},isRunning:()=>false,abort:async()=>{}} as unknown as PiService;
  let transcriptPurge=0;const memory=new MemoryRuntime(f.repository,f.store,pi,{purgeTranscripts:async actor=>{assert.equal(actor,'member_alice');transcriptPurge++;}});
  memory.command('policy',{commandId:randomUUID(),expectedVersion:0,scope:'private',payload:{textRetention:'never',audioRetention:'never',longTerm:'explicit'}},'member_alice');
  const result=await memory.cleanup('member_alice',Date.now()+1000);assert.equal(result.removed,1);assert.equal(result.failed,0);assert.equal(transcriptPurge,1);
  assert.equal(f.store.listConversations('member_alice').length,0);assert.equal(f.store.messages('member_bob',bob.id).length,1);await assert.rejects(access(file));await memory.close();
}));
test('a cloud-private profile cannot be analyzed despite an extraction consent flag',async()=>fixture(async f=>{
  const conversation=f.store.createConversation('member_alice','alice','private',true);f.store.addMessage('member_alice',conversation.id,{role:'user',content:'我想学习历史',status:'complete'});
  let calls=0;const pi={health:()=>({configured:true}),run:async()=>{calls++;},abort:async()=>{}} as unknown as PiService;
  const memory=new MemoryRuntime(f.repository,f.store,pi,{cloudAllowed:()=>false});await assert.rejects(memory.extract('member_alice',conversation.id,true),(e:unknown)=>e instanceof BusinessError&&e.code==='FORBIDDEN');assert.equal(calls,0);await memory.close();
}));
