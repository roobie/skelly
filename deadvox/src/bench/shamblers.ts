// The shambler mode of the shared ?bench= harness. It loads the hamlet, runs the
// real fixed-step ZombieSystem and player physics, and records frame/tick/render costs.

import { CLOCK_RATIO, hourOfDay, parseTimeOfDay } from '../core/clock.ts';
import { type Body, bodyOverlapsBlock, stepBody } from '../core/physics.ts';
import { raycast } from '../core/raycast.ts';
import { Simulation } from '../core/sim.ts';
import { skyAt } from '../core/sky.ts';
import { ZombieSystem } from '../core/zombies.ts';
import type { Engine } from '../game/engine.ts';
import { createPlayerBody, PLAYER, physicsFor } from '../game/player.ts';
import { applySky } from '../render/sky.ts';
import { ZombieMeshes } from '../render/zombies.ts';
import {
  type BenchRecord,
  DEFAULT_SHAMBLER_COUNTS,
  loadRecord,
  parseShamblerCounts,
  parseShamblerSeed,
  type ShamblerRunResult,
  saveRecord,
} from './plan.ts';
import { environment } from './run.ts';
import { frameStats, sampleStats } from './stats.ts';

export interface ShamblerBenchRun {
  counts: number[];
  index: number;
  seed: number;
  time: string;
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
  return { counts, index, seed, time };
};

const nextUrl = (run: ShamblerBenchRun): string => {
  if (run.index + 1 >= run.counts.length) {
    return '?bench=report';
  }
  return `?bench=shamblers&i=${run.index + 1}&n=${run.counts.join(',')}&seed=${run.seed}&time=${run.time}`;
};

const fract = (x: number): number => x - Math.floor(x);

const bodyIsClear = (body: Body, isSolid: Engine['isSolid']): boolean => {
  for (let y = Math.floor(body.pos[1]); y < Math.ceil(body.pos[1] + body.height); y++) {
    for (let z = Math.floor(body.pos[2] - body.halfWidth); z < Math.ceil(body.pos[2] + body.halfWidth); z++) {
      for (let x = Math.floor(body.pos[0] - body.halfWidth); x < Math.ceil(body.pos[0] + body.halfWidth); x++) {
        if (isSolid(x, y, z) && bodyOverlapsBlock(body, [x, y, z])) {
          return false;
        }
      }
    }
  }
  return true;
};

const findPlayer = (engine: Engine): Body => {
  const s = engine.config.scale.blockSize;
  const [baseX, , baseZ] = engine.spawn.pos;
  for (let ring = 0; ring <= 12; ring++) {
    const radius = ring * 0.5;
    const attempts = ring === 0 ? 1 : 24;
    for (let i = 0; i < attempts; i++) {
      const angle = (i / attempts) * Math.PI * 2 + ring * 0.13;
      const x = baseX + radius * Math.cos(angle);
      const z = baseZ + radius * Math.sin(angle);
      const body = createPlayerBody(engine.config.scale, x / s, engine.groundAt(x, z) / s, z / s);
      body.onGround = true;
      if (bodyIsClear(body, engine.isSolid)) {
        return body;
      }
    }
  }
  throw new Error('Could not find open terrain near the hamlet spawn for the player.');
};

const rayIsClear = (from: Body, to: Body, isSolid: Engine['isSolid'], blockSize: number): boolean => {
  const origin: [number, number, number] = [from.pos[0], from.pos[1] + 1.3 / blockSize, from.pos[2]];
  const target: [number, number, number] = [to.pos[0], to.pos[1] + 1.3 / blockSize, to.pos[2]];
  const direction = target.map((value, axis) => value - origin[axis]!) as [number, number, number];
  const distance = Math.hypot(...direction);
  if (distance === 0) {
    return false;
  }
  const unit = direction.map((value) => value / distance) as [number, number, number];
  return raycast(origin, unit, distance, isSolid) === undefined;
};

const findShambler = ({
  index,
  seed,
  player,
  engine,
  occupied,
}: {
  index: number;
  seed: number;
  player: Body;
  engine: Engine;
  occupied: readonly Body[];
}): [number, number, number] => {
  const s = engine.config.scale.blockSize;
  for (let attempt = 0; attempt < 256; attempt++) {
    const key = seed * 12.9898 + index * 78.233 + attempt * 37.719;
    const radius = Math.sqrt(64 + fract(Math.sin(key) * 43_758.5453) * 336);
    const angle = fract(Math.sin(key + 19.19) * 19_349.123) * Math.PI * 2;
    const x = player.pos[0] * s + radius * Math.cos(angle);
    const z = player.pos[2] * s + radius * Math.sin(angle);
    const body = createPlayerBody(engine.config.scale, x / s, engine.groundAt(x, z) / s, z / s);
    body.halfWidth = 0.28 / s;
    body.height = 1.7 / s;
    body.onGround = true;
    const overlapsSpawn = occupied.some(
      (other) =>
        Math.abs(body.pos[0] - other.pos[0]) < body.halfWidth + other.halfWidth &&
        Math.abs(body.pos[2] - other.pos[2]) < body.halfWidth + other.halfWidth,
    );
    if (overlapsSpawn || !bodyIsClear(body, engine.isSolid) || !rayIsClear(body, player, engine.isSolid, s)) {
      continue;
    }
    return [body.pos[0], body.pos[1], body.pos[2]];
  }
  throw new Error(`Could not place shambler ${index + 1} in the clear-sight 8–20 m ring.`);
};

