import { array, check, finite, nonEmpty, number, picklist, pipe, strictObject } from 'valibot';
import { capabilityClaimsField } from './capability.ts';
import { Id, Name } from './primitives.ts';

export const WearSlotSchema = pipe(
  strictObject({
    id: Id,
    label: Name,
    attachmentFrames: pipe(
      array(Id),
      nonEmpty('needs an attachment frame'),
      check((frames) => new Set(frames).size === frames.length, 'attachment frames must be unique'),
    ),
    inventory: strictObject({
      visibility: picklist(['always', 'occupied']),
      order: pipe(number(), finite()),
    }),
    selfView: picklist(['frame', 'hidden']),
    capability: capabilityClaimsField('wearSlots'),
  }),
  check(
    (slot) => !slot.capability?.includes('slungLongGun') || slot.capability.length === 1,
    'a slung long gun slot cannot claim ordinary equipment capabilities',
  ),
);
