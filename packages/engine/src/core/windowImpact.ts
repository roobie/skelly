import type { BlockEntities, BlockEntity } from './blockEntities.ts';
import type { Vec3 } from './coords.ts';
import type { DestructibleHit, DestructibleOutcome } from './destructibleHit.ts';
import type { FurniturePart } from './furniturePick.ts';

export interface WindowImpactWorld {
  entities: BlockEntities;
  emitItem: (type: string, count: number, position: Vec3) => void;
  sound: (event: string, position: Vec3) => void;
}

/**
 * Whether a blow on a piece breaks at its glass rather than as the piece's own damage: one aimed at the pane, or an
 * unaimed one on an intact pane that no boards cover. A boarded window takes unaimed blows on its boards, so a horde
 * must beat the whole window down to get in; a curtain stops no blow.
 */
export const blowLandsOnPane = (
  entities: BlockEntities,
  entity: BlockEntity,
  part: FurniturePart | undefined,
): boolean =>
  entity.window !== undefined &&
  (part === 'pane' || (part === undefined && entity.window.pane === 'intact' && !entities.boardedUp(entity)));

export const strikeWindowPane = (
  world: WindowImpactWorld,
  entity: BlockEntity,
  hit: DestructibleHit,
  position: Vec3,
): DestructibleOutcome | undefined => {
  const result = world.entities.hitWindowPane(entity, hit);
  if (!result) {
    return undefined;
  }
  const spec = world.entities.defOf(entity).window!;
  world.sound(result.outcome === 'broken' ? spec.shatterSound : spec.impactSound, position);
  if (result.outcome === 'broken') {
    const stack = world.entities.registry.items.get(spec.shards.item)!.stack ?? 1;
    for (let left = spec.shards.count; left > 0; left -= stack) {
      world.emitItem(spec.shards.item, Math.min(left, stack), position);
    }
  }
  return result.outcome;
};
