// Crowd stress test: how many mobgen actors can walk at once, and what it costs, in either of two
// render paths (?mode=bones|skinned). See stressActors.ts for how one actor's three.js objects are
// built and posed in each path; this file owns the DOM/HUD, the crowd simulation (paths, speeds,
// attacks) and the sweep that compares both paths across actor counts.

import {
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  MathUtils,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Pose } from '../core/pose.ts';
import { chance, range, seededRng } from '../core/random.ts';
import { ATTACK_CLIPS, attackPose } from '../mob/attack.ts';
import { advanceClock, type GaitClock, walkPose } from '../mob/gait.ts';
import {
  buildPoolRender,
  createActor,
  disposePoolRender,
  generatePoolEntry,
  type Mode,
  type PoolEntry,
  type PoolRender,
  type StressActor,
} from './stressActors.ts';

const TAU = Math.PI * 2;
const LUNGE_GRAB = ATTACK_CLIPS.LUNGE_GRAB!;
const ATTACKER_FRACTION = 0.1;
const GRID_SPACING = 3; // metres between actor path centres — clears a ~1-1.1 m radius circle plus lunge reach
const SWEEP_NS = [15, 30, 60, 120, 240] as const;
const SWEEP_SKIP_MS = 1000;
const SWEEP_MEASURE_MS = 4000;
const HUD_WINDOW_MS = 2000;
const SAMPLE_RETENTION_MS = 20_000; // comfortably covers the sweep's own SWEEP_MEASURE_MS window

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const view = $<HTMLElement>('view');
const hud = $<HTMLPreElement>('hud');
const poolStatus = $<HTMLDivElement>('pool-status');
const modeBtn = $<HTMLButtonElement>('mode-btn');
const actorsMinus = $<HTMLButtonElement>('actors-minus');
const actorsPlus = $<HTMLButtonElement>('actors-plus');
const actorsDouble = $<HTMLButtonElement>('actors-double');
const pauseToggle = $<HTMLInputElement>('pause-toggle');
const sweepBtn = $<HTMLButtonElement>('sweep-btn');
const sweepStatus = $<HTMLDivElement>('sweep-status');
const sweepOutput = $<HTMLPreElement>('sweep-output');
const controlButtons = [modeBtn, actorsMinus, actorsPlus, actorsDouble, sweepBtn];
// Disabled until the pool finishes generating (rebuild/sweep need a complete pool); re-enabled once
// the main loop below sees pool.length === poolSize for the first time.
for (const btn of controlButtons) {
  btn.disabled = true;
}

// ---- three.js setup (mirrors main.ts's) ----

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
view.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(0x16_18_1c);
scene.add(new HemisphereLight(0xdf_e6_ee, 0x2a_26_22, 1.6));
const sun = new DirectionalLight(0xff_ff_ff, 2.2);
sun.position.set(2, 4, 3);
scene.add(sun);

// Everything actor-related lives under `world`, which is never itself moved: buildSkinnedActor's own
// comment explains why a SkinnedMesh's crowd placement has to be folded into its root bone rather than
// a wrapping Group's transform, and that only holds if `world` (and the mesh's/root bone's direct
// parent) stays at the identity transform forever.
const world = new Group();
scene.add(world);

let groundGrid: GridHelper | undefined;
const updateGround = (halfExtent: number): void => {
  if (groundGrid) {
    scene.remove(groundGrid);
    groundGrid.geometry.dispose();
    (groundGrid.material as { dispose: () => void }).dispose();
  }
  const size = Math.max(4, Math.ceil((halfExtent * 2) / GRID_SPACING) * GRID_SPACING + GRID_SPACING);
  groundGrid = new GridHelper(size, Math.round(size / 0.5), 0x3a_3f_46, 0x26_2a_30);
  scene.add(groundGrid);
};

const camera = new PerspectiveCamera(45, 1, 0.05, 2000);
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

/** Frames the whole crowd's grid footprint (called once per rebuild, not every frame — after that the
 * user is free to orbit/zoom). */
const frameCrowd = (halfExtent: number): void => {
  const vfov = MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const distance = (halfExtent / Math.sin(Math.min(vfov, hfov) / 2)) * 1.15;
  controls.target.set(0, 0.9, 0);
  camera.position.set(0, distance * 0.55, distance * 0.85);
  controls.update();
};

// ---- query params / URL ----

const query = new URLSearchParams(location.search);
let mode: Mode = query.get('mode') === 'bones' ? 'bones' : 'skinned';
let actorCount = Math.max(1, Number.parseInt(query.get('n') ?? '60', 10) || 60);
const poolSize = Math.max(1, Number.parseInt(query.get('pool') ?? '12', 10) || 12);

