import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ZombieSystem } from '../core/zombies.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const shamblerData = JSON.parse(readFileSync(resolve(root, 'src/content/base/zombies.json'), 'utf8'));
const shambler = shamblerData.zombies.find(({ id }) => id === 'shambler');
const blockSize = 0.5;
const physics = { gravity: 28 / blockSize, stepHeight: 0.5 / blockSize };
const floor = (_x, y) => y === 0;
const player = {
  pos: [0, 1, 0],
  facing: [-1, 0, 0],
  movement: 'still',
  lit: true,
  lightSeenFrom: 40,
};
const percentile = (samples, p) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * p) - 1];
const fract = (x) => x - Math.floor(x);
const seed = 1;

const requested = process.argv.slice(2).map(Number);
const counts = requested.length > 0 ? requested : [10, 50, 100];
if (counts.some((n) => !Number.isSafeInteger(n) || n <= 0 || n > 500)) {
  console.error('N must be a positive integer no greater than 500.');
  process.exit(2);
}

for (const count of counts) {
  const system = new ZombieSystem({
    isSolid: floor,
    blockSize,
    physics,
    jumpSpeed: 7.9,
    player: () => player,
    hour: () => 23.5,
    hurtPlayer: () => undefined,
  });
  const placed = [];
  for (let i = 0; i < count; i++) {
    let position;
    for (let attempt = 0; attempt < 256; attempt++) {
      const key = seed * 12.9898 + i * 78.233 + attempt * 37.719;
      const radius = Math.sqrt(64 + fract(Math.sin(key) * 43_758.5453) * 336);
      const angle = fract(Math.sin(key + 19.19) * 19_349.123) * Math.PI * 2;
      const candidate = [(radius * Math.cos(angle)) / blockSize, 1, (radius * Math.sin(angle)) / blockSize];
      const overlaps = placed.some(
        (other) => Math.hypot(candidate[0] - other[0], candidate[2] - other[2]) < 1.12 / blockSize,
      );
      if (!overlaps) {
        position = candidate;
        break;
      }
    }
    if (!position) {
      console.error(`Could not place shambler ${i + 1} without overlap for N=${count}.`);
      process.exit(1);
    }
    const direction = [-position[0], 0, -position[2]];
    const id = system.add(shambler, position, direction);
    system.store.get(id).body.onGround = true;
    placed.push(position);
  }

  // Match the browser harness's first perception/AI tick and fail rather than
  // reporting timings for shamblers that did not enter the intended chase state.
  system.tick(1 / 20);
  const notChasing = [...system.store.entries()].filter(([, zombie]) => zombie.mode !== 'chase').length;
  if (notChasing > 0) {
    console.error(`N=${count}: ${notChasing} of ${count} shamblers were not in chase mode after the first tick.`);
    process.exit(1);
  }

  for (let tick = 1; tick < 60; tick++) {
    system.tick(1 / 20);
  }
  const samples = [];
  for (let tick = 0; tick < 300; tick++) {
    const start = process.hrtime.bigint();
    system.tick(1 / 20);
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    samples.push(elapsed);
  }
  const mean = samples.reduce((sum, ms) => sum + ms, 0) / samples.length;
  console.log(
    `N=${count}: chasing ZombieSystem CPU ms/tick mean=${mean.toFixed(3)} p50=${percentile(samples, 0.5).toFixed(3)} p95=${percentile(samples, 0.95).toFixed(3)} (${samples.length} measured ticks; seed=${seed}, hour=23.5)`,
  );
}
