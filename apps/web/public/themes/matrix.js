/* Code Awakening: decorative character field, driven only by the public voice phase. */
(function (global) {
  'use strict';
  const glyphs = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789<>[]{}:;=+-/';
  const mounted = new WeakMap();
  const phases = {
    ready: ['STANDBY', '等待你的声音'],
    listening: ['SIGNAL IN', '正在倾听'],
    thinking: ['ORGANIZING', '整理问题与资料'],
    speaking: ['RESPONSE OUT', '正在回应'],
    interrupted: ['PAUSED', '已停止，等你继续'],
    answered: ['RESPONSE READY', '回应已整理好'],
    awaiting: ['YOUR CHOICE', '等待你确认']
  };
  function markup() {
    return '<div class="j7-matrix-core" data-mx-phase="ready" role="img" aria-label="悬浮立体代码晶体、同心数据环与数字雨，随对话状态变化的示意动画">' +
      '<canvas class="j7-matrix-canvas" aria-hidden="true"></canvas>' +
      '<pre class="j7-matrix-fallback" aria-hidden="true">       ╱─────────╱│\n      ╱ 01 01 01╱ │\n     ┌─────────┐  │\n     │ 01 10 01│ 01\n     │ 10 ◇ 10 │ ╱\n     │ 01 10 01│╱\n     └─────────┘\n   ── 01 ─ 10 ─ 01 ──</pre>' +
      '<div class="j7-mx-corner j7-mx-top-left"><span>CODE / CRYSTAL</span><b>悬浮数字核心</b></div>' +
      '<div class="j7-mx-corner j7-mx-top-right"><i></i><span>VISUAL INTERFACE</span></div>' +
      '<div class="j7-mx-corner j7-mx-bottom-left"><span data-mx-label>STANDBY</span><b data-mx-status>等待你的声音</b></div>' +
      '<div class="j7-mx-corner j7-mx-bottom-right"><span>ORBITAL DATA FIELD</span><b>状态示意 · 非性能指标</b></div>' +
      '<div class="j7-mx-edge j7-mx-edge-a"></div><div class="j7-mx-edge j7-mx-edge-b"></div></div>';
  }
  function mount(host) {
    if (!host) return function () {};
    mounted.get(host)?.();
    const root = host.matches?.('.j7-matrix-core') ? host : host.querySelector('.j7-matrix-core');
    if (!root) return function () {};
    const canvas = root.querySelector('canvas');
    const ctx = canvas?.getContext('2d', {alpha: true});
    if (!ctx) return function () {};
    root.classList.add('j7-mx-mounted');
    const terminal = host.closest('.vm5-terminal');
    const motion = global.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 540, height = 380, dpr = 1, frame = 0, last = 0, clock = 2.6;
    let phase = 'ready', alive = true, visible = true, reduced = motion.matches;
    const tiles = [], planes = [], vertices = [];
    const columns = [];
    function noise(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
    // Three-dimensional code planes form a geometric cube, with a smaller octahedral crystal inside.
    for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
      const normal = [0, 0, 0]; normal[axis] = sign;
      const point = (u, v) => axis === 0 ? [sign, u, v] : axis === 1 ? [u, sign, v] : [u, v, sign];
      const id = axis * 2 + (sign > 0 ? 1 : 0);
      planes.push({normal, corners: [point(-1,-1),point(1,-1),point(1,1),point(-1,1)], id});
      for (let row = 0; row < 7; row++) for (let col = 0; col < 7; col++) {
        const p = point(-0.77 + col * 0.257, -0.77 + row * 0.257), seed = id * 97 + row * 29 + col * 17;
        tiles.push({p, normal, seed, char: Math.floor(noise(seed + 9) * 16)});
      }
    }
    for (let i = 0; i < 8; i++) vertices.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1]);
    function getPhase(source) {
      const value = source?.dataset?.phase || host.dataset.phase || terminal?.dataset.phase || host.closest('[data-phase]')?.dataset.phase;
      if (phases[value]) return value;
      return Object.keys(phases).find(p => host.classList.contains('vm5-' + p)) || 'ready';
    }
    function syncPhase(records) {
      let source = host;
      if (Array.isArray(records)) for (const record of records) if (record.attributeName === 'data-phase') source = record.target;
      phase = getPhase(source); root.dataset.mxPhase = phase;
      root.querySelector('[data-mx-label]').textContent = phases[phase][0];
      root.querySelector('[data-mx-status]').textContent = phases[phase][1];
      schedule(true);
    }
    function resize() {
      const box = root.getBoundingClientRect();
      width = Math.max(120, box.width || host.clientWidth || 540);
      height = Math.max(140, box.height || host.clientHeight || 380);
      dpr = Math.min(2, Math.max(1, global.devicePixelRatio || 1));
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      columns.length = 0;
      const step = width < 400 ? 12 : 15;
      for (let i = 0; i < Math.ceil(width / step); i++) columns.push({x: i * step + 6, offset: noise(i + 4) * height * 2, speed: 18 + noise(i + 42) * 35, depth: noise(i + 88), seed: i * 67});
      schedule(true);
    }
    function color(alpha, white) { return white ? 'rgba(203,255,208,' + alpha + ')' : 'rgba(97,255,103,' + alpha + ')'; }
    function draw(t) {
      ctx.clearRect(0, 0, width, height);
      const stopped = phase === 'interrupted';
      const activity = phase === 'listening' ? 1.4 : phase === 'thinking' ? 1.8 : phase === 'speaking' ? 1.35 : stopped ? 0.18 : 0.75;
      const rainT = t * activity;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const column of columns) {
        const size = 8 + column.depth * 5, step = size * 1.48;
        const lead = ((column.offset + rainT * column.speed) % (height + 170)) - 65;
        ctx.font = size.toFixed(1) + 'px Consolas, monospace';
        for (let tail = 0; tail < 13; tail++) {
          const y = lead - tail * step; if (y < 0 || y > height) continue;
          const center = Math.abs(column.x - width / 2) < width * 0.21;
          const alpha = (1 - tail / 13) * (0.13 + column.depth * 0.23) * (center ? 0.27 : 1) * (stopped ? 0.35 : 1);
          ctx.fillStyle = color(alpha, tail === 0);
          const index = Math.floor(noise(column.seed + tail * 19 + Math.floor(rainT * 1.7)) * glyphs.length);
          ctx.fillText(glyphs[index], column.x, y);
        }
      }
      // Depth guides behind a suspended geometric code crystal.
      ctx.strokeStyle = 'rgba(84,228,94,.085)'; ctx.lineWidth = 0.6;
      for (let i = 1; i < 6; i++) {
        const y = height * (i / 6); ctx.beginPath(); ctx.moveTo(width * 0.13, y); ctx.lineTo(width * 0.87, y); ctx.stroke();
      }
      const pulse = reduced ? 0.5 : 0.5 + Math.sin(t * (phase === 'speaking' ? 4.1 : 1.65)) * 0.5;
      const turn = 0.56 + (reduced ? 0 : t * (phase === 'thinking' ? 0.33 : stopped ? 0.012 : phase === 'awaiting' ? 0.025 : 0.14));
      const pitch = -0.43, roll = -0.045;
      const cy = Math.cos(turn), sy = Math.sin(turn), cx = Math.cos(pitch), sx = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
      const scale = Math.min(width * 0.18, height * 0.273);
      const dim = stopped ? 0.3 : 1;
      const complete = phase === 'answered';
      function spin(p) {
        const x = p[0] * cy + p[2] * sy, z = -p[0] * sy + p[2] * cy;
        const y = p[1] * cx - z * sx, zz = p[1] * sx + z * cx;
        return [x * cr - y * sr, x * sr + y * cr, zz];
      }
      function project(p) {
        const r = spin(p), perspective = 7 / (7 - r[2]);
        return [width * 0.5 + r[0] * scale * perspective, height * 0.46 + r[1] * scale * perspective, r[2]];
      }
      function line(a, b, alpha, bright, thickness) {
        const p = project(a), q = project(b);ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);
        ctx.strokeStyle = color(alpha * dim, bright);ctx.lineWidth = thickness || 0.8;ctx.stroke();
      }
      const halo = ctx.createRadialGradient(width * 0.5,height * 0.46,0,width * 0.5,height * 0.46,scale * 2.05);
      halo.addColorStop(0,'rgba(37,255,95,'+((complete?0.10:0.065) * dim)+')');halo.addColorStop(0.45,'rgba(41,220,86,.025)');halo.addColorStop(1,'rgba(41,220,86,0)');
      ctx.fillStyle=halo;ctx.fillRect(width * 0.5-scale * 2.1,height * 0.46-scale * 2.1,scale * 4.2,scale * 4.2);
      // Concentric tilted data orbits encircle the cube in depth; binary markers travel along them.
      const orbitalSpeed = phase === 'thinking' ? 1.1 : phase === 'listening' ? 0.75 : phase === 'speaking' ? 0.64 : stopped ? 0.025 : 0.23;
      for (let ring = 0; ring < 3; ring++) {
        const radius = 1.48 + ring * 0.29 + (phase === 'speaking' ? pulse * 0.055 * ring : 0);
        ctx.beginPath();
        for (let i = 0; i <= 100; i++) {
          const a = i / 100 * Math.PI * 2, p=project([Math.cos(a)*radius,0.12,Math.sin(a)*radius]);
          if(!i)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);
        }
        ctx.strokeStyle=color((ring===1?0.26:0.13)*dim,false);ctx.lineWidth=0.65;ctx.stroke();
        for (let i = 0; i < 30; i++) {
          const a = i / 30 * Math.PI * 2 + (reduced?0:t*orbitalSpeed*(ring===1?-1:1));
          const p=project([Math.cos(a)*radius,0.12,Math.sin(a)*radius]);
          if(i%5===0){ctx.font='7px Consolas, monospace';ctx.fillStyle=color((i===0?0.8:0.32)*dim,i===0);ctx.fillText(i%2?'01':'10',p[0],p[1]);}
          else{ctx.fillStyle=color((i===1?0.9:0.27)*dim,i===1);ctx.fillRect(p[0]-0.9,p[1]-0.9,1.8,1.8);}
        }
      }
      // Transparent planar shells give the coded volume a clearly angular silhouette.
      const shells = planes.map(plane=>({...plane,normalZ:spin(plane.normal)[2]})).filter(plane=>plane.normalZ>0.01).sort((a,b)=>a.normalZ-b.normalZ);
      for(const plane of shells){
        ctx.beginPath();plane.corners.forEach((v,i)=>{const p=project(v);if(!i)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);});ctx.closePath();
        ctx.fillStyle='rgba(20,146,58,'+((0.025+plane.normalZ*0.035)*dim)+')';ctx.fill();
      }
      const font=Math.max(8,Math.min(11,scale*0.12));ctx.font=font.toFixed(1)+'px Consolas, monospace';
      const coded = tiles.map(tile=>({...tile,normalZ:spin(tile.normal)[2],projected:project(tile.p)})).filter(tile=>tile.normalZ>0.08).sort((a,b)=>a.projected[2]-b.projected[2]);
      for(const tile of coded){
        const tick=Math.floor(t*(phase==='thinking'?4.4:1.15)+tile.seed%11);
        const scan = phase==='thinking' && (Math.floor((tile.p[1]+1)*8)+Math.floor(t*6))%9<2;
        const alpha=(0.32+tile.normalZ*0.36+noise(tile.seed)*0.18+(scan?0.18:0)+(complete?0.08:0))*dim;
        ctx.fillStyle=color(Math.min(0.95,alpha),scan||tile.normalZ>0.84);
        ctx.fillText('01ABCDEF<>:{}'.charAt((tile.char+tick)%12),tile.projected[0],tile.projected[1]);
      }
      // Twelve luminous cube edges and precision registration marks.
      for(let i=0;i<8;i++)for(let j=i+1;j<8;j++){
        const changed=Number(vertices[i][0]!==vertices[j][0])+Number(vertices[i][1]!==vertices[j][1])+Number(vertices[i][2]!==vertices[j][2]);
        if(changed!==1)continue;
        const depth=(spin(vertices[i])[2]+spin(vertices[j])[2])/2;
        line(vertices[i],vertices[j],depth>0?(complete?0.91:0.72):0.24,depth>0,depth>0?1.0:0.7);
      }
      for(const vertex of vertices){const p=project(vertex);ctx.fillStyle=color((p[2]>0?0.95:0.35)*dim,true);ctx.fillRect(p[0]-1.4,p[1]-1.4,2.8,2.8);}
      const crystal=[[0.58,0,0],[-0.58,0,0],[0,0.72,0],[0,-0.72,0],[0,0,0.58],[0,0,-0.58]];
      for(const x of [0,1])for(const y of [2,3])for(const z of [4,5]){
        const points=[project(crystal[x]),project(crystal[y]),project(crystal[z])];
        ctx.beginPath();points.forEach((p,i)=>{if(!i)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);});ctx.closePath();
        ctx.fillStyle='rgba(91,255,141,'+((0.034+0.019*pulse)*dim)+')';ctx.fill();
      }
      ctx.shadowColor='#70ff96';ctx.shadowBlur=stopped?0:8+4*pulse;
      for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){
        if(Math.floor(i/2)===Math.floor(j/2))continue;
        line(crystal[i],crystal[j],0.37+0.20*pulse,true,0.9);
      }
      ctx.shadowBlur=0;
      if(phase==='speaking'||phase==='listening'){
        for(let i=0;i<10;i++){
          const a=i/10*Math.PI*2, travel=reduced?0.5:(t*0.45+i*0.1)%1;
          const radius=phase==='listening'?2.27-travel*1.25:1.02+travel*1.25,p=project([Math.cos(a)*radius,0.12,Math.sin(a)*radius]);
          ctx.fillStyle=color((1-travel)*0.5*dim,false);ctx.fillRect(p[0]-1.4,p[1]-1.4,2.8,2.8);
        }
      }
    }
    function animate(now) {
      frame = 0;
      if (!alive || document.hidden || !visible || reduced || !host.isConnected) return;
      if (now - last >= 1000 / 28) { const elapsed = last ? Math.min(0.08, (now - last) / 1000) : 0.036;clock += elapsed;last = now;draw(clock); }
      frame = global.requestAnimationFrame(animate);
    }
    function schedule(force) {
      if (!alive) return;
      if (document.hidden || !visible || !host.isConnected) {if(frame)global.cancelAnimationFrame(frame);frame=0;last=0;return;}
      if (force) draw(clock || 2.6);
      if (reduced) {if(frame)global.cancelAnimationFrame(frame);frame=0;last=0;return;}
      if (!frame) frame = global.requestAnimationFrame(animate);
    }
    function onVisibility() {schedule(true);}
    function onMotion(event) {reduced=event.matches;last=0;schedule(true);}
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(root);
    const phaseObserver = new MutationObserver(syncPhase);
    phaseObserver.observe(host, {attributes:true,attributeFilter:['data-phase','class']});
    if (terminal && terminal !== host) phaseObserver.observe(terminal, {attributes:true,attributeFilter:['data-phase']});
    const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting!==false;schedule(true);},{threshold:0.01}) : null;
    intersection?.observe(root);
    document.addEventListener('visibilitychange', onVisibility);
    if (motion.addEventListener) motion.addEventListener('change', onMotion); else motion.addListener(onMotion);
    if (!resizeObserver) global.addEventListener('resize', resize);
    resize();syncPhase();
    const cleanup = function () {
      if (!alive) return;alive=false;
      if (frame) global.cancelAnimationFrame(frame);frame=0;
      resizeObserver?.disconnect();phaseObserver.disconnect();intersection?.disconnect();
      document.removeEventListener('visibilitychange',onVisibility);
      if (motion.removeEventListener) motion.removeEventListener('change',onMotion);else motion.removeListener(onMotion);
      if (!resizeObserver) global.removeEventListener('resize',resize);
      ctx.clearRect(0,0,width,height);root.classList.remove('j7-mx-mounted');
      mounted.delete(host);
    };
    mounted.set(host, cleanup);
    return cleanup;
  }
  global.J7Visuals = global.J7Visuals || {};
  global.J7Visuals.matrix = {markup, mount};
})(window);
