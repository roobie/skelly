/** @import { Page } from 'playwright' */

// Samples the production shader function in an owned geometry fixture, not a duplicate selector.
/** @param {Page} page */
export const skySelectionProof = (page) =>
  page.evaluate(async () => {
    const { runSkySelectionProof } = await import('/test/browser/sky-selection.ts');
    return runSkySelectionProof();
  });
