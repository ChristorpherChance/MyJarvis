import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,unlink,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {createApp} from '../src/app.js';
import {validateServiceProcesses} from '../src/runtime/service-process.js';
import type {PiService} from '../src/pi.js';

test('running projects: real HTTP health, encrypted credentials, idempotency, resource attribution, isolation and restore',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-applications-'));const pi=()=>({initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{}}as unknown as PiService);
 let status=200;const server=createServer((_req,res)=>{res.writeHead(status);res.end('test');});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert(address&&typeof address!=='string');const url='http://127.0.0.1:'+address.port;
 let runtime=await createApp({dataDir:dir,pi:pi(),webDir:join(dir,'none')});
 try{
  runtime.store.setPassword('Applications-testing-passphrase');const headers={cookie:'jarvis_session='+runtime.store.createLogin()};const base='/api/runtime/applications';
  const call=async(method:string,path:string,body?:any,expected=200)=>{const r=await runtime.app.inject({method:method as any,url:base+path,headers,payload:body});assert.equal(r.statusCode,expected,r.body);return r.json();};
  const command=(expectedVersion=0)=>({commandId:randomUUID(),expectedVersion});
  const v1=async(domain:string,payload:any)=>{const r=await runtime.app.inject({method:'POST',url:'/api/v1/'+domain+'/commands/register',headers,payload:{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload}});assert.equal(r.statusCode,200,r.body);return r.json().data;};
  const device={role:'项目机器',category:'server',ram:32,cpu:'测试CPU',disk:'256GB',gpu:'无',os:'测试系统',address:'127.0.0.1',room:'隔离测试',always:false};
  const m=await v1('machines',{...device,name:'测试服务器'}),other=await v1('machines',{...device,name:'其他服务器',ram:16});
  const services=[];for(const unit of ['test-main.service','test-worker.service'])services.push(await v1('services',{name:unit,description:'测试实际项目绑定',healthPath:'/health',machineId:m.id,environment:'test',version:'1.0',method:'systemd',entry:'systemd:'+unit}));
  const data={name:'部署测试项目',description:'应用与底层服务分开管理',machineId:m.id,serviceIds:services.map(s=>s.id),url,loginUrl:url+'/login',health:{enabled:true,url,expectedStatus:200,intervalSec:60,timeoutSec:2}};
  const create={...command(),data},created=await call('POST','',create);assert.deepEqual(await call('POST','',create),created);
  await call('POST','',{...create,data:{...data,name:'改变原提交'}},409);await call('POST','',{...command(),data:{...data,machineId:other.id}},403);
  const id=created.id;assert.equal((await call('GET','/'+id)).credentialConfigured,false);
  const secret={...command(created.revision),username:'actual-user-test-only',password:'test-secret-no-plaintext-123'};
  const saved=await call('POST','/'+id+'/credentials',secret);assert.deepEqual(await call('POST','/'+id+'/credentials',secret),saved);
  assert(!JSON.stringify(await call('GET','/'+id)).includes(secret.password));assert(!JSON.stringify(await call('GET','')).includes(secret.username));
  for(const table of ['runtime_application_credentials','runtime_application_commands','runtime_applications','audit']){const rows=runtime.identity.db.prepare('SELECT * FROM '+table).all();assert(!JSON.stringify(rows).includes(secret.password),table+' plaintext password leak');assert(!JSON.stringify(rows).includes(secret.username),table+' plaintext username leak');}
  const revealed=await runtime.app.inject({method:'POST',url:base+'/'+id+'/credentials/reveal',headers,payload:{}});assert.equal(revealed.statusCode,200);assert.equal(revealed.headers['cache-control'],'no-store');assert.equal(revealed.json().password,secret.password);
  assert.equal((await runtime.app.inject({method:'POST',url:base+'/'+id+'/credentials/reveal',payload:{}})).statusCode,401);
  await call('PUT','/'+id,{...command(created.revision),data},409);
  assert.equal((await call('POST','/'+id+'/check',{})).state,'healthy');status=503;assert.equal((await call('POST','/'+id+'/check',{})).state,'degraded');
  const observedAt=new Date().toISOString();for(const [index,s] of services.entries())runtime.v1.execute({domain:'services',commands:['observe'],execute:(_c,_p,c)=>{const old=c.require('services',s.id);return c.update('services',s.id,{processObservation:{serviceId:s.id,unit:s.entry.slice(8),activeState:'active',subState:'running',observedAt,source:'signed-agent-systemd',verification:'node-observed-not-application-health',processStatus:'running',agentId:randomUUID(),receivedAt:observedAt,resources:{cpuPercent:index+2,memoryUsedGB:(index+1)/4,directory:'/opt/test-project',diskUsedGB:1.25,diskObservedAt:observedAt}}});}},'observe',{commandId:randomUUID(),expectedVersion:s.revision,scope:'personal',payload:{}},'server-admin',()=>undefined);
  const actual=await call('GET','/'+id);assert.equal(actual.resources.cpuPercent.value,5);assert.equal(actual.resources.memoryUsedGB.value,.75);assert.equal(actual.resources.diskUsedGB,1.25,'same directory counted once');
  const shared=await call('POST','',{...command(),data:{...data,name:'共享单元项目',serviceIds:[services[0].id],health:{enabled:false}}});assert.equal((await call('GET','/'+id)).resources.sharedServiceIds.length,1);
  const page=await call('GET','?machineId='+m.id+'&limit=1&page=2');assert.equal(page.items[0].id,shared.id);assert.equal(page.total,2);assert.equal((await call('GET','?machineId='+other.id)).total,0);
  await call('POST','',{...command(),data:{...data,name:'URL凭据拒绝',url:'http://user:password@example.com'}},400);
  await call('POST','',{...command(),data:{...data,name:'拒绝未知字段',password:'wrong-channel'}},400);
  const clear=await call('POST','/'+id+'/credentials/clear',command(saved.revision));assert.equal((await call('GET','/'+id)).credentialConfigured,false);await call('POST','/'+id+'/credentials/reveal',{},404);
  const resaved=await call('POST','/'+id+'/credentials',{...command(clear.revision),username:secret.username,password:secret.password});
  const archived=await call('POST','/'+shared.id+'/archive',command(shared.revision));assert.equal(archived.revision,2);assert.equal((await call('GET','')).total,1);
  await runtime.app.close();const key=join(dir,'runtime','voice-master.key'),original=await readFile(key);await unlink(key);
  await assert.rejects(()=>createApp({dataDir:dir,pi:pi(),webDir:join(dir,'none')}),/密钥缺失/);await assert.rejects(readFile(key),{code:'ENOENT'});await writeFile(key,original,{mode:0o600});
  runtime=await createApp({dataDir:dir,pi:pi(),webDir:join(dir,'none')});assert.equal(runtime.applications.reveal('server-admin',id).password,secret.password);assert.equal(runtime.applications.read('server-admin',id).revision,resaved.revision);
  assert.throws(()=>runtime.applications.read('another-owner',id));
 }finally{await runtime.app.close();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});

test('service resource observations bind to the unit and refuse anonymous or stale directory claims',()=>{
 const now=Date.now(),observedAt=new Date(now).toISOString(),service={id:'s',machineId:'m',method:'systemd',entry:'systemd:test.service',scope:'personal'},item={serviceId:'s',unit:'test.service',activeState:'active',subState:'running',observedAt,resources:{memoryUsedGB:.125,cpuPercent:0,directory:'/opt/actual',diskUsedGB:1,diskObservedAt:observedAt}};
 const valid=validateServiceProcesses({machineId:'m',capabilities:['service-status']},[item],()=>service,now);assert.equal(valid[0].observation.resources?.cpuPercent,0);
 assert.throws(()=>validateServiceProcesses({machineId:'m',capabilities:[]},[item],()=>service,now));
 assert.throws(()=>validateServiceProcesses({machineId:'m',capabilities:['service-status']},[{...item,resources:{...item.resources,directory:'/'}}],()=>service,now));
 assert.throws(()=>validateServiceProcesses({machineId:'m',capabilities:['service-status']},[{...item,resources:{...item.resources,diskObservedAt:new Date(now-7200001).toISOString()}}],()=>service,now));
});
