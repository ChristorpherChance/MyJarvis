import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import Fastify from 'fastify';
import type {V1Repository} from '../src/v1/repository.js';
import type {IdentityRuntime} from '../src/runtime/identity.js';
import {ProjectDecisionRuntime,recommendProjectDecision} from '../src/runtime/project-decision-runtime.js';
import {registerProjectDecisionRoutes} from '../src/runtime/project-decision-routes.js';

const fingerprint=(v:unknown):string=>createHash('sha256').update(canonical(v)).digest('hex');
function canonical(v:any):string {if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}'}
function body(){
 const context={observedAt:new Date().toISOString(),goalSpecHash:'a'.repeat(64),sourceFingerprint:'b'.repeat(64),sourceVersion:'fixture-r1',runId:null,taskId:null,machineId:'fixture-machine',objectives:['O1'],constraints:['No unscoped restart'],situation:'A safe semantic check found central configuration differs from the node registration.'};
 const options=[{id:'central-reconcile',title:'Reconcile central registration',advantages:['Keeps the running node'],disadvantages:['Requires exact semantic comparison'],impact:'Only the exact central executor registration changes',compliesWithGoals:'yes',withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'reversible',coveredObjectives:['O1'],operationalImpact:0},{id:'restart-node',title:'Restart the node',advantages:['Reloads configuration'],disadvantages:['Interrupts the process'],impact:'Restarts the isolated node',compliesWithGoals:'yes',withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'bounded',coveredObjectives:['O1'],operationalImpact:2}];
 return {questionSummary:'Which recovery respects the current unchanged node state?',context,options,chosenId:null,decisionRationale:'Use observed state and reversible changes.',basisRefs:[],risk:'low',affectedObjectives:['O1'],rollbackPlan:{plan:'Create a new bounded reconciliation plan against the saved version.',triggers:['The current registration differs from the recorded version'],impact:'Only this project registration',requiresNewExecutionPlan:true},actions:[],status:'proposed',origin:'rule',changeOf:null};
}
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-decision-'));
 const repository={read(domain:string,id:string,actor:string){return domain==='projects'&&['project-a','project-b'].includes(id)&&actor==='server-admin'?{id,ownerId:actor}:undefined}} as unknown as V1Repository;
 let runtime=new ProjectDecisionRuntime(repository,{directory});
 return {directory,repository,get runtime(){return runtime},restart(){runtime.close();runtime=new ProjectDecisionRuntime(repository,{directory});},async close(){runtime.close();await rm(directory,{recursive:true,force:true});}};
}
const envelope=(payload:any)=>({...payload,commandId:randomUUID(),expectedVersion:0});
const choose=(revision:number,extras:any={})=>({commandId:randomUUID(),expectedVersion:revision,mode:'recommended',decisionRationale:'The current evidence supports a reversible central-only change.',basisRefs:[],origin:'rule',reason:'Select without altering the active node',...extras});

