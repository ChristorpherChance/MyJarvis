const fs=require('node:fs');
function revise(file,pairs){let body=fs.readFileSync(file,'utf8');for(const [a,b] of pairs){if(b.includes(a)&&body.includes(b))continue;body=body.replaceAll(a,b);}fs.writeFileSync(file,body);}
revise('apps/api/src/app.ts',[
 ["preferences:{base:member.preferences??'',language:","preferences:{base:member.preferences??'',pace:persona?.pace??'normal',dailyVoiceMinutes:persona?.dailyVoiceMinutes??30,autoSpeak:persona?.autoSpeak??true,language:"],
 ["supervised:()=>executionPolicy()?.supervise===true,onUsage:","supervised:()=>executionPolicy()?.supervise===true,autoWake:()=>executionPolicy()?.autoWake===true,preflight:()=>governance.preflight(),beforeExecution:input=>governance.reserveExecution(input),afterExecution:input=>governance.releaseExecution(input),onUsage:"],
 ["governance.executionUsage({runId:input.runId,actorId:","governance.executionUsage({runId:'execution_'+input.runId,actorId:"],
 ['stopped,stopped,','stopped,'],
 ['registerV1(app,store,pi,{repository:v1,dispatchers:','registerV1(app,store,pi,{repository:v1,stopped,dispatchers:'],
 ["descriptions:{tasks:","descriptions:{inbox:'签名节点按已授权字段提交收件，保留原话和人工归档',research:'真实Pi有限研究、预算和时限、取消与人工决策',tasks:"],
 ["reply.code(503).send({requestId:randomUUID(),code:'NOT_CONFIGURED',message:'此模块接口尚未开放'})","reply.code(404).send({requestId:randomUUID(),code:'VALIDATION',message:'接口不存在'})"]
]);
revise('apps/web/src/DemoApp.tsx',[
 ['Pi对话与意图确认已接；中央语音、家庭身份和房间唤醒待接通。','Pi与意图确认、中央音频和成员身份已接；房间入口可独立配对。'],
 ['原话与四类归档已接；被动采集器待接通。','原话收件与分类归档；节点按明确授权提交项目记录。'],
 ['人工研究与Pi单轮分析已接；连续自动研究待接通。','Pi后台研究受预算与时限约束，结果由你核对和决策。'],
 ['外部进度、人工验收和交付包已接；自动开发执行器待接通。','Pi、Codex和Claude执行器可配置接入；实际执行与人工验收分别记录。'],
 ['经验、技能版本与固定引用已接；自动采集待接通。','经验、技能版本、固定引用与签名节点收件。'],
 ['设备与人工观察已接；远程Agent、唤醒和控制待接通。','配对节点提供实际遥测；唤醒与休眠需设备明确配置。'],
 ['服务、版本、部署申请与人工验证已接；远程执行待接通。','固定版本、审批和备份绑定的受控发布；结果由实际探测验证。'],
 ['账单、功耗、备份与恢复证据可登记；自动执行和计量待接通。','实际节点用量、USD预算、文件备份和隔离恢复；账单与功耗可另登记。'],
 ['来源登记、授权与本地文本查询已接；外部连接器待接通。','目录和HTTP知识源真实同步；检索只使用有效授权内容。'],
 ['真实上传、逐页人工校对及发布已接；自动OCR待接通。','扫描原件多轮识别，疑点和逐页原文由人工复核后发布。'],
 ['成员档案、共享待办与本人备忘已接；独立身份待接通。','成员独立认证、共享待办和本人备忘。'],
 ['本人候选、确认与遗忘已接；定期清理待接通。','个人记忆、候选确认与实际遗忘；聊天按本人保留策略清理。'],
 ['专属偏好可保存；声音合成、唤醒执行和身份绑定待接通。','声音、唤醒词、安静时间和成员权限由中央房间入口执行。']
]);
revise('apps/web/src/features/operations/research.tsx',[
 ["{!live&&{!live&&<Button onClick={() => safe(() => action('advance', item))}>推进一轮</Button>}}","{!live&&<Button onClick={() => safe(() => action('advance', item))}>推进一轮</Button>}"],
 ["live?plan(item):live?plan(item):action('resume', item)","live?plan(item):action('resume', item)"],
 ["setForm({title:'语音记录 · 待接入',description:'房间语音与麦克风尚未接入。可以先通过快速记录保存真实文字；此按钮不会录音或生成模拟转写。',fields:[],submitLabel:'检查语音接口',submit:()=>act('op.inbox',{command:'voice'})}); return;","window.open('/?mode=room','_blank','noopener'); return;"],
 ["{live?'语音记录 · 待接入':'语音记录'}","语音记录"],
 ['授权仅保存设备、项目与已选字段。被动采集器尚未接入，保存不会开始采集；公司或只读设备不能授权。','节点只提交所选设备、项目和字段；指定项目日志需节点显式配置，公司与只读设备不能授权。'],
 ["note:live?'授权可保存 · 采集器待接入'","note:live?'配对节点 · 授权字段'"],
 ["title={live?'终端被动采集器尚未接入':undefined}","title={live?'在系统设置的节点执行中配对采集节点':undefined}"],
 ["{live?'被动采集 · 待接入':'采集模拟事件'}","{live?'节点采集已开放':'采集模拟事件'}"],
 ['采集器未配置 · 修订','授权接口已配置 · 修订'],
 ['自动连续研究尚未接入。单轮Pi分析请使用上方「Pi后台研究」，结果由你审核后录入证据和方案。','中央Pi按明确目标、USD预算和时限执行分析；结果作为待核对草稿，不自动采纳或立项。'],
 ["label: '研究预算（元）'","label: live ? '模型预算（USD）' : '研究预算（元）'"],
 ["options: data.machines.filter(m => !m.readOnly && m.kind !== 'storage').map(m => [m.id, m.name]) }], initial: { question: r.question, criteria: r.criteria, ...r.plan }","options: data.machines.filter(m => live ? m.id==='local' : !m.readOnly && m.kind !== 'storage').map(m => [m.id, m.name]) }], initial: { question: r.question, criteria: r.criteria, ...r.plan, ...(live?{machine:'local',budget:r.plan?.budget||1,minutes:r.plan?.minutes||30,retryLimit:0}:{}) }"],
 ['讨论、证据、方案与人工决定写入真实库。后台研究执行器尚未接入。','Pi后台研究和人工讨论共用真实记录；证据需核对，决定由你确认。'],
 ["live ? '人工研究 · 未派发'","live ? r.status==='researching'?'Pi研究运行中':r.backgroundResult?'Pi研究已有回执':'人工讨论'"],
 ["live ? '无自动研究费用记录'","live ? `上限 ${item.plan?.budget||0} USD · 实际见费用治理`"],
 ["live ? '未派发研究'","live ? '单轮分析 · 不自动付费重试'"],
 ["{live ? '连续研究 · 待接入' : '有限研究'}","{live ? '启动后台研究' : '有限研究'}"],
 ["<Button onClick={() => safe(() => action('advance', item))}>推进一轮</Button>","{!live&&<Button onClick={() => safe(() => action('advance', item))}>推进一轮</Button>}"],
 ["action('pause', item)","action('pause', item,{reason:'本人暂停后台研究'})"],
 ["action('resume', item)","live?plan(item):action('resume', item)"]
]);
console.log('Runtime labels and research controls updated');
