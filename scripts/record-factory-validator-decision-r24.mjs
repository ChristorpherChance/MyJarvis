/** Record the chosen bounded adapter repair and its exact implementation proof. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4',dir='artifacts/software-factory/acceptance-r24';
const proofPath=process.argv.find(v=>v.startsWith('--proof='))?.slice(8);
if(!proofPath||!/^artifacts\/software-factory\/acceptance-r24\/validator-copy-permissions-installed-[0-9a-f-]{36}\.json$/.test(proofPath))throw Error('VALIDATOR_DECISION_PROOF_REQUIRED');
const proof=JSON.parse(await readFile(proofPath,'utf8'));
if(!proof.installed||!proof.originalSourcesUnchanged||!proof.oldBytesPreserved||proof.templatePolicyChanged||proof.containerCapabilitiesChanged||proof.modelCalls!==0||proof.productAccepted)throw Error('VALIDATOR_DECISION_PROOF_INVALID');
const sourcePaths=[dir+'/candidate-terminal-diagnostic.json',dir+'/candidate-collector-cause-independent-review.json',proofPath];
const refs=await Promise.all(sourcePaths.map(async(reference,i)=>({reference,kind:i===1?'source':'test-report',sha256:createHash('sha256').update(await readFile(reference)).digest('hex')})));
const journalPath='.jarvis-dev/maintenance/factory-validator-decision-r24.json';let j;
try{j=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={};}
const save=async()=>{await mkdir('.jarvis-dev/maintenance',{recursive:true});const tmp=journalPath+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(tmp,journalPath);};
const result=await withPlatform(async({api})=>{
 const p=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(p.revision!==20||p.spec.objectives.length!==74||p.config.costPolicy!=='record-only')throw Error('VALIDATOR_DECISION_FROZEN_SCOPE_CHANGED');
 const objectives=p.spec.workPackages.find(x=>x.id==='FA-01').objectiveIds;
 const option=(id,title,advantages,disadvantages,impact,compliesWithGoals)=>({id,title,advantages,disadvantages,impact,compliesWithGoals,withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'reversible',coveredObjectives:objectives,operationalImpact:1});
 j.intent??={commandId:randomUUID(),expectedVersion:0,changeOf:null,questionSummary:'固定候选验收在执行产品检查前失败，如何修复可信隔离器而保持验收权限边界？',context:{observedAt:new Date().toISOString(),goalSpecHash:p.goalSpecHash,sourceFingerprint:proof.sourceFingerprintsBefore[p.config.workspace],sourceVersion:'R22独立候选；首轮隔离器未执行构建/测试，主线身份单独保留',runId:'1270b64e58032d91585307d19d4a9be04f204eab',taskId:'c1aa17fb-89f1-4c99-bd59-378d24fcde4f',machineId:p.config.machineId,objectives,constraints:['不重试或重置旧终态任务、旧profile和历史回执','不改原始main/候选源码、业务服务和生产数据','保持候选非root、容器caps与证据root私有；费用只记录不限额'],situation:'实际失败回执显示collector执行2ms且产品checks为空。root collector无DAC能力，临时work原为1000:1000/0700，精确源码静审和实际Linux权限proof支持隔离器访问布局问题；原始errno缺失不能冒称已捕获。'},options:[option('copy-permissions','只修临时副本权限与精确manifest写入',['可信root可读取候选，候选仍非root','证据私有及原始源码不变','旧适配器版本、root备份和Linux实际proof均可追溯'],['需要两个固定适配器协调升级并重新登记新验收批次'],'临时副本由UID1000持有，GID0仅可读；预建精确root manifest以nofollow同FD写入。已批准包内部依赖链接不跟随且重验边界。','yes'),option('broad-dac','给可信容器增加通用DAC绕过能力',['可越过当前读取限制'],['扩大通用文件访问权限','不约束生成manifest路径'],'增加通用容器文件访问能力，非解决本次问题所需。','no')],chosenId:'copy-permissions',decisionRationale:'真实签名失败与可信固定源码静审将问题定位到验收适配器，未建立产品编译失败。实际无DAC Linux proof先验证最小副本权限和证据隔离，再版本化安装两固定文件并CAS保留旧SHA，原源指纹相同。按最小影响的可逆方案继续新验收，不清除失败。',basisRefs:refs,risk:'low',affectedObjectives:objectives,rollbackPlan:{plan:`101节点及中央队列空闲、已无子进程时，从root私有备份${proof.rootBackupId}按两旧SHA恢复固定coordinator/collector；CAS核对当前新SHA，禁止覆写后来版本。`,triggers:['新适配器发生权限越界','新固定检查不能执行或导致原源变化','证据隔离或链接保护回归'],impact:'只恢复两固定适配器；历史批次与真实结果保留。恢复原布局可能再导致隔离器失败，不能当产品达标。',requiresNewExecutionPlan:true},actions:[],status:'selected',origin:'ai'};await save();
 if(!j.receipt){j.receipt=(await api(`/api/v1/projects/${projectId}/decisions`,j.intent)).data;await save();}
 j.implementation??={commandId:randomUUID(),expectedVersion:j.receipt.revision,origin:'ai',reason:'真实Linux权限proof通过后已CAS安装两个固定适配器，保存旧版本及原源前后指纹；这是验收环境修复，不是软件工厂业务验收。',actions:[{summary:`已安装两固定文件，root备份${proof.rootBackupId}；实际UID/capability权限probe执行，原main/候选源指纹相同，容器权限、模板和业务服务不变。`,at:new Date(proof.at).toISOString(),state:'performed',evidenceRefs:refs},{summary:'登记全新fixed-only批次并读取签名实执行检查；保留第一轮失败，产品构建与测试结果以新回执为准。',at:new Date().toISOString(),state:'planned',evidenceRefs:refs}]};await save();
 if(!j.implemented){j.implemented=(await api(`/api/v1/projects/${projectId}/decisions/${j.receipt.id}/implementation`,j.implementation)).data;await save();}
 const value=(await api(`/api/v1/projects/${projectId}/decisions/${j.receipt.id}`)).data;
 if(value.status!=='implemented'||value.revisions.length!==2)throw Error('VALIDATOR_DECISION_READBACK_FAILED');
 return {at:new Date().toISOString(),projectId,decision:{id:value.id,revision:value.revision,status:value.status,historyVersions:value.revisions.length,hash:value.hash},proofPath,rootBackupId:proof.rootBackupId,modelsInvoked:false,productAccepted:false};
});
await writeFile(dir+'/validator-decision-live.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
