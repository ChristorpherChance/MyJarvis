import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.js';
import {GovernanceRuntime} from '../src/runtime/governance.js';
import {NativeUsageCollector} from '../src/runtime/pi-usage.js';
import {parseAgentOutput} from '../src/runtime/agent-runner.js';
import {VoiceAdapter} from '../src/runtime/voice-adapter.js';
import {voiceProviderUsage} from '../src/runtime/voice-usage.js';

async function fixture(fn:(ledger:GovernanceRuntime)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'jarvis-usage-completeness-')),store=new Store(dir),ledger=new GovernanceRuntime(store);try{await fn(ledger);}finally{ledger.close();store.close();await rm(dir,{recursive:true,force:true});}}
const receipt=(id:string,at:string,input=10)=>({source:'external-cli' as const,sourceRecordId:id,provider:'codex-cli',model:'observed-model',measuredAt:at,projectId:'factory',machineId:'server-101',inputTokens:input,outputTokens:4,cacheReadTokens:3,totalTokens:input+4,costUSD:null});

test('historical imported receipts stay in their day, paginate independently of totals and reject changed receipts',()=>fixture(async ledger=>{
 const a=receipt('cli:codex:session:turn-a','2025-12-31T16:30:00Z'),b=receipt('cli:codex:session:turn-b','2026-01-02T00:30:00Z',20);
 assert.equal(ledger.importUsage(a).recorded,true);assert.equal(ledger.importUsage(a).recorded,false);assert.throws(()=>ledger.importUsage({...a,inputTokens:99,totalTokens:103}),/同一用量/);
 ledger.importUsage(b);ledger.importUsage({...receipt('unknown','2026-01-03T00:00:00Z'),measurementStatus:'unknown',inputTokens:undefined,outputTokens:undefined,totalTokens:undefined});
 const page=ledger.usagePage({projectId:'factory',limit:1,page:2});assert.equal(page.items.length,1);assert.equal(page.totalCount,3);assert.equal(page.summary.totalTokens,38);assert.equal(page.summary.cacheReadTokens,6);assert.equal(page.summary.unknownCalls,1);assert.equal(page.totalPages,3);
 const summary=ledger.usageSummary({from:'2026-01-01T00:00:00Z',until:'2026-01-03T00:00:00Z',machineId:'server-101'});assert.equal(summary.totals.totalTokens,24);assert.equal(summary.lifetime.totalTokens,38);assert.equal(summary.byProject[0].key,'factory');assert.equal(summary.options.machines[0],'server-101');
 const unknown=ledger.usagePage({page:1,limit:1}).items[0];assert.equal(unknown.measurement_status,'unknown');assert.equal(unknown.total_tokens,null);assert.equal(unknown.cost_usd,null);
 assert.equal(ledger.usagePage({from:'2025-12-31T00:00:00Z',until:'2026-01-01T00:00:00Z'}).items[0].day,'2026-01-01');
}));

test('cancelled SDK calls without receipts are unknown and a late real receipt replaces only the missing-run placeholder',()=>fixture(async ledger=>{
 const meta={runId:'cancelled-sdk',actorId:'server-admin',conversationId:'isolated',provider:'fixture',model:'model',origin:'chat' as const};ledger.beforeRun(meta);ledger.afterRun(meta);ledger.afterRun(meta);assert.equal(ledger.usageSummary().totals.unknownCalls,1);assert.equal(ledger.usageSummary().totals.totalTokens,0);
 ledger.recordUsage({...meta,usageId:'late',inputTokens:5,outputTokens:2,cacheReadTokens:0,cacheWriteTokens:0,totalTokens:7,costUSD:null,costKind:'unavailable',measuredAt:new Date().toISOString()});assert.equal(ledger.usageSummary().totals.unknownCalls,0);assert.equal(ledger.usageSummary().totals.totalTokens,7);
 ledger.reserveExecution({runId:'managed',actorId:'server-admin',executorId:'codex',budgetUSD:.1});assert.equal(ledger.importUsage({...receipt('shadow','2026-01-01T00:00:00Z'),controlledRunId:'managed'}).recorded,true);assert.equal(ledger.usageSummary().totals.totalTokens,21);
 ledger.executionUsage({runId:'execution_managed',actorId:'server-admin',provider:'codex-cli',model:'observed-model',inputTokens:10,outputTokens:4,cacheReadTokens:3,totalTokens:14,costUSD:.05,costKind:'provider-reported',usageId:'managed-final'});assert.equal(ledger.usageSummary().totals.totalTokens,21);assert.equal(ledger.usageSummary().totals.estimatedUSD,.05);assert.equal(ledger.importUsage({...receipt('shadow-again','2026-01-01T00:00:00Z'),controlledRunId:'managed'}).recorded,false);ledger.releaseExecution({runId:'managed',actorId:'server-admin',outcome:'cancelled'});
}));

