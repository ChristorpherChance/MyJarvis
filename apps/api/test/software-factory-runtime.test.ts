import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type RequestListener} from 'node:http';
import Fastify from 'fastify';
import {SoftwareFactoryRuntime,registerSoftwareFactoryRoutes,createSoftwareFactoryTools} from '../src/runtime/software-factory-runtime.js';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import type {RuntimePrincipal} from '../src/runtime/identity.js';

const id='2a814c9e-cf97-4afd-8cc0-ec6796a7a16a';
const admin:RuntimePrincipal={actorId:'server-admin',profileId:'me',administrator:true};
const identity=(current=()=>true)=>({isPrincipalCurrent:current,requireAdmin:(req:any)=>{if(req.headers.authorization!=='fixture-admin')throw Object.assign(new Error('admin required'),{statusCode:401});return admin;}});
async function fixture(handler:RequestListener){const server=createServer(handler);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const a=server.address();assert(a&&typeof a!=='string');return {baseURL:'http://127.0.0.1:'+a.port,close:()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})};}
const json=(response:any,value:unknown)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify(value));};
const project={id,name:'Fixture factory business project',status:'active',is_demo:false,created_at:'2026-10-10T00:00:00Z',description:'Factory-owned records',password:'not-returned',apiKey:'not-returned'};

test('software factory legacy PostgreSQL seed GUIDs remain queryable without accepting a path or arbitrary project identifier',async()=>{
 const legacy='00000000-0000-0000-0000-0000000000f8',requests:string[]=[];
 const upstream=await fixture((req,res)=>{requests.push(req.url!);if(req.url==='/api/projects')return json(res,[project,{...project,id:legacy,is_demo:true}]);if(req.url==='/api/projects/'+legacy)return json(res,{...project,id:legacy,is_demo:true});if(req.url?.endsWith('/dev/autopilot'))return json(res,{run:null});if(req.url?.endsWith('/dev/build'))return json(res,{build:null});if(req.url?.endsWith('/ai/usage?limit=1'))return json(res,{totals:{calls:0,tokens_in:0,tokens_out:0,cost:0}});return json(res,{items:[]});});
 const app=Fastify(),runtime=new SoftwareFactoryRuntime({identity:identity(),machineId:'m',baseURL:upstream.baseURL});registerSoftwareFactoryRoutes(app,runtime);
 try{
  const list=await runtime.projects(admin);assert.equal(list.total,2);assert.equal(list.items[1].id,legacy);assert.equal((await runtime.state(admin)).connected,true);
  const detail=await runtime.project(admin,legacy);assert.equal(detail.project.id,legacy);assert.equal(detail.partialErrors.length,0);
  const headers={authorization:'fixture-admin'};assert.equal((await app.inject({url:'/api/runtime/software-factory/projects/'+legacy,headers})).statusCode,200);
  const before=requests.length;for(const bad of ['project-a',legacy+'-extra','00000000--0000000000000000000000000000'])assert.equal((await app.inject({url:'/api/runtime/software-factory/projects/'+bad,headers})).statusCode,400);
  assert.equal(requests.length,before);await assert.rejects(runtime.project(admin,'../private'));assert.equal(requests.length,before);
  const require=createRequire(import.meta.url),apply=require('../../../scripts/software-factory-contract.cjs'),Ajv=require('ajv/dist/2020'),formats=require('ajv-formats'),d:any={components:{schemas:{}},paths:{}};apply(d);const ajv=new Ajv({strict:false});formats(ajv);ajv.addSchema({$id:'legacy-guid',...d});const validate=ajv.compile({$ref:'legacy-guid#/components/schemas/SoftwareFactoryDetail'});assert(validate(detail),JSON.stringify(validate.errors));assert(!validate({...detail,project:{...detail.project,id:legacy+'x'}}));
 }finally{await app.close();await upstream.close();}
});

