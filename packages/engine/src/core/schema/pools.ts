import { type InferOutput, optional, strictObject } from 'valibot';
import { attributeFeeds } from './attributes.ts';
import { GamePerHour, Id, Name, Positive } from './primitives.ts';

/** A resource pool a start may grant; see `packages/deadvox/docs/magic-mod.md`, "3. Resource pools". */
export const PoolSchema = strictObject({
  id: Id,
  name: Name,
  maximum: Positive,
  recoveryPerGameHour: GamePerHour,
  attributes: optional(
    strictObject({
      maximum: attributeFeeds('pool.maximum'),
      recovery: attributeFeeds('pool.recoveryPerGameSecond'),
    }),
  ),
});

export type PoolDef = InferOutput<typeof PoolSchema>;
