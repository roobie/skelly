import type { BlockEntities, BlockEntity } from './blockEntities.ts';
import type { Vec3 } from './coords.ts';
import type { DestructibleHit } from './destructibleHit.ts';

export interface WindowImpactWorld {
  entities: BlockEntities;
  emitItem: (type: string, count: number, position: Vec3) => void;
  sound: (event: string, position: Vec3) => void;
}

export const strikeWindowPane = (
  world: WindowImpactWorld,
  entity: BlockEntity,
  hit: DestructibleHit,
  position: Vec3,
): boolean => {
  const result = world.entities.hitWindowPane(entity, hit);
  if (!result) {
    return false;
  }
  const spec = world.entities.defOf(entity).window!;
  world.sound(result.outcome === 'broken' ? spec.shatterSound : spec.impactSound, position);
  if (result.outcome === 'broken') {
    const stack = world.entities.registry.items.get(spec.shards.item)!.stack ?? 1;
    for (let left = spec.shards.count; left > 0; left -= stack) {
      world.emitItem(spec.shards.item, Math.min(left, stack), position);
    }
  }
  return true;
};
