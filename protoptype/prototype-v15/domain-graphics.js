(function () {
  'use strict';
  if (!window.J14Dashboards || typeof J5 === 'undefined') return;
  const D = window.J14Dashboards;
  const esc = x => E(String(x ?? ''));
  const number = x => Math.max(0, Number(x) || 0);
  const state = () => J5.state();
  const canManage = () => admin() && !J5.isPublic();
  const originals = {};
  const tones = {accent:'var(--tp-accent)',secondary:'var(--tp-secondary)',good:'var(--tp-good)',warn:'var(--tp-warn)',bad:'var(--tp-bad)',muted:'var(--tp-muted)'};
  function template(html) { const t=document.createElement('template');t.innerHTML=html;return t; }
  function title(panel, text) { const h=panel?.querySelector(':scope>header h2');if(h)h.textContent=text; }
  function body(panel, html) { const b=panel?.querySelector(':scope>.j14-panel-body');if(b)b.innerHTML=html; }
  function bottomPanel(t) { return t.content.querySelector('.j14-board-bottom>.j14-panel'); }
  function valueNode(label, count, unit, icon, tone='accent', act='nav', id='') {
    return '<button class="j15-flow-node '+tone+'" data-act="'+act+'" data-id="'+esc(id)+'"><span class="j15-flow-symbol">'+I(icon,18)+'</span><span class="j15-flow-copy"><span>'+esc(label)+'</span><b>'+esc(count)+'<small>'+esc(unit)+'</small></b></span></button>';
  }
  function flow(items, label, note='', links=true) {
    return '<div class="j15-flow" role="group" aria-label="'+esc(label)+'">'+items.map((x,i)=>valueNode(...x)+(links&&i<items.length-1?'<span class="j15-flow-link" aria-hidden="true">'+I('arrow',13)+'</span>':'')).join('')+'</div>'+(note?'<p class="j15-chart-note">'+esc(note)+'</p>':'');
  }
  function ring(parts, center, caption, aria, cls='') {
    const total=parts.reduce((n,x)=>n+number(x.value),0),r=28,c=2*Math.PI*r;
    let offset=0;
    const arcs=parts.filter(x=>number(x.value)>0).map(x=>{const length=total?number(x.value)/total*c:0,out='<circle class="j15-ring-segment '+x.tone+'" cx="36" cy="36" r="28" fill="none" stroke="'+tones[x.tone]+'" stroke-width="6" stroke-dasharray="'+length.toFixed(3)+' '+(c-length).toFixed(3)+'" stroke-dashoffset="'+(-offset).toFixed(3)+'"/>';offset+=length;return out;}).join('');
    return '<div class="j15-ring '+cls+'"><svg viewBox="0 0 72 72" role="img" aria-label="'+esc(aria)+'"><circle cx="36" cy="36" r="28" fill="none" stroke="var(--tp-line)" stroke-width="6"/>'+arcs+'<text class="j15-ring-value" x="36" y="36" text-anchor="middle" dominant-baseline="central">'+esc(center)+'</text><text class="j15-ring-caption" x="36" y="49" text-anchor="middle">'+esc(caption)+'</text></svg></div>';
  }
  function stacked(parts, unit, label) {
    const total=parts.reduce((n,x)=>n+number(x.value),0);
    const aria=label+'：'+parts.map(x=>x.label+' '+number(x.value)+' '+unit).join('，');
    return '<div class="j15-distribution" role="group" aria-label="'+esc(aria)+'"><div class="j15-segmented-bar" aria-hidden="true">'+(total?parts.filter(x=>number(x.value)>0).map(x=>'<span class="'+x.tone+'" style="width:'+number(x.value)/total*100+'%"></span>').join(''):'<span class="muted" style="width:100%;opacity:.25"></span>')+'</div><div class="j15-chart-legend">'+parts.map(x=>'<button data-act="nav" data-id="'+esc(x.route||'tasks')+'" class="'+x.tone+'"><i aria-hidden="true"></i><span>'+esc(x.label)+'</span><b>'+number(x.value)+'<small>'+unit+'</small></b></button>').join('')+'</div></div>';
  }
  function family(html) {
    const t=template(html),panel=t.content.querySelector('.j14-family-right>.j14-panel'),h=panel?.querySelector(':scope>header h2');
    if(h) {
      const list=S.familyTodos||[],done=list.filter(x=>x.done).length;
      const wrap=document.createElement('div');wrap.className='j15-family-heading';h.replaceWith(wrap);wrap.append(h);
      wrap.insertAdjacentHTML('beforeend','<div class="j15-family-completion">'+ring([{value:done,tone:'accent'},{value:list.length-done,tone:'muted'}],done+'/'+list.length,'已完成','共同安排已完成 '+done+' / '+list.length+' 项','small')+'</div>');
    }
    return t.innerHTML;
  }
  function knowledge(html) {
    const t=template(html),center=state().knowledgeCenter;
    if(!canManage()) {
      const stories=D.liveStories(),groups=Array.from(new Set(stories.map(s=>s.topic||'未分类'))).map(topic=>({topic,count:stories.filter(s=>(s.topic||'未分类')===topic).length}));
      const panel=t.content.querySelector('.j14-main-grid>.j14-panel');
      if(panel&&groups.length)panel.querySelector(':scope>.j14-panel-body').insertAdjacentHTML('afterbegin','<div class="j15-story-topics" aria-label="可听故事主题">'+groups.map(x=>'<span>'+I('book',13)+esc(x.topic)+'<b>'+x.count+'</b></span>').join('')+'</div>');
      return t.innerHTML;
    }
    const books=center.books||[],count=statuses=>books.filter(b=>statuses.includes(b.status)).length,panel=bottomPanel(t);
    const known=['queued','parsing','ocr','crosscheck','review','published','failed'],other=books.filter(b=>!known.includes(b.status)).length;
    const items=[['待解析',count(['queued']),'部','file','muted','nav','collation'],['解析校对',count(['parsing','ocr','crosscheck']),'部','search','secondary','nav','collation'],['人工精校',count(['review']),'部','edit','warn','nav','collation'],['正式发布',count(['published']),'部','check','good','nav','collation'],['异常处理',count(['failed']),'部','shield','bad','nav','collation']];
    if(other)items.push(['其他状态',other,'部','info','muted','nav','collation']);
    title(panel,'原文阶段');body(panel,flow(items,'书籍当前状态','当前所在阶段 · 关键疑点全部裁决后才能发布',false));
    return t.innerHTML;
  }
  function operations(html) {
    const t=template(html),o=state().ops,panel=bottomPanel(t),health=s=>machine(s.host)?.status!=='online'?'offline':s.health;
    const parts=[{label:'健康',tone:'good',value:0},{label:'较慢',tone:'warn',value:0},{label:'异常',tone:'bad',value:0},{label:'离线',tone:'muted',value:0},{label:'待检查',tone:'secondary',value:0}];
    const healthIndex={healthy:0,degraded:1,down:2,offline:3};
    for(const s of o.services||[])parts[healthIndex[health(s)]??4].value++;
    const total=parts.reduce((n,x)=>n+x.value,0),human=number(o.policy.humanReserve),voice=number(o.policy.voiceReserve),remaining=Math.max(0,100-human-voice),over=human+voice>100;
    const aria=parts.map(x=>x.label+' '+x.value+' 个').join('，');
    title(panel,'服务与资源');
    body(panel,'<div class="j15-operations-graphic"><div class="j15-health-group">'+ring(parts,parts[0].value+'/'+total,'健康服务',aria)+'<div class="j15-health-labels">'+parts.filter(x=>x.value||['健康','较慢','异常','离线'].includes(x.label)).map(x=>'<span class="'+x.tone+'"><i aria-hidden="true"></i>'+x.label+'<b>'+x.value+'</b></span>').join('')+'</div></div><div class="j15-reserve"><div class="j15-reserve-top"><span>资源预留</span><b>后台并发 '+number(o.policy.batchLimit)+'</b></div><div class="j15-reserve-bar" role="img" aria-label="人工预留 '+human+'%，语音预留 '+voice+'%，后台可用 '+remaining+'%'+(over?'，预留合计超过 100%':'')+'">'+(over?'<i class="bad" style="width:100%"></i>':'<i class="accent" style="width:'+human+'%"></i><i class="secondary" style="width:'+voice+'%"></i><i class="muted" style="width:'+remaining+'%"></i>')+'</div><div class="j15-reserve-labels"><span>人工 '+human+'%</span><span>语音 '+voice+'%</span><span>后台 '+remaining+'%</span></div>'+(over?'<p class="j15-chart-note j15-invalid">预留合计超过 100%，请调整配额。</p>':'<p class="j15-chart-note">配额分配 · 当前实际负载见设备管理</p>')+'</div></div>');
    return t.innerHTML;
  }
  function development(html) {
    const t=template(html),panel=bottomPanel(t),list=S.tasks||[];
    const groups=[{label:'执行开发',statuses:['running'],tone:'accent'},{label:'证据验收',statuses:['validating'],tone:'secondary'},{label:'待执行',statuses:['queued','waitingResource'],tone:'muted'},{label:'需处理',statuses:['blocked','failed','approval','waitingUser','waitingQuota'],tone:'warn'},{label:'人工暂停',statuses:['paused'],tone:'muted'},{label:'阶段完成',statuses:['completed'],tone:'good'}];
    const known=groups.flatMap(x=>x.statuses);const other=list.filter(x=>!known.includes(x.status));
    const parts=groups.map(x=>({...x,value:list.filter(t=>x.statuses.includes(t.status)).length}));
    if(other.length)parts.push({label:other.every(x=>x.status==='cancelled')?'已取消':'其他状态',tone:'muted',value:other.length});
    title(panel,'任务分布');body(panel,stacked(parts,'项','已登记任务的当前状态')+'<p class="j15-chart-note">按当前状态统计 · 阶段完成仍需独立交付验收</p>');
    return t.innerHTML;
  }
  function research(html) {
    const t=template(html),list=(state().research?.items||[]).filter(x=>x.owner===S.profile||x.scope!=='private'),evidence=list.flatMap(x=>x.evidence||[]),proof=t.content.querySelector('.j14-proof');
    const parts=[{label:'支持线索',tone:'good',value:evidence.filter(x=>x.type==='support').length,route:'research'},{label:'反证限制',tone:'warn',value:evidence.filter(x=>x.type==='counter').length,route:'research'},{label:'仍待验证',tone:'muted',value:evidence.filter(x=>x.type==='unknown').length,route:'research'}];
    const other=evidence.filter(x=>!['support','counter','unknown'].includes(x.type)).length;if(other)parts.push({label:'未分类',tone:'secondary',value:other,route:'research'});
    if(proof)proof.outerHTML='<div class="j15-evidence"><div class="j15-evidence-head"><strong>'+evidence.length+'<small> 条证据线索</small></strong><span>分别保留各方依据</span></div>'+stacked(parts,'条','研究证据类别')+'<p class="j15-chart-note">数量分布不代表结论可信度</p></div>';
    const panel=bottomPanel(t),count=statuses=>list.filter(x=>statuses.includes(x.status)).length;
    title(panel,'研究进展');body(panel,flow([['研究记录',list.length,'项','edit','muted','nav','research'],['研究推进',count(['researching','framing','discussion']),'项','search','accent','nav','research'],['等待决策',count(['review']),'项','shield','warn','nav','research'],['转为项目',list.filter(x=>x.projectId).length,'项','project','good','nav','projects']],'研究记录与当前阶段','记录总量、当前阶段与转项目分别统计'));
    return t.innerHTML;
  }
  function experience(html) {
    const t=template(html),panel=bottomPanel(t),list=visibleKnowledge(),skills=list.filter(x=>x.kind==='skill'&&x.verified&&x.status==='可用');
    title(panel,'经验闭环');body(panel,flow([['已记录',list.length,'条','edit','muted','nav','knowledge'],['已验证',list.filter(x=>x.verified).length,'条','check','accent','nav','knowledge'],['可用技能',skills.length,'个','code','good','nav','knowledge'],['累计复用',list.reduce((n,x)=>n+number(x.uses),0),'次','refresh','secondary','nav','knowledge']],'当前可见记录的整理与复用','记录与技能分别计数 · 复用按使用次数统计'));
    return t.innerHTML;
  }
  const adapters={family,knowledge,operations,development,research,experience};
  for(const [key,adapt] of Object.entries(adapters)) {
    originals[key]=D.renderers[key];
    D.renderers[key]=function(){return adapt(originals[key].apply(this,arguments));};
    if(J5.boards[key])J5.boards[key].render=D.renderers[key];
  }
  window.J15DomainGraphics={originals,adapters};
  if(U.route==='screen')render();
})();
