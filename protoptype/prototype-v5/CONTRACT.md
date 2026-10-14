# V5 单文件原型协作约定

最终交付为新的「贾维斯V5.0 · 高保真交互原型.html」，保留 V4 原型。根代理用构建脚本将 V4 可复用基础、V5 样式和三个领域模块内联，离线可运行。

## 共享运行时

领域脚本用 IIFE，避免全局重复声明。运行在 V4 的最后 render() 之前。根代理先定义全局 J5：

- J5.routes[route] = () => HTML 注册视图。
- J5.actions[action] = {admin: boolean, run(id, element) {}} 注册按钮。所有新操作名用 v5-，模块前缀防冲突。
- J5.forms[name] = {admin: boolean, run(formDataObject, id, form) {}} 注册提交；表单 data-form 与 name 一致。
- J5.overlays[key] = id => { modal(...) 或 drawer(...) }。J5.open(key,id) 将 U.overlay={type:'v5',key,id} 并渲染。
- J5.initializers.push(v => {...}) 初始化扩展状态。J5.state() 随时返回 S.v5，不要闭包缓存旧 S 状态。
- J5.commit(message) 调用 persist、render、toast。纯 UI 状态可放 U。
- J5.navigate(route) 调用统一 navigate。J5 视图会纳入全局权限检查。
- J5.boards[domain] = {title, subtitle, render(){ return HTML }}，登记自己的领域大屏内层（根代理统一添加大屏壳）。

已有可用函数：E 转义，I(icon,size) SVG，B(label,act,id,classes,icon) 按钮，badge(text,color)，progress(value,color)，pageHead，modal(title,body,footer,wide)，drawer，closeOverlay，formStart(name,id)，formEnd，field(label,name,value,type,extra)，selectField，formFooter(label,name)，now，record，download，speak。全局 S、U、P()、admin()。S.profile 为 me/wife/son/dad/mom。S.machines、projects、tasks、knowledge、learning、preferences 可读。管理按钮处理应声明 admin:true。成员切换已有 switch-profile 操作，根代理再隔离上下文。

## 样式与产品方向

管理端清晰紧凑，深蓝侧栏、青色/蓝色点缀，白色正式信息面板。家庭对话和所有大屏采用科技感深色，语音球、波形、空间层次，避免堆砌霓虹和低对比文字。新领域 CSS 用 kv5- / vm5- / rd5- 前缀，完全内联，没有 CDN 或联网请求。

375px 可用，按钮有文字或 aria-label，图表 SVG 需 viewBox。保留状态反馈、空状态、取消。所有种子内容标为模拟，不声称真实 OCR、实时网络监控或 LLM。可用浏览器系统朗读；语音输入至少有无麦克风也能完成的演示方式。原型只模拟任何外部写入。

家庭大多数场景用语音；管理员可以使用桌面/手机。个人档案、声音/唤醒词不等于认证。所有相关模拟流程必须有状态变化，详情、表单、选择、审核/拒绝等。
