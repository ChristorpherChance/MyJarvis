/** Summarize the frozen read-only inventory and source review without executing tests. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const fingerprint=async(path)=>{const bytes=await readFile(path);return{path,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};};
const sourceFiles=['apps/api/src/runtime/agent-runner.ts','apps/api/src/runtime/agent-supervisor.ts','apps/api/src/runtime/execution-runtime.ts','apps/api/src/runtime/cli-supervision.ts','apps/api/src/runtime/usage-ledger.ts','scripts/software-factory-usage-observer.mjs','scripts/install-software-factory-node.mjs','artifacts/development-node/package/jarvis-node.mjs','artifacts/software-factory/reference/apps/server/src/modules/ai/ai.module.ts','artifacts/software-factory/reference/apps/server/src/modules/ai/pi-gateway.ts','artifacts/software-factory/reference/apps/server/src/modules/ai/models.service.ts'];
const inventoryPath='artifacts/software-factory/full-test/ai-readiness-inventory.json',inventory=JSON.parse(await readFile(inventoryPath,'utf8'));
const modelForPurpose={};for(const[purpose,route]of Object.entries(inventory.inventory.softwareFactoryInternalAI.modelRoutes??{}))modelForPurpose[purpose]=inventory.inventory.softwareFactoryInternalAI.registeredModels?.find(m=>m.id===route?.modelId)?.model??null;
const report={
 formatVersion:1,assessedAt:new Date().toISOString(),machine:'101',projectId:'70ec346f-6520-46ed-abed-22cac770a3e4',scope:'只读环境清单、恢复与日志代码审阅；不是模型连通复测、故障注入或软件工厂完整产品验收',readOnlyRemote:true,modelCalls:0,remoteTestsRun:false,sourceModified:false,credentialsExported:false,
 disposition:{boundedSingleTask:'ready-for-bounded-isolated-test-subject-to-test-workspace-and-test-environment',unattendedAllFailures:'not-ready',currentGlobalSupervision:inventory.central.supervised,automaticAcceptance:false},
 evidence:[await fingerprint(inventoryPath),...await Promise.all(sourceFiles.map(fingerprint))],
 confirmed:[
  {id:'AI-ENV-01',status:'observed',finding:'101 专用开发节点在线，User/HOME 为 superopen，私有配对配置 0600、签名身份存在；中央与节点模板 canonical 比较一致；并发为 1。',source:inventoryPath},
  {id:'AI-ENV-02',status:'observed',finding:'Claude Code 2.1.296、cc-switch、pnpm 10.6.1 可定位；Codex/Pi CLI 未出现在配置搜索路径。Pi SDK 三包 0.86.0 已安装，SDK 使用不依赖 Pi CLI。',source:inventoryPath},
  {id:'AI-ENV-03',status:'observed',finding:'Claude 设置 ANTHROPIC_BASE_URL 与当前 cc-switch Claude provider 为 https://gw.superopen.top；设置还含 ANTHROPIC_API_BASE_URL=http://127.0.0.1:3456。模板未显式 --model，实际模型应以原生运行回执核对，不能仅按设置显示推断。',source:inventoryPath},
  {id:'AI-ENV-04',status:'observed',finding:'cc-switch 当前 Claude proxy_enabled=0、auto_failover_enabled=0；贾维斯模板 fallbackExecutorIds=[]。没有已配置且验证可用的自动后备路线。',source:inventoryPath},
  {id:'AI-ENV-05',status:'observed',finding:'模板边界为 maxRounds=10、单轮 timeout=1200 秒、lease=60 秒、Token=500000、priced、最多 3 次恢复、退避 900 秒；中央全局监督 false、急停 false。全局关闭会冻结任务为单轮，不能发生自动续轮/恢复。',source:inventoryPath},
  {id:'AI-ENV-06',status:'observed',finding:'usage 观察 timer 已加载并处于 active/waiting；oneshot service 最近退出码 0。journal/serviceLogs 配置各为 0；任务执行日志仍通过节点协议回传，二者不同。',source:inventoryPath},
  {id:'AI-ENV-07',status:'observed',finding:'软件工厂内部 GET 路由为 '+JSON.stringify(modelForPurpose)+'；活动路线 price_table 未配置。模型注册 conn_status=ok 仅是保存的历史状态，本次未复测。',source:inventoryPath},
  {id:'AI-ENV-08',status:'inference-not-runtime-provider-proof',finding:'软件工厂正在运行 main.js 的初始环境未设 MSF_AI_PROVIDER；当前公开源码以该变量严格等于 pi 才创建 PiAiGateway，否则为 mock。因此推断默认 mock，需要有效运行配置/运行身份进一步确认。不能把路由登记或 SDK 安装当成真实模型执行生效。',source:'artifacts/software-factory/reference/apps/server/src/modules/ai/ai.module.ts:35'},
  {id:'AI-ENV-09',status:'observed',finding:'101 node bundle SHA256 与本仓库 package bundle 相同；固定验证 wrapper SHA256 为 249b7757b0887d594dcebd6dd92af76a83b9f70b31a03ce28baf1b1e5ff574fd。资源盘可用约 188.7 GB、MemAvailable 约 29.2 GB，是瞬时读数。',source:inventoryPath}
 ],
 routingBoundaries:[
  {boundary:'112 贾维斯平台 Pi SDK',owner:'平台模型配置',executor:'local-pi-sdk',finding:'与101 Claude和软件工厂内部路由独立；本评估没有调用该模型或改配置。'},
  {boundary:'101 外层 Claude 开发执行器',owner:'superopen 原生 Claude 设置和 cc-switch',executor:'msf-101-claude',finding:'中央模板、节点同意和签名租约决定是否执行；原生 CLI 设置决定网关/模型。模板 hash 不包括外部模型设置。'},
  {boundary:'101 软件工厂产品内部 Pi SDK',owner:'软件工厂 ai_models/routes 及 MSF_AI_PROVIDER',executor:'PiAiGateway/MockAiProvider',finding:'按用途 six routes；与外层 Claude 续接、预算、用量不同，分别记录。'}
 ],
 recoverySemantics:[
  {trigger:'正常结束且原生 JSON needs_more_work=false',behavior:'执行固定独立验证；结果回到 validating，保留 executor-observed-not-human-accepted；不自动完成/交付。',source:'apps/api/src/runtime/agent-runner.ts:54-65;execution-runtime.ts:161'},
  {trigger:'正常结束但仍需继续或固定验证失败',behavior:'同一原生 sessionId 精确 --resume；验证 repair=true 可附实际验证反馈续轮；须全局监督、金额、Token、轮次均允许。',source:'apps/api/src/runtime/agent-runner.ts:47-65;cli-supervision.ts:16-34'},
  {trigger:'quota/429 或已识别 network/5xx',behavior:'仅在失败回执明确分类、计价可算或 subscription、恢复次数/预算/Token允许时生成 waitingQuota/retryAt；global supervised=true 才由调度继续。quota 可用 fallback 时切换，当前没有fallback。',source:'apps/api/src/runtime/execution-runtime.ts:111-120,165-181'},
  {trigger:'authentication/permission/unknown、超时、round-limit 或缺费用',behavior:'身份/权限转 waitingUser；unknown失败、超时和轮次边界不会自动反复跑；缺费用 awaiting-cost→waitingUser。应保留错误并确定实际改变后人工/管理者安排继续。',source:'apps/api/src/runtime/execution-runtime.ts:161,179-180'},
  {trigger:'人工 pause/cancel 或直接停止 run',behavior:'pause/cancel 标记业务与run，心跳 stopRunIds 让本机 abort，进程树被停止；paused 可以 resume 新run且绑定当前任务session；cancelled 不会自动恢复。',source:'apps/api/src/runtime/execution-runtime.ts:130-140,162;agent-runner.ts:82,90-98'},
  {trigger:'节点断网/进程崩溃/101失电',behavior:'节点请求/心跳失败会 abort 子任务；独立 parent watcher 处理 agent 崩溃；systemd on-failure 10秒后重启节点服务。中央 lease 过期置 interrupted/paused 并明确 automaticRetry=false；服务重启不会自动重复该任务。',source:'apps/api/src/runtime/agent-supervisor.ts;agent-runner.ts:90-98;execution-runtime.ts:163'}
 ],
 gaps:[
  {id:'READINESS-P1-01',priority:'P1',finding:'节点 final result 无持久化本地 outbox；请求拒绝/响应丢失后缺显式重送或签名最终回执去重协议。服务崩溃也会丢本机进行中 session/checkpoint，中央可能只剩 interrupted。',verifiedBy:'static source review, not injected on real101',recommendation:'先落盘冻结回执/运行身份/checkpoint，再发送；独立 receiptId/hash 去重与查询确认；失联恢复先对账再决定重新执行。'},
  {id:'READINESS-P1-02',priority:'P1',finding:'logs 批次先 splice，POST失败会 abort 并不重排；缓冲上限1000条、中央每run只保留最近5000条，因此不能声称所有异常/所有进度永久无损。',verifiedBy:'agent-runner.ts:90,94;execution-runtime.ts:101-102',recommendation:'本地有界持久日志段与按序回执、补传和归档；保留摘要、完整报告指纹及丢弃计数，密钥内容脱敏。'},
  {id:'READINESS-P1-03',priority:'P1',finding:'停止后或崩溃未获原生最终回执时，sessionId和累计费用检查点可能未到中央；当前精确session恢复安全规则有效，但检查点并非每轮持久。',verifiedBy:'agent-runner.ts:41,50-52,95;execution-runtime.ts:107-110,138',recommendation:'每轮完整回执后落盘并发送checkpoint；崩溃后只用本任务经核验的session并复核工作目录/差异，不用 --last/--continue。'},
  {id:'READINESS-P1-04',priority:'P1',finding:'没有已验证备用执行器/模型；cc-switch自动failover关闭。不能把quota等待当作一定能切换到另一个模型。',verifiedBy:inventoryPath,recommendation:'如需切换，先注册明确同工作根目录的备用模板，验证其认证、能力、价格及token限制；记录从/到模型和可恢复状态。不要本轮临时自动开启全局监督。'},
  {id:'READINESS-P1-05',priority:'P1',finding:'软件工厂内部活动模型price_table为空，Pi buildModel默认为0金额；当前provider也可能mock。内部0费用不是免费证据。',verifiedBy:'inventory API metadata;pi-gateway.ts:48-72;ai.module.ts:35',recommendation:'真实模型联调前核验effective provider、网关和供应商计价；unknown保持unknown，与外层Claude总账分开归因。'},
  {id:'READINESS-P2-01',priority:'P2',finding:'暂无按产物变化判断的无进展 watchdog；lastActivity取最后日志/updatedAt，主边界为单轮超时。日志不停不代表有工作成果。',verifiedBy:'execution-runtime.ts:110;agent-runner.ts:34-37',recommendation:'增加阶段检查点/产物hash/有效事件时间及有限无进展处理；先标阻塞、保存诊断，不盲目重启服务器。'},
  {id:'READINESS-P2-02',priority:'P2',finding:'原生模型路由归属未冻结到每run：中央模板hash一致不证明Claude设置、cc-switch provider/模型也相同。',verifiedBy:'execution-runtime.ts:138,152;agent-runner.ts:90',recommendation:'记录每run脱敏endpoint origin、effective model、provider/profile版本、CLI/bundle指纹；配置改变需明确新的续接边界。'},
  {id:'READINESS-P2-03',priority:'P2',finding:'Token边界按完整轮次回执检查，单轮可能超阈值；金额也由native估算影响，不等同供应商强制账单封顶。',verifiedBy:'agent-runner.ts:44-52,63',recommendation:'明确软边界与CLI硬边界，限制响应/单轮额度；供应商侧预算另设并如实记录估算/未知。'},
  {id:'READINESS-P2-04',priority:'P2',finding:'租约/签名依赖30秒时钟窗；GET listRuns限制200，历史计量/停止应使用精确run或完整队列事实，避免截断看起来无活动。',verifiedBy:'execution-runtime.ts:86,100,107',recommendation:'预检时间同步、磁盘/内存、独立运行/测试目录和完整活动队列；不得把默认分页返回当全量事实。'}
 ],
 testMatrix:[
  {id:'SUP-01',method:'read-only live101',case:'实际服务身份/模板/签名/版本/资源/备用路由/内部provider',state:'inventory-observed-provider-runtime-needs-confirmation'},
  {id:'SUP-02',method:'isolated fixture first',case:'单轮真实原生回执→固定验证→validating，不自动accept',state:'recommended-not-run-by-this-audit'},
  {id:'SUP-03',method:'isolated native-format fixture',case:'验证失败→同session续接→新产物/真实测试→通过，费用累计仅计增量',state:'recommended-not-run-by-this-audit'},
  {id:'SUP-04',method:'isolated fixture; never force real quota',case:'429 quota，3次/900秒边界、同目标重试，无fallback时不假装切换',state:'recommended-not-run-by-this-audit'},
  {id:'SUP-05',method:'isolated configured fallback fixture',case:'后备授权/在线/目录/预算检查，跨engine清session、handoff保留',state:'recommended-not-run-by-this-audit'},
  {id:'SUP-06',method:'isolated fixture',case:'401/403/未知错不自动无限重试；提示具体原因与已尝试',state:'recommended-not-run-by-this-audit'},
  {id:'SUP-07',method:'isolated fake central network',case:'logs失败/心跳断网/112重启导致lease过期→杀进程树、paused/interrupted，不重放副作用',state:'recommended-not-run-by-this-audit'},
  {id:'SUP-08',method:'isolated childprocess/agent',case:'agent崩溃/OOM、子孙进程残留、on-failure重启但不盲目重跑任务',state:'recommended-not-run-by-this-audit'},
  {id:'SUP-09',method:'isolated transport fixture',case:'中央已接受result但响应丢失、本机未被接受result、重复/晚到回执/过期lease',state:'recommended-not-run-by-this-audit'},
  {id:'SUP-10',method:'isolated fixture',case:'人工pause/resume、cancel和急停真实子进程停止，resume只恢复本任务session',state:'recommended-not-run-by-this-audit'},
  {id:'SUP-11',method:'isolated fixture',case:'预算/Token/轮次/截止期/缺费用均停止续轮，部分Token仍入账',state:'recommended-not-run-by-this-audit'},
  {id:'SUP-12',method:'isolated fixture',case:'源码身份改变/任务取消/权限撤销/模板变更/依赖未验收/同项目双写保护',state:'recommended-not-run-by-this-audit'},
  {id:'SUP-13',method:'isolated fixture with public fake values',case:'日志溢出/旋转/磁盘写失败/敏感信息脱敏/异常与进度可追溯',state:'recommended-not-run-by-this-audit'},
  {id:'SUP-14',method:'isolated receipts and ledger',case:'controlled+observer先后顺序/多轮partial/同源冲突/归因/未知价格，无重复累计',state:'recommended-not-run-by-this-audit'},
  {id:'SUP-15',method:'isolated fixture',case:'静默挂起与持续无意义日志，超时停止、固定证据出口，完成声明无产物不accept',state:'recommended-not-run-by-this-audit'},
  {id:'SUP-16',method:'isolated full product environment',case:'postgreSQL/Redis/MinIO/TestProject与原业务分离、模型功能禁止意外外呼，测试完报告绑定冻结候选',state:'recommended-not-run-by-this-audit'}
 ],
 pending:['本评估不代表任何故障注入/完整测试通过；root本轮另行取得实际证据。','软件工厂内部effective provider需要确认，真实模型用途/价格/fallback联调尚未进行。','全局监督开关仍关闭，不为单次有边界测试擅自开启所有历史任务。','测试/模型费用与真实异常范围应进入本轮任务、公开报告和追加建设记录，由主代理统一维护。']
};
await writeFile('artifacts/software-factory/full-test/ai-readiness-assessment.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({written:'artifacts/software-factory/full-test/ai-readiness-assessment.json',confirmed:report.confirmed.length,gaps:report.gaps.length,recommendedCases:report.testMatrix.length,modelCalls:0,remoteTestsRun:false}));
