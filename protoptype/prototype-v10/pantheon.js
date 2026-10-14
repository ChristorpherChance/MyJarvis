/* Pantheon: an original celestial temple, a crystal signal core and four symbolic seals.
   Public dialogue phases only. Decorative mythology is never an AI authority or oracle. */
(function (global) {
  'use strict';
  let serial = 0;
  const mounted = new WeakMap();
  const phases = {
    ready: ['CELESTIAL / STANDBY', '穹庭联络待命', '等待你的下一句话'],
    listening: ['SIGNAL / RECEIVING', '正在倾听你的声音', '光点汇入 · 接收这一句'],
    thinking: ['CONSTELLATION / ALIGNING', '正在整理你的请求', '关联对象与范围 · 准备回应'],
    speaking: ['RADIANCE / RESPONDING', '正在向你回应', '光环展开 · 随时可以打断'],
    interrupted: ['CHANNEL / HOLD', '对话已经停下', '联络暂停 · 等待你继续'],
    answered: ['CONTACT / COMPLETE', '回应已经整理好', '可以继续追问或选择下一步'],
    awaiting: ['DECISION / YOUR CHOICE', '等待你的选择', '由你确认 · 再继续推进']
  };
  function seal(kind, x, y, label) {
    const icons = {
      thunder: '<path d="M4-13-8 2H0L-4 14 9-3H1Z"/>',
      tide: '<path d="M-14-5Q-7-13 0-5T14-5M-14 3Q-7-5 0 3T14 3M-14 11Q-7 3 0 11T14 11"/>',
      wisdom: '<path d="M-12-10-8 9 0 14 8 9 12-10 0-4ZM-10-1Q-5-8 0-1Q5-8 10-1M0-1V7M-6 1H-5M5 1H6"/>',
      sun: '<circle r="6"/><path d="M0-15V-10M0 10V15M-15 0H-10M10 0H15M-11-11-7-7M7 7 11 11M-11 11-7 7M7-7 11-11"/>'
    };
    return '<g class="j10-ph-seal j10-ph-'+kind+'" transform="translate('+x+' '+y+')"><circle class="j10-ph-seal-halo" r="26"/><circle r="20"/><g class="j10-ph-emblem">'+icons[kind]+'</g><text y="40" text-anchor="middle">'+label+'</text></g>';
  }
  function markup() {
    const id='j10-pantheon-'+(++serial);
    let stars='',ticks='',columns='',leaves='';
    for(let i=0;i<64;i++){
      const x=24+(i*79.13)%572,y=10+(i*53.71)%266;
      stars+='<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+(i%11===0?1.25:.55)+'" opacity="'+(.12+(i%7)*.065)+'"/>';
    }
    for(let i=0;i<32;i++){
      const a=i*Math.PI/16,x=310+Math.cos(a)*133,y=167+Math.sin(a)*111;
      ticks+='<path d="M'+x.toFixed(2)+' '+y.toFixed(2)+'l'+(Math.cos(a)*(i%4?3:7)).toFixed(2)+' '+(Math.sin(a)*(i%4?3:7)).toFixed(2)+'"/>';
    }
    for(const x of [179,207,413,441]){
      columns+='<g class="j10-ph-column" transform="translate('+x+' 0)"><path d="M-10 137H10V143H-10ZM-6 145H6L8 219H-8ZM-11 221H11V226H-11Z"/><path d="M-3 146-4 217M1 146 1 217M4 146 5 217"/><path d="M-11 135Q-15 128-8 128H8Q15 128 11 135M-11 133Q-5 130-4 135M11 133Q5 130 4 135"/></g>';
    }
    for(let i=0;i<7;i++)for(const sign of [-1,1]){
      const a=(.17+i*.14)*Math.PI,x=310+sign*Math.sin(a)*65,y=178+Math.cos(a)*65;
      leaves+='<path d="M'+x.toFixed(1)+' '+y.toFixed(1)+'q'+(sign*9)+' -11 '+(sign*11)+' -3q-1 9 '+(-sign*11)+' 3Z"/>';
    }
    return '<div class="j10-ph-core" data-phase="ready" data-motion="off" role="img" aria-label="万神穹庭：古典神殿、天穹星座与水晶联络核心的原创视觉示意">'+
      '<div class="j10-ph-top"><span>PANTHEON / CELESTIAL LINK</span><b data-ph-code>CELESTIAL / STANDBY</b></div>'+
      '<svg class="j10-ph-svg" viewBox="0 0 620 310" fill="none" aria-hidden="true"><defs>'+
      '<radialGradient id="'+id+'-aura"><stop stop-color="#d4c8ff" stop-opacity=".28"/><stop offset=".44" stop-color="#7964c2" stop-opacity=".14"/><stop offset="1" stop-color="#6552a2" stop-opacity="0"/></radialGradient>'+
      '<radialGradient id="'+id+'-crystal" cx=".36" cy=".25" r=".81"><stop stop-color="#fffdfd" stop-opacity=".91"/><stop offset=".19" stop-color="#e2d9ff" stop-opacity=".7"/><stop offset=".46" stop-color="#8e76d7" stop-opacity=".58"/><stop offset=".77" stop-color="#473273" stop-opacity=".88"/><stop offset="1" stop-color="#23193e"/></radialGradient>'+
      '<linearGradient id="'+id+'-stone" x1="170" y1="90" x2="460" y2="220" gradientUnits="userSpaceOnUse"><stop stop-color="#efeafa" stop-opacity=".6"/><stop offset=".45" stop-color="#b2a1d1" stop-opacity=".1"/><stop offset="1" stop-color="#e6dafa" stop-opacity=".44"/></linearGradient>'+
      '<linearGradient id="'+id+'-light"><stop stop-color="#eedcae" stop-opacity="0"/><stop offset=".5" stop-color="#f5e8c7"/><stop offset="1" stop-color="#eedcae" stop-opacity="0"/></linearGradient>'+
      '<filter id="'+id+'-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'+
      '<ellipse cx="310" cy="164" rx="211" ry="146" fill="url(#'+id+'-aura)"/>'+
      '<g class="j10-ph-stars" fill="#e6ddff">'+stars+'</g>'+
      '<g class="j10-ph-constellations"><path d="M32 82 63 60 111 72 128 38 169 44M484 54 520 30 555 66 591 51M47 246 77 266 114 243M503 251 542 274 584 241"/><g fill="#e6ddff"><circle cx="63" cy="60" r="1.4"/><circle cx="128" cy="38" r="1.4"/><circle cx="520" cy="30" r="1.4"/><circle cx="555" cy="66" r="1.4"/><circle cx="77" cy="266" r="1.4"/><circle cx="542" cy="274" r="1.4"/></g></g>'+
      '<g class="j10-ph-astrolabe"><ellipse cx="310" cy="167" rx="133" ry="111"/><ellipse class="j10-ph-orbit" cx="310" cy="167" rx="147" ry="70" transform="rotate(-23 310 167)"/><g class="j10-ph-ticks">'+ticks+'</g><path d="M310 41V65M310 269V291M163 167H143M457 167H477"/></g>'+
      '<g class="j10-ph-temple" fill="url(#'+id+'-stone)"><path class="j10-ph-pediment" d="M153 119 310 65 467 119ZM175 112 310 77 445 112Z"/><path d="M162 120H458V128H162ZM162 227H458V235H162ZM151 237H469V244H151ZM143 246H477V250H143Z"/>'+columns+'<path class="j10-ph-frieze" d="M182 125H438M173 231H447"/><path class="j10-ph-roofmark" d="m310 85 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z"/></g>'+
      '<g class="j10-ph-incoming"><path d="M109 167H238M511 167H382M310 40V94"/><circle cx="150" cy="167" r="2.5"/><circle cx="470" cy="167" r="2.5"/><circle cx="310" cy="75" r="2.5"/></g>'+
      '<g class="j10-ph-crystal" filter="url(#'+id+'-glow)"><circle cx="310" cy="165" r="52" fill="url(#'+id+'-crystal)"/><circle class="j10-ph-rim" cx="310" cy="165" r="52"/><g class="j10-ph-facets"><path d="m310 113 32 31-11 47-21 26-21-26-11-47Z"/><path d="m278 144 32 21 32-21M289 191l21-26 21 26M258 165h104M310 113v104"/><ellipse cx="310" cy="165" rx="24" ry="52"/><ellipse cx="310" cy="165" rx="52" ry="15"/></g><path class="j10-ph-shimmer" d="M278 156Q283 127 309 123"/><circle class="j10-ph-nucleus" cx="310" cy="165" r="5"/><path class="j10-ph-axis" d="M310 145V185M290 165H330"/></g>'+
      '<g class="j10-ph-laurel">'+leaves+'<path d="M246 182Q258 241 310 247Q362 241 374 182"/></g>'+
      '<g class="j10-ph-response"><ellipse cx="310" cy="165" rx="77" ry="59"/><ellipse cx="310" cy="165" rx="92" ry="76"/><ellipse cx="310" cy="165" rx="108" ry="93"/></g>'+
      '<g class="j10-ph-scan"><path d="M232 166a78 78 0 0 1 78-78"/><path d="M310 165 360 112"/><circle cx="360" cy="112" r="3"/></g>'+
      '<g class="j10-ph-seals">'+seal('thunder',85,166,'雷霆')+seal('tide',535,166,'海潮')+seal('wisdom',192,63,'智慧')+seal('sun',428,63,'太阳')+'</g>'+
      '<path class="j10-ph-base-light" d="M207 267H413" stroke="url(#'+id+'-light)"/><text class="j10-ph-caption" x="310" y="287" text-anchor="middle">MYTHIC FORMS · INTELLIGENT COMPANION</text></svg>'+
      '<div class="j10-ph-bottom"><strong data-ph-label>穹庭联络待命</strong><small data-ph-hint>等待你的下一句话</small><em>原创神话视觉 · AI 交互模拟</em></div></div>';
  }
  function mount(host) {
    if(!host)return()=>{};
    mounted.get(host)?.();
    let root=host.matches?.('.j10-ph-core')?host:host.querySelector('.j10-ph-core');
    if(!root){host.innerHTML=markup();root=host.querySelector('.j10-ph-core');}
    const terminal=host.closest('.vm5-terminal'),media=global.matchMedia('(prefers-reduced-motion: reduce)');
    let alive=true,inView=true,phase='ready',phaseSource=terminal?.dataset.phase?terminal:host;
    function update(records){
      if(!alive)return;
      if(Array.isArray(records))for(const r of records)if(r.attributeName==='data-phase')phaseSource=r.target;
      const raw=phaseSource.dataset.phase||host.dataset.phase||terminal?.dataset.phase||'ready';
      phase=Object.hasOwn(phases,raw)?raw:'ready';root.dataset.phase=phase;
      root.querySelector('[data-ph-code]').textContent=phases[phase][0];
      root.querySelector('[data-ph-label]').textContent=phases[phase][1];
      root.querySelector('[data-ph-hint]').textContent=phases[phase][2];
      root.setAttribute('aria-label','万神穹庭：'+phases[phase][1]+'，原创AI交互视觉模拟');
      gate();
    }
    function gate(){if(!alive)return;root.dataset.motion=document.hidden||media.matches||!inView||!host.isConnected||phase==='interrupted'||phase==='awaiting'?'off':'on';}
    function measure(){if(!alive)return;const b=root.getBoundingClientRect();inView=b.width>0&&b.height>0&&b.bottom>0&&b.right>0&&b.top<global.innerHeight&&b.left<global.innerWidth;gate();}
    const mo=new MutationObserver(update);mo.observe(host,{attributes:true,attributeFilter:['data-phase']});if(terminal&&terminal!==host)mo.observe(terminal,{attributes:true,attributeFilter:['data-phase']});
    const io=global.IntersectionObserver?new IntersectionObserver(es=>{inView=es.some(e=>e.isIntersecting);gate();},{threshold:.01}):null;io?.observe(root);
    const ro=global.ResizeObserver?new ResizeObserver(measure):null;ro?.observe(root);
    const timer=global.setInterval(measure,400);
    document.addEventListener('visibilitychange',gate);if(media.addEventListener)media.addEventListener('change',gate);else media.addListener(gate);
    global.addEventListener('resize',measure);update();measure();
    const cleanup=()=>{if(!alive)return;alive=false;global.clearInterval(timer);mo.disconnect();io?.disconnect();ro?.disconnect();document.removeEventListener('visibilitychange',gate);if(media.removeEventListener)media.removeEventListener('change',gate);else media.removeListener(gate);global.removeEventListener('resize',measure);root.dataset.motion='off';if(mounted.get(host)===cleanup)mounted.delete(host);};
    mounted.set(host,cleanup);return cleanup;
  }
  global.J7Visuals=global.J7Visuals||{};
  global.J7Visuals.pantheon={markup,mount};
})(window);
