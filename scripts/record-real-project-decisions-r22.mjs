/** Record actual R22 choices and their separate implementation receipts. No server action is executed here. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4',release='20261011-project-autonomy-r22-5';
const dir='artifacts/software-factory/autonomy-r22';
const journalPath='.jarvis-dev/maintenance/project-decisions-r22.json';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const refs=async(paths,kind='observation')=>Promise.all(paths.map(async reference=>({reference,sha256:createHash('sha256').update(await readFile(reference)).digest('hex'),kind})));
const [failed,reconciled,ready,start,observation]=await Promise.all([read(`${dir}/fixed-validator-executors.json`),read(`${dir}/fixed-validator-executors-reconciliation.json`),read(`${dir}/execution-readiness-r22-4.json`),read(`${dir}/bootstrap-start.json`),read(`${dir}/observation-first-dispatch.json`)]);
if(failed.failureCode!=='FIXED_CONFIG_CHANGED_ON_START'||reconciled.status!=='verified'||!ready.allPhaseFixedChecksReady||start.config.costPolicy!=='record-only')throw Error('DECISION_FACTS_NOT_VERIFIED');
const generalRefs=await refs([`${dir}/bootstrap-start.json`,`${dir}/observation-first-dispatch.json`]);
const context=(at,situation,objectives)=>({observedAt:at,goalSpecHash:start.goalSpecHash,sourceFingerprint:null,sourceVersion:'贾维斯R22-3→R22-4 / 软件工厂来源266104923b7f49b259dc8a7b827d599c5220ad16',runId:null,taskId:null,machineId:start.config.machineId,objectives,constraints:['用户已授权本项目无人值守监督；保留原业务和独立工作副本边界','用户决定费用只记录，不设消费上限','已有失败和证据必须保留，不冒写产品完成'],situation});
const option=(id,title,advantages,disadvantages,impact,objectives,operationalImpact,compliesWithGoals='yes')=>({id,title,advantages,disadvantages,impact,compliesWithGoals,withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'bounded',coveredObjectives:objectives,operationalImpact});
const targets=['MSF-OBJ-053','MSF-OBJ-074'];
const incidentRefs=await refs([`${dir}/fixed-validator-executors.json`,`${dir}/fixed-validator-normalization-diagnosis.json`,`${dir}/fixed-validator-executors-reconciliation.json`]);
const narrowRefs=await refs([`${dir}/runtime-verification-r22-4.json`,`${dir}/execution-readiness-r22-4.json`]);
const costRefs=await refs([`${dir}/record-only-live-verification.json`,`${dir}/bootstrap-start.json`]);
const choices=[{
 key:'serialization-reconciliation',origin:'ai',questionSummary:'节点配置只是JSON格式变化，如何恢复九个固定验证执行器接入？',
 context:context(failed.at??reconciled.at,'回顾登记已发生的处理：安装器报告启动后配置变化，中央撤回九模板；只读逐字段诊断证实原始格式改变而全部JSON语义及27模板一致。选择发生在本台账创建前，失败报告保留。',targets),
 options:[option('central-only','只重接中央九个固定模板',['语义及模板证据完整','不改配对身份和节点私有配置'],['依赖当前节点配置仍与已核对版本一致'],'中央单独对账恢复；节点继续运行。',targets,0),option('reinstall-node','再次安装并重启节点',['可重新走安装流程'],['增加不必要配置写入和重启','不能修正原始字节与语义指纹混淆的根因'],'再写入现有节点配置并重启；影响范围更大。',targets,2)],chosenId:'central-only',decisionRationale:'已有只读逐字段核验足以确认权限未变；中央单独恢复能完成目标，影响最小，保留原失败及原节点身份。',basisRefs:incidentRefs,risk:'low',affectedObjectives:targets,
 rollbackPlan:{plan:'先暂停该项目并对账活动任务；如需撤销，只调整本次中央九个模板，保留旧18模板、节点配对及原始证据。已有冻结计划须另建受控变更后执行。',triggers:['中央与节点模板指纹出现真实字段差异','固定模板权限超出已授权范围'],impact:'可能暂时暂停阶段固定复验；不回写已产生的历史回执。',requiresNewExecutionPlan:true},
 implementation:{summary:'中央单独重接九个固定模板并读回；未改节点配置或重启进程。',at:reconciled.at,evidenceRefs:[incidentRefs[2]]}
 },{
 key:'exact-authorized-root',origin:'ai',questionSummary:'已准确授权的独立工作副本等于执行器根目录，首次配置被拒绝时如何修复？',
 context:context(start.at,'回顾登记：第一次配置因根目录相等被409拒绝，尚未创建新模型任务。需要在中央和节点修复目录联调，同时保留普通执行器目录限制。',targets),
 options:[option('narrow-exception','仅受保护自治任务允许准确根目录',['符合冻结模板和当前任务授权','保留全局严格子目录规则'],['中央、租约及节点需要同时核对'],'修改特定自治范围检查，并针对普通及伪造模板运行负例。',targets,1),option('global-equality','所有执行器统一允许根目录相等',['修改点较少'],['扩大普通执行器能力','不符合此次限定项目范围'],'全局路径函数会改变所有执行器的目录边界。',targets,2,'no')],chosenId:'narrow-exception',decisionRationale:'准确授权工作副本应能执行，但不能借此扩大全平台权限。例外必须同时匹配受保护模板、当前项目任务及节点冻结指纹。',basisRefs:[...narrowRefs,...generalRefs],risk:'medium',affectedObjectives:targets,
 rollbackPlan:{plan:'先暂停项目、停止并核对活动租约，保留检查点及签名证据；恢复R22-3中央和节点包前确认队列清空。恢复旧包会再次阻止准确根目录任务，需新计划重新配置。',triggers:['普通或错误模板取得根目录例外','当前项目授权丢失后任务仍继续','发现路径逃逸或指纹核对失效'],impact:'本项目开发暂停；原业务与历史产物保留。',requiresNewExecutionPlan:true},
 implementation:{summary:'已发布R22-4中央与101节点；69项相关检查通过，27模板核对就绪，首次FA01实际运行。',at:observation.at,evidenceRefs:[...narrowRefs,...generalRefs]}
 },{
 key:'record-only-policy',origin:'human',questionSummary:'用户明确费用只记录不设限制后，怎样处理旧费用上限？',
 context:context(start.at,'用户明确替代旧单轮1美元及累计消费边界；执行器和自治计划采用只记账，技术上下文与失败保护继续保留。此处记录用户决定及实际实施，不能用外层配置证明工厂内部用量目标已验收。',['MSF-OBJ-025','MSF-OBJ-053','MSF-OBJ-074']),
 options:[option('record-only','按用户要求只记账',['不中断已授权工作','保留已知金额、未知部分及Token归属'],['费用由真实供应商账单决定'],'移除金额及累计Token消费上限，保留每轮技术上下文、超时和故障保护。',['MSF-OBJ-025','MSF-OBJ-053','MSF-OBJ-074'],1),option('retain-old-budget','继续保留旧消费上限',['限制消费量'],['与用户最新明确决定冲突'],'旧额度将阻断已授权持续开发。',['MSF-OBJ-025','MSF-OBJ-053','MSF-OBJ-074'],1,'no')],chosenId:'record-only',decisionRationale:'以用户最新明确指示为依据，费用和累计Token不再作停止条件；没有可靠回执的金额不补零。',basisRefs:costRefs,risk:'medium',affectedObjectives:['MSF-OBJ-025','MSF-OBJ-053','MSF-OBJ-074'],
 rollbackPlan:{plan:'如用户未来改费用策略，先暂停及核对活动任务，从新决定创建新版本并重新冻结执行计划；保留此前账目，不覆盖或清零费用。',triggers:['用户明确修改消费策略'],impact:'新策略影响后续派发；既有用量记录和旧决定保留。',requiresNewExecutionPlan:true},
 implementation:{summary:'18个开发/评审模板已无美元限制；自治计划record-only及各消费上限null读回通过。',at:start.at,evidenceRefs:costRefs}
 }];
let journal;try{journal=await read(journalPath);}catch(e){if(e.code!=='ENOENT')throw e;journal={version:1,projectId,records:{}};}
if(journal.projectId!==projectId)throw Error('DECISION_JOURNAL_PROJECT_MISMATCH');
const save=async()=>{await mkdir(dirname(journalPath),{recursive:true});const tmp=journalPath+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(tmp,journalPath);};
if(!process.argv.includes('--execute')){console.log(JSON.stringify({execute:false,projectId,actualDecisions:choices.length,serverOperations:0}));process.exit(0);}
const result=await withPlatform(async({api})=>{
 const health=await api('/api/health');if(health.build!==release)throw Error('DECISION_RELEASE_NOT_LIVE');
 for(const choice of choices){
  const entry=journal.records[choice.key]??={};const {key:_,implementation,...body}=choice;
  if(!entry.record){entry.record={...body,status:'selected',actions:[],expectedVersion:0,commandId:randomUUID()};await save();}
  if(!entry.recordReceipt){entry.recordReceipt=(await api(`/api/v1/projects/${projectId}/decisions`,entry.record)).data;await save();}
  if(!entry.implementation){entry.implementation={commandId:randomUUID(),expectedVersion:entry.recordReceipt.revision,origin:choice.origin,reason:'依据已发生的独立公开回执登记实施，与选择版本分开保留。',actions:[{...implementation,state:'performed'}]};await save();}
  if(!entry.implementationReceipt){entry.implementationReceipt=(await api(`/api/v1/projects/${projectId}/decisions/${entry.recordReceipt.id}/implementation`,entry.implementation)).data;await save();}
  const live=(await api(`/api/v1/projects/${projectId}/decisions/${entry.recordReceipt.id}`)).data;
  if(live.projectId!==projectId||live.status!=='implemented'||live.chosenId!==choice.chosenId||live.revisions.length!==2||live.independentAcceptance!==false)throw Error('DECISION_HISTORY_READBACK_MISMATCH');
 }
 const list=(await api(`/api/v1/projects/${projectId}/decisions?offset=0&limit=10`)).data;
 return {at:new Date().toISOString(),release,projectId,actualDecisions:choices.length,historyReadback:true,records:choices.map(choice=>{const e=journal.records[choice.key];return {key:choice.key,id:e.recordReceipt.id,origin:choice.origin,chosenId:choice.chosenId,status:e.implementationReceipt.status,revision:e.implementationReceipt.revision,hash:e.implementationReceipt.hash,previousHash:e.implementationReceipt.previousHash};}),listedCount:list.total,serverOperations:0,modelCalls:0,productAccepted:false,cliAutomaticCapture:false,actualServerRollback:false};
});
await writeFile(`${dir}/decision-live-records.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
