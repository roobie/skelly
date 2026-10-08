// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract starts Vite and Chrome
// biome-ignore-all lint/performance/noAwaitInLoops: browser input selection must settle before the next keypress
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract uses Node assertions
// biome-ignore-all lint/style/noProcessEnv: runner controls the executable and source checkout for A/B tests
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from './chromium.mjs';
import { holdAction, pressAction } from './input-actions.mjs';
import { waitForSimulation } from './simulation-wait.mjs';
import { browserStageMode, browserStageUrl } from './stage-mode.mjs';

const projectRoot = resolve(process.env.PRIMARY_ACTION_ROOT ?? fileURLToPath(new URL('../..', import.meta.url)));
const inputBindingsModule = '/src/game/inputBindings.ts';
const inputReplayModule = '/src/game/inputReplay.ts';
const firearmHandlingModule = '/src/game/firearmHandling.ts';
const reloadInputModule = '/src/game/reloadInput.ts';
const magazineModule = '/src/core/magazine.ts';
const optionsModule = '/src/core/options.ts';
const itemLookModule = '/src/render/itemLook.ts';
const progressingSample = ({ start }) => {
  const { session } = globalThis.primaryActionTest;
  return { time: session.sim.time, paused: session.sim.paused, reached: session.sim.time - start >= 0.35 };
};
const throwChargeSample = ({ start, seconds }) => {
  const { session } = globalThis.primaryActionTest;
  return { time: session.sim.time, paused: session.sim.paused, reached: session.sim.time - start >= seconds };
};
const mouseCharge = async (page) => {
  await page.mouse.down({ button: 'left' });
  return async () => page.mouse.up({ button: 'left' });
};
const measureGlowstickFloor = async (page, uid, label) => {
  const screenshot = await page.locator('#view canvas').screenshot();
  const artifacts = resolve(projectRoot, 'test-results/primary-action');
  await mkdir(artifacts, { recursive: true });
  await writeFile(resolve(artifacts, `dropped-glowstick-${label}.png`), screenshot);
  return page.evaluate(
    async ({ base64, itemUid }) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(itemUid);
      const location = item && r.inventory.locate(item);
      if (location?.kind !== 'pile') {
        throw new Error('Glowstick pixel fixture is not on the ground');
      }
      const { camera } = r.engine;
      camera.updateMatrixWorld(true);
      const forward = camera.getWorldDirection(camera.position.clone());
      forward.y = 0;
      forward.normalize();
      const { blockSize } = r.scale;
      const point = camera.position
        .clone()
        .set(
          (location.pile.pos[0] + 0.5) * blockSize + forward.x * 0.8,
          location.pile.pos[1] * blockSize + 0.015,
          (location.pile.pos[2] + 0.5) * blockSize + forward.z * 0.8,
        )
        .project(camera);
      const decoded = new Image();
      decoded.src = `data:image/png;base64,${base64}`;
      await decoded.decode();
      const x = Math.round(((point.x + 1) / 2) * decoded.naturalWidth);
      const y = Math.round(((1 - point.y) / 2) * decoded.naturalHeight);
      const radius = 6;
      if (x < radius || y < radius || x + radius >= decoded.naturalWidth || y + radius >= decoded.naturalHeight) {
        throw new Error(`Floor sample projects outside the canvas: ${x},${y}`);
      }
      const canvas = document.createElement('canvas');
      canvas.width = decoded.naturalWidth;
      canvas.height = decoded.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(decoded, 0, 0);
      const pixels = context.getImageData(x - radius, y - radius, radius * 2 + 1, radius * 2 + 1).data;
      let sum = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        sum += pixels[index] + pixels[index + 1] + pixels[index + 2];
      }
      return { x, y, luminance: sum / ((pixels.length / 4) * 3), on: item.on };
    },
    { base64: screenshot.toString('base64'), itemUid: uid },
  );
};
const checkDroppedGlowstickPixel = async (port) => {
  const browser = await launchChromium('primary-action', {
    headless: true,
    args: ['--enable-webgl'],
    renderMode: 'pixel',
  });
  try {
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
    });
    await page.goto(
      browserStageUrl(
        'primary-action',
        `http://127.0.0.1:${port}/?debug=1&seed=73&site=testHouse&radius=64&time=21:00&post=0&sunshadow=0&torchshadow=0`,
        'pixel',
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#dominant-hand').selectOption('left');
    await page.locator('#go').click();
    await page.waitForFunction(
      () => globalThis.primaryActionTest && document.querySelector('#overlay')?.hidden && document.pointerLockElement,
    );
    const fixture = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.input.pitch = -0.55;
      const item = r.inventory.create('glowstick');
      if (!r.inventory.add(item, { kind: 'pile', pos: r.feet() })) {
        throw new Error('Could not place dropped-glowstick pixel fixture');
      }
      return { uid: item.uid, frame: r.frames };
    });
    await page.waitForFunction((frame) => globalThis.primaryActionTest.frames > frame, fixture.frame);
    const off = await measureGlowstickFloor(page, fixture.uid, 'off');
    assert.notEqual(off.on, true);
    const onFrame = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(uid);
      r.setHand(r.dominant, item);
      const reason = r.survival.use(item);
      if (reason) {
        throw new Error(`Could not light dropped glowstick fixture: ${reason}`);
      }
      const dropped = r.inventory.move(item, { kind: 'pile', pos: r.feet() });
      if (!dropped.ok) {
        throw new Error(`Could not drop lit glowstick fixture: ${dropped.reason}`);
      }
      return r.frames;
    }, fixture.uid);
    await page.waitForFunction((frame) => globalThis.primaryActionTest.frames > frame, onFrame);
    const on = await measureGlowstickFloor(page, fixture.uid, 'on');
    assert.equal(on.on, true);
    process.stdout.write(`Dropped glowstick floor luminance: ${JSON.stringify({ off, on })}\n`);
    assert.ok(
      on.luminance > off.luminance + 3,
      'a dropped lit glowstick visibly brightens nearby floor pixels at night',
    );
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
  }
};
const observationPlugin = {
  name: 'primary-action-test-observation',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/game/play.ts')) {
      return;
    }
    const marker = '  const onForwardPress = (e: MouseEvent) => {';
    const throwQueueMarker = `      pendingPlayerTickActions.enqueue(() => {
        applyToHeldItem(inventory.hands, hand, uid, (heldItem) => {
          throwHeldItem(heldItem, hand, distance, chargeProgress);
          syncThrowingStance();
        });
      });`;
    const playerTickMarker = '      pendingPlayerTickActions.applyAtNextTick();';
    assert(code.includes(marker), 'game-loop observation point exists');
    assert(code.includes(throwQueueMarker), 'stance throw queue observation point exists');
    assert(code.includes(playerTickMarker), 'player tick action observation point exists');
    let observedCode = code.replace(
      throwQueueMarker,
      `${throwQueueMarker}
      if (proof.quickbarTapAfterNextThrowCommit !== undefined) {
        const slot = proof.quickbarTapAfterNextThrowCommit;
        proof.quickbarTapAfterNextThrowCommit = undefined;
        quickbarTap(slot);
        const tappedItem = inventory.itemByUid(proof.quickbarTapItemUid);
        proof.quickbarTapCommitObservation = {
          itemMoveQueued: queue.jobs.some(
            (job) => job.kind === 'move' && job.itemUid === proof.quickbarTapItemUid,
          ),
          location: tappedItem ? inventory.locate(tappedItem)?.kind ?? null : null,
        };
      }
      if (proof.dropAfterNextThrowCommit) {
        proof.dropAfterNextThrowCommit = false;
        dropHeldItemForThrowingStance();
      }`,
    );
    observedCode = observedCode.replace(
      playerTickMarker,
      `${playerTickMarker}
      if (proof.quickbarTapCommitObservation && !proof.quickbarTapTickObservation) {
        const tappedItem = inventory.itemByUid(proof.quickbarTapItemUid);
        proof.quickbarTapTickObservation = {
          itemMoveQueued: queue.jobs.some(
            (job) => job.kind === 'move' && job.itemUid === proof.quickbarTapItemUid,
          ),
          location: tappedItem ? inventory.locate(tappedItem)?.kind ?? null : null,
        };
      }`,
    );
    return observedCode.replace(
      marker,
      `
  const proof = {
    input,
    keyboardInput,
    inventory,
    session,
    queue,
    view,
    streamer,
    survival,
    debugTools,
    engine,
    view,
    caseEffects,
    itemThrows,
    audio,
    feet,
    scale,
    performHandUse,
    quickbarActions,
    quickbar,
    screen,
    dispatchScreenCommand,
    get inputRecorder() { return inputRecorder; },
    captureSnapshot,
    dropAfterNextThrowCommit: false,
    quickbarTapAfterNextThrowCommit: undefined,
    quickbarTapItemUid: undefined,
    quickbarTapCommitObservation: undefined,
    quickbarTapTickObservation: undefined,
    startInputReplayRecording: () => {
      previousInputRecorder = undefined;
      inputRecorder = new InputReplayRecorder(captureSnapshot(), undefined, streamer.generatedColumns());
    },
    hudOptions,
    beginItemThrow,
    selectPrimaryAction,
    ignitionTargetForHand,
    interactionTargetAt,
    useTarget,
    useText,
    dominant: 'left', off: 'right', frames: 0, swings: [], attachments: [], trackAttachment: false,
    initialPlayerPosition: [...session.body.pos],
    getNotice: () => notice,
    isChargingItemThrow: () => itemThrowStartedAt !== undefined,
    isThrowingStance: () => throwingStance,
    clearNotice: () => showNotice(''),
    clearHand: (side) => {
      const held = inventory.hands[side];
      if (held) {
        const result = inventory.move(held, { kind: 'pile', pos: feet() });
        if (!result.ok) throw new Error('Could not drop fixture hand: ' + result.reason);
      }
    },
    setHand: (side, item) => {
      if (inventory.hands[side] === item) return;
      proof.clearHand(side);
      const from = inventory.locate(item);
      const result = from ? inventory.move(item, { kind: 'hand', side }) : inventory.add(item, { kind: 'hand', side });
      if (from ? !result.ok : !result) throw new Error('Could not place fixture hand');
    },
    placePocketed: (item) => {
      const definitions = inventory.registry.items;
      const { size } = definitions.get(item.type);
      const fits = (grid) =>
        (grid[0] >= size[0] && grid[1] >= size[1]) || (grid[0] >= size[1] && grid[1] >= size[0]);
      for (const { item: container, location } of inventory.items()) {
        if (location.kind !== 'worn' || !container.pockets) continue;
        const definition = definitions.get(container.type);
        for (let pocket = 0; pocket < definition.container.pockets.length; pocket += 1) {
          if (fits(definition.container.pockets[pocket].grid)) {
            if (inventory.add(item, { kind: 'pocket', owner: container, pocket })) return;
          }
        }
      }
      throw new Error('No worn pocket fits ' + item.type);
    },
  };
  Object.assign(globalThis, { primaryActionTest: proof });
  const proofFrame = session.frame.bind(session);
  session.frame = (...args) => { const result = proofFrame(...args); proof.frames++; return result; };
  const proofSwing = session.playerCombat.beginMeleeSwing.bind(session.playerCombat);
  session.playerCombat.beginMeleeSwing = (start) => {
    const result = proofSwing(start);
    proof.swings.push({ result, profile: start.profile, hand: session.playerCombat.activeMeleeAction?.hand ?? start.hand });
    return result;
  };
  const proofHeldUpdate = view.held.update.bind(view.held);
  view.held.update = (...args) => {
    proofHeldUpdate(...args);
    if (!proof.trackAttachment) return;
    const pose = args[1];
    const arm = view.held.arms.get(proof.off);
    const item = view.held.heldByHand.get(proof.off);
    const anchor = arm?.getObjectByName('grip-anchor');
    if (!anchor || !item) return;
    proof.attachments.push({
      gap: item.getWorldPosition(camera.position.clone()).distanceTo(anchor.getWorldPosition(camera.position.clone())),
      angle: item.getWorldQuaternion(camera.quaternion.clone()).angleTo(anchor.getWorldQuaternion(camera.quaternion.clone())),
      torsoYaw: pose?.torsoYaw ?? 0,
      movedOff: [...(pose?.[proof.off]?.offset ?? []), ...(pose?.[proof.off]?.rotation ?? [])].some(value => value !== 0),
    });
  };
${marker}`,
    );
  },
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
        `http://127.0.0.1:${port}/?debug=1&seed=73&site=hamlet&radius=32&time=12:00&post=0&sunshadow=0&torchshadow=0`,
        renderOverride,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#go').click();
    await page.waitForFunction(
      () => globalThis.primaryActionTest && document.querySelector('#overlay')?.hidden && document.pointerLockElement,
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
    assert(cleanArtifact.columnChanges.length > 0, 'the clean recording captures generated-column streaming');
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
    const replayNavigation = page.waitForNavigation();
    await command('debug.input-replay-import');
    await page.locator('#input-replay-file').setInputFiles({
      name: 'clean-look-replay.json',
      mimeType: 'application/json',
      buffer: Buffer.from(replayText),
    });
    await replayNavigation;
    await page.waitForFunction(() => document.querySelector('#input-replay-status'));
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
      () => globalThis.primaryActionTest && document.querySelector('#overlay')?.hidden && document.pointerLockElement,
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
      return { mainUid: mainItem.uid, offUid: offItem.uid, minimumHoldSimSeconds, quickbarSlot };
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
      const hands = globalThis.primaryActionTest.view.held.heldByHand;
      return hands.has('left') && hands.has('right');
    });
    await page.evaluate((slot) => {
      const r = globalThis.primaryActionTest;
      r.startInputReplayRecording();
      r.dropAfterNextThrowCommit = true;
      r.quickbarTapAfterNextThrowCommit = slot;
      r.quickbarTapItemUid = r.quickbar.slots[slot];
      r.quickbarTapCommitObservation = undefined;
      r.quickbarTapTickObservation = undefined;
    }, fixture.quickbarSlot);
    await pressAction(page, 'player.throw');
    await page.waitForFunction(() => globalThis.primaryActionTest.isThrowingStance());
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
    assert(artifact.actions.some(({ action }) => action === 'throw.stance.toggle'));
    const throwActionIndex = artifact.actions.findIndex(({ action }) => action === 'item.throw');
    assert.equal(artifact.actions.filter(({ action }) => action === 'quickbar.tap.1').length, 1);
    const quickbarActionIndex = artifact.actions.findIndex(({ action }) => action === 'quickbar.tap.1');
    const dropActionIndex = artifact.actions.findIndex(({ action }) => action === 'item.drop');
    assert(quickbarActionIndex > throwActionIndex, 'the same-sample quickbar action follows the throw');
    assert(dropActionIndex > quickbarActionIndex, 'the same-sample drop follows the quickbar action');
    assert.equal(artifact.actions[quickbarActionIndex].tick, artifact.actions[throwActionIndex].tick);
    assert.equal(artifact.actions[dropActionIndex].tick, artifact.actions[throwActionIndex].tick);
    const replayNavigation = page.waitForNavigation();
    await command('debug.input-replay-import');
    await page.locator('#input-replay-file').setInputFiles({
      name: 'two-hand-throw-replay.json',
      mimeType: 'application/json',
      buffer: Buffer.from(replayText),
    });
    await replayNavigation;
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
      () => globalThis.primaryActionTest && document.querySelector('#overlay')?.hidden && document.pointerLockElement,
    );
    const fixture = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const wornContainers = [...r.inventory.items()].filter(
        ({ item, location }) => location.kind === 'worn' && item.pockets?.length,
      );
      const itemDef = [...r.inventory.registry.items.values()].find(
        (def) =>
          def.size[0] === 1 &&
          def.size[1] === 1 &&
          !def.model &&
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
        throw new Error('Ground pickup fixture lacks an available worn pocket or small bundled item');
      }
      const floor = r.feet();
      const first = r.inventory.create(itemDef.id);
      if (!r.inventory.add(first, { kind: 'pile', pos: floor })) {
        throw new Error('Could not place tap-pickup fixture');
      }
      const aimAtPile = () => {
        const eye = [
          r.session.body.pos[0],
          r.session.body.pos[1] + r.session.playerEyeHeightMetres / r.scale.blockSize,
          r.session.body.pos[2],
        ];
        const target = [floor[0] + 0.5, floor[1] + 0.1, floor[2] + 0.5];
        const dx = target[0] - eye[0];
        const dy = target[1] - eye[1];
        const dz = target[2] - eye[2];
        r.input.yaw = Math.atan2(-dx, -dz);
        r.input.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      };
      aimAtPile();
      r.grabProgress = [];
      const updateHeld = r.view.updateHeld.bind(r.view);
      r.view.updateHeld = (dt, pose, light, handling) => {
        if (handling?.grab) {
          r.grabProgress.push(handling.grab.progress);
        }
        return updateHeld(dt, pose, light, handling);
      };
      return { ownerUid: pocketOwner.uid, itemUid: first.uid, itemType: itemDef.id, floor };
    });
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

    const doorUid = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const doorDef = [...r.inventory.registry.furniture.values()].find((def) => def.door);
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
    });
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
    }, doorUid);
    await pressAction(page, 'world.interact');
    await page.waitForFunction(
      (uid) => globalThis.primaryActionTest.inventory.entities.byUid(uid)?.open === true,
      doorUid,
    );
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
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
  await vite.listen();
  const address = vite.httpServer.address();
  assert(address && typeof address !== 'string');
  const renderOverride = process.env.DEADVOX_TEST_RENDER_MODE;
  const renderMode = browserStageMode('primary-action', renderOverride);
  browser = await launchChromium('primary-action', {
    headless: true,
    args: renderMode === 'pixel' ? ['--enable-webgl'] : [],
    renderMode: renderOverride,
  });
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
  await page.goto(
    browserStageUrl(
      'primary-action',
      `http://127.0.0.1:${address.port}/?debug=1&seed=73&site=testHouse&radius=64&time=12:00&post=0&sunshadow=0&torchshadow=0`,
      renderOverride,
    ),
  );
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  await page.locator('#dominant-hand').selectOption('left');
  assert.equal(
    await page.evaluate(() => Boolean(globalThis.primaryActionTest)),
    false,
    'selecting Left does not construct an actor',
  );
  await page.locator('#go').click();
  await page.waitForFunction(
    () => globalThis.primaryActionTest && document.querySelector('#overlay')?.hidden && document.pointerLockElement,
  );
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
    await page.waitForFunction((uid) => globalThis.primaryActionTest.inventory.itemByUid(uid)?.on === true, before.uid);
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
  assert.deepEqual(pumpState.after, pumpState.before, 'quickbar hold does not rack or otherwise mutate a pump shotgun');
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
    await page.mouse.click(640, 450);
    await page.waitForFunction((count) => globalThis.primaryActionTest.swings.length > count, before.swings.length);
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
        ensure(r.inventory.add(incoming, { kind: 'pile', pos: r.feet() }), 'Could not place busy-primary fixture item');
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
    const item = [...r.inventory.items()].find(({ item: candidate }) => {
      const def = r.inventory.registry.items.get(candidate.type);
      return def.weapon && !def.twoHanded;
    })?.item;
    if (!item) {
      throw new Error('Debug loadout has no one-handed melee fixture');
    }
    r.setHand(r.dominant, item);
    return { uid: item.uid, profile: r.inventory.registry.items.get(item.type).weapon.melee.type };
  });
  const first = await strike();
  assert.deepEqual(first.swings[0], { result: true, profile: loadout.profile, hand: 'left' });
  assert.equal(await page.evaluate(() => globalThis.primaryActionTest.inventory.hands.left?.uid), loadout.uid);
  await finishedSwing();
  await page.evaluate(() => {
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
    const gun = defs.find((def) => def.firearm && !def.firearm.pump);
    if (!(light && tool && inert && gun)) {
      throw new Error('Missing hand-action fixture capabilities');
    }
    r.types = { light: light.id, tool: tool.id, profile: tool.weapon.melee.type, inert: inert.id, gun: gun.id };
    r.clearHand(r.dominant);
  });
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
    const restored = inventory.constructor.restoreState(
      inventory.registry,
      snapshot.character.inventory,
      undefined,
      inventory.character,
    );
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
    return {
      uid: glowstick.uid,
      offHandUid: offHandItem.uid,
      start: [...r.session.body.pos],
      blockSize: r.scale.blockSize,
      distance: r.inventory.registry.senses.get('player').light.throwMaxDistanceMetres,
      chargeSimSeconds: r.inventory.registry.senses.get('player').light.throwChargeSimSeconds,
      minimumHoldSimSeconds: r.inventory.registry.senses.get('player').light.throwMinimumHoldSimSeconds,
    };
  });
  await page.waitForFunction(() => {
    const hands = globalThis.primaryActionTest.view.held.heldByHand;
    return hands.has('right') && hands.has('left');
  });
  const normalThrowPose = await page.evaluate(() => {
    const r = globalThis.primaryActionTest;
    return Object.fromEntries(['right', 'left'].map((side) => [side, r.view.held.arms.get(side).position.toArray()]));
  });
  await page.evaluate(() => {
    globalThis.primaryActionTest.hudOptions.interaction = false;
  });
  await pressAction(page, 'player.throw');
  await page.waitForFunction(() => globalThis.primaryActionTest.isThrowingStance());
  await page.waitForFunction((normal) => {
    const r = globalThis.primaryActionTest;
    return ['right', 'left'].every((side) => {
      const pose = r.view.held.arms.get(side).position;
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
    return Object.fromEntries(['right', 'left'].map((side) => [side, r.view.held.arms.get(side).position.toArray()]));
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
    (uid) =>
      globalThis.primaryActionTest.inventory.locate(globalThis.primaryActionTest.inventory.itemByUid(uid))?.kind ===
      'pile',
    throwFixture.offHandUid,
  );
  assert.equal(await page.evaluate(() => globalThis.primaryActionTest.itemThrows.activeCount > 0), true);
  assert.equal(
    await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      return r.isThrowingStance() && r.inventory.hands[r.dominant]?.uid === uid && !r.inventory.hands[r.off];
    }, throwFixture.uid),
    true,
    'a throw prioritizes the off-hand item and leaves the main-hand item held in stance',
  );
  await page.evaluate((uid) => {
    const r = globalThis.primaryActionTest;
    r.setHand(r.dominant, r.inventory.itemByUid(uid));
    const offHandDrop = r.inventory.create('glowstick');
    r.setHand(r.off, offHandDrop);
    r.hudOptions.handling = true;
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
    return r.isChargingItemThrow() && !root.hidden && root.querySelector('.hd-minimum');
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
      fill: Number.parseFloat(root.querySelector('.hd-fill').style.width),
      marker: Number.parseFloat(root.querySelector('.hd-minimum').style.left),
      minimumLabel: root.querySelector('.hd-meter-minimum')?.textContent,
    };
  });
  assert.ok(meterMidpoint.fill > 0 && meterMidpoint.fill < 100, 'charge meter reports partial throw force');
  assert.equal(
    meterMidpoint.marker,
    Math.round((throwFixture.minimumHoldSimSeconds / throwFixture.chargeSimSeconds) * 100),
    'meter marks the authored minimum release point',
  );
  assert.ok(meterMidpoint.minimumLabel?.trim(), 'minimum marker has a non-empty label');
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
      r.view.held.arms
        .get(side)
        .position.toArray()
        .every((value, axis) => Math.abs(value - normal[side][axis]) < 0.001),
    );
  }, normalThrowPose);
  const restoredThrowPose = await page.evaluate(() => {
    const r = globalThis.primaryActionTest;
    return Object.fromEntries(['right', 'left'].map((side) => [side, r.view.held.arms.get(side).position.toArray()]));
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
    await page.evaluate((uid) => Boolean(globalThis.primaryActionTest.inventory.itemByUid(uid)?.on), throwFixture.uid),
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
      globalThis.primaryActionTest.inputRecorder.copyInputs().actions.filter((action) => action.action === 'item.throw')
        .length,
  );
  const shortStart = await page.evaluate(() => globalThis.primaryActionTest.session.sim.time);
  const shortRelease = await mouseCharge(page);
  await page.waitForFunction(() => globalThis.primaryActionTest.isChargingItemThrow());
  await waitForSimulation(
    page,
    throwChargeSample,
    { start: shortStart, seconds: throwFixture.minimumHoldSimSeconds / 2 },
    {
      seconds: throwFixture.minimumHoldSimSeconds / 2 + 0.1,
      label: 'release before minimum hold leaves the item in hand',
      record: (line) => process.stderr.write(`${line}\n`),
      stop: shortRelease,
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
    Number.parseFloat(document.querySelector('#handling .hd-fill').style.width),
  );
  assert.equal(fullMeter, 100, 'maximum charge fills the handling meter');
  await releaseThrow();
  await page.waitForFunction((uid) => {
    const r = globalThis.primaryActionTest;
    return r.inventory.locate(r.inventory.itemByUid(uid))?.kind === 'pile' && r.itemThrows.activeCount > 0;
  }, throwFixture.uid);
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
  const landingTolerance = throwFixture.blockSize * 2;
  assert.ok(
    await page.evaluate(() => globalThis.primaryActionTest.itemThrows.activeCount > 0),
    'item throw presents a visible arc to the landing point',
  );
  assert.ok(
    thrown >= throwFixture.distance - landingTolerance,
    `throw reaches its tuned landing range (distance ${thrown})`,
  );
  assert.ok(
    thrown <= throwFixture.distance + landingTolerance,
    `throw uses the tuned landing range (distance ${thrown})`,
  );
  const loadedFirearm = await page.evaluate(async (moduleUrl) => {
    const r = globalThis.primaryActionTest;
    r.clearHand(r.dominant);
    r.clearHand(r.off);
    const { registry } = r.inventory;
    const definition = [...registry.items.values()].find((item) => item.firearm?.pump);
    if (!definition?.model) {
      throw new Error('No pump firearm fixture is available');
    }
    const calibre = registry.models.get(definition.model)?.calibre;
    const cartridge = [...registry.items.values()].find((item) => item.ammo?.calibre === calibre);
    if (!cartridge) {
      throw new Error('No compatible firearm cartridge fixture is available');
    }
    const firearm = r.inventory.create(definition.id);
    const shell = r.inventory.create(cartridge.id);
    const spareShell = r.inventory.create(cartridge.id);
    r.setHand(r.dominant, firearm);
    r.setHand(r.off, shell);
    const { SHELL_LOAD_SECONDS } = await import(moduleUrl);
    const start = r.session.sim.time;
    const refusal = r.session.firearms.load(shell, start);
    if (refusal) {
      throw new Error(`Could not load firearm throw fixture: ${refusal}`);
    }
    r.session.queue.tick(SHELL_LOAD_SECONDS);
    r.session.firearms.advanceTo(start + SHELL_LOAD_SECONDS);
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
  }, firearmHandlingModule);
  await page.waitForFunction(() => {
    const r = globalThis.primaryActionTest;
    return r.view.held.heldByHand.has(r.dominant);
  });
  const firearmRestPose = await page.evaluate(() => {
    const r = globalThis.primaryActionTest;
    return {
      hand: r.view.held.arms.get(r.dominant).position.toArray(),
      item: r.view.held.heldByHand.get(r.dominant).position.toArray(),
    };
  });
  await pressAction(page, 'player.throw');
  await page.waitForFunction(() => globalThis.primaryActionTest.isThrowingStance());
  await page.waitForFunction((rest) => {
    const r = globalThis.primaryActionTest;
    const hand = r.view.held.arms.get(r.dominant).position;
    return hand.y > rest.hand[1] && hand.z > rest.hand[2];
  }, firearmRestPose);
  const firearmThrowPose = await page.evaluate(() => {
    const r = globalThis.primaryActionTest;
    return {
      hand: r.view.held.arms.get(r.dominant).position.toArray(),
      item: r.view.held.heldByHand.get(r.dominant).position.toArray(),
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
  const flightModelId = await page.waitForFunction((modelId) => {
    const { itemThrows } = globalThis.primaryActionTest;
    return itemThrows.activeCount > 0 && itemThrows.group.getObjectByName(modelId) ? modelId : false;
  }, loadedFirearm.modelId);
  assert.equal(
    await flightModelId.jsonValue(),
    loadedFirearm.modelId,
    'flight uses the firearm’s own ModelLibrary model',
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
  await page.waitForFunction(({ uid, lookKey }) => {
    const r = globalThis.primaryActionTest;
    const item = r.inventory.itemByUid(uid);
    return item && r.inventory.locate(item)?.kind === 'pile' && r.itemThrows.group.getObjectByName(lookKey);
  }, loadedRifle);
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
  await page.mouse.click(640, 450);
  await page.evaluate(() => globalThis.primaryActionTest.session.frame(0.1));
  await page.waitForFunction(({ uid, cases }) => {
    const r = globalThis.primaryActionTest;
    const count = [...r.inventory.piles.values()]
      .flatMap((p) => p.items)
      .filter(({ item }) => item.type === r.caseType)
      .reduce((sum, { item }) => sum + item.count, 0);
    return (
      count === cases + 1 && r.audio.heardSounds.some((sound) => sound.sourceLabel === r.inventory.itemByUid(uid)?.type)
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
  assert.ok(emission.flying > 0);
  assert.ok(emission.shot?.file);
  assert.equal(emission.shot?.distanceMetres, 0);
  assert.equal(emission.shot?.lowpassHz, null);
  await page.waitForFunction(() => !globalThis.primaryActionTest.inventory.hands.left.firearm?.cycle);
  await page.mouse.up({ button: 'right' });
  const food = await page.evaluate(() => {
    const r = globalThis.primaryActionTest;
    const item = [...r.inventory.items()].find(
      ({ item: candidate, location }) =>
        location.kind === 'pocket' && r.inventory.registry.items.get(candidate.type)?.food,
    )?.item;
    if (!item) {
      throw new Error('Quickbar fixture has no carried pocket food');
    }
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
  // The test-house fixture admits reading through ordinary safety, not an unsafe override.
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
      return sim.actions.job?.jobType === 'reading' && sim.actions.job.stopped && !sim.ignoreUnsafe;
    },
    undefined,
    { timeout: 10_000 },
  );
  const pryPreview = await page.evaluate(() => {
    const r = globalThis.primaryActionTest;
    r.session.sim.actions.cancel();
    const definition = r.inventory.registry.furniture.get('wood_door');
    const pos = r.feet();
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
    const hint = r.useText(door);
    r.useTarget(door);
    return { hint, job: r.session.sim.actions.job, doorUid: door.uid };
  });
  assert.ok(pryPreview.hint.toLowerCase().includes('crowbar'), 'the interaction hint names its carried prying tool');
  assert.equal(pryPreview.job?.jobType, 'pry', 'the door interaction starts the owned prying action');
  await page.waitForFunction(() => document.querySelector('#handling').hidden);
  await page.evaluate(() => {
    globalThis.primaryActionTest.hudOptions.handling = true;
  });
  await page.waitForFunction(() => {
    const root = document.querySelector('#handling');
    return !root.hidden && root.querySelector('.hd-bar');
  });
  const pryElapsed = await page.evaluate(() => {
    const { session } = globalThis.primaryActionTest;
    const { sim } = session;
    sim.frame(1);
    sim.actions.stop();
    const { job } = sim.actions;
    if (job?.jobType !== 'pry') {
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
    const fill = root.querySelector('.hd-fill');
    return (
      r.session.sim.actions.job?.jobType === 'pry' && !root.hidden && fill && Number.parseFloat(fill.style.width) > 0
    );
  });
  const resumedElapsed = await page.evaluate(() => globalThis.primaryActionTest.session.sim.actions.job.elapsed);
  assert.ok(resumedElapsed >= pryElapsed, 'resuming never moves the pry cursor backwards');
  const pryProgressText = await page.locator('#handling').textContent();
  assert.match(pryProgressText ?? '', /X pauses/);
  assert.doesNotMatch(pryProgressText ?? '', /Half speed/);
  await page.evaluate(() => {
    globalThis.primaryActionTest.hudOptions.handling = false;
  });
  await page.waitForFunction(() => document.querySelector('#handling').hidden);
  await page.evaluate(() => {
    globalThis.primaryActionTest.hudOptions.handling = true;
  });
  await page.waitForFunction(() => {
    const root = document.querySelector('#handling');
    const fill = root.querySelector('.hd-fill');
    return !root.hidden && fill && Number.parseFloat(fill.style.width) > 0;
  });
  const pryingScreenshot = resolve(projectRoot, 'test-results/primary-action/prying-progress.png');
  await mkdir(resolve(projectRoot, 'test-results/primary-action'), { recursive: true });
  await page.screenshot({ path: pryingScreenshot });
  await page.evaluate(() => globalThis.primaryActionTest.session.sim.actions.cancel());

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
      () => globalThis.primaryActionTest && document.querySelector('#overlay')?.hidden && document.pointerLockElement,
    );
    await lockedPage.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const door = [...r.inventory.entities.all].find((entity) => entity.lock?.locked);
      if (!door) {
        throw new Error('lock_test did not instantiate its locked door');
      }
      const aimAtDoor = () => {
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
        record: (line) => process.stderr.write(`${line}\\n`),
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
      'pry',
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
        record: (line) => process.stderr.write(`${line}\\n`),
      },
    );
    assert.equal(
      await lockedPage.evaluate(() => globalThis.primaryActionTest.session.sim.actions.job?.jobType),
      'pry',
      'the prying action remains active until interrupted',
    );
    const interruptionAt = await lockedPage.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const { session } = r;
      const { job } = session.sim.actions;
      if (job?.jobType !== 'pry') {
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
        record: (line) => process.stderr.write(`${line}\\n`),
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
    assert.equal(interruptedPry.job?.jobType, 'pry', 'an interruption keeps the prying job for resumption');
    assert.equal(interruptedPry.job?.stopped, true, 'an interruption stops prying without discarding its cursor');
    assert.ok(interruptedPry.job?.elapsed >= interruptionAt.elapsed, 'interruption time does not erase pry progress');
    assert.equal(interruptedPry.inputLocked, false, 'an interrupted prying action does not lock movement');
    assert.equal(interruptedPry.interruption, undefined, 'a prying interruption does not retain a blocking prompt');
    assert.match(interruptedPry.notice, /You hear something outside/, 'the interrupt reason remains visible');
    const positionBeforeMovement = await lockedPage.evaluate(() => [...globalThis.primaryActionTest.session.body.pos]);
    const releaseAfterInterruption = await holdAction(lockedPage, 'movement.right');
    try {
      await waitForSimulation(
        lockedPage,
        progressingSample,
        { start: await lockedPage.evaluate(() => globalThis.primaryActionTest.session.sim.time) },
        {
          seconds: 0.5,
          label: 'movement after a prying interruption',
          record: (line) => process.stderr.write(`${line}\\n`),
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
    process.stdout.write(`Locked-door input reproduction: ${JSON.stringify({ pryAction, interruptedPry })}\\n`);
  } finally {
    await lockedPage.close();
  }

  const treatment = await page.evaluate(() => {
    const r = globalThis.primaryActionTest;
    r.clearHand(r.dominant);
    r.clearHand(r.off);
    const rag = r.inventory.create('rag');
    r.setHand(r.dominant, rag);
    r.session.sim.body.impact(1, 'leftArm', { bleeding: true });
    r.session.sim.body.impact(3, 'rightArm', { bleeding: true });
    return { uid: rag.uid, initial: r.survival.selectedItemAction(rag)?.treatment?.region };
  });
  assert.equal(await page.locator('#prompt').evaluate((node) => node.hidden), true);
  await page.evaluate(() => {
    globalThis.primaryActionTest.hudOptions.interaction = true;
  });
  await page.waitForFunction(() => !document.querySelector('#prompt').hidden);
  const actionHint = await page.locator('#prompt').textContent();
  assert.equal((actionHint?.match(/›/g) ?? []).length, 1);
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
  await verifyGroundPickup(browser, address.port, renderOverride);
  const replayArtifact = JSON.parse(replayText);
  assert.equal(replayArtifact.magic, 'DEADVOX_REPLAY');
  assert(replayArtifact.frames.length > 0, 'export includes captured player ticks');
  assert(replayArtifact.actions.some((action) => action.action === 'throw.stance.toggle'));
  assert(replayArtifact.actions.some((action) => action.action === 'item.drop'));
  assert.match(replayArtifact.endStateFingerprint, /^[0-9a-f]{64}$/);
  const replayNavigation = page.waitForNavigation();
  await command('debug.input-replay-import');
  await page.locator('#input-replay-file').setInputFiles({
    name: 'input-replay.json',
    mimeType: 'application/json',
    buffer: Buffer.from(replayText),
  });
  await replayNavigation;
  await page.waitForFunction(() => document.querySelector('#debug-ui-root'));
  const replayCompletionTimeout = Math.ceil((replayArtifact.frames.length / 60) * 2000 + 10_000);
  await page.waitForFunction(
    () => {
      const state = document.querySelector('#input-replay-status')?.dataset.state;
      const error = document.querySelector('#errors')?.textContent ?? '';
      return (
        state === 'verified' || state === 'diverged' || state === 'unavailable' || error.startsWith('Replay rejected:')
      );
    },
    null,
    { timeout: replayCompletionTimeout },
  );
  const replayError = await page.locator('#errors').textContent();
  assert(!replayError?.startsWith('Replay rejected:'), `replay import failed: ${replayError}`);
  assert.equal(await page.locator('#input-replay-status').getAttribute('data-state'), 'diverged');

  assert.deepEqual(pageErrors, []);
  await verifyCleanLookReplay(browser, address.port, renderOverride);
  await verifyStanceThrowReplay(browser, address.port, renderOverride);
  await browser.close();
  browser = undefined;
  await checkDroppedGlowstickPixel(address.port);
  process.stdout.write(
    'Left native-form accepted launch passed with retained pointer-lock harness: physical hand actions, ground pickup and wield, door tap, grab animation, attachment, save identity, glowstick and loaded-firearm throws, refusals, firearm emission, quickbar hold, held-book reading, crowbar door route and clean mouse-look sample playback.\n',
  );
} finally {
  await browser?.close();
  await vite.close();
}
