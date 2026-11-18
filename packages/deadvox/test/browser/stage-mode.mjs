/** @import * as Declared from './stage-mode.d.mts' */

// One mode assignment per browser stage, including the production-bundle save scenario. Launchers
// use this for both URL opt-in and Chromium graphics flags, so mode and launch cannot silently diverge.
/** @type {Readonly<Record<string, Declared.BrowserStageMode>>} */
const modes = Object.freeze({
  'inventory-scroll': 'pixel',
  'ui-browser-contract': 'render-free',
  'melee-build-click': 'render-free',
  'cell-repair-crack': 'pixel',
  'primary-action': 'render-free',
  'primary-action-pixel': 'pixel',
  'pump-handling': 'render-free',
  'full-auto': 'render-free',
  'case-visual-pool': 'pixel',
  'save-controller-regressions': 'render-free',
  'gauntlet-save-regressions': 'render-free',
  'save-storage': 'render-free',
  'save-storage-navigation': 'pixel',
  'save-storage-opfs-continue': 'pixel',
  'save-storage-indexeddb-continue': 'pixel',
  'insecure-saves': 'render-free',
  'stairs-traversal': 'render-free',
  'stairs-camo': 'pixel',
  'stairs-lighting-cellar': 'pixel',
  'stairs-lighting-residents': 'pixel',
  'stairs-lighting-outdoor': 'pixel',
  'stairs-lighting-atlas': 'pixel',
  'main-first-mesh': 'pixel',
  reading: 'render-free',
  'firefox-ui': 'render-free',
  'firefox-first-click': 'render-free',
  'render-probe': 'pixel',
  'vehicle-feasibility': 'render-free',
  'vehicle-rapier': 'render-free',
});

/** @type {typeof Declared.browserStageMode} */
export const browserStageMode = (stage, override) => {
  const mode = Object.hasOwn(modes, stage) ? modes[stage] : undefined;
  if (mode === undefined) {
    throw new Error(`Unknown browser stage mode: ${stage}`);
  }
  if (override !== undefined && override !== 'pixel' && override !== 'render-free') {
    throw new Error(`Unknown browser render mode: ${override}`);
  }
  return override ?? mode;
};

// ANGLE's link-time pipeline warm-up builds a guessed pipeline per program in the background, and
// SwiftShader turns each into seconds of CPU work that outlives loading; see
// `packages/deadvox/TROUBLESHOOTING.md`, "Browser stages".
const swiftShaderArgs = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--disable-angle-features=warmUpPipelineCacheAtLink',
];

/** @type {typeof Declared.browserStageArgs} */
export const browserStageArgs = (stage, extra, override) => {
  const additionalArgs = extra ?? [];
  const mode = browserStageMode(stage, override);
  const explicitGl = additionalArgs.some((arg) => arg.startsWith('--use-gl='));
  return [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    ...(mode === 'render-free'
      ? ['--disable-gpu']
      : [...(explicitGl ? [] : swiftShaderArgs), '--enable-unsafe-swiftshader']),
    ...additionalArgs,
  ];
};

/** @type {typeof Declared.browserStageUrl} */
export const browserStageUrl = (stage, address, override) => {
  const url = new URL(address);
  if (browserStageMode(stage, override) === 'render-free' && url.searchParams.get('bench') === null) {
    url.searchParams.set('render', '0');
  } else {
    url.searchParams.delete('render');
  }
  return url.href;
};
