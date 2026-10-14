import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files=['delivery-source-readout.json','delivery-source-readout-2.json'];
const snapshots=await Promise.all(files.map(async name=>JSON.parse(await readFile(`artifacts/software-factory/goals-r21/${name}`))));
const sources=snapshots.flatMap(x=>x.rows);
const last=JSON.parse(await readFile('artifacts/software-factory/goals-r21/delivery-source-final-fingerprint.json'));
if(!last.sameHead||last.changedFiles.length)throw Error('SOURCE_CHANGED_DURING_AUDIT');
const evidence=(path,start,end)=>{const f=sources.find(x=>x.path===path);if(!f)throw Error('UNKNOWN_PUBLIC_SOURCE');return {path,startLine:start,endLine:end,sha256:f.sha256,classification:path.startsWith('doc/')?'design-document':'static-implementation'};};
const ev={
 parse:evidence('apps/server/src/modules/material/parse-engine.ts',14,15),
 scan:evidence('apps/server/src/modules/material/parse-engine.ts',32,47),
 cut:evidence('apps/server/src/modules/material/parse-engine.ts',129,142),
 refs:evidence('apps/server/src/modules/req/generate.service.ts',115,147),
 pending:evidence('apps/server/src/modules/req/docs.service.ts',298,344),
 reqExport:evidence('apps/server/src/modules/req/export.service.ts',30,49),
 designExport:evidence('apps/server/src/modules/design/export.service.ts',25,44),
 templateDelete:evidence('apps/server/src/modules/platform/template-sets.service.ts',57,64),
 templateUpdate:evidence('apps/server/src/modules/platform/template-sets.service.ts',67,80),
 templateKinds:evidence('apps/server/src/modules/platform/doc-templates.ts',270,279),
 templateChoice:evidence('apps/server/src/modules/platform/doc-templates.ts',284,304),
 pageContext:evidence('apps/server/src/modules/design/prototype-pages.service.ts',119,139),
 pageContract:evidence('apps/server/src/modules/design/prototype-pages.service.ts',255,270),
 pagePrompt:evidence('apps/server/src/modules/design/prototype-pages.ts',232,270),
 compose:evidence('apps/server/src/modules/design/prototype-pages.ts',290,330),
 placeholder:evidence('apps/server/src/modules/design/prototype-pages.ts',167,178),
 prototypeCheck:evidence('apps/server/src/modules/design/prototype.service.ts',87,115),
 markerCheck:evidence('apps/server/src/modules/design/prototype.service.ts',609,630),
 prototypePreview:evidence('apps/web/src/pages/design/PrototypePanel.tsx',460,510),
 build:evidence('apps/server/src/modules/dev/build.service.ts',42,79),
 buildStub:evidence('apps/server/src/modules/dev/build.service.ts',100,112),
 decision:evidence('apps/server/src/modules/test/reports.service.ts',180,185),
 reportExport:evidence('apps/server/src/modules/test/reports.service.ts',189,208),
 backup:evidence('apps/server/src/modules/platform/backups.service.ts',141,178),
 backupBoundary:evidence('apps/server/src/modules/platform/backups.service.ts',20,61),
 fileProxy:evidence('apps/server/src/modules/platform/files.controller.ts',16,41),
 fileUrl:evidence('apps/server/src/modules/platform/storage.service.ts',71,89),
 exportSyntax:evidence('apps/server/src/modules/platform/doc-export.ts',35,71),
 exportPdf:evidence('apps/server/src/modules/platform/doc-export.ts',158,194),
 prd:evidence('doc/product-design/PRD.md',11,26),
 languages:evidence('doc/product-design/PRD.md',174,178),
 sevenLld:evidence('doc/product-design/README.md',10,23),
 realMapping:evidence('doc/product-design/README.md',72,87),
 originalRelease:evidence('doc/product-design/LLD-1-模块设计.md',439,439),
 originalBackup:evidence('doc/product-design/LLD-1-模块设计.md',545,546),
};
const findings=[
 {id:'DEL-R21-01',topic:'客户输入完整性是流水线第一道质量出口',currentFact:'扫描 PDF 无文本时明确报当前不支持 OCR；AI 整理只使用前 24000 字符，截断标记送入提示词而最终返回模型正文；md/txt 直通。定稿参考指纹校验与 PRD 消费 CRD 定稿正文已有静态实现。',gap:'上一轮提出原件/OCR疑点，但没有把输入完整性建立成自动运行的可执行前置标准。无法以已解析或模型自称完整证明全部原始材料已被覆盖。',recommendation:'输入契约记录格式/语言/页数/表格/图片/附件/版本/原文定位；大资料分块、检索与覆盖对账；扫描/OCR/加密/损坏/截断/冲突有显式状态和补资料请求；保留原文及解析对照，完整性未证实不得进入正式无人值守生产。',evidence:[ev.scan,ev.parse,ev.cut,ev.refs]},
 {id:'DEL-R21-02',topic:'生成时真实使用的模板必须固定',currentFact:'命名套件、项目绑定及按文档类别换源已有实现；条目直接 UPSERT 更新，删除套件将绑定项目及类别解绑回默认；生成提示词声明客户参考模板优先。',gap:'仅记录套件名称或项目绑定不能还原某次生成的真实骨架与约束；全局删除/修改可能导致后续再生成使用另一模板。',recommendation:'每个工件固定实际模板解析结果、套件/条目/默认代码版本和哈希，说明客户模板优先及冲突处理；更新形成新版本，不更改旧工件采用依据；把模板迭代与阶段 Agent 版本一起评估。',evidence:[ev.templateDelete,ev.templateUpdate,ev.templateChoice]},
 {id:'DEL-R21-03',topic:'客户产品文档不能止于需求与八册设计',currentFact:'内置默认模板为 CRD/PRD/HLD 和 mod/alg/cls/db/api/ui/nfr 七册 LLD；可自定义 x- 类型，具备专业度校验与 AI 草案机制。',gap:'自定义模板能力不代表安装、用户、运维、数据迁移、测试、发布文档已随最终产品自动生成并核验。上一轮仅笼统写安装运维用户说明。',recommendation:'项目开始固定适用交付目录：原始需求/澄清/CRD/PRD/RTM、HLD/全部适用 LLD、UI规范/每页及全交互原型、开发与测试报告、源码/API/数据字典、安装/配置/升级/回滚/备份恢复、用户操作/管理员运维、版本说明/已知问题/第三方依赖与授权清单；每份文档以实际同构建软件和真实操作验证。',evidence:[ev.templateKinds,ev.sevenLld]},
 {id:'DEL-R21-04',topic:'独立原型页面与完整业务交互需双重验收',currentFact:'单页生成、独立工件及汇总拼装已有；汇总对缺页/对象缺失回落占位；单页上下文提供 PRD 节选及设计锚点文本，不注入真实 HLD/LLD 章节正文；硬性契约检查封装/标记/样式，不证明业务语义。',gap:'页面能单独预览、页切换与状态切换不等于跨页面业务旅程完整。上一轮给出了目标但缺少针对当前生成方式的承接改造。',recommendation:'每页加载受控相关需求和设计的完整适用上下文；规定共享视觉/组件/字段/接口和跨页状态数据契约，独立页与整体包来自同一页面清单；检验每条真实点击旅程和异常恢复，未生成占位/模型降级不得计作成品。',evidence:[ev.pageContext,ev.pagePrompt,ev.pageContract,ev.compose,ev.placeholder]},
 {id:'DEL-R21-05',topic:'原型质量检查须看真实渲染和行为',currentFact:'当前 checkPrototype 仅 includes 核对 data-page-block/data-page/data-state；人工待核对列表 unverified 不参与 passed 计算（只 issues.length===0）。',gap:'源码静态表明存在结构标记与高保真/真实交互证明的差距；本轮未运行反例，不宣称实际已误定稿。',recommendation:'结构检查、完整产物来源、真实 DOM/渲染、每页视口状态、跨页旅程、需求语义各自出证据；待核对条款要有明确判定或阻塞，不让 HTML 标记齐全代替质量通过。',evidence:[ev.prototypeCheck,ev.markerCheck,ev.placeholder]},
 {id:'DEL-R21-06',topic:'必须有客户可运行软件工件',currentFact:'当前 DevBuildService 从任务标题/交付物清单派生实现预览 HTML，另写只含 buildId/fingerprint 的 JSON，静态源未执行真实编译、客户源码打包或镜像构建。',gap:'登记构建与不同源 HTML 不证明真实软件已构建；单纯下载这些对象也不能给客户安装使用。',recommendation:'Git 实际合并→受控真实构建→源码包/可运行包或镜像→适用资源/迁移/配置示例/启动说明→构建清单与校验；包在独立环境运行关键用户旅程，发布复用同一验证包。',evidence:[ev.build,ev.buildStub,ev.realMapping]},
 {id:'DEL-R21-07',topic:'交付决定与报告导出不能替代完整交付包',currentFact:'交付写决定并置批次 released；报告导出 JSON 包含 summary/decisions/evidenceRefs，没有全部文档、源码、实际软件及证据文件。需求/设计册已有四格式真实导出服务。',gap:'上一轮可下载标准太概括，需明确工厂已有下载能力和最终成套交付能力的区别。',recommendation:'独立交付任务汇集被验收的确切文档、独立页/交互原型、源码/运行软件、测试与证据、手册/变更说明；含项目/需求基线/Agent方案/构建/测试/发布统一 manifest、真实文件字节和校验，不只临时 URL/引用。另建交付准备、已生成、可下载、已下载校验、已安装、可使用、已接管状态。',evidence:[ev.decision,ev.reportExport,ev.reqExport,ev.designExport]},
 {id:'DEL-R21-08',topic:'备份恢复、证据导出、客户交付分别定义',currentFact:'项目备份为各表 JSON 和 manifest；artifacts 仅列 mat_files 对象键/大小，并不包含实际对象字节；白名单未包含当前 dsg_prototype_pages 和模板套件/绑定等；系统模型/提示词登记明确不随项目备份导出。',gap:'该逻辑备份不能直接当作完整离线恢复或客户交付包；逐表读没有一份显式一致快照的静态证据。',recommendation:'备份定义一致快照、全部适用数据库关系/文件对象/外部可恢复依赖和受控私密配置引用；实际恢复演练核验内容。客户交付包只纳入客户有权获得的产品资料与软件，避免把内部聊天、模型配置、凭据或其他项目内容混入。',evidence:[ev.backup,ev.backupBoundary,ev.originalBackup]},
 {id:'DEL-R21-09',topic:'下载和文档导出需要独立内容与链路校验',currentFact:'需求/设计四格式导出写到 versionId.format 对象并返回短签名/同源文件代理 URL；doc-export 轻量块解析主要覆盖标题/列表/代码/表格/段落，PDF 表格退化为文本行，未发现图像/图形/链接渲染分支。',gap:'有导出 API 不证明用户通过最终域名下载成功、格式全部信息/图示完整、字体分页可读或同版本导出字节恒定。',recommendation:'每种交付格式核对文本/表格/图/链接/中文与目标语言、分页/打开可读性；形成导出版本/实际字节哈希，保存确定工件而非反复覆盖生成；最终客户入口授权/过期/续签/大文件/断线等按适用范围验证。',evidence:[ev.reqExport,ev.designExport,ev.exportSyntax,ev.exportPdf,ev.fileUrl,ev.fileProxy]},
 {id:'DEL-R21-10',topic:'客户真正使用是独立于发布成功的出口',currentFact:'已审入口的 released 仅表示决定记录，未提供独立客户安装/迁移/接管/实际业务使用结果。本轮不登录业务项目、不下载真实客户资料、不访问生产数据库。',gap:'最后状态不能停在模型完成、包生成、进程健康或管理者确认本批交付。',recommendation:'交付对象和环境可选择自托管包或受控托管实例；另一环境按手册安装/初始化、账号角色/安全配置、初始数据或迁移、访问/登录/关键用户旅程实际通过；完成用户/管理员引导与演练、备份与监控接管、凭据受控交接、支持责任及问题反馈。没有真实客户确认时区分自动技术验收和客户业务认可。',evidence:[ev.decision,ev.reportExport,ev.originalRelease]},
 {id:'DEL-R21-11',topic:'项目语言及公司交付格式应贯穿全流程',currentFact:'原 PRD REQ-709 要求客户工件多语言，当前单页 prompt 明确要求中文界面；模板解析允许参考公司格式优先。',gap:'上一轮未把客户项目语言/时区/数字与单位/公司模板等定义为每阶段共同输入。',recommendation:'项目建立目标语言、受众、终端、时区及适用数值/单位/格式档案；需求、原型、代码、数据、测试、帮助和交付文档同口径。多语言内容与翻译术语有版本和独立质量验证，不凭平台 UI 中文替客户选择。',evidence:[ev.languages,ev.pagePrompt,ev.templateChoice]},
 {id:'DEL-R21-12',topic:'从产品交付扩展到可维护的全自动服务',currentFact:'原设计保留 ReleaseAdapter 并默认人工决定；实际相关入口是报告与批准记录。本轮不审查代理迭代或自动门禁实现，交由平行审查。',gap:'新全自动目标需要客户项目交付后使用、需求变化、回归、升级与接管等续阶段，而非开发阶段 autopilot 扩名。',recommendation:'建立明确自动运行项目档案和输入/出口合同；在已授权范围内贯通所有阶段、质量拒收返工、增量变更、最终包/部署/使用技术核验。模糊/矛盾输入自动澄清并只暂停受影响路径，外部依赖失效/预算耗尽有恢复与升级规则；客户真实业务认可和重大新范围不可伪造成自动完成。',evidence:[ev.prd,ev.originalRelease]},
];
const goalPath='docs/软件工厂端到端目标与验收标准.md';
const baseline=await readFile(goalPath);
const report={schema:'factory-delivery-completeness-audit/r21',createdAt:new Date().toISOString(),machine:'101',sourceRoot:'/home/superopen/All-Projects/msf',head:last.head,scope:{readOnly:true,designAndStaticImplementationSeparated:true,sourceFilesRead:sources.length,sourceFingerprintsStable:true,modelCalls:0,tests:0,builds:0,deployments:0,restarts:0,productionDbReads:0,browserBehaviorChecks:0,privateInputsRead:false},previousStandard:{path:goalPath,sha256:createHash('sha256').update(baseline).digest('hex'),comparison:'本轮指出 R20 目标维度应落到当前软件工厂具体输入/模板/独立页/导出/包/使用接口能力；未更改既有 PRD/工厂源或门禁。'},understanding:{originalProduct:'五阶段真实软件交付流水线，资料库双解析面、CRD/PRD/RTM、HLD+七册LLD+独立原型目录/页生成/汇总、开发计划/执行/自测/转测、独立测试计划/用例/缺陷/报告/交付决定。另有全局 Pi 助手、子Agent/委派、可复用命名文档套件及每类别换源。',currentDownloadCapabilities:'需求/设计文档四格式导出、独立原型预览、基线JSON下载、测试报告/决定JSON导出、项目逻辑备份JSON；本轮只证实静态入口。',newTarget:'用户明确增加阶段 Agent/子 Agent 迭代，并要求成熟后客户原始需求→全部产品文档→实际软件交付使用全自动；应同时补全产品文档、实际软件、真实文件交付与使用接管出口。'},findings,evidenceFiles:files.map(x=>'artifacts/software-factory/goals-r21/'+x).concat('artifacts/software-factory/goals-r21/delivery-source-final-fingerprint.json'),interpretationBoundary:'静态源码事实可证明当前这些入口怎样组织和缺少哪些执行证据；未运行的行为不作验收通过或线上误交付结论。完整包/安装使用/自动政策等推荐待开发与实证。本报告不审 Agent 内部迭代与人工/自动 gate，避免与平行审查重复。'};
const target='artifacts/software-factory/goals-r21/delivery-completeness-audit.json';
await writeFile(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({file:target,head:report.head,findings:findings.length,sourceFilesRead:sources.length,sha256:createHash('sha256').update(await readFile(target)).digest('hex')}));
