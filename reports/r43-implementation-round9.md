# R43维护9：三源码断点、真实新lineage后继与分阶段投影

开始2026-10-17T12:13:42Z。起点f9efea4a2955fb4093babd5b46cb10af6df1bd29/app1046761。checkpoint6e18c9960199c2ec86458b4f81b17a98759039d5在12:25:21保存（超过10分钟约1分39秒，如实保留）；最终应用d4663381b453fa5d35bab280de66c76cfcd45cfb，测试增强提交45dfdbe8bfcce967041a12e5d300b28fa333506b。唯一子任务只负责独立tests，未改runtime，已join。未112部署/运行agent升级/冷备/旧自治/十分钟/全局监督/Git网络/construction，原task账和历史不清。

## 三个确定断点修复

1. 投影副作用不再复用eventId：新分阶段projection outbox为record/change、select、action生成稳定且不同UUID，先冻结每阶段输入/CAS再调用既有ProjectDecision，完整response持久；record已写/select未写可重放原stage继续，不把proposed当全部完成。链接仅在选择已处理/明确资格不足后写；源事件原H不改。
2. 本人已关联纠错解析target的decision、feedback/instruction/outcome关联，真正走change而非record非null changeOf。原revision/actions保留。无真实选项则不造占位；一般业务技术方案缺资格保proposed。仅对服务端已核当前目标/owner政策/登记副本/可信signed sourceH，且真实原选项属于有限“补充证据/补充测试”集合时，把那个选中项投影为bounded证据后继资格；不把所有备选强填yes、不批准业务架构或产品验收。实际绑定派发/签名结果有独立action事实，proposed也可observeActions而状态不冒implemented；selected才经implementation。SQLite集成验证selected→dispatch动作→failed signed结果动作→本人偏好change→旧action/revision前缀保留，stage IDs不同且重启不重复。
3. 新session首signed result后仅在明确owner新lineage、旧signed子树stop证明、相同task/sourceH/programscope、policyId+generation仍active且task当前session等于回包新session时，CAS重绑定政策nativeSessionId；保政策授权史。真实paired长活child pause→待stop新session409→signed stop→同task新session首child不resume→主管在同授权下再次续派，第三child准确--resume new-native通过。旧cancelled/unknown账不改，撤销/目标变更仍阻旧授权。

## 其他实际操作闭环

主管重要blocked/wait_user/achieved与停止确认新增持久outbox，复用NotificationRuntime.publishSupervision/registerDurableSource；同event幂等owner private通知，点击supervision/project，无变化扫描不造新notice。真实SQLite+既有通知runtime测试扫描/重启只有一条同id。无外部推送/邮件已送达声明。

全经验上下文三个反例（excluded编辑、新candidate加入、空selected可见变化）在模型等待期间改变，拒旧结果且0后继/1调用，保unknown不强采信。此组是真实Repository/SQLite+实际SupervisorRuntime，但执行接口为显式fixture；不冒配对node现场。既有真实paired三run链现在反馈实际选项/模型选中补证，并通过真实ProjectDecision API核implemented，实际source机制不被stub。

## 验证、失败保原

Node v24.15.0/esbuild0.28.2。final-affected.tap 11/11：真实createApp配对三child与投影1、真实stop新session再resume1、主管HTTP4、全context3、通知1、投影SQLite1。前序profile fixture缺me导致notice失败、初始goal误selected、异步首派等待不足都保原日志；修的是fixture或精确资格门，不伪过。

边界唯一子任务初写stub违反范围已删除，后写真实fixture字段错误/关闭句柄挂起，主线程终止自己的挂起测试并保摘要boundaries-main.tap；无完整失败尾报不倒填。主线程修next.json/窗口字段、app.close及pause状态后独立2/2通过；再增强>10M场景验证真实第二child执行/ACK（非仅queued）仍2/2，原累计10,000,001保，政策只给1000有限窗口。queued后pause→真实agent claim null、磁盘0新child通过。日志boundaries-executed-final.tap。

完整types/build最终均exit0。未重跑无关protocol大组。原日志H/bytes见packages报告；独立新增测试的fixture不是实际供应商模型，不以loop token当产品进度。

## 同cut r6双包

PLATFORM_BUILD/agentBuild/编译runtimeBuild/archiveVersion同名20261017-cc-supervisor-r43-r6；实际chain日志agentBuild即r6。应用cut d4663381b453fa5d35bab280de66c76cfcd45cfb，之后45dfdbe仅新增测试断言/日志，包不混cut。原packager source-map/raw字节/mtime/offline门不改，平台与节点打包exit0。

112 ZIP：/home/superopen/All-Projects/jarvis-supervisor-r43-3f744a89/artifacts/r43-round9/platform/20261017-cc-supervisor-r43-r6.zip，20893765 bytes，SHA2567dc95d6f65bc7c0b08c1885efc1084345d126d594e3e4aaee85df5d91ed1e5fb；旁附release-manifest和ZIP.sha256。101版本目录artifacts/r43-round9/node-20261017-cc-supervisor-r43-r6/五件+SHA256.json，node984069 bytes/He8ddbc8268043463a7580370f706dd30c632bbf890bf65e055866095f1608d23。独立worker3196bytes/H465c441976588ed3127c5820eacc97e15705e3714f9ad295d574efd5cf143a2c。详细绝对路径、每件bytes/H与Node/esbuild见r43-round9-packages.json。包不会自动升级101服务。

## 仍未完成的具体验证

pending grant已提交/business尚无的故障注入后重建Runtime exact replay、business已提交/runtime未建cut、同源并发去重、真实awaiting-cost waitingUser→后继、queued后goalRevision撤权矩阵尚无本轮通过证据。投影集成SQLite模拟执行对象不冒HTTP完整纠错链；真实paired链已核selected/implemented但未同组执行HTTP事实改选/重启所有cut。投影对普通无资格业务方案保proposed是有意安全边界，不是所有选项已能自主选中。浏览器/手机、真实112模型/101产品CC现场由Root发布控制后另验，原74/用户整体签收另列。当前needs_more_work=true，不用候选包掩剩余cut矩阵。

费用：Root已记R8父65,598,223/costnull；306.642698-228.6071239999997=78.035574仅历史目录counter非账单；本轮parent/session modelUsage/counter增量待native final，均unknown/null，不改旧报告/账。
