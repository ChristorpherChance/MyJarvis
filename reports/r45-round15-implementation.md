# R45 R15：纯前置约束一致性修复

Operation2cf108b5-2c6f-4692-9dbb-7ead64f10eb0，开始2026-10-17T17:02:56Z，起点8e646d8c2627294cf8e51ce216f55c286a2f31fc。最终应用6cfcdeec3d4daf45f430c8bf19011f55c4dc94f3，版本20261018-unified-projects-r45-r3。无子agent、无部署/运行配置/权限/provider/Root工具/正式ledger/Git网络/旧任务/冷备/自动跟进操作。

## 最窄生产修复

kickoff纯preflight直接调用现有supervisorCreateSchema.parse，构造同固定session command/task ID，仅验证不create。重复criteria及原schema全部边界在任何intent写前拒；原supervisor unique约束未删/未放宽，fingerprint/CAS和暂停控制守门保持。

从work-domains提取同源assertTaskCreationEligibility(project,machine,scope,mode)，taskBody及workbench preflight共同调用。项目delivered/archived、managed公司scope/observationOnly机器（readOnly/readonly/company/scope/role原规则）仍拒；taskBody原门保留而非复制平行guard，不以task create作探针。

首屏重复条件给“验收条件重复，请合并后开始”；pending技术stage从常规提示去掉，原件context仍保stage。未改工作台布局/执行授权/账目规则。

## 真实验证

单独新文件project-workbench-r15.test.ts，真正createApp/SQLite/正式DTO/HTTP，无替换supervisor或validator。
- preflight-before.tap：修前exit1，重复条件POST400但实际intent count1!=0，复现本轮确定卡死缺陷。
- preflight-after.tap：修后fixture试图写Machine DTO不支持readonly/company字段被正式validator拒，保原。
- preflight-final.tap：fixture试图通过普通patch改变immutable scope实际上ctx.update保原scope，导致预期403而200；保该测试fixture错误，不放宽生产。
- preflight-verified.tap：最终1/1通过。重复条件拒且intent/task/session/run均0、context.pending空；delivered/archived及真实DTO支持的readOnly/company-role表驱动前拒仍0；恢复合法状态后**同原commandId**修正conditions成功，只一task/session、重放相同实体、原start实际queued一run。readonly/company别名及company scope同源函数仍保原规则，但这些未作为有效Machine DTO状态强塞测试，不假称全部公司场景实测。

完整API/Web typecheck exit0（typecheck.txt）；最终源码build exit0（build.txt）。未重跑R14旧6组、原组件测试或无关大组。Node24.15.0/esbuild0.28.2。

## 包与兼容

原platform/node packager exit0。app/runtime/archive均R45r3；平台ZIP22484354B Hfac0d591ef13babcf0ed1077ccd6c09040c77aa4450a9a5371a521012818aaaf，manifest Ha8a658207df6f1a6388b1c8ba7b85e33a69d557cc7ea259abd9caf90caa114d8。路径artifacts/r45-round15/platform/20261018-unified-projects-r45-r3.zip，旁附sha/manifest。101五件版本目录artifacts/r45-round15/node-20261018-unified-projects-r45-r3；node Hf282a7823d386b70c6fe63a1ff6392533fa482972ee3284a70926a579010d58e与旧兼容包同，未伪节点标签/要求盲升级。平台tsc与节点esbuild独立合同不冒字节同构。

保原R14及更早86件immutable assets逐H恢复，新ZIP/manifest读回全部86件一致（含先前接纳七R41）；旧包不覆盖。所有文件绝对/相对path/bytes/H见packages。新公共R41输入本轮未另重读，沿已保存并逐H包内验证的原闭包保留，不假称另核manifest。

本轮指定缺陷修复交付完成，needs_more_work=false仅此范围。Root源码独审/112部署/原tab手机真实浏览器/供应商模型101现场及原74/客户12验收未做，包存在不冒上线。费用/Token final未知null待Root可信终态，不补0不清账。报告提交绑定见r45-round15-git.json。
