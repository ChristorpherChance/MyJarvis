import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import {validateDto} from '../src/v1/contract.js';
import {V1Repository} from '../src/v1/repository.js';
import type {PiService} from '../src/pi.js';
import type {DomainHandler} from '../src/v1/types.js';
const pi=()=>({initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{}}as unknown as PiService);
const time=()=>new Date().toISOString();
const device={name:'书房联想',role:'开发与语音验证',category:'laptop',cpu:'Ryzen 7 PRO 4750U',ram:64,disk:'512GB',gpu:'核显',os:'Windows 11',address:'',room:'书房',always:false};
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'jarvis-infrastructure-')),runtime=await createApp({dataDir:dir,pi:pi(),webDir:join(dir,'absent')}),login=await runtime.app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'Infrastructure-test-passphrase'}}),headers={cookie:String(login.headers['set-cookie']).split(';')[0]};return {dir,runtime,headers,command:async(domain:string,name:string,payload:any,revision=0,scope='personal',id=randomUUID())=>runtime.app.inject({method:'POST',url:`/api/v1/${domain}/commands/${name}`,headers,payload:{commandId:id,expectedVersion:revision,scope,payload}}),async close(){await runtime.app.close();const absolute=resolve(dir);assert.ok(absolute.startsWith(resolve(tmpdir())+sep)&&absolute.includes('jarvis-infrastructure-'));await rm(absolute,{recursive:true,force:true})}}}
const good=(response:any)=>{assert.equal(response.statusCode,200,response.body);const data=response.json().data,validation=validateDto('InfrastructureRecord',data);assert.equal(validation.valid,true,JSON.stringify(validation.errors));return data;};

test('infrastructure registration: strict DTO, revisions, isolation and unverified manual heartbeat',async()=>{
 const f=await fixture();try{
  const anon=await f.runtime.app.inject({url:'/api/v1/machines'});assert.equal(anon.statusCode,401);
  const forged=await f.command('machines','register',{...device,command:'shutdown',ownerId:'wife'});assert.equal(forged.statusCode,400);
  const commandId=randomUUID(),first=await f.command('machines','register',device,0,'personal',commandId);let m=good(first);assert.equal(m.status,'unknown');assert.equal(m.lastSeen,null);assert.equal(m.executionDispatched,false);
  assert.deepEqual((await f.command('machines','register',device,0,'personal',commandId)).json(),first.json());assert.equal((await f.runtime.app.inject({url:'/api/v1/machines',headers:f.headers})).json().data.items.length,1);
  const badAgent=await f.command('machines','heartbeat',{machineId:m.id,source:'agent',status:'online',evidence:'forged',observedAt:time()},m.revision);assert.equal(badAgent.statusCode,400);
  m=good(await f.command('machines','heartbeat',{machineId:m.id,source:'manual',status:'online',evidence:'本人通过书房屏幕观察',observedAt:time(),cpuPercent:0,memoryPercent:25},m.revision));assert.equal(m.status,'unknown');assert.equal(m.lastSeen,null);assert.equal(m.observation.status,'online');assert.equal(m.observation.cpuPercent,0);assert.equal(m.observation.verification,'unverified_external');
  const stale=await f.command('machines','update',{...device,machineId:m.id},1);assert.equal(stale.statusCode,409);
  const cross=await f.command('machines','heartbeat',{machineId:m.id,source:'manual',status:'online',evidence:'跨范围',observedAt:time()},m.revision,'family');assert.equal(cross.statusCode,403);
  const stopped=await f.command('machines','wake',{machineId:m.id},m.revision);assert.equal(stopped.statusCode,503);assert.equal(stopped.json().code,'NOT_CONFIGURED');assert.equal(f.runtime.v1.read('machines',m.id,'server-admin')!.revision,m.revision);
  const company=good(await f.command('machines','register',{...device,name:'公司HP'},0,'company'));assert.equal(company.readOnly,true);const unsafe=await f.command('machines','resource-rule',{machineId:company.id,cpuLimit:80,memoryReserveGB:4,concurrency:1,quiet:'',enabled:true},company.revision,'company');assert.equal(unsafe.statusCode,403);
  const reopened=new V1Repository(f.runtime.store.databasePath);try{const durable=reopened.read('machines',m.id,'server-admin')!;assert.equal(durable.observation.evidence,'本人通过书房屏幕观察');assert.equal(durable.observations.length,1);assert.equal(durable.status,'unknown');}finally{reopened.close()}
 }finally{await f.close()}
});

