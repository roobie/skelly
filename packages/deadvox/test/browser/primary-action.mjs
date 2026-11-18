// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract starts Vite and Chrome
// biome-ignore-all lint/performance/noAwaitInLoops: browser input selection must settle before the next keypress
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract uses Node assertions
// biome-ignore-all lint/style/noProcessEnv: runner controls the executable and source checkout for A/B tests
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { modFileBytes } from '../modFile.ts';
import {
  actionRingShown,
  chooseHeldAction,
  holdDominantUse,
  pointActionMenu,
  stepActionMenuTo,
  waitForActionRing,
} from './action-menu.mjs';
import { launchChromium } from './chromium.mjs';
import { gameUrl, inlineStartMod } from './gameUrl.mjs';
import { holdAction, pressAction } from './input-actions.mjs';
import { dispatchMenuPointerClick, dispatchMenuPointerMove } from './menu-pointer.mjs';
import { cleanReplayRadiusM, logPhase, observationPlugin, timePhase } from './primary-action-observation.mjs';
import { installScopedGun } from './scoped-gun.mjs';
import { waitForSimulation } from './simulation-wait.mjs';
import { browserStageMode, browserStageUrl } from './stage-mode.mjs';
import { createStageServer, listeningPort } from './stageServer.mjs';
import { waitForWorldLoaded } from './world-loading.mjs';

/**
 * @import { Browser, Page } from 'playwright'
 * @import { ReplayInputData, ReplayStartState } from '@skelly/engine/input'
 * @import { HandSide, Item, Location } from '@skelly/engine/inventory'
 * @import * as VehicleProjection from '@skelly/engine/internal/core/vehicleProjection.ts'
 * @import { HintText } from '@skelly/presentation/internal/ui/keyCap.ts'
 * @import { BrowserStageMode } from './stage-mode.mjs'
 */
/**
 * The members of an exported replay file the stage reads.
 * @typedef {ReplayInputData & {
 *   readonly magic: string,
 *   readonly startState: ReplayStartState,
 *   readonly endStateFingerprint: string,
 * }} ReplayArtifact
 */
/**
 * A case that boots its own context on the shared browser.
 * @typedef {(browserInstance: Browser, port: number, renderOverride: BrowserStageMode | undefined) => Promise<void>} StageCase
 */
/** @typedef {{ uid: Item['uid'] }} UidFixture */

// The flow group is the long live-page journey and ends by importing its own recording; the other groups are
// independent contexts, split so each CI step keeps headroom under its own timeout.
const groups = ['flow', 'replay-divergence', 'replays-search-look', 'replays-motion-fire'];
const [, , group] = process.argv;
assert(group !== undefined && groups.includes(group), `usage: primary-action.mjs <${groups.join('|')}>`);
const projectRoot = resolve(process.env.PRIMARY_ACTION_ROOT ?? fileURLToPath(new URL('../..', import.meta.url)));
const magazineModel = JSON.parse(modFileBytes('gungen/magazine_pistol_9.model.json').toString('utf8'));
const houseNoonStart = {
  density: null,
  id: 'primary_action_house_start',
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
  site: 'testHouse',
  skills: {},
  startTimeGameTimeOfDay: '12:00',
  storeys: 1,
  wounds: [],
};
const houseNoonMod = inlineStartMod('fixture.primary-action.house', houseNoonStart);
const debugHouseStart = {
  ...houseNoonStart,
  id: 'primary_action_fixture_start',
  debugOnly: true,
  kit: [
    ...houseNoonStart.kit,
    { id: 'backpack', item: 'hiking_backpack', destination: { kind: 'worn' } },
    { id: 'firearm', item: 'pistol_service', destination: { kind: 'hand', role: 'dominant' } },
    {
      id: 'fitted_magazine',
      item: 'magazine_pistol_9',
      cartridges: new Array(magazineModel.gun.capacity).fill('cartridge_9x19'),
      destination: { kind: 'slot', parent: 'firearm', slot: 'magazine' },
    },
    {
      id: 'rounds',
      item: 'cartridge_9x19',
      count: 50,
      destination: { kind: 'pocket', parent: 'backpack', pocket: 0 },
    },
  ],
};
const debugHouseMod = inlineStartMod('fixture.primary-action.debug-house', debugHouseStart);
const lockTestNoonMod = inlineStartMod('fixture.primary-action.lock-test', {
  ...houseNoonStart,
  id: 'primary_action_lock_test_start',
  site: 'lock_test',
});
const replayFixtureMod = inlineStartMod('fixture.primary-action.replay', {
  id: 'replay_fixture_start',
  site: 'replay_fixture',
  startTimeGameTimeOfDay: '12:00',
  kit: [{ id: 'stock', item: 'replay_fixture_stock', destination: { kind: 'hand', role: 'dominant' } }],
  wounds: [],
  skills: {},
  recipes: [],
});
const startStateModule = '/@stage/@skelly/engine/internal/core/startState.ts';
const debugStartsModule = '/test/fixtures/debugStarts.ts';
const firearmActionModule = '/@stage/@skelly/engine/internal/core/firearmAction.ts';
const inputBindingsModule = '/src/product/input.ts';
const inputReplayModule = '/@stage/@skelly/engine/input';
const firearmHandlingModule = '/@stage/@skelly/engine/inventory';
const reloadInputModule = '/@stage/@skelly/engine/input';
const magazineModule = '/@stage/@skelly/engine/internal/core/magazine.ts';
const heldPoseModule = '/@stage/@skelly/engine/internal/core/heldPose.ts';
const optionsModule = '/@stage/@skelly/engine/internal/core/options.ts';
const itemLookModule = '/@stage/@skelly/presentation/internal/render/itemLook.ts';
const pileLayoutModule = '/@stage/@skelly/engine/internal/core/pileLayout.ts';
const vehicleProjectionModule = '/@stage/@skelly/engine/internal/core/vehicleProjection.ts';
/**
 * @param {Page} page
 * @param {string} action
 */
const dispatchPlayerCommand = async (page, action) =>
  page.evaluate(
    async ({ id, moduleUrl }) => {
      const { keyboardInput } = await import(moduleUrl);
      if (!keyboardInput.command) {
        throw new Error('Player command dispatcher is unavailable');
      }
      keyboardInput.command({ action: id, phase: 'down', at: performance.now() });
    },
    { id: action, moduleUrl: inputBindingsModule },
  );
/** @param {{ start: number }} fixture */
const progressingSample = ({ start }) => {
  const { session } = globalThis.primaryActionTest;
  return { time: session.sim.time, paused: session.sim.paused, reached: session.sim.time - start >= 0.35 };
};
/**
 * A pressed F commits its tap at a player tick, so only the job itself says the press has started prying.
 * @param {UidFixture} fixture
 */
const pryStartedSample = ({ uid }) => {
  const { session } = globalThis.primaryActionTest;
  const { job } = session.sim.actions;
  return {
    time: session.sim.time,
    paused: session.sim.paused,
    reached: job?.jobType === 'forceDoor' && job.entityUid === uid,
  };
};
/** @param {{ start: number, seconds: number }} fixture */
const throwChargeSample = ({ start, seconds }) => {
  const { session } = globalThis.primaryActionTest;
  return { time: session.sim.time, paused: session.sim.paused, reached: session.sim.time - start >= seconds };
};
/**
 * @param {Page} page
 * @param {UidFixture & { chargeSimSeconds: number }} fixture
 */
const aimThrowAtFreeLanding = async (page, fixture) => {
  // Different items have different dragged flights; a clear glowstick landing says nothing about a firearm's.
  const landing = await page.evaluate(({ uid, chargeSimSeconds }) => {
    const r = globalThis.primaryActionTest;
    const { yaw } = r.input.controls;
    let free;
    for (let turn = 0; turn < 32 && !free; turn += 1) {
      r.input.controls.yaw = yaw + (turn * Math.PI * 2) / 32;
      const candidate = r.getItemThrowLanding(uid, chargeSimSeconds);
      if (candidate?.fits) {
        free = candidate;
      }
    }
    return free;
  }, fixture);
  assert(landing?.fits, 'the item’s full-charge flight has a landing with room');
  return landing;
};
/** @param {UidFixture} fixture */
const searchedContainerSample = ({ uid }) => {
  const { inventory, session } = globalThis.primaryActionTest;
  return {
    time: session.sim.time,
    paused: session.sim.paused,
    reached: inventory.entities.byUid(uid)?.searched === true,
  };
};
/** @param {Page} page */
const mouseCharge = async (page) => {
  await page.mouse.down({ button: 'left' });
  // A mouse hold has no key for waitForSimulation to release in the page.
  return Object.assign(async () => page.mouse.up({ button: 'left' }), { keyUps: [] });
};
/** @type {StageCase} */
const verifyCleanLookReplay = async (browserInstance, port, renderOverride) => {
  const context = await browserInstance.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    /** @type {string[]} */
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      let locked = false;
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        get: () => (locked ? (document.querySelector('#view canvas') ?? document.querySelector('#view')) : null),
      });
      Element.prototype.requestPointerLock = () => {
        locked = true;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      };
      document.exitPointerLock = () => {
        locked = false;
        document.dispatchEvent(new Event('pointerlockchange'));
      };
    });
    await page.goto(
      browserStageUrl(
        'primary-action',
        gameUrl(`http://127.0.0.1:${port}`, {
          startMod: replayFixtureMod,
          hash: {
            debug: true,
            seed: 73,
            radius: cleanReplayRadiusM,
            post: false,
            sunshadow: false,
            torchshadow: false,
          },
        }),
        renderOverride,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#go').click();
    await waitForWorldLoaded(page);
    await page.waitForFunction(() => {
      const overlay = document.querySelector('#overlay');
      return (
        globalThis.primaryActionTest && overlay instanceof HTMLElement && overlay.hidden && document.pointerLockElement
      );
    });
    const start = await page.evaluate(() => {
      const { input, session } = globalThis.primaryActionTest;
      return {
        yaw: input.controls.yaw,
        pitch: input.controls.pitch,
        position: [...session.body.pos],
        frame: globalThis.primaryActionTest.frames,
      };
    });
    await page.evaluate(() => {
      globalThis.freeLookAltEdges = [];
      for (const type of ['keydown', 'keyup']) {
        globalThis.addEventListener(type, (event) => {
          if (event instanceof KeyboardEvent && event.code === 'AltLeft') {
            globalThis.freeLookAltEdges.push({ type, prevented: event.defaultPrevented, trusted: event.isTrusted });
          }
        });
      }
    });
    await page.keyboard.down('w');
    await page.keyboard.down('AltLeft');
    await page.mouse.move(640, 360);
    await page.mouse.move(700, 380);
    await page.waitForFunction(
      () =>
        globalThis.primaryActionTest.input.controls.freeLooking &&
        globalThis.primaryActionTest.input.controls.freeLook.yaw !== 0,
    );
    const headLook = await page.evaluate(() => {
      const { input, frames } = globalThis.primaryActionTest;
      return { bodyYaw: input.controls.yaw, viewYaw: input.controls.viewYaw, frames };
    });
    assert.equal(headLook.bodyYaw, start.yaw, 'free look leaves ballistic and movement yaw with the body');
    assert.notEqual(headLook.viewYaw, headLook.bodyYaw, 'free look turns the view');
    await page.waitForFunction((frame) => globalThis.primaryActionTest.frames >= frame + 3, headLook.frames);
    await page.keyboard.up('AltLeft');
    await page.keyboard.up('w');
    assert.equal(
      await page.evaluate(() => globalThis.primaryActionTest.input.controls.intent().forward),
      0,
      'movement does not latch after W and Alt are released',
    );
    await page.waitForFunction(() => {
      const { input } = globalThis.primaryActionTest;
      return (
        !input.controls.freeLooking &&
        input.controls.viewYaw === input.controls.yaw &&
        input.controls.viewPitch === input.controls.pitch
      );
    });
    const altEdges = await page.evaluate(() => globalThis.freeLookAltEdges);
    assert(
      altEdges.some((event) => event.type === 'keydown'),
      'Alt down reached play',
    );
    assert(
      altEdges.some((event) => event.type === 'keyup'),
      'Alt up reached play',
    );
    assert(
      altEdges.every((event) => event.prevented && event.trusted),
      'both trusted Alt edges are cancelled',
    );
    await page.mouse.move(640, 360);
    await page.mouse.move(760, 410);
    await page.keyboard.down('w');
    await page.waitForFunction((frame) => globalThis.primaryActionTest.frames >= frame + 40, start.frame);
    await page.keyboard.up('w');
    const moved = await page.evaluate(() => {
      const { input, session } = globalThis.primaryActionTest;
      return { yaw: input.controls.yaw, pitch: input.controls.pitch, position: [...session.body.pos] };
    });
    assert.notEqual(moved.yaw, start.yaw, 'the recording includes real mouse yaw');
    assert.notEqual(moved.pitch, start.pitch, 'the recording includes real mouse pitch');
    assert.notDeepEqual(moved.position, start.position, 'the recording includes player movement');
    const actorNearStreamEdge = await page.evaluate(() => {
      const { session, simulationWorld } = globalThis.primaryActionTest;
      return [...session.actors.store.entries()].some(
        ([, actor]) => !simulationWorld.ready(actor.body.pos[0], actor.body.pos[2]),
      );
    });
    assert(actorNearStreamEdge, 'the clean recording includes a zombie outside simulation readiness');
    /** @param {string} action */
    const command = async (action) =>
      page.evaluate(
        async ({ id, moduleUrl }) => {
          const { keyboardInput } = await import(moduleUrl);
          keyboardInput.command({ action: id, phase: 'down', at: performance.now() });
        },
        { id: action, moduleUrl: inputBindingsModule },
      );
    await command('ui.inventory-toggle');
    await page.locator('#inventory .inv-item').first().waitFor();
    await command('inventory.next');
    const assignedUid = await page.evaluate(() => globalThis.primaryActionTest.screen.selected?.uid);
    assert(Number.isSafeInteger(assignedUid), 'the inventory command selects an item for quickbar assignment');
    await command('quickbar.assign.2');
    await command('ui.inventory-toggle');
    await page.waitForFunction((uid) => globalThis.primaryActionTest.quickbar.slots[1] === uid, assignedUid);
    const craftRecipeId = await page.evaluate(
      () => globalThis.primaryActionTest.session.inventory.registry.recipes.values().next().value?.id,
    );
    assert(typeof craftRecipeId === 'string', 'the loaded content supplies a craft recipe');
    await page.evaluate(
      (recipeId) => globalThis.primaryActionTest.dispatchScreenCommand({ kind: 'craft.start', recipeId }),
      craftRecipeId,
    );
    await page.waitForFunction((recipeId) => {
      const recorder = globalThis.primaryActionTest.inputRecorder;
      if (!recorder) {
        throw new Error('No input recording is running');
      }
      return recorder
        .copyInputs()
        .actions.some(({ payload }) => payload?.kind === 'craft.start' && payload.recipeId === recipeId);
    }, craftRecipeId);
    await command('debug.panel-toggle');
    await command('debug.input-replay-export');
    await page.waitForFunction(() => {
      const link = document.querySelector('#replay-download');
      return link instanceof HTMLElement && link.hidden === false;
    });
    const replayText = await page.evaluate(() => {
      const link = document.querySelector('#replay-download');
      if (!(link instanceof HTMLAnchorElement && link.href.startsWith('blob:'))) {
        throw new Error('Clean replay export did not create a downloadable artifact');
      }
      return fetch(link.href).then((response) => response.text());
    });
    const cleanArtifact = /** @type {ReplayArtifact} */ (JSON.parse(replayText));
    assert(
      cleanArtifact.frames.some((frame) => frame[6] !== 0),
      'the recording includes independent head look',
    );
    assert(cleanArtifact.generatedColumns.length > 0, 'the clean recording captures its ready terrain');
    assert(
      cleanArtifact.actions.some(
        ({ action, payload }) =>
          action === 'inventory.assign' &&
          payload?.kind === 'inventory.assign' &&
          payload.itemUid === assignedUid &&
          payload.slot === 1,
      ),
      'the clean recording includes the selected item’s UID-based quickbar assignment',
    );
    assert(
      cleanArtifact.actions.some(
        ({ action, payload }) =>
          action === 'craft.start' && payload?.kind === 'craft.start' && payload.recipeId === craftRecipeId,
      ),
      'the clean recording includes the dispatched craft-start payload',
    );
    process.stdout.write(
      `Clean replay samples: ${JSON.stringify({ frames: cleanArtifact.frames.length, movementTicks: cleanArtifact.frames.filter((frame) => frame[2] !== 0 || frame[3] !== 0).length, activeTicks: cleanArtifact.frames.filter((frame) => frame[4] & 1).length, lookChangedTicks: cleanArtifact.frames.filter((frame) => frame[0] !== start.yaw).length })}\n`,
    );
    const lastFrame = cleanArtifact.frames.at(-1);
    assert(lastFrame, 'the clean recording contains player ticks');
    assert.notEqual(lastFrame[0], start.yaw, 'the final replay sample contains the recorded yaw');
    assert.notEqual(lastFrame[1], start.pitch, 'the final replay sample contains the recorded pitch');
    const replayRestart = page.waitForEvent('load');
    await command('debug.input-replay-import');
    await page.locator('#input-replay-file').setInputFiles({
      name: 'clean-look-replay.json',
      mimeType: 'application/json',
      buffer: Buffer.from(replayText),
    });
    await replayRestart;
    await page.waitForFunction(() => {
      if (document.querySelector('#input-replay-status')) {
        return true;
      }
      return document.querySelector('#errors')?.textContent?.trim().startsWith('Replay rejected:') === true;
    });
    const replayStartup = await page.evaluate(() => {
      const status = document.querySelector('#input-replay-status');
      return {
        hasInputReplayStatus: status !== null,
        inputReplayStatus: status?.getAttribute('data-state'),
        errors: document.querySelector('#errors')?.textContent?.trim(),
        worldLoadingState: document.querySelector('#world-loading')?.getAttribute('data-state'),
        worldLoadingMessage: document.querySelector('#world-loading-message')?.textContent,
        saveStatus: document.querySelector('#save-status')?.textContent,
      };
    });
    assert.equal(
      replayStartup.hasInputReplayStatus,
      true,
      `Replay startup: ${JSON.stringify(replayStartup)}; page errors: ${JSON.stringify(pageErrors)}`,
    );
    await page.waitForFunction(
      () => {
        const status = document.querySelector('#input-replay-status');
        return (
          status instanceof HTMLElement && ['verified', 'diverged', 'unavailable'].includes(status.dataset.state ?? '')
        );
      },
      undefined,
      { timeout: 20_000 },
    );
    const replayLook = await page.evaluate(() => {
      const { input } = globalThis.primaryActionTest;
      return { yaw: input.controls.yaw, pitch: input.controls.pitch };
    });
    assert.equal(replayLook.yaw, lastFrame[0], 'playback drives the camera yaw from its final recorded sample');
    assert.equal(replayLook.pitch, lastFrame[1], 'playback drives the camera pitch from its final recorded sample');
    const replayState = await page.locator('#input-replay-status').getAttribute('data-state');
    const replayInitialPosition = await page.evaluate(() => globalThis.primaryActionTest.initialPlayerPosition);
    const recordedStartPosition = await page.evaluate(
      async ({ text, moduleUrl }) => {
        const { decodeInputReplay } = await import(moduleUrl);
        const bytes = new TextEncoder().encode(text);
        const decoded = await decodeInputReplay(bytes, { contentLookup: () => true });
        return decoded.snapshot.character.player.body.pos;
      },
      { text: replayText, moduleUrl: inputReplayModule },
    );
    assert.deepEqual(
      replayInitialPosition,
      recordedStartPosition,
      'the replay session starts from the recording snapshot before its first player tick',
    );
    assert.equal(
      replayState,
      'verified',
      'a clean look, movement, inventory and crafting recording reproduces its end state',
    );
    const liquidRow = await page.evaluate(
      async (modules) => {
        const [
          { liquidCraftData, STOCK, FULL, RECIPE },
          { buildFixtureRegistry },
          { Inventory },
          { Character },
          { bindReach },
          { craftRows, craftingText },
          { renderCrafting },
          { volumeText },
        ] = await Promise.all([
          import(modules.fixture),
          import(modules.economy),
          import(modules.inventory),
          import(modules.character),
          import(modules.reach),
          import(modules.readout),
          import(modules.view),
          import(modules.numbers),
        ]);
        const built = buildFixtureRegistry([{ source: 'liquid-browser-fixture', data: liquidCraftData() }]);
        if (built.issues.length > 0) {
          throw new Error(JSON.stringify(built.issues));
        }
        const base = globalThis.primaryActionTest.inventory.registry;
        const registry = {
          ...base,
          items: new Map([...base.items, ...built.registry.items]),
          liquids: new Map([...base.liquids, ...built.registry.liquids]),
          recipes: new Map([...base.recipes, ...built.registry.recipes]),
        };
        const inventory = new Inventory(registry);
        const character = new Character(registry);
        character.learnRecipes([RECIPE]);
        const vessel = inventory.create(FULL);
        if (
          !(
            inventory.add(vessel, { kind: 'pile', pos: [0, 0, 0] }) &&
            inventory.add(inventory.create(STOCK), { kind: 'pile', pos: [0, 0, 0] })
          )
        ) {
          throw new Error('Cannot stage liquid browser stock');
        }
        const reach = bindReach({
          inventory,
          position: [0, 0, 0],
          blockSize: 0.5,
          clock: globalThis.primaryActionTest.session.sim.clock,
        })();
        const root = document.createElement('section');
        root.style.cssText = 'position:fixed;inset:0;z-index:9999;background:black;overflow:auto';
        document.body.append(root);
        renderCrafting(
          root,
          craftRows({ registry, character, reach, preferences: {}, startReason: undefined }).filter(
            /** @param {{ readonly id: string }} row */
            (row) => row.id === RECIPE,
          ),
          { start: () => undefined, prefer: () => undefined, source: () => undefined },
          { text: craftingText(registry) },
        );
        const draw = root.querySelector('.craft-liquid-draw');
        const [[input]] = registry.recipes.get(RECIPE).components;
        const witness = {
          draw: draw?.textContent,
          visible: Boolean(draw?.getClientRects().length),
          liquid: registry.liquids.get(STOCK).name,
          vessel: registry.items.get(vessel.type).name,
          amount: volumeText(input.volumeMicrolitres / 1000),
          picker: Boolean(root.querySelector('.craft-sources input')),
        };
        root.remove();
        return witness;
      },
      {
        fixture: '/test/liquidCraftFixture.ts',
        economy: '/test/economyFixtures.ts',
        inventory: '/@stage/@skelly/engine/internal/core/inventory.ts',
        character: '/@stage/@skelly/engine/internal/core/character.ts',
        reach: '/@stage/@skelly/engine/internal/core/reach.ts',
        readout: '/@stage/@skelly/presentation/internal/ui/craftReadout.ts',
        view: '/@stage/@skelly/presentation/internal/ui/crafting.ts',
        numbers: '/@stage/@skelly/engine/internal/core/numberText.ts',
      },
    );
    assert(liquidRow.visible && liquidRow.picker, 'the crafting flow renders a liquid draw and its source picker');
    const { draw } = liquidRow;
    assert(typeof draw === 'string', 'the liquid draw has a readout');
    for (const value of [liquidRow.liquid, liquidRow.vessel, liquidRow.amount]) {
      assert(draw.includes(value), 'the liquid readout includes the kind, measured amount and vessel');
    }
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
};

/**
 * Boots one testHouse world under synthetic pointer lock and runs the cases that share it, so the stage
 * pays for one boot instead of one per case.
 * @param {Browser} browserInstance
 * @param {number} port
 * @param {BrowserStageMode | undefined} renderOverride
 * @param {(page: Page) => Promise<void>} run
 */
const withTestHouse = async (browserInstance, port, renderOverride, run) => {
  const context = await browserInstance.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    /** @type {string[]} */
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      let locked = false;
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        get: () => (locked ? (document.querySelector('#view canvas') ?? document.querySelector('#view')) : null),
      });
      Element.prototype.requestPointerLock = () => {
        locked = true;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      };
      document.exitPointerLock = () => {
        locked = false;
        document.dispatchEvent(new Event('pointerlockchange'));
      };
    });
    await page.goto(
      browserStageUrl(
        'primary-action',
        gameUrl(`http://127.0.0.1:${port}`, {
          startMod: houseNoonMod,
          hash: { debug: true, seed: 73, radius: 64, post: false, sunshadow: false, torchshadow: false },
        }),
        renderOverride,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#go').click();
    await waitForWorldLoaded(page);
    await page.waitForFunction(() => {
      const overlay = document.querySelector('#overlay');
      return (
        globalThis.primaryActionTest && overlay instanceof HTMLElement && overlay.hidden && document.pointerLockElement
      );
    });
    await run(page);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
};

/** @param {Page} page */
const verifyContainerSearchTab = async (page) => {
  for (const screenWasOpen of [true, false]) {
    await pressAction(page, 'ui.inventory-tab-skills');
    if (!screenWasOpen) {
      await pressAction(page, 'ui.inventory-toggle');
    }
    const uid = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const definition = [...r.inventory.registry.furniture.values()].find((value) => value.container);
      if (!definition) {
        throw new Error('The container search tab fixture needs searchable furniture');
      }
      const [feetX, feetY, feetZ] = r.feet();
      const [x, y, z] = [Math.floor(feetX), Math.floor(feetY), Math.floor(feetZ)];
      /** @type {[number, number][]} */
      const offsets = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
        [2, 0],
        [0, 2],
        [-2, 0],
        [0, -2],
      ];
      let container;
      for (const [dx, dz] of offsets) {
        container = r.inventory.furnish({
          type: definition.id,
          pos: [x + dx, y, z + dz],
          size: definition.size,
          facing: 'n',
        });
        if (container) {
          break;
        }
      }
      if (!container) {
        throw new Error('Could not place a nearby container for the tab regression');
      }
      r.useTarget(container);
      return container.uid;
    });
    await waitForSimulation(
      page,
      searchedContainerSample,
      { uid },
      {
        seconds: 5,
        label: `container search opens Items from ${screenWasOpen ? 'open' : 'remembered'} Skills tab`,
        record: (line) => process.stderr.write(`${line}\n`),
      },
    );
    const view = await page.evaluate((containerUid) => {
      const r = globalThis.primaryActionTest;
      r.screen.update();
      const items = document.querySelector('#inventory [data-tab-panel="items"]');
      const pane = items?.querySelector(`[data-entity-uid="${containerUid}"]`);
      return {
        activeTab: r.screen.activeTab,
        itemsVisible: items instanceof HTMLElement && items.hidden === false,
        containerPane: pane !== null && pane !== undefined,
        pocketGrid: Boolean(pane?.querySelector(`[data-target="furniture:${containerUid}:0"]`)),
      };
    }, uid);
    assert.deepEqual(view, {
      activeTab: 'items',
      itemsVisible: true,
      containerPane: true,
      pocketGrid: true,
    });
    await pressAction(page, 'ui.inventory-toggle');
  }
};

