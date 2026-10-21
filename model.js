/* Shared teaching model: no DOM, network or real physiological timing. */
(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.ReflexModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PARTS = Object.freeze({
    sensory: { name: '感覺神經元', short: '感覺', color: '#c47c15', route: '經背根進入脊髓', fraction: 0.48 },
    inter: { name: '反射弧內中間神經元', short: '中間', color: '#108475', route: '脊髓灰質內的轉傳', fraction: 0.5 },
    motor: { name: '運動神經元', short: '運動', color: '#3276bd', route: '經腹根連接肌肉', fraction: 0.52 },
    ascend: { name: '上行感覺路徑', short: '上行', color: '#9262b4', route: '脊髓 → 大腦', fraction: 0.5 },
    descend: { name: '下行運動路徑', short: '下行', color: '#d56463', route: '大腦 → 脊髓', fraction: 0.5 },
  });
  const MODES = Object.freeze({
    withdrawal: { title: '退縮反射', en: 'WITHDRAWAL REFLEX', question: '手先縮回，還是先感到痛？', stimulus: '手指接觸尖銳物件', receptor: '皮膚痛覺感受器', effector: '手臂屈肌', action: '屈肌收縮，手縮回', sensation: '感到痛楚', takeaway: '反射弧在脊髓完成；產生痛覺則需要大腦。' },
    knee: { title: '膝躍反射', en: 'KNEE-JERK REFLEX', question: '輕敲髕腱，為甚麼小腿會踢起？', stimulus: '反射鎚輕敲髕腱', receptor: '股四頭肌內的肌梭', effector: '股四頭肌', action: '股四頭肌收縮，小腿伸展', sensation: '感知這次牽張', takeaway: '伸肌的主反射弧只有感覺及運動兩個神經元。' },
    voluntary: { title: '隨意動作', en: 'VOLUNTARY ACTION', question: '沒有新的感覺刺激，也能主動屈臂嗎？', stimulus: '手指輕觸軟墊（非傷害性）', receptor: '皮膚觸覺感受器', effector: '手臂屈肌', action: '主動屈臂', sensation: '感到接觸', takeaway: '隨意動作由大腦發出指令，經下行路徑及脊髓運動神經元到達肌肉。' },
  });

  function normalize(config = {}) {
    const mode = config.mode || 'withdrawal';
    if (!MODES[mode]) throw new Error('Unknown mode: ' + mode);
    const cuts = new Set(config.cuts || []);
    for (const key of cuts) if (!PARTS[key]) throw new Error('Unknown lesion: ' + key);
    return { mode, cuts, intentional: mode === 'voluntary' && !!config.intentional };
  }

  function evaluate(config) {
    const { mode, cuts, intentional } = normalize(config);
    const afferent = !cuts.has('sensory');
    const conscious = afferent && !cuts.has('ascend');
    const output = !cuts.has('descend') && !cuts.has('motor');
    return Object.freeze({
      reflex: mode === 'voluntary' ? null : afferent && !cuts.has('motor') && (mode === 'knee' || !cuts.has('inter')),
      sensation: intentional ? null : conscious,
      voluntary: mode === 'voluntary' ? output && (intentional || conscious) : null,
      // Capacity is deliberately separate from an observed response to this stimulus.
      voluntaryCapacity: output,
    });
  }

  function buildRun(config) {
    const c = normalize(config), M = MODES[c.mode];
    const result = evaluate(c), segments = [], events = [];
    const event = (at, id, text, extra = {}) => events.push({ at, id, text, ...extra });
    function travel(path, start, duration, part, text) {
      const blocked = !!part && c.cuts.has(part);
      const fraction = blocked ? PARTS[part].fraction : 1;
      const end = start + duration * fraction;
      segments.push({ path, start, end, fraction, blocked, part });
      if (blocked) event(end, 'blocked-' + part, PARTS[part].name + '受損：這條路徑的神經脈衝在此中斷。', { blocked: part });
      else if (text) event(end, path, text);
      return { ok: !blocked, end };
    }

    function descend(start) {
      event(start, 'motor-command', '大腦運動區發出主動屈臂指令。', { brain: 'motor' });
      const down = travel('descend', start + 150, 2000, 'descend', '指令沿脊髓內的下行路徑傳遞。');
      if (!down.ok) return;
      const relay = travel('downRelay', down.end, 500, null, '下行路徑經灰質內的轉傳，與脊髓運動神經元形成突觸。');
      const motor = travel('motor', relay.end + 150, 1600, 'motor', '神經脈衝經腹根沿運動神經元傳到手臂屈肌。');
      if (motor.ok) event(motor.end + 50, 'voluntary-action', '手臂屈肌收縮，產生主動屈臂動作。', { action: true });
    }

    if (c.intentional) {
      event(0, 'intention', '沒有新的外來刺激；大腦自行決定屈臂。', { brain: 'association' });
      travel('cortexMotor', 350, 700, null, '大腦聯合區把決策傳給運動區。');
      descend(1100);
    } else {
      event(0, 'stimulus', c.mode === 'knee'
        ? '反射鎚輕敲髕腱，使股四頭肌短暫被拉長；肌肉內的肌梭受到刺激。'
        : M.stimulus + '，' + M.receptor + '產生神經脈衝。');
      const sensory = travel('sensory', 400, 1700, 'sensory', '神經脈衝經背根進入脊髓。感覺神經元的細胞體在背根神經節；此處沒有轉傳突觸。');
      if (sensory.ok) {
        if (c.mode !== 'voluntary') {
          let relay;
          if (c.mode === 'knee') {
            relay = travel('direct', 2250, 600, null, '在脊髓灰質內，感覺神經元直接與運動神經元形成突觸。');
          } else {
            event(2200, 'synapse-in', '在脊髓灰質內，感覺神經元經突觸把訊息傳給中間神經元。');
            relay = travel('inter', 2250, 850, 'inter', '中間神經元經另一突觸把訊息傳給運動神經元。');
          }
          if (relay.ok) {
            const motor = travel('motor', relay.end + 150, 1600, 'motor', '神經脈衝經腹根沿運動神經元傳到' + M.effector + '。');
            if (motor.ok) event(motor.end + 50, 'reflex-action', M.action + '，不必等待大腦發出指令。', { action: true });
          }
        }
        // This branch runs independently, even when the local reflex branch fails.
        travel('upRelay', 2250, 500, null, c.mode !== 'withdrawal' ? '感覺神經元的分支經脊髓白質上行，經腦幹等處轉傳至大腦。' : '同時，另一條感覺路徑經脊髓內的轉傳，把訊息送往大腦。');
        const up = travel('ascend', 2900, 2600, 'ascend');
        if (up.ok) {
          event(up.end, 'sensation', '神經脈衝到達大腦，' + M.sensation + '。', { brain: 'sensory' });
          if (c.mode === 'voluntary') {
            travel('cortexSense', 5650, 650, null);
            event(6300, 'decision', '大腦聯合區根據接觸訊息作出「屈臂」的決定。', { brain: 'association' });
            travel('cortexMotor', 6400, 650, null);
            descend(7100);
          }
        }
      }
    }
    events.sort((a, b) => a.at - b.at);
    const duration = Math.max(...events.map(e => e.at), ...segments.map(s => s.end)) + 450;
    return { config: { mode: c.mode, cuts: [...c.cuts], intentional: c.intentional }, result, events, segments, duration };
  }

  function explain(config) {
    const c = normalize(config), r = evaluate(c), lines = [];
    if (c.mode !== 'voluntary') {
      lines.push(r.reflex
        ? c.mode === 'knee' ? '反射弧完整：肌梭 → 感覺神經元 → 運動神經元 → 股四頭肌；伸肌主反射弧有一個中樞突觸。' : '反射弧完整：痛覺感受器 → 感覺神經元 → 中間神經元 → 運動神經元 → 手臂屈肌。'
        : (c.cuts.has('sensory') ? '感覺神經元' : c.mode === 'withdrawal' && c.cuts.has('inter') ? '反射弧內中間神經元' : '運動神經元') + '受損，令反射弧中斷，所以沒有這次反射動作。');
    }
    if (r.sensation === null) lines.push('本次沒有新的感覺刺激，沒有測試感覺功能；這不代表感覺神經元失去功能。');
    else if (r.sensation) lines.push('感覺訊息經完整的上行路徑到達大腦，所以能產生本次感覺。' + (r.reflex ? '反射支路與上行支路同時傳遞；本動畫示範先反射、後察覺。' : '反射支路失敗，不等於上行感覺支路也失敗。'));
    else lines.push((c.cuts.has('sensory') ? '感覺神經元' : '上行感覺路徑') + '受損，這個感受器的訊息不能到達大腦，所以沒有本次感覺。' + (r.reflex ? '脊髓反射弧仍完整，因此反射仍可發生。' : ''));
    if (c.mode === 'voluntary') {
      lines.push(r.voluntary ? '大腦發出的指令經完整下行路徑、脊髓灰質內的轉傳及運動神經元到達肌肉，產生隨意動作。'
        : !c.intentional && !r.sensation ? '這個「先感到接觸才屈臂」的任務沒有收到觸覺訊息，因此沒有觸發決策。可改用「大腦主動發令」另測運動能力。'
          : (c.cuts.has('descend') ? '下行運動路徑' : '運動神經元') + '受損，大腦指令不能到達肌肉，所以沒有本次隨意動作。');
      lines.push('輕觸軟墊不是痛覺刺激，本任務沒有引發退縮反射；並非手臂不存在反射弧。');
    } else {
      lines.push('本次只施加反射刺激，沒有要求主動動作。切換至「隨意動作」並選「大腦主動發令」，可保留受損條件作獨立測試。');
      if (c.cuts.has('descend')) lines.push('在本模型中，選擇性中斷下行路徑不會切斷局部脊髓反射弧。');
    }
    return lines;
  }
  return Object.freeze({ PARTS, MODES, evaluate, buildRun, explain });
});