test('decision choice is durable, separately versioned, hash linked and does not imply execution or acceptance',async()=>{
 const f=await fixture();try{
  const first=f.runtime.record('project-a',envelope(body()));assert.equal(first.status,'proposed');assert.equal(first.recommendation.chosenId,'central-reconcile');
  const selected=f.runtime.select('project-a',first.id,choose(1,{origin:'ai'}));assert.equal(selected.status,'selected');assert.equal(selected.actions.length,0);assert.equal(selected.selfReported,true);assert.equal(selected.independentAcceptance,false);
  f.restart();const read=f.runtime.get('project-a',first.id);assert.equal(read.revision,2);assert.equal(read.revisions.length,2);assert.equal(read.revisions[0].chosenId,null);assert.equal(read.previousHash,first.hash);
  for(const revision of read.revisions){const {hash,...snapshot}=revision;assert.equal(hash,fingerprint(snapshot));}
 }finally{await f.close();}
});
test('exact command replay is idempotent while reused IDs and stale CAS cannot overwrite history',async()=>{
 const f=await fixture();try{
  const input=envelope(body()),record=f.runtime.record('project-a',input);assert.deepEqual(f.runtime.record('project-a',input),record);
  assert.throws(()=>f.runtime.record('project-a',{...input,questionSummary:'Different'}),/同一提交编号/);
  const selection=choose(1);f.runtime.select('project-a',record.id,selection);assert.equal(f.runtime.select('project-a',record.id,selection).revision,2);
  assert.throws(()=>f.runtime.select('project-a',record.id,choose(1)),/已更新/);assert.equal(f.runtime.get('project-a',record.id).revisions.length,2);
  assert.throws(()=>f.runtime.record('project-b',input),/同一提交编号/);
 }finally{await f.close();}
});
test('history table refuses update and delete and public routes enforce project identity',async()=>{
 const f=await fixture();try{
  const record=f.runtime.record('project-a',envelope(body()));
  assert.throws(()=>f.runtime.get('project-b',record.id),/不属于/);assert.throws(()=>f.runtime.list('not-owned'),/不可访问/);
  const db=new DatabaseSync(join(f.directory,'decisions.sqlite'));
  try{assert.throws(()=>db.prepare('UPDATE project_decision_revisions SET json=?').run('{}'),/immutable/);assert.throws(()=>db.exec('DELETE FROM project_decision_revisions'),/immutable/);}finally{db.close();}
 }finally{await f.close();}
});
test('finite recommendation rejects missing evidence, unknown authority, goal conflicts and ties without inventing facts',()=>{
 const input=body();const equal=input.options.map(o=>({...o,reversibility:'reversible',operationalImpact:0}));
 const tied=recommendProjectDecision({context:input.context,options:equal});assert.equal(tied.chosenId,null);assert.equal(tied.status,'ambiguous');assert.equal(tied.usesPaidModel,false);
 const unsafe=input.options.map((o,i)=>({...o,...(i===0?{withinAuthority:'unknown'}:{compliesWithGoals:'no'})}));
 const result=recommendProjectDecision({context:input.context,options:unsafe});assert.equal(result.status,'needs-evidence');assert.equal(result.chosenId,null);
 const missing=input.options.map(o=>({...o,missingEvidence:['Actual configuration receipt']}));assert.equal(recommendProjectDecision({context:input.context,options:missing}).chosenId,null);
 assert.throws(()=>recommendProjectDecision({context:input.context,options:[input.options[0],input.options[0]]}),/编号重复/);
});
test('a single actual remedy can be recorded and recommended without manufacturing an alternative',async()=>{
 const f=await fixture();try{
  const input=body();input.options=[input.options[0]];const recommendation=recommendProjectDecision({context:input.context,options:input.options});
  assert.equal(recommendation.chosenId,'central-reconcile');assert.equal(recommendation.candidates.length,1);
  const record=f.runtime.record('project-a',envelope(input));assert.equal(record.options.length,1);const selected=f.runtime.select('project-a',record.id,choose(1));assert.equal(selected.chosenId,'central-reconcile');
  assert.throws(()=>f.runtime.record('project-a',envelope({...input,options:[]})));
 }finally{await f.close();}
});
test('equally ranked safe choices can be explicitly selected with a recorded AI rationale',async()=>{
 const f=await fixture();try{
  const input=body();input.options=input.options.map(o=>({...o,reversibility:'reversible',operationalImpact:0}));
  const record=f.runtime.record('project-a',envelope(input));assert.equal(record.recommendation.status,'ambiguous');
  const selected=f.runtime.select('project-a',record.id,choose(1,{mode:'explicit',chosenId:'central-reconcile',origin:'ai',decisionRationale:'Both are within the recorded boundary; retain the existing process to avoid unnecessary interruption.'}));
  assert.equal(selected.chosenId,'central-reconcile');assert.equal(selected.recommendation.status,'ambiguous');assert.equal(selected.selfReported,true);assert.equal(selected.independentAcceptance,false);
 }finally{await f.close();}
});
test('AI choices require supplied environment evidence and cannot contradict hard goals',async()=>{
 const f=await fixture();try{
  const b=body();b.options[0].environmentEvidence='missing';
  const record=f.runtime.record('project-a',envelope(b));
  assert.throws(()=>f.runtime.select('project-a',record.id,choose(1,{mode:'explicit',chosenId:'central-reconcile',origin:'ai'})),/缺少/);
  const human=f.runtime.select('project-a',record.id,choose(1,{mode:'explicit',chosenId:'central-reconcile',origin:'human'}));assert.equal(human.status,'selected');assert.equal(human.recommendation.chosenId,'restart-node');
  const invalid=body();invalid.options[0].compliesWithGoals='no';invalid.chosenId='central-reconcile' as any;invalid.status='selected';invalid.origin='human';assert.throws(()=>f.runtime.record('project-a',envelope(invalid)),/违背/);
 }finally{await f.close();}
});
test('performed evidence and failed actions are preserved; planned action does not become implemented',async()=>{
 const f=await fixture();try{
  const initial=f.runtime.record('project-a',envelope(body())),selected=f.runtime.select('project-a',initial.id,choose(1));
  const action={summary:'Compare exact registration',at:new Date().toISOString(),state:'planned',evidenceRefs:[]};
  const planned=f.runtime.implementation('project-a',initial.id,{commandId:randomUUID(),expectedVersion:selected.revision,actions:[action],reason:'Plan only',origin:'rule'});assert.equal(planned.status,'selected');
  assert.throws(()=>f.runtime.implementation('project-a',initial.id,{commandId:randomUUID(),expectedVersion:planned.revision,actions:[{...action,state:'performed'}],reason:'No evidence',origin:'ai'}),/证据引用/);
  const done=f.runtime.implementation('project-a',initial.id,{commandId:randomUUID(),expectedVersion:planned.revision,actions:[{...action,state:'failed',summary:'Initial exact byte check failed',evidenceRefs:[]},{...action,state:'performed',summary:'Reconciled the exact central registration',evidenceRefs:[{reference:'artifacts/decision-fixture.json',sha256:'c'.repeat(64),kind:'observation'}]}],reason:'Record actual outcomes',origin:'ai'});
  assert.equal(done.status,'implemented');assert.equal(done.actions.filter(a=>a.state==='failed').length,1);assert.equal(done.actions.length,3);assert.equal(done.independentAcceptance,false);assert.equal(done.selfReported,true);assert.equal(done.origin,'ai');
 }finally{await f.close();}
});
test('changing a selected decision appends a linked decision and retains old choice and evidence',async()=>{
 const f=await fixture();try{
  const initial=f.runtime.record('project-a',envelope({...body(),chosenId:'central-reconcile',status:'selected'}));
  const {changeOf:_,...input}=body();const changed=f.runtime.change('project-a',initial.id,{...input,commandId:randomUUID(),expectedVersion:1,chosenId:'restart-node',status:'selected',origin:'human',reason:'New observed condition requires a different bounded plan'});
  const old=f.runtime.get('project-a',initial.id);assert.equal(old.status,'superseded');assert.equal(old.supersededBy,changed.id);assert.equal(old.revisions[0].status,'selected');assert.equal(old.revisions[0].chosenId,'central-reconcile');assert.equal(changed.changeOf,initial.id);assert.equal(changed.actions.length,0);
  assert.throws(()=>f.runtime.select('project-a',initial.id,choose(old.revision)),/历史决策/);
 }finally{await f.close();}
});
test('reselecting the same option preserves its actions; choosing another option archives the old plans and failures',async()=>{
 const f=await fixture();try{
  const actions=[{summary:'Planned central-only registration check',at:new Date().toISOString(),state:'planned',evidenceRefs:[]},{summary:'Initial central-only exact-byte comparison failed',at:new Date().toISOString(),state:'failed',evidenceRefs:[{reference:'artifacts/decision-action-fixture.json',sha256:'d'.repeat(64),kind:'observation'}]}];
  const initial=f.runtime.record('project-a',envelope({...body(),chosenId:'central-reconcile',status:'selected',origin:'human',actions}));
  const same=f.runtime.select('project-a',initial.id,choose(1,{mode:'explicit',chosenId:'central-reconcile',origin:'human',reason:'Retain the same central-only plan'}));
  assert.equal(same.status,'selected');assert.deepEqual(same.actions,initial.actions);
  const different=f.runtime.select('project-a',initial.id,choose(same.revision,{mode:'explicit',chosenId:'restart-node',origin:'human',reason:'Record a different bounded plan; preserve prior evidence as history'}));
  assert.equal(different.status,'selected');assert.equal(different.chosenId,'restart-node');assert.deepEqual(different.actions,[]);assert.equal(different.independentAcceptance,false);
  const history=f.runtime.get('project-a',initial.id).revisions;assert.equal(history.length,3);assert.deepEqual(history[0].actions,initial.actions);assert.deepEqual(history[1].actions,initial.actions);assert.equal(history[0].chosenId,'central-reconcile');assert.equal(history[1].chosenId,'central-reconcile');assert.deepEqual(history[2].actions,[]);assert.equal(history[2].previousHash,history[1].hash);
 }finally{await f.close();}
});
test('a proposed change leaves the previous instruction active and cannot supersede a changed base',async()=>{
 const f=await fixture();try{
  const initial=f.runtime.record('project-a',envelope({...body(),chosenId:'central-reconcile',status:'selected'}));const {changeOf:_,...input}=body();
  const proposal=f.runtime.change('project-a',initial.id,{...input,commandId:randomUUID(),expectedVersion:1,reason:'Evaluate a new proposal'});assert.equal(f.runtime.get('project-a',initial.id).status,'selected');
  f.runtime.implementation('project-a',initial.id,{commandId:randomUUID(),expectedVersion:1,actions:[{summary:'Started a new bounded comparison',at:new Date().toISOString(),state:'planned',evidenceRefs:[]}],reason:'Base has a new plan',origin:'rule'});
  assert.throws(()=>f.runtime.select('project-a',proposal.id,choose(1)),/依据已经改变/);assert.equal(f.runtime.get('project-a',proposal.id).revisions.length,1);
 }finally{await f.close();}
});
test('privacy guard rejects obvious credentials, private links and raw thought fields without partial writes',async()=>{
 const f=await fixture();try{
  for(const value of ['Authorization: Bearer fixturesecret','password=fixture-secret','密码：fixture-secret','https://example.test/status?access_token=secret','.secrets/model-key.txt'])assert.throws(()=>f.runtime.record('project-a',envelope({...body(),decisionRationale:value})),(error:any)=>error.code==='DECISION_PRIVATE_CONTENT');
  assert.throws(()=>f.runtime.record('project-a',envelope({...body(),rawChainOfThought:'private'})));
  assert.equal(f.runtime.list('project-a').total,0);
 }finally{await f.close();}
});
test('route registration provides real paginated reads and CAS commands behind administrator authentication',async()=>{
 const f=await fixture(),app=Fastify();try{
  const identity={principal(req:any){return {administrator:req.headers['x-fixture-admin']==='yes',profileId:req.headers['x-fixture-profile']??'me'};}} as unknown as IdentityRuntime;
  registerProjectDecisionRoutes(app,f.runtime,identity);await app.ready();
  assert.equal((await app.inject({url:'/api/v1/projects/project-a/decisions'})).statusCode,403);
  assert.equal((await app.inject({url:'/api/v1/projects/project-a/decisions',headers:{'x-fixture-admin':'yes','x-fixture-profile':'son'}})).statusCode,403);
  const headers={'x-fixture-admin':'yes'},created=await app.inject({method:'POST',url:'/api/v1/projects/project-a/decisions',headers,payload:envelope(body())});assert.equal(created.statusCode,200);
  const first=created.json().data;
  const selected=await app.inject({method:'POST',url:`/api/v1/projects/project-a/decisions/${first.id}/select`,headers,payload:choose(1)});assert.equal(selected.statusCode,200);
  const list=await app.inject({url:'/api/v1/projects/project-a/decisions?limit=1&offset=0',headers});assert.equal(list.json().data.items[0].revision,2);assert.match(String(list.headers['cache-control']),/private/);
  assert.equal((await app.inject({url:'/api/v1/projects/project-a/decisions?limit=101',headers})).statusCode,400);
  assert.equal((await app.inject({url:`/api/v1/projects/project-b/decisions/${first.id}`,headers})).statusCode,404);
 }finally{await app.close();await f.close();}
});
test('all seven contract operations compile and the same real snapshots validate against response schemas',async()=>{
 const require=createRequire(import.meta.url),Ajv=require('ajv/dist/2020').default,formats=require('ajv-formats');
 const document={paths:{},components:{schemas:{}}};require('../../../scripts/project-decision-contract.cjs')(document);
 const ajv=new Ajv({strict:false});formats(ajv);const schemaId='urn:jarvis:project-decisions';ajv.addSchema({$id:schemaId,components:document.components});
 for(const name of Object.keys(document.components.schemas))assert.doesNotThrow(()=>ajv.compile({$ref:schemaId+'#/components/schemas/'+name}));
 assert.equal(Object.values(document.paths).reduce((sum:number,path:any)=>sum+Object.keys(path).length,0),7);
 const f=await fixture();try{
  const input=body();input.options=[input.options[0]];const payload=envelope(input);
  const validate=(name:string,value:any)=>{const valid=ajv.compile({$ref:schemaId+'#/components/schemas/'+name});assert.equal(valid(value),true,JSON.stringify(valid.errors));};
  validate('ProjectDecisionRecordInput',payload);const first=f.runtime.record('project-a',payload);validate('ProjectDecisionSnapshot',first);
  validate('ProjectDecisionRecommendation',first.recommendation);validate('ProjectDecisionDetail',f.runtime.get('project-a',first.id));validate('ProjectDecisionCollection',f.runtime.list('project-a'));
 }finally{await f.close();}
});
