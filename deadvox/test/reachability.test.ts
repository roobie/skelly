import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { possibleHamletZombies } from '../src/core/hamlet.ts';
import { checkReachability, PENDING_REACHABILITY } from '../src/core/reachability.ts';
import type { SpawnMarker } from '../src/core/templates.ts';

const BASE = 'src/content/base';
const sources = readdirSync(BASE)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((source) => ({
    source,
    data: JSON.parse(readFileSync(join(BASE, source), 'utf8')) as unknown,
  }));
const fresh = () => buildRegistry(sources).registry;
const marker = (zombie: string, chance = 1): SpawnMarker => ({ zombie, chance, pos: [0, 0, 0] });

describe('static reachability', () => {
  it('hard-checks practice sources while keeping only unplaced workstations pending', () => {
    expect(PENDING_REACHABILITY).toEqual({ workstation: '2.8' });
    const registry = fresh();
    registry.recipes.clear();
    registry.furniture.set('unplaced_bench', {
      ...registry.furniture.get('crate')!,
      id: 'unplaced_bench',
      workstation: { id: 'unplaced' },
    });
    registry.recipes.set('torch', {
      id: 'torch',
      result: { item: 'rag', count: 1 },
      time: 1,
      components: [[{ item: 'rag', count: 1 }]],
      qualities: {},
      skills: { crafting: 1 },
      workstation: 'unplaced',
    });
    const result = checkReachability(registry);
    expect(result.issues).toContainEqual({
      recipe: 'torch',
      path: '.skills.crafting',
      message: 'no reachable practice source can raise "crafting" to level 1',
    });
    expect(result.pending.map(({ kind, path, message }) => [kind, path, message])).toEqual([
      ['workstation', '.workstation', 'pending: no source yet (2.8)'],
    ]);
    registry.furniture.get('crate')!.workstation = { id: 'unplaced' };
    expect(checkReachability(registry).pending).toEqual([]);
    expect(checkReachability(registry).issues.map(({ path }) => path)).toEqual(['.skills.crafting']);
  });

  it('hard-rejects unknown knowledge and prevents its result from grounding a starting-known recipe', () => {
    const registry = fresh();
    registry.recipes.clear();
    registry.items.set('unlearned_tool', {
      id: 'unlearned_tool',
      name: 'Unlearned tool',
      category: 'tool',
      weight: 1,
      size: [1, 1],
      tool: { qualities: { cutting: 2 } },
    });
    const supplier = {
      id: 'unlearned',
      result: { item: 'unlearned_tool', count: 1 },
      time: 1,
      skills: {},
      qualities: {},
      components: [[{ item: 'rag', count: 1 }]],
    };
    registry.recipes.set(supplier.id, supplier);
    registry.recipes.set('torch', {
      ...supplier,
      id: 'torch',
      result: { item: 'torch', count: 1 },
      qualities: { cutting: 2 },
      components: [[{ item: 'unlearned_tool', count: 1 }]],
    });
    const unknown = checkReachability(registry);
    expect(unknown.issues).toContainEqual({
      recipe: 'unlearned',
      path: '.knowledge',
      message: expect.stringContaining('knowledge source'),
    });
    expect(unknown.components.has('unlearned_tool')).toBe(false);
    expect(unknown.toolReachable.has('unlearned_tool')).toBe(false);
    expect(unknown.issues).toContainEqual({
      recipe: 'torch',
      path: '.components[0][0].item',
      message: expect.any(String),
    });
    // Same content/stock; changing only the supplier to a real starting-known recipe grounds it.
    registry.recipes.delete('unlearned');
    registry.recipes.set('candle', { ...supplier, id: 'candle' });
    const known = checkReachability(registry);
    expect(known.issues).toEqual([]);
    expect(known.components.has('unlearned_tool')).toBe(true);
    expect(known.toolReachable.has('torch')).toBe(true);
  });

  it('accepts book knowledge only when a teaching book is reachable in placed loot', () => {
    const registry = fresh();
    registry.recipes.clear();
    registry.recipes.set('learned_from_book', {
      id: 'learned_from_book',
      result: { item: 'torch', count: 1 },
      time: 1,
      skills: {},
      qualities: {},
      components: [[{ item: 'rag', count: 1 }]],
    });
    registry.items.set('field_manual', {
      ...registry.items.get('field_manual')!,
      book: { title: 'Field Manual', recipes: ['learned_from_book'], readingTime: 5 },
    });
    const withBook = checkReachability(registry);
    expect(withBook.found.has('field_manual')).toBe(true);
    expect(withBook.issues).toEqual([]);

    for (const [id, table] of registry.loot) {
      registry.loot.set(id, { ...table, entries: table.entries.filter((entry) => entry.item !== 'field_manual') });
    }
    expect(checkReachability(registry).issues).toContainEqual({
      recipe: 'learned_from_book',
      path: '.knowledge',
      message: expect.stringContaining('knowledge source'),
    });
  });

  it('seeds only actual placed overrides, positive nested counts and spawnable zombie loot', () => {
    const registry = fresh();
    registry.templates.clear();
    registry.recipes.clear();
    const names = [
      'override',
      'nested',
      'spawned',
      'wanderer',
      'default',
      'unused',
      'unplaced',
      'zero_spawn',
      'zero_roll',
      'zero_count',
    ];
    for (const id of names) {
      registry.items.set(id, { id, name: id, category: 'material', weight: 1, size: [1, 1] });
      registry.loot.set(id, { id, rolls: [1, 1], entries: [{ item: id, weight: 1 }] });
    }
    registry.loot.set('nested', {
      id: 'nested',
      rolls: [0, 1],
      entries: [
        { item: 'nested', weight: 1, count: [0, 1] },
        { table: 'zero_roll', weight: 1 },
        { table: 'zero_count', weight: 1 },
      ],
    });
    registry.loot.set('zero_roll', { id: 'zero_roll', rolls: [0, 0], entries: [{ item: 'zero_roll', weight: 1 }] });
    registry.loot.set('zero_count', {
      id: 'zero_count',
      rolls: [1, 1],
      entries: [{ item: 'zero_count', weight: 1, count: [0, 0] }],
    });
    registry.loot.set('override', {
      id: 'override',
      rolls: [1, 1],
      entries: [
        { item: 'override', weight: 1 },
        { table: 'nested', weight: 1 },
      ],
    });
    registry.furniture.set('fixture_crate', {
      id: 'fixture_crate',
      name: 'Crate',
      size: [1, 1, 1],
      color: '#000000',
      solid: false,
      loot: 'default',
      container: { pockets: [{ grid: [1, 1], handling: 1 }] },
      workstation: { id: 'placed_bench' },
    });
    const shambler = registry.zombies.get('shambler')!;
    registry.zombies.set('shambler', { ...shambler, loot: 'wanderer' });
    registry.zombies.set('fixture_spawn', { ...shambler, id: 'fixture_spawn', loot: 'spawned' });
    registry.zombies.set('fixture_zero', { ...shambler, id: 'fixture_zero', loot: 'zero_spawn' });
    registry.templates.set('shed', {
      id: 'shed',
      size: [3, 1, 1],
      layers: [['FZ0']],
      palette: Object.fromEntries([
        ['F', { furniture: 'fixture_crate', loot: 'override' }],
        ['Z', { spawn: 'fixture_spawn', chance: 0.5 }],
        ['0', { spawn: 'fixture_zero', chance: 0 }],
        ['U', { furniture: 'fixture_crate', loot: 'unused' }],
      ]),
    });
    registry.templates.set('not_placed', {
      id: 'not_placed',
      size: [1, 1, 1],
      layers: [['F']],
      palette: Object.fromEntries([['F', { furniture: 'fixture_crate', loot: 'unplaced' }]]),
    });
    const result = checkReachability(registry);
    expect([...result.found].sort()).toEqual(['nested', 'override', 'spawned', 'wanderer']);
    expect([...result.workstations]).toEqual(['placed_bench']);
  });

  it('excludes capped markers and wanderers, but allows shuffled north templates to be first', () => {
    const ten = Array.from({ length: 10 }, () => marker('certain'));
    expect(
      [
        ...possibleHamletZombies(
          new Map([
            ['small_house', [...ten, marker('too_late')]],
            ['bungalow', [marker('shuffled_first')]],
            ['shed', [marker('south_capped')]],
          ]),
        ),
      ].sort(),
    ).toEqual(['certain', 'shuffled_first']);
    // Nine certain markers leave a possible tenth wanderer; a chance-0 marker consumes no slot.
    expect(
      [...possibleHamletZombies(new Map([['small_house', [...ten.slice(0, 9), marker('never', 0)]]]))].sort(),
    ).toEqual(['certain', 'shambler']);
  });

  it('requires the quality level, while allowing an independently found result to supply its own tool', () => {
    const registry = fresh();
    registry.recipes.clear();
    registry.recipes.set('candle', {
      id: 'candle',
      result: { item: 'hammer', count: 1 },
      time: 1,
      skills: {},
      qualities: { hammering: 3 },
      components: [[{ item: 'rag', count: 1 }]],
    });
    expect(checkReachability(registry).issues.map((issue) => issue.path)).toEqual(['.qualities.hammering']);
    registry.recipes.get('candle')!.qualities.hammering = 2;
    expect(checkReachability(registry).issues).toEqual([]);
  });

  it('grounds a multi-step crafted quality before use instead of borrowing a cyclic component result', () => {
    const registry = fresh();
    registry.recipes.clear();
    for (const [id, quality] of [
      ['crafted_tool', 'grounded'],
      ['cyclic_tool', 'cyclic'],
    ] as const) {
      registry.items.set(id, {
        id,
        name: id,
        category: 'tool',
        weight: 1,
        size: [1, 1],
        tool: { qualities: Object.fromEntries([[quality, 2]]) },
      });
    }
    for (const id of ['middle', 'missing_alternative', 'fixture_product']) {
      registry.items.set(id, { id, name: id, category: 'material', weight: 1, size: [1, 1] });
    }
    const recipe = (id: string, product: string, input: string, quality?: string) => ({
      id,
      result: { item: product, count: 1 },
      time: 1,
      skills: {},
      qualities: quality ? Object.fromEntries([[quality, 2]]) : {},
      components: [[{ item: input, count: 1 }]],
    });
    // Deliberately reverse dependency order; at least three passes are needed.
    registry.recipes.set('consumer', recipe('consumer', 'fixture_product', 'crafted_tool', 'grounded'));
    registry.recipes.set('tool', recipe('tool', 'crafted_tool', 'middle'));
    registry.recipes.set('middle', {
      ...recipe('middle', 'middle', 'rag'),
      components: [
        [
          { item: 'missing_alternative', count: 1 },
          { item: 'rag', count: 1 },
        ],
      ],
    });
    registry.recipes.set('cycle', recipe('cycle', 'cyclic_tool', 'rag', 'cyclic'));
    const result = checkReachability(registry, new Set(registry.recipes.keys()));
    expect(result.toolReachable.has('fixture_product')).toBe(true);
    expect(result.toolReachable.has('cyclic_tool')).toBe(false);
    // A known cyclic-tool recipe still grounds its component result, but never its own tool.
    expect(result.components.has('cyclic_tool')).toBe(true);
    expect(result.issues.filter((issue) => issue.path.startsWith('.components')).map((issue) => issue.path)).toEqual([
      '.components[0][0].item',
    ]);
    expect(result.issues.filter((issue) => issue.path.startsWith('.qualities')).map((issue) => issue.recipe)).toEqual([
      'cycle',
    ]);
  });
});
