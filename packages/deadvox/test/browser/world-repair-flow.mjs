// biome-ignore-all lint/correctness/noNodejsModules: browser assertions run in Node.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative browser flow.
// biome-ignore-all lint/performance/noAwaitInLoops: native wheel delivery must settle before the next choice.
import assert from 'node:assert/strict';
import { holdAction, pressAction } from './input-actions.mjs';
import { browserStageUrl } from './stage-mode.mjs';

export const worldRepairInGameFlow = async (page, origin) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const enter = async (repairLook) => {
    await page.goto(
      browserStageUrl(
        'pump-handling',
        `${origin}/?debug=1&site=testHouse&repairLook=${repairLook}&focus=crate&time=12%3A00&radius=64`,
      ),
      { waitUntil: 'domcontentloaded' },
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#go').click();
    await page.waitForFunction(
      () =>
        document.pointerLockElement &&
        document.querySelector('#overlay').hidden &&
        document.querySelector('#world-loading')?.dataset.state === 'ready',
    );
  };
  await enter(1);
  await pressAction(page, 'world.interact');
  await page.waitForFunction(() => globalThis.pumpHandlingTest.screen.isOpen);
  assert.equal(await page.locator('#world-repair').count(), 0, 'tap keeps normal container use');
  await pressAction(page, 'ui.inventory-toggle');
  await page.waitForFunction(() => !globalThis.pumpHandlingTest.screen.isOpen);
  const before = await page.evaluate(() => globalThis.pumpHandlingTest.session.inventory.snapshotState());
  const release = await holdAction(page, 'world.interact');
  try {
    await page.waitForFunction(() => {
      const f = globalThis.pumpHandlingTest;
      return f.furnitureActionSelection.isOpen(f.debugRepairTarget);
    });
  } finally {
    await release();
  }
  const choices = await page.evaluate(() => {
    const f = globalThis.pumpHandlingTest;
    return f.furnitureActions(f.debugRepairTarget).map(({ id }) => id);
  });
  assert.ok(choices.includes('repair'));
  for (const _choice of choices) {
    const selected = await page.evaluate(() => {
      const f = globalThis.pumpHandlingTest;
      return f.furnitureActionSelection.forItem(f.debugRepairTarget, f.furnitureActions(f.debugRepairTarget))?.id;
    });
    if (selected === 'repair') {
      break;
    }
    await page.mouse.wheel(0, 100);
    await page.waitForFunction((previous) => {
      const f = globalThis.pumpHandlingTest;
      return (
        f.furnitureActionSelection.forItem(f.debugRepairTarget, f.furnitureActions(f.debugRepairTarget))?.id !==
        previous
      );
    }, selected);
  }
  await pressAction(page, 'world.interact');
  const pin = await page.evaluate(() => {
    const f = globalThis.pumpHandlingTest;
    return { uid: f.repairTargetUid, target: f.debugRepairTarget.uid, yaw: f.input.yaw };
  });
  assert.equal(pin.uid, pin.target, 'held-list choice pins the target without another aiming step');
  await page.waitForFunction(() => {
    const f = globalThis.pumpHandlingTest;
    return f.input.locked && !f.input.menuPointer;
  });
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 120 })));
  assert.notEqual(await page.evaluate(() => globalThis.pumpHandlingTest.input.yaw), pin.yaw);
  assert.equal(await page.evaluate(() => globalThis.pumpHandlingTest.repairTargetUid), pin.uid);
  assert.deepEqual(await page.evaluate(() => globalThis.pumpHandlingTest.session.inventory.snapshotState()), before);
  assert.equal(await page.evaluate(() => globalThis.pumpHandlingTest.session.sim.actions.job), undefined);

  await page.evaluate(() => globalThis.pumpManualFrames.enable());
  const started = await page.evaluate(() => {
    const f = globalThis.pumpHandlingTest;
    const recipe = [...f.session.character.knownRecipes].find(
      (id) => f.engine.registry.recipes.get(id)?.repair?.entity === f.debugRepairTarget.type,
    );
    const condition = f.session.inventory.entities.conditionOf(f.debugRepairTarget);
    const refusal = f.repairSelection.start(recipe, f.repairTargetUid, {});
    const result = globalThis.pumpManualFrames.until(() => f.session.sim.actions.job?.jobType === 'craft');
    const work = f.session.inventory.hands.right;
    return {
      refusal,
      reached: result.reached,
      condition,
      target: work?.work?.repairTarget,
      duration: work?.work?.duration,
      ratio: f.session.sim.clock.ratio,
    };
  });
  assert.equal(started.refusal, undefined);
  assert.equal(started.reached, true);
  assert.deepEqual(started.target, { kind: 'entity', uid: pin.uid });
  const finished = await page.evaluate(({ duration, ratio }) => {
    const f = globalThis.pumpHandlingTest;
    return globalThis.pumpManualFrames.until(() => !f.session.sim.actions.job, Math.ceil((duration / ratio) * 60) + 2);
  }, started);
  assert.equal(finished.reached, true, 'repair completes through normal player ticks');
  const result = await page.evaluate(() => {
    const f = globalThis.pumpHandlingTest;
    return {
      condition: f.session.inventory.entities.conditionOf(f.debugRepairTarget),
      uid: f.debugRepairTarget.uid,
      hands: f.session.inventory.hands,
      actions: f.getReplayActions().filter(({ payload }) => payload?.kind === 'craft.repair-entity'),
    };
  });
  assert.equal(result.uid, pin.uid);
  assert.ok(result.condition > started.condition, 'repair improves the pinned piece');
  assert.equal(result.actions.length, 1, 'the start seam records exactly one repair');
  assert.equal(result.actions[0].payload.entityUid, pin.uid);
  assert.ok(!(result.hands.left || result.hands.right));
  await page.evaluate(() => globalThis.pumpManualFrames.disable());

  await enter(0);
  assert.equal(
    await page.evaluate(() => {
      const f = globalThis.pumpHandlingTest;
      return [...f.session.inventory.entities.all].some((entity) =>
        f.furnitureActions(entity).some(({ id }) => id === 'repair'),
      );
    }),
    false,
    'flag off exposes no repair entry',
  );
};
