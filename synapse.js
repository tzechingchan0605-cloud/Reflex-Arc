/* Five textbook-level steps, based on te_17_c.pdf pp. 17-7–17-8, fig. 17.6. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const STEP_TIME = 1500, DURATION = STEP_TIME * 5;
  const sites = {
    'sensory-inter': { before: '感覺神經元', after: '中間神經元', short: '感覺 → 中間', modes: ['withdrawal'], point: [671, 313], arrival: 'sensory' },
    'inter-motor': { before: '中間神經元', after: '運動神經元', short: '中間 → 運動', modes: ['withdrawal'], point: [682, 409], arrival: 'inter' },
    'sensory-motor': { before: '感覺神經元', after: '運動神經元', short: '感覺 → 運動', modes: ['knee'], point: [682, 409], arrival: 'direct' },
    'descending-motor': { before: '中間神經元（下行路徑）', after: '運動神經元', short: '中間 → 運動', modes: ['voluntary'], point: [700, 409], arrival: 'downRelay' },
    'motor-muscle': { before: '運動神經元', after: '手臂屈肌的肌纖維', short: '運動 → 肌肉', modes: ['withdrawal', 'knee', 'voluntary'], muscle: true, point: [321, 352], arrival: 'motor' },
  };
  function svg(tag, attrs = {}) { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; }
  const visible = (el, show) => el.toggleAttribute('hidden', !show);
  const mix = (a, b, t) => a + (b - a) * t;
  const clamp = x => Math.max(0, Math.min(1, x));

  window.createSynapseViewer = function ({ pauseMain, getContext }) {
    const state = { mode: 'withdrawal', site: null, time: 0, playing: false, frame: 0, lastFrame: null, step: -1, origin: null };
    const dialog = $('synapse-dialog'), marks = new Map();
    let steps = [];
    function stop() { state.playing = false; cancelAnimationFrame(state.frame); state.lastFrame = null; }
    function makeSteps(muscle) {
      return [
        '神經脈衝到達並刺激突觸小體。',
        '突觸小泡釋出神經遞質。',
        '神經遞質藉擴散越過突觸間隙。',
        muscle ? '神經遞質與肌纖維上的受體部位結合。' : '神經遞質與樹突上的受體部位結合。',
        muscle ? '肌纖維受到刺激，肌肉收縮。' : '樹突受到刺激，發出神經脈衝。',
      ];
    }
    function seekStep(index) {
      stop(); state.time = (index + 1) * STEP_TIME - (index === 4 ? 0 : 1); render();
    }
    function open(id, origin) {
      const original = sites[id];
      if (!original || !original.modes.includes(state.mode)) return;
      pauseMain(); stop(); state.site = { ...original };
      if (id === 'motor-muscle' && state.mode === 'knee') state.site.after = '股四頭肌的肌纖維';
      state.origin = origin; state.time = 0; state.step = -1;
      const site = state.site;
      $('synapse-subtitle').textContent = site.before + ' → ' + site.after;
      $('synapse-location').textContent = site.muscle ? '神經元 → 肌肉' : '神經元 → 神經元';
      $('synapse-context-text').textContent = getContext(site);
      $('micro-pre-name').textContent = site.before + '的軸突';
      $('micro-post-name').textContent = site.muscle ? site.after : '下一個神經元的樹突（' + site.after + '）';
      $('micro-title').textContent = site.muscle ? '神經元把信息傳遞至肌纖維' : '神經脈衝越過突觸的傳遞';
      $('micro-desc').textContent = site.before + '釋出神經遞質，藉擴散越過突觸間隙，與' + (site.muscle ? '肌纖維' : '樹突') + '上的受體部位結合，' + (site.muscle ? '使肌肉收縮。' : '使下一個神經元發出神經脈衝。');
      visible($('micro-muscle'), site.muscle); visible($('micro-receiver'), !site.muscle);
      visible($('micro-contraction-key'), site.muscle);
      $('micro-key-idea').textContent = '神經脈衝不能直接越過突觸間隙。神經遞質由突觸小體釋出，與' + (site.muscle ? '肌纖維' : '下一個神經元的樹突') + '上的受體部位結合，把信息沿圖示方向傳遞。';
      $('micro-source').textContent = site.muscle ? '依課本第 17-7、17-8 頁圖 17.6 的傳遞原理延伸：接收一方改為肌纖維。' : '步驟及標示參照課本第 17-7、17-8 頁圖 17.6。';
      steps = makeSteps(site.muscle);
      $('micro-steps').replaceChildren(...steps.map((text, index) => {
        const li = document.createElement('li'), button = document.createElement('button');
        button.type = 'button'; button.dataset.microStep = index;
        const number = document.createElement('span'); number.textContent = index + 1; number.setAttribute('aria-hidden', 'true');
        const copy = document.createElement('span'); copy.textContent = text;
        button.append(number, copy); button.setAttribute('aria-label', '步驟 ' + (index + 1) + '：' + text);
        button.addEventListener('click', () => seekStep(index)); li.appendChild(button); return li;
      }));
      dialog.showModal(); dialog.scrollTop = 0; render();
    }
    for (const [id, site] of Object.entries(sites)) {
      const g = svg('g', { id: 'hotspot-' + id, class: 'synapse-hotspot', role: 'button', tabindex: '0', 'aria-haspopup': 'dialog', 'aria-controls': 'synapse-dialog', 'data-synapse': id });
      const title = svg('title'); title.textContent = '點選以放大這個突觸';
      g.append(title, svg('circle', { r: 15, class: 'synapse-hit-area' }), svg('circle', { r: 10, class: 'synapse-ring' }));
      const number = svg('text', { y: '4', 'text-anchor': 'middle', 'aria-hidden': 'true' }); g.appendChild(number);
      g.addEventListener('click', () => open(id, g));
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(id, g); } });
      $('synapse-hotspots').appendChild(g); marks.set(id, { g, number });
    }
    function refresh(config) {
      if (dialog.open) dialog.close();
      state.mode = config.mode;
      const heading = document.createElement('span'); heading.className = 'synapse-shortcut-label'; heading.textContent = '突觸放大鏡';
      $('synapse-shortcuts').replaceChildren(heading);
      let number = 0;
      for (const [id, site] of Object.entries(sites)) {
        const shown = site.modes.includes(state.mode), mark = marks.get(id);
        visible(mark.g, shown); mark.g.setAttribute('tabindex', shown ? '0' : '-1');
        if (!shown) continue;
        number++;
        const point = id === 'motor-muscle' && state.mode === 'knee' ? [298, 335] : site.point;
        mark.g.setAttribute('transform', 'translate(' + point.join(' ') + ')'); mark.number.textContent = number;
        mark.g.setAttribute('aria-label', '圖中突觸 ' + number + '：' + site.before + '至' + (site.muscle ? '肌肉' : site.after) + '，按一下放大');
        const button = document.createElement('button'); button.type = 'button'; button.dataset.openSynapse = id;
        button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'synapse-dialog');
        button.setAttribute('aria-label', '放大突觸：' + site.before + '至' + (site.muscle ? '肌肉' : site.after));
        const badge = document.createElement('span'); badge.textContent = number;
        button.append(badge, document.createTextNode(site.short)); button.addEventListener('click', () => open(id, button)); $('synapse-shortcuts').appendChild(button);
      }
    }
    function render() {
      if (!state.site) return;
      const t = state.time / STEP_TIME, step = Math.min(4, Math.floor(t)), muscle = !!state.site.muscle;
      const arrival = clamp(t), release = clamp(t - 1), diffusion = clamp(t - 2), binding = clamp(t - 3), response = clamp(t - 4);
      $('micro-input-signal').setAttribute('transform', 'translate(0 ' + (arrival * 134) + ')');
      $('micro-input-signal').setAttribute('opacity', t < 1.2 ? '1' : '0');
      $('micro-release-vesicle').setAttribute('transform', 'translate(430 ' + (261 + release * 18) + ')');
      $('micro-release-vesicle').setAttribute('opacity', 1 - release);
      $('micro-fusion').setAttribute('opacity', t >= 1 && t < 2.7 ? release : 0);
      const particles = [];
      if (t > 1) {
        for (let i = 0; i < 12; i++) {
          const receptor = i % 4, targetX = 370 + receptor * 60;
          const spreadX = 340 + (i * 47 % 225), spreadY = 311 + (i * 13 % 30);
          const releaseProgress = clamp((release - (i % 3) * 0.06) / 0.88);
          let x = mix(430 + (i % 3 - 1) * 5, spreadX, releaseProgress * 0.4);
          let y = mix(278 - (i % 3) * 4, 302 + (i % 4), releaseProgress);
          if (t >= 2) { x = mix(x, spreadX, diffusion); y = mix(y, spreadY, diffusion) + Math.sin(diffusion * Math.PI * (2 + i % 3)) * 5; }
          if (t >= 3) { x = mix(spreadX, targetX + (i >= 4 ? (i % 3 - 1) * 10 : 0), binding); y = mix(spreadY, i < 4 ? (receptor === 0 || receptor === 3 ? 351 : 348) : 329 - i % 3 * 4, binding); }
          const bound = i < 4 && binding > 0.95;
          particles.push(svg('circle', { cx: x, cy: y, r: bound ? '4' : '2.7', class: 'micro-transmitter' + (bound ? ' bound' : ''), opacity: Math.min(1, releaseProgress * 4) }));
        }
      }
      $('micro-transmitters').replaceChildren(...particles);
      $('micro-receptors').classList.toggle('micro-bound', binding > 0.95);
      $('micro-output-signal').setAttribute('opacity', !muscle && t >= 4 ? 1 : 0);
      $('micro-output-signal').setAttribute('transform', 'translate(0 ' + (response * 8) + ')');
      visible($('micro-contraction'), muscle && t >= 4);
      $('micro-muscle').setAttribute('transform', 'translate(' + (muscle ? 45 * response : 0) + ' 0) scale(' + (1 - (muscle ? 0.1 * response : 0)) + ' 1)');
      $('micro-play').textContent = state.playing ? 'Ⅱ 暫停' : state.time >= DURATION ? '↺ 再播一次' : state.time ? '▶ 繼續播放' : '▶ 播放傳遞';
      $('micro-next').disabled = state.time >= DURATION;
      $('micro-progress').value = Math.round(t * 1000);
      if (state.step !== step) {
        state.step = step;
        $('micro-step-count').textContent = '步驟 ' + (step + 1) + ' / 5'; $('micro-current-text').textContent = steps[step];
        $('micro-steps').querySelectorAll('button').forEach((button, i) => { button.classList.toggle('active', i === step); button.classList.toggle('complete', i < step); if (i === step) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current'); });
      }
    }
    function play() {
      if (state.playing) { stop(); render(); return; }
      if (state.time >= DURATION) state.time = 0;
      state.playing = true; state.lastFrame = null;
      function frame(now) {
        if (!state.playing || !dialog.open) return;
        if (state.lastFrame !== null) state.time = Math.min(DURATION, state.time + Math.min(100, now - state.lastFrame) * Number($('micro-speed').value));
        state.lastFrame = now;
        if (state.time >= DURATION) stop();
        render(); if (state.playing) state.frame = requestAnimationFrame(frame);
      }
      state.frame = requestAnimationFrame(frame); render();
    }
    $('micro-play').addEventListener('click', play);
    $('micro-next').addEventListener('click', () => { const current = Math.floor(state.time / STEP_TIME); const atEnd = state.time % STEP_TIME >= STEP_TIME - 2; seekStep(Math.min(4, atEnd ? current + 1 : current)); });
    $('micro-reset').addEventListener('click', () => { stop(); state.time = 0; state.step = -1; render(); });
    $('micro-progress').addEventListener('input', () => { stop(); state.time = Number($('micro-progress').value) * STEP_TIME / 1000; render(); });
    $('close-synapse').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { stop(); if (state.origin?.isConnected) state.origin.focus({ preventScroll: true }); });
    dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden && state.playing) { stop(); render(); } });
    return { refresh };
  };
})();
