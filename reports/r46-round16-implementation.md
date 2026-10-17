# R46 R16：真实表单提交阻断与最小首屏修正

开始2026-10-17T18:08:09Z，起点c687ec6dc8c56f6c4d5dcc1b87c9337270cae4b2/app6cfcdee。submit修复checkpoint0ad2619于18:10:47保存，在3分钟内；最终应用0bf30a48d3ea2c3f94ba87b875affddb1b3b5ff8，版本20261018-unified-projects-r46-r1。无子agent，未生产发布/服务重启/运行agent配置变化/冷备/旧factory/旧自治/十分钟/Git网络/construction。

## 现场P1与本轮实际修复

Root给定真实owner tab字段全部valid但主按钮type=button，未提交、平台session null/pending0；本轮不改写该原现场失败。原共享ui.tsx Button默认type=button正确，保持完全未修改。

生产ProjectWorkbenchPage composer唯一主Button显式type="submit"。首次kickoff、draft start、paused resume、waiting_user reply、pending恢复仍走原form onSubmit分支；没有新增onClick直发请求、没有绕过幂等/CAS/权限/停止或unknown门。所有导航、暂停/停止/切换Button仍默认type=button，不误提交。

## 真实渲染回归与诚实边界

`scripts/test-r46-submit.mjs` esbuild加载生产ProjectWorkbenchPage及未stub的生产shared Button，以react-dom/server渲染实际HTML。仅React state/effect API环境边界预载GET状态，非复制Button或submit helper。

- submit-before.txt exit1：原生产composer实际HTML是type=button，断言type=submit失败。
- submit-after.txt / submit-final.txt exit0：同生产按钮type=submit、未disabled、仍在真实form；返回列表按钮仍type=button。
- submit-ux-final.txt 是测试新增正则转义写错SyntaxError，保原；修fixture后submit-ux-verified.txt exit0。新增无session+已有结果/缺陷/修复安排首屏，及blocked/review_required/stopped/achieved四状态无死submit、显示真实详情入口断言。

本机无chromium/chromium-browser/google-chrome、jsdom或react-test-renderer依赖，未安装大工具。**SSR只证明最终HTML/共享Button合同，未声称真实DOM click触发submit或线上按钮验收通过。** 原R14直接handler测试未覆盖此语义的边界保留，不冒其曾验真实click。本轮没有供应商模型或软件工厂执行调用；Root后续原同tab实际click与现场“测试→反馈→修复安排”验收仍待。

## 最小简洁改进

- 首屏无新session时显示“本次监督尚未开始”，项目总目标与本次监督目标/标准分别折叠，不把历史完成当本次成功。
- 复用原SupervisionWorkRuntime表/授权，新增纯brief SELECT读取最近completed完成简报、blocked问题和nextAction；无pump、create、adopt、start副作用。workbench GET带该摘要，真实旧报告可直接显示，不另建台账。
- 紧凑四格：当前动作、最近结果、未解决问题/等谁、下一步/修复安排。session反馈优先，本次尚无反馈时历史简报明确保留来源；queued/claimed/returned仍按原真实run状态。
- blocked/review_required/stopped/achieved不留禁用“开始推进”死按钮，说明为何不能发，并以type=button打开原“查看原因/对账/修订目标”详情。只打开详情不派发、不扩大恢复权。运行中仍清楚未发送草稿。

## 构建与包

完整types一次exit0（typecheck.txt），完整最终build一次exit0（build.txt），Node24.15.0/esbuild0.28.2。未重跑旧R14/R15大组或历史语义。

最终appHEAD0bf30a48d3ea2c3f94ba87b875affddb1b3b5ff8；PLATFORM_BUILD/runtime/archive同名20261018-unified-projects-r46-r1。原platform/node packager均exit0、不改工具门。旧92件hashed资源闭包逐H恢复并在新ZIP/manifest读回，旧release/报告/包不覆盖。

112ZIP绝对路径：/home/superopen/All-Projects/jarvis-supervisor-r43-3f744a89/artifacts/r46-round16/platform/20261018-unified-projects-r46-r1.zip，22746833B，SHA256f02201c96ed7de7bdecc2e77ebf0a7b9b8df0691ce78d2c4af4ac00d14274bbd；manifest H3cb627ab6e32713131f6bf87fca2485e6475bb35a9b46082bb92967b6ddcf306。

101兼容五件目录artifacts/r46-round16/node-20261018-unified-projects-r46-r1，node代码未变，bundle Hf282a7823d386b70c6fe63a1ff6392533fa482972ee3284a70926a579010d58e与原R7/R44兼容包相同，不伪节点R46运行标签/要求盲升级。worker平台tsc与节点esbuild独立编译不冒字节同构。全产物相对/绝对路径/bytes/H、原日志H在packages JSON。

## 完成范围

本轮指定submit缺陷源码修复与SSR合同回归、有限首屏改善及双包交付已完成。needs_more_work=false仅本轮限定范围；Root线上click/原tab/mobile、真实供应商监管→101产品CC现场、原74/客户独立验收未做。没有把包、SSR或exit0当现场/产品达标。费用/Token final未知null，等待Root可信native终态，不补0不清账。报告/最终HEAD见独立git绑定文件。
