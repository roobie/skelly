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
    await route.fulfill({
      response,
      body: source.replace(
        anchor,
        `const pumpPositions = {}; layers?.solids.traverse(o => { if (o.isMesh && ['forend','bolt-carrier'].includes(o.userData.part)) pumpPositions[o.userData.part] ??= o.matrix.elements.slice(12,15); }); globalThis.pumpWitness = pumpPositions; ${anchor}`,
      ),
    });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?design=archetype-pump-shotgun&cycle=fire`);
  await page.waitForSelector('#cycle-controls');
  await page.waitForFunction(() => globalThis.pumpWitness?.forend);
  assert.equal(await page.locator('#cycle-mode').inputValue(), 'hand');
  assert.equal(await page.locator('#cycle-mode option[value=fire]').evaluate((o) => o.disabled), true);
  assert.equal(await page.locator('#cycle-empty-label').isVisible(), false);
  const home = await page.evaluate(() => globalThis.pumpWitness);
  const samples = [];
  const scrubAt = async (milliseconds) => {
    await page.locator('#cycle-scrub').evaluate((o, value) => {
      o.value = String(value);
      o.dispatchEvent(new Event('input'));
    }, milliseconds);
    const positions = await page.evaluate(() => globalThis.pumpWitness);
    samples.push({ milliseconds, positions });
  };
  // Sample the live cycle at its owner-provided start, midpoint and end. Both coupled nodes
  // must travel rearward and return together without freezing authored timing or stroke tuning.
  const duration = Number(await page.locator('#cycle-scrub').getAttribute('max'));
  const step = Number(await page.locator('#cycle-scrub').getAttribute('step')) || 1;
  const at = (fraction) => Math.round((duration * fraction) / step) * step;
  await scrubAt(at(0.4));
  await scrubAt(at(0.7));
  await scrubAt(duration - step);
  for (const { positions } of samples) {
    for (const id of ['forend', 'bolt-carrier']) {
      assert(Math.abs(positions[id][0] - home[id][0] - (positions.forend[0] - home.forend[0])) < 1e-7);
    }
  }
  assert(samples.some(({ positions }) => positions.forend[0] < home.forend[0]));
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
