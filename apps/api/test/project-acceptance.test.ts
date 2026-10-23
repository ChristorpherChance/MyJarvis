import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {copyFileSync} from 'node:fs';
import {test} from 'node:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {IdentityRuntime} from '../src/runtime/identity.js';
import {ProjectAcceptanceRuntime} from '../src/runtime/project-acceptance-runtime.js';
import {workHandlers} from '../src/v1/work-domains.js';
import {BusinessError} from '../src/v1/types.js';

const contractRequire=createRequire(import.meta.url);
function acceptanceDocument(){const doc:any=contractRequire('../../../docs/openapi-v1-planned.json');return doc;}
const canonical=(value:any):string=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(v=>canonical(v??null)).join(',')}]`:`{${Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
const hash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const ref={path:'artifacts/test-report.json',sha256:'a'.repeat(64)};
function command(runtime:ProjectAcceptanceRuntime,projectId:string,defectId:string,principal:any,action:string,expectedVersion:number,extra:any={}){return runtime.commandDefect(projectId,defectId,{action,expectedVersion,commandId:randomUUID(),...(action==='submit_fix'?{}:{reason:'Human record'}),...extra},principal)}
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'project-acceptance-'));const store=new Store(dir);
 const realStore=store;const identity=new IdentityRuntime(realStore,{memberExists:(id:string)=>id==='me',memberProfile:()=>({id:'me',name:'Owner'})}),repo=new V1Repository(store.databasePath);
 const project={id:'project-1',revision:1,ownerId:'server-admin',scope:'personal',name:'Local acceptance',status:'active',copies:[{machineId:'machine-1',path:'/tmp/workspace',type:'development',environment:'development'}]};
 const task={id:'task-1',revision:2,ownerId:'server-admin',scope:'personal',projectId:'project-1',machineId:'machine-1',worktree:'/tmp/workspace',title:'Fix local defect',status:'queued',acceptance:null};
 const release={id:'release-1',revision:1,ownerId:'server-admin',scope:'personal',projectId:'project-1',taskId:'task-1',version:'1.0.0',artifactIds:['reports/fixture.txt'],acceptance:{outcome:'pass',evidence:'human fixture declaration',tests:'local only',artifacts:['reports/fixture.txt'],reviewerId:'server-admin',at:new Date().toISOString()},createdAt:new Date().toISOString()};
 (repo as any).read=(domain:string,id:string,actor:string)=>actor==='server-admin'?({projects:{'project-1':project},tasks:{'task-1':task},releases:{'release-1':release}} as any)[domain]?.[id]:undefined;
 (repo as any).list=(domain:string,actor:string,scope:string)=>domain==='tasks'&&actor==='server-admin'&&scope==='personal'?[task]:domain==='releases'?[release]:[];
 const execution={getRun:(id:string)=>id==='run-1'?{id,domain:'tasks',projectId:'project-1',taskId:'task-1',ownerId:'server-admin',machineId:'machine-1',workspace:'/tmp/workspace',status:'succeeded',result:{outcome:'success'}}:undefined};
 const runtime=new ProjectAcceptanceRuntime(repo,identity,execution),principal:any={actorId:'server-admin',profileId:'me',administrator:true,authorizationHash:'current'};identity.isPrincipalCurrent=(p:any)=>p.authorizationHash==='current';
 return {dir,store,identity,repo,runtime,principal,project,task,release,execution,close(){identity.close();repo.close();store.close();rmSync(dir,{recursive:true,force:true})}};
}

