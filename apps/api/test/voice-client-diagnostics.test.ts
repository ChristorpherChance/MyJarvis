import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {Store} from '../src/store.js';
import {IdentityRuntime,MEMBER_COOKIE,type RuntimePrincipal} from '../src/runtime/identity.js';
import {VoiceRuntime,registerVoiceRuntimeRoutes} from '../src/runtime/voice.js';

function snapshot(){return {clientBuild:'20261009-mobile-voice-r15',mode:'direct',phase:'listening',contextState:'running',trackState:'live',muted:false,trackMuted:false,capture:{frames:120,lastFrameAgeMs:32,rms:.012,peak:.08,noiseFloor:.003,threshold:.009,active:true,lastOutcome:'pending',durationMs:1000}};}
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-voice-diagnostics-')),store=new Store(directory);store.setPassword('isolated-admin-password');
 const profiles=new Map<string,any>([['me',{id:'me',name:'Admin'}],['member-a',{id:'member-a',name:'A'}],['member-b',{id:'member-b',name:'B'}]]);
 const identity=new IdentityRuntime(store,{memberExists:id=>profiles.has(id),memberProfile:id=>profiles.get(id)});
 let now=Date.parse('2026-10-09T12:00:00.000Z');const voice=new VoiceRuntime(directory,identity,{defaultLocalTts:false,now:()=>new Date(now)});
 const app=Fastify({logger:false});await app.register(cookie);registerVoiceRuntimeRoutes(app,voice);await app.ready();
 const principal:RuntimePrincipal={actorId:'server-admin',profileId:'me',administrator:true},adminHeaders={cookie:'jarvis_session='+store.createLogin()};
 const create=()=>voice.createSession(principal,'local','study');
 const member=(id:string)=>{identity.setCredential(id,'123456','pin');const login=identity.login(id,'123456','isolated-diagnostics-test');return {principal:login.principal,headers:{cookie:MEMBER_COOKIE+'='+login.token}};};
 return {app,identity,voice,profiles,principal,adminHeaders,create,member,advance:(milliseconds:number)=>{now+=milliseconds;},async close(){await voice.close();await app.close();identity.close();store.close();await rm(directory,{recursive:true,force:true});}};
}
const endpoint=(id:string)=>'/api/runtime/voice/sessions/'+id+'/diagnostics';

test('diagnostics retain only the latest strict snapshot without changing voice state, jobs or usage',async()=>{
 const f=await fixture();try{
  const session=f.create(),url=endpoint(session.id);assert.deepEqual((await f.app.inject({url,headers:f.adminHeaders})).json(),{available:false});
  const first=await f.app.inject({method:'POST',url,headers:f.adminHeaders,payload:snapshot()});assert.equal(first.statusCode,200);assert.equal(first.json().accepted,true);
  const latest=await f.app.inject({url,headers:f.adminHeaders});assert.equal(latest.headers['cache-control'],'private, no-store');assert.deepEqual(latest.json().diagnostics,snapshot());
  assert.equal(Date.parse(latest.json().expiresAt)-Date.parse(latest.json().receivedAt),24*3600_000);
  const ignored=await f.app.inject({method:'POST',url,headers:f.adminHeaders,payload:{...snapshot(),phase:'thinking'}});assert.deepEqual(ignored.json(),{accepted:false,cooldownMs:2000});
  assert.equal((await f.app.inject({url,headers:f.adminHeaders})).json().diagnostics.phase,'listening');
  f.advance(5000);const changed={...snapshot(),contextState:'interrupted',trackMuted:true,capture:{...snapshot().capture,lastOutcome:'interrupted'}};
  assert.equal((await f.app.inject({method:'POST',url,headers:f.adminHeaders,payload:changed})).json().accepted,true);assert.deepEqual((await f.app.inject({url,headers:f.adminHeaders})).json().diagnostics,changed);
  assert.equal(Number(f.identity.db.prepare('SELECT COUNT(*) AS n FROM runtime_voice_client_diagnostics').get()?.n),1);
  assert.deepEqual(f.voice.session(session.id,f.principal),session);
  assert.equal(Number(f.identity.db.prepare('SELECT COUNT(*) AS n FROM runtime_voice_jobs').get()?.n),0);assert.equal(f.voice.guardState(f.principal).usedSeconds,0);
 }finally{await f.close();}
});