const updateUrl = (): void => {
  const params = new URLSearchParams();
  params.set('mode', mode);
  params.set('n', String(actorCount));
  if (poolSize !== 12) {
    params.set('pool', String(poolSize));
  }
  history.replaceState(null, '', `?${params.toString()}`);
};

// ---- pool: generated incrementally, one entry per animation frame ----

const pool: PoolEntry[] = [];
let poolRenders: PoolRender[] = [];
let poolNextSeed = 1; // one running counter across every template slot — simpler than a per-template
// cursor, and still gives every pool entry its own distinct seed (see generatePoolEntry's nextSeed)
let poolTotalMs = 0;
let poolMaxMs = 0;
let poolFailed: string | undefined;

const stepPoolBuild = (): void => {
  if (pool.length >= poolSize || poolFailed) {
    return;
  }
  try {
    const { entry, ms, nextSeed } = generatePoolEntry(pool.length, poolNextSeed);
    pool.push(entry);
    poolNextSeed = nextSeed;
    poolTotalMs += ms;
    poolMaxMs = Math.max(poolMaxMs, ms);
  } catch (err) {
    poolFailed = err instanceof Error ? err.message : String(err);
  }
};

// ---- crowd: n actors, each referencing pool[i % pool.length] ----

interface PathState {
  readonly cx: number;
  readonly cz: number;
  readonly radius: number;
  readonly dir: 1 | -1;
  angle: number;
}

interface CrowdMember {
  readonly actor: StressActor;
  readonly poolIndex: number;
  readonly path: PathState;
  readonly speed: number;
  readonly attacker: boolean;
  readonly attackIntervalS: number;
  clock: GaitClock;
  attackTime: number | undefined;
  attackCooldown: number;
}

let crowd: CrowdMember[] = [];

const gridLayout = (n: number): { readonly cols: number; readonly rows: number } => {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  return { cols, rows: Math.ceil(n / cols) };
};

const disposeCrowd = (): void => {
  for (const member of crowd) {
    for (const obj of member.actor.sceneObjects) {
      world.remove(obj);
    }
  }
  crowd = [];
};

const buildCrowd = (n: number): void => {
  disposeCrowd();
  const { cols, rows } = gridLayout(n);
  for (let i = 0; i < n; i++) {
    const poolIndex = i % pool.length;
    const render = poolRenders[poolIndex]!;
    const actor = createActor(pool[poolIndex]!, render);
    for (const obj of actor.sceneObjects) {
      world.add(obj);
    }
    const rng = seededRng(i + 1);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const path: PathState = {
      cx: (col - (cols - 1) / 2) * GRID_SPACING,
      cz: (row - (rows - 1) / 2) * GRID_SPACING,
      radius: range(rng, 0.6, 1.1),
      dir: chance(rng, 0.5) ? 1 : -1,
      angle: range(rng, 0, TAU),
    };
    const speed = range(rng, 0.8, 2.8);
    const attacker = chance(rng, ATTACKER_FRACTION);
    const attackIntervalS = range(rng, 2, 5);
    crowd.push({
      actor,
      poolIndex,
      path,
      speed,
      attacker,
      attackIntervalS,
      clock: { stepIndex: Math.floor(range(rng, 0, 8)), progress: rng() },
      attackTime: undefined,
      attackCooldown: attacker ? range(rng, 0, attackIntervalS) : Number.POSITIVE_INFINITY,
    });
  }
  const halfExtent = Math.max(cols, rows) * (GRID_SPACING / 2) + 1.5;
  updateGround(halfExtent);
  frameCrowd(halfExtent);
};

const rebuildPoolRenders = (): void => {
  for (const render of poolRenders) {
    disposePoolRender(render);
  }
  poolRenders = pool.map((entry) => buildPoolRender(entry, mode));
};

// ---- frame sampling (drives the HUD and the sweep) ----

interface FrameSample {
  readonly t: number;
  readonly dt: number;
  readonly cpuMs: number;
  readonly calls: number;
  readonly triangles: number;
}

const samples: FrameSample[] = [];

const pushSample = (s: FrameSample): void => {
  samples.push(s);
  const cutoff = s.t - SAMPLE_RETENTION_MS;
  while (samples.length > 0 && samples[0]!.t < cutoff) {
    samples.shift();
  }
};

