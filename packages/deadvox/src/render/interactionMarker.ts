import type { BlockEntity } from '../core/blockEntities.ts';
import type { InteractionTarget } from '../core/interactionPick.ts';
import type { Body } from '../core/physics.ts';
import type { FurnitureDef } from '../core/schema.ts';
import type { FurnitureMeshes } from './furniture.ts';
import type { PileMeshes } from './piles.ts';

/** Spatial HUD aid; consumes the display and pick owners rather than choosing another target. */
export const markInteractionTarget = (
  target: InteractionTarget | undefined,
  enabled: boolean,
  services: {
    readonly furniture: FurnitureMeshes;
    readonly piles: PileMeshes;
    readonly definition: (entity: BlockEntity) => FurnitureDef;
    readonly body: (id: number) => Pick<Body, 'pos' | 'halfWidth' | 'height'> | undefined;
    readonly blockSize: number;
  },
): void => {
  const { furniture, piles, blockSize: s } = services;
  if (!enabled) {
    furniture.mark(undefined);
    return;
  }
  if (target?.kind === 'furniture') {
    furniture.mark(target.entity, services.definition(target.entity));
    return;
  }
  if (target?.kind === 'item') {
    const bounds = piles.boundsFor(target.item.uid);
    if (bounds) {
      furniture.markBounds(`item:${target.item.uid}`, bounds.position, bounds.size);
      return;
    }
  }
  if (target?.kind === 'body') {
    const body = services.body(target.id);
    if (body) {
      const [x, y, z] = body.pos;
      const width = body.halfWidth * 2 * s;
      furniture.markBounds(
        `body:${target.id}`,
        [x * s, (y + body.height / 2) * s, z * s],
        [width, body.height * s, width],
      );
      return;
    }
  }
  furniture.mark(undefined);
};
