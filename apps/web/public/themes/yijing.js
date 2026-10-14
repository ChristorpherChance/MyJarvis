/* Original jade Taiji and real three-line trigrams. Dialogue visuals only, no divination. */
(function (global) {
  'use strict';
  var serial = 0, mounted = new WeakMap();
  var phases = {
    ready: ['静候 / STANDBY', '玉盘静候', '从你的一句话开始', '静'],
    listening: ['聆听 / RECEIVING', '正在聆听你的声音', '此刻，专心听你', '听'],
    thinking: ['整理 / ALIGNING', '正在归纳你的请求', '关联任务、知识与个人记录', '理'],
    speaking: ['回应 / RESPONDING', '正在向你回应', '你随时可以打断', '答'],
    interrupted: ['暂停 / HOLD', '联络已暂停', '等待你继续', '止'],
    answered: ['就绪 / COMPLETE', '回应已就绪', '可以继续追问', '成'],
    awaiting: ['待定 / CONFIRM', '等待你的选择', '确认后继续推进', '待']
  };
  // Top-to-bottom yin/yang lines: Qian, Dui, Li, Zhen, Xun, Kan, Gen, Kun.
  var trigrams = [['乾',[1,1,1]],['兑',[0,1,1]],['离',[1,0,1]],['震',[0,0,1]],['巽',[1,1,0]],['坎',[0,1,0]],['艮',[1,0,0]],['坤',[0,0,0]]];
  function markup() {
    var id = 'j10-yijing-' + (++serial), glyphs = '', dots = '', bars = '';
    trigrams.forEach(function (t,i) {
      var lines = '';
      t[1].forEach(function (solid,j) { var y = -8+j*7; lines += solid ? '<path d="M-13 ' + y + 'h26"/>' : '<path d="M-13 ' + y + 'h10m6 0h10"/>'; });
      glyphs += '<g class="j10-yj-trigram" transform="translate(240 161) rotate(' + (i*45) + ') translate(0 -120)"><g class="j10-yj-lines">' + lines + '</g><text x="0" y="21" text-anchor="middle" transform="rotate(' + (-i*45) + ' 0 18)" font-family="SimSun,serif" font-size="10" fill="#557c70">' + t[0] + '</text></g>';
    });
    for(var d=0;d<48;d++){var a=d*Math.PI/24;dots+='<circle cx="'+(240+Math.sin(a)*108).toFixed(2)+'" cy="'+(161-Math.cos(a)*108).toFixed(2)+'" r="'+(d%6===0?1.35:.6)+'" fill="#457e6f" opacity="'+(d%6===0?.65:.28)+'"/>';}
    for(var b=0;b<11;b++)bars+='<i style="--yj-n:'+b+'"></i>';
    return '<div class="j10-yj-core" data-phase="ready" data-motion="on" role="img" aria-label="太初问道：阴阳玉盘与三爻八卦环，对话状态模拟">'+
      '<div class="j10-yj-top"><span>太初 · 山水之间</span><b data-yj-code>静候 / STANDBY</b></div>'+
      '<svg class="j10-yj-svg" viewBox="0 0 480 340" fill="none" aria-hidden="true"><defs>'+
      '<radialGradient id="'+id+'-aura"><stop stop-color="#c0d9c8" stop-opacity=".62"/><stop offset=".56" stop-color="#c8dfcc" stop-opacity=".27"/><stop offset="1" stop-color="#d0e4d0" stop-opacity="0"/></radialGradient>'+
      '<linearGradient id="'+id+'-mount" x1="0" y1="140" x2="0" y2="310" gradientUnits="userSpaceOnUse"><stop stop-color="#708b7f" stop-opacity=".32"/><stop offset="1" stop-color="#8d9f90" stop-opacity="0"/></linearGradient>'+
      '<linearGradient id="'+id+'-rim" x1="145" y1="76" x2="343" y2="257" gradientUnits="userSpaceOnUse"><stop stop-color="#f9fcf5"/><stop offset=".23" stop-color="#b5d4be"/><stop offset=".56" stop-color="#4f8978"/><stop offset=".76" stop-color="#276458"/><stop offset="1" stop-color="#99c1a8"/></linearGradient>'+
      '<linearGradient id="'+id+'-jade" x1="-60" y1="-66" x2="75" y2="83" gradientUnits="userSpaceOnUse"><stop stop-color="#a7d3b7"/><stop offset=".26" stop-color="#59967f"/><stop offset=".64" stop-color="#1a6558"/><stop offset="1" stop-color="#10483f"/></linearGradient>'+
      '<radialGradient id="'+id+'-ivory" cx=".3" cy=".25"><stop stop-color="#fffef3"/><stop offset=".66" stop-color="#e8ecdd"/><stop offset="1" stop-color="#b5cdb9"/></radialGradient>'+
      '<linearGradient id="'+id+'-sheen" x1="-70" y1="-70" x2="70" y2="70" gradientUnits="userSpaceOnUse"><stop stop-color="#fff" stop-opacity=".72"/><stop offset=".48" stop-color="#e9faee" stop-opacity=".12"/><stop offset="1" stop-color="#174e43" stop-opacity=".1"/></linearGradient>'+
      '<filter id="'+id+'-shadow" x="-50%" y="-70%" width="200%" height="240%"><feGaussianBlur stdDeviation="6"/></filter>'+
      '<clipPath id="'+id+'-clip"><circle r="75"/></clipPath></defs>'+
      '<ellipse cx="240" cy="170" rx="206" ry="151" fill="url(#'+id+'-aura)"/>'+
      '<g class="j10-yj-landscape"><path d="M0 238 28 211 50 219 88 167 111 201 137 211 154 232 190 255H0Z" fill="url(#'+id+'-mount)"/><path d="M287 261 311 231 330 238 352 198 373 226 398 179 428 220 448 212 480 244V291H287Z" fill="url(#'+id+'-mount)"/><path d="M28 226 61 231 89 182 103 209 126 217M330 249 353 211 373 239 397 194 426 230" stroke="#739688" stroke-width=".7" opacity=".28"/></g>'+
      '<g class="j10-yj-clouds" stroke="#7a9e88" stroke-width=".7" opacity=".32"><path d="M20 142c12-8 24-7 31-3s17 4 26-1 17-5 26 0M351 120c13-8 23-6 29-1s15 4 22-1 21-6 31 0M40 284c17-5 32-4 42 0s28 3 44-1M351 277c18-7 28-7 36-2s19 5 26 1 20-4 29 1"/></g>'+
      '<ellipse cx="240" cy="248" rx="93" ry="17" fill="#286b4d" opacity=".19" filter="url(#'+id+'-shadow)"/>'+
      '<g class="j10-yj-ring"><circle cx="240" cy="161" r="143" stroke="#6d9981" stroke-width=".65" opacity=".28"/><circle cx="240" cy="161" r="140" stroke="#86b496" stroke-width=".45" opacity=".25"/>'+glyphs+dots+'</g>'+
      '<g transform="translate(240 168) scale(1 .91)"><ellipse cy="7" rx="91" ry="91" fill="#356e5c" opacity=".45"/><circle r="91" fill="url(#'+id+'-rim)" stroke="#bddac4" stroke-width="1.2"/><circle r="86" fill="#6fa78c" stroke="#d0e9d4" stroke-width=".9"/><circle r="81" fill="#2e6855"/><g class="j10-yj-taiji"><circle r="75" fill="url(#'+id+'-ivory)"/><path d="M0-75A75 75 0 0 1 0 75A37.5 37.5 0 0 1 0 0A37.5 37.5 0 0 0 0-75Z" fill="url(#'+id+'-jade)"/><circle cy="-37.5" r="11" fill="url(#'+id+'-jade)"/><circle cy="37.5" r="11" fill="url(#'+id+'-ivory)"/><g clip-path="url(#'+id+'-clip)" opacity=".16" stroke="#e9ffe9" stroke-width="1"><path d="M-58-73Q-40-45-63-26T-38 9M45-62Q31-22 58-8T41 45M-76 35Q-27 50 3 72M-51-26Q-11-18 2-54M23 51Q47 31 76 32"/></g><circle r="74.5" stroke="#f4ffed" stroke-opacity=".46"/></g><path class="j10-yj-glaze" d="M-75-25Q-55-81 6-78Q49-77 70-49" stroke="url(#'+id+'-sheen)" stroke-width="7" stroke-linecap="round"/><circle r="84" stroke="#e6f9e8" stroke-opacity=".23"/></g>'+
      '<circle class="j10-yj-echo j10-yj-echo-a" cx="240" cy="168" r="95" stroke="#257e62" stroke-width=".8" opacity="0"/><circle class="j10-yj-echo j10-yj-echo-b" cx="240" cy="168" r="95" stroke="#257e62" stroke-width=".8" opacity="0"/>'+
      '<path class="j10-yj-ink-trace" d="M75 161A165 116 0 0 1 405 161A165 116 0 0 1 75 161" stroke="#1c6c56" stroke-width="1.1" stroke-dasharray="1 17" opacity=".34"/>'+
      '<g class="j10-yj-seal" transform="translate(408 260)"><path d="M-14-17 13-16 15 15-13 17Z" fill="#b9463c"/><path d="M-11-13 10-12 11 11-10 13Z" stroke="#f7e7da" stroke-width=".7" opacity=".72"/><text data-yj-seal x="0" y="6" text-anchor="middle" fill="#fff1df" font-family="SimSun,serif" font-size="17">静</text></g>'+
      '<text x="240" y="322" text-anchor="middle" fill="#7b9284" font-family="SimSun,serif" font-size="8.2" letter-spacing="2">阴阳玉盘 · 八卦纹样 · 对话状态模拟</text></svg>'+
      '<div class="j10-yj-footer"><strong data-yj-label>玉盘静候</strong><div class="j10-yj-signal" aria-hidden="true">'+bars+'</div><small data-yj-hint>从你的一句话开始</small></div></div>';
  }
  function mount(host) {
    if(!host)return function(){};
    var previous=mounted.get(host);if(previous)previous();
    var root=host.matches&&host.matches('.j10-yj-core')?host:host.querySelector('.j10-yj-core');
    if(!root){host.innerHTML=markup();root=host.querySelector('.j10-yj-core');}
    var terminal=host.closest('.vm5-terminal'),alive=true,inView=true,lastPhase=null;
    var phaseSource=terminal&&terminal.dataset.phase?terminal:host;
    var media=global.matchMedia('(prefers-reduced-motion: reduce)');
    function update(records){
      if(!alive)return;
      if(Array.isArray(records))records.forEach(function(r){if(r.attributeName==='data-phase')phaseSource=r.target;});
      var raw=phaseSource.dataset.phase||host.dataset.phase||(terminal&&terminal.dataset.phase)||'ready';
      var phase=Object.prototype.hasOwnProperty.call(phases,raw)?raw:'ready';
      if(lastPhase!==phase){lastPhase=phase;root.dataset.phase=phase;['code','label','hint','seal'].forEach(function(n,i){root.querySelector('[data-yj-'+n+']').textContent=phases[phase][i];});root.setAttribute('aria-label','太初问道，对话状态模拟：'+phases[phase][1]);}
      var motion=document.hidden||global.matchMedia('(prefers-reduced-motion: reduce)').matches||!inView||!host.isConnected?'off':'on';
      if(root.dataset.motion!==motion)root.dataset.motion=motion;
    }
    var observer=new MutationObserver(update);observer.observe(host,{attributes:true,attributeFilter:['data-phase']});if(terminal&&terminal!==host)observer.observe(terminal,{attributes:true,attributeFilter:['data-phase']});
    var io=global.IntersectionObserver?new IntersectionObserver(function(entries){inView=entries.some(function(e){return e.isIntersecting;});update();},{threshold:.05}):null;if(io)io.observe(host);
    document.addEventListener('visibilitychange',update);if(media.addEventListener)media.addEventListener('change',update);else media.addListener(update);
    var timer=global.setInterval(function(){if(!alive)return;var r=host.getBoundingClientRect();inView=r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<global.innerHeight&&r.left<global.innerWidth;update();},400);
    update();
    function cleanup(){if(!alive)return;alive=false;observer.disconnect();if(io)io.disconnect();global.clearInterval(timer);document.removeEventListener('visibilitychange',update);if(media.removeEventListener)media.removeEventListener('change',update);else media.removeListener(update);root.dataset.motion='off';if(mounted.get(host)===cleanup)mounted.delete(host);}
    mounted.set(host,cleanup);return cleanup;
  }
  global.J7Visuals=global.J7Visuals||{};global.J7Visuals.yijing={markup:markup,mount:mount};
})(window);
