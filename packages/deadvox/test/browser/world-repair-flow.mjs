// biome-ignore-all lint/correctness/noNodejsModules: browser assertions run in Node.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative browser flow.
// biome-ignore-all lint/performance/noAwaitInLoops: native wheel delivery must settle before the next choice.
import assert from 'node:assert/strict';
import { holdAction, pressAction } from './input-actions.mjs';
import { browserStageUrl } from './stage-mode.mjs';

export const worldRepairInGameFlow = async (page, origin) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    browserStageUrl(
      'pump-handling',
      `${origin}/?debug=1&site=testHouse&repairLook=1&focus=crate&time=12%3A00&radius=64`,
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
  await pressAction(page, 'world.interact');
  await page.waitForFunction(() => globalThis.pumpHandlingTest.screen.isOpen);
  assert.equal(await page.locator('#world-repair').isHidden(), true, 'tap keeps normal container use');
  await pressAction(page, 'ui.inventory-toggle');
  await page.waitForFunction(() => !globalThis.pumpHandlingTest.screen.isOpen);
  const openRepair = async () => {
    const release = await holdAction(page, 'world.interact');
    try {
      await page.waitForFunction(() => {
        const f = globalThis.pumpHandlingTest;
        return f.furnitureActionSelection.isOpen(f.debugRepairTarget);
      });
    } finally {
      await release();
    }
    assert.equal(await page.locator('#world-repair').isHidden(), true, 'hold opens choices, not the repair panel');
    const choices = await page.evaluate(() => {
      const f = globalThis.pumpHandlingTest;
      return f.furnitureActions(f.debugRepairTarget).map(({ id }) => id);
    });
    assert.ok(choices.includes('repair'), 'damaged target offers repair in the existing action list');
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
    assert.equal(await page.locator('#world-repair').isVisible(), true, 'choosing repair opens keyboard targeting');
  };
  await openRepair();
  const initial = await page.evaluate(() => {
    const f = globalThis.pumpHandlingTest;
    return { name: f.engine.registry.furniture.get(f.debugRepairTarget.type).name, yaw: f.input.yaw };
  });
  assert.ok(
    (await page.locator('#world-repair h3').textContent()).includes(initial.name),
    'spawn faces damaged target',
  );
  await page.evaluate(() => globalThis.pumpManualFrames.enable());
  await page.keyboard.down('ArrowRight');
  const aimed = await page.evaluate(
    (yaw) => globalThis.pumpManualFrames.until(() => globalThis.pumpHandlingTest.input.yaw !== yaw),
    initial.yaw,
  );
  await page.keyboard.up('ArrowRight');
  assert.equal(aimed.reached, true, 'the game loop advances keyboard aim without direct surface updates');
  const before = await page.evaluate(() => globalThis.pumpHandlingTest.session.inventory.snapshotState());
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-world-action="details"]').count(), 1);
  await page.keyboard.press('Enter');
  assert.ok((await page.locator('.craft-components').count()) > 0, 'live details reuse requirement presentation');
  assert.equal(await page.locator('[data-world-action="confirm"]').getAttribute('aria-disabled'), 'false');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  assert.equal(await page.locator('#world-repair').isHidden(), true, 'Back returns to live play');
  assert.deepEqual(await page.evaluate(() => globalThis.pumpHandlingTest.debugRepairIntents), []);
  await page.evaluate(() => globalThis.pumpManualFrames.disable());
  await openRepair();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-world-action="details"]').count(), 1, 'reopened targeting enters actions');
  await page.waitForFunction(() => globalThis.pumpHandlingTest.input.menuPointer);
  await page.keyboard.press('Enter');
  assert.equal(
    await page.locator('[data-world-action="confirm"]').getAttribute('aria-disabled'),
    'false',
    'reopened details still admit the pinned target',
  );
  await page.keyboard.press('Enter');
  const result = await page.evaluate(() => {
    const f = globalThis.pumpHandlingTest;
    return {
      intents: f.debugRepairIntents,
      target: f.debugRepairTarget.uid,
      job: f.session.sim.actions.job,
      context: f.repairSurface.context,
      focused: document.activeElement?.outerHTML,
      panel: document.querySelector('#world-repair')?.textContent,
    };
  });
  assert.equal(result.intents.length, 1, JSON.stringify(result));
  assert.equal(result.intents[0].kind, 'craft.repair-entity');
  assert.equal(result.intents[0].entityUid, result.target);
  assert.equal(result.job, undefined, 'debug confirmation does not dispatch repair work');
  assert.deepEqual(await page.evaluate(() => globalThis.pumpHandlingTest.session.inventory.snapshotState()), before);
  await page.evaluate(() => globalThis.pumpManualFrames.disable());
};

