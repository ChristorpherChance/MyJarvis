/** Register construction records and first-project guidance through existing versioned APIs. No execution. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';

const execute=process.argv.includes('--execute'),sourceId='70ec346f-6520-46ed-abed-22cac770a3e4';
const output=resolve('artifacts/construction-history/platform-sync.json');
for(const file of ['docs/贾维斯建设档案.md','docs/贾维斯建设日志.md','docs/软件工厂首项目交付计划.md'])await readFile(file,'utf8');
let journal;try{journal=JSON.parse(await readFile(output,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;journal={formatVersion:1,intents:{},receipts:{},sourceProjectId:sourceId};}
if(journal.formatVersion!==1||journal.sourceProjectId!==sourceId||!journal.intents||!journal.receipts)throw Error('INVALID_GOVERNANCE_JOURNAL');
async function save(){await mkdir(dirname(output),{recursive:true});const temp=output+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(temp,output);}

await withPlatform(async({api,records})=>{
 const projects=await records('projects'),source=(await api('/api/v1/projects/'+sourceId)).data;
 const matches=projects.filter(p=>p.name==='贾维斯建设'&&p.ownerId==='server-admin'&&p.scope==='personal'&&p.status!=='archived');
 if(matches.length>1)throw Error('CONSTRUCTION_PROJECT_NOT_UNIQUE');
 const definition={name:'贾维斯建设',description:'持续建设记录、真实验证边界和经验沉淀。详细档案保存在仓库，平台记录摘要与修订；不是整个平台已完成交付。',goal:'持续完善家庭语音管家、机器与项目监管、知识记忆和AI开发监督；每轮留下用户目标、改动、原因、版本与验证证据。先完成软件工厂真实项目交付闭环，再逐项验证房间使用、主备恢复及经验复用。记录机制建立不等于所有长期目标已实现。',milestones:['建设档案与事实基线','软件工厂首个真实交付闭环','语音与公共房间现场验收','主备恢复与经验技能复用'],copies:[]};
 const sourceGuidance=['[首项目治理记录 2026-10-10]','推荐最终目标以软件工厂现有PRD为准：资料→需求→设计→真实开发→独立测试→交付决定；本期不含生产自动发布。','推荐顺序：冻结基线/需求追踪 → 证据真实性门禁 → 真实执行和构建 → 隔离全量测试 → 真实示范项目贯通 → 交付包和恢复验证。','当前源码静态审阅发现开发/质量/自测/自动用例含模拟结果，正常放行可能缺充分模拟检查；尚未在隔离数据库复现，不能称线上已发生。先做FM-001交付基线与真实性审计，再安排有验收标准的源码任务。','当前三个里程碑保持原样，用细任务映射阶段；不按Token、模型自述或模拟100%计算产品进度。七个PRD关键放行点保留人工决定。','完整计划：D:/AI/workspaces/MyJevis/docs/软件工厂首项目交付计划.md（及同名HTML）。事实评估：artifacts/software-factory/first-project-assessment.json。','建议是待实施路线，不代表已签收具体范围、已启动开发或已完成交付。全局持续监督仍关闭，本次只登记资料和经验候选。'].join('\n');
 const oldNotes=source.environmentInfo?.notes??'',marker='[首项目治理记录 2026-10-10]';
 if(oldNotes.includes(marker)&&!oldNotes.endsWith(sourceGuidance))throw Error('EXISTING_GUIDANCE_REQUIRES_REVIEW');
 const sourceInfo={...source.environmentInfo,notes:oldNotes.includes(marker)?oldNotes:oldNotes+'\n\n'+sourceGuidance};
 if(sourceInfo.notes.length>20000)throw Error('PROJECT_NOTES_LIMIT');
 const plan={execute,sourceProjectId:sourceId,existingConstructionProjectId:matches[0]?.id??null,operations:['register construction project if absent','record construction archive index','append source project delivery guidance while preserving baseline','capture two runbook candidates','record archive mechanism milestone with actual evidence'],tasksCreated:false,modelsInvoked:false,supervisionChanged:false,sourceCodeChanged:false};
 if(!execute){console.log(JSON.stringify(plan));return;}

 async function submit(key,domain,name,payload,revision){
  const done=journal.receipts[key];if(done)return (await api('/api/v1/'+domain+'/'+done.id)).data;
  let intent=journal.intents[key];
  if(intent){if(intent.domain!==domain||intent.command!==name||JSON.stringify(intent.envelope.payload)!==JSON.stringify(payload))throw Error('GOVERNANCE_INTENT_CONFLICT');}
  else{intent={domain,command:name,envelope:{commandId:randomUUID(),scope:'personal',expectedVersion:revision,payload}};journal.intents[key]=intent;await save();}
  const result=await api('/api/v1/'+domain+'/commands/'+name,intent.envelope);
  const item=result.data;journal.receipts[key]={id:item.id,revision:item.revision,status:item.status??null,at:new Date().toISOString(),commandId:intent.envelope.commandId,eventTypes:(result.events??[]).map(e=>e.type)};await save();return item;
 }

 let construction=matches[0]??await submit('construction-register','projects','register',definition,0);
 journal.constructionProjectId=construction.id;await save();
 const constructionInfo={environment:'112正式平台 / 101冷备与独立软件工厂开发节点 / 联想本地开发',runCommand:'建设资料登记；本轮不派发开发任务',verifyCommand:'node --test scripts/test-construction-records.mjs；node scripts/construction-records.mjs --render',notes:['建设档案：D:/AI/workspaces/MyJevis/docs/贾维斯建设档案.md（及同名HTML）。','生成日志：docs/贾维斯建设日志.md/html；原始账本docs/建设记录/events.jsonl。','历史过程依据公开资料回顾，日期、模拟状态和未验收范围明确；新事件追加保存，失败及更正不覆盖旧记录。','每轮记录需求/原因/改动/证据/版本/用量引用/待办，禁止凭据和聊天正文入档。AGENTS.md与CLAUDE.md约定持续维护。','首项目路线：软件工厂首项目交付计划；项目'+sourceId+'。当前基础15测试和单轮接管已通过；真实产品闭环/集成测试/交付尚待验证。','目录指纹支持当时证据核对，经验先候选后复验及发布；不会自动汇总全部外部开发日志或自动发布Skill。'].join('\n')};
 construction=await submit('construction-info','projects','environment-info',{projectId:construction.id,environmentInfo:constructionInfo},construction.revision);
 const sourceUpdated=await submit('factory-guidance','projects','environment-info',{projectId:sourceId,environmentInfo:sourceInfo},source.revision);
 const existingExperiences=await records('experiences');
 const candidates=[
  {key:'construction-runbook',projectId:construction.id,title:'贾维斯建设记录与证据维护规范',summary:'每轮保留改动、理由、四种事实状态及待办；历史不覆盖，经验先候选。',conditions:'本仓库有意义的实现、验证、发布或故障处理；简短问答及无变化轮询无需重复。',content:['规范来源：用户2026-10-10明确要求逐步搭建过程持续记录。','阅读建设档案与最新日志→核对实时状态→执行授权工作→保存公开证据→追加事件→生成同源MD/HTML→更新平台摘要。','实现、验证、上线和现场/产品验收分别记录。没有回执不补造消耗或完成百分比；模拟结果不作真实进度。','旧记录不覆盖，修正用新事件关联旧编号；不写密钥、密码、Cookie、私有配置、原始聊天和私人录音。','事实、证据、经验分层；适用条件和复验依据完整后才能验证并发布Skill。当前这是候选操作手册，尚未证明跨终端自动归集。','完整资料：docs/贾维斯建设档案.md、docs/贾维斯建设日志.md、AGENTS.md、CLAUDE.md。'].join('\n'),source:'用户本轮记录要求；docs/贾维斯建设档案.md；scripts/test-construction-records.mjs'},
  {key:'factory-runbook',projectId:sourceId,title:'首项目监督与真实交付门禁',summary:'范围/基线→真实证据→执行→独立验证→交付；源码监督与内部模拟业务状态分别管理。',conditions:'首次监督软件工厂源码项目；现有PRD、基线与独立节点均可核对；具体任务范围和预算另行明确。',content:['产品目标遵循软件工厂现有PRD，本期到测试及人工交付决定，不扩大到生产自动发布。','先FM-001真实性审计：需求—源码—测试—证据矩阵、隔离模拟/缺证据反例、优先级与任务包。静态风险不能伪称已线上复现。','后续按证据门禁→真实Pi执行/CI/构建→隔离全量验证→真实示范贯通→交付包及恢复。','既有三个里程碑映射细阶段，单前置依赖串行；只依据当前候选真实且已验收条款计算进度。','监督只推进明确授权任务，保留真实日志、候选版本和实际Token。额度/网络按有限策略处理，登录/权限/未知错误等待处理，不盲目重启。','关键七个人工放行点、独立验证及交付证据遵循PRD。Jarvis package只形成台账，不自动构造实际文件包。','本条为推荐路线候选，未自动派发、未验收完整产品，也未发布通用Skill。详细资料docs/软件工厂首项目交付计划.md及artifacts/software-factory/first-project-assessment.json。'].join('\n'),source:'软件工厂现有PRD；只读源码评估artifacts/software-factory/first-project-assessment.json；docs/软件工厂首项目交付计划.md'}
 ];
 const experienceIds=[];
 for(const candidate of candidates){
  const found=existingExperiences.filter(e=>e.title===candidate.title&&e.projectId===candidate.projectId&&e.ownerId==='server-admin');if(found.length>1)throw Error('RUNBOOK_CANDIDATE_NOT_UNIQUE');
  const {key,...body}=candidate;const item=found[0]??await submit(key,'experiences','capture',{...body,kind:'runbook',tags:['建设记录','项目监督','真实证据']},0);
  if(item.status==='published'||item.verified===true)throw Error('RUNBOOK_EXPECTED_CANDIDATE');experienceIds.push(item.id);
 }
 construction=(await api('/api/v1/projects/'+construction.id)).data;
 if(!construction.milestones[0]?.completed)construction=await submit('archive-milestone','projects','milestone',{projectId:construction.id,milestoneId:0,completed:true,evidence:'本轮已建立建设档案、追加账本及MD/HTML索引；历史回顾来自公开证据，记录工具5项专项验证通过。证据：scripts/test-construction-records.mjs、docs/贾维斯建设档案.md、docs/建设记录/events.jsonl。仅代表档案机制建立，软件工厂闭环及家庭现场验收未完成。'},construction.revision);
 const caps=(await api('/api/v1/execution/capabilities')).data;
 if(caps.supervised!==false)throw Error('SUPERVISION_CHANGED_DURING_RECORDING');
 journal.completed=true;journal.completedAt=new Date().toISOString();journal.result={...plan,constructionProjectId:construction.id,constructionRevision:construction.revision,sourceRevision:sourceUpdated.revision,experienceIds,candidatesPublished:false,supervised:false};await save();console.log(JSON.stringify(journal.result));
});
