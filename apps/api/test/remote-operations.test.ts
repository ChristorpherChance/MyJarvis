import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';

test('remote ops: frozen targets, confirmation, real outbox, permissions, replay, stale binding and durable recovery',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-fixed-ops-')),queue=join(dir,'queue'),configPath=join(dir,'policy.json');
 const make=()=>createApp({dataDir:dir,remoteOperations:{queue,configPath},pi:{initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{}} as unknown as PiService,webDir:join(dir,'none')});
 let rt=await make();rt.store.setPassword('Remote-operations-test-password');const token=rt.store.createLogin(),headers={cookie:'jarvis_session='+token};
 const call=async(method:string,path:string,body?:unknown,expected=200)=>{const r=await rt.app.inject({method:method as any,url:'/api/runtime/remote-ops'+path,headers,payload:body});assert.equal(r.statusCode,expected,r.body);return r.json();};
 const register=async(domain:string,payload:any)=>{const r=await rt.app.inject({method:'POST',url:'/api/v1/'+domain+'/commands/register',headers,payload:{commandId:randomUUID(),scope:'personal',expectedVersion:0,payload}});assert.equal(r.statusCode,200,r.body);return r.json().data;};
 try{
  const device={role:'项目服务器',category:'server',ram:32,cpu:'测试CPU',disk:'256GB',gpu:'无',os:'测试',address:'127.0.0.1',room:'隔离测试',always:false};
  const m=await register('machines',{...device,name:'116 · 测试服务器'}),cold=await register('machines',{...device,name:'101 · 冷备',address:'127.0.0.2'});
  const s=await register('services',{name:'测试服务',description:'固定服务',healthPath:'/health',machineId:m.id,environment:'test',version:'1',method:'systemd',entry:'systemd:test.service'}),protectedService=await register('services',{name:'远程连接',description:'基础设施',healthPath:'/health',machineId:m.id,environment:'production',version:'1',method:'systemd',entry:'systemd:ssh.service'}),c=await register('services',{name:'冷备平台',description:'冷备',healthPath:'/health',machineId:cold.id,environment:'production',version:'1',method:'systemd',entry:'systemd:jarvis-platform.service'});
  await writeFile(configPath,JSON.stringify({version:1,nodes:[{nodeId:'116',machineId:m.id,name:m.name,address:m.address,services:[{id:s.id,unit:'test.service',name:s.name,controllable:true},{id:protectedService.id,unit:'ssh.service',name:protectedService.name,controllable:false}]},{nodeId:'101',machineId:cold.id,name:cold.name,address:cold.address,services:[{id:c.id,unit:'jarvis-platform.service',name:c.name,controllable:true}]}]}));
  await writeFile(join(queue,'results','_status.json'),JSON.stringify({at:new Date().toISOString(),online:true}));
  assert.equal((await call('GET','/capabilities')).controllerOnline,true);
  assert.equal((await rt.app.inject({method:'GET',url:'/api/runtime/remote-ops/capabilities'})).statusCode,401);
  const request={requestId:randomUUID(),target:{kind:'service',id:s.id},action:'restart'},plan=await call('POST','/prepare',request);assert.equal(plan.status,'prepared');assert.equal((await call('POST','/prepare',request)).id,plan.id);
  await call('POST','/prepare',{...request,action:'stop'},409);await call('POST','/jobs/'+plan.id+'/execute',{expectedVersion:1,confirmed:false,confirmTitle:plan.title},400);await call('POST','/jobs/'+plan.id+'/execute',{expectedVersion:1,confirmed:true,confirmTitle:'错误机器'},400);
  assert.equal((await readdir(join(queue,'requests'))).length,0);
  const submitted=await call('POST','/jobs/'+plan.id+'/execute',{expectedVersion:1,confirmed:true,confirmTitle:plan.title});assert.equal(submitted.status,'queued');assert.equal((await call('POST','/jobs/'+plan.id+'/execute',{expectedVersion:1,confirmed:true,confirmTitle:plan.title})).id,plan.id);assert.equal((await readdir(join(queue,'requests'))).filter(n=>n.endsWith('.json')).length,1);
  const raw=JSON.parse(await readFile(join(queue,'requests',plan.id+'.json'),'utf8'));assert.equal(raw.services[0].unit,'test.service');assert(!JSON.stringify(raw).includes(token));
  await writeFile(join(queue,'results',plan.id+'.json'),JSON.stringify({id:plan.id,machineId:cold.id,bindingHash:plan.bindingHash,status:'succeeded'}));assert.equal((await call('GET','/jobs/'+plan.id)).status,'queued');
  await writeFile(join(queue,'results',plan.id+'.json'),JSON.stringify({id:plan.id,machineId:m.id,bindingHash:plan.bindingHash,status:'succeeded',summary:'Isolated fixed executor verified test service'}));assert.equal((await call('GET','/jobs/'+plan.id)).status,'succeeded');
  for(const [target,action,status] of [[{kind:'machine',id:m.id},'start',400],[{kind:'service',id:protectedService.id},'restart',403],[{kind:'service',id:c.id},'start',409],[{kind:'service',id:c.id},'restart',409]] as const)await call('POST','/prepare',{requestId:randomUUID(),target,action},status);
  const power=await call('POST','/prepare',{requestId:randomUUID(),target:{kind:'machine',id:m.id},action:'poweroff'});assert(power.impact.includes('需要人工'));await call('POST','/jobs/'+power.id+'/cancel',{});await call('POST','/jobs/'+power.id+'/execute',{expectedVersion:1,confirmed:true,confirmTitle:power.title},409);
  const stale=await call('POST','/prepare',{requestId:randomUUID(),target:{kind:'service',id:s.id},action:'stop'});const policy=JSON.parse(await readFile(configPath,'utf8'));policy.nodes[0].services[0].controllable=false;await writeFile(configPath,JSON.stringify(policy));await call('POST','/jobs/'+stale.id+'/execute',{expectedVersion:1,confirmed:true,confirmTitle:stale.title},403);policy.nodes[0].services[0].controllable=true;await writeFile(configPath,JSON.stringify(policy));
  const recovery=await rt.app.inject({method:'POST',url:'/api/runtime/remote-ops/recovery-code',headers,payload:{}});assert.equal(recovery.statusCode,200);assert.equal(recovery.headers['cache-control'],'no-store');assert.match(recovery.json().code,/^[A-Za-z0-9_-]{43}$/);
  const session=await rt.app.inject({method:'POST',url:'/api/runtime/remote-ops/control-session',headers,payload:{}});assert.equal(session.statusCode,200);assert(String(session.headers['set-cookie']).includes('HttpOnly'));assert(!JSON.stringify(await call('GET','/jobs')).includes(recovery.json().code));
  const portalId=randomUUID(),portalJob={id:portalId,requestId:portalId,machineId:m.id,bindingHash:'independent-frozen',source:'independent-control',target:{kind:'machine',id:m.id},title:'独立整机诊断',action:'diagnose',status:'queued',revision:1,createdAt:new Date().toISOString()};
  await writeFile(join(queue,'results',portalId+'.json'),JSON.stringify({id:portalId,machineId:m.id,bindingHash:portalJob.bindingHash,source:'independent-control',status:'succeeded',job:portalJob,summary:'实际独立诊断回执'}));const imported=await call('GET','/jobs/'+portalId);assert.equal(imported.status,'succeeded');assert.equal(imported.result.summary,'实际独立诊断回执');assert(!imported.result.job);
  await rt.app.close();rt=await make();assert.equal((await call('GET','/jobs/'+plan.id)).status,'succeeded');assert.equal((await call('POST','/recovery-code',{})).code,recovery.json().code);
  await rename(join(queue,'results'),join(queue,'results-temporarily-unavailable'));try{await new Promise(resolve=>setTimeout(resolve,2300));assert.equal((await rt.app.inject({method:'GET',url:'/api/health'})).statusCode,200);}finally{await rename(join(queue,'results-temporarily-unavailable'),join(queue,'results'));}assert.equal((await call('GET','/jobs/'+plan.id)).status,'succeeded');
 }finally{await rt.app.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});

