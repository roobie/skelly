// Headed Firefox UI contract under Xvfb. Pointer lock is explicitly SYNTHETIC:
// this keeps menu/inventory coverage independent of the quarantined native gesture (#168).
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node browser contract
// biome-ignore-all lint/style/noProcessEnv: environment selects an explicitly opted-in local browser subflow
import assert from 'node:assert/strict';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readHash } from '../../src/hashState.ts';
import { modFileBytes } from '../modFile.ts';
import { gameUrl, inlineStartMod } from './gameUrl.mjs';
import { pressAction } from './input-actions.mjs';
import { lookTo } from './lookInput.ts';
import { dispatchMenuPointerMove, pressWithDrawnCursor } from './menu-pointer.mjs';
import { assertFixtureMods, assertOptInModIdentity, selectFixtureMods } from './mods-startup.mjs';
import { installSaveStatusTrace, saveLockSnapshot } from './save-lock-diagnostics.mjs';
import { browserStageUrl } from './stage-mode.mjs';
import { createStageServer, listeningPort } from './stageServer.mjs';
import { measureWeatheringMaterials } from './weatheringPixels.mjs';
import { waitForWorldLoaded } from './world-loading.mjs';

/**
 * @import { Browser, Locator } from 'playwright'
 * @import { PlayTestHandle } from './playTestHandle.ts'
 * @import { WeatheringMeasurement } from './weatheringPixels.mjs'
 */

/** @typedef {{ pending: number; masked: boolean }} FirefoxUiStartupSample */

const WEATHERING_TEST_START = inlineStartMod('fixture.firefox-ui.weathering', {
  allSkills: 10,
  debugOnly: true,
  density: null,
  id: 'firefox_ui_weathering_start',
  kit: [
    { condition: 0.7, count: 1, destination: { kind: 'worn' }, id: 'jeans', item: 'jeans' },
    { condition: 0.8, count: 1, destination: { kind: 'worn' }, id: 'sneakers', item: 'sneakers' },
    { condition: 0.8, count: 1, destination: { kind: 'worn' }, id: 'hoodie', item: 'hoodie' },
    { destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 }, id: 'beans', item: 'canned_beans' },
    { destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 }, id: 'matches', item: 'matches' },
    { count: 2, destination: { kind: 'pocket', parent: 'jeans', pocket: 2 }, id: 'bandages', item: 'bandage' },
  ],
  recipes: [
    'torch',
    'candle',
    'repair_kit',
    'repair_crowbar',
    'sawn_plank',
    'door_bar',
    'make_rope',
    'grind_kitchen_knife',
    'hone_kitchen_knife',
    'grind_kabar',
    'hone_kabar',
    'grind_machete',
    'hone_machete',
  ],
  seed: 1,
  site: 'weatheringTest',
  skills: {},
  startTimeGameTimeOfDay: '12:00',
  storeys: 1,
  wounds: [],
});
/** Grants pointer lock at once, as a player's click would; Xvfb grants no native lock. Runs as an init script. */
const fakePointerLock = () => {
  /** @type {Element | null} */
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
};
const revolverModel = JSON.parse(modFileBytes('gungen/revolver.model.json').toString('utf8'));
// Acid zombies are authored-only, and the default start's stand far below in the gauntlet lab, out of sight, so the
// acid death runs on a quiet site of its own with one in front of the player. A cocked, loaded revolver fires
// without a rack, whose double-press timing Firefox's input cannot pin.
const ACID_DEATH_START = {
  ...inlineStartMod('fixture.firefox-ui.acid-death', {
    allSkills: 10,
    debugOnly: true,
    density: null,
    id: 'firefox_ui_acid_death_start',
    kit: [
      {
        id: 'revolver',
        item: 'revolver_357',
        destination: { kind: 'hand', role: 'dominant' },
        cylinder: {
          chambers: Array.from({ length: revolverModel.gun.revolver.chambers }, () => ({
            state: 'round',
            roundType: 'cartridge_357_h_magnum',
          })),
          aligned: 0,
          open: false,
          cocked: true,
        },
      },
    ],
    recipes: [],
    seed: 1,
    site: 'firefoxUiAcidDeath',
    skills: {},
    startTimeGameTimeOfDay: '12:00',
    wounds: [],
  }),
  layouts: [
    {
      id: 'firefoxUiAcidDeath',
      demo: true,
      lootContext: { usage: ['Residential'], tier: 'Tier1' },
      bounds: { x0: -32, z0: -32, x1: 32, z1: 32 },
      ground: 20,
      terrain: [],
      buildings: [],
      woodlands: [],
      tracks: [],
      player: { position: [0, 20.5, 0], bearing: 0 },
      actors: [{ type: 'acid_zombie', position: [0, 20.5, -3] }],
    },
  ],
};

