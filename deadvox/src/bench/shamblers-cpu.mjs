import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { hourOfDay, parseTimeOfDay } from '../core/clock.ts';
import { buildRegistry } from '../core/content.ts';
import { ZombieSystem } from '../core/zombies.ts';
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
const hour = hourOfDay(startTime);

for (const count of counts) {
  const activeCount = Math.min(count, ACTIVE_SHAMBLER_TARGET);
  const backgroundCount = count - activeCount;
  const system = new ZombieSystem({
    isSolid: engine.isSolid,
    isOpaque: engine.isOpaque,
    blockSize: engine.config.scale.blockSize,
    physics: physicsFor(engine.config.scale),
    jumpSpeed: PLAYER.jump,
    player: () => player,
    hour: () => hour,
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

  const runSteps = (ticks, collect) => {
    let simTime = 0;
    const activeSamples = [];
    const backgroundSamples = [];
    for (let tick = 0; tick < ticks; tick++) {
      simTime += 1 / 20;
      let start = process.hrtime.bigint();
      system.tickActive(1 / 20, simTime);
      if (collect) {
        activeSamples.push(Number(process.hrtime.bigint() - start) / 1e6);
      }
      if ((tick + 1) % 10 === 0) {
        start = process.hrtime.bigint();
        system.tickBackground(0.5, simTime);
        if (collect) {
          backgroundSamples.push(Number(process.hrtime.bigint() - start) / 1e6);
        }
      }
    }
    return { activeSamples, backgroundSamples };
  };
  runSteps(60, false);
  const { activeSamples, backgroundSamples } = runSteps(300, true);
  const summarize = (samples) => {
    const mean = samples.reduce((sum, ms) => sum + ms, 0) / samples.length;
    return `mean=${mean.toFixed(3)} p50=${percentile(samples, 0.5).toFixed(3)} p95=${percentile(samples, 0.95).toFixed(3)}`;
  };
  const activeMean = activeSamples.reduce((sum, ms) => sum + ms, 0) / activeSamples.length;
  const backgroundMean = backgroundSamples.reduce((sum, ms) => sum + ms, 0) / backgroundSamples.length;
  const simulationMsPerFrame = (activeMean * 20 + backgroundMean * 2) / 60;
  console.log(
    `N=${count} (${activeCount} active, ${backgroundCount} background): active tick ms ${summarize(activeSamples)}; background tick ms ${summarize(backgroundSamples)}; simulation mean=${simulationMsPerFrame.toFixed(3)} ms/frame at 60 fps (${activeSamples.length}/${backgroundSamples.length} samples; seed=${seed}, hour=23.5, ${engine.loadedChunks} chunks/${engine.loadedColumns} columns loaded)`,
  );
}
