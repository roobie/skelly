import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Character } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { disassemblyOutputs, planDisassembly } from '../src/core/disassembly.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import type { ItemDef } from '../src/core/schema.ts';
import { gameMinutes } from '../src/core/time.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { playerInventorySource } from './fixtures/playerInventory.ts';

const base = 'src/content/base';
const itemSource = (file: string, ids: readonly string[]) => {
  const data = JSON.parse(readFileSync(join(base, file), 'utf8')) as {
    items: { id: string; salvage?: unknown; salvageTimeGameMinutes?: unknown }[];
  };
  data.items = data.items.filter(({ id }) => ids.includes(id));
  for (const item of data.items) {
    if (item.id === 'portable_radio') {
      item.salvage = undefined;
      item.salvageTimeGameMinutes = undefined;
    }
  }
  return { source: file, data };
};
// The kept items' weapons name sounds, so the fixture loads just the rows they name.
const soundSource = (sources: readonly ReturnType<typeof itemSource>[]) => {
  const named = new Set(
    sources.flatMap(({ data }) =>
      data.items.flatMap((item) =>
        Object.values((item as { weapon?: Record<string, Record<string, unknown>> }).weapon ?? {}).flatMap((mode) =>
          Object.entries(mode).flatMap(([key, value]) => (key.endsWith('Sound') ? [value] : [])),
        ),
      ),
    ),
  );
  const sounds = readdirSync(base)
    .filter((file) => file.startsWith('sounds') && file.endsWith('.json'))
    .flatMap((file) => (JSON.parse(readFileSync(join(base, file), 'utf8')) as { sounds: { id: string }[] }).sounds)
    .filter(({ id }) => named.has(id));
  return { source: 'sounds.json', data: { sounds } };
};
const recipes = JSON.parse(readFileSync(join(base, 'recipes.json'), 'utf8')) as {
  skills: { id: string; [key: string]: unknown }[];
};
const items = [
  itemSource('items-tools.json', ['kitchen_knife']),
  itemSource('items-other.json', ['portable_radio', 'scrap_metal']),
];
const fixtureBuild = buildRegistry([
  playerInventorySource(),
  ...items,
  soundSource(items),
  { source: 'models-melee.json', data: JSON.parse(readFileSync(join(base, 'models-melee.json'), 'utf8')) as unknown },
  {
    source: 'recipes.json',
    data: {
      skills: recipes.skills.filter(({ id }) => id === 'crafting').map(({ startingRecipes: _, ...skill }) => skill),
    },
  },
]);
if (fixtureBuild.issues.length > 0) {
  throw new Error(`Invalid disassembly fixture: ${JSON.stringify(fixtureBuild.issues)}`);
}
const { registry } = fixtureBuild;

const definition = (yields: NonNullable<ItemDef['disassembly']>['yields']): ItemDef =>
  ({ disassembly: { timeGameMinutes: gameMinutes(1), skill: 'crafting', yields } }) as ItemDef;

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

  it('uses indexed usable tool qualities and excludes a ruined provider', () => {
    const testRegistry = { ...registry, items: new Map(registry.items) };
    expect(testRegistry.items.get('kitchen_knife')?.tool?.qualities.cutting).toBeGreaterThan(0);
    const radio = testRegistry.items.get('portable_radio')!;
    testRegistry.items.set('portable_radio', {
      ...radio,
      salvage: undefined,
      salvageTimeGameMinutes: undefined,
      disassembly: {
        timeGameMinutes: gameMinutes(1),
        skill: 'crafting',
        yields: [
          {
            item: 'scrap_metal',
            count: 2,
            fractions: [0.5],
            rounding: 'floor',
            toolModifier: { quality: 'cutting', bonusByLevel: [0.5, 1] },
          },
        ],
      },
    });
    const inventory = new Inventory(testRegistry);
    const position: [number, number, number] = [0, 0, 0];
    const reach = bindReach({ inventory, position, blockSize: 0.5, clock: BASE_CLOCK });
    const source = inventory.create('portable_radio');
    const ruinedKnife = inventory.create('kitchen_knife');
    ruinedKnife.condition = 0;
    expect(inventory.add(source, { kind: 'pile', pos: position })).toBe(true);
    expect(inventory.add(ruinedKnife, { kind: 'pile', pos: position })).toBe(true);

    const plan = planDisassembly(source, reach(), new Character(testRegistry));
    expect(plan?.toolLevels).toEqual({ cutting: 0 });
    expect(plan?.outputs).toEqual([{ item: 'scrap_metal', count: 1 }]);
  });

  it('states gather in game seconds, scaling the retrieval handling by the session clock', () => {
    const testRegistry = { ...registry, items: new Map(registry.items) };
    const radio = testRegistry.items.get('portable_radio')!;
    testRegistry.items.set('portable_radio', {
      ...radio,
      salvage: undefined,
      salvageTimeGameMinutes: undefined,
      disassembly: {
        timeGameMinutes: gameMinutes(1),
        skill: 'crafting',
        yields: [{ item: 'scrap_metal', count: 2, fractions: [1], rounding: 'floor' }],
      },
    });
    const inventory = new Inventory(testRegistry);
    const position: [number, number, number] = [0, 0, 0];
    const source = inventory.create('portable_radio');
    expect(inventory.add(source, { kind: 'pile', pos: position })).toBe(true);
    const planAt = (ratio: number) => {
      const reach = bindReach({ inventory, position, blockSize: 0.5, clock: { ...BASE_CLOCK, ratio } })();
      return { reach, plan: planDisassembly(source, reach, new Character(testRegistry))! };
    };
    const slow = planAt(BASE_CLOCK.ratio);
    const fast = planAt(BASE_CLOCK.ratio * 2);
    const handling = slow.reach.entries.find((entry) => entry.item === source)!.handlingTime;
    expect(handling).toBeGreaterThan(0);
    expect(slow.plan.gather).toBe(handling * BASE_CLOCK.ratio);
    expect(fast.plan.gather).toBe(slow.plan.gather * 2);
    expect(fast.plan.duration - fast.plan.gather).toBeCloseTo(slow.plan.duration - slow.plan.gather);
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
