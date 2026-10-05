// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract starts Vite and Chrome
// biome-ignore-all lint/performance/noAwaitInLoops: browser input selection must settle before the next keypress
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
      `
  const proof = {
    input, inventory, session, survival, debugTools, engine, caseEffects, audio, feet, performHandUse, quickbarActions,
    selectPrimaryAction, ignitionTargetForHand,
    dominant: 'left', off: 'right', frames: 0, swings: [], attachments: [], trackAttachment: false,
    getNotice: () => notice,
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
      return { uid: lighter.uid, charges: lighter.charges };
    }, side);
    if (trigger === 'click') {
      await page.mouse.click(640, 450);
    } else {
      await page.keyboard.press('Equal');
    }
    await page.waitForFunction((uid) => globalThis.primaryActionTest.inventory.itemByUid(uid)?.on === true, before.uid);
    const after = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      const lighter = r.inventory.itemByUid(uid);
      return { on: lighter?.on, charges: lighter?.charges, notice: r.getNotice() };
    }, before.uid);
    assert.equal(after.on, true, `${trigger} switches a lone held lighter on`);
    assert.equal(after.charges, before.charges, `${trigger} does not spend lighter fuel`);
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
    return { on: candle?.on, litAt: candle?.litAt, charges: matches?.charges, notice: r.getNotice() };
  }, ignition);
  assert.equal(lit.on, true, 'primary action lights the candle held opposite matches');
  assert.ok(lit.litAt > 0, 'the candle records its ignition time');
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
  const toggleLight = async (key, on) => {
    const before = await observe();
    if (key) {
      await page.keyboard.press(key);
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
  const attemptDuringHandling = async (actionSide, reservedHand, useMouse5 = false) => {
    await page.waitForFunction(() => {
      const combat = globalThis.primaryActionTest.session.playerCombat;
      return !combat.activeMeleeAction && combat.snapshotState().playerAttackWait === 0;
    });
    const outcome = await page.evaluate(
      ({ primarySide, reservationSide, forwardButton }) => {
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
      { primarySide: actionSide, reservationSide: reservedHand, forwardButton: useMouse5 },
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
    await page.keyboard.down('KeyW');
    await waitForSimulation(
      page,
      progressingSample,
      { start: before.time },
      {
        seconds: 0.35,
        label: 'render-free input and simulation witness',
        record: (line) => process.stderr.write(`${line}\n`),
        stop: () => page.keyboard.up('KeyW'),
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
  await page.keyboard.press('KeyH');
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
  await toggleLight('Equal', true);
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
  await toggleLight('Equal', false);
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
  assertHandlingRefusal(await attemptDuringHandling(roles.dominant, roles.off), 'held-weapon attack');
  assertHandlingRefusal(await attemptDuringHandling(roles.off, roles.dominant), 'off-hand primary action');
  const mouse5WhileHandling = await attemptDuringHandling(roles.off, roles.dominant, true);
  assert.equal(mouse5WhileHandling.inputActive, true, 'Mouse 5 is dispatched while the game owns input');
  assertHandlingRefusal(mouse5WhileHandling, 'off-hand instant action');
  await toggleLight('Equal', true);
  await toggleLight('Equal', false);
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
  await toggleLight('Equal', true);
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
  await page.keyboard.press('KeyB');
  assert.equal(await page.evaluate(() => globalThis.primaryActionTest.debugTools.buildOn), true);
  await page.keyboard.press('Equal');
  await nextFrame();
  const build = await observe();
  assert.equal(build.on, false);
  assert.deepEqual(build.swings, []);
  assert.ok(build.stamina >= blockedBefore.stamina);
  await page.keyboard.press('KeyB');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => globalThis.primaryActionTest.input.menuPointer), true);
  await page.keyboard.press('Equal');
  await nextFrame();
  const menu = await observe();
  assert.equal(menu.on, false);
  assert.deepEqual(menu.swings, []);
  assert.ok(menu.stamina >= blockedBefore.stamina);
  await page.keyboard.press('Tab');

  const firearm = await page.evaluate(async () => {
    const moduleUrl = '/src/game/firearmHandling.ts';
    const { firearmHandlingFor, spentCaseItemId } = await import(moduleUrl);
    const r = globalThis.primaryActionTest;
    const gun = r.inventory.create(r.types.gun);
    r.clearHand(r.off);
    r.setHand(r.dominant, gun);
    r.caseType = spentCaseItemId(firearmHandlingFor(gun, r.inventory.registry).calibre);
    return {
      uid: gun.uid,
      cases: [...r.inventory.piles.values()]
        .flatMap((p) => p.items)
        .filter(({ item }) => item.type === r.caseType)
        .reduce((sum, { item }) => sum + item.count, 0),
    };
  });
  await page.mouse.click(640, 450);
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
  await page.keyboard.down('Digit1');
  try {
    await page.waitForFunction(({ uid, count, heldUid }) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(uid);
      return (!item || item.count < count) && r.inventory.hands.left?.uid === heldUid;
    }, food);
  } finally {
    await page.keyboard.up('Digit1');
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
  await page.keyboard.press('KeyX');
  await page.waitForFunction(
    () => {
      const { sim } = globalThis.primaryActionTest.session;
      return sim.actions.job?.jobType === 'reading' && sim.actions.job.stopped && !sim.ignoreUnsafe;
    },
    undefined,
    { timeout: 10_000 },
  );
  assert.deepEqual(pageErrors, []);
  process.stdout.write(
    'Left native-form accepted launch passed with retained pointer-lock harness: physical hand actions, attachment, save identity, refusals, firearm emission, quickbar hold and held-book reading.\n',
  );
} finally {
  await browser?.close();
  await vite.close();
}
