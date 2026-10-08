// One benchmark run: load the world around spawn, look around, look around again
// timing each render until the GPU has drawn it, then fly away at jog and sprint
// speed while streaming. Each phase records frame times; moving phases also record
// holes (nearby columns not meshed yet). The next run starts from a fresh page.

import { CLOCK_RATIO, hourOfDay, parseTimeOfDay } from '../core/clock.ts';
import { DEFAULT_DAY_CYCLE, dayPhaseAt } from '../core/dayPhase.ts';
import type { Body } from '../core/physics.ts';
import { Simulation } from '../core/sim.ts';
import { skyAt } from '../core/sky.ts';
import type { StorageStats } from '../core/storage.ts';
import { storageStats } from '../core/storage.ts';
import { FOREST_DENSITY_FIELD, FOREST_HALF_EXTENT_METRES, TREE_CELL_METRES, TREE_MIX } from '../core/vegetation.ts';
import { ZombieSystem } from '../core/zombies.ts';
import { type SiteName, siteFromUrl } from '../game/config.ts';
import type { RenderedEngine } from '../game/engine.ts';
import { PLAYER, physicsFor } from '../game/player.ts';
import type { StreamerStats } from '../game/streamer.ts';
import { flashlightDaylightScale } from '../render/flashlight.ts';
import { MobActorMeshes } from '../render/mobActors.ts';
import { applySky } from '../render/sky.ts';
import { BENCH_LIGHT_COUNTS, createBenchLightFixture } from './lightFixture.ts';
import {
  type BenchConfig,
  type BenchRecord,
  DEFAULT_PLAN,
  type Environment,
  formatPlan,
  loadRecord,
  type MovingStats,
  parsePlan,
  parseShamblerCounts,
  type RunResult,
  saveRecord,
} from './plan.ts';
import { benchDraw, benchPostFromUrl, postUrlPart } from './post.ts';
import { findShamblerBenchPlayer } from './shamblerPlacement.ts';
import { spawnShamblerRing } from './shamblerSpawn.ts';
import { frameStats, mean, sampleStats } from './stats.ts';

export interface BenchRun {
  plan: BenchConfig[];
  index: number;
  quick: boolean;
  /** The stress-test city instead of the test house (`&site=city`, `&storeys=N`). */
  site: SiteName;
  storeys: number;
  density: number | null;
  /** Time of day as "HH:MM" (`&time=`); noon when absent. Night brings the fog, and the far plane, closer. */
  time?: string;
  /** Draw through the mood pass with the default look (`&post=1`, bench/post.ts). */
  post: boolean;
  /** Detailed shambler population to keep active through every phase; undefined rejects a malformed URL. */
  shamblers: number | undefined;
}

/** Seconds per phase. Quick mode is for checking the benchmark itself, not for results. */
const DURATIONS = {
  full: { settle: 2, look: 12, render: 6, jog: 15, sprint: 15, loadTimeout: 120 },
  quick: { settle: 0.5, look: 3, render: 1, jog: 3, sprint: 3, loadTimeout: 60 },
} as const;

/** Away from the house, across open terrain. */
const HEADING: readonly [number, number] = [-0.9, 0.44];

type Phase = 'load' | 'settle' | 'look' | 'render' | 'jog' | 'sprint';

const parseBenchShamblers = (value: string): number[] | undefined => (value === '0' ? [0] : parseShamblerCounts(value));

export const benchRunFromUrl = (params: URLSearchParams): BenchRun => {
  const plan = parsePlan(params.get('plan') ?? '') ?? [...DEFAULT_PLAN];
  const index = Number(params.get('i') ?? 0);
  const time = params.get('time') ?? '';
  const shamblerValues = params.has('shamblers') ? parseBenchShamblers(params.get('shamblers')!) : [0];
  return {
    plan,
    index: Number.isInteger(index) && index >= 0 && index < plan.length ? index : 0,
    quick: params.has('quick'),
    post: benchPostFromUrl(params),
    shamblers: shamblerValues?.length === 1 ? shamblerValues[0]! : undefined,
    ...siteFromUrl(params, 'testHouse'),
    ...(parseTimeOfDay(time) === undefined ? {} : { time }),
  };
};

