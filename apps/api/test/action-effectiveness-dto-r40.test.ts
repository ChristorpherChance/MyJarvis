import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';

test('R40 full application DTO and command receipt survive cancelled-task replay and restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-r40-full-dto-'));
 const open=()=>createApp({dataDir:dir,webDir:join(dir,'absent-web')});
 let runtime=await open();
 try{
  const setup=await runtime.app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'synthetic-r40-dto-check-only'}});
  assert.equal(setup.statusCode,200);const headers={cookie:String(setup.headers['set-cookie']).split(';')[0]};
  const post=(domain:string,command:string,payload:any,expectedVersion=0,commandId=randomUUID())=>runtime.app.inject({method:'POST',url:`/api/v1/${domain}/commands/${command}`,headers,payload:{commandId,expectedVersion,scope:'personal',payload}});
  const created=await post('projects','register',{name:'R40 DTO fixture',description:'Synthetic receipt verification',goal:'No executor runs',milestones:['Read durable receipt']});
  assert.equal(created.statusCode,200,created.body);const project=created.json().data;
  const taskCreated=await post('tasks','create',{title:'R40 cancellation fixture',projectId:project.id,machineId:'local',agent:'manual-external',mode:'managed',goal:'Keep one cancellation receipt',criteria:'Exact replay after restart',budget:10,retryLimit:0});
  assert.equal(taskCreated.statusCode,200,taskCreated.body);const task=taskCreated.json().data;
  const id=randomUUID(),payload={taskId:task.id,reason:'Synthetic fixture cancellation'};
  const first=await post('tasks','cancel',payload,task.revision,id);assert.equal(first.statusCode,200,first.body);
  assert.equal(first.json().data.status,'cancelled');
  await runtime.app.close();runtime=await open();
  const replay=await post('tasks','cancel',payload,task.revision,id);assert.equal(replay.statusCode,200,replay.body);assert.deepEqual(replay.json(),first.json());
  const changed=await post('tasks','cancel',{...payload,reason:'Different command content'},task.revision,id);assert.equal(changed.statusCode,409);
  const overview=await runtime.app.inject({url:'/api/v1/execution/supervision',headers});assert.equal(overview.statusCode,200);
  assert.equal(overview.json().data.tasks.find((row:any)=>row.taskId===task.id).runs,0);
 }finally{await runtime.app.close();}
 // Keep the isolated synthetic database as evidence. No production data is used.
});
