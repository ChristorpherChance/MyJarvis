# R43 维护7：真实三run链与一次目标授权，双端r4候选

开始2026-10-17T10:26:35Z，起点e5c5754c625ffd28285074fb166f0ac416c593ed。10分钟内checkpoint bcfba6149b36bb7a9f29c7b033c200b7abf5d62f；最终应用源码c78e5072359975a00c8ed839697f9a2f392d266e。两子任务已join，未生产发布、未升级当前agent、未启冷备/全局监督/旧自治/十分钟任务，未construction。Root历史补证及旧task/结果/费用史不改。

## 本轮真实主链已通过

Node24实际createApp、原Repository Task handler与正式DTO、ProjectSupervisorRuntime、ExecutionRuntime派发/pump/claim、真实签名配对agent、实际有限Claude格式child、durable journal结果ACK。3个不同run同task同native session；首轮+2后继，磁盘round.txt=3；原生参数--resume分别false/true/true。Task仍validating、acceptance null，不冒独立产品验收。模型为确定性PiService fixture，不访问供应商/真实CC。主线程独立重跑1/1通过，原日志createapp-chain-final.tap H=92c10350454710f324ba19b9b1b768c92caf5bab203651754852a8f9d6dfd40a。

实际发现并修复生产链HTTP500：Task.ExecutionResult strict DTO缺sessionId/evidenceReceipts，结果应用事务被拒；本轮以受限schema补字段，不关闭validator。ExecutionReportedUsage未知/partial口径保留，源H不改旧史。旧first-run轮询、固定model重复directive STALLED等失败由子任务终端观察，未全部留下独立日志，不能倒填有原log；主已存可核通过log。

## 一次目标授权与对账

owner显式start/resume/reply可创建版本化goal policy：owner/project/task/session/goalRevision/goal+criteriaH、machine/workspace/executor/native lineage、generation、record-only、单run maxRounds1/retry0/timeout1200/父Token窗口1K..10M。未知历史必须本人一次明确ack，历史仍unknown。模型不能创建政策，只在有完整绑定signed result+current有理由continue+task CAS内由可信controller派生稳定source/decision/context窗口。policy/window/消费绑定持久，重放同源同窗口；pause/stop/takeover/目标修订/影响当前纠错撤policy，claim/heartbeat重核window与allows。20轮不清rounds，可在有效policy内以新来源/理由继续；连续3非成功或同指令stalled。

模块SQLite重启/稳定窗口/重复消费/撤权通过；主管上下文awaiting-cost/unknown窗口、暂停validate false与已消费失回reconcile明确review_required 0重model通过。**真实三run主链目前未触发超10M/unknown grant分支；这两个与并发/restart/claim撤权完整矩阵仍未验，不混称已覆盖。**

reconcile按原intent阶段：complete回judging复用原结果；consume但无可靠结果明确review_required而非假running，owner可新关联reply/goal。awaiting-cost与blocked进入可信诊断判读，record-only不凭空补费用。

## 经验/纠错/投影

既有experiences.capture/verify/update上增机器条件、native版本的实际版本保护验证；counterexample/revoke-verification/supersede窄HTTP入口经真实Repo/CAS/owner隔离，旧history保。顶层verified唯一资格，未核/未知/反例/停用/替代有排除摘要进model intent；候选不自动Skill。真实HTTP/SQLite新操作、selector、纠错、经验入model和dispatch前失效检查、UI源契约等主线程最终10/10，日志final-affected.tap H=cdf20afdd5bd256776507c339a8588afada400f0a8943dd47fa382aba595a6f4。

UI事实/偏好明确送correctionType，标准变更走goal revision；完整事件按eventId owner授权读取，不限末100。经验详情可展开机器条件/源事件/反例/替代/历史；持续监管授权范围及unknown ack、手grant ack有入口。UI仅typecheck/源码契约，未浏览器人工验收。

decision事件携冻结真实feedback/options、引用采用/排除与理由。重要决定event->ProjectDecision映射，纠错target能change关联；实际instruction/outcome可经既有implementation记录（仅已selected/implemented，不冒提案为实施）。当前安全保守投影多数仍proposed，自动select与完整改选/实际actions链尚未全闭合，不宣称这一验收全部完成。

## 构建与包

最终types exit0，build exit0；Node v24.15.0、esbuild0.28.2。PLATFORM_BUILD、编译runtimeBuild、archiveVersion同名20261017-cc-supervisor-r43-r4。原packager保持source raw字节/source-map/mtime/offline闭包/私密类型门；双包成功生成并校验。报告/依赖/私raw/私备份不进应用包。

112 ZIP绝对路径：/home/superopen/All-Projects/jarvis-supervisor-r43-3f744a89/artifacts/r43-round7/platform/20261017-cc-supervisor-r43-r4.zip，20604411 bytes，SHA256 b434d0d552fe9ef062c077f0217279cc8a89107747aa81b70f86f88f47fd8a3e；旁附ZIP.sha256与release-manifest。101独立版本目录artifacts/r43-round7/node-20261017-cc-supervisor-r43-r4/五文件+SHA256.json，node bundle982832 bytes/H a5923a8b226eaaa746334632715cd12e54916c0d38252ae7588840a57f608a4b。完整每文件bytes/H及source/工具版本见r43-round7-packages.json。动态worker agent-supervisor.js独立打包，平台ZIP不升级101agent。旧R5包不覆盖。

## 尚未完成/可发布边界

本轮终于证明真实执行主链，不再只有helper；但仍needs_more_work=true：unknown历史/超累计窗口真实grant链、重启/并发/CAS/撤权claim0与目标修订矩阵未全面实际验；ProjectDecision完整select/changeOf/actions与经验跨版本反例全链、浏览器手机、真实112模型/101CC现场验收、停止child0及new-session lineage仍待。子任务误npm转发曾跑宽测试并见旧恢复/DTO中间失败，未据此宣称全套通过；本报告只用明确原logs。包为交付候选，不是已批准上线。Root拿包独审/受控发布，当前不操作生产。

费用：Root已签R6父34539607，counter158.712481-116.885622=41.826859为历史目录非账单；本轮parent/modelUsage/counter增量待完整native final，unknown/null，不填0，不追改旧报告。下一步优先真实policy边界矩阵及剩余独审/现场，禁止用打包成功代替验收。
