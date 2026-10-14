/** Record actual isolated checks in the registered project, without accepting a delivery. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {withPlatform} from './managed-server-client.mjs';
const argument=process.argv.find(a=>a.startsWith('--report='))?.slice(9);
if(!argument)throw Error('EXPLICIT_BASELINE_REPORT_REQUIRED');
const base=resolve('artifacts/software-factory/node'),path=resolve(argument),rel=relative(base,path);
if(rel.startsWith('..')||!/^baseline-(?:[0-9a-f]{40}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/.test(rel))throw Error('BASELINE_REPORT_SCOPE_INVALID');
const evidence=JSON.parse(await readFile(path,'utf8')),r=evidence.report;
if(!r?.ok||r.fullDeliveryAcceptance!==false||r.integrationTests!=='not-run'||r.privateEnvCopied!==false||r.copy?.sourceStateChanged!==false||r.tests?.total!==15||r.tests?.passed!==15||r.tests?.failed!==0||r.tests?.pending!==0||!r.filesystemIsolation||!/^[0-9a-f]{64}$/.test(r.sourceFingerprint))throw Error('ISOLATED_BASELINE_EVIDENCE_REQUIRED');
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4';
const notes=[
 `已核验 ${r.finishedAt}。源版本 ${r.copy.gitAfter.head}（${r.copy.gitAfter.branch}），源快照 SHA256 ${r.sourceFingerprint}；${r.copy.files} 文件均留有校验清单。`,
 '离线依赖、独立副本构建、类型检查及 15 项基础单测全部通过；验证程序隔离文件与网络，不接触原项目私有配置，不改变原工作副本。',
 '完整集成测试尚未进行，此基线不是项目交付验收。工厂内部开发/质量/自测的部分状态为模拟结果，不能作为源码交付证据。',
 '101 已接入 Claude Code 专用开发节点；Codex 尚未安装。真实任务由贾维斯监督、独立验证，预算/Token/轮次/重试有明确边界。'
].join('\n');
const info={environment:'101 · Ubuntu · Claude Code 2.1.296 · pnpm 10.6.1',runCommand:'pnpm dev',verifyCommand:'贾维斯固定隔离验证：离线安装 → 构建 → 类型检查 → 15 项基础单测；完整集成测试另行安排',notes};
if(!process.argv.includes('--execute')){console.log(JSON.stringify({prepared:true,projectId,checks:r.tests,fullDeliveryAcceptance:false}));process.exit();}
await withPlatform(async({api,command})=>{
 const before=(await api('/api/v1/projects/'+projectId)).data;
 if(!before.copies?.some(c=>c.path===r.source&&c.machineId==='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73'))throw Error('BASELINE_PROJECT_BINDING_MISMATCH');
 const project=await command('projects','environment-info',{projectId,environmentInfo:info},before.revision);
 const report={projectId,revision:project.revision,sourceVersion:r.copy.gitAfter.head,sourceFingerprint:r.sourceFingerprint,baselineRunId:r.runId,checks:r.tests,fullDeliveryAcceptance:false,recordedAt:new Date().toISOString()};
 await writeFile('artifacts/software-factory/recorded-baseline.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
});
