// Actual startup/render regression: the cartridge selector must admit shotshells, not just metallic data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from '../chromium.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cartridge = JSON.parse(readFileSync(resolve(root, 'cartridges/12-gauge-00-buck.json'), 'utf8'));
const closure = cartridge.closure.value ?? 'unknown';
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
    const witness =
      'globalThis.shotshellWitness = ammoMeshes ? { loaded: ammoMeshes.loose.children.map(c => c.name), fired: ammoMeshes.fired.children.map(c => c.name), inScene: ammoMeshes.loose.parent === scene && ammoMeshes.fired.parent === scene } : null;';
    await route.fulfill({ response, body: source.replace(anchor, witness + anchor) });
  });
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/?design=archetype-pump-shotgun&ammo=12-gauge-00-buck`,
  );
  await page.waitForSelector('#ammo-info');
  await page.waitForFunction(() => globalThis.shotshellWitness);
  assert.equal(await page.locator('#ammo-info').getAttribute('data-closure'), closure);
  const witness = await page.evaluate(() => globalThis.shotshellWitness);
  assert.equal(witness.inScene, true);
  assert(witness.loaded.includes('hull'));
  assert(witness.fired.includes('hull'));
  assert(witness.loaded.length > witness.fired.length);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ witness, closure, errors }));
  console.log('PASS: viewer startup renders the loaded and fired shotshell hulls and exposes closure state');
} finally {
  await browser?.close();
  await server.close();
}