test('software factory reads real HTTP metadata, login once, projects and reported mock boundaries; never reads private chats or invokes business mutations',async()=>{
 const requests:{method:string;path:string;cookie:string}[]=[];let logins=0;
 const upstream=await fixture(async(req,res)=>{
  requests.push({method:req.method!,path:req.url!,cookie:req.headers.cookie??''});
  if(req.url==='/api/auth/login'){logins++;let body='';for await(const part of req)body+=part;assert.deepEqual(JSON.parse(body),{username:'fixture-user',password:'fixture-password'});res.setHeader('Set-Cookie','msf_auth=10000000000000.fixture-signature; Path=/; HttpOnly; SameSite=Lax');return json(res,{ok:true,user:'fixture-user'});}
  if(req.headers.cookie!=='msf_auth=10000000000000.fixture-signature'){res.statusCode=401;return json(res,{error:{message:'no authentication'}});}
  if(req.url==='/api/projects')return json(res,[project]);
  if(req.url==='/api/projects/'+id)return json(res,project);
  if(req.url?.endsWith('/dev/tasks'))return json(res,{items:[{id:'task-1',code:'T-001',title:'Business task',col:'done',prog:100,secret:'not-returned'}]});
  if(req.url?.endsWith('/dev/autopilot'))return json(res,{run:{runId:'RUN-1',status:'stopped',phase:'build',runToken:'not-returned',blocker:{code:'TEST_BLOCKED',message:'not-returned'}}});
  if(req.url?.endsWith('/dev/build'))return json(res,{build:{buildId:'B-0001',status:'pass',buildFingerprint:'sha256:fixture',sourceManifest:{credentials:'not-returned'}}});
  if(req.url?.endsWith('/selftest/reports'))return json(res,{items:[{id:'report-1',code:'SR-1',status:'pass',report_fingerprint:'fixture'}]});
  if(req.url?.endsWith('/ai/usage?limit=1'))return json(res,{totals:{calls:'2',tokens_in:'300',tokens_out:'100',cost:'0.004'},items:[{session_id:'not-returned',message_id:'not-returned'}]});
  return json(res,{items:[]});
 });
 try{
  const runtime=new SoftwareFactoryRuntime({identity:identity(),machineId:'machine-101',sourceProjectId:()=> 'jarvis-msf-source-project',baseURL:upstream.baseURL,credentials:()=>({username:'fixture-user',password:'fixture-password'})});
  const state=await runtime.state(admin);assert.equal(state.connected,true);assert.equal(state.authenticated,true);assert.equal(state.sourceProjectId,'jarvis-msf-source-project');assert.equal(state.boundaries.automaticAcceptance,false);
  const list=await runtime.projects(admin);assert.equal(list.total,1);assert.equal(list.items[0].name,project.name);
  const detail=await runtime.project(admin,id);assert.equal(detail.tasks[0].progress,100);assert.equal(detail.build?.status,'pass');assert.equal(detail.boundaries.internalDevelopment,'mock-development-pipeline');assert.equal(detail.verification,'factory-reported');assert.equal(detail.usage?.inputTokens,300);assert.equal(detail.usage?.costCurrency,'not-declared-by-factory');
  assert.equal(logins,1);assert(!JSON.stringify([state,list,detail]).includes('not-returned'));assert(!JSON.stringify([state,list,detail]).includes('fixture-password'));assert(!JSON.stringify([state,list,detail]).includes('fixture-signature'));
  assert(requests.every(r=>r.method==='GET'||r.path==='/api/auth/login'));assert(!requests.some(r=>/stages|messages|sessions|stream|set-mode|build:run|autopilot:start/.test(r.path)));
 }finally{await upstream.close();}
});