test('diagnostics reject sensitive extra fields, unexpected states, oversized bodies and invalid numeric values',async()=>{
 const f=await fixture();try{
  const session=f.create(),url=endpoint(session.id);
  const invalid:unknown[]=[{...snapshot(),text:'must-not-store'},{...snapshot(),audio:'must-not-store'},{...snapshot(),stack:'must-not-store'},{...snapshot(),cookie:'must-not-store'},{...snapshot(),address:'must-not-store'},{...snapshot(),userAgent:'must-not-store'},
   {...snapshot(),capture:{...snapshot().capture,text:'must-not-store'}},{...snapshot(),phase:'arbitrary speech'}, {...snapshot(),clientBuild:'https://private.example'}, {...snapshot(),clientBuild:'a'.repeat(81)}, {...snapshot(),contextState:'unknown'}, {...snapshot(),trackState:'unknown'}];
  for(const [name,value]of [['frames',-1],['frames',.5],['frames',10_000_001],['lastFrameAgeMs',86_400_001],['durationMs',-1],['rms',1.1],['peak',-1],['noiseFloor',null],['threshold','0.1']] as [string,unknown][]){invalid.push({...snapshot(),capture:{...snapshot().capture,[name]:value}});}
  for(const payload of invalid)assert.equal((await f.app.inject({method:'POST',url,headers:f.adminHeaders,payload:payload as any})).statusCode,400);
  for(const value of [NaN,Infinity,-Infinity])assert.throws(()=>f.voice.reportClientDiagnostics(f.principal,session.id,{...snapshot(),capture:{rms:value}}));
  assert.equal((await f.app.inject({method:'POST',url,headers:f.adminHeaders,payload:{...snapshot(),text:'x'.repeat(5000)}})).statusCode,413);
  assert.equal(Number(f.identity.db.prepare('SELECT COUNT(*) AS n FROM runtime_voice_client_diagnostics').get()?.n),0);assert.deepEqual(f.voice.session(session.id,f.principal),session);
 }finally{await f.close();}
});

test('diagnostics enforce session ownership, current identity and paired-terminal authorization for both methods',async()=>{
 const f=await fixture();try{
  const a=f.member('member-a'),b=f.member('member-b'),ticket=f.identity.issuePairing('study-terminal','study',['member-a','member-b']),binding=f.identity.claimPairing(ticket.pairingToken,'isolated-diagnostics-pairing');
  const session=f.voice.createSession(a.principal,'study-terminal','study'),url=endpoint(session.id),aHeaders={...a.headers,'x-jarvis-terminal':binding.terminalToken},bHeaders={...b.headers,'x-jarvis-terminal':binding.terminalToken};
  for(const method of ['GET','POST'] as const){
   const payload=method==='POST'?snapshot():undefined;
   assert.equal((await f.app.inject({method,url,payload})).statusCode,401);
   assert.equal((await f.app.inject({method,url,payload,headers:bHeaders})).statusCode,404);
   assert.equal((await f.app.inject({method,url,payload,headers:f.adminHeaders})).statusCode,404);
   assert.equal((await f.app.inject({method,url,payload,headers:a.headers})).statusCode,401);
   assert.equal((await f.app.inject({method,url,payload,headers:aHeaders})).statusCode,200);
  }
  f.identity.revokeBinding(binding.id);for(const method of ['GET','POST'] as const)assert.equal((await f.app.inject({method,url,headers:aHeaders,payload:method==='POST'?snapshot():undefined})).statusCode,401);
  const newTicket=f.identity.issuePairing('study-terminal','study',['member-a','member-b']),newBinding=f.identity.claimPairing(newTicket.pairingToken,'isolated-diagnostics-pairing-2'),newHeaders={...a.headers,'x-jarvis-terminal':newBinding.terminalToken};
  f.identity.disableCredential('member-a');for(const method of ['GET','POST'] as const)assert.equal((await f.app.inject({method,url,headers:newHeaders,payload:method==='POST'?snapshot():undefined})).statusCode,401);
 }finally{await f.close();}
});

test('diagnostics survive session closure, expire after 24 hours and remain globally bounded at 200 sessions',async()=>{
 const f=await fixture();try{
  const first=f.create();f.voice.reportClientDiagnostics(f.principal,first.id,snapshot());await f.voice.closeSession(f.principal,first.id);assert.equal(f.voice.clientDiagnostics(f.principal,first.id).available,true);
  for(let n=0;n<200;n++){f.advance(1);const session=f.create();f.voice.reportClientDiagnostics(f.principal,session.id,snapshot());}
  assert.equal(Number(f.identity.db.prepare('SELECT COUNT(*) AS n FROM runtime_voice_client_diagnostics').get()?.n),200);assert.equal(f.voice.clientDiagnostics(f.principal,first.id).available,false);
  const retained=f.create();f.advance(5000);f.voice.reportClientDiagnostics(f.principal,retained.id,{...snapshot(),capture:{}});await f.voice.closeSession(f.principal,retained.id);
  f.advance(24*3600_000-1);assert.equal(f.voice.clientDiagnostics(f.principal,retained.id).available,true);f.advance(1);assert.deepEqual(f.voice.clientDiagnostics(f.principal,retained.id),{available:false});
  await f.voice.cleanup();assert.equal(Number(f.identity.db.prepare('SELECT COUNT(*) AS n FROM runtime_voice_client_diagnostics').get()?.n),0);
 }finally{await f.close();}
});

test('a deleted member cannot read or update its retained diagnostics',async()=>{
 const f=await fixture();try{
  const member=f.member('member-a'),ticket=f.identity.issuePairing('member-terminal','study',['member-a']),binding=f.identity.claimPairing(ticket.pairingToken,'isolated-diagnostics-deletion');
  const session=f.voice.createSession(member.principal,'member-terminal','study'),url=endpoint(session.id),headers={...member.headers,'x-jarvis-terminal':binding.terminalToken};
  assert.equal((await f.app.inject({method:'POST',url,headers,payload:snapshot()})).statusCode,200);f.profiles.delete('member-a');
  for(const method of ['GET','POST'] as const)assert.equal((await f.app.inject({method,url,headers,payload:method==='POST'?snapshot():undefined})).statusCode,401);
 }finally{await f.close();}
});
