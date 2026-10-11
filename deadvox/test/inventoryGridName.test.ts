import { expect, it } from 'vitest';
import { inventoryGridName } from '../src/core/inventoryGridName.ts';

const firstLine = (name: string): string => inventoryGridName(name, 1, 1).split('\n')[0]!;

it('fits more narrow glyphs than wide ones on a grid-name line', () => {
  expect(firstLine('i'.repeat(30)).length).toBeGreaterThan(firstLine('W'.repeat(30)).length);
});

it('counts a glyph outside the width table as the widest one', () => {
  expect(firstLine('漢'.repeat(30)).length).toBeLessThanOrEqual(firstLine('@'.repeat(30)).length);
});
