import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../src/store.js';
import {GovernanceRuntime} from '../src/runtime/governance.js';
import {BillingRuntime,parseBillCsv} from '../src/runtime/billing.js';
import {createApp} from '../src/app.js';
import {createBillingTools} from '../src/runtime/billing-tools.js';
import type {PiService} from '../src/pi.js';
const now=()=>new Date().toISOString();
const input=(lines:any[],overrides:any={})=>({format:'json',invoice:{provider:'fixture',account:'owned account',invoiceNumber:randomUUID(),currency:'USD',from:new Date(Date.now()-3600000).toISOString(),until:new Date(Date.now()+3600000).toISOString(),sourceName:'actual-import-fixture.json',...overrides},lines});
async function fixture(work:(f:{directory:string;store:Store;ledger:GovernanceRuntime;billing:BillingRuntime})=>Promise<void>){const directory=await mkdtemp(join(tmpdir(),'jarvis-billing-test-')),store=new Store(directory),ledger=new GovernanceRuntime(store),billing=new BillingRuntime(store);try{await work({directory,store,ledger,billing});}finally{billing.close();ledger.close();store.close();assert(resolve(directory).startsWith(resolve(tmpdir())+sep));await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}}
const seed=(ledger:GovernanceRuntime,id:string,cost:number|null,provider='fixture')=>ledger.recordUsage({runId:'run_'+id,actorId:'server-admin',conversationId:'fixture',provider,model:'model',origin:'chat',usageId:id,inputTokens:3,outputTokens:2,cacheReadTokens:0,cacheWriteTokens:0,totalTokens:5,costUSD:cost,costKind:cost===null?'unavailable':'catalog-estimate',measuredAt:now()});
const imported=(billing:BillingRuntime,payload:any)=>billing.import({requestId:randomUUID(),confirm:true,fingerprint:billing.preview(payload).fingerprint,payload});

