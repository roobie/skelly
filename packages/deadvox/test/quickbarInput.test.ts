import { describe, expect, it } from 'vitest';
import { startupContent } from './baseRegistry.ts';

const BUNDLED_CONTENT = startupContent();

import { PressHoldInput } from '../src/game/pressHoldInput.ts';
import { QuickbarInput } from '../src/game/quickbarInput.ts';

const fixture = () => {
  const taps: number[] = [];
  const holds: number[] = [];
  return {
    taps,
    holds,
    input: new QuickbarInput({ tap: (slot) => taps.push(slot), hold: (slot) => holds.push(slot) }),
  };
};
describe('quickbar gesture admission', () => {
  it('dispatches a quick release as a tap only', () => {
    const { input, taps, holds } = fixture();
    input.keyDown(2, 10);
    input.keyUp(2, 10);
    expect(taps).toEqual([2]);
    expect(holds).toEqual([]);
  });
  it('dispatches a held slot once, even when release follows the hold update', () => {
    const { input, taps, holds } = fixture();
    input.keyDown(1, 0);
    input.update(Number.MAX_VALUE);
    input.keyUp(1, Number.MAX_VALUE);
    expect(taps).toEqual([]);
    expect(holds).toEqual([1]);
  });
  it('classifies T release below the authored stance threshold as a tap and the boundary as a drop', () => {
    const holdMs = BUNDLED_CONTENT.registry.senses.get('player')!.light.throwStanceDropHoldRealSeconds * 1000;
    const actions: string[] = [];
    const input = new PressHoldInput<string>({
      holdRealMs: () => holdMs,
      tap: () => actions.push('stance-toggle'),
      hold: () => actions.push('drop'),
    });

    input.keyDown('player.throw', 0);
    input.update(holdMs - 1);
    input.keyUp('player.throw', holdMs - 1);
    expect(actions).toEqual(['stance-toggle']);

    input.keyDown('player.throw', holdMs + 10);
    input.update(holdMs * 2 + 10);
    input.keyUp('player.throw', holdMs * 2 + 10);
    expect(actions).toEqual(['stance-toggle', 'drop']);
  });

  it('repeats a one-action hold on later player ticks, but a tap acts once and release stops repetition', () => {
    const uses: string[] = [];
    const holdMs = 10;
    const input = new PressHoldInput<string>({
      holdRealMs: () => holdMs,
      tap: (action) => uses.push(action),
      hold: (action) => uses.push(action),
      repeat: (action) => uses.push(action),
    });
    input.keyDown('held.use', 0);
    input.repeat();
    input.keyUp('held.use', holdMs - 1);
    input.repeat();
    expect(uses).toEqual(['held.use']);

    input.keyDown('held.use', holdMs);
    input.update(holdMs * 2);
    expect(input.isHeld('held.use')).toBe(true);
    input.repeat();
    expect(uses).toEqual(['held.use', 'held.use']);
    input.repeat();
    expect(uses).toEqual(['held.use', 'held.use', 'held.use']);
    input.keyUp('held.use', holdMs * 3);
    input.repeat();
    expect(input.isHeld('held.use')).toBe(false);
    expect(uses).toEqual(['held.use', 'held.use', 'held.use']);
  });

  it('cancels a held gesture without dispatching when input is lost', () => {
    const { input, taps, holds } = fixture();
    input.keyDown(0, 0);
    input.cancel();
    input.keyUp(0, Number.MAX_VALUE);
    expect(taps).toEqual([]);
    expect(holds).toEqual([]);
  });
});
