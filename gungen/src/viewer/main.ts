import {
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  MathUtils,
  type Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generate, generateValid } from '../core/generate.ts';
import type { Issue } from '../core/issue.ts';
import type { Assembly } from '../core/schema.ts';
import type { Template } from '../core/template.ts';
import { type Report, validate } from '../core/validate.ts';
import { gunDomain } from '../gun/domain.ts';
import { TEMPLATES } from '../gun/templates.ts';
import {
  applyOverrides,
  buildPanelModel,
  clearParam,
  diffOverrides,
  EMPTY_OVERRIDES,
  hasOverrides,
  type PanelEntry,
  type PanelParam,
  type PanelPart,
  type PanelSlot,
  parseOverrides,
  serializeOverrides,
  setParam,
  setSlotPresent,
} from './paramPanel.ts';
import { buildLayers, disposeGroup, type Layers } from './scene.ts';
import { DEFAULT_UI_STATE, parseUiState, UI_STATE_KEY, type UiState } from './uiState.ts';

const fixtures = Object.values(
  import.meta.glob<Assembly>('../../fixtures/*.json', { eager: true, import: 'default' }),
).sort((a, b) => a.name.localeCompare(b.name));

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const view = $<HTMLElement>('view');
const select = $<HTMLSelectElement>('fixture');
const fileInput = $<HTMLInputElement>('file');
const description = $<HTMLParagraphElement>('description');
const status = $<HTMLDivElement>('status');
const issueList = $<HTMLOListElement>('issues');
const hover = $<HTMLParagraphElement>('hover');
const templateSelect = $<HTMLSelectElement>('template');
const seedInput = $<HTMLInputElement>('seed');
const onlyValid = $<HTMLInputElement>('only-valid');
const layerToggles = [...document.querySelectorAll<HTMLInputElement>('#layers input')];
const paramPanel = $<HTMLElement>('param-panel');

const readUiState = (): UiState => {
  try {
    return parseUiState(localStorage.getItem(UI_STATE_KEY));
  } catch {
    return structuredClone(DEFAULT_UI_STATE);
  }
};
const uiState = readUiState();
const saveUiState = () => {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(uiState));
  } catch {
    // Keep the viewer usable when storage is disabled or full.
  }
};

/** Keeps the address bar a shareable link for the current model, including panel overrides. */
const syncUrl = () => {
  const params = new URLSearchParams();
  if (uiState.assembly.kind === 'generated') {
    params.set('template', uiState.template);
    params.set('seed', uiState.seed);
  } else if (uiState.assembly.kind === 'fixture') {
    params.set('fixture', uiState.assembly.name);
  }
  if (hasOverrides(uiState.overrides)) {
    params.set('set', serializeOverrides(uiState.overrides));
  }
  const qs = params.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
};

// ---- three.js setup ----

const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
view.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(0x16_18_1c);
scene.add(new HemisphereLight(0xdf_e6_ee, 0x2a_26_22, 1.6));
const sun = new DirectionalLight(0xff_ff_ff, 2.2);
sun.position.set(20, 40, 30);
scene.add(sun);
const grid = new GridHelper(120, 60, 0x3a_3f_46, 0x26_2a_30);
grid.position.y = -16;
scene.add(grid);

const camera = new PerspectiveCamera(40, 1, 0.1, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const resize = () => {
  const { clientWidth: w, clientHeight: h } = view;
  renderer.setSize(w, h);
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
};
resize();
new ResizeObserver(resize).observe(view);

const GROUP_LABELS: Readonly<Record<string, string>> = { archetype: 'Archetypes', broken: 'Broken (one rule each)' };

const expectationNote = (expected: string[] | undefined, failed: string[]): string => {
  if (expected === undefined) {
    return '';
  }
  return expected.join() === failed.join()
    ? ' <span class="note">· as expected</span>'
    : ` <span class="fail">· expected ${expected.join(', ') || 'pass'}</span>`;
};

// ---- state ----

let current: Assembly | undefined;
let report: Report | undefined;
let layers: Layers | undefined;
let focused: Issue | undefined;
let framed = false;
/** The un-edited model panel overrides are measured against: a fixture, an upload, or a generated seed. */
let baseline: Assembly | undefined;
/** The template `current`/`baseline` were generated from, when they were. Undefined for fixtures and uploads. */
let activeTemplate: Template | undefined;

const redraw = () => {
  if (!report) {
    return;
  }
  if (layers) {
    for (const g of Object.values(layers)) {
      scene.remove(g);
      disposeGroup(g);
    }
  }
  layers = buildLayers(report, focused ? [focused] : report.issues);
  for (const [name, group] of Object.entries(layers)) {
    group.visible = layerToggles.find((t) => t.dataset.layer === name)?.checked ?? true;
    scene.add(group);
  }
  if (!framed) {
    frame(layers.solids);
    framed = true;
  }
};

const frame = (group: Object3D) => {
  group.updateMatrixWorld(true);
  const box = new Box3().setFromObject(group);
  if (box.isEmpty()) {
    return;
  }
  const sphere = box.getBoundingSphere(new Sphere());
  // Fit the bounding sphere to the narrower of the two fields of view.
  const vfov = MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const distance = sphere.radius / Math.sin(Math.min(vfov, hfov) / 2);
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).add(new Vector3(0.2, 0.3, 1).normalize().multiplyScalar(distance));
  controls.update();
};

