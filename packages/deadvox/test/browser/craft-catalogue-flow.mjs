// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract shared by the inventory stage
// biome-ignore-all lint/performance/noAwaitInLoops: each step must land before the next one is judged
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { chooseHeldAction } from './action-menu.mjs';
import { holdAction, pressAction } from './input-actions.mjs';

/** The fixture's UI density, applied the way content owns it; never browser zoom. */
const densityOf = (page) =>
  page.evaluate(() => {
    const { session } = globalThis.foregripFitTest;
    const ui = [...session.inventory.registry.ui.values()].find((row) => row.capability === 'interface');
    return { hudScale: ui.hudScale, spacing: ui.spacing };
  });
const setDensity = (page, { hudScale, spacing }) =>
  page.evaluate(
    `async ([hudScale, spacing]) => {
      const { session } = globalThis.foregripFitTest;
      const ui = [...session.inventory.registry.ui.values()].find((row) => row.capability === 'interface');
      ui.hudScale = hudScale;
      ui.spacing = spacing;
      const { applyUiTokens } = await import('/@stage/@skelly/presentation/ui');
      const { productAssets } = await import('/src/product/assets.ts');
      applyUiTokens(session.inventory.registry, document.documentElement, {
        report: (message) => { throw new Error(message); },
        files: productAssets.cursors,
      });
    }`,
    [hudScale, spacing],
  );

/** The cold cost of the crafting context: the first open, from the bound key's dispatch to the first rendered page. */
const coldCraftOpenMs = async (page) =>
  page.evaluate(`async () => {
    const { inputBindings } = await import('/src/product/input.ts');
    const { code } = inputBindings.chords('ui.inventory-tab-crafting')[0];
    const key = { code, key: code.replace(/^Key/, '').toLowerCase(), bubbles: true };
    const start = performance.now();
    console.info('cold dispatch at', start);
    document.dispatchEvent(new KeyboardEvent('keydown', key));
    document.dispatchEvent(new KeyboardEvent('keyup', key));
    for (let frames = 0; frames < 300; frames += 1) {
      if (document.querySelector('.craft-query') && document.querySelector('[data-craft-result]') && document.querySelector('.craft-recipe')) {
        console.info('cold rendered at', performance.now());
        return performance.now() - start;
      }
      await new Promise(requestAnimationFrame);
    }
    throw new Error('the bound crafting key never rendered a first page');
  }`);

