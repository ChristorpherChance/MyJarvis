import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,lstat} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {AgentDeliveryJournal} from '../src/runtime/agent-delivery-journal.js';
import {canonicalExecution} from '../src/runtime/execution-runtime.js';
import type {ClaimedRun} from '../src/runtime/execution-types.js';
import {DatabaseSync} from 'node:sqlite';

async function fixture(fn:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'jarvis-delivery-'));try{await fn(root);}finally{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));await rm(root,{recursive:true,force:true});}}
function run(root:string):ClaimedRun{return {id:randomUUID(),machineId:'node',executorId:'fixture',workspace:root,kind:'development',goal:'isolated test',criteria:'independent evidence',maxRounds:2,timeoutSec:5,budgetUSD:1,leaseToken:'private-fixture-lease',leaseExpiresAt:new Date(Date.now()+60000).toISOString()};}
const confirmation=(d:any)=>({deliveryId:d.id,runId:d.runId,kind:d.kind,bodySHA256:createHash('sha256').update(canonicalExecution(d.body)).digest('hex'),accepted:true});

test('durable logs are redacted before disk, restored after close, and removed only after matching confirmation',()=>fixture(async root=>{
 const task=run(root),dir=join(root,'private');let j=new AgentDeliveryJournal(dir,'agent','node');j.register(task);j.started(task.id);j.appendLog(task.id,'stdout','api_key=fixture-private-value hello');const first=j.next()!;assert.match(first.body.entries[0].text,/\[REDACTED\]/);assert.equal(first.body.entries[0].text.includes('fixture-private-value'),false);j.close();j=new AgentDeliveryJournal(dir,'agent','node');const replay=j.next()!;assert.equal(replay.id,first.id);assert.deepEqual(replay.body,first.body);assert.throws(()=>j.acknowledge(replay.id,{...confirmation(replay),bodySHA256:'0'.repeat(64)}),/MISMATCH/);assert.equal(j.summary().pendingLogs,1);j.acknowledge(replay.id,confirmation(replay));assert.equal(j.summary().pendingLogs,0);j.close();if(process.platform!=='win32')assert.equal((await lstat(join(dir,'journal.sqlite'))).mode&0o777,0o600);
}));
test('transient delivery failure keeps the exact body, retries finitely with backoff, and permanent failures block',()=>fixture(async root=>{
 const task=run(root),j=new AgentDeliveryJournal(join(root,'private'),'agent','node',{maxEntries:20,maxBytes:20000,maxAttempts:3,retryBaseMs:10,retryMaxMs:20});try{j.register(task);j.appendLog(task.id,'stdout','safe');const d=j.next(100)!;j.failure(d.id,'AGENT_HTTP_503',100);assert.equal(j.next(109),undefined);assert.equal(j.next(110)!.id,d.id);j.failure(d.id,'AGENT_HTTP_503',110);j.failure(d.id,'AGENT_HTTP_503',130);assert.equal(j.summary().deliveries.blocked,1);assert.equal(j.next(100000),undefined);assert.equal(j.unresolved(),true);}finally{j.close();}
}));
test('duplicate final bodies share one delivery and changed final evidence is refused',()=>fixture(async root=>{
 const task=run(root),j=new AgentDeliveryJournal(join(root,'private'),'agent','node');try{j.register(task);const body={runId:task.id,leaseToken:task.leaseToken,outcome:'failed',rounds:1,exitCode:1,summary:'actual failure',artifacts:[]};const id=j.finish(task.id,body);assert.equal(j.finish(task.id,body),id);assert.throws(()=>j.finish(task.id,{...body,summary:'invented success'}),/CONFLICT/);assert.equal(j.next()!.body.usage,undefined);}finally{j.close();}
}));
test('restart without any usage checkpoint sends explicit unknown instead of null or fabricated zero',()=>fixture(async root=>{const task=run(root),dir=join(root,'private');let j=new AgentDeliveryJournal(dir,'agent','node');j.register(task);j.started(task.id);j.close();j=new AgentDeliveryJournal(dir,'agent','node');try{assert.equal(j.recoverInterrupted(),1);const body=j.next()!.body;assert.deepEqual(body.usage,{measurementStatus:'unknown',usageComplete:false,costComplete:false});assert.equal(body.usage.inputTokens,undefined);assert.equal(body.usage.outputTokens,undefined);}finally{j.close();}}));
test('restart never starts a native process and preserves unknown cost while retaining observed partial tokens',()=>fixture(async root=>{
 const task=run(root),dir=join(root,'private');let j=new AgentDeliveryJournal(dir,'agent','node');j.register(task);j.started(task.id);j.checkpoint(task.id,{rounds:1,sessionId:'exact-project-session',usage:{inputTokens:10,outputTokens:2,costUSD:.1,costKind:'catalog-estimate',usageComplete:true}});j.close();j=new AgentDeliveryJournal(dir,'agent','node');try{assert.equal(j.recoverInterrupted(),1);assert.equal(j.recoverInterrupted(),0);const d=j.next()!;assert.equal(d.body.outcome,'cancelled');assert.equal(d.body.sessionId,'exact-project-session');assert.equal(d.body.usage.inputTokens,10);assert.equal(d.body.usage.usageComplete,false);assert.equal(d.body.usage.costUSD,undefined);assert.equal(j.summary().stopEvents[0].code,'NODE_PROCESS_RESTART');assert.throws(()=>j.register(task),/ALREADY_RECORDED/);assert.throws(()=>j.started(task.id),/NOT_STARTABLE/);}finally{j.close();}
}));
test('concurrent node ownership and wrong identity fail closed',()=>fixture(async root=>{
 const dir=join(root,'private'),j=new AgentDeliveryJournal(dir,'agent','node');try{assert.throws(()=>new AgentDeliveryJournal(dir,'agent','node'),/PROCESS_ALREADY_ACTIVE/);assert.throws(()=>new AgentDeliveryJournal(dir,'other','node'),/IDENTITY_MISMATCH/);}finally{j.close();}
}));
test('bounded log spool reserves capacity for a terminal record instead of silently dropping progress',()=>fixture(async root=>{
 const task=run(root),j=new AgentDeliveryJournal(join(root,'private'),'agent','node',{maxEntries:5,maxBytes:20000,maxAttempts:2,retryBaseMs:10,retryMaxMs:20});try{j.register(task);for(let i=0;i<3;i++)j.appendLog(task.id,'stdout','safe '+i);assert.throws(()=>j.appendLog(task.id,'stdout','overflow'),/CAPACITY_REACHED/);j.finish(task.id,{runId:task.id,leaseToken:task.leaseToken,outcome:'cancelled',exitCode:-1,rounds:1,summary:'spool boundary reached',artifacts:[]});assert.equal(j.summary().deliveries.pending,1);let sentLogs=0;for(let d=j.next();d;d=j.next()){if(d.kind==='logs')sentLogs+=d.body.entries.length;j.acknowledge(d.id,confirmation(d));}assert.equal(sentLogs,3);assert.equal(j.summary().pendingLogs,0);assert.equal(j.unresolved(),false);}finally{j.close();}
}));
test('Chinese pending logs count UTF8 bytes rather than Unicode characters against the payload cap',()=>fixture(async root=>{
 const task=run(root),j=new AgentDeliveryJournal(join(root,'private'),'agent','node',{maxEntries:20,maxBytes:2000,maxAttempts:2,retryBaseMs:10,retryMaxMs:20});try{j.register(task);j.appendLog(task.id,'stdout','中'.repeat(200));assert.throws(()=>j.appendLog(task.id,'stdout','中'.repeat(130)),/CAPACITY_REACHED/);assert.equal(j.summary().pendingLogs,1);}finally{j.close();}
}));
test('Linux stale owner with a reused PID is distinguished by boot and process-start identity',{skip:process.platform!=='linux'},()=>fixture(async root=>{
 const dir=join(root,'private');const first=new AgentDeliveryJournal(dir,'agent','node');first.close();const db=new DatabaseSync(join(dir,'journal.sqlite'));db.prepare('INSERT INTO process_owner(id,pid,token,process_identity) VALUES(1,?,?,?)').run(process.pid,'old-owner','previous-boot:0');db.close();const recovered=new AgentDeliveryJournal(dir,'agent','node');recovered.close();
}));

