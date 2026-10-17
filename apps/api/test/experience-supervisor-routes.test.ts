import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {captureHandlers} from '../src/v1/capture-domains.js';
import {V1Repository} from '../src/v1/repository.js';
import {Store} from '../src/store.js';
import {IdentityRuntime} from '../src/runtime/identity.js';
import {registerExperienceSupervisorRoutes} from '../src/runtime/experience-supervisor-routes.js';
import {selectSupervisorExperienceContext} from '../src/runtime/supervisor-review.js';

test('experience learning commands use real HTTP/SQLite CAS, replay, owner scope and immutable history',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'experience-learning-')),store=new Store(dir),repo=new V1Repository(store.databasePath);store.setPassword('isolated-test-only');const token=store.createLogin(),identity=new IdentityRuntime(store,{memberExists:()=>false,memberProfile:()=>undefined}),app=Fastify();await app.register(cookie);registerExperienceSupervisorRoutes(app,repo,identity);await app.listen({host:'127.0.0.1',port:0});const address=app.server.address() as any,handler=captureHandlers.find(h=>h.domain==='experiences')!;
 const created=repo.execute(handler,'capture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{kind:'lesson',title:'verified source',content:'reproducible lesson',source:'fixture',conditions:'machine m, cli v1',supervisorLearning:{projectId:'p',conditions:{machineId:'m',executor:'claude-code',version:'v1'},unknownConditions:[],counterexamples:[]}}},'server-admin',()=>undefined).data;
 const call=async(command:string,body:any,id=created.id,cookieValue='jarvis_session='+token)=>{const r=await fetch(`http://127.0.0.1:${address.port}/api/v1/experiences/${id}/supervisor/${command}`,{method:'POST',headers:{cookie:cookieValue,'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,value:await r.json() as any};};
 try{
  const verify=repo.execute(handler,'verify',{commandId:randomUUID(),expectedVersion:created.revision,scope:'personal',payload:{experienceId:created.id,evidence:'initial exact reproduction evidence',conditions:created.conditions,machineId:'m',executor:'claude-code',nativeVersion:'v1'}},'server-admin',()=>undefined).data;
  assert.equal((await call('revoke-verification',{commandId:randomUUID(),experienceId:created.id,expectedVersion:created.revision,scope:'personal',reason:'stale version',evidence:'current evidence'})).status,409,'stale expected version rejected');
  const revoke=await call('revoke-verification',{commandId:randomUUID(),experienceId:created.id,expectedVersion:verify.revision,scope:'personal',reason:'stale version',evidence:'current evidence'});assert.equal(revoke.status,200,JSON.stringify(revoke.value));assert.equal(revoke.value.data.verified,false);assert.equal(revoke.value.data.history.length,3);
  const reverified=repo.execute(handler,'verify',{commandId:randomUUID(),expectedVersion:revoke.value.data.revision,scope:'personal',payload:{experienceId:created.id,evidence:'reproducible again',conditions:created.conditions,machineId:'m',executor:'claude-code',nativeVersion:'v1'}},'server-admin',()=>undefined).data;
  const counter={commandId:randomUUID(),experienceId:created.id,expectedVersion:reverified.revision,scope:'personal',reason:'observed contradictory outcome',evidence:'replay fixture evidence'};
  const first=await call('counterexample',counter),replay=await call('counterexample',counter);assert.equal(first.status,200,JSON.stringify(first.value));assert.deepEqual(replay.value,first.value);assert.equal(first.value.data.revision,reverified.revision+1);assert.equal(first.value.data.verified,false);assert.equal(first.value.data.supervisorLearning.counterexamples.length,1);assert.equal(first.value.data.history.length,5);
  const replacement=repo.execute(handler,'capture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{kind:'experience',title:'replacement',content:'new candidate',source:'fixture'}},'server-admin',()=>undefined).data;
  const supersedeBody={commandId:randomUUID(),experienceId:created.id,expectedVersion:first.value.data.revision,scope:'personal',reason:'new evidence supersedes old conclusion',evidence:'comparative reproduction',replacementId:replacement.id};
  const superseded=await call('supersede',supersedeBody);assert.equal(superseded.status,200,JSON.stringify(superseded.value));assert.equal(superseded.value.data.status,'superseded');assert.equal(superseded.value.data.verified,false);assert.equal(repo.read('experiences',replacement.id,'server-admin')?.verified,false);assert.equal(repo.read('experiences',replacement.id,'server-admin')?.history.length,1);
  assert.equal((await call('counterexample',{...counter,commandId:randomUUID(),expectedVersion:superseded.value.data.revision},created.id,'')).status,401);
  assert.equal((await call('counterexample',{...counter,commandId:randomUUID(),expectedVersion:superseded.value.data.revision,scope:'private'})).status,403,'scope crossing rejected');
 }finally{await app.close();identity.close();repo.close();store.close();await rm(dir,{recursive:true,force:true});}
});

test('selector returns explicit exclusion reasons and only verified top-level records qualify',()=>{
 const mk=(id:string,overrides:any={})=>({id,revision:1,ownerId:'o',kind:'lesson',status:'verified',verified:true,verifiedContent:'ok',verifiedConditions:'machine m',content:'ok',conditions:'machine m',evidence:'reproduction',supervisorLearning:{projectId:'p',conditions:{machineId:'m',executor:'claude-code',version:'v1'},unknownConditions:[],counterexamples:[]},...overrides});
 const context=selectSupervisorExperienceContext([mk('ok'),mk('deprecated',{status:'deprecated'}),mk('counterexample',{supervisorLearning:{projectId:'p',conditions:{machineId:'m',executor:'claude-code',version:'v1'},counterexamples:[{reason:'contradiction'}]}}),mk('unknown',{supervisorLearning:{projectId:'p',conditions:{machineId:'m',executor:'claude-code',version:'v1'},unknownConditions:['nativeCliVersion'],counterexamples:[]}}),mk('superseded',{supervisorLearning:{projectId:'p',supersededBy:{experienceId:'n'},conditions:{machineId:'m',executor:'claude-code',version:'v1'}}}),mk('unverified',{verified:false})],{ownerId:'o',projectId:'p',machineId:'m',executor:'claude-code',version:'v1'});
 assert.deepEqual(context.selected.map(x=>x.experienceId),['ok']);assert.deepEqual(Object.fromEntries(context.excluded.map(x=>[x.experienceId,x.reason])),{counterexample:'counterexample-recorded',deprecated:'deprecated',superseded:'superseded',unknown:'unknown-condition',unverified:'unverified'});
});
