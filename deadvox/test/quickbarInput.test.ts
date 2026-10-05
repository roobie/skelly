import { describe, expect, it } from 'vitest';
import { QuickbarInput } from '../src/game/quickbarInput.ts';

const key = (slot: number) => `Digit${slot + 1}`;

describe('quickbar gesture admission', () => {
  it('dispatches a quick release as a tap only', () => {
    const taps: number[] = [];
    const holds: number[] = [];
    const input = new QuickbarInput({ tap: (slot) => taps.push(slot), hold: (slot) => holds.push(slot) });

    input.keyDown(key(2), 10);
    input.keyUp(key(2), 10);

    expect(taps).toEqual([2]);
    expect(holds).toEqual([]);
  });

  it('dispatches a held slot once, even when release follows the hold update', () => {
    const taps: number[] = [];
    const holds: number[] = [];
    const input = new QuickbarInput({ tap: (slot) => taps.push(slot), hold: (slot) => holds.push(slot) });

    input.keyDown(key(1), 0);
    input.update(Number.MAX_VALUE);
    input.keyUp(key(1), Number.MAX_VALUE);

    expect(taps).toEqual([]);
    expect(holds).toEqual([1]);
  });

  it('cancels a held gesture without dispatching when input is lost', () => {
    const taps: number[] = [];
    const holds: number[] = [];
    const input = new QuickbarInput({ tap: (slot) => taps.push(slot), hold: (slot) => holds.push(slot) });

    input.keyDown(key(0), 0);
    input.cancel();
    input.keyUp(key(0), Number.MAX_VALUE);

    expect(taps).toEqual([]);
    expect(holds).toEqual([]);
  });
});
