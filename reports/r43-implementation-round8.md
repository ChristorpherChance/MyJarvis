# R43维护8：未知窗口与真实停止lineage，同cut r5候选

开始2026-10-17T11:12:37Z，起点f8d23de7e4f5a9a2f456e03e402316d9a0f9eb8c。10分钟内checkpoint10e2b0c391685a340acb39cebc36e8fcf4a5715c；最终应用104676128894a59ffb1d273a48781c1e701f0cdb。两个子任务已join。未112发布、未升级当前agent、未启101冷备/旧自治/十分钟/全局监督，未construction/Git网络，原task历史/中央原件保。

## 实际修复与真实受影响验证

A窗口：continuationGrant冻结policyWindowId，和supervisor同一ID通过preflight与validateWindow；grant已提交而request尚无的exact replay允许复用同requestH/owner/source/未消费pending，不再一见内部commandId就拒。waitingUser仅当前signed awaiting-cost精确source/H允许继续，不泛开waitingUser。时限取min(grant/template/1200)，保持本地模板门。

生产合同生成器过去未保R7手工schema，实际新增测试先触发strict Task DTO拒首派/拒result；本轮同步生成器和OpenAPI的project-supervisor purpose/request/supervisor/grant/result/usage/sessionBilling/proof/lineage字段，未关validator。失败原日志保stop-lineage各阶段。

真实createApp首轮子进程回传无input/output Token、usageComplete=false/costComplete=false/unknown；随后主管在已一次owner授权policy内派生有限window，真实配对agent claim并执行后两run，3签名终态durable ACK，旧unknown未补0。最终实际agentBuild r5，与最终源build一致。unknown-window-final及final-mechanisms实际通过；不是R7普通15Token路径。

停止：worker控制fd3与CC stdout分离，child不继承控制FD；实际longchild close、stdout/stderr EOF、process group probe空后才产生terminationProof。proof绑定invocation/programmetadata/签名agent/lease/run，HTTP DTO严格接收；journal原绑定late cancelled与子树结束证明组合形成stopConfirmation。缺proof保持pending/unknown，不从cancelled推child0。长活fixture+伪stdout反例2/2通过。

真实paired stop链：首child活动→owner pause（立即new_session拒409）→heartbeat撤权cancel→实际child关闭→signed proof与stopConfirmation ACK→owner显式新会话核对摘要→同task第二child不带--resume，旧cancelled原结果不改。发现持久JSON proof对象引用===必假，改canonical结构等值，保所有字段/来源门。新nativeLineage记录旧session/sourceH/原因，不清task账；原生新session不是--last。最终该实际机制1/1通过。

B上下文：冻结全selected/excluded/cap context稳定H，model返回及dispatch前重算；前5以外cap有排除理由。当前自动outcome候选会改变上下文，比较按同一来源过滤/快照策略处理。**excluded编辑/新增/空selected三类HTTP反例仍未补齐，不称P1独立验收全过。** 决策选择/action桥与纠错关联代码有增量，但已选→实际派发/回执actions→改选完整链仍未真实验；现测试是初始goal纠错proposal，不能冒changeOf集成过。

历史：owner授权有界cursor与UI更早记录，可发现末100以外事件。真实HTTP造110条后累计latest100+更早page，修测试漏算latest100的错误断言而非放门，最终精确total>100通过；原分页失败日志保原。

## 最终命令与分母

Node v24.15.0/esbuild0.28.2。最终types0、build0。
- final-mechanisms.tap 7/7：unknown真实3run窗口链1、paired真实stop/newlineage1、主管HTTP/SQLite4（含历史>100）、policy-context1。确定性模型和有限child是fixture，不冒真实供应商/101产品CC。
- stop-final.tap 3/3：worker longchild证明+stdout伪造反例2、pairedstop/newlineage1。
- unknown-window-final.tap1/1单独保，不拼成一次11项。
- 早期DTO回退、source重复声明、proof identity/分页断言等失败日志全部分列保存，不倒填旧现场原因。

## 双包

最终source104676128894a59ffb1d273a48781c1e701f0cdb，PLATFORM_BUILD/runtimeBuild/archiveVersion均20261017-cc-supervisor-r43-r5。原平台packager0（source raw/source-map/mtime/offline闭包/类型门不改）；原节点packager0，五文件+SHA256.json验证后复制到新版本目录，不覆盖旧候选。

112 ZIP：/home/superopen/All-Projects/jarvis-supervisor-r43-3f744a89/artifacts/r43-round8/platform/20261017-cc-supervisor-r43-r5.zip，20874941 bytes，H3475d66b4117ccc4804cc30a39ca9399f9ad13e3e899110c446918150e19c271。
101目录：artifacts/r43-round8/node-20261017-cc-supervisor-r43-r5，node984069 bytes Hf47c6905fa0dc3b9a18afdfd3b202a400646f9c46ce1325b835d7d4c634c4664；worker3196 bytes H465c441976588ed3127c5820eacc97e15705e3714f9ad295d574efd5cf143a2c。全绝对路径/每件bytes/H及logH见packages报告。平台ZIP不会升级独立agent，原idle-upgrade仍仅prepare，不冒执行器已完成。

## 未完成与发布界限

已过真实未知window与停止lineage机制仍有效，不因未现场作废；但已知历史>10M、grant-only cut crash/replay/concurrency真实故障注入、business-before-runtime恢复、awaiting-cost waitingUser独立真实链、queued pause/goalrevision claim0child矩阵未完成。B全上下文三反例与完整ProjectDecision集成也未通过。浏览器/手机、真实112模型/101CC现场由Root后续控制，当前无生产部署。候选包不掩这些缺口，needs_more_work=true。

费用：Root提供R7父62470931与目录counter228.607124-158.712481=69.894643仅历史估算非账单；本轮parent/modelUsage/目录增量待完整native final，unknown/null，旧报告不追改，不清累计账。下一步只补列明的矩阵与decision/context验收，再独审和Root受控现场发布。