/** Mean fps and the "1% low" (mean fps of the slowest 1% of frames, at least one) over `window`. */
const fpsStats = (window: readonly FrameSample[]): { readonly mean: number; readonly low1: number } => {
  if (window.length === 0) {
    return { mean: 0, low1: 0 };
  }
  const meanDt = window.reduce((sum, s) => sum + s.dt, 0) / window.length;
  const sortedDt = window.map((s) => s.dt).sort((a, b) => b - a);
  const worstCount = Math.max(1, Math.ceil(window.length * 0.01));
  const worstMeanDt = sortedDt.slice(0, worstCount).reduce((sum, dt) => sum + dt, 0) / worstCount;
  return { mean: 1000 / meanDt, low1: 1000 / worstMeanDt };
};

// ---- HUD ----

let paused = false;

const fmt1 = (x: number): string => x.toFixed(1);
const fmt2 = (x: number): string => x.toFixed(2);

const updateHud = (): void => {
  if (poolFailed) {
    poolStatus.textContent = `pool generation failed: ${poolFailed}`;
    return;
  }
  if (pool.length < poolSize) {
    poolStatus.textContent = `generating pool… ${pool.length}/${poolSize}`;
    hud.textContent = '';
    return;
  }
  poolStatus.textContent =
    `pool ${poolSize} (${pool.map((e) => e.genome.template).join(', ')}) — ` +
    `generation total ${fmt1(poolTotalMs)} ms, max ${fmt1(poolMaxMs)} ms`;

  const now = performance.now();
  const window = samples.filter((s) => s.t >= now - HUD_WINDOW_MS);
  const { mean, low1 } = fpsStats(window);
  const meanDt = window.length > 0 ? window.reduce((sum, s) => sum + s.dt, 0) / window.length : 0;
  const meanCpu = window.length > 0 ? window.reduce((sum, s) => sum + s.cpuMs, 0) / window.length : 0;
  const last = samples.at(-1);
  hud.textContent = [
    `mode        ${mode}`,
    `actors      ${actorCount}`,
    `fps         ${fmt1(mean)}  (1% low ${fmt1(low1)})`,
    `frame time  ${fmt2(meanDt)} ms`,
    `cpu/update  ${fmt2(meanCpu)} ms`,
    `draw calls  ${last?.calls ?? 0}`,
    `triangles   ${last?.triangles ?? 0}`,
    paused ? 'walk        PAUSED' : '',
  ]
    .filter(Boolean)
    .join('\n');
};
setInterval(updateHud, 500);

// ---- simulation + render loop ----

const poseFor = (member: CrowdMember): Pose => {
  const entry = pool[member.poolIndex]!;
  const basePose = walkPose(entry.walkActor, member.clock, member.speed);
  return member.attackTime === undefined
    ? basePose
    : attackPose(entry.walkActor, LUNGE_GRAB, member.attackTime, basePose);
};

const advanceMember = (member: CrowdMember, dt: number): void => {
  const entry = pool[member.poolIndex]!;
  const distance = member.speed * dt;
  member.clock = advanceClock(member.clock, distance, {
    params: entry.walkActor.params,
    geomL: entry.legGeometryL,
    speed: member.speed,
    seed: entry.walkActor.seed,
  });
  member.path.angle += (distance / member.path.radius) * member.path.dir;
  if (member.attacker) {
    member.attackCooldown -= dt;
    if (member.attackCooldown <= 0) {
      member.attackTime = 0;
      member.attackCooldown = member.attackIntervalS;
    }
  }
  if (member.attackTime !== undefined) {
    member.attackTime += dt;
    if (member.attackTime > LUNGE_GRAB.duration) {
      member.attackTime = undefined;
    }
  }
};

let lastFrameTime = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  controls.update();

  if (pool.length < poolSize && !poolFailed) {
    stepPoolBuild();
    if (pool.length === poolSize) {
      rebuildPoolRenders();
      buildCrowd(actorCount);
      setControlsDisabled(false);
    }
  }

  const cpuStart = performance.now();
  if (!paused) {
    for (const member of crowd) {
      advanceMember(member, dt);
    }
  }
  for (const member of crowd) {
    const { cx, cz, radius, angle, dir } = member.path;
    const x = cx + radius * Math.cos(angle);
    const z = cz + radius * Math.sin(angle);
    // Path tangent (direction of travel): d/dangle (cos, sin) * dir = (-sin, cos) * dir. Forward at yaw
    // 0 is -Z (conventions.ts); solving forward(yaw) = (-sin(yaw), -cos(yaw)) = tangent gives this atan2.
    const tx = -Math.sin(angle) * dir;
    const tz = Math.cos(angle) * dir;
    const yaw = Math.atan2(-tx, -tz);
    member.actor.place(x, z, yaw, poseFor(member));
  }
  const cpuMs = performance.now() - cpuStart;

  renderer.render(scene, camera);
  pushSample({
    t: now,
    dt,
    cpuMs,
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  });
});

