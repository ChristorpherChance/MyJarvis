import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Persists the completed independent human-style static document review.
// No source execution, test, remote access or generated acceptance claim.
const mdPaths=[
  'docs/软件工厂Agent迭代与全自动交付方案.md',
  'docs/软件工厂端到端目标与验收标准.md',
  'docs/软件工厂首项目交付计划.md',
  'docs/贾维斯建设档案.md',
];
const auditPaths=[
  'artifacts/software-factory/goals-r21/agent-capability-audit.json',
  'artifacts/software-factory/goals-r21/autonomy-gap-audit.json',
  'artifacts/software-factory/goals-r21/delivery-completeness-audit.json',
  'artifacts/software-factory/goals-r21/jarvis-bridge-audit.json',
];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const docs=await Promise.all(mdPaths.map(async path=>{
  const bytes=await readFile(path);
  return {path,bytes:bytes.length,sha256:digest(bytes),text:bytes.toString('utf8')};
}));
const audits=await Promise.all(auditPaths.map(async path=>{
  const bytes=await readFile(path);
  return {path,bytes:bytes.length,sha256:digest(bytes),data:JSON.parse(bytes.toString('utf8'))};
}));
const loc=(index,needle)=>{
  const doc=docs[index];
  const line=doc.text.split(/\r?\n/).findIndex(x=>x.includes(needle));
  if(line<0)throw new Error(`Reviewed paragraph changed or absent: ${doc.path}: ${needle}`);
  return {path:doc.path,line:line+1,sha256:doc.sha256,locator:needle};
};
const m=section=>loc(0,`## ${section}.`);
const g=section=>loc(1,`## ${section}.`);
const p=section=>loc(2,`## ${section}.`);
const covered=(id,note,locations)=>({id,documentCoverage:'covered-as-target-and-required-evidence',note,locations,runtimeAcceptance:'not-performed'});

const coreReview=[
  covered('FINAL-01','入口是客户原始需求，工厂自动提炼范围、用户场景及可测试条款；可复用平台配置不是客户预写PRD的前置负担。正常完整输入和目标环境已配置时，无逐关人工点击直至实际使用。',[m(1),m(7),m(10),m(11),g(1),p(1),p(5)]),
  covered('FINAL-02','旧人工/生产发布分期仍如实记录为历史和现状，但不作为永久否定新增自动交付目标的边界；七关外定稿、补丁、关单、AT-MANUAL等也需真实自动适配。不会冒充客户签字或人工身份。',[m(8),m(10),g(7),g(8),p(5),p(11)]),
  covered('FINAL-03','定义、真实执行与能力优化分开；启动前解析实际提示词/技能/工具/路由/模板内容，冻结哈希，执行器核对、运行回执记录采用身份，不只登记版本号。',[m(3),m(4),m(5)]),
  covered('FINAL-04','阶段负责人/专业子Agent按需委派；真实父子关系、独立写范围、输出汇合、失败/暂停/取消传播、共享预算和计量防重均有要求。Pi已有能力及Jarvis现有基础复用，并不假称完整层级已经实现。',[m(3),m(4),m(9),m(12)]),
  covered('FINAL-05','项目修复和Agent优化各有候选/预算；稳定与候选独立评估、未见集和真实项目观察、阈值提升和退化回滚均承接。在途固定版本；生成方不能改题、降标准并自评通过。',[m(5),m(6),m(7),m(11)]),
  covered('FINAL-06','原文到PRD/HLD/各适用LLD、独立页/子页/状态、整体原型、任务源码、测试和发布包冻结依赖；变更定位受影响路径并使旧证据失效，不用旧三工件组合替代。',[m(4),g(5),g(7)]),
  covered('FINAL-07','质量使用当前条款分母和真实工具证据。空/模拟/未跑/错版本/未核实不能正式通过；真构建、真实测试与独立复验不是模型完成声明。',[m(2),m(8),m(11),g(6),g(9),p(3),p(9)]),
  covered('FINAL-08','交付包括全套实际文件字节、统一版本哈希清单、实际下载解包、干净安装、迁移、用户角色业务及数据持久化、运维接管；仅报告/ZIP/健康检查不是使用验收。',[m(10),m(11),g(2),p(10)]),
  covered('FINAL-09','R21 2661049为当前静态审阅内容；R20 e375、旧4bf/fecbf测试及R19运行证据有历史范围，不重新署名为当前执行。当前新源码未产品验收，历史NO-GO保留。',[m(2),g(10),p(2),p(8),p(12),loc(3,'## 当前状态：2026 年 10 月 11 日'),loc(3,'首次历史完整测试绑定当时提交')]),
  covered('FINAL-10','本轮只做设计和源码静审，未开启全局监督、调用模型、测试部署或业务数据库读取；工作包为待落实推荐而非已派发/实现/上线/验收。私有配置、聊天、凭据不进入客户包或公开记录。',[m(2),m(7),m(10),m(12),g(10),p(6),loc(3,'## 下一步建设队列')]),
];

