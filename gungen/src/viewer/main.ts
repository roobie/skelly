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
import { type Report, validate } from '../core/validate.ts';
import { gunDomain } from '../gun/domain.ts';
import { TEMPLATES } from '../gun/templates.ts';
import { buildLayers, disposeGroup, type Layers } from './scene.ts';

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
    load(assembly);
  } catch (err) {
    status.innerHTML = '';
    status.textContent = `Could not read ${file.name}: ${(err as Error).message}`;
  }
});

for (const t of layerToggles) {
  t.addEventListener('change', () => {
    const group = layers?.[t.dataset.layer as keyof Layers];
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

const runGenerator = (step = 0) => {
  const template = TEMPLATES.find((t) => t.name === templateSelect.value);
  if (!template) {
    return;
  }
  let seed = (Number.parseInt(seedInput.value, 10) || 0) + step;
  let assembly: Assembly;
  if (onlyValid.checked) {
    // Walk in the direction of the step until a seed passes.
    const dir = step < 0 ? -1 : 1;
    let found: ReturnType<typeof generateValid>;
    for (let i = 0; i < 100 && !found; i++) {
      const g = generateValid(template, gunDomain, seed + dir * i, 1);
      if (g) {
        found = g;
      }
    }
    if (!found) {
      status.textContent = `No valid ${template.name} within 100 seeds of ${seed}.`;
      return;
    }
    ({ seed, assembly } = found);
  } else {
    assembly = generate(template, gunDomain, seed);
  }
  seedInput.value = String(seed);
  const option = new Option(`${assembly.name} (generated)`, '');
  select.querySelector('option[value=""]')?.remove();
  select.add(option, 0);
  select.selectedIndex = 0;
  load(assembly);
};

templateSelect.addEventListener('change', () => {
  framed = false;
  runGenerator();
});
$<HTMLButtonElement>('generate-btn').addEventListener('click', () => runGenerator());
$<HTMLButtonElement>('next-seed').addEventListener('click', () => runGenerator(1));
$<HTMLButtonElement>('prev-seed').addEventListener('click', () => runGenerator(-1));
seedInput.addEventListener('change', () => runGenerator());

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

// ?fixture=<name> opens a fixture; ?template=<name>&seed=<n> generates one.
const query = new URLSearchParams(location.search);
const initialTemplate = TEMPLATES.find((t) => t.name === query.get('template'));
if (initialTemplate) {
  templateSelect.value = initialTemplate.name;
  seedInput.value = query.get('seed') ?? '0';
  runGenerator();
} else {
  const start =
    fixtures.find((f) => f.name === query.get('fixture')) ??
    fixtures.find((f) => f.name === 'archetype-rifle') ??
    fixtures[0];
  if (start) {
    select.value = start.name;
    load(start);
  }
}

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
