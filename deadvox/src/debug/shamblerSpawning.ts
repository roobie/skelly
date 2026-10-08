import { placeShamblerRing } from '../bench/shamblerPlacement.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Body } from '../core/physics.ts';
import { raycast } from '../core/raycast.ts';
import { type ZombieSystem, zombieAttackReachForType, zombieBodyDimensions } from '../core/zombies.ts';
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
    bodyDimensions: zombieBodyDimensions(type, engine.config.scale.blockSize),
    minRadiusMetres: Math.max(8, zombieAttackReachForType(type) + 1),
    allowPartial: true,
  });
  for (const pos of positions) {
    zombies.add(type, pos, [player.pos[0] - pos[0], 0, player.pos[2] - pos[2]]);
  }
  return positions.length;
};

export const spawnShamblers = (engine: Engine, player: Body, zombies: ZombieSystem, count: number): number =>
  spawnZombieType(engine, player, zombies, { typeId: 'shambler', count });

/** Debug-only fixture: place one close shambler behind solid geometry so it starts unaware. */
export const spawnUnawareShambler = (engine: Engine, player: Body, zombies: ZombieSystem): boolean => {
  const type = engine.registry.zombies.get('shambler');
  if (!type) {
    return false;
  }
  const { blockSize } = engine.config.scale;
  const rayOrigin: Vec3 = [player.pos[0], player.pos[1] + 1.3 / blockSize, player.pos[2]];
  for (let attempt = 0; attempt < 16; attempt++) {
    const [position] = placeShamblerRing({
      count: 1,
      seed: engine.config.seed + zombies.store.size + attempt,
      player,
      engine,
      occupied: [...zombies.store.entries()].map(([, zombie]) => zombie.body),
      allowPartial: true,
      minRadiusMetres: 1.5,
      maxRadiusMetres: 2.5,
      requireSight: false,
    });
    if (!position) {
      continue;
    }
    const rayTarget = [position[0], position[1] + 1.3 / blockSize, position[2]] as const;
    const delta = [rayTarget[0] - rayOrigin[0], rayTarget[1] - rayOrigin[1], rayTarget[2] - rayOrigin[2]];
    const distance = Math.hypot(...delta);
    const direction = delta.map((coordinate) => coordinate / distance) as [number, number, number];
    if (raycast(rayOrigin, direction, distance, engine.isSolid) === undefined) {
      continue;
    }
    zombies.add(type, position, [player.pos[0] - position[0], 0, player.pos[2] - position[2]]);
    return true;
  }
  return false;
};