const deliveryCoverage=[
  covered('DEL-R21-01','输入文件/页面/表格/图片/附件完整性、长文分段与覆盖对账、OCR原图定位和疑点、损坏/加密/截断显式处理。',[m(7),g(8)]),
  covered('DEL-R21-02','实际模板套件、客户优先规则、解析正文及导出器版本冻结并纳入执行与产物身份。',[m(4),m(7),m(10)]),
  covered('DEL-R21-03','完整适用产品文档目录包括API/数据、用户/管理员、安装迁移升级恢复、测试发布及依赖/授权说明，按同构建软件照做。',[m(10)]),
  covered('DEL-R21-04','独立高保真各页/子页/状态与整套交互同时验收；页面实际设计正文、共享组件/数据和跨页业务一致，缺页占位不能成品通过。',[m(2),m(3),m(4),m(12),loc(1,'### 4.3 全部独立高保真页面与整体交互')]),
  covered('DEL-R21-05','原型真实渲染/行为/语义检查、unverified不得正式通过，原型一致性与真实业务行为分别核对。',[m(2),m(8),m(12),loc(1,'### 4.4 代码与 UI 一致性')]),
  covered('DEL-R21-06','真实代码、单测/CI、审查合并、构建和可运行客户软件，不能用任务标题页面/mock结果冒充。',[m(2),m(10),m(12),g(6)]),
  covered('DEL-R21-07','交付真实文档/页面/原型/源码软件/迁移/证据字节和统一清单；独立下载、校验、解包与安装运行。',[m(10),p(10)]),
  covered('DEL-R21-08','报告决定JSON、逻辑备份、客户包分别管理；备份需一致快照和真实对象/全部适用关系恢复；客户包私密内容受控脱敏。',[m(10),p(10)]),
  covered('DEL-R21-09','各约定格式文本、表格、图示、链接、字体、目标语言和分页可读；实际字节校验与最终客户入口授权/过期续取/大文件断线检查。',[m(10)]),
  covered('DEL-R21-10','实际已配置目标环境角色旅程、写入读回及重启持久化，初始化权限迁移、用户管理员引导、监控备份和反馈接管。缺目标不伪称使用完成。',[m(10),m(11)]),
  covered('DEL-R21-11','共同语言/时区/单位/数字/公司品牌模板和目标终端贯穿资料需求、页面数据测试和交付。',[m(7),m(10)]),
  covered('DEL-R21-12','自动运行从客户原始需求一直到完整文档软件、实际安装使用、归档维护和变更恢复；最终无逐关人工点击并分阶段取得证据。',[m(7),m(8),m(9),m(10),m(11),g(7)]),
];