export const worldRepairFlow = async (page, origin) => {
  await page.goto(`${origin}/test/browser/world-repair.html`);
  await page.waitForFunction(() => Boolean(globalThis.worldRepairTest));
  await page.setViewportSize({ width: 360, height: 540 });
  const snapshot = () => page.evaluate(() => globalThis.worldRepairTest.inventory.snapshotState());
  const before = await snapshot();
  await page.locator('[data-enter-world]').click();
  assert.equal(await page.evaluate(() => globalThis.worldRepairTest.aimedEntity()), undefined);
  await page.locator('[data-fixture-text]').focus();
  const beforeTyping = await page.evaluate(() => globalThis.worldRepairTest.look.yaw);
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => globalThis.worldRepairTest.surface.update(2));
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Enter');
  assert.equal(
    await page.evaluate(() => globalThis.worldRepairTest.look.yaw),
    beforeTyping,
    'text focus keeps world aim',
  );
  await page.locator('[data-world-action="inspect"]').focus();
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => globalThis.worldRepairTest.surface.update(2));
  await page.keyboard.up('ArrowRight');
  assert.equal(
    await page.evaluate(() => {
      const f = globalThis.worldRepairTest;
      return f.aimedEntity() === f.target.uid;
    }),
    true,
    'keyboard reaches the initially un-aimed target with the ordinary ray',
  );
  await page.keyboard.down('Enter');
  const details = page.locator('[data-world-action="details"]');
  assert.equal(await details.evaluate((button) => button === document.activeElement), true);
  await page.keyboard.down('Enter');
  assert.equal(await page.locator('[data-world-action="confirm"]').count(), 0, 'held Enter does not enter details');
  await page.keyboard.up('Enter');
  await page.keyboard.press('ArrowDown');
  assert.equal(
    await page.locator('[data-world-action="back"]').evaluate((button) => button === document.activeElement),
    true,
  );
  await page.keyboard.down('Enter');
  assert.equal(await page.evaluate(() => globalThis.worldRepairTest.surface.context), 'world-targeting');
  await page.keyboard.down('Enter');
  assert.equal(
    await page.evaluate(() => globalThis.worldRepairTest.surface.context),
    'world-targeting',
    'held Enter on Back cannot re-enter service',
  );
  await page.keyboard.up('Enter');
  await page.keyboard.press('Enter');
  assert.equal(await details.evaluate((button) => button === document.activeElement), true);
  await page.keyboard.press('Enter');
  assert.ok((await page.locator('.craft-components').count()) > 0, 'details reuse requirement rows');
  const confirm = page.locator('[data-world-action="confirm"]');
  const geometry = await confirm.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return {
      focused: button === document.activeElement,
      visible: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
      hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === button,
    };
  });
  assert.deepEqual(
    geometry,
    { focused: true, visible: true, hit: true },
    'narrow detail action is focused and clickable',
  );
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  assert.deepEqual(await snapshot(), before, 'inspection and Back do not spend');
  assert.deepEqual(await page.evaluate(() => globalThis.worldRepairTest.intents), []);

  await page.locator('[data-enter-world]').click();
  await page.locator('[data-world-action="inspect"]').click();
  await details.click();
  await confirm.click();
  const mouseIntent = await page.evaluate(() => globalThis.worldRepairTest.intents[0]);
  assert.equal(mouseIntent.kind, 'craft.repair-entity');
  await page.locator('[data-enter-world]').click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => globalThis.worldRepairTest.intents), [mouseIntent, mouseIntent]);
  assert.deepEqual(await snapshot(), before, 'recording owner does not start work');

  await page.locator('[data-enter-world]').click();
  await page.keyboard.press('Enter');
  await page.keyboard.down('Enter');
  await page.evaluate(() => globalThis.dispatchEvent(new Event('blur')));
  assert.equal(await page.locator('#world-repair').isHidden(), true);
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  assert.equal(await page.evaluate(() => globalThis.worldRepairTest.intents.length), 2, 'focus return never confirms');
};
