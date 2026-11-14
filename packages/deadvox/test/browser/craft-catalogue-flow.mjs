// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract shared by the inventory stage
// biome-ignore-all lint/performance/noAwaitInLoops: each step must land before the next one is judged
// biome-ignore-all lint/correctness/noUnresolvedImports: page-evaluated imports address Vite URLs, not Node files.
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
    async (density) => {
      const { session } = globalThis.foregripFitTest;
      const ui = [...session.inventory.registry.ui.values()].find((row) => row.capability === 'interface');
      ui.hudScale = density.hudScale;
      ui.spacing = density.spacing;
      const { applyUiTokens } = await import('/@stage/@skelly/presentation/ui');
      const { productAssets } = await import('/src/product/assets.ts');
      applyUiTokens(session.inventory.registry, document.documentElement, {
        report: (message) => {
          throw new Error(message);
        },
        files: productAssets.cursors,
      });
    },
    { hudScale, spacing },
  );

/**
 * The drawn cursor stays above open panels while pointer lock is held (`packages/deadvox/INTERFACE.md`, "Layout"),
 * so a shot first parks it over a control, as a player would point, instead of wherever the last step left it.
 */
const parkCursorOn = async (page, locator, { drawn = false } = {}) => {
  const hidden = await page.locator('#game-cursor').evaluate((cursor) => cursor.hidden);
  assert.ok(!(drawn && hidden), 'world work keeps pointer lock, so its drawn cursor shows');
  if (hidden) {
    return;
  }
  const box = await locator.boundingBox();
  assert.ok(box, 'the control the cursor parks on is laid out');
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.evaluate(({ x, y }) => {
    const { input } = globalThis.foregripFitTest;
    input.moveMenuCursor(x - input.cursorX, y - input.cursorY);
  }, at);
  await page.waitForFunction(() => {
    const { input } = globalThis.foregripFitTest;
    const shown = new DOMMatrix(getComputedStyle(document.querySelector('#game-cursor')).transform);
    return Math.abs(shown.m41 - input.cursorX) < 0.5 && Math.abs(shown.m42 - input.cursorY) < 0.5;
  });
  assert.equal(
    await locator.evaluate((node) => {
      const { input } = globalThis.foregripFitTest;
      return node.contains(document.elementFromPoint(input.cursorX, input.cursorY));
    }),
    true,
    'the drawn cursor rests on the control before the shot',
  );
};

/** The cold cost of the crafting context: the first open, from the bound key's dispatch to the first rendered page. */
const coldCraftOpenMs = async (page) =>
  page.evaluate(async () => {
    const { inputBindings } = await import('/src/product/input.ts');
    const { code } = inputBindings.chords('ui.inventory-tab-crafting')[0];
    const key = {
      code,
      key: code.startsWith('Key') ? code.slice('Key'.length).toLowerCase() : code,
      bubbles: true,
    };
    const start = performance.now();
    document.dispatchEvent(new KeyboardEvent('keydown', key));
    document.dispatchEvent(new KeyboardEvent('keyup', key));
    for (let frames = 0; frames < 300; frames += 1) {
      if (
        document.querySelector('.craft-query') &&
        document.querySelector('[data-craft-result]') &&
        document.querySelector('.craft-recipe')
      ) {
        return performance.now() - start;
      }
      await new Promise(requestAnimationFrame);
    }
    throw new Error('the bound crafting key never rendered a first page');
  });

