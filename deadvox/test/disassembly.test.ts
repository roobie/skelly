import { describe, expect, it } from 'vitest';
import { disassemblyOutputs } from '../src/core/disassembly.ts';
import type { ItemDef } from '../src/core/schema.ts';

const definition = (yields: NonNullable<ItemDef['disassembly']>['yields']): ItemDef =>
  ({ disassembly: { time: 1, skill: 'crafting', yields } }) as ItemDef;

describe('authored disassembly yields', () => {
  it('uses skill-0 and top-skill fractions with each yield’s declared integer rounding', () => {
    const item = definition([
      { item: 'scrap_metal', count: 3, fractions: [0.5, 1], rounding: 'floor' },
      { item: 'rag', count: 3, fractions: [0.5, 1], rounding: 'round' },
      { item: 'wax', count: 1, fractions: [0.5, 1], rounding: 'ceil' },
    ]);
    expect(disassemblyOutputs(item, 0)).toEqual([
      { item: 'scrap_metal', count: 1 },
      { item: 'rag', count: 2 },
      { item: 'wax', count: 1 },
    ]);
    const top = [
      { item: 'scrap_metal', count: 3 },
      { item: 'rag', count: 3 },
      { item: 'wax', count: 1 },
    ];
    expect(disassemblyOutputs(item, 1)).toEqual(top);
    expect(disassemblyOutputs(item, 20)).toEqual(top);
  });

  it('adds the best reachable tool modifier before applying the yield rounding', () => {
    const item = definition([
      {
        item: 'scrap_metal',
        count: 2,
        fractions: [0.5, 1],
        rounding: 'floor',
        toolModifier: { quality: 'cutting', bonusByLevel: [0.25, 0.5] },
      },
    ]);
    expect(disassemblyOutputs(item, 0)).toEqual([{ item: 'scrap_metal', count: 1 }]);
    expect(disassemblyOutputs(item, 0, (quality) => (quality === 'cutting' ? 1 : 0))).toEqual([
      { item: 'scrap_metal', count: 1 },
    ]);
    expect(disassemblyOutputs(item, 0, () => 2)).toEqual([{ item: 'scrap_metal', count: 2 }]);
  });
});