/** @type {StageCase} */
const verifyForwardButtonReplay = async (browserInstance, port, renderOverride) => {
  const context = await browserInstance.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    /** @type {string[]} */
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      let locked = false;
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        get: () => (locked ? (document.querySelector('#view canvas') ?? document.querySelector('#view')) : null),
      });
      Element.prototype.requestPointerLock = () => {
        locked = true;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      };
      document.exitPointerLock = () => {
        locked = false;
        document.dispatchEvent(new Event('pointerlockchange'));
      };
    });
    await page.goto(
      browserStageUrl(
        'primary-action',
        gameUrl(`http://127.0.0.1:${port}`, {
          startMod: houseNoonMod,
          hash: { debug: true, seed: 73, radius: 32, post: false, sunshadow: false, torchshadow: false },
        }),
        renderOverride,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#dominant-hand').selectOption('left');
    await page.locator('#go').click();
    await waitForWorldLoaded(page);
    await page.waitForFunction(() => {
      const overlay = document.querySelector('#overlay');
      return (
        globalThis.primaryActionTest && overlay instanceof HTMLElement && overlay.hidden && document.pointerLockElement
      );
    });
    const fixture = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.clearHand(r.dominant);
      r.clearHand(r.off);
      const light = r.inventory.create('glowstick');
      r.setHand(r.off, light);
      // A cell light offers a choice, so its battery comes out only through the ring.
      const torch = r.inventory.create('flashlight');
      if (!torch.slots?.battery) {
        throw new Error('The held-choice fixture needs a fitted battery');
      }
      r.setHand(r.dominant, torch);
      r.startInputReplayRecording();
      return { uid: light.uid, torchUid: torch.uid, start: r.session.sim.time };
    });
    const litInEvent = await page.evaluate((uid) => {
      document.dispatchEvent(new MouseEvent('pointerdown', { button: 4, buttons: 16, bubbles: true }));
      return Boolean(globalThis.primaryActionTest.inventory.itemByUid(uid)?.on);
    }, fixture.uid);
    assert.equal(litInEvent, false, 'the forward-button use waits for the player tick');
    await page.waitForFunction(
      (uid) => globalThis.primaryActionTest.inventory.itemByUid(uid)?.on === true,
      fixture.uid,
    );
    await chooseHeldAction(page, 'battery:unload');
    await waitForSimulation(
      page,
      ({ uid }) => {
        const r = globalThis.primaryActionTest;
        const torch = r.inventory.itemByUid(uid);
        if (!torch) {
          throw new Error('The battery-unload fixture torch is missing');
        }
        return {
          time: r.session.sim.time,
          paused: r.session.sim.paused,
          reached: !torch.slots?.battery,
        };
      },
      { uid: fixture.torchUid },
      {
        seconds: 30,
        label: 'the chosen battery unload completes',
        record: (line) => process.stdout.write(`${line}\n`),
      },
    );
    await waitForSimulation(
      page,
      progressingSample,
      { start: fixture.start },
      {
        seconds: 0.35,
        label: 'forward-button replay recording advances',
        record: (line) => process.stdout.write(`${line}\n`),
      },
    );
    /** @param {string} action */
    const command = async (action) =>
      page.evaluate(
        async ({ id, moduleUrl }) => {
          const { keyboardInput } = await import(moduleUrl);
          keyboardInput.command({ action: id, phase: 'down', at: performance.now() });
        },
        { id: action, moduleUrl: inputBindingsModule },
      );
    await command('debug.panel-toggle');
    const liveEndSnapshot = await page.evaluate(
      async ({ id, moduleUrl }) => {
        const { keyboardInput } = await import(moduleUrl);
        const snapshot = globalThis.primaryActionTest.captureSnapshot();
        keyboardInput.command({ action: id, phase: 'down', at: performance.now() });
        return snapshot;
      },
      { id: 'debug.input-replay-export', moduleUrl: inputBindingsModule },
    );
    await page.waitForFunction(() => {
      const link = document.querySelector('#replay-download');
      return link instanceof HTMLElement && link.hidden === false;
    });
    const replayText = await page.evaluate(() => {
      const link = document.querySelector('#replay-download');
      if (!(link instanceof HTMLAnchorElement && link.href.startsWith('blob:'))) {
        throw new Error('Forward-button replay export did not create a downloadable artifact');
      }
      return fetch(link.href).then((response) => response.text());
    });
    const artifact = /** @type {ReplayArtifact} */ (JSON.parse(replayText));
    assert.equal(artifact.actions.filter(({ action }) => action === 'hand.use-forward').length, 1);
    assert.deepEqual(
      artifact.actions.filter(({ payload }) => payload?.kind === 'hand.action').map(({ payload }) => payload),
      [{ kind: 'hand.action', itemUid: fixture.torchUid, actionId: 'battery:unload' }],
      'the ring records its choice once, as the action it chose',
    );
    const replayRestart = page.waitForEvent('load');
    await command('debug.input-replay-import');
    await page.locator('#input-replay-file').setInputFiles({
      name: 'forward-button-replay.json',
      mimeType: 'application/json',
      buffer: Buffer.from(replayText),
    });
    await replayRestart;
    await page.waitForFunction(() => document.querySelector('#input-replay-status'));
    await page.waitForFunction(
      () => {
        const status = document.querySelector('#input-replay-status');
        return (
          status instanceof HTMLElement && ['verified', 'diverged', 'unavailable'].includes(status.dataset.state ?? '')
        );
      },
      undefined,
      { timeout: 20_000 },
    );
    const replay = await page.evaluate(({ uid, torchUid }) => {
      const r = globalThis.primaryActionTest;
      const status = document.querySelector('#input-replay-status');
      if (!(status instanceof HTMLElement)) {
        throw new Error('The forward-button replay status is missing');
      }
      return {
        state: status.dataset.state,
        lightOn: r.inventory.itemByUid(uid)?.on,
        torchLoaded: Boolean(r.inventory.itemByUid(torchUid)?.slots?.battery),
        endSnapshot: r.captureSnapshot(),
      };
    }, fixture);
    assert.equal(replay.lightOn, true, 'replaying the recorded forward-button press lights the off-hand light');
    assert.equal(replay.torchLoaded, false, 'replay runs the chosen held action without opening its ring');
    assert.equal(replay.state, 'verified', 'the replay reproduces the recorded end state');
    assert.deepEqual(replay.endSnapshot, liveEndSnapshot);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
};

/** @type {StageCase} */
const verifyStanceThrowReplay = async (browserInstance, port, renderOverride) => {
  const context = await browserInstance.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    /** @type {string[]} */
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      let locked = false;
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        get: () => (locked ? (document.querySelector('#view canvas') ?? document.querySelector('#view')) : null),
      });
      Element.prototype.requestPointerLock = () => {
        locked = true;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      };
      document.exitPointerLock = () => {
        locked = false;
        document.dispatchEvent(new Event('pointerlockchange'));
      };
    });
    await page.goto(
      browserStageUrl(
        'primary-action',
        gameUrl(`http://127.0.0.1:${port}`, {
          startMod: houseNoonMod,
          hash: { debug: true, seed: 73, radius: 32, post: false, sunshadow: false, torchshadow: false },
        }),
        renderOverride,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#dominant-hand').selectOption('left');
    await page.locator('#go').click();
    await waitForWorldLoaded(page);
    await page.waitForFunction(() => {
      const overlay = document.querySelector('#overlay');
      return (
        globalThis.primaryActionTest && overlay instanceof HTMLElement && overlay.hidden && document.pointerLockElement
      );
    });
    const fixture = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.clearHand(r.dominant);
      r.clearHand(r.off);
      const mainItem = r.inventory.create('glowstick');
      const offItem = r.inventory.create('glowstick');
      r.setHand(r.dominant, mainItem);
      r.setHand(r.off, offItem);
      const senses = r.inventory.registry.senses.get('player');
      if (!senses) {
        throw new Error('The replay fixture needs player senses');
      }
      const minimumHoldSimSeconds = senses.light.throwMinimumHoldSimSeconds;
      const quickbarSlot = 0;
      r.quickbar.assign(quickbarSlot, offItem);
      const headlamp = r.inventory.create('headlamp');
      if (!r.inventory.add(headlamp, { kind: 'worn' })) {
        throw new Error('Could not wear the replay fixture headlamp');
      }
      return {
        mainUid: mainItem.uid,
        offUid: offItem.uid,
        headlampUid: headlamp.uid,
        minimumHoldSimSeconds,
        quickbarSlot,
      };
    });
    await page.evaluate((offUid) => {
      const r = globalThis.primaryActionTest;
      const offItem = r.inventory.itemByUid(offUid);
      if (!offItem) {
        throw new Error('The replay fixture off-hand item is missing');
      }
      const hasFreeWornPocket = () =>
        Object.values(r.inventory.worn).some((owner) =>
          owner?.pockets?.some((_, pocket) => r.inventory.plan(offItem, { kind: 'pocket', owner, pocket }).ok),
        );
      const freeSlot = /** @type {const} */ (['waist', 'back', 'torso']).find((slot) => !r.inventory.worn[slot]);
      if (!hasFreeWornPocket() && freeSlot) {
        const type = { waist: 'fanny_pack', back: 'hiking_backpack', torso: 'utility_vest' }[freeSlot];
        r.inventory.add(r.inventory.create(type), { kind: 'worn' });
      }
      if (!hasFreeWornPocket()) {
        throw new Error('Could not provide a worn pocket for the replay fixture');
      }
    }, fixture.offUid);
    await page.waitForFunction(() => {
      const { held } = globalThis.primaryActionTest.view;
      return held.heldItemPosition('left') !== undefined && held.heldItemPosition('right') !== undefined;
    });
    await pressAction(page, 'player.throw');
    await page.waitForFunction(() => globalThis.primaryActionTest.isThrowingStance());
    await page.evaluate((slot) => {
      const r = globalThis.primaryActionTest;
      r.startInputReplayRecording();
      r.dropAfterNextThrowCommit = true;
      r.quickbarTapAfterNextThrowCommit = slot;
      r.quickbarTapItemUid = r.quickbar.slots[slot];
      r.quickbarTapCommitObservation = undefined;
      r.quickbarTapTickObservation = undefined;
    }, fixture.quickbarSlot);
    const releaseWornLight = await holdAction(page, 'light.worn-toggle');
    await page.waitForFunction(
      (uid) => globalThis.primaryActionTest.inventory.itemByUid(uid)?.on === true,
      fixture.headlampUid,
    );
    await releaseWornLight();
    const releaseThrow = await mouseCharge(page);
    await page.waitForFunction(() => globalThis.primaryActionTest.isChargingItemThrow());
    const chargeStart = await page.evaluate(() => globalThis.primaryActionTest.session.sim.time);
    await waitForSimulation(
      page,
      throwChargeSample,
      { start: chargeStart, seconds: fixture.minimumHoldSimSeconds },
      {
        seconds: fixture.minimumHoldSimSeconds + 0.1,
        label: 'two-hand replay fixture reaches the minimum throw charge',
        record: (line) => process.stderr.write(`${line}\n`),
      },
    );
    await releaseThrow();
    await page.waitForFunction((ids) => {
      const r = globalThis.primaryActionTest;
      const off = r.inventory.itemByUid(ids.offUid);
      const offLocation = off && r.inventory.locate(off);
      const main = r.inventory.itemByUid(ids.mainUid);
      if (!main) {
        throw new Error('The replay fixture main-hand item is missing');
      }
      const recorder = r.inputRecorder;
      if (!recorder) {
        throw new Error('No input recording is running');
      }
      return (
        offLocation?.kind === 'pile' &&
        r.inventory.locate(main)?.kind === 'pile' &&
        r.quickbarTapCommitObservation &&
        r.quickbarTapTickObservation &&
        recorder.copyInputs().actions.some((action) => action.action === 'item.throw') &&
        recorder.copyInputs().actions.some((action) => action.action === 'quickbar.tap.1') &&
        recorder.copyInputs().actions.some((action) => action.action === 'item.drop')
      );
    }, fixture);
    const liveThrowOutcome = await page.evaluate((ids) => {
      const r = globalThis.primaryActionTest;
      const off = r.inventory.itemByUid(ids.offUid);
      const main = r.inventory.itemByUid(ids.mainUid);
      const offLocation = off && r.inventory.locate(off);
      const mainLocation = main && r.inventory.locate(main);
      return {
        offLocation: offLocation?.kind === 'pile' ? offLocation.pile.pos : offLocation?.kind,
        mainLocation: mainLocation?.kind === 'pile' ? mainLocation.pile.pos : mainLocation?.kind,
        bodyPosition: [...r.session.body.pos],
        look: [r.input.controls.yaw, r.input.controls.pitch],
        quickbarTapCommit: r.quickbarTapCommitObservation,
        quickbarTapTick: r.quickbarTapTickObservation,
      };
    }, fixture);
    /** @param {string} action */
    const command = async (action) =>
      page.evaluate(
        async ({ id, moduleUrl }) => {
          const { keyboardInput } = await import(moduleUrl);
          keyboardInput.command({ action: id, phase: 'down', at: performance.now() });
        },
        { id: action, moduleUrl: inputBindingsModule },
      );
    await command('debug.panel-toggle');
    const liveEndSnapshot = await page.evaluate(
      async ({ id, moduleUrl }) => {
        const { keyboardInput } = await import(moduleUrl);
        const r = globalThis.primaryActionTest;
        const snapshot = r.captureSnapshot();
        keyboardInput.command({ action: id, phase: 'down', at: performance.now() });
        return snapshot;
      },
      { id: 'debug.input-replay-export', moduleUrl: inputBindingsModule },
    );
    await page.waitForFunction(() => {
      const link = document.querySelector('#replay-download');
      return link instanceof HTMLElement && link.hidden === false;
    });
    const replayText = await page.evaluate(() => {
      const link = document.querySelector('#replay-download');
      if (!(link instanceof HTMLAnchorElement && link.href.startsWith('blob:'))) {
        throw new Error('Throw replay export did not create a downloadable artifact');
      }
      return fetch(link.href).then((response) => response.text());
    });
    const artifact = /** @type {ReplayArtifact} */ (JSON.parse(replayText));
    assert.equal(artifact.actions.filter(({ action }) => action === 'item.throw').length, 1);
    assert.equal(artifact.actions.filter(({ action }) => action === 'item.drop').length, 1);
    assert.equal(
      artifact.actions.filter(({ action }) => action === 'light.worn-toggle').length,
      1,
      'one worn-light hold records one toggle',
    );
    assert.equal(artifact.startState.throwingStance, true, 'the exported segment starts in throwing stance');
    const throwActionIndex = artifact.actions.findIndex(({ action }) => action === 'item.throw');
    assert.equal(artifact.actions.filter(({ action }) => action === 'quickbar.tap.1').length, 1);
    const quickbarActionIndex = artifact.actions.findIndex(({ action }) => action === 'quickbar.tap.1');
    const dropActionIndex = artifact.actions.findIndex(({ action }) => action === 'item.drop');
    assert(quickbarActionIndex > throwActionIndex, 'the same-sample quickbar action follows the throw');
    assert(dropActionIndex > quickbarActionIndex, 'the same-sample drop follows the quickbar action');
    assert.equal(artifact.actions[quickbarActionIndex]?.tick, artifact.actions[throwActionIndex]?.tick);
    assert.equal(artifact.actions[dropActionIndex]?.tick, artifact.actions[throwActionIndex]?.tick);
    const replayRestart = page.waitForEvent('load');
    await command('debug.input-replay-import');
    await page.locator('#input-replay-file').setInputFiles({
      name: 'two-hand-throw-replay.json',
      mimeType: 'application/json',
      buffer: Buffer.from(replayText),
    });
    await replayRestart;
    await page.waitForFunction(() => document.querySelector('#input-replay-status'));
    await page.waitForFunction(
      () => {
        const status = document.querySelector('#input-replay-status');
        return (
          status instanceof HTMLElement && ['verified', 'diverged', 'unavailable'].includes(status.dataset.state ?? '')
        );
      },
      undefined,
      { timeout: 20_000 },
    );
    const replayState = await page.locator('#input-replay-status').getAttribute('data-state');
    const { replayEndSnapshot, replayThrowOutcome } = await page.evaluate((ids) => {
      const r = globalThis.primaryActionTest;
      const off = r.inventory.itemByUid(ids.offUid);
      const main = r.inventory.itemByUid(ids.mainUid);
      const offLocation = off && r.inventory.locate(off);
      const mainLocation = main && r.inventory.locate(main);
      return {
        replayEndSnapshot: r.captureSnapshot(),
        replayThrowOutcome: {
          offLocation: offLocation?.kind === 'pile' ? offLocation.pile.pos : offLocation?.kind,
          mainLocation: mainLocation?.kind === 'pile' ? mainLocation.pile.pos : mainLocation?.kind,
          bodyPosition: [...r.session.body.pos],
          look: [r.input.controls.yaw, r.input.controls.pitch],
        },
      };
    }, fixture);
    let endSnapshotDifference = '';
    try {
      assert.deepEqual(replayEndSnapshot, liveEndSnapshot);
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      endSnapshotDifference = error.message;
    }
    if (replayState !== 'verified') {
      process.stderr.write(
        `Throw replay ${replayState}: ${JSON.stringify({
          snapshotDifference: endSnapshotDifference,
          liveThrowOutcome,
          replayThrowOutcome,
        })}\n`,
      );
    }
    const items = await page.evaluate((ids) => {
      const r = globalThis.primaryActionTest;
      const off = r.inventory.itemByUid(ids.offUid);
      const main = r.inventory.itemByUid(ids.mainUid);
      const offLocation = off && r.inventory.locate(off);
      const mainLocation = main && r.inventory.locate(main);
      return {
        offKind: offLocation?.kind,
        mainKind: mainLocation?.kind,
        hands: Object.values(r.inventory.hands)
          .filter(Boolean)
          .map(({ uid }) => uid),
      };
    }, fixture);
    assert.deepEqual(
      items,
      {
        offKind: 'pile',
        mainKind: 'pile',
        hands: [],
      },
      'replay throws the off-hand item before dropping the remaining held item',
    );
    assert.equal(
      await page.evaluate((uid) => globalThis.primaryActionTest.inventory.itemByUid(uid)?.on, fixture.headlampUid),
      true,
      'replay switches the worn headlamp on as the recording did',
    );
    assert.deepEqual(
      replayThrowOutcome.offLocation,
      liveThrowOutcome.offLocation,
      'replay lands the throw in the same cell',
    );
    assert.deepEqual(replayThrowOutcome.mainLocation, liveThrowOutcome.mainLocation);
    assert.deepEqual(liveThrowOutcome.quickbarTapCommit, { itemMoveQueued: false, location: 'hand' });
    assert.deepEqual(liveThrowOutcome.quickbarTapTick, { itemMoveQueued: false, location: 'pile' });
    assert.equal(replayState, 'verified', `replay end state differs: ${JSON.stringify(endSnapshotDifference)}`);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
};

