# R45 R14：已审五项实体工作台缺陷的最窄修复

Operation59884e54-3ed3-4ce9-bfd6-6bc97ddac43d，开始2026-10-17T16:17:44Z，起点6ab3e09b325a8f0f1868c8aeacb76c22d7060320。checkpoint ba2e4e5，最终应用095b0e646a2889390a6751e2bedeb2bfecdee393；报告/最终提交在r45-round14-git.json另列。版本20261018-unified-projects-r45-r2。无子agent，未112发布/服务重启/101运行配置变更/冷备/旧自治/十分钟/全局监督/正式建设ledger/Root控制/Git网络操作。

Root提供的两份独审H：UI2ff1a25e14be5894da686dccefef444a030e4fbccbab23106aff545ac2bbe931、API35d923473750171c8b1bbc8abc33df9834397ac6bfd038629e005efcd5d6c270。报告引用的是用户明确给定审查，不声称本轮读取未提供路径的原文。

## 已实现修复

### 1 项目资料/副本路径恢复

新增细粒度ProjectDataDetails复用原act('op.project')及recordSnapshot CAS，不挂旧项目Dialog整页：编辑名称/说明/目标/仓库、登记/编辑非生产副本、环境资料、里程碑证据验收、决策/自治历史/用量/经验详情、原任务计划和归档动作。副本机器仅来自已登记非readonly设备，路径必须本人填写，不猜路径。缺choices时首屏直接“登记开发目录/完善项目资料”展开copies详情。普通首屏仍目标/判断/AI动作/阻塞/下一步/文字输入，不把三整页Tabs或原Dialog叠入。

旧?tab=copies/decisions/autonomy等在同项目打开对应详情；tasks/new?projectId转换为intent后显式展开高级TasksPage新任务表单。项目资料/副本仍由原正式handler校验owner/scope/revision，UI没有自行写库或扩大能力。

### 2 真实执行状态

只读context返回绑定task的executionStatus、实际getRun状态及resultReceived。首屏“排队等待执行器领取”与“执行中（已领取绑定运行）”与“已回传/待判断”分开，不从session.status=running冒CC已运行。无session也返回项目历史active/blocked摘要，未隐式adopt、restart、pump或派发。未知保未知、无虚假百分比。

### 3 前置失败与pending发现/恢复

所有纯已知preflight（模型ready、匹配专用template/已登记副本/实际executor ready、项目revision/归档）先于首次intent写入。缺模型或选择不符的POST不留下intent/task/session；配置/副本修正后新请求可开始。

context按当前owner/project暴露原pending command/input/fingerprint/stage/task/session/startRevision；UI刷新时恢复原目标、criteria/choice/ack和command，显式“继续登记/核对原请求”使用原input，不新UUID替代。原pending存在时更改输入不成为新授权，提示明确，不能删除原件解锁。

### 4 会话提交切点不能越过本人控制

协调器每个阶段固定task-record/task-create/session-create/start IDs。task创建前仍persist pending ownership，普通scheduler/start抢跑保护保。session提交但intent尚stage task的恢复，一律重放固定supervisor.create命令取得原回执的id/revision，绝不使用当前snapshot的新revision。当前session非原未变draft，或stage starting后有pause/stop/takeover，CONTROL_CHANGED拒绝，保原任务/会话/原pending与控制revision。没有伪造跨库单事务。

新增afterSession切点只供测试故障注入（默认无副作用），与R13 afterTask分别验证，不把一个钩子冒所有cut。complete kickoff重放只返回原记录，不重新授权后来暂停的session。

### 5 query与同项目焦点

共享projectRouteRoot只用path部分判Shell ROUTES，projects?unresolvedTask和projects?intent不再overview或拒navigate。原resolver仍保query/theme/board及旧三类URL。EntityWorkbench effect依真实params变更重开task详情与旧tab；同project换task、前进后退的输入绑定不依key重建。未知任务保项目选择提示不跳错项目。

## 实际测试/命令与证据

Node v24.15.0、esbuild0.28.2。

