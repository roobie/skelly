import type { Registry } from '../core/content.ts';
import type { Body } from '../core/physics.ts';
import type { ZombieSystem } from '../core/zombies.ts';
import type { ShamblerPlacementWorld } from './shamblerPlacement.ts';
import { placeShamblerRing } from './shamblerPlacement.ts';

/** Adds the deterministic clear-sight ring used by both full-scene benchmark modes. */
export const spawnShamblerRing = ({
  count,
  seed,
  player,
  engine,
  registry,
  zombies,
}: {
  count: number;
  seed: number;
  player: Body;
  engine: ShamblerPlacementWorld;
  registry: Registry;
  zombies: ZombieSystem;
}): void => {
  const type = registry.zombies.get('shambler');
  if (!type) {
    throw new Error('Cannot run shambler benchmark: shambler content is missing.');
  }
  for (const position of placeShamblerRing({ count, seed, player, engine })) {
    const direction: [number, number, number] = [player.pos[0] - position[0], 0, player.pos[2] - position[2]];
    const id = zombies.add(type, position, direction);
    zombies.store.get(id)!.body.onGround = true;
  }
  zombies.tick(1 / 20);
  if ([...zombies.store.entries()].some(([, zombie]) => zombie.mode !== 'chase')) {
    throw new Error('Cannot start shambler benchmark: not every shambler can see the player from its ring position.');
  }
};
