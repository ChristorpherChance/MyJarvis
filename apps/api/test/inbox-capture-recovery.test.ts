import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';

async function fixture() {
  const directory=await mkdtemp(join(tmpdir(),'jarvis-inbox-recovery-http-'));
  let modelCalls=0;
  const pi={initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{},run:async()=>{modelCalls++;throw Error('Unexpected model call in isolated capture test');}} as unknown as PiService;
  let runtime:Awaited<ReturnType<typeof createApp>>;
  try {runtime=await createApp({dataDir:directory,pi,webDir:join(directory,'no-web')});}
  catch(error) {await removeTemporary(directory);throw error;}
  try {await runtime.app.listen({host:'127.0.0.1',port:0});}
  catch(error) {try {await runtime.app.close();}finally{await removeTemporary(directory);}throw error;}
  const address=runtime.app.server.address();assert.ok(address&&typeof address!=='string');
  const base=`http://127.0.0.1:${address.port}`;
  const request=async(path:string,payload?:unknown,cookie='')=>{
    const response=await fetch(base+path,{method:payload===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),...(payload===undefined?{}:{'content-type':'application/json'})},...(payload===undefined?{}:{body:JSON.stringify(payload)}),signal:AbortSignal.timeout(10_000)});
    return {status:response.status,body:await response.json() as any,cookie:response.headers.getSetCookie().filter(value=>!value.startsWith('jarvis_session=;')).map(value=>value.split(';')[0]).join('; ')};
  };
  let setup:Awaited<ReturnType<typeof request>>;
  try {setup=await request('/api/auth/setup',{password:randomUUID()+'-isolated'});assert.equal(setup.status,200);}
  catch(error) {try{await runtime.app.close();}finally{await removeTemporary(directory);}throw error;}
  return {runtime,request,cookie:setup.cookie,async close(){try{await runtime.app.close();}finally{await removeTemporary(directory);}assert.equal(modelCalls,0);}};
}
async function removeTemporary(directory:string){const absolute=resolve(directory);assert.ok(absolute.startsWith(resolve(tmpdir())+sep)&&absolute.includes('jarvis-inbox-recovery-http-'));await rm(absolute,{recursive:true,force:true,maxRetries:10,retryDelay:100});}

test('real HTTP capture replay creates one original and preserves source through tags and research routing',{timeout:30_000},async()=>{
  const f=await fixture();
  try {
    const rawText='  隔离验收：手机临时记下的原话。\n第二行保留空白与来源。  ';
    const envelope={commandId:randomUUID(),expectedVersion:0,scope:'private',payload:{rawText,kind:'idea',terminalId:'手机网页',origin:'manual'}};
    const first=await f.request('/api/v1/inbox/commands/capture',envelope,f.cookie);assert.equal(first.status,200);
    const replay=await f.request('/api/v1/inbox/commands/capture',envelope,f.cookie);assert.equal(replay.status,200);assert.deepEqual(replay.body,first.body);
    const original=first.body.data;
    assert.equal(original.title,rawText.trim().replace(/\s+/g,' ').slice(0,80));assert.equal(original.rawText,rawText);assert.equal(original.terminalId,'手机网页');assert.equal(original.origin,'manual');assert.equal(original.scope,'private');
    const listed=await f.request('/api/v1/inbox?limit=100',undefined,f.cookie);assert.equal(listed.status,200);assert.equal(listed.body.data.items.length,1);
    const annotate=await f.request('/api/v1/inbox/commands/annotate',{commandId:randomUUID(),expectedVersion:original.revision,scope:'private',payload:{inboxId:original.id,title:'整理后标题',note:'隔离的整理批注',tags:['恢复验收','检索标签']}},f.cookie);assert.equal(annotate.status,200);
    assert.equal(annotate.body.data.rawText,rawText);assert.equal(annotate.body.data.terminalId,'手机网页');assert.deepEqual(annotate.body.data.tags,['恢复验收','检索标签']);
    const routed=await f.request('/api/v1/inbox/commands/route',{commandId:randomUUID(),expectedVersion:annotate.body.data.revision,scope:'private',payload:{inboxId:original.id,target:'research'}},f.cookie);assert.equal(routed.status,200);assert.equal(routed.body.data.status,'routed');assert.equal(routed.body.data.target.domain,'research');assert.deepEqual(routed.body.data.tags,['恢复验收','检索标签']);
    const target=await f.request('/api/v1/research/'+routed.body.data.target.id,undefined,f.cookie);assert.equal(target.status,200);assert.equal(target.body.data.sourceInboxId,original.id);assert.equal(target.body.data.raw,rawText);assert.equal(target.body.data.terminalId,'手机网页');assert.equal(target.body.data.scope,'private');
    const source=await f.request('/api/v1/inbox/'+original.id,undefined,f.cookie);assert.equal(source.status,200);assert.equal(source.body.data.rawText,rawText);assert.equal(source.body.data.annotation,'隔离的整理批注');assert.deepEqual(source.body.data.tags,['恢复验收','检索标签']);
  } finally {await f.close();}
});

test('capture private records reject anonymous, family-only and foreign-instance credentials',{timeout:30_000},async()=>{
  const a=await fixture();let b:Awaited<ReturnType<typeof fixture>>|undefined;
  try {
    b=await fixture();
    const created=await a.request('/api/v1/inbox/commands/capture',{commandId:randomUUID(),expectedVersion:0,scope:'private',payload:{rawText:'隔离权限验收 A',kind:'idea',terminalId:'电脑网页',origin:'manual'}},a.cookie);assert.equal(created.status,200);const id=created.body.data.id;
    assert.equal((await a.request('/api/v1/inbox/'+id)).status,401);
    assert.equal((await a.request('/api/v1/inbox/'+id,undefined,b.cookie)).status,401);
    assert.equal((await b.request('/api/v1/inbox/'+id,undefined,b.cookie)).status,404);
    const empty=await b.request('/api/v1/inbox?limit=100',undefined,b.cookie);assert.equal(empty.status,200);assert.equal(empty.body.data.items.length,0);
    const member=a.runtime.store.create('members',{name:'隔离权限成员',role:'adult',preferences:'',voice:'alloy',wakeWord:'隔离验收'});
    a.runtime.identity.setCredential(member.id,'246810','pin');
    const login=await a.request('/api/runtime/identity/login',{profileId:member.id,credential:'246810'});assert.equal(login.status,200);
    assert.equal((await a.request('/api/v1/inbox/'+id,undefined,login.cookie)).status,401);
    assert.equal((await a.request('/api/v1/inbox?limit=100',undefined,login.cookie)).status,401);
    const denied=await a.request('/api/v1/inbox/commands/capture',{commandId:randomUUID(),expectedVersion:0,scope:'private',payload:{rawText:'不得串入管理员收件',kind:'idea',terminalId:'隔离成员',origin:'manual'}},login.cookie);assert.equal(denied.status,401);
  } finally {await Promise.all([a.close(),...(b?[b.close()]:[])]);}
});
