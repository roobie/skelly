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
import { generate, generateValid, type Realized, realize, realizeLod } from '../core/generate.ts';
import type { Pose } from '../core/pose.ts';
import type { ValidationProfile } from '../core/rules.ts';
import type { Genome, Template } from '../core/template.ts';
import {
  acidAttackPose,
  acidDeathPose,
  acidHitPose,
  acidIdlePose,
  acidWalkPose,
  acidWindupPose,
} from '../mob/acidPoses.ts';
import { acidTemplate } from '../mob/acidTemplate.ts';
import { amalgamManifest } from '../mob/amalgam.ts';
import { VIEWER_TEMPLATES } from '../mob/amalgamTemplate.ts';
import { ATTACK_CLIPS, type AttackClip, attackClipFor, attackPose } from '../mob/attack.ts';
import { crawlerGaitPose, crawlerHitPose, crawlerPose } from '../mob/crawler.ts';
import { severableParts, severedBoneSet } from '../mob/dismember.ts';
import { DOG_SEVERABLE_PARTS, dogGaitPose, dogHitPose, dogPose } from '../mob/dog.ts';
import { dogTemplate } from '../mob/dogTemplate.ts';
import {
  advanceClock,
  bodyRestExtents,
  createGaitCache,
  footRestExtents,
  type GaitClock,
  INITIAL_CLOCK,
  type LegGeometry,
  legGeometryFor,
  type WalkActor,
  walkPose,
} from '../mob/gait.ts';
import type { HumanoidParams } from '../mob/humanoid.ts';
import { type IdleStance, idlePose } from '../mob/idle.ts';
import { LOOK_AT_REST, type LookAtState, lookAtPose } from '../mob/lookAt.ts';
import { LOOK_AT_PROFILES, type LookAtProfile } from '../mob/lookAtProfiles.ts';
import { deathPose, flinchPose, HIT_FLINCH } from '../mob/reactions.ts';
import { skeletonTemplate } from '../mob/skeletonTemplate.ts';
import { type Actor, buildActor, buildShambler, disposeActor } from './scene.ts';

// Comparison-only bodies are explicit viewer opt-ins rather than consumer entries.
const TEMPLATES: readonly Template[] = [...VIEWER_TEMPLATES, dogTemplate, acidTemplate, skeletonTemplate];

/** Plans posed by the shared humanoid walk, idle, attack and death. */
const usesHumanoidRig = (template: Template): boolean =>
  template.bodyPlan === 'humanoid' || template.bodyPlan === 'skeleton';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const view = $<HTMLElement>('view');
const templateSelect = $<HTMLSelectElement>('template');
const seedInput = $<HTMLInputElement>('seed');
const onlyValid = $<HTMLInputElement>('only-valid');
const voxelSelect = $<HTMLSelectElement>('voxel-size');
const profileSelect = $<HTMLSelectElement>('validation-profile');
const walkFieldset = $<HTMLFieldSetElement>('walk');
const attackFieldset = $<HTMLFieldSetElement>('attack');
const reactionsFieldset = $<HTMLFieldSetElement>('reactions');
const walkOn = $<HTMLInputElement>('walk-on');
const speedInput = $<HTMLInputElement>('speed');
const speedValue = $<HTMLSpanElement>('speed-value');
const idleStanceSelect = $<HTMLSelectElement>('idle-stance');
const attackBtn = $<HTMLButtonElement>('attack-btn');
const attackLoop = $<HTMLInputElement>('attack-loop');
const attackClipSelect = $<HTMLSelectElement>('attack-clip');
const darkScene = $<HTMLInputElement>('dark-scene');
const acidWindup = $<HTMLInputElement>('acid-windup');
const acidWindupLabel = $<HTMLLabelElement>('acid-windup-label');
const hitBtn = $<HTMLButtonElement>('hit-btn');
const dieBtn = $<HTMLButtonElement>('die-btn');
const resetBtn = $<HTMLButtonElement>('reset-btn');
const dieBackward = $<HTMLInputElement>('die-backward');
const severPart = $<HTMLSelectElement>('sever-part');
const severBtn = $<HTMLButtonElement>('sever-btn');
const healBtn = $<HTMLButtonElement>('heal-btn');
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
const hemi = new HemisphereLight(0xdf_e6_ee, 0x2a_26_22, 1.6);
scene.add(hemi);
const sun = new DirectionalLight(0xff_ff_ff, 2.2);
sun.position.set(2, 4, 3);
scene.add(sun);

