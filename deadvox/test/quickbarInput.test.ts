import { describe, expect, it } from 'vitest';
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
  it('cancels a held gesture without dispatching when input is lost', () => {
    const { input, taps, holds } = fixture();
    input.keyDown(0, 0);
    input.cancel();
    input.keyUp(0, Number.MAX_VALUE);
    expect(taps).toEqual([]);
    expect(holds).toEqual([]);
  });
});
