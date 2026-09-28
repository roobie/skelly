import { describe, expect, it } from 'vitest';
import type { SoundDef } from '../src/core/content.ts';
import type { SoundEventId } from '../src/core/soundEvents.ts';
import { SoundPicker } from '../src/core/soundPicker.ts';

const sound = (variants: string[]): SoundDef => ({
  id: 'player_hurt_light',
  variants,
  gain: 0.8,
  pitchJitter: [0.95, 1.05],
  gainJitter: [0.8, 1.2],
  minIntervalSeconds: 0.1,
  category: 'body',
  noise: { enabled: true, radiusMetres: 8 },
});

const picker = (seed: number, definition: SoundDef) =>
  new SoundPicker(seed, new Map<SoundEventId, SoundDef>([['player_hurt_light', definition]]));

describe('seeded sound picker', () => {
  it('does not repeat the previous variant across one thousand seeded picks', () => {
    const choose = picker(91, sound(['a.ogg', 'b.ogg', 'c.ogg']));
    let previous: string | undefined;
    for (let draw = 0; draw < 1000; draw++) {
      const selected = choose.pick('player_hurt_light', draw);
      expect(selected).toBeDefined();
      expect(selected!.file).not.toBe(previous);
      previous = selected!.file;
    }
  });

  it('keeps pitch and gain jitter within the data ranges', () => {
    const choose = picker(17, sound(['a.ogg', 'b.ogg']));
    for (let draw = 0; draw < 1000; draw++) {
      const selected = choose.pick('player_hurt_light', draw);
      expect(selected!.pitch).toBeGreaterThanOrEqual(0.95);
      expect(selected!.pitch).toBeLessThanOrEqual(1.05);
      expect(selected!.gain).toBeGreaterThanOrEqual(0.8 * 0.8);
      expect(selected!.gain).toBeLessThanOrEqual(0.8 * 1.2);
    }
  });

  it('respects the per-event minimum interval and replays from its seed', () => {
    const definition = sound(['a.ogg', 'b.ogg']);
    const first = picker(8, definition);
    const replay = picker(8, definition);
    const initial = first.pick('player_hurt_light', 3);
    expect(initial).toBeDefined();
    expect(initial).toEqual(replay.pick('player_hurt_light', 3));
    expect(first.pick('player_hurt_light', 3.05)).toBeUndefined();
    const next = first.pick('player_hurt_light', 3.1);
    expect(next).toBeDefined();
    expect(next).toEqual(replay.pick('player_hurt_light', 3.1));
  });
});
