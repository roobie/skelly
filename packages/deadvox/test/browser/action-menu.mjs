// biome-ignore-all lint/performance/noAwaitInLoops: each step must land before the next one is judged.
import { holdAction } from './input-actions.mjs';

// The ring's root is a zero-size anchor at the crosshair, so Playwright never calls it visible; its hidden flag is.
export const actionRingShown = (page) => page.evaluate(() => !document.querySelector('#action-radial').hidden);
export const waitForActionRing = (page, shown = true) =>
  page.waitForFunction((expected) => !document.querySelector('#action-radial').hidden === expected, shown);
export const selectedRingEntry = (page) =>
  page.evaluate(() => document.querySelector('#action-radial .radial-entry.selected')?.dataset.action);

/**
 * Pulls a freshly opened ring onto `actionId`'s drawn entry with locked-pointer movement, as a player's mouse does,
 * so the test follows the entry wherever content places it.
 */
export const pointActionMenu = async (page, actionId) => {
  await page.evaluate((id) => {
    const centre = document.querySelector('#action-radial .radial-centre')?.getBoundingClientRect();
    const entry = document.querySelector(`#action-radial .radial-entry[data-action="${id}"]`)?.getBoundingClientRect();
    if (!(centre && entry)) {
      throw new Error(`The open action ring has no ${id} entry`);
    }
    document.dispatchEvent(
      new MouseEvent('mousemove', {
        movementX: entry.left + entry.width / 2 - (centre.left + centre.width / 2),
        movementY: entry.top + entry.height / 2 - (centre.top + centre.height / 2),
        bubbles: true,
      }),
    );
  }, actionId);
  await page.waitForFunction(
    (id) => document.querySelector('#action-radial .radial-entry.selected')?.dataset.action === id,
    actionId,
  );
};

/** Steps the open ring with `step` (a wheel notch or an arrow key) until `actionId` is chosen, at most once round. */
export const stepActionMenuTo = async (page, actionId, step) => {
  const entries = await page.locator('#action-radial .radial-entry').count();
  for (let steps = 0; steps <= entries; steps += 1) {
    const before = await selectedRingEntry(page);
    if (before === actionId) {
      return;
    }
    await step();
    await page.waitForFunction(
      (previous) => document.querySelector('#action-radial .radial-entry.selected')?.dataset.action !== previous,
      before,
    );
  }
  throw new Error(`Stepping the action ring never reached ${actionId}`);
};

/**
 * Holds the dominant use on the locked surface the flow's clicks use; the returned function releases it. An open ring
 * takes mouse movement as its pull, so the press then lands where the mouse already is.
 */
export const holdDominantUse = async (page) => {
  if (!(await actionRingShown(page))) {
    await page.mouse.move(640, 450);
  }
  await page.mouse.down();
  return () => page.mouse.up();
};

/** Chooses `actionId` from the held item's ring: hold the use press, point at the entry, release. */
export const chooseHeldAction = async (page, actionId, useAction) => {
  const release = useAction ? await holdAction(page, useAction) : await holdDominantUse(page);
  try {
    await waitForActionRing(page);
    await pointActionMenu(page, actionId);
  } finally {
    await release();
  }
};
