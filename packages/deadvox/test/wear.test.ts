import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/core/inventory.ts';
import { simSeconds } from '../src/core/time.ts';
import { playerWearHooks, wearMeleeWeaponOnHit, wearOnPlayerHit } from '../src/core/wear.ts';
import { baseRegistry } from './baseRegistry.ts';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';
import { BODY_TUNING_FIXTURE, fixtureTier, Simulation } from './simulationFixture.ts';

const registry = baseRegistry();

const armour = {
  id: 'test_vest',
  name: 'Test vest',
  category: 'clothing',
  weight: 100,
  size: [1, 1],
  wearable: { slot: 'vest', encumbrance: 0, wearPerDamage: 0.01, protects: { cut: 0.75, acid: 0.5 } },
};
const wearables = 'items-wearables.json';
const hitBuild = buildRegistry([
  { source: wearables, data: JSON.parse(readFileSync(join('src/content/base', wearables), 'utf8')) as unknown },
  {
    source: 'models-items.json',
    data: JSON.parse(readFileSync('src/content/base/models-items.json', 'utf8')) as unknown,
  },
  {
    source: 'test-headwear.json',
    data: {
      items: [
        armour,
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
]);
if (hitBuild.issues.length > 0) {
  throw new Error(JSON.stringify(hitBuild.issues));
}
const hitRegistry = hitBuild.registry;

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
  it('rejects a protection share for an impervious kind', () => {
    const result = buildRegistry([
      {
        source: 'conflict.json',
        data: {
          items: [
            {
              ...armour,
              wearable: { ...armour.wearable, imperviousTo: ['cut'] },
            },
          ],
        },
      },
    ]);
    expect(result.issues.some((issue) => issue.message.includes('must not also be impervious'))).toBe(true);
  });

  it('meets the vest before the jacket on the torso but not on the arm', () => {
    const {
      inventory,
      items: [vest, jacket],
    } = wearing('test_vest', 'jacket');
    wearOnPlayerHit(inventory, tuning, { region: 'torso', damage: 1, kind: 'blunt' });
    expect(vest!.condition).toBeLessThan(1);
    expect(jacket!.condition).toBe(1);
    const afterTorso = vest!.condition;
    wearOnPlayerHit(inventory, tuning, { region: 'leftArm', damage: 1, kind: 'blunt' });
    expect(jacket!.condition).toBeLessThan(1);
    expect(vest!.condition).toBe(afterTorso);
  });

  it.each(['cut', 'blunt'] as const)('reduces flesh damage only by the met item’s share for %s', (kind) => {
    const { inventory } = wearing('test_vest');
    const protectedSim = new Simulation({ seed: 1, ...playerWearHooks(inventory, tuning) });
    const bare = new Simulation({ seed: 1 });
    const initial = bare.body.health;
    protectedSim.hit(8, 'fixture', 'torso', { kind });
    bare.hit(8, 'fixture', 'torso', { kind });
    const share = kind === 'cut' ? armour.wearable.protects.cut : 0;
    expect(initial - bare.body.health).toBeGreaterThan(0);
    expect(initial - protectedSim.body.health).toBeCloseTo((initial - bare.body.health) * (1 - share));
  });

  it('uses reduced damage before choosing the bleeding tier', () => {
    const { inventory } = wearing('test_vest');
    const bodyTuning = {
      ...tuning,
      bleeding: {
        ...tuning.bleeding,
        tiers: [
          {
            ...tuning.bleeding.tiers[0]!,
            minDamage: 5,
            chancePerDamage: { blunt: 1, cut: 1, pierce: 1, acid: 1 },
          },
        ],
      },
    };
    const protectedSim = new Simulation({ seed: 1, bodyTuning, ...playerWearHooks(inventory, bodyTuning) });
    const bare = new Simulation({ seed: 1, bodyTuning });
    bare.hit(8, 'fixture', 'torso', { kind: 'cut' });
    protectedSim.hit(8, 'fixture', 'torso', { kind: 'cut' });
    expect(bare.body.wounds.torso).not.toBeNull();
    expect(protectedSim.body.wounds.torso).toBeNull();
  });

  it('a ruined vest lets the whole hit through but still hides the jacket', () => {
    const {
      inventory,
      items: [vest, jacket],
    } = wearing('test_vest', 'jacket');
    inventory.changeCondition(vest!.uid, -1);
    const sim = new Simulation({ seed: 1, ...playerWearHooks(inventory, tuning) });
    const initial = sim.body.health;
    sim.hit(8, 'fixture', 'torso', { kind: 'cut' });
    expect(initial - sim.body.health).toBeCloseTo(8);
    expect(inventory.worn.vest).toBe(vest);
    expect(jacket!.condition).toBe(1);
  });

  it('wears protective armour by the full unreduced blow, even the blow that ruins it', () => {
    const {
      inventory,
      items: [vest],
    } = wearing('test_vest');
    const sim = new Simulation({ seed: 1, ...playerWearHooks(inventory, tuning) });
    sim.hit(8, 'fixture', 'torso', { kind: 'cut' });
    expect(vest!.condition).toBeCloseTo(1 - 8 * armour.wearable.wearPerDamage * tuning.outerWearMultiplier.cut);
    inventory.changeCondition(vest!.uid, -vest!.condition + 0.01);
    const initial = sim.body.health;
    sim.hit(8, 'fixture', 'torso', { kind: 'cut' });
    expect(vest!.condition).toBe(0);
    expect(initial - sim.body.health).toBeCloseTo(8 * (1 - armour.wearable.protects.cut));
  });

  it('protects against lingering acid after leaving contact', () => {
    const { inventory } = wearing('test_vest');
    const protectedSim = new Simulation({ seed: 1, ...playerWearHooks(inventory, tuning) });
    const bare = new Simulation({ seed: 1 });
    for (const sim of [protectedSim, bare]) {
      sim.expose({ ...puddle, region: 'torso' });
      sim.frame(simSeconds(1));
      sim.leaveExposure(puddle.id);
    }
    const readers = [protectedSim.events.reader(), bare.events.reader()];
    protectedSim.frame(tuning.linger.acid!.simSeconds);
    bare.frame(tuning.linger.acid!.simSeconds);
    const [protectedDamage, bareDamage] = readers.map((reader) =>
      reader.read().reduce((sum, event) => sum + (event.kind === 'damage' ? event.amount : 0), 0),
    );
    expect(bareDamage).toBeGreaterThan(0);
    expect(protectedDamage).toBeCloseTo(bareDamage! * (1 - armour.wearable.protects.acid));
  });

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
    expect(
      sim.actions.beginForcing(1, 2, { method: 'fixture', durationSimSeconds: 10, strikeIntervalSimSeconds: 1 }),
    ).toBeUndefined();
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
