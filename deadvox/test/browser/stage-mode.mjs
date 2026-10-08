// One mode assignment per browser stage, including the production-bundle save scenario. Launchers
// use this for both URL opt-in and Chromium graphics flags, so mode and launch cannot silently diverge.
const modes = Object.freeze({
  'inventory-scroll': 'render-free',
  'ui-browser-contract': 'render-free',
  'melee-build-click': 'render-free',
  'primary-action': 'render-free',
  'primary-action-pixel': 'pixel',
  'pump-handling': 'render-free',
  'full-auto': 'render-free',
  'case-visual-pool': 'pixel',
  'save-controller-regressions': 'render-free',
  'save-storage': 'render-free',
  'save-storage-navigation': 'pixel',
  'save-storage-opfs-continue': 'pixel',
  'save-storage-indexeddb-continue': 'pixel',
  'insecure-saves': 'render-free',
  'stairs-traversal': 'render-free',
  'stairs-lighting': 'pixel',
  reading: 'render-free',
  'firefox-ui': 'render-free',
  'firefox-first-click': 'render-free',
  'render-probe': 'pixel',
});

export const browserStageMode = (stage, override) => {
  if (!Object.hasOwn(modes, stage)) {
    throw new Error(`Unknown browser stage mode: ${stage}`);
  }
  const mode = modes[stage];
  if (override !== undefined && override !== 'pixel' && override !== 'render-free') {
    throw new Error(`Unknown browser render mode: ${override}`);
  }
  return override ?? mode;
};

export const browserStageArgs = (stage, extra, override) => {
  const additionalArgs = extra ?? [];
  const mode = browserStageMode(stage, override);
  const explicitGl = additionalArgs.some((arg) => arg.startsWith('--use-gl='));
  return [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    ...(mode === 'render-free'
      ? ['--disable-gpu']
      : [...(explicitGl ? [] : ['--use-gl=swiftshader']), '--enable-unsafe-swiftshader']),
    ...additionalArgs,
  ];
};

export const browserStageUrl = (stage, address, override) => {
  const url = new URL(address);
  if (browserStageMode(stage, override) === 'render-free' && url.searchParams.get('bench') === null) {
    url.searchParams.set('render', '0');
  } else {
    url.searchParams.delete('render');
  }
  return url.href;
};
