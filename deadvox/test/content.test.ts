import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blockColors, buildRegistry } from '../src/core/content.ts';
import { inventoryTotals } from '../src/core/inventory.ts';

const BASE = 'src/content/base';
const base = readdirSync(BASE)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ source: f, data: JSON.parse(readFileSync(join(BASE, f), 'utf8')) as unknown }));

describe('content', () => {
  it('base content has no issues', () => {
    const { registry, issues } = buildRegistry(base);
    expect(issues).toEqual([]);
    expect(registry.blocks[0]!.id).toBe('air');
    for (const id of ['grass', 'dirt', 'stone', 'sand']) {
      expect(registry.blockIds.has(id)).toBe(true);
    }
  });

  it('lets a later file override a block without changing its runtime id', () => {
    const mod = {
      source: 'mod.json',
      data: { blocks: [{ id: 'grass', name: 'Dead grass', color: '#8a7a40', solid: true }] },
    };
    const before = buildRegistry(base).registry;
    const after = buildRegistry([...base, mod]).registry;
    expect(after.blockIds.get('grass')).toBe(before.blockIds.get('grass'));
    expect(after.blocks[after.blockIds.get('grass')!]!.name).toBe('Dead grass');
    expect(after.blocks.length).toBe(before.blocks.length);
  });

  it('reports mistakes and skips the broken file whole', () => {
    const bad = {
      source: 'bad.json',
      data: {
        blocks: [
          { id: 'Rock', name: 'Rock', color: 'grey', solid: true, hardnes: 3 },
          { id: 'ok', name: 'Fine', color: '#ffffff', solid: true },
          { id: 'ok', name: 'Again', color: '#ffffff', solid: true },
        ],
        items: [{ id: 'x', name: 'X', category: 'misc', weight: -1 }],
        loot: [],
      },
    };
    const { registry, issues } = buildRegistry([...base, bad]);
    expect(issues.map((i) => i.path).sort()).toEqual([
      'blocks[0].color',
      'blocks[0].hardnes',
      'blocks[0].id',
      'blocks[2].id',
      'items[0].volume',
      'items[0].weight',
      'loot',
    ]);
    expect(registry.blockIds.has('ok')).toBe(false);
  });

  it('turns block colours into bytes', () => {
    const { registry } = buildRegistry([
      { source: 'a', data: { blocks: [{ id: 'r', name: 'R', color: '#ff8001', solid: true }] } },
    ]);
    expect([...blockColors(registry)]).toEqual([0, 0, 0, 255, 128, 1]);
  });

  it('totals inventory weight and volume', () => {
    const { registry } = buildRegistry(base);
    const totals = inventoryTotals(
      [
        { item: 'bandage', count: 3 },
        { item: 'gone_mod_item', count: 1 },
      ],
      registry,
    );
    expect(totals).toEqual({ weight: 60, volume: 150, unknown: ['gone_mod_item'] });
  });
});
