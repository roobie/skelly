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
import { pressAction } from './input-actions.mjs';
import { browserStageArgs, browserStageUrl } from './stage-mode.mjs';

const root = resolvePath(fileURLToPath(new URL('../..', import.meta.url)));
const { createServer } = await import(pathToFileURL(`${root}/node_modules/vite/dist/node/index.js`));
const { chromium } = await import(pathToFileURL(`${root}/node_modules/playwright/index.mjs`));
const { decodeSave } = await import(pathToFileURL(`${root}/src/core/saveFormat.ts`));
const observation = {
  name: 'save-controller-game-ready',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/game/play.ts')) {
      return;
    }
    const marker = '  startPlayFrames(frame);';
    assert(code.includes(marker), 'game-ready observation point exists');
    return code.replace(marker, `  Object.assign(globalThis, { saveControllerPlayStarted: true });\n${marker}`);
  },
};
const server = await createServer({
  root,
  configFile: `${root}/vite.config.ts`,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [observation],
});
await server.listen();
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_BIN ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,
  headless: true,
  args: browserStageArgs('save-controller-regressions'),
});
const address = server.httpServer.address();
assert(address && typeof address !== 'string');
const url = browserStageUrl(
  'save-controller-regressions',
  `http://127.0.0.1:${address.port}/?seed=73&radius=32&site=testHouse&actors=boxes&post=0&sunshadow=0&torchshadow=0&save-test=1&save-backend=indexeddb`,
);
const QUOTA_ERROR = /quota regression/i;
const BEST_EFFORT = /best.effort/i;
const PERSISTENCE_GRANTED = /Persistent storage granted/;
const PERSISTENT_BACKEND = /Persistent indexeddb/;
const CURRENT_EXPORT = /^deadvox-current-.*\.bin$/;
const BASE_MISMATCH = /Generated base mismatch/;