test('remote voice uses actual targets and explicit selection; ordinary family phrases never become server control',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-ops-voice-')),configPath=join(dir,'policy.json'),rt=await createApp({dataDir:dir,remoteOperations:{configPath},pi:{initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{}} as unknown as PiService,webDir:join(dir,'none')});
 try{
  rt.store.setPassword('Remote-voice-test-passphrase');const headers={cookie:'jarvis_session='+rt.store.createLogin()};
  const registered=await rt.app.inject({method:'POST',url:'/api/v1/machines/commands/register',headers,payload:{commandId:randomUUID(),scope:'personal',expectedVersion:0,payload:{name:'116 · 项目服务器',role:'项目服务器',category:'server',ram:16,cpu:'测试CPU',disk:'256GB',gpu:'无',os:'测试',address:'192.168.10.116',room:'测试',always:false}}});assert.equal(registered.statusCode,200,registered.body);const m=registered.json().data;
  await writeFile(configPath,JSON.stringify({version:1,nodes:[{nodeId:'116',machineId:m.id,name:m.name,address:m.address,services:[]}]}));await writeFile(join(rt.remoteOps!.queue,'results','_status.json'),JSON.stringify({at:new Date().toISOString()}));
  const session=await rt.app.inject({method:'POST',url:'/api/runtime/voice/sessions',headers,payload:{terminalId:'local',roomId:'study'}});assert.equal(session.statusCode,200,session.body);const id=session.json().id;
  const analyze=async(text:string)=>{const r=await rt.app.inject({method:'POST',url:'/api/runtime/voice/sessions/'+id+'/intent',headers,payload:{text}});assert.equal(r.statusCode,200,r.body);return r.json();};
  assert.equal((await analyze('检查一下孩子的作业')).mode,'chat');assert.equal((await analyze('不要重启116服务器')).mode,'chat');assert.equal((await analyze('如何重启116服务器')).mode,'chat');
  const principal=rt.identity!.principal({cookies:{jarvis_session:headers.cookie.split('=')[1]}} as any);
  assert.throws(()=>rt.remoteOps!.voiceCandidate(principal,'重启116上的未知项目'),/请明确/);
  assert.throws(()=>rt.remoteOps!.voiceCandidate(principal,'重启116上的未知应用'),/请明确/);
  const power=rt.remoteOps!.voiceCandidate(principal,'贾维斯，关闭一一六服务器');assert.equal(power?.target.kind,'machine');assert.equal(power?.action,'poweroff');rt.remoteOps!.cancel(principal,power!.id);
  const proposal=(await analyze('诊断116服务器')).proposal;assert.equal(proposal.alternatives[0].action,'remote.operation');assert(proposal.spokenSummary.includes('只读取'));
  const confirmed=await rt.app.inject({method:'POST',url:'/api/runtime/voice/intents/'+proposal.id+'/confirm',headers,payload:{alternativeId:proposal.alternatives[0].id,expectedVersion:proposal.revision,confirmed:true}});assert.equal(confirmed.statusCode,200,confirmed.body);assert.equal(confirmed.json().receipt.domain,'remote-operations');assert(confirmed.json().message.includes('不代表'));
  assert.equal((await rt.app.inject({method:'POST',url:'/api/runtime/voice/intents/'+proposal.id+'/confirm',headers,payload:{alternativeId:proposal.alternatives[0].id,expectedVersion:proposal.revision,confirmed:true}})).statusCode,200);
 }finally{await rt.app.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
