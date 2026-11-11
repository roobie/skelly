import type { Item } from '@skelly/engine/inventory';
import { ActionMenu, HeldActionPress, radialEntries } from '@skelly/engine/sim';
import { describe, expect, it } from 'vitest';

const HOLD_MS = 300;
const tuning = { radiusPixels: 100, deadZonePixels: 20, selectionHalfAngleDegrees: 30 };
const choices = [
  { id: 'own', label: 'Use' },
  { id: 'sharpen', label: 'Sharpen' },
];
const entries = radialEntries(choices, { own: 0, sharpen: 90 });

const fixture = (actions: readonly { id: string; label: string }[] = choices, menuEntries = entries) => {
  const menu = new ActionMenu();
  const hands: { right: Item | undefined } = { right: { uid: 5 } as Item };
  const taps: string[] = [];
  const acts: string[] = [];
  const press = new HeldActionPress({
    menu,
    item: (hand) => (hand === 'right' ? hands.right : undefined),
    actions: () => actions,
    menuActions: () => menuEntries,
    holdRealMs: HOLD_MS,
    tap: (hand, trigger) => taps.push(`${hand}:${trigger}`),
    act: (item, id) => acts.push(`${item.uid}:${id}`),
  });
  return { menu, hands, taps, acts, press };
};

describe('held item action press', () => {
  it('leaves a lone action its own press', () => {
    const { press, menu } = fixture([choices[0]!]);
    expect(press.press('right', 'dominant', 0)).toBe(false);
    press.update(HOLD_MS * 2);
    expect(menu.opened).toBeUndefined();
  });

  it('keeps the ordinary use on a tap, once, without opening the menu', () => {
    const { press, menu, taps, acts } = fixture();
    expect(press.press('right', 'off', 0)).toBe(true);
    press.release('off', HOLD_MS / 2);
    press.release('off', HOLD_MS / 2);
    expect(taps).toEqual(['right:off']);
    expect(acts).toEqual([]);
    expect(menu.opened).toBeUndefined();
  });

  it('chooses nothing on a release at the centre', () => {
    const { press, menu, taps, acts } = fixture();
    press.press('right', 'dominant', 0);
    press.update(HOLD_MS);
    expect(menu.isOpen('held', 5)).toBe(true);
    press.release('dominant', HOLD_MS * 2);
    expect([...taps, ...acts]).toEqual([]);
    expect(menu.opened).toBeUndefined();
  });

  it('runs the pointed-at action once on release', () => {
    const { press, menu, acts } = fixture();
    press.press('right', 'forward', 0);
    press.update(HOLD_MS);
    menu.point(entries, { x: tuning.radiusPixels, y: 0 }, tuning);
    press.release('forward', HOLD_MS * 2);
    press.release('forward', HOLD_MS * 2);
    expect(acts).toEqual(['5:sharpen']);
  });

  it('acts on nothing once the pressed item has left the hand', () => {
    const { press, menu, hands, taps, acts } = fixture();
    press.press('right', 'dominant', 0);
    press.update(HOLD_MS);
    menu.point(entries, { x: tuning.radiusPixels, y: 0 }, tuning);
    hands.right = { uid: 6 } as Item;
    press.release('dominant', HOLD_MS * 2);
    expect([...taps, ...acts]).toEqual([]);
  });

  it('closes the held ring on cancel but keeps the child list its release opened', () => {
    const treat = [...choices, { id: 'treat', label: 'Treat', children: [{ id: 'arm', label: 'Arm' }] }];
    const treatEntries = radialEntries(treat, { own: 0, sharpen: 180, treat: 90 });
    const held = fixture(treat, treatEntries);
    held.press.press('right', 'dominant', 0);
    held.press.update(HOLD_MS);
    held.press.cancel();
    expect(held.menu.opened).toBeUndefined();

    const { press, menu } = fixture(treat, treatEntries);
    press.press('right', 'dominant', 0);
    press.update(HOLD_MS);
    menu.point(treatEntries, { x: tuning.radiusPixels, y: 0 }, tuning);
    press.release('dominant', HOLD_MS * 2);
    expect(menu.childOpen).toBe(true);
    press.cancel();
    expect(menu.childOpen).toBe(true);
  });

  it('ignores the release of a press it did not take', () => {
    const { press, menu, acts } = fixture();
    press.press('right', 'dominant', 0);
    press.update(HOLD_MS);
    menu.point(entries, { x: tuning.radiusPixels, y: 0 }, tuning);
    press.release('off', HOLD_MS * 2);
    expect(acts).toEqual([]);
    expect(menu.isOpen('held', 5)).toBe(true);
  });
});
