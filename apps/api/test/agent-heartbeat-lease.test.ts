import {test} from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {ExecutionAgent} from '../src/runtime/agent-runner.js';
import {heartbeatFailureCategory,heartbeatLeaseDeadline,heartbeatRenewalDeadline,heartbeatRetryDelay} from '../src/runtime/agent-heartbeat-lease.js';

test('heartbeat retries only proven temporary errors; permissions and invalid responses stop immediately without revealing causes',()=>{
 for(const code of [500,502,503,504])assert.equal(heartbeatFailureCategory(Error('AGENT_HTTP_'+code)),'temporary');
 for(const code of [400,401,403,404,409,422]){assert.equal(heartbeatRetryDelay(Error('AGENT_HTTP_'+code),0,10000),undefined);}
 for(const code of ['ECONNREFUSED','ECONNRESET','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','EPIPE','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_SOCKET'])assert.equal(heartbeatFailureCategory(new TypeError('fetch failed',{cause:{code}})),'temporary');
 for(const code of ['ERR_TLS_CERT_ALTNAME_INVALID','CERT_HAS_EXPIRED','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','AUTHENTICATION_FAILED','UNKNOWN_NON_TEMPORARY_CAUSE'])assert.equal(heartbeatFailureCategory(new TypeError('fetch failed',{cause:{code,message:'private certificate details'}})),'permanent');
 assert.equal(heartbeatFailureCategory(new TypeError('fetch failed',{cause:Error('private certificate verification failed')})),'permanent');
 for(const name of ['AbortError','TimeoutError']){const e=Error('private details',{cause:{code:'CERT_HAS_EXPIRED'}});e.name=name;assert.equal(heartbeatFailureCategory(e),'permanent');}
 assert.equal(heartbeatFailureCategory(new TypeError('fetch failed')),'temporary');const timeout=Error('private detail');timeout.name='TimeoutError';assert.equal(heartbeatFailureCategory(timeout),'temporary');assert.equal(heartbeatFailureCategory(Error('credentials=private-fixture')),'permanent');assert.equal(heartbeatFailureCategory({message:'fetch failed'}),'permanent');
});

test('temporary retry count, delays and lease budget are finite; failure never calculates a new deadline',()=>{
 const error=Error('AGENT_HTTP_503');assert.deepEqual(Array.from({length:7},(_,i)=>heartbeatRetryDelay(error,i,10000)),[500,1000,2000,2000,2000,2000,undefined]);assert.equal(heartbeatRetryDelay(error,0,500),undefined);assert.equal(heartbeatRetryDelay(error,0,499),undefined);assert.equal(heartbeatRetryDelay(error,0,0),undefined);
 const wall=Date.parse('2026-10-11T00:00:00.000Z'),issued='2026-10-11T00:00:10.000Z';assert.equal(heartbeatLeaseDeadline(issued,30,wall,123),10123);assert.equal(heartbeatLeaseDeadline(issued,30,wall+7000,7123),10123);assert.equal(heartbeatLeaseDeadline(issued,30,wall+11000,11123),11123);assert.equal(heartbeatLeaseDeadline('invalid',30,wall,123),123);assert.equal(heartbeatLeaseDeadline('2026-10-11T01:00:00.000Z',30,wall,123),30123);
});

/** Private class state below is an explicit lease/HTTP fixture, not a native task or model invocation. */
async function fixture(handler:(request:any,reply:any,count:number,id:string)=>any,leaseMs=5000){
 const id=randomUUID();let count=0;const app=Fastify({logger:false});app.post('/api/v1/agents/fixture/heartbeat',(request,reply)=>handler(request,reply,++count,id));await app.listen({host:'127.0.0.1',port:0});const address=app.server.address();assert.ok(address&&typeof address==='object');
 const agent=new ExecutionAgent({apiUrl:`http://127.0.0.1:${address.port}`,agentId:'fixture',machineId:'fixture-node',workspaceRoots:[tmpdir()],templates:[{id:'fixture',machineId:'fixture-node',engine:'fixed',program:process.execPath,args:[],workspaceRoot:tmpdir(),maxRounds:1,timeoutSec:5,leaseSec:10,budgetCurrency:'USD'}]});
 const requestWall=Date.now(),requestMonotonic=performance.now(),controller=new AbortController(),issued=new Date(requestWall+leaseMs).toISOString(),state={run:{id,leaseExpiresAt:issued},controller,leaseSec:10,deadline:0,expiryTimer:undefined as NodeJS.Timeout|undefined};(agent as any).leases.set(id,state);(agent as any).setLeaseDeadline(id,heartbeatLeaseDeadline(issued,10,requestWall,requestMonotonic));
 return {agent,controller,state,id,issued,get count(){return count},async close(){clearTimeout(state.expiryTimer);await agent.stop();await app.close();}};
}
const accepted=(id:string,leaseExpiresAt:string)=>({data:{at:new Date().toISOString(),supervised:false,supervisedRunIds:[],stopRunIds:[],renewedLeases:[{runId:id,leaseExpiresAt}]}});

