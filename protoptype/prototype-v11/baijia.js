/* Baijia: an original bronze dialogue vessel, bamboo manuscripts and six schools.
   School buttons offer short thinking prompts, never source quotations or business actions. */
(function (global) {
  'use strict';
  let serial = 0;
  const mounted = new WeakMap();
  const schools = [
    {id:'ru',name:'儒家',glyph:'儒',key:'RELATION',tip:'把问题放回关系与责任中，看看谁受到影响。'},
    {id:'dao',name:'道家',glyph:'道',key:'CHANGE',tip:'先退一步看变化，给复杂问题留出余地。'},
    {id:'mo',name:'墨家',glyph:'墨',key:'PRACTICE',tip:'检验方案是否兼顾实际需要与投入。'},
    {id:'fa',name:'法家',glyph:'法',key:'BOUNDARY',tip:'把规则、边界与例外说清，再讨论行动。'},
    {id:'bing',name:'兵家',glyph:'兵',key:'STRATEGY',tip:'先看局势与资源，再分配步序与重点。'},
    {id:'ming',name:'名家',glyph:'名',key:'CLARITY',tip:'先澄清词义和前提，避免在不同问题上争论。'}
  ];
  const phases = {
    ready: ['ACADEMY / STANDBY','文枢静候','问'],
    listening: ['LISTEN / INSCRIBE','收声入简','听'],
    thinking: ['IDEAS / ARRANGE','六家参照','理'],
    speaking: ['VOICE / UNFOLD','展卷回应','答'],
    interrupted: ['PAUSE / HOLD','收卷留席','止'],
    answered: ['REPLY / READY','释疑成章','成'],
    awaiting: ['CHOICE / CONFIRM','请你裁定','待']
  };
  function escape(text) {
    return String(text).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function letterLine(text) {
    return Array.from(text).map((ch,i)=>'<span style="--bj-i:'+i+'">'+escape(ch)+'</span>').join('');
  }
  function markup() {
    const id = 'j11-baijia-' + (++serial);
    let slips='',marks='',ink='',stars='';
    for(let i=0;i<38;i++){
      const a=(i*360/38-90)*Math.PI/180,x=320+Math.cos(a)*211,y=158+Math.sin(a)*111;
      slips+='<g style="--bj-slip:'+i+'" transform="translate('+x.toFixed(2)+' '+y.toFixed(2)+') rotate('+(i*360/38-90+90).toFixed(2)+')"><path class="bj-bamboo-slat" d="M-4-15Q0-18 4-15V15Q0 18-4 15Z"/><path class="bj-slip-line" d="M0-12V12M-3-7H3M-3 7H3"/></g>';
    }
    for(let i=0;i<18;i++){
      const x=266+i*6;
      marks+='<path d="M'+x+' 143v9m0 65v8"/>';
    }
    for(let i=0;i<8;i++){
      const x=118+(i%4)*12,y=126+Math.floor(i/4)*25;
      ink+='<path d="M'+x+' '+y+'h5m-2-4v9m-4 4h8m-6 4h5"/>';
    }
    for(let i=0;i<20;i++)stars+='<circle cx="'+(55+(i*71)%540)+'" cy="'+(22+(i*43)%285)+'" r="'+(i%5?'.6':'1.1')+'"/>';
    const seals=schools.map((s,i)=>{
      const pts=[[77,77],[183,39],[456,39],[562,77],[538,237],[103,237]],p=pts[i];
      return '<g class="bj-school-seal" data-bj-seal="'+s.id+'" transform="translate('+p[0]+' '+p[1]+')"><path class="bj-seal-frame" d="M-19-20 19-19 20 19-20 20Z"/><path class="bj-seal-inner" d="M-15-15H15V15H-15ZM-12-12H-7M7 12H12"/><text y="8" text-anchor="middle">'+s.glyph+'</text><text class="bj-seal-key" y="35" text-anchor="middle">'+s.key+'</text></g>';
    }).join('');
    return '<div class="j11-bj-core" data-phase="ready" data-motion="off" data-school="ru" role="group" aria-label="百家争鸣：青铜文枢与六家思考提示">'+
      '<div class="bj-core-top"><span>百家 · 文枢</span><b data-bj-code>ACADEMY / STANDBY</b></div>'+
      '<svg class="bj-core-svg" viewBox="0 0 640 305" fill="none" aria-hidden="true"><defs>'+
      '<linearGradient id="'+id+'-bronze" x1="251" y1="118" x2="389" y2="230" gradientUnits="userSpaceOnUse"><stop stop-color="#9dac8b"/><stop offset=".18" stop-color="#d0ad6d"/><stop offset=".44" stop-color="#5f7559"/><stop offset=".71" stop-color="#273e33"/><stop offset="1" stop-color="#7a8861"/></linearGradient>'+
      '<linearGradient id="'+id+'-rim" x1="241" y1="129" x2="392" y2="146" gradientUnits="userSpaceOnUse"><stop stop-color="#95b9a1"/><stop offset=".25" stop-color="#f0d799"/><stop offset=".7" stop-color="#7b8b62"/><stop offset="1" stop-color="#ced1a0"/></linearGradient>'+
      '<linearGradient id="'+id+'-paper"><stop stop-color="#b39f74" stop-opacity=".2"/><stop offset=".5" stop-color="#cfbd8c" stop-opacity=".13"/><stop offset="1" stop-color="#8eaf97" stop-opacity=".05"/></linearGradient>'+
      '<radialGradient id="'+id+'-lamp"><stop stop-color="#e4bd77" stop-opacity=".13"/><stop offset=".6" stop-color="#95bda4" stop-opacity=".04"/><stop offset="1" stop-color="#182521" stop-opacity="0"/></radialGradient>'+
      '<filter id="'+id+'-shadow" x="-80%" y="-180%" width="260%" height="460%"><feGaussianBlur stdDeviation="5"/></filter>'+
      '<filter id="'+id+'-inkglow" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation=".9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'+
      '<ellipse cx="320" cy="156" rx="286" ry="146" fill="url(#'+id+'-lamp)"/><g class="bj-dust" fill="#d6c18e">'+stars+'</g>'+
      '<g class="bj-study-lines"><path d="M37 132H96M544 132H603M32 168H89M551 168H608M217 17H283M357 17H423M198 285H268M372 285H442"/><path d="M43 127v10M597 127v10M315 17h10M314 285h12"/></g>'+
      '<g class="bj-bamboo-ring">'+slips+'</g><g class="bj-binding"><ellipse cx="320" cy="158" rx="204" ry="107"/><ellipse cx="320" cy="158" rx="217" ry="116"/></g>'+
      '<g class="bj-thought-paths"><path d="M77 77Q176 33 271 120M183 39Q255 28 301 115M456 39Q390 28 338 116M562 77Q452 36 369 121M538 237Q433 281 367 221M103 237Q204 278 274 221"/></g>'+
      '<g transform="translate(91 89)"><g class="bj-scroll bj-scroll-left"><path d="M0 8Q27-3 61 8V105Q27 93 0 105Z" fill="url(#'+id+'-paper)"/><path d="M0 8V105M61 8V105M7 17Q28 10 54 17M8 90Q31 84 54 91"/><g class="bj-ink-lines" transform="translate(-93 -82)">'+ink+'</g><path class="bj-scroll-roll" d="M-6 6H6V107H-6ZM55 6H67V107H55Z"/></g></g>'+
      '<g transform="translate(487 89)"><g class="bj-scroll bj-scroll-right"><path d="M0 8Q27-3 61 8V105Q27 93 0 105Z" fill="url(#'+id+'-paper)"/><path d="M0 8V105M61 8V105M7 17Q28 10 54 17M8 90Q31 84 54 91"/><g class="bj-ink-lines"><path d="M14 31H47M14 44H39M14 58H47M14 71H42"/><path d="M17 25v13m11-13v13m11-13v13M18 50v14m12-14v14m11-14v14"/></g><path class="bj-scroll-roll" d="M-6 6H6V107H-6ZM55 6H67V107H55Z"/></g></g>'+
      '<ellipse cx="320" cy="264" rx="80" ry="10" fill="#020c07" opacity=".55" filter="url(#'+id+'-shadow)"/>'+
      '<g class="bj-vessel"><g class="bj-vessel-feet" fill="url(#'+id+'-bronze)"><path d="M274 214 265 266Q272 279 286 270L299 225ZM316 229 313 271H328L326 229ZM344 225 356 270Q369 278 377 266L365 214Z"/></g>'+
      '<g class="bj-vessel-handles" stroke="url(#'+id+'-rim)" stroke-width="8"><path d="M269 130V85Q269 72 286 75V126M371 130V85Q371 72 354 75V126"/></g>'+
      '<path class="bj-vessel-body" d="M249 131Q256 218 274 229Q320 248 366 229Q384 218 391 131Z" fill="url(#'+id+'-bronze)"/>'+
      '<ellipse cx="320" cy="131" rx="74" ry="17" fill="url(#'+id+'-rim)"/><ellipse cx="320" cy="130" rx="63" ry="10" fill="#182a20"/><path class="bj-mouth-light" d="M260 131Q320 114 380 131"/>'+
      '<g class="bj-bronze-marks">'+marks+'<path d="M265 160h15v15h-10v-9h10m80-6h15v15h-10v-9h10M266 180h13v20h-10v-14h7m85-6h13v20h-10v-14h7M273 211Q320 232 367 211"/><path d="M263 156h22m70 0h22M279 183l7-8m68 8-7-8"/></g>'+
      '<path class="bj-inscription-plate" d="M295 153H345V209H295Z"/><path class="bj-inscription-corners" d="M299 163v-6h8M333 157h8v6M299 199v6h8M333 205h8v-6"/>'+
      '<text class="bj-central-glyph" data-bj-glyph x="320" y="193" text-anchor="middle" filter="url(#'+id+'-inkglow)">问</text>'+
      '<path class="bj-lustre" d="M257 148Q262 188 271 207"/><path class="bj-engraved-band" d="M277 220Q320 236 363 220"/></g>'+
      '<g class="bj-response-lines"><path d="M220 142Q199 163 220 190M210 126Q173 166 211 207M420 142Q441 163 420 190M430 126Q467 166 429 207"/></g>'+
      '<g class="bj-imprint"><path d="M399 230 424 229 425 255 398 256Z"/><path d="M403 235H420V251H403Z"/><text data-bj-imprint x="412" y="248" text-anchor="middle">问</text></g>'+seals+
      '<text class="bj-state-label" data-bj-label x="320" y="295" text-anchor="middle">文枢静候</text></svg>'+
      '<div class="bj-schools" role="group" aria-label="切换六家思考提示">'+schools.map((s,i)=>'<button type="button" data-bj-school="'+s.id+'" aria-pressed="'+(i===0?'true':'false')+'" title="'+s.name+' · 思考提示"><span>'+s.glyph+'</span><small>'+s.name+'</small></button>').join('')+'</div>'+
      '<div class="bj-hint"><b data-bj-school-name>儒家 · 思考提示</b><span data-bj-tip>'+letterLine(schools[0].tip)+'</span></div></div>';
  }
  function mount(host) {
    if(!host)return()=>{};
    mounted.get(host)?.();
    const previousAria=host.getAttribute('aria-hidden');host.setAttribute('aria-hidden','false');
    let root=host.matches?.('.j11-bj-core')?host:host.querySelector('.j11-bj-core');
    if(!root){host.innerHTML=markup();root=host.querySelector('.j11-bj-core');}
    const terminal=host.closest('.vm5-terminal'),media=global.matchMedia('(prefers-reduced-motion: reduce)');
    let alive=true,inView=true,lastPhase=null,selected=root.dataset.school||'ru';
    let phaseSource=terminal?.dataset.phase?terminal:host;
    function schoolUpdate(){
      const school=schools.find(s=>s.id===selected)||schools[0];root.dataset.school=school.id;
      root.querySelectorAll('[data-bj-school]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.bjSchool===school.id)));
      root.querySelectorAll('[data-bj-seal]').forEach(seal=>seal.classList.toggle('selected',seal.dataset.bjSeal===school.id));
      root.querySelector('[data-bj-school-name]').textContent=school.name+' · 思考提示';
      root.querySelector('[data-bj-tip]').innerHTML=letterLine(school.tip);
    }
    function gate(){
      if(!alive)return;
      root.dataset.motion=document.hidden||media.matches||!inView||!host.isConnected||lastPhase==='interrupted'||lastPhase==='awaiting'?'off':'on';
    }
    function update(records){
      if(!alive)return;
      if(Array.isArray(records))records.forEach(r=>{if(r.attributeName==='data-phase')phaseSource=r.target;});
      const raw=phaseSource.dataset.phase||host.dataset.phase||terminal?.dataset.phase||'ready';
      const phase=Object.prototype.hasOwnProperty.call(phases,raw)?raw:'ready';
      if(phase!==lastPhase){
        lastPhase=phase;root.dataset.phase=phase;
        root.querySelector('[data-bj-code]').textContent=phases[phase][0];
        root.querySelector('[data-bj-label]').textContent=phases[phase][1];
        root.querySelector('[data-bj-glyph]').textContent=phases[phase][2];
        root.querySelector('[data-bj-imprint]').textContent=phases[phase][2];
        root.setAttribute('aria-label','百家争鸣：'+phases[phase][1]+'；六家按钮切换原创思考提示');
        schoolUpdate();
      }
      gate();
    }
    function measure(){
      if(!alive)return;
      const b=root.getBoundingClientRect();inView=b.width>0&&b.height>0&&b.bottom>0&&b.right>0&&b.top<global.innerHeight&&b.left<global.innerWidth;gate();
    }
    function click(event){
      const btn=event.target.closest?.('[data-bj-school]');
      if(!btn||!root.contains(btn))return;
      selected=btn.dataset.bjSchool;schoolUpdate();gate();
    }
    const mo=new MutationObserver(update);mo.observe(host,{attributes:true,attributeFilter:['data-phase']});if(terminal&&terminal!==host)mo.observe(terminal,{attributes:true,attributeFilter:['data-phase']});
    const io=global.IntersectionObserver?new IntersectionObserver(entries=>{inView=entries.some(e=>e.isIntersecting);gate();},{threshold:.01}):null;io?.observe(root);
    const ro=global.ResizeObserver?new ResizeObserver(measure):null;ro?.observe(root);
    // Some hosts throttle intersection delivery until the next painted frame.
    // A low-frequency geometry check also covers portals and programmatic movement.
    let timer=global.setInterval(()=>{if(document.hidden)gate();else measure();},600);
    root.addEventListener('click',click);document.addEventListener('visibilitychange',gate);global.addEventListener('resize',measure);
    if(media.addEventListener)media.addEventListener('change',gate);else media.addListener(gate);
    update();measure();
    const cleanup=()=>{
      if(!alive)return;alive=false;if(timer!==null)global.clearInterval(timer);
      mo.disconnect();io?.disconnect();ro?.disconnect();root.removeEventListener('click',click);document.removeEventListener('visibilitychange',gate);global.removeEventListener('resize',measure);
      if(media.removeEventListener)media.removeEventListener('change',gate);else media.removeListener(gate);
      root.dataset.motion='off';if(previousAria===null)host.removeAttribute('aria-hidden');else host.setAttribute('aria-hidden',previousAria);if(mounted.get(host)===cleanup)mounted.delete(host);
    };
    mounted.set(host,cleanup);return cleanup;
  }
  global.J7Visuals=global.J7Visuals||{};
  global.J7Visuals.baijia={markup,mount};
})(window);
