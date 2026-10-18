import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/core/inventory.ts';
import { wearMeleeWeaponOnHit, wearOnPlayerHit } from '../src/core/wear.ts';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';

const { registry } = buildRegistry(
  readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      source: file,
      data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown,
    })),
);

const hitRegistry = buildRegistry([
  ...readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      source: file,
      data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown,
    })),
  {
    source: 'test-headwear.json',
    data: {
      items: [
        {
          id: 'test_cap',
          name: 'Test cap',
          category: 'clothing',
          weight: 100,
          size: [1, 1],
          wearable: { slot: 'head', encumbrance: 0, wearPerDamage: 0.1 },
        },
      ],
    },
  },
]).registry;

describe('item wear', () => {
  it('subtracts a melee weapon’s content rate and clamps its condition at ruin', () => {
    const inventory = new Inventory(registry);
    const weapon = inventory.create('crowbar');
    weapon.condition = 0.2;
    expect(inventory.add(weapon, { kind: 'hand', side: 'right' })).toBe(true);
    const rate = registry.items.get(weapon.type)!.weapon!.melee.wearPerHit!;
    const hits = Math.ceil(weapon.condition / rate) + 1;
    wearMeleeWeaponOnHit(inventory, weapon.uid);
    expect(weapon.condition).toBeCloseTo(Math.max(0, 0.2 - rate));
    for (let hit = 1; hit < hits; hit += 1) {
      wearMeleeWeaponOnHit(inventory, weapon.uid);
    }
    expect(weapon.condition).toBe(0);
  });

  it.each([
    { region: 'head', item: 'test_cap', other: 'jacket' },
    { region: 'leftArm', item: 'jacket', other: 'jeans' },
    { region: 'rightLeg', item: 'jeans', other: 'jacket' },
  ] as const)('wears the $item covering a $region hit', ({ region, item, other }) => {
    const inventory = new Inventory(hitRegistry);
    const worn = inventory.create(item);
    const otherWorn = inventory.create(other);
    expect(inventory.add(worn, { kind: 'worn' })).toBe(true);
    expect(inventory.add(otherWorn, { kind: 'worn' })).toBe(true);
    const rate = hitRegistry.items.get(item)!.wearable!.wearPerDamage!;

    wearOnPlayerHit(inventory, region, 1, 1);

    expect(worn.condition).toBe(1 - rate);
    expect(otherWorn.condition).toBe(1);
  });

  it('scales the wear on a hit by the damage kind’s multiplier', () => {
    const inventory = new Inventory(hitRegistry);
    const outer = inventory.create('jacket');
    expect(inventory.add(outer, { kind: 'worn' })).toBe(true);
    const rate = hitRegistry.items.get('jacket')!.wearable!.wearPerDamage!;
    const multiplier = 2;

    wearOnPlayerHit(inventory, 'torso', 3, multiplier);

    expect(outer.condition).toBeCloseTo(1 - rate * 3 * multiplier);
  });
});
