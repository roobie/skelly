import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { wearMeleeWeaponOnHit, wearOnPlayerHit } from '../src/core/wear.ts';

const { registry } = buildRegistry(
  readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      source: file,
      data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown,
    })),
);

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

  it('wears only the clothing over the supplied torso area', () => {
    const inventory = new Inventory(registry);
    const jacket = inventory.create('jacket');
    const jeans = inventory.create('jeans');
    expect(inventory.add(jacket, { kind: 'worn' })).toBe(true);
    expect(inventory.add(jeans, { kind: 'worn' })).toBe(true);
    const torsoRate = registry.items.get(jacket.type)!.wearable!.wearPerHit!;
    wearOnPlayerHit(inventory, 'torso');
    expect(jacket.condition).toBe(1 - torsoRate);
    expect(jeans.condition).toBe(1);
  });

});
