/* Original dual-drive mech cockpit. Public phase visuals only; no business or audio APIs. */
(function (global) {
  'use strict';
  var serial = 0;
  var mounted = new WeakMap();
  var phases = {
    ready: ['DRIFT / STANDBY', '双通道待命', '等待你的下一句话'],
    listening: ['NEURAL / INPUT', '神经通道接收', '两个通道同步倾听'],
    thinking: ['DRIFT / PROCESS', '协同处理请求', '正在整理意图与相关事项'],
    speaking: ['COMMS / OUTPUT', '联络回传中', '你随时可以打断'],
    interrupted: ['DRIVE / HOLD', '动力联络暂停', '等待你继续'],
    answered: ['COMMS / READY', '联络报告已就绪', '可以继续追问'],
    awaiting: ['COMMAND / SELECT', '等待你的决定', '确认后继续推进']
  };
  function turbine(id, cx, side) {
    var lugs = '', blades = '';
    for (var i = 0; i < 12; i++) {
      lugs += '<g transform="rotate(' + (i * 30) + ')"><path d="M-8-79H8L12-68 7-59H-7L-12-68Z" fill="url(#' + id + '-steel)" stroke="#07101b" stroke-width="2"/><path d="M-4-73H4M-5-69H5" stroke="#6e8594" stroke-width="1"/><rect x="-4" y="-78" width="8" height="3" fill="' + (side === 'left' ? '#6cc6ff' : '#ff9d56') + '"/></g>';
      blades += '<path transform="rotate(' + (i * 30) + ')" d="M-8-45 4-53 20-46 24-31 8-23-3-10-9-21 2-34Z" fill="url(#' + id + '-blade)" stroke="#06111c" stroke-width="1.5"/>';
    }
    return '<g class="j7-je-' + side + '" transform="translate(' + cx + ' 154)">' +
      '<circle r="82" fill="#08121f" stroke="#395368" stroke-width="2"/>' + lugs +
      '<circle r="60" fill="#050b14" stroke="#6b7d89" stroke-width="7"/><circle r="55" fill="#0b1b2b" stroke="#1c3143" stroke-width="3"/>' +
      '<g class="j7-je-rotor">' + blades + '</g><circle r="27" fill="#07131f" stroke="#5e7788" stroke-width="3"/>' +
      '<circle class="j7-je-power" r="21" fill="url(#' + id + '-' + side + ')" stroke="' + (side === 'left' ? '#76cfff' : '#ffc285') + '" stroke-width="1.5"/>' +
      '<path d="M0-15 13-7 13 7 0 15-13 7-13-7Z" fill="#0c1d2c" stroke="#accee1" stroke-width="1.2"/><path d="M-5-7V7M5-7V7" stroke="' + (side === 'left' ? '#d5f4ff' : '#ffe6c2') + '" stroke-width="3"/>' +
      '<circle class="j7-je-energy-ring" r="86" fill="none" stroke="' + (side === 'left' ? '#50afff' : '#f49a51') + '" stroke-width="2" stroke-dasharray="180 360"/>' +
      '</g>';
  }
  function markup() {
    var id = 'j8-jaeger-' + (++serial);
    var bolts = [[44,76],[376,76],[44,231],[376,231]].map(function (p) {
      return '<g><circle cx="' + p[0] + '" cy="' + p[1] + '" r="5" fill="#60727e" stroke="#08121c" stroke-width="2"/><path d="M' + (p[0]-2) + ' ' + (p[1]-2) + 'l4 4m0-4-4 4" stroke="#182b3a" stroke-width="1.2"/></g>';
    }).join('');
    var signals = '';
    for (var i = 0; i < 10; i++) signals += '<rect class="j7-je-signal" x="' + (66+i*7) + '" y="277" width="4" height="' + (5+(i%5)*2) + '" style="--je-delay:' + (i*.08).toFixed(2) + 's"/><rect class="j7-je-signal j7-je-signal-r" x="' + (287+i*7) + '" y="277" width="4" height="' + (5+(i%5)*2) + '" style="--je-delay:' + (i*.08).toFixed(2) + 's"/>';
    return '<div class="j7-je-core" data-phase="ready" data-motion="on" role="img" aria-label="猎人机甲驾驶舱：机械双涡轮与左右神经协同通道">' +
      '<div class="j7-je-top"><span>JAEGER / NEURAL ENGINE</span><b data-je-code>DRIFT / STANDBY</b></div>' +
      '<svg class="j7-je-svg" viewBox="0 0 420 315" fill="none" aria-hidden="true"><defs>' +
      '<linearGradient id="' + id + '-steel" x1="0" x2="0.8" y1="0" y2="1"><stop stop-color="#718693"/><stop offset=".23" stop-color="#344b5d"/><stop offset=".5" stop-color="#12283b"/><stop offset=".52" stop-color="#617783"/><stop offset=".58" stop-color="#20384c"/><stop offset="1" stop-color="#101f30"/></linearGradient>' +
      '<linearGradient id="' + id + '-blade" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#7c96a4"/><stop offset=".36" stop-color="#416173"/><stop offset=".42" stop-color="#adc2ce"/><stop offset=".49" stop-color="#314b61"/><stop offset="1" stop-color="#10263b"/></linearGradient>' +
      '<radialGradient id="' + id + '-left"><stop stop-color="#c4f1ff"/><stop offset=".33" stop-color="#51b8ff"/><stop offset="1" stop-color="#0d426e"/></radialGradient>' +
      '<radialGradient id="' + id + '-right"><stop stop-color="#fff0d1"/><stop offset=".33" stop-color="#ffac61"/><stop offset="1" stop-color="#6d331c"/></radialGradient>' +
      '<linearGradient id="' + id + '-plate" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#213b51"/><stop offset=".48" stop-color="#0b1b2c"/><stop offset="1" stop-color="#1c3041"/></linearGradient>' +
      '<pattern id="' + id + '-grate" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 1h5" stroke="#071421" stroke-width="2"/></pattern></defs>' +
      '<path d="M29 89 51 66H369L392 89V225L370 247H50L29 225Z" fill="#030a12" transform="translate(3 5)"/>' +
      '<path d="M29 84 51 61H369L392 84V220L370 242H50L29 220Z" fill="url(#' + id + '-plate)" stroke="#698192" stroke-width="2.5"/>' +
      '<path d="M43 85 57 73H362L379 86M44 214l14 15h304l15-15" stroke="#355269" stroke-width="2"/>' +
      '<path d="M57 96H364V207H57Z" fill="url(#' + id + '-grate)" opacity=".5"/>' +
      '<path d="M119 63V39H181V82M301 63V39H239V82" stroke="#314b61" stroke-width="7"/>' +
      '<path class="j7-je-flow j7-je-flow-l" d="M119 63V39H181V82" stroke="#78c8ff" stroke-width="2.5" stroke-dasharray="10 28"/>' +
      '<path class="j7-je-flow j7-je-flow-r" d="M301 63V39H239V82" stroke="#ffad6b" stroke-width="2.5" stroke-dasharray="10 28"/>' +
      '<text x="119" y="26" text-anchor="middle" fill="#90bdd7" font-family="Consolas,monospace" font-size="8" letter-spacing="1">LEFT NEURAL / 01</text><text x="301" y="26" text-anchor="middle" fill="#d6aa83" font-family="Consolas,monospace" font-size="8" letter-spacing="1">RIGHT NEURAL / 02</text>' +
      turbine(id,119,'left') + turbine(id,301,'right') +
      '<path d="M185 91H235L251 112V191L235 207H185L169 191V112Z" fill="url(#' + id + '-steel)" stroke="#020b13" stroke-width="3"/>' +
      '<path d="M188 103H232L239 114V184L230 193H190L181 184V114Z" fill="#091726" stroke="#638093" stroke-width="1.5"/>' +
      '<path d="M187 117h46l-6 14h-34Z" fill="#203e55" stroke="#6ea3c6"/><path class="j7-je-bridge-light" d="M194 120h32" stroke="#a4e4ff" stroke-width="3"/>' +
      '<path d="M188 147h44M188 157h44M188 167h44" stroke="#243e51" stroke-width="6"/>' +
      '<path class="j7-je-sync" d="M189 147h42M189 157h42M189 167h42" stroke="#5ab8ff" stroke-width="2" stroke-dasharray="12 9"/>' +
      '<path d="M195 183h30" stroke="#fb9850" stroke-width="4"/><path d="M199 212v16h22v-16" stroke="#7596ac" stroke-width="2"/>' +
      bolts + '<path d="M56 237h59M305 237h60" stroke="#ee9852" stroke-width="5" stroke-dasharray="8 6"/>' +
      '<path d="M64 270h75M281 270h75" stroke="#344f64"/>' + signals +
      '<g class="j7-je-radar"><circle cx="210" cy="268" r="18" fill="#091622" stroke="#466680"/><circle cx="210" cy="268" r="10" stroke="#253d53"/><path d="M192 268h36M210 250v36" stroke="#253d53"/><path class="j7-je-radar-sweep" d="M210 268V251L225 262Z" fill="#5cabf044" stroke="#76beed" stroke-width=".7"/><circle cx="217" cy="260" r="1.5" fill="#ffb572"/></g>' +
      '<text x="119" y="307" text-anchor="middle" fill="#8eafc5" font-family="Consolas,monospace" font-size="7" letter-spacing="1.2">GYRO DRIVE / L</text><text x="301" y="307" text-anchor="middle" fill="#ba9a7c" font-family="Consolas,monospace" font-size="7" letter-spacing="1.2">GYRO DRIVE / R</text></svg>' +
      '<div class="j7-je-bottom"><strong data-je-label>双通道待命</strong><small data-je-hint>等待你的下一句话</small></div></div>';
  }
  function mount(host) {
    if (!host) return function () {};
    var previous = mounted.get(host);
    if (previous) previous();
    var root = host.matches && host.matches('.j7-je-core') ? host : host.querySelector('.j7-je-core');
    if (!root) { host.innerHTML = markup(); root = host.querySelector('.j7-je-core'); }
    var terminal = host.closest('.vm5-terminal');
    var media = global.matchMedia('(prefers-reduced-motion: reduce)');
    var alive = true, inView = true, lastPhase = null;
    function update(records) {
      if (!alive) return;
      var source = host;
      if (Array.isArray(records)) records.forEach(function (r) { if (r.attributeName === 'data-phase') source = r.target; });
      var raw = source.dataset.phase || host.dataset.phase || (terminal && terminal.dataset.phase) || 'ready';
      var phase = phases[raw] ? raw : 'ready';
      if (lastPhase !== phase) {
        lastPhase = phase;
        root.dataset.phase = phase;
        ['code','label','hint'].forEach(function (name, i) { root.querySelector('[data-je-' + name + ']').textContent = phases[phase][i]; });
        root.setAttribute('aria-label', '猎人机甲驾驶舱：' + phases[phase][1]);
      }
      var motion = document.hidden || global.matchMedia('(prefers-reduced-motion: reduce)').matches || !inView || !host.isConnected ? 'off' : 'on';
      if (root.dataset.motion !== motion) root.dataset.motion = motion;
    }
    var observer = new MutationObserver(update);
    observer.observe(host,{attributes:true,attributeFilter:['data-phase']});
    if (terminal && terminal !== host) observer.observe(terminal,{attributes:true,attributeFilter:['data-phase']});
    var io = global.IntersectionObserver ? new IntersectionObserver(function (entries) { inView = entries.some(function (entry) { return entry.isIntersecting; }); update(); },{threshold:.05}) : null;
    if (io) io.observe(host);
    document.addEventListener('visibilitychange',update);
    if (media.addEventListener) media.addEventListener('change',update); else media.addListener(update);
    // Keep suspension reliable when a browser delays intersection or media change events.
    // This only samples the visibility gate; all animation remains in CSS.
    var gateTimer = global.setInterval(function () {
      if (!alive) return;
      var bounds = host.getBoundingClientRect();
      inView = bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.right > 0 && bounds.top < global.innerHeight && bounds.left < global.innerWidth;
      update();
    },400);
    update();
    function cleanup() {
      if (!alive) return;
      alive = false; observer.disconnect(); if (io) io.disconnect(); global.clearInterval(gateTimer);
      document.removeEventListener('visibilitychange',update);
      if (media.removeEventListener) media.removeEventListener('change',update); else media.removeListener(update);
      root.dataset.motion = 'off';
      if (mounted.get(host) === cleanup) mounted.delete(host);
    }
    mounted.set(host,cleanup);
    return cleanup;
  }
  global.J7Visuals = global.J7Visuals || {};
  global.J7Visuals.jaeger = {markup:markup,mount:mount};
})(window);
