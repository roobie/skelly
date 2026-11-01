// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract starts Vite and Chrome
// biome-ignore-all lint/performance/noAwaitInLoops: browser input selection must settle before the next keypress
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract uses Node assertions
// biome-ignore-all lint/style/noProcessEnv: runner controls the executable and source checkout for A/B tests
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from './chromium.mjs';
import { holdAction, pressAction } from './input-actions.mjs';
import { dispatchMenuPointerClick, dispatchMenuPointerMove } from './menu-pointer.mjs';
import { cleanReplayRadiusM, logPhase, observationPlugin, timePhase } from './primary-action-observation.mjs';
import { waitForSimulation } from './simulation-wait.mjs';
import { browserStageMode, browserStageUrl } from './stage-mode.mjs';

// The flow group is the long live-page journey; the replays group is the independent replay and search contexts.
// They are separate CI steps so each keeps headroom under its own timeout.
const groups = ['flow', 'replays'];
const [, , group] = process.argv;
assert(groups.includes(group), `usage: primary-action.mjs <${groups.join('|')}>`);
const projectRoot = resolve(process.env.PRIMARY_ACTION_ROOT ?? fileURLToPath(new URL('../..', import.meta.url)));
const debugLoadoutModule = '/src/debug/debugLoadout.ts';
const firearmActionModule = '/src/core/firearmAction.ts';
const inputBindingsModule = '/src/game/inputBindings.ts';
const inputReplayModule = '/src/game/inputReplay.ts';
const firearmHandlingModule = '/src/game/firearmHandling.ts';
const reloadInputModule = '/src/game/reloadInput.ts';
const magazineModule = '/src/core/magazine.ts';
const heldPoseModule = '/src/core/heldPose.ts';
const optionsModule = '/src/core/options.ts';
const itemLookModule = '/src/render/itemLook.ts';
const pileLayoutModule = '/src/core/pileLayout.ts';
const vehicleProjectionModule = '/src/core/vehicleProjection.ts';
const progressingSample = ({ start }) => {
  const { session } = globalThis.primaryActionTest;
  return { time: session.sim.time, paused: session.sim.paused, reached: session.sim.time - start >= 0.35 };
};
const throwChargeSample = ({ start, seconds }) => {
  const { session } = globalThis.primaryActionTest;
  return { time: session.sim.time, paused: session.sim.paused, reached: session.sim.time - start >= seconds };
};
const aimThrowAtFreeLanding = async (page, fixture) => {
  // Different items have different dragged flights; a clear glowstick landing says nothing about a firearm's.
  const landing = await page.evaluate(({ uid, chargeSimSeconds }) => {
    const r = globalThis.primaryActionTest;
    const { yaw } = r.input;
    for (let turn = 0; turn < 32; turn += 1) {
      r.input.yaw = yaw + (turn * Math.PI * 2) / 32;
      const candidate = r.getItemThrowLanding(uid, chargeSimSeconds);
      if (candidate?.fits) {
        return candidate;
      }
    }
  }, fixture);
  assert(landing?.fits, 'the item’s full-charge flight has a landing with room');
  return landing;
};
const searchedContainerSample = ({ uid }) => {
  const { inventory, session } = globalThis.primaryActionTest;
  return {
    time: session.sim.time,
    paused: session.sim.paused,
    reached: inventory.entities.byUid(uid)?.searched === true,
  };
};
const mouseCharge = async (page) => {
  await page.mouse.down({ button: 'left' });
  // A mouse hold has no key for waitForSimulation to release in the page.
  return Object.assign(async () => page.mouse.up({ button: 'left' }), { keyUps: [] });
};
const verifyCleanLookReplay = async (browserInstance, port, renderOverride) => {
  const context = await browserInstance.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
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
        `http://127.0.0.1:${port}/?debug=1&seed=73&site=replay_fixture&radius=${cleanReplayRadiusM}&time=12:00&post=0&sunshadow=0&torchshadow=0`,
        renderOverride,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#go').click();
    await page.waitForFunction(
      () =>
        globalThis.primaryActionTest &&
        document.querySelector('#overlay')?.hidden &&
        document.pointerLockElement &&
        document.querySelector('#world-loading')?.dataset.state === 'ready' &&
        document.querySelector('#world-loading').hidden,
    );
    const start = await page.evaluate(() => {
      const { input, session } = globalThis.primaryActionTest;
      return {
        yaw: input.yaw,
        pitch: input.pitch,
        position: [...session.body.pos],
        frame: globalThis.primaryActionTest.frames,
      };
    });
    await page.evaluate(() => {
      globalThis.freeLookAltEdges = [];
      for (const type of ['keydown', 'keyup']) {
        globalThis.addEventListener(type, (event) => {
          if (event.code === 'AltLeft') {
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
      () => globalThis.primaryActionTest.input.freeLooking && globalThis.primaryActionTest.input.freeLook.yaw !== 0,
    );
    const headLook = await page.evaluate(() => {
      const { input, frames } = globalThis.primaryActionTest;
      return { bodyYaw: input.yaw, viewYaw: input.viewYaw, frames };
    });
    assert.equal(headLook.bodyYaw, start.yaw, 'free look leaves ballistic and movement yaw with the body');
    assert.notEqual(headLook.viewYaw, headLook.bodyYaw, 'free look turns the view');
    await page.waitForFunction((frame) => globalThis.primaryActionTest.frames >= frame + 3, headLook.frames);
    await page.keyboard.up('AltLeft');
    await page.keyboard.up('w');
    assert.equal(
      await page.evaluate(() => globalThis.primaryActionTest.input.intent().forward),
      0,
      'movement does not latch after W and Alt are released',
    );
    await page.waitForFunction(() => {
      const { input } = globalThis.primaryActionTest;
      return !input.freeLooking && input.viewYaw === input.yaw && input.viewPitch === input.pitch;
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
      return { yaw: input.yaw, pitch: input.pitch, position: [...session.body.pos] };
    });
    assert.notEqual(moved.yaw, start.yaw, 'the recording includes real mouse yaw');
    assert.notEqual(moved.pitch, start.pitch, 'the recording includes real mouse pitch');
    assert.notDeepEqual(moved.position, start.position, 'the recording includes player movement');
    const zombieNearStreamEdge = await page.evaluate(() => {
      const { session, streamer } = globalThis.primaryActionTest;
      return [...session.zombies.store.entries()].some(
        ([, zombie]) => !streamer.isReady(zombie.body.pos[0], zombie.body.pos[2]),
      );
    });
    assert(zombieNearStreamEdge, 'the clean recording includes a zombie in an unready stream-edge column');
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
    assert.equal(typeof craftRecipeId, 'string', 'the loaded content supplies a craft recipe');
    await page.evaluate(
      (recipeId) => globalThis.primaryActionTest.dispatchScreenCommand({ kind: 'craft.start', recipeId }),
      craftRecipeId,
    );
    await page.waitForFunction(
      (recipeId) =>
        globalThis.primaryActionTest.inputRecorder
          .copyInputs()
          .actions.some(({ payload }) => payload?.kind === 'craft.start' && payload.recipeId === recipeId),
      craftRecipeId,
    );
    await command('debug.panel-toggle');
    await command('debug.input-replay-export');
    await page.waitForFunction(() => document.querySelector('#replay-download')?.hidden === false);
    const replayText = await page.evaluate(() => {
      const link = document.querySelector('#replay-download');
      if (!link?.href.startsWith('blob:')) {
        throw new Error('Clean replay export did not create a downloadable artifact');
      }
      return fetch(link.href).then((response) => response.text());
    });
    const cleanArtifact = JSON.parse(replayText);
    assert(
      cleanArtifact.frames.some((frame) => frame[6] !== 0),
      'the recording includes independent head look',
    );
    assert(cleanArtifact.generatedColumns.length > 0, 'the clean recording captures its ready terrain');
    assert(
      cleanArtifact.actions.some(
        ({ action, payload }) =>
          action === 'inventory.assign' && payload?.itemUid === assignedUid && payload.slot === 1,
      ),
      'the clean recording includes the selected item’s UID-based quickbar assignment',
    );
    assert(
      cleanArtifact.actions.some(
        ({ action, payload }) => action === 'craft.start' && payload?.recipeId === craftRecipeId,
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
      () =>
        ['verified', 'diverged', 'unavailable'].includes(document.querySelector('#input-replay-status')?.dataset.state),
      undefined,
      { timeout: 20_000 },
    );
    const replayLook = await page.evaluate(() => {
      const { input } = globalThis.primaryActionTest;
      return { yaw: input.yaw, pitch: input.pitch };
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
        inventory: '/src/core/inventory.ts',
        character: '/src/core/character.ts',
        reach: '/src/core/reach.ts',
        readout: '/src/ui/craftReadout.ts',
        view: '/src/ui/crafting.ts',
        numbers: '/src/core/numberText.ts',
      },
    );
    assert(liquidRow.visible && liquidRow.picker, 'the crafting flow renders a liquid draw and its source picker');
    for (const value of [liquidRow.liquid, liquidRow.vessel, liquidRow.amount]) {
      assert(liquidRow.draw.includes(value), 'the liquid readout includes the kind, measured amount and vessel');
    }
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
};

/**
 * Boots one testHouse world under synthetic pointer lock and runs the cases that share it, so the stage
 * pays for one boot instead of one per case.
 */
const withTestHouse = async (browserInstance, port, renderOverride, run) => {
  const context = await browserInstance.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
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
        `http://127.0.0.1:${port}/?debug=1&seed=73&site=testHouse&radius=64&time=12:00&post=0&sunshadow=0&torchshadow=0`,
        renderOverride,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#go').click();
    await page.waitForFunction(
      () =>
        globalThis.primaryActionTest &&
        document.querySelector('#overlay')?.hidden &&
        document.pointerLockElement &&
        document.querySelector('#world-loading')?.dataset.state === 'ready' &&
        document.querySelector('#world-loading').hidden,
    );
    await run(page);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
};

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
      const [x, y, z] = r.feet().map(Math.floor);
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
        itemsVisible: items?.hidden === false,
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

const verifyForwardButtonReplay = async (browserInstance, port, renderOverride) => {
  const context = await browserInstance.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
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
        `http://127.0.0.1:${port}/?debug=1&seed=73&site=testHouse&radius=32&time=12:00&post=0&sunshadow=0&torchshadow=0`,
        renderOverride,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#dominant-hand').selectOption('left');
    await page.locator('#go').click();
    await page.waitForFunction(
      () =>
        globalThis.primaryActionTest &&
        document.querySelector('#overlay')?.hidden &&
        document.pointerLockElement &&
        document.querySelector('#world-loading')?.dataset.state === 'ready' &&
        document.querySelector('#world-loading').hidden,
    );
    const fixture = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.clearHand(r.dominant);
      r.clearHand(r.off);
      const light = r.inventory.create('glowstick');
      r.setHand(r.off, light);
      r.startInputReplayRecording();
      return { uid: light.uid, start: r.session.sim.time };
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
    await page.waitForFunction(() => document.querySelector('#replay-download')?.hidden === false);
    const replayText = await page.evaluate(() => {
      const link = document.querySelector('#replay-download');
      if (!link?.href.startsWith('blob:')) {
        throw new Error('Forward-button replay export did not create a downloadable artifact');
      }
      return fetch(link.href).then((response) => response.text());
    });
    const artifact = JSON.parse(replayText);
    assert.equal(artifact.actions.filter(({ action }) => action === 'hand.use-forward').length, 1);
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
      () =>
        ['verified', 'diverged', 'unavailable'].includes(document.querySelector('#input-replay-status')?.dataset.state),
      undefined,
      { timeout: 20_000 },
    );
    const replay = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      return {
        state: document.querySelector('#input-replay-status')?.dataset.state,
        lightOn: r.inventory.itemByUid(uid)?.on,
        endSnapshot: r.captureSnapshot(),
      };
    }, fixture.uid);
    assert.equal(replay.lightOn, true, 'replaying the recorded forward-button press lights the off-hand light');
    assert.equal(replay.state, 'verified', 'the replay reproduces the recorded end state');
    assert.deepEqual(replay.endSnapshot, liveEndSnapshot);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
};

const verifyStanceThrowReplay = async (browserInstance, port, renderOverride) => {
  const context = await browserInstance.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
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
        `http://127.0.0.1:${port}/?debug=1&seed=73&site=testHouse&radius=32&time=12:00&post=0&sunshadow=0&torchshadow=0`,
        renderOverride,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#dominant-hand').selectOption('left');
    await page.locator('#go').click();
    await page.waitForFunction(
      () =>
        globalThis.primaryActionTest &&
        document.querySelector('#overlay')?.hidden &&
        document.pointerLockElement &&
        document.querySelector('#world-loading')?.dataset.state === 'ready' &&
        document.querySelector('#world-loading').hidden,
    );
    const fixture = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.clearHand(r.dominant);
      r.clearHand(r.off);
      const mainItem = r.inventory.create('glowstick');
      const offItem = r.inventory.create('glowstick');
      r.setHand(r.dominant, mainItem);
      r.setHand(r.off, offItem);
      const minimumHoldSimSeconds = r.inventory.registry.senses.get('player').light.throwMinimumHoldSimSeconds;
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
      const hasFreeWornPocket = () =>
        Object.values(r.inventory.worn).some((owner) =>
          owner?.pockets?.some((_, pocket) => r.inventory.plan(offItem, { kind: 'pocket', owner, pocket }).ok),
        );
      if (!offItem) {
        throw new Error('The replay fixture off-hand item is missing');
      }
      const freeSlot = ['waist', 'back', 'torso'].find((slot) => !r.inventory.worn[slot]);
      if (!hasFreeWornPocket() && freeSlot) {
        const type = { waist: 'fanny_pack', back: 'hiking_backpack', torso: 'utility_vest' }[freeSlot];
        r.inventory.add(r.inventory.create(type), { kind: 'worn' });
      }
      if (!hasFreeWornPocket()) {
        throw new Error('Could not provide a worn pocket for the replay fixture');
      }
    }, fixture.offUid);
    await page.waitForFunction(() => {
      const hands = globalThis.primaryActionTest.view.held.animator.presentation.heldByHand;
      return hands.has('left') && hands.has('right');
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
      return (
        offLocation?.kind === 'pile' &&
        r.inventory.locate(r.inventory.itemByUid(ids.mainUid))?.kind === 'pile' &&
        r.quickbarTapCommitObservation &&
        r.quickbarTapTickObservation &&
        r.inputRecorder.copyInputs().actions.some((action) => action.action === 'item.throw') &&
        r.inputRecorder.copyInputs().actions.some((action) => action.action === 'quickbar.tap.1') &&
        r.inputRecorder.copyInputs().actions.some((action) => action.action === 'item.drop')
      );
    }, fixture);
    const liveThrowOutcome = await page.evaluate((ids) => {
      const r = globalThis.primaryActionTest;
      const off = r.inventory.itemByUid(ids.offUid);
      const main = r.inventory.itemByUid(ids.mainUid);
      const offLocation = off && r.inventory.locate(off);
      const mainLocation = main && r.inventory.locate(main);
      return {
        offLocation: offLocation?.kind === 'pile' ? offLocation.pos : offLocation?.kind,
        mainLocation: mainLocation?.kind === 'pile' ? mainLocation.pos : mainLocation?.kind,
        bodyPosition: [...r.session.body.pos],
        look: [r.input.yaw, r.input.pitch],
        quickbarTapCommit: r.quickbarTapCommitObservation,
        quickbarTapTick: r.quickbarTapTickObservation,
      };
    }, fixture);
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
    await page.waitForFunction(() => document.querySelector('#replay-download')?.hidden === false);
    const replayText = await page.evaluate(() => {
      const link = document.querySelector('#replay-download');
      if (!link?.href.startsWith('blob:')) {
        throw new Error('Throw replay export did not create a downloadable artifact');
      }
      return fetch(link.href).then((response) => response.text());
    });
    const artifact = JSON.parse(replayText);
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
    assert.equal(artifact.actions[quickbarActionIndex].tick, artifact.actions[throwActionIndex].tick);
    assert.equal(artifact.actions[dropActionIndex].tick, artifact.actions[throwActionIndex].tick);
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
      () =>
        ['verified', 'diverged', 'unavailable'].includes(document.querySelector('#input-replay-status')?.dataset.state),
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
          offLocation: offLocation?.kind === 'pile' ? offLocation.pos : offLocation?.kind,
          mainLocation: mainLocation?.kind === 'pile' ? mainLocation.pos : mainLocation?.kind,
          bodyPosition: [...r.session.body.pos],
          look: [r.input.yaw, r.input.pitch],
        },
      };
    }, fixture);
    let endSnapshotDifference = '';
    try {
      assert.deepEqual(replayEndSnapshot, liveEndSnapshot);
    } catch (error) {
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

const verifyAdsFireReplay = async (browserInstance, port, renderOverride) => {
  const context = await browserInstance.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
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
        `http://127.0.0.1:${port}/?debug=1&seed=73&site=testHouse&radius=32&time=12:00&post=0&sunshadow=0&torchshadow=0`,
        renderOverride,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#dominant-hand').selectOption('left');
    await page.locator('#go').click();
    await page.waitForFunction(
      () =>
        globalThis.primaryActionTest &&
        document.querySelector('#overlay')?.hidden &&
        document.pointerLockElement &&
        document.querySelector('#world-loading')?.dataset.state === 'ready' &&
        document.querySelector('#world-loading').hidden,
    );
    const firearm = await page.evaluate(
      async ({ firearmModule, magazineModuleUrl, optionsModuleUrl }) => {
        const { firearmHandlingFor, spentCaseItemId } = await import(firearmModule);
        const { magazineSpec, magazineWellCalibre } = await import(magazineModuleUrl);
        const { stowTarget } = await import(optionsModuleUrl);
        const r = globalThis.primaryActionTest;
        const { registry } = r.inventory;
        const { firearms, magazines, queue, sim } = r.session;
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
        const magazine = r.inventory.create(ids.find((id) => magazineSpec(registry, id)?.calibre === calibre));
        r.placePocketed(r.inventory.create(ids.find((id) => registry.items.get(id).ammo?.calibre === calibre)));
        r.clearHand('right');
        r.setHand('left', magazine);
        must(magazines.loadNext(magazine.uid, sim.time));
        settle();
        const pocket = stowTarget(r.inventory, magazine, r.feet());
        if (pocket?.kind !== 'pocket' || !r.inventory.move(magazine, pocket).ok) {
          throw new Error('Could not pocket the loaded replay magazine');
        }
        const gun = r.inventory.create(gunType);
        for (const [slot, child] of Object.entries(gun.slots ?? {})) {
          const model = child && registry.models.get(registry.items.get(child.type).model);
          if (model?.gun?.attachment?.sight?.kind === 'optic') {
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
      return r.inventory.itemByUid(uid).firearm.readying.duration;
    }, firearm.uid);
    await page.evaluate((duration) => globalThis.primaryActionTest.session.frame(duration), raiseDuration);
    await page.waitForFunction((uid) => globalThis.primaryActionTest.session.firearms.isReady(uid), firearm.uid);
    await page.mouse.click(640, 450, { button: 'middle' });
    await page.waitForFunction(() => globalThis.primaryActionTest.input.aimingDownSights);
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
        const item = r.inventory.itemByUid(uid);
        const model = r.inventory.registry.models.get(r.inventory.registry.items.get(item.type).model);
        const { sight } = model.gun;
        const held = r.view.playerMeshes.group.getObjectByName('held-item-left');
        const V = r.engine.camera.position.constructor;
        const ocular = modelToView(
          model,
          sight.eye.map((value, axis) => value - model.grip.at[axis]),
        );
        const worldOcular = held.localToWorld(new V(...ocular));
        const direction = new V(...modelToView(model, sight.direction)).transformDirection(held.matrixWorld);
        const cameraDelta = r.engine.camera.position.clone().sub(worldOcular);
        const figure = r.inventory.registry.figures.get('player');
        const bodyModel = r.inventory.registry.models.get(figure.body.model);
        const eyeAnchors = figure.body.eyes.map((name) => bodyModel.anchors[name]);
        const anatomicalEye = new V(...eyeAnchors[0])
          .add(new V(...eyeAnchors[1]))
          .multiplyScalar(0.5)
          .sub(new V(...bodyModel.anchors[figure.body.head.pivot]));
        r.view.playerMeshes.group.getObjectByName('figure-head').localToWorld(anatomicalEye);
        const butt = held.localToWorld(
          new V(
            ...modelToView(
              model,
              model.hands.butt.map((value, axis) => value - model.grip.at[axis]),
            ),
          ),
        );
        const shoulder = new V();
        r.view.playerMeshes.shoulderPosition('left', shoulder);
        return {
          kind: sight.kind,
          lineError: cameraDelta.clone().cross(direction).length(),
          eyeDistance: -cameraDelta.dot(direction),
          eyeRange: sight.eyeDistanceRangeMetres,
          cameraOffset: r.engine.camera.position.distanceTo(anatomicalEye),
          cameraLimit: model.hands.ads?.cameraOffsetLimitMetres ?? figure.aimPose.ads.cameraOffsetLimitMetres,
          shoulderLimit: model.hands.ads?.stockShoulderLimitMetres ?? figure.aimPose.ads.stockShoulderLimitMetres,
          shoulderError: butt.distanceTo(shoulder),
          roll: r.engine.camera.rotation.z,
        };
      },
      { uid: firearm.uid, moduleUrl: heldPoseModule },
    );
    assert.equal(irons.kind, 'iron');
    assert(irons.lineError < 1e-6, `unobstructed ADS camera lies on the physical sight line: ${irons.lineError} m`);
    assert(
      irons.eyeDistance >= irons.eyeRange[0] - 1e-6 && irons.eyeDistance <= irons.eyeRange[1] + 1e-6,
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
      return count === cases + 1 && r.inputRecorder.copyInputs().frames.length > 0;
    }, firearm);
    await page.keyboard.up('KeyQ');
    await page.mouse.click(640, 450, { button: 'middle' });
    await page.waitForFunction(() =>
      globalThis.primaryActionTest.inputRecorder.copyInputs().actions.some(({ action }) => action === 'aim.ads-toggle'),
    );
    assert.equal(await page.evaluate(() => globalThis.primaryActionTest.input.aimingDownSights), false);
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
        const result = {
          snapshot: r.captureSnapshot(),
          startState: r.inputRecorder.copyInputs().startState,
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
    await page.waitForFunction(() => document.querySelector('#replay-download')?.hidden === false);
    const replayText = await page.evaluate(() => {
      const link = document.querySelector('#replay-download');
      if (!link?.href.startsWith('blob:')) {
        throw new Error('ADS replay export did not create a downloadable artifact');
      }
      return fetch(link.href).then((response) => response.text());
    });
    const artifact = JSON.parse(replayText);
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
      return (
        r.input.rightMouseHeld &&
        r.input.aimingDownSights &&
        document.querySelector('#input-replay-status')?.dataset.state === 'playing'
      );
    });
    // Keep these reads in one evaluation so replay playback cannot advance between them.
    const { viewerMouseInput, viewerBlurInput } = await page.evaluate(() => {
      const { input, inputTarget } = globalThis.primaryActionTest;
      const read = () => ({
        rightMousePressed: input.rightMousePressed,
        rightMouseSuppressed: input.rightMouseSuppressed,
        rightMouseHeld: input.rightMouseHeld,
        aimingDownSights: input.aimingDownSights,
        dominantUseDown: input.dominantUseDown,
      });
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
        readyHeld: input.rightMouseHeld,
        aimingDownSights: input.aimingDownSights,
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
      () =>
        ['verified', 'diverged', 'unavailable'].includes(document.querySelector('#input-replay-status')?.dataset.state),
      undefined,
      { timeout: 20_000 },
    );
    const replay = await page.evaluate((fixture) => {
      const r = globalThis.primaryActionTest;
      const count = [...r.inventory.piles.values()]
        .flatMap((pile) => pile.items)
        .filter(({ item }) => item.type === fixture.caseType)
        .reduce((sum, { item }) => sum + item.count, 0);
      return {
        state: document.querySelector('#input-replay-status')?.dataset.state,
        snapshot: r.captureSnapshot(),
        aimingDownSights: r.input.aimingDownSights,
        readyHeld: r.input.rightMouseHeld,
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

const verifyGroundPickup = async (browserInstance, port, renderOverride) => {
  const context = await browserInstance.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
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
        `http://127.0.0.1:${port}/?debug=1&seed=73&site=testHouse&radius=64&time=12:00&post=0&sunshadow=0&torchshadow=0`,
        renderOverride,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#dominant-hand').selectOption('left');
    await page.locator('#go').click();
    await page.waitForFunction(
      () =>
        globalThis.primaryActionTest &&
        document.querySelector('#overlay')?.hidden &&
        document.pointerLockElement &&
        document.querySelector('#world-loading')?.dataset.state === 'ready' &&
        document.querySelector('#world-loading').hidden,
    );
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
            return container?.container?.pockets?.some(({ grid }) => grid[0] >= 1 && grid[1] >= 1);
          }),
      );
      const pocketOwner = wornContainers.find(({ item }) => {
        const container = r.inventory.registry.items.get(item.type);
        return container?.container?.pockets?.some(({ grid }) => grid[0] >= 1 && grid[1] >= 1);
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
          hasModel: (id) => r.view.models.has(id),
        }).map((metres) => metres / r.scale.blockSize);
        const feetDx = target[0] - r.session.body.pos[0];
        const feetDz = target[2] - r.session.body.pos[2];
        r.input.yaw = Math.atan2(-feetDx, -feetDz);
        // Pitch changes the eye position too, so solve the aim against the posed eye.
        let low = -LOOK_PITCH_LIMIT;
        let high = 0;
        for (let step = 0; step < 32; step += 1) {
          const pitch = (low + high) / 2;
          const posedEye = playerEyePosition({
            feet: r.session.body.pos,
            blockSize: r.scale.blockSize,
            yaw: r.input.yaw,
            pitch,
            stance: r.session.stance,
            figure: r.inventory.registry.figures.get('player'),
            models: r.inventory.registry.models,
          });
          const dx = target[0] - posedEye[0];
          const dy = target[1] - posedEye[1];
          const dz = target[2] - posedEye[2];
          const forward = -dx * Math.sin(r.input.yaw) - dz * Math.cos(r.input.yaw);
          if (pitch < Math.atan2(dy, forward)) {
            low = pitch;
          } else {
            high = pitch;
          }
        }
        r.input.pitch = (low + high) / 2;
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
        playerLookPoseModuleUrl: '/src/core/playerLookPose.ts',
        inputModuleUrl: '/src/game/input.ts',
        ground: placed,
      },
    );
    await pressAction(page, 'world.interact');
    await page.waitForFunction(
      (uid) =>
        globalThis.primaryActionTest.inventory.locate(globalThis.primaryActionTest.inventory.itemByUid(uid))?.kind ===
        'pocket',
      fixture.itemUid,
    );
    const pocketed = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(uid);
      const location = item && r.inventory.locate(item);
      return {
        location,
        animation: r.grabProgress.some((progress) => progress > 0 && progress < 1),
        action: r.inputRecorder.copyInputs().actions.find(({ payload }) => payload?.kind === 'item.pickup')?.payload,
      };
    }, fixture.itemUid);
    assert.equal(pocketed.location.owner.uid, fixture.ownerUid, 'tap F pockets the targeted item through handling');
    assert.equal(pocketed.animation, true, 'handling drives a visible reach-and-return pose');
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
    await page.waitForFunction(
      (uid) =>
        globalThis.primaryActionTest.inventory.locate(globalThis.primaryActionTest.inventory.itemByUid(uid))?.kind ===
        'hand',
      wieldUid,
    );
    await release();
    const wielded = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(uid);
      return {
        location: item && r.inventory.locate(item),
        action: r.inputRecorder
          .copyInputs()
          .actions.find(({ payload }) => payload?.kind === 'item.pickup' && payload.mode === 'wield')?.payload,
      };
    }, wieldUid);
    assert.equal(wielded.location.kind, 'hand', 'holding F wields the targeted item');
    assert.equal(wielded.action.itemUid, wieldUid, 'the replay records the resolved hold gesture');

    const aimFurnitureFixture = async (fixtureKind) => {
      const fixtureUid = await page.evaluate((kind) => {
        const r = globalThis.primaryActionTest;
        const doorDef = [...r.inventory.registry.furniture.values()].find((def) =>
          kind === 'door'
            ? def.door
            : def.container &&
              !def.mount &&
              !def.door &&
              !def.climbable &&
              !def.vehicle &&
              !def.scenarioGoal &&
              !def.cover &&
              def.size.some(
                (cells) =>
                  cells * r.scale.blockSize > r.inventory.registry.inventory.get('player').furnitureMove.maxSizeMetres,
              ),
        );
        if (!doorDef) {
          throw new Error('Door fixture is missing');
        }
        const floor = r.feet();
        let door;
        for (const [dx, dz] of [
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
          [3, 0],
          [-3, 0],
        ]) {
          door = r.inventory.furnish({
            type: doorDef.id,
            fixed: kind === 'fixed',
            pos: [floor[0] + dx, floor[1], floor[2] + dz],
            size: doorDef.size,
            facing: 'n',
          });
          if (door) {
            break;
          }
        }
        if (!door) {
          throw new Error('Could not place a door for the F tap regression');
        }
        return door.uid;
      }, fixtureKind);
      await page.waitForFunction(() => !globalThis.primaryActionTest.queue.busy);
      await page.evaluate((uid) => {
        const r = globalThis.primaryActionTest;
        const door = r.inventory.entities.byUid(uid);
        const target = [door.pos[0] + door.size[0] / 2, door.pos[1] + door.size[1] / 2, door.pos[2] + door.size[2] / 2];
        const eye = [
          r.session.body.pos[0],
          r.session.body.pos[1] + r.session.playerEyeHeightMetres / r.scale.blockSize,
          r.session.body.pos[2],
        ];
        const dx = target[0] - eye[0];
        const dy = target[1] - eye[1];
        const dz = target[2] - eye[2];
        r.input.yaw = Math.atan2(-dx, -dz);
        r.input.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      }, fixtureUid);
      return fixtureUid;
    };
    const doorUid = await aimFurnitureFixture('door');
    await pressAction(page, 'world.interact');
    await page.waitForFunction(
      (uid) => globalThis.primaryActionTest.inventory.entities.byUid(uid)?.open === true,
      doorUid,
    );
    assert.equal(
      await page.locator('#item-action-list').isVisible(),
      false,
      'a door opens directly without movement choices',
    );
    const fixedUid = await aimFurnitureFixture('fixed');
    const openAlternatives = async () => {
      const releaseHold = await holdAction(page, 'world.interact');
      await page.waitForFunction(() => !document.querySelector('#furniture-radial').hidden);
      return releaseHold;
    };
    for (const way of ['push', 'drag']) {
      const releaseHold = await openAlternatives();
      if (way === 'push') {
        const lookBefore = await page.evaluate(() => {
          const { yaw, pitch } = globalThis.primaryActionTest.input;
          return { yaw, pitch };
        });
        await page.evaluate(() => {
          document.dispatchEvent(new MouseEvent('mousemove', { movementX: 0, movementY: -200, bubbles: true }));
        });
        assert.deepEqual(
          await page.evaluate(() => {
            const { yaw, pitch } = globalThis.primaryActionTest.input;
            return { yaw, pitch };
          }),
          lookBefore,
          'radial mouse selection holds the camera look',
        );
      } else {
        await page.mouse.wheel(0, 100);
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowRight');
      }
      await releaseHold();
      await page.waitForFunction(
        ({ uid, way: expectedWay }) =>
          globalThis.primaryActionTest.inputRecorder
            .copyInputs()
            .actions.some(
              ({ payload }) =>
                payload?.entityUid === uid &&
                (expectedWay === 'push'
                  ? payload.kind === 'furniture.slide' && payload.way === 'push'
                  : payload.kind === 'furniture.lift' && payload.floorLocked === true),
            ),
        { uid: fixedUid, way },
      );
      assert.equal(
        await page.evaluate(() => globalThis.primaryActionTest.queue.busy),
        false,
        'a fastened piece refuses movement rather than queuing a step',
      );
    }
    await pressAction(page, 'world.interact');
    // The queued search proves the tap resolved to Search; waiting for it to finish adds only its game time.
    await page.waitForFunction(
      (uid) =>
        globalThis.primaryActionTest.queue.jobs.some(
          (job) => job.jobType === 'furniture.search' && job.params.entityUid === uid,
        ),
      fixedUid,
    );
    assert.equal(
      await page.evaluate(() =>
        globalThis.primaryActionTest.inputRecorder
          .copyInputs()
          .actions.some(({ payload }) => payload?.kind === 'furniture.interact' && payload.alternatives !== true),
      ),
      true,
      'a tap on movable furniture records a plain interaction that searches it',
    );
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
};

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

