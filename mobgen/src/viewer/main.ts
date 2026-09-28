import {
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  MathUtils,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generate, type Realized, realize } from '../core/generate.ts';
import { IDENTITY_POSE, type Pose } from '../core/pose.ts';
import type { Genome } from '../core/template.ts';
import { ATTACK_CLIPS, attackPose } from '../mob/attack.ts';
import {
  advanceClock,
  footRestExtents,
  type GaitClock,
  INITIAL_CLOCK,
  type LegGeometry,
  legGeometryFor,
  walkPose,
} from '../mob/gait.ts';
import type { HumanoidParams } from '../mob/humanoid.ts';
import { TEMPLATES } from '../mob/templates.ts';
import { type Actor, buildActor, buildShambler, disposeActor } from './scene.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const view = $<HTMLElement>('view');
const templateSelect = $<HTMLSelectElement>('template');
const seedInput = $<HTMLInputElement>('seed');
const onlyValid = $<HTMLInputElement>('only-valid');
const voxelSelect = $<HTMLSelectElement>('voxel-size');
const walkOn = $<HTMLInputElement>('walk-on');
const speedInput = $<HTMLInputElement>('speed');
const speedValue = $<HTMLSpanElement>('speed-value');
const attackBtn = $<HTMLButtonElement>('attack-btn');
const attackLoop = $<HTMLInputElement>('attack-loop');
const description = $<HTMLParagraphElement>('description');
const status = $<HTMLDivElement>('status');
const issueList = $<HTMLOListElement>('issues');
const statsList = $<HTMLDivElement>('stats');
const hover = $<HTMLParagraphElement>('hover');
const layerToggles = [...document.querySelectorAll<HTMLInputElement>('#layers input')];

if (new URLSearchParams(location.search).get('shot') === '1') {
  document.body.classList.add('shot');
}

for (const t of TEMPLATES) {
  templateSelect.add(new Option(t.name, t.name));
}

// ---- three.js setup ----

const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
view.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(0x16_18_1c);
scene.add(new HemisphereLight(0xdf_e6_ee, 0x2a_26_22, 1.6));
const sun = new DirectionalLight(0xff_ff_ff, 2.2);
sun.position.set(2, 4, 3);
scene.add(sun);

// One 0.5 m/cell grid (a deadvox block) that scrolls under the figure while it walks, plus a finer
// one at voxel spacing near the origin (cheap: just extra lines).
const groundGroup = new Group();
const mainGrid = new GridHelper(40, 80, 0x3a_3f_46, 0x26_2a_30);
groundGroup.add(mainGrid);
let fineGrid: GridHelper | undefined;
const FINE_GRID_EXTENT = 1.5;
const updateFineGrid = (voxelSize: number): void => {
  if (fineGrid) {
    groundGroup.remove(fineGrid);
    fineGrid.geometry.dispose();
    (fineGrid.material as { dispose: () => void }).dispose();
  }
  const divisions = Math.max(1, Math.round(FINE_GRID_EXTENT / voxelSize));
  fineGrid = new GridHelper(FINE_GRID_EXTENT, divisions, 0x40_46_4e, 0x2a_2e_34);
  fineGrid.position.y = 0.002; // just above the main grid, so lines don't z-fight
  groundGroup.add(fineGrid);
};
scene.add(groundGroup);

const shambler = buildShambler();
scene.add(shambler);

