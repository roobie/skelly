// biome-ignore-all lint/correctness/noNodejsModules: browser assertions run in Node.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative browser flow.
import assert from 'node:assert/strict';
import repairLook from '../../src/config/repair-look.json' with { type: 'json' };
import { holdAction, pressAction } from './input-actions.mjs';
import { dispatchMenuPointerMove } from './menu-pointer.mjs';
import { browserStageUrl } from './stage-mode.mjs';

export const worldRepairInGameFlow = async (page, origin) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const enter = async (enabled) => {
    await page.goto(
      browserStageUrl(
        'pump-handling',
        `${origin}/?debug=1&site=testHouse&repairLook=${enabled}&focus=${repairLook.furniture}&time=12%3A00&radius=64`,
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
    await page.waitForFunction(() => !document.querySelector('#furniture-radial').hidden);
    assert.equal(await page.locator('#item-action-list').count(), 0, 'no second furniture list');
    await page.evaluate(() => {
      const f = globalThis.pumpHandlingTest;
      const repair = f.furnitureActions(f.debugRepairTarget).find(({ id }) => id === 'repair');
      if (!repair) {
        throw new Error('Staged damaged furniture has no Repair action');
      }
      const { radiusPixels } = f.engine.registry.ui.values().next().value.furnitureRadial;
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          movementX: Math.sin(repair.angleRadians) * radiusPixels,
          movementY: -Math.cos(repair.angleRadians) * radiusPixels,
          bubbles: true,
        }),
      );
    });
    assert.equal(
      await page.evaluate(() => {
        const f = globalThis.pumpHandlingTest;
        return f.furnitureActionSelection.choice(f.debugRepairTarget, f.furnitureActions(f.debugRepairTarget))?.id;
      }),
      'repair',
    );
  } finally {
    await release();
  }
  await page.waitForFunction(() => globalThis.pumpHandlingTest.screen.isOpen);
  assert.equal(
    await page.evaluate(() => globalThis.pumpHandlingTest.screen.isOpen),
    true,
    'choosing Repair opens the character screen before any fixture starts work',
  );
  assert.equal(await page.evaluate(() => globalThis.pumpHandlingTest.screen.activeTab), 'repair');
  const pin = await page.evaluate(() => {
    const f = globalThis.pumpHandlingTest;
    return { uid: f.repairTargetUid, target: f.debugRepairTarget.uid };
  });
  assert.equal(pin.uid, pin.target, 'radial choice pins the target without another aiming step');
  const repairView = page.locator(`#crafting[data-repair-target="${pin.uid}"]`);
  assert.equal(await repairView.isVisible(), true, 'the requirements view shows the selected target');
  assert.equal(await page.locator('#inventory .inv-tab[data-tab="repair"][aria-selected="true"]').count(), 1);
  const recipeId = await page.evaluate(() => {
    const f = globalThis.pumpHandlingTest;
    return [...f.session.character.knownRecipes].find(
      (id) => f.engine.registry.recipes.get(id)?.repair?.entity === f.debugRepairTarget.type,
    );
  });
  const start = repairView.locator(`[data-recipe="${recipeId}"] .craft-start`);
  assert.equal(await start.getAttribute('aria-disabled'), 'false');
  assert.deepEqual(await page.evaluate(() => globalThis.pumpHandlingTest.session.inventory.snapshotState()), before);
  assert.equal(await page.evaluate(() => globalThis.pumpHandlingTest.session.sim.actions.job), undefined);

  const stockBefore = await page.evaluate(() =>
    [...globalThis.pumpHandlingTest.session.inventory.items()].map(({ item }) => ({
      type: item.type,
      count: item.count,
    })),
  );
  const condition = await page.evaluate(() => {
    const f = globalThis.pumpHandlingTest;
    return f.session.inventory.entities.conditionOf(f.debugRepairTarget);
  });
  await page.mouse.move(0, 0);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const box = await start.boundingBox();
  assert.ok(box, 'Start has a clickable layout box');
  const cursor = await page.evaluate(() => {
    const { input } = globalThis.pumpHandlingTest;
    return { x: input.cursorX, y: input.cursorY };
  });
  await page.evaluate(() => globalThis.pumpManualFrames.enable());
  await page.evaluate(dispatchMenuPointerMove, {
    canvasSelector: '#view',
    movementX: box.x + box.width / 2 - cursor.x,
    movementY: box.y + box.height / 2 - cursor.y,
  });
  assert.equal(
    await page.evaluate(() => {
      const { input } = globalThis.pumpHandlingTest;
      return Boolean(document.elementFromPoint(input.cursorX, input.cursorY)?.closest('#crafting .craft-start'));
    }),
    true,
    'drawn pointer reaches Start',
  );
  await page.mouse.click(0, 0);
  const started = await page.evaluate(() => {
    const f = globalThis.pumpHandlingTest;
    const result = globalThis.pumpManualFrames.until(() => f.session.sim.actions.job?.jobType === 'craft');
    const work = f.session.inventory.hands.right;
    return {
      reached: result.reached,
      job: f.session.sim.actions.job,
      notice: f.getNotice(),
      screenOpen: f.screen.isOpen,
      condition: f.session.inventory.entities.conditionOf(f.debugRepairTarget),
      actions: f.getReplayActions().filter(({ payload }) => payload?.kind === 'craft.repair-entity'),
      inputs: work?.work?.components.map(({ type, count }) => ({ type, count })),
      target: work?.work?.repairTarget,
      duration: work?.work?.duration,
      ratio: f.session.sim.clock.ratio,
    };
  });
  assert.equal(started.reached, true, `activating Start through the view begins work: ${JSON.stringify(started)}`);
  assert.equal(await page.evaluate(() => globalThis.pumpHandlingTest.screen.isOpen), false);
  assert.equal(await page.evaluate(() => globalThis.pumpHandlingTest.repairTargetUid), undefined);
  assert.deepEqual(started.target, { kind: 'entity', uid: pin.uid });
  const finished = await page.evaluate(({ duration, ratio }) => {
    const f = globalThis.pumpHandlingTest;
    const percents = [];
    const result = globalThis.pumpManualFrames.until(
      () => {
        const root = document.querySelector('#handling');
        const gauge = root.querySelector('[role="progressbar"]');
        if (!root.hidden && gauge && f.session.sim.actions.job?.jobType === 'craft') {
          percents.push(Number(gauge.getAttribute('aria-valuenow')));
        }
        return !f.session.sim.actions.job;
      },
      Math.ceil((duration / ratio) * 60) + 2,
    );
    return { ...result, percents };
  }, started);
  assert.equal(finished.reached, true, 'repair completes through normal player ticks');
  assert.ok(
    finished.percents.some((percent) => percent > 0 && percent < 100),
    `the repair arc moves before completion: ${JSON.stringify(finished.percents)}`,
  );
  const result = await page.evaluate(() => {
    const f = globalThis.pumpHandlingTest;
    return {
      condition: f.session.inventory.entities.conditionOf(f.debugRepairTarget),
      stock: [...f.session.inventory.items()].map(({ item }) => ({ type: item.type, count: item.count })),
      uid: f.debugRepairTarget.uid,
      hands: f.session.inventory.hands,
      actions: f.getReplayActions().filter(({ payload }) => payload?.kind === 'craft.repair-entity'),
    };
  });
  assert.equal(result.uid, pin.uid);
  assert.ok(condition < 1, 'the preview starts with visible damage');
  assert.equal(result.condition, 1, `the preview repair restores the pinned piece: ${JSON.stringify(started)}`);
  assert.ok(started.inputs.length > 0, 'the staged repair has material inputs');
  for (const type of new Set(started.inputs.map((item) => item.type))) {
    const count = (stock) => stock.filter((item) => item.type === type).reduce((sum, item) => sum + item.count, 0);
    assert.equal(
      count(stockBefore) - count(result.stock),
      count(started.inputs),
      'each escrowed material is spent once',
    );
  }
  assert.equal(result.actions.length, 1, 'the view records exactly one repair');
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
