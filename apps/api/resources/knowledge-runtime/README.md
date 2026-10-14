# 知识后台执行器

本地默认采用 PyMuPDF 1.26.7 + RapidOCR ONNX 1.4.4，CPU 推理，默认每个 ONNX 会话两条线程，OpenCV、BLAS、OMP同步受限；`JARVIS_KNOWLEDGE_CPU_THREADS=1/2` 可调小，知识队列始终并发1。RapidOCR 官方 14.9MB wheel 内含中英轻量模型，不在第一次解析时自动下载大型模型。Tesseract CLI 和 `jarvis-ocr-v1` HTTP 服务为可选适配器。

## 安装与集成

把 `requirements.txt` 安装到项目隔离 Python 3.10–3.12 环境。Node 24 平台注册：

```ts
const knowledge = new KnowledgeRuntime(repository, pi, {
  uploadsDirectory: join(dataDir, 'knowledge-uploads'),
  workDirectory: join(dataDir, 'knowledge-runtime'),
  pythonExecutable: configuredVenvPython,
  stopped: emergencyStopped,
  member: currentMemberResolver,
});
knowledge.start();
registerKnowledgeRuntime(app, knowledge, { authenticated: cookie => store.validateLogin(cookie) });
// Every registered knowledge command attempts the asynchronous dispatcher first.
const receipt = await knowledge.dispatch(domain, command, envelope, actorId);
// undefined means delegate to the existing synchronous domain handler.
// Existing source record reads and command receipts pass through sanitizeRead.
// Pi business knowledge callbacks include authorizedKnowledgeEntries(actorId, scope).
// preClose: await knowledge.close(), then close the database.
```

`GET /api/v1/knowledge/runtime` 返回实际依赖健康、配置及 `configurationRevision`。配置提交使用管理员 `personal` 范围；不是通过同名家庭配置覆盖全局设置。

## 真实执行闭环

- `books.advance` / `books.parse`：原件 SHA256、实际大小验证 → 两至四轮提取 → 原文页、坐标、置信、轮次文本指纹 → 识别疑点 → 人工逐字复核 → 原版本发布。原册最多 10000 页，每批最多配置 `maxPages`（上限 200）。可传 `startPage/endPage`，省略时从首个缺页开始；实际总页数不符、漏页或重编号都会失败。
- 分段追加保留批次外页文、疑点、人工复核。所选范围包含人工转录或已审核页时禁止机器覆盖；`replaceManual: true` 仅允许明确替换本批未审核机器候选。分批完成不会提前发布，全册仍需要完整页序和逐页人工证明。原件最大 32MiB；整册正文最大 1200 万字符，超限请按分册整理。
- PDF 第一轮保留可用的内嵌文字，后续轮次从实际渲染图做识别；扫描图片各轮使用不同渲染尺寸及检测阈值。相同结果不等于零错误，机器结果不会自行发布。
- 空白／仅插图页不能由 OCR 自行豁免。管理员通过 `books.page/revision` 明确 `nonTextPage/nonTextKind/nonTextConfirmed`，提交空正文 SHA256 和当前原件 SHA256；说明保存在独立 `pageDescription`，不插入原文。每页仍需独立人工复核、疑点裁决，所有真实页码必须保留。
- 机器结果默认 `pagesVerified: false`。`books.review-page` 需要明确 `pagesVerified: true` 和逐页复核依据，或先通过实际人工 `books.page` 确认页序与完整转录。
- `sources.sync`：仅同步管理员允许的绝对目录，或准确 HTTP origin。目录支持 UTF-8 `txt/md/json/html`；JSON 支持 `[{title,text}]` 或 `{documents:[{title,text}]}`。单轮有超时、字节、文档、目录层数上限，跳过符号链接，不跟随 HTTP 重定向。
- `local://...` 是平台内书籍原文来源；同步会从当前已发布记录重建索引，不把逻辑 URI 当作电脑路径扫描，也不重复召回同一页。
- `sources.query`：`local` 检索已发布原文与已同步文档；`live/all` 可请求当前授权的实时／混合来源。每条结果有真实引用位置、正文 SHA256 与原句。
- `stories.index/refresh/gaps`、`learning.plan`：Pi SDK 独立受控会话，没有业务执行工具或自动重试。所有原句必须存在于当前已发布页和给定快照，失败的引用不入库。生成故事、缺口、课程均为待审候选。
- `knowledge/executions/accept-course`：管理员明确确认并绑定已经审核的实际故事，才创建启用课程。生成候选不等于替家庭成员报名。
- `GET knowledge/executions` 和 `POST knowledge/executions/cancel`：查看真实排队／运行／结束状态并取消。重启中的任务标记中断，不自动重复运行。执行途中撤权、更新原文或更换来源配置会中止，迟到结果不会覆盖新记录。

目录／HTTP 资料还未经过原文逐页校对时，在 Pi 输入中标为 `external-source-unreviewed`；不会冒充经过人工审核的经典原文。撤权后，检索、旧查询展示与模型资料回调立即过滤该来源。

## HTTP OCR 协议

引擎接收 JSON `POST`：

```json
{"protocol":"jarvis-ocr-v1","mime":"application/pdf","sha256":"原件指纹","fileBase64":"真实原件","round":1,"language":"chi_sim+eng","maxPages":200,"startPage":301,"endPage":301}
```

返回请求范围的完整原件绝对页序，`pageCount` 是原册总页数。置信为 `0..1` 或 `null`，可带原图像素／文档坐标：

```json
{"pageCount":1000,"pages":[{"page":301,"text":"实际识别正文","engine":"引擎版本","blocks":[{"text":"文字","confidence":0.87,"box":[1,2,10,12],"coordinateSystem":"engine-pixels"}],"warnings":[]}]}
```

错误、缺页、重复页码、非数字置信、过长正文、超时、重定向和超限响应不会产生成功回执。HTTP 引擎地址必须属于明确配置的允许 origin；不接受 URL 内嵌凭据。

官方依赖说明：[PyMuPDF](https://pymupdf.readthedocs.io/en/latest/page.html)、[RapidOCR 1.4.4](https://pypi.org/project/rapidocr-onnxruntime/1.4.4/)、[Tesseract CLI](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html)。
