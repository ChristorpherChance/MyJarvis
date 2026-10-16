import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {BusinessError} from '../src/v1/types.js';
import {MemoryRuntime} from '../src/runtime/memory.js';
import {IdentityRuntime,RuntimeAccessError} from '../src/runtime/identity.js';
import type {PiService} from '../src/pi.js';

async function fixture(){
  const directory=await mkdtemp(join(tmpdir(),'jarvis-memory-query-http-')),store=new Store(directory),repository=new V1Repository(store.databasePath);
  store.setPassword('Memory-query-isolated-fixture-passphrase');
  const alice=store.create('members',{name:'隔离成员甲',role:'adult',preferences:'',voice:'clear',wakeWord:'贾维斯'}),bob=store.create('members',{name:'隔离成员乙',role:'adult',preferences:'',voice:'clear',wakeWord:'贾维斯'});
  const identity=new IdentityRuntime(store,{memberExists:id=>['me',alice.id,bob.id].includes(id),memberProfile:id=>id==='me'?{id:'me',name:'本人',preferences:{}}:store.get('members',id)});
  identity.setCredential(alice.id,'123456','pin');identity.setCredential(bob.id,'234567','pin');const a=identity.login(alice.id,'123456','query-alice'),b=identity.login(bob.id,'234567','query-bob');
  let modelCalls=0;const pi={run:async()=>{modelCalls++;throw Error('No model is used by deterministic memory query')},abort:async()=>{},isRunning:()=>false} as unknown as PiService;
  // Exercise the runtime's injected identity boundary with real member and terminal credentials.
  const memory=new MemoryRuntime(repository,store,pi,{principal:req=>{
    if(req.headers['x-jarvis-terminal']){const terminal=identity.terminal(req);return {actorId:'terminal_'+terminal.id,profileId:'terminal',administrator:false};}
    return identity.principal(req);
  }}),app=Fastify({logger:false});await app.register(cookie);
  app.setErrorHandler((error:any,_req,reply)=>reply.status(error instanceof BusinessError?error.status:error instanceof RuntimeAccessError?error.statusCode:error.name==='ZodError'?400:500).send({error:{code:error.code||'VALIDATION',message:error.message}}));memory.register(app);await app.ready();
  const adminToken=store.createLogin(),admin={cookie:'jarvis_session='+adminToken},aliceHeaders={cookie:'jarvis_member_session='+a.token},bobHeaders={cookie:'jarvis_member_session='+b.token};
  const command=(actor:string,name:string,payload:Record<string,unknown>,version=0)=>memory.command(name,{commandId:randomUUID(),expectedVersion:version,scope:'private',payload},actor).data;
  const active=(actor:string,text:string,source='本人明确确认的来源')=>{const candidate=command(actor,'candidate',{text,category:'学习偏好',source});return command(actor,'confirm',{memoryId:candidate.id,confirmed:true},candidate.revision)};
  const query=(question:string,headers=admin,extra:Record<string,unknown>={})=>app.inject({method:'POST',url:'/api/runtime/memory/query',payload:{query:question,...extra},headers});
  return {app,store,repository,identity,memory,alice,bob,a,b,admin,adminToken,aliceHeaders,bobHeaders,command,active,query,async close(){await app.close();await memory.close();identity.close();repository.close();store.close();assert.equal(modelCalls,0);const target=resolve(directory);assert(target.startsWith(resolve(tmpdir())+sep)&&target.includes('jarvis-memory-query-http-'));await rm(target,{recursive:true,force:true});}};
}

test('memory HTTP query searches every allowed active record before limit and reads current edit/forget semantics',async()=>{
  const f=await fixture();try{
    let target:any;for(let i=1;i<=55;i++){const text=i===51?'I prefer NEEDLE-SCHEDULE learning sessions.':`Allowed ordinary note ${i}.`;const record=f.active('server-admin',text,'对话 fixture；证据：'+text);if(i===51)target=record;}
    f.command('server-admin','candidate',{text:'NEEDLE-SCHEDULE candidate must remain separate.',category:'学习偏好',source:'待确认原话'});
    f.active(f.a.principal.actorId,'NEEDLE-SCHEDULE belongs to another member.');
    const response=await f.query('NEEDLE-SCHEDULE',f.admin,{limit:1});assert.equal(response.statusCode,200,response.body);assert.equal(response.headers['cache-control'],'private, no-store');
    const result=response.json();assert.equal(result.actorId,'server-admin');assert.equal(result.total,1);assert.equal(result.records.length,1);assert.equal(result.records[0].id,target.id);assert.equal(result.records[0].quote,target[result.records[0].matchedField]);assert.equal(result.records[0].location,`memory://${target.id}/revision/${target.revision}/${result.records[0].matchedField}`);assert.equal(result.retrieval,'literal-fragments');
    const noMatch=await f.query('UNKNOWN-UNMATCHED-ZYGOMORPHIC');assert.equal(noMatch.statusCode,200);assert.deepEqual(noMatch.json().records,[]);
    const many=await f.query('Allowed',f.admin,{limit:2});assert.equal(many.json().total,54);assert.equal(many.json().records.length,2);
    const edited=f.command('server-admin','edit',{memoryId:target.id,text:'I now prefer CURRENT-REVISION sessions.',confirmed:true},target.revision);
    assert.equal(edited.source,target.source);assert.deepEqual((await f.query('NEEDLE-SCHEDULE')).json().records,[]);
    const current=(await f.query('CURRENT-REVISION')).json().records[0];assert.equal(current.revision,edited.revision);assert.equal(current.sourceEvidenceStatus,'historical-before-edit');assert.equal(current.source,target.source);
    f.command('server-admin','forget',{memoryId:target.id,reason:'本人撤回这条记忆'},edited.revision);assert.deepEqual((await f.query('CURRENT-REVISION')).json().records,[]);
    const originalList=await f.app.inject({url:'/api/runtime/memory',headers:f.admin});assert(originalList.json().items.some((record:any)=>record.status==='candidate'));assert(originalList.json().items.some((record:any)=>record.status==='forgotten'));
  }finally{await f.close();}
});

