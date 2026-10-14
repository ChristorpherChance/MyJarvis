# 贾维斯域名与FRP接入

**统一入口：[打开贾维斯](https://cc-jarvis.ikvein.com/?mode=platform)。** 已部署到现有广州网关，通过独立FRP通道连接112主平台。

## 1. 如何访问

| 用途 | 地址 |
| --- | --- |
| 电脑、手机管理 | https://cc-jarvis.ikvein.com/?mode=platform |
| 语音对话 | https://cc-jarvis.ikvein.com/?mode=platform#theme=stark&view=chat |
| 设备与运行项目 | https://cc-jarvis.ikvein.com/?mode=platform#theme=stark&view=services |
| 家庭局域网备用入口 | https://192.168.10.112:3140/?mode=platform |

新域名使用原平台的管理员密码；浏览器首次访问需要重新登录，语音使用时允许该域名访问麦克风。家庭成员与房间继续使用各自认证和配对流程。更换访问地址不会新建业务库、重置密码或迁移聊天记录。

新域名提供有效的公网HTTPS证书，浏览器可以申请麦克风权限。登录、语音录音、实时消息、项目管理共用这一入口；房间终端可直接打开浏览器访问。局域网备用入口仍使用原有家庭CA，需要终端信任该CA。

## 2. 实际连接方式

访问链路：浏览器HTTPS → 广州Nginx → 广州FRPS → 112独立FRPC → 112贾维斯。

| 环节 | 实际部署 |
| --- | --- |
| 域名 | cc-jarvis.ikvein.com，现有泛域名DNS解析到8.163.127.192 |
| HTTPS入口 | 广州Nginx，复用现有443端口与ikvein.com通配证书；HTTP自动跳转HTTPS |
| FRP网关 | 广州现有FRPS 0.69.1，连接端口7000，HTTP路由端口18080 |
| 域名路由 | 沿用subdomainHost=ikvein.com，新代理使用subdomain=cc-jarvis |
| 主节点通道 | 112的jarvis-frpc.service，随平台重启，并在异常退出后自动重连 |
| 本机平台 | 官方http2https插件连接112的127.0.0.1:3140 HTTPS服务 |
| 冷备通道 | 101预置同一域名配置，服务禁用且停止；主角色校验阻止冷备直接启动 |

112直接连接广州网关，通道独立于116。116现有FRPC、项目映射和配置保留，各项目仍按原域名访问。家庭路由器无需新增入站端口映射。

新入口关闭响应缓冲，保留长连接、流式消息与上传转发。代理允许64MiB请求，后台原有语音25MiB、书籍32MiB等上传限制继续生效。

## 3. 登录和连接权限

公网入口沿用已有管理员及家庭身份认证。未登录请求运行项目接口返回401，跨站写入请求拒绝；平台域名被加入精确允许列表。

FRP客户端使用独立jarvis-ingress系统账号，无sudo权限、无平台数据读取权限。客户端配置由root持有、权限0640；广州站点配置含自动代理口令，由root持有、权限0600。FRP口令仅在维护进程内存与服务器私有配置中传递，不写入本地报告、网页或截图。

广州Nginx自动携带独立入口口令，直接访问FRPS域名路由但不携带该口令会返回401。用户继续使用贾维斯自己的登录界面。

公网浏览器验证正式HTTPS证书，FRPC到FRPS启用TLS。本机http2https插件按官方实现连接回环地址并跳过本机自签名证书验证；目标固定为127.0.0.1，不连接其他主机。实现依据：[FRP客户端插件](https://gofrp.org/en/docs/reference/client-plugin/)、[0.69.1插件源码](https://raw.githubusercontent.com/fatedier/frp/v0.69.1/pkg/plugin/client/http2https.go)。

证书沿用现有广州网关维护流程，本次核对有效期至2026-11-11；证书私钥保留在原服务器。

## 4. 主备接管范围

112当前承担生产业务，域名通道已启用并运行。101业务和域名通道都保持停止，观察服务继续运行。

101将来接管时，可以沿用同一域名。接管前仍需完成旧主隔离、同批数据恢复、主角色提升与业务验收，再启用其域名通道；同一时间只能由一个节点提供该域名。当前数据持续复制和自动故障切换仍待实现，预置通道不代表已完成自动接管。

正常家庭网络下可使用域名统一访问；广州网关或家庭外网连接中断时，家中可改用112局域网备用地址。

## 5. 平台管理与验收

“运行服务 → 运行项目”中的贾维斯已登记新访问、登录和健康检查地址，主、备项目各关联自己的FRP服务。设备卡片继续展示实际机器地址，公网项目域名展示在运行项目中。

当前为5台监管服务器、30项服务、13个运行项目。两项新增服务分别为112运行的域名通道、101停止的冷备通道；冷备停止属于预期状态。

域名浏览器8项检查通过：有效HTTPS与正确主节点、已有账号和匿名访问拦截、真实项目页面、登录与跨站校验、语音请求转发、浏览器麦克风安全上下文、真实流式消息及心跳、手机布局。麦克风使用测试设备验证浏览器权限链路，实体房间拾音与唤醒仍需现场验证；未创建测试语音会话、未调用付费模型。

管理页面14项检查再次通过，涵盖30项服务分页、五台服务器筛选、冷备状态、实际资源、十套主题和手机布局。另核对独立通道权限、冷备启动保护、局域网备用入口、现有116项目及网关原站点。正式应用代码版本仍为20261007-application-console。

[域名验收报告](../artifacts/domain-access/report.json) · [浏览器检查](../artifacts/domain-access/ui/report.json) · [管理页面检查](../artifacts/managed-servers/ui/report.json) · [项目地址登记](../artifacts/domain-access/metadata-updated.json) · [部署记录](../artifacts/domain-access/deployment.json)

## 6. 维护与复现

| 文件 | 用途 |
| --- | --- |
| scripts/deploy-jarvis-domain.mjs | 使用已有固定SSH连接，校验FRPC二进制，部署112/101及广州入口；支持重复执行 |
| scripts/install-jarvis-frpc.py | 独立账号、配置校验、原子更新、主角色保护与systemd服务 |
| scripts/install-jarvis-nginx.py | 新站点私有配置、语法检查、失败还原及Nginx重载 |
| scripts/register-jarvis-domain.mjs | 更新已有项目的公开管理信息，保留已保存凭据 |
| scripts/qa-jarvis-domain.cjs | 域名浏览器验证 |
| scripts/verify-jarvis-domain.mjs | 真实入口、权限、监管和原项目复查 |

112/101私有配置位于/etc/jarvis-frpc，广州站点位于/etc/nginx/sites-available/cc-jarvis.ikvein.com。原配置备份保存在节点/var/lib/jarvis-control/pre-domain-access及广州/var/backups/jarvis-domain-access，仅管理员读取。维护时检查jarvis-platform、jarvis-frpc、广州Nginx和FRPS状态，再定位对应环节。

复现脚本依赖已授权的服务器连接与现有FRP网关配置，不是新服务器初始化工具。主备角色调整继续按[Linux主备部署与验收](Linux主备部署与验收.md)及[主备方案](多节点主备与故障接替方案.md)执行。
