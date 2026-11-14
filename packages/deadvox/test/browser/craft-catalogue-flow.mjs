// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract shared by the inventory stage
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { pressAction } from './input-actions.mjs';

export const craftCatalogueFlow = async ({ page, url, resizeViewport, output }) => {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  await page.locator('#go').click();
  await page.waitForFunction(
    () =>
      globalThis.foregripFitTest &&
      document.querySelector('#overlay')?.hidden &&
      document.querySelector('#world-loading')?.hidden,
  );
  await pressAction(page, 'ui.inventory-tab-crafting');
  await page.locator('.craft-query').waitFor({ state: 'visible' });
  const limits = await page.evaluate(() => {
    const { session } = globalThis.foregripFitTest;
    const ui = [...session.inventory.registry.ui.values()].find((row) => row.capability === 'interface');
    return { ...ui.crafting, known: session.character.knownRecipes.size };
  });
  assert.ok(limits.known > 1000, 'the look exercises a synthetic thousands-recipe catalogue');
  assert.ok((await page.locator('[data-craft-result]').count()) <= limits.pageSize);
  assert.ok((await page.locator('.craft-category-options button').count()) <= limits.facetPageSize);
  assert.ok((await page.locator('.craft-tag-options button').count()) <= limits.facetPageSize);
  assert.equal(await page.locator('.craft-recipe').count(), 1);
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
  await page.evaluate(() => {
    globalThis.chooserProbe = [];
    const { screen } = globalThis.foregripFitTest;
    const original = screen.onAction.bind(screen);
    screen.onAction = (action) => {
      globalThis.chooserProbe.push({
        action,
        tab: screen.activeTab,
        refusal: screen.hooks.actionRefusal?.(),
        viewer: screen.viewer.viewedUid,
        ancestors: [
          ...document.activeElement.parentElement.closest('#crafting').querySelectorAll('[data-craft-group]'),
        ].map((node) => ({
          tab: node.tabIndex,
          styles: [
            ...(function* () {
              for (let p = node; p; p = p.parentElement) {
                yield p;
              }
            })(),
          ].map((p) => [p.tagName, p.className, getComputedStyle(p).display, getComputedStyle(p).visibility, p.hidden]),
        })),
      });
      let result;
      try {
        result = original(action);
      } catch (error) {
        globalThis.chooserProbe.push({ action, error: error.message });
      }
      globalThis.chooserProbe.push({
        action,
        after: document.activeElement?.outerHTML,
        controls: screen.hooks
          .reviewControls?.()
          .querySelectorAll('button,input,textarea,select,summary,a[href],[tabindex]').length,
      });
      return result;
    };
    for (const type of ['focusin', 'focusout', 'keydown', 'click']) {
      document.addEventListener(
        type,
        (event) => globalThis.chooserProbe.push([type, event.target.outerHTML?.slice(0, 240), event.key]),
        true,
      );
    }
  });
  await activate(group);
  process.stdout.write(
    `chooser state ${JSON.stringify(await group.evaluate((node) => ({ events: globalThis.chooserProbe, active: document.activeElement?.outerHTML, row: node.outerHTML, hidden: node.closest('[hidden]')?.outerHTML.slice(0, 200) })))}\n`,
  );
  process.stdout.write(
    `ownership ${JSON.stringify(await page.evaluate(() => globalThis.chooserProbe.filter((entry) => entry.action)))}\n`,
  );
  assert.equal(
    await group.getAttribute('aria-expanded'),
    'true',
    JSON.stringify(
      await group.evaluate((node) => {
        const { screen } = globalThis.foregripFitTest;
        return {
          actions: globalThis.chooserProbe.filter((entry) => entry.action),
          open: screen.isOpen,
          review: screen.hooks.reviewControls?.() === node.closest('#crafting'),
          disabled: node.matches(':disabled'),
          hidden: node.closest('[hidden],[inert]')?.outerHTML.slice(0, 100),
          ownerActive: screen.root.ownerDocument.activeElement === node,
        };
      }),
    ),
  );
  assert.equal(await page.locator('.craft-close-alternatives').count(), 1);
  const alternatives = await page.locator('.craft-alternatives').textContent();
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
  await page.evaluate(`async () => {
    const { session } = globalThis.foregripFitTest;
    const ui = [...session.inventory.registry.ui.values()].find((row) => row.capability === 'interface');
    const { applyUiTokens } = await import('/@stage/@skelly/presentation/ui');
    const { productAssets } = await import('/src/product/assets.ts');
    // UI tuning is content; this layout probe enlarges the fixture's UI density, never browser zoom.
    ui.hudScale = 1.25;
    ui.spacing = 1.25;
    applyUiTokens(session.inventory.registry, document.documentElement, {
      report: (message) => {
        throw new Error(message);
      },
      files: productAssets.cursors,
    });
  }`);
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
  return { ...limits, ...timings };
};
