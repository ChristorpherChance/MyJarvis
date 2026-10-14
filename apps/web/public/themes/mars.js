/* Ares Habitat: original procedural terrain and settlement network. Public voice phase only. */
(function (global) {
  'use strict';
  const mounted = new WeakMap();
  let serial = 0;
  const phases = {
    ready: ['HABITAT / STANDBY', '栖居网络待命', '等待你的下一句话'],
    listening: ['UPLINK / INPUT', '基地正在倾听', '输入信号汇入栖居网络'],
    thinking: ['ORBIT / ORGANIZING', '轨道通信正在整理', '扫描与关联 · 准备回应'],
    speaking: ['DOWNLINK / OUTPUT', '基地正在回应', '联络回传 · 随时可以打断'],
    interrupted: ['CHANNEL / HOLD', '联络已经停下', '等待你继续'],
    answered: ['REPORT / READY', '回应已经整理好', '可以继续追问'],
    awaiting: ['MISSION / YOUR CHOICE', '等待你的决定', '确认对象与范围后继续']
  };
  function markup() {
    const id = 'j9-ms-' + (++serial);
    return '<div class="j9-mars-core" data-phase="ready" data-motion="off" role="img" aria-label="火星栖居网络：立体地形、栖居穹顶与轨道通信的原创视觉示意">' +
      '<div class="j9-ms-top"><span>ARES / HABITAT NETWORK</span><b data-ms-code>HABITAT / STANDBY</b></div>' +
      '<svg class="j9-ms-fallback" viewBox="0 0 540 300" aria-hidden="true"><defs><radialGradient id="' + id + '-planet" cx=".32" cy=".23" r=".8"><stop stop-color="#e9b491"/><stop offset=".36" stop-color="#c78059"/><stop offset=".65" stop-color="#985336"/><stop offset="1" stop-color="#301c19"/></radialGradient></defs><ellipse cx="270" cy="150" rx="203" ry="49" fill="none" stroke="#d8c6a0" stroke-opacity=".35" transform="rotate(-18 270 150)"/><circle cx="270" cy="150" r="99" fill="url(#' + id + '-planet)"/><path d="M192 114c28 25 65-25 103-5s37 53 60 37M184 164c53-32 81 27 153 1M223 226c7-49 47-36 70-51" fill="none" stroke="#f1c39d" stroke-opacity=".2"/><ellipse cx="270" cy="150" rx="181" ry="64" fill="none" stroke="#e8a17b" stroke-opacity=".5" transform="rotate(20 270 150)"/><path d="M232 173q6-13 12 0m30-49q6-13 12 0m16 81q6-13 12 0M238 173Q259 161 280 124Q303 152 308 205" fill="none" stroke="#e7d5b7" stroke-width="1.3"/></svg>' +
      '<canvas class="j9-ms-canvas" aria-hidden="true"></canvas><div class="j9-ms-coordinate"><span>TOPOGRAPHY / 01</span><i>栖居 · 轨道 · 联络</i></div>' +
      '<div class="j9-ms-bottom"><strong data-ms-label>栖居网络待命</strong><small data-ms-hint>等待你的下一句话</small><em>原创图形 · 非真实航天数据</em></div></div>';
  }
  function makePlanet(size) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const c = canvas.getContext('2d');
    const image = c.createImageData(size, size), pixels = image.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const nx = (x + .5) / size * 2 - 1, ny = (y + .5) / size * 2 - 1, rr = nx * nx + ny * ny;
      if (rr > 1) continue;
      const nz = Math.sqrt(1 - rr), lon = Math.atan2(nx, nz), lat = Math.asin(ny);
      const broad = Math.sin(lon * 7.3 + Math.cos(lat * 5.1) * 1.4) * Math.cos(lat * 9.7 - lon * 3.1);
      const ridge = Math.sin(lon * 28 + lat * 11 + broad * 3) * Math.sin(lat * 33 - lon * 8);
      const grain = Math.sin(nx * 473 + ny * 379 + nz * 137) * Math.cos(nx * 167 - ny * 291);
      const channel = Math.exp(-Math.pow((ny - Math.sin(nx * 3.7) * .12 + .07) * 22, 2)) * (.35 + nz * .5);
      const polar = Math.max(0, -ny - .8) * 2.7;
      const light = .28 + Math.max(0, -.38 * nx - .52 * ny + .72 * nz) * .76;
      const terrain = broad * 17 + ridge * 6 + grain * 4 - channel * 28;
      const at = (y * size + x) * 4;
      pixels[at] = Math.min(255, (184 + terrain + polar * 24) * light);
      pixels[at + 1] = Math.min(255, (99 + terrain * .69 + polar * 45) * light);
      pixels[at + 2] = Math.min(255, (65 + terrain * .45 + polar * 48) * light);
      pixels[at + 3] = Math.min(255, (1 - rr) * size * 60);
    }
    c.putImageData(image, 0, 0);
    const craters = [[-.48,-.32,.085],[-.17,-.57,.044],[.22,-.26,.072],[.5,.12,.054],[-.36,.36,.039],[.02,.47,.061],[.4,.55,.035],[-.63,.07,.046],[.12,.08,.025],[-.02,-.15,.02],[.58,-.42,.036],[-.1,.65,.025]];
    for (const [x,y,r] of craters) {
      const z = Math.sqrt(Math.max(0, 1 - x*x - y*y)), radius = r * size / 2;
      c.save(); c.translate((x+1)*size/2,(y+1)*size/2); c.rotate(Math.atan2(y,x)); c.scale(.35+z*.65,1);
      const shade = c.createRadialGradient(-radius*.18,-radius*.2,0,0,0,radius);
      shade.addColorStop(0,'#512f2655'); shade.addColorStop(.65,'#56342935'); shade.addColorStop(.86,'#e9b38636'); shade.addColorStop(1,'#a86a4110');
      c.fillStyle=shade;c.beginPath();c.arc(0,0,radius,0,Math.PI*2);c.fill();c.strokeStyle='#f3bf943f';c.lineWidth=Math.max(.5,size/500);c.beginPath();c.arc(0,0,radius*.89,.35,2.8);c.stroke();c.restore();
    }
    return canvas;
  }
  function mount(host) {
    if (!host) return () => {};
    mounted.get(host)?.();
    let root = host.matches?.('.j9-mars-core') ? host : host.querySelector('.j9-mars-core');
    if (!root) {host.innerHTML=markup();root=host.querySelector('.j9-mars-core');}
    const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d'),terminal=host.closest('.vm5-terminal'),media=global.matchMedia('(prefers-reduced-motion: reduce)');
    let alive=true,visible=true,reduced=media.matches,phase='ready',width=1,height=1,frame=0,last=0,clock=2.1,planet=null,radius=1,cx=1,cy=1;
    const centers=[[-.34,.18],[.28,-.12],[.43,.46]];
    function orbitPoint(a,ring){const rx=radius*(1.42+ring*.22),ry=radius*(.36+ring*.08),rot=ring===1?.43:-.27;const x=Math.cos(a)*rx,y=Math.sin(a)*ry;return [cx+x*Math.cos(rot)-y*Math.sin(rot),cy+x*Math.sin(rot)+y*Math.cos(rot)];}
    function orbits(front,t){
      for(let ring=0;ring<3;ring++){
        ctx.strokeStyle=ring===1?'#e8a17b':'#cfbca0';ctx.lineWidth=ring===1?1:.65;ctx.globalAlpha=front?.38:.17;ctx.setLineDash(ring===2?[2,5]:[]);ctx.beginPath();let open=false;
        for(let i=0;i<=140;i++){const a=i/140*Math.PI*2,p=orbitPoint(a,ring);if((Math.sin(a)>0)===front){if(open)ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1]);open=true}else open=false;}ctx.stroke();ctx.setLineDash([]);
        const speed=phase==='thinking'?.51:phase==='listening'?.23:phase==='awaiting'?0:phase==='interrupted'?0:.1;
        const a=t*speed+ring*2.08,p=orbitPoint(a,ring);if((Math.sin(a)>0)===front){ctx.globalAlpha=phase==='interrupted'?.22:.9;ctx.fillStyle=ring===1?'#f5bc91':'#e4d4ba';ctx.save();ctx.translate(p[0],p[1]);ctx.rotate(a+.5);ctx.fillRect(-2,-2,4,4);ctx.strokeStyle='#d9b49988';ctx.strokeRect(-5,-1,2,2);ctx.strokeRect(3,-1,2,2);ctx.restore();}
      }
      ctx.globalAlpha=1;
    }
    function habitat(x,y,s,index,t){
      const lit=phase==='answered'||phase==='speaking'||phase==='listening'||(phase==='thinking'&&Math.floor(t*2)%3===index);
      ctx.save();ctx.translate(x,y);ctx.fillStyle=lit?'#e6d1ac50':'#d7b99520';ctx.strokeStyle=lit?'#f2dfc3':'#ccaa83';ctx.lineWidth=.85;
      ctx.beginPath();ctx.ellipse(0,0,s*.66,s*.42,0,Math.PI,Math.PI*2);ctx.lineTo(s*.66,1);ctx.lineTo(-s*.66,1);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,-s*.42);ctx.lineTo(0,1);ctx.moveTo(-s*.6,-s*.14);ctx.quadraticCurveTo(0,-s*.05,s*.6,-s*.14);ctx.stroke();
      ctx.fillStyle='#192523';ctx.fillRect(-s*.68,1,s*1.36,2);ctx.fillStyle=phase==='interrupted'?'#8d6b58':'#b9d0b3';ctx.fillRect(-1,1,2,2);
      if(index===2){ctx.fillStyle='#393f3a';ctx.strokeStyle='#a9b4a470';for(let j=0;j<3;j++){ctx.fillRect(s*.95+j*3,-s*.19,2.5,s*.45);ctx.strokeRect(s*.95+j*3,-s*.19,2.5,s*.45)}}
      if(width>430){ctx.fillStyle='#e6caae';ctx.font='7px Consolas,monospace';ctx.fillText('HAB / 0'+(index+1),-s*.9,s*.82+6)}ctx.restore();
    }
    function draw(t){
      if(!ctx||!alive)return;ctx.clearRect(0,0,width,height);if(width<2||height<2||!planet)return;const interrupted=phase==='interrupted';
      ctx.globalAlpha=interrupted?.55:1;
      // A quiet coordinate field gives the planet room; no fabricated instrument readings.
      ctx.fillStyle='#d6b99b';for(let i=0;i<28;i++){const x=(i*83.17+19)%width,y=(i*47.31+17)%height;ctx.globalAlpha=.08+(i%4)*.025;ctx.fillRect(x,y,i%7?1:1.5,1)}
      ctx.strokeStyle='#bda38220';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(cx-radius*2.15,cy);ctx.lineTo(cx+radius*2.15,cy);ctx.moveTo(cx,cy-radius*1.3);ctx.lineTo(cx,cy+radius*1.36);ctx.stroke();
      const glow=ctx.createRadialGradient(cx-radius*.15,cy-radius*.2,radius*.45,cx,cy,radius*1.35);glow.addColorStop(0,'#d58a5720');glow.addColorStop(.74,'#bd6b4313');glow.addColorStop(1,'#d58a5700');ctx.globalAlpha=1;ctx.fillStyle=glow;ctx.fillRect(cx-radius*1.5,cy-radius*1.5,radius*3,radius*3);
      orbits(false,t);ctx.globalAlpha=interrupted?.62:1;ctx.drawImage(planet,cx-radius,cy-radius,radius*2,radius*2);
      ctx.save();ctx.beginPath();ctx.arc(cx,cy,Math.max(.1,radius-.4),0,Math.PI*2);ctx.clip();ctx.lineWidth=.55;ctx.strokeStyle='#ecc09a';ctx.globalAlpha=.095;
      for(let i=-6;i<=6;i++){ctx.beginPath();for(let j=0;j<=40;j++){const x=-radius+j/40*radius*2,y=i*radius*.135+Math.sin(j*.36+i)*radius*.021+Math.cos(j*.72-i*.3)*radius*.018;if(j)ctx.lineTo(cx+x,cy+y);else ctx.moveTo(cx+x,cy+y)}ctx.stroke()}ctx.restore();
      ctx.globalAlpha=interrupted?.3:.7;ctx.strokeStyle='#f1b28970';ctx.lineWidth=.85;ctx.beginPath();ctx.arc(cx,cy,radius+.5,Math.PI*.82,Math.PI*1.63);ctx.stroke();
      const nodes=centers.map(p=>[cx+p[0]*radius,cy+p[1]*radius]);ctx.strokeStyle=phase==='thinking'?'#efd2a9':phase==='awaiting'?'#dbc59d':'#acc5aa';ctx.lineWidth=.8;ctx.globalAlpha=interrupted?.15:.48;
      for(let i=0;i<3;i++){const a=nodes[i],b=nodes[(i+1)%3];ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.quadraticCurveTo(cx+(a[0]-cx)*.16,cy+(b[1]-cy)*.2,b[0],b[1]);ctx.stroke();}ctx.setLineDash([]);ctx.globalAlpha=interrupted?.4:1;
      nodes.forEach((n,i)=>habitat(n[0],n[1],Math.max(7,radius*.12),i,t));orbits(true,t);
      if(phase==='thinking'){const a=t*.85;ctx.strokeStyle='#f0c39a';ctx.globalAlpha=.75;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(cx,cy,radius*1.17,a,a+.55);ctx.stroke();ctx.globalAlpha=.15;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*radius*1.1,cy+Math.sin(a)*radius*1.1);ctx.stroke();}
      if(phase==='listening'||phase==='speaking'){
        for(let i=0;i<18;i++){const q=reduced?.4:(t*.5+i/18)%1,a=i*2.39996,dist=phase==='listening'?radius*(1.95-q*1.25):radius*(.62+q*1.32);ctx.fillStyle='#f3ceb0';ctx.globalAlpha=Math.sin(q*Math.PI)*.78;ctx.beginPath();ctx.arc(cx+Math.cos(a)*dist,cy+Math.sin(a)*dist*.63,i%4?1:1.6,0,Math.PI*2);ctx.fill();}
      }
      if(phase==='speaking'){for(let i=0;i<2;i++){const q=reduced?.55:(t*.38+i*.5)%1;ctx.globalAlpha=(1-q)*.24;ctx.strokeStyle='#ead2ad';ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(cx,cy,radius*(.92+q*.96),radius*(.74+q*.55),-.12,0,Math.PI*2);ctx.stroke();}}
      if(phase==='answered'){ctx.globalAlpha=.53;ctx.strokeStyle='#d7dfc4';ctx.lineWidth=1;for(const n of nodes){ctx.beginPath();ctx.arc(n[0],n[1],5,0,Math.PI*2);ctx.stroke();}}
      if(phase==='awaiting'){ctx.globalAlpha=.65;ctx.strokeStyle='#dec89d';ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(cx,cy,radius*1.14,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
      ctx.globalAlpha=.42;ctx.strokeStyle='#c5a98c';ctx.lineWidth=.65;for(const sign of [-1,1]){const x=cx+sign*radius*1.85,y=cy-radius*.92;ctx.beginPath();ctx.moveTo(x-sign*9,y);ctx.lineTo(x,y);ctx.lineTo(x,y+9);ctx.stroke();}ctx.globalAlpha=1;
    }
    function animation(now){frame=0;if(!alive)return;if(reduced!==media.matches){schedule(true);return;}if(document.hidden||!visible||reduced||!host.isConnected||['interrupted','awaiting'].includes(phase))return;if(now-last>=1000/24){clock+=last?Math.min(.07,(now-last)/1000):.04;last=now;draw(clock);}frame=global.requestAnimationFrame(animation);}
    function schedule(force){if(!alive)return;reduced=media.matches;const paused=document.hidden||!visible||reduced||!host.isConnected||['interrupted','awaiting'].includes(phase);root.dataset.motion=paused?'off':'on';if(paused&&frame){global.cancelAnimationFrame(frame);frame=0;last=0;}if(force&&!document.hidden&&visible)draw(reduced?2.1:clock);if(!paused&&!frame)frame=global.requestAnimationFrame(animation);}
    function sync(records){let source=host;if(Array.isArray(records))for(const record of records)if(record.attributeName==='data-phase')source=record.target;const raw=source.dataset.phase||host.dataset.phase||terminal?.dataset.phase||'ready';phase=phases[raw]?raw:'ready';root.dataset.phase=phase;root.querySelector('[data-ms-code]').textContent=phases[phase][0];root.querySelector('[data-ms-label]').textContent=phases[phase][1];root.querySelector('[data-ms-hint]').textContent=phases[phase][2];root.setAttribute('aria-label','火星栖居网络：'+phases[phase][1]+'，原创视觉示意');schedule(true);}
    function resize(){if(!ctx)return;const box=canvas.getBoundingClientRect(),dpr=Math.min(global.devicePixelRatio||1,2);width=Math.max(1,box.width);height=Math.max(1,box.height);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);radius=Math.max(1,Math.min(width*.245,height*.455));cx=width*.5;cy=height*.49;const size=Math.max(96,Math.min(480,Math.ceil(radius*2*dpr)));if(!planet||planet.width!==size)planet=makePlanet(size);root.classList.add('j9-ms-mounted');schedule(true);}
    function visibility(){schedule(true);}
    function motion(event){reduced=event.matches;last=0;schedule(true);}
    const observer=new MutationObserver(sync);observer.observe(host,{attributes:true,attributeFilter:['data-phase']});if(terminal&&terminal!==host)observer.observe(terminal,{attributes:true,attributeFilter:['data-phase']});
    const ro=global.ResizeObserver?new ResizeObserver(resize):null;ro?.observe(root);
    const io=global.IntersectionObserver?new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);schedule(true);},{threshold:.01}):null;io?.observe(root);
    const gateTimer=global.setInterval(()=>{if(!alive)return;const box=root.getBoundingClientRect(),inView=box.width>0&&box.height>0&&box.bottom>0&&box.right>0&&box.top<global.innerHeight&&box.left<global.innerWidth;if(inView!==visible||reduced!==media.matches){visible=inView;schedule(true);}},400);
    document.addEventListener('visibilitychange',visibility);if(media.addEventListener)media.addEventListener('change',motion);else media.addListener(motion);if(!ro)global.addEventListener('resize',resize);
    resize();sync();
    const cleanup=()=>{if(!alive)return;alive=false;if(frame)global.cancelAnimationFrame(frame);frame=0;global.clearInterval(gateTimer);observer.disconnect();ro?.disconnect();io?.disconnect();document.removeEventListener('visibilitychange',visibility);if(media.removeEventListener)media.removeEventListener('change',motion);else media.removeListener(motion);if(!ro)global.removeEventListener('resize',resize);ctx?.clearRect(0,0,width,height);root.dataset.motion='off';root.classList.remove('j9-ms-mounted');planet=null;if(mounted.get(host)===cleanup)mounted.delete(host);};mounted.set(host,cleanup);return cleanup;
  }
  global.J7Visuals=global.J7Visuals||{};
  global.J7Visuals.mars={markup,mount};
})(window);
