import { placeShamblerRing } from '../bench/shamblerPlacement.ts';
import type { Body } from '../core/physics.ts';
import type { ZombieSystem } from '../core/zombies.ts';
import type { Engine } from '../game/engine.ts';

/** Places as many requested zombies as fit, clear of the player, each other, and solid world. */
export const spawnZombieType = (
  engine: Engine,
  player: Body,
  zombies: ZombieSystem,
  options: { readonly typeId: string; readonly count: number },
): number => {
  const { typeId, count } = options;
  const type = engine.registry.zombies.get(typeId);
  if (!type) {
    return 0;
  }
  const positions = placeShamblerRing({
    count,
    seed: engine.config.seed + zombies.store.size,
    player,
    engine,
    occupied: [...zombies.store.entries()].map(([, zombie]) => zombie.body),
    allowPartial: true,
  });
  for (const pos of positions) {
    zombies.add(type, pos, [player.pos[0] - pos[0], 0, player.pos[2] - pos[2]]);
  }
  return positions.length;
};

export const spawnShamblers = (engine: Engine, player: Body, zombies: ZombieSystem, count: number): number =>
  spawnZombieType(engine, player, zombies, { typeId: 'shambler', count });
