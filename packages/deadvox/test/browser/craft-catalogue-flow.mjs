// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract shared by the inventory stage
// biome-ignore-all lint/performance/noAwaitInLoops: each step must land before the next one is judged
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { chooseHeldAction } from './action-menu.mjs';
import { holdAction, pressAction } from './input-actions.mjs';

/** @import { Locator, Page, ViewportSize } from 'playwright' */

/** @typedef {{ hudScale: number; spacing: number }} UiDensity */
/** @typedef {(viewport: ViewportSize) => Promise<void>} ResizeViewport */

/**
 * The fixture's UI density, applied the way content owns it; never browser zoom.
 * @param {Page} page
 */
const densityOf = (page) =>
  page.evaluate(() => {
    const { session } = globalThis.skellyPlayTest;
    const ui = [...session.inventory.registry.ui.values()].find((row) => row.capability === 'interface');
    if (!ui) {
      throw new Error('Content has no interface UI row');
    }
    return { hudScale: ui.hudScale, spacing: ui.spacing };
  });
/**
 * @param {Page} page
 * @param {UiDensity} density
 */
const setDensity = (page, { hudScale, spacing }) =>
  page.evaluate(
    async (density) => {
      const { session } = globalThis.skellyPlayTest;
      const ui = [...session.inventory.registry.ui.values()].find((row) => row.capability === 'interface');
      if (!ui) {
        throw new Error('Content has no interface UI row');
      }
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
 * @param {Page} page
 * @param {Locator} locator
 * @param {{ drawn?: boolean }} [options]
 */
const parkCursorOn = async (page, locator, { drawn = false } = {}) => {
  const hidden = await page.locator('#game-cursor').evaluate((/** @type {HTMLElement} */ cursor) => cursor.hidden);
  assert.ok(!(drawn && hidden), 'world work keeps pointer lock, so its drawn cursor shows');
  if (hidden) {
    return;
  }
  const box = await locator.boundingBox();
  assert.ok(box, 'the control the cursor parks on is laid out');
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.evaluate(({ x, y }) => {
    const { input } = globalThis.skellyPlayTest;
    input.moveMenuCursor(x - input.cursorX, y - input.cursorY);
  }, at);
  await page.waitForFunction(() => {
    const { input } = globalThis.skellyPlayTest;
    const cursor = document.querySelector('#game-cursor');
    if (!cursor) {
      return false;
    }
    const shown = new DOMMatrix(getComputedStyle(cursor).transform);
    return Math.abs(shown.m41 - input.cursorX) < 0.5 && Math.abs(shown.m42 - input.cursorY) < 0.5;
  });
  assert.equal(
    await locator.evaluate((node) => {
      const { input } = globalThis.skellyPlayTest;
      return node.contains(document.elementFromPoint(input.cursorX, input.cursorY));
    }),
    true,
    'the drawn cursor rests on the control before the shot',
  );
};

/**
 * The cold cost of the crafting context: the first open, from the bound key's dispatch to the first rendered page.
 * @param {Page} page
 */
const coldCraftOpenMs = async (page) =>
  page.evaluate(async () => {
    const { inputBindings } = await import('/src/product/input.ts');
    const [chord] = inputBindings.chords('ui.inventory-tab-crafting');
    if (!chord) {
      throw new Error('ui.inventory-tab-crafting has no bound chord');
    }
    const { code } = chord;
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

/**
 * @param {{
 *   page: Page;
 *   url: string;
 *   resizeViewport: ResizeViewport;
 *   output: string | undefined;
 *   depicted?: boolean;
 * }} options
 */
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
  await page.waitForFunction(() => {
    const overlay = document.querySelector('#overlay');
    const loading = document.querySelector('#world-loading');
    return (
      globalThis.skellyPlayTest &&
      overlay instanceof HTMLElement &&
      overlay.hidden &&
      loading instanceof HTMLElement &&
      loading.hidden &&
      loading.dataset.state === 'ready'
    );
  });
  // The cold cost of the crafting context: the first open, from the bound key's dispatch to the first rendered page.
  // The boot's ready transition applies the replay start state, whose non-replay default closes any open screen; a
  // player cannot have one open that early (input is gated until ready), so the cold dispatch waits for ready to hold.
  await page.evaluate(async () => {
    for (;;) {
      const flips = globalThis.foregripFitTest.readyFlips;
      let held = 0;
      while (held < 30) {
        await new Promise(requestAnimationFrame);
        held = globalThis.skellyPlayTest.worldLoading.ready ? held + 1 : 0;
      }
      if (globalThis.foregripFitTest.readyFlips === flips) {
        return;
      }
    }
  });
  const coldOpenMs = await coldCraftOpenMs(page);
  const limits = await page.evaluate(() => {
    const { session } = globalThis.skellyPlayTest;
    const ui = [...session.inventory.registry.ui.values()].find((row) => row.capability === 'interface');
    if (!ui) {
      throw new Error('Content has no interface UI row');
    }
    return { ...ui.crafting, known: session.character.knownRecipes.size };
  });
  const fixtureDensity = await densityOf(page);
  assert.ok(limits.known > 1000, 'the look exercises a synthetic thousands-recipe catalogue');
  assert.ok((await page.locator('[data-craft-result]').count()) <= limits.pageSize);
  assert.ok((await page.locator('.craft-category-options button').count()) <= limits.facetPageSize);
  assert.ok((await page.locator('.craft-tag-options button').count()) <= limits.facetPageSize);
  if ((await page.locator('.craft-recipe').count()) !== 1) {
    const failed = await page.evaluate(() => {
      const inventory = document.querySelector('#inventory');
      return {
        closes: globalThis.foregripFitTest.closes,
        readyFlips: globalThis.foregripFitTest.readyFlips,
        worldReady: globalThis.skellyPlayTest.worldLoading.ready,
        locked: globalThis.skellyPlayTest.input.locked,
        menuPointer: globalThis.skellyPlayTest.input.menuPointer,
        hidden: inventory instanceof HTMLElement ? inventory.hidden : undefined,
        results: document.querySelectorAll('[data-craft-result]').length,
        query: Boolean(document.querySelector('.craft-query')),
      };
    });
    throw new Error(`first crafting review missing: ${JSON.stringify(failed)}`);
  }
  /** @param {Locator} locator */
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
    const crafting = document.querySelector('#crafting');
    if (!(field instanceof HTMLInputElement && crafting)) {
      throw new Error('The crafting pane or its query field is missing');
    }
    /** @param {string} value */
    const measure = (value) => {
      const start = performance.now();
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      crafting.getBoundingClientRect();
      return performance.now() - start;
    };
    return { emptyToAllRenderMs: measure(''), narrowedFilterRenderMs: measure('Catalogue sample 0001') };
  });
  process.stdout.write(`craft catalogue timing ${JSON.stringify(timings)}\n`);
  await activate(page.locator('[data-craft-result="craft_look_result_1"]'));
  const group = page.locator('[data-craft-group="0"]');
  assert.ok(
    ((await group.textContent()) ?? '').includes('Wood look'),
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
  const makeable = page.locator('.craft-catalogue input[type="checkbox"]:not(.craft-all-known)');
  const allKnown = page.locator('.craft-all-known');
  await activate(makeable);
  assert.ok((await page.locator('[data-craft-result]').count()) <= limits.pageSize, 'makeable results remain paged');
  await activate(makeable);
  // The all-known view lists a known recipe the working list never shows, here the look's chair repair, and drops the
  // facet column because its filters do not apply there (`packages/deadvox/INTERFACE.md`, "Layout").
  const chairName = await page.evaluate(() => {
    const chair = globalThis.skellyPlayTest.session.inventory.registry.furniture.get('chair');
    if (!chair) {
      throw new Error('Content has no chair furniture');
    }
    return chair.name;
  });
  const chairRepair = page.locator('[data-craft-result="craft_look_chair_repair"]');
  await query.fill(chairName);
  assert.equal(await chairRepair.count(), 0, 'the working list leaves furniture repair to its own surface');
  await activate(allKnown);
  assert.equal(await page.locator('.craft-facets').isVisible(), false, 'all-known hides the facet column');
  assert.equal(await chairRepair.count(), 1, 'all-known lists a known furniture repair');
  await activate(chairRepair);
  assert.ok(
    ((await page.locator('.craft-reason').textContent()) ?? '').length > 0,
    'a recipe that starts elsewhere reviews with a reason',
  );
  await activate(allKnown);
  assert.equal(await page.locator('.craft-facets').isVisible(), true, 'unticking all-known restores the facet column');
  await query.fill('synthetic');
  // Metadata facet search and an active branch/tag survive an empty query and remain removable.
  const categorySearch = page.locator('.craft-facets input').first();
  await categorySearch.fill('Branch 1');
  await activate(page.locator('.craft-category-options button').first());
  const tagSearch = page.locator('.craft-facets input').last();
  await tagSearch.fill('facet 1');
  await activate(page.locator('.craft-tag-options button').first());
  await query.fill('empty-fixture-filter');
  assert.ok(((await page.locator('.craft-active-category').textContent()) ?? '').includes('Branch 1'));
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
    const commitment = document.querySelector('.craft-commitment');
    const crafting = document.querySelector('#crafting');
    if (!(commitment && crafting)) {
      throw new Error('The crafting pane or its commitment strip is missing');
    }
    const strip = commitment.getBoundingClientRect();
    const pane = crafting.getBoundingClientRect();
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

/**
 * Repair on the damaged chair and Take apart on the crate, reached from the spawn through the furniture ring.
 * @param {{
 *   page: Page;
 *   resizeViewport: ResizeViewport;
 *   output: string | undefined;
 *   depicted: boolean;
 *   activate: (locator: Locator) => Promise<void>;
 *   fixtureDensity: UiDensity;
 * }} options
 */
const worldWorkFlow = async ({ page, resizeViewport, output, depicted, activate, fixtureDensity }) => {
  await setDensity(page, fixtureDensity);
  await resizeViewport({ width: 1280, height: 720 });
  const panel = page.locator('#crafting');
  const fitsReview = () =>
    page.evaluate(() => {
      const crafting = document.querySelector('#crafting');
      const queueNode = document.querySelector('.inv-queue');
      const head = document.querySelector('.inv-head');
      if (!(crafting && queueNode && head)) {
        throw new Error('The crafting pane, the queue or the inventory head is missing');
      }
      const pane = crafting.getBoundingClientRect();
      /** @param {Element | null} node */
      const inside = (node) => {
        const box = node?.getBoundingClientRect();
        return (
          box !== undefined &&
          box.left >= pane.left - 0.5 &&
          box.right <= pane.right + 0.5 &&
          box.bottom <= pane.bottom + 0.5
        );
      };
      const queue = queueNode.getBoundingClientRect();
      return {
        commitment: inside(document.querySelector('.craft-commitment')),
        turns: inside(document.querySelector('.craft-target-turn')),
        rows: inside(document.querySelector('.craft-requirements')),
        alternatives: inside(document.querySelector('.craft-alternatives')),
        queueBelow: queue.top >= pane.bottom - 0.5,
        headAbove: head.getBoundingClientRect().bottom <= pane.top + 0.5,
      };
    });
  const marker = () =>
    page.evaluate(() => {
      const node = document.activeElement;
      if (!node) {
        return null;
      }
      /** @type {[string, (hit: HTMLElement) => string][]} */
      const scopes = [
        ['[data-craft-turn]', (hit) => `turn:${hit.dataset.craftTurn}`],
        ['[data-craft-group]', (hit) => `group:${hit.dataset.craftGroup}`],
        ['.craft-start', () => 'start'],
        ['.craft-close-alternatives', () => 'close-alternatives'],
        ['.craft-alternatives', () => 'alternative'],
        ['.craft-target', () => 'target-other'],
      ];
      for (const [selector, describe] of scopes) {
        const hit = node.closest(selector);
        if (hit instanceof HTMLElement) {
          return describe(hit);
        }
      }
      return 'screen';
    });
  /** @param {string} untilMarker */
  const walkControls = async (untilMarker) => {
    /** @type {(string | null)[]} */
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
  const runningWork = () => page.evaluate(() => Boolean(globalThis.skellyPlayTest.session.sim.actions.job));
  /** @param {string} type */
  const aim = async (type) => {
    const target = await page.evaluate((id) => {
      const { session, input, eye } = globalThis.skellyPlayTest;
      const [ox, oy, oz] = eye();
      // The fixture places its piece beside the spawn, but the base site may hold more of the same type further
      // away; the look's piece is the nearest one.
      const [nearest] = [...session.inventory.entities.all]
        .filter((value) => value.type === id)
        .map((piece) => {
          const [x, y, z] = piece.pos;
          const [w, h, d] = piece.size;
          /** @type {[number, number, number]} */
          const offset = [x + w / 2 - ox, y + h / 2 - oy, z + d / 2 - oz];
          return { entity: piece, offset };
        })
        .sort(
          (a, b) =>
            a.offset.reduce((sum, value) => sum + value ** 2, 0) - b.offset.reduce((sum, value) => sum + value ** 2, 0),
        );
      if (!nearest) {
        throw new Error(`fixture start lacks ${id}`);
      }
      const { entity, offset } = nearest;
      const [dx, dy, dz] = offset;
      input.controls.yaw = Math.atan2(-dx, -dz);
      input.controls.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      return { uid: entity.uid, aim: [dx, dy, dz] };
    }, type);
    // The interaction ray is the player's real pick from the eye, so this is also the reach proof.
    try {
      await page.waitForFunction((id) => {
        const hit = globalThis.skellyPlayTest.interactionTargetAt();
        return hit?.kind === 'furniture' && hit.entity.type === id;
      }, type);
    } catch (error) {
      const state = await page.evaluate(() => {
        const witness = globalThis.skellyPlayTest;
        const hit = witness.interactionTargetAt();
        /** @param {import('@skelly/engine/sim').InteractionTarget} looked */
        const hitType = (looked) => {
          if (looked.kind === 'furniture') {
            return looked.entity.type;
          }
          return looked.kind === 'item' ? looked.item.type : undefined;
        };
        return {
          aim: { yaw: witness.input.controls.yaw, pitch: witness.input.controls.pitch },
          eye: witness.eye(),
          feet: witness.session.body.pos,
          hit: hit ? { kind: hit.kind, type: hitType(hit) } : null,
          near: [...witness.session.inventory.entities.all]
            .map((entity) => ({ type: entity.type, pos: entity.pos, size: entity.size }))
            .filter(({ pos }) => Math.hypot(pos[0] + 7.5, pos[2] + 0.5) < 8),
        };
      }, type);
      throw new Error(`aim never reached ${type}: ${JSON.stringify(state)}`, { cause: error });
    }
    return target.uid;
  };
  /**
   * @param {string} type
   * @param {string} operation
   */
  const openWorldWork = async (type, operation) => {
    const uid = await aim(type);
    await page.evaluate(() => globalThis.skellyPlayTest.input.lock());
    process.stdout.write(`world work: ${operation} ${type} ring\n`);
    await chooseHeldAction(page, operation, 'world.interact');
    await page.waitForFunction((op) => {
      const inventory = document.querySelector('#inventory');
      const crafting = document.querySelector('#crafting');
      return (
        inventory instanceof HTMLElement &&
        crafting instanceof HTMLElement &&
        !inventory.hidden &&
        inventory.dataset.tab === 'repair' &&
        crafting.dataset.worldOperation === op
      );
    }, operation);
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
      const depiction = page.locator('.craft-target-canvas');
      const pose = await depiction.evaluate((/** @type {HTMLCanvasElement} */ canvas) => canvas.toDataURL());
      await activate(turnRight);
      assert.notEqual(
        await depiction.evaluate((/** @type {HTMLCanvasElement} */ canvas) => canvas.toDataURL()),
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
  /** @param {string} name */
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

  // Each container's title in "Around you" leads with its own condition blip, and only the selected item's card names a
  // band word; the look's crate stands worn.
  // The catalogue leaves focus on one of its controls, which would take the tab key as text.
  await page.evaluate(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement) {
      focused.blur();
    }
  });
  await pressAction(page, 'ui.inventory-tab-items');
  await page.waitForFunction(() => {
    const inventory = document.querySelector('#inventory');
    return inventory instanceof HTMLElement && inventory.dataset.tab === 'items';
  });
  const around = page.locator('#inventory [data-pane="around"]');
  await page.waitForFunction(() => document.querySelector('#inventory [data-pane="around"] label .condition-mark'));
  const titles = await page.evaluate(() => {
    const { session } = globalThis.skellyPlayTest;
    const { registry, entities } = session.inventory;
    const tuning = [...registry.inventory.values()].find((row) => row.capability === 'player');
    if (!tuning) {
      throw new Error('Content has no player inventory tuning');
    }
    return [...document.querySelectorAll('#inventory [data-pane="around"] label')]
      .filter((label) => label.querySelector('[data-put-target^="furniture:"]'))
      .map((label) => {
        const target = label.querySelector('[data-put-target]');
        const uid = Number(target instanceof HTMLElement ? target.dataset.putTarget?.split(':')[1] : undefined);
        const entity = entities.byUid(uid);
        if (!entity) {
          throw new Error(`No furniture ${uid} stands behind its "Around you" title`);
        }
        const condition = entities.conditionOf(entity);
        const band = tuning.conditionBands.findLast(({ from }) => from <= condition);
        if (!band) {
          throw new Error(`No condition band holds ${condition}`);
        }
        const blip = label.querySelector('.condition-blip');
        return {
          type: entity.type,
          worn: condition < 1,
          blip: blip instanceof HTMLElement ? blip.style.getPropertyValue('--blip') : undefined,
          color: band.color,
        };
      });
  });
  assert.ok(titles.length > 0, 'containers stand around the look');
  for (const title of titles) {
    assert.equal(title.blip, title.color, `the ${title.type} title shows its own band's blip`);
  }
  assert.ok(
    titles.some((title) => title.worn),
    'a worn container stands around the look',
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [...document.querySelectorAll('#inventory .condition-mark')]
        .filter((mark) => !mark.closest('.inv-details'))
        .map((mark) => mark.textContent)
        .filter((shown) => shown !== ''),
    ),
    [],
    "no band word shows outside the selected item's card",
  );
  if (output) {
    // A hidden pane would hold the shot open, so it fails here instead.
    assert.ok(await around.isVisible(), 'the "Around you" pane shows for its shot');
    await around.screenshot({ path: join(output, 'around-container-titles.png') });
  }
  // The crosshair shows every looked-at piece and block with its condition blip alone, the top band included
  // (`packages/deadvox/INTERFACE.md`, "Condition"); the look's lamp, fridge and workbench stand intact. Hints hide
  // under an open screen, so this runs once the screen is closed.
  await pressAction(page, 'ui.inventory-toggle');
  await page.evaluate(() => globalThis.skellyPlayTest.input.lock());
  const prompt = page.locator('#prompt');
  let hintBoxChecked = false;
  const assertHintBoxClear = async () =>
    assert.deepEqual(
      await prompt.evaluate((hint) => {
        const quickbarElement = document.getElementById('quickbar');
        const crosshairElement = document.getElementById('crosshair');
        if (!(quickbarElement && crosshairElement)) {
          throw new Error('The quickbar or the crosshair is missing');
        }
        const quickbar = quickbarElement.getBoundingClientRect();
        const crosshair = crosshairElement.getBoundingClientRect();
        const box = hint.getBoundingClientRect();
        return { aboveQuickbar: box.bottom <= quickbar.top, leftOfCrosshair: box.right <= crosshair.left };
      }),
      { aboveQuickbar: true, leftOfCrosshair: true },
      'the look-target hint is above the quickbar and left of the crosshair',
    );
  /**
   * Waits for the look-target line to name one of `shown` beside a condition mark, then shoots it and reads its blip.
   * @param {string} shot
   * @param {string[]} shown
   */
  const crosshairShot = async (shot, shown) => {
    await page.waitForFunction(
      (wanted) => {
        const line = document.querySelector('#prompt .condition-mark')?.parentElement?.textContent.toLowerCase();
        return line !== undefined && wanted.some((name) => line.includes(name));
      },
      shown.map((name) => name.toLowerCase()),
    );
    if (!hintBoxChecked) {
      await assertHintBoxClear();
      hintBoxChecked = true;
    }
    if (output) {
      await prompt.screenshot({ path: join(output, `crosshair-${shot}.png`) });
    }
    return prompt.evaluate((node) => {
      const blip = node.querySelector('.condition-blip');
      if (!(blip instanceof HTMLElement)) {
        throw new Error('The crosshair line has no condition blip');
      }
      return blip.style.getPropertyValue('--blip');
    });
  };
  const { top, names, solidBlocks } = await page.evaluate(() => {
    const { registry } = globalThis.skellyPlayTest.session.inventory;
    const topBand = [...registry.inventory.values()].find((row) => row.capability === 'player')?.conditionBands.at(-1);
    if (!topBand) {
      throw new Error('Content has no player condition bands');
    }
    return {
      top: topBand.color,
      names: Object.fromEntries(
        ['electric_lamp', 'fridge', 'workbench'].map((id) => {
          const furniture = registry.furniture.get(id);
          if (!furniture) {
            throw new Error(`Content has no ${id} furniture`);
          }
          return [id, furniture.name];
        }),
      ),
      solidBlocks: registry.blocks.filter((block) => block.solid).map((block) => block.name),
    };
  });
  for (const [type, name] of Object.entries(names)) {
    process.stdout.write(`crosshair: ${type}\n`);
    await aim(type);
    assert.equal(await crosshairShot(type, [name]), top, `the intact ${type} shows the top band's blip`);
  }
  // Looking straight down at the deck, past every piece, puts a block in the crosshair.
  process.stdout.write('crosshair: block\n');
  await page.evaluate(() => {
    globalThis.skellyPlayTest.input.controls.pitch = -Math.PI / 2 + 0.05;
  });
  await page.waitForFunction(() => globalThis.skellyPlayTest.interactionTargetAt() === undefined);
  assert.ok(await crosshairShot('block', solidBlocks), 'the looked-at block shows a condition blip');
  // An aimed vehicle part is named the same way. The look's hatchback stands in reach with some parts worn, so one
  // worn part and one intact part each show their own band's blip.
  /** @param {boolean} worn */
  const aimPart = (worn) =>
    page.evaluate((wantWorn) => {
      const { engine, session, input, eye, interactionTargetAt } = globalThis.skellyPlayTest;
      const { blockSize } = engine.config.scale;
      const origin = eye();
      const [ox, oy, oz] = origin;
      /**
       * @param {{ readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] }} box
       * @returns {[number, number, number]} the box centre's offset from the eye, in blocks
       */
      const offsetOf = ({ min: [x0, y0, z0], max: [x1, y1, z1] }) => [
        (x0 + x1) / 2 / blockSize - ox,
        (y0 + y1) / 2 / blockSize - oy,
        (z0 + z1) / 2 / blockSize - oz,
      ];
      /** @param {number[]} offset */
      const distance = (offset) => Math.hypot(...offset);
      /** @param {[number, number, number]} offset */
      const lookAlong = ([dx, dy, dz]) => {
        input.controls.yaw = Math.atan2(-dx, -dz);
        input.controls.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        return interactionTargetAt();
      };
      /** @param {{ readonly item: import('@skelly/engine/inventory').Item }} part */
      const shownAs = ({ item: { type, condition } }) => {
        const { registry } = session.inventory;
        const band = [...registry.inventory.values()]
          .find((row) => row.capability === 'player')
          ?.conditionBands.findLast(({ from }) => from <= condition);
        const item = registry.items.get(type);
        if (!(band && item)) {
          throw new Error(`The aimed ${type} has no item definition or condition band`);
        }
        return { name: item.name, color: band.color };
      };
      const aims = session.vehicleParts
        .all()
        .filter((part) => part.item.condition < 1 === wantWorn)
        .flatMap((part) => part.boxes.map((box) => ({ part, at: offsetOf(box) })))
        .sort((a, b) => distance(a.at) - distance(b.at));
      for (const { part, at } of aims) {
        const hit = lookAlong(at);
        if (hit?.kind === 'vehicle' && hit.vehicleId === part.vehicleId && hit.fittingId === part.fittingId) {
          return shownAs(part);
        }
      }
      const nearest = aims.slice(0, 3).map(({ part, at }) => {
        const target = lookAlong(at);
        return {
          fitting: part.fittingId,
          metres: distance(at) * blockSize,
          hit: target?.kind === 'vehicle' ? target.fittingId : target?.kind,
        };
      });
      throw new Error(
        `no ${wantWorn ? 'worn' : 'intact'} vehicle part in the crosshair's reach: ${JSON.stringify({ origin, nearest })}`,
      );
    }, worn);
  /** @type {string[]} */
  const partColors = [];
  /** @type {[string, boolean][]} */
  const partShots = [
    ['part-worn', true],
    ['part-intact', false],
  ];
  for (const [shot, worn] of partShots) {
    process.stdout.write(`crosshair: ${shot}\n`);
    const part = await aimPart(worn);
    assert.equal(await crosshairShot(shot, [part.name]), part.color, `the ${shot} shows its own band's blip`);
    partColors.push(part.color);
  }
  assert.notEqual(partColors[0], partColors[1], 'the worn and intact parts show different bands');

  const chair = await openWorldWork('chair', 'repair');
  assert.ok(((await panel.getAttribute('aria-label')) ?? '').length > 0, 'the pinned review heads with the piece');
  assert.equal(await panel.locator('.craft-condition').count(), 1, 'the repair review names the condition');
  const chairCondition = await page.evaluate(
    (uid) => globalThis.skellyPlayTest.session.crafting.previewEntityRepair('craft_look_chair_repair', uid).condition,
    chair,
  );
  assert.ok(chairCondition, 'the repair review previews the look chair condition');
  assert.notEqual(
    chairCondition.now.word,
    chairCondition.after.word,
    "one repair moves the look chair's condition band",
  );
  if (output) {
    // Every content band through the review's own condition line, in the open panel's styles, for the look's per-band
    // shot: one read-only row per band, drawn beside the live review and removed after.
    await page.evaluate(async () => {
      const [{ renderCrafting }, { craftingText }] = await Promise.all([
        import('/@stage/@skelly/presentation/internal/ui/crafting.ts'),
        import('/@stage/@skelly/presentation/internal/ui/craftReadout.ts'),
      ]);
      const { registry } = globalThis.skellyPlayTest.session.inventory;
      const tuning = [...registry.inventory.values()].find((row) => row.capability === 'player');
      const crafting = document.querySelector('#crafting');
      if (!(tuning && crafting)) {
        throw new Error('The player inventory tuning or the crafting pane is missing');
      }
      const bands = tuning.conditionBands;
      const strip = document.createElement('div');
      strip.id = 'condition-band-strip';
      crafting.append(strip);
      /** @type {import('@skelly/presentation/internal/ui/craftReadout.ts').CraftRow[]} */
      const rows = bands.map((band, index) => ({
        id: `band-${index}`,
        name: band.word,
        itemName: band.word,
        kind: 'repair',
        length: '',
        reason: undefined,
        condition: { now: band, after: band },
        components: [],
        qualities: [],
        skills: [],
        workstation: null,
      }));
      const ignore = () => undefined;
      renderCrafting(
        strip,
        rows,
        { start: ignore, prefer: ignore, source: ignore },
        {
          text: craftingText(registry),
          world: { heading: '', depicted: false },
        },
      );
    });
    await page.locator('#condition-band-strip .craft-condition').first().waitFor();
    for (const [index, line] of (await page.locator('#condition-band-strip .craft-condition').all()).entries()) {
      await line.screenshot({ path: join(output, `condition-band-${index}.png`) });
    }
    await page.evaluate(() => document.querySelector('#condition-band-strip')?.remove());
  }
  assert.equal(await panel.locator('.craft-recipe h3').count(), 0, 'the world review does not repeat the panel head');
  assert.equal(await page.locator('#debug-center-x').isVisible(), false, 'the open screen hides the debug centre X');
  const repairOrder = await walkControls('start');
  assert.ok(repairOrder.includes('turn:-1') && repairOrder.includes('turn:1'), 'the turn controls are keyboard stops');
  assert.ok(repairOrder.indexOf('turn:-1') < repairOrder.indexOf('turn:1'), 'the turn controls follow reading order');
  assert.ok(
    repairOrder.findIndex((entry) => entry?.startsWith('group:')) > repairOrder.indexOf('turn:1'),
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
  assert.equal(
    await page.locator('.craft-start').evaluate((node) => node === document.activeElement),
    true,
    'choosing take apart focuses its execute button',
  );
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
      const witness = globalThis.skellyPlayTest;
      globalThis.reachLib ??= await import('/@stage/@skelly/engine/internal/core/reach.ts');
      const { furnitureDistance, reachTuning } = globalThis.reachLib;
      const player = {
        inventory: witness.session.inventory,
        position: witness.session.body.pos,
        blockSize: witness.engine.config.scale.blockSize,
        clock: witness.session.sim.clock,
      };
      const reach = reachTuning(player.inventory.registry).reachMetres;
      /** @param {string} type */
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
  assert.ok(start.chair && start.workbench, 'the fixture start stands a chair and a workbench');
  assert.ok(
    start.workbench.distance <= start.reach,
    `the stock starts in reach: ${JSON.stringify({ reach: start.reach, chair: start.chair.distance, workbench: start.workbench.distance })}`,
  );
  await page.evaluate(() => {
    const witness = globalThis.skellyPlayTest;
    const feet = witness.session.body.pos;
    /** @param {string} type */
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
    /** @param {import('@skelly/engine/world').BlockEntity} entity @returns {[number, number]} */
    const face = (entity) => [
      Math.min(Math.max(feet[0], entity.pos[0]), entity.pos[0] + entity.size[0]),
      Math.min(Math.max(feet[2], entity.pos[2]), entity.pos[2] + entity.size[2]),
    ];
    /** @param {[number, number]} vector @returns {[number, number]} */
    const unit = ([x, z]) => {
      const length = Math.hypot(x, z);
      return [x / length, z / length];
    };
    const workbench = nearest('workbench');
    if (!workbench) {
      throw new Error('The fixture start lacks a workbench');
    }
    const stock = face(workbench);
    const [ux, uz] = unit([feet[0] - stock[0], feet[2] - stock[1]]);
    witness.input.controls.yaw = Math.atan2(-ux, -uz);
    witness.input.controls.pitch = 0;
    witness.input.lock();
  });
  const walk = await holdAction(page, 'movement.forward');
  try {
    await page.waitForFunction(
      () => {
        const witness = globalThis.skellyPlayTest;
        if (!globalThis.reachLib) {
          return false;
        }
        const { furnitureDistance, reachTuning } = globalThis.reachLib;
        const player = {
          inventory: witness.session.inventory,
          position: witness.session.body.pos,
          blockSize: witness.engine.config.scale.blockSize,
          clock: witness.session.sim.clock,
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
  assert.ok(separated.chair && separated.workbench, 'the walk keeps the chair and the workbench standing');
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
    /** @param {Error} error */
    const raised = (error) => {
      page.off('pageerror', raised);
      reject(new Error(`the take-apart Start raised: ${error.message}`));
    };
    page.on('pageerror', raised);
    page
      .waitForFunction((uid) => Boolean(globalThis.skellyPlayTest.session.inventory.entities.byUid(uid)?.work), crate)
      .then(resolve, reject)
      .finally(() => page.off('pageerror', raised));
  });
  assert.equal(await runningWork(), true, 'the take-apart Start begins the work on the crate');
};