test('project acceptance schemas, immutable revisions, command replay and defect lifecycle',()=>{
 const f=fixture();try{const {runtime,principal}=f;
  const create={commandId:randomUUID(),expectedVersion:0,title:'Button fails',severity:'P1',reproduction:'Click save twice',expected:'One record is saved',actual:'Two records are saved',criterion:'Exactly one record exists',environment:'Local development',sourceVersion:'abc123',taskId:'task-1',runId:'run-1',releaseId:'release-1',evidenceRefs:[ref]};
  const defect=runtime.create('project-1',create,principal);assert.equal(defect.revision,1);assert.equal(defect.runSnapshot?.resultHash?.length,64);assert.equal(defect.independentAcceptance,false);assert.deepEqual(runtime.create('project-1',create,principal),defect);
  assert.throws(()=>runtime.create('project-1',{...create,title:'Different'},principal),(e:any)=>e instanceof BusinessError&&e.status===409);
  assert.throws(()=>runtime.create('project-1',{...create,commandId:randomUUID(),taskId:'other'},principal),(e:any)=>e instanceof BusinessError&&e.status===409);
  assert.throws(()=>runtime.create('project-1',{...create,commandId:randomUUID(),evidenceRefs:[{path:'../../secret',sha256:'b'.repeat(64)}]},principal),(e:any)=>e instanceof BusinessError);
  assert.throws(()=>runtime.create('project-1',{...create,commandId:randomUUID(),extra:'not allowed'},principal));
  let item=command(runtime,'project-1',defect.id,principal,'start_fix',1,{fixTaskId:'task-1'});assert.equal(item.status,'in_progress');assert.equal(item.currentFix,null);
  const candidate={sourceCommit:'a'.repeat(40),buildHash:'b'.repeat(64)},fingerprint=hash(candidate);
  item=command(runtime,'project-1',defect.id,principal,'submit_fix',2,{candidate,summary:'Fix submitted for manual retest',evidenceRefs:[ref]});assert.equal(item.status,'awaiting_retest');assert.equal(item.currentFix.generation,1);assert.equal(item.currentFix.candidateFingerprint,fingerprint);assert.equal(item.currentFix.evidenceRefs.length,1);
  item=command(runtime,'project-1',defect.id,principal,'retest',3,{outcome:'pass',fixId:item.currentFix.id,candidateFingerprint:fingerprint,evidenceRefs:[ref],validationScope:'Local focused retest'});const passId=item.latestRetest.id;
  assert.throws(()=>command(runtime,'project-1',defect.id,principal,'close',4,{fixId:item.currentFix.id,candidateFingerprint:fingerprint,retestId:'wrong'}),(e:any)=>e instanceof BusinessError&&e.status===409);
  item=command(runtime,'project-1',defect.id,principal,'close',4,{fixId:item.currentFix.id,candidateFingerprint:fingerprint,retestId:passId});assert.equal(item.status,'closed');
  item=command(runtime,'project-1',defect.id,principal,'reopen',5);assert.equal(item.status,'in_progress');assert.equal(item.currentFix,null);assert.equal(item.latestRetest,null);
  item=command(runtime,'project-1',defect.id,principal,'start_fix',6);item=command(runtime,'project-1',defect.id,principal,'submit_fix',7,{candidate:{buildHash:'c'.repeat(64)},summary:'New generation',evidenceRefs:[ref]});assert.equal(item.currentFix.generation,2);
  assert.throws(()=>command(runtime,'project-1',defect.id,principal,'close',8,{fixId:'old',candidateFingerprint:fingerprint,retestId:passId}),(e:any)=>e instanceof BusinessError&&e.status===409);
  const overview=runtime.overview('project-1',principal);assert.equal(overview.classification.tasks.total,1);
  const detail=runtime.get('project-1',defect.id,{offset:0,limit:100},principal);assert.equal(detail.history.total,8);assert.ok(detail.history.items.every((r:any)=>r.hash===hash(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='hash')))));
 }finally{f.close()}
});

