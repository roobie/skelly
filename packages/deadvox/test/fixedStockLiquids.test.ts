import { describe, expect, it } from 'vitest';
import inventoryContent from '../src/content/base/inventory.json' with { type: 'json' };
import { Inventory } from '../src/core/inventory.ts';
import { rollLoot } from '../src/core/loot.ts';
import { Rng } from '../src/core/random.ts';
import type { FixedLootItemDef } from '../src/core/schema.ts';
import { buildFixtureRegistry, fixtureLootPoint } from './economyFixtures.ts';
import { RESULT, STOCK, VESSEL } from './liquidCraftFixture.ts';
import { liquidRecoveryData } from './liquidRecoveryFixture.ts';

const stock = (): FixedLootItemDef[] => [
  { item: RESULT, craftedLiquids: [{ liquid: STOCK, volumeMicrolitres: 200 }] },
  { item: VESSEL, liquidContents: { kind: 'filled', liquid: STOCK, volumeMicrolitres: 100 } },
];
const pack = (items: unknown[], data = liquidRecoveryData()) =>
  buildFixtureRegistry([
    {
      source: 'fixture-stock-liquids',
      data: {
        ...data,
        inventory: inventoryContent.inventory,
        blocks: [{ id: 'fixture_floor', name: 'Fixture floor', solid: true, color: '#808080' }],
        templates: [
          {
            id: 'fixture_stock_room',
            size: [3, 5, 3],
            palette: { ' ': 'air', '#': 'fixture_floor', L: { groundLoot: { kind: 'fixed', items } } },
            layers: [
              ['###', '###', '###'],
              ['   ', ' L ', '   '],
              ...Array.from({ length: 3 }, () => ['   ', '   ', '   ']),
            ],
          },
        ],
      },
    },
  ]);

describe('fixed stock liquid state', () => {
  it('carries authored provenance and vessel contents through rolling into independent instances', () => {
    const authored = stock();
    const { registry, issues } = pack(authored);
    expect(issues).toEqual([]);
    const inventory = new Inventory(registry);
    const rolled = rollLoot(registry, fixtureLootPoint({ kind: 'fixed', items: authored }), new Rng([1, 2, 3, 4]));
    const instances = rolled.map((entry) => inventory.createRolled(entry));
    expect(instances[0]!.craftedLiquids).toEqual(authored[0]!.craftedLiquids);
    expect(instances[1]!.liquidContents).toEqual(authored[1]!.liquidContents);
    expect(instances[0]!.craftedLiquids).not.toBe(rolled[0]!.craftedLiquids);
    expect(instances[0]!.craftedLiquids![0]).not.toBe(rolled[0]!.craftedLiquids![0]);
    expect(instances[1]!.liquidContents).not.toBe(rolled[1]!.liquidContents);
  });
  it.each(['disassembly', 'salvage', 'neither'] as const)(
    'refuses unsupported crafted-liquid stock (%s)',
    (capability) => {
      const data = liquidRecoveryData();
      data.recipes = [];
      const result = data.items.find(({ id }) => id === RESULT)!;
      if (!('disassembly' in result)) {
        throw new Error('Missing fixture recovery capabilities');
      }
      if (capability === 'disassembly') {
        Reflect.deleteProperty(result.disassembly, 'liquidRecovery');
      } else if (capability === 'salvage') {
        Reflect.deleteProperty(result, 'salvageLiquidRecovery');
      } else {
        for (const field of ['disassembly', 'salvage', 'salvageTimeGameMinutes', 'salvageLiquidRecovery']) {
          Reflect.deleteProperty(result, field);
        }
      }
      expect(pack([{ item: RESULT }], data).issues).toEqual([]);
      expect(pack([stock()[0]!], data).issues).not.toEqual([]);
    },
  );
  it.each(['craftedLiquids', 'liquidContents'] as const)(
    'refuses an unknown liquid in %s at content admission',
    (field) => {
      const invalid =
        field === 'craftedLiquids'
          ? { item: RESULT, craftedLiquids: [{ liquid: 'fixture_missing', volumeMicrolitres: 1 }] }
          : { item: VESSEL, liquidContents: { kind: 'filled', liquid: 'fixture_missing', volumeMicrolitres: 1 } };
      expect(pack([invalid]).issues.some(({ message }) => message.includes('liquid'))).toBe(true);
    },
  );
  it.each([0, 0.5, Number.MAX_SAFE_INTEGER + 1])('refuses invalid authored liquid volume %s', (volumeMicrolitres) => {
    expect(pack([{ item: RESULT, craftedLiquids: [{ liquid: STOCK, volumeMicrolitres }] }]).issues).not.toEqual([]);
  });
  it('refuses vessel contents that violate the instance capacity contract', () => {
    const data = liquidRecoveryData();
    const capacity = data.items.find((item) => item.id === VESSEL)!.vessel!.capacityMicrolitres;
    expect(
      pack([{ item: VESSEL, liquidContents: { kind: 'filled', liquid: STOCK, volumeMicrolitres: capacity + 1 } }])
        .issues,
    ).not.toEqual([]);
  });
});
