import type { Vec3 } from './coords.ts';
import type { RecipeDef } from './schema.ts';
import type { Facing } from './templates.ts';

/** A door's face: the facing side is the front. */
export type DoorSide = 'front' | 'back';

/** Where world work puts its result: a terrain cell, a new piece's corner and facing, or one face of a standing door. */
export type WorldDestination =
  | { kind: 'cell'; pos: Vec3 }
  | { kind: 'entity'; pos: Vec3; facing: Facing }
  | { kind: 'door'; uid: number; side: DoorSide };
export const copyWorldDestination = (destination: WorldDestination): WorldDestination => {
  switch (destination.kind) {
    case 'cell':
      return { kind: 'cell', pos: [...destination.pos] };
    case 'entity':
      return { kind: 'entity', pos: [...destination.pos], facing: destination.facing };
    default:
      return { kind: 'door', uid: destination.uid, side: destination.side };
  }
};

export const validWorldDestination = (destination: WorldDestination | undefined, recipe: RecipeDef): boolean => {
  if ('item' in recipe.result) {
    return destination === undefined;
  }
  if ('doorBoarding' in recipe.result || destination?.kind === 'door') {
    return (
      'doorBoarding' in recipe.result &&
      destination?.kind === 'door' &&
      Number.isSafeInteger(destination.uid) &&
      destination.uid > 0 &&
      (destination.side === 'front' || destination.side === 'back')
    );
  }
  return Boolean(
    destination &&
      Array.isArray(destination.pos) &&
      destination.pos.length === 3 &&
      destination.pos.every((value) => Number.isFinite(value) && Math.abs(value) < Number.MAX_SAFE_INTEGER) &&
      ('block' in recipe.result
        ? destination.kind === 'cell' && destination.pos.every(Number.isSafeInteger)
        : destination.kind === 'entity' && ['n', 's', 'e', 'w'].includes(destination.facing)),
  );
};

export interface PlacementBox {
  pos: Vec3;
  size: Vec3;
}
/** All cell-based consumers reserve the cells touched by a finer entity box. */

export function* placementCells({ pos, size }: PlacementBox): Generator<Vec3> {
  for (let x = Math.floor(pos[0]); x < Math.ceil(pos[0] + size[0]); x++) {
    for (let y = Math.floor(pos[1]); y < Math.ceil(pos[1] + size[1]); y++) {
      for (let z = Math.floor(pos[2]); z < Math.ceil(pos[2] + size[2]); z++) {
        yield [x, y, z];
      }
    }
  }
}