export const currentConfig = (run: BenchRun): BenchConfig => run.plan[run.index]!;

export const environment = (engine: RenderedEngine): Environment => {
  const { renderer } = engine;
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  const { deviceMemory } = navigator as Navigator & { deviceMemory?: number };
  return {
    userAgent: navigator.userAgent,
    cores: navigator.hardwareConcurrency,
    ...(deviceMemory === undefined ? {} : { deviceMemory }),
    gpu,
    canvas: `${renderer.domElement.width}×${renderer.domElement.height}`,
    pixelRatio: renderer.getPixelRatio(),
  };
};

const movingStats = (frames: number[], work: number[], holes: number[]): MovingStats => ({
  ...frameStats(frames),
  work: sampleStats(work),
  holesMax: holes.length === 0 ? 0 : Math.max(...holes),
  holeFraction: holes.length === 0 ? 0 : holes.filter((h) => h > 0).length / holes.length,
});

export const nextUrl = (run: BenchRun, seed: number): string => {
  if (run.index + 1 >= run.plan.length) {
    return '?bench=report';
  }
  const quick = run.quick ? '&quick' : '';
  const site =
    `&site=${run.site}` +
    (run.site === 'city' ? `&storeys=${run.storeys}` : '') +
    (run.site === 'forest' && run.density !== null ? `&density=${run.density}` : '');
  const time = run.time === undefined ? '' : `&time=${run.time}`;
  const shamblers = `&shamblers=${run.shamblers ?? 0}`;
  return `?bench=1&i=${run.index + 1}&plan=${formatPlan(run.plan)}&seed=${seed}${site}${time}${shamblers}${postUrlPart(run.post)}${quick}`;
};

export const forestWorkload = (seed: number, density: number | null) => ({
  seed,
  density,
  densityField: density === null ? FOREST_DENSITY_FIELD : null,
  extentMetres: 2 * FOREST_HALF_EXTENT_METRES,
  cellMetres: TREE_CELL_METRES,
  shapeMix: TREE_MIX,
  foliage: 'passable-opaque' as const,
  routes: {
    heading: HEADING,
    lookSeconds: DURATIONS.full.look,
    jogSeconds: DURATIONS.full.jog,
    jogMetresPerSecond: PLAYER.jog,
    sprintSeconds: DURATIONS.full.sprint,
    sprintMetresPerSecond: PLAYER.sprint,
  },
});

export const benchSiteLabel = (run: BenchRun): string =>
  ({
    forest: run.density === null ? 'forest, seeded density field (0.2–0.75)' : `forest, density ${run.density}`,
    city: `city, up to ${run.storeys} storeys`,
    hamlet: 'hamlet',
    testHouse: 'test house',
  })[run.site] ?? `authored site ${run.site}`;

