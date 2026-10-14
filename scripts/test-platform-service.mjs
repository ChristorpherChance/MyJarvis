import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createServer,createConnection} from 'node:net';
import {createServer as createHttpServer} from 'node:http';
import {LocalPlatformSupervisor,controlService,servicePipe,redactServiceLog} from './platform-service.mjs';
const wait=async check=>{for(let i=0;i<200;i++){if(await check())return;await new Promise(r=>setTimeout(r,50));}throw Error('fixture did not become ready');};
test('fixed local supervisor survives an actual child crash and graceful restart, retains logs and rejects unauthenticated control',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-service-test-')),entry=join(dir,'fixture.mjs');
 const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 await writeFile(entry,`import http from 'node:http';const server=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({status:'ok',build:'isolated-fixture',instanceId:process.env.JARVIS_SERVICE_INSTANCE}))});server.listen(${port},'127.0.0.1');console.log('fixture started token=FAKE-PRIVATE-TOKEN');process.on('message',m=>{if(m.type==='jarvis.service.shutdown')server.close(()=>process.exit(0))});`);
 const service=new LocalPlatformSupervisor({dataDir:dir,entry,cwd:dir,healthUrl:`http://127.0.0.1:${port}/api/health`,healthInterval:100,healthTimeout:500,graceMs:2000,startupGraceMs:5000,restartDelays:[60,100],logLimit:1024});
 try{
  await service.start();await wait(()=>service.state.status==='running');const first=service.state.childPid;
  const denied=await new Promise((ok,fail)=>{const c=createConnection(servicePipe(dir));let v='';c.once('connect',()=>c.write(JSON.stringify({command:'stop',key:'0'.repeat(64)})+'\n'));c.on('data',b=>{v+=b;});c.on('end',()=>ok(JSON.parse(v)));c.once('error',fail);});assert.equal(denied.ok,false);assert.equal(service.stopping,false);
  service.child.kill();await wait(()=>service.state.status==='running'&&service.state.childPid!==first);assert.equal(service.state.restarts,1);
  const status=await controlService(dir,'status');assert.equal(status.status,'running');assert.equal(status.lastHealth.build,'isolated-fixture');
  const second=service.state.childPid;await controlService(dir,'restart');await wait(()=>service.state.status==='running'&&service.state.childPid!==second);
  await service.stop();assert.equal(service.state.status,'stopped');const log=await readFile(join(dir,'runtime/local-service/service.log'),'utf8');assert(!log.includes('FAKE-PRIVATE-TOKEN'));assert.match(log,/redacted/);assert.match(log,/supervisor stopped/);
 }catch(error){await service.logQueue;throw new Error(error.message+' '+JSON.stringify(service.state)+' '+await readFile(join(dir,'runtime/local-service/service.log'),'utf8').catch(()=>''),{cause:error});}finally{await service.stop();assert(resolve(dir).startsWith(resolve(tmpdir())+sep)&&dir.includes('jarvis-service-test-'));await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
test('service logs redact access tokens and API keys while preserving actionable diagnostics',()=>{const text=redactServiceLog('API_KEY=abc123 password=sensitive Bearer bbbbbb sk-providersecret123 exit=1');assert(!text.includes('abc123'));assert(!text.includes('sensitive'));assert(!text.includes('bbbbbb'));assert(!text.includes('sk-providersecret123'));assert(text.includes('exit=1'));});
test('unrelated listener cannot make the owned child healthy; quoted passphrases and key blocks remain redacted',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-service-test-')),entry=join(dir,'fixture.mjs'),server=createHttpServer((_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({status:'ok',build:'unrelated-listener',instanceId:'wrong'}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));await writeFile(entry,"setInterval(()=>{},1000);process.on('message',m=>{if(m.type==='jarvis.service.shutdown')process.exit(0)});");
 const service=new LocalPlatformSupervisor({dataDir:dir,entry,cwd:dir,healthUrl:`http://127.0.0.1:${server.address().port}/api/health`,healthInterval:100,healthTimeout:500,startupGraceMs:50,graceMs:1000,restartDelays:[500]});try{await service.start();await wait(()=>service.state.restarts>=1);assert.notEqual(service.state.status,'running');const log=redactServiceLog('password="a private pass phrase" secret=\'two words\'\n-----BEGIN PRIVATE KEY-----\nFAKE-PRIVATE-KEY\n-----END PRIVATE KEY-----');assert(!log.includes('pass phrase'));assert(!log.includes('two words'));assert(!log.includes('FAKE-PRIVATE-KEY'));}finally{await service.stop();server.closeAllConnections();await new Promise(r=>server.close(r));assert(resolve(dir).startsWith(resolve(tmpdir())+sep)&&dir.includes('jarvis-service-test-'));await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