/** Dim scene lighting to a faint remnant, so self-lit materials (template emission — see scene.ts,
 * fleshMaterial) can be judged as glow in the dark rather than as shaded colour. */
const applySceneLighting = (): void => {
  hemi.intensity = darkScene.checked ? 0.06 : 1.6;
  sun.intensity = darkScene.checked ? 0.04 : 2.2;
};
darkScene.addEventListener('change', () => {
  applySceneLighting();
  updateUrl();
});

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
  readonly template: Template;
  readonly lookAt: LookAtProfile;
  lookAtState: LookAtState;
  readonly realized: Realized;
  readonly actor: Actor;
  readonly params?: HumanoidParams;
  readonly extents?: ReturnType<typeof footRestExtents>;
  readonly bodyExtents?: ReturnType<typeof bodyRestExtents>;
  readonly legGeometry?: LegGeometry | undefined;
  /** Built once per load so its GaitCache stays warm across frames (a per-frame literal would not). */
  readonly walkActor?: WalkActor;
}

let current: Loaded | undefined;
let clock: GaitClock = INITIAL_CLOCK;
let crawlerPhase = 0;
// Ground distance the dog has advanced; drives the walk directly, so its planted paws stay planted at any
// speed (see dogGaitPose). Reset on load like the other walk clocks.
let dogDistance = 0;
let gridZ = 0;
// Runs unconditionally (walking, standing, attacking...) so breathing/sway never stalls; only its phase
// matters, so it's never reset on load/death — a fresh actor just joins the motion already in progress,
// same spirit as idle.ts's own seed-based phase offset for a crowd of actors sharing one body.
let idleTime = 0;
const currentStance = (): IdleStance => idleStanceSelect.value as IdleStance;
const dogStance = (genome: Genome, severed?: ReadonlySet<string>) => ({
  limp: genome.params.limp ?? 0,
  headTilt: genome.params.headTilt ?? 0,
  severed,
});
const ATTACK_COOLDOWN_S = 1.5; // matches deadvox's shambler attack cooldown
let attackTime: number | undefined; // seconds into the playing clip, or undefined when idle
let attackCooldown = 0; // seconds until the loop (if checked) fires the next attack
/** Fallback clip until a template loads; the first load always sets the template's own choice. */
let activeClip: AttackClip = ATTACK_CLIPS['lunge-grab']!;
/** The clip this template's content selects, so the URL records only a deliberate override. */
let templateClipName: string | undefined;
/** A clip named by the page's URL, honoured on every load until the selector is touched by hand. */
let clipOverride: string | undefined;
for (const clip of Object.values(ATTACK_CLIPS)) {
  attackClipSelect.add(new Option(clip.name, clip.name));
}
attackClipSelect.addEventListener('change', () => {
  clipOverride = undefined;
  activeClip = ATTACK_CLIPS[attackClipSelect.value]!;
  attackTime = undefined;
  updateUrl();
});
let hitTime: number | undefined; // seconds into HIT_FLINCH, or undefined when idle
let hitSide = 0; // -1..1, alternates each press so the side-mirror is visible across repeated hits
// Death freezes whatever pose was current (walk, standing, or mid-attack) the instant it starts, and
// plays deathPose forward from that frozen snapshot — same "layer over the current base pose" spirit as
// a flinch, but frozen rather than live, since a falling body doesn't keep striding underneath itself.
let deathTime: number | undefined;
let deathBasePose: Pose | undefined;
let deathDirection: 1 | -1 = 1;
let lastAcidPose: Pose | undefined;
/** Every part cut so far — cumulative, so "Sever" a second part while the first is still missing just adds
 * to it (severedBoneSet handles any redundancy, e.g. severing a hand after its own upperArm already took
 * it, for free). Reset on Heal or a fresh load. Not yet the crowd texture's mask (that's a deadvox/renderer
 * concern) — the main viewer just hides bone meshes directly (see scene.ts's setSeveredBones). */
