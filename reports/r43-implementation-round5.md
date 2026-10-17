# R43 维护5：实际实现、构建与双端候选，未通过发布验收

开始2026-10-17T09:28:33Z，起点607f4a62387311276dc214999c82850acf1a1139。12分钟内checkpoint0f655fc0b418fce85637e6b256e2a4d3a1c7a734；集成759e1a2667baa37dac6d5d5cc174aa9a78660a37，最终源码94c1217（全H见Git）。两个子任务均已停止/join，未部署112、未升级重启当前agent、未启动冷备/全局监督/旧自治/十分钟任务，未跑construction。旧中央/维护账原件不改。

## 实际代码与测试

单trusted spawn consumer增phase边界：init+后续活动才允许新阶段，同阶段冲突仍拒；provisional零后活动无新final不能complete0。父phase usage逐段合计，partial对应final不重复累积；total_cost_usd保最后累计不相加，主结构报告不被通知文本覆盖，后继失败保failure。新增真实有限child三完整phase、zero后partial无final、同phase冲突3组，连原协议5组通过8/8；日志multiphase-final.tap。生产有界raw私留（配置deliveryDirectory/native-private，600文件/700目录，256MiB上限停止，不公开内容）、程序H/nativeCliVersion/invocation/agentBuild元数据签名链。原生CLI缺版本/旧版本resume成本unknown，父phase与累计modelUsage不混。modelUsage完整跨run持久账仍未全部补齐。

A实际复现quota AGENT_RESULT_REJECTED，原日志round5-quota-repro-original/focused保；ExecutionActualUsage DTO/OpenAPI不再强制未知token，measurementStatus与签名metadata/nativePhases同步；journal无checkpoint重启显式unknown。原quota后续仍failed而非waitingQuota，unknown不冒0，旧自动恢复用例仍未通过，不冒修全。grant H口径改JSON.stringify并支持显式承认unknown窗口、preflight窗口门；但createApp真实DTO→claim→signed result的完整grant/CAS/restart/并发专项未完成，不能证明旧task已可安全续派。

B新增owner CAS/幂等adopt/reconcile/API/UI，绑定旧task/nativeSession/终态原H不造新task；真实nativeCliVersion进入经验条件。共享privacy guard在公共持久前检查；隐私拒绝原文不写公共intent，受限私留仅H/安全摘要。项目决策映射与真实选项投影有增量，完整changeOf/actions/outcome链仍未验。收养初版重复source verified被最后delta修一次；当前adoption HTTP组仍失败，原日志adoption-privacy-final.tap及adoption-delta.tap保。

## 构建与候选交付

实际PLATFORM_BUILD=20261017-cc-supervisor-r43。最终source94c1217运行原npm build成功（build-final-delta.txt），此前完整typecheck通过（typecheck-prepackage.txt）。原packager未改门，source-map/原tracked raw字节/mtime/offline closure检查通过。原node packager生成独立101五文件+SHA256.json；平台ZIP不升级节点。

最终112候选：artifacts/r43-round5/platform-r2/20261017-cc-supervisor-r43-r2.zip 及release-manifest.json、zip.sha256。
101候选目录：artifacts/development-node/package/（jarvis-node.mjs、agent-supervisor.js、prepare-development-node.mjs、使用说明.md、package.json、SHA256.json）。绝对路径/bytes/H、sourceCommit、Node/esbuild绑定见reports/r43-round5-packages.json。二者同source cut；archiveVersion r2与runtimeBuild另列。早期platform包保原，不用于最终。

idle-only升级只新增参数化prepare入口scripts/prepare-r43-idle-node-upgrade.mjs，校验包H并生成所需queue/ACK/process-owner/claim barrier/二次queue/cgroup0/备份/回退清单，executeImplemented=false。**不是已完成升级执行器，不得直接用它升级当前agent**。

## 失败与未验证

combined-final为18项17pass1fail，经验fixture仍用旧run.agentVersion所以metadata改后引用缺失；不放宽真实版本门。adoption/privacy6项3pass3fail（收养派发、privacy HTTP fixture、旧经验fixture），delta仍未全过。多phase与collector定向通过，不拼成一次全过。完整HTTP旧纠错/等待旧模型0后继仍过，但不足以验收新入口。

未做：真实112模型/101CC现场、真实原件回传、浏览器/手机、旧scope child0停止及新session lineage、完整grant入口矩阵、privacy重启无泄漏全矩阵、节点idle升级执行闭环、非作者最终独审。候选ZIP技术打包通过≠可发布物验收通过。当前仍needs_more_work=true，不可部署。

费用：用户给定维护4 parent23791456/cost未知、当前session累计目录counter基线84.1770319999999USD仅当时历史；本轮parent/token/modelUsage/目录增量待完整native final，报告unknown/null，不以0或目录counter冒账单。未换task/清历史。

下一步先修adoption/metadata fixture与真实入口失败，补grant createApp/DTO/claim/restart专项及隐私反例，再独审双包与节点升级门。无生产动作。
