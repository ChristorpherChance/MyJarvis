# R45 R13：统一项目实体工作台与明确开始的持久协调

Operation5aff7bd1-86ef-4b80-9725-1d435c16920d，开始2026-10-17T15:28:30Z。起点8046ffaf822403390abfbed60abc80ff257d4bd0。应用最终cut f1fdec236fa9e3f901fee02aa9ca4b623a5e2d0a，版本20261018-unified-projects-r45-r1。无子agent、无模型供应商调用、无112发布/服务重启/101agent运行配置变更/冷备/旧自治/十分钟/正式ledger/Git网络操作。

## 设计与实际实现

顶层导航唯一“项目”，去掉独立supervision/tasks顶层项和重复常用/分组项目入口。项目卡片点击打开projects/:id实体工作台而非Dialog。共享resolveProjectRoute用于初始hash、navigate、hashchange/popstate；supervision/project、tasks/project、tasks/task深链、tasks/new项目意图映射保留，无法确定任务所属项目显示明确选择/未找到，不跳overview。异步任务载入后unresolvedTask能继续解析。主题/board query仍由原Shell维护。

工作台首屏为目标/条件摘要、贾维斯判断、AI状态、阻塞/等谁/下一步、文字输入和暂停/停止/接管；可切项目/返回列表/复制稳定链接。首次从真实registered non-production copies与专用template组合选择，不猜路径或拿online冒能力，不需手工taskId。存在单个已核选择会合理预取。运行中child不支持stdin即时注入，页面明确只保未发送草稿；普通文字在blocked/review/stopped等禁用，不隐式恢复。暂停/等待本人仅经明确continue/reply动作。旧高级任务、监督事件/纠错原件、事项简报按需挂载在详情，不首屏堆两大panel/三整页Tabs。

服务端GET /api/v1/projects/:id/workbench只读访问/project/copy/template/就绪/当前session和全部历史tasks，缺模型/执行能力如实返回，不create/adopt/enable/pump。多个历史任务不擅自收养；已有session使用原commands，旧blocked/autonomy不自动restart。

POST .../workbench/kickoff在真实principal/owner/scope/project revision、目标criteria、machine/executor/workspace和已核就绪下，复用workHandlers.tasks.create→supervisor.create→supervisor.command(start+policy)。三个阶段分别持久到专属SQLite，不声称跨库事务。每步稳定command UUID和预留task UUID，owner+command内容H重放，changed payload拒；部分成功保task/session/startRevision。task创建前先持久pendingOwnership，原scheduler及普通start从首个Repository提交回调起即不能抢派。task先提交后中断/重建协调器恢复同实体；完成请求重放只返回原response，不越过后来pause/stop/control revision。已有会话不新造第二个。

## 真实验证与失败保原

1. `node --import tsx --test apps/api/test/project-workbench-r45.test.ts apps/web/src/project-route.test.ts`：2/2通过。真实createApp+原Task handler/DTO/SQLite+专用pairing有限child：连续GET不建task/run；afterTask故障注入后task存在但ownership已保护、普通start拒、agent claim null；重建协调器同command恢复同task/session并实际原start→签名child→durable ACK；changed payload拒；后续pause不被kickoff重放恢复。模型为确定fixture、child为native-format fixture，不冒112→101供应商现场。
2. `node scripts/test-r45-workbench-render.mjs`：真实生产ProjectWorkbenchPage经react-dom/server，预载GET状态/hook边界，6状态（无session/draft/running/paused/blocked/review）render通过；运行态说明未送达CC、阻塞禁用。不是浏览器点击测试。初始renderer复制React/useRef问题失败原log保，修fixture边界而非改生产求绿。
3. `node scripts/test-r44-task-render.mjs`：保留生产DevelopmentSupervisionPanel六row/4unknown/known0/positive真实render通过。未改unknown账。
4. 完整API/Web typecheck最终0。首次类型失败（默认import/递归返回类型）日志保留并最窄修。完整build最终cut0；因异步task URL兼容和单入口尾修发生一次直接受影响重建，早build保原。

## 交付与兼容

先保存原本机R44 dist/assets全部原字节/H到本地私工具目录并公开清单。R45最终build后逐同名H检查，缺件原字节复制；R12七件R41原输入manifest H d32d246c05142f53499f01812e5aa154e85bb53d5157427cc312cba59a4e4cda再次核读，7件851685B同名异H拒。最终ZIP逐件读回原R44闭包（其中含7R41），新manifest正常列入，compat-zip-readback.json保存。旧release/index/manifest不覆盖。

原packagers平台/节点0。最终112包：/home/superopen/All-Projects/jarvis-supervisor-r43-3f744a89/artifacts/r45-round13/platform-final/20261018-unified-projects-r45-r1.zip，21953395B，H63807e77611c3920a74cc34a2ea09c5581462d4edd685663fed6292299d95b67；manifest H01e399c2495fd0fcf0ce2376906ce8a14046e21ada920ca12d59c0b0967c63e8。独立node-final版本目录五件+SHA256核同source，节点协议未变；node H f282a7823d386b70c6fe63a1ff6392533fa482972ee3284a70926a579010d58e与R44一致，不能称运行101已升级/与112同版本。平台tsc与节点esbuild不同编译合同不要求字节同。全路径bytes/H/source/tool版本在packages JSON。

## 明确未完成/待审

最窄切片已实际执行，但不称产品全体验收：未做真实浏览器/mobile点击/前进后退实测（仅共享resolver+响应CSS+SSR）；旧高级new-task intent保query但未自动展开新任务表单；里程碑/副本/经验/预算部分仍需详情组件/已有入口，不是已重整全部高级交互。跨库cut测试只覆盖task已提交后中断；session已提交/start结果unknown等更细cut和多进程并发未全部验证。缺模型/离线通过代码门和context提示，未另构完整所有状态HTTP矩阵。已有running普通reply API仍有旧内核语义，主工作台禁用并保草稿，未改造即时交互通道。kickoff关闭/归档及scope负例需独审补测。needs_more_work=true用于这些实际缺口，不把候选包或SSR冒现场。

Root后续独立审/112部署/已登录tab现场验收/建设记录均未做。费用只记录，本轮final parent/modelUsage/金额未知null，待Root完整native流，不partial估算、不清账。appHEAD与报告提交精确绑定在独立git证据文件。
