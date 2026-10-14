import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import {validateDto} from '../src/v1/contract.js';
import type {PiService} from '../src/pi.js';
const pi=()=>({initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{}} as unknown as PiService);
test('real HTTP workflow: evidence, fixed skill, external progress, human acceptance, immutable release and backup',{timeout:20_000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-v1-workflow-'));let runtime=await createApp({dataDir:dir,pi:pi(),webDir:join(dir,'none')});
 try{
  const setup=await runtime.app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'V1-workflow-test-passphrase'}}),cookie=String(setup.headers['set-cookie']).split(';')[0],headers={cookie};
  const command=async(domain:string,name:string,payload:any,version=0)=>{const r=await runtime.app.inject({method:'POST',url:`/api/v1/${domain}/commands/${name}`,headers,payload:{commandId:randomUUID(),expectedVersion:version,scope:'personal',payload}});assert.equal(r.statusCode,200,`${domain}.${name}: ${r.body}`);return r.json().data};
  const check=(name:string,data:any)=>{const result=validateDto(name,data);assert.equal(result.valid,true,`${name}: ${JSON.stringify(result.errors)}`)};
  let experience=await command('experiences','capture',{title:'发布前验证恢复',content:'部署之前验证恢复脚本和备份。',kind:'experience',source:'本人开发记录',conditions:'本机预发布'});check('Experience',experience);
  experience=await command('experiences','verify',{experienceId:experience.id,evidence:'人工记录：恢复演练 REF-001 验证通过。',conditions:'本机预发布'},experience.revision);check('Experience',experience);
  let skill=await command('experiences','skill-publish',{experienceId:experience.id,version:'1.0.0',content:experience.content,conditions:experience.conditions,evidence:experience.evidence},experience.revision);check('Experience',skill);
  const project=await command('projects','register',{name:'真实接口交付',description:'验证有证据的交付流程',goal:'输入、保存、验收与固定版本',repo:'D:/AI/workspaces/MyJevis',copies:[{machineId:'local',path:'D:/AI/workspaces/MyJevis',branch:'main',environment:'development'}],milestones:['完成接口验收']});check('Project',project);
  const observation=await command('tasks','create',{title:'外部观察',projectId:project.id,machineId:'local',agent:'manual-external',mode:'observe',goal:'仅记录外部任务',criteria:'不能由平台控制',budget:20,retryLimit:2});
  const forbidden=await runtime.app.inject({method:'POST',url:'/api/v1/tasks/commands/start',headers,payload:{commandId:randomUUID(),expectedVersion:observation.revision,scope:'personal',payload:{taskId:observation.id}}});assert.equal(forbidden.statusCode,403,forbidden.body);assert.equal(forbidden.json().code,'FORBIDDEN');assert.equal(forbidden.json().details.reason,'OBSERVE_ONLY');
  let task=await command('tasks','create',{title:'执行验收',projectId:project.id,machineId:'local',agent:'manual-external',mode:'managed',goal:'验收HTTP与持久化',criteria:'有来源的外部报告与人工独立确认',budget:20,retryLimit:2,skillIds:[skill.id]});check('Task',task);
  const started=await runtime.app.inject({method:'POST',url:'/api/v1/tasks/commands/start',headers,payload:{commandId:randomUUID(),expectedVersion:task.revision,scope:'personal',payload:{taskId:task.id}}});assert.equal(started.statusCode,503,started.body);assert.equal(started.json().code,'NOT_CONFIGURED');assert.equal(runtime.v1.read('tasks',task.id,'server-admin')!.status,'queued');assert.equal(runtime.v1.read('tasks',task.id,'server-admin')!.cost,0);
  task=await command('tasks','report',{taskId:task.id,status:'validating',progress:95,artifacts:['REPORT-001'],source:'本人手动录入，本机测试报告',evidence:'报告 REF-001；原始执行发生在平台之外。'},task.revision);check('Task',task);assert.equal(task.externalReports.at(-1).evidence,'报告 REF-001；原始执行发生在平台之外。');assert.equal(task.externalReports.at(-1).executionDispatched,false);
  task=await command('tasks','accept',{taskId:task.id,acceptance:{outcome:'pass',evidence:'本人独立核对报告 REF-001 与验收标准。',tests:'HTTP、权限、持久化检查的人工记录',artifacts:['REPORT-001']}},task.revision);check('Task',task);assert.equal(task.acceptance.reviewerId,'server-admin');assert.equal(task.status,'completed');
  task=await command('tasks','package',{taskId:task.id,version:'1.0.0'},task.revision);check('Task',task);
  let releases=(await runtime.app.inject({url:'/api/v1/releases',headers})).json().data.items;assert.equal(releases.length,1);check('Release',releases[0]);const fixed=structuredClone(releases[0]);
  const before=runtime.v1.version('server-admin');await command('tasks','package',{taskId:task.id,version:'1.0.0'},task.revision);assert.equal(runtime.v1.version('server-admin'),before,'already-fixed package does not publish a fake state change');
  skill=await command('experiences','version',{experienceId:skill.id,version:'2.0.0',content:'增加校验摘要',conditions:'本机预发布',evidence:'新修订待验证'},skill.revision);check('Experience',skill);assert.equal(skill.verified,false);const taskAfter=runtime.v1.read('tasks',task.id,'server-admin')!;assert.equal(taskAfter.skillRefs[0].version,'1.0.0');
  const beforeCapture=runtime.v1.list('inbox','server-admin').length;const authorization=await command('inbox','capture-policy',{machineId:'local',fields:['summary','error'],enabled:true,consent:true});check('CapturePolicy',authorization);assert.equal(authorization.collectorStatus,'configured');assert.equal(runtime.v1.list('inbox','server-admin').length,beforeCapture,'authorization does not fabricate captured device data');
  const backup=join(dir,'backup.db');runtime.store.backup(backup);const restoredDir=join(dir,'restored');await mkdir(restoredDir);await copyFile(backup,join(restoredDir,'jarvis.db'));
  // Encrypted runtime configuration requires its matching key, even when the
  // workflow itself never requests speech or a paid model.
  await mkdir(join(restoredDir,'runtime'));
  await copyFile(join(dir,'runtime','voice-master.key'),join(restoredDir,'runtime','voice-master.key'));
  const restored=await createApp({dataDir:restoredDir,pi:pi(),webDir:join(dir,'none')});try{assert.deepEqual(restored.v1.list('releases','server-admin')[0],fixed);assert.equal(restored.v1.read('tasks',task.id,'server-admin')!.externalReports.length,1);assert.equal(restored.store.hasAccount(),true)}finally{await restored.app.close()}
  releases=(await runtime.app.inject({url:'/api/v1/releases',headers})).json().data.items;assert.deepEqual(releases[0],fixed);
 }finally{await runtime.app.close();await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
});
test('real HTTP research decisions create one project and cursor pagination remains owner bound',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-v1-research-'));const runtime=await createApp({dataDir:dir,pi:pi(),webDir:join(dir,'none')});
 try{
  const setup=await runtime.app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'V1-research-test-passphrase'}}),cookie=String(setup.headers['set-cookie']).split(';')[0],headers={cookie};
  const command=async(name:string,payload:any,version=0)=>{const response=await runtime.app.inject({method:'POST',url:`/api/v1/research/commands/${name}`,headers,payload:{commandId:randomUUID(),expectedVersion:version,scope:'personal',payload}});assert.equal(response.statusCode,200,response.body);return response.json().data};
  let research=await command('create',{title:'家庭学习资料',raw:'如何让课程保留原文出处？'});let revision=validateDto('Research',research);assert.equal(revision.valid,true,JSON.stringify(revision.errors));
  research=await command('discuss',{researchId:research.id,text:'先确保引用可追溯。',question:'如何版本化？',criteria:'修改后保留旧引用'},research.revision);
  research=await command('evidence',{researchId:research.id,kind:'support',title:'内部手工检查',summary:'固定版本的引用可保留历史',source:'本人核验',locator:'REF-KNOWLEDGE-01',status:'verified'},research.revision);
  research=await command('option',{researchId:research.id,title:'固定版本',approach:'保存出处与版本号',risk:'新增修订需重核对',effort:'一周',budget:20,benefit:'可以追溯'},research.revision);
  research=await command('decide',{researchId:research.id,choice:'accepted',reason:'证据支持此方案',optionId:research.options[0].id},research.revision);
  const converted=await command('convert',{researchId:research.id,name:'家庭资料引用',description:'让课程保留可核对出处',goal:'固定版本与人工核对',milestones:['完成版本规则']},research.revision);revision=validateDto('Project',converted);assert.equal(revision.valid,true,JSON.stringify(revision.errors));research=runtime.v1.read('research',research.id,'server-admin')!;assert.equal(research.projectId,converted.id);assert.equal(research.status,'converted');revision=validateDto('Research',research);assert.equal(revision.valid,true,JSON.stringify(revision.errors));
  const first=(await runtime.app.inject({url:'/api/v1/projects?limit=1',headers})).json().data;assert.equal(first.items.length,1);
  await command('create',{title:'后续资料',raw:'记录新的问题'});
  const page=(await runtime.app.inject({url:'/api/v1/research?limit=1',headers})).json().data;assert.ok(page.nextCursor);const second=(await runtime.app.inject({url:`/api/v1/research?limit=1&cursor=${page.nextCursor}`,headers})).json().data;assert.equal(second.items[0].title,'后续资料');assert.notEqual(second.items[0].id,page.items[0].id);
  const wrong=(await runtime.app.inject({url:`/api/v1/projects?cursor=${page.nextCursor}`,headers}));assert.equal(wrong.statusCode,400);
 }finally{await runtime.app.close();await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
});
