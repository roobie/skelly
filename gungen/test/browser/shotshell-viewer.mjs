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
  browser = await launchChromium([
    '--no-sandbox',
    '--enable-webgl',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
  ]);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/?design=archetype-pump-shotgun&ammo=12-gauge-00-buck`,
  );
  await page.waitForSelector('#ammo-info');
  const ammoInfo = await page.locator('#ammo-info').innerText();
  assert.match(ammoInfo, /proxy.*unknown/i, 'unknown closure is disclosed as a visual proxy');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ammoInfo, errors }));
  console.log('PASS: actual viewer startup renders loaded shotshell and open hull with labelled proxy');
} finally {
  await browser?.close();
  await server.close();
}
