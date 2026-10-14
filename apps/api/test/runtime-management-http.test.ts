import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';
import {validateDto} from '../src/v1/contract.js';

test('management HTTP edits freeze goal boundaries, invalidate verification and erase private receipts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-management-'));
 const pi={initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{}} as unknown as PiService;
 const r=await createApp({dataDir:dir,pi,webDir:join(dir,'none')});
 try{
  const setup=await r.app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'Management-http-fixture-passphrase'}});
  const headers={cookie:String(setup.headers['set-cookie']).split(';')[0]};
  const send=async(domain:string,command:string,payload:unknown,version=0,scope='personal',commandId=randomUUID())=>r.app.inject({method:'POST',url:`/api/v1/${domain}/commands/${command}`,headers,payload:{commandId,expectedVersion:version,scope,payload}});
  const ok=async(domain:string,command:string,payload:unknown,version=0,scope='personal')=>{const response=await send(domain,command,payload,version,scope);assert.equal(response.statusCode,200,response.body);return response.json().data};
  let project=await ok('projects','register',{name:'Original',description:'Scoped project',goal:'Original criteria',milestones:['One']});
  project=await ok('projects','update',{projectId:project.id,name:'Revised',description:'New description',goal:'Updated goal',repo:''},project.revision);
  assert.equal(project.name,'Revised');assert.equal(validateDto('Project',project).valid,true);
  const stale=await send('projects','update',{projectId:project.id,name:'Stale',description:'Old tab',goal:'Wrong goal'},project.revision-1);assert.equal(stale.statusCode,409);assert.equal(r.v1.read('projects',project.id,'server-admin')!.name,'Revised');
  let task=await ok('tasks','create',{title:'Task',projectId:project.id,machineId:'local',agent:'manual-external',mode:'managed',goal:'Do work',criteria:'Verified files',budget:2,retryLimit:1});
  task=await ok('tasks','limits',{taskId:task.id,budget:3,retryLimit:2,goal:'Revised task goal',criteria:'New independent check',deadline:null,reason:'Owner changed boundaries'},task.revision);
  assert.equal(task.budget,3);assert.equal(task.goal,'Revised task goal');assert.equal(task.status,'paused');assert.equal(validateDto('Task',task).valid,true);
  // A real active execution cannot have its frozen inputs changed by another form.
  r.v1.execute({domain:'tasks',commands:['fixture-active'],execute:(_c,_p,ctx)=>{ctx.check(ctx.require('tasks',task.id));return ctx.update('tasks',task.id,{executionStatus:'running'})}},'fixture-active',{commandId:randomUUID(),expectedVersion:task.revision,scope:'personal',payload:{}},'server-admin',id=>id==='local'?{id}:undefined);
  task=r.v1.read('tasks',task.id,'server-admin')!;
  const activeEdit=await send('tasks','limits',{taskId:task.id,budget:4,retryLimit:2,reason:'Attempt while running'},task.revision);assert.equal(activeEdit.statusCode,409,activeEdit.body);assert.equal(r.v1.read('tasks',task.id,'server-admin')!.budget,3);
  const blockedProject=await send('projects','update',{projectId:project.id,name:'Unsafe rewrite',description:'Would overwrite goal',goal:'Changed'},project.revision);assert.equal(blockedProject.statusCode,409,blockedProject.body);
  const secret='PRIVATE-EXPERIENCE-BODY-DO-NOT-REPLAY',captureId=randomUUID(),capturePayload={title:'Personal health',content:secret,summary:'private summary',tags:['fixture'],kind:'health',source:'Own note'};
  const capture=await send('experiences','capture',capturePayload,0,'private',captureId);assert.equal(capture.statusCode,200,capture.body);let experience=capture.json().data;assert.equal(experience.summary,'private summary');assert.deepEqual(experience.tags,['fixture']);
  const denied=await send('experiences','capture',capturePayload);assert.equal(denied.statusCode,403,denied.body);
  experience=await ok('experiences','verify',{experienceId:experience.id,evidence:'Owner checked fixture',conditions:'Only this fixture'},experience.revision,'private');
  experience=await ok('experiences','update',{experienceId:experience.id,title:'Updated health',content:secret+'-REVISED',source:'Own revised note',summary:'updated',tags:['new'],kind:'health'},experience.revision,'private');assert.equal(experience.verified,false);assert.equal(experience.status,'inbox');assert.equal(experience.history.length,2);assert.equal(validateDto('Experience',experience).valid,true);
  experience=await ok('experiences','archive',{experienceId:experience.id,reason:'Delete private fixture'},experience.revision,'private');assert.equal(experience.content,'');assert.deepEqual(experience.history,[]);assert.equal(validateDto('Experience',experience).valid,true);
  const replay=await send('experiences','capture',capturePayload,0,'private',captureId);assert.equal(replay.statusCode,200,replay.body);assert.ok(!replay.body.includes(secret));assert.equal(replay.json().data.status,'archived');
  let research=await ok('research','create',{title:'Options',raw:'Choose a plan'});research=await ok('research','option',{researchId:research.id,title:'One',approach:'Scoped experiment',risk:'Unknown',effort:'One day',benefit:'Learn'},research.revision);
  research=await ok('research','remove-option',{researchId:research.id,optionId:research.options[0].id,reason:'Withdraw proposal'},research.revision);assert.equal(research.options.length,0);assert.equal(validateDto('Research',research).valid,true);
 }finally{await r.app.close();await rm(dir,{recursive:true,force:true})}
});
