/* Original holographic reactor. Presentation only; no audio, identity or task API. */
(function () {
  'use strict';
  let serial = 0;
  const phases = {
    ready: ['STANDBY / 01', '光核待命', '等待你的下一句话'],
    listening: ['INPUT / 02', '语音接收', '此刻，专心听你'],
    thinking: ['REASON / 03', '正在理解', '整理意图与关联事项'],
    speaking: ['OUTPUT / 04', '正在回应', '你随时可以打断'],
    interrupted: ['HOLD / 05', '回应已暂停', '等待你继续'],
    answered: ['READY / 06', '回应已就绪', '可以继续追问'],
    awaiting: ['CONFIRM / 07', '等待你的选择', '确认后继续']
  };
  const point = (r, a) => [+(Math.sin(a * Math.PI / 180) * r).toFixed(3), +(-Math.cos(a * Math.PI / 180) * r).toFixed(3)];
  const polygon = (r, n, offset) => Array.from({length: n}, (_, i) => point(r, offset + i * 360 / n).join(',')).join(' ');
  function markup() {
    const id = 'j7-stark-' + (++serial);
    const ticks = Array.from({length: 144}, (_, i) => {
      const major = i % 12 === 0, mid = i % 3 === 0;
      const a = point(major ? 169 : mid ? 174 : 177, i * 2.5);
      const b = point(183, i * 2.5);
      return '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '" class="j7-stark-tick ' + (major ? 'j7-stark-tick-major' : '') + '"/>';
    }).join('');
    const numbers = Array.from({length: 12}, (_, i) => {
      const p = point(196, i * 30);
      return '<text x="' + p[0] + '" y="' + (p[1] + 2) + '" class="j7-stark-dial-number">' + String(i * 30).padStart(3, '0') + '</text>';
    }).join('');
    const blades = Array.from({length: 12}, (_, i) =>
      '<g transform="rotate(' + i * 30 + ')"><path d="M-12-106 -29-142 -12-155 13-155 30-123 11-108Z" fill="url(#' + id + '-metal)" class="j7-stark-blade"/><path d="M-10-113 -23-141 -10-150 8-150 20-126" class="j7-stark-blade-edge"/><path d="M-8-143 7-143M-5-138 9-138M-2-133 11-133" class="j7-stark-blade-vents"/><rect x="-5" y="-160" width="10" height="3" rx=".8" class="' + (i % 4 === 0 ? 'j7-stark-gold' : 'j7-stark-cyan') + '"/></g>'
    ).join('');
    const inner = Array.from({length: 18}, (_, i) =>
      '<path transform="rotate(' + i * 20 + ')" d="M-4-80 -13-95 6-96 16-84 9-79Z" class="j7-stark-inner-fin"/>'
    ).join('');
    const dots = Array.from({length: 36}, (_, i) => {
      const p = point(104, i * 10);
      return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (i % 3 ? '1' : '1.8') + '" class="j7-stark-diode"/>';
    }).join('');
    const hash = Array.from({length: 6}, (_, i) =>
      '<g transform="rotate(' + i * 60 + ')"><path d="M0-65V-70M-5-67H5" class="j7-stark-core-mark"/><path d="M-13-54 -21-64 1-70 20-62 12-54" class="j7-stark-core-brace"/></g>'
    ).join('');
    return '<div class="j7-stark-reactor" data-motion="on" data-phase="ready">' +
      '<div class="j7-stark-top"><span><i></i> 光核战术台</span><b data-j7-stark-readout="code">STANDBY / 01</b></div>' +
      '<svg class="j7-stark-svg" viewBox="-211 -211 422 422" fill="none" aria-hidden="true">' +
      '<defs><radialGradient id="' + id + '-halo"><stop stop-color="#28c7ff" stop-opacity=".28"/><stop offset=".48" stop-color="#0a6aa6" stop-opacity=".1"/><stop offset="1" stop-color="#061620" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + id + '-core"><stop stop-color="#fff"/><stop offset=".15" stop-color="#e7fdff"/><stop offset=".33" stop-color="#60e6ff"/><stop offset=".62" stop-color="#067aaa"/><stop offset=".85" stop-color="#063c66"/><stop offset="1" stop-color="#031c32"/></radialGradient>' +
      '<linearGradient id="' + id + '-metal" x1="-29" y1="-155" x2="30" y2="-105" gradientUnits="userSpaceOnUse"><stop stop-color="#123e53"/><stop offset=".44" stop-color="#37697a"/><stop offset=".48" stop-color="#6dc4d6"/><stop offset=".55" stop-color="#16415b"/><stop offset="1" stop-color="#071c2c"/></linearGradient>' +
      '<linearGradient id="' + id + '-scan"><stop stop-color="#58eaff" stop-opacity=".5"/><stop offset="1" stop-color="#35b3ff" stop-opacity="0"/></linearGradient>' +
      '<filter id="' + id + '-glow" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="3" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
      '<circle r="203" fill="url(#' + id + '-halo)"/><path d="M-205-135V-190H-155M155-190H205V-135M205 135V190H155M-155 190H-205V135" class="j7-stark-frame"/>' +
      '<path d="M-190-104H-175L-159-88M190 104H175L159 88" class="j7-stark-wire"/>' +
      '<g class="j7-stark-scale">' + ticks + numbers + '</g>' +
      '<circle r="163" class="j7-stark-thin"/><circle r="159" class="j7-stark-thin j7-stark-dim"/>' +
      '<g class="j7-stark-outer">' + blades + '</g>' +
      '<circle r="110" class="j7-stark-bearing"/><circle r="115" class="j7-stark-thin"/><g class="j7-stark-diode-ring">' + dots + '</g>' +
      '<g class="j7-stark-scan"><circle r="135" fill="transparent"/><path d="M0 0 0-135A135 135 0 0 1 106-84Z" fill="url(#' + id + '-scan)"/><path d="M0-125V-108" class="j7-stark-scan-tip"/></g>' +
      '<g class="j7-stark-inner-rotor">' + inner + '</g><circle r="77" class="j7-stark-thin"/>' +
      '<g class="j7-stark-pulse"><circle r="59" fill="url(#' + id + '-core)" class="j7-stark-reactor-heart"/><circle r="60" class="j7-stark-rim"/>' +
      '<polygon points="' + polygon(46, 6, 30) + '" class="j7-stark-hexagon"/><polygon points="' + polygon(39, 6, 30) + '" class="j7-stark-hexagon j7-stark-dim"/>' +
      '<path d="M0-30 26 15H-26Z M0 30-26-15H26Z" class="j7-stark-prism"/><circle r="11" class="j7-stark-nucleus" filter="url(#' + id + '-glow)"/>' +
      '<path d="M-18 0H18M0-18V18" class="j7-stark-center-cross"/></g>' + hash +
      '<g class="j7-stark-target"><path d="M-152 0H-125M125 0H152M0-152V-125M0 125V152M-144-7V7M144-7V7M-7-144H7M-7 144H7" class="j7-stark-reticle"/><path d="M-126-126H-112V-112M126-126H112V-112M126 126H112V112M-126 126H-112V112" class="j7-stark-gold-line"/></g>' +
      '<path d="M-191 10V36M-188 10V24M191-10V-36M188-10V-24" class="j7-stark-gold-line"/><text x="-198" y="67" class="j7-stark-side-number">A / 01</text><text x="151" y="-61" class="j7-stark-side-number">V / 07</text>' +
      '</svg><div class="j7-stark-footer"><span data-j7-stark-readout="label">光核待命</span><div class="j7-stark-signal" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><small data-j7-stark-readout="hint">等待你的下一句话</small></div></div>';
  }
  function mount(host) {
    if (!host) return function () {};
    const root = host.querySelector('.j7-stark-reactor');
    if (!root) return function () {};
    let removed = false;
    const terminal = host.closest('.vm5-terminal');
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    function update() {
      if (removed) return;
      const raw = (terminal && terminal.dataset.phase) || host.dataset.phase || 'ready';
      const phase = Object.prototype.hasOwnProperty.call(phases, raw) ? raw : 'ready';
      root.dataset.phase = phase;
      const texts = phases[phase];
      ['code', 'label', 'hint'].forEach(function (key, i) {
        const node = root.querySelector('[data-j7-stark-readout="' + key + '"]');
        if (node && node.textContent !== texts[i]) node.textContent = texts[i];
      });
      root.dataset.motion = document.hidden || media.matches ? 'off' : 'on';
    }
    const observer = new MutationObserver(update);
    observer.observe(host, {attributes: true, attributeFilter: ['data-phase']});
    if (terminal && terminal !== host) observer.observe(terminal, {attributes: true, attributeFilter: ['data-phase']});
    document.addEventListener('visibilitychange', update);
    if (media.addEventListener) media.addEventListener('change', update);
    else media.addListener(update);
    update();
    return function cleanup() {
      if (removed) return;
      removed = true;
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      if (media.removeEventListener) media.removeEventListener('change', update);
      else media.removeListener(update);
      root.dataset.motion = 'off';
    };
  }
  window.J7Visuals = window.J7Visuals || {};
  window.J7Visuals.stark = {markup: markup, mount: mount};
})();