const autonomyCoverage=[
  covered('AUT-01','模拟开发/测试事实与真实生产目标清楚区分，真实性门和真实执行器补齐后才正式通过。',[m(2),m(8),m(12),g(6)]),
  covered('AUT-02','auto不止模式字段；规则/责任/策略版本、语义审阅、真实证据及决定可查询。',[m(8),m(12),p(3)]),
  covered('AUT-03','跨阶段就绪自动创建后续工作、依赖调度和自动返工，而非导航或advance冒充工作流。',[m(7),m(12)]),
  covered('AUT-04','七关之外固定human动作及AT-MANUAL必测另列真实适配，不冒用人或只改mode。',[m(8)]),
  covered('AUT-05','现有工具仅部分自主事实保留；真实产品命令适配和受控自动写动作需实现，不能靠提示词宣称已能自动执行。',[m(2),m(4),m(8),m(12)]),
  covered('AUT-06','失败自动拆具体修复任务，在边界内修复与独立复验，停滞和无意义重试明确阻断。',[m(7),m(9)]),
  covered('AUT-07','持久阶段/父子/输入候选/证据、检查点、副作用对账、暂停取消、重启恢复和幂等身份有要求。',[m(4),m(7),m(9),m(12)]),
  covered('AUT-08','原资料到所有适用LLD、目录、独立页状态、原型、计划代码、测试配置报告及包冻结依赖，变更精确失效，不以三工件组合代替。',[m(4),g(5),g(7)]),
  covered('AUT-09','正常放行不接受模拟/空分母/未跑/旧版，实际全部必测、真实原型与CI依据、正反例及同版全链独立证据。',[m(8),m(11),m(12),g(6),g(9),p(5)]),
  covered('AUT-10','交付决定/适配桩与实际文件、安装部署使用分别判断，完整实际包和同候选目标旅程必须验证。',[m(10),m(11),p(10)]),
];

const agentSectionMap={A01:[3,4],A02:[3,4],A03:[4],A04:[2,4,12],A05:[4,7],A06:[4,7,9],A07:[4,8,12],A08:[4,7,9],A09:[3,4],A10:[3,4,12],A11:[4,6,9],A12:[4,7,9],A13:[8,12],A14:[4,6,8,10],A15:[4],A16:[5,6,11],A17:[7,8,9,10,11]};
const agentCoverage=audits[0].data.findings.map(f=>covered(f.id,f.topic,agentSectionMap[f.id].map(m)));
for(const [auditIndex,coverage] of [[0,agentCoverage],[1,autonomyCoverage],[2,deliveryCoverage]]){
  const expected=audits[auditIndex].data.findings.map(x=>x.id).sort();
  const got=coverage.map(x=>x.id).sort();
  if(JSON.stringify(expected)!==JSON.stringify(got))throw new Error(`Incomplete review mapping: ${auditPaths[auditIndex]}`);
}
const draftResolutions=[
  covered('DRAFT-R21-01','实际定义内容解析/快照/执行器核验/采用回执已补。',[m(4)]),
  covered('DRAFT-R21-02','客户原始需求入口、平台可复用配置、工厂自动提炼范围验收已补。',[m(7)]),
  covered('DRAFT-R21-03','实际模板正文和客户语言/格式贯穿配置已补。',[m(4),m(7)]),
  covered('DRAFT-R21-04','完整真实文件字节、统一清单、下载解包校验和安装已补。',[m(10)]),
  covered('DRAFT-R21-05','适用全产品文档目录、客户引导接管及导出内容/格式/链路校验已补。',[m(10)]),
  covered('DRAFT-R21-06','逻辑备份与可恢复备份/报告/客户包区分、对象字节与隐私边界已补。',[m(10)]),
  covered('DRAFT-R21-07','页面相关设计正文与共享组件/数据跨页语义、独立真实行为验收已补。',[m(2),m(3),m(4),m(12),g(4)]),
  covered('DRAFT-R21-08','R20历史表头及不能沿旧源码身份建立最新候选的措辞已补。',[g(10),p(2),p(12)]),
];
const consistencyResolutions=[
  {topic:'旧首项目计划的逐关人工出口',status:'resolved',locations:[p(3),p(5),p(8),p(9),p(10),p(11)],explanation:'当前辅助模式与成熟自动模式分别表述；§5总注明确最终无逐关人工点击；管理视图是质量策略及决定。'},
  {topic:'旧测试/模型/行号误认当前',status:'resolved',locations:[p(2),p(8),p(12),loc(3,'首次历史完整测试绑定当时提交')],explanation:'首项目§2明确10月10日快照与首轮身份；外层模型连通明确R19历史、本轮未重跑；旧源码行号称早期，不验收266。'},
  {topic:'历史RTM口径与新增无遗漏目标',status:'resolved',locations:[g(9),loc(2,'原 PRD 的 RTM 指标保留为历史口径')],explanation:'历史比例/分母保留；新增本期必需条款100%承接及真实验证，不能用比例或空范围覆盖遗漏。'},
];
const bridgeCoverage=audits[3].data.evidence.map((item,index)=>({path:item.path,sourceSha256:item.sha256,staticFactAcknowledged:true,locations:index===0?[m(2),m(12)]:index===1?[m(4),m(7),p(7)]:index===2?[m(2),m(7),m(12)]:[m(2),m(4),m(5),m(12)],boundary:'既有只读/调度/版本技能基础可复用，不证明现网已接通内层完整工厂业务、能力优化或客户交付使用。'}));