const camera = new PerspectiveCamera(40, 1, 0.01, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const resize = (): void => {
  const { clientWidth: w, clientHeight: h } = view;
  renderer.setSize(w, h);
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
};
resize();
new ResizeObserver(resize).observe(view);

// ---- state ----

interface Loaded {
  readonly genome: Genome;
  readonly realized: Realized;
  readonly actor: Actor;
  readonly params: HumanoidParams;
  readonly extents: ReturnType<typeof footRestExtents>;
  readonly legGeometry: LegGeometry;
}

let current: Loaded | undefined;
let clock: GaitClock = INITIAL_CLOCK;
let gridZ = 0;
const ATTACK_COOLDOWN_S = 1.5; // matches deadvox's shambler attack cooldown
let attackTime: number | undefined; // seconds into ATTACK_CLIPS.LUNGE_GRAB, or undefined when idle
let attackCooldown = 0; // seconds until the loop (if checked) fires the next attack

const playAttack = (): void => {
  attackTime = 0; // (re)starts even if one is already playing
};

const frame = (): void => {
  if (!current) {
    return;
  }
  current.actor.root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(current.actor.flesh);
  if (shambler.visible) {
    box.expandByObject(shambler);
  }
  if (box.isEmpty()) {
    return;
  }
  const sphere = box.getBoundingSphere(new Sphere());
  const vfov = MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const distance = (sphere.radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.15;
  controls.target.copy(sphere.center);
  // Figures face -Z (conventions.ts): a camera on the -Z side looks back at the front of the face.
  camera.position.copy(sphere.center).add(new Vector3(0.5, 0.35, -1).normalize().multiplyScalar(distance));
  controls.update();
};

const applyLayerVisibility = (): void => {
  if (!current) {
    return;
  }
  for (const t of layerToggles) {
    const { layer } = t.dataset;
    if (layer === 'shambler') {
      shambler.visible = t.checked;
    } else if (layer === 'flesh') {
      current.actor.flesh.visible = t.checked;
    } else if (layer === 'skeleton') {
      current.actor.skeleton.visible = t.checked;
    } else if (layer === 'colorByBone') {
      current.actor.colorByBone.visible = t.checked;
    }
  }
};

const renderPanel = (realizeMs: number): void => {
  if (!current) {
    return;
  }
  const { genome, realized } = current;
  const template = TEMPLATES.find((t) => t.name === genome.template)!;
  description.textContent = template.description;
  const { report } = realized;
  status.innerHTML = report.ok
    ? '<span class="pass">PASS</span>'
    : `<span class="fail">FAIL</span> <span class="note">(${report.issues.length} issue${report.issues.length === 1 ? '' : 's'})</span>`;
  issueList.replaceChildren(
    ...report.issues.map((issue) => {
      const li = document.createElement('li');
      const rule = document.createElement('span');
      rule.className = 'rule';
      rule.textContent = issue.rule;
      li.append(rule, issue.message);
      return li;
    }),
  );
  const headJaw = (report.stats.perBoneVoxels.head ?? 0) + (report.stats.perBoneVoxels.jaw ?? 0);
  const rows: readonly (readonly [string, string])[] = [
    ['Voxels', String(report.stats.voxels)],
    ['Head+jaw voxels', String(headJaw)],
    ['Triangles', String(report.stats.triangles)],
    ['Draw objects', String(realized.meshes.size)],
    ['Realize time', `${realizeMs.toFixed(1)} ms`],
  ];
  statsList.replaceChildren(
    ...rows.map(([k, v]) => {
      const row = document.createElement('div');
      const kEl = document.createElement('span');
      kEl.className = 'k';
      kEl.textContent = k;
      const vEl = document.createElement('span');
      vEl.textContent = v;
      row.append(kEl, vEl);
      return row;
    }),
  );
};

const updateUrl = (): void => {
  const params = new URLSearchParams();
  params.set('template', templateSelect.value);
  params.set('seed', seedInput.value);
  if (voxelSelect.value !== 'template') {
    params.set('voxel', voxelSelect.value);
  }
  params.set('speed', speedInput.value);
  params.set('walk', walkOn.checked ? '1' : '0');
  if (new URLSearchParams(location.search).get('shot') === '1') {
    params.set('shot', '1');
  }
  history.replaceState(null, '', `?${params.toString()}`);
};

const load = (genome: Genome, realized: Realized, realizeMs: number): void => {
  if (current) {
    scene.remove(current.actor.root);
    disposeActor(current.actor);
  }
  const actor = buildActor(realized, genome.voxelSize);
  scene.add(actor.root);
  actor.applyPose(IDENTITY_POSE);
  const extents = footRestExtents(realized.body.bones, realized.voxels);
  const legGeometry = legGeometryFor(realized.body.bones, extents, 'L');
  current = { genome, realized, actor, params: genome.params as HumanoidParams, extents, legGeometry };
  clock = INITIAL_CLOCK;
  gridZ = 0;
  attackTime = undefined;
  attackCooldown = 0;
  groundGroup.position.z = 0;
  updateFineGrid(genome.voxelSize);
  applyLayerVisibility();
  renderPanel(realizeMs);
  updateUrl();
  frame();
};

// ---- generation ----

const voxelOverride = (): number | undefined =>
  voxelSelect.value === 'template' ? undefined : Number(voxelSelect.value);

const generateAndLoad = (step = 0): void => {
  const template = TEMPLATES.find((t) => t.name === templateSelect.value);
  if (!template) {
    return;
  }
  let seed = (Number.parseInt(seedInput.value, 10) || 0) + step;
  const voxelSize = voxelOverride();
  const overrides = voxelSize === undefined ? undefined : { voxelSize };

  if (onlyValid.checked) {
    const dir = step < 0 ? -1 : 1;
    let found: { genome: Genome; realized: Realized } | undefined;
    for (let i = 0; i < 100 && !found; i++) {
      const genome = generate(template, seed + dir * i, overrides);
      const realized = realize(genome);
      if (realized.report.ok) {
        found = { genome, realized };
      }
    }
    if (!found) {
      status.textContent = `No valid ${template.name} within 100 seeds of ${seed}.`;
      return;
    }
    ({ seed } = found.genome);
    seedInput.value = String(seed);
    load(found.genome, found.realized, 0);
    return;
  }

  const genome = generate(template, seed, overrides);
  seedInput.value = String(seed);
  const t0 = performance.now();
  const realized = realize(genome);
  load(genome, realized, performance.now() - t0);
};

// ---- UI wiring ----

templateSelect.addEventListener('change', () => generateAndLoad());
seedInput.addEventListener('change', () => generateAndLoad());
$<HTMLButtonElement>('prev-seed').addEventListener('click', () => generateAndLoad(-1));
$<HTMLButtonElement>('next-seed').addEventListener('click', () => generateAndLoad(1));
$<HTMLButtonElement>('generate-btn').addEventListener('click', () => generateAndLoad());
voxelSelect.addEventListener('change', () => generateAndLoad());

$<HTMLButtonElement>('save').addEventListener('click', () => {
  if (!current) {
    return;
  }
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(current.genome, null, 2)}\n`], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${current.genome.template}-${current.genome.seed}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

const setSpeed = (v: number): void => {
  speedInput.value = String(v);
  speedValue.textContent = v.toFixed(2);
  updateUrl();
};
speedInput.addEventListener('input', () => setSpeed(Number(speedInput.value)));
walkOn.addEventListener('change', updateUrl);
$<HTMLButtonElement>('preset-wander').addEventListener('click', () => {
  walkOn.checked = true;
  setSpeed(0.8);
});
$<HTMLButtonElement>('preset-chase').addEventListener('click', () => {
  walkOn.checked = true;
  setSpeed(2.8);
});

attackBtn.addEventListener('click', playAttack);
globalThis.addEventListener('keydown', (e) => {
  // Ignore while typing into a field (e.g. the seed number input).
  if (e.key.toLowerCase() === 'a' && document.activeElement?.tagName !== 'INPUT') {
    playAttack();
  }
});

for (const t of layerToggles) {
  t.addEventListener('change', () => {
    applyLayerVisibility();
    frame();
  });
}

// Name whatever is under the pointer, and how many voxels it owns (skeleton/shambler have none).
const raycaster = new Raycaster();
const pointer = new Vector2();
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!current) {
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const targets = [current.actor.flesh, current.actor.colorByBone].filter((g) => g.visible);
  const hit = targets.flatMap((g) => raycaster.intersectObject(g, true)).find((h) => h.object.userData.boneId);
  if (!hit) {
    hover.textContent = '';
    return;
  }
  const { boneId, voxelCount } = hit.object.userData as { boneId: string; voxelCount?: number };
  hover.textContent = voxelCount === undefined ? boneId : `${boneId} — ${voxelCount} voxels`;
});

// ---- initial load from the URL, then the render loop ----
// Everything above and below is synchronous (generation and three.js object construction never
// wait on anything), so the very first frame renders before the page's load event — headless
// screenshots (?shot=1) don't need to wait for anything either.

const query = new URLSearchParams(location.search);
const initialTemplate = TEMPLATES.find((t) => t.name === query.get('template')) ?? TEMPLATES[0]!;
templateSelect.value = initialTemplate.name;
seedInput.value = query.get('seed') ?? '7';
const voxelParam = query.get('voxel');
if (voxelParam && [...voxelSelect.options].some((o) => o.value === voxelParam)) {
  voxelSelect.value = voxelParam;
}
setSpeed(Number(query.get('speed') ?? '0.8'));
walkOn.checked = query.get('walk') === '1';
generateAndLoad();
resize();
renderer.render(scene, camera);

/** Advances the walk clock/gridZ if walking — keeps advancing through an attack too. */
const advanceWalk = (dt: number, walking: boolean, speed: number): void => {
  if (!(walking && speed > 0 && current)) {
    return;
  }
  clock = advanceClock(clock, speed * dt, {
    params: current.params,
    geomL: current.legGeometry,
    speed,
    seed: current.genome.seed,
  });
  gridZ = (gridZ + speed * dt) % 0.5;
  groundGroup.position.z = gridZ;
};

/** Advances the attack clock: fires the loop's next attack (if checked) and ends one that's finished. */
const advanceAttack = (dt: number, clipDuration: number): void => {
  if (attackLoop.checked) {
    attackCooldown -= dt;
    if (attackCooldown <= 0) {
      attackTime = 0;
      attackCooldown = ATTACK_COOLDOWN_S;
    }
  }
  if (attackTime !== undefined) {
    attackTime += dt;
    if (attackTime > clipDuration) {
      attackTime = undefined;
    }
  }
};

let lastFrameTime = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  controls.update();

  if (current) {
    const walking = walkOn.checked;
    const speed = walking ? Number(speedInput.value) : 0;
    advanceWalk(dt, walking, speed);
    const clip = ATTACK_CLIPS.LUNGE_GRAB!;
    advanceAttack(dt, clip.duration);

    const actor = {
      bones: current.realized.body.bones,
      extents: current.extents,
      params: current.params,
      seed: current.genome.seed,
    };
    const basePose: Pose = walking ? walkPose(actor, clock, speed) : IDENTITY_POSE;
    const pose = attackTime === undefined ? basePose : attackPose(actor, clip, attackTime, basePose);
    current.actor.applyPose(pose);
  }

  renderer.render(scene, camera);
});
