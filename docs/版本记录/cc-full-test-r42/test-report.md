# 101 cc 软件工厂测试回传简报

本次测试已结束，报告已收回。**完整回归未通过，完整矩阵尚未全部执行。**

| 测试组 | 总项 | 通过 | 失败 | 跳过 |
|---|---:|---:|---:|---:|
| shared | 15 | 15 | 0 | 0 |
| server | 414 | 412 | 1 | 1 |
| web | 3 | 3 | 0 | 0 |
| 合计 | 432 | 430 | 1 | 1 |

构建、类型检查、lint、依赖方向和错误码检查通过。101缺pnpm，运行的是已安装依赖的各叶子脚本；未冒根递归脚本包装器实测。

## 主要问题

- 文件存储直链测试在 storage.service.test.ts:68 失败，实际对象键编码与断言不符；尚未判定应修实现还是测试期望。
- 两项补充材料检查出现 api.read is not a function，未进入有效业务断言。
- 前端覆盖率依赖缺失；后端失败运行未产生覆盖率原报告。
- 主原型矩阵30组中，2组纯逻辑的27个断言通过；其余28组受历史资产或浏览器依赖阻塞，没有执行浏览器断言。
- 补充19组全部未通过前置；17组仅缺依赖、1组缺依赖且有api.read错误、1组仅有api.read错误，不能累加为20组。
- Docker沙箱只有跳过占位，6个具体用例未执行。真实页面、真实登录、重启持久化和真实业务AI流程尚未验证。

## 我核对了什么

收回两份完整报告及237个核心命令/日志文件；独立复算74条命令的222个日志引用和3份测试JSON。cc报告列出的1672件全部产物未全部下载复核，不用模型自述签全部产物。
原主目录与独立测试副本各617个源文件重新读取，内容均未变；本轮3容器、1网络、3匿名卷当前均已不存在。没有修改业务代码、部署112或恢复十分钟跟进。

## 执行状态和费用

101原生cc单轮执行结束，平台状态为 round-limit/blocked，进程退出码0并不代表测试通过。报告如实要求继续工作，旧固定路径后置验证器未调用。
执行节点上报：输入3,103,505 Token（其中缓存读取3,014,016）、输出21,119，总计3,124,624。目录价估算3.408248美元，尚未核对供应商账单；内部Codex用量与金额未知，未写0。业务AI验收仍未完成。

后续应先处理存储断言与实现差异、两项材料检查工具错误，再补浏览器、覆盖率及独立沙箱环境。原74目标签收保持0/74。

## 逐命令结果

下表包含测试、环境和采集辅助命令；退出非零不等于同数业务用例失败。

| 检查 | 退出码 | 超时 |
|---|---:|---|
| environment | 0 | 否 |
| isolation-capability | 0 | 否 |
| resource-create | 0 | 否 |
| resource-readiness | 0 | 否 |
| shared-build | 0 | 否 |
| shared-tests | 0 | 否 |
| lint | 0 | 否 |
| error-codes | 0 | 否 |
| server-build | 0 | 否 |
| web-tests | 1 | 否 |
| dependencies | 0 | 否 |
| shared-typecheck | 0 | 否 |
| migrate | 0 | 否 |
| web-build | 0 | 否 |
| test-isolation-preflight | 0 | 否 |
| server-tests | 1 | 否 |
| web-script-tests | 0 | 否 |
| server-typecheck | 0 | 否 |
| web-typecheck | 0 | 否 |
| prototype-tests | 1 | 否 |
| prototype-logic | 0 | 否 |
| prototype-task-data | 1 | 否 |
| prototype-design-catalog | 1 | 否 |
| prototype-customer-prototype | 1 | 否 |
| prototype-customer-authority-boundary | 1 | 否 |
| prototype-customer-state-kernel | 0 | 否 |
| prototype-customer-route-matrix | 1 | 否 |
| prototype-customer-privacy-projection | 1 | 否 |
| prototype-prototype-commands | 1 | 否 |
| prototype-prototype-effects-integration | 1 | 否 |
| prototype-design-baseline | 1 | 否 |
| prototype-design-boundary | 1 | 否 |
| prototype-prototype-content | 1 | 否 |
| prototype-ui-scoring | 1 | 否 |
| prototype-selftest | 1 | 否 |
| prototype-selftest-boundary | 1 | 否 |
| prototype-build-artifact | 1 | 否 |
| prototype-merge-basis | 1 | 否 |
| prototype-contract-hardening | 1 | 否 |
| prototype-main-integration-boundary | 1 | 否 |
| prototype-attention-auto | 1 | 否 |
| prototype-autopilot-boundary | 1 | 否 |
| prototype-review-cases | 1 | 否 |
| prototype-boundary | 1 | 否 |
| prototype-failure-matrix | 1 | 否 |
| prototype-workflow | 1 | 否 |
| prototype-regression | 1 | 否 |
| prototype-visual | 1 | 否 |
| prototype-design-visual | 1 | 否 |
| coverage-and-runtime-evidence | 1 | 否 |
| persistence-snapshot | 0 | 否 |
| synthetic-state-inventory | 0 | 否 |
| resource-cleanup | 0 | 否 |
| source-after | 0 | 否 |
| supplemental-acceptance-defects | 1 | 否 |
| supplemental-acceptance-intake | 1 | 否 |
| supplemental-acceptance-plan | 1 | 否 |
| supplemental-acceptance-report | 1 | 否 |
| supplemental-acceptance-rework-probe | 1 | 否 |
| supplemental-material-actions | 1 | 否 |
| supplemental-material-boundary | 1 | 否 |
| supplemental-material-bulk | 1 | 否 |
| supplemental-material-folders | 1 | 否 |
| supplemental-material-polish | 1 | 否 |
| supplemental-material-reading | 1 | 否 |
| supplemental-material-release | 1 | 否 |
| supplemental-material-zip | 1 | 否 |
| supplemental-preview-continuity | 1 | 否 |
| supplemental-prototype-history | 1 | 否 |
| supplemental-user-journey | 1 | 否 |
| supplemental-resume-selftest | 1 | 否 |
| supplemental-acceptance-visual | 1 | 否 |
| supplemental-capture-design-before | 1 | 否 |
| final-verification | 0 | 否 |

详细时间、原日志指纹和验证边界见同目录 [test-results.json](test-results.json)。
