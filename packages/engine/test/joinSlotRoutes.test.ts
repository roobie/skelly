import { describe, expect, it } from 'vitest';
import { joinSlotRoutes } from '../src/core/templates.ts';

const A: [number, number, number] = [0, 1, 0];
const B: [number, number, number] = [2, 1, 0];
const C: [number, number, number] = [2, 1, 2];
const D: [number, number, number] = [4, 1, 2];
const E: [number, number, number] = [6, 1, 2];

describe('joinSlotRoutes', () => {
  it('chains slot routes into one passage in whichever order the slots declare them', () => {
    expect(
      joinSlotRoutes(
        [
          [A, B],
          [B, C],
        ],
        's',
      ),
    ).toEqual([A, B, C]);
    expect(
      joinSlotRoutes(
        [
          [B, C],
          [A, B],
        ],
        's',
      ),
    ).toEqual([A, B, C]);
  });

  it('reverses a slot route authored the other way round, at either end of the chain', () => {
    expect(
      joinSlotRoutes(
        [
          [A, B],
          [C, B],
        ],
        's',
      ),
    ).toEqual([A, B, C]);
    expect(
      joinSlotRoutes(
        [
          [C, D],
          [B, C],
          [A, B],
        ],
        's',
      ),
    ).toEqual([A, B, C, D]);
  });

  it('refuses a slot route that touches no end of the chain', () => {
    expect(() =>
      joinSlotRoutes(
        [
          [A, B],
          [D, E],
        ],
        's',
      ),
    ).toThrow('slot routes must join into one passage through shared mouth points');
  });
});
