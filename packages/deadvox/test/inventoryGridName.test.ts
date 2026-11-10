import { expect, it } from 'vitest';
import { visibleGridName } from '../src/core/inventoryGridName.ts';

it('fits more narrow glyphs than wide ones in a grid cell', () => {
  expect(visibleGridName('i'.repeat(60), 1, 1).length).toBeGreaterThan(visibleGridName('W'.repeat(60), 1, 1).length);
});

it('counts a glyph outside the width table as the widest one', () => {
  expect(visibleGridName('漢'.repeat(60), 1, 1).length).toBeLessThanOrEqual(
    visibleGridName('@'.repeat(60), 1, 1).length,
  );
});

it('continues one long word onto more lines when the cell has more lines', () => {
  const word = 'm'.repeat(200);
  const oneLineHigh = visibleGridName(word, 2, 1);
  const twoLinesHigh = visibleGridName(word, 2, 2);
  expect(word.startsWith(twoLinesHigh)).toBe(true);
  expect(twoLinesHigh.length).toBeGreaterThan(oneLineHigh.length);
});
