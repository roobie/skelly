import type { SoundDef } from './content.ts';
import { Rng } from './random.ts';
import type { SoundEventId } from './soundEvents.ts';

export interface SoundPick {
  file: string;
  gain: number;
  pitch: number;
}

interface EventState {
  rng: Rng;
  lastVariant: number | undefined;
  lastPlayedAt: number;
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
    if (now - state.lastPlayedAt < sound.minIntervalSeconds) {
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
