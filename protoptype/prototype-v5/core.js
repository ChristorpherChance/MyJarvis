const J5 = {
  routes: {}, actions: {}, forms: {}, overlays: {}, boards: {}, snapshots: {}, initializers: [],
  publicRoutes: new Set(['chat','family','learning','memory','personas','temple','inbox','screen','settings','knowledge']),
  init() {
    if (!S.v5 || S.v5.schema !== 5) S.v5 = {schema:5, board:'all', welcome:true, terminal:false};
    this.initializers.forEach(fn => fn(S.v5));
    return S.v5;
  },
  state() { return this.init(); },
  isPublic() { return Boolean(U.vm5?.unknown); },
  commit(message) { persist(); render(); if(message)toast(message); },
  open(key,id='') {
    if(this.isPublic()&&!['guide','vm-identity','vm-microphone','vm-session-clear','vm-cook','vm-story-route'].includes(key)){
      toast('请先确认自己的档案，再查看个人内容或管理事项。',true);
      key='vm-identity';id='';
    }
    U.returnFocus=document.activeElement;
    U.overlay={type:'v5',key,id};
    renderOverlay();
    setTimeout(()=>document.querySelector('[role="dialog"] input:not([type="hidden"]),[role="dialog"] textarea,[role="dialog"] select,[role="dialog"] button')?.focus(),50);
  },
  navigate(route) { navigate(route); },
  summary(key) {
    try { return this.snapshots[key]?.() || {summary:'已接入统一状态',metrics:[]}; }
    catch { return {summary:'等待领域状态',metrics:[]}; }
  }
};

J5.actions['v5-board']={admin:false,run(id){
  if((!admin()||J5.isPublic())&&!['family','knowledge'].includes(id))return toast('此大屏属于管理范围。',true);
  J5.state().board=id; persist(); navigate('screen');
}};
J5.actions['v5-terminal']={admin:false,run(){
  const v=J5.state();v.terminal=!v.terminal;persist();navigate('chat');
}};
J5.actions['v5-guide']={admin:false,run(){J5.open('guide')}};
J5.actions['v5-reset']={admin:true,run(){J5.open('reset')}};
J5.actions['v5-reset-confirm']={admin:true,run(){
  J5.cancelVoice?.();S=seed();S.settings.supervise=false;normalizeState();J5.init();
  U={route:'overview',filter:'all',search:'',view:'grid',taskView:'list',knowledgeTab:'experience',approvalTab:'pending',projectFilter:'all',overlay:null,detailTab:'overview',screenType:'manage',settingsTab:'general',chatMode:'general',lessonStep:0,lessonType:'english',voicePhase:'idle',voiceText:'',voiceAnswer:'',menu:false,timer:null};
  persist();render();toast('已恢复 V5 初始演示数据。');
}};
J5.actions['v5-export']={admin:false,run(){
  if(J5.isPublic())return toast('请先确认自己的档案。',true);
  const v=J5.state(),mine={
    profile:S.profile,chat:S.chat[S.profile],learning:S.learning[S.profile],preferences:S.preferences[S.profile],
    memories:v.vm?.memories?.[S.profile]||[],policy:v.vm?.policies?.[S.profile],
    inbox:(v.research?.inbox||[]).filter(x=>x.owner===S.profile),
    courses:v.knowledgeCenter?.courses?.[S.profile],knowledgeProgress:v.knowledgeCenter?.progress?.[S.profile],
    privateKnowledge:S.knowledge.filter(k=>k.scope==='private'&&k.owner===S.profile)
  };
  const scope=admin()?{...mine,machines:S.machines,projects:S.projects,tasks:S.tasks,approvals:S.approvals,
    sharedKnowledge:S.knowledge.filter(k=>k.scope!=='private'),operations:v.ops,
    research:(v.research?.items||[]).filter(x=>x.scope!=='private'||x.owner===S.profile),
    sourceRegistry:v.knowledgeCenter?.sources,books:v.knowledgeCenter?.books,
    settings:S.settings,familyTodos:S.familyTodos}:mine;
  download('Jarvis-V5-'+(admin()?'可见管理快照':P().name+'个人快照')+'.json',JSON.stringify(scope,null,2));
}};
J5.overlays.guide=()=>{
  modal('探索贾维斯 V5','<div class="j5-guide-intro"><span class="j5-emblem">J</span><div><h3>家庭的语音管家 · 工作的统一中枢</h3><p class="muted small">这是可离线体验的模拟原型，所有外部操作均为演示。</p></div></div><div class="j5-guide-grid">'+[
    ['chat','mic','语音优先','用情景示例体验聆听、回应、打断和快速记录。'],
    ['temple','book','知识神殿','从原件校对到故事、知识关系与个人课程。'],
    ['memory','heart','记忆神殿','确认候选、调整专属管家、修改与遗忘。'],
    ['research','bolt','灵感到交付','研究比较、决定采纳，再转项目持续开发。'],
    ['services','machine','运行中的应用','查看服务与部署，体验测试发布和恢复。'],
    ['screen','screen','大屏矩阵','进入领域大屏，再回到全域总控。']
  ].filter(x=>admin()&&!J5.isPublic()||J5.publicRoutes.has(x[0])).map(x=>'<button class="j5-guide-card" data-act="nav" data-id="'+x[0]+'">'+I(x[1],24)+'<strong>'+x[2]+'</strong><span>'+x[3]+'</span></button>').join('')+'</div><div class="notice mt20">'+I('info',18)+'修改保存在当前浏览器。恢复演示会清空本原型记录；不会连接或修改真实机器。</div>',(admin()&&!J5.isPublic()?B('恢复初始演示','v5-reset')+B('导出可见快照','v5-export'):'')+B('开始探索','close-overlay','','primary'),true);
};
J5.overlays.reset=()=>modal('恢复初始演示','<p>将清空本原型保存的模拟修改，包括校对决定、记忆候选、研究和部署记录。</p><p class="muted small">可以先导出快照留存。</p>',B('取消','close-overlay')+B('导出快照','v5-export')+B('恢复演示','v5-reset-confirm','','danger'));

