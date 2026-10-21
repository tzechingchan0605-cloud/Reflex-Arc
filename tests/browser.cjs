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
    assert.equal(await offlinePage.locator('#result-reflex').textContent(), '有 ✓'); assert.deepEqual(fetched, []); await offline.close();
  });
  await check('no browser exceptions or external runtime dependencies', async () => { assert.deepEqual(errors, []); assert.equal(requests.filter(url => !url.startsWith('http://127.0.0.1:4174')).length, 0); });
  console.log(`\n${checks} browser checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); server.kill(); });