export const startBench = (engine: RenderedEngine, run: BenchRun, stats: StreamerStats): void => {
  const { config, streamer, renderer, camera, world } = engine;
  const s = config.scale.blockSize;
  const durations = run.quick ? DURATIONS.quick : DURATIONS.full;
  const hud = document.getElementById('hud')!;
  if (run.shamblers === undefined) {
    hud.textContent = 'Use &shamblers=N with a single valid detailed population.';
    return;
  }
  const shamblerCount = run.shamblers;
  document.body.classList.add('bench');
  document.getElementById('overlay')!.hidden = true;
  const startTime = parseTimeOfDay(run.time ?? '12:00')!;
  const hour = hourOfDay(startTime);
  if (run.time !== undefined) {
    applySky(engine.sky, skyAt(hour));
  }
  const lightFixture = createBenchLightFixture(engine, startTime);
  window.addEventListener('pagehide', lightFixture.dispose, { once: true });
  const daylightScale = flashlightDaylightScale(skyAt(hour));
  const gl = renderer.getContext();
  const pixel = new Uint8Array(4);
  const drawScene = benchDraw(engine, run.post, hour);
  const draw = () => {
    lightFixture.update(camera, daylightScale);
    drawScene();
  };

  const record: BenchRecord | undefined =
    run.index === 0
      ? {
          startedAt: new Date().toISOString(),
          quick: run.quick,
          site: benchSiteLabel(run),
          ...(run.site === 'forest' ? { forest: forestWorkload(config.seed, run.density) } : {}),
          time: run.time ?? '12:00',
          ...(run.post ? { post: true } : {}),
          lightWorkload: {
            active: BENCH_LIGHT_COUNTS.carried + BENCH_LIGHT_COUNTS.dropped,
            carried: BENCH_LIGHT_COUNTS.carried,
            dropped: BENCH_LIGHT_COUNTS.dropped,
            pointLightSlots: BENCH_LIGHT_COUNTS.pointLights,
            shamblers: shamblerCount,
            actors: 'detailed',
            settings: Object.fromEntries(
              ['torch', 'candle', 'glowstick'].map((id) => {
                const light = engine.registry.items.get(id)?.light;
                if (!light) {
                  throw new Error(`Missing benchmark light content: ${id}`);
                }
                return [
                  id,
                  {
                    color: light.color,
                    emissive: light.emissive,
                    intensity: light.intensity,
                    radius: light.radius,
                    seenFrom: light.seenFrom,
                    burnTimeGameHours: light.burnTimeGameHours,
                  },
                ];
              }),
            ),
          },
          env: environment(engine),
          runs: [],
        }
      : loadRecord();
  if (!record) {
    hud.textContent = 'The benchmark needs site storage (localStorage) to keep results between runs.';
    return;
  }

  const frames: Record<'look' | 'jog' | 'sprint', number[]> = { look: [], jog: [], sprint: [] };
  const work: Record<'look' | 'jog' | 'sprint', number[]> = { look: [], jog: [], sprint: [] };
  const holes: Record<'jog' | 'sprint', number[]> = { jog: [], sprint: [] };
  const drawCalls: number[] = [];
  const triangles: number[] = [];
  const renderMs: number[] = [];
  let renderWarm = false;
  const within = Math.max(1, config.radiusChunks - 1);
  let memory: StorageStats | undefined;
  let loadSeconds = Number.NaN;
  let timedOut = false;
  let interrupted = false;
  document.addEventListener('visibilitychange', () => {
    interrupted ||= document.hidden;
  });

  // Camera position in metres; x/z move, y follows the terrain at eye height.
  const heading = Math.hypot(...HEADING);
  const dir = [HEADING[0] / heading, HEADING[1] / heading] as const;
  let [x, , z] = engine.spawn.pos;
  let playerBody: Body | undefined;
  let zombies: ZombieSystem | undefined;
  let zombieMeshes: MobActorMeshes | undefined;
  let movement: 'still' | 'jogging' | 'sprinting' = 'still';
  const place = (yaw: number, pitch: number) => {
    const ground = engine.groundAt(x, z);
    camera.position.set(x, Math.max(ground, engine.spawn.pos[1]) + PLAYER.eye, z);
    camera.rotation.set(pitch, yaw, 0);
    if (playerBody) {
      playerBody.pos[0] = x / s;
      playerBody.pos[1] = ground / s;
      playerBody.pos[2] = z / s;
      playerBody.vel[0] = 0;
      playerBody.vel[1] = 0;
      playerBody.vel[2] = 0;
      playerBody.onGround = true;
    }
  };
  const travelYaw = Math.atan2(-dir[0], -dir[1]);
  let aborted = false;
  const prepareShamblers = (): void => {
    if (shamblerCount === 0 || zombies) {
      return;
    }
    try {
      playerBody = findShamblerBenchPlayer(engine);
      x = playerBody.pos[0] * s;
      z = playerBody.pos[2] * s;
      const simulation = new Simulation({
        seed: config.seed,
        bodyTuning: engine.registry.body.get('player')!,
        clock: { ratio: CLOCK_RATIO, start: startTime },
      });
      simulation.godMode = true;
      const lightSeenFrom = engine.registry.items.get('torch')!.light!.seenFrom;
      zombies = new ZombieSystem({
        seed: config.seed,
        isSolid: engine.isSolid,
        isOpaque: engine.isOpaque,
        blockSize: s,
        tuning: engine.registry.senses.get('player')!,
        physics: physicsFor(config.scale),
        jumpSpeed: PLAYER.jump,
        player: () => ({
          pos: [...playerBody!.pos] as [number, number, number],
          body: playerBody!,
          facing: [-Math.sin(camera.rotation.y), 0, -Math.cos(camera.rotation.y)],
          movement,
          lit: true,
          lightSeenFrom,
        }),
        dayPhase: () => dayPhaseAt(DEFAULT_DAY_CYCLE, startTime),
        hurtPlayer: (amount) => simulation.hurt(amount, 'a shambler'),
      });
      spawnShamblerRing({
        count: shamblerCount,
        seed: config.seed,
        player: playerBody,
        engine,
        registry: engine.registry,
        zombies,
      });
      zombieMeshes = new MobActorMeshes(s, shamblerCount);
      engine.scene.add(zombieMeshes.group);
    } catch (error) {
      aborted = true;
      hud.textContent = error instanceof Error ? error.message : String(error);
    }
  };
  let zombieAccumulator = 0;
  const advanceShamblers = (dt: number): void => {
    if (!(zombies && zombieMeshes)) {
      return;
    }
    zombieAccumulator += dt;
    while (zombieAccumulator >= 1 / 20) {
      zombies.tick(1 / 20);
      zombieAccumulator -= 1 / 20;
    }
    zombieMeshes.setCamera?.(camera);
    zombieMeshes.sync(zombies.store, dt, Math.min(1, zombieAccumulator * 20));
  };

  let phase: Phase = 'load';
  let phaseStart = performance.now();
  let last = phaseStart;
  let skipFrame = true; // the first frame of a phase includes the transition
  let recorded = false; // this frame's time went into a bucket, so its work time should too
  const enter = (next: Phase, now: number) => {
    phase = next;
    phaseStart = now;
    skipFrame = true;
  };
  const recordFrame = (bucket: number[], ms: number) => {
    if (skipFrame) {
      skipFrame = false;
    } else {
      bucket.push(ms);
      recorded = true;
    }
  };

  const finish = () => {
    const result: RunResult = {
      blockSize: s,
      radiusM: config.radiusM,
      radiusChunks: config.radiusChunks,
      load: { seconds: loadSeconds, timedOut },
      memory: memory ?? storageStats(world.chunks.values()),
      gen: sampleStats(stats.genMs),
      meshMs: sampleStats(stats.meshMs),
      meshTriangles: sampleStats(stats.triangles),
      look: {
        ...frameStats(frames.look),
        work: sampleStats(work.look),
        drawCalls: mean(drawCalls),
        triangles: mean(triangles),
      },
      render: sampleStats(renderMs),
      jog: movingStats(frames.jog, work.jog, holes.jog),
      sprint: movingStats(frames.sprint, work.sprint, holes.sprint),
      interrupted,
    };
    record.runs = [...record.runs.slice(0, run.index), result];
    if (record.lightWorkload) {
      record.lightWorkload.activeAfterSprint = lightFixture.activeCount();
    }
    if (!saveRecord(record)) {
      hud.textContent = 'Could not save results to site storage; the benchmark stopped.';
      return;
    }
    location.replace(nextUrl(run, config.seed));
  };

  const loadStep = (now: number, t: number) => {
    place(engine.spawn.yaw, -0.15);
    if (streamer.unmeshedColumns(x / s, z / s, config.radiusChunks) === 0 || t > durations.loadTimeout) {
      loadSeconds = t;
      timedOut = t > durations.loadTimeout;
      memory = storageStats(world.chunks.values());
      prepareShamblers();
      enter('settle', now);
    }
  };

  const lookStep = (now: number, t: number, ms: number) => {
    place(engine.spawn.yaw + (2 * Math.PI * t) / durations.look, -0.1);
    recordFrame(frames.look, ms);
    if (t >= durations.look) {
      enter('render', now);
    }
  };

  // Turns a full circle like the look phase; `frame` times each render until the GPU has drawn it.
  const renderStep = (now: number, t: number) => {
    place(engine.spawn.yaw + (2 * Math.PI * t) / durations.render, -0.1);
    if (t >= durations.render) {
      enter('jog', now);
    }
  };

  /** Returns false when the run is over. */
  const moveStep = (moving: 'jog' | 'sprint', now: number, t: number, ms: number): boolean => {
    movement = moving === 'jog' ? 'jogging' : 'sprinting';
    lightFixture.setSprinting(moving === 'sprint');
    const speed = moving === 'jog' ? PLAYER.jog : PLAYER.sprint;
    x += (dir[0] * speed * ms) / 1000;
    z += (dir[1] * speed * ms) / 1000;
    place(travelYaw, -0.05);
    recordFrame(frames[moving], ms);
    holes[moving].push(streamer.unmeshedColumns(x / s, z / s, within));
    if (t < durations[moving]) {
      return true;
    }
    if (moving === 'sprint') {
      finish();
      return false;
    }
    enter('sprint', now);
    return true;
  };

  /** Advances the current phase; returns false when the run is over. */
  const step = (now: number): boolean => {
    const ms = now - last;
    const t = (now - phaseStart) / 1000;
    if (phase === 'load') {
      loadStep(now, t);
    } else if (phase === 'settle') {
      if (t >= durations.settle) {
        enter('look', now);
      }
    } else if (phase === 'look') {
      lookStep(now, t, ms);
    } else if (phase === 'render') {
      renderStep(now, t);
    } else {
      return moveStep(phase, now, t, ms);
    }
    return true;
  };

  /** Renders and waits for the GPU to draw the frame, timing both. */
  const timedRender = () => {
    const renderStart = performance.now();
    draw();
    // Reading a pixel waits for the GPU to finish the frame (gl.finish() needn't, in
    // browsers that run WebGL in another process). The stall is why this phase's frame
    // times aren't recorded.
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    if (renderWarm) {
      renderMs.push(performance.now() - renderStart);
    }
    renderWarm = true; // the phase's first frame includes the transition
  };

  const frame = (now: number) => {
    if (aborted) {
      return;
    }
    const start = performance.now();
    const frameDt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    const measured = phase;
    recorded = false;
    if (!step(now)) {
      return;
    }
    last = now;
    advanceShamblers(frameDt);
    if (aborted) {
      return;
    }
    streamer.update(x / s, z / s);
    if (measured === 'render') {
      timedRender();
    } else {
      draw();
    }
    if (recorded && measured !== 'load' && measured !== 'settle' && measured !== 'render') {
      work[measured].push(performance.now() - start);
    }
    if (measured === 'look') {
      drawCalls.push(renderer.info.render.calls);
      triangles.push(renderer.info.render.triangles);
    }
    hud.textContent = [
      `Benchmark ${run.index + 1}/${run.plan.length}: ${s} m blocks, ${config.radiusM} m radius, ${benchSiteLabel(run)}`,
      `${phase} ${((now - phaseStart) / 1000).toFixed(1)} s`,
      `chunks ${engine.meshes.count} meshed, ${streamer.pending} pending`,
      interrupted ? 'Tab was hidden: this run will be marked unreliable.' : 'Keep this tab visible.',
    ].join('\n');
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};
