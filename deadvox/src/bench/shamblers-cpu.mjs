import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseTimeOfDay } from '../core/clock.ts';
import { buildRegistry } from '../core/content.ts';
import { DEFAULT_DAY_CYCLE, dayPhaseAt } from '../core/dayPhase.ts';
import { BACKGROUND_ZOMBIE_RATE, BACKGROUND_ZOMBIE_SLICE_COUNT, ZombieSystem } from '../core/zombies.ts';
import { PLAYER, physicsFor } from '../game/player.ts';
import { ACTIVE_SHAMBLER_TARGET, parseShamblerSeed } from './plan.ts';
import { findShamblerBenchPlayer } from './shamblerPlacement.ts';
import { spawnShamblerRing } from './shamblerSpawn.ts';
import { createHeadlessShamblerWorld } from './shamblerWorld.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const base = resolve(root, 'src/content/base');
const { registry } = buildRegistry(
  readdirSync(base)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) })),
);
const shambler = registry.zombies.get('shambler');
if (!shambler) {
  console.error('The base content has no shambler definition.');
  process.exit(1);
}

const percentile = (samples, p) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * p) - 1];
const args = process.argv.slice(2);
const requestedCounts = [];
let seed = 1;
let sawSeed = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--seed') {
    if (sawSeed || i + 1 >= args.length) {
      console.error('Usage: npm run bench:shamblers -- [N ...] [--seed signed-32-bit-integer]');
      process.exit(2);
    }
    i += 1;
    seed = parseShamblerSeed(args[i]);
    sawSeed = true;
  } else if (arg.startsWith('--seed=')) {
    if (sawSeed) {
      console.error('Specify --seed only once.');
      process.exit(2);
    }
    seed = parseShamblerSeed(arg.slice('--seed='.length));
    sawSeed = true;
  } else {
    requestedCounts.push(Number(arg));
  }
}
if (seed === undefined) {
  console.error('--seed must be a signed 32-bit integer.');
  process.exit(2);
}
const counts = requestedCounts.length > 0 ? requestedCounts : [60, 360];
if (counts.some((n) => !Number.isSafeInteger(n) || n <= 0 || n > 500) || new Set(counts).size !== counts.length) {
  console.error('N values must be unique positive integers no greater than 500.');
  process.exit(2);
}

const engine = createHeadlessShamblerWorld(seed, registry);
const playerBody = findShamblerBenchPlayer(engine);
const player = {
  pos: playerBody.pos,
  body: playerBody,
  facing: [1, 0, 0],
  movement: 'still',
  lit: true,
  lightSeenFrom: 40,
};
const startTime = parseTimeOfDay('23:30');

for (const count of counts) {
  const activeCount = Math.min(count, ACTIVE_SHAMBLER_TARGET);
  const backgroundCount = count - activeCount;
  const system = new ZombieSystem({
    isSolid: engine.isSolid,
    isOpaque: engine.isOpaque,
    blockSize: engine.config.scale.blockSize,
    physics: physicsFor(engine.config.scale),
    jumpSpeed: PLAYER.jump,
    tuning: registry.senses.get('player'),
    player: () => player,
    dayPhase: () => dayPhaseAt(DEFAULT_DAY_CYCLE, startTime),
    hurtPlayer: () => undefined,
  });
  spawnShamblerRing({
    count: activeCount,
    seed,
    player: playerBody,
    engine,
    registry,
    zombies: system,
    tier: 'active',
  });
  if (backgroundCount > 0) {
    spawnShamblerRing({
      count: backgroundCount,
      seed,
      player: playerBody,
      engine,
      registry,
      zombies: system,
      tier: 'background',
    });
  }

  const runSteps = (activeTicks, collect) => {
    let simTime = 0;
    const activeSamples = [];
    const backgroundSamples = [];
    const frameSamples = [];
    const frames = activeTicks * 3;
    for (let frame = 0; frame < frames; frame++) {
      simTime += 1 / 60;
      const frameStart = process.hrtime.bigint();
      if ((frame + 1) % 3 === 0) {
        const start = process.hrtime.bigint();
        system.tickActive(1 / 20, simTime);
        if (collect) {
          activeSamples.push(Number(process.hrtime.bigint() - start) / 1e6);
        }
      }
      const backgroundStart = process.hrtime.bigint();
      system.tickBackground(
        1 / BACKGROUND_ZOMBIE_RATE,
        simTime,
        frame % BACKGROUND_ZOMBIE_SLICE_COUNT,
        BACKGROUND_ZOMBIE_SLICE_COUNT,
      );
      if (collect) {
        backgroundSamples.push(Number(process.hrtime.bigint() - backgroundStart) / 1e6);
        frameSamples.push(Number(process.hrtime.bigint() - frameStart) / 1e6);
      }
    }
    return { activeSamples, backgroundSamples, frameSamples };
  };
  runSteps(60, false);
  const { activeSamples, backgroundSamples, frameSamples } = runSteps(300, true);
  const summarize = (samples) => {
    const mean = samples.reduce((sum, ms) => sum + ms, 0) / samples.length;
    return `mean=${mean.toFixed(3)} p50=${percentile(samples, 0.5).toFixed(3)} p95=${percentile(samples, 0.95).toFixed(3)} max=${Math.max(...samples).toFixed(3)}`;
  };
  console.log(
    `N=${count} (${activeCount} active, ${backgroundCount} background): active tick ms ${summarize(activeSamples)}; background slice ms ${summarize(backgroundSamples)}; simulation frame ms ${summarize(frameSamples)} at 60 fps (${frameSamples.length} frames; seed=${seed}, hour=23.5, ${engine.loadedChunks} chunks/${engine.loadedColumns} columns loaded)`,
  );
}
