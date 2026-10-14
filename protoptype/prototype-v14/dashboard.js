(function () {
  'use strict';
  if (!window.J7 || !J5) return;
  const domains = [
    ['family', '家庭陪伴', 'family', 'family'], ['knowledge', '知识神殿', 'book', 'temple'],
    ['development', '开发监督', 'code', 'tasks'], ['operations', '运行管理', 'machine', 'services'],
    ['research', '灵感研究', 'bolt', 'research'], ['experience', '经验技能', 'history', 'knowledge']
  ];
  const original = {overview:J5.routes.overview, screen:J5.routes.screen, boards:Object.fromEntries(domains.map(d=>[d[0],J5.boards[d[0]]?.render]))};
  const canManage = () => admin() && !J5.isPublic();
  const v = () => J5.state();
  const k = () => v().knowledgeCenter;
  const ops = () => v().ops;
  const health = s => machine(s.host)?.status !== 'online' ? 'offline' : s.health;
  const healthLabels = {healthy:['健康','green'],degraded:['较慢','amber'],down:['异常','red'],offline:['离线','amber']};
  const deployLabels = {requested:['待审批','amber'],ready:['待发布','blue'],deploying:['发布中','blue'],verifying:['验证中','purple'],healthy:['已发布','green'],failed:['发布失败','red'],restoring:['恢复中','amber'],restored:['已恢复','green'],rejected:['已拒绝',''],cancelled:['已取消','']};
  const researchLabels = {new:['待整理',''],framing:['定目标','blue'],researching:['研究中','purple'],review:['待决策','amber'],accepted:['已采纳','green'],project:['已转项目','green'],blocked:['受阻','red'],waitingQuota:['等额度','amber'],waitingResource:['等资源','amber'],deferred:['已暂缓',''],rejected:['已放弃','']};
  const bookLabels = {queued:['待解析',''],parsing:['解析中','blue'],ocr:['识别中','blue'],crosscheck:['交叉校对','purple'],review:['待精校','amber'],published:['已发布','green'],failed:['需处理','red']};
  const esc = x => E(String(x ?? ''));
  const btn = (label, act='nav', id='', icon='arrow', cls='') => B(label,act,id,'j14-button '+cls,icon);
  const smallTag = (text, cls='') => badge(text,cls);
  function empty(text='暂无待办') { return '<div class="j14-empty">'+I('check',22)+'<span>'+esc(text)+'</span></div>'; }
  function all(label, count, act, id, icon='arrow') { return btn(label+' '+count,act,id,icon); }
  function panel(title, tools, body, cls='') { return '<section class="j14-panel '+cls+'"><header><h2>'+esc(title)+'</h2><div class="j14-panel-tools">'+(tools||'')+'</div></header><div class="j14-panel-body">'+body+'</div></section>'; }
  function metric(label,value, note, route, icon, tone='') {
    return '<button class="j14-metric '+tone+'" data-act="nav" data-id="'+route+'"><span class="j14-metric-icon">'+I(icon,20)+'</span><div><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></div>'+I('arrow',15)+'</button>';
  }
  function metrics(items) {return '<div class="j14-metrics">'+items.map(x=>metric(...x)).join('')+'</div>';}
  function row(title, subtitle, tags='', action='', cls='') {return '<div class="j14-data-row '+cls+'"><div class="j14-row-text"><strong>'+esc(title)+'</strong>'+(subtitle?'<small>'+esc(subtitle)+'</small>':'')+'</div><div class="j14-row-end">'+tags+action+'</div></div>';}
  const taskPriority = t => ({blocked:0,failed:0,approval:1,waitingQuota:2,waitingResource:2,validating:3,running:4,queued:5,paused:6}[t.status]??7);
  function tasks() {return S.tasks.filter(t=>!['completed','cancelled'].includes(t.status)).slice().sort((a,b)=>taskPriority(a)-taskPriority(b));}
  function taskRows(list, n=3) {
    return list.length ? list.slice(0,n).map(t=>'<div class="j14-task-row"><span class="j14-agent '+(t.agent==='Codex'?'codex':'claude')+'">'+esc(t.agent==='Codex'?'CX':'CC')+'</span><div class="j14-task-copy"><button data-act="task" data-id="'+esc(t.id)+'">'+esc(t.title)+'</button><small>'+esc(project(t.project)?.name||'未关联项目')+' · '+esc(t.agent||'待分配')+'</small></div><div class="j14-task-progress"><b>'+Number(t.progress||0)+'%</b>'+progress(t.progress||0)+'</div>'+status(t)+'</div>').join('') : empty('当前没有开发任务');
  }
  function serviceRow(s) {
    const [label,tone]=healthLabels[health(s)]||['待检查',''];
    return row(s.name,(machine(s.host)?.name||s.host)+' · '+s.version,smallTag(label,tone),btn('详情','v5-op-service',s.id,'arrow'));
  }
  function decisionList(n=3) {
    const list=window.J6Usability.getSummaryItems();
    return list.length?list.slice(0,n).map(item=>{
      const urgent=item.tone==='urgent', decision=item.category==='decision';
      return '<div class="j14-data-row j14-summary-row"><span class="j14-priority-icon '+(urgent?'urgent':'')+'">'+I(item.icon||'info',18)+'</span><div class="j14-row-text"><strong>'+esc(item.title)+'</strong><small title="'+esc(item.detail)+'">'+esc(item.detail)+'</small></div><div class="j14-row-end">'+smallTag(decision?'待审核':'需处理',urgent?'red':'amber')+btn(decision?'审核':'查看',item.action,item.id,item.icon||'arrow')+'</div></div>';
    }).join(''):empty('当前没有重点待办');
  }
  function liveStories() {
    const center=k();return center.stories.filter(s=>{
      const b=center.books.find(b=>b.id===s.book),source=b&&center.sources.find(x=>x.id===b.source);
      return s.released&&!s.dirty&&b?.status==='published'&&source?.active&&source?.authorized&&(source.scope==='family'||canManage())&&(!b.scope||b.scope==='family'||canManage()||(!J5.isPublic()&&b.scope==='personal'&&b.owner===S.profile));
    });
  }
  function unresolved() {return k().books.reduce((n,b)=>n+(b.doubts||[]).filter(q=>q.critical&&q.status!=='resolved').length,0);}
  function ideas() {return (v().research?.items||[]).filter(x=>x.owner===S.profile||x.scope!=='private');}
  function knowledgeList() {return visibleKnowledge();}
  function domainSnapshot(key) {
    const center=k(),o=ops();
    switch(key) {
      case 'family': return {value:S.familyTodos.filter(t=>!t.done).length, unit:'项共同安排', note:profiles.length+' 位成员 · 分别陪伴'};
      case 'knowledge': return {value:unresolved(),unit:'个关键疑点',note:liveStories().length+' 则发布故事 · '+center.sources.filter(s=>s.active&&s.authorized).length+' 个有效来源'};
      case 'development': return {value:activeTasks().length,unit:'项正在推进',note:S.tasks.filter(t=>['blocked','approval','waitingQuota','waitingResource','failed'].includes(t.status)).length+' 项待处理 · '+o.releases.length+' 个交付包'};
      case 'operations': return {value:o.services.filter(s=>health(s)==='healthy').length+' / '+o.services.length,unit:'个健康服务',note:o.deployments.filter(d=>['requested','failed','ready','verifying'].includes(d.status)).length+' 项发布待处理'};
      case 'research': return {value:ideas().filter(x=>x.status==='review').length,unit:'项等待决策',note:ideas().length+' 条灵感 · '+ideas().filter(x=>x.projectId).length+' 项已转项目'};
      default: return {value:knowledgeList().filter(x=>x.kind==='skill'&&x.status==='可用').length,unit:'个可用技能',note:knowledgeList().filter(x=>x.kind==='experience').length+' 条经验 · '+knowledgeList().filter(x=>!x.verified).length+' 条待验证'};
    }
  }
  function domainStrip() {
    return '<section class="j14-domains" aria-label="六个领域状态">'+domains.map(d=>{const s=domainSnapshot(d[0]);return '<button data-act="v5-board" data-id="'+d[0]+'"><div class="j14-domain-head">'+I(d[2],18)+'<strong>'+d[1]+'</strong>'+I('arrow',14)+'</div><div class="j14-domain-value"><b>'+esc(s.value)+'</b><span>'+esc(s.unit)+'</span></div><small>'+esc(s.note)+'</small></button>';}).join('')+'</section>';
  }
  function events(list=S.activity,n=3) {return list.slice(0,n).map(a=>'<div class="j14-event"><time>'+esc(a.time)+'</time><span>'+esc(a.text)+'</span></div>').join('')||empty('尚无事件');}
  function head(title, text, actions, screen=false) {
    return '<header class="j14-head"><div><div class="j14-eyebrow">'+(screen?'JARVIS / LIVE BOARD':'JARVIS / TODAY')+'<span>模拟状态</span></div><h1>'+esc(title)+'</h1>'+(text?'<p>'+esc(text)+'</p>':'')+'</div><div class="j14-head-actions">'+actions+'</div></header>';
  }
  function footer(text) {return '<footer class="j14-foot"><span class="j14-live-dot"></span>'+esc(text)+'</footer>';}
  function overview() {
    if(!canManage())return '<div class="j14-dashboard">'+familyBoard()+'</div>';
    const list=tasks(),o=ops(),pending=pendingApprovals().length;
    const needs=unresolved(),gaps=k().gaps.filter(g=>g.state==='pending').length;
    return '<div class="j14-dashboard j14-overview" data-j14-overview>'+head('总览中心',activeTasks().length+' 项任务推进中，'+pending+' 项等待你决定。',btn('语音对话','nav','chat','mic','primary')+btn('全域总览','v5-board','all','screen'))+
      metrics([['在线设备',S.machines.filter(m=>m.status==='online').length+' / '+S.machines.length,'按需运行','machines','machine'],['开发监督',activeTasks().length+' 项',S.settings.supervise?'监督已开启':'监督已暂停','tasks','code'],['待办审批',pending+' 项','按影响逐项审核','approvals','shield','attention'],['原文校对',needs+' 个','关键疑点待处理','collation','edit','attention']])+
      '<div class="j14-main-grid">'+panel('优先任务',all('全部任务',S.tasks.length,'nav','tasks')+btn(S.settings.supervise?'暂停监督':'开启监督','toggle-supervise','',S.settings.supervise?'pause':'play'),taskRows(list,3),'j14-primary-panel')+
      panel('重点待办',all('全部审批',pending,'nav','approvals'),decisionList(3),'j14-decision-panel')+'</div>'+
      '<div class="j14-brief-line"><strong>下一步</strong>'+btn(needs+' 个关键疑点','nav','collation','edit')+btn(gaps+' 项知识补充','v5-k-temple-tab','gaps','book')+btn(o.services.filter(s=>health(s)!=='healthy').length+' 个服务待检查','nav','services','cloud')+'<span>备份 '+esc(S.lastBackup)+'</span></div>'+domainStrip()+footer('当前档案 '+P().name+' · 修改与各管理页面联动')+'</div>';
  }
  function allBoard() {
    const list=tasks(),o=ops(),pending=pendingApprovals().length;
    return metrics([['在线设备',S.machines.filter(m=>m.status==='online').length+' / '+S.machines.length,'资产登记完整','machines','machine'],['任务推进',activeTasks().length+' 项',S.settings.supervise?'监督已开启':'监督已暂停','tasks','code'],['健康服务',o.services.filter(s=>health(s)==='healthy').length+' / '+o.services.length,'运行与开发分开跟踪','services','cloud'],['待办审批',pending+' 项','需要本人决定','approvals','shield','attention']])+
      '<div class="j14-main-grid">'+panel('优先任务',all('全部任务',S.tasks.length,'nav','tasks')+btn('推进演示','advance','','refresh'),taskRows(list,3))+panel('重点待办',all('全部审批',pending,'nav','approvals'),decisionList(3))+'</div>'+domainStrip();
  }
  function knowledgeBoard() {
    const center=k(),stories=liveStories(),gaps=center.gaps.filter(g=>g.state==='pending'),books=center.books;
    if(!canManage()) {
      const publicMode=J5.isPublic(),courses=publicMode?[]:(center.courses[S.profile]||[]),finished=publicMode?0:Object.values(center.progress[S.profile]||{}).filter(p=>p.complete).length;
      return metrics([
        ['可听故事',stories.length+' 则','来源有效且正式发布','temple','book'],
        ...(publicMode?[['共享安排',S.familyTodos.filter(t=>!t.done).length+' 项','确认档案后查看个人学习','chat','family']]:[['我的课程',courses.length+' 条','按自己的节奏学习','temple','language'],['已学故事',finished+' 则','本人学习记录','learning','check'],['我的收藏',(center.favorites[S.profile]||[]).length+' 则','留待下次讲述','temple','star']])
      ])+'<div class="j14-main-grid">'+panel('今天听什么',all('全部故事',stories.length,'v5-k-temple-tab','stories'),stories.slice(0,4).map(s=>row(s.title,s.topic+' · '+s.duration+' 分钟',smallTag('已发布','green'),btn('听讲','v5-k-story',s.id,'speaker'))).join('')||empty('暂时没有可听的故事'))+panel(publicMode?'先认识你':'我的学习路线',publicMode?btn('确认档案','v5-vm-identity','','family'):all('全部课程',courses.length,'v5-k-temple-tab','courses'),publicMode?'<div class="j14-prompt"><h3>选自己的档案，接着上次学习。</h3><p>公共空间只展示共享内容。</p>'+btn('语音对话','v5-vm-board-chat','','mic','primary')+'</div>':(courses.slice(0,3).map(c=>row(c.title,c.stories.length+' 则故事',smallTag('个人课程',''),btn('继续','v5-k-temple-tab','courses','play'))).join('')||'<div class="j14-prompt"><h3>从一则短故事开始。</h3><p>听完聊两个问题，逐渐串起知识。</p>'+btn('规划课程','v5-k-new-course','','plus')+'</div>'))+'</div>';
    }
    const bookrows=books.slice(0,3).map(b=>{const [label,tone]=bookLabels[b.status]||['处理中',''];return row(b.title,b.reviewed.length+' / '+b.pages+' 页已复核 · 原文 v'+b.version,smallTag(label,tone),btn('校对','v5-k-collate',b.id,'edit'));}).join('');
    return metrics([['有效来源',center.sources.filter(s=>s.active&&s.authorized).length+' 个','动态接入知识','sources','link'],['正式原文',books.filter(b=>b.status==='published').length+' 部','精校后发布','collation','book'],['关键疑点',unresolved()+' 个','关键疑点逐一处理','collation','edit','attention'],['发布故事',stories.length+' 则','原文与解读分层','temple','speaker']])+
      '<div class="j14-main-grid">'+panel('原文进度',all('全部书籍',books.length,'nav','collation'),bookrows||empty('尚未添加书籍'))+panel('知识补充',all('全部建议',gaps.length,'v5-k-temple-tab','gaps'),gaps.slice(0,3).map(g=>row(g.title,g.type+' · '+g.impact,smallTag('待决定','amber'),btn('决策','v5-k-gap-accept',g.id,'check'))).join('')||empty('暂无补充建议'))+'</div>'+ 
      '<div class="j14-board-bottom">'+panel('知识脉络',btn('关系图谱','v5-k-temple-tab','graph','link'),'<div class="j14-knowledge-path">'+[['file','原始扫描'],['edit','忠实原文'],['book','解读故事'],['language','个人课程']].map((x,i)=>'<span>'+I(x[0],22)+'<b>'+x[1]+'</b></span>'+(i<3?I('arrow',17):'')).join('')+'</div>')+panel('最近更新',all('全部来源',center.sources.length,'nav','sources'),events(center.events,2))+'</div>';
  }
  function operationsBoard() {
    const o=ops(),deploy=o.deployments.filter(d=>['requested','ready','deploying','verifying','failed','restoring'].includes(d.status));
    const pending=deploy.length;
    return metrics([['在线设备',S.machines.filter(m=>m.status==='online').length+' / '+S.machines.length,'离线设备不调度','machines','machine'],['健康服务',o.services.filter(s=>health(s)==='healthy').length+' / '+o.services.length,'按最近模拟检查','services','cloud'],['发布待办',pending+' 项','版本与恢复点独立','services','upload','attention'],['人工预留',o.policy.humanReserve+'%','本人使用优先','operations','cpu']])+
      '<div class="j14-main-grid">'+panel('运行服务',all('全部服务',o.services.length,'nav','services'),o.services.slice().sort((a,b)=>(health(a)==='healthy')-(health(b)==='healthy')).slice(0,3).map(serviceRow).join('')||empty('暂无运行服务'))+
      panel('发布与恢复',all('全部发布',o.deployments.length,'v5-op-tab','deployments'),deploy.slice(0,3).map(d=>{const s=o.services.find(x=>x.id===d.service),[label,tone]=deployLabels[d.status]||['处理中',''];return row(s?.name||d.service,d.version+' · '+({production:'正式环境',staging:'预发布',test:'测试环境'}[d.environment]||d.environment),smallTag(label,tone),btn('过程','v5-op-deployment',d.id,'arrow'));}).join('')||empty('没有待处理的发布'))+'</div>'+
      '<div class="j14-board-bottom">'+panel('资源策略',btn('调整配额','v5-op-policy','','settings'),'<div class="j14-resource"><div class="j14-resource-bar" role="img" aria-label="人工预留 '+o.policy.humanReserve+'%，语音预留 '+o.policy.voiceReserve+'%，后台可用 '+Math.max(0,100-o.policy.humanReserve-o.policy.voiceReserve)+'%"><i style="width:'+o.policy.humanReserve+'%"></i><i style="width:'+o.policy.voiceReserve+'%"></i><i style="width:'+Math.max(0,100-o.policy.humanReserve-o.policy.voiceReserve)+'%"></i></div><div class="j14-resource-labels"><span>人工 '+o.policy.humanReserve+'%</span><span>语音 '+o.policy.voiceReserve+'%</span><span>后台并发 '+o.policy.batchLimit+'</span></div></div>')+
      panel('最新交付',all('全部交付',o.releases.length,'v5-op-tab','releases'),o.releases.slice(0,1).map(r=>row(r.name,r.version,smallTag('已验收','green'),btn('交付包','v5-op-release',r.id,'file'))).join('')||empty('暂无交付包'))+'</div>';
  }
  function developmentBoard() {
    const list=tasks(),o=ops();
    return metrics([['正在推进',activeTasks().length+' 项','执行与验证','tasks','code'],['需要处理',list.filter(t=>['blocked','failed','approval','waitingQuota','waitingResource'].includes(t.status)).length+' 项','优先处理阻塞','tasks','shield','attention'],['人工暂停',S.tasks.filter(t=>t.status==='paused').length+' 项','保持暂停决定','tasks','pause'],['已验收阶段',S.tasks.filter(t=>t.status==='completed').length+' 项','通过阶段验收','projects','check']])+
      '<div class="j14-main-grid">'+panel('开发任务',all('全部任务',S.tasks.length,'nav','tasks')+btn(S.settings.supervise?'暂停监督':'开启监督','toggle-supervise','',S.settings.supervise?'pause':'play')+btn('推进演示','advance','','refresh'),taskRows(list,3))+
      panel('交付与事件',all('全部项目',S.projects.length,'nav','projects'),o.releases.slice(0,1).map(r=>row(r.name,r.version,smallTag('阶段交付','green'),btn('交付包','v5-op-release',r.id,'file'))).join('')+'<div class="j14-events">'+events(S.activity,3)+'</div>')+'</div>'+
      '<div class="j14-board-bottom j14-process-bottom">'+panel('持续推进',btn('监督规则','nav','tasks','settings'),'<div class="j14-knowledge-path">'+[['flag','明确目标'],['code','执行开发'],['check','证据验收'],['file','完成交付']].map((x,i)=>'<span>'+I(x[0],22)+'<b>'+x[1]+'</b></span>'+(i<3?I('arrow',17):'')).join('')+'</div>')+'</div>';
  }
  function researchBoard() {
    const list=ideas(),active=list.filter(x=>!['rejected','deferred'].includes(x.status)).sort((a,b)=>(a.status!=='review')-(b.status!=='review'));
    const evidence=list.flatMap(x=>x.evidence||[]),pending=list.filter(x=>x.status==='review');
    return metrics([['灵感记录',list.length+' 条','保留原始想法','research','bolt'],['正在深研',list.filter(x=>x.status==='researching').length+' 项','限定范围与成本','research','search'],['等待决策',pending.length+' 项','采纳后再转项目','research','shield','attention'],['已转项目',list.filter(x=>x.projectId).length+' 项','目标与来源可追溯','projects','project']])+
      '<div class="j14-main-grid">'+panel('研究路线',all('全部灵感',list.length,'nav','research'),active.slice(0,3).map(x=>{const [label,tone]=researchLabels[x.status]||['处理中',''];return row(x.title,x.question||x.raw,smallTag(label,tone),btn('详情','v5-rd-detail',x.id,'arrow'),'j14-research-row');}).join('')||empty('暂无正在研究的想法'))+
      panel('依据与下一步',all('统一收件',(v().research?.inbox||[]).filter(x=>x.owner===S.profile).length,'nav','inbox'),'<div class="j14-proof"><div><b>'+evidence.length+'</b><span>证据线索</span></div><div><b>'+evidence.filter(e=>e.type==='counter').length+'</b><span>反证限制</span></div><div><b>'+evidence.filter(e=>e.type==='unknown').length+'</b><span>仍待验证</span></div></div>'+(pending[0]?row(pending[0].title,'比较方案，确认首期范围',smallTag('待决策','amber'),btn('查看方案','v5-rd-detail',pending[0].id,'shield')):empty('当前没有待决策研究'))+'<p class="j14-note">采纳、转项目、交付分别确认。</p>')+'</div>'+
      '<div class="j14-board-bottom j14-process-bottom">'+panel('从想法到成果',btn('记录灵感','nav','inbox','edit'),'<div class="j14-knowledge-path">'+[['edit','记录想法'],['search','比较证据'],['shield','确认方案'],['project','项目交付']].map((x,i)=>'<span>'+I(x[0],22)+'<b>'+x[1]+'</b></span>'+(i<3?I('arrow',17):'')).join('')+'</div>')+'</div>';
  }
  function experienceBoard() {
    const list=knowledgeList(),skills=list.filter(x=>x.kind==='skill'),draft=list.filter(x=>!x.verified),uses=list.reduce((n,x)=>n+(Number(x.uses)||0),0);
    return metrics([['经验记录',list.filter(x=>x.kind==='experience').length+' 条','附环境与适用条件','knowledge','book'],['可用技能',skills.filter(x=>x.status==='可用').length+' 个','验证后发布版本','knowledge','code'],['待验证记录',draft.length+' 条','确认后再复用','knowledge','shield','attention'],['累计复用',uses+' 次','保留使用时版本','knowledge','refresh']])+
      '<div class="j14-main-grid">'+panel('技能版本',all('全部技能',skills.length,'nav','knowledge'),skills.slice(0,3).map(x=>row(x.title,(x.version||'未发布')+' · '+(x.uses||0)+' 次复用',smallTag(x.status||'待整理',x.status==='可用'?'green':'amber'),btn('查看','knowledge-detail',x.id,'arrow'))).join('')||empty('尚未发布技能'))+
      panel('优先验证',all('全部经验',list.length,'nav','knowledge'),draft.slice(0,3).map(x=>row(x.title,x.source||x.tags?.join(' · ')||'检查适用环境与证据',smallTag('待验证','amber'),btn('查看','knowledge-detail',x.id,'arrow'))).join('')||empty('没有待验证的经验'))+'</div>'+
      '<div class="j14-board-bottom j14-process-bottom">'+panel('经验闭环',btn('快速记录','nav','inbox','edit'),'<div class="j14-knowledge-path">'+[['edit','终端记录'],['check','验证经验'],['code','发布技能'],['refresh','使用反馈']].map((x,i)=>'<span>'+I(x[0],22)+'<b>'+x[1]+'</b></span>'+(i<3?I('arrow',17):'')).join('')+'</div>')+'</div>';
  }
  function familyBoard() {
    const publicMode=J5.isPublic(),l=publicMode?null:S.learning[S.profile],todos=S.familyTodos.filter(t=>!t.done),playing=v().vm?.nowPlaying;
    const active=playing&&playing.owner===S.profile&&!publicMode?playing.title:'一段故事，或十分钟语言练习。';
    return '<div class="j14-family-grid"><section class="j14-panel j14-family-voice"><div class="j14-family-visual j7-home-visual" aria-hidden="true" inert></div><div><span class="j14-eyebrow">JARVIS / FOR YOU</span><h2>'+esc(publicMode?'欢迎来到家庭空间':P().name+'，贾维斯在这里')+'</h2><p>聊聊今天，一起学点新知识。</p><div class="j14-family-actions">'+btn('语音对话','v5-vm-board-chat','','mic','primary')+btn('语言陪练','v5-vm-board-language','','language')+btn('听个故事','v5-vm-board-story','','book')+'</div></div></section><div class="j14-family-right">'+panel('家庭安排',all('全部安排',S.familyTodos.length,'nav','family'),todos.slice(0,3).map(t=>row(t.text,'共同事项',smallTag('待完成',''),publicMode?'':btn('完成','v5-vm-family-todo',t.id,'check'))).join('')||empty('今天的共同安排已完成'))+
      panel(publicMode?'认识你的管家':'我的学习',publicMode?btn('确认档案','v5-vm-identity','','family'):btn('学习计划','nav','learning','language'),publicMode?'<div class="j14-prompt"><h3>确认档案，接着自己的上次进度。</h3><p>公共空间不展示个人学习和记忆。</p></div>':'<div class="j14-learning-stats"><div><strong>'+l.minutes+'</strong><span>累计分钟</span></div><div><strong>'+l.completed+'</strong><span>完成练习</span></div><div><strong>'+l.days+'</strong><span>学习天数</span></div></div><p class="j14-note">'+esc(active)+'</p>')+'</div></div>'+
      '<div class="j14-family-bottom"><div>'+I('cloud',27)+'<strong>26°</strong><span>广州 · 多云<span>天气示例</span></span></div><div>'+I('book',24)+'<span><b>'+liveStories().length+' 则可听故事</b><small>短故事连接成知识脉络</small></span>'+btn('浏览故事',publicMode?'nav':'v5-k-temple-tab',publicMode?'chat':'stories','arrow')+'</div><div>'+I('heart',24)+'<span><b>各自陪伴，各自记忆</b><small>'+esc(publicMode?'确认本人档案后开启个人记录':'你的学习与私人记录分别保存')+'</small></span></div></div>';
  }
  const renderers={all:allBoard,family:familyBoard,knowledge:knowledgeBoard,operations:operationsBoard,development:developmentBoard,research:researchBoard,experience:experienceBoard};
  function screen() {
    const manage=canManage(),available=manage?[['all','全域总览','screen'],...domains]:[['family','家庭陪伴','family'],['knowledge','知识神殿','book']];
    let key=v().board||'all';if(!manage&&!['family','knowledge'].includes(key))key='family';if(!renderers[key])key=manage?'all':'family';
    const item=available.find(d=>d[0]===key),title=item?.[1]||'家庭陪伴';
    const actions='<time id="tv-clock">'+now()+'</time>'+btn('语音对话','nav','chat','mic')+btn('全屏显示','fullscreen','','fullscreen')+btn('返回管理','exit-screen','','close');
    return '<div class="j14-dashboard j14-screen" data-board="'+key+'" data-j14-board="'+key+'">'+head('大屏中心','当前：'+title,actions,true)+'<nav class="j14-board-tabs" aria-label="大屏切换">'+available.map(d=>'<button data-act="v5-board" data-id="'+d[0]+'" class="'+(key===d[0]?'active':'')+'" aria-current="'+(key===d[0]?'page':'false')+'">'+I(d[2],17)+d[1]+'</button>').join('')+'</nav>'+renderers[key]()+footer((J5.isPublic()?'家庭公共空间':'当前档案 '+P().name)+' · 模拟状态与管理页面联动')+'</div>';
  }
  J5.routes.overview=overview;J5.routes.screen=screen;
  for(const d of domains)if(J5.boards[d[0]])J5.boards[d[0]].render=renderers[d[0]];
  window.J14Dashboards={overview,screen,renderers,original,domainSnapshot,liveStories};
  if(['overview','screen'].includes(U.route))render();
})();
