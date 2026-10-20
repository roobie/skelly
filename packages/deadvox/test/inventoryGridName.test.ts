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

// The fixture is a single word wider than one line of a cell but well inside the cell's lines.
it('continues a word wider than a line on the next line', () => {
  expect(visibleGridName('Abcdefghi', 1, 1)).toBe('Abcdefghi');
});