// ---- controls ----

const setMode = (m: Mode): void => {
  if (m === mode) {
    return;
  }
  mode = m;
  modeBtn.textContent = `mode: ${mode} (toggle)`;
  if (pool.length === poolSize) {
    disposeCrowd(); // remove every actor referencing the old mode's geometry before disposing it
    rebuildPoolRenders();
    buildCrowd(actorCount);
  }
  updateUrl();
};

const setActorCount = (n: number): void => {
  actorCount = Math.max(1, Math.min(2000, n));
  if (pool.length === poolSize) {
    buildCrowd(actorCount);
  }
  updateUrl();
};

modeBtn.textContent = `mode: ${mode} (toggle)`;
modeBtn.addEventListener('click', () => setMode(mode === 'bones' ? 'skinned' : 'bones'));
actorsMinus.addEventListener('click', () => setActorCount(actorCount - 10));
actorsPlus.addEventListener('click', () => setActorCount(actorCount + 10));
actorsDouble.addEventListener('click', () => setActorCount(actorCount * 2));
pauseToggle.addEventListener('change', () => {
  paused = pauseToggle.checked;
});

// ---- sweep ----

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface SweepRow {
  readonly mode: Mode;
  readonly n: number;
  readonly meanFps: number;
  readonly low1: number;
  readonly cpuMs: number;
  readonly draws: number;
  readonly triangles: number;
}

const measureWindow = (
  fromMs: number,
  toMs: number,
): {
  readonly fps: ReturnType<typeof fpsStats>;
  readonly cpuMs: number;
  readonly draws: number;
  readonly triangles: number;
} => {
  const inWindow = samples.filter((s) => s.t >= fromMs && s.t <= toMs);
  const cpuMs = inWindow.length > 0 ? inWindow.reduce((sum, s) => sum + s.cpuMs, 0) / inWindow.length : 0;
  const last = inWindow.at(-1);
  return { fps: fpsStats(inWindow), cpuMs, draws: last?.calls ?? 0, triangles: last?.triangles ?? 0 };
};

const setControlsDisabled = (disabled: boolean): void => {
  for (const btn of controlButtons) {
    btn.disabled = disabled;
  }
};

const sweepTable = (rows: readonly SweepRow[]): string => {
  const header = '| mode | n | mean fps | 1% low | cpu ms | draws | triangles |';
  const rule = '|---|---|---|---|---|---|---|';
  const body = rows.map(
    (r) =>
      `| ${r.mode} | ${r.n} | ${fmt1(r.meanFps)} | ${fmt1(r.low1)} | ${fmt2(r.cpuMs)} | ${r.draws} | ${r.triangles} |`,
  );
  return [header, rule, ...body].join('\n');
};

let sweepRunning = false;

const runSweep = async (): Promise<void> => {
  if (sweepRunning || pool.length < poolSize) {
    return;
  }
  sweepRunning = true;
  setControlsDisabled(true);
  sweepOutput.textContent = '';
  const startMode = mode;
  const modes: readonly Mode[] = [startMode, startMode === 'bones' ? 'skinned' : 'bones'];
  const rows: SweepRow[] = [];
  try {
    for (const m of modes) {
      setMode(m);
      for (const n of SWEEP_NS) {
        sweepStatus.textContent = `sweep: mode=${m} n=${n} — warming up`;
        setActorCount(n);
        // biome-ignore lint/performance/noAwaitInLoops: a measurement protocol, not parallelizable work.
        await sleep(SWEEP_SKIP_MS);
        sweepStatus.textContent = `sweep: mode=${m} n=${n} — measuring`;
        const from = performance.now();
        await sleep(SWEEP_MEASURE_MS);
        const to = performance.now();
        const { fps, cpuMs, draws, triangles } = measureWindow(from, to);
        rows.push({ mode: m, n, meanFps: fps.mean, low1: fps.low1, cpuMs, draws, triangles });
      }
    }
    const table = sweepTable(rows);
    sweepOutput.textContent = table;
    // biome-ignore lint/suspicious/noConsole: the sweep's whole point is a copy-pasteable result.
    console.log(table);
    sweepStatus.textContent = 'sweep complete';
  } finally {
    setControlsDisabled(false);
    sweepRunning = false;
  }
};

sweepBtn.addEventListener('click', () => {
  runSweep();
});

// ---- go ----

updateUrl();
