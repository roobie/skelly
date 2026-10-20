import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const projectRoot = resolve(import.meta.dirname, '..');
const server = await createServer({
  configFile: resolve(projectRoot, 'vite.config.ts'),
  root: projectRoot,
  logLevel: 'silent',
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { buildRegistry } = await server.ssrLoadModule('/src/core/content.ts');
  const { ZombieSystem } = await server.ssrLoadModule('/src/core/zombies.ts');
  const { physicsFor } = await server.ssrLoadModule('/src/game/player.ts');
  const { makeScale } = await server.ssrLoadModule('/src/core/scale.ts');
  const contentDirectory = resolve(projectRoot, 'src/content/base');
  const { registry } = buildRegistry(
    readdirSync(contentDirectory)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => ({ source: file, data: JSON.parse(readFileSync(resolve(contentDirectory, file), 'utf8')) })),
  );
  const type = { ...registry.zombies.get('shambler'), dismember: { chance: 0, headOnKillChance: 0 } };
  const player = {
    pos: [100, 2, 100],
    vel: [0, 0, 0],
    facing: [0, 0, -1],
    movement: 'still',
    lit: false,
    lightSeenFrom: 0,
  };
  const zombies = new ZombieSystem({
    seed: 41,
    isSolid: () => false,
    blockSize: 0.5,
    physics: physicsFor(makeScale(0.5)),
    jumpSpeed: 0,
    player: () => player,
    hour: () => 12,
    hurtPlayer: () => undefined,
  });
  const center = [10, 1, 10];
  const baseline = [];
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      const position = [center[0] + (column - 3.5) * 0.7, center[1], center[2] + (row - 3.5) * 0.7];
      const id = zombies.add(type, position, [0, 0, -1]);
      const zombie = zombies.store.get(id);
      baseline.push({ zombie, regions: { ...zombie.regions } });
    }
  }
  const weapon = { damage: 1, reach: 1.3, cooldown: 0, impulse: 4 };
  const origin = [center[0], center[1] + 3.1, center[2] - 2.5];
  const direction = [0, 0, 1];
  const restoreHealth = () => {
    for (const { zombie, regions } of baseline) {
      Object.assign(zombie.regions, regions);
      zombie.severed.length = 0;
      zombie.incapacitated = false;
    }
  };
  for (let i = 0; i < 40; i++) {
    restoreHealth();
    zombies.swing(origin, direction, weapon);
  }
  const samples = [];
  for (let i = 0; i < 200; i++) {
    restoreHealth();
    const start = performance.now();
    zombies.swing(origin, direction, weapon);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const middle = samples.slice(99, 101);
  const median = (middle.at(0) + middle.at(1)) / 2;
  const p95 = samples.at(-11);
  console.log(`64 zombies within 3 m, 200 swings: median ${median.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms`);
  if (!(median < 0.5)) {
    throw new Error('swing median exceeds the 0.5 ms bound');
  }
} finally {
  await server.close();
}