test('CSV is bounded data, quoted cells parse, malformed/duplicate/out-of-period rows reject and decimal totals are exact',async()=>fixture(async f=>{
 const at=now(),csv=`id,at,model,amount,usageId\r\n"line,one",${at},"model ""two""",0.100001,\r\n`;
 assert.equal(parseBillCsv(csv)[0].model,'model "two"');assert.equal(parseBillCsv(csv)[0].id,'line,one');
 assert.throws(()=>parseBillCsv('id,at,model,amount\n"unclosed'),/CSV/);assert.throws(()=>parseBillCsv('id,id,at,model,amount\n'),/CSV/);
 const payload=input([{id:'a',at,model:'model',amount:'999999999.123456'},{id:'b',at,model:'model',amount:'999999999.123456'}]);assert.equal(f.billing.preview(payload).totalAmount,'1999999998.246912');
 assert.equal(f.billing.preview(input([{id:'refund',at,model:'model',amount:'-0.123456'},{id:'charge',at,model:'model',amount:'0.1'}])).totalAmount,'-0.023456');
 assert.throws(()=>f.billing.preview(input([{id:'a',at,model:'model',amount:'1e2'}])));
 assert.throws(()=>f.billing.preview(input([{id:'a',at,model:'model',amount:'1'},{id:'a',at,model:'model',amount:'2'}])),/重复/);
 assert.throws(()=>f.billing.preview(input([{id:'a',at:'2000-01-01T00:00:00Z',model:'model',amount:'1'}])),/账期/);
 assert.throws(()=>f.billing.import({requestId:randomUUID(),confirm:true,fingerprint:'0'.repeat(64),payload}),/预览/);
 assert.equal(f.billing.list().items.length,0);
}));
test('confirmed imports and explicit ledger reconciliation are idempotent, preserve real differences and never change budget estimates',async()=>fixture(async f=>{
 seed(f.ledger,'usage_a',.15);seed(f.ledger,'usage_unknown',null);const before=f.ledger.summary(),payload=input([{id:'a',at:now(),model:'model',amount:'0.2',usageId:'usage_a',totalTokens:8},{id:'b',at:now(),model:'model',amount:'0.3',usageId:'usage_unknown'},{id:'c',at:now(),model:'model',amount:'0.4',providerRequestId:'supplier-request-only'}]);
 const command={requestId:randomUUID(),confirm:true as const,fingerprint:f.billing.preview(payload).fingerprint,payload};const bill=f.billing.import(command);assert.deepEqual(f.billing.import(command),bill);assert.equal(imported(f.billing,payload).id,bill.id);
 const reconcile={requestId:randomUUID(),expectedVersion:1},result=f.billing.reconcile(bill.id,reconcile);assert.deepEqual(f.billing.reconcile(bill.id,reconcile),result);assert.equal(result.matchedCount,2);assert.equal(result.lines[0].differenceUSD,'0.050000');assert.equal(result.lines[0].tokenDifference,3);assert.equal(result.lines[1].state,'estimate-unknown');assert.equal(result.lines[1].differenceUSD,null);assert.equal(result.lines[2].state,'unmatched');assert.deepEqual(f.ledger.summary(),before);
 assert.throws(()=>f.billing.reconcile(bill.id,{...reconcile,expectedVersion:2}),/提交编号/);assert.throws(()=>f.billing.reconcile(bill.id,{requestId:randomUUID(),expectedVersion:1}),/刷新/);
 assert.equal(f.billing.ledger({from:payload.invoice.from,until:payload.invoice.until,limit:1}).truncated,true);
}));
test('manual links cannot reuse usage, different currencies do not convert, void releases links and retains immutable evidence',async()=>fixture(async f=>{
 seed(f.ledger,'owned',.2);seed(f.ledger,'wrong',.2,'other');const bill=imported(f.billing,input([{id:'a',at:now(),model:'model',amount:'1.4'}],{currency:'CNY'}));
 assert.throws(()=>f.billing.link(bill.id,'a',{requestId:randomUUID(),expectedVersion:1,usageId:'wrong',note:'fixture mismatch'}),/不一致/);
 const linked=f.billing.link(bill.id,'a',{requestId:randomUUID(),expectedVersion:1,usageId:'owned',note:'reviewed original file'});assert.equal(linked.lines[0].state,'currency-not-comparable');assert.equal(linked.lines[0].differenceUSD,null);
 const other=imported(f.billing,input([{id:'b',at:now(),model:'model',amount:'0.2',usageId:'owned'}]));assert.equal(f.billing.reconcile(other.id,{requestId:randomUUID(),expectedVersion:1}).matchedCount,0);assert.throws(()=>f.billing.link(other.id,'b',{requestId:randomUUID(),expectedVersion:2,usageId:'owned',note:'reuse'}),/另一账单/);
 const voided=f.billing.void(bill.id,{requestId:randomUUID(),expectedVersion:2,reason:'incorrect import reviewed'});assert.equal(voided.status,'void');assert.equal(voided.lines[0].match,null);assert.equal(f.billing.reconcile(other.id,{requestId:randomUUID(),expectedVersion:2}).matchedCount,1);
 assert.throws(()=>f.billing.reconcile(bill.id,{requestId:randomUUID(),expectedVersion:3}),/作废/);assert.equal(f.billing.list().items.length,2);assert.equal(f.billing.summary().byCurrency.USD.bills,1);
 assert(f.billing.events(bill.id).items.some(e=>e.action==='link'&&e.detail.note==='reviewed original file'));assert.equal(f.billing.events(bill.id).items[0].action,'void');
}));
test('billing evidence and request receipts survive reopening without manufacturing live provider connections',async()=>fixture(async f=>{
 const payload=input([{id:'x',at:now(),model:'model',amount:'0.123456'}]),cmd={requestId:randomUUID(),confirm:true as const,fingerprint:f.billing.preview(payload).fingerprint,payload},first=f.billing.import(cmd),again=new BillingRuntime(f.store);
 try{assert.deepEqual(again.import(cmd),first);assert.equal(again.get(first.id).providerConnection,false);assert.equal(again.summary().byCurrency.USD.amount,'0.123456');}finally{again.close();}
}));
test('actual billing routes require administrator identity even in a shared browser, and Pi native summary is read-only and revocation-aware',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-billing-http-')),pi={initialize:async()=>{},dispose:async()=>{},health:()=>({configured:false})} as unknown as PiService,r=await createApp({dataDir:directory,pi,pythonExecutable:join(directory,'none'),whisperModelDirectory:join(directory,'none')});
 try{r.store.setPassword("isolated-billing-fixture-password");const token=r.store.createLogin(),headers={cookie:'jarvis_session='+token},payload=input([{id:'a',at:now(),model:'model',amount:'0.02'}]);assert.equal((await r.app.inject({url:'/api/runtime/governance/billing/imports'})).statusCode,401);
  const preview=await r.app.inject({method:'POST',url:'/api/runtime/governance/billing/preview',headers,payload});assert.equal(preview.statusCode,200,preview.body);const result=await r.app.inject({method:'POST',url:'/api/runtime/governance/billing/imports',headers,payload:{requestId:randomUUID(),confirm:true,fingerprint:preview.json().fingerprint,payload}});assert.equal(result.statusCode,200,result.body);
  r.store.insert('members',{id:'wife',name:'fixture family',role:'adult',wakeWord:'小管家',voice:'默认',preferences:''});r.identity.setCredential('wife','112233','pin');const login=await r.app.inject({method:'POST',url:'/api/runtime/identity/login',payload:{profileId:'wife',credential:'112233'}});assert.equal(login.statusCode,200,login.body);const shared={cookie:headers.cookie+'; '+(Array.isArray(login.headers['set-cookie'])?login.headers['set-cookie']:[String(login.headers['set-cookie'])]).find(value=>value.startsWith('jarvis_member_session='))!.split(';')[0]};assert.equal((await r.app.inject({url:'/api/runtime/governance/billing/imports',headers:shared})).statusCode,403);
  const principal=r.identity.principal({cookies:{jarvis_session:token}} as any),tool=createBillingTools(r.billing,r.identity,principal)[0];assert.equal(tool.annotations?.readOnlyHint,true);const summary=await tool.execute('fixture',{},new AbortController().signal,undefined,{} as never);assert(!JSON.stringify(summary).includes('owned account'));assert.equal(r.billing.list().items.length,1);r.store.deleteLogin(token);await assert.rejects(tool.execute('revoked',{},new AbortController().signal,undefined,{} as never),/管理者/);
 }finally{await r.app.close();assert(resolve(directory).startsWith(resolve(tmpdir())+sep));await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
