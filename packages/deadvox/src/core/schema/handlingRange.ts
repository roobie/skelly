import { array, integer, minLength, minValue, number, pipe, strictObject } from 'valibot';
import { Count, Id } from './primitives.ts';

const BlockCount = pipe(number(), integer('must be a whole number'), minValue(1, 'must be at least 1'));

const BlockOffset = pipe(number(), integer('must be a whole number'));

/** Distances are whole blocks: `offset` runs along the lane from its near end, `lateral` across it from its centre line. */
export const HandlingRangeSchema = strictObject({
  id: Id,
  /** Clear ground between the site this range sits beside and the lane's near end. */
  gap: Count,
  /** How far the terrain blends into the level lane beyond its edge. */
  blend: BlockCount,
  length: BlockCount,
  width: BlockCount,
  firingLine: strictObject({ offset: Count, depth: BlockCount, inset: Count }),
  target: strictObject({ halfWidth: Count, height: BlockCount }),
  /** One entry per target, nearest first; staggering them laterally keeps each one clear of the nearer ones' line of fire. */
  targets: pipe(
    array(strictObject({ offset: Count, lateral: BlockOffset })),
    minLength(1, 'needs at least one target'),
  ),
  table: strictObject({ offset: Count, lateral: BlockOffset }),
});