test('real HTTP 503 retries once inside its lease and refreshes only the exact returned expiry',async()=>{
 let actualExpiry='';const f=await fixture((_req,reply,count,id)=>{if(count===1)return reply.code(503).send({code:'RESTARTING'});actualExpiry=new Date(Date.now()+2000).toISOString();return accepted(id,actualExpiry);});
 try{const before=performance.now();await f.agent.heartbeat();assert.ok(performance.now()-before>=450);assert.equal(f.count,2);assert.equal(f.controller.signal.aborted,false);const remaining=f.state.deadline-performance.now();assert.ok(remaining>1000&&remaining<=2000);assert.ok(Date.now()+remaining<=Date.parse(actualExpiry)+20);}finally{await f.close();}
});

test('a real dropped HTTP connection recovers through bounded network retry without stopping the active lease',async()=>{
 const f=await fixture((req,_reply,count,id)=>{if(count===1){req.raw.socket.destroy();return;}return accepted(id,new Date(Date.now()+2000).toISOString());});try{await f.agent.heartbeat();assert.equal(f.count,2);assert.equal(f.controller.signal.aborted,false);}finally{await f.close();}
});

for(const status of [401,403,409])test(`real HTTP ${status} never retries an active lease`,async()=>{
 const f=await fixture((_req,reply)=>reply.code(status).send({code:'DENIED'}));try{await assert.rejects(()=>f.agent.heartbeat(),new RegExp('AGENT_HTTP_'+status));assert.equal(f.count,1);assert.equal(f.controller.signal.aborted,true);}finally{await f.close();}
});

test('central explicit stop is immediate and cannot be undone by an accompanying renewal',async()=>{
 const f=await fixture((_req,_reply,_count,id)=>({data:{...accepted(id,new Date(Date.now()+10000).toISOString()).data,stopRunIds:[id]}}));try{const original=f.state.deadline;await f.agent.heartbeat();assert.equal(f.controller.signal.aborted,true);assert.equal(f.controller.signal.reason.code,'CENTRAL_STOP');assert.equal(f.state.deadline,original);assert.equal(f.count,1);}finally{await f.close();}
});

test('late successful replies never extend an expired lease, even while a network request remains pending',async()=>{
 const f=await fixture(async(_req,_reply,_count,id)=>{await new Promise(resolve=>setTimeout(resolve,600));return accepted(id,new Date(Date.now()+5000).toISOString());},200);
 try{let abortedAt=0;f.controller.signal.addEventListener('abort',()=>{abortedAt=performance.now()},{once:true});const before=performance.now(),pending=f.agent.heartbeat();await new Promise(resolve=>setTimeout(resolve,350));assert.equal(f.controller.signal.aborted,true);assert.ok(abortedAt-before<=330);const original=f.state.deadline;await pending;assert.equal(f.state.deadline,original);assert.equal(f.count,1);}finally{await f.close();}
});

test('successful old-protocol replies without renewed leases cannot extend the initial hard deadline',async()=>{
 const f=await fixture(()=>({data:{at:new Date(Date.now()+60000).toISOString(),supervised:false,supervisedRunIds:[],stopRunIds:[]}}),300);try{const original=f.state.deadline;await f.agent.heartbeat();assert.equal(f.state.deadline,original);await new Promise(resolve=>setTimeout(resolve,400));assert.equal(f.controller.signal.aborted,true);}finally{await f.close();}
});

test('short remaining lease refuses a retry and malformed/expired renewal cannot create authority',async()=>{
 const f=await fixture((_req,reply)=>reply.code(503).send({code:'TEMPORARY'}),250);try{await assert.rejects(()=>f.agent.heartbeat(),/AGENT_HTTP_503/);assert.equal(f.count,1);assert.equal(f.controller.signal.aborted,true);}finally{await f.close();}
 for(const expiry of ['not-a-date',new Date(Date.now()-1000).toISOString()]){const g=await fixture((_req,_reply,_count,id)=>accepted(id,expiry));try{if(expiry==='not-a-date')await assert.rejects(()=>g.agent.heartbeat(),/HEARTBEAT_INVALID/);else await g.agent.heartbeat();assert.equal(g.controller.signal.aborted,true);assert.equal(g.count,1);}finally{await g.close();}}
});

