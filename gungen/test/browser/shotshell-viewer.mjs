// Actual startup/render regression: the cartridge selector must admit shotshells, not just metallic data.
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
    const witness =
      'globalThis.shotshellWitness = ammoMeshes ? { loaded: ammoMeshes.loose.children.map(c => c.name), fired: ammoMeshes.fired.children.map(c => c.name), inScene: ammoMeshes.loose.parent === scene && ammoMeshes.fired.parent === scene } : null;';
    await route.fulfill({ response, body: source.replace(anchor, witness + anchor) });
  });
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/?design=archetype-pump-shotgun&ammo=12-gauge-00-buck`,
  );
  await page.waitForSelector('#ammo-info');
  await page.waitForFunction(() => globalThis.shotshellWitness);
  assert.match(await page.locator('#ammo-info').innerText(), /62\.23 mm; fired 70\.1 mm.*Roll-crimp visual proxy/);
  const witness = await page.evaluate(() => globalThis.shotshellWitness);
  assert.deepEqual(witness, { loaded: ['head', 'hull', 'closure-card'], fired: ['head', 'hull'], inScene: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ witness, errors }));
  console.log('PASS: actual viewer startup renders loaded shotshell and open hull with labelled proxy');
} finally {
  await browser?.close();
  await server.close();
}