`node --import tsx --test apps/api/test/project-workbench-r14.test.ts apps/api/test/project-workbench-r45.test.ts apps/web/src/project-route.test.ts` 最终6/6、exit0（final-api-route.tap H4dede52fcf941cd51df95fe1085d3e082211bbffa163e5d71ded48dc2d4d66f1）：
- 真createApp/SQLite/原TaskDTO：缺模型、无匹配副本0intent/0task/0session，登记项目copy后choices实际出现、并发同command同task/session。
- afterTask提交切点：恢复原task，pending ownership阻普通start与agent claim；恢复后真实受控child签名结果与durable ACK。此为R13受影响组，本轮复验，不混为新现场供应商模型。
- afterSession提交但intent之前切点三组：本人pause/stop/takeover后重建协调器context读到原请求；重放原command明确CONTROL_CHANGED，owner控制revision不变、enabledfalse、真实agent claim null、task只一条。
- path/root query、旧task深链/项目tab映射直接相关断言。

`node scripts/test-r45-r14-components.mjs` exit0：真实生产ProjectDataDetails SSR能显示缺副本控制；直接触发实际“登记开发目录”按钮handler及表单submit，断言原op.project/update+revision4+本人显式path；ProjectWorkbenchPage三种实际context状态SSR分开queued/running/returned；直接执行生产EntityWorkbench的params effect，证明task焦点变化打开详情与tab copies同步。只mock React hook/API环境边界，未复制组件业务逻辑。**不是浏览器DOM/手机现场操作**，该范围留Root验。

完整API/Web types0，原npm build0。修复后新回归首次即通过，无伪造“修前已跑失败”；本轮Root审查为修前证据，R13旧失败原logs不覆盖。本轮只直接相关tests，没有旧R43大组、供应商调用或软件工厂客户测试。精确logs/exit/bytes/H见packages JSON。

## 同源R45r2与兼容闭包

应用095b0e646a2889390a6751e2bedeb2bfecdee393；PLATFORM_BUILD/编译runtimeBuild/archiveVersion同名20261018-unified-projects-r45-r2。先私留R13 dist/assets全字节/H；新build后同名异H拒，缺件原字节复制，R44/R7/R41历史闭包保。只读R41公共manifest Hd32d246c05142f53499f01812e5aa154e85bb53d5157427cc312cba59a4e4cda再核7件851685B。最终ZIP/manifest逐条读回全部prior-assets一致（compat-zip-readback.json），旧发布index/manifest/包不覆盖。

原platform/node packager均0，未改工具/门。112 ZIP绝对路径：/home/superopen/All-Projects/jarvis-supervisor-r43-3f744a89/artifacts/r45-round14/platform/20261018-unified-projects-r45-r2.zip，22222039B，H067dfaf097ea62f9804a79bee2326023fba2471faf31f56800d908b4314c5994；manifest H5b677817ce5d2f45c8eb81d3d1e3584344c94c2b90e309d37bf7df7f48abce98。

101独立五件目录artifacts/r45-round14/node-20261018-unified-projects-r45-r2；node Hf282a7823d386b70c6fe63a1ff6392533fa482972ee3284a70926a579010d58e与R44/R7兼容旧包一致，协议/运行agent未变，不能声称node含新R45运行标签或需要标签盲升级。平台tsc与节点esbuild是独立编译合同，不假要求字节相同。全部产物绝对/相对路径bytes/H见packages JSON。

## 完成与未验范围

本轮五项明确已审缺陷的生产修复和直接API/组件验证已完成；needs_more_work=false仅指本轮限定缺陷修复交付，不冒整个R43/74/客户交付/112现场验收。Root独立源码复审、受控112部署、原已登录tab browser/mobile实际操作、所有历史控制cut矩阵/全产品回归均未做。现有fixture只证明隔离机制。任务/预算/费用/模型权限/lineage守门保持，不扩新执行引擎。

本轮parent final/modelUsage/目录增量/已知账单金额未知null，待Root真实native终态，不推估或补0、不改原账。私件/依赖/报告不入应用payload；本地工具和旧untracked产物仍在，不宣称全工作树clean。
