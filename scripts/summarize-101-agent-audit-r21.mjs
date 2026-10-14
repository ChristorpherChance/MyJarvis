/** Static synthesis of captured public source. Final remote verification reads hashes only. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const folder='artifacts/software-factory/goals-r21';
const inventory=JSON.parse(await readFile(folder+'/agent-source-inventory.json','utf8'));
const capture=JSON.parse(await readFile(folder+'/agent-source-capture.json','utf8'));
const supplement=JSON.parse(await readFile(folder+'/agent-source-supplement.json','utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const inspected=[...capture.end.files,...supplement.files].sort((a,b)=>a.path.localeCompare(b.path));
for(const f of inspected){if(sha(await readFile(folder+'/public-source/'+f.path))!==f.sha256)throw Error('LOCAL_CAPTURE_FINGERPRINT_CHANGED');}
const final=JSON.parse(remote(lanProfile,'jarvis-101',python({files:inspected},String.raw`
import os,json,hashlib,subprocess,datetime
from pathlib import Path
root=Path('/home/superopen/All-Projects/msf');env=dict(os.environ);env['GIT_OPTIONAL_LOCKS']='0'
def git(args):
 r=subprocess.run(['/usr/sbin/runuser','-u','superopen','--','git','--no-optional-locks','-C',str(root),*args],capture_output=True,timeout=15,env=env)
 if r.returncode:raise RuntimeError('READONLY_GIT_FAILED')
 return r.stdout
changed=[]
for f in p['files']:
 q=root/f['path']
 if q.is_symlink() or not q.is_file() or not q.resolve().is_relative_to(root):changed.append({'path':f['path'],'reason':'PATH_CHANGED'});continue
 h=hashlib.sha256(q.read_bytes()).hexdigest()
 if h!=f['sha256']:changed.append({'path':f['path'],'capturedSha256':f['sha256'],'currentSha256':h})
print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':git(['rev-parse','HEAD']).decode().strip(),'statusSha256':hashlib.sha256(git(['status','--porcelain=v1','-z','--untracked-files=all'])).hexdigest(),'changedInspectedFiles':changed,'filesHashChecked':len(p['files'])}))
`),true));
const evidence=[];
async function ref(id,path,start,end=start){
 const f=inspected.find(f=>f.path===path);if(!f)throw Error('UNCAPTURED_REFERENCE '+path);
 const lines=(await readFile(folder+'/public-source/'+path,'utf8')).split(/\r?\n/);
 evidence.push({id,sourceMachine:'101',sourcePath:'/home/superopen/All-Projects/msf/'+path,publicCapture:folder+'/public-source/'+path,sha256:f.sha256,startLine:start,endLine:end,shortPublicExcerpt:lines.slice(start-1,end).join('\n').slice(0,800)});
}
const ai='apps/server/src/modules/ai/';
await ref('E01',ai+'stage-guides.ts',79,87);
await ref('E02',ai+'sessions.service.ts',536,540);
await ref('E03',ai+'sessions.service.ts',154,170);
await ref('E04',ai+'sessions.service.ts',568,571);
await ref('E05',ai+'prompts.service.ts',34,49);
await ref('E06',ai+'prompts.service.ts',54,68);
await ref('E07','apps/server/src/db/migrations/0010_m6_ai.sql',48,63);
await ref('E08',ai+'pi-gateway.ts',39,44);
await ref('E09',ai+'pi-gateway.ts',101,119);
await ref('E10',ai+'pi-loader.ts',28,36);
await ref('E11',ai+'sessions.service.ts',387,409);
await ref('E12',ai+'models.service.ts',215,222);
await ref('E13',ai+'models.service.ts',16,17);
await ref('E14',ai+'sessions.service.ts',593,601);
await ref('E15',ai+'sessions.service.ts',607,632);
await ref('E16',ai+'sessions.service.ts',737,741);
await ref('E17',ai+'sessions.service.ts',662,674);
await ref('E18',ai+'sessions.service.ts',779,783);
await ref('E19',ai+'tools.service.ts',31,36);
await ref('E20',ai+'stream-pipeline.ts',64,71);
await ref('E21',ai+'stream-pipeline.ts',212,229);
await ref('E22',ai+'stream-pipeline.ts',318,328);
await ref('E23',ai+'sessions.service.ts',73,79);
await ref('E24','apps/server/src/db/migrations/0010_m6_ai.sql',4,16);
await ref('E25',ai+'delegations.service.ts',67,92);
await ref('E26',ai+'delegations.service.ts',93,101);
await ref('E27',ai+'delegations.service.ts',184,192);
await ref('E28',ai+'delegations.service.ts',215,226);
await ref('E29',ai+'delegations.service.ts',266,288);
await ref('E30','apps/server/src/db/migrations/0010_m6_ai.sql',155,161);
await ref('E31','apps/server/src/modules/executor/sandbox.service.ts',108,127);
await ref('E32','apps/server/src/modules/dev/board.service.ts',78,88);
await ref('E33','apps/server/src/modules/dev/board.service.ts',141,168);
await ref('E34','apps/server/src/modules/dev/autopilot.service.ts',295,302);
await ref('E35','apps/server/src/modules/dev/autopilot.service.ts',366,391);
await ref('E36','apps/server/src/modules/req/generate.service.ts',342,359);
await ref('E37','apps/server/src/modules/req/generate.service.ts',530,549);
await ref('E38','apps/server/src/modules/design/generate.service.ts',434,458);
await ref('E39','apps/server/src/modules/platform/doc-templates.ts',284,303);
await ref('E40','apps/server/src/modules/platform/doc-templates.ts',312,315);
await ref('E41','apps/server/src/modules/platform/doc-templates.ts',386,407);
await ref('E42','apps/server/src/modules/design/review.service.ts',20,34);
await ref('E43','apps/server/src/modules/policy/policy.service.ts',12,22);
await ref('E44','apps/server/src/modules/platform/settings.service.ts',97,108);
await ref('E45','doc/product-design/PRD.md',148,161);
await ref('E46','doc/product-design/PRD.md',112,112);
await ref('E47','doc/product-design/LLD-1-模块设计.md',375,379);

const production=inspected.filter(f=>f.path.startsWith('apps/server/src/')&&!/\.(test|spec)\.ts$/.test(f.path));
const searches=[];
for(const [name,pattern] of [
 ['embeddedPiAgentRuntime',/createAgentSession|(?:from|import\()\s*['"]@earendil-works\/(?:pi-agent-core|pi-coding-agent)/g],
 ['piSessionTreeOrRegistryExecution',/new\s+(?:SessionManager|ModelRegistry|AuthStorage)|SessionManager\.(?:create|open|fork|branch)|\.fork\(/g],
 ['promptPayloadConsumers',/base_prompt|overlay_text|skill_pack/g],
 ['parentChildAgentIdentity',/parent_agent_id|parentAgentId|parent_session_id|parentSessionId|parent_delegation_id|parentDelegationId/g],
 ['promptEvalOrAgentCapabilityMemory',/prompt_eval|promptEval|agent_memory|agentMemory|capability_memory|capabilityMemory|eval_dataset|evaluation_dataset/g],
]){
 const hits=[];
 for(const f of production){const text=await readFile(folder+'/public-source/'+f.path,'utf8');for(const [i,line] of text.split(/\r?\n/).entries()){pattern.lastIndex=0;if(pattern.test(line))hits.push({path:f.path,line:i+1});}}
 searches.push({name,scope:'captured production apps/server/src TS/SQL excluding tests; source text only',filesSearched:production.length,hits,notRuntimeProof:true});
}
const findings=[
 {id:'A01',topic:'实际Agent角色及层级',status:'IMPLEMENTED_STAGE_PERSONAS_NOT_INDEPENDENT_AGENTS',fact:'六种阶段职责：资料管理员、需求分析师、软件设计师、原型顾问、开发负责人、测试经理；通过会话ctx注入同一assistant提示。文档绑定doc_kind进一步区分CRD/PRD及设计八册。没有由这六种ctx自动创建的独立运行体/父子Agent树。',evidence:['E01','E02','E24']},
 {id:'A02',topic:'注册Agent与真正运行体',status:'PARTIAL_REGISTRY',fact:'PromptRegistry允许任意agentKey/agentGroup发布版本，支持查看、重命名、删除非当前版和回滚；这是一套提示词登记机制。当前实际登记的Agent数量、已生效版本正文与配置未查询业务数据库，保持未知。',evidence:['E05','E06','E07']},
 {id:'A03',topic:'提示词版本是否实际注入',status:'STATIC_INTEGRATION_GAP',fact:'消息创建记录assistant的当前prompt_version_id及其ID+参考指纹；buildPrompt使用代码内阶段指南、工件、项目状态、边界、历史与引用。所审实现未找到读取注册表base_prompt/overlay_text/skill_pack并注入该聊天或文档生成模型请求的消费路径。版本管理存在不能等同于版本生效经过执行验证。',evidence:['E03','E05','E07','E11','E37','E38'],search:'promptPayloadConsumers',runtimeReproduction:false},
 {id:'A04',topic:'Pi复用程度',status:'PI_AI_IMPLEMENTED_EMBEDDED_AGENT_NOT_FOUND',fact:'普通模型请求经pi-ai normalizeContext+provider streamSimple，平台自己管理文本工具围栏接力；未找到createAgentSession/pi-agent-core运行时、SessionManager分支压缩、ModelRegistry/AuthStorage执行接入。PRD/LLD已明确要求这些Pi组件，当前实现与设计存在落差。SDK安装情况和线上有效provider本轮未查询。',evidence:['E08','E09','E10','E45','E47'],searches:['embeddedPiAgentRuntime','piSessionTreeOrRegistryExecution']},
 {id:'A05',topic:'上下文与记忆',status:'BOUNDED_CONTEXT_ASSEMBLY',fact:'项目准入快照、阶段指南、当前工件及上游滞后提示，定稿参考每份12000/合计32000字符；其它最多10会话各2条用户摘录，3000字符总摘要；当前最近12消息各1500字符。doc.read支持章节/offset续读。它是聊天历史与上下文装配，不能直接称为Agent长期能力记忆或完整需求记忆。',evidence:['E02','E14','E15','E24']},
 {id:'A06',topic:'工具和接力',status:'IMPLEMENTED_PLATFORM_TEXT_RELAY',fact:'七件工具为导航、计数快照、文档正文、其它会话历史、下一步建议、需求修改提案、设计修改提案。模型输出msf-tool文本围栏，单轮最多6块、最多16轮接力；连续只读段并行、提案串行；工具结果跨轮累积，单结果16000字符、总80000字符预算。达到上限需用户回复继续，并非后台自动完成整条流水线。',evidence:['E16','E17','E18','E19']},
 {id:'A07',topic:'工具输入输出与行为边界',status:'IMPLEMENTED_PARTIAL_AUTONOMY',fact:'工具有封闭注册表、简式参数校验及调用审计；提案经旁路生成待确认补丁；定稿、放行、计划批准、转测试、file.write/shell.exec/git.push在聊天工具中拒绝。用户要求端到端全自动，需要政策授权驱动的工作流执行器，而非只放开聊天提示词。',evidence:['E04','E19','E36','E43','E44']},
 {id:'A08',topic:'传输重试与恢复',status:'BOUNDED_RETRY_AND_FRAME_REPLAY_NOT_AGENT_RESUME',fact:'Pi请求maxRetries=2；无SSE流出时可重建并额外重试1次；嵌套提案及生成断流有1次额外重试，429/鉴权/额度不做该重试。SSE内存运行体+Redis200帧/1h重放，进程启动将超过10分钟的streaming标failed；未见运行体checkpoint重建与继续执行。前端断线重挂不等于服务器重启后Agent恢复。',evidence:['E09','E20','E21','E22','E23']},
 {id:'A09',topic:'会话树/父子关系',status:'SCHEMA_RESERVATION_NO_RUNTIME_TREE_FOUND',fact:'ai_sessions有tree_ref预留，当前创建不填；委派记录有project/task_id但没有父Agent、父会话、父委派、子运行汇合及输出验证契约。未发现父子Agent树运行实现；可见阶段会话隔离与跨阶段摘要不是父子委派。',evidence:['E24','E27','E29'],search:'parentChildAgentIdentity'},
 {id:'A10',topic:'委派目标及执行器',status:'PI_NATIVE_PILOT',fact:'源码种子三个目标：pi_native、claude_code_local、codex_cli；支持local-cli/remote-agent/builtin注册和探测。create异步调用统一默认PiNativeExecutor，按target取image后runOnce pi --mode rpc --task。未见各adapterKind实际执行分发，也未见stdin/stdout JSONL RPC消息协议收发解析。外部CLI已由贾维斯接入不等于工厂内部这些适配器已完成。',evidence:['E25','E26','E29','E30'],cliFlagsValid:'NOT_VERIFIED'},
 {id:'A11',topic:'委派质量、预算及工作区',status:'RECORDED_FIELDS_NOT_FULL_ENFORCEMENT',fact:'委派保存workspace_scope/budget_limit，但默认执行器只传image、task_desc和timeout；没有使用这些字段约束工作区/模型消耗，也没有给出角色prompt、skill包、输入工件版本或独立验收。成功取决exitCode===0，返回截断日志及环境指纹，不能由此推定产物正确。',evidence:['E25','E27','E31']},
 {id:'A12',topic:'委派取消/异常/续做',status:'PARTIAL_STATE_PROTECTION',fact:'queued/running/终态迁移有前态stale保护；超时转failed_timeout、终态留证。PiNativeExecutor.cancel为空，只靠超时回收容器；未发现持久队列重启恢复、能力匹配重派、模型切换、失败修复回合或产物合并。新增真正取消及恢复需要处理已提交产物/晚到用量。',evidence:['E25','E28','E29']},
 {id:'A13',topic:'开发/独立评审Agent',status:'CURRENT_SOURCE_MOCK_PATH_OBSERVED',fact:'当前266104源码board.run直接prog=100；quality写固定85/78覆盖率及mock-local CI，ai-review写mock-reviewer/pass；autopilot直接调用这些命令。因此尚非PRD定义的真实编码→单测→CI→独立评审→合并Agent闭环。这是当前静态实现发现，未执行历史NO-GO反例或产品重测。',evidence:['E32','E33','E34','E46']},
 {id:'A14',topic:'文档质量与专业模板',status:'USEFUL_FOUNDATION_NOT_SEMANTIC_ACCEPTANCE',fact:'需求/设计有真实Pi生成分支、增量/整篇提案、上游全文/锚点规则，项目模板套件及默认标准/质量/反例注入；模板编辑有结构长度数量等保存闸。这些是可复用基础，不能代替逐条语义覆盖评审、独立评审模型和真实客户任务评估。设计Review当前还有固定首访种子。',evidence:['E36','E37','E38','E39','E40','E41','E42']},
 {id:'A15',topic:'模型路由与会话切换一致性',status:'STATIC_PROVENANCE_RISK',fact:'六用途路由注册存在；消息模型戳优先会话绑定model_id，但send和接力createSession只传purpose=chat，PiGateway按用途resolve而不接收会话绑定modelId。静态路径未见实际绑定模型传递，实际调用与台账模型可能不一致，需后续隔离回执核验；本轮不调用模型。按Agent/步骤配置、强模型升级、后备切换与真实回执一致性仍需独立目标。',evidence:['E03','E08','E11','E12','E13'],runtimeReproduction:false},
 {id:'A16',topic:'自动Prompt优化/评估/能力记忆',status:'NOT_FOUND_IN_AUDITED_IMPLEMENTATION',fact:'已看到人工维护的指南改进注释、提示词发布回滚、专业模板套件与模板结构测试；未找到候选prompt/skill→固定任务集→独立评分→对比成本质量→灰度提升→回滚的自动评估闭环，也未见经证据验证的Agent能力记忆库/复用检索。未读实际业务数据或私有对话，因此现存经验内容未知。',evidence:['E05','E06','E07','E39','E41'],search:'promptEvalOrAgentCapabilityMemory'},
 {id:'A17',topic:'全自动端到端项目运行',status:'NOT_IMPLEMENTED_AS_COMPLETE_WORKFLOW',fact:'开发autopilot是批准计划后的局部顺序循环，最终awaiting-transfer等交接；资料→需求→设计→原型→真实开发→测试→交付使用没有统一持久DAG/阶段Agent调度、可验证恢复及最终真实示范证据。现有七确认点manual/auto策略可作为授权基础，不能把auto配置本身视为已能全天全自动交付。',evidence:['E34','E35','E43','E44']},
];
const recommendations={
 status:'PROPOSED_TARGETS_NOT_IMPLEMENTED_OR_STARTED',
 hierarchy:[
  {layer:'L0',role:'项目总控Agent',responsibility:'持有客户原始目标、版本、依赖DAG、交付出口、全局费用/Token/重试边界与恢复；规划下一阶段，遇到需求矛盾按项目政策升级处理'},
  {layer:'L1',role:'阶段负责人Agent',responsibility:'资料/需求产品/架构详细设计/原型UI/开发/测试/交付运行维护分别有执行契约、模型、prompt/skill版本、工作区及产物质量门'},
  {layer:'L2',role:'按需专业子Agent',responsibility:'拆为解析溯源、需求澄清与语义矩阵、架构/数据/API/安全、页面/交互、编码/单测、独立评审、真实测试/缺陷、打包/安装/使用验证；输出回交阶段负责人，禁止无限递归'},
  {layer:'cross-cutting',role:'独立验证与Agent能力改进',responsibility:'验证器与生成者身份/输入分离；能力改进只提候选，固定任务集验证通过后按已配置政策发布，保留原版与回滚'},
 ],
 agentContract:['稳定roleId与roleVersion','完整prompt/overlay/skill内容hash及生效快照','parentRunId/rootRunId/子运行和汇合关系','输入工件版本/需求子条款/来源引用与上下文清单','模型有效路由/回执model以及升级后备策略','明确输出schema/文件/真实产物hash/代码commit','工具白名单/工作区/权限/网络/数据命名空间','独立质量rubric及失败反例','费用/Token/时限/轮数/重试/递归深度/并发共享预算','持久checkpoint/输入指纹和幂等side-effect receipt','失败码、暂停/取消/失租/额度恢复规则','实际用量及unknown保守记账','交付出口与验收决定、未解决缺口'],
 improvementLoop:['收集经脱敏授权的失败/用户更正/验收反馈和具体Agent版本','定位prompt、工具、上下文、模型或执行环境原因，不默认只改prompt','候选新版本及变更目的/适用范围','固定训练样例与保留独立评估集，重复真实任务及反例','按事实正确性、需求覆盖、工件质量、真实可运行性、违规行为、首答/完成延迟、成本评分','和旧版/基准对比并检查受影响全链无回归','按项目政策小范围启用并观察，失败自动回退到已验证版本','沉淀可追溯经验→待验证能力候选→固定skill版本；隔离客户资料/临时聊天与通用能力记忆'],
 recommendedAcceptance:['同一客户原始需求从零产生全部合格文档/独立页面/整体原型/真实软件/测试/交付包/安装使用证据','可注入真实文档遗漏、代码缺陷、测试失败和执行中断，系统在边界内识别、修复、重验并继续','每个阶段至少一个当前真实Agent输入输出及独立质量检查；每种子Agent实际委派/汇合可审计','角色prompt/skill修改实际改变执行请求且模型/版本/工具/用量回执一致','候选优化在独立集上有收益且无关键质量回归，灰度和回滚实际验证','24/72小时仅对授权示范运行验收，不依赖手工点击每一步；未知费用、权限、目标矛盾进入可观察例外队列'],
 autonomyPolicy:'用户目标是最终全自动运行。建议按项目预授权的目标、资源、费用和风险范围自动完成普通阶段，保留例外处理；现有BR-13/聊天人工边界与七点manual/auto策略需明确对应，而不是由模型自行放开或降低质量。现有客户生产发布分期仍应单列其适配/运行验收目标。',
};
const report={
 at:new Date().toISOString(),title:'101 软件工厂阶段Agent与能力持续改进只读审计',
 scope:{sourceRoot:'/home/superopen/All-Projects/msf',sourceMachine:'101',methods:['fixed managed-server-client SSH','tracked public source capture','static source/schema/design inspection','final SHA-only source reread'],notPerformed:['model invocation','build or test execution','deployment or service restart','business database reads','private env/credential/chat reads or export','runtime Agent calls'],runtimeValidation:'NONE'},
 identity:{initialHead:inventory.head,finalHead:final.head,initialGitStatusSha256:inventory.statusSha256,finalGitStatusSha256:final.statusSha256,inspectedPublicFiles:inspected.length,manifestSha256:sha(JSON.stringify(inspected)),capturedSourceStable:capture.sourceStableDuringCapture,allCapturedFilesMatchAtAuditClose:final.changedInspectedFiles.length===0,headAndStatusStable:inventory.head===final.head&&inventory.statusSha256===final.statusSha256,finalObservation:final,manifest:inspected},
 executiveFinding:'现有阶段角色、真实Pi文本调用、平台受控工具接力、提示词版本和专业文档模板构成基础；不等同于真实多Agent层级运行、自动能力优化或端到端全自动软件交付。当前266104静审与R20 e375以及旧NO-GO测试证据分开。',
 findings,recommendations,searchEvidence:searches,sourceEvidence:evidence,
 unknowns:['实际运行实例加载的是哪个构建/源码，未建立runtime build manifest','有效MSF_AI_PROVIDER及当前模型/Agent/Prompt/Skill注册内容，未查询配置或业务数据库','Pi native镜像内RPC命令合法性、密钥/代理/工作区适配及实际调用回执','线上真实客户端到端产物质量、取消/重启后恢复、预算边界和全天运行表现','外层贾维斯强模型接入与内部Agent实际路由一致性'],
 historicalEvidenceBoundary:'没有重跑或复现旧产品反例，不将旧NO-GO具体用例结果宣称为266104的今轮执行结果；新发现均为带源码行号的静态事实或明确推断。',
 localEvidence:{inventory:folder+'/agent-source-inventory.json',inventorySha256:sha(await readFile(folder+'/agent-source-inventory.json')),capture:folder+'/agent-source-capture.json',captureSha256:sha(await readFile(folder+'/agent-source-capture.json')),supplement:folder+'/agent-source-supplement.json',supplementSha256:sha(await readFile(folder+'/agent-source-supplement.json')),writer:'scripts/summarize-101-agent-audit-r21.mjs',writerSha256:sha(await readFile(new URL(import.meta.url)))},
};
const out=folder+'/agent-capability-audit.json';await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({written:out,sha256:sha(await readFile(out)),head:report.identity.finalHead,files:inspected.length,sourceStable:report.identity.headAndStatusStable&&report.identity.allCapturedFilesMatchAtAuditClose,findings:findings.length,evidence:evidence.length,models:0,tests:0,builds:0,deployments:0,databaseReads:0}));
