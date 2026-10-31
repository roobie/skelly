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
  await page.mouse.move(800, 450);
  await page.waitForFunction((yaw) => globalThis.pumpHandlingTest.input.yaw !== yaw, pin.yaw);
  assert.equal(await page.evaluate(() => globalThis.pumpHandlingTest.repairTargetUid), pin.uid);
  assert.deepEqual(await page.evaluate(() => globalThis.pumpHandlingTest.session.inventory.snapshotState()), before);
  assert.equal(await page.evaluate(() => globalThis.pumpHandlingTest.session.sim.actions.job), undefined);

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
