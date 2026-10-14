import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import type { PiService } from '../src/pi.js';
import { Store } from '../src/store.js';

// Test transport only. The running application always constructs the real PiService.
function unavailablePi(): PiService {
  return {
    initialize:async()=>{}, health:()=>({configured:false,provider:'',model:'',activeRuns:0}),
    getSettings:async()=>({configured:false,provider:'',model:'',providers:[]}),
    configure:async()=>{},run:async()=>{throw new Error('PI_NOT_CONFIGURED');},abort:async()=>{},dispose:async()=>{},
  } as unknown as PiService;
}
test('authentication, persistence, references and private conversations through HTTP',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'jarvis-http-'));
  let instance=await createApp({dataDir:dir,pi:unavailablePi(),webDir:join(dir,'no-web')});
  try{
    const api=instance.app;
    assert.equal((await api.inject({url:'/api/bootstrap'})).statusCode,401);
    for(const url of ['/%61pi/bootstrap','/api%2fbootstrap','//api/bootstrap','/other/../api/bootstrap']) {
      assert.notEqual((await api.inject({url})).statusCode,200,`Unauthenticated alias ${url}`);
    }
    assert.equal((await api.inject({url:'/api/health',headers:{host:'attacker.example'}})).statusCode,403);
    const badOrigin=await api.inject({method:'POST',url:'/api/auth/setup',headers:{origin:'https://attacker.example',host:'localhost:3001'},payload:{password:'A-long-secret-passphrase'}});
    assert.equal(badOrigin.statusCode,403);
    const short=await api.inject({method:'POST',url:'/api/auth/setup',payload:{password:'short'}});
    assert.equal(short.statusCode,400);
    const setup=await api.inject({method:'POST',url:'/api/auth/setup',payload:{password:'A-long-secret-passphrase'}});
    assert.equal(setup.statusCode,200);
    const cookie=String(setup.headers['set-cookie']).split(';')[0];
    assert.match(String(setup.headers['set-cookie']),/HttpOnly/);
    assert.match(String(setup.headers['set-cookie']),/SameSite=Strict/);
    assert.equal((await api.inject({method:'POST',url:'/api/auth/setup',payload:{password:'Other-passphrase-long'}})).statusCode,409);
    const headers={cookie};
    const bootstrap=(await api.inject({url:'/api/bootstrap',headers})).json();
    assert.equal(bootstrap.devices.length,1);assert.equal(bootstrap.devices[0].id,'local');
    assert.equal(bootstrap.projects.length,0);assert.ok(bootstrap.health.host.memoryTotal>0);
    const device=(await api.inject({method:'POST',url:'/api/devices',headers,payload:{name:'48G 正式机',role:'生产',memoryGB:48}})).json();
    assert.equal(device.status,'unknown');assert.equal(device.lastSeen,null);
    assert.equal((await api.inject({method:'POST',url:'/api/projects',headers,payload:{name:'bad',deviceId:'invented'}})).statusCode,400);
    const project=(await api.inject({method:'POST',url:'/api/projects',headers,payload:{name:'贾维斯',deviceId:'local',description:'真实开发项目',path:'D:/AI/workspaces/MyJevis',status:'active'}})).json();
    assert.ok(project.id);
    const renamed=(await api.inject({method:'PATCH',url:`/api/projects/${project.id}`,headers,payload:{name:'贾维斯平台'}})).json();
    assert.equal(renamed.description,'真实开发项目');assert.equal(renamed.path,'D:/AI/workspaces/MyJevis');assert.equal(renamed.status,'active');
    await api.inject({method:'PATCH',url:'/api/members/owner',headers,payload:{preferences:'中文、简洁'}});
    const owner=(await api.inject({method:'PATCH',url:'/api/members/owner',headers,payload:{name:'管理者'}})).json();
    assert.equal(owner.preferences,'中文、简洁');assert.equal(owner.wakeWord,'贾维斯');
    const task=(await api.inject({method:'POST',url:'/api/tasks',headers,payload:{title:'验证登录',projectId:project.id,notes:'验收：未登录不显示数据'}})).json();
    assert.equal(task.executor,'manual');
    assert.equal((await api.inject({method:'PATCH',url:`/api/tasks/${task.id}`,headers,payload:{status:'done',notes:''}})).statusCode,400);
    assert.equal((await api.inject({method:'PATCH',url:`/api/tasks/${task.id}`,headers,payload:{status:'done',notes:'测试报告：身份隔离检查通过'}})).statusCode,200);
    const experience=(await api.inject({method:'POST',url:'/api/experiences',headers,payload:{title:'验收经验',content:'完成必须附证据',tags:['交付'],projectId:project.id}})).json();
    assert.equal(experience.status,'inbox');
    assert.equal((await api.inject({method:'POST',url:'/api/chat/conversations',headers,payload:{memberId:'someone-else'}})).statusCode,400);
    assert.equal((await api.inject({url:'/api/chat/conversations?memberId=someone-else',headers})).statusCode,403);
    const conversation=(await api.inject({method:'POST',url:'/api/chat/conversations',headers,payload:{memberId:'owner'}})).json();
    const noModel=await api.inject({method:'POST',url:`/api/chat/conversations/${conversation.id}/stream`,headers,payload:{text:'你好'}});
    assert.equal(noModel.statusCode,503);
    assert.equal((await api.inject({url:`/api/chat/conversations/${conversation.id}/messages`,headers})).json().length,0);
    assert.equal((await api.inject({url:'/api/chat/conversations/missing/messages',headers})).statusCode,404);
    await api.close();
    instance=await createApp({dataDir:dir,pi:unavailablePi(),webDir:join(dir,'no-web')});
    const restored=(await instance.app.inject({url:'/api/bootstrap',headers})).json();
    assert.equal(restored.projects[0].name,'贾维斯平台');assert.equal(restored.tasks[0].status,'done');assert.equal(restored.experiences[0].id,experience.id);
    const audit=(await instance.app.inject({url:'/api/audit',headers})).body;
    assert.ok(!audit.includes('A-long-secret-passphrase'));
    await instance.app.inject({method:'POST',url:'/api/auth/logout',headers});
    assert.equal((await instance.app.inject({url:'/api/bootstrap',headers})).statusCode,401);
  }finally{await instance.app.close();await rm(dir,{recursive:true,force:true});}
});
test('SSE transport preserves cancelled results instead of successful completion',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'jarvis-stream-'));
  const transport={...unavailablePi(),health:()=>({configured:true,provider:'test',model:'test',activeRuns:0}),
    run:async(input:any)=>{input.onEvent('delta',{text:'部分回答'});return {text:'部分回答',status:'cancelled' as const};}} as unknown as PiService;
  const {app}=await createApp({dataDir:dir,pi:transport,webDir:join(dir,'no-web')});
  try{
    const setup=await app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'a-long-test-password'}});
    const headers={cookie:String(setup.headers['set-cookie']).split(';')[0]};
    const convo=(await app.inject({method:'POST',url:'/api/chat/conversations',headers,payload:{memberId:'owner'}})).json();
    const stream=await app.inject({method:'POST',url:`/api/chat/conversations/${convo.id}/stream`,headers,payload:{text:'test'}});
    assert.match(stream.headers['content-type'] as string,/text\/event-stream/);assert.match(stream.body,/event: delta/);assert.match(stream.body,/'cancelled'|"cancelled"/);
    const messages=(await app.inject({url:`/api/chat/conversations/${convo.id}/messages`,headers})).json();
    assert.equal(messages[1].status,'cancelled');assert.equal(messages[1].content,'部分回答');
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('database write failure releases the conversation guard',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'jarvis-io-'));
  const transport={...unavailablePi(),health:()=>({configured:true,provider:'test',model:'test',activeRuns:0}),run:async()=>({text:'transport check',status:'complete' as const})} as unknown as PiService;
  const {app,store}=await createApp({dataDir:dir,pi:transport,webDir:join(dir,'no-web')});
  try{
    const setup=await app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'a-long-test-password'}});
    const headers={cookie:String(setup.headers['set-cookie']).split(';')[0]};
    const c=(await app.inject({method:'POST',url:'/api/chat/conversations',headers,payload:{memberId:'owner'}})).json();
    const original=store.addMessage.bind(store);store.addMessage=()=>{throw new Error('test disk write failure');};
    assert.equal((await app.inject({method:'POST',url:`/api/chat/conversations/${c.id}/stream`,headers,payload:{text:'first'}})).statusCode,500);
    store.addMessage=original;
    assert.equal((await app.inject({method:'POST',url:`/api/chat/conversations/${c.id}/stream`,headers,payload:{text:'retry'}})).statusCode,200);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('assistant storage failure still sends an explicit unsaved terminal event',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'jarvis-unsaved-'));
  const transport={...unavailablePi(),health:()=>({configured:true,provider:'test',model:'test',activeRuns:0}),run:async(input:any)=>{input.onEvent('delta',{text:'unsaved fragment'});return {text:'unsaved fragment',status:'complete' as const};}} as unknown as PiService;
  const {app,store}=await createApp({dataDir:dir,pi:transport,webDir:join(dir,'no-web')});
  try{
    const setup=await app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'a-long-test-password'}});
    const headers={cookie:String(setup.headers['set-cookie']).split(';')[0]};
    const c=(await app.inject({method:'POST',url:'/api/chat/conversations',headers,payload:{memberId:'owner'}})).json();
    const original=store.addMessage.bind(store);
    store.addMessage=(actor,id,message)=>{if(message.role==='assistant')throw new Error('test disk failure');return original(actor,id,message);};
    const response=await app.inject({method:'POST',url:`/api/chat/conversations/${c.id}/stream`,headers,payload:{text:'test'}});
    assert.match(response.body,/event: error/);assert.match(response.body,/event: done/);assert.match(response.body,/"persisted":false/);assert.match(response.body,/"status":"failed"/);
    assert.equal(store.messages('server-admin',c.id).length,1);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('shutdown cancels a live stream before waiting for open connections', {timeout:15000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'jarvis-close-'));
  let settle:(value:{text:string;status:'cancelled'})=>void=()=>{};
  let started:()=>void=()=>{};const running=new Promise<void>(r=>{started=r;});
  const transport={...unavailablePi(),health:()=>({configured:true,provider:'test',model:'test',activeRuns:0}),
    run:async()=>new Promise<{text:string;status:'cancelled'}>(resolve=>{settle=resolve;started();}),abort:async()=>{settle({text:'',status:'cancelled'});},dispose:async()=>{settle({text:'',status:'cancelled'});}} as unknown as PiService;
  const {app}=await createApp({dataDir:dir,pi:transport,webDir:join(dir,'no-web')});
  let closed=false;
  try{
    const setup=await app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'a-long-test-password'}});
    const headers={cookie:String(setup.headers['set-cookie']).split(';')[0]};
    const c=(await app.inject({method:'POST',url:'/api/chat/conversations',headers,payload:{memberId:'owner'}})).json();
    await app.listen({host:'127.0.0.1',port:0});const address=app.server.address();assert.ok(address && typeof address!=='string');
    const response=await fetch(`http://127.0.0.1:${address.port}/api/chat/conversations/${c.id}/stream`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({text:'test'})});
    const body=response.text();await running;
    await app.close();closed=true;
    assert.match(await body,/"cancelled"/);
    const restored=new Store(dir);try{assert.equal(restored.messages('server-admin',c.id)[1].status,'cancelled');}finally{restored.close();}
  }finally{settle({text:'',status:'cancelled'});if(!closed)await app.close();await rm(dir,{recursive:true,force:true});}
});
