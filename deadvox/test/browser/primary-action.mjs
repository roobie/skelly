// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract starts Vite and Chrome
// biome-ignore-all lint/performance/noAwaitInLoops: browser input selection must settle before the next keypress.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract uses Node assertions
// biome-ignore-all lint/style/noProcessEnv: runner controls the executable and source checkout for A/B tests
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { waitForSimulation } from './simulation-wait.mjs';
import { browserStageArgs, browserStageMode, browserStageUrl } from './stage-mode.mjs';

const { chromium } = await import('playwright');
const projectRoot = resolve(process.env.PRIMARY_ACTION_ROOT ?? fileURLToPath(new URL('../..', import.meta.url)));
const progressingSample = ({ start }) => {
  const { session } = globalThis.primaryActionTest;
  return { time: session.sim.time, paused: session.sim.paused, reached: session.sim.time - start >= 0.35 };
};
const observationPlugin = {
  name: 'primary-action-test-observation',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/game/play.ts')) {
      return;
    }
    const marker = '  const onForwardPress = (e: MouseEvent) => {';
    assert(code.includes(marker), 'game-loop observation point exists');
    return code.replace(
      marker,
      `  Object.assign(globalThis, { primaryActionTest: { input, inventory, session, survival, debugTools, engine, held: view.held, showNotice, getNotice: () => notice, feet, caseEffects, audio } });\n  const originalHeldUpdate = view.held.update.bind(view.held);\n  view.held.update = (main, pose, recoil, firearms) => {\n    originalHeldUpdate(main, pose, recoil, firearms);\n    const observed = globalThis.primaryActionObserved;\n    if (!observed?.trackLeftAttachment) return;\n    const internals = view.held;\n    const arm = internals.arms.get('left');\n    const item = internals.heldByHand.get('left');\n    if (!arm || !item) return;\n    const anchor = arm.getObjectByName('grip-anchor');\n    if (!anchor) return;\n    const hand = anchor.getWorldPosition(camera.position.clone());\n    const grip = item.getWorldPosition(camera.position.clone());\n    const handOrientation = arm.getWorldQuaternion(camera.quaternion.clone());\n    const itemOrientation = item.getWorldQuaternion(camera.quaternion.clone());\n    observed.attachments.push({\n      gap: grip.distanceTo(hand),\n      angle: itemOrientation.angleTo(handOrientation),\n      torsoYaw: pose?.torsoYaw ?? 0,\n      leftOffset: pose?.left?.offset ?? null,\n      leftRotation: pose?.left?.rotation ?? null,\n    });\n  };\n${marker}`,
    );
  },
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
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN,
    headless: true,
    args: browserStageArgs('primary-action', renderMode === 'pixel' ? ['--enable-webgl'] : [], renderOverride),
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      process.stderr.write(`browser console: ${message.text()}\\n`);
    }
  });
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
      `http://127.0.0.1:${address.port}/?debug=1&seed=73&radius=64&time=12:00&post=0&sunshadow=0&torchshadow=0`,
      renderOverride,
    ),
  );
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  assert.equal(await page.evaluate(() => Boolean(globalThis.primaryActionTest)), false, 'title has no actor');
  await page.locator('#go').click();
  await page.waitForFunction(() =>
    Boolean(
      globalThis.primaryActionTest && document.querySelector('#debug-ui-root') && document.querySelector('#view'),
    ),
  );
  try {
    await page.waitForFunction(() => document.querySelector('#overlay')?.hidden && document.pointerLockElement);
  } catch (error) {
    const startup = await page.evaluate(() => ({
      title: document.title,
      body: document.body.innerText,
      overlayHidden: document.querySelector('#overlay')?.hidden,
      view: Boolean(document.querySelector('#view')),
      errors: document.querySelector('#errors')?.textContent,
      audio: globalThis.primaryActionTest?.audio?.settings,
      pointerLock: Boolean(document.pointerLockElement),
    }));
    process.stderr.write(`startup errors: ${JSON.stringify(pageErrors)}; state: ${JSON.stringify(startup)}\\n`);
    throw error;
  }

  if (renderMode === 'render-free') {
    const before = await page.evaluate(() => ({
      time: globalThis.primaryActionTest.session.sim.time,
      feet: globalThis.primaryActionTest.feet(),
    }));
    await page.keyboard.down('KeyW');
    await waitForSimulation(
      page,
      progressingSample,
      { start: before.time },
      {
        seconds: 0.35,
        label: 'render-free input and simulation witness',
        record: (line) => process.stderr.write(`${line}\\n`),
        stop: () => page.keyboard.up('KeyW'),
      },
    );
    const witness = await page.evaluate(() => ({
      engineHasRenderer: Boolean(globalThis.primaryActionTest.engine.renderer),
      webglRequests: globalThis.renderFreeWitness.webglRequests,
      feet: globalThis.primaryActionTest.feet(),
    }));
    assert.equal(witness.engineHasRenderer, false, 'render-free engine has no renderer');
    assert.deepEqual(witness.webglRequests, [], 'render-free play never requests a WebGL context');
    assert.ok(
      Math.hypot(witness.feet[0] - before.feet[0], witness.feet[2] - before.feet[2]) > 0.01,
      'held forward input moves the player while simulation time advances',
    );
  }

  // Gunshots attract shamblers. Mortality is not this hand-action contract;
  // use the actual debug control and verify it (there is no god URL parameter).
  await page.keyboard.press('KeyH');
  assert.equal(
    await page.evaluate(() => globalThis.primaryActionTest.session.sim.godMode),
    true,
    'hand-action fixture is damage immune',
  );

  const loadoutMeleeUid = await page.evaluate(() => {
    const runtime = globalThis.primaryActionTest;
    const backpack = runtime.inventory.worn.back;
    const crowbar = backpack?.pockets?.[0]?.find(({ item }) => item.type === 'crowbar')?.item;
    if (!(backpack && crowbar)) {
      throw new Error('fresh debug loadout is missing its crowbar');
    }
    const moved = runtime.inventory.move(crowbar, { kind: 'hand', side: 'right' });
    if (!moved.ok) {
      throw new Error(`cannot move the debug-loadout crowbar into the right hand: ${moved.reason}`);
    }
    const swings = [];
    const originalBegin = runtime.session.playerCombat.beginMeleeSwing;
    const begin = originalBegin.bind(runtime.session.playerCombat);
    runtime.session.playerCombat.beginMeleeSwing = (start) => {
      const result = begin(start);
      const hand = runtime.session.playerCombat.activeMeleeAction?.hand ?? start.hand;
      swings.push({ result, profile: start.profile, hand });
      return result;
    };
    globalThis.primaryActionObserved = { swings, originalBegin };
    return crowbar.uid;
  });
  const loadoutBefore = await page.evaluate(() => globalThis.primaryActionTest.session.sim.needs.stamina);
  await page.mouse.click(640, 450);
  await page.waitForTimeout(150);
  const loadoutAction = await page.evaluate(() => ({
    rightHandItem: globalThis.primaryActionTest.inventory.hands.right?.type,
    rightHandUid: globalThis.primaryActionTest.inventory.hands.right?.uid,
    stamina: globalThis.primaryActionTest.session.sim.needs.stamina,
    swings: [...globalThis.primaryActionObserved.swings],
  }));
  await page.evaluate(() => {
    const runtime = globalThis.primaryActionTest;
    runtime.session.playerCombat.beginMeleeSwing = globalThis.primaryActionObserved.originalBegin;
  });
  assert.equal(loadoutAction.rightHandItem, 'crowbar');
  assert.equal(loadoutAction.rightHandUid, loadoutMeleeUid);
  assert.deepEqual(loadoutAction.swings[0], { result: true, profile: 'blunt', hand: 'right' });
  assert.ok(loadoutAction.stamina < loadoutBefore, 'the debug-loadout right-hand melee action spends stamina');
  await page.waitForFunction(() => !globalThis.primaryActionTest.session.playerCombat.activeMeleeAction, null, {
    timeout: 10_000,
  });

  const flashlightUid = await page.evaluate(() => {
    const runtime = globalThis.primaryActionTest;
    const flashlight = runtime.inventory.create('flashlight');
    Reflect.deleteProperty(runtime.inventory.hands, 'right');
    runtime.inventory.hands.left = flashlight;
    runtime.inventory.version += 1;
    globalThis.primaryActionObserved = {
      flashlightUid: flashlight.uid,
      swings: [],
      attachments: [],
      trackLeftAttachment: false,
    };
    const begin = runtime.session.playerCombat.beginMeleeSwing.bind(runtime.session.playerCombat);
    runtime.session.playerCombat.beginMeleeSwing = (start) => {
      const result = begin(start);
      const hand = runtime.session.playerCombat.activeMeleeAction?.hand ?? start.hand;
      globalThis.primaryActionObserved.swings.push({ result, profile: start.profile, hand });
      return result;
    };
    return flashlight.uid;
  });
  const observe = (uid) =>
    page.evaluate(
      (itemUid) => ({
        on: globalThis.primaryActionTest.inventory.itemByUid(itemUid)?.on ?? false,
        stamina: globalThis.primaryActionTest.session.sim.needs.stamina,
        swings: [...globalThis.primaryActionObserved.swings],
      }),
      uid,
    );

  await page.evaluate(() => {
    globalThis.primaryActionObserved.trackLeftAttachment = true;
  });
  const beforeRightJab = await observe(flashlightUid);
  await page.mouse.click(640, 450);
  await page.waitForTimeout(150);
  const afterRightJab = await observe(flashlightUid);
  await page.waitForFunction(
    () =>
      globalThis.primaryActionObserved.attachments.length >= 8 &&
      !globalThis.primaryActionTest.session.playerCombat.activeMeleeAction,
    null,
    { timeout: 10_000 },
  );
  const attachment = await page.evaluate(() => {
    const samples = globalThis.primaryActionObserved.attachments;
    return {
      count: samples.length,
      maxGap: Math.max(...samples.map(({ gap }) => gap)),
      maxAngle: Math.max(...samples.map(({ angle }) => angle)),
      maxTorsoYaw: Math.max(...samples.map(({ torsoYaw }) => Math.abs(torsoYaw))),
      movedLeftHand: samples.some(
        ({ leftOffset, leftRotation }) =>
          leftOffset?.some((value) => value !== 0) || leftRotation?.some((value) => value !== 0),
      ),
    };
  });
  await page.evaluate(() => {
    globalThis.primaryActionObserved.trackLeftAttachment = false;
  });
  assert.equal(afterRightJab.on, false, 'right-hand jab must not toggle the flashlight held in the left hand');
  assert.equal(
    afterRightJab.swings.length,
    1,
    `left-held flashlight click must make one right jab: ${JSON.stringify(afterRightJab)}`,
  );
  assert.deepEqual(afterRightJab.swings[0], { result: true, profile: 'fists', hand: 'right' });
  assert.ok(afterRightJab.stamina < beforeRightJab.stamina, 'the right jab spends stamina');
  assert.ok(attachment.count >= 8, `sampled the attachment through the swing: ${JSON.stringify(attachment)}`);
  assert.ok(attachment.maxTorsoYaw > 0.5, `the d7 fist torso yaw was exercised: ${JSON.stringify(attachment)}`);
  assert.equal(attachment.movedLeftHand, false, 'the held left hand stays in its hold pose');
  assert.ok(attachment.maxGap <= 0.001, `held item stays on its hand: ${JSON.stringify(attachment)}`);
  assert.ok(attachment.maxAngle < 1e-6, `held item follows the hand rotation: ${JSON.stringify(attachment)}`);

  await page.keyboard.press('Equal');
  await page.waitForTimeout(150);
  const leftOn = await observe(flashlightUid);
  assert.equal(leftOn.on, true, '`=` activates the left-hand flashlight');
  assert.deepEqual(leftOn.swings, afterRightJab.swings, '`=` on the light must not start melee');
  assert.ok(leftOn.stamina >= afterRightJab.stamina, '`=` on the light must not spend melee stamina');
  const lightRoundTrip = await page.evaluate(() => {
    const { inventory, session } = globalThis.primaryActionTest;
    const snapshot = session.snapshot({ worldId: 'primary-action-test', characterId: 'primary-action-test' });
    const restored = inventory.constructor.restoreState(inventory.registry, snapshot.character.inventory);
    return {
      lightUid: snapshot.character.lightUid,
      savedOn: snapshot.character.inventory.hands.left?.on ?? false,
      restoredOn: restored.hands.left?.on ?? false,
    };
  });
  assert.deepEqual(lightRoundTrip, { lightUid: flashlightUid, savedOn: true, restoredOn: true });
  await page.keyboard.press('Equal');
  await page.waitForTimeout(150);
  const leftOff = await observe(flashlightUid);
  assert.equal(leftOff.on, false, 'second `=` switches the left-hand flashlight off');
  assert.deepEqual(leftOff.swings, afterRightJab.swings);
  assert.ok(leftOff.stamina >= leftOn.stamina);

  await page.evaluate(() => {
    const { inventory } = globalThis.primaryActionTest;
    inventory.hands.right = inventory.create('baseball_bat');
    inventory.version += 1;
  });
  const beforeBat = await observe(flashlightUid);
  await page.mouse.click(640, 450);
  await page.waitForTimeout(150);
  const bothHands = await observe(flashlightUid);
  assert.equal(bothHands.on, false, 'right-hand bat action does not toggle the left-hand flashlight');
  assert.deepEqual(bothHands.swings[1], { result: true, profile: 'blunt', hand: 'right' });
  assert.ok(bothHands.stamina < beforeBat.stamina, 'the right-hand bat swing spends stamina');
  await page.waitForTimeout(1250);
  await page.keyboard.press('Equal');
  await page.waitForTimeout(150);
  const leftWithBat = await observe(flashlightUid);
  assert.equal(leftWithBat.on, true, '`=` still selects the left-hand flashlight beside a right-hand bat');
  assert.deepEqual(leftWithBat.swings, bothHands.swings);
  assert.ok(leftWithBat.stamina >= bothHands.stamina, '`=` with the left light spends no melee stamina');
  await page.keyboard.press('Equal');
  await page.waitForTimeout(150);
  assert.equal((await observe(flashlightUid)).on, false);

  await page.evaluate(() => {
    const { inventory } = globalThis.primaryActionTest;
    const flashlight = inventory.itemByUid(globalThis.primaryActionObserved.flashlightUid);
    Reflect.deleteProperty(inventory.hands, 'left');
    inventory.hands.right = flashlight;
    inventory.version += 1;
  });
  await page.mouse.click(640, 450);
  await page.waitForTimeout(150);
  const rightOn = await observe(flashlightUid);
  assert.equal(rightOn.on, true, 'left-click activates the right-hand flashlight');
  assert.deepEqual(rightOn.swings, bothHands.swings);
  assert.ok(rightOn.stamina >= bothHands.stamina);
  await page.mouse.click(640, 450);
  await page.waitForTimeout(150);
  const rightOff = await observe(flashlightUid);
  assert.equal(rightOff.on, false, 'left-click toggles the right-hand flashlight off');
  assert.deepEqual(rightOff.swings, bothHands.swings);
  assert.ok(rightOff.stamina >= rightOn.stamina);

  await page.evaluate(() => {
    const { inventory } = globalThis.primaryActionTest;
    const flashlight = inventory.itemByUid(globalThis.primaryActionObserved.flashlightUid);
    inventory.hands.left = flashlight;
    inventory.hands.right = inventory.create('rag');
    inventory.version += 1;
    globalThis.primaryActionObserved.swings = [];
  });
  const beforeUnsupported = await page.evaluate(() => globalThis.primaryActionTest.session.sim.needs.stamina);
  await page.mouse.click(640, 450);
  await page.waitForTimeout(150);
  const unsupported = await page.evaluate(() => ({
    swings: [...globalThis.primaryActionObserved.swings],
    stamina: globalThis.primaryActionTest.session.sim.needs.stamina,
    notice: globalThis.primaryActionTest.getNotice(),
  }));
  assert.deepEqual(unsupported.swings, [], 'an unsupported right-hand item must not fall back to fists');
  assert.ok(unsupported.stamina >= beforeUnsupported, 'an unsupported item must not spend melee stamina');
  assert.equal(unsupported.notice, 'Nothing to do with rag');
  await page.keyboard.press('Equal');
  await page.waitForTimeout(150);
  assert.equal(
    (await observe(flashlightUid)).on,
    true,
    '`=` uses the left item even when the right item is unsupported',
  );

  await page.evaluate(() => {
    const { inventory } = globalThis.primaryActionTest;
    Reflect.deleteProperty(inventory.hands, 'right');
    Reflect.deleteProperty(inventory.hands, 'left');
    inventory.version += 1;
    globalThis.primaryActionObserved.swings = [];
  });
  await page.mouse.click(640, 450);
  await page.waitForTimeout(150);
  const firstFist = await observe(flashlightUid);
  assert.equal(firstFist.swings.length, 1);
  assert.deepEqual(firstFist.swings[0], { result: true, profile: 'fists', hand: 'right' });
  await page.waitForFunction(() => !globalThis.primaryActionTest.session.playerCombat.activeMeleeAction, null, {
    timeout: 10_000,
  });
  await page.mouse.click(640, 450);
  await page.waitForTimeout(150);
  const secondFist = await observe(flashlightUid);
  assert.equal(secondFist.swings.length, 2);
  assert.deepEqual(secondFist.swings[1], { result: true, profile: 'fists', hand: 'left' });
  await page.waitForFunction(() => !globalThis.primaryActionTest.session.playerCombat.activeMeleeAction, null, {
    timeout: 10_000,
  });

  await page.evaluate(() => {
    const { inventory } = globalThis.primaryActionTest;
    Reflect.deleteProperty(inventory.hands, 'right');
    inventory.hands.left = inventory.create('flashlight');
    inventory.version += 1;
    globalThis.primaryActionObserved.swings = [];
  });
  const beforeBlocked = await page.evaluate(() => globalThis.primaryActionTest.session.sim.needs.stamina);
  await page.keyboard.press('KeyB');
  assert.equal(await page.evaluate(() => globalThis.primaryActionTest.debugTools.buildOn), true);
  await page.keyboard.press('Equal');
  await page.waitForTimeout(150);
  const buildBlocked = await page.evaluate(() => ({
    itemOn: globalThis.primaryActionTest.inventory.hands.left?.on ?? false,
    stamina: globalThis.primaryActionTest.session.sim.needs.stamina,
    swings: [...globalThis.primaryActionObserved.swings],
  }));
  assert.equal(buildBlocked.itemOn, false, 'debug build mode blocks the Equal action');
  assert.ok(buildBlocked.stamina >= beforeBlocked);
  assert.deepEqual(buildBlocked.swings, []);
  await page.keyboard.press('KeyB');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => globalThis.primaryActionTest.input.menuPointer), true);
  await page.keyboard.press('Equal');
  await page.waitForTimeout(150);
  const menuBlocked = await page.evaluate(() => ({
    itemOn: globalThis.primaryActionTest.inventory.hands.left?.on ?? false,
    stamina: globalThis.primaryActionTest.session.sim.needs.stamina,
    swings: [...globalThis.primaryActionObserved.swings],
  }));
  assert.equal(menuBlocked.itemOn, false, 'inventory menu blocks the Equal action');
  assert.ok(menuBlocked.stamina >= beforeBlocked);
  assert.deepEqual(menuBlocked.swings, []);
  await page.keyboard.press('Tab');

  const casesBeforeFirearm = await page.evaluate(() => {
    const { inventory } = globalThis.primaryActionTest;
    Reflect.deleteProperty(inventory.hands, 'left');
    inventory.hands.right = inventory.create('debug_rifle_assault');
    inventory.version += 1;
    return [...inventory.piles.values()]
      .flatMap((pile) => pile.items)
      .filter(({ item }) => item.type === 'spent_case_5_d_56x45')
      .reduce((sum, { item }) => sum + item.count, 0);
  });
  await page.mouse.click(640, 450);
  await page.waitForFunction((before) => {
    const { inventory } = globalThis.primaryActionTest;
    return (
      [...inventory.piles.values()]
        .flatMap((pile) => pile.items)
        .filter(({ item }) => item.type === 'spent_case_5_d_56x45')
        .reduce((sum, { item }) => sum + item.count, 0) ===
      before + 1
    );
  }, casesBeforeFirearm);
  await page.waitForFunction(() =>
    globalThis.primaryActionTest.audio.heardSounds.some(({ event }) => event === 'gunshot'),
  );
  const firearmAction = await page.evaluate(() => ({
    rifle: globalThis.primaryActionTest.inventory.hands.right?.type,
    flyingCases: globalThis.primaryActionTest.caseEffects.activeCount,
    gunshot: globalThis.primaryActionTest.audio.heardSounds.filter(({ event }) => event === 'gunshot').at(-1),
    cases: [...globalThis.primaryActionTest.inventory.piles.values()]
      .flatMap((pile) => pile.items)
      .filter(({ item }) => item.type === 'spent_case_5_d_56x45')
      .reduce((sum, { item }) => sum + item.count, 0),
  }));
  assert.equal(firearmAction.rifle, 'debug_rifle_assault');
  assert.equal(firearmAction.cases, casesBeforeFirearm + 1, 'debug primary action records one persistent case');
  assert.ok(firearmAction.flyingCases > 0, 'debug primary action also spawns a render-only flying case');
  assert.equal(firearmAction.gunshot?.event, 'gunshot');
  assert.match(firearmAction.gunshot?.file ?? '', /^assets\/audio\/gunshot-akm-0[12]\.ogg$/);
  assert.equal(firearmAction.gunshot?.sourceLabel, 'debug_rifle_assault');
  assert.equal(firearmAction.gunshot?.distanceMetres, 0, 'the player gunshot is head-locked, not left at the muzzle');
  assert.equal(firearmAction.gunshot?.lowpassHz, null, 'the player gunshot bypasses world occlusion');
  await page.waitForFunction(() => !globalThis.primaryActionTest.inventory.hands.right.firearm?.cycle);
  const beforeCock = await page.evaluate(() => ({
    uid: globalThis.primaryActionTest.inventory.hands.right.uid,
    danger: globalThis.primaryActionTest.debugTools.dangerReason() ?? null,
  }));
  await page.keyboard.press('Tab');
  const candidates = await page.locator('#inventory [data-uid]').count();
  assert.ok(candidates > 0, 'inventory exposes selectable items');
  // Wait for each keypress to reach the rendered inventory before reading selection again.
  for (let index = 0; index <= candidates; index += 1) {
    const selectedUid = await page.evaluate(
      () => document.querySelector('#inventory [data-uid].selected')?.getAttribute('data-uid') ?? null,
    );
    if (selectedUid === String(beforeCock.uid)) {
      break;
    }
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction((previousUid) => {
      const currentUid = document.querySelector('#inventory [data-uid].selected')?.getAttribute('data-uid');
      return typeof currentUid === 'string' && currentUid !== previousUid;
    }, selectedUid);
  }
  assert.equal(await page.locator(`#inventory [data-uid="${beforeCock.uid}"].selected`).count(), 1);
  const cockButton = page.getByRole('button', { name: /^Cock Assault rifle/ });
  assert.equal(await cockButton.count(), 1, 'held rifle Use label offers cocking, not an unsupported survival action');
  await page.keyboard.press('Digit1');
  await page.keyboard.press('KeyU');
  const inventoryCock = await page.evaluate(() => ({
    mode: globalThis.primaryActionTest.inventory.hands.right.firearm?.cycle?.mode,
    danger: globalThis.primaryActionTest.debugTools.dangerReason() ?? null,
    reason: globalThis.primaryActionTest.session.firearms.cockReason(
      globalThis.primaryActionTest.inventory.hands.right.uid,
    ),
  }));
  assert.equal(inventoryCock.mode, 'hand', 'inventory U must cock rather than dispatch the debug Danger test');
  assert.equal(inventoryCock.danger, beforeCock.danger, 'inventory U leaves debug Danger unchanged');
  assert.equal(inventoryCock.reason, 'Already handling something');
  await page.waitForFunction(() =>
    document.querySelector('.inv-details')?.textContent.includes('already handling something'),
  );
  await page.waitForFunction(() => !globalThis.primaryActionTest.inventory.hands.right.firearm?.cycle);
  assert.equal(
    await cockButton.count(),
    1,
    'cock availability redraws after completion without an inventory version change',
  );
  await page.keyboard.press('Tab');
  await page.keyboard.press('Digit1');
  assert.equal(
    await page.evaluate(() => globalThis.primaryActionTest.inventory.hands.right.firearm?.cycle?.mode),
    'hand',
    'already-held quickbar rifle uses the same cock command',
  );
  await page.waitForFunction(() => {
    const { inventory, session } = globalThis.primaryActionTest;
    if (session.sim.dead) {
      throw new Error(`Actor died during quickbar cock: ${session.sim.dead.cause}`);
    }
    return !inventory.hands.right.firearm?.cycle;
  });
  assert.deepEqual(pageErrors, [], `browser errors: ${pageErrors.join('; ')}`);
  process.stdout.write(
    'primary-action browser contract passed: hand bindings, attachment, unsupported hints, alternating fists, debug firearm cases, head-locked AKM shot audio, inventory-owned U/cock labels, and held quickbar cocking.\n',
  );
} finally {
  await browser?.close();
  await vite.close();
}
