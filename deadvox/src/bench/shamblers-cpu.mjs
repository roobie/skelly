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
  pos: [0, 2, 0],
  facing: [-1, 0, 0],
  movement: 'still',
  lit: false,
  lightSeenFrom: 40,
};
const percentile = (samples, p) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * p) - 1];

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
    hour: () => 12,
    hurtPlayer: () => undefined,
  });
  for (let i = 0; i < count; i++) {
    system.add(shambler, [20 + i, 1, i * 0.5], [-1, 0, 0]);
  }
  const samples = [];
  for (let frame = 0; frame < 600; frame++) {
    const start = process.hrtime.bigint();
    system.tick(1 / 60);
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    if (frame >= 60) {
      samples.push(elapsed);
    }
  }
  const mean = samples.reduce((sum, ms) => sum + ms, 0) / samples.length;
  console.log(
    `N=${count}: ZombieSystem CPU ms/tick mean=${mean.toFixed(3)} p50=${percentile(samples, 0.5).toFixed(3)} p95=${percentile(samples, 0.95).toFixed(3)} (${samples.length} measured ticks)`,
  );
}
