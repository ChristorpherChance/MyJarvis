# R43 第二轮实际开发报告（仍未验收）

请求 e3334033e872558cdcd58df125959032ac957306，开始2026-10-17T07:33:55.113Z，收束2026-10-17T07:51Z。继续原副本/分支/原生会话，保7ffb4baa与5a70ea0d及旧失败结果，无clone/reset、无生产部署、无当前101agent升级。

## 实施

- 完整协议增量消费与最多4MiB诊断日志保留分离；独立有界consumer保留原生final/session/usage，重复final一致去重、冲突/缺final/超长行明确错误。Node子进程>4MiB事件后短final实际测试。
- 专用project-supervisor purpose/template与单轮反馈合同，禁止带旧base validation；需节点真实安装专用profile后才可就绪，不称中央改id就生效。
- 主管dispatch冻结input/幂等intent持久，模型intent prepared/started/complete/uncertain，完成结果重启复用；调用中崩溃不盲重付费。提供方无幂等模型API时不可能凭空恢复丢失结果，本轮明确uncertain需对账。
- 允许绑定正常签名失败反馈进入分析而不改success；停止请求/签名停止确认分开，显式resumeStopped及新goalRevision重绑；旧判断不能驱动新目标。
- 原件签名receipt合同限30件、单32KiB/总256KiB、字节/H/UTF8/私密检查，缺件/漂移明确missing。**实际agent原文上传接线被权限门拒绝，未接通，不称原件链已完成。** 服务端不能拿112本地目录冒101远端原件。
- Web真实换行、SSE失效通知与断线只读fallback，首屏摘要/详情分层；AGENTS补长期112主管/101CC文字会话工作模式。

## 测试与失败保原

`node --experimental-strip-types --test apps/api/test/agent-protocol.test.ts scripts/test-r43-round2-intents.mjs scripts/test-r43-round2-evidence.mjs` 最终exit0，8/8。日志 `reports/r43-round2-logs/final-targeted.tap`，SHA256 b18a1a3cbf5087382d947bd4e85c25435813a7644c05398fbc5faab309b50d17。

新增分母：protocol3（真实>4MiB子进程、旧前缀丢final模型/新consumer成功、重复冲突缺final、长行/UTF8/严格反馈），intent3（真实SQLite重启/完成结果复用/uncertain/输入篡改），evidence2（字节H正文/缺件漂移/私密与超长拒）。不是重复旧8组补日志，不是HTTP或真实模型测试。

早期protocol运行2/3通过、1失败：测试误以4MiB尾窗口模拟旧前缀；日志protocol-main.tap保原。修正测试后最终8/8；不得倒填真实现场raw pipe字节计数或宣称已证唯一根因。另agent独跑protocol日志保留。

## 权限阻塞与事故

官方npm11.6.2已下载，公开metadata SHA512核对通过；执行项目本地npm仍被权限门拒绝。未绕过，因此完整typecheck、Fastify真实HTTP持久库/重启、浏览器真实API仍未执行。语法检查不等于完整类型检查。

前端子任务误按默认CLAUDE记录规则执行construction工具，在独立副本误加唯一JARVIS-CHANGE-20261017-R43-WEB-ROUND2并改生成MD。发现后立即停止；精确git restore两文件的动作也被权限门拒绝，未绕过。**这两文件仍脏，明确不提交/不纳入交付patch**。需用户明确批准恢复 `docs/建设记录/events.jsonl` 和 `docs/贾维斯建设日志.md`。详情 `reports/r43-round2-scope-incident.json`。生产ledger未访问，不能说独立副本ledger完全未动。

## 原生用量对账事实

用户提供的上一轮补充：parent tokens8,704,976；含子agent modelUsage28,029,420另列；同session累计19.139963999999992USD目录估算非账单。中央旧failed/usage0/complete=false不改。此事实为主管提供，本轮未读取私有日志重新证明；下一真实CC费用应从该累计基线求增量，不能按中央0。追加式signed native observation/checkpoint合同不代表已导入原proof或完成历史对账。

## 未完成/下一步

真实112模型调用0、101CC最终验收0、生产发布0。完整类型/HTTP/暂停边界矩阵/丢ACK/失联子树/新目标乱序/手机浏览器未验。模型取消晚费用保留与abort闭环、独立技术边界授权（不冲洗旧task累计）、完整usage补充proof导入、原件no-follow上传接线与可信接收方授权仍须补。当前不可部署、needs_more_work=true。

推荐下一步：先审批本地npm执行及原件可信通道、恢复误改文档，再完整类型检查并修编译问题；限定HTTP+持久库+签名fixture验证首轮→判断→精确resume、暂停恢复和目标修订；最后真实112模型/101CC分列验收。101agent须先在隔离目录安装新协议consumer与专用profile（maxRounds1、timeout1200、retry0、record-only、受权技术token边界），比对中央/本地模板hash和版本，再由主管明确授权更新运行agent。本轮未做。
