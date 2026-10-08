const byId = (id) => document.getElementById(id);
const DEFAULT_DEADVOX_PLAN = '0.5:64,0.5:96,0.5:128';
const DEFAULT_SHAMBLER_COUNTS = '10,25,50,100';
const SHAMBLER_COUNTS_PATTERN = /^\d+(,\d+)*$/;

const deadvoxForm = byId('deadvox-form');
const deadvoxMode = byId('deadvox-bench');
const deadvoxTime = deadvoxForm.elements.namedItem('time');
const deadvoxSite = byId('deadvox-site');
const worldPlan = deadvoxForm.elements.namedItem('plan');
const worldIndex = byId('deadvox-world-index');
const worldShamblers = deadvoxForm.elements.namedItem('shamblers');
const shamblerCounts = deadvoxForm.elements.namedItem('n');
const shamblerIndex = byId('deadvox-shambler-index');
const deadvoxUrl = byId('deadvox-url');
const deadvoxStatus = byId('deadvox-status');

const parsePlan = (value) => {
  const entries = value.split(',').map((part) => part.split(':').map(Number));
  const valid = entries.every(
    ([blockSize, radiusM], index) =>
      value.split(',')[index]?.split(':').length === 2 &&
      [0.25, 0.5, 1].includes(blockSize) &&
      radiusM >= 16 &&
      radiusM <= 512,
  );
  return valid && entries.length > 0 ? entries : undefined;
};

const parseCounts = (value) => {
  if (!SHAMBLER_COUNTS_PATTERN.test(value)) {
    return;
  }
  const counts = value.split(',').map(Number);
  return counts.every((count) => Number.isSafeInteger(count) && count > 0 && count <= 500) &&
    new Set(counts).size === counts.length
    ? counts
    : undefined;
};

const showWhen = (element, visible) => {
  element.hidden = !visible;
  for (const control of element.querySelectorAll('input, select, textarea')) {
    control.disabled = !visible;
  }
};

const defaultTime = () => {
  if (deadvoxMode.value === 'shamblers') {
    return '23:30';
  }
  return deadvoxMode.value === '1' ? '12:00' : '19:30';
};

const updateDeadvoxVisibility = () => {
  const mode = deadvoxMode.value;
  showWhen(byId('deadvox-seed-field'), mode !== 'report');
  showWhen(byId('deadvox-time-field'), mode !== 'report');
  showWhen(byId('deadvox-radius-field'), mode === '');
  showWhen(byId('deadvox-site-field'), mode !== 'report' && mode !== 'shamblers');
  byId('deadvox-default-site').textContent = mode === '1' ? 'Test house (benchmark default)' : 'Hamlet (default)';
  showWhen(byId('deadvox-debug-field'), mode === '');
  showWhen(byId('deadvox-at-field'), mode === '' && deadvoxForm.elements.namedItem('debug').checked);
  showWhen(byId('deadvox-handedness-field'), mode === '' && deadvoxForm.elements.namedItem('debug').checked);
  showWhen(byId('deadvox-wobble-flat-field'), mode === '' && deadvoxForm.elements.namedItem('debug').checked);
  showWhen(byId('deadvox-actors-field'), mode === '');
  showWhen(byId('deadvox-world-bench'), mode === '1');
  showWhen(byId('deadvox-shambler-bench'), mode === 'shamblers');
  showWhen(byId('deadvox-storeys-field'), deadvoxSite.value === 'city' && mode !== 'report' && mode !== 'shamblers');
  showWhen(byId('deadvox-density-field'), deadvoxSite.value === 'forest' && mode !== 'report' && mode !== 'shamblers');

  const nextDefault = defaultTime();
  if (deadvoxTime.value === deadvoxTime.dataset.defaultTime) {
    deadvoxTime.value = nextDefault;
  }
  deadvoxTime.dataset.defaultTime = nextDefault;
};

