// Headed Firefox UI contract under Xvfb. Pointer lock is explicitly SYNTHETIC:
// this keeps menu/inventory coverage independent of the quarantined native gesture (#168).
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node browser contract
// biome-ignore-all lint/style/noProcessEnv: environment selects an explicitly opted-in local browser subflow
import assert from 'node:assert/strict';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { pressAction } from './input-actions.mjs';
import { dispatchMenuPointerMove, pressWithDrawnCursor } from './menu-pointer.mjs';
import { assertFixtureMods, selectFixtureMods } from './mods-startup.mjs';
import { installSaveStatusTrace, saveLockSnapshot } from './save-lock-diagnostics.mjs';
import { browserStageUrl } from './stage-mode.mjs';
import { measureWeatheringMaterials } from './weatheringPixels.mjs';

const { firefox } = await import('playwright');
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const observation = {
  name: 'firefox-ui-session-observation',
  enforce: 'pre',
  transform(code, id) {
    if (id.endsWith('/src/debug/index.ts')) {
      const marker = '  const initialLook = parseLookParams(new URLSearchParams(location.search), {';
      assert(code.includes(marker), 'debug look observation point exists');
      return code.replace(marker, `  Object.assign(globalThis, { firefoxUiLook: look });\n${marker}`);
    }
    if (!id.endsWith('/src/game/play.ts')) {
      return;
    }
    const marker = '  const onForwardPress = (e: MouseEvent) => {';
    assert(code.includes(marker), 'game-loop observation point exists');
    const exposed = code.replace(
      marker,
      `  Object.assign(globalThis, { firefoxUiTest: { engine, session, input, registry, view, camera, worldLoading, spectatorCameraEnabled: () => spectator.enabled, THREE: FirefoxTHREE, weatheringStrengthMax: WEATHERING_STRENGTH_MAX } });\n${marker}`,
    );
    // Inside updateWorldLoading, which still runs on every loading frame while the world draw is skipped.
    const loadingMarker =
      '    worldLoading.check(body.pos, now, [camera.position.x / s, camera.position.y / s, camera.position.z / s]);\n    drawWorldLoading();';
    assert(exposed.includes(loadingMarker), 'world-loading observation point exists');
    const withLoading = exposed.replace(
      loadingMarker,
      `${loadingMarker}\n    if (worldLoading.state === 'loading' && !globalThis.firefoxUiStartupSample) {\n      globalThis.firefoxUiStartupSample = { pending: streamer.unmeshedColumns(body.pos[0], body.pos[2], config.radiusChunks), masked: !$('world-loading').hidden };\n    }`,
    );
    return `import * as FirefoxTHREE from 'three';\nimport { WEATHERING_STRENGTH_MAX } from '../core/weather.ts';\n${withLoading}\n`;
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
  await page.addInitScript(installSaveStatusTrace);
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
    globalThis.firefoxUiStartupSample = undefined;
    const frame = () => {
      globalThis.firefoxUiFrames += 1;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  await page.goto(
    browserStageUrl(
      'firefox-ui',
      `http://127.0.0.1:${address.port}/?mods=1&debug=1&actors=detailed&seed=1&radius=64&post=0&sunshadow=0&torchshadow=0`,
    ),
  );
  const fixtureMod = await selectFixtureMods(page);
  try {
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false', null, {
      timeout: 30_000,
    });
  } catch (error) {
    const startupState = await page.evaluate(() => ({
      readyState: document.readyState,
      goDisabled: document.querySelector('#go')?.getAttribute('aria-disabled'),
      startupScreenHidden: document.querySelector('#startup-screen')?.hidden,
      startupStatus: document.querySelector('#save-status')?.textContent,
      errors: document.querySelector('#errors')?.textContent,
    }));
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; startup state: ${JSON.stringify(startupState)}; page errors: ${JSON.stringify(pageErrors)}; console errors: ${JSON.stringify(consoleErrors)}`,
      { cause: error },
    );
  }
  await page.locator('#go').click();
  await page.waitForFunction(() => Boolean(globalThis.firefoxUiTest && document.querySelector('#view')));
  await assertFixtureMods(page, fixtureMod);
  const initialTime = await page.evaluate(() => globalThis.firefoxUiTest.session.sim.time);
  await page.waitForFunction(
    () => document.querySelector('#overlay').hidden && document.pointerLockElement === document.querySelector('#view'),
    null,
    { timeout: 10_000 },
  );
  try {
    await page.waitForFunction(
      () => globalThis.firefoxUiStartupSample?.masked && globalThis.firefoxUiStartupSample.pending > 0,
      null,
      { timeout: 10_000 },
    );
  } catch (error) {
    const state = await page.evaluate(() => {
      const mask = document.querySelector('#world-loading');
      const runtime = globalThis.firefoxUiTest;
      return {
        maskHidden: mask?.hidden,
        loading: runtime?.worldLoading.state,
        loadingError: runtime?.worldLoading.error,
        firstVisibleSample: globalThis.firefoxUiStartupSample,
        meshes: runtime?.engine?.meshes ? Array.from(runtime.engine.meshes.keys()).length : null,
        locked: runtime?.input?.locked,
        menuPointer: runtime?.input?.menuPointer,
        streamerPending: runtime?.engine?.streamer?.pending,
      };
    });
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; startup state: ${JSON.stringify(state)}`,
      { cause: error },
    );
  }
  await page.waitForFunction(
    () => globalThis.firefoxUiTest.worldLoading.ready && document.querySelector('#world-loading')?.hidden,
    null,
    { timeout: 30_000 },
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
  const controlsSearch = page.locator('#controls-search');
  const controlsBeforeSearch = await page.locator('#controls dt').count();
  await controlsSearch.focus();
  await page.keyboard.type('f');
  const filteredControls = await page
    .locator('#controls')
    .evaluate((root) =>
      [...root.querySelectorAll('dt')].map((key) =>
        `${key.textContent} ${key.nextElementSibling?.textContent}`.toLowerCase(),
      ),
    );
  assert.ok(filteredControls.length > 0 && filteredControls.length < controlsBeforeSearch);
  assert.ok(
    filteredControls.every((row) => row.includes('f')),
    'search keeps only matching descriptions or key labels',
  );
  await controlsSearch.fill('');
  assert.equal(await page.locator('#controls dt').count(), controlsBeforeSearch);
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
  // Zombies of each mobgen body are drawn as their own model, so no two of these types share one. The debug spawn
  // ring finds no clear ground in sight of this stage's start, so these check zombies the world already holds.
  const drawnModel = (typeId) => {
    const { session, view } = globalThis.firefoxUiTest;
    for (const [id, zombie] of session.zombies.store.entries()) {
      const state = zombie.type.id === typeId && view.zombieMeshes.states?.get(id);
      const variant = state && view.zombieMeshes.variants?.[state.variantIndex];
      if (variant?.model === zombie.type.model && variant.mesh.count > 0) {
        return variant.model;
      }
    }
    return false;
  };
  const bodyTypes = ['runner', 'crawler', 'shambler'];
  const drawnModels = await Promise.all(
    bodyTypes.map((typeId) =>
      page
        .waitForFunction(drawnModel, typeId, { timeout: 10_000 })
        .then((handle) => handle.jsonValue())
        .catch(() => assert.fail(`a world ${typeId} is drawn as its content model`)),
    ),
  );
  assert.equal(
    new Set(drawnModels).size,
    bodyTypes.length,
    `each of ${bodyTypes.join(', ')} is drawn as its own model, not another's: ${drawnModels.join(', ')}`,
  );
  // The acid body: drawn as its own model, dripping and lighting a shared slot, and on death losing its sac to a
  // splash that leaves the world as the death left it. Like the bodies above, it is one the world holds: the nearest
  // of the lab's acid zombies.
  const acidId = await page.waitForFunction(
    () => {
      const { session, view } = globalThis.firefoxUiTest;
      const away = ([, zombie]) => Math.hypot(...zombie.body.pos.map((value, axis) => value - session.body.pos[axis]));
      const [found] = [...session.zombies.store.entries()]
        .filter(([, zombie]) => zombie.type.id === 'acid_zombie')
        .sort((a, b) => away(a) - away(b));
      const state = found && view.zombieMeshes.states?.get(found[0]);
      const variant = state && view.zombieMeshes.variants?.[state.variantIndex];
      const body = found?.[1].type.acidBody;
      const lit = view.lightPool.lights.some(
        (light) => light.color.getHexString() === body?.color.slice(1) && light.distance === body?.light.radiusMetres,
      );
      const sac = found && view.zombieMeshes.boneMatrix(found[0], 'sac.0');
      return variant?.model === 'acid' &&
        variant.mesh.count > 0 &&
        lit &&
        sac?.some((value) => value !== 0) &&
        view.acidEffects.dropletCount() > 0
        ? found[0]
        : false;
    },
    null,
    { timeout: 10_000 },
  );
  const acidDeath = await page.evaluate(
    (id) => {
      const { session } = globalThis.firefoxUiTest;
      const { zombies } = session;
      const {
        pos: [x, y, z],
        height: bodyHeight,
      } = zombies.store.get(id).body;
      // Only the head kills this body; a shot that strikes the torso first only downs it. Walls may stand beside
      // it, so level rays from around and up the body look for one whose first visible region is its head.
      const weapon = { damage: 1000, reach: 100, cooldown: 0, impulse: 0 };
      let shot;
      for (let turn = 0; turn < 16 && !shot; turn++) {
        const [dx, dz] = [Math.cos((turn * Math.PI) / 8), Math.sin((turn * Math.PI) / 8)];
        for (let height = bodyHeight; height > 0 && !shot; height -= 0.2) {
          const origin = [x + 2 * dx, y + height, z + 2 * dz];
          const aim = zombies.aimAt(origin, [-dx, 0, -dz], weapon);
          if (aim?.id === id && aim.region === 'head') {
            shot = { origin, directions: [[-dx, 0, -dz]] };
          }
        }
      }
      if (shot) {
        zombies.firePellets({ ...shot, damage: weapon.damage, impulse: 0, rangeMetres: weapon.reach });
      }
      return {
        aimed: shot !== undefined,
        died: zombies.store.get(id) === undefined,
        piles: JSON.stringify(session.inventory.snapshotState().piles),
      };
    },
    await acidId.jsonValue(),
  );
  assert.ok(acidDeath.aimed, 'a clear level ray reaches the acid zombie head first');
  assert.ok(acidDeath.died, 'the acid zombie dies to a lethal shot');
  await page.waitForFunction(
    (id) => {
      const { view } = globalThis.firefoxUiTest;
      return (
        view.zombieMeshes.boneMatrix(id, 'sac.0')?.every((value) => value === 0) &&
        view.acidEffects.dropletCount() >=
          globalThis.firefoxUiTest.registry.zombies.get('acid_zombie').acidBody.deathSplash.droplets
      );
    },
    await acidId.jsonValue(),
    { timeout: 5000 },
  );
  assert.equal(
    await page.evaluate(() => JSON.stringify(globalThis.firefoxUiTest.session.inventory.snapshotState().piles)),
    acidDeath.piles,
    'the sac burst and its splash leave no item behind',
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
  const drawnAvatar = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              resolve(
                globalThis.firefoxUiTest.view.playerMeshes.group.children.map((part) => [...part.matrix.elements]),
              ),
            ),
          ),
        ),
    );
  const avatarBeforeLook = await drawnAvatar();
  assert.ok(avatarBeforeLook.length > 0, 'the avatar draws');
  await page.evaluate(() => {
    globalThis.firefoxUiTest.input.yaw += 1;
  });
  assert.deepEqual(await drawnAvatar(), avatarBeforeLook, 'look input while detached must not turn the drawn avatar');
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

  if (await page.locator('#inventory').evaluate((panel) => panel.hidden)) {
    await pressAction(page, 'ui.inventory-toggle');
  }
  await page.waitForFunction(() => !document.querySelector('#inventory')?.hidden, null, { timeout: 5000 });
  await pressAction(page, 'ui.inventory-tab-items');
  await page.waitForFunction(
    () => document.querySelector('#inventory [data-tab-panel="items"]')?.hidden === false,
    null,
    { timeout: 5000 },
  );
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
  const itemText = await page.evaluate(() => {
    const { registry } = globalThis.firefoxUiTest;
    return { bandage: registry.items.get('bandage').name, beans: registry.items.get('canned_beans').name };
  });
  const pocketTargets = await page
    .locator('#inventory .inv-grid[data-target^="pocket:"]')
    .evaluateAll((grids) => grids.map((grid) => grid.dataset.target));
  assert.ok(pocketTargets.length >= 2, 'the character content supplies two pockets for the drag fixture');
  const [firstPocket, secondPocket] = pocketTargets;
  const floorItem = page.locator(`#inventory .inv-grid[data-target^="pile:"] .inv-item[title^="${itemText.bandage},"]`);
  const pocketTarget = page.locator(`#inventory .inv-grid[data-target="${firstPocket}"]`);
  assert.equal(await floorItem.count(), 1, 'spawned bandage is in the floor pile');
  const youPane = page.locator('#inventory [data-pane="you"]');
  const initialYouBox = await youPane.boundingBox();
  const initialPocketBox = await pocketTarget.boundingBox();
  assert(initialYouBox && initialPocketBox, 'character pane and first pocket have layout boxes before scrolling');
  const revealDistance = initialPocketBox.y + initialPocketBox.height - (initialYouBox.y + initialYouBox.height);
  if (revealDistance > 0) {
    await moveCursorTo({
      x: initialYouBox.x + initialYouBox.width / 2,
      y: initialYouBox.y + initialYouBox.height / 2,
    });
    await page.evaluate((deltaY) => {
      document
        .querySelector('#view')
        .dispatchEvent(new WheelEvent('wheel', { deltaY, deltaMode: 0, bubbles: true, cancelable: true }));
    }, revealDistance + 16);
    await page.waitForFunction(() => {
      const pane = document.querySelector('#inventory [data-pane="you"]');
      return pane.scrollTop > 0;
    });
  }
  const [youBox, pocketBox] = await Promise.all([youPane.boundingBox(), pocketTarget.boundingBox()]);
  assert(youBox && pocketBox, 'character pane and first pocket have layout boxes');
  assert.ok(
    pocketBox.x >= youBox.x &&
      pocketBox.x + pocketBox.width <= youBox.x + youBox.width &&
      pocketBox.y >= youBox.y &&
      pocketBox.y + pocketBox.height <= youBox.y + youBox.height,
    `first pocket is visible inside the character pane before drag: ${JSON.stringify({ youBox, pocketBox })}`,
  );
  await drag(floorItem, pocketTarget);
  await finishMove();
  await page.waitForFunction(
    ({ name, target }) =>
      [...document.querySelectorAll('#inventory .inv-item')].some(
        (item) => item.title.startsWith(`${name},`) && item.closest('.inv-grid')?.dataset.target === target,
      ),
    { name: itemText.bandage, target: firstPocket },
    { timeout: 5000 },
  );
  const beans = page.locator('#inventory .inv-item').filter({ hasText: itemText.beans }).first();
  await drag(beans, page.locator(`#inventory .inv-grid[data-target="${secondPocket}"]`));
  await finishMove();
  await page.waitForFunction(
    ({ name, target }) =>
      [...document.querySelectorAll('#inventory .inv-item')].some(
        (item) => item.title.startsWith(`${name},`) && item.closest('.inv-grid')?.dataset.target === target,
      ),
    { name: itemText.beans, target: secondPocket },
    { timeout: 5000 },
  );
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);

  const runWeatheringTestPage = process.env.DEADVOX_FIREFOX_UI_WEATHERING_TEST === '1';
  if (!runWeatheringTestPage) {
    process.stdout.write(
      'Skipping Firefox weatheringTest page subflow (#670 quarantine; set DEADVOX_FIREFOX_UI_WEATHERING_TEST=1 to run locally).\n',
    );
  }
  // Quarantined as a flake under `AGENTS.md`, "Tests"; #670 owns the root cause.
  if (runWeatheringTestPage) {
    pageErrors.length = 0;
    consoleErrors.length = 0;
    const locksBeforeGoto = await saveLockSnapshot(page);
    await page.goto(
      browserStageUrl(
        'firefox-ui',
        `http://127.0.0.1:${address.port}/?debug=1&site=weatheringTest&seed=73&radius=64&post=0&time=12:00`,
        'pixel',
      ),
    );
    try {
      await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false', null, {
        timeout: 30_000,
      });
    } catch (error) {
      const startupState = await page.evaluate(() => ({
        readyState: document.readyState,
        goDisabled: document.querySelector('#go')?.getAttribute('aria-disabled'),
        goButtonDisabled: document.querySelector('#go')?.disabled,
        startupScreenHidden: document.querySelector('#startup-screen')?.hidden,
        startupStatus: document.querySelector('#save-status')?.textContent,
        errors: document.querySelector('#errors')?.textContent,
      }));
      const locks = { beforeGoto: locksBeforeGoto, afterTimeout: await saveLockSnapshot(page) };
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; startup state: ${JSON.stringify(startupState)}; save locks: ${JSON.stringify(locks)}; page errors: ${JSON.stringify(pageErrors)}; console errors: ${JSON.stringify(consoleErrors)}`,
        { cause: error },
      );
    }
    await page.locator('#go').click();
    await page.waitForFunction(
      () => globalThis.firefoxUiTest?.engine.renderer && globalThis.firefoxUiTest.engine.meshes.count > 0,
      null,
      { timeout: 60_000 },
    );
    await page.waitForFunction(
      () => {
        const { engine } = globalThis.firefoxUiTest;
        const { blockSize } = engine.config.scale;
        return (
          engine.streamer.unmeshedColumns(engine.spawn.pos[0] / blockSize, engine.spawn.pos[2] / blockSize, 2) === 0
        );
      },
      null,
      { timeout: 60_000 },
    );
    await page.waitForFunction(
      () =>
        document.querySelector('#overlay').hidden &&
        globalThis.firefoxUiTest.worldLoading.ready &&
        document.querySelector('#world-loading')?.hidden,
      null,
      { timeout: 10_000 },
    );
    await pressAction(page, 'ui.main-menu-toggle');
    await page.waitForFunction(() => globalThis.firefoxUiTest.session.sim.paused, null, { timeout: 5000 });
    const weatheringPixels = await measureWeatheringMaterials(page);
    process.stdout.write(
      `Weathering pixel measurement: ${JSON.stringify({
        size: weatheringPixels.size,
        metric: weatheringPixels.metric,
        buildingPixels: weatheringPixels.buildingPixels,
        weatherablePixels: weatheringPixels.weatherablePixels,
        weatherableFraction: weatheringPixels.weatherableFraction,
        materialPixels: weatheringPixels.materialPixels,
        materialPixelTotal: weatheringPixels.materialPixelTotal,
        materialReadability: weatheringPixels.materialReadability,
        profileStrengths: weatheringPixels.profileStrengths,
        strengthCeiling: weatheringPixels.strengthCeiling,
        uniforms: weatheringPixels.uniforms,
        differences: weatheringPixels.differences,
        maxWeatherablePixelChange: weatheringPixels.maxWeatherablePixelChange,
        maxZeroStrengthPixelChange: weatheringPixels.maxZeroStrengthPixelChange,
        artifactDirectory: 'test-results/weathering/',
      })}\n`,
    );
    assert.deepEqual(
      consoleErrors.filter((error) => error.includes('THREE.WebGLProgram: Shader Error')),
      [],
      'Firefox chunk and mask shaders compile',
    );
    assert.equal(weatheringPixels.uniforms.off, 0);
    for (const [profileId, strength] of Object.entries(weatheringPixels.profileStrengths)) {
      assert.equal(weatheringPixels.uniforms[profileId], strength);
    }
    assert.equal(weatheringPixels.uniforms.strong, weatheringPixels.strongStrength);
    assert.equal(weatheringPixels.uniforms['zero-control'], 0);
    assert.ok(weatheringPixels.strongStrength <= weatheringPixels.authoredStrength + 1);
    assert.ok(weatheringPixels.strongStrength <= weatheringPixels.strengthCeiling);
    assert.deepEqual(
      weatheringPixels.beforeCamera,
      weatheringPixels.afterCamera,
      'weathering states share one paused camera',
    );
    assert.equal(
      weatheringPixels.maxZeroStrengthPixelChange,
      0,
      'zero-strength control leaves building pixels unchanged',
    );
    // Lighting and fog scale the shader's effect in the final image, so assert a change, not a shader-space bound.
    assert.ok(
      weatheringPixels.maxWeatherablePixelChange > 0,
      `full-strength weathering changes a weatherable comparison pixel by ${weatheringPixels.maxWeatherablePixelChange.toFixed(5)} absolute luminance`,
    );
    const defaultProfileId = await page.evaluate(
      () => globalThis.firefoxUiTest.engine.config.weatheringDefaultProfileId,
    );
    assert.ok(
      Object.hasOwn(weatheringPixels.profileStrengths, defaultProfileId),
      'the default weathering profile is measured',
    );
    for (const [profileId, profileStrength] of Object.entries(weatheringPixels.profileStrengths)) {
      if (profileStrength <= 0) {
        continue;
      }
      for (const [material, difference] of Object.entries(weatheringPixels.differences[profileId])) {
        assert.ok(
          difference.pixels > 0 && difference.changedShare > 0,
          `weathering profile ${profileId} changes ${material} pixels: ${JSON.stringify(difference)}`,
        );
        const readability = weatheringPixels.materialReadability[profileId][material];
        if (profileId === defaultProfileId) {
          assert.equal(
            readability.retainsIdentity,
            true,
            `weathered default ${material} remains closer to its own clean surface than to other weathered materials: ${JSON.stringify(readability)}`,
          );
        }
        assert.equal(
          readability.retainsTexture,
          true,
          `weathered ${material} retains spatial surface variation: ${JSON.stringify(readability)}`,
        );
      }
    }
    await pressAction(page, 'ui.main-menu-toggle');
    await page.waitForFunction(() => document.querySelector('#overlay').hidden, null, { timeout: 10_000 });
    await page.locator('#debug-ui-root .debug-marker:not(.debug-frozen)').click();
    const weatheringGroup = page.locator('.debug-group[data-group="weathering"]');
    const weatheringGroupHeader = weatheringGroup.locator('.debug-group-header');
    if ((await weatheringGroupHeader.getAttribute('aria-expanded')) !== 'true') {
      await weatheringGroupHeader.click();
    }
    const alternateProfileId = await page.evaluate(() =>
      [...globalThis.firefoxUiTest.engine.registry.weathering.keys()].find(
        (id) => id !== globalThis.firefoxUiTest.engine.config.weatheringDefaultProfileId,
      ),
    );
    assert.ok(alternateProfileId, 'a second weathering profile exists for profile-switch coverage');
    // Choose from the game's combo box with a real press, as a player does under pointer lock. The drawn cursor
    // can't reach below the fold, so the field is scrolled into view first.
    await weatheringGroup.locator('#weathering-profile').scrollIntoViewIfNeeded();
    await pressWithDrawnCursor(page, '#weathering-profile');
    const alternateOptionId = await page.evaluate((profileId) => {
      const field = document.querySelector('#weathering-profile');
      const list = document.getElementById(field.getAttribute('aria-controls'));
      return [...list.querySelectorAll('[role="option"]')].find((option) => option.textContent === profileId)?.id;
    }, alternateProfileId);
    assert.ok(alternateOptionId, 'the weathering combo box lists the alternate profile');
    await pressWithDrawnCursor(page, `#${alternateOptionId}`);
    const strengthSlider = weatheringGroup.locator('#weathering-strength');
    const sliderNext = await strengthSlider.evaluate((input) => {
      input.value = String(Number(input.value) + Number(input.step));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return Number(input.value);
    });
    assert.equal(new URL(page.url()).searchParams.get('weatheringProfile'), alternateProfileId);
    assert.equal(Number(new URL(page.url()).searchParams.get('weathering')), sliderNext);
    assert.equal(await page.evaluate(() => globalThis.firefoxUiTest.engine.meshes.weathering.value), sliderNext);
    assert.equal(
      await page.evaluate(() => {
        const {
          weatheringState: { settings },
        } = globalThis.firefoxUiLook;
        // The profile combo box names the profile; the other inputs edit its settings.
        const settingInputs = '#debug-ui-root input[id^="weathering-"]:not([role="combobox"])';
        return [...document.querySelectorAll(settingInputs)].every((input) => {
          const field = input.id.slice('weathering-'.length);
          return input.value === String(settings[field]);
        });
      }),
      true,
      'weathering inputs reflect applied profile values',
    );
    assert.equal(await weatheringGroup.locator('#weathering-tintColor').isVisible(), true);
    assert.equal(await weatheringGroup.locator('#copy-weathering-values').isVisible(), true);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false', null, {
      timeout: 30_000,
    });
    await page.locator('#go').click();
    await page.waitForFunction(
      () =>
        globalThis.firefoxUiTest?.engine.renderer &&
        globalThis.firefoxUiTest.worldLoading.ready &&
        document.querySelector('#world-loading')?.hidden,
      null,
      { timeout: 60_000 },
    );
    await page.locator('#debug-ui-root .debug-marker:not(.debug-frozen)').waitFor({ state: 'visible' });
    await page.locator('#debug-ui-root .debug-marker:not(.debug-frozen)').click();
    const reloadedWeatheringGroup = page.locator('.debug-group[data-group="weathering"]');
    const reloadedHeader = reloadedWeatheringGroup.locator('.debug-group-header');
    if ((await reloadedHeader.getAttribute('aria-expanded')) !== 'true') {
      await reloadedHeader.click();
    }
    assert.equal(await reloadedWeatheringGroup.locator('#weathering-profile').inputValue(), alternateProfileId);
    assert.deepEqual(pageErrors, []);
  }
  process.stdout.write(
    runWeatheringTestPage
      ? 'Firefox UI and voxel-shader checks passed: F2-gated debug, synthetic-lock time advance/pause/resume, F10/F9, audio controls, spawn, inventory transfer, shareable live weathering controls, and visible weathering changes on comparison-pad concrete, brick and wood. Native lock acquisition is NOT tested.\n'
      : 'Firefox UI interaction checks passed: F2-gated debug, synthetic-lock time advance/pause/resume, F10/F9, audio controls, spawn and inventory transfer. WeatheringTest page subflow is quarantined under #670. Native lock acquisition is NOT tested.\n',
  );
} finally {
  await browser?.close();
  await vite.close();
}