test('software factory routes require current admin and cannot select a URL, private session, arbitrary project path or a mutation',async()=>{
 let current=true,calls=0;const upstream=await fixture((_req,res)=>{calls++;json(res,[project]);});const app=Fastify();
 const runtime=new SoftwareFactoryRuntime({identity:identity(()=>current),machineId:'machine-101',baseURL:upstream.baseURL});registerSoftwareFactoryRoutes(app,runtime);
 try{
  assert.equal((await app.inject({url:'/api/runtime/software-factory/projects'})).statusCode,401);assert.equal(calls,0);
  const headers={authorization:'fixture-admin'};
  assert.equal((await app.inject({url:'/api/runtime/software-factory/projects?url=http://127.0.0.1:1/private',headers})).statusCode,400);assert.equal(calls,0);
  assert.equal((await app.inject({url:'/api/runtime/software-factory/projects/private-session',headers})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:'/api/runtime/software-factory/projects',headers,payload:{}})).statusCode,404);
  const good=await app.inject({url:'/api/runtime/software-factory/projects',headers});assert.equal(good.statusCode,200,good.body);assert.equal(good.headers['cache-control'],'no-store');assert.equal(calls,1);
  current=false;assert.equal((await app.inject({url:'/api/runtime/software-factory/projects',headers})).statusCode,403);assert.equal(calls,1,'expired authorization cannot use cache');
  await assert.rejects(runtime.projects({...admin,actorId:'member-child',profileId:'child',administrator:false}),/仅当前管理者/);
 }finally{await app.close();await upstream.close();}
});

test('software factory refuses cross-origin redirect and oversized response without forwarding login cookie',async()=>{
 let destinationCalls=0;const destination=await fixture((_req,res)=>{destinationCalls++;json(res,[project]);});
 const redirect=await fixture((_req,res)=>{res.writeHead(302,{location:destination.baseURL+'/private'});res.end();});
 const large=await fixture((_req,res)=>json(res,[{...project,description:'x'.repeat(1024)}]));
 try{
  const redirected=new SoftwareFactoryRuntime({identity:identity(),machineId:'m',baseURL:redirect.baseURL});const state=await redirected.state(admin);assert.equal(state.connected,false);assert.equal(state.error,'FACTORY_REQUEST_FAILED');assert.equal(destinationCalls,0);
  const limited=new SoftwareFactoryRuntime({identity:identity(),machineId:'m',baseURL:large.baseURL,maxResponseBytes:256});await assert.rejects(limited.projects(admin),e=>(e as any).code==='FACTORY_RESPONSE_TOO_LARGE');
  assert.throws(()=>new SoftwareFactoryRuntime({identity:identity(),machineId:'m',baseURL:'http://user:secret@example.com'}),/固定/);
 }finally{await redirect.close();await destination.close();await large.close();}
});

test('software factory incomplete sections remain explicit and no missing usage or test state becomes a fabricated zero/pass',async()=>{
 const upstream=await fixture((req,res)=>{if(req.url==='/api/projects/'+id)return json(res,project);if(req.url?.endsWith('/dev/tasks'))return json(res,{items:[{id:'task-real',prog:20,col:'coding'}]});res.statusCode=503;json(res,{error:{message:'upstream secret never returned'}});});
 try{
  const runtime=new SoftwareFactoryRuntime({identity:identity(),machineId:'m',baseURL:upstream.baseURL});const detail=await runtime.project(admin,id);assert.equal(detail.tasks[0].progress,20);assert.equal(detail.usage,null);assert.equal(detail.build,null);assert.equal(detail.partialErrors.length,7);assert.equal(detail.boundaries.automaticAcceptance,false);assert(!JSON.stringify(detail).includes('upstream secret'));
 }finally{await upstream.close();}
});

test('software factory cancelled and timed out requests produce no connected result and re-check authorization after network response',async()=>{
 const slow=await fixture((_req,res)=>{setTimeout(()=>json(res,[project]),100);});
 try{
  const timed=new SoftwareFactoryRuntime({identity:identity(),machineId:'m',baseURL:slow.baseURL,timeoutMs:20});const state=await timed.state(admin);assert.equal(state.connected,false);
  const controller=new AbortController();controller.abort();await assert.rejects(timed.projects(admin,controller.signal));
  let current=true;const changed=new SoftwareFactoryRuntime({identity:identity(()=>current),machineId:'m',baseURL:slow.baseURL});const request=changed.projects(admin);setTimeout(()=>current=false,20);await assert.rejects(request,/仅当前管理者/);
 }finally{await slow.close();}
});

