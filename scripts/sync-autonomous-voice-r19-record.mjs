/** Append the verified R19 facts to both projects, without dispatch or acceptance changes. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const execute=process.argv.includes('--execute');
const resourceAddendum=process.argv.includes('--resource-addendum');
const folder='artifacts/unattended-r19',output=folder+(resourceAddendum?'/project-resource-record-sync.json':'/project-record-sync.json');
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const route=await load('artifacts/model-routing-101-r19/verification.json');
const deployment=await load(folder+'/release-verification.json');
const node=await load(folder+'/node-upgrade.json');
const voice=await load('artifacts/voice-latency-r19/after-comparison.json');
const quota=await load('artifacts/voice-latency-r19/quota-adjustment.json');
if(!route.passed||!deployment.passed||!node.result?.deployed||!voice.verified||!quota.result?.deployed||quota.result?.effectiveAfter?.cpuTimeCores!==4)throw Error('R19_EVIDENCE_REQUIRED');
const asr=resourceAddendum?await load('artifacts/voice-latency-r19/asr-after-quota.json'):null;
if(resourceAddendum&&(!asr.productionScopeVerified||asr.gatewayModelRequests!==0||asr.samples?.length!==2))throw Error('R19_ASR_SCOPE_REQUIRED');
const marker=resourceAddendum?'[R19 语音资源复核]':'[全天研发与快速语音 R19]';
const notes=resourceAddendum?[marker,
 '112 voice主unit单行CPUQuota250→400%，实际cpu.max400000/100000、threads4、engine ready，dropin/权重/auto/beam/成员偏好保留；是共享CPU时间额度，不是独占四核。',
 '纯ASR对照新增本地TTS/ASR各两次，0网关模型：中文inference3326→3120ms（快6.19%），英文4552→4457ms（快2.09%）。中文归一化15字有1字偏差，英文33字一致；productionScopeVerified=true、lexicalFixtureScopeVerified=false，不宣称识别全准或全面提速。',
 '原基线中文已预热，资源后测是服务首轮；节流差值含夹具TTS，不能单因果推断。ASR仍是主要瓶颈，下一步手机分段计时、流式识别/高算力节点及误字核对；不是手机现场验收。',
 '依据 artifacts/voice-latency-r19/quota-adjustment.json、quota-adjustment-independent-review.json、asr-after-quota.json 与 docs/全天持续研发与快速语音实施方案.md/html。仅追加资料，不更改任何产品验收或里程碑。'].join('\n'):[marker,
 `正式发布 ${deployment.release}，主112/冷备101构建核对通过；已配对101节点升级可靠回传，身份、凭据、模板语义保持。`,
 `101外层最高模型 gpt-6.1-sol[1m]，中央/本机模板和默认Opus/Fable一致；真实回执2322Tokens、0.01217USD目录估算。Sonnet/Haiku保留；工厂内部Pi实际provider未知，后备未验证。`,
 '日志/最终回执私有SQLite先落盘，稳定递送身份、正文指纹、重复确认、跨业务/确认DB对账及稳定原始计量身份；取消后旧回执不能复活。停止码与整轮检查点留证，节点重启只补证据不自动重跑原生CLI。',
 '本轮局部故障检查与实际发布范围见 artifacts/unattended-r19/release-verification.json、independent-review.json；中央日志仍每run滚动保留5000条，不等同永久全历史档案。',
 '语音普通多语稳定知识首句提前播音、短首句及后句预制；输入自动、个人固定输出、人声选择、打断和工具真实性门禁保留。112 worker线程2→4、同权重beam5；首测英语首答音频2.876→1.751秒，但中文1.844→2.203秒变慢，不声称全面提速。发现CPU仅250%限额后单行改为400%CPU时间上限，真实cgroup/引擎就绪通过；不是独占4核，也不代表手机真人验收。完整ASR与限制见本轮方案和独立报告。',
 '待办：原生中断会话/预算/产物对账与续做实测；真实后备额度切换；工厂真实性门禁修复；当前固定基线验收；项目自动编排/停滞检测；24/72小时连续观察。当前产品NO-GO，全局持续监督保持关闭，不派发新的源码任务，不更改验收与里程碑。',
 '实施方案 D:/AI/workspaces/MyJevis/docs/全天持续研发与快速语音实施方案.md/html；本轮结果与失败记录均追加到建设日志，不覆盖旧证据。'].join('\n');
let journal;try{journal=await load(output);}catch(e){if(e.code!=='ENOENT')throw e;journal={formatVersion:1,release:deployment.release,intents:{},receipts:{}};}
const projectIds=['70ec346f-6520-46ed-abed-22cac770a3e4','25dcc5cf-bdfe-43f8-bbff-e79e7190161f'];
if(journal.release!==deployment.release)throw Error('R19_SYNC_SCOPE_CHANGED');
await mkdir(folder,{recursive:true});
async function save(){const temp=output+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(temp,output);}
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const result=await withPlatform(async({api})=>{
 if((await api('/api/v1/execution/supervision')).data.supervised!==false)throw Error('R19_GLOBAL_POLICY_CHANGED');
 const projects=await Promise.all(projectIds.map(async id=>(await api('/api/v1/projects/'+id)).data));
 if(projects.some(p=>p.ownerId!=='server-admin'||p.scope!=='personal'||p.status==='archived'))throw Error('R19_PROJECT_SCOPE_CHANGED');
 const before=Object.fromEntries(projects.map(p=>[p.id,{status:p.status,milestonesHash:digest(p.milestones??[])}]));
 if(!execute)return {ready:true,projectIds,appendOnlyNotes:true,dispatch:false,acceptanceChanged:false};
 for(const p of projects){
  if(journal.receipts[p.id])continue;
  const old=p.environmentInfo?.notes??'';
  if(old.includes(marker)){if(!old.endsWith(notes))throw Error('R19_EXISTING_NOTES_DIFFER');journal.receipts[p.id]={id:p.id,revision:p.revision,reused:true};await save();continue;}
  if(old.length+notes.length+2>20000)throw Error('R19_PROJECT_NOTES_LIMIT');
  if(!journal.intents[p.id]){journal.intents[p.id]={commandId:randomUUID(),scope:'personal',expectedVersion:p.revision,payload:{projectId:p.id,environmentInfo:{...p.environmentInfo,notes:old+'\n\n'+notes}}};await save();}
  const r=await api('/api/v1/projects/commands/environment-info',journal.intents[p.id]);
  journal.receipts[p.id]={id:r.data.id,revision:r.data.revision,at:new Date().toISOString()};await save();
 }
 for(const id of projectIds){const p=(await api('/api/v1/projects/'+id)).data;if(!p.environmentInfo?.notes.endsWith(notes)||digest(p.milestones??[])!==before[id].milestonesHash||p.status!==before[id].status)throw Error('R19_SYNC_FINAL_STATE_CHANGED');}
 return {verified:true,projectIds,appendOnlyNotes:true,dispatch:false,acceptanceChanged:false,milestonesChanged:false,modelCalls:0,globalSupervision:false};
});
if(execute){journal.completedAt=new Date().toISOString();journal.result={...result,maintenanceLoginRevoked:true};await save();}
console.log(JSON.stringify(result));
