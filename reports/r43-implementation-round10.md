# R43维护10：移除选项名称自动认证，保留真实动作事实

开始2026-10-17T12:57:20Z，起点a09cd24997b793d70cbfdacc7b831d2d20cd1373/app d466338。无子agent，无其他矩阵扩展。最终应用源码2bd2e27b97b44f76567ccf6c6b90cfd9a8dc618b。

## 本轮唯一生产问题与最窄修复

问题：boundedEvidenceChoice只核“补证/测试”选项名、当前policy和回包H，未约束实际directive；投影再把选项写成yes/available并清missingEvidence，错误地把模型选项文案升级为服务端资格。

采用保守方案：删除运行时boundedEvidenceChoice及projectionAuthority生成；删除deriveDecisionProjection对该label的自动资格升级（即使旧事件含同名projectionAuthority也不再据此升资格）。原模型选择、理由、建议、真实选项、具体缺失条件保留；无服务端动作强绑定资格时保持unknown/proposed。没有通过正则匹配directive求绿，没有把所有备选填yes，也没有新增逐轮本人批准。

原policy授权仍决定CC是否可推进。真实dispatch和signed result使用现有observeActions保留事实，proposed不等于未执行；事实也不等于资格、产品验收或签收。R9稳定不同阶段commandId、持久stage输入/response、select剩余阶段恢复、change纠错、通知outbox和新native政策重绑定均保留，未修改其生产逻辑。

## 修前失败→修后验证

修改的原createApp正式链测试让模型选择“collect missing evidence”却返回“replace business architecture and prepare deployment plan”不符directive。它经实际ProjectSupervisorRuntime、正式Task DTO、ExecutionRuntime、TCP签名配对ExecutionAgent、有限native格式child和journal ACK，非手工qualified authority或导出helper。

- 修前 `label-authority-before.tap` exit1（0/1）：实际审计状态implemented而反例期待proposed，确认本轮明确问题。
- 移除label认证后同链 `label-authority-after.tap` exit0（1/1）：原policy仍运行3child、两后继resume/ACK；审计全部proposed/无chosenId，资格unknown且missingEvidence非空；模型不符directive/理由保留，实际performed动作可查；事件不再新生成projectionAuthority。
- 第二项原“qualified正向”投影测试按真实合同更名并改期待，不强造yes：无资格label保持proposed，dispatch/failed结果actions前缀、纠错change、旧revision/H、稳定stage及restart重放继续验证。owner显式纠错与AI自动资格区分，不回写旧动作成功。
- 最终r7标记两项直接受影响测试2/2、exit0，`final-r7-affected.tap`。未重跑已过无关大组或普通protocol矩阵。

命令（均PATH=/opt/jarvis-development/node/bin:$PATH，Node v24.15.0）：
`node --import tsx --test apps/api/test/execution-createapp-chain.test.ts apps/api/test/supervisor-projection-round9.test.ts`
`node .r43-tools/npm-package/package/bin/npm-cli.js run typecheck` exit0（完整API/Web，一次）。
`node .r43-tools/npm-package/package/bin/npm-cli.js run build` exit0（完整，一次）。

原失败及各次修后日志未覆盖。所有log bytes/H与命令产物见r43-round10-packages.json。

## 同源r7双包

应用固定2bd2e27b97b44f76567ccf6c6b90cfd9a8dc618b，PLATFORM_BUILD、编译runtimeBuild、archiveVersion、实际测试agentBuild均20261017-cc-supervisor-r43-r7。

原platform packager与node packager均exit0，未改打包工具/门；r6不覆盖。
- 平台ZIP绝对路径：/home/superopen/All-Projects/jarvis-supervisor-r43-3f744a89/artifacts/r43-round10/platform/20261017-cc-supervisor-r43-r7.zip，20893252 bytes，SHA256 af07648042bb874598190b291d002bfa068db5e069b9304b8dd2f985db73fb84。
- manifest同目录release-manifest.json，SHA256 bbb9d3a2e091dbb0db45c3a78ef758245fd074db6a99fa9f7ced034656f35a30，旁附ZIP.sha256。
- 独立101目录：artifacts/r43-round10/node-20261017-cc-supervisor-r43-r7/，五文件+SHA256.json已逐件校验；node984069 bytes/H dab1f9808ac587f5ca325d7eecda7d31a485af9aad1b800f3947c1d64402743d。
- worker源入口相同；平台tsc模块和独立节点esbuild bundle不同，未宣称字节相同或可复现构建。真实工具Node24.15.0/esbuild0.28.2，每件绝对路径/bytes/H见packages报告。

## blockingReleaseIssueRemaining与范围

**本轮指定的已确认label自动资格认证问题已关闭，blockingReleaseIssueRemaining=false（仅指本轮该项）。** 未发现/证明新的发布阻断缺陷；本轮不是全仓安全审查或全部监管产品签收。既往pending-grant/business-runtime持久切点、awaiting-cost独立后继等仍属未覆盖验证范围，不自动当成已证明bug。真实112模型/101产品CC与浏览器/手机由Root后续现场验，未用fixture冒现场。原74/客户交付签收完全独立。needs_more_work对整体仍true，用于保留未验矩阵与现场，不否定R9/R10已过机制。

未发布112、未操作运行agent/冷备/旧自治/十分钟、未Git网络、未construction/私env/历史决定追改/费用清账。费用：R9父70242296已由Rootsigned外账，本轮未重复记；本轮parent/session modelUsage/目录增量待完整native final，unknown/null，目录counter非账单。
