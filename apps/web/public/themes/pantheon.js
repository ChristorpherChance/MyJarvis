/* Original six-deity assembly. Every choice and effect is decorative; no business state is changed. */
(function(global){
 'use strict';
 const mounted=new WeakMap();let serial=0,chosen='zeus';
 const gods=[
  {id:'zeus',name:'宙斯',en:'ZEUS',title:'雷霆与穹顶',element:'雷霆',color:'#e8c685',detail:'分叉雷电与金色天穹构成联络视觉。'},
  {id:'poseidon',name:'波塞冬',en:'POSEIDON',title:'海潮与三叉戟',element:'海潮',color:'#8ed5d5',detail:'三叉戟与海潮涟漪随这段对话流动。'},
  {id:'athena',name:'雅典娜',en:'ATHENA',title:'羽翼与智慧',element:'智慧',color:'#d9d3b2',detail:'羽翼、战盔与猫头鹰照亮知识联络。'},
  {id:'apollo',name:'阿波罗',en:'APOLLO',title:'太阳与竖琴',element:'日冕',color:'#f2cf82',detail:'日冕光线与琴弦脉冲回应你的声音。'},
  {id:'odin',name:'奥丁',en:'ODIN',title:'群鸦与符文',element:'符文',color:'#a3d0da',detail:'双鸦与原创几何符文构成北境联络。'},
  {id:'thor',name:'索尔',en:'THOR',title:'战锤与轰鸣',element:'战锤',color:'#e7bb7b',detail:'战锤、雷弧与冲击环呈现力量的回声。'}
 ];
 const phases={ready:['ASSEMBLY / STANDBY','众神议事厅待命','等待你的下一句话'],listening:['LINK / RECEIVING','正在倾听你的声音','信号汇入 · 接收这一句'],thinking:['COUNCIL / ALIGNING','正在整理你的请求','关联对象与范围 · 准备回应'],speaking:['RESONANCE / RESPONSE','正在向你回应','联络展开 · 你随时可以打断'],interrupted:['CHANNEL / HOLD','对话已经停下','联络暂停 · 等待你继续'],answered:['CONTACT / COMPLETE','回应已经整理好','可以继续追问或选择下一步'],awaiting:['DECISION / YOUR CHOICE','等待你的决定','由你确认 · 再继续推进']};
 function symbol(id){return ({
  zeus:'<path d="M4-15-9 1H0L-5 15 10-4H2Z"/><path d="M-13-11-19-5M13 9 19 4"/>',
  poseidon:'<path d="M0-14V16M-11-10V-3Q-11 3 0 3Q11 3 11-3V-10M-15-5-11-12-7-5M-4-8 0-16 4-8M7-5 11-12 15-5"/>',
  athena:'<path d="M-12-10-9 8 0 14 9 8 12-10 0-5ZM-10-1Q-5-8 0-1Q5-8 10-1M0-1V7M-6 1H-5M5 1H6M-17-9-22-4-17 4M17-9 22-4 17 4"/>',
  apollo:'<path d="M-12-12Q-13 3-5 12H5Q13 3 12-12M-14-12Q-9-6-5-12M14-12Q9-6 5-12M-5-11V10M0-9V11M5-11V10M-10 1H10"/><path d="M0-20V-16M-20-13-16-10M20-13 16-10"/>',
  odin:'<path d="M-2-16V15M-2-15 8-8-2-2M-2-2 8 5-2 12M-21-3-13-9-6-5-11-1-15 8-19 3ZM21-3 13-9 6-5 11-1 15 8 19 3Z"/>',
  thor:'<path d="M-14-10H12V3H-14ZM-3 3V17H3V3M-16-8-19-5V0L-14 3M12-10 16-7V0L12 3M7 9 14 5 11 13 18 10"/>'
 })[id];}
 function statue(g,x){
  let attributes='';
  if(g.id==='zeus')attributes='<path class="ph11-tool" d="m'+(x+26)+' 133-12 23h10l-7 22 24-31h-13l8-14Z"/><path d="M'+(x-11)+' 115q11 21 22 0M'+(x-12)+' 97l5-8 7 6 7-6 5 8"/>';
  if(g.id==='poseidon')attributes='<path class="ph11-tool" d="M'+(x+30)+' 83v131m-11-127v13q11 11 22 0V87m-25 5 3-7 5 7m3-4 3-8 3 8m3 4 5-7 3 7"/><path d="M'+(x-11)+' 115q11 17 22 0"/>';
  if(g.id==='athena')attributes='<path d="M'+(x-14)+' 106q-3-24 18-21l8 9m-22-2 16 4 3 16M'+(x-18)+' 137q-14-13-24-8l17 17-18-4 18 18m43-23q14-13 24-8l-17 17 18-4-18 18"/><g transform="translate('+(x+24)+' 166) scale(.54)">'+symbol('athena')+'</g>';
  if(g.id==='apollo'){let rays='';for(let i=0;i<9;i++){const a=(i/8)*Math.PI;const sx=x+Math.cos(a)*15,sy=108-Math.sin(a)*15;const ex=x+Math.cos(a)*23,ey=108-Math.sin(a)*23;rays+='<path d="M'+sx.toFixed(1)+' '+sy.toFixed(1)+' '+ex.toFixed(1)+' '+ey.toFixed(1)+'"/>';}attributes=rays+'<g class="ph11-tool" transform="translate('+(x+25)+' 162) scale(.8)">'+symbol('apollo')+'</g>';}
  if(g.id==='odin')attributes='<path d="M'+(x-12)+' 106h10m-6-10 17 17M'+(x-9)+' 117l9 14 10-14"/><path class="ph11-raven" d="m'+(x-20)+' 139-13-10-9 8 12 3-8 12 15-8Zm42 0 13-10 9 8-12 3 8 12-15-8Z"/><path class="ph11-tool" d="M'+(x+30)+' 122v83m0-68 9 8-9 8m0 6 9 8-9 8"/>';
  if(g.id==='thor')attributes='<path d="M'+(x-14)+' 100l8-9 6 5 8-5 7 11M'+(x-11)+' 116l11 12 11-12"/><g class="ph11-tool" transform="translate('+(x+29)+' 156) rotate(-18) scale(.95)">'+symbol('thor')+'</g>';
  return '<g class="ph11-figure" data-figure="'+g.id+'"><path class="ph11-arch" d="M'+(x-36)+' 220V101q0-42 36-46 36 4 36 46v119"/><ellipse class="ph11-foot-shadow" cx="'+x+'" cy="219" rx="34" ry="7"/><path class="ph11-robe" d="M'+(x-12)+' 126q-11 8-15 31l7 49-9 12h59l-11-12 8-49q-4-23-15-31Z"/><path class="ph11-body" d="M'+(x-9)+' 123l-11 14 8 37h24l8-37-11-14ZM'+(x-10)+' 174l-2 39h10l3-31 3 31h11l-5-39"/><path class="ph11-arm" d="M'+(x-19)+' 139l-10 24 7 9 14-23m27-10 10 24-7 9-14-23"/><circle class="ph11-head" cx="'+x+'" cy="108" r="12"/><path class="ph11-fold" d="M'+(x-20)+' 153l3 50M'+(x-11)+' 179l-6 32m36-58-3 50m-6-24 6 32M'+(x-7)+' 112h3m8 0h3"/>'+attributes+'</g>';
 }
 function artSource(){const v=global.J11PantheonArt,src=typeof v==='string'?v:v?.src||v?.image_url||v?.image||'';return /^data:image\/(?:png|jpeg|webp|avif);/i.test(src)?src:'';}
 function markup(){
  const id='ph11-'+(++serial),source=artSource();let figures='',symbols='',ticks='';
  gods.forEach((g,i)=>{const x=65+i*98;figures+=statue(g,x);symbols+='<g class="ph11-sigil" data-sigil="'+g.id+'" transform="translate('+x+' 41)"><circle r="22"/><g>'+symbol(g.id)+'</g></g>';});
  for(let i=0;i<40;i++){const x=24+i*14.67;ticks+='<path d="M'+x.toFixed(1)+' 252v'+(i%5===0?5:2)+'"/>';}
  return '<section class="ph11-core" data-phase="ready" data-motion="off" data-god="'+chosen+'" data-art="'+(source?'present':'fallback')+'" role="group" aria-label="众神议事厅：六位神祇的原创视觉联络模式">'+
   '<header class="ph11-heading"><span>PANTHEON / ASSEMBLY</span><b data-ph11-phase>ASSEMBLY / STANDBY</b></header>'+
   '<div class="ph11-panorama">'+(source?'<img class="ph11-art" src="'+source+'" alt="宙斯、波塞冬、雅典娜、阿波罗、奥丁与索尔的原创新众神雕塑群像" draggable="false">':'')+'<div class="ph11-art-shade"></div><div class="ph11-spotlight"></div>'+
   '<svg class="ph11-scene" viewBox="0 0 620 275" fill="none" aria-hidden="true"><defs><linearGradient id="'+id+'-stone" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e0d8bb" stop-opacity=".9"/><stop offset=".33" stop-color="#788e8e" stop-opacity=".82"/><stop offset=".66" stop-color="#354b50"/><stop offset="1" stop-color="#9bafad" stop-opacity=".6"/></linearGradient><linearGradient id="'+id+'-gold"><stop stop-color="#9e753c"/><stop offset=".47" stop-color="#e9cf97"/><stop offset="1" stop-color="#a4804a"/></linearGradient><radialGradient id="'+id+'-halo"><stop stop-color="#e2c084" stop-opacity=".31"/><stop offset="1" stop-color="#e2c084" stop-opacity="0"/></radialGradient></defs>'+
   '<g class="ph11-architecture"><path d="M10 238V71L310 13 610 71V238M18 241H602M27 249H593M36 259H584M19 82 310 26 601 82"/><path d="M16 84H604M25 88H595"/>'+[16,113,211,309,407,505,603].map(x=>'<path d="M'+x+' 91v142m-5-142v142m10-142v142"/>').join('')+'<g>'+ticks+'</g></g>'+
   '<g class="ph11-fallback" fill="url(#'+id+'-stone)" stroke="#c5cec4" stroke-width=".85">'+figures+'</g>'+
   '<g class="ph11-front-sigils">'+symbols+'</g>'+
   '<g class="ph11-link-paths"><path d="M65 67V229M163 67V229M261 67V229M359 67V229M457 67V229M555 67V229M65 229H555"/><circle cx="65" cy="229" r="2"/><circle cx="163" cy="229" r="2"/><circle cx="261" cy="229" r="2"/><circle cx="359" cy="229" r="2"/><circle cx="457" cy="229" r="2"/><circle cx="555" cy="229" r="2"/></g>'+
   '<g class="ph11-deity-effects"><g data-power="zeus"><path class="ph11-bolt" d="m48 78-8 34 15-9-11 44 22-26-11 55m5-44 20 10-14 23M52 105 31 120l5 22"/></g><g data-power="poseidon"><path class="ph11-tide" d="M127 160q18-17 36 0t36 0M127 174q18-17 36 0t36 0M127 188q18-17 36 0t36 0"/></g><g data-power="athena"><path class="ph11-wing" d="M261 108q-27-27-47-18l19 16-18-3 22 19-16-2 27 18m13-30q27-27 47-18l-19 16 18-3-22 19 16-2-27 18"/></g><g data-power="apollo"><circle class="ph11-solar" cx="359" cy="135" r="43"/><path class="ph11-strings" d="M343 119v69m8-74v79m8-82v85m8-82v79m8-74v69"/></g><g data-power="odin"><path class="ph11-runes" d="M439 89v32l16-16-16-16m30 48v32l16-16-16-16m-34 48v32l16-16-16-16"/><path class="ph11-flight" d="M427 137q11-26 31-12m-4-22q15-18 34-8"/></g><g data-power="thor"><path class="ph11-hammer-arc" d="M526 108q29-24 57 0m-63 15q35-28 70 0"/><path class="ph11-bolt" d="m550 110-7 25 14-8-9 36 17-20-7 31"/></g></g>'+
   '<g class="ph11-response"><path d="M35 219Q310 149 585 219M25 232Q310 163 595 232M17 245Q310 177 603 245"/></g><g class="ph11-scan"><path d="M19 90H602"/></g><g class="ph11-confirm"><path d="M31 239H589"/><path d="m291 239 12 10 27-27"/></g></svg></div>'+
   '<nav class="ph11-god-cards" aria-label="切换神祇视觉联络">'+gods.map(g=>'<button type="button" data-ph11-god="'+g.id+'" aria-pressed="'+(chosen===g.id)+'" title="'+g.name+'：'+g.title+'；仅切换视觉"><svg viewBox="-25 -25 50 50" aria-hidden="true">'+symbol(g.id)+'</svg><span>'+g.name+'</span><small>'+g.element+'</small></button>').join('')+'</nav>'+
   '<div class="ph11-link-caption"><strong data-ph11-godlabel>宙斯 · 雷霆与穹顶</strong><span data-ph11-label>众神议事厅待命</span></div><small class="ph11-disclosure">原创神话视觉 · 切换仅影响外观 · AI 回应为模拟</small></section>';
 }
 function mount(host){
  if(!host)return()=>{};mounted.get(host)?.();let root=host.matches?.('.ph11-core')?host:host.querySelector('.ph11-core');if(!root){host.innerHTML=markup();root=host.querySelector('.ph11-core');}
  const decorative=host.classList.contains('j7-home-visual'),priorHidden=host.getAttribute('aria-hidden');root.dataset.decorative=String(decorative);host.setAttribute('aria-hidden',String(decorative));if(decorative)root.querySelectorAll('[data-ph11-god]').forEach(n=>n.tabIndex=-1);
  const terminal=host.closest('.vm5-terminal'),media=global.matchMedia('(prefers-reduced-motion: reduce)');let alive=true,inView=true,phase='ready',phaseSource=terminal?.dataset.phase?terminal:host;
  function choose(id){const index=gods.findIndex(g=>g.id===id);if(index<0)return;chosen=id;const g=gods[index];root.dataset.god=id;root.style.setProperty('--ph11-accent',g.color);root.style.setProperty('--ph11-god-x',((index+.5)/6*100)+'%');root.querySelector('[data-ph11-godlabel]').textContent=g.name+' · '+g.title;root.querySelectorAll('[data-ph11-god]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.ph11God===id)));root.querySelectorAll('[data-figure],[data-sigil],[data-power]').forEach(n=>n.classList.toggle('ph11-active',(n.dataset.figure||n.dataset.sigil||n.dataset.power)===id));root.setAttribute('aria-label','众神议事厅，当前'+g.name+'视觉，'+phases[phase][1]+'；仅为原创AI交互示意');}
  function gate(){if(!alive)return;root.dataset.motion=document.hidden||media.matches||!inView||!host.isConnected||phase==='interrupted'||phase==='awaiting'?'off':'on';}
  function measure(){if(!alive)return;const b=root.getBoundingClientRect();inView=b.width>0&&b.height>0&&b.bottom>0&&b.right>0&&b.top<global.innerHeight&&b.left<global.innerWidth;gate();}
  function sync(records){if(!alive)return;if(Array.isArray(records))for(const r of records)if(r.attributeName==='data-phase')phaseSource=r.target;const raw=phaseSource.dataset.phase||host.dataset.phase||terminal?.dataset.phase||'ready';phase=Object.hasOwn(phases,raw)?raw:'ready';root.dataset.phase=phase;root.querySelector('[data-ph11-phase]').textContent=phases[phase][0];root.querySelector('[data-ph11-label]').textContent=phases[phase][1];choose(chosen);gate();}
  function click(event){if(decorative)return;const n=event.target.closest('[data-ph11-god]');if(!n||!root.contains(n))return;event.preventDefault();event.stopPropagation();choose(n.dataset.ph11God);}
  const mo=new MutationObserver(sync);mo.observe(host,{attributes:true,attributeFilter:['data-phase']});if(terminal&&terminal!==host)mo.observe(terminal,{attributes:true,attributeFilter:['data-phase']});const io=global.IntersectionObserver?new IntersectionObserver(es=>{inView=es.some(e=>e.isIntersecting);gate();},{threshold:.01}):null;io?.observe(root);const ro=global.ResizeObserver?new ResizeObserver(measure):null;ro?.observe(root);const timer=global.setInterval(measure,400);
  root.addEventListener('click',click);document.addEventListener('visibilitychange',gate);global.addEventListener('resize',measure);if(media.addEventListener)media.addEventListener('change',gate);else media.addListener(gate);sync();measure();
  const cleanup=()=>{if(!alive)return;alive=false;root.dataset.motion='off';root.removeEventListener('click',click);mo.disconnect();io?.disconnect();ro?.disconnect();global.clearInterval(timer);document.removeEventListener('visibilitychange',gate);global.removeEventListener('resize',measure);if(media.removeEventListener)media.removeEventListener('change',gate);else media.removeListener(gate);if(priorHidden===null)host.removeAttribute('aria-hidden');else host.setAttribute('aria-hidden',priorHidden);if(mounted.get(host)===cleanup)mounted.delete(host);};mounted.set(host,cleanup);return cleanup;
 }
 global.J7Visuals=global.J7Visuals||{};global.J7Visuals.pantheon={markup,mount};
})(window);
