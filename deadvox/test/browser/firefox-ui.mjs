// Headed Firefox UI contract under Xvfb. Pointer lock is explicitly SYNTHETIC:
// this keeps menu/inventory coverage independent of the quarantined native gesture (#168).
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node browser contract
import assert from 'node:assert/strict';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { pressAction } from './input-actions.mjs';
import { dispatchMenuPointerMove } from './menu-pointer.mjs';
import { browserStageUrl } from './stage-mode.mjs';

const { firefox } = await import('playwright');
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const observation = {
  name: 'firefox-ui-session-observation',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/game/play.ts')) {
      return;
    }
    const marker = '  const onForwardPress = (e: MouseEvent) => {';
    assert(code.includes(marker), 'game-loop observation point exists');
    return code.replace(
      marker,
      `  Object.assign(globalThis, { firefoxUiTest: { session, input, registry, view, camera, spectatorCameraEnabled: () => spectatorCameraEnabled } });\n${marker}`,
    );
  },
};
const vite = await createServer({
  configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  root: projectRoot,
  logLevel: 'error',
  plugins: [observation],
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await vite.listen();
  const address = vite.httpServer.address();
  assert(address && typeof address !== 'string');
  browser = await firefox.launch({ headless: false });
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem('deadvox.hud-options', JSON.stringify({ clock: true }));
    let locked = null;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
    Element.prototype.requestPointerLock = function () {
      locked = this;
      document.dispatchEvent(new Event('pointerlockchange'));
      return Promise.resolve();
    };
    document.exitPointerLock = () => {
      locked = null;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    globalThis.firefoxUiFrames = 0;
    const frame = () => {
      globalThis.firefoxUiFrames += 1;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  await page.goto(
    browserStageUrl(
      'firefox-ui',
      `http://127.0.0.1:${address.port}/?debug=1&actors=detailed&seed=1&radius=64&post=0&sunshadow=0&torchshadow=0`,
    ),
  );
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false', null, {
    timeout: 30_000,
  });
  await page.locator('#go').click();
  await page.waitForFunction(() => Boolean(globalThis.firefoxUiTest && document.querySelector('#view')));
  const initialTime = await page.evaluate(() => globalThis.firefoxUiTest.session.sim.time);
  await page.waitForFunction(
    () => document.querySelector('#overlay').hidden && document.pointerLockElement === document.querySelector('#view'),
    null,
    { timeout: 10_000 },
  );
  await page.waitForFunction((before) => globalThis.firefoxUiTest.session.sim.time > before, initialTime, {
    timeout: 20_000,
  });
  assert.doesNotMatch(await page.locator('#hud').textContent(), /paused/);
  const gateCode = await page.evaluate(
    `import('/src/game/inputBindings.ts').then(({ inputBindings }) => inputBindings.chords('debug.gate')[0].code)`,
  );
  await page.evaluate((code) => {
    globalThis.firefoxGateEvents = [];
    document.addEventListener('keydown', (event) => {
      if (event.code === code) {
        globalThis.firefoxGateEvents.push({
          type: 'keydown',
          trusted: event.isTrusted,
          prevented: event.defaultPrevented,
        });
      }
    });
    document.addEventListener('keyup', (event) => {
      if (event.code === code) {
        globalThis.firefoxGateEvents.push({
          type: 'keyup',
          trusted: event.isTrusted,
          prevented: event.defaultPrevented,
        });
      }
    });
  }, gateCode);
  const godBefore = await page.evaluate(() => globalThis.firefoxUiTest.session.sim.godMode);
  await pressAction(page, 'debug.god-toggle', { includeGate: false });
  assert.equal(
    await page.evaluate(() => globalThis.firefoxUiTest.session.sim.godMode),
    godBefore,
    'plain debug key cannot author',
  );
  await pressAction(page, 'debug.god-toggle');
  assert.equal(
    await page.evaluate(() => globalThis.firefoxUiTest.session.sim.godMode),
    !godBefore,
    'F2-gated action runs once',
  );
  await pressAction(page, 'debug.god-toggle', { includeGate: false });
  assert.equal(
    await page.evaluate(() => globalThis.firefoxUiTest.session.sim.godMode),
    !godBefore,
    'gate release cannot latch',
  );
  const gateEvents = await page.evaluate(() => globalThis.firefoxGateEvents);
  assert.equal(gateEvents.length, 2);
  assert.ok(gateEvents.every((event) => event.trusted));
  assert.ok(gateEvents.some((event) => event.type === 'keydown' && event.prevented));
  assert.equal(page.context().pages().length, 1, 'no Help page or window');
  // Register after startup: Input and play must handle this window event before we read cancellation.
  await page.evaluate(() => {
    globalThis.addEventListener('keydown', (event) => {
      if (event.code === 'F10') {
        globalThis.firefoxF10Prevented = event.defaultPrevented;
      }
    });
  });
  await page.keyboard.press('F10');
  assert.equal(await page.locator('#overlay').evaluate((panel) => panel.hidden), true);
  assert.equal(await page.evaluate(() => globalThis.firefoxF10Prevented), false);
  await pressAction(page, 'ui.main-menu-toggle');
  await page.waitForFunction(
    () => !document.querySelector('#overlay').hidden && globalThis.firefoxUiTest.session.sim.paused,
    null,
    { timeout: 5000 },
  );
  assert.equal(await page.evaluate(() => document.pointerLockElement === document.querySelector('#view')), true);
  assert.ok(await page.locator('#audio-volume-master').count());
  const paused = await page.evaluate(() => ({
    time: globalThis.firefoxUiTest.session.sim.time,
    frames: globalThis.firefoxUiFrames,
  }));
  await page.waitForFunction((frames) => globalThis.firefoxUiFrames >= frames + 2, paused.frames, { timeout: 5000 });
  assert.equal(
    await page.evaluate(() => globalThis.firefoxUiTest.session.sim.time),
    paused.time,
    'paused frames do not advance simulation time',
  );
  await pressAction(page, 'ui.main-menu-toggle');
  await page.waitForFunction(
    () => document.querySelector('#overlay').hidden && document.pointerLockElement === document.querySelector('#view'),
    null,
    { timeout: 5000 },
  );
  await page.waitForFunction((before) => globalThis.firefoxUiTest.session.sim.time > before, paused.time, {
    timeout: 20_000,
  });
  assert.doesNotMatch(await page.locator('#hud').textContent(), /paused/);

  let cursor = await page.evaluate(() => ({ x: innerWidth / 2, y: innerHeight / 2 }));
  const moveCursorTo = async (position) => {
    const movement = { x: position.x - cursor.x, y: position.y - cursor.y };
    const beforeFrames = await page.evaluate(() => globalThis.firefoxUiFrames);
    await page.evaluate(dispatchMenuPointerMove, {
      canvasSelector: '#view',
      movementX: movement.x,
      movementY: movement.y,
      centerClient: true,
      alsoDispatchMouseMove: true,
    });
    cursor = await page.evaluate(() => {
      const { input } = globalThis.firefoxUiTest;
      return { x: input.cursorX, y: input.cursorY };
    });
    await page.waitForFunction((before) => globalThis.firefoxUiFrames >= before + 2, beforeFrames, {
      timeout: 5000,
    });
  };
  const bandages = () =>
    page.evaluate(() =>
      globalThis.firefoxUiTest.session.inventory
        .snapshotState()
        .piles.flatMap(({ items }) => items)
        .filter(({ item }) => item.type === 'bandage')
        .reduce((count, { item }) => count + item.count, 0),
    );
  await pressAction(page, 'debug.spawn-menu-toggle');
  await page.locator('#spawn input').fill('bandage');
  const bandagesBeforeConfirm = await bandages();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#spawn').hidden);
  const bandagesAfterConfirm = await bandages();
  assert.equal(bandagesAfterConfirm, bandagesBeforeConfirm + 1, 'plain Enter spawns the selected item');
  await page.keyboard.press('Enter');
  assert.equal(await bandages(), bandagesAfterConfirm, 'Enter after closing the menu does not spawn an item');
  await pressAction(page, 'debug.spawn-runner');
  await page.waitForFunction(
    () =>
      [...globalThis.firefoxUiTest.session.zombies.store.entries()].some(([, zombie]) => zombie.type.id === 'runner'),
    null,
    { timeout: 5000 },
  );
  await page.evaluate(() => {
    const { registry, session } = globalThis.firefoxUiTest;
    const runnerModel = registry.zombies.get('runner')?.model;
    const runner = [...session.zombies.store.entries()].find(([, zombie]) => zombie.type.id === 'runner')?.[1];
    if (!runnerModel || runner?.type.model !== runnerModel) {
      throw new Error('debug runner spawn did not select the registered mobgen model');
    }
  });
  await pressAction(page, 'debug.spawn-crawler');
  await pressAction(page, 'debug.spawn-shamblers');
  await page.waitForFunction(
    () => {
      const { session, view } = globalThis.firefoxUiTest;
      const zombies = [...session.zombies.store.entries()];
      const required = ['crawler', 'runner', 'shambler'];
      return required.every((typeId) => {
        const found = zombies.find(([, zombie]) => zombie.type.id === typeId);
        if (!found) {
          return false;
        }
        const state = view.zombieMeshes.states?.get(found[0]);
        const variant = state && view.zombieMeshes.variants?.[state.variantIndex];
        return variant?.model === found[1].type.model && variant.mesh.count > 0;
      });
    },
    null,
    { timeout: 10_000 },
  );
  const bodyBeforeSpectator = await page.evaluate(() => [...globalThis.firefoxUiTest.session.body.pos]);
  await pressAction(page, 'debug.spectator-camera-toggle');
  assert.equal(await page.evaluate(() => globalThis.firefoxUiTest.spectatorCameraEnabled()), true);
  const cameraBeforeSpectatorMove = await page.evaluate(() => globalThis.firefoxUiTest.camera.position.toArray());
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(
      (before) => {
        const after = globalThis.firefoxUiTest.camera.position.toArray();
        return Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]) > 0.01;
      },
      cameraBeforeSpectatorMove,
      { timeout: 5000 },
    );
  } finally {
    await page.keyboard.up('w');
  }
  assert.deepEqual(await page.evaluate(() => [...globalThis.firefoxUiTest.session.body.pos]), bodyBeforeSpectator);
  await pressAction(page, 'debug.perception-labels-toggle');
  await page.waitForFunction(
    () => [...document.querySelectorAll('.zombie-perception-label')].some((label) => label.style.display !== 'none'),
    null,
    { timeout: 5000 },
  );
  assert.ok(await page.locator('.zombie-perception-label[data-perception-label]').count());
  await pressAction(page, 'debug.spectator-camera-toggle');
  assert.equal(await page.evaluate(() => globalThis.firefoxUiTest.spectatorCameraEnabled()), false);
  await pressAction(page, 'debug.perception-labels-toggle');
  await page.waitForFunction(() => document.querySelectorAll('.zombie-perception-label').length === 0, null, {
    timeout: 5000,
  });

  await pressAction(page, 'ui.inventory-toggle');
  await page.waitForFunction(() => !document.querySelector('#inventory')?.hidden);
  const dispatchPointer = async (eventType, pointerButton, pressedButtons) => {
    await page.evaluate(
      ({ type, button, buttons }) =>
        document.querySelector('#view').dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            button,
            buttons,
            clientX: innerWidth / 2,
            clientY: innerHeight / 2,
          }),
        ),
      { type: eventType, button: pointerButton, buttons: pressedButtons },
    );
  };
  const drag = async (source, target) => {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    assert(sourceBox && targetBox);
    await moveCursorTo({ x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 });
    await dispatchPointer('pointerdown', 0, 1);
    await moveCursorTo({ x: targetBox.x + 16, y: targetBox.y + 16 });
    await dispatchPointer('pointerup', -1, 0);
  };
  const finishMove = async () => {
    await pressAction(page, 'ui.inventory-toggle');
    await page.waitForFunction(() => globalThis.firefoxUiTest.session.queue.jobs.length === 0, null, { timeout: 5000 });
    await pressAction(page, 'ui.inventory-toggle');
  };
  const floorItem = page.locator('#inventory .inv-grid[data-target^="pile:"] .inv-item').filter({ hasText: 'Bandage' });
  assert.equal(await floorItem.count(), 1, 'spawned bandage is in the floor pile');
  await drag(floorItem, page.locator('#inventory .inv-grid[data-target="pocket:1:0"]'));
  await finishMove();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('#inventory .inv-item')].some(
        (item) =>
          item.querySelector('.inv-item-name')?.textContent === 'Bandage' &&
          item.closest('.inv-grid')?.dataset.target === 'pocket:1:0',
      ),
    null,
    { timeout: 5000 },
  );
  const beans = page.locator('#inventory .inv-item').filter({ hasText: 'Can of beans' }).first();
  await drag(beans, page.locator('#inventory .inv-grid[data-target="pocket:1:1"]'));
  await finishMove();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('#inventory .inv-item')].some(
        (item) =>
          item.querySelector('.inv-item-name')?.textContent === 'Can of beans' &&
          item.closest('.inv-grid')?.dataset.target === 'pocket:1:1',
      ),
    null,
    { timeout: 5000 },
  );
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  process.stdout.write(
    'Firefox UI passed: F2-gated debug, synthetic-lock time advance/pause/resume, F10/F9, audio controls, spawn, floor pickup and pocket transfer. Native lock acquisition is NOT tested.\n',
  );
} finally {
  await browser?.close();
  await vite.close();
}
