// The shambler mode of the shared ?bench= harness. It loads the hamlet, runs the
// real fixed-step ZombieSystem and player physics, and records frame/tick/render costs.

import { CLOCK_RATIO, hourOfDay, parseTimeOfDay } from '../core/clock.ts';
import { type Body, stepBody } from '../core/physics.ts';
import { Simulation } from '../core/sim.ts';
import { skyAt } from '../core/sky.ts';
import { BACKGROUND_ZOMBIE_RATE, ZombieSystem } from '../core/zombies.ts';
import { type ActorRenderer, actorRendererFromUrl } from '../game/config.ts';
import type { RenderedEngine } from '../game/engine.ts';
import { PLAYER, physicsFor } from '../game/player.ts';
import { MobActorMeshes, type ZombieRenderer } from '../render/mobActors.ts';
import { applySky } from '../render/sky.ts';
import { ZombieMeshes } from '../render/zombies.ts';
import {
  ACTIVE_SHAMBLER_TARGET,
  type BenchRecord,
  DEFAULT_SHAMBLER_COUNTS,
  loadRecord,
  parseShamblerCounts,
  parseShamblerSeed,
  type ShamblerRunResult,
  saveRecord,
} from './plan.ts';
import { benchDraw, benchPostFromUrl, postUrlPart } from './post.ts';
import { environment } from './run.ts';
import { findShamblerBenchPlayer } from './shamblerPlacement.ts';
import { spawnShamblerRing } from './shamblerSpawn.ts';
import { frameStats, sampleStats } from './stats.ts';

export interface ShamblerBenchRun {
  counts: number[];
  index: number;
  seed: number;
  time: string;
  actors: ActorRenderer;
  /** Draw through the mood pass with the default look (`&post=1`, bench/post.ts). */
  post: boolean;
}

export const shamblerRunFromUrl = (params: URLSearchParams): ShamblerBenchRun | undefined => {
  const counts = parseShamblerCounts(params.get('n') ?? DEFAULT_SHAMBLER_COUNTS.join(','));
  const index = Number(params.get('i') ?? 0);
  const seed = parseShamblerSeed(params.get('seed') ?? '1');
  const time = params.get('time') ?? '23:30';
  if (
    !(counts && Number.isInteger(index)) ||
    index < 0 ||
    index >= counts.length ||
    seed === undefined ||
    parseTimeOfDay(time) === undefined
  ) {
    return undefined;
  }
  return { counts, index, seed, time, actors: actorRendererFromUrl(params), post: benchPostFromUrl(params) };
};

const nextUrl = (run: ShamblerBenchRun): string => {
  if (run.index + 1 >= run.counts.length) {
    return '?bench=report';
  }
  return `?bench=shamblers&i=${run.index + 1}&n=${run.counts.join(',')}&seed=${run.seed}&time=${run.time}&actors=${run.actors}${postUrlPart(run.post)}`;
};

const playerFacing = (yaw: number): [number, number, number] => [-Math.sin(yaw), 0, -Math.cos(yaw)];

