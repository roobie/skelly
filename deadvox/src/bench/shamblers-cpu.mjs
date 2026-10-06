import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { hourOfDay, parseTimeOfDay } from '../core/clock.ts';
import { buildRegistry } from '../core/content.ts';
import { ZombieSystem } from '../core/zombies.ts';
import { PLAYER, physicsFor } from '../game/player.ts';
import { parseShamblerSeed } from './plan.ts';
import { findShamblerBenchPlayer, placeShamblerRing } from './shamblerPlacement.ts';
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
const counts = requestedCounts.length > 0 ? requestedCounts : [10, 50, 100];
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
  const system = new ZombieSystem({
    isSolid: engine.isSolid,
    isOpaque: engine.isOpaque,
    blockSize: engine.config.scale.blockSize,
    physics: physicsFor(engine.config.scale),
    jumpSpeed: PLAYER.jump,
    tuning: registry.senses.get('player'),
    player: () => player,
    hour: () => hour,
    hurtPlayer: () => undefined,
  });
  for (const position of placeShamblerRing({ count, seed, player: playerBody, engine })) {
    const facing = [playerBody.pos[0] - position[0], 0, playerBody.pos[2] - position[2]];
    const id = system.add(shambler, position, facing);
    system.store.get(id).body.onGround = true;
  }

  // Match the browser harness's checked first perception tick; never time a setup
  // where a placed shambler failed to acquire the lit player in the seeded hamlet.
  system.tick(1 / 20);
  const notChasing = [...system.store.entries()].filter(([, zombie]) => zombie.mode !== 'chase').length;
  if (notChasing > 0) {
    console.error(`N=${count}: ${notChasing} of ${count} shamblers were not in chase mode after the first tick.`);
    process.exit(1);
  }

  for (let tick = 0; tick < 60; tick++) {
    system.tick(1 / 20);
  }
  const samples = [];
  for (let tick = 0; tick < 300; tick++) {
    const start = process.hrtime.bigint();
    system.tick(1 / 20);
    samples.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  const mean = samples.reduce((sum, ms) => sum + ms, 0) / samples.length;
  console.log(
    `N=${count}: ZombieSystem CPU ms/tick mean=${mean.toFixed(3)} p50=${percentile(samples, 0.5).toFixed(3)} p95=${percentile(samples, 0.95).toFixed(3)} (${samples.length} measured ticks; seed=${seed}, hour=23.5, ${engine.loadedChunks} chunks/${engine.loadedColumns} columns loaded)`,
  );
}
