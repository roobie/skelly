import { expect, it } from 'vitest';
import inventoryContent from '../../mods/skelly.inventory/inventory.json' with { type: 'json' };
import { handlingWeights } from '../../engine/src/core/inventory.ts';
import { buildRegistry } from '../../engine/src/content.ts';
import { claimed, Inventory } from '../../engine/src/inventory.ts';
import { Character } from '../../engine/src/sim.ts';

it('handles inventory at its authored baseline without an inventory skill', () => {
  const { registry, issues } = buildRegistry([
    {
      source: 'fixture',
      data: {
        ...inventoryContent,
        items: [
          {
            id: 'fixture_item',
            name: 'Fixture item',
            category: 'misc',
            size: [1, 1],
            weight: 1,
            workInProgress: false,
          },
        ],
      },
    },
  ]);
  expect(issues).toEqual([]);
  expect(registry.skills.size).toBe(0);
  const character = new Character(registry);
  const inventory = new Inventory(registry, undefined, undefined, character);
  const item = inventory.create('fixture_item');
  expect(inventory.add(item, { kind: 'hand', side: 'right' })).toBe(true);
  const baseline = claimed(registry.inventory, 'player')!.handling;
  expect(handlingWeights(registry)).toEqual(baseline);
  expect(inventory.handlingTime(item, { kind: 'hand', side: 'right' }, { kind: 'pile', pos: [0, 0, 0] })).toBe(
    baseline.groundSimSeconds + baseline.perCellSimSeconds,
  );
  expect(inventory.scaleHandlingTime(baseline.wearSimSeconds)).toBe(baseline.wearSimSeconds);
  expect(character.snapshotState()).toMatchObject({ skills: {}, practice: {} });
});
