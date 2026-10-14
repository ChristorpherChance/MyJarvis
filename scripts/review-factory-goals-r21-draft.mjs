import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const paths=['docs/软件工厂Agent迭代与全自动交付方案.md','docs/软件工厂端到端目标与验收标准.md'];
const texts=await Promise.all(paths.map(async path=>({path,text:await readFile(path,'utf8')})));
const locate=(file,needle)=>{const x=texts.find(x=>x.path===paths[file]);const n=x.text.split(/\r?\n/).findIndex(x=>x.includes(needle));return {path:x.path,startLine:n+1,paragraph:needle};};
const issues=[
 {id:'DRAFT-R21-01',priority:'required',topic:'定义版本要实际注入执行器，不止登记',location:locate(0,'## 4. 每个 Agent 都有可执行契约'),finding:'契约记录实际生效版本，但仍没有明确配置解析、内容注入、执行器验证及运行回执的闭环。',suggestion:'增加：运行前解析职责/系统提示词/技能/工具/模型路由/生成模板等实际内容与引用，形成不可变执行快照及哈希；执行器从该快照加载并回报已加载身份/哈希，缺失或不符禁止把任务算作该版本；回滚修改后续解析指针，在途锁定不偷偷改版。',reason:'避免再次出现平台 Agent 配置只展示，真实调用没有消费它的情况。'},
 {id:'DRAFT-R21-02',priority:'required',topic:'原始需求可以作为自动流水线入口',location:locate(0,'自动运行入口需要一次明确的项目配置'),finding:'入口列客户原始资料、目标和范围、验收标准等，可能被理解为客户每次须先人工制定完整范围/验收才允许启动，而这正是软件工厂要生产的内容。',suggestion:'区分平台可复用预设（技术约束/预算/工具/质量标准/目标环境引用）和客户原始输入；工厂自动建立项目、整理范围、生成验收条款、选择模板与适用输出并核对，重要业务歧义再提出澄清。正常客户不需预先手工填成完整 PRD/设计或逐阶段配置。',reason:'用户要求从客户原始需求开始全自动，不能把前置工作变成人工承担。'},
 {id:'DRAFT-R21-03',priority:'required',topic:'模板快照与客户语言格式要贯穿',location:locate(0,'## 4. 每个 Agent 都有可执行契约'),finding:'实际模板/套件内容版本、公司模板优先及冲突策略，客户语言/时区/单位/术语与格式未形成方案条款。§2未来写现状不能替代目标承接。',suggestion:'增加项目适用配置：目标语言/受众/设备、时区和单位/数字格式/术语，公司模板或套件解析结果；每次生成固定采用的条目/默认代码内容及哈希，变更走新版本；需求、原型、代码、测试、用户帮助及全部文档共同消费。',reason:'当前套件可更新删除；客户工件原PRD支持多语言但单页提示词固定中文。'},
 {id:'DRAFT-R21-04',priority:'required',topic:'客户完整交付包包含实际字节和全套统一清单',location:locate(0,'## 10. 交付必须走到客户可以使用'),finding:'表中软件有清单哈希，文档等类别分列；尚未明确成套包清单覆盖全部文档/独立页/完整原型/证据文件与实际字节，不能只有多个临时URL或 evidenceRefs。',suggestion:'增加统一交付manifest（项目/需求设计/模板与Agent/代码/构建/用例报告/发布版本），每文件类型、路径、大小、哈希和关联；完整包包含应交文档、全部独立页和整体原型、源码/软件、适用测试证据及手册；独立实际下载、哈希校验、解包和按手册运行，以同一包晋级。',reason:'当前报告导出与批准不能替代真实完整客户包。'},
 {id:'DRAFT-R21-05',priority:'required',topic:'明确产品文档适用目录和导出格式验收',location:locate(0,'| 产品文档 |'),finding:'产品文档、安装、运维分组已较完整，但数据字典/接口使用文档、第三方依赖与授权清单、培训/接管与支持反馈责任，以及图表链接和格式可读性验收还不够具体。',suggestion:'补适用文档清单及检查：API/数据字典、用户及管理员手册/引導、升级迁移/恢复、发行已知问题及依赖/授权记录；每种要求格式保存实际文件版本并核对文本、图表/链接、中文或目标语言、分页字体、浏览器与客户入口下载后可读；文档示例在同构建软件上实际照做。',reason:'轻量导出当前不代表图示/格式完整；自定义类别和文档存在不代表客户能照文档使用。'},
 {id:'DRAFT-R21-06',priority:'required',topic:'客户交付、证据包、项目逻辑备份和可恢复备份分别定义',location:locate(0,'| 运维与恢复 |'),finding:'目标文档泛称备份/恢复及交付使用，但未给这四种产物边界及客户包的内容白名单；当前逻辑备份只有表和部分对象键，需要避免误称完整恢复。',suggestion:'增加分别管理：报告决定、证据文件包、客户产品交付包、受控可恢复备份；备份有一致快照、对象字节或已验证外部恢复来源/系统依赖；客户包按应交目录只含授权产品资料，不混内部聊天、模型/提示词私密配置、凭据及其他项目数据；私密配置仅受控引用。',reason:'当前备份不可直接当离线恢复或客户可安装交付。'},
 {id:'DRAFT-R21-07',priority:'recommended',topic:'把页面上下文和跨页业务契约变为可核验项',location:locate(0,'| UI 与交互 |'),finding:'新方案已要求完整交互和上下文，但具体生成承接仍可补强，避免单页拼接/状态切换冒充完整业务旅程。',suggestion:'加入每页受控需求/设计正文和来源覆盖，所有独立页共享视觉/字段/角色/接口/跨页数据与状态契约；验收实际DOM渲染、真实点击/数据变化/异常恢复而非标记齐全；占位和未核实项阻断正式成品。',reason:'当前生成输入只有PRD节选和设计锚点名称，汇总允许占位、检查标记。'},
 {id:'DRAFT-R21-08',priority:'recommended',topic:'历史快照表标题与后续候选建议消除混淆',location:locate(1,'| 核对项 | 当前事实 |'),finding:'§10已说明R20历史，但表仍写当前事实，并在e375源码行建议“从此内容创建独立候选”，与本轮266当前候选容易混淆。',suggestion:'表列改R20观察事实；后续依据改“重新核对本轮实际最新内容并固定候选，不能直接沿用该历史快照”；保留R20证据原样。',reason:'新的目标需候选真正固定到当前受控内容，不能依旧HEAD建议选用。'},
];
const coverage=[
 ['DEL-R21-01','partial',['DRAFT-R21-02','DRAFT-R21-07'],'输入完整性在目标§8已增加；建议新方案将分块/OCR/截断疑点转为明确可执行出口。'],
 ['DEL-R21-02','partial',['DRAFT-R21-01','DRAFT-R21-03'],'模板实际快照仍缺。'],
 ['DEL-R21-03','partial',['DRAFT-R21-05'],'产品文档总体已承接，还需明确适用完整目录与实际验证。'],
 ['DEL-R21-04','partial',['DRAFT-R21-07'],'独立页/整体旅程已写，跨页一致与完整设计正文消费可补。'],
 ['DEL-R21-05','covered',[],'目标§4真实行为、方案§8检查/真实证据及§11正反例已承接；建议给原型标记检查具体不通过标准。'],
 ['DEL-R21-06','covered',[],'真实构建/合并、源码及可运行包、独立安装与使用均已承接。'],
 ['DEL-R21-07','partial',['DRAFT-R21-04'],'全套真实字节、统一manifest、独立下载校验仍需明确。'],
 ['DEL-R21-08','partial',['DRAFT-R21-06'],'可恢复备份与逻辑备份/交付类别区分需补。'],
 ['DEL-R21-09','partial',['DRAFT-R21-05'],'导出各格式内容/可读/下载验收仍缺。'],
 ['DEL-R21-10','covered',[],'实际目标使用、账号权限、初始化迁移、持久数据、运维和客户真实签收边界已清楚。'],
 ['DEL-R21-11','missing',['DRAFT-R21-03'],'客户项目语言格式尚无明确共同输入。'],
 ['DEL-R21-12','covered',[],'正常全自动终点、独立交付使用、异常连续和维护已承接。'],
].map(([id,status,issues,explanation])=>({id,status,issues,explanation}));
const report={schema:'factory-r21-document-review/draft',createdAt:new Date().toISOString(),scope:'本机公开MD静态审阅；不访问远端，不运行模型/测试/构建/部署，不改根文档。§2待专项汇总占位为已知草稿项，未列最终缺陷。',reviewedFiles:texts.map(x=>({path:x.path,sha256:createHash('sha256').update(x.text).digest('hex')})),confirmed:{normalEndToEndWithoutPerGateHumanClicks:true,originalHumanPolicyIsCurrentFactNotFinalRequirement:true,customerUseIncluded:true,projectFixVsAgentOptimizationSeparated:true,stableVsCandidateEvaluationRollbackCovered:true,pinnedInFlightVersionsCovered:true,budgetPropagationAndCancellationCovered:true,independentEvaluatorsAndHoldoutCovered:true,noRuntimeAcceptanceClaim:true},conclusion:'核心新增目标和双重闭环已形成；6项必要补充及2项建议需补入正文，尤其实际定义/模板注入、客户原始输入入口、全套文件交付/导出和客户语言。补§2现状不能独自替代这些目标条款。',issues,deliveryFindingsCoverage:coverage};
const out='artifacts/software-factory/goals-r21/document-review-draft.json';
await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({file:out,issues:issues.length,required:issues.filter(x=>x.priority==='required').length,sha256:createHash('sha256').update(await readFile(out)).digest('hex')}));
