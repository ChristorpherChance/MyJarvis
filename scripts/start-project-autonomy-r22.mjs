/** The approved factory-only autonomous plan. Durable intents make bootstrap replayable. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4';
const release='20261011-project-autonomy-r22-4';
const execute=process.argv.includes('--execute'),start=process.argv.includes('--start');
const directory='artifacts/software-factory/autonomy-r22';
const journalPath='.jarvis-dev/maintenance/project-autonomy-r22-bootstrap.json';
const spec=JSON.parse(await readFile(directory+'/objectives.json','utf8'));
const preparation=JSON.parse(await readFile(directory+'/preparation.json','utf8'));
const config={...preparation.config,costPolicy:'record-only',maxUSD:null,maxTokens:null,perTaskUSD:null,scopeBudgets:{'factory-system':{maxUSD:null,maxTokens:null},'customer-product':{maxUSD:null,maxTokens:null},'agent-improvement':{maxUSD:null,maxTokens:null}}};
// The installed trusted policy, rather than a candidate self-report, defines each fixed gate.
const installed=JSON.parse(await readFile(directory+'/validator-installation.json','utf8'));
const exitCorrection=JSON.parse(await readFile(directory+'/validator-r4-installation.json','utf8'));if(!exitCorrection.installed||exitCorrection.correction!=='COLLECTOR_PROCESS_NONZERO')throw Error('AUTONOMY_COLLECTOR_EXIT_CORRECTION_NOT_INSTALLED');
const phaseExitCorrection=JSON.parse(await readFile(directory+'/validator-r7-installation.json','utf8'));if(!phaseExitCorrection.installed||phaseExitCorrection.correction!=='PHASE_PROCESS_ABNORMAL_EXIT')throw Error('AUTONOMY_PHASE_EXIT_CORRECTION_NOT_INSTALLED');
const readiness=JSON.parse(await readFile(directory+'/execution-readiness-r22-4.json','utf8'));
if(readiness.release!==release||!readiness.allPhaseFixedChecksReady||readiness.completePhaseAcceptanceProducersReady!==false||readiness.goalSpecHash!==installed.goalSpecHash||readiness.policies.length!==9||readiness.central.templates.length!==27)throw Error('AUTONOMY_EXECUTION_READINESS_NOT_VERIFIED');
if(!installed.installed||installed.workspace!==config.workspace||!/^[a-f0-9]{64}$/.test(installed.goalSpecHash))throw Error('AUTONOMY_VALIDATORS_NOT_READY');
for(const pack of spec.workPackages){const policy=installed.policies.find(p=>p.workPackage===pack.id);if(!policy?.expectedChecks?.length)throw Error('AUTONOMY_STAGE_POLICY_MISSING');config.executors[pack.id]={...config.executors[pack.id],validator:'msf-autonomy-'+pack.id.toLowerCase()+'-validator',requiredCheckIds:policy.expectedChecks};}
const sha=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).filter(k=>x[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
if(sha(canonical(spec))!==installed.goalSpecHash)throw Error('AUTONOMY_SPEC_HASH_MISMATCH_BEFORE_FREEZE');
const identity=sha(JSON.stringify({spec,config}));
let journal;try{journal=JSON.parse(await readFile(journalPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;journal={version:1,identity,intents:{},receipts:{}};}
if(journal.identity!==identity)throw Error('AUTONOMY_BOOTSTRAP_FROZEN_INPUT_CHANGED');
async function save(){await mkdir(dirname(journalPath),{recursive:true});const path=journalPath+'.'+randomUUID()+'.tmp';await writeFile(path,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(path,journalPath);}
const result=await withPlatform(async({api})=>{
 const health=await api('/api/health');if(health.build!==release)throw Error('AUTONOMY_PLATFORM_RELEASE_MISMATCH');
 const liveConfig=(await api('/api/v1/execution/config')).data;
 if(liveConfig.revision!==readiness.central.revision||readiness.central.templates.some(t=>sha(canonical(liveConfig.templates.find(x=>x.id===t.id)))!==t.sha256))throw Error('AUTONOMY_EXECUTION_TEMPLATES_CHANGED_BEFORE_FREEZE');
 const capabilities=(await api('/api/v1/execution/capabilities')).data;
 const fixedTemplates=readiness.central.templates.map(t=>t.id);
 if(fixedTemplates.some(id=>!capabilities.configuredTemplates.some(t=>t.id===id&&t.ready)))throw Error('AUTONOMY_ALL_PHASE_EXECUTORS_NOT_READY');
 const supervision=(await api('/api/v1/execution/supervision')).data;if(supervision.supervised!==false)throw Error('AUTONOMY_UNRELATED_GLOBAL_POLICY_CHANGED');
 let project=(await api('/api/v1/projects/'+projectId)).data;
 if(project.ownerId!=='server-admin'||project.scope!=='personal'||['archived','delivered'].includes(project.status))throw Error('AUTONOMY_PROJECT_SCOPE_CHANGED');
 if(!execute)return {ready:true,execute:false,projectId,objectives:spec.objectives.length,packages:spec.workPackages.length,maxUSD:config.maxUSD,maxTokens:config.maxTokens};
 const goal='按《软件工厂无人值守交付总纲》R22及74项冻结目标：完善软件工厂本体、各阶段Agent/子Agent及自动流程；从客户原始需求，产出完整需求/设计/全部高保真与交互原型/真实代码，独立测试、记录修复与复验，打包安装、发布升级恢复和目标角色实际使用。逐阶段建立同版来源—产物—测试—发布关联及真实质量门；由贾维斯项目级无人值守监督、独立验收、费用只记录不设限和有界恢复，保存全过程并复用于其他项目。历史失败保留，模型自报完成不能作为验收。';
 if(!journal.receipts.goal){
  journal.intents.goal??={commandId:randomUUID(),expectedVersion:project.revision,scope:'personal',payload:{projectId,name:project.name,description:project.description,repo:project.repo,goal}};await save();
  journal.receipts.goal=(await api('/api/v1/projects/commands/update',journal.intents.goal)).data;await save();project=(await api('/api/v1/projects/'+projectId)).data;
 }
 if(!journal.receipts.configure){
  journal.intents.configure??={spec,config,expectedVersion:0,commandId:randomUUID()};await save();journal.receipts.configure=(await api('/api/v1/projects/'+projectId+'/autonomy',journal.intents.configure,'PUT')).data;await save();
 }
 let profile=(await api('/api/v1/projects/'+projectId+'/autonomy')).data;
 if(profile.goalSpecHash!==installed.goalSpecHash||sha(canonical(profile.config))!==sha(canonical(config))||readiness.central.templates.some(t=>profile.templateHashes[t.id]!==t.sha256))throw Error('AUTONOMY_CONFIG_READBACK_CHANGED');
 if(start&&!journal.receipts.start){
  journal.intents.start??={commandId:randomUUID(),expectedVersion:profile.revision,reason:'用户已授权按总纲启动本项目无人值守监督；先FA-01，真实验收后按依赖推进'};await save();journal.receipts.start=(await api('/api/v1/projects/'+projectId+'/autonomy/start',journal.intents.start)).data;await save();
 }
 profile=(await api('/api/v1/projects/'+projectId+'/autonomy')).data;
 if((await api('/api/v1/execution/supervision')).data.supervised!==false)throw Error('AUTONOMY_GLOBAL_POLICY_CHANGED');
 return {at:new Date().toISOString(),projectId,release,goalSpecHash:profile.goalSpecHash,status:profile.status,revision:profile.revision,reason:profile.reason,objectives:spec.objectives.length,stages:profile.stages,config:profile.config,budget:profile.budget,verifiedObjectiveIds:profile.verifiedObjectiveIds,events:profile.events,globalSupervision:false,previousTasksRevived:false};
});
await writeFile(directory+'/bootstrap-'+(start?'start':'configure')+'.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({projectId,execute,start,status:result.status,objectives:result.objectives,revision:result.revision,budget:result.budget}));