const renderPanel = (assembly: Assembly) => {
  if (!report) {
    return;
  }
  description.textContent = assembly.description ?? '';
  const failed = [...new Set(report.issues.map((i) => i.rule))].sort();
  const expected = assembly.expect ? [...assembly.expect].sort() : undefined;
  const verdict = report.ok
    ? '<span class="pass">PASS</span>'
    : `<span class="fail">FAIL</span> <span class="note">(${report.issues.length} issue${report.issues.length === 1 ? '' : 's'})</span>`;
  const note = expectationNote(expected, failed);
  status.innerHTML = verdict + note;

  issueList.replaceChildren(
    ...report.issues.map((issue) => {
      const li = document.createElement('li');
      const rule = document.createElement('span');
      rule.className = 'rule';
      rule.textContent = issue.rule;
      li.append(rule, issue.message);
      li.classList.toggle('active', focused === issue);
      li.classList.toggle('dim', focused !== undefined && focused !== issue);
      li.addEventListener('click', () => {
        focused = focused === issue ? undefined : issue;
        renderPanel(assembly);
        redraw();
      });
      return li;
    }),
  );
};

const load = (assembly: Assembly) => {
  current = assembly;
  report = validate(assembly, gunDomain);
  focused = undefined;
  renderPanel(assembly);
  redraw();
  renderParamPanel();
};

// ---- parameter panel ----
//
// Lists the current model's parts and params (paramPanel.ts, pure), then
// turns a click into a new Assembly and runs it through the same load() as
// picking a fixture: no second code path (PROJECT.md item gungen5).

const paramStateText = (state: PanelParam['state']): string => {
  if (state.kind === 'inherited') {
    return `← ${state.from}`;
  }
  return state.kind === 'user' ? 'set' : 'seed';
};

const cardTitle = (entry: PanelEntry): HTMLDivElement => {
  const title = document.createElement('div');
  title.className = 'part-title';
  const id = document.createElement('span');
  id.textContent = entry.id;
  const family = document.createElement('span');
  family.className = 'family';
  family.textContent = entry.family;
  title.append(id, family);
  return title;
};

/** An optional slot the current model doesn't use, with a button to add it. */
const renderSlotCard = (entry: PanelSlot): HTMLElement => {
  const card = document.createElement('fieldset');
  card.className = 'param-part optional';
  card.append(cardTitle(entry));
  const row = document.createElement('div');
  row.className = 'param-slot';
  const note = document.createElement('span');
  note.className = 'param-state';
  note.textContent = 'not present';
  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = 'Add';
  add.addEventListener('click', () => applyPanelChange(setSlotPresent(current!, activeTemplate!, entry.id, true)));
  row.append(note, add);
  card.append(row);
  return card;
};

/** One param: its state, a clear button when a user override, and a button per allowed value. */
const renderParamRow = (partId: string, param: PanelParam): HTMLElement => {
  const row = document.createElement('div');
  row.className = 'param-row';

  const head = document.createElement('div');
  head.className = 'param-head';
  const label = document.createElement('span');
  label.textContent = param.name;
  const state = document.createElement('span');
  state.className = `param-state ${param.state.kind}`;
  state.textContent = paramStateText(param.state);
  head.append(label, state);
  if (param.state.kind === 'user') {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'clear';
    clear.textContent = '×';
    clear.title = 'Clear override, restoring the seed value';
    clear.addEventListener('click', () => applyPanelChange(clearParam(current!, baseline!, partId, param.name)));
    head.append(clear);
  }
  row.append(head);

  const values = document.createElement('div');
  values.className = 'param-values';
  for (const v of param.values) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = v.value;
    btn.classList.toggle('active', v.value === param.current);
    btn.classList.toggle('not-permitted', v.permitted === false);
    if (v.permitted === false) {
      btn.title = "The current template's choices for this param don't offer this value.";
    }
    btn.addEventListener('click', () => applyPanelChange(setParam(current!, partId, param.name, v.value)));
    values.append(btn);
  }
  row.append(values);
  return row;
};

