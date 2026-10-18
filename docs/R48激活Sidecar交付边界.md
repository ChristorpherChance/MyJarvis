# R48 activate-only sidecar · 源码候选，未部署

应用基线为6d8504fab6c727550ba409425c8ef0bffc68a738；旧R48r2 ZIP e0495dc61b879d89c1a09b388c57de01e7d7c54d7291f0f3c1d4cd84704dac40未变。ops提交与应用ZIP来源分列，不重stage/install/打包或应用types/build。新增工具scripts/capture-activate-sidecar.py仅供Root独审后显式执行；本轮未部署、未运行服务/恢复工具、未访问真实数据库或探测模型。

## 固定合同

Root提供新UUID、私有0600完整输入JSON及其SHA256；仅接受node、release、expectedCurrent、sourceCommit、archiveSHA256、manifestSHA256、installSHA256、configSHA256、managedPath、recoveryPath十键。前五身份冻结112/R48r2/原R48/原APP/旧ZIP；其余必须Root真实读回pin。输入文件须Root普通文件无链接、路径祖先安全；新control是原activation lock下独占新UUID目录0700，operation.json写全输入，旧UUID不续做。原capture-upgrade目录、partial/回执/once不读取复用。

同一monotonic总900秒，normal650，rollback使用总界余量至少预留250；snapshot cap300、isolated restore cap360，取cap与剩余扣后续启动/health/本child8秒收尾余量的min。预算不足不派child/不切换；stop已请求即按可能生效处理，失败回原config/slot并核旧health，不恢复live data。停前metadata全树只读合计与已观察4,449,810,934B取大值，空间门2倍加1GiB，最少9,973,363,692B，不删历史腾空间。

完整manifest verifier复用原冻结38d157工具的common源码；完整snapshot和isolated restore调用冻结1f74cb恢复工具，不改其全树指纹或SQLite完整检查，没有10库上限。两成功才切候选。候选manifest、archive marker、安装回执、lockfile、原config与role/current/old health/drain均核。无自动重试和模型调用。

每调用前WX/fsync intent含elapsed/remaining/selectedTimeout。child stdout/stderr从启动写0600私件，完整H/bytes、退出/timeout/时长另记；只terminate/kill自己Popen并有界wait，无法确认结束时拒绝回退且明示需要Root处理，绝不扫杀其它PID。首错误先持久化，回退结果独立文件，失败不改绿。raw异常仅私文件，公开只固定enum/H/bytes与安全结构；没有导出配置/秘密。

## 后继P1修复：readiness及最终绑定（仍未部署）

接续ops a37b57d，仅修sidecar与新相邻纯fixture。正常启动及rollback启动后各最多20次完整HEALTH探测，未就绪间隔1秒；所有探测、wait和自己的child收尾仍共用原normal650/total900预算，不重新起钟，不重试operation/stop/switch/backup/restore。probe/wait逐次唯一名称，避免WX冲突。初始非零退出/timeout但child已结束仅保观察原件，不提前污染first-error；子进程未结束、预算不足或20次耗尽才终态失败，原首错保留。健康条件保role/config/current、双服务active、observer build/businessHealthy及API build/status，未缩成进程检查。

成功和失败均新增完整activation/activation-failed私有0600回执及相同安全公开结构：operation/node/release/prior/sourceCommit(APP)/archive/manifest/install/input/self/recovery H，实际观测候选指纹另列，snapshot/restore安全响应、正常health或rollback health、原first-error、独立rollback结果及本次私日志完整H/bytes索引。缺执行结果为null，不填新health；不输出原配置、原stdout/stderr或provider文本。self H读实际执行文件，input H为校验后原输入字节；新ops来源不冒旧APP或ZIP提交。

只运行新增两项隔离fixture（各normal/rollback子场景）：先未ready后成功不造首错；截止耗尽不新增窗口且保旧首错；成功/失败最终回执原日志指纹与self/recovery/input绑定可重算。控制语法一次通过。旧两fixture原日志保持，未重跑；未执行activate、recovery、systemctl、真实DB、应用types/build或打包。Root仍须审源码/完整回执安全性和实机时序，候选尚无部署资格。

## 实际验证和未验证（前一ops历史）

两项纯隔离fixture使用fake clock/runner、临时目录及假Popen，覆盖首错＋回退双错仍保首错、原stdout/stderr完整H、预算动态timeout、terminate/kill/wait只管自己child及同UUID拒绝。首轮及最窄收尾修正后最终两项均通过，语法AST通过。没有实机超时/服务/恢复/部署资格，不能据fixture或进程exit0冒独验。

主管提供的旧activate exit1/323秒、snapshot非None、manifest声明64文件/59目录/10库、restored-check存在仅为历史输入；本副本未取得旧异常原件。原因仍未知，不断言timeout、restore完成或应用损坏。旧失败/费用/任务不改。Root后续独审及新UUID操作仍planned，不直接用旧操作重跑。