const validateDeadvox = () => {
  worldPlan.setCustomValidity('');
  worldIndex.setCustomValidity('');
  shamblerCounts.setCustomValidity('');
  shamblerIndex.setCustomValidity('');

  const plan = parsePlan(worldPlan.value);
  worldPlan.setCustomValidity(
    plan ? '' : 'Use comma-separated block-size:radius pairs; block size 0.25, 0.5 or 1, radius 16–512.',
  );
  worldIndex.max = String(Math.max(0, (plan?.length ?? 1) - 1));
  if (plan && (!Number.isInteger(Number(worldIndex.value)) || Number(worldIndex.value) >= plan.length)) {
    worldIndex.setCustomValidity(`Choose an entry from 0 to ${plan.length - 1}.`);
  }

  const counts = parseCounts(shamblerCounts.value);
  shamblerCounts.setCustomValidity(counts ? '' : 'Enter unique comma-separated whole numbers from 1 to 500.');
  shamblerIndex.max = String(Math.max(0, (counts?.length ?? 1) - 1));
  if (counts && (!Number.isInteger(Number(shamblerIndex.value)) || Number(shamblerIndex.value) >= counts.length)) {
    shamblerIndex.setCustomValidity(`Choose an entry from 0 to ${counts.length - 1}.`);
  }
  return deadvoxForm.checkValidity();
};

const setUnlessDefault = (params, key, value, defaultValue) => {
  if (value !== defaultValue) {
    params.set(key, value);
  }
};

const makeDeadvoxUrl = () => {
  const url = new URL('deadvox/', location.href);
  const params = url.searchParams;
  const mode = deadvoxMode.value;
  if (mode !== '') {
    params.set('bench', mode);
  }
  if (mode === 'report') {
    return url;
  }

  setUnlessDefault(params, 'seed', deadvoxForm.elements.namedItem('seed').value, '1');
  const timeDefault = defaultTime();
  setUnlessDefault(params, 'time', deadvoxTime.value, timeDefault);

  if (mode === '') {
    setUnlessDefault(params, 'radius', deadvoxForm.elements.namedItem('radius').value, '96');
    setUnlessDefault(params, 'actors', deadvoxForm.elements.namedItem('actors').value, '');
    if (deadvoxForm.elements.namedItem('debug').checked) {
      params.set('debug', '1');
      setUnlessDefault(params, 'at', deadvoxForm.elements.namedItem('at').value.trim(), '');
      setUnlessDefault(params, 'handedness', deadvoxForm.elements.namedItem('handedness').value, '');
    }
  }

  if ((mode === '' || mode === '1') && deadvoxSite.value === 'city') {
    params.set('site', 'city');
    setUnlessDefault(params, 'storeys', deadvoxForm.elements.namedItem('storeys').value, '1');
  }
  if (deadvoxSite.value === 'forest') {
    params.set('site', 'forest');
    setUnlessDefault(params, 'density', deadvoxForm.elements.namedItem('density').value, '');
  }

  if (mode === '1') {
    params.set('shamblers', worldShamblers.value);
    setUnlessDefault(params, 'plan', worldPlan.value, DEFAULT_DEADVOX_PLAN);
    setUnlessDefault(params, 'i', worldIndex.value, '0');
    if (deadvoxForm.elements.namedItem('quick').checked) {
      params.set('quick', '1');
    }
  }
  if (mode === 'shamblers') {
    setUnlessDefault(params, 'n', shamblerCounts.value, DEFAULT_SHAMBLER_COUNTS);
    setUnlessDefault(params, 'i', shamblerIndex.value, '0');
  }
  return url;
};

const refreshDeadvox = () => {
  updateDeadvoxVisibility();
  const valid = validateDeadvox();
  if (!valid) {
    deadvoxUrl.value = '';
    deadvoxStatus.textContent = 'Correct the highlighted values to make a launch link.';
    return;
  }
  deadvoxUrl.value = makeDeadvoxUrl().href;
  deadvoxStatus.textContent = '';
};

deadvoxForm.addEventListener('input', refreshDeadvox);
deadvoxForm.addEventListener('change', refreshDeadvox);
deadvoxForm.addEventListener('submit', (event) => {
  event.preventDefault();
  refreshDeadvox();
  if (deadvoxForm.reportValidity()) {
    location.assign(deadvoxUrl.value);
  }
});