/** A present part: an optional Remove button, then every param row. */
const renderPartCard = (entry: PanelPart): HTMLElement => {
  const card = document.createElement('fieldset');
  card.className = entry.optional ? 'param-part optional' : 'param-part';
  card.append(cardTitle(entry));
  if (entry.optional) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () =>
      applyPanelChange(setSlotPresent(current!, activeTemplate!, entry.id, false)),
    );
    card.append(remove);
  }
  for (const param of entry.params) {
    card.append(renderParamRow(entry.id, param));
  }
  return card;
};

const renderParamPanel = () => {
  if (!(current && baseline)) {
    paramPanel.replaceChildren();
    return;
  }
  const model = buildPanelModel(current, baseline, gunDomain, activeTemplate);
  const nodes: HTMLElement[] = [];

  if (hasOverrides(diffOverrides(baseline, current))) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'param-reset';
    reset.textContent = 'Reset to seed';
    reset.addEventListener('click', () => applyPanelChange(structuredClone(baseline!)));
    nodes.push(reset);
  }
  for (const entry of model) {
    nodes.push(entry.present ? renderPartCard(entry) : renderSlotCard(entry));
  }
  paramPanel.replaceChildren(...nodes);
};

const applyPanelChange = (next: Assembly) => {
  if (!baseline) {
    return;
  }
  framed = false;
  uiState.overrides = diffOverrides(baseline, next);
  saveUiState();
  syncUrl();
  load(next);
};

// ---- UI wiring ----

const groups = new Map<string, HTMLOptGroupElement>();
for (const f of fixtures) {
  const kind = f.name.split('-')[0]!;
  let group = groups.get(kind);
  if (!group) {
    group = document.createElement('optgroup');
    group.label = GROUP_LABELS[kind] ?? kind;
    groups.set(kind, group);
    select.append(group);
  }
  group.append(new Option(f.name, f.name));
}
select.addEventListener('change', () => {
  const f = fixtures.find((x) => x.name === select.value);
  if (!f) {
    return;
  }
  framed = false;
  uiState.assembly = { kind: 'fixture', name: f.name };
  uiState.overrides = EMPTY_OVERRIDES;
  baseline = f;
  activeTemplate = undefined;
  saveUiState();
  syncUrl();
  load(f);
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }
  try {
    const assembly = JSON.parse(await file.text()) as Assembly;
    select.querySelector('option[value=""]')?.remove();
    select.add(new Option(`${assembly.name} (file)`, ''), 0);
    select.selectedIndex = 0;
    framed = false;
    uiState.assembly = { kind: 'upload' };
    uiState.overrides = EMPTY_OVERRIDES;
    baseline = assembly;
    activeTemplate = undefined;
    saveUiState();
    syncUrl();
    load(assembly);
  } catch (err) {
    status.innerHTML = '';
    status.textContent = `Could not read ${file.name}: ${(err as Error).message}`;
  }
});

for (const t of layerToggles) {
  t.addEventListener('change', () => {
    const layer = t.dataset.layer as keyof UiState['layers'];
    uiState.layers[layer] = t.checked;
    saveUiState();
    const group = layers?.[layer];
    if (group) {
      group.visible = t.checked;
    }
  });
}

// Name whatever is under the pointer.
const raycaster = new Raycaster();
const pointer = new Vector2();
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!layers) {
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  // Solids win over the translucent keep-out volumes around them.
  const hit = [layers.solids, layers.keepOuts]
    .filter((g) => g.visible)
    .map((g) => raycaster.intersectObject(g, true).find((h) => h.object.userData.label))
    .find((h) => h !== undefined);
  hover.textContent = hit ? String(hit.object.userData.label) : '';
});

// ---- generation ----

for (const t of TEMPLATES) {
  templateSelect.add(new Option(t.name, t.name));
}

if (TEMPLATES.some((t) => t.name === uiState.template)) {
  templateSelect.value = uiState.template;
} else {
  uiState.template = DEFAULT_UI_STATE.template;
  templateSelect.value = uiState.template;
}
seedInput.value = uiState.seed;
onlyValid.checked = uiState.onlyValid;
for (const t of layerToggles) {
  const layer = t.dataset.layer as keyof UiState['layers'];
  t.checked = uiState.layers[layer];
}

/** Walks seed, seed ± 1, … in the step's direction until a valid build turns up, or gives up after 100 tries. */
const findValidSeed = (template: Template, seed: number, step: number): ReturnType<typeof generateValid> => {
  const dir = step < 0 ? -1 : 1;
  for (let i = 0; i < 100; i++) {
    const g = generateValid(template, gunDomain, seed + dir * i, 1);
    if (g) {
      return g;
    }
  }
  return undefined;
};