const playerFacing = (yaw: number): [number, number, number] => [-Math.sin(yaw), 0, -Math.cos(yaw)];

export const startShamblerBench = (engine: Engine, run: ShamblerBenchRun): void => {
  const { renderer, camera, scene, streamer, config } = engine;
  const hud = document.getElementById('hud')!;
  document.body.classList.add('bench');
  document.getElementById('overlay')!.hidden = true;
  const startTime = parseTimeOfDay(run.time)!;
  applySky(engine.sky, skyAt(hourOfDay(startTime)));

  const record: BenchRecord | undefined =
    run.index === 0
      ? {
          startedAt: new Date().toISOString(),
          quick: false,
          site: 'hamlet',
          time: run.time,
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
  let playerBody!: Body;
  let zombies!: ZombieSystem;
  let zombieMeshes!: ZombieMeshes;
  const prepare = (): void => {
    playerBody = findPlayer(engine);
    const simulation = new Simulation({ seed: run.seed, clock: { ratio: CLOCK_RATIO, start: startTime } });
    simulation.godMode = true;
    zombies = new ZombieSystem({
      isSolid: engine.isSolid,
      blockSize: s,
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
    const type = engine.registry.zombies.get('shambler');
    if (!type) {
      throw new Error('Cannot run the shambler benchmark: shambler content is missing.');
    }
    const occupied: Body[] = [playerBody];
    for (let i = 0; i < count; i++) {
      const pos = findShambler({ index: i, seed: run.seed, player: playerBody, engine, occupied });
      const direction: [number, number, number] = [playerBody.pos[0] - pos[0], 0, playerBody.pos[2] - pos[2]];
      const id = zombies.add(type, pos, direction);
      const { body } = zombies.store.get(id)!;
      body.onGround = true;
      occupied.push(body);
    }
    zombies.tick(1 / 20);
    if ([...zombies.store.entries()].some(([, zombie]) => zombie.mode !== 'chase')) {
      throw new Error('Cannot start shambler benchmark: not every shambler can see the player from its ring position.');
    }
    zombieMeshes = new ZombieMeshes(s, count);
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
  const renderSubmit: number[] = [];
  const holes: number[] = [];
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
      seed: run.seed,
      frame: frameStats(frames),
      zombieTick: sampleStats(zombieTick),
      renderSubmit: sampleStats(renderSubmit),
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

  const fixedSteps = (dt: number, measuring: boolean): void => {
    accumulator += dt;
    while (accumulator >= 1 / 60) {
      if (physicsFrame % 3 === 0) {
        const tickStart = performance.now();
        zombies.tick(1 / 20);
        if (measuring) {
          zombieTick.push(performance.now() - tickStart);
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
      `Shambler benchmark ${run.index + 1}/${run.counts.length}: N=${count}, seed=${run.seed}, ${run.time}`,
      phase === 'load'
        ? `loading hamlet (${streamer.unmeshedColumns(engine.spawn.pos[0] / s, engine.spawn.pos[2] / s, config.radiusChunks)} holes)`
        : `${phase} ${Math.min(elapsed, phase === 'warmup' ? duration.warmup : duration.measure).toFixed(1)} s`,
      `zombies ${zombies?.store.size ?? 0}, player god mode on, ${interrupted ? 'tab hidden: unreliable' : 'keep tab visible'}`,
      `chunks ${engine.meshes.count} meshed, ${streamer.pending} pending`,
    ].join('\n');
  };

  const draw = (elapsed: number): void => {
    const measuring = phase === 'measure';
    updateCamera(elapsed, measuring);
    if (playerBody) {
      zombieMeshes.sync(zombies.store);
      if (measuring) {
        holes.push(streamer.unmeshedColumns(playerBody.pos[0], playerBody.pos[2], within));
      }
    }
    const submitStart = performance.now();
    renderer.render(scene, camera);
    if (measuring) {
      renderSubmit.push(performance.now() - submitStart);
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
    draw(elapsed);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};
