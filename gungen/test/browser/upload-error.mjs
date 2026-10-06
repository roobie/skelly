// Browser regression check (not wired into CI: gungen has no browser-test runner; deadvox owns Playwright).
// A failed JSON open must be visible: the issues button goes to an error state, the message is reachable in
// the overlay, and the last good model stays displayed.
//
//   CHROME_BIN=/path/to/chrome node gungen/test/browser/upload-error.mjs
//
// Needs deadvox's node_modules (npm ci --prefix deadvox) for Playwright. CHROME_BIN is optional if Playwright's
// own browser is installed.
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const gungen = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = await import(resolve(gungen, '../deadvox/node_modules/playwright/index.mjs'));

const server = await createServer({ root: gungen, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}/?fixture=archetype-ar`);
  await page.waitForSelector('#param-panel .param-part');

  const button = page.locator('#issues-btn');
  const overlay = page.locator('#issues-overlay');
  assert.equal((await button.textContent()).trim(), 'Issues: 0');
  assert(await overlay.isHidden());
  const cardsBefore = await page.locator('#param-panel .param-part').count();

  await page.locator('#file').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  });
  await page.waitForFunction(() => document.querySelector('#issues-notice').textContent.includes('Could not read'));

  assert.match(await button.textContent(), /^\s*✖ Could not read file\s*$/);
  assert(await overlay.isVisible(), 'overlay opens on the error');
  assert.match(await page.locator('#issues-notice').textContent(), /Could not read broken\.json: invalid JSON/);
  assert.equal(await page.locator('#param-panel .param-part').count(), cardsBefore, 'last good model stays displayed');

  // A later good load clears the error state.
  await page.keyboard.press('Escape');
  await page.locator('#next-seed').click();
  await page.waitForFunction(() => !document.querySelector('#issues-btn').textContent.includes('Could not read'));
  assert.equal(await page.locator('#issues-notice').textContent(), '');

  // Keyboard: Enter on the button moves focus into the overlay; Escape returns it.
  await button.focus();
  await page.keyboard.press('Enter');
  assert(await overlay.isVisible());
  assert.equal(await page.evaluate(() => document.activeElement.id), 'issues-overlay');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'issues-btn');
  assert.equal(errors.length, 0, errors.join('; '));
  console.log('PASS: failed open is visible on the issues button and in the overlay; last good model kept');
} finally {
  await browser.close();
  await server.close();
}
