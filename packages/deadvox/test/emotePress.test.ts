import type { Emote, EmoteMode } from '@skelly/engine/content';
import { ActionMenu, EmotePress, emoteRadialEntries } from '@skelly/engine/sim';
import { describe, expect, it } from 'vitest';

const tuning = { radiusPixels: 100, deadZonePixels: 20, selectionHalfAngleDegrees: 30 };
const labels = { gun: 'Gun', 'press-check': 'Press-check' } as const;
const up = { x: 0, y: -tuning.radiusPixels };

const placed = { emote: { gun: 0 }, gun: { 'press-check': 0 } } as const;

const fixture = (
  available: { gun: boolean; pressCheck: boolean } = { gun: true, pressCheck: true },
  directions: Parameters<typeof emoteRadialEntries>[2] = placed,
) => {
  const menu = new ActionMenu();
  const performed: Emote[] = [];
  const entries = () =>
    emoteRadialEntries(
      { mode: (_mode: EmoteMode) => available.gun, emote: (_emote: Emote) => available.pressCheck },
      labels,
      directions,
    );
  const press = new EmotePress({ menu, entries, perform: (emote) => performed.push(emote) });
  /** One press of the emote key that points straight up before its release. */
  const pressUp = () => {
    press.press();
    menu.point(entries(), up, tuning);
    press.release();
  };
  return { menu, entries, performed, press, pressUp };
};

describe('emote press', () => {
  it('holding the key opens the ring of modes even for a lone mode, and performs nothing yet', () => {
    const { menu, entries, performed, press } = fixture();
    press.press();
    expect(menu.opened?.source).toBe('emote');
    expect(menu.ring(entries())?.map((entry) => entry.id)).toEqual(['gun']);
    expect(performed).toEqual([]);
  });

  it("releasing on a mode enters its ring even for a lone emote, and the next press's release performs from it", () => {
    const { menu, entries, performed, pressUp } = fixture();
    pressUp();
    expect(performed).toEqual([]);
    expect(menu.childOpen).toBe(true);
    expect(menu.ring(entries())?.map((entry) => entry.id)).toEqual(['press-check']);
    pressUp();
    expect(performed).toEqual(['press-check']);
    expect(menu.opened).toBeUndefined();
  });

  it('never selects or performs a greyed emote, and a release on it closes the ring', () => {
    const { menu, entries, performed, press, pressUp } = fixture({ gun: true, pressCheck: false });
    pressUp();
    expect(menu.ring(entries())?.map((entry) => entry.unavailable)).toEqual([true]);
    press.press();
    menu.point(entries(), up, tuning);
    expect(menu.choice(entries())).toBeUndefined();
    expect(menu.step(entries(), 1)).toBe(false);
    press.release();
    expect(performed).toEqual([]);
    expect(menu.opened).toBeUndefined();
  });

  it('greys the mode out with no gun in hand, so its ring cannot be entered', () => {
    const { menu, entries, performed, pressUp } = fixture({ gun: false, pressCheck: false });
    pressUp();
    expect(entries().map((entry) => entry.unavailable)).toEqual([true]);
    expect(menu.opened).toBeUndefined();
    expect(performed).toEqual([]);
  });

  it('opens no ring when content places no emote under any mode', () => {
    const { menu, press } = fixture(undefined, { emote: { gun: 0 }, gun: {} });
    press.press();
    expect(menu.opened).toBeUndefined();
  });

  it('releasing at the centre performs nothing and closes the ring', () => {
    const { menu, performed, press } = fixture();
    press.press();
    press.release();
    expect(performed).toEqual([]);
    expect(menu.opened).toBeUndefined();
  });
});
