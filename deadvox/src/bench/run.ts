// One benchmark run: load the world around spawn, look around, then fly away at jog
// and sprint speed while streaming. Each phase records frame times; moving phases also
// record holes (nearby columns not meshed yet). The next run starts from a fresh page.

import type { StorageStats } from '../core/storage.ts';
import { storageStats } from '../core/storage.ts';
import { terrainHeightMetres } from '../core/worldgen.ts';
import type { Engine } from '../game/engine.ts';
import { PLAYER } from '../game/player.ts';
import type { StreamerStats } from '../game/streamer.ts';
import {
  type BenchConfig,
  type BenchRecord,
  DEFAULT_PLAN,
  type Environment,
  formatPlan,
  loadRecord,
  type MovingStats,
  parsePlan,
  type RunResult,
  saveRecord,
} from './plan.ts';
import { frameStats, mean, sampleStats } from './stats.ts';

export interface BenchRun {
  plan: BenchConfig[];
  index: number;
  quick: boolean;
}

/** Seconds per phase. Quick mode is for checking the benchmark itself, not for results. */
const DURATIONS = {
  full: { settle: 2, look: 12, jog: 15, sprint: 15, loadTimeout: 120 },
  quick: { settle: 0.5, look: 3, jog: 3, sprint: 3, loadTimeout: 60 },
} as const;

/** Away from the house, across open terrain. */
const HEADING: readonly [number, number] = [-0.9, 0.44];

type Phase = 'load' | 'settle' | 'look' | 'jog' | 'sprint';

export const benchRunFromUrl = (params: URLSearchParams): BenchRun => {
  const plan = parsePlan(params.get('plan') ?? '') ?? [...DEFAULT_PLAN];
  const index = Number(params.get('i') ?? 0);
  return {
    plan,
    index: Number.isInteger(index) && index >= 0 && index < plan.length ? index : 0,
    quick: params.has('quick'),
  };
};

export const currentConfig = (run: BenchRun): BenchConfig => run.plan[run.index]!;

const environment = (engine: Engine): Environment => {
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

const nextUrl = (run: BenchRun, seed: number): string => {
  if (run.index + 1 >= run.plan.length) {
    return '?bench=report';
  }
  const quick = run.quick ? '&quick' : '';
  return `?bench=1&i=${run.index + 1}&plan=${formatPlan(run.plan)}&seed=${seed}${quick}`;
};

export const startBench = (engine: Engine, run: BenchRun, stats: StreamerStats): void => {
  const { config, streamer, renderer, scene, camera, world } = engine;
  const s = config.scale.blockSize;
  const durations = run.quick ? DURATIONS.quick : DURATIONS.full;
  const hud = document.getElementById('hud')!;
  document.body.classList.add('bench');
  document.getElementById('overlay')!.hidden = true;

  const record: BenchRecord | undefined =
    run.index === 0
      ? { startedAt: new Date().toISOString(), quick: run.quick, env: environment(engine), runs: [] }
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
  const place = (yaw: number, pitch: number) => {
    const ground = Math.floor(terrainHeightMetres(config.seed, x, z) / s) * s + s;
    camera.position.set(x, Math.max(ground, engine.spawn.pos[1]) + PLAYER.eye, z);
    camera.rotation.set(pitch, yaw, 0);
  };
  const travelYaw = Math.atan2(-dir[0], -dir[1]);

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
      jog: movingStats(frames.jog, work.jog, holes.jog),
      sprint: movingStats(frames.sprint, work.sprint, holes.sprint),
      interrupted,
    };
    record.runs = [...record.runs.slice(0, run.index), result];
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
      enter('settle', now);
    }
  };

  const lookStep = (now: number, t: number, ms: number) => {
    place(engine.spawn.yaw + (2 * Math.PI * t) / durations.look, -0.1);
    recordFrame(frames.look, ms);
    if (t >= durations.look) {
      enter('jog', now);
    }
  };

  /** Returns false when the run is over. */
  const moveStep = (moving: 'jog' | 'sprint', now: number, t: number, ms: number): boolean => {
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
    } else {
      return moveStep(phase, now, t, ms);
    }
    return true;
  };

  const frame = (now: number) => {
    const start = performance.now();
    const measured = phase;
    recorded = false;
    if (!step(now)) {
      return;
    }
    last = now;
    streamer.update(x / s, z / s);
    renderer.render(scene, camera);
    if (recorded && measured !== 'load' && measured !== 'settle') {
      work[measured].push(performance.now() - start);
    }
    if (measured === 'look') {
      drawCalls.push(renderer.info.render.calls);
      triangles.push(renderer.info.render.triangles);
    }
    hud.textContent = [
      `Benchmark ${run.index + 1}/${run.plan.length}: ${s} m blocks, ${config.radiusM} m radius`,
      `${phase} ${((now - phaseStart) / 1000).toFixed(1)} s`,
      `chunks ${engine.meshes.count} meshed, ${streamer.pending} pending`,
      interrupted ? 'Tab was hidden: this run will be marked unreliable.' : 'Keep this tab visible.',
    ].join('\n');
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};