/** Opens the testHouse hatchback with F, then removes and refits one wheel through its inspection surface. */
const verifyVehicleService = async (page) => {
  // The fixture stands the player beside a serviceable part nothing rests on and hands them its tool.
  const fixture = await page.evaluate(async (moduleUrl) => {
    const r = globalThis.primaryActionTest;
    const { projectVehicleParts } = await import(moduleUrl);
    const s = r.scale.blockSize;
    const [vehicleId, vehicle] = [...r.session.vehicles.records][0];
    const site = vehicle.sites.find(
      (candidate) => candidate.service && !vehicle.sites.some((other) => other.supportedBy.includes(candidate.id)),
    );
    const parts = projectVehicleParts(r.inventory.registry, vehicleId, vehicle, s);
    const part = parts.find(({ fittingId }) => fittingId === site.id);
    const { min, max } = part.boxes[0];
    const centre = [0, 1, 2].map((axis) => (min[axis] + max[axis]) / 2);
    // Out from the car's side by the part's half width plus a body's clearance.
    const side = [Math.sin(part.transform.yaw), Math.cos(part.transform.yaw)];
    const outward = Math.sign(
      (centre[0] - vehicle.origin[0] * s) * side[0] + (centre[2] - vehicle.origin[2] * s) * side[1],
    );
    const reachOut = Math.abs((max[0] - min[0]) * side[0] + (max[2] - min[2]) * side[1]) / 2 + 0.4;
    r.session.body.pos = [
      (centre[0] + outward * side[0] * reachOut) / s,
      vehicle.origin[1],
      (centre[2] + outward * side[1] * reachOut) / s,
    ];
    r.session.body.vel = [0, 0, 0];
    if (!r.inventory.canReachVehicle(vehicleId)) {
      throw new Error('The vehicle service fixture stands out of the vehicle’s reach');
    }
    const [tool] = Object.keys(site.service.qualities);
    const toolDef = [...r.inventory.registry.items.values()].find(
      (def) => (def.tool?.qualities[tool] ?? 0) >= site.service.qualities[tool] && !def.twoHanded,
    );
    r.setHand(r.dominant, r.inventory.create(toolDef.id));
    const aim = (target) => {
      const eye = [
        r.session.body.pos[0],
        r.session.body.pos[1] + r.session.playerEyeHeightMetres / s,
        r.session.body.pos[2],
      ];
      const [dx, dy, dz] = [0, 1, 2].map((axis) => target[axis] / s - eye[axis]);
      r.input.yaw = Math.atan2(-dx, -dz);
      r.input.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    };
    aim(centre);
    const fitted = vehicle.fittings.find(({ id }) => id === site.id).item;
    // With the part off, aiming at the part it rests on reopens the car.
    const supportBox = parts.find(({ fittingId }) => fittingId === site.supportedBy[0])?.boxes[0] ?? part.boxes[0];
    r.aimAtSupport = () => aim([0, 1, 2].map((axis) => (supportBox.min[axis] + supportBox.max[axis]) / 2));
    return { vehicleId, siteId: site.id, uid: fitted.uid, condition: fitted.condition };
  }, vehicleProjectionModule);

  // Under pointer lock the player clicks with the drawn menu cursor, which the game moves and presses for them.
  const clickThroughMenuCursor = async (selector) => {
    const target = page.locator(selector);
    await target.waitFor({ state: 'visible', timeout: 5000 });
    await target.scrollIntoViewIfNeeded();
    const bounds = await target.boundingBox();
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
    const saved = JSON.parse(
      JSON.stringify(r.session.snapshot({ worldId: 'vehicle-world', characterId: 'vehicle-actor' })),
    );
    const countCopies = (value) => {
      if (value === null || typeof value !== 'object') {
        return 0;
      }
      const own = value.uid === uid && value.type === item.type ? 1 : 0;
      return own + Object.values(value).reduce((sum, child) => sum + countCopies(child), 0);
    };
    return {
      location: r.inventory.locate(item),
      condition: item.condition,
      savedCopies: countCopies(saved),
    };
  }, fixture);
  assert.equal(witness.location.kind, 'vehicle', 'the part is refitted to the car');
  assert.equal(witness.location.vehicleId, fixture.vehicleId);
  assert.equal(witness.location.fittingId, fixture.siteId, 'the part returns to the selected site');
  assert.equal(witness.condition, fixture.condition, 'service keeps the part’s condition');
  assert.equal(witness.savedCopies, 1, 'the part has exactly one saved owner');
};

