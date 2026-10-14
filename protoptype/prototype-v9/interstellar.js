/* Original observatory visual: a lensed accretion disc, distant stars and mission signals. */
(function (global) {
  'use strict';
  var serial = 0, mounted = new WeakMap();
  var phases = {
    ready: ['ORBIT / STANDBY', '探索舱待命', '等待你的下一句话'],
    listening: ['SIGNAL / RECEIVING', '正在接收你的声音', '把这一刻的信号带进来'],
    thinking: ['GRAVITY / ALIGNING', '正在整理你的请求', '关联任务、知识与个人记录'],
    speaking: ['TRANSMISSION / LIVE', '正在向你回应', '你随时可以打断'],
    interrupted: ['TRANSMISSION / HOLD', '联络已暂停', '等待你继续'],
    answered: ['CONTACT / COMPLETE', '回应已到达', '可以继续追问'],
    awaiting: ['MISSION / CONFIRM', '等待你的选择', '确认后继续推进']
  };
  function markup() {
    var id = 'j9-interstellar-' + (++serial), stars = '', contours = '', marks = '', bars = '';
    var seed = 48021;
    function random() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < 96; i++) {
      var x = +(16 + random() * 408).toFixed(1), y = +(14 + random() * 267).toFixed(1);
      stars += '<circle cx="' + x + '" cy="' + y + '" r="' + (i % 19 === 0 ? 1.1 : .45) + '" fill="#eee7dc" opacity="' + (.15 + random() * .45).toFixed(2) + '"/>';
    }
    for (var j = 0; j < 15; j++) {
      contours += '<ellipse cx="220" cy="156" rx="' + (116 + j * 2.35).toFixed(1) + '" ry="' + (25 + j * 1.35).toFixed(1) + '" stroke="url(#' + id + '-disc)" stroke-width="' + (j % 4 === 0 ? 1.4 : .55) + '" opacity="' + (.2 + .04 * (j % 5)) + '"/>';
    }
    for (var k = 0; k < 20; k++) {
      var a = k * Math.PI / 10, px = 220 + Math.cos(a) * 187, py = 147 + Math.sin(a) * 108;
      marks += '<path d="M' + px.toFixed(1) + ' ' + py.toFixed(1) + 'l' + (Math.cos(a) * 4).toFixed(1) + ' ' + (Math.sin(a) * 4).toFixed(1) + '" stroke="#8a7966" stroke-width=".7"/>';
    }
    for (var b = 0; b < 15; b++) bars += '<i style="--is-n:' + b + '"></i>';
    return '<div class="j9-is-core" data-phase="ready" data-motion="on" role="img" aria-label="星际探索舱：引力透镜与黑洞光环">' +
      '<div class="j9-is-top"><span>ENDURANCE / SIGNAL OBSERVATORY</span><b data-is-code>ORBIT / STANDBY</b></div>' +
      '<svg class="j9-is-svg" viewBox="0 0 440 300" fill="none" aria-hidden="true"><defs>' +
      '<radialGradient id="' + id + '-space"><stop stop-color="#4f3828" stop-opacity=".23"/><stop offset=".57" stop-color="#211b15" stop-opacity=".14"/><stop offset="1" stop-color="#080808" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + id + '-corona"><stop stop-color="#080807" stop-opacity="0"/><stop offset=".63" stop-color="#18120e" stop-opacity="0"/><stop offset=".79" stop-color="#b98e57" stop-opacity=".18"/><stop offset=".86" stop-color="#f4e5c9" stop-opacity=".32"/><stop offset=".93" stop-color="#96714c" stop-opacity=".08"/><stop offset="1" stop-color="#080808" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + id + '-disc" x1="64" y1="161" x2="377" y2="144" gradientUnits="userSpaceOnUse"><stop stop-color="#674a31" stop-opacity=".2"/><stop offset=".18" stop-color="#cfb387"/><stop offset=".44" stop-color="#fff4df"/><stop offset=".65" stop-color="#f5e4c6"/><stop offset=".82" stop-color="#ae8055"/><stop offset="1" stop-color="#63462f" stop-opacity=".1"/></linearGradient>' +
      '<linearGradient id="' + id + '-rim" x1="155" y1="60" x2="300" y2="180" gradientUnits="userSpaceOnUse"><stop stop-color="#cfb590"/><stop offset=".32" stop-color="#fff8e6"/><stop offset=".64" stop-color="#f4e4ca"/><stop offset="1" stop-color="#a97a4e"/></linearGradient>' +
      '<filter id="' + id + '-haze" x="-45%" y="-110%" width="190%" height="320%"><feGaussianBlur stdDeviation="6"/></filter>' +
      '<filter id="' + id + '-light" x="-55%" y="-65%" width="210%" height="230%"><feGaussianBlur stdDeviation="2.8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
      '<ellipse cx="220" cy="145" rx="211" ry="138" fill="url(#' + id + '-space)"/>' +
      '<g class="j9-is-stars">' + stars + '</g>' +
      '<ellipse cx="220" cy="147" rx="187" ry="108" stroke="#6b5c4c" stroke-width=".55" stroke-dasharray="2 13" opacity=".46"/>' + marks +
      '<path d="M27 58h27M386 58h27M27 235h27M386 235h27" stroke="#8c7b67" stroke-width=".65" opacity=".6"/>' +
      '<text x="28" y="48" fill="#a39079" font-family="Consolas,monospace" font-size="6.5" letter-spacing="1.2">DEEP SPACE</text><text x="358" y="247" fill="#a39079" font-family="Consolas,monospace" font-size="6.5" letter-spacing="1.2">LOCAL / SIM</text>' +
      '<g class="j9-is-gravity"><circle cx="220" cy="145" r="91" fill="url(#' + id + '-corona)"/>' +
      '<g class="j9-is-disc-back" transform="rotate(-12 220 156)"><ellipse cx="220" cy="156" rx="151" ry="47" stroke="url(#' + id + '-disc)" stroke-width="13" filter="url(#' + id + '-haze)" opacity=".42"/>' + contours + '</g>' +
      '<path class="j9-is-lens-haze" d="M145 143C147 96 173 66 220 66S293 96 295 143" stroke="url(#' + id + '-rim)" stroke-width="14" filter="url(#' + id + '-haze)" opacity=".5"/>' +
      '<path class="j9-is-lens" d="M145 143C147 96 173 66 220 66S293 96 295 143" stroke="url(#' + id + '-rim)" stroke-width="4.2" filter="url(#' + id + '-light)"/>' +
      '<path d="M155 147C157 103 179 77 220 77S283 103 285 147" stroke="#d8ba8d" stroke-width=".65" opacity=".78"/>' +
      '<circle class="j9-is-horizon" cx="220" cy="145" r="63" fill="#030303" stroke="#b1946d" stroke-opacity=".38" stroke-width=".9"/>' +
      '<path class="j9-is-photon" d="M159 145a61 61 0 0 1 122 0" stroke="#fff3d9" stroke-width="1.15" opacity=".9"/>' +
      '<g class="j9-is-disc-front" transform="rotate(-12 220 156)"><path d="M64 156C93 189 345 208 376 156" stroke="url(#' + id + '-disc)" stroke-width="10" filter="url(#' + id + '-haze)" opacity=".64"/><path d="M64 156C93 189 345 208 376 156" stroke="url(#' + id + '-disc)" stroke-width="3.8" filter="url(#' + id + '-light)"/><path d="M79 159C130 185 314 193 362 159M87 167C156 195 310 191 351 169" stroke="#e8d1ad" stroke-width=".75" opacity=".5"/><path class="j9-is-orbit-flow" d="M64 156C93 189 345 208 376 156" stroke="#fff5dd" stroke-width="2.5" stroke-dasharray="1 21" opacity=".75"/></g>' +
      '<ellipse class="j9-is-echo j9-is-echo-a" cx="220" cy="145" rx="101" ry="79" stroke="#d7c4a5" stroke-width=".6" opacity="0"/><ellipse class="j9-is-echo j9-is-echo-b" cx="220" cy="145" rx="101" ry="79" stroke="#d7c4a5" stroke-width=".6" opacity="0"/>' +
      '<g class="j9-is-signal-arrival"><path d="M48 143H126M314 143H392" stroke="#d6bb95" stroke-width=".8" stroke-dasharray="1 8"/><circle cx="126" cy="143" r="2" fill="#e8d7b7"/><circle cx="314" cy="143" r="2" fill="#e8d7b7"/></g></g>' +
      '<path d="M151 267H194M246 267H289" stroke="#8d7861" stroke-width=".6"/><circle cx="220" cy="267" r="2" fill="#cdb690"/>' +
      '<text x="220" y="286" text-anchor="middle" fill="#9b8d79" font-family="Consolas,monospace" font-size="6.8" letter-spacing="2.4">GRAVITATIONAL LENS / VISUAL SIMULATION</text></svg>' +
      '<div class="j9-is-footer"><strong data-is-label>探索舱待命</strong><div class="j9-is-signal" aria-hidden="true">' + bars + '</div><small data-is-hint>等待你的下一句话</small></div></div>';
  }
  function mount(host) {
    if (!host) return function () {};
    var previous = mounted.get(host); if (previous) previous();
    var root = host.matches && host.matches('.j9-is-core') ? host : host.querySelector('.j9-is-core');
    if (!root) { host.innerHTML = markup(); root = host.querySelector('.j9-is-core'); }
    var terminal = host.closest('.vm5-terminal'), alive = true, inView = true, lastPhase = null;
    var phaseSource = terminal && terminal.dataset.phase ? terminal : host;
    var media = global.matchMedia('(prefers-reduced-motion: reduce)');
    function update(records) {
      if (!alive) return;
      if (Array.isArray(records)) records.forEach(function (r) { if (r.attributeName === 'data-phase') phaseSource = r.target; });
      var raw = phaseSource.dataset.phase || host.dataset.phase || (terminal && terminal.dataset.phase) || 'ready';
      var phase = Object.prototype.hasOwnProperty.call(phases,raw) ? raw : 'ready';
      if (lastPhase !== phase) {
        lastPhase = phase; root.dataset.phase = phase;
        ['code','label','hint'].forEach(function (name,i) { root.querySelector('[data-is-' + name + ']').textContent = phases[phase][i]; });
        root.setAttribute('aria-label','星际探索舱：' + phases[phase][1]);
      }
      var motion = document.hidden || global.matchMedia('(prefers-reduced-motion: reduce)').matches || !inView || !host.isConnected ? 'off' : 'on';
      if (root.dataset.motion !== motion) root.dataset.motion = motion;
    }
    var observer = new MutationObserver(update);
    observer.observe(host,{attributes:true,attributeFilter:['data-phase']});
    if (terminal && terminal !== host) observer.observe(terminal,{attributes:true,attributeFilter:['data-phase']});
    var io = global.IntersectionObserver ? new IntersectionObserver(function (entries) { inView = entries.some(function (e) { return e.isIntersecting; }); update(); },{threshold:.05}) : null;
    if (io) io.observe(host);
    document.addEventListener('visibilitychange',update);
    if (media.addEventListener) media.addEventListener('change',update); else media.addListener(update);
    // A cheap visibility gate also covers delayed browser intersection/media notifications.
    var timer = global.setInterval(function () {
      if (!alive) return;
      var r = host.getBoundingClientRect();
      inView = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < global.innerHeight && r.left < global.innerWidth;
      update();
    },400);
    update();
    function cleanup() {
      if (!alive) return;
      alive = false; observer.disconnect(); if (io) io.disconnect(); global.clearInterval(timer);
      document.removeEventListener('visibilitychange',update);
      if (media.removeEventListener) media.removeEventListener('change',update); else media.removeListener(update);
      root.dataset.motion = 'off'; if (mounted.get(host) === cleanup) mounted.delete(host);
    }
    mounted.set(host,cleanup); return cleanup;
  }
  global.J7Visuals = global.J7Visuals || {};
  global.J7Visuals.interstellar = {markup:markup,mount:mount};
})(window);
