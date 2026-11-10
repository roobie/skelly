// Which playing voices a new sound retires once its cap is reached. Times are playback clock seconds,
// read by the caller; playback stops and fades the chosen voices.
import type { SoundId } from '../core/soundEvents.ts';

/** What playback does to the voices the cap chose. */
export interface VoiceActions<V> {
  /** Releases a voice that has stopped. */
  readonly finish: (voice: V) => void;
  /** Stops a voice at once. */
  readonly cut: (voice: V) => void;
  /** Fades a voice out from `now`, stopping it at `stopAt`. */
  readonly fade: (voice: V, now: number, stopAt: number) => void;
}

export class VoiceCaps<V extends { stopAt?: number }> {
  private readonly active = new Map<SoundId, Set<V>>();
  // Up to one cap's worth of 10ms tails: a 40-shot cold burst can fade every retiree.
  private readonly retiring = new Map<SoundId, Set<V>>();
  private readonly fadeRealSeconds: number;

  constructor(fadeRealSeconds: number) {
    this.fadeRealSeconds = fadeRealSeconds;
  }

  /** Before a new voice of `event` starts: retire its oldest voice once the cap is reached. */
  makeRoom(event: SoundId, cap: number | undefined, now: number, act: VoiceActions<V>): void {
    const active = this.active.get(event);
    if (cap === undefined || !active || active.size < cap) {
      return;
    }
    const tails = this.retiring.get(event) ?? new Set<V>();
    // A delayed ended callback need not keep an already-stopped node connected.
    for (const tail of tails) {
      if (tail.stopAt !== undefined && tail.stopAt <= now) {
        act.finish(tail);
      }
    }
    // The safety ceiling is 2*cap connected sources, including pathological >64-shot
    // same-quantum calls. Ordinary 75/100ms cadence never reaches this tail ceiling.
    if (tails.size >= cap) {
      const previousTail = tails.values().next().value!;
      act.cut(previousTail);
      act.finish(previousTail);
    }
    const oldest = active.values().next().value!;
    active.delete(oldest);
    tails.add(oldest);
    this.retiring.set(event, tails);
    oldest.stopAt = now + this.fadeRealSeconds;
    act.fade(oldest, now, oldest.stopAt);
  }

  /** Counts a started voice against its sound's cap; uncapped sounds are not tracked. */
  add(event: SoundId, cap: number | undefined, voice: V): void {
    if (cap === undefined) {
      return;
    }
    const active = this.active.get(event) ?? new Set<V>();
    active.add(voice);
    this.active.set(event, active);
  }

  /** Forgets a finished voice. */
  release(event: SoundId, voice: V): void {
    const active = this.active.get(event);
    active?.delete(voice);
    if (active?.size === 0) {
      this.active.delete(event);
    }
    const tails = this.retiring.get(event);
    tails?.delete(voice);
    if (tails?.size === 0) {
      this.retiring.delete(event);
    }
  }
}