test('memory query authenticates real member sessions, rejects expired mixed-cookie fallback and never selects an owner from submitted fields',async()=>{
  const f=await fixture();try{
    f.active('server-admin','OWNER-ONLY private record.');f.active(f.a.principal.actorId,'ALICE-ONLY private record.');f.active(f.b.principal.actorId,'BOB-ONLY private record.');
    const family=(question:string,headers:Record<string,string>,extra:Record<string,unknown>={})=>f.app.inject({method:'POST',url:'/api/runtime/family/memory/query',payload:{query:question,...extra},headers});
    assert.equal((await f.query('OWNER-ONLY',{cookie:''})).statusCode,401);assert.equal((await f.query('OWNER-ONLY',f.aliceHeaders)).statusCode,401);
    const mixed={cookie:f.admin.cookie+'; '+f.aliceHeaders.cookie};
    const own=await family('ALICE-ONLY',mixed);assert.equal(own.statusCode,200,own.body);assert.equal(own.json().actorId,f.a.principal.actorId);assert.equal(own.json().total,1);
    assert.deepEqual((await family('OWNER-ONLY',mixed)).json().records,[]);assert.deepEqual((await family('BOB-ONLY',mixed)).json().records,[]);
    for(const headers of [mixed,{cookie:f.admin.cookie+'; jarvis_member_session=expired-member'},{cookie:f.admin.cookie+'; jarvis_member_session='}]){
      const denied=await f.query('OWNER-ONLY',headers);assert.equal(denied.statusCode,403,denied.body);assert(!denied.body.includes('OWNER-ONLY private record.'),'成员Cookie存在时绝不返回管理员正文');
    }
    for(const cookie of [f.admin.cookie+'; jarvis_member_session=expired-member',f.admin.cookie+'; jarvis_member_session=']){
      const denied=await family('OWNER-ONLY',{cookie});assert.equal(denied.statusCode,401,denied.body);assert(!denied.body.includes('OWNER-ONLY private record.'));
    }
    const ticket=f.identity.issuePairing('query-fixture-terminal','study',[f.alice.id]),paired=f.identity.claimPairing(ticket.pairingToken,'query-terminal');
    const terminalDenied=await f.query('OWNER-ONLY',{...f.admin,'x-jarvis-terminal':paired.terminalToken});assert.equal(terminalDenied.statusCode,403,terminalDenied.body);assert(!terminalDenied.body.includes('OWNER-ONLY private record.'),'终端身份不能借残留管理员Cookie读取管理员正文');
    const pureAdmin=await f.query('OWNER-ONLY');assert.equal(pureAdmin.statusCode,200,pureAdmin.body);assert.equal(pureAdmin.json().actorId,'server-admin');assert.equal(pureAdmin.json().records[0].text,'OWNER-ONLY private record.');
    assert.equal((await family('OWNER-ONLY',f.aliceHeaders,{actorId:'server-admin'})).statusCode,400);
    f.identity.disableCredential(f.alice.id);assert.equal((await family('OWNER-ONLY',mixed)).statusCode,401);assert.equal((await family('ALICE-ONLY',f.aliceHeaders)).statusCode,401);
    f.store.deleteLogin(f.adminToken);assert.equal((await f.query('OWNER-ONLY')).statusCode,401);
  }finally{await f.close();}
});

test('memory query validates query and limit strictly without writing questions, receipts or candidates',async()=>{
  const f=await fixture();try{
    const version=f.repository.version('server-admin');
    for(const payload of [{query:''},{query:'  '},{query:'字'.repeat(1001)},{query:'有效',limit:0},{query:'有效',limit:51},{query:'有效',limit:1.2},{query:'有效',limit:'20'},{query:'有效',limit:true},{query:'有效',profileId:'another'}]){
      const response=await f.app.inject({method:'POST',url:'/api/runtime/memory/query',payload,headers:f.admin});assert.equal(response.statusCode,400,response.body);
    }
    for(const base of ['/api/runtime/memory','/api/runtime/family/memory'])assert.equal((await f.app.inject({url:base+'/query?query=有效',headers:f.admin})).statusCode,404,'新查询只接受JSON POST，不保留含私人问题的GET别名');
    assert.equal((await f.query('有效')).statusCode,200);assert.equal(f.repository.version('server-admin'),version);assert.equal(f.memory.records('server-admin').length,0);
  }finally{await f.close();}
});