test('createApp assembles authenticated acceptance routes with real identity and repository',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'acceptance-app-integration-'));
 const pi={initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{}} as unknown as PiService;
 const runtime=await createApp({dataDir:dir,pi,webDir:join(dir,'no-web')});
 try{
  const setup=await runtime.app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'isolated-acceptance-fixture-password'}});assert.equal(setup.statusCode,200,setup.body);
  const cookieHeader=String(setup.headers['set-cookie']).split(';')[0],headers={cookie:cookieHeader};
  const register=async(command:string,payload:Record<string,unknown>)=>runtime.app.inject({method:'POST',url:`/api/v1/projects/commands/${command}`,headers,payload:{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload}});
  const projectResult=await register('register',{name:'Integration Project',description:'isolated test',goal:'Exercise createApp acceptance route wiring',repo:'fixture://acceptance'});assert.equal(projectResult.statusCode,200,projectResult.body);const projectId=projectResult.json().data.id;
  const body={commandId:randomUUID(),expectedVersion:0,title:'HTTP integration defect',severity:'P2',reproduction:'Open page and save',expected:'Saved once',actual:'Not saved',criterion:'Visible persisted result',environment:'isolated app fixture',sourceVersion:'fixture-v1'};
  const unauth=await runtime.app.inject({method:'POST',url:`/api/v1/projects/${projectId}/defects`,payload:body});assert.equal(unauth.statusCode,401);
  const created=await runtime.app.inject({method:'POST',url:`/api/v1/projects/${projectId}/defects`,headers,payload:body});assert.equal(created.statusCode,200,created.body);const defect=created.json().data;
  assert.equal((await runtime.app.inject({method:'POST',url:`/api/v1/projects/${projectId}/defects`,headers,payload:body})).json().data.id,defect.id);
  const changed=await runtime.app.inject({method:'POST',url:`/api/v1/projects/${projectId}/defects/${defect.id}/commands`,headers,payload:{action:'start_fix',commandId:randomUUID(),expectedVersion:1,reason:'Begin local fix'}});assert.equal(changed.statusCode,200,changed.body);
  const stale=await runtime.app.inject({method:'POST',url:`/api/v1/projects/${projectId}/defects/${defect.id}/commands`,headers,payload:{action:'start_fix',commandId:randomUUID(),expectedVersion:1,reason:'Stale request'}});assert.equal(stale.statusCode,409);
  assert.equal((await runtime.app.inject({url:`/api/v1/projects/not-owned/defects/${defect.id}`,headers})).statusCode,404);
  assert.equal((await runtime.app.inject({url:`/api/v1/projects/${projectId}/acceptance`,headers})).json().data.classification.tasks.total,0);
  assert.equal((await runtime.app.inject({url:`/api/v1/projects/${projectId}/defects?offset=0&limit=10`,headers})).json().data.items.length,1);
  assert.equal((await runtime.app.inject({url:`/api/v1/projects/${projectId}/releases`,headers})).json().data.items.length,0);
  assert.equal(validateContract('ProjectDefectSnapshot',defect),true);
 }finally{await runtime.app.close();rmSync(dir,{recursive:true,force:true})}
});

function validateContract(name:string,value:any){const doc=acceptanceDocument(),ajv=new Ajv({strict:false});addFormats(ajv);ajv.addSchema({$id:'https://jarvis.test/acceptance',components:doc.components});const valid=ajv.compile({$ref:`https://jarvis.test/acceptance#/components/schemas/${name}`});assert.equal(valid(value),true,JSON.stringify(valid.errors));return true}

test('same contract schemas validate actual create, command, detail, overview and release DTO data',()=>{
 const doc=acceptanceDocument(),ajv=new Ajv({strict:false});addFormats(ajv);ajv.addSchema({$id:'https://jarvis.test/acceptance',components:doc.components});
 const validate=(name:string,value:any)=>{const fn=ajv.compile({$ref:`https://jarvis.test/acceptance#/components/schemas/${name}`});assert.equal(fn(value),true,JSON.stringify(fn.errors))};
 const f=fixture();try{const {runtime,principal}=f;const input={commandId:randomUUID(),expectedVersion:0,title:'schema test',severity:'P3',reproduction:'press button',expected:'one',actual:'zero',criterion:'one row',environment:'fixture',sourceVersion:'v1'};validate('ProjectDefectCreateInput',input);const created=runtime.create('project-1',input,principal);validate('ProjectDefectSnapshot',created);validate('ProjectDefectCollection',runtime.list('project-1',{},principal));validate('ProjectDefectDetail',runtime.get('project-1',created.id,{},principal));validate('ProjectAcceptanceOverview',runtime.overview('project-1',principal));validate('ProjectReleaseCollection',runtime.releases('project-1',{},principal));
  const cmd={action:'start_fix',commandId:randomUUID(),expectedVersion:1,reason:'begin'};validate('ProjectDefectCommandInput',cmd);validate('ProjectDefectSnapshot',command(runtime,'project-1',created.id,principal,'start_fix',1,{reason:'begin'}));
 }finally{f.close()}
});

