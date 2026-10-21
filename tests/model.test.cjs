const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, buildRun, explain } = require('../model.js');

// Teaching truth table, specified independently of animation implementation.
// [mode, damaged path, intentional?, reflex, sensation, voluntary]
const cases = [
  ['withdrawal', null, false, true, true, null],
  ['withdrawal', 'sensory', false, false, false, null],
  ['withdrawal', 'inter', false, false, true, null],
  ['withdrawal', 'motor', false, false, true, null],
  ['withdrawal', 'ascend', false, true, false, null],
  ['withdrawal', 'descend', false, true, true, null],
  ['knee', null, false, true, true, null],
  ['knee', 'sensory', false, false, false, null],
  ['knee', 'inter', false, true, true, null],
  ['knee', 'motor', false, false, true, null],
  ['knee', 'ascend', false, true, false, null],
  ['knee', 'descend', false, true, true, null],
  ['voluntary', null, false, null, true, true],
  ['voluntary', 'sensory', false, null, false, false],
  ['voluntary', 'inter', false, null, true, true],
  ['voluntary', 'motor', false, null, true, false],
  ['voluntary', 'ascend', false, null, false, false],
  ['voluntary', 'descend', false, null, true, false],
  ['voluntary', null, true, null, null, true],
  ['voluntary', 'sensory', true, null, null, true],
  ['voluntary', 'inter', true, null, null, true],
  ['voluntary', 'motor', true, null, null, false],
  ['voluntary', 'ascend', true, null, null, true],
  ['voluntary', 'descend', true, null, null, false],
];
for (const [mode, cut, intentional, reflex, sensation, voluntary] of cases) {
  test(`${mode}/${intentional ? 'intention' : 'stimulus'}/${cut || 'intact'}`, () => {
    const r = evaluate({ mode, cuts: cut ? [cut] : [], intentional });
    assert.deepEqual([r.reflex, r.sensation, r.voluntary], [reflex, sensation, voluntary]);
  });
}
const allParts = ['sensory', 'inter', 'motor', 'ascend', 'descend'];
for (const mode of ['withdrawal', 'knee', 'voluntary-touch', 'voluntary-intention']) {
  for (let mask = 0; mask < 32; mask++) {
    const cuts = allParts.filter((_, i) => mask & (1 << i));
    test(`animation/output agreement: ${mode}, lesions=${mask}`, () => {
      const run = buildRun({ mode: mode.startsWith('voluntary') ? 'voluntary' : mode, intentional: mode === 'voluntary-intention', cuts });
      const ids = run.events.map(e => e.id);
      assert.equal(ids.includes('reflex-action'), run.result.reflex === true);
      assert.equal(ids.includes('sensation'), run.result.sensation === true);
      assert.equal(ids.includes('voluntary-action'), run.result.voluntary === true);
      for (let i = 1; i < run.events.length; i++) assert.ok(run.events[i - 1].at <= run.events[i].at);
      assert.ok(run.events.every(e => e.at < run.duration));
      for (const s of run.segments) {
        assert.ok(s.end > s.start);
        if (s.part && cuts.includes(s.part)) { assert.equal(s.blocked, true); assert.ok(s.fraction < 1); }
      }
      if (mode === 'knee') assert.ok(!run.segments.some(s => s.path === 'inter'));
      if (mode === 'voluntary-intention') assert.ok(!run.segments.some(s => ['sensory', 'ascend'].includes(s.path)));
      assert.ok(explain(run.config).length >= 3);
    });
  }
}
test('failed reflex motor branch does not stop the concurrent ascending branch', () => {
  for (const cut of ['motor', 'inter']) {
    const run = buildRun({ mode: 'withdrawal', cuts: [cut] });
    const blocked = run.events.find(e => e.blocked === cut), sensation = run.events.find(e => e.id === 'sensation');
    assert.ok(sensation.at > blocked.at);
    assert.ok(!run.events.some(e => e.action));
  }
});
test('intact examples show reflex before awareness; this is an ordering, not measured latency', () => {
  for (const mode of ['withdrawal', 'knee']) {
    const run = buildRun({ mode });
    assert.ok(run.events.find(e => e.id === 'reflex-action').at < run.events.find(e => e.id === 'sensation').at);
  }
});
test('voluntary motion capacity is independent of a stimulus-triggered decision', () => {
  const r = evaluate({ mode: 'voluntary', cuts: ['sensory'] });
  assert.equal(r.voluntary, false);
  assert.equal(r.voluntaryCapacity, true);
});
test('compound lesions do not restore function', () => {
  for (const mode of ['withdrawal', 'knee', 'voluntary']) {
    for (const intentional of [false, true]) {
      for (let mask = 0; mask < 32; mask++) {
        const cuts = allParts.filter((_, i) => mask & (1 << i));
        const before = evaluate({ mode, intentional, cuts });
        for (const added of allParts.filter(p => !cuts.includes(p))) {
          const after = evaluate({ mode, intentional, cuts: [...cuts, added] });
          for (const key of ['reflex', 'sensation', 'voluntary']) if (before[key] === false) assert.notEqual(after[key], true);
        }
      }
    }
  }
});
test('unknown modes or lesion names fail explicitly', () => {
  assert.throws(() => buildRun({ mode: 'bad' }), /Unknown mode/);
  assert.throws(() => buildRun({ cuts: ['bad'] }), /Unknown lesion/);
});
