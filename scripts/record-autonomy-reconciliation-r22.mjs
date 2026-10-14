/** Append the actual failure and reconciliation; historical reports stay unchanged. */
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const dir='artifacts/software-factory/autonomy-r22';
const failed=JSON.parse(await readFile(dir+'/fixed-validator-executors.json','utf8'));
const diagnosis=JSON.parse(await readFile(dir+'/fixed-validator-normalization-diagnosis.json','utf8'));
const reconciliation=JSON.parse(await readFile(dir+'/fixed-validator-executors-reconciliation.json','utf8'));
if(failed.failureCode!=='FIXED_CONFIG_CHANGED_ON_START'||reconciliation.status!=='verified'||!reconciliation.serializationOnlyConfirmed)throw Error('RECONCILIATION_EVIDENCE_NOT_VERIFIED');
const event={id:'R22-FIXED-CONFIG-RECONCILIATION-20261011',kind:'incident',project:'jarvis',occurredAt:new Date().toISOString(),title:'固定复验接入的配置格式误判与实际对账',objective:'保留真实接入失败和修复，让固定复验在不重复付费开发、不改配对身份的情况下接通。',changes:['首次安装添加九个固定模板，节点启动保存为格式化JSON；安装器误用原始字节不变作为启动后的内容不变检查。','失败后中央仅撤回本次九个新增模板；节点回滚由于原始字节核对不等而停止，未强制覆盖私有配置。','只读诊断确认全27模板、非模板配置及完整JSON语义指纹一致；中央单独重接九个模板并读回，未重启节点或改其配置。','修正安装器的启动后检查：写前仍原始字节CAS；启动后核对完整JSON语义指纹，拒绝真实字段变化。'],decisions:['不把格式化差异当作真实权限变化，也不放宽真实字段核对。','失败、诊断、修复分别保留独立报告，不将首次失败改写成功。'],facts:['修复时全执行队列和节点日志/回执队列均为空；未发起模型或产品验收。','配对身份、原18个付费开发/评审模板及全局关闭策略保持。','另一次首次配置请求由于工作目录等于模板根而被409拒绝，尚未创建自治计划或源码模型任务；正补中央与节点严格例外。'],verification:['远端诊断：actual/expected完整JSON语义SHA一致，无字段变化。','中央单独恢复后：九个固定模板中央与节点逐项SHA相同，旧18模板不变，节点保持原进程及身份。','R22-3实际就绪核对：11个root固定文件、九个阶段策略和27模板逐项匹配；不代表14完整验收producer已实现。'],pending:['修复准确授权副本等于根目录的中央/节点检查并验证。','随后实际启动FA01；软件工厂产品验收及后续14类真实观察器仍待完成。'],lessons:['启动程序可能重排配置文件；写入前的原始CAS与启动后的语义核对目的不同。','中央、节点和固定验证器的目录规则需要联调，配置就绪不等于首次任务已运行。'],evidence:[dir+'/fixed-validator-executors.json',dir+'/fixed-validator-normalization-diagnosis.json',dir+'/fixed-validator-executors-reconciliation.json',dir+'/execution-readiness-r22-3.json',dir+'/executor-authorization-r22-3-all.json','scripts/install-autonomy-fixed-executors-r22.mjs','scripts/reconcile-autonomy-fixed-executors-r22.mjs'],state:{implementation:'partial',verification:'partial',deployment:'live',acceptance:'pending'}};
const path=dir+'/construction-fixed-reconciliation.json';
await writeFile(path,JSON.stringify(event,null,2)+'\n',{flag:'wx'});
const args=['scripts/construction-records.mjs','--input',path];
if(process.argv.includes('--execute'))args.push('--execute','--render');
const result=spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true});
if(result.status!==0)throw Error('CONSTRUCTION_RECORD_APPEND_FAILED');
