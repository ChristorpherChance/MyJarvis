import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,utimes,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {generateKeyPairSync,verify,createHash} from 'node:crypto';
import {receiptFromLine,collectReceipts,canonical,sendReceipts,stableCandidates} from './software-factory-usage-observer.mjs';
const options={workspace:resolve('/example/msf'),projectId:'project',machineId:'machine',executorId:'claude'};
const row=(usage,id='msg1')=>({type:'assistant',cwd:options.workspace,sessionId:'session1',timestamp:'2026-10-09T12:00:00Z',message:{id,model:'reported-model',content:[{text:'SECRET transcript never copied'}],usage}});
test('actual receipts include caches once and only allowlisted numbers and attribution',()=>{
 const item=receiptFromLine(row({input_tokens:10,output_tokens:3,cache_read_input_tokens:7,cache_creation_input_tokens:5}),options);
 assert.equal(item.inputTokens,22);assert.equal(item.totalTokens,25);assert.equal(item.cacheReadTokens,7);assert.equal(item.costUSD,null);
 assert.equal(JSON.stringify(item).includes('SECRET'),false);assert.equal(item.measuredAt,'2026-10-09T12:00:00.000Z');
 assert.equal(receiptFromLine({...row({input_tokens:2,output_tokens:1}),cwd:resolve('/foreign')},options),null);
 assert.equal(receiptFromLine(row({input_tokens:2,output_tokens:-1}),options).measurementStatus,'unknown');
});
test('missing usage remains unknown and a later streaming receipt wins without a second source ID',async()=>{
 const missing=receiptFromLine(row(undefined),options);
 assert.equal(missing.measurementStatus,'unknown');assert.equal(missing.inputTokens,undefined);assert.equal(missing.totalTokens,undefined);
 assert.equal(JSON.stringify(missing).includes('SECRET'),false);
 const folder=await mkdtemp(join(tmpdir(),'jarvis-unknown-usage-'));
 try{
  const file=join(folder,'session.jsonl');
  await writeFile(file,[row(undefined),row({input_tokens:4,output_tokens:2}),row(undefined),row(undefined,'unreported')].map(JSON.stringify).join('\n'));
  await utimes(file,1,1);
  const result=await collectReceipts({...options,receipts:folder});
  assert.equal(result.items.length,2);
  assert.equal(result.items.find(r=>r.sourceRecordId.endsWith('msg1')).totalTokens,6);
  assert.equal(result.items.find(r=>r.sourceRecordId.endsWith('unreported')).measurementStatus,'unknown');
  const state={receipts:{},pendingSnapshots:{}};
  const first=stableCandidates({items:[missing],quietIds:new Set()},state,100000);assert.equal(first.pending.length,0);
  const measured=result.items.find(r=>r.sourceRecordId.endsWith('msg1'));
  assert.equal(stableCandidates({items:[measured],quietIds:new Set()},state,190001).pending.length,0);
  assert.equal(stableCandidates({items:[measured],quietIds:new Set()},state,280002).pending.length,1);
  state.receipts[missing.sourceRecordId]=createHash('sha256').update(canonical(missing)).digest('hex');
  const changed=stableCandidates({items:[measured],quietIds:new Set()},state,380000);
  assert.equal(changed.pending.length,0);assert.deepEqual(changed.changed,[missing.sourceRecordId]);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('streaming messages deduplicate; active sessions remain collectible and foreign files are excluded',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'jarvis-usage-observer-'));
 try{
  const stable=join(folder,'stable.jsonl');await writeFile(stable,[row({input_tokens:10,output_tokens:1}),row({input_tokens:10,output_tokens:5}),row({input_tokens:10,output_tokens:5})].map(JSON.stringify).join('\n'));await utimes(stable,1,1);
  await writeFile(join(folder,'live.jsonl'),JSON.stringify(row({input_tokens:1,output_tokens:1},'live')));
  const foreign=join(folder,'foreign.jsonl');await writeFile(foreign,[row({input_tokens:1,output_tokens:1},'bad'),{type:'user',cwd:resolve('/foreign'),message:'SECRET'}].map(JSON.stringify).join('\n'));await utimes(foreign,1,1);
  const result=await collectReceipts({...options,receipts:folder});assert.equal(result.items.length,2);assert.equal(result.items.find(x=>x.sourceRecordId.endsWith('msg1')).totalTokens,15);assert.equal(result.stats.liveFiles,1);assert.equal(result.stats.foreignFiles,1);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('signed observer uses central canonical protocol and never follows redirects',async()=>{
 const pair=generateKeyPairSync('ed25519'),item=receiptFromLine(row({input_tokens:1,output_tokens:2}),options);
 const config={apiUrl:'https://example.test',agentId:'agent',privateKey:pair.privateKey};
 await sendReceipts(config,[item],async(url,request)=>{
  assert.equal(request.redirect,'error');const body=JSON.parse(request.body),headers=request.headers,path='/api/v1/agents/agent/usage';
  const signed=['POST',path,headers['x-jarvis-timestamp'],headers['x-jarvis-nonce'],createHash('sha256').update(canonical(body)).digest('hex')].join('\n');
  assert.equal(verify(null,Buffer.from(signed),pair.publicKey,Buffer.from(headers['x-jarvis-signature'],'base64url')),true);
  assert.equal(request.body.includes('SECRET'),false);return {ok:true,json:async()=>({version:1,data:{accepted:1,items:[{recorded:true,id:'receipt'}]}})};
 });
 await assert.rejects(sendReceipts(config,[item],async()=>({ok:false,status:403})),/USAGE_HTTP_403/);
 await assert.rejects(sendReceipts(config,[item],async()=>({ok:true,json:async()=>({version:1,data:{}})})),/INVALID_USAGE_RECEIPT/);
 await assert.rejects(sendReceipts(config,[item],async()=>({ok:true,json:async()=>({version:1,data:{accepted:1,items:[]}})})),/INVALID_USAGE_RECEIPT/);
 await sendReceipts(config,[item],async()=>({ok:true,json:async()=>({version:1,data:{accepted:1,items:[{recorded:false,duplicate:true,controlled:true}]}})}));
});
test('continuous sessions settle each message independently and updated snapshots reset stability',()=>{
 const item=receiptFromLine(row({input_tokens:10,output_tokens:1}),options),state={receipts:{}};
 const collected={items:[item],quietIds:new Set()};assert.equal(stableCandidates(collected,state,100000).pending.length,0);
 assert.equal(stableCandidates(collected,state,190001).pending.length,1);
 const updated={...item,outputTokens:5,totalTokens:15};assert.equal(stableCandidates({...collected,items:[updated]},state,200000).pending.length,0);
 assert.equal(stableCandidates({...collected,items:[updated]},state,290001).pending.length,1);
 assert.equal(JSON.stringify(state).includes('SECRET'),false);
});
