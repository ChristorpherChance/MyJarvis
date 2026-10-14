/** Append the actual R22-4 deployment and first native dispatch, without changing history. */
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const dir='artifacts/software-factory/autonomy-r22';
const release='20261011-project-autonomy-r22-4';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const [activation,node,ready,start,observation,local]=await Promise.all([
  read(`artifacts/managed-servers/${release}-activation.json`),read(`${dir}/${release}-node-upgrade.json`),
  read(`${dir}/execution-readiness-r22-4.json`),read(`${dir}/bootstrap-start.json`),
  read(`${dir}/observation-first-dispatch.json`),read(`${dir}/runtime-verification-r22-4.json`)
]);
if(!activation.results.some(n=>n.node==='112'&&n.active&&n.businessHealthy)||node.status!=='verified'||
  !ready.allPhaseFixedChecksReady||start.status!=='running'||start.config.costPolicy!=='record-only'||
  start.config.maxUSD!==null||start.config.maxTokens!==null||start.config.perTaskUSD!==null||
  !observation.node?.childProcesses?.some(p=>p.strongModelConfirmed))throw Error('ACTUAL_LAUNCH_EVIDENCE_REQUIRED');
const stage=observation.stages.find(s=>s.id==='FA-01');
const event={id:'R22-PROJECT-AUTONOMY-FIRST-LAUNCH-20261011',kind:'release',project:'software-factory',occurredAt:start.at,
  title:'R22-4 上线并实际启动101首个目标监督工作包',
  objective:'按冻结74项目标监督软件工厂，无金额或累计Token消费上限，保留真实任务、验证和决策依据。',
  changes:['修复准确授权工作副本与执行器根目录相等时被拒绝的问题；仅受保护自治模板和当前项目任务取得例外。',
    'R22-4已激活至112正式平台与101冷备，101独立开发节点已升级并核对配对身份及私有配置不变。',
    '冻结九阶段27模板及74项目标，实际启动FA-01；节点已领取并运行指定强模型。',
    '开发任务要求将实际问题、方案、选择理由、实施证据与回退办法追加到决策文件；结构化台账正在接线。'],
  decisions:['保留普通执行器目录限制，只为严格匹配的项目自治工作副本开放准确根目录。',
    '费用与累计Token只记录；每轮上下文、超时、取消及重复失败保护继续作为技术边界。',
    '启动、运行、独立验收和最终交付分别记录，不将模型运行或历史测试当作产品完成。'],
  facts:[`自治计划74项目标、九个工作包；目标版本指纹 ${start.goalSpecHash}。`,
    `首次观察任务 ${stage.taskId} 在101实际运行，强模型进程已核对；当时用量尚无终结回执。`,
    '全局持续监督仍关闭，仅本项目当前任务受授权；旧任务未复活。',
    '完整阶段验收所需14类真实观察器尚未完成，产品验收目标当时为0/74。'],
  verification:['本地69项相关运行时、授权边界、证据及契约测试通过；范围不包括产品验收。',
    '远端实际就绪：11个固定文件、九个阶段策略及27个中央/节点模板逐项核对通过。',
    '112正式节点健康；101冷备业务未激活符合当前部署策略。',
    '实际FA-01运行回执及进程元数据确认指定gpt-6.1-sol[1m]，未公开模型原始日志或私有环境。'],
  pending:['FA-01真实产物、固定验证、独立评审及后续阶段仍在执行。',
    '完整验收观察器、同版72小时无人值守观察及客户产品安装使用均未验收。',
    '结构化决策接口与页面待发布；原生CLI问题自动采集及复杂Pi决策还需单独接线。'],
  lessons:['目录授权必须同时在配置、中央派发/租约和节点执行核对；配置显示就绪不等于首任务可运行。',
    '消费上限与技术输出/上下文限制应分开，未知费用不可写成零。'],
  evidence:[`artifacts/managed-servers/${release}-activation.json`,`${dir}/${release}-node-upgrade.json`,
    `${dir}/execution-readiness-r22-4.json`,`${dir}/bootstrap-start.json`,`${dir}/observation-first-dispatch.json`,
    `${dir}/runtime-verification-r22-4.json`,'apps/api/src/runtime/project-autonomy-workspace.ts'],
  state:{implementation:'partial',verification:'partial',deployment:'live',acceptance:'pending'}};
const path=`${dir}/construction-first-launch.json`;
await writeFile(path,JSON.stringify(event,null,2)+'\n',{flag:'wx'});
const args=['scripts/construction-records.mjs','--input',path];
if(process.argv.includes('--execute'))args.push('--execute','--render');
const result=spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true});
if(result.status!==0)throw Error('CONSTRUCTION_RECORD_APPEND_FAILED');
