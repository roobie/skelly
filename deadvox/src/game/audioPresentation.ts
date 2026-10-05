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
export const firearmShotSound = (
  itemType: string,
  perspective: 'player' | 'actor' = 'player',
): { event: SoundEventId; sourceLabel: string; listenerRelative: boolean } => ({
  event: FIREARM_SOUND_BY_ITEM[itemType] ?? 'gunshot',
  sourceLabel: itemType,
  listenerRelative: perspective === 'player',
});

export const HEARTBEAT_FILES = {
  slow: 'assets/audio/heartbeat-slow-beat.ogg',
  fast: 'assets/audio/heartbeat-fast-beat.ogg',
} as const;
export type HeartbeatTimbre = keyof typeof HEARTBEAT_FILES;
export const HEARTBEAT_QUIET_FLOOR = 0.003;

export interface HeartbeatTarget {
  readonly bpm: number;
  readonly gain: number;
  readonly fastMix: number;
}

/** Presentation only: decreasing stamina raises tempo, loudness and the fast-timbre share. */
export const heartbeatForStamina = (stamina: number): HeartbeatTarget => {
  const strain = 1 - Math.max(0, Math.min(100, stamina)) / 100;
  return {
    bpm: 60 + strain * 90,
    gain: 0.5 * strain ** 1.4,
    fastMix: strain,
  };
};

const heartbeatStaminaListeners = new Set<(stamina: number) => void>();

/** Connects read-only player-state projections to bodily audio without adding simulation state. */
export const subscribeHeartbeatStamina = (listener: (stamina: number) => void): (() => void) => {
  heartbeatStaminaListeners.add(listener);
  return () => heartbeatStaminaListeners.delete(listener);
};

export const publishHeartbeatStamina = (stamina: number): void => {
  for (const listener of heartbeatStaminaListeners) {
    listener(stamina);
  }
};

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
