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
  browser = await launchChromium(['--no-sandbox', '--enable-webgl', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']);
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
  const scrubAt = async (milliseconds, offset) => {
    await page.locator('#cycle-scrub').evaluate((o, value) => {
      o.value = String(value);
      o.dispatchEvent(new Event('input'));
    }, milliseconds);
    await page.waitForFunction(
      (value) => document.querySelector('#cycle-readout').textContent.startsWith((value / 1000).toFixed(3)),
      milliseconds,
    );
    await page.waitForFunction(
      ({ home: baseline, offset: displacement }) =>
        ['forend', 'bolt-carrier'].every(
          (id) => Math.abs(globalThis.pumpWitness[id][0] - baseline[id][0] - displacement) < 1e-7,
        ),
      { home, offset },
    );
    const positions = await page.evaluate(() => globalThis.pumpWitness);
    samples.push({ milliseconds, positions });
  };
  // Sequential poses of one live scene; the forward leg must be hand-driven too.
  await scrubAt(500, -5.5);
  await scrubAt(900, -2.75);
  await scrubAt(1150, 0);
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
