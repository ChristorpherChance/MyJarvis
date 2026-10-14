/* Original ink landscape: visual environments and dialogue states, without external assets. */
(function(global){
 'use strict';
 var serial=0,mounted=new WeakMap(),lastScene='morning';
 var scenes={morning:'晨岚',moon:'月色',rain:'听雨'};
 function landscapeArt(){var value=global.J11LandscapeArt;return typeof value==='string'&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)?value:null;}
 var phases={ready:['山水静候','等你把心事慢慢说来','静'],listening:['听见你的声音','水纹轻起，专心聆听','听'],thinking:['正在整理你的请求','把线索汇成清晰的回应','理'],speaking:['正在向你回应','此刻回应，可以随时打断','答'],interrupted:['暂歇片刻','等待你继续这一段对话','止'],answered:['回应已就绪','你可以继续追问','成'],awaiting:['等待你的选择','确认对象与范围后继续','待']};
 function pine(x,y,h){
  var branches='';for(var i=0;i<6;i++){var yy=-h*(.2+i*.12),w=h*(.3-i*.036);branches+='<path d="M-1 '+yy+'q-'+(w*.55)+' '+(-h*.045)+' -'+w+' '+(h*.06)+'m'+w+' '+(-h*.06)+'q'+(w*.55)+' '+(-h*.07)+' '+(w*.86)+' '+(h*.026)+'"/>';}
  return '<g transform="translate('+x+' '+y+')" class="j11-ss-pine"><path d="M0 0q3-'+(h*.3)+' 1-'+(h*.63)+'l-2-'+(h*.33)+'" stroke-width="1.8"/>'+branches+'</g>';
 }
 function markup(){
  var id='j11-shanshui-'+(++serial),rain='',strata='',birds='',dots='',art=landscapeArt();
  var artMarkup=art?'<image class="j11-ss-landscape-art" href="'+art+'" x="0" y="0" width="800" height="340" preserveAspectRatio="xMidYMid slice"/>':'';
  for(var i=0;i<43;i++){var x=22+(i*83)%763,y=10+(i*37)%196;rain+='<path d="M'+x+' '+y+'l-5 13"/>';}
  for(var q=0;q<16;q++){var sx=27+(q*31)%209,sy=130+(q*17)%102;strata+='<path d="M'+sx+' '+sy+'q17 9 32 6t27 8" opacity="'+(.1+(q%4)*.035)+'"/>';}
  for(var j=0;j<5;j++){var bx=350+j*17,by=92+(j%3)*5;birds+='<path d="M'+(bx-5)+' '+by+'q3-4 6-1q3-4 7-2"/>';}
  for(var d=0;d<9;d++)dots+='<circle cx="'+(69+(d*43)%162)+'" cy="'+(183+(d*19)%47)+'" r="'+(.7+d%3*.55)+'" opacity="'+(.2+d%4*.08)+'"/>';
  return '<section class="j11-ss-core" data-phase="ready" data-scene="'+lastScene+'" data-art="'+(art?'original':'vector')+'" data-motion="on" aria-label="一川烟雨，山水视觉环境与对话状态模拟">'+
   '<div class="j11-ss-meta"><span>一川烟雨 · 山水之间</span><small>INK / LANDSCAPE</small></div>'+
   '<figure class="j11-ss-painting" aria-label="原创水墨长卷：山川留白与动态云雾、飞鸟、水纹"><svg class="j11-ss-svg" viewBox="0 0 800 340" fill="none" aria-hidden="true"><defs>'+
   '<linearGradient id="'+id+'-paper" x1="0" y1="0" x2="1" y2="1"><stop class="j11-ss-paper-a" stop-color="#f4f2eb"/><stop class="j11-ss-paper-b" offset="1" stop-color="#faf9f2"/></linearGradient>'+
   '<linearGradient id="'+id+'-far" x1="0" y1="0" x2="0" y2="1"><stop class="j11-ss-far-a" stop-color="#899c9c" stop-opacity=".48"/><stop class="j11-ss-far-b" offset="1" stop-color="#b5c3c0" stop-opacity=".1"/></linearGradient>'+
   '<linearGradient id="'+id+'-middle" x1="0" y1="0" x2="0" y2="1"><stop class="j11-ss-mid-a" stop-color="#617d81" stop-opacity=".66"/><stop class="j11-ss-mid-b" offset="1" stop-color="#9fb1af" stop-opacity=".22"/></linearGradient>'+
   '<linearGradient id="'+id+'-near" x1=".15" y1="0" x2=".85" y2="1"><stop class="j11-ss-near-a" stop-color="#2f4b52"/><stop class="j11-ss-near-b" offset=".58" stop-color="#536e72" stop-opacity=".8"/><stop class="j11-ss-near-c" offset="1" stop-color="#91a5a4" stop-opacity=".38"/></linearGradient>'+
   '<linearGradient id="'+id+'-mist" x1="0" y1="0" x2="0" y2="1"><stop class="j11-ss-mist-a" stop-color="#f5f5ed" stop-opacity="0"/><stop class="j11-ss-mist-b" offset=".55" stop-color="#f7f7ef" stop-opacity=".95"/><stop class="j11-ss-mist-c" offset="1" stop-color="#f7f7ef" stop-opacity="0"/></linearGradient>'+
   '<linearGradient id="'+id+'-reflect" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#8ca5a6" stop-opacity=".34"/><stop offset="1" stop-color="#9aafaf" stop-opacity="0"/></linearGradient>'+
   '<filter id="'+id+'-paper-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="2" seed="11"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".045"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter>'+
   '<filter id="'+id+'-soft"><feGaussianBlur stdDeviation="3"/></filter><clipPath id="'+id+'-water"><rect x="0" y="228" width="800" height="112"/></clipPath></defs>'+
   '<rect width="800" height="340" rx="4" fill="url(#'+id+'-paper)"/><rect class="j11-ss-grain" width="800" height="340" rx="4" fill="url(#'+id+'-paper)" filter="url(#'+id+'-paper-grain)"/>'+artMarkup+
   '<circle class="j11-ss-sun" cx="572" cy="63" r="20" fill="#c19582" opacity=".22"/><circle class="j11-ss-moon" cx="578" cy="60" r="19" fill="#e6eeeb" opacity="0"/>'+
   '<path class="j11-ss-far-mountain" d="M-15 197Q22 162 57 167Q89 151 121 114Q145 131 169 108Q193 98 216 118Q236 120 257 157Q283 127 310 124Q327 95 344 74Q357 86 372 109Q384 101 399 120Q414 140 435 166Q452 147 471 124Q489 121 503 89Q519 62 533 55Q547 76 553 101Q570 92 592 126Q622 158 651 146Q674 119 691 129Q714 122 741 148Q772 169 820 183V230H-15Z" fill="url(#'+id+'-far)"/>'+
   '<path class="j11-ss-middle-mountain" d="M-14 216Q37 190 59 172Q77 152 95 149Q118 170 141 164Q167 175 188 196Q205 184 224 183Q251 164 268 158Q293 177 316 201Q340 193 362 169Q388 186 409 201Q435 191 456 160Q472 138 490 129Q502 139 514 173Q537 159 553 171Q577 193 601 210Q631 188 657 176Q677 171 695 180Q724 190 747 167Q776 181 814 209V250H-14Z" fill="url(#'+id+'-middle)"/>'+
   '<g class="j11-ss-reflections" clip-path="url(#'+id+'-water)" opacity=".24"><path d="M0 235Q54 260 101 305Q140 274 194 255Q253 298 289 316Q338 280 375 259Q449 290 482 319Q523 270 561 253Q596 294 650 309Q694 269 758 249L800 238" fill="url(#'+id+'-reflect)"/><path d="M37 257H197M61 271H177M498 263H611M521 280H597M656 266H761" stroke="#657f82" stroke-width=".7"/></g>'+
   '<g class="j11-ss-mist"><path d="M-50 169Q149 154 292 177T824 175V237Q644 249 404 224T-50 230Z" fill="url(#'+id+'-mist)"/><path d="M-26 208Q138 198 259 214T535 206Q686 190 833 214" stroke="#f8f9f2" stroke-width="18" opacity=".65" filter="url(#'+id+'-soft)"/></g>'+
   '<g class="j11-ss-near-mountain"><path d="M-20 260L-20 181Q-1 176 11 149Q19 134 27 137Q42 120 59 113Q70 103 85 87Q96 96 105 115Q121 103 135 83Q146 62 154 52Q162 67 172 81Q187 96 193 120Q207 136 219 149Q230 150 239 176Q253 190 265 211Q284 234 315 258Z" fill="url(#'+id+'-near)"/><path d="M145 78Q138 129 159 159Q174 174 169 202M97 123Q83 145 102 177Q108 197 105 217M206 153Q190 184 223 221M24 173Q41 183 48 213M150 147Q185 153 193 174" stroke="#233f48" stroke-width="1.25" opacity=".23"/><g stroke="#203a42" stroke-width=".65">'+strata+'</g><g fill="#203c43">'+dots+'</g><path d="M-10 250Q100 235 189 248T324 263" stroke="#f6f7ee" stroke-width="16" opacity=".8" filter="url(#'+id+'-soft)"/></g>'+
   '<path class="j11-ss-shore" d="M620 278Q642 264 651 249Q668 247 681 231Q697 239 711 228Q729 237 740 252Q756 253 777 247Q791 258 811 272V311Q724 305 620 278Z" fill="#607c7e" opacity=".78"/>'+
   pine(679,242,51)+pine(705,249,39)+pine(748,258,31)+pine(47,187,30)+pine(71,193,23)+
   '<g class="j11-ss-flock" stroke="#3a555b" stroke-width="1.5" stroke-linecap="round">'+birds+'</g>'+
   '<g class="j11-ss-water-lines" stroke="#6e888a" stroke-width=".65" opacity=".37"><path d="M261 248q51-6 107 0M299 285q58-4 123-1M443 270q47-5 92-1M431 310q49-3 100 0M577 304q34-3 67 0M74 308q30-4 63-1M208 296q22-3 52-1"/></g>'+
   '<g transform="translate(410 262)"><g class="j11-ss-boat"><path d="M-26 0Q0 10 31 0L23 8Q-1 15-21 6Z" fill="#435d62"/><path d="M-3-30V3M-3-30Q-20-12-18-4H-3M-1-29Q12-20 15-6H-1" stroke="#3c555c" stroke-width="1.2"/><path d="M-3-28Q-18-10-16-5H-3Z" fill="#e5eae3" opacity=".87"/><path d="M4-4q2-5 4-4q3 2 3 6M8-9v-5" stroke="#304e54" stroke-width="1.6" stroke-linecap="round"/></g></g>'+
   '<g class="j11-ss-ripples" stroke="#3f6972" stroke-width=".9"><ellipse class="j11-ss-ripple j11-ss-ripple-a" cx="410" cy="272" rx="31" ry="4" opacity="0"/><ellipse class="j11-ss-ripple j11-ss-ripple-b" cx="410" cy="272" rx="31" ry="4" opacity="0"/><ellipse class="j11-ss-ripple j11-ss-ripple-c" cx="410" cy="272" rx="31" ry="4" opacity="0"/></g>'+
   '<g class="j11-ss-ink-drops" fill="#2c4d56" opacity="0"><circle cx="339" cy="185" r="2.4"/><circle cx="356" cy="193" r="1.5"/><circle cx="363" cy="180" r=".8"/><circle cx="348" cy="169" r="1.2"/></g>'+
   '<g class="j11-ss-rain" stroke="#607f85" stroke-width=".75" opacity="0">'+rain+'</g>'+
   '<g class="j11-ss-inscription" fill="#4e6262" font-family="SimSun,serif" font-size="14"><text x="752" y="40" style="writing-mode:vertical-rl;letter-spacing:5px">山静有声</text><text x="728" y="62" style="writing-mode:vertical-rl;letter-spacing:5px">水远成诗</text></g>'+
   '<g class="j11-ss-seal" transform="translate(744 150)"><path d="M-11-13L10-12 12 13-10 14Z" fill="#a5473a"/><path d="M-8-10 8-9 9 10-7 11Z" stroke="#f4e8df" stroke-width=".65" opacity=".8"/><text data-ss-seal x="0" y="6" text-anchor="middle" fill="#fff5e9" font-family="SimSun,serif" font-size="15">静</text></g>'+
   '<path class="j11-ss-frame" d="M12 22V12H25M775 12H788V25M12 315V328H25M775 328H788V315" stroke="#819494" stroke-width=".7" opacity=".4"/></svg></figure>'+
   '<div class="j11-ss-footer"><div><strong data-ss-label>山水静候</strong><small data-ss-hint>等你把心事慢慢说来</small></div><div class="j11-ss-scenes" aria-label="切换视觉环境">'+Object.keys(scenes).map(function(s){return '<button type="button" class="j11-ss-scene-button" data-ss-scene="'+s+'" aria-pressed="'+(lastScene===s)+'" title="'+scenes[s]+' · 仅视觉">'+scenes[s]+'</button>';}).join('')+'</div></div></section>';
 }
 function mount(host){
  if(!host)return function(){};var previous=mounted.get(host);if(previous)previous();
  var root=host.matches&&host.matches('.j11-ss-core')?host:host.querySelector('.j11-ss-core');if(!root){host.innerHTML=markup();root=host.querySelector('.j11-ss-core');}
  var terminal=host.closest('.vm5-terminal'),alive=true,inView=true,lastPhase=null,phaseSource=terminal&&terminal.dataset.phase?terminal:host,media=global.matchMedia('(prefers-reduced-motion: reduce)');
  var originalAriaHidden=host.getAttribute('aria-hidden'),controls=root.querySelector('.j11-ss-scenes');
  var decorativeHome=host.matches('.j7-home-visual')||!!host.closest('.j7-home-telemetry');
  var hiddenAncestor=host.parentElement&&host.parentElement.closest('[aria-hidden="true"]');
  var decorative=decorativeHome||!!hiddenAncestor;
  if(!decorative)host.setAttribute('aria-hidden','false');
  controls.hidden=decorative;root.dataset.decorative=String(decorative);
  controls.querySelectorAll('button').forEach(function(b){if(decorative)b.setAttribute('tabindex','-1');else b.removeAttribute('tabindex');});
  function choose(scene){if(!Object.prototype.hasOwnProperty.call(scenes,scene))return;lastScene=scene;root.dataset.scene=scene;root.querySelectorAll('[data-ss-scene]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.ssScene===scene));});root.setAttribute('aria-label','一川烟雨，'+scenes[scene]+'视觉环境；'+phases[lastPhase||'ready'][0]+'，对话状态模拟');}
  function onClick(e){if(controls.hidden)return;var button=e.target.closest('[data-ss-scene]');if(button&&root.contains(button)){e.preventDefault();e.stopPropagation();choose(button.dataset.ssScene);}}
  function update(records){
   if(!alive)return;if(Array.isArray(records))records.forEach(function(r){if(r.attributeName==='data-phase')phaseSource=r.target;});
   var raw=phaseSource.dataset.phase||host.dataset.phase||(terminal&&terminal.dataset.phase)||'ready',phase=Object.prototype.hasOwnProperty.call(phases,raw)?raw:'ready';
   if(lastPhase!==phase){lastPhase=phase;root.dataset.phase=phase;['label','hint','seal'].forEach(function(n,i){root.querySelector('[data-ss-'+n+']').textContent=phases[phase][i];});choose(root.dataset.scene||lastScene);}
   var motion=document.hidden||global.matchMedia('(prefers-reduced-motion: reduce)').matches||!inView||!host.isConnected?'off':'on';if(root.dataset.motion!==motion)root.dataset.motion=motion;
  }
  root.addEventListener('click',onClick);var observer=new MutationObserver(update);observer.observe(host,{attributes:true,attributeFilter:['data-phase']});if(terminal&&terminal!==host)observer.observe(terminal,{attributes:true,attributeFilter:['data-phase']});
  var io=global.IntersectionObserver?new IntersectionObserver(function(entries){inView=entries.some(function(e){return e.isIntersecting;});update();},{threshold:.05}):null;if(io)io.observe(host);
  document.addEventListener('visibilitychange',update);if(media.addEventListener)media.addEventListener('change',update);else media.addListener(update);
  var timer=global.setInterval(function(){if(!alive)return;var r=host.getBoundingClientRect();inView=r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<global.innerHeight&&r.left<global.innerWidth;update();},400);choose(lastScene);update();
  function cleanup(){if(!alive)return;alive=false;observer.disconnect();if(io)io.disconnect();global.clearInterval(timer);root.removeEventListener('click',onClick);document.removeEventListener('visibilitychange',update);if(media.removeEventListener)media.removeEventListener('change',update);else media.removeListener(update);root.dataset.motion='off';controls.hidden=true;controls.querySelectorAll('button').forEach(function(b){b.setAttribute('tabindex','-1');});if(originalAriaHidden===null)host.removeAttribute('aria-hidden');else host.setAttribute('aria-hidden',originalAriaHidden);if(mounted.get(host)===cleanup)mounted.delete(host);}
  mounted.set(host,cleanup);return cleanup;
 }
 global.J7Visuals=global.J7Visuals||{};global.J7Visuals.shanshui={markup:markup,mount:mount};
})(window);