test('software factory owner Pi tool remains read-only, rejects other family members and consumes strict projected DTOs',async()=>{
 const paths:string[]=[],upstream=await fixture((req,res)=>{paths.push(req.url!);if(req.url==='/api/projects')return json(res,[project]);if(req.url==='/api/projects/'+id)return json(res,project);if(req.url?.endsWith('/dev/autopilot'))return json(res,{run:null});if(req.url?.endsWith('/dev/build'))return json(res,{build:null});if(req.url?.endsWith('/ai/usage?limit=1'))return json(res,{totals:{calls:'0',tokens_in:'0',tokens_out:'0',cost:'0'}});return json(res,{items:[]});});
 try{
  const runtime=new SoftwareFactoryRuntime({identity:identity(),machineId:'m',baseURL:upstream.baseURL});const tool=createSoftwareFactoryTools(runtime,{...admin,administrator:false})[0];
  const result=await tool.execute('fixture',{view:'project',projectId:id},new AbortController().signal),detail=JSON.parse((result.content[0] as any).text);
  assert.equal(detail.project.id,id);assert.equal(result.details?.readOnly,true);assert.equal(result.details?.automaticAcceptance,false);assert.equal(detail.usage.calls,0,'a true reported zero is distinct from absent usage');
  const require=createRequire(import.meta.url),apply=require('../../../scripts/software-factory-contract.cjs'),Ajv=require('ajv/dist/2020'),formats=require('ajv-formats'),d:any={components:{schemas:{},securitySchemes:{SessionCookie:{type:'apiKey',in:'cookie',name:'jarvis_session'}}},paths:{}};apply(d);const first=JSON.stringify(d);apply(d);assert.equal(JSON.stringify(d),first,'contract augmentation is idempotent');
  const ajv=new Ajv({strict:false});formats(ajv);ajv.addSchema({$id:'factory-contract',...d});const validate=ajv.compile({$ref:'factory-contract#/components/schemas/SoftwareFactoryDetail'});assert(validate(detail),JSON.stringify(validate.errors));assert(!validate({...detail,unexpected:true}));
  const stateValidate=ajv.compile({$ref:'factory-contract#/components/schemas/SoftwareFactoryState'});assert(stateValidate(await runtime.state(admin)),JSON.stringify(stateValidate.errors));const listValidate=ajv.compile({$ref:'factory-contract#/components/schemas/SoftwareFactoryProjects'});assert(listValidate(await runtime.projects(admin)),JSON.stringify(listValidate.errors));
  const child=createSoftwareFactoryTools(runtime,{...admin,actorId:'member-child',profileId:'child',administrator:false})[0];await assert.rejects(child.execute('fixture',{view:'projects'},new AbortController().signal),/仅当前管理者/);
  assert(paths.every(path=>!path.includes('messages')&&!path.includes('stages')));
 }finally{await upstream.close();}
});

test('software factory malformed HTTP-success sections are marked missing, not empty successful stages',async()=>{
 const upstream=await fixture((req,res)=>req.url==='/api/projects/'+id?json(res,project):json(res,{unexpected:'no state supplied'}));
 try{const detail=await new SoftwareFactoryRuntime({identity:identity(),machineId:'m',baseURL:upstream.baseURL}).project(admin,id);assert.equal(detail.partialErrors.length,8);assert(detail.partialErrors.every(r=>r.code==='FACTORY_INVALID_RESPONSE'));assert.equal(detail.usage,null);assert.equal(detail.build,null);}finally{await upstream.close();}
});

test('software factory failed authentication is bounded and does not repeatedly hit login or echo upstream error',async()=>{
 let loginCount=0;const upstream=await fixture((req,res)=>{if(req.url==='/api/auth/login')loginCount++;res.statusCode=401;json(res,{error:{message:'SECRET FAILURE'}});});
 try{
  const runtime=new SoftwareFactoryRuntime({identity:identity(),machineId:'m',baseURL:upstream.baseURL,credentials:()=>({username:'fixture',password:'fixture-secret'})});
  await assert.rejects(runtime.projects(admin),e=>(e as any).code==='FACTORY_AUTH_REQUIRED');await assert.rejects(runtime.projects(admin),e=>(e as any).code==='FACTORY_AUTH_REQUIRED');assert.equal(loginCount,1);const state=await runtime.state(admin);assert.equal(state.connected,false);assert(!JSON.stringify(state).includes('SECRET FAILURE'));
 }finally{await upstream.close();}
});
