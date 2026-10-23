import type { ModelBox } from '@skelly/thing-core/schema';
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
    /** A fitted part's pick boxes in world metres, the same boxes the pick used. */
    readonly vehiclePart?: (vehicleId: number, fittingId: string) => readonly ModelBox[] | undefined;
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
  const boxes = target?.kind === 'vehicle' ? services.vehiclePart?.(target.vehicleId, target.fittingId) : undefined;
  if (target?.kind === 'vehicle' && boxes?.length) {
    const min = [0, 1, 2].map((axis) => Math.min(...boxes.map((box) => box.min[axis]!)));
    const max = [0, 1, 2].map((axis) => Math.max(...boxes.map((box) => box.max[axis]!)));
    furniture.markBounds(
      `vehicle:${target.vehicleId}:${target.fittingId}`,
      [0, 1, 2].map((axis) => (min[axis]! + max[axis]!) / 2) as [number, number, number],
      [0, 1, 2].map((axis) => max[axis]! - min[axis]!) as [number, number, number],
    );
    return;
  }
  furniture.mark(undefined);
};