try {
  await test('persistence button alone requests once and updates status after an unavailable startup query', async () => {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    try {
      await context.addInitScript(() => {
        globalThis.persistenceRequests = 0;
        Object.defineProperties(navigator.storage, {
          persisted: { configurable: true, value: () => Promise.reject(new Error('query unavailable')) },
          persist: {
            configurable: true,
            value: () => {
              globalThis.persistenceRequests += 1;
              return Promise.resolve(true);
            },
          },
        });
      });
      const page = await context.newPage();
      await page.goto(url);
      await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, { timeout: 30_000 });
      const button = page.locator('#save-persist');
      assert.equal(await button.isVisible(), true, 'request remains reachable when state is unknown and API exists');
      assert.match(await page.locator('#save-status').textContent(), BEST_EFFORT);
      assert.equal(await page.evaluate(() => globalThis.persistenceRequests), 0);
      await button.click();
      await page.waitForFunction(() =>
        document.querySelector('#save-status').textContent.includes('Persistent storage granted'),
      );
      assert.equal(
        await page.evaluate(() => globalThis.persistenceRequests),
        1,
        'one player click makes one native API call',
      );
      assert.equal(await button.isVisible(), false, 'granted status removes the request button');
      assert.equal(await page.evaluate(() => globalThis.deadvoxSaveTest.controller.storageStatus.persistent), true);
      assert.equal(
        await page.evaluate(async () => (await globalThis.deadvoxSaveTest.storage.status()).persistent),
        true,
      );
    } finally {
      await context.close();
    }
  });

  await test('explicit persistence grant survives a click before the first storage status', async () => {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    try {
      await context.addInitScript(() => {
        globalThis.persistenceRequests = 0;
        globalThis.persistenceQueries = 0;
        Object.defineProperties(navigator.storage, {
          persisted: {
            configurable: true,
            value: () => {
              globalThis.persistenceQueries += 1;
              return Promise.reject(new Error('query unavailable'));
            },
          },
          persist: {
            configurable: true,
            value: () => {
              globalThis.persistenceRequests += 1;
              return Promise.resolve(true);
            },
          },
        });
        const digest = crypto.subtle.digest.bind(crypto.subtle);
        let holdFirstDigest = true;
        crypto.subtle.digest = (...args) => {
          if (!holdFirstDigest) {
            return digest(...args);
          }
          holdFirstDigest = false;
          return new Promise((resolve, reject) => {
            globalThis.releasePersistenceIdentity = () => digest(...args).then(resolve, reject);
          });
        };
      });
      const page = await context.newPage();
      await page.goto(url);
      await page.waitForFunction(() => typeof globalThis.releasePersistenceIdentity === 'function');
      const button = page.locator('#save-persist');
      assert.equal(await button.isVisible(), true, 'unknown-state action remains available during discovery');
      assert.equal(await button.isEnabled(), true);
      assert.equal(await page.evaluate(() => globalThis.persistenceQueries), 0, 'advisory status has not started');
      assert.equal(await page.evaluate(() => globalThis.persistenceRequests), 0);
      await button.click();
      await page.waitForFunction(() =>
        document.querySelector('#save-status').textContent.includes('Persistent storage granted'),
      );
      assert.equal(await page.evaluate(() => globalThis.persistenceRequests), 1);
      assert.match(await page.locator('#save-status').textContent(), PERSISTENCE_GRANTED);
      assert.equal(await button.isVisible(), false, 'explicit grant is retained before discovery completes');
      await page.evaluate(() => globalThis.releasePersistenceIdentity());
      await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, { timeout: 30_000 });
      assert.equal(await page.evaluate(() => globalThis.persistenceRequests), 1, 'discovery never requests again');
      assert.equal(await page.evaluate(() => globalThis.persistenceQueries), 1);
      assert.equal(await button.isVisible(), false, 'discovery cannot make a granted action visible again');
      assert.match(await page.locator('#save-status').textContent(), PERSISTENT_BACKEND);
      assert.equal(await page.evaluate(() => globalThis.deadvoxSaveTest.controller.storageStatus.persistent), true);
      assert.equal(
        await page.evaluate(async () => (await globalThis.deadvoxSaveTest.storage.status()).persistent),
        true,
      );
    } finally {
      await context.close();
    }
  });

  await test('title, two-hour checkpoint, and visible save-failure recovery', async () => {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    const before = await page.evaluate(() => ({
      hasSnapshot: typeof deadvoxSaveTest.controller.snapshot === 'function',
      entered: deadvoxSaveTest.controller.isEntered,
    }));
    assert.deepEqual(before, { hasSnapshot: false, entered: false });
    await pressAction(page, 'ui.inventory-toggle');
    await pressAction(page, 'movement.forward');
    await page.keyboard.press('F10');
    const after = await page.evaluate(() => ({
      hasSnapshot: typeof deadvoxSaveTest.controller.snapshot === 'function',
      entered: deadvoxSaveTest.controller.isEntered,
      overlayHidden: document.querySelector('#overlay').hidden,
    }));
    assert.equal(after.entered, false);
    assert.equal(after.hasSnapshot, false, 'title keys cannot construct a session');
    assert.equal(after.overlayHidden, false);

    await page.click('#go');
    await page.waitForFunction(() => globalThis.saveControllerPlayStarted === true);
    const schedule = await page.evaluate(async () => {
      const { controller } = deadvoxSaveTest;
      let time = 0;
      let writes = 0;
      const measuredDurations = [];
      controller.storage.save = () => {
        writes += 1;
        return { generation: writes, slot: 'a', backend: 'indexeddb' };
      };
      const bindAtCurrentTime = () =>
        controller.bindSession(controller.snapshot, () => time, controller.worldOptions, {
          recordSnapshotDuration: (durationMs) => measuredDurations.push(durationMs),
        });
      bindAtCurrentTime();
      const samples = [];
      for (time of [899.999, 900, 1800]) {
        controller.afterFrame();
        await new Promise((resolve) => setTimeout(resolve, 0));
        samples.push(writes);
      }
      time = 900;
      bindAtCurrentTime();
      for (time of [1799, 1800]) {
        controller.afterFrame();
        await new Promise((resolve) => setTimeout(resolve, 0));
        samples.push(writes);
      }
      time = 0;
      bindAtCurrentTime();
      time = 950; // the debug clock moved past the scheduled 900-second checkpoint
      controller.rearmAutosaveAfterTimeSeek();
      const afterSeek = [];
      for (time of [950, 1799, 1800, 1801]) {
        controller.afterFrame();
        await new Promise((resolve) => setTimeout(resolve, 0));
        afterSeek.push(writes);
      }
      return { samples, afterSeek, measuredDurations };
    });
    assert.deepEqual(schedule.samples, [0, 1, 2, 2, 3]);
    assert.deepEqual(schedule.afterSeek, [3, 3, 4, 4]);
    assert.equal(schedule.measuredDurations.length, 4);
    assert.ok(schedule.measuredDurations.every((duration) => Number.isFinite(duration) && duration >= 0));

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

    await page.keyboard.press('Escape');
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForFunction(() => !document.pointerLockElement);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#save-export-current')]);
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

  await test('retry saves the latest capture rather than restoring an older failed snapshot', async () => {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.click('#go');
    await page.waitForFunction(() => globalThis.saveControllerPlayStarted === true);

    const race = await page.evaluate(async () => {
      const { controller, storage } = deadvoxSaveTest;
      const realSave = Object.getPrototypeOf(storage).save.bind(storage);
      const sourceSnapshot = controller.snapshot;
      let health = 90;
      let time = 0;
      let calls = 0;
      let releaseSecond;
      const secondWrite = new Promise((resolve) => {
        releaseSecond = resolve;
      });
      const latestSnapshot = () => {
        const snapshot = structuredClone(sourceSnapshot());
        snapshot.character.simulation.needs.health = health;
        return snapshot;
      };
      controller.bindSession(latestSnapshot, () => time, controller.worldOptions);
      storage.save = async (saveNamespace, encode) => {
        calls += 1;
        const call = calls;
        if (call === 1) {
          throw new DOMException('retry race quota', 'QuotaExceededError');
        }
        if (call === 2) {
          await secondWrite;
        }
        return realSave(saveNamespace, encode);
      };

      controller.beforeSleep();
      for (let attempt = 0; controller.writing && attempt < 200; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      health = 60;
      time = 1;
      controller.beforeSleep();
      for (let attempt = 0; calls < 2 && attempt < 200; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      health = 30;
      time = 2;
      controller.beforeSleep();
      const queuedBeforeRetry = controller.queued.snapshot.character.simulation.needs.health;
      globalThis.deadvoxRetryRace = { releaseSecond };
      return { queuedBeforeRetry };
    });

    await page.keyboard.press('Escape');
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForFunction(() => !document.pointerLockElement);
    await page.click('#save-retry');
    const retryState = await page.evaluate(() => ({
      failure: deadvoxSaveTest.controller.failure,
      queuedHealth: deadvoxSaveTest.controller.queued.snapshot.character.simulation.needs.health,
    }));
    assert.equal(retryState.failure, '');
    assert.equal(retryState.queuedHealth, 30);
    await page.evaluate(() => {
      globalThis.deadvoxRetryRace.releaseSecond();
      globalThis.deadvoxRetryRace = undefined;
    });
    await page.waitForFunction(
      () => !(deadvoxSaveTest.controller.writing || deadvoxSaveTest.controller.queued),
      undefined,
      { timeout: 30_000 },
    );
    const saved = await page.evaluate(async () => {
      const { controller, storage, namespace } = deadvoxSaveTest;
      const loaded = await storage.load(namespace);
      return {
        payload: Array.from(loaded.payload),
        identity: controller.identityValue.components,
      };
    });
    const decoded = await decodeSave(Uint8Array.from(saved.payload), {
      version: saved.identity,
      contentLookup: () => true,
    });
    assert.equal(race.queuedBeforeRetry, 30);
    assert.equal(decoded.snapshot.character.simulation.needs.health, 30);
    assert.deepEqual(pageErrors, []);
    await context.close();
  });

  await test('actual Continue refuses a generated-base mismatch and reloads with a recovery diagnosis', async () => {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.click('#go');
    await page.waitForFunction(() => globalThis.saveControllerPlayStarted === true);
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
    let refusalReload;
    const nextReload = new Promise((resolve, reject) => {
      let navigations = 0;
      const onNavigation = (frame) => {
        if (frame === page.mainFrame()) {
          navigations += 1;
          if (navigations === 2) {
            clearTimeout(refusalReload);
            page.off('framenavigated', onNavigation);
            resolve();
          }
        }
      };
      page.on('framenavigated', onNavigation);
      refusalReload = setTimeout(() => {
        page.off('framenavigated', onNavigation);
        reject(new Error('saved-world refusal did not reload to the recovery title'));
      }, 30_000);
    });
    await Promise.all([page.waitForNavigation(), page.click('#continue')]);
    await nextReload;
    await page.waitForFunction(
      () => {
        const saveTest = globalThis.deadvoxSaveTest;
        const status = document.querySelector('#save-status')?.textContent ?? '';
        return (
          saveTest?.controller.ready &&
          status.includes('Saved world unreadable and left untouched') &&
          sessionStorage.getItem(`deadvox.restore-refusal:${saveTest.namespace}`)
        );
      },
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
