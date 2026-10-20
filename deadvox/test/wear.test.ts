import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/core/inventory.ts';
import { simSeconds } from '../src/core/time.ts';
import { playerWearHooks, wearMeleeWeaponOnHit, wearOnPlayerHit } from '../src/core/wear.ts';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';
import { BODY_TUNING_FIXTURE, fixtureTier, Simulation } from './simulationFixture.ts';

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
        {
          id: 'test_boots',
          name: 'Test boots',
          category: 'clothing',
          weight: 100,
          size: [1, 1],
          wearable: { slot: 'feet', encumbrance: 0, wearPerDamage: 0.1, imperviousTo: ['acid'] },
        },
        {
          id: 'test_gloves',
          name: 'Test gloves',
          category: 'clothing',
          weight: 100,
          size: [1, 1],
          wearable: { slot: 'hands', encumbrance: 0, wearPerDamage: 0.1 },
        },
      ],
    },
  },
]).registry;

const tuning = BODY_TUNING_FIXTURE;

const wearing = (...types: string[]) => {
  const inventory = new Inventory(hitRegistry);
  const items = types.map((type) => {
    const item = inventory.create(type);
    if (!inventory.add(item, { kind: 'worn' })) {
      throw new Error(`fixture could not wear ${type}`);
    }
    return item;
  });
  return { inventory, items };
};

const puddle = {
  id: 'puddle',
  rate: 1,
  cause: 'fixture burn',
  region: 'leftLeg',
  kind: 'acid',
  touch: 'ground',
} as const;

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
    { region: 'leftArm', item: 'jacket', other: 'test_gloves' },
    { region: 'rightLeg', item: 'jeans', other: 'test_boots' },
  ] as const)('a blow wears the outermost $item covering a $region hit', ({ region, item, other }) => {
    const {
      inventory,
      items: [worn, otherWorn],
    } = wearing(item, other);
    const rate = hitRegistry.items.get(item)!.wearable!.wearPerDamage!;

    wearOnPlayerHit(inventory, tuning, { region, damage: 1, kind: 'blunt' });

    expect(worn!.condition).toBeCloseTo(1 - rate * tuning.outerWearMultiplier.blunt);
    expect(otherWorn!.condition).toBe(1);
  });

  it('hand contact meets the gloves before the sleeve that covers the arm', () => {
    const {
      inventory,
      items: [jacket, gloves],
    } = wearing('jacket', 'test_gloves');

    wearOnPlayerHit(inventory, tuning, { region: 'rightArm', damage: 1, kind: 'blunt', touch: 'hand' });

    expect(gloves!.condition).toBeLessThan(1);
    expect(jacket!.condition).toBe(1);
  });

  it('scales wear by received damage and the damage kind’s multiplier', () => {
    const {
      inventory,
      items: [outer],
    } = wearing('jacket');
    const rate = hitRegistry.items.get('jacket')!.wearable!.wearPerDamage!;

    wearOnPlayerHit(inventory, tuning, { region: 'torso', damage: 3, kind: 'acid' });

    expect(outer!.condition).toBeCloseTo(1 - rate * 3 * tuning.outerWearMultiplier.acid);
  });

  it('ground contact with impervious boots leaves health, wounds and the boots unchanged', () => {
    const {
      inventory,
      items: [, boots],
    } = wearing('jeans', 'test_boots');
    const sim = new Simulation({ seed: 1, ...playerWearHooks(inventory, tuning) });
    const { health } = sim.body;
    const wounds = structuredClone(sim.body.wounds);

    sim.expose(puddle);
    sim.frame(simSeconds(1));
    sim.leaveExposure(puddle.id);
    sim.frame(tuning.linger.acid!.simSeconds);

    expect(sim.body.health).toBe(health);
    expect(sim.body.wounds).toEqual(wounds);
    expect(boots!.condition).toBe(1);
    expect(sim.exposures.snapshotState().exposures).toHaveLength(0);
    expect(sim.actionRefusal).toBeUndefined();
  });

  it('ground contact without boots lands on the leg and wears the trousers', () => {
    const {
      inventory,
      items: [jeans],
    } = wearing('jeans');
    const sim = new Simulation({ seed: 1, ...playerWearHooks(inventory, tuning) });
    const { health } = sim.body;

    sim.expose(puddle);
    sim.frame(simSeconds(1));

    expect(sim.body.health).toBeLessThan(health);
    expect(jeans!.condition).toBeLessThan(1);
  });

  it('boots put on in the acid lift its refusal, while a wound still refuses', () => {
    const { inventory } = wearing('jeans');
    const sim = new Simulation({ seed: 1, ...playerWearHooks(inventory, tuning) });
    let strikes = 0;
    sim.actions.forcing = {
      validate: () => undefined,
      strike: () => {
        strikes += 1;
      },
      finish: () => undefined,
    };
    expect(sim.actions.beginForcing(1, 2, { method: 'fixture', duration: 10, strikeInterval: 1 })).toBeUndefined();
    sim.expose(puddle);
    expect(sim.actions.resume()).toBe(tuning.exposureRefusal);

    expect(inventory.add(inventory.create('test_boots'), { kind: 'worn' })).toBe(true);
    sim.expose(puddle);
    expect(sim.exposures.active).toBe(true);
    expect(sim.actions.resume()).toBeUndefined();
    const { health } = sim.body;
    sim.frame(simSeconds(1));
    expect(strikes).toBeGreaterThan(0);
    expect(sim.body.health).toBe(health);
    sim.actions.stop();
    expect(sim.actions.startWait()).toBeUndefined();
    sim.actions.stop();

    sim.body.impact(1, 'leftArm', { bleeding: fixtureTier('minor'), infectionAtRisk: false });
    expect(sim.actions.startWait()).toBe(tuning.bleeding.refusal);
  });

  it('a hand-touched glob wears the gloves for its whole tail, not the sleeve', () => {
    const {
      inventory,
      items: [jacket, gloves],
    } = wearing('jacket', 'test_gloves');
    const sim = new Simulation({ seed: 1, ...playerWearHooks(inventory, tuning) });

    sim.hit(2, 'fixture glob', 'rightArm', { kind: 'acid', touch: 'hand' });
    const afterHit = gloves!.condition;
    sim.frame(tuning.linger.acid!.simSeconds);

    expect(gloves!.condition).toBeLessThan(afterHit);
    expect(jacket!.condition).toBe(1);
  });
});
