import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';

test('activity history skips periodic telemetry without losing audit, scope, pagination or original observations',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-event-observations-'));
 const pi={initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{}} as unknown as PiService;
 const runtime=await createApp({dataDir:dir,pi,webDir:join(dir,'none')});
 try{
  runtime.store.setPassword('Observations-test-passphrase');
  const cookie='jarvis_session='+runtime.store.createLogin();
  const db=new DatabaseSync(runtime.store.databasePath);
  const add=db.prepare('INSERT INTO v1_events(id,actor_id,scope,domain,object_id,type,payload,at) VALUES(?,?,?,?,?,?,?,?)');
  try{
   db.exec('BEGIN');
   for(let i=0;i<150;i++)add.run(randomUUID(),'server-admin','personal',i%2?'machines':'services','node-1',i%2?'agent-heartbeat':'service-process-observed','{}',new Date().toISOString());
   for(const [domain,type,scope] of [['machines','updated','personal'],['services','failed','personal'],['inbox','agent-heartbeat','personal'],['machines','agent-heartbeat','family'],['services','service-process-observed','family'],['inbox','captured','family']])add.run(randomUUID(),'server-admin',scope,domain,'node-1',type,'{}',new Date().toISOString());
   add.run(randomUUID(),'another-owner','personal','inbox','other','captured','{}',new Date().toISOString());
   db.exec('COMMIT');
  }finally{db.close();}
  const read=async(query:string)=>{const r=await runtime.app.inject({url:'/api/v1/events/history?'+query,headers:{cookie}});assert.equal(r.statusCode,200,r.body);return r.json().data;};
  const first=await read('excludeObservations=true&limit=2');assert.deepEqual(first.items.map((e:any)=>e.type),['updated','failed']);
  const next=await read('excludeObservations=true&limit=2&afterSequence='+first.items.at(-1).sequence);assert.deepEqual(next.items.map((e:any)=>e.type),['agent-heartbeat','captured']);assert.equal(next.latestSequence,first.latestSequence);
  assert.deepEqual((await read('excludeObservations=true&scope=family')).items.map((e:any)=>e.type),['captured']);
  assert.equal((await read('excludeObservations=true&domain=services&objectId=node-1')).items.length,1);
  assert.equal((await read('excludeObservations=true&afterSequence='+first.latestSequence)).items.length,0);
  const original=await read('limit=100');assert.equal(original.items.length,100);assert(original.items.every((e:any)=>['agent-heartbeat','service-process-observed'].includes(e.type)));assert.deepEqual(await read('excludeObservations=false&limit=100'),original);
  assert.equal(runtime.v1.events('server-admin',0,200).length,156,'all signed observations remain saved');
  assert.equal((await runtime.app.inject({url:'/api/v1/events/history?excludeObservations=0',headers:{cookie}})).statusCode,400);
  assert.equal((await runtime.app.inject({url:'/api/v1/events/history?excludeObservations=true'})).statusCode,401);
 }finally{await runtime.app.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
