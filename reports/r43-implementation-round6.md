# R43维护6：最窄修复与真实验证边界

开始2026-10-17T09:57:40Z，起点8d73dc87f7224b3a730d709fdfd408fb4bf80e23（应用94c1217）。8分钟内checkpoint c3cf9e47dd45d984fe69a669839edf927685e82f；最终应用源码91fdeb1ab35d53c8f846f8bf82843649bd397cc1。两子任务已于10:16前结束/join，未部署112、未升级当前101agent、未启动冷备/旧自治/十分钟/全局监督、未运行construction，旧task与费用历史保原。

## 已实际修复

1. Pi systemPromptOverride与createProjectSupervisorModel共用同一可信六键合同（experienceReferences始终存在），不再系统五键/文本六键冲突；明确候选不得被采用作授权。实际adapter构造+Pi源码共用引用检查2/2通过，非真实模型调用。
2. error/quota numeric零final不能覆盖已观察非零assistant partial。保存父用量下界和完整性false/费用unknown；重复message去重，合法final替换不双计。真实有限child2组通过，旧错误期望0/complete=true的quota测试已纠正。
3. OpenAPI正式ExecutionRequest/Template补专用purpose、supervisor、continuationGrant；sessionBilling runtime白名单接受并校验nativeCliVersion/costScope，原字段门保留；grant request带本人ack unknown进入preflight。正式签名partial回执1/1通过，保19/2、usageComplete=false/costComplete=false、无伪费用。
4. adopt proof首派冻结进request，派发成功后删除活binding并追加handoff-consumed事件，后继不再总用旧source；原证据事件不改。reconcile新增对原intent完整/uncertain的区分，不盲重call；尚缺完整恢复矩阵。
5. 修复原adopt model{}、HTTP undefined路径、experience实际metadata等fixture；privacy门未放宽。本人correction投影保proposal，不把null chosenId冒已选。stop view/页面区分请求/确认/未知；展示CC原问题/选项/建议/证据、可选择后编辑指令；achieved中文为贾维斯判定达标且非产品签收。

## 命令与真实结果

最终Node v24.15.0（PATH=/opt/jarvis-development/node/bin:$PATH）；本轮早期默认Node为v22.19.0，早日志保原，最终组明确重核24。npm锁定工具仍用已验项目本地CLI。

- 完整 `npm run typecheck` exit0，typecheck-final.txt，H=7f40097f385352126d4f4b2e7841c213a79435b0dd9e4746bba86938a1adf3ac。
- 最终源码 `npm run build` exit0，build-final.txt，H=9cbc5bd570044a45cb6b6f0d3f941284e6d9a311dd7db48601e2d895e16a0d48。
- final-targeted.tap：10/10，H=39bc83f8d146732280dcc1f607e75323e77415be0eafd4824cbff101c89095af。含真实child partial冲突2、HTTP接管/隐私3、model adapter2、HTTP/SQLite纠错/经验/等待旧判断3。模型和执行器在主管HTTP组仍为显式fixture，不能冒真实ExecutionRuntime的连续后继。
- signed-partial-dto-final.tap：1/1，H=8aaf4644ab964e9a54b3d7695a1feb6aaaece5b9761cd6291dc12dbd2172b065。真实签名route/strict DTO partial账接受；不是完整supervisorDispatch连续2轮。
- 早期编辑期间syntax/旧fixture失败日志保留（supervisor-mid/node24/typecheck各文件），不拼成一次全过。子任务旧39组报告36pass2fail1skip，两个unknown quota自动恢复状态失败作为负例保留，不unknown补0强行转waitingQuota。

## 仍阻断，不发布包

本轮最重要未完成：createApp原DTO→真实supervisorDispatch→Task→pump/claim→signed result/ACK至少两次后继；grant unknown历史/超10M、新窗口、重放并发只消费一次、owner/CAS/source变化/restart全链。当前新schema与ack传播是源码修复+局部回执验证，不能据此称原真实任务已能合法续派。adopt首次proof/后继清除虽源码已修，测试仍只fixture首派counter，未验证真实两轮。

已消费run遇失回reconcile完整恢复/uncertain人工入口尚需针对测试；ProjectDecision改选/actual actions、无条件不造option与经验反例全生命周期未独立验收。浏览器/手机、真实112模型/101CC、停止child0/新session lineage未现场验证。

依用户要求“真实路径通过后再准备发布物”，本轮不生成新r3双包。PLATFORM_BUILD/agentBuild已同名20261017-cc-supervisor-r43-r3并完整编译，但这是未验收源码；旧R5包保原且不得作为r3发布。idle-only脚本仍prepare、executeImplemented=false，不冒升级实现。

费用：Root提供维护5父32877121及116.885622-84.177032=32.70859目录counter仅历史补证，旧CC unknown报告不追改。本轮parent phase、session累计modelUsage、目录增量待本次完整native final，均null/unknown，不填0不冒账单。

下一步优先只补真实ExecutionRuntime两后继与grant矩阵，修实际失败，再最终独审/浏览器/现场有限验收后从同final source原工具生成r3双包；不需要再泛跑旧protocol8组。结论needs_more_work=true、releaseReady=false。