/**
 * The acid body draws as its own model, dripping and lighting a shared slot, and the player's head shot bursts its
 * sac into a splash that leaves the world as the death left it.
 * @param {Browser} browserInstance
 * @param {number} port
 */
const checkAcidDeath = async (browserInstance, port) => {
  const page = await browserInstance.newPage();
  /** @type {string[]} */
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(fakePointerLock);
  await page.goto(
    browserStageUrl(
      'firefox-ui',
      gameUrl(`http://127.0.0.1:${port}`, {
        startMod: ACID_DEATH_START,
        hash: { debug: true, radius: 32, actors: 'detailed', post: false, sunshadow: false, torchshadow: false },
        harness: { 'play-test': 1 },
      }),
    ),
  );
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false', null, {
    timeout: 30_000,
  });
  await page.locator('#go').click();
  await waitForWorldLoaded(page);
  await page.waitForFunction(() => globalThis.skellyPlayTest.input.locked, null, { timeout: 10_000 });
  // Frozen, the body holds still for the aim and cannot close in on the player.
  await pressAction(page, 'debug.freeze-actors');
  assert.equal(await page.evaluate(() => globalThis.skellyPlayTest.session.actors.isFrozen), true);
  await page.evaluate(async (actorsModule) => {
    globalThis.firefoxUiActors = await import(actorsModule);
  }, '/test/browser/firefox-ui-actors.ts');
  const acidId = await page.waitForFunction(
    () => globalThis.firefoxUiActors.drippingAcidZombie(globalThis.skellyPlayTest),
    null,
    { timeout: 10_000 },
  );
  const acidActor = await acidId.jsonValue();
  assert(typeof acidActor === 'number', 'the acid zombie wait resolves to its actor id');
  /** Rounds still in the cylinder of the held revolver. */
  const roundsLeft = () =>
    page.evaluate(() => {
      const { right, left } = globalThis.skellyPlayTest.session.inventory.hands;
      const cylinder = (right ?? left)?.firearm?.cylinder;
      if (!cylinder) {
        throw new Error('the revolver is in hand');
      }
      return cylinder.chambers.filter((chamber) => chamber.state === 'round').length;
    });
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(
    () => {
      const { session } = globalThis.skellyPlayTest;
      const held = session.inventory.hands.right ?? session.inventory.hands.left;
      return held !== undefined && session.firearms.isReady(held.uid);
    },
    null,
    { timeout: 10_000 },
  );
  const pileItemsBeforeShot = await page.evaluate(() =>
    globalThis.skellyPlayTest.session.inventory
      .snapshotState()
      .piles.flatMap((pile) => pile.items.map(({ item }) => item.uid)),
  );
  // Only the head kills this body; a shot that strikes the torso first only downs it.
  const boreAim = () =>
    page.evaluate((id) => globalThis.firefoxUiActors.boreOnHead(globalThis.skellyPlayTest, id), acidActor);
  /**
   * Turns until the bore runs into the head; turning swings the muzzle too, so it takes a few turns at most.
   * @param {number} turns
   * @returns {Promise<Awaited<ReturnType<typeof boreAim>>>}
   */
  const aimAtHead = async (turns) => {
    const aim = await boreAim();
    if (aim.onHead || !aim.look || turns === 0) {
      return aim;
    }
    await lookTo(page, aim.look);
    return aimAtHead(turns - 1);
  };
  /**
   * Fires at the head until the body dies or the cylinder is spent; resolves to the shots fired.
   * @param {number} fired
   * @returns {Promise<number>}
   */
  const shootHead = async (fired) => {
    const aim = await aimAtHead(4);
    const rounds = await roundsLeft();
    if (!(aim.alive && aim.onHead && rounds > 0)) {
      return fired;
    }
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(
      ({ id, before }) => {
        const { session } = globalThis.skellyPlayTest;
        const held = session.inventory.hands.right ?? session.inventory.hands.left;
        const left = held?.firearm?.cylinder?.chambers.filter((chamber) => chamber.state === 'round').length;
        return session.actors.store.get(id) === undefined || left !== before;
      },
      { id: acidActor, before: rounds },
      { timeout: 5000 },
    );
    return shootHead(fired + 1);
  };
  const shots = await shootHead(0);
  await page.mouse.up({ button: 'right' });
  assert.ok(shots > 0, "the held revolver's bore reaches the acid zombie's head first");
  assert.equal(
    await page.evaluate((id) => globalThis.skellyPlayTest.session.actors.store.get(id) === undefined, acidActor),
    true,
    "the acid zombie dies to the player's head shot",
  );
  await page.waitForFunction(
    (id) => globalThis.firefoxUiActors.acidSacBurst(globalThis.skellyPlayTest, id),
    acidActor,
    { timeout: 5000 },
  );
  // A head shot may cut the skull away as an item; the sac and its splash must add nothing beside such cut parts.
  assert.deepEqual(
    await page.evaluate((before) => {
      const { engine, session } = globalThis.skellyPlayTest;
      const cutParts = new Set(
        Object.values(engine.registry.actors.get('acid_zombie')?.severedItems ?? {}).flatMap((parts) =>
          parts.map((part) => part.item),
        ),
      );
      return session.inventory
        .snapshotState()
        .piles.flatMap((pile) => pile.items)
        .filter(({ item }) => !(before.includes(item.uid) || cutParts.has(item.type)))
        .map(({ item }) => item.type);
    }, pileItemsBeforeShot),
    [],
    'the sac burst and its splash leave no item beside the cut parts',
  );
  assert.deepEqual(pageErrors, /** @type {string[]} */ ([]));
  await page.close();
};
const { firefox } = await import('playwright');
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const vite = await createStageServer({
  configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  root: projectRoot,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
/** @type {Browser | undefined} */
let browser;
try {
  await vite.listen();
  const port = listeningPort(vite);
  browser = await firefox.launch({ headless: false });
  const page = await browser.newPage();
  /** @type {string[]} */
  const pageErrors = [];
  /** @type {string[]} */
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  await page.addInitScript(installSaveStatusTrace);
  await page.addInitScript(fakePointerLock);
  await page.addInitScript(() => {
    localStorage.setItem('skelly.hud-options', JSON.stringify({ clock: true }));
    globalThis.firefoxUiFrames = 0;
    globalThis.firefoxUiStartupSample = undefined;
    // Play publishes its handle before its first frame, so the sample can come from the first world-loading frame.
    Object.defineProperty(globalThis, 'skellyPlayTest', {
      configurable: true,
      /** @param {PlayTestHandle} handle */
      set(handle) {
        Object.defineProperty(globalThis, 'skellyPlayTest', { configurable: true, writable: true, value: handle });
        const { worldLoading, engine } = handle;
        const check = worldLoading.check.bind(worldLoading);
        worldLoading.check = (position, ...rest) => {
          check(position, ...rest);
          if (worldLoading.state !== 'loading' || globalThis.firefoxUiStartupSample) {
            return;
          }
          const pending = engine.streamer.unmeshedColumns(position[0], position[2], engine.config.radiusChunks);
          // Play draws the loading mask after this check within the same frame; read the mask as that frame left it.
          queueMicrotask(() => {
            globalThis.firefoxUiStartupSample ??= {
              pending,
              masked: !(/** @type {HTMLElement} */ (document.querySelector('#world-loading')).hidden),
            };
          });
        };
      },
    });
    const frame = () => {
      globalThis.firefoxUiFrames += 1;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  await assertOptInModIdentity(page, (queryAndHash) =>
    browserStageUrl('firefox-ui', `http://127.0.0.1:${port}/?${queryAndHash}`),
  );
  await page.goto(
    browserStageUrl(
      'firefox-ui',
      `http://127.0.0.1:${port}/?mods=1&play-test=1#{debug:true,seed:1,radius:64,actors:detailed,post:false,sunshadow:false,torchshadow:false}`,
    ),
  );
  const fixtureMod = await selectFixtureMods(page);
  try {
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false', null, {
      timeout: 30_000,
    });
  } catch (error) {
    const startupState = await page.evaluate(() => {
      const startupScreen = document.querySelector('#startup-screen');
      return {
        readyState: document.readyState,
        goDisabled: document.querySelector('#go')?.getAttribute('aria-disabled'),
        startupScreenHidden: startupScreen instanceof HTMLElement ? startupScreen.hidden : undefined,
        startupStatus: document.querySelector('#save-status')?.textContent,
        errors: document.querySelector('#errors')?.textContent,
      };
    });
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; startup state: ${JSON.stringify(startupState)}; page errors: ${JSON.stringify(pageErrors)}; console errors: ${JSON.stringify(consoleErrors)}`,
      { cause: error },
    );
  }
  await page.locator('#go').click();
  await page.waitForFunction(() => Boolean(globalThis.skellyPlayTest && document.querySelector('#view')));
  await assertFixtureMods(page, fixtureMod);
  const initialTime = await page.evaluate(() => globalThis.skellyPlayTest.session.sim.time);
  await waitForWorldLoaded(page);
  await page.waitForFunction(
    () => {
      const overlay = document.querySelector('#overlay');
      return (
        overlay instanceof HTMLElement &&
        overlay.hidden &&
        document.pointerLockElement === document.querySelector('#view')
      );
    },
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
      const runtime = globalThis.skellyPlayTest;
      return {
        maskHidden: mask instanceof HTMLElement ? mask.hidden : undefined,
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
  await page.waitForFunction((before) => globalThis.skellyPlayTest.session.sim.time > before, initialTime, {
    timeout: 20_000,
  });
  assert.doesNotMatch((await page.locator('#hud').textContent()) ?? '', /paused/);
  const gateCode = await page.evaluate(
    `import('/src/product/input.ts').then(({ inputBindings }) => inputBindings.chords('debug.gate')[0].code)`,
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
  const godBefore = await page.evaluate(() => globalThis.skellyPlayTest.session.sim.godMode);
  await pressAction(page, 'debug.god-toggle', { includeGate: false });
  assert.equal(
    await page.evaluate(() => globalThis.skellyPlayTest.session.sim.godMode),
    godBefore,
    'plain debug key cannot author',
  );
  await pressAction(page, 'debug.god-toggle');
  assert.equal(
    await page.evaluate(() => globalThis.skellyPlayTest.session.sim.godMode),
    !godBefore,
    'F2-gated action runs once',
  );
  await pressAction(page, 'debug.god-toggle', { includeGate: false });
  assert.equal(
    await page.evaluate(() => globalThis.skellyPlayTest.session.sim.godMode),
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
  assert.equal(await page.locator('#overlay').evaluate((/** @type {HTMLElement} */ panel) => panel.hidden), true);
  assert.equal(await page.evaluate(() => globalThis.firefoxF10Prevented), false);
  await pressAction(page, 'ui.main-menu-toggle');
  await page.waitForFunction(
    () => {
      const overlay = document.querySelector('#overlay');
      return overlay instanceof HTMLElement && !overlay.hidden && globalThis.skellyPlayTest.session.sim.paused;
    },
    null,
    { timeout: 5000 },
  );
  assert.equal(
    await page.locator('#overlay .card').evaluate((card) => card.scrollWidth <= card.clientWidth),
    true,
    'main menu content does not overflow sideways',
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
    time: globalThis.skellyPlayTest.session.sim.time,
    frames: globalThis.firefoxUiFrames,
  }));
  await page.waitForFunction((frames) => globalThis.firefoxUiFrames >= frames + 2, paused.frames, { timeout: 5000 });
  assert.equal(
    await page.evaluate(() => globalThis.skellyPlayTest.session.sim.time),
    paused.time,
    'paused frames do not advance simulation time',
  );
  await pressAction(page, 'ui.main-menu-toggle');
  await page.waitForFunction(
    () => {
      const overlay = document.querySelector('#overlay');
      return (
        overlay instanceof HTMLElement &&
        overlay.hidden &&
        document.pointerLockElement === document.querySelector('#view')
      );
    },
    null,
    { timeout: 5000 },
  );
  await page.waitForFunction((before) => globalThis.skellyPlayTest.session.sim.time > before, paused.time, {
    timeout: 20_000,
  });
  assert.doesNotMatch((await page.locator('#hud').textContent()) ?? '', /paused/);

  let cursor = await page.evaluate(() => ({ x: innerWidth / 2, y: innerHeight / 2 }));
  /** @param {{ x: number; y: number }} position */
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
      const { input } = globalThis.skellyPlayTest;
      return { x: input.cursorX, y: input.cursorY };
    });
    await page.waitForFunction((before) => globalThis.firefoxUiFrames >= before + 2, beforeFrames, {
      timeout: 5000,
    });
  };
  const bandages = () =>
    page.evaluate(() =>
      globalThis.skellyPlayTest.session.inventory
        .snapshotState()
        .piles.flatMap(({ items }) => items)
        .filter(({ item }) => item.type === 'bandage')
        .reduce((count, { item }) => count + item.count, 0),
    );
  await pressAction(page, 'debug.spawn-menu-toggle');
  await page.locator('#spawn input').fill('bandage');
  const bandagesBeforeConfirm = await bandages();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const spawn = document.querySelector('#spawn');
    return spawn instanceof HTMLElement && spawn.hidden;
  });
  const bandagesAfterConfirm = await bandages();
  assert.equal(bandagesAfterConfirm, bandagesBeforeConfirm + 1, 'plain Enter spawns the selected item');
  await page.keyboard.press('Enter');
  assert.equal(await bandages(), bandagesAfterConfirm, 'Enter after closing the menu does not spawn an item');
  // Shared anatomy must not collapse distinct actor figure variants. The debug spawn
  // ring finds no clear ground in sight of this stage's start, so these check zombies the world already holds.
  // The actor waits poll synchronously, so their page module loads first.
  await page.evaluate(async (actorsModule) => {
    globalThis.firefoxUiActors = await import(actorsModule);
  }, '/test/browser/firefox-ui-actors.ts');
  const bodyTypes = ['runner', 'crawler', 'shambler'];
  const drawnModels = await Promise.all(
    bodyTypes.map((typeId) =>
      page
        .waitForFunction(
          (type) => globalThis.firefoxUiActors.drawnFigureVariant(globalThis.skellyPlayTest, type),
          typeId,
          { timeout: 10_000 },
        )
        .then((handle) => handle.jsonValue())
        .catch(() => assert.fail(`a world ${typeId} is drawn as its content figure variant`)),
    ),
  );
  assert.equal(
    new Set(drawnModels).size,
    bodyTypes.length,
    `each of ${bodyTypes.join(', ')} is drawn as its own model, not another's: ${drawnModels.join(', ')}`,
  );
  const bodyBeforeSpectator = await page.evaluate(() => [...globalThis.skellyPlayTest.session.body.pos]);
  await pressAction(page, 'debug.spectator-camera-toggle');
  assert.equal(await page.evaluate(() => globalThis.skellyPlayTest.spectator.enabled), true);
  const cameraBeforeSpectatorMove = await page.evaluate(() =>
    globalThis.skellyPlayTest.engine.camera.position.toArray(),
  );
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(
      (before) => {
        const after = globalThis.skellyPlayTest.engine.camera.position.toArray();
        return Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]) > 0.01;
      },
      cameraBeforeSpectatorMove,
      { timeout: 5000 },
    );
  } finally {
    await page.keyboard.up('w');
  }
  assert.deepEqual(await page.evaluate(() => [...globalThis.skellyPlayTest.session.body.pos]), bodyBeforeSpectator);
  /** @returns {Promise<{ avatar: number[][]; camera: number[] }>} */
  const drawnView = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const { view, engine } = globalThis.skellyPlayTest;
              resolve({
                avatar: view.playerMeshes.group.children.map((part) => [...part.matrix.elements]),
                camera: engine.camera.quaternion.toArray(),
              });
            }),
          ),
        ),
    );
  const beforeLook = await drawnView();
  assert.ok(beforeLook.avatar.length > 0, 'the avatar draws');
  await lookTo(page, { yaw: (await page.evaluate(() => globalThis.skellyPlayTest.input.controls.yaw)) + 1 });
  const afterLook = await drawnView();
  assert.notDeepEqual(afterLook.camera, beforeLook.camera, 'look input while detached turns the spectator camera');
  assert.deepEqual(afterLook.avatar, beforeLook.avatar, 'look input while detached must not turn the drawn avatar');
  await pressAction(page, 'debug.perception-labels-toggle');
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.actor-perception-label')].some(
        (label) => label instanceof HTMLElement && label.style.display !== 'none',
      ),
    null,
    { timeout: 5000 },
  );
  assert.ok(await page.locator('.actor-perception-label[data-perception-label]').count());
  await pressAction(page, 'debug.spectator-camera-toggle');
  assert.equal(await page.evaluate(() => globalThis.skellyPlayTest.spectator.enabled), false);
  await pressAction(page, 'debug.perception-labels-toggle');
  await page.waitForFunction(() => document.querySelectorAll('.actor-perception-label').length === 0, null, {
    timeout: 5000,
  });

  if (await page.locator('#inventory').evaluate((/** @type {HTMLElement} */ panel) => panel.hidden)) {
    await pressAction(page, 'ui.inventory-toggle');
  }
  await page.waitForFunction(
    () => {
      const inventory = document.querySelector('#inventory');
      return inventory instanceof HTMLElement && !inventory.hidden;
    },
    null,
    { timeout: 5000 },
  );
  await pressAction(page, 'ui.inventory-tab-items');
  await page.waitForFunction(
    () => {
      const items = document.querySelector('#inventory [data-tab-panel="items"]');
      return items instanceof HTMLElement && !items.hidden;
    },
    null,
    { timeout: 5000 },
  );
  /**
   * @param {string} eventType
   * @param {number} pointerButton
   * @param {number} pressedButtons
   */
  const dispatchPointer = async (eventType, pointerButton, pressedButtons) => {
    await page.evaluate(
      ({ type, button, buttons }) => {
        const view = document.querySelector('#view');
        if (!view) {
          throw new Error('the game view receives the dispatched pointer event');
        }
        return view.dispatchEvent(
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
        );
      },
      { type: eventType, button: pointerButton, buttons: pressedButtons },
    );
  };
  /**
   * @param {Locator} source
   * @param {Locator} target
   */
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
    await page.waitForFunction(() => globalThis.skellyPlayTest.session.queue.jobs.length === 0, null, {
      timeout: 5000,
    });
    await pressAction(page, 'ui.inventory-toggle');
  };
  const itemText = await page.evaluate(() => {
    const { registry } = globalThis.skellyPlayTest.engine;
    /** @param {string} id */
    const nameOf = (id) => {
      const item = registry.items.get(id);
      if (!item) {
        throw new Error(`the ${id} item is registered`);
      }
      return item.name;
    };
    return { bandage: nameOf('bandage'), beans: nameOf('canned_beans') };
  });
  const pocketTargets = await page
    .locator('#inventory .inv-grid[data-target^="pocket:"]')
    .evaluateAll((grids) => grids.map((grid) => grid.dataset.target));
  assert.ok(pocketTargets.length >= 2, 'the character content supplies two pockets for the drag fixture');
  const [firstPocket, secondPocket] = pocketTargets;
  const floorItem = page.locator(`#inventory .inv-grid[data-target^="pile:"] .inv-item[title="${itemText.bandage}"]`);
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
      const view = document.querySelector('#view');
      if (!view) {
        throw new Error('the game view receives the dispatched wheel event');
      }
      view.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaMode: 0, bubbles: true, cancelable: true }));
    }, revealDistance + 16);
    await page.waitForFunction(() => {
      const pane = document.querySelector('#inventory [data-pane="you"]');
      return pane !== null && pane.scrollTop > 0;
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
      [...document.querySelectorAll('#inventory .inv-item')].some((item) => {
        const grid = item.closest('.inv-grid');
        return (
          item instanceof HTMLElement &&
          item.title === name &&
          grid instanceof HTMLElement &&
          grid.dataset.target === target
        );
      }),
    { name: itemText.bandage, target: firstPocket },
    { timeout: 5000 },
  );
  const beans = page.locator('#inventory .inv-item').filter({ hasText: itemText.beans }).first();
  await drag(beans, page.locator(`#inventory .inv-grid[data-target="${secondPocket}"]`));
  await finishMove();
  await page.waitForFunction(
    ({ name, target }) =>
      [...document.querySelectorAll('#inventory .inv-item')].some((item) => {
        const grid = item.closest('.inv-grid');
        return (
          item instanceof HTMLElement &&
          item.title === name &&
          grid instanceof HTMLElement &&
          grid.dataset.target === target
        );
      }),
    { name: itemText.beans, target: secondPocket },
    { timeout: 5000 },
  );
  // Typed expectations keep deepEqual from narrowing the logs to never[] before they are reused below.
  assert.deepEqual(pageErrors, /** @type {string[]} */ ([]));
  assert.deepEqual(consoleErrors, /** @type {string[]} */ ([]));
  await checkAcidDeath(browser, port);

  const runWeatheringTestPage = process.env.SKELLY_FIREFOX_UI_WEATHERING_TEST === '1';
  if (!runWeatheringTestPage) {
    process.stdout.write(
      'Skipping Firefox weatheringTest page subflow (#670 quarantine; set SKELLY_FIREFOX_UI_WEATHERING_TEST=1 to run locally).\n',
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
        gameUrl(`http://127.0.0.1:${port}`, {
          startMod: WEATHERING_TEST_START,
          hash: { debug: true, seed: 73, radius: 64, post: false },
          harness: { 'play-test': 1 },
        }),
        'pixel',
      ),
    );
    try {
      await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false', null, {
        timeout: 30_000,
      });
    } catch (error) {
      const startupState = await page.evaluate(() => {
        const go = document.querySelector('#go');
        const startupScreen = document.querySelector('#startup-screen');
        return {
          readyState: document.readyState,
          goDisabled: go?.getAttribute('aria-disabled'),
          goButtonDisabled: go instanceof HTMLButtonElement ? go.disabled : undefined,
          startupScreenHidden: startupScreen instanceof HTMLElement ? startupScreen.hidden : undefined,
          startupStatus: document.querySelector('#save-status')?.textContent,
          errors: document.querySelector('#errors')?.textContent,
        };
      });
      const locks = { beforeGoto: locksBeforeGoto, afterTimeout: await saveLockSnapshot(page) };
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; startup state: ${JSON.stringify(startupState)}; save locks: ${JSON.stringify(locks)}; page errors: ${JSON.stringify(pageErrors)}; console errors: ${JSON.stringify(consoleErrors)}`,
        { cause: error },
      );
    }
    await page.locator('#go').click();
    await waitForWorldLoaded(page);
    await page.waitForFunction(
      () => globalThis.skellyPlayTest?.engine.renderer && globalThis.skellyPlayTest.engine.meshes.count > 0,
      null,
      { timeout: 60_000 },
    );
    await page.waitForFunction(
      () => {
        const { engine } = globalThis.skellyPlayTest;
        const { blockSize } = engine.config.scale;
        return (
          engine.streamer.unmeshedColumns(engine.spawn.pos[0] / blockSize, engine.spawn.pos[2] / blockSize, 2) === 0
        );
      },
      null,
      { timeout: 60_000 },
    );
    await page.waitForFunction(
      () => {
        const overlay = document.querySelector('#overlay');
        return overlay instanceof HTMLElement && overlay.hidden;
      },
      null,
      { timeout: 10_000 },
    );
    await pressAction(page, 'ui.main-menu-toggle');
    await page.waitForFunction(() => globalThis.skellyPlayTest.session.sim.paused, null, { timeout: 5000 });
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
    const defaultProfileId = await page.evaluate(() => globalThis.skellyPlayTest.engine.config.weatheringProfileId);
    assert.ok(
      Object.hasOwn(weatheringPixels.profileStrengths, defaultProfileId),
      'the default weathering profile is measured',
    );
    for (const [profileId, profileStrength] of Object.entries(weatheringPixels.profileStrengths)) {
      if (profileStrength <= 0) {
        continue;
      }
      const differences = weatheringPixels.differences[profileId];
      const readabilities = weatheringPixels.materialReadability[profileId];
      assert(differences && readabilities, `weathering profile ${profileId} is compared and read`);
      for (const [material, difference] of Object.entries(differences)) {
        assert.ok(
          difference.pixels > 0 && difference.changedShare > 0,
          `weathering profile ${profileId} changes ${material} pixels: ${JSON.stringify(difference)}`,
        );
        /** @type {WeatheringMeasurement['materialReadability'][string][string] | undefined} */
        const readability = readabilities[material];
        assert(readability, `weathering profile ${profileId} reads ${material}`);
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
    await page.waitForFunction(
      () => {
        const overlay = document.querySelector('#overlay');
        return overlay instanceof HTMLElement && overlay.hidden;
      },
      null,
      { timeout: 10_000 },
    );
    await page.locator('#debug-ui-root .debug-marker:not(.debug-frozen)').click();
    const weatheringGroup = page.locator('.debug-group[data-group="weathering"]');
    const weatheringGroupHeader = weatheringGroup.locator('.debug-group-header');
    if ((await weatheringGroupHeader.getAttribute('aria-expanded')) !== 'true') {
      await weatheringGroupHeader.click();
    }
    const alternateProfileId = await page.evaluate(() =>
      [...globalThis.skellyPlayTest.engine.registry.weathering.keys()].find(
        (id) => id !== globalThis.skellyPlayTest.engine.config.weatheringProfileId,
      ),
    );
    assert.ok(alternateProfileId, 'a second weathering profile exists for profile-switch coverage');
    // Choose from the game's combo box with a real press, as a player does under pointer lock. The drawn cursor
    // can't reach below the fold, so the field is scrolled into view first.
    await weatheringGroup.locator('#weathering-profile').scrollIntoViewIfNeeded();
    await pressWithDrawnCursor(page, '#weathering-profile');
    const alternateOptionId = await page.evaluate((profileId) => {
      const listId = document.querySelector('#weathering-profile')?.getAttribute('aria-controls');
      const list = listId ? document.getElementById(listId) : null;
      if (!list) {
        throw new Error('the weathering profile combo box controls an option list');
      }
      return [...list.querySelectorAll('[role="option"]')].find((option) => option.textContent === profileId)?.id;
    }, alternateProfileId);
    assert.ok(alternateOptionId, 'the weathering combo box lists the alternate profile');
    await pressWithDrawnCursor(page, `#${alternateOptionId}`);
    const strengthSlider = weatheringGroup.locator('#weathering-strength');
    const sliderNext = await strengthSlider.evaluate((/** @type {HTMLInputElement} */ input) => {
      input.value = String(Number(input.value) + Number(input.step));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return Number(input.value);
    });
    const sliderHash = readHash(new URL(page.url()).hash);
    assert.ok('hash' in sliderHash, `the page hash parses: ${JSON.stringify(sliderHash)}`);
    assert.equal(sliderHash.hash.weathering, sliderNext);
    assert.equal(await page.evaluate(() => globalThis.skellyPlayTest.engine.meshes.weatheringStrength), sliderNext);
    assert.equal(
      await page.evaluate(
        ({ profileId, strength }) => {
          const profile = globalThis.skellyPlayTest.engine.registry.weathering.get(profileId);
          if (!profile) {
            throw new Error(`the ${profileId} weathering profile is registered`);
          }
          // Applying a profile copies it; the slider then edited only its strength.
          const settings = new Map(Object.entries({ ...profile, strength }));
          // The profile combo box names the profile; the other inputs edit its settings.
          const settingInputs = '#debug-ui-root input[id^="weathering-"]:not([role="combobox"])';
          return [...document.querySelectorAll(settingInputs)].every((input) => {
            const field = input.id.slice('weathering-'.length);
            return input instanceof HTMLInputElement && input.value === String(settings.get(field));
          });
        },
        { profileId: alternateProfileId, strength: sliderNext },
      ),
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
    await waitForWorldLoaded(page);
    await page.waitForFunction(() => globalThis.skellyPlayTest?.engine.renderer, null, { timeout: 60_000 });
    await page.locator('#debug-ui-root .debug-marker:not(.debug-frozen)').waitFor({ state: 'visible' });
    await page.locator('#debug-ui-root .debug-marker:not(.debug-frozen)').click();
    const reloadedWeatheringGroup = page.locator('.debug-group[data-group="weathering"]');
    const reloadedHeader = reloadedWeatheringGroup.locator('.debug-group-header');
    if ((await reloadedHeader.getAttribute('aria-expanded')) !== 'true') {
      await reloadedHeader.click();
    }
    // The address keeps the tuning but not the profile choice, which has no home.
    assert.equal(await reloadedWeatheringGroup.locator('#weathering-profile').inputValue(), defaultProfileId);
    assert.equal(Number(await reloadedWeatheringGroup.locator('#weathering-strength').inputValue()), sliderNext);
    assert.deepEqual(pageErrors, []);
  }
  process.stdout.write(
    runWeatheringTestPage
      ? 'Firefox UI and voxel-shader checks passed: F2-gated debug, synthetic-lock time advance/pause/resume, F10/F9, audio controls, spawn, inventory transfer, a head shot on an acid zombie, shareable live weathering controls, and visible weathering changes on comparison-pad concrete, brick and wood. Native lock acquisition is NOT tested.\n'
      : 'Firefox UI interaction checks passed: F2-gated debug, synthetic-lock time advance/pause/resume, F10/F9, audio controls, spawn, inventory transfer and a head shot on an acid zombie. WeatheringTest page subflow is quarantined under #670. Native lock acquisition is NOT tested.\n',
  );
} finally {
  await browser?.close();
  await vite.close();
}