test('deployment records bind service, fixed release, backup and individual approval without remote execution',async()=>{
 const f=await fixture();try{
  const m=good(await f.command('machines','register',device));
  const registered=await f.command('projects','register',{name:'隔离验收项目',description:'真实格式的项目种子',goal:'隔离测试固定发布',copies:[],milestones:[]});assert.equal(registered.statusCode,200,registered.body);const project=registered.json().data;
  const seed:DomainHandler={domain:'releases',commands:['fixture'],execute(_c,_p,ctx){const r=ctx.create('releases',{projectId:project.id,taskId:'fixture-task',version:'1.0.0',artifactIds:['TEST-REPORT'],acceptance:{outcome:'pass',evidence:'测试独立验收记录',tests:'测试版本检查',artifacts:['TEST-REPORT'],reviewerId:ctx.actorId,at:ctx.now},createdAt:ctx.now});ctx.emit('releases',r.id,'fixture');return r}};
  const release=f.runtime.v1.execute(seed,'fixture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},'server-admin',()=>undefined).data;
  let service=good(await f.command('services','register',{name:'测试服务',description:'隔离测试用登记',machineId:m.id,projectId:project.id,environment:'production',version:'0.9.0',method:'外部人工发布',entry:'https://unrequested.invalid/',healthPath:'https://unrequested.invalid/health'}));
  service=good(await f.command('services','health',{serviceId:service.id,source:'manual',health:'healthy',observedAt:time(),evidence:'人工观察；没有发请求'},service.revision));assert.equal(service.health,'unknown');assert.equal(service.healthObservation.health,'healthy');
  const backup=good(await f.command('operations','backup',{machineId:m.id,target:'platform',snapshot:'fixture-snapshot',locator:'fixture/backup.sqlite',checksum:'sha256:test-fixture',observedAt:time(),evidence:'测试凭证，未读取真实文件',source:'manual'}));
  const request={serviceId:service.id,releaseId:release.id,version:'1.0.0',environment:'production',backupId:backup.id,rollback:'外部恢复0.9.0并检查',reason:'隔离工作流测试'};
  const wrong=await f.command('services','request-deployment',{...request,version:'2.0.0'},service.revision);assert.equal(wrong.statusCode,422);
  let d=good(await f.command('services','request-deployment',request,service.revision));assert.equal(d.status,'requested');assert.equal(d.executionDispatched,false);const a=f.runtime.v1.read('approvals',d.approvalId,'server-admin')!;
  const validation={deploymentId:d.id,source:'manual',outcome:'pass',executionReceipt:'外部执行REF-001',evidence:'独立人工检查REF-002',tests:['入口','版本','权限'],observedVersion:'1.0.0',observedAt:time()};const early=await f.command('services','verify',validation,d.revision);assert.equal(early.statusCode,422);
  const noConfirm=await f.command('approvals','decide',{approvalId:a.id,decision:'approve',reason:'同意指定申请'},a.revision);assert.equal(noConfirm.statusCode,422);
  const approvalResponse=await f.command('approvals','decide',{approvalId:a.id,decision:'approve',reason:'同意指定申请，外部执行另行处理',confirmTitle:a.title},a.revision);const approval=good(approvalResponse);assert.equal(approval.status,'approved');assert.equal(approval.decision.executionDispatched,false);assert.ok(approvalResponse.json().events.some((e:any)=>e.domain==='operations'&&e.objectId===d.id),'跨域事件刷新总览中的部署状态');d=f.runtime.v1.read('operations',d.id,'server-admin')!;
  const execute=await f.command('services','execute',{deploymentId:d.id},d.revision);assert.equal(execute.statusCode,503);assert.equal(f.runtime.v1.read('services',service.id,'server-admin')!.version,'0.9.0');
  d=good(await f.command('services','verify',validation,d.revision));assert.equal(d.status,'external-pass');assert.equal(d.verificationRecord.verification,'unverified_external');assert.equal(d.verificationRecord.executionDispatched,false);assert.equal(f.runtime.v1.read('services',service.id,'server-admin')!.version,'0.9.0','manual external observation cannot silently overwrite registered version');
  const restore=await f.command('services','restore',{deploymentId:d.id},d.revision);assert.equal(restore.statusCode,409,'人工 external-pass 没有真实部署回执，不可进入生产恢复');
 }finally{await f.close()}
});

test('operational policies, real bill evidence, single power readings and isolated restore observations',async()=>{
 const f=await fixture();try{
  const m=good(await f.command('machines','register',device));
  let budget=good(await f.command('operations','budget',{dailyBudget:50,retryLimit:2,stopOnBudget:true,note:'书房测试'}));assert.equal(budget.enforcement,'reference-only');assert.equal(budget.verification,'configuration_only');
  assert.equal((await f.command('operations','budget',{dailyBudget:100,retryLimit:2,stopOnBudget:true},0)).statusCode,409);budget=good(await f.command('operations','budget',{dailyBudget:100,retryLimit:2,stopOnBudget:true},budget.revision));
  const invalid=await f.command('operations','resource-policy',{humanReserve:80,voiceReserve:30,batchLimit:1,quiet:'',autotest:true,autoWake:false,supervise:false,emergency:false});assert.equal(invalid.statusCode,422);
  const resource=good(await f.command('operations','resource-policy',{humanReserve:30,voiceReserve:20,batchLimit:1,quiet:'22:00-07:00',autotest:true,autoWake:true,supervise:true,emergency:false}));assert.equal(resource.enforcement,'configured');assert.equal(resource.timezone,'Asia/Shanghai');assert.equal(resource.executionDispatched,false);
  const bill=good(await f.command('operations','metering',{provider:'测试账单',amount:0,currency:'USD',periodStart:time(),periodEnd:time(),evidence:'测试实际零金额账单依据',source:'manual'}));assert.equal(bill.amount,0);assert.equal(bill.currency,'USD');
  const power=good(await f.command('operations','power',{machineId:m.id,watts:0,observedAt:time(),evidence:'插座仪表零读数测试',source:'manual'}));assert.equal(power.watts,0);assert.equal(power.verification,'unverified_external');
  let backup=good(await f.command('operations','backup',{machineId:m.id,target:'platform',snapshot:'隔离测试快照',locator:'fixture/backup',checksum:'sha256:fixture',observedAt:time(),evidence:'测试外部备份凭据',source:'manual'}));
  const report={backupId:backup.id,restoreTarget:'production',isolated:true,source:'manual',outcome:'pass',executionReceipt:'外部恢复TEST',evidence:'隔离验证依据',tests:['数据库完整性'],observedAt:time()};assert.equal((await f.command('operations','restore-drill',report,backup.revision)).statusCode,422);
  backup=good(await f.command('operations','restore-drill',{...report,restoreTarget:'fixture-isolated-copy'},backup.revision));assert.equal(backup.restoration.isolated,true);assert.equal(backup.status,'registered');assert.equal(backup.restoration.executionDispatched,false);assert.equal(backup.restoration.verification,'unverified_external');
 }finally{await f.close()}
});

test('approval cannot authorize a changed host or environment and rejection leaves an explicit receipt',async()=>{
 const f=await fixture();try{
  const m=good(await f.command('machines','register',device));
  const seed:DomainHandler={domain:'releases',commands:['fixture'],execute(_c,_p,ctx){const r=ctx.create('releases',{projectId:'fixture-project',taskId:'fixture-task',version:'1.0.0',artifactIds:['TEST-REPORT'],acceptance:{outcome:'pass',evidence:'测试验收记录',tests:'测试检查',artifacts:['TEST-REPORT'],reviewerId:ctx.actorId,at:ctx.now},createdAt:ctx.now});ctx.emit('releases',r.id,'fixture');return r}};
  const release=f.runtime.v1.execute(seed,'fixture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},'server-admin',()=>undefined).data;
  const registration={name:'目标绑定测试',description:'不能扩大已有授权',machineId:m.id,environment:'test',version:'0.9.0',method:'人工'};let s=good(await f.command('services','register',registration));
  const b=good(await f.command('operations','backup',{machineId:m.id,target:'platform',snapshot:'绑定测试快照',locator:'fixture/target-backup',checksum:'sha256:fixture',observedAt:time(),evidence:'测试凭据',source:'manual'}));
  const d=good(await f.command('services','request-deployment',{serviceId:s.id,releaseId:release.id,version:'1.0.0',environment:'test',backupId:b.id,rollback:'恢复旧版',reason:'仅批准测试环境'},s.revision));
  s=f.runtime.v1.read('services',s.id,'server-admin')!;good(await f.command('services','update',{...registration,serviceId:s.id,environment:'production'},s.revision));
  const a=f.runtime.v1.read('approvals',d.approvalId,'server-admin')!,before=f.runtime.v1.version('server-admin');
  const unsafe=await f.command('approvals','decide',{approvalId:a.id,decision:'approve',reason:'原申请'},a.revision);assert.equal(unsafe.statusCode,409);assert.equal(f.runtime.v1.version('server-admin'),before);assert.equal(f.runtime.v1.read('approvals',a.id,'server-admin')!.status,'pending');
  const rejected=good(await f.command('approvals','decide',{approvalId:a.id,decision:'reject',reason:'环境变更，重新申请'},a.revision));assert.equal(rejected.status,'rejected');assert.equal(f.runtime.v1.read('operations',d.id,'server-admin')!.status,'rejected');
 }finally{await f.close()}
});
