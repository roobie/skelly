// biome-ignore-all lint/suspicious/noMisplacedAssertion: browser flow helper.
import { holdAction } from './input-actions.mjs';

export const chooseHeldAction = async (page, actionId, useAction) => {
  const release = useAction
    ? await holdAction(page, useAction)
    : await (async () => {
        await page.mouse.down();
        return () => page.mouse.up();
      })();
  try {
    await page.waitForFunction(() => !document.querySelector('#furniture-radial').hidden);
    await page.evaluate(async (id) => {
      const tuning = (await import('/src/content/base/ui.json?import')).default.ui[0].furnitureRadial;
      const angle = (tuning.slots.held[id] * Math.PI) / 180;
      if (!Number.isFinite(angle)) {
        throw new Error(`No held-menu slot for ${id}`);
      }
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          movementX: Math.sin(angle) * tuning.radiusPixels,
          movementY: -Math.cos(angle) * tuning.radiusPixels,
          bubbles: true,
        }),
      );
    }, actionId);
    await page.waitForFunction(
      (id) => document.querySelector('.radial-entry.selected')?.dataset.action === id,
      actionId,
    );
  } finally {
    await release();
  }
};
