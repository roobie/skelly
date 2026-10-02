import type { Vec3 } from '../core/coords.ts';
import type { MoveStart } from '../core/handling.ts';
import type { Location } from '../core/inventory.ts';
import type { SoundEventId } from '../core/soundEvents.ts';

export interface HandlingSoundCue {
  readonly event: SoundEventId;
  readonly position: Vec3;
}

const FIREARM_SOUND_BY_ITEM: Readonly<Partial<Record<string, SoundEventId>>> = {};

/** Item-keyed override point for future weapon-specific shot profiles. */
export const firearmShotSound = (itemType: string): { event: SoundEventId; sourceLabel: string } => ({
  event: FIREARM_SOUND_BY_ITEM[itemType] ?? 'gunshot',
  sourceLabel: itemType,
});

/** Sound policy for a move beginning; presentation-only and deliberately outside the simulation fingerprint. */
export const handlingMoveStartCue = (
  move: MoveStart,
  ownerLocation: Location | undefined,
  chest: Vec3,
): HandlingSoundCue | undefined => {
  const { from, target } = move;
  if (
    from.kind === 'pocket' &&
    ownerLocation?.kind === 'worn' &&
    !(target.kind === 'pocket' && target.owner === from.owner && target.pocket === from.pocket)
  ) {
    return { event: 'pouch_take', position: chest };
  }
  return undefined;
};

/** Sound policy for a completed move; positions remain in blocks for SessionAudio to scale once. */
export const handlingMoveCompleteCue = (move: MoveStart): HandlingSoundCue | undefined => {
  const { from, target } = move;
  if (target.kind !== 'pile') {
    return undefined;
  }
  const samePile = from.kind === 'pile' && from.pile.pos.every((v, i) => v === target.pos[i]);
  if (samePile) {
    return undefined;
  }
  const [x, y, z] = target.pos;
  return { event: 'item_drop_wood', position: [x + 0.5, y, z + 0.5] };
};
