import type { SoundDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import { Rng, type RngState } from './random.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { SoundEventId } from './soundEvents.ts';

export interface SoundPick {
  file: string;
  gain: number;
  pitch: number;
}

/** A simulation-admitted choice. Positions are in blocks; playback cannot veto it. */
export interface SoundEmission {
  readonly event: SoundEventId;
  readonly position: Vec3;
  readonly time: number;
  readonly pick: Readonly<SoundPick>;
  readonly emittedAsNoise: boolean;
  readonly sourceLabel: string | null;
  readonly listenerRelative: boolean;
}

export interface SoundEmissionMeta {
  sourceLabel?: string | null;
  /** Overrides body-height pitch scaling for a mob's authored sound style. */
  soundPitchMultiplier?: number;
  /** Playback-only first-person routing, never a hearing-policy decision. */
  listenerRelative?: boolean;
  /** Overrides the sound definition to emit a world noise pulse at this radius. */
  noiseRadiusMetres?: number;
}

interface EventState {
  rng: Rng;
  lastVariant: number | undefined;
  lastPlayedAt: number;
}

interface SoundPickerEventState {
  event: SoundEventId;
  rng: RngState;
  lastVariant: number;
  lastPlayedAt: number;
}

export interface SoundPickerState {
  events: SoundPickerEventState[];
}

/** Pure, seeded selection and per-event minimum-interval bookkeeping. */
export class SoundPicker {
  private readonly states = new Map<SoundEventId, EventState>();
  private readonly seed: number;
  private readonly sounds: ReadonlyMap<string, SoundDef>;

  constructor(seed: number, sounds: ReadonlyMap<string, SoundDef>) {
    this.seed = seed;
    this.sounds = sounds;
  }

  snapshotState(): Readonly<SoundPickerState> {
    return freezeSnapshot({
      events: [...this.states.entries()].map(([event, state]) => {
        if (state.lastVariant === undefined) {
          throw new Error(`Sound picker state for ${event} has no selected variant`);
        }
        return {
          event,
          rng: [...state.rng.state()] as RngState,
          lastVariant: state.lastVariant,
          lastPlayedAt: state.lastPlayedAt,
        };
      }),
    });
  }

  restoreState(state: SoundPickerState): void {
    if (this.states.size > 0) {
      throw new Error('Sound picker state restores only into a fresh picker');
    }
    if (!Array.isArray(state.events)) {
      throw new Error('Invalid sound picker state');
    }
    for (const saved of state.events) {
      const sound = this.sounds.get(saved.event);
      if (
        !sound ||
        sound.variants.length === 0 ||
        this.states.has(saved.event) ||
        !Array.isArray(saved.rng) ||
        saved.rng.length !== 4 ||
        saved.rng.some((word) => !Number.isSafeInteger(word)) ||
        !Number.isSafeInteger(saved.lastVariant) ||
        saved.lastVariant < 0 ||
        saved.lastVariant >= sound.variants.length ||
        !Number.isFinite(saved.lastPlayedAt)
      ) {
        throw new Error(`Invalid sound picker state for ${String(saved.event)}`);
      }
      this.states.set(saved.event, {
        rng: new Rng(saved.rng),
        lastVariant: saved.lastVariant,
        lastPlayedAt: saved.lastPlayedAt,
      });
    }
  }

  pick(event: SoundEventId, now: number): SoundPick | undefined {
    const sound = this.sounds.get(event);
    if (!sound || sound.variants.length === 0) {
      return undefined;
    }
    let state = this.states.get(event);
    if (!state) {
      state = {
        rng: Rng.stream(this.seed, `sound:${event}`),
        lastVariant: undefined,
        lastPlayedAt: Number.NEGATIVE_INFINITY,
      };
      this.states.set(event, state);
    }
    if (now - state.lastPlayedAt < sound.minIntervalSimSeconds) {
      return undefined;
    }

    const count = sound.variants.length;
    let variant = state.rng.int(0, count - 1);
    if (count > 1 && variant === state.lastVariant) {
      variant = (variant + 1 + state.rng.int(0, count - 2)) % count;
    }
    state.lastVariant = variant;
    state.lastPlayedAt = now;
    const pitch = state.rng.range(sound.pitchJitter[0], sound.pitchJitter[1]);
    const gain = sound.gain * state.rng.range(sound.gainJitter[0], sound.gainJitter[1]);
    return { file: sound.variants[variant]!, pitch, gain };
  }
}
