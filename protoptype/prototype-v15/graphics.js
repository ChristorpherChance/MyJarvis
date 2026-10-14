/* V15: current-state graphics with the same business actions and scope. */
(function(){
 'use strict';
 const base=window.J14Dashboards;if(!base)return;
 const key='jarvis-v15-graphic-preferences';let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch{}
 const state={map:saved.map==='devices'?'devices':'domains'};
 const manage=()=>admin()&&!J5.isPublic(), esc=x=>E(String(x??'')), btn=(text,act='nav',id='',icon='arrow',cls='')=>B(text,act,id,'j14-button '+cls,icon);
 const domainInfo=[['family','家庭陪伴','family'],['knowledge','知识神殿','book'],['development','开发监督','code'],['operations','运行管理','machine'],['research','灵感研究','bolt'],['experience','经验技能','history']];
 const s=()=>J5.state(),health=x=>machine(x.host)?.status!=='online'?'offline':x.health;
 const taskNeed=t=>['blocked','failed','approval','waitingUser','waitingQuota'].includes(t.status);
 const priority=t=>({failed:0,blocked:0,waitingUser:1,approval:1,waitingQuota:2,waitingResource:2,validating:3,running:4,queued:5,paused:6}[t.status]??7);
 const unresolved=()=>s().knowledgeCenter.books.reduce((n,b)=>n+(b.doubts||[]).filter(d=>d.critical&&d.status!=='resolved').length,0);
 function pie(parts,icon){
  const total=parts.reduce((n,p)=>n+Math.max(0,Number(p.value)||0),0);let offset=0;
  const arcs=parts.filter(p=>p.value>0).map(p=>{const length=p.value/total*100,gap=parts.filter(p=>p.value>0).length>1?.8:0;const arc='<circle cx="36" cy="36" r="28" pathLength="100" fill="none" stroke="var('+p.color+')" stroke-width="6" stroke-dasharray="'+Math.max(0,length-gap)+' '+(100-length+gap)+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 36 36)"/>';offset+=length;return arc}).join('');
  return '<svg class="j15-pie" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="28" fill="none" stroke="var(--tp-line)" stroke-width="6" opacity=".35"/>'+arcs+I(icon,20).replace('<svg ','<svg x="26" y="26" ')+'</svg>';
 }
 function metric(title,value,note,route,icon,parts,tone=''){
  const description=parts.map(p=>p.name+' '+p.value).join('；');
  return '<button class="j15-metric '+tone+'" data-act="nav" data-id="'+route+'" title="'+esc(title+'：'+description)+'" aria-label="'+esc(title+' '+value+'。'+description)+'">'+pie(parts,icon)+'<span class="j15-metric-copy"><span>'+title+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></span>'+I('arrow',14)+'</button>';
 }
 function metrics(){
  const m=S.machines,online=m.filter(x=>x.status==='online').length,sleep=m.filter(x=>x.status==='sleep').length,offline=m.filter(x=>x.status==='offline').length,unknown=m.length-online-sleep-offline;
  const tasks=S.tasks,active=activeTasks().length,need=tasks.filter(taskNeed).length,paused=tasks.filter(t=>t.status==='paused').length,ended=tasks.filter(t=>['completed','cancelled'].includes(t.status)).length,queued=tasks.filter(t=>['queued','waitingResource'].includes(t.status)).length,other=Math.max(0,tasks.length-active-need-paused-ended-queued);
  const services=s().ops.services,healthy=services.filter(x=>health(x)==='healthy').length,slow=services.filter(x=>health(x)==='degraded').length,unhealthy=services.filter(x=>['down','offline'].includes(health(x))).length,unchecked=services.length-healthy-slow-unhealthy;
  const approvals=pendingApprovals(),high=approvals.filter(a=>a.level==='L3').length;
  return '<section class="j15-metrics" aria-label="状态比例与数量">'+
   metric('在线设备',online+' / '+m.length,sleep+' 休眠 · '+offline+' 离线','machines','machine',[{name:'在线',value:online,color:'--tp-accent'},{name:'休眠',value:sleep,color:'--tp-secondary'},{name:'离线',value:offline,color:'--tp-bad'},{name:'待核实',value:unknown,color:'--tp-muted'}])+
   metric('开发监督',active+' 项推进',need+' 待处理 · '+(S.settings.supervise?'已开启':'已暂停'),'tasks','code',[{name:'推进',value:active,color:'--tp-accent'},{name:'待处理',value:need,color:'--tp-warn'},{name:'人工暂停',value:paused,color:'--tp-muted'},{name:'已结束',value:ended,color:'--tp-good'},{name:'待执行',value:queued,color:'--tp-secondary'},{name:'待核实',value:other,color:'--tp-muted'}])+
   metric('健康服务',healthy+' / '+services.length,(services.length-healthy)+' 项待检查','services','cloud',[{name:'健康',value:healthy,color:'--tp-accent'},{name:'较慢',value:slow,color:'--tp-warn'},{name:'异常或离线',value:unhealthy,color:'--tp-bad'},{name:'待检查',value:unchecked,color:'--tp-muted'}])+
   metric('待办审批',approvals.length+' 项',high?high+' 项需二次确认':'按影响逐项审核','approvals','shield',[{name:'需二次确认',value:high,color:'--tp-bad'},{name:'其他待审批',value:approvals.length-high,color:'--tp-warn'}],'attention')+'</section>';
 }
 function domainMap(){
  const nodes=domainInfo.map((d,i)=>{const snap=base.domainSnapshot(d[0]);return '<button class="j15-map-node node-'+i+'" data-act="v5-board" data-id="'+d[0]+'" data-j15-domain="'+d[0]+'" data-j15-note="'+esc(snap.note)+'" title="'+esc(d[1]+'：'+snap.value+' '+snap.unit+'。'+snap.note)+'"><span>'+I(d[2],16)+'<b>'+d[1]+'</b>'+I('arrow',12)+'</span><span class="j15-node-value"><strong>'+esc(snap.value)+'</strong><small>'+esc(snap.unit)+'</small></span></button>'}).join('');
  const ends=[[170,42],[170,116],[170,190],[430,42],[430,116],[430,190]];
  const wires=ends.map((e,i)=>'<path data-wire="'+domainInfo[i][0]+'" d="M300 116 C'+(e[0]<300?'225':'375')+' 116 '+(e[0]<300?'225':'375')+' '+e[1]+' '+e.join(' ')+'"/><circle cx="'+e[0]+'" cy="'+e[1]+'" r="3"/>').join('');
  return '<div class="j15-network" data-j15-map="domains"><svg class="j15-wires" viewBox="0 0 600 232" preserveAspectRatio="none" aria-hidden="true"><defs><radialGradient id="j15-map-halo"><stop offset="0" stop-color="var(--tp-accent)" stop-opacity=".13"/><stop offset="1" stop-color="var(--tp-accent)" stop-opacity="0"/></radialGradient></defs><ellipse cx="300" cy="116" rx="166" ry="109" fill="url(#j15-map-halo)"/><circle class="j15-orbit" cx="300" cy="116" r="74"/><circle class="j15-orbit outer" cx="300" cy="116" r="99"/>'+wires+'</svg>'+nodes+'<button class="j15-hub" data-act="nav" data-id="chat" title="与贾维斯语音对话"><span class="j15-hub-mark">J</span><strong>贾维斯</strong><small>'+I('mic',11)+'语音指挥</small></button></div>';
 }
 function deviceMap(){
  const labels={online:'在线',sleep:'休眠',offline:'离线'};
  const devices=S.machines.map(m=>{const label=labels[m.status]||'待核实',cpu=Number.isFinite(m.cpuUse)?'CPU '+m.cpuUse+'%':'CPU 未上报',ram=Number.isFinite(m.ramUse)?'内存 '+m.ramUse+'%':'内存未上报',description=m.name+' · '+label+' · '+(m.status==='online'?cpu+' / '+ram:'最近 '+(m.last||'未上报'));return '<button class="j15-device '+m.status+'" data-act="machine" data-id="'+esc(m.id)+'" data-j15-note="'+esc(description)+'" title="'+esc(description)+'"><span class="j15-device-name">'+I(m.kind==='laptop'?'screen':m.kind==='nas'?'database':'machine',15)+'<b>'+esc(m.name.split(' · ')[0])+'</b></span><span class="j15-device-id">'+esc(m.id)+'</span><span class="j15-device-state"><i></i>'+label+'</span></button>'}).join('');
  return '<div class="j15-device-map" data-j15-map="devices"><div class="j15-device-legend"><span><i class="online"></i>在线</span><span><i class="sleep"></i>休眠</span><span><i class="offline"></i>离线</span><small>点设备查看详情</small></div><div class="j15-device-grid">'+devices+'</div></div>';
 }
 function taskLanes(){
  const list=S.tasks.filter(t=>!['completed','cancelled'].includes(t.status)).slice().sort((a,b)=>priority(a)-priority(b)).slice(0,3);
  return '<div class="j15-task-lanes"><div class="j15-lanes-label"><strong>优先任务</strong><span>'+btn('全部 '+S.tasks.length,'nav','tasks','arrow')+btn(S.settings.supervise?'暂停监督':'开启监督','toggle-supervise','',S.settings.supervise?'pause':'play')+'</span></div>'+ (list.length?list.map(t=>{const n=Math.max(0,Math.min(100,Number(t.progress)||0));return '<div class="j15-lane '+(taskNeed(t)?'needs':'')+'"><button data-act="task" data-id="'+esc(t.id)+'" title="'+esc(t.title+' · '+(project(t.project)?.name||'未关联项目')+' · '+(t.agent||'待分配'))+'">'+esc(t.title)+'</button><span class="j15-lane-track" role="img" aria-label="模拟进度 '+n+'%"><i style="width:'+n+'%"></i></span><b>'+n+'%</b>'+status(t)+'</div>'}).join(''):'<p class="j15-empty">当前没有开发任务</p>')+'</div>';
 }
 function commandMap(){
  return '<section class="j14-panel j15-map-panel"><header><h2>全景地图</h2><div class="j15-map-toggle" role="group" aria-label="切换全景图"><button data-j15-act="map" data-id="domains" aria-pressed="'+(state.map==='domains')+'">'+I('link',14)+'领域</button><button data-j15-act="map" data-id="devices" aria-pressed="'+(state.map==='devices')+'">'+I('machine',14)+'设备</button></div></header><div class="j15-map-host">'+(state.map==='devices'?deviceMap():domainMap())+'</div><p class="j15-map-caption" aria-live="polite">'+(state.map==='devices'?'全部设备的最近状态，点选查看用途与项目。':'六个领域的当前状态，点选进入对应大屏。')+'</p>'+taskLanes()+'</section>';
 }
 function attention(){
  const list=J6Usability.getSummaryItems(),approvals=pendingApprovals().length,gaps=s().knowledgeCenter.gaps.filter(x=>x.state==='pending').length,need=unresolved(),bad=s().ops.services.filter(x=>health(x)!=='healthy').length;
  const rows=list.map((x,i)=>{const urgent=x.tone==='urgent',attention=x.tone==='attention',decision=x.category==='decision',tag=decision?'待审核':urgent||attention?'需处理':'可继续';return '<article class="j15-attention-row '+(urgent?'urgent':'')+'"><span class="j15-attention-number">0'+(i+1)+'</span><div class="j15-attention-copy"><strong title="'+esc(x.title)+'">'+esc(x.title)+'</strong><p title="'+esc(x.detail)+'">'+esc(x.detail)+'</p></div><div class="j15-attention-action">'+badge(tag,urgent?'red':attention||decision?'amber':'blue')+btn(decision?'审核':'查看',x.action,x.id,x.icon||'arrow')+'</div></article>'}).join('');
  return '<section class="j14-panel j15-attention-panel"><header><h2>重点待办</h2><div>'+btn('审批清单 '+approvals,'nav','approvals','shield')+'</div></header><div class="j15-attention-list">'+rows+'</div><div class="j15-next"><strong>后续处理</strong><div>'+btn('疑点 '+need,'nav','collation','edit')+btn('补充 '+gaps,'v5-k-temple-tab','gaps','book')+btn('服务 '+bad,'nav','services','cloud')+'</div></div><footer class="j15-backup">'+I('shield',14)+'备份 '+esc(S.lastBackup)+'<span>按紧急程度展示</span></footer></section>';
 }
 function commandContent(){return metrics()+'<div class="j15-command-layout">'+commandMap()+attention()+'</div>';}
 const previousOverview=J5.routes.overview;
 function overview(){if(!manage())return previousOverview();return '<div class="j14-dashboard j14-overview j15-dashboard" data-j14-overview data-j15-overview><header class="j14-head"><div><h1>总览中心</h1><p>全域状态、任务进度与重点待办。</p></div><div class="j14-head-actions">'+btn('语音对话','nav','chat','mic','primary')+btn('全域总览','v5-board','all','screen')+'</div></header>'+commandContent()+'<footer class="j14-foot"><span class="j14-live-dot"></span>当前档案 '+esc(P().name)+' · 图形随操作更新 · 模拟状态</footer></div>';}
 base.renderers.all=commandContent;J5.routes.overview=overview;
 const oldScreen=J5.routes.screen;J5.routes.screen=function(){const html=oldScreen();return html.includes('data-j14-board="all"')?html.replace('class="j14-dashboard j14-screen"','class="j14-dashboard j14-screen j15-dashboard"'):html};
 function setMap(mode){if(!['domains','devices'].includes(mode)||!manage())return;state.map=mode;try{localStorage.setItem(key,JSON.stringify(state))}catch{}document.querySelectorAll('.j15-map-host').forEach(n=>n.innerHTML=mode==='devices'?deviceMap():domainMap());document.querySelectorAll('[data-j15-act="map"]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.id===mode)));document.querySelectorAll('.j15-map-caption').forEach(n=>n.textContent=mode==='devices'?'全部设备的最近状态，点选查看用途与项目。':'六个领域的当前状态，点选进入对应大屏。');}
 document.addEventListener('click',e=>{const el=e.target.closest('[data-j15-act]');if(!el)return;e.preventDefault();if(el.dataset.j15Act==='map')setMap(el.dataset.id)},true);
 function previewNode(e){const el=e.target.closest?.('[data-j15-note]'),panel=el?.closest('.j15-map-panel');if(!panel)return;panel.querySelector('.j15-map-caption').textContent=el.dataset.j15Note;panel.querySelectorAll('[data-wire]').forEach(n=>n.classList.toggle('is-active',n.dataset.wire===el.dataset.j15Domain));}
 document.addEventListener('pointerover',previewNode);document.addEventListener('focusin',previewNode);
 document.addEventListener('pointerout',e=>{const panel=e.target.closest?.('.j15-map-panel');if(!panel||panel.contains(e.relatedTarget))return;panel.querySelectorAll('[data-wire]').forEach(n=>n.classList.remove('is-active'));panel.querySelector('.j15-map-caption').textContent=state.map==='devices'?'全部设备的最近状态，点选查看用途与项目。':'六个领域的当前状态，点选进入对应大屏。';});
 window.J15Graphics={state,setMap,metrics,domainMap,deviceMap,commandContent,overview};
 if(['overview','screen'].includes(U.route))render();
})();