const vite = await createServer({
  configFile: resolve(projectRoot, 'vite.config.ts'),
  root: projectRoot,
  logLevel: 'error',
  plugins: [observationPlugin],
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await timePhase('vite-listen', () => vite.listen());
  const address = vite.httpServer.address();
  assert(address && typeof address !== 'string');
  const renderOverride = process.env.DEADVOX_TEST_RENDER_MODE;
  const renderMode = browserStageMode('primary-action', renderOverride);
  browser = await timePhase('browser-launch', () =>
    launchChromium('primary-action', {
      headless: true,
      args: renderMode === 'pixel' ? ['--enable-webgl'] : [],
      renderMode: renderOverride,
    }),
  );
  if (group === 'flow') {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
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
          if (event.target?.closest('#go')) {
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
        HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
          if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') {
            globalThis.renderFreeWitness.webglRequests.push(kind);
            throw new Error(`render-free stage requested ${kind}`);
          }
          return getContext.call(this, kind, ...args);
        };
      });
    }
    await timePhase('initial-testHouse-boot', async () => {
      await page.goto(
        browserStageUrl(
          'primary-action',
          `http://127.0.0.1:${address.port}/?debug=1&seed=73&site=testHouse&radius=64&time=12:00&post=0&sunshadow=0&torchshadow=0`,
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
      await page.waitForFunction(
        () =>
          globalThis.primaryActionTest &&
          document.querySelector('#overlay')?.hidden &&
          document.pointerLockElement &&
          document.querySelector('#world-loading')?.dataset.state === 'ready' &&
          document.querySelector('#world-loading').hidden,
      );
    });
    const identity = await page.evaluate(() => {
      const { inventory, session } = globalThis.primaryActionTest;
      return {
        handedness: inventory.character.handedness,
        saved: session.snapshot({ worldId: 'primary-world', characterId: 'primary-actor' }).character.progression
          .handedness,
        gestures: globalThis.acceptedCreation,
        creationHidden: document.querySelector('#new-character-options').hidden,
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
      return { uid: can.uid, opened: r.inventory.registry.items.get(can.type).unpack.item };
    });
    await page.waitForFunction(() => !document.querySelector('#item-action-list').hidden);
    const actionListBounds = await page.locator('#item-action-list').boundingBox();
    assert(actionListBounds.x < 640 && actionListBounds.y > 360, 'action choices stay in the lower left');
    await page.mouse.wheel(0, 100);
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      return r.survival.selectedItemAction(r.inventory.hands[r.dominant])?.opening === true;
    });
    await page.mouse.click(640, 450);
    await page.waitForFunction(() => globalThis.primaryActionTest.queue.busy);
    const openedInHand = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      const failures = r.queue.tick(r.queue.remaining).failed;
      const can = r.inventory.itemByUid(uid);
      return { failures, type: can.type, held: r.inventory.hands[r.off] === can };
    }, canOpening.uid);
    assert.deepEqual(
      openedInHand,
      { failures: [], type: canOpening.opened, held: true },
      'the wheel-selected click opens rather than swings',
    );
    await page.waitForFunction(() => document.querySelector('#item-action-list').hidden);
    const honing = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.clearHand(r.dominant);
      r.clearHand(r.off);
      const blade = r.inventory.create('kitchen_knife', 1, 0.2);
      r.setHand(r.dominant, blade);
      r.setHand(r.off, r.inventory.create('whetstone'));
      return { uid: blade.uid, condition: blade.condition };
    });
    await page.mouse.wheel(0, 100);
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      return r.survival.selectedItemAction(r.inventory.hands[r.dominant])?.sharpening === true;
    });
    for (const trigger of ['click', 'offhand']) {
      if (trigger === 'click') {
        await page.mouse.click(640, 450);
      } else {
        await pressAction(page, 'hand.use-off');
      }
      await page.waitForFunction(() => globalThis.primaryActionTest.queue.busy);
      const honed = await page.evaluate((uid) => {
        const r = globalThis.primaryActionTest;
        const failures = r.queue.tick(r.queue.remaining).failed;
        return { failures, condition: r.inventory.itemByUid(uid).condition };
      }, honing.uid);
      assert.deepEqual(honed.failures, [], `${trigger} completes held honing`);
      assert(honed.condition > honing.condition, `${trigger} restores the held blade`);
      honing.condition = honed.condition;
    }
    const wheelGrinding = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.clearHand(r.off);
      const def = r.inventory.registry.furniture.get('grinding_wheel');
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
      const eye = [
        r.session.body.pos[0],
        r.session.body.pos[1] + r.session.playerEyeHeightMetres / r.scale.blockSize,
        r.session.body.pos[2],
      ];
      const target = [wheel.pos[0] + 1, wheel.pos[1] + 1.6, wheel.pos[2] + 1];
      const [dx, dy, dz] = target.map((value, axis) => value - eye[axis]);
      const look = { yaw: r.input.yaw, pitch: r.input.pitch };
      r.input.yaw = Math.atan2(-dx, -dz);
      r.input.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const aimed = r.interactionTargetAt();
      if (aimed?.kind !== 'furniture' || aimed.entity !== wheel) {
        throw new Error('The sharpening wheel is not aimed at');
      }
      const blade = r.inventory.hands[r.dominant];
      return { uid: blade.uid, condition: blade.condition, wheelUid: wheel.uid, look };
    });
    await page.mouse.click(640, 450);
    await page.waitForFunction(() => globalThis.primaryActionTest.queue.busy);
    const groundAtWheel = await page.evaluate(({ uid, wheelUid, look }) => {
      const r = globalThis.primaryActionTest;
      const failures = r.queue.tick(r.queue.remaining).failed;
      const { condition } = r.inventory.itemByUid(uid);
      r.inventory.entities.remove(r.inventory.entities.byUid(wheelUid));
      r.input.yaw = look.yaw;
      r.input.pitch = look.pitch;
      return { failures, condition };
    }, wheelGrinding);
    assert.deepEqual(groundAtWheel.failures, [], 'aimed-wheel activation completes');
    assert(groundAtWheel.condition > wheelGrinding.condition, 'aimed-wheel activation restores the held blade');
    const heldLighter = async (side, trigger) => {
      const before = await page.evaluate((hand) => {
        const r = globalThis.primaryActionTest;
        r.clearHand(r.dominant);
        r.clearHand(r.off);
        const lighter = r.inventory.create('lighter');
        r.setHand(hand, lighter);
        r.clearNotice();
        return {
          uid: lighter.uid,
          charges: lighter.charges,
          perIgnition: r.inventory.registry.items.get(lighter.type).igniter.perIgnition,
        };
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
      return {
        matchesUid: matches.uid,
        candleUid: candle.uid,
        charges: matches.charges,
        perIgnition: r.inventory.registry.items.get(matches.type).igniter.perIgnition,
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
    assert.ok(lit.litAtGameTimestamp > 0, 'the candle records its ignition time');
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
      if (!definition) {
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
      return !document.querySelector('#overlay')?.hidden && r.session.sim.paused;
    });
    const pausedKnockout = await page.evaluate(() => {
      const overlay = document.querySelector('#overlay');
      const cursorRoot = document.querySelector('#game-cursor-root');
      const cursor = document.querySelector('#game-cursor');
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
      return document.querySelector('#overlay')?.hidden && !r.session.sim.paused;
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
      await page.waitForFunction(() => globalThis.primaryActionTest.input.rightMouseActionHeld);
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
    const attemptDuringHandling = async (actionSide, reservedHand, useMouse5 = false, tryThrow = false) => {
      await page.waitForFunction(() => {
        const combat = globalThis.primaryActionTest.session.playerCombat;
        return !combat.activeMeleeAction && combat.snapshotState().playerAttackWait === 0;
      });
      const outcome = await page.evaluate(
        ({ primarySide, reservationSide, forwardButton, tryThrow: throwRequested }) => {
          const r = globalThis.primaryActionTest;
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
          ensure(queued.ok, `Could not start busy-primary fixture move: ${queued.reason}`);
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
            r.setHand(reservationSide, r.inventory.itemByUid(original.uid));
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
      const releaseForward = await holdAction(page, 'movement.forward');
      try {
        await waitForSimulation(
          page,
          progressingSample,
          { start: before.time },
          {
            seconds: 0.35,
            label: 'render-free input and simulation witness',
            record: (line) => process.stderr.write(`${line}\n`),
            stop: releaseForward,
          },
        );
      } finally {
        await releaseForward();
      }
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
      if (!tool) {
        throw new Error('Registry has no one-handed melee fixture');
      }
      const item = r.inventory.create(tool.id);
      r.setHand(r.dominant, item);
      return { uid: item.uid, profile: tool.weapon.melee.type };
    });
    const first = await strike();
    assert.deepEqual(first.swings[0], { result: true, profile: loadout.profile, hand: 'left' });
    assert.equal(await page.evaluate(() => globalThis.primaryActionTest.inventory.hands.left?.uid), loadout.uid);
    await finishedSwing();
    await page.evaluate(async (magazineUrl) => {
      const { magazineWellCalibre } = await import(magazineUrl);
      const r = globalThis.primaryActionTest;
      const defs = [...r.inventory.registry.items.values()];
      const light = defs.find((def) => def.light && !def.twoHanded);
      const tool = defs.find((def) => def.weapon && !def.twoHanded);
      const inert = defs.find(
        (def) =>
          !(
            def.weapon ||
            def.firearm ||
            def.light ||
            def.food ||
            def.drink ||
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
      const gun = defs.find(
        (def) =>
          def.firearm &&
          magazineWellCalibre(r.inventory.registry, def.id) &&
          r.inventory.registry.models.get(def.model)?.gun?.attachments?.some((mounted) => {
            const range = mounted.properties.magnification;
            return range && range.min < range.max;
          }),
      );
      if (!(light && tool && inert && gun)) {
        throw new Error('Missing hand-action fixture capabilities');
      }
      r.types = { light: light.id, tool: tool.id, profile: tool.weapon.melee.type, inert: inert.id, gun: gun.id };
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
    const roundTrip = await page.evaluate(() => {
      const { inventory, session, lightUid } = globalThis.primaryActionTest;
      const snapshot = session.snapshot({ worldId: 'primary-world', characterId: 'primary-actor' });
      const restored = inventory.constructor.restoreState(inventory.registry, snapshot.character.inventory, undefined, {
        character: inventory.character,
      });
      return {
        uid: snapshot.character.lightUid,
        savedOn: snapshot.character.inventory.hands.right?.on,
        restoredOn: restored.hands.right?.on,
        restoredHand: restored.character.handedness,
        lightUid,
      };
    });
    assert.equal(roundTrip.uid, roundTrip.lightUid);
    assert.equal(roundTrip.savedOn, true);
    assert.equal(roundTrip.restoredOn, true);
    assert.equal(roundTrip.restoredHand, 'left');
    await toggleLight('hand.use-off', false);
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
      const { throwChargeSimSeconds, throwMinimumHoldSimSeconds } = r.inventory.registry.senses.get('player').light;
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
      const hands = globalThis.primaryActionTest.view.held.animator.presentation.heldByHand;
      return hands.has('right') && hands.has('left');
    });
    const normalThrowPose = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      return Object.fromEntries(
        ['right', 'left'].map((side) => [side, r.view.held.animator.presentation.arms.get(side).position.toArray()]),
      );
    });
    await page.evaluate(() => {
      globalThis.primaryActionTest.hudOptions.interaction = false;
    });
    await pressAction(page, 'player.throw');
    await page.waitForFunction(() => globalThis.primaryActionTest.isThrowingStance());
    await page.waitForFunction((normal) => {
      const r = globalThis.primaryActionTest;
      return ['right', 'left'].every((side) => {
        const pose = r.view.held.animator.presentation.arms.get(side).position;
        return pose.y > normal[side][1] && pose.z > normal[side][2];
      });
    }, normalThrowPose);
    assert.equal(await page.locator('#throw-stance').evaluate((node) => node.hidden), true);
    await page.evaluate(() => {
      globalThis.primaryActionTest.hudOptions.interaction = true;
    });
    await page.waitForFunction(() => !document.querySelector('#throw-stance').hidden);
    const stanceThrowPose = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      return Object.fromEntries(
        ['right', 'left'].map((side) => [side, r.view.held.animator.presentation.arms.get(side).position.toArray()]),
      );
    });
    for (const side of ['right', 'left']) {
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
    await page.waitForFunction(
      (uid) =>
        globalThis.primaryActionTest.inventory.locate(globalThis.primaryActionTest.inventory.itemByUid(uid))?.kind ===
        'pile',
      throwFixture.offHandUid,
    );
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
      r.setHand(r.dominant, r.inventory.itemByUid(uid));
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
    await page.waitForFunction(
      (uid) =>
        globalThis.primaryActionTest.inventory.locate(globalThis.primaryActionTest.inventory.itemByUid(uid))?.kind ===
        'pile',
      droppedOffHandUid,
    );
    await holdToDrop();
    assert.notDeepEqual(
      await page.evaluate((uid) => {
        const r = globalThis.primaryActionTest;
        return r.inventory.locate(r.inventory.itemByUid(uid)).pile.pos;
      }, droppedOffHandUid),
      fullFeet.feet,
      'the stance drop falls back to the next drop spot when the pile at the feet is full',
    );
    await page.evaluate((uids) => {
      const r = globalThis.primaryActionTest;
      for (const uid of uids) {
        r.inventory.consume(r.inventory.itemByUid(uid), r.inventory.itemByUid(uid).count);
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
      return r.isChargingItemThrow() && !root.hidden && root.querySelector('.activity-progress-minimum');
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
      return {
        value: Number(root.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')),
        marker:
          Number.parseFloat(
            root.querySelector('.activity-progress-minimum').style.getPropertyValue('--minimum-angle'),
          ) / 3.6,
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
      const prompt = document.querySelector('#prompt').cloneNode(false);
      prompt.hidden = false;
      prompt.textContent = 'Interact\nSecond line\nThird line';
      document.body.append(prompt);
      const promptBox = prompt.getBoundingClientRect();
      prompt.remove();
      const overlaps = ['.activity-progress-gauge', '.activity-progress-copy'].map((selector) => {
        const box = document.querySelector(`#handling ${selector}`).getBoundingClientRect();
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
    await page.waitForFunction(() => document.querySelector('#handling').hidden);
    await page.mouse.down({ button: 'right' });
    await meterThrow();
    await page.mouse.up({ button: 'right' });
    await page.waitForFunction(() => !globalThis.primaryActionTest.isChargingItemThrow());
    await page.waitForFunction(() => document.querySelector('#handling').hidden);
    assert.equal(
      await page.evaluate(
        (uid) =>
          globalThis.primaryActionTest.inventory.locate(globalThis.primaryActionTest.inventory.itemByUid(uid))?.kind,
        throwFixture.uid,
      ),
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
      const r = globalThis.primaryActionTest;
      return ['right', 'left'].every((side) =>
        r.view.held.animator.presentation.arms
          .get(side)
          .position.toArray()
          .every((value, axis) => Math.abs(value - normal[side][axis]) < 0.001),
      );
    }, normalThrowPose);
    const restoredThrowPose = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      return Object.fromEntries(
        ['right', 'left'].map((side) => [side, r.view.held.animator.presentation.arms.get(side).position.toArray()]),
      );
    });
    for (const side of ['right', 'left']) {
      assert.ok(restoredThrowPose[side].every((value, axis) => Math.abs(value - normalThrowPose[side][axis]) < 0.001));
    }
    await stanceCancelThrow();
    assert.equal(
      await page.evaluate(
        (uid) =>
          globalThis.primaryActionTest.inventory.locate(globalThis.primaryActionTest.inventory.itemByUid(uid))?.kind,
        throwFixture.uid,
      ),
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
    assert.equal(
      await page.evaluate(
        (uid) =>
          globalThis.primaryActionTest.inventory.locate(globalThis.primaryActionTest.inventory.itemByUid(uid))?.kind,
        throwFixture.uid,
      ),
      'hand',
      'neither charge consumes the held glowstick',
    );
    await page.evaluate(() => {
      const { body } = globalThis.primaryActionTest.session.sim;
      body.advance(body.tuning.knockoutSimSeconds);
    });
    await page.waitForFunction(() => !globalThis.primaryActionTest.session.sim.body.unconscious);
    const cancelThrow = await mouseCharge(page);
    await page.mouse.down({ button: 'right' });
    await cancelThrow();
    await page.mouse.up({ button: 'right' });
    await page.waitForFunction(
      (uid) =>
        globalThis.primaryActionTest.inventory.locate(globalThis.primaryActionTest.inventory.itemByUid(uid))?.kind ===
        'hand',
      throwFixture.uid,
    );
    const throwsBeforeShortRelease = await page.evaluate(
      () =>
        globalThis.primaryActionTest.inputRecorder
          .copyInputs()
          .actions.filter((action) => action.action === 'item.throw').length,
    );
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
      const pressed = globalThis.primaryActionTest.input.dominantUseDown;
      target.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
      return {
        start: globalThis.primaryActionTest.session.sim.time,
        pressed,
        released: !globalThis.primaryActionTest.input.dominantUseDown,
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
      return { location: r.inventory.locate(r.inventory.itemByUid(uid)), expectedSide: r.dominant };
    }, throwFixture.uid);
    assert.equal(shortThrowResult.location?.kind, 'hand', 'a short throw release leaves the item held');
    assert.equal(shortThrowResult.location?.side, shortThrowResult.expectedSide, 'the primary-hand item stays held');
    assert.equal(
      await page.evaluate(
        () =>
          globalThis.primaryActionTest.inputRecorder
            .copyInputs()
            .actions.filter((action) => action.action === 'item.throw').length,
      ),
      throwsBeforeShortRelease,
      'a short release records no throw',
    );
    const glowstickUseRefusal = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      return r.survival.use(r.inventory.itemByUid(uid));
    }, throwFixture.uid);
    assert.equal(glowstickUseRefusal, undefined, 'the fixture glowstick can be lit before throwing');
    const landingTolerance = throwFixture.blockSize * 2;
    const landing = await aimThrowAtFreeLanding(page, throwFixture);
    throwFixture.distance = landing.landingDistance;
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
    const fullMeter = await page.evaluate(() =>
      Number(document.querySelector('#handling [role="progressbar"]').getAttribute('aria-valuenow')),
    );
    assert.equal(fullMeter, 100, 'maximum charge fills the activity ring');
    await releaseThrow();
    try {
      await page.waitForFunction(
        (uid) => globalThis.primaryActionTest.throwSpawnObservations[uid]?.active,
        throwFixture.uid,
      );
      await page.waitForFunction(
        (uid) =>
          globalThis.primaryActionTest.inventory.locate(globalThis.primaryActionTest.inventory.itemByUid(uid))?.kind ===
          'pile',
        throwFixture.uid,
      );
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
            useHeld: r.input.dominantUseHeld,
            rightHeld: r.input.rightMouseHeld,
            time: r.session.sim.time,
            bodyRefusal: r.session.sim.body.actionRefusal,
            notice: r.getNotice(),
            throwActions: r.inputRecorder.copyInputs().actions.filter((action) => action.action === 'item.throw')
              .length,
          };
        },
        { uid: throwFixture.uid, seconds: throwFixture.chargeSimSeconds },
      );
      process.stderr.write(`Full-charge throw did not complete: ${JSON.stringify(state)}\\n`);
      throw error;
    }
    await page.waitForFunction(() => document.querySelector('#handling').hidden);
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
      const location = r.inventory.locate(r.inventory.itemByUid(uid));
      if (location?.kind !== 'pile') {
        throw new Error('Thrown glowstick did not land in a pile');
      }
      const [x, , z] = location.pile.pos;
      return Math.hypot(x + 0.5 - start[0], z + 0.5 - start[2]) * blockSize;
    }, throwFixture);
    assert.ok(
      thrown >= throwFixture.distance - landingTolerance,
      `throw reaches the item's own range (distance ${thrown} of ${throwFixture.distance})`,
    );
    assert.ok(
      thrown <= throwFixture.distance + landingTolerance,
      `throw lands no further than the item's own range (distance ${thrown} of ${throwFixture.distance})`,
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
      const ShellLoadSeconds = definition.firearm.roundLoadSimSeconds;
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
      return {
        uid: firearm.uid,
        spareShellUid: spareShell.uid,
        modelId: definition.model,
        firearmState,
        start: [...r.session.body.pos],
        blockSize: r.scale.blockSize,
        chargeSimSeconds: registry.senses.get('player').light.throwChargeSimSeconds,
      };
    });
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      return r.view.held.animator.presentation.heldByHand.has(r.dominant);
    });
    const firearmRestPose = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      return {
        hand: r.view.held.animator.presentation.arms.get(r.dominant).position.toArray(),
        item: r.view.held.animator.presentation.heldByHand.get(r.dominant).position.toArray(),
      };
    });
    await pressAction(page, 'player.throw');
    await page.waitForFunction(() => globalThis.primaryActionTest.isThrowingStance());
    await page.waitForFunction((rest) => {
      const r = globalThis.primaryActionTest;
      const hand = r.view.held.animator.presentation.arms.get(r.dominant).position;
      return hand.y > rest.hand[1] && hand.z > rest.hand[2];
    }, firearmRestPose);
    const firearmThrowPose = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      return {
        hand: r.view.held.animator.presentation.arms.get(r.dominant).position.toArray(),
        item: r.view.held.animator.presentation.heldByHand.get(r.dominant).position.toArray(),
      };
    });
    for (const key of ['hand', 'item']) {
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
    process.stdout.write(`Firearm flight spawn: ${JSON.stringify(firearmFlight)}\n`);
    assert.equal(firearmFlight.active, true, 'firearm presentation starts at the throw transition');
    assert.ok(firearmFlight.names.includes(loadedFirearm.modelId), 'flight uses the firearm’s own ModelLibrary model');
    await page.waitForFunction(
      (uid) =>
        globalThis.primaryActionTest.inventory.locate(globalThis.primaryActionTest.inventory.itemByUid(uid))?.kind ===
        'pile',
      loadedFirearm.uid,
    );
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
          .find((id) => registry.items.get(id).ammo?.calibre === calibre);
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
        const look = itemLook(r.inventory.registry, rifle);
        if (!look || rifle.firearm?.chamber !== 'round' || magazine.cartridges?.length !== 1) {
          throw new Error('Loaded rifle fixture needs a fitted magazine and a chambered round');
        }
        return {
          uid,
          magazineUid,
          firearmState: structuredClone(rifle.firearm),
          magazineCartridges: [...magazine.cartridges],
          lookKey: look.key,
          chargeSimSeconds: r.inventory.registry.senses.get('player').light.throwChargeSimSeconds,
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
    assert.equal(rifleFlight.active, true, 'rifle presentation starts at the throw transition');
    assert.ok(rifleFlight.names.includes(loadedRifle.lookKey), 'flight uses the loaded rifle’s composed model');
    await page.waitForFunction(
      (uid) =>
        globalThis.primaryActionTest.inventory.locate(globalThis.primaryActionTest.inventory.itemByUid(uid))?.kind ===
        'pile',
      loadedRifle.uid,
    );
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
      r.setHand(r.off, r.inventory.itemByUid(r.lightUid));
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
      r.setHand(r.dominant, r.inventory.itemByUid(r.lightUid));
    });
    await toggleLight(null, true);
    await toggleLight(null, false);
    await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.setHand(r.off, r.inventory.itemByUid(r.lightUid));
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
    assert.equal(await page.evaluate(() => globalThis.primaryActionTest.debugTools.buildOn), true);
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

    // The fixture gun is magazine-fed: the player loads a round into its magazine, fits it and charges.
    const firearm = await page.evaluate(async () => {
      const moduleUrl = '/src/game/firearmHandling.ts';
      const magazineUrl = '/src/core/magazine.ts';
      const optionsUrl = '/src/core/options.ts';
      const { firearmHandlingFor, spentCaseItemId } = await import(moduleUrl);
      const { magazineSpec, magazineWellCalibre } = await import(magazineUrl);
      const { stowTarget } = await import(optionsUrl);
      const r = globalThis.primaryActionTest;
      const { registry } = r.inventory;
      const { firearms, magazines, queue, sim } = r.session;
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
      const magazine = r.inventory.create(ids.find((id) => magazineSpec(registry, id)?.calibre === calibre));
      r.placePocketed(r.inventory.create(ids.find((id) => registry.items.get(id).ammo?.calibre === calibre)));
      r.clearHand(r.off);
      r.setHand(r.dominant, magazine);
      must(magazines.loadNext(magazine.uid, sim.time));
      settle();
      const pocket = stowTarget(r.inventory, magazine, r.feet());
      if (pocket?.kind !== 'pocket' || !r.inventory.move(magazine, pocket).ok) {
        throw new Error('Could not pocket the loaded fixture magazine');
      }
      const gun = r.inventory.create(r.types.gun);
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
      return r.inventory.itemByUid(uid).firearm.readying.duration;
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
      return r.input.aimingDownSights && r.view.held.opticLensFrame;
    });
    const opticView = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      const previewFirearm = r.inventory.itemByUid(uid);
      const optic = Object.values(previewFirearm.slots ?? {}).find((item) => {
        const definition = r.inventory.registry.items.get(item.type);
        const model = definition?.model === undefined ? undefined : r.inventory.registry.models.get(definition.model);
        return model?.gun?.attachment?.kind === 'optic';
      });
      if (!optic) {
        throw new Error('Fixture firearm has no mounted optic');
      }
      const definition = r.inventory.registry.items.get(optic.type);
      const model = r.inventory.registry.models.get(definition.model);
      const expected = {
        magnification: definition.opticMagnification ?? model.gun.attachment.properties.magnification?.min ?? 1,
        aperture: model.gun.attachment.properties.aperture,
        reticle: model.gun.attachment.properties.reticle,
      };
      const frame = r.view.held.opticLensFrame;
      return {
        frame: { magnification: frame.magnification, aperture: frame.aperture, reticle: frame.reticle },
        expected,
        range: model.gun.attachment.properties.magnification,
        step: definition.opticZoom?.step,
      };
    }, firearm.uid);
    assert.deepEqual(opticView.frame, opticView.expected, 'ADS lens uses the mounted optic content and export');
    assert.ok(
      opticView.range?.min < opticView.range?.max && opticView.step > 0,
      'ADS wheel fixture needs a variable optic',
    );
    const zoomDirection = opticView.frame.magnification < opticView.range.max ? -1 : 1;
    const selectedPower = Math.max(
      opticView.range.min,
      Math.min(opticView.range.max, opticView.frame.magnification - zoomDirection * opticView.step),
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
    await page.waitForFunction(() => !globalThis.primaryActionTest.inventory.hands.left.firearm?.cycle);
    await page.mouse.up({ button: 'right' });
    const pistol = await page.evaluate(
      async ({ loadoutModule, actionModule }) => {
        const r = globalThis.primaryActionTest;
        const { equipDebugLoadout } = await import(loadoutModule);
        const { actionCycleSeconds } = await import(actionModule);
        r.clearHand(r.dominant);
        r.clearHand(r.off);
        if (!equipDebugLoadout(r.inventory, true, true, '?loadout=pistol')) {
          throw new Error('Pistol debug loadout was refused');
        }
        const gun = r.inventory.hands[r.dominant];
        const definition = r.inventory.registry.items.get(gun.type);
        const model = r.inventory.registry.models.get(definition.model);
        if (!(definition.twoHanded && model.hands?.support) || model.hands.butt) {
          throw new Error('Pistol needs a free two-palm hold, not a shoulder seat');
        }
        const refusal = r.session.firearms.cock(gun.uid, r.session.sim.time);
        if (refusal) {
          throw new Error(refusal);
        }
        const { hand } = model.gun.action;
        r.session.frame(hand.unlockSimSeconds + hand.rearwardSimSeconds);
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        const { animator } = r.view.held;
        const part = animator.firearmParts.get(gun.uid)?.parts.find((candidate) => candidate.handGrip);
        if (!part) {
          throw new Error('Pistol rack needs an authored slide contact');
        }
        const target = part.node.parent.localToWorld(part.handGrip.clone().add(part.travel));
        const palm = animator.presentation.armRigs.get(r.off).hand.getWorldPosition(target.clone());
        if (
          palm.distanceTo(target) > 1e-6 ||
          part.node.position.distanceTo(part.rest.clone().add(part.travel)) > 1e-6
        ) {
          throw new Error('Support palm must carry the slide through its full authored travel');
        }
        for (let step = 0; r.session.queue.busy; step += 1) {
          if (step > 400) {
            throw new Error('Pistol slide handling did not finish');
          }
          r.session.frame(1 / 20);
        }
        return {
          uid: gun.uid,
          rounds: gun.slots.magazine.cartridges.length,
          cycle: actionCycleSeconds(model.gun.action, 'fire'),
        };
      },
      { loadoutModule: debugLoadoutModule, actionModule: firearmActionModule },
    );
    await page.mouse.down({ button: 'right' });
    await page.waitForFunction((uid) => globalThis.primaryActionTest.session.firearms.isReady(uid), pistol.uid);
    await page.mouse.down();
    await page.waitForFunction(({ uid, rounds }) => {
      const gun = globalThis.primaryActionTest.inventory.itemByUid(uid);
      return gun.slots.magazine.cartridges.length < rounds;
    }, pistol);
    await page.evaluate((cycle) => globalThis.primaryActionTest.session.frame(cycle * 3), pistol.cycle);
    assert.equal(
      await page.evaluate(
        (uid) => globalThis.primaryActionTest.inventory.itemByUid(uid).slots.magazine.cartridges.length,
        pistol.uid,
      ),
      pistol.rounds - 1,
      'holding the pistol trigger commits only one shot',
    );
    await page.mouse.up();
    await page.mouse.click(640, 450);
    await page.waitForFunction(
      ({ uid, rounds }) =>
        globalThis.primaryActionTest.inventory.itemByUid(uid).slots.magazine.cartridges.length === rounds - 2,
      pistol,
    );
    await page.mouse.up({ button: 'right' });
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
    const pryPreview = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.session.sim.actions.cancel();
      const definition = r.inventory.registry.furniture.get('wood_door');
      // Just past the body, not on the feet: a closed door built around the player walls in
      // their own cell, so a later drop at the feet would reach through it.
      const { pos: bodyPos, halfWidth } = r.session.body;
      const pos = [...r.feet().slice(0, 2), Math.floor(bodyPos[2] + halfWidth) + 1];
      const door = r.inventory.furnish({
        type: definition.id,
        pos,
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
      const plain = (part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (Array.isArray(part)) {
          return part.map(plain).join('');
        }
        if (!part?.strings) {
          return '';
        }
        return part.strings.map((s, i) => s + (i < part.values.length ? plain(part.values[i]) : '')).join('');
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
    await page.waitForFunction(() => document.querySelector('#handling').hidden);
    await page.evaluate(() => {
      globalThis.primaryActionTest.hudOptions.handling = true;
    });
    await page.waitForFunction(() => {
      const root = document.querySelector('#handling');
      return !root.hidden && root.querySelector('.activity-progress-gauge');
    });
    const pryElapsed = await page.evaluate(() => {
      const { session } = globalThis.primaryActionTest;
      const { sim } = session;
      sim.frame(1);
      sim.actions.stop();
      const { job } = sim.actions;
      if (job?.jobType !== 'forceDoor') {
        throw new Error('Stopping the pry lost its progress');
      }
      return job.elapsed;
    });
    assert.ok(pryElapsed > 0, 'normal-speed simulation advances visible pry progress');
    await page.waitForFunction(() => document.querySelector('#handling').hidden);
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
    const resumedElapsed = await page.evaluate(() => globalThis.primaryActionTest.session.sim.actions.job.elapsed);
    assert.ok(resumedElapsed >= pryElapsed, 'resuming never moves the pry cursor backwards');
    const stopLabel = await page.evaluate(async (moduleUrl) => {
      const { labelForAction } = await import(moduleUrl);
      return labelForAction('handling.stop');
    }, inputBindingsModule);
    assert.ok((await page.locator('#handling').textContent())?.includes(stopLabel));
    await page.evaluate(() => {
      globalThis.primaryActionTest.hudOptions.handling = false;
    });
    await page.waitForFunction(() => document.querySelector('#handling').hidden);
    await page.evaluate(() => {
      globalThis.primaryActionTest.hudOptions.handling = true;
    });
    await page.waitForFunction(() => {
      const root = document.querySelector('#handling');
      const gauge = root.querySelector('.activity-progress-gauge');
      return !root.hidden && gauge && Number(gauge.getAttribute('aria-valuenow')) > 0;
    });
    const pryingScreenshot = resolve(projectRoot, 'test-results/primary-action/prying-progress.png');
    await mkdir(resolve(projectRoot, 'test-results/primary-action'), { recursive: true });
    await page.screenshot({ path: pryingScreenshot });
    await page.evaluate(() => globalThis.primaryActionTest.session.sim.actions.cancel());

    const lockedDoorStart = performance.now();
    const lockedPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
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
          `http://127.0.0.1:${address.port}/?debug=1&seed=73&site=lock_test&radius=32&time=12:00&post=0&sunshadow=0&torchshadow=0`,
          renderOverride,
        ),
      );
      await lockedPage.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
      await lockedPage.locator('#go').click();
      await lockedPage.waitForFunction(
        () =>
          globalThis.primaryActionTest &&
          document.querySelector('#overlay')?.hidden &&
          document.pointerLockElement &&
          document.querySelector('#world-loading')?.dataset.state === 'ready' &&
          document.querySelector('#world-loading').hidden,
      );
      await lockedPage.evaluate(() => {
        const r = globalThis.primaryActionTest;
        const door = [...r.inventory.entities.all].find((entity) => entity.lock?.locked);
        if (!door) {
          throw new Error('lock_test did not instantiate its locked door');
        }
        const aimAtDoor = () => {
          const target = [
            door.pos[0] + door.size[0] / 2,
            door.pos[1] + door.size[1] / 2,
            door.pos[2] + door.size[2] / 2,
          ];
          const eye = [
            r.session.body.pos[0],
            r.session.body.pos[1] + r.session.playerEyeHeightMetres / r.scale.blockSize,
            r.session.body.pos[2],
          ];
          const dx = target[0] - eye[0];
          const dy = target[1] - eye[1];
          const dz = target[2] - eye[2];
          r.input.yaw = Math.atan2(-dx, -dz);
          r.input.pitch = Math.atan2(dy, Math.hypot(dx, dz));
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
        const target = [door.pos[0] + door.size[0] / 2, door.pos[1] + door.size[1] / 2, door.pos[2] + door.size[2] / 2];
        const eye = [
          r.session.body.pos[0],
          r.session.body.pos[1] + r.session.playerEyeHeightMetres / r.scale.blockSize,
          r.session.body.pos[2],
        ];
        const dx = target[0] - eye[0];
        const dy = target[1] - eye[1];
        const dz = target[2] - eye[2];
        r.input.yaw = Math.atan2(-dx, -dz);
        r.input.pitch = Math.atan2(dy, Math.hypot(dx, dz));
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
        progressingSample,
        { start: toolDoor.start },
        {
          seconds: 0.5,
          label: 'locked-door F action enters the simulation',
          record: (line) => process.stderr.write(`${line}\n`),
        },
      );
      const pryAction = await lockedPage.evaluate((uid) => {
        const r = globalThis.primaryActionTest;
        return {
          job: r.session.sim.actions.job?.jobType,
          targetUid: r.interactionTargetAt()?.entity?.uid,
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
      assert.ok(
        Math.hypot(
          positionAfterMovement[0] - positionBeforeMovement[0],
          positionAfterMovement[2] - positionBeforeMovement[2],
        ) > 0,
        'movement remains available after an interrupted carried-tool pry',
      );
      process.stdout.write(`Locked-door input reproduction: ${JSON.stringify({ pryAction, interruptedPry })}\n`);
    } finally {
      await lockedPage.close();
      logPhase('locked-door-input-case', lockedDoorStart);
    }

    const treatment = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.clearHand(r.dominant);
      r.clearHand(r.off);
      const rag = r.inventory.create('rag');
      r.setHand(r.dominant, rag);
      r.session.sim.body.impact(1, 'leftArm', { bleeding: 0 });
      r.session.sim.body.impact(3, 'rightArm', { bleeding: 0 });
      return { uid: rag.uid, initial: r.survival.selectedItemAction(rag)?.treatment?.region };
    });
    await page.evaluate(() => {
      globalThis.primaryActionTest.hudOptions.interaction = false;
    });
    await page.waitForFunction(() => document.querySelector('#item-action-list').hidden);
    await page.evaluate(() => {
      globalThis.primaryActionTest.hudOptions.interaction = true;
    });
    let hintWaitError;
    try {
      await page.waitForFunction(
        () => document.querySelector('#item-action-list')?.textContent?.includes('›') === true,
        undefined,
        { timeout: 5000 },
      );
    } catch (error) {
      hintWaitError = error;
    }
    const actionHint = await page.locator('#item-action-list').textContent();
    const hintCount = (actionHint?.match(/›/g) ?? []).length;
    const hintWaitFailure = hintWaitError ? `; hint wait failed: ${hintWaitError}` : '';
    assert.equal(
      hintWaitError === undefined && hintCount === 1,
      true,
      `expected exactly one treatment hint marker within 5 seconds; prompt was ${JSON.stringify(actionHint)}${hintWaitFailure}`,
    );
    const selectedBeforeWheel = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      return r.survival.selectedItemAction(r.inventory.itemByUid(uid))?.treatment?.region;
    }, treatment.uid);
    await page.evaluate(() => globalThis.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, cancelable: true })));
    await page.waitForFunction(
      (args) => {
        const r = globalThis.primaryActionTest;
        return r.survival.selectedItemAction(r.inventory.itemByUid(args.uid))?.treatment?.region !== args.before;
      },
      { uid: treatment.uid, before: selectedBeforeWheel },
    );
    const selected = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      return r.survival.selectedItemAction(r.inventory.itemByUid(uid))?.treatment?.region;
    }, treatment.uid);
    await page.mouse.click(640, 450);
    await page.waitForFunction(
      (uid) => {
        const { sim } = globalThis.primaryActionTest.session;
        return sim.actions.job?.jobType === 'treatment' && sim.actions.job.itemUid === uid;
      },
      treatment.uid,
      { timeout: 10_000 },
    );
    const treatmentRegion = await page.evaluate(() => globalThis.primaryActionTest.session.sim.actions.job.region);
    assert.equal(treatmentRegion, selected);
    const command = async (action) =>
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
    await command('debug.panel-toggle');
    await command('debug.input-replay-export');
    await page.waitForFunction(() => document.querySelector('#replay-download')?.hidden === false);
    const replayText = await page.evaluate(() => {
      const link = document.querySelector('#replay-download');
      if (!link?.href.startsWith('blob:')) {
        throw new Error('Replay export did not create a downloadable artifact');
      }
      return fetch(link.href).then((response) => response.text());
    });
    await timePhase('ground-pickup-case', () => verifyGroundPickup(browser, address.port, renderOverride));
    const replayArtifact = JSON.parse(replayText);
    assert.equal(replayArtifact.magic, 'DEADVOX_REPLAY');
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
      await page.waitForFunction(() => document.querySelector('#input-replay-status')?.dataset.state === 'playing');
      const replayError = await page.locator('#errors').textContent();
      assert(!replayError?.startsWith('Replay rejected:'), `replay import failed: ${replayError}`);
    });

    await page.goto(
      browserStageUrl(
        'primary-action',
        `http://127.0.0.1:${address.port}/?debug=1&seed=73&site=testHouse&radius=32&time=12:00&post=0&sunshadow=0&torchshadow=0`,
        renderOverride,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#go').click();
    await page.waitForFunction(
      () =>
        globalThis.primaryActionTest &&
        document.querySelector('#overlay')?.hidden &&
        document.pointerLockElement &&
        document.querySelector('#world-loading')?.dataset.state === 'ready' &&
        document.querySelector('#world-loading').hidden,
    );
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
    await page.waitForFunction(() => document.querySelector('#replay-download')?.hidden === false);
    const shortReplayText = await page.evaluate(() => {
      const link = document.querySelector('#replay-download');
      if (!link?.href.startsWith('blob:')) {
        throw new Error('Fixture-write replay export did not create a downloadable artifact');
      }
      return fetch(link.href).then((response) => response.text());
    });
    const shortReplayArtifact = JSON.parse(shortReplayText);
    assert.equal(shortReplayArtifact.magic, 'DEADVOX_REPLAY');
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
          const state = document.querySelector('#input-replay-status')?.dataset.state;
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
  } else {
    await withTestHouse(browser, address.port, renderOverride, async (testHousePage) => {
      await timePhase('container-search-tab-case', () => verifyContainerSearchTab(testHousePage));
      await timePhase('vehicle-service-case', () => verifyVehicleService(testHousePage));
    });
    await timePhase('clean-look-replay-case', () => verifyCleanLookReplay(browser, address.port, renderOverride));
    await timePhase('stance-throw-replay-case', () => verifyStanceThrowReplay(browser, address.port, renderOverride));
    await timePhase('forward-button-replay-case', () =>
      verifyForwardButtonReplay(browser, address.port, renderOverride),
    );
    await timePhase('ads-fire-replay-case', () => verifyAdsFireReplay(browser, address.port, renderOverride));
  }
  await timePhase('flow-browser-close', () => browser.close());
  browser = undefined;
  process.stdout.write(`Primary-action ${group} group passed.\n`);
} finally {
  if (browser) {
    await timePhase('browser-final-close', () => browser.close());
  }
  await timePhase('vite-close', () => vite.close());
}
