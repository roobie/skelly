// Samples the production shader function in an owned geometry fixture, not a duplicate selector.
export const skySelectionProof = (page) =>
  page.evaluate(async () => {
    // biome-ignore lint/correctness/noUnresolvedImports: Vite serves this browser-origin URL, not a Node module.
    const { runSkySelectionProof } = await import('/test/browser/sky-selection.ts');
    return runSkySelectionProof();
  });