test('stale retest, cross-defect replay and candidate-task mismatch fail without history writes',()=>{
 const f=fixture();try{
  const input={commandId:randomUUID(),expectedVersion:0,title:'strict bindings',severity:'P1',reproduction:'steps',expected:'one result',actual:'old failure',criterion:'current subject',environment:'fixture',sourceVersion:'v1',taskId:'task-1'};
  let d=f.runtime.create('project-1',input,f.principal);const other=f.runtime.create('project-1',{...input,commandId:randomUUID()},f.principal);
  const first={action:'start_fix',commandId:randomUUID(),expectedVersion:1,fixTaskId:'task-1',reason:'bound fix'};d=f.runtime.commandDefect('project-1',d.id,first,f.principal);
  assert.throws(()=>f.runtime.commandDefect('project-1',other.id,first,f.principal),(e:any)=>e.status===409);
  const releaseTask=f.release.taskId;f.release.taskId='different-task';assert.throws(()=>command(f.runtime,'project-1',d.id,f.principal,'submit_fix',d.revision,{candidate:{releaseId:f.release.id},summary:'wrong task',evidenceRefs:[ref]}),(e:any)=>e.status===409);f.release.taskId=releaseTask;
  d=command(f.runtime,'project-1',d.id,f.principal,'submit_fix',d.revision,{candidate:{sourceCommit:'a'.repeat(40)},summary:'first fix',evidenceRefs:[ref]});
  d=command(f.runtime,'project-1',d.id,f.principal,'retest',d.revision,{outcome:'pass',fixId:d.currentFix!.id,candidateFingerprint:d.currentFix!.candidateFingerprint,evidenceRefs:[ref],validationScope:'v1 only'});const oldFix=d.currentFix!,oldRetest=d.latestRetest!;
  d=command(f.runtime,'project-1',d.id,f.principal,'update',d.revision,{patch:{sourceVersion:'v2',taskId:null,runId:null,releaseId:null}});assert.equal(d.latestRetest,null);assert.equal(d.currentFix,null);assert.equal(d.taskSnapshot,undefined);
  assert.throws(()=>command(f.runtime,'project-1',d.id,f.principal,'close',d.revision,{fixId:oldFix.id,candidateFingerprint:oldFix.candidateFingerprint,retestId:oldRetest.id}),(e:any)=>e.status===409);
  const before=f.runtime.get('project-1',d.id,{},f.principal).history.total;f.project.status='archived';assert.deepEqual(f.runtime.create('project-1',input,f.principal).id,d.id);assert.throws(()=>command(f.runtime,'project-1',d.id,f.principal,'start_fix',d.revision),(e:any)=>e.status===409);assert.equal(f.runtime.get('project-1',d.id,{},f.principal).history.total,before);
 }finally{f.close()}
});

test('identity database backup restores immutable acceptance history and command replay',()=>{
 const f=fixture(),backup=join(f.dir,'backup.db'),restoredDir=mkdtempSync(join(tmpdir(),'acceptance-restore-'));
 let restoredStore:Store|undefined,restoredIdentity:IdentityRuntime|undefined,restoredRepo:V1Repository|undefined;
 try{
  const input={commandId:randomUUID(),expectedVersion:0,title:'backup defect',severity:'P1',reproduction:'step',expected:'yes',actual:'no',criterion:'pass',environment:'fixture',sourceVersion:'backup'};const first=f.runtime.create('project-1',input,f.principal);
  f.store.backup(backup);
  restoredStore=new Store(restoredDir); // initialize the normal database schema then replace with an actual point-in-time copy
  restoredStore.close();rmSync(join(restoredDir,'jarvis.db'),{force:true});
  copyFileSync(backup,join(restoredDir,'jarvis.db'));
  restoredStore=new Store(restoredDir);restoredIdentity=new IdentityRuntime(restoredStore,{memberExists:(id:string)=>id==='me',memberProfile:()=>({id:'me',name:'Owner'})});restoredRepo=new V1Repository(restoredStore.databasePath);
  (restoredRepo as any).read=(domain:string,id:string,actor:string)=>domain==='projects'&&id==='project-1'&&actor==='server-admin'?f.project:undefined;
  const restored=new ProjectAcceptanceRuntime(restoredRepo,restoredIdentity,{getRun:()=>undefined}),principal={...f.principal};restoredIdentity.isPrincipalCurrent=()=>true;
  assert.equal(restored.get('project-1',first.id,{},principal).defect.hash,first.hash);assert.deepEqual(restored.create('project-1',input,principal),first);restoredStore.backup(join(restoredDir,'roundtrip.db'));
 }finally{restoredIdentity?.close();restoredRepo?.close();restoredStore?.close();rmSync(f.dir,{recursive:true,force:true});rmSync(restoredDir,{recursive:true,force:true})}
});
