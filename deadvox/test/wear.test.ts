import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { PlayerCombat } from '../src/core/playerCombat.ts';
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
  it('subtracts a melee weapon’s own content rate once per hit and clamps at ruin', () => {
    const inventory = new Inventory(registry);
    const weapon = inventory.create('crowbar');
    weapon.condition = 0.2;
    expect(inventory.add(weapon, { kind: 'hand', side: 'right' })).toBe(true);
    const rate = registry.items.get(weapon.type)!.weapon!.melee.wearPerHit!;
    for (let hit = 0; hit < 3; hit += 1) {
      wearMeleeWeaponOnHit(inventory, weapon.uid);
    }
    expect(weapon.condition).toBeCloseTo(Math.max(0, 0.2 - rate * 3));
  });

  it('wears the held weapon once at confirmed player-combat contact', () => {
    const inventory = new Inventory(registry);
    const weapon = inventory.create('crowbar');
    expect(inventory.add(weapon, { kind: 'hand', side: 'right' })).toBe(true);
    const definition = registry.items.get(weapon.type)!.weapon!.melee!;
    const combat = new PlayerCombat({ playPlayerMeleeSwing: () => undefined, resolvePlayerMelee: () => true }, (uid) =>
      wearMeleeWeaponOnHit(inventory, uid),
    );
    const hands = { right: weapon.uid, left: null };
    expect(
      combat.beginMeleeSwing({
        origin: [0, 0, 0],
        direction: [0, 0, -1],
        weapon: definition,
        profile: 'blunt',
        hand: 'right',
        twoHanded: false,
        hands,
      }),
    ).toBe(true);
    const rate = definition.wearPerHit!;
    combat.tick(definition.cooldown, hands);
    expect(weapon.condition).toBeCloseTo(1 - rate);
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

  it('does not choose a clothing area when a hit arrives without one', () => {
    const inventory = new Inventory(registry);
    const jacket = inventory.create('jacket');
    expect(inventory.add(jacket, { kind: 'worn' })).toBe(true);
    wearOnPlayerHit(inventory);
    expect(jacket.condition).toBe(1);
  });
});
