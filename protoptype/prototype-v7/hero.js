(function () {
  'use strict';
  var serial = 0;
  var labels = {
    ready: ['ARMOR LINK ONLINE', '战甲联络已建立'],
    listening: ['VOICE CHANNEL OPEN', '正在接收你的呼叫'],
    thinking: ['MISSION IN PROGRESS', '正在处理你的请求'],
    speaking: ['INCOMING TRANSMISSION', '正在向你播报'],
    interrupted: ['CHANNEL PAUSED', '联络暂停 · 随时继续'],
    answered: ['RESPONSE DELIVERED', '联络报告已送达'],
    awaiting: ['YOUR CALL, COMMANDER', '等待你的决定']
  };
  function markup() {
    var id = 'j7-hero-' + (++serial);
    var rays = '';
    for (var i = 0; i < 32; i++) {
      var a = (i * 11.25 - 90) * Math.PI / 180;
      var inner = 116 + (i % 4) * 3;
      var outer = i % 3 ? 142 : 157;
      rays += '<line x1="' + (170 + Math.cos(a) * inner).toFixed(2) + '" y1="' + (147 + Math.sin(a) * inner * .85).toFixed(2) + '" x2="' + (170 + Math.cos(a) * outer).toFixed(2) + '" y2="' + (147 + Math.sin(a) * outer * .85).toFixed(2) + '"/>';
    }
    return '<div class="j7-hv" role="img" aria-label="钢铁侠战甲联络：红金头盔与蓝白发光双眼">' +
      '<svg class="j7-hv-art" viewBox="0 0 340 300" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '-gold" x1="0" x2="1" y1="0" y2=".7"><stop stop-color="#9f692d"/><stop offset=".18" stop-color="#f7dca1"/><stop offset=".36" stop-color="#d4a556"/><stop offset=".52" stop-color="#fff0bf"/><stop offset=".72" stop-color="#cd9948"/><stop offset="1" stop-color="#8e5927"/></linearGradient>' +
      '<linearGradient id="' + id + '-red" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#e45649"/><stop offset=".28" stop-color="#b73534"/><stop offset=".62" stop-color="#98222d"/><stop offset="1" stop-color="#491620"/></linearGradient>' +
      '<linearGradient id="' + id + '-scan" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#80edff" stop-opacity="0"/><stop offset="1" stop-color="#80edff" stop-opacity=".35"/></linearGradient>' +
      '<filter id="' + id + '-eye" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="2.5"/></filter>' +
      '<clipPath id="' + id + '-face"><path d="M118 76 143 70 170 83 197 70 222 76 232 112 220 153 227 184 209 217 187 238 153 238 131 217 113 184 120 153 108 112Z"/></clipPath>' +
      '<pattern id="' + id + '-dots" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#271d1d" opacity=".15"/></pattern></defs>' +
      '<g class="j7-hv-rays" stroke="#a07642" stroke-width="1.3" opacity=".35">' + rays + '</g>' +
      '<path class="j7-hv-burst" d="m170 17 20 34 40-18-1 35 42-1-19 29 40 22-28 24 28 28-41 17 19 38-39-6-2 34-39-17-20 31-20-31-39 17-2-34-39 6 19-38-41-17 28-28-28-24 40-22-19-29 42 1-1-35 40 18Z" fill="#e0b66c" opacity=".18"/>' +
      '<g class="j7-hv-portal"><ellipse cx="170" cy="147" rx="130" ry="111" fill="none" stroke="#352628" stroke-width="2.5"/><ellipse cx="170" cy="147" rx="130" ry="111" fill="none" stroke="#c19453" stroke-width="4" stroke-dasharray="168 29 58 48"/><ellipse cx="170" cy="147" rx="119" ry="100" fill="none" stroke="#75604b" stroke-width="1" stroke-dasharray="3 9"/></g>' +
      '<ellipse cx="170" cy="265" rx="62" ry="8" fill="#302125" opacity=".15"/>' +
      '<g class="j7-hv-emblem">' +
      '<path d="M116 45 149 34 191 34 224 45 246 76 254 116 251 177 237 219 210 253 192 265 148 265 130 253 103 219 89 177 86 116 94 76Z" fill="#27191d" transform="translate(4 5)"/>' +
      '<path d="M116 42 149 31 191 31 224 42 246 73 254 113 251 174 237 216 210 250 192 262 148 262 130 250 103 216 89 174 86 113 94 73Z" fill="url(#' + id + '-red)" stroke="#24171b" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="m118 44 31-9h42l31 9 15 27-25-11-42-10-42 10-25 11Z" fill="#ef7960" opacity=".28"/><path d="m91 112 9-34 11-11-4 52-10 31-6 24Z" fill="#ed775d" opacity=".45"/><path d="m249 112-9-34-11-11 4 52 10 31 6 24Z" fill="#681825" opacity=".85"/>' +
      '<path d="m89 123 17-12 4 68-9 28-11-34Z" fill="#642331" stroke="#281a1e" stroke-width="2"/><path d="m251 123-17-12-4 68 9 28 11-34Z" fill="#5a1d2b" stroke="#281a1e" stroke-width="2"/>' +
      '<path d="M118 76 143 70 170 83 197 70 222 76 232 112 220 153 227 184 209 217 187 238 153 238 131 217 113 184 120 153 108 112Z" fill="url(#' + id + '-gold)" stroke="#352321" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="m143 70 27 13 27-13-8 29-19 12-19-12Z" fill="#d9ad64"/><path d="m138 47 32-8 32 8-5 23-27 13-27-13Z" fill="#a92c32" stroke="#432126" stroke-width="2"/><path d="m143 48 27-6 27 6-3 13-24 12-24-12Z" fill="#d7463e" opacity=".5"/>' +
      '<path d="m117 82 18-6-14 34 10 31-15 40-4-22 8-26-12-21Z" fill="#fff4c7" opacity=".48"/><path d="m224 82-18-6 14 35-10 29 14 40 5-21-10-27 13-20Z" fill="#7c502a" opacity=".4"/>' +
      '<path d="m121 153 13 19-12 25-9-13Z" fill="#8c5b2e" opacity=".55"/><path d="m219 153-13 19 12 25 9-13Z" fill="#fff0bf" opacity=".35"/>' +
      '<path d="m110 116 48 17-2 17-42-11Z" fill="#211b20" stroke="#68452b" stroke-width="1.5"/><path d="m230 116-48 17 2 17 42-11Z" fill="#211b20" stroke="#68452b" stroke-width="1.5"/>' +
      '<g class="j7-hv-eyes"><path d="m116 123 36 13-1 8-32-10Z M224 123l-36 13 1 8 32-10Z" fill="#65dfff" filter="url(#' + id + '-eye)"/><path d="m116 123 36 13-1 6-30-10Z M224 123l-36 13 1 6 30-10Z" fill="#bff7ff" stroke="#82e8ff" stroke-width="1"/><path d="m120 125 30 11-1 3-27-9Z M220 125l-30 11 1 3 27-9Z" fill="#fff"/></g>' +
      '<path d="m160 145 10-7 10 7 7 31-9 9h-16l-9-9Z" fill="#c99848" stroke="#997037" stroke-width="1.1"/><path d="m170 143 8 6 5 26-6 6h-7Z" fill="#f5d593" opacity=".7"/>' +
      '<path d="m136 192 24 8h20l24-8-4 17-19 13h-22l-19-13Z" fill="#67482e"/><path d="m143 205 16-4h22l16 4-2 7-14-5h-22l-14 5Z" fill="#302426"/><path d="m143 215 18 5h18l18-5-12 13h-30Z" fill="#e0b367"/><path d="m153 232 17 6 17-6-7 15h-20Z" fill="#efcd91"/>' +
      '<path d="m107 176 13 25 21 29 12 8-17-1-29-27-8-27Z" fill="#a22b31" stroke="#432128" stroke-width="1.5"/><path d="m233 176-13 25-21 29-12 8 17-1 29-27 8-27Z" fill="#7d232e" stroke="#432128" stroke-width="1.5"/>' +
      '<path d="M132 250h76l-17 9h-42Z" fill="#571b29"/><path d="m98 97 3-12M242 97l-3-12M115 214l9 11M225 214l-9 11" stroke="#f0b877" stroke-width="1.6"/>' +
      '<g clip-path="url(#' + id + '-face)"><g class="j7-hv-scan"><rect x="107" y="64" width="126" height="26" fill="url(#' + id + '-scan)"/><path d="M109 90h122" stroke="#90efff" stroke-width="1.5"/></g></g></g>' +
      '</svg><span class="j7-hv-link">ARMOR LINK ONLINE</span><span class="j7-hv-chip j7-hv-chip-a">MK. J / 01</span><span class="j7-hv-chip j7-hv-chip-b">LIVE</span></div>';
  }
  function mount(host) {
    if (!host) return function () {};
    if (!host.querySelector('.j7-hv')) host.innerHTML = markup();
    var visual = host.querySelector('.j7-hv');
    var label = visual.querySelector('.j7-hv-link');
    var terminal = host.closest('.vm5-terminal');
    function reflect() {
      var phase = host.getAttribute('data-phase') || (terminal && terminal.getAttribute('data-phase')) || 'ready';
      if (!labels[phase]) phase = 'ready';
      visual.setAttribute('data-phase', phase);
      label.textContent = labels[phase][0];
      visual.setAttribute('aria-label', '钢铁侠战甲联络：' + labels[phase][1]);
    }
    reflect();
    var observer = new MutationObserver(reflect);
    observer.observe(host, {attributes: true, attributeFilter: ['data-phase']});
    if (terminal && terminal !== host) observer.observe(terminal, {attributes: true, attributeFilter: ['data-phase']});
    return function () { observer.disconnect(); };
  }
  window.J7Visuals = window.J7Visuals || {};
  window.J7Visuals.hero = {markup: markup, mount: mount};
})();
