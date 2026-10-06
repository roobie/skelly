// Actual DOM regression: identity-only pump renames must not hide the at-rest validation/export warning.
// Uses Deadvox's Playwright install, like upload-error.mjs. CHROME_BIN selects an installed Chromium.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const gungen = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = await import(resolve(gungen, '../deadvox/node_modules/playwright/index.mjs'));
const rename = (id) => ({ receiver: 'housing', 'bolt-carrier': 'slide', forend: 'pump-grip' })[id] ?? id;
const endpoint = (value) =>
  value
    .split('.')
    .map((part, index) => (index === 0 ? rename(part) : part))
    .join('.');
const original = JSON.parse(readFileSync(resolve(gungen, 'fixtures/archetype-pump-shotgun.json'), 'utf8'));
const assembly = {
  ...original,
  name: 'Renamed pump pose regression',
  root: rename(original.root),
  parts: Object.fromEntries(Object.entries(original.parts).map(([id, part]) => [rename(id), part])),
  connections: original.connections.map((connection) => ({
    ...connection,
    from: endpoint(connection.from),
    to: endpoint(connection.to),
  })),
};
const warning = /view-only full-rearward pump pose; validation and export remain at rest/;
const server = await createServer({ root: gungen, server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/?fixture=archetype-pump-shotgun&pose=action-open`,
  );
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('PASS'));
  assert.match(await page.locator('#status').innerText(), warning, 'canonical pump control');
  await page.locator('#file').setInputFiles({
    name: 'renamed-pump.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(assembly)),
  });
  // Wait for the renamed assembly's actual parameter cards, not the previous model's PASS status.
  await page.waitForFunction(() => document.querySelector('#param-panel').textContent.includes('pump-grip'));
  const status = await page.locator('#status').innerText();
  console.log(JSON.stringify({ status, errors }));
  assert.match(status, /^PASS/);
  assert.match(status, warning, 'renamed pump must still display the view-only warning');
  assert.deepEqual(errors, []);
  console.log('PASS: actual pump pose indication survives receiver/carrier/forend identity-only renames');
} finally {
  await browser?.close();
  await server.close();
}
