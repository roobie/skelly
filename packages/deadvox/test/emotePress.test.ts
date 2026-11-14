import type { Emote } from '@skelly/engine/content';
import { ActionMenu, EmotePress, emoteRadialEntries } from '@skelly/engine/sim';
import { describe, expect, it } from 'vitest';

const tuning = { radiusPixels: 100, deadZonePixels: 20, selectionHalfAngleDegrees: 30 };
const labels = { 'press-check': 'Press check' } as const;

const fixture = (offered: Emote[] = ['press-check']) => {
  const menu = new ActionMenu();
  const performed: Emote[] = [];
  const entries = () => emoteRadialEntries(offered, labels, { 'press-check': 0 });
  const press = new EmotePress({ menu, entries, perform: (emote) => performed.push(emote) });
  return { menu, entries, performed, press };
};

describe('emote press', () => {
  it('holding the key opens the ring even for a lone emote, and performs nothing yet', () => {
    const { menu, entries, performed, press } = fixture();
    press.press();
    expect(menu.opened?.source).toBe('emote');
    expect(menu.ring(entries())?.map((entry) => entry.id)).toEqual(['press-check']);
    expect(performed).toEqual([]);
  });

  it('releasing on an emote performs it once and closes the ring', () => {
    const { menu, entries, performed, press } = fixture();
    press.press();
    menu.point(entries(), { x: 0, y: -tuning.radiusPixels }, tuning);
    press.release();
    press.release();
    expect(performed).toEqual(['press-check']);
    expect(menu.opened).toBeUndefined();
  });

  it('releasing at the centre performs nothing and closes the ring', () => {
    const { menu, performed, press } = fixture();
    press.press();
    press.release();
    expect(performed).toEqual([]);
    expect(menu.opened).toBeUndefined();
  });

  it('opens nothing when no emote is on offer', () => {
    const { menu, press } = fixture([]);
    press.press();
    expect(menu.opened).toBeUndefined();
  });
});
