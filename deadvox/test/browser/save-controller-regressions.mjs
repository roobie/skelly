// biome-ignore-all lint/correctness/noNodejsModules: standalone browser regression contract
// biome-ignore-all lint/performance/noAwaitInLoops: frame thresholds are deliberately exercised in order
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node test contract
// biome-ignore-all lint/style/noProcessEnv: browser executable and runtime are configured by the test runner
// biome-ignore-all lint/correctness/noUndeclaredVariables: page.evaluate callbacks run in the browser context

import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolvePath(fileURLToPath(new URL('../..', import.meta.url)));
const { build, preview } = await import(pathToFileURL(`${root}/node_modules/vite/dist/node/index.js`));
const { chromium } = await import(pathToFileURL(`${root}/node_modules/playwright/index.mjs`));
await build({ root, configFile: `${root}/vite.config.ts`, logLevel: 'error' });
const server = await preview({ root, configFile: `${root}/vite.config.ts`, preview: { host: '127.0.0.1', port: 0 } });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_BIN ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const address = server.httpServer.address();
assert(address && typeof address !== 'string');
const url = `http://127.0.0.1:${address.port}/?seed=73&save-test=1&save-backend=indexeddb`;
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const QUOTA_ERROR = /quota regression/i;
const CURRENT_EXPORT = /^deadvox-current-.*\.bin$/;
const BASE_MISMATCH = /Generated base mismatch/;

try {
  await test('title, two-hour checkpoint, and visible save-failure recovery', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, { timeout: 30_000 });
    await page.waitForSelector('#view canvas');

    const before = await page.evaluate(() => ({
      time: deadvoxSaveTest.controller.snapshot().character.simulation.time,
      entered: deadvoxSaveTest.controller.isEntered,
    }));
    await page.keyboard.press('Tab');
    await page.keyboard.press('w');
    await page.keyboard.press('F10');
    await delay(500);
    const after = await page.evaluate(() => ({
      time: deadvoxSaveTest.controller.snapshot().character.simulation.time,
      entered: deadvoxSaveTest.controller.isEntered,
      overlayHidden: document.querySelector('#overlay').hidden,
    }));
    assert.equal(after.entered, false);
    assert.equal(after.time, before.time);
    assert.equal(after.overlayHidden, false);

    await page.click('#go');
    const schedule = await page.evaluate(async () => {
      const { controller } = deadvoxSaveTest;
      let time = 0;
      let writes = 0;
      controller.storage.save = () => {
        writes += 1;
        return { generation: writes, slot: 'a', backend: 'indexeddb' };
      };
      controller.bindSession(controller.snapshot, () => time, controller.worldOptions);
      const samples = [];
      for (time of [899.999, 900, 1800]) {
        controller.afterFrame();
        await new Promise((resolve) => setTimeout(resolve, 0));
        samples.push(writes);
      }
      time = 900;
      controller.bindSession(controller.snapshot, () => time, controller.worldOptions);
      for (time of [1799, 1800]) {
        controller.afterFrame();
        await new Promise((resolve) => setTimeout(resolve, 0));
        samples.push(writes);
      }
      return samples;
    });
    assert.deepEqual(schedule, [0, 1, 2, 2, 3]);

    await page.evaluate(async () => {
      const { controller } = deadvoxSaveTest;
      controller.storage.save = () => Promise.reject(new DOMException('quota regression', 'QuotaExceededError'));
      controller.beforeSleep();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const failure = await page.evaluate(() => ({
      text: document.querySelector('#save-recovery-message').textContent,
      visible: document.querySelector('#save-recovery').checkVisibility(),
      retryHidden: document.querySelector('#save-retry').hidden,
      exportHidden: document.querySelector('#save-export-current').hidden,
    }));
    assert.match(failure.text, QUOTA_ERROR);
    assert.equal(failure.visible, true);
    assert.equal(failure.retryHidden, false);
    assert.equal(failure.exportHidden, false);

    const downloadPromise = page.waitForEvent('download');
    await page.click('#save-export-current');
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), CURRENT_EXPORT);
    assert.ok((await stat(await download.path())).size > 0);

    await page.evaluate(() => {
      deadvoxSaveTest.controller.storage.save = async () => ({ generation: 99, slot: 'a', backend: 'indexeddb' });
    });
    await page.click('#save-retry');
    await page.waitForFunction(
      () => !deadvoxSaveTest.controller.failure && deadvoxSaveTest.controller.savedGeneration === 99,
    );
    assert.deepEqual(pageErrors, []);
    await context.close();
  });

  await test('actual Continue refuses a generated-base mismatch and reloads with a recovery diagnosis', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, { timeout: 30_000 });
    await page.waitForSelector('#view canvas');
    await page.click('#go');
    await page.evaluate(async () => {
      const { controller, storage, namespace } = deadvoxSaveTest;
      const snapshot = structuredClone(controller.snapshot());
      const { pos } = snapshot.character.player.body;
      snapshot.world.diffs.chunks = [
        {
          cx: Math.floor(pos[0] / 32),
          cy: -3,
          cz: Math.floor(pos[2] / 32),
          cells: [{ index: 0, base: 'air', id: 'stone' }],
        },
      ];
      await storage.save(namespace, (generation) =>
        storage.encodeSnapshot(snapshot, generation, {
          worldOptions: controller.worldOptions,
          version: controller.identityValue.components,
          buildRevision: controller.identityValue.buildRevision,
        }),
      );
      controller.entered = false;
    });

    await page.reload();
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, { timeout: 30_000 });
    await page.waitForFunction(() => !document.querySelector('#continue').disabled, undefined, { timeout: 30_000 });
    await Promise.all([page.waitForNavigation(), page.click('#continue')]);
    await page.waitForFunction(
      () =>
        (document.querySelector('#save-status').textContent ?? '').includes(
          'Saved world unreadable and left untouched',
        ),
      undefined,
      { timeout: 30_000 },
    );
    const state = await page.evaluate(() => ({
      status: document.querySelector('#save-status').textContent,
      disabled: document.querySelector('#continue').disabled,
      refusal: sessionStorage.getItem(`deadvox.restore-refusal:${deadvoxSaveTest.namespace}`),
    }));
    assert.match(state.status, BASE_MISMATCH);
    assert.equal(state.disabled, true);
    assert.match(state.refusal, BASE_MISMATCH);
    assert.deepEqual(pageErrors, []);
    await context.close();
  });
} finally {
  await browser.close();
  await server.close();
}
