import type { Registry } from '../core/content.ts';
import type { Body } from '../core/physics.ts';
import type { ZombieSystem } from '../core/zombies.ts';
import { BACKGROUND_SHAMBLER_BENCH_RING_METRES } from './plan.ts';
import type { ShamblerPlacementWorld } from './shamblerPlacement.ts';
import { placeShamblerRing } from './shamblerPlacement.ts';

/** Adds active sight-ring actors or a deterministic background horde workload. */
export const spawnShamblerRing = ({
  count,
  seed,
  player,
  engine,
  registry,
  zombies,
  tier = 'active',
}: {
  count: number;
  seed: number;
  player: Body;
  engine: ShamblerPlacementWorld;
  registry: Registry;
  zombies: ZombieSystem;
  tier?: 'active' | 'background';
}): void => {
  const type = registry.zombies.get('shambler');
  if (!type) {
    throw new Error('Cannot run shambler benchmark: shambler content is missing.');
  }
  if (tier === 'active') {
    const positions = placeShamblerRing({ count, seed, player, engine });
    for (const position of positions) {
      const direction: [number, number, number] = [player.pos[0] - position[0], 0, player.pos[2] - position[2]];
      const id = zombies.add(type, position, direction);
      zombies.store.get(id)!.body.onGround = true;
    }
    zombies.tickActive(1 / 20);
    if ([...zombies.store.entries()].some(([, zombie]) => zombie.tier === 'active' && zombie.mode !== 'chase')) {
      throw new Error('Cannot start shambler benchmark: not every active shambler can see the player.');
    }
    return;
  }

  const size = 30;
  const groupCount = Math.ceil(count / size);
  const { blockSize } = engine.config.scale;
  for (let index = 0; index < groupCount; index++) {
    const members = Math.min(size, count - index * size);
    const radius =
      BACKGROUND_SHAMBLER_BENCH_RING_METRES[0] +
      ((index + 0.5) / groupCount) *
        (BACKGROUND_SHAMBLER_BENCH_RING_METRES[1] - BACKGROUND_SHAMBLER_BENCH_RING_METRES[0]);
    const angle = seed * 0.618_033_988_75 + index * Math.PI * (3 - Math.sqrt(5));
    const x = player.pos[0] + (Math.cos(angle) * radius) / blockSize;
    const z = player.pos[2] + (Math.sin(angle) * radius) / blockSize;
    const center: [number, number, number] = [x, engine.groundAt(x * blockSize, z * blockSize) / blockSize, z];
    zombies.addHorde(`bench-${seed}-${index}`, type, center, members);
  }
  zombies.tickBackground(0.5, 0);
};