export const craftCatalogueFlow = async ({ page, url, resizeViewport, output, depicted = false }) => {
  page.on('console', (message) => {
    if (message.type() === 'info') {
      process.stdout.write(`page: ${message.text()}
`);
    }
  });
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  await page.locator('#go').click();
  await page.waitForFunction(
    () =>
      globalThis.foregripFitTest &&
      document.querySelector('#overlay')?.hidden &&
      document.querySelector('#world-loading')?.hidden &&
      document.querySelector('#world-loading')?.dataset.state === 'ready',
  );
  // The cold cost of the crafting context: the first open, from the bound key's dispatch to the first rendered page.
  // Spawn streaming can flip the world's ready flag more than once, and each flip re-runs the boot's replay-state
  // restore, which closes open screens; the cold dispatch waits for those flips to settle first.
  await page.evaluate(async () => {
    for (;;) {
      const flips = globalThis.foregripFitTest.readyFlips;
      let held = 0;
      while (held < 30) {
        await new Promise(requestAnimationFrame);
        held = globalThis.foregripFitTest.worldReady() ? held + 1 : 0;
      }
      if (globalThis.foregripFitTest.readyFlips === flips) {
        return;
      }
    }
  });
  const coldOpenMs = await coldCraftOpenMs(page);
  const limits = await page.evaluate(() => {
    const { session } = globalThis.foregripFitTest;
    const ui = [...session.inventory.registry.ui.values()].find((row) => row.capability === 'interface');
    return { ...ui.crafting, known: session.character.knownRecipes.size };
  });
  const fixtureDensity = await densityOf(page);
  assert.ok(limits.known > 1000, 'the look exercises a synthetic thousands-recipe catalogue');
  assert.ok((await page.locator('[data-craft-result]').count()) <= limits.pageSize);
  assert.ok((await page.locator('.craft-category-options button').count()) <= limits.facetPageSize);
  assert.ok((await page.locator('.craft-tag-options button').count()) <= limits.facetPageSize);
  if ((await page.locator('.craft-recipe').count()) !== 1) {
    const failed = await page.evaluate(() => ({
      closes: globalThis.foregripFitTest.closes ?? 0,
      readyFlips: globalThis.foregripFitTest.readyFlips,
      worldReady: globalThis.foregripFitTest.worldReady(),
      locked: globalThis.foregripFitTest.input.locked,
      menuPointer: globalThis.foregripFitTest.input.menuPointer,
      hidden: document.querySelector('#inventory')?.hidden,
      results: document.querySelectorAll('[data-craft-result]').length,
      query: Boolean(document.querySelector('.craft-query')),
    }));
    throw new Error(`first crafting review missing: ${JSON.stringify(failed)}`);
  }
  const activate = async (locator) => {
    await locator.focus();
    await pressAction(page, 'inventory.control-activate');
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const query = page.locator('.craft-query');
  await query.fill('synthetic');
  await activate(page.locator('.craft-catalogue .craft-pages button').last());
  const firstOnPage = await page.locator('[data-craft-result]').first().getAttribute('data-craft-result');
  await activate(page.locator('[data-craft-result]').first());
  const selected = await page.locator('.craft-recipe').getAttribute('data-recipe');
  assert.equal(selected, firstOnPage);
  await pressAction(page, 'ui.inventory-toggle');
  await pressAction(page, 'ui.inventory-tab-crafting');
  assert.equal(await query.inputValue(), 'synthetic');
  assert.equal(await page.locator('[data-craft-result]').first().getAttribute('data-craft-result'), firstOnPage);
  assert.equal(await page.locator('.craft-recipe').getAttribute('data-recipe'), selected);
  await query.fill('nothing-in-this-fixture');
  assert.equal(await page.locator('[data-craft-result]').count(), 0);
  assert.equal(await page.locator('.craft-empty').count(), 1);
  assert.equal(
    await page.locator('.craft-recipe').getAttribute('data-recipe'),
    selected,
    'empty results retain the pinned review',
  );
  const timings = await page.evaluate(() => {
    const field = document.querySelector('.craft-query');
    const measure = (value) => {
      const start = performance.now();
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#crafting').getBoundingClientRect();
      return performance.now() - start;
    };
    return { emptyToAllRenderMs: measure(''), narrowedFilterRenderMs: measure('Catalogue sample 0001') };
  });
  process.stdout.write(`craft catalogue timing ${JSON.stringify(timings)}\n`);
  await activate(page.locator('[data-craft-result="craft_look_result_1"]'));
  const group = page.locator('[data-craft-group="0"]');
  assert.ok(
    (await group.textContent()).includes('Wood look'),
    `automatic choice reflects competing stock, not the first alternative: ${await page.locator('.craft-recipe').textContent()}`,
  );
  await activate(group);
  assert.equal(await group.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('.craft-close-alternatives').count(), 1);
  const alternatives = await page.locator('.craft-alternatives').textContent();
  assert.equal(
    await page
      .locator('.craft-components')
      .last()
      .evaluate((row) => {
        const box = row.getBoundingClientRect();
        return row.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }),
    true,
    'the requirements row is unobscured by inventory chrome',
  );
  await page.locator('.craft-components').last().hover();
  assert.equal(
    await page.locator('.craft-alternatives').textContent(),
    alternatives,
    'hover never switches the fixed alternatives column',
  );
  await activate(page.locator('.craft-close-alternatives'));
  assert.equal(
    await group.evaluate((node) => node === document.activeElement),
    true,
    'close returns keyboard focus to the input row',
  );
  await activate(page.locator('.craft-sources summary'));
  assert.ok(
    (await page.locator('.craft-sources input').count()) >= 3,
    'liquid sources are below the rows and include competing vessels',
  );
  await query.fill('Catalogue sample 0002');
  await activate(page.locator('[data-craft-result="craft_look_result_2"]'));
  const start = page.locator('.craft-start');
  assert.equal(await start.getAttribute('aria-disabled'), 'true', 'the fixture missing tool refuses commitment');
  await start.focus();
  assert.equal(await start.evaluate((node) => node === document.activeElement), true);
  await query.fill('Catalogue sample 0001');
  await activate(page.locator('[data-craft-result="craft_look_result_1"]'));
  await query.fill('synthetic');
  await activate(page.locator('.craft-catalogue input[type="checkbox"]'));
  assert.ok((await page.locator('[data-craft-result]').count()) <= limits.pageSize, 'makeable results remain paged');
  await activate(page.locator('.craft-catalogue input[type="checkbox"]'));
  // Metadata facet search and an active branch/tag survive an empty query and remain removable.
  const categorySearch = page.locator('.craft-facets input').first();
  await categorySearch.fill('Branch 1');
  await activate(page.locator('.craft-category-options button').first());
  const tagSearch = page.locator('.craft-facets input').last();
  await tagSearch.fill('facet 1');
  await activate(page.locator('.craft-tag-options button').first());
  await query.fill('empty-fixture-filter');
  assert.ok((await page.locator('.craft-active-category').textContent()).includes('Branch 1'));
  assert.equal(await page.locator('.craft-active-tags button').count(), 1);
  await activate(page.locator('.craft-active-tags button'));
  await activate(page.locator('.craft-facets > button').first());
  await query.fill('Catalogue sample 0001');
  await activate(page.locator('[data-craft-result="craft_look_result_1"]'));
  await activate(group);
  await categorySearch.fill('');
  await tagSearch.fill('');
  if (output) {
    mkdirSync(output, { recursive: true });
  }
  await resizeViewport({ width: 900, height: 800 });
  const narrow = await page.locator('#crafting').boundingBox();
  assert.ok(narrow && narrow.width <= 900);
  if (output) {
    await page.locator('#crafting').screenshot({ path: join(output, 'crafting-narrow.png') });
  }
  await setDensity(page, { hudScale: 1.25, spacing: 1.25 });
  await resizeViewport({ width: 1100, height: 900 });
  const fit = await page.evaluate(() => {
    const strip = document.querySelector('.craft-commitment').getBoundingClientRect();
    const pane = document.querySelector('#crafting').getBoundingClientRect();
    return strip.bottom <= pane.bottom && strip.right <= pane.right && strip.left >= pane.left;
  });
  assert.equal(fit, true, 'commitment remains inside the enlarged-density review');
  if (output) {
    await page.locator('#crafting').screenshot({ path: join(output, 'crafting-enlarged.png') });
  }
  await worldWorkFlow({ page, resizeViewport, output, depicted, activate, fixtureDensity });
  return { ...limits, coldCraftOpenMs: coldOpenMs, ...timings };
};

/** Repair on the damaged chair and Take apart on the crate, reached from the spawn through the furniture ring. */
const worldWorkFlow = async ({ page, resizeViewport, output, depicted, activate, fixtureDensity }) => {
  await setDensity(page, fixtureDensity);
  await resizeViewport({ width: 1280, height: 720 });
  const panel = page.locator('#crafting');
  const fitsReview = () =>
    page.evaluate(() => {
      const pane = document.querySelector('#crafting').getBoundingClientRect();
      const inside = (node) => {
        const box = node?.getBoundingClientRect();
        return (
          Boolean(box) &&
          box.left >= pane.left - 0.5 &&
          box.right <= pane.right + 0.5 &&
          box.bottom <= pane.bottom + 0.5
        );
      };
      return {
        commitment: inside(document.querySelector('.craft-commitment')),
        turns: inside(document.querySelector('.craft-target-turn')),
        rows: inside(document.querySelector('.craft-requirements')),
        alternatives: inside(document.querySelector('.craft-alternatives')),
      };
    });
  const marker = () =>
    page.evaluate(() => {
      const node = document.activeElement;
      if (!node) {
        return null;
      }
      const scopes = [
        ['[data-craft-turn]', (hit) => `turn:${hit.dataset.craftTurn}`],
        ['[data-craft-group]', (hit) => `group:${hit.dataset.craftGroup}`],
        ['.craft-start', () => 'start'],
        ['.craft-close-alternatives', () => 'close-alternatives'],
        ['.craft-alternatives', () => 'alternative'],
        ['.craft-target', () => 'target-other'],
      ];
      const match = scopes.map(([selector, describe]) => [node.closest(selector), describe]).find(([hit]) => hit);
      return match ? match[1](match[0]) : 'screen';
    });
  const walkControls = async (untilMarker) => {
    const order = [];
    for (let steps = 0; steps < 40; steps += 1) {
      await pressAction(page, 'inventory.control-next');
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const current = await marker();
      if (order.at(-1) !== current) {
        order.push(current);
      }
      if (current === untilMarker) {
        return order;
      }
    }
    return order;
  };
  const runningWork = () => page.evaluate(() => Boolean(globalThis.foregripFitTest.session.sim.actions.job));
  const aim = async (type) => {
    const target = await page.evaluate((id) => {
      const { session, input, eye } = globalThis.foregripFitTest;
      const entity = [...session.inventory.entities.all].find((value) => value.type === id);
      if (!entity) {
        throw new Error(`fixture start lacks ${id}`);
      }
      const at = entity.pos.map((value, axis) => value + entity.size[axis] / 2);
      const origin = eye();
      const [dx, dy, dz] = at.map((value, axis) => value - origin[axis]);
      input.controls.yaw = Math.atan2(-dx, -dz);
      input.controls.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      return { uid: entity.uid, aim: [dx, dy, dz] };
    }, type);
    // The interaction ray is the player's real pick from the eye, so this is also the reach proof.
    try {
      await page.waitForFunction((id) => {
        const hit = globalThis.foregripFitTest.lookedAt();
        return hit?.kind === 'furniture' && hit.entity.type === id;
      }, type);
    } catch (error) {
      const state = await page.evaluate((id) => {
        const witness = globalThis.foregripFitTest;
        const hit = witness.lookedAt();
        return {
          aim: { yaw: witness.input.controls.yaw, pitch: witness.input.controls.pitch },
          eye: witness.eye(),
          feet: witness.session.sim.body.pos,
          hit: hit ? { kind: hit.kind, type: hit.entity?.type ?? hit.item?.type } : null,
          near: [...witness.session.inventory.entities.all]
            .map((entity) => ({ type: entity.type, pos: entity.pos, size: entity.size }))
            .filter(({ pos }) => Math.hypot(pos[0] + 7.5, pos[2] + 0.5) < 8),
        };
      }, type);
      throw new Error(`aim never reached ${type}: ${JSON.stringify(state)}`, { cause: error });
    }
    return target.uid;
  };
  const openWorldWork = async (type, operation) => {
    await aim(type);
    await page.evaluate(() => globalThis.foregripFitTest.input.lock());
    await chooseHeldAction(page, operation, 'world.interact');
    await page.waitForFunction(
      (op) =>
        !document.querySelector('#inventory').hidden &&
        document.querySelector('#inventory').dataset.tab === 'repair' &&
        document.querySelector('#crafting').dataset.worldOperation === op,
      operation,
    );
  };
  const checkTurnControls = async () => {
    const turnLeft = page.locator('[data-craft-turn="-1"]');
    const turnRight = page.locator('[data-craft-turn="1"]');
    assert.equal(await page.locator('[data-craft-turn]').count(), 2, 'the target turns through exactly two controls');
    assert.equal(
      await page.locator('.craft-target-canvas').count(),
      depicted ? 1 : 0,
      'the depiction exists only in a rendering run',
    );
    await activate(turnLeft);
    assert.equal(
      await turnLeft.evaluate((node) => node === document.activeElement),
      true,
      'turning keeps its focus on the turn control',
    );
    assert.equal(await page.locator('#inventory').isVisible(), true, 'inspection never closes the review');
    assert.equal(await runningWork(), false, 'inspection alone starts no work');
    if (depicted) {
      const pose = await page.locator('.craft-target-canvas').evaluate((canvas) => canvas.toDataURL());
      await activate(turnRight);
      assert.notEqual(
        await page.locator('.craft-target-canvas').evaluate((canvas) => canvas.toDataURL()),
        pose,
        'turning redraws the target depiction',
      );
    } else {
      await activate(turnRight);
    }
    assert.equal(await runningWork(), false, 'turning in either direction starts no work');
  };
  const checkFitAndShoot = async (name) => {
    await resizeViewport({ width: 900, height: 800 });
    assert.deepEqual(
      await fitsReview(),
      { commitment: true, turns: true, rows: true, alternatives: true },
      `${name} fits narrow`,
    );
    if (output) {
      await panel.screenshot({ path: join(output, `${name}-narrow.png`) });
    }
    await setDensity(page, { hudScale: 1.25, spacing: 1.25 });
    await resizeViewport({ width: 1100, height: 900 });
    assert.deepEqual(
      await fitsReview(),
      { commitment: true, turns: true, rows: true, alternatives: true },
      `${name} fits enlarged density`,
    );
    if (output) {
      await panel.screenshot({ path: join(output, `${name}-enlarged.png`) });
    }
    await setDensity(page, fixtureDensity);
    await resizeViewport({ width: 1280, height: 720 });
  };

  await pressAction(page, 'ui.inventory-toggle');
  await openWorldWork('chair', 'repair');
  assert.ok((await panel.getAttribute('aria-label'))?.length > 0, 'the pinned review heads with the piece');
  const repairOrder = await walkControls('start');
  assert.ok(repairOrder.includes('turn:-1') && repairOrder.includes('turn:1'), 'the turn controls are keyboard stops');
  assert.ok(repairOrder.indexOf('turn:-1') < repairOrder.indexOf('turn:1'), 'the turn controls follow reading order');
  assert.ok(
    repairOrder.findIndex((entry) => entry.startsWith('group:')) > repairOrder.indexOf('turn:1'),
    'inspection precedes the requirement rows',
  );
  assert.ok(repairOrder.indexOf('start') > repairOrder.indexOf('turn:1'), 'commitment follows the review');
  await checkTurnControls();
  const repairGroup = page.locator('[data-craft-group="0"]');
  await activate(repairGroup);
  assert.equal(await repairGroup.getAttribute('aria-expanded'), 'true');
  const repairAlternatives = await page.locator('.craft-alternatives').textContent();
  await page.locator('.craft-components').last().hover();
  assert.equal(
    await page.locator('.craft-alternatives').textContent(),
    repairAlternatives,
    'hover never switches the world-work alternatives column',
  );
  assert.equal(await repairGroup.getAttribute('aria-expanded'), 'true', 'hover leaves the chosen group open');
  await checkFitAndShoot('repair');
  await pressAction(page, 'ui.inventory-toggle');

  await openWorldWork('crate', 'take_apart');
  assert.ok((await page.locator('.craft-yield').count()) >= 1, 'take apart reviews its yield');
  assert.equal(await page.locator('[data-craft-group]').count(), 0, 'the yield rows are read-only');
  const takeApartOrder = await walkControls('start');
  assert.ok(
    takeApartOrder.includes('turn:-1') && takeApartOrder.includes('turn:1'),
    'the take-apart target turns through focused controls',
  );
  assert.ok(
    takeApartOrder.indexOf('turn:1') < takeApartOrder.indexOf('start'),
    'the take-apart commitment follows its review',
  );
  await checkTurnControls();
  await checkFitAndShoot('take-apart');
  await pressAction(page, 'ui.inventory-toggle');

  // A live refusal: the same chair, opened once the workbench stock is out of reach.
  await page.evaluate(() => {
    globalThis.foregripFitTest.input.lock();
    globalThis.foregripFitTest.input.controls.yaw = Math.PI / 2;
  });
  const walkWest = await holdAction(page, 'movement.forward');
  try {
    await page.waitForFunction((limit) => globalThis.foregripFitTest.session.sim.body.pos[0] <= limit, -10.6, {
      timeout: 20_000,
    });
  } finally {
    await walkWest();
  }
  await openWorldWork('chair', 'repair');
  const refusedStart = page.locator('.craft-start');
  assert.equal(
    await refusedStart.getAttribute('aria-disabled'),
    'true',
    'the repair with out-of-reach stock refuses commitment',
  );
  await refusedStart.focus();
  assert.equal(
    await refusedStart.evaluate((node) => node === document.activeElement),
    true,
    'a refused Start keeps focus',
  );
  const beforeRefusal = await runningWork();
  await pressAction(page, 'inventory.control-activate');
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await runningWork(), beforeRefusal, 'activating a refused Start starts no work');
  assert.equal(await page.locator('#inventory').isVisible(), true, 'the refused review stays open');
  assert.ok(
    ((await page.locator('.craft-reason').textContent()) ?? '').length > 0,
    'the refusal reason stays visible beside its Start',
  );
};