/** @type {StageCase} */
const verifyAdsFireReplay = async (browserInstance, port, renderOverride) => {
  const context = await browserInstance.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    /** @type {string[]} */
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      let locked = false;
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        get: () => (locked ? (document.querySelector('#view canvas') ?? document.querySelector('#view')) : null),
      });
      Element.prototype.requestPointerLock = () => {
        locked = true;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      };
      document.exitPointerLock = () => {
        locked = false;
        document.dispatchEvent(new Event('pointerlockchange'));
      };
    });
    await page.goto(
      browserStageUrl(
        'primary-action',
        gameUrl(`http://127.0.0.1:${port}`, {
          startMod: houseNoonMod,
          hash: { debug: true, seed: 73, radius: 32, post: false, sunshadow: false, torchshadow: false },
        }),
        renderOverride,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#dominant-hand').selectOption('left');
    await page.locator('#go').click();
    await waitForWorldLoaded(page);
    await page.waitForFunction(() => {
      const overlay = document.querySelector('#overlay');
      return (
        globalThis.primaryActionTest && overlay instanceof HTMLElement && overlay.hidden && document.pointerLockElement
      );
    });
    const firearm = await page.evaluate(
      async ({ firearmModule, magazineModuleUrl, optionsModuleUrl }) => {
        const { firearmHandlingFor, spentCaseItemId } = await import(firearmModule);
        const { magazineSpec, magazineWellCalibre } = await import(magazineModuleUrl);
        const { stowTarget } = await import(optionsModuleUrl);
        const r = globalThis.primaryActionTest;
        const { registry } = r.inventory;
        const { firearms, magazines, queue, sim } = r.session;
        /** @param {string | undefined} refusal */
        const must = (refusal) => {
          if (refusal) {
            throw new Error(`Could not ready the replay firearm: ${refusal}`);
          }
        };
        const settle = () => {
          for (let step = 0; queue.busy; step += 1) {
            if (step > 600) {
              throw new Error('Replay firearm handling did not finish');
            }
            r.session.frame(1 / 20);
          }
        };
        const gunType = 'rifle_ak';
        const calibre = magazineWellCalibre(registry, gunType);
        const ids = [...registry.items.keys()].sort();
        const magazineType = ids.find((id) => magazineSpec(registry, id)?.calibre === calibre);
        const ammoType = ids.find((id) => registry.items.get(id)?.ammo?.calibre === calibre);
        if (magazineType === undefined || ammoType === undefined) {
          throw new Error(`The replay firearm needs a magazine and ammunition for ${calibre}`);
        }
        const magazine = r.inventory.create(magazineType);
        r.placePocketed(r.inventory.create(ammoType));
        r.clearHand('right');
        r.setHand('left', magazine);
        must(magazines.loadNext(magazine.uid, sim.time));
        settle();
        const pocket = stowTarget(r.inventory, magazine, r.feet());
        if (pocket?.kind !== 'pocket' || !r.inventory.move(magazine, pocket).ok) {
          throw new Error('Could not pocket the loaded replay magazine');
        }
        const gun = r.inventory.create(gunType);
        /** @param {import('@skelly/engine/inventory').Item | undefined} child */
        const isOptic = (child) => {
          const modelId = child && registry.items.get(child.type)?.model;
          const model = modelId === undefined ? undefined : registry.models.get(modelId);
          return model?.gun?.attachment?.sight?.kind === 'optic';
        };
        for (const [slot, child] of Object.entries(gun.slots ?? {})) {
          if (isOptic(child)) {
            r.inventory.fitSlot(gun, slot, undefined);
          }
        }
        r.setHand('left', gun);
        must(firearms.loadNext(gun.uid, sim.time));
        settle();
        must(firearms.cock(gun.uid, sim.time));
        settle();
        const caseType = spentCaseItemId(firearmHandlingFor(gun, registry).calibre);
        const cases = [...r.inventory.piles.values()]
          .flatMap((pile) => pile.items)
          .filter(({ item }) => item.type === caseType)
          .reduce((sum, { item }) => sum + item.count, 0);
        return { uid: gun.uid, caseType, cases };
      },
      {
        firearmModule: firearmHandlingModule,
        magazineModuleUrl: magazineModule,
        optionsModuleUrl: optionsModule,
      },
    );
    await page.mouse.down({ button: 'right' });
    const raiseDuration = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      r.session.frame(1 / 60);
      const readying = r.inventory.itemByUid(uid)?.firearm?.readying;
      if (!readying) {
        throw new Error('The replay firearm is not readying after the right press');
      }
      return readying.duration;
    }, firearm.uid);
    await page.evaluate((duration) => globalThis.primaryActionTest.session.frame(duration), raiseDuration);
    await page.waitForFunction((uid) => globalThis.primaryActionTest.session.firearms.isReady(uid), firearm.uid);
    await page.mouse.click(640, 450, { button: 'middle' });
    await page.waitForFunction(() => globalThis.primaryActionTest.input.controls.aimingDownSights);
    // Long-gun ADS arrives through its Combat-owned acquisition, so the pose checks wait for it.
    await page.waitForFunction((uid) => globalThis.primaryActionTest.session.firearms.isAdsAcquired(uid), firearm.uid);
    await page.waitForFunction(() =>
      globalThis.primaryActionTest.view.playerMeshes.group.getObjectByName('held-item-left'),
    );
    const adsFrame = await page.evaluate(() => globalThis.primaryActionTest.frames);
    await page.waitForFunction((frame) => globalThis.primaryActionTest.frames > frame + 1, adsFrame);
    const irons = await page.evaluate(
      async ({ uid, moduleUrl }) => {
        const r = globalThis.primaryActionTest;
        const { modelToView } = await import(moduleUrl);
        const { registry } = r.inventory;
        const sightedModel = () => {
          const item = r.inventory.itemByUid(uid);
          const modelId = item && registry.items.get(item.type)?.model;
          const found = modelId === undefined ? undefined : registry.models.get(modelId);
          const grip = found?.grip;
          const gunSight = found?.gun?.sight;
          const butt = found?.hands?.butt;
          if (!(grip && gunSight && found.hands && butt)) {
            throw new Error('The replay firearm model needs a grip, a sight and a butt point');
          }
          return { model: found, grip, sight: gunSight, hands: found.hands, buttPoint: butt };
        };
        const { model, grip, sight, hands, buttPoint } = sightedModel();
        const [gripX, gripY, gripZ] = grip.at;
        /**
         * @param {readonly [number, number, number]} point
         * @returns {[number, number, number]}
         */
        const fromGrip = ([x, y, z]) => [x - gripX, y - gripY, z - gripZ];
        const held = r.view.playerMeshes.group.getObjectByName('held-item-left');
        const head = r.view.playerMeshes.group.getObjectByName('figure-head');
        if (!(held && head)) {
          throw new Error('The ADS pose check needs the held gun and the figure head');
        }
        // Page code cannot import three, so new vectors are clones of one the scene already has.
        const vector = (x = 0, y = 0, z = 0) => r.engine.camera.position.clone().set(x, y, z);
        const ocular = modelToView(model, fromGrip(sight.eye));
        const worldOcular = held.localToWorld(vector(...ocular));
        const direction = vector(...modelToView(model, sight.direction)).transformDirection(held.matrixWorld);
        const cameraDelta = r.engine.camera.position.clone().sub(worldOcular);
        const figure = r.inventory.registry.figures.get('player');
        if (!figure) {
          throw new Error('The ADS pose check needs the player figure and its body anchors');
        }
        const bodyAnchors = () => {
          const anchors = registry.models.get(figure.body.model)?.anchors;
          if (!anchors) {
            throw new Error('The ADS pose check needs the player figure and its body anchors');
          }
          const [left, right] = figure.body.eyes.map((name) => anchors[name]);
          const pivot = anchors[figure.body.head.pivot];
          if (!(left && right && pivot)) {
            throw new Error('The player body model lacks its eye or head-pivot anchors');
          }
          return { leftEye: left, rightEye: right, headPivot: pivot };
        };
        const { leftEye, rightEye, headPivot } = bodyAnchors();
        const anatomicalEye = vector(...leftEye)
          .add(vector(...rightEye))
          .multiplyScalar(0.5)
          .sub(vector(...headPivot));
        head.localToWorld(anatomicalEye);
        const butt = held.localToWorld(vector(...modelToView(model, fromGrip(buttPoint))));
        const shoulder = vector();
        r.view.playerMeshes.shoulderPosition('left', shoulder);
        return {
          kind: sight.kind,
          lineError: cameraDelta.clone().cross(direction).length(),
          eyeDistance: -cameraDelta.dot(direction),
          eyeRange: sight.eyeDistanceRangeMetres,
          cameraOffset: r.engine.camera.position.distanceTo(anatomicalEye),
          cameraLimit: hands.ads?.cameraOffsetLimitMetres ?? figure.aimPose.ads.cameraOffsetLimitMetres,
          shoulderLimit: hands.ads?.stockShoulderLimitMetres ?? figure.aimPose.ads.stockShoulderLimitMetres,
          shoulderError: butt.distanceTo(shoulder),
          roll: r.engine.camera.rotation.z,
        };
      },
      { uid: firearm.uid, moduleUrl: heldPoseModule },
    );
    assert.equal(irons.kind, 'iron');
    assert(irons.lineError < 1e-6, `unobstructed ADS camera lies on the physical sight line: ${irons.lineError} m`);
    const { eyeRange } = irons;
    assert(eyeRange, 'the iron sight exports an eye range');
    assert(
      irons.eyeDistance >= eyeRange[0] - 1e-6 && irons.eyeDistance <= eyeRange[1] + 1e-6,
      'ADS camera stays inside the exported iron eye range',
    );
    assert(
      irons.cameraOffset <= irons.cameraLimit + 1e-6,
      'ADS camera stays inside its authored body-eye offset bound',
    );
    assert(irons.shoulderError <= irons.shoulderLimit + 1e-6, `ADS retains shoulder contact: ${irons.shoulderError} m`);
    assert(Math.abs(irons.roll) < 1e-6, 'head cant does not roll the camera');
    await page.keyboard.down('KeyQ');
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      return r.session.leanAmount < 0 && Math.abs(r.engine.camera.rotation.z) > 1e-6;
    });
    const recordedLean = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.startInputReplayRecording();
      return r.session.leanAmount;
    });
    const replayPreludeStart = await page.evaluate(() => globalThis.primaryActionTest.session.sim.time);
    await waitForSimulation(
      page,
      progressingSample,
      { start: replayPreludeStart },
      {
        seconds: 0.35,
        label: 'ADS replay records a held-ready prelude before firing',
        record: (line) => process.stderr.write(`${line}\n`),
      },
    );
    await page.mouse.click(640, 450);
    await page.waitForFunction(({ cases, caseType }) => {
      const r = globalThis.primaryActionTest;
      const count = [...r.inventory.piles.values()]
        .flatMap((pile) => pile.items)
        .filter(({ item }) => item.type === caseType)
        .reduce((sum, { item }) => sum + item.count, 0);
      const recorder = r.inputRecorder;
      if (!recorder) {
        throw new Error('No input recording is running');
      }
      return count === cases + 1 && recorder.copyInputs().frames.length > 0;
    }, firearm);
    await page.keyboard.up('KeyQ');
    await page.mouse.click(640, 450, { button: 'middle' });
    await page.waitForFunction(() => {
      const recorder = globalThis.primaryActionTest.inputRecorder;
      if (!recorder) {
        throw new Error('No input recording is running');
      }
      return recorder.copyInputs().actions.some(({ action }) => action === 'aim.ads-toggle');
    });
    assert.equal(await page.evaluate(() => globalThis.primaryActionTest.input.controls.aimingDownSights), false);
    /** @param {string} action */
    const command = async (action) =>
      page.evaluate(
        async ({ id, moduleUrl }) => {
          const { keyboardInput } = await import(moduleUrl);
          keyboardInput.command({ action: id, phase: 'down', at: performance.now() });
        },
        { id: action, moduleUrl: inputBindingsModule },
      );
    await command('ui.inventory-toggle');
    await page.waitForFunction(() => globalThis.primaryActionTest.screen.isOpen);
    await command('ui.inventory-toggle');
    await page.waitForFunction(() => !globalThis.primaryActionTest.screen.isOpen);
    const afterInventoryClose = await page.evaluate(() => globalThis.primaryActionTest.session.sim.time);
    await page.mouse.click(640, 450);
    await waitForSimulation(
      page,
      progressingSample,
      { start: afterInventoryClose },
      {
        seconds: 0.35,
        label: 'ready was cancelled by opening and closing inventory',
        record: (line) => process.stderr.write(`${line}\n`),
      },
    );
    const liveCasesAfterCancel = await page.evaluate((caseType) => {
      const r = globalThis.primaryActionTest;
      return [...r.inventory.piles.values()]
        .flatMap((pile) => pile.items)
        .filter(({ item }) => item.type === caseType)
        .reduce((sum, { item }) => sum + item.count, 0);
    }, firearm.caseType);
    assert.equal(liveCasesAfterCancel, firearm.cases + 1, 'live does not fire again after inventory cancels readiness');
    await command('debug.panel-toggle');
    const liveEnd = await page.evaluate(
      async ({ id, moduleUrl, uid }) => {
        const { keyboardInput } = await import(moduleUrl);
        const r = globalThis.primaryActionTest;
        const recorder = r.inputRecorder;
        if (!recorder) {
          throw new Error('No input recording is running');
        }
        const result = {
          snapshot: r.captureSnapshot(),
          startState: recorder.copyInputs().startState,
          firearm: r.inventory.itemByUid(uid)?.firearm,
        };
        keyboardInput.command({ action: id, phase: 'down', at: performance.now() });
        return result;
      },
      { id: 'debug.input-replay-export', moduleUrl: inputBindingsModule, uid: firearm.uid },
    );
    assert.deepEqual(liveEnd.startState, {
      leanAmount: recordedLean,
      throwingStance: false,
      readyHeld: true,
      aimingDownSights: true,
      inventoryOpen: false,
    });
    await page.waitForFunction(() => {
      const link = document.querySelector('#replay-download');
      return link instanceof HTMLElement && link.hidden === false;
    });
    const replayText = await page.evaluate(() => {
      const link = document.querySelector('#replay-download');
      if (!(link instanceof HTMLAnchorElement && link.href.startsWith('blob:'))) {
        throw new Error('ADS replay export did not create a downloadable artifact');
      }
      return fetch(link.href).then((response) => response.text());
    });
    const artifact = /** @type {ReplayArtifact} */ (JSON.parse(replayText));
    assert.deepEqual(artifact.startState, liveEnd.startState);
    assert(
      artifact.actions.some(({ action }) => action === 'aim.ads-toggle'),
      'the replay records the mid-segment ADS toggle',
    );
    const replayRestart = page.waitForEvent('load');
    await command('debug.input-replay-import');
    await page.locator('#input-replay-file').setInputFiles({
      name: 'ads-fire-replay.json',
      mimeType: 'application/json',
      buffer: Buffer.from(replayText),
    });
    await replayRestart;
    await page.waitForFunction(() => document.querySelector('#input-replay-status'));
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      const status = document.querySelector('#input-replay-status');
      return (
        r.input.controls.rightMouseHeld &&
        r.input.controls.aimingDownSights &&
        status instanceof HTMLElement &&
        status.dataset.state === 'playing'
      );
    });
    // Keep these reads in one evaluation so replay playback cannot advance between them.
    const { viewerMouseInput, viewerBlurInput } = await page.evaluate(() => {
      const { input, inputTarget } = globalThis.primaryActionTest;
      const read = () => ({
        rightMousePressPending: input.controls.rightMousePressPending,
        rightMouseActionHeld: input.controls.rightMouseActionHeld,
        rightMouseHeld: input.controls.rightMouseHeld,
        aimingDownSights: input.controls.aimingDownSights,
        dominantUseHeld: input.controls.dominantUseHeld,
      });
      /** @param {number} button */
      const click = (button) => {
        const before = read();
        inputTarget.dispatchEvent(new MouseEvent('mousedown', { button, bubbles: true }));
        globalThis.dispatchEvent(new MouseEvent('mouseup', { button, bubbles: true }));
        return { before, after: read() };
      };
      const unlocked = [click(1), click(0)];
      input.lock();
      const locked = [click(1), click(0)];
      const pointerLocked = input.locked;
      input.unlock();
      const readBlur = () => ({
        readyHeld: input.controls.rightMouseHeld,
        aimingDownSights: input.controls.aimingDownSights,
      });
      const before = readBlur();
      globalThis.dispatchEvent(new FocusEvent('blur'));
      return {
        viewerMouseInput: { unlocked, locked, pointerLocked },
        viewerBlurInput: { before, after: readBlur() },
      };
    });
    assert.equal(viewerMouseInput.pointerLocked, true);
    assert(
      [...viewerMouseInput.unlocked, ...viewerMouseInput.locked].every(
        ({ before, after }) => JSON.stringify(before) === JSON.stringify(after),
      ),
      'viewer clicks during replay cannot change readiness, ADS or dominant-use mouse state',
    );
    assert.deepEqual(
      viewerBlurInput.before,
      { readyHeld: true, aimingDownSights: true },
      'viewer blur lands while the replay holds readiness and ADS',
    );
    assert.equal(
      viewerBlurInput.after.readyHeld,
      viewerBlurInput.before.readyHeld,
      'viewer blur preserves replay readiness',
    );
    assert.equal(
      viewerBlurInput.after.aimingDownSights,
      viewerBlurInput.before.aimingDownSights,
      'viewer blur preserves replay ADS',
    );
    await page.waitForFunction(
      () => {
        const status = document.querySelector('#input-replay-status');
        return (
          status instanceof HTMLElement && ['verified', 'diverged', 'unavailable'].includes(status.dataset.state ?? '')
        );
      },
      undefined,
      { timeout: 20_000 },
    );
    const replay = await page.evaluate((fixture) => {
      const r = globalThis.primaryActionTest;
      const count = [...r.inventory.piles.values()]
        .flatMap((pile) => pile.items)
        .filter(({ item }) => item.type === fixture.caseType)
        .reduce((sum, { item }) => sum + item.count, 0);
      const status = document.querySelector('#input-replay-status');
      if (!(status instanceof HTMLElement)) {
        throw new Error('The ADS replay status is missing');
      }
      return {
        state: status.dataset.state,
        snapshot: r.captureSnapshot(),
        aimingDownSights: r.input.controls.aimingDownSights,
        readyHeld: r.input.controls.rightMouseHeld,
        cases: count,
        firearm: r.inventory.itemByUid(fixture.uid)?.firearm,
      };
    }, firearm);
    if (replay.state !== 'verified') {
      process.stderr.write(
        `ADS replay diagnostic: ${JSON.stringify({
          state: replay.state,
          liveFirearm: liveEnd.firearm,
          replayFirearm: replay.firearm,
          aimingDownSights: replay.aimingDownSights,
          readyHeld: replay.readyHeld,
          cases: replay.cases,
        })}\n`,
      );
    }
    assert.equal(replay.state, 'verified');
    assert.equal(replay.aimingDownSights, false);
    assert.equal(replay.readyHeld, false);
    assert.equal(replay.cases, firearm.cases + 1, 'the replayed firearm action fires a shot');
    assert.deepEqual(replay.snapshot, liveEnd.snapshot);
    const recordedAdsToggle = await page.evaluate(() =>
      globalThis.primaryActionTest.adsToggleObservations.find(({ replaying }) => replaying),
    );
    assert.deepEqual(recordedAdsToggle, { before: true, after: false, replaying: true, locked: false });
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
};

/** @type {StageCase} */
const verifyGroundPickup = async (browserInstance, port, renderOverride) => {
  const context = await browserInstance.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    /** @type {string[]} */
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      let locked = false;
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        get: () => (locked ? (document.querySelector('#view canvas') ?? document.querySelector('#view')) : null),
      });
      Element.prototype.requestPointerLock = () => {
        locked = true;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      };
      document.exitPointerLock = () => {
        locked = false;
        document.dispatchEvent(new Event('pointerlockchange'));
      };
    });
    await page.goto(
      browserStageUrl(
        'primary-action',
        gameUrl(`http://127.0.0.1:${port}`, {
          startMod: houseNoonMod,
          hash: { debug: true, seed: 73, radius: 64, post: false, sunshadow: false, torchshadow: false },
        }),
        renderOverride,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#dominant-hand').selectOption('left');
    await page.locator('#go').click();
    await waitForWorldLoaded(page);
    await page.waitForFunction(() => {
      const overlay = document.querySelector('#overlay');
      return (
        globalThis.primaryActionTest && overlay instanceof HTMLElement && overlay.hidden && document.pointerLockElement
      );
    });
    const placed = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const wornContainers = [...r.inventory.items()].filter(
        ({ item, location }) => location.kind === 'worn' && item.pockets?.length,
      );
      const itemDef = [...r.inventory.registry.items.values()].find(
        (def) =>
          def.size[0] === 1 &&
          def.size[1] === 1 &&
          !def.twoHanded &&
          def.pileDisplay !== 'scatter' &&
          wornContainers.some(({ item }) => {
            const container = r.inventory.registry.items.get(item.type);
            return container?.container?.pockets?.some(
              ({ grid }) => grid !== undefined && grid[0] >= 1 && grid[1] >= 1,
            );
          }),
      );
      const pocketOwner = wornContainers.find(({ item }) => {
        const container = r.inventory.registry.items.get(item.type);
        return container?.container?.pockets?.some(({ grid }) => grid !== undefined && grid[0] >= 1 && grid[1] >= 1);
      })?.item;
      if (!(itemDef && pocketOwner)) {
        throw new Error('Ground pickup fixture lacks an available worn pocket or small item');
      }
      const floor = r.feet();
      // Pickup gestures need a visible floor target, not one behind the leaned anatomical eye.
      floor[2] += 1;
      const first = r.inventory.create(itemDef.id);
      if (!r.inventory.add(first, { kind: 'pile', pos: floor })) {
        throw new Error('Could not place tap-pickup fixture');
      }
      return { ownerUid: pocketOwner.uid, itemUid: first.uid, itemType: itemDef.id, model: itemDef.model, floor };
    });
    // A pile lays out a loaded model where its model sits, so aim only once that layout is final.
    await page.waitForFunction((model) => !model || globalThis.primaryActionTest.view.models.has(model), placed.model);
    const fixture = await page.evaluate(
      async ({ pileLayoutModuleUrl, playerLookPoseModuleUrl, inputModuleUrl, ground }) => {
        const r = globalThis.primaryActionTest;
        const { pileItemPosition } = await import(pileLayoutModuleUrl);
        const { playerEyePosition } = await import(playerLookPoseModuleUrl);
        const { LOOK_PITCH_LIMIT } = await import(inputModuleUrl);
        const { itemUid } = ground;
        const pile = [...r.inventory.piles.values()].find(({ items }) =>
          items.some(({ item }) => item.uid === itemUid),
        );
        const target = pileItemPosition(r.inventory.registry, pile, itemUid, {
          blockSize: r.scale.blockSize,
          /** @param {string} id */
          hasModel: (id) => r.view.models.has(id),
        }).map(/** @param {number} metres */ (metres) => metres / r.scale.blockSize);
        const feetDx = target[0] - r.session.body.pos[0];
        const feetDz = target[2] - r.session.body.pos[2];
        r.input.controls.yaw = Math.atan2(-feetDx, -feetDz);
        // Pitch changes the eye position too, so solve the aim against the posed eye.
        let low = -LOOK_PITCH_LIMIT;
        let high = 0;
        for (let step = 0; step < 32; step += 1) {
          const pitch = (low + high) / 2;
          const posedEye = playerEyePosition({
            feet: r.session.body.pos,
            soleLiftMetres: r.session.playerSoleLiftMetres,
            blockSize: r.scale.blockSize,
            yaw: r.input.controls.yaw,
            pitch,
            stance: r.session.stance,
            figure: r.inventory.registry.figures.get('player'),
            models: r.inventory.registry.models,
          });
          const dx = target[0] - posedEye[0];
          const dy = target[1] - posedEye[1];
          const dz = target[2] - posedEye[2];
          const forward = -dx * Math.sin(r.input.controls.yaw) - dz * Math.cos(r.input.controls.yaw);
          if (pitch < Math.atan2(dy, forward)) {
            low = pitch;
          } else {
            high = pitch;
          }
        }
        r.input.controls.pitch = (low + high) / 2;
        const targeted = r.interactionTargetAt();
        if (targeted?.kind !== 'item' || targeted.item.uid !== itemUid) {
          throw new Error('Posed-eye aim does not target the ground pickup fixture');
        }
        r.grabProgress = [];
        const updateHeld = r.view.updateHeld.bind(r.view);
        r.view.updateHeld = (dt, pose, light, handling) => {
          if (handling?.grab) {
            r.grabProgress.push(handling.grab.progress);
          }
          return updateHeld(dt, pose, light, handling);
        };
        return ground;
      },
      {
        pileLayoutModuleUrl: pileLayoutModule,
        playerLookPoseModuleUrl: '/@stage/@skelly/engine/internal/core/playerLookPose.ts',
        inputModuleUrl: '/@stage/@skelly/engine/internal/game/playerControls.ts',
        ground: placed,
      },
    );
    await pressAction(page, 'world.interact');
    await page.waitForFunction((uid) => {
      const { inventory } = globalThis.primaryActionTest;
      const item = inventory.itemByUid(uid);
      return item !== undefined && inventory.locate(item)?.kind === 'pocket';
    }, fixture.itemUid);
    const pocketed = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(uid);
      const location = item && r.inventory.locate(item);
      const recorder = r.inputRecorder;
      if (!recorder) {
        throw new Error('No input recording is running');
      }
      return {
        location,
        animation: r.grabProgress.some((progress) => progress > 0 && progress < 1),
        action: recorder.copyInputs().actions.find(({ payload }) => payload?.kind === 'item.pickup')?.payload,
      };
    }, fixture.itemUid);
    assert(pocketed.location?.kind === 'pocket', 'tap F pockets the targeted item');
    assert.equal(pocketed.location.owner.uid, fixture.ownerUid, 'tap F pockets the targeted item through handling');
    assert.equal(pocketed.animation, true, 'handling drives a visible reach-and-return pose');
    assert(pocketed.action?.kind === 'item.pickup', 'the replay records the pickup');
    assert.equal(pocketed.action.mode, 'pocket', 'the replay records the resolved tap gesture');

    const wieldUid = await page.evaluate(
      ({ floor, itemType }) => {
        const r = globalThis.primaryActionTest;
        const item = r.inventory.create(itemType);
        if (!r.inventory.add(item, { kind: 'pile', pos: floor })) {
          throw new Error('Could not place hold-pickup fixture');
        }
        return item.uid;
      },
      { floor: fixture.floor, itemType: fixture.itemType },
    );
    const release = await holdAction(page, 'world.interact');
    await page.waitForFunction((uid) => {
      const { inventory } = globalThis.primaryActionTest;
      const item = inventory.itemByUid(uid);
      return item !== undefined && inventory.locate(item)?.kind === 'hand';
    }, wieldUid);
    await release();
    const wielded = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(uid);
      const recorder = r.inputRecorder;
      if (!recorder) {
        throw new Error('No input recording is running');
      }
      return {
        location: item && r.inventory.locate(item),
        action: recorder
          .copyInputs()
          .actions.find(({ payload }) => payload?.kind === 'item.pickup' && payload.mode === 'wield')?.payload,
      };
    }, wieldUid);
    assert.equal(wielded.location?.kind, 'hand', 'holding F wields the targeted item');
    assert(wielded.action?.kind === 'item.pickup', 'the replay records the wielding pickup');
    assert.equal(wielded.action.itemUid, wieldUid, 'the replay records the resolved hold gesture');

    /** @param {'door' | 'fixed' | 'small'} fixtureKind */
    const aimFurnitureFixture = async (fixtureKind) => {
      const fixtureUid = await page.evaluate((kind) => {
        const r = globalThis.primaryActionTest;
        /** @param {import('@skelly/engine/content').FurnitureDef} def */
        const isPlainContainer = (def) =>
          def.container &&
          !def.mount &&
          !def.door &&
          !def.climbable &&
          !def.vehicle &&
          !def.scenarioGoal &&
          !def.cover &&
          r.liftsWhole(def) === (kind === 'small');
        const doorDef = [...r.inventory.registry.furniture.values()].find((def) =>
          kind === 'door' ? def.door : isPlainContainer(def),
        );
        if (!doorDef) {
          throw new Error('Door fixture is missing');
        }
        const floor = r.feet();
        // A piece on the near side extends away from the player, so a wide one keeps the same gap.
        /**
         * @param {number} offset
         * @param {number} extent
         */
        const away = (offset, extent) => (offset < 0 ? offset + 1 - extent : offset);
        /** @type {[number, number][]} */
        const offsets = [
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
          [3, 0],
          [-3, 0],
        ];
        for (const [dx, dz] of offsets) {
          const door = r.inventory.furnish({
            type: doorDef.id,
            ...(kind === 'fixed' ? { fixed: true } : {}),
            pos: [floor[0] + away(dx, doorDef.size[0]), floor[1], floor[2] + away(dz, doorDef.size[2])],
            size: doorDef.size,
            facing: 'n',
          });
          if (door) {
            return door.uid;
          }
        }
        throw new Error('Could not place a door for the F tap regression');
      }, fixtureKind);
      await page.waitForFunction(() => !globalThis.primaryActionTest.queue.busy);
      await page.evaluate((uid) => {
        const r = globalThis.primaryActionTest;
        const door = r.inventory.entities.byUid(uid);
        if (!door) {
          throw new Error('The furniture fixture is gone');
        }
        const { pos } = r.session.body;
        const dx = door.pos[0] + door.size[0] / 2 - pos[0];
        const dy = door.pos[1] + door.size[1] / 2 - (pos[1] + r.session.playerEyeHeightMetres / r.scale.blockSize);
        const dz = door.pos[2] + door.size[2] / 2 - pos[2];
        r.input.controls.yaw = Math.atan2(-dx, -dz);
        r.input.controls.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      }, fixtureUid);
      return fixtureUid;
    };
    const doorUid = await aimFurnitureFixture('door');
    await pressAction(page, 'world.interact');
    await page.waitForFunction(
      (uid) => globalThis.primaryActionTest.inventory.entities.byUid(uid)?.open === true,
      doorUid,
    );
    assert.equal(await actionRingShown(page), false, 'a door opens directly without movement choices');
    const fixedUid = await aimFurnitureFixture('fixed');
    const look = () =>
      page.evaluate(() => {
        const { yaw, pitch } = globalThis.primaryActionTest.input.controls;
        return { yaw, pitch };
      });
    // The ring lasts only while interact is held, and its release confirms the chosen entry.
    for (const way of ['push', 'drag']) {
      const releaseHold = await holdAction(page, 'world.interact');
      try {
        await waitForActionRing(page);
        if (way === 'push') {
          const lookBefore = await look();
          await pointActionMenu(page, way);
          assert.deepEqual(await look(), lookBefore, 'pointing at a ring entry holds the camera look');
        } else {
          await stepActionMenuTo(page, way, () => page.mouse.wheel(0, 100));
          // The arrow keys step the same ring: off the wheel's choice and back to it.
          await page.keyboard.press('ArrowRight');
          await page.waitForFunction((id) => {
            const entry = document.querySelector('#action-radial .radial-entry.selected');
            return (entry instanceof HTMLElement ? entry.dataset.action : undefined) !== id;
          }, way);
          await stepActionMenuTo(page, way, () => page.keyboard.press('ArrowLeft'));
        }
      } finally {
        await releaseHold();
      }
      await page.waitForFunction(
        ({ uid, way: expectedWay }) =>
          globalThis.primaryActionTest.inputRecorder
            ?.copyInputs()
            .actions.some(({ payload }) =>
              expectedWay === 'push'
                ? payload?.kind === 'furniture.slide' && payload.entityUid === uid && payload.way === 'push'
                : payload?.kind === 'furniture.lift' && payload.entityUid === uid && payload.floorLocked === true,
            ),
        { uid: fixedUid, way },
      );
      assert.equal(
        await page.evaluate(() => globalThis.primaryActionTest.queue.busy),
        false,
        'a fastened piece refuses movement rather than queuing a step',
      );
    }
    const movesRecorded = () =>
      page.evaluate((uid) => {
        const recorder = globalThis.primaryActionTest.inputRecorder;
        if (!recorder) {
          throw new Error('No input recording is running');
        }
        return recorder
          .copyInputs()
          .actions.filter(
            ({ payload }) =>
              (payload?.kind === 'furniture.slide' || payload?.kind === 'furniture.lift') && payload.entityUid === uid,
          ).length;
      }, fixedUid);
    const movesBeforeCancel = await movesRecorded();
    const releaseUnchosen = await holdAction(page, 'world.interact');
    try {
      await waitForActionRing(page);
    } finally {
      await releaseUnchosen();
    }
    await waitForActionRing(page, false);
    assert.equal(await movesRecorded(), movesBeforeCancel, 'releasing with nothing chosen moves nothing');
    await pressAction(page, 'world.interact');
    // The queued search proves the tap resolved to Search; waiting for it to finish adds only its game time.
    await page.waitForFunction(
      (uid) =>
        globalThis.primaryActionTest.queue.jobs.some(
          (job) => job.kind === 'action' && job.jobType === 'furniture.search' && job.params.entityUid === uid,
        ),
      fixedUid,
    );
    assert.equal(
      await page.evaluate(() => {
        const recorder = globalThis.primaryActionTest.inputRecorder;
        if (!recorder) {
          throw new Error('No input recording is running');
        }
        return recorder
          .copyInputs()
          .actions.some(({ payload }) => payload?.kind === 'furniture.interact' && payload.alternatives !== true);
      }),
      true,
      'a tap on movable furniture records a plain interaction that searches it',
    );
    await page.waitForFunction(
      () => !globalThis.primaryActionTest.queue.busy && globalThis.primaryActionTest.screen.isOpen,
    );
    await pressAction(page, 'ui.inventory-toggle');
    await page.waitForFunction(() => !globalThis.primaryActionTest.screen.isOpen);
    await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.clearHand(r.dominant);
      r.clearHand(r.off);
    });
    const smallUid = await aimFurnitureFixture('small');
    const releaseSingle = await holdAction(page, 'world.interact');
    try {
      await page.waitForFunction(
        (uid) => globalThis.primaryActionTest.inventory.entities.carrying()?.uid === uid,
        smallUid,
      );
      assert.equal(await actionRingShown(page), false, 'a sole furniture action lifts directly without a menu');
    } finally {
      await releaseSingle();
    }
    const singleLifts = await page.evaluate((uid) => {
      const recorder = globalThis.primaryActionTest.inputRecorder;
      if (!recorder) {
        throw new Error('No input recording is running');
      }
      return recorder
        .copyInputs()
        .actions.filter(({ payload }) => payload?.kind === 'furniture.lift' && payload.entityUid === uid).length;
    }, smallUid);
    assert.equal(singleLifts, 1, 'one hold dispatches the sole furniture action once');
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
};

