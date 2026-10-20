import type { Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { MoveStart } from '../core/handling.ts';
import type { Location } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import type { SoundId } from '../core/soundEvents.ts';

export interface HandlingSoundCue {
  readonly event: SoundId;
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

/** Every shot event authored by a firearm, for gameplay-noise and listening-guide checks. */
export const firearmShotSoundEvents = (registry: Registry): ReadonlySet<SoundId> => {
  const events = new Set<SoundId>();
  for (const item of registry.items.values()) {
    if (!item.firearm) {
      continue;
    }
    events.add(item.firearm.shotSound);
    if (item.firearm.suppressedShotSound !== undefined) {
      events.add(item.firearm.suppressedShotSound);
    }
  }
  return events;
};

const hasMountedSuppressor = (registry: Registry, item: Item): boolean =>
  Object.values(item.slots ?? {}).some((attachment) => {
    if (!attachment) {
      return false;
    }
    const modelId = defOf(registry, attachment.type).model;
    const metadata = modelId === undefined ? undefined : registry.models.get(modelId)?.gun?.attachment;
    return metadata?.kind === 'suppressor' || hasMountedSuppressor(registry, attachment);
  });

/** Content-selected shot sound shared by player and actor presentation; fitted suppressors are read from the item tree. */
export const firearmShotSound = (
  registry: Registry,
  item: Item,
  perspective: 'player' | 'actor' = 'player',
): { event: SoundId; sourceLabel: string; listenerRelative: boolean } => {
  const profile = defOf(registry, item.type).firearm;
  if (!profile) {
    throw new Error(`item "${item.type}" is not a firearm`);
  }
  const suppressed = hasMountedSuppressor(registry, item);
  if (suppressed && profile.suppressedShotSound === undefined) {
    throw new Error(`firearm "${item.type}" has a fitted suppressor but no suppressed shot sound`);
  }
  return {
    event: suppressed ? profile.suppressedShotSound! : profile.shotSound,
    sourceLabel: item.type,
    listenerRelative: perspective === 'player',
  };
};

export const firearmShotEmission = (registry: Registry, item: Item, noiseRadiusScale: number) => ({
  ...firearmShotSound(registry, item),
  noiseRadiusScale,
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