test('idle heartbeat failures have no lease authority and cannot initiate retries or model work',async()=>{
 const f=await fixture((_req,reply)=>reply.code(503).send({code:'TEMPORARY'}));try{clearTimeout(f.state.expiryTimer);(f.agent as any).leases.clear();await assert.rejects(()=>f.agent.heartbeat(),/AGENT_HTTP_503/);assert.equal(f.count,1);}finally{await f.close();}
});

test('central renewal duration deducts full round trip and never depends on a slow client wall clock',()=>{
 const at='2026-10-11T00:00:00.000Z',expires='2026-10-11T00:00:10.000Z';
 assert.equal(heartbeatRenewalDeadline(expires,at,30,100,4100),10100);
 assert.equal(heartbeatRenewalDeadline(expires,at,5,100,4100),5100);
 assert.equal(heartbeatRenewalDeadline(expires,'invalid',30,100,4100),100);
 assert.equal(heartbeatRenewalDeadline(at,expires,30,100,4100),100);
 assert.equal(heartbeatRenewalDeadline(expires,at,30,100,11100),10100);
 const slowWall=Date.parse(at)-3600000;
 assert.equal(heartbeatLeaseDeadline(expires,10,slowWall,100),10100);
 // Response arrival after 4 seconds still leaves only 6 seconds, never a fresh 10.
 assert.equal(heartbeatLeaseDeadline(expires,10,slowWall,100)-4100,6000);
});

test('real delayed heartbeat uses central timestamps and subtracts transport delay even when central time is ahead',async()=>{
 const centralAt='2030-01-01T00:00:00.000Z',expiry='2030-01-01T00:00:01.200Z';
 const f=await fixture(async(_req,_reply,_count,id)=>{await new Promise(resolve=>setTimeout(resolve,350));return {data:{...accepted(id,expiry).data,at:centralAt}};});
 try{const before=performance.now();await f.agent.heartbeat();const after=performance.now();assert.ok(after-before>=300);assert.equal(f.controller.signal.aborted,false);assert.ok(f.state.deadline<=before+1200+10);assert.ok(f.state.deadline-after<=910);assert.ok(f.state.deadline-after>300);}finally{await f.close();}
});

test('real delayed claim consumes lease from request start and immutable receipt; absence of claim timing grants no new authority',async()=>{
 const app=Fastify({logger:false});app.post('/api/v1/agents/fixture/claim',async()=>{await new Promise(resolve=>setTimeout(resolve,300));return {data:{id:randomUUID(),leaseExpiresAt:'2030-01-01T00:00:00.000Z'}};});await app.listen({host:'127.0.0.1',port:0});const address=app.server.address();assert.ok(address&&typeof address==='object');
 const agent=new ExecutionAgent({apiUrl:`http://127.0.0.1:${address.port}`,agentId:'fixture',machineId:'fixture-node',workspaceRoots:[tmpdir()],templates:[]});
 try{const before=performance.now(),run=(await agent.claim())!,after=performance.now();run.leaseExpiresAt='2040-01-01T00:00:00.000Z';const deadline=(agent as any).claimedLeaseDeadline(run,10);assert.ok(after-before>=250);assert.ok(deadline<=before+10000+10);assert.ok(deadline-after<=9760);assert.ok(deadline-after>8000);const missing=(agent as any).claimedLeaseDeadline(run,10);assert.ok(missing<=performance.now());}finally{await agent.stop();await app.close();}
});

test('a renewal arriving after the old monotonic deadline cannot beat a delayed expiry timer',async()=>{
 const f=await fixture((_req,_reply,_count,id)=>accepted(id,new Date(Date.now()+10000).toISOString()));try{clearTimeout(f.state.expiryTimer);f.state.deadline=performance.now()-1;await f.agent.heartbeat();assert.equal(f.controller.signal.aborted,true);assert.equal(f.controller.signal.reason.code,'HEARTBEAT_FAILED');}finally{await f.close();}
});

test('renewal without a valid central issuance timestamp is rejected without extending the lease',async()=>{
 for(const at of [undefined,'invalid']){const f=await fixture((_req,_reply,_count,id)=>({data:{...accepted(id,new Date(Date.now()+10000).toISOString()).data,at}}));try{const original=f.state.deadline;await assert.rejects(()=>f.agent.heartbeat(),/HEARTBEAT_INVALID/);assert.equal(f.controller.signal.aborted,true);assert.equal(f.state.deadline,original);}finally{await f.close();}}
});