const j5LegacyRoute=renderRoute;
renderRoute=function(){
  J5.init();
  if(!admin()&&!J5.publicRoutes.has(U.route))U.route='chat';
  return J5.routes[U.route]?J5.routes[U.route]():j5LegacyRoute();
};
const j5LegacyOverlay=renderOverlay;
renderOverlay=function(){
  if(U.overlay?.type==='v5'){
    const view=J5.overlays[U.overlay.key];
    if(view)return view(U.overlay.id);
    closeOverlay();return;
  }
  return j5LegacyOverlay();
};
const j5LegacyAction=handleAction;
handleAction=function(act,id='',el){
  J5.init();
  if(J5.actions[act]){
    const action=J5.actions[act];
    if(action.admin&&(!admin()||J5.isPublic()))return toast('这个操作属于管理范围。',true);
    return action.run(id,el);
  }
  if(J5.isPublic()&&!['nav','profiles','switch-profile','close-overlay','exit-screen','fullscreen','menu','close-menu'].includes(act))return toast('请先确认自己的档案。',true);
  if(act==='voice')return navigate('chat');
  if(['memories','save-memory'].includes(act))return navigate('memory');
  if(act==='screen'){J5.state().board=admin()?'all':'family';return navigate('screen')}
  if(act==='family-screen'){J5.state().board='family';return navigate('screen')}
  if(act==='switch-profile'){
    if(!profiles.some(p=>p.id===id))return;
    J5.cancelVoice?.();
    if(U.vm5)U.vm5.unknown=false;
    if(window.speechSynthesis)speechSynthesis.cancel();
    const wasTerminal=J5.state().terminal;
    const result=j5LegacyAction(act,id,el);
    U.overlay=null;U.voicePhase='idle';U.voiceText='';U.voiceAnswer='';U.voiceActions=[];U.v5Voice=null;U.vmPublic=false;
    J5.state().terminal=wasTerminal||!admin();
    J5.state().board=admin()?'all':'family';
    navigate(admin()?'overview':'chat');return result;
  }
  if(act==='confirm-reset-data')return J5.actions['v5-reset-confirm'].run();
  if(act==='export-state')return J5.actions['v5-export'].run();
  return j5LegacyAction(act,id,el);
};
const j5LegacyNavigate=navigate;
navigate=function(route){
  J5.init();
  if(J5.isPublic()&&!['chat','screen'].includes(route)){toast('请先确认档案，再进入个人或管理空间。',true);J5.open('vm-identity');return}
  if(!admin()&&!J5.publicRoutes.has(route)){toast('已进入你的家庭语音空间。');route='chat'}
  if(U.route==='chat'&&route!=='chat')J5.cancelVoice?.();
  return j5LegacyNavigate(route);
};
const j5LegacyShow=show;
show=function(type,id='',extra={}){
  if(J5.isPublic()&&!['profiles','voice'].includes(type))return J5.open('vm-identity');
  if(['memories','edit-memory'].includes(type))return navigate('memory');
  return j5LegacyShow(type,id,extra);
};
shell=function(){
  J5.init();
  const v=J5.state();
  const manage=admin()&&!J5.isPublic();
  const groups=manage?[
    ['指挥与交互',[['overview','home','总览工作台'],['chat','mic','语音管家'],['screen','screen','大屏矩阵']]],
    ['知识与记忆',[['sources','link','知识接入'],['temple','book','知识神殿'],['collation','edit','原文校对'],['memory','heart','记忆神殿']]],
    ['研发与积累',[['research','bolt','灵感与深研'],['tasks','tasks','开发监督',activeTasks().length],['projects','project','项目空间'],['knowledge','code','经验与 Skill'],['inbox','download','统一收件箱']]],
    ['服务器与家庭',[['services','cloud','在线应用'],['machines','machine','机器资产'],['family','family','家庭空间'],['learning','language','学习中心'],['personas','speaker','管家设定']]],
    ['治理',[['approvals','shield','审批与审计',pendingApprovals().length],['operations','chart','资源与费用'],['settings','settings','系统设置']]]
  ]:[
    ['我的家庭管家',[['chat','mic','语音对话'],['temple','book','故事与知识'],['learning','language','我的学习'],['memory','heart','我的记忆'],['personas','speaker','我的管家']]],
    ['家庭与记录',[['family','family','家庭事项'],['inbox','download','我的收件箱'],['screen','screen','家庭大屏'],['settings','settings','个人设置']]]
  ];
  const titles={overview:'总览工作台',chat:'语音管家',screen:'大屏矩阵',sources:'知识接入',temple:'知识神殿',collation:'原文校对',memory:'记忆神殿',research:'灵感与深研',tasks:'开发监督',projects:'项目空间',knowledge:'经验与 Skill',inbox:'统一收件箱',services:'在线应用',machines:'机器资产',family:'家庭空间',learning:'学习中心',personas:'管家设定',approvals:'审批与审计',operations:'资源与费用',settings:'系统设置'};
  document.getElementById('sidebar').innerHTML='<div class="brand"><span class="brand-symbol j5-brand">J</span><div><strong>贾维斯 <sup>V5</sup></strong><small>YOUR PERSONAL INTELLIGENCE</small></div></div><nav class="nav">'+groups.map(g=>'<div class="nav-label">'+g[0]+'</div>'+g[1].map(n=>'<button class="nav-item '+(U.route===n[0]?'active':'')+'" data-act="nav" data-id="'+n[0]+'">'+I(n[1],17)+'<span>'+n[2]+'</span>'+(n[3]?'<span class="nav-count">'+n[3]+'</span>':'')+'</button>').join('')).join('')+'</nav><div class="sidebar-footer"><button class="j5-side-voice" data-act="nav" data-id="chat"><span class="j5-side-orb"></span><span>贾维斯在这里<small>语音优先 · 随时对话</small></span>'+I('mic',17)+'</button><div class="sidebar-status"><span class="dot"></span>交互演示 · 状态本地保存</div></div>';
  document.getElementById('app-header').innerHTML='<div class="row gap12"><button class="icon-button menu-toggle" data-act="menu" aria-label="打开导航">'+I('menu')+'</button><div class="breadcrumb"><span class="workspace-label">'+(manage?'管理工作空间':'家庭语音空间')+'</span><span class="workspace-label">/</span><strong>'+E(titles[U.route]||'贾维斯')+'</strong></div></div><div class="header-right"><button class="header-search" data-act="search">'+I('search',16)+'快速查找<kbd>Ctrl K</kbd></button><span class="demo-tag">V5 · 模拟演示</span><button class="icon-button" data-act="v5-guide" aria-label="原型体验指南">'+I('info')+'</button><button class="icon-button" data-act="notifications" aria-label="通知">'+I('bell')+(manage&&pendingApprovals().length?'<span class="notification-dot"></span>':'')+'</button><button class="profile-btn" data-act="profiles">'+avatar(P())+'<span class="profile-name">'+P().name+'</span>'+I('chevron',14)+'</button></div>';
  document.body.classList.toggle('dark',S.settings.theme==='dark');
  document.body.classList.toggle('senior',['dad','mom'].includes(S.profile));
  document.body.classList.toggle('screen-mode',U.route==='screen');
  document.body.classList.toggle('j5-voice-mode',U.route==='chat');
  document.body.classList.toggle('j5-terminal',U.route==='chat'&&v.terminal);
  document.body.dataset.route=U.route;
};
document.addEventListener('submit',event=>{
  const form=event.target.closest('form[data-form]');if(!form)return;
  const handler=J5.forms[form.dataset.form];if(!handler)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(J5.isPublic())return toast('请先确认自己的档案再保存个人或管理记录。',true);
  if(handler.admin&&!admin())return toast('这个操作属于管理范围。',true);
  const f=Object.fromEntries(new FormData(form));
  return handler.run(f,form.dataset.id||'',form);
},true);
const j5LegacyRender=render;
render=function(){
  J5.init();j5LegacyRender();
  if(admin()&&!['chat','screen'].includes(U.route)){
    const actions=document.querySelector('.page-head .head-actions');
    const domains={temple:'knowledge',sources:'knowledge',collation:'knowledge',research:'research',inbox:'research',tasks:'development',projects:'development',services:'operations',machines:'operations',operations:'operations',knowledge:'experience',family:'family',learning:'family',memory:'family',personas:'family'};
    if(actions&&domains[U.route]&&!actions.querySelector('[data-act="v5-board"]'))actions.insertAdjacentHTML('afterbegin',B('领域大屏','v5-board',domains[U.route],'compact','screen'));
  }
  J5.afterRender?.();
};