let severedCuts: string[] = [];
/** The bones hidden by `severedCuts`, recomputed whenever a cut changes; the dog's grounding needs it so
 * severed limbs stop bearing the body. */
let severedBones: ReadonlySet<string> = new Set();

const playAttack = (): void => {
  attackTime = 0; // (re)starts even if one is already playing
};

const playHit = (): void => {
  hitTime = 0; // (re)starts even if one is already playing — layers over whatever's current every frame
  hitSide = hitSide <= 0 ? 1 : -1; // alternate side each press so the mirror is visible across repeats
};

const applySeveredBones = (): void => {
  if (!current) {
    return;
  }
  severedBones = severedBoneSet(current.realized.body.bones, severedCuts);
  current.actor.setSeveredBones(severedBones);
};

const sever = (): void => {
  const part = severPart.value;
  if (part && !severedCuts.includes(part)) {
    severedCuts = [...severedCuts, part];
  }
  applySeveredBones();
};

const heal = (): void => {
  severedCuts = [];
  applySeveredBones();
};

/** Freezes whatever pose is current (walk, standing, or mid-attack) and starts the death fall from that
 * snapshot — a falling body doesn't keep striding underneath itself, unlike a flinch. */
const playDeath = (): void => {
  if (current?.template.bodyPlan === 'acid') {
    deathBasePose = lastAcidPose ?? acidIdlePose(current.realized, idleTime);
    deathDirection = dieBackward.checked ? -1 : 1;
    deathTime = 0;
    return;
  }
  if (!current?.walkActor) {
    return;
  }
  const actor = current.walkActor;
  if (!usesHumanoidRig(current.template)) {
    deathBasePose =
      current.template.bodyPlan === 'dog'
        ? dogPose(current.realized, dogStance(current.genome, severedBones))
        : crawlerPose(current.realized);
    deathDirection = dieBackward.checked ? -1 : 1;
    deathTime = 0;
    return;
  }
  const walking = walkOn.checked;
  const speed = walking ? Number(speedInput.value) : 0;
  const idle = idlePose(actor, currentStance(), idleTime);
  const walkBase: Pose = walkPose(actor, clock, speed, { idle });
  deathBasePose = attackTime === undefined ? walkBase : attackPose(actor, activeClip, attackTime, walkBase);
  deathDirection = dieBackward.checked ? -1 : 1;
  deathTime = 0;
};

