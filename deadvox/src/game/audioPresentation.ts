import type { Vec3 } from '../core/coords.ts';
import type { MoveStart } from '../core/handling.ts';
import type { Location } from '../core/inventory.ts';
import type { SoundEventId } from '../core/soundEvents.ts';

export interface HandlingSoundCue {
  readonly event: SoundEventId;
  readonly position: Vec3;
}

/** Keeps refusal playback in presentation state, debounced on simulated time and independent of HUD visibility. */
export const createRefusalPresenter = (
  notice: (text: string) => void,
  playNope: () => boolean,
  minIntervalSeconds: number,
): ((text: string, simulationTime: number) => void) => {
  let lastPlayedAt = Number.NEGATIVE_INFINITY;
  return (text, simulationTime) => {
    if (simulationTime - lastPlayedAt >= minIntervalSeconds && playNope()) {
      lastPlayedAt = simulationTime;
    }
    notice(text);
  };
};

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
/** BR's d37-4 (#193) anchors; gain values are provisional loudness tuning. */
export const HEARTBEAT_TUNING = {
  startStamina: 85,
  startHz: 1,
  exhaustedHz: 3,
  normalGain: 0.12,
  veryHighGain: 0.8,
} as const;

export interface HeartbeatTarget {
  readonly bpm: number;
  readonly gain: number;
}

/** Presentation only: silent above the ruled stamina start, then linear in rate and loudness. */
export const heartbeatForStamina = (stamina: number): HeartbeatTarget => {
  if (stamina > HEARTBEAT_TUNING.startStamina) {
    return { bpm: HEARTBEAT_TUNING.startHz * 60, gain: 0 };
  }
  const fraction = Math.max(0, Math.min(1, (HEARTBEAT_TUNING.startStamina - stamina) / HEARTBEAT_TUNING.startStamina));
  return {
    bpm: (HEARTBEAT_TUNING.startHz + (HEARTBEAT_TUNING.exhaustedHz - HEARTBEAT_TUNING.startHz) * fraction) * 60,
    gain: HEARTBEAT_TUNING.normalGain + (HEARTBEAT_TUNING.veryHighGain - HEARTBEAT_TUNING.normalGain) * fraction,
  };
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
