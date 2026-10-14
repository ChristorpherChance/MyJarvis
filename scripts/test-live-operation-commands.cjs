const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { buildSync } = require('esbuild');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-live-commands-'));
const output = path.join(temp, 'commands.cjs');
buildSync({entryPoints:[path.resolve('apps/web/src/demo/live-operation-commands.ts')],bundle:true,platform:'node',format:'cjs',outfile:output,logLevel:'silent'});
const { executeLiveOperation } = require(output);
const records = {inbox:[{id:'i1',revision:8,scope:'private',ownerId:'server-admin'}],research:[{id:'r1',revision:2,scope:'personal',ownerId:'server-admin'}],projects:[{id:'p1',revision:5,scope:'company',ownerId:'server-admin'}],tasks:[{id:'t1',revision:4,scope:'company',ownerId:'server-admin'}],experiences:[{id:'e1',revision:6,scope:'personal',ownerId:'server-admin',version:'1.0.0'}]};
const data = {profile:'me'};
const calls=[];
const response = (body, status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const receipt = call => ({requestId:'qa',version:1,data:{id:call.payload.inboxId||'created-id'},events:[]});
let handler = call => response(receipt(call));
global.fetch = async (url,init) => {const body=JSON.parse(init.body);calls.push({url,...body});return handler(body);};
const capture = text => ({command:'capture',expectedVersion:0,patch:{kind:'idea',title:'测试',text,scope:'private',terminal:'网页',origin:'manual'}});
let checks=0;
async function check(name, fn) {await fn();checks++;console.log('PASS '+name);}

(async()=>{
 await check('uncertain network retry reuses immutable command ID',async()=>{
   handler=()=>{throw new TypeError('network disconnected')};
   await assert.rejects(executeLiveOperation('op.inbox',capture('保持输入'),data,records),/network/);
   const first=calls.at(-1);handler=call=>response(receipt(call));
   await executeLiveOperation('op.inbox',capture('保持输入'),data,records);
   assert.equal(calls.at(-1).commandId,first.commandId);
   assert.deepEqual(calls.at(-1).payload,{rawText:'保持输入',title:'测试',kind:'idea',terminalId:'网页',origin:'manual'});
   assert.equal(calls.at(-1).scope,'private');assert.equal(calls.at(-1).expectedVersion,0);
   await executeLiveOperation('op.inbox',capture('保持输入'),data,records);
   assert.notEqual(calls.at(-1).commandId,first.commandId,'a completed form is a new intent');
 });
 await check('concurrent duplicate clicks send one command',async()=>{
   let release;handler=call=>new Promise(resolve=>{release=()=>resolve(response(receipt(call)))});
   const before=calls.length;
   const first=executeLiveOperation('op.inbox',capture('双击'),data,records);
   const second=executeLiveOperation('op.inbox',capture('双击'),data,records);
   assert.equal(calls.length,before+1);release();await Promise.all([first,second]);
 });
 await check('conflict preserves opened version and scope, never silently rebases',async()=>{
   handler=()=>response({code:'VERSION_CONFLICT',message:'需复核'},409);
   const payload={command:'ignore',id:'i1',expectedVersion:3,recordScope:'private',reason:'复核后忽略'};
   await assert.rejects(executeLiveOperation('op.inbox',payload,data,records),e=>e.status===409&&e.code==='VERSION_CONFLICT');
   const previous=calls.at(-1);records.inbox[0].revision=9;
   await assert.rejects(executeLiveOperation('op.inbox',payload,data,records));
   assert.equal(calls.at(-1).commandId,previous.commandId);
   assert.equal(calls.at(-1).expectedVersion,3);assert.equal(calls.at(-1).scope,'private');
   handler=call=>response(receipt(call));
 });
 await check('changed failed input receives a new command ID',async()=>{
   const prior=calls.at(-1).commandId;
   await executeLiveOperation('op.inbox',{command:'ignore',id:'i1',expectedVersion:3,recordScope:'private',reason:'不同的复核理由'},data,records);
   assert.notEqual(calls.at(-1).commandId,prior);
 });
 await check('unsupported local passive action cannot manufacture a collection result',async()=>{
   const before=calls.length;
   for(const [action,payload] of [['op.inbox',{command:'passive'}],['op.policy',{patch:{supervise:true}}]]){
     await assert.rejects(executeLiveOperation(action,payload,data,records),e=>e.code==='NOT_CONFIGURED');
   }
   assert.equal(calls.length,before);
 });
 await check('keep-independent records a reason through its real command',async()=>{
   await executeLiveOperation('op.inbox',{command:'keep-independent',id:'i1',expectedVersion:9,recordScope:'private',reason:'背景不同'},data,records);
   assert.match(calls.at(-1).url,/keep-independent$/);assert.deepEqual(calls.at(-1).payload,{inboxId:'i1',reason:'背景不同'});
 });
 await check('task creation uses actual project scope and strips demo fields',async()=>{
   await executeLiveOperation('op.task',{command:'create',expectedVersion:0,patch:{title:'任务',project:'p1',machine:'local',agent:'Codex',mode:'observe',goal:'目标',criteria:'标准',budget:40,retryLimit:1,milestone:-1,skills:[],session:'external-1',dependsOn:''}},data,records);
   const last=calls.at(-1);assert.equal(last.scope,'company');assert.equal(last.payload.projectId,'p1');assert.equal(last.payload.sessionId,'external-1');assert.ok(!('milestone' in last.payload));assert.ok(!('scope' in last.payload));assert.ok(!('ownerId' in last.payload));
 });
 await check('manual external evidence and independent acceptance remain separate',async()=>{
   await executeLiveOperation('op.task',{command:'report',id:'t1',expectedVersion:4,recordScope:'company',patch:{source:'本人外部会话',evidence:'日志地址',progress:80,status:'validating',artifacts:['result.txt']}},data,records);
   assert.match(calls.at(-1).url,/report$/);assert.equal(calls.at(-1).payload.source,'本人外部会话');assert.ok(!('acceptance' in calls.at(-1).payload));
   await executeLiveOperation('op.task',{command:'validate',id:'t1',expectedVersion:4,recordScope:'company',outcome:'pass',reason:'说明',patch:{evidence:'独立检查',tests:'真实用例通过',artifacts:['result.txt']}},data,records);
   assert.match(calls.at(-1).url,/accept$/);assert.deepEqual(calls.at(-1).payload.acceptance,{outcome:'pass',evidence:'独立检查',tests:'真实用例通过',artifacts:['result.txt']});
 });
 await check('published skill binds exactly one target and a fixed version',async()=>{
   await executeLiveOperation('op.experience',{command:'reuse',id:'e1',expectedVersion:6,recordScope:'personal',taskId:'t1',projectId:'p1',version:'1.0.0'},data,records);
   assert.deepEqual(calls.at(-1).payload,{experienceId:'e1',version:'1.0.0',taskId:'t1'});
 });
 await check('research conversion preserves honest copy metadata',async()=>{
   await executeLiveOperation('op.research',{command:'convert',id:'r1',expectedVersion:2,recordScope:'personal',patch:{name:'项目',desc:'说明',goal:'交付',milestones:['样本'],machine:'local',path:'D:/work',branch:'main'}},data,records);
   assert.deepEqual(calls.at(-1).payload.copies,[{machineId:'local',path:'D:/work',branch:'main',environment:'development'}]);assert.equal(calls.at(-1).payload.description,'说明');
 });
 await check('task dispatch and research start reach the actual backend configuration gates',async()=>{
   await executeLiveOperation('op.task',{command:'start',id:'t1',expectedVersion:4,recordScope:'company'},data,records);assert.match(calls.at(-1).url,/tasks\/commands\/start$/);assert.deepEqual(calls.at(-1).payload,{taskId:'t1'});
   await executeLiveOperation('op.research',{command:'start',id:'r1',patch:{question:'明确问题',criteria:'引用证据',budget:1,minutes:5,retryLimit:0,machine:'local'}},data,records);assert.match(calls.at(-1).url,/research\/commands\/start$/);assert.deepEqual(calls.at(-1).payload,{researchId:'r1',question:'明确问题',criteria:'引用证据',plan:{budget:1,minutes:5,retryLimit:0,machineId:'local'}});
 });
 await check('project editing includes only allowed basic fields and keeps scope and version frozen',async()=>{
   await executeLiveOperation('op.project',{command:'update',id:'p1',expectedVersion:3,recordScope:'company',patch:{name:'新名称',desc:'完整说明',goal:'明确目标',repo:'https://example.invalid/repo',scope:'personal',stage:'模拟阶段',milestones:['不得覆盖']}},data,records);assert.match(calls.at(-1).url,/projects\/commands\/update$/);assert.equal(calls.at(-1).scope,'company');assert.equal(calls.at(-1).expectedVersion,3);assert.deepEqual(calls.at(-1).payload,{projectId:'p1',name:'新名称',description:'完整说明',goal:'明确目标',repo:'https://example.invalid/repo'});
 });
 await check('environment information saves fixed metadata without treating commands as executable code',async()=>{
   await executeLiveOperation('op.project',{command:'environment-info',id:'p1',expectedVersion:5,recordScope:'company',patch:{environmentInfo:{environment:'Node 24',runCommand:'npm run dev',verifyCommand:'npm test',notes:'仅登记；运行受控模板另行配置',arbitrary:'不要传入'}}},data,records);assert.match(calls.at(-1).url,/projects\/commands\/environment-info$/);assert.equal(calls.at(-1).expectedVersion,5);assert.deepEqual(calls.at(-1).payload,{projectId:'p1',environmentInfo:{environment:'Node 24',runCommand:'npm run dev',verifyCommand:'npm test',notes:'仅登记；运行受控模板另行配置'}});
 });
 await check('task limits carry immutable budget/retry snapshots and clear deadlines explicitly',async()=>{
   await executeLiveOperation('op.task',{command:'policy',id:'t1',expectedVersion:4,recordScope:'company',reason:'人工修改边界',patch:{budget:10,retryLimit:2,goal:'新目标',criteria:'独立验收',deadline:''}},data,records);assert.match(calls.at(-1).url,/tasks\/commands\/limits$/);assert.deepEqual(calls.at(-1).payload,{taskId:'t1',budget:10,retryLimit:2,reason:'人工修改边界',goal:'新目标',criteria:'独立验收',deadline:null});
   await executeLiveOperation('op.task',{command:'requestBudget',id:'t1',expectedVersion:4,recordScope:'company',reason:'管理员调整上限',patch:{budget:20,retryLimit:3}},data,records);assert.deepEqual(calls.at(-1).payload,{taskId:'t1',budget:20,retryLimit:3,reason:'管理员调整上限'});
 });
 await check('experience captures and revisions retain summary, tags, project and health isolation',async()=>{
   await executeLiveOperation('op.experience',{command:'create',expectedVersion:0,patch:{title:'经验',summary:'先验证',content:'原始经验',conditions:'可重现',kind:'experience',source:'任务日志',project:'p1',machine:'local',tags:'验证,部署'}},data,records);assert.match(calls.at(-1).url,/experiences\/commands\/capture$/);assert.deepEqual(calls.at(-1).payload,{title:'经验',content:'原始经验',kind:'experience',source:'任务日志',conditions:'可重现',summary:'先验证',tags:['验证','部署'],projectId:'p1',terminalId:'local'});
   await executeLiveOperation('op.experience',{command:'create',patch:{title:'本人健康备忘',content:'本人原话',kind:'health',source:'本人记录',scope:'private'}},data,records);assert.equal(calls.at(-1).scope,'private');assert.equal(calls.at(-1).payload.kind,'health');
   await executeLiveOperation('op.experience',{command:'update',id:'e1',patch:{title:'修订',content:'新正文',kind:'lesson',source:'本人复核',summary:'简述',tags:['复核']}},data,records);assert.match(calls.at(-1).url,/experiences\/commands\/update$/);assert.deepEqual(calls.at(-1).payload,{experienceId:'e1',title:'修订',content:'新正文',source:'本人复核',kind:'lesson',summary:'简述',tags:['复核']});
   await executeLiveOperation('op.experience',{command:'archive',id:'e1',recordScope:'private',reason:'本人移除'},data,records);assert.match(calls.at(-1).url,/experiences\/commands\/archive$/);assert.deepEqual(calls.at(-1).payload,{experienceId:'e1',reason:'本人移除'});
 });
 await check('removing a research option submits the exact option and justification',async()=>{
   await executeLiveOperation('op.research',{command:'remove-option',id:'r1',expectedVersion:2,optionId:'o1',reason:'证据不足'},data,records);assert.match(calls.at(-1).url,/remove-option$/);assert.deepEqual(calls.at(-1).payload,{researchId:'r1',optionId:'o1',reason:'证据不足'});
 });
 await check('inbox classification edits send only allowed annotations and preserve frozen scope/version',async()=>{
   await executeLiveOperation('op.inbox',{command:'update',id:'i1',expectedVersion:9,recordScope:'private',patch:{title:'技能候选',kind:'skill',annotation:'核对后分类',tags:'项目,经验',rawText:'绝不可覆盖原话'}},data,records);
   assert.match(calls.at(-1).url,/inbox\/commands\/annotate$/);assert.equal(calls.at(-1).scope,'private');assert.equal(calls.at(-1).expectedVersion,9);assert.deepEqual(calls.at(-1).payload,{inboxId:'i1',title:'技能候选',kind:'skill',note:'核对后分类',tags:['项目','经验']});
 });
 await check('company capture authorizes explicit company projects and never grants execution rights',async()=>{
   data.machines=[{id:'company-node',readOnly:true,scope:'company',role:'公司主开发'},{id:'local',readOnly:false}];records.projects.push({id:'personal-project',scope:'personal'});const base={command:'policy',expectedVersion:0,patch:{machineId:'company-node',fields:['lesson'],enabled:true,consent:true}};
   const before=calls.length;for(const intent of [{...base,recordScope:'company'},{...base,recordScope:'personal',patch:{...base.patch,projectId:'p1'}},{...base,recordScope:'company',patch:{...base.patch,projectId:'personal-project'}}])await assert.rejects(()=>executeLiveOperation('op.inbox',intent,data,records),e=>e.code==='FORBIDDEN');assert.equal(calls.length,before);
   await executeLiveOperation('op.inbox',{...base,recordScope:'company',expectedVersion:7,patch:{...base.patch,projectId:'p1',executor:'must-not-be-sent'}},data,records);const call=calls.at(-1);assert.match(call.url,/inbox\/commands\/capture-policy$/);assert.equal(call.scope,'company');assert.equal(call.expectedVersion,7);assert.deepEqual(call.payload,{machineId:'company-node',projectId:'p1',fields:['lesson'],enabled:true,consent:true});
 });
 console.log(`${checks} live command checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
