// One mode assignment per existing browser stage. Launchers use this for both the URL opt-in
// and Chromium's graphics flags, so a stage cannot silently request one mode and launch another.
const modes = Object.freeze({
  'inventory-scroll': 'render-free',
  'ui-browser-contract': 'pixel',
  'melee-build-click': 'render-free',
  'primary-action': 'render-free',
  'full-auto': 'render-free',
  'case-visual-pool': 'pixel',
  'save-controller-regressions': 'render-free',
  'save-storage': 'render-free',
  'insecure-saves': 'render-free',
  'stairs-traversal': 'render-free',
  'stairs-lighting': 'pixel',
  reading: 'render-free',
  'firefox-ui': 'render-free',
  'firefox-first-click': 'render-free',
  'render-probe': 'pixel',
});

export const browserStageMode = (stage, override) => {
  const mode = modes[stage];
  if (!mode) throw new Error(`Unknown browser stage mode: ${stage}`);
  if (override !== undefined && override !== 'pixel' && override !== 'render-free') {
    throw new Error(`Unknown browser render mode: ${override}`);
  }
  return override ?? mode;
};

export const browserStageArgs = (stage, extra = [], override) => {
  const mode = browserStageMode(stage, override);
  const explicitGl = extra.some((arg) => arg.startsWith('--use-gl='));
  return [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    ...(mode === 'render-free'
      ? ['--disable-gpu']
      : [...(explicitGl ? [] : ['--use-gl=swiftshader']), '--enable-unsafe-swiftshader']),
    ...extra,
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