test('native compaction, cache preheat and cancelled partial replies keep their own actual usage exactly once',()=>{
 const collector=new NativeUsageCollector({runId:'native',actorId:'owner',conversationId:'isolated',provider:'fixture',model:'model',origin:'chat'},true),usage={input:10,output:2,cacheRead:7,cacheWrite:3,totalTokens:22,cost:{input:.01,output:.01,cacheRead:0,cacheWrite:0,total:.02}};
 const compact:any={type:'compaction_end',reason:'threshold',result:{firstKeptEntryId:'kept',usage},aborted:false,willRetry:false};assert.equal(collector.collect(compact)?.totalTokens,22);assert.equal(collector.collect(compact),undefined);
 const warm:any={type:'entry_appended',entry:{type:'usage',id:'warm-id',kind:'cache_warm',provider:'fixture',model:'model',usage}};assert.equal(collector.collect(warm)?.usageKind,'cache-warm');assert.equal(collector.collect({...warm}),undefined);
 const partial:any={type:'message_end',message:{role:'assistant',provider:'fixture',model:'model',timestamp:1,stopReason:'aborted',usage}};assert.equal(collector.collect(partial)?.measurementStatus,'reported');
 const missing:any={type:'message_end',message:{role:'assistant',provider:'fixture',model:'model',timestamp:2,stopReason:'error',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{total:0}}}};assert.equal(collector.collect(missing)?.measurementStatus,'unknown');
});

test('multiple native CLI turns add usage, duplicate known turn IDs do not, and a failed Claude round retains observed partial usage',()=>{
 const turns=[{type:'turn.completed',turn_id:'one',usage:{input_tokens:10,cached_input_tokens:4,output_tokens:3}},{type:'turn.completed',turn_id:'two',usage:{input_tokens:20,cached_input_tokens:8,output_tokens:5}}],parsed=parseAgentOutput('codex',[...turns,turns[0]].map(v=>JSON.stringify(v)));assert.equal(parsed.usage?.inputTokens,30);assert.equal(parsed.usage?.outputTokens,8);assert.equal(parsed.usage?.cacheReadTokens,12);assert.equal(parsed.usage?.totalTokens,38);
 const assistant={type:'assistant',message:{id:'message-1',model:'actual-claude',usage:{input_tokens:2,cache_read_input_tokens:4,cache_creation_input_tokens:1,output_tokens:3}}};const fail=parseAgentOutput('claude',[assistant,assistant,{type:'result',is_error:true,subtype:'error_quota'}].map(v=>JSON.stringify(v)));assert.equal(fail.usage?.totalTokens,10);assert.equal(fail.usage?.model,'actual-claude');assert.equal(fail.usage?.costUSD,undefined);assert.equal(parseAgentOutput('claude',[JSON.stringify({type:'result',is_error:true})]).usage,undefined);
});

test('cloud ASR usage survives invalid transcripts; TTS counts come only from explicit usage headers',async()=>{
 const old=globalThis.fetch,seen:any[]=[];globalThis.fetch=async()=>new Response(JSON.stringify({text:'',usage:{input_tokens:40,output_tokens:2,total_tokens:42}}),{headers:{'content-type':'application/json'}});try{
 const wav=Buffer.alloc(46);wav.write('RIFF');wav.write('WAVE',8);await assert.rejects(new VoiceAdapter({adapter:'http',baseUrl:'https://metered.example.test/v1',model:'cloud-asr',voice:'alloy',language:'auto',format:'wav',timeoutMs:5000},u=>seen.push(u)).transcribe(wav,'audio/wav',new AbortController().signal));assert.equal(seen.length,1);assert.equal(seen[0].totalTokens,42);
 globalThis.fetch=async()=>new Response(JSON.stringify({error:'provider stopped',usage:{input_tokens:5,output_tokens:1,total_tokens:6}}),{status:429});await assert.rejects(new VoiceAdapter({adapter:'http',baseUrl:'https://metered.example.test/v1',model:'cloud-asr',voice:'alloy',language:'auto',format:'wav',timeoutMs:5000},u=>seen.push(u)).transcribe(wav,'audio/wav',new AbortController().signal));assert.equal(seen.length,2);assert.equal(seen[1].totalTokens,6);
 assert.equal(voiceProviderUsage(null,new Headers({'x-ratelimit-remaining-tokens':'9999'})),undefined);assert.equal(voiceProviderUsage(null,new Headers({'x-usage-input-tokens':'6','x-usage-output-tokens':'9','x-usage-total-tokens':'15'}))?.totalTokens,15);
 }finally{globalThis.fetch=old;}
});