const deadvoxPresets = {
  dusk: { bench: '', seed: '1', time: '19:30', radius: '96', site: '', storeys: '1', debug: false },
  noon: { bench: '', seed: '1', time: '12:00', radius: '96', site: '', storeys: '1', debug: false },
  night: { bench: '', seed: '1', time: '01:00', radius: '96', site: '', storeys: '1', debug: false },
  city: { bench: '', seed: '1', time: '19:30', radius: '96', site: 'city', storeys: '5', debug: false },
  debug: { bench: '', seed: '1', time: '05:30', radius: '96', site: '', storeys: '1', debug: true },
  benchmark: { bench: '1', seed: '1', time: '12:00', radius: '96', site: '', storeys: '1', debug: false },
};

for (const button of document.querySelectorAll('[data-deadvox-preset]')) {
  button.addEventListener('click', () => {
    const preset = deadvoxPresets[button.dataset.deadvoxPreset];
    for (const [name, value] of Object.entries(preset)) {
      const control = deadvoxForm.elements.namedItem(name);
      if (control.type === 'checkbox') {
        control.checked = value;
      } else {
        control.value = value;
      }
    }
    deadvoxForm.elements.namedItem('at').value = '';
    deadvoxTime.dataset.defaultTime = '';
    refreshDeadvox();
  });
}

const gungenForm = byId('gungen-form');
const gungenUrl = byId('gungen-url');
const gungenStatus = byId('gungen-status');
const gungenTemplate = byId('gungen-template');
const gungenFixture = byId('gungen-fixture');
const gungenDesign = byId('gungen-design');
const gungenSeed = gungenForm.elements.namedItem('seed');
const gungenSet = byId('gungen-set');
const gungenTemplateFields = byId('gungen-template-fields');
const gungenFixtureFields = byId('gungen-fixture-fields');
const gungenDesignFields = byId('gungen-design-fields');

const gungenMode = () => gungenForm.elements.namedItem('gungen-mode').value;

const makeGungenUrl = () => {
  const url = new URL('gungen/', location.href);
  const params = url.searchParams;
  if (gungenMode() === 'fixture') {
    params.set('fixture', gungenFixture.value);
  } else if (gungenMode() === 'design') {
    params.set('design', gungenDesign.value);
  } else {
    params.set('template', gungenTemplate.value);
    setUnlessDefault(params, 'seed', gungenSeed.value, '0');
  }
  // The viewer applies overrides in either mode (paramPanel.ts).
  setUnlessDefault(params, 'set', gungenSet.value.trim(), '');
  setUnlessDefault(params, 'colors', gungenForm.elements.namedItem('colors').value, 'finish');
  return url;
};

const refreshGungen = () => {
  const mode = gungenMode();
  const isTemplate = mode === 'template';
  showWhen(gungenTemplateFields, isTemplate);
  showWhen(gungenFixtureFields, mode === 'fixture');
  showWhen(gungenDesignFields, mode === 'design');
  if (isTemplate && !gungenForm.checkValidity()) {
    gungenUrl.value = '';
    gungenStatus.textContent = 'Enter a whole-number seed in range to make a launch link.';
    return;
  }
  gungenUrl.value = makeGungenUrl().href;
  gungenStatus.textContent = '';
};

gungenForm.addEventListener('input', refreshGungen);
gungenForm.addEventListener('change', refreshGungen);
gungenForm.addEventListener('submit', (event) => {
  event.preventDefault();
  refreshGungen();
  if (gungenMode() !== 'template' || gungenForm.reportValidity()) {
    location.assign(gungenUrl.value);
  }
});

for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const input = byId(button.dataset.copy);
    if (!input.value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(input.value);
      button.textContent = 'Copied';
    } catch {
      input.select();
      document.execCommand('copy');
      button.textContent = 'Copied';
    }
    setTimeout(() => {
      button.textContent = 'Copy link';
    }, 1200);
  });
}

refreshDeadvox();
refreshGungen();
