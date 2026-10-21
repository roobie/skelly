// Actual viewer: pump has only a hand cycle, and the visible forend and carrier share both legs.
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from '../chromium.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await launchChromium([
    '--no-sandbox',
    '--enable-webgl',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
  ]);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/src/viewer/main.ts*', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const anchor = 'renderer.render(scene, camera);';
    assert.ok(source.includes(anchor));
    const cycleAnchor = 'cycleView.bind(';
    assert.ok(source.includes(cycleAnchor));
    const cycleWitness = `globalThis.pumpCycleWitness = action?.kind === 'pump' ? (() => { const timeline = action.cycle.hand; const times = [timeline.rearwardSeconds / 2, timeline.rearwardSeconds + timeline.dwellSeconds / 2, timeline.rearwardSeconds + timeline.dwellSeconds + timeline.forwardSeconds / 2, timeline.durationSeconds - (timeline.durationSeconds - timeline.rearwardSeconds - timeline.dwellSeconds - timeline.forwardSeconds) / 2]; return { samples: times.map(seconds => ({ milliseconds: Math.round(seconds * 1000), fraction: timeline.at(seconds) })), parts: Object.fromEntries(Object.entries(action.parts).map(([role, part]) => [role, { id: part.id, travel: part.travel }])) }; })() : null; `;
    await route.fulfill({
      response,
      body: source
        .replace(cycleAnchor, cycleWitness + cycleAnchor)
        .replace(
          anchor,
          `const pumpPositions = {}; layers?.solids.traverse(o => { if (o.isMesh && ['forend','bolt-carrier'].includes(o.userData.part)) pumpPositions[o.userData.part] ??= o.matrix.elements.slice(12,15); }); globalThis.pumpWitness = pumpPositions; ${anchor}`,
        ),
    });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?design=archetype-pump-shotgun&cycle=fire`);
  await page.waitForSelector('#cycle-controls');
  await page.waitForFunction(() => globalThis.pumpWitness?.forend && globalThis.pumpCycleWitness?.samples);
  assert.equal(await page.locator('#cycle-mode').inputValue(), 'hand');
  assert.equal(await page.locator('#cycle-mode option[value=fire]').evaluate((o) => o.disabled), true);
  assert.equal(await page.locator('#cycle-empty-label').isVisible(), false);
  const { home, cycle } = await page.evaluate(() => ({
    home: globalThis.pumpWitness,
    cycle: globalThis.pumpCycleWitness,
  }));
  const samples = [];
  const scrubAt = async ({ milliseconds, fraction }) => {
    await page.locator('#cycle-scrub').evaluate((o, value) => {
      o.value = String(value);
      o.dispatchEvent(new Event('input'));
    }, milliseconds);
    // The frame loop updates the intercepted render witness after the input handler applies the pose.
    await page.waitForFunction(
      ({ baseline, parts, expected }) =>
        Object.values(parts).every(
          ({ id, travel }) => Math.abs(globalThis.pumpWitness[id][0] - (baseline[id][0] + travel[0] * expected)) < 1e-7,
        ),
      { baseline: home, parts: cycle.parts, expected: fraction },
    );
    samples.push({ milliseconds, fraction, positions: await page.evaluate(() => globalThis.pumpWitness) });
  };
  await scrubAt(cycle.samples[0]);
  await scrubAt(cycle.samples[1]);
  await scrubAt(cycle.samples[2]);
  await scrubAt(cycle.samples[3]);
  assert(samples[0].fraction > 0 && samples[0].fraction < samples[1].fraction, 'rearward leg advances');
  assert.equal(samples[1].fraction, 1, 'rear dwell reaches the full owner stroke');
  assert(samples[2].fraction > samples[3].fraction && samples[3].fraction === 0, 'forward leg returns home');
  await page.locator('#cycle-play').click();
  await page.waitForFunction((baseline) => Math.abs(globalThis.pumpWitness.forend[0] - baseline.forend[0]) > 0.1, home);
  await page.locator('#cycle-play').click();
  assert.match(await page.locator('#status').innerText(), /^PASS/);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ home, samples, errors }));
  console.log('PASS: actual pump hand controls move the coupled nodes on both legs, never a fire timeline');
} finally {
  await browser?.close();
  await server.close();
}