export const craftCatalogueFlow = async ({ page, url, resizeViewport, output, depicted = false }) => {
  // Every wait here follows a world boot or a frame, whose duration scales with machine load, so a Playwright timer
  // only turns a busy runner into a failure. A hung wait ends at the stage's outer `timeout`
  // (`packages/deadvox/package.json`, "test:ui-browser"); the world-work step lines name the stuck step.
  page.setDefaultTimeout(0);
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
  // The boot's ready transition applies the replay start state, whose non-replay default closes any open screen; a
  // player cannot have one open that early (input is gated until ready), so the cold dispatch waits for ready to hold.
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
    await parkCursorOn(page, start);
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
    await parkCursorOn(page, start);
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
      const queue = document.querySelector('.inv-queue').getBoundingClientRect();
      return {
        commitment: inside(document.querySelector('.craft-commitment')),
        turns: inside(document.querySelector('.craft-target-turn')),
        rows: inside(document.querySelector('.craft-requirements')),
        alternatives: inside(document.querySelector('.craft-alternatives')),
        queueBelow: queue.top >= pane.bottom - 0.5,
        headAbove: document.querySelector('.inv-head').getBoundingClientRect().bottom <= pane.top + 0.5,
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
      const origin = eye();
      // The fixture places its piece beside the spawn, but the base site may hold more of the same type further
      // away; the look's piece is the nearest one.
      const [nearest] = [...session.inventory.entities.all]
        .filter((value) => value.type === id)
        .map((piece) => ({ entity: piece, at: piece.pos.map((value, axis) => value + piece.size[axis] / 2) }))
        .sort(
          (a, b) =>
            a.at.reduce((sum, value, axis) => sum + (value - origin[axis]) ** 2, 0) -
            b.at.reduce((sum, value, axis) => sum + (value - origin[axis]) ** 2, 0),
        );
      if (!nearest) {
        throw new Error(`fixture start lacks ${id}`);
      }
      const { entity, at } = nearest;
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
      const state = await page.evaluate(() => {
        const witness = globalThis.foregripFitTest;
        const hit = witness.lookedAt();
        return {
          aim: { yaw: witness.input.controls.yaw, pitch: witness.input.controls.pitch },
          eye: witness.eye(),
          feet: witness.session.body.pos,
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
    const uid = await aim(type);
    await page.evaluate(() => globalThis.foregripFitTest.input.lock());
    process.stdout.write(`world work: ${operation} ${type} ring\n`);
    await chooseHeldAction(page, operation, 'world.interact');
    await page.waitForFunction(
      (op) =>
        !document.querySelector('#inventory').hidden &&
        document.querySelector('#inventory').dataset.tab === 'repair' &&
        document.querySelector('#crafting').dataset.worldOperation === op,
      operation,
    );
    return uid;
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
  // Nothing of the inventory screen sits behind the panel: its head stays above, its queue footer below.
  const fitted = { commitment: true, turns: true, rows: true, alternatives: true, queueBelow: true, headAbove: true };
  const checkFitAndShoot = async (name) => {
    await resizeViewport({ width: 900, height: 800 });
    assert.deepEqual(await fitsReview(), fitted, `${name} fits narrow`);
    if (output) {
      await parkCursorOn(page, page.locator('.craft-start'), { drawn: true });
      await panel.screenshot({ path: join(output, `${name}-narrow.png`) });
    }
    await setDensity(page, { hudScale: 1.25, spacing: 1.25 });
    await resizeViewport({ width: 1100, height: 900 });
    assert.deepEqual(await fitsReview(), fitted, `${name} fits enlarged density`);
    if (output) {
      await parkCursorOn(page, page.locator('.craft-start'), { drawn: true });
      await panel.screenshot({ path: join(output, `${name}-enlarged.png`) });
    }
    await setDensity(page, fixtureDensity);
    await resizeViewport({ width: 1280, height: 720 });
  };

  await pressAction(page, 'ui.inventory-toggle');
  const chair = await openWorldWork('chair', 'repair');
  assert.ok((await panel.getAttribute('aria-label'))?.length > 0, 'the pinned review heads with the piece');
  assert.equal(await panel.locator('.craft-condition').count(), 1, 'the repair review names the condition');
  const chairCondition = await page.evaluate(
    (uid) => globalThis.foregripFitTest.session.crafting.previewEntityRepair('craft_look_chair_repair', uid).condition,
    chair,
  );
  assert.notEqual(chairCondition.now, chairCondition.after, "one repair moves the look chair's condition band");
  assert.equal(await panel.locator('.craft-recipe h3').count(), 0, 'the world review does not repeat the panel head');
  assert.equal(await page.locator('#debug-center-x').isVisible(), false, 'the open screen hides the debug centre X');
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
  assert.equal(
    await page.locator('.craft-start').getAttribute('aria-disabled'),
    'false',
    `the fixture crate can be taken apart: ${await page.locator('.craft-reason').allTextContents()}`,
  );
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

  // A live refusal: the same chair, opened once the workbench stock is out of reach. The fixture stands the
  // chair and crate either side of the spawn's line directly away from the workbench face, so one straight walk
  // takes the stock beyond furniture reach while the work targets stay inside it, and the game's reach measure
  // gates the walk.
  const stockRay = () =>
    page.evaluate(async () => {
      const witness = globalThis.foregripFitTest;
      globalThis.reachLib ??= await import('/@stage/@skelly/engine/internal/core/reach.ts');
      const { furnitureDistance, reachTuning } = globalThis.reachLib;
      const player = {
        inventory: witness.session.inventory,
        position: witness.session.body.pos,
        blockSize: witness.blockSize,
      };
      const reach = reachTuning(player.inventory.registry).reachMetres;
      const of = (type) => {
        const [entity] = [...witness.session.inventory.entities.all]
          .filter((value) => value.type === type)
          .sort((a, b) => furnitureDistance(player, a) - furnitureDistance(player, b));
        return entity
          ? { distance: furnitureDistance(player, entity), pos: [...entity.pos], size: [...entity.size] }
          : undefined;
      };
      return { reach, chair: of('chair'), workbench: of('workbench') };
    });
  const start = await stockRay();
  assert.ok(
    start.workbench.distance <= start.reach,
    `the stock starts in reach: ${JSON.stringify({ reach: start.reach, chair: start.chair.distance, workbench: start.workbench.distance })}`,
  );
  await page.evaluate(() => {
    const witness = globalThis.foregripFitTest;
    const feet = witness.session.body.pos;
    const nearest = (type) =>
      [...witness.session.inventory.entities.all]
        .filter((value) => value.type === type)
        .sort(
          (a, b) =>
            Math.hypot(
              Math.max(Math.abs(a.pos[0] - feet[0]) - a.size[0] / 2, 0),
              Math.max(Math.abs(a.pos[2] - feet[2]) - a.size[2] / 2, 0),
            ) -
            Math.hypot(
              Math.max(Math.abs(b.pos[0] - feet[0]) - b.size[0] / 2, 0),
              Math.max(Math.abs(b.pos[2] - feet[2]) - b.size[2] / 2, 0),
            ),
        )[0];
    // The nearest point of each box, as the game's reach measure sees it.
    const face = (entity) => [
      Math.min(Math.max(feet[0], entity.pos[0]), entity.pos[0] + entity.size[0]),
      Math.min(Math.max(feet[2], entity.pos[2]), entity.pos[2] + entity.size[2]),
    ];
    const unit = ([x, z]) => {
      const length = Math.hypot(x, z);
      return [x / length, z / length];
    };
    const stock = face(nearest('workbench'));
    const [ux, uz] = unit([feet[0] - stock[0], feet[2] - stock[1]]);
    witness.input.controls.yaw = Math.atan2(-ux, -uz);
    witness.input.controls.pitch = 0;
    witness.input.lock();
  });
  const walk = await holdAction(page, 'movement.forward');
  try {
    await page.waitForFunction(
      () => {
        const witness = globalThis.foregripFitTest;
        const { furnitureDistance, reachTuning } = globalThis.reachLib;
        const player = {
          inventory: witness.session.inventory,
          position: witness.session.body.pos,
          blockSize: witness.blockSize,
        };
        const [workbench] = [...witness.session.inventory.entities.all]
          .filter((value) => value.type === 'workbench')
          .sort((a, b) => furnitureDistance(player, a) - furnitureDistance(player, b));
        return (
          workbench !== undefined &&
          furnitureDistance(player, workbench) > reachTuning(player.inventory.registry).reachMetres + 0.3
        );
      },
      undefined,
      { polling: 100 },
    );
  } finally {
    await walk();
  }
  const separated = await stockRay();
  const walkedTo = { reach: separated.reach, chair: separated.chair.distance, workbench: separated.workbench.distance };
  assert.ok(
    separated.workbench.distance > separated.reach + 0.3,
    `the walk takes the stock out of reach: ${JSON.stringify(walkedTo)}`,
  );
  assert.ok(
    separated.chair.distance < separated.reach - 0.3,
    `the chair stays within reach: ${JSON.stringify(walkedTo)}`,
  );
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
  await pressAction(page, 'ui.inventory-toggle');

  // A Start that commits: the crate stays in reach after the walk, and its take apart needs nothing from the stock.
  // Pressing it goes through the live input recorder, so a command the recorder cannot encode raises here.
  const crate = await openWorldWork('crate', 'take_apart');
  await activate(page.locator('.craft-start'));
  await new Promise((resolve, reject) => {
    const raised = (error) => {
      page.off('pageerror', raised);
      reject(new Error(`the take-apart Start raised: ${error.message}`));
    };
    page.on('pageerror', raised);
    page
      .waitForFunction((uid) => Boolean(globalThis.foregripFitTest.session.inventory.entities.byUid(uid)?.work), crate)
      .then(resolve, reject)
      .finally(() => page.off('pageerror', raised));
  });
  assert.equal(await runningWork(), true, 'the take-apart Start begins the work on the crate');
};