export const startShamblerBench = (engine: RenderedEngine, run: ShamblerBenchRun): void => {
  const { camera, scene, streamer, config } = engine;
  const hud = document.getElementById('hud')!;
  document.body.classList.add('bench');
  document.getElementById('overlay')!.hidden = true;
  const startTime = parseTimeOfDay(run.time)!;
  applySky(engine.sky, skyAt(hourOfDay(startTime)));
  let sceneDraws = 0;
  let sceneTriangles = 0;
  const drawFrame = benchDraw(engine, run.post, hourOfDay(startTime), (stats) => {
    sceneDraws = stats.calls;
    sceneTriangles = stats.triangles;
  });
  streamer.onColumn = (cx, cz) => {
    for (const { spec } of engine.site?.furnitureIn(cx, cz) ?? []) {
      engine.entities.add(spec);
    }
  };

  const record: BenchRecord | undefined =
    run.index === 0
      ? {
          startedAt: new Date().toISOString(),
          quick: false,
          site: 'hamlet',
          time: run.time,
          ...(run.post ? { post: true } : {}),
          env: environment(engine),
          runs: [],
          shamblers: [],
        }
      : loadRecord();
  if (!record?.shamblers) {
    hud.textContent = 'The shambler benchmark needs site storage (localStorage) to keep results between runs.';
    return;
  }

  const { scale } = config;
  const s = scale.blockSize;
  const count = run.counts[run.index]!;
  const activeCount = Math.min(count, ACTIVE_SHAMBLER_TARGET);
  const backgroundCount = count - activeCount;
  let playerBody!: Body;
  let zombies!: ZombieSystem;
  let zombieMeshes!: ZombieRenderer;
  let lastZombieTickAt = performance.now();
  let lastBackgroundTickAt = lastZombieTickAt;
  let simTime = 0;
  const prepare = (): void => {
    playerBody = findShamblerBenchPlayer(engine);
    const simulation = new Simulation({
      seed: run.seed,
      bodyTuning: engine.registry.body.get('player')!,
      clock: { ratio: CLOCK_RATIO, start: startTime },
    });
    simulation.godMode = true;
    zombies = new ZombieSystem({
      seed: run.seed,
      isSolid: engine.isSolid,
      isOpaque: engine.isOpaque,
      blockSize: s,
      tuning: engine.registry.senses.get('player')!,
      terrainFloor: (x, z) => engine.groundAt(x * s, z * s) / s,
      physics: physicsFor(scale),
      jumpSpeed: PLAYER.jump,
      player: () => ({
        pos: [...playerBody.pos] as [number, number, number],
        body: playerBody,
        facing: playerFacing(camera.rotation.y),
        movement: 'still',
        // A visible flashlight lets the entire 8–20 m ring remain aware at 23:30.
        lit: true,
        lightSeenFrom: 40,
      }),
      hour: () => hourOfDay(startTime),
      hurtPlayer: (amount) => simulation.hurt(amount, 'a shambler'),
    });
    spawnShamblerRing({
      count: activeCount,
      seed: run.seed,
      player: playerBody,
      engine,
      registry: engine.registry,
      zombies,
      tier: 'active',
    });
    if (backgroundCount > 0) {
      spawnShamblerRing({
        count: backgroundCount,
        seed: run.seed + activeCount,
        player: playerBody,
        engine,
        registry: engine.registry,
        zombies,
        tier: 'background',
      });
    }
    zombieMeshes = run.actors === 'detailed' ? new MobActorMeshes(s, count) : new ZombieMeshes(s, count);
    scene.add(zombieMeshes.group);
  };

  const duration = { warmup: 3, measure: 15 };
  type Phase = 'load' | 'warmup' | 'measure';
  let phase: Phase = 'load';
  let phaseStart = performance.now();
  let last = phaseStart;
  const baseYaw = engine.spawn.yaw;
  const loadStarted = phaseStart;
  let accumulator = 0;
  let physicsFrame = 0;
  let interrupted = false;
  const frames: number[] = [];
  const zombieTick: number[] = [];
  const backgroundTick: number[] = [];
  const renderSubmit: number[] = [];
  const actorSync: number[] = [];
  const holes: number[] = [];
  let draws = 0;
  let triangles = 0;
  document.addEventListener('visibilitychange', () => {
    interrupted ||= document.hidden;
  });
  const within = Math.max(1, config.radiusChunks - 1);
  let completed = false;

  const finish = () => {
    if (completed) {
      return;
    }
    completed = true;
    const result: ShamblerRunResult = {
      n: count,
      active: activeCount,
      background: backgroundCount,
      seed: run.seed,
      actors: run.actors,
      frame: frameStats(frames),
      zombieTick: sampleStats(zombieTick),
      backgroundTick: sampleStats(backgroundTick),
      renderSubmit: sampleStats(renderSubmit),
      actorSync: sampleStats(actorSync),
      draws,
      triangles,
      holesMax: holes.length === 0 ? 0 : Math.max(...holes),
      holeFraction: holes.length === 0 ? 0 : holes.filter((value) => value > 0).length / holes.length,
      interrupted,
    };
    record.shamblers = [...record.shamblers!.slice(0, run.index), result];
    if (!saveRecord(record)) {
      hud.textContent = 'Could not save shambler results to site storage; the benchmark stopped.';
      return;
    }
    location.replace(nextUrl(run));
  };

  const load = (now: number): boolean => {
    const spawnX = engine.spawn.pos[0] / s;
    const spawnZ = engine.spawn.pos[2] / s;
    streamer.update(spawnX, spawnZ);
    const holesAtSpawn = streamer.unmeshedColumns(spawnX, spawnZ, config.radiusChunks);
    if (holesAtSpawn === 0) {
      try {
        prepare();
      } catch (error) {
        hud.textContent = error instanceof Error ? error.message : String(error);
        completed = true;
        return false;
      }
      phase = 'warmup';
      phaseStart = now;
      accumulator = 0;
      return true;
    }
    if (now - loadStarted > 120_000) {
      hud.textContent = `Hamlet did not finish loading (${holesAtSpawn} holes remain); benchmark stopped.`;
      completed = true;
      return false;
    }
    return true;
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep benchmark sampling inside the exact fixed-step loop it measures.
  const fixedSteps = (dt: number, measuring: boolean): void => {
    accumulator += dt;
    while (accumulator >= 1 / 60) {
      simTime += 1 / 60;
      if (physicsFrame % 3 === 0) {
        const tickStart = performance.now();
        zombies.tickActive(1 / 20, simTime);
        lastZombieTickAt = tickStart;
        if (measuring) {
          zombieTick.push(performance.now() - tickStart);
        }
      }
      if (physicsFrame % 30 === 0) {
        const tickStart = performance.now();
        zombies.tickBackground(1 / BACKGROUND_ZOMBIE_RATE, simTime);
        lastBackgroundTickAt = tickStart;
        if (measuring) {
          backgroundTick.push(performance.now() - tickStart);
        }
      }
      playerBody.vel[0] = 0;
      playerBody.vel[2] = 0;
      stepBody(playerBody, 1 / 60, engine.isSolid, {
        ...physicsFor(scale),
        obstacles: [...zombies.store.entries()].map(([, zombie]) => zombie.body),
      });
      physicsFrame += 1;
      accumulator -= 1 / 60;
    }
  };

  const advance = (now: number, elapsedMs: number, dt: number): number | undefined => {
    const elapsed = (now - phaseStart) / 1000;
    const measuring = phase === 'measure';
    if (measuring) {
      frames.push(elapsedMs);
    }
    fixedSteps(dt, measuring);
    if (phase === 'warmup' && elapsed >= duration.warmup) {
      phase = 'measure';
      phaseStart = now;
      frames.length = 0;
      zombieTick.length = 0;
      backgroundTick.length = 0;
      renderSubmit.length = 0;
      holes.length = 0;
      return 0;
    }
    if (phase === 'measure' && elapsed >= duration.measure) {
      finish();
      return undefined;
    }
    return elapsed;
  };

  const updateCamera = (elapsed: number, measuring: boolean): void => {
    if (!playerBody) {
      camera.position.set(engine.spawn.pos[0], engine.spawn.pos[1] + PLAYER.eye, engine.spawn.pos[2]);
      camera.rotation.set(-0.1, baseYaw, 0);
      return;
    }
    camera.position.set(playerBody.pos[0] * s, playerBody.pos[1] * s + PLAYER.eye, playerBody.pos[2] * s);
    camera.rotation.set(-0.1, baseYaw + (measuring ? (2 * Math.PI * elapsed) / duration.measure : 0), 0);
    streamer.update(playerBody.pos[0], playerBody.pos[2]);
  };

  const showHud = (elapsed: number): void => {
    hud.textContent = [
      `Shambler benchmark ${run.index + 1}/${run.counts.length}: N=${count} (${activeCount} active, ${backgroundCount} background), seed=${run.seed}, ${run.time}, actors=${run.actors}`,
      phase === 'load'
        ? `loading hamlet (${streamer.unmeshedColumns(engine.spawn.pos[0] / s, engine.spawn.pos[2] / s, config.radiusChunks)} holes)`
        : `${phase} ${Math.min(elapsed, phase === 'warmup' ? duration.warmup : duration.measure).toFixed(1)} s`,
      `zombies ${zombies?.store.size ?? 0}, player god mode on, ${interrupted ? 'tab hidden: unreliable' : 'keep tab visible'}`,
      `chunks ${engine.meshes.count} meshed, ${streamer.pending} pending`,
    ].join('\n');
  };

  const draw = (elapsed: number, dt: number, now: number): void => {
    const measuring = phase === 'measure';
    updateCamera(elapsed, measuring);
    if (playerBody) {
      const alpha = Math.max(0, Math.min(1, ((now - lastZombieTickAt) / 1000) * 20));
      const backgroundAlpha = Math.max(0, Math.min(1, ((now - lastBackgroundTickAt) / 1000) * BACKGROUND_ZOMBIE_RATE));
      zombieMeshes.setCamera?.(camera); // only MobActorMeshes uses this (distance LOD + frustum culling)
      const syncStart = performance.now();
      zombieMeshes.sync(zombies.store, dt, alpha, false, backgroundAlpha);
      if (measuring) {
        actorSync.push(performance.now() - syncStart);
        holes.push(streamer.unmeshedColumns(playerBody.pos[0], playerBody.pos[2], within));
      }
    }
    const submitStart = performance.now();
    drawFrame();
    if (measuring) {
      renderSubmit.push(performance.now() - submitStart);
      // The population is fixed for the whole run, so one snapshot per measured frame is representative
      // (unlike run.ts's `look`/`jog`/`sprint`, which fly through a changing, streaming world) — see
      // report.ts's own draws/triangles column.
      draws = sceneDraws;
      triangles = sceneTriangles;
    }
    showHud(elapsed);
  };

  const frame = (now: number): void => {
    if (completed) {
      return;
    }
    const elapsedMs = Math.max(0, now - last);
    const dt = Math.min(0.1, elapsedMs / 1000);
    last = now;
    if (phase === 'load' && !load(now)) {
      return;
    }
    const elapsed = phase === 'load' ? 0 : advance(now, elapsedMs, dt);
    if (elapsed === undefined) {
      return;
    }
    draw(elapsed, dt, now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};