test('near-full UTF8 spool accepts a large legal final and drains bounded serialized log batches',()=>fixture(async root=>{
 const task=run(root),j=new AgentDeliveryJournal(join(root,'private'),'agent','node');try{j.register(task);let count=0;while(true){try{j.appendLog(task.id,'stdout','中'.repeat(16000));count++;}catch(error){assert.match(String(error),/CAPACITY_REACHED/);break;}}assert.ok(count>500);j.finish(task.id,{runId:task.id,leaseToken:task.leaseToken,outcome:'cancelled',exitCode:-1,rounds:1,summary:'终'.repeat(20000),artifacts:Array.from({length:100},(_,i)=>String(i)+'文'.repeat(1990)+'.md')});let sent=0,largeFinal=false;for(let d=j.next();d;d=j.next()){if(d.kind==='logs'){assert.ok(Buffer.byteLength(canonicalExecution(d.body))<=96*1024);sent+=d.body.entries.length;}else largeFinal=Buffer.byteLength(canonicalExecution(d.body))>512*1024;j.acknowledge(d.id,confirmation(d));}assert.equal(sent,count);assert.equal(largeFinal,true);assert.equal(j.unresolved(),false);}finally{j.close();}
}));

test('control-character logs split by serialized JSON bytes and oversized final evidence is visibly refused',()=>fixture(async root=>{
 const task=run(root),j=new AgentDeliveryJournal(join(root,'private'),'agent','node');try{j.register(task);j.appendLog(task.id,'stdout','\u0001'.repeat(16000));j.appendLog(task.id,'stdout','x'.repeat(16000));const first=j.next()!;assert.equal(first.body.entries.length,1);assert.ok(Buffer.byteLength(canonicalExecution(first.body))<=96*1024);j.acknowledge(first.id,confirmation(first));assert.equal(j.next()!.body.entries.length,1);assert.throws(()=>j.finish(task.id,{summary:'valid',artifacts:['x'.repeat(2*1024*1024+1)]}),/RESULT_BODY_LIMIT/);}finally{j.close();}
}));
