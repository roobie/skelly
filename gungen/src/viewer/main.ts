import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Issue } from '../core/issue.ts';
import type { Assembly } from '../core/schema.ts';
import { type Report, validate } from '../core/validate.ts';
import { gunDomain } from '../gun/domain.ts';
import { type Layers, buildLayers, disposeGroup } from './scene.ts';

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
const layerToggles = [...document.querySelectorAll<HTMLInputElement>('#layers input')];

// ---- three.js setup ----

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x16181c);
scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x2a2622, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(20, 40, 30);
scene.add(sun);
const grid = new THREE.GridHelper(120, 60, 0x3a3f46, 0x262a30);
grid.position.y = -16;
scene.add(grid);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
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

// ---- state ----

let report: Report | undefined;
let layers: Layers | undefined;
let focused: Issue | undefined;
let framed = false;

const redraw = () => {
  if (!report) return;
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

const frame = (group: THREE.Object3D) => {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  // Fit the bounding sphere to the narrower of the two fields of view.
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const distance = sphere.radius / Math.sin(Math.min(vfov, hfov) / 2);
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).add(new THREE.Vector3(0.2, 0.3, 1).normalize().multiplyScalar(distance));
  controls.update();
};

const renderPanel = (assembly: Assembly) => {
  if (!report) return;
  description.textContent = assembly.description ?? '';
  const failed = [...new Set(report.issues.map((i) => i.rule))].sort();
  const expected = assembly.expect ? [...assembly.expect].sort() : undefined;
  const verdict = report.ok
    ? '<span class="pass">PASS</span>'
    : `<span class="fail">FAIL</span> <span class="note">(${report.issues.length} issue${report.issues.length === 1 ? '' : 's'})</span>`;
  const note =
    expected === undefined
      ? ''
      : expected.join() === failed.join()
        ? ' <span class="note">· as expected</span>'
        : ` <span class="fail">· expected ${expected.join(', ') || 'pass'}</span>`;
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
    group.label = kind === 'archetype' ? 'Archetypes' : kind === 'broken' ? 'Broken (one rule each)' : kind;
    groups.set(kind, group);
    select.append(group);
  }
  group.append(new Option(f.name, f.name));
}
select.addEventListener('change', () => {
  const f = fixtures.find((x) => x.name === select.value);
  if (!f) return;
  framed = false;
  load(f);
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const assembly = JSON.parse(await file.text()) as Assembly;
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
    if (group) group.visible = t.checked;
  });
}

// Name whatever is under the pointer.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!layers) return;
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

const initial = new URLSearchParams(location.search).get('fixture');
const start =
  fixtures.find((f) => f.name === initial) ??
  fixtures.find((f) => f.name === 'archetype-rifle') ??
  fixtures[0];
if (start) {
  select.value = start.name;
  load(start);
}

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