const resetDeath = (): void => {
  deathTime = undefined;
  deathBasePose = undefined;
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
  const comparisonOnly = template.status === 'comparison-only';
  description.textContent = template.description;
  if (comparisonOnly) {
    const label = document.createElement('span');
    label.className = 'comparison-only';
    label.textContent = 'comparison only — not for use';
    description.prepend(label, ' ');
  }
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
  const groupRows: (readonly [string, string])[] = Object.entries(template.budgets.groups).map(([name, group]) => {
    const amount = Object.entries(report.stats.perBoneVoxels)
      .filter(([id]) =>
        group.bones.some((pattern) => (pattern.endsWith('*') ? id.startsWith(pattern.slice(0, -1)) : id === pattern)),
      )
      .reduce((sum, [, count]) => sum + count, 0);
    return [`${name} voxels`, String(amount)];
  });
  const rows: readonly (readonly [string, string])[] = [
    ['Voxels', String(report.stats.voxels)],
    ...groupRows,
    ['Validation profile', realized.profile],
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
  params.set('profile', profileSelect.value);
  params.set('speed', speedInput.value);
  params.set('walk', walkOn.checked ? '1' : '0');
  params.set('stance', idleStanceSelect.value);
  const setFlag = (box: HTMLInputElement, key: string): void => {
    if (box.checked) {
      params.set(key, '1');
    }
  };
  setFlag(attackLoop, 'attack');
  setFlag(darkScene, 'dark');
  setFlag(acidWindup, 'windup');
  if (templateClipName !== undefined && attackClipSelect.value !== templateClipName) {
    params.set('clip', attackClipSelect.value);
  }
  if (new URLSearchParams(location.search).get('shot') === '1') {
    params.set('shot', '1');
  }
  history.replaceState(null, '', `?${params.toString()}`);
};

/** Syncs the attack-clip selector with a freshly loaded template: it offers every shared-rig clip
 * beside the template's own choice, so a look can be judged in motion against the alternative on the
 * same body. The URL's clip stays honoured until the selector is touched by hand. */
const syncAttackClip = (template: Template): void => {
  const humanoidRig = usesHumanoidRig(template);
  templateClipName = humanoidRig ? attackClipFor(template).name : undefined;
  attackClipSelect.closest('label')!.hidden = !humanoidRig;
  if (templateClipName !== undefined) {
    attackClipSelect.value = clipOverride ?? templateClipName;
    activeClip = ATTACK_CLIPS[attackClipSelect.value]!;
  }
};

const load = (genome: Genome, realized: Realized, realizeMs: number): void => {
  const template = TEMPLATES.find((candidate) => candidate.name === genome.template);
  if (!template) {
    throw new Error(`No template registered for ${genome.template}`);
  }
  if (current) {
    scene.remove(current.actor.root);
    disposeActor(current.actor);
  }
  const actor = buildActor(realized, genome.voxelSize);
  scene.add(actor.root);
  const staticOnly = template.bodyPlan === 'amalgam';
  let loaded: Loaded = {
    genome,
    template,
    lookAt: LOOK_AT_PROFILES[template.name]!,
    lookAtState: LOOK_AT_REST,
    realized,
    actor,
  };
  if (staticOnly) {
    actor.applyPose({ root: [0, 0, 0], rotations: {} });
    const parts = amalgamManifest(realized.body, realized.voxels)
      .parts.filter((part) => part.severable)
      .map((part) => part.rootBone);
    severPart.replaceChildren(...parts.map((id) => new Option(id, id)));
  } else if (template.bodyPlan === 'acid') {
    lastAcidPose = acidIdlePose(realized, idleTime);
    actor.applyPose(lastAcidPose);
    const parts = realized.body.bones.filter((bone) => bone.disposition === 'sever').map((bone) => bone.id);
    severPart.replaceChildren(...parts.map((id) => new Option(id, id)));
  } else {
    const extents = footRestExtents(realized.body.bones, realized.voxels);
    const bodyExtents = bodyRestExtents(realized.body.bones, realized.voxels);
    const legGeometry = usesHumanoidRig(template) ? legGeometryFor(realized.body.bones, extents, 'L') : undefined;
    const params = genome.params as HumanoidParams;
    const walkActor: WalkActor = {
      bones: realized.body.bones,
      extents,
      params,
      seed: genome.seed,
      cache: createGaitCache(),
    };
    // Never the bind pose, even for this first static frame (e.g. ?shot=1 screenshots, taken before the
    // render loop ticks) — same idle stance the live frame loop would settle into at speed 0.
    let initialPose: Pose;
    if (usesHumanoidRig(template)) {
      initialPose = idlePose(walkActor, currentStance(), idleTime);
    } else if (template.bodyPlan === 'dog') {
      // A fresh load starts whole; `severedCuts` is cleared below, so this pose is deliberately intact.
      initialPose = dogPose(realized, dogStance(genome));
    } else {
      initialPose = crawlerPose(realized);
    }
    actor.applyPose(initialPose);
    loaded = { ...loaded, params, extents, bodyExtents, legGeometry, walkActor };
    severPart.replaceChildren(
      ...(template.bodyPlan === 'dog' ? DOG_SEVERABLE_PARTS : severableParts(realized.body.bones)).map(
        (part) => new Option(part, part),
      ),
    );
  }
  acidWindupLabel.hidden = template.bodyPlan !== 'acid';
  syncAttackClip(template);
  walkFieldset.hidden = staticOnly;
  attackFieldset.hidden = staticOnly;
  reactionsFieldset.hidden = staticOnly;
  current = loaded;
  clock = INITIAL_CLOCK;
  crawlerPhase = 0;
  dogDistance = 0;
  gridZ = 0;
  attackTime = undefined;
  attackCooldown = 0;
  hitTime = undefined;
  resetDeath();
  severedCuts = [];
  applySeveredBones();
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

type ValidCandidate = NonNullable<ReturnType<typeof generateValid>>;

const loadValidated = (
  template: Template,
  found: ValidCandidate,
  voxelSize: number,
  profile: ValidationProfile,
): void => {
  if (profile === 'silhouette' && voxelSize > template.voxelSize) {
    const lod = realizeLod(found, voxelSize);
    load(lod.genome, lod.realized, 0);
    return;
  }
  const genome = { ...found.genome, voxelSize };
  const realized =
    profile === 'full' && voxelSize === template.voxelSize
      ? found.realized
      : realize(genome, { profile, reference: found.realized });
  load(genome, realized, 0);
};

const generateAndLoad = (step = 0): void => {
  const template = TEMPLATES.find((t) => t.name === templateSelect.value);
  if (!template) {
    return;
  }
  let seed = (Number.parseInt(seedInput.value, 10) || 0) + step;
  const voxelSize = voxelOverride() ?? template.voxelSize;
  const profile = profileSelect.value as ValidationProfile;

  if (onlyValid.checked) {
    const dir = step < 0 ? -1 : 1;
    const found = generateValid(template, seed, { direction: dir });
    if (!found) {
      status.textContent = `No valid ${template.name} within 100 seeds of ${seed}.`;
      return;
    }
    ({ seed } = found);
    seedInput.value = String(seed);
    loadValidated(template, found, voxelSize, profile);
    return;
  }

  const overrides = voxelSize === template.voxelSize ? undefined : { voxelSize };
  const genome = generate(template, seed, overrides);
  seedInput.value = String(seed);
  const t0 = performance.now();
  const realized = realize(genome, { profile });
  load(genome, realized, performance.now() - t0);
};

// ---- UI wiring ----

templateSelect.addEventListener('change', () => generateAndLoad());
seedInput.addEventListener('change', () => generateAndLoad());
$<HTMLButtonElement>('prev-seed').addEventListener('click', () => generateAndLoad(-1));
$<HTMLButtonElement>('next-seed').addEventListener('click', () => generateAndLoad(1));
$<HTMLButtonElement>('generate-btn').addEventListener('click', () => generateAndLoad());
voxelSelect.addEventListener('change', () => generateAndLoad());
profileSelect.addEventListener('change', () => generateAndLoad());

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
attackLoop.addEventListener('change', updateUrl);
acidWindup.addEventListener('change', () => {
  attackTime = undefined;
  updateUrl();
});
idleStanceSelect.addEventListener('change', updateUrl);
$<HTMLButtonElement>('preset-wander').addEventListener('click', () => {
  walkOn.checked = true;
  setSpeed(0.8);
});
$<HTMLButtonElement>('preset-chase').addEventListener('click', () => {
  walkOn.checked = true;
  setSpeed(2.8);
});

attackBtn.addEventListener('click', playAttack);
hitBtn.addEventListener('click', playHit);
dieBtn.addEventListener('click', playDeath);
resetBtn.addEventListener('click', resetDeath);
severBtn.addEventListener('click', sever);
healBtn.addEventListener('click', heal);
globalThis.addEventListener('keydown', (e) => {
  // Ignore while typing into a field (e.g. the seed number input).
  if (document.activeElement?.tagName === 'INPUT') {
    return;
  }
  const key = e.key.toLowerCase();
  if (key === 'a') {
    playAttack();
  } else if (key === 'h') {
    playHit();
  } else if (key === 'k') {
    playDeath();
  } else if (key === 'r') {
    resetDeath();
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
const profileParam = query.get('profile');
if (profileParam === 'full' || profileParam === 'silhouette') {
  profileSelect.value = profileParam;
}
setSpeed(Number(query.get('speed') ?? '0.8'));
walkOn.checked = query.get('walk') === '1';
attackLoop.checked = query.get('attack') === '1';
acidWindup.checked = query.get('windup') === '1';
darkScene.checked = query.get('dark') === '1';
applySceneLighting();
const clipParam = query.get('clip');
if (clipParam && [...attackClipSelect.options].some((o) => o.value === clipParam)) {
  clipOverride = clipParam;
  attackClipSelect.value = clipParam;
  activeClip = ATTACK_CLIPS[clipParam]!;
}
const stanceParam = query.get('stance');
if (stanceParam && [...idleStanceSelect.options].some((o) => o.value === stanceParam)) {
  idleStanceSelect.value = stanceParam;
}
generateAndLoad();
resize();
renderer.render(scene, camera);

/** Advances the walk clock/gridZ if walking — keeps advancing through an attack too. */
const advanceWalk = (dt: number, walking: boolean, speed: number): void => {
  if (!walking || speed <= 0 || !current) {
    return;
  }
  if (current.template.bodyPlan === 'crawler') {
    crawlerPhase += speed * dt * Math.PI;
    gridZ = (gridZ + speed * dt) % 0.5;
    groundGroup.position.z = gridZ;
    return;
  }
  if (current.template.bodyPlan === 'dog' || current.template.bodyPlan === 'acid') {
    dogDistance += speed * dt;
    gridZ = (gridZ + speed * dt) % 0.5;
    groundGroup.position.z = gridZ;
    return;
  }
  if (!(current.walkActor && current.params && current.legGeometry)) {
    return;
  }
  clock = advanceClock(clock, speed * dt, {
    params: current.params,
    geomL: current.legGeometry,
    speed,
    seed: current.genome.seed,
    cache: current.walkActor.cache,
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

/** Ends a flinch once its clip finishes; does nothing else — flinchPose reads hitTime itself. */
const advanceHit = (dt: number): void => {
  if (hitTime === undefined) {
    return;
  }
  hitTime += dt;
  if (hitTime > HIT_FLINCH.duration) {
    hitTime = undefined;
  }
}; // deliberately not gated on death: a fresh hit that lands mid-flinch is fine to just restart.

const applyLookAt = (loaded: Loaded, pose: Pose, dt: number): void => {
  loaded.actor.root.updateMatrixWorld(true);
  const target = loaded.actor.root.worldToLocal(camera.position.clone());
  const result = lookAtPose({
    bones: loaded.realized.body.bones,
    pose,
    target: [target.x, target.y, target.z],
    profile: loaded.lookAt,
    state: loaded.lookAtState,
    gazeFrameDelta: dt,
  });
  loaded.lookAtState = result.state;
  loaded.actor.applyPose(result.pose);
};

/** Advances and poses one frame while alive: walk/attack/hit clocks all tick, and the pose is a walk (or
 * standing), optionally attacked, optionally flinched on top. */
const applyCrawlerFrame = (loaded: Loaded, dt: number): void => {
  const speed = walkOn.checked ? Number(speedInput.value) : 0;
  advanceWalk(dt, walkOn.checked, speed);
  advanceHit(dt);
  const basePose = crawlerGaitPose(loaded.realized, crawlerPhase, speed);
  const pose = hitTime === undefined ? basePose : crawlerHitPose(loaded.realized, basePose, hitTime, hitSide);
  applyLookAt(loaded, pose, dt);
};

const applyDogFrame = (loaded: Loaded, dt: number): void => {
  const speed = walkOn.checked ? Number(speedInput.value) : 0;
  advanceWalk(dt, walkOn.checked, speed);
  advanceHit(dt);
  const basePose = dogGaitPose(loaded.realized, dogDistance, speed, dogStance(loaded.genome, severedBones));
  const pose =
    hitTime === undefined
      ? basePose
      : dogHitPose(loaded.realized, basePose, hitTime, { side: hitSide, severed: severedBones });
  applyLookAt(loaded, pose, dt);
};

const applyAcidFrame = (loaded: Loaded, dt: number): void => {
  const speed = walkOn.checked ? Number(speedInput.value) : 0;
  advanceWalk(dt, walkOn.checked, speed);
  const duration = acidWindup.checked ? acidTemplate.animation.windupDuration : acidTemplate.animation.attackDuration;
  advanceAttack(dt, duration);
  if (hitTime !== undefined) {
    hitTime += dt;
    if (hitTime > acidTemplate.animation.hitDuration) {
      hitTime = undefined;
    }
  }
  const base = acidWalkPose(loaded.realized, dogDistance, speed, idleTime);
  let attacked = base;
  if (attackTime !== undefined) {
    attacked = acidWindup.checked
      ? acidWindupPose(loaded.realized, base, Math.sin((Math.PI * attackTime) / duration))
      : acidAttackPose(loaded.realized, base, attackTime);
  }
  lastAcidPose = hitTime === undefined ? attacked : acidHitPose(loaded.realized, attacked, hitTime, hitSide);
  applyLookAt(loaded, lastAcidPose, dt);
};

const applyLiveFrame = (loaded: Loaded, dt: number): void => {
  if (loaded.template.bodyPlan === 'acid') {
    applyAcidFrame(loaded, dt);
    return;
  }
  if (loaded.template.bodyPlan === 'amalgam') {
    return;
  }
  if (loaded.template.bodyPlan === 'crawler') {
    applyCrawlerFrame(loaded, dt);
    return;
  }
  if (loaded.template.bodyPlan === 'dog') {
    applyDogFrame(loaded, dt);
    return;
  }
  if (!loaded.walkActor) {
    return;
  }
  const walking = walkOn.checked;
  const speed = walking ? Number(speedInput.value) : 0;
  advanceWalk(dt, walking, speed);
  advanceAttack(dt, activeClip.duration);
  advanceHit(dt);

  const actor = loaded.walkActor;
  const idle = idlePose(actor, currentStance(), idleTime);
  const basePose: Pose = walkPose(actor, clock, speed, { idle });
  const attacked = attackTime === undefined ? basePose : attackPose(actor, activeClip, attackTime, basePose);
  const pose = hitTime === undefined ? attacked : flinchPose(actor, hitTime, attacked, { side: hitSide });
  applyLookAt(loaded, pose, dt);
};

/** Advances and poses one frame while dead: deathTime free-runs (deathPose clamps internally), from the
 * pose frozen at the moment of death — a falling body doesn't keep striding or swinging underneath itself. */
const applyDeathFrame = (loaded: Loaded, dt: number): void => {
  if (loaded.template.bodyPlan === 'acid') {
    deathTime = (deathTime ?? 0) + dt;
    loaded.actor.applyPose(acidDeathPose(loaded.realized, deathBasePose!, deathTime, deathDirection));
    return;
  }
  if (!(loaded.walkActor && loaded.bodyExtents)) {
    return;
  }
  deathTime = (deathTime ?? 0) + dt;
  // A fresh wrapper per frame, but it carries the persistent actor's cache.
  const actor = { ...loaded.walkActor, bodyExtents: loaded.bodyExtents };
  loaded.actor.applyPose(deathPose(actor, deathBasePose!, deathTime, { direction: deathDirection }));
};

let lastFrameTime = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  idleTime += dt;
  controls.update();

  if (current) {
    if (deathTime === undefined) {
      applyLiveFrame(current, dt);
    } else {
      applyDeathFrame(current, dt);
    }
  }

  renderer.render(scene, camera);
});