/** @param {UidFixture & { owner: Location['kind'] }} fixture */
const vehicleServiceSample = ({ uid, owner }) => {
  const { inventory, session } = globalThis.primaryActionTest;
  const item = inventory.itemByUid(uid);
  return {
    time: session.sim.time,
    paused: session.sim.paused,
    job: session.sim.actions.job?.jobType ?? null,
    // Compression winding down after the work still holds world input, so F waits for it too.
    reached: item !== undefined && inventory.locate(item)?.kind === owner && !session.sim.compression.locksInput,
  };
};

/**
 * Opens the testHouse hatchback with F, then removes and refits one wheel through its inspection surface.
 * @param {Page} page
 */
const verifyVehicleService = async (page) => {
  // The fixture stands the player beside a serviceable part nothing rests on and hands them its tool.
  const fixture = await page.evaluate(async (moduleUrl) => {
    const r = globalThis.primaryActionTest;
    const { projectVehicleParts } = /** @type {typeof VehicleProjection} */ (await import(moduleUrl));
    const s = r.scale.blockSize;
    const [first] = r.session.vehicles.records;
    if (!first) {
      throw new Error('The vehicle service fixture has no vehicle');
    }
    const [vehicleId, vehicle] = first;
    const site = vehicle.sites.find(
      (candidate) => candidate.service && !vehicle.sites.some((other) => other.supportedBy.includes(candidate.id)),
    );
    const service = site?.service;
    if (!(site && service)) {
      throw new Error('The vehicle has no serviceable part that nothing rests on');
    }
    const parts = projectVehicleParts(r.inventory.registry, vehicleId, vehicle, s);
    const part = parts.find(({ fittingId }) => fittingId === site.id);
    const box = part?.boxes[0];
    if (!(part && box)) {
      throw new Error(`Vehicle site ${site.id} projects no part box`);
    }
    /** @param {{ min: readonly number[], max: readonly number[] }} bounds */
    const boxCentre = (bounds) => [0, 1, 2].map((axis) => ((bounds.min[axis] ?? 0) + (bounds.max[axis] ?? 0)) / 2);
    const { min, max } = box;
    const centre = boxCentre(box);
    const [centreX = 0, , centreZ = 0] = centre;
    // Out from the car's side by the part's half width plus a body's clearance: along the vehicle's x, across it.
    const sideX = Math.cos(part.transform.yaw);
    const sideZ = -Math.sin(part.transform.yaw);
    const outward = Math.sign((centreX - vehicle.origin[0] * s) * sideX + (centreZ - vehicle.origin[2] * s) * sideZ);
    const reachOut = Math.abs((max[0] - min[0]) * sideX + (max[2] - min[2]) * sideZ) / 2 + 0.4;
    r.session.body.pos = [
      (centreX + outward * sideX * reachOut) / s,
      vehicle.origin[1],
      (centreZ + outward * sideZ * reachOut) / s,
    ];
    r.session.body.vel = [0, 0, 0];
    if (!r.inventory.canReachVehicle(vehicleId)) {
      throw new Error('The vehicle service fixture stands out of the vehicle’s reach');
    }
    const serviceTool = () => {
      const [tool] = Object.keys(service.qualities);
      const needed = tool === undefined ? undefined : service.qualities[tool];
      if (tool === undefined || needed === undefined) {
        throw new Error(`Vehicle site ${site.id} needs no tool quality`);
      }
      const toolDef = [...r.inventory.registry.items.values()].find(
        (def) => (def.tool?.qualities[tool] ?? 0) >= needed && !def.twoHanded,
      );
      if (!toolDef) {
        throw new Error(`No one-handed tool has ${tool} ${needed}`);
      }
      return toolDef;
    };
    r.setHand(r.dominant, r.inventory.create(serviceTool().id));
    /** @param {number[]} target */
    const aim = ([x = 0, y = 0, z = 0]) => {
      const { pos } = r.session.body;
      const dx = x / s - pos[0];
      const dy = y / s - (pos[1] + r.session.playerEyeHeightMetres / s);
      const dz = z / s - pos[2];
      r.input.controls.yaw = Math.atan2(-dx, -dz);
      r.input.controls.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    };
    aim(centre);
    const fitted = vehicle.fittings.find(({ id }) => id === site.id)?.item;
    if (!fitted) {
      throw new Error(`Vehicle site ${site.id} has no fitted part`);
    }
    // With the part off, aiming at the part it rests on reopens the car.
    const supportBox = parts.find(({ fittingId }) => fittingId === site.supportedBy[0])?.boxes[0] ?? box;
    r.aimAtSupport = () => aim(boxCentre(supportBox));
    return { vehicleId, siteId: site.id, uid: fitted.uid, condition: fitted.condition };
  }, vehicleProjectionModule);

  /**
   * Under pointer lock the player clicks with the drawn menu cursor, which the game moves and presses for them.
   * @param {string} selector
   */
  const clickThroughMenuCursor = async (selector) => {
    const target = page.locator(selector);
    await target.waitFor({ state: 'visible', timeout: 5000 });
    await target.scrollIntoViewIfNeeded();
    const bounds = await target.boundingBox();
    assert(bounds, `${selector} is laid out`);
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const { x, y, canvasSelector } = await page.evaluate(() => ({
      x: globalThis.primaryActionTest.input.cursorX,
      y: globalThis.primaryActionTest.input.cursorY,
      canvasSelector: document.querySelector('#view canvas') ? '#view canvas' : '#view',
    }));
    await page.evaluate(dispatchMenuPointerMove, {
      canvasSelector,
      movementX: point.x - x,
      movementY: point.y - y,
    });
    await page.evaluate(dispatchMenuPointerClick, { canvasSelector });
  };
  const openVehicle = async () => {
    await pressAction(page, 'world.interact');
    await page
      .locator(`#inventory [data-around-section="vehicle"][data-vehicle-id="${fixture.vehicleId}"]`)
      .waitFor({ state: 'visible', timeout: 5000 });
  };
  /**
   * @param {'remove' | 'install'} kind
   * @param {Location['kind']} owner
   */
  const work = async (kind, owner) => {
    await clickThroughMenuCursor(
      `#inventory [data-vehicle-site="${fixture.siteId}"] button[data-vehicle-work="${kind}"][data-item-uid="${fixture.uid}"]`,
    );
    await waitForSimulation(
      page,
      vehicleServiceSample,
      { uid: fixture.uid, owner },
      {
        seconds: 120,
        label: `vehicle ${kind} reaches its ${owner} owner`,
        record: (line) => process.stdout.write(`${line}\n`),
      },
    );
  };

  await openVehicle();
  await work('remove', 'pile');
  await page.evaluate(() => globalThis.primaryActionTest.aimAtSupport());
  await openVehicle();
  await work('install', 'vehicle');

  // A read-only witness: the same UID, at the same site, in exactly one saved owner.
  // Placed entities number their UIDs apart from items, so a saved copy must match the item's type too.
  const witness = await page.evaluate(({ uid }) => {
    const r = globalThis.primaryActionTest;
    const item = r.inventory.itemByUid(uid);
    if (!item) {
      throw new Error(`Vehicle part ${uid} is gone`);
    }
    const saved = JSON.parse(
      JSON.stringify(r.session.snapshot({ worldId: 'vehicle-world', characterId: 'vehicle-actor' })),
    );
    /**
     * @param {unknown} value
     * @returns {number}
     */
    const countCopies = (value) => {
      if (value === null || typeof value !== 'object') {
        return 0;
      }
      const own = 'uid' in value && value.uid === uid && 'type' in value && value.type === item.type ? 1 : 0;
      return own + Object.values(value).reduce((sum, child) => sum + countCopies(child), 0);
    };
    return {
      location: r.inventory.locate(item),
      condition: item.condition,
      savedCopies: countCopies(saved),
    };
  }, fixture);
  assert(witness.location?.kind === 'vehicle', 'the part is refitted to the car');
  assert.equal(witness.location.vehicleId, fixture.vehicleId);
  assert.equal(witness.location.fittingId, fixture.siteId, 'the part returns to the selected site');
  assert.equal(witness.condition, fixture.condition, 'service keeps the part’s condition');
  assert.equal(witness.savedCopies, 1, 'the part has exactly one saved owner');
};

