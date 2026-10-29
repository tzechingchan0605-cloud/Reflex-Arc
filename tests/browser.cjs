const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'test-results');
fs.mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['scripts/serve.cjs'], { cwd: root, env: { ...process.env, PORT: '4174' }, stdio: ['ignore', 'pipe', 'pipe'] });
const ready = new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => { if (code) reject(new Error('Server failed: ' + code)); }); });
let browser;
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log('PASS', name); }

(async () => {
  await ready;
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => requests.push(r.url()));
  await page.goto('http://127.0.0.1:4174');
  async function setScenario(mode, cut = 'none', intentional = false) {
    await page.locator('[data-mode=' + mode + ']').click();
    await page.locator('#preset').selectOption(cut);
    if (mode === 'voluntary' && intentional) await page.locator('[name=voluntary-trigger][value=intention]').check();
  }
  async function finish() {
    await page.locator('#step-button').click();
    await page.locator('#timeline-range').evaluate(el => { el.value = '1000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('#play-status').textContent(), '觀察完成');
  }
  async function outcomes() { return Promise.all(['reflex', 'sensation', 'voluntary'].map(key => page.locator('#result-' + key).textContent())); }
  await check('initial state has no premature answers', async () => {
    assert.deepEqual(await outcomes(), ['等待觀察', '等待觀察', '本次未測']);
    assert.equal(await page.locator('#arm-anatomy').isVisible(), true);
    assert.equal(await page.locator('#leg-anatomy').isVisible(), false);
    await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true });
  });
  const matrix = [
    ['withdrawal', 'none', false, ['有 ✓', '有 ✓', '本次未測']],
    ['withdrawal', 'sensory', false, ['沒有 ×', '沒有 ×', '本次未測']],
    ['withdrawal', 'inter', false, ['沒有 ×', '有 ✓', '本次未測']],
    ['withdrawal', 'motor', false, ['沒有 ×', '有 ✓', '本次未測']],
    ['withdrawal', 'ascend', false, ['有 ✓', '沒有 ×', '本次未測']],
    ['withdrawal', 'descend', false, ['有 ✓', '有 ✓', '本次未測']],
    ['knee', 'none', false, ['有 ✓', '有 ✓', '本次未測']],
    ['knee', 'sensory', false, ['沒有 ×', '沒有 ×', '本次未測']],
    ['knee', 'motor', false, ['沒有 ×', '有 ✓', '本次未測']],
    ['knee', 'ascend', false, ['有 ✓', '沒有 ×', '本次未測']],
    ['knee', 'descend', false, ['有 ✓', '有 ✓', '本次未測']],
    ['voluntary', 'none', false, ['本次未測', '有 ✓', '有 ✓']],
    ['voluntary', 'sensory', false, ['本次未測', '沒有 ×', '沒有 ×']],
    ['voluntary', 'motor', false, ['本次未測', '有 ✓', '沒有 ×']],
    ['voluntary', 'ascend', false, ['本次未測', '沒有 ×', '沒有 ×']],
    ['voluntary', 'descend', false, ['本次未測', '有 ✓', '沒有 ×']],
    ['voluntary', 'none', true, ['本次未測', '未測（無新刺激）', '有 ✓']],
    ['voluntary', 'sensory', true, ['本次未測', '未測（無新刺激）', '有 ✓']],
    ['voluntary', 'motor', true, ['本次未測', '未測（無新刺激）', '沒有 ×']],
    ['voluntary', 'ascend', true, ['本次未測', '未測（無新刺激）', '有 ✓']],
    ['voluntary', 'descend', true, ['本次未測', '未測（無新刺激）', '沒有 ×']],
  ];
  for (const [mode, cut, intentional, expected] of matrix) await check(`functional truth table ${mode}/${cut}/${intentional}`, async () => { await setScenario(mode, cut, intentional); await finish(); assert.deepEqual(await outcomes(), expected); });
  await check('knee shows limb, hammer, muscle spindle and direct afferent path', async () => {
    await setScenario('knee');
    for (const id of ['leg-anatomy', 'hammer', 'muscle-spindle', 'path-direct']) assert.equal(await page.locator('#' + id).isVisible(), true);
    for (const id of ['arm-anatomy', 'path-inter', 'up-relay-soma']) assert.equal(await page.locator('#' + id).isVisible(), false);
    assert.equal(await page.locator('[data-part=inter].lesion-button').isDisabled(), true);
    await finish();
    assert.notEqual(await page.locator('#lowerleg').getAttribute('transform'), 'rotate(0 189 360)');
    await page.screenshot({ path: path.join(out, 'knee-result.png'), fullPage: true });
  });
  await check('multiple damage selections keep unrelated feeling branch alive', async () => {
    await setScenario('withdrawal', 'inter'); await page.locator('.lesion-button[data-part=descend]').click();
    await finish(); assert.deepEqual(await outcomes(), ['沒有 ×', '有 ✓', '本次未測']);
    assert.match(await page.locator('#explanation-list').textContent(), /反射支路失敗/);
  });
  await check('prediction grading is locked at playback start', async () => {
    await setScenario('withdrawal', 'ascend');
    await page.locator('[name=prediction-reflex][value=yes]').check(); await page.locator('[name=prediction-sensation][value=yes]').check();
    await finish(); assert.equal(await page.locator('[name=prediction-reflex][value=yes]').isDisabled(), true);
    const feedback = await page.locator('#prediction-feedback').textContent(); assert.match(feedback, /反射動作：預測正確/); assert.match(feedback, /痛覺：與預測不同/);
  });
  await check('playback pause, reset, next event and mode switch cancel the old clock', async () => {
    await setScenario('withdrawal'); await page.locator('#speed').selectOption('2'); await page.locator('#run-button').click();
    await page.waitForFunction(() => +document.getElementById('timeline-range').value > 50);
    await page.locator('#run-button').click(); const paused = await page.locator('#timeline-range').inputValue();
    await page.waitForTimeout(140); assert.equal(await page.locator('#timeline-range').inputValue(), paused);
    await page.locator('#reset-button').click(); assert.equal(await page.locator('#timeline-range').inputValue(), '0');
    await page.locator('#step-button').click(); assert.match(await page.locator('#live-event-text').textContent(), /產生神經脈衝/);
    await page.locator('#step-button').click(); assert.match(await page.locator('#live-event-text').textContent(), /背根/);
    await page.locator('#run-button').click(); await page.locator('[data-mode=knee]').click(); await page.waitForTimeout(140);
    assert.equal(await page.locator('#timeline-range').inputValue(), '0'); assert.equal(await page.locator('#play-status').textContent(), '準備就緒');
  });
  await check('real-time animation completes without scrub or step', async () => {
    await setScenario('withdrawal'); await page.locator('#speed').selectOption('2'); await page.locator('#run-button').click();
    await page.waitForFunction(() => document.getElementById('play-status').textContent === '觀察完成', { timeout: 12000 });
    assert.deepEqual(await outcomes(), ['有 ✓', '有 ✓', '本次未測']);
  });
  await check('step-only lesson reaches each key event and visibly moves the limb', async () => {
    await setScenario('knee');
    let steps = 0;
    while (!(await page.locator('#step-button').isDisabled()) && steps < 20) { await page.locator('#step-button').click(); steps++; }
    assert.ok(steps > 4 && steps < 20); assert.equal(await page.locator('#play-status').textContent(), '觀察完成');
    assert.deepEqual(await outcomes(), ['有 ✓', '有 ✓', '本次未測']);
    assert.equal(await page.locator('#lowerleg').getAttribute('transform'), 'rotate(34 189 360)');
    await setScenario('withdrawal'); await finish();
  });
  await check('preserved withdrawal interneuron lesion does not disable knee extension', async () => {
    await setScenario('withdrawal', 'inter'); await page.locator('[data-mode=knee]').click();
    assert.equal(await page.locator('.lesion-button[data-part=inter]').isDisabled(), true);
    assert.equal(await page.locator('.cut-mark[data-part=inter]').isVisible(), false);
    await finish(); assert.deepEqual(await outcomes(), ['有 ✓', '有 ✓', '本次未測']);
    await setScenario('withdrawal'); await finish();
  });
  await check('replaying and rewinding rebuild visual and explanatory state', async () => {
    await page.locator('#timeline-range').evaluate(el => { el.value = 0; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('#explanation').isVisible(), false);
    assert.equal(await page.locator('#forearm').getAttribute('transform'), 'rotate(0 288 409)');
    assert.equal(await page.locator('#area-sensory').getAttribute('class'), '');
    await finish(); assert.equal(await page.locator('#explanation').isVisible(), true);
  });
  await check('independent voluntary test preserves lesion and uses no afferent input', async () => {
    await setScenario('withdrawal', 'sensory'); await finish();
    await page.locator('#test-voluntary-button').click(); assert.equal(await page.locator('#preset').inputValue(), 'sensory');
    assert.equal(await page.locator('[name=voluntary-trigger][value=intention]').isChecked(), true);
    await finish(); assert.deepEqual(await outcomes(), ['本次未測', '未測（無新刺激）', '有 ✓']);
  });
  await check('labels, expanded explanation, guide dialog, projection and Escape work', async () => {
    await page.locator('#labels-toggle').uncheck(); assert.equal(await page.locator('.anatomy-labels').first().isVisible(), false);
    await page.locator('#labels-toggle').check(); await page.locator('#detailed-button').click(); assert.equal(await page.locator('#event-log').isVisible(), true);
    await page.locator('#guide-button').click(); assert.equal(await page.locator('#guide-dialog').isVisible(), true);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#guide-dialog').isVisible(), false);
    await page.locator('#present-button').click(); assert.equal(await page.locator('.experiment-panel').isVisible(), false);
    await page.screenshot({ path: path.join(out, 'projection.png'), fullPage: true });
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.experiment-panel').isVisible(), true);
  });
  await check('comparison records and CSV contain observed outcomes and untested values', async () => {
    const count = Number(await page.locator('#record-count').textContent()); assert.ok(count >= 25);
    const downloadEvent = page.waitForEvent('download'); await page.locator('#export-button').click(); const download = await downloadEvent;
    const file = path.join(out, download.suggestedFilename()); await download.saveAs(file);
    const csv = fs.readFileSync(file, 'utf8'); assert.ok(csv.startsWith('\uFEFF')); assert.match(csv, /未測/); assert.match(csv, /大腦主動發令/);
    await page.locator('#clear-records-button').click(); assert.equal(await page.locator('#record-count').textContent(), '0');
  });
  const neuronSteps = [
    '神經脈衝到達並刺激突觸小體。', '突觸小泡釋出神經遞質。', '神經遞質藉擴散越過突觸間隙。',
    '神經遞質與樹突上的受體部位結合。', '樹突受到刺激，發出神經脈衝。',
  ];
  await check('only genuine modeled junctions get context-specific hotspots', async () => {
    for (const [mode, expected] of [
      ['withdrawal', ['sensory-inter', 'inter-motor', 'motor-muscle']],
      ['knee', ['sensory-motor', 'motor-muscle']],
      ['voluntary', ['descending-motor', 'motor-muscle']],
    ]) {
      await setScenario(mode);
      assert.deepEqual(await page.locator('.synapse-hotspot:visible').evaluateAll(els => els.map(el => el.dataset.synapse)), expected);
      assert.equal(await page.locator('#synapse-shortcuts button').count(), expected.length);
      for (const id of expected) {
        await page.locator('#hotspot-' + id).click();
        assert.equal(await page.locator('#synapse-dialog').isVisible(), true);
        assert.equal(await page.locator('#micro-step-count').textContent(), '步驟 1 / ' + (id === 'motor-muscle' ? 6 : 5));
        await page.locator('#close-synapse').click();
      }
    }
  });
  await check('neuron view follows all five textbook steps and keeps electrical signals out of the cleft', async () => {
    await setScenario('withdrawal'); await page.locator('#hotspot-sensory-inter').focus(); await page.keyboard.press('Enter');
    assert.match(await page.locator('#synapse-subtitle').textContent(), /感覺神經元 → 中間神經元/);
    assert.deepEqual(await page.locator('#micro-steps button>span:last-child').allTextContents(), neuronSteps);
    assert.equal(await page.locator('#micro-transmitters circle').count(), 0);
    assert.equal(await page.locator('#micro-output-signal').getAttribute('opacity'), '0');
    for (let i = 0; i < 5; i++) {
      await page.locator('#micro-next').click();
      assert.equal(await page.locator('#micro-current-text').textContent(), neuronSteps[i]);
      if (i === 1) assert.equal(await page.locator('#micro-release-vesicle').getAttribute('opacity') === '1', false);
      if (i === 2) {
        const dots = await page.locator('#micro-transmitters circle').evaluateAll(els => els.map(el => ({ x: +el.getAttribute('cx'), y: +el.getAttribute('cy') })));
        assert.ok(dots.length > 4); assert.ok(Math.max(...dots.map(d => d.x)) - Math.min(...dots.map(d => d.x)) > 100);
        assert.ok(dots.every(d => d.y > 294 && d.y < 350));
      }
      if (i === 3) { assert.equal(await page.locator('#micro-transmitters .bound').count(), 4); assert.equal(await page.locator('#micro-output-signal').getAttribute('opacity'), '0'); }
    }
    assert.equal(await page.locator('#micro-output-signal').getAttribute('opacity'), '1');
    assert.equal(await page.locator('#micro-contraction').isVisible(), false);
    assert.equal(await page.locator('#micro-next').isDisabled(), true);
    await page.locator('#synapse-dialog').screenshot({ path: path.join(out, 'synapse-neuron.png') });
    await page.locator('#close-synapse').click();
  });
  await check('muscle junction adapts recipient and response without calling muscle a neurone', async () => {
    for (const [mode, muscle] of [['withdrawal', '手臂屈肌'], ['knee', '股四頭肌']]) {
      await setScenario(mode); await page.locator('[data-open-synapse=motor-muscle]').click();
      assert.match(await page.locator('#synapse-subtitle').textContent(), new RegExp(muscle + '的肌纖維'));
      assert.match(await page.locator('[data-micro-step="3"]').textContent(), /肌纖維上的受體部位/);
      await page.locator('[data-micro-step="4"]').click();
      assert.equal(await page.locator('#micro-current-text').textContent(), '肌纖維受到刺激，產生電脈衝。');
      assert.equal(await page.locator('#micro-muscle-signal').getAttribute('opacity'), '1');
      assert.equal(await page.locator('#micro-contraction').isVisible(), false);
      assert.match(await page.locator('#micro-muscle').getAttribute('transform'), /scale\(1 1\)/);
      await page.locator('#micro-next').click();
      assert.equal(await page.locator('#micro-step-count').textContent(), '步驟 6 / 6');
      assert.equal(await page.locator('#micro-current-text').textContent(), '電脈衝沿肌纖維傳遞，引致肌肉收縮。');
      assert.equal(await page.locator('#micro-output-signal').getAttribute('opacity'), '0');
      assert.equal(await page.locator('#micro-contraction').isVisible(), true);
      assert.equal(await page.locator('#micro-receiver').isVisible(), false);
      assert.match(await page.locator('#micro-muscle').getAttribute('transform'), /scale\(0.9 1\)/);
      assert.notEqual(await page.locator('#micro-contraction').getAttribute('stroke'), '#c85c4c');
      assert.match(await page.locator('#micro-source').textContent(), /原理延伸/);
      if (mode === 'knee') await page.locator('#synapse-dialog').screenshot({ path: path.join(out, 'synapse-muscle.png') });
      await page.locator('#close-synapse').click();
    }
  });
  await check('every microscopic label reaches its visible structure through animation and resizing', async () => {
    await setScenario('withdrawal');
    for (const width of [1440, 768, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const site of ['sensory-inter', 'motor-muscle']) {
        await page.locator('[data-open-synapse=' + site + ']').click();
        const last = site === 'motor-muscle' ? 5 : 4;
        // Check both the stored molecules and every subsequent animated stage.
        for (const step of [-1, 0, 1, 2, 3, 4, ...(last === 5 ? [5] : [])]) {
          if (step >= 0) await page.locator('[data-micro-step="' + step + '"]').click();
          const annotations = await page.locator('#micro-diagram').evaluate(diagram => {
            const hits = [...diagram.querySelectorAll('.micro-labels path[data-target]')].map(leader => {
              const target = document.getElementById(leader.dataset.target), tip = leader.getPointAtLength(leader.getTotalLength());
              const local = new DOMPoint(tip.x, tip.y).matrixTransform(target.getCTM().inverse().multiply(leader.getCTM()));
              return { label: leader.id, hits: target.isPointInFill(local) || target.isPointInStroke(local), visible: target.getBoundingClientRect().width > 0 && getComputedStyle(target).opacity !== '0' };
            });
            const bracket = diagram.querySelector('#micro-cleft-bracket');
            const ends = [bracket.getPointAtLength(0), bracket.getPointAtLength(bracket.getTotalLength())];
            const surfaces = [diagram.querySelector('#micro-presynaptic'), diagram.querySelector('#micro-muscle').hasAttribute('hidden') ? diagram.querySelector('#micro-receiver') : diagram.querySelector('#micro-muscle path')];
            ends.forEach((point, i) => {
              const local = new DOMPoint(point.x, point.y).matrixTransform(surfaces[i].getCTM().inverse().multiply(bracket.getCTM()));
              hits.push({ label: 'cleft-surface-' + i, hits: surfaces[i].isPointInStroke(local), visible: true });
            });
            return hits;
          });
          assert.deepEqual(annotations.filter(a => !a.hits || !a.visible), [], `${width}/${site}/${step}: label missed its target`);
        }
        await page.locator('#close-synapse').click();
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('microscope pauses the main clock and preserves its progress, prediction and records', async () => {
    await setScenario('withdrawal'); await page.locator('[name=prediction-reflex][value=yes]').check();
    const records = await page.locator('#record-count').textContent();
    await page.locator('#run-button').click(); await page.waitForFunction(() => +document.getElementById('timeline-range').value > 50);
    await page.locator('#hotspot-sensory-inter').click();
    const progress = await page.locator('#timeline-range').inputValue();
    await page.locator('[data-micro-step="4"]').click(); await page.waitForTimeout(150);
    assert.equal(await page.locator('#timeline-range').inputValue(), progress); assert.equal(await page.locator('#record-count').textContent(), records);
    await page.locator('#close-synapse').click(); assert.equal(await page.locator('#play-status').textContent(), '已暫停');
    assert.equal(await page.locator('#timeline-range').inputValue(), progress);
    assert.equal(await page.locator('[name=prediction-reflex][value=yes]').isChecked(), true);
    await page.locator('#run-button').click(); await page.waitForFunction(p => +document.getElementById('timeline-range').value > +p, progress); await page.locator('#run-button').click();
  });
  await check('microscope pause, reset and backward scrub restore particles and responses', async () => {
    await page.locator('[data-open-synapse=sensory-inter]').click(); await page.locator('#micro-speed').selectOption('2'); await page.locator('#micro-play').click();
    await page.waitForFunction(() => +document.getElementById('micro-progress').value > 150);
    await page.locator('#micro-play').click(); const paused = await page.locator('#micro-progress').inputValue();
    await page.waitForTimeout(130); assert.equal(await page.locator('#micro-progress').inputValue(), paused);
    await page.locator('[data-micro-step="4"]').click();
    await page.locator('#micro-progress').evaluate(el => { el.value = 0; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('#micro-output-signal').getAttribute('opacity'), '0'); assert.equal(await page.locator('#micro-transmitters circle').count(), 0);
    await page.locator('#micro-reset').click(); assert.equal(await page.locator('#micro-progress').inputValue(), '0');
    await page.locator('#micro-play').click(); await page.locator('#close-synapse').click();
    await page.locator('[data-open-synapse=inter-motor]').click(); await page.waitForTimeout(130);
    assert.equal(await page.locator('#micro-progress').inputValue(), '0'); await page.locator('#close-synapse').click();
  });
  await check('micro animation completes in real time through diffusion, binding and response', async () => {
    await page.locator('[data-open-synapse=inter-motor]').click(); await page.locator('#micro-speed').selectOption('2'); await page.locator('#micro-play').click();
    await page.waitForFunction(() => document.getElementById('micro-next').disabled, { timeout: 8000 });
    assert.equal(await page.locator('#micro-progress').inputValue(), '5000'); assert.equal(await page.locator('#micro-output-signal').getAttribute('opacity'), '1');
    assert.equal(await page.locator('#micro-transmitters .bound').count(), 4); await page.locator('#close-synapse').click();
  });
  await check('damaged pathways get an honest context without changing experiment outcomes', async () => {
    await setScenario('withdrawal', 'motor'); await page.locator('[data-open-synapse=motor-muscle]').click();
    assert.match(await page.locator('#synapse-context-text').textContent(), /訊號未能到達/);
    await page.locator('[data-micro-step="4"]').click(); await page.locator('#close-synapse').click();
    assert.equal(await page.locator('#preset').inputValue(), 'motor'); await finish(); assert.deepEqual(await outcomes(), ['沒有 ×', '有 ✓', '本次未測']);
    await setScenario('withdrawal'); await finish(); await page.locator('[data-open-synapse=inter-motor]').click();
    assert.match(await page.locator('#synapse-context-text').textContent(), /訊號已到達/); await page.locator('#close-synapse').click();
  });
  await check('new teaching copy stays within textbook vocabulary for both junction types', async () => {
    for (const id of ['sensory-inter', 'motor-muscle']) {
      await page.locator('[data-open-synapse=' + id + ']').click();
      const copy = await page.locator('#synapse-dialog').textContent();
      assert.doesNotMatch(copy, /乙[酰醯]膽[鹼碱]|\bACh\b|鈣離子|Ca2|動作電位|閾值|去極化|胞吐|神經肌肉接點|運動終板/);
      for (const term of ['突觸小體', '突觸小泡', '神經遞質', '突觸間隙', '受體部位', '線粒體']) assert.ok(copy.includes(term));
      await page.locator('#close-synapse').click();
    }
  });
  await check('Escape closes only the microscope and returns keyboard focus in projection mode', async () => {
    await page.locator('#present-button').click(); const origin = page.locator('[data-open-synapse=sensory-inter]');
    await origin.click(); await page.keyboard.press('Escape'); assert.equal(await page.locator('#synapse-dialog').isVisible(), false);
    assert.equal(await page.locator('#present-button').getAttribute('aria-pressed'), 'true');
    assert.equal(await origin.evaluate(el => el === document.activeElement), true); await page.locator('#present-button').click();
  });
  await check('microscope fits mobile and tablet; only its diagram scrolls horizontally', async () => {
    for (const width of [375, 768]) {
      await page.setViewportSize({ width, height: 900 }); await page.locator('[data-open-synapse=motor-muscle]').click();
      assert.equal(await page.locator('#synapse-dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
      await page.locator('[data-micro-step="3"]').click(); assert.match(await page.locator('#micro-current-text').textContent(), /肌纖維上的受體部位/);
      await page.screenshot({ path: path.join(out, `microscope-${width}.png`) }); await page.locator('#close-synapse').click();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('mobile and tablet fit the viewport; the diagram alone can scroll horizontally', async () => {
    for (const width of [375, 768]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await setScenario('knee'); await finish();
      await page.screenshot({ path: path.join(out, `viewport-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('self-contained build works offline and makes no external requests', async () => {
    const offline = await browser.newContext({ offline: true }), offlinePage = await offline.newPage(); const fetched = [];
    // The managed cloud browser blocks all file:// navigation. Load the exact
    // generated bytes into an offline blank document, retaining that policy.
    offlinePage.on('request', r => fetched.push(r.url())); await offlinePage.setContent(fs.readFileSync(path.join(root, 'dist/reflex-arc.html'), 'utf8'));
    await offlinePage.locator('[data-mode=knee]').click(); await offlinePage.locator('#step-button').click();
    await offlinePage.locator('#timeline-range').evaluate(el => { el.value = '1000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await offlinePage.locator('#result-reflex').textContent(), '有 ✓');
    await offlinePage.locator('#hotspot-sensory-motor').click(); assert.match(await offlinePage.locator('#synapse-subtitle').textContent(), /感覺神經元 → 運動神經元/);
    await offlinePage.locator('[data-micro-step="4"]').click(); assert.equal(await offlinePage.locator('#micro-output-signal').getAttribute('opacity'), '1');
    await offlinePage.locator('#close-synapse').click(); await offlinePage.locator('[data-open-synapse=motor-muscle]').click();
    await offlinePage.locator('[data-micro-step="4"]').click();
    assert.equal(await offlinePage.locator('#micro-muscle-signal').getAttribute('opacity'), '1'); assert.equal(await offlinePage.locator('#micro-contraction').isVisible(), false);
    await offlinePage.locator('#micro-next').click(); assert.equal(await offlinePage.locator('#micro-contraction').isVisible(), true);
    assert.deepEqual(fetched, []); await offline.close();
  });
  await check('no browser exceptions or external runtime dependencies', async () => { assert.deepEqual(errors, []); assert.equal(requests.filter(url => !url.startsWith('http://127.0.0.1:4174')).length, 0); });
  console.log(`\n${checks} browser checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); server.kill(); });
