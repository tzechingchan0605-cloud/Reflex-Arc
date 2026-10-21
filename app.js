(function () {
  'use strict';
  const { PARTS, MODES, buildRun, explain } = ReflexModel;
  const $ = id => document.getElementById(id);
  const hide = (el, value) => el.toggleAttribute('hidden', value);
  const NS = 'http://www.w3.org/2000/svg';
  const state = { mode: 'withdrawal', cuts: new Set(), intentional: false, run: null, time: 0, playing: false, frame: 0, lastFrame: null, recorded: false, detailed: false, records: [], eventSignature: '' };
  const paths = Object.fromEntries(['sensory', 'direct', 'inter', 'motor', 'upRelay', 'ascend', 'descend', 'downRelay', 'cortexSense', 'cortexMotor'].map(k => [k, $('path-' + k)]));
  const config = () => ({ mode: state.mode, cuts: [...state.cuts], intentional: state.intentional });
  const applicable = key => key !== 'inter' || state.mode === 'withdrawal';
  const activeCuts = () => [...state.cuts].filter(applicable);
  const labelFor = key => key === 'reflex' ? '反射動作' : key === 'sensation' ? state.mode === 'withdrawal' ? '痛覺' : state.mode === 'knee' ? '牽張感覺' : '觸覺' : '隨意動作';
  const predictionKeys = () => state.mode === 'voluntary' ? state.intentional ? ['voluntary'] : ['sensation', 'voluntary'] : ['reflex', 'sensation'];
  let predictionSnapshot = {};

  function svgElement(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs || {})) el.setAttribute(key, value);
    return el;
  }
  function buildLesions() {
    for (const [key, part] of Object.entries(PARTS)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'lesion-button'; button.dataset.part = key;
      button.style.setProperty('--part-color', part.color);
      button.innerHTML = '<span class="lesion-dot" aria-hidden="true"></span><span class="lesion-copy"><strong>' + part.name + '</strong><small>' + part.route + '</small></span><span class="lesion-status">完整</span>';
      button.addEventListener('click', () => { state.cuts.has(key) ? state.cuts.delete(key) : state.cuts.add(key); prepare(); });
      $('lesion-buttons').appendChild(button);
      const mark = svgElement('g', { class: 'cut-mark', 'data-part': key, hidden: '' });
      mark.appendChild(svgElement('circle', { r: 11 }));
      const text = svgElement('text', { y: 6 }); text.textContent = '×'; mark.appendChild(text);
      $('cut-marks').appendChild(mark);
    }
  }
  function updateLesions() {
    document.querySelectorAll('.lesion-button').forEach(button => {
      const key = button.dataset.part, enabled = applicable(key), cut = state.cuts.has(key);
      button.disabled = !enabled;
      button.setAttribute('aria-pressed', String(cut));
      button.setAttribute('aria-label', PARTS[key].name + '：' + (!enabled ? '本次情境不採用' : cut ? '已受損，按一下復原' : '完整，按一下模擬受損'));
      button.querySelector('.lesion-status').textContent = !enabled ? '不採用' : cut ? '受損 ×' : '完整';
      paths[key].classList.toggle('cut', enabled && cut);
    });
    paths.direct.classList.toggle('cut', state.cuts.has('sensory'));
    paths.downRelay.classList.toggle('cut', state.cuts.has('descend'));
    $('preset').value = state.cuts.size === 0 ? 'none' : state.cuts.size === 1 ? [...state.cuts][0] : 'custom';
    $('preset').querySelector('[value=inter]').disabled = state.mode !== 'withdrawal';
    $('condition-note').textContent = state.mode === 'knee'
      ? '本圖只測伸肌的單突觸主反射弧；拮抗肌的交互抑制涉及中間神經元，這裏省略。'
      : state.mode === 'voluntary' ? '「中間」開關只指退縮反射弧內的細胞，不代表所有中間神經元。切換情境保留受損條件。'
        : '局部受損只中斷所選路徑，其他結構維持正常。切換情境會保留受損條件。';
  }
  function makePredictions() {
    $('predictions').replaceChildren();
    for (const key of predictionKeys()) {
      const field = document.createElement('div'); field.className = 'prediction-question';
      const q = state.mode === 'knee' && key === 'reflex' ? '小腿會自動踢起嗎？' : state.mode === 'withdrawal' && key === 'reflex' ? '手會自動縮回嗎？' : key === 'voluntary' ? '能完成本次主動屈臂嗎？' : state.mode === 'knee' ? '能感知肌肉的牽張嗎？' : state.mode === 'withdrawal' ? '會感到痛楚嗎？' : '會感到手指接觸嗎？';
      const title = document.createElement('span'); title.id = 'prediction-title-' + key; title.textContent = q;
      const choices = document.createElement('div'); choices.className = 'prediction-options'; choices.setAttribute('role', 'group'); choices.setAttribute('aria-labelledby', title.id);
      for (const [value, text] of [['yes', '會'], ['no', '不會']]) {
        const label = document.createElement('label'), input = document.createElement('input');
        input.type = 'radio'; input.name = 'prediction-' + key; input.value = value;
        label.append(input, document.createTextNode(text)); choices.appendChild(label);
      }
      field.append(title, choices); $('predictions').appendChild(field);
    }
  }
  function buildFlow() {
    let labels;
    if (state.mode === 'voluntary') labels = state.intentional
      ? [['association', '大腦決策', '主動發令'], ['cortexMotor', '運動區', '產生指令'], ['descend', '下行路徑', '脊髓內'], ['motor', '運動神經元', '經腹根'], ['action', '手臂屈肌', '主動屈臂']]
      : [['receptor', '感受器', '皮膚觸覺'], ['sensory', '感覺神經元', '經背根'], ['ascend', '上行路徑', '傳至大腦'], ['association', '大腦決策', '感覺 → 聯合 → 運動'], ['descend', '下行路徑', '脊髓內'], ['motor', '運動神經元', '經腹根'], ['action', '手臂屈肌', '主動屈臂']];
    else labels = [['receptor', '感受器', state.mode === 'knee' ? '肌梭' : '皮膚痛覺'], ['sensory', '感覺神經元', '經背根'], ...(state.mode === 'withdrawal' ? [['inter', '中間神經元', '灰質內']] : []), ['motor', '運動神經元', '經腹根'], ['action', '效應器', state.mode === 'knee' ? '股四頭肌' : '手臂屈肌']];
    $('flowchart').replaceChildren();
    labels.forEach(([key, text, sub], i) => {
      if (i) { const arrow = document.createElement('span'); arrow.className = 'flow-arrow'; arrow.textContent = '→'; arrow.setAttribute('aria-hidden', 'true'); $('flowchart').appendChild(arrow); }
      const node = document.createElement('div'); node.className = 'flow-step'; node.dataset.flow = key;
      const strong = document.createElement('strong'); strong.textContent = text;
      const small = document.createElement('small'); small.textContent = sub;
      node.append(strong, small); $('flowchart').appendChild(node);
    });
    if (state.mode !== 'voluntary') { const branch = document.createElement('span'); branch.id = 'branch-note'; branch.className = 'branch-note'; branch.textContent = '＋ 並行支路：上行 → 大腦（感覺）'; $('flowchart').appendChild(branch); }
  }
  function stop() { state.playing = false; cancelAnimationFrame(state.frame); state.lastFrame = null; }
  function prepare(clearPredictions = true) {
    stop(); state.run = null; state.time = 0; state.recorded = false; state.eventSignature = '';
    predictionSnapshot = {};
    if (clearPredictions) makePredictions();
    buildFlow(); updateLesions(); render();
  }
  function setMode(mode, intentional) {
    state.mode = mode; state.intentional = mode === 'voluntary' && !!intentional;
    document.querySelectorAll('[data-mode]').forEach(el => { const active = el.dataset.mode === mode; el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active)); });
    $('voluntary-options').hidden = mode !== 'voluntary';
    document.querySelector('input[name=voluntary-trigger][value=' + (state.intentional ? 'intention' : 'touch') + ']').checked = true;
    const M = MODES[mode];
    $('mode-english').textContent = M.en; $('diagram-title').textContent = M.question;
    $('svg-title').textContent = M.title + '的神經傳遞路徑';
    $('svg-description').textContent = M.takeaway + ' 感覺神經元經背根進入脊髓；運動神經元經腹根到達肌肉。';
    hide($('arm-anatomy'), mode === 'knee'); hide($('leg-anatomy'), mode !== 'knee');
    hide($('soft-pad'), mode !== 'voluntary' || state.intentional); hide($('sharp-object'), mode !== 'withdrawal');
    $('arm-receptor-label').textContent = mode === 'voluntary' ? '皮膚觸覺感受器' : '皮膚痛覺感受器';
    for (const id of ['path-inter', 'inter-soma', 'local-neuron-label', 'local-neuron-label2']) hide($(id), mode !== 'withdrawal');
    hide(paths.direct, mode !== 'knee'); hide($('sensory-synapse'), mode !== 'withdrawal');
    hide($('up-relay-soma'), mode !== 'withdrawal');
    paths.upRelay.setAttribute('d', mode !== 'withdrawal' ? 'M666 312Q692 304 719 310' : 'M676 308Q699 293 719 310');
    paths.upRelay.style.stroke = mode !== 'withdrawal' ? PARTS.sensory.color : PARTS.ascend.color;
    for (const key of ['cortexSense', 'cortexMotor']) hide(paths[key], mode !== 'voluntary');
    for (const key of ['descend', 'downRelay']) paths[key].classList.toggle('inactive', mode !== 'voluntary');
    $('stimulus-text').textContent = state.intentional ? '沒有新刺激；大腦自行決定屈臂' : M.stimulus;
    $('sensation-heading').textContent = mode === 'withdrawal' ? '痛覺' : mode === 'knee' ? '肌肉牽張感覺' : state.intentional ? '感覺功能' : '觸覺';
    $('inquiry-text').textContent = mode === 'withdrawal' ? '若訊息無法傳到大腦，手還會自動縮回嗎？' : mode === 'knee' ? '敲擊髕腱，為甚麼感受器卻畫在肌肉內？' : '感覺神經元受損，是否一定不能主動屈臂？';
    prepare();
  }
  function ensureRun() {
    if (state.run) return;
    state.run = buildRun(config()); state.time = 0; state.recorded = false; state.eventSignature = '';
    predictionSnapshot = Object.fromEntries(predictionKeys().map(key => [key, document.querySelector('input[name="prediction-' + key + '"]:checked')?.value || null]));
  }
  function play() {
    if (state.playing) { stop(); render(); return; }
    if (state.run && state.time >= state.run.duration) { state.run = null; ensureRun(); }
    ensureRun(); state.playing = true; state.lastFrame = null;
    function frame(now) {
      if (!state.playing) return;
      if (state.lastFrame !== null) state.time = Math.min(state.run.duration, state.time + Math.min(now - state.lastFrame, 100) * Number($('speed').value));
      state.lastFrame = now;
      if (state.time >= state.run.duration) { state.playing = false; state.lastFrame = null; }
      render();
      if (state.playing) state.frame = requestAnimationFrame(frame);
    }
    state.frame = requestAnimationFrame(frame); render();
  }
  function step() {
    stop(); const isNew = !state.run; ensureRun();
    if (isNew) { render(); return; }
    const next = state.run.events.find(e => e.at > state.time + 1);
    state.time = next ? Math.min(state.run.duration, next.at + (next.action ? 330 : 0)) : state.run.duration; render();
  }
  function moveLimb(actionAt) {
    const elapsed = actionAt === null ? 0 : Math.max(0, state.time - actionAt);
    const eased = actionAt === null ? 0 : 1 - Math.pow(1 - Math.min(1, elapsed / 330), 3);
    const angle = state.mode === 'knee' ? 34 * eased : 34 * eased;
    $('forearm').setAttribute('transform', 'rotate(' + angle + ' 288 409)');
    $('lowerleg').setAttribute('transform', 'rotate(' + angle + ' 189 360)');
    $('arm-muscle').classList.toggle('contracted', eased > 0); $('leg-muscle').classList.toggle('contracted', eased > 0);
    if (state.mode === 'knee') {
      paths.sensory.setAttribute('d', 'M280 325C317 319 350 340 383 369L429 369C448 322 452 305 483 305L510 305C560 305 605 292 666 312');
      paths.motor.setAttribute('d', 'M686 418C644 443 575 441 530 410L441 410C384 410 354 363 298 335');
    } else {
      const radians = angle * Math.PI / 180;
      const x = 288 + (129 - 288) * Math.cos(radians) - (407 - 409) * Math.sin(radians);
      const y = 409 + (129 - 288) * Math.sin(radians) + (407 - 409) * Math.cos(radians);
      const labelY = 348 - eased * 80, labelX = 116 - eased * 58;
      $('arm-receptor-label').setAttribute('x', labelX); $('arm-receptor-label').setAttribute('y', labelY);
      $('arm-receptor-leader').setAttribute('d', 'M' + x + ' ' + y + 'L' + (139 - eased * 49) + ' ' + (labelY + 10) + 'H' + (labelX + 106));
      paths.sensory.setAttribute('d', 'M' + x + ' ' + y + 'C229 385 300 427 383 369L429 369C448 322 452 305 483 305L510 305C560 305 605 292 666 312');
      paths.motor.setAttribute('d', 'M686 418C644 443 575 441 530 410L441 410C395 410 358 384 321 352');
    }
    // The tap precedes neural conduction; all movement is tied to this one clock.
    const tap = state.run && state.mode === 'knee' ? Math.sin(Math.min(1, state.time / 500) * Math.PI) : 0;
    $('hammer').setAttribute('transform', 'translate(' + (tap * 14) + ' ' + (-tap * 5) + ')');
    $('tap-lines').setAttribute('opacity', tap > 0.55 ? '1' : '0');
  }
  function updateMarks() {
    document.querySelectorAll('.cut-mark').forEach(mark => {
      const key = mark.dataset.part;
      const hidden = !state.cuts.has(key) || !applicable(key); hide(mark, hidden);
      if (!hidden) { const p = paths[key].getPointAtLength(paths[key].getTotalLength() * PARTS[key].fraction); mark.setAttribute('transform', 'translate(' + p.x + ' ' + p.y + ')'); }
    });
  }
  function drawSignals() {
    $('signals').replaceChildren();
    if (!state.run) return;
    for (const segment of state.run.segments) {
      if (state.time < segment.start || state.time > segment.end + (segment.blocked ? 500 : 0)) continue;
      const progress = Math.min(1, (state.time - segment.start) / (segment.end - segment.start));
      const path = paths[segment.path], point = path.getPointAtLength(path.getTotalLength() * segment.fraction * progress);
      const color = segment.blocked && progress === 1 ? '#ba5142' : segment.part ? PARTS[segment.part].color : '#197d70';
      $('signals').appendChild(svgElement('circle', { cx: point.x, cy: point.y, r: 11, fill: color, filter: 'url(#signal-glow)', class: 'signal-halo' }));
      $('signals').appendChild(svgElement('circle', { cx: point.x, cy: point.y, r: 6, stroke: color, class: 'signal-dot' }));
    }
  }
  function updateFlow(events) {
    document.querySelectorAll('[data-flow]').forEach(node => {
      const key = node.dataset.flow;
      let started = false, blocked = false;
      if (state.run) {
        if (key === 'receptor') started = true;
        else if (key === 'association') started = events.some(e => ['decision', 'intention'].includes(e.id));
        else if (key === 'action') started = events.some(e => e.action);
        else {
          const segment = state.run.segments.find(s => s.path === key);
          started = !!segment && state.time >= segment.start;
          blocked = !!segment && segment.blocked && state.time >= segment.end;
        }
      }
      node.classList.toggle('done', started && !blocked); node.classList.toggle('blocked', blocked);
    });
    const branch = $('branch-note');
    if (branch) branch.textContent = events.some(e => e.id === 'sensation') ? '＋ 上行支路完成：大腦產生感覺' : events.some(e => e.blocked === 'ascend' || e.blocked === 'sensory') ? '＋ 感覺訊息未能到達大腦' : '＋ 並行支路：上行 → 大腦（感覺）';
  }
  function renderResults(complete) {
    const result = state.run?.result;
    for (const key of ['reflex', 'sensation', 'voluntary']) {
      const el = $('result-' + key);
      el.className = '';
      if (complete) {
        const value = result[key];
        el.textContent = value === null ? key === 'sensation' ? '未測（無新刺激）' : key === 'reflex' ? '本次未測' : '本次未測' : value ? '有 ✓' : '沒有 ×';
        el.className = value === null ? 'neutral' : value ? 'yes' : 'no';
      } else {
        const untested = key === 'voluntary' && state.mode !== 'voluntary' || key === 'reflex' && state.mode === 'voluntary' || key === 'sensation' && state.intentional;
        el.textContent = untested ? '本次未測' : '等待觀察'; el.className = untested ? 'neutral' : '';
      }
    }
    $('explanation').hidden = !complete; $('prediction-feedback').hidden = !complete;
    if (!complete) return;
    $('takeaway').textContent = MODES[state.mode].takeaway;
    $('explanation-list').replaceChildren(...explain(state.run.config).map(line => { const li = document.createElement('li'); li.textContent = line; return li; }));
    $('test-voluntary-button').hidden = state.mode === 'voluntary';
    const answers = predictionKeys().filter(k => predictionSnapshot[k]);
    $('prediction-feedback').textContent = answers.length ? answers.map(key => labelFor(key) + '：' + ((predictionSnapshot[key] === 'yes') === result[key] ? '預測正確 ✓' : '與預測不同，試用路徑解釋原因')).join('　／　') : '本次沒有提交預測。可改變受損條件，再作一次對照實驗。';
    if (!state.recorded) {
      state.records.push({ mode: state.mode, intentional: state.intentional, cuts: activeCuts(), result: { ...result } });
      state.recorded = true; renderRecords();
    }
  }
  function render() {
    const events = state.run ? state.run.events.filter(e => e.at <= state.time) : [];
    const action = events.find(e => e.action);
    moveLimb(action?.at ?? null); updateMarks(); drawSignals(); updateFlow(events);
    const complete = !!state.run && state.time >= state.run.duration;
    for (const key of ['sensory', 'association', 'motor']) $('area-' + key).classList.toggle('area-lit', events.some(e => e.brain === key));
    $('limb-message-text').textContent = action ? MODES[state.mode].action : complete ? '本次沒有肌肉收縮' : '肌肉放鬆 · ' + (state.run ? '追蹤神經脈衝' : state.intentional ? '等待指令' : '等待刺激');
    $('run-button').innerHTML = state.playing ? '<span aria-hidden="true">Ⅱ</span> 暫停觀察' : complete ? '<span aria-hidden="true">↺</span> 再播一次' : state.run && state.time > 0 ? '<span aria-hidden="true">▶</span> 繼續播放' : '<span aria-hidden="true">▶</span> 開始模擬';
    $('run-button').setAttribute('aria-label', state.playing ? '暫停模擬' : complete ? '重播模擬' : '播放模擬');
    $('step-button').disabled = complete;
    document.querySelectorAll('#predictions input').forEach(input => { input.disabled = !!state.run; });
    $('timeline-range').disabled = !state.run; $('timeline-range').value = state.run ? String(Math.round(1000 * state.time / state.run.duration)) : '0';
    $('play-status').textContent = state.playing ? '觀察中' : complete ? '觀察完成' : state.run ? '已暫停' : '準備就緒';
    const signature = events.length + ':' + complete + ':' + !!state.run;
    if (state.eventSignature !== signature) {
      state.eventSignature = signature;
      $('live-event-text').textContent = events.at(-1)?.text || '先作預測，然後按「開始模擬」或「逐步」。';
      $('event-log').replaceChildren(...events.map(event => { const li = document.createElement('li'); li.textContent = event.text; if (event.blocked) li.className = 'is-blocked'; return li; }));
      renderResults(complete);
    }
  }
  function renderRecords() {
    $('record-count').textContent = String(state.records.length);
    $('records-empty').hidden = state.records.length > 0; $('records-wrap').hidden = state.records.length === 0;
    $('export-button').disabled = !state.records.length; $('clear-records-button').disabled = !state.records.length;
    $('records-body').replaceChildren();
    for (const record of [...state.records].reverse()) {
      const tr = document.createElement('tr');
      for (const text of [MODES[record.mode].title + (record.intentional ? '（主動發令）' : ''), record.cuts.length ? record.cuts.map(k => PARTS[k].name).join('、') : '全部正常']) { const td = document.createElement('td'); td.textContent = text; tr.appendChild(td); }
      for (const key of ['reflex', 'sensation', 'voluntary']) { const td = document.createElement('td'), span = document.createElement('span'), value = record.result[key]; span.textContent = value === null ? '未測' : value ? '有 ✓' : '沒有 ×'; span.className = value === null ? '' : value ? 'yes' : 'no'; td.appendChild(span); tr.appendChild(td); }
      $('records-body').appendChild(tr);
    }
  }
  function exportCSV() {
    const rows = [['情境', '開始方式', '受損部位', '反射動作', '感覺', '隨意動作'], ...state.records.map(record => [MODES[record.mode].title, record.mode !== 'voluntary' ? '反射刺激' : record.intentional ? '大腦主動發令' : '先感到輕觸才屈臂', record.cuts.map(k => PARTS[k].name).join('、') || '全部正常', ...['reflex', 'sensation', 'voluntary'].map(k => record.result[k] === null ? '未測' : record.result[k] ? '有' : '沒有')])];
    const csv = '\uFEFF' + rows.map(row => row.map(cell => '"' + cell.replaceAll('"', '""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = 'reflex-arc-results.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function toggleProjection(force) { const active = force ?? !document.body.classList.contains('projection'); document.body.classList.toggle('projection', active); $('present-button').setAttribute('aria-pressed', String(active)); $('present-button').querySelector('span').textContent = active ? '離開投影' : '投影模式'; }
  function openGuide(science) { $('guide-dialog').showModal(); if (science) $('science-scope').scrollIntoView({ block: 'start' }); }

  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $('preset').addEventListener('change', () => { state.cuts = new Set($('preset').value === 'none' ? [] : [$('preset').value]); prepare(); });
  $('heal-button').addEventListener('click', () => { state.cuts.clear(); prepare(); });
  document.querySelectorAll('input[name=voluntary-trigger]').forEach(input => input.addEventListener('change', () => setMode('voluntary', input.value === 'intention')));
  $('run-button').addEventListener('click', play); $('step-button').addEventListener('click', step);
  $('reset-button').addEventListener('click', () => prepare(false));
  $('timeline-range').addEventListener('input', () => { stop(); ensureRun(); state.time = state.run.duration * Number($('timeline-range').value) / 1000; render(); });
  $('labels-toggle').addEventListener('change', () => document.querySelectorAll('.anatomy-labels').forEach(el => hide(el, !$('labels-toggle').checked)));
  function setDetail(detailed) { state.detailed = detailed; $('details-panel').hidden = !detailed; $('detailed-button').classList.toggle('active', detailed); $('concise-button').classList.toggle('active', !detailed); $('detailed-button').setAttribute('aria-pressed', String(detailed)); $('concise-button').setAttribute('aria-pressed', String(!detailed)); }
  $('concise-button').addEventListener('click', () => setDetail(false)); $('detailed-button').addEventListener('click', () => setDetail(true));
  $('test-voluntary-button').addEventListener('click', () => { setMode('voluntary', true); $('diagram-title').scrollIntoView({ block: 'center', behavior: 'smooth' }); });
  $('export-button').addEventListener('click', exportCSV);
  $('clear-records-button').addEventListener('click', () => { state.records = []; renderRecords(); });
  $('present-button').addEventListener('click', () => toggleProjection());
  $('guide-button').addEventListener('click', () => openGuide(false)); $('science-button').addEventListener('click', () => openGuide(true));
  $('close-guide').addEventListener('click', () => $('guide-dialog').close());
  $('guide-dialog').addEventListener('click', e => { if (e.target === $('guide-dialog')) { const box = e.target.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) e.target.close(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('guide-dialog').open) toggleProjection(false); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.playing) { stop(); render(); } });
  buildLesions(); setMode('withdrawal');
})();