const vite = await createStageServer({
  configFile: resolve(projectRoot, 'vite.config.ts'),
  root: projectRoot,
  logLevel: 'error',
  plugins: [observationPlugin],
  server: { host: '127.0.0.1', port: 0 },
});
/** @type {Browser | undefined} */
let browser;
try {
  await timePhase('vite-listen', () => vite.listen());
  const port = listeningPort(vite);
  const renderOverride = process.env.SKELLY_TEST_RENDER_MODE;
  if (renderOverride !== undefined && renderOverride !== 'pixel' && renderOverride !== 'render-free') {
    throw new Error(`Unknown browser render mode: ${renderOverride}`);
  }
  const renderMode = browserStageMode('primary-action', renderOverride);
  const stageBrowser = await timePhase('browser-launch', () =>
    launchChromium('primary-action', {
      headless: true,
      args: renderMode === 'pixel' ? ['--enable-webgl'] : [],
      renderMode: renderOverride,
    }),
  );
  browser = stageBrowser;
  const newFlowPage = async () => {
    const page = await stageBrowser.newPage({ viewport: { width: 1280, height: 720 } });
    /** @type {string[]} */
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      let locked = false;
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        get: () => (locked ? (document.querySelector('#view canvas') ?? document.querySelector('#view')) : null),
      });
      Element.prototype.requestPointerLock = () => {
        locked = true;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      };
      document.exitPointerLock = () => {
        locked = false;
        document.dispatchEvent(new Event('pointerlockchange'));
      };
      globalThis.acceptedCreation = [];
      document.addEventListener(
        'click',
        (event) => {
          if (event.target instanceof Element && event.target.closest('#go')) {
            globalThis.acceptedCreation.push({
              trusted: event.isTrusted,
              actorExists: Boolean(globalThis.primaryActionTest),
            });
          }
        },
        true,
      );
    });
    if (renderMode === 'render-free') {
      await page.addInitScript(() => {
        globalThis.renderFreeWitness = { webglRequests: [] };
        const { getContext } = HTMLCanvasElement.prototype;
        // Defined, not assigned, because no one function satisfies every typed `getContext` overload; the attributes
        // are the native method's.
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
          configurable: true,
          writable: true,
          /**
           * @this {HTMLCanvasElement}
           * @param {string} kind
           * @param {unknown} [options]
           */
          value(kind, options) {
            if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') {
              globalThis.renderFreeWitness.webglRequests.push(kind);
              throw new Error(`render-free stage requested ${kind}`);
            }
            return getContext.call(this, kind, options);
          },
        });
      });
    }
    return { page, pageErrors };
  };
  if (group === 'flow') {
    const { page, pageErrors } = await newFlowPage();
    await timePhase('initial-testHouse-boot', async () => {
      await page.goto(
        browserStageUrl(
          'primary-action',
          gameUrl(`http://127.0.0.1:${port}`, {
            startMod: debugHouseMod,
            hash: { debug: true, seed: 73, radius: 64, post: false, sunshadow: false, torchshadow: false },
          }),
          renderOverride,
        ),
      );
      await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    });
    await page.locator('#dominant-hand').selectOption('left');
    assert.equal(
      await page.evaluate(() => Boolean(globalThis.primaryActionTest)),
      false,
      'selecting Left does not construct an actor',
    );
    await timePhase('initial-testHouse-start', async () => {
      await page.locator('#go').click();
      await waitForWorldLoaded(page);
      await page.waitForFunction(() => {
        const overlay = document.querySelector('#overlay');
        return (
          globalThis.primaryActionTest &&
          overlay instanceof HTMLElement &&
          overlay.hidden &&
          document.pointerLockElement
        );
      });
    });
    // Phases whose statements share bindings with later code log their elapsed time here instead of wrapping.
    let segmentStart = performance.now();
    /** @param {string} phase */
    const endSegment = (phase) => {
      logPhase(phase, segmentStart);
      segmentStart = performance.now();
    };
    assert.equal(
      await page.evaluate(() => globalThis.primaryActionTest.engine.config.startId),
      debugHouseStart.id,
      'the full-product flow runs its selected content-owned debug preset',
    );
    assert.equal(
      await page.evaluate(() => {
        const { inventory } = globalThis.primaryActionTest;
        const held = inventory.hands[inventory.character.handedness];
        return Object.values(held?.slots ?? {}).some((item) => (item?.cartridges?.length ?? 0) > 0);
      }),
      true,
      'the selected debug row supplies a loaded magazine before flow setup',
    );
    const identity = await page.evaluate(() => {
      const { inventory, session } = globalThis.primaryActionTest;
      const creation = document.querySelector('#new-character-options');
      if (!(creation instanceof HTMLElement)) {
        throw new Error('The character creation options are missing');
      }
      return {
        handedness: inventory.character.handedness,
        saved: session.snapshot({ worldId: 'primary-world', characterId: 'primary-actor' }).character.progression
          .handedness,
        gestures: globalThis.acceptedCreation,
        creationHidden: creation.hidden,
      };
    });
    assert.deepEqual(identity, {
      handedness: 'left',
      saved: 'left',
      gestures: [{ trusted: true, actorExists: false }],
      creationHidden: true,
    });
    // Spawn settling must finish before lean's unchanged-feet baseline is sampled.
    await page.waitForFunction(async () => {
      const { session, frames } = globalThis.primaryActionTest;
      if (!session.body.onGround) {
        return false;
      }
      const [, height] = session.body.pos;
      await new Promise((done) => requestAnimationFrame(done));
      return globalThis.primaryActionTest.frames > frames && session.body.onGround && session.body.pos[1] === height;
    });
    const leanFeet = await page.evaluate(() => [...globalThis.primaryActionTest.session.body.pos]);
    await page.keyboard.down('KeyQ');
    await page.waitForFunction(() => globalThis.primaryActionTest.session.leanAmount < 0);
    await page.keyboard.up('KeyQ');
    await page.waitForFunction(() => globalThis.primaryActionTest.session.leanAmount === 0);
    await page.keyboard.down('KeyE');
    await page.waitForFunction(() => globalThis.primaryActionTest.session.leanAmount > 0);
    await page.keyboard.up('KeyE');
    await page.waitForFunction(() => globalThis.primaryActionTest.session.leanAmount === 0);
    assert.deepEqual(
      await page.evaluate(() => [...globalThis.primaryActionTest.session.body.pos]),
      leanFeet,
      'held world lean leaves the feet in place',
    );
    const canOpening = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.clearHand(r.dominant);
      r.clearHand(r.off);
      const can = r.inventory.create('canned_beans');
      r.setHand(r.dominant, r.inventory.create('machete'));
      r.setHand(r.off, can);
      const opened = r.inventory.registry.items.get(can.type)?.unpack?.item;
      if (opened === undefined) {
        throw new Error(`${can.type} does not open into an item`);
      }
      return { uid: can.uid, closed: can.type, opened };
    });
    /** @param {Item['uid']} uid */
    const heldOutcome = (uid) =>
      page.evaluate((canUid) => {
        const r = globalThis.primaryActionTest;
        const can = r.inventory.itemByUid(canUid);
        if (!can) {
          throw new Error(`Can ${canUid} is gone`);
        }
        return { busy: r.queue.busy, swings: r.swings.length, type: can.type };
      }, uid);
    const beforeTap = await heldOutcome(canOpening.uid);
    // A weapon swings only from the ready stance, so the tap is made with right mouse held.
    await page.mouse.down({ button: 'right' });
    await page.waitForFunction(() => globalThis.primaryActionTest.input.controls.rightMouseActionHeld);
    try {
      await page.mouse.click(640, 450);
      await page.waitForFunction((before) => globalThis.primaryActionTest.swings.length > before, beforeTap.swings);
    } finally {
      await page.mouse.up({ button: 'right' });
    }
    await page.waitForFunction(() => {
      const combat = globalThis.primaryActionTest.session.playerCombat;
      return !combat.activeMeleeAction && combat.snapshotState().playerAttackWait === 0;
    });
    const afterTap = await heldOutcome(canOpening.uid);
    assert.deepEqual(
      afterTap,
      { busy: false, swings: beforeTap.swings + 1, type: canOpening.closed },
      'a tap keeps the ordinary use: one swing, and the can stays shut',
    );
    const releaseUnchosen = await holdDominantUse(page);
    try {
      await waitForActionRing(page);
      // The ring follows the interaction hints, like the prompt it sits beside.
      await page.evaluate(() => {
        globalThis.primaryActionTest.hudOptions.interaction = false;
      });
      await waitForActionRing(page, false);
      await page.evaluate(() => {
        globalThis.primaryActionTest.hudOptions.interaction = true;
      });
      await waitForActionRing(page);
    } finally {
      await releaseUnchosen();
    }
    await waitForActionRing(page, false);
    assert.deepEqual(await heldOutcome(canOpening.uid), afterTap, 'releasing at the centre does nothing');
    await chooseHeldAction(page, 'open-can');
    await page.waitForFunction(() => globalThis.primaryActionTest.queue.busy);
    const openedInHand = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      const failures = r.queue.tick(r.queue.remaining).failed;
      const can = r.inventory.itemByUid(uid);
      if (!can) {
        throw new Error(`Can ${uid} is gone`);
      }
      return { failures, type: can.type, held: r.inventory.hands[r.off] === can };
    }, canOpening.uid);
    assert.deepEqual(
      openedInHand,
      { failures: [], type: canOpening.opened, held: true },
      'the chosen release opens rather than swings',
    );
    assert.equal(await actionRingShown(page), false, 'confirming closes the ring');
    const dullBlade = 0.2;
    const honing = await page.evaluate((dull) => {
      const r = globalThis.primaryActionTest;
      r.clearHand(r.dominant);
      r.clearHand(r.off);
      const blade = r.inventory.create('kitchen_knife', 1, dull);
      r.setHand(r.dominant, blade);
      r.setHand(r.off, r.inventory.create('whetstone'));
      return { uid: blade.uid, condition: blade.condition };
    }, dullBlade);
    // The blade's own press chooses Sharpen from its ring; the whetstone's only action is to sharpen.
    for (const trigger of ['ring', 'offhand']) {
      if (trigger === 'ring') {
        await chooseHeldAction(page, 'sharpen');
      } else {
        await pressAction(page, 'hand.use-off');
      }
      await page.waitForFunction(() => globalThis.primaryActionTest.queue.busy);
      const honed = await page.evaluate((uid) => {
        const r = globalThis.primaryActionTest;
        const failures = r.queue.tick(r.queue.remaining).failed;
        const blade = r.inventory.itemByUid(uid);
        if (!blade) {
          throw new Error(`Blade ${uid} is gone`);
        }
        return { failures, condition: blade.condition };
      }, honing.uid);
      assert.deepEqual(honed.failures, [], `${trigger} completes held honing`);
      assert(honed.condition > honing.condition, `${trigger} restores the held blade`);
      honing.condition = honed.condition;
    }
    // Honing lifts the first blade to its repair ceiling, where sharpening refuses (`packages/deadvox/DESIGN.md`,
    // "Repair ceiling"), so the wheel grinds a fresh blade as dull as the honing fixture's.
    const wheelGrinding = await page.evaluate(
      async ({ dull, moduleUrl }) => {
        const { repairCeiling } = await import(moduleUrl);
        const r = globalThis.primaryActionTest;
        r.clearHand(r.dominant);
        r.clearHand(r.off);
        r.setHand(r.dominant, r.inventory.create('kitchen_knife', 1, dull));
        const def = r.inventory.registry.furniture.get('grinding_wheel');
        if (!def) {
          throw new Error('The grinding wheel furniture is missing');
        }
        const floor = r.feet();
        const wheel = r.inventory.entities.add({
          type: def.id,
          size: def.size,
          facing: 'n',
          pos: [floor[0] + 2, floor[1], floor[2]],
        });
        if (!wheel) {
          throw new Error('Could not place the sharpening wheel');
        }
        const { pos } = r.session.body;
        const dx = wheel.pos[0] + 1 - pos[0];
        const dy = wheel.pos[1] + 1.6 - (pos[1] + r.session.playerEyeHeightMetres / r.scale.blockSize);
        const dz = wheel.pos[2] + 1 - pos[2];
        const look = { yaw: r.input.controls.yaw, pitch: r.input.controls.pitch };
        r.input.controls.yaw = Math.atan2(-dx, -dz);
        r.input.controls.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        const aimed = r.interactionTargetAt();
        if (aimed?.kind !== 'furniture' || aimed.entity !== wheel) {
          throw new Error('The sharpening wheel is not aimed at');
        }
        const blade = r.inventory.hands[r.dominant];
        if (!blade) {
          throw new Error('The wheel fixture blade is not held');
        }
        // The method the wheel would use for this blade, and its ceiling, from the engine's own rules.
        const method = r.session.sharpening.wheelMethod(blade, wheel);
        return {
          uid: blade.uid,
          condition: blade.condition,
          method: method?.id,
          ceiling: method && repairCeiling(r.inventory.registry, method),
          wheelUid: wheel.uid,
          look,
        };
      },
      // `@skelly/engine/inventory`, which exports `repairCeiling`.
      { dull: dullBlade, moduleUrl: firearmHandlingModule },
    );
    assert.ok(wheelGrinding.method, 'the wheel has a sharpening method for the fixture blade');
    assert(
      wheelGrinding.condition < wheelGrinding.ceiling,
      'the wheel fixture blade starts below its sharpening ceiling',
    );
    await page.mouse.click(640, 450);
    await page.waitForFunction(() => globalThis.primaryActionTest.queue.busy);
    const groundAtWheel = await page.evaluate(({ uid, wheelUid, look }) => {
      const r = globalThis.primaryActionTest;
      const failures = r.queue.tick(r.queue.remaining).failed;
      const blade = r.inventory.itemByUid(uid);
      const wheel = r.inventory.entities.byUid(wheelUid);
      if (!(blade && wheel)) {
        throw new Error('The wheel grinding fixture is gone');
      }
      const { condition } = blade;
      r.inventory.entities.remove(wheel);
      r.input.controls.yaw = look.yaw;
      r.input.controls.pitch = look.pitch;
      return { failures, condition };
    }, wheelGrinding);
    assert.deepEqual(groundAtWheel.failures, [], 'aimed-wheel activation completes');
    assert(groundAtWheel.condition > wheelGrinding.condition, 'aimed-wheel activation restores the held blade');
    /**
     * @param {HandSide} side
     * @param {'click' | 'Equal'} trigger
     */
    const heldLighter = async (side, trigger) => {
      const before = await page.evaluate((hand) => {
        const r = globalThis.primaryActionTest;
        r.clearHand(r.dominant);
        r.clearHand(r.off);
        const lighter = r.inventory.create('lighter');
        r.setHand(hand, lighter);
        r.clearNotice();
        const igniter = r.inventory.registry.items.get(lighter.type)?.igniter;
        if (!igniter) {
          throw new Error(`${lighter.type} is not an igniter`);
        }
        return { uid: lighter.uid, charges: lighter.charges, perIgnition: igniter.perIgnition };
      }, side);
      if (trigger === 'click') {
        await page.mouse.click(640, 450);
      } else {
        await pressAction(page, 'hand.use-off');
      }
      await page.waitForFunction(
        (uid) => globalThis.primaryActionTest.inventory.itemByUid(uid)?.on === true,
        before.uid,
      );
      const after = await page.evaluate((uid) => {
        const r = globalThis.primaryActionTest;
        const lighter = r.inventory.itemByUid(uid);
        return { on: lighter?.on, charges: lighter?.charges, notice: r.getNotice() };
      }, before.uid);
      assert.equal(after.on, true, `${trigger} switches a lone held lighter on`);
      assert(before.charges !== undefined && after.charges !== undefined, 'the lighter counts its charges');
      assert.ok(before.charges - after.charges < before.perIgnition, `${trigger} does not spend an ignition charge`);
      assert.equal(after.notice, '', `${trigger} does not refuse the lighter's own flame`);
    };
    await heldLighter('left', 'click');
    await heldLighter('right', 'Equal');

    const ignition = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.clearHand(r.dominant);
      r.clearHand(r.off);
      const matches = r.inventory.create('matches');
      const candle = r.inventory.create('candle');
      r.setHand(r.dominant, matches);
      r.setHand(r.off, candle);
      const action = r.selectPrimaryAction(r.inventory, r.dominant);
      const target = action.kind === 'ignite' ? r.ignitionTargetForHand(r.inventory, action.hand) : undefined;
      const igniter = r.inventory.registry.items.get(matches.type)?.igniter;
      if (!igniter) {
        throw new Error(`${matches.type} is not an igniter`);
      }
      return {
        matchesUid: matches.uid,
        candleUid: candle.uid,
        charges: matches.charges,
        perIgnition: igniter.perIgnition,
        selected: action.kind,
        targetUid: target?.uid,
      };
    });
    assert.equal(ignition.selected, 'ignite');
    assert.equal(ignition.targetUid, ignition.candleUid);
    await page.mouse.click(640, 450);
    await page.waitForFunction(
      (uid) => globalThis.primaryActionTest.inventory.itemByUid(uid)?.on === true,
      ignition.candleUid,
    );
    const lit = await page.evaluate(({ matchesUid, candleUid }) => {
      const r = globalThis.primaryActionTest;
      const matches = r.inventory.itemByUid(matchesUid);
      const candle = r.inventory.itemByUid(candleUid);
      return {
        on: candle?.on,
        litAtGameTimestamp: candle?.litAtGameTimestamp,
        charges: matches?.charges,
        notice: r.getNotice(),
      };
    }, ignition);
    assert.equal(lit.on, true, 'primary action lights the candle held opposite matches');
    assert.ok((lit.litAtGameTimestamp ?? 0) > 0, 'the candle records its ignition time');
    assert(ignition.charges !== undefined, 'the matches count their charges');
    assert.equal(lit.charges, ignition.charges - ignition.perIgnition, 'one declared ignition charge is spent');
    assert.equal(lit.notice, '', 'successful ignition does not refuse');

    const heldChecks = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.clearHand(r.dominant);
      r.clearHand(r.off);
      const candle = r.inventory.create('candle');
      const matches = r.inventory.create('matches');
      r.setHand(r.dominant, candle);
      r.placePocketed(matches);
      const pocketAction = r.selectPrimaryAction(r.inventory, r.dominant);
      const pocketBefore = matches.charges;
      r.clearNotice();
      return { candleUid: candle.uid, matchesUid: matches.uid, pocketBefore, selected: pocketAction.kind };
    });
    assert.equal(heldChecks.selected, 'light');
    await page.mouse.click(640, 450);
    await page.waitForFunction(() => Boolean(globalThis.primaryActionTest.getNotice()));
    const pocketRefusal = await page.evaluate(({ candleUid, matchesUid }) => {
      const r = globalThis.primaryActionTest;
      return {
        candleOn: r.inventory.itemByUid(candleUid)?.on,
        charges: r.inventory.itemByUid(matchesUid)?.charges,
        notice: r.getNotice(),
      };
    }, heldChecks);
    assert.notEqual(pocketRefusal.candleOn, true, 'pocketed matches cannot ignite the held candle');
    assert.equal(pocketRefusal.charges, heldChecks.pocketBefore, 'refusal spends no matches');
    assert.notEqual(pocketRefusal.notice, '', 'the pocketed firestarter refusal is reported');

    const pumpState = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const definition = [...r.inventory.registry.items.values()].find((candidate) => candidate.firearm?.pump);
      if (!definition?.firearm) {
        throw new Error('No pump shotgun capability for quickbar check');
      }
      r.clearHand(r.dominant);
      const gun = r.inventory.create(definition.id);
      if (!r.inventory.add(gun, { kind: 'pile', pos: r.feet() })) {
        throw new Error('Could not place pump shotgun fixture');
      }
      const before = structuredClone(gun.firearm);
      r.clearNotice();
      r.session.quickbar.assign(0, gun);
      r.quickbarActions.hold(gun);
      return { pump: definition.firearm.pump, before, after: structuredClone(gun.firearm), notice: r.getNotice() };
    });
    assert.equal(pumpState.pump, true);
    assert.deepEqual(
      pumpState.after,
      pumpState.before,
      'quickbar hold does not rack or otherwise mutate a pump shotgun',
    );
    assert.notEqual(pumpState.notice, '', 'quickbar firearm use is refused');

    const knockout = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.clearNotice();
      r.session.sim.body.impact(0, 'torso', { shockDamage: r.session.sim.body.shock });
      const swings = r.swings.length;
      r.performHandUse('left');
      r.performHandUse('right');
      const handBlocked = { before: swings, after: r.swings.length, notice: r.getNotice() };
      r.clearNotice();
      r.keyboardInput.command({ action: 'world.interact', phase: 'down', at: 0 });
      const interactNotice = r.getNotice();
      r.clearNotice();
      r.keyboardInput.command({ action: 'player.crouch-toggle', phase: 'down', at: 0 });
      const crouchNotice = r.getNotice();
      return { ...handBlocked, interactNotice, crouchNotice };
    });
    assert.equal(knockout.after, knockout.before, 'both hand actions are refused while unconscious');
    assert.notEqual(knockout.notice, '', 'the unconscious hand-action refusal is surfaced');
    assert.notEqual(knockout.interactNotice, '', 'world interaction is refused while unconscious');
    assert.notEqual(knockout.crouchNotice, '', 'crouch is refused while unconscious');
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      return document.body.classList.contains('unconscious') && r.audio.isOutputMuted;
    });
    const unconsciousPresentation = await page.evaluate(() => {
      const { audio, session } = globalThis.primaryActionTest;
      return {
        black: document.body.classList.contains('unconscious'),
        muted: audio.isOutputMuted,
        eyeHeight: session.playerEyeHeightMetres,
        proneHeight: session.sim.body.tuning.proneEyeHeightMetres,
      };
    });
    assert.equal(unconsciousPresentation.black, true, 'unconscious presentation blacks out the view');
    assert.equal(unconsciousPresentation.muted, true, 'unconscious presentation mutes player audio');
    assert.equal(
      unconsciousPresentation.eyeHeight,
      unconsciousPresentation.proneHeight,
      'unconscious eye height is prone',
    );
    await page.keyboard.press('F9');
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      const overlay = document.querySelector('#overlay');
      return !(overlay instanceof HTMLElement && overlay.hidden) && r.session.sim.paused;
    });
    const pausedKnockout = await page.evaluate(() => {
      const overlay = document.querySelector('#overlay');
      const cursorRoot = document.querySelector('#game-cursor-root');
      const cursor = document.querySelector('#game-cursor');
      if (!(overlay && cursorRoot)) {
        throw new Error('The pause overlay or the game cursor root is missing');
      }
      return {
        black: document.body.classList.contains('unconscious'),
        overlayAboveBlackout:
          Number.parseInt(getComputedStyle(overlay).zIndex, 10) >
          Number.parseInt(getComputedStyle(document.body, '::after').zIndex, 10),
        menuPointer: globalThis.primaryActionTest.input.menuPointer,
        cursorVisible: Boolean(cursor && getComputedStyle(cursor).display !== 'none'),
        cursorAboveOverlay:
          Number.parseInt(getComputedStyle(cursorRoot).zIndex, 10) >
          Number.parseInt(getComputedStyle(overlay).zIndex, 10),
      };
    });
    assert.equal(pausedKnockout.black, true, 'opening the pause menu leaves the knockout blackout active');
    assert.equal(pausedKnockout.overlayAboveBlackout, true, 'the pause menu is layered above the blackout');
    assert.equal(pausedKnockout.menuPointer, true, 'the open menu uses the software cursor');
    assert.equal(pausedKnockout.cursorVisible, true, 'the software cursor stays visible over the menu');
    assert.equal(pausedKnockout.cursorAboveOverlay, true, 'the software cursor layers above the pause menu');
    await page.keyboard.press('F9');
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      const overlay = document.querySelector('#overlay');
      return overlay instanceof HTMLElement && overlay.hidden && !r.session.sim.paused;
    });
    assert.equal(
      await page.evaluate(() => document.body.classList.contains('unconscious')),
      true,
      'resuming returns to the blackout while the knockout continues',
    );
    await page.evaluate(() => {
      const { sim } = globalThis.primaryActionTest.session;
      sim.body.advance(sim.body.tuning.knockoutSimSeconds);
    });
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      return !(document.body.classList.contains('unconscious') || r.audio.isOutputMuted);
    });

    const nextFrame = async () => {
      const frame = await page.evaluate(() => globalThis.primaryActionTest.frames);
      await page.waitForFunction((before) => globalThis.primaryActionTest.frames > before, frame);
    };
    const finishedSwing = () =>
      page.waitForFunction(() => !globalThis.primaryActionTest.session.playerCombat.activeMeleeAction);
    const observe = () =>
      page.evaluate(() => {
        const r = globalThis.primaryActionTest;
        return {
          stamina: r.session.sim.needs.stamina,
          swings: [...r.swings],
          on: r.inventory.itemByUid(r.lightUid)?.on ?? false,
        };
      });
    const strike = async () => {
      const before = await observe();
      await page.mouse.down({ button: 'right' });
      await page.waitForFunction(() => globalThis.primaryActionTest.input.controls.rightMouseActionHeld);
      try {
        await page.mouse.click(640, 450);
        await page.waitForFunction((count) => globalThis.primaryActionTest.swings.length > count, before.swings.length);
      } finally {
        await page.mouse.up({ button: 'right' });
      }
      const after = await observe();
      assert.equal(after.swings.length, before.swings.length + 1, 'one click admits one swing');
      assert.ok(after.stamina < before.stamina, 'an admitted swing spends stamina');
      return after;
    };
    /**
     * @param {string | null} actionId the input action that toggles the light, or null for a primary click
     * @param {boolean} on
     */
    const toggleLight = async (actionId, on) => {
      const before = await observe();
      if (actionId) {
        await pressAction(page, actionId);
      } else {
        await page.mouse.click(640, 450);
      }
      await page.waitForFunction((expected) => {
        const r = globalThis.primaryActionTest;
        return r.inventory.itemByUid(r.lightUid)?.on === expected;
      }, on);
      const after = await observe();
      assert.deepEqual(after.swings, before.swings, 'light use never starts melee');
      assert.ok(after.stamina >= before.stamina, 'light use does not spend melee stamina');
    };
    /**
     * @param {HandSide} actionSide
     * @param {HandSide} reservedHand
     */
    const attemptDuringHandling = async (actionSide, reservedHand, useMouse5 = false, tryThrow = false) => {
      await page.waitForFunction(() => {
        const combat = globalThis.primaryActionTest.session.playerCombat;
        return !combat.activeMeleeAction && combat.snapshotState().playerAttackWait === 0;
      });
      const outcome = await page.evaluate(
        ({ primarySide, reservationSide, forwardButton, tryThrow: throwRequested }) => {
          const r = globalThis.primaryActionTest;
          /**
           * @param {unknown} condition
           * @param {string} message
           */
          const ensure = (condition, message) => {
            if (!condition) {
              throw new Error(message);
            }
          };
          ensure(!r.session.queue.busy, 'Busy-primary fixture starts with an empty handling queue');
          const original = r.inventory.hands[reservationSide];
          if (original) {
            r.clearHand(reservationSide);
          }
          const incoming = r.inventory.create(r.types.inert);
          ensure(
            r.inventory.add(incoming, { kind: 'pile', pos: r.feet() }),
            'Could not place busy-primary fixture item',
          );
          const queued = r.session.queue.enqueue(incoming, { kind: 'hand', side: reservationSide });
          if (!queued.ok) {
            throw new Error(`Could not start busy-primary fixture move: ${queued.reason}`);
          }
          const light = r.inventory.itemByUid(r.lightUid);
          const before = {
            swings: r.swings.length,
            stamina: r.session.sim.needs.stamina,
            lightOn: Boolean(light?.on),
          };
          r.clearNotice();
          r.quickbarActions.hold(incoming);
          const expectedReason = r.getNotice();
          r.clearNotice();
          let throwAttempt;
          if (throwRequested) {
            r.beginItemThrow();
            throwAttempt = { charging: r.isChargingItemThrow(), notice: r.getNotice() };
            r.clearNotice();
          }
          if (forwardButton) {
            document.dispatchEvent(new MouseEvent('pointerdown', { button: 4, buttons: 16, bubbles: true }));
          } else {
            r.performHandUse(primarySide);
          }
          const after = {
            swings: r.swings.length,
            stamina: r.session.sim.needs.stamina,
            lightOn: Boolean(light?.on),
          };
          const result = {
            busy: r.session.queue.busy,
            inputActive: r.input.locked && !r.input.menuPointer,
            before,
            after,
            expectedReason,
            actualReason: r.getNotice(),
            throwAttempt,
          };
          r.session.queue.cancel();
          ensure(r.inventory.consume(incoming, incoming.count), 'Could not remove busy-primary fixture item');
          if (original) {
            const restored = r.inventory.itemByUid(original.uid);
            if (!restored) {
              throw new Error(`Busy-primary fixture lost item ${original.uid}`);
            }
            r.setHand(reservationSide, restored);
          }
          if (light && Boolean(light.on) !== before.lightOn) {
            const reason = r.survival.use(light);
            ensure(!reason, `Could not restore the light fixture: ${reason}`);
          }
          return result;
        },
        { primarySide: actionSide, reservationSide: reservedHand, forwardButton: useMouse5, tryThrow },
      );
      await page.waitForFunction(() => {
        const combat = globalThis.primaryActionTest.session.playerCombat;
        return !combat.activeMeleeAction && combat.snapshotState().playerAttackWait === 0;
      });
      return outcome;
    };
    /**
     * @param {Awaited<ReturnType<typeof attemptDuringHandling>>} outcome
     * @param {string} label
     */
    const assertHandlingRefusal = (outcome, label) => {
      assert.equal(outcome.busy, true, `${label}: the move is in progress`);
      assert.equal(outcome.after.swings, outcome.before.swings, `${label}: does not attempt a melee swing`);
      assert.equal(outcome.after.stamina, outcome.before.stamina, `${label}: does not spend stamina`);
      assert.equal(outcome.after.lightOn, outcome.before.lightOn, `${label}: does not activate the light`);
      assert.equal(outcome.actualReason, outcome.expectedReason, `${label}: uses the handling refusal`);
    };
    if (renderMode === 'render-free') {
      const before = await page.evaluate(() => ({
        time: globalThis.primaryActionTest.session.sim.time,
        feet: globalThis.primaryActionTest.feet(),
      }));
      await waitForSimulation(
        page,
        progressingSample,
        { start: before.time },
        {
          seconds: 0.35,
          label: 'render-free input and simulation witness',
          record: (line) => process.stderr.write(`${line}\n`),
          hold: 'movement.forward',
        },
      );
      const witness = await page.evaluate(() => ({
        renderer: Boolean(globalThis.primaryActionTest.engine.renderer),
        requests: globalThis.renderFreeWitness.webglRequests,
        feet: globalThis.primaryActionTest.feet(),
      }));
      assert.equal(witness.renderer, false);
      assert.deepEqual(witness.requests, []);
      assert.ok(
        Math.hypot(witness.feet[0] - before.feet[0], witness.feet[2] - before.feet[2]) > 0,
        'native input moves the actor',
      );
    }
    // Gunshots attract shamblers; mortality is not the hand-action contract.
    await pressAction(page, 'debug.god-toggle');
    assert.equal(await page.evaluate(() => globalThis.primaryActionTest.session.sim.godMode), true);
    const loadout = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const tool = [...r.inventory.registry.items.values()].find((def) => def.weapon && !def.twoHanded);
      if (!tool?.weapon) {
        throw new Error('Registry has no one-handed melee fixture');
      }
      const item = r.inventory.create(tool.id);
      r.setHand(r.dominant, item);
      return { uid: item.uid, profile: tool.weapon.melee.type };
    });
    const first = await strike();
    assert.deepEqual(first.swings.at(-1), { result: true, profile: loadout.profile, hand: 'left' });
    assert.equal(await page.evaluate(() => globalThis.primaryActionTest.inventory.hands.left?.uid), loadout.uid);
    await finishedSwing();
    await installScopedGun(page);
    await page.evaluate(async (magazineUrl) => {
      const { magazineWellCalibre } = await import(magazineUrl);
      const r = globalThis.primaryActionTest;
      const defs = [...r.inventory.registry.items.values()];
      // A battery light switches on any use and back off; a flame needs a held firestarter, whatever loads first.
      const light = defs.find((def) => def.light?.power && !def.twoHanded);
      const tool = defs.find((def) => def.weapon && !def.twoHanded);
      const inert = defs.find(
        (def) =>
          !(
            def.weapon ||
            def.firearm ||
            def.light ||
            def.food ||
            def.key ||
            def.readable ||
            def.book ||
            def.unpack ||
            def.battery ||
            def.twoHanded ||
            def.wearable ||
            def.container ||
            def.ammo
          ),
      );
      const variableOptics = defs.filter((def) => {
        const model = def.model === undefined ? undefined : r.inventory.registry.models.get(def.model);
        const range = model?.gun?.attachment?.properties.magnification;
        return range && range.min < range.max && (def.opticZoom?.step ?? 0) > 0;
      });
      const fitting = defs
        .filter((def) => def.firearm && magazineWellCalibre(r.inventory.registry, def.id))
        .flatMap((gun) => {
          const model = gun.model === undefined ? undefined : r.inventory.registry.models.get(gun.model);
          return (model?.gun?.attachmentSlots ?? []).flatMap(({ id: station }) =>
            variableOptics.map((optic) => ({ gun, optic, station })),
          );
        })
        .find(({ gun, optic, station }) => {
          try {
            r.scopedGun(gun.id, station, optic.id);
            return true;
          } catch {
            return false;
          }
        });
      if (!(light && tool?.weapon && inert && fitting)) {
        throw new Error('Missing hand-action fixture capabilities');
      }
      r.types = {
        light: light.id,
        tool: tool.id,
        profile: tool.weapon.melee.type,
        inert: inert.id,
        gun: fitting.gun.id,
        optic: fitting.optic.id,
        opticStation: fitting.station,
      };
      r.clearHand(r.dominant);
    }, magazineModule);
    // Fixture creation and placement stay with Inventory, never its hand map.
    await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const light = r.inventory.create(r.types.light);
      r.lightUid = light.uid;
      r.setHand(r.off, light);
      r.swings = [];
      r.trackAttachment = true;
    });
    const jab = await strike();
    assert.equal(jab.on, false, 'dominant jab does not use the off-hand light');
    assert.deepEqual(jab.swings[0], { result: true, profile: 'fists', hand: 'left' });
    await finishedSwing();
    const roles = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      return { dominant: r.dominant, off: r.off };
    });
    assertHandlingRefusal(await attemptDuringHandling(roles.dominant, roles.off), 'empty-hand jab');
    const attachment = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.trackAttachment = false;
      return r.attachments;
    });
    assert.ok(
      attachment.length > 0 && attachment.some((sample) => sample.torsoYaw !== 0),
      'attachment sampled during an actual swing',
    );
    assert.ok(
      attachment.every((sample) => !sample.movedOff),
      'off-hand hold stays neutral',
    );
    assert.ok(
      attachment.every((sample) => sample.gap <= 0.001 && sample.angle < 1e-6),
      'held item follows its physical arm',
    );
    await toggleLight('hand.use-off', true);
    const roundTrip = await page.evaluate(async (inventoryModule) => {
      // The stage server serves the game's own module, so this is the class of the live inventory.
      const { Inventory } = await import(inventoryModule);
      const { inventory, session, lightUid } = globalThis.primaryActionTest;
      const snapshot = session.snapshot({ worldId: 'primary-world', characterId: 'primary-actor' });
      const restored = Inventory.restoreState(inventory.registry, snapshot.character.inventory, undefined, {
        character: inventory.character,
      });
      return {
        uid: snapshot.character.lightUid,
        savedOn: snapshot.character.inventory.hands.right?.on,
        restoredOn: restored.hands.right?.on,
        restoredHand: restored.character.handedness,
        lightUid,
      };
    }, firearmHandlingModule);
    assert.equal(roundTrip.uid, roundTrip.lightUid);
    assert.equal(roundTrip.savedOn, true);
    assert.equal(roundTrip.restoredOn, true);
    assert.equal(roundTrip.restoredHand, 'left');
    await toggleLight('hand.use-off', false);
    endSegment('hand-action-cases');
    await page.evaluate(() => globalThis.primaryActionTest.startInputReplayRecording());
    const interactionHintsBeforeThrowStance = await page.evaluate(
      () => globalThis.primaryActionTest.hudOptions.interaction,
    );
    const throwFixture = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.clearHand(r.dominant);
      r.clearHand(r.off);
      const glowstick = r.inventory.create('glowstick');
      const offHandItem = r.inventory.create('glowstick');
      r.setHand(r.dominant, glowstick);
      r.setHand(r.off, offHandItem);
      const senses = r.inventory.registry.senses.get('player');
      if (!senses) {
        throw new Error('The player senses are missing');
      }
      const { throwChargeSimSeconds, throwMinimumHoldSimSeconds } = senses.light;
      return {
        uid: glowstick.uid,
        offHandUid: offHandItem.uid,
        start: [...r.session.body.pos],
        blockSize: r.scale.blockSize,
        chargeSimSeconds: throwChargeSimSeconds,
        minimumHoldSimSeconds: throwMinimumHoldSimSeconds,
      };
    });
    await page.waitForFunction(() => {
      const { held } = globalThis.primaryActionTest.view;
      return held.heldItemPosition('right') !== undefined && held.heldItemPosition('left') !== undefined;
    });
    const throwPose = () =>
      page.evaluate(() => {
        const { held } = globalThis.primaryActionTest.view;
        const pose = (/** @type {import('@skelly/engine/inventory').HandSide} */ side) => {
          const arm = held.armPosition(side);
          if (!arm) {
            throw new Error(`The ${side} arm is not presented`);
          }
          return arm;
        };
        return { right: pose('right'), left: pose('left') };
      });
    const normalThrowPose = await throwPose();
    await page.evaluate(() => {
      globalThis.primaryActionTest.hudOptions.interaction = false;
    });
    await pressAction(page, 'player.throw');
    await page.waitForFunction(() => globalThis.primaryActionTest.isThrowingStance());
    await page.waitForFunction((normal) => {
      const { held } = globalThis.primaryActionTest.view;
      return /** @type {const} */ (['right', 'left']).every((side) => {
        const pose = held.armPosition(side);
        return pose !== undefined && pose[1] > normal[side][1] && pose[2] > normal[side][2];
      });
    }, normalThrowPose);
    assert.equal(
      await page.locator('#throw-stance').evaluate((node) => node instanceof HTMLElement && node.hidden),
      true,
    );
    await page.evaluate(() => {
      globalThis.primaryActionTest.hudOptions.interaction = true;
    });
    await page.waitForFunction(() => {
      const stance = document.querySelector('#throw-stance');
      return stance instanceof HTMLElement && !stance.hidden;
    });
    const stanceThrowPose = await throwPose();
    for (const side of /** @type {const} */ (['right', 'left'])) {
      assert.ok(stanceThrowPose[side][1] > normalThrowPose[side][1], `${side} hand is raised in throwing stance`);
      assert.ok(stanceThrowPose[side][2] > normalThrowPose[side][2], `${side} hand draws back in throwing stance`);
    }
    const offHandOnlyThrow = await mouseCharge(page);
    await page.waitForFunction(() => globalThis.primaryActionTest.isChargingItemThrow());
    const offHandChargeStart = await page.evaluate(() => globalThis.primaryActionTest.session.sim.time);
    await waitForSimulation(
      page,
      throwChargeSample,
      { start: offHandChargeStart, seconds: throwFixture.minimumHoldSimSeconds },
      {
        seconds: throwFixture.minimumHoldSimSeconds + 0.1,
        label: 'off-hand throw reaches its minimum charge',
        record: (line) => process.stderr.write(`${line}\n`),
        stop: offHandOnlyThrow,
      },
    );
    await page.waitForFunction(
      (uid) => globalThis.primaryActionTest.throwSpawnObservations[uid]?.active,
      throwFixture.offHandUid,
    );
    await page.waitForFunction((uid) => {
      const { inventory } = globalThis.primaryActionTest;
      const item = inventory.itemByUid(uid);
      return item !== undefined && inventory.locate(item)?.kind === 'pile';
    }, throwFixture.offHandUid);
    assert.equal(
      await page.evaluate((uid) => {
        const r = globalThis.primaryActionTest;
        return r.isThrowingStance() && r.inventory.hands[r.dominant]?.uid === uid && !r.inventory.hands[r.off];
      }, throwFixture.uid),
      true,
      'a throw prioritizes the off-hand item and leaves the main-hand item held in stance',
    );
    const fullFeet = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      const glowstick = r.inventory.itemByUid(uid);
      if (!glowstick) {
        throw new Error(`Glowstick ${uid} is gone`);
      }
      r.setHand(r.dominant, glowstick);
      const offHandDrop = r.inventory.create('glowstick');
      r.setHand(r.off, offHandDrop);
      r.hudOptions.handling = true;
      const feet = r.session.feet();
      const fillers = [];
      for (let added = 0; r.inventory.plan(offHandDrop, { kind: 'pile', pos: feet }).ok; added += 1) {
        const filler = r.inventory.create(offHandDrop.type);
        if (added > 1000 || !r.inventory.add(filler, { kind: 'pile', pos: feet })) {
          throw new Error('Could not fill the pile at the feet');
        }
        fillers.push(filler.uid);
      }
      return { feet, fillers };
    }, throwFixture.uid);
    const holdToDrop = await holdAction(page, 'player.throw');
    const droppedOffHandUid = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      return r.inventory.hands[r.off]?.uid;
    });
    await page.waitForFunction((uid) => {
      const { inventory } = globalThis.primaryActionTest;
      const item = uid === undefined ? undefined : inventory.itemByUid(uid);
      return item !== undefined && inventory.locate(item)?.kind === 'pile';
    }, droppedOffHandUid);
    await holdToDrop();
    assert.notDeepEqual(
      await page.evaluate((uid) => {
        const r = globalThis.primaryActionTest;
        const item = uid === undefined ? undefined : r.inventory.itemByUid(uid);
        const location = item && r.inventory.locate(item);
        if (location?.kind !== 'pile') {
          throw new Error(`The stance drop ${uid} is not in a pile`);
        }
        return location.pile.pos;
      }, droppedOffHandUid),
      fullFeet.feet,
      'the stance drop falls back to the next drop spot when the pile at the feet is full',
    );
    await page.evaluate((uids) => {
      const r = globalThis.primaryActionTest;
      for (const uid of uids) {
        const filler = r.inventory.itemByUid(uid);
        if (!filler) {
          throw new Error(`Pile filler ${uid} is gone`);
        }
        r.inventory.consume(filler, filler.count);
      }
    }, fullFeet.fillers);
    assert.equal(
      await page.evaluate((uid) => {
        const r = globalThis.primaryActionTest;
        return r.inventory.hands[r.dominant]?.uid === uid;
      }, throwFixture.uid),
      true,
      'holding T drops the off-hand item before leaving the main-hand item held',
    );
    assert.equal(await page.evaluate(() => globalThis.primaryActionTest.isThrowingStance()), true);
    const meterThrow = await mouseCharge(page);
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      const root = document.querySelector('#handling');
      return (
        r.isChargingItemThrow() &&
        root instanceof HTMLElement &&
        !root.hidden &&
        root.querySelector('.activity-progress-minimum')
      );
    });
    const meterStart = await page.evaluate(() => globalThis.primaryActionTest.session.sim.time);
    await waitForSimulation(
      page,
      throwChargeSample,
      { start: meterStart, seconds: throwFixture.chargeSimSeconds / 2 },
      {
        seconds: throwFixture.chargeSimSeconds / 2 + 0.1,
        label: 'throw handling meter advances with simulation-time charge',
        record: (line) => process.stderr.write(`${line}\n`),
      },
    );
    const meterMidpoint = await page.evaluate(() => {
      const root = document.querySelector('#handling');
      const progress = root?.querySelector('[role="progressbar"]');
      const minimum = root?.querySelector('.activity-progress-minimum');
      if (!(root && progress && minimum instanceof HTMLElement)) {
        throw new Error('The handling meter is not drawn');
      }
      return {
        value: Number(progress.getAttribute('aria-valuenow')),
        marker: Number.parseFloat(minimum.style.getPropertyValue('--minimum-angle')) / 3.6,
        minimumLabel: root.querySelector('.activity-progress-copy')?.textContent,
      };
    });
    assert.ok(meterMidpoint.value > 0 && meterMidpoint.value < 100, 'charge ring reports partial throw force');
    assert.equal(
      meterMidpoint.marker,
      Math.round((throwFixture.minimumHoldSimSeconds / throwFixture.chargeSimSeconds) * 100),
      'ring marks the authored minimum release point',
    );
    assert.ok(meterMidpoint.minimumLabel?.trim(), 'minimum marker has a non-empty label');
    const promptClear = await page.evaluate(() => {
      // A clone keeps the prompt's id styling without disturbing the hud's own render of the real node.
      const prompt = document.querySelector('#prompt')?.cloneNode(false);
      if (!(prompt instanceof HTMLElement)) {
        throw new Error('The interaction prompt is missing');
      }
      prompt.hidden = false;
      prompt.textContent = 'Interact\nSecond line\nThird line';
      document.body.append(prompt);
      const promptBox = prompt.getBoundingClientRect();
      prompt.remove();
      const overlaps = ['.activity-progress-gauge', '.activity-progress-copy'].map((selector) => {
        const part = document.querySelector(`#handling ${selector}`);
        if (!part) {
          throw new Error(`The handling HUD has no ${selector}`);
        }
        const box = part.getBoundingClientRect();
        return (
          promptBox.left < box.right &&
          box.left < promptBox.right &&
          promptBox.top < box.bottom &&
          box.top < promptBox.bottom
        );
      });
      return overlaps;
    });
    assert.deepEqual(promptClear, [false, false], 'the interaction prompt does not overlap the handling HUD');
    await page.evaluate(() => {
      globalThis.primaryActionTest.hudOptions.handling = false;
    });
    const handlingHidden = () =>
      page.waitForFunction(() => {
        const root = document.querySelector('#handling');
        return root instanceof HTMLElement && root.hidden;
      });
    await handlingHidden();
    await page.mouse.down({ button: 'right' });
    await meterThrow();
    await page.mouse.up({ button: 'right' });
    await page.waitForFunction(() => !globalThis.primaryActionTest.isChargingItemThrow());
    await handlingHidden();
    const glowstickPlace = () =>
      page.evaluate((uid) => {
        const { inventory } = globalThis.primaryActionTest;
        const item = inventory.itemByUid(uid);
        return item && inventory.locate(item)?.kind;
      }, throwFixture.uid);
    assert.equal(
      await glowstickPlace(),
      'hand',
      'right-click cancellation hides the throw meter without releasing the item',
    );
    const stanceCancelThrow = await mouseCharge(page);
    await page.waitForFunction(() => globalThis.primaryActionTest.isChargingItemThrow());
    await pressAction(page, 'player.throw');
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      return !(r.isThrowingStance() || r.isChargingItemThrow());
    });
    await page.waitForFunction((normal) => {
      const { held } = globalThis.primaryActionTest.view;
      return /** @type {const} */ (['right', 'left']).every((side) => {
        const pose = held.armPosition(side);
        return pose?.every((value, axis) => Math.abs(value - (normal[side][axis] ?? Number.NaN)) < 0.001) === true;
      });
    }, normalThrowPose);
    const restoredThrowPose = await throwPose();
    for (const side of /** @type {const} */ (['right', 'left'])) {
      assert.ok(
        restoredThrowPose[side].every(
          (value, axis) => Math.abs(value - (normalThrowPose[side][axis] ?? Number.NaN)) < 0.001,
        ),
      );
    }
    await stanceCancelThrow();
    assert.equal(
      await glowstickPlace(),
      'hand',
      'tapping T exits stance and cancels the active charge without throwing',
    );
    await pressAction(page, 'player.throw');
    await page.waitForFunction(() => globalThis.primaryActionTest.isThrowingStance());
    await page.evaluate(() => {
      globalThis.primaryActionTest.hudOptions.handling = true;
    });
    const interruptedThrow = await mouseCharge(page);
    await page.waitForFunction(() => globalThis.primaryActionTest.isChargingItemThrow());
    assert.equal(
      await page.evaluate(
        (uid) => Boolean(globalThis.primaryActionTest.inventory.itemByUid(uid)?.on),
        throwFixture.uid,
      ),
      false,
      'an unlit glowstick can begin charging a throw',
    );
    await page.evaluate(() => {
      const { body } = globalThis.primaryActionTest.session.sim;
      body.impact(0, 'torso', { shockDamage: body.shock + 1 });
    });
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      return r.session.sim.body.unconscious && !r.isChargingItemThrow();
    });
    assert.equal(
      await page.evaluate(() => globalThis.primaryActionTest.isChargingItemThrow()),
      false,
      'knockout cancels an active item throw',
    );
    await interruptedThrow();
    const rejectedThrow = await mouseCharge(page);
    assert.equal(
      await page.evaluate(() => globalThis.primaryActionTest.isChargingItemThrow()),
      false,
      'unconsciousness refuses a new item throw',
    );
    assert.equal(
      await page.evaluate(() => {
        const r = globalThis.primaryActionTest;
        r.beginItemThrow();
        return r.isChargingItemThrow();
      }),
      false,
      'beginItemThrow independently refuses unconsciousness',
    );
    await rejectedThrow();
    assert.equal(await glowstickPlace(), 'hand', 'neither charge consumes the held glowstick');
    await page.evaluate(() => {
      const { body } = globalThis.primaryActionTest.session.sim;
      body.advance(body.tuning.knockoutSimSeconds);
    });
    await page.waitForFunction(() => !globalThis.primaryActionTest.session.sim.body.unconscious);
    const cancelThrow = await mouseCharge(page);
    await page.mouse.down({ button: 'right' });
    await cancelThrow();
    await page.mouse.up({ button: 'right' });
    await page.waitForFunction((uid) => {
      const { inventory } = globalThis.primaryActionTest;
      const item = inventory.itemByUid(uid);
      return item !== undefined && inventory.locate(item)?.kind === 'hand';
    }, throwFixture.uid);
    const recordedThrows = () =>
      page.evaluate(() => {
        const recorder = globalThis.primaryActionTest.inputRecorder;
        if (!recorder) {
          throw new Error('No input recording is running');
        }
        return recorder.copyInputs().actions.filter((action) => action.action === 'item.throw').length;
      });
    const throwsBeforeShortRelease = await recordedThrows();
    const shortGesture = await page.evaluate(() => {
      const target = document.pointerLockElement;
      if (!target) {
        throw new Error('Short throw needs the locked game input target');
      }
      const { left, top, width, height } = target.getBoundingClientRect();
      const init = {
        button: 0,
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: left + width / 2,
        clientY: top + height / 2,
      };
      // A Node round trip can cross the minimum hold on a slow rendered frame. Deliver the
      // input-listener press/release pair in one page task, then let simulation consume it.
      target.dispatchEvent(new MouseEvent('mousedown', { ...init, buttons: 1 }));
      const pressed = globalThis.primaryActionTest.input.controls.dominantUseHeld;
      target.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
      return {
        start: globalThis.primaryActionTest.session.sim.time,
        pressed,
        released: !globalThis.primaryActionTest.input.controls.dominantUseHeld,
      };
    });
    assert.equal(shortGesture.pressed, true, 'the short press reached the input owner');
    assert.equal(shortGesture.released, true, 'the short release reached the input owner');
    await waitForSimulation(
      page,
      progressingSample,
      { start: shortGesture.start },
      {
        seconds: 1,
        label: 'release before minimum hold leaves the item in hand',
        record: (line) => process.stderr.write(`${line}\n`),
      },
    );
    const shortThrowResult = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(uid);
      return { location: item && r.inventory.locate(item), expectedSide: r.dominant };
    }, throwFixture.uid);
    assert.equal(shortThrowResult.location?.kind, 'hand', 'a short throw release leaves the item held');
    assert.equal(shortThrowResult.location?.side, shortThrowResult.expectedSide, 'the primary-hand item stays held');
    assert.equal(await recordedThrows(), throwsBeforeShortRelease, 'a short release records no throw');
    const glowstickUseRefusal = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      const glowstick = r.inventory.itemByUid(uid);
      if (!glowstick) {
        throw new Error('The glowstick throw fixture is gone');
      }
      return r.survival.use(glowstick);
    }, throwFixture.uid);
    assert.equal(glowstickUseRefusal, undefined, 'the fixture glowstick can be lit before throwing');
    const landingTolerance = throwFixture.blockSize * 2;
    const landing = await aimThrowAtFreeLanding(page, throwFixture);
    const throwDistance = landing.landingDistance;
    assert(throwDistance !== undefined, 'the free landing has a distance');
    const releaseThrow = await mouseCharge(page);
    await page.waitForFunction(() => globalThis.primaryActionTest.isChargingItemThrow());
    const chargeStartedAt = await page.evaluate(() => globalThis.primaryActionTest.session.sim.time);
    await waitForSimulation(
      page,
      throwChargeSample,
      { start: chargeStartedAt, seconds: throwFixture.chargeSimSeconds },
      {
        seconds: throwFixture.chargeSimSeconds + 1,
        label: 'glowstick charge reaches its maximum throw range',
        record: (line) => process.stderr.write(`${line}\n`),
      },
    );
    const fullMeter = await page.evaluate(() => {
      const meter = document.querySelector('#handling [role="progressbar"]');
      if (!meter) {
        throw new Error('No handling progress bar is on the page');
      }
      return Number(meter.getAttribute('aria-valuenow'));
    });
    assert.equal(fullMeter, 100, 'maximum charge fills the activity ring');
    await releaseThrow();
    try {
      await page.waitForFunction(
        (uid) => globalThis.primaryActionTest.throwSpawnObservations[uid]?.active,
        throwFixture.uid,
      );
      await page.waitForFunction((uid) => {
        const { inventory } = globalThis.primaryActionTest;
        const glowstick = inventory.itemByUid(uid);
        return glowstick !== undefined && inventory.locate(glowstick)?.kind === 'pile';
      }, throwFixture.uid);
    } catch (error) {
      const state = await page.evaluate(
        ({ uid, seconds }) => {
          const r = globalThis.primaryActionTest;
          const item = r.inventory.itemByUid(uid);
          return {
            location: item && r.inventory.locate(item)?.kind,
            activeThrows: r.itemThrows.activeCount,
            throw: r.getItemThrowState(),
            target: r.getItemThrowLanding(uid, seconds),
            useHeld: r.input.controls.dominantUseHeld,
            rightHeld: r.input.controls.rightMouseHeld,
            time: r.session.sim.time,
            bodyRefusal: r.session.sim.body.actionRefusal,
            notice: r.getNotice(),
            throwActions: r.inputRecorder?.copyInputs().actions.filter((action) => action.action === 'item.throw')
              .length,
          };
        },
        { uid: throwFixture.uid, seconds: throwFixture.chargeSimSeconds },
      );
      process.stderr.write(`Full-charge throw did not complete: ${JSON.stringify(state)}\\n`);
      throw error;
    }
    await page.waitForFunction(() => {
      const handling = document.querySelector('#handling');
      return handling instanceof HTMLElement && handling.hidden;
    });
    const thrownGlowstick = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(uid);
      const location = item && r.inventory.locate(item);
      return {
        on: item?.on,
        sameInstance: location?.kind === 'pile' && location.pile.items.some((placed) => placed.item === item),
      };
    }, throwFixture.uid);
    assert.equal(thrownGlowstick.on, true, 'the thrown glowstick stays lit');
    assert.equal(thrownGlowstick.sameInstance, true, 'the same glowstick instance lands in the pile');
    assert.equal(await page.evaluate(() => globalThis.primaryActionTest.isThrowingStance()), false);
    const thrown = await page.evaluate(({ uid, start, blockSize }) => {
      const r = globalThis.primaryActionTest;
      const glowstick = r.inventory.itemByUid(uid);
      const location = glowstick && r.inventory.locate(glowstick);
      if (location?.kind !== 'pile') {
        throw new Error('Thrown glowstick did not land in a pile');
      }
      const [x, , z] = location.pile.pos;
      const [startX = Number.NaN, , startZ = Number.NaN] = start;
      return Math.hypot(x + 0.5 - startX, z + 0.5 - startZ) * blockSize;
    }, throwFixture);
    assert.ok(
      thrown >= throwDistance - landingTolerance,
      `throw reaches the item's own range (distance ${thrown} of ${throwDistance})`,
    );
    assert.ok(
      thrown <= throwDistance + landingTolerance,
      `throw lands no further than the item's own range (distance ${thrown} of ${throwDistance})`,
    );
    const loadedFirearm = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.clearHand(r.dominant);
      r.clearHand(r.off);
      const { registry } = r.inventory;
      const definition = [...registry.items.values()].find((item) => item.firearm?.pump);
      if (!definition?.model) {
        throw new Error('No pump firearm fixture is available');
      }
      const calibre = registry.models.get(definition.model)?.gun?.calibre;
      const cartridge = [...registry.items.values()].find((item) => item.ammo?.calibre === calibre);
      if (!cartridge) {
        throw new Error('No compatible firearm cartridge fixture is available');
      }
      const firearm = r.inventory.create(definition.id);
      const shell = r.inventory.create(cartridge.id);
      const spareShell = r.inventory.create(cartridge.id);
      r.setHand(r.dominant, firearm);
      r.setHand(r.off, shell);
      const ShellLoadSeconds = definition.firearm?.roundLoadSimSeconds;
      if (ShellLoadSeconds === undefined) {
        throw new Error('The pump firearm fixture has no round load time');
      }
      const start = r.session.sim.time;
      const refusal = r.session.firearms.load(shell, start);
      if (refusal) {
        throw new Error(`Could not load firearm throw fixture: ${refusal}`);
      }
      r.session.queue.tick(ShellLoadSeconds);
      r.session.firearms.advanceTo(start + ShellLoadSeconds);
      const firearmState = structuredClone(firearm.firearm);
      if (!firearmState?.tube?.length) {
        throw new Error('Firearm throw fixture did not load its ammunition');
      }
      r.setHand(r.off, spareShell);
      const senses = registry.senses.get('player');
      if (!senses) {
        throw new Error('No player senses are loaded');
      }
      return {
        uid: firearm.uid,
        spareShellUid: spareShell.uid,
        modelId: definition.model,
        firearmState,
        start: [...r.session.body.pos],
        blockSize: r.scale.blockSize,
        chargeSimSeconds: senses.light.throwChargeSimSeconds,
      };
    });
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      return r.view.held.heldItemPosition(r.dominant) !== undefined;
    });
    const dominantFirearmPose = () =>
      page.evaluate(() => {
        const r = globalThis.primaryActionTest;
        const hand = r.view.held.armPosition(r.dominant);
        const item = r.view.held.heldItemPosition(r.dominant);
        if (!(hand && item)) {
          throw new Error('The dominant hand holds no drawn firearm');
        }
        return { hand, item };
      });
    const firearmRestPose = await dominantFirearmPose();
    await pressAction(page, 'player.throw');
    await page.waitForFunction(() => globalThis.primaryActionTest.isThrowingStance());
    await page.waitForFunction((rest) => {
      const r = globalThis.primaryActionTest;
      const hand = r.view.held.armPosition(r.dominant);
      return hand !== undefined && hand[1] > rest.hand[1] && hand[2] > rest.hand[2];
    }, firearmRestPose);
    const firearmThrowPose = await dominantFirearmPose();
    for (const key of /** @type {const} */ (['hand', 'item'])) {
      assert.ok(firearmThrowPose[key][1] > firearmRestPose[key][1], `main-hand firearm ${key} is raised to throw`);
      assert.ok(firearmThrowPose[key][2] > firearmRestPose[key][2], `main-hand firearm ${key} is drawn back to throw`);
    }
    const chargeSpareShell = await mouseCharge(page);
    await page.waitForFunction(() => globalThis.primaryActionTest.isChargingItemThrow());
    const reloadHoldMs = await page.evaluate(async (moduleUrl) => {
      const { RELOAD_GESTURE_MS } = await import(moduleUrl);
      return RELOAD_GESTURE_MS.hold;
    }, reloadInputModule);
    const blockedReload = await holdAction(page, 'firearm.reload');
    const reloadPressAt = await page.evaluate(() => performance.now());
    await page.waitForFunction(({ started, holdMs }) => performance.now() - started >= holdMs, {
      started: reloadPressAt,
      holdMs: reloadHoldMs,
    });
    const framesAfterReloadHold = await page.evaluate(() => globalThis.primaryActionTest.frames);
    await page.waitForFunction((frame) => globalThis.primaryActionTest.frames > frame, framesAfterReloadHold);
    assert.equal(
      await page.evaluate((uid) => {
        const r = globalThis.primaryActionTest;
        return !(r.session.queue.busy || r.session.firearms.busy) && r.inventory.hands[r.off]?.uid === uid;
      }, loadedFirearm.spareShellUid),
      true,
      'R during an active throw charge starts no reload job and remains unqueued',
    );
    await page.mouse.down({ button: 'right' });
    await page.waitForFunction(() => !globalThis.primaryActionTest.isChargingItemThrow());
    await page.mouse.up({ button: 'right' });
    await chargeSpareShell();
    await blockedReload();
    assert.equal(
      await page.evaluate(() => !globalThis.primaryActionTest.session.queue.busy),
      true,
      'an R press consumed during charging is not deferred until charge cancellation',
    );
    const reloadAfterCancel = await holdAction(page, 'firearm.reload');
    await page.waitForFunction(() => globalThis.primaryActionTest.session.queue.busy);
    await reloadAfterCancel();
    await page.evaluate(() => globalThis.primaryActionTest.clearHand(globalThis.primaryActionTest.off));
    await page.evaluate(({ uid, chargeSimSeconds }) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(uid);
      if (!item) {
        throw new Error('The firearm throw fixture is gone');
      }
      const obstructed = r.getItemThrowLanding(uid, chargeSimSeconds);
      if (!obstructed?.target) {
        throw new Error('The firearm fixture needs a landing to obstruct');
      }
      // Force the crowded-landing case instead of depending on generated loot or the preceding mouse pose.
      while (r.inventory.planAdd(item, obstructed.target).ok) {
        if (!r.inventory.add(r.inventory.create(item.type), obstructed.target)) {
          throw new Error('Could not fill the firearm fixture landing');
        }
      }
    }, loadedFirearm);
    await aimThrowAtFreeLanding(page, loadedFirearm);
    const releaseFirearmThrow = await mouseCharge(page);
    const firearmThrowStartedAt = await page.evaluate(() => globalThis.primaryActionTest.session.sim.time);
    await waitForSimulation(
      page,
      throwChargeSample,
      { start: firearmThrowStartedAt, seconds: loadedFirearm.chargeSimSeconds },
      {
        seconds: loadedFirearm.chargeSimSeconds + 0.1,
        label: 'charged firearm throw completes',
        record: (line) => process.stderr.write(`${line}\n`),
        stop: releaseFirearmThrow,
      },
    );
    const firearmSpawn = await page.waitForFunction(
      (uid) => globalThis.primaryActionTest.throwSpawnObservations[uid],
      loadedFirearm.uid,
    );
    const firearmFlight = await firearmSpawn.jsonValue();
    assert(firearmFlight, 'the firearm throw records its flight spawn');
    process.stdout.write(`Firearm flight spawn: ${JSON.stringify(firearmFlight)}\n`);
    assert.equal(firearmFlight.active, true, 'firearm presentation starts at the throw transition');
    assert.ok(firearmFlight.names.includes(loadedFirearm.modelId), 'flight uses the firearm’s own ModelLibrary model');
    await page.waitForFunction((uid) => {
      const { inventory } = globalThis.primaryActionTest;
      const firearm = inventory.itemByUid(uid);
      return firearm !== undefined && inventory.locate(firearm)?.kind === 'pile';
    }, loadedFirearm.uid);
    const landedFirearm = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(uid);
      const location = item && r.inventory.locate(item);
      return {
        locationKind: location?.kind,
        sameInstance: location?.kind === 'pile' && location.pile.items.some((placed) => placed.item === item),
        firearmState: item?.firearm,
      };
    }, loadedFirearm.uid);
    assert.equal(landedFirearm.locationKind, 'pile', 'the loaded firearm lands in a pile');
    assert.equal(landedFirearm.sameInstance, true, 'throw moves the same firearm instance');
    const definedFirearmState = Object.fromEntries(
      Object.entries(landedFirearm.firearmState ?? {}).filter(([, value]) => value !== undefined),
    );
    assert.deepEqual(definedFirearmState, loadedFirearm.firearmState, 'throw preserves loaded firearm state');
    const rifleFixture = await page.evaluate(
      async ({ magazineUrl, optionsUrl }) => {
        const r = globalThis.primaryActionTest;
        const { magazineSpec, magazineWellCalibre } = await import(magazineUrl);
        const { stowTarget } = await import(optionsUrl);
        r.clearHand(r.dominant);
        r.clearHand(r.off);
        const { registry } = r.inventory;
        const rifle = r.inventory.create('rifle_assault');
        const calibre = magazineWellCalibre(registry, rifle.type);
        const magazineType = [...registry.items.keys()]
          .sort()
          .find((id) => magazineSpec(registry, id)?.calibre === calibre);
        const cartridgeType = [...registry.items.keys()]
          .sort()
          .find((id) => registry.items.get(id)?.ammo?.calibre === calibre);
        if (!(magazineType && cartridgeType)) {
          throw new Error('No compatible rifle magazine/cartridge fixture is available');
        }
        const magazine = r.inventory.create(magazineType);
        const cartridges = r.inventory.create(cartridgeType, 2);
        r.placePocketed(cartridges);
        r.setHand(r.dominant, magazine);
        const settle = () => {
          for (let step = 0; r.session.queue.busy; step += 1) {
            if (step > 400) {
              throw new Error('Fixture magazine handling did not finish');
            }
            r.session.frame(1 / 20);
          }
        };
        for (let round = 0; round < 2; round += 1) {
          const refusal = r.session.magazines.loadNext(magazine.uid, r.session.sim.time);
          if (refusal) {
            throw new Error(`Could not load fixture magazine: ${refusal}`);
          }
          settle();
        }
        const target = stowTarget(r.inventory, magazine, r.feet());
        if (target?.kind !== 'pocket' || !r.inventory.move(magazine, target).ok) {
          throw new Error('Could not stow loaded fixture magazine');
        }
        r.setHand(r.dominant, rifle);
        let refusal = r.session.firearms.loadNext(rifle.uid, r.session.sim.time);
        if (refusal) {
          throw new Error(`Could not fit fixture magazine: ${refusal}`);
        }
        settle();
        refusal = r.session.firearms.cock(rifle.uid, r.session.sim.time);
        if (refusal) {
          throw new Error(`Could not chamber fixture round: ${refusal}`);
        }
        return { uid: rifle.uid, magazineUid: magazine.uid };
      },
      { magazineUrl: magazineModule, optionsUrl: optionsModule },
    );
    await pressAction(page, 'player.throw');
    await page.waitForFunction(() => globalThis.primaryActionTest.isThrowingStance());
    const releaseRifleThrow = await mouseCharge(page);
    const throwWait = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      return { handling: r.session.queue.busy, charging: r.isChargingItemThrow() };
    });
    assert.equal(throwWait.handling, true, 'rifle rack is still being handled when mouse-1 is pressed');
    assert.equal(throwWait.charging, false, 'throw charge waits for the rifle rack to finish');
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      return !(r.session.queue.busy || r.session.firearms.busy) && r.isChargingItemThrow();
    });
    const loadedRifle = await page.evaluate(
      async ({ uid, magazineUid, itemLookUrl }) => {
        const r = globalThis.primaryActionTest;
        const { itemLook } = await import(itemLookUrl);
        const rifle = r.inventory.itemByUid(uid);
        const magazine = r.inventory.itemByUid(magazineUid);
        if (!(rifle && magazine)) {
          throw new Error('The loaded rifle fixture or its magazine is gone');
        }
        const look = itemLook(r.inventory.registry, rifle);
        if (!look || rifle.firearm?.chamber !== 'round' || magazine.cartridges?.length !== 1) {
          throw new Error('Loaded rifle fixture needs a fitted magazine and a chambered round');
        }
        const senses = r.inventory.registry.senses.get('player');
        if (!senses) {
          throw new Error('No player senses are loaded');
        }
        return {
          uid,
          magazineUid,
          firearmState: structuredClone(rifle.firearm),
          magazineCartridges: [...magazine.cartridges],
          lookKey: look.key,
          chargeSimSeconds: senses.light.throwChargeSimSeconds,
          chargeStartedAt: r.session.sim.time,
        };
      },
      { ...rifleFixture, itemLookUrl: itemLookModule },
    );
    await aimThrowAtFreeLanding(page, loadedRifle);
    await waitForSimulation(
      page,
      throwChargeSample,
      { start: loadedRifle.chargeStartedAt, seconds: loadedRifle.chargeSimSeconds },
      {
        seconds: loadedRifle.chargeSimSeconds + 0.1,
        label: 'charged magazine-fed rifle throw completes',
        record: (line) => process.stderr.write(`${line}\n`),
        stop: releaseRifleThrow,
      },
    );
    const rifleSpawn = await page.waitForFunction(
      (uid) => globalThis.primaryActionTest.throwSpawnObservations[uid],
      loadedRifle.uid,
    );
    const rifleFlight = await rifleSpawn.jsonValue();
    assert(rifleFlight, 'the rifle throw records its flight spawn');
    assert.equal(rifleFlight.active, true, 'rifle presentation starts at the throw transition');
    assert.ok(rifleFlight.names.includes(loadedRifle.lookKey), 'flight uses the loaded rifle’s composed model');
    await page.waitForFunction((uid) => {
      const { inventory } = globalThis.primaryActionTest;
      const rifle = inventory.itemByUid(uid);
      return rifle !== undefined && inventory.locate(rifle)?.kind === 'pile';
    }, loadedRifle.uid);
    const landedRifle = await page.evaluate(({ uid, magazineUid }) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(uid);
      const magazine = r.inventory.itemByUid(magazineUid);
      const location = item && r.inventory.locate(item);
      const locations = [...r.inventory.items()].map(({ item: candidate }) => candidate.uid);
      return {
        sameInstance: location?.kind === 'pile' && location.pile.items.some(({ item: placed }) => placed === item),
        sameMagazine: item?.slots?.magazine === magazine,
        firearmState: item?.firearm,
        magazineCartridges: magazine?.cartridges,
        duplicateItemUids: locations.length !== new Set(locations).size,
      };
    }, loadedRifle);
    assert.equal(landedRifle.sameInstance, true, 'throw moves the same loaded rifle instance');
    assert.equal(landedRifle.sameMagazine, true, 'throw keeps the fitted magazine instance on the rifle');
    assert.deepEqual(landedRifle.firearmState, loadedRifle.firearmState, 'throw keeps the chambered round');
    assert.deepEqual(
      landedRifle.magazineCartridges,
      loadedRifle.magazineCartridges,
      'throw keeps the fitted magazine rounds',
    );
    assert.equal(landedRifle.duplicateItemUids, false, 'throw does not duplicate the nested magazine item');
    await page.evaluate((enabled) => {
      globalThis.primaryActionTest.hudOptions.interaction = enabled;
    }, interactionHintsBeforeThrowStance);
    await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const light = r.inventory.itemByUid(r.lightUid);
      if (!light) {
        throw new Error('The light fixture is gone');
      }
      r.setHand(r.off, light);
    });
    await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.setHand(r.dominant, r.inventory.create(r.types.tool));
    });
    const both = await strike();
    assert.equal(both.on, false);
    assert.deepEqual(both.swings.at(-1), {
      result: true,
      profile: await page.evaluate(() => globalThis.primaryActionTest.types.profile),
      hand: 'left',
    });
    await finishedSwing();
    const throwDuringHandling = await attemptDuringHandling(roles.dominant, roles.off, false, true);
    assertHandlingRefusal(throwDuringHandling, 'held-item throw');
    assert.equal(throwDuringHandling.throwAttempt?.charging, false, 'a queued handling job does not charge a throw');
    assert.ok(throwDuringHandling.throwAttempt?.notice.trim(), 'waiting for handling leaves a notice');
    assertHandlingRefusal(await attemptDuringHandling(roles.dominant, roles.off), 'held-weapon attack');
    assertHandlingRefusal(await attemptDuringHandling(roles.off, roles.dominant), 'off-hand primary action');
    const mouse5WhileHandling = await attemptDuringHandling(roles.off, roles.dominant, true);
    assert.equal(mouse5WhileHandling.inputActive, true, 'Mouse 5 is dispatched while the game owns input');
    assertHandlingRefusal(mouse5WhileHandling, 'off-hand instant action');
    await toggleLight('hand.use-off', true);
    await toggleLight('hand.use-off', false);
    await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const light = r.inventory.itemByUid(r.lightUid);
      if (!light) {
        throw new Error('The light fixture is gone');
      }
      r.setHand(r.dominant, light);
    });
    await toggleLight(null, true);
    await toggleLight(null, false);
    await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const light = r.inventory.itemByUid(r.lightUid);
      if (!light) {
        throw new Error('The light fixture is gone');
      }
      r.setHand(r.off, light);
      r.setHand(r.dominant, r.inventory.create(r.types.inert));
      r.clearNotice();
    });
    const unsupportedBefore = await observe();
    await page.mouse.click(640, 450);
    await page.waitForFunction(() => Boolean(globalThis.primaryActionTest.getNotice()));
    await nextFrame();
    const unsupported = await observe();
    assert.deepEqual(unsupported.swings, unsupportedBefore.swings, 'unsupported held item never falls back to fists');
    assert.ok(unsupported.stamina >= unsupportedBefore.stamina);
    await toggleLight('hand.use-off', true);
    await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.clearHand(r.dominant);
      r.clearHand(r.off);
      r.swings = [];
    });
    assert.deepEqual((await strike()).swings[0], { result: true, profile: 'fists', hand: 'left' });
    await finishedSwing();
    assert.deepEqual((await strike()).swings[1], { result: true, profile: 'fists', hand: 'right' });
    await finishedSwing();
    await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const light = r.inventory.create(r.types.light);
      r.lightUid = light.uid;
      r.setHand(r.off, light);
      r.swings = [];
    });
    const blockedBefore = await observe();
    await pressAction(page, 'debug.build-toggle');
    assert.equal(await page.evaluate(() => globalThis.primaryActionTest.debugTools?.buildOn), true);
    await pressAction(page, 'hand.use-off');
    await nextFrame();
    const build = await observe();
    assert.equal(build.on, false);
    assert.deepEqual(build.swings, []);
    assert.ok(build.stamina >= blockedBefore.stamina);
    await pressAction(page, 'debug.build-toggle');
    await pressAction(page, 'ui.inventory-toggle');
    assert.equal(await page.evaluate(() => globalThis.primaryActionTest.input.menuPointer), true);
    await pressAction(page, 'hand.use-off');
    await nextFrame();
    const menu = await observe();
    assert.equal(menu.on, false);
    assert.deepEqual(menu.swings, []);
    assert.ok(menu.stamina >= blockedBefore.stamina);
    await pressAction(page, 'ui.inventory-toggle');

    endSegment('throw-cases');
    // The fixture gun is magazine-fed: the player loads a round into its magazine, fits it and charges.
    const firearm = await page.evaluate(async () => {
      const moduleUrl = '/@stage/@skelly/engine/inventory';
      const magazineUrl = '/@stage/@skelly/engine/internal/core/magazine.ts';
      const optionsUrl = '/@stage/@skelly/engine/internal/core/options.ts';
      const { firearmHandlingFor, spentCaseItemId } = await import(moduleUrl);
      const { magazineSpec, magazineWellCalibre } = await import(magazineUrl);
      const { stowTarget } = await import(optionsUrl);
      const r = globalThis.primaryActionTest;
      const { registry } = r.inventory;
      const { firearms, magazines, queue, sim } = r.session;
      /** @param {string | undefined} refusal */
      const must = (refusal) => {
        if (refusal) {
          throw new Error(`Could not ready the fixture firearm: ${refusal}`);
        }
      };
      const settle = () => {
        for (let step = 0; queue.busy; step += 1) {
          if (step > 600) {
            throw new Error('Fixture firearm handling did not finish');
          }
          r.session.frame(1 / 20);
        }
      };
      const calibre = magazineWellCalibre(registry, r.types.gun);
      const ids = [...registry.items.keys()].sort();
      const magazineType = ids.find((id) => magazineSpec(registry, id)?.calibre === calibre);
      const cartridgeType = ids.find((id) => registry.items.get(id)?.ammo?.calibre === calibre);
      if (!(magazineType && cartridgeType)) {
        throw new Error('No compatible magazine/cartridge fixture is available for the fixture firearm');
      }
      const magazine = r.inventory.create(magazineType);
      r.placePocketed(r.inventory.create(cartridgeType));
      r.clearHand(r.off);
      r.setHand(r.dominant, magazine);
      must(magazines.loadNext(magazine.uid, sim.time));
      settle();
      const pocket = stowTarget(r.inventory, magazine, r.feet());
      if (pocket?.kind !== 'pocket' || !r.inventory.move(magazine, pocket).ok) {
        throw new Error('Could not pocket the loaded fixture magazine');
      }
      const gun = r.scopedGun(r.types.gun, r.types.opticStation, r.types.optic);
      r.setHand(r.dominant, gun);
      must(firearms.loadNext(gun.uid, sim.time));
      settle();
      must(firearms.cock(gun.uid, sim.time));
      settle();
      r.caseType = spentCaseItemId(firearmHandlingFor(gun, registry).calibre);
      return {
        uid: gun.uid,
        cases: [...r.inventory.piles.values()]
          .flatMap((p) => p.items)
          .filter(({ item }) => item.type === r.caseType)
          .reduce((sum, { item }) => sum + item.count, 0),
      };
    });
    await page.mouse.down({ button: 'right' });
    const raiseDuration = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      r.session.frame(1 / 60);
      const readying = r.inventory.itemByUid(uid)?.firearm?.readying;
      if (!readying) {
        throw new Error('The fixture firearm is not being raised');
      }
      return readying.duration;
    }, firearm.uid);
    await page.evaluate((duration) => globalThis.primaryActionTest.session.frame(duration), raiseDuration);
    assert.equal(
      await page.evaluate((uid) => globalThis.primaryActionTest.session.firearms.isReady(uid), firearm.uid),
      true,
      'fixture firearm is ready before firing',
    );
    await page.mouse.click(640, 450, { button: 'middle' });
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      return r.input.controls.aimingDownSights && r.view.held.opticLensFrame;
    });
    const opticView = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      const previewFirearm = r.inventory.itemByUid(uid);
      if (!previewFirearm) {
        throw new Error('The fixture firearm is gone');
      }
      const optic = Object.values(previewFirearm.slots ?? {}).find((item) => {
        const definition = item && r.inventory.registry.items.get(item.type);
        const model = definition?.model === undefined ? undefined : r.inventory.registry.models.get(definition.model);
        return model?.gun?.attachment?.kind === 'optic';
      });
      if (!optic) {
        throw new Error('Fixture firearm has no mounted optic');
      }
      const definition = r.inventory.registry.items.get(optic.type);
      const model = definition?.model === undefined ? undefined : r.inventory.registry.models.get(definition.model);
      const mounted = model?.gun?.attachment;
      if (!(definition && mounted)) {
        throw new Error('The mounted optic has no attachment model');
      }
      const expected = {
        magnification: definition.opticMagnification ?? mounted.properties.magnification?.min ?? 1,
        aperture: mounted.properties.aperture,
        reticle: mounted.properties.reticle,
      };
      const frame = r.view.held.opticLensFrame;
      if (!frame) {
        throw new Error('ADS shows no optic lens frame');
      }
      return {
        frame: { magnification: frame.magnification, aperture: frame.aperture, reticle: frame.reticle },
        expected,
        range: mounted.properties.magnification,
        step: definition.opticZoom?.step,
      };
    }, firearm.uid);
    assert.deepEqual(opticView.frame, opticView.expected, 'ADS lens uses the mounted optic content and export');
    const minPower = opticView.range?.min;
    const maxPower = opticView.range?.max;
    const zoomStep = opticView.step;
    assert(
      minPower !== undefined && maxPower !== undefined && zoomStep !== undefined && minPower < maxPower && zoomStep > 0,
      'ADS wheel fixture needs a variable optic',
    );
    const zoomDirection = opticView.frame.magnification < maxPower ? -1 : 1;
    const selectedPower = Math.max(
      minPower,
      Math.min(maxPower, opticView.frame.magnification - zoomDirection * zoomStep),
    );
    await page.mouse.wheel(0, zoomDirection * 120);
    await page.waitForFunction(
      (power) => globalThis.primaryActionTest.view.held.opticLensFrame?.magnification === power,
      selectedPower,
    );
    assert.notEqual(selectedPower, opticView.frame.magnification, 'the wheel changes the actual ADS lens frame');
    await page.mouse.click(640, 450);
    await page.evaluate(() => globalThis.primaryActionTest.session.frame(0.1));
    await page.waitForFunction(() => globalThis.primaryActionTest.caseEffects.activeCount > 0);
    await page.waitForFunction(({ uid, cases }) => {
      const r = globalThis.primaryActionTest;
      const count = [...r.inventory.piles.values()]
        .flatMap((p) => p.items)
        .filter(({ item }) => item.type === r.caseType)
        .reduce((sum, { item }) => sum + item.count, 0);
      return (
        count === cases + 1 &&
        r.audio.heardSounds.some((sound) => sound.sourceLabel === r.inventory.itemByUid(uid)?.type)
      );
    }, firearm);
    const emission = await page.evaluate(({ uid }) => {
      const r = globalThis.primaryActionTest;
      return {
        uid: r.inventory.hands.left?.uid,
        flying: r.caseEffects.activeCount,
        shot: r.audio.heardSounds.findLast((sound) => sound.sourceLabel === r.inventory.itemByUid(uid)?.type),
      };
    }, firearm);
    assert.equal(emission.uid, firearm.uid);
    assert.equal(emission.flying, 0, 'the flight retires in the frame the pile case appears');
    assert.ok(emission.shot?.file);
    assert.equal(emission.shot?.distanceMetres, 0);
    assert.equal(emission.shot?.lowpassHz, null);
    await page.waitForFunction(() => {
      const gun = globalThis.primaryActionTest.inventory.hands.left;
      return gun !== undefined && !gun.firearm?.cycle;
    });
    await page.mouse.up({ button: 'right' });
    const pistol = await page.evaluate(
      async ({ startModule, presetsModule, actionModule, options }) => {
        const r = globalThis.primaryActionTest;
        const { applyStartKit } = await import(startModule);
        const { shortFirearmStart } = await import(presetsModule);
        const { actionCycleSeconds } = await import(actionModule);
        const { dropTarget } = await import(options);
        r.clearHand(r.dominant);
        r.clearHand(r.off);
        const pos = r.session.body.pos.map(Math.floor);
        for (const worn of new Set(Object.values(r.inventory.worn))) {
          if (worn && !r.inventory.move(worn, dropTarget(r.inventory, worn, pos).target).ok) {
            throw new Error('Could not clear worn items for the authored debug preset');
          }
        }
        const preset = shortFirearmStart(r.inventory.registry, r.engine.config.site);
        applyStartKit(r.inventory, preset);
        const gun = r.inventory.hands[r.dominant];
        if (!gun) {
          throw new Error('The authored debug preset put no gun in the dominant hand');
        }
        const pistolAction = () => {
          const definition = r.inventory.registry.items.get(gun.type);
          const model = definition?.model === undefined ? undefined : r.inventory.registry.models.get(definition.model);
          if (!(definition?.twoHanded && model?.hands?.support) || model.hands.butt) {
            throw new Error('Pistol needs a free two-palm hold, not a shoulder seat');
          }
          const authored = model.gun?.action;
          if (!authored) {
            throw new Error('Pistol needs an authored action');
          }
          return authored;
        };
        const action = pistolAction();
        const refusal = r.session.firearms.cock(gun.uid, r.session.sim.time);
        if (refusal) {
          throw new Error(refusal);
        }
        const { hand } = action;
        r.session.frame((hand.unlockSimSeconds ?? 0) + hand.rearwardSimSeconds);
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        const reach = r.view.held.handGripReach(gun.uid, r.off);
        if (!reach) {
          throw new Error('Pistol rack needs an authored slide contact and a support arm rig');
        }
        if (reach.palmGapMetres > 1e-6 || reach.fullTravelGapMetres > 1e-6) {
          throw new Error('Support palm must carry the slide through its full authored travel');
        }
        const settle = () => {
          for (let step = 0; r.session.queue.busy; step += 1) {
            if (step > 400) {
              throw new Error('Pistol slide handling did not finish');
            }
            r.session.frame(1 / 20);
          }
        };
        settle();
        const cartridges = gun.slots?.magazine?.cartridges;
        if (!cartridges) {
          throw new Error('Pistol needs a fitted magazine');
        }
        return {
          uid: gun.uid,
          rounds: cartridges.length,
          cycle: actionCycleSeconds(action, 'fire'),
        };
      },
      {
        startModule: startStateModule,
        presetsModule: debugStartsModule,
        actionModule: firearmActionModule,
        options: optionsModule,
      },
    );
    await page.mouse.down({ button: 'right' });
    await page.waitForFunction((uid) => globalThis.primaryActionTest.session.firearms.isReady(uid), pistol.uid);
    await page.mouse.down();
    await page.waitForFunction(({ uid, rounds }) => {
      const cartridges = globalThis.primaryActionTest.inventory.itemByUid(uid)?.slots?.magazine?.cartridges;
      return cartridges !== undefined && cartridges.length < rounds;
    }, pistol);
    await page.evaluate((cycle) => globalThis.primaryActionTest.session.frame(cycle * 3), pistol.cycle);
    assert.equal(
      await page.evaluate((uid) => {
        const cartridges = globalThis.primaryActionTest.inventory.itemByUid(uid)?.slots?.magazine?.cartridges;
        if (!cartridges) {
          throw new Error('The pistol lost its fitted magazine');
        }
        return cartridges.length;
      }, pistol.uid),
      pistol.rounds - 1,
      'holding the pistol trigger commits only one shot',
    );
    await page.mouse.up();
    await page.mouse.click(640, 450);
    await page.waitForFunction(({ uid, rounds }) => {
      const cartridges = globalThis.primaryActionTest.inventory.itemByUid(uid)?.slots?.magazine?.cartridges;
      return cartridges !== undefined && cartridges.length === rounds - 2;
    }, pistol);
    await page.mouse.up({ button: 'right' });
    const grenade = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const definition = [...r.inventory.registry.items.values()].find((candidate) => candidate.explosive);
      if (!definition?.explosive) {
        throw new Error('No explosive capability for grenade fixture');
      }
      const item = r.inventory.create(definition.id);
      const { blast, fragments, fuseSimSeconds } = definition.explosive;
      // A landed charge beyond both hazards cannot injure the later flow's player.
      const [x, y, z] = r.session.body.pos;
      const clearance = (blast.radiusMetres + fragments.rangeMetres) / r.scale.blockSize;
      if (
        !r.inventory.add(item, { kind: 'pile', pos: [x + clearance, y, z] }) ||
        r.session.fuses.togglePin(item) !== 'pulled'
      ) {
        throw new Error('Could not stage the landed grenade');
      }
      return { uid: item.uid, fuseSimSeconds, start: r.session.sim.time };
    });
    await page.waitForFunction((uid) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(uid);
      return item && r.session.fuses.state(item) === 'burning';
    }, grenade.uid);
    await waitForSimulation(
      page,
      ({ uid }) => {
        const { session, inventory } = globalThis.primaryActionTest;
        return { time: session.sim.time, paused: session.sim.paused, reached: !inventory.itemByUid(uid) };
      },
      { uid: grenade.uid },
      {
        seconds: grenade.fuseSimSeconds + 1,
        from: grenade.start,
        label: 'released grenade burns its authored fuse',
        record: (line) => process.stderr.write(`${line}\n`),
      },
    );
    assert.equal(
      await page.evaluate((uid) => Boolean(globalThis.primaryActionTest.inventory.itemByUid(uid)), grenade.uid),
      false,
      'detonation consumes the released grenade',
    );
    const food = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const source = [...r.inventory.registry.items.values()].find((candidate) => candidate.food && !candidate.unpack);
      if (!source) {
        throw new Error('No unpacked food capability for quickbar fixture');
      }
      const definition = { ...source, id: 'primary_action_quickbar_food', name: 'Quickbar fixture food' };
      r.inventory.registry.items.set(definition.id, definition);
      const item = r.inventory.create(definition.id);
      r.placePocketed(item);
      r.session.quickbar.assign(0, item);
      return { uid: item.uid, count: item.count, heldUid: r.inventory.hands.left?.uid };
    });
    const releaseQuickbar = await holdAction(page, 'quickbar.use.1');
    try {
      await page.waitForFunction(({ uid, count, heldUid }) => {
        const r = globalThis.primaryActionTest;
        const item = r.inventory.itemByUid(uid);
        return (!item || item.count < count) && r.inventory.hands.left?.uid === heldUid;
      }, food);
    } finally {
      await releaseQuickbar();
    }
    assert.equal(await page.evaluate(() => globalThis.primaryActionTest.inventory.hands.left?.uid), food.heldUid);
    const bookUid = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const definition = [...r.inventory.registry.items.values()].find((candidate) => candidate.book);
      if (!definition) {
        throw new Error('No book capability for primary reading fixture');
      }
      r.clearHand(r.dominant);
      const book = r.inventory.create(definition.id);
      r.setHand(r.dominant, book);
      return book.uid;
    });
    await page.mouse.click(640, 450);
    await page.waitForFunction(
      (uid) => {
        const { job } = globalThis.primaryActionTest.session.sim.actions;
        return job?.jobType === 'reading' && !job.stopped && job.bookUid === uid;
      },
      bookUid,
      { timeout: 10_000 },
    );
    // The reading card owns keyboard input until it is closed.
    await page.keyboard.press('Escape');
    await pressAction(page, 'handling.stop');
    await page.waitForFunction(
      () => {
        const { sim } = globalThis.primaryActionTest.session;
        return sim.actions.job?.jobType === 'reading' && sim.actions.job.stopped;
      },
      undefined,
      { timeout: 10_000 },
    );
    endSegment('firearm-optic-grenade-case');
    const pryPreview = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.session.sim.actions.cancel();
      const definition = r.inventory.registry.furniture.get('wood_door');
      if (!definition) {
        throw new Error('No wood_door furniture for the prying fixture');
      }
      // Just past the body, not on the feet: a closed door built around the player walls in
      // their own cell, so a later drop at the feet would reach through it.
      const { pos: bodyPos, halfWidth } = r.session.body;
      const [x, y] = r.feet();
      const door = r.inventory.furnish({
        type: definition.id,
        pos: [x, y, Math.floor(bodyPos[2] + halfWidth) + 1],
        size: definition.size,
        facing: 'n',
        lock: { id: 'test_shed', locked: true },
      });
      if (!door) {
        throw new Error('Could not place the first-look prying door');
      }
      r.clearHand('right');
      const crowbar = r.inventory.create('crowbar');
      if (!r.inventory.add(crowbar, { kind: 'hand', side: 'right' })) {
        throw new Error('Could not carry the first-look crowbar');
      }
      r.hudOptions.handling = false;
      /**
       * @param {unknown} part
       * @returns {string}
       */
      const plain = (part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (Array.isArray(part)) {
          return part.map(plain).join('');
        }
        if (!(part && typeof part === 'object' && 'strings' in part)) {
          return '';
        }
        const { strings, values } = /** @type {Exclude<HintText, string>} */ (part);
        return strings.map((s, i) => s + (i < values.length ? plain(values[i]) : '')).join('');
      };
      const hint = plain(r.useText(door));
      r.useTarget(door);
      return { hint, toolName: r.inventory.name(crowbar), job: r.session.sim.actions.job, doorUid: door.uid };
    });
    assert.ok(
      pryPreview.hint.toLowerCase().includes(pryPreview.toolName.toLowerCase()),
      'the interaction hint names its carried prying tool',
    );
    assert.equal(pryPreview.job?.jobType, 'forceDoor', 'the door interaction starts the owned prying action');
    await page.waitForFunction(() => {
      const root = document.querySelector('#handling');
      return root instanceof HTMLElement && root.hidden;
    });
    await page.evaluate(() => {
      globalThis.primaryActionTest.hudOptions.handling = true;
    });
    await page.waitForFunction(() => {
      const root = document.querySelector('#handling');
      return root instanceof HTMLElement && !root.hidden && root.querySelector('.activity-progress-gauge');
    });
    const pryElapsed = await page.evaluate(async () => {
      const simUrl = '/@stage/@skelly/engine/sim';
      const { simSeconds } = await import(simUrl);
      const { session } = globalThis.primaryActionTest;
      const { sim } = session;
      sim.frame(simSeconds(1));
      sim.actions.stop();
      const { job } = sim.actions;
      if (job?.jobType !== 'forceDoor') {
        throw new Error('Stopping the pry lost its progress');
      }
      return job.elapsed;
    });
    assert.ok(pryElapsed > 0, 'normal-speed simulation advances visible pry progress');
    await page.waitForFunction(() => {
      const root = document.querySelector('#handling');
      return root instanceof HTMLElement && root.hidden;
    });
    await page.evaluate((doorUid) => {
      const r = globalThis.primaryActionTest;
      const door = r.inventory.entities.byUid(doorUid);
      if (!door) {
        throw new Error('The prying door disappeared before resume');
      }
      r.useTarget(door);
    }, pryPreview.doorUid);
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      const root = document.querySelector('#handling');
      if (!(root instanceof HTMLElement)) {
        return false;
      }
      const gauge = root.querySelector('.activity-progress-gauge');
      const bounds = gauge?.getBoundingClientRect();
      const centered =
        bounds &&
        Math.abs(bounds.left + bounds.width / 2 - innerWidth / 2) < 2 &&
        Math.abs(bounds.top + bounds.height / 2 - innerHeight / 2) < 2;
      return (
        r.session.sim.actions.job?.jobType === 'forceDoor' &&
        !root.hidden &&
        gauge?.querySelector('.activity-progress-value') &&
        Number(gauge.getAttribute('aria-valuenow')) > 0 &&
        centered
      );
    });
    const resumedElapsed = await page.evaluate(() => {
      const { job } = globalThis.primaryActionTest.session.sim.actions;
      if (job?.jobType !== 'forceDoor') {
        throw new Error('The resumed pry is not running');
      }
      return job.elapsed;
    });
    assert.ok(resumedElapsed >= pryElapsed, 'resuming never moves the pry cursor backwards');
    const stopLabel = await page.evaluate(async (moduleUrl) => {
      const { inputBindings } = await import(moduleUrl);
      return inputBindings.label('handling.stop');
    }, inputBindingsModule);
    assert.ok((await page.locator('#handling').textContent())?.includes(stopLabel));
    await page.evaluate(() => {
      globalThis.primaryActionTest.hudOptions.handling = false;
    });
    await page.waitForFunction(() => {
      const root = document.querySelector('#handling');
      return root instanceof HTMLElement && root.hidden;
    });
    await page.evaluate(() => {
      globalThis.primaryActionTest.hudOptions.handling = true;
    });
    await page.waitForFunction(() => {
      const root = document.querySelector('#handling');
      if (!(root instanceof HTMLElement)) {
        return false;
      }
      const gauge = root.querySelector('.activity-progress-gauge');
      return !root.hidden && gauge && Number(gauge.getAttribute('aria-valuenow')) > 0;
    });
    const pryingScreenshot = resolve(projectRoot, 'test-results/primary-action/prying-progress.png');
    await mkdir(resolve(projectRoot, 'test-results/primary-action'), { recursive: true });
    await page.screenshot({ path: pryingScreenshot });
    await page.evaluate(() => globalThis.primaryActionTest.session.sim.actions.cancel());

    endSegment('prying-case');
    const lockedDoorStart = performance.now();
    const lockedPage = await stageBrowser.newPage({ viewport: { width: 1280, height: 720 } });
    await lockedPage.addInitScript(() => {
      let locked = false;
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        get: () => (locked ? (document.querySelector('#view canvas') ?? document.querySelector('#view')) : null),
      });
      Element.prototype.requestPointerLock = () => {
        locked = true;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      };
      document.exitPointerLock = () => {
        locked = false;
        document.dispatchEvent(new Event('pointerlockchange'));
      };
    });
    try {
      await lockedPage.goto(
        browserStageUrl(
          'primary-action',
          gameUrl(`http://127.0.0.1:${port}`, {
            startMod: lockTestNoonMod,
            hash: { debug: true, seed: 73, radius: 32, post: false, sunshadow: false, torchshadow: false },
          }),
          renderOverride,
        ),
      );
      await lockedPage.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
      await lockedPage.locator('#go').click();
      await waitForWorldLoaded(lockedPage);
      await lockedPage.waitForFunction(() => {
        const overlay = document.querySelector('#overlay');
        return (
          globalThis.primaryActionTest &&
          overlay instanceof HTMLElement &&
          overlay.hidden &&
          document.pointerLockElement
        );
      });
      await lockedPage.evaluate(() => {
        const r = globalThis.primaryActionTest;
        const door = [...r.inventory.entities.all].find((entity) => entity.lock?.locked);
        if (!door) {
          throw new Error('lock_test did not instantiate its locked door');
        }
        const aimAtDoor = () => {
          /** @type {[number, number, number]} */
          const target = [
            door.pos[0] + door.size[0] / 2,
            door.pos[1] + door.size[1] / 2,
            door.pos[2] + door.size[2] / 2,
          ];
          /** @type {[number, number, number]} */
          const eye = [
            r.session.body.pos[0],
            r.session.body.pos[1] + r.session.playerEyeHeightMetres / r.scale.blockSize,
            r.session.body.pos[2],
          ];
          const dx = target[0] - eye[0];
          const dy = target[1] - eye[1];
          const dz = target[2] - eye[2];
          r.input.controls.yaw = Math.atan2(-dx, -dz);
          r.input.controls.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        };
        aimAtDoor();
        const target = r.interactionTargetAt();
        if (target?.kind !== 'furniture' || target.entity.uid !== door.uid) {
          throw new Error(`lock_test locked door is not the F target: ${JSON.stringify(target)}`);
        }
        r.clearNotice();
      });
      const toolDoor = await lockedPage.evaluate(() => {
        const r = globalThis.primaryActionTest;
        const door = [...r.inventory.entities.all].find((entity) => entity.lock?.locked);
        if (!door) {
          throw new Error('Could not find the locked-door prying fixture');
        }
        r.setHand(r.dominant, r.inventory.create('crowbar'));
        /** @type {[number, number, number]} */
        const target = [door.pos[0] + door.size[0] / 2, door.pos[1] + door.size[1] / 2, door.pos[2] + door.size[2] / 2];
        /** @type {[number, number, number]} */
        const eye = [
          r.session.body.pos[0],
          r.session.body.pos[1] + r.session.playerEyeHeightMetres / r.scale.blockSize,
          r.session.body.pos[2],
        ];
        const dx = target[0] - eye[0];
        const dy = target[1] - eye[1];
        const dz = target[2] - eye[2];
        r.input.controls.yaw = Math.atan2(-dx, -dz);
        r.input.controls.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        const picked = r.interactionTargetAt();
        if (picked?.kind !== 'furniture' || picked.entity.uid !== door.uid) {
          throw new Error(`lock_test tool door is not the F target: ${JSON.stringify(picked)}`);
        }
        r.clearNotice();
        return { uid: door.uid, start: r.session.sim.time };
      });
      await pressAction(lockedPage, 'world.interact');
      await waitForSimulation(
        lockedPage,
        pryStartedSample,
        { uid: toolDoor.uid },
        {
          seconds: 0.5,
          label: 'locked-door F action enters the simulation',
          record: (line) => process.stderr.write(`${line}\n`),
        },
      );
      const pryAction = await lockedPage.evaluate((uid) => {
        const r = globalThis.primaryActionTest;
        const target = r.interactionTargetAt();
        return {
          job: r.session.sim.actions.job?.jobType,
          targetUid: target?.kind === 'furniture' ? target.entity.uid : undefined,
          fixtureUid: uid,
          inputLocked: r.session.sim.compression.locksInput,
          interruption: r.session.sim.compression.interruption,
        };
      }, toolDoor.uid);
      assert.equal(pryAction.targetUid, toolDoor.uid, 'real F input targets the locked door with its tool');
      assert.equal(
        pryAction.job,
        'forceDoor',
        `F starts the available locked-door prying action: ${JSON.stringify(pryAction)}`,
      );
      await waitForSimulation(
        lockedPage,
        ({ start }) => {
          const { session } = globalThis.primaryActionTest;
          return { time: session.sim.time, paused: session.sim.paused, reached: session.sim.time - start >= 1 };
        },
        { start: toolDoor.start },
        {
          seconds: 1.5,
          label: 'locked-door prying remains active',
          record: (line) => process.stderr.write(`${line}\n`),
        },
      );
      assert.equal(
        await lockedPage.evaluate(() => globalThis.primaryActionTest.session.sim.actions.job?.jobType),
        'forceDoor',
        'the prying action remains active until interrupted',
      );
      const interruptionAt = await lockedPage.evaluate(() => {
        const r = globalThis.primaryActionTest;
        const { session } = r;
        const { job } = session.sim.actions;
        if (job?.jobType !== 'forceDoor') {
          throw new Error('The carried-tool pry disappeared before interruption');
        }
        r.session.sim.emit({ kind: 'interrupt', reason: 'You hear something outside' });
        return { start: r.session.sim.time, elapsed: job.elapsed };
      });
      await waitForSimulation(
        lockedPage,
        progressingSample,
        { start: interruptionAt.start },
        {
          seconds: 0.5,
          label: 'prying interruption reaches the simulation',
          record: (line) => process.stderr.write(`${line}\n`),
        },
      );
      const interruptedPry = await lockedPage.evaluate(() => {
        const r = globalThis.primaryActionTest;
        return {
          job: r.session.sim.actions.job,
          inputLocked: r.session.sim.compression.locksInput,
          interruption: r.session.sim.compression.interruption,
          notice: r.getNotice(),
        };
      });
      assert.equal(interruptedPry.job?.jobType, 'forceDoor', 'an interruption keeps the prying job for resumption');
      assert.equal(interruptedPry.job?.stopped, true, 'an interruption stops prying without discarding its cursor');
      assert.ok(interruptedPry.job?.elapsed >= interruptionAt.elapsed, 'interruption time does not erase pry progress');
      assert.equal(interruptedPry.inputLocked, false, 'an interrupted prying action does not lock movement');
      assert.equal(interruptedPry.interruption, undefined, 'a prying interruption does not retain a blocking prompt');
      assert.match(interruptedPry.notice, /You hear something outside/, 'the interrupt reason remains visible');
      const positionBeforeMovement = await lockedPage.evaluate(() => [
        ...globalThis.primaryActionTest.session.body.pos,
      ]);
      const releaseAfterInterruption = await holdAction(lockedPage, 'movement.right');
      try {
        await waitForSimulation(
          lockedPage,
          progressingSample,
          { start: await lockedPage.evaluate(() => globalThis.primaryActionTest.session.sim.time) },
          {
            seconds: 0.5,
            label: 'movement after a prying interruption',
            record: (line) => process.stderr.write(`${line}\n`),
            stop: releaseAfterInterruption,
          },
        );
      } finally {
        await releaseAfterInterruption();
      }
      const positionAfterMovement = await lockedPage.evaluate(() => [...globalThis.primaryActionTest.session.body.pos]);
      const [beforeX = Number.NaN, , beforeZ = Number.NaN] = positionBeforeMovement;
      const [afterX = Number.NaN, , afterZ = Number.NaN] = positionAfterMovement;
      assert.ok(
        Math.hypot(afterX - beforeX, afterZ - beforeZ) > 0,
        'movement remains available after an interrupted carried-tool pry',
      );
      process.stdout.write(`Locked-door input reproduction: ${JSON.stringify({ pryAction, interruptedPry })}\n`);
    } finally {
      await lockedPage.close();
      logPhase('locked-door-input-case', lockedDoorStart);
    }

    segmentStart = performance.now();
    const treatment = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.clearHand(r.dominant);
      r.clearHand(r.off);
      const rag = r.inventory.create('rag');
      r.setHand(r.dominant, rag);
      r.session.sim.body.impact(1, 'leftArm', { bleeding: 0 });
      r.session.sim.body.impact(3, 'rightArm', { bleeding: 0 });
      return {
        uid: rag.uid,
        defaultRegion: r.survival.selectedItemAction(rag)?.treatment?.region,
        wounds: r.survival
          .availableItemActions(rag)
          .flatMap(({ id, treatment: care }) => (care ? [{ id, region: care.region }] : [])),
      };
    });
    /** @param {string[]} ids */
    const ringEntriesShown = (ids) =>
      page.waitForFunction(
        (expected) =>
          JSON.stringify(
            [...document.querySelectorAll('#action-radial .radial-entry')].map((entry) =>
              entry instanceof HTMLElement ? entry.dataset.action : undefined,
            ),
          ) === JSON.stringify(expected),
        ids,
      );
    const releaseAtCentre = await holdDominantUse(page);
    await waitForActionRing(page);
    await ringEntriesShown(treatment.wounds.map(({ id }) => id));
    const labelsOverlap = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('#action-radial .radial-entry')].map((label) =>
        label.getBoundingClientRect(),
      );
      return boxes.some((box, index) =>
        boxes
          .slice(0, index)
          .some(
            (other) =>
              box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top,
          ),
      );
    });
    assert.equal(labelsOverlap, false, 'the rag ring label boxes do not overlap');
    await page.screenshot({ path: resolve(projectRoot, 'test-results/primary-action/rag-ring.png') });
    assert.equal(
      await page.locator('#action-radial .radial-centre-label').count(),
      0,
      'a shortcut-entered wound ring offers no return label when its centre cancels',
    );
    await releaseAtCentre();
    await waitForActionRing(page, false);
    assert.notEqual(
      await page.evaluate(() => globalThis.primaryActionTest.session.sim.actions.job?.jobType),
      'treatment',
      'the wound ring centre cancels without offering a sole Treat parent or treating',
    );
    // A wound other than the default proves the choice, not the default, picks what is treated.
    const chosenWound = treatment.wounds.find(({ region }) => region !== treatment.defaultRegion);
    assert(chosenWound, 'the treatment fixture offers a wound besides the default');
    await chooseHeldAction(page, chosenWound.id);
    const selected = chosenWound.region;
    await page.waitForFunction(
      (uid) => {
        const { sim } = globalThis.primaryActionTest.session;
        return sim.actions.job?.jobType === 'treatment' && sim.actions.job.itemUid === uid;
      },
      treatment.uid,
      { timeout: 10_000 },
    );
    const treatmentRegion = await page.evaluate(() => {
      const { job } = globalThis.primaryActionTest.session.sim.actions;
      if (job?.jobType !== 'treatment') {
        throw new Error('The chosen treatment is not running');
      }
      return job.region;
    });
    assert.equal(treatmentRegion, selected);
    /** @param {string} action */
    const command = (action) => dispatchPlayerCommand(page, action);
    endSegment('treatment-case');
    await command('debug.panel-toggle');
    await command('debug.input-replay-export');
    await page.waitForFunction(() => {
      const link = document.querySelector('#replay-download');
      return link instanceof HTMLElement && !link.hidden;
    });
    const replayText = await page.evaluate(() => {
      const link = document.querySelector('#replay-download');
      if (!(link instanceof HTMLAnchorElement && link.href.startsWith('blob:'))) {
        throw new Error('Replay export did not create a downloadable artifact');
      }
      return fetch(link.href).then((response) => response.text());
    });
    const replayArtifact = /** @type {ReplayArtifact} */ (JSON.parse(replayText));
    assert.equal(replayArtifact.magic, 'SKELLY_REPLAY');
    assert(replayArtifact.frames.length > 0, 'export includes captured player ticks');
    assert(replayArtifact.actions.some((action) => action.action === 'throw.stance.toggle'));
    assert(replayArtifact.actions.some((action) => action.action === 'item.drop'));
    assert.match(replayArtifact.endStateFingerprint, /^[0-9a-f]{64}$/);
    await timePhase('full-replay-import-accepted', async () => {
      const replayRestart = page.waitForEvent('load');
      await command('debug.input-replay-import');
      await page.locator('#input-replay-file').setInputFiles({
        name: 'input-replay.json',
        mimeType: 'application/json',
        buffer: Buffer.from(replayText),
      });
      await replayRestart;
      await page.waitForFunction(() => {
        const status = document.querySelector('#input-replay-status');
        return status instanceof HTMLElement && status.dataset.state === 'playing';
      });
      const replayError = await page.locator('#errors').textContent();
      assert(!replayError?.startsWith('Replay rejected:'), `replay import failed: ${replayError}`);
    });

    assert.deepEqual(pageErrors, []);
    await page.close();
    await timePhase('retained-cast-case', async () => {
      const { page: castPage, pageErrors: castErrors } = await newFlowPage();
      try {
        await castPage.goto(
          browserStageUrl(
            'primary-action',
            gameUrl(`http://127.0.0.1:${port}`, {
              startMod: 'skelly.deadvox.scenario.with-magic.missile-low',
              hash: { debug: true, radius: 32, post: false, sunshadow: false, torchshadow: false },
            }),
            renderOverride,
          ),
        );
        await castPage.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
        await castPage.locator('#dominant-hand').selectOption('left');
        await castPage.locator('#go').click();
        await castPage.waitForFunction(() => {
          const overlay = document.querySelector('#overlay');
          const worldLoading = document.querySelector('#world-loading');
          return (
            globalThis.primaryActionTest &&
            overlay instanceof HTMLElement &&
            overlay.hidden &&
            document.pointerLockElement &&
            worldLoading instanceof HTMLElement &&
            worldLoading.hidden
          );
        });
        const fixture = await castPage.evaluate(() => {
          const r = globalThis.primaryActionTest;
          const { character } = r.session;
          const hand = character.handedness;
          const focus = r.inventory.hands[hand];
          const abilityId = focus && r.inventory.registry.items.get(focus.type)?.casting?.ability;
          const ability = abilityId && r.inventory.registry.abilities.get(abilityId);
          if (!(focus && ability)) {
            throw new Error('The missile start did not wield its focus');
          }
          const amount = character.poolAmount(ability.cost.pool);
          if (amount === undefined) {
            throw new Error('The missile start has no pool for its ability');
          }
          r.startInputReplayRecording();
          // Both events land before the next simulation tick: a real press, but no preparation time.
          r.inputTarget.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
          const pressed = r.input.controls.dominantUseHeld;
          globalThis.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
          return {
            pressed,
            uid: focus.uid,
            hand,
            pool: ability.cost.pool,
            amount,
            preparation: ability.preparationSimSeconds,
            time: r.session.sim.time,
          };
        });
        assert.equal(fixture.pressed, true, 'the early release actually pressed the live input');
        await waitForSimulation(
          castPage,
          progressingSample,
          { start: fixture.time },
          {
            seconds: 1,
            label: 'early cast release reaches a player tick',
            record: (line) => process.stdout.write(`${line}\n`),
          },
        );
        assert.equal(
          await castPage.evaluate(() => {
            const recorder = globalThis.primaryActionTest.inputRecorder;
            if (!recorder) {
              throw new Error('The cast fixture is not recording input');
            }
            return recorder.copyInputs().actions.filter(({ action }) => action === 'cast.commit').length;
          }),
          0,
          'an early release records no cast commit',
        );
        const release = await mouseCharge(castPage);
        await waitForSimulation(
          castPage,
          () => {
            const { session } = globalThis.primaryActionTest;
            return {
              time: session.sim.time,
              paused: session.sim.paused,
              reached: session.castCharge.ready(session.sim.time),
            };
          },
          undefined,
          {
            seconds: fixture.preparation + 1,
            label: 'held focus reaches fixed cast preparation',
            record: (line) => process.stdout.write(`${line}\n`),
          },
        );
        await release();
        await waitForSimulation(
          castPage,
          ({ pool, amount }) => {
            const r = globalThis.primaryActionTest;
            if (!r.inputRecorder) {
              throw new Error('The cast fixture is not recording input');
            }
            const commits = r.inputRecorder
              .copyInputs()
              .actions.filter(({ action }) => action === 'cast.commit').length;
            const left = r.session.character.poolAmount(pool);
            return {
              time: r.session.sim.time,
              paused: r.session.sim.paused,
              reached: commits > 0 && left !== undefined && left < amount,
              commits,
            };
          },
          fixture,
          {
            seconds: 1,
            label: 'released cast commits and spends mana',
            record: (line) => process.stdout.write(`${line}\n`),
          },
        );
        const outcome = await castPage.evaluate(({ hand, pool }) => {
          const r = globalThis.primaryActionTest;
          if (!r.inputRecorder) {
            throw new Error('The cast fixture is not recording input');
          }
          return {
            uid: r.inventory.hands[hand]?.uid,
            amount: r.session.character.poolAmount(pool),
            commits: r.inputRecorder.copyInputs().actions.filter(({ action }) => action === 'cast.commit').length,
          };
        }, fixture);
        assert.equal(outcome.uid, fixture.uid, 'casting keeps the same focus in the captured hand');
        assert.equal(outcome.commits, 1, 'one release records exactly one cast commit');
        assert(outcome.amount !== undefined && outcome.amount < fixture.amount, 'the accepted cast spends mana');
        assert.deepEqual(castErrors, []);
      } finally {
        await castPage.close();
      }
    });
  } else if (group === 'replay-divergence') {
    const { page, pageErrors } = await newFlowPage();
    /** @param {string} action */
    const command = (action) => dispatchPlayerCommand(page, action);
    await page.goto(
      browserStageUrl(
        'primary-action',
        gameUrl(`http://127.0.0.1:${port}`, {
          startMod: houseNoonMod,
          hash: { debug: true, seed: 73, radius: 32, post: false, sunshadow: false, torchshadow: false },
        }),
        renderOverride,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#go').click();
    await waitForWorldLoaded(page);
    await page.waitForFunction(() => {
      const overlay = document.querySelector('#overlay');
      return (
        globalThis.primaryActionTest && overlay instanceof HTMLElement && overlay.hidden && document.pointerLockElement
      );
    });
    const shortReplay = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.startInputReplayRecording();
      const fixture = r.inventory.create('glowstick');
      r.setHand(r.dominant, fixture);
      return { uid: fixture.uid, start: r.session.sim.time };
    });
    await waitForSimulation(
      page,
      progressingSample,
      { start: shortReplay.start },
      {
        seconds: 0.35,
        label: 'fixture-write replay recording advances',
        record: (line) => process.stdout.write(`${line}\n`),
      },
    );
    await command('debug.panel-toggle');
    await command('debug.input-replay-export');
    await page.waitForFunction(() => {
      const link = document.querySelector('#replay-download');
      return link instanceof HTMLElement && !link.hidden;
    });
    const shortReplayText = await page.evaluate(() => {
      const link = document.querySelector('#replay-download');
      if (!(link instanceof HTMLAnchorElement && link.href.startsWith('blob:'))) {
        throw new Error('Fixture-write replay export did not create a downloadable artifact');
      }
      return fetch(link.href).then((response) => response.text());
    });
    const shortReplayArtifact = /** @type {ReplayArtifact} */ (JSON.parse(shortReplayText));
    assert.equal(shortReplayArtifact.magic, 'SKELLY_REPLAY');
    assert(shortReplayArtifact.frames.length > 0, 'fixture-write replay includes captured player ticks');
    assert.match(shortReplayArtifact.endStateFingerprint, /^[0-9a-f]{64}$/);
    assert.equal(
      await page.evaluate((uid) => Boolean(globalThis.primaryActionTest.inventory.itemByUid(uid)), shortReplay.uid),
      true,
      'fixture write changes the recorded end state',
    );
    await timePhase('fixture-write-replay-divergence', async () => {
      const shortReplayRestart = page.waitForEvent('load');
      await command('debug.input-replay-import');
      await page.locator('#input-replay-file').setInputFiles({
        name: 'fixture-write-replay.json',
        mimeType: 'application/json',
        buffer: Buffer.from(shortReplayText),
      });
      await shortReplayRestart;
      const replayCompletionTimeout = Math.ceil((shortReplayArtifact.frames.length / 60) * 2000 + 10_000);
      await page.waitForFunction(
        () => {
          const status = document.querySelector('#input-replay-status');
          const state = status instanceof HTMLElement ? status.dataset.state : undefined;
          const error = document.querySelector('#errors')?.textContent ?? '';
          return (
            state === 'verified' ||
            state === 'diverged' ||
            state === 'unavailable' ||
            error.startsWith('Replay rejected:')
          );
        },
        null,
        { timeout: replayCompletionTimeout },
      );
      const replayError = await page.locator('#errors').textContent();
      assert(!replayError?.startsWith('Replay rejected:'), `fixture-write replay import failed: ${replayError}`);
      assert.equal(await page.locator('#input-replay-status').getAttribute('data-state'), 'diverged');
    });

    assert.deepEqual(pageErrors, []);
    await page.close();
  } else if (group === 'replays-search-look') {
    await withTestHouse(stageBrowser, port, renderOverride, async (testHousePage) => {
      await timePhase('container-search-tab-case', () => verifyContainerSearchTab(testHousePage));
      await timePhase('vehicle-service-case', () => verifyVehicleService(testHousePage));
    });
    await timePhase('clean-look-replay-case', () => verifyCleanLookReplay(stageBrowser, port, renderOverride));
    await timePhase('stance-throw-replay-case', () => verifyStanceThrowReplay(stageBrowser, port, renderOverride));
  } else {
    await timePhase('ground-pickup-case', () => verifyGroundPickup(stageBrowser, port, renderOverride));
    await timePhase('forward-button-replay-case', () => verifyForwardButtonReplay(stageBrowser, port, renderOverride));
    await timePhase('ads-fire-replay-case', () => verifyAdsFireReplay(stageBrowser, port, renderOverride));
  }
  await timePhase('flow-browser-close', () => stageBrowser.close());
  browser = undefined;
  process.stdout.write(`Primary-action ${group} group passed.\n`);
} finally {
  const openBrowser = browser;
  if (openBrowser) {
    await timePhase('browser-final-close', () => openBrowser.close());
  }
  await timePhase('vite-close', () => vite.close());
}