const secondRead=await Promise.all(mdPaths.map(async path=>({path,sha256:digest(await readFile(path))})));
for(const file of docs){if(secondRead.find(x=>x.path===file.path).sha256!==file.sha256)throw new Error(`Document changed during final review: ${file.path}`);}
const report={
  schema:'factory-r21-document-review/final',
  createdAt:new Date().toISOString(),
  reviewer:'factory_delivery_depth_r21 · independent delivery/document review subagent',
  scope:{method:'独立人工语义静审，本机四份公开MD与四份冻结审计报告交叉核对；脚本只持久保存已完成的审阅。',remoteAccess:false,projectModelCalls:0,testsRun:0,builds:0,deployments:0,productionDbReads:0,privateInputsRead:false,mainDocumentsEdited:false,htmlVisualReview:false},
  reviewedFiles:docs.map(({text,...file})=>file),
  reviewedEvidence:audits.map(({data,...file})=>({...file,evidenceScope:data.scope})),
  currentAuditedSourceHead:'266104923b7f49b259dc8a7b827d599c5220ad16',
  sourceRuntimeCorrespondence:'UNKNOWN · 所审公开源码身份不证明当前运行进程/构建加载同版',
  decision:'DOCUMENT_SCOPE_ACCEPTABLE',
  decisionMeaning:'四份冻结文档可作为R21后续实施目标基线；新增全自动实际使用目标、Agent迭代和已列审计缺口有明确承接与所需验证，没有仍需修正文档才能推进的阻断项。不是实现、运行或产品验收通过。',
  sourceFilesStableDuringFinalReview:true,
  summary:{coreChecks:coreReview.length,deliveryFindingsCovered:deliveryCoverage.length,autonomyFindingsCovered:autonomyCoverage.length,agentFindingsCovered:agentCoverage.length,draftIssuesResolved:draftResolutions.length,bridgeFactsReviewed:bridgeCoverage.length,unresolvedDocumentBlockers:0,productAcceptance:'NOT_PERFORMED · 当前新源码待验收，历史NO-GO不改变'},
  coreReview,draftResolutions,consistencyResolutions,deliveryCoverage,autonomyCoverage,agentCoverage,bridgeCoverage,
  remainingImplementationAndEvidence:['最新候选实际打包及隔离部署运行核验','真实Agent定义/模板注入、子Agent执行和取消/恢复/预算边界','完整真实生产和独立质量门及修复复验','稳定/候选Agent独立评估与实际提升回滚','全套真实文件下载、格式校验、独立安装和目标用户业务使用','正常无逐关点击的全自动贯通及异常/需求变更/24与72小时稳定证据'],
  limits:['本报告只审核文档目标覆盖与事实措辞，未验收代码/接口/实际行为。','三份远端审计的文件范围有重叠，不合并累加为整个仓库阅读或验收。','所审MD指纹仅绑定报告形成时这四份文档；后续正文变更需按影响范围更新复核。','模型标识是用户指定路线，本轮没有验证Provider、价格或上下文容量。','HTML同源生成及视觉效果由根代理核对，本次没有浏览器验收。'],
};
const out='artifacts/software-factory/goals-r21/document-final-review.json';
await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({file:out,sha256:digest(await readFile(out)),decision:report.decision,reviewedFiles:report.reviewedFiles,summary:report.summary}));