/**
 * Generates the seed's assembly (the new baseline) and, unless
 * `preserveOverrides`, drops any panel overrides — a new seed is a new
 * baseline to explore. `preserveOverrides` is for restoring a session
 * (uiState or the URL already carries the overrides to reapply).
 */
const runGenerator = (step = 0, preserveOverrides = false) => {
  const template = TEMPLATES.find((t) => t.name === templateSelect.value);
  if (!template) {
    return;
  }
  let seed = (Number.parseInt(seedInput.value, 10) || 0) + step;
  let generated: Assembly;
  if (onlyValid.checked) {
    const found = findValidSeed(template, seed, step);
    if (!found) {
      status.textContent = `No valid ${template.name} within 100 seeds of ${seed}.`;
      return;
    }
    ({ seed, assembly: generated } = found);
  } else {
    generated = generate(template, gunDomain, seed);
  }
  seedInput.value = String(seed);
  uiState.assembly = { kind: 'generated' };
  uiState.template = template.name;
  uiState.seed = String(seed);
  uiState.onlyValid = onlyValid.checked;
  if (!preserveOverrides) {
    uiState.overrides = EMPTY_OVERRIDES;
  }
  baseline = generated;
  activeTemplate = template;
  const assembly = hasOverrides(uiState.overrides) ? applyOverrides(generated, template, uiState.overrides) : generated;
  const option = new Option(`${assembly.name} (generated)`, '');
  select.querySelector('option[value=""]')?.remove();
  select.add(option, 0);
  select.selectedIndex = 0;
  saveUiState();
  syncUrl();
  load(assembly);
};

templateSelect.addEventListener('change', () => {
  framed = false;
  uiState.template = templateSelect.value;
  saveUiState();
  runGenerator();
});
$<HTMLButtonElement>('generate-btn').addEventListener('click', () => runGenerator());
$<HTMLButtonElement>('next-seed').addEventListener('click', () => runGenerator(1));
$<HTMLButtonElement>('prev-seed').addEventListener('click', () => runGenerator(-1));
seedInput.addEventListener('change', () => {
  uiState.seed = seedInput.value;
  saveUiState();
  runGenerator();
});
onlyValid.addEventListener('change', () => {
  uiState.onlyValid = onlyValid.checked;
  saveUiState();
});

$<HTMLButtonElement>('save').addEventListener('click', () => {
  if (!current) {
    return;
  }
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(current, null, 2)}\n`], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${current.name}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ?fixture=<name> opens a fixture; ?template=<name>&seed=<n> generates one;
// either can add &set=<part.param:value,...> to override params, or
// &set=<part:on|off> to force an optional part in or out (paramPanel.ts).
const query = new URLSearchParams(location.search);
const querySet = query.get('set');
if (querySet !== null) {
  uiState.overrides = parseOverrides(querySet);
}
const initialTemplate = TEMPLATES.find((t) => t.name === query.get('template'));
const queryFixture = fixtures.find((f) => f.name === query.get('fixture'));
if (initialTemplate) {
  templateSelect.value = initialTemplate.name;
  seedInput.value = query.get('seed') ?? '0';
  uiState.template = initialTemplate.name;
  uiState.seed = seedInput.value;
  uiState.assembly = { kind: 'generated' };
  runGenerator(0, true);
} else if (queryFixture) {
  select.value = queryFixture.name;
  uiState.assembly = { kind: 'fixture', name: queryFixture.name };
  baseline = queryFixture;
  activeTemplate = undefined;
  saveUiState();
  syncUrl();
  load(hasOverrides(uiState.overrides) ? applyOverrides(queryFixture, undefined, uiState.overrides) : queryFixture);
} else if (uiState.assembly.kind === 'generated') {
  runGenerator(0, true);
} else {
  const storedFixtureName = uiState.assembly.kind === 'fixture' ? uiState.assembly.name : undefined;
  const storedFixture = fixtures.find((f) => f.name === storedFixtureName);
  const start = storedFixture ?? fixtures.find((f) => f.name === 'archetype-battle-rifle') ?? fixtures[0];
  if (start) {
    select.value = start.name;
    uiState.assembly = { kind: 'fixture', name: start.name };
    baseline = start;
    activeTemplate = undefined;
    saveUiState();
    syncUrl();
    load(hasOverrides(uiState.overrides) ? applyOverrides(start, undefined, uiState.overrides) : start);
  } else {
    saveUiState();
  }
}

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
