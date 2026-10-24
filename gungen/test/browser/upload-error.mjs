// A failed JSON open must be visible: the issues button goes to an error state, the message is reachable in
// the overlay, and the last good model stays displayed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from '../chromium.mjs';

const gungen = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const server = await createServer({ root: gungen, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await launchChromium(['--no-sandbox']);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}/?fixture=archetype-ar`);
  await page.waitForSelector('#param-panel .param-part');

  const button = page.locator('#issues-btn');
  const overlay = page.locator('#issues-overlay');
  assert.match((await button.textContent()).trim(), /^Issues: \d+$/);
  assert(await overlay.isHidden());
  const cardsBefore = await page.locator('#param-panel .param-part').count();

  await page.locator('#file').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  });
  await page.waitForFunction(() => document.querySelector('#issues-notice').textContent.length > 0);

  assert.match(await button.textContent(), /^\s*✖/);
  assert(await overlay.isVisible(), 'overlay opens on the error');
  assert((await page.locator('#issues-notice').textContent()).length > 0);
  assert.equal(await page.locator('#param-panel .param-part').count(), cardsBefore, 'last good model stays displayed');

  // A later good load clears the error state.
  await page.keyboard.press('Escape');
  await page.locator('#next-seed').click();
  await page.waitForFunction(() => !document.querySelector('#issues-btn').textContent.trim().startsWith('✖'));
  assert.equal(await page.locator('#issues-notice').textContent(), '');

  // Keyboard: Enter on the button moves focus into the overlay; Escape returns it.
  await button.focus();
  await page.keyboard.press('Enter');
  assert(await overlay.isVisible());
  assert.equal(await page.evaluate(() => document.activeElement.id), 'issues-overlay');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'issues-btn');
  // Keep authoring persistence and the domain views in this existing smoke flow.
  const design = JSON.parse(readFileSync(resolve(gungen, 'designs/archetype-ar.json'), 'utf8'));
  await page.goto(`${url}/?design=archetype-ar&ammo=${encodeURIComponent(design.calibre)}`);
  await page.waitForSelector('#param-panel select[aria-label$="part item"]');
  assert(await page.locator('#ammo-info').isVisible(), 'cartridge preview is present');
  assert(await page.locator('#cycle-controls').isVisible(), 'gun cycle adapter is present');
  const cycleBefore = await page.locator('#cycle-readout').textContent();
  await page.locator('#cycle-scrub').evaluate((input) => {
    input.value = String(Number(input.max) / 2);
    input.dispatchEvent(new Event('input'));
  });
  assert.notEqual(await page.locator('#cycle-readout').textContent(), cycleBefore);

  const selected = page.locator('select[aria-label$="part item"]').first();
  const pickerLabel = await selected.getAttribute('aria-label');
  const itemId = await selected.inputValue();
  assert(itemId, 'loaded design has an authored item selection');
  const picker = page.getByLabel(pickerLabel, { exact: true });
  const card = page.locator('.param-part').filter({ has: picker });
  await card.locator('.param-values button:not(.active)').first().click();
  assert.equal(await picker.inputValue(), '', 'construction edits detach item identity');
  await picker.selectOption(itemId);
  assert.equal(await picker.inputValue(), itemId, 'catalogue picker restores canonical construction');
  await card.locator('.param-head .lock-toggle').first().click();

  const readDownload = async (download) => {
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };
  const saving = page.waitForEvent('download');
  await page.locator('#save').click();
  const saved = await readDownload(await saving);
  const persisted = JSON.parse(saved.toString());
  const partId = pickerLabel.slice(0, -' part item'.length);
  assert.equal(persisted.assembly.parts[partId].item, itemId);
  assert(
    Object.values(persisted.locks.params).some((names) => names.length > 0),
    'deliberate edit is saved',
  );
  await page.locator('#file').setInputFiles({ name: 'saved-design.json', mimeType: 'application/json', buffer: saved });
  await page.waitForFunction(() => document.querySelector('#fixture option:checked').value === '');
  assert.equal(await picker.inputValue(), itemId, 'reload preserves catalogue selection');
  assert(
    (await card.locator('.param-head .lock-toggle[aria-pressed="true"]').count()) > 0,
    'reload preserves the edit',
  );
  const exporting = page.waitForEvent('download');
  await page.locator('#export').click();
  const glb = await readDownload(await exporting);
  assert.equal(glb.toString('ascii', 0, 4), 'glTF');
  assert.equal(glb.readUInt32LE(8), glb.length);
  assert.equal(errors.length, 0, errors.join('; '));
  console.log('PASS: failed open is visible on the issues button and in the overlay; last good model kept');
} finally {
  await browser.close();
  await server.close();
}
