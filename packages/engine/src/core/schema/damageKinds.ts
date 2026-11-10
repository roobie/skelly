import { picklist, strictObject } from 'valibot';
import { Id } from './primitives.ts';

export const DamageKindSchema = strictObject({
  id: Id,
  class: picklist(['melee', 'non-melee']),
});
