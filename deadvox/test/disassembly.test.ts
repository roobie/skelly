import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Character } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { disassemblyOutputs, planDisassembly } from '../src/core/disassembly.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import type { ItemDef } from '../src/core/schema.ts';
import { gameMinutes } from '../src/core/time.ts';

const base = 'src/content/base';
const itemSource = (file: string, ids: readonly string[]) => {
  const data = JSON.parse(readFileSync(join(base, file), 'utf8')) as {
    items: { id: string; salvage?: unknown }[];
  };
  data.items = data.items.filter(({ id }) => ids.includes(id));
  for (const item of data.items) {
    if (item.id === 'portable_radio') {
      delete item.salvage;
    }
  }
  return { source: file, data };
};
const recipes = JSON.parse(readFileSync(join(base, 'recipes.json'), 'utf8')) as {
  skills: { id: string; [key: string]: unknown }[];
};
const fixtureBuild = buildRegistry([
  itemSource('items-tools.json', ['kitchen_knife']),
  itemSource('items-other.json', ['portable_radio', 'scrap_metal']),
  { source: 'models-melee.json', data: JSON.parse(readFileSync(join(base, 'models-melee.json'), 'utf8')) as unknown },
  { source: 'recipes.json', data: { skills: recipes.skills.filter(({ id }) => id === 'crafting') } },
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
    expect(registry.items.get('kitchen_knife')?.tool?.qualities.cutting).toBeGreaterThan(0);
    const radio = registry.items.get('portable_radio')!;
    registry.items.set('portable_radio', {
      ...radio,
      salvage: undefined,
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
    const inventory = new Inventory(registry);
    const position: [number, number, number] = [0, 0, 0];
    const reach = bindReach({ inventory, position, blockSize: 0.5 });
    const source = inventory.create('portable_radio');
    const ruinedKnife = inventory.create('kitchen_knife');
    ruinedKnife.condition = 0;
    expect(inventory.add(source, { kind: 'pile', pos: position })).toBe(true);
    expect(inventory.add(ruinedKnife, { kind: 'pile', pos: position })).toBe(true);

    const plan = planDisassembly(source, reach(), new Character(registry));
    expect(plan?.toolLevels).toEqual({ cutting: 0 });
    expect(plan?.outputs).toEqual([{ item: 'scrap_metal', count: 1 }]);
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
