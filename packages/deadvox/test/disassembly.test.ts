import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { disassemblyOutputs, planDisassembly } from '../../engine/src/core/disassembly.ts';
import type { MeleeClassDef } from '../../engine/src/core/schema.ts';
import { gameMinutes } from '../../engine/src/core/time.ts';
import { buildRegistry, type ItemDef } from '../../engine/src/content.ts';
import { Inventory } from '../../engine/src/inventory.ts';
import { bindReach, Character } from '../../engine/src/sim.ts';
import { baseContentSources } from './baseContentFiles.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { playerInventorySource } from './fixtures/playerInventory.ts';

const base = 'mods/skelly.deadvox.scenario.gauntlet.city';
const itemSource = (file: string, ids: readonly string[]) => {
  const data = JSON.parse(readFileSync(join(base, file), 'utf8')) as {
    items: { id: string; salvage?: unknown; salvageTimeGameMinutes?: unknown }[];
    meleeClasses?: MeleeClassDef[];
    recipes?: unknown;
  };
  data.items = data.items.filter(({ id }) => ids.includes(id));
  data.recipes = undefined;
  const absent = ids.filter((id) => !data.items.some((item) => item.id === id));
  if (ids.length === 0 || absent.length > 0) {
    throw new Error(`${file} selects nothing or holds no ${absent.join(', ')}`);
  }
  for (const item of data.items) {
    if (item.id === 'portable_radio') {
      item.salvage = undefined;
      item.salvageTimeGameMinutes = undefined;
    }
  }
  return { source: file, data };
};
// The retained unarmed provider also selects sounds independently of the kept items.
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
  for (const { data } of sources) {
    for (const { unarmed } of data.meleeClasses ?? []) {
      if (unarmed) {
        named.add(unarmed.swingSound);
        named.add(unarmed.hitSound);
      }
    }
  }
  const sounds = baseContentSources()
    .flatMap(({ data }) => (data as { sounds?: { id: string }[] }).sounds ?? [])
    .filter(({ id }) => named.has(id));
  return { source: 'sounds.json', data: { sounds } };
};
const crafting = JSON.parse(readFileSync('../mods/skelly.crafting/crafting.json', 'utf8')) as {
  skills: { id: string; [key: string]: unknown }[];
};
const meleeMod = '../mods/skelly.melee-classes';
const items = [
  itemSource('../../../mods/skelly.hand-tools/hand-tools-items.json', ['kitchen_knife']),
  itemSource('../../../mods/skelly.electric-power/electric-power-items.json', ['portable_radio']),
  itemSource('../../../mods/skelly.materials/materials-items.json', ['scrap_metal']),
  {
    source: 'melee-classes.json',
    data: {
      items: [],
      ...(JSON.parse(readFileSync(join(meleeMod, 'melee-classes.json'), 'utf8')) as {
        meleeClasses: MeleeClassDef[];
      }),
    },
  },
];
const fixtureBuild = buildRegistry([
  playerInventorySource(),
  {
    source: 'damage-kinds.json',
    data: JSON.parse(readFileSync(join(meleeMod, 'damage-kinds.json'), 'utf8')) as unknown,
  },
  ...items,
  soundSource(items),
  {
    source: 'item-wear.json',
    data: JSON.parse(readFileSync('../mods/skelly.inventory/item-wear.json', 'utf8')) as unknown,
  },
  { source: 'models-items.json', data: JSON.parse(readFileSync(join(base, 'models-items.json'), 'utf8')) as unknown },
  {
    source: 'models-electric-power.json',
    data: JSON.parse(readFileSync('../mods/skelly.electric-power/models-electric-power.json', 'utf8')) as unknown,
  },
  {
    source: 'models-hand-tools.json',
    data: JSON.parse(readFileSync('../mods/skelly.hand-tools/models-hand-tools.json', 'utf8')) as unknown,
  },
  {
    source: 'models-materials.json',
    data: JSON.parse(readFileSync('../mods/skelly.materials/models-materials.json', 'utf8')) as unknown,
  },
  {
    source: 'crafting.json',
    data: {
      skills: crafting.skills.filter(({ id }) => id === 'crafting'),
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
